import { Request, Response } from "express";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
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

const getActiveFaqs = catchAsync(async (req: Request, res: Response) => {
  const { meta, result } = await faqService.getActiveFaqs(req.query);

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
  getActiveFaqs,
  getFaqById,
  updateFaq,
  deleteFaq,
};
