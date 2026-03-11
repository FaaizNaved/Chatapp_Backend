// routes/chatRoutes.js
const express = require("express");
const { sendMessage, fetchMessages, markAsRead } = require("../controllers/chatController.js");
const { verifyJWT } = require("../middlewares/auth.js");

const router = express.Router();

router.post("/send", verifyJWT, sendMessage);      // body: sender_id, receiver_id, text, attachments
router.get("/messages", verifyJWT, fetchMessages); // query: user1, user2
router.post("/read", verifyJWT, markAsRead);       // body: userId, otherUserId

module.exports = router;
