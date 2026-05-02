const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  actor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  type: {
    type: String,
    enum: [
      "direct_message",
      "group_message",
      "discussion_message",
      "discussion_scheduled",
      "discussion_reminder",
      "discussion_ended"
    ],
    default: "direct_message"
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  body: {
    type: String,
    required: true,
    trim: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  is_read: {
    type: Boolean,
    default: false
  },
  delivered_at: {
    type: Date,
    default: null
  }
}, { timestamps: true });

notificationSchema.index({ recipient_id: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
