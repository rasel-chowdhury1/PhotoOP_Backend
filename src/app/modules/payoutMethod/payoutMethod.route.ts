import { Router } from "express";
import auth from "../../middleware/auth";
import validateRequest from "../../middleware/validateRequest";
import { payoutMethodController } from "./payoutMethod.controller";
import { payoutMethodValidation } from "./payoutMethod.validation";
import { USER_ROLE } from "../user/user.constants";

export const payoutMethodRoutes = Router();

payoutMethodRoutes
  .get("/my", auth(USER_ROLE.SNAPPER), payoutMethodController.getMyPayoutMethods)

  // admin listing across all snappers — ?searchTerm=&type=&status=&snapperId=&sort=&page=&limit=&fields=
  .get("/all", auth(USER_ROLE.ADMIN), payoutMethodController.getAllPayoutMethods)

  .post(
    "/",
    auth(USER_ROLE.SNAPPER),
    validateRequest(payoutMethodValidation.createPayoutMethodValidationSchema),
    payoutMethodController.createPayoutMethod
  )

  .patch(
    "/:id",
    auth(USER_ROLE.SNAPPER),
    validateRequest(payoutMethodValidation.updatePayoutMethodValidationSchema),
    payoutMethodController.updatePayoutMethod
  )

  .delete("/:id", auth(USER_ROLE.SNAPPER), payoutMethodController.deletePayoutMethod)

  .patch(
    "/:id/default",
    auth(USER_ROLE.SNAPPER),
    payoutMethodController.setDefaultPayoutMethod
  )

  // admin-only manual verification gate — see payoutMethod.service.ts's verifyPayoutMethod
  .patch(
    "/:id/verify",
    auth(USER_ROLE.ADMIN),
    payoutMethodController.verifyPayoutMethod
  );
