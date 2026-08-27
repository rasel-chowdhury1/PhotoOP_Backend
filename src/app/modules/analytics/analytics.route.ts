import { Router } from "express";
import auth from "../../middleware/auth";
import { USER_ROLE } from "../user/user.constants";
import { analyticsController } from "./analytics.controller";

export const analyticsRoutes = Router();

analyticsRoutes.get(
  "/snapper-overview",
  auth(USER_ROLE.SNAPPER),
  analyticsController.getMySnapperAnalytics
);

analyticsRoutes.get(
  "/admin-overview",
  auth(USER_ROLE.ADMIN),
  analyticsController.getAdminOverview
);

analyticsRoutes.get(
  "/admin-booking-earning-overview",
  auth(USER_ROLE.ADMIN),
  analyticsController.getAdminBookingEarningOverview
);

// ?role=user|snapper (defaults to "user") & ?year=YYYY (defaults to current year)
analyticsRoutes.get(
  "/users/monthly",
  auth(USER_ROLE.ADMIN),
  analyticsController.getMonthlyUserOverview
);

// ?year=YYYY (defaults to current year)
analyticsRoutes.get(
  "/earnings/yearly",
  auth(USER_ROLE.ADMIN),
  analyticsController.getEarningOverviewByYear
);

// booking volume by status, monthly — ?year=YYYY (defaults to current year)
analyticsRoutes.get(
  "/bookings/yearly",
  auth(USER_ROLE.ADMIN),
  analyticsController.getBookingOverviewByYear
);

// totals + the paginated bookings behind them. Query params:
//   ?searchTerm=   matches bookingId, the booking's fullName snapshot, the linked
//                  customer/snapper's fullName+email (User), or the payment's transactionId
//   ?snapperId=    exact match, one snapper's earnings only
//   ?userId=       exact match, one customer's bookings only
//   ?from=&to=     ISO date strings, filters on completedAt (either end optional)
//   ?sort=&page=&limit=&fields=  same as every other QueryBuilder-backed list endpoint
analyticsRoutes.get(
  "/earnings/lifetime",
  auth(USER_ROLE.ADMIN),
  analyticsController.getAdminLifetimeEarnings
);
