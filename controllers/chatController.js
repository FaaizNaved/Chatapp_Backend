// controllers/chatController.js
const mongoose = require("mongoose");
const Message = require("../models/message.js");
const User = require("../models/user.js");

// Helper: enrich messages with sender info
async function enrichMessages(messages) {
  const senderIds = [...new Set(messages.map(m => String(m.sender_id)))];
  const users = await User.find({ _id: { $in: senderIds } }, "username avatar_color");
  const userMap = users.reduce((acc, u) => {
    acc[String(u._id)] = u;
    return acc;
  }, {});

  return messages.map(m => ({
    id: m._id,
    sender_id: m.sender_id,
    receiver_id: m.receiver_id,
    text: m.text,
    attachments: m.attachments,
    is_read: m.is_read,
    created_at: m.createdAt,
    sender_username: userMap[String(m.sender_id)]?.username,
    sender_avatar_color: userMap[String(m.sender_id)]?.avatar_color
  }));
}

// POST /api/chat/send
exports.sendMessage = async (req, res) => {
  try {
    const sender_id = req.user.id;
    const { receiver_id, text, attachments } = req.body;

    if (!receiver_id || !text?.trim())
      return res.status(400).json({ success: false, message: "receiver_id and text required" });

    const message = await Message.create({
      sender_id,
      receiver_id,
      text: text.trim(),
      attachments: attachments || null,
      is_read: false
    });

    const sender = await User.findById(sender_id, "username avatar_color");
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

    const io = req.app.get("io");
    io.to(String(receiver_id)).emit("newMessage", payload);
    io.to(String(sender_id)).emit("messageSent", payload);

    return res.json({ success: true, message: payload });
  } catch (err) {
    console.error("sendMessage error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/chat/messages?user1=&user2=&limit=100&offset=0
exports.fetchMessages = async (req, res) => {
  try {
    const { user1, user2, limit = 100, offset = 0 } = req.query;
    if (!user1 || !user2)
      return res.status(400).json({ success: false, message: "user1 and user2 required" });

    const messages = await Message.find({
      $or: [
        { sender_id: user1, receiver_id: user2 },
        { sender_id: user2, receiver_id: user1 }
      ]
    })
      .sort({ createdAt: 1 })
      .skip(parseInt(offset, 10))
      .limit(parseInt(limit, 10));

    const enriched = await enrichMessages(messages);
    return res.json({ success: true, messages: enriched });
  } catch (err) {
    console.error("fetchMessages error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// POST /api/chat/read
exports.markAsRead = async (req, res) => {
  try {
    const { userId, otherUserId } = req.body;
    if (!userId || !otherUserId)
      return res.status(400).json({ success: false, message: "userId and otherUserId required" });

    const result = await Message.updateMany(
      { sender_id: otherUserId, receiver_id: userId, is_read: false },
      { $set: { is_read: true } }
    );

    const io = req.app.get("io");
    io.to(String(otherUserId)).emit("messagesRead", { by: userId });

    return res.json({ success: true, affected: result.modifiedCount });
  } catch (err) {
    console.error("markAsRead error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
