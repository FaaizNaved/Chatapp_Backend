const mongoose = require("mongoose");

const verificationSchema = new mongoose.Schema(
  {
    purpose: {
      type: String,
      enum: ["signup"],
      default: "signup",
      required: true
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
    code_hash: {
      type: String,
      required: true
    },
    expires_at: {
      type: Date,
      required: true,
      index: { expires: 0 }
    },
    verified_at: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

verificationSchema.index({ purpose: 1, channel: 1, target: 1 }, { unique: true });

module.exports = mongoose.model("Verification", verificationSchema);
