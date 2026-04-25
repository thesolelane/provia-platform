'use strict';
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getDb } = require('../db/database');

const isTenantAdmin = [requireAuth, requireRole('admin')];

const ENC_KEY = process.env.PLATFORM_ENCRYPTION_KEY
  ? Buffer.from(process.env.PLATFORM_ENCRYPTION_KEY, 'hex')
  : crypto.randomBytes(32); // fallback for dev — not persistent across restarts

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(stored) {
  try {
    const [ivHex, tagHex, encHex] = stored.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  } catch {
    return null;
  }
}

function mask(val) {
  if (!val || val.length < 8) return '••••••••';
  return val.slice(0, 4) + '••••••••' + val.slice(-4);
}

// ── GET /api/tenant/account ───────────────────────────────────────────────────
router.get('/api/tenant/account', ...isTenantAdmin, (req, res) => {
  const db = getDb();
  const tenantId = req.session.tenantId;

  const featureRows = db
    .prepare('SELECT key, value FROM tenant_features WHERE tenant_id = ?')
    .all(tenantId);
  const features = {};
  for (const r of featureRows) features[r.key] = r.value;

  const secretRows = db.prepare('SELECT key FROM tenant_secrets WHERE tenant_id = ?').all(tenantId);
  const secrets = {};
  for (const r of secretRows) secrets[r.key] = true; // just indicate it's set

  const tenant = req.session.tenant || {};

  res.json({ features, secrets, tenant });
});

// ── PUT /api/tenant/account/features ─────────────────────────────────────────
router.put('/api/tenant/account/features', ...isTenantAdmin, (req, res) => {
  const db = getDb();
  const tenantId = req.session.tenantId;
  const updates = req.body;

  const upsert = db.prepare(`
    INSERT INTO tenant_features (tenant_id, key, value, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  for (const [key, value] of Object.entries(updates)) {
    upsert.run(tenantId, key, String(value));
  }

  res.json({ ok: true });
});

// ── PUT /api/tenant/secret/:key — save encrypted secret ──────────────────────
router.put('/api/tenant/secret/:key', ...isTenantAdmin, (req, res) => {
  const { value } = req.body;
  if (!value) return res.status(400).json({ error: 'value required' });
  const db = getDb();
  const tenantId = req.session.tenantId;
  const enc = encrypt(value);
  db.prepare(
    `
    INSERT INTO tenant_secrets (tenant_id, key, value_enc, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(tenant_id, key) DO UPDATE SET value_enc = excluded.value_enc, updated_at = CURRENT_TIMESTAMP
  `,
  ).run(tenantId, req.params.key, enc);
  res.json({ ok: true });
});

// ── DELETE /api/tenant/secret/:key ───────────────────────────────────────────
router.delete('/api/tenant/secret/:key', ...isTenantAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM tenant_secrets WHERE tenant_id = ? AND key = ?').run(
    req.session.tenantId,
    req.params.key,
  );
  res.json({ ok: true });
});

// ── GET /api/tenant/secret/:key — retrieve decrypted value (admin only) ──────
router.get('/api/tenant/secret/:key', ...isTenantAdmin, (req, res) => {
  const db = getDb();
  const row = db
    .prepare('SELECT value_enc FROM tenant_secrets WHERE tenant_id = ? AND key = ?')
    .get(req.session.tenantId, req.params.key);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const val = decrypt(row.value_enc);
  res.json({ value: mask(val) });
});

module.exports = router;
