import { z } from "zod";

// amount/status/fee/netAmount/snapperId are never accepted from the client beyond this —
// amount is the only client-supplied money field, and it's re-validated against the
// wallet's actual available balance server-side (see withdrawRequest.service.ts)
const createWithdrawValidationSchema = z.object({
  body: z.object({
    amount: z.number({ required_error: "amount is required" }).positive(),
    paymentMethodId: z.string({ required_error: "paymentMethodId is required" }),
    notes: z.string().trim().max(500).optional(),
  }),
});

const processWithdrawValidationSchema = z.object({
  body: z
    .object({
      status: z.enum(["PROCESSING", "COMPLETED", "FAILED"], {
        required_error: "status is required",
      }),
      transactionId: z.string().trim().min(1).optional(),
      failureReason: z.string().trim().min(1).max(500).optional(),
    })
    .refine((data) => data.status !== "COMPLETED" || !!data.transactionId, {
      message: "transactionId is required when status is COMPLETED",
      path: ["transactionId"],
    })
    .refine((data) => data.status !== "FAILED" || !!data.failureReason, {
      message: "failureReason is required when status is FAILED",
      path: ["failureReason"],
    }),
});

const rejectWithdrawValidationSchema = z.object({
  body: z.object({
    adminNote: z.string({ required_error: "adminNote is required" }).trim().min(1).max(500),
  }),
});

export const withdrawRequestValidation = {
  createWithdrawValidationSchema,
  processWithdrawValidationSchema,
  rejectWithdrawValidationSchema,
};
