import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { packageService } from "./package.service";

const createPackage = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await packageService.createPackage(req.body, userId);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Package created successfully",
    data: result,
  });
});

const getMyPackages = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const { meta, result } = await packageService.getMyPackages(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Packages retrieved successfully",
    meta,
    data: result,
  });
});

const getSpecificUserPackages = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { meta, result } = await packageService.getSpecificUserPackages(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Packages retrieved successfully",
    meta,
    data: result,
  });
});

const getPackageById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await packageService.getPackageById(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Package retrieved successfully",
    data: result,
  });
});

const updatePackage = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.user;
  const result = await packageService.updatePackage(id, userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Package updated successfully",
    data: result,
  });
});

const deletePackage = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, role } = req.user;
  await packageService.deletePackage(id, userId, role === "admin");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Package deleted successfully",
    data: null,
  });
});

export const packageController = {
  createPackage,
  getMyPackages,
  getSpecificUserPackages,
  getPackageById,
  updatePackage,
  deletePackage,
};
