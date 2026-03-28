'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb }       = require('../db/database');
const { logActivity } = require('./activityLog');
const { sendEmail }   = require('../services/emailService');
const { generatePDFFromHTML } = require('../services/pdfService');

const VALID_TYPES   = ['contract_invoice', 'pass_through_invoice', 'change_order'];
const VALID_STATUSES = ['draft', 'sent', 'paid', 'void'];

function getOrCreateCounters(db, jobId) {
  let row = db.prepare('SELECT * FROM invoice_counters WHERE job_id = ?').get(jobId);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO invoice_counters (job_id) VALUES (?)').run(jobId);
    row = db.prepare('SELECT * FROM invoice_counters WHERE job_id = ?').get(jobId);
  }
  return row;
}

function nextInvoiceNumber(db, jobId, invoiceType, quoteNumber) {
  const base = quoteNumber || jobId.slice(0, 6);
  const prefix = `PB-${base}`;

  const counters = getOrCreateCounters(db, jobId);

  if (invoiceType === 'pass_through_invoice') {
    const seq = counters.pass_through_seq + 1;
    db.prepare('UPDATE invoice_counters SET pass_through_seq = ? WHERE job_id = ?').run(seq, jobId);
    return `${prefix}-INV-PT-${String(seq).padStart(2, '0')}`;
  } else if (invoiceType === 'change_order') {
    const seq = (counters.co_seq || 0) + 1;
    db.prepare('UPDATE invoice_counters SET co_seq = ? WHERE job_id = ?').run(seq, jobId);
    return `${prefix}-CO-${String(seq).padStart(2, '0')}`;
  } else {
    const seq = counters.contract_seq + 1;
    db.prepare('UPDATE invoice_counters SET contract_seq = ? WHERE job_id = ?').run(seq, jobId);
    return `${prefix}-INV-${String(seq).padStart(2, '0')}`;
  }
}

function nextDeptCode(db, jobId, quoteNumber) {
  const base = quoteNumber || jobId.slice(0, 6);
  const counters = getOrCreateCounters(db, jobId);
  const seq = counters.dept_seq + 1;
  db.prepare('UPDATE invoice_counters SET dept_seq = ? WHERE job_id = ?').run(seq, jobId);
  return `PB-${base}-D${String(seq).padStart(2, '0')}`;
}

router.get('/job/:jobId', requireAuth, (req, res) => {
  const db = getDb();
  const { jobId } = req.params;
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const invoices = db.prepare('SELECT * FROM invoices WHERE job_id = ? ORDER BY created_at ASC').all(jobId);
  res.json({ invoices });
});

router.post('/job/:jobId', requireAuth, (req, res) => {
  const db = getDb();
  const { jobId } = req.params;
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const { invoice_type, amount, notes, line_items } = req.body;
  const invType = VALID_TYPES.includes(invoice_type) ? invoice_type : 'contract_invoice';

  const invNum = nextInvoiceNumber(db, jobId, invType, job.quote_number);

  const info = db.prepare(`
    INSERT INTO invoices (job_id, invoice_number, invoice_type, status, amount, line_items, notes)
    VALUES (?, ?, ?, 'draft', ?, ?, ?)
  `).run(jobId, invNum, invType, parseFloat(amount) || 0, line_items ? JSON.stringify(line_items) : null, notes || null);

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(info.lastInsertRowid);

  const contact = job.contact_id ? db.prepare('SELECT pb_customer_number FROM contacts WHERE id = ?').get(job.contact_id) : null;
  const recorder = req.session?.name || 'staff';

  logActivity({
    customer_number: contact?.pb_customer_number || null,
    job_id: jobId,
    event_type: 'INVOICE_ISSUED',
    description: `Invoice ${invNum} created (${invType.replace(/_/g, ' ')}) — $${Number(amount || 0).toLocaleString()}`,
    document_ref: invNum,
    recorded_by: recorder
  });

  res.json({ invoice });
});

