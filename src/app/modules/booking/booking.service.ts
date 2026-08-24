import httpStatus from "http-status";
import { format } from "date-fns";
import mongoose, { Types } from "mongoose";
import path from "path";
import AppError from "../../error/AppError";
import QueryBuilder from "../../builder/QueryBuilder";
import config from "../../config";
import { storage } from "../../utils/storage";
import Booking from "./booking.model";
import Delivery from "./delivery.model";
import Package from "../package/package.model";
import { DurationUnit } from "../package/package.interface";
import { User } from "../user/user.model";
import { AdminApprovalStatus, UserRole, UserStatus } from "../user/user.interface";
import SnapperProfile from "../snapperProfile/snapperProfile.model";
import Gallery from "../gallery/gallery.model";
import { GalleryStatus, IGalleryPicture } from "../gallery/gallery.interface";
import { bytesToGB } from "../../utils/storage/units";
import { getOrCreateAvailability, isOverlapping, toMinutes } from "../availability/availability.service";
import { TDayAvailability, TWeekDay } from "../availability/availability.interface";
import { NotificationType } from "../notifications/notifications.interface";
import { emitNotification } from "../../../socketIo";
import { paymentService } from "../payment/payment.service";
import { ADD_ON_CATALOG, DEFAULT_SERVICE_FEE_PERCENTAGE } from "./booking.constants";
import {
  AddOnKey,
  ALLOWED_TRANSITIONS,
  BookingStatus,
  CustomerTab,
  DELIVERY_METHODS,
  DeliveryStatus,
  GetMyQuickShootRequestsPayload,
  ICreateBookingPayload,
  ISelectedAddOn,
  PaymentStatus,
  QuickShootRequestInput,
  RescheduleActionInput,
  SnapperBookingStats,
  SnapperTab,
} from "./booking.interface";
import {
  DeliveryAssetType,
  IRejectDeliveryPayload,
  ISubmitDeliveryPayload,
} from "./delivery.interface";
import { getCustomerTabFilter, getSnapperTabFilter } from "./booking.utils";
import Chat from "../chat/chat.model";

