import { Types } from "mongoose";
import Booking from "../booking/booking.model";
import { BookingStatus, PaymentStatus } from "../booking/booking.interface";
import Withdraw, { WithdrawStatus } from "../withdrawRequest/withdrawRequest.model";
import { IDailyRevenue, IMonthlyEarning, ISnapperAnalytics } from "./analytics.interface";

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

const sumWithdrawals = async (snapperId: Types.ObjectId, statuses: WithdrawStatus[]) => {
  const [result] = await Withdraw.aggregate([
    { $match: { snapperId, status: { $in: statuses } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return result?.total ?? 0;
};

const getLifetimeEarnings = async (snapperId: Types.ObjectId) => {
  const [result] = await Booking.aggregate([
    { $match: EARNED_BOOKING_MATCH(snapperId) },
    { $group: { _id: null, total: { $sum: { $subtract: ["$totalPrice", "$serviceFee"] } } } },
  ]);
  return result?.total ?? 0;
};

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

const getSnapperAnalytics = async (snapperUserId: string): Promise<ISnapperAnalytics> => {
  const snapperId = new Types.ObjectId(snapperUserId);
  const now = new Date();

  const [lifetimeEarnings, monthlyEarnings, dailyRevenue, paidOut, pendingWithdraw, payoutHistory] =
    await Promise.all([
      getLifetimeEarnings(snapperId),
      getMonthlyEarnings(snapperId, now.getUTCFullYear()),
      getDailyRevenue(snapperId, now),
      // money that has actually left the system already
      sumWithdrawals(snapperId, [WithdrawStatus.PAID]),
      // money earmarked by an in-flight withdraw request — not available, not yet paid
      sumWithdrawals(snapperId, [WithdrawStatus.PENDING, WithdrawStatus.APPROVED]),
      Withdraw.find({ snapperId }).sort({ requestedAt: -1 }),
    ]);

  // rejected withdraw requests never left the system, so they're excluded from both sums
  // above and never reduce the available balance
  const availableBalance = Math.max(0, lifetimeEarnings - paidOut - pendingWithdraw);

  return {
    lifetimeEarnings,
    availableBalance,
    pendingBalance: pendingWithdraw,
    monthlyEarnings,
    dailyRevenue,
    payoutHistory,
  };
};

export const analyticsService = {
  getSnapperAnalytics,
};
