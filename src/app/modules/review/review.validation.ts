import { z } from "zod";

const createReviewValidationSchema = z.object({
  body: z.object({
    bookingId: z.string({ required_error: "bookingId is required" }),
    comment: z.string().optional(),
    rating: z
      .number({ required_error: "rating is required" })
      .min(1, { message: "rating must be at least 1" })
      .max(5, { message: "rating must be at most 5" }),
  }),
});

const updateReviewValidationSchema = z.object({
  body: z.object({
    comment: z.string().optional(),
    rating: z
      .number()
      .min(1, { message: "rating must be at least 1" })
      .max(5, { message: "rating must be at most 5" })
      .optional(),
  }),
});

export const reviewValidation = {
  createReviewValidationSchema,
  updateReviewValidationSchema,
};
