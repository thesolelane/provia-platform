// server/routes/vendors.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');

const UPLOAD_DIR = path.join(__dirname, '../uploads/vendor-docs');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DOC_TYPES = ['workers_comp', 'general_liability', 'other'];

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
      '(company_name LIKE ? OR trade LIKE ? OR phone LIKE ? OR email LIKE ? OR address LIKE ? OR city LIKE ? OR license_number LIKE ?)',
    );
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s, s);
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
    email,
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
      `INSERT INTO vendors (company_name, type, trade, phone, email, website, address, city, state, zip, license_number, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      company_name.trim(),
      type === 'vendor' ? 'vendor' : 'subcontractor',
      trade || null,
      phone || null,
      email || null,
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
    email,
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
        company_name = ?, type = ?, trade = ?, phone = ?, email = ?, website = ?, address = ?,
        city = ?, state = ?, zip = ?, license_number = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(
      company_name.trim(),
      type === 'vendor' ? 'vendor' : 'subcontractor',
      trade || null,
      phone || null,
      email || null,
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

// DELETE /api/vendors/:id — soft delete (set active=0)
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const info = db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Vendor not found' });
  res.json({ success: true });
});

// ── Documents ──────────────────────────────────────────────────────────────────

// GET /api/vendors/:id/documents — list docs for a vendor
router.get('/:id/documents', requireAuth, (req, res) => {
  const db = getDb();
  const docs = db
    .prepare(
      `SELECT id, vendor_id, doc_type, original_name, uploaded_at
       FROM vendor_documents WHERE vendor_id = ? ORDER BY doc_type, uploaded_at DESC`,
    )
    .all(req.params.id);
  res.json(docs);
});

// POST /api/vendors/:id/documents — upload a document
router.post('/:id/documents', requireAuth, (req, res) => {
  if (!req.files || !req.files.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const doc_type = DOC_TYPES.includes(req.body.doc_type) ? req.body.doc_type : 'other';
  const file = req.files.file;
  const ext = path.extname(file.name) || '';
  const stored_name = `vendor-${req.params.id}-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const dest = path.join(UPLOAD_DIR, stored_name);

  file.mv(dest, (err) => {
    if (err) {
      console.error('[vendors] file upload error:', err);
      return res.status(500).json({ error: 'File save failed' });
    }
    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO vendor_documents (vendor_id, doc_type, original_name, stored_name) VALUES (?, ?, ?, ?)`,
      )
      .run(req.params.id, doc_type, file.name, stored_name);
    const doc = db
      .prepare(
        `SELECT id, vendor_id, doc_type, original_name, uploaded_at FROM vendor_documents WHERE id = ?`,
      )
      .get(result.lastInsertRowid);
    res.json({ success: true, doc });
  });
});

// DELETE /api/vendors/:id/documents/:docId — remove a document
router.delete('/:id/documents/:docId', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db
    .prepare(`SELECT stored_name FROM vendor_documents WHERE id = ? AND vendor_id = ?`)
    .get(req.params.docId, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  db.prepare(`DELETE FROM vendor_documents WHERE id = ?`).run(req.params.docId);
  const filePath = path.join(UPLOAD_DIR, doc.stored_name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true });
});

// GET /api/vendors/:id/documents/:docId/file — serve/download a document
router.get('/:id/documents/:docId/file', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db
    .prepare(
      `SELECT stored_name, original_name FROM vendor_documents WHERE id = ? AND vendor_id = ?`,
    )
    .get(req.params.docId, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const filePath = path.join(UPLOAD_DIR, doc.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
  res.download(filePath, doc.original_name);
});

module.exports = router;
