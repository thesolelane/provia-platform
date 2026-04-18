// server/routes/scan.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const SCAN_TEMP_DIR = path.resolve(__dirname, '../../uploads/scan_temp');
if (!fs.existsSync(SCAN_TEMP_DIR)) fs.mkdirSync(SCAN_TEMP_DIR, { recursive: true });

// ── Helper: run powershell and get output ─────────────────────────────────────
function runPS(script) {
  return new Promise((resolve, reject) => {
    const escaped = script.replace(/"/g, '\\"');
    exec(
      `powershell -NoProfile -NonInteractive -Command "${escaped}"`,
      { timeout: 60000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout.trim());
      }
    );
  });
}

// ── GET /api/scan/devices — list WIA-compatible scanners ──────────────────────
router.get('/devices', requireAuth, async (req, res) => {
  const script = `
    try {
      $wia = New-Object -ComObject WIA.DeviceManager
      $result = @()
      for ($i = 1; $i -le $wia.DeviceInfos.Count; $i++) {
        $d = $wia.DeviceInfos.Item($i)
        $result += [pscustomobject]@{
          index = $i
          name  = $d.Properties['Name'].Value
          type  = [int]$d.Type
        }
      }
      if ($result.Count -eq 0) { '[]' } else { $result | ConvertTo-Json -Compress }
    } catch { Write-Output ('ERROR:' + $_.Exception.Message) }
  `;
  try {
    const out = await runPS(script);
    if (out.startsWith('ERROR:')) {
      return res.json({ devices: [], warning: out.replace('ERROR:', '').trim() });
    }
    let devices = [];
    try { devices = JSON.parse(out); } catch { devices = []; }
    if (!Array.isArray(devices)) devices = [devices];
    res.json({ devices });
  } catch (err) {
    console.error('[scan] list devices error:', err.message);
    res.json({ devices: [], warning: err.message });
  }
});

// ── POST /api/scan/start — trigger a scan, return preview base64 ──────────────
router.post('/start', requireAuth, async (req, res) => {
  const { deviceIndex = 1, dpi = 300 } = req.body;
  const scanId = uuidv4();
  const outPath = path.join(SCAN_TEMP_DIR, `${scanId}.jpg`);
  const outPathEsc = outPath.replace(/\\/g, '\\\\');

  const script = `
    try {
      $wia = New-Object -ComObject WIA.DeviceManager
      $device = $wia.DeviceInfos.Item(${parseInt(deviceIndex, 10)}).Connect()
      $item = $device.Items.Item(1)
      try { $item.Properties['6147'].Value = ${parseInt(dpi, 10)} } catch {}
      try { $item.Properties['6148'].Value = ${parseInt(dpi, 10)} } catch {}
      $jpegGuid = '{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}'
      $image = $item.Transfer($jpegGuid)
      $image.SaveFile('${outPathEsc}')
      Write-Output 'OK'
    } catch { Write-Output ('ERROR:' + $_.Exception.Message) }
  `;

  try {
    const out = await runPS(script);
    if (out.startsWith('ERROR:')) {
      return res.status(500).json({ error: out.replace('ERROR:', '').trim() });
    }
    if (!fs.existsSync(outPath)) {
      return res.status(500).json({ error: 'Scan file not created — check scanner connection' });
    }
    const buf = fs.readFileSync(outPath);
    const preview = `data:image/jpeg;base64,${buf.toString('base64')}`;
    res.json({ scanId, preview });
  } catch (err) {
    console.error('[scan] start error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/scan/attach/:jobId — attach a completed scan to a job ───────────
router.post('/attach/:jobId', requireAuth, async (req, res) => {
  const { scanId, attachType, docType } = req.body;
  // attachType: 'signature' | 'photo'
  // docType (for signature): 'contract' | 'proposal'

  if (!scanId) return res.status(400).json({ error: 'No scanId provided' });

  const scanFile = path.join(SCAN_TEMP_DIR, `${scanId}.jpg`);
  if (!fs.existsSync(scanFile)) {
    return res.status(404).json({ error: 'Scan file not found — it may have expired' });
  }

  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  try {
    if (attachType === 'signature') {
      // Save to the job's uploads folder and call the manual-signature logic
      const jobDir = path.resolve(__dirname, '../../uploads/jobs', req.params.jobId);
      if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });
      const filename = `signed_${docType}_${Date.now()}.jpg`;
      const destPath = path.join(jobDir, filename);
      fs.copyFileSync(scanFile, destPath);

      // Same status update as manual-signature route
      const newStatus =
        docType === 'contract' ? 'contract_signed' : 'proposal_approved';
      const pdfCol =
        docType === 'contract' ? 'contract_pdf_path' : 'proposal_pdf_path';

      db.prepare(
        `UPDATE jobs SET status = ?, ${pdfCol} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(newStatus, destPath, req.params.jobId);

      // Log to job_photos too so it shows in Photos tab
      db.prepare(
        'INSERT INTO job_photos (job_id, filename, original_name, caption) VALUES (?, ?, ?, ?)'
      ).run(req.params.jobId, filename, filename, `Scanned signed ${docType}`);

      fs.unlinkSync(scanFile);
      res.json({ ok: true, attachType, docType, status: newStatus, filename });

    } else {
      // Attach as job photo (receipts, checks, general)
      const jobDir = path.resolve(__dirname, '../../uploads/jobs', req.params.jobId);
      if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });
      const label = docType || 'scan';
      const filename = `${label}_${Date.now()}.jpg`;
      const destPath = path.join(jobDir, filename);
      fs.copyFileSync(scanFile, destPath);

      const caption = docType === 'receipt' ? 'Receipt / Check'
        : docType === 'check' ? 'Check'
        : 'Scanned document';

      const result = db.prepare(
        'INSERT INTO job_photos (job_id, filename, original_name, caption) VALUES (?, ?, ?, ?)'
      ).run(req.params.jobId, filename, filename, caption);

      fs.unlinkSync(scanFile);
      res.json({ ok: true, attachType, caption, filename, photoId: result.lastInsertRowid });
    }
  } catch (err) {
    console.error('[scan] attach error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/scan/temp/:scanId — discard a scan preview ───────────────────
router.delete('/temp/:scanId', requireAuth, (req, res) => {
  const scanFile = path.join(SCAN_TEMP_DIR, `${req.params.scanId}.jpg`);
  if (fs.existsSync(scanFile)) fs.unlinkSync(scanFile);
  res.json({ ok: true });
});

module.exports = router;
