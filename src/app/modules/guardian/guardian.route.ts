import { Router } from 'express';
import path from 'path';
import fileUpload from '../../middleware/fileUpload';
import { guardianController } from './guardian.controller';
import config from '../../config';

// must be an absolute path under config.upload_root — storage.save() (see
// utils/storage/local.storage.ts) verifies the file was written under
// path.join(UPLOAD_ROOT, folder) before deriving its key
const guardianUpload = fileUpload(path.join(config.upload_root, 'guardian'));

export const guardianRoutes = Router();

guardianRoutes
  // guardian reaches this from the consent email, so it must stay unauthenticated
  .get('/verify', guardianController.showVerificationForm)
  .post(
    '/verify',
    guardianUpload.fields([{ name: 'idImage', maxCount: 1 }]),
    guardianController.submitVerification,
  );
