import httpStatus from "http-status";
import QueryBuilder from "../../builder/QueryBuilder";
import ServiceCharge from "./serviceCharge.model";
import { IServiceCharge } from "./serviceCharge.interface";
import AppError from "../../error/AppError";

const createServiceCharge = async (payload: Partial<IServiceCharge>) => {
  const result = await ServiceCharge.create(payload);
  return result;
};

const getAllServiceCharges = async (query: Record<string, unknown>) => {
  const chargeQuery = new QueryBuilder(ServiceCharge.find(), query)
    .search(["name"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await chargeQuery.modelQuery;
  const meta = await chargeQuery.countTotal();
  return { meta, result };
};

const getServiceChargeById = async (id: string) => {
  const result = await ServiceCharge.findById(id);
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "Service charge not found");
  }
  return result;
};

// booking.service.ts calls this at booking-creation time to get the currently
// applicable charge — assumes a single active charge convention (isActive: true)
const getActiveServiceCharge = async () => {
  const result = await ServiceCharge.findOne({ isActive: true }).sort({ createdAt: -1 });
  return result; // can be null — caller must handle "no active charge" as zero charge
};

const updateServiceCharge = async (id: string, payload: Partial<IServiceCharge>) => {
  const result = await ServiceCharge.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true, // never skip this — silent invalid enum/status writes are a real bug class here
  });
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "Service charge not found");
  }
  return result;
};

const deleteServiceCharge = async (id: string) => {
  const result = await ServiceCharge.findByIdAndDelete(id);
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "Service charge not found");
  }
  return result;
};

export const ServiceChargeServices = {
  createServiceCharge,
  getAllServiceCharges,
  getServiceChargeById,
  getActiveServiceCharge,
  updateServiceCharge,
  deleteServiceCharge,
};