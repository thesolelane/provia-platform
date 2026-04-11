// server/routes/staffChat.js
// Staff in-app team chat: group messages + private DMs

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');
const {
  addChannelClient,
  removeChannelClient,
  notifyChannelClients,
} = require('../services/sseManager');

const GROUP_CHANNEL = 'staff-chat';
const dmChannel = (name) => `staff-dm-${name}`;

// GET /messages — last 50 group messages (recipient IS NULL)
router.get('/messages', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const messages = db
      .prepare(
        `SELECT id, sender_name, message, created_at
         FROM staff_messages
         WHERE recipient IS NULL
         ORDER BY created_at DESC
         LIMIT 50`,
      )
      .all()
      .reverse();
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /message — send group message
router.post('/message', requireAuth, (req, res) => {
  const { message } = req.body;
  const senderName = req.session.name;
  if (!message || !message.trim()) return res.status(400).json({ error: 'message is required' });
  try {
    const db = getDb();
    const result = db
      .prepare(`INSERT INTO staff_messages (sender_name, message, recipient) VALUES (?, ?, NULL)`)
      .run(senderName, message.trim());
    const newMsg = db
      .prepare(`SELECT id, sender_name, message, created_at FROM staff_messages WHERE id = ?`)
      .get(result.lastInsertRowid);
    notifyChannelClients(GROUP_CHANNEL, 'staff-chat', newMsg);
    res.json(newMsg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /users — list of all active staff users (for DM user picker)
router.get('/users', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const users = db
      .prepare(`SELECT name FROM users WHERE active = 1 ORDER BY name ASC`)
      .all()
      .map((u) => u.name);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /dm/:recipient — DM history between current user and recipient
router.get('/dm/:recipient', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const me = req.session.name;
    const other = req.params.recipient;
    const messages = db
      .prepare(
        `SELECT id, sender_name, recipient, message, created_at
         FROM staff_messages
         WHERE recipient IS NOT NULL
           AND ((sender_name = ? AND recipient = ?) OR (sender_name = ? AND recipient = ?))
         ORDER BY created_at DESC
         LIMIT 100`,
      )
      .all(me, other, other, me)
      .reverse();
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /dm — send a private message
router.post('/dm', requireAuth, (req, res) => {
  const { recipient, message } = req.body;
  const senderName = req.session.name;
  if (!recipient || !message || !message.trim())
    return res.status(400).json({ error: 'recipient and message are required' });
  try {
    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO staff_messages (sender_name, recipient, message) VALUES (?, ?, ?)`,
      )
      .run(senderName, recipient, message.trim());
    const newMsg = db
      .prepare(
        `SELECT id, sender_name, recipient, message, created_at FROM staff_messages WHERE id = ?`,
      )
      .get(result.lastInsertRowid);
    // Notify both sender's and recipient's DM channels
    notifyChannelClients(dmChannel(senderName), 'staff-dm', newMsg);
    notifyChannelClients(dmChannel(recipient), 'staff-dm', newMsg);
    res.json(newMsg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /events — SSE stream: group chat + this user's DM channel
router.get('/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const myDmChannel = dmChannel(req.session.name);
  addChannelClient(GROUP_CHANNEL, res);
  addChannelClient(myDmChannel, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      removeChannelClient(GROUP_CHANNEL, res);
      removeChannelClient(myDmChannel, res);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeChannelClient(GROUP_CHANNEL, res);
    removeChannelClient(myDmChannel, res);
  });
});

module.exports = router;
