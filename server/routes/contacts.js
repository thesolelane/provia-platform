// server/routes/contacts.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');

// GET all contacts (with optional search)
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { search, limit = 100, offset = 0 } = req.query;
  let query = 'SELECT * FROM contacts';
  const params = [];
  if (search) {
    query += ' WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? OR address LIKE ? OR city LIKE ?';
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }
  query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  const contacts = db.prepare(query).all(...params);
  const total = db.prepare(
    search
      ? 'SELECT COUNT(*) as c FROM contacts WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? OR address LIKE ? OR city LIKE ?'
      : 'SELECT COUNT(*) as c FROM contacts'
  ).get(...(search ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`] : []));
  res.json({ contacts, total: total.c });
});

// GET single contact with their job history
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  // Find matching jobs by email, phone, or name
  const jobs = db.prepare(`
    SELECT id, customer_name, project_address, total_value, status, created_at
    FROM jobs WHERE archived = 0 AND (
      (customer_email IS NOT NULL AND customer_email = ?) OR
      (customer_phone IS NOT NULL AND customer_phone = ?) OR
      (customer_name IS NOT NULL AND customer_name = ?)
    ) ORDER BY created_at DESC
  `).all(contact.email || '', contact.phone || '', contact.name || '');
  res.json({ contact, jobs });
});

// POST create contact manually
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { name, email, phone, address, city, state, zip, customer_type, notes } = req.body;
  if (!name && !email) return res.status(400).json({ error: 'Name or email is required' });
  const result = db.prepare(
    `INSERT INTO contacts (name, email, phone, address, city, state, zip, customer_type, notes, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`
  ).run(name||null, email||null, phone||null, address||null, city||null, state||null, zip||null, customer_type||'residential', notes||null);
  res.json({ success: true, id: result.lastInsertRowid });
});

// PATCH update contact
router.patch('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { name, email, phone, address, city, state, zip, customer_type, notes } = req.body;
  db.prepare(`UPDATE contacts SET
    name = ?, email = ?, phone = ?, address = ?, city = ?, state = ?, zip = ?,
    customer_type = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`
  ).run(name||null, email||null, phone||null, address||null, city||null, state||null, zip||null, customer_type||'residential', notes||null, req.params.id);
  res.json({ success: true });
});

// DELETE contact
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
