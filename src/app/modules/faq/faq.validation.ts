import { z } from "zod";

const createFaqValidationSchema = z.object({
  body: z.object({
    question: z.string().min(1, { message: "Question is required" }),
    answer: z.string().min(1, { message: "Answer is required" }),
    role: z.enum(["user", "snapper"], { required_error: "Role is required" }),
    isActive: z.boolean().optional(),
  }),
});

const updateFaqValidationSchema = z.object({
  body: z.object({
    question: z.string().min(1, { message: "Question is required" }).optional(),
    answer: z.string().min(1, { message: "Answer is required" }).optional(),
    role: z.enum(["user", "snapper"]).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const faqValidation = {
  createFaqValidationSchema,
  updateFaqValidationSchema,
};
