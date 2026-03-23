// server/services/errorLogger.js
// Keeps a rolling in-memory buffer of recent server errors

const MAX_ERRORS = 50;
const errors = [];

function captureError(message, source) {
  errors.push({
    ts: new Date().toISOString(),
    source: source || 'server',
    message: String(message).slice(0, 500)
  });
  if (errors.length > MAX_ERRORS) errors.shift();
}

function getRecentErrors(limit = 20) {
  return errors.slice(-limit).reverse();
}

function clearErrors() {
  errors.length = 0;
}

// Patch console.error so all server errors are captured automatically
const _origError = console.error.bind(console);
console.error = (...args) => {
  _origError(...args);
  captureError(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
};

// Also capture unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  captureError('Unhandled rejection: ' + (reason?.message || reason), 'process');
});

module.exports = { captureError, getRecentErrors, clearErrors };
