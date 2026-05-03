/**
 * emailService.js
 * Sends transactional emails via Brevo HTTP API (no SMTP needed).
 * Falls back to nodemailer Ethereal for local dev if BREVO_API_KEY is not set.
 */

/**
 * Send an email via Brevo's HTTP API.
 * @param {{ to: string, subject: string, html: string, senderName?: string }} opts
 */
async function sendEmail({ to, subject, html, senderName = "ChatSphere" }) {
  const apiKey = process.env.BREVO_API_KEY;

  if (apiKey) {
    // Production: use Brevo HTTP API
    const senderEmail = process.env.SMTP_USER || process.env.DEVELOPER_EMAIL || "noreply@chatsphere.app";
    console.log(`[EMAIL] Sending via Brevo API to: ${to}`);

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.log("[EMAIL] Brevo API error:", res.status, JSON.stringify(data));
      throw new Error(data.message || `Brevo API error: ${res.status}`);
    }

    console.log("[EMAIL] Sent OK via Brevo, messageId:", data.messageId);
    return data;
  }

  // Local dev fallback: use Ethereal test account
  const nodemailer = require("nodemailer");
  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });

  const info = await transporter.sendMail({
    from: `"${senderName}" <${testAccount.user}>`,
    to,
    subject,
    html,
  });

  console.log("[EMAIL] Dev preview:", nodemailer.getTestMessageUrl(info));
  return info;
}

module.exports = { sendEmail };
