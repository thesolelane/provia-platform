const twilio = require('twilio');

let pollerClient;
let lastPollTime = new Date();
let pollingInterval = null;
const processedMessages = new Set();

function getPollerClient() {
  if (!pollerClient) {
    const accountSid = process.env.TWILIO_LIVE_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    if (apiKey && apiSecret && accountSid) {
      pollerClient = twilio(apiKey, apiSecret, { accountSid });
    } else if (accountSid) {
      const token = process.env.TWILIO_LIVE_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
      pollerClient = twilio(accountSid, token);
    }
  }
  return pollerClient;
}

function startPolling(handleIncoming, intervalMs = 5000) {
  if (pollingInterval) return;

  const sandboxNumber = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';
  const toNumber = sandboxNumber.startsWith('whatsapp:') ? sandboxNumber : `whatsapp:${sandboxNumber}`;

  console.log(`📡 WhatsApp poller started (every ${intervalMs / 1000}s) watching ${toNumber}`);

  lastPollTime = new Date(Date.now() - 10000);

  pollingInterval = setInterval(async () => {
    try {
      const client = getPollerClient();
      if (!client) return;

      const messages = await client.messages.list({
        to: toNumber,
        dateSentAfter: lastPollTime,
        limit: 10
      });

      const inbound = messages.filter(m => m.direction === 'inbound' && !processedMessages.has(m.sid));

      for (const msg of inbound) {
        processedMessages.add(msg.sid);
        console.log(`📥 Polled message: ${msg.from} -> "${msg.body?.substring(0, 50)}"`);

        const fakeBody = {
          From: msg.from,
          Body: msg.body || '',
          To: msg.to,
          MessageSid: msg.sid,
          NumMedia: msg.numMedia,
          MediaUrl0: msg.media && msg.media().list ? undefined : undefined
        };

        try {
          await handleIncoming(fakeBody);
        } catch (err) {
          console.error('Poller handler error:', err.message);
        }
      }

      if (messages.length > 0) {
        const newest = messages.reduce((a, b) => a.dateCreated > b.dateCreated ? a : b);
        if (newest.dateCreated > lastPollTime) {
          lastPollTime = newest.dateCreated;
        }
      }

      if (processedMessages.size > 500) {
        const arr = [...processedMessages];
        arr.splice(0, arr.length - 200);
        processedMessages.clear();
        arr.forEach(s => processedMessages.add(s));
      }

    } catch (err) {
      console.error('Poller error:', err.message);
    }
  }, intervalMs);
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('📡 WhatsApp poller stopped');
  }
}

module.exports = { startPolling, stopPolling };
