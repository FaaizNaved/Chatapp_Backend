const {
  listNotificationsForUser,
  markNotificationRead
} = require("../services/notificationService.js");

exports.listNotifications = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "50", 10);
    const notifications = await listNotificationsForUser(req.user.id, limit);
    return res.json({ success: true, notifications });
  } catch (err) {
    console.error("listNotifications error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.readNotification = async (req, res) => {
  try {
    const notification = await markNotificationRead(req.params.id, req.user.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return res.json({ success: true, notification });
  } catch (err) {
    console.error("readNotification error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
