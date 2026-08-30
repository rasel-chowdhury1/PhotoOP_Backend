import { Router } from "express";
import auth from "../../middleware/auth";
import validateRequest from "../../middleware/validateRequest";
import { faqController } from "./faq.controller";
import { faqValidation } from "./faq.validation";

export const faqRoutes = Router();

faqRoutes
  // Public route to get active FAQs for a given role (user | snapper)
  .get("/admin/role/:role", faqController.getFaqsByAdmin)
  .get("/role/:role", faqController.getActiveFaqs)

  // Admin route to get all FAQs (active and inactive, any role)
  .get("/all", auth("admin"), faqController.getAllFaqs)

  .get("/:id", faqController.getFaqById)

  .post(
    "/create",
    auth("admin"),
    validateRequest(faqValidation.createFaqValidationSchema),
    faqController.createFaq
  )

  .patch(
    "/:id",
    auth("admin"),
    validateRequest(faqValidation.updateFaqValidationSchema),
    faqController.updateFaq
  )

  .delete("/:id", auth("admin"), faqController.deleteFaq);
