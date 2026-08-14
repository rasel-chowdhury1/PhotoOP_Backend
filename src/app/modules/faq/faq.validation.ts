import { z } from "zod";

const createFaqValidationSchema = z.object({
  body: z.object({
    question: z.string().min(1, { message: "Question is required" }),
    answer: z.string().min(1, { message: "Answer is required" }),
    order: z.number().optional(),
    isActive: z.boolean().optional(),
  }),
});

const updateFaqValidationSchema = z.object({
  body: z.object({
    question: z.string().min(1, { message: "Question is required" }).optional(),
    answer: z.string().min(1, { message: "Answer is required" }).optional(),
    order: z.number().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const faqValidation = {
  createFaqValidationSchema,
  updateFaqValidationSchema,
};
