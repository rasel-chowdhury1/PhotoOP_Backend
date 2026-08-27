import { Router } from "express";
import auth from "../../middleware/auth";
import { walletController } from "./wallet.controller";
import { USER_ROLE } from "../user/user.constants";

export const walletRoutes = Router();

walletRoutes
  .get("/", auth(USER_ROLE.SNAPPER), walletController.getMyWallet)
  .get("/transactions", auth(USER_ROLE.SNAPPER), walletController.getMyTransactions);
