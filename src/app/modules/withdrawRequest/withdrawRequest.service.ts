import mongoose, { Types } from "mongoose";
import httpStatus from "http-status";
import AppError from "../../error/AppError";
import QueryBuilder from "../../builder/QueryBuilder";
import config from "../../config";
import Withdraw, { WithdrawStatus } from "./withdrawRequest.model";
import { ICreateWithdrawPayload, IProcessWithdrawPayload } from "./withdrawRequest.interface";
import { walletService } from "../wallet/wallet.service";
import { payoutMethodService } from "../payoutMethod/payoutMethod.service";
import { User } from "../user/user.model";
import { NotificationType } from "../notifications/notifications.interface";
import { emitNotification } from "../../../socketIo";
import { getAdminId } from "../../DB/adminStrore";

const round2 = walletService.round2;

const generateWithdrawNumber = () =>
  `WD-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

// no fee schedule exists anywhere in this project — config.withdrawal.feePercentage
// defaults to 0, so this is a no-op fee until product specifies a real rate
const calculateFee = (amount: number) => round2(amount * config.withdrawal.feePercentage);

// PENDING is the only status a snapper can still act on (cancel). PROCESSING is an
// admin-only interim marker ("I'm working on this one"); PENDING can also jump straight
// to COMPLETED/FAILED for a payout processed in one step. Every other state is terminal.
const ALLOWED_WITHDRAW_TRANSITIONS: Record<WithdrawStatus, WithdrawStatus[]> = {
  [WithdrawStatus.PENDING]: [
    WithdrawStatus.PROCESSING,
    WithdrawStatus.COMPLETED,
    WithdrawStatus.FAILED,
    WithdrawStatus.REJECTED,
    WithdrawStatus.CANCELLED,
  ],
  [WithdrawStatus.PROCESSING]: [WithdrawStatus.COMPLETED, WithdrawStatus.FAILED],
  [WithdrawStatus.COMPLETED]: [],
  [WithdrawStatus.FAILED]: [],
  [WithdrawStatus.REJECTED]: [],
  [WithdrawStatus.CANCELLED]: [],
};

const assertWithdrawTransition = (current: WithdrawStatus, next: WithdrawStatus) => {
  if (current === next) {
    return; // e.g. PENDING -> PROCESSING -> PROCESSING again is a harmless re-ack, not an error
  }
  const allowed = ALLOWED_WITHDRAW_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot transition withdraw request from ${current} to ${next}`
    );
  }
};

// best-effort — a failed notification should never fail the withdraw action itself
const notifyWithdrawEvent = (params: {
  actorId: string;
  receiverId: string;
  text: string;
  type: NotificationType;
  fullName?: string;
}) => {
  emitNotification({
    userId: params.actorId,
    receiverId: params.receiverId,
    userMsg: {
      fullName: params.fullName,
      image: "",
      text: params.text,
      photos: [],
    },
    type: params.type,
  }).catch((error) => {
    console.error("Failed to send withdraw notification:", error);
  });
};

