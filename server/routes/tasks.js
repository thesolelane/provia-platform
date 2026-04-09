'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireFields, validateEnum } = require('../middleware/validate');
const { getDb } = require('../db/database');
const { logAudit } = require('../services/auditService');
const gcal = require('../services/googleCalendar');

// ── Google Calendar "add link" URL (fallback if API push fails) ───────────────
function calDate(iso) {
  return iso
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z?$/, '')
    .slice(0, 15);
}

function makeCalendarURL(task) {
  if (!task.due_at) return null;
  try {
    const start = calDate(task.due_at);
    const endDt = new Date(new Date(task.due_at).getTime() + 60 * 60 * 1000);
    const end = calDate(endDt.toISOString());
    const parts = [`action=TEMPLATE`, `text=${encodeURIComponent(task.title)}`];
    parts.push(`dates=${start}/${end}`);
    if (task.description) parts.push(`details=${encodeURIComponent(task.description)}`);
    const job = task.job_id
      ? getDb().prepare('SELECT project_address FROM jobs WHERE id = ?').get(task.job_id)
      : null;
    if (job?.project_address) parts.push(`location=${encodeURIComponent(job.project_address)}`);
    return `https://calendar.google.com/calendar/render?${parts.join('&')}`;
  } catch {
    return null;
  }
}

// ── Get calendar settings ─────────────────────────────────────────────────────
function getCalSettings(db) {
  const calId =
    db.prepare("SELECT value FROM settings WHERE key = 'gcal.calendarId'").get()?.value ||
    'primary';
  const enabled = db.prepare("SELECT value FROM settings WHERE key = 'gcal.enabled'").get()?.value;
  return { calendarId: calId, enabled: enabled !== 'false' };
}

// ── Enrich task with related job/contact/lead info ────────────────────────────
function enrichTask(task) {
  if (!task) return null;
  const db = getDb();
  let jobInfo = null,
    contactInfo = null,
    leadInfo = null;
  if (task.job_id) {
    jobInfo = db
      .prepare('SELECT id, customer_name, project_address, status FROM jobs WHERE id = ?')
      .get(task.job_id);
  }
  if (task.contact_id) {
    contactInfo = db
      .prepare('SELECT id, name, email, phone FROM contacts WHERE id = ?')
      .get(task.contact_id);
  }
  if (task.lead_id) {
    leadInfo = db
      .prepare(
        'SELECT id, caller_name, caller_phone, stage, archived, job_address, job_city FROM leads WHERE id = ?'
      )
      .get(task.lead_id);
  }
  return { ...task, job: jobInfo, contact: contactInfo, lead: leadInfo || null };
}

// ── GET /api/tasks ────────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { status, job_id, contact_id, range } = req.query;
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (job_id) {
    sql += ' AND job_id = ?';
    params.push(job_id);
  }
  if (contact_id) {
    sql += ' AND contact_id = ?';
    params.push(contact_id);
  }
  if (range === 'today') {
    sql += " AND date(due_at) = date('now')";
  } else if (range === 'week') {
    sql += " AND due_at <= datetime('now', '+7 days')";
  }
  sql += ' ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, created_at DESC';
  const tasks = db
    .prepare(sql)
    .all(...params)
    .map(enrichTask);
  const todayCount = db
    .prepare("SELECT COUNT(*) as n FROM tasks WHERE status='pending' AND date(due_at)=date('now')")
    .get().n;
  const overdue = db
    .prepare(
      "SELECT COUNT(*) as n FROM tasks WHERE status='pending' AND due_at < datetime('now') AND due_at IS NOT NULL"
    )
    .get().n;
  res.json({ tasks, todayCount, overdue });
});

// ── GET /api/tasks/calendars — list user's Google Calendars ──────────────────
router.get('/calendars', requireAuth, async (req, res) => {
  try {
    const cals = await gcal.listCalendars();
    res.json({
      calendars: cals.map((c) => ({ id: c.id, summary: c.summary, primary: c.primary }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tasks ───────────────────────────────────────────────────────────
router.post('/', requireAuth, requireFields(['title']), async (req, res) => {
  const db = getDb();
  const { title, description, due_at, job_id, contact_id, priority } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

  const defaultRemindAt = new Date(Date.now() + 168 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);

  const info = db
    .prepare(
      `
    INSERT INTO tasks (title, description, due_at, job_id, contact_id, priority, calendar_url, remind_at, remind_interval_hours)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 168)
  `
    )
    .run(
      title.trim(),
      description?.trim() || null,
      due_at || null,
      job_id || null,
      contact_id || null,
      priority || 'normal',
      null,
      defaultRemindAt
    );

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);

  // Try to push to Google Calendar; fall back to "add link" URL
  let calURL = makeCalendarURL(task);
  const { calendarId, enabled } = getCalSettings(db);

  if (enabled && task.due_at) {
    try {
      const gcalLink = await gcal.createCalendarEvent(task, calendarId);
      if (gcalLink) calURL = gcalLink;
    } catch (e) {
      console.warn('[GCal] Could not auto-create event:', e.message);
    }
  }

  if (calURL) {
    db.prepare('UPDATE tasks SET calendar_url = ? WHERE id = ?').run(calURL, task.id);
    task.calendar_url = calURL;
  }

  if (job_id) logAudit(job_id, 'task_created', `Task created: ${task.title}`, 'admin');
  res.json({ task: enrichTask(task) });
});

// ── PATCH /api/tasks/:id ──────────────────────────────────────────────────────
router.patch(
  '/:id',
  requireAuth,
  validateEnum('status', ['pending', 'in_progress', 'done', 'cancelled']),
  validateEnum('priority', ['low', 'normal', 'high', 'urgent']),
  (req, res) => {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { title, description, due_at, status, priority, remind_at, remind_interval_hours } =
      req.body;
    const newTitle = title !== undefined ? title.trim() : task.title;
    const newDescription = description !== undefined ? description.trim() : task.description;
    const newDueAt = due_at !== undefined ? due_at : task.due_at;
    const newStatus = status !== undefined ? status : task.status;
    const newPriority = priority !== undefined ? priority : task.priority;
    const newRemindAt = remind_at !== undefined ? remind_at : task.remind_at;
    const VALID_INTERVALS = [2, 3, 24, 48, 72, 168, 336];
    const parsedInterval =
      remind_interval_hours !== undefined ? parseInt(remind_interval_hours, 10) : null;
    const newRemindIntervalHours =
      parsedInterval !== null && VALID_INTERVALS.includes(parsedInterval)
        ? parsedInterval
        : task.remind_interval_hours || 168;

    const updated = { ...task, title: newTitle, description: newDescription, due_at: newDueAt };
    const calURL = makeCalendarURL(updated);

    db.prepare(
      `
    UPDATE tasks SET title=?, description=?, due_at=?, status=?, priority=?, calendar_url=?,
      remind_at=?, remind_interval_hours=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `
    ).run(
      newTitle,
      newDescription,
      newDueAt,
      newStatus,
      newPriority,
      calURL,
      newRemindAt,
      newRemindIntervalHours,
      task.id
    );

    if (task.job_id && status && status !== task.status) {
      logAudit(task.job_id, 'task_status_changed', `Task "${newTitle}" → ${newStatus}`, 'admin');
    }

    res.json({ task: enrichTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id)) });
  }
);

// ── DELETE /api/tasks/:id ─────────────────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = { router, makeCalendarURL };
