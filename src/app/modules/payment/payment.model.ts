import { Schema, model } from "mongoose";
import { PaymentGateway, PaymentStatus, PaymentType } from "./payment.interface";



const PaymentSchema = new Schema(
  {
    paymentNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },

    paymentType: {
      type: String,
      enum: Object.values(PaymentType),
      required: true,
    },

    storagePlan: {
      type: String,
      enum: ["FREE", "PRO_50", "PRO_200"],
      default: null,
    },

    // only set for paymentType STORAGE_UPGRADE — how many months of the storagePlan
    // this payment purchased (see snapperProfileService.upgradeStoragePlan)
    durationMonths: {
      type: Number,
      default: null,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "USD",
      uppercase: true,
    },

    gateway: {
      type: String,
      enum: Object.values(PaymentGateway),
      default: PaymentGateway.STRIPE,
    },

    paymentIntentId: {
      type: String,
      default: null,
    },

    checkoutSessionId: {
      type: String,
      default: null,
    },

    transactionId: {
      type: String,
      default: null,
    },

    receiptUrl: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
      index: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    refundReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes
PaymentSchema.index({ paymentNumber: 1 });
PaymentSchema.index({ userId: 1 });
PaymentSchema.index({ bookingId: 1 });
PaymentSchema.index({ paymentIntentId: 1 });

export default model("Payment", PaymentSchema);