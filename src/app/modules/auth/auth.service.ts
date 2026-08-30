import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import httpStatus from 'http-status';
import config from '../../config';
import AppError from '../../error/AppError';
import { otpSendEmail } from '../../utils/emaillNotifiacation';
import { createToken, verifyToken } from '../../utils/tokenManage';
import { otpServices } from '../otp/otp.service';
import { generateOptAndExpireTime } from '../otp/otp.utils';
import { TGuardian, TUser, UserRole, UserStatus } from '../user/user.interface';
import { User } from '../user/user.model';
import SnapperProfile from '../snapperProfile/snapperProfile.model';
import { OTPVerifyAndCreateUserProps, userService } from '../user/user.service';
import { TLogin } from './auth.interface';
import { TPurposeType } from '../otp/otp.interface';
import { Request } from 'express';
import { Login_With } from '../user/user.constants';
import { generateAndReturnTokens } from '../user/user.utils';
import UAParser from 'ua-parser-js';
import sendResponse from '../../utils/sendResponse';

const twilio = require('twilio');

// Twilio credentials
const accountSid = config.twilio_account_sid;
const authToken = config.twilio_auth_token;
const twilioPhone = config.twilio_phone_number;
// Create a Twilio client
const client = twilio(accountSid, authToken);
// Login
const login = async (payload: TLogin, req: Request) => {
  console.log('payload', payload);
  const user = await User.isUserActive(payload?.email);
  
console.log("user login in here =>> ", user);
  
  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found');
  }

  if (!(await User.isPasswordMatched(payload.password, user.password))) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password does not match');
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


    if (user) {
    const ip =
      req.headers['x-forwarded-for']?.toString().split(',')[0] ||
      req.socket.remoteAddress ||
      '';
     
    const userAgent = req.headers['user-agent'] || '';
    //@ts-ignore
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    const device = {
      ip: ip,
      browser: result.browser.name,
      os: result.os.name,
      device: result.device.model || 'Desktop',
      lastLogin: new Date().toISOString(),
    };

    await User.findByIdAndUpdate(
      user?._id,
      { fcmToken: payload.fcmToken, device },
      { new: true, upsert: false },
    );
  }


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

  return {
    user,
    accessToken,
    refreshToken,
  };
};



const googleLogin = async (payload: { email: string, name: string, profileImage: string, role: string, fcmToken?: string, type?: 'signIn' | 'signUp' }, req: Request) => {
  // Check if the user exists
  let user = await User.isUserExist(payload.email);

  if (!user && payload.type === 'signIn') {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'No account found with this Google account. Please sign up first.',
    );
  }

  if (user) {
    // Validate user status and permissions
     if (user.loginWth !== Login_With.google) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          'This account is not registered for Google login',
        );
      }

      if (user.isDeleted) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          'This user account has been deleted',
        );
      }

      if (
        user.status === UserStatus.BLOCKED ||
        user.status === UserStatus.SUSPENDED
      ) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          'Your account has been blocked or suspended. Please contact support for assistance.',
        );
      }

     const ip =
      req.headers['x-forwarded-for']?.toString().split(',')[0] ||
      req.socket.remoteAddress ||
      '';
     
    const userAgent = req.headers['user-agent'] || '';
    //@ts-ignore
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    const device = {
      ip: ip,
      browser: result.browser.name,
      os: result.os.name,
      device: result.device.model || 'Desktop',
      lastLogin: new Date().toISOString(),
    };

    await User.findByIdAndUpdate(
      user?._id,
      {  device, fcmToken: payload.fcmToken },
      { new: true, upsert: false },
    );

    return generateAndReturnTokens(user);
  }


try {

  const fullName = payload?.name?.trim() || "";

  const nameParts = fullName.split(" ").filter(Boolean);

  const firstName = nameParts[0] || "";
  const lastName =
    nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";


    // If user does not exist, create a new one
  user = await User.create({
    sureName: firstName,
    lastName,
    name: payload?.name || "",
    email: payload.email,
    password: "testing123",
    profileImage: payload?.profileImage || "",
    role: payload.role ,
    loginWth: Login_With.google,
  });


} catch (error) {
  console.log({error});
  return;
}

 

   const ip =
      req.headers['x-forwarded-for']?.toString().split(',')[0] ||
      req.socket.remoteAddress ||
      '';
     
    const userAgent = req.headers['user-agent'] || '';
    //@ts-ignore
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    const device = {
      ip: ip,
      browser: result.browser.name,
      os: result.os.name,
      device: result.device.model || 'Desktop',
      lastLogin: new Date().toISOString(),
    };

    await User.findByIdAndUpdate(
      user?._id,
      { device, fcmToken: payload.fcmToken },
      { new: true, upsert: false },
    );


  return generateAndReturnTokens(user);
};


