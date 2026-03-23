// server/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { createSession, destroySession } = require('../middleware/auth');
const { getDb } = require('../db/database');

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = createSession({ userId: user.id, name: user.name, email: user.email, role: user.role });
  res.json({ token, name: user.name, role: user.role, message: 'Logged in successfully' });
});

router.post('/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) destroySession(token);
  res.json({ message: 'Logged out' });
});

// GET /api/auth/validate — lightweight session check (no DB hit)
const { requireAuth } = require('../middleware/auth');
router.get('/validate', requireAuth, (req, res) => {
  res.json({ ok: true, name: req.session.name, role: req.session.role });
});

module.exports = router;
