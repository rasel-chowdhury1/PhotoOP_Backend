import { Types } from "mongoose";
import { DELIVERY_METHODS, DeliveryStatus, RejectionCategory } from "./booking.interface";

export enum DeliveryAssetType {
  IMAGE = "IMAGE",
  VIDEO = "VIDEO",
}

// assets are already-uploaded URLs (no upload endpoint exists in this codebase yet —
// see the plan's "no S3 wired up" note); submitDelivery just records them
export interface IDeliveryAsset {
  url: string;
  key?: string;
  type: DeliveryAssetType;
  size?: number;
  thumbnailUrl?: string;
}

export interface IDelivery {
  bookingId: Types.ObjectId | string;
  snapperId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  attempt: number;
  deliveryMethod: DELIVERY_METHODS;

  // EXTERNAL_LINK only
  externalDeliveryLink?: string;
  linkPassword?: string;
  linkExpiresAt?: Date;

  // IN_APP_GALLERY only
  assets: IDeliveryAsset[];
  coverImage?: string;

  description: string;
  submittedBy: Types.ObjectId | string;
  submittedAt: Date;

  status: DeliveryStatus;
  rejectionReason?: string;
  rejectionCategory?: RejectionCategory;
  reviewedAt?: Date;
}

// what the snapper submits — bookingId/snapperId/userId/attempt/status are all derived
// server-side in booking.service.ts, never trusted from the request body
export interface ISubmitDeliveryPayload {
  deliveryMethod: DELIVERY_METHODS;
  externalDeliveryLink?: string;
  linkPassword?: string;
  linkExpiresAt?: Date;
  assets?: IDeliveryAsset[];
  coverImage?: string;
  description: string;
}

export interface IRejectDeliveryPayload {
  rejectionReason: string;
  rejectionCategory: RejectionCategory;
}
