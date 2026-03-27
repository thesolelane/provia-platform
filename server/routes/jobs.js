// server/routes/jobs.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getDb } = require('../db/database');
const { generatePDF } = require('../services/pdfService');
const { sendWhatsApp } = require('../services/whatsappService');
const { sendEmail } = require('../services/emailService');
const { logAudit } = require('../services/auditService');
const { tickQuoteCounter } = require('../services/assessmentService');
const { addClient, removeClient, notifyClients } = require('../services/sseManager');

// ── Quote versioning ────────────────────────────────────────────────────────
// Given a raw quote number (e.g. "303"), determine the next version and parent
// job ID for this quote. Returns { version, parentJobId }.
function resolveQuoteVersion(db, quoteNumber, excludeJobId = null) {
  if (!quoteNumber) return { version: 1, parentJobId: null };
  const query = excludeJobId
    ? `SELECT id, version FROM jobs WHERE quote_number = ? AND id != ? ORDER BY version DESC LIMIT 1`
    : `SELECT id, version FROM jobs WHERE quote_number = ? ORDER BY version DESC LIMIT 1`;
  const prior = excludeJobId
    ? db.prepare(query).get(String(quoteNumber), excludeJobId)
    : db.prepare(query).get(String(quoteNumber));
  if (!prior) return { version: 1, parentJobId: null };
  return { version: prior.version + 1, parentJobId: prior.id };
}

// Format a versioned quote display string, e.g. "303/2"
function formatVersionedQuote(quoteNumber, version) {
  if (!quoteNumber) return '';
  return `${quoteNumber}/${version || 1}`;
}

