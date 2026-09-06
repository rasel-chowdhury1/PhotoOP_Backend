/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from 'mongoose';
import httpStatus from 'http-status';
import AppError from '../../error/AppError';
import config from '../../config';
import QueryBuilder from '../../builder/QueryBuilder';
import { otpServices } from '../otp/otp.service';
import { generateOptAndExpireTime } from '../otp/otp.utils';
import { TPurposeType } from '../otp/otp.interface';
import { otpSendEmail } from '../../utils/emaillNotifiacation';
import { sendEmail, sendEmailViaApi } from '../../utils/mailSender';
import { renderButton, renderEmailLayout } from '../../utils/emailTemplate';
import { createToken, verifyToken } from '../../utils/tokenManage';
import { GUARDIAN_VERIFICATION_PURPOSE, requiresGuardianVerification } from './user.utils';
import { User } from './user.model';
import SnapperProfile from '../snapperProfile/snapperProfile.model';
import Package, { DurationUnit } from '../package/package.model';
import Booking from '../booking/booking.model';
import { BookingStatus } from '../booking/booking.interface';
import { bookingService } from '../booking/booking.service';
import { walletService } from '../wallet/wallet.service';
import {
  AdminApprovalStatus,
  DeleteAccountPayload,
  GuardianApprovalStatus,
  INotificationPreferences,
  INotificationSettings,
  TSignupPayload,
  TUser,
  TUserCreate,
  UserRole,
  UserStatus,
} from './user.interface';
import { getOrCreateAvailability } from '../availability/availability.service';
import { getAdminData } from '../../DB/adminStrore';
import { NotificationType } from '../notifications/notifications.interface';
import { getEffectiveNotificationSettings } from '../notifications/notifications.utils';
import { emitNotification } from '../../../socketIo';

export interface OTPVerifyAndCreateUserProps {
  otp: string;
  token: string;
}

// ---------------------------------------------------------------------------
// Guardian consent
// ---------------------------------------------------------------------------

