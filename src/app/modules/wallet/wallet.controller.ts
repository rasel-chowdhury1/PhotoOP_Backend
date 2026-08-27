import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { walletService } from "./wallet.service";

// always the authenticated snapper's own wallet — snapperId is never accepted from the
// client, so one snapper can never read another's balance
const getMyWallet = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await walletService.getWalletSummary(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Wallet retrieved successfully",
    data: result,
  });
});

const getMyTransactions = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const { meta, result } = await walletService.getMyTransactions(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Wallet transactions retrieved successfully",
    meta,
    data: result,
  });
});

export const walletController = {
  getMyWallet,
  getMyTransactions,
};
