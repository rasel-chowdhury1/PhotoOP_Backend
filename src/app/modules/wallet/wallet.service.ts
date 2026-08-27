import { ClientSession, Types } from "mongoose";
import httpStatus from "http-status";
import AppError from "../../error/AppError";
import QueryBuilder from "../../builder/QueryBuilder";
import SnapperWallet from "./wallet.model";
import WalletTransaction from "./walletTransaction.model";
import {
  WalletBalanceType,
  WalletTransactionReferenceType,
  WalletTransactionType,
} from "./walletTransaction.interface";
import { IWalletSummary } from "./wallet.interface";
import Booking from "../booking/booking.model";
import { BookingStatus, PaymentStatus } from "../booking/booking.interface";

// avoids float artifacts like 0.1 + 0.2 = 0.30000000000000004 without changing the
// codebase's existing plain-dollar-Number storage convention (see wallet.model.ts)
const round2 = (n: number) => Math.round(n * 100) / 100;

// finds this snapper's wallet, creating it on first use. Races two concurrent
// first-time callers safely: the unique index on snapperId is the real guard, the
// try/catch here just turns "lost the create race" into a normal read instead of a 500.
const getOrCreateWallet = async (snapperId: string, session?: ClientSession) => {
  const existing = await SnapperWallet.findOne({ snapperId }).session(session ?? null);
  if (existing) {
    return existing;
  }

  try {
    const [created] = await SnapperWallet.create(
      [{ snapperId }],
      session ? { session } : undefined
    );
    return created;
  } catch (error: any) {
    if (error?.code === 11000) {
      const wallet = await SnapperWallet.findOne({ snapperId }).session(session ?? null);
      if (wallet) {
        return wallet;
      }
    }
    throw error;
  }
};

const getWalletSummary = async (snapperId: string): Promise<IWalletSummary> => {
  const wallet = await getOrCreateWallet(snapperId);
  return {
    currency: wallet.currency,
    availableBalance: wallet.availableBalance,
    pendingBalance: wallet.pendingBalance,
    totalEarned: wallet.totalEarned,
    totalWithdrawn: wallet.totalWithdrawn,
    totalRefunded: wallet.totalRefunded,
  };
};

const getMyTransactions = async (snapperId: string, query: Record<string, unknown>) => {
  const txQuery = new QueryBuilder(WalletTransaction.find({ snapperId }), query)
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await txQuery.modelQuery;
  const meta = await txQuery.countTotal();
  return { meta, result };
};

// credits a completed+paid booking's earning into pendingBalance. Safe to call from
// multiple independent trigger points (booking delivery completion AND the Stripe
// payment webhook — whichever fires last is the one that actually credits) because:
//   1. it no-ops unless BOTH status===COMPLETED and paymentStatus===PAID are true
//   2. Booking.earningsCreditedAt is checked first (fast path, avoids the DB round trip
//      on the common case where it's already been credited)
//   3. the WalletTransaction unique index (referenceType, referenceId, type=BOOKING_EARNING)
//      is the real, race-proof guarantee — the ledger insert happens BEFORE the wallet
//      $inc, so a losing concurrent caller hits a duplicate-key error and returns having
//      changed nothing, rather than double-crediting and only failing partway through
const creditBookingEarning = async (
  bookingId: Types.ObjectId | string,
  session: ClientSession
) => {
  const booking = await Booking.findById(bookingId).session(session);
  if (!booking) {
    return;
  }
  if (
    booking.status !== BookingStatus.COMPLETED ||
    booking.paymentStatus !== PaymentStatus.PAID ||
    booking.earningsCreditedAt
  ) {
    return;
  }

  const earningAmount = round2(booking.totalPrice - booking.serviceFee);
  if (earningAmount <= 0) {
    return;
  }

  const wallet = await getOrCreateWallet(String(booking.snapperId), session);

  try {
    await WalletTransaction.create(
      [
        {
          snapperId: booking.snapperId,
          walletId: wallet._id,
          type: WalletTransactionType.BOOKING_EARNING,
          amount: earningAmount,
          balanceType: WalletBalanceType.PENDING,
          balanceBefore: wallet.pendingBalance,
          balanceAfter: round2(wallet.pendingBalance + earningAmount),
          referenceType: WalletTransactionReferenceType.BOOKING,
          referenceId: booking._id,
          description: `Earning for booking ${booking.bookingId}`,
        },
      ],
      { session }
    );
  } catch (error: any) {
    if (error?.code === 11000) {
      // a concurrent trigger (the other of delivery-completion / payment-webhook)
      // already won this exact credit — nothing was written, nothing to undo
      return;
    }
    throw error;
  }

  await SnapperWallet.updateOne(
    { _id: wallet._id },
    { $inc: { pendingBalance: earningAmount, totalEarned: earningAmount } },
    { session }
  );

  booking.earningsCreditedAt = new Date();
  await booking.save({ session });
};

