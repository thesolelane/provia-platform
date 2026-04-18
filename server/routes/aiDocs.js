const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const UPLOAD_ROOT = path.join(__dirname, '../../uploads');

// ── GET /api/ai/entity-search?q=text ────────────────────────────────────────
// Search both contacts and leads by name / address / phone
router.get('/entity-search', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;

    let contacts, leads;
    if (q.length > 0) {
      contacts = db
        .prepare(
          `SELECT 'contact' AS entity_type, id, name, NULL AS stage,
                  address AS detail, city
           FROM contacts
           WHERE name LIKE ? OR address LIKE ? OR phone LIKE ? OR email LIKE ?
           ORDER BY id DESC LIMIT 8`,
        )
        .all(like, like, like, like);
      leads = db
        .prepare(
          `SELECT 'lead' AS entity_type, id, caller_name AS name, stage,
                  job_address AS detail, job_city AS city
           FROM leads
           WHERE (caller_name LIKE ? OR job_address LIKE ? OR caller_phone LIKE ?)
             AND archived = 0
           ORDER BY created_at DESC LIMIT 8`,
        )
        .all(like, like, like);
    } else {
      contacts = db
        .prepare(
          `SELECT 'contact' AS entity_type, id, name, NULL AS stage,
                  address AS detail, city
           FROM contacts ORDER BY id DESC LIMIT 6`,
        )
        .all();
      leads = db
        .prepare(
          `SELECT 'lead' AS entity_type, id, caller_name AS name, stage,
                  job_address AS detail, job_city AS city
           FROM leads WHERE archived = 0 ORDER BY created_at DESC LIMIT 6`,
        )
        .all();
    }

    res.json({ results: [...contacts, ...leads] });
  } catch (err) {
    console.error('[entity-search]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/ai/entity-docs?type=lead|contact&id=X ──────────────────────────
// List all documents and photos for a given lead or contact
router.get('/entity-docs', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { type, id } = req.query;
    const docs = [];

    if (type === 'lead') {
      db.prepare(
        `SELECT id, filename, original_name, mime_type, file_size
         FROM lead_documents WHERE lead_id = ? ORDER BY rowid DESC`,
      )
        .all(id)
        .forEach((d) =>
          docs.push({
            id: `ld_${d.id}`,
            name: d.original_name || d.filename,
            filename: d.filename,
            mime_type: d.mime_type || 'application/octet-stream',
            file_size: d.file_size,
            source_table: 'lead_documents',
            relative_path: path.join('lead_docs', String(id), d.filename),
          }),
        );

      db.prepare(
        `SELECT id, filename, original_name, location_label
         FROM field_photos WHERE lead_id = ? ORDER BY created_at DESC`,
      )
        .all(id)
        .forEach((p) =>
          docs.push({
            id: `fp_${p.id}`,
            name: p.original_name || p.location_label || p.filename,
            filename: p.filename,
            mime_type: 'image/jpeg',
            file_size: null,
            source_table: 'field_photos',
            relative_path: path.join('field_photos', p.filename),
          }),
        );
    } else if (type === 'contact') {
      db.prepare(
        `SELECT id, filename, original_name, mime_type, file_size
         FROM contact_documents WHERE contact_id = ? ORDER BY rowid DESC`,
      )
        .all(id)
        .forEach((d) =>
          docs.push({
            id: `cd_${d.id}`,
            name: d.original_name || d.filename,
            filename: d.filename,
            mime_type: d.mime_type || 'application/octet-stream',
            file_size: d.file_size,
            source_table: 'contact_documents',
            relative_path: path.join('contact_docs', String(id), d.filename),
          }),
        );
    }

    res.json({ docs });
  } catch (err) {
    console.error('[entity-docs]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ai/inject-docs ─────────────────────────────────────────────────
// Extract text / vision content from selected stored files
router.post('/inject-docs', requireAuth, async (req, res) => {
  const { docs } = req.body || {};
  if (!docs || !docs.length) return res.status(400).json({ error: 'No docs selected' });

  const pdfParse = require('pdf-parse');
  const Anthropic = require('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const VALID_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const extractedParts = [];

  for (const doc of docs) {
    const filePath = path.join(UPLOAD_ROOT, doc.relative_path);
    if (!fs.existsSync(filePath)) {
      extractedParts.push(`[File not found on server: ${doc.name}]`);
      continue;
    }
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const mime = (doc.mime_type || '').toLowerCase();
      const normalizedMime = mime === 'image/jpg' ? 'image/jpeg' : mime;

      if (mime === 'application/pdf') {
        const parsed = await pdfParse(fileBuffer);
        const text = parsed.text.trim();
        if (text.length > 20) {
          extractedParts.push(`[From PDF: ${doc.name}]\n${text.slice(0, 6000)}`);
        } else {
          extractedParts.push(
            `[PDF "${doc.name}" has no text layer — it may be a scanned image-only PDF]`,
          );
        }
      } else if (VALID_IMAGE_MIMES.includes(normalizedMime)) {
        const base64 = fileBuffer.toString('base64');
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-20250514',
          max_tokens: 1500,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: normalizedMime, data: base64 },
                },
                {
                  type: 'text',
                  text: 'This is a construction document, blueprint, floor plan, or site photo. Extract and describe all technical details: dimensions, room names, materials, scope of work, measurements, addresses visible, annotations, and specifications. Be thorough and precise.',
                },
              ],
            },
          ],
        });
        const extracted = response.content[0].text.trim();
        if (extracted.length > 10) {
          extractedParts.push(`[From Image: ${doc.name}]\n${extracted}`);
        }
      } else {
        extractedParts.push(`[Cannot extract "${doc.name}" — unsupported type: ${mime}]`);
      }
    } catch (err) {
      console.error(`[inject-docs] Failed on ${doc.name}:`, err.message);
      extractedParts.push(`[Could not read: ${doc.name} — ${err.message}]`);
    }
  }

  if (!extractedParts.length) {
    return res.status(400).json({ error: 'No readable content found in selected files.' });
  }

  res.json({ extractedText: extractedParts.join('\n\n'), count: docs.length });
});

module.exports = router;