// JS Date#getUTCDay(): 0=Sunday..6=Saturday
const JS_DAY_TO_WEEK_DAY: TWeekDay[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const resolveWeekDay = (date: Date): TWeekDay => JS_DAY_TO_WEEK_DAY[date.getUTCDay()];

const getUtcDayBounds = (date: Date) => {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const getUtcMonthBounds = (date: Date) => {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
};

const generateBookingId = () =>
  `BK-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

const resolveSelectedAddOns = (keys?: AddOnKey[]): ISelectedAddOn[] =>
  (keys || []).map((key) => ({ key, ...ADD_ON_CATALOG[key] }));

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// best-effort — a failed notification should never fail the booking action itself.
// only fires for event types the Notification model's `type` enum actually supports
// (no "booking requested"/"delivery rejected" entries exist yet, so those are skipped)
const notifyBookingParties = async (params: {
  actorId: string;
  bookingCustomerId: string;
  bookingSnapperId: string;
  text: string;
  type: NotificationType;
}) => {
  const recipientIds = new Set<string>();
  if (String(params.bookingCustomerId) !== String(params.actorId)) {
    recipientIds.add(String(params.bookingCustomerId));
  }
  if (String(params.bookingSnapperId) !== String(params.actorId)) {
    recipientIds.add(String(params.bookingSnapperId));
  }

  if (recipientIds.size === 0) {
    return;
  }

  try {
    const actor = await User.findById(params.actorId).select("fullName profileImage");

    recipientIds.forEach((receiverId) => {
      emitNotification({
        userId: params.actorId,
        receiverId,
        userMsg: {
          fullName: actor?.fullName,
          image: actor?.profileImage || "",
          text: params.text,
          photos: [],
        },
        type: params.type,
      }).catch((error) => {
        console.error("Failed to send booking notification:", error);
      });
    });
  } catch (error) {
    console.error("Failed to look up actor for booking notification:", error);
  }
};

// TODO: no refund flow exists yet anywhere in the codebase (no Stripe refund API call
// is wired up) — this just marks the booking as owing a refund so it's visible/queryable;
// wire this up to an actual `stripe.refunds.create(...)` call once that integration exists
const triggerRefund = (booking: InstanceType<typeof Booking>) => {
  console.log(
    `[booking.service] TODO: refund owed for booking ${booking.bookingId} (${booking.totalPrice}) — no refund API wired up yet`
  );
};

const createBooking = async (payload: ICreateBookingPayload, customerUserId: string) => {
  const pkg = await Package.findOne({ _id: payload.packageId, isDeleted: false, isActive: true });
  if (!pkg) {
    throw new AppError(httpStatus.NOT_FOUND, "Package not found or is no longer available");
  }

  const snapperId = pkg.userId.toString();

  if (snapperId === customerUserId) {
    throw new AppError(httpStatus.BAD_REQUEST, "You cannot book your own package");
  }

  const snapper = await User.findOne({
    _id: snapperId,
    role: UserRole.SNAPPER,
    adminApproval: AdminApprovalStatus.APPROVED,
    status: UserStatus.ACTIVE,
  });
  if (!snapper) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This snapper is not currently available for booking"
    );
  }

  const bookingDate = new Date(payload.bookingDate);

  if (Number.isNaN(bookingDate.getTime())) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid bookingDate");
  }

  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  if (bookingDate < todayUtc) {
    throw new AppError(httpStatus.BAD_REQUEST, "bookingDate cannot be in the past");
  }

  const availability = await getOrCreateAvailability(snapperId);
  const weekDay = resolveWeekDay(bookingDate);
  const dayAvailability = (availability.weeklySchedule as TDayAvailability[]).find(
    (entry) => entry.day === weekDay
  );

  const isWithinAnySlot =
    dayAvailability?.isAvailable &&
    dayAvailability.slots.some(
      (slot) =>
        toMinutes(payload.startTime) >= toMinutes(slot.startTime) &&
        toMinutes(payload.endTime) <= toMinutes(slot.endTime)
    );

  if (!isWithinAnySlot) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "The snapper is not available for the selected date/time"
    );
  }

  const { start, end } = getUtcDayBounds(bookingDate);
  const sameDayBookings = await Booking.find({
    snapperId,
    isDeleted: false,
    // still-live bookings that legitimately hold this slot; UPCOMING replaces the old
    // RESCHEDULE_PENDING status here now that BookingStatus no longer has it
    status: { $in: [BookingStatus.PENDING, BookingStatus.ACCEPTED, BookingStatus.UPCOMING] },
    bookingDate: { $gte: start, $lt: end },
  });

  const hasConflict = sameDayBookings.some((booking) =>
    isOverlapping(payload.startTime, payload.endTime, booking.startTime, booking.endTime)
  );

  if (hasConflict) {
    throw new AppError(httpStatus.CONFLICT, "This time slot is no longer available");
  }

  const selectedAddOns = resolveSelectedAddOns(payload.selectedAddOnKeys);
  const packagePrice = pkg.price;
  const addOnPrice = selectedAddOns.reduce((sum, addOn) => sum + addOn.price, 0);
  const serviceFeePercentage = DEFAULT_SERVICE_FEE_PERCENTAGE;
  const serviceFee = Math.round(((packagePrice + addOnPrice) * serviceFeePercentage) / 100);
  const totalPrice = packagePrice + addOnPrice + serviceFee;

  

  const preferredDeliveryMethod = payload.deliveryMethod || DELIVERY_METHODS.IN_APP_GALLERY;

  console.log({payload, preferredDeliveryMethod})
  const booking = await Booking.create({
    bookingId: generateBookingId(),
    userId: customerUserId,
    snapperId,
    packageId: pkg._id,
    fullName: payload.fullName,
    email: payload.email,
    phoneNumber: payload.phoneNumber,
    notes: payload.notes,
    location: payload.location,
    bookingDate,
    startTime: payload.startTime,
    endTime: payload.endTime,
    selectedAddOns,
    packagePrice,
    addOnPrice,
    serviceFeePercentage,
    serviceFee,
    totalPrice,
    preferredDeliveryMethod,
    status: BookingStatus.PENDING,
    statusHistory: [{ status: BookingStatus.PENDING, actionBy: customerUserId, actionAt: new Date() }],
  });

  // if Stripe checkout creation fails (misconfigured/unreachable), roll the booking back
  // rather than leaving an unpayable booking sitting in the DB holding the time slot
  try {
    const { checkoutUrl } = await paymentService.createCheckoutSessionForBooking(
      { _id: booking._id, bookingId: booking.bookingId as string, totalPrice: booking.totalPrice },
      customerUserId
    );
    return { booking, checkoutUrl };
  } catch (error) {
    await Booking.deleteOne({ _id: booking._id });
    throw error;
  }
};

const getMyBookingsAsCustomer = async (
  userId: string,
  query: Record<string, unknown>
) => {
  // extract "tab" separately so QueryBuilder doesn't treat it as a raw schema field filter
  const { status, ...restQuery } = query;

  const tabFilter = status
    ? getCustomerTabFilter(status as CustomerTab)
    : {};

  const bookingQuery = new QueryBuilder(
    Booking.find({ userId, isDeleted: false, ...tabFilter })
      .populate("snapperId", "fullName profileImage")
      .populate("packageId", "packageName price durationValue durationUnit")
      .populate("currentDeliveryId"),
    restQuery
  )
    .search(["bookingId", "fullName", "location"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await bookingQuery.modelQuery;
  const meta = await bookingQuery.countTotal();
  return { meta, result };
};

const getMyBookingsAsSnapper = async (
  snapperId: string,
  query: Record<string, unknown>
) => {
  const { status, ...restQuery } = query;

  const tabFilter = status
    ? getSnapperTabFilter(status as SnapperTab)
    : {};

  const bookingQuery = new QueryBuilder(
    Booking.find({ snapperId, isDeleted: false, ...tabFilter })
      .populate("userId", "fullName profileImage")
      .populate("packageId", "packageName price durationValue durationUnit")
      .populate("currentDeliveryId"),
    restQuery
  )
    .search(["bookingId", "fullName", "location"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await bookingQuery.modelQuery;
  const meta = await bookingQuery.countTotal();
  return { meta, result };
};

const getAllBookings = async (query: Record<string, unknown>) => {
  const bookingQuery = new QueryBuilder(
    Booking.find({ isDeleted: false })
      .populate("userId", "fullName profileImage")
      .populate("snapperId", "fullName profileImage")
      .populate("packageId", "packageName price"),
    query
  )
    .search(["bookingId", "fullName", "location"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await bookingQuery.modelQuery;
  const meta = await bookingQuery.countTotal();
  return { meta, result };
};

const getBookingById = async (id: string, authUserId: string, isAdmin: boolean) => {
  const booking = await Booking.findOne({ _id: id, isDeleted: false })
    .populate("userId", "fullName profileImage email phoneNumber")
    .populate("snapperId", "fullName profileImage email phoneNumber")
    .populate("packageId", "packageName price durationValue durationUnit");

  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
  }

  const customerId = (booking.userId as any)?._id ?? booking.userId;
  const snapperId = (booking.snapperId as any)?._id ?? booking.snapperId;
  const isCustomer = String(customerId) === String(authUserId);
  const isSnapper = String(snapperId) === String(authUserId);

  if (!isAdmin && !isCustomer && !isSnapper) {
    throw new AppError(httpStatus.FORBIDDEN, "You do not have access to this booking");
  }

  return booking;
};

// structural check only: is `next` a valid destination from `current` at all. Every
// status change in this file — generic and delivery-specific alike — goes through this.
const assertTransition = (current: BookingStatus, next: BookingStatus) => {
  const allowed = ALLOWED_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot transition booking from ${current} to ${next}`
    );
  }
};