// keyed by email (not userId) so this can fire before the child's account is created,
// and be resolved once it exists
const buildAndSendGuardianConsentEmail = async (payload: {
  fullName?: string;
  email: string;
  dateOfBirth?: Date | string | null;
  guardianName?: string;
  guardianEmail: string;
}) => {
  const token = createToken({
    payload: { email: payload.email, purpose: GUARDIAN_VERIFICATION_PURPOSE },
    access_secret: config.jwt_access_secret as string,
    expity_time: '24h',
  });

  // guardian completes everything (ID upload, contact info, approve/decline) on one
  // hosted page, since this backend has no separate frontend to link out to
  const verificationLink = `https://tcp6n2f2-7010.inc1.devtunnels.ms/api/v1/guardian/verify?token=${token}`;

  const minorDob = payload.dateOfBirth
    ? new Date(payload.dateOfBirth).toLocaleDateString()
    : 'N/A';

  const html = renderEmailLayout({
    preheader: 'Parental consent is required to activate your child\'s PhotoOp Snapper account.',
    headerTitle: 'Guardian Consent Required',
    bodyHtml: `
      <p>Dear Parent or Legal Guardian,</p>
      <p>Your child has requested to create a PhotoOp Snapper account. Because your child is under the
      age of 18, your identity verification and consent are required before their account can be
      activated.</p>

      <h3 style="margin:24px 0 8px;font-size:16px;color:#1a1a1a;">Minor Information</h3>
      <p>
        Child's Full Name: <strong>${payload.fullName || 'N/A'}</strong><br/>
        Child's Email Address: <strong>${payload.email}</strong><br/>
        Date of Birth: <strong>${minorDob}</strong>
      </p>
      <p>Please verify that the information above is correct. If any information is inaccurate or you did
      not authorize this registration, please decline this request.</p>

      <h3 style="margin:24px 0 8px;font-size:16px;color:#1a1a1a;">What You'll Need</h3>
      <p>Click the button below to open a secure page where you'll be asked to:</p>
      <ul>
        <li>Upload a valid government-issued photo ID (driver's license, state ID, passport, or
        other accepted government-issued identification)</li>
        <li>Provide your full name, relationship to the child, and phone number</li>
        <li>Provide an emergency contact name and phone number</li>
        <li>Approve or decline your child's account</li>
      </ul>

      <h3 style="margin:24px 0 8px;font-size:16px;color:#1a1a1a;">Consent</h3>
      <p>By approving this request, you will certify and acknowledge that:</p>
      <ul>
        <li>You are at least 18 years of age and are the parent or legal guardian of the minor
        identified above.</li>
        <li>The information and identification you submit are accurate.</li>
        <li>You authorize your child to create and maintain a PhotoOp Snapper account.</li>
        <li>You have reviewed and agree to PhotoOp's Terms of Service, Privacy Policy, and Minor
        Safety Policy.</li>
        <li>You consent to the collection and processing of your child's information as described in
        those policies.</li>
        <li>You understand your child may accept photography sessions through PhotoOp but is
        never required to accept any booking.</li>
        <li>You are responsible for supervising your child's participation, approving photography
        sessions, and determining whether adult supervision or accompaniment is appropriate.</li>
        <li>You understand that you may withdraw your consent at any time by contacting PhotoOp
        Support.</li>
      </ul>

      <p>${renderButton('Complete Guardian Verification', verificationLink, 'primary')}</p>

      <p style="font-size:13px;color:#666666;">This link will expire in 24 hours. If identity verification and parental consent are not
      completed, your child's account request will be canceled and no PhotoOp Snapper account will
      be activated.</p>

      <p>Thank you for helping us maintain a safe and trusted community for photographers of all ages.</p>
      <p>The PhotoOp Team</p>
    `,
  });

  await sendEmailViaApi(payload.guardianEmail, 'Parental Consent Required for PhotoOp Snapper Account', html);
  
};

const sendGuardianVerificationEmail = async (userId: string) => {
  const user = await User.IsUserExistById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!user.guardian?.email) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Guardian email not provided');
  }

  if (user.role !== UserRole.SNAPPER) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Guardian consent is only required for Snapper accounts');
  }

  await buildAndSendGuardianConsentEmail({
    fullName: user.fullName,
    email: user.email,
    dateOfBirth: user.dateOfBirth,
    guardianName: user.guardian.name,
    guardianEmail: user.guardian.email,
  });

  return { sent: true };
};

const verifyGuardianEmail = async (
  token: string,
  decision: 'approved' | 'rejected' = 'approved',
  reason?: string,
) => {
  const decoded = verifyToken({
    token,
    access_secret: config.jwt_access_secret as string,
  });

  if (decoded?.purpose !== GUARDIAN_VERIFICATION_PURPOSE || !decoded?.email) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid or expired verification link');
  }

  const status =
    decision === 'approved' ? GuardianApprovalStatus.APPROVED : GuardianApprovalStatus.REJECTED;

  const user = await User.findOneAndUpdate(
    { email: decoded.email },
    {
      'guardian.status': status,
      'guardian.isVerified': status === GuardianApprovalStatus.APPROVED,
      'guardian.statusReason': reason || null,
      'guardian.statusAt': new Date(),
    },
    { new: true },
  );

  if (!user) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "This account hasn't been created yet. Please ask your child to verify their email first, then use this link again.",
    );
  }

  return user;
};

