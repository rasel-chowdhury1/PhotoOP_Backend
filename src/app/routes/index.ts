import { Router } from "express";
import { userRoutes } from "../modules/user/user.route";
import { authRoutes } from "../modules/auth/auth.route";
import { otpRoutes } from "../modules/otp/otp.routes";
import { settingsRoutes } from "../modules/setting/setting.route";
import { notificationRoutes } from "../modules/notifications/notifications.route";
import { faqRoutes } from "../modules/faq/faq.route";
import { reviewRoutes } from "../modules/review/review.route";
import { guardianRoutes } from "../modules/guardian/guardian.route";
import path from "path";
import { snapperProfileRoutes } from "../modules/snapperProfile/snapperProfile.route";
import { portfolioRoutes } from "../modules/portfolio/portfolio.route";
import { availabilityRoutes } from "../modules/availability/availability.route";
import { packageRoutes } from "../modules/package/package.route";
import { bookingRoutes } from "../modules/booking/booking.route";

const router = Router();

const moduleRoutes = [
  {
    path: '/users',
    route: userRoutes,
  },
  {
    path: '/auth',
    route: authRoutes,
  },
  {
    path: "/otp",
    route: otpRoutes
  },
  {
    path: "/snapper-profiles",
    route: snapperProfileRoutes
  },
  {
    path: "/guardian",
    route: guardianRoutes
  },
    {
     path: "/availability",
     route: availabilityRoutes
  },
  {
    path: "/settings",
    route: settingsRoutes
  },
  {
     path: "/notifications",
     route: notificationRoutes
  },
  {
     path: "/faq",
     route: faqRoutes
  },
  {
     path: "/reviews",
     route: reviewRoutes
  },
  {
     path: "/portfolios",
     route: portfolioRoutes
  },
  {
     path: "/packages",
     route: packageRoutes
  },
  {
     path: "/bookings",
     route: bookingRoutes
  }
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;