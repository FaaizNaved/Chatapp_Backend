const mongoose = require("mongoose");

const userSessionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  session_id: {
    type: String,
    required: true,
    unique: true
  },
  expires_at: {
    type: Date,
    required: true
  },
  logged_out_at: {
    type: Date,
    default: null
  },
  last_seen_at: {
    type: Date,
    default: Date.now
  },
  user_agent: {
    type: String,
    default: null
  }
}, { timestamps: true });

userSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("UserSession", userSessionSchema);
