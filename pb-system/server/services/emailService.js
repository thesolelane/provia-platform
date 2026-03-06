// server/services/emailService.js
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const fs = require('fs');
const path = require('path');

let mg;
function getMailgun() {
  if (!mg && process.env.MAILGUN_API_KEY) {
    const mailgun = new Mailgun(formData);
    mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY });
  }
  return mg;
}

async function sendEmail({ to, subject, html, text, attachmentPath, attachmentName }) {
  const client = getMailgun();
  if (!client) {
    console.log('[Email MOCK] To:', to, 'Subject:', subject);
    return;
  }

  const messageData = {
    from: `Preferred Builders AI <${process.env.BOT_EMAIL || 'noreply@preferredbuildersusa.com'}>`,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text: text || html?.replace(/<[^>]+>/g, '')
  };

  if (attachmentPath && fs.existsSync(attachmentPath)) {
    messageData.attachment = {
      filename: attachmentName || path.basename(attachmentPath),
      data: fs.readFileSync(attachmentPath)
    };
  }

  try {
    const domain = process.env.MAILGUN_DOMAIN || 'mg.preferredbuildersusa.com';
    const result = await client.messages.create(domain, messageData);
    console.log('Email sent:', result.id);
    return result;
  } catch (err) {
    console.error('Email send failed:', err.message);
    throw err;
  }
}

module.exports = { sendEmail };
