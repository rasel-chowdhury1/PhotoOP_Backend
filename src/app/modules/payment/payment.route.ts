import express, { Router } from "express";
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
