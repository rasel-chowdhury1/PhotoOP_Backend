import httpStatus from "http-status";
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
import { getOrCreateAvailability, isOverlapping, toMinutes } from "../availability/availability.service";
import { TDayAvailability, TWeekDay } from "../availability/availability.interface";
import Notification from "../notifications/notifications.model";
import { paymentService } from "../payment/payment.service";
import { ADD_ON_CATALOG, DEFAULT_SERVICE_FEE_PERCENTAGE } from "./booking.constants";
import {
  AddOnKey,
  ALLOWED_TRANSITIONS,
  BookingStatus,
  DELIVERY_METHODS,
  DeliveryStatus,
  ICreateBookingPayload,
  ISelectedAddOn,
} from "./booking.interface";
import { IRejectDeliveryPayload, ISubmitDeliveryPayload } from "./delivery.interface";

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

const generateBookingId = () =>
  `BK-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

const resolveSelectedAddOns = (keys?: AddOnKey[]): ISelectedAddOn[] =>
  (keys || []).map((key) => ({ key, ...ADD_ON_CATALOG[key] }));

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// best-effort — a failed notification should never fail the booking action itself.
// only fires for event types the Notification model's `type` enum actually supports
// (no "booking requested"/"delivery rejected" entries exist yet, so those are skipped)
const notifyBookingParties = (params: {
  actorId: string;
  bookingCustomerId: string;
  bookingSnapperId: string;
  text: string;
  type: string;
}) => {
  const recipientIds = new Set<string>();
  if (String(params.bookingCustomerId) !== String(params.actorId)) {
    recipientIds.add(String(params.bookingCustomerId));
  }
  if (String(params.bookingSnapperId) !== String(params.actorId)) {
    recipientIds.add(String(params.bookingSnapperId));
  }

  recipientIds.forEach((receiverId) => {
    Notification.create({
      userId: params.actorId,
      receiverId,
      message: { text: params.text },
      type: params.type,
    }).catch((error) => {
      console.error("Failed to create booking notification:", error);
    });
  });
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

  const preferredDeliveryMethod = payload.preferredDeliveryMethod || DELIVERY_METHODS.IN_APP_GALLERY;

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

const getMyBookingsAsCustomer = async (userId: string, query: Record<string, unknown>) => {
  const bookingQuery = new QueryBuilder(
    Booking.find({ userId, isDeleted: false })
      .populate("snapperId", "fullName profileImage")
      .populate("packageId", "packageName price durationValue durationUnit"),
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

const getMyBookingsAsSnapper = async (snapperId: string, query: Record<string, unknown>) => {
  const bookingQuery = new QueryBuilder(
    Booking.find({ snapperId, isDeleted: false })
      .populate("userId", "fullName profileImage")
      .populate("packageId", "packageName price durationValue durationUnit"),
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

// only these transitions have a corresponding entry in the Notification model's
// `type` enum today — others are silently skipped rather than sent with a made-up type
const NOTIFICATION_TYPE_BY_STATUS: Partial<Record<BookingStatus, string>> = {
  [BookingStatus.ACCEPTED]: "booking-confirmed",
  [BookingStatus.CANCELLED]: "booking-cancelled",
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

  await booking.save();

  const notificationType = NOTIFICATION_TYPE_BY_STATUS[nextStatus];
  if (notificationType) {
    notifyBookingParties({
      actorId: authUserId,
      bookingCustomerId: booking.userId.toString(),
      bookingSnapperId: booking.snapperId.toString(),
      text: `Booking ${booking.bookingId} was ${nextStatus}.`,
      type: notificationType,
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

  if (payload.deliveryMethod === DELIVERY_METHODS.EXTERNAL_LINK) {
    if (!payload.externalDeliveryLink) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "externalDeliveryLink is required for EXTERNAL_LINK deliveries"
      );
    }
  } else if (!payload.assets || payload.assets.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "At least one asset is required for in-app gallery deliveries"
    );
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
            assets: payload.assets || [],
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
    text: `Booking ${booking.bookingId} is complete.`,
    type: "booking-completed",
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

  return Delivery.find({ bookingId }).sort({ attempt: -1 });
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

// admin tooling only (no route wired up yet) — physically deletes a delivery attempt's
// files and clears them from the document. Does not touch other attempts: a rejected
// attempt's files are kept as dispute evidence unless explicitly deleted like this.
const deleteDeliveryAssets = async (deliveryId: string) => {
  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) {
    throw new AppError(httpStatus.NOT_FOUND, "Delivery not found");
  }

  const keys = delivery.assets.map((asset) => asset.key).filter((key): key is string => !!key);
  if (keys.length > 0) {
    await storage.deleteMany(keys);
  }

  delivery.assets = [];
  delivery.coverImage = undefined;
  await delivery.save();

  return delivery;
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
  resolveDeliveryAssetPath,
  deleteDeliveryAssets,
  autoAcceptOverdueDeliveries,
};
