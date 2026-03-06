// server/routes/adminChat.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { adminChat } = require('../services/claudeService');

// In-memory chat history per session
const chatHistories = new Map();

router.post('/', requireAuth, async (req, res) => {
  const { message, sessionId = 'default', language = 'en' } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  if (!chatHistories.has(sessionId)) chatHistories.set(sessionId, []);
  const history = chatHistories.get(sessionId);

  history.push({ role: 'user', content: message });

  try {
    const reply = await adminChat(history, language);
    history.push({ role: 'assistant', content: reply });

    // Keep history to last 20 messages
    if (history.length > 20) history.splice(0, history.length - 20);

    res.json({ reply, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/history/:sessionId', requireAuth, (req, res) => {
  chatHistories.delete(req.params.sessionId);
  res.json({ success: true });
});

module.exports = router;
