// controllers/authController.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/user.js");

exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: "username and password required" });

    if (username.trim().length < 3)
      return res.status(400).json({ success: false, message: "Username must be at least 3 characters" });

    if (password.length < 6)
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });

    const existing = await User.findOne({ username: username.trim() });
    if (existing)
      return res.status(409).json({ success: false, message: "Username already taken" });

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ username: username.trim(), password: hashed });

    const token = jwt.sign(
      { id: user._id, username: user.username, avatar_color: user.avatar_color },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      success: true,
      token,
      user: { id: user._id, username: user.username, avatar_color: user.avatar_color }
    });
  } catch (err) {
    console.error("register error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: "username and password required" });

    const user = await User.findOne({ username: username.trim() });
    if (!user)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, username: user.username, avatar_color: user.avatar_color },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      user: { id: user._id, username: user.username, avatar_color: user.avatar_color }
    });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
