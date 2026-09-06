import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join((process.cwd(), '.env')) });

const emailService = {
  url: process.env.EMAIL_SERVICE_URL,
  apiKey: process.env.EMAIL_SERVICE_API_KEY,
};

const aws = {
  accessKeyId: process.env.S3_BUCKET_ACCESS_KEY,
  secretAccessKey: process.env.S3_BUCKET_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
  bucket: process.env.AWS_BUCKET_NAME,
};

const stripe = {
  stripe_api_key: process.env.STRIPE_API_KEY,
  stripe_api_secret: process.env.STRIPE_API_SECRET,
};

// mobile app deep links Stripe Checkout redirects to after payment — override in .env
// once the app's actual URL scheme is known
const payment_success_url = process.env.PAYMENT_SUCCESS_URL || 'photoop://payment/success';
const payment_cancel_url = process.env.PAYMENT_CANCEL_URL || 'photoop://payment/cancel';

// "local" | "s3" — see src/app/utils/storage/index.ts.
const storage_driver = process.env.STORAGE_DRIVER || 'local';

// snapper payout policy — no prior convention existed for any of these, so they default
// to the safest/most conservative values (no fee, a week-long dispute/refund hold
// mirroring the existing 7-day delivery auto-accept window) until product specifies
// real numbers. feePercentage is a fraction of the withdrawal amount (0.02 = 2%).
const withdrawal = {
  holdDays: Number(process.env.WITHDRAWAL_HOLD_DAYS) || 7,
  feePercentage: Number(process.env.WITHDRAWAL_FEE_PERCENTAGE) || 0,
  minAmount: Number(process.env.WITHDRAWAL_MIN_AMOUNT) || 10,
};

// under public/ (served by express.static) so delivery assets share the same
// uploads convention as profile/portfolio images — lands at public/uploads/deliveries/...
const upload_root = process.env.UPLOAD_ROOT || path.join(process.cwd(), 'public', 'uploads');

// used to build the URL storage.getUrl() returns for an uploaded asset
const public_base_url =
  process.env.PUBLIC_BASE_URL || `http://${process.env.IP}:${process.env.PORT}`;

// base URL of this backend itself, used to build links (e.g. guardian verification
// page) that must resolve back to this server rather than the CLIENT_URL frontend
const server_base_url =
  `${process.env.SERVER_URL}/api/v1`  || `http://${process.env.IP}:${process.env.PORT}/api/v1`;

const smtp = {
  host: process.env.NODEMAILER_HOST,
  port: process.env.NODEMAILER_PORT,
  user: process.env.NODEMAILER_HOST_EMAIL,
  pass: process.env.NODEMAILER_HOST_PASS,
  fromName: process.env.NODEMAILER_FROM_NAME,

  region: process.env.AWS_REGION as string,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,

  fromEmail: process.env.MAIL_FROM_EMAIL as string,
}

export default {
  NODE_ENV: process.env.NODE_ENV,
  port: process.env.PORT,
  ip: process.env.IP,
  database_url: process.env.DATABASE_URL,
  server_url: process.env.SERVER_URL,
  server_base_url,
  client_Url: process.env.CLIENT_URL,
  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
  jwt_access_secret: process.env.JWT_ACCESS_SECRET,
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
  jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN,
  jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN,
  nodemailer_host_email: process.env.NODEMAILER_HOST_EMAIL,
  nodemailer_host_pass: process.env.NODEMAILER_HOST_PASS,

  admin_email: process.env.ADMIN_EMAIL,
  admin_password: process.env.ADMIN_PASSWORD,
  admin_phone: process.env.ADMIN_PHONE,

  twilio_account_sid: process.env.TWILIO_ACCOUNT_SID,
  twilio_auth_token: process.env.TWILIO_AUTH_TOKEN,
  twilio_phone_number: process.env.TWILIO_PHONE_NUMBER,
  otp_expire_time: process.env.OTP_EXPIRE_TIME,
  otp_token_expire_time: process.env.OTP_TOKEN_EXPIRE_TIME,
  socket_port: process.env.SOCKET_PORT,
  stripe_secret: process.env.STRIPE_API_SECRET,
  stripe_key: process.env.STRIPE_API_KEY,
  stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
  payment_success_url,
  payment_cancel_url,
  storage_driver,
  upload_root,
  public_base_url,
  smtp,
  emailService,
  aws,
  stripe,
  withdrawal,
};
