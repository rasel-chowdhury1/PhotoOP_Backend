import { Request, Response } from "express";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import AppError from "../../error/AppError";
import { faqService } from "./faq.service";

const createFaq = catchAsync(async (req: Request, res: Response) => {
  const result = await faqService.createFaq(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "FAQ created successfully",
    data: result,
  });
});

const getAllFaqs = catchAsync(async (req: Request, res: Response) => {
  const { meta, result } = await faqService.getAllFaqs(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "FAQs retrieved successfully",
    meta,
    data: result,
  });
});

const getFaqsByAdmin = catchAsync(async (req: Request, res: Response) => {
  const { role } = req.params;
  if (role !== "user" && role !== "snapper") {
    throw new AppError(httpStatus.BAD_REQUEST, "role must be 'user' or 'snapper'");
  }

  const { meta, result } = await faqService.getFaqsByAdmin(role, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "FAQs retrieved successfully",
    meta,
    data: result,
  });
});

const getActiveFaqs = catchAsync(async (req: Request, res: Response) => {
  const { role } = req.params;
  if (role !== "user" && role !== "snapper") {
    throw new AppError(httpStatus.BAD_REQUEST, "role must be 'user' or 'snapper'");
  }

  const { meta, result } = await faqService.getActiveFaqs(role, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "FAQs retrieved successfully",
    meta,
    data: result,
  });
});

const getFaqById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await faqService.getFaqById(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "FAQ retrieved successfully",
    data: result,
  });
});

const updateFaq = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await faqService.updateFaq(id, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "FAQ updated successfully",
    data: result,
  });
});

const deleteFaq = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  await faqService.deleteFaq(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "FAQ deleted successfully",
    data: null,
  });
});

export const faqController = {
  createFaq,
  getAllFaqs,
  getFaqsByAdmin,
  getActiveFaqs,
  getFaqById,
  updateFaq,
  deleteFaq,
};
