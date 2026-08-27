import { Router } from "express";
import { ServiceChargeControllers } from "./serviceCharge.controller";
import { ServiceChargeValidations } from "./serviceCharge.validation";
import auth from "../../middleware/auth";
import { USER_ROLE } from "../user/user.constants";
import validateRequest from "../../middleware/validateRequest";

const router = Router();

// public/customer-facing read — so booking-price preview screens can show it too
router.get("/active", ServiceChargeControllers.getActiveServiceCharge);

// admin-only management
router.post(
  "/",
  auth(USER_ROLE.ADMIN),
  validateRequest(ServiceChargeValidations.createServiceChargeValidationSchema),
  ServiceChargeControllers.createServiceCharge
);

router.get("/", auth(USER_ROLE.ADMIN), ServiceChargeControllers.getAllServiceCharges);

router.get("/:id", auth(USER_ROLE.ADMIN), ServiceChargeControllers.getServiceChargeById);

router.patch(
  "/:id",
  auth(USER_ROLE.ADMIN),
  validateRequest(ServiceChargeValidations.updateServiceChargeValidationSchema),
  ServiceChargeControllers.updateServiceCharge
);

router.delete("/:id", auth(USER_ROLE.ADMIN), ServiceChargeControllers.deleteServiceCharge);

export const ServiceChargeRoutes = router;