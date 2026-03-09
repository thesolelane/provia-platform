// server/routes/jobs.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');
const { generatePDF } = require('../services/pdfService');
const { sendWhatsApp } = require('../services/whatsappService');
const { sendEmail } = require('../services/emailService');
const { logAudit } = require('../services/auditService');

// GET all jobs
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { status, limit = 50, offset = 0 } = req.query;
  let query = 'SELECT * FROM jobs';
  const params = [];
  if (status) { query += ' WHERE status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  const jobs = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM jobs' + (status ? ' WHERE status = ?' : '')).get(...(status ? [status] : []));
  res.json({ jobs, total: total.count });
});

// GET single job with full detail
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const conversations = db.prepare('SELECT * FROM conversations WHERE job_id = ? ORDER BY created_at ASC').all(req.params.id);
  const clarifications = db.prepare('SELECT * FROM clarifications WHERE job_id = ? ORDER BY asked_at ASC').all(req.params.id);
  const auditLog = db.prepare('SELECT * FROM audit_log WHERE job_id = ? ORDER BY created_at ASC').all(req.params.id);

  // Parse JSON fields
  if (job.proposal_data) { try { job.proposal_data = JSON.parse(job.proposal_data); } catch {} }
  if (job.contract_data) { try { job.contract_data = JSON.parse(job.contract_data); } catch {} }
  if (job.flagged_items) { try { job.flagged_items = JSON.parse(job.flagged_items); } catch {} }

  res.json({ job, conversations, clarifications, auditLog });
});

