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
      host: process.env.SMTP_HOST || 'smtp.contactpreferred.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
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

  const fromAddress = process.env.SMTP_USER || process.env.BOT_EMAIL || 'noreply@contactpreferred.com';
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

  const appUrl = process.env.APP_URL || '';
  let pixelId = null;

  if (html && appUrl) {
    const { v4: uuidv4 } = require('uuid');
    pixelId = uuidv4();
    const pixel = `<img src="${appUrl}/api/track/o/${pixelId}" width="1" height="1" style="display:none" alt="" />`;
    messageData.html = html + pixel;
  }

  try {
    const result = await transport.sendMail(messageData);
    const messageId = pixelId || result.messageId;
    console.log('Email sent:', result.messageId);
    const dbInstance = db || (() => { try { return require('../db/database').getDb(); } catch (_) { return null; } })();
    if (dbInstance) logEmail(dbInstance, { messageId, to, subject, emailType, jobId });
    return { id: messageId };
  } catch (err) {
    console.error('Email send failed:', err.message);
    throw err;
  }
}

module.exports = { sendEmail, getOwnerEmails };
