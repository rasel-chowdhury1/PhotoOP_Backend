import { Router } from 'express';
import path from 'path';
import { authControllers } from './auth.controller';
import auth from '../../middleware/auth';
import validateRequest from '../../middleware/validateRequest';
import { authValidation } from './auth.validation';
import fileUpload from '../../middleware/fileUpload';
import parseData from '../../middleware/parseData';
import { userController } from '../user/user.controller';
import config from '../../config';

// must be an absolute path under config.upload_root — storage.save() (see
// utils/storage/local.storage.ts) verifies the file was written under
// path.join(UPLOAD_ROOT, folder) before deriving its key
const upload = fileUpload(path.join(config.upload_root, 'profile'));



export const authRoutes = Router();

authRoutes
  .post('/login', authControllers.login)

  .post(
    '/logout',
    auth('user', 'snapper', 'admin'),
    authControllers.logout,
  )


  .post(
    '/google-login', 
    authControllers.googleLogin
  )

  .post(
    '/apple-login',
    authControllers.appleLogin
  )

  .post(
    '/google-signup-snapper',
    upload.fields([{ name: 'identityImage', maxCount: 1 }]),
    parseData(),
    userController.attachSignupFiles,
    authControllers.googleSignupSnapper,
  )

  .post(
    '/apple-signup-snapper',
    upload.fields([{ name: 'identityImage', maxCount: 1 }]),
    parseData(),
    userController.attachSignupFiles,
    authControllers.appleSignupSnapper,
  )

  .post(
    '/refresh-token',
    validateRequest(authValidation.refreshTokenValidationSchema),
    authControllers.refreshToken,
  )
  .post(
    '/forgot-password-otpByEmail',
    validateRequest(authValidation.forgetPasswordValidationSchemaByEmail),
    authControllers.forgotPassword,
  )

  .post(
    '/forgot-password-otpByNumber',
    validateRequest(authValidation.forgetPasswordValidationSchemaByNumber),
    authControllers.forgotPassword,
  )

  .patch(
    '/change-password',
    auth('user',"admin"),
    authControllers.changePassword,
  )

  .patch(
    '/forgot-password-otp-match',
    validateRequest(authValidation.otpMatchValidationSchema),
    authControllers.forgotPasswordOtpMatch,
  )
  .patch(
    '/forgot-password-reset',
    validateRequest(authValidation.resetPasswordValidationSchema),
    authControllers.resetPassword,
  );
