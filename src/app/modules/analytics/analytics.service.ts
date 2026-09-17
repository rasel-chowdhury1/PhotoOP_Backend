import { Types } from "mongoose";
import Booking from "../booking/booking.model";
import { BookingStatus, PaymentStatus } from "../booking/booking.interface";
import Withdraw from "../withdrawRequest/withdrawRequest.model";
import { User } from "../user/user.model";
import { AdminApprovalStatus, UserRole } from "../user/user.interface";
import Payment from "../payment/payment.model";
// aliased — booking.interface's PaymentStatus (PENDING/PAID/...) is already imported
// above under the same name and describes a completely different field (Booking.paymentStatus)
import { PaymentStatus as PaymentDocStatus, PaymentType } from "../payment/payment.interface";
import QueryBuilder from "../../builder/QueryBuilder";
import { walletService } from "../wallet/wallet.service";
import {
  IAdminEarningPayment,
  IAdminLifetimeEarnings,
  IAdminStoragePayment,
  IAdminOverview,
  IDailyRevenue,
  IMonthlyBookingEarning,
  IMonthlyBookingOverview,
  IMonthlyEarning,
  IMonthlyEarningBreakdown,
  ISnapperAnalytics,
  IUserMonthlyOverview,
  IYearlyBookingOverview,
  IYearlyEarningOverview,
} from "./analytics.interface";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// UTC-safe "YYYY-MM-DD" key — deliberately not date-fns' format(), which formats in the
// server's local timezone and would drift a day off from the UTC-grouped aggregation below
const toUtcDateKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;

// same "net earnings" definition already established in booking.service.ts's
// getSnapperBookingStats: totalPrice minus the platform's serviceFee, counted only for
// bookings that actually completed AND were paid — this is the one place that definition
// should live conceptually, but it's small enough that duplicating the $match/$sum shape
// here (rather than importing a booking.service internal) keeps the two modules decoupled
const EARNED_BOOKING_MATCH = (snapperId: Types.ObjectId) => ({
  snapperId,
  isDeleted: false,
  status: BookingStatus.COMPLETED,
  paymentStatus: PaymentStatus.PAID,
});

const getMonthlyEarnings = async (
  snapperId: Types.ObjectId,
  year: number
): Promise<IMonthlyEarning[]> => {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const rows = await Booking.aggregate([
    {
      $match: {
        ...EARNED_BOOKING_MATCH(snapperId),
        completedAt: { $gte: yearStart, $lt: yearEnd },
      },
    },
    {
      // $month is 1-12 and UTC-based by default (no timezone option given)
      $group: { _id: { $month: "$completedAt" }, total: { $sum: { $subtract: ["$totalPrice", "$serviceFee"] } } },
    },
  ]);

  const earningsByMonth = new Map<number, number>(rows.map((row) => [row._id, row.total]));

  return MONTH_LABELS.map((month, index) => ({
    month,
    monthNumber: index + 1,
    earnings: earningsByMonth.get(index + 1) ?? 0,
  }));
};

const getDailyRevenue = async (snapperId: Types.ObjectId, today: Date): Promise<IDailyRevenue[]> => {
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const rangeStart = new Date(todayStart);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 6);
  const rangeEnd = new Date(todayStart);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1); // exclusive upper bound

  const rows = await Booking.aggregate([
    {
      $match: {
        ...EARNED_BOOKING_MATCH(snapperId),
        completedAt: { $gte: rangeStart, $lt: rangeEnd },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt", timezone: "UTC" } },
        total: { $sum: { $subtract: ["$totalPrice", "$serviceFee"] } },
      },
    },
  ]);

  const revenueByDate = new Map<string, number>(rows.map((row) => [row._id, row.total]));

  const days: IDailyRevenue[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(rangeStart);
    day.setUTCDate(day.getUTCDate() + i);
    const dateKey = toUtcDateKey(day);
    days.push({
      date: dateKey,
      day: WEEKDAY_LABELS[day.getUTCDay()],
      revenue: revenueByDate.get(dateKey) ?? 0,
    });
  }

  return days;
};

