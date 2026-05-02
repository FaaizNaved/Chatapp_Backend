const { createChatMessage, fetchConversationMessages } = require("../services/chatMessageService.js");
const {
  createConversation,
  listUserConversations,
  getConversationForUser,
  serializeConversation
} = require("../services/conversationService.js");
const { createDiscussionLifecycleNotifications } = require("../services/notificationService.js");
const Conversation = require("../models/conversation.js");

function parseDurationToMs(value, unit) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  if (unit === "minutes") return amount * 60 * 1000;
  if (unit === "hours") return amount * 60 * 60 * 1000;
  if (unit === "days") return amount * 24 * 60 * 60 * 1000;
  return 0;
}

function resolveDiscussionStart(body = {}) {
  if (body.scheduleMode === "scheduled") {
    return body.scheduled_for || body.scheduledFor;
  }

  return new Date().toISOString();
}

exports.listConversations = async (req, res) => {
  try {
    const conversations = await listUserConversations(req.user.id);
    return res.json({ success: true, conversations });
  } catch (err) {
    console.error("list conversations error:", err);
    return res.status(500).json({ success: false, message: "Failed to list conversations" });
  }
};

exports.createGroup = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const conversation = await createConversation({
      type: "group",
      name: body.name,
      icon: body.icon,
      memberIds: Array.isArray(body.memberIds) ? body.memberIds : [],
      createdBy: req.user.id
    });

    const io = req.app.get("io");
    conversation.member_ids.forEach((memberId) => {
      io?.in(String(memberId)).socketsJoin(`conversation:${conversation.id}`);
      io?.to(String(memberId)).emit("conversation:new", conversation);
    });

    return res.status(201).json({ success: true, conversation });
  } catch (err) {
    console.error("create group error:", err);
    return res.status(400).json({ success: false, message: err.message || "Failed to create group" });
  }
};

exports.createDiscussion = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const conversation = await createConversation({
      type: "discussion",
      name: body.name,
      icon: body.icon,
      memberIds: Array.isArray(body.memberIds) ? body.memberIds : [],
      createdBy: req.user.id,
      durationMs: parseDurationToMs(body.durationValue, body.durationUnit),
      startsAt: resolveDiscussionStart(body)
    });

    await createDiscussionLifecycleNotifications(conversation.id);

    const io = req.app.get("io");
    conversation.member_ids.forEach((memberId) => {
      io?.in(String(memberId)).socketsJoin(`conversation:${conversation.id}`);
      io?.to(String(memberId)).emit("conversation:new", conversation);
    });

    return res.status(201).json({ success: true, conversation });
  } catch (err) {
    console.error("create discussion error:", err);
    return res.status(400).json({ success: false, message: err.message || "Failed to create discussion" });
  }
};

exports.fetchConversationMessages = async (req, res) => {
  try {
    const messages = await fetchConversationMessages({
      requesterId: req.user.id,
      conversationId: req.params.id,
      limit: parseInt(req.query.limit || "100", 10),
      offset: parseInt(req.query.offset || "0", 10)
    });
    const conversation = await getConversationForUser(req.params.id, req.user.id);

    return res.json({
      success: true,
      conversation,
      messages
    });
  } catch (err) {
    console.error("fetch conversation messages error:", err);
    return res.status(400).json({ success: false, message: err.message || "Failed to fetch messages" });
  }
};

exports.sendConversationMessage = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const payload = await createChatMessage({
      senderId: req.user.id,
      conversationId: req.params.id,
      text: body.text,
      attachments: body.attachments
    });

    const io = req.app.get("io");
    io?.to(`conversation:${req.params.id}`).emit("newMessage", payload);

    return res.json({ success: true, message: payload });
  } catch (err) {
    console.error("send conversation message error:", err);
    return res.status(400).json({ success: false, message: err.message || "Failed to send message" });
  }
};

exports.deleteConversation = async (req, res) => {
  try {
    const conversation = await getConversationForUser(req.params.id, req.user.id);
    
    // Only allow deletion if user is admin or it's a direct chat
    if (conversation.type !== 'direct' && !conversation.admin_ids.includes(req.user.id)) {
      return res.status(403).json({ success: false, message: "Only admins can delete groups/discussions" });
    }

    // Delete the conversation
    await Conversation.findByIdAndDelete(req.params.id);

    const io = req.app.get("io");
    conversation.member_ids.forEach((memberId) => {
      io?.to(String(memberId)).emit("conversation:deleted", { conversationId: req.params.id });
    });

    return res.json({ success: true, message: "Conversation deleted successfully" });
  } catch (err) {
    console.error("delete conversation error:", err);
    return res.status(400).json({ success: false, message: err.message || "Failed to delete conversation" });
  }
};

exports.leaveConversation = async (req, res) => {
  try {
    const conversation = await getConversationForUser(req.params.id, req.user.id);
    
    // Remove user from conversation
    await Conversation.findByIdAndUpdate(
      req.params.id,
      { $pull: { members: req.user.id, admins: req.user.id } }
    );

    const io = req.app.get("io");
    io?.to(String(req.user.id)).emit("conversation:left", { conversationId: req.params.id });
    
    // Notify other members
    conversation.member_ids
      .filter(id => id !== req.user.id)
      .forEach((memberId) => {
        io?.to(String(memberId)).emit("conversation:member_left", { 
          conversationId: req.params.id, 
          userId: req.user.id 
        });
      });

    return res.json({ success: true, message: "Left conversation successfully" });
  } catch (err) {
    console.error("leave conversation error:", err);
    return res.status(400).json({ success: false, message: err.message || "Failed to leave conversation" });
  }
};
