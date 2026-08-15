import { Schema, model } from "mongoose";
import { DeliveryStatus, RejectionCategory, DELIVERY_METHODS } from "./booking.interface";
import { IDelivery } from "./delivery.interface";

const DeliverySchema = new Schema<IDelivery>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },

    snapperId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    attempt: {
      type: Number,
      required: true,
      default: 1,
    },

    deliveryMethod: {
      type: String,
      enum: Object.values(DELIVERY_METHODS),
      required: true,
    },

    // EXTERNAL_LINK only
    externalDeliveryLink: {
      type: String,
      trim: true,
    },

    linkPassword: {
      type: String,
    },

    linkExpiresAt: {
      type: Date,
    },

    // IN_APP_GALLERY only — reference, not the pictures themselves (those live on
    // the Gallery doc; see gallery.model.ts)
    galleryId: {
      type: Schema.Types.ObjectId,
      ref: "Gallery",
      default: null,
    },

    coverImage: {
      type: String,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1000,
    },

    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },

    status: {
      type: String,
      enum: Object.values(DeliveryStatus),
      default: DeliveryStatus.PENDING,
    },

    rejectionReason: {
      type: String,
      maxlength: 500,
    },

    rejectionCategory: {
      type: String,
      enum: Object.values(RejectionCategory),
    },

    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// one delivery per (booking, attempt) — also the natural "history, newest first" index
DeliverySchema.index({ bookingId: 1, attempt: 1 }, { unique: true });

export default model<IDelivery>("Delivery", DeliverySchema);
