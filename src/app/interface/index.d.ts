import { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
      // set by resolveDeliveryUploadContext (src/app/middleware/deliveryUpload.ts)
      // before multer runs, so its diskStorage destination/filename callbacks know
      // where a delivery asset upload belongs
      deliveryUploadContext?: {
        bookingId: string;
        attempt: number;
        folder: string;
      };
    }
  }
}
