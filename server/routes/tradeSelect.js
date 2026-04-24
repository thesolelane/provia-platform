// server/routes/tradeSelect.js
// Lightweight mobile trade-selection page for WhatsApp fallback.
// GET  /trade-select/:token — render the selection page (no auth required)
// POST /trade-select/:token — save selections and continue estimate processing

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const DEPARTMENTS = require('../../shared/departments.json');
const tenant = require('../../config/tenant.config');

// ── GET /trade-select/:token — serve the lightweight selection page ──────────
router.get('/trade-select/:token', (req, res) => {
  const { token } = req.params;
  const db = getDb();

  const job = db
    .prepare(
      `SELECT id, status, metadata FROM jobs WHERE JSON_EXTRACT(metadata, '$.tradeSelectToken') = ? LIMIT 1`,
    )
    .get(token);

  if (!job) {
    return res.status(404).send('<html><body><h2>Link not found or expired.</h2></body></html>');
  }

  let meta = {};
  try {
    meta = JSON.parse(job.metadata || '{}');
  } catch {
    /* ignore */
  }

  if (meta.tradeSelectDone) {
    return res.send(buildPage({ done: true, token }));
  }

  res.send(buildPage({ done: false, token, departments: DEPARTMENTS }));
});

// ── POST /trade-select/:token — save selections, trigger processing ──────────
router.post('/trade-select/:token', express.json(), async (req, res) => {
  const { token } = req.params;
  const { selectedSubIds } = req.body;

  const db = getDb();

  const job = db
    .prepare(`SELECT * FROM jobs WHERE JSON_EXTRACT(metadata, '$.tradeSelectToken') = ? LIMIT 1`)
    .get(token);

  if (!job) {
    return res.status(404).json({ error: 'Link not found or expired.' });
  }

  let meta = {};
  try {
    meta = JSON.parse(job.metadata || '{}');
  } catch {
    /* ignore */
  }

  if (meta.tradeSelectDone) {
    return res.json({ ok: true, alreadyDone: true });
  }

  const selectedSubs = buildSelectedSubsFromIds(selectedSubIds || []);

  meta.tradeSelectDone = true;
  meta.selectedSubs = selectedSubs;
  db.prepare('UPDATE jobs SET metadata = ? WHERE id = ?').run(JSON.stringify(meta), job.id);

  res.json({ ok: true });

  // Trigger async estimate processing in background
  setImmediate(async () => {
    try {
      await continueAfterWebTradeSelect(job, selectedSubs, db);
    } catch (err) {
      console.error('[TradeSelect] Error continuing after web selection:', err.message);
    }
  });
});

// ── Helper: build selected subs array from sub IDs ───────────────────────────
function buildSelectedSubsFromIds(ids) {
  const result = [];
  for (const dept of DEPARTMENTS) {
    for (const sub of dept.subDepartments) {
      if (ids.includes(sub.id)) {
        result.push({ id: sub.id, name: sub.name, deptName: dept.name, meaning: sub.meaning });
      }
    }
  }
  return result;
}

// ── Helper: continue estimate after web-based trade selection ─────────────────
async function continueAfterWebTradeSelect(job, selectedSubs, db) {
  const { proceedAfterTradeSelection } = require('./webhookWhatsapp');

  const from = job.submitted_by;
  if (!from) return;

  const sender = db
    .prepare('SELECT * FROM approved_senders WHERE identifier = ? AND active = 1')
    .get(from);
  const language = sender?.language || 'en';
  const senderName = sender ? (sender.name || '').split(' ')[0] || 'there' : 'there';

  await proceedAfterTradeSelection(job, selectedSubs, from, db, language, senderName, sender);
}

