// modules/loader.js
// Loads the active trade module based on TRADE_MODULE env var.
// Set TRADE_MODULE=gc | electrician | plumber in .env
// Defaults to 'gc' if not set.

const VALID_MODULES = ['gc', 'electrician', 'plumber'];
const trade = (process.env.TRADE_MODULE || 'gc').toLowerCase().trim();

if (!VALID_MODULES.includes(trade)) {
  throw new Error(
    `Invalid TRADE_MODULE="${trade}". Must be one of: ${VALID_MODULES.join(', ')}`
  );
}

module.exports = require(`./${trade}/index.js`);
