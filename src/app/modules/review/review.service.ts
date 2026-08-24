import httpStatus from "http-status";
import mongoose from "mongoose";
import AppError from "../../error/AppError";
import QueryBuilder from "../../builder/QueryBuilder";
import { User } from "../user/user.model";
import Booking from "../booking/booking.model";
import { BookingStatus } from "../booking/booking.interface";
import { emitNotification } from "../../../socketIo";
import { NotificationType } from "../notifications/notifications.interface";
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
  payload: Pick<IReview, "bookingId" | "comment" | "rating">,
  reviewerId: string
) => {
  const booking = await Booking.findOne({ _id: payload.bookingId, isDeleted: false });
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
  }

  const isCustomerReviewing = String(booking.userId) === String(reviewerId);
  const isSnapperReviewing = String(booking.snapperId) === String(reviewerId);

  if (!isCustomerReviewing && !isSnapperReviewing) {
    throw new AppError(httpStatus.FORBIDDEN, "You are not part of this booking");
  }

  if (booking.status !== BookingStatus.COMPLETED) {
    throw new AppError(httpStatus.BAD_REQUEST, "You can only review a completed booking");
  }

  const alreadyReviewed = isCustomerReviewing ? booking.customerReviewed : booking.snapperReviewed;
  if (alreadyReviewed) {
    throw new AppError(httpStatus.CONFLICT, "You have already reviewed this booking");
  }

  // the receiver is always the other party on this booking — never trust a
  // client-supplied receiverId, it would let a reviewer rate someone unrelated to this booking
  const receiverId = isCustomerReviewing ? booking.snapperId : booking.userId;

  const session = await mongoose.startSession();
  let review;
  try {
    await session.withTransaction(async () => {
      const [created] = await Review.create(
        [
          {
            bookingId: booking._id,
            reviewerId,
            receiverId,
            comment: payload.comment,
            rating: payload.rating,
          },
        ],
        { session }
      );
      review = created;

      if (isCustomerReviewing) {
        booking.customerReviewed = true;
      } else {
        booking.snapperReviewed = true;
      }
      await booking.save({ session });
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError(httpStatus.CONFLICT, "You have already reviewed this booking");
    }
    throw error;
  } finally {
    await session.endSession();
  }

  recalculateRating(receiverId).catch((error) => {
    console.error("Failed to recalculate rating after review creation:", error);
  });

  User.findById(reviewerId)
    .select("fullName")
    .then((reviewer) => {
      const reviewerName = reviewer?.fullName || "Someone";
      return emitNotification({
        userId: reviewerId,
        receiverId,
        userMsg: {
          fullName: reviewerName,
          image: "",
          text: payload.comment
            ? `${reviewerName} left you a ${payload.rating}-star review: "${payload.comment}"`
            : `${reviewerName} left you a ${payload.rating}-star review.`,
          photos: [],
        },
        type: NotificationType.REVIEW_RECEIVED,
      });
    })
    .catch((error) => {
      console.error("Failed to send review notification:", error);
    });

  return review;
};

const getReviewsForReceiver = async (receiverId: string, query: Record<string, unknown>) => {
  const reviewQuery = new QueryBuilder(
    Review.find({ receiverId })
      .populate("reviewerId", "fullName profileImage")
      .populate("bookingId", "bookingId bookingDate"),
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
    Review.find({ reviewerId })
      .populate("receiverId", "fullName profileImage")
      .populate("bookingId", "bookingId bookingDate"),
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
      .populate("receiverId", "fullName profileImage")
      .populate("bookingId", "bookingId bookingDate"),
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
    .populate("receiverId", "fullName profileImage")
    .populate("bookingId", "bookingId bookingDate");

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

  if (review.bookingId) {
    const relatedBooking = await Booking.findById(review.bookingId).select("userId");
    if (relatedBooking) {
      const wasCustomerReview = String(relatedBooking.userId) === String(review.reviewerId);
      await Booking.updateOne(
        { _id: review.bookingId },
        wasCustomerReview ? { customerReviewed: false } : { snapperReviewed: false }
      );
    }
  }

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