const appleLogin = async (
  payload: {
    appleId: string;
    email?: string;
    name?: string;
    role?: string;
    fcmToken?: string;
    type?: 'signIn' | 'signUp';
  },
  req: Request,
) => {

  console.log("Payload of Apple Login ===>>> ", payload)

  // 1️⃣ Find user by appleId (PRIMARY KEY)
  let user = await User.findOne({ appleId: payload.appleId });

  console.log("user of apple =>>> ", user)

  // 2️⃣ If not found, try email (FIRST LOGIN ONLY)
  if (!user && payload.email) {
    user = await User.findOne({ email: payload.email });
  }

  if (!user && payload.type === 'signIn') {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'No account found with this Apple account. Please sign up first.',
    );
  }

  // 3️⃣ Existing user
  if (user) {
    if (user.loginWth !== Login_With.apple) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        `This account is not registered for Apple Login`,
      );
    }

    if (user.isDeleted) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'This user account has been deleted',
      );
    }

    if (
      user.status === UserStatus.BLOCKED ||
      user.status === UserStatus.SUSPENDED
    ) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'This user account has been blocked or suspended',
      );
    }

    // 🔗 Attach appleId if missing (important for old users)
    if (!user.appleId) {
      user.appleId = payload.appleId;
      await user.save();
    }

    const ip =
      req.headers['x-forwarded-for']?.toString().split(',')[0] ||
      req.socket.remoteAddress ||
      '';
     
    const userAgent = req.headers['user-agent'] || '';
    //@ts-ignore
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    const device = {
      ip: ip,
      browser: result.browser.name,
      os: result.os.name,
      device: result.device.model || 'Desktop',
      lastLogin: new Date().toISOString(),
    };

    await User.findByIdAndUpdate(
      user?._id,
      { device, fcmToken: payload.fcmToken },
      { new: true, upsert: false },
    );

    const appleToken = generateAndReturnTokens(user);
    return appleToken;
  }

  // 4️⃣ Create new Apple user (email optional)
  try {
    const fullName = payload?.name?.trim() || '';
    const nameParts = fullName.split(' ').filter(Boolean);

    const firstName = nameParts[0] || '';
    const lastName =
      nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';


    user = await User.create({
      appleId: payload.appleId,          // ✅ REQUIRED
      email: payload.email || undefined, // ✅ OPTIONAL
      sureName: firstName,
      lastName,
      name: payload?.name || '',
      password: 'apple-login-temp-password',
      profileImage: '',
      role: payload?.role ,
      loginWth: Login_With.apple,
      fcmToken: payload.fcmToken || '',
    });



  } catch (error) {
    console.log({ error });
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Apple login failed',
    );
  }

  const ip =
      req.headers['x-forwarded-for']?.toString().split(',')[0] ||
      req.socket.remoteAddress ||
      '';
     
    const userAgent = req.headers['user-agent'] || '';
    //@ts-ignore
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    const device = {
      ip: ip,
      browser: result.browser.name,
      os: result.os.name,
      device: result.device.model || 'Desktop',
      lastLogin: new Date().toISOString(),
    };

    await User.findByIdAndUpdate(
      user?._id,
      { device, fcmToken: payload.fcmToken },
      { new: true, upsert: false },
    );
    
  return generateAndReturnTokens(user);
};

// Google sign up for Snapper accounts — unlike googleLogin (which silently creates a
// bare account for any role on first contact), a Snapper account additionally needs a
// SnapperProfile (identityImage + hourlyRate are required by that schema), so this is a
// deliberate, dedicated sign-up call rather than something googleLogin can fall through to.
const googleSignupSnapper = async (
  payload: {
    email: string;
    name?: string;
    profileImage?: string;
    fcmToken?: string;
    dateOfBirth?: Date | string;
    countryCode?: string;
    phoneNumber?: string;
    address?: string;
    guardian?: Partial<TGuardian>;
    identityImage: string;
    hourlyRate: number;
    specialties?: string[];
    badges?: string[];
    about?: string;
  },
  req: Request,
) => {
  const existingUser = await User.isUserExist(payload.email);

  if (existingUser) {
    throw new AppError(
      httpStatus.CONFLICT,
      'An account already exists with this email. Please sign in instead.',
    );
  }

  if (!payload.identityImage || payload.hourlyRate === undefined) {
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
          email: payload.email,
          fullName: payload?.name || '',
          profileImage: payload?.profileImage || '',
          password: 'oauth-google-temp-password',
          role: UserRole.SNAPPER,
          loginWth: Login_With.google,
          dateOfBirth: payload.dateOfBirth,
          countryCode: payload.countryCode,
          phoneNumber: payload.phoneNumber,
          address: payload.address,
          guardian: payload.guardian,
          fcmToken: payload.fcmToken,
        },
      ],
      { session },
    );

    if (!createdUser) {
      throw new AppError(httpStatus.BAD_REQUEST, 'User creation failed');
    }

    user = createdUser;

    const [snapperProfile] = await SnapperProfile.create(
      [
        {
          userId: user._id,
          identityImage: payload.identityImage,
          hourlyRate: payload.hourlyRate,
          specialties: payload.specialties,
          badges: payload.badges,
          about: payload.about,
        },
      ],
      { session },
    );

    user = await User.findByIdAndUpdate(
      user._id,
      { snapperId: snapperProfile._id },
      { new: true, session },
    );

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

  userService.notifyAdminOfNewUser(user);
  userService.triggerGuardianVerificationIfNeeded(user);

  return generateAndReturnTokens(user);
};

