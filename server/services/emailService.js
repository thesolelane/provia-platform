// server/services/emailService.js
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const fs = require('fs');
const path = require('path');

// Returns an array of owner emails parsed from OWNER_EMAIL (comma-separated)
function getOwnerEmails() {
  const raw = process.env.OWNER_EMAIL || process.env.REPLY_TO_EMAIL || '';
  return raw.split(',').map(e => e.trim()).filter(Boolean);
}

let mg;
function getMailgun() {
  if (!mg && process.env.MAILGUN_API_KEY) {
    const mailgun = new Mailgun(formData);
    mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY });
  }
  return mg;
}

function logEmail(db, { messageId, to, subject, emailType, jobId }) {
  try {
    db.prepare(
      'INSERT INTO email_log (message_id, to_address, subject, email_type, job_id) VALUES (?, ?, ?, ?, ?)'
    ).run(messageId || null, Array.isArray(to) ? to.join(', ') : to, subject || null, emailType || 'general', jobId || null);
  } catch (e) {
    console.error('[EmailLog] Failed to log email:', e.message);
  }
}

async function sendEmail({ to, subject, html, text, attachmentPath, attachmentName, replyTo, emailType, jobId, db }) {
  const client = getMailgun();
  if (!client) {
    console.log('[Email MOCK] To:', to, 'Subject:', subject);
    return;
  }

  const fromAddress = process.env.BOT_EMAIL || 'noreply@preferredbuildersusa.com';
  const ownerEmails = getOwnerEmails();
  const replyToAddress = replyTo || (ownerEmails.length ? ownerEmails.join(', ') : null);

  const messageData = {
    from: `Preferred Builders <${fromAddress}>`,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text: text || html?.replace(/<[^>]+>/g, ''),
    'o:tracking': 'yes',
    'o:tracking-opens': 'yes',
    ...(replyToAddress ? { 'h:Reply-To': replyToAddress } : {})
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
    if (db) {
      logEmail(db, { messageId: result.id, to, subject, emailType, jobId });
    } else {
      try {
        const { getDb } = require('../db/database');
        logEmail(getDb(), { messageId: result.id, to, subject, emailType, jobId });
      } catch (_) {}
    }
    return result;
  } catch (err) {
    console.error('Email send failed:', err.message);
    throw err;
  }
}

module.exports = { sendEmail, getOwnerEmails };