// POST approve proposal → generate contract
router.post('/:id/approve', requireAuth, async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.proposal_data) return res.status(400).json({ error: 'No proposal to approve' });

  try {
    db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('customer_approved', job.id);

    const { generateContract } = require('../services/claudeService');
    const proposalData = JSON.parse(job.proposal_data);
    const contractData = await generateContract(proposalData, job.id, 'en');

    const contractPDF = await generatePDF(contractData, 'contract', job.id);
    db.prepare('UPDATE jobs SET contract_data = ?, contract_pdf_path = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(contractData), contractPDF, 'contract_ready', job.id);

    logAudit(job.id, 'contract_generated', 'Contract approved via admin panel', 'admin');
    res.json({ success: true, message: 'Contract generated', contractPDF: `/outputs/${require('path').basename(contractPDF)}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send contract to customer
router.post('/:id/send-to-customer', requireAuth, async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.contract_pdf_path) return res.status(400).json({ error: 'No contract PDF ready' });

  try {
    await sendEmail({
      to: job.customer_email,
      subject: `Your Project Proposal — Preferred Builders General Services`,
      html: `
        <p>Dear ${job.customer_name},</p>
        <p>Thank you for choosing Preferred Builders General Services Inc. Please find your project contract attached for review.</p>
        <p>Please review the document carefully. If you have any questions, please contact us at 978-377-1784.</p>
        <p>Best regards,<br>Jackson Deaquino<br>Preferred Builders General Services Inc.<br>LIC# HIC-197400</p>
      `,
      attachmentPath: job.contract_pdf_path,
      attachmentName: `PB_Contract_${job.customer_name?.replace(/\s/g, '_')}.pdf`
    });

    db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('contract_sent', job.id);
    logAudit(job.id, 'contract_sent_to_customer', `Contract emailed to ${job.customer_email}`, 'admin');
    res.json({ success: true, message: `Contract sent to ${job.customer_email}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST manual estimate input (fallback if no Hearth/Wave)
router.post('/manual', requireAuth, async (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const db = getDb();
  const { customerName, customerEmail, customerPhone, projectAddress, estimateText } = req.body;

  const jobId = uuidv4();
  db.prepare(`
    INSERT INTO jobs (id, customer_name, customer_email, customer_phone, project_address, raw_estimate_data, status, submitted_by)
    VALUES (?, ?, ?, ?, ?, ?, 'received', 'manual')
  `).run(jobId, customerName, customerEmail, customerPhone, projectAddress, estimateText);

  res.json({ jobId, status: 'received', message: 'Job created. Processing estimate...' });

  const { processEstimate } = require('../services/claudeService');
  (async () => {
    try {
      console.log(`[Manual Job ${jobId}] Starting Claude processEstimate...`);
      db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('processing', jobId);

      const proposalData = await processEstimate(estimateText, jobId, 'en');
      console.log(`[Manual Job ${jobId}] Claude returned proposal. readyToGenerate=${proposalData.readyToGenerate}`);

      if (proposalData.readyToGenerate === false && proposalData.clarificationsNeeded?.length > 0) {
        db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('clarification', jobId);
        const insertQ = db.prepare('INSERT INTO clarifications (job_id, question) VALUES (?, ?)');
        for (const q of proposalData.clarificationsNeeded) {
          insertQ.run(jobId, q);
        }
        console.log(`[Manual Job ${jobId}] Status: clarification (${proposalData.clarificationsNeeded.length} questions)`);

        const ownerWhatsApp = process.env.COOPER_WHATSAPP_NUMBER;
        if (ownerWhatsApp) {
          const to = ownerWhatsApp.startsWith('whatsapp:') ? ownerWhatsApp : `whatsapp:${ownerWhatsApp}`;
          const firstQ = proposalData.clarificationsNeeded[0];
          const total = proposalData.clarificationsNeeded.length;
          await sendWhatsApp(to, `Hey! 👋 I'm working on the estimate for *${customerName}* at ${projectAddress} but I'm missing a few details.\n\nI'll ask you one question at a time — just reply and I'll move to the next one.\n\n❓ Question 1 of ${total}:\n${firstQ}`);
        }
      } else {
        const pdfPath = await generatePDF(proposalData, 'proposal', jobId);
        db.prepare('UPDATE jobs SET proposal_data = ?, proposal_pdf_path = ?, total_value = ?, deposit_amount = ?, status = ? WHERE id = ?')
          .run(JSON.stringify(proposalData), pdfPath, proposalData.totalValue, proposalData.depositAmount, 'proposal_ready', jobId);
        logAudit(jobId, 'manual_estimate_processed', `Manual entry by admin`, 'admin');
        console.log(`[Manual Job ${jobId}] Status: proposal_ready. Total: $${proposalData.totalValue}`);
      }
    } catch (err) {
      console.error(`[Manual Job ${jobId}] ERROR:`, err.message, err.stack);
      db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('error', jobId);
    }
  })();
});

// POST answer a clarification question
router.post('/:id/clarify/:clarId', requireAuth, async (req, res) => {
  const db = getDb();
  const { answer } = req.body;
  if (!answer) return res.status(400).json({ error: 'Answer is required' });

  db.prepare('UPDATE clarifications SET answer = ?, answered_at = CURRENT_TIMESTAMP WHERE id = ? AND job_id = ?')
    .run(answer, req.params.clarId, req.params.id);

  const remaining = db.prepare(
    'SELECT COUNT(*) as count FROM clarifications WHERE job_id = ? AND answer IS NULL'
  ).get(req.params.id);

  if (remaining.count === 0) {
    res.json({ success: true, allAnswered: true, message: 'All questions answered. Generating proposal...' });

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (job) {
      (async () => {
        try {
          console.log(`[Job ${job.id}] All clarifications answered. Generating proposal...`);
          db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('processing', job.id);

          const allAnswers = db.prepare('SELECT question, answer FROM clarifications WHERE job_id = ?').all(job.id);
          const answersText = allAnswers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');
          const rawEstimate = job.raw_estimate_data || '';

          const { processEstimate } = require('../services/claudeService');
          const proposalData = await processEstimate(
            `${rawEstimate}\n\nCLARIFICATION ANSWERS:\n${answersText}`,
            job.id, 'en'
          );

          const pdfPath = await generatePDF(proposalData, 'proposal', job.id);
          db.prepare('UPDATE jobs SET proposal_data = ?, proposal_pdf_path = ?, total_value = ?, deposit_amount = ?, status = ? WHERE id = ?')
            .run(JSON.stringify(proposalData), pdfPath, proposalData.totalValue, proposalData.depositAmount, 'proposal_ready', job.id);
          logAudit(job.id, 'proposal_generated', `Proposal generated after clarification`, 'admin');
          console.log(`[Job ${job.id}] Proposal ready. Total: $${proposalData.totalValue}`);
        } catch (err) {
          console.error(`[Job ${job.id}] Proposal generation error:`, err.message);
          db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('error', job.id);
        }
      })();
    }
  } else {
    res.json({ success: true, allAnswered: false, remaining: remaining.count });
  }
});

// PATCH update job notes
router.patch('/:id/notes', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE jobs SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.body.notes, req.params.id);
  res.json({ success: true });
});

// GET job stats for dashboard
router.get('/stats/summary', requireAuth, (req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as count FROM jobs').get();
  const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM jobs GROUP BY status').all();
  const totalValue = db.prepare("SELECT SUM(total_value) as total FROM jobs WHERE status NOT IN ('received')").get();
  const thisMonth = db.prepare(`SELECT COUNT(*) as count, SUM(total_value) as value FROM jobs WHERE created_at >= date('now','start of month')`).get();
  res.json({ total: total.count, byStatus, totalValue: totalValue.total || 0, thisMonth });
});

module.exports = router;
