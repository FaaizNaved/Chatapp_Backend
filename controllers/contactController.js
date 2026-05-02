const nodemailer = require("nodemailer");

/**
 * POST /api/contact
 * Body: { name, email, phone, message }
 * Sends a notification email to the developer and a thank-you reply to the sender.
 */
exports.handleContactForm = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { name, email, phone, message } = body;

    if (!email || !phone) {
      return res.status(400).json({ success: false, message: "Email and phone number are required." });
    }

    // Basic email format check
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(String(email).trim())) {
      return res.status(400).json({ success: false, message: "Please provide a valid email address." });
    }

    // ---------------------------------------------------------
    // Build transporter
    // If SMTP creds are configured in .env use them, otherwise
    // use Nodemailer's test account (Ethereal) as fallback.
    // ---------------------------------------------------------
    let isTestTransport = false;
    let transporter;
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      isTestTransport = true;
    }

    const devEmail = process.env.DEVELOPER_EMAIL || "mfaaiznaved786@gmail.com";
    const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // ── Email 1: Notify developer ─────────────────────────────
    const devMailOptions = {
      from: `"ChatSphere Contact" <${process.env.SMTP_USER || "noreply@chatsphere.app"}>`,
      to: devEmail,
      subject: `🚀 New Integration Enquiry from ${name || email}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;
          background:#0f1117;color:#e2e8f0;border-radius:12px;">
          <h2 style="color:#2dd4bf;margin:0 0 16px">New Integration Enquiry</h2>
          <p style="color:#94a3b8;margin:0 0 20px;font-size:14px;">Received on ${now}</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8;width:120px">Name</td>
                <td style="padding:10px 0;border-bottom:1px solid #1e293b">${name || "Not provided"}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8">Email</td>
                <td style="padding:10px 0;border-bottom:1px solid #1e293b">
                  <a href="mailto:${email}" style="color:#2dd4bf">${email}</a></td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8">Phone</td>
                <td style="padding:10px 0;border-bottom:1px solid #1e293b">${phone}</td></tr>
            <tr><td style="padding:10px 0;color:#94a3b8;vertical-align:top">Message</td>
                <td style="padding:10px 0">${message || "No message provided."}</td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:13px;color:#475569">
            Reach out at <a href="mailto:${email}" style="color:#2dd4bf">${email}</a>
            or call <strong>${phone}</strong>
          </p>
        </div>
      `,
    };

    // ── Email 2: Thank-you to sender ──────────────────────────
    const senderMailOptions = {
      from: `"ChatSphere" <${process.env.SMTP_USER || "noreply@chatsphere.app"}>`,
      to: email,
      subject: "We received your enquiry — ChatSphere",
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px;
          background:#0f1117;color:#e2e8f0;border-radius:12px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
            <span style="font-size:2rem">💬</span>
            <h2 style="margin:0;color:#2dd4bf">ChatSphere</h2>
          </div>
          <h3 style="margin:0 0 12px">Thank you, ${name || "there"}! 🎉</h3>
          <p style="color:#94a3b8;line-height:1.7;margin:0 0 20px">
            We've received your integration enquiry and will get back to you shortly
            at <strong style="color:#e2e8f0">${email}</strong>.
          </p>
          <div style="background:#1e293b;padding:16px 20px;border-radius:8px;margin-bottom:24px;
            border-left:4px solid #14b8a6;">
            <p style="margin:0;font-size:14px;color:#94a3b8">Your contact details:</p>
            <p style="margin:8px 0 0;font-size:14px">📧 ${email}<br>📱 ${phone}</p>
          </div>
          <p style="color:#64748b;font-size:13px;margin:0">
            — The ChatSphere Team
          </p>
        </div>
      `,
    };

    const [devInfo, senderInfo] = await Promise.all([
      transporter.sendMail(devMailOptions),
      transporter.sendMail(senderMailOptions),
    ]);

    if (isTestTransport && process.env.NODE_ENV !== "production") {
      console.log("Dev mail (to developer):", nodemailer.getTestMessageUrl(devInfo));
      console.log("Dev mail (to sender):",    nodemailer.getTestMessageUrl(senderInfo));
    } else {
      console.log(`[Mail] Sent to dev: ${devInfo.messageId}, to sender: ${senderInfo.messageId}`);
    }

    return res.json({ success: true, message: "Thank you! We will reach out to you soon." });
  } catch (err) {
    console.error("contact form error:", err);
    return res.status(500).json({ success: false, message: "Failed to send message. Please try again." });
  }
};
