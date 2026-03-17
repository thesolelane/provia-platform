 // server/routes/jobs.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');
const { generatePDF } = require('../services/pdfService');
const { sendWhatsApp } = require('../services/whatsappService');
const { sendEmail } = require('../services/emailService');
const { logAudit } = require('../services/auditService');
const { tickQuoteCounter } = require('../services/assessmentService');
const { addClient, removeClient, notifyClients } = require('../services/sseManager');

// Helper: save proposal, backfill job columns, and upsert contact record
function saveProposalReady(db, proposalData, pdfPath, jobId) {
  const c = proposalData.customer || {};
  const p = proposalData.project || {};

  // 1. Update the job record
  db.prepare(`
    UPDATE jobs SET
      proposal_data = ?, proposal_pdf_path = ?, total_value = ?, deposit_amount = ?,
      status = ?, updated_at = CURRENT_TIMESTAMP,
      customer_name  = COALESCE(NULLIF(?, ''), customer_name),
      customer_email = COALESCE(NULLIF(?, ''), customer_email),
      customer_phone = COALESCE(NULLIF(?, ''), customer_phone),
      project_address = COALESCE(NULLIF(?, ''), project_address),
      project_city    = COALESCE(NULLIF(?, ''), project_city)
    WHERE id = ?`
  ).run(
    JSON.stringify(proposalData), pdfPath, proposalData.totalValue, proposalData.depositAmount,
    'proposal_ready',
    c.name || '', c.email || '', c.phone || '',
    p.address || '', p.city || '',
    jobId
  );

  // 2. Upsert contact using the job's stored PII (which never left our server)
  //    and link the job to the contact via contact_id
  const job = db.prepare('SELECT customer_name, customer_email, customer_phone, project_address, project_city, contact_id FROM jobs WHERE id = ?').get(jobId);
  const contactName  = c.name  || job?.customer_name  || '';
  const contactEmail = c.email || job?.customer_email || '';
  const contactPhone = c.phone || job?.customer_phone || '';
  const contactAddr  = p.address || job?.project_address || '';
  const contactCity  = p.city    || job?.project_city    || '';

  if (contactName || contactEmail) {
    try {
      const contactRef = findOrCreateContact(db, {
        name: contactName, email: contactEmail, phone: contactPhone,
        address: contactAddr, city: contactCity, state: p.state || 'MA'
      });
      // Set contact_id on job if not already set
      if (!job?.contact_id) {
        db.prepare('UPDATE jobs SET contact_id = ? WHERE id = ?').run(contactRef.id, jobId);
      }
    } catch (e) { console.warn('[saveProposalReady] Contact upsert failed:', e.message); }
  }
}

// Helper: save extracted data with review_pending status (no PDF yet)
function saveReviewPending(db, proposalData, jobId) {
  const c = proposalData.customer || {};
  const p = proposalData.project  || {};
  db.prepare(`
    UPDATE jobs SET
      proposal_data = ?, status = 'review_pending', updated_at = CURRENT_TIMESTAMP,
      total_value = ?, deposit_amount = ?,
      customer_name  = COALESCE(NULLIF(?, ''), customer_name),
      customer_email = COALESCE(NULLIF(?, ''), customer_email),
      customer_phone = COALESCE(NULLIF(?, ''), customer_phone),
      project_address = COALESCE(NULLIF(?, ''), project_address),
      project_city    = COALESCE(NULLIF(?, ''), project_city)
    WHERE id = ?`
  ).run(
    JSON.stringify(proposalData),
    proposalData.totalValue || 0, proposalData.depositAmount || 0,
    c.name || '', c.email || '', c.phone || '',
    p.address || '', p.city || '',
    jobId
  );
}

// ── Customer serial number helpers ─────────────────────────────────────────

// Generates next PB-C-YYYY-NNNN serial using an atomic DB counter (race-safe)
function generateCustomerSerial(db) {
  const year = new Date().getFullYear();
  const assign = db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO customer_serial_counter (year, next_seq) VALUES (?, 1)').run(year);
    const row = db.prepare('SELECT next_seq FROM customer_serial_counter WHERE year = ?').get(year);
    const seq = row.next_seq;
    db.prepare('UPDATE customer_serial_counter SET next_seq = next_seq + 1 WHERE year = ?').run(year);
    return `PB-C-${year}-${String(seq).padStart(4, '0')}`;
  });
  return assign();
}

