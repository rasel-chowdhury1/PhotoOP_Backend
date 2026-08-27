import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import AppError from "../../error/AppError";
import { UserRole } from "../user/user.interface";
import { analyticsService } from "./analytics.service";

// always the authenticated snapper's own data — snapperId is never accepted from the
// client (params/query/body), so a snapper can't request another snapper's analytics
const getMySnapperAnalytics = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await analyticsService.getSnapperAnalytics(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Analytics retrieved successfully",
    data: result,
  });
});

const getAdminOverview = catchAsync(async (req: Request, res: Response) => {
  const result = await analyticsService.getAdminOverview();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Admin overview retrieved successfully",
    data: result,
  });
});

const getAdminBookingEarningOverview = catchAsync(async (req: Request, res: Response) => {
  const year = req.query.year ? Number(req.query.year) : new Date().getUTCFullYear();
  const result = await analyticsService.getAdminBookingEarningOverview(year);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking & earning overview retrieved successfully",
    data: result,
  });
});

const getMonthlyUserOverview = catchAsync(async (req: Request, res: Response) => {
  const role = (req.query.role as string) || UserRole.USER;
  if (!Object.values(UserRole).includes(role as UserRole)) {
    throw new AppError(httpStatus.BAD_REQUEST, `Invalid role: ${role}`);
  }
  const year = req.query.year ? Number(req.query.year) : new Date().getUTCFullYear();

  const result = await analyticsService.getMonthlyUserOverview(role as UserRole, year);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Monthly user overview retrieved successfully",
    data: result,
  });
});

const getEarningOverviewByYear = catchAsync(async (req: Request, res: Response) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const result = await analyticsService.getEarningOverviewByYear(year);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Yearly earning overview retrieved successfully",
    data: result,
  });
});

const getAdminLifetimeEarnings = catchAsync(async (req: Request, res: Response) => {
  const { meta, result } = await analyticsService.getAdminLifetimeEarnings(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Lifetime earnings retrieved successfully",
    meta,
    data: result,
  });
});

const getBookingOverviewByYear = catchAsync(async (req: Request, res: Response) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const result = await analyticsService.getBookingOverviewByYear(year);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Yearly booking overview retrieved successfully",
    data: result,
  });
});

export const analyticsController = {
  getMySnapperAnalytics,
  getAdminOverview,
  getAdminBookingEarningOverview,
  getMonthlyUserOverview,
  getEarningOverviewByYear,
  getAdminLifetimeEarnings,
  getBookingOverviewByYear,
};
