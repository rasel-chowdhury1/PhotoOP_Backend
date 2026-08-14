import { Schema, model } from "mongoose";
import { StoragePlan } from "./snapperProfile.interface";

const SnapperProfileSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      unique: true,
      required: true,
    },

    identityImage: {
      type: String,
      required: true,
    },

    about: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    specialties: [
      {
        type: String,
        trim: true,
      },
    ],

    hourlyRate: {
      type: Number,
      required: true,
      min: 0,
    },

    badges: [
      {
        type: String,
      },
    ],

    // Storage
    storagePlan: {
      type: String,
      enum: Object.values(StoragePlan),
      default: StoragePlan.FREE,
    },

    storageUsedGB: {
      type: Number,
      default: 0,
      min: 0,
    },

    storageLimitGB: {
        type: Number,
        default: 5,
        },

    storageExpiresAt: {
      type: Date,
      default: null,
    },

    // seeded with 3 default packages the first time an admin approves this snapper
    // (see updateAdminApproval in user.service.ts)
    packageIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Package",
        default: [],
      },
    ],
  },
  {
    timestamps: true,
  }
);

export default model("SnapperProfile", SnapperProfileSchema);