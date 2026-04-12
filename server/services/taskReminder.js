'use strict';
// server/services/taskReminder.js
// Background scheduler that sends reminder emails for open tasks.
// - Lead-pipeline tasks (has lead_id or task_type='lead') always get reminders.
// - Manual tasks only fire if the user explicitly picked an interval other than 168h.
// - Reminders always go to the owner and Jackson; assigned user is also included.

const { getDb } = require('../db/database');
const { sendEmail } = require('./emailService');
const { team } = require('../../config/parameters');

function resolveRecipients(db, task) {
  const seen = new Set();
  const recipients = [];

  const add = (email) => {
    if (email && !seen.has(email)) {
      seen.add(email);
      recipients.push(email);
    }
  };

  add(process.env.OWNER_EMAIL || team.owner.email);
  add(team.jackson.email);

  if (task.assigned_to) {
    try {
      const user = db
        .prepare(`SELECT email FROM users WHERE name = ? AND active = 1`)
        .get(task.assigned_to);
      add(user?.email);
    } catch {
      // fall through
    }
  }

  return recipients;
}

async function runReminderTick() {
  const db = getDb();

  const dueTasks = db
    .prepare(
      `SELECT * FROM tasks
       WHERE status NOT IN ('done','cancelled')
         AND remind_at IS NOT NULL
         AND remind_at <= datetime('now')`,
    )
    .all();

  if (!dueTasks.length) return;

  const appUrl =
    process.env.APP_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '');
  const tasksLink = appUrl ? `${appUrl}/tasks` : '/tasks';

  for (const task of dueTasks) {
    // Skip reminders for plain manual tasks that only have the system backfill default (168h).
    // A task gets a real reminder only if:
    //   a) it came from the lead pipeline (has lead_id or task_type = 'lead'), or
    //   b) the user manually picked a specific reminder interval (not the 168h default)
    const isLeadTask = task.task_type === 'lead' || task.lead_id != null;
    const hasExplicitReminder = task.remind_interval_hours !== 168;
    if (!isLeadTask && !hasExplicitReminder) {
      // Clear so it doesn't keep matching on every tick
      db.prepare(`UPDATE tasks SET remind_at = NULL WHERE id = ?`).run(task.id);
      continue;
    }

    const intervalHours = Math.max(1, Math.min(task.remind_interval_hours || 168, 8760));
    const nextRemindAt = new Date(Date.now() + intervalHours * 60 * 60 * 1000);
    const nextRemindStr = nextRemindAt.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const recipients = resolveRecipients(db, task);
    if (!recipients.length) {
      console.log(`[TaskReminder] No recipients for task #${task.id} — skipping`);
      continue;
    }

    const assignedLine = task.assigned_to
      ? `<tr style="background:#f9f9f9"><td style="padding:8px;color:#555">Assigned To</td><td style="padding:8px;font-weight:bold">${task.assigned_to}</td></tr>`
      : '';

    try {
      await sendEmail({
        to: recipients,
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
              ${assignedLine}
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
      console.log(
        `[TaskReminder] Sent for task #${task.id} "${task.title}" → ${recipients.join(', ')}`,
      );
      db.prepare(
        `UPDATE tasks SET remind_at = datetime('now', '+' || ? || ' hours') WHERE id = ?`,
      ).run(intervalHours, task.id);
    } catch (err) {
      console.error(`[TaskReminder] Failed for task #${task.id}:`, err.message);
    }
  }
}

function startTaskReminderScheduler() {
  console.log('[TaskReminder] Scheduler started — checking every 60 minutes');
  runReminderTick().catch((e) => console.error('[TaskReminder] Initial tick error:', e.message));
  setInterval(
    () => {
      runReminderTick().catch((e) => console.error('[TaskReminder] Tick error:', e.message));
    },
    60 * 60 * 1000,
  );
}

module.exports = { startTaskReminderScheduler };
