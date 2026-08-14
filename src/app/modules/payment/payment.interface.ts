export enum PaymentType {
  BOOKING = "BOOKING",
  STORAGE_UPGRADE = "STORAGE_UPGRADE",
}

export enum PaymentStatus {
  PENDING = "PENDING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
  CANCELLED = "CANCELLED",
}

export enum PaymentGateway {
  STRIPE = "STRIPE",
}