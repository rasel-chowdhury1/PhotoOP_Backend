import { Types } from "mongoose";

export interface IReview {
  bookingId: Types.ObjectId | string;
  reviewerId: Types.ObjectId | string;
  receiverId: Types.ObjectId | string;
  comment?: string;
  rating: number;
}
