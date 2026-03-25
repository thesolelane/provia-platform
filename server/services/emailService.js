// server/services/emailService.js
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

// Returns an array of owner emails parsed from OWNER_EMAIL (comma-separated)
function getOwnerEmails() {
  const raw = process.env.OWNER_EMAIL || process.env.REPLY_TO_EMAIL || '';
  return raw.split(',').map(e => e.trim()).filter(Boolean);
}

let resendClient;
function getResend() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
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
  const recipients = Array.isArray(to) ? to : [to];
  const validRecipients = recipients.filter(addr => addr && typeof addr === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr.trim()));
  if (validRecipients.length === 0) {
    console.warn('[Email] Skipped — no valid recipients in:', recipients);
    return;
  }

  const client = getResend();
  if (!client) {
    console.log('[Email MOCK] To:', to, 'Subject:', subject);
    return;
  }

  const fromAddress = process.env.BOT_EMAIL || 'noreply@preferredbuildersusa.com';
  const ownerEmails = getOwnerEmails();
  const replyToAddress = replyTo || (ownerEmails.length ? ownerEmails.join(', ') : undefined);

  const messageData = {
    from: `Preferred Builders <${fromAddress}>`,
    to: validRecipients,
    subject,
    html,
    text: text || html?.replace(/<[^>]+>/g, ''),
    ...(replyToAddress ? { reply_to: replyToAddress } : {})
  };

  if (attachmentPath && fs.existsSync(attachmentPath)) {
    const fileData = fs.readFileSync(attachmentPath);
    messageData.attachments = [{
      filename: attachmentName || path.basename(attachmentPath),
      content: fileData
    }];
  }

  try {
    const result = await client.emails.send(messageData);
    if (result.error) {
      throw new Error(result.error.message || JSON.stringify(result.error));
    }
    const messageId = result.data?.id;
    console.log('Email sent:', messageId);
    if (db) {
      logEmail(db, { messageId, to, subject, emailType, jobId });
    } else {
      try {
        const { getDb } = require('../db/database');
        logEmail(getDb(), { messageId, to, subject, emailType, jobId });
      } catch (_) {}
    }
    return result.data;
  } catch (err) {
    console.error('Email send failed:', err.message);
    throw err;
  }
}

module.exports = { sendEmail, getOwnerEmails };
