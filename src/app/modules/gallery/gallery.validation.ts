import { z } from "zod";

const updateGallery = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["DRAFT", "DELIVERED"]).optional(), // adjust to your full GalleryStatus enum
  }),
});

// used when editing metadata of a single image (not replacing the file itself)
const updateGalleryImage = z.object({
  body: z.object({
    type: z.enum(["IMAGE", "VIDEO"]).optional(), // adjust to your DeliveryAssetType enum values
  }),
});

export const GalleryValidation = {
  updateGallery,
  updateGalleryImage,
};