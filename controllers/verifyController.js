/**
 * verifyController.js
 * Send and verify OTP for email/phone in profile settings.
 */
const nodemailer = require("nodemailer");
const User = require("../models/user.js");
const { buildUserIdentity } = require("../utils/auth.js");

// In-memory OTP store: userId+field -> { code, expiresAt }
const otpStore = new Map();

function makeKey(userId, field) { return `${userId}:${field}`; }
function generateOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }

async function getTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      service: "gmail",
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
    });
  }
  const testAccount = await nodemailer.createTestAccount();
  const t = nodemailer.createTransport({
    host: "smtp.ethereal.email", port: 587, secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  return t;
}

/* POST /api/verify/send-otp
   body: { field: "email"|"phone", value: "..." }
*/
exports.sendOtp = async (req, res) => {
  try {
    const { field, value } = req.body || {};
    if (!field || !value) {
      return res.status(400).json({ success: false, message: "field and value are required" });
    }
    if (!["email", "phone"].includes(field)) {
      return res.status(400).json({ success: false, message: "field must be 'email' or 'phone'" });
    }
    if (field === "email") {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(value.trim())) {
        return res.status(400).json({ success: false, message: "Invalid email address" });
      }
      // Check uniqueness
      const existing = await User.findOne({ email: value.trim().toLowerCase(), _id: { $ne: req.user.id } });
      if (existing) return res.status(409).json({ success: false, message: "Email already in use" });
    }

    const code = generateOtp();
    const key = makeKey(req.user.id, field);
    otpStore.set(key, { code, value: value.trim().toLowerCase(), expiresAt: Date.now() + 10 * 60 * 1000 });

    if (field === "email") {
      const transporter = await getTransporter();
      const info = await transporter.sendMail({
        from: `"ChatSphere" <${process.env.SMTP_USER || "noreply@chatsphere.app"}>`,
        to: value.trim(),
        subject: "ChatSphere — Your verification code",
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f1117;color:#e2e8f0;border-radius:12px;">
            <h2 style="color:#2dd4bf;margin:0 0 16px">Email Verification</h2>
            <p style="color:#94a3b8;margin:0 0 24px">Your verification code is:</p>
            <div style="background:#1e293b;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;border:1px solid #14b8a6;">
              <span style="font-size:2.5rem;font-weight:900;letter-spacing:0.3em;color:#2dd4bf">${code}</span>
            </div>
            <p style="color:#64748b;font-size:13px;margin:0">This code expires in 10 minutes. Do not share it.</p>
          </div>`,
      });
      if (process.env.NODE_ENV !== "production") {
        console.log("OTP preview:", nodemailer.getTestMessageUrl(info));
      }
    } else {
      // Phone: send SMS via Twilio
      if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE) {
        const twilio = require("twilio");
        const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({
          body: `Your ChatSphere verification code is: ${code}. It expires in 10 minutes.`,
          from: process.env.TWILIO_PHONE,
          to: value.trim(),
        });
        console.log(`[OTP] SMS sent to ${value}`);
      } else {
        console.log(`[OTP] Twilio not configured. Phone ${value} code: ${code}`);
      }
    }

    return res.json({ success: true, message: field === "email" ? "Verification code sent to your email." : "Verification code sent to your phone via SMS." });
  } catch (err) {
    console.error("sendOtp error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to send OTP" });
  }
};

/* POST /api/verify/confirm-otp
   body: { field: "email"|"phone", code: "123456" }
*/
exports.confirmOtp = async (req, res) => {
  try {
    const { field, code } = req.body || {};
    if (!field || !code) return res.status(400).json({ success: false, message: "field and code required" });

    const key = makeKey(req.user.id, field);
    const entry = otpStore.get(key);

    if (!entry) return res.status(400).json({ success: false, message: "No pending verification. Please request a new code." });
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(key);
      return res.status(400).json({ success: false, message: "Code expired. Please request a new one." });
    }
    if (String(entry.code) !== String(code).trim()) {
      return res.status(400).json({ success: false, message: "Incorrect code. Please try again." });
    }

    // Confirmed — persist to user
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (field === "email") {
      user.email = entry.value;
      user.email_verified = true;
    } else {
      user.phone = entry.value;
      user.phone_verified = true;
    }

    await user.save();
    otpStore.delete(key);

    return res.json({ success: true, message: `${field === "email" ? "Email" : "Phone"} verified successfully!`, user: buildUserIdentity(user) });
  } catch (err) {
    console.error("confirmOtp error:", err);
    return res.status(500).json({ success: false, message: err.message || "Verification failed" });
  }
};
