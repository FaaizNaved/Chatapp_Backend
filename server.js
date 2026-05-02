const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const Conversation = require("./models/conversation.js");

dotenv.config();

const app = require("./index.js");
const connectDB = require("./config/db.js");
const { verifySocketJWT } = require("./middlewares/auth.js");
const {
  createChatMessage,
  markConversationAsRead
} = require("./services/chatMessageService.js");
const { processDiscussionNotificationQueue } = require("./services/notificationService.js");

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

// Build allowed origins list — supports CLIENT_URL env var + common dev origins
const allowedOrigins = (() => {
  const base = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000"
  ];
  if (process.env.CLIENT_URL) base.push(process.env.CLIENT_URL);
  return base;
})();

const io = new Server(server, {
  cors: {
    // Allow any origin so the embeddable widget works on any host website
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin) return callback(null, true);
      // In production honour CLIENT_URL; in dev allow all
      if (process.env.NODE_ENV === "production") {
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`CORS: origin ${origin} not allowed`));
      }
      return callback(null, true);
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.set("io", io);

const mongoose = require("mongoose");

const onlineUsers = new Map();
let discussionNotificationTimer = null;

io.use(async (socket, next) => {
  if (mongoose.connection.readyState !== 1) {
    return next(new Error("Service unavailable: database not connected"));
  }
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error("Authentication error: token required"));

  const { ok, decoded, session } = await verifySocketJWT(token);
  if (!ok) return next(new Error("Authentication error: invalid token"));

  socket.user = decoded;
  socket.session = session;
  next();
});

function broadcastOnlineUsers() {
  io.emit("onlineUsers", [...onlineUsers.keys()]);
}

io.on("connection", (socket) => {
  const userId = String(socket.user.id);
  const username = socket.user.username;
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  const sessionRoom = `session:${socket.user.session_id}`;

  async function ensureAuthenticatedSocket() {
    const result = await verifySocketJWT(token);
    if (!result.ok || String(result.decoded.id) !== userId) {
      throw new Error("Authentication error: invalid token");
    }
    return result.decoded;
  }

  console.log(`Socket connected: ${socket.id} | User: ${username} (${userId})`);

  socket.join(userId);
  socket.join(sessionRoom);

  // Auto-join all existing conversation rooms on connect
  Conversation.find({ members: userId }, "_id")
    .then((conversations) => {
      conversations.forEach((conversation) => {
        socket.join(`conversation:${conversation._id}`);
      });
    })
    .catch((err) => {
      console.error("conversation join error:", err);
    });

  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socket.id);
  broadcastOnlineUsers();

  // ── joinConversation ─────────────────────────────────────────────
  // Called after creating a new group/discussion so the creator immediately
  // joins the socket room and receives real-time messages without a refresh.
  socket.on("joinConversation", async ({ conversationId }) => {
    try {
      await ensureAuthenticatedSocket();
      if (!conversationId) return;

      // Verify user is actually a member of this conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        members: userId
      }, "_id");

      if (conversation) {
        const room = `conversation:${conversationId}`;
        socket.join(room);
        console.log(`User ${username} joined room: ${room}`);
      }
    } catch (err) {
      console.error("joinConversation error:", err);
    }
  });

  socket.on("typing", async ({ toUserId, isTyping }) => {
    try {
      await ensureAuthenticatedSocket();
      if (!toUserId) return;
      io.to(String(toUserId)).emit("typing", {
        fromUserId: userId,
        fromUsername: username,
        isTyping: !!isTyping
      });
    } catch (err) {
      console.error("typing error:", err);
    }
  });

  socket.on("sendMessage", async ({ receiver_id, conversation_id, text, attachments }) => {
    try {
      await ensureAuthenticatedSocket();

      const payload = await createChatMessage({
        senderId: userId,
        receiverId: receiver_id,
        conversationId: conversation_id,
        text,
        attachments
      });

      if (payload.conversation_id) {
        // Broadcast to all members in the conversation room
        io.to(`conversation:${payload.conversation_id}`).emit("newMessage", payload);
        // Also echo messageSent back to the sender so they get the confirmed message
        // (sender is already in the room, so this is already covered by newMessage above)
        // However for UI deduplication purposes, emit messageSent too
        socket.emit("messageSent", payload);
      } else {
        // Direct message
        io.to(String(receiver_id)).emit("newMessage", payload);
        io.to(userId).emit("messageSent", payload);
      }
    } catch (err) {
      console.error("socket sendMessage error:", err);
      socket.emit("messageError", { message: err.message || "Failed to send message" });
    }
  });

  socket.on("markRead", async ({ otherUserId }) => {
    try {
      await ensureAuthenticatedSocket();
      if (!otherUserId) return;

      await markConversationAsRead(otherUserId, userId);
      io.to(String(otherUserId)).emit("messagesRead", { by: userId });
    } catch (err) {
      console.error("markRead error:", err);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`Socket disconnected: ${socket.id} | User: ${username} | ${reason}`);
    const sockets = onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) onlineUsers.delete(userId);
    }
    broadcastOnlineUsers();
  });
});

async function start() {
  try {
    console.log("=== STARTUP DEBUG ===");
    console.log("MONGO_URI set:", !!process.env.MONGO_URI);
    console.log("JWT_SECRET set:", !!process.env.JWT_SECRET);
    console.log("PORT:", process.env.PORT);
    console.log("NODE_ENV:", process.env.NODE_ENV);
    console.log("=====================");

    await connectDB();
    console.log("DB connected successfully");

    await processDiscussionNotificationQueue();
    discussionNotificationTimer = setInterval(() => {
      processDiscussionNotificationQueue().catch((err) => {
        console.error("discussion notification queue error:", err);
      });
    }, 30 * 1000);

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.log("STARTUP FAILED:", err.message);
    console.log("Full error:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
    process.exit(1);
  }
}

server.on("close", () => {
  if (discussionNotificationTimer) {
    clearInterval(discussionNotificationTimer);
  }
});

start();
