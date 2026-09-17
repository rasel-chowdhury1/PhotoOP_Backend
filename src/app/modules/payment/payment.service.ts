import Stripe from "stripe";
import httpStatus from "http-status";
import AppError from "../../error/AppError";
import config from "../../config";
import QueryBuilder from "../../builder/QueryBuilder";
import Payment from "./payment.model";
import Booking from "../booking/booking.model";
import Notification from "../notifications/notifications.model";
import { PaymentGateway, PaymentStatus, PaymentType } from "./payment.interface";
import {
  ALLOWED_TRANSITIONS,
  BookingStatus,
  PaymentStatus as BookingPaymentStatus,
} from "../booking/booking.interface";
import { emitNotification } from "../../../socketIo";
import mongoose, { Types } from "mongoose";
import { NotificationType } from "../notifications/notifications.interface";
import { StoragePlan } from "../snapperProfile/snapperProfile.interface";
import { STORAGE_PLAN_CONFIG } from "../snapperProfile/snapperProfile.constant";
import { snapperProfileService } from "../snapperProfile/snapperProfile.service";
import { walletService } from "../wallet/wallet.service";

// lazy singleton: constructing Stripe with a blank key throws immediately, so this must
// NOT run at module load time (would crash the whole server on boot while STRIPE_API_SECRET
// is unset) — only when a request actually needs to talk to Stripe
let stripeClient: Stripe | null = null;
const getStripeClient = (): Stripe => {
  if (!config.stripe_secret) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Stripe is not configured (STRIPE_API_SECRET is missing)"
    );
  }
  if (!stripeClient) {
    stripeClient = new Stripe(config.stripe_secret);
  }
  return stripeClient;
};

const generatePaymentNumber = () =>
  `PAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

// creates a Payment record (PENDING) + a Stripe Checkout Session for a just-created
// booking, and returns the hosted checkout URL the client should redirect to.
// cleans up the Payment record it created if the Stripe API call itself fails, so a
// misconfigured/unreachable Stripe never leaves an orphaned PENDING payment behind.
const createCheckoutSessionForBooking = async (
  booking: { _id: unknown; bookingId: string; totalPrice: number },
  customerUserId: string
) => {
  const stripe = getStripeClient();

  const payment = await Payment.create({
    paymentNumber: generatePaymentNumber(),
    userId: customerUserId,
    bookingId: booking._id,
    paymentType: PaymentType.BOOKING,
    amount: booking.totalPrice,
    currency: "USD",
    gateway: PaymentGateway.STRIPE,
    status: PaymentStatus.PENDING,
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `PhotoOp Booking ${booking.bookingId}` },
            unit_amount: Math.round(booking.totalPrice * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${config.payment_success_url}?bookingId=${booking._id}&paymentId=${payment._id}`,
      cancel_url: `${config.payment_cancel_url}?bookingId=${booking._id}&paymentId=${payment._id}`,
      client_reference_id: String(booking._id),
      metadata: {
        bookingId: String(booking._id),
        paymentId: String(payment._id),
      },
    });

    payment.checkoutSessionId = session.id;
    await payment.save();

    return { payment, checkoutUrl: session.url as string };
  } catch (error) {
    await Payment.deleteOne({ _id: payment._id });
    throw error;
  }
};

