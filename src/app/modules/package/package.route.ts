import { Router } from "express";
import auth from "../../middleware/auth";
import validateRequest from "../../middleware/validateRequest";
import { packageController } from "./package.controller";
import { packageValidation } from "./package.validation";
import { USER_ROLE } from "../user/user.constants";

export const packageRoutes = Router();

packageRoutes
  .post(
    "/create",
    auth(USER_ROLE.SNAPPER),
    validateRequest(packageValidation.createPackageValidationSchema),
    packageController.createPackage
  )

  .get(
    "/my-packages",
    auth(USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    packageController.getMyPackages
  )

  // for customers checking a snapper's offered packages before booking
  .get(
    "/user/:userId",
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    packageController.getSpecificUserPackages
  )

  .get("/:id", packageController.getPackageById)

  .patch(
    "/:id",
    auth(USER_ROLE.SNAPPER),
    validateRequest(packageValidation.updatePackageValidationSchema),
    packageController.updatePackage
  )

  .delete(
    "/:id",
    auth(USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    packageController.deletePackage
  );
