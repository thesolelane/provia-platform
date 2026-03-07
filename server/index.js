// ============================================================
// server/index.js — Main Application Server
// Preferred Builders AI System
// ============================================================

require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const { initDatabase } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? false : '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 }, useTempFiles: true }));

// Serve generated PDFs
app.use('/outputs', express.static(path.join(__dirname, '../outputs')));

// ── HEALTH CHECK ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── API ROUTES ────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/jobs',          require('./routes/jobs'));
app.use('/api/settings',      require('./routes/settings'));
app.use('/api/knowledge',     require('./routes/knowledge'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/chat',          require('./routes/adminChat'));
app.use('/api/whitelist',     require('./routes/whitelist'));

// ── WEBHOOKS (no auth — verified by signature) ────────────────
app.use('/webhook/hearth',    require('./routes/webhookHearth'));
app.use('/webhook/email',     require('./routes/webhookEmail'));
app.use('/webhook/whatsapp',  require('./routes/webhookWhatsapp'));

// ── SERVE REACT FRONTEND (production) ────────────────────────
const clientBuild = path.join(__dirname, '../client/build');
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// ── ERROR HANDLER ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── START ─────────────────────────────────────────────────────
async function start() {
  try {
    await initDatabase();
    console.log('✅ Database initialized');

    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════╗
║   PREFERRED BUILDERS AI SYSTEM            ║
║   Running on port ${PORT}                    ║
║   Admin panel: http://localhost:${PORT}      ║
╚═══════════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