// role authorization for the generic updateBookingStatus endpoint only — the delivery
// sub-flow (DELIVERY_PENDING/COMPLETED/DELIVERY_REJECTED/DISPUTED) is intentionally NOT
// listed here, so it can only be reached via submitDelivery/acceptDelivery/rejectDelivery,
// which carry their own side effects (Delivery doc, autoAcceptAt, etc.) that this
// generic endpoint doesn't know how to perform
const TRANSITION_ROLES: Partial<Record<BookingStatus, Array<"customer" | "snapper">>> = {
  [BookingStatus.ACCEPTED]: ["snapper"],
  [BookingStatus.REJECTED]: ["snapper"],
  [BookingStatus.CANCELLED]: ["customer", "snapper"],
  [BookingStatus.UPCOMING]: ["snapper"],
  [BookingStatus.SHOOT_COMPLETED]: ["snapper"],
  [BookingStatus.REFUNDED]: [],
};

// only these transitions have a corresponding entry in NotificationType today —
// others (e.g. UPCOMING) are silently skipped rather than sent with a made-up type
const buildStatusChangeNotification = (
  nextStatus: BookingStatus,
  booking: InstanceType<typeof Booking>,
  note?: string
): { type: NotificationType; text: string } | null => {
  const dateLabel = format(booking.bookingDate, "MMM d, yyyy");

  switch (nextStatus) {
    case BookingStatus.ACCEPTED:
      return {
        type: NotificationType.BOOKING_ACCEPTED,
        text: `Your booking ${booking.bookingId} for ${dateLabel} has been accepted by the photographer.`,
      };
    case BookingStatus.REJECTED:
      return {
        type: NotificationType.BOOKING_REJECTED,
        text: note
          ? `Your booking ${booking.bookingId} was rejected by the photographer: ${note}`
          : `Your booking ${booking.bookingId} was rejected by the photographer.`,
      };
    case BookingStatus.CANCELLED:
      return {
        type: NotificationType.BOOKING_CANCELLED,
        text: note
          ? `Booking ${booking.bookingId} has been cancelled: ${note}`
          : `Booking ${booking.bookingId} has been cancelled.`,
      };
    case BookingStatus.SHOOT_COMPLETED:
      return {
        type: NotificationType.SHOOT_COMPLETED,
        text: `The photo shoot for booking ${booking.bookingId} is complete. Your photos will be delivered soon.`,
      };
    default:
      return null;
  }
};

const updateBookingStatus = async (
  id: string,
  authUserId: string,
  isAdmin: boolean,
  nextStatus: BookingStatus,
  note?: string
) => {
  const booking = await Booking.findOne({ _id: id, isDeleted: false });
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
  }

  const isCustomer = String(booking.userId) === String(authUserId);
  const isSnapper = String(booking.snapperId) === String(authUserId);

  if (!isAdmin && !isCustomer && !isSnapper) {
    throw new AppError(httpStatus.FORBIDDEN, "You do not have access to this booking");
  }

  const allowedRoles = TRANSITION_ROLES[nextStatus];
  if (!allowedRoles) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `${nextStatus} must be set via the delivery endpoints, not this one`
    );
  }

  if (!isAdmin) {
    const callerRole: "customer" | "snapper" = isSnapper ? "snapper" : "customer";
    if (!allowedRoles.includes(callerRole)) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        `You are not allowed to move this booking to ${nextStatus}`
      );
    }
  }

  assertTransition(booking.status, nextStatus);

  booking.status = nextStatus;
  booking.statusHistory.push({
    status: nextStatus,
    actionBy: authUserId,
    actionAt: new Date(),
    note,
  });

  if (nextStatus === BookingStatus.CANCELLED) {
    booking.cancelledBy = new Types.ObjectId(authUserId);
    booking.cancelledAt = new Date();
    booking.cancellationReason = note;
  }

  if (nextStatus === BookingStatus.REJECTED) {
    booking.rejectedBy = new Types.ObjectId(authUserId);
    booking.rejectedAt = new Date();
    booking.rejectionReason = note;
  }

  if (nextStatus === BookingStatus.SHOOT_COMPLETED) {
    booking.shootCompletedAt = new Date();
  }

  // the customer already paid — rejecting/cancelling owes them a refund. Only the
  // backend can move paymentStatus, and reaching the actual REFUNDED status still
  // requires a separate admin-only transition (see TRANSITION_ROLES/ALLOWED_TRANSITIONS)
  if (
    (nextStatus === BookingStatus.REJECTED || nextStatus === BookingStatus.CANCELLED) &&
    booking.paymentStatus === PaymentStatus.PAID
  ) {
    booking.paymentStatus = PaymentStatus.REFUND_PENDING;
    triggerRefund(booking);
  }

  await booking.save();

  if (nextStatus === BookingStatus.ACCEPTED) {
  const existingGallery = await Gallery.findOne({ bookingId: booking._id });
  if (!existingGallery) {
    const pkg = await Package.findById(booking.packageId).select("packageName");
    await Gallery.create({
      userId: booking.userId,
      snapperId: booking.snapperId,
      bookingId: booking._id,
      name: `${pkg?.packageName || "Photoshoot"} - ${format(booking.bookingDate, "MMM d, yyyy")}`,
    });
  }

    // Create a direct chat between the customer and snapper if one doesn't already exist
  const existingChat = await Chat.findOne({
    users: { $all: [booking.userId, booking.snapperId], $size: 2 },
  });

  if (!existingChat) {
    await Chat.create({
      users: [booking.userId, booking.snapperId],
      createdBy: authUserId, // whoever accepted the booking (the snapper, in this flow)
    });
  }
}

  const statusNotification = buildStatusChangeNotification(nextStatus, booking, note);
  if (statusNotification) {
    notifyBookingParties({
      actorId: authUserId,
      bookingCustomerId: booking.userId.toString(),
      bookingSnapperId: booking.snapperId.toString(),
      text: statusNotification.text,
      type: statusNotification.type,
    });
  }

  return booking;
};

