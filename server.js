// server.js — HTTP + Socket.io entry point
const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
dotenv.config();

const app = require("./index.js");
const connectDB = require("./config/db.js");
const Message = require("./models/message.js");
const User = require("./models/user.js");
const { verifySocketJWT } = require("./middlewares/auth.js");

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Attach io to express app for use in controllers
app.set("io", io);

// Track online users: Map<userId(string), Set<socketId>>
const onlineUsers = new Map();

// ─── Socket Auth Middleware ────────────────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error("Authentication error: token required"));

  const { ok, decoded } = verifySocketJWT(token);
  if (!ok) return next(new Error("Authentication error: invalid token"));

  socket.user = decoded; // { id, username, avatar_color }
  next();
});

// ─── Helper: broadcast current online user IDs ─────────────────────────────────
function broadcastOnlineUsers() {
  const ids = [...onlineUsers.keys()];
  io.emit("onlineUsers", ids);
}

// ─── Connection Handler ────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  const userId = String(socket.user.id);
  const username = socket.user.username;

  console.log(`✅ Socket connected: ${socket.id} | User: ${username} (${userId})`);

  // Join personal room
  socket.join(userId);

  // Track socket in online map
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socket.id);
  broadcastOnlineUsers();

  // ── Typing Indicator ─────────────────────────────────────────────────────────
  socket.on("typing", ({ toUserId, isTyping }) => {
    if (!toUserId) return;
    io.to(String(toUserId)).emit("typing", {
      fromUserId: userId,
      fromUsername: username,
      isTyping: !!isTyping
    });
  });

  // ── Send Message via Socket ──────────────────────────────────────────────────
  socket.on("sendMessage", async ({ receiver_id, text, attachments }) => {
    try {
      if (!receiver_id || !text?.trim()) return;

      const message = await Message.create({
        sender_id: userId,
        receiver_id,
        text: text.trim(),
        attachments: attachments || null,
        is_read: false
      });

      const sender = await User.findById(userId, "username avatar_color");

      const payload = {
        id: message._id,
        sender_id: message.sender_id,
        receiver_id: message.receiver_id,
        text: message.text,
        attachments: message.attachments,
        is_read: message.is_read,
        created_at: message.createdAt,
        sender_username: sender?.username,
        sender_avatar_color: sender?.avatar_color
      };

      io.to(String(receiver_id)).emit("newMessage", payload);
      io.to(userId).emit("messageSent", payload);

    } catch (err) {
      console.error("socket sendMessage error:", err);
      socket.emit("messageError", { message: "Failed to send message" });
    }
  });

  // ── Mark Messages Read ───────────────────────────────────────────────────────
  socket.on("markRead", async ({ otherUserId }) => {
    try {
      if (!otherUserId) return;
      await Message.updateMany(
        { sender_id: otherUserId, receiver_id: userId, is_read: false },
        { $set: { is_read: true } }
      );
      io.to(String(otherUserId)).emit("messagesRead", { by: userId });
    } catch (err) {
      console.error("markRead error:", err);
    }
  });

  // ── Disconnect ───────────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    console.log(`❌ Socket disconnected: ${socket.id} | User: ${username} — ${reason}`);
    const sockets = onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) onlineUsers.delete(userId);
    }
    broadcastOnlineUsers();
  });
});

// ─── Start Server ──────────────────────────────────────────────────────────────
async function start() {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();
