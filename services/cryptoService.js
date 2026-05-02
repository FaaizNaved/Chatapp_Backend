const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey() {
  const secret = process.env.CHAT_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("CHAT_ENCRYPTION_KEY or JWT_SECRET must be configured");
  }

  return crypto.createHash("sha256").update(String(secret)).digest();
}

function encryptMessageText(value) {
  const plainText = String(value || "").trim();
  if (!plainText) {
    return null;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final()
  ]);

  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    content: encrypted.toString("base64")
  };
}

function decryptMessageText(payload) {
  if (!payload?.iv || !payload?.tag || !payload?.content) {
    return "";
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.content, "base64")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

module.exports = {
  encryptMessageText,
  decryptMessageText
};