// ---------------------------------------------------------------------------
// Delivery lifecycle
// ---------------------------------------------------------------------------

const submitDelivery = async (
  bookingId: string,
  snapperUserId: string,
  payload: ISubmitDeliveryPayload
) => {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (String(booking.snapperId) !== String(snapperUserId)) {
    throw new AppError(httpStatus.FORBIDDEN, "Only the assigned snapper can submit a delivery");
  }

  assertTransition(booking.status, BookingStatus.DELIVERY_PENDING);

  if (booking.deliveryAttempts >= booking.maxDeliveryAttempts) {
    throw new AppError(httpStatus.BAD_REQUEST, "Maximum delivery attempts reached");
  }

  let gallery: InstanceType<typeof Gallery> | null = null;

  if (payload.deliveryMethod === DELIVERY_METHODS.EXTERNAL_LINK) {
    if (!payload.externalDeliveryLink) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "externalDeliveryLink is required for EXTERNAL_LINK deliveries"
      );
    }
  } else if (payload.deliveryMethod === DELIVERY_METHODS.IN_APP_GALLERY) {
    if (!payload.galleryId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "galleryId is required for in-app gallery deliveries"
      );
    }

    // must belong to THIS booking — prevents referencing an unrelated gallery
    gallery = await Gallery.findOne({ _id: payload.galleryId, bookingId: booking._id });
    if (!gallery) {
      throw new AppError(httpStatus.NOT_FOUND, "Gallery not found for this booking");
    }
    if (gallery.pictures.length === 0) {
      throw new AppError(httpStatus.BAD_REQUEST, "Gallery has no pictures yet");
    }
  }

  const nextAttempt = booking.deliveryAttempts + 1;
  const session = await mongoose.startSession();

  try {
    let delivery;

    await session.withTransaction(async () => {
      const [createdDelivery] = await Delivery.create(
        [
          {
            bookingId: booking._id,
            snapperId: booking.snapperId,
            userId: booking.userId,
            attempt: nextAttempt,
            deliveryMethod: payload.deliveryMethod,
            externalDeliveryLink:
              payload.deliveryMethod === DELIVERY_METHODS.EXTERNAL_LINK
                ? payload.externalDeliveryLink
                : undefined,
            linkPassword: payload.linkPassword,
            linkExpiresAt: payload.linkExpiresAt,
            galleryId: gallery?._id,
            coverImage: payload.coverImage,
            description: payload.description,
            submittedBy: snapperUserId,
            submittedAt: new Date(),
            status: DeliveryStatus.PENDING,
          },
        ],
        { session }
      );
      delivery = createdDelivery;

      if (gallery) {
        gallery.status = GalleryStatus.DELIVERED;
        await gallery.save({ session });
      }

      booking.status = BookingStatus.DELIVERY_PENDING;
      booking.currentDeliveryId = delivery._id;
      booking.deliveryAttempts = nextAttempt;
      booking.deliveredAt = booking.deliveredAt || new Date();
      booking.autoAcceptAt = new Date(Date.now() + SEVEN_DAYS_MS);
      booking.statusHistory.push({
        status: BookingStatus.DELIVERY_PENDING,
        actionBy: snapperUserId,
        actionAt: new Date(),
        note: `Delivery attempt ${nextAttempt} submitted`,
      });

      await booking.save({ session });
    });

    notifyBookingParties({
      actorId: snapperUserId,
      bookingCustomerId: booking.userId.toString(),
      bookingSnapperId: booking.snapperId.toString(),
      text: `Your photos for booking ${booking.bookingId} are ready! Please review your gallery and accept the delivery within 7 days.`,
      type: NotificationType.DELIVERY_PENDING,
    });

    return { booking, delivery };
  } finally {
    await session.endSession();
  }
};

// shared by acceptDelivery (customer-triggered) and the auto-accept cron, so the two
// paths can't drift apart
const completeBookingDelivery = async (
  booking: InstanceType<typeof Booking>,
  delivery: InstanceType<typeof Delivery> | null,
  actorId: string,
  note: string,
  session: mongoose.ClientSession
) => {
  if (delivery) {
    delivery.status = DeliveryStatus.ACCEPTED;
    delivery.reviewedAt = new Date();
    await delivery.save({ session });
  }

  booking.status = BookingStatus.COMPLETED;
  booking.completedAt = new Date();
  booking.autoAcceptAt = null;
  booking.statusHistory.push({
    status: BookingStatus.COMPLETED,
    actionBy: actorId,
    actionAt: new Date(),
    note,
  });
  await booking.save({ session });

  // TODO: trigger snapper payout release (e.g. a Stripe Connect transfer, or whatever
  // manual/automated payout workflow gets built) — booking.totalPrice minus platform
  // fees is now owed to booking.snapperId.

  notifyBookingParties({
    actorId,
    bookingCustomerId: booking.userId.toString(),
    bookingSnapperId: booking.snapperId.toString(),
    text: `Booking ${booking.bookingId} is now complete (${note}). Payout will be released to the photographer.`,
    type: NotificationType.BOOKING_COMPLETED,
  });
};

const acceptDelivery = async (bookingId: string, customerUserId: string) => {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (String(booking.userId) !== String(customerUserId)) {
    throw new AppError(httpStatus.FORBIDDEN, "Only the customer can accept a delivery");
  }

  assertTransition(booking.status, BookingStatus.COMPLETED);

  const delivery = booking.currentDeliveryId
    ? await Delivery.findById(booking.currentDeliveryId)
    : null;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await completeBookingDelivery(
        booking,
        delivery,
        customerUserId,
        "Delivery accepted by customer",
        session
      );
    });
    return booking;
  } finally {
    await session.endSession();
  }
};