// ── Build the mobile-friendly HTML selection page ─────────────────────────────
function buildPage({ done, token, departments }) {
  if (done) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trade Selection — ${tenant.company.name}</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #f0f4ff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: white; border-radius: 16px; padding: 32px 24px; text-align: center; max-width: 400px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    h2 { color: #059669; margin: 0 0 12px; }
    p { color: #555; font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:48px;margin-bottom:12px">✅</div>
    <h2>Selections Received</h2>
    <p>Your trade selections have been saved. You can close this window — the estimate is being processed and you'll receive a WhatsApp message when it's ready.</p>
  </div>
</body>
</html>`;
  }

  const deptHtml = (departments || [])
    .map(
      (dept) => `
    <div class="dept">
      <label class="dept-header" onclick="toggleDept('${dept.id}')">
        <span class="chevron" id="chev-${dept.id}">▶</span>
        <span>${dept.name}</span>
      </label>
      <div class="subs" id="subs-${dept.id}" style="display:none">
        ${dept.subDepartments
          .map(
            (sub) => `
          <label class="sub-row">
            <input type="checkbox" name="subs" value="${sub.id}">
            <span>${sub.name}</span>
          </label>
        `,
          )
          .join('')}
      </div>
    </div>
  `,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Select Trades — ${tenant.company.name}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f4ff; margin: 0; padding: 16px; }
    .header { background: #1B3A6B; color: white; border-radius: 12px 12px 0 0; padding: 20px 16px; text-align: center; margin-bottom: 0; }
    .header h1 { margin: 0; font-size: 18px; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.8; }
    .card { background: white; border-radius: 0 0 12px 12px; padding: 16px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .dept { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; overflow: hidden; }
    .dept-header { display: flex; align-items: center; gap: 10px; padding: 12px 14px; cursor: pointer; font-weight: 600; font-size: 14px; color: #1e293b; user-select: none; background: white; }
    .dept-header:active { background: #f8faff; }
    .chevron { font-size: 11px; color: #94a3b8; transition: transform 0.15s; display: inline-block; width: 14px; }
    .subs { background: #f8fafc; border-top: 1px solid #e8edf5; }
    .sub-row { display: flex; align-items: center; gap: 10px; padding: 11px 14px 11px 28px; cursor: pointer; font-size: 13px; color: #374151; border-bottom: 1px solid #f0f3f8; }
    .sub-row:last-child { border-bottom: none; }
    .sub-row input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; accent-color: #1B3A6B; flex-shrink: 0; }
    .btn { width: 100%; padding: 14px; background: #1B3A6B; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 16px; }
    .btn:disabled { background: #94a3b8; cursor: not-allowed; }
    .btn:active { background: #142d54; }
    .note { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 10px; }
    .skip { background: none; border: 1px solid #ddd; color: #64748b; margin-top: 8px; }
    #done-msg { display: none; text-align: center; padding: 20px; }
    #done-msg h2 { color: #059669; }
  </style>
</head>
<body>
  <div style="max-width:500px;margin:0 auto">
    <div class="header">
      <h1>${tenant.company.name}</h1>
      <p>Select the trades involved in this project</p>
    </div>
    <div class="card">
      <div id="form-content">
        <p style="font-size:13px;color:#64748b;margin:0 0 14px">Check the sub-departments that apply. This helps the AI generate accurate line items.</p>
        ${deptHtml}
        <button class="btn" id="submit-btn" onclick="submitSelections()">Confirm Selections</button>
        <button class="btn skip" onclick="submitSelections(true)">Skip — proceed without selecting</button>
        <p class="note">You can close this window after submitting. You'll get a WhatsApp message when the estimate is ready.</p>
      </div>
      <div id="done-msg">
        <div style="font-size:48px">✅</div>
        <h2>Done!</h2>
        <p style="color:#555">Your selections have been saved. You can close this window.</p>
      </div>
    </div>
  </div>

  <script>
    function toggleDept(id) {
      const subs = document.getElementById('subs-' + id);
      const chev = document.getElementById('chev-' + id);
      if (subs.style.display === 'none') {
        subs.style.display = 'block';
        chev.style.transform = 'rotate(90deg)';
      } else {
        subs.style.display = 'none';
        chev.style.transform = 'none';
      }
    }

    async function submitSelections(skip) {
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      const checked = skip ? [] : Array.from(document.querySelectorAll('input[name=subs]:checked')).map(el => el.value);

      try {
        const res = await fetch('/trade-select/${token}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedSubIds: checked })
        });
        if (res.ok) {
          document.getElementById('form-content').style.display = 'none';
          document.getElementById('done-msg').style.display = 'block';
        } else {
          btn.disabled = false;
          btn.textContent = 'Confirm Selections';
          alert('Error saving. Please try again.');
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Confirm Selections';
        alert('Network error. Please try again.');
      }
    }
  </script>
</body>
</html>`;
}

module.exports = router;
