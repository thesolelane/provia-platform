// server/services/sseManager.js
// Manages Server-Sent Event connections so the backend can push status changes to the dashboard instantly

const clients = new Set();

function addClient(res) {
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

function notifyClients(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

module.exports = { addClient, removeClient, notifyClients };
