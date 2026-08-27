export enum WalletTransactionType {
  BOOKING_EARNING = "BOOKING_EARNING",
  WITHDRAWAL = "WITHDRAWAL",
  REFUND = "REFUND",
  COMMISSION = "COMMISSION",
  ADJUSTMENT = "ADJUSTMENT",
  BONUS = "BONUS",
}

// which of SnapperWallet's two balance fields this ledger row moved
export enum WalletBalanceType {
  AVAILABLE = "AVAILABLE",
  PENDING = "PENDING",
}

export enum WalletTransactionReferenceType {
  BOOKING = "BOOKING",
  WITHDRAWAL = "WITHDRAWAL",
  MANUAL = "MANUAL",
}
