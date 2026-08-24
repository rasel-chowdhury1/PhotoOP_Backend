import { Router } from "express";
import auth from "../../middleware/auth";
import validateRequest from "../../middleware/validateRequest";
import { handleDeliveryUpload, resolveDeliveryUploadContext } from "../../middleware/deliveryUpload";
import { bookingController } from "./booking.controller";
import { bookingValidation } from "./booking.validation";
import { USER_ROLE } from "../user/user.constants";

export const bookingRoutes = Router();

bookingRoutes
  .post(
    "/create",
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    validateRequest(bookingValidation.createBookingValidationSchema),
    bookingController.createBooking
  )

  .post(
     "/quick-shoot-request",
      auth("user"), // only booking owner can create the request
      // validateRequest(bookingValidation.createQuickShootRequestValidationSchema),
      bookingController.createQuickShootRequest
    )

  .patch(
    "/quick-shoot-request/:id/accept",
    auth("snapper", "admin"), // snapper or admin can accept
    bookingController.acceptQuickShootRequest
  )

  .patch(
    "/quick-shoot-request/:id/reject",
    auth("snapper", "admin"), // snapper or admin can reject
    validateRequest(bookingValidation.rejectQuickShootRequestValidationSchema),
    bookingController.rejectQuickShootRequest
  )

  .get(
      "/quick-shoot-request/my-requests",
      auth("user", "snapper", "admin"),
      bookingController.getMyQuickShootRequests
    )

  .get(
    "/my-bookings",
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    bookingController.getMyBookingsAsCustomer
  )

  .get(
      "/snapper-stats",
      auth("snapper"),
      bookingController.getSnapperBookingStats
    )

  .get(
  "/my-recent-bookings",
  auth("user", "snapper"),
  bookingController.getMyRecentBookings
)

  .get(
    "/snapper-bookings",
    auth(USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    bookingController.getMyBookingsAsSnapper
  )

  .get(
    "/all", 
    // auth(USER_ROLE.ADMIN), 
    bookingController.getAllBookings
  )

  .get(
    "/:id",
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    bookingController.getBookingById
  )

  .patch(
    "/:id/status",
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    validateRequest(bookingValidation.updateBookingStatusValidationSchema),
    bookingController.updateBookingStatus
  )

  .post(
    "/:id/delivery",
    auth(USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    validateRequest(bookingValidation.submitDeliveryValidationSchema),
    bookingController.submitDelivery
  )

  .patch(
    "/:id/delivery/accept",
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    bookingController.acceptDelivery
  )

  .patch(
    "/:id/delivery/reject",
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    validateRequest(bookingValidation.rejectDeliveryValidationSchema),
    bookingController.rejectDelivery
  )

  .get(
    "/:id/delivery/history",
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    bookingController.getDeliveryHistory
  )

  .post(
    "/:id/delivery/assets",
    auth(USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    resolveDeliveryUploadContext,
    handleDeliveryUpload,
    bookingController.uploadDeliveryAssets
  )

  // wildcard must stay last so it doesn't swallow the more specific delivery routes above
  .get(
    "/:id/delivery/assets/*",
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    bookingController.serveDeliveryAsset
  );
