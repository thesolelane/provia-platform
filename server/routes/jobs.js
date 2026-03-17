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
        const pdfPath = await generatePDF(proposalData, 'proposal', jobId);
        saveProposalReady(db, proposalData, pdfPath, jobId);
        logAudit(jobId, 'manual_estimate_processed', `Manual entry by admin`, 'admin');
        console.log(`[Manual Job ${jobId}] Status: proposal_ready. Total: $${proposalData.totalValue}`);
        tickQuoteCounter(db);
        notifyClients('job_updated', { jobId, status: 'proposal_ready' });
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
