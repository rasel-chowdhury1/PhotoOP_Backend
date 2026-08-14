import { Schema, model } from "mongoose";

export enum WithdrawStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  PAID = "PAID",
}

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
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    method: {
      type: String,
      enum: Object.values(WithdrawMethod),
      required: true,
    },

    accountDetails: {
      type: Schema.Types.Mixed,
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(WithdrawStatus),
      default: WithdrawStatus.PENDING,
      index: true,
    },

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

    rejectionReason: {
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
WithdrawSchema.index({ requestedAt: -1 });

export default model("Withdraw", WithdrawSchema);