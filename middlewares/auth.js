const { verifySessionToken } = require("../services/sessionService.js");

exports.verifyJWT = async (req, res, next) => {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  const token = auth.split(" ")[1];
  try {
    const { decoded, session } = await verifySessionToken(token);
    req.user = decoded;
    req.session = session;
    next();
  } catch (_err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

exports.verifySocketJWT = async (token) => {
  try {
    const { decoded, session } = await verifySessionToken(token);
    return { ok: true, decoded, session };
  } catch (err) {
    return { ok: false, error: err };
  }
};
