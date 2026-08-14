import { Router } from 'express';
import auth from '../../middleware/auth';
import validateRequest from '../../middleware/validateRequest';
import { availabilityController } from './availability.controller';
import { availabilityValidation } from './availability.validation';
import { USER_ROLE } from '../user/user.constants';

export const availabilityRoutes = Router();

availabilityRoutes
  .get(
    '/my-availability',
    auth(USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    availabilityController.getMyAvailability,
  )

  // for customers checking a snapper's schedule before booking
  .get(
    '/user/:userId',
    auth(USER_ROLE.USER, USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    availabilityController.getSpecificUserAvailability,
  )

  .patch(
    '/day/:day',
    auth(USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    validateRequest(availabilityValidation.toggleDayAvailabilityZodSchema),
    availabilityController.toggleDayAvailability,
  )

  .post(
    '/day/:day/slots',
    auth(USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    validateRequest(availabilityValidation.addTimeSlotZodSchema),
    availabilityController.addTimeSlot,
  )

  .patch(
    '/day/:day/slots/:slotId',
    auth(USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    validateRequest(availabilityValidation.updateTimeSlotZodSchema),
    availabilityController.updateTimeSlot,
  )

  .delete(
    '/day/:day/slots/:slotId',
    auth(USER_ROLE.SNAPPER, USER_ROLE.ADMIN),
    validateRequest(availabilityValidation.deleteTimeSlotZodSchema),
    availabilityController.deleteTimeSlot,
  )

