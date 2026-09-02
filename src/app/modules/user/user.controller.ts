import { NextFunction, Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { storage } from '../../utils/storage';
import { userService } from './user.service';

// runs before validateRequest so a required identityImage (snapper signup) is
// already a stored URL (local or S3, per STORAGE_DRIVER) by the time the body is
// validated
const attachSignupFiles = catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  if (files?.identityImage?.[0]) {
    const uploaded = await storage.save(files.identityImage[0], 'profile');
    req.body.identityImage = uploaded.url;
  }
  next();
});

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

const getAllCustomers = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.getAllCustomers(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Customers fetched successfully',
    meta: result.meta,
    data: result.result,
  });
});

const getAllSnappers = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.getAllSnappers(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Snappers fetched successfully',
    meta: result.meta,
    data: result.result,
  });
});

const getPendingSnappers = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.getPendingSnappers(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Pending snappers fetched successfully',
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
      req.body.profileImage = (await storage.save(req.files.profileImage[0], 'profile')).url;
    }
    if (req.files.coverPhoto?.[0]) {
      req.body.coverPhoto = (await storage.save(req.files.coverPhoto[0], 'profile')).url;
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

const updateAdminProfile = catchAsync(async (req: Request, res: Response) => {
  if (req?.files && !Array.isArray(req.files)) {
    if (req.files.profileImage?.[0]) {
      req.body.profileImage = (await storage.save(req.files.profileImage[0], 'profile')).url;
    }
    if (req.files.coverPhoto?.[0]) {
      req.body.coverPhoto = (await storage.save(req.files.coverPhoto[0], 'profile')).url;
    }
  }

  console.log(req.user.userId, req.body)

  const result = await userService.updateAdminProfile(req.user.userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Profile updated successfully',
    data: result,
  });
});

const getMyNotificationSettings = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.getMyNotificationSettings(req.user.userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notification settings retrieved successfully',
    data: result,
  });
});

const updateMyNotificationSettings = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.updateMyNotificationSettings(req.user.userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notification settings updated successfully',
    data: result,
  });
});

const getMyBookingOverview = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.getUserBookingOverview(req.user.userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Booking overview retrieved successfully',
    data: result,
  });
});

const getMySnapperProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.getMySnapperProfile(req.user.userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Snapper profile retrieved successfully',
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
  getAllCustomers,
  getAllSnappers,
  getPendingSnappers,
  getAllUsersOverview,
  getMyFavoriteUsers,
  updateMyProfile,
  updateAdminProfile,
  getMyNotificationSettings,
  updateMyNotificationSettings,
  getMyBookingOverview,
  getMySnapperProfile,
  deleteMyAccount,
  updateUserStatus,
  updateAdminApproval,
  verifyGuardian,
  resendGuardianVerification,
  addFavoriteUser,
  removeFavoriteUser
};
