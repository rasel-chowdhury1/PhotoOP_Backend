import { Types } from "mongoose";

export enum BookingStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  REFUNDED = "refunded",
  UPCOMING = "upcoming",
  SHOOT_COMPLETED = "shoot_completed",
  DELIVERY_PENDING = "delivery_pending",
  DELIVERY_REJECTED = "delivery_rejected",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  DISPUTED = "disputed",
}

// which BookingStatus a booking may move to from its current status. Purely structural —
// role authorization (who's allowed to trigger a given edge) is handled separately, see
// assertTransition()/TRANSITION_ROLES in booking.service.ts
export const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [BookingStatus.ACCEPTED, BookingStatus.REJECTED, BookingStatus.CANCELLED],
  [BookingStatus.ACCEPTED]: [BookingStatus.UPCOMING, BookingStatus.SHOOT_COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.UPCOMING]: [BookingStatus.SHOOT_COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.SHOOT_COMPLETED]: [BookingStatus.DELIVERY_PENDING],
  // DISPUTED is reachable directly from DELIVERY_PENDING: rejectDelivery() decides the
  // target (DELIVERY_REJECTED vs DISPUTED) based on attempt count, both starting here
  [BookingStatus.DELIVERY_PENDING]: [
    BookingStatus.COMPLETED,
    BookingStatus.DELIVERY_REJECTED,
    BookingStatus.DISPUTED,
  ],
  [BookingStatus.DELIVERY_REJECTED]: [BookingStatus.DELIVERY_PENDING],
  [BookingStatus.REJECTED]: [BookingStatus.REFUNDED],
  [BookingStatus.CANCELLED]: [BookingStatus.REFUNDED],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.REFUNDED]: [],
  [BookingStatus.DISPUTED]: [],
};

// tracks money separately from the booking's own lifecycle (BookingStatus) — a paid
// booking can still be pending/accepted/etc.; this only reflects what Stripe has done.
// distinct from payment.interface.ts's PaymentStatus, which tracks the Payment/Stripe
// record itself (see payment.service.ts for how the two connect)
export enum PaymentStatus {
  UNPAID = "unpaid",
  PAID = "paid",
  REFUND_PENDING = "refund_pending",
  REFUNDED = "refunded",
  FAILED = "failed",
}

export enum DeliveryStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
}

export enum RejectionCategory {
  BLURRY = "BLURRY",
  LINK_BROKEN = "LINK_BROKEN",
  NOT_AS_DISCUSSED = "NOT_AS_DISCUSSED",
  INCOMPLETE = "INCOMPLETE",
  OTHER = "OTHER",
}

export enum DELIVERY_METHODS {
  IN_APP_GALLERY = "IN_APP_GALLERY",
  EXTERNAL_LINK = "EXTERNAL_LINK",
  DIGITAL_FILE = "DIGITAL_FILE",
  PHYSICAL_PRINTS = "PHYSICAL_PRINTS",
}

export enum AddOnKey {
  EXTRA_RETOUCHING = "EXTRA_RETOUCHING",
  RUSH_DELIVERY = "RUSH_DELIVERY",
  EXTRA_EDITED_PHOTOS = "EXTRA_EDITED_PHOTOS",
  RAW_FILES = "RAW_FILES",
  DRONE_SHOTS = "DRONE_SHOTS",
}

export interface ISelectedAddOn {
  key: AddOnKey;
  title: string;
  price: number;
}

export interface IStatusHistoryEntry {
  status: BookingStatus;
  actionBy: Types.ObjectId | string;
  actionAt: Date;
  note?: string;
}

// what the customer actually submits — everything else (snapperId, pricing, bookingId,
// status) is derived/computed server-side so it can't be tampered with
export interface ICreateBookingPayload {
  packageId: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  notes?: string;
  location: string;
  bookingDate: string | Date;
  startTime: string;
  endTime: string;
  selectedAddOnKeys?: AddOnKey[];
  // the customer's preference at booking time — the snapper's actual delivery method
  // for a given attempt lives on the Delivery doc (see delivery.interface.ts)
  preferredDeliveryMethod?: DELIVERY_METHODS;
}

export interface IBooking {
  bookingId: string;
  userId: Types.ObjectId | string;
  snapperId: Types.ObjectId | string;
  packageId: Types.ObjectId | string;
  fullName: string;
  email: string;
  phoneNumber: string;
  notes?: string;
  location: string;
  bookingDate: Date;
  startTime: string;
  endTime: string;
  selectedAddOns: ISelectedAddOn[];
  packagePrice: number;
  addOnPrice: number;
  serviceFeePercentage: number;
  serviceFee: number;
  totalPrice: number;
  preferredDeliveryMethod: DELIVERY_METHODS;

  // delivery lifecycle
  currentDeliveryId?: Types.ObjectId | string | null;
  deliveryAttempts: number;
  maxDeliveryAttempts: number;

  // milestones
  shootCompletedAt?: Date | null;
  deliveredAt?: Date | null;
  completedAt?: Date | null;
  autoAcceptAt?: Date | null;

  // payment (separate from BookingStatus — see PaymentStatus doc comment above)
  paymentStatus: PaymentStatus;
  refundAmount?: number;
  refundedAt?: Date | null;
  refundTransactionId?: string;

  status: BookingStatus;
  statusHistory: IStatusHistoryEntry[];

  // cancellation
  cancelledBy?: Types.ObjectId | string;
  cancelledAt?: Date;
  cancellationReason?: string;

  // rejection (pre-shoot, by the snapper)
  rejectedBy?: Types.ObjectId | string;
  rejectedAt?: Date;
  rejectionReason?: string;

  // review is a separate collection — this just prevents prompting twice, not a status
  hasReviewed?: boolean;

  isDeleted?: boolean;
}
