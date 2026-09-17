import { NextFunction, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import multer, { FileFilterCallback } from "multer";
import httpStatus from "http-status";
import AppError from "../error/AppError";
import catchAsync from "../utils/catchAsync";
import config from "../config";
import { storage } from "../utils/storage";
import Booking from "../modules/booking/booking.model";
import { BookingStatus } from "../modules/booking/booking.interface";
import SnapperProfile from "../modules/snapperProfile/snapperProfile.model";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4"];
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 500;

// runs BEFORE multer: rejects the request before any bytes are accepted if the caller
// isn't the booking's snapper, the booking isn't in a state that can receive a
// delivery, or the attempt cap is already reached. Also resolves the attempt number
// once here so multer's destination/filename callbacks (which are not async-friendly)
// don't need to query the DB themselves.
export const resolveDeliveryUploadContext = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    const bookingId = req.params.id;
    const { userId, role } = req.user;

    const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
    if (!booking) {
      throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
    }

    const isSnapper = String(booking.snapperId) === String(userId);
    if (!isSnapper && role !== "admin") {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "Only the assigned snapper can upload delivery assets"
      );
    }

    if (
      ![BookingStatus.SHOOT_COMPLETED, BookingStatus.DELIVERY_REJECTED].includes(booking.status)
    ) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Cannot upload delivery assets while booking is ${booking.status}`
      );
    }

    if (booking.deliveryAttempts >= booking.maxDeliveryAttempts) {
      throw new AppError(httpStatus.BAD_REQUEST, "Maximum delivery attempts reached");
    }

    const snapperProfile = await SnapperProfile.findOne({ userId: booking.snapperId });
    if (snapperProfile?.storageExpiresAt && snapperProfile.storageExpiresAt < new Date()) {
      throw new AppError(
        httpStatus.PAYMENT_REQUIRED,
        "Your storage plan has expired. Please renew to continue uploading."
      );
    }

    const attempt = booking.deliveryAttempts + 1;
    
    req.deliveryUploadContext = {
      bookingId,
      attempt,
      folder: `deliveries/${bookingId}/attempt-${attempt}`,
    };

    next();
  }
);

const diskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const context = (req as Request).deliveryUploadContext;
    if (!context) {
      cb(new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Delivery upload context missing"), "");
      return;
    }

    const destination = path.join(config.upload_root, context.folder);
    fs.mkdirSync(destination, { recursive: true });
    cb(null, destination);
  },
  filename: (_req, file, cb) => {
    // never trust the client-supplied filename
    cb(null, `${randomUUID()}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(new AppError(httpStatus.BAD_REQUEST, `Unsupported file type: ${file.mimetype}`));
    return;
  }
  cb(null, true);
};

const deliveryAssetUpload = multer({
  storage: diskStorage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter,
});

// wraps multer's array-upload middleware so that ANY failure at the multer level
// (fileFilter rejection partway through a batch, a size-limit hit, etc.) cleans up
// whatever files it already wrote to disk before the error, rather than leaving
// orphaned partial uploads behind
export const handleDeliveryUpload = (req: Request, res: Response, next: NextFunction) => {
  deliveryAssetUpload.array("files", MAX_FILES)(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    const partialFiles = (req.files as Express.Multer.File[] | undefined) || [];
    const context = req.deliveryUploadContext;

    const cleanup =
      partialFiles.length > 0 && context
        ? storage.deleteMany(
            partialFiles.map((file) => `${context.folder}/${path.basename(file.path)}`)
          )
        : Promise.resolve();

    cleanup
      .catch((cleanupError) => {
        console.error("Failed to clean up partial delivery upload:", cleanupError);
      })
      .finally(() => {
        next(err instanceof Error ? err : new AppError(httpStatus.BAD_REQUEST, "File upload failed"));
      });
  });
};
