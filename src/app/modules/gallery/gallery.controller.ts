import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync"; // adjust to your actual path
import sendResponse from "../../utils/sendResponse"; // adjust to your actual path
import { GalleryService } from "./gallery.service";

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

// PATCH /galleries/:id  — update name/status
const updateGallery = catchAsync(async (req, res) => {
  const snapperId = req.user.id;
  const { id } = req.params;

  const result = await GalleryService.updateGallery(id, snapperId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Gallery updated successfully",
    data: result,
  });
});

// DELETE /galleries/:id/images/:imageKey
const deleteGalleryImage = catchAsync(async (req, res) => {
  const snapperId = req.user.id;
  const { id, imageKey } = req.params;

  console.log("delete gallery image =>>> ", {id,imageKey})

  const result = await GalleryService.deleteGalleryImage(id, snapperId, imageKey);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Image deleted successfully",
    data: result,
  });
});

// PATCH /galleries/:id/images/:imageKey  — metadata edit and/or file replace
const updateGalleryImage = catchAsync(async (req, res) => {
  const snapperId = req.user.id;
  const { id, imageKey } = req.params;

  console.log("update gallery image =>>> ", {id, imageKey})

  // adjust to however your upload middleware exposes the uploaded file/url
  const newFile = req.file
    ? {
        url: req.file.path, // or req.file.location for S3, etc.
        key: req.file.filename, // or the storage key your uploader returns
        size: req.file.size,
      }
    : undefined;

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
  updateGallery,
  deleteGalleryImage,
  updateGalleryImage,
};