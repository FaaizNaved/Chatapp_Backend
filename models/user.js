// models/user.js — Mongoose schema
const mongoose = require("mongoose");

const AVATAR_COLORS = [
  "#7c3aed","#2563eb","#059669","#dc2626",
  "#d97706","#db2777","#0891b2","#65a30d"
];

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  password: {
    type: String,
    required: true
  },
  avatar_color: {
    type: String,
    default: () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
