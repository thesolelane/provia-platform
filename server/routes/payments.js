'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb }       = require('../db/database');
const { logAudit }    = require('../services/auditService');

const VALID_PAYMENT_TYPES = ['deposit', 'progress', 'final', 'other'];
const VALID_CATEGORIES    = ['subcontractor', 'material', 'permit', 'other'];
const VALID_CREDIT_DEBIT  = ['credit', 'debit'];

function signedSum(rows, amountCol, defaultSign) {
  return rows.reduce((sum, r) => {
    const amt = Number(r[amountCol]) || 0;
    const sign = r.credit_debit || defaultSign;
    return sum + (sign === defaultSign ? amt : -amt);
  }, 0);
}

function jobSummary(db, jobId) {
  const recRows  = db.prepare('SELECT amount, credit_debit FROM payments_received WHERE job_id = ?').all(jobId);
  const paidRows = db.prepare('SELECT amount, credit_debit FROM payments_made     WHERE job_id = ?').all(jobId);
  const totalIn  = signedSum(recRows, 'amount', 'credit');
  const totalOut = signedSum(paidRows, 'amount', 'debit');
  return { total_received: totalIn, total_paid_out: totalOut, balance: totalIn - totalOut };
}

function validateAmount(amount) {
  const n = parseFloat(amount);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function currentTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }).slice(0, 5);
}

router.get('/summary/:jobId', requireAuth, (req, res) => {
  const db = getDb();
  const { jobId } = req.params;
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(jobSummary(db, jobId));
});

router.get('/received', requireAuth, (req, res) => {
  const db = getDb();
  const { job_id, date_from, date_to, customer } = req.query;
  let sql = `
    SELECT r.*, j.customer_name as job_customer, j.project_address
    FROM payments_received r
    LEFT JOIN jobs j ON j.id = r.job_id
    WHERE 1=1
  `;
  const params = [];
  if (job_id)    { sql += ' AND r.job_id = ?';         params.push(job_id); }
  if (date_from) { sql += ' AND r.date_received >= ?';  params.push(date_from); }
  if (date_to)   { sql += ' AND r.date_received <= ?';  params.push(date_to); }
  if (customer)  { sql += ' AND (r.customer_name LIKE ? OR j.customer_name LIKE ?)'; params.push(`%${customer}%`, `%${customer}%`); }
  sql += ' ORDER BY r.date_received DESC, r.created_at DESC';
  res.json({ payments: db.prepare(sql).all(...params) });
});

router.get('/made', requireAuth, (req, res) => {
  const db = getDb();
  const { job_id, date_from, date_to, customer } = req.query;
  let sql = `
    SELECT m.*, j.customer_name as job_customer, j.project_address
    FROM payments_made m
    LEFT JOIN jobs j ON j.id = m.job_id
    WHERE 1=1
  `;
  const params = [];
  if (job_id)    { sql += ' AND m.job_id = ?';       params.push(job_id); }
  if (date_from) { sql += ' AND m.date_paid >= ?';    params.push(date_from); }
  if (date_to)   { sql += ' AND m.date_paid <= ?';    params.push(date_to); }
  if (customer)  { sql += ' AND (m.payee_name LIKE ? OR j.customer_name LIKE ?)'; params.push(`%${customer}%`, `%${customer}%`); }
  sql += ' ORDER BY m.date_paid DESC, m.created_at DESC';
  res.json({ payments: db.prepare(sql).all(...params) });
});

router.get('/job/:jobId', requireAuth, (req, res) => {
  const db = getDb();
  const { jobId } = req.params;
  const received = db.prepare('SELECT * FROM payments_received WHERE job_id = ? ORDER BY date_received DESC').all(jobId);
  const made     = db.prepare('SELECT * FROM payments_made     WHERE job_id = ? ORDER BY date_paid     DESC').all(jobId);
  res.json({ received, made, summary: jobSummary(db, jobId) });
});