// moves one booking's already-credited earning from pendingBalance to availableBalance
// once its settlement hold has elapsed (see wallet.cron.ts). The atomic
// findOneAndUpdate claim (earningsReleasedAt: null -> now) IS the idempotency guard
// here — only one caller can ever win it for a given booking, so the wallet $inc and
// ledger rows below only ever run once per booking.
const releaseBookingEarning = async (
  bookingId: Types.ObjectId | string,
  session: ClientSession
) => {
  const claimed = await Booking.findOneAndUpdate(
    { _id: bookingId, earningsCreditedAt: { $ne: null }, earningsReleasedAt: null },
    { $set: { earningsReleasedAt: new Date() } },
    { new: true, session }
  );
  if (!claimed) {
    return;
  }

  const earningAmount = round2(claimed.totalPrice - claimed.serviceFee);
  if (earningAmount <= 0) {
    return;
  }

  const wallet = await getOrCreateWallet(String(claimed.snapperId), session);

  const updatedWallet = await SnapperWallet.findOneAndUpdate(
    { _id: wallet._id },
    { $inc: { pendingBalance: -earningAmount, availableBalance: earningAmount } },
    { new: true, session }
  );

  await WalletTransaction.create(
    [
      {
        snapperId: claimed.snapperId,
        walletId: wallet._id,
        type: WalletTransactionType.ADJUSTMENT,
        amount: -earningAmount,
        balanceType: WalletBalanceType.PENDING,
        balanceBefore: wallet.pendingBalance,
        balanceAfter: updatedWallet!.pendingBalance,
        referenceType: WalletTransactionReferenceType.BOOKING,
        referenceId: claimed._id,
        description: `Earning released to available balance for booking ${claimed.bookingId}`,
      },
      {
        snapperId: claimed.snapperId,
        walletId: wallet._id,
        type: WalletTransactionType.ADJUSTMENT,
        amount: earningAmount,
        balanceType: WalletBalanceType.AVAILABLE,
        balanceBefore: wallet.availableBalance,
        balanceAfter: updatedWallet!.availableBalance,
        referenceType: WalletTransactionReferenceType.BOOKING,
        referenceId: claimed._id,
        description: `Earning released from pending for booking ${claimed.bookingId}`,
      },
    ],
    { session }
  );
};

// atomically reserves `amount` out of availableBalance for a new withdrawal request —
// the condition (availableBalance >= amount) and the decrement happen as ONE Mongo
// operation, so two concurrent requests racing for the same balance can never both
// succeed (the second one's findOneAndUpdate simply matches nothing and returns null)
const reserveForWithdrawal = async (
  snapperId: string,
  amount: number,
  session: ClientSession
) => {
  const updatedWallet = await SnapperWallet.findOneAndUpdate(
    { snapperId, availableBalance: { $gte: amount } },
    { $inc: { availableBalance: -amount } },
    { new: true, session }
  );
  if (!updatedWallet) {
    throw new AppError(httpStatus.BAD_REQUEST, "Insufficient available balance");
  }

  return {
    wallet: updatedWallet,
    balanceBefore: round2(updatedWallet.availableBalance + amount),
    balanceAfter: updatedWallet.availableBalance,
  };
};

// restores a previously-reserved amount back to availableBalance — used when a
// withdrawal is cancelled, rejected, or fails during processing
const releaseWithdrawalReservation = async (
  snapperId: string,
  amount: number,
  session: ClientSession
) => {
  const updatedWallet = await SnapperWallet.findOneAndUpdate(
    { snapperId },
    { $inc: { availableBalance: amount } },
    { new: true, session }
  );
  return {
    wallet: updatedWallet!,
    balanceBefore: round2(updatedWallet!.availableBalance - amount),
    balanceAfter: updatedWallet!.availableBalance,
  };
};

const markWithdrawalCompleted = async (
  snapperId: string,
  netAmount: number,
  session: ClientSession
) => {
  await SnapperWallet.updateOne(
    { snapperId },
    { $inc: { totalWithdrawn: netAmount } },
    { session }
  );
};

const recordWithdrawalLedger = async (params: {
  snapperId: Types.ObjectId | string;
  walletId: Types.ObjectId;
  amount: number; // signed
  balanceBefore: number;
  balanceAfter: number;
  withdrawalId: Types.ObjectId;
  description: string;
  session: ClientSession;
}) => {
  await WalletTransaction.create(
    [
      {
        snapperId: params.snapperId,
        walletId: params.walletId,
        type: WalletTransactionType.WITHDRAWAL,
        amount: params.amount,
        balanceType: WalletBalanceType.AVAILABLE,
        balanceBefore: params.balanceBefore,
        balanceAfter: params.balanceAfter,
        referenceType: WalletTransactionReferenceType.WITHDRAWAL,
        referenceId: params.withdrawalId,
        description: params.description,
      },
    ],
    { session: params.session }
  );
};

export const walletService = {
  round2,
  getOrCreateWallet,
  getWalletSummary,
  getMyTransactions,
  creditBookingEarning,
  releaseBookingEarning,
  reserveForWithdrawal,
  releaseWithdrawalReservation,
  markWithdrawalCompleted,
  recordWithdrawalLedger,
};
