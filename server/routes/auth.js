// server/routes/auth.js
const express = require('express');
const router = express.Router();
const { createSession } = require('../middleware/auth');

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = createSession('admin');
  res.json({ token, message: 'Logged in successfully' });
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out' });
});

module.exports = router;
