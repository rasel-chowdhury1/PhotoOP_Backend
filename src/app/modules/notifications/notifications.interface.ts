import { Schema } from "mongoose";


export interface INotification {
    userId: Schema.Types.ObjectId; // Reference to User
    receiverId: Schema.Types.ObjectId; // Reference to User
    message: { 
      fullName?: string;
      image: string; // URL or path to the user's image
      text: string; // Additional data (text or other relevant information)
      photos?: string[]; // Optional array of photo URLs or paths
    };
    type: NotificationType;
    isRead: boolean; // Whether the notification is read
    
  }

export enum NotificationType {
  USER_JOINED = "user_joined",
  NEW_MESSAGE = "new_message",

  BOOKING_REQUEST = "booking_request",
  BOOKING_ACCEPTED = "booking_accepted",
  BOOKING_REJECTED = "booking_rejected",
  BOOKING_CONFIRMED = "booking_confirmed",

  BOOKING_RESCHEDULE_REQUEST = "booking_reschedule_request",
  BOOKING_RESCHEDULE_ACCEPTED = "booking_reschedule_accepted",
  BOOKING_RESCHEDULE_REJECTED = "booking_reschedule_rejected",

  QUICK_SHOOT_REQUEST = "quick_shoot_request",
  QUICK_SHOOT_ACCEPTED = "quick_shoot_accepted",
  QUICK_SHOOT_REJECTED = "quick_shoot_rejected",

  BOOKING_CANCELLED = "booking_cancelled",

  SHOOT_COMPLETED = "shoot_completed",

  DELIVERY_PENDING = "delivery_pending",
  DELIVERY_ACCEPTED = "delivery_accepted",
  DELIVERY_REJECTED = "delivery_rejected",

  BOOKING_COMPLETED = "booking_completed",

  BOOKING_DISPUTED = "booking_disputed",

  REVIEW_REMINDER = "review_reminder",
  REVIEW_RECEIVED = "review_received",
    // Snapper verification
  SNAPPER_VERIFICATION_REQUEST = "snapper_verification_request",
  SNAPPER_VERIFICATION_APPROVED = "snapper_verification_approved",
  SNAPPER_VERIFICATION_REJECTED = "snapper_verification_rejected",

  // Snapper payout withdrawals
  WITHDRAW_REQUESTED = "withdraw_requested",
  WITHDRAW_PROCESSING = "withdraw_processing",
  WITHDRAW_COMPLETED = "withdraw_completed",
  WITHDRAW_FAILED = "withdraw_failed",
  WITHDRAW_REJECTED = "withdraw_rejected",
  WITHDRAW_CANCELLED = "withdraw_cancelled",
}