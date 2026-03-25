// server/services/emailService.js
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

function getOwnerEmails() {
  const raw = process.env.OWNER_EMAIL || process.env.REPLY_TO_EMAIL || '';
  return raw.split(',').map(e => e.trim()).filter(Boolean);
}

let transporter;
function getTransporter() {
  if (!transporter && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
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

  const transport = getTransporter();
  if (!transport) {
    console.log('[Email MOCK] To:', to, 'Subject:', subject);
    return;
  }

  const fromAddress = process.env.SMTP_USER || process.env.BOT_EMAIL || 'noreply@preferredbuilders.com';
  const ownerEmails = getOwnerEmails();
  const replyToAddress = replyTo || (ownerEmails.length ? ownerEmails.join(', ') : undefined);

  const messageData = {
    from: `Preferred Builders <${fromAddress}>`,
    to: validRecipients,
    subject,
    html,
    text: text || html?.replace(/<[^>]+>/g, ''),
    ...(replyToAddress ? { replyTo: replyToAddress } : {})
  };

  if (attachmentPath && fs.existsSync(attachmentPath)) {
    messageData.attachments = [{
      filename: attachmentName || path.basename(attachmentPath),
      path: attachmentPath
    }];
  }

  try {
    const result = await transport.sendMail(messageData);
    const messageId = result.messageId;
    console.log('Email sent:', messageId);
    if (db) {
      logEmail(db, { messageId, to, subject, emailType, jobId });
    } else {
      try {
        const { getDb } = require('../db/database');
        logEmail(getDb(), { messageId, to, subject, emailType, jobId });
      } catch (_) {}
    }
    return { id: messageId };
  } catch (err) {
    console.error('Email send failed:', err.message);
    throw err;
  }
}

module.exports = { sendEmail, getOwnerEmails };
