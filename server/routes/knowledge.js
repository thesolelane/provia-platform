// server/routes/knowledge.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');
const { requireFields } = require('../middleware/validate');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// GET all knowledge base docs
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { category } = req.query;
  let query = 'SELECT id, title, category, language, active, created_at FROM knowledge_base';
  const params = [];
  if (category) {
    query += ' WHERE category = ?';
    params.push(category);
  }
  query += ' ORDER BY category, title';
  const docs = db.prepare(query).all(...params);
  res.json(docs);
});

// GET single doc with content
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json(doc);
});

// POST add text document
router.post('/', requireAuth, requireFields(['title', 'category', 'content']), (req, res) => {
  const db = getDb();
  const { title, category, content, language = 'en' } = req.body;
  const result = db
    .prepare('INSERT INTO knowledge_base (title, category, content, language) VALUES (?, ?, ?, ?)')
    .run(title, category, content, language);
  res.json({ success: true, id: result.lastInsertRowid });
});

// POST upload PDF invoice/contract to learn from
router.post('/upload', requireAuth, async (req, res) => {
  if (!req.files?.document) return res.status(400).json({ error: 'No file uploaded' });

  const file = req.files.document;
  const { title, category = 'past_contracts' } = req.body;

  try {
    let content = '';

    if (file.mimetype === 'application/pdf') {
      const fileBuffer = file.tempFilePath ? fs.readFileSync(file.tempFilePath) : file.data;
      const data = await pdfParse(fileBuffer);
      content = data.text;
    } else if (file.mimetype.startsWith('text/')) {
      content = file.tempFilePath
        ? fs.readFileSync(file.tempFilePath, 'utf8')
        : file.data.toString('utf8');
    } else {
      return res.status(400).json({ error: 'Only PDF and text files supported' });
    }

    // Save file
    const filename = `${Date.now()}_${file.name}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    await file.mv(filePath);

    const db = getDb();
    const result = db
      .prepare(
        'INSERT INTO knowledge_base (title, category, content, file_path, language) VALUES (?, ?, ?, ?, ?)',
      )
      .run(title || file.name, category, content, filePath, 'en');

    res.json({
      success: true,
      id: result.lastInsertRowid,
      message: `Document uploaded and added to knowledge base. ${content.length} characters extracted.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update document
router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { title, category, content, active } = req.body;
  if (title === undefined && category === undefined && content === undefined) {
    return res
      .status(400)
      .json({ error: 'At least one of title, category, or content is required' });
  }
  db.prepare(
    'UPDATE knowledge_base SET title = COALESCE(?, title), category = COALESCE(?, category), content = COALESCE(?, content), active = COALESCE(?, active) WHERE id = ?',
  ).run(title, category, content, active, req.params.id);
  res.json({ success: true });
});

// DELETE document
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM knowledge_base WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET categories list
router.get('/meta/categories', requireAuth, (req, res) => {
  res.json([
    { value: 'codes', label: 'Building Codes & Regulations' },
    { value: 'scope-templates', label: 'Scope of Work Templates' },
    { value: 'legal', label: 'Legal Requirements' },
    { value: 'pricing', label: 'Pricing Reference' },
    { value: 'past_contracts', label: 'Past Contracts (for learning)' },
    { value: 'faqs', label: 'Customer FAQs' },
  ]);
});

module.exports = router;
