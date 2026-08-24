import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { paymentService } from "./payment.service";

// req.body is a raw Buffer here (see payment.route.ts's express.raw() middleware),
// required for Stripe's signature verification — do not apply express.json() to this route
const stripeWebhook = catchAsync(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string | undefined;
  const result = await paymentService.handleStripeWebhookEvent(req.body, signature);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Webhook processed",
    data: result,
  });
});

const getMyTransactions = catchAsync(async (req: Request, res: Response) => {
  const { userId, role } = req.user;
  const result = await paymentService.getMyTransactions(
    userId,
    role as "user" | "snapper",
    req.query
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Transactions retrieved successfully",
    data: result,
  });
});

const getAllTransactions = catchAsync(async (req: Request, res: Response) => {
  const result = await paymentService.getAllTransactions(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Transactions retrieved successfully",
    data: result,
  });
});

const getTransactionById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, role } = req.user;
  const result = await paymentService.getTransactionById(
    id,
    userId,
    role as "user" | "snapper" | "admin"
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Transaction retrieved successfully",
    data: result,
  });
});

export const paymentController = {
  stripeWebhook,
  getMyTransactions,
  getAllTransactions,
  getTransactionById,
};
