import { z } from "zod";
import { ServiceChargeType } from "./serviceCharge.interface";

const createServiceChargeValidationSchema = z.object({
  body: z.object({
    name: z.string({ required_error: "Name is required" }).trim().min(1),
    type: z.nativeEnum(ServiceChargeType, {
      required_error: "Type is required",
    }),
    value: z.number({ required_error: "Value is required" }).min(0),
    isActive: z.boolean().optional(),
  }),
});

const updateServiceChargeValidationSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).optional(),
    type: z.nativeEnum(ServiceChargeType).optional(),
    value: z.number().min(0).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const ServiceChargeValidations = {
  createServiceChargeValidationSchema,
  updateServiceChargeValidationSchema,
};