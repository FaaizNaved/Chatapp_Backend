// models/message.js — Mongoose schema
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  receiver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  attachments: {
    type: Array,
    default: null
  },
  is_read: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

messageSchema.index({ sender_id: 1, receiver_id: 1 });
messageSchema.index({ createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
