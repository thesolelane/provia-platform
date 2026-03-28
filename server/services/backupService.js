// server/services/backupService.js
// Automatic SQLite + uploads backup with rotation, scheduling, and email alerts.

const fs   = require('fs');
const path = require('path');

const DB_PATH      = path.resolve(__dirname, '../../data/pb_system.db');
const DEFAULT_BACKUP_DIR = path.resolve(__dirname, '../../data/backups');
const MAX_BACKUPS  = 14; // keep 14 rolling backups

function getBackupDir() {
  // Priority: PBBKUPS secret → DB custom path → default
  if (process.env.PBBKUPS && process.env.PBBKUPS.trim().length > 0) {
    return process.env.PBBKUPS.trim();
  }
  try {
    const { getDb } = require('../db/database');
    const custom = getDb().prepare("SELECT value FROM settings WHERE key = 'backup.customPath'").get()?.value?.trim();
    return (custom && custom.length > 0) ? custom : DEFAULT_BACKUP_DIR;
  } catch { return DEFAULT_BACKUP_DIR; }
}

let backupTimeout = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function timestamp() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(/[\/:, ]/g, '-').replace(/--/g, '-');
}

function getBackupScheduleHours() {
  try {
    const { getDb } = require('../db/database');
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'backup.intervalHours'").get();
    return Math.max(1, parseInt(row?.value || '24', 10));
  } catch { return 24; }
}

function listBackups() {
  const dir = getBackupDir();
  ensureDir(dir);
  return fs.readdirSync(dir)
    .filter(f => f.startsWith('pb_system_') && f.endsWith('.db'))
    .sort()
    .map(f => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { file: f, path: full, size: stat.size, mtime: stat.mtime };
    });
}

// ── Core backup function ──────────────────────────────────────────────────────

async function runBackup() {
  const ts = timestamp();
  const label = `[Backup ${ts}]`;
  const BACKUP_DIR = getBackupDir();
  console.log(`${label} Starting database backup → ${BACKUP_DIR}`);

  ensureDir(BACKUP_DIR);

  const destFile = `pb_system_${ts}.db`;
  const destPath = path.join(BACKUP_DIR, destFile);

  let dbSizeBytes = 0;

  try {
    // Use better-sqlite3's built-in backup() for an atomic, consistent snapshot
    const Database = require('better-sqlite3');
    const srcDb = new Database(DB_PATH, { readonly: true });
    await srcDb.backup(destPath);
    srcDb.close();

    dbSizeBytes = fs.statSync(destPath).size;
    console.log(`${label} DB snapshot saved → ${destFile} (${formatBytes(dbSizeBytes)})`);
  } catch (e) {
    console.error(`${label} DB backup FAILED: ${e.message}`);
    await notifyFailure(label, e.message);
    return { ok: false, error: e.message };
  }

  // Rotate — delete oldest if over limit
  const backups = listBackups();
  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(0, backups.length - MAX_BACKUPS);
    for (const b of toDelete) {
      try { fs.unlinkSync(b.path); console.log(`${label} Rotated old backup: ${b.file}`); }
      catch (e) { console.warn(`${label} Could not delete ${b.file}: ${e.message}`); }
    }
  }

  // Record last backup time in settings
  try {
    const { getDb } = require('../db/database');
    const db = getDb();
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO settings (key, value, category, label)
      VALUES ('backup.lastRanAt', ?, 'backup', 'Last Backup Timestamp')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(nowIso);
    db.prepare(`
      INSERT INTO settings (key, value, category, label)
      VALUES ('backup.lastFile', ?, 'backup', 'Last Backup Filename')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(destFile);
  } catch {}

  const remaining = listBackups();
  const result = {
    ok: true,
    file: destFile,
    dbSize: formatBytes(dbSizeBytes),
    totalBackups: remaining.length,
    backups: remaining.map(b => ({ file: b.file, size: formatBytes(b.size), date: b.mtime })),
  };

  console.log(`${label} ✅ Complete — ${remaining.length} backups on disk`);
  return result;
}

// ── Email failure alert ───────────────────────────────────────────────────────

async function notifyFailure(label, errorMessage) {
  try {
    const { sendEmail, getOwnerEmails } = require('./emailService');
    const owners = getOwnerEmails();
    if (!owners.length) return;
    await sendEmail({
      to: owners,
      subject: '🔴 Preferred Builders — Backup FAILED',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px">
          <div style="background:#C62828;padding:16px 20px;color:white;border-radius:8px 8px 0 0;font-weight:bold;font-size:16px">
            🔴 Database Backup Failed
          </div>
          <div style="background:white;padding:20px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
            <p style="font-size:14px">A scheduled backup attempt failed at <strong>${new Date().toLocaleString('en-US',{timeZone:'America/New_York'})}</strong> ET.</p>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;font-family:monospace;font-size:12px;color:#C62828">${errorMessage}</div>
            <p style="font-size:13px;color:#555;margin-top:12px">Please check the server and manually back up <code>data/pb_system.db</code> as soon as possible.</p>
          </div>
        </div>`,
      emailType: 'system_alert',
    });
  } catch {}
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

function scheduleNextBackup() {
  if (backupTimeout) clearTimeout(backupTimeout);
  const hours = getBackupScheduleHours();
  const delayMs = hours * 60 * 60 * 1000;
  console.log(`💾 Next backup in ${hours}h`);
  backupTimeout = setTimeout(async () => {
    await runBackup();
    scheduleNextBackup();
  }, delayMs);
}

function startBackupScheduler() {
  if (backupTimeout) return;
  const hours = getBackupScheduleHours();
  console.log(`💾 Backup scheduler started (every ${hours}h, first run in 60s)`);
  // First run 60 seconds after boot
  backupTimeout = setTimeout(async () => {
    await runBackup();
    scheduleNextBackup();
  }, 60 * 1000);
}

function stopBackupScheduler() {
  if (backupTimeout) { clearTimeout(backupTimeout); backupTimeout = null; }
}

function rescheduleBackups() {
  stopBackupScheduler();
  scheduleNextBackup();
}

module.exports = { startBackupScheduler, stopBackupScheduler, rescheduleBackups, runBackup, listBackups, formatBytes };
