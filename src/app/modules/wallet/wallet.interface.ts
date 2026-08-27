export interface IWalletSummary {
  currency: string;
  availableBalance: number;
  pendingBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  totalRefunded: number;
}
