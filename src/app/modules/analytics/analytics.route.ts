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
