// server/routes/users.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireAuth } = require('../middleware/auth');
const {
  requireFields,
  validateEmail,
  validateEnum,
  validateMinLength
} = require('../middleware/validate');
const { getDb } = require('../db/database');

const ROLE_LEVELS = { system_admin: 4, admin: 3, pm: 2, staff: 1 };
const hasLevel = (role, min) => (ROLE_LEVELS[role] || 0) >= (ROLE_LEVELS[min] || 0);

const safe = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  title: u.title || 'Team Member',
  phone: u.phone || '',
  language: u.language || 'en',
  active: u.active !== 0,
  created_at: u.created_at
});

router.get('/', requireAuth, (req, res) => {
  if (!hasLevel(req.session.role, 'admin')) return res.status(403).json({ error: 'Forbidden' });
  const db = getDb();
  const users = db.prepare('SELECT * FROM users ORDER BY id ASC').all();
  res.json(users.map(safe));
});

router.post(
  '/',
  requireAuth,
  requireFields(['name', 'email', 'password', 'role']),
  validateEmail('email'),
  validateMinLength('password', 8),
  validateEnum('role', Object.keys(ROLE_LEVELS)),
  (req, res) => {
    if (!hasLevel(req.session.role, 'system_admin'))
      return res.status(403).json({ error: 'Forbidden' });
    const { name, email, password, role, title, phone, language } = req.body;
    if (!ROLE_LEVELS[role]) return res.status(400).json({ error: 'Invalid role' });
    const db = getDb();
    const hash = bcrypt.hashSync(password, 10);
    try {
      const result = db
        .prepare(
          'INSERT INTO users (name, email, password_hash, role, title, phone, language, active) VALUES (?,?,?,?,?,?,?,1)'
        )
        .run(
          name,
          email.toLowerCase().trim(),
          hash,
          role,
          title || 'Team Member',
          phone || '',
          language || 'en'
        );
      const created = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
      res.json(safe(created));
    } catch (e) {
      if (e.message.includes('UNIQUE'))
        return res.status(409).json({ error: 'Email already exists' });
      throw e;
    }
  }
);

router.put(
  '/:id',
  requireAuth,
  validateEmail('email'),
  validateEnum('role', Object.keys(ROLE_LEVELS)),
  (req, res) => {
    const db = getDb();
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const isSelf = req.session.userId === target.id;
    const isSysAdmin = hasLevel(req.session.role, 'system_admin');
    if (!isSelf && !isSysAdmin) return res.status(403).json({ error: 'Forbidden' });
    const { name, title, phone, language, active, role } = req.body;
    if (role !== undefined && !isSysAdmin)
      return res.status(403).json({ error: 'Only system admin can change roles' });
    if (role !== undefined && !ROLE_LEVELS[role])
      return res.status(400).json({ error: 'Invalid role' });
    const updated = {
      name: name !== undefined ? name : target.name,
      title: title !== undefined ? title : target.title || 'Team Member',
      phone: phone !== undefined ? phone : target.phone || '',
      language: language !== undefined ? language : target.language || 'en',
      active: active !== undefined ? (active ? 1 : 0) : target.active !== 0 ? 1 : 0,
      role: role !== undefined ? role : target.role
    };
    db.prepare(
      'UPDATE users SET name=?, title=?, phone=?, language=?, active=?, role=? WHERE id=?'
    ).run(
      updated.name,
      updated.title,
      updated.phone,
      updated.language,
      updated.active,
      updated.role,
      target.id
    );
    const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(target.id);
    res.json(safe(refreshed));
  }
);

router.put(
  '/:id/password',
  requireAuth,
  requireFields(['newPassword']),
  validateMinLength('newPassword', 8),
  (req, res) => {
    const db = getDb();
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const isSelf = req.session.userId === target.id;
    const isSysAdmin = hasLevel(req.session.role, 'system_admin');
    if (!isSelf && !isSysAdmin) return res.status(403).json({ error: 'Forbidden' });
    const { currentPassword, newPassword } = req.body;
    if (isSelf && !isSysAdmin) {
      if (!currentPassword || !bcrypt.compareSync(currentPassword, target.password_hash)) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, target.id);
    res.json({ ok: true });
  }
);

router.delete('/:id', requireAuth, (req, res) => {
  if (!hasLevel(req.session.role, 'system_admin'))
    return res.status(403).json({ error: 'Forbidden' });
  if (String(req.session.userId) === String(req.params.id))
    return res.status(400).json({ error: 'Cannot delete your own account' });
  const db = getDb();
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.json({ ok: true });
});

module.exports = router;
