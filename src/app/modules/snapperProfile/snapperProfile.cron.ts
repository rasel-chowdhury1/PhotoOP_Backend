import cron from "node-cron";
import SnapperProfile from "./snapperProfile.model";
import { StoragePlan } from "./snapperProfile.interface";
import { STORAGE_PLAN_CONFIG } from "./snapperProfile.constant";

// downgrades any snapper whose paid plan has expired back to FREE. Only storagePlan +
// storageLimitGB move here — storageUsedGB is left untouched (see the retention/purge
// cron in gallery.cron.ts for the only other place that adjusts it)
export const downgradeExpiredPlans = async (): Promise<number> => {
  const freeConfig = STORAGE_PLAN_CONFIG[StoragePlan.FREE];

  const result = await SnapperProfile.updateMany(
    {
      storagePlan: { $ne: StoragePlan.FREE },
      storageExpiresAt: { $lt: new Date() },
    },
    {
      $set: {
        storagePlan: StoragePlan.FREE,
        storageLimitGB: freeConfig.storageLimitGB,
      },
    }
  );

  return result.modifiedCount;
};

// runs daily at 3am
export const startDowngradeExpiredPlansCron = () => {
  cron.schedule("0 3 * * *", async () => {
    try {
      const downgradedCount = await downgradeExpiredPlans();
      if (downgradedCount > 0) {
        console.log(`[snapperProfile.cron] downgraded ${downgradedCount} expired storage plan(s) to FREE`);
      }
    } catch (error) {
      console.error("[snapperProfile.cron] downgradeExpiredPlans failed:", error);
    }
  });

  console.log("[snapperProfile.cron] downgrade-expired-plans cron registered (daily @ 3am)");
};
