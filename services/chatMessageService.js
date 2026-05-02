const Message = require("../models/message.js");
const User = require("../models/user.js");
const Conversation = require("../models/conversation.js");
const { encryptMessageText, decryptMessageText } = require("./cryptoService.js");
const { getDiscussionStatus } = require("./conversationService.js");
const { createChatNotification, createChatNotifications } = require("./notificationService.js");

async function buildUserMap(messages) {
  const senderIds = [...new Set(messages.map((message) => String(message.sender_id)))];
  const users = await User.find({ _id: { $in: senderIds } }, "username avatar_color avatar_url avatar_symbol");

  return users.reduce((accumulator, user) => {
    accumulator[String(user._id)] = user;
    return accumulator;
  }, {});
}

function serializeMessage(message, userMap = {}) {
  const sender = userMap[String(message.sender_id)];

  return {
    id: message._id,
    sender_id: message.sender_id,
    receiver_id: message.receiver_id,
    conversation_id: message.conversation_id,
    text: message.text ? String(message.text) : decryptMessageText(message.text_encrypted),
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    is_read: message.is_read,
    created_at: message.createdAt,
    sender_username: sender?.username,
    sender_avatar_color: sender?.avatar_color,
    sender_avatar_url: sender?.avatar_url || "",
    sender_symbol: sender?.avatar_symbol || sender?.username?.slice(0, 2).toUpperCase() || ""
  };
}

async function createChatMessage({ senderId, receiverId, conversationId, text, attachments }) {
  const cleanedText = String(text || "").trim();
  const cleanedAttachments = Array.isArray(attachments)
    ? attachments.filter((attachment) => attachment?.url && attachment?.kind)
    : [];

  if ((!receiverId && !conversationId) || (!cleanedText && cleanedAttachments.length === 0)) {
    throw new Error("Target and message content are required");
  }

  let conversation = null;
  if (conversationId) {
    conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const isMember = conversation.members.some((memberId) => String(memberId) === String(senderId));
    if (!isMember) {
      throw new Error("You are not a member of this conversation");
    }

    if (conversation.type === "discussion") {
      const status = getDiscussionStatus(conversation);
      if (status === "scheduled") {
        throw new Error("This discussion has not started yet");
      }

      if (status === "ended") {
        if (conversation.is_active) {
          conversation.is_active = false;
          await conversation.save();
        }

        throw new Error("This discussion has ended");
      }
    }
  }

  const message = await Message.create({
    sender_id: senderId,
    receiver_id: receiverId || null,
    conversation_id: conversationId || null,
    text: "",
    text_encrypted: encryptMessageText(cleanedText),
    attachments: cleanedAttachments,
    is_read: false
  });

  const sender = await User.findById(senderId, "username avatar_color avatar_url avatar_symbol");
  const payload = serializeMessage(message, sender ? { [String(sender._id)]: sender } : {});

  if (conversation) {
    const recipientIds = conversation.members
      .map(String)
      .filter((memberId) => memberId !== String(senderId));
    await createChatNotifications({
      recipientIds,
      senderId: payload.sender_id,
      message: payload,
      conversationName: conversation.name,
      conversationType: conversation.type
    });
  } else if (payload.receiver_id) {
    await createChatNotification({
      recipientId: payload.receiver_id,
      senderId: payload.sender_id,
      message: payload
    });
  }

  return payload;
}

async function fetchConversationMessages({ requesterId, user1, user2, conversationId, limit = 100, offset = 0 }) {
  let query;

  if (conversationId) {
    const conversation = await Conversation.findOne({ _id: conversationId, members: requesterId });
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    if (conversation.type === "discussion") {
      const status = getDiscussionStatus(conversation);
      if (status === "ended" && conversation.is_active) {
        conversation.is_active = false;
        await conversation.save();
      }
    }

    query = { conversation_id: conversationId };
  } else {
    query = {
      $or: [
        { sender_id: user1, receiver_id: user2 },
        { sender_id: user2, receiver_id: user1 }
      ]
    };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: 1 })
    .skip(offset)
    .limit(limit);

  const userMap = await buildUserMap(messages);
  return messages.map((message) => serializeMessage(message, userMap));
}

async function markConversationAsRead(otherUserId, userId) {
  return Message.updateMany(
    { sender_id: otherUserId, receiver_id: userId, is_read: false },
    { $set: { is_read: true } }
  );
}

module.exports = {
  createChatMessage,
  fetchConversationMessages,
  markConversationAsRead
};
