const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');
const path = require('path');
const fs = require('fs');

const UPLOADS_BASE = path.join(__dirname, '../../uploads/jobs');

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];

router.get('/:id/photos/file/:filename', requireAuth, (req, res) => {
  const filePath = path.join(UPLOADS_BASE, req.params.id, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

router.get('/:id/photos', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const photos = db.prepare(
      'SELECT * FROM job_photos WHERE job_id = ? ORDER BY uploaded_at DESC'
    ).all(req.params.id);
    res.json({ photos });
  } catch (err) {
    console.error('Get job photos error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/photos', requireAuth, (req, res) => {
  try {
    if (!req.files || !req.files.photo) {
      return res.status(400).json({ error: 'No photo file provided' });
    }

    const db = getDb();
    const jobId = req.params.id;
    const caption = req.body.caption || '';

    const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const jobDir = path.join(UPLOADS_BASE, jobId);
    if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

    const file = req.files.photo;
    const ext = path.extname(file.name).toLowerCase() || '.jpg';

    if (!ALLOWED_EXTS.includes(ext)) {
      return res.status(400).json({ error: 'File type not allowed. Please upload an image file.' });
    }

    if (file.mimetype && !ALLOWED_MIMES.includes(file.mimetype)) {
      return res.status(400).json({ error: 'Invalid image type' });
    }

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = path.join(jobDir, filename);

    file.mv(filePath, (err) => {
      if (err) {
        console.error('File move error:', err);
        return res.status(500).json({ error: 'Failed to save file' });
      }

      const result = db.prepare(
        'INSERT INTO job_photos (job_id, filename, original_name, caption) VALUES (?, ?, ?, ?)'
      ).run(jobId, filename, file.name, caption);

      res.json({
        id: result.lastInsertRowid,
        job_id: jobId,
        filename,
        original_name: file.name,
        caption,
        uploaded_at: new Date().toISOString()
      });
    });
  } catch (err) {
    console.error('Upload job photo error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/photos/:photoId', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const photo = db.prepare(
      'SELECT * FROM job_photos WHERE id = ? AND job_id = ?'
    ).get(req.params.photoId, req.params.id);

    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const filePath = path.join(UPLOADS_BASE, req.params.id, photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.prepare('DELETE FROM job_photos WHERE id = ?').run(req.params.photoId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete job photo error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