router.get('/contact/:contactId', requireAuth, (req, res) => {
  const db = getDb();
  const { contactId } = req.params;
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const jobs = db.prepare(`
    SELECT id, customer_name, project_address, total_value, status
    FROM jobs WHERE archived = 0 AND (
      (customer_email IS NOT NULL AND customer_email = ?) OR
      (customer_phone IS NOT NULL AND customer_phone = ?) OR
      (customer_name IS NOT NULL AND customer_name = ?)
    )
  `).all(contact.email || '', contact.phone || '', contact.name || '');

  const jobIds = jobs.map(j => j.id);
  if (jobIds.length === 0) {
    return res.json({ received: [], made: [], summary: { total_received: 0, total_paid_out: 0, balance: 0 }, jobs: [] });
  }

  const ph = jobIds.map(() => '?').join(',');
  const received = db.prepare(`
    SELECT r.*, j.project_address, j.customer_name as job_customer
    FROM payments_received r
    LEFT JOIN jobs j ON j.id = r.job_id
    WHERE r.job_id IN (${ph}) ORDER BY r.date_received DESC
  `).all(...jobIds);
  const made = db.prepare(`
    SELECT m.*, j.project_address, j.customer_name as job_customer
    FROM payments_made m
    LEFT JOIN jobs j ON j.id = m.job_id
    WHERE m.job_id IN (${ph}) ORDER BY m.date_paid DESC
  `).all(...jobIds);

  const recTotal  = signedSum(received, 'amount', 'credit');
  const madeTotal = signedSum(made, 'amount', 'debit');

  res.json({
    received,
    made,
    summary: { total_received: recTotal, total_paid_out: madeTotal, balance: recTotal - madeTotal },
    jobs
  });
});