// balance now lives on SnapperWallet (see wallet.service.ts), credited/debited
// atomically as bookings complete and withdrawals are requested/processed — this no
// longer re-derives it from Booking/Withdraw aggregates on every call, so there is
// exactly one place a snapper's balance can be computed, not two that could drift
const getSnapperAnalytics = async (snapperUserId: string): Promise<ISnapperAnalytics> => {
  const snapperId = new Types.ObjectId(snapperUserId);
  const now = new Date();

  const [wallet, monthlyEarnings, dailyRevenue, payoutHistory] = await Promise.all([
    walletService.getWalletSummary(snapperUserId),
    getMonthlyEarnings(snapperId, now.getUTCFullYear()),
    getDailyRevenue(snapperId, now),
    Withdraw.find({ snapperId }).sort({ requestedAt: -1 }),
  ]);

  return {
    lifetimeEarnings: wallet.totalEarned,
    availableBalance: wallet.availableBalance,
    pendingBalance: wallet.pendingBalance,
    monthlyEarnings,
    dailyRevenue,
    payoutHistory,
  };
};

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------

// still ongoing from the admin's point of view: not yet closed out (COMPLETED) and not
// dead (REJECTED/CANCELLED/REFUNDED). PENDING is excluded — that's an unconfirmed
// request, not yet an active booking.
const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.ACCEPTED,
  BookingStatus.UPCOMING,
  BookingStatus.SHOOT_COMPLETED,
  BookingStatus.DELIVERY_PENDING,
  BookingStatus.DELIVERY_REJECTED,
  BookingStatus.DISPUTED,
];

// platform-wide equivalent of analytics.service.ts's per-snapper EARNED_BOOKING_MATCH.
// "Revenue" here is the platform's own cut (serviceFee), not the full totalPrice most
// of which is owed to the snapper — mirrors how getLifetimeEarnings/getMonthlyEarnings
// above already define "earnings" as totalPrice minus serviceFee for the snapper side.
const PLATFORM_EARNED_BOOKING_MATCH = {
  isDeleted: false,
  status: BookingStatus.COMPLETED,
  paymentStatus: PaymentStatus.PAID,
};

const getAdminOverview = async (): Promise<IAdminOverview> => {
  const [
    totalUsers,
    totalSnappers,
    activeBookings,
    revenueAggregate,
    storageRevenueAggregate,
    pendingApproval,
    recentUsers,
  ] = await Promise.all([
      User.countDocuments({ role: UserRole.USER }),
      User.countDocuments({ role: UserRole.SNAPPER }),
      Booking.countDocuments({ isDeleted: false, status: { $in: ACTIVE_BOOKING_STATUSES } }),
      Booking.aggregate([
        { $match: PLATFORM_EARNED_BOOKING_MATCH },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),
      // storage-plan upgrades never touch a Booking, but they're still real
      // snapper-to-platform revenue — see the same aggregation in getAdminLifetimeEarnings
      Payment.aggregate([
        { $match: { paymentType: PaymentType.STORAGE_UPGRADE, status: PaymentDocStatus.SUCCEEDED } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      User.countDocuments({ role: UserRole.SNAPPER, adminApproval: AdminApprovalStatus.PENDING }),
      User.find({role: {$ne: "admin"}})
        .sort({ createdAt: -1 })
        .limit(6)
        .select("fullName email role profileImage status adminApproval createdAt"),
    ]);

  const bookingRevenue = revenueAggregate[0]?.total ?? 0;
  const storageRevenue = storageRevenueAggregate[0]?.total ?? 0;

  const paymenStroange = await Payment.find({ paymentType: PaymentType.STORAGE_UPGRADE, status: PaymentDocStatus.SUCCEEDED });

  

  return {
    totalUsers,
    totalSnappers,
    activeBookings,
    totalRevenue: bookingRevenue + storageRevenue,
    bookingRevenue,
    storageRevenue,
    pendingApproval,
    recentUsers: recentUsers as unknown as IAdminOverview["recentUsers"],
  };
};

const getAdminBookingEarningOverview = async (year: number): Promise<IMonthlyBookingEarning[]> => {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [bookingRows, earningRows] = await Promise.all([
    // booking volume trend: when bookings were placed
    Booking.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: yearStart, $lt: yearEnd } } },
      { $group: { _id: { $month: "$createdAt" }, count: { $sum: 1 } } },
    ]),
    // revenue trend: when bookings were actually completed and paid for
    Booking.aggregate([
      {
        $match: {
          ...PLATFORM_EARNED_BOOKING_MATCH,
          completedAt: { $gte: yearStart, $lt: yearEnd },
        },
      },
      { $group: { _id: { $month: "$completedAt" }, total: { $sum: "$serviceFee" } } },
    ]),
  ]);

  const bookingsByMonth = new Map<number, number>(bookingRows.map((row) => [row._id, row.count]));
  const earningsByMonth = new Map<number, number>(earningRows.map((row) => [row._id, row.total]));

  return MONTH_LABELS.map((month, index) => ({
    month,
    monthNumber: index + 1,
    bookings: bookingsByMonth.get(index + 1) ?? 0,
    earnings: earningsByMonth.get(index + 1) ?? 0,
  }));
};

