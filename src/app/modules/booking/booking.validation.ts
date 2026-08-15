import { z } from "zod";
import {
  AddOnKey,
  BookingStatus,
  DELIVERY_METHODS,
  RejectionCategory,
} from "./booking.interface";

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const timeField = (fieldName: string) =>
  z
    .string({ required_error: `${fieldName} is required` })
    .regex(TIME_REGEX, { message: `${fieldName} must be in HH:mm 24-hour format` });

const createBookingValidationSchema = z.object({
  body: z
    .object({
      packageId: z.string({ required_error: "packageId is required" }),
      fullName: z.string({ required_error: "fullName is required" }).min(1),
      email: z.string({ required_error: "email is required" }).email(),
      phoneNumber: z.string({ required_error: "phoneNumber is required" }).min(1),
      notes: z.string().max(1000).optional(),
      location: z.string({ required_error: "location is required" }).min(1),
      bookingDate: z.coerce.date({ required_error: "bookingDate is required" }),
      startTime: timeField("startTime"),
      endTime: timeField("endTime"),
      selectedAddOnKeys: z.array(z.nativeEnum(AddOnKey)).optional(),
      preferredDeliveryMethod: z.nativeEnum(DELIVERY_METHODS).optional(),
    })
    .refine((data) => data.startTime < data.endTime, {
      message: "startTime must be earlier than endTime",
      path: ["endTime"],
    }),
});

const updateBookingStatusValidationSchema = z.object({
  body: z.object({
    status: z.nativeEnum(BookingStatus, { required_error: "status is required" }),
    note: z.string().max(500).optional(),
  }),
});

const submitDeliveryValidationSchema = z.object({
  body: z
    .object({
      deliveryMethod: z.nativeEnum(DELIVERY_METHODS, {
        required_error: "deliveryMethod is required",
      }),
      // IN_APP_GALLERY: the gallery the snapper already uploaded pictures into via
      // POST /:id/delivery/assets — the pictures themselves are never submitted here
      galleryId: z.string().optional(),
      externalDeliveryLink: z.string().url().optional(),
      linkPassword: z.string().optional(),
      linkExpiresAt: z.coerce.date().optional(),
      coverImage: z.string().optional(),
      description: z
        .string({ required_error: "description is required" })
        .trim()
        .min(10, { message: "description must be at least 10 characters" })
        .max(1000),
    })
    .refine(
      (data) =>
        data.deliveryMethod !== DELIVERY_METHODS.EXTERNAL_LINK || !!data.externalDeliveryLink,
      {
        message: "externalDeliveryLink is required when deliveryMethod is EXTERNAL_LINK",
        path: ["externalDeliveryLink"],
      }
    )
    .refine((data) => data.deliveryMethod !== DELIVERY_METHODS.IN_APP_GALLERY || !!data.galleryId, {
      message: "galleryId is required when deliveryMethod is IN_APP_GALLERY",
      path: ["galleryId"],
    }),
});

const rejectDeliveryValidationSchema = z.object({
  body: z.object({
    rejectionReason: z
      .string({ required_error: "rejectionReason is required" })
      .trim()
      .min(1)
      .max(500),
    rejectionCategory: z.nativeEnum(RejectionCategory, {
      required_error: "rejectionCategory is required",
    }),
  }),
});

export const bookingValidation = {
  createBookingValidationSchema,
  updateBookingStatusValidationSchema,
  submitDeliveryValidationSchema,
  rejectDeliveryValidationSchema,
};
