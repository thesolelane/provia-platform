// server/routes/emailLog.js
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// GET /api/email-log — stats + recent emails
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  const today = db.prepare(`
    SELECT COUNT(*) as count FROM email_log
    WHERE date(sent_at) = date('now')
  `).get();

  const thisMonth = db.prepare(`
    SELECT COUNT(*) as count FROM email_log
    WHERE strftime('%Y-%m', sent_at) = strftime('%Y-%m', 'now')
  `).get();

  const thisYear = db.prepare(`
    SELECT COUNT(*) as count FROM email_log
    WHERE strftime('%Y', sent_at) = strftime('%Y', 'now')
  `).get();

  const total = db.prepare(`SELECT COUNT(*) as count FROM email_log`).get();

  const openedCount = db.prepare(`SELECT COUNT(*) as count FROM email_log WHERE opened_at IS NOT NULL`).get();

  const byType = db.prepare(`
    SELECT email_type, COUNT(*) as count FROM email_log
    GROUP BY email_type ORDER BY count DESC
  `).all();

  const byDay = db.prepare(`
    SELECT date(sent_at) as day, COUNT(*) as count
    FROM email_log
    WHERE sent_at >= date('now', '-30 days')
    GROUP BY day ORDER BY day DESC
  `).all();

  const byMonth = db.prepare(`
    SELECT strftime('%Y-%m', sent_at) as month, COUNT(*) as count
    FROM email_log
    GROUP BY month ORDER BY month DESC LIMIT 12
  `).all();

  const emails = db.prepare(`
    SELECT id, message_id, to_address, subject, email_type, job_id,
           sent_at, opened_at, opened_count
    FROM email_log
    ORDER BY sent_at DESC LIMIT ?
  `).all(limit);

  res.json({
    stats: {
      today: today.count,
      thisMonth: thisMonth.count,
      thisYear: thisYear.count,
      total: total.count,
      opened: openedCount.count,
    },
    byType,
    byDay,
    byMonth,
    emails,
  });
});

// POST /webhook/mailgun — Mailgun open/click tracking webhook
router.post('/webhook/mailgun', express.json(), (req, res) => {
  try {
    const db = getDb();
    const events = Array.isArray(req.body['event-data'])
      ? req.body['event-data']
      : [req.body['event-data'] || req.body];

    for (const ev of events) {
      const event     = ev?.event || ev?.event_data?.event;
      const messageId = ev?.message?.headers?.['message-id'] || ev?.['message-id'];
      if ((event === 'opened' || event === 'clicked') && messageId) {
        db.prepare(`
          UPDATE email_log
          SET opened_at    = COALESCE(opened_at, CURRENT_TIMESTAMP),
              opened_count = opened_count + 1
          WHERE message_id = ?
        `).run(messageId);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[Mailgun webhook]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