const rejectDelivery = async (
  bookingId: string,
  customerUserId: string,
  payload: IRejectDeliveryPayload
) => {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (String(booking.userId) !== String(customerUserId)) {
    throw new AppError(httpStatus.FORBIDDEN, "Only the customer can reject a delivery");
  }

  if (!booking.currentDeliveryId) {
    throw new AppError(httpStatus.BAD_REQUEST, "This booking has no delivery to reject");
  }

  const nextStatus =
    booking.deliveryAttempts >= booking.maxDeliveryAttempts
      ? BookingStatus.DISPUTED
      : BookingStatus.DELIVERY_REJECTED;
  assertTransition(booking.status, nextStatus);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const delivery = await Delivery.findById(booking.currentDeliveryId).session(session);
      if (!delivery) {
        throw new AppError(httpStatus.NOT_FOUND, "Delivery not found");
      }

      delivery.status = DeliveryStatus.REJECTED;
      delivery.rejectionReason = payload.rejectionReason;
      delivery.rejectionCategory = payload.rejectionCategory;
      delivery.reviewedAt = new Date();
      await delivery.save({ session });

      // let the snapper update/replace pictures before resubmitting
      if (delivery.galleryId) {
        await Gallery.updateOne(
          { _id: delivery.galleryId },
          { status: GalleryStatus.DRAFT },
          { session }
        );
      }

      booking.status = nextStatus;
      booking.autoAcceptAt = null;
      booking.statusHistory.push({
        status: nextStatus,
        actionBy: customerUserId,
        actionAt: new Date(),
        note: payload.rejectionReason,
      });
      await booking.save({ session });
    });

    const notification =
      nextStatus === BookingStatus.DISPUTED
        ? {
            type: NotificationType.BOOKING_DISPUTED,
            text: `Booking ${booking.bookingId} has been marked as disputed after reaching the maximum number of delivery attempts. Our support team will step in to help resolve this.`,
          }
        : {
            type: NotificationType.DELIVERY_REJECTED,
            text: `Your delivery for booking ${booking.bookingId} was rejected: ${payload.rejectionReason}. Please review and resubmit.`,
          };

    notifyBookingParties({
      actorId: customerUserId,
      bookingCustomerId: booking.userId.toString(),
      bookingSnapperId: booking.snapperId.toString(),
      text: notification.text,
      type: notification.type,
    });

    return booking;
  } finally {
    await session.endSession();
  }
};

// shared by getDeliveryHistory and the delivery-asset-serving route — throws 403 if
// requesterId is neither the booking's customer nor its snapper (admin always passes)
const assertBookingAccess = (
  booking: InstanceType<typeof Booking>,
  requesterId: string,
  isAdmin: boolean
) => {
  const isCustomer = String(booking.userId) === String(requesterId);
  const isSnapper = String(booking.snapperId) === String(requesterId);
  if (!isAdmin && !isCustomer && !isSnapper) {
    throw new AppError(httpStatus.FORBIDDEN, "You do not have access to this booking");
  }
};

const getDeliveryHistory = async (bookingId: string, requesterId: string, isAdmin: boolean) => {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
  }

  assertBookingAccess(booking, requesterId, isAdmin);

  // populated, not duplicated: history shows the gallery's current state (it's shared/
  // mutable across attempts) rather than snapshotting its pictures onto each attempt
  return Delivery.find({ bookingId })
    .populate("galleryId", "status totalPictures storageSize")
    .sort({ attempt: -1 });
};

// ---------------------------------------------------------------------------
// Delivery assets (local-disk upload, protected serving — see src/app/utils/storage)
// ---------------------------------------------------------------------------

// called by the upload controller after multer + resolveDeliveryUploadContext have
// already validated the booking/attempt and written the files to disk. If wrapping the
// bytes into UploadedFileResult fails for any reason, deletes what was just written
// rather than leaving orphaned files (the multer-level equivalent of this lives in
// deliveryUpload.ts's handleDeliveryUpload, for errors multer itself raises)
const recordUploadedDeliveryAssets = async (files: Express.Multer.File[], folder: string) => {
  try {
    return await storage.saveMany(files, folder);
  } catch (error) {
    await storage
      .deleteMany(files.map((file) => `${folder}/${path.basename(file.path)}`))
      .catch((cleanupError) => {
        console.error("Failed to clean up delivery upload after a save failure:", cleanupError);
      });
    throw error;
  }
};

// resolves an uploaded delivery asset's absolute filesystem path for GET .../delivery/assets/*,
// enforcing ownership, path-traversal safety, and existence — a failure at ANY of these
// checks is reported as 404 (not 403/400) so a non-owner can't tell the asset exists
const resolveDeliveryAssetPath = async (
  bookingId: string,
  keySuffix: string,
  requesterId: string,
  isAdmin: boolean
) => {
  const notFound = () => new AppError(httpStatus.NOT_FOUND, "Asset not found");

  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) {
    throw notFound();
  }

  try {
    assertBookingAccess(booking, requesterId, isAdmin);
  } catch {
    throw notFound();
  }

  const uploadRoot = path.resolve(config.upload_root);
  const bookingDeliveriesRoot = path.resolve(uploadRoot, "deliveries", bookingId);
  const key = `deliveries/${bookingId}/${keySuffix}`;
  const resolvedPath = path.resolve(uploadRoot, key);

  if (!resolvedPath.startsWith(bookingDeliveriesRoot + path.sep)) {
    throw notFound();
  }

  if (!(await storage.exists(key))) {
    throw notFound();
  }

  return resolvedPath;
};

