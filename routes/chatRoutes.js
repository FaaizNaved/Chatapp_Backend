const express = require("express");
const {
  sendMessage,
  fetchMessages,
  markAsRead,
  uploadAttachment
} = require("../controllers/chatController.js");
const { verifyJWT } = require("../middlewares/auth.js");

const router = express.Router();

router.post("/send", verifyJWT, sendMessage);
router.get("/messages", verifyJWT, fetchMessages);
router.post("/read", verifyJWT, markAsRead);
router.post("/upload", verifyJWT, uploadAttachment);

module.exports = router;
