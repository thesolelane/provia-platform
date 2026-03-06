// server/routes/conversations.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');

router.get('/:jobId', requireAuth, (req, res) => {
  const db = getDb();
  const conversations = db.prepare(
    'SELECT * FROM conversations WHERE job_id = ? ORDER BY created_at ASC'
  ).all(req.params.jobId);
  res.json(conversations);
});

module.exports = router;
