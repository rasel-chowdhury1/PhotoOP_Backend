import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { snapperProfileService } from "./snapperProfile.service";

const getVerifiedSnappers = catchAsync(
  async (req: Request, res: Response) => {

    console.log("hitted snapper =>>> ")
    const result =
      await snapperProfileService.getVerifiedSnappers({
        page: req.query.page
          ? Number(req.query.page)
          : 1,

        limit: req.query.limit
          ? Number(req.query.limit)
          : 12,

        search: req.query.search as string,

        specialty: req.query.specialty as string,

        sortBy: req.query.sortBy as string,

        sortOrder:
          req.query.sortOrder === "asc"
            ? "asc"
            : "desc",

        minHourlyRate: req.query.minHourlyRate
          ? Number(req.query.minHourlyRate)
          : undefined,

        maxHourlyRate: req.query.maxHourlyRate
          ? Number(req.query.maxHourlyRate)
          : undefined,
      });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Verified snappers retrieved successfully",
      data: result.data,
      meta: result.meta,
    });
  },
);

const getAvailabilityAndPackages = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const result = await snapperProfileService.getAvailabilityAndPackages(userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Availability and packages retrieved successfully",
      data: result,
    });
  },
);

const getStorageUsage = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await snapperProfileService.getStorageUsage(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Storage usage retrieved successfully",
    data: result,
  });
});

export const snapperProfileController = {
  getVerifiedSnappers,
  getAvailabilityAndPackages,
  getStorageUsage,
};