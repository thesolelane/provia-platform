'use strict';
const express = require('express');
const { getDb } = require('../db/database');
const router = express.Router();

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

router.get('/api/track/o/:pixelId', (req, res) => {
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': PIXEL.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
  });
  res.end(PIXEL);

  try {
    const db = getDb();
    const row = db
      .prepare('SELECT id, opened_count FROM email_log WHERE message_id = ?')
      .get(req.params.pixelId);
    if (row) {
      db.prepare(
        `
        UPDATE email_log
        SET opened_at = COALESCE(opened_at, CURRENT_TIMESTAMP),
            opened_count = opened_count + 1
        WHERE id = ?
      `
      ).run(row.id);
    }
  } catch (e) {
    console.error('[Track] pixel error:', e.message);
  }
});

module.exports = router;
