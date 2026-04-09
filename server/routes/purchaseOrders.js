// server/routes/purchaseOrders.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');

// ── Period helper (shared with reports) ──────────────────────────────────────
function dateFrom(period) {
  if (!period || period === 'all') return null;
  const now = new Date();
  const yr = now.getFullYear();
  const mo = now.getMonth();
  if (period === 'mtd') return `${yr}-${String(mo + 1).padStart(2, '0')}-01`;
  if (period === 'qtd') {
    const q = Math.floor(mo / 3);
    return `${yr}-${String(q * 3 + 1).padStart(2, '0')}-01`;
  }
  if (period === 'ytd') return `${yr}-01-01`;
  if (period === '12mo') {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// GET /api/purchase-orders?job_id=xxx
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { job_id } = req.query;
  let sql = `
    SELECT po.*, v.company_name AS vendor_company
    FROM purchase_orders po
    LEFT JOIN vendors v ON v.id = po.vendor_id
  `;
  const params = [];
  if (job_id) {
    sql += ' WHERE po.job_id = ?';
    params.push(job_id);
  }
  sql += ' ORDER BY po.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({ purchase_orders: rows });
});

// GET /api/purchase-orders/report?period=ytd
router.get('/report', requireAuth, (req, res) => {
  const db = getDb();
  const { period } = req.query;
  const from = dateFrom(period);
  const dFilter = from ? `AND po.created_at >= '${from}'` : '';

  const totals = db.prepare(`
    SELECT
      COUNT(*) AS count,
      SUM(CASE WHEN po.status != 'cancelled' THEN po.amount ELSE 0 END) AS total_spend,
      SUM(CASE WHEN po.status = 'paid'       THEN po.amount ELSE 0 END) AS paid,
      SUM(CASE WHEN po.status = 'approved'   THEN po.amount ELSE 0 END) AS approved,
      SUM(CASE WHEN po.status = 'pending'    THEN po.amount ELSE 0 END) AS pending,
      SUM(CASE WHEN po.status = 'cancelled'  THEN po.amount ELSE 0 END) AS cancelled
    FROM purchase_orders po
    WHERE 1=1 ${dFilter}
  `).get();

  const byCategory = db.prepare(`
    SELECT po.category, COUNT(*) AS count, SUM(po.amount) AS total
    FROM purchase_orders po
    WHERE po.status != 'cancelled' ${dFilter}
    GROUP BY po.category
    ORDER BY total DESC
  `).all();

  const byJob = db.prepare(`
    SELECT po.job_id, j.pb_number, j.customer_name, j.project_address,
           COUNT(*) AS po_count,
           SUM(po.amount) AS po_total
    FROM purchase_orders po
    LEFT JOIN jobs j ON j.id = po.job_id
    WHERE po.status != 'cancelled' ${dFilter}
    GROUP BY po.job_id
    ORDER BY po_total DESC
    LIMIT 20
  `).all();

  const byStatus = db.prepare(`
    SELECT po.status, COUNT(*) AS count, SUM(po.amount) AS total
    FROM purchase_orders po
    WHERE 1=1 ${dFilter}
    GROUP BY po.status
    ORDER BY total DESC
  `).all();

  const recent = db.prepare(`
    SELECT po.*, j.pb_number, j.customer_name, j.project_address
    FROM purchase_orders po
    LEFT JOIN jobs j ON j.id = po.job_id
    WHERE 1=1 ${dFilter}
    ORDER BY po.created_at DESC
    LIMIT 50
  `).all();

  res.json({ totals, byCategory, byJob, byStatus, recent });
});

// POST /api/purchase-orders
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { job_id, vendor_id, vendor_name, description, category, amount, status, issued_date, notes } = req.body;
  if (!job_id || !job_id.trim()) return res.status(400).json({ error: 'job_id is required' });
  if (!description || !description.trim()) return res.status(400).json({ error: 'description is required' });

  let poNumber = 'PO-0001';
  try {
    const counter = db.prepare('SELECT next_seq FROM po_counter WHERE id = 1').get();
    const seq = counter ? counter.next_seq : 1;
    poNumber = 'PO-' + String(seq).padStart(4, '0');
    db.prepare('UPDATE po_counter SET next_seq = ? WHERE id = 1').run(seq + 1);
  } catch (e) {
    console.warn('[PO] po_number gen failed:', e.message);
  }

  const result = db.prepare(`
    INSERT INTO purchase_orders
      (po_number, job_id, vendor_id, vendor_name, description, category, amount, status, issued_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    poNumber,
    job_id.trim(),
    vendor_id || null,
    vendor_name || null,
    description.trim(),
    category || 'materials',
    Number(amount) || 0,
    status || 'pending',
    issued_date || null,
    notes || null
  );

  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(result.lastInsertRowid);
  res.json({ success: true, purchase_order: po });
});

// PATCH /api/purchase-orders/:id
router.patch('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM purchase_orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Purchase order not found' });

  const { vendor_id, vendor_name, description, category, amount, status, issued_date, notes } = req.body;

  db.prepare(`
    UPDATE purchase_orders SET
      vendor_id = ?, vendor_name = ?, description = ?, category = ?,
      amount = ?, status = ?, issued_date = ?, notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    vendor_id !== undefined ? (vendor_id || null) : null,
    vendor_name !== undefined ? (vendor_name || null) : null,
    description || null,
    category || 'materials',
    Number(amount) || 0,
    status || 'pending',
    issued_date || null,
    notes || null,
    req.params.id
  );

  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
  res.json({ success: true, purchase_order: po });
});

// DELETE /api/purchase-orders/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM purchase_orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
  db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
