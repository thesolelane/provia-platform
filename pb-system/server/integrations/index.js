// server/integrations/index.js
const { getDb } = require('../db/database');

function getActiveAdapter() {
  try {
    const db = getDb();
    const setting = db.prepare("SELECT value FROM settings WHERE key = 'integration.platform'").get();
    const platform = setting?.value || 'hearth';
    if (platform === 'wave') return require('./adapters/wave');
    return require('./adapters/hearth');
  } catch {
    return require('./adapters/hearth');
  }
}

module.exports = { getActiveAdapter };
