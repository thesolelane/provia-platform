// server/middleware/requireAgent.js
//
// AUTH CONTRACT FOR MARBILISM AGENTS
// ───────────────────────────────────
// Each agent receives a raw API key and a raw signing secret on first-boot
// (printed once to the server console). Only SHA-256 hashes of both are stored.
//
// To authenticate a request the agent must:
//   1. Set header  x-agent-key: <raw API key>
//   2. Set header  x-timestamp: <unix ms timestamp as string>
//   3. Compute HMAC key = sha256(rawSecret)   <── hash the secret before using it
//   4. Compute sig = HMAC-SHA256(key=HMACkey, msg=`${timestamp}.${rawBodyString}`)
//   5. Set header  x-signature: <hex-encoded sig>
//
// The server hashes the inbound key to find the agent row, then uses the stored
// secret_hash (= sha256(rawSecret)) as the HMAC key — matching step 3 above.
//
const crypto = require('crypto');
const { getDb } = require('../db/database');

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const HEX_RE = /^[0-9a-f]+$/i;

function requireAgent(req, res, next) {
  const agentKey = req.headers['x-agent-key'];
  const timestamp = req.headers['x-timestamp'];
  const signature = req.headers['x-signature'];

  if (!agentKey || !timestamp || !signature) {
    return res.status(401).json({ error: 'Missing agent auth headers' });
  }

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > FIVE_MINUTES_MS) {
    return res.status(401).json({ error: 'Timestamp out of range or replay detected' });
  }

  const keyHash = crypto.createHash('sha256').update(agentKey).digest('hex');
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agent_keys WHERE key_hash = ?').get(keyHash);

  if (!agent) {
    return res.status(401).json({ error: 'Unknown agent key' });
  }

  const rawBody = req.rawBody || '';
  const expectedSig = crypto
    .createHmac('sha256', agent.secret_hash)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  // Validate signature format: must be lowercase hex of the same length as expectedSig
  const expectedLen = expectedSig.length;
  if (
    typeof signature !== 'string' ||
    signature.length !== expectedLen ||
    !HEX_RE.test(signature)
  ) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let sigValid = false;
  try {
    sigValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSig, 'hex')
    );
  } catch {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  if (!sigValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  db.prepare(
    "UPDATE agent_keys SET request_count = request_count + 1, last_seen = datetime('now') WHERE id = ?"
  ).run(agent.id);

  req.agent = agent;
  next();
}

module.exports = { requireAgent };
