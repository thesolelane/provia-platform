// server/routes/secrets.js
// Owner-only endpoint to read and update .env configuration values

const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const ENV_PATH = path.resolve(__dirname, '../../.env');

const MANAGED_KEYS = [
  { key: 'ANTHROPIC_API_KEY',       label: 'Claude AI API Key',          group: 'AI' },
  { key: 'RESEND_API_KEY',           label: 'Resend API Key',              group: 'Email' },
  { key: 'BOT_EMAIL',               label: 'Bot From Email',              group: 'Email',    noMask: true },
  { key: 'PB_FROM_EMAIL',           label: 'PB From Email',               group: 'Email',    noMask: true },
  { key: 'TWILIO_ACCOUNT_SID',      label: 'Twilio Account SID',          group: 'WhatsApp' },
  { key: 'TWILIO_AUTH_TOKEN',       label: 'Twilio Auth Token',           group: 'WhatsApp' },
  { key: 'TWILIO_API_KEY',          label: 'Twilio API Key',              group: 'WhatsApp' },
  { key: 'TWILIO_API_SECRET',       label: 'Twilio API Secret',           group: 'WhatsApp' },
  { key: 'TWILIO_LIVE_ACCOUNT_SID', label: 'Twilio Live Account SID',     group: 'WhatsApp' },
  { key: 'TWILIO_WHATSAPP_NUMBER',  label: 'Twilio WhatsApp Number',      group: 'WhatsApp', noMask: true },
  { key: 'OWNER_WHATSAPP',          label: 'Owner WhatsApp Number',       group: 'Contacts', noMask: true },
  { key: 'JACKSON_WHATSAPP',        label: 'Jackson WhatsApp Number',     group: 'Contacts', noMask: true },
  { key: 'OWNER_EMAIL',             label: 'Owner Email',                 group: 'Contacts', noMask: true },
  { key: 'APP_URL',                 label: 'App URL',                     group: 'System',   noMask: true },
];

const ALLOWED_KEYS = new Set(MANAGED_KEYS.map(k => k.key));

function sanitizeValue(val) {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n]/g, '').trim();
}

function serializeEnvValue(val) {
  if (/[\s"'`#]/.test(val)) {
    return `"${val.replace(/"/g, '\\"')}"`;
  }
  return val;
}

router.get('/', requireAuth, (req, res) => {
  if (req.session.role !== 'system_admin') return res.status(403).json({ error: 'Forbidden' });
  const result = MANAGED_KEYS.map(k => ({
    key: k.key,
    label: k.label,
    group: k.group,
    noMask: k.noMask || false,
    value: process.env[k.key] || '',
  }));
  res.json(result);
});

router.put('/', requireAuth, (req, res) => {
  if (req.session.role !== 'system_admin') return res.status(403).json({ error: 'Forbidden' });

  const updates = req.body;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const sanitized = {};
  for (const [key, raw] of Object.entries(updates)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    sanitized[key] = sanitizeValue(raw);
  }

  if (Object.keys(sanitized).length === 0) {
    return res.status(400).json({ error: 'No valid keys provided' });
  }

  let envContent = '';
  try {
    envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  } catch (e) {
    envContent = '';
  }

  const lines = envContent.split('\n');

  for (const [key, value] of Object.entries(sanitized)) {
    const newLine = `${key}=${serializeEnvValue(value)}`;
    const idx = lines.findIndex(l => new RegExp(`^${key}=`).test(l));
    if (idx >= 0) {
      lines[idx] = newLine;
    } else {
      lines.push(newLine);
    }
  }

  try {
    fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf8');
  } catch (e) {
    console.error('[secrets] write error:', e.message);
    return res.status(500).json({ error: 'Could not write .env file' });
  }

  for (const [key, value] of Object.entries(sanitized)) {
    process.env[key] = value;
  }

  res.json({ ok: true });
});

module.exports = router;
