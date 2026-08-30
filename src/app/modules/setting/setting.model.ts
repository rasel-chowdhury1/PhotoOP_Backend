import mongoose, { Schema, Document } from "mongoose";

// Interface for Privacy Policy
export interface ISettings extends Document {
  content: string;
  key: 'privacy_policy' | 'term_condition' | 'about_us';
  role: 'user' | 'snapper';
}

// Privacy Policy Schema
const settingsSchema = new Schema<ISettings>(
  {
    content: {
      type: String,
      required: true,
    },
    key: {
      type: String,
      enum: ['privacy_policy', 'term_condition', 'about_us'], // enum ensures that only these values are valid
      required: true,
    },
    role: {
      type: String,
      enum: ['user', 'snapper'],
      required: true,
    },
  },
  { timestamps: true }
);

// each role has its own copy of a given setting key
settingsSchema.index({ key: 1, role: 1 }, { unique: true });

const Settings = mongoose.model<ISettings>("Settings", settingsSchema);

export default Settings;
