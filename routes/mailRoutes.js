// routes/mailRoutes.js
const express = require("express");
const router = express.Router();
const {
  sendMail,
  handleInvitationClick,
} = require("../controller/mailController");

router.post("/send-invite", sendMail);
router.post("/join-space", handleInvitationClick);

module.exports = router;
