import nodemailer from 'nodemailer';
import path from 'path';
import config from '../config';

// referenced in email HTML as <img src="cid:LOGO_CID">, since email clients
// can't load images from localhost/private URLs
export const LOGO_CID = 'photoop-logo';
const LOGO_PATH = path.join(process.cwd(), 'public', 'uploads', 'logo', 'PhotoOp_logo.png');


export const sendEmailViaApi = async (
  to: string,
  subject: string,
  html: string,
  text = '',
) => {
  try {
    console.log('==========>>> Sending email via REST API...');

    const response = await fetch(
      `${config.emailService.url}/sent_email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.emailService.apiKey,
        },
        body: JSON.stringify({
          to,
          subject,
          text,
          html,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error ||
        data?.message ||
        'Email service request failed',
      );
    }

    console.log(
      '==========>>> Email sent successfully via REST API',
      data.messageId,
    );

    return data;
  } catch (error) {
    console.error(
      '==========>>> Email API error:',
      error,
    );

    throw error;
  }
};

export const sendEmail = async (to: string, subject: string, html: string) => {

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: config.NODE_ENV === 'production',
    auth: {
      // TODO: replace `user` and `pass` values from <https://forwardemail.net>
      user: config.nodemailer_host_email,
      pass: config.nodemailer_host_pass,
    },
  });



  try {
     console.log('==========>>>   mail send sending.....');
    await transporter.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`, // sender address
      to, // list of receivers
      subject,
      text: '', // plain text body
      html, // html body
      attachments: [
        {
          filename: 'PhotoOp_logo.png',
          path: LOGO_PATH,
          cid: LOGO_CID,
        },
      ],
    });

    console.log("==========>>> mail sent successfully!!!")

  } catch (error) {
    
    console.log('send mail error:', error);

  }
  console.log('==========>>> mail send stopped');
};
