import config from '../config';
import { LOGO_CID } from './mailSender';

export const PRIMARY_COLOR = '#E53935';
export const SUPPORT_EMAIL = 'support@photoop.com';

export const renderButton = (
  label: string,
  href: string,
  variant: 'primary' | 'outline' = 'primary',
): string => {
  const style =
    variant === 'primary'
      ? `background:${PRIMARY_COLOR};color:#ffffff;`
      : `background:#ffffff;color:${PRIMARY_COLOR};`;

  return `<a href="${href}" style="display:inline-block;padding:12px 28px;margin:6px 8px 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;border-radius:6px;border:2px solid ${PRIMARY_COLOR};${style}">${label}</a>`;
};

export const renderPoliciesSection = (): string => `
  <p style="margin-top:24px;font-size:12px;color:#999999;">
    By using PhotoOp, you agree to our
    <a href="${config.client_Url}/terms" style="color:${PRIMARY_COLOR};text-decoration:none;">Terms of Service</a>
    and
    <a href="${config.client_Url}/privacy" style="color:${PRIMARY_COLOR};text-decoration:none;">Privacy Policy</a>.
  </p>
`;

export const renderSupportLine = (): string => `
  <p style="margin-top:24px;font-size:14px;">
    If you didn't request this or need assistance, please contact our support team at
    <a href="mailto:${SUPPORT_EMAIL}" style="color:${PRIMARY_COLOR};text-decoration:none;">${SUPPORT_EMAIL}</a>.
  </p>
`;

export const renderSignature = (): string => `
  <p style="margin-top:32px;">
    Kind regards,<br />
    <strong>PhotoOp Team</strong><br />
    PhotoOp
  </p>
`;

// wraps arbitrary body HTML in the branded PhotoOp shell: logo + title inside the colored
// header band (logo is a cid attachment, since email clients can't load images from
// localhost), content, footer
export const renderEmailLayout = ({
  preheader = '',
  headerTitle,
  bodyHtml,
}: {
  preheader?: string;
  headerTitle?: string;
  bodyHtml: string;
}): string => {
  const year = new Date().getFullYear();

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
    <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>

    <!-- Header -->
    <div style="background-color:${PRIMARY_COLOR};background-image:linear-gradient(135deg,#B71C1C 0%,${PRIMARY_COLOR} 55%,#FF7A6E 100%);text-align:center;padding:36px 24px;">
      <div style="display:inline-block;background-color:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.4);border-radius:20px;padding:18px 32px;box-shadow:0 8px 20px rgba(0,0,0,0.18);">
        <img
          src="cid:${LOGO_CID}"
          alt="PhotoOp Logo"
          style="max-width:160px;height:auto;display:block;margin:0 auto;"
        />
      </div>
      ${headerTitle ? `<h1 style="color:#ffffff;margin:20px 0 0;font-size:22px;letter-spacing:0.3px;">${headerTitle}</h1>` : ''}
    </div>

    <!-- Body -->
    <div style="padding:24px;color:#333333;">
      ${bodyHtml}
    </div>

    <!-- Footer -->
    <div style="padding:20px 24px;background:#fafafa;text-align:center;font-size:12px;color:#999999;border-top:1px solid #eeeeee;">
      <p style="margin:0;">&copy; ${year} PhotoOp. All rights reserved.</p>
    </div>
  </div>
  `;
};
