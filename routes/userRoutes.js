// routes/userRoutes.js
const express = require("express");
const { verifyJWT } = require("../middlewares/auth.js");
const User = require("../models/user.js");

const router = express.Router();

// GET /api/users — all users except authenticated user
router.get("/", verifyJWT, async (req, res) => {
  try {
    const users = await User.find(
      { _id: { $ne: req.user.id } },
      "username avatar_color"
    ).sort({ username: 1 });

    const mapped = users.map(u => ({
      id: u._id,
      username: u.username,
      avatar_color: u.avatar_color
    }));

    return res.json({ success: true, users: mapped });
  } catch (err) {
    console.error("list users error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
