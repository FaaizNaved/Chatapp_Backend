const mongoose = require("mongoose");

module.exports = function dbReady(req, res, next) {
  // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (mongoose.connection.readyState === 1) return next();

  res.status(503).json({ ok: false, error: "Service unavailable: database not connected" });
};
