const nodemailer = require("nodemailer");
const twilio = require("twilio");

let mailTransporter;
let twilioClient;

function getMailTransporter() {
  if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
    throw new Error("Email delivery is not configured");
  }

  if (!mailTransporter) {
    mailTransporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 587),
      secure: String(process.env.MAIL_SECURE || "false") === "true",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      }
    });
  }

  return mailTransporter;
}

async function verifyMailTransport() {
  const transporter = getMailTransporter();
  await transporter.verify();
}

function getTwilioClient() {
  if (!process.env.TWILIO_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE) {
    throw new Error("Phone delivery is not configured");
  }

  if (!twilioClient) {
    twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  }

  return twilioClient;
}

function buildEmailShell({ preheader, title, intro, actionText, actionUrl, detailLines, footerNote }) {
  const details = detailLines
    .map((line) => `<p style="margin:0 0 10px;color:#475467;font-size:14px;line-height:1.7;">${line}</p>`)
    .join("");

  return `
    <div style="margin:0;padding:24px;background:#f4f7fb;font-family:Arial,sans-serif;color:#101828;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e4e7ec;">
        <tr>
          <td style="padding:32px 32px 20px;background:#0f172a;">
            <div style="font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#cbd5e1;">ChatApp Security</div>
            <h1 style="margin:14px 0 0;color:#ffffff;font-size:28px;line-height:1.2;">${title}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 18px;color:#344054;font-size:15px;line-height:1.75;">${intro}</p>
            ${details}
            ${
              actionUrl
                ? `<div style="margin:28px 0;">
                    <a href="${actionUrl}" style="display:inline-block;padding:14px 22px;background:#111827;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:700;font-size:14px;">${actionText}</a>
                  </div>`
                : ""
            }
            <p style="margin:24px 0 0;color:#667085;font-size:13px;line-height:1.7;">${footerNote}</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

async function sendEmailVerificationCode(email, code) {
  const transporter = getMailTransporter();
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to: email,
    subject: "ChatApp account verification code",
    text: [
      "ChatApp Account Verification",
      "",
      `Your one-time verification code is: ${code}`,
      "This code will expire in 10 minutes.",
      "",
      "If you did not request this verification, please ignore this message."
    ].join("\n"),
    html: buildEmailShell({
      preheader: "Use this verification code to complete your ChatApp signup.",
      title: "Verify your contact details",
      intro: "We received a request to verify this email address for a ChatApp account.",
      detailLines: [
        `Your one-time verification code is <strong style="font-size:24px;color:#111827;letter-spacing:0.18em;">${code}</strong>.`,
        "For your security, this code expires in 10 minutes and can be used only for account verification."
      ],
      footerNote: "If you did not initiate this request, no further action is required."
    })
  });
}

async function sendPasswordResetEmail(email, resetUrl) {
  const transporter = getMailTransporter();
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to: email,
    subject: "ChatApp password reset request",
    text: [
      "ChatApp Password Reset",
      "",
      "We received a request to reset your ChatApp password.",
      `Reset your password using this secure link: ${resetUrl}`,
      "This link expires in 30 minutes.",
      "",
      "If you did not request a password reset, you can safely ignore this email."
    ].join("\n"),
    html: buildEmailShell({
      preheader: "Reset your ChatApp password securely.",
      title: "Reset your password",
      intro: "We received a request to reset the password associated with your ChatApp account.",
      actionText: "Reset Password",
      actionUrl: resetUrl,
      detailLines: [
        "For your protection, this secure link will expire in 30 minutes.",
        "If you did not request this change, you can ignore this email and your password will remain unchanged."
      ],
      footerNote: "For security reasons, please do not forward this email or share the reset link with anyone."
    })
  });
}

async function sendPhoneVerificationCode(phone, code) {
  const client = getTwilioClient();
  await client.messages.create({
    body: `ChatApp security code: ${code}. This verification code expires in 10 minutes. If you did not request it, please ignore this message.`,
    from: process.env.TWILIO_PHONE,
    to: phone
  });
}

async function sendPasswordResetSms(phone, resetUrl) {
  const client = getTwilioClient();
  await client.messages.create({
    body: `ChatApp password reset requested. Use this secure link within 30 minutes: ${resetUrl}`,
    from: process.env.TWILIO_PHONE,
    to: phone
  });
}

module.exports = {
  verifyMailTransport,
  sendEmailVerificationCode,
  sendPhoneVerificationCode,
  sendPasswordResetEmail,
  sendPasswordResetSms
};
