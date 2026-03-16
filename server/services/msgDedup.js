// server/services/msgDedup.js
// Shared deduplication for WhatsApp messages.
// claimMessage() is atomic: only one caller (even across processes) succeeds.

const { getDb } = require('../db/database');

const seen = new Map(); // sid → timestamp (in-process fast-path)
const TTL_MS = 120000;  // 2 minutes

function isDuplicate(sid) {
  if (!sid) return false;
  const ts = seen.get(sid);
  return !!(ts && Date.now() - ts < TTL_MS);
}

function markSeen(sid) {
  if (!sid) return;
  seen.set(sid, Date.now());
  if (seen.size > 500) {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, v] of seen) {
      if (v < cutoff) seen.delete(k);
    }
  }
}

// Returns true if THIS call successfully claimed the message (first one wins).
// Atomic INSERT OR IGNORE — safe across multiple processes sharing the same SQLite DB.
function claimMessage(sid) {
  if (!sid) return true;
  if (isDuplicate(sid)) return false;
  try {
    const db = getDb();
    const result = db.prepare('INSERT OR IGNORE INTO whatsapp_processed (message_sid) VALUES (?)').run(sid);
    if (result.changes === 0) {
      markSeen(sid); // keep in-process cache warm
      return false;  // another process already claimed it
    }
    markSeen(sid);
    return true;
  } catch {
    // DB unavailable — fall back to in-memory only
    if (isDuplicate(sid)) return false;
    markSeen(sid);
    return true;
  }
}

module.exports = { isDuplicate, markSeen, claimMessage };
