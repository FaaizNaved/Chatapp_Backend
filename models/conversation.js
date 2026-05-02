const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["group", "discussion"],
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 80
  },
  icon: {
    type: String,
    trim: true,
    default: "G"
  },
  starts_at: {
    type: Date,
    default: Date.now
  },
  members: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }],
    validate: {
      validator(value) {
        return Array.isArray(value) && value.length >= 2;
      },
      message: "Conversation must include at least two members"
    }
  },
  admins: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }],
    default: []
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  ends_at: {
    type: Date,
    default: null
  },
  is_active: {
    type: Boolean,
    default: true
  },
  scheduled_notification_sent_at: {
    type: Date,
    default: null
  },
  reminder_notification_sent_at: {
    type: Date,
    default: null
  },
  ended_notification_sent_at: {
    type: Date,
    default: null
  }
}, { timestamps: true });

conversationSchema.index({ members: 1, createdAt: -1 });
conversationSchema.index({ type: 1, is_active: 1 });

module.exports = mongoose.model("Conversation", conversationSchema);
