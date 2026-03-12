// server/routes/webhookWhatsapp.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { handleClarification, generateContract } = require('../services/claudeService');
const { sendWhatsApp } = require('../services/whatsappService');
const { generatePDF } = require('../services/pdfService');
const { sendEmail } = require('../services/emailService');
const { logAudit } = require('../services/auditService');
const pdfParse = require('pdf-parse');
const https = require('https');
const http = require('http');

// Download media from Twilio (requires basic auth)
function downloadTwilioMedia(url) {
  return new Promise((resolve, reject) => {
    const accountSid = process.env.TWILIO_LIVE_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_LIVE_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { Authorization: `Basic ${auth}` } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return downloadTwilioMedia(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

// Submit a new estimate from WhatsApp (PDF or text)
async function handleNewEstimateSubmission(rawText, from, db, sender, senderName, language) {
  const isPortuguese = language === 'pt-BR';
  const jobId = uuidv4();
  const shortId = jobId.slice(0, 8).toUpperCase();

  db.prepare(`
    INSERT INTO jobs (id, raw_estimate_data, status, submitted_by)
    VALUES (?, ?, 'received', ?)
  `).run(jobId, rawText, from);

  logAudit(jobId, 'estimate_received', `WhatsApp submission from ${senderName}`, from);

  await sendWhatsApp(from, isPortuguese
    ? `👍 Recebi, ${senderName}! Analisando o orçamento agora... (Ref #${shortId})`
    : `👍 Got it, ${senderName}! Analyzing the estimate now... (Ref #${shortId})`
  );

  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('processing', jobId);

  const { processEstimate } = require('../services/claudeService');
  const proposalData = await processEstimate(rawText, jobId, language);

  if (!proposalData.readyToGenerate && proposalData.clarificationsNeeded?.length > 0) {
    const insertQ = db.prepare('INSERT INTO clarifications (job_id, question) VALUES (?, ?)');
    for (const q of proposalData.clarificationsNeeded) insertQ.run(jobId, q);

    db.prepare('UPDATE jobs SET status = ?, proposal_data = ? WHERE id = ?')
      .run('awaiting_start', jobId, JSON.stringify(proposalData));

    const questionCount = proposalData.clarificationsNeeded.length;
    const customerName = proposalData.customer?.name;
    const customerLabel = customerName ? ` para *${customerName}*` : '';

    await sendWhatsApp(from, isPortuguese
      ? `📋 Orçamento #${shortId}${customerLabel} recebido!\n\nTenho ${questionCount} pergunta${questionCount !== 1 ? 's' : ''} antes de gerar a proposta. Responda *SIM* para começarmos!`
      : `📋 Estimate #${shortId}${customerName ? ` for *${customerName}*` : ''} received!\n\nI have ${questionCount} question${questionCount !== 1 ? 's' : ''} before I can generate the proposal. Reply *YES* and let's get started!`
    );
  } else {
    // Ready — generate straight away
    const pdfPath = await generatePDF(proposalData, 'proposal', jobId);
    db.prepare('UPDATE jobs SET proposal_data = ?, proposal_pdf_path = ?, total_value = ?, deposit_amount = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(proposalData), pdfPath, proposalData.totalValue, proposalData.depositAmount, 'proposal_sent', jobId);

    await sendWhatsApp(from,
      isPortuguese
        ? `✅ Proposta pronta, ${senderName}!\n\nCliente: ${proposalData.customer?.name || 'N/A'}\nTotal: $${proposalData.totalValue?.toLocaleString()}\nDepósito: $${proposalData.depositAmount?.toLocaleString()}\n\nResponda *APROVAR* para gerar o contrato.`
        : `✅ Proposal ready, ${senderName}!\n\nCustomer: ${proposalData.customer?.name || 'N/A'}\nTotal: $${proposalData.totalValue?.toLocaleString()}\nDeposit: $${proposalData.depositAmount?.toLocaleString()}\n\nReply *APPROVE* to generate the contract.`,
      pdfPath
    );
  }
}

// Extract first name from full name
function firstName(fullName) {
  if (!fullName) return 'there';
  return fullName.split(' ')[0];
}

// Detect affirmative responses (yes / sim / sure / yeah / yep / ok / go)
function isYes(text) {
  return /^(yes|yep|yeah|sure|ok|okay|go|ready|sim|claro|pode|bora|vamos|s|y)\b/i.test(text.trim());
}

// Detect negative responses
function isNo(text) {
  return /^(no|nope|not now|later|nao|não|n)\b/i.test(text.trim());
}

async function handleIncomingWhatsApp(data) {
  try {
    const from = data.From;
    const body = (data.Body || '').trim();
    const mediaUrl = data.MediaUrl0;
    const mediaContentType = data.MediaContentType0 || '';

    console.log('WhatsApp processing:', { From: from, Body: body?.substring(0, 50), hasMedia: !!mediaUrl });

    const db = getDb();
    const sender = db.prepare('SELECT * FROM approved_senders WHERE identifier = ? AND active = 1').get(from);
    if (!sender) {
      console.warn(`Blocked WhatsApp from unapproved number: ${from}`);
      return;
    }

    const senderName = firstName(sender.name);
    const language = sender.language || 'en';
    const isPortuguese = language === 'pt-BR';
    const upperBody = body.toUpperCase().trim();

    // ── PDF ATTACHMENT — treat as new estimate submission ─────────────
    if (mediaUrl && (mediaContentType.includes('pdf') || mediaContentType.includes('application'))) {
      try {
        await sendWhatsApp(from, isPortuguese
          ? `📎 Recebi o PDF, ${senderName}! Extraindo o orçamento... aguarde um momento.`
          : `📎 Got the PDF, ${senderName}! Extracting the estimate... give me a moment.`
        );
        const { buffer } = await downloadTwilioMedia(mediaUrl);
        const parsed = await pdfParse(buffer);
        const rawText = parsed.text.trim();
        if (rawText.length < 50) {
          await sendWhatsApp(from, isPortuguese
            ? `⚠️ Não consegui extrair texto do PDF. Tente enviar como texto ou use um PDF com texto pesquisável.`
            : `⚠️ Couldn't extract text from that PDF. Try sending it as text or use a searchable PDF.`
          );
          return;
        }
        await handleNewEstimateSubmission(rawText, from, db, sender, senderName, language);
      } catch (err) {
        console.error('PDF attachment error:', err);
        await sendWhatsApp(from, isPortuguese
          ? `❌ Erro ao processar o PDF. Tente novamente ou envie o texto do orçamento.`
          : `❌ Error processing the PDF. Try again or paste the estimate text directly.`
        );
      }
      return;
    }

    // ── NEW: command — submit estimate as text ────────────────────────
    if (upperBody.startsWith('NEW:') || upperBody.startsWith('NOVO:') || upperBody.startsWith('ESTIMATE:')) {
      const rawText = body.substring(body.indexOf(':') + 1).trim();
      if (rawText.length < 20) {
        await sendWhatsApp(from, isPortuguese
          ? `⚠️ Por favor inclua os detalhes do orçamento após NOVO: — ex: *NOVO: Cliente João, banheiro completo, 150 sqft, azulejo, vanity...*`
          : `⚠️ Please include the estimate details after NEW: — e.g. *NEW: Client John Smith, full bathroom remodel, 150 sqft, tile, vanity...*`
        );
        return;
      }
      await handleNewEstimateSubmission(rawText, from, db, sender, senderName, language);
      return;
    }

    // Find any active job for this sender (includes awaiting_start now)
    const activeJob = db.prepare(`
      SELECT * FROM jobs 
      WHERE (submitted_by = ? OR submitted_by = 'hearth_api')
      AND status IN ('awaiting_start', 'clarification', 'proposal_ready', 'proposal_sent')
      ORDER BY created_at DESC LIMIT 1
    `).get(sender.role === 'pm' ? 'hearth_api' : sender.identifier);

    // ── APPROVE ──────────────────────────────────────────────────────
    if (upperBody === 'APROVAR' || upperBody === 'APPROVE') {
      if (!activeJob) {
        await sendWhatsApp(from, isPortuguese
          ? `⚠️ Nenhuma proposta encontrada aguardando aprovação.`
          : `⚠️ No proposal found waiting for approval.`
        );
        return;
      }
      await handleApproval(activeJob, from, db, language, senderName);
      return;
    }

    // ── REVISE ───────────────────────────────────────────────────────
    if (upperBody === 'REVISAR' || upperBody === 'REVISE') {
      await sendWhatsApp(from, isPortuguese
        ? `✏️ Claro, ${senderName}! O que você gostaria de alterar na proposta?\n\nDescreva as mudanças e eu vou regenerar.`
        : `✏️ Sure, ${senderName}! What would you like to change in the proposal?\n\nDescribe the changes and I'll regenerate it.`
      );
      return;
    }

    if (upperBody.startsWith('REVISAR:') || upperBody.startsWith('REVISE:')) {
      const changes = body.substring(body.indexOf(':') + 1).trim();
      if (activeJob) {
        await handleRevision(activeJob, changes, from, db, language, senderName);
      }
      return;
    }

    // ── STATUS ───────────────────────────────────────────────────────
    if (upperBody === 'STATUS') {
      const jobs = db.prepare(`
        SELECT customer_name, project_address, total_value, status, created_at 
        FROM jobs ORDER BY created_at DESC LIMIT 5
      `).all();

      const statusEmoji = { awaiting_start: '⏳', clarification: '❓', proposal_ready: '📄', proposal_sent: '📤', customer_approved: '✅', contract_ready: '📋' };
      const lines = jobs.map(j =>
        `${statusEmoji[j.status] || '•'} ${j.customer_name || 'Unknown'} — ${j.status} — $${j.total_value?.toLocaleString() || 'TBD'}`
      );

      await sendWhatsApp(from, isPortuguese
        ? `📊 *Últimos Jobs, ${senderName}:*\n\n${lines.join('\n')}`
        : `📊 *Recent Jobs, ${senderName}:*\n\n${lines.join('\n')}`
      );
      return;
    }

    // ── HELP ─────────────────────────────────────────────────────────
    if (upperBody === 'HELP' || upperBody === 'AJUDA') {
      await sendWhatsApp(from, isPortuguese
        ? `🤖 *Olá ${senderName}! Comandos disponíveis:*\n\n📎 *Envie um PDF* — Enviar orçamento como PDF diretamente\nNOVO: [detalhes] — Enviar orçamento como texto\nSIM — Iniciar perguntas de clarificação\nAPROVAR — Aprovar proposta atual\nREVISAR — Revisar proposta\nREVISAR: [mudanças] — Revisar com detalhes\nSTATUS — Ver jobs recentes\nAJUDA — Este menu\n\nOu simplesmente escreva sua pergunta!`
        : `🤖 *Hey ${senderName}! Available commands:*\n\n📎 *Send a PDF* — Attach estimate PDF directly\nNEW: [details] — Submit estimate as text\nYES — Start clarification questions\nAPPROVE — Approve current proposal\nREVISE — Revise proposal\nREVISE: [changes] — Revise with details\nSTATUS — View recent jobs\nHELP — This menu\n\nOr just type your question!`
      );
      return;
    }

    // ── AWAITING START — waiting for yes/no to begin questions ───────
    if (activeJob && activeJob.status === 'awaiting_start') {
      if (isYes(body)) {
        // Start the first question
        const firstQ = db.prepare(
          'SELECT * FROM clarifications WHERE job_id = ? AND answer IS NULL ORDER BY asked_at ASC LIMIT 1'
        ).get(activeJob.id);
        const totalQ = db.prepare('SELECT COUNT(*) as count FROM clarifications WHERE job_id = ?').get(activeJob.id);

        db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('clarification', activeJob.id);

        if (firstQ) {
          const shortId = activeJob.id.slice(0, 8).toUpperCase();
          const customerLabel = activeJob.customer_name ? ` for *${activeJob.customer_name}*` : '';

          await sendWhatsApp(from, isPortuguese
            ? `Ótimo, ${senderName}! Vamos começar.\n\n📋 Pré-orçamento #${shortId}${customerLabel}\n\n❓ Pergunta 1 de ${totalQ.count}:\n${firstQ.question}`
            : `Great, ${senderName}! Let's do it.\n\n📋 Pre-quote #${shortId}${customerLabel}\n\n❓ Question 1 of ${totalQ.count}:\n${firstQ.question}`
          );
        } else {
          // No questions — just process it
          await sendWhatsApp(from, isPortuguese
            ? `Perfeito! Gerando a proposta agora...`
            : `Perfect! Generating the proposal now...`
          );
          await finishClarifications(activeJob, from, db, language, senderName);
        }
      } else if (isNo(body)) {
        const shortId = activeJob.id.slice(0, 8).toUpperCase();
        await sendWhatsApp(from, isPortuguese
          ? `Tudo bem, ${senderName}! Quando quiser continuar, me responda *SIM* e pegamos de onde paramos. O pré-orçamento #${shortId} está aguardando.`
          : `No problem, ${senderName}! Just reply *YES* when you're ready and we'll pick right up. Pre-quote #${shortId} is waiting for you.`
        );
      } else {
        // Ambiguous — re-prompt
        const shortId = activeJob.id.slice(0, 8).toUpperCase();
        await sendWhatsApp(from, isPortuguese
          ? `Ei ${senderName}, tenho um pré-orçamento (#${shortId}) esperando. Responda *SIM* quando tiver um momento para trabalharmos juntos nisso!`
          : `Hey ${senderName}, I have pre-quote #${shortId} waiting. Reply *YES* when you have a moment and we'll work through it together!`
        );
      }
      return;
    }

    // ── CLARIFICATION REPLY — answering questions one at a time ──────
    if (activeJob && activeJob.status === 'clarification') {
      await handleClarificationReply(activeJob, body, from, db, language, senderName);
      return;
    }

    // ── GENERAL CHAT ─────────────────────────────────────────────────
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

    let userMessage = body;
    if (activeJob) {
      userMessage = `[Context: Active job for ${activeJob.customer_name || 'unknown customer'} at ${activeJob.project_address || 'unknown address'}, status: ${activeJob.status}, estimate data: ${(activeJob.raw_estimate_data || '').substring(0, 500)}]\n\n${body}`;
    }
    messages.push({ role: 'user', content: userMessage });

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

// ── APPROVAL ─────────────────────────────────────────────────────────────
async function handleApproval(job, from, db, language, senderName) {
  const isPortuguese = language === 'pt-BR';

  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('customer_approved', job.id);
  logAudit(job.id, 'proposal_approved', 'Approved via WhatsApp', from);

  await sendWhatsApp(from, isPortuguese
    ? `✅ Perfeito, ${senderName}! Gerando o contrato completo agora...\n\nIsso leva cerca de 1 minuto.`
    : `✅ Perfect, ${senderName}! Generating the full contract now...\n\nThis takes about a minute.`
  );

  try {
    const proposalData = JSON.parse(job.proposal_data);
    const contractData = await generateContract(proposalData, job.id, language);

    const contractPDF = await generatePDF(contractData, 'contract', job.id);
    db.prepare('UPDATE jobs SET contract_data = ?, contract_pdf_path = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(contractData), contractPDF, 'contract_ready', job.id);

    const summary = isPortuguese
      ? `📄 *Contrato pronto, ${senderName}!*\n\n` +
        `Cliente: ${job.customer_name}\n` +
        `Total: $${contractData.totalValue?.toLocaleString()}\n` +
        `Depósito: $${contractData.depositAmount?.toLocaleString()}\n\n` +
        `Pronto para enviar ao cliente. ✅`
      : `📄 *Contract ready, ${senderName}!*\n\n` +
        `Customer: ${job.customer_name}\n` +
        `Total: $${contractData.totalValue?.toLocaleString()}\n` +
        `Deposit: $${contractData.depositAmount?.toLocaleString()}\n\n` +
        `Ready to send to the customer. ✅`;

    await sendWhatsApp(from, summary, contractPDF);
    if (process.env.OWNER_WHATSAPP && from !== process.env.OWNER_WHATSAPP) {
      const ownerSender = db.prepare("SELECT * FROM approved_senders WHERE identifier = ? AND active = 1").get(process.env.OWNER_WHATSAPP);
      const ownerName = firstName(ownerSender?.name || 'Cooper');
      await sendWhatsApp(process.env.OWNER_WHATSAPP,
        `Hey ${ownerName}! 📄 Contract generated for *${job.customer_name}* — $${contractData.totalValue?.toLocaleString()}. All good!`,
        contractPDF
      );
    }

    logAudit(job.id, 'contract_generated', `Contract ready. Total: $${contractData.totalValue}`, 'bot');

  } catch (err) {
    console.error('Contract generation error:', err);
    await sendWhatsApp(from, isPortuguese
      ? `❌ Erro ao gerar o contrato. Tente novamente ou acesse o painel de administração.`
      : `❌ Error generating the contract. Please try again or check the admin panel.`
    );
  }
}

// ── CLARIFICATION REPLY — one question at a time with confirmation ────────
async function handleClarificationReply(job, answer, from, db, language, senderName) {
  const isPortuguese = language === 'pt-BR';

  // Save the answer to the current pending question
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

  const totalQ = db.prepare('SELECT COUNT(*) as count FROM clarifications WHERE job_id = ?').get(job.id);
  const answeredCount = totalQ.count - remaining.count;

  if (remaining.count === 0) {
    // All answered — generate proposal
    const confirmation = isPortuguese
      ? `✅ Anotei: *"${answer}"*\n\nPerfeito, ${senderName}! Isso é tudo que eu precisava. Gerando a proposta agora...`
      : `✅ Got it! I wrote down: *"${answer}"*\n\nThat's everything I needed, ${senderName}! Generating the proposal now...`;

    await sendWhatsApp(from, confirmation);
    await finishClarifications(job, from, db, language, senderName);

  } else {
    // Ask next question with confirmation of what was just received
    const nextQ = db.prepare(
      'SELECT * FROM clarifications WHERE job_id = ? AND answer IS NULL ORDER BY asked_at ASC LIMIT 1'
    ).get(job.id);

    const confirmation = isPortuguese
      ? `✅ Anotei: *"${answer}"*\n\n❓ Pergunta ${answeredCount + 1} de ${totalQ.count}:\n${nextQ.question}`
      : `✅ Got it! I wrote down: *"${answer}"*\n\n❓ Question ${answeredCount + 1} of ${totalQ.count}:\n${nextQ.question}`;

    await sendWhatsApp(from, confirmation);
  }
}

// ── FINISH CLARIFICATIONS — reprocess and generate proposal ───────────────
async function finishClarifications(job, from, db, language, senderName) {
  const isPortuguese = language === 'pt-BR';

  try {
    const allAnswers = db.prepare('SELECT question, answer FROM clarifications WHERE job_id = ?').all(job.id);
    const answersText = allAnswers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');
    const rawEstimate = job.raw_estimate_data || '';

    const { processEstimate } = require('../services/claudeService');
    const proposalData = await processEstimate(
      `${rawEstimate}\n\nCLARIFICATION ANSWERS:\n${answersText}`,
      job.id, language
    );

    const pdfPath = await generatePDF(proposalData, 'proposal', job.id);

    db.prepare('UPDATE jobs SET proposal_data = ?, proposal_pdf_path = ?, total_value = ?, deposit_amount = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(proposalData), pdfPath, proposalData.totalValue, proposalData.depositAmount, 'proposal_sent', job.id);

    const shortId = job.id.slice(0, 8).toUpperCase();

    const msg = isPortuguese
      ? `🎉 *Proposta pronta, ${senderName}!*\n\n` +
        `📋 Pré-orçamento #${shortId}\n` +
        `Cliente: ${job.customer_name || 'N/A'}\n` +
        `💰 Total: $${proposalData.totalValue?.toLocaleString()}\n` +
        `📦 Depósito: $${proposalData.depositAmount?.toLocaleString()}\n\n` +
        `Responda *APROVAR* para gerar o contrato ou *REVISAR* para fazer alterações.`
      : `🎉 *Proposal ready, ${senderName}!*\n\n` +
        `📋 Pre-quote #${shortId}\n` +
        `Customer: ${job.customer_name || 'N/A'}\n` +
        `💰 Total: $${proposalData.totalValue?.toLocaleString()}\n` +
        `📦 Deposit: $${proposalData.depositAmount?.toLocaleString()}\n\n` +
        `Reply *APPROVE* to generate the contract or *REVISE* to make changes.`;

    await sendWhatsApp(from, msg, pdfPath);

    // Notify owner if different from sender
    if (process.env.OWNER_WHATSAPP && from !== process.env.OWNER_WHATSAPP) {
      const ownerSender = db.prepare("SELECT * FROM approved_senders WHERE identifier = ? AND active = 1").get(process.env.OWNER_WHATSAPP);
      const ownerName = firstName(ownerSender?.name || 'Cooper');
      await sendWhatsApp(process.env.OWNER_WHATSAPP,
        `Hey ${ownerName}! 📋 Proposal ready for *${job.customer_name}* — $${proposalData.totalValue?.toLocaleString()}. Waiting on approval.`,
        pdfPath
      );
    }

  } catch (err) {
    console.error('Error finishing clarifications:', err);
    await sendWhatsApp(from, isPortuguese
      ? `❌ Erro ao gerar a proposta. Tente novamente.`
      : `❌ Error generating the proposal. Please try again.`
    );
  }
}

// ── REVISION ─────────────────────────────────────────────────────────────
async function handleRevision(job, changes, from, db, language, senderName) {
  const isPortuguese = language === 'pt-BR';
  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('processing', job.id);

  await sendWhatsApp(from, isPortuguese
    ? `✏️ Entendido, ${senderName}! Revisando a proposta com as suas alterações...`
    : `✏️ On it, ${senderName}! Revising the proposal with your changes...`
  );

  const rawEstimate = job.raw_estimate_data || '';
  const { processEstimate } = require('../services/claudeService');
  const revised = await processEstimate(
    `${rawEstimate}\n\nREVISION REQUESTED:\n${changes}`,
    job.id, language
  );

  const pdfPath = await generatePDF(revised, 'proposal', job.id);

  db.prepare('UPDATE jobs SET proposal_data = ?, proposal_pdf_path = ?, total_value = ?, deposit_amount = ?, status = ? WHERE id = ?')
    .run(JSON.stringify(revised), pdfPath, revised.totalValue, revised.depositAmount, 'proposal_sent', job.id);

  await sendWhatsApp(from, isPortuguese
    ? `✅ Proposta revisada, ${senderName}!\nTotal atualizado: $${revised.totalValue?.toLocaleString()}\n\nResponda *APROVAR* para gerar o contrato.`
    : `✅ Revised proposal ready, ${senderName}!\nUpdated total: $${revised.totalValue?.toLocaleString()}\n\nReply *APPROVE* to generate the contract.`,
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
