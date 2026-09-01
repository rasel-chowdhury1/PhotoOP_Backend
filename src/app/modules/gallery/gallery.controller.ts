import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync"; // adjust to your actual path
import sendResponse from "../../utils/sendResponse"; // adjust to your actual path
import { GalleryService } from "./gallery.service";
import { storage } from "../../utils/storage";

// GET /galleries  — snapper sees all their own galleries
const getMyGalleries = catchAsync(async (req, res) => {

  const snapperId = req.user.userId; // adjust to however your auth middleware attaches the user

  const { meta, result } = await GalleryService.getMyGalleries(snapperId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Galleries retrieved successfully",
    meta,
    data: result,
  });
});

// GET /galleries/:id
const getSingleGallery = catchAsync(async (req, res) => {
  const { id } = req.params;

  const result = await GalleryService.getSingleGallery(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Gallery retrieved successfully",
    data: result,
  });
});

// GET /galleries/:id/images/* — view/serve a single image. The wildcard (`*`) is
// captured in req.params[0], since the image key is multi-segment
// (e.g. "deliveries/{bookingId}/attempt-1/{uuid}.png") and a named `:param` can only
// ever match one path segment.
const getGalleryImage = catchAsync(async (req, res) => {
  const { userId, role } = req.user;
  const { id } = req.params;
  const imageKey = req.params[0];

  const absolutePath = await GalleryService.getGalleryImagePath(
    id,
    imageKey,
    userId,
    role === "admin"
  );

  res.sendFile(absolutePath);
});

// PATCH /galleries/:id  — update name/status
const updateGallery = catchAsync(async (req, res) => {
  const snapperId = req.user.userId;
  const { id } = req.params;

  const result = await GalleryService.updateGallery(id, snapperId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Gallery updated successfully",
    data: result,
  });
});

// DELETE /galleries/:id/images/*
const deleteGalleryImage = catchAsync(async (req, res) => {
  const snapperId = req.user.userId;
  const { id } = req.params;
  const imageKey = req.params[0];

  const result = await GalleryService.deleteGalleryImage(id, snapperId, imageKey);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Image deleted successfully",
    data: result,
  });
});

// PATCH /galleries/:id/images/*  — metadata edit and/or file replace
const updateGalleryImage = catchAsync(async (req, res) => {
  const snapperId = req.user.userId;
  const { id } = req.params;
  const imageKey = req.params[0];

  // route the replacement file through the configured IStorageAdapter (local or S3,
  // per STORAGE_DRIVER) instead of trusting multer's raw disk path/filename directly —
  // multer only ever writes the temp file to local disk; storage.save() is what
  // actually pushes it to S3 (and cleans up the temp file) when that driver is active
  const newFile = req.file ? await storage.save(req.file, "profile") : undefined;

  const result = await GalleryService.updateGalleryImage(id, snapperId, imageKey, req.body, newFile);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Image updated successfully",
    data: result,
  });
});

export const GalleryController = {
  getMyGalleries,
  getSingleGallery,
  getGalleryImage,
  updateGallery,
  deleteGalleryImage,
  updateGalleryImage,
};