// Try to pre-extract a quote number from raw estimate text using common patterns
function preExtractQuoteNumber(text) {
  if (!text) return null;
  const patterns = [
    /(?:quote|estimate|proposal|job|ref|#|no\.?)\s*[:\-#]?\s*(\d{2,6})\b/i,
    /\b(\d{3,6})\s*(?:rev|revision|version|v)\s*\d/i,
    /^[\s\S]{0,500}?#\s*(\d{3,6})\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}

// Find prior quote context using all available info: contact, address, and text regex
// Priority: contact+address together > contact alone > address alone > regex fallback
function findPriorQuoteContext(db, { rawText, contactId, projectAddress }) {
  const { getPriorVersionContext } = require('../services/claudeService');

  // 1. Best match: same contact AND same address
  if (contactId && projectAddress && projectAddress.length > 5) {
    const prior = db.prepare(`
      SELECT quote_number FROM jobs
      WHERE contact_id = ? AND project_address = ? AND quote_number IS NOT NULL AND proposal_data IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(contactId, projectAddress);
    if (prior?.quote_number) {
      const ctx = getPriorVersionContext(db, prior.quote_number);
      if (ctx) return { quoteNumber: prior.quote_number, context: ctx };
    }
  }

  // 2. Same contact (any address) — only if single-property customer
  if (contactId) {
    const prior = db.prepare(`
      SELECT quote_number FROM jobs
      WHERE contact_id = ? AND quote_number IS NOT NULL AND proposal_data IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(contactId);
    if (prior?.quote_number) {
      const ctx = getPriorVersionContext(db, prior.quote_number);
      if (ctx) return { quoteNumber: prior.quote_number, context: ctx };
    }
  }

  // 3. Same address (different contact or no contact)
  if (projectAddress && projectAddress.length > 5) {
    const prior = db.prepare(`
      SELECT quote_number FROM jobs
      WHERE project_address = ? AND quote_number IS NOT NULL AND proposal_data IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(projectAddress);
    if (prior?.quote_number) {
      const ctx = getPriorVersionContext(db, prior.quote_number);
      if (ctx) return { quoteNumber: prior.quote_number, context: ctx };
    }
  }

  // 4. Last resort: try regex extraction from raw estimate text
  const preQuoteNum = preExtractQuoteNumber(rawText);
  if (preQuoteNum) {
    const ctx = getPriorVersionContext(db, preQuoteNum);
    if (ctx) return { quoteNumber: preQuoteNum, context: ctx };
  }

  return { quoteNumber: null, context: null };
}

// After Claude returns, store quote_number + version + parent_job_id on the job and in proposalData
// Idempotent: if the job already has a version assigned, re-use it instead of incrementing
function finalizeJobVersioning(db, jobId, proposalData) {
  let rawQuoteNum = proposalData.quoteNumber
    ? String(proposalData.quoteNumber).trim()
    : null;
  if (!rawQuoteNum) return;

  rawQuoteNum = rawQuoteNum.split('/')[0].replace(/[^\w\-]/g, '');
  if (!rawQuoteNum) return;

  const existing = db.prepare(`SELECT quote_number, version FROM jobs WHERE id = ?`).get(jobId);
  if (existing?.quote_number && existing?.version) {
    const versionedDisplay = formatVersionedQuote(existing.quote_number, existing.version);
    proposalData.quoteNumberRaw = existing.quote_number;
    proposalData.quoteVersion = existing.version;
    proposalData.quoteNumber = versionedDisplay;
    console.log(`[Versioning] Job ${jobId}: already versioned as ${versionedDisplay}, skipping`);
    return;
  }

  const { version, parentJobId } = resolveQuoteVersion(db, rawQuoteNum, jobId);
  const versionedDisplay = formatVersionedQuote(rawQuoteNum, version);

  db.prepare(
    `UPDATE jobs SET quote_number = ?, version = ?, parent_job_id = ?, estimate_source = 'ai' WHERE id = ?`
  ).run(rawQuoteNum, version, parentJobId, jobId);

  proposalData.quoteNumberRaw = rawQuoteNum;
  proposalData.quoteVersion = version;
  proposalData.quoteNumber = versionedDisplay;

  console.log(`[Versioning] Job ${jobId}: quote ${rawQuoteNum} → version ${version} (${versionedDisplay})`);
}

// Helper: merge the job's stored PII (name/email/phone) back into proposalData.customer
// Must be called after processEstimate and BEFORE generatePDF — Claude never sees PII.
function mergeContactIntoProposal(db, jobId, proposalData) {
  try {
    const job = db.prepare(
      `SELECT customer_name, customer_email, customer_phone, project_address, project_city,
              contact_id, pb_number, external_ref, quote_number FROM jobs WHERE id = ?`
    ).get(jobId);
    if (!job) return;

    let contact = null;
    if (job.contact_id) {
      contact = db.prepare(
        'SELECT name, email, phone, address, city, state FROM contacts WHERE id = ?'
      ).get(job.contact_id);
    }

    if (!proposalData.customer) proposalData.customer = {};
    const c = proposalData.customer;

    // Fill any blank field from contact record first, then fall back to job columns
    c.name  = c.name  || contact?.name  || job.customer_name  || '';
    c.email = c.email || contact?.email || job.customer_email || '';
    c.phone = c.phone || contact?.phone || job.customer_phone || '';

    if (!proposalData.project) proposalData.project = {};
    proposalData.project.address = proposalData.project.address || contact?.address || job.project_address || '';
    proposalData.project.city    = proposalData.project.city    || contact?.city    || job.project_city    || '';

    // Fill missing quote number: Claude's extraction → job.quote_number → external_ref → pb_number
    if (!proposalData.quoteNumber) {
      proposalData.quoteNumber = job.quote_number || job.external_ref || job.pb_number || '';
    }

    if (c.name) console.log(`[mergeContact] Job ${jobId}: customer="${c.name}", quoteNumber="${proposalData.quoteNumber}"`);
  } catch (e) {
    console.warn('[mergeContactIntoProposal] Error:', e.message);
  }
}

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

// Generates next PB-YYYY-NNNN quote number (race-safe atomic counter)
function generatePBNumber(db) {
  const year = new Date().getFullYear();
  const assign = db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO pb_quote_counter (year, next_seq) VALUES (?, 1)').run(year);
    const row = db.prepare('SELECT next_seq FROM pb_quote_counter WHERE year = ?').get(year);
    const seq = row.next_seq;
    db.prepare('UPDATE pb_quote_counter SET next_seq = next_seq + 1 WHERE year = ?').run(year);
    return `PB-${year}-${String(seq).padStart(4, '0')}`;
  });
  return assign();
}

// Generates next sequential customer-facing quote number (1001, 1002, …) — race-safe
function generateQuoteNumber(db) {
  const assign = db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO quote_auto_counter (id, next_seq) VALUES (1, 1001)').run();
    const row = db.prepare('SELECT next_seq FROM quote_auto_counter WHERE id = 1').get();
    const seq = row.next_seq;
    db.prepare('UPDATE quote_auto_counter SET next_seq = next_seq + 1 WHERE id = 1').run();
    return String(seq);
  });
  return assign();
}

// Extract external estimate/quote number from raw estimate text (e.g. Hearth/Wave ref)
function extractExternalRef(text) {
  if (!text) return null;
  const match = text.match(/(?:estimate|quote|proposal|ref|#|no\.?)\s*[:#]?\s*(\d{3,8})/i);
  return match ? match[1] : null;
}


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

// PATCH /:id/takeoff — save material take-off data to a job
router.patch('/:id/takeoff', requireAuth, (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND archived = 0').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const { takeoffData } = req.body;
  if (!takeoffData) return res.status(400).json({ error: 'takeoffData is required' });
  db.prepare('UPDATE jobs SET takeoff_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(takeoffData), req.params.id);
  logAudit(req.params.id, 'takeoff_saved', 'Material take-off saved', req.session?.name || 'user');
  res.json({ success: true });
});

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
  let query = 'SELECT id, customer_name, customer_email, customer_phone, project_address, project_city, status, total_value, deposit_amount, created_at, updated_at, submitted_by, contact_id, pb_number, external_ref FROM jobs WHERE archived = 0';
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

  // Include version history for the same quote number
  let versionHistory = [];
  if (job.quote_number) {
    versionHistory = db.prepare(
      `SELECT id, version, status, total_value, created_at, estimate_source, proposal_pdf_path
       FROM jobs WHERE quote_number = ? ORDER BY version ASC`
    ).all(job.quote_number);
  }

  res.json({ job, conversations, clarifications, auditLog, versionHistory });
});

// POST approve proposal → generate contract
// POST manually mark proposal as approved (in-person/verbal approval)
router.post('/:id/mark-approved', requireAuth, requireRole('admin', 'pm', 'system_admin'), async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.proposal_data) return res.status(400).json({ error: 'No proposal to approve' });
  db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('proposal_approved', job.id);
  logAudit(job.id, 'proposal_approved', 'Proposal manually approved via admin panel', req.session?.name || 'admin');
  res.json({ success: true, message: 'Proposal marked as approved' });
});

// PATCH /:id/line-items — save edited line items back to proposal_data (stays review_pending)
router.patch('/:id/line-items', requireAuth, requireRole('admin', 'pm', 'system_admin'), async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.proposal_data) return res.status(400).json({ error: 'No editable estimate data found. This estimate was revised but has no stored line items — use the AI to regenerate the estimate from the original scope.' });

  const { lineItems } = req.body;
  if (!Array.isArray(lineItems)) return res.status(400).json({ error: 'lineItems must be an array' });
  if (lineItems.length === 0) return res.status(400).json({ error: 'lineItems cannot be empty' });

  // Validate each line item
  for (const [i, li] of lineItems.entries()) {
    if (!li.trade || typeof li.trade !== 'string' || !li.trade.trim()) {
      return res.status(400).json({ error: `Line item ${i + 1} is missing a trade name` });
    }
    const cost = Number(li.baseCost);
    if (isNaN(cost) || cost < 0) {
      return res.status(400).json({ error: `Line item "${li.trade}" has an invalid cost (must be 0 or greater)` });
    }
  }

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
    trade: li.trade.trim(),
    baseCost: Math.max(0, Number(li.baseCost) || 0),
    finalPrice: li.isStretchCode ? Math.max(0, Number(li.baseCost)) : Math.round(Math.max(0, Number(li.baseCost) || 0) * multiplier),
  }));

  // Auto-add dumpster as a visible line item if none exists
  const hasDumpster = updatedItems.some(i => /dumpster|waste\s*removal|debris\s*removal/i.test(i.trade || ''));
  if (!hasDumpster) {
    const totalBase = updatedItems.reduce((s, i) => s + (i.baseCost || 0), 0);
    const dumpsterBase = totalBase < 10000 ? 600 : totalBase <= 25000 ? 1200 : 1200 + Math.ceil((totalBase - 25000) / 15000) * 1200;
    updatedItems.push({
      trade: 'Waste Removal',
      baseCost: dumpsterBase,
      finalPrice: Math.round(dumpsterBase * multiplier),
      description: 'Dumpster rental and debris disposal for project duration.',
      scopeIncluded: ['Dumpster rental', 'Debris hauling and disposal'],
      scopeExcluded: ['Hazardous material disposal'],
      autoAdded: true,
    });
  }

  const total = updatedItems.reduce((s, i) => s + (i.finalPrice || 0), 0);
  const depositAmount = Math.round(total * deposit);

  // Audit the change
  const editor = req.session?.name || req.session?.email || 'admin';
  const prevTotal = proposalData.totalValue || 0;

  proposalData.lineItems = updatedItems;
  proposalData.pricing = {
    markupMultiplier: Math.round(multiplier * 10000) / 10000,
    totalContractPrice: total,
    depositPercent: Math.round(deposit * 100),
    depositAmount,
    appliedRates: { subOandP, gcOandP, contingency },
  };
  proposalData.totalValue = total;
  proposalData.depositAmount = depositAmount;

  db.prepare('UPDATE jobs SET proposal_data = ?, total_value = ?, deposit_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(proposalData), total, depositAmount, job.id);

  logAudit(job.id, 'line_items_edited', `Line items edited by ${editor}. Total changed from $${prevTotal.toLocaleString()} → $${total.toLocaleString()}`, editor);

  res.json({ success: true, total, depositAmount, lineItems: updatedItems });
});

// POST /:id/generate-proposal — generate PDF from stored (possibly edited) proposal_data
router.post('/:id/generate-proposal', requireAuth, requireRole('admin', 'pm', 'system_admin'), async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.proposal_data) return res.status(400).json({ error: 'No estimate data to generate from. Edit and save line items first, or reprocess the job to regenerate from the original scope.' });

  try {
    const proposalData = JSON.parse(job.proposal_data);
    mergeContactIntoProposal(db, job.id, proposalData);
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

router.post('/:id/approve', requireAuth, requireRole('admin', 'pm', 'system_admin'), async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.proposal_data) return res.status(400).json({ error: 'No proposal to approve' });

  try {
    db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('customer_approved', job.id);

    const { generateContract } = require('../services/claudeService');
    const proposalData = JSON.parse(job.proposal_data);
    mergeContactIntoProposal(db, job.id, proposalData);

    // Inject owner address from contact record if not already in proposal data
    if (!proposalData.customer) proposalData.customer = {};
    if (!proposalData.customer.address_line1 && job.contact_id) {
      const contact = db.prepare('SELECT address, city, state, zip FROM contacts WHERE id = ?').get(job.contact_id);
      if (contact?.address) {
        proposalData.customer.address_line1  = contact.address;
        proposalData.customer.city_state_zip = [contact.city, contact.state, contact.zip].filter(Boolean).join(', ');
      }
    }
    // If still no owner address, fall back to project address (owner lives at job site)
    if (!proposalData.customer.address_line1 && job.project_address) {
      proposalData.customer.address_line1  = job.project_address;
      proposalData.customer.city_state_zip = [job.project_city, 'MA'].filter(Boolean).join(', ');
    }

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
router.post('/:id/send-to-customer', requireAuth, requireRole('admin', 'pm', 'system_admin'), async (req, res) => {
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
      attachmentName: `PB_Contract_${job.customer_name?.replace(/\s/g, '_')}.pdf`,
      emailType: 'contract',
      jobId: job.id
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
        temperature: 0,
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

  const uploadedBy = req.session?.name ? `web:${req.session.name}` : 'web:upload';
  db.prepare(`INSERT INTO jobs (id, customer_name, customer_email, customer_phone, project_address, raw_estimate_data, status, submitted_by, contact_id)
    VALUES (?, ?, ?, ?, ?, ?, 'received', ?, ?)`
  ).run(jobId, customerName, customerEmail, customerPhone, projectAddress, fullEstimate, uploadedBy, contactRef?.id || null);

  // Assign PB number + auto quote number immediately on job creation
  try {
    const pbNum = generatePBNumber(db);
    const extRef = extractExternalRef(rawText);
    const qNum  = generateQuoteNumber(db);
    db.prepare('UPDATE jobs SET pb_number = ?, external_ref = ?, quote_number = ? WHERE id = ?').run(pbNum, extRef, qNum, jobId);
  } catch (e) { console.warn('[Upload] PB/Quote number generation failed:', e.message); }

  res.json({ jobId, status: 'received', message: 'File uploaded. Processing estimate...' });

  const { processEstimate } = require('../services/claudeService');
  (async () => {
    try {
      db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('processing', jobId);
      const { context: priorCtx } = findPriorQuoteContext(db, { rawText: sanitizedText, contactId: contactRef?.id, projectAddress });
      const proposalData = await processEstimate(fullEstimate, jobId, 'en', db, projectAddress, priorCtx);
      mergeContactIntoProposal(db, jobId, proposalData);
      if (proposalData.readyToGenerate === false && proposalData.clarificationsNeeded?.length > 0) {
        finalizeJobVersioning(db, jobId, proposalData);
        db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('clarification', jobId);
        const insertQ = db.prepare('INSERT INTO clarifications (job_id, question) VALUES (?, ?)');
        for (const q of proposalData.clarificationsNeeded) insertQ.run(jobId, q);
        logAudit(jobId, 'upload_estimate_clarification', `${proposalData.clarificationsNeeded.length} questions needed`, 'admin');
      } else {
        finalizeJobVersioning(db, jobId, proposalData);
        const pdfPath = await generatePDF(proposalData, 'proposal', jobId);
        saveProposalReady(db, proposalData, pdfPath, jobId);
        logAudit(jobId, 'upload_estimate_processed', `Proposal ready. Total: $${proposalData.totalValue}`, 'admin');
        tickQuoteCounter(db);
        notifyClients('job_updated', { jobId, status: 'proposal_ready' });
        if (process.env.OWNER_WHATSAPP) {
          const ownerTo = process.env.OWNER_WHATSAPP.startsWith('whatsapp:') ? process.env.OWNER_WHATSAPP : `whatsapp:${process.env.OWNER_WHATSAPP}`;
          await sendWhatsApp(ownerTo, `📋 Upload job ready for review.\nCustomer: *${proposalData.customer?.name || 'Unknown'}*\nTotal: $${proposalData.totalValue?.toLocaleString()}\nDeposit: $${proposalData.depositAmount?.toLocaleString()}\n${proposalData.flaggedItems?.length ? `⚠️ ${proposalData.flaggedItems.length} item(s) flagged\n` : '✅ No issues flagged\n'}\nLog in to review line items.`);
        }
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

  const wizardBy = req.session?.name ? `web:${req.session.name}` : 'web:wizard';
  db.prepare(`
    INSERT INTO jobs (id, customer_name, customer_email, customer_phone, project_address, raw_estimate_data, status, submitted_by, contact_id)
    VALUES (?, ?, ?, ?, ?, ?, 'processing', ?, ?)
  `).run(jobId, contactName, contactEmail, contactPhone, projectAddress, scopeText, wizardBy, contactRef?.id || null);

  // Assign PB number + auto quote number immediately on job creation
  try {
    const pbNum = generatePBNumber(db);
    const extRef = extractExternalRef(scopeText);
    const qNum  = generateQuoteNumber(db);
    db.prepare('UPDATE jobs SET pb_number = ?, external_ref = ?, quote_number = ? WHERE id = ?').run(pbNum, extRef, qNum, jobId);
  } catch (e) { console.warn('[Wizard] PB/Quote number generation failed:', e.message); }

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

      const { context: priorCtx } = findPriorQuoteContext(db, { rawText: sanitizedScope, contactId: contactRef?.id, projectAddress });
      const proposalData = await processEstimate(fullEstimate, jobId, 'en', db, projectAddress, priorCtx);
      mergeContactIntoProposal(db, jobId, proposalData);
      console.log(`[Wizard Job ${jobId}] Claude returned proposal. readyToGenerate=${proposalData.readyToGenerate}`);

      if (proposalData.readyToGenerate === false && proposalData.clarificationsNeeded?.length > 0) {
        finalizeJobVersioning(db, jobId, proposalData);
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

        finalizeJobVersioning(db, jobId, proposalData);
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

  const manualBy = req.session?.name ? `web:${req.session.name}` : 'web:manual';
  db.prepare(`
    INSERT INTO jobs (id, customer_name, customer_email, customer_phone, project_address, raw_estimate_data, status, submitted_by, contact_id)
    VALUES (?, ?, ?, ?, ?, ?, 'received', ?, ?)
  `).run(jobId, customerName, customerEmail, customerPhone, projectAddress, estimateText, manualBy, contactRef?.id || null);

  // Assign PB number + auto quote number immediately on job creation
  try {
    const pbNum = generatePBNumber(db);
    const extRef = extractExternalRef(estimateText);
    const qNum  = generateQuoteNumber(db);
    db.prepare('UPDATE jobs SET pb_number = ?, external_ref = ?, quote_number = ? WHERE id = ?').run(pbNum, extRef, qNum, jobId);
  } catch (e) { console.warn('[Manual] PB/Quote number generation failed:', e.message); }

  res.json({ jobId, status: 'received', message: 'Job created. Processing estimate...' });

  const { processEstimate } = require('../services/claudeService');
  (async () => {
    try {
      console.log(`[Manual Job ${jobId}] Starting Claude processEstimate...`);
      db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('processing', jobId);

      const sanitizedScope = stripPII(estimateText);
      const fullEstimate = contactRef
        ? `[Customer Ref: ${contactRef.csn} | Job ID: ${jobId}]\nProject Address: ${projectAddress || 'see estimate'}\n\nESTIMATE DETAILS:\n${sanitizedScope}`
        : `[Job ID: ${jobId}]\nProject Address: ${projectAddress || 'see estimate'}\n\nESTIMATE DETAILS:\n${sanitizedScope}`;
      const { context: priorCtx } = findPriorQuoteContext(db, { rawText: sanitizedScope, contactId: contactRef?.id, projectAddress });
      const proposalData = await processEstimate(fullEstimate, jobId, 'en', db, projectAddress, priorCtx);
      mergeContactIntoProposal(db, jobId, proposalData);
      console.log(`[Manual Job ${jobId}] Claude returned proposal. readyToGenerate=${proposalData.readyToGenerate}`);

      if (proposalData.readyToGenerate === false && proposalData.clarificationsNeeded?.length > 0) {
        finalizeJobVersioning(db, jobId, proposalData);
        db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('clarification', jobId);
        const insertQ = db.prepare('INSERT INTO clarifications (job_id, question) VALUES (?, ?)');
        for (const q of proposalData.clarificationsNeeded) {
          insertQ.run(jobId, q);
        }
        console.log(`[Manual Job ${jobId}] Status: clarification (${proposalData.clarificationsNeeded.length} questions)`);

        const ownerWhatsApp = process.env.OWNER_WHATSAPP;
        if (ownerWhatsApp) {
          const to = ownerWhatsApp.startsWith('whatsapp:') ? ownerWhatsApp : `whatsapp:${ownerWhatsApp}`;
          const firstQ = proposalData.clarificationsNeeded[0];
          const total = proposalData.clarificationsNeeded.length;
          await sendWhatsApp(to, `Hey! 👋 I'm working on the estimate for *${customerName}* at ${projectAddress} but I'm missing a few details.\n\nI'll ask you one question at a time — just reply and I'll move to the next one.\n\n❓ Question 1 of ${total}:\n${firstQ}`);
        }
      } else {
        finalizeJobVersioning(db, jobId, proposalData);
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
          const { context: priorCtx } = findPriorQuoteContext(db, { rawText: rawEstimate, contactId: job.contact_id, projectAddress: job.project_address });
          const proposalData = await processEstimate(
            `${rawEstimate}\n\nCLARIFICATION ANSWERS:\n${answersText}`,
            job.id, 'en', db, job.project_address || null, priorCtx
          );
          mergeContactIntoProposal(db, job.id, proposalData);

          finalizeJobVersioning(db, job.id, proposalData);
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


// PATCH update job notes (and optionally status)
router.patch('/:id/notes', requireAuth, (req, res) => {
  const db = getDb();
  const { notes, status } = req.body;
  if (status) {
    const allowed = ['admin', 'pm', 'system_admin'];
    if (!req.session || !allowed.includes(req.session.role)) {
      return res.status(403).json({ error: 'Insufficient permissions to change job status' });
    }
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

// ARCHIVE a job (soft delete) — with optional outcome capture
router.delete('/:id', requireAuth, requireRole('admin', 'system_admin'), (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const { closed_reason, closed_note } = req.body || {};
  const validReasons = ['lost_price', 'lost_timing', 'lost_competitor', 'ghosted', 'mistake', 'completed'];
  const reason = validReasons.includes(closed_reason) ? closed_reason : null;
  const note = typeof closed_note === 'string' ? closed_note.trim().slice(0, 500) : null;

  db.prepare('UPDATE jobs SET archived = 1, archived_at = CURRENT_TIMESTAMP, closed_reason = ?, closed_note = ? WHERE id = ?')
    .run(reason, note || null, req.params.id);
  const reasonLabel = reason ? ` (${reason}${note ? ': ' + note : ''})` : '';
  logAudit(req.params.id, 'archived', `Job archived${reasonLabel}`, 'admin');
  res.json({ success: true, message: 'Job archived' });
});

// RESTORE an archived job
router.post('/:id/restore', requireAuth, requireRole('admin', 'system_admin'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE jobs SET archived = 0, archived_at = NULL, closed_reason = NULL, closed_note = NULL WHERE id = ?').run(req.params.id);
  logAudit(req.params.id, 'restored', 'Job restored from archive (outcome cleared)', 'admin');
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
        temperature: 0,
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

  const submittedBy = req.session?.name
    ? `web:${req.session.name}`
    : (req.session?.email ? `web:${req.session.email}` : 'web:wizard');

  db.prepare(`
    INSERT INTO jobs (id, customer_name, customer_email, customer_phone, project_address, raw_estimate_data, status, submitted_by, contact_id)
    VALUES (?, ?, ?, ?, ?, ?, 'received', ?, ?)
  `).run(jobId, customerName || '', customerEmail || '', customerPhone || '', projectAddress || '', rawEstimateData, submittedBy, contactRef?.id || null);

  // Assign PB number + auto quote number immediately on job creation
  try {
    const pbNum = generatePBNumber(db);
    const extRef = extractExternalRef(scopeText);
    const qNum  = generateQuoteNumber(db);
    db.prepare('UPDATE jobs SET pb_number = ?, external_ref = ?, quote_number = ? WHERE id = ?').run(pbNum, extRef, qNum, jobId);
  } catch (e) { console.warn('[Wizard] PB/Quote number generation failed:', e.message); }

  res.json({ jobId, status: 'received', message: 'Wizard submission received. Processing estimate...' });

  const { processEstimate } = require('../services/claudeService');
  (async () => {
    try {
      console.log(`[Wizard Job ${jobId}] Starting Claude processEstimate...`);
      db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('processing', jobId);
      const { context: priorCtx } = findPriorQuoteContext(db, { rawText: sanitizedScope, contactId: contactRef?.id, projectAddress });
      const proposalData = await processEstimate(fullEstimate, jobId, 'en', db, projectAddress, priorCtx);
      mergeContactIntoProposal(db, jobId, proposalData);
      console.log(`[Wizard Job ${jobId}] Claude returned proposal. readyToGenerate=${proposalData.readyToGenerate}`);

      if (proposalData.readyToGenerate === false && proposalData.clarificationsNeeded?.length > 0) {
        finalizeJobVersioning(db, jobId, proposalData);
        db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('clarification', jobId);
        const insertQ = db.prepare('INSERT INTO clarifications (job_id, question) VALUES (?, ?)');
        for (const q of proposalData.clarificationsNeeded) insertQ.run(jobId, q);
      } else {
        finalizeJobVersioning(db, jobId, proposalData);
        saveReviewPending(db, proposalData, jobId);
        logAudit(jobId, 'wizard_estimate_processed', `Wizard submission — pending review`, 'admin');
        console.log(`[Wizard Job ${jobId}] Status: review_pending. Total: $${proposalData.totalValue}`);
        notifyClients('job_updated', { jobId, status: 'review_pending' });
        if (process.env.OWNER_WHATSAPP) {
          const ownerTo = process.env.OWNER_WHATSAPP.startsWith('whatsapp:') ? process.env.OWNER_WHATSAPP : `whatsapp:${process.env.OWNER_WHATSAPP}`;
          const cust = proposalData.customer?.name || customerName || 'Unknown';
          const addr = projectAddress || 'address not provided';
          await sendWhatsApp(ownerTo, `🧾 Web wizard quote ready for review.\nCustomer: *${cust}*\nAddress: ${addr}\nTotal: $${proposalData.totalValue?.toLocaleString()}\nDeposit: $${proposalData.depositAmount?.toLocaleString()}\n${proposalData.flaggedItems?.length ? `⚠️ ${proposalData.flaggedItems.length} item(s) flagged\n` : '✅ No issues flagged\n'}\nLog in to review and generate proposal.`);
        }
      }
    } catch (err) {
      console.error(`[Wizard Job ${jobId}] ERROR:`, err.message, err.stack);
      db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('error', jobId);
    }
  })();
});

// POST /:id/revise — reopen any estimate for editing (bumps version, resets to review_pending so line-item editor opens)
router.post('/:id/revise', requireAuth, requireRole('admin', 'pm', 'system_admin'), (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND archived = 0').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.proposal_pdf_path && !job.proposal_data) return res.status(400).json({ error: 'No estimate found — generate one first' });

  const nextVersion = (job.version || 1) + 1;

  // Bump version inside proposal_data if it exists, otherwise leave proposal_data as-is
  let proposalDataStr = job.proposal_data;
  if (proposalDataStr) {
    try {
      const pd = JSON.parse(proposalDataStr);
      pd.quoteVersion = nextVersion;
      proposalDataStr = JSON.stringify(pd);
    } catch { /* leave as-is */ }
  }

  db.prepare(`
    UPDATE jobs
    SET status = 'review_pending', version = ?, proposal_data = ?, contract_pdf_path = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nextVersion, proposalDataStr, job.id);

  logAudit(job.id, 'estimate_revised', `Estimate reopened for revision — now version ${nextVersion}`, req.session?.name || 'admin');
  res.json({ success: true, version: nextVersion });
});

// POST /:id/reprocess — retry AI estimation for a job stuck in error status
router.post('/:id/reprocess', requireAuth, requireRole('admin', 'pm', 'system_admin'), async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.raw_estimate_data) return res.status(400).json({ error: 'No raw estimate data to reprocess' });

  db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('processing', job.id);
  res.json({ success: true, message: 'Reprocessing started' });

  const { processEstimate } = require('../services/claudeService');
  (async () => {
    try {
      console.log(`[Reprocess Job ${job.id}] Starting Claude processEstimate...`);
      const fullEstimate = `[Job ID: ${job.id}]\nProject Address: ${job.project_address || 'see estimate'}\n\nESTIMATE DETAILS:\n${job.raw_estimate_data}`;
      const { context: priorCtx } = findPriorQuoteContext(db, { rawText: job.raw_estimate_data, contactId: job.contact_id, projectAddress: job.project_address });
      const proposalData = await processEstimate(fullEstimate, job.id, 'en', db, job.project_address || null, priorCtx);
      mergeContactIntoProposal(db, job.id, proposalData);
      console.log(`[Reprocess Job ${job.id}] Claude returned. readyToGenerate=${proposalData.readyToGenerate}`);

      if (proposalData.readyToGenerate === false && proposalData.clarificationsNeeded?.length > 0) {
        finalizeJobVersioning(db, job.id, proposalData);
        db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('clarification', job.id);
        const insertQ = db.prepare('INSERT INTO clarifications (job_id, question) VALUES (?, ?)');
        for (const q of proposalData.clarificationsNeeded) insertQ.run(job.id, q);
      } else {
        finalizeJobVersioning(db, job.id, proposalData);
        saveReviewPending(db, proposalData, job.id);
        logAudit(job.id, 'reprocessed', 'Job reprocessed after error', req.session?.name || 'admin');
        notifyClients('job_updated', { jobId: job.id, status: 'review_pending' });
      }
    } catch (err) {
      const errMsg = err.message || String(err);
      console.error(`[Reprocess Job ${job.id}] ERROR: ${errMsg}\n${err.stack || ''}`);
      db.prepare('UPDATE jobs SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('error', errMsg, job.id);
    }
  })();
});

// GET /:id/margin — financial profit margin breakdown for a job
router.get('/:id/margin', requireAuth, (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT proposal_data FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (!job.proposal_data) return res.json({ hasData: false });

  let proposalData;
  try {
    proposalData = typeof job.proposal_data === 'string' ? JSON.parse(job.proposal_data) : job.proposal_data;
  } catch {
    return res.json({ hasData: false });
  }

  // Load current target rates from settings (for comparison)
  const settingsRows = db.prepare('SELECT key, value FROM settings WHERE category = ?').all('markup');
  const settingsMap = {};
  for (const row of settingsRows) settingsMap[row.key] = row.value;
  const targetSubOandP    = Number(settingsMap['markup.subOandP'])    || 0.15;
  const targetGcOandP     = Number(settingsMap['markup.gcOandP'])     || 0.25;
  const targetContingency = Number(settingsMap['markup.contingency']) || 0.10;

  // Use the actual rates that were applied at proposal generation time (stored in pricing.appliedRates).
  // Fall back to current settings if the proposal was generated before this field existed.
  const pricing = proposalData.pricing || {};
  const stored = pricing.appliedRates || {};
  const hasStoredRates = stored.subOandP != null;
  const actualSubOandP    = hasStoredRates ? Number(stored.subOandP)    : targetSubOandP;
  const actualGcOandP     = hasStoredRates ? Number(stored.gcOandP)     : targetGcOandP;
  const actualContingency = hasStoredRates ? Number(stored.contingency) : targetContingency;

  const items = proposalData.lineItems || [];
  const contractPrice = pricing.totalContractPrice || proposalData.totalValue || 0;

  // Base cost = sum of all non-stretch-code line items (stretch-code items pass through at cost, no markup).
  // Also include any implicit dumpster base cost that was added at proposal generation time but not stored
  // as a line item (it was folded directly into totalContractPrice via the markup multiplier).
  const implicitDumpsterBaseCost = Number(pricing.implicitDumpsterBaseCost) || 0;

  let markupBaseCost = implicitDumpsterBaseCost;
  let stretchBaseCost = 0;
  for (const item of items) {
    if (item.isStretchCode) {
      stretchBaseCost += (item.baseCost || 0);
    } else {
      markupBaseCost += (item.baseCost || 0);
    }
  }
  const totalBaseCost = markupBaseCost + stretchBaseCost;

  // Compute dollar contribution of each markup layer using actual applied rates on the markup-eligible base cost
  const afterSubOandP    = Math.round(markupBaseCost * (1 + actualSubOandP));
  const afterGcOandP     = Math.round(afterSubOandP * (1 + actualGcOandP));
  const afterContingency = Math.round(afterGcOandP * (1 + actualContingency));

  const subOandPDollar    = afterSubOandP - markupBaseCost;
  const gcOandPDollar     = afterGcOandP - afterSubOandP;
  const contingencyDollar = afterContingency - afterGcOandP;

  // Compute target contract price for overall pass/fail comparison
  const targetAfterSub  = Math.round(markupBaseCost * (1 + targetSubOandP));
  const targetAfterGc   = Math.round(targetAfterSub * (1 + targetGcOandP));
  const targetAfterCont = Math.round(targetAfterGc * (1 + targetContingency));
  const targetContractPrice = targetAfterCont + stretchBaseCost;

  // Actual net profit margin: (contractPrice − totalBaseCost) / contractPrice
  const actualNetMarginPct = contractPrice > 0
    ? Math.round(((contractPrice - totalBaseCost) / contractPrice) * 1000) / 10
    : 0;

  // Per-layer pass/fail: actual applied % within ±1% of configured target
  const layerPass = (actual, target) => Math.abs(actual - target) <= 0.01;
  const overallPass = contractPrice > 0 && targetContractPrice > 0
    ? Math.abs((contractPrice - targetContractPrice) / targetContractPrice) <= 0.01
    : null;

  res.json({
    hasData: true,
    hasStoredRates,
    baseCost: totalBaseCost,
    markupBaseCost,
    stretchBaseCost,
    contractPrice,
    targetContractPrice,
    actualNetMarginPct,
    layers: [
      {
        label: 'Sub O&P',
        targetPct: targetSubOandP,
        actualPct: actualSubOandP,
        dollarAdded: subOandPDollar,
        pass: layerPass(actualSubOandP, targetSubOandP),
      },
      {
        label: 'GC O&P',
        targetPct: targetGcOandP,
        actualPct: actualGcOandP,
        dollarAdded: gcOandPDollar,
        pass: layerPass(actualGcOandP, targetGcOandP),
      },
      {
        label: 'Contingency',
        targetPct: targetContingency,
        actualPct: actualContingency,
        dollarAdded: contingencyDollar,
        pass: layerPass(actualContingency, targetContingency),
      },
    ],
    overallPass,
  });
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
