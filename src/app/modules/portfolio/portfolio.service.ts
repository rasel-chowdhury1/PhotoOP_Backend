import httpStatus from "http-status";
import AppError from "../../error/AppError";
import QueryBuilder from "../../builder/QueryBuilder";
import Portfolio from "./portfolio.model";
import { IPortfolio } from "./portfolio.interface";

const createPortfolio = async (
  payload: Pick<IPortfolio, "image" | "category" | "place" | "clickedAt">,
  userId: string
) => {
  return await Portfolio.create({ ...payload, userId });
};

const getPortfolioForUser = async (userId: string, query: Record<string, unknown>) => {
  const portfolioQuery = new QueryBuilder(
    Portfolio.find({ userId, isDeleted: false }),
    query
  )
    .search(["category", "place"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await portfolioQuery.modelQuery;
  const meta = await portfolioQuery.countTotal();
  return { meta, result };
};

const getAllPortfolios = async (query: Record<string, unknown>) => {
  const portfolioQuery = new QueryBuilder(
    Portfolio.find({ isDeleted: false }).populate("userId", "fullName profileImage"),
    query
  )
    .search(["category", "place"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await portfolioQuery.modelQuery;
  const meta = await portfolioQuery.countTotal();
  return { meta, result };
};

const getPortfolioById = async (id: string) => {
  const portfolio = await Portfolio.findOne({ _id: id, isDeleted: false }).populate(
    "userId",
    "fullName profileImage"
  );

  if (!portfolio) {
    throw new AppError(httpStatus.NOT_FOUND, "Portfolio item not found");
  }
  return portfolio;
};

const updatePortfolio = async (
  id: string,
  authUserId: string,
  payload: Partial<Pick<IPortfolio, "image" | "category" | "place" | "clickedAt">>
) => {
  const portfolio = await Portfolio.findOne({ _id: id, isDeleted: false });
  if (!portfolio) {
    throw new AppError(httpStatus.NOT_FOUND, "Portfolio item not found");
  }

  if (String(portfolio.userId) !== String(authUserId)) {
    throw new AppError(httpStatus.FORBIDDEN, "You can only update your own portfolio item");
  }

  if (payload.image !== undefined) portfolio.image = payload.image;
  if (payload.category !== undefined) portfolio.category = payload.category;
  if (payload.place !== undefined) portfolio.place = payload.place;
  if (payload.clickedAt !== undefined) portfolio.clickedAt = payload.clickedAt;

  await portfolio.save();
  return portfolio;
};

const deletePortfolio = async (id: string, authUserId: string, isAdmin: boolean) => {
  const portfolio = await Portfolio.findOne({ _id: id, isDeleted: false });
  if (!portfolio) {
    throw new AppError(httpStatus.NOT_FOUND, "Portfolio item not found");
  }

  if (!isAdmin && String(portfolio.userId) !== String(authUserId)) {
    throw new AppError(httpStatus.FORBIDDEN, "You can only delete your own portfolio item");
  }

  portfolio.isDeleted = true;
  await portfolio.save();
};

export const portfolioService = {
  createPortfolio,
  getPortfolioForUser,
  getAllPortfolios,
  getPortfolioById,
  updatePortfolio,
  deletePortfolio,
};
