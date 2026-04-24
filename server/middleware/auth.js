'use strict';
const { getTenantById } = require('../services/tenantService');

const sessions = new Map();

function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'] || (req.method === 'GET' ? req.query.token : undefined);
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.session = sessions.get(token);
  req.tenant = req.session.tenant || null;
  next();
}

function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.session || !allowed.includes(req.session.role)) {
      return res.status(403).json({ error: 'Forbidden — insufficient role' });
    }
    next();
  };
}

async function createSession({ userId, name, email, role, tenantId }) {
  const token = require('crypto').randomBytes(32).toString('hex');

  let tenant = null;
  if (tenantId) {
    try { tenant = await getTenantById(tenantId); } catch { /* ignore */ }
  }

  sessions.set(token, { userId, name, email, role, tenantId, tenant, createdAt: Date.now() });
  setTimeout(() => sessions.delete(token), 24 * 60 * 60 * 1000);
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

function isValidSession(token) {
  return token && sessions.has(token);
}

module.exports = { requireAuth, requireRole, createSession, destroySession, isValidSession };