// admin tooling only (no route wired up yet) — physically deletes a gallery's picture
// files, clears them from the document, and frees the accounted storage. The gallery
// document itself is kept (still one-per-booking, per the schema's unique bookingId).
const deleteGalleryAssets = async (galleryId: string) => {
  const gallery = await Gallery.findById(galleryId);
  if (!gallery) {
    throw new AppError(httpStatus.NOT_FOUND, "Gallery not found");
  }

  const keys = gallery.pictures.map((picture) => picture.key).filter(Boolean);
  if (keys.length > 0) {
    await storage.deleteMany(keys);
  }

  const freedGB = bytesToGB(gallery.storageSize);

  gallery.pictures = [];
  gallery.totalPictures = 0;
  gallery.storageSize = 0;
  await gallery.save();

  await SnapperProfile.updateOne(
    { userId: gallery.snapperId },
    { $inc: { storageUsedGB: -freedGB } }
  );

  return gallery;
};

const mapMimeTypeToAssetType = (mimeType: string): DeliveryAssetType =>
  mimeType.startsWith("video/") ? DeliveryAssetType.VIDEO : DeliveryAssetType.IMAGE;

// find-or-create the single gallery for a booking (schema enforces bookingId unique —
// resubmissions after a rejection reuse the same gallery, they don't get a new one)
const getOrCreateGalleryForBooking = async (
  booking: InstanceType<typeof Booking>,
  session: mongoose.ClientSession
) => {
  let gallery = await Gallery.findOne({ bookingId: booking._id }).session(session);
  if (!gallery) {
    // fallback only — normally the gallery already exists by upload time, created when
    // the booking was ACCEPTED (see updateBookingStatus). Same naming convention as there.
    const pkg = await Package.findById(booking.packageId).select("packageName").session(session);
    const [created] = await Gallery.create(
      [
        {
          userId: booking.userId,
          snapperId: booking.snapperId,
          bookingId: booking._id,
          name: `${pkg?.packageName || "Photoshoot"} - ${format(booking.bookingDate, "MMM d, yyyy")}`,
          status: GalleryStatus.DRAFT,
        },
      ],
      { session }
    );
    gallery = created;
  }
  return gallery;
};

// orchestrates the whole "snapper uploads gallery assets" step: the files are already
// on disk (multer + resolveDeliveryUploadContext ran first) — this wraps them into
// UploadedFileResult (recordUploadedDeliveryAssets, unchanged from before), enforces
// the snapper's storage limit BEFORE committing anything to the DB, and only then
// find-or-creates the Gallery and bumps storage accounting, all in one transaction
const uploadDeliveryAssetsToGallery = async (
  bookingId: string,
  snapperUserId: string,
  files: Express.Multer.File[],
  folder: string
) => {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
  }
  if (String(booking.snapperId) !== String(snapperUserId)) {
    throw new AppError(httpStatus.FORBIDDEN, "Only the assigned snapper can upload gallery assets");
  }

  const snapperProfile = await SnapperProfile.findOne({ userId: booking.snapperId });
  if (!snapperProfile) {
    throw new AppError(httpStatus.NOT_FOUND, "Snapper profile not found");
  }

  // step 1: persist to storage — recordUploadedDeliveryAssets already cleans up after
  // itself if this fails, so no extra handling needed here
  const uploadedAssets = await recordUploadedDeliveryAssets(files, folder);

  // step 2: storage-limit check BEFORE committing to the DB. The bytes are already on
  // disk (multer wrote them before this function ran) — if the limit would be
  // exceeded, delete them now rather than leaving them orphaned.
  const totalBytes = uploadedAssets.reduce((sum, asset) => sum + asset.size, 0);
  const totalGB = bytesToGB(totalBytes);
  if (snapperProfile.storageUsedGB + totalGB > snapperProfile.storageLimitGB) {
    await storage.deleteMany(uploadedAssets.map((asset) => asset.key)).catch((cleanupError) => {
      console.error("Failed to clean up upload rejected for exceeding storage limit:", cleanupError);
    });
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `This upload needs ${totalGB.toFixed(2)}GB but only ` +
        `${(snapperProfile.storageLimitGB - snapperProfile.storageUsedGB).toFixed(2)}GB is available ` +
        `(${snapperProfile.storageUsedGB.toFixed(2)}/${snapperProfile.storageLimitGB}GB used)`
    );
  }

  // step 3: commit — gallery and storage accounting move together
  const session = await mongoose.startSession();
  try {
    let gallery;

    await session.withTransaction(async () => {
      gallery = await getOrCreateGalleryForBooking(booking, session);

      const newPictures: IGalleryPicture[] = uploadedAssets.map((asset) => ({
        url: asset.url,
        key: asset.key,
        type: mapMimeTypeToAssetType(asset.mimeType),
        size: asset.size,
        uploadedAt: new Date(),
      }));

      gallery.pictures.push(...newPictures);
      gallery.totalPictures = gallery.pictures.length;
      gallery.storageSize += totalBytes;
      await gallery.save({ session });

      await SnapperProfile.updateOne(
        { _id: snapperProfile._id },
        { $inc: { storageUsedGB: totalGB } },
        { session }
      );
    });

    return { gallery, uploadedAssets };
  } finally {
    await session.endSession();
  }
};

// called hourly by booking.cron.ts
const autoAcceptOverdueDeliveries = async () => {
  const overdueBookings = await Booking.find({
    status: BookingStatus.DELIVERY_PENDING,
    autoAcceptAt: { $lte: new Date() },
    isDeleted: false,
  });

  let acceptedCount = 0;

  for (const booking of overdueBookings) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const delivery = booking.currentDeliveryId
          ? await Delivery.findById(booking.currentDeliveryId).session(session)
          : null;

        await completeBookingDelivery(
          booking,
          delivery,
          booking.userId.toString(),
          "Auto-accepted after 7 days",
          session
        );
      });
      acceptedCount += 1;
    } catch (error) {
      console.error(`Failed to auto-accept delivery for booking ${booking.bookingId}:`, error);
    } finally {
      await session.endSession();
    }
  }

  return acceptedCount;
};

