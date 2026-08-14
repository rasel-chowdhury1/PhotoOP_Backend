import nodemailer from 'nodemailer';
import path from 'path';
import config from '../config';

// referenced in email HTML as <img src="cid:LOGO_CID">, since email clients
// can't load images from localhost/private URLs
export const LOGO_CID = 'photoop-logo';
const LOGO_PATH = path.join(process.cwd(), 'public', 'uploads', 'logo', 'PhotoOp_logo.png');

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