// monthly signup trend for one role — User's own pre("aggregate") hook already
// unshifts an { isDeleted: { $ne: true } } match onto every aggregate pipeline, so
// this one doesn't need to repeat it
const getMonthlyUserOverview = async (
  role: UserRole,
  year: number
): Promise<IUserMonthlyOverview> => {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const rows = await User.aggregate([
    { $match: { role, createdAt: { $gte: yearStart, $lt: yearEnd } } },
    { $group: { _id: { $month: "$createdAt" }, count: { $sum: 1 } } },
  ]);

  const countByMonth = new Map<number, number>(rows.map((row) => [row._id, row.count]));

  const months = MONTH_LABELS.map((month, index) => ({
    month,
    monthNumber: index + 1,
    count: countByMonth.get(index + 1) ?? 0,
  }));


  return { year, role, months };
};

// full revenue/commission/snapper-earning breakdown per month, platform-wide, for one
// year — reuses PLATFORM_EARNED_BOOKING_MATCH so this can never define "completed and
// paid" differently than getAdminOverview/getAdminBookingEarningOverview do
const getEarningOverviewByYear = async (year?: number): Promise<IYearlyEarningOverview> => {
  const targetYear = year ?? new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(targetYear, 0, 1));
  const yearEnd = new Date(Date.UTC(targetYear + 1, 0, 1));

  const rows = await Booking.aggregate([
    {
      $match: {
        ...PLATFORM_EARNED_BOOKING_MATCH,
        completedAt: { $gte: yearStart, $lt: yearEnd },
      },
    },
    {
      $group: {
        _id: { $month: "$completedAt" },
        totalRevenue: { $sum: "$totalPrice" },
        adminCommission: { $sum: "$serviceFee" },
        snapperEarning: { $sum: { $subtract: ["$totalPrice", "$serviceFee"] } },
        totalBookings: { $sum: 1 },
      },
    },
  ]);

  const rowsByMonth = new Map(rows.map((row) => [row._id, row]));

  const months: IMonthlyEarningBreakdown[] = Array.from({ length: 12 }, (_, i) => {
    const row = rowsByMonth.get(i + 1);
    return {
      month: i + 1,
      totalRevenue: row?.totalRevenue ?? 0,
      adminCommission: row?.adminCommission ?? 0,
      snapperEarning: row?.snapperEarning ?? 0,
      totalBookings: row?.totalBookings ?? 0,
    };
  });

  return { year: targetYear, months };
};

// QueryBuilder.filter() only does exact-match on raw query keys, and its .search() can
// only reach fields on the Booking collection itself — neither can express a date range
// or search into a populated User/Payment doc. So all of it is built by hand here:
// snapperId/userId/from/to become a proper Mongo filter, and searchTerm is resolved
// against User (customer/snapper fullName+email) and Payment (transactionId) first,
// then folded into one $or on the Booking match alongside bookingId/fullName.
const buildLifetimeEarningsMatch = async (query: Record<string, unknown>) => {
  const match: Record<string, unknown> = { ...PLATFORM_EARNED_BOOKING_MATCH };

  if (query.snapperId) {
    match.snapperId = new Types.ObjectId(query.snapperId as string);
  }
  if (query.userId) {
    match.userId = new Types.ObjectId(query.userId as string);
  }

  const from = query.from ? new Date(query.from as string) : undefined;
  const to = query.to ? new Date(query.to as string) : undefined;
  if (from || to) {
    match.completedAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }

  const searchTerm = query.searchTerm as string | undefined;
  if (searchTerm) {
    const regex = { $regex: searchTerm, $options: "i" };

    const [matchingUserIds, matchingPaymentBookingIds] = await Promise.all([
      // covers both roles at once — Booking.userId and Booking.snapperId both ref User
      User.find({ $or: [{ fullName: regex }, { email: regex }] }).distinct("_id"),
      Payment.find({ transactionId: regex }).distinct("bookingId"),
    ]);

    match.$or = [
      { bookingId: regex },
      { fullName: regex }, // the customer's name snapshot on the Booking itself
      { userId: { $in: matchingUserIds } },
      { snapperId: { $in: matchingUserIds } },
      { _id: { $in: matchingPaymentBookingIds.filter(Boolean) } },
    ];
  }

  return match;
};

