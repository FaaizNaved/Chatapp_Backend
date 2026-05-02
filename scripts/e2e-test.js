const path = require("path");
const { spawn } = require("child_process");
const assert = require("assert");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const User = require("../models/user.js");
const Message = require("../models/message.js");
const Notification = require("../models/notification.js");
const UserSession = require("../models/userSession.js");
const Verification = require("../models/verification.js");
const Conversation = require("../models/conversation.js");
const { signVerifiedContact, hashOtpCode } = require("../utils/auth.js");
const { io } = require("../../frontend/node_modules/socket.io-client/build/cjs/index.js");
const { processDiscussionNotificationQueue } = require("../services/notificationService.js");

const PORT = process.env.E2E_PORT || 4010;
const API_BASE = `http://127.0.0.1:${PORT}`;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/chatapp";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (response.ok) return;
    } catch (_err) {
      // keep polling
    }

    await sleep(500);
  }

  throw new Error("Server did not become healthy in time");
}

function buildTinyPngDataUrl() {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotL3sAAAAASUVORK5CYII=";
}

function buildTextFileDataUrl() {
  return "data:text/plain;base64,SGVsbG8gY2hhdGFwcCBhdHRhY2htZW50";
}

function buildWaveDataUrl() {
  const sampleRate = 8000;
  const durationSeconds = 1;
  const sampleCount = sampleRate * durationSeconds;
  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const amplitude = Math.round(Math.sin(2 * Math.PI * 440 * t) * 12000);
    buffer.writeInt16LE(amplitude, 44 + (i * 2));
  }

  return `data:audio/wav;base64,${buffer.toString("base64")}`;
}

