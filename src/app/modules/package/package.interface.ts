import { Types } from "mongoose";

export enum DurationUnit {
  MINUTE = "minute",
  HOUR = "hour",
}

export interface IPackage {
  userId: Types.ObjectId | string;
  packageName: string;
  description?: string;
  price: number;
  durationValue: number;
  durationUnit: DurationUnit;
  isActive?: boolean;
  isDeleted?: boolean;
}
