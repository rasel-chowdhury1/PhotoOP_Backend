import { z } from 'zod';

// NOTE: this is parsed manually inside guardian.service.ts (not via the standard
// validateRequest middleware), since that middleware forwards ZodErrors to
// globalErrorHandler, which only ever responds with JSON — this flow is a browser
// page and needs to re-render the HTML form with a friendly message instead.
const submitVerificationSchema = z
  .object({
    token: z.string().min(1, { message: 'Missing verification token' }),
    decision: z.enum(['approved', 'rejected'], {
      required_error: 'Please choose Approve or Decline',
      invalid_type_error: 'Please choose Approve or Decline',
    }),
    guardianName: z.string().optional(),
    relation: z.string().optional(),
    phoneNumber: z.string().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
    reason: z.string().max(500).optional(),
    idImage: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // decline requires no supporting info — only approval needs the full guardian profile
    if (data.decision !== 'approved') return;

    if (!data.guardianName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['guardianName'],
        message: 'Guardian full name is required',
      });
    }
    if (!data.relation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relation'],
        message: 'Relationship to child is required',
      });
    }
    if (!data.phoneNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phoneNumber'],
        message: 'Guardian phone number is required',
      });
    }
    if (!data.idImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['idImage'],
        message: 'A government-issued ID upload is required to approve this account',
      });
    }
  });

export const guardianValidation = {
  submitVerificationSchema,
};
