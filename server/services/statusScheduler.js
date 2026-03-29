// server/services/statusScheduler.js
// Runs all system checks every 24 hours and emails a full status report to owners.

const https = require('https');

let schedulerInterval = null;

// ── Internal check functions ──────────────────────────────────────────────────

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function checkDatabase() {
  try {
    const { getDb } = require('../db/database');
    const db = getDb();
    const jobs = db.prepare('SELECT COUNT(*) as n FROM jobs').get().n;
    const tasks = db.prepare('SELECT COUNT(*) as n FROM tasks').get().n;
    const sigs = db.prepare('SELECT COUNT(*) as n FROM signing_sessions').get().n;
    return {
      ok: true,
      label: 'Database (SQLite)',
      detail: `${jobs} jobs · ${tasks} tasks · ${sigs} signing sessions`
    };
  } catch (e) {
    return { ok: false, label: 'Database (SQLite)', detail: e.message };
  }
}

function checkClaude() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key)
    return { ok: false, label: 'Claude AI (Anthropic)', detail: 'ANTHROPIC_API_KEY not set' };
  if (!key.startsWith('sk-ant-'))
    return { ok: false, label: 'Claude AI (Anthropic)', detail: 'Key format looks wrong' };
  return { ok: true, label: 'Claude AI (Anthropic)', detail: 'API key configured' };
}

function checkSmtp() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user) return { ok: false, label: 'Email (SMTP)', detail: 'SMTP_USER not set' };
  if (!pass) return { ok: false, label: 'Email (SMTP)', detail: 'SMTP_PASS not set' };
  return { ok: true, label: 'Email (SMTP)', detail: `Sending as ${user}` };
}

async function checkTwilio() {
  const sid = process.env.TWILIO_LIVE_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_LIVE_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
  if (!sid) return { ok: false, label: 'Twilio SMS', detail: 'TWILIO_ACCOUNT_SID not set' };
  if (!token) return { ok: false, label: 'Twilio SMS', detail: 'TWILIO_AUTH_TOKEN not set' };
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await httpsGet(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      Authorization: `Basic ${auth}`
    });
    if (res.status === 200) {
      const data = JSON.parse(res.body);
      return {
        ok: true,
        label: 'Twilio SMS',
        detail: `Account: ${data.friendly_name} (${data.status})`
      };
    }
    return { ok: false, label: 'Twilio SMS', detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, label: 'Twilio SMS', detail: e.message };
  }
}

async function checkWhatsApp() {
  const waNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  if (!waNumber)
    return { ok: false, label: 'WhatsApp (Twilio)', detail: 'TWILIO_WHATSAPP_NUMBER not set' };
  const twilio = await checkTwilio();
  if (!twilio.ok)
    return { ok: false, label: 'WhatsApp (Twilio)', detail: `Twilio invalid — ${twilio.detail}` };
  return { ok: true, label: 'WhatsApp (Twilio)', detail: `From: ${waNumber}` };
}

async function checkPDF() {
  const { execSync } = require('child_process');
  const fs = require('fs');
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return {
      ok: true,
      label: 'PDF Generation',
      detail: `Chrome (env): ${process.env.CHROME_PATH}`
    };
  }
  if (process.platform === 'win32') {
    const winPaths = [
      'C:\\Users\\theso\\.cache\\puppeteer\\chrome\\win64-146.0.7680.76\\chrome-win64\\chrome.exe',
      'C:\\Users\\theso\\.cache\\puppeteer\\chrome\\win64-127.0.6533.88\\chrome-win64\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'
    ];
    for (const p of winPaths) {
      if (p && fs.existsSync(p))
        return { ok: true, label: 'PDF Generation', detail: `Chrome: ${p}` };
    }
    return { ok: false, label: 'PDF Generation', detail: 'Chrome not found on Windows' };
  }
  try {
    const p = execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null', {
      timeout: 3000
    })
      .toString()
      .trim();
    if (p) return { ok: true, label: 'PDF Generation', detail: `Chromium: ${p}` };
  } catch {}
  const nixPath =
    '/nix/store/gasnw5878924jbw6bql257ll29hkm4fd-chromium-123.0.6312.105/bin/chromium';
  if (require('fs').existsSync(nixPath))
    return { ok: true, label: 'PDF Generation', detail: 'Chromium (Nix store)' };
  return { ok: false, label: 'PDF Generation', detail: 'Chromium not found' };
}

