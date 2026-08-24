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
  pendingBalance: number;
  // always Jan->Dec of the current year, zero-filled for months with no earnings
  monthlyEarnings: IMonthlyEarning[];
  // always exactly 7 entries (today and the 6 days before it), oldest first,
  // zero-filled for days with no revenue
  dailyRevenue: IDailyRevenue[];
  payoutHistory: unknown[];
}
