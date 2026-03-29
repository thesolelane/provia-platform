const http = require('http');

let keepAliveInterval = null;

function startKeepAlive(port, intervalMs = 5 * 60 * 1000) {
  if (keepAliveInterval) return;

  console.log(`🏓 Keep-alive service started (pinging /health every ${intervalMs / 1000}s)`);

  keepAliveInterval = setInterval(() => {
    const req = http.get(`http://localhost:${port}/health`, (res) => {
      if (res.statusCode === 200) {
        console.log(`[${new Date().toISOString()}] Keep-alive ping OK (HTTP ${res.statusCode})`);
      } else {
        console.warn(
          `[${new Date().toISOString()}] Keep-alive ping returned unexpected status: ${res.statusCode}`
        );
      }
      res.resume();
    });

    req.on('error', (err) => {
      console.warn(`[${new Date().toISOString()}] Keep-alive ping failed: ${err.message}`);
    });

    req.end();
  }, intervalMs);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('🏓 Keep-alive service stopped');
  }
}

module.exports = { startKeepAlive, stopKeepAlive };
