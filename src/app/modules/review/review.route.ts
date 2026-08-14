import { Router } from "express";
import auth from "../../middleware/auth";
import validateRequest from "../../middleware/validateRequest";
import { reviewController } from "./review.controller";
import { reviewValidation } from "./review.validation";

export const reviewRoutes = Router();

reviewRoutes
  .post(
    "/create",
    auth("user", "snapper", "admin"),
    validateRequest(reviewValidation.createReviewValidationSchema),
    reviewController.createReview
  )

  // must come before /:id below, or "my-reviews" gets swallowed as an id
  .get("/my-reviews", auth("user", "snapper", "admin"), reviewController.getMyReviews)

  // Public route to see the reviews a user/snapper has received
  .get("/received/:receiverId", reviewController.getReviewsForReceiver)

  // Public route to see the reviews a user/snapper has given
  .get("/given/:reviewerId", reviewController.getReviewsByReviewer)

  .get("/all", auth("admin"), reviewController.getAllReviews)

  .get("/:id", reviewController.getReviewById)

  .patch(
    "/:id",
    auth("user", "snapper", "admin"),
    validateRequest(reviewValidation.updateReviewValidationSchema),
    reviewController.updateReview
  )

  .delete("/:id", auth("user", "snapper", "admin"), reviewController.deleteReview);
