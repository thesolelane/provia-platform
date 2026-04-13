const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads/field_photos');
const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
];
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── POST /api/field-photos — upload ──────────────────────────────────────────
router.post('/', requireAuth, (req, res) => {
  try {
    if (!req.files?.photo) return res.status(400).json({ error: 'No photo file provided' });

    const file = req.files.photo;
    const ext = path.extname(file.name).toLowerCase() || '.jpg';

    if (!ALLOWED_EXTS.includes(ext))
      return res.status(400).json({ error: 'File type not allowed' });
    if (file.mimetype && !ALLOWED_MIMES.includes(file.mimetype))
      return res.status(400).json({ error: 'Invalid image type' });

    const lead_id_check = req.body.lead_id ? parseInt(req.body.lead_id, 10) : null;
    if (lead_id_check) {
      const db = getDb();
      const count = db
        .prepare('SELECT COUNT(*) as n FROM field_photos WHERE lead_id = ?')
        .get(lead_id_check);
      if (count && count.n >= 15) {
        return res.status(400).json({ error: 'Photo limit reached — maximum 15 photos per lead.' });
      }
    }

    const lat = req.body.lat ? parseFloat(req.body.lat) : null;
    const lon = req.body.lon ? parseFloat(req.body.lon) : null;
    const accuracy = req.body.accuracy ? parseFloat(req.body.accuracy) : null;
    const location_label = req.body.location_label || null;
    const taken_at = req.body.taken_at || new Date().toISOString();
    const uploaded_by = req.user?.name || req.user?.email || null;
    const job_id = req.body.job_id || null;
    const lead_id = req.body.lead_id ? parseInt(req.body.lead_id, 10) : null;

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    file.mv(filePath, (err) => {
      if (err) {
        console.error('Field photo move error:', err);
        return res.status(500).json({ error: 'Failed to save file' });
      }

      const db = getDb();
      const result = db
        .prepare(
          `
        INSERT INTO field_photos (filename, original_name, taken_at, lat, lon, location_label, accuracy, uploaded_by, job_id, lead_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          filename,
          file.name,
          taken_at,
          lat,
          lon,
          location_label,
          accuracy,
          uploaded_by,
          job_id,
          lead_id,
        );

      res.json({
        id: result.lastInsertRowid,
        filename,
        original_name: file.name,
        taken_at,
        lat,
        lon,
        location_label,
        accuracy,
        job_id,
        lead_id,
        uploaded_by,
      });
    });
  } catch (err) {
    console.error('Upload field photo error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/field-photos — list (optional ?lead_id or ?job_id filter) ───────
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    let photos;
    if (req.query.lead_id) {
      photos = db
        .prepare('SELECT * FROM field_photos WHERE lead_id = ? ORDER BY taken_at DESC')
        .all(parseInt(req.query.lead_id, 10));
    } else if (req.query.job_id) {
      photos = db
        .prepare('SELECT * FROM field_photos WHERE job_id = ? ORDER BY taken_at DESC')
        .all(req.query.job_id);
    } else {
      photos = db.prepare('SELECT * FROM field_photos ORDER BY taken_at DESC').all();
    }
    res.json({ photos });
  } catch (err) {
    console.error('Get field photos error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/field-photos/file/:filename ──────────────────────────────────────
router.get('/file/:filename', requireAuth, (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.resolve(UPLOADS_DIR, safeFilename);
  if (!filePath.startsWith(UPLOADS_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});

// ── PATCH /api/field-photos/:id/assign — assign to job OR lead ───────────────
router.patch('/:id/assign', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { job_id, lead_id } = req.body;

    if (!job_id && !lead_id && job_id !== null && lead_id !== null) {
      return res.status(400).json({ error: 'Provide job_id or lead_id' });
    }

    const photo = db.prepare('SELECT * FROM field_photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    // Assign to job
    if (job_id) {
      const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(job_id);
      if (!job) return res.status(404).json({ error: 'Job not found' });

      db.prepare('UPDATE field_photos SET job_id = ?, lead_id = NULL WHERE id = ?').run(
        job_id,
        req.params.id,
      );

      const jobDir = path.resolve(__dirname, '../../uploads/jobs', job_id);
      if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });
      const srcPath = path.join(UPLOADS_DIR, photo.filename);
      const destPath = path.join(jobDir, photo.filename);
      if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) fs.copyFileSync(srcPath, destPath);

      db.prepare(
        `INSERT OR IGNORE INTO job_photos (job_id, filename, original_name, caption) VALUES (?, ?, ?, '')`,
      ).run(job_id, photo.filename, photo.original_name || photo.filename);

      return res.json({ ok: true, job_id, lead_id: null });
    }

    // Assign to lead
    if (lead_id) {
      const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(parseInt(lead_id, 10));
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      db.prepare('UPDATE field_photos SET lead_id = ?, job_id = NULL WHERE id = ?').run(
        parseInt(lead_id, 10),
        req.params.id,
      );
      return res.json({ ok: true, lead_id: parseInt(lead_id, 10), job_id: null });
    }

    // Clear assignment (null both)
    db.prepare('UPDATE field_photos SET job_id = NULL, lead_id = NULL WHERE id = ?').run(
      req.params.id,
    );
    res.json({ ok: true, job_id: null, lead_id: null });
  } catch (err) {
    console.error('Assign field photo error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/field-photos/:id ──────────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const photo = db.prepare('SELECT * FROM field_photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    const filePath = path.join(UPLOADS_DIR, photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM field_photos WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete field photo error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
