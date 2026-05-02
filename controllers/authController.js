/**
 * authController.js
 * Simple username + password auth (no OTP/email/phone verification required).
 * Email and phone are optional extras.
 */
const bcrypt = require("bcrypt");
const User = require("../models/user.js");
const { createUserSession, revokeSession } = require("../services/sessionService.js");
const { buildUserIdentity } = require("../utils/auth.js");

function inferIdentifierType(identifier) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) return "email";
  if (/^\+?[\d\s\-().]{7,15}$/.test(identifier)) return "phone";
  return "username";
}

/* ─── REGISTER ─────────────────────────────────────────────── */
exports.register = async (req, res) => {
  try {
    const { username, password, confirmPassword, email, phone } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required" });
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

    if (email && email.trim()) {
      const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
      if (existingEmail) {
        return res.status(409).json({ success: false, message: "Email already in use" });
      }
    }

    const hashed = await bcrypt.hash(password, 12);
    const initials = username.trim().slice(0, 2).toUpperCase();

    const userPayload = {
      username: username.trim(),
      password: hashed,
      avatar_symbol: initials,
      avatar_type: "character",
    };

    if (email && email.trim()) userPayload.email = email.trim().toLowerCase();
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
