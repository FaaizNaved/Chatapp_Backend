const express = require("express");
const { verifyJWT } = require("../middlewares/auth.js");
const {
  listNotifications,
  readNotification
} = require("../controllers/notificationController.js");

const router = express.Router();

router.get("/", verifyJWT, listNotifications);
router.post("/:id/read", verifyJWT, readNotification);

module.exports = router;