// creates a Payment record (PENDING) + a Stripe Checkout Session for a snapper
// purchasing/renewing a storage plan, mirroring createCheckoutSessionForBooking above.
// priceUSD in STORAGE_PLAN_CONFIG is treated as a monthly rate, so the charged amount
// scales with durationMonths.
const createCheckoutSessionForStoragePlan = async (
  snapperUserId: string,
  plan: StoragePlan,
  durationMonths: number
) => {
  const planConfig = STORAGE_PLAN_CONFIG[plan];
  if (!planConfig) {
    throw new AppError(httpStatus.BAD_REQUEST, `Unknown storage plan: ${plan}`);
  }
  if (!Number.isInteger(durationMonths) || durationMonths < 1) {
    throw new AppError(httpStatus.BAD_REQUEST, "durationMonths must be a positive integer");
  }

  const stripe = getStripeClient();
  const amount = planConfig.priceUSD * durationMonths;

  const payment = await Payment.create({
    paymentNumber: generatePaymentNumber(),
    userId: snapperUserId,
    paymentType: PaymentType.STORAGE_UPGRADE,
    storagePlan: plan,
    durationMonths,
    amount,
    currency: "USD",
    gateway: PaymentGateway.STRIPE,
    status: PaymentStatus.PENDING,
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `PhotoOp Storage Plan ${plan} (${durationMonths} month${durationMonths > 1 ? "s" : ""})`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${config.payment_success_url}?paymentId=${payment._id}`,
      cancel_url: `${config.payment_cancel_url}?paymentId=${payment._id}`,
      client_reference_id: String(payment._id),
      metadata: {
        paymentId: String(payment._id),
        storagePlan: plan,
        durationMonths: String(durationMonths),
      },
    });

    payment.checkoutSessionId = session.id;
    await payment.save();

    return { payment, checkoutUrl: session.url as string };
  } catch (error) {
    await Payment.deleteOne({ _id: payment._id });
    throw error;
  }
};

const markPaymentSucceeded = async (session: Stripe.Checkout.Session) => {
  const payment = await Payment.findOne({ checkoutSessionId: session.id });
  if (!payment || payment.status === PaymentStatus.SUCCEEDED) {
    return;
  }

  payment.status = PaymentStatus.SUCCEEDED;
  payment.paidAt = new Date();
  const transactionId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (transactionId) {
    payment.transactionId = transactionId;
  }
  await payment.save();

  if (payment.paymentType === PaymentType.STORAGE_UPGRADE) {
    await snapperProfileService.upgradeStoragePlan(
      String(payment.userId),
      payment.storagePlan as StoragePlan,
      payment.durationMonths as number
    );
    return;
  }

  if (!payment.bookingId) {
    return;
  }

  // ============================================
  // UPDATE BOOKING PAYMENT STATUS
  // ============================================

  const updatedBooking = await Booking.findOneAndUpdate(
    {
      _id: payment.bookingId,
      isDeleted: false,
    },
    {
      $set: {
        paymentId: payment._id,
        paymentStatus: BookingPaymentStatus.PAID,
      },
    },
    {
      new: true,
    },
  );

  if (!updatedBooking) {
    return;
  }

  // covers the (rare) case where the Stripe webhook lands AFTER delivery was already
  // completed — completeBookingDelivery's own call to this already handles the normal
  // order. No-ops unless status is also already COMPLETED; idempotent either way via
  // Booking.earningsCreditedAt. Own transaction since this function has no session.
  if (updatedBooking.status === BookingStatus.COMPLETED) {
    const earningSession = await mongoose.startSession();
    try {
      await earningSession.withTransaction(async () => {
        await walletService.creditBookingEarning(updatedBooking._id, earningSession);
      });
    } catch (error) {
      console.error(
        `Failed to credit wallet earning for booking ${updatedBooking._id} after payment success:`,
        error
      );
    } finally {
      await earningSession.endSession();
    }
  }

    // ============================================
  // SEND PAYMENT SUCCESS NOTIFICATION
  // ============================================

  emitNotification({
    userId: updatedBooking.userId as Types.ObjectId,
    receiverId: updatedBooking.snapperId as Types.ObjectId,

    userMsg: {
      image: '',
      text: `Payment for booking ${updatedBooking.bookingId} has been successfully completed. Please review and accept the booking request.`,
      photos: [],
    },

    type: NotificationType.BOOKING_CONFIRMED,
  }).catch((error) => {
    console.error(
      'Failed to send payment success notification:',
      error,
    );
  });

  emitNotification({
    userId: updatedBooking.snapperId as Types.ObjectId,
    receiverId: updatedBooking.userId as Types.ObjectId,

    userMsg: {
      image: '',
      text: `Your payment for booking ${updatedBooking.bookingId} was successful.`,
      photos: [],
    },

    type: NotificationType.BOOKING_CONFIRMED,
  }).catch((error) => {
    console.error(
      'Failed to send payment success notification to user:',
      error,
    );
  });

};

// payment failed/abandoned: mark it FAILED and auto-cancel the booking it was for,
// freeing up that time slot (per product decision — failed payment shouldn't hold a slot)
const markPaymentFailedAndCancelBooking = async (checkoutSessionId: string, reason: string) => {
  const payment = await Payment.findOne({ checkoutSessionId });
  if (!payment || payment.status === PaymentStatus.SUCCEEDED) {
    return;
  }

  payment.status = PaymentStatus.FAILED;
  await payment.save();

  if (!payment.bookingId) {
    return;
  }

  const booking = await Booking.findOne({ _id: payment.bookingId, isDeleted: false });
  if (!booking) {
    return;
  }

  // nothing was ever captured for an expired/abandoned checkout session, so there's no
  // refund owed — just record that payment didn't happen and free the slot if the
  // booking's current status still structurally allows cancelling
  booking.paymentStatus = BookingPaymentStatus.FAILED;

  if (!(ALLOWED_TRANSITIONS[booking.status] || []).includes(BookingStatus.CANCELLED)) {
    await booking.save();
    return;
  }

  booking.status = BookingStatus.CANCELLED;
  booking.statusHistory.push({
    status: BookingStatus.CANCELLED,
    actionBy: booking.userId,
    actionAt: new Date(),
    note: reason,
  });
  booking.cancelledBy = booking.userId;
  booking.cancelledAt = new Date();
  booking.cancellationReason = reason;
  await booking.save();

    // ============================================
  // SEND BOOKING CANCELLATION NOTIFICATION
  // ============================================

  emitNotification({
    userId: booking.userId as Types.ObjectId,
    receiverId: booking.snapperId as Types.ObjectId,

    userMsg: {
      image: '',
      text: `Booking ${booking.bookingId} was cancelled: ${reason}`,
      photos: [],
    },

    type: NotificationType.BOOKING_CANCELLED,
  }).catch((error) => {
    console.error(
      'Failed to notify booking cancellation:',
      error,
    );
  });
};

const handleStripeWebhookEvent = async (rawBody: Buffer, signature: string | undefined) => {
  if (!config.stripe_webhook_secret) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Stripe webhook secret is not configured (STRIPE_WEBHOOK_SECRET is missing)"
    );
  }
  if (!signature) {
    throw new AppError(httpStatus.BAD_REQUEST, "Missing stripe-signature header");
  }

  const stripe = getStripeClient();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, config.stripe_webhook_secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid signature";
    throw new AppError(httpStatus.BAD_REQUEST, `Webhook signature verification failed: ${message}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      await markPaymentSucceeded(event.data.object as Stripe.Checkout.Session);
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await markPaymentFailedAndCancelBooking(session.id, "Payment session expired");
      break;
    }
    default:
      break; // other event types aren't relevant to the booking-payment flow
  }

  return { received: true };
};

