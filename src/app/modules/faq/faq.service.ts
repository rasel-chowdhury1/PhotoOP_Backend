import AppError from "../../error/AppError";
import httpStatus from "http-status";
import QueryBuilder from "../../builder/QueryBuilder";
import Faq from "./faq.model";
import { IFaq } from "./faq.interface";

const createFaq = async (payload: IFaq) => {
  const faq = new Faq(payload);
  return await faq.save();
};

const getAllFaqs = async (query: Record<string, unknown>) => {
  const faqQuery = new QueryBuilder(Faq.find(), query)
    .search(["question", "answer"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await faqQuery.modelQuery;
  const meta = await faqQuery.countTotal();
  return { meta, result };
};

const getActiveFaqs = async (role: "user" | "snapper", query: Record<string, unknown>,) => {
  const faqQuery = new QueryBuilder(Faq.find({ isActive: true, role }), query)
    .search(["question", "answer"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await faqQuery.modelQuery;
  const meta = await faqQuery.countTotal();
  return { meta, result };
};

const getFaqsByAdmin = async (role: "user" | "snapper", query: Record<string, unknown>,) => {
  const faqQuery = new QueryBuilder(Faq.find({  role }), query)
    .search(["question", "answer"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await faqQuery.modelQuery;
  const meta = await faqQuery.countTotal();
  return { meta, result };
};

const getFaqById = async (id: string) => {
  const faq = await Faq.findById(id);
  if (!faq) {
    throw new AppError(httpStatus.NOT_FOUND, "FAQ not found");
  }
  return faq;
};

const updateFaq = async (id: string, payload: Partial<IFaq>) => {
  const faq = await Faq.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
  if (!faq) {
    throw new AppError(httpStatus.NOT_FOUND, "FAQ not found");
  }
  return faq;
};

const deleteFaq = async (id: string) => {
  const faq = await Faq.findByIdAndDelete(id);
  if (!faq) {
    throw new AppError(httpStatus.NOT_FOUND, "FAQ not found");
  }
  return;
};

export const faqService = {
  createFaq,
  getAllFaqs,
  getFaqsByAdmin,
  getActiveFaqs,
  getFaqById,
  updateFaq,
  deleteFaq,
};
