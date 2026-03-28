// server/routes/contacts.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
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

// GET single contact with their job history and documents
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const jobs = db.prepare(`
    SELECT id, customer_name, project_address, total_value, status, created_at
    FROM jobs WHERE archived = 0 AND (
      (customer_email IS NOT NULL AND customer_email = ?) OR
      (customer_phone IS NOT NULL AND customer_phone = ?) OR
      (customer_name IS NOT NULL AND customer_name = ?)
    ) ORDER BY created_at DESC
  `).all(contact.email || '', contact.phone || '', contact.name || '');

  const documents = db.prepare(
    'SELECT id, filename, original_name, mime_type, source, created_at FROM contact_documents WHERE contact_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  const jobIds = jobs.map(j => j.id);
  let paymentSummary = { total_received: 0, total_paid_out: 0, balance: 0 };
  if (jobIds.length > 0) {
    const placeholders = jobIds.map(() => '?').join(',');
    const recRows  = db.prepare(`SELECT amount, credit_debit FROM payments_received WHERE job_id IN (${placeholders})`).all(...jobIds);
    const paidRows = db.prepare(`SELECT amount, credit_debit FROM payments_made WHERE job_id IN (${placeholders})`).all(...jobIds);
    const totalIn  = recRows.reduce((s, r) => s + ((r.credit_debit === 'debit' ? -1 : 1) * (Number(r.amount) || 0)), 0);
    const totalOut = paidRows.reduce((s, r) => s + ((r.credit_debit === 'credit' ? -1 : 1) * (Number(r.amount) || 0)), 0);
    paymentSummary = { total_received: totalIn, total_paid_out: totalOut, balance: totalIn - totalOut };
  }

  res.json({ contact, jobs, documents, paymentSummary });
});

// DELETE a contact document
router.delete('/:id/documents/:docId', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM contact_documents WHERE id = ? AND contact_id = ?').get(req.params.docId, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (doc.file_path && fs.existsSync(doc.file_path)) {
    try { fs.unlinkSync(doc.file_path); } catch {}
  }
  db.prepare('DELETE FROM contact_documents WHERE id = ?').run(doc.id);
  res.json({ success: true });
});

// POST create contact manually
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { name, email, phone, address, city, state, zip, customer_type, notes } = req.body;
  if (!name && !email) return res.status(400).json({ error: 'Name or email is required' });

  // Auto-assign pb_customer_number
  let pbCustomerNumber = null;
  try {
    const counter = db.prepare('SELECT next_seq FROM pb_customer_counter WHERE id = 1').get();
    const seq = counter ? counter.next_seq : 1;
    pbCustomerNumber = 'PB-C-' + String(seq).padStart(4, '0');
    db.prepare('UPDATE pb_customer_counter SET next_seq = ? WHERE id = 1').run(seq + 1);
  } catch (e) { console.warn('[Contact] pb_customer_number gen failed:', e.message); }

  const result = db.prepare(
    `INSERT INTO contacts (name, email, phone, address, city, state, zip, customer_type, notes, source, pb_customer_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`
  ).run(name||null, email||null, phone||null, address||null, city||null, state||null, zip||null, customer_type||'residential', notes||null, pbCustomerNumber);
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
  res.json({ success: true, id: result.lastInsertRowid, contact });
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
