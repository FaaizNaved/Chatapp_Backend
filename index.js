const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const chatRoutes = require("./routes/chatRoutes.js");
const authRoutes = require("./routes/authRoutes.js");
const notificationRoutes = require("./routes/notificationRoutes.js");
const userRoutes = require("./routes/userRoutes.js");
const conversationRoutes = require("./routes/conversationRoutes.js");

const app = express();
const mongoose = require("mongoose");

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
  credentials: true
}));
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) =>
  res.json({ ok: mongoose.connection.readyState === 1, time: new Date().toISOString(), dbState: mongoose.connection.readyState })
);

// Fail fast if DB is not connected for API requests (health stays public)
const dbReady = require("./middlewares/dbReady.js");
app.use("/api", dbReady);

const contactRoutes = require("./routes/contactRoutes.js");
const verifyRoutes  = require("./routes/verifyRoutes.js");

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/verify", verifyRoutes);

module.exports = app;