// Find or create a contact, always assigning a CSN to new contacts
function findOrCreateContact(db, { name, email, phone, address, city, state }) {
  let contact = email
    ? db.prepare('SELECT * FROM contacts WHERE email = ? COLLATE NOCASE LIMIT 1').get(email)
    : null;
  if (!contact && name) {
    contact = db.prepare('SELECT * FROM contacts WHERE name = ? COLLATE NOCASE LIMIT 1').get(name);
  }
  if (contact) {
    // Fill in any missing fields without overwriting existing data
    db.prepare(`
      UPDATE contacts SET
        name    = COALESCE(NULLIF(?, ''), name),
        email   = COALESCE(NULLIF(?, ''), email),
        phone   = COALESCE(NULLIF(?, ''), phone),
        address = COALESCE(NULLIF(?, ''), address),
        city    = COALESCE(NULLIF(?, ''), city),
        state   = COALESCE(NULLIF(?, ''), state),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`)
      .run(name||'', email||'', phone||'', address||'', city||'', state||'MA', contact.id);
    // Assign CSN if contact doesn't have one yet (existing contacts pre-feature)
    if (!contact.customer_number) {
      const csn = generateCustomerSerial(db);
      db.prepare('UPDATE contacts SET customer_number = ? WHERE id = ?').run(csn, contact.id);
      contact.customer_number = csn;
    }
    return { id: contact.id, csn: contact.customer_number };
  } else {
    const csn = generateCustomerSerial(db);
    const result = db.prepare(`
      INSERT INTO contacts (name, email, phone, address, city, state, customer_number, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'estimate')`)
      .run(name||'', email||'', phone||'', address||'', city||'', state||'MA', csn);
    return { id: result.lastInsertRowid, csn };
  }
}

// Strip email addresses and phone numbers from estimate text before sending to Claude
function stripPII(text) {
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email-redacted]')
    .replace(/\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone-redacted]');
}

// GET archived jobs (must be before /:id route)
router.get('/archived/list', requireAuth, (req, res) => {
  const db = getDb();
  const jobs = db.prepare('SELECT * FROM jobs WHERE archived = 1 ORDER BY archived_at DESC').all();
  res.json({ jobs });
});

// GET all jobs
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { status, limit = 50, offset = 0 } = req.query;
  let query = 'SELECT * FROM jobs WHERE archived = 0';
  const params = [];
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  const jobs = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE archived = 0' + (status ? ' AND status = ?' : '')).get(...(status ? [status] : []));
  res.json({ jobs, total: total.count });
});

// GET single job with full detail
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const conversations = db.prepare('SELECT * FROM conversations WHERE job_id = ? ORDER BY created_at ASC').all(req.params.id);
  const clarifications = db.prepare('SELECT * FROM clarifications WHERE job_id = ? ORDER BY asked_at ASC').all(req.params.id);
  const auditLog = db.prepare('SELECT * FROM audit_log WHERE job_id = ? ORDER BY created_at ASC').all(req.params.id);

  // Parse JSON fields
  if (job.proposal_data) { try { job.proposal_data = JSON.parse(job.proposal_data); } catch {} }
  if (job.contract_data) { try { job.contract_data = JSON.parse(job.contract_data); } catch {} }
  if (job.flagged_items) { try { job.flagged_items = JSON.parse(job.flagged_items); } catch {} }

  res.json({ job, conversations, clarifications, auditLog });
});

// POST approve proposal → generate contract
// POST manually mark proposal as approved (in-person/verbal approval)
router.post('/:id/mark-approved', requireAuth, async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.proposal_data) return res.status(400).json({ error: 'No proposal to approve' });
  db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('proposal_approved', job.id);
  logAudit(job.id, 'proposal_approved', 'Proposal manually approved via admin panel', req.session?.name || 'admin');
  res.json({ success: true, message: 'Proposal marked as approved' });
});

// PATCH /:id/line-items — save edited line items back to proposal_data (stays review_pending)
router.patch('/:id/line-items', requireAuth, async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.proposal_data) return res.status(400).json({ error: 'No proposal data found' });

  const { lineItems } = req.body;
  if (!Array.isArray(lineItems)) return res.status(400).json({ error: 'lineItems must be an array' });

  const proposalData = JSON.parse(job.proposal_data);
  const settings = (() => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const s = {};
    for (const r of rows) { try { s[r.key] = JSON.parse(r.value); } catch { s[r.key] = r.value; } }
    return s;
  })();
  const subOandP    = Number(settings['markup.subOandP'])    || 0.15;
  const gcOandP     = Number(settings['markup.gcOandP'])     || 0.25;
  const contingency = Number(settings['markup.contingency']) || 0.10;
  const deposit     = Number(settings['markup.deposit'])     || 0.33;
  const multiplier  = (1 + subOandP) * (1 + gcOandP) * (1 + contingency);

  const updatedItems = lineItems.map(li => ({
    ...li,
    baseCost: Number(li.baseCost) || 0,
    finalPrice: li.isStretchCode ? Number(li.baseCost) : Math.round((Number(li.baseCost) || 0) * multiplier),
  }));

  let total = updatedItems.reduce((s, i) => s + (i.finalPrice || 0), 0);
  const hasDumpster = updatedItems.some(i => /dumpster|waste\s*removal|debris\s*removal/i.test(i.trade || ''));
  if (!hasDumpster) {
    const totalBase = updatedItems.reduce((s, i) => s + (i.baseCost || 0), 0);
    let dumpsterCost = totalBase < 10000 ? 600 : totalBase <= 25000 ? 1200 : 1200 + Math.ceil((totalBase - 25000) / 15000) * 1200;
    total += Math.round(dumpsterCost * multiplier);
  }
  const depositAmount = Math.round(total * deposit);

  proposalData.lineItems = updatedItems;
  proposalData.pricing = { markupMultiplier: Math.round(multiplier * 10000) / 10000, totalContractPrice: total, depositPercent: Math.round(deposit * 100), depositAmount };
  proposalData.totalValue = total;
  proposalData.depositAmount = depositAmount;

  db.prepare('UPDATE jobs SET proposal_data = ?, total_value = ?, deposit_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(proposalData), total, depositAmount, job.id);

  res.json({ success: true, total, depositAmount, lineItems: updatedItems });
});

