import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { storeFile } from "../../utils/fileHelper";
import { portfolioService } from "./portfolio.service";

// runs before validateRequest so an uploaded image is already a stored path by the
// time the body is validated (create requires it; update accepts it optionally)
const attachPortfolioImage = (req: Request, _res: Response, next: NextFunction) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  if (files?.image?.[0]) {
    req.body.image = storeFile("portfolio", files.image[0].filename);
  }
  next();
};

const createPortfolio = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await portfolioService.createPortfolio(req.body, userId);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Portfolio item created successfully",
    data: result,
  });
});

const getMyPortfolio = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const { meta, result } = await portfolioService.getPortfolioForUser(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Portfolio retrieved successfully",
    meta,
    data: result,
  });
});

const getPortfolioForUser = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { meta, result } = await portfolioService.getPortfolioForUser(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Portfolio retrieved successfully",
    meta,
    data: result,
  });
});

const getAllPortfolios = catchAsync(async (req: Request, res: Response) => {
  const { meta, result } = await portfolioService.getAllPortfolios(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Portfolios retrieved successfully",
    meta,
    data: result,
  });
});

const getPortfolioById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await portfolioService.getPortfolioById(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Portfolio item retrieved successfully",
    data: result,
  });
});

const updatePortfolio = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.user;
  const result = await portfolioService.updatePortfolio(id, userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Portfolio item updated successfully",
    data: result,
  });
});

const deletePortfolio = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, role } = req.user;
  await portfolioService.deletePortfolio(id, userId, role === "admin");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Portfolio item deleted successfully",
    data: null,
  });
});

export const portfolioController = {
  attachPortfolioImage,
  createPortfolio,
  getMyPortfolio,
  getPortfolioForUser,
  getAllPortfolios,
  getPortfolioById,
  updatePortfolio,
  deletePortfolio,
};
