import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import AppError from "../../error/AppError";
import { bookingService } from "./booking.service";

const createBooking = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await bookingService.createBooking(req.body, userId);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Booking created successfully",
    data: result,
  });
});

const getMyBookingsAsCustomer = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const { meta, result } = await bookingService.getMyBookingsAsCustomer(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Bookings retrieved successfully",
    meta,
    data: result,
  });
});

const getMyBookingsAsSnapper = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const { meta, result } = await bookingService.getMyBookingsAsSnapper(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Bookings retrieved successfully",
    meta,
    data: result,
  });
});

const getAllBookings = catchAsync(async (req: Request, res: Response) => {
  const { meta, result } = await bookingService.getAllBookings(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Bookings retrieved successfully",
    meta,
    data: result,
  });
});

const getBookingById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, role } = req.user;
  const result = await bookingService.getBookingById(id, userId, role === "admin");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking retrieved successfully",
    data: result,
  });
});

const updateBookingStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, role } = req.user;
  const { status, note } = req.body;
  const result = await bookingService.updateBookingStatus(id, userId, role === "admin", status, note);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Booking status updated to ${status}`,
    data: result,
  });
});

const submitDelivery = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.user;
  const result = await bookingService.submitDelivery(id, userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Delivery submitted successfully",
    data: result,
  });
});

const acceptDelivery = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.user;
  const result = await bookingService.acceptDelivery(id, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Delivery accepted successfully",
    data: result,
  });
});

const rejectDelivery = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.user;
  const result = await bookingService.rejectDelivery(id, userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Delivery rejected",
    data: result,
  });
});

const getDeliveryHistory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, role } = req.user;
  const result = await bookingService.getDeliveryHistory(id, userId, role === "admin");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Delivery history retrieved successfully",
    data: result,
  });
});

const uploadDeliveryAssets = catchAsync(async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) || [];
  if (files.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "No files were uploaded");
  }

  const { id } = req.params;
  const { userId } = req.user;
  // set by resolveDeliveryUploadContext, guaranteed present by the time this runs
  const { folder } = req.deliveryUploadContext!;
  const result = await bookingService.uploadDeliveryAssetsToGallery(id, userId, files, folder);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Delivery assets uploaded successfully",
    data: result,
  });
});

const serveDeliveryAsset = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, role } = req.user;
  // Express 4's unnamed wildcard (`/*`) captures the remainder in req.params[0]
  const keySuffix = req.params[0];

  const absolutePath = await bookingService.resolveDeliveryAssetPath(
    id,
    keySuffix,
    userId,
    role === "admin"
  );

  res.sendFile(absolutePath);
});

export const bookingController = {
  createBooking,
  getMyBookingsAsCustomer,
  getMyBookingsAsSnapper,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  submitDelivery,
  acceptDelivery,
  rejectDelivery,
  getDeliveryHistory,
  uploadDeliveryAssets,
  serveDeliveryAsset,
};