// POST /:id/generate-proposal — generate PDF from stored (possibly edited) proposal_data
router.post('/:id/generate-proposal', requireAuth, async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.proposal_data) return res.status(400).json({ error: 'No proposal data to generate from' });

  try {
    const proposalData = JSON.parse(job.proposal_data);
    const pdfPath = await generatePDF(proposalData, 'proposal', job.id);
    saveProposalReady(db, proposalData, pdfPath, job.id);
    logAudit(job.id, 'proposal_generated', 'Proposal PDF generated after line item review', req.session?.name || 'admin');
    notifyClients('job_updated', { jobId: job.id, status: 'proposal_ready' });
    res.json({ success: true, pdfPath: `/outputs/${require('path').basename(pdfPath)}` });
  } catch (err) {
    console.error('[generate-proposal] Error:', err.message);
    res.status(500).json({ error: 'Failed to generate proposal: ' + err.message });
  }
});

router.post('/:id/approve', requireAuth, async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.proposal_data) return res.status(400).json({ error: 'No proposal to approve' });

  try {
    db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('customer_approved', job.id);

    const { generateContract } = require('../services/claudeService');
    const proposalData = JSON.parse(job.proposal_data);
    const contractData = await generateContract(proposalData, job.id, 'en');

    const contractPDF = await generatePDF(contractData, 'contract', job.id);
    db.prepare('UPDATE jobs SET contract_data = ?, contract_pdf_path = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(contractData), contractPDF, 'contract_ready', job.id);

    logAudit(job.id, 'contract_generated', 'Contract approved via admin panel', 'admin');
    res.json({ success: true, message: 'Contract generated', contractPDF: `/outputs/${require('path').basename(contractPDF)}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send contract to customer
router.post('/:id/send-to-customer', requireAuth, async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.contract_pdf_path) return res.status(400).json({ error: 'No contract PDF ready' });

  try {
    await sendEmail({
      to: job.customer_email,
      subject: `Your Project Proposal — Preferred Builders General Services`,
      html: `
        <p>Dear ${job.customer_name},</p>
        <p>Thank you for choosing Preferred Builders General Services Inc. Please find your project contract attached for review.</p>
        <p>Please review the document carefully. If you have any questions, please contact us at 978-377-1784.</p>
        <p>Best regards,<br>Jackson Deaquino<br>Preferred Builders General Services Inc.<br>LIC# HIC-197400</p>
      `,
      attachmentPath: job.contract_pdf_path,
      attachmentName: `PB_Contract_${job.customer_name?.replace(/\s/g, '_')}.pdf`
    });

    db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('contract_sent', job.id);
    logAudit(job.id, 'contract_sent_to_customer', `Contract emailed to ${job.customer_email}`, 'admin');
    res.json({ success: true, message: `Contract sent to ${job.customer_email}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload PDF/image as a new job estimate
router.post('/upload-estimate', requireAuth, async (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const pdfParse = require('pdf-parse');
  const Anthropic = require('@anthropic-ai/sdk');
  const db = getDb();

  if (!req.files?.estimate) return res.status(400).json({ error: 'No file uploaded' });
  const file = req.files.estimate;
  const { customerName = '', customerEmail = '', customerPhone = '', projectAddress = '' } = req.body;

  let rawText = '';

  try {
    if (file.mimetype === 'application/pdf') {
      const fileBuffer = file.tempFilePath ? require('fs').readFileSync(file.tempFilePath) : file.data;
      const parsed = await pdfParse(fileBuffer);
      rawText = parsed.text.trim();
      if (rawText.length < 50) return res.status(400).json({ error: 'PDF appears empty or unreadable. Please use a text-based PDF.' });
    } else if (file.mimetype.startsWith('image/')) {
      // Use Claude vision to extract text from image
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const fileBuffer = file.tempFilePath ? require('fs').readFileSync(file.tempFilePath) : file.data;
      const base64 = fileBuffer.toString('base64');
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: [{
            type: 'image',
            source: { type: 'base64', media_type: file.mimetype, data: base64 }
          }, {
            type: 'text',
            text: 'This is a construction estimate or invoice image. Extract the TECHNICAL SCOPE ONLY: line items, quantities, dollar amounts, material specs, trade names, and project address (for jurisdiction). Do NOT include or repeat any customer personal information such as names, email addresses, or phone numbers — omit those entirely. Format as plain text.'
          }]
        }]
      });
      rawText = response.content[0].text.trim();
    } else if (file.mimetype.startsWith('text/')) {
      rawText = file.data.toString('utf8').trim();
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use PDF, image (JPG/PNG), or text file.' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read file: ' + err.message });
  }

  const jobId = uuidv4();

  // Create/find contact with CSN before Claude — PII stays on our server
  let contactRef = null;
  if (customerName || customerEmail) {
    try {
      contactRef = findOrCreateContact(db, {
        name: customerName, email: customerEmail, phone: customerPhone,
        address: projectAddress, city: '', state: 'MA'
      });
    } catch (e) { console.warn('[Upload] Contact upsert failed:', e.message); }
  }

  // Strip PII from estimate text; use CSN as the only customer identifier sent to Claude
  const sanitizedText = stripPII(rawText);
  const fullEstimate = contactRef
    ? `[Customer Ref: ${contactRef.csn} | Job ID: ${jobId}]\n\nESTIMATE DETAILS:\n${sanitizedText}`
    : `[Job ID: ${jobId}]\n\nESTIMATE DETAILS:\n${sanitizedText}`;

  db.prepare(`INSERT INTO jobs (id, customer_name, customer_email, customer_phone, project_address, raw_estimate_data, status, submitted_by, contact_id)
    VALUES (?, ?, ?, ?, ?, ?, 'received', 'manual', ?)`
  ).run(jobId, customerName, customerEmail, customerPhone, projectAddress, fullEstimate, contactRef?.id || null);

  res.json({ jobId, status: 'received', message: 'File uploaded. Processing estimate...' });

  const { processEstimate } = require('../services/claudeService');
  (async () => {
    try {
      db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('processing', jobId);
      const proposalData = await processEstimate(fullEstimate, jobId, 'en');
      if (proposalData.readyToGenerate === false && proposalData.clarificationsNeeded?.length > 0) {
        db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('clarification', jobId);
        const insertQ = db.prepare('INSERT INTO clarifications (job_id, question) VALUES (?, ?)');
        for (const q of proposalData.clarificationsNeeded) insertQ.run(jobId, q);
        logAudit(jobId, 'upload_estimate_clarification', `${proposalData.clarificationsNeeded.length} questions needed`, 'admin');
      } else {
        const pdfPath = await generatePDF(proposalData, 'proposal', jobId);
        saveProposalReady(db, proposalData, pdfPath, jobId);
        logAudit(jobId, 'upload_estimate_processed', `Proposal ready. Total: $${proposalData.totalValue}`, 'admin');
        tickQuoteCounter(db);
        notifyClients('job_updated', { jobId, status: 'proposal_ready' });
      }
    } catch (err) {
      console.error(`[Upload Job ${jobId}] ERROR:`, err.message);
      db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('error', jobId);
    }
  })();
});

