// server/services/whatsappService.js
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');

let twilioClient;

function getClient() {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
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
