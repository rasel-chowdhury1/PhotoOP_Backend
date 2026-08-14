import httpStatus from "http-status";
import mongoose from "mongoose";
import AppError from "../../error/AppError";
import QueryBuilder from "../../builder/QueryBuilder";
import { User } from "../user/user.model";
import Review from "./review.model";
import { IReview } from "./review.interface";

// recompute and persist a user's aggregate rating from all reviews they've received
const recalculateRating = async (receiverId: string | unknown) => {
  // .aggregate() sends the pipeline straight to MongoDB, bypassing Mongoose's usual
  // string->ObjectId query casting — $match must be given a real ObjectId or it matches nothing
  const receiverObjectId = new mongoose.Types.ObjectId(String(receiverId));

  const [stats] = await Review.aggregate([
    { $match: { receiverId: receiverObjectId } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  await User.findByIdAndUpdate(receiverId, {
    totalReview: stats?.totalReviews || 0,
    averageRating: stats?.averageRating ? Number(stats.averageRating.toFixed(2)) : 0,
  });
};

const createReview = async (
  payload: Pick<IReview, "receiverId" | "comment" | "rating">,
  reviewerId: string
) => {

  if (String(payload.receiverId) === String(reviewerId)) {
    throw new AppError(httpStatus.BAD_REQUEST, "You cannot review yourself");
  }

  let review;
  try {
    review = await Review.create({ ...payload, reviewerId });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError(httpStatus.CONFLICT, "You have already reviewed this person");
    }
    throw error;
  }

  await recalculateRating(payload.receiverId);
  return review;
};

const getReviewsForReceiver = async (receiverId: string, query: Record<string, unknown>) => {
  const reviewQuery = new QueryBuilder(
    Review.find({ receiverId }).populate("reviewerId", "fullName profileImage"),
    query
  )
    .search(["comment"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await reviewQuery.modelQuery;
  const meta = await reviewQuery.countTotal();
  return { meta, result };
};

const getReviewsByReviewer = async (reviewerId: string, query: Record<string, unknown>) => {
  const reviewQuery = new QueryBuilder(
    Review.find({ reviewerId }).populate("receiverId", "fullName profileImage"),
    query
  )
    .search(["comment"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await reviewQuery.modelQuery;
  const meta = await reviewQuery.countTotal();
  return { meta, result };
};

const getAllReviews = async (query: Record<string, unknown>) => {
  const reviewQuery = new QueryBuilder(
    Review.find()
      .populate("reviewerId", "fullName profileImage")
      .populate("receiverId", "fullName profileImage"),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await reviewQuery.modelQuery;
  const meta = await reviewQuery.countTotal();
  return { meta, result };
};

const getReviewById = async (id: string) => {
  const review = await Review.findById(id)
    .populate("reviewerId", "fullName profileImage")
    .populate("receiverId", "fullName profileImage");

  if (!review) {
    throw new AppError(httpStatus.NOT_FOUND, "Review not found");
  }
  return review;
};

const updateReview = async (
  id: string,
  authUserId: string,
  payload: Pick<Partial<IReview>, "comment" | "rating">
) => {
  
  const review = await Review.findById(id);
  if (!review) {
    throw new AppError(httpStatus.NOT_FOUND, "Review not found");
  }

  if (String(review.reviewerId) !== String(authUserId)) {
    throw new AppError(httpStatus.FORBIDDEN, "You can only update your own review");
  }

  if (payload.comment !== undefined) review.comment = payload.comment;
  if (payload.rating !== undefined) review.rating = payload.rating;
  await review.save();

  await recalculateRating(review.receiverId);
  return review;
};

const deleteReview = async (id: string, authUserId: string, isAdmin: boolean) => {
  const review = await Review.findById(id);
  if (!review) {
    throw new AppError(httpStatus.NOT_FOUND, "Review not found");
  }

  if (!isAdmin && String(review.reviewerId) !== String(authUserId)) {
    throw new AppError(httpStatus.FORBIDDEN, "You can only delete your own review");
  }

  const receiverId = review.receiverId;
  await review.deleteOne();
  await recalculateRating(receiverId);
};

export const reviewService = {
  createReview,
  getReviewsForReceiver,
  getReviewsByReviewer,
  getAllReviews,
  getReviewById,
  updateReview,
  deleteReview,
};