// storage-plan upgrades are a snapper-to-platform payment with no booking behind it, so
// they're matched directly against Payment rather than folded into buildLifetimeEarningsMatch.
// Reuses the same snapperId/from-to/searchTerm query params as the booking match above —
// "from/to" here means paidAt (there's no completedAt on a Payment), and searchTerm only
// has a transactionId to match against (no customer/snapper name snapshot to search)
const buildStoragePaymentsMatch = (query: Record<string, unknown>) => {
  const match: Record<string, unknown> = {
    paymentType: PaymentType.STORAGE_UPGRADE,
    status: PaymentDocStatus.SUCCEEDED,
  };

  if (query.snapperId) {
    match.userId = new Types.ObjectId(query.snapperId as string);
  }

  const from = query.from ? new Date(query.from as string) : undefined;
  const to = query.to ? new Date(query.to as string) : undefined;
  if (from || to) {
    match.paidAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }

  const searchTerm = query.searchTerm as string | undefined;
  if (searchTerm) {
    match.transactionId = { $regex: searchTerm, $options: "i" };
  }

  return match;
};

// all-time platform earnings — the lifetime counterpart to getEarningOverviewByYear,
// reusing the same PLATFORM_EARNED_BOOKING_MATCH definition of "completed and paid" so
// the two can never disagree. Returns the totals AND the actual (paginated, searchable,
// filterable) bookings behind them, not just the aggregate numbers. Supported query
// params: searchTerm (bookingId, customer/snapper fullName+email, payment
// transactionId), snapperId, userId, from/to (completedAt range, ISO date strings),
// sort, page, limit, fields. Totals reflect the same filtered scope as the list below
// them.
//
// Booking revenue isn't the platform's only income — a snapper paying to upgrade their
// storage plan (Payment.paymentType === STORAGE_UPGRADE) is 100% platform revenue with
// no booking behind it at all, so it's tracked as a second, additive totals+list pair
// (storageRevenue/storagePayments) rather than folded into totalRevenue/bookings above,
// which stay booking-only for backward compatibility. grandTotalRevenue is the sum of
// both streams. The same page/limit/sort query params drive both paginated lists.
const getAdminLifetimeEarnings = async (query: Record<string, unknown>) => {
  const { snapperId, userId, from, to, searchTerm, ...restQuery } = query;
  const match = await buildLifetimeEarningsMatch(query);
  const storageMatch = buildStoragePaymentsMatch(query);

  const [[summary], [storageSummary]] = await Promise.all([
    Booking.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalPrice" },
          adminCommission: { $sum: "$serviceFee" },
          snapperEarning: { $sum: { $subtract: ["$totalPrice", "$serviceFee"] } },
          totalBookings: { $sum: 1 },
        },
      },
    ]),
    Payment.aggregate([
      { $match: storageMatch },
      {
        $group: {
          _id: null,
          storageRevenue: { $sum: "$amount" },
          totalStoragePayments: { $sum: 1 },
        },
      },
    ]),
  ]);

  const earningsQuery = new QueryBuilder(
    Booking.find(match)
      .populate("userId", "fullName email profileImage")
      .populate("snapperId", "fullName email profileImage")
      .populate("packageId", "packageName price")
      .populate(
        "paymentId",
        "paymentNumber amount currency gateway status transactionId checkoutSessionId paidAt"
      ),
    restQuery
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const storagePaymentsQuery = new QueryBuilder(
    Payment.find(storageMatch).populate("userId", "fullName email profileImage"),
    restQuery
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [bookings, meta, storagePayments, storagePaymentsMeta] = await Promise.all([
    earningsQuery.modelQuery,
    earningsQuery.countTotal(),
    storagePaymentsQuery.modelQuery,
    storagePaymentsQuery.countTotal(),
  ]);

  const totalRevenue = summary?.totalRevenue ?? 0;
  const storageRevenue = storageSummary?.storageRevenue ?? 0;

  const result: IAdminLifetimeEarnings = {
    totalRevenue,
    adminCommission: summary?.adminCommission ?? 0,
    snapperEarning: summary?.snapperEarning ?? 0,
    totalBookings: summary?.totalBookings ?? 0,
    storageRevenue,
    totalStoragePayments: storageSummary?.totalStoragePayments ?? 0,
    storagePaymentsMeta,
    grandTotalRevenue: totalRevenue + storageRevenue,
    storagePayments: storagePayments.map(
      (payment): IAdminStoragePayment => ({
        _id: payment._id,
        paymentNumber: payment.paymentNumber,
        snapperId: payment.userId,
        storagePlan: payment.storagePlan ?? null,
        durationMonths: payment.durationMonths ?? null,
        amount: payment.amount,
        currency: payment.currency,
        gateway: payment.gateway,
        transactionId: payment.transactionId ?? null,
        paidAt: payment.paidAt ?? null,
      })
    ),
    bookings: bookings.map((booking) => {
      const payment = booking.paymentId as unknown as
        | (IAdminEarningPayment & { _id: unknown })
        | null;

      return {
        _id: booking._id,
        bookingId: booking.bookingId as string,
        userId: booking.userId,
        snapperId: booking.snapperId,
        packageId: booking.packageId,
        totalPrice: booking.totalPrice,
        serviceFee: booking.serviceFee,
        snapperEarning: booking.totalPrice - booking.serviceFee,
        completedAt: booking.completedAt ?? null,
        payment,
      };
    }),
  };

  return { meta, result };
};

// booking volume broken down by status, one year — the counts-only counterpart to
// getEarningOverviewByYear (same `year ?? current year` default, same flat
// `month: number` shape), grouped by createdAt like getAdminBookingEarningOverview
const getBookingOverviewByYear = async (year?: number): Promise<IYearlyBookingOverview> => {
  const targetYear = year ?? new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(targetYear, 0, 1));
  const yearEnd = new Date(Date.UTC(targetYear + 1, 0, 1));

  const statusSum = (status: BookingStatus) => ({
    $sum: { $cond: [{ $eq: ["$status", status] }, 1, 0] },
  });

  const rows = await Booking.aggregate([
    { $match: { isDeleted: false, createdAt: { $gte: yearStart, $lt: yearEnd } } },
    {
      $group: {
        _id: { $month: "$createdAt" },
        total: { $sum: 1 },
        pending: statusSum(BookingStatus.PENDING),
        accepted: statusSum(BookingStatus.ACCEPTED),
        upcoming: statusSum(BookingStatus.UPCOMING),
        shootCompleted: statusSum(BookingStatus.SHOOT_COMPLETED),
        deliveryPending: statusSum(BookingStatus.DELIVERY_PENDING),
        deliveryRejected: statusSum(BookingStatus.DELIVERY_REJECTED),
        completed: statusSum(BookingStatus.COMPLETED),
        cancelled: statusSum(BookingStatus.CANCELLED),
        rejected: statusSum(BookingStatus.REJECTED),
        disputed: statusSum(BookingStatus.DISPUTED),
        refunded: statusSum(BookingStatus.REFUNDED),
      },
    },
  ]);

  const rowsByMonth = new Map(rows.map((row) => [row._id, row]));

  const months: IMonthlyBookingOverview[] = Array.from({ length: 12 }, (_, i) => {
    const row = rowsByMonth.get(i + 1);
    return {
      month: i + 1,
      total: row?.total ?? 0,
      pending: row?.pending ?? 0,
      accepted: row?.accepted ?? 0,
      upcoming: row?.upcoming ?? 0,
      shootCompleted: row?.shootCompleted ?? 0,
      deliveryPending: row?.deliveryPending ?? 0,
      deliveryRejected: row?.deliveryRejected ?? 0,
      completed: row?.completed ?? 0,
      cancelled: row?.cancelled ?? 0,
      rejected: row?.rejected ?? 0,
      disputed: row?.disputed ?? 0,
      refunded: row?.refunded ?? 0,
    };
  });

  return { year: targetYear, months };
};

export const analyticsService = {
  getSnapperAnalytics,
  getAdminOverview,
  getAdminBookingEarningOverview,
  getMonthlyUserOverview,
  getEarningOverviewByYear,
  getAdminLifetimeEarnings,
  getBookingOverviewByYear,
};
