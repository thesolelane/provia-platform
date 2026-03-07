// server/middleware/auth.js
// Simple password-based admin panel protection

const sessions = new Map(); // In-memory sessions (fine for single-admin tool)

function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.session = sessions.get(token);
  next();
}

function createSession(role) {
  const token = require('crypto').randomBytes(32).toString('hex');
  sessions.set(token, { role, createdAt: Date.now() });
  // Expire after 24 hours
  setTimeout(() => sessions.delete(token), 24 * 60 * 60 * 1000);
  return token;
}

module.exports = { requireAuth, createSession };
