const {
  createChatMessage,
  fetchConversationMessages,
  markConversationAsRead
} = require("../services/chatMessageService.js");
const { uploadToCloudinary } = require("../services/cloudinaryService.js");

exports.sendMessage = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const payload = await createChatMessage({
      senderId: req.user.id,
      receiverId: body.receiver_id,
      conversationId: body.conversation_id,
      text: body.text,
      attachments: body.attachments
    });

    const io = req.app.get("io");
    if (payload.receiver_id) {
      io.to(String(payload.receiver_id)).emit("newMessage", payload);
      io.to(String(payload.sender_id)).emit("messageSent", payload);
    } else if (payload.conversation_id) {
      io.to(`conversation:${payload.conversation_id}`).emit("newMessage", payload);
    }

    return res.json({ success: true, message: payload });
  } catch (err) {
    console.error("sendMessage error:", err);
    return res.status(400).json({ success: false, message: err.message || "Server error" });
  }
};

exports.fetchMessages = async (req, res) => {
  try {
    const { user1, user2, conversationId, limit = 100, offset = 0 } = req.query;
    if (!conversationId && (!user1 || !user2)) {
      return res.status(400).json({ success: false, message: "Provide user1 and user2, or conversationId" });
    }

    if (!conversationId && ![String(user1), String(user2)].includes(String(req.user.id))) {
      return res.status(403).json({ success: false, message: "Not authorized for this conversation" });
    }

    const messages = await fetchConversationMessages({
      requesterId: req.user.id,
      user1,
      user2,
      conversationId,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });

    return res.json({ success: true, messages });
  } catch (err) {
    console.error("fetchMessages error:", err);
    return res.status(400).json({ success: false, message: err.message || "Server error" });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { otherUserId } = body;
    const userId = req.user.id;
    if (!otherUserId) {
      return res.status(400).json({ success: false, message: "otherUserId required" });
    }

    const result = await markConversationAsRead(otherUserId, userId);

    const io = req.app.get("io");
    io.to(String(otherUserId)).emit("messagesRead", { by: userId });

    return res.json({ success: true, affected: result.modifiedCount });
  } catch (err) {
    console.error("markAsRead error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.uploadAttachment = async (req, res) => {
  try {
    const attachment = await uploadToCloudinary(req.body || {});
    return res.json({ success: true, attachment });
  } catch (err) {
    console.error("uploadAttachment error:", err);
    return res.status(400).json({ success: false, message: err.message || "Upload failed" });
  }
};
