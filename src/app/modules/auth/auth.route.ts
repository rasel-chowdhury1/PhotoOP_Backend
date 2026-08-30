import { Router } from 'express';
import { authControllers } from './auth.controller';
import auth from '../../middleware/auth';
import validateRequest from '../../middleware/validateRequest';
import { authValidation } from './auth.validation';
import fileUpload from '../../middleware/fileUpload';
import parseData from '../../middleware/parseData';
import { userController } from '../user/user.controller';

const upload = fileUpload('./public/uploads/profile');



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
