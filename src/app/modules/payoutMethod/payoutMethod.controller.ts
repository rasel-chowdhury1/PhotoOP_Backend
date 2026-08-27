import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { payoutMethodService } from "./payoutMethod.service";

const createPayoutMethod = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await payoutMethodService.createPayoutMethod(userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Payout method added successfully",
    data: result,
  });
});

const getMyPayoutMethods = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await payoutMethodService.getMyPayoutMethods(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payout methods retrieved successfully",
    data: result,
  });
});

const getAllPayoutMethods = catchAsync(async (req: Request, res: Response) => {
  const { meta, result } = await payoutMethodService.getAllPayoutMethods(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payout methods retrieved successfully",
    meta,
    data: result,
  });
});

const updatePayoutMethod = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.user;
  const result = await payoutMethodService.updatePayoutMethod(id, userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payout method updated successfully",
    data: result,
  });
});

const deletePayoutMethod = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.user;
  await payoutMethodService.deletePayoutMethod(id, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payout method deleted successfully",
    data: null,
  });
});

const setDefaultPayoutMethod = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.user;
  const result = await payoutMethodService.setDefaultPayoutMethod(id, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Default payout method updated",
    data: result,
  });
});

const verifyPayoutMethod = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await payoutMethodService.verifyPayoutMethod(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payout method verified",
    data: result,
  });
});

export const payoutMethodController = {
  createPayoutMethod,
  getMyPayoutMethods,
  getAllPayoutMethods,
  updatePayoutMethod,
  deletePayoutMethod,
  setDefaultPayoutMethod,
  verifyPayoutMethod,
};
