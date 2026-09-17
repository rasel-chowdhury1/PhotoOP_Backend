import config from "../config";
import { sendEmail } from "./mailSender";
import {
  PRIMARY_COLOR,
  renderEmailLayout,
  renderPoliciesSection,
  renderSignature,
  renderSupportLine,
} from "./emailTemplate";

interface OtpSendEmailParams {
  sentTo: string;
  subject: string;
  name: string;
  otp: string | number;
  expiredAt: string;
}

const otpSendEmail = async ({
  sentTo,
  subject,
  name,
  otp,
}: OtpSendEmailParams): Promise<void> => {
  const otpExpiryMinutes = parseInt(config.otp_expire_time as string) || 2;

  const emailBody = renderEmailLayout({
    preheader: `Your PhotoOp verification code is ${otp}`,
    headerTitle: 'One-Time Password (OTP)',
    bodyHtml: `
      <p style="margin: 0 0 16px; line-height: 1.6;">Hello <strong>${name}</strong>,</p>

      <p style="margin: 0 0 16px; line-height: 1.6;">
        Use the following One-Time Password (OTP) to complete your verification.
        This code is valid for a limited time.
      </p>

      <div style="
        background-color: #f4f6fb;
        border: 1px dashed ${PRIMARY_COLOR};
        padding: 20px;
        text-align: center;
        border-radius: 6px;
        margin: 24px 0;
      ">
        <p style="margin: 0; font-size: 14px; color: #555;">Your OTP Code</p>
        <p style="margin: 8px 0 0; font-size: 28px; font-weight: bold; color: ${PRIMARY_COLOR}; letter-spacing: 4px;">
          ${otp}
        </p>
      </div>

      <p style="font-size: 14px; color: #666;">
        This OTP will expire in <strong>${otpExpiryMinutes} minute${otpExpiryMinutes === 1 ? '' : 's'}</strong>.
      </p>

      ${renderSupportLine()}
      ${renderPoliciesSection()}
      ${renderSignature()}
    `,
  });

  await sendEmail(sentTo, subject, emailBody);
};

export { otpSendEmail };