// notifies the platform admin that a new account was created — a snapper-verification
// request for snappers (surfaced in the pending-snappers admin queue), a plain
// join notice otherwise. Shared by the OTP signup flow and the Google/Apple snapper
// signup flow (see auth.service.ts's googleSignupSnapper/appleSignupSnapper).
const notifyAdminOfNewUser = (user: TUser) => {
  const admin = getAdminData();
  if (!admin) {
    return;
  }

  const notificationType =
    user.role === UserRole.SNAPPER
      ? NotificationType.SNAPPER_VERIFICATION_REQUEST
      : NotificationType.USER_JOINED;

  const notificationText =
    user.role === UserRole.SNAPPER
      ? `${user.fullName} has created a new Snapper account and is waiting for verification.`
      : `${user.fullName} has joined the platform.`;

  emitNotification({
    userId: user._id,
    receiverId: (admin as any)._id,
    userMsg: {
      fullName: user.fullName,
      image: '',
      text: notificationText,
      photos: [],
    },
    type: notificationType,
  }).catch((error) => {
    console.error('Failed to emit notification:', error);
  });
};

const triggerGuardianVerificationIfNeeded = (user: TUser) => {
  // don't re-fire on a deliberate REJECTED decision, only when still undecided
  const isPending =
    !user.guardian?.status || user.guardian.status === GuardianApprovalStatus.PENDING;

  if (
    user.role === UserRole.SNAPPER &&
    requiresGuardianVerification(user.dateOfBirth) &&
    user.guardian?.email &&
    isPending
  ) {
    process.nextTick(async () => {
      try {
        await sendGuardianVerificationEmail(user._id);
      } catch (error) {
        console.error('Failed to send guardian verification email:', error);
      }
    });
  }
};

// ---------------------------------------------------------------------------
// Signup (OTP flow)
// ---------------------------------------------------------------------------

const getUserByEmail = async (email: string) => {
  return await User.findOne({ email });
};

const createUserToken = async (payload: TSignupPayload) => {

    const {
      fullName, email, password, role, dateOfBirth, countryCode, phoneNumber, address, guardian,
      identityImage, hourlyRate, specialties, badges, about,
    } = payload;

  const userExist = await getUserByEmail(email);

  if (userExist) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User already exist!!');
  }

  const { isExist, isExpireOtp } = await otpServices.checkOtpByEmail(email);

  const { otp, expiredAt } = generateOptAndExpireTime();

  console.log({otp})

  const otpPurpose: TPurposeType = 'email-verification';

  if (isExist && !isExpireOtp) {

    throw new AppError(httpStatus.BAD_REQUEST, 'otp-exist. Check your email.');

  } else if (isExist && isExpireOtp) {

    await otpServices.updateOtpByEmail(email, { otp, expiredAt });

  } else if (!isExist) {

    await otpServices.createOtp({
      name: fullName || 'Customer',
      sentTo: email,
      receiverType: 'email',
      purpose: otpPurpose,
      otp,
      expiredAt,
    });

  }

  const otpBody: Partial<TSignupPayload> = {
    fullName,
    email,
    password,
    role,
    dateOfBirth,
    countryCode,
    phoneNumber,
    address,
    guardian,
    identityImage,
    hourlyRate,
    specialties,
    badges,
    about,
  };

  process.nextTick(async () => {
    await otpSendEmail({
      sentTo: email,
      subject: 'Your one time otp for email verification',
      name: fullName || 'Customer',
      otp,
      expiredAt,
    });
  });

  // minor signing up: send the guardian the consent request in parallel with the user's OTP
  // (guardian consent only applies to Snapper accounts)
  if (role === UserRole.SNAPPER && requiresGuardianVerification(dateOfBirth) && guardian?.email) {
    process.nextTick(async () => {
      try {
        await buildAndSendGuardianConsentEmail({
          fullName,
          email,
          dateOfBirth,
          guardianName: guardian.name,
          guardianEmail: guardian.email as string,
        });
      } catch (error) {
        console.error('Failed to send guardian consent email:', error);
      }
    });
  }

  return createToken({
    payload: otpBody,
    access_secret: config.jwt_access_secret as string,
    expity_time: config.otp_token_expire_time as string | number,
  });


};

