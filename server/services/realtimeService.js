let ioInstance = null;

function setIO(io) {
  ioInstance = io;
}

function notifyJobUpdate(jobId, eventType, data = {}) {
  if (!ioInstance) return;
  ioInstance.emit(`job:${jobId}`, { eventType, data, timestamp: new Date().toISOString() });
}

module.exports = { setIO, notifyJobUpdate };