const getMyRecentBookings = async (
  userId: string,
  role: "user" | "snapper",
  limit = 5
) => {
  const filterField = role === "snapper" ? "snapperId" : "userId";
  const populateField = role === "snapper" ? "userId" : "snapperId";

  const bookings = await Booking.find({ [filterField]: userId, isDeleted: false })
    .populate(populateField, "fullName profileImage")
    .populate("packageId", "packageName price durationValue durationUnit")
    .sort({ createdAt: -1 })
    .limit(limit);

  return bookings;
};




const getSnapperBookingStats = async (snapperId: string): Promise<SnapperBookingStats> => {
  const now = new Date();
  const { start: monthStart, end: monthEnd } = getUtcMonthBounds(now);

  const baseFilter = { snapperId, isDeleted: false };

  const [
    totalPending,
    totalUpcoming,
    totalCompleted,
    bookingsThisMonth,
    earningsAggregate,
    snapperUser,
  ] = await Promise.all([
    // Pending: booking sent by customer, snapper hasn't accepted/rejected yet
    Booking.countDocuments({
      ...baseFilter,
      status: BookingStatus.PENDING,
    }),

    // Upcoming: accepted, shoot date is in the future
    Booking.countDocuments({
      ...baseFilter,
      status: BookingStatus.ACCEPTED,
      bookingDate: { $gte: now },
    }),

    // Completed
    Booking.countDocuments({
      ...baseFilter,
      status: BookingStatus.COMPLETED,
    }),

    // scheduled (bookingDate) within the current calendar month, any status
    Booking.countDocuments({
      ...baseFilter,
      bookingDate: { $gte: monthStart, $lt: monthEnd },
    }),

    // net earnings = totalPrice minus the platform's serviceFee, only for bookings that
    // are both COMPLETED and actually PAID. .aggregate() bypasses Mongoose's automatic
    // string->ObjectId casting, so snapperId must be cast explicitly here.
    Booking.aggregate([
      {
        $match: {
          snapperId: new Types.ObjectId(snapperId),
          isDeleted: false,
          status: BookingStatus.COMPLETED,
          paymentStatus: PaymentStatus.PAID,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $subtract: ["$totalPrice", "$serviceFee"] } },
        },
      },
    ]),

    // Rating info lives on the User document, not Booking
    User.findById(snapperId).select("averageRating totalReview"),
  ]);

  return {
    totalPending,
    totalUpcoming,
    totalCompleted,
    bookingsThisMonth,
    totalEarnings: earningsAggregate[0]?.total ?? 0,
    averageRating: (snapperUser as any).averageRating ?? 0,
    totalReview: (snapperUser as any).totalReview ?? 0,
  };
};


// How many hours away the shoot must be for it to be considered "quick"
const QUICK_REQUEST_THRESHOLD_HOURS = 48;

const createQuickShootRequest = async (payload: QuickShootRequestInput) => {

  console.log({payload})
  const booking = await Booking.findById(payload.bookingId);

  if (!booking || booking.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Booking not found.");
  }

  if (String(booking.userId) !== String(payload.requestedBy)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You can only request a reschedule for your own booking."
    );
  }

  // Only bookings that are still active/ongoing can be rescheduled
  const nonReschedulableStatuses = [
    BookingStatus.CANCELLED,
    BookingStatus.COMPLETED,
    BookingStatus.REJECTED,
  ];

  if (nonReschedulableStatuses.includes(booking.status)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `This booking cannot be rescheduled because of its current status (${booking.status}).`
    );
  }

  // Prevent stacking multiple pending reschedule requests on one booking
  if (booking.rescheduleRequest && booking.rescheduleRequest.status === "pending") {
    throw new AppError(
      httpStatus.CONFLICT,
      "A reschedule request is already pending. Resolve it before creating a new one."
    );
  }

  const requestedDate = new Date(payload.requestedBookingDate);
  const now = new Date();

  if (requestedDate.getTime() <= now.getTime()) {
    throw new AppError(httpStatus.BAD_REQUEST, "Requested shoot date must be in the future.");
  }

  // "Quick" only applies when the new date is earlier than the current booking date
  const isExpediteRequest = requestedDate.getTime() < new Date(booking.bookingDate).getTime();

  if (!isExpediteRequest) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A quick shoot request can only be made when the new date is earlier than the current booking date."
    );
  }

  const hoursUntilRequestedShoot = (requestedDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  const isUrgent = hoursUntilRequestedShoot <= QUICK_REQUEST_THRESHOLD_HOURS;

  // Save previous schedule + new requested schedule into rescheduleRequest
  booking.rescheduleRequest = {
    requestedBy: new Types.ObjectId(payload.requestedBy),
    previousBookingDate: booking.bookingDate,
    previousStartTime: booking.startTime,
    previousEndTime: booking.endTime,
    requestedBookingDate: requestedDate,
    requestedStartTime: payload.requestedStartTime,
    requestedEndTime: payload.requestedEndTime,
    reason: payload.reason,
    status: "pending",
    actionAt: null,
  };

  // Log this action in status history for audit trail
  booking.statusHistory.push({
    status: booking.status, // booking status itself doesn't change, only the reschedule request is added
    actionBy: payload.requestedBy,
    note: isUrgent
      ? `Quick shoot request: moved up from ${booking.bookingDate.toDateString()} to ${requestedDate.toDateString()} (urgent — only ${Math.round(
          hoursUntilRequestedShoot
        )} hours away).`
      : `Reschedule requested: ${booking.bookingDate.toDateString()} → ${requestedDate.toDateString()}`,
  });

  await booking.save();

  notifyBookingParties({
    actorId: payload.requestedBy,
    bookingCustomerId: booking.userId.toString(),
    bookingSnapperId: booking.snapperId.toString(),
    text: isUrgent
      ? `Urgent: the customer wants to move booking ${booking.bookingId} up to ${requestedDate.toDateString()} (${payload.requestedStartTime} - ${payload.requestedEndTime}), only ${Math.round(
          hoursUntilRequestedShoot
        )} hours away. Please respond soon.`
      : `The customer has requested to reschedule booking ${booking.bookingId} to ${requestedDate.toDateString()} (${payload.requestedStartTime} - ${payload.requestedEndTime}).`,
    type: NotificationType.QUICK_SHOOT_REQUEST,
  });

  return booking;
};

