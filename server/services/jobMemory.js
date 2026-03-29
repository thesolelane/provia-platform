// server/services/jobMemory.js
// Persistent per-job memory Claude reads before and writes after every call.
// Files live in data/job-memory/{jobId}.json
// Status: "open" (can update) | "locked" (contract signed — read-only)

const fs   = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '../../data/job-memory');

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function filePath(jobId) {
  return path.join(MEMORY_DIR, `${jobId}.json`);
}

function read(jobId) {
  ensureDir();
  const fp = filePath(jobId);
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch { return null; }
}

function write(jobId, data) {
  ensureDir();
  fs.writeFileSync(filePath(jobId), JSON.stringify(data, null, 2), 'utf8');
}

// ── Write or update a version after Claude processes an estimate ──────────────
function saveVersion(jobId, { pbNumber, customerName, quoteNumber, versionNumber, totalValue, lineItems, scopeSummary, claudeNotes }) {
  let mem = read(jobId);

  if (!mem) {
    mem = {
      jobId,
      pbNumber:     pbNumber || null,
      customerName: customerName || null,
      status:       'open',
      lockedAt:     null,
      lockedReason: null,
      versions:     [],
    };
  }

  if (mem.status === 'locked') return; // never overwrite locked memory

  // Update or append version
  const existing = mem.versions.findIndex(v => v.versionNumber === versionNumber);
  const versionData = {
    versionNumber,
    quoteNumber:    quoteNumber || null,
    createdAt:      new Date().toISOString(),
    totalValue:     totalValue || 0,
    lineItems:      (lineItems || []).map(li => ({
      trade:       li.trade,
      description: li.description || '',
      baseCost:    li.baseCost || 0,
      finalPrice:  li.finalPrice || 0,
    })),
    scopeSummary:    scopeSummary || '',
    claudeNotes:     claudeNotes  || '',
    sentToCustomer:  false,
    sentAt:          null,
    customerOutcome: 'pending',  // pending | rejected | approved
    approvedAt:      null,
  };

  if (existing >= 0) mem.versions[existing] = { ...mem.versions[existing], ...versionData };
  else               mem.versions.push(versionData);

  // Update top-level identifiers if provided
  if (pbNumber)     mem.pbNumber     = pbNumber;
  if (customerName) mem.customerName = customerName;

  write(jobId, mem);
}

// ── Mark a version as sent to the customer ────────────────────────────────────
function markSent(jobId, versionNumber) {
  const mem = read(jobId);
  if (!mem || mem.status === 'locked') return;
  const v = mem.versions.find(v => v.versionNumber === versionNumber)
         || mem.versions[mem.versions.length - 1];
  if (!v) return;
  v.sentToCustomer = true;
  v.sentAt         = new Date().toISOString();
  write(jobId, mem);
}

// ── Record what the customer did with a version ───────────────────────────────
// outcome: 'approved' | 'rejected'
function markOutcome(jobId, outcome, versionNumber = null) {
  const mem = read(jobId);
  if (!mem) return;
  const v = versionNumber
    ? mem.versions.find(v => v.versionNumber === versionNumber)
    : mem.versions[mem.versions.length - 1];
  if (!v) return;
  v.customerOutcome = outcome;
  if (outcome === 'approved') v.approvedAt = new Date().toISOString();
  write(jobId, mem);
}

// ── Lock the file — called when contract is signed ───────────────────────────
function lock(jobId, reason = 'contract_signed') {
  const mem = read(jobId);
  if (!mem) return;
  if (mem.status === 'locked') return;
  // Mark the last version as approved if not already
  const last = mem.versions[mem.versions.length - 1];
  if (last && last.customerOutcome !== 'approved') {
    last.customerOutcome = 'approved';
    last.approvedAt      = new Date().toISOString();
  }
  mem.status       = 'locked';
  mem.lockedAt     = new Date().toISOString();
  mem.lockedReason = reason;
  write(jobId, mem);
}

// ── Build a compact context string for Claude injection ───────────────────────
// Tells Claude what was previously quoted, what changed, and what was locked in.
function getContextForClaude(jobId) {
  const mem = read(jobId);
  if (!mem || !mem.versions.length) return null;

  const lines = [];
  lines.push(`## JOB MEMORY — ${mem.customerName || mem.jobId} (${mem.pbNumber || 'unassigned'})`);
  lines.push(`Status: ${mem.status === 'locked' ? '🔒 LOCKED (contract signed)' : 'open'}`);
  if (mem.lockedAt) lines.push(`Locked: ${new Date(mem.lockedAt).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}`);
  lines.push('');

  for (const v of mem.versions) {
    const outcome = v.customerOutcome === 'approved'
      ? '✅ APPROVED'
      : v.customerOutcome === 'rejected'
      ? '❌ Rejected by customer'
      : v.sentToCustomer ? '⏳ Sent — awaiting response' : '📝 Draft (not yet sent)';

    lines.push(`### Version ${v.versionNumber} (${v.quoteNumber || '—'}) — ${new Date(v.createdAt).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}`);
    lines.push(`Total: $${(v.totalValue || 0).toLocaleString()} | ${outcome}`);

    if (v.lineItems?.length) {
      lines.push('Line items:');
      for (const li of v.lineItems) {
        lines.push(`  - ${li.trade}: base $${(li.baseCost || 0).toLocaleString()} → client $${(li.finalPrice || 0).toLocaleString()}${li.description ? ` (${li.description})` : ''}`);
      }
    }

    if (v.scopeSummary) lines.push(`Scope: ${v.scopeSummary}`);
    if (v.claudeNotes)  lines.push(`Notes: ${v.claudeNotes}`);
    lines.push('');
  }

  if (mem.status === 'locked') {
    lines.push('RULE: This job is locked. Use the approved version above as the binding scope and price baseline for any change orders or future work. Do NOT deviate from approved line items without explicit new scope.');
  } else if (mem.versions.length > 1) {
    lines.push('RULE: Multiple versions exist. Compare carefully. Only revise what the new scope explicitly changes.');
  }

  return lines.join('\n');
}

module.exports = { read, saveVersion, markSent, markOutcome, lock, getContextForClaude };
