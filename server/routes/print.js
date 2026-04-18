// server/routes/print.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');
const path = require('path');
const fs = require('fs');

// ── GET /api/print/printers — list available printers on this machine ────────
router.get('/printers', requireAuth, async (req, res) => {
  const db = getDb();
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'print_printer_name'").get();
  const currentPrinter = setting?.value || '';
  try {
    const printer = require('pdf-to-printer');
    const printers = await printer.getPrinters();
    res.json({
      printers: printers.map((p) => (typeof p === 'string' ? p : p.name || p.deviceId || String(p))),
      currentPrinter,
    });
  } catch (err) {
    console.error('[print] getPrinters error:', err.message);
    res.json({ printers: [], currentPrinter, error: 'Could not list printers — check server OS compatibility' });
  }
});

// ── POST /api/print/job/:id — send proposal or contract PDF to printer ───────
router.post('/job/:id', requireAuth, async (req, res) => {
  const { docType, printerName } = req.body; // docType: 'proposal' | 'contract'
  if (!docType || !['proposal', 'contract'].includes(docType)) {
    return res.status(400).json({ error: 'docType must be "proposal" or "contract"' });
  }

  const db = getDb();
  const job = db.prepare('SELECT proposal_pdf_path, contract_pdf_path, customer_name FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const pdfPath = docType === 'proposal' ? job.proposal_pdf_path : job.contract_pdf_path;
  if (!pdfPath) return res.status(400).json({ error: `No ${docType} PDF available for this job` });
  if (!fs.existsSync(pdfPath)) return res.status(404).json({ error: `PDF file not found on server: ${pdfPath}` });

  try {
    const printer = require('pdf-to-printer');

    const options = {};
    if (printerName && printerName.trim()) {
      options.printer = printerName.trim();
    } else {
      const setting = db.prepare("SELECT value FROM settings WHERE key = 'print_printer_name'").get();
      if (setting?.value && setting.value.trim()) {
        options.printer = setting.value.trim();
      }
    }

    await printer.print(pdfPath, options);

    console.log(`[print] Sent ${docType} PDF for job ${req.params.id} to printer "${options.printer || 'default'}"`);
    res.json({ ok: true, printer: options.printer || 'default', docType, customer: job.customer_name });
  } catch (err) {
    console.error('[print] Print error:', err.message);
    res.status(500).json({ error: `Print failed: ${err.message}` });
  }
});

module.exports = router;
