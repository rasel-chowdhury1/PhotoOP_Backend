import { Router } from 'express';
import path from 'path';
import auth from '../../middleware/auth';
import fileUpload from '../../middleware/fileUpload';
import parseData from '../../middleware/parseData';
import validateRequest from '../../middleware/validateRequest';
import { resentOtpValidations } from '../otp/otp.validation';
import { userController } from './user.controller';
import { userValidation } from './user.validation';
import { USER_ROLE } from './user.constants';
import config from '../../config';

// must be an absolute path under config.upload_root — storage.save() (see
// utils/storage/local.storage.ts) verifies the file was written under
// path.join(UPLOAD_ROOT, folder) before deriving its key
const upload = fileUpload(path.join(config.upload_root, 'profile'));

export const userRoutes = Router();

userRoutes
  .post(
    '/create',
    upload.fields([{ name: 'identityImage', maxCount: 1 }]),
    parseData(),
    userController.attachSignupFiles,
    validateRequest(userValidation.createUserValidationSchema),
    userController.createUser,
  )

  .post(
    '/create-user-verify-otp',
    validateRequest(resentOtpValidations.verifyOtpZodSchema),
    userController.userCreateVarification,
  )

  .get(
    '/my-profile', 
    auth('user', 'snapper', 'admin'), 
    userController.getMyProfile
  )

  .get(
    '/all-users', 
    auth('admin'), 
    userController.getAllUsers
  )

  .get(
    '/all-users-overview',
    auth('admin'),
    userController.getAllUsersOverview
  )

  .get(
    '/all-customers',
    auth(USER_ROLE.ADMIN),
    userController.getAllCustomers
  )

  .get(
    '/all-snappers',
    auth(USER_ROLE.ADMIN),
    userController.getAllSnappers
  )

  .get(
    '/pending-snappers',
    auth(USER_ROLE.ADMIN),
    userController.getPendingSnappers
  )

  // guardian clicks this link from the verification email, so it must stay unauthenticated
  .get(
    '/verify-guardian',
    userController.verifyGuardian
  )

  
  .get(
    '/favorites',
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    userController.getMyFavoriteUsers,
  )

  .get(
    '/notification-settings',
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    userController.getMyNotificationSettings,
  )

  .patch(
    '/notification-settings',
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    validateRequest(userValidation.updateNotificationSettingsValidationSchema),
    userController.updateMyNotificationSettings,
  )

  .get(
    '/booking-overview',
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    userController.getMyBookingOverview,
  )

  .get(
    '/my-snapper-profile',
    auth(USER_ROLE.SNAPPER),
    userController.getMySnapperProfile,
  )



  .get(
    '/:id',
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN), 
    userController.getUserById
  )

  .patch(
    '/update-my-profile',
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    upload.fields([
      { name: 'profileImage', maxCount: 1 },
      { name: 'coverPhoto', maxCount: 1 },
    ]),
    parseData(),
    validateRequest(userValidation.updateMyProfileValidationSchema),
    userController.updateMyProfile,
  )

  .patch(
    '/admin/update-my-profile',
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    upload.fields([
      { name: 'profileImage', maxCount: 1 },
      { name: 'coverPhoto', maxCount: 1 },
    ]),
    parseData(),
    validateRequest(userValidation.updateMyProfileValidationSchema),
    userController.updateAdminProfile,
  )

  .patch(
    '/status/:id',
    auth(USER_ROLE.ADMIN),
    validateRequest(userValidation.updateUserStatusValidationSchema),
    userController.updateUserStatus,
  )

  .patch(
    '/approval/:id',
    auth(USER_ROLE.ADMIN),
    validateRequest(userValidation.updateAdminApprovalValidationSchema),
    userController.updateAdminApproval,
  )

  .post(
    '/resend-guardian-verification',
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    userController.resendGuardianVerification,
  )


  .post(
    '/favorites/:id',
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    userController.addFavoriteUser,
  )

  .delete(
    '/favorites/:id',
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    userController.removeFavoriteUser,
  )

  .delete(
    '/delete-my-account', 
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    userController.deleteMyAccount);
