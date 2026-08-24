import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
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

export const analyticsController = {
  getMySnapperAnalytics,
};
