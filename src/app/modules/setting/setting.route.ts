import { Router } from "express";
import auth from "../../middleware/auth";
import { USER_ROLE } from "../user/user.constants";
import { settingsController } from "./setting.controller";

export const settingsRoutes = Router();

settingsRoutes
    // Route to get the privacy policy / terms / about us, per role (user | snapper)
    .get("/privacy/:role", settingsController.getPrivacyPolicy)
    .get("/termAndConditions/:role", settingsController.getTermConditions)
    .get("/aboutUs/:role", settingsController.getAboutUs)

    // Route to create or update a setting (admin only)
    .put("/", auth(USER_ROLE.ADMIN), settingsController.updateSettingsByKey);
