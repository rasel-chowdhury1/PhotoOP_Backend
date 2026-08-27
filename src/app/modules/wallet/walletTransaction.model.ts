import { Schema, model } from "mongoose";
import {
  WalletBalanceType,
  WalletTransactionReferenceType,
  WalletTransactionType,
} from "./walletTransaction.interface";

// append-only audit ledger — nothing in this codebase ever updates or deletes a
// WalletTransaction after creation. Every SnapperWallet balance mutation must have a
// matching row here, written in the same DB transaction as the wallet update (see
// wallet.service.ts) — that pairing is what "wallet balance == ledger state" means.
const WalletTransactionSchema = new Schema(
  {
    snapperId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    walletId: {
      type: Schema.Types.ObjectId,
      ref: "SnapperWallet",
      required: true,
    },

    type: {
      type: String,
      enum: Object.values(WalletTransactionType),
      required: true,
    },

    // signed: positive credits the affected balance, negative debits it
    amount: {
      type: Number,
      required: true,
    },

    // which of the wallet's two balance fields this row moved
    balanceType: {
      type: String,
      enum: Object.values(WalletBalanceType),
      required: true,
    },

    balanceBefore: {
      type: Number,
      required: true,
    },

    balanceAfter: {
      type: Number,
      required: true,
    },

    referenceType: {
      type: String,
      enum: Object.values(WalletTransactionReferenceType),
      required: true,
    },

    referenceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// the DB-level idempotency guarantee for booking earnings: a given booking can only
// ever produce one BOOKING_EARNING row, no matter how many concurrent code paths try to
// credit it (see wallet.service.ts's creditBookingEarning). Scoped to BOOKING_EARNING
// only — other types legitimately have multiple rows against the same referenceId (e.g.
// two ADJUSTMENT rows per released booking, one per balance moved).
WalletTransactionSchema.index(
  { referenceType: 1, referenceId: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: WalletTransactionType.BOOKING_EARNING } }
);

WalletTransactionSchema.index({ snapperId: 1, createdAt: -1 });
WalletTransactionSchema.index({ walletId: 1, createdAt: -1 });
WalletTransactionSchema.index({ referenceType: 1, referenceId: 1 });

export default model("WalletTransaction", WalletTransactionSchema);
