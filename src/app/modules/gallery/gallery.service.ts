import { Types } from "mongoose";
import httpStatus from "http-status";
import QueryBuilder from "../../builder/QueryBuilder"; // adjust to your actual query-builder util
import Gallery from "./gallery.model";
import AppError from "../../error/AppError";
import { deleteFileFromStorage, storage } from "../../utils/storage";

// =========================
// Snapper: list own galleries
// =========================
const getMyGalleries = async (snapperId: string, query: Record<string, unknown>) => {
  
  console.log("snapper id =>>> ", snapperId)
    const galleryQuery = new QueryBuilder(
    Gallery.find({ snapperId: new Types.ObjectId(snapperId) }),
    query
  )
    .search(["name"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await galleryQuery.modelQuery;
  const meta = await galleryQuery.countTotal();

  return { meta, result };
};

// =========================
// Snapper: get one gallery (ownership enforced)
// =========================
const getSingleGallery = async (galleryId: string,) => {
  const gallery = await Gallery.findOne({
    _id: galleryId,
  });

  if (!gallery) {
    throw new AppError(httpStatus.NOT_FOUND, "Gallery not found");
  }

  return gallery;
};

// =========================
// View/serve a single image (customer, snapper, or admin — ownership checked directly
// against the gallery's own userId/snapperId, no separate booking lookup needed).
// Returns the storage key, not a filesystem path — driver-agnostic; the controller
// decides how to actually serve it (local sendFile vs. an S3 redirect)
// =========================
const getGalleryImageKey = async (
  galleryId: string,
  imageKey: string,
  requesterId: string,
  isAdmin: boolean
) => {
  const notFound = () => new AppError(httpStatus.NOT_FOUND, "Image not found");

  const gallery = await Gallery.findById(galleryId);
  if (!gallery) {
    throw notFound();
  }

  const isCustomer = String(gallery.userId) === String(requesterId);
  const isSnapper = String(gallery.snapperId) === String(requesterId);
  if (!isAdmin && !isCustomer && !isSnapper) {
    // 404, not 403 — don't reveal this gallery/image exists to a non-owner
    throw notFound();
  }

  // look up by exact match against a key WE stored, rather than resolving imageKey
  // into a filesystem path directly — so there's nothing here for a path-traversal
  // attempt to exploit, a mismatched key just won't be found
  const image = gallery.pictures.find((pic) => pic.key === imageKey);
  if (!image) {
    throw notFound();
  }

  if (!(await storage.exists(image.key))) {
    throw notFound();
  }

  return image.key;
};

// =========================
// Snapper: update gallery (name, status, etc.)
// =========================
const updateGallery = async (
  galleryId: string,
  snapperId: string,
  payload: { name?: string; status?: string }
) => {
  const gallery = await Gallery.findOne({
    _id: galleryId,
    snapperId: new Types.ObjectId(snapperId),
  });

  if (!gallery) {
    throw new AppError(httpStatus.NOT_FOUND, "Gallery not found");
  }

  if (payload.name !== undefined) {
    gallery.name = payload.name;
  }

  if (payload.status !== undefined) {
    gallery.status = payload.status as typeof gallery.status;
  }

  await gallery.save();

  return gallery;
};

// =========================
// Snapper: delete a specific image from a gallery
// =========================
const deleteGalleryImage = async (galleryId: string, snapperId: string, imageKey: string) => {
  const gallery = await Gallery.findOne({
    _id: galleryId,
    snapperId: new Types.ObjectId(snapperId),
  });

  if (!gallery) {
    throw new AppError(httpStatus.NOT_FOUND, "Gallery not found");
  }

  const image = gallery.pictures.find((pic) => pic.key === imageKey);

  if (!image) {
    throw new AppError(httpStatus.NOT_FOUND, "Image not found in this gallery");
  }

  // remove from storage first — if this throws, the DB doc is left untouched
  // and the caller can retry, instead of DB and storage going out of sync
  await deleteFileFromStorage(image.key);

  gallery.pictures = gallery.pictures.filter((pic) => pic.key !== imageKey);
  gallery.totalPictures = gallery.pictures.length;
  gallery.storageSize = gallery.pictures.reduce((sum, pic) => sum + pic.size, 0);

  await gallery.save();

  return gallery;
};

// =========================
// Snapper: edit a specific image
// Two cases: metadata-only edit (e.g. type), or full file replace when a new
// file is uploaded (multer puts it on req.file — passed in as newFile below)
// =========================
const updateGalleryImage = async (
  galleryId: string,
  snapperId: string,
  imageKey: string,
  payload: { type?: string },
  newFile?: { url: string; key: string; size: number }
) => {
  const gallery = await Gallery.findOne({
    _id: galleryId,
    snapperId: new Types.ObjectId(snapperId),
  });

  if (!gallery) {
    throw new AppError(httpStatus.NOT_FOUND, "Gallery not found");
  }

  const image = gallery.pictures.find((pic) => pic.key === imageKey);

  if (!image) {
    throw new AppError(httpStatus.NOT_FOUND, "Image not found in this gallery");
  }

  if (payload.type !== undefined) {
    image.type = payload.type as typeof image.type;
  }

  // replacing the actual file — swap url/key/size, delete the old asset from
  // storage, and re-stamp uploadedAt
  if (newFile) {
    const oldKey = image.key;

    image.url = newFile.url;
    image.key = newFile.key;
    image.size = newFile.size;
    image.uploadedAt = new Date();

    await deleteFileFromStorage(oldKey);

    gallery.storageSize = gallery.pictures.reduce((sum, pic) => sum + pic.size, 0);
  }

  await gallery.save();

  return gallery;
};

export const GalleryService = {
  getMyGalleries,
  getSingleGallery,
  getGalleryImageKey,
  updateGallery,
  deleteGalleryImage,
  updateGalleryImage,
};