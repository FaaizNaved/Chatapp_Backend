const Notification = require("../models/notification.js");
const User = require("../models/user.js");
const Conversation = require("../models/conversation.js");
const { getDiscussionStatus } = require("./conversationService.js");

function truncateText(value, maxLength = 60) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function describeAttachmentKind(kind) {
  if (kind === "image") return "photo";
  if (kind === "video") return "video";
  if (kind === "audio") return "voice note";
  return "attachment";
}

function articleFor(word) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function buildNotificationBody(senderName, messageText, attachments) {
  const cleanText = truncateText(messageText);
  const items = Array.isArray(attachments) ? attachments : [];

  if (cleanText) {
    return `${senderName} sent "${cleanText}"`;
  }

  if (items.length === 1) {
    const label = describeAttachmentKind(items[0].kind);
    return `${senderName} sent ${articleFor(label)} ${label}`;
  }

  if (items.length > 1) {
    return `${senderName} sent ${items.length} attachments`;
  }

  return `${senderName} sent a new message`;
}

function serializeNotification(notification) {
  return {
    id: notification._id,
    recipient_id: notification.recipient_id,
    actor_id: notification.actor_id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data || {},
    is_read: notification.is_read,
    delivered_at: notification.delivered_at,
    created_at: notification.createdAt
  };
}

function userAllowsNotification(user, channel) {
  if (!user || user.settings?.notifications_enabled === false) {
    return false;
  }

  const preferences = user.settings?.notification_preferences || {};
  if (channel === "direct_messages") return preferences.direct_messages !== false;
  if (channel === "group_messages") return preferences.group_messages !== false;
  if (channel === "discussion_updates") return preferences.discussion_updates !== false;
  return true;
}

async function createNotificationRecord({
  recipientId,
  actorId,
  type,
  title,
  body,
  data,
  preferenceChannel
}) {
  const recipient = await User.findById(recipientId, "settings");
  if (!userAllowsNotification(recipient, preferenceChannel)) {
    return null;
  }

  const notification = await Notification.create({
    recipient_id: recipientId,
    actor_id: actorId,
    type,
    title,
    body,
    data: data || {}
  });

  return serializeNotification(notification);
}

async function createChatNotification({ recipientId, senderId, message, conversationName, conversationType }) {
  const sender = await User.findById(senderId, "username");
  const senderName = sender?.username || "Someone";
  const bodyBase = buildNotificationBody(senderName, message.text, message.attachments);
  const isConversation = Boolean(conversationName);
  const body = isConversation ? `${bodyBase} in ${conversationName}` : `${bodyBase} to you`;

  return createNotificationRecord({
    recipientId,
    actorId: senderId,
    type: isConversation
      ? (conversationType === "discussion" ? "discussion_message" : "group_message")
      : "direct_message",
    title: isConversation ? conversationName : senderName,
    body,
    preferenceChannel: isConversation
      ? (conversationType === "discussion" ? "discussion_updates" : "group_messages")
      : "direct_messages",
    data: {
      chat_message_id: message.id,
      sender_id: message.sender_id,
      receiver_id: message.receiver_id,
      conversation_id: message.conversation_id || null,
      attachment_kinds: Array.isArray(message.attachments)
        ? message.attachments.map((attachment) => attachment.kind)
        : []
    }
  });
}

async function createChatNotifications({ recipientIds, senderId, message, conversationName, conversationType }) {
  const notifications = await Promise.all(
    recipientIds.map((recipientId) => createChatNotification({
      recipientId,
      senderId,
      message,
      conversationName,
      conversationType
    }))
  );

  return notifications.filter(Boolean);
}

async function createDiscussionLifecycleNotifications(conversationId) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation || conversation.type !== "discussion") {
    return [];
  }

  const creator = await User.findById(conversation.created_by, "username");
  const actorName = creator?.username || "Someone";
  const startsAtLabel = conversation.starts_at ? new Date(conversation.starts_at).toLocaleString() : "";
  const members = conversation.members
    .map(String)
    .filter((memberId) => memberId !== String(conversation.created_by));

  if (!members.length) {
    return [];
  }

  if (getDiscussionStatus(conversation) === "scheduled" && !conversation.scheduled_notification_sent_at) {
    const notifications = await Promise.all(members.map((recipientId) => createNotificationRecord({
      recipientId,
      actorId: conversation.created_by,
      type: "discussion_scheduled",
      title: conversation.name,
      body: `${actorName} scheduled "${conversation.name}" for ${startsAtLabel}`,
      preferenceChannel: "discussion_updates",
      data: {
        conversation_id: conversation._id,
        starts_at: conversation.starts_at,
        ends_at: conversation.ends_at
      }
    })));

    conversation.scheduled_notification_sent_at = new Date();
    await conversation.save();
    return notifications.filter(Boolean);
  }

  return [];
}

async function processDiscussionNotificationQueue() {
  const now = new Date();
  const discussions = await Conversation.find({
    type: "discussion",
    $or: [
      { reminder_notification_sent_at: null },
      { ended_notification_sent_at: null }
    ]
  });

  for (const discussion of discussions) {
    const status = getDiscussionStatus(discussion);
    const memberIds = discussion.members
      .map(String)
      .filter((memberId) => memberId !== String(discussion.created_by));

    if (!memberIds.length) {
      continue;
    }

    if (
      discussion.ends_at &&
      !discussion.reminder_notification_sent_at &&
      discussion.ends_at.getTime() - now.getTime() <= 5 * 60 * 1000 &&
      discussion.ends_at.getTime() > now.getTime()
    ) {
      await Promise.all(memberIds.map((recipientId) => createNotificationRecord({
        recipientId,
        actorId: discussion.created_by,
        type: "discussion_reminder",
        title: discussion.name,
        body: `"${discussion.name}" ends in 5 minutes`,
        preferenceChannel: "discussion_updates",
        data: {
          conversation_id: discussion._id,
          ends_at: discussion.ends_at
        }
      })));

      discussion.reminder_notification_sent_at = now;
    }

    if (status === "ended" && !discussion.ended_notification_sent_at) {
      await Promise.all(memberIds.map((recipientId) => createNotificationRecord({
        recipientId,
        actorId: discussion.created_by,
        type: "discussion_ended",
        title: discussion.name,
        body: `"${discussion.name}" has ended`,
        preferenceChannel: "discussion_updates",
        data: {
          conversation_id: discussion._id,
          ends_at: discussion.ends_at
        }
      })));

      discussion.ended_notification_sent_at = now;
      discussion.is_active = false;
    }

    if (discussion.isModified()) {
      await discussion.save();
    }
  }
}

async function listNotificationsForUser(userId, limit = 50) {
  const notifications = await Notification.find({ recipient_id: userId })
    .sort({ createdAt: -1 })
    .limit(limit);

  return notifications.map(serializeNotification);
}

async function markNotificationRead(notificationId, userId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient_id: userId },
    { $set: { is_read: true } },
    { new: true }
  );

  return notification ? serializeNotification(notification) : null;
}

module.exports = {
  createChatNotification,
  createChatNotifications,
  createDiscussionLifecycleNotifications,
  processDiscussionNotificationQueue,
  listNotificationsForUser,
  markNotificationRead
};
