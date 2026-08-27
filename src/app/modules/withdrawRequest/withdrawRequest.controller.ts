import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { withdrawRequestService } from "./withdrawRequest.service";

const createWithdrawRequest = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await withdrawRequestService.createWithdrawRequest(userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Withdraw request submitted successfully",
    data: result,
  });
});

const getMyWithdrawRequests = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const { meta, result } = await withdrawRequestService.getMyWithdrawRequests(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Withdraw requests retrieved successfully",
    meta,
    data: result,
  });
});

const getAllWithdrawRequests = catchAsync(async (req: Request, res: Response) => {
  const { meta, result } = await withdrawRequestService.getAllWithdrawRequests(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Withdraw requests retrieved successfully",
    meta,
    data: result,
  });
});

const getWithdrawRequestById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, role } = req.user;
  const result = await withdrawRequestService.getWithdrawRequestById(id, userId, role === "admin");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Withdraw request retrieved successfully",
    data: result,
  });
});

const cancelWithdrawRequest = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.user;
  const result = await withdrawRequestService.cancelWithdrawRequest(id, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Withdraw request cancelled",
    data: result,
  });
});

const processWithdrawRequest = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId: adminId } = req.user;

  const result = await withdrawRequestService.processWithdrawRequest(id, adminId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Withdraw request marked as ${req.body.status}`,
    data: result,
  });
});

const rejectWithdrawRequest = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId: adminId } = req.user;
  const { adminNote } = req.body;
  const result = await withdrawRequestService.rejectWithdrawRequest(id, adminId, adminNote);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Withdraw request rejected",
    data: result,
  });
});

export const withdrawRequestController = {
  createWithdrawRequest,
  getMyWithdrawRequests,
  getAllWithdrawRequests,
  getWithdrawRequestById,
  cancelWithdrawRequest,
  processWithdrawRequest,
  rejectWithdrawRequest,
};
