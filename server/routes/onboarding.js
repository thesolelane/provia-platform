'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { createTenant, listTenants, updateTenant, deleteTenant } = require('../services/tenantService');
const { createSession } = require('../middleware/auth');
const { requireAuth, requireRole } = require('../middleware/auth');

// ── POST /api/register — self-service tenant onboarding ──────────────────────
// Creates a new tenant in Supabase + an admin user in SQLite
router.post('/api/register', async (req, res) => {
  const {
    // Company info
    company_name, license, hic_license, address, city, state, zip, phone, email, website,
    // Admin user
    admin_name, admin_email, admin_password,
  } = req.body;

  if (!company_name || !admin_name || !admin_email || !admin_password) {
    return res.status(400).json({ error: 'company_name, admin_name, admin_email and admin_password are required' });
  }
  if (admin_password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const db = getDb();

    // Check email not already taken
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(admin_email);
    if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

    // Create tenant in Supabase
    const tenant = await createTenant({
      name: company_name,
      license,
      hicLicense: hic_license,
      address, city, state, zip, phone,
      email: email || admin_email,
      website,
    });

    // Create admin user in SQLite scoped to this tenant
    const passwordHash = await bcrypt.hash(admin_password, 12);
    const result = db.prepare(
      `INSERT INTO users (name, email, password_hash, role, tenant_id) VALUES (?, ?, ?, 'admin', ?)`
    ).run(admin_name, admin_email, passwordHash, tenant.id);

    const token = await createSession({
      userId: result.lastInsertRowid,
      name: admin_name,
      email: admin_email,
      role: 'admin',
      tenantId: tenant.id,
    });

    res.json({ token, name: admin_name, role: 'admin', tenantId: tenant.id, tenant });
  } catch (err) {
    console.error('[Register]', err.message);
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// ── GET /api/tenants — list all tenants (system_admin only) ──────────────────
router.get('/api/tenants', requireAuth, requireRole('system_admin'), async (req, res) => {
  try {
    const tenants = await listTenants();
    res.json({ tenants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/tenants/:id — update tenant info (system_admin only) ──────────
router.patch('/api/tenants/:id', requireAuth, requireRole('system_admin'), async (req, res) => {
  try {
    const tenant = await updateTenant(req.params.id, req.body);
    res.json({ tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/tenants/:id — remove tenant (system_admin only) ──────────────
router.delete('/api/tenants/:id', requireAuth, requireRole('system_admin'), async (req, res) => {
  try {
    await deleteTenant(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tenant/me — get current user's tenant info ──────────────────────
router.get('/api/tenant/me', requireAuth, (req, res) => {
  res.json({ tenant: req.tenant || null });
});

// ── PATCH /api/tenant/me — tenant admin updates their own company info ────────
router.patch('/api/tenant/me', requireAuth, requireRole('system_admin', 'admin'), async (req, res) => {
  const tenantId = req.session.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'No tenant associated with this account' });
  try {
    const tenant = await updateTenant(tenantId, req.body);
    res.json({ tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
