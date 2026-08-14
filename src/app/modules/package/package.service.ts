import httpStatus from "http-status";
import AppError from "../../error/AppError";
import QueryBuilder from "../../builder/QueryBuilder";
import Package from "./package.model";
import SnapperProfile from "../snapperProfile/snapperProfile.model";
import { User } from "../user/user.model";
import { UserRole } from "../user/user.interface";
import { IPackage } from "./package.interface";

type PackageWritablePayload = Pick<
  IPackage,
  "packageName" | "description" | "price" | "durationValue" | "durationUnit" | "isActive"
>;

const createPackage = async (payload: PackageWritablePayload, userId: string) => {
  const snapperProfile = await SnapperProfile.findOne({ userId });
  if (!snapperProfile) {
    throw new AppError(httpStatus.NOT_FOUND, "Snapper profile not found");
  }

  const newPackage = await Package.create({ ...payload, userId });

  // keep SnapperProfile.packageIds in sync with the packages that actually exist
  await SnapperProfile.findByIdAndUpdate(snapperProfile._id, {
    $addToSet: { packageIds: newPackage._id },
  });

  return newPackage;
};

const getMyPackages = async (userId: string, query: Record<string, unknown>) => {
  const packageQuery = new QueryBuilder(
    Package.find({ userId, isDeleted: false }),
    query
  )
    .search(["packageName", "description"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await packageQuery.modelQuery;
  const meta = await packageQuery.countTotal();
  return { meta, result };
};

// for customers browsing a snapper's profile before booking — only their active,
// publicly-offered packages, not ones they've disabled or deleted
const getSpecificUserPackages = async (userId: string, query: Record<string, unknown>) => {
  const snapper = await User.findOne({ _id: userId, role: UserRole.SNAPPER });
  if (!snapper) {
    throw new AppError(httpStatus.NOT_FOUND, "Snapper not found");
  }

  const packageQuery = new QueryBuilder(
    Package.find({ userId, isDeleted: false, isActive: true }),
    query
  )
    .search(["packageName", "description"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await packageQuery.modelQuery;
  const meta = await packageQuery.countTotal();
  return { meta, result };
};

const getPackageById = async (id: string) => {
  const pkg = await Package.findOne({ _id: id, isDeleted: false });
  if (!pkg) {
    throw new AppError(httpStatus.NOT_FOUND, "Package not found");
  }
  return pkg;
};

const updatePackage = async (
  id: string,
  authUserId: string,
  payload: Partial<PackageWritablePayload>
) => {
  const pkg = await Package.findOne({ _id: id, isDeleted: false });
  if (!pkg) {
    throw new AppError(httpStatus.NOT_FOUND, "Package not found");
  }

  if (String(pkg.userId) !== String(authUserId)) {
    throw new AppError(httpStatus.FORBIDDEN, "You can only update your own package");
  }

  if (payload.packageName !== undefined) pkg.packageName = payload.packageName;
  if (payload.description !== undefined) pkg.description = payload.description;
  if (payload.price !== undefined) pkg.price = payload.price;
  if (payload.durationValue !== undefined) pkg.durationValue = payload.durationValue;
  if (payload.durationUnit !== undefined) pkg.durationUnit = payload.durationUnit;
  if (payload.isActive !== undefined) pkg.isActive = payload.isActive;

  await pkg.save();
  return pkg;
};

const deletePackage = async (id: string, authUserId: string, isAdmin: boolean) => {
  const pkg = await Package.findOne({ _id: id, isDeleted: false });
  if (!pkg) {
    throw new AppError(httpStatus.NOT_FOUND, "Package not found");
  }

  if (!isAdmin && String(pkg.userId) !== String(authUserId)) {
    throw new AppError(httpStatus.FORBIDDEN, "You can only delete your own package");
  }

  pkg.isDeleted = true;
  pkg.isActive = false;
  await pkg.save();

  // a deleted package should no longer be referenced from the snapper's profile
  await SnapperProfile.findOneAndUpdate(
    { userId: pkg.userId },
    { $pull: { packageIds: pkg._id } }
  );
};

export const packageService = {
  createPackage,
  getMyPackages,
  getSpecificUserPackages,
  getPackageById,
  updatePackage,
  deletePackage,
};
