const twilio = require('twilio');
const { claimMessage } = require('./msgDedup');

let pollerClient;
let lastPollTime = new Date();
let pollingInterval = null;

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

async function fetchMediaForMessage(client, messageSid) {
  try {
    const mediaList = await client.messages(messageSid).media.list({ limit: 5 });
    if (!mediaList || mediaList.length === 0) return {};

    const first = mediaList[0];
    const accountSid = process.env.TWILIO_LIVE_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
    const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}/Media/${first.sid}`;

    return {
      MediaUrl0: mediaUrl,
      MediaContentType0: first.contentType || 'application/octet-stream',
    };
  } catch (err) {
    console.error('Error fetching media:', err.message);
    return {};
  }
}

function startPolling(handleIncoming, intervalMs = 5000) {
  if (pollingInterval) return;

  const sandboxNumber = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';
  const toNumber = sandboxNumber.startsWith('whatsapp:')
    ? sandboxNumber
    : `whatsapp:${sandboxNumber}`;

  console.log(`📡 WhatsApp poller started (every ${intervalMs / 1000}s) watching ${toNumber}`);

  lastPollTime = new Date(Date.now() - 10000);

  pollingInterval = setInterval(async () => {
    try {
      const client = getPollerClient();
      if (!client) return;

      const messages = await client.messages.list({
        to: toNumber,
        dateSentAfter: lastPollTime,
        limit: 10,
      });

      const inbound = messages.filter((m) => m.direction === 'inbound');

      for (const msg of inbound) {
        if (!claimMessage(msg.sid)) continue;
        console.log(
          `📥 Polled message: ${msg.from} -> "${msg.body?.substring(0, 50)}" numMedia=${msg.numMedia}`,
        );

        const fakeBody = {
          From: msg.from,
          Body: msg.body || '',
          To: msg.to,
          MessageSid: msg.sid,
          NumMedia: msg.numMedia || 0,
        };

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
        const newest = messages.reduce((a, b) => (a.dateCreated > b.dateCreated ? a : b));
        if (newest.dateCreated > lastPollTime) {
          lastPollTime = newest.dateCreated;
        }
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
