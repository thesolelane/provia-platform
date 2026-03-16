// server/routes/status.js
const express = require('express');
const router  = express.Router();
const https   = require('https');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(7000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function checkDatabase() {
  try {
    const db    = getDb();
    const jobs  = db.prepare('SELECT COUNT(*) as n FROM jobs').get().n;
    const tasks = db.prepare('SELECT COUNT(*) as n FROM tasks').get().n;
    const sigs  = db.prepare('SELECT COUNT(*) as n FROM signing_sessions').get().n;
    return { ok: true, detail: `${jobs} jobs · ${tasks} tasks · ${sigs} signing sessions` };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

async function checkClaude() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key)                        return { ok: false, detail: 'ANTHROPIC_API_KEY not set' };
  if (!key.startsWith('sk-ant-'))  return { ok: false, detail: 'Key format looks wrong (should start with sk-ant-)' };
  return { ok: true, detail: 'API key configured' };
}

async function checkMailgun() {
  const key    = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  if (!key)    return { ok: false, detail: 'MAILGUN_API_KEY not set' };
  if (!domain) return { ok: false, detail: 'MAILGUN_DOMAIN not set' };
  try {
    const auth = Buffer.from(`api:${key}`).toString('base64');
    const res  = await httpsGet(`https://api.mailgun.net/v3/domains/${domain}`, {
      Authorization: `Basic ${auth}`
    });
    if (res.status === 200) return { ok: true,  detail: `Domain ${domain} verified` };
    if (res.status === 404) return { ok: false, detail: `Domain "${domain}" not found in Mailgun` };
    if (res.status === 401) return { ok: false, detail: 'Mailgun API key rejected (401 Unauthorized)' };
    return { ok: false, detail: `Mailgun returned HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

async function checkTwilio() {
  const sid   = process.env.TWILIO_ACCOUNT_SID   || process.env.TWILIO_LIVE_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN     || process.env.TWILIO_LIVE_AUTH_TOKEN;
  if (!sid)   return { ok: false, detail: 'TWILIO_ACCOUNT_SID not set' };
  if (!token) return { ok: false, detail: 'TWILIO_AUTH_TOKEN not set' };
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res  = await httpsGet(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
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
  const waNumber  = process.env.TWILIO_WHATSAPP_NUMBER;
  const jacksonWA = process.env.JACKSON_WHATSAPP;
  const ownerWA   = process.env.OWNER_WHATSAPP;
  if (!waNumber)  return { ok: false, detail: 'TWILIO_WHATSAPP_NUMBER not set' };
  if (!jacksonWA) return { ok: false, detail: 'JACKSON_WHATSAPP not set' };
  const twilio = await checkTwilio();
  if (!twilio.ok) return { ok: false, detail: `Twilio invalid — ${twilio.detail}` };
  return {
    ok: true,
    detail: `From: ${waNumber} · Jackson: ${jacksonWA}${ownerWA ? ` · Owner: ${ownerWA}` : ''}`
  };
}

async function checkGoogleCalendar() {
  const hostname    = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const replId      = process.env.REPL_IDENTITY;
  const webRenewal  = process.env.WEB_REPL_RENEWAL;
  if (!hostname || (!replId && !webRenewal)) {
    return { ok: false, detail: 'Google Calendar connector not configured — connect via Settings → Calendar' };
  }
  try {
    const db      = getDb();
    const enabled = db.prepare("SELECT value FROM settings WHERE key = 'gcal.enabled'").get()?.value;
    return { ok: true, detail: `Connector available · auto-add ${enabled !== 'false' ? 'ON' : 'OFF'}` };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

async function checkPDF() {
  const { execSync } = require('child_process');
  const fs = require('fs');
  try {
    const path = execSync(
      'which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null',
      { timeout: 3000 }
    ).toString().trim();
    if (path) return { ok: true, detail: `Chromium: ${path}` };
  } catch {}
  const nixPath = '/nix/store/gasnw5878924jbw6bql257ll29hkm4fd-chromium-123.0.6312.105/bin/chromium';
  if (fs.existsSync(nixPath)) return { ok: true, detail: 'Chromium found in Nix store' };
  return { ok: false, detail: 'Chromium not found — PDF generation will fail' };
}

async function checkSigning() {
  try {
    const db      = getDb();
    const pending = db.prepare("SELECT COUNT(*) as n FROM signing_sessions WHERE status IN ('sent','opened')").get().n;
    const signed  = db.prepare("SELECT COUNT(*) as n FROM signing_sessions WHERE status = 'signed'").get().n;
    return { ok: true, detail: `${pending} pending · ${signed} completed` };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

// GET /api/status — owner only
router.get('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

  const [database, claude, mailgun, twilio, whatsapp, calendar, pdf, signing] = await Promise.all([
    checkDatabase(),
    checkClaude(),
    checkMailgun(),
    checkTwilio(),
    checkWhatsApp(),
    checkGoogleCalendar(),
    checkPDF(),
    checkSigning(),
  ]);

  res.json({
    checkedAt: new Date().toISOString(),
    services: {
      database: { label: 'Database (SQLite)',     ...database },
      claude:   { label: 'Claude AI (Anthropic)', ...claude   },
      mailgun:  { label: 'Email (Mailgun)',        ...mailgun  },
      twilio:   { label: 'Twilio SMS',             ...twilio   },
      whatsapp: { label: 'WhatsApp (Twilio)',      ...whatsapp },
      calendar: { label: 'Google Calendar',        ...calendar },
      pdf:      { label: 'PDF Generation',         ...pdf      },
      signing:  { label: 'Digital Signatures',     ...signing  },
    }
  });
});

module.exports = router;
