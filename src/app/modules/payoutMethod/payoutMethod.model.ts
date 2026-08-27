import { Schema, model } from "mongoose";

export enum PayoutMethodType {
  BANK_ACCOUNT = "BANK_ACCOUNT",
  PAYPAL = "PAYPAL",
  STRIPE = "STRIPE",
}

export enum PayoutMethodStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  PENDING_VERIFICATION = "PENDING_VERIFICATION",
}

const PayoutMethodSchema = new Schema(
  {
    snapperId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: Object.values(PayoutMethodType),
      required: true,
    },

    // free-text label (bank name, "PayPal", "Stripe") — not used for routing, just display
    provider: {
      type: String,
      default: null,
      trim: true,
    },

    // Stripe Connect external account id, if that integration is ever wired up. Null for
    // BANK_ACCOUNT/PAYPAL today, since no such external vault exists yet in this project.
    externalAccountId: {
      type: String,
      default: null,
    },

    // full account details (account number, paypal email, etc.) — required because there
    // is no external payment-processor vault to defer to for BANK_ACCOUNT/PAYPAL in this
    // project today. Never returned as-is by the API — see payoutMethod.service.ts's
    // toSafePayoutMethod, which strips this down to `last4` before it leaves the server.
    accountDetails: {
      type: Schema.Types.Mixed,
      required: true,
    },

    // last 4 digits/characters of the sensitive identifier — safe to display
    last4: {
      type: String,
      default: null,
    },

    accountName: {
      type: String,
      default: null,
      trim: true,
    },

    isDefault: {
      type: Boolean,
      default: false,
    },

    // not settable by the snapper themselves — stays false until a KYC/verification flow
    // (out of scope here) confirms the account, or an admin process sets it
    isVerified: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: Object.values(PayoutMethodStatus),
      default: PayoutMethodStatus.PENDING_VERIFICATION,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

PayoutMethodSchema.index({ snapperId: 1, isDefault: 1 });

export default model("PayoutMethod", PayoutMethodSchema);
