const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// ── Ensure saved_reports table exists ────────────────────────────────────────
function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_reports (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL,
      period     TEXT NOT NULL,
      label      TEXT NOT NULL,
      data       TEXT NOT NULL,
      run_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ── Period → date string helper ───────────────────────────────────────────────
function periodDateFrom(period) {
  const now = new Date();
  const yr = now.getFullYear();
  const mo = now.getMonth();
  const q = Math.floor(mo / 3);
  if (period === 'mtd') return `${yr}-${String(mo + 1).padStart(2, '0')}-01`;
  if (period === 'qtd') return `${yr}-${String(q * 3 + 1).padStart(2, '0')}-01`;
  if (period === 'ytd') return `${yr}-01-01`;
  if (period === '12mo') {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }
  return null; // all time
}

// ── Core query engine ─────────────────────────────────────────────────────────
// All queries use GROUP BY / dynamic column values so new categories,
// payment types, and invoice types added anywhere in the app appear
// automatically with zero code changes here.
function runReport(db, type, period) {
  const dateFrom = periodDateFrom(period);
  const rFilter = dateFrom ? `AND pr.date_received >= '${dateFrom}'` : '';
  const mFilter = dateFrom ? `AND pm.date_paid    >= '${dateFrom}'` : '';
  const iFilter = dateFrom ? `AND i.created_at    >= '${dateFrom}'` : '';

  // ── P&L SUMMARY ────────────────────────────────────────────────────────────
  if (type === 'pl') {
    // Revenue: all contract payments received (dynamic — picks up any new payment_type)
    const revenueRows = db
      .prepare(
        `
      SELECT payment_type,
             SUM(CASE WHEN credit_debit='credit' THEN amount ELSE -amount END) AS total
      FROM payments_received pr
      WHERE is_pass_through_reimbursement = 0 ${rFilter}
      GROUP BY payment_type
      ORDER BY total DESC
    `
      )
      .all();

    // Costs: all outgoing payments by category (dynamic — new categories auto-appear)
    const costRows = db
      .prepare(
        `
      SELECT category,
             SUM(CASE WHEN credit_debit='debit' THEN amount ELSE -amount END) AS total
      FROM payments_made pm
      WHERE payment_class = 'cost_of_revenue' ${mFilter}
      GROUP BY category
      ORDER BY total DESC
    `
      )
      .all();

    // Pass-through
    const ptFronted = db
      .prepare(
        `
      SELECT COALESCE(SUM(CASE WHEN credit_debit='debit' THEN amount ELSE -amount END), 0) AS total
      FROM payments_made pm WHERE payment_class = 'pass_through' AND paid_by != 'customer_direct' ${mFilter}
    `
      )
      .get().total;

    const ptReimbursed = db
      .prepare(
        `
      SELECT COALESCE(SUM(CASE WHEN credit_debit='credit' THEN amount ELSE -amount END), 0) AS total
      FROM payments_received pr WHERE is_pass_through_reimbursement = 1 ${rFilter}
    `
      )
      .get().total;

    const totalRevenue = revenueRows.reduce((s, r) => s + (r.total || 0), 0);
    const totalCosts = costRows.reduce((s, r) => s + (r.total || 0), 0);
    const grossProfit = totalRevenue - totalCosts;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : null;

    // Invoice breakdown by type (dynamic)
    const invoiceTypes = db
      .prepare(
        `
      SELECT invoice_type,
             COUNT(*) AS count,
             COALESCE(SUM(amount), 0) AS total,
             COALESCE(SUM(amount_paid), 0) AS collected
      FROM invoices i
      WHERE 1=1 ${iFilter}
      GROUP BY invoice_type
    `
      )
      .all();

    return {
      totalRevenue,
      totalCosts,
      grossProfit,
      grossMargin: grossMargin !== null ? Math.round(grossMargin * 10) / 10 : null,
      ptFronted,
      ptReimbursed,
      ptNet: ptReimbursed - ptFronted,
      revenueByType: revenueRows,
      costsByCategory: costRows,
      invoiceTypes
    };
  }

  // ── CASH FLOW ───────────────────────────────────────────────────────────────
  if (type === 'cashflow') {
    const now = new Date();
    const months = [];
    for (let i = 12; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // All money in by month (dynamic — all payment types)
    const inRows = db
      .prepare(
        `
      SELECT SUBSTR(date_received, 1, 7) AS mo,
             SUM(CASE WHEN credit_debit='credit' THEN amount ELSE -amount END) AS total
      FROM payments_received pr
      WHERE date_received >= ? GROUP BY mo
    `
      )
      .all(months[0] + '-01');

    // All money out by month (dynamic — all categories)
    const outRows = db
      .prepare(
        `
      SELECT SUBSTR(date_paid, 1, 7) AS mo,
             SUM(CASE WHEN credit_debit='debit' THEN amount ELSE -amount END) AS total
      FROM payments_made pm
      WHERE date_paid >= ? AND paid_by != 'customer_direct' GROUP BY mo
    `
      )
      .all(months[0] + '-01');

    const inMap = Object.fromEntries(inRows.map((r) => [r.mo, r.total || 0]));
    const outMap = Object.fromEntries(outRows.map((r) => [r.mo, r.total || 0]));

    let running = 0;
    const rows = months.map((mo) => {
      const inAmt = inMap[mo] || 0;
      const outAmt = outMap[mo] || 0;
      const net = inAmt - outAmt;
      running += net;
      return {
        month: mo,
        in: Math.round(inAmt),
        out: Math.round(outAmt),
        net: Math.round(net),
        balance: Math.round(running)
      };
    });

    return { months: rows };
  }

  // ── AR AGING ────────────────────────────────────────────────────────────────
  if (type === 'ar') {
    const open = db
      .prepare(
        `
      SELECT i.id, i.invoice_number, i.invoice_type, i.status,
             i.amount, i.amount_paid, i.created_at, i.issued_at,
             j.customer_name, j.pb_number, j.quote_number
      FROM invoices i
      LEFT JOIN jobs j ON i.job_id = j.id
      WHERE i.status NOT IN ('paid','void')
      ORDER BY i.created_at ASC
    `
      )
      .all();

    const now = Date.now();
    // Dynamic buckets — labels and thresholds stored as data
    const BUCKETS = [
      { key: 'current', label: 'Current (0–30 days)', min: 0, max: 30 },
      { key: 'days31', label: '31–60 days', min: 31, max: 60 },
      { key: 'days61', label: '61–90 days', min: 61, max: 90 },
      { key: 'days91', label: '91+ days', min: 91, max: Infinity }
    ];

    const buckets = BUCKETS.map((b) => ({ ...b, items: [], total: 0 }));

    for (const inv of open) {
      const ref = inv.issued_at || inv.created_at;
      const age = Math.floor((now - new Date(ref).getTime()) / 86400000);
      const outstanding = Math.max(0, (inv.amount || 0) - (inv.amount_paid || 0));
      const bucket =
        buckets.find((b) => age >= b.min && age <= b.max) || buckets[buckets.length - 1];
      bucket.items.push({ ...inv, ageDays: age, outstanding });
      bucket.total += outstanding;
    }

    // Dynamic breakdown by invoice_type (contract, pass-through, combined, etc.)
    const byType = {};
    for (const inv of open) {
      const outstanding = Math.max(0, (inv.amount || 0) - (inv.amount_paid || 0));
      byType[inv.invoice_type] = (byType[inv.invoice_type] || 0) + outstanding;
    }

    return {
      buckets: buckets.map((b) => ({ ...b, total: Math.round(b.total) })),
      total: Math.round(
        open.reduce((s, i) => s + Math.max(0, (i.amount || 0) - (i.amount_paid || 0)), 0)
      ),
      byType
    };
  }

  // ── JOB PROFITABILITY ───────────────────────────────────────────────────────
  if (type === 'profitability') {
    const jobs = db
      .prepare(
        `
      SELECT j.id, j.customer_name, j.pb_number, j.quote_number, j.status,
             j.total_value, j.project_address, j.project_city, j.proposal_data,
             COALESCE((
               SELECT SUM(CASE WHEN credit_debit='credit' THEN amount ELSE -amount END)
               FROM payments_received WHERE job_id = j.id AND is_pass_through_reimbursement = 0
               ${rFilter.replace(/pr\./g, '')}
             ), 0) AS received,
             COALESCE((
               SELECT SUM(CASE WHEN credit_debit='debit' THEN amount ELSE -amount END)
               FROM payments_made WHERE job_id = j.id AND payment_class = 'cost_of_revenue'
               ${mFilter.replace(/pm\./g, '')}
             ), 0) AS costs,
             COALESCE((
               SELECT SUM(CASE WHEN credit_debit='debit' THEN amount ELSE -amount END)
               FROM payments_made WHERE job_id = j.id AND payment_class = 'pass_through' AND paid_by != 'customer_direct'
               ${mFilter.replace(/pm\./g, '')}
             ), 0) AS pt_fronted,
             COALESCE((
               SELECT SUM(CASE WHEN credit_debit='credit' THEN amount ELSE -amount END)
               FROM payments_received WHERE job_id = j.id AND is_pass_through_reimbursement = 1
               ${rFilter.replace(/pr\./g, '')}
             ), 0) AS pt_reimbursed
      FROM jobs j
      WHERE j.archived = 0
      ORDER BY j.created_at DESC
      LIMIT 100
    `
      )
      .all();

    // Dynamic cost breakdown by category across all jobs
    const categoryBreakdown = db
      .prepare(
        `
      SELECT category,
             SUM(CASE WHEN credit_debit='debit' THEN amount ELSE -amount END) AS total
      FROM payments_made pm
      WHERE payment_class = 'cost_of_revenue' ${mFilter}
      GROUP BY category ORDER BY total DESC
    `
      )
      .all();

    const rows = jobs.map((j) => {
      const grossProfit = j.received - j.costs;
      const margin = j.received > 0 ? (grossProfit / j.received) * 100 : null;
      let estimatedMargin = null;
      try {
        const pd = JSON.parse(j.proposal_data || '{}');
        const lineItems = pd?.lineItems || [];
        const base = lineItems.reduce((s, li) => s + (Number(li.baseCost) || 0), 0);
        const price = lineItems.reduce((s, li) => s + (Number(li.finalPrice) || 0), 0);
        if (base > 0 && price > 0)
          estimatedMargin = Math.round(((price - base) / price) * 10000) / 100;
      } catch {
        /* ignore */
      }
      return {
        id: j.id,
        customerName: j.customer_name,
        pbNumber: j.pb_number,
        status: j.status,
        contractValue: j.total_value || 0,
        received: j.received,
        costs: j.costs,
        grossProfit,
        margin: margin !== null ? Math.round(margin * 10) / 10 : null,
        estimatedMargin,
        ptFronted: j.pt_fronted,
        ptReimbursed: j.pt_reimbursed,
        ptOwed: Math.max(0, j.pt_fronted - j.pt_reimbursed),
        address: [j.project_address, j.project_city].filter(Boolean).join(', ')
      };
    });

    return { jobs: rows, categoryBreakdown };
  }

  // ── PASS-THROUGH BALANCE ────────────────────────────────────────────────────
  if (type === 'passthrough') {
    // Dynamic by category — any new PT category automatically appears
    const byCategory = db
      .prepare(
        `
      SELECT category,
             SUM(CASE WHEN credit_debit='debit' THEN amount ELSE -amount END) AS fronted
      FROM payments_made pm
      WHERE payment_class = 'pass_through' AND paid_by != 'customer_direct' ${mFilter}
      GROUP BY category ORDER BY fronted DESC
    `
      )
      .all();

    const totalFronted = byCategory.reduce((s, r) => s + (r.fronted || 0), 0);
    const totalReimbursed = db
      .prepare(
        `
      SELECT COALESCE(SUM(CASE WHEN credit_debit='credit' THEN amount ELSE -amount END), 0) AS total
      FROM payments_received pr WHERE is_pass_through_reimbursement = 1 ${rFilter}
    `
      )
      .get().total;

    // Per-job breakdown
    const jobs = db
      .prepare(
        `
      SELECT * FROM (
        SELECT j.id, j.customer_name, j.pb_number, j.quote_number, j.status,
               COALESCE((
                 SELECT SUM(CASE WHEN credit_debit='debit' THEN amount ELSE -amount END)
                 FROM payments_made WHERE job_id=j.id AND payment_class='pass_through' AND paid_by!='customer_direct'
               ), 0) AS fronted,
               COALESCE((
                 SELECT SUM(CASE WHEN credit_debit='credit' THEN amount ELSE -amount END)
                 FROM payments_received WHERE job_id=j.id AND is_pass_through_reimbursement=1
               ), 0) AS reimbursed
        FROM jobs j WHERE j.archived = 0
      ) WHERE fronted > 0
      ORDER BY (fronted - reimbursed) DESC
    `
      )
      .all()
      .map((j) => ({
        ...j,
        outstanding: Math.max(0, j.fronted - j.reimbursed)
      }));

    return {
      byCategory,
      totalFronted,
      totalReimbursed,
      totalOutstanding: Math.max(0, totalFronted - totalReimbursed),
      jobs
    };
  }

  // ── DEPOSIT TRACKER ─────────────────────────────────────────────────────────
  if (type === 'deposits') {
    // Dynamic — works regardless of how many statuses exist
    const contractStatuses = db
      .prepare(
        `
      SELECT DISTINCT status FROM jobs
      WHERE status IN ('contract_sent','contract_signed','proposal_approved','complete')
        AND archived = 0
    `
      )
      .all()
      .map((r) => r.status);

    if (!contractStatuses.length)
      return { jobs: [], summary: { total: 0, withDeposit: 0, missing: 0, shortfall: 0 } };

    const jobs = db
      .prepare(
        `
      SELECT j.id, j.customer_name, j.pb_number, j.quote_number, j.status,
             j.total_value, j.created_at,
             COALESCE((
               SELECT SUM(CASE WHEN credit_debit='credit' THEN amount ELSE -amount END)
               FROM payments_received WHERE job_id=j.id AND payment_type='deposit'
             ), 0) AS deposit_received,
             COALESCE((
               SELECT SUM(CASE WHEN credit_debit='credit' THEN amount ELSE -amount END)
               FROM payments_received WHERE job_id=j.id AND is_pass_through_reimbursement=0
             ), 0) AS total_received
      FROM jobs j
      WHERE j.status IN (${contractStatuses.map(() => '?').join(',')}) AND j.archived=0
      ORDER BY j.created_at DESC
    `
      )
      .all(...contractStatuses);

    // Deposit % from settings if available, fallback 33%
    let depositPct = 0.33;
    try {
      const db2 = getDb();
      const setting = db2.prepare("SELECT value FROM settings WHERE key='markup.deposit'").get();
      if (setting?.value) depositPct = parseFloat(setting.value);
    } catch {
      /* ignore */
    }

    const rows = jobs.map((j) => {
      const expected = (j.total_value || 0) * depositPct;
      const shortfall = Math.max(0, expected - j.deposit_received);
      return {
        id: j.id,
        customerName: j.customer_name,
        pbNumber: j.pb_number,
        status: j.status,
        contractValue: j.total_value || 0,
        depositReceived: j.deposit_received,
        expectedDeposit: Math.round(expected),
        shortfall: Math.round(shortfall),
        totalReceived: j.total_received,
        createdAt: j.created_at,
        depositMet: shortfall < 1
      };
    });

    const summary = {
      total: rows.length,
      withDeposit: rows.filter((r) => r.depositMet).length,
      missing: rows.filter((r) => !r.depositMet).length,
      shortfall: Math.round(rows.reduce((s, r) => s + r.shortfall, 0))
    };

    return { jobs: rows, depositPct, summary };
  }

  return null;
}

// ── POST /api/reports/run ─────────────────────────────────────────────────────
router.post('/run', requireAuth, (req, res) => {
  const db = getDb();
  ensureTable(db);

  const { type, period, savePrevious } = req.body;
  if (!type || !period) return res.status(400).json({ error: 'type and period required' });

  // If the client is passing a previous report to save first, save it
  if (savePrevious && savePrevious.type && savePrevious.data) {
    db.prepare(
      `
      INSERT INTO saved_reports (type, period, label, data, run_at)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(
      savePrevious.type,
      savePrevious.period,
      savePrevious.label || `${savePrevious.type} — ${savePrevious.period}`,
      JSON.stringify(savePrevious.data),
      savePrevious.runAt || new Date().toISOString()
    );
  }

  try {
    const data = runReport(db, type, period);
    if (!data) return res.status(400).json({ error: `Unknown report type: ${type}` });
    res.json({ data, runAt: new Date().toISOString() });
  } catch (err) {
    console.error('[reports/run]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reports/doc-history/:jobId/pdf — document history PDF for a job ──
router.get('/doc-history/:jobId/pdf', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { generatePDFFromHTML } = require('../services/pdfService');

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const contact = job.contact_id
      ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(job.contact_id)
      : null;

    const invoices = db
      .prepare('SELECT * FROM invoices WHERE job_id = ? ORDER BY created_at ASC')
      .all(job.id);

    const payments = db
      .prepare(
        'SELECT * FROM payments_received WHERE job_id = ? ORDER BY date_received ASC, time_received ASC'
      )
      .all(job.id);

    const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    const fmtDate = (d) => {
      if (!d) return '—';
      try {
        return new Date(d).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'America/New_York'
        });
      } catch {
        return d;
      }
    };

    const sigSession = db
      .prepare(
        `SELECT * FROM signing_sessions WHERE job_id = ? AND doc_type = 'contract' AND status = 'signed' ORDER BY signed_at ASC LIMIT 1`
      )
      .get(job.id);

    const timeline = [];
    timeline.push({
      date: job.created_at,
      icon: '📋',
      label: 'Job Created',
      sub: `Status: ${job.status || 'received'}`,
      color: '#1B3A6B'
    });

    if (job.quote_number) {
      timeline.push({
        date: job.updated_at,
        icon: '📄',
        label: 'Proposal / Scope of Work',
        sub: `PB-${job.quote_number}`,
        color: '#7C3AED'
      });
    }

    if (sigSession?.signed_at) {
      timeline.push({
        date: sigSession.signed_at,
        icon: '✍️',
        label: 'Contract Signed',
        sub: `Signed by ${sigSession.signer_name || '—'} · Contract No. PB-${job.quote_number || job.id}`,
        color: '#0D9488'
      });
    }

    for (const inv of invoices) {
      const typeMap = {
        contract_invoice: 'Deposit Invoice',
        pass_through_invoice: 'Pass-Through Invoice',
        change_order: 'Change Order Invoice',
        combined_invoice: 'Invoice'
      };
      const typeLabel = typeMap[inv.invoice_type] || 'Invoice';
      const statusBadge =
        inv.status === 'paid'
          ? ' ✓ PAID'
          : inv.status === 'sent'
            ? ' — Sent'
            : inv.status === 'void'
              ? ' — VOID'
              : ' — Draft';
      const pbDue = inv.pb_due_amount || inv.amount;
      timeline.push({
        date: inv.created_at,
        icon: '🧾',
        label: `${typeLabel} — ${inv.invoice_number}`,
        sub: `${money(inv.amount)} total · ${money(pbDue)} due to PB${statusBadge}`,
        color: inv.status === 'paid' ? '#2E7D32' : '#E07B2A'
      });
    }

    for (const pmt of payments) {
      timeline.push({
        date: pmt.date_received,
        icon: '💵',
        label: `Payment Received — ${money(pmt.amount)}`,
        sub: `${pmt.payment_type || 'Check'}${pmt.check_number ? ` #${pmt.check_number}` : ''}${pmt.notes ? ` · ${pmt.notes}` : ''}`,
        color: '#2E7D32'
      });
    }

    if (job.status === 'complete') {
      timeline.push({
        date: job.updated_at,
        icon: '🏁',
        label: 'Job Complete',
        sub: '',
        color: '#2E7D32'
      });
    }

    timeline.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db2 = b.date ? new Date(b.date).getTime() : 0;
      return da - db2;
    });

    const timelineRowsHTML = timeline
      .map(
        (row, i) => `
<tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};border-bottom:1px solid #eee">
  <td style="padding:9px 12px;font-size:18px;width:36px;text-align:center">${row.icon}</td>
  <td style="padding:9px 8px;font-size:11px;color:#888;white-space:nowrap;width:100px">${fmtDate(row.date)}</td>
  <td style="padding:9px 8px">
    <div style="font-size:12px;font-weight:600;color:${row.color}">${row.label}</div>
    ${row.sub ? `<div style="font-size:11px;color:#888;margin-top:2px">${row.sub}</div>` : ''}
  </td>
</tr>`
      )
      .join('');

    const runDate = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/New_York'
    });

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;margin:0;padding:36px;color:#222;font-size:13px}
  h1{color:#1B3A6B;margin:0;font-size:20px}
  .sub{color:#888;font-size:11px;margin:3px 0}
  hr{border:none;border-top:2px solid #E07B2A;margin:14px 0}
  .section-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin:0 0 5px;font-weight:600}
  .ftr{margin-top:36px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#aaa;text-align:center}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
  <div>
    <h1>PREFERRED BUILDERS</h1>
    <p class="sub">General Services Inc. · 978-377-1784 · Fitchburg, MA</p>
    <p class="sub">License #CS-109171 · HIC-197400</p>
  </div>
  <div style="text-align:right">
    <div style="font-size:14px;font-weight:bold;color:#1B3A6B">Document History Report</div>
    <div class="sub">Generated: ${runDate}</div>
  </div>
</div>
<hr>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
  <div>
    <div class="section-label">Customer</div>
    <div style="font-size:13px;font-weight:600;margin-top:4px">
      ${contact?.pb_customer_number ? `<span style="font-family:monospace;font-size:10px;background:#e0e8ff;color:#1B3A6B;padding:2px 7px;border-radius:4px;font-weight:bold">${contact.pb_customer_number}</span><br>` : ''}
      ${contact?.name || job.customer_name || '—'}<br>
      <span style="font-size:11px;font-weight:normal;color:#888">${contact?.email || job.customer_email || ''}</span>
    </div>
  </div>
  <div>
    <div class="section-label">Project</div>
    <div style="font-size:13px;font-weight:600;margin-top:4px">
      ${job.pb_number || job.quote_number ? `PB-${job.quote_number || job.id}<br>` : ''}
      ${job.project_address || '—'}${job.project_city ? `, ${job.project_city}, MA` : ''}
      <br><span style="font-size:11px;font-weight:normal;color:#888">Status: ${job.status || '—'}</span>
    </div>
  </div>
</div>

<div class="section-label" style="margin-bottom:8px">Document Timeline</div>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:#1B3A6B;color:white">
    <th style="padding:8px 12px;font-size:10px;font-weight:600;width:36px"></th>
    <th style="padding:8px 8px;font-size:10px;font-weight:600;text-align:left;width:100px">Date</th>
    <th style="padding:8px 8px;font-size:10px;font-weight:600;text-align:left">Event / Document</th>
  </tr>
  ${timelineRowsHTML || '<tr><td colspan="3" style="padding:16px;text-align:center;color:#aaa">No documents on record</td></tr>'}
</table>

<div class="ftr">
  Preferred Builders General Services Inc. · License #CS-109171 · HIC-197400 · 978-377-1784<br>
  Document History for ${contact?.name || job.customer_name || job.id} — Generated ${runDate}
</div>
</body></html>`;

    const pdfPath = await generatePDFFromHTML(html, `doc_history_${job.id}`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="doc-history-${job.quote_number || job.id}.pdf"`
    );
    const fs = require('fs');
    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    console.error('[DocHistory PDF]', err.message);
    res.status(500).json({ error: 'PDF generation failed: ' + err.message });
  }
});

// ── GET /api/reports/doc-history/search — find jobs for the doc-history picker ──
router.get('/doc-history/search', requireAuth, (req, res) => {
  const db = getDb();
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ jobs: [] });

  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT j.id, j.quote_number, j.pb_number, j.customer_name, j.project_address,
              j.project_city, j.status, j.total_value,
              c.name AS contact_name, c.pb_customer_number
       FROM jobs j
       LEFT JOIN contacts c ON c.id = j.contact_id
       WHERE j.quote_number LIKE ? OR j.pb_number LIKE ? OR j.customer_name LIKE ?
          OR c.name LIKE ? OR c.pb_customer_number LIKE ? OR j.project_address LIKE ?
       ORDER BY j.created_at DESC LIMIT 12`
    )
    .all(like, like, like, like, like, like);
  res.json({ jobs: rows });
});

// ── GET /api/reports/customer/search — find contacts for customer report picker ──
router.get('/customer/search', requireAuth, (req, res) => {
  const db = getDb();
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ customers: [] });

  const like = `%${q}%`;

  // Linked contacts (have a contact record)
  const contacts = db
    .prepare(
      `
    SELECT c.id, c.name, c.email, c.phone, c.address, c.city, c.pb_customer_number,
           COUNT(j.id) AS job_count
    FROM contacts c
    LEFT JOIN jobs j ON j.contact_id = c.id
    WHERE c.name LIKE ? OR c.pb_customer_number LIKE ? OR c.email LIKE ? OR c.phone LIKE ?
    GROUP BY c.id
    ORDER BY c.name ASC LIMIT 10
  `
    )
    .all(like, like, like, like);

  // Unlinked jobs (no contact record) grouped by customer_name
  const unlinked = db
    .prepare(
      `
    SELECT customer_name AS name, customer_email AS email, customer_phone AS phone,
           COUNT(*) AS job_count, NULL AS pb_customer_number, NULL AS id
    FROM jobs
    WHERE contact_id IS NULL AND customer_name LIKE ?
    GROUP BY customer_name
    ORDER BY customer_name ASC LIMIT 5
  `
    )
    .all(like);

  const results = [
    ...contacts.map((c) => ({ ...c, type: 'contact' })),
    ...unlinked
      .filter((u) => !contacts.some((c) => c.name === u.name))
      .map((u) => ({ ...u, type: 'unlinked' }))
  ].slice(0, 12);

  res.json({ customers: results });
});

// ── GET /api/reports/customer/pdf — full customer report PDF ──────────────────
router.get('/customer/pdf', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { generatePDFFromHTML } = require('../services/pdfService');

    const { contact_id, customer_name } = req.query;
    if (!contact_id && !customer_name)
      return res.status(400).json({ error: 'contact_id or customer_name required' });

    let contact = null;
    let jobs = [];

    if (contact_id) {
      contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact_id);
      jobs = db
        .prepare('SELECT * FROM jobs WHERE contact_id = ? ORDER BY created_at ASC')
        .all(contact_id);
    } else {
      jobs = db
        .prepare(
          'SELECT * FROM jobs WHERE contact_id IS NULL AND customer_name = ? ORDER BY created_at ASC'
        )
        .all(customer_name);
    }

    if (!jobs.length && !contact) return res.status(404).json({ error: 'No records found' });

    const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    const fmtDateTime = (d) => {
      if (!d) return '—';
      try {
        return new Date(d).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/New_York'
        });
      } catch {
        return d;
      }
    };

    const displayName = contact?.name || jobs[0]?.customer_name || 'Unknown Customer';
    const runDate = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/New_York'
    });

    // Aggregate totals
    let totalContractValue = 0;
    let totalCollected = 0;

    const jobSections = [];

    for (const job of jobs) {
      const invoices = db
        .prepare('SELECT * FROM invoices WHERE job_id = ? ORDER BY created_at ASC')
        .all(job.id);
      const payments = db
        .prepare(
          'SELECT * FROM payments_received WHERE job_id = ? ORDER BY date_received ASC, time_received ASC'
        )
        .all(job.id);

      const jobTotal = Number(job.total_value || 0);
      const jobCollected = payments
        .filter((p) => (p.credit_debit || 'credit') === 'credit')
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      totalContractValue += jobTotal;
      totalCollected += jobCollected;

      // Build timeline for this job
      const timeline = [];
      timeline.push({
        date: job.created_at,
        icon: '📋',
        label: 'Job Created',
        sub: `Status: ${job.status || 'received'}`,
        color: '#1B3A6B'
      });

      if (job.quote_number) {
        timeline.push({
          date: job.updated_at,
          icon: '📄',
          label: 'Proposal / Scope of Work',
          sub: `PB-${job.quote_number}${job.total_value ? ' · ' + money(job.total_value) : ''}`,
          color: '#7C3AED'
        });
      }

      const sigSess = db
        .prepare(
          `SELECT * FROM signing_sessions WHERE job_id = ? AND doc_type = 'contract' AND status = 'signed' ORDER BY signed_at ASC LIMIT 1`
        )
        .get(job.id);
      if (sigSess?.signed_at) {
        timeline.push({
          date: sigSess.signed_at,
          icon: '✍️',
          label: 'Contract Signed',
          sub: `Signed by ${sigSess.signer_name || '—'} · Contract No. PB-${job.quote_number || job.id}`,
          color: '#0D9488'
        });
      }

      for (const inv of invoices) {
        const typeMap = {
          contract_invoice: 'Deposit Invoice',
          pass_through_invoice: 'Pass-Through Invoice',
          change_order: 'Change Order Invoice',
          combined_invoice: 'Invoice'
        };
        const tLabel = typeMap[inv.invoice_type] || 'Invoice';
        const statusBadge =
          inv.status === 'paid'
            ? ' ✓ PAID'
            : inv.status === 'sent'
              ? ' — Sent'
              : inv.status === 'void'
                ? ' — VOID'
                : ' — Draft';
        let items = [];
        try {
          items = inv.line_items ? JSON.parse(inv.line_items) : [];
        } catch {
          /* ignore */
        }
        const pbDue = inv.pb_due_amount || inv.amount;
        const sub = items.length
          ? `${money(inv.amount)} total · ${money(pbDue)} due to PB${statusBadge}`
          : `${money(inv.amount)}${statusBadge}`;
        timeline.push({
          date: inv.created_at,
          icon: '🧾',
          label: `${tLabel} — ${inv.invoice_number}`,
          sub,
          color: inv.status === 'paid' ? '#2E7D32' : '#E07B2A'
        });
      }

      for (const pmt of payments) {
        const crDr = (pmt.credit_debit || 'credit') === 'debit' ? ' (Debit/Refund)' : '';
        timeline.push({
          date: `${pmt.date_received}T${pmt.time_received || '12:00:00'}`,
          icon: '💵',
          label: `Payment Received — ${money(pmt.amount)}${crDr}`,
          sub: `${pmt.payment_type || 'check'}${pmt.check_number ? ' #' + pmt.check_number : ''}${pmt.notes ? ' · ' + pmt.notes : ''} · Recorded by ${pmt.recorded_by || '—'}`,
          color: '#2E7D32'
        });
      }

      if (job.archived && job.closed_reason === 'completed') {
        timeline.push({
          date: job.archived_at || job.updated_at,
          icon: '🏁',
          label: 'Job Completed',
          sub: job.closed_note || '',
          color: '#2E7D32'
        });
      }

      timeline.sort(
        (a, b) =>
          (a.date ? new Date(a.date).getTime() : 0) - (b.date ? new Date(b.date).getTime() : 0)
      );

      const rowsHTML = timeline
        .map(
          (row, i) => `
<tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};border-bottom:1px solid #eee">
  <td style="padding:7px 10px;font-size:16px;width:30px;text-align:center">${row.icon}</td>
  <td style="padding:7px 8px;font-size:10px;color:#888;white-space:nowrap;width:120px">${fmtDateTime(row.date)}</td>
  <td style="padding:7px 8px">
    <div style="font-size:11px;font-weight:600;color:${row.color}">${row.label}</div>
    ${row.sub ? `<div style="font-size:10px;color:#888;margin-top:1px">${row.sub}</div>` : ''}
  </td>
</tr>`
        )
        .join('');

      const outstanding = Math.max(0, jobTotal - jobCollected);
      const statusColor =
        {
          completed: '#2E7D32',
          contract_signed: '#0D9488',
          in_progress: '#3B82F6',
          proposal_sent: '#F59E0B'
        }[job.status] || '#888';

      jobSections.push(`
<div style="margin-bottom:28px;page-break-inside:avoid">
  <div style="background:#1B3A6B;color:white;padding:10px 14px;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;align-items:center">
    <div>
      <span style="font-size:13px;font-weight:bold">PB-${job.quote_number || job.id}</span>
      <span style="font-size:11px;opacity:0.8;margin-left:12px">${job.project_address || '—'}${job.project_city ? ', ' + job.project_city + ', MA' : ''}</span>
    </div>
    <span style="font-size:10px;background:${statusColor};padding:2px 9px;border-radius:10px;font-weight:bold">${(job.status || '—').replace(/_/g, ' ').toUpperCase()}</span>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;background:#f0f4ff;padding:10px 14px;font-size:11px;border:1px solid #e0e8ff;border-top:none">
    <div><span style="color:#888">Contract Value</span><br><strong style="color:#1B3A6B;font-size:13px">${money(jobTotal)}</strong></div>
    <div><span style="color:#888">Total Collected</span><br><strong style="color:#2E7D32;font-size:13px">${money(jobCollected)}</strong></div>
    <div><span style="color:#888">Outstanding</span><br><strong style="color:${outstanding > 0 ? '#C62828' : '#2E7D32'};font-size:13px">${money(outstanding)}</strong></div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e2e8f0;border-top:none">
    <tr style="background:#f8faff">
      <th style="padding:6px 10px;font-size:9px;color:#888;text-align:left;width:30px"></th>
      <th style="padding:6px 8px;font-size:9px;color:#888;text-align:left;width:120px">DATE / TIME</th>
      <th style="padding:6px 8px;font-size:9px;color:#888;text-align:left">DOCUMENT / EVENT</th>
    </tr>
    ${rowsHTML || '<tr><td colspan="3" style="padding:14px;text-align:center;color:#aaa;font-size:11px">No documents on record</td></tr>'}
  </table>
</div>`);
    }

    const outstanding = Math.max(0, totalContractValue - totalCollected);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;margin:0;padding:32px;color:#222;font-size:13px}
  h1{color:#1B3A6B;margin:0;font-size:20px}
  .sub{color:#888;font-size:11px;margin:3px 0}
  hr{border:none;border-top:2px solid #E07B2A;margin:14px 0}
  .section-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin:0 0 5px;font-weight:600}
  .ftr{margin-top:36px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#aaa;text-align:center}
  @media print{.no-break{page-break-inside:avoid}}
</style></head><body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
  <div>
    <h1>PREFERRED BUILDERS</h1>
    <p class="sub">General Services Inc. · 978-377-1784 · Fitchburg, MA</p>
    <p class="sub">License #CS-109171 · HIC-197400</p>
  </div>
  <div style="text-align:right">
    <div style="font-size:14px;font-weight:bold;color:#1B3A6B">Customer Full Report</div>
    <div class="sub">Generated: ${runDate}</div>
  </div>
</div>
<hr>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
  <div>
    <div class="section-label">Customer</div>
    <div style="font-size:14px;font-weight:bold;margin-top:4px">
      ${contact?.pb_customer_number ? `<span style="font-family:monospace;font-size:10px;background:#e0e8ff;color:#1B3A6B;padding:2px 7px;border-radius:4px;font-weight:bold">${contact.pb_customer_number}</span><br>` : ''}
      ${displayName}
    </div>
    ${contact?.email ? `<div style="font-size:11px;color:#555;margin-top:3px">✉ ${contact.email}</div>` : ''}
    ${contact?.phone ? `<div style="font-size:11px;color:#555">📞 ${contact.phone}</div>` : ''}
    ${contact?.address ? `<div style="font-size:11px;color:#555">📍 ${contact.address}${contact.city ? ', ' + contact.city : ''}</div>` : ''}
  </div>
  <div>
    <div class="section-label">Account Summary</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px">
      <div style="background:#f0f4ff;border-radius:6px;padding:10px 12px">
        <div style="font-size:10px;color:#888">Total Jobs</div>
        <div style="font-size:18px;font-weight:bold;color:#1B3A6B">${jobs.length}</div>
      </div>
      <div style="background:#f0f4ff;border-radius:6px;padding:10px 12px">
        <div style="font-size:10px;color:#888">Contract Value</div>
        <div style="font-size:16px;font-weight:bold;color:#1B3A6B">${money(totalContractValue)}</div>
      </div>
      <div style="background:#e8f5e9;border-radius:6px;padding:10px 12px">
        <div style="font-size:10px;color:#888">Total Collected</div>
        <div style="font-size:16px;font-weight:bold;color:#2E7D32">${money(totalCollected)}</div>
      </div>
      <div style="background:${outstanding > 0 ? '#fef2f2' : '#e8f5e9'};border-radius:6px;padding:10px 12px">
        <div style="font-size:10px;color:#888">Outstanding</div>
        <div style="font-size:16px;font-weight:bold;color:${outstanding > 0 ? '#C62828' : '#2E7D32'}">${money(outstanding)}</div>
      </div>
    </div>
  </div>
</div>

<div class="section-label" style="margin-bottom:12px">Job History &amp; Document Timeline</div>

${jobSections.join('') || '<p style="color:#aaa;font-size:12px">No jobs on record for this customer.</p>'}

<div class="ftr">
  Preferred Builders General Services Inc. · License #CS-109171 · HIC-197400 · 978-377-1784<br>
  Customer Report — ${displayName} — Generated ${runDate}
</div>
</body></html>`;

    const pdfPath = await generatePDFFromHTML(
      html,
      `customer_report_${contact_id || customer_name.replace(/\s+/g, '_')}`
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="customer-report-${displayName.replace(/\s+/g, '-')}.pdf"`
    );
    const fs = require('fs');
    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    console.error('[Customer Report PDF]', err.message);
    res.status(500).json({ error: 'PDF generation failed: ' + err.message });
  }
});

// ── GET /api/reports/saved ────────────────────────────────────────────────────
router.get('/saved', requireAuth, (req, res) => {
  const db = getDb();
  ensureTable(db);
  const rows = db
    .prepare(
      `
    SELECT id, type, period, label, run_at FROM saved_reports ORDER BY run_at DESC LIMIT 50
  `
    )
    .all();
  res.json({ reports: rows });
});

// ── GET /api/reports/saved/:id ────────────────────────────────────────────────
router.get('/saved/:id', requireAuth, (req, res) => {
  const db = getDb();
  ensureTable(db);
  const row = db.prepare('SELECT * FROM saved_reports WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  try {
    row.data = JSON.parse(row.data);
  } catch {
    /* ignore */
  }
  res.json({ report: row });
});

// ── DELETE /api/reports/saved/:id ────────────────────────────────────────────
router.delete('/saved/:id', requireAuth, (req, res) => {
  const db = getDb();
  ensureTable(db);
  db.prepare('DELETE FROM saved_reports WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
