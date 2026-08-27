import { Schema, model } from "mongoose";

export enum WithdrawStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
}

// kept for the payoutMethod.model.ts reference-type enum's parity, and for any caller
// still checking a payout method's own type — Withdraw itself no longer stores
// method/accountDetails inline, it references PayoutMethod via paymentMethodId instead
export enum WithdrawMethod {
  BANK = "BANK",
  PAYPAL = "PAYPAL",
  STRIPE = "STRIPE",
}

const WithdrawSchema = new Schema(
  {
    withdrawNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    snapperId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // gross amount requested by the snapper
    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    // platform processing fee, calculated server-side (see config.withdrawal.feePercentage)
    fee: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    // amount - fee — what's actually transferred to the snapper
    netAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "USD",
      uppercase: true,
    },

    paymentMethodId: {
      type: Schema.Types.ObjectId,
      ref: "PayoutMethod",
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(WithdrawStatus),
      default: WithdrawStatus.PENDING,
    },

    // external payout reference (bank/PayPal/Stripe transfer id) — only set on COMPLETED
    transactionId: {
      type: String,
      default: null,
      trim: true,
    },

    requestedAt: {
      type: Date,
      default: Date.now,
    },

    processedAt: {
      type: Date,
      default: null,
    },

    processedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // why a PROCESSING withdrawal ended up FAILED
    failureReason: {
      type: String,
      default: null,
      trim: true,
    },

    // admin's note — used for REJECTED (why the request was declined) and as a general
    // freeform annotation on any admin action
    adminNote: {
      type: String,
      default: null,
      trim: true,
    },

    notes: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

WithdrawSchema.index({ snapperId: 1, status: 1 });
WithdrawSchema.index({ status: 1 });
WithdrawSchema.index({ createdAt: -1 });
WithdrawSchema.index({ paymentMethodId: 1 });

export default model("Withdraw", WithdrawSchema);
