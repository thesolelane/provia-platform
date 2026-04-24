// server/routes/plus.js
// Provia+ — Job Execution Module
// Gated by PROVIA_PLUS=true env var.
// Covers: job sections, inspection stages, permit documents, job bids, time entries.

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ── Gate middleware ───────────────────────────────────────────────────────────

function requirePlus(req, res, next) {
  if (process.env.PROVIA_PLUS !== 'true') {
    return res.status(403).json({ error: 'Provia+ not enabled for this deployment.' });
  }
  next();
}

router.use(requirePlus);

// ── Permit document upload storage ───────────────────────────────────────────

const permitUploadDir = path.join(__dirname, '../../uploads/permits');
if (!fs.existsSync(permitUploadDir)) fs.mkdirSync(permitUploadDir, { recursive: true });

const permitStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, permitUploadDir),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `permit_${ts}${ext}`);
  },
});
const permitUpload = multer({ storage: permitStorage, limits: { fileSize: 20 * 1024 * 1024 } });

// ═══════════════════════════════════════════════════════════════════════════════
// JOB SECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/plus/jobs/:jobId/sections
router.get('/jobs/:jobId/sections', (req, res) => {
  try {
    const db = getDb();
    const sections = db.prepare(`
      SELECT s.*,
             v.company_name AS vendor_company,
             u.name         AS responsible_user_name
      FROM   job_sections s
      LEFT JOIN vendors v ON v.id = s.vendor_id
      LEFT JOIN users  u ON u.id = s.responsible_user_id
      WHERE  s.job_id = ? AND s.is_deleted = 0
      ORDER  BY s.sort_order, s.id
    `).all(req.params.jobId);

    // Attach inspection stages + bids to each section
    const stmtInspections = db.prepare(
      'SELECT * FROM inspection_stages WHERE job_section_id = ? ORDER BY id'
    );
    const stmtBids = db.prepare(
      "SELECT * FROM job_bids WHERE job_section_id = ? AND status != 'withdrawn' ORDER BY id"
    );

    for (const s of sections) {
      s.inspections = stmtInspections.all(s.id);
      s.bids = stmtBids.all(s.id);
    }

    res.json(sections);
  } catch (e) {
    console.error('[Plus] GET sections:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/plus/jobs/:jobId/sections
router.post('/jobs/:jobId/sections', (req, res) => {
  try {
    const db = getDb();
    const { title, section_type, description, sort_order, requires_inspection, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const maxOrder = db.prepare(
      'SELECT COALESCE(MAX(sort_order),0) AS m FROM job_sections WHERE job_id = ? AND is_deleted = 0'
    ).get(req.params.jobId);

    const info = db.prepare(`
      INSERT INTO job_sections
        (job_id, title, section_type, description, sort_order, requires_inspection, notes)
      VALUES (?,?,?,?,?,?,?)
    `).run(
      req.params.jobId,
      title,
      section_type || 'general',
      description || null,
      sort_order ?? (maxOrder.m + 1),
      requires_inspection ? 1 : 0,
      notes || null,
    );

    const section = db.prepare('SELECT * FROM job_sections WHERE id = ?').get(info.lastInsertRowid);
    res.json(section);
  } catch (e) {
    console.error('[Plus] POST section:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/plus/sections/:id
router.patch('/sections/:id', (req, res) => {
  try {
    const db = getDb();
    const allowed = [
      'title','section_type','description','status','sort_order',
      'start_date','completion_date','is_subcontracted','vendor_id','vendor_name',
      'responsible_user_id','materials_ordered','materials_delivered',
      'requires_inspection','notes',
    ];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });

    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    db.prepare(`UPDATE job_sections SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...vals, req.params.id);

    const section = db.prepare('SELECT * FROM job_sections WHERE id = ?').get(req.params.id);
    res.json(section);
  } catch (e) {
    console.error('[Plus] PATCH section:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/plus/sections/:id  (soft delete)
router.delete('/sections/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE job_sections SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// JOB EXECUTION STATUS
// ═══════════════════════════════════════════════════════════════════════════════

const EXEC_STATUSES = [
  'active','permits_pending','in_progress','inspection_pending','completed','closed',
];

// PATCH /api/plus/jobs/:jobId/execution-status
router.patch('/jobs/:jobId/execution-status', (req, res) => {
  try {
    const { status } = req.body;
    if (!EXEC_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${EXEC_STATUSES.join(', ')}` });
    }
    const db = getDb();
    const extra = status === 'active'
      ? ', execution_started_at = COALESCE(execution_started_at, CURRENT_TIMESTAMP)'
      : status === 'completed' || status === 'closed'
      ? ', execution_completed_at = CURRENT_TIMESTAMP'
      : '';
    db.prepare(`
      UPDATE jobs SET execution_status = ?, updated_at = CURRENT_TIMESTAMP${extra} WHERE id = ?
    `).run(status, req.params.jobId);
    res.json({ ok: true, status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// JOB ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/plus/jobs/:jobId/assignments
router.get('/jobs/:jobId/assignments', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT a.*, u.name, u.email, u.role AS user_role, u.title
      FROM job_assignments a
      JOIN users u ON u.id = a.user_id
      WHERE a.job_id = ?
      ORDER BY a.assigned_at
    `).all(req.params.jobId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/plus/jobs/:jobId/assignments
router.post('/jobs/:jobId/assignments', (req, res) => {
  try {
    const { user_id, role } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const db = getDb();
    db.prepare(`
      INSERT OR IGNORE INTO job_assignments (job_id, user_id, role) VALUES (?,?,?)
    `).run(req.params.jobId, user_id, role || 'crew');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/plus/jobs/:jobId/assignments/:userId
router.delete('/jobs/:jobId/assignments/:userId', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM job_assignments WHERE job_id = ? AND user_id = ?')
      .run(req.params.jobId, req.params.userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INSPECTION STAGES
// ═══════════════════════════════════════════════════════════════════════════════

const INSPECTION_STAGES = ['ROUGH', 'SECOND', 'FINISH', 'FINAL'];
const INSPECTION_STATUSES = ['PENDING', 'SCHEDULED', 'PASSED', 'FAILED'];

// POST /api/plus/sections/:sectionId/inspections
router.post('/sections/:sectionId/inspections', (req, res) => {
  try {
    const db = getDb();
    const section = db.prepare('SELECT * FROM job_sections WHERE id = ?').get(req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });

    const { stage, inspection_date, inspector_name, notes, checklist } = req.body;
    if (!INSPECTION_STAGES.includes(stage)) {
      return res.status(400).json({ error: `stage must be one of: ${INSPECTION_STAGES.join(', ')}` });
    }

    const info = db.prepare(`
      INSERT INTO inspection_stages
        (job_id, job_section_id, stage, inspection_date, inspector_name, notes, checklist)
      VALUES (?,?,?,?,?,?,?)
    `).run(
      section.job_id, req.params.sectionId, stage,
      inspection_date || null, inspector_name || null,
      notes || null, checklist || null,
    );

    const row = db.prepare('SELECT * FROM inspection_stages WHERE id = ?').get(info.lastInsertRowid);
    res.json(row);
  } catch (e) {
    console.error('[Plus] POST inspection:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/plus/inspections/:id
router.patch('/inspections/:id', (req, res) => {
  try {
    const db = getDb();
    const { status, passed, inspection_date, inspector_name, notes, checklist } = req.body;

    if (status && !INSPECTION_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${INSPECTION_STATUSES.join(', ')}` });
    }

    const allowed = { status, passed, inspection_date, inspector_name, notes, checklist };
    const fields = Object.keys(allowed).filter(k => allowed[k] !== undefined);
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });

    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => allowed[f]);
    db.prepare(`UPDATE inspection_stages SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...vals, req.params.id);

    const row = db.prepare('SELECT * FROM inspection_stages WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERMIT DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/plus/jobs/:jobId/permits
router.get('/jobs/:jobId/permits', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(
      'SELECT * FROM permit_documents WHERE job_id = ? ORDER BY created_at DESC'
    ).all(req.params.jobId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/plus/jobs/:jobId/permits  (with optional file upload)
router.post('/jobs/:jobId/permits', permitUpload.single('file'), (req, res) => {
  try {
    const db = getDb();
    const { permit_type, permit_number, job_section_id, issued_date, expiry_date, uploaded_by } = req.body;
    if (!permit_type) return res.status(400).json({ error: 'permit_type required' });

    const info = db.prepare(`
      INSERT INTO permit_documents
        (job_id, job_section_id, permit_type, permit_number, filename, original_name,
         file_path, issued_date, expiry_date, uploaded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      req.params.jobId,
      job_section_id || null,
      permit_type,
      permit_number || null,
      req.file?.filename || null,
      req.file?.originalname || null,
      req.file ? `/uploads/permits/${req.file.filename}` : null,
      issued_date || null,
      expiry_date || null,
      uploaded_by || null,
    );

    const row = db.prepare('SELECT * FROM permit_documents WHERE id = ?').get(info.lastInsertRowid);
    res.json(row);
  } catch (e) {
    console.error('[Plus] POST permit:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/plus/permits/:id
router.patch('/permits/:id', (req, res) => {
  try {
    const db = getDb();
    const allowed = ['permit_number','status','issued_date','expiry_date','review_notes','reviewed_by'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });

    const extra = req.body.reviewed_by ? ', reviewed_at = CURRENT_TIMESTAMP' : '';
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    db.prepare(`UPDATE permit_documents SET ${sets}${extra}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...vals, req.params.id);

    const row = db.prepare('SELECT * FROM permit_documents WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// JOB BIDS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/plus/jobs/:jobId/bids
router.get('/jobs/:jobId/bids', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT b.*, s.title AS section_title
      FROM job_bids b
      LEFT JOIN job_sections s ON s.id = b.job_section_id
      WHERE b.job_id = ?
      ORDER BY b.created_at DESC
    `).all(req.params.jobId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/plus/jobs/:jobId/bids
router.post('/jobs/:jobId/bids', (req, res) => {
  try {
    const db = getDb();
    const { vendor_id, vendor_name, job_section_id, bid_amount, bid_description } = req.body;
    if (!vendor_name || !bid_amount) {
      return res.status(400).json({ error: 'vendor_name and bid_amount required' });
    }
    const info = db.prepare(`
      INSERT INTO job_bids (job_id, job_section_id, vendor_id, vendor_name, bid_amount, bid_description)
      VALUES (?,?,?,?,?,?)
    `).run(
      req.params.jobId,
      job_section_id || null,
      vendor_id || null,
      vendor_name,
      bid_amount,
      bid_description || null,
    );
    const row = db.prepare('SELECT * FROM job_bids WHERE id = ?').get(info.lastInsertRowid);
    res.json(row);
  } catch (e) {
    console.error('[Plus] POST bid:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/plus/bids/:id/accept
router.post('/bids/:id/accept', (req, res) => {
  try {
    const db = getDb();
    const bid = db.prepare('SELECT * FROM job_bids WHERE id = ?').get(req.params.id);
    if (!bid) return res.status(404).json({ error: 'Bid not found' });
    if (bid.status !== 'pending') return res.status(400).json({ error: 'Bid is not pending' });

    const { payment_method, advance_pct, accepted_by } = req.body;
    const pct = Math.min(100, Math.max(0, parseFloat(advance_pct ?? 50)));
    const advance = parseFloat((bid.bid_amount * pct / 100).toFixed(2));
    const remaining = parseFloat((bid.bid_amount - advance).toFixed(2));

    db.prepare(`
      UPDATE job_bids SET
        status = 'accepted', payment_method = ?, advance_pct = ?, advance_amount = ?,
        remaining_amount = ?, accepted_by = ?, accepted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(payment_method || null, pct, advance, remaining, accepted_by || null, req.params.id);

    const row = db.prepare('SELECT * FROM job_bids WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/plus/bids/:id/advance-paid
router.post('/bids/:id/advance-paid', (req, res) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE job_bids SET advance_paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'accepted'
    `).run(req.params.id);
    const row = db.prepare('SELECT * FROM job_bids WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/plus/bids/:id/approve  (supervisor approves completed work)
router.post('/bids/:id/approve', (req, res) => {
  try {
    const db = getDb();
    const { supervisor_notes, inspection_passed, approved_by } = req.body;
    db.prepare(`
      UPDATE job_bids SET
        supervisor_approved = 1, supervisor_approved_by = ?,
        supervisor_approved_at = CURRENT_TIMESTAMP,
        supervisor_notes = ?, inspection_passed = ?,
        work_completed_at = COALESCE(work_completed_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(approved_by || null, supervisor_notes || null, inspection_passed ? 1 : 0, req.params.id);
    const row = db.prepare('SELECT * FROM job_bids WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/plus/bids/:id/final-paid  (releases remaining balance)
router.post('/bids/:id/final-paid', (req, res) => {
  try {
    const db = getDb();
    const bid = db.prepare('SELECT * FROM job_bids WHERE id = ?').get(req.params.id);
    if (!bid) return res.status(404).json({ error: 'Bid not found' });
    if (!bid.supervisor_approved) return res.status(400).json({ error: 'Supervisor approval required before final payment' });

    db.prepare(`
      UPDATE job_bids SET
        final_paid_at = CURRENT_TIMESTAMP, status = 'completed',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.params.id);
    const row = db.prepare('SELECT * FROM job_bids WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/plus/bids/:id
router.patch('/bids/:id', (req, res) => {
  try {
    const db = getDb();
    const allowed = ['status','bid_amount','bid_description','payment_method','supervisor_notes'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    db.prepare(`UPDATE job_bids SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...vals, req.params.id);
    const row = db.prepare('SELECT * FROM job_bids WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TIME ENTRIES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/plus/jobs/:jobId/time
router.get('/jobs/:jobId/time', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT t.*, s.title AS section_title
      FROM time_entries t
      LEFT JOIN job_sections s ON s.id = t.job_section_id
      WHERE t.job_id = ?
      ORDER BY t.clock_in DESC
    `).all(req.params.jobId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/plus/jobs/:jobId/time/clock-in
router.post('/jobs/:jobId/time/clock-in', (req, res) => {
  try {
    const db = getDb();
    const { user_id, user_name, job_section_id, notes } = req.body;
    if (!user_name) return res.status(400).json({ error: 'user_name required' });

    // Prevent double clock-in
    if (user_id) {
      const open = db.prepare(
        'SELECT id FROM time_entries WHERE job_id = ? AND user_id = ? AND clock_out IS NULL'
      ).get(req.params.jobId, user_id);
      if (open) return res.status(400).json({ error: 'Already clocked in on this job' });
    }

    const info = db.prepare(`
      INSERT INTO time_entries (job_id, job_section_id, user_id, user_name, clock_in, notes)
      VALUES (?,?,?,?,CURRENT_TIMESTAMP,?)
    `).run(req.params.jobId, job_section_id || null, user_id || null, user_name, notes || null);

    const row = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(info.lastInsertRowid);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/plus/time/:id/clock-out
router.post('/time/:id/clock-out', (req, res) => {
  try {
    const db = getDb();
    const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    if (entry.clock_out) return res.status(400).json({ error: 'Already clocked out' });

    const clockIn = new Date(entry.clock_in);
    const clockOut = new Date();
    const duration = Math.round((clockOut - clockIn) / 60000);

    db.prepare(`
      UPDATE time_entries SET clock_out = CURRENT_TIMESTAMP, duration_minutes = ? WHERE id = ?
    `).run(duration, req.params.id);

    const row = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/plus/jobs/:jobId/time/summary
router.get('/jobs/:jobId/time/summary', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT user_name,
             COUNT(*) AS sessions,
             SUM(COALESCE(duration_minutes, 0)) AS total_minutes
      FROM time_entries
      WHERE job_id = ? AND clock_out IS NOT NULL
      GROUP BY user_name
      ORDER BY total_minutes DESC
    `).all(req.params.jobId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