const otpVerifyAndCreateUser = async ({ otp, token }: OTPVerifyAndCreateUserProps) => {
    
  if (!token) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Token not found');
  }

  const decodeData = verifyToken({
    token,
    access_secret: config.jwt_access_secret as string,
  });

  if (!decodeData) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You are not authorised');
  }

  const {
    password,
    email,
    role,
    fullName,
    dateOfBirth,
    countryCode,
    phoneNumber,
    address,
    guardian,
    identityImage,
    hourlyRate,
    specialties,
    badges,
    about,
  } = decodeData;

  const isOtpMatch = await otpServices.otpMatch(email, otp);
  if (!isOtpMatch) {
    throw new AppError(httpStatus.BAD_REQUEST, 'OTP did not match');
  }

  process.nextTick(async () => {
    await otpServices.updateOtpByEmail(email, { status: 'verified' });
  });

  const isExist = await User.isUserExist(email as string);
  if (isExist) {
    throw new AppError(httpStatus.FORBIDDEN, 'User already exists with this email');
  }

  if (role === UserRole.SNAPPER && (!identityImage || hourlyRate === undefined)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'identityImage and hourlyRate are required for snapper accounts',
    );
  }

  const session = await mongoose.startSession();
  let user;

  try {
    session.startTransaction();

    const [createdUser] = await User.create(
      [
        {
          password,
          email,
          role,
          fullName,
          dateOfBirth,
          countryCode,
          about,
          phoneNumber,
          address,
          guardian,
        },
      ],
      { session },
    );

    if (!createdUser) {
      throw new AppError(httpStatus.BAD_REQUEST, 'User creation failed');
    }

    user = createdUser;

    if (role === UserRole.SNAPPER) {
      const [snapperProfile] = await SnapperProfile.create(
        [{ userId: user._id, identityImage, hourlyRate, specialties, badges, about }],
        { session },
      );

      user = await User.findByIdAndUpdate(
        user._id,
        { snapperId: snapperProfile._id },
        { new: true, session },
      );
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User creation failed');
  }

  notifyAdminOfNewUser(user);

  const jwtPayload: { userId: string; role: string; email: string } = {
    email: user.email,
    userId: user?._id?.toString() as string,
    role: user?.role,
  };

  const accessToken = createToken({
    payload: jwtPayload,
    access_secret: config.jwt_access_secret as string,
    expity_time: '30m',
  });

  return accessToken;
};

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

const getMyProfile = async (id: string) => {
  const user = await User.findById(id);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  // which side of a Booking this user shows up on depends on their role — customers
  // are Booking.userId, snappers are Booking.snapperId. Admins have neither, so both
  // counts naturally come back 0 for them.
  const bookingField = user.role === UserRole.SNAPPER ? 'snapperId' : 'userId';
  const now = new Date();

  const [totalBookings, completedBookings, upcomingBookings] = await Promise.all([
    Booking.countDocuments({ [bookingField]: id, isDeleted: false }),

    Booking.countDocuments({
      [bookingField]: id,
      isDeleted: false,
      status: BookingStatus.COMPLETED,
    }),

    // same "upcoming" definition used by getUserBookingOverview/getSnapperBookingStats:
    // accepted, with the shoot date still ahead
    Booking.countDocuments({
      [bookingField]: id,
      isDeleted: false,
      status: BookingStatus.ACCEPTED,
      bookingDate: { $gte: now },
    }),
  ]);

  return {
    ...user.toObject(),
    statistics: {
      totalBookings,
      completedBookings,
      upcomingBookings,
    },
  };
};

const getUserById = async (id: string) => {
  const user = await User.findById(id);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }
  return user;
};