// POST guided wizard — structured contact + address + scope
router.post('/wizard', requireAuth, async (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const db = getDb();
  const {
    contactName = '', contactPhone = '', contactEmail = '',
    street = '', city = '', state = '', zip = '',
    scopeText = ''
  } = req.body;

  // Basic server-side validation
  if (!contactName.trim()) return res.status(400).json({ error: 'Contact name is required' });
  if (!street.trim()) return res.status(400).json({ error: 'Street address is required' });
  if (!city.trim()) return res.status(400).json({ error: 'City is required' });
  if (!scopeText.trim()) return res.status(400).json({ error: 'Scope of work is required' });

  const projectAddress = [street, city, state, zip].filter(Boolean).join(', ');
  const jobId = uuidv4();

  let contactRef = null;
  if (contactName || contactEmail) {
    try {
      contactRef = findOrCreateContact(db, {
        name: contactName, email: contactEmail, phone: contactPhone,
        address: street, city, state: state || 'MA'
      });
    } catch (e) { console.warn('[Wizard Job] Contact upsert failed:', e.message); }
  }

  db.prepare(`
    INSERT INTO jobs (id, customer_name, customer_email, customer_phone, project_address, raw_estimate_data, status, submitted_by, contact_id)
    VALUES (?, ?, ?, ?, ?, ?, 'processing', 'wizard', ?)
  `).run(jobId, contactName, contactEmail, contactPhone, projectAddress, scopeText, contactRef?.id || null);

  notifyClients('job_updated', { jobId, status: 'processing' });
  res.json({ jobId, status: 'processing', message: 'Job created. Processing estimate...' });

  const { processEstimate } = require('../services/claudeService');
  (async () => {
    try {
      console.log(`[Wizard Job ${jobId}] Starting Claude processEstimate...`);

      const sanitizedScope = stripPII(scopeText);
      const fullEstimate = contactRef
        ? `[Customer Ref: ${contactRef.csn} | Job ID: ${jobId}]\nProject Address: ${projectAddress || 'see estimate'}\n\nSCOPE OF WORK:\n${sanitizedScope}`
        : `[Job ID: ${jobId}]\nProject Address: ${projectAddress || 'see estimate'}\n\nSCOPE OF WORK:\n${sanitizedScope}`;

      const proposalData = await processEstimate(fullEstimate, jobId, 'en');
      console.log(`[Wizard Job ${jobId}] Claude returned proposal. readyToGenerate=${proposalData.readyToGenerate}`);

      if (proposalData.readyToGenerate === false && proposalData.clarificationsNeeded?.length > 0) {
        db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('clarification', jobId);
        const insertQ = db.prepare('INSERT INTO clarifications (job_id, question) VALUES (?, ?)');
        for (const q of proposalData.clarificationsNeeded) insertQ.run(jobId, q);
        console.log(`[Wizard Job ${jobId}] Status: clarification (${proposalData.clarificationsNeeded.length} questions)`);
      } else {
        if (!proposalData.customer) proposalData.customer = {};
        proposalData.customer.name  = contactName  || proposalData.customer.name  || '';
        proposalData.customer.email = contactEmail || proposalData.customer.email || '';
        proposalData.customer.phone = contactPhone || proposalData.customer.phone || '';
        if (!proposalData.project) proposalData.project = {};
        proposalData.project.address = proposalData.project.address || street || '';
        proposalData.project.city    = proposalData.project.city    || city   || '';
        proposalData.project.state   = proposalData.project.state   || state  || 'MA';

        saveReviewPending(db, proposalData, jobId);
        logAudit(jobId, 'wizard_estimate_processed', `Wizard entry — pending review`, 'admin');
        console.log(`[Wizard Job ${jobId}] Status: review_pending. Total: $${proposalData.totalValue}`);
        tickQuoteCounter(db);
        notifyClients('job_updated', { jobId, status: 'review_pending' });
      }
    } catch (err) {
      console.error(`[Wizard Job ${jobId}] ERROR:`, err.message, err.stack);
      db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('error', jobId);
    }
  })();
});

