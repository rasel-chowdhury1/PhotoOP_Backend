import { Schema, model } from "mongoose";

// one wallet per snapper. Money is stored as plain Number dollar amounts, matching the
// convention already used everywhere else in this codebase (Booking.totalPrice,
// Payment.amount, Withdraw.amount, etc.) rather than switching this one collection to
// integer cents — every mutation here goes through wallet.service.ts's round2() helper
// and MongoDB's atomic $inc (never a read-modify-write in application code), which is
// what actually prevents the race conditions and drift this kind of field is at risk of,
// not the choice of unit.
const SnapperWalletSchema = new Schema(
  {
    snapperId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    currency: {
      type: String,
      default: "USD",
      uppercase: true,
    },

    // currently withdrawable
    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    // earned but still inside the settlement hold window (see config.withdrawal.holdDays
    // and wallet.cron.ts) — not yet withdrawable
    pendingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    // lifetime earned, never decremented
    totalEarned: {
      type: Number,
      default: 0,
      min: 0,
    },

    // lifetime successfully paid out, never decremented
    totalWithdrawn: {
      type: Number,
      default: 0,
      min: 0,
    },

    // lifetime refunded away from this snapper (not currently wired to any refund flow —
    // the field exists for when one is; see booking.service.ts's triggerRefund TODO)
    totalRefunded: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export default model("SnapperWallet", SnapperWalletSchema);
