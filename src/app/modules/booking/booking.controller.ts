import { Request, Response } from "express";
import path from "path";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import AppError from "../../error/AppError";
import config from "../../config";
import { storage } from "../../utils/storage";
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

  const key = await bookingService.resolveDeliveryAssetKey(id, keySuffix, userId, role === "admin");

  // S3 objects are served directly from the bucket — there's nothing on this
  // server's disk to stream, so redirect instead. Local files are still local disk.
  if (config.storage_driver === "s3") {
    res.redirect(storage.getUrl(key));
    return;
  }

  res.sendFile(path.join(path.resolve(config.upload_root), key));
});


const getSnapperBookingStats = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;

  const result = await bookingService.getSnapperBookingStats(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Snapper booking statistics retrieved successfully",
    data: result,
  });
});

const getMyRecentBookings = catchAsync(async (req: Request, res: Response) => {
  const { userId, role } = req.user;
  const limit = req.query.limit ? Number(req.query.limit) : 5;

  const result = await bookingService.getMyRecentBookings(userId, role, limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Recent bookings retrieved successfully",
    data: result,
  });
});


const createQuickShootRequest = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;

  
  const { bookingId, requestedBookingDate, requestedStartTime, requestedEndTime, reason } =
    req.body;

  const result = await bookingService.createQuickShootRequest({
    bookingId,
    requestedBy: userId,
    requestedBookingDate,
    requestedStartTime,
    requestedEndTime,
    reason,
  }
);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quick shoot request created successfully",
    data: result,
  });
});


const getMyQuickShootRequests = catchAsync(async (req: Request, res: Response) => {
  const { userId, role } = req.user;
  const { status } = req.query;

  const result = await bookingService.getMyQuickShootRequests({
    userId,
    role,
    status: status as "pending" | "accepted" | "rejected" | undefined,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quick shoot requests retrieved successfully",
    data: result,
  });
});

const acceptQuickShootRequest = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, role } = req.user;

  const result = await bookingService.acceptQuickShootRequest({
    bookingId: id,
    actionBy: userId,
    isAdmin: role === "admin",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quick shoot request accepted",
    data: result,
  });
});

const rejectQuickShootRequest = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, role } = req.user;
  const { rejectionReason } = req.body;

  const result = await bookingService.rejectQuickShootRequest({
    bookingId: id,
    actionBy: userId,
    isAdmin: role === "admin",
    rejectionReason,
  }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quick shoot request rejected",
    data: result,
  });
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
  getSnapperBookingStats,
  getMyRecentBookings,
  createQuickShootRequest,
  getMyQuickShootRequests,
  acceptQuickShootRequest,
  rejectQuickShootRequest
};
