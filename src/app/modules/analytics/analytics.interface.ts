export interface IMonthlyEarning {
  month: string; // "Jan".."Dec"
  monthNumber: number; // 1-12
  earnings: number;
}

export interface IDailyRevenue {
  date: string; // "YYYY-MM-DD", UTC
  day: string; // "Sun".."Sat"
  revenue: number;
}

export interface ISnapperAnalytics {
  lifetimeEarnings: number;
  availableBalance: number;
  // earned but still inside the settlement hold window (config.withdrawal.holdDays) —
  // not yet withdrawable. Sourced from SnapperWallet.pendingBalance (see wallet.service.ts).
  pendingBalance: number;
  // always Jan->Dec of the current year, zero-filled for months with no earnings
  monthlyEarnings: IMonthlyEarning[];
  // always exactly 7 entries (today and the 6 days before it), oldest first,
  // zero-filled for days with no revenue
  dailyRevenue: IDailyRevenue[];
  payoutHistory: unknown[];
}

export interface IRecentUser {
  _id: unknown;
  fullName: string;
  email: string;
  role: string;
  profileImage: string;
  status: string;
  adminApproval: string;
  createdAt: Date;
}

export interface IAdminOverview {
  totalUsers: number; // role === "user" (customers) only
  totalSnappers: number; // role === "snapper"
  activeBookings: number; // accepted..delivery-in-progress, not yet closed out
  // true platform total: gross totalPrice over COMPLETED + PAID bookings, plus
  // storageRevenue below — see bookingRevenue/storageRevenue for the breakdown
  totalRevenue: number;
  bookingRevenue: number; // gross totalPrice, COMPLETED + PAID bookings only
  storageRevenue: number; // SUCCEEDED STORAGE_UPGRADE payments — snapper-to-platform, no split
  pendingApproval: number; // snappers awaiting admin approval
  recentUsers: IRecentUser[]; // latest 6 users, any role
}

export interface IMonthlyBookingEarning {
  month: string; // "Jan".."Dec"
  monthNumber: number; // 1-12
  bookings: number; // bookings created that month
  earnings: number; // platform serviceFee revenue completed that month
}

export interface IMonthlySignups {
  month: string; // "Jan".."Dec"
  monthNumber: number; // 1-12
  count: number;
}

export interface IUserMonthlyOverview {
  year: number;
  role: string;
  // always Jan->Dec of `year`, zero-filled for months with no signups
  months: IMonthlySignups[];
}

export interface IMonthlyEarningBreakdown {
  month: number; // 1-12
  totalRevenue: number; // gross totalPrice, COMPLETED + PAID bookings only
  adminCommission: number; // platform's own cut (serviceFee)
  snapperEarning: number; // totalRevenue - adminCommission, owed to the snapper
  totalBookings: number;
}

export interface IYearlyEarningOverview {
  year: number;
  // always Jan->Dec (index 0 = month 1), zero-filled for months with no completed bookings
  months: IMonthlyEarningBreakdown[];
}

// the Payment record (Stripe transaction) behind one booking, if one was found —
// null for a booking that somehow has no matching Payment (shouldn't happen for a
// COMPLETED + PAID booking, but the join is a best-effort lookup, not a hard join)
export interface IAdminEarningPayment {
  _id: unknown;
  paymentNumber: string;
  amount: number;
  currency: string;
  gateway: string;
  status: string;
  transactionId: string | null;
  checkoutSessionId: string | null;
  paidAt: Date | null;
}

// one booking behind the totals in IAdminLifetimeEarnings
export interface IAdminEarningRecord {
  _id: unknown;
  bookingId: string;
  userId: unknown; // populated: fullName, email, profileImage
  snapperId: unknown; // populated: fullName, email, profileImage
  packageId: unknown; // populated: packageName, price
  totalPrice: number;
  serviceFee: number;
  snapperEarning: number; // totalPrice - serviceFee
  completedAt: Date | null;
  payment: IAdminEarningPayment | null;
}

// one SUCCEEDED STORAGE_UPGRADE payment behind storageRevenue in IAdminLifetimeEarnings —
// unlike a booking, the full amount is platform revenue (no snapper split)
export interface IAdminStoragePayment {
  _id: unknown;
  paymentNumber: string;
  snapperId: unknown; // populated: fullName, email, profileImage — the buyer (Payment.userId)
  storagePlan: string | null;
  durationMonths: number | null;
  amount: number;
  currency: string;
  gateway: string;
  transactionId: string | null;
  paidAt: Date | null;
}

// all-time equivalent of IMonthlyEarningBreakdown, with no month/year grouping — plus
// the actual bookings behind the totals, paginated (see analytics.service.ts)
export interface IAdminLifetimeEarnings {
  totalRevenue: number; // gross totalPrice, COMPLETED + PAID bookings only
  adminCommission: number; // platform's own cut (serviceFee) — booking revenue only
  snapperEarning: number; // totalRevenue - adminCommission, owed to snappers
  totalBookings: number;
  bookings: IAdminEarningRecord[];

  // storage-plan upgrade revenue (Payment.paymentType === STORAGE_UPGRADE) — a separate
  // snapper-to-platform revenue stream that never touches a Booking, so it's additive
  // to (not folded into) the booking figures above
  storageRevenue: number;
  totalStoragePayments: number;
  storagePayments: IAdminStoragePayment[];
  storagePaymentsMeta: { page: number; limit: number; total: number; totalPage: number };

  // true platform total across both revenue streams
  grandTotalRevenue: number;
}

// booking volume by status, one month — grouped by createdAt (when the booking was
// placed), matching getAdminBookingEarningOverview's existing "bookings created that
// month" convention, not bookingDate (when the shoot happens) or completedAt
export interface IMonthlyBookingOverview {
  month: number; // 1-12
  total: number;
  pending: number;
  accepted: number;
  upcoming: number;
  shootCompleted: number;
  deliveryPending: number;
  deliveryRejected: number;
  completed: number;
  cancelled: number;
  rejected: number;
  disputed: number;
  refunded: number;
}

export interface IYearlyBookingOverview {
  year: number;
  // always Jan->Dec (index 0 = month 1), zero-filled for months with no bookings
  months: IMonthlyBookingOverview[];
}
