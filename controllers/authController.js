/**
 * authController.js
 * Username + password auth with mandatory email OTP verification on signup.
 * Phone verification is required only if phone is provided during signup.
 */
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const User = require("../models/user.js");
const { createUserSession, revokeSession } = require("../services/sessionService.js");
const { buildUserIdentity } = require("../utils/auth.js");

function inferIdentifierType(identifier) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) return "email";
  if (/^\+?[\d\s\-().]{7,15}$/.test(identifier)) return "phone";
  return "username";
}

/* ── OTP helpers ──────────────────────────────────────────── */
const pendingRegistrations = new Map(); // key -> { formData, otpEmail, otpPhone, emailCode, phoneCode, emailVerified, phoneVerified, expiresAt }
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
  return nodemailer.createTransport({
    host: "smtp.ethereal.email", port: 587, secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
}

async function sendEmailOtp(email, code) {
  const transporter = await getTransporter();
  await transporter.sendMail({
    from: `"ChatSphere" <${process.env.SMTP_USER || "noreply@chatsphere.app"}>`,
    to: email,
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
}

async function sendPhoneOtp(phone, code) {
  if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE) {
    const twilio = require("twilio");
    const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: `Your ChatSphere verification code is: ${code}. It expires in 10 minutes.`,
      from: process.env.TWILIO_PHONE,
      to: phone,
    });
  } else {
    console.log(`[OTP] Twilio not configured. Phone ${phone} code: ${code}`);
  }
}

/* ─── REGISTER: Step 1 — Send OTP ─────────────────────────── */
exports.registerSendOtp = async (req, res) => {
  try {
    const { username, password, confirmPassword, email, phone, field } = req.body;

    // Validate basics
    if (!username || !password || !email) {
      return res.status(400).json({ success: false, message: "Username, password, and email are required" });
    }
    if (username.trim().length < 3) {
      return res.status(400).json({ success: false, message: "Username must be at least 3 characters" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }
    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email.trim())) {
      return res.status(400).json({ success: false, message: "Invalid email address" });
    }

    // Check uniqueness
    const existingUser = await User.findOne({ username: username.trim() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "Username already taken" });
    }
    const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingEmail) {
      return res.status(409).json({ success: false, message: "Email already in use" });
    }

    // Generate a registration key
    const regKey = `${username.trim().toLowerCase()}:${email.trim().toLowerCase()}`;
    let pending = pendingRegistrations.get(regKey);

    // Determine which field to send OTP for
    const targetField = field || "email";

    if (!pending) {
      // First time — create pending entry
      const emailCode = generateOtp();
      const phoneCode = phone && phone.trim() ? generateOtp() : null;

      pending = {
        formData: { username: username.trim(), password, email: email.trim().toLowerCase(), phone: phone ? phone.trim() : "" },
        emailCode,
        phoneCode,
        emailVerified: false,
        phoneVerified: !phone || !phone.trim(), // If no phone, mark as verified
        expiresAt: Date.now() + 10 * 60 * 1000,
      };
      pendingRegistrations.set(regKey, pending);
    }

    // Send OTP for the requested field
    if (targetField === "email") {
      // Regenerate code if re-requested
      pending.emailCode = generateOtp();
      pending.expiresAt = Date.now() + 10 * 60 * 1000;
      pendingRegistrations.set(regKey, pending);

      await sendEmailOtp(pending.formData.email, pending.emailCode);
      return res.json({ success: true, message: "Verification code sent to your email.", regKey });
    } else if (targetField === "phone") {
      if (!pending.formData.phone) {
        return res.status(400).json({ success: false, message: "No phone number provided" });
      }
      pending.phoneCode = generateOtp();
      pending.expiresAt = Date.now() + 10 * 60 * 1000;
      pendingRegistrations.set(regKey, pending);

      await sendPhoneOtp(pending.formData.phone, pending.phoneCode);
      return res.json({ success: true, message: "Verification code sent to your phone via SMS.", regKey });
    }

    return res.status(400).json({ success: false, message: "Invalid field. Use 'email' or 'phone'." });
  } catch (err) {
    console.error("registerSendOtp error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to send OTP" });
  }
};

