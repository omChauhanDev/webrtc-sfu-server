const express = require("express");
const router = express.Router();
const {
  sendMail,
  handleInvitationClick,
} = require("../controller/mailController");

router.post("/send-invite", sendMail);
router.get("/join-space", handleInvitationClick);

module.exports = router;
