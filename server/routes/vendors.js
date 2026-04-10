// server/routes/vendors.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');

// GET /api/vendors — list all, optional ?type=subcontractor|vendor, ?search=
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { type, search } = req.query;
  const conditions = ['active = 1'];
  const params = [];

  if (type && (type === 'subcontractor' || type === 'vendor')) {
    conditions.push('type = ?');
    params.push(type);
  }

  if (search) {
    conditions.push(
      '(company_name LIKE ? OR trade LIKE ? OR phone LIKE ? OR address LIKE ? OR city LIKE ? OR license_number LIKE ?)',
    );
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const vendors = db
    .prepare(`SELECT * FROM vendors ${where} ORDER BY company_name ASC`)
    .all(...params);
  res.json({ vendors, total: vendors.length });
});

// POST /api/vendors — create
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const {
    company_name,
    type,
    trade,
    phone,
    website,
    address,
    city,
    state,
    zip,
    license_number,
    notes,
  } = req.body;
  if (!company_name || !company_name.trim()) {
    return res.status(400).json({ error: 'Company name is required' });
  }
  const result = db
    .prepare(
      `INSERT INTO vendors (company_name, type, trade, phone, website, address, city, state, zip, license_number, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      company_name.trim(),
      type === 'vendor' ? 'vendor' : 'subcontractor',
      trade || null,
      phone || null,
      website || null,
      address || null,
      city || null,
      state || null,
      zip || null,
      license_number || null,
      notes || null,
    );
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(result.lastInsertRowid);
  res.json({ success: true, id: result.lastInsertRowid, vendor });
});

// PUT /api/vendors/:id — update
router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const {
    company_name,
    type,
    trade,
    phone,
    website,
    address,
    city,
    state,
    zip,
    license_number,
    notes,
  } = req.body;
  if (!company_name || !company_name.trim()) {
    return res.status(400).json({ error: 'Company name is required' });
  }
  const info = db
    .prepare(
      `UPDATE vendors SET
        company_name = ?, type = ?, trade = ?, phone = ?, website = ?, address = ?,
        city = ?, state = ?, zip = ?, license_number = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(
      company_name.trim(),
      type === 'vendor' ? 'vendor' : 'subcontractor',
      trade || null,
      phone || null,
      website || null,
      address || null,
      city || null,
      state || null,
      zip || null,
      license_number || null,
      notes || null,
      req.params.id,
    );
  if (info.changes === 0) return res.status(404).json({ error: 'Vendor not found' });
  res.json({ success: true });
});

// DELETE /api/vendors/:id — hard delete
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const info = db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Vendor not found' });
  res.json({ success: true });
});

module.exports = router;
