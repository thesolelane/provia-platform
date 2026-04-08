'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');
const { logAudit } = require('../services/auditService');
const { findOrCreateContact } = require('../services/jobHelpers');

const VALID_STAGES = [
  'incoming',
  'callback_done',
  'appointment_booked',
  'site_visit_complete',
  'quote_draft',
  'quote_sent',
  'follow_up_1',
  'follow_up_2',
  'signed',
  'rejected'
];

const VALID_SOURCES = ['marblism', 'referral', 'web', 'walk-in', 'other'];
const VALID_ARCHIVE_REASONS = ['price', 'timing', 'no_response', 'other'];

// ── Contact lookup by phone first, then name (for leads where email is unknown) ──
function findOrCreateContactByPhoneOrName(db, { name, phone }) {
  let contact = null;

  // 1. Exact phone match (most reliable for Marblism-sourced leads)
  if (phone && phone !== 'Unknown number') {
    contact = db.prepare('SELECT * FROM contacts WHERE phone = ? LIMIT 1').get(phone.trim());
  }

  // 2. Fall back to name match
  if (!contact && name && name !== 'Unknown caller') {
    contact = db.prepare('SELECT * FROM contacts WHERE name = ? COLLATE NOCASE LIMIT 1').get(name.trim());
  }

  if (contact) {
    // Update phone if we now have a better value
    if (!contact.phone && phone && phone !== 'Unknown number') {
      db.prepare('UPDATE contacts SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(phone.trim(), contact.id);
    }
    // Ensure serial numbers exist
    if (!contact.customer_number) {
      const { generateCustomerSerial } = require('../services/jobHelpers');
      const csn = generateCustomerSerial(db);
      db.prepare('UPDATE contacts SET customer_number = ? WHERE id = ?').run(csn, contact.id);
    }
    if (!contact.pb_customer_number) {
      const { generatePbCustomerNumber } = require('../services/jobHelpers');
      const pbn = generatePbCustomerNumber(db);
      if (pbn) db.prepare('UPDATE contacts SET pb_customer_number = ? WHERE id = ?').run(pbn, contact.id);
    }
    return { id: contact.id };
  }

  // Create new contact
  return findOrCreateContact(db, { name, phone, email: '', address: '', city: '', state: 'MA' });
}

// ── GET /api/leads — list all active leads ──────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const archived = req.query.archived === '1' ? 1 : 0;
    const leads = db.prepare(
      `SELECT * FROM leads WHERE archived = ? ORDER BY updated_at DESC`
    ).all(archived);
    res.json({ leads });
  } catch (err) {
    console.error('[Leads] list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/leads/:id — single lead ────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/leads — create a lead manually ────────────────────────────────
router.post('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { caller_name, caller_phone, source = 'other', notes = '' } = req.body;
    if (!caller_name || !caller_phone) {
      return res.status(400).json({ error: 'caller_name and caller_phone are required' });
    }
    const src = VALID_SOURCES.includes(source) ? source : 'other';
    const result = db.prepare(
      `INSERT INTO leads (caller_name, caller_phone, source, notes, stage, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'incoming', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).run(caller_name.trim(), caller_phone.trim(), src, notes || '');

    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(result.lastInsertRowid);
    logAudit(null, 'lead_created', `Lead #${lead.id} created — ${caller_name} (${caller_phone}) source=${src}`, req.session?.name || 'admin');
    res.status(201).json({ lead });
  } catch (err) {
    console.error('[Leads] create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/leads/:id — update stage or notes ────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { stage, notes, archive_reason } = req.body;
    const leadId = parseInt(req.params.id, 10);

    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const performer = req.session?.name || 'admin';
    const updates = [];
    const params = [];

    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (stage !== undefined) {
      if (!VALID_STAGES.includes(stage)) {
        return res.status(400).json({ error: `Invalid stage: ${stage}` });
      }
      updates.push('stage = ?');
      params.push(stage);

      // ── Archiving ──────────────────────────────────────────────────────────
      if (stage === 'rejected') {
        updates.push('archived = 1');
        if (archive_reason) {
          const reason = VALID_ARCHIVE_REASONS.includes(archive_reason) ? archive_reason : 'other';
          updates.push('archive_reason = ?');
          params.push(reason);
        }
      }

      // ── Contact creation on quote_sent (idempotent) ────────────────────────
      if (stage === 'quote_sent' && lead.stage !== 'quote_sent' && !lead.contact_id) {
        try {
          const contactRef = findOrCreateContactByPhoneOrName(db, {
            name: lead.caller_name,
            phone: lead.caller_phone
          });
          updates.push('contact_id = ?');
          params.push(contactRef.id);
          logAudit(null, 'lead_contact_created', `Lead #${leadId}: contact #${contactRef.id} created — ${lead.caller_name} (${lead.caller_phone})`, performer);
        } catch (contactErr) {
          console.error('[Leads] contact creation error:', contactErr.message);
        }
      }

      // ── Auto-task on signed ────────────────────────────────────────────────
      if (stage === 'signed' && lead.stage !== 'signed') {
        try {
          const contactId = lead.contact_id || null;
          db.prepare(
            `INSERT INTO tasks (title, description, status, priority, contact_id, created_at, updated_at)
             VALUES (?, ?, 'pending', 'high', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
          ).run(
            `Generate contract — ${lead.caller_name}`,
            `Auto-created from signed lead #${leadId}. Caller: ${lead.caller_name} (${lead.caller_phone})`,
            contactId
          );
          logAudit(null, 'lead_contract_task_created', `Lead #${leadId}: contract task created for ${lead.caller_name}`, performer);
        } catch (taskErr) {
          console.error('[Leads] contract task error:', taskErr.message);
        }
      }

      logAudit(null, 'lead_stage_changed', `Lead #${leadId}: ${lead.stage} → ${stage} by ${performer}`, performer);
    }

    if (updates.length === 0) {
      return res.json({ lead });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(leadId);

    db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
    res.json({ lead: updated });
  } catch (err) {
    console.error('[Leads] patch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/leads/:id — hard delete ─────────────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
    logAudit(null, 'lead_deleted', `Lead #${req.params.id} deleted — ${lead.caller_name}`, req.session?.name || 'admin');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