// POST manual estimate input (fallback if no Hearth/Wave)
router.post('/manual', requireAuth, async (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const db = getDb();
  const { customerName, customerEmail, customerPhone, projectAddress, estimateText } = req.body;

  const jobId = uuidv4();

  // Create/find contact with CSN before Claude — PII stays on our server
  let contactRef = null;
  if (customerName || customerEmail) {
    try {
      contactRef = findOrCreateContact(db, {
        name: customerName, email: customerEmail, phone: customerPhone,
        address: projectAddress, city: '', state: 'MA'
      });
    } catch (e) { console.warn('[Manual Job] Contact upsert failed:', e.message); }
  }

  db.prepare(`
    INSERT INTO jobs (id, customer_name, customer_email, customer_phone, project_address, raw_estimate_data, status, submitted_by, contact_id)
    VALUES (?, ?, ?, ?, ?, ?, 'received', 'manual', ?)
  `).run(jobId, customerName, customerEmail, customerPhone, projectAddress, estimateText, contactRef?.id || null);

  res.json({ jobId, status: 'received', message: 'Job created. Processing estimate...' });

  const { processEstimate } = require('../services/claudeService');
  (async () => {
    try {
      console.log(`[Manual Job ${jobId}] Starting Claude processEstimate...`);
      db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('processing', jobId);

      // Build estimate with CSN instead of real PII — Claude only sees the reference code
      const sanitizedScope = stripPII(estimateText);
      const fullEstimate = contactRef
        ? `[Customer Ref: ${contactRef.csn} | Job ID: ${jobId}]\nProject Address: ${projectAddress || 'see estimate'}\n\nESTIMATE DETAILS:\n${sanitizedScope}`
        : `[Job ID: ${jobId}]\nProject Address: ${projectAddress || 'see estimate'}\n\nESTIMATE DETAILS:\n${sanitizedScope}`;
      const proposalData = await processEstimate(fullEstimate, jobId, 'en');
      console.log(`[Manual Job ${jobId}] Claude returned proposal. readyToGenerate=${proposalData.readyToGenerate}`);

      if (proposalData.readyToGenerate === false && proposalData.clarificationsNeeded?.length > 0) {
        db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('clarification', jobId);
        const insertQ = db.prepare('INSERT INTO clarifications (job_id, question) VALUES (?, ?)');
        for (const q of proposalData.clarificationsNeeded) {
          insertQ.run(jobId, q);
        }
        console.log(`[Manual Job ${jobId}] Status: clarification (${proposalData.clarificationsNeeded.length} questions)`);

        const ownerWhatsApp = process.env.COOPER_WHATSAPP_NUMBER;
        if (ownerWhatsApp) {
          const to = ownerWhatsApp.startsWith('whatsapp:') ? ownerWhatsApp : `whatsapp:${ownerWhatsApp}`;
          const firstQ = proposalData.clarificationsNeeded[0];
          const total = proposalData.clarificationsNeeded.length;
          await sendWhatsApp(to, `Hey! 👋 I'm working on the estimate for *${customerName}* at ${projectAddress} but I'm missing a few details.\n\nI'll ask you one question at a time — just reply and I'll move to the next one.\n\n❓ Question 1 of ${total}:\n${firstQ}`);
        }
      } else {
        saveReviewPending(db, proposalData, jobId);
        logAudit(jobId, 'manual_estimate_processed', `Manual entry — pending review`, 'admin');
        console.log(`[Manual Job ${jobId}] Status: review_pending. Total: $${proposalData.totalValue}`);
        tickQuoteCounter(db);
        notifyClients('job_updated', { jobId, status: 'review_pending' });
      }
    } catch (err) {
      console.error(`[Manual Job ${jobId}] ERROR:`, err.message, err.stack);
      db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('error', jobId);
    }
  })();
});