// Apple sign up for Snapper accounts — same rationale as googleSignupSnapper, keyed on
// appleId (Apple's stable identifier) instead of email, since Apple lets a user hide
// their real email behind a relay address.
const appleSignupSnapper = async (
  payload: {
    appleId: string;
    email?: string;
    name?: string;
    fcmToken?: string;
    dateOfBirth?: Date | string;
    countryCode?: string;
    phoneNumber?: string;
    address?: string;
    guardian?: Partial<TGuardian>;
    identityImage: string;
    hourlyRate: number;
    specialties?: string[];
    badges?: string[];
    about?: string;
  },
  req: Request,
) => {
  let existingUser = await User.findOne({ appleId: payload.appleId });

  if (!existingUser && payload.email) {
    existingUser = await User.findOne({ email: payload.email });
  }

  if (existingUser) {
    throw new AppError(
      httpStatus.CONFLICT,
      'An account already exists with this Apple account. Please sign in instead.',
    );
  }

  if (!payload.identityImage || payload.hourlyRate === undefined) {
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
          appleId: payload.appleId,
          email: payload.email || undefined,
          fullName: payload?.name || '',
          password: 'oauth-apple-temp-password',
          role: UserRole.SNAPPER,
          loginWth: Login_With.apple,
          dateOfBirth: payload.dateOfBirth,
          countryCode: payload.countryCode,
          phoneNumber: payload.phoneNumber,
          address: payload.address,
          guardian: payload.guardian,
          fcmToken: payload.fcmToken,
        },
      ],
      { session },
    );

    if (!createdUser) {
      throw new AppError(httpStatus.BAD_REQUEST, 'User creation failed');
    }

    user = createdUser;

    const [snapperProfile] = await SnapperProfile.create(
      [
        {
          userId: user._id,
          identityImage: payload.identityImage,
          hourlyRate: payload.hourlyRate,
          specialties: payload.specialties,
          badges: payload.badges,
          about: payload.about,
        },
      ],
      { session },
    );

    user = await User.findByIdAndUpdate(
      user._id,
      { snapperId: snapperProfile._id },
      { new: true, session },
    );

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

  userService.notifyAdminOfNewUser(user);
  userService.triggerGuardianVerificationIfNeeded(user);

  return generateAndReturnTokens(user);
};

// forgot Password by email
const forgotPasswordByEmail = async (email: string) => {
  const user: TUser | null = await User.isUserActive(email);

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found');
  }

  const { isExist, isExpireOtp } = await otpServices.checkOtpByEmail(email);

  const { otp, expiredAt } = generateOptAndExpireTime();

  const otpPurpose: TPurposeType = 'forget-password';

  if (isExist && !isExpireOtp) {

    throw new AppError(httpStatus.BAD_REQUEST, 'otp-exist. Check your email.');

  } else if (isExist && isExpireOtp) {

    await otpServices.updateOtpByEmail(email, { otp, expiredAt });

  } else if (!isExist) {

    await otpServices.createOtp({
      name: user.fullName || 'Customer',
      sentTo: email,
      receiverType: 'email',
      purpose: otpPurpose,
      otp,
      expiredAt,
    });

  }


  if (isExist && !isExpireOtp) {
    throw new AppError(httpStatus.BAD_REQUEST, 'otp-exist. Check your email.');
  } else if (isExist && isExpireOtp) {
    const otpUpdateData = {
      otp,
      expiredAt,
      status: 'pending',
    };

    await otpServices.updateOtpByEmail(email, otpUpdateData);
  }

  const jwtPayload = {
    email: email,
    userId: user?._id,
  };

  const forgetToken = createToken({
    payload: jwtPayload,
    access_secret: config.jwt_access_secret as string,
    expity_time: config.otp_token_expire_time as string | number,
  });

  process.nextTick(async () => {
    await otpSendEmail({
      sentTo: email,
      subject: 'Your one time otp for forget password',
      name: '',
      otp,
      expiredAt: expiredAt,
    });
  });

  return { forgetToken };
};