async function checkSigning() {
  try {
    const { getDb } = require('../db/database');
    const db = getDb();
    const pending = db
      .prepare("SELECT COUNT(*) as n FROM signing_sessions WHERE status IN ('sent','opened')")
      .get().n;
    const signed = db
      .prepare("SELECT COUNT(*) as n FROM signing_sessions WHERE status = 'signed'")
      .get().n;
    return {
      ok: true,
      label: 'Digital Signatures',
      detail: `${pending} pending · ${signed} completed`
    };
  } catch (e) {
    return { ok: false, label: 'Digital Signatures', detail: e.message };
  }
}

// ── Run all checks ────────────────────────────────────────────────────────────

async function runAllChecks() {
  const results = await Promise.all([
    checkDatabase(),
    checkClaude(),
    checkSmtp(),
    checkTwilio(),
    checkWhatsApp(),
    checkPDF(),
    checkSigning()
  ]);
  return results;
}

// ── Build and send email report ───────────────────────────────────────────────

// sendStatusReport({ subject, label, extra, alwaysSend })
// alwaysSend=false → only emails when something fails (silent on all-OK)
async function sendStatusReport({
  subject: subjectOverride,
  label = 'Daily Check',
  extra = '',
  alwaysSend = false
} = {}) {
  const when = new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/New_York'
  });

  console.log(`[StatusScheduler] Running status check (${label}) — ${when}`);

  let results;
  try {
    results = await runAllChecks();
  } catch (e) {
    console.error('[StatusScheduler] Checks failed:', e.message);
    return;
  }

  const allOk = results.every((r) => r.ok);
  const okCount = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  // Skip emailing if everything is fine and this isn't a forced send
  if (allOk && !alwaysSend) {
    console.log(`[StatusScheduler] All OK — silent (no email sent for ${label})`);
    return;
  }

  const rowsHtml = results
    .map(
      (r) => `
    <tr style="border-bottom:1px solid #eee">
      <td style="padding:10px 14px;font-size:14px">${r.ok ? '🟢' : '🔴'}</td>
      <td style="padding:10px 14px;font-size:13px;font-weight:600;color:${r.ok ? '#2E7D32' : '#C62828'}">${r.label}</td>
      <td style="padding:10px 14px;font-size:13px;color:#555">${r.detail}</td>
    </tr>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto">
      <div style="background:#1B3A6B;padding:20px 24px;color:white;border-radius:8px 8px 0 0">
        <div style="font-size:18px;font-weight:700">
          ${allOk ? '✅' : '⚠️'} Preferred Builders — ${label}
        </div>
        <div style="font-size:12px;opacity:0.8;margin-top:4px">${when}</div>
      </div>
      <div style="background:white;padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">

        <div style="padding:12px 16px;border-radius:8px;margin-bottom:20px;
          background:${allOk ? '#f0fdf4' : '#fff8f0'};
          border:1px solid ${allOk ? '#bbf7d0' : '#f59e0b'}">
          <span style="font-size:14px;font-weight:bold;color:${allOk ? '#2E7D32' : '#92400e'}">
            ${
              allOk
                ? '✅ All systems operational — no action needed'
                : `⚠️ ${okCount} of ${results.length} services OK — ${failed.length} issue${failed.length > 1 ? 's' : ''} detected`
            }
          </span>
        </div>

        ${
          !allOk
            ? `
        <div style="margin-bottom:20px;padding:14px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px">
          <div style="font-size:13px;font-weight:bold;color:#C62828;margin-bottom:8px">Issues Detected</div>
          ${failed.map((f) => `<div style="font-size:13px;color:#C62828;margin-bottom:4px">🔴 <strong>${f.label}</strong> — ${f.detail}</div>`).join('')}
        </div>`
            : ''
        }

        <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
          <thead>
            <tr style="background:#F3F6FC">
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#888;width:30px"></th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#888">Service</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#888">Status</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        ${extra ? `<div style="margin-bottom:20px;padding:14px 16px;background:#F3F6FC;border:1px solid #d0d9ee;border-radius:8px;font-size:13px;color:#333">${extra}</div>` : ''}

        <a href="https://preferredbuilders.duckdns.org/settings"
          style="background:#1B3A6B;color:white;padding:12px 24px;border-radius:8px;
          text-decoration:none;font-size:13px;font-weight:700;display:inline-block">
          Open Settings → Status Tab
        </a>

        <p style="font-size:11px;color:#aaa;margin-top:20px">
          Emails send twice daily — once before backup, once after. Additional alerts fire only on errors.
        </p>
      </div>
    </div>`;

  try {
    const { sendEmail, getOwnerEmails } = require('./emailService');
    const owners = getOwnerEmails();
    if (!owners.length) {
      console.warn('[StatusScheduler] No OWNER_EMAIL set — skipping report email');
      return;
    }
    const subject =
      subjectOverride || `${allOk ? '✅' : '⚠️'} Preferred Builders ${label} — ${when}`;
    await sendEmail({
      to: owners,
      subject,
      html,
      emailType: 'system_alert'
    });
    console.log(
      `[StatusScheduler] Report sent to ${owners.join(', ')} — ${okCount}/${results.length} OK (${label})`
    );
  } catch (e) {
    console.error('[StatusScheduler] Failed to send report:', e.message);
  }
}

