import { z } from "zod";
import { DurationUnit } from "./package.interface";

const createPackageValidationSchema = z.object({
  body: z.object({
    packageName: z.string({ required_error: "packageName is required" }).min(1),
    description: z.string().max(1000).optional(),
    price: z.coerce.number({ required_error: "price is required" }).min(0),
    durationValue: z.coerce.number({ required_error: "durationValue is required" }).min(1),
    durationUnit: z.nativeEnum(DurationUnit, { required_error: "durationUnit is required" }),
    isActive: z.boolean().optional(),
  }),
});

const updatePackageValidationSchema = z.object({
  body: z.object({
    packageName: z.string().min(1).optional(),
    description: z.string().max(1000).optional(),
    price: z.coerce.number().min(0).optional(),
    durationValue: z.coerce.number().min(1).optional(),
    durationUnit: z.nativeEnum(DurationUnit).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const packageValidation = {
  createPackageValidationSchema,
  updatePackageValidationSchema,
};
