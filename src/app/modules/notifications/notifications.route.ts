import { Router } from 'express';
import auth from '../../middleware/auth';
import { notificationController } from './notifications.controller';
import { otpControllers } from '../otp/otp.controller';
import { USER_ROLE } from '../user/user.constants';

export const notificationRoutes = Router();



notificationRoutes
  .post(
    "/create",
    auth(
      USER_ROLE.USER,
      USER_ROLE.SNAPPER,
      USER_ROLE.ADMIN
    ),
    notificationController.createNotification
  )
  .get(
    '/all-notifications', 
    auth(
      USER_ROLE.USER,
      USER_ROLE.SNAPPER,
      USER_ROLE.ADMIN
    ),
    notificationController.getAllNotifications
  )

  .get(
    '/my-notifications', 
    auth(
      USER_ROLE.USER,
      USER_ROLE.SNAPPER,
      USER_ROLE.ADMIN
    ),
    notificationController.getMyNotifications
  )

  .patch(
    '/mark-read/:id', 
    auth(
      USER_ROLE.USER,
      USER_ROLE.SNAPPER,
      USER_ROLE.ADMIN
    ), 
    notificationController.markAsRead
  )

  .patch(
    "/read-all", 
    auth(
      USER_ROLE.USER,
      USER_ROLE.SNAPPER,
      USER_ROLE.ADMIN
    ),
    notificationController.markAllAsRead
  )

  
  .delete(
    '/delete/:id', 
    auth(
      USER_ROLE.USER,
      USER_ROLE.SNAPPER,
      USER_ROLE.ADMIN
    ),
    notificationController.deleteNotification
  );
