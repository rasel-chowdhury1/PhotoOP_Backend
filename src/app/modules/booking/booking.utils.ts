// ==========================
// Tab → Mongo filter mapping
// ==========================

import { BookingStatus, CustomerTab, SnapperTab } from "./booking.interface";


// ASSUMPTION: adjust these to match your actual BookingStatus enum values
// e.g. BookingStatus.PENDING, BookingStatus.ACCEPTED, BookingStatus.DELIVERED, etc.
export const getCustomerTabFilter = (tab: CustomerTab): Record<string, any> => {
  const now = new Date();

  switch (tab) {
    case "requests":
      // booking sent, snapper hasn't accepted/rejected yet
      return { status: BookingStatus.PENDING };

    case "upcoming":
      // accepted, shoot date is in the future
      return {
        status: BookingStatus.ACCEPTED,
        bookingDate: { $gte: now },
      };

    case "in_progress":
      // accepted, shoot date has arrived/passed, but shoot not marked completed yet
      return {
        status: BookingStatus.ACCEPTED,
        bookingDate: { $lt: now },
        shootCompletedAt: null,
      };

    case "deliveries":
      // shoot done, waiting on delivery / customer review of delivered files
      return {
        shootCompletedAt: { $ne: null },
        deliveredAt: { $ne: null },
        completedAt: null,
      };

    case "completed":
      return { status: BookingStatus.COMPLETED };

    case "cancelled":
      return { status: { $in: [BookingStatus.CANCELLED, BookingStatus.REJECTED] } };

    default:
      return {};
  }
};

export const getSnapperTabFilter = (tab: SnapperTab): Record<string, any> => {
  const now = new Date();

  switch (tab) {
    case "new_requests":
      // customer sent a booking, snapper hasn't responded
      return { status: BookingStatus.PENDING };

    case "upcoming":
      return {
        status: BookingStatus.ACCEPTED,
        bookingDate: { $gte: now },
      };

    case "in_progress":
      return {
        status: BookingStatus.ACCEPTED,
        bookingDate: { $lt: now },
        shootCompletedAt: null,
      };

    case "pending_delivery":
      // shoot completed, snapper still needs to deliver / delivery not yet accepted by customer
      return {
        shootCompletedAt: { $ne: null },
        deliveredAt: null,
      };

    case "completed":
      return { status: BookingStatus.COMPLETED };

    case "cancelled":
      return { status: { $in: [BookingStatus.CANCELLED, BookingStatus.REJECTED] } };

    default:
      return {};
  }
};