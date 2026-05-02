const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const UserSession = require("../models/userSession.js");

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function buildSessionTokenPayload(user, sessionId) {
  return {
    id: user._id,
    username: user.username,
    avatar_color: user.avatar_color,
    session_id: sessionId
  };
}

async function createUserSession(user, metadata = {}) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await UserSession.create({
    user_id: user._id,
    session_id: sessionId,
    expires_at: expiresAt,
    user_agent: metadata.userAgent || null
  });

  const token = jwt.sign(
    buildSessionTokenPayload(user, sessionId),
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return { token, sessionId, expiresAt };
}

async function getActiveSession(sessionId) {
  if (!sessionId) return null;

  const session = await UserSession.findOne({ session_id: sessionId });
  if (!session) return null;
  if (session.logged_out_at) return null;
  if (session.expires_at.getTime() <= Date.now()) return null;

  return session;
}

async function verifySessionToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const session = await getActiveSession(decoded.session_id);
  if (!session || String(session.user_id) !== String(decoded.id)) {
    throw new Error("Session expired or logged out");
  }

  session.last_seen_at = new Date();
  await session.save();

  return { decoded, session };
}

async function revokeSession(sessionId) {
  if (!sessionId) return null;

  return UserSession.findOneAndUpdate(
    { session_id: sessionId, logged_out_at: null },
    { $set: { logged_out_at: new Date() } },
    { returnDocument: "after" }
  );
}

module.exports = {
  createUserSession,
  verifySessionToken,
  revokeSession
};
