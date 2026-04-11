// server/services/sseManager.js
// Manages Server-Sent Event connections so the backend can push status changes to the dashboard instantly

const clients = new Set();

// Channel-namespaced client sets for isolated SSE streams
const channelClients = new Map();

function addClient(res) {
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

function notifyClients(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

// Add a client to a named channel (isolated from the global pool)
function addChannelClient(channel, res) {
  if (!channelClients.has(channel)) {
    channelClients.set(channel, new Set());
  }
  channelClients.get(channel).add(res);
}

// Remove a client from a named channel
function removeChannelClient(channel, res) {
  const set = channelClients.get(channel);
  if (set) set.delete(res);
}

// Broadcast an event only to subscribers of a named channel
function notifyChannelClients(channel, event, data) {
  const set = channelClients.get(channel);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      set.delete(res);
    }
  }
}

module.exports = {
  addClient,
  removeClient,
  notifyClients,
  addChannelClient,
  removeChannelClient,
  notifyChannelClients,
};