async function apiRequest(pathname, options = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed for ${pathname}`);
  }

  return data;
}

async function login(identifier, password) {
  const response = await apiRequest("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password })
  });

  return response.token;
}

async function registerVerifiedUser({ username, password, email }) {
  const code = "123456";
  await Verification.create({
    purpose: "signup",
    channel: "email",
    target: email,
    code_hash: hashOtpCode(code),
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    verified_at: new Date()
  });

  const verificationToken = signVerifiedContact({
    channel: "email",
    value: email,
    type: "verified-contact"
  });

  return apiRequest("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      confirmPassword: password,
      email,
      verificationToken
    })
  });
}

async function uploadAttachment(token, payload) {
  const response = await apiRequest("/api/chat/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  return response.attachment;
}

function buildRemoteVideoUrl() {
  return "https://download.samplelib.com/mp4/sample-5s.mp4";
}

async function main() {
  const serverProcess = spawn("node", ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverOutput = "";
  serverProcess.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  serverProcess.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  let senderSocket;
  let recipientSocket;

  try {
    await waitForServer();

    await mongoose.connect(MONGO_URI);

    await Promise.all([
      User.deleteMany({ username: { $in: ["notify_sender", "notify_receiver", "notify_signup"] } }),
      Message.deleteMany({}),
      Notification.deleteMany({}),
      UserSession.deleteMany({}),
      Verification.deleteMany({}),
      Conversation.deleteMany({})
    ]);

    const passwordHash = await bcrypt.hash("Secret123!", 10);
    const sender = await User.create({
      username: "notify_sender",
      password: passwordHash,
      email: "sender@example.com",
      phone: "+15550000001",
      email_verified: true,
      phone_verified: true
    });
    const recipient = await User.create({
      username: "notify_receiver",
      password: passwordHash,
      email: "receiver@example.com",
      phone: "+15550000002",
      email_verified: true,
      phone_verified: true
    });

    await registerVerifiedUser({
      username: "notify_signup",
      password: "Secret123!",
      email: "signup@example.com"
    });
    const signupUser = await User.findOne({ username: "notify_signup" }).lean();
    assert(signupUser, "Verified signup user should be created");
    assert.strictEqual(signupUser.phone, undefined, "Email-only signup should not persist null phone values");

    const senderUsernameToken = await login("notify_sender", "Secret123!");
    const senderEmailToken = await login("sender@example.com", "Secret123!");
    const senderPhoneToken = await login("+15550000001", "Secret123!");
    const recipientToken = await login("+15550000002", "Secret123!");
    const signupToken = await login("signup@example.com", "Secret123!");

    assert(senderUsernameToken && senderEmailToken && senderPhoneToken && recipientToken && signupToken, "All login modes must succeed");

    const profileImage = await uploadAttachment(senderUsernameToken, {
      fileName: "avatar.png",
      mimeType: "image/png",
      dataUrl: buildTinyPngDataUrl(),
      mediaCategory: "profile"
    });

    const profileUpdate = await apiRequest("/api/users/me/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderUsernameToken}`
      },
      body: JSON.stringify({
        username: "notify_sender",
        avatar_symbol: "NS",
        avatar_type: "image",
        avatar_color: "#2563eb",
        avatar_url: profileImage.url
      })
    });
    assert.strictEqual(profileUpdate.user.avatar_url, profileImage.url);
    assert.strictEqual(profileUpdate.user.avatar_type, "image");

    const settingsUpdate = await apiRequest("/api/users/me/settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderUsernameToken}`
      },
      body: JSON.stringify({
        theme: "light",
        liquid_glass: true,
        font_size: "lg",
        notifications_enabled: true,
        notification_preferences: {
          direct_messages: true,
          group_messages: false,
          discussion_updates: true
        }
      })
    });
    assert.strictEqual(settingsUpdate.user.settings.theme, "light");
    assert.strictEqual(settingsUpdate.user.settings.liquid_glass, true);
    assert.strictEqual(settingsUpdate.user.settings.notification_preferences.group_messages, false);

    const pinUpdate = await apiRequest("/api/users/me/pins/toggle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderUsernameToken}`
      },
      body: JSON.stringify({ itemKey: `user:${recipient._id}` })
    });
    assert(pinUpdate.pinned_items.includes(`user:${recipient._id}`), "Pinned chat should be stored");

    const groupResponse = await apiRequest("/api/conversations/group", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderUsernameToken}`
      },
      body: JSON.stringify({
        name: "QA Group",
        icon: "Q",
        memberIds: [String(recipient._id), String(signupUser._id)]
      })
    });
    assert.strictEqual(groupResponse.conversation.type, "group");

    const scheduledStart = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const discussionResponse = await apiRequest("/api/conversations/discussion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderUsernameToken}`
      },
      body: JSON.stringify({
        name: "Short Sync",
        icon: "D",
        memberIds: [String(recipient._id)],
        durationValue: 30,
        durationUnit: "minutes",
        scheduleMode: "scheduled",
        scheduled_for: scheduledStart
      })
    });
    assert.strictEqual(discussionResponse.conversation.type, "discussion");
    assert.strictEqual(discussionResponse.conversation.status, "scheduled");

    const discussionNotifications = await apiRequest("/api/notifications?limit=20", {
      headers: { Authorization: `Bearer ${recipientToken}` }
    });
    assert(
      discussionNotifications.notifications.some((notification) => (
        notification.type === "discussion_scheduled" &&
        notification.body.includes('scheduled "Short Sync"')
      )),
      "Scheduled discussion notification missing"
    );

    const discussionPin = await apiRequest("/api/users/me/pins/toggle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderUsernameToken}`
      },
      body: JSON.stringify({ itemKey: `conversation:${discussionResponse.conversation.id}` })
    });
    assert(
      discussionPin.pinned_items.includes(`conversation:${discussionResponse.conversation.id}`),
      "Pinned discussion should be stored"
    );

    const recipientEvents = {
      messages: [],
      disconnected: false
    };

    recipientSocket = io(API_BASE, {
      auth: { token: recipientToken },
      transports: ["websocket"],
      forceNew: true
    });

    senderSocket = io(API_BASE, {
      auth: { token: senderUsernameToken },
      transports: ["websocket"],
      forceNew: true
    });

    await Promise.all([
      new Promise((resolve, reject) => {
        recipientSocket.on("connect", resolve);
        recipientSocket.on("connect_error", reject);
      }),
      new Promise((resolve, reject) => {
        senderSocket.on("connect", resolve);
        senderSocket.on("connect_error", reject);
      })
    ]);

    recipientSocket.on("newMessage", (message) => {
      recipientEvents.messages.push(message);
    });
    recipientSocket.on("disconnect", () => {
      recipientEvents.disconnected = true;
    });

    const groupSocketMessage = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for group message")), 8000);
      recipientSocket.once("newMessage", (message) => {
        if (String(message.conversation_id) === String(groupResponse.conversation.id)) {
          clearTimeout(timeout);
          resolve(message);
        }
      });
      senderSocket.emit("sendMessage", {
        conversation_id: String(groupResponse.conversation.id),
        text: "hello group room"
      });
    });
    assert.strictEqual(groupSocketMessage.text, "hello group room");

    const recipientDisableGroups = await apiRequest("/api/users/me/settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${recipientToken}`
      },
      body: JSON.stringify({
        notification_preferences: {
          direct_messages: true,
          group_messages: false,
          discussion_updates: true
        }
      })
    });
    assert.strictEqual(recipientDisableGroups.user.settings.notification_preferences.group_messages, false);

    await apiRequest(`/api/conversations/${groupResponse.conversation.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderUsernameToken}`
      },
      body: JSON.stringify({ text: "group notifications off" })
    });

    const notificationsAfterGroup = await apiRequest("/api/notifications?limit=20", {
      headers: { Authorization: `Bearer ${recipientToken}` }
    });
    assert(
      !notificationsAfterGroup.notifications.some((notification) => notification.body.includes("group notifications off")),
      "Group notification should be suppressed by user settings"
    );

    await Conversation.updateOne(
      { _id: discussionResponse.conversation.id },
      {
        $set: {
          starts_at: new Date(Date.now() - 10 * 60 * 1000),
          ends_at: new Date(Date.now() + 4 * 60 * 1000),
          reminder_notification_sent_at: null
        }
      }
    );
    await processDiscussionNotificationQueue();

    const reminderNotifications = await apiRequest("/api/notifications?limit=20", {
      headers: { Authorization: `Bearer ${recipientToken}` }
    });
    assert(
      reminderNotifications.notifications.some((notification) => notification.type === "discussion_reminder"),
      "Discussion reminder notification missing"
    );

    const discussionMessage = await apiRequest(`/api/conversations/${discussionResponse.conversation.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderUsernameToken}`
      },
      body: JSON.stringify({ text: "live discussion message" })
    });
    assert.strictEqual(discussionMessage.message.conversation_id.toString(), discussionResponse.conversation.id);

    await Conversation.updateOne(
      { _id: discussionResponse.conversation.id },
      { $set: { ends_at: new Date(Date.now() - 1000), is_active: true, ended_notification_sent_at: null } }
    );
    await processDiscussionNotificationQueue();

    let discussionRejected = false;
    try {
      await apiRequest(`/api/conversations/${discussionResponse.conversation.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${senderUsernameToken}`
        },
        body: JSON.stringify({ text: "too late" })
      });
    } catch (err) {
      discussionRejected = err.message.includes("ended");
    }
    assert(discussionRejected, "Expired discussions should reject new messages");

    const endedNotifications = await apiRequest("/api/notifications?limit=20", {
      headers: { Authorization: `Bearer ${recipientToken}` }
    });
    assert(
      endedNotifications.notifications.some((notification) => notification.type === "discussion_ended"),
      "Discussion ended notification missing"
    );

    const socketTextMessage = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for socket text message")), 8000);
      recipientSocket.once("newMessage", (message) => {
        clearTimeout(timeout);
        resolve(message);
      });
      senderSocket.emit("sendMessage", {
        receiver_id: String(recipient._id),
        text: "hello over socket"
      });
    });

    assert.strictEqual(socketTextMessage.text, "hello over socket");

    const storedEncrypted = await Message.findOne({ receiver_id: recipient._id }).sort({ createdAt: -1 }).lean();
    assert(storedEncrypted.text_encrypted?.content, "Encrypted text should be stored");
    assert.strictEqual(storedEncrypted.text, "", "Plain text column should be empty for new messages");

    const fetchedMessages = await apiRequest(
      `/api/chat/messages?user1=${sender._id}&user2=${recipient._id}`,
      { headers: { Authorization: `Bearer ${senderUsernameToken}` } }
    );
    assert(fetchedMessages.messages.some((message) => message.text === "hello over socket"), "Decrypted text should be returned through API");

    const imageAttachment = await uploadAttachment(senderUsernameToken, {
      fileName: "tiny.png",
      mimeType: "image/png",
      dataUrl: buildTinyPngDataUrl(),
      mediaCategory: "file"
    });
    assert.strictEqual(imageAttachment.kind, "image");

    const voiceAttachment = await uploadAttachment(senderUsernameToken, {
      fileName: "voice.wav",
      mimeType: "audio/wav",
      dataUrl: buildWaveDataUrl(),
      mediaCategory: "voice"
    });
    assert.strictEqual(voiceAttachment.kind, "audio");

    const fileAttachment = await uploadAttachment(senderUsernameToken, {
      fileName: "note.txt",
      mimeType: "text/plain",
      dataUrl: buildTextFileDataUrl(),
      mediaCategory: "file"
    });
    assert.strictEqual(fileAttachment.kind, "file");

    await apiRequest("/api/chat/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderUsernameToken}`
      },
      body: JSON.stringify({
        receiver_id: String(recipient._id),
        text: "",
        attachments: [imageAttachment]
      })
    });

    await apiRequest("/api/chat/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderUsernameToken}`
      },
      body: JSON.stringify({
        receiver_id: String(recipient._id),
        text: "",
        attachments: [voiceAttachment]
      })
    });

    await apiRequest("/api/chat/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderUsernameToken}`
      },
      body: JSON.stringify({
        receiver_id: String(recipient._id),
        text: "",
        attachments: [fileAttachment]
      })
    });

    const videoAttachment = await uploadAttachment(senderUsernameToken, {
      fileName: "placeholder-video.mp4",
      mimeType: "video/mp4",
      remoteUrl: buildRemoteVideoUrl(),
      mediaCategory: "file"
    });
    assert.strictEqual(videoAttachment.kind, "video");

    await apiRequest("/api/chat/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderUsernameToken}`
      },
      body: JSON.stringify({
        receiver_id: String(recipient._id),
        text: "",
        attachments: [videoAttachment]
      })
    });

    await sleep(1500);

    const listedNotifications = await apiRequest("/api/notifications?limit=20", {
      headers: { Authorization: `Bearer ${recipientToken}` }
    });

    const bodies = listedNotifications.notifications.map((notification) => notification.body);
    assert(bodies.some((body) => body.includes('hello over socket')), "Text notification missing");
    assert(bodies.some((body) => body.includes("sent a photo")), "Photo notification missing");
    assert(bodies.some((body) => body.includes("sent a voice note")), "Voice note notification missing");
    assert(bodies.some((body) => body.includes("sent an attachment")), "Attachment notification missing");
    assert(bodies.some((body) => body.includes("sent a video")), "Video notification missing");

    const unreadNotification = listedNotifications.notifications[0];
    const markedNotification = await apiRequest(`/api/notifications/${unreadNotification.id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${recipientToken}` }
    });
    assert.strictEqual(markedNotification.notification.is_read, true);

    await apiRequest("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${recipientToken}` }
    });

    await sleep(1000);
    assert(recipientEvents.disconnected, "Recipient socket should disconnect on logout");

    let logoutTokenRejected = false;
    try {
      await apiRequest("/api/notifications", {
        headers: { Authorization: `Bearer ${recipientToken}` }
      });
    } catch (err) {
      logoutTokenRejected = err.message.includes("Invalid or expired token");
    }
    assert(logoutTokenRejected, "Logged out token should be rejected");

    console.log("E2E PASS");
  } finally {
    if (senderSocket) senderSocket.disconnect();
    if (recipientSocket) recipientSocket.disconnect();
    await mongoose.disconnect().catch(() => {});

    if (!serverProcess.killed) {
      serverProcess.kill();
    }

    await sleep(500);
    if (serverProcess.exitCode === null) {
      serverProcess.kill("SIGKILL");
    }

    if (serverOutput) {
      console.log(serverOutput.trim());
    }
  }
}

main().catch((err) => {
  console.error("E2E FAIL", err);
  process.exit(1);
});
