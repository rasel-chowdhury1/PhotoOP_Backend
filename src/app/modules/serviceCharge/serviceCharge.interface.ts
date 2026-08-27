import { Document, Types } from "mongoose";

export enum ServiceChargeType {
  PERCENTAGE = "PERCENTAGE",
  FLAT = "FLAT",
}

export interface IServiceCharge extends Document {
  _id: Types.ObjectId;
  name: string;
  type: ServiceChargeType;
  value: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}