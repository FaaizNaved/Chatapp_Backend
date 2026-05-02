const User = require("../models/user.js");
const { buildUserIdentity, twoLetterSymbol } = require("../utils/auth.js");

function normalizeProfilePayload(body = {}) {
  return {
    username: body.username,
    avatar_color: body.avatar_color,
    avatar_symbol: body.avatar_symbol,
    avatar_type: body.avatar_type,
    avatar_url: body.avatar_url
  };
}

exports.listUsers = async (req, res) => {
  try {
    const users = await User.find(
      { _id: { $ne: req.user.id } },
      "username avatar_color avatar_symbol avatar_type avatar_url"
    ).sort({ username: 1 });

    return res.json({
      success: true,
      users: users.map((user) => ({
        id: user._id,
        username: user.username,
        avatar_color: user.avatar_color,
        avatar_url: user.avatar_url || "",
        avatar_symbol: user.avatar_symbol || user.username.slice(0, 2).toUpperCase(),
        avatar_type: user.avatar_type || (user.avatar_url ? "image" : "character")
      }))
    });
  } catch (err) {
    console.error("list users error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, user: buildUserIdentity(user) });
  } catch (err) {
    console.error("get current user error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { username, avatar_color, avatar_symbol, avatar_type, avatar_url } = normalizeProfilePayload(req.body);
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (username !== undefined) {
      const trimmedUsername = String(username).trim();
      if (trimmedUsername.length < 3) {
        return res.status(400).json({ success: false, message: "Username must be at least 3 characters" });
      }

      const existing = await User.findOne({ username: trimmedUsername, _id: { $ne: req.user.id } }, "_id");
      if (existing) {
        return res.status(409).json({ success: false, message: "Username already taken" });
      }

      user.username = trimmedUsername;
    }

    if (avatar_color) {
      user.avatar_color = String(avatar_color).trim();
    }

    if (typeof avatar_url === "string") {
      user.avatar_url = avatar_url.trim();
      if (user.avatar_url) {
        user.avatar_type = "image";
      }
    }

    if (avatar_symbol !== undefined) {
      user.avatar_symbol = twoLetterSymbol(user.username, avatar_symbol);
    }

    if (avatar_type && ["character", "image"].includes(avatar_type)) {
      user.avatar_type = avatar_type;
    }

    if (user.avatar_type === "character") {
      user.avatar_url = "";
      if (!user.avatar_symbol) {
        user.avatar_symbol = twoLetterSymbol(user.username, "");
      }
    }

    await user.save();
    return res.json({ success: true, user: buildUserIdentity(user) });
  } catch (err) {
    console.error("update profile error:", err);
    return res.status(500).json({ success: false, message: "Failed to update profile" });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const {
      theme,
      liquid_glass,
      font_size,
      notifications_enabled,
      notification_preferences
    } = body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (theme && ["default", "light", "dark"].includes(theme)) {
      user.settings.theme = theme;
    }

    if (typeof liquid_glass === "boolean") {
      user.settings.liquid_glass = liquid_glass;
    }

    if (font_size && ["sm", "md", "lg"].includes(font_size)) {
      user.settings.font_size = font_size;
    }

    if (typeof notifications_enabled === "boolean") {
      user.settings.notifications_enabled = notifications_enabled;
    }

    if (notification_preferences && typeof notification_preferences === "object") {
      user.settings.notification_preferences = {
        direct_messages: notification_preferences.direct_messages !== false,
        group_messages: notification_preferences.group_messages !== false,
        discussion_updates: notification_preferences.discussion_updates !== false
      };
    }

    await user.save();
    return res.json({ success: true, user: buildUserIdentity(user) });
  } catch (err) {
    console.error("update settings error:", err);
    return res.status(500).json({ success: false, message: "Failed to update settings" });
  }
};

exports.togglePinnedItem = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { itemKey } = body;
    if (!itemKey) {
      return res.status(400).json({ success: false, message: "itemKey is required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const currentPins = Array.isArray(user.pinned_items) ? user.pinned_items : [];
    user.pinned_items = currentPins.includes(itemKey)
      ? currentPins.filter((value) => value !== itemKey)
      : [itemKey, ...currentPins];

    await user.save();
    return res.json({ success: true, pinned_items: user.pinned_items });
  } catch (err) {
    console.error("toggle pin error:", err);
    return res.status(500).json({ success: false, message: "Failed to update pinned items" });
  }
};
