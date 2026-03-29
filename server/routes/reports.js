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
      } catch {}
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
      HAVING fronted > 0
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
    } catch {}

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

  const { type, period, label, savePrevious } = req.body;
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
  } catch {}
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
