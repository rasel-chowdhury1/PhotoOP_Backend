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

export const paymentController = {
  stripeWebhook,
};
