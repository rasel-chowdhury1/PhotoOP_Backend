import { Request, Response } from "express";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import { reviewService } from "./review.service";

const createReview = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;

  const result = await reviewService.createReview(req.body, userId);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Review submitted successfully",
    data: result,
  });
});

const getMyReviews = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const { meta, result } = await reviewService.getReviewsForReceiver(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reviews retrieved successfully",
    meta,
    data: result,
  });
});

const getReviewsForReceiver = catchAsync(async (req: Request, res: Response) => {
  const { receiverId } = req.params;
  const { meta, result } = await reviewService.getReviewsForReceiver(receiverId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reviews retrieved successfully",
    meta,
    data: result,
  });
});

const getReviewsByReviewer = catchAsync(async (req: Request, res: Response) => {
  const { reviewerId } = req.params;
  const { meta, result } = await reviewService.getReviewsByReviewer(reviewerId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reviews retrieved successfully",
    meta,
    data: result,
  });
});

const getAllReviews = catchAsync(async (req: Request, res: Response) => {
  const { meta, result } = await reviewService.getAllReviews(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reviews retrieved successfully",
    meta,
    data: result,
  });
});

const getReviewById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await reviewService.getReviewById(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Review retrieved successfully",
    data: result,
  });
});

const updateReview = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.user;
  const result = await reviewService.updateReview(id, userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Review updated successfully",
    data: result,
  });
});

const deleteReview = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, role } = req.user;
  await reviewService.deleteReview(id, userId, role === "admin");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Review deleted successfully",
    data: null,
  });
});

export const reviewController = {
  createReview,
  getMyReviews,
  getReviewsForReceiver,
  getReviewsByReviewer,
  getAllReviews,
  getReviewById,
  updateReview,
  deleteReview,
};
