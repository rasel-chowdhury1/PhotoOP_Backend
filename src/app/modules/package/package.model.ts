import { Schema, model } from "mongoose";
import { DurationUnit, IPackage } from "./package.interface";

export { DurationUnit };

const PackageSchema = new Schema<IPackage>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    packageName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    durationValue: {
      type: Number,
      required: true,
      min: 1,
    },

    durationUnit: {
      type: String,
      enum: Object.values(DurationUnit),
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export default model<IPackage>("Package", PackageSchema);
