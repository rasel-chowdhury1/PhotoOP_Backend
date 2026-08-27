import mongoose from "mongoose";
import httpStatus from "http-status";
import AppError from "../../error/AppError";
import QueryBuilder from "../../builder/QueryBuilder";
import PayoutMethod, { PayoutMethodStatus, PayoutMethodType } from "./payoutMethod.model";
import Withdraw, { WithdrawStatus } from "../withdrawRequest/withdrawRequest.model";
import {
  ICreatePayoutMethodPayload,
  ISafePayoutMethod,
  IUpdatePayoutMethodPayload,
  TPayoutAccountDetails,
} from "./payoutMethod.interface";

// derives the safe-to-display last4 from whichever field the account type actually has —
// never touches/returns the rest of accountDetails
const deriveLast4 = (type: PayoutMethodType, accountDetails: TPayoutAccountDetails): string | null => {
  if (type === PayoutMethodType.BANK_ACCOUNT && "accountNumber" in accountDetails) {
    return accountDetails.accountNumber.slice(-4);
  }
  if (type === PayoutMethodType.PAYPAL && "paypalEmail" in accountDetails) {
    return accountDetails.paypalEmail.slice(-4);
  }
  if (type === PayoutMethodType.STRIPE && "stripeAccountId" in accountDetails) {
    return accountDetails.stripeAccountId.slice(-4);
  }
  return null;
};

// the only shape ever returned to a client — accountDetails (Mixed, select:false on the
// schema) never reaches this mapping in the first place
const toSafePayoutMethod = (doc: InstanceType<typeof PayoutMethod>): ISafePayoutMethod => ({
  _id: doc._id,
  snapperId: doc.snapperId,
  type: doc.type,
  provider: doc.provider,
  last4: doc.last4,
  accountName: doc.accountName,
  isDefault: doc.isDefault,
  isVerified: doc.isVerified,
  status: doc.status,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const createPayoutMethod = async (
  snapperId: string,
  payload: ICreatePayoutMethodPayload
): Promise<ISafePayoutMethod> => {
  // the snapper's first payout method becomes their default automatically
  const existingCount = await PayoutMethod.countDocuments({ snapperId });

  const created = await PayoutMethod.create({
    snapperId,
    type: payload.type,
    provider: payload.provider || null,
    accountDetails: payload.accountDetails,
    accountName: payload.accountName || null,
    last4: deriveLast4(payload.type, payload.accountDetails),
    isDefault: existingCount === 0,
    status: PayoutMethodStatus.PENDING_VERIFICATION,
  });

  return toSafePayoutMethod(created);
};

const getMyPayoutMethods = async (snapperId: string): Promise<ISafePayoutMethod[]> => {
  const methods = await PayoutMethod.find({ snapperId }).sort({ isDefault: -1, createdAt: -1 });
  return methods.map(toSafePayoutMethod);
};

// admin listing across all snappers — supports the standard QueryBuilder query params
// (?searchTerm=&type=&status=&snapperId=&sort=&page=&limit=&fields=). accountDetails is
// select:false on the schema so it's never fetched here in the first place, and
// toSafePayoutMethod strips the doc down further before it ever reaches the response.
const getAllPayoutMethods = async (query: Record<string, unknown>) => {
  const payoutMethodQuery = new QueryBuilder(
    PayoutMethod.find().populate("snapperId", "fullName email profileImage"),
    query
  )
    .search(["provider", "accountName", "last4"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await payoutMethodQuery.modelQuery;
  const meta = await payoutMethodQuery.countTotal();

  return { meta, result: result.map(toSafePayoutMethod) };
};

// throws 404 for a nonexistent id AND for one owned by someone else — an owner check
// that leaks "it exists, just not yours" is its own minor information disclosure
const findOwnedPayoutMethod = async (id: string, snapperId: string) => {
  const method = await PayoutMethod.findOne({ _id: id, snapperId });
  if (!method) {
    throw new AppError(httpStatus.NOT_FOUND, "Payout method not found");
  }
  return method;
};

const updatePayoutMethod = async (
  id: string,
  snapperId: string,
  payload: IUpdatePayoutMethodPayload
): Promise<ISafePayoutMethod> => {
  const method = await findOwnedPayoutMethod(id, snapperId);

  if (payload.provider !== undefined) {
    method.provider = payload.provider;
  }
  if (payload.accountName !== undefined) {
    method.accountName = payload.accountName;
  }
  if (payload.accountDetails) {
    method.accountDetails = payload.accountDetails;
    // Mongoose's plain-schema type inference treats `last4` as non-nullable `string`
    // despite `default: null` in the schema — deriveLast4 legitimately can return null
    method.last4 = deriveLast4(method.type as PayoutMethodType, payload.accountDetails) as any;
    // account details changed — re-verification is required before it can be used again
    method.isVerified = false;
    method.status = PayoutMethodStatus.PENDING_VERIFICATION;
  }

  await method.save();
  return toSafePayoutMethod(method);
};

const deletePayoutMethod = async (id: string, snapperId: string): Promise<void> => {
  const method = await findOwnedPayoutMethod(id, snapperId);

  const hasActiveWithdrawal = await Withdraw.exists({
    paymentMethodId: method._id,
    status: { $in: [WithdrawStatus.PENDING, WithdrawStatus.PROCESSING] },
  });
  if (hasActiveWithdrawal) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This payout method has a withdrawal in progress and cannot be deleted"
    );
  }

  await method.deleteOne();

  if (method.isDefault) {
    // promote the next-most-recent remaining method to default, if any
    const nextDefault = await PayoutMethod.findOne({ snapperId }).sort({ createdAt: -1 });
    if (nextDefault) {
      nextDefault.isDefault = true;
      await nextDefault.save();
    }
  }
};

const setDefaultPayoutMethod = async (id: string, snapperId: string): Promise<ISafePayoutMethod> => {
  const method = await findOwnedPayoutMethod(id, snapperId);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await PayoutMethod.updateMany(
        { snapperId, _id: { $ne: method._id } },
        { $set: { isDefault: false } },
        { session }
      );
      method.isDefault = true;
      await method.save({ session });
    });
  } finally {
    await session.endSession();
  }

  return toSafePayoutMethod(method);
};

// admin-only: no KYC/identity-verification integration exists in this project, so this
// is the minimal manual gate the spec's "confirm payout method is active/verified"
// withdrawal-creation check depends on — without it, isVerified could never become true
// and no withdrawal could ever be created
const verifyPayoutMethod = async (id: string): Promise<ISafePayoutMethod> => {
  const method = await PayoutMethod.findById(id);
  if (!method) {
    throw new AppError(httpStatus.NOT_FOUND, "Payout method not found");
  }

  method.isVerified = true;
  method.status = PayoutMethodStatus.ACTIVE;
  await method.save();

  return toSafePayoutMethod(method);
};

// used by withdrawRequest.service.ts when creating a withdrawal — throws unless the
// method exists, belongs to this snapper, and is actually usable
const getOwnedActivePayoutMethod = async (id: string, snapperId: string) => {
  const method = await findOwnedPayoutMethod(id, snapperId);
  if (method.status !== PayoutMethodStatus.ACTIVE || !method.isVerified) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This payout method is not active/verified yet — it cannot receive withdrawals"
    );
  }
  return method;
};

export const payoutMethodService = {
  createPayoutMethod,
  getMyPayoutMethods,
  getAllPayoutMethods,
  updatePayoutMethod,
  deletePayoutMethod,
  setDefaultPayoutMethod,
  verifyPayoutMethod,
  getOwnedActivePayoutMethod,
};
