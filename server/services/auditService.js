// server/services/auditService.js
const { getDb } = require('../db/database');

function logAudit(jobId, action, details, performedBy) {
  try {
    const db = getDb();
    db.prepare('INSERT INTO audit_log (job_id, action, details, performed_by) VALUES (?, ?, ?, ?)').run(jobId, action, details, performedBy);
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

module.exports = { logAudit };
