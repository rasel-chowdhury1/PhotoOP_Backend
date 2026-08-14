import { NextFunction, Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { storeFile } from '../../utils/fileHelper';
import { userService } from './user.service';

// runs before validateRequest so a required identityImage (snapper signup) is
// already a stored path by the time the body is validated
const attachSignupFiles = (req: Request, _res: Response, next: NextFunction) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  if (files?.identityImage?.[0]) {
    req.body.identityImage = storeFile('identity', files.identityImage[0].filename);
  }
  next();
};

const createUser = catchAsync(async (req: Request, res: Response) => {
  const createUserToken = await userService.createUserToken(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Check email for OTP',
    data: { createUserToken },
  });
});

const userCreateVarification = catchAsync(async (req: Request, res: Response) => {
  const token = req.headers?.token as string;
  const { otp } = req.body;
  const accessToken = await userService.otpVerifyAndCreateUser({ otp, token });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User created successfully',
    data: { accessToken },
  });
});

const getMyProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.getMyProfile(req.user.userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Profile fetched successfully',
    data: result,
  });
});

const getUserById = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.getUserById(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User fetched successfully',
    data: result,
  });
});



const getAllUsers = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await userService.getAllUserQuery(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Users fetched successfully',
    meta: result.meta,
    data: result.result,
  });
});

const getAllUsersOverview = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

  if (isNaN(year)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Invalid year parameter.',
      data: null,
    });
  }

  const result = await userService.getUsersOverview(userId, year);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Users overview fetched successfully',
    data: result,
  });
});

const updateMyProfile = catchAsync(async (req: Request, res: Response) => {
  if (req?.files && !Array.isArray(req.files)) {
    if (req.files.profileImage?.[0]) {
      req.body.profileImage = storeFile('profile', req.files.profileImage[0].filename);
    }
    if (req.files.coverPhoto?.[0]) {
      req.body.coverPhoto = storeFile('profile', req.files.coverPhoto[0].filename);
    }
  }

  const result = await userService.updateMyProfile(req.user.userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Profile updated successfully',
    data: result,
  });
});

const deleteMyAccount = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.deleteMyAccount(req.user.userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User deleted successfully',
    data: result,
  });
});

const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
  const { status } = req.body;
  const result = await userService.updateUserStatus(req.params.id, status);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `User status updated to ${status}`,
    data: result,
  });
});

const updateAdminApproval = catchAsync(async (req: Request, res: Response) => {
  const { status, reason } = req.body;
  const { userId: adminId } = req.user;
  const result = await userService.updateAdminApproval(req.params.id, status, adminId, reason);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Snapper ${status} successfully`,
    data: result,
  });
});

const verifyGuardian = catchAsync(async (req: Request, res: Response) => {
  
  const { token, status, reason } = req.query as {
    token: string;
    status?: 'approved' | 'rejected';
    reason?: string;
  };

  const result = await userService.verifyGuardianEmail(token, status, reason);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Guardian ${status || 'approved'} successfully`,
    data: result,
  });

});

const resendGuardianVerification = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const result = await userService.sendGuardianVerificationEmail(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Guardian verification email sent',
    data: result,
  });
});


const addFavoriteUser = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.addFavoriteUser(
    req.user?.userId,
    req.params.id,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User added to favorites successfully',
    data: result,
  });
});

const removeFavoriteUser = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.removeFavoriteUser(
    req.user?.userId,
    req.params.id,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User removed from favorites successfully',
    data: result,
  });
});

const getMyFavoriteUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.getMyFavoriteUsers(req.user?.userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Favorite users fetched successfully',
    data: result,
  });
});

export const userController = {
  attachSignupFiles,
  createUser,
  userCreateVarification,
  getMyProfile,
  getUserById,
  getAllUsers,
  getAllUsersOverview,
  getMyFavoriteUsers,
  updateMyProfile,
  deleteMyAccount,
  updateUserStatus,
  updateAdminApproval,
  verifyGuardian,
  resendGuardianVerification,
  addFavoriteUser,
  removeFavoriteUser
};
