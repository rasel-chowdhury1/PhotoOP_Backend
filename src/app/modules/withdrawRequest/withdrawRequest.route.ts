import { Router } from "express";
import auth from "../../middleware/auth";
import validateRequest from "../../middleware/validateRequest";
import { withdrawRequestController } from "./withdrawRequest.controller";
import { withdrawRequestValidation } from "./withdrawRequest.validation";
import { USER_ROLE } from "../user/user.constants";

export const withdrawRequestRoutes = Router();

withdrawRequestRoutes
  .post(
    "/",
    auth(USER_ROLE.SNAPPER),
    validateRequest(withdrawRequestValidation.createWithdrawValidationSchema),
    withdrawRequestController.createWithdrawRequest
  )

  .get(
    "/my-requests",
    auth(USER_ROLE.SNAPPER),
    withdrawRequestController.getMyWithdrawRequests
  )

  // admin listing — supports ?status=&snapperId=&startDate=&endDate=&searchTerm= plus
  // the standard sort/page/limit/fields QueryBuilder params
  .get(
    "/all",
    auth(USER_ROLE.ADMIN),
    withdrawRequestController.getAllWithdrawRequests
  )

  .patch(
    "/:id/cancel",
    auth(USER_ROLE.SNAPPER),
    withdrawRequestController.cancelWithdrawRequest
  )

  .patch(
    "/:id/process",
    auth(USER_ROLE.ADMIN),
    validateRequest(withdrawRequestValidation.processWithdrawValidationSchema),
    withdrawRequestController.processWithdrawRequest
  )

  .patch(
    "/:id/reject",
    auth(USER_ROLE.ADMIN),
    validateRequest(withdrawRequestValidation.rejectWithdrawValidationSchema),
    withdrawRequestController.rejectWithdrawRequest
  )

  // must stay last — a named :id route would otherwise swallow my-requests/all
  .get(
    "/:id",
    auth(USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    withdrawRequestController.getWithdrawRequestById
  );
