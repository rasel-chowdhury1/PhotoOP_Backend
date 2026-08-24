import express, { Router } from "express";
import auth from "../../middleware/auth";
import { USER_ROLE } from "../user/user.constants";
import { paymentController } from "./payment.controller";

export const paymentRoutes = Router();

// NOTE: this router is mounted directly in app.ts BEFORE the global express.json()
// middleware, specifically so express.raw() below can hand Stripe's signature
// verification the untouched request body. Do not move this behind express.json().
paymentRoutes.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  paymentController.stripeWebhook
);

paymentRoutes
  // customer: only their own payments. snapper: their own direct payments (e.g. storage
  // upgrades) plus the customer payments received against their bookings (their earnings)
  .get(
    "/my-transactions",
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER),
    paymentController.getMyTransactions
  )

  .get("/all", auth(USER_ROLE.ADMIN), paymentController.getAllTransactions)

  // must stay last — a named :id route would otherwise swallow /my-transactions and /all
  .get(
    "/:id",
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    paymentController.getTransactionById
  );
