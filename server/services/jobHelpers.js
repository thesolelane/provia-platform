// server/services/jobHelpers.js
// Shared helper functions extracted from server/routes/jobs.js
const { getDb } = require('../db/database');

// ── Quote versioning ────────────────────────────────────────────────────────
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

function formatVersionedQuote(quoteNumber, version) {
  if (!quoteNumber) return '';
  return `${quoteNumber}/${version || 1}`;
}

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

function findPriorQuoteContext(db, { rawText, contactId, projectAddress }) {
  const { getPriorVersionContext } = require('./claudeService');

  if (contactId && projectAddress && projectAddress.length > 5) {
    const prior = db
      .prepare(
        `
      SELECT quote_number FROM jobs
      WHERE contact_id = ? AND project_address = ? AND quote_number IS NOT NULL AND proposal_data IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `,
      )
      .get(contactId, projectAddress);
    if (prior?.quote_number) {
      const ctx = getPriorVersionContext(db, prior.quote_number);
      if (ctx) return { quoteNumber: prior.quote_number, context: ctx };
    }
  }

  if (contactId) {
    const prior = db
      .prepare(
        `
      SELECT quote_number FROM jobs
      WHERE contact_id = ? AND quote_number IS NOT NULL AND proposal_data IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `,
      )
      .get(contactId);
    if (prior?.quote_number) {
      const ctx = getPriorVersionContext(db, prior.quote_number);
      if (ctx) return { quoteNumber: prior.quote_number, context: ctx };
    }
  }

  if (projectAddress && projectAddress.length > 5) {
    const prior = db
      .prepare(
        `
      SELECT quote_number FROM jobs
      WHERE project_address = ? AND quote_number IS NOT NULL AND proposal_data IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `,
      )
      .get(projectAddress);
    if (prior?.quote_number) {
      const ctx = getPriorVersionContext(db, prior.quote_number);
      if (ctx) return { quoteNumber: prior.quote_number, context: ctx };
    }
  }

  const preQuoteNum = preExtractQuoteNumber(rawText);
  if (preQuoteNum) {
    const ctx = getPriorVersionContext(db, preQuoteNum);
    if (ctx) return { quoteNumber: preQuoteNum, context: ctx };
  }

  return { quoteNumber: null, context: null };
}

function finalizeJobVersioning(db, jobId, proposalData) {
  let rawQuoteNum = proposalData.quoteNumber ? String(proposalData.quoteNumber).trim() : null;
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
    `UPDATE jobs SET quote_number = ?, version = ?, parent_job_id = ?, estimate_source = 'ai' WHERE id = ?`,
  ).run(rawQuoteNum, version, parentJobId, jobId);

  proposalData.quoteNumberRaw = rawQuoteNum;
  proposalData.quoteVersion = version;
  proposalData.quoteNumber = versionedDisplay;

  console.log(
    `[Versioning] Job ${jobId}: quote ${rawQuoteNum} → version ${version} (${versionedDisplay})`,
  );
}

function mergeContactIntoProposal(db, jobId, proposalData) {
  try {
    const job = db
      .prepare(
        `SELECT customer_name, customer_email, customer_phone, project_address, project_city,
              contact_id, pb_number, external_ref, quote_number FROM jobs WHERE id = ?`,
      )
      .get(jobId);
    if (!job) return;

    let contact = null;
    if (job.contact_id) {
      contact = db
        .prepare(
          'SELECT name, email, phone, address, city, state, pb_customer_number FROM contacts WHERE id = ?',
        )
        .get(job.contact_id);
    }
    if (!contact && job.customer_email) {
      contact = db
        .prepare(
          'SELECT name, email, phone, address, city, state, pb_customer_number FROM contacts WHERE email = ? COLLATE NOCASE LIMIT 1',
        )
        .get(job.customer_email);
    }
    if (!contact && job.customer_phone) {
      contact = db
        .prepare(
          'SELECT name, email, phone, address, city, state, pb_customer_number FROM contacts WHERE phone = ? LIMIT 1',
        )
        .get(job.customer_phone);
    }

    if (!proposalData.customer) proposalData.customer = {};
    const c = proposalData.customer;

    const clean = (v) => (typeof v === 'string' ? v.trim() : '') || '';
    c.name = clean(contact?.name) || clean(job.customer_name) || clean(c.name) || '';
    c.email = clean(contact?.email) || clean(job.customer_email) || clean(c.email) || '';
    c.phone = clean(contact?.phone) || clean(job.customer_phone) || clean(c.phone) || '';
    if (contact?.pb_customer_number) c.pb_customer_number = contact.pb_customer_number;

    if (!proposalData.project) proposalData.project = {};
    proposalData.project.address =
      proposalData.project.address || contact?.address || job.project_address || '';
    proposalData.project.city =
      proposalData.project.city || contact?.city || job.project_city || '';

    if (!proposalData.quoteNumber) {
      proposalData.quoteNumber = job.quote_number || job.external_ref || job.pb_number || '';
    }

    if (c.name)
      console.log(
        `[mergeContact] Job ${jobId}: customer="${c.name}", quoteNumber="${proposalData.quoteNumber}"`,
      );
  } catch (e) {
    console.warn('[mergeContactIntoProposal] Error:', e.message);
  }
}

