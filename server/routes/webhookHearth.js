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
  if (!process.env.HEARTH_WEBHOOK_SECRET) return true; // Skip if not configured
  const sig = req.headers['x-hearth-signature'];
  const expected = crypto
    .createHmac('sha256', process.env.HEARTH_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');
  return sig === `sha256=${expected}`;
}

router.post('/', async (req, res) => {
  // Always respond 200 immediately to Hearth
  res.status(200).json({ received: true });

  try {
    if (!verifyHearthSignature(req)) {
      console.warn('Invalid Hearth webhook signature');
      return;
    }

    const event = req.body;
    console.log('Hearth webhook received:', event.type || event.event);

    // Only process estimate completion events
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

  // Extract estimate data from Hearth payload
  // Hearth API structure may vary — adapt these field names to match actual Hearth API
  const estimateData = event.estimate || event.data || event;

  const jobId = uuidv4();
  const hearthId = estimateData.id || estimateData.estimate_id || 'unknown';
  const customerName = estimateData.customer?.name || estimateData.client_name || '';
  const customerEmail = estimateData.customer?.email || estimateData.client_email || '';
  const customerPhone = estimateData.customer?.phone || estimateData.client_phone || '';
  const projectAddress = estimateData.project_address || estimateData.address || '';
  const projectCity = extractCity(projectAddress);
  const totalValue = estimateData.total || estimateData.total_amount || 0;

  // Format raw estimate as readable text for Claude
  const rawText = formatHearthData(estimateData);

  // Save job to database
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

  // Notify Jackson via WhatsApp (in Portuguese)
  const jacksonMsg = `📋 *Nova estimativa recebida do Hearth!*\n\n` +
    `Cliente: ${customerName}\n` +
    `Endereço: ${projectAddress}\n` +
    `Valor estimado: $${totalValue?.toLocaleString() || 'TBD'}\n\n` +
    `Estou processando agora... ⏳\n` +
    `Job ID: ${jobId}`;

  await sendWhatsApp(process.env.JACKSON_WHATSAPP, jacksonMsg);

  // Update status
  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('processing', jobId);

  // Process with Claude
  const proposalData = await processEstimate(rawText, jobId, 'pt-BR');

  if (!proposalData.readyToGenerate && proposalData.clarificationsNeeded?.length > 0) {
    // Need clarifications from Jackson
    await handleClarificationsNeeded(jobId, proposalData, db);
  } else {
    // Ready to generate — save and notify
    await handleProposalReady(jobId, proposalData, customerName, projectAddress, db);
  }
}

async function handleClarificationsNeeded(jobId, proposalData, db) {
  const questions = proposalData.clarificationsNeeded;

  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('clarification', jobId);

  // Save questions
  const insertQ = db.prepare('INSERT INTO clarifications (job_id, question) VALUES (?, ?)');
  for (const q of questions) insertQ.run(jobId, q);

  // Format questions for Jackson (in Portuguese)
  const questionText = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');

  const msg = `⚠️ *Preciso de mais informações para o Job ${jobId.slice(0,8)}*\n\n` +
    `Por favor responda:\n\n${questionText}\n\n` +
    `_Responda a esta mensagem com suas respostas_`;

  await sendWhatsApp(process.env.JACKSON_WHATSAPP, msg);
  logAudit(jobId, 'clarifications_requested', `${questions.length} questions sent to Jackson`, 'bot');
}

async function handleProposalReady(jobId, proposalData, customerName, projectAddress, db) {
  const { generatePDF } = require('../services/pdfService');

  // Save proposal data
  db.prepare('UPDATE jobs SET proposal_data = ?, total_value = ?, deposit_amount = ?, status = ? WHERE id = ?')
    .run(JSON.stringify(proposalData), proposalData.totalValue, proposalData.depositAmount, 'proposal_ready', jobId);

  // Generate PDF
  const pdfPath = await generatePDF(proposalData, 'proposal', jobId);
  db.prepare('UPDATE jobs SET proposal_pdf_path = ? WHERE id = ?').run(pdfPath, jobId);
  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('proposal_sent', jobId);

  const flaggedCount = proposalData.flaggedItems?.length || 0;
  const flagNote = flaggedCount > 0
    ? `\n\n⚠️ *${flaggedCount} item(s) marcado(s) para revisão*`
    : '';

  // WhatsApp to Jackson (Portuguese)
  const jacksonMsg = `✅ *Proposta pronta!*\n\n` +
    `Cliente: ${customerName}\n` +
    `Endereço: ${projectAddress}\n` +
    `Total: $${proposalData.totalValue?.toLocaleString()}\n` +
    `Depósito: $${proposalData.depositAmount?.toLocaleString()}\n` +
    `${flagNote}\n\n` +
    `Responda *APROVAR* para enviar ao cliente\n` +
    `Responda *REVISAR* para fazer alterações\n` +
    `Responda *REVISAR: [suas alterações]* para editar`;

  await sendWhatsApp(process.env.JACKSON_WHATSAPP, jacksonMsg, pdfPath);

  // WhatsApp to Owner (English)
  if (process.env.OWNER_WHATSAPP) {
    const ownerMsg = `📋 *Proposal Ready for Review*\n\n` +
      `Customer: ${customerName}\n` +
      `Project: ${projectAddress}\n` +
      `Total: $${proposalData.totalValue?.toLocaleString()}\n` +
      `Deposit: $${proposalData.depositAmount?.toLocaleString()}\n` +
      `${flaggedCount > 0 ? `⚠️ ${flaggedCount} item(s) flagged for review` : '✅ No issues flagged'}\n\n` +
      `Waiting for Jackson's approval.`;
    await sendWhatsApp(process.env.OWNER_WHATSAPP, ownerMsg, pdfPath);
  }

  logAudit(jobId, 'proposal_generated', `Proposal sent for review. Total: $${proposalData.totalValue}`, 'bot');
}

function formatHearthData(data) {
  // Convert Hearth API data structure to readable text for Claude
  // Adapt field names to match actual Hearth API response
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
