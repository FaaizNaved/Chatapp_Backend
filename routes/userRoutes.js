const express = require("express");
const { verifyJWT } = require("../middlewares/auth.js");
const {
  listUsers,
  getCurrentUser,
  updateProfile,
  updateSettings,
  togglePinnedItem
} = require("../controllers/userController.js");

const router = express.Router();

router.get("/me", verifyJWT, getCurrentUser);
router.patch("/me/profile", verifyJWT, updateProfile);
router.patch("/me/settings", verifyJWT, updateSettings);
router.post("/me/pins/toggle", verifyJWT, togglePinnedItem);
router.get("/", verifyJWT, listUsers);

module.exports = router;