/* ─── REGISTER: Step 2 — Verify OTP ──────────────────────── */
exports.registerVerifyOtp = async (req, res) => {
  try {
    const { username, email, code, field } = req.body;
    if (!username || !email || !code || !field) {
      return res.status(400).json({ success: false, message: "username, email, code, and field are required" });
    }

    const regKey = `${username.trim().toLowerCase()}:${email.trim().toLowerCase()}`;
    const pending = pendingRegistrations.get(regKey);

    if (!pending) {
      return res.status(400).json({ success: false, message: "No pending registration. Please start over." });
    }
    if (Date.now() > pending.expiresAt) {
      pendingRegistrations.delete(regKey);
      return res.status(400).json({ success: false, message: "Code expired. Please request a new one." });
    }

    if (field === "email") {
      if (String(pending.emailCode) !== String(code).trim()) {
        return res.status(400).json({ success: false, message: "Incorrect email code." });
      }
      pending.emailVerified = true;
    } else if (field === "phone") {
      if (String(pending.phoneCode) !== String(code).trim()) {
        return res.status(400).json({ success: false, message: "Incorrect phone code." });
      }
      pending.phoneVerified = true;
    } else {
      return res.status(400).json({ success: false, message: "Invalid field." });
    }

    pendingRegistrations.set(regKey, pending);

    // Check if all verifications are done
    if (pending.emailVerified && pending.phoneVerified) {
      // Create the account
      const hashed = await bcrypt.hash(pending.formData.password, 12);
      const initials = pending.formData.username.slice(0, 2).toUpperCase();

      const userPayload = {
        username: pending.formData.username,
        password: hashed,
        avatar_symbol: initials,
        avatar_type: "character",
        email: pending.formData.email,
        email_verified: true,
      };

      if (pending.formData.phone) {
        userPayload.phone = pending.formData.phone;
        userPayload.phone_verified = true;
      }

      const user = await User.create(userPayload);
      const { token } = await createUserSession(user, { userAgent: req.headers["user-agent"] });

      pendingRegistrations.delete(regKey);

      return res.status(201).json({
        success: true,
        accountCreated: true,
        message: "Account created successfully!",
        token,
        user: buildUserIdentity(user),
      });
    }

    // Not all verified yet
    return res.json({
      success: true,
      accountCreated: false,
      emailVerified: pending.emailVerified,
      phoneVerified: pending.phoneVerified,
      message: `${field === "email" ? "Email" : "Phone"} verified! ${!pending.emailVerified ? "Now verify your email." : !pending.phoneVerified ? "Now verify your phone." : ""}`,
    });
  } catch (err) {
    console.error("registerVerifyOtp error:", err);
    return res.status(500).json({ success: false, message: err.message || "Verification failed" });
  }
};

/* ─── REGISTER (legacy, kept for backward compat) ──────── */
exports.register = async (req, res) => {
  try {
    const { username, password, confirmPassword, email, phone } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required" });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }
    if (username.trim().length < 3) {
      return res.status(400).json({ success: false, message: "Username must be at least 3 characters" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }
    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }

    const existing = await User.findOne({ username: username.trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: "Username already taken" });
    }

    const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingEmail) {
      return res.status(409).json({ success: false, message: "Email already in use" });
    }

    const hashed = await bcrypt.hash(password, 12);
    const initials = username.trim().slice(0, 2).toUpperCase();

    const userPayload = {
      username: username.trim(),
      password: hashed,
      avatar_symbol: initials,
      avatar_type: "character",
      email: email.trim().toLowerCase(),
    };

    if (phone && phone.trim()) userPayload.phone = phone.trim();

    const user = await User.create(userPayload);
    const { token } = await createUserSession(user, { userAgent: req.headers["user-agent"] });

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user: buildUserIdentity(user),
    });
  } catch (err) {
    console.error("register error:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

/* ─── LOGIN ─────────────────────────────────────────────────── */
exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required" });
    }

    const type = inferIdentifierType(String(identifier).trim());
    const normalized = type === "email"
      ? identifier.trim().toLowerCase()
      : identifier.trim();

    const query =
      type === "email"   ? { email: normalized } :
      type === "phone"   ? { phone: normalized } :
      { username: normalized };

    const user = await User.findOne(query).select("+password");

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Ensure avatar_symbol is always set
    if (!user.avatar_symbol) {
      user.avatar_symbol = user.username.slice(0, 2).toUpperCase();
      await user.save();
    }

    const { token } = await createUserSession(user, { userAgent: req.headers["user-agent"] });

    return res.json({
      success: true,
      token,
      user: buildUserIdentity(user),
    });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

/* ─── LOGOUT ─────────────────────────────────────────────────── */
exports.logout = async (req, res) => {
  try {
    await revokeSession(req.user.session_id);
    const io = req.app.get("io");
    io?.in(`session:${req.user.session_id}`).disconnectSockets(true);
    return res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("logout error:", err);
    return res.status(500).json({ success: false, message: "Failed to logout" });
  }
};

/* ─── STUBS (kept so routes don't break) ────────────────────── */
exports.sendVerificationCode = (req, res) =>
  res.json({ success: true, message: "Verification not required in this version." });

exports.verifyCode = (req, res) =>
  res.json({ success: true, message: "Verification not required.", verificationToken: "stub" });

exports.requestPasswordReset = (req, res) =>
  res.json({ success: true, message: "Password reset via admin. Contact support." });

exports.resetPassword = (req, res) =>
  res.json({ success: true, message: "Password reset via admin. Contact support." });

exports.testMailService = (req, res) =>
  res.json({ success: true, message: "Mail service not configured." });
