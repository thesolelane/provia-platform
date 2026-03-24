// ============================================================
// server/index.js — Main Application Server
// Preferred Builders AI System
// ============================================================

require('dotenv').config();
require('./services/errorLogger'); // must load early to capture all errors
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const { initDatabase } = require('./db/database');
const { requireAuth } = require('./middleware/auth');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? false : '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 }, useTempFiles: true }));

// ── AUTH-PROTECTED FILE SERVING ───────────────────────────────
// PDFs (proposals, contracts) — requires login
const OUTPUTS_DIR     = path.resolve(__dirname, '../outputs');
const CONTACT_DOCS_DIR = path.resolve(__dirname, '../uploads/contact_docs');

app.get('/outputs/:filename', requireAuth, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(OUTPUTS_DIR, filename);
  if (!filePath.startsWith(OUTPUTS_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});

app.get('/contact-docs/:contactId/:filename', requireAuth, (req, res) => {
  const contactId = path.basename(req.params.contactId);
  const filename  = path.basename(req.params.filename);
  const filePath  = path.join(CONTACT_DOCS_DIR, contactId, filename);
  if (!filePath.startsWith(CONTACT_DOCS_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});

// Job photo uploads served through authenticated route in jobPhotos.js

// ── REQUEST LOGGER (catch all incoming) ─────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/webhook') || req.path === '/health') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} from ${req.ip}`);
  }
  next();
});

// ── RATE LIMITING ─────────────────────────────────────────────
app.set('trust proxy', 1);
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', loginLimiter);

// ── BLANK CONTRACT DOWNLOAD ───────────────────────────────────
app.get('/api/blank-contract', requireAuth, async (req, res) => {
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
app.use('/api/tasks',         require('./routes/tasks').router);
app.use('/api/jobs',          require('./routes/jobPhotos'));
app.use('/api/secrets',       require('./routes/secrets'));
app.use('/api/status',        require('./routes/status'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/remote-update', require('./routes/remoteUpdate'));
app.use('/api/payments',     require('./routes/payments'));
app.use('/api/analytics',    require('./routes/analytics'));
app.use('/api/email-log',    require('./routes/emailLog'));
app.use('/api/field-photos', require('./routes/fieldPhotos'));

// ── SIGNING (public pages at /sign/* + api at /api/signing/*) ─
app.use(require('./routes/signing'));

// ── WEBHOOKS (no auth — verified by signature) ────────────────
app.use('/webhook/hearth',    require('./routes/webhookHearth'));
app.use('/webhook/email',     require('./routes/webhookEmail'));
app.use('/webhook/whatsapp',  require('./routes/webhookWhatsapp'));
app.use('/webhook',           require('./routes/emailLog'));

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

    const { startKeepAlive } = require('./services/keepAlive');
    startKeepAlive(PORT);

    const { startPolling } = require('./services/whatsappPoller');
    const { handleIncomingWhatsApp } = require('./routes/webhookWhatsapp');
    if (process.env.DISABLE_WHATSAPP_POLLER !== 'true') {
      startPolling(handleIncomingWhatsApp, 5000);
    } else {
      console.log('📵 WhatsApp poller disabled (DISABLE_WHATSAPP_POLLER=true)');
    }

    const { startEmailPolling } = require('./services/emailPoller');
    startEmailPolling(15 * 60 * 1000);

  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
