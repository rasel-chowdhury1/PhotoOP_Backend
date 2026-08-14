import fs from "fs/promises";
import path from "path";
import cron from "node-cron";
import config from "../../config";
import { storage } from "../../utils/storage";
import Delivery from "./delivery.model";
import { bookingService } from "./booking.service";

// runs on the hour, every hour: sweeps DELIVERY_PENDING bookings whose autoAcceptAt
// has passed and auto-completes them (customer never responded within 7 days)
export const startAutoAcceptDeliveriesCron = () => {
  cron.schedule("0 * * * *", async () => {
    try {
      const acceptedCount = await bookingService.autoAcceptOverdueDeliveries();
      if (acceptedCount > 0) {
        console.log(`[booking.cron] auto-accepted ${acceptedCount} overdue delivery(ies)`);
      }
    } catch (error) {
      console.error("[booking.cron] autoAcceptOverdueDeliveries failed:", error);
    }
  });

  console.log("[booking.cron] auto-accept-deliveries cron registered (hourly)");
};

const ORPHAN_MAX_AGE_MS = 48 * 60 * 60 * 1000;

// walking UPLOAD_ROOT/deliveries directly with fs — this enumeration is inherently
// local-disk-shaped (a future S3 driver would need a very different, paginated listing
// approach), so it isn't part of the swappable IStorageAdapter interface
const walkFiles = async (dir: string): Promise<string[]> => {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return []; // directory doesn't exist yet — nothing to clean
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
};

// staged uploads that are never submitted (via POST .../delivery, which copies their
// {url,key} into a Delivery doc) would otherwise pile up forever. Anything older than
// 48h whose key isn't referenced by any Delivery.assets[].key gets deleted.
export const cleanupOrphanedAssets = async (): Promise<number> => {
  const dryRun = process.env.CLEANUP_ORPHANED_ASSETS_DRY_RUN === "true";
  const deliveriesRoot = path.join(config.upload_root, "deliveries");
  const allFiles = await walkFiles(deliveriesRoot);

  const referencedKeys = new Set<string>();
  const deliveries = await Delivery.find({}, { assets: 1 });
  deliveries.forEach((delivery) => {
    delivery.assets.forEach((asset) => {
      if (asset.key) referencedKeys.add(asset.key);
    });
  });

  const now = Date.now();
  const orphanKeys: string[] = [];

  for (const filePath of allFiles) {
    const key = path.relative(config.upload_root, filePath).split(path.sep).join("/");
    if (referencedKeys.has(key)) continue;

    const stats = await fs.stat(filePath);
    if (now - stats.mtimeMs < ORPHAN_MAX_AGE_MS) continue;

    orphanKeys.push(key);
  }

  if (orphanKeys.length === 0) {
    console.log("[booking.cron] cleanupOrphanedAssets: no orphaned assets found");
    return 0;
  }

  if (dryRun) {
    console.log(
      `[booking.cron] cleanupOrphanedAssets (dry run): would delete ${orphanKeys.length} orphaned file(s)`,
      orphanKeys
    );
    return orphanKeys.length;
  }

  await storage.deleteMany(orphanKeys);
  console.log(`[booking.cron] cleanupOrphanedAssets: deleted ${orphanKeys.length} orphaned file(s)`);
  return orphanKeys.length;
};

// runs daily at 3am
export const startCleanupOrphanedAssetsCron = () => {
  cron.schedule("0 3 * * *", async () => {
    try {
      await cleanupOrphanedAssets();
    } catch (error) {
      console.error("[booking.cron] cleanupOrphanedAssets failed:", error);
    }
  });

  console.log("[booking.cron] cleanup-orphaned-assets cron registered (daily @ 3am)");
};
