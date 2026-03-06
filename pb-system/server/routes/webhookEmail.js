// server/routes/webhookEmail.js
// Receives inbound emails via Mailgun webhook (fallback trigger)
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { processEstimate } = require('../services/claudeService');
const { sendWhatsApp } = require('../services/whatsappService');
const { sendEmail } = require('../services/emailService');
const { logAudit } = require('../services/auditService');
const pdfParse = require('pdf-parse');

router.post('/', async (req, res) => {
  res.status(200).json({ received: true });

  try {
    const from = (req.body.from || req.body.sender || '').toLowerCase();
    const subject = req.body.subject || '';
    const bodyText = req.body['body-plain'] || req.body.text || '';

    const db = getDb();
    const sender = db.prepare('SELECT * FROM approved_senders WHERE identifier = ? AND type = ? AND active = 1').get(from, 'email');

    if (!sender) {
      console.log(`Blocked inbound email from: ${from}`);
      return;
    }

    console.log(`Inbound email from approved sender: ${from} | Subject: ${subject}`);

    // Check for PDF attachment
    let estimateText = bodyText;
    const attachmentCount = parseInt(req.body['attachment-count'] || '0');

    if (attachmentCount > 0 && req.files) {
      for (let i = 1; i <= attachmentCount; i++) {
        const attachment = req.files[`attachment-${i}`];
        if (attachment && attachment.mimetype === 'application/pdf') {
          try {
            const parsed = await pdfParse(attachment.data);
            estimateText = parsed.text + '\n\n' + bodyText;
            break;
          } catch (e) {
            console.error('PDF parse error:', e.message);
          }
        }
      }
    }

    const jobId = uuidv4();
    const language = sender.language || 'en';

    db.prepare(`
      INSERT INTO jobs (id, raw_estimate_data, status, submitted_by)
      VALUES (?, ?, 'received', ?)
    `).run(jobId, estimateText, from);

    // Acknowledge receipt
    await sendEmail({
      to: from,
      subject: `Re: ${subject} — Received ✅`,
      html: language === 'pt-BR'
        ? `<p>Olá Jackson,</p><p>Estimativa recebida! Estou processando agora e você receberá a proposta em breve.</p><p>Job ID: ${jobId}</p>`
        : `<p>Estimate received! Processing now. You'll receive the proposal shortly.</p><p>Job ID: ${jobId}</p>`
    });

    const proposalData = await processEstimate(estimateText, jobId, language);

    if (proposalData.readyToGenerate === false && proposalData.clarificationsNeeded?.length > 0) {
      db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('clarification', jobId);
      const questions = proposalData.clarificationsNeeded.map((q, i) => `${i + 1}. ${q}`).join('\n');

      await sendEmail({
        to: from,
        subject: `Questions needed — Job ${jobId.slice(0, 8)}`,
        html: language === 'pt-BR'
          ? `<p>Preciso de mais informações:</p><pre>${questions}</pre><p>Por favor responda este email.</p>`
          : `<p>I need a few more details:</p><pre>${questions}</pre><p>Please reply to this email.</p>`
      });
    } else {
      const { generatePDF } = require('../services/pdfService');
      const pdfPath = await generatePDF(proposalData, 'proposal', jobId);

      db.prepare('UPDATE jobs SET proposal_data = ?, proposal_pdf_path = ?, total_value = ?, deposit_amount = ?, status = ? WHERE id = ?')
        .run(JSON.stringify(proposalData), pdfPath, proposalData.totalValue, proposalData.depositAmount, 'proposal_sent', jobId);

      const recipients = [from];
      if (process.env.OWNER_EMAIL && !recipients.includes(process.env.OWNER_EMAIL)) {
        recipients.push(process.env.OWNER_EMAIL);
      }

      await sendEmail({
        to: recipients,
        subject: `Proposal Ready — ${proposalData.customer?.name || 'New Job'} | $${proposalData.totalValue?.toLocaleString()}`,
        html: `<p>Proposal generated successfully.</p>
               <p><strong>Customer:</strong> ${proposalData.customer?.name}</p>
               <p><strong>Address:</strong> ${proposalData.project?.address}</p>
               <p><strong>Total:</strong> $${proposalData.totalValue?.toLocaleString()}</p>
               <p><strong>Deposit:</strong> $${proposalData.depositAmount?.toLocaleString()}</p>
               ${proposalData.flaggedItems?.length ? `<p>⚠️ ${proposalData.flaggedItems.length} item(s) flagged for review</p>` : ''}
               <p>See attached PDF. Reply APPROVE to generate the contract.</p>`,
        attachmentPath: pdfPath
      });

      if (process.env.JACKSON_WHATSAPP) {
        await sendWhatsApp(process.env.JACKSON_WHATSAPP,
          `📋 Proposta pronta via email!\n${proposalData.customer?.name}\n$${proposalData.totalValue?.toLocaleString()}\nResponda APROVAR para gerar contrato.`
        );
      }

      logAudit(jobId, 'proposal_generated_email', `Via email trigger from ${from}`, 'bot');
    }
  } catch (err) {
    console.error('Email webhook error:', err);
  }
});

module.exports = router;
