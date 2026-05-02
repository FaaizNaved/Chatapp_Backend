const Conversation = require("../models/conversation.js");
const User = require("../models/user.js");
const Message = require("../models/message.js");

function getDiscussionStatus(conversation) {
  const now = Date.now();
  const startsAt = conversation.starts_at ? new Date(conversation.starts_at) : null;
  const endsAt = conversation.ends_at ? new Date(conversation.ends_at) : null;

  if (startsAt && startsAt.getTime() > now) {
    return "scheduled";
  }

  if (endsAt && endsAt.getTime() <= now) {
    return "ended";
  }

  return "active";
}

async function serializeConversation(conversation, userId = null) {
  const status = conversation.type === "discussion"
    ? getDiscussionStatus(conversation)
    : "active";

  // Get message count and last message
  const messageCount = await Message.countDocuments({ conversation_id: conversation._id });
  const lastMessage = await Message
    .findOne({ conversation_id: conversation._id })
    .sort({ createdAt: -1 });

  return {
    id: conversation._id,
    type: conversation.type,
    name: conversation.name,
    icon: conversation.icon || (conversation.type === "discussion" ? "calendar" : "group"),
    member_ids: conversation.members.map(String),
    admin_ids: conversation.admins.map(String),
    created_by: String(conversation.created_by),
    starts_at: conversation.starts_at || null,
    ends_at: conversation.ends_at || null,
    status,
    is_active: conversation.is_active && status === "active",
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
    message_count: messageCount,
    last_message: lastMessage ? {
      id: lastMessage._id,
      text: lastMessage.text,
      created_at: lastMessage.createdAt,
      sender_id: lastMessage.sender_id
    } : null
  };
}

async function syncDiscussionState(conversation) {
  if (!conversation || conversation.type !== "discussion") {
    return conversation;
  }

  const status = getDiscussionStatus(conversation);
  if (status === "ended" && conversation.is_active) {
    conversation.is_active = false;
    await conversation.save();
  }

  if (status !== "ended" && conversation.is_active !== true) {
    conversation.is_active = true;
    await conversation.save();
  }

  return conversation;
}

async function listUserConversations(userId) {
  const conversations = await Conversation.find({ members: userId }).sort({ updatedAt: -1, createdAt: -1 });
  const synced = await Promise.all(conversations.map(syncDiscussionState));
  
  // Serialize with message counts and sort properly
  const serialized = await Promise.all(
    synced.map(conv => serializeConversation(conv, userId))
  );
  
  // Sort by pinned status first, then by last message time
  return serialized.sort((a, b) => {
    // Pinned conversations first
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    
    // Then by last message time
    const timeA = a.last_message?.created_at ? new Date(a.last_message.created_at) : new Date(0);
    const timeB = b.last_message?.created_at ? new Date(b.last_message.created_at) : new Date(0);
    return timeB - timeA; // Most recent first
  });
}

async function getConversationForUser(conversationId, userId) {
  const conversation = await Conversation.findOne({ _id: conversationId, members: userId });
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  await syncDiscussionState(conversation);
  return await serializeConversation(conversation, userId);
}

async function createConversation({ type, name, icon, memberIds, createdBy, durationMs, startsAt }) {
  const dedupedIds = [...new Set([String(createdBy), ...(memberIds || []).map(String)])];
  if (dedupedIds.length < 2) {
    throw new Error("Select at least one other member");
  }

  const users = await User.find({ _id: { $in: dedupedIds } }, "_id");
  if (users.length !== dedupedIds.length) {
    throw new Error("One or more selected users were not found");
  }

  const baseStartTime = startsAt ? new Date(startsAt) : new Date();
  if (Number.isNaN(baseStartTime.getTime())) {
    throw new Error("Invalid discussion schedule");
  }

  const payload = {
    type,
    name: String(name || "").trim(),
    icon: String(icon || "").trim() || (type === "group" ? "group" : "calendar"),
    starts_at: baseStartTime,
    members: dedupedIds,
    admins: [createdBy],
    created_by: createdBy
  };

  if (!payload.name) {
    throw new Error(`${type === "group" ? "Group" : "Discussion"} name is required`);
  }

  if (type === "discussion") {
    if (!durationMs || durationMs < 60 * 1000) {
      throw new Error("Discussion duration must be at least 1 minute");
    }

    if (baseStartTime.getTime() < Date.now() - 30 * 1000) {
      throw new Error("Scheduled time must be in the future");
    }

    payload.ends_at = new Date(baseStartTime.getTime() + durationMs);
    payload.is_active = true;
  }

  const conversation = await Conversation.create(payload);
  return serializeConversation(conversation);
}

module.exports = {
  getDiscussionStatus,
  serializeConversation,
  syncDiscussionState,
  listUserConversations,
  getConversationForUser,
  createConversation
};
