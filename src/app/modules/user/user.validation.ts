import { z } from 'zod';
import { AdminApprovalStatus, UserRole, UserStatus } from './user.interface';
import { calculateAge } from './user.utils';

const guardianSchema = z.object({
  name: z.string().optional(),
  email: z.string().email({ message: 'Invalid guardian email format' }).optional(),
  relation: z.string().optional(),
});

const socialLinksSchema = z.object({
  instagram: z.string().url({ message: 'Invalid Instagram URL' }).optional().or(z.literal('')),
  tiktok: z.string().url({ message: 'Invalid TikTok URL' }).optional().or(z.literal('')),
  youtube: z.string().url({ message: 'Invalid YouTube URL' }).optional().or(z.literal('')),
  facebook: z.string().url({ message: 'Invalid Facebook URL' }).optional().or(z.literal('')),
  website: z.string().url({ message: 'Invalid website URL' }).optional().or(z.literal('')),
});

const createUserValidationSchema = z.object({
  body: z
    .object({
      fullName: z.string().min(1, { message: 'Full name is required' }),
      email: z.string().email({ message: 'Invalid email format' }),
      password: z
        .string()
        .min(6, { message: 'Password must be at least 6 characters long' }),
      role: z.nativeEnum(UserRole, { required_error: 'role is required' }),
      dateOfBirth: z.coerce.date({ required_error: 'dateOfBirth is required' }),
      countryCode: z.string().optional(),
      phoneNumber: z.string().optional(),
      address: z.string().optional(),
      guardian: guardianSchema.optional(),

      // required only when role === 'snapper' (see refine below)
      identityImage: z.string().optional(),
      hourlyRate: z.coerce.number().min(0).optional(),
      specialties: z.array(z.string()).optional(),
      badges: z.array(z.string()).optional(),
      about: z.string().max(1000).optional(),
    })
    .superRefine((data, ctx) => {
      const age = calculateAge(data.dateOfBirth);
      if (age >= 16 && age <= 18) {
        if (!data.guardian?.name) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['guardian', 'name'],
            message: "guardian name is required for users aged 16-18",
          });
        }
        if (!data.guardian?.email) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['guardian', 'email'],
            message: "guardian email is required for users aged 16-18",
          });
        }
      }

      if (data.role === UserRole.SNAPPER) {
        if (!data.identityImage) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['identityImage'],
            message: 'identityImage is required for snapper accounts',
          });
        }
        if (data.hourlyRate === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['hourlyRate'],
            message: 'hourlyRate is required for snapper accounts',
          });
        }
      }
    }),
});

const updateMyProfileValidationSchema = z.object({
  body: z.object({
    fullName: z.string().min(1).optional(),
    profileImage: z.string().optional(),
    coverPhoto: z.string().optional(),
    countryCode: z.string().optional(),
    phoneNumber: z.string().optional(),
    address: z.string().optional(),
    location: z
      .object({
        type: z.literal('Point').optional(),
        coordinates: z.tuple([z.number(), z.number()]),
      })
      .optional(),
    socialLinks: socialLinksSchema.optional(),
  }),
});

const updateUserStatusValidationSchema = z.object({
  body: z.object({
    status: z.nativeEnum(UserStatus, { required_error: 'status is required' }),
  }),
});

const updateAdminApprovalValidationSchema = z.object({
  body: z.object({
    status: z.nativeEnum(AdminApprovalStatus, { required_error: 'status is required' }),
    reason: z.string().optional(),
  }),
});

export const userValidation = {
  createUserValidationSchema,
  updateMyProfileValidationSchema,
  updateUserStatusValidationSchema,
  updateAdminApprovalValidationSchema,
};
