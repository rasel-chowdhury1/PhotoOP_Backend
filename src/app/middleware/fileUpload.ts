import { Request } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import config from '../config'; // আপনার প্রজেক্ট স্ট্রাকচার অনুযায়ী path ঠিক করুন

const UPLOAD_ROOT = path.resolve(config.upload_root); // local.storage.ts-এর সাথে same root

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/svg',
  'image/webp',
  'application/octet-stream',
  'image/svg+xml',
  'video/mp4',
  'video/avi',
  'video/mov',
  'video/mkv',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// ============================================================
// 1) পুরনো — static folder upload (business, profile, ইত্যাদি)
// ============================================================
const fileUpload = (uploadDirectory: string) => {
  if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: function (req: Request, file, cb) {
      if (file.fieldname === 'introVideo' || file.fieldname === 'video') {
        cb(null, './public/uploads/video');
      } else {
        cb(null, uploadDirectory);
      }
    },
    filename: function (req: Request, file, cb) {
      const parts = file.originalname.split('.');
      let extension;
      if (parts.length > 1) {
        extension = '.' + parts.pop();
      }
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(
        null,
        parts.shift()!.replace(/\s+/g, '_') + '-' + uniqueSuffix + extension
      );
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req: Request, file, cb) => {
      if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type!'));
      }
    },
  });

  return upload;
};

// ============================================================
// 2) নতুন — dynamic folder upload (শুধু delivery route-এর জন্য)
// ============================================================
export const dynamicFolderUpload = () => {
  const storage = multer.diskStorage({
    destination: function (req: Request, _file, cb) {
      const context = (req as any).deliveryUploadContext;
      if (!context?.folder) {
        return cb(new Error('Upload context not resolved before file upload'), '');
      }

      const targetDir = path.join(UPLOAD_ROOT, context.folder);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      cb(null, targetDir);
    },
    filename: function (_req: Request, file, cb) {
      const parts = file.originalname.split('.');
      let extension;
      if (parts.length > 1) {
        extension = '.' + parts.pop();
      }
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(
        null,
        parts.shift()!.replace(/\s+/g, '_') + '-' + uniqueSuffix + extension
      );
    },
  });

  return multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req: Request, file, cb) => {
      if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type!'));
      }
    },
  });
};

export default fileUpload;