const updateMyProfile = async (id: string, payload: Partial<TUserCreate>) => {
  const {
    role,
    email,
    password,
    isDeleted,
    status,
    adminApproval,
    approvalHistory,
    totalReview,
    averageRating,
    // validateRequest doesn't strip unrecognized body fields, so this must be excluded
    // explicitly — otherwise a client could smuggle it through this generic endpoint and
    // replace the whole subdocument, bypassing updateMyNotificationSettings's safe merge
    notificationSettings,
    ...rest
  } = payload;

  const existingUser = await User.findById(id);
  if (!existingUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  // .toObject() is required here: existingUser.socialLinks/.guardian are Mongoose
  // subdocuments, and spreading them directly (`{ ...existingUser.socialLinks }`) pulls
  // in internal Mongoose bookkeeping (_doc, $__, $__parent, $isNew) as own enumerable
  // properties alongside the real fields. findByIdAndUpdate then casts that mixed object
  // against the subdocument schema and reads the stale values back out of the leftover
  // _doc cache instead of the new ones, so the update silently no-ops.
  const existingUserObj = existingUser.toObject();

  // findByIdAndUpdate replaces the whole subdocument, so merge with what's already stored
  if (rest.socialLinks) {
    rest.socialLinks = { ...existingUserObj.socialLinks, ...rest.socialLinks };
  }

  if (rest.guardian) {
    const emailChanged =
      rest.guardian.email && rest.guardian.email !== existingUserObj.guardian?.email;

    rest.guardian = {
      ...existingUserObj.guardian,
      ...rest.guardian,
      // a new/changed guardian email must be re-confirmed via the verification link
      ...(emailChanged
        ? {
            status: GuardianApprovalStatus.PENDING,
            isVerified: false,
            statusReason: null,
            statusAt: null,
          }
        : {}),
    };
  }

  

  const user = await User.findByIdAndUpdate(id, rest, { new: true, runValidators: true });
  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User updating failed');
  }

  triggerGuardianVerificationIfNeeded(user);

  return user;
};

const updateAdminProfile = async(id: string, payload: any) => {

    const {
    role,
    email,
    password,
    isDeleted,
    status,
    ...rest
  } = payload;
  const existingUser = await User.findById(id);
  if (!existingUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const user = await User.findByIdAndUpdate(id, rest, { new: true, runValidators: true });
  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User updating failed');
  }

  
  const jwtPayload: {
    userId: string;
    role: string;
    fullName?: string;
    email: string;
    phone?: string;
    profileImage?: string;
    loginWth?: string
  } = {
    userId: user?._id?.toString() as string,
    role: user?.role,
    fullName: user?.fullName,
    email: user.email,
    phone: user.phoneNumber,
    profileImage: user?.profileImage,
    loginWth: user.loginWth
  };

  const accessToken = createToken({
    payload: jwtPayload,
    access_secret: config.jwt_access_secret as string,
    expity_time: config.jwt_access_expires_in as string,
  });


  const refreshToken = createToken({
    payload: jwtPayload,
    access_secret: config.jwt_refresh_secret as string,
    expity_time: config.jwt_refresh_expires_in as string,
  });

  return {user,accessToken,refreshToken}
}

const getMyNotificationSettings = async (userId: string) => {
  const user = await User.findById(userId).select('notificationSettings');
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  // safe even for pre-existing users with no notificationSettings stored at all
  return getEffectiveNotificationSettings(user.notificationSettings);
};

const updateMyNotificationSettings = async (
  userId: string,
  payload: { pushEnabled?: boolean; preferences?: Partial<INotificationPreferences> }
) => {
  const existingUser = await User.findById(userId).select('notificationSettings');
  if (!existingUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  // merge over the effective (defaulted) current settings so an unspecified key is left
  // exactly as it was — e.g. { preferences: { messageAlerts: false } } only touches that
  // one key, not pushEnabled or the other two preferences
  const current = getEffectiveNotificationSettings(existingUser.notificationSettings);

  const merged: INotificationSettings = {
    pushEnabled: payload.pushEnabled ?? current.pushEnabled,
    preferences: {
      ...current.preferences,
      ...payload.preferences,
    },
  };

  // findByIdAndUpdate, not existingUser.save() — existingUser was fetched with a field
  // projection (.select), so .save() would run full-document validation against an
  // instance that's missing fullName/email/password/role/etc. and fail
  const user = await User.findByIdAndUpdate(
    userId,
    { notificationSettings: merged },
    { new: true, runValidators: true }
  ).select('notificationSettings');

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Notification settings update failed');
  }

  return getEffectiveNotificationSettings(user.notificationSettings);
};

