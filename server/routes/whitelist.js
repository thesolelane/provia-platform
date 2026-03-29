// server/routes/whitelist.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM approved_senders ORDER BY name').all());
});

router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { identifier, type, name, role, language = 'en' } = req.body;
  if (!identifier || !type) return res.status(400).json({ error: 'identifier and type required' });
  try {
    db.prepare(
      'INSERT INTO approved_senders (identifier, type, name, role, language) VALUES (?, ?, ?, ?, ?)'
    ).run(identifier, type, name, role, language);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Identifier already exists' });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { name, role, language, active } = req.body;
  db.prepare(
    'UPDATE approved_senders SET name = COALESCE(?, name), role = COALESCE(?, role), language = COALESCE(?, language), active = COALESCE(?, active) WHERE id = ?'
  ).run(name, role, language, active, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM approved_senders WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
