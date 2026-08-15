import { Schema, model } from "mongoose";
import { DeliveryAssetType } from "../booking/delivery.interface";
import { GalleryStatus, IGallery } from "./gallery.interface";

export { GalleryStatus };

const GalleryImageSchema = new Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },

    // internal path / storage key — required so uploaded assets can be located and
    // deleted later (see deleteGalleryAssets in booking.service.ts)
    key: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: Object.values(DeliveryAssetType),
      default: DeliveryAssetType.IMAGE,
    },

    size: {
      type: Number, // bytes
      required: true,
      min: 0,
    },

    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const GallerySchema = new Schema<IGallery>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    snapperId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // one gallery per booking, reused/appended-to across delivery attempts —
    // rejections don't create a new gallery, they just flip status back to DRAFT
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
    },

        // Defaults to the customer's name at booking-accept time (see gallery creation
    // in booking.service.ts). Editable later, so it can diverge from Booking.fullName.
    name: {
      type: String,
      required: true,
      trim: true,
    },

    pictures: {
      type: [GalleryImageSchema],
      default: [],
    },

    totalPictures: {
      type: Number,
      default: 0,
      min: 0,
    },

    storageSize: {
      type: Number, // bytes
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: Object.values(GalleryStatus),
      default: GalleryStatus.DRAFT,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export default model<IGallery>("Gallery", GallerySchema);
