// server/middleware/auth.js
const sessions = new Map();

function requireAuth(req, res, next) {
  // Accept query token only on safe GET requests (e.g. photo/PDF file links in emails)
  // All mutating endpoints (POST/PATCH/DELETE) must use the x-auth-token header only
  const token = req.headers['x-auth-token'] || (req.method === 'GET' ? req.query.token : undefined);
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.session = sessions.get(token);
  next();
}

// Restrict endpoint to specific roles (call after requireAuth)
function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.session || !allowed.includes(req.session.role)) {
      return res.status(403).json({ error: 'Forbidden — insufficient role' });
    }
    next();
  };
}

function createSession({ userId, name, email, role }) {
  const token = require('crypto').randomBytes(32).toString('hex');
  sessions.set(token, { userId, name, email, role, createdAt: Date.now() });
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
