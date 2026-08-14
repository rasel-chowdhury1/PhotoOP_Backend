import { Schema, model } from "mongoose";
import { IPortfolio } from "./portfolio.interface";

const PortfolioSchema = new Schema<IPortfolio>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    image: {
      type: String,
      required: true,
    },

    category: {
      type: String,
      trim: true,
    },

    clickedAt: {
      type: Date,
    },

    place: {
      type: String,
      trim: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export default model<IPortfolio>("Portfolio", PortfolioSchema);