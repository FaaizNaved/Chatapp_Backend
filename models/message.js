const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ["image", "video", "audio", "file"],
    required: true
  },
  url: {
    type: String,
    required: true,
    trim: true
  },
  public_id: {
    type: String,
    required: true,
    trim: true
  },
  resource_type: {
    type: String,
    required: true,
    trim: true
  },
  format: {
    type: String,
    default: null
  },
  bytes: {
    type: Number,
    default: null
  },
  duration: {
    type: Number,
    default: null
  },
  original_name: {
    type: String,
    default: null
  },
  mime_type: {
    type: String,
    default: null
  },
  thumbnail_url: {
    type: String,
    default: null
  }
}, { _id: false });

const encryptedTextSchema = new mongoose.Schema({
  iv: { type: String, required: true },
  tag: { type: String, required: true },
  content: { type: String, required: true }
}, { _id: false });

const messageSchema = new mongoose.Schema({
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  receiver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  conversation_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    default: null
  },
  text: {
    type: String,
    default: ""
  },
  text_encrypted: {
    type: encryptedTextSchema,
    default: null
  },
  attachments: {
    type: [attachmentSchema],
    default: []
  },
  is_read: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

messageSchema.pre("validate", function validateTarget() {
  if (!this.receiver_id && !this.conversation_id) {
    throw new Error("Message must target a user or conversation");
  }
});

messageSchema.index({ sender_id: 1, receiver_id: 1 });
messageSchema.index({ conversation_id: 1, createdAt: 1 });
messageSchema.index({ createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
