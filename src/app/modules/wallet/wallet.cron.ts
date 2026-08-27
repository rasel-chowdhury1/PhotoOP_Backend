import cron from "node-cron";
import mongoose from "mongoose";
import Booking from "../booking/booking.model";
import { BookingStatus, PaymentStatus } from "../booking/booking.interface";
import config from "../../config";
import { walletService } from "./wallet.service";

// releases every booking earning whose settlement hold (config.withdrawal.holdDays) has
// elapsed: pendingBalance -> availableBalance. One booking, one transaction — a failure
// on one booking never blocks the rest of the sweep.
export const releasePendingEarnings = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - config.withdrawal.holdDays * 24 * 60 * 60 * 1000);

  const eligibleBookings = await Booking.find({
    status: BookingStatus.COMPLETED,
    paymentStatus: PaymentStatus.PAID,
    earningsCreditedAt: { $ne: null },
    earningsReleasedAt: null,
    completedAt: { $lte: cutoff },
  }).select("_id");

  let releasedCount = 0;

  for (const booking of eligibleBookings) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await walletService.releaseBookingEarning(booking._id, session);
      });
      releasedCount += 1;
    } catch (error) {
      console.error(`[wallet.cron] failed to release earning for booking ${booking._id}:`, error);
    } finally {
      await session.endSession();
    }
  }

  return releasedCount;
};

// runs hourly, matching the auto-accept-deliveries cron's cadence
export const startReleasePendingEarningsCron = () => {
  cron.schedule("0 * * * *", async () => {
    try {
      const releasedCount = await releasePendingEarnings();
      if (releasedCount > 0) {
        console.log(`[wallet.cron] released ${releasedCount} pending earning(s) to available balance`);
      }
    } catch (error) {
      console.error("[wallet.cron] releasePendingEarnings failed:", error);
    }
  });

  console.log("[wallet.cron] release-pending-earnings cron registered (hourly)");
};
