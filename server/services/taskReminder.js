'use strict';
// server/services/taskReminder.js
// Background scheduler that sends reminder emails for open tasks.

const { getDb } = require('../db/database');
const { sendEmail } = require('./emailService');

function getAdminEmails(db) {
  try {
    return db
      .prepare(
        `SELECT email FROM users WHERE role IN ('admin','system_admin') AND email IS NOT NULL AND active != 0`
      )
      .all()
      .map((u) => u.email)
      .filter(Boolean);
  } catch {
    return db
      .prepare(
        `SELECT email FROM users WHERE role IN ('admin','system_admin') AND email IS NOT NULL`
      )
      .all()
      .map((u) => u.email)
      .filter(Boolean);
  }
}

async function runReminderTick() {
  const db = getDb();

  const dueTasks = db
    .prepare(
      `SELECT * FROM tasks
       WHERE status NOT IN ('done','cancelled')
         AND remind_at IS NOT NULL
         AND remind_at <= datetime('now')`
    )
    .all();

  if (!dueTasks.length) return;

  const adminEmails = getAdminEmails(db);

  if (!adminEmails.length) {
    console.log('[TaskReminder] No admin emails found — skipping');
    return;
  }

  const appUrl =
    process.env.APP_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '');
  const tasksLink = appUrl ? `${appUrl}/tasks` : '/tasks';

  for (const task of dueTasks) {
    const intervalHours = Math.max(1, Math.min(task.remind_interval_hours || 168, 8760));
    const nextRemindAt = new Date(Date.now() + intervalHours * 60 * 60 * 1000);
    const nextRemindStr = nextRemindAt.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    try {
      await sendEmail({
        to: adminEmails,
        subject: `\uD83D\uDD14 Reminder: ${task.title}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px">
            <h2 style="color:#1B3A6B">\uD83D\uDD14 Task Reminder</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr>
                <td style="padding:8px;color:#555">Task</td>
                <td style="padding:8px;font-weight:bold">${task.title}</td>
              </tr>
              ${
                task.description
                  ? `<tr style="background:#f9f9f9">
                       <td style="padding:8px;color:#555">Description</td>
                       <td style="padding:8px">${task.description.replace(/\n/g, '<br>')}</td>
                     </tr>`
                  : ''
              }
              <tr>
                <td style="padding:8px;color:#555">Status</td>
                <td style="padding:8px">${task.status}</td>
              </tr>
              <tr style="background:#f9f9f9">
                <td style="padding:8px;color:#555">Next reminder</td>
                <td style="padding:8px">${nextRemindStr}</td>
              </tr>
            </table>
            <p>
              <a href="${tasksLink}" style="background:#1B3A6B;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:12px">
                View Tasks
              </a>
            </p>
          </div>`,
        emailType: 'task_reminder',
      });
      console.log(`[TaskReminder] Reminder sent for task #${task.id}: "${task.title}"`);
      db.prepare(
        `UPDATE tasks SET remind_at = datetime('now', '+' || ? || ' hours') WHERE id = ?`
      ).run(intervalHours, task.id);
    } catch (err) {
      console.error(`[TaskReminder] Failed to send reminder for task #${task.id}:`, err.message);
    }
  }
}

function startTaskReminderScheduler() {
  console.log('[TaskReminder] Scheduler started — checking every 60 minutes');
  runReminderTick().catch((e) => console.error('[TaskReminder] Initial tick error:', e.message));
  setInterval(() => {
    runReminderTick().catch((e) => console.error('[TaskReminder] Tick error:', e.message));
  }, 60 * 60 * 1000);
}

module.exports = { startTaskReminderScheduler };