router.post('/received', requireAuth, (req, res) => {
  const db = getDb();
  const { job_id, customer_name, check_number, amount, date_received, time_received, payment_type, credit_debit, notes } = req.body;
  if (!job_id)        return res.status(400).json({ error: 'job_id is required' });
  if (!date_received) return res.status(400).json({ error: 'date_received is required' });

  const parsedAmount = validateAmount(amount);
  if (parsedAmount === null) return res.status(400).json({ error: 'amount must be a positive number' });

  const pType = VALID_PAYMENT_TYPES.includes(payment_type) ? payment_type : 'deposit';
  const crDr  = VALID_CREDIT_DEBIT.includes(credit_debit) ? credit_debit : 'credit';

  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(job_id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const recorder = req.session?.name || 'Unknown';
  const timeVal  = time_received || currentTime();

  const info = db.prepare(`
    INSERT INTO payments_received (job_id, customer_name, check_number, amount, date_received, time_received, payment_type, credit_debit, recorded_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(job_id, customer_name || null, check_number || null, parsedAmount, date_received, timeVal, pType, crDr, recorder, notes || null);

  const payment = db.prepare('SELECT * FROM payments_received WHERE id = ?').get(info.lastInsertRowid);
  logAudit(job_id, 'payment_received', `Check received: $${amount} (${payment_type || 'deposit'}, ${credit_debit || 'credit'}) recorded by ${recorder}`, recorder);
  res.json({ payment, summary: jobSummary(db, job_id) });

  // After responding, send deposit confirmation email if contract is signed
  setImmediate(async () => {
    try {
      const fullJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job_id);
      if (!fullJob?.customer_email) return;
      if (!['contract_signed', 'in_progress', 'completed'].includes(fullJob.status)) return;

      const { sendEmail } = require('../services/emailService');
      const { mergePDFs } = require('../services/pdfMergeService');
      const paidAmount  = `$${Number(parsedAmount).toLocaleString()}`;
      const paidWhen    = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/New_York' });
      const pTypeLabel  = { deposit: 'Deposit', progress: 'Progress Payment', final: 'Final Payment', other: 'Payment' }[pType] || 'Payment';
      const safeName    = (fullJob.customer_name || job_id).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

      let mergedPdfPath = fullJob.contract_pdf_path;
      try {
        mergedPdfPath = await mergePDFs(
          [fullJob.proposal_pdf_path, fullJob.contract_pdf_path],
          `pb-payment-${job_id}.pdf`
        );
      } catch (mergeErr) {
        console.warn('[PaymentEmail] PDF merge failed, using contract only:', mergeErr.message);
      }

      // Auto-save completed file to signed contracts folder (Windows server)
      const contractsDir = process.env.SIGNED_CONTRACTS_DIR;
      if (contractsDir && mergedPdfPath) {
        try {
          const fsSync = require('fs');
          const pathLib = require('path');
          if (!fsSync.existsSync(contractsDir)) fsSync.mkdirSync(contractsDir, { recursive: true });
          const dateStamp = new Date().toISOString().slice(0, 10);
          const destName  = `Preferred-Builders-COMPLETED-${safeName}-${dateStamp}.pdf`;
          const destPath  = pathLib.join(contractsDir, destName);
          fsSync.copyFileSync(mergedPdfPath, destPath);
          console.log(`[SignedContracts] Payment-confirmed file saved: ${destPath}`);
        } catch (saveErr) {
          console.warn('[SignedContracts] Failed to save payment-confirmed file:', saveErr.message);
        }
      }

      await sendEmail({
        to: fullJob.customer_email,
        subject: `Payment Received — Preferred Builders (${pTypeLabel} ${paidAmount})`,
        attachmentPath: mergedPdfPath,
        attachmentName: `Preferred-Builders-Contract-and-Proposal-${safeName}.pdf`,
        html: `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto">
          <div style="background:#1B3A6B;padding:20px 24px;color:white;border-radius:8px 8px 0 0">
            <div style="font-size:17px;font-weight:700">Preferred Builders General Services Inc.</div>
            <div style="font-size:12px;opacity:.8;margin-top:4px">HIC-197400 · CSL CS-121662 · 978-377-1784</div>
          </div>
          <div style="background:white;padding:28px 24px;border:1px solid #eee;border-top:none">
            <p style="font-size:15px;color:#1B3A6B;font-weight:700;margin-bottom:12px">Hi ${fullJob.customer_name || 'there'},</p>
            <p style="color:#444;font-size:14px;line-height:1.7;margin-bottom:16px">
              We have received your payment — thank you! Your project at <strong>${fullJob.project_address}${fullJob.project_city ? ', ' + fullJob.project_city : ''}</strong>
              is now officially confirmed and scheduled. We will be in touch shortly with your start date.
            </p>
            <div style="background:#F0FFF6;border-radius:8px;padding:16px 20px;margin-bottom:20px">
              <p style="margin:0 0 8px 0;font-size:13px;color:#444"><strong>Payment Type:</strong> ${pTypeLabel}</p>
              <p style="margin:0 0 8px 0;font-size:13px;color:#444"><strong>Amount Received:</strong> ${paidAmount}</p>
              <p style="margin:0 0 8px 0;font-size:13px;color:#444"><strong>Date:</strong> ${paidWhen}</p>
              <p style="margin:0;font-size:13px;color:#444"><strong>Project:</strong> ${fullJob.project_address}${fullJob.project_city ? ', ' + fullJob.project_city : ''}</p>
            </div>
            <p style="color:#444;font-size:14px;line-height:1.7;margin-bottom:16px">
              📎 <strong>Your signed contract and original proposal are attached together as one document</strong> for your records. Please keep this for your files.
            </p>
            <p style="color:#888;font-size:12px;line-height:1.6">
              Questions? Reply to this email or call us at <strong>978-377-1784</strong>.
            </p>
          </div>
          <div style="background:#f8f9ff;padding:14px 24px;font-size:10px;color:#aaa;border-radius:0 0 8px 8px">
            <p style="margin:0 0 4px 0">Preferred Builders General Services Inc. · 37 Duck Mill Rd, Fitchburg MA 01420 · HIC-197400 · CSL CS-121662</p>
            <p style="margin:0 0 4px 0">By receiving this communication you agree to receive digital communications from Preferred Builders General Services Inc. as required for your project.</p>
            <p style="margin:0 0 4px 0">This contract is legally binding. The 3-business-day cancellation period per M.G.L. c. 93 §48 applies from the date of signing.</p>
            <p style="margin:0">The approved Proposal / Scope of Work is non-binding on its own and is incorporated as a Contract Addendum upon execution of this agreement.</p>
          </div>
        </div>`,
        text: `Hi ${fullJob.customer_name || 'there'},\n\nWe received your ${pTypeLabel} of ${paidAmount} on ${paidWhen}.\n\nYour project at ${fullJob.project_address} is confirmed and scheduled. We will follow up with your start date shortly.\n\nA copy of your signed contract is attached.\n\n— Preferred Builders General Services Inc.\n978-377-1784`,
        emailType: 'general',
        jobId: job_id
      });
      console.log(`[Payment] Deposit confirmation sent to ${fullJob.customer_email}`);
    } catch (e) {
      console.warn('[Payment] Confirmation email failed:', e.message);
    }
  });
});

router.post('/made', requireAuth, (req, res) => {
  const db = getDb();
  const { job_id, payee_name, check_number, amount, date_paid, time_paid, category, credit_debit, notes } = req.body;
  if (!job_id)     return res.status(400).json({ error: 'job_id is required' });
  if (!payee_name) return res.status(400).json({ error: 'payee_name is required' });
  if (!date_paid)  return res.status(400).json({ error: 'date_paid is required' });

  const parsedAmount = validateAmount(amount);
  if (parsedAmount === null) return res.status(400).json({ error: 'amount must be a positive number' });

  const cat  = VALID_CATEGORIES.includes(category) ? category : 'subcontractor';
  const crDr = VALID_CREDIT_DEBIT.includes(credit_debit) ? credit_debit : 'debit';

  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(job_id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const recorder = req.session?.name || 'Unknown';
  const timeVal  = time_paid || currentTime();

  const info = db.prepare(`
    INSERT INTO payments_made (job_id, payee_name, check_number, amount, date_paid, time_paid, category, credit_debit, recorded_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(job_id, payee_name.trim(), check_number || null, parsedAmount, date_paid, timeVal, cat, crDr, recorder, notes || null);

  const payment = db.prepare('SELECT * FROM payments_made WHERE id = ?').get(info.lastInsertRowid);
  logAudit(job_id, 'payment_made', `Check paid to ${payee_name}: $${amount} (${category || 'subcontractor'}, ${credit_debit || 'debit'}) recorded by ${recorder}`, recorder);
  res.json({ payment, summary: jobSummary(db, job_id) });
});

router.patch('/received/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM payments_received WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Payment not found' });

  const { customer_name, check_number, amount, date_received, time_received, payment_type, credit_debit, notes } = req.body;

  let parsedAmt = row.amount;
  if (amount !== undefined) {
    parsedAmt = validateAmount(amount);
    if (parsedAmt === null) return res.status(400).json({ error: 'amount must be a positive number' });
  }
  const pType = payment_type !== undefined ? (VALID_PAYMENT_TYPES.includes(payment_type) ? payment_type : row.payment_type) : row.payment_type;
  const crDr  = credit_debit !== undefined ? (VALID_CREDIT_DEBIT.includes(credit_debit) ? credit_debit : row.credit_debit) : row.credit_debit;

  db.prepare(`
    UPDATE payments_received SET
      customer_name = ?, check_number = ?, amount = ?, date_received = ?, time_received = ?,
      payment_type = ?, credit_debit = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    customer_name ?? row.customer_name,
    check_number  ?? row.check_number,
    parsedAmt,
    date_received ?? row.date_received,
    time_received ?? row.time_received,
    pType,
    crDr,
    notes         ?? row.notes,
    row.id
  );

  const updated = db.prepare('SELECT * FROM payments_received WHERE id = ?').get(row.id);
  res.json({ payment: updated, summary: jobSummary(db, row.job_id) });
});

router.patch('/made/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM payments_made WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Payment not found' });

  const { payee_name, check_number, amount, date_paid, time_paid, category, credit_debit, notes } = req.body;

  let parsedAmt = row.amount;
  if (amount !== undefined) {
    parsedAmt = validateAmount(amount);
    if (parsedAmt === null) return res.status(400).json({ error: 'amount must be a positive number' });
  }
  const cat  = category !== undefined ? (VALID_CATEGORIES.includes(category) ? category : row.category) : row.category;
  const crDr = credit_debit !== undefined ? (VALID_CREDIT_DEBIT.includes(credit_debit) ? credit_debit : row.credit_debit) : row.credit_debit;

  db.prepare(`
    UPDATE payments_made SET
      payee_name = ?, check_number = ?, amount = ?, date_paid = ?, time_paid = ?,
      category = ?, credit_debit = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    payee_name    ?? row.payee_name,
    check_number  ?? row.check_number,
    parsedAmt,
    date_paid     ?? row.date_paid,
    time_paid     ?? row.time_paid,
    cat,
    crDr,
    notes         ?? row.notes,
    row.id
  );

  const updated = db.prepare('SELECT * FROM payments_made WHERE id = ?').get(row.id);
  res.json({ payment: updated, summary: jobSummary(db, row.job_id) });
});

router.delete('/received/:id', requireAuth, (req, res) => {
  const db  = getDb();
  const row = db.prepare('SELECT * FROM payments_received WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Payment not found' });
  db.prepare('DELETE FROM payments_received WHERE id = ?').run(row.id);
  logAudit(row.job_id, 'payment_received_deleted', `Check record deleted: $${row.amount}`, req.session?.name || 'admin');
  res.json({ success: true, summary: jobSummary(db, row.job_id) });
});

router.delete('/made/:id', requireAuth, (req, res) => {
  const db  = getDb();
  const row = db.prepare('SELECT * FROM payments_made WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Payment not found' });
  db.prepare('DELETE FROM payments_made WHERE id = ?').run(row.id);
  logAudit(row.job_id, 'payment_made_deleted', `Outgoing check deleted: $${row.amount} to ${row.payee_name}`, req.session?.name || 'admin');
  res.json({ success: true, summary: jobSummary(db, row.job_id) });
});

module.exports = router;
