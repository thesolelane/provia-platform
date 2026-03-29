// server/routes/status.js
const express = require('express');
const router = express.Router();
const https = require('https');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(7000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function checkDatabase() {
  try {
    const db = getDb();
    const jobs = db.prepare('SELECT COUNT(*) as n FROM jobs').get().n;
    const tasks = db.prepare('SELECT COUNT(*) as n FROM tasks').get().n;
    const sigs = db.prepare('SELECT COUNT(*) as n FROM signing_sessions').get().n;
    return { ok: true, detail: `${jobs} jobs · ${tasks} tasks · ${sigs} signing sessions` };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

async function checkClaude() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, detail: 'ANTHROPIC_API_KEY not set' };
  if (!key.startsWith('sk-ant-'))
    return { ok: false, detail: 'Key format looks wrong (should start with sk-ant-)' };
  return { ok: true, detail: 'API key configured' };
}

async function checkSmtp() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user) return { ok: false, detail: 'SMTP_USER not set' };
  if (!pass) return { ok: false, detail: 'SMTP_PASS not set' };
  return { ok: true, detail: `Sending as ${user}` };
}

async function checkTwilio() {
  const sid = process.env.TWILIO_LIVE_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_LIVE_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
  if (!sid) return { ok: false, detail: 'TWILIO_ACCOUNT_SID not set' };
  if (!token) return { ok: false, detail: 'TWILIO_AUTH_TOKEN not set' };
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await httpsGet(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      Authorization: `Basic ${auth}`
    });
    if (res.status === 200) {
      const data = JSON.parse(res.body);
      return { ok: true, detail: `Account: ${data.friendly_name} (${data.status})` };
    }
    if (res.status === 401) return { ok: false, detail: 'Twilio credentials rejected (401)' };
    return { ok: false, detail: `Twilio returned HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

async function checkWhatsApp() {
  const waNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  const jacksonWA = process.env.JACKSON_WHATSAPP;
  const ownerWA = process.env.OWNER_WHATSAPP;
  if (!waNumber) return { ok: false, detail: 'TWILIO_WHATSAPP_NUMBER not set' };
  if (!jacksonWA) return { ok: false, detail: 'JACKSON_WHATSAPP not set' };
  const twilio = await checkTwilio();
  if (!twilio.ok) return { ok: false, detail: `Twilio invalid — ${twilio.detail}` };
  return {
    ok: true,
    detail: `From: ${waNumber} · Jackson: ${jacksonWA}${ownerWA ? ` · Owner: ${ownerWA}` : ''}`
  };
}

async function checkGoogleCalendar() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const replId = process.env.REPL_IDENTITY;
  const webRenewal = process.env.WEB_REPL_RENEWAL;
  if (!hostname || (!replId && !webRenewal)) {
    const onWindows = process.platform === 'win32';
    return {
      ok: false,
      detail: onWindows
        ? 'Google Calendar runs via Replit — not available on Windows server (tasks still save locally)'
        : 'Google Calendar connector not configured — connect via Settings → Calendar'
    };
  }
  try {
    const db = getDb();
    const enabled = db
      .prepare("SELECT value FROM settings WHERE key = 'gcal.enabled'")
      .get()?.value;
    return {
      ok: true,
      detail: `Connector available · auto-add ${enabled !== 'false' ? 'ON' : 'OFF'}`
    };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

async function checkPDF() {
  const { execSync } = require('child_process');
  const fs = require('fs');

  // Check env override first
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return { ok: true, detail: `Chrome (env): ${process.env.CHROME_PATH}` };
  }

  if (process.platform === 'win32') {
    const winPaths = [
      'C:\\Users\\theso\\.cache\\puppeteer\\chrome\\win64-146.0.7680.76\\chrome-win64\\chrome.exe',
      'C:\\Users\\theso\\.cache\\puppeteer\\chrome\\win64-127.0.6533.88\\chrome-win64\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\theso\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
      (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'
    ];
    for (const p of winPaths) {
      if (p && fs.existsSync(p)) return { ok: true, detail: `Chrome (Windows): ${p}` };
    }
    try {
      const p = execSync('where chrome', { timeout: 3000 }).toString().split('\n')[0].trim();
      if (p && fs.existsSync(p)) return { ok: true, detail: `Chrome (PATH): ${p}` };
    } catch {}
    return {
      ok: false,
      detail:
        'Chrome not found on Windows — set CHROME_PATH in ecosystem.config.js or install Chrome'
    };
  }

  // Linux / Replit
  try {
    const p = execSync(
      'which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null',
      { timeout: 3000 }
    )
      .toString()
      .trim();
    if (p) return { ok: true, detail: `Chromium: ${p}` };
  } catch {}
  const nixPath =
    '/nix/store/gasnw5878924jbw6bql257ll29hkm4fd-chromium-123.0.6312.105/bin/chromium';
  if (fs.existsSync(nixPath)) return { ok: true, detail: 'Chromium found in Nix store' };
  return { ok: false, detail: 'Chromium not found — PDF generation will fail' };
}

async function checkSigning() {
  try {
    const db = getDb();
    const pending = db
      .prepare("SELECT COUNT(*) as n FROM signing_sessions WHERE status IN ('sent','opened')")
      .get().n;
    const signed = db
      .prepare("SELECT COUNT(*) as n FROM signing_sessions WHERE status = 'signed'")
      .get().n;
    return { ok: true, detail: `${pending} pending · ${signed} completed` };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

const { getRecentErrors, getAlertsSummary } = require('../services/errorLogger');

// POST /api/status/email-test — send a tracked test notification
router.post('/email-test', requireAuth, async (req, res) => {
  if (!['system_admin', 'admin'].includes(req.session?.role))
    return res.status(403).json({ error: 'Admin only' });
  try {
    const { sendEmail, getOwnerEmails } = require('../services/emailService');
    const owners = getOwnerEmails();
    if (!owners.length) return res.status(400).json({ ok: false, error: 'OWNER_EMAIL not set' });
    const when = new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/New_York'
    });
    const result = await sendEmail({
      to: owners,
      subject: `📬 Notification Test — Preferred Builders AI (${when})`,
      html: `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto">
        <div style="background:#1B3A6B;padding:20px 24px;color:white;border-radius:8px 8px 0 0">
          <div style="font-size:17px;font-weight:700">Preferred Builders — Notification Test</div>
        </div>
        <div style="background:white;padding:24px;border:1px solid #eee;border-top:none">
          <p style="font-size:15px;color:#1B3A6B;font-weight:700">📬 This is a test notification with read tracking</p>
          <p style="color:#444;font-size:14px">Sent to: <strong>${owners.join(', ')}</strong><br>Time: <strong>${when}</strong></p>
          <p style="color:#666;font-size:13px">When you open this email, the server logs the open event automatically via a 1×1 tracking pixel embedded below.</p>
          <a href="https://preferredbuilders.duckdns.org" style="background:#1B3A6B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;display:inline-block;margin-top:8px">Open Preferred Builders →</a>
        </div>
      </div>`,
      emailType: 'system_alert',
      db: getDb()
    });
    res.json({ ok: true, messageId: result?.id, sentTo: owners });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/status/schedule — get current report schedule settings
router.get('/schedule', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const intervalHours = parseInt(
      db.prepare("SELECT value FROM settings WHERE key = 'status.reportIntervalHours'").get()
        ?.value || '24',
      10
    );
    const hourOfDay = parseInt(
      db.prepare("SELECT value FROM settings WHERE key = 'status.reportHourOfDay'").get()?.value ||
        '-1',
      10
    );
    res.json({ intervalHours, hourOfDay });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/status/schedule — update report schedule and reschedule immediately
router.post('/schedule', requireAuth, (req, res) => {
  if (!['system_admin', 'admin'].includes(req.session?.role))
    return res.status(403).json({ error: 'Admin only' });
  try {
    const { intervalHours, hourOfDay } = req.body;
    const db = getDb();
    if (intervalHours !== undefined) {
      const val = Math.min(Math.max(1, parseInt(intervalHours, 10)), 168);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'status.reportIntervalHours'").run(
        String(val)
      );
    }
    if (hourOfDay !== undefined) {
      const val = parseInt(hourOfDay, 10);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'status.reportHourOfDay'").run(
        String(val)
      );
    }
    const { rescheduleStatusReports } = require('../services/statusScheduler');
    rescheduleStatusReports();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/status/send-now — trigger an immediate report
router.post('/send-now', requireAuth, async (req, res) => {
  if (!['system_admin', 'admin'].includes(req.session?.role))
    return res.status(403).json({ error: 'Admin only' });
  try {
    const { sendStatusReport } = require('../services/statusScheduler');
    res.json({ ok: true, message: 'Report sending in background' });
    sendStatusReport();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/status/backup — list backups + last run info
router.get('/backup', requireAuth, (req, res) => {
  if (!['system_admin', 'admin'].includes(req.session?.role))
    return res.status(403).json({ error: 'Admin only' });
  try {
    const { listBackups, formatBytes } = require('../services/backupService');
    const db = getDb();
    const lastRanAt =
      db.prepare("SELECT value FROM settings WHERE key = 'backup.lastRanAt'").get()?.value || null;
    const lastFile =
      db.prepare("SELECT value FROM settings WHERE key = 'backup.lastFile'").get()?.value || null;
    const intervalHours = parseInt(
      db.prepare("SELECT value FROM settings WHERE key = 'backup.intervalHours'").get()?.value ||
        '24',
      10
    );
    const customPath =
      db.prepare("SELECT value FROM settings WHERE key = 'backup.customPath'").get()?.value || '';
    const backups = listBackups()
      .reverse()
      .map((b) => ({ file: b.file, size: formatBytes(b.size), date: b.mtime }));
    res.json({ lastRanAt, lastFile, intervalHours, customPath, backups, count: backups.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/status/backup — trigger manual backup
router.post('/backup', requireAuth, async (req, res) => {
  if (!['system_admin', 'admin'].includes(req.session?.role))
    return res.status(403).json({ error: 'Admin only' });
  try {
    const { runBackup } = require('../services/backupService');
    const result = await runBackup();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/status/backup/schedule — update backup interval and/or custom path
router.post('/backup/schedule', requireAuth, (req, res) => {
  if (!['system_admin', 'admin'].includes(req.session?.role))
    return res.status(403).json({ error: 'Admin only' });
  try {
    const { intervalHours, customPath } = req.body;
    const db = getDb();
    if (intervalHours !== undefined) {
      const val = Math.min(Math.max(1, parseInt(intervalHours, 10)), 168);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'backup.intervalHours'").run(
        String(val)
      );
    }
    if (customPath !== undefined) {
      db.prepare(
        `
        INSERT INTO settings (key, value, category, label)
        VALUES ('backup.customPath', ?, 'backup', 'Custom Backup Folder Path')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `
      ).run(customPath.trim());
    }
    const { rescheduleBackups } = require('../services/backupService');
    rescheduleBackups();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/status/signing-receipts — full read/sign receipt log
router.get('/signing-receipts', requireAuth, async (req, res) => {
  if (!['system_admin', 'admin'].includes(req.session?.role))
    return res.status(403).json({ error: 'Admin only' });
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `
      SELECT
        ss.id,
        ss.job_id,
        ss.doc_type,
        ss.status,
        ss.email_sent_at,
        ss.opened_at,
        ss.opened_ip,
        ss.signed_at,
        ss.signed_ip,
        ss.signer_name,
        ss.created_at,
        j.customer_name,
        j.customer_email,
        j.project_address,
        j.project_city
      FROM signing_sessions ss
      LEFT JOIN jobs j ON j.id = ss.job_id
      ORDER BY ss.created_at DESC
      LIMIT 200
    `
      )
      .all();

    const stats = {
      total: rows.length,
      sent: rows.filter((r) => r.status === 'sent').length,
      opened: rows.filter((r) => r.opened_at).length,
      signed: rows.filter((r) => r.status === 'signed').length,
      openRate: rows.length
        ? Math.round((rows.filter((r) => r.opened_at).length / rows.length) * 100)
        : 0,
      signRate: rows.length
        ? Math.round((rows.filter((r) => r.status === 'signed').length / rows.length) * 100)
        : 0
    };

    res.json({ receipts: rows, stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/status — admin and system_admin only
router.get('/', requireAuth, async (req, res) => {
  if (!['system_admin', 'admin'].includes(req.session?.role))
    return res.status(403).json({ error: 'Admin only' });

  const [database, claude, resend, twilio, whatsapp, calendar, pdf, signing] = await Promise.all([
    checkDatabase(),
    checkClaude(),
    checkSmtp(),
    checkTwilio(),
    checkWhatsApp(),
    checkGoogleCalendar(),
    checkPDF(),
    checkSigning()
  ]);

  res.json({
    version: '1.4.0',
    checkedAt: new Date().toISOString(),
    services: {
      database: { label: 'Database (SQLite)', ...database },
      claude: { label: 'Claude AI (Anthropic)', ...claude },
      resend: { label: 'Email (SMTP)', ...resend },
      twilio: { label: 'Twilio SMS', ...twilio },
      whatsapp: { label: 'WhatsApp (Twilio)', ...whatsapp },
      calendar: { label: 'Google Calendar', ...calendar },
      pdf: { label: 'PDF Generation', ...pdf },
      signing: { label: 'Digital Signatures', ...signing }
    },
    recentErrors: getRecentErrors(20),
    alertsSummary: getAlertsSummary()
  });
});

module.exports = router;
