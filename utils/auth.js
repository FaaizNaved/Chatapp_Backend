const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizePhone(phone) {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return "";
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function isPhone(value) {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhone(value));
}

function generateOtpCode() {
  return `${crypto.randomInt(100000, 1000000)}`;
}

function hashOtpCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function signVerifiedContact(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "15m" });
}

function verifyVerifiedContactToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function twoLetterSymbol(username, stored) {
  const base = stored || username || "";
  const letters = base.replace(/[^A-Za-z0-9]/g, "");
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
  if (letters.length === 1) return (letters + letters).toUpperCase();
  return "??";
}

function buildUserIdentity(user) {
  const username = user.username || "";
  const avatarUrl = user.avatar_url || "";

  return {
    id: user._id,
    username,
    email: user.email || null,
    phone: user.phone || null,
    email_verified: !!user.email_verified,
    phone_verified: !!user.phone_verified,
    avatar_color: user.avatar_color,
    avatar_url: avatarUrl,
    avatar_symbol: twoLetterSymbol(username, user.avatar_symbol),
    avatar_type: user.avatar_type || (avatarUrl ? "image" : "character"),
    settings: {
      theme: user.settings?.theme || "default",
      liquid_glass: !!user.settings?.liquid_glass,
      font_size: user.settings?.font_size || "md",
      notifications_enabled: user.settings?.notifications_enabled !== false,
      notification_preferences: {
        direct_messages: user.settings?.notification_preferences?.direct_messages !== false,
        group_messages: user.settings?.notification_preferences?.group_messages !== false,
        discussion_updates: user.settings?.notification_preferences?.discussion_updates !== false
      }
    },
    pinned_items: Array.isArray(user.pinned_items) ? user.pinned_items : []
  };
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  isEmail,
  isPhone,
  generateOtpCode,
  hashOtpCode,
  generateSecureToken,
  hashToken,
  signVerifiedContact,
  verifyVerifiedContactToken,
  buildUserIdentity,
  twoLetterSymbol
};
