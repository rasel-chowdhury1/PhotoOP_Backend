import { Types } from "mongoose";

export interface IPortfolio {
  userId: Types.ObjectId | string;
  image: string;
  category?: string;
  clickedAt?: Date | string;
  place?: string;
  isDeleted?: boolean;
}
