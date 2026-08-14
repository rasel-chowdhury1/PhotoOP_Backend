import { Types } from "mongoose";

export interface IReview {
  reviewerId: Types.ObjectId | string;
  receiverId: Types.ObjectId | string;
  comment?: string;
  rating: number;
}
