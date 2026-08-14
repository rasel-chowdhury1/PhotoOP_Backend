/**
 * One-off, idempotent migration for the booking delivery refactor.
 *
 * Run with: npm run migrate:booking-delivery
 *
 * 1. Renames the legacy `deliveryMethod` field to `preferredDeliveryMethod` on all
 *    bookings (a no-op $rename on bookings that don't have the old field).
 * 2. For bookings with a non-empty legacy `externalDeliveryLink` and no
 *    `currentDeliveryId` yet, creates a Delivery doc (attempt 1) from that legacy data
 *    and links it via `currentDeliveryId`/`deliveryAttempts`.
 * 3. Unsets the now-unused legacy `externalDeliveryLink`/`qrCodeFromSnapper` fields.
 *
 * Safe to re-run: step 1 is a no-op on already-renamed docs, step 2 is guarded by the
 * `currentDeliveryId` check, step 3 is a no-op on docs that no longer have those fields.
 */
import mongoose, { Types } from "mongoose";
import config from "../app/config";
import Booking from "../app/modules/booking/booking.model";
import Delivery from "../app/modules/booking/delivery.model";
import {
  BookingStatus,
  DELIVERY_METHODS,
  DeliveryStatus,
} from "../app/modules/booking/booking.interface";

// shape of a booking document as it may still exist in the raw collection, pre-migration
interface LegacyBookingDoc {
  _id: Types.ObjectId;
  bookingId?: string;
  snapperId: Types.ObjectId;
  userId: Types.ObjectId;
  status: BookingStatus;
  deliveryMethod?: string;
  externalDeliveryLink?: string;
  currentDeliveryId?: Types.ObjectId | null;
}

const deliveryStatusFromLegacyBookingStatus = (status: BookingStatus): DeliveryStatus => {
  if (status === BookingStatus.COMPLETED) return DeliveryStatus.ACCEPTED;
  if (status === BookingStatus.DELIVERY_REJECTED) return DeliveryStatus.REJECTED;
  return DeliveryStatus.PENDING;
};

async function migrate() {
  await mongoose.connect(config.database_url as string);
  console.log("Connected. Running booking delivery migration...");

  // 1. rename deliveryMethod -> preferredDeliveryMethod (no-op where already renamed)
  const renameResult = await Booking.collection.updateMany(
    { deliveryMethod: { $exists: true } },
    { $rename: { deliveryMethod: "preferredDeliveryMethod" } }
  );

  // 2. backfill a Delivery doc for legacy externalDeliveryLink bookings
  const legacyBookings = (await Booking.collection
    .find({
      externalDeliveryLink: { $exists: true, $ne: "" },
      currentDeliveryId: { $exists: false },
    })
    .toArray()) as unknown as LegacyBookingDoc[];

  let deliveriesCreated = 0;

  for (const legacy of legacyBookings) {
    const delivery = await Delivery.create({
      bookingId: legacy._id,
      snapperId: legacy.snapperId,
      userId: legacy.userId,
      attempt: 1,
      deliveryMethod: DELIVERY_METHODS.EXTERNAL_LINK,
      externalDeliveryLink: legacy.externalDeliveryLink,
      description: "Migrated from legacy delivery link",
      submittedBy: legacy.snapperId,
      submittedAt: new Date(),
      status: deliveryStatusFromLegacyBookingStatus(legacy.status),
    });

    await Booking.collection.updateOne(
      { _id: legacy._id },
      { $set: { currentDeliveryId: delivery._id, deliveryAttempts: 1 } }
    );

    deliveriesCreated += 1;
  }

  // 3. drop the now-unused legacy fields from every booking
  const unsetResult = await Booking.collection.updateMany(
    {},
    { $unset: { externalDeliveryLink: "", qrCodeFromSnapper: "" } }
  );

  console.log("Migration complete:", {
    renamed: renameResult.modifiedCount,
    deliveriesCreated,
    unset: unsetResult.modifiedCount,
  });

  await mongoose.disconnect();
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
