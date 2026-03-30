const { getDb } = require('../db/database');

function logTokenUsage({ service, model, inputTokens, outputTokens, jobId = null, context = null }) {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO token_usage (service, model, input_tokens, output_tokens, job_id, context, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(service, model || null, inputTokens || 0, outputTokens || 0, jobId || null, context || null);
  } catch (e) {
    console.error('[tokenLogger] Failed to log token usage:', e.message);
  }
}

module.exports = { logTokenUsage };