// this user's booking counts (as the customer, i.e. Booking.userId) plus their 6 most
// recent bookings — the counts and totalReview/averageRating-style summary a dashboard
// needs, without pulling every booking down to compute it client-side
const getUserBookingOverview = async (userId: string) => {
  const now = new Date();

  const [totalBookings, completedBookings, upcomingBookings, recentBookings] = await Promise.all([
    Booking.countDocuments({ userId, isDeleted: false }),

    Booking.countDocuments({
      userId,
      isDeleted: false,
      status: BookingStatus.COMPLETED,
    }),

    // same "upcoming" definition used by booking.service.ts's getSnapperBookingStats:
    // accepted, with the shoot date still ahead
    Booking.countDocuments({
      userId,
      isDeleted: false,
      status: BookingStatus.ACCEPTED,
      bookingDate: { $gte: now },
    }),

    Booking.find({ userId, isDeleted: false })
      .populate('snapperId', 'fullName profileImage')
      .populate('packageId', 'packageName price durationValue durationUnit')
      .sort({ createdAt: -1 })
      .limit(6),
  ]);

  return {
    totalBookings,
    completedBookings,
    upcomingBookings,
    recentBookings,
  };
};

// the authenticated snapper's own User + SnapperProfile, plus a quick stats summary.
// Reuses booking.service.ts's getSnapperBookingStats (totalCompleted, bookingsThisMonth,
// etc.) and wallet.service.ts's getWalletSummary (totalEarned — the same single source
// of truth analytics.service.ts's snapper-overview endpoint already uses) rather than
// re-deriving either from a fresh Booking aggregation here.
const getMySnapperProfile = async (userId: string) => {
  const [snapperProfile, bookingStats, wallet] = await Promise.all([
    SnapperProfile.findOne({ userId }).populate("userId"),
    bookingService.getSnapperBookingStats(userId),
    walletService.getWalletSummary(userId),
  ]);

  if (!snapperProfile) {
    throw new AppError(httpStatus.NOT_FOUND, 'Snapper profile not found');
  }

  return {
    snapperProfile,
    statistics: {
      totalCompletedBookings: bookingStats.totalCompleted,
      totalEarnings: wallet.totalEarned,
      totalBookingsThisMonth: bookingStats.bookingsThisMonth,
    },
  };
};

const deleteMyAccount = async (id: string, payload: DeleteAccountPayload) => {
  const user: TUser | null = await User.IsUserExistById(id);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (user?.isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is deleted');
  }

  if (!(await User.isPasswordMatched(payload.password, user.password))) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password does not match');
  }

  const userDeleted = await User.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
  if (!userDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'user deleting failed');
  }

  return userDeleted;
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

// price is derived from the snapper's own hourlyRate (SnapperProfile), scaled linearly
// by each package's duration relative to one hour
const DEFAULT_PACKAGE_TEMPLATES = [
  {
    packageName: 'Quick Shoot',
    description: '30 min session, 10 edited photos',
    durationValue: 30,
    durationUnit: DurationUnit.MINUTE,
    hourlyRateMultiplier: 0.5,
  },
  {
    packageName: 'Standard Session',
    description: '1 hour session, 25 edited photos',
    durationValue: 1,
    durationUnit: DurationUnit.HOUR,
    hourlyRateMultiplier: 1,
  },
  {
    packageName: 'Premium Session',
    description: '2 hour session, 50 edited photos, 1 outfit change',
    durationValue: 2,
    durationUnit: DurationUnit.HOUR,
    hourlyRateMultiplier: 2,
  },
];

