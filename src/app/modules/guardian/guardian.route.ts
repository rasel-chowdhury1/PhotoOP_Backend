import { Router } from 'express';
import fileUpload from '../../middleware/fileUpload';
import { guardianController } from './guardian.controller';

const guardianUpload = fileUpload('./public/uploads/guardian');

export const guardianRoutes = Router();

guardianRoutes
  // guardian reaches this from the consent email, so it must stay unauthenticated
  .get('/verify', guardianController.showVerificationForm)
  .post(
    '/verify',
    guardianUpload.fields([{ name: 'idImage', maxCount: 1 }]),
    guardianController.submitVerification,
  );
