import httpStatus from 'http-status';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../error/AppError';
import config from '../../config';
import { verifyToken } from '../../utils/tokenManage';
import { GUARDIAN_VERIFICATION_PURPOSE } from '../user/user.utils';
import { User } from '../user/user.model';
import { GuardianApprovalStatus, TUser, UserRole } from '../user/user.interface';
import { guardianValidation } from './guardian.validation';

// verifyToken() throws AppError(403) on any failure (expired or malformed), which
// renderGuardianError() in the controller maps to the "invalid/expired link" page
const decodeGuardianToken = (token?: string): JwtPayload & { email: string } => {
  if (!token) {
    throw new AppError(httpStatus.FORBIDDEN, 'Invalid or expired verification link');
  }

  const decoded = verifyToken({ token, access_secret: config.jwt_access_secret as string });

  if (decoded?.purpose !== GUARDIAN_VERIFICATION_PURPOSE || !decoded?.email) {
    throw new AppError(httpStatus.FORBIDDEN, 'Invalid or expired verification link');
  }

  return decoded as JwtPayload & { email: string };
};

export type GuardianVerificationContext =
  | { view: 'form'; token: string; child: TUser }
  | { view: 'already-verified'; status: GuardianApprovalStatus };

const getVerificationContext = async (token?: string): Promise<GuardianVerificationContext> => {
  const decoded = decodeGuardianToken(token);

  const user = await User.findOne({ email: decoded.email, role: UserRole.SNAPPER });
  if (!user) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "This account hasn't been created yet. Please ask your child to verify their email first, then use this link again.",
    );
  }

  const isPending =
    !user.guardian?.status || user.guardian.status === GuardianApprovalStatus.PENDING;

  if (!isPending) {
    return { view: 'already-verified', status: user.guardian!.status as GuardianApprovalStatus };
  }

  return { view: 'form', token: token as string, child: user };
};

export interface SubmitVerificationInput {
  token?: string;
  decision?: string;
  guardianName?: string;
  relation?: string;
  phoneNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  reason?: string;
  idImage?: string;
}

export type GuardianVerificationResult =
  | { view: 'success'; decision: GuardianApprovalStatus }
  | { view: 'already-verified'; status: GuardianApprovalStatus };

const submitVerification = async (
  input: SubmitVerificationInput,
): Promise<GuardianVerificationResult> => {
  const parsed = guardianValidation.submitVerificationSchema.parse(input);

  const decoded = decodeGuardianToken(parsed.token);
  const emailFilter = { email: decoded.email, role: UserRole.SNAPPER };

  const existingUser = await User.findOne(emailFilter);
  if (!existingUser) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "This account hasn't been created yet. Please ask your child to verify their email first, then use this link again.",
    );
  }

  const isPending =
    !existingUser.guardian?.status ||
    existingUser.guardian.status === GuardianApprovalStatus.PENDING;

  if (!isPending) {
    return {
      view: 'already-verified',
      status: existingUser.guardian!.status as GuardianApprovalStatus,
    };
  }

  const status =
    parsed.decision === 'approved'
      ? GuardianApprovalStatus.APPROVED
      : GuardianApprovalStatus.REJECTED;

  const updatePayload: Record<string, unknown> = {
    'guardian.status': status,
    'guardian.isVerified': status === GuardianApprovalStatus.APPROVED,
    'guardian.statusReason': parsed.reason || null,
    'guardian.statusAt': new Date(),
  };

  // decline doesn't need the guardian's personal info recorded
  if (status === GuardianApprovalStatus.APPROVED) {
    updatePayload['guardian.name'] = parsed.guardianName;
    updatePayload['guardian.relation'] = parsed.relation;
    updatePayload['guardian.phoneNumber'] = parsed.phoneNumber;
    updatePayload['guardian.idImage'] = parsed.idImage;
    updatePayload['guardian.emergencyContact'] = {
      name: parsed.emergencyContactName || '',
      phoneNumber: parsed.emergencyContactPhone || '',
    };
  }

  // re-check status === PENDING atomically to guard against a double submit
  // (e.g. two tabs) racing past the isPending check above
  const user = await User.findOneAndUpdate(
    {
      ...emailFilter,
      $or: [
        { 'guardian.status': GuardianApprovalStatus.PENDING },
        { 'guardian.status': { $exists: false } },
      ],
    },
    updatePayload,
    { new: true, runValidators: true },
  );

  if (!user) {
    const latest = await User.findOne(emailFilter);
    return {
      view: 'already-verified',
      status: latest?.guardian?.status ?? GuardianApprovalStatus.PENDING,
    };
  }

  return { view: 'success', decision: status };
};

export const guardianService = {
  getVerificationContext,
  submitVerification,
};
