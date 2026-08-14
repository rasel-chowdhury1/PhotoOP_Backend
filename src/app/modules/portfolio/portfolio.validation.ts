import { z } from "zod";

const createPortfolioValidationSchema = z.object({
  body: z.object({
    image: z.string({ required_error: "image is required" }),
    category: z.string().optional(),
    place: z.string().optional(),
    clickedAt: z.coerce.date().optional(),
  }),
});

const updatePortfolioValidationSchema = z.object({
  body: z.object({
    image: z.string().optional(),
    category: z.string().optional(),
    place: z.string().optional(),
    clickedAt: z.coerce.date().optional(),
  }),
});

export const portfolioValidation = {
  createPortfolioValidationSchema,
  updatePortfolioValidationSchema,
};