// POST answer a clarification question
router.post('/:id/clarify/:clarId', requireAuth, async (req, res) => {
  const db = getDb();
  const { answer } = req.body;
  if (!answer) return res.status(400).json({ error: 'Answer is required' });

  db.prepare('UPDATE clarifications SET answer = ?, answered_at = CURRENT_TIMESTAMP WHERE id = ? AND job_id = ?')
    .run(answer, req.params.clarId, req.params.id);

  const remaining = db.prepare(
    'SELECT COUNT(*) as count FROM clarifications WHERE job_id = ? AND answer IS NULL'
  ).get(req.params.id);

  if (remaining.count === 0) {
    res.json({ success: true, allAnswered: true, message: 'All questions answered. Generating proposal...' });

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (job) {
      (async () => {
        try {
          console.log(`[Job ${job.id}] All clarifications answered. Generating proposal...`);
          db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('processing', job.id);

          const allAnswers = db.prepare('SELECT question, answer FROM clarifications WHERE job_id = ?').all(job.id);
          const answersText = allAnswers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');
          const rawEstimate = job.raw_estimate_data || '';

          const { processEstimate } = require('../services/claudeService');
          const proposalData = await processEstimate(
            `${rawEstimate}\n\nCLARIFICATION ANSWERS:\n${answersText}`,
            job.id, 'en'
          );

          const pdfPath = await generatePDF(proposalData, 'proposal', job.id);
          saveProposalReady(db, proposalData, pdfPath, job.id);
          logAudit(job.id, 'proposal_generated', `Proposal generated after clarification`, 'admin');
          console.log(`[Job ${job.id}] Proposal ready. Total: $${proposalData.totalValue}`);
          tickQuoteCounter(db);
          notifyClients('job_updated', { jobId: job.id, status: 'proposal_ready' });
        } catch (err) {
          console.error(`[Job ${job.id}] Proposal generation error:`, err.message);
          db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('error', job.id);
        }
      })();
    }
  } else {
    res.json({ success: true, allAnswered: false, remaining: remaining.count });
  }
});

// POST reprocess a job (re-run Claude + regenerate PDF)
router.post('/:id/reprocess', requireAuth, async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.json({ success: true, message: 'Reprocessing started' });

  try {
    db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('processing', job.id);

    // Get or create a CSN for the job's contact before reprocessing
    let reprocessRef = null;
    if (job.contact_id) {
      const existingContact = db.prepare('SELECT id, customer_number FROM contacts WHERE id = ?').get(job.contact_id);
      if (existingContact) reprocessRef = { id: existingContact.id, csn: existingContact.customer_number };
    }
    if (!reprocessRef && (job.customer_name || job.customer_email)) {
      reprocessRef = findOrCreateContact(db, {
        name: job.customer_name, email: job.customer_email, phone: job.customer_phone,
        address: job.project_address, city: job.project_city || '', state: 'MA'
      });
      db.prepare('UPDATE jobs SET contact_id = ? WHERE id = ?').run(reprocessRef.id, job.id);
    }

    const sanitizedEstimate = stripPII(job.raw_estimate_data);
    const fullEstimate = reprocessRef
      ? `[Customer Ref: ${reprocessRef.csn} | Job ID: ${job.id}]\nProject Address: ${job.project_address || 'see estimate'}\n\nESTIMATE DETAILS:\n${sanitizedEstimate}`
      : `[Job ID: ${job.id}]\nProject Address: ${job.project_address || 'see estimate'}\n\nESTIMATE DETAILS:\n${sanitizedEstimate}`;

    const { processEstimate } = require('../services/claudeService');
    const proposalData = await processEstimate(fullEstimate, job.id, 'en');
    if (proposalData.readyToGenerate) {
      const pdfPath = await generatePDF(proposalData, 'proposal', job.id);
      saveProposalReady(db, proposalData, pdfPath, job.id);
      console.log(`[Reprocess ${job.id}] Done. Total: $${proposalData.totalValue}`);
      tickQuoteCounter(db);
      notifyClients('job_updated', { jobId: job.id, status: 'proposal_ready' });
    }
  } catch (err) {
    console.error(`[Reprocess ${job.id}] Error:`, err.message);
    db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('error', job.id);
  }
});

// PATCH update job notes (and optionally status)
router.patch('/:id/notes', requireAuth, (req, res) => {
  const db = getDb();
  const { notes, status } = req.body;
  if (status) {
    db.prepare('UPDATE jobs SET notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(notes, status, req.params.id);
    logAudit(req.params.id, `status_changed_to_${status}`, `Status set to ${status} by admin`, 'admin');
  } else {
    db.prepare('UPDATE jobs SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(notes, req.params.id);
  }
  res.json({ success: true });
});

// SSE endpoint — dashboard subscribes here to receive instant push notifications when a job status changes
router.get('/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send a heartbeat every 30s to keep the connection alive
  const heartbeat = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch {} }, 30000);

  addClient(res);
  req.on('close', () => { clearInterval(heartbeat); removeClient(res); });
});

