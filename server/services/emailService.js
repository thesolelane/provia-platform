// server/services/emailService.js
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function getOwnerEmails() {
  const raw = process.env.OWNER_EMAIL || process.env.REPLY_TO_EMAIL || '';
  return raw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

function getTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  // .trim() guards against Windows CRLF line endings adding \r to env values
  const smtpHost = (process.env.SMTP_HOST || 'smtp.contactpreferred.com').trim();
  const smtpPort = parseInt((process.env.SMTP_PORT || '587').trim(), 10);
  const smtpUser = process.env.SMTP_USER.trim();
  const smtpPass = process.env.SMTP_PASS.trim();
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    tls: { rejectUnauthorized: false },
    auth: { user: smtpUser, pass: smtpPass },
  });
}

function logEmail(db, { messageId, to, subject, emailType, jobId, htmlBody }) {
  try {
    if (!db) {
      console.error('[EmailLog] No db instance — skipping log');
      return;
    }
    const toAddress = Array.isArray(to) ? to.join(', ') : to || 'unknown';
    db.prepare(
      'INSERT INTO email_log (message_id, to_address, subject, email_type, job_id, html_body) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      messageId || null,
      toAddress,
      subject || null,
      emailType || 'general',
      jobId || null,
      htmlBody || null,
    );
    console.log(`[EmailLog] Logged: type=${emailType} to=${toAddress}`);
  } catch (e) {
    console.error('[EmailLog] Failed to log email:', e.message, '| type:', emailType, '| to:', to);
  }
}

// attachments: array of { path, filename } objects — OR use legacy attachmentPath/attachmentName
async function sendEmail({
  to,
  subject,
  html,
  text,
  attachmentPath,
  attachmentName,
  attachments,
  replyTo,
  emailType,
  jobId,
  db,
}) {
  const recipients = Array.isArray(to) ? to : [to];
  const validRecipients = recipients.filter(
    (addr) => addr && typeof addr === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr.trim()),
  );
  if (validRecipients.length === 0) {
    console.warn('[Email] Skipped — no valid recipients in:', recipients);
    return;
  }

  const transport = getTransporter();
  if (!transport) {
    console.log('[Email MOCK] To:', to, 'Subject:', subject);
    return;
  }

  const fromAddress =
    process.env.SMTP_USER || process.env.BOT_EMAIL || 'noreply@contactpreferred.com';
  const ownerEmails = getOwnerEmails();
  const replyToAddress = replyTo || (ownerEmails.length ? ownerEmails.join(', ') : undefined);
  const ownerReceiptAddress = ownerEmails.length ? ownerEmails[0] : fromAddress;

  const messageData = {
    from: `Preferred Builders <${fromAddress}>`,
    to: validRecipients,
    subject,
    html,
    text: text || html?.replace(/<[^>]+>/g, ''),
    ...(replyToAddress ? { replyTo: replyToAddress } : {}),
    headers: {
      'Disposition-Notification-To': ownerReceiptAddress,
      'Return-Receipt-To': ownerReceiptAddress,
      'X-Confirm-Reading-To': ownerReceiptAddress,
    },
  };

  // Build attachments list — supports both array and legacy single-attachment params
  const allAttachments = [];
  if (attachmentPath && fs.existsSync(attachmentPath)) {
    allAttachments.push({
      filename: attachmentName || path.basename(attachmentPath),
      path: attachmentPath,
    });
  }
  if (Array.isArray(attachments)) {
    for (const a of attachments) {
      if (a?.path && fs.existsSync(a.path)) {
        allAttachments.push({ filename: a.filename || path.basename(a.path), path: a.path });
      }
    }
  }
  if (allAttachments.length) messageData.attachments = allAttachments;

  const appUrl =
    process.env.APP_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '');
  let pixelId = null;

  if (html && appUrl) {
    pixelId = uuidv4();
    const pixel = `<img src="${appUrl}/api/track/o/${pixelId}" width="1" height="1" style="display:none" alt="" />`;
    messageData.html = html + pixel;
  }

  try {
    const result = await transport.sendMail(messageData);
    const messageId = pixelId || result.messageId;
    console.log('Email sent:', result.messageId);
    let dbInstance = db;
    if (!dbInstance) {
      try {
        dbInstance = require('../db/database').getDb();
      } catch (dbErr) {
        console.error('[EmailLog] Could not get DB instance:', dbErr.message);
      }
    }
    // Store original html (before pixel injection) — wiped automatically on contract signing
    const htmlBody = emailType === 'system_alert' ? null : html || null;
    logEmail(dbInstance, { messageId, to, subject, emailType, jobId, htmlBody });
    return { id: messageId };
  } catch (err) {
    console.error('Email send failed:', err.message);
    throw err;
  }
}

module.exports = { sendEmail, getOwnerEmails };
