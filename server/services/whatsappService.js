// server/services/whatsappService.js
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');

let twilioClient;

function getClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_LIVE_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    if (apiKey && apiSecret && accountSid) {
      twilioClient = twilio(apiKey, apiSecret, { accountSid });
    } else if (accountSid) {
      const token = process.env.TWILIO_LIVE_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
      twilioClient = twilio(accountSid, token);
    }
  }
  return twilioClient;
}

async function sendWhatsApp(to, message, attachmentPath = null) {
  const client = getClient();
  if (!client) {
    console.log('[WhatsApp MOCK]', to, ':', message);
    return;
  }

  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || '';
  const params = {
    from: fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`,
    to,
    body: message
  };

  if (attachmentPath && fs.existsSync(attachmentPath)) {
    // Attachment must be publicly accessible URL
    // In production, upload to S3/CDN or serve from your domain
    const filename = path.basename(attachmentPath);
    params.mediaUrl = [`${process.env.APP_URL}/outputs/${filename}`];
  }

  try {
    const result = await client.messages.create(params);
    console.log(`WhatsApp sent to ${to}: ${result.sid}`);
    return result;
  } catch (err) {
    console.error('WhatsApp send failed:', err.message);
  }
}

module.exports = { sendWhatsApp };