// seeds the 3 default packages the first time a snapper is approved; skipped on
// re-approval (e.g. suspended -> approved again) since packageIds is already populated
const createDefaultPackagesForSnapper = async (userId: string, session: any) => {
  const snapperProfile = await SnapperProfile.findOne({ userId });
  if (!snapperProfile || snapperProfile.packageIds?.length) {
    return;
  }

  const packages = await Package.insertMany(
    DEFAULT_PACKAGE_TEMPLATES.map(template => ({
      userId,
      packageName: template.packageName,
      description: template.description,
      price: Math.round(snapperProfile.hourlyRate * template.hourlyRateMultiplier),
      durationValue: template.durationValue,
      durationUnit: template.durationUnit,
    })),
  );

  snapperProfile.packageIds = packages.map(pkg => pkg._id);
  await snapperProfile.save();
};

const getAllUserQuery = async (userId: string, query: Record<string, unknown>) => {
  const userQuery = new QueryBuilder(User.find({ _id: { $ne: userId } }), query)
    .search(['fullName', 'email'])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await userQuery.modelQuery;
  const meta = await userQuery.countTotal();
  return { meta, result };
};

const getAllUserCount = async () => {
  return await User.countDocuments();
};

// customer accounts only — the admin-facing sibling of getAllSnappers/getPendingSnappers
const getAllCustomers = async (query: Record<string, unknown>) => {
  const userQuery = new QueryBuilder(User.find({ role: UserRole.USER }), query)
    .search(['fullName', 'email'])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await userQuery.modelQuery;
  const meta = await userQuery.countTotal();
  return { meta, result };
};

// every snapper account regardless of approval status — populated with SnapperProfile
// (hourlyRate/specialties/storagePlan/etc.) since that's what an admin managing snappers
// needs, unlike the public getVerifiedSnappers listing in snapperProfile.service.ts
const getAllSnappers = async (query: Record<string, unknown>) => {
  const userQuery = new QueryBuilder(
    User.find({ role: UserRole.SNAPPER }).populate('snapperId'),
    query
  )
    .search(['fullName', 'email'])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await userQuery.modelQuery;
  const meta = await userQuery.countTotal();
  return { meta, result };
};

// snappers still awaiting admin approval — the queue updateAdminApproval acts on
const getPendingSnappers = async (query: Record<string, unknown>) => {
  const userQuery = new QueryBuilder(
    User.find({ role: UserRole.SNAPPER, adminApproval: AdminApprovalStatus.PENDING }).populate(
      'snapperId'
    ),
    query
  )
    .search(['fullName', 'email'])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await userQuery.modelQuery;
  const meta = await userQuery.countTotal();
  return { meta, result };
};

