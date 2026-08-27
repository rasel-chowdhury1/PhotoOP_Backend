// shared between user.service.ts (issues the token) and the guardian web module

import config from "../../config";
import { createToken } from "../../utils/tokenManage";

// (verifies it), so the JWT payload's `purpose` claim can't be reused for other flows
export const GUARDIAN_VERIFICATION_PURPOSE = 'guardian-verification';

export const calculateAge = (dateOfBirth: Date | string): number => {
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
};

// minors of this age range must have a guardian on file, and that guardian must confirm via email link
export const requiresGuardianVerification = (dateOfBirth?: Date | string | null): boolean => {
  if (!dateOfBirth) return false;
  const age = calculateAge(dateOfBirth);
  return age >= 16 && age <= 18;
};

type TTokenPayload = {
  userId: string;
  role: string;
  loginWth: string;
  appleId?: string;
  email?: string;
  fullName?: string;
  phone?: string;
  profileImage?: string;
};

export const generateTokens = (payload: TTokenPayload) => {

  const accessToken = createToken({
    payload,
    access_secret: config.jwt_access_secret as string,
    expity_time: config.jwt_access_expires_in as string,
  });

  const refreshToken = createToken({
    payload: payload,
    access_secret: config.jwt_refresh_secret as string,
    expity_time: config.jwt_refresh_expires_in as string,
  });

  return { accessToken, refreshToken };
};

export const generateAndReturnTokens = (user: any) => {
  
    const { accessToken, refreshToken } = generateTokens({
    userId: user._id.toString(),
    role: user.role,
    loginWth: user.loginWth,
    appleId: user.appleId,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    profileImage: user.profileImage
  }
);
    return { user, accessToken, refreshToken };
  };
