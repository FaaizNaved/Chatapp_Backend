const crypto = require("crypto");

const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024;

function requireCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const folderName = process.env.CLOUDINARY_FOLDER_NAME || "chatApp";

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary credentials are not configured in backend/.env");
  }

  return { cloudName, apiKey, apiSecret, folderName };
}

function resolveAttachmentKind(mimeType = "", mediaCategory = "") {
  const category = String(mediaCategory || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();

  if (category === "voice" || mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

function resolveCloudinaryResourceType(kind) {
  if (kind === "image") return "image";
  if (kind === "file") return "raw";
  return "video";
}

function extractBase64Size(dataUrl) {
  const payload = String(dataUrl || "").split(",")[1] || "";
  return Buffer.byteLength(payload, "base64");
}

function resolveUploadSource(dataUrl, remoteUrl) {
  if (dataUrl && String(dataUrl).startsWith("data:")) {
    if (extractBase64Size(dataUrl) > MAX_UPLOAD_SIZE_BYTES) {
      throw new Error("Upload exceeds the 15MB limit");
    }

    return dataUrl;
  }

  if (remoteUrl) {
    const parsedUrl = new URL(String(remoteUrl));
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Remote upload URL must use http or https");
    }

    return parsedUrl.toString();
  }

  throw new Error("Upload must include a valid data URL or remote URL");
}

async function uploadToCloudinary({ fileName, mimeType, dataUrl, remoteUrl, mediaCategory }) {
  const kind = resolveAttachmentKind(mimeType, mediaCategory);

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
    if (!dataUrl) throw new Error("No dataUrl provided for local fallback");
    if (extractBase64Size(dataUrl) > MAX_UPLOAD_SIZE_BYTES) {
      throw new Error("Upload exceeds the 15MB limit");
    }
    return {
      kind,
      url: dataUrl,
      public_id: `local_${Date.now()}`,
      resource_type: kind,
      format: null,
      bytes: extractBase64Size(dataUrl),
      duration: null,
      original_name: fileName || null,
      mime_type: mimeType || null,
      thumbnail_url: kind === "image" ? dataUrl : null
    };
  }

  const { cloudName, apiKey, apiSecret, folderName } = requireCloudinaryConfig();
  const resourceType = resolveCloudinaryResourceType(kind);
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${folderName}/${kind}`;
  const uploadSource = resolveUploadSource(dataUrl, remoteUrl);
  const signatureBase = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(signatureBase).digest("hex");

  const body = new FormData();
  body.append("file", uploadSource);
  body.append("api_key", apiKey);
  body.append("timestamp", String(timestamp));
  body.append("folder", folder);
  body.append("signature", signature);

  // For raw files (docx, pdf etc), Cloudinary needs the file extension in the public_id
  if (resourceType === "raw" && fileName) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const rawPublicId = `${folder}/${Date.now()}_${safeName}`;
    const sigBase = `folder=${folder}&public_id=${rawPublicId}&timestamp=${timestamp}${apiSecret}`;
    const rawSig = crypto.createHash("sha1").update(sigBase).digest("hex");
    body.set("signature", rawSig);
    body.append("public_id", rawPublicId);
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    {
      method: "POST",
      body
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Cloudinary upload failed");
  }

  return {
    kind,
    url: payload.secure_url,
    public_id: payload.public_id,
    resource_type: payload.resource_type,
    format: payload.format || null,
    bytes: payload.bytes || null,
    duration: payload.duration || null,
    original_name: fileName || payload.original_filename || null,
    mime_type: mimeType || null,
    thumbnail_url: payload.secure_url
  };
}

module.exports = {
  uploadToCloudinary
};
