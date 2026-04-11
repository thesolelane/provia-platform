// server/routes/staffChat.js
// Staff in-app team chat: GET /messages, POST /message, GET /events (SSE)

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');
const {
  addChannelClient,
  removeChannelClient,
  notifyChannelClients,
} = require('../services/sseManager');

const CHAT_CHANNEL = 'staff-chat';

// GET /messages — last 50 messages
router.get('/messages', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const messages = db
      .prepare(
        `SELECT id, sender_name, message, created_at
         FROM staff_messages
         ORDER BY created_at DESC
         LIMIT 50`,
      )
      .all()
      .reverse();
    res.json(messages);
  } catch (err) {
    console.error('[staffChat] GET /messages error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /message — save and broadcast to staff-chat channel subscribers only
router.post('/message', requireAuth, (req, res) => {
  const { message } = req.body;
  const senderName = req.session.name;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const db = getDb();
    const result = db
      .prepare(`INSERT INTO staff_messages (sender_name, message) VALUES (?, ?)`)
      .run(senderName, message.trim());

    const newMsg = db
      .prepare(`SELECT id, sender_name, message, created_at FROM staff_messages WHERE id = ?`)
      .get(result.lastInsertRowid);

    notifyChannelClients(CHAT_CHANNEL, 'staff-chat', newMsg);
    res.json(newMsg);
  } catch (err) {
    console.error('[staffChat] POST /message error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /events — SSE stream scoped to the staff-chat channel (isolated from global SSE pool)
router.get('/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  addChannelClient(CHAT_CHANNEL, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      removeChannelClient(CHAT_CHANNEL, res);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeChannelClient(CHAT_CHANNEL, res);
  });
});

module.exports = router;
