import { StoragePlan } from "./snapperProfile.interface";

// single source of truth for what each storage plan grants — reused by the
// plan-purchase/upgrade handler, the plan-expiry downgrade cron, and the
// delivery-asset retention/purge cron, so they can never drift apart
export const STORAGE_PLAN_CONFIG: Record<
  StoragePlan,
  { storageLimitGB: number; retentionDays: number; priceUSD: number }
> = {
  [StoragePlan.FREE]: { storageLimitGB: 5, retentionDays: 30, priceUSD: 0 },
  [StoragePlan.PRO_50]: { storageLimitGB: 50, retentionDays: 90, priceUSD: 9 },
  [StoragePlan.PRO_200]: { storageLimitGB: 200, retentionDays: 365, priceUSD: 19 },
};
