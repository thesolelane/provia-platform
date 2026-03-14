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

function createSession({ userId, name, email, role }) {
  const token = require('crypto').randomBytes(32).toString('hex');
  sessions.set(token, { userId, name, email, role, createdAt: Date.now() });
  setTimeout(() => sessions.delete(token), 24 * 60 * 60 * 1000);
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

module.exports = { requireAuth, createSession, destroySession };