// GET job stats for dashboard
router.get('/stats/summary', requireAuth, (req, res) => {
  const db = getDb();

  // Status breakdown (non-archived only)
  const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM jobs WHERE archived = 0 GROUP BY status').all();

  // Total Jobs (YTD) — all quotes submitted this calendar year
  const total = db.prepare(
    "SELECT COUNT(*) as count FROM jobs WHERE archived = 0 AND created_at >= date('now','start of year')"
  ).get();

  // Quotes Done (YTD) — proposals completed this year (reached proposal_ready or beyond)
  const quotesCompleted = db.prepare(
    `SELECT COUNT(*) as count FROM jobs WHERE archived = 0
     AND status IN ('proposal_ready','proposal_sent','proposal_approved','customer_approved','contract_ready','contract_sent','contract_signed','complete')
     AND created_at >= date('now','start of year')`
  ).get();

  // Pipeline Value — estimates done and actively sent to customer (not yet won)
  const pipelineValue = db.prepare(
    `SELECT SUM(total_value) as total FROM jobs WHERE archived = 0
     AND status IN ('proposal_sent','proposal_approved','customer_approved','contract_ready','contract_sent','contract_signed')`
  ).get();

  // Won Revenue (YTD) — contracts signed and won this calendar year
  // Uses updated_at so a job submitted last year but won this year counts correctly
  const revenueWon = db.prepare(
    "SELECT SUM(total_value) as value FROM jobs WHERE archived = 0 AND status = 'complete' AND updated_at >= date('now','start of year')"
  ).get();

  res.json({
    total: total.count,
    byStatus,
    totalValue: pipelineValue.total || 0,
    thisMonth: {
      count: quotesCompleted.count,
      value: revenueWon.value || 0
    }
  });
});

// ARCHIVE a job (soft delete)
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  db.prepare('UPDATE jobs SET archived = 1, archived_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  logAudit(req.params.id, 'archived', 'Job archived', 'admin');
  res.json({ success: true, message: 'Job archived' });
});

// RESTORE an archived job
router.post('/:id/restore', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE jobs SET archived = 0, archived_at = NULL WHERE id = ?').run(req.params.id);
  logAudit(req.params.id, 'restored', 'Job restored from archive', 'admin');
  res.json({ success: true });
});

// POST wizard/extract-text — extract text from uploaded file for wizard preview
router.post('/wizard/extract-text', requireAuth, async (req, res) => {
  const pdfParse = require('pdf-parse');
  const Anthropic = require('@anthropic-ai/sdk');

  if (!req.files?.estimate) return res.status(400).json({ error: 'No file uploaded' });
  const file = req.files.estimate;

  let rawText = '';
  try {
    if (file.mimetype === 'application/pdf') {
      const fileBuffer = file.tempFilePath ? require('fs').readFileSync(file.tempFilePath) : file.data;
      const parsed = await pdfParse(fileBuffer);
      rawText = parsed.text.trim();
    } else if (file.mimetype.startsWith('image/')) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const fileBuffer = file.tempFilePath ? require('fs').readFileSync(file.tempFilePath) : file.data;
      const base64 = fileBuffer.toString('base64');
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: [{
            type: 'image',
            source: { type: 'base64', media_type: file.mimetype, data: base64 }
          }, {
            type: 'text',
            text: 'This is a construction estimate. Extract the TECHNICAL SCOPE ONLY: line items, quantities, dollar amounts, material specs, trade names. Do NOT include customer names, emails, or phone numbers. Format as plain text.'
          }]
        }]
      });
      rawText = response.content[0].text.trim();
    } else if (file.mimetype.startsWith('text/')) {
      rawText = file.data.toString('utf8').trim();
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read file: ' + err.message });
  }

  res.json({ text: rawText });
});

// POST wizard/questions — AI generates clarifying questions from scope text
router.post('/wizard/questions', requireAuth, async (req, res) => {
  const { scopeText, customerName, projectAddress, budgetTarget } = req.body;
  if (!scopeText || scopeText.trim().length < 20) {
    return res.status(400).json({ error: 'Scope text is required (at least 20 characters).' });
  }

  const { generateWizardQuestions } = require('../services/claudeService');
  try {
    const questions = await generateWizardQuestions(scopeText, projectAddress || '', budgetTarget || null);
    res.json({ questions });
  } catch (err) {
    console.error('[Wizard/Questions] Error:', err.message);
    res.status(500).json({ error: 'Failed to generate questions: ' + err.message });
  }
});

