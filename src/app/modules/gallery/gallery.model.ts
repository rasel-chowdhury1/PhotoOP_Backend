import mongoose, { Schema, model } from "mongoose";

export enum GalleryStatus {
  DRAFT = "DRAFT",
  DELIVERED = "DELIVERED",
  ARCHIVED = "ARCHIVED",
}

const GalleryImageSchema = new Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
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

const GallerySchema = new Schema(
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

    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
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

export default model("Gallery", GallerySchema);