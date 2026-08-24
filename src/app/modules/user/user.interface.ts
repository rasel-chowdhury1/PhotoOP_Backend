import { Model, Types } from "mongoose";

export enum UserRole {
  USER = "user",
  SNAPPER = "snapper",
  ADMIN = "admin",
}

export enum UserStatus {
  ACTIVE = "active",
  BLOCKED = "blocked",
  SUSPENDED = "suspended",
}

export enum AdminApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

export enum GuardianApprovalStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export type TEmergencyContact = {
  name: string;
  phoneNumber: string;
};

export type TSocialLinks = {
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  facebook?: string;
  website?: string;
};

// which categories of notification this user wants pushed to them in real time — the
// in-app Notification record is always created regardless of these settings, they only
// gate the real-time push (see notifications.utils.ts's isPushAllowed, the single place
// that reads these to decide whether to push)
export interface INotificationPreferences {
  bookingUpdates: boolean;
  messageAlerts: boolean;
  promotionalOffers: boolean;
}

export interface INotificationSettings {
  // master switch — when false, nothing configurable below is pushed, regardless of
  // the individual preferences (their stored values are left untouched)
  pushEnabled: boolean;
  preferences: INotificationPreferences;
}

export type TGuardian = {
  name: string;
  email: string;
  relation: string;
  phoneNumber?: string;

  // Uploaded government-issued ID
  idImage?: string;

  emergencyContact?: TEmergencyContact;

  status: GuardianApprovalStatus;

  statusReason?: string | null;

  statusAt?: Date | null;

  isVerified: boolean;
};

export interface IApprovalHistoryEntry {
  status: AdminApprovalStatus;
  reason?: string | null;
  actionBy?: Types.ObjectId | string;
  actionAt: Date;
}

export interface ILocation {
  type: "Point";
  coordinates: [number, number];
}

export interface TUserCreate {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;

  // set once the matching SnapperProfile is created (role === UserRole.SNAPPER only)
  snapperId?: Types.ObjectId | string | null;

  profileImage?: string;
  coverPhoto?: string;

  dateOfBirth: Date;
  // only name/email/relation are collected from the child at signup; the rest
  // (phoneNumber, idImage, emergencyContact, status) is submitted by the guardian
  guardian?: Partial<TGuardian>;

  countryCode?: string;
  about?: string;
  phoneNumber?: string;
  address?: string;
  location?: ILocation;
  socialLinks?: Partial<TSocialLinks>;

  // this device's push token, kept current on every successful login (see auth.service.ts)
  fcmToken?: string;

  totalReview?: number;
  averageRating?: number;
  favoriteUsers?: Types.ObjectId[] | string[];
  // optional: pre-existing users may not have this until they first read/update it —
  // see notifications.utils.ts's getEffectiveNotificationSettings for the safe default
  notificationSettings?: INotificationSettings;
  status?: UserStatus;
  adminApproval?: AdminApprovalStatus;
  approvalHistory?: IApprovalHistoryEntry[];

  isDeleted?: boolean;
}

export interface TUser extends TUserCreate {
  _id: string;
}

export interface DeleteAccountPayload {
  password: string;
}

// snapperProfile fields collected up front, at the same time as the account itself,
// when role === UserRole.SNAPPER (see SnapperProfile schema for the source of truth)
export interface TSnapperProfileInput {
  identityImage?: string;
  hourlyRate?: number;
  specialties?: string[];
  badges?: string[];
  about?: string;
}

export type TSignupPayload = TUserCreate & TSnapperProfileInput;

export interface UserModel extends Model<TUser> {
  isUserExist(email: string): Promise<TUser>;

  isUserActive(email: string): Promise<TUser>;

  IsUserExistById(id: string): Promise<TUser>;

  isPasswordMatched(
    plainTextPassword: string,
    hashedPassword: string,
  ): Promise<boolean>;
}
