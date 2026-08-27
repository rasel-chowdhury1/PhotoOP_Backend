import { Schema, model } from "mongoose";
import { BookingStatus, DELIVERY_METHODS, PaymentStatus } from "./booking.interface";

const SelectedAddOnSchema = new Schema(
  {
    key: {
      type: String,
      enum: [
        "EXTRA_RETOUCHING",
        "RUSH_DELIVERY",
        "EXTRA_EDITED_PHOTOS",
        "RAW_FILES",
        "DRONE_SHOTS",
      ],
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      required: true,
    },
  },
  {
    _id: false,
  }
);

const StatusHistorySchema = new Schema(
  {
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      required: true,
    },

    actionBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    actionAt: {
      type: Date,
      default: Date.now,
    },

    note: {
      type: String,
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const RescheduleRequestSchema = new Schema(
  {
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    previousBookingDate: Date,

    previousStartTime: String,

    previousEndTime: String,

    requestedBookingDate: Date,

    requestedStartTime: String,

    requestedEndTime: String,

    reason: String,

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },

    actionAt: Date,
  },
  {
    _id: false,
  }
);

const BookingSchema = new Schema(
  {
    bookingId: {
      type: String,
      unique: true,
    },

    // Customer
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Photographer
    snapperId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    packageId: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },

    // Customer Information
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    // Shoot Location
    location: {
      type: String,
      trim: true,
      required: true,
    },

    // Booking Date
    bookingDate: {
      type: Date,
      required: true,
    },

    startTime: {
      type: String,
      required: true,
    },

    endTime: {
      type: String,
      required: true,
    },

    // Static Add-ons
    selectedAddOns: {
      type: [SelectedAddOnSchema],
      default: [],
    },

    // Pricing
    packagePrice: {
      type: Number,
      required: true,
    },

    addOnPrice: {
      type: Number,
      default: 0,
    },

    serviceFeePercentage: {
      type: Number,
      default: 5,
    },

    serviceFee: {
      type: Number,
      required: true,
    },

    totalPrice: {
      type: Number,
      required: true,
    },
        // =========================
    // Delivery
    // =========================

    // the customer's preference at booking time — the snapper's actual delivery method
    // for a given attempt lives on the Delivery doc (see delivery.model.ts)
    preferredDeliveryMethod: {
      type: String,
      enum: Object.values(DELIVERY_METHODS),
      default: DELIVERY_METHODS.IN_APP_GALLERY,
      required: true,
    },

    // whether the snapper physically hands over a printed/scannable QR code for this
    // delivery (e.g. pointing to the in-app gallery), independent of deliveryMethod
    qrCodeFromSnapper: {
      type: Boolean,
      default: false,
    },

    currentDeliveryId: {
      type: Schema.Types.ObjectId,
      ref: "Delivery",
      default: null,
    },

    deliveryAttempts: {
      type: Number,
      default: 0,
    },

    maxDeliveryAttempts: {
      type: Number,
      default: 3,
    },

    // =========================
    // Milestones
    // =========================

    shootCompletedAt: Date,
    deliveredAt: Date,
    completedAt: Date,

    // when a pending delivery auto-accepts if the customer never responds
    autoAcceptAt: Date,

    // =========================
    // Snapper wallet earnings (see wallet.service.ts) — set exactly once each, the
    // idempotency gate preventing this booking's earning from being credited or
    // released more than once
    // =========================
    earningsCreditedAt: {
      type: Date,
      default: null,
    },

    earningsReleasedAt: {
      type: Date,
      default: null,
    },

    // =========================
    // Payment (separate from `status` — see PaymentStatus doc comment in
    // booking.interface.ts for how this differs from Payment/payment.interface.ts)
    // =========================


    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.UNPAID,
    },

    refundAmount: Number,
    refundedAt: Date,
    refundTransactionId: String,

    // Booking Status
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.PENDING,
    },

    statusHistory: {
      type: [StatusHistorySchema],
      default: [],
    },

    // Reschedule Request
    rescheduleRequest: {
      type: RescheduleRequestSchema,
      default: null,
    },

    // Cancellation
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    cancelledAt: Date,

    cancellationReason: String,

    // Rejection (pre-shoot, by the snapper)
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    rejectedAt: Date,

    rejectionReason: String,

    // review is a separate collection — these just prevent prompting either side twice.
    // a booking can carry up to two reviews: the customer reviewing the snapper, and
    // the snapper reviewing the customer.
    customerReviewed: {
      type: Boolean,
      default: false,
    },

    snapperReviewed: {
      type: Boolean,
      default: false,
    },

    // Soft Delete
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
BookingSchema.index({
  snapperId: 1,
  bookingDate: 1,
});

BookingSchema.index({
  userId: 1,
  bookingDate: 1,
});

// for the auto-accept-delivery cron's sweep query
BookingSchema.index({
  status: 1,
  autoAcceptAt: 1,
});

// for the pending-earnings-release cron's sweep query (see wallet.cron.ts)
BookingSchema.index({
  status: 1,
  paymentStatus: 1,
  earningsReleasedAt: 1,
  completedAt: 1,
});

export default model("Booking", BookingSchema);