const express = require("express");
const {
  sendVerificationCode,
  verifyCode,
  register,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  testMailService
} = require("../controllers/authController.js");
const { verifyJWT } = require("../middlewares/auth.js");

const router = express.Router();

router.post("/send-verification-code", sendVerificationCode);
router.post("/verify-code", verifyCode);
router.post("/register", register);
router.post("/login", login);
router.post("/logout", verifyJWT, logout);
router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password", resetPassword);
router.get("/test-mail-service", testMailService);

module.exports = router;
