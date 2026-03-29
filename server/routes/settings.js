// server/routes/settings.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');

// GET all settings grouped by category
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM settings ORDER BY category, key').all();
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    let value = row.value;
    try {
      value = JSON.parse(row.value);
    } catch { /* ignore */ }
    grouped[row.category].push({
      key: row.key,
      value,
      label: row.label,
      updatedAt: row.updated_at
    });
  }
  res.json(grouped);
});

// GET single setting
router.get('/:key', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM settings WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Setting not found' });
  let value = row.value;
  try {
    value = JSON.parse(row.value);
  } catch { /* ignore */ }
  res.json({ key: row.key, value, label: row.label });
});

// PUT update single setting
router.put('/:key', requireAuth, (req, res) => {
  const db = getDb();
  const value =
    typeof req.body.value === 'object' ? JSON.stringify(req.body.value) : String(req.body.value);
  db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(
    value,
    req.params.key
  );
  res.json({ success: true, key: req.params.key, value: req.body.value });
});

// PUT bulk update settings
router.put('/', requireAuth, (req, res) => {
  const db = getDb();
  const updates = req.body; // { key: value, key: value }
  const update = db.prepare(
    'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?'
  );
  const updateMany = db.transaction((items) => {
    for (const [key, val] of Object.entries(items)) {
      const value = typeof val === 'object' ? JSON.stringify(val) : String(val);
      update.run(value, key);
    }
  });
  updateMany(updates);
  res.json({ success: true, updated: Object.keys(updates).length });
});

// POST reset settings to defaults
router.post('/reset', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM settings').run();
  res.json({ success: true, message: 'Settings reset to defaults' });
});

// GET integration status
router.get('/integrations/status', requireAuth, (req, res) => {
  const db = getDb();
  const platform =
    db.prepare("SELECT value FROM settings WHERE key = 'integration.platform'").get()?.value ||
    'hearth';
  const whatsappEnabled =
    db.prepare("SELECT value FROM settings WHERE key = 'integration.whatsapp'").get()?.value ===
    'true';
  const emailEnabled =
    db.prepare("SELECT value FROM settings WHERE key = 'integration.email'").get()?.value !==
    'false';

  res.json({
    platform,
    whatsapp: { enabled: whatsappEnabled, configured: !!process.env.TWILIO_ACCOUNT_SID },
    email: { enabled: emailEnabled, configured: !!process.env.RESEND_API_KEY },
    hearth: { configured: !!process.env.HEARTH_API_KEY },
    wave: { configured: false } // placeholder
  });
});

// POST switch integration platform
router.post('/integrations/switch', requireAuth, (req, res) => {
  const db = getDb();
  const { platform } = req.body;
  if (!['hearth', 'wave', 'email'].includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform. Must be: hearth, wave, or email' });
  }
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value, category, label) VALUES ('integration.platform', ?, 'integrations', 'Active Platform')"
  ).run(platform);
  res.json({ success: true, platform, message: `Switched to ${platform}` });
});

module.exports = router;
