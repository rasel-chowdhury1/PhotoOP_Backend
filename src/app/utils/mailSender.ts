import nodemailer from 'nodemailer';
import path from 'path';
import config from '../config';


// export const sendEmailViaApi = async (
//   to: string,
//   subject: string,
//   html: string,
//   text = '',
// ) => {
//   try {
//     console.log('==========>>> Sending email via REST API...');

//     const response = await fetch(
//       `${config.emailService.url}/sent_email`,
//       {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//           'x-api-key': config.emailService.apiKey,
//         },
//         body: JSON.stringify({
//           to,
//           subject,
//           text,
//           html,
//         }),
//       },
//     );

//     const data = await response.json();

//     if (!response.ok) {
//       throw new Error(
//         data?.error ||
//         data?.message ||
//         'Email service request failed',
//       );
//     }

//     console.log(
//       '==========>>> Email sent successfully via REST API',
//       data.messageId,
//     );

//     return data;
//   } catch (error) {
//     console.error(
//       '==========>>> Email API error:',
//       error,
//     );

//     throw error;
//   }
// };


const isProduction = process.env.NODE_ENV === 'production';

// console.log(" isProduction:", isProduction);
// console.log(" config.smtp.host:", config.smtp.host);
// console.log(" config.smtp.user:", config.smtp.user);
// console.log(" config.smtp.pass:", config.smtp.pass);

const transporter = nodemailer.createTransport({
  host: config.smtp.host, // sending SMTP server
  port: isProduction ? 2525 : 587,             // SSL port
  secure: false,
  requireTLS: true,           // true for port 465
  auth: {
    user: config.smtp.user,        // webmail email
    pass: config.smtp.pass   // SMTP/webmail password
  },
  tls: { rejectUnauthorized: false },
});

transporter.verify((err, success) => {
  if (err) {
    console.error('SMTP connection failed', err);
  } else {
    console.log('SMTP is ready to send mail');
  }
});  

type MailAttachment = NonNullable<
  Parameters<typeof transporter.sendMail>[0]["attachments"]
>[number];

export const LOGO_CID = "photoop-logo@photooprps.com";

const LOGO_PATH = path.join(
  process.cwd(),
  "src/assets/logo.png",
);

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  headers?: Record<string, string>,
  attachments?: MailAttachment[],
) => {

    const logoAttachment: MailAttachment = {
      filename: "logo.png",
      path: LOGO_PATH,
      cid: LOGO_CID,
      contentType: "image/png",
      contentDisposition: "inline",
    };


  try {
     console.log('mail send started =>>>>>>>>> ');
    await transporter.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`, // sender address
      to, // list of receivers
      subject,
      html, // html body
      headers, // optional custom headers (e.g. List-Unsubscribe)
      attachments: [
        logoAttachment,
        ...(attachments || []),
      ],
    });

    console.log('mail sended successfully =>>>>>>>> ');
    
  } catch (error) {
    console.log('send mail error:', error);
    
  }
  console.log('mail sended stopped');
};

// export const sendEmail = async (to: string, subject: string, html: string) => {

//   const transporter = nodemailer.createTransport({
//     host: 'smtp.gmail.com',
//     port: 587,
//     secure: config.NODE_ENV === 'production',
//     auth: {
//       // TODO: replace `user` and `pass` values from <https://forwardemail.net>
//       user: config.nodemailer_host_email,
//       pass: config.nodemailer_host_pass,
//     },
//   });



//   try {
//      console.log('==========>>>   mail send sending.....');
//     await transporter.sendMail({
//       from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`, // sender address
//       to, // list of receivers
//       subject,
//       text: '', // plain text body
//       html, // html body
//       attachments: [
        // {
        //   filename: 'PhotoOp_logo.png',
        //   path: LOGO_PATH,
        //   cid: LOGO_CID,
        // },
//       ],
//     });

//     console.log("==========>>> mail sent successfully!!!")

//   } catch (error) {
    
//     console.log('send mail error:', error);

//   }
//   console.log('==========>>> mail send stopped');
// };
