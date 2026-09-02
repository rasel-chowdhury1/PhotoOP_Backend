import { Router } from "express";
import path from "path";

import { GalleryController } from "./gallery.controller";
import auth from "../../middleware/auth";
import validateRequest from "../../middleware/validateRequest";
import { GalleryValidation } from "./gallery.validation";
import fileUpload from "../../middleware/fileUpload";
import { USER_ROLE } from "../user/user.constants";
import config from "../../config";

// must be an absolute path under config.upload_root — storage.save() (see
// utils/storage/local.storage.ts) verifies the file was written under
// path.join(UPLOAD_ROOT, folder) before deriving its key, and "profile" here is
// the folder name passed to storage.save() in gallery.controller.ts
const upload = fileUpload(path.join(config.upload_root, "profile"));

const router = Router();

// snapper: list all own galleries
router.get(
    "/my",
    auth(USER_ROLE.SNAPPER),
    GalleryController.getMyGalleries
)

// snapper: get one gallery
.get(
    "/:id",
    // auth(USER_ROLE.SNAPPER, USER_ROLE.USER, USER_ROLE.ADMIN),
    GalleryController.getSingleGallery
)

// view/serve a single image — must come before the PATCH/DELETE routes below since
// they share the same path pattern (different HTTP methods, no conflict, but keeping
// reads grouped with the other GETs). The image key is multi-segment
// (e.g. "deliveries/{bookingId}/attempt-1/{uuid}.png"), so this uses a wildcard (`*`)
// rather than a plain `:imageKey` param — a named param only ever matches a single
// path segment (no slashes), which is exactly why this route was 404ing before.
.get(
  "/:id/images/*",
  auth(USER_ROLE.SNAPPER, USER_ROLE.USER, USER_ROLE.ADMIN),
  GalleryController.getGalleryImage
)

// snapper: edit a specific image (metadata, and/or replace the file itself)
.patch(
  "/:id/images/*",
  auth("snapper"),
  upload.single("file"), // omit if this call is metadata-only, no file replace
  validateRequest(GalleryValidation.updateGalleryImage),
  GalleryController.updateGalleryImage
)


// snapper: update gallery (name/status)
.patch(
  "/update/:id",
  auth(USER_ROLE.SNAPPER),
  validateRequest(GalleryValidation.updateGallery),
  GalleryController.updateGallery
)

// snapper: delete a specific image from a gallery
.delete(
    "/:id/images/*",
    auth(USER_ROLE.SNAPPER),
    GalleryController.deleteGalleryImage
)



export const GalleryRoutes = router;
