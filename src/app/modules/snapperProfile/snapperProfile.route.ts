import { Router } from "express";
import auth from "../../middleware/auth";
import { snapperProfileController } from "./snapperProfile.controller";
import { USER_ROLE } from "../user/user.constants";


export const snapperProfileRoutes = Router();

snapperProfileRoutes
  .get("/verified", snapperProfileController.getVerifiedSnappers)

  .get(
    "/availability-packages/:userId",
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    snapperProfileController.getAvailabilityAndPackages,
  );