const getUsersOverview = async (userId: string, year: number) => {
  const totalUsers = await User.countDocuments();

  const userOverview = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: new Date(`${year}-01-01`), $lt: new Date(`${year + 1}-01-01`) },
      },
    },
    {
      $group: {
        _id: { $month: '$createdAt' },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 1,
        count: 1,
        monthName: {
          $switch: {
            branches: [
              { case: { $eq: ['$_id', 1] }, then: 'January' },
              { case: { $eq: ['$_id', 2] }, then: 'February' },
              { case: { $eq: ['$_id', 3] }, then: 'March' },
              { case: { $eq: ['$_id', 4] }, then: 'April' },
              { case: { $eq: ['$_id', 5] }, then: 'May' },
              { case: { $eq: ['$_id', 6] }, then: 'June' },
              { case: { $eq: ['$_id', 7] }, then: 'July' },
              { case: { $eq: ['$_id', 8] }, then: 'August' },
              { case: { $eq: ['$_id', 9] }, then: 'September' },
              { case: { $eq: ['$_id', 10] }, then: 'October' },
              { case: { $eq: ['$_id', 11] }, then: 'November' },
              { case: { $eq: ['$_id', 12] }, then: 'December' },
            ],
            default: 'Unknown',
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const recentUsers = await User.find({ _id: { $ne: userId } })
    .sort({ createdAt: -1 })
    .limit(6);

  return { totalUsers, userOverview, recentUsers };
};

const updateUserStatus = async (id: string, status: UserStatus) => {
  const singleUser = await User.IsUserExistById(id);
  if (!singleUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const user = await User.findByIdAndUpdate(id, { status }, { new: true });
  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'user status update failed');
  }

  return user;
};

const updateAdminApproval = async (
  id: string,
  status: AdminApprovalStatus,
  adminId: string,
  reason?: string,
) => {
  const singleUser = await User.IsUserExistById(id);
  if (!singleUser) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const actionAt = new Date();
  const session = await mongoose.startSession();

  try {
    let user;

    await session.withTransaction(async () => {
      user = await User.findByIdAndUpdate(
        id,
        {
          adminApproval: status,
          $push: {
            approvalHistory: {
              status,
              reason: reason || null,
              actionBy: adminId,
              actionAt,
            },
          },
        },
        { new: true, session },
      );

      if (!user) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "user approval update failed",
        );
      }

      if (
        status === AdminApprovalStatus.APPROVED &&
        user.role === UserRole.SNAPPER
      ) {
        // Create default packages
        await createDefaultPackagesForSnapper(user._id.toString(), session);

        // Add Verified badge
        await SnapperProfile.findOneAndUpdate(
          { userId: user._id },
          {
            $addToSet: {
              badges: "Verified",
            },
          },
          { new: true, session },
        );

        // best-effort seed of a default availability doc; doesn't use the transaction's
        // session, so it shouldn't block (or be rolled back with) the approval itself
        getOrCreateAvailability(user._id.toString()).catch((error) => {
          console.error('Failed to seed default availability for snapper:', error);
        });
      }
    });

    return user;
  } finally {
    await session.endSession();
  }
};


const addFavoriteUser = async (userId: string, favoriteUserId: string) => {
  if (userId === favoriteUserId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You cannot favorite yourself');
  }

  const favoriteUser = await User.findById(favoriteUserId);
  if (!favoriteUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const result = await User.findByIdAndUpdate(
    userId,
    { $addToSet: { favoriteUsers: favoriteUserId } },
    { new: true },
  ).populate('favoriteUsers', 'fullName profileImage role averageRating');

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  return result;
};

const removeFavoriteUser = async (userId: string, favoriteUserId: string) => {
  const result = await User.findByIdAndUpdate(
    userId,
    { $pull: { favoriteUsers: favoriteUserId } },
    { new: true },
  ).populate('favoriteUsers', 'fullName profileImage role averageRating');

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  return result;
};

const getMyFavoriteUsers = async (userId: string) => {
  const result = await User.findById(userId).populate(
    'favoriteUsers',
    'fullName profileImage role averageRating totalReview categoryId',
  );

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  return result.favoriteUsers;
};

export const userService = {
  createUserToken,
  otpVerifyAndCreateUser,
  getMyProfile,
  getUserById,
  getUserByEmail,
  updateMyProfile,
  updateAdminProfile,
  getMyNotificationSettings,
  updateMyNotificationSettings,
  getUserBookingOverview,
  getMySnapperProfile,
  deleteMyAccount,
  updateUserStatus,
  updateAdminApproval,
  sendGuardianVerificationEmail,
  verifyGuardianEmail,
  triggerGuardianVerificationIfNeeded,
  notifyAdminOfNewUser,
  getAllUserQuery,
  getAllUserCount,
  getAllCustomers,
  getAllSnappers,
  getPendingSnappers,
  getUsersOverview,
  getMyFavoriteUsers,
  addFavoriteUser,
  removeFavoriteUser
};
