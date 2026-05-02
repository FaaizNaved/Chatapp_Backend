const express = require("express");
const { sendOtp, confirmOtp } = require("../controllers/verifyController.js");
const { verifyJWT } = require("../middlewares/auth.js");

const router = express.Router();

router.post("/send-otp", verifyJWT, sendOtp);
router.post("/confirm-otp", verifyJWT, confirmOtp);

module.exports = router;