const getMyQuickShootRequests = async (payload: GetMyQuickShootRequestsPayload) => {
  const { userId, role, status } = payload;

  // Build the base filter depending on whether the requester is the customer or the snapper
  const baseFilter: Record<string, any> = {
    isDeleted: false,
    rescheduleRequest: { $ne: null },
  };

  if (role === "admin") {
    // admin can see all quick shoot requests, no owner restriction
  } else if (role === "snapper") {
    baseFilter.snapperId = userId;
  } else {
    baseFilter.userId = userId;
  }

  if (status) {
    baseFilter["rescheduleRequest.status"] = status;
  }

  const bookings = await Booking.find(baseFilter)
    .select(
      "bookingId userId snapperId fullName bookingDate startTime endTime status rescheduleRequest"
    )
    .populate("userId", "fullName email")
    .populate("snapperId", "fullName email")
    .sort({ "rescheduleRequest.actionAt": -1, createdAt: -1 });

  return bookings;
};


// ==========================
// Accept quick shoot request
// ==========================
const acceptQuickShootRequest = async (payload: RescheduleActionInput) => {
  const booking = await Booking.findById(payload.bookingId);

  if (!booking || booking.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Booking not found.");
  }

  if (!payload.isAdmin && String(booking.snapperId) !== String(payload.actionBy)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only this booking's snapper can accept its reschedule request."
    );
  }

  const request = booking.rescheduleRequest;

  if (!request || request.status !== "pending") {
    throw new AppError(httpStatus.BAD_REQUEST, "No pending reschedule request found for this booking.");
  }

  if (!request.requestedBookingDate || !request.requestedStartTime || !request.requestedEndTime) {
    throw new AppError(httpStatus.BAD_REQUEST, "Reschedule request is missing requested schedule details.");
  }

  // Apply the requested schedule as the actual booking schedule
  booking.bookingDate = request.requestedBookingDate;
  booking.startTime = request.requestedStartTime;
  booking.endTime = request.requestedEndTime;

  // Mark the reschedule request as accepted
  booking.rescheduleRequest.status = "accepted";
  booking.rescheduleRequest.actionAt = new Date();

  // Log the schedule change in status history
  booking.statusHistory.push({
    status: booking.status, // booking status stays the same, only schedule changed
    actionBy: payload.actionBy,
    note: `Quick shoot request accepted. Schedule updated to ${request.requestedBookingDate?.toDateString()} (${request.requestedStartTime} - ${request.requestedEndTime}).`,
  });

  await booking.save();

  notifyBookingParties({
    actorId: payload.actionBy,
    bookingCustomerId: booking.userId.toString(),
    bookingSnapperId: booking.snapperId.toString(),
    text: `Good news! Your quick shoot request for booking ${booking.bookingId} was accepted. New schedule: ${request.requestedBookingDate?.toDateString()} (${request.requestedStartTime} - ${request.requestedEndTime}).`,
    type: NotificationType.QUICK_SHOOT_ACCEPTED,
  });

  return booking;
};

// ==========================
// Reject quick shoot request
// ==========================
const rejectQuickShootRequest = async (payload: RescheduleActionInput) => {
  const booking = await Booking.findById(payload.bookingId);

  if (!booking || booking.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Booking not found.");
  }

  if (!payload.isAdmin && String(booking.snapperId) !== String(payload.actionBy)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only this booking's snapper can reject its reschedule request."
    );
  }

  const request = booking.rescheduleRequest;

  if (!request || request.status !== "pending") {
    throw new AppError(httpStatus.BAD_REQUEST, "No pending reschedule request found for this booking.");
  }

  // Original booking date/time remains untouched on reject
  booking.rescheduleRequest.status = "rejected";
  booking.rescheduleRequest.actionAt = new Date();

  // Log the rejection in status history
  booking.statusHistory.push({
    status: booking.status, // booking status unaffected by a rejected reschedule request
    actionBy: payload.actionBy,
    note: payload.rejectionReason
      ? `Quick shoot request rejected. Reason: ${payload.rejectionReason}`
      : `Quick shoot request rejected. Original schedule (${booking.bookingDate.toDateString()}, ${booking.startTime} - ${booking.endTime}) remains unchanged.`,
  });

  await booking.save();

  notifyBookingParties({
    actorId: payload.actionBy,
    bookingCustomerId: booking.userId.toString(),
    bookingSnapperId: booking.snapperId.toString(),
    text: payload.rejectionReason
      ? `Your quick shoot request for booking ${booking.bookingId} was declined: ${payload.rejectionReason}. The original schedule remains unchanged.`
      : `Your quick shoot request for booking ${booking.bookingId} was declined. The original schedule remains unchanged.`,
    type: NotificationType.QUICK_SHOOT_REJECTED,
  });

  return booking;
};

export const bookingService = {
  createBooking,
  getMyBookingsAsCustomer,
  getMyBookingsAsSnapper,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  submitDelivery,
  acceptDelivery,
  rejectDelivery,
  getDeliveryHistory,
  recordUploadedDeliveryAssets,
  uploadDeliveryAssetsToGallery,
  resolveDeliveryAssetPath,
  deleteGalleryAssets,
  autoAcceptOverdueDeliveries,
  getSnapperBookingStats,
  getMyRecentBookings,
  createQuickShootRequest,
  getMyQuickShootRequests,
  acceptQuickShootRequest,
  rejectQuickShootRequest
};
