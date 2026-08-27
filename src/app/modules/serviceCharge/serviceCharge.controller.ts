import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { ServiceChargeServices } from "./serviceCharge.service";

const createServiceCharge = catchAsync(async (req, res) => {
  const result = await ServiceChargeServices.createServiceCharge(req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Service charge created successfully",
    data: result,
  });
});

const getAllServiceCharges = catchAsync(async (req, res) => {
  const { meta, result } = await ServiceChargeServices.getAllServiceCharges(req.query);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Service charges retrieved successfully",
    meta,
    data: result,
  });
});

const getServiceChargeById = catchAsync(async (req, res) => {
  const result = await ServiceChargeServices.getServiceChargeById(req.params.id);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Service charge retrieved successfully",
    data: result,
  });
});

const getActiveServiceCharge = catchAsync(async (req, res) => {
  const result = await ServiceChargeServices.getActiveServiceCharge();

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Active service charge retrieved successfully",
    data: result,
  });
});

const updateServiceCharge = catchAsync(async (req, res) => {
  const result = await ServiceChargeServices.updateServiceCharge(req.params.id, req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Service charge updated successfully",
    data: result,
  });
});

const deleteServiceCharge = catchAsync(async (req, res) => {
  const result = await ServiceChargeServices.deleteServiceCharge(req.params.id);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Service charge deleted successfully",
    data: result,
  });
});

export const ServiceChargeControllers = {
  createServiceCharge,
  getAllServiceCharges,
  getServiceChargeById,
  getActiveServiceCharge,
  updateServiceCharge,
  deleteServiceCharge,
};