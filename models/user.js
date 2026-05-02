const mongoose = require("mongoose");

const AVATAR_COLORS = [
  "#7c3aed", "#2563eb", "#059669", "#dc2626",
  "#d97706", "#db2777", "#0891b2", "#65a30d"
];

const settingsSchema = new mongoose.Schema({
  theme: {
    type: String,
    enum: ["default", "light", "dark"],
    default: "default"
  },
  liquid_glass: {
    type: Boolean,
    default: false
  },
  font_size: {
    type: String,
    enum: ["sm", "md", "lg"],
    default: "md"
  },
  notifications_enabled: {
    type: Boolean,
    default: true
  },
  notification_preferences: {
    direct_messages: {
      type: Boolean,
      default: true
    },
    group_messages: {
      type: Boolean,
      default: true
    },
    discussion_updates: {
      type: Boolean,
      default: true
    }
  }
}, { _id: false });

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
    required: true,
    select: false
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
    default: undefined
  },
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    default: undefined
  },
  email_verified: {
    type: Boolean,
    default: false
  },
  phone_verified: {
    type: Boolean,
    default: false
  },
  avatar_color: {
    type: String,
    default: () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
  },
  avatar_url: {
    type: String,
    trim: true,
    default: ""
  },
  avatar_symbol: {
    type: String,
    trim: true,
    default: ""
  },
  avatar_type: {
    type: String,
    enum: ["character", "image"],
    default: "character"
  },
  settings: {
    type: settingsSchema,
    default: () => ({})
  },
  pinned_items: {
    type: [String],
    default: []
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
