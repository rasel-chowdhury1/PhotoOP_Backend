import { Schema, model } from "mongoose";
import { IFaq } from "./faq.interface";

const faqSchema = new Schema<IFaq>(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['user', 'snapper'],
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Faq = model<IFaq>("Faq", faqSchema);

export default Faq;