// ── Scheduler state ───────────────────────────────────────────────────────────

let nextReportTimeout = null; // setTimeout handle for the next report

function getScheduleSettings() {
  try {
    const { getDb } = require('../db/database');
    const db = getDb();
    const intervalRow = db
      .prepare("SELECT value FROM settings WHERE key = 'status.reportIntervalHours'")
      .get();
    const hourRow = db
      .prepare("SELECT value FROM settings WHERE key = 'status.reportHourOfDay'")
      .get();
    const intervalHours = Math.max(1, parseInt(intervalRow?.value || '24', 10));
    const hourOfDay = parseInt(hourRow?.value || '-1', 10); // -1 = disabled
    return { intervalHours, hourOfDay };
  } catch {
    return { intervalHours: 24, hourOfDay: -1 };
  }
}

function scheduleNext() {
  if (nextReportTimeout) clearTimeout(nextReportTimeout);

  const { intervalHours, hourOfDay } = getScheduleSettings();
  let delayMs;

  if (hourOfDay >= 0 && hourOfDay <= 23) {
    // Schedule for next occurrence of that specific hour (ET)
    const now = new Date();
    const etStr = now.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const [datePart, timePart] = etStr.split(', ');
    const [m, d, y] = datePart.split('/');
    const etNow = new Date(`${y}-${m}-${d}T${timePart}-05:00`);
    const target = new Date(etNow);
    target.setHours(hourOfDay, 0, 0, 0);
    if (target <= etNow) target.setDate(target.getDate() + 1); // push to tomorrow if already past
    delayMs = target - etNow;
    console.log(
      `📊 Next status report scheduled for ${hourOfDay}:00 ET (in ${Math.round(delayMs / 60000)} min)`
    );
  } else {
    delayMs = intervalHours * 60 * 60 * 1000;
    console.log(`📊 Next status report in ${intervalHours}h`);
  }

  nextReportTimeout = setTimeout(async () => {
    await sendStatusReport();
    scheduleNext(); // reschedule after each run
  }, delayMs);
}

// ── Start / stop ──────────────────────────────────────────────────────────────

function startStatusScheduler() {
  if (nextReportTimeout) return;
  // Do NOT fire on startup — only send on schedule or from backup service.
  // This prevents an email blast every time the server restarts.
  scheduleNext();
}

function stopStatusScheduler() {
  if (nextReportTimeout) {
    clearTimeout(nextReportTimeout);
    nextReportTimeout = null;
  }
}

// Call this after changing settings so the new schedule takes effect immediately
function rescheduleStatusReports() {
  stopStatusScheduler();
  scheduleNext();
}

module.exports = {
  startStatusScheduler,
  stopStatusScheduler,
  rescheduleStatusReports,
  runAllChecks,
  sendStatusReport
};