// ---------------------------------------------------------------------------
// Transaction history
// ---------------------------------------------------------------------------

const TRANSACTION_POPULATE = [
  { path: "userId", select: "fullName email profileImage" },
  { path: "bookingId", select: "bookingId fullName snapperId userId bookingDate status totalPrice" },
];

// a customer's transactions are simply what they paid for; a snapper's transactions
// are what THEY paid for directly (e.g. a storage upgrade) plus the customer payments
// received against their own bookings (their earnings) — Payment.userId is always the
// payer, so the snapper side can only be reached via the linked booking's snapperId
const getMyTransactions = async (
  userId: string,
  role: "user" | "snapper",
  query: Record<string, unknown>
) => {
  let baseFilter: Record<string, unknown>;



  if (role === "snapper") {
    const snapperBookingIds = await Booking.find({ snapperId: userId }).distinct("_id");
    baseFilter = { $or: [{ userId , status: {$ne: PaymentStatus.PENDING}}, { bookingId: { $in: snapperBookingIds } }] };
  } else {
    baseFilter = { userId, status: {$ne: PaymentStatus.PENDING} };
  }



  const paymentQuery = new QueryBuilder(
    Payment.find(baseFilter).populate(TRANSACTION_POPULATE),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await paymentQuery.modelQuery;
  const meta = await paymentQuery.countTotal();
  return { meta, result };
};

const getAllTransactions = async (query: Record<string, unknown>) => {
  const paymentQuery = new QueryBuilder(
    Payment.find().populate(TRANSACTION_POPULATE),
    query
  )
    .search(["paymentNumber", "transactionId", "checkoutSessionId"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await paymentQuery.modelQuery;
  const meta = await paymentQuery.countTotal();
  return { meta, result };
};

const getTransactionById = async (
  id: string,
  requesterId: string,
  role: "user" | "snapper" | "admin"
) => {
  const payment = await Payment.findById(id).populate(TRANSACTION_POPULATE);
  if (!payment) {
    throw new AppError(httpStatus.NOT_FOUND, "Transaction not found");
  }

  if (role === "admin") {
    return payment;
  }

  const payerId = (payment.userId as any)?._id ?? payment.userId;
  const isPayer = String(payerId) === String(requesterId);

  const booking = payment.bookingId as any;
  const bookingSnapperId = booking?.snapperId?._id ?? booking?.snapperId;
  const isBookingSnapper = Boolean(booking) && String(bookingSnapperId) === String(requesterId);

  if (!isPayer && !isBookingSnapper) {
    throw new AppError(httpStatus.FORBIDDEN, "You do not have access to this transaction");
  }

  return payment;
};

export const paymentService = {
  createCheckoutSessionForBooking,
  createCheckoutSessionForStoragePlan,
  handleStripeWebhookEvent,
  getMyTransactions,
  getAllTransactions,
  getTransactionById,
};
