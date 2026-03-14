// ============================================================
// server/index.js — Main Application Server
// Preferred Builders AI System
// ============================================================

require('dotenv').config();
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

// Serve contact-attached documents (estimates, invoices saved under a contact)
app.use('/contact-docs', express.static(path.join(__dirname, '../uploads/contact_docs')));

// ── REQUEST LOGGER (catch all incoming) ─────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/webhook') || req.path === '/health') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} from ${req.ip}`);
  }
  next();
});

// ── BLANK CONTRACT DOWNLOAD ───────────────────────────────────
app.get('/api/blank-contract', async (req, res) => {
  try {
    const { generateBlankContractDocx } = require('./services/pdfService');
    const buffer = await generateBlankContractDocx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="PB_Contract_Template_BLANK.docx"');
    res.send(buffer);
  } catch (err) {
    console.error('Blank contract error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── HEALTH CHECK ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── API ROUTES ────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/jobs',          require('./routes/jobs'));
app.use('/api/settings',      require('./routes/settings'));
app.use('/api/knowledge',     require('./routes/knowledge'));
app.use('/api/knowledge',     require('./routes/knowledgeImport'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/chat',          require('./routes/adminChat'));
app.use('/api/whitelist',     require('./routes/whitelist'));
app.use('/api/contacts',      require('./routes/contacts'));

// ── SIGNING (public pages at /sign/* + api at /api/signing/*) ─
app.use(require('./routes/signing'));

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
function listenWithRetry(port, maxRetries = 5, delayMs = 2000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function attempt() {
      const server = app.listen(port, () => resolve(server));
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempts < maxRetries) {
          attempts++;
          console.log(`Port ${port} in use, retrying in ${delayMs}ms (attempt ${attempts}/${maxRetries})...`);
          setTimeout(attempt, delayMs);
        } else {
          reject(err);
        }
      });
    }
    attempt();
  });
}

async function start() {
  try {
    await initDatabase();
    console.log('✅ Database initialized');

    await listenWithRetry(PORT);

    console.log(`
╔═══════════════════════════════════════════╗
║   PREFERRED BUILDERS AI SYSTEM            ║
║   Running on port ${PORT}                    ║
║   Admin panel: http://localhost:${PORT}      ║
╚═══════════════════════════════════════════╝
    `);

    // Also listen on port 3001 for Replit webview (external port 80 → local 3001)
    if (String(PORT) !== '3001') {
      app.listen(3001, () => {
        console.log('📡 Also listening on port 3001 (Replit webview proxy)');
      }).on('error', (e) => {
        if (e.code !== 'EADDRINUSE') console.warn('Port 3001 listen error:', e.message);
      });
    }

    const { startPolling } = require('./services/whatsappPoller');
    const { handleIncomingWhatsApp } = require('./routes/webhookWhatsapp');
    startPolling(handleIncomingWhatsApp, 5000);

    const { startEmailPolling } = require('./services/emailPoller');
    startEmailPolling(15 * 60 * 1000);

  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
