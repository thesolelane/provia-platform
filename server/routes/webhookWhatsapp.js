const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { getDb } = require('../db/database');
const { handleClarification, generateContract } = require('../services/claudeService');
const { sendWhatsApp } = require('../services/whatsappService');
const { generatePDF } = require('../services/pdfService');
const { sendEmail } = require('../services/emailService');
const { logAudit } = require('../services/auditService');

async function handleIncomingWhatsApp(data) {
  try {
    const from = data.From;
    const body = (data.Body || '').trim();
    const mediaUrl = data.MediaUrl0;

    console.log('WhatsApp processing:', { From: from, Body: body?.substring(0, 50) });

    const db = getDb();
    const sender = db.prepare('SELECT * FROM approved_senders WHERE identifier = ? AND active = 1').get(from);
    if (!sender) {
      console.warn(`Blocked WhatsApp from unapproved number: ${from}`);
      return;
    }

    const upperBody = body.toUpperCase().trim();
    const language = sender.language || 'en';
    const isPortuguese = language === 'pt-BR';

    const activeJob = db.prepare(`
      SELECT * FROM jobs 
      WHERE (submitted_by = ? OR submitted_by = 'hearth_api')
      AND status IN ('clarification', 'proposal_ready', 'proposal_sent')
      ORDER BY created_at DESC LIMIT 1
    `).get(sender.role === 'pm' ? 'hearth_api' : sender.identifier);

    if (upperBody === 'APROVAR' || upperBody === 'APPROVE') {
      if (!activeJob) {
        await sendWhatsApp(from, isPortuguese
          ? '⚠️ Nenhuma proposta encontrada aguardando aprovação.'
          : '⚠️ No proposal found awaiting approval.'
        );
        return;
      }
      await handleApproval(activeJob, from, db, language);
      return;
    }

    if (upperBody === 'REVISAR' || upperBody === 'REVISE') {
      await sendWhatsApp(from, isPortuguese
        ? `✏️ O que você gostaria de alterar na proposta?\n\nPor favor descreva as mudanças e eu vou regenerar.`
        : `✏️ What would you like to change in the proposal?\n\nDescribe the changes and I'll regenerate.`
      );
      return;
    }

    if (upperBody.startsWith('REVISAR:') || upperBody.startsWith('REVISE:')) {
      const changes = body.substring(body.indexOf(':') + 1).trim();
      if (activeJob) {
        await handleRevision(activeJob, changes, from, db, language);
      }
      return;
    }

    if (upperBody === 'STATUS') {
      const jobs = db.prepare(`
        SELECT customer_name, project_address, total_value, status, created_at 
        FROM jobs ORDER BY created_at DESC LIMIT 5
      `).all();

      const lines = jobs.map(j =>
        `• ${j.customer_name || 'Unknown'} — ${j.status} — $${j.total_value?.toLocaleString() || 'TBD'}`
      );

      await sendWhatsApp(from, isPortuguese
        ? `📊 *Últimos Jobs:*\n\n${lines.join('\n')}`
        : `📊 *Recent Jobs:*\n\n${lines.join('\n')}`
      );
      return;
    }

    if (upperBody === 'HELP' || upperBody === 'AJUDA') {
      await sendWhatsApp(from, isPortuguese
        ? `🤖 *Comandos disponíveis:*\n\nAPROVAR — Aprovar proposta atual\nREVISAR — Revisar proposta\nREVISAR: [mudanças] — Revisar com detalhes\nSTATUS — Ver jobs recentes\nAJUDA — Este menu\n\nOu simplesmente escreva sua pergunta!`
        : `🤖 *Available commands:*\n\nAPPROVE — Approve current proposal\nREVISE — Revise proposal\nREVISE: [changes] — Revise with details\nSTATUS — View recent jobs\nHELP — This menu\n\nOr just ask a question!`
      );
      return;
    }

    if (activeJob && activeJob.status === 'clarification') {
      await handleClarificationReply(activeJob, body, from, db, language);
      return;
    }

    const { adminChat } = require('../services/claudeService');

    const history = db.prepare(`
      SELECT direction, message FROM conversations 
      WHERE job_id = ? AND channel = 'whatsapp'
      ORDER BY created_at DESC LIMIT 10
    `).all(activeJob?.id || 'general');

    const messages = history.reverse().map(h => ({
      role: h.direction === 'inbound' ? 'user' : 'assistant',
      content: h.message
    }));
    messages.push({ role: 'user', content: body });

    const reply = await adminChat(messages, language);
    await sendWhatsApp(from, reply);

    if (activeJob) {
      logConversation(db, activeJob.id, 'inbound', 'whatsapp', from, 'bot', body);
      logConversation(db, activeJob.id, 'outbound', 'whatsapp', 'bot', from, reply);
    }

  } catch (err) {
    console.error('WhatsApp handler error:', err);
  }
}

router.post('/', async (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
  console.log('WhatsApp webhook received:', { From: req.body.From, Body: req.body.Body?.substring(0, 50) });
  await handleIncomingWhatsApp(req.body);
});