function saveProposalReady(db, proposalData, pdfPath, jobId) {
  const c = proposalData.customer || {};
  const p = proposalData.project || {};

  db.prepare(
    `
    UPDATE jobs SET
      proposal_data = ?, proposal_pdf_path = ?, total_value = ?, deposit_amount = ?,
      status = ?, updated_at = CURRENT_TIMESTAMP,
      customer_name  = COALESCE(NULLIF(?, ''), customer_name),
      customer_email = COALESCE(NULLIF(?, ''), customer_email),
      customer_phone = COALESCE(NULLIF(?, ''), customer_phone),
      project_address = COALESCE(NULLIF(?, ''), project_address),
      project_city    = COALESCE(NULLIF(?, ''), project_city)
    WHERE id = ?`,
  ).run(
    JSON.stringify(proposalData),
    pdfPath,
    proposalData.totalValue,
    proposalData.depositAmount,
    'proposal_ready',
    c.name || '',
    c.email || '',
    c.phone || '',
    p.address || '',
    p.city || '',
    jobId,
  );

  const job = db
    .prepare(
      'SELECT customer_name, customer_email, customer_phone, project_address, project_city, contact_id FROM jobs WHERE id = ?',
    )
    .get(jobId);
  const contactName = c.name || job?.customer_name || '';
  const contactEmail = c.email || job?.customer_email || '';
  const contactPhone = c.phone || job?.customer_phone || '';
  const contactAddr = p.address || job?.project_address || '';
  const contactCity = p.city || job?.project_city || '';

  if (contactName || contactEmail) {
    try {
      const contactRef = findOrCreateContact(db, {
        name: contactName,
        email: contactEmail,
        phone: contactPhone,
        address: contactAddr,
        city: contactCity,
        state: p.state || 'MA',
      });
      if (!job?.contact_id) {
        db.prepare('UPDATE jobs SET contact_id = ? WHERE id = ?').run(contactRef.id, jobId);
      }
    } catch (e) {
      console.warn('[saveProposalReady] Contact upsert failed:', e.message);
    }
  }
}

function saveReviewPending(db, proposalData, jobId) {
  const c = proposalData.customer || {};
  const p = proposalData.project || {};
  db.prepare(
    `
    UPDATE jobs SET
      proposal_data = ?, status = 'review_pending', updated_at = CURRENT_TIMESTAMP,
      total_value = ?, deposit_amount = ?,
      customer_name  = COALESCE(NULLIF(?, ''), customer_name),
      customer_email = COALESCE(NULLIF(?, ''), customer_email),
      customer_phone = COALESCE(NULLIF(?, ''), customer_phone),
      project_address = COALESCE(NULLIF(?, ''), project_address),
      project_city    = COALESCE(NULLIF(?, ''), project_city)
    WHERE id = ?`,
  ).run(
    JSON.stringify(proposalData),
    proposalData.totalValue || 0,
    proposalData.depositAmount || 0,
    c.name || '',
    c.email || '',
    c.phone || '',
    p.address || '',
    p.city || '',
    jobId,
  );
}

// ── Customer serial number helpers ─────────────────────────────────────────

function generateCustomerSerial(db) {
  const year = new Date().getFullYear();
  const assign = db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO customer_serial_counter (year, next_seq) VALUES (?, 1)').run(
      year,
    );
    const row = db.prepare('SELECT next_seq FROM customer_serial_counter WHERE year = ?').get(year);
    const seq = row.next_seq;
    db.prepare('UPDATE customer_serial_counter SET next_seq = next_seq + 1 WHERE year = ?').run(
      year,
    );
    return `PB-C-${year}-${String(seq).padStart(4, '0')}`;
  });
  return assign();
}

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

