'use strict';
const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const path     = require('path');
const { getDb }      = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logAudit }   = require('../services/auditService');
const { sendEmail }  = require('../services/emailService');
const { notifyClients } = require('../services/sseManager');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clientIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
}

function baseURL(req) {
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}`;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}`;
}

function pdfPublicURL(pdfPath) {
  if (!pdfPath) return null;
  return `/outputs/${path.basename(pdfPath)}`;
}

// ─── Signing page HTML generator ──────────────────────────────────────────────

function signingPageHTML({ docType, job, session, base }) {
  const isProposal = docType === 'proposal';
  const docLabel   = isProposal ? 'Proposal' : 'Contract';
  const pdfURL     = pdfPublicURL(isProposal ? job.proposal_pdf_path : job.contract_pdf_path);
  const amount     = job.total_value ? `$${Number(job.total_value).toLocaleString()}` : '';
  const already    = session.status === 'signed';

  const alreadySigned = `
    <div style="text-align:center;padding:60px 20px">
      <div style="font-size:64px;margin-bottom:20px">✅</div>
      <h2 style="color:#1B3A6B;margin-bottom:10px">Already Signed</h2>
      <p style="color:#555;font-size:14px">This document was signed on ${new Date(session.signed_at).toLocaleString()}.<br>Thank you!</p>
    </div>`;

  const formHTML = `
    ${pdfURL ? `
    <div style="margin-bottom:24px">
      <p style="font-size:12px;color:#888;margin-bottom:6px;text-align:center">
        Scroll through the full ${docLabel.toLowerCase()} before signing
      </p>
      <iframe src="${pdfURL}" style="width:100%;height:540px;border:1px solid #C8D4E4;border-radius:8px;background:#f5f5f5"></iframe>
    </div>` : `
    <div style="background:#f8f9ff;border:1px solid #C8D4E4;border-radius:8px;padding:20px;margin-bottom:24px;font-size:13px;color:#444">
      <strong>Document details:</strong><br>
      Customer: ${job.customer_name || '—'}<br>
      Property: ${job.project_address || '—'}<br>
      ${amount ? `Contract Value: ${amount}` : ''}
    </div>`}

    <div style="background:#f8f9ff;border-left:4px solid #1B3A6B;padding:14px 16px;margin-bottom:20px;border-radius:0 8px 8px 0">
      <p style="margin:0;font-size:13px;color:#1B3A6B;font-weight:700">
        ${isProposal
          ? 'By signing below, you approve this proposal and authorize Preferred Builders General Services Inc. to proceed with contract preparation.'
          : 'By signing below, you acknowledge that you have read, understand, and agree to all terms and conditions of this Home Improvement Construction Contract.'}
      </p>
    </div>

    <div style="margin-bottom:16px">
      <label style="font-size:12px;font-weight:700;color:#333;display:block;margin-bottom:6px">Your Full Name</label>
      <input id="signerName" type="text" placeholder="Type your full name"
        style="width:100%;padding:10px 12px;border:1.5px solid #C8D4E4;border-radius:6px;font-size:14px;box-sizing:border-box;outline:none"
        onfocus="this.style.borderColor='#1B3A6B'" onblur="this.style.borderColor='#C8D4E4'">
    </div>

    <div style="margin-bottom:8px">
      <label style="font-size:12px;font-weight:700;color:#333;display:block;margin-bottom:6px">Signature</label>
      <div style="position:relative">
        <canvas id="sigPad" width="640" height="180"
          style="width:100%;height:180px;border:1.5px solid #C8D4E4;border-radius:6px;background:white;cursor:crosshair;touch-action:none;display:block"></canvas>
        <button onclick="clearSig()" type="button"
          style="position:absolute;top:8px;right:8px;background:white;border:1px solid #ddd;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;color:#888">
          Clear
        </button>
      </div>
      <p style="font-size:11px;color:#aaa;margin:4px 0 0">Sign with your mouse or finger</p>
    </div>

    <div style="margin:16px 0">
      <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:12px;color:#444">
        <input id="agreeCheck" type="checkbox" style="margin-top:2px;flex-shrink:0">
        <span>I confirm that I have read and reviewed this ${docLabel.toLowerCase()} and my electronic signature constitutes a legally binding agreement under the Electronic Signatures in Global and National Commerce Act (E-SIGN).</span>
      </label>
    </div>

    <div id="errMsg" style="color:#C62828;font-size:12px;margin-bottom:10px;display:none"></div>

    <button id="submitBtn" onclick="submitSig()" type="button"
      style="width:100%;padding:14px;background:#1B3A6B;color:white;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:.3px">
      ✍️ ${isProposal ? 'Approve &amp; Sign Proposal' : 'Sign Contract'}
    </button>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${docLabel} — Preferred Builders General Services Inc.</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #f4f6fb; min-height: 100vh; }
    .hdr { background: #1B3A6B; color: white; padding: 16px 24px; display: flex; align-items: center; gap: 14px; }
    .hdr .co { font-size: 15px; font-weight: 700; }
    .hdr .sub { font-size: 11px; opacity: .75; margin-top: 2px; }
    .badge { background: rgba(255,255,255,.15); border-radius: 20px; padding: 4px 12px; font-size: 11px; margin-left: auto; }
    .card { max-width: 720px; margin: 28px auto; background: white; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.10); padding: 32px; }
    .doc-title { font-size: 20px; font-weight: 800; color: #1B3A6B; margin-bottom: 4px; }
    .doc-sub { font-size: 12px; color: #888; margin-bottom: 24px; }
    .info-row { display: flex; gap: 24px; background: #f8f9ff; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .info-item .lbl { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: .5px; }
    .info-item .val { font-size: 13px; font-weight: 600; color: #1B3A6B; margin-top: 2px; }
    .ftr { text-align: center; padding: 20px; font-size: 11px; color: #aaa; }
  </style>
</head>
<body>

<div class="hdr">
  <div>
    <div class="co">Preferred Builders General Services Inc.</div>
    <div class="sub">HIC-197400 · CSL CS-121662 · 37 Duck Mill Rd, Fitchburg MA · 978-377-1784</div>
  </div>
  <div class="badge">🔒 Secure Document</div>
</div>

<div class="card">
  <div class="doc-title">${isProposal ? 'Project Proposal — Approval & Signature' : 'Construction Contract — Signature'}</div>
  <div class="doc-sub">${isProposal ? 'Review and approve your project proposal' : 'Review and sign your construction contract'}</div>

  <div class="info-row">
    <div class="info-item"><div class="lbl">Customer</div><div class="val">${job.customer_name || '—'}</div></div>
    <div class="info-item"><div class="lbl">Property</div><div class="val">${job.project_address || '—'}${job.project_city ? ', ' + job.project_city : ''}</div></div>
    ${amount ? `<div class="info-item"><div class="lbl">${isProposal ? 'Proposal Value' : 'Contract Value'}</div><div class="val">${amount}</div></div>` : ''}
  </div>

  ${already ? alreadySigned : formHTML}
</div>

<div class="ftr">
  This is a secure, encrypted document link for ${job.customer_name || 'the authorized signatory'} only.<br>
  Preferred Builders General Services Inc. · HIC-197400 · <a href="https://preferredbuildersusa.com" style="color:#aaa">preferredbuildersusa.com</a>
</div>

${already ? '' : `
<script>
(function() {
  // ── Record open on page load ──
  fetch('/api/signing/opened/${session.token}', { method: 'POST' }).catch(()=>{});

  // ── Signature pad ──
  const canvas = document.getElementById('sigPad');
  const ctx    = canvas.getContext('2d');
  let drawing  = false;
  let hasSig   = false;

  function scale() {
    const r = canvas.getBoundingClientRect();
    canvas.width  = r.width  * window.devicePixelRatio;
    canvas.height = r.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = '#1B3A6B';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }
  scale();
  window.addEventListener('resize', scale);

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }

  canvas.addEventListener('mousedown',  e => { drawing = true; ctx.beginPath(); const p = pos(e); ctx.moveTo(p.x, p.y); });
  canvas.addEventListener('mousemove',  e => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasSig = true; });
  canvas.addEventListener('mouseup',    () => { drawing = false; });
  canvas.addEventListener('mouseleave', () => { drawing = false; });
  canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; ctx.beginPath(); const p = pos(e); ctx.moveTo(p.x, p.y); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasSig = true; }, { passive: false });
  canvas.addEventListener('touchend',   e => { e.preventDefault(); drawing = false; }, { passive: false });

  window.clearSig = function() {
    ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
    hasSig = false;
  };

  window.submitSig = async function() {
    const name  = document.getElementById('signerName').value.trim();
    const agree = document.getElementById('agreeCheck').checked;
    const err   = document.getElementById('errMsg');
    err.style.display = 'none';

    if (!name)   { err.textContent = 'Please enter your full name.'; err.style.display = 'block'; return; }
    if (!hasSig) { err.textContent = 'Please draw your signature above.'; err.style.display = 'block'; return; }
    if (!agree)  { err.textContent = 'Please check the agreement checkbox.'; err.style.display = 'block'; return; }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    const sigData = canvas.toDataURL('image/png');
    try {
      const res = await fetch('/api/signing/signed/${session.token}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signer_name: name, signature_data: sigData })
      });
      const data = await res.json();
      if (res.ok) {
        document.querySelector('.card').innerHTML = \`
          <div style="text-align:center;padding:40px 20px">
            <div style="font-size:64px;margin-bottom:20px">✅</div>
            <h2 style="color:#1B3A6B;margin-bottom:10px">Thank you, \${name}!</h2>
            <p style="color:#555;font-size:14px;line-height:1.6">
              ${isProposal
                ? 'Your proposal has been approved. Preferred Builders will now prepare your contract and reach out shortly.'
                : 'Your contract has been signed. You will receive a copy by email. Welcome to the Preferred Builders family!'}
            </p>
            <p style="color:#aaa;font-size:12px;margin-top:16px">Signed: \${new Date().toLocaleString()}</p>
          </div>\`;
      } else {
        btn.disabled = false;
        btn.textContent = '✍️ ${isProposal ? 'Approve & Sign Proposal' : 'Sign Contract'}';
        err.textContent = data.error || 'Submission failed. Please try again.';
        err.style.display = 'block';
      }
    } catch (ex) {
      btn.disabled = false;
      btn.textContent = '✍️ ${isProposal ? 'Approve & Sign Proposal' : 'Sign Contract'}';
      err.textContent = 'Network error. Please try again.';
      err.style.display = 'block';
    }
  };
})();
</script>`}

</body>
</html>`;
}

// ─── Public signing pages ──────────────────────────────────────────────────────

router.get('/sign/p/:token', (req, res) => {
  const db  = getDb();
  const session = db.prepare('SELECT * FROM signing_sessions WHERE token = ? AND doc_type = ?').get(req.params.token, 'proposal');
  if (!session) return res.status(404).send('<h2>Link not found or expired.</h2>');
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(session.job_id);
  if (!job)     return res.status(404).send('<h2>Job not found.</h2>');
  res.send(signingPageHTML({ docType: 'proposal', job, session, base: baseURL(req) }));
});

router.get('/sign/c/:token', (req, res) => {
  const db  = getDb();
  const session = db.prepare('SELECT * FROM signing_sessions WHERE token = ? AND doc_type = ?').get(req.params.token, 'contract');
  if (!session) return res.status(404).send('<h2>Link not found or expired.</h2>');
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(session.job_id);
  if (!job)     return res.status(404).send('<h2>Job not found.</h2>');
  res.send(signingPageHTML({ docType: 'contract', job, session, base: baseURL(req) }));
});

// ─── Record open (called by client JS on page load) ───────────────────────────

router.post('/api/signing/opened/:token', (req, res) => {
  const db      = getDb();
  const session = db.prepare('SELECT * FROM signing_sessions WHERE token = ?').get(req.params.token);
  if (!session) return res.status(404).json({ error: 'Not found' });

  if (!session.opened_at) {
    const ip = clientIP(req);
    db.prepare('UPDATE signing_sessions SET opened_at = CURRENT_TIMESTAMP, opened_ip = ?, status = ? WHERE token = ?')
      .run(ip, 'opened', req.params.token);

    const job      = db.prepare('SELECT * FROM jobs WHERE id = ?').get(session.job_id);
    const docLabel = session.doc_type === 'proposal' ? 'Proposal' : 'Contract';
    logAudit(session.job_id, `${session.doc_type}_opened`, `${docLabel} opened by customer (IP: ${ip})`, 'customer');
    notifyClients('job_updated', {
      jobId: session.job_id, event: `${session.doc_type}_opened`,
      message: `📬 ${job?.customer_name || 'Customer'} opened the ${docLabel.toLowerCase()} — ${new Date().toLocaleString()}`
    });

    // Email owners on first open
    setImmediate(async () => {
      try {
        const { sendEmail, getOwnerEmails } = require('../services/emailService');
        const owners = getOwnerEmails();
        if (owners.length) {
          const when = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
          await sendEmail({
            to: owners,
            subject: `📬 ${docLabel} opened — ${job?.customer_name || 'Customer'}`,
            html: `<p><strong>${job?.customer_name || 'The customer'}</strong> just opened their <strong>${docLabel.toLowerCase()}</strong> signing link.</p>
                   <p><strong>Project:</strong> ${job?.project_address || '—'}</p>
                   <p><strong>Time:</strong> ${when}</p>
                   <p><a href="${process.env.APP_URL || ''}/jobs/${session.job_id}">View job →</a></p>`,
            emailType: 'system_alert',
            jobId: session.job_id
          });
        }
      } catch (e) { console.warn('[SigningOpenedAlert]', e.message); }
    });
  }
  res.json({ ok: true });
});

// ─── Record signature ─────────────────────────────────────────────────────────

router.post('/api/signing/signed/:token', async (req, res) => {
  const db      = getDb();
  const session = db.prepare('SELECT * FROM signing_sessions WHERE token = ?').get(req.params.token);
  if (!session) return res.status(404).json({ error: 'Not found' });
  if (session.status === 'signed') return res.status(400).json({ error: 'Already signed' });

  const { signer_name, signature_data } = req.body;
  if (!signer_name || !signature_data) return res.status(400).json({ error: 'Missing name or signature' });

  const ip = clientIP(req);
  db.prepare(`UPDATE signing_sessions SET signed_at = CURRENT_TIMESTAMP, signed_ip = ?, signer_name = ?, signature_data = ?, status = 'signed' WHERE token = ?`)
    .run(ip, signer_name, signature_data, req.params.token);

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(session.job_id);

  if (session.doc_type === 'proposal') {
    db.prepare("UPDATE jobs SET status = 'proposal_approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(session.job_id);
    logAudit(session.job_id, 'proposal_signed', `Proposal signed by ${signer_name} (IP: ${ip})`, 'customer');
    notifyClients('job_updated', {
      jobId: session.job_id, status: 'proposal_approved',
      message: `✅ Proposal signed by ${signer_name}`
    });

    // Notify owners that proposal was signed
    setImmediate(async () => {
      try {
        const { sendEmail, getOwnerEmails } = require('../services/emailService');
        const owners = getOwnerEmails();
        if (owners.length) {
          const when = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
          await sendEmail({
            to: owners,
            subject: `✅ Proposal signed — ${job?.customer_name || signer_name}`,
            html: `<p><strong>${signer_name}</strong> just signed the proposal for <strong>${job?.customer_name || 'a customer'}</strong>.</p>
                   <p><strong>Project:</strong> ${job?.project_address || '—'}</p>
                   <p><strong>Total:</strong> $${Number(job?.total_value || 0).toLocaleString()}</p>
                   <p><strong>Time:</strong> ${when}</p>
                   <p>The contract is now being auto-generated.</p>
                   <p><a href="${process.env.APP_URL || ''}/jobs/${session.job_id}">View job →</a></p>`,
            emailType: 'system_alert',
            jobId: session.job_id
          });
        }
      } catch (e) { console.warn('[ProposalSignedAlert]', e.message); }
    });

    // Auto-generate contract in background
    setImmediate(async () => {
      try {
        const { generateContract } = require('../services/claudeService');
        const { generatePDF }      = require('../services/pdfService');
        const proposalData = typeof job.proposal_data === 'string' ? JSON.parse(job.proposal_data) : job.proposal_data;
        const contractData = await generateContract(proposalData, session.job_id, 'en');
        const contractPDF  = await generatePDF(contractData, 'contract', session.job_id);
        db.prepare("UPDATE jobs SET contract_data = ?, contract_pdf_path = ?, status = 'contract_ready', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(JSON.stringify(contractData), contractPDF, session.job_id);
        logAudit(session.job_id, 'contract_auto_generated', 'Contract auto-generated after proposal approval', 'system');
        notifyClients('job_updated', { jobId: session.job_id, status: 'contract_ready', message: '📋 Contract auto-generated and ready to send' });
      } catch (e) {
        console.error('[AutoContract]', e.message);
      }
    });

  } else {
    db.prepare("UPDATE jobs SET status = 'contract_signed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(session.job_id);
    logAudit(session.job_id, 'contract_signed', `Contract signed by ${signer_name} (IP: ${ip})`, 'customer');
    notifyClients('job_updated', {
      jobId: session.job_id, status: 'contract_signed',
      message: `🎉 Contract signed by ${signer_name}`
    });

    // Email signed confirmation to customer
    try {
      if (job?.customer_email) {
        await sendEmail({
          to: job.customer_email,
          subject: `Your contract with Preferred Builders is signed ✅`,
          html: `<p>Hi ${job.customer_name || 'there'},</p>
<p>Thank you — your construction contract with Preferred Builders General Services Inc. has been signed and is on file.</p>
<p>Your project at <strong>${job.project_address}</strong> is officially confirmed. We'll be in touch shortly with next steps.</p>
<p style="margin-top:24px">— The Preferred Builders Team<br>978-377-1784 | jackson.deaquino@preferredbuildersusa.com</p>`,
          text: `Your contract is signed and on file. Project at ${job.project_address} confirmed.`,
          emailType: 'contract_signed',
          jobId: job.id
        });
      }
    } catch (e) { console.warn('[ContractSignedEmail]', e.message); }

    // Notify owners that contract was signed
    setImmediate(async () => {
      try {
        const { sendEmail, getOwnerEmails } = require('../services/emailService');
        const owners = getOwnerEmails();
        if (owners.length) {
          const when = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
          await sendEmail({
            to: owners,
            subject: `🎉 Contract signed — ${job?.customer_name || signer_name}`,
            html: `<p><strong>${signer_name}</strong> just signed the construction contract.</p>
                   <p><strong>Customer:</strong> ${job?.customer_name || '—'}</p>
                   <p><strong>Project:</strong> ${job?.project_address || '—'}</p>
                   <p><strong>Contract Value:</strong> $${Number(job?.total_value || 0).toLocaleString()}</p>
                   <p><strong>Time:</strong> ${when}</p>
                   <p><a href="${process.env.APP_URL || ''}/jobs/${session.job_id}">View job →</a></p>`,
            emailType: 'system_alert',
            jobId: session.job_id
          });
        }
      } catch (e) { console.warn('[ContractSignedAlert]', e.message); }
    });
  }

  res.json({ ok: true });
});

// ─── Admin: send proposal for signing ────────────────────────────────────────

router.post('/api/signing/send-proposal/:jobId', requireAuth, async (req, res) => {
  const db  = getDb();
  const pinSetting = db.prepare("SELECT value FROM settings WHERE key = 'email.pin'").get();
  const requiredPin = pinSetting?.value?.trim();
  if (requiredPin) {
    const submitted = String(req.body?.pin || '').trim();
    if (submitted !== requiredPin) return res.status(403).json({ error: 'Incorrect PIN. Email not sent.' });
  }
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.proposal_pdf_path) return res.status(400).json({ error: 'No proposal PDF ready' });
  if (!job.customer_email) return res.status(400).json({ error: 'No customer email on file' });

  const token = uuidv4();
  const base  = baseURL(req);
  const link  = `${base}/sign/p/${token}`;

  db.prepare(`INSERT INTO signing_sessions (job_id, doc_type, token, email_sent_at, status) VALUES (?, 'proposal', ?, CURRENT_TIMESTAMP, 'sent')`)
    .run(job.id, token);
  db.prepare("UPDATE jobs SET status = 'proposal_sent', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id);
  logAudit(job.id, 'proposal_sent_for_signing', `Proposal signing link sent to ${job.customer_email}`, 'admin');

  const amount = job.total_value ? `$${Number(job.total_value).toLocaleString()}` : '';

  await sendEmail({
    to: job.customer_email,
    subject: `Your Preferred Builders Proposal is Ready for Your Approval`,
    html: `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto">
      <div style="background:#1B3A6B;padding:20px 24px;color:white;border-radius:8px 8px 0 0">
        <div style="font-size:17px;font-weight:700">Preferred Builders General Services Inc.</div>
        <div style="font-size:12px;opacity:.8;margin-top:4px">HIC-197400 · 978-377-1784</div>
      </div>
      <div style="background:white;padding:28px 24px;border:1px solid #eee;border-top:none">
        <p style="font-size:15px;color:#1B3A6B;font-weight:700;margin-bottom:12px">Hi ${job.customer_name || 'there'},</p>
        <p style="color:#444;font-size:14px;line-height:1.7;margin-bottom:16px">
          Your project proposal for <strong>${job.project_address}</strong> is ready for your review and approval.
          ${amount ? `The total proposal value is <strong>${amount}</strong>.` : ''}
        </p>
        <p style="color:#444;font-size:14px;line-height:1.7;margin-bottom:24px">
          Please click the button below to review the full proposal and add your electronic signature. 
          This link is personal to you and expires once signed.
        </p>
        <div style="text-align:center;margin-bottom:24px">
          <a href="${link}" style="background:#1B3A6B;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;display:inline-block">
            📋 Review &amp; Approve Proposal
          </a>
        </div>
        <p style="color:#888;font-size:12px;line-height:1.6">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${link}" style="color:#1B3A6B">${link}</a>
        </p>
      </div>
      <div style="background:#f8f9ff;padding:14px 24px;font-size:11px;color:#aaa;border-radius:0 0 8px 8px;text-align:center">
        Preferred Builders General Services Inc. · 37 Duck Mill Rd, Fitchburg MA 01420
      </div>
    </div>`,
    text: `Hi ${job.customer_name || 'there'},\n\nYour proposal for ${job.project_address} is ready. Review and approve it here:\n${link}`,
    emailType: 'proposal_signing',
    jobId: job.id
  });

  notifyClients('job_updated', { jobId: job.id, status: 'proposal_sent' });
  res.json({ success: true, message: `Proposal signing link sent to ${job.customer_email}` });
});

// ─── Admin: send contract for signing ────────────────────────────────────────

router.post('/api/signing/send-contract/:jobId', requireAuth, async (req, res) => {
  const db  = getDb();
  const pinSetting = db.prepare("SELECT value FROM settings WHERE key = 'email.pin'").get();
  const requiredPin = pinSetting?.value?.trim();
  if (requiredPin) {
    const submitted = String(req.body?.pin || '').trim();
    if (submitted !== requiredPin) return res.status(403).json({ error: 'Incorrect PIN. Email not sent.' });
  }
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.contract_pdf_path) return res.status(400).json({ error: 'No contract PDF ready. Generate the contract first.' });
  if (!job.customer_email) return res.status(400).json({ error: 'No customer email on file' });

  const token = uuidv4();
  const base  = baseURL(req);
  const link  = `${base}/sign/c/${token}`;

  db.prepare(`INSERT INTO signing_sessions (job_id, doc_type, token, email_sent_at, status) VALUES (?, 'contract', ?, CURRENT_TIMESTAMP, 'sent')`)
    .run(job.id, token);
  db.prepare("UPDATE jobs SET status = 'contract_sent', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id);
  logAudit(job.id, 'contract_sent_for_signing', `Contract signing link sent to ${job.customer_email}`, 'admin');

  const amount = job.total_value ? `$${Number(job.total_value).toLocaleString()}` : '';

  await sendEmail({
    to: job.customer_email,
    subject: `Your Preferred Builders Contract is Ready to Sign`,
    html: `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto">
      <div style="background:#1B3A6B;padding:20px 24px;color:white;border-radius:8px 8px 0 0">
        <div style="font-size:17px;font-weight:700">Preferred Builders General Services Inc.</div>
        <div style="font-size:12px;opacity:.8;margin-top:4px">HIC-197400 · CSL CS-121662 · 978-377-1784</div>
      </div>
      <div style="background:white;padding:28px 24px;border:1px solid #eee;border-top:none">
        <p style="font-size:15px;color:#1B3A6B;font-weight:700;margin-bottom:12px">Hi ${job.customer_name || 'there'},</p>
        <p style="color:#444;font-size:14px;line-height:1.7;margin-bottom:16px">
          Your construction contract for <strong>${job.project_address}</strong> is ready for your signature.
          ${amount ? `The total contract value is <strong>${amount}</strong>.` : ''}
        </p>
        <p style="color:#444;font-size:14px;line-height:1.7;margin-bottom:24px">
          Please review the full contract carefully before signing. Your electronic signature constitutes a legally binding agreement.
        </p>
        <div style="text-align:center;margin-bottom:24px">
          <a href="${link}" style="background:#059669;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;display:inline-block">
            ✍️ Review &amp; Sign Contract
          </a>
        </div>
        <p style="color:#888;font-size:12px;line-height:1.6">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${link}" style="color:#1B3A6B">${link}</a>
        </p>
        <div style="background:#FFF8F0;border-left:3px solid #E07B2A;padding:12px 16px;border-radius:0 6px 6px 0;margin-top:16px">
          <p style="margin:0;font-size:12px;color:#5D3A00">
            <strong>⚠️ Important:</strong> Per M.G.L. c. 93 §48, you have the right to cancel this agreement within 3 business days of signing if it was executed away from our principal place of business.
          </p>
        </div>
      </div>
      <div style="background:#f8f9ff;padding:14px 24px;font-size:11px;color:#aaa;border-radius:0 0 8px 8px;text-align:center">
        Preferred Builders General Services Inc. · 37 Duck Mill Rd, Fitchburg MA 01420
      </div>
    </div>`,
    text: `Hi ${job.customer_name || 'there'},\n\nYour contract for ${job.project_address} is ready to sign:\n${link}`
  });

  notifyClients('job_updated', { jobId: job.id, status: 'contract_sent' });
  res.json({ success: true, message: `Contract signing link sent to ${job.customer_email}` });
});

// ─── Admin: get signing status for a job ─────────────────────────────────────

router.get('/api/signing/status/:jobId', requireAuth, (req, res) => {
  const db = getDb();
  const sessions = db.prepare('SELECT id, doc_type, status, email_sent_at, opened_at, opened_ip, signed_at, signer_name, created_at FROM signing_sessions WHERE job_id = ? ORDER BY created_at DESC').all(req.params.jobId);
  res.json({ sessions });
});

module.exports = router;
