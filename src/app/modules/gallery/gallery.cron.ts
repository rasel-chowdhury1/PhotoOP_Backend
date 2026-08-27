import cron from "node-cron";
import mongoose from "mongoose";
import Gallery from "./gallery.model";
import SnapperProfile from "../snapperProfile/snapperProfile.model";
import { StoragePlan } from "../snapperProfile/snapperProfile.interface";
import { STORAGE_PLAN_CONFIG } from "../snapperProfile/snapperProfile.constant";
import { storage } from "../../utils/storage";
import { bytesToGB } from "../../utils/storage/units";

// purges one gallery's pictures that are older than its owning snapper's current
// retention window. Deletes from storage FIRST — if that fails, the DB is left
// untouched so a failed delete never orphans a "deleted" picture that's still on disk.
const purgeExpiredDeliveryAssetsForGallery = async (
  gallery: InstanceType<typeof Gallery>
): Promise<number> => {
  const snapperProfile = await SnapperProfile.findOne({ userId: gallery.snapperId });
  if (!snapperProfile) {
    console.warn(`[gallery.cron] no SnapperProfile for gallery ${gallery._id} (snapperId ${gallery.snapperId}), skipping`);
    return 0;
  }

  const retentionDays =
    STORAGE_PLAN_CONFIG[snapperProfile.storagePlan as StoragePlan]?.retentionDays ??
    STORAGE_PLAN_CONFIG[StoragePlan.FREE].retentionDays;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const expiredPictures = gallery.pictures.filter((picture) => picture.uploadedAt < cutoff);
  if (expiredPictures.length === 0) {
    return 0;
  }

  const expiredKeys = expiredPictures.map((picture) => picture.key);

  try {
    await storage.deleteMany(expiredKeys);
  } catch (error) {
    console.error(
      `[gallery.cron] failed to delete ${expiredKeys.length} storage object(s) for gallery ${gallery._id}, skipping DB mutation:`,
      error
    );
    return 0;
  }

  const freedBytes = expiredPictures.reduce((sum, picture) => sum + picture.size, 0);
  const freedGB = bytesToGB(freedBytes);
  const expiredKeySet = new Set(expiredKeys);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      gallery.pictures = gallery.pictures.filter((picture) => !expiredKeySet.has(picture.key));
      gallery.totalPictures = gallery.pictures.length;
      gallery.storageSize -= freedBytes;
      await gallery.save({ session });

      await SnapperProfile.updateOne(
        { _id: snapperProfile._id },
        { $inc: { storageUsedGB: -freedGB } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return expiredPictures.length;
};

export const purgeExpiredDeliveryAssets = async (): Promise<number> => {
  const galleries = await Gallery.find({ "pictures.0": { $exists: true } });

  let totalPurged = 0;
  for (const gallery of galleries) {
    try {
      totalPurged += await purgeExpiredDeliveryAssetsForGallery(gallery);
    } catch (error) {
      console.error(`[gallery.cron] purgeExpiredDeliveryAssets failed for gallery ${gallery._id}:`, error);
    }
  }

  return totalPurged;
};

// runs daily at 3am
export const startPurgeExpiredDeliveryAssetsCron = () => {
  cron.schedule("0 3 * * *", async () => {
    try {
      const purgedCount = await purgeExpiredDeliveryAssets();
      if (purgedCount > 0) {
        console.log(`[gallery.cron] purged ${purgedCount} expired delivery asset(s)`);
      }
    } catch (error) {
      console.error("[gallery.cron] purgeExpiredDeliveryAssets failed:", error);
    }
  });

  console.log("[gallery.cron] purge-expired-delivery-assets cron registered (daily @ 3am)");
};