function extractExternalRef(text) {
  if (!text) return null;
  const match = text.match(/(?:estimate|quote|proposal|ref|#|no\.?)\s*[:#]?\s*(\d{3,8})/i);
  return match ? match[1] : null;
}

function generatePbCustomerNumber(db) {
  try {
    const counter = db.prepare('SELECT next_seq FROM pb_customer_counter WHERE id = 1').get();
    const seq = counter ? counter.next_seq : 1;
    const pbn = 'PB-C-' + String(seq).padStart(4, '0');
    db.prepare('UPDATE pb_customer_counter SET next_seq = ? WHERE id = 1').run(seq + 1);
    return pbn;
  } catch {
    return null;
  }
}

function findOrCreateContact(db, { name, email, phone, address, city, state }) {
  let contact = email
    ? db.prepare('SELECT * FROM contacts WHERE email = ? COLLATE NOCASE LIMIT 1').get(email)
    : null;
  if (!contact && name) {
    contact = db.prepare('SELECT * FROM contacts WHERE name = ? COLLATE NOCASE LIMIT 1').get(name);
  }
  if (contact) {
    db.prepare(
      `
      UPDATE contacts SET
        name    = COALESCE(NULLIF(?, ''), name),
        email   = COALESCE(NULLIF(?, ''), email),
        phone   = COALESCE(NULLIF(?, ''), phone),
        address = COALESCE(NULLIF(?, ''), address),
        city    = COALESCE(NULLIF(?, ''), city),
        state   = COALESCE(NULLIF(?, ''), state),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    ).run(
      name || '',
      email || '',
      phone || '',
      address || '',
      city || '',
      state || 'MA',
      contact.id,
    );
    if (!contact.customer_number) {
      const csn = generateCustomerSerial(db);
      db.prepare('UPDATE contacts SET customer_number = ? WHERE id = ?').run(csn, contact.id);
      contact.customer_number = csn;
    }
    if (!contact.pb_customer_number) {
      const pbn = generatePbCustomerNumber(db);
      if (pbn) {
        db.prepare('UPDATE contacts SET pb_customer_number = ? WHERE id = ?').run(pbn, contact.id);
        contact.pb_customer_number = pbn;
      }
    }
    return {
      id: contact.id,
      csn: contact.customer_number,
      pb_customer_number: contact.pb_customer_number,
    };
  } else {
    const csn = generateCustomerSerial(db);
    const pbn = generatePbCustomerNumber(db);
    const result = db
      .prepare(
        `
      INSERT INTO contacts (name, email, phone, address, city, state, customer_number, pb_customer_number, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'estimate')`,
      )
      .run(
        name || '',
        email || '',
        phone || '',
        address || '',
        city || '',
        state || 'MA',
        csn,
        pbn,
      );
    return { id: result.lastInsertRowid, csn, pb_customer_number: pbn };
  }
}

function stripPII(text) {
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email-redacted]')
    .replace(/\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone-redacted]');
}

// Auto-purge: permanently delete jobs archived more than 90 days ago
function purgeOldArchived() {
  try {
    const db = getDb();
    const old = db
      .prepare(
        "SELECT id FROM jobs WHERE archived = 1 AND archived_at < datetime('now', '-90 days')",
      )
      .all();
    for (const job of old) {
      db.prepare('DELETE FROM clarifications WHERE job_id = ?').run(job.id);
      db.prepare('DELETE FROM conversations WHERE job_id = ?').run(job.id);
      db.prepare('DELETE FROM audit_log WHERE job_id = ?').run(job.id);
      db.prepare('DELETE FROM jobs WHERE id = ?').run(job.id);
    }
    if (old.length > 0)
      console.log(
        `[Auto-purge] Permanently deleted ${old.length} archived job(s) older than 90 days`,
      );
  } catch {
    /* ignore purge errors */
  }
}
setInterval(purgeOldArchived, 24 * 60 * 60 * 1000);
setTimeout(purgeOldArchived, 5000);

module.exports = {
  resolveQuoteVersion,
  formatVersionedQuote,
  preExtractQuoteNumber,
  findPriorQuoteContext,
  finalizeJobVersioning,
  mergeContactIntoProposal,
  saveProposalReady,
  saveReviewPending,
  generateCustomerSerial,
  generatePBNumber,
  generateQuoteNumber,
  extractExternalRef,
  generatePbCustomerNumber,
  findOrCreateContact,
  stripPII,
  purgeOldArchived,
};
