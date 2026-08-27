import { Schema, model } from "mongoose";
import { IServiceCharge, ServiceChargeType } from "./serviceCharge.interface";

const ServiceChargeSchema = new Schema<IServiceCharge>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: Object.values(ServiceChargeType),
      required: true,
    },

    // PERCENTAGE হলে 0-100 (e.g. 10 = 10%), FLAT হলে plain dollar amount
    value: {
      type: Number,
      required: true,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export default model<IServiceCharge>("ServiceCharge", ServiceChargeSchema);