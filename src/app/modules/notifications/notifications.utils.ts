import { INotificationPreferences, INotificationSettings } from "../user/user.interface";
import { NotificationType } from "./notifications.interface";

export const DEFAULT_NOTIFICATION_PREFERENCES: INotificationPreferences = {
  bookingUpdates: true,
  messageAlerts: true,
  promotionalOffers: true,
};

export const DEFAULT_NOTIFICATION_SETTINGS: INotificationSettings = {
  pushEnabled: true,
  preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
};

// existing users created before this feature (or a document read via .select()/.lean()
// that dropped nested keys) may be missing notificationSettings entirely, or missing
// individual keys within it — anything unset is treated as enabled, per spec ("effectively
// enabled by default"). Reads named properties only (never spreads `settings` itself),
// so this is safe to call with a raw Mongoose subdocument.
export const getEffectiveNotificationSettings = (
  settings?: Partial<INotificationSettings> | null
): INotificationSettings => ({
  pushEnabled: settings?.pushEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.pushEnabled,
  preferences: {
    bookingUpdates:
      settings?.preferences?.bookingUpdates ?? DEFAULT_NOTIFICATION_PREFERENCES.bookingUpdates,
    messageAlerts:
      settings?.preferences?.messageAlerts ?? DEFAULT_NOTIFICATION_PREFERENCES.messageAlerts,
    promotionalOffers:
      settings?.preferences?.promotionalOffers ?? DEFAULT_NOTIFICATION_PREFERENCES.promotionalOffers,
  },
});

type NotificationPreferenceCategory = keyof INotificationPreferences;

// which preference category gates each notification type's real-time push. Types with
// no entry here (currently just USER_JOINED, an admin-only system notification) are
// ungated — they respect only the master pushEnabled switch. promotionalOffers has no
// NotificationType mapped to it yet; add one here if/when a promotional type is introduced.
const NOTIFICATION_CATEGORY_BY_TYPE: Partial<Record<NotificationType, NotificationPreferenceCategory>> = {
  [NotificationType.NEW_MESSAGE]: "messageAlerts",

  [NotificationType.BOOKING_REQUEST]: "bookingUpdates",
  [NotificationType.BOOKING_ACCEPTED]: "bookingUpdates",
  [NotificationType.BOOKING_REJECTED]: "bookingUpdates",
  [NotificationType.BOOKING_CONFIRMED]: "bookingUpdates",

  [NotificationType.BOOKING_RESCHEDULE_REQUEST]: "bookingUpdates",
  [NotificationType.BOOKING_RESCHEDULE_ACCEPTED]: "bookingUpdates",
  [NotificationType.BOOKING_RESCHEDULE_REJECTED]: "bookingUpdates",

  [NotificationType.QUICK_SHOOT_REQUEST]: "bookingUpdates",
  [NotificationType.QUICK_SHOOT_ACCEPTED]: "bookingUpdates",
  [NotificationType.QUICK_SHOOT_REJECTED]: "bookingUpdates",

  [NotificationType.BOOKING_CANCELLED]: "bookingUpdates",

  [NotificationType.SHOOT_COMPLETED]: "bookingUpdates",

  [NotificationType.DELIVERY_PENDING]: "bookingUpdates",
  [NotificationType.DELIVERY_ACCEPTED]: "bookingUpdates",
  [NotificationType.DELIVERY_REJECTED]: "bookingUpdates",

  [NotificationType.BOOKING_COMPLETED]: "bookingUpdates",

  [NotificationType.BOOKING_DISPUTED]: "bookingUpdates",

  [NotificationType.REVIEW_REMINDER]: "bookingUpdates",
  [NotificationType.REVIEW_RECEIVED]: "bookingUpdates",

  [NotificationType.SNAPPER_VERIFICATION_REQUEST]: "bookingUpdates",
  [NotificationType.SNAPPER_VERIFICATION_APPROVED]: "bookingUpdates",
  [NotificationType.SNAPPER_VERIFICATION_REJECTED]: "bookingUpdates",
};

// single source of truth for "should this receiver get a real-time push for this
// notification type right now" — every push-sending call site should go through this
// rather than re-deriving the pushEnabled/category logic itself. Does NOT decide
// whether to create the in-app Notification record — that always happens regardless.
export const isPushAllowed = (
  settings: Partial<INotificationSettings> | null | undefined,
  type?: string
): boolean => {
  const effective = getEffectiveNotificationSettings(settings);

  if (!effective.pushEnabled) {
    return false;
  }

  const category = type ? NOTIFICATION_CATEGORY_BY_TYPE[type as NotificationType] : undefined;
  if (!category) {
    // uncategorized system notification (e.g. USER_JOINED) — gated only by the master switch
    return true;
  }

  return effective.preferences[category];
};
