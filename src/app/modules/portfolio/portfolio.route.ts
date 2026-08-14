import { Router } from "express";
import auth from "../../middleware/auth";
import fileUpload from "../../middleware/fileUpload";
import parseData from "../../middleware/parseData";
import validateRequest from "../../middleware/validateRequest";
import { portfolioController } from "./portfolio.controller";
import { portfolioValidation } from "./portfolio.validation";
import { USER_ROLE } from "../user/user.constants";

const upload = fileUpload("./public/uploads/portfolio");

export const portfolioRoutes = Router();

portfolioRoutes
  .post(
    "/create",
    auth(USER_ROLE.SNAPPER),
    upload.fields([{ name: "image", maxCount: 1 }]),
    parseData(),
    portfolioController.attachPortfolioImage,
    validateRequest(portfolioValidation.createPortfolioValidationSchema),
    portfolioController.createPortfolio
  )

  .get(
    "/my-portfolio",
    auth(USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    portfolioController.getMyPortfolio
  )

  .get("/all", auth(USER_ROLE.ADMIN), portfolioController.getAllPortfolios)

  // public: browsing a snapper's portfolio from their profile
  .get("/user/:userId", portfolioController.getPortfolioForUser)

  .get("/:id", portfolioController.getPortfolioById)

  .patch(
    "/:id",
    auth(USER_ROLE.SNAPPER),
    upload.fields([{ name: "image", maxCount: 1 }]),
    parseData(),
    portfolioController.attachPortfolioImage,
    validateRequest(portfolioValidation.updatePortfolioValidationSchema),
    portfolioController.updatePortfolio
  )

  .delete(
    "/:id",
    auth(USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    portfolioController.deletePortfolio
  );
