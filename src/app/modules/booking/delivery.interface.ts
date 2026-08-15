import { Types } from "mongoose";
import { DELIVERY_METHODS, DeliveryStatus, RejectionCategory } from "./booking.interface";

// reused by gallery.interface.ts for picture asset type — keep this the single
// definition rather than duplicating an IMAGE/VIDEO enum there
export enum DeliveryAssetType {
  IMAGE = "IMAGE",
  VIDEO = "VIDEO",
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

  // IN_APP_GALLERY only — the actual pictures live on the Gallery doc (one per
  // booking, reused/appended-to across attempts); this is just a reference, so a
  // delivery attempt's history never duplicates the gallery's picture array
  galleryId?: Types.ObjectId | string;
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
  galleryId?: string; // IN_APP_GALLERY
  externalDeliveryLink?: string; // EXTERNAL_LINK
  linkPassword?: string;
  linkExpiresAt?: Date;
  coverImage?: string;
  description: string;
}

export interface IRejectDeliveryPayload {
  rejectionReason: string;
  rejectionCategory: RejectionCategory;
}
