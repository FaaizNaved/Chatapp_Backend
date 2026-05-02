const express = require("express");
const { handleContactForm } = require("../controllers/contactController.js");

const router = express.Router();

router.post("/", handleContactForm);

module.exports = router;
