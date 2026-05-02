const express = require("express");
const { verifyJWT } = require("../middlewares/auth.js");
const {
  listConversations,
  createGroup,
  createDiscussion,
  fetchConversationMessages,
  sendConversationMessage,
  deleteConversation,
  leaveConversation
} = require("../controllers/conversationController.js");

const router = express.Router();

router.get("/", verifyJWT, listConversations);
router.post("/group", verifyJWT, createGroup);
router.post("/discussion", verifyJWT, createDiscussion);
router.get("/:id/messages", verifyJWT, fetchConversationMessages);
router.post("/:id/messages", verifyJWT, sendConversationMessage);
router.delete("/:id", verifyJWT, deleteConversation);
router.post("/:id/leave", verifyJWT, leaveConversation);

module.exports = router;
