import { z } from "zod";
import { PayoutMethodType } from "./payoutMethod.model";

// which accountDetails shape is required, keyed by type — enforced via superRefine below
const payoutAccountSchemas: Record<PayoutMethodType, z.ZodTypeAny> = {
  [PayoutMethodType.BANK_ACCOUNT]: z.object({
    accountHolderName: z.string({ required_error: "accountHolderName is required" }).min(1),
    accountNumber: z.string({ required_error: "accountNumber is required" }).min(1),
    bankName: z.string({ required_error: "bankName is required" }).min(1),
    routingNumber: z.string().optional(),
    swiftCode: z.string().optional(),
  }),
  [PayoutMethodType.PAYPAL]: z.object({
    paypalEmail: z.string({ required_error: "paypalEmail is required" }).email(),
  }),
  [PayoutMethodType.STRIPE]: z.object({
    stripeAccountId: z.string({ required_error: "stripeAccountId is required" }).min(1),
  }),
};

const validateAccountDetailsAgainstType = (
  data: { type: PayoutMethodType; accountDetails: unknown },
  ctx: z.RefinementCtx
) => {
  const schema = payoutAccountSchemas[data.type];
  const result = schema.safeParse(data.accountDetails);
  if (!result.success) {
    result.error.issues.forEach((issue) => {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: ["accountDetails", ...issue.path],
      });
    });
  }
};

const createPayoutMethodValidationSchema = z.object({
  body: z
    .object({
      type: z.nativeEnum(PayoutMethodType, { required_error: "type is required" }),
      provider: z.string().trim().max(100).optional(),
      accountDetails: z.record(z.string(), z.any(), { required_error: "accountDetails is required" }),
      accountName: z.string().trim().max(200).optional(),
    })
    .superRefine(validateAccountDetailsAgainstType),
});

const updatePayoutMethodValidationSchema = z.object({
  body: z
    .object({
      type: z.nativeEnum(PayoutMethodType).optional(),
      provider: z.string().trim().max(100).optional(),
      accountDetails: z.record(z.string(), z.any()).optional(),
      accountName: z.string().trim().max(200).optional(),
    })
    .refine((data) => !data.accountDetails || data.type, {
      message: "type is required when updating accountDetails",
      path: ["type"],
    })
    .superRefine((data, ctx) => {
      if (data.accountDetails && data.type) {
        validateAccountDetailsAgainstType(
          { type: data.type, accountDetails: data.accountDetails },
          ctx
        );
      }
    }),
});

export const payoutMethodValidation = {
  createPayoutMethodValidationSchema,
  updatePayoutMethodValidationSchema,
};