// POST wizard/submit — resolve line items from Q&A, create job, kick off processing
router.post('/wizard/submit', requireAuth, async (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const db = getDb();
  const { customerName, customerEmail, customerPhone, projectAddress, scopeText, qaAnswers, budgetTarget } = req.body;

  if (!scopeText || scopeText.trim().length < 10) {
    return res.status(400).json({ error: 'Scope text is required.' });
  }

  const jobId = uuidv4();

  let contactRef = null;
  if (customerName || customerEmail) {
    try {
      contactRef = findOrCreateContact(db, {
        name: customerName, email: customerEmail, phone: customerPhone,
        address: projectAddress, city: '', state: 'MA'
      });
    } catch (e) { console.warn('[Wizard] Contact upsert failed:', e.message); }
  }

  // Build a resolved scope that injects any demo line items the user said were NOT already included
  const demoAdditions = (qaAnswers || [])
    .filter(qa => qa.questionType === 'demo_check' && qa.answer === 'no' && qa.demoCost)
    .map(qa => `ADDITIONAL DEMO WORK (not in original scope): Remove/demo ${qa.trade} — cost $${qa.demoCost}`)
    .join('\n');

  const answersNarrative = (qaAnswers || []).length > 0
    ? '\n\nCLARIFICATION Q&A:\n' + (qaAnswers || []).map(qa =>
        `Q: ${qa.question}\nA: ${qa.answer}${qa.demoCost ? ` ($${qa.demoCost} for demo)` : ''}`
      ).join('\n\n')
    : '';

  const sanitizedScope = stripPII(scopeText);
  const budgetLine = budgetTarget ? `\nBUDGET TARGET: $${Number(budgetTarget).toLocaleString()} (soft client-facing total — calibrate line item baseCosts so that after standard markup the total lands within ±8% of this figure)` : '';
  const fullEstimate = contactRef
    ? `[Customer Ref: ${contactRef.csn} | Job ID: ${jobId}]\nProject Address: ${projectAddress || 'see estimate'}${budgetLine}\n\nESTIMATE DETAILS:\n${sanitizedScope}${demoAdditions ? '\n\n' + demoAdditions : ''}${answersNarrative}`
    : `[Job ID: ${jobId}]\nProject Address: ${projectAddress || 'see estimate'}${budgetLine}\n\nESTIMATE DETAILS:\n${sanitizedScope}${demoAdditions ? '\n\n' + demoAdditions : ''}${answersNarrative}`;

  // Store Q&A in raw estimate data alongside the scope
  const rawEstimateData = scopeText + answersNarrative;

  db.prepare(`
    INSERT INTO jobs (id, customer_name, customer_email, customer_phone, project_address, raw_estimate_data, status, submitted_by, contact_id)
    VALUES (?, ?, ?, ?, ?, ?, 'received', 'wizard', ?)
  `).run(jobId, customerName || '', customerEmail || '', customerPhone || '', projectAddress || '', rawEstimateData, contactRef?.id || null);

  res.json({ jobId, status: 'received', message: 'Wizard submission received. Processing estimate...' });

  const { processEstimate } = require('../services/claudeService');
  (async () => {
    try {
      console.log(`[Wizard Job ${jobId}] Starting Claude processEstimate...`);
      db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('processing', jobId);
      const proposalData = await processEstimate(fullEstimate, jobId, 'en');
      console.log(`[Wizard Job ${jobId}] Claude returned proposal. readyToGenerate=${proposalData.readyToGenerate}`);

      if (proposalData.readyToGenerate === false && proposalData.clarificationsNeeded?.length > 0) {
        db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('clarification', jobId);
        const insertQ = db.prepare('INSERT INTO clarifications (job_id, question) VALUES (?, ?)');
        for (const q of proposalData.clarificationsNeeded) insertQ.run(jobId, q);
      } else {
        saveReviewPending(db, proposalData, jobId);
        logAudit(jobId, 'wizard_estimate_processed', `Wizard submission — pending review`, 'admin');
        console.log(`[Wizard Job ${jobId}] Status: review_pending. Total: $${proposalData.totalValue}`);
        notifyClients('job_updated', { jobId, status: 'review_pending' });
      }
    } catch (err) {
      console.error(`[Wizard Job ${jobId}] ERROR:`, err.message, err.stack);
      db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('error', jobId);
    }
  })();
});

// Auto-purge: permanently delete jobs archived more than 90 days ago
function purgeOldArchived() {
  try {
    const db = getDb();
    const old = db.prepare("SELECT id FROM jobs WHERE archived = 1 AND archived_at < datetime('now', '-90 days')").all();
    for (const job of old) {
      db.prepare('DELETE FROM clarifications WHERE job_id = ?').run(job.id);
      db.prepare('DELETE FROM conversations WHERE job_id = ?').run(job.id);
      db.prepare('DELETE FROM audit_log WHERE job_id = ?').run(job.id);
      db.prepare('DELETE FROM jobs WHERE id = ?').run(job.id);
    }
    if (old.length > 0) console.log(`[Auto-purge] Permanently deleted ${old.length} archived job(s) older than 90 days`);
  } catch (e) {}
}
setInterval(purgeOldArchived, 24 * 60 * 60 * 1000);
setTimeout(purgeOldArchived, 5000);

module.exports = router;
