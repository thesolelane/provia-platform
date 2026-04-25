'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getDb } = require('../db/database');
const { listTenants, createTenant, updateTenant, deleteTenant } = require('../services/tenantService');
const { supabaseAdmin } = require('../services/supabase');
const bcrypt = require('bcryptjs');
const { createSession } = require('../middleware/auth');

const isAdmin = [requireAuth, requireRole('system_admin')];

// ── GET /api/admin/health — platform health summary ──────────────────────────
router.get('/api/admin/health', ...isAdmin, (req, res) => {
  const db = getDb();

  const jobs      = db.prepare('SELECT COUNT(*) as c FROM jobs').get().c;
  const users     = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const tasks     = db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
  const leads     = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
  const signing   = db.prepare("SELECT COUNT(*) as c FROM signing_sessions WHERE status='signed'").get().c;
  const pending   = db.prepare("SELECT COUNT(*) as c FROM signing_sessions WHERE status='sent'").get().c;
  const invoices  = db.prepare('SELECT COUNT(*) as c FROM invoices').get().c;
  const contacts  = db.prepare('SELECT COUNT(*) as c FROM contacts').get().c;

  const services = {
    database:   { ok: true, label: 'SQLite Database' },
    anthropic:  { ok: !!process.env.ANTHROPIC_API_KEY,  label: 'Claude AI (Anthropic)' },
    twilio:     { ok: !!process.env.TWILIO_ACCOUNT_SID, label: 'Twilio SMS' },
    whatsapp:   { ok: !!process.env.TWILIO_WHATSAPP_NUMBER, label: 'WhatsApp' },
    email:      { ok: !!process.env.SMTP_USER || !!process.env.RESEND_API_KEY, label: 'Email' },
    supabase:   { ok: !!supabaseAdmin, label: 'Supabase' },
    pdf:        { ok: true, label: 'PDF Generation' },
  };

  res.json({
    stats: { jobs, users, tasks, leads, signing, pending, invoices, contacts },
    services,
    uptime: process.uptime(),
    nodeVersion: process.version,
    platform: 'Provia v2.0',
  });
});

// ── GET /api/admin/tenants — list all tenants ────────────────────────────────
router.get('/api/admin/tenants', ...isAdmin, async (req, res) => {
  try {
    const tenants = await listTenants();
    const db = getDb();
    // Attach user count per tenant
    const enriched = tenants.map(t => {
      const userCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE tenant_id = ?').get(t.id)?.c || 0;
      const jobCount  = db.prepare('SELECT COUNT(*) as c FROM jobs WHERE tenant_id = ?').get(t.id)?.c || 0;
      return { ...t, user_count: userCount, job_count: jobCount };
    });
    res.json({ tenants: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/tenants — create tenant manually ────────────────────────
router.post('/api/admin/tenants', ...isAdmin, async (req, res) => {
  try {
    const tenant = await createTenant(req.body);
    res.json({ tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/tenants/:id — update tenant ─────────────────────────────
router.patch('/api/admin/tenants/:id', ...isAdmin, async (req, res) => {
  try {
    const tenant = await updateTenant(req.params.id, req.body);
    res.json({ tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/admin/tenants/:id — remove tenant ────────────────────────────
router.delete('/api/admin/tenants/:id', ...isAdmin, async (req, res) => {
  try {
    await deleteTenant(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/users — all users across all tenants ──────────────────────
router.get('/api/admin/users', ...isAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, name, email, role, tenant_id, active, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json({ users });
});

// ── POST /api/admin/users — create user for a tenant ────────────────────────
router.post('/api/admin/users', ...isAdmin, async (req, res) => {
  const { name, email, password, role, tenant_id } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password and role are required' });
  }
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already exists' });
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash, role, tenant_id) VALUES (?, ?, ?, ?, ?)'
    ).run(name, email, hash, role, tenant_id || null);
    res.json({ id: result.lastInsertRowid, name, email, role, tenant_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/users/:id/password — reset a user's password ────────────
router.patch('/api/admin/users/:id/password', ...isAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const db = getDb();
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/users/:id — update user role/active ─────────────────────
router.patch('/api/admin/users/:id', ...isAdmin, (req, res) => {
  const { role, active, name } = req.body;
  const db = getDb();
  const sets = [];
  const vals = [];
  if (role  !== undefined) { sets.push('role = ?');   vals.push(role); }
  if (active !== undefined) { sets.push('active = ?'); vals.push(active ? 1 : 0); }
  if (name  !== undefined) { sets.push('name = ?');   vals.push(name); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id);
  const result = db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  if (!result.changes) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

// ── GET /api/admin/stats — platform-wide metrics ─────────────────────────────
router.get('/api/admin/stats', ...isAdmin, (req, res) => {
  const db = getDb();

  const recentJobs = db.prepare(
    "SELECT id, customer_name, project_address, status, total_value, created_at FROM jobs ORDER BY created_at DESC LIMIT 10"
  ).all();

  const jobsByStatus = db.prepare(
    "SELECT status, COUNT(*) as count FROM jobs GROUP BY status ORDER BY count DESC"
  ).all();

  const recentUsers = db.prepare(
    "SELECT id, name, email, role, tenant_id, created_at FROM users ORDER BY created_at DESC LIMIT 10"
  ).all();

  const tokenUsage = db.prepare(
    "SELECT service, SUM(input_tokens) as input, SUM(output_tokens) as output FROM token_usage GROUP BY service"
  ).all();

  res.json({ recentJobs, jobsByStatus, recentUsers, tokenUsage });
});

// ── POST /api/admin/impersonate/:tenantId — get session as tenant admin ───────
router.post('/api/admin/impersonate/:tenantId', ...isAdmin, async (req, res) => {
  const db = getDb();
  const tenantUser = db.prepare(
    "SELECT * FROM users WHERE tenant_id = ? AND role IN ('admin','system_admin') ORDER BY id ASC LIMIT 1"
  ).get(req.params.tenantId);
  if (!tenantUser) return res.status(404).json({ error: 'No admin user found for this tenant' });

  const token = await createSession({
    userId: tenantUser.id,
    name: tenantUser.name,
    email: tenantUser.email,
    role: tenantUser.role,
    tenantId: req.params.tenantId,
  });
  res.json({ token, name: tenantUser.name, role: tenantUser.role, tenantId: req.params.tenantId });
});

module.exports = router;