router.patch('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });

  const { status, amount, amount_paid, notes, line_items, issued_at, paid_at } = req.body;

  const newStatus    = VALID_STATUSES.includes(status) ? status : inv.status;
  const newAmount    = amount     !== undefined ? parseFloat(amount)      : inv.amount;
  const newAmtPaid   = amount_paid !== undefined ? parseFloat(amount_paid) : inv.amount_paid;

  db.prepare(`
    UPDATE invoices SET
      status = ?, amount = ?, amount_paid = ?, notes = ?, line_items = ?,
      issued_at = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    newStatus,
    newAmount,
    newAmtPaid,
    notes      ?? inv.notes,
    line_items !== undefined ? (line_items ? JSON.stringify(line_items) : null) : inv.line_items,
    issued_at  ?? inv.issued_at,
    paid_at    ?? inv.paid_at,
    inv.id
  );

  if (newStatus === 'paid' && inv.status !== 'paid') {
    const job     = db.prepare('SELECT * FROM jobs WHERE id = ?').get(inv.job_id);
    const contact = job?.contact_id ? db.prepare('SELECT pb_customer_number FROM contacts WHERE id = ?').get(job.contact_id) : null;
    logActivity({
      customer_number: contact?.pb_customer_number || null,
      job_id: inv.job_id,
      event_type: inv.invoice_type === 'pass_through_invoice' ? 'PASS_THROUGH_REIMBURSED' : 'PAYMENT_RECEIVED',
      description: `Invoice ${inv.invoice_number} marked paid — $${newAmtPaid.toLocaleString()}`,
      document_ref: inv.invoice_number,
      recorded_by: req.session?.name || 'staff'
    });
  }

  const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id);
  res.json({ invoice: updated });
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  db.prepare('DELETE FROM invoices WHERE id = ?').run(inv.id);
  res.json({ success: true });
});

// GET /:id/pdf — generate and stream a simple invoice PDF
router.get('/:id/pdf', requireAuth, async (req, res) => {
  try {
    const db  = getDb();
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const job = inv.job_id ? db.prepare('SELECT * FROM jobs WHERE id = ?').get(inv.job_id) : null;
    const contact = job?.contact_id ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(job.contact_id) : null;

    // Parse proposal_data for line items and pass-through fee detail
    let proposalData = null;
    try { proposalData = job?.proposal_data ? JSON.parse(job.proposal_data) : null; } catch {}

    const typeLabels = { contract_invoice: 'Contract Invoice', pass_through_invoice: 'Pass-Through Invoice', change_order: 'Change Order' };
    const typeLabel  = typeLabels[inv.invoice_type] || 'Invoice';
    const isPT = inv.invoice_type === 'pass_through_invoice';

    // Build line items section for contract invoices
    const lineItems = proposalData?.lineItems || [];
    const contractLineItemsHTML = (!isPT && lineItems.length > 0) ? `
<div class="section">
  <h3>Scope of Work — Line Items</h3>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <tr style="background:#f0f4ff"><th style="text-align:left;padding:6px 8px;font-size:10px;color:#555;font-weight:600">Trade / Description</th><th style="text-align:right;padding:6px 8px;font-size:10px;color:#555;font-weight:600">Price</th></tr>
    ${lineItems.filter(li => !['permit','engineer','architect','designer'].includes((li.trade||'').toLowerCase())).map(li => `
    <tr style="border-bottom:1px solid #f0f0f0">
      <td style="padding:7px 8px;color:#333;font-size:12px">${li.trade || '—'}${li.description ? `<br><span style="font-size:10px;color:#888">${li.description}</span>` : ''}</td>
      <td style="padding:7px 8px;text-align:right;font-weight:600;font-size:12px">$${Number(li.finalPrice||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td>
    </tr>`).join('')}
    <tr style="background:#f8f9ff;border-top:2px solid #1B3A6B">
      <td style="padding:8px;font-weight:bold;font-size:12px">Total Contract Value</td>
      <td style="padding:8px;text-align:right;font-weight:bold;font-size:13px;color:#1B3A6B">$${Number(proposalData?.pricing?.totalContractPrice||job?.total_value||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td>
    </tr>
  </table>
</div>` : '';

    // Build pass-through itemized section
    const parsePTFee = (str) => { if (!str) return 0; const n = parseFloat(String(str).replace(/[^0-9.]/g,'')); return isNaN(n) ? 0 : n; };
    const ptItems = [];
    if (proposalData?.job?.has_permit && proposalData?.job?.permit_fee)   ptItems.push({ label: 'Building Permit', amount: parsePTFee(proposalData.job.permit_fee) });
    if (proposalData?.job?.has_engineer && proposalData?.job?.engineer_fee) ptItems.push({ label: 'Engineering Fee', amount: parsePTFee(proposalData.job.engineer_fee) });
    if (proposalData?.job?.has_architect && proposalData?.job?.architect_fee) ptItems.push({ label: 'Architect Fee', amount: parsePTFee(proposalData.job.architect_fee) });
    const ptLineItemsHTML = (isPT && ptItems.length > 0) ? `
<div class="section">
  <h3>Pass-Through Cost Breakdown</h3>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <tr style="background:#fffbeb"><th style="text-align:left;padding:6px 8px;font-size:10px;color:#92400e;font-weight:600">Cost Item</th><th style="text-align:right;padding:6px 8px;font-size:10px;color:#92400e;font-weight:600">Amount</th></tr>
    ${ptItems.map(pt => `<tr style="border-bottom:1px solid #fef3c7"><td style="padding:7px 8px;color:#333">${pt.label}</td><td style="padding:7px 8px;text-align:right;font-weight:600">$${pt.amount.toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>`).join('')}
    <tr style="background:#fef3c7;border-top:2px solid #f59e0b"><td style="padding:8px;font-weight:bold">Total Reimbursement</td><td style="padding:8px;text-align:right;font-weight:bold;color:#92400e">$${ptItems.reduce((s,p)=>s+p.amount,0).toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
  </table>
  <p style="font-size:11px;color:#92400e;margin:8px 0 0">These are third-party costs paid by Preferred Builders on your behalf and billed for direct reimbursement only. They are not revenue to Preferred Builders.</p>
</div>` : '';

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #222; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .logo-block h1 { color: #1B3A6B; margin: 0; font-size: 22px; }
  .logo-block p  { color: #888; margin: 4px 0; font-size: 12px; }
  .inv-meta { text-align: right; }
  .inv-meta .inv-num { font-size: 20px; font-weight: bold; color: #1B3A6B; }
  .inv-meta .status  { font-size: 12px; color: #888; }
  .divider { border: none; border-top: 2px solid #E07B2A; margin: 16px 0; }
  .section { margin-bottom: 24px; }
  .section h3 { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .amount-box { background: #f8f9ff; border: 2px solid #1B3A6B; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }
  .amount-box .amt { font-size: 36px; font-weight: bold; color: #1B3A6B; }
  .amount-box .lbl { font-size: 12px; color: #888; }
  .pt-notice { background: #fffbeb; border: 1px solid #fbbf24; border-radius: 6px; padding: 12px; font-size: 12px; color: #92400e; margin-bottom: 16px; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #888; text-align: center; }
</style></head>
<body>
<div class="header">
  <div class="logo-block">
    <h1>PREFERRED BUILDERS</h1>
    <p>General Services Inc.</p>
    <p>978-377-1784 | Fitchburg, MA</p>
    <p>License #CS-109171</p>
  </div>
  <div class="inv-meta">
    <div class="inv-num">${inv.invoice_number}</div>
    <div class="status">${typeLabel}</div>
    <div class="status">Status: <strong>${(inv.status || 'draft').toUpperCase()}</strong></div>
    <div class="status">Issued: ${inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}</div>
  </div>
</div>
<hr class="divider">

${isPT ? `<div class="pt-notice"><strong>PASS-THROUGH COST — NOT A REVENUE ITEM</strong><br>This invoice covers costs paid by Preferred Builders on behalf of the customer (permits, engineers, consultants, etc.) and is billed for direct reimbursement only.</div>` : ''}

${contact || job ? `<div class="section">
  <h3>Billed To</h3>
  ${contact?.pb_customer_number ? `<div style="font-family:monospace;font-size:11px;background:#e0e8ff;color:#1B3A6B;padding:2px 8px;border-radius:4px;display:inline-block;margin-bottom:6px;font-weight:bold">${contact.pb_customer_number}</div><br>` : ''}
  <strong>${contact?.name || job?.customer_name || '—'}</strong><br>
  ${contact?.email || job?.customer_email || ''}${(contact?.email || job?.customer_email) ? '<br>' : ''}
  ${contact?.phone || job?.customer_phone || ''}${(contact?.phone || job?.customer_phone) ? '<br>' : ''}
  ${[contact?.address || '', contact?.city || job?.project_city || '', contact?.state || 'MA'].filter(Boolean).join(', ') || job?.project_address || ''}
</div>` : ''}

${job ? `<div class="section">
  <h3>Project</h3>
  ${job.pb_number || job.quote_number ? `<strong>PB# ${job.pb_number || job.quote_number}</strong><br>` : ''}
  ${job.project_address || ''}${job.project_city ? ', ' + job.project_city + ', MA' : ''}
</div>` : ''}

${contractLineItemsHTML}
${ptLineItemsHTML}

<div class="amount-box">
  <div class="lbl">Invoice Amount</div>
  <div class="amt">$${Number(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
  ${inv.amount_paid > 0 ? `<div class="lbl" style="margin-top:8px;color:#2E7D32">Paid: $${Number(inv.amount_paid).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>` : ''}
</div>

${inv.notes ? `<div class="section"><h3>Notes</h3><p style="font-size:13px">${inv.notes}</p></div>` : ''}

<div class="footer">
  Preferred Builders General Services Inc. · MA License #CS-109171 · 978-377-1784<br>
  Please make checks payable to: <strong>Preferred Builders General Services Inc.</strong>
</div>
</body></html>`;

    const pdfPath = await generatePDFFromHTML(html, `invoice_${inv.invoice_number.replace(/[^a-zA-Z0-9-]/g, '_')}`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${inv.invoice_number}.pdf"`);
    const fs = require('fs');
    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    console.error('[Invoice PDF]', err.message);
    res.status(500).json({ error: 'PDF generation failed: ' + err.message });
  }
});

// POST /:id/pdf — generate invoice PDF (alias for GET; supports clients expecting POST)
router.post('/:id/pdf', requireAuth, (req, res) => {
  // Redirect to GET which streams the PDF (preserves token from header or body)
  const token = req.query.token || req.body?.token || '';
  res.redirect(307, `/api/invoices/${req.params.id}/pdf?token=${encodeURIComponent(token)}`);
});

// POST /:id/email — email invoice PDF to customer
router.post('/:id/email', requireAuth, async (req, res) => {
  try {
    const db  = getDb();
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const job = inv.job_id ? db.prepare('SELECT * FROM jobs WHERE id = ?').get(inv.job_id) : null;
    const contact = job?.contact_id ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(job.contact_id) : null;

    const customerEmail = contact?.email || job?.customer_email;
    if (!customerEmail) return res.status(400).json({ error: 'No customer email on file for this job' });

    const typeLabels = { contract_invoice: 'Contract Invoice', pass_through_invoice: 'Pass-Through Invoice', change_order: 'Change Order' };
    const typeLabel  = typeLabels[inv.invoice_type] || 'Invoice';
    const isPT = inv.invoice_type === 'pass_through_invoice';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;margin:0;padding:40px;color:#222}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}
  .logo-block h1{color:#1B3A6B;margin:0;font-size:22px}
  .logo-block p{color:#888;margin:4px 0;font-size:12px}
  .inv-meta{text-align:right}
  .inv-num{font-size:20px;font-weight:bold;color:#1B3A6B}
  .status{font-size:12px;color:#888}
  .divider{border:none;border-top:2px solid #E07B2A;margin:16px 0}
  .section{margin-bottom:24px}
  .section h3{font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
  .amount-box{background:#f8f9ff;border:2px solid #1B3A6B;border-radius:8px;padding:20px;text-align:center;margin:24px 0}
  .amount-box .amt{font-size:36px;font-weight:bold;color:#1B3A6B}
  .amount-box .lbl{font-size:12px;color:#888}
  .pt-notice{background:#fffbeb;border:1px solid #fbbf24;border-radius:6px;padding:12px;font-size:12px;color:#92400e;margin-bottom:16px}
  .footer{margin-top:48px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#888;text-align:center}
</style></head><body>
<div class="header">
  <div class="logo-block">
    <h1>PREFERRED BUILDERS</h1>
    <p>General Services Inc.</p>
    <p>978-377-1784 | Fitchburg, MA</p>
    <p>License #CS-109171</p>
  </div>
  <div class="inv-meta">
    <div class="inv-num">${inv.invoice_number}</div>
    <div class="status">${typeLabel}</div>
    <div class="status">Status: <strong>${(inv.status || 'draft').toUpperCase()}</strong></div>
    <div class="status">Issued: ${inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}</div>
  </div>
</div>
<hr class="divider">
${isPT ? `<div class="pt-notice"><strong>PASS-THROUGH COST — NOT A REVENUE ITEM</strong><br>Billed for direct reimbursement only (permits, engineers, consultants, etc.)</div>` : ''}
${contact || job ? `<div class="section"><h3>Billed To</h3>
  ${contact?.pb_customer_number ? `<div style="font-family:monospace;font-size:11px;background:#e0e8ff;color:#1B3A6B;padding:2px 8px;border-radius:4px;display:inline-block;margin-bottom:6px;font-weight:bold">${contact.pb_customer_number}</div><br>` : ''}
  <strong>${contact?.name || job?.customer_name || '—'}</strong><br>
  ${customerEmail}<br>
  ${contact?.phone || job?.customer_phone || ''}
</div>` : ''}
${job ? `<div class="section"><h3>Project</h3>
  ${job.pb_number || job.quote_number ? `<strong>PB# ${job.pb_number || job.quote_number}</strong><br>` : ''}
  ${job.project_address || ''}${job.project_city ? ', ' + job.project_city + ', MA' : ''}
</div>` : ''}
<div class="amount-box">
  <div class="lbl">Invoice Amount</div>
  <div class="amt">$${Number(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
  ${inv.amount_paid > 0 ? `<div class="lbl" style="margin-top:8px;color:#2E7D32">Paid: $${Number(inv.amount_paid).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>` : ''}
</div>
${inv.notes ? `<div class="section"><h3>Notes</h3><p style="font-size:13px">${inv.notes}</p></div>` : ''}
<div class="footer">Preferred Builders General Services Inc. · MA License #CS-109171 · 978-377-1784<br>
Please make checks payable to: <strong>Preferred Builders General Services Inc.</strong></div>
</body></html>`;

    const pdfPath = await generatePDFFromHTML(html, `invoice_${inv.invoice_number.replace(/[^a-zA-Z0-9-]/g, '_')}_email`);

    const subject = `Invoice ${inv.invoice_number} from Preferred Builders${job ? ' — ' + (job.project_address || job.description || 'Your Project') : ''}`;
    const emailBody = `<p>Dear ${contact?.name || job?.customer_name || 'Valued Customer'},</p>
<p>Please find your invoice <strong>${inv.invoice_number}</strong> (${typeLabel}) attached for <strong>$${Number(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>.</p>
${isPT ? '<p><em>Note: This is a pass-through cost invoice billed for direct reimbursement of permits, engineering fees, or other third-party costs paid on your behalf.</em></p>' : ''}
<p>If you have any questions, please don't hesitate to contact us.</p>
<p>Thank you for choosing Preferred Builders.</p>
<p>— Preferred Builders General Services Inc.<br>978-377-1784 | Fitchburg, MA</p>`;

    await sendEmail({
      to: customerEmail,
      subject,
      html: emailBody,
      attachments: [{ path: pdfPath, filename: `${inv.invoice_number}.pdf` }],
      emailType: 'invoice',
      jobId: inv.job_id,
      db
    });

    db.prepare("UPDATE invoices SET status = 'sent' WHERE id = ? AND status = 'draft'").run(inv.id);

    logActivity({
      customer_number: contact?.pb_customer_number || null,
      job_id: inv.job_id || null,
      event_type: 'INVOICE_ISSUED',
      description: `Invoice ${inv.invoice_number} emailed to ${customerEmail}`,
      document_ref: inv.invoice_number,
      recorded_by: req.session?.name || req.user?.name || 'system'
    });

    res.json({ success: true, to: customerEmail });
  } catch (err) {
    console.error('[Invoice Email]', err.message);
    res.status(500).json({ error: 'Failed to email invoice: ' + err.message });
  }
});

module.exports = { router, nextInvoiceNumber, nextDeptCode };
