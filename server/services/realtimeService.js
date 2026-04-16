let ioInstance = null;

function setIO(io) {
  ioInstance = io;
}

function notifyJobUpdate(jobId, eventType, data = {}) {
  if (!ioInstance) return;
  const room = String(jobId);
  const payload = { eventType, data, timestamp: new Date().toISOString() };
  ioInstance.to(room).emit(`job:${room}`, payload);
}

module.exports = { setIO, notifyJobUpdate };
