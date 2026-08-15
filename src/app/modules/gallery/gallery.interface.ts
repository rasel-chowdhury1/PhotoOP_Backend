import { Types } from "mongoose";
import { DeliveryAssetType } from "../booking/delivery.interface";

export enum GalleryStatus {
  DRAFT = "DRAFT",
  DELIVERED = "DELIVERED",
  ARCHIVED = "ARCHIVED",
}

export interface IGalleryPicture {
  url: string;
  key: string;
  type: DeliveryAssetType;
  size: number; // bytes
  uploadedAt: Date;
}

export interface IGallery {
  userId: Types.ObjectId | string;
  snapperId: Types.ObjectId | string;
  bookingId: Types.ObjectId | string;
  name: string;
  pictures: IGalleryPicture[];
  totalPictures: number;
  storageSize: number; // bytes
  status: GalleryStatus;
}
