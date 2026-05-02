const mongoose = require("mongoose");

const passwordResetTokenSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    channel: {
      type: String,
      enum: ["email", "phone"],
      required: true
    },
    target: {
      type: String,
      required: true,
      trim: true
    },
    token_hash: {
      type: String,
      required: true
    },
    expires_at: {
      type: Date,
      required: true,
      index: { expires: 0 }
    },
    used_at: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

passwordResetTokenSchema.index({ user_id: 1, used_at: 1 });
passwordResetTokenSchema.index({ channel: 1, target: 1, used_at: 1 });

module.exports = mongoose.model("PasswordResetToken", passwordResetTokenSchema);
