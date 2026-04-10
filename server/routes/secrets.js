// server/routes/secrets.js
// Full CRUD secrets manager — reads/writes the .env file directly

const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const ENV_PATH = path.resolve(__dirname, '../../.env');

// Keys whose values are shown in plain text (not sensitive)
const NO_MASK_KEYS = new Set([
  'BOT_EMAIL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'OWNER_EMAIL',
  'OWNER_WHATSAPP',
  'JACKSON_WHATSAPP',
  'COOPER_WHATSAPP',
  'TWILIO_WHATSAPP_NUMBER',
  'APP_URL',
  'PORT',
  'NODE_ENV',
  'TZ',
  'DISABLE_WHATSAPP_POLLER',
  'DISABLE_WHATSAPP_WEBHOOK',
  'PBBKUPS',
  'SIGNED_CONTRACTS_DIR',
]);

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function readEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return '';
  return fs.readFileSync(ENV_PATH, 'utf8');
}

function parseEnv(content) {
  const entries = [];
  for (const raw of content.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line) {
      entries.push({ type: 'comment', raw: line });
      continue;
    }
    // Detect commented-out key=value lines like #KEY=value or # KEY=value
    if (line.startsWith('#')) {
      const inner = line.replace(/^#+\s*/, '');
      const eqIdx = inner.indexOf('=');
      if (eqIdx > 0 && /^[A-Z][A-Z0-9_]*$/.test(inner.slice(0, eqIdx).trim())) {
        const key = inner.slice(0, eqIdx).trim();
        let val = inner.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        )
          val = val.slice(1, -1);
        entries.push({ type: 'commented-kv', key, value: val, raw: line });
        continue;
      }
      entries.push({ type: 'comment', raw: line });
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx < 1) {
      entries.push({ type: 'comment', raw: line });
      continue;
    }
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    entries.push({ type: 'kv', key, value: val });
  }
  return entries;
}

function serializeEnv(entries) {
  return entries
    .map((e) => {
      if (e.type === 'comment') return e.raw;
      const val = e.value;
      const needsQuotes = /[\s"'`#\\]/.test(val);
      return `${e.key}=${needsQuotes ? `"${val.replace(/"/g, '\\"')}"` : val}`;
    })
    .join('\n');
}

function writeEnvFile(entries) {
  fs.writeFileSync(ENV_PATH, serializeEnv(entries), 'utf8');
}

// ------------------------------------------------------------------
// GET /api/secrets — return all key/value pairs from .env
// ------------------------------------------------------------------
router.get('/', requireAuth, (req, res) => {
  if (req.session.role !== 'system_admin') return res.status(403).json({ error: 'Forbidden' });
  const entries = parseEnv(readEnvFile());
  const kvs = entries
    .filter((e) => e.type === 'kv' || e.type === 'commented-kv')
    .map((e) => ({
      key: e.key,
      value: e.value,
      noMask: NO_MASK_KEYS.has(e.key),
      disabled: e.type === 'commented-kv',
    }));
  res.json(kvs);
});

// ------------------------------------------------------------------
// POST /api/secrets — add a new key (or upsert)
// Body: { key, value }
// ------------------------------------------------------------------
router.post('/', requireAuth, (req, res) => {
  if (req.session.role !== 'system_admin') return res.status(403).json({ error: 'Forbidden' });
  const key = (req.body.key || '').replace(/[\r\n\s]/g, '').toUpperCase();
  const value = (req.body.value || '').replace(/[\r\n]/g, '').trim();
  if (!key) return res.status(400).json({ error: 'Key is required' });

  const entries = parseEnv(readEnvFile());
  const existing = entries.find((e) => e.type === 'kv' && e.key === key);
  if (existing) {
    existing.value = value;
  } else {
    entries.push({ type: 'kv', key, value });
  }
  writeEnvFile(entries);
  process.env[key] = value;
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// PUT /api/secrets/:key — update value (and optionally rename key)
// Body: { value, newKey? }
// ------------------------------------------------------------------
router.put('/:key', requireAuth, (req, res) => {
  if (req.session.role !== 'system_admin') return res.status(403).json({ error: 'Forbidden' });
  const oldKey = req.params.key;
  const newKey = req.body.newKey
    ? (req.body.newKey || '').replace(/[\r\n\s]/g, '').toUpperCase()
    : oldKey;
  const value = (req.body.value !== undefined ? req.body.value : '').replace(/[\r\n]/g, '').trim();

  const entries = parseEnv(readEnvFile());
  const entry = entries.find(
    (e) => (e.type === 'kv' || e.type === 'commented-kv') && e.key === oldKey,
  );
  if (!entry) return res.status(404).json({ error: 'Key not found' });
  // Uncomment if it was a commented-out entry
  entry.type = 'kv';

  // If renaming, check new name isn't already taken
  if (newKey !== oldKey && entries.find((e) => e.type === 'kv' && e.key === newKey)) {
    return res.status(409).json({ error: 'A secret with that name already exists' });
  }

  delete process.env[oldKey];
  entry.key = newKey;
  entry.value = value;
  process.env[newKey] = value;
  writeEnvFile(entries);
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// DELETE /api/secrets/:key — remove a key from .env
// ------------------------------------------------------------------
router.delete('/:key', requireAuth, (req, res) => {
  if (req.session.role !== 'system_admin') return res.status(403).json({ error: 'Forbidden' });
  const key = req.params.key;
  const entries = parseEnv(readEnvFile());
  const idx = entries.findIndex(
    (e) => (e.type === 'kv' || e.type === 'commented-kv') && e.key === key,
  );
  if (idx === -1) return res.status(404).json({ error: 'Key not found' });
  entries.splice(idx, 1);
  writeEnvFile(entries);
  delete process.env[key];
  res.json({ ok: true });
});

module.exports = router;
