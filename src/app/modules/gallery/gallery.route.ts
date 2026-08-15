import { Router } from "express";

import { GalleryController } from "./gallery.controller";
import auth from "../../middleware/auth";
import validateRequest from "../../middleware/validateRequest";
import { GalleryValidation } from "./gallery.validation";
import fileUpload from "../../middleware/fileUpload";
import { USER_ROLE } from "../user/user.constants";
const upload = fileUpload('./public/uploads/profile');

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
    auth(USER_ROLE.SNAPPER, USER_ROLE.USER, USER_ROLE.ADMIN), 
    GalleryController.getSingleGallery
)

// snapper: edit a specific image (metadata, and/or replace the file itself)
.patch(
  "/:id/images/:imageKey",
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
    "/:id/images/:imageKey", 
    auth(USER_ROLE.SNAPPER), 
    GalleryController.deleteGalleryImage
)



export const GalleryRoutes = router;