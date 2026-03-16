// server/services/msgDedup.js
// Shared in-process deduplication for WhatsApp messages.
// Both the webhook and the poller import this — same process = same Map.

const seen = new Map(); // sid → timestamp
const TTL_MS = 120000;  // 2 minutes

function isDuplicate(sid) {
  if (!sid) return false;
  const ts = seen.get(sid);
  if (ts && Date.now() - ts < TTL_MS) return true;
  return false;
}

function markSeen(sid) {
  if (!sid) return;
  seen.set(sid, Date.now());
  // Clean up old entries
  if (seen.size > 500) {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, v] of seen) {
      if (v < cutoff) seen.delete(k);
    }
  }
}

module.exports = { isDuplicate, markSeen };
