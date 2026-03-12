// server/routes/webhookHearth.js
// Triggered when Jackson marks an estimate complete in Hearth

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { processEstimate } = require('../services/claudeService');
const { sendWhatsApp } = require('../services/whatsappService');
const { logAudit } = require('../services/auditService');

// Verify Hearth webhook signature
function verifyHearthSignature(req) {
  if (!process.env.HEARTH_WEBHOOK_SECRET) return true;
  const sig = req.headers['x-hearth-signature'];
  const expected = crypto
    .createHmac('sha256', process.env.HEARTH_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');
  return sig === `sha256=${expected}`;
}

// Extract first name from full name
function firstName(fullName) {
  if (!fullName) return 'there';
  return fullName.split(' ')[0];
}

router.post('/', async (req, res) => {
  res.status(200).json({ received: true });

  try {
    if (!verifyHearthSignature(req)) {
      console.warn('Invalid Hearth webhook signature');
      return;
    }

    const event = req.body;
    console.log('Hearth webhook received:', event.type || event.event);

    const isEstimateComplete =
      event.type === 'estimate.completed' ||
      event.type === 'estimate.finalized' ||
      event.event === 'estimate_completed' ||
      event.status === 'completed';

    if (!isEstimateComplete) {
      console.log('Ignoring non-completion event:', event.type);
      return;
    }

    await processHearthEstimate(event);

  } catch (err) {
    console.error('Hearth webhook error:', err);
  }
});

async function processHearthEstimate(event) {
  const db = getDb();

  const estimateData = event.estimate || event.data || event;

  const jobId = uuidv4();
  const shortId = jobId.slice(0, 8).toUpperCase();
  const hearthId = estimateData.id || estimateData.estimate_id || 'unknown';
  const customerName = estimateData.customer?.name || estimateData.client_name || '';
  const customerEmail = estimateData.customer?.email || estimateData.client_email || '';
  const customerPhone = estimateData.customer?.phone || estimateData.client_phone || '';
  const projectAddress = estimateData.project_address || estimateData.address || '';
  const projectCity = extractCity(projectAddress);
  const totalValue = estimateData.total || estimateData.total_amount || 0;

  const rawText = formatHearthData(estimateData);

  db.prepare(`
    INSERT INTO jobs (
      id, hearth_estimate_id, customer_name, customer_email, 
      customer_phone, project_address, project_city,
      raw_estimate_data, total_value, status, submitted_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?)
  `).run(
    jobId, hearthId, customerName, customerEmail,
    customerPhone, projectAddress, projectCity,
    JSON.stringify(estimateData), totalValue,
    'hearth_api'
  );

  logAudit(jobId, 'estimate_received', `Hearth estimate ${hearthId} received`, 'hearth_api');

  // Get Jackson's sender info for his name
  const jacksonSender = db.prepare(
    "SELECT * FROM approved_senders WHERE identifier = ? AND active = 1"
  ).get(process.env.JACKSON_WHATSAPP);

  const jacksonName = firstName(jacksonSender?.name || 'Jackson');
  const language = jacksonSender?.language || 'pt-BR';
  const isPortuguese = language === 'pt-BR';

  // Process with Claude first (silently) to know if we need clarifications
  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('processing', jobId);
  const proposalData = await processEstimate(rawText, jobId, language);

  if (!proposalData.readyToGenerate && proposalData.clarificationsNeeded?.length > 0) {
    // Save questions to DB
    const insertQ = db.prepare('INSERT INTO clarifications (job_id, question) VALUES (?, ?)');
    for (const q of proposalData.clarificationsNeeded) insertQ.run(jobId, q);

    // Set status to awaiting_start — waiting for Jackson to say yes
    db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('awaiting_start', jobId);

    // Save raw proposal data so we can reprocess later with answers
    db.prepare('UPDATE jobs SET proposal_data = ? WHERE id = ?')
      .run(JSON.stringify(proposalData), jobId);

    const questionCount = proposalData.clarificationsNeeded.length;

    // Conversational intro — ask if they have a moment
    const intro = isPortuguese
      ? `Oi ${jacksonName}! 👋 Recebi um novo pré-orçamento (Ref #${shortId}) para *${customerName || 'novo cliente'}*${projectAddress ? ` em ${projectAddress}` : ''}.\n\nTenho ${questionCount} pergunta${questionCount !== 1 ? 's' : ''} para processar este orçamento — você tem um momento para trabalhar comigo nisso? Responda *SIM* para começar.`
      : `Hey ${jacksonName}! 👋 I just received a new pre-quote (Ref #${shortId}) for *${customerName || 'a new customer'}*${projectAddress ? ` at ${projectAddress}` : ''}.\n\nI have ${questionCount} question${questionCount !== 1 ? 's' : ''} to get this one processed — do you have a moment to work through it with me? Reply *YES* to get started.`;

    await sendWhatsApp(process.env.JACKSON_WHATSAPP, intro);
    logAudit(jobId, 'clarifications_pending', `${questionCount} questions saved, awaiting start`, 'bot');

  } else {
    // Ready to generate — proposal looks complete
    await handleProposalReady(jobId, proposalData, customerName, projectAddress, db, jacksonName, language);
  }
}

async function handleClarificationsNeeded(jobId, proposalData, db, jacksonName, language) {
  // This is now handled inline in processHearthEstimate
  // Kept for compatibility
}

async function handleProposalReady(jobId, proposalData, customerName, projectAddress, db, jacksonName, language) {
  const { generatePDF } = require('../services/pdfService');
  const isPortuguese = language === 'pt-BR';

  db.prepare('UPDATE jobs SET proposal_data = ?, total_value = ?, deposit_amount = ?, status = ? WHERE id = ?')
    .run(JSON.stringify(proposalData), proposalData.totalValue, proposalData.depositAmount, 'proposal_ready', jobId);

  const pdfPath = await generatePDF(proposalData, 'proposal', jobId);
  db.prepare('UPDATE jobs SET proposal_pdf_path = ? WHERE id = ?').run(pdfPath, jobId);
  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('proposal_sent', jobId);

  const flaggedCount = proposalData.flaggedItems?.length || 0;
  const shortId = jobId.slice(0, 8).toUpperCase();

  const jacksonMsg = isPortuguese
    ? `✅ Boa notícia, ${jacksonName}! O pré-orçamento #${shortId} para *${customerName}* ficou completo — sem perguntas pendentes!\n\n` +
      `💰 Total: $${proposalData.totalValue?.toLocaleString()}\n` +
      `📦 Depósito: $${proposalData.depositAmount?.toLocaleString()}\n` +
      `📍 ${projectAddress}\n` +
      (flaggedCount > 0 ? `\n⚠️ ${flaggedCount} item(ns) marcado(s) para revisão\n` : '') +
      `\nResponda *APROVAR* para gerar o contrato ou *REVISAR* para fazer alterações.`
    : `✅ Good news, ${jacksonName}! Pre-quote #${shortId} for *${customerName}* came out clean — no questions needed!\n\n` +
      `💰 Total: $${proposalData.totalValue?.toLocaleString()}\n` +
      `📦 Deposit: $${proposalData.depositAmount?.toLocaleString()}\n` +
      `📍 ${projectAddress}\n` +
      (flaggedCount > 0 ? `\n⚠️ ${flaggedCount} item(s) flagged for review\n` : '') +
      `\nReply *APPROVE* to generate the contract or *REVISE* to make changes.`;

  await sendWhatsApp(process.env.JACKSON_WHATSAPP, jacksonMsg, pdfPath);

  // Notify owner (Cooper) in English
  if (process.env.OWNER_WHATSAPP) {
    const db2 = getDb();
    const ownerSender = db2.prepare("SELECT * FROM approved_senders WHERE identifier = ? AND active = 1").get(process.env.OWNER_WHATSAPP);
    const ownerName = firstName(ownerSender?.name || 'Cooper');

    const ownerMsg = `Hey ${ownerName}! 📋 New proposal ready for review.\n\n` +
      `Customer: *${customerName}*\n` +
      `Address: ${projectAddress}\n` +
      `Total: $${proposalData.totalValue?.toLocaleString()}\n` +
      `Deposit: $${proposalData.depositAmount?.toLocaleString()}\n` +
      (flaggedCount > 0 ? `⚠️ ${flaggedCount} item(s) flagged\n` : '✅ No issues flagged\n') +
      `\nWaiting on Jackson's approval.`;
    await sendWhatsApp(process.env.OWNER_WHATSAPP, ownerMsg, pdfPath);
  }

  logAudit(jobId, 'proposal_generated', `Proposal sent for review. Total: $${proposalData.totalValue}`, 'bot');
}

function formatHearthData(data) {
  const lines = [
    `HEARTH ESTIMATE`,
    `Customer: ${data.customer?.name || data.client_name || 'Unknown'}`,
    `Email: ${data.customer?.email || data.client_email || ''}`,
    `Phone: ${data.customer?.phone || data.client_phone || ''}`,
    `Address: ${data.project_address || data.address || ''}`,
    `Date: ${data.created_at || data.date || new Date().toISOString()}`,
    ``,
    `LINE ITEMS:`,
  ];

  const items = data.line_items || data.items || data.services || [];
  for (const item of items) {
    lines.push(`- ${item.name || item.description}: $${item.amount || item.price || item.total}`);
    if (item.description && item.description !== item.name) {
      lines.push(`  Details: ${item.description}`);
    }
  }

  lines.push(``, `TOTAL: $${data.total || data.total_amount || 0}`);
  if (data.notes) lines.push(`NOTES: ${data.notes}`);

  return lines.join('\n');
}

function extractCity(address) {
  if (!address) return '';
  const parts = address.split(',');
  if (parts.length >= 2) return parts[parts.length - 2].trim();
  return '';
}

module.exports = router;
module.exports.handleProposalReady = handleProposalReady;
