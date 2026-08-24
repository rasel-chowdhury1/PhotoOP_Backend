import bcrypt from "bcrypt";
import { Schema, model } from "mongoose";
import config from "../../config";
import {
  AdminApprovalStatus,
  GuardianApprovalStatus,
  TUser,
  UserModel,
  UserRole,
  UserStatus,
} from "./user.interface";

const ApprovalHistorySchema = new Schema(
  {
    status: {
      type: String,
      enum: Object.values(AdminApprovalStatus),
      required: true,
    },

    reason: {
      type: String,
      default: null,
    },

    actionBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    actionAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

const EmergencyContactSchema = new Schema(
  {
    name: String,
    phoneNumber: String,
  },
  {
    _id: false,
  }
);

const SocialLinksSchema = new Schema(
  {
    instagram: { type: String, default: "" },
    tiktok: { type: String, default: "" },
    youtube: { type: String, default: "" },
    facebook: { type: String, default: "" },
    website: { type: String, default: "" },
  },
  {
    _id: false,
  }
);

const NotificationPreferencesSchema = new Schema(
  {
    bookingUpdates: { type: Boolean, default: true },
    messageAlerts: { type: Boolean, default: true },
    promotionalOffers: { type: Boolean, default: true },
  },
  {
    _id: false,
  }
);

const NotificationSettingsSchema = new Schema(
  {
    pushEnabled: { type: Boolean, default: true },
    preferences: { type: NotificationPreferencesSchema, default: () => ({}) },
  },
  {
    _id: false,
  }
);

const GuardianSchema = new Schema(
  {
    name: {
      type: String,
      default: "",
    },

    email: {
      type: String,
      default: "",
    },

    relation: {
      type: String,
      default: "",
    },

    phoneNumber: {
      type: String,
      default: "",
    },

    // Uploaded government-issued ID
    idImage: {
      type: String,
      default: "",
    },

    emergencyContact: EmergencyContactSchema,

    status: {
      type: String,
      enum: Object.values(GuardianApprovalStatus),
      default: GuardianApprovalStatus.PENDING,
    },

    statusReason: {
      type: String,
      default: null,
    },

    statusAt: {
      type: Date,
      default: null,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

const UserSchema = new Schema<TUser, UserModel>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: Object.values(UserRole),
      required: true,
    },

    // set once the matching SnapperProfile is created (role === UserRole.SNAPPER only)
    snapperId: {
      type: Schema.Types.ObjectId,
      ref: "SnapperProfile",
      default: null,
    },

    about: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },

    profileImage: {
      type: String,
      default: ""
    },

    coverPhoto: {
      type: String,
      default: ""
    },

    dateOfBirth: {
      type: Date,
      required: false
    },

    guardian: GuardianSchema,

    countryCode: {
      type: String,
      default: ""
    },

    phoneNumber: {
      type: String,
      default: ""
    },

    address: {
      type: String,
      default: ""
    },

    // this device's push token, kept current on every successful login (see auth.service.ts)
    fcmToken: {
      type: String,
      default: ""
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },

      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },

    socialLinks: {
      type: SocialLinksSchema,
      default: () => ({}),
    },

    totalReview: {
      type: Number,
      default: 0,
    },

    averageRating: {
      type: Number,
      default: 0,
    },

    favoriteUsers: {
      type: [Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },

    notificationSettings: {
      type: NotificationSettingsSchema,
      default: () => ({}),
    },

    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ACTIVE,
    },

    adminApproval: {
      type: String,
      enum: Object.values(AdminApprovalStatus),
      default: function (this: { role?: UserRole }) {
        return this.role === UserRole.SNAPPER
          ? AdminApprovalStatus.PENDING
          : AdminApprovalStatus.APPROVED;
      },
    },

    approvalHistory: [ApprovalHistorySchema],

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ location: "2dsphere" });

UserSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(
      this.password,
      Number(config.bcrypt_salt_rounds),
    );
  }
  next();
});

UserSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  return user;
};

// filter out soft-deleted documents
UserSchema.pre("find", function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

UserSchema.pre("findOne", function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

UserSchema.pre("aggregate", function (next) {
  this.pipeline().unshift({ $match: { isDeleted: { $ne: true } } });
  next();
});

UserSchema.statics.isUserExist = async function (email: string) {
  return await User.findOne({ email }).select("+password");
};

UserSchema.statics.isUserActive = async function (email: string) {
  return await User.findOne({
    email,
    status: UserStatus.ACTIVE,
  }).select("+password");
};

UserSchema.statics.IsUserExistById = async function (id: string) {
  return await User.findById(id).select("+password");
};

UserSchema.statics.isPasswordMatched = async function (
  plainTextPassword: string,
  hashedPassword: string,
) {
  return await bcrypt.compare(plainTextPassword, hashedPassword);
};

export const User = model<TUser, UserModel>("User", UserSchema);

export default User;