async function handleApproval(job, from, db, language) {
  const isPortuguese = language === 'pt-BR';

  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('customer_approved', job.id);
  logAudit(job.id, 'proposal_approved', 'Approved via WhatsApp', from);

  await sendWhatsApp(from, isPortuguese
    ? `✅ Aprovado! Gerando contrato completo com termos legais...\n\nIsso leva cerca de 1 minuto.`
    : `✅ Approved! Generating full contract with legal terms...\n\nThis takes about 1 minute.`
  );

  try {
    const proposalData = JSON.parse(job.proposal_data);
    const contractData = await generateContract(proposalData, job.id, language);

    const contractPDF = await generatePDF(contractData, 'contract', job.id);
    db.prepare('UPDATE jobs SET contract_data = ?, contract_pdf_path = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(contractData), contractPDF, 'contract_ready', job.id);

    const summary = isPortuguese
      ? `📄 *Contrato Pronto!*\n\n` +
        `Cliente: ${job.customer_name}\n` +
        `Total: $${contractData.totalValue?.toLocaleString()}\n` +
        `Depósito: $${contractData.depositAmount?.toLocaleString()}\n\n` +
        `Pronto para enviar ao cliente.`
      : `📄 *Contract Ready!*\n\n` +
        `Customer: ${job.customer_name}\n` +
        `Total: $${contractData.totalValue?.toLocaleString()}\n` +
        `Deposit: $${contractData.depositAmount?.toLocaleString()}\n\n` +
        `Ready to send to customer.`;

    await sendWhatsApp(from, summary, contractPDF);
    if (process.env.OWNER_WHATSAPP && from !== process.env.OWNER_WHATSAPP) {
      await sendWhatsApp(process.env.OWNER_WHATSAPP,
        `📄 Contract generated for ${job.customer_name} — $${contractData.totalValue?.toLocaleString()}`,
        contractPDF
      );
    }

    logAudit(job.id, 'contract_generated', `Contract ready. Total: $${contractData.totalValue}`, 'bot');

  } catch (err) {
    console.error('Contract generation error:', err);
    await sendWhatsApp(from, isPortuguese
      ? `❌ Erro ao gerar contrato. Tente novamente ou acesse o painel de administração.`
      : `❌ Error generating contract. Please try again or check the admin panel.`
    );
  }
}

async function handleClarificationReply(job, answer, from, db, language) {
  const isPortuguese = language === 'pt-BR';

  const pending = db.prepare(
    'SELECT * FROM clarifications WHERE job_id = ? AND answer IS NULL ORDER BY asked_at ASC LIMIT 1'
  ).get(job.id);

  if (pending) {
    db.prepare('UPDATE clarifications SET answer = ?, answered_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(answer, pending.id);
  }

  const remaining = db.prepare(
    'SELECT COUNT(*) as count FROM clarifications WHERE job_id = ? AND answer IS NULL'
  ).get(job.id);

  if (remaining.count === 0) {
    await sendWhatsApp(from, isPortuguese
      ? `✅ Obrigado! Gerando a proposta agora...`
      : `✅ Got it! Generating the proposal now...`
    );

    const allAnswers = db.prepare('SELECT question, answer FROM clarifications WHERE job_id = ?').all(job.id);
    const answersText = allAnswers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');
    const rawEstimate = job.raw_estimate_data || '';

    const { processEstimate } = require('../services/claudeService');
    const proposalData = await processEstimate(
      `${rawEstimate}\n\nCLARIFICATION ANSWERS:\n${answersText}`,
      job.id, language
    );

    const { generatePDF } = require('../services/pdfService');
    const pdfPath = await generatePDF(proposalData, 'proposal', job.id);

    db.prepare('UPDATE jobs SET proposal_data = ?, proposal_pdf_path = ?, total_value = ?, deposit_amount = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(proposalData), pdfPath, proposalData.totalValue, proposalData.depositAmount, 'proposal_sent', job.id);

    const msg = isPortuguese
      ? `✅ *Proposta pronta!*\n\nTotal: $${proposalData.totalValue?.toLocaleString()}\n\nResponda *APROVAR* para gerar o contrato.`
      : `✅ *Proposal ready!*\n\nTotal: $${proposalData.totalValue?.toLocaleString()}\n\nReply *APPROVE* to generate the contract.`;

    await sendWhatsApp(from, msg, pdfPath);
  } else {
    await sendWhatsApp(from, isPortuguese
      ? `✅ Anotado. Mais ${remaining.count} pergunta(s) restante(s)...`
      : `✅ Got it. ${remaining.count} more question(s) remaining...`
    );
  }
}

async function handleRevision(job, changes, from, db, language) {
  const isPortuguese = language === 'pt-BR';
  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('processing', job.id);

  await sendWhatsApp(from, isPortuguese
    ? `✏️ Revisando a proposta...\n\nAlterações: ${changes}`
    : `✏️ Revising the proposal...\n\nChanges: ${changes}`
  );

  const rawEstimate = job.raw_estimate_data || '';
  const { processEstimate } = require('../services/claudeService');
  const revised = await processEstimate(
    `${rawEstimate}\n\nREVISION REQUESTED:\n${changes}`,
    job.id, language
  );

  const { generatePDF } = require('../services/pdfService');
  const pdfPath = await generatePDF(revised, 'proposal', job.id);

  db.prepare('UPDATE jobs SET proposal_data = ?, proposal_pdf_path = ?, total_value = ?, deposit_amount = ?, status = ? WHERE id = ?')
    .run(JSON.stringify(revised), pdfPath, revised.totalValue, revised.depositAmount, 'proposal_sent', job.id);

  await sendWhatsApp(from, isPortuguese
    ? `✅ Proposta revisada!\nTotal: $${revised.totalValue?.toLocaleString()}\n\nResponda *APROVAR* para continuar.`
    : `✅ Revised proposal ready!\nTotal: $${revised.totalValue?.toLocaleString()}\n\nReply *APPROVE* to continue.`,
    pdfPath
  );
}

function logConversation(db, jobId, direction, channel, from, to, message) {
  db.prepare(`
    INSERT INTO conversations (job_id, direction, channel, from_address, to_address, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(jobId, direction, channel, from, to, message);
}

module.exports = router;
module.exports.handleIncomingWhatsApp = handleIncomingWhatsApp;