// section 8/9 of the spec: reserve happens atomically inside the same transaction as
// the Withdraw doc + ledger row, so a failure anywhere rolls the whole thing back and a
// concurrent second request can never also succeed against the same balance
const createWithdrawRequest = async (snapperUserId: string, payload: ICreateWithdrawPayload) => {
  if (payload.amount < config.withdrawal.minAmount) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Minimum withdrawal amount is $${config.withdrawal.minAmount}`
    );
  }

  // ownership + active/verified check happens before touching the wallet at all
  const payoutMethod = await payoutMethodService.getOwnedActivePayoutMethod(
    payload.paymentMethodId,
    snapperUserId
  );

  const fee = calculateFee(payload.amount);
  const netAmount = round2(payload.amount - fee);

  const session = await mongoose.startSession();
  let withdraw: InstanceType<typeof Withdraw>;

  try {
    await session.withTransaction(async () => {
      const { wallet, balanceBefore, balanceAfter } = await walletService.reserveForWithdrawal(
        snapperUserId,
        payload.amount,
        session
      );

      const [created] = await Withdraw.create(
        [
          {
            withdrawNumber: generateWithdrawNumber(),
            snapperId: snapperUserId,
            amount: payload.amount,
            fee,
            netAmount,
            currency: wallet.currency,
            paymentMethodId: payoutMethod._id,
            notes: payload.notes,
            status: WithdrawStatus.PENDING,
            requestedAt: new Date(),
          },
        ],
        { session }
      );
      withdraw = created;

      await walletService.recordWithdrawalLedger({
        snapperId: snapperUserId,
        walletId: wallet._id,
        amount: -payload.amount,
        balanceBefore,
        balanceAfter,
        withdrawalId: created._id,
        description: `Withdrawal request ${created.withdrawNumber}`,
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  const adminId = getAdminId();
  if (adminId) {
    const snapper = await User.findById(snapperUserId).select("fullName");
    notifyWithdrawEvent({
      actorId: snapperUserId,
      receiverId: String(adminId),
      fullName: snapper?.fullName,
      text: `${snapper?.fullName || "A snapper"} requested a withdrawal of $${payload.amount.toFixed(2)} (${withdraw!.withdrawNumber}).`,
      type: NotificationType.WITHDRAW_REQUESTED,
    });
  }

  return withdraw!;
};

const getMyWithdrawRequests = async (snapperUserId: string, query: Record<string, unknown>) => {
  const withdrawQuery = new QueryBuilder(
    Withdraw.find({ snapperId: snapperUserId }).populate(
      "paymentMethodId",
      "type provider last4 accountName"
    ),
    query
  )
    .search(["withdrawNumber"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await withdrawQuery.modelQuery;
  const meta = await withdrawQuery.countTotal();
  return { meta, result };
};

// admin listing — supports status/snapperId (exact match, via QueryBuilder.filter) and
// startDate/endDate (requestedAt range, which QueryBuilder can't express on its own)
const getAllWithdrawRequests = async (query: Record<string, unknown>) => {
  const { startDate, endDate, ...restQuery } = query;

  const rangeMatch: Record<string, unknown> = {};
  if (startDate) {
    rangeMatch.$gte = new Date(startDate as string);
  }
  if (endDate) {
    rangeMatch.$lte = new Date(endDate as string);
  }

  const baseFilter = Object.keys(rangeMatch).length > 0 ? { requestedAt: rangeMatch } : {};

  const withdrawQuery = new QueryBuilder(
    Withdraw.find(baseFilter)
      .populate("snapperId", "fullName email profileImage")
      .populate("processedBy", "fullName email")
      .populate("paymentMethodId"),
    restQuery
  )
    .search(["withdrawNumber"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await withdrawQuery.modelQuery;
  const meta = await withdrawQuery.countTotal();

  return { meta, result };
};

const getWithdrawRequestById = async (id: string, requesterId: string, isAdmin: boolean) => {
  const withdraw = await Withdraw.findById(id)
    .populate("snapperId", "fullName email profileImage")
    .populate("processedBy", "fullName email")
    .populate("paymentMethodId", "type provider last4 accountName");
  if (!withdraw) {
    throw new AppError(httpStatus.NOT_FOUND, "Withdraw request not found");
  }

  const snapperId = (withdraw.snapperId as any)?._id ?? withdraw.snapperId;
  const isOwner = String(snapperId) === String(requesterId);
  if (!isAdmin && !isOwner) {
    throw new AppError(httpStatus.FORBIDDEN, "You do not have access to this withdraw request");
  }

  return withdraw;
};

const cancelWithdrawRequest = async (id: string, snapperUserId: string) => {
  const session = await mongoose.startSession();
  let withdraw: InstanceType<typeof Withdraw>;

  try {
    await session.withTransaction(async () => {
      const found = await Withdraw.findById(id).session(session);
      if (!found) {
        throw new AppError(httpStatus.NOT_FOUND, "Withdraw request not found");
      }
      if (String(found.snapperId) !== String(snapperUserId)) {
        throw new AppError(httpStatus.FORBIDDEN, "You can only cancel your own withdraw request");
      }
      assertWithdrawTransition(found.status as WithdrawStatus, WithdrawStatus.CANCELLED);

      const { wallet, balanceBefore, balanceAfter } = await walletService.releaseWithdrawalReservation(
        snapperUserId,
        found.amount,
        session
      );

      await walletService.recordWithdrawalLedger({
        snapperId: snapperUserId,
        walletId: wallet._id,
        amount: found.amount,
        balanceBefore,
        balanceAfter,
        withdrawalId: found._id,
        description: `Withdrawal ${found.withdrawNumber} cancelled by snapper — balance restored`,
        session,
      });

      found.status = WithdrawStatus.CANCELLED;
      await found.save({ session });
      withdraw = found;
    });
  } finally {
    await session.endSession();
  }

  return withdraw!;
};

// the single admin action driving PENDING/PROCESSING through to a terminal outcome —
// see withdrawRequest.validation.ts for why COMPLETED requires transactionId and FAILED
// requires failureReason
const processWithdrawRequest = async (
  id: string,
  adminId: string,
  payload: IProcessWithdrawPayload
) => {
  const nextStatus = WithdrawStatus[payload.status];
  const session = await mongoose.startSession();
  let withdraw: InstanceType<typeof Withdraw>;

  try {
    await session.withTransaction(async () => {
      const found = await Withdraw.findById(id).session(session);
      if (!found) {
        throw new AppError(httpStatus.NOT_FOUND, "Withdraw request not found");
      }
      assertWithdrawTransition(found.status as WithdrawStatus, nextStatus);

      if (nextStatus === WithdrawStatus.COMPLETED) {
        found.transactionId = payload.transactionId!;
        await walletService.markWithdrawalCompleted(
          String(found.snapperId),
          found.netAmount,
          session
        );
      }

      if (nextStatus === WithdrawStatus.FAILED) {
        found.failureReason = payload.failureReason!;
        const { wallet, balanceBefore, balanceAfter } = await walletService.releaseWithdrawalReservation(
          String(found.snapperId),
          found.amount,
          session
        );
        await walletService.recordWithdrawalLedger({
          snapperId: found.snapperId,
          walletId: wallet._id,
          amount: found.amount,
          balanceBefore,
          balanceAfter,
          withdrawalId: found._id,
          description: `Withdrawal ${found.withdrawNumber} failed — balance restored`,
          session,
        });
      }

      found.status = nextStatus;
      found.processedBy = new Types.ObjectId(adminId);
      found.processedAt = new Date();
      await found.save({ session });
      withdraw = found;
    });
  } finally {
    await session.endSession();
  }

  const notificationByStatus: Partial<Record<WithdrawStatus, { type: NotificationType; text: string }>> = {
    [WithdrawStatus.PROCESSING]: {
      type: NotificationType.WITHDRAW_PROCESSING,
      text: `Your withdrawal request ${withdraw!.withdrawNumber} is now being processed.`,
    },
    [WithdrawStatus.COMPLETED]: {
      type: NotificationType.WITHDRAW_COMPLETED,
      text: `Your withdrawal of $${withdraw!.netAmount.toFixed(2)} (${withdraw!.withdrawNumber}) has been paid out.`,
    },
    [WithdrawStatus.FAILED]: {
      type: NotificationType.WITHDRAW_FAILED,
      text: `Your withdrawal request ${withdraw!.withdrawNumber} failed: ${payload.failureReason}. Your balance has been restored.`,
    },
  };

  const notification = notificationByStatus[nextStatus];
  if (notification) {
    notifyWithdrawEvent({
      actorId: adminId,
      receiverId: String(withdraw!.snapperId),
      text: notification.text,
      type: notification.type,
    });
  }

  return withdraw!;
};

const rejectWithdrawRequest = async (id: string, adminId: string, adminNote: string) => {
  const session = await mongoose.startSession();
  let withdraw: InstanceType<typeof Withdraw>;

  try {
    await session.withTransaction(async () => {
      const found = await Withdraw.findById(id).session(session);
      if (!found) {
        throw new AppError(httpStatus.NOT_FOUND, "Withdraw request not found");
      }
      assertWithdrawTransition(found.status as WithdrawStatus, WithdrawStatus.REJECTED);

      const { wallet, balanceBefore, balanceAfter } = await walletService.releaseWithdrawalReservation(
        String(found.snapperId),
        found.amount,
        session
      );
      await walletService.recordWithdrawalLedger({
        snapperId: found.snapperId,
        walletId: wallet._id,
        amount: found.amount,
        balanceBefore,
        balanceAfter,
        withdrawalId: found._id,
        description: `Withdrawal ${found.withdrawNumber} rejected — balance restored`,
        session,
      });

      found.status = WithdrawStatus.REJECTED;
      found.adminNote = adminNote;
      found.processedBy = new Types.ObjectId(adminId);
      found.processedAt = new Date();
      await found.save({ session });
      withdraw = found;
    });
  } finally {
    await session.endSession();
  }

  notifyWithdrawEvent({
    actorId: adminId,
    receiverId: String(withdraw!.snapperId),
    text: `Your withdrawal request ${withdraw!.withdrawNumber} for $${withdraw!.amount.toFixed(2)} was rejected: ${adminNote}`,
    type: NotificationType.WITHDRAW_REJECTED,
  });

  return withdraw!;
};

export const withdrawRequestService = {
  createWithdrawRequest,
  getMyWithdrawRequests,
  getAllWithdrawRequests,
  getWithdrawRequestById,
  cancelWithdrawRequest,
  processWithdrawRequest,
  rejectWithdrawRequest,
};
