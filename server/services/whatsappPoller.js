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

// Fetch media URL and content type for a message that has attachments
async function fetchMediaForMessage(client, messageSid) {
  try {
    const mediaList = await client.messages(messageSid).media.list({ limit: 5 });
    if (!mediaList || mediaList.length === 0) return {};

    const first = mediaList[0];
    const accountSid = process.env.TWILIO_LIVE_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
    const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}/Media/${first.sid}`;

    return {
      MediaUrl0: mediaUrl,
      MediaContentType0: first.contentType || 'application/octet-stream'
    };
  } catch (err) {
    console.error('Error fetching media:', err.message);
    return {};
  }
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
        console.log(`📥 Polled message: ${msg.from} -> "${msg.body?.substring(0, 50)}" numMedia=${msg.numMedia}`);

        // Build the data object that mirrors a Twilio webhook POST body
        const fakeBody = {
          From: msg.from,
          Body: msg.body || '',
          To: msg.to,
          MessageSid: msg.sid,
          NumMedia: msg.numMedia || 0
        };

        // Fetch actual media URLs if this message has attachments
        if (Number(msg.numMedia) > 0) {
          console.log(`📎 Message ${msg.sid} has ${msg.numMedia} attachment(s), fetching media...`);
          const media = await fetchMediaForMessage(client, msg.sid);
          Object.assign(fakeBody, media);
          console.log(`📎 Media content type: ${fakeBody.MediaContentType0}`);
        }

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
