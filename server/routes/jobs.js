// server/routes/jobs.js
// Thin orchestration shim — mounts estimates and management sub-routers.
// No route changes; server/index.js requires no modification.
const express = require('express');
const router = express.Router();

router.use('/', require('./estimates'));
router.use('/', require('./management'));

module.exports = router;