// forgot Password by number
const forgotPasswordByNumber = async (phoneNumber: string) => {
  if (!phoneNumber) {
    throw new AppError(httpStatus.BAD_REQUEST, 'phone number is required');
  }


  // Generate a random 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000);

  try {
    // // Send the SMS
    await client.messages.create({
      body: `Your OTP is ${otp}`,
      from: twilioPhone,
      to: phoneNumber,
    });

    return { message: 'OTP sent successfully', otp };
    // res.status(200).json({ message: "OTP sent successfully", otp }); // For dev, include OTP (remove in prod)
  } catch (error: any) {
    return { message: 'Failed to send OTP', error: error.message };
    // res.status(500).json({ message: "Failed to send OTP", error: error.message });
  }
};

// forgot  Password Otp Match
const forgotPasswordOtpMatch = async ({
  otp,
  token,
}: OTPVerifyAndCreateUserProps) => {
  console.log({ otp, token });
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

  const { email } = decodeData;

  const isOtpMatch = await otpServices.otpMatch(email, otp);

  if (!isOtpMatch) {
    throw new AppError(httpStatus.BAD_REQUEST, 'OTP did not match');
  }

  process.nextTick(async () => {
    await otpServices.updateOtpByEmail(email, {
      status: 'verified',
    });
  });

  const user: TUser | null = await User.isUserActive(email);

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found');
  }

  const jwtPayload = {
    email: email,
    userId: user?._id,
  };

  const forgetOtpMatchToken = createToken({
    payload: jwtPayload,
    access_secret: config.jwt_access_secret as string,
    expity_time: config.otp_token_expire_time as string | number,
  });

  return { forgetOtpMatchToken };
};

// Reset password
const resetPassword = async ({
  token,
  newPassword,
  confirmPassword,
}: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}) => {
  console.log(newPassword, confirmPassword);
  if (newPassword !== confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password does not match');
  }

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

  const { email, userId } = decodeData;

  const user: TUser | null = await User.isUserActive(email);

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found');
  }

  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  const result = await User.findByIdAndUpdate(
    userId,
    { password: hashedPassword },
    { new: true },
  );

  return result;
};

// Change password
const changePassword = async ({
  userId,
  newPassword,
  oldPassword,
}: {
  userId: string;
  newPassword: string;
  oldPassword: string;
}) => {
  console.log({ userId, newPassword, oldPassword });
  const user = await User.IsUserExistById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!(await User.isPasswordMatched(oldPassword, user.password))) {
    throw new AppError(httpStatus.FORBIDDEN, 'Old password does not match');
  }

  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  const result = await User.findByIdAndUpdate(
    userId,
    { password: hashedPassword },
    { new: true },
  );

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User updating failed');
  }

  return result;
};



// Logout — this app's tokens are stateless JWTs handed back in the response body (not
// server-tracked sessions/cookies), so there's nothing to invalidate server-side beyond
// the one piece of server state tied to this device: its push token. Clearing it stops
// this device from receiving further real-time pushes for the user until they log back in.
const logout = async (userId: string) => {
  const user = await User.findByIdAndUpdate(userId, { fcmToken: '' }, { new: true });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  return null;
};

// rest ..............................

// Forgot password

// Refresh token
const refreshToken = async (token: string) => {
  if (!token) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Token not found');
  }

  const decoded = verifyToken({
    token,
    access_secret: config.jwt_refresh_secret as string,
  });

  const { email } = decoded;

  const activeUser = await User.isUserActive(email);

  if (!activeUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const jwtPayload: {
    userId: string;
    role: string;
    fullName?: string;
    email: string;
    phone?: string;
  } = {
    fullName: activeUser?.fullName,
    email: activeUser.email,
    phone: activeUser.phoneNumber,
    userId: activeUser?._id?.toString() as string,
    role: activeUser?.role,
  };

  const accessToken = createToken({
    payload: jwtPayload,
    access_secret: config.jwt_access_secret as string,
    expity_time: config.jwt_access_expires_in as string,
  });

  return {
    accessToken,
  };
};

export const authServices = {
  login,
  googleLogin,
  appleLogin,
  googleSignupSnapper,
  appleSignupSnapper,
  logout,
  forgotPasswordOtpMatch,
  changePassword,
  forgotPasswordByEmail,
  forgotPasswordByNumber,
  resetPassword,
  refreshToken,
};

// <Table
//   dataSource={mappedOrders}
//   columns={[
//     {
//       title: "Order ID",
//       dataIndex: "orderId",
//       render: (text, record) => (
//         <Link
//           to={{
//             pathname: `/orders-received-details/${record.orderId}`, // Pass the product ID
//             state: { order: record }, // Pass the order object as state
//           }}
//         >
//           {text}
//         </Link>
//       ),
//     },
//     // other columns
//   ]}
// />
