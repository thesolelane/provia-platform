// server/services/pdfService.js
// Generates Proposal and Contract PDFs using Puppeteer
// Template lives HERE — Claude only provides data, never formatting.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const { buildContractHTML: buildContractHTMLNew, adaptToContractSchema, blankContractSchema } = require('./contractTemplate');

// Resolve Chromium: prefer env var, then OS-specific paths, then puppeteer bundled
function resolveChromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;

  // Windows paths
  if (process.platform === 'win32') {
    // Try 'where chrome' first (works regardless of install location)
    try {
      const p = execSync('where chrome', { timeout: 3000 }).toString().split('\n')[0].trim();
      if (p && fs.existsSync(p)) return p;
    } catch (_) {}
    // Try common install locations
    const winPaths = [
      'C:\\Users\\theso\\.cache\\puppeteer\\chrome\\win64-146.0.7680.76\\chrome-win64\\chrome.exe',
      'C:\\Users\\theso\\.cache\\puppeteer\\chrome\\win64-127.0.6533.88\\chrome-win64\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\theso\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Chromium\\Application\\chrome.exe',
      (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
      (process.env.PROGRAMFILES || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    ];
    for (const p of winPaths) {
      try { if (p && fs.existsSync(p)) return p; } catch (_) {}
    }
    return undefined;
  }

  // Linux/macOS — use which
  try {
    const p = execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null', { timeout: 3000 }).toString().trim();
    if (p) return p;
  } catch (_) {}
  return undefined; // fall back to puppeteer's own bundled chrome
}
const CHROMIUM_PATH = resolveChromiumPath();
if (CHROMIUM_PATH) console.log('[PDF] Using Chromium:', CHROMIUM_PATH);

const OUTPUT_DIR = path.join(__dirname, '../../outputs');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const BRAND_BLUE   = '#1B3A6B';
const BRAND_ORANGE = '#E07B2A';
const LIGHT_BLUE   = '#EEF3FB';
const LIGHT_GRAY   = '#F8F8F8';

async function generatePDF(data, type, jobId) {
  const html = type === 'proposal'
    ? buildProposalHTML(data)
    : buildContractHTMLNew(adaptToContractSchema(data));

  const filename = `PB_${type === 'proposal' ? 'Proposal' : 'Contract'}_${jobId.slice(0,8)}_${Date.now()}.pdf`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'Letter',
      margin: { top: '0.8in', right: '1in', bottom: '0.8in', left: '1in' },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:7.5px;color:#aaa;width:100%;text-align:center;font-family:Arial,sans-serif;padding-top:6px;letter-spacing:0.3px;">
        Preferred Builders General Services Inc. &nbsp;|&nbsp; LIC# HIC-197400 &nbsp;|&nbsp; 978-377-1784
      </div>`,
      footerTemplate: `<div style="width:100%;font-family:Arial,sans-serif;font-size:8px;color:#555;display:flex;justify-content:space-between;align-items:center;padding:0 72px;box-sizing:border-box;">
        <span style="color:#888;">Preferred Builders General Services Inc.</span>
        <span style="font-weight:bold;color:#1B3A6B;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        <span style="color:#888;">${type === 'proposal' ? 'PROPOSAL' : 'CONTRACT'} — Confidential</span>
      </div>`
    });
  } finally {
    await browser.close();
  }

  return outputPath;
}

function baseCSS() {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #1a1a1a; line-height: 1.55; }

    .cover { background: ${BRAND_BLUE}; color: white; padding: 48px 56px; min-height: 200px; }
    .cover-title { font-size: 26pt; font-weight: bold; letter-spacing: 1px; }
    .cover-sub { font-size: 13pt; margin-top: 8px; opacity: 0.85; }
    .cover-meta { margin-top: 24px; font-size: 10pt; opacity: 0.8; line-height: 2; }
    .cover-badge { display: inline-block; background: ${BRAND_ORANGE}; color: white; padding: 4px 14px; border-radius: 3px; font-size: 9pt; font-weight: bold; margin-top: 16px; }

    .content { padding: 20px 56px; }

    .section-header {
      background: ${BRAND_BLUE}; color: white;
      padding: 8px 14px; margin: 24px 0 12px;
      font-size: 11.5pt; font-weight: bold;
      page-break-after: avoid;
    }
    .section-header.orange { background: ${BRAND_ORANGE}; }
    .sub-header {
      color: ${BRAND_BLUE}; font-weight: bold; font-size: 11pt;
      margin: 16px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px;
      page-break-after: avoid;
    }

    table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 10pt; }
    th { background: ${BRAND_BLUE}; color: white; padding: 7px 10px; text-align: left; font-weight: bold; }
    td { padding: 6px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
    tr:nth-child(even) td { background: ${LIGHT_GRAY}; }
    tr.total td { background: ${LIGHT_BLUE}; font-weight: bold; border-top: 2px solid ${BRAND_BLUE}; }
    tr.deposit td { background: #fff3e0; font-weight: bold; }

    .check-list { list-style: none; padding: 0; margin: 0 0 8px; }
    .check-list li { padding: 3px 0 3px 24px; font-size: 10pt; position: relative; }
    .check-list li.yes::before { content: "✓"; color: #2E7D32; font-weight: bold; position: absolute; left: 6px; }
    .check-list li.no::before  { content: "✗"; color: #C62828; font-weight: bold; position: absolute; left: 6px; }
    .check-list li.bullet::before { content: "•"; color: ${BRAND_BLUE}; position: absolute; left: 8px; }
    .check-list li .label { font-weight: bold; }
    .check-list li .detail { color: #555; font-size: 9.5pt; }

    .note-box {
      background: #FFF8F0; border-left: 4px solid ${BRAND_ORANGE};
      padding: 10px 14px; margin: 10px 0 16px;
      font-size: 9.5pt; color: #5D3A00; font-style: italic;
    }
    .rebate-box {
      background: #E8F5E9; border-left: 4px solid #2E7D32;
      padding: 10px 14px; margin: 10px 0 16px;
      font-size: 9.5pt; color: #1B5E20;
    }
    .flag-box {
      background: #FFF3E0; border-left: 4px solid #F57C00;
      padding: 10px 14px; margin: 10px 0 16px;
      font-size: 9.5pt; color: #E65100;
    }

    .sig-block { margin-top: 24px; }
    .sig-row { display: flex; gap: 40px; margin-bottom: 32px; }
    .sig-field { flex: 1; }
    .sig-line { border-bottom: 1px solid #333; height: 32px; margin-bottom: 4px; }
    .sig-label { font-size: 9pt; color: #555; }

    .legal-text { font-size: 9pt; line-height: 1.65; color: #333; }
    .legal-text h3 { color: ${BRAND_BLUE}; font-size: 10pt; margin: 14px 0 4px; font-weight: bold; }
    .legal-text p { margin-bottom: 8px; }
    .legal-text ul { margin: 4px 0 8px 20px; }
    .legal-text ul li { margin-bottom: 3px; }

    .exhibit-header { text-align: center; margin: 12px 0 20px; page-break-before: always; }
    .exhibit-label { color: ${BRAND_ORANGE}; font-size: 13pt; font-weight: bold; display: block; }
    .exhibit-name { color: ${BRAND_BLUE}; font-size: 18pt; font-weight: bold; display: block; margin-top: 4px; }
    .exhibit-sub { color: #666; font-size: 10pt; margin-top: 6px; }

    .overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin: 12px 0; border: 1px solid #ddd; }
    .overview-grid .item { padding: 8px 12px; border-bottom: 1px solid #eee; }
    .overview-grid .item:nth-child(odd) { background: ${LIGHT_GRAY}; border-right: 1px solid #ddd; }
    .overview-grid .label-cell { font-weight: bold; font-size: 9.5pt; color: ${BRAND_BLUE}; }
    .overview-grid .value-cell { font-size: 10pt; }

    .page-break { page-break-before: always; }
  `;
}

// ══════════════════════════════════════════════════════════════════════
// PROPOSAL HTML — built entirely from flat JSON data
// ══════════════════════════════════════════════════════════════════════
function buildProposalHTML(data) {
  const customer = data.customer || {};
  const project = data.project || {};
  const lineItems = data.lineItems || [];
  const exclusions = data.exclusions || [];
  const pricing = data.pricing || {};
  const fmt = (n) => n ? `$${Number(n).toLocaleString()}` : '$0';
  const quoteNum = data.quoteNumber || '—';
  const validUntil = data.validUntil || '—';
  const isStretchCode = project.stretchCodeTown || data.isStretchCodeTown || false;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>${baseCSS()}</style></head>
<body>

<!-- COVER -->
<div class="cover">
  <div class="cover-title">PROJECT PROPOSAL &amp; SCOPE OF WORK</div>
  <div class="cover-sub">${project.address || ''}, ${project.city || ''}, ${project.state || 'MA'}</div>
  <div class="cover-meta">
    Prepared for: <strong>${customer.name || ''}</strong><br>
    Quote #: <strong>${quoteNum}</strong><br>
    Date: <strong>${new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'})}</strong><br>
    Valid Until: <strong>${validUntil}</strong>
  </div>
  <div class="cover-badge">PROPOSAL — NOT A CONTRACT</div>
</div>

<div class="content">

  <!-- PROJECT OVERVIEW -->
  <div class="section-header">PROJECT OVERVIEW</div>

  <!-- Customer info card -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0 16px;">
    <div style="background:${LIGHT_BLUE};border-left:4px solid ${BRAND_BLUE};padding:12px 16px;border-radius:2px;">
      <div style="font-size:9pt;font-weight:bold;color:${BRAND_BLUE};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Customer</div>
      <div style="font-size:13pt;font-weight:bold;color:#1a1a1a;margin-bottom:4px;">${customer.name || '—'}</div>
      ${customer.phone ? `<div style="font-size:10pt;color:#333;">📞 ${customer.phone}</div>` : ''}
      ${customer.email ? `<div style="font-size:10pt;color:#333;">✉️ ${customer.email}</div>` : ''}
    </div>
    <div style="background:${LIGHT_GRAY};border-left:4px solid ${BRAND_ORANGE};padding:12px 16px;border-radius:2px;">
      <div style="font-size:9pt;font-weight:bold;color:${BRAND_ORANGE};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Project Location</div>
      <div style="font-size:12pt;font-weight:bold;color:#1a1a1a;margin-bottom:4px;">${project.address || '—'}</div>
      <div style="font-size:10pt;color:#333;">${[project.city, project.state].filter(Boolean).join(', ') || ''}</div>
      ${project.sqft ? `<div style="font-size:10pt;color:#555;margin-top:4px;">${Number(project.sqft).toLocaleString()} sq ft</div>` : ''}
    </div>
  </div>

  <!-- Project details grid -->
  <div class="overview-grid">
    <div class="item label-cell">Project Description</div>
    <div class="item value-cell">${project.description || '—'}</div>
    <div class="item label-cell">Quote Number</div>
    <div class="item value-cell">${quoteNum || '—'}</div>
    <div class="item label-cell">Date Prepared</div>
    <div class="item value-cell">${new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'})}</div>
    <div class="item label-cell">Valid Until</div>
    <div class="item value-cell">${validUntil || '—'}</div>
    <div class="item label-cell">Stretch Code Town</div>
    <div class="item value-cell">${isStretchCode ? '⚠️ Yes — additional requirements apply' : 'No'}</div>
  </div>

  ${data.flaggedItems?.length ? `
  <div class="flag-box">
    ⚠️ <strong>Items Flagged for Review:</strong><br>
    ${data.flaggedItems.map(f => `• ${f}`).join('<br>')}
  </div>` : ''}

  <!-- SCOPE OF WORK -->
  <div class="section-header">SCOPE OF WORK</div>
  ${buildScopeHTML(lineItems)}

  <!-- EXCLUSIONS -->
  ${exclusions.length ? `
  <div class="section-header">WHAT IS NOT INCLUDED</div>
  <p style="margin-bottom:10px;font-size:10pt;">The following are excluded from this proposal:</p>
  ${buildExclusionsHTML(exclusions)}` : ''}

  <!-- PERMIT CHECKLIST -->
  ${buildPermitChecklistHTML(data)}

  <!-- COST SUMMARY -->
  <div class="section-header">COMPLETE COST SUMMARY</div>
  ${buildCostSummaryHTML(lineItems, pricing, data, fmt)}

  <!-- CUSTOMER RESPONSIBILITIES -->
  <div class="section-header">CUSTOMER RESPONSIBILITIES</div>
  ${buildResponsibilitiesHTML()}

  <!-- MASSSAVE NOTE -->
  <div class="rebate-box">
    ⭐ <strong>MassSave Rebate Opportunity:</strong> All-electric mini split heat pump systems 
    qualify for MassSave rebates of $1,500–$10,000. EV charger rebates also available. 
    Preferred Builders will assist with all rebate applications prior to installation.
  </div>

</div>

<!-- EXHIBIT A -->
${buildExhibitAHTML(data, fmt)}

<!-- SIGNATURE -->
<div class="content">
  <div class="section-header">ACCEPTANCE</div>
  <p style="margin-bottom:20px;font-size:10pt;">
    By signing below, the customer acknowledges receipt of this Proposal (Quote #${quoteNum}) and 
    authorizes Preferred Builders General Services Inc. to proceed upon receipt of the deposit.
    <strong>This Proposal is not a contract.</strong> A formal Construction Contract will be issued upon acceptance,
    and this Proposal &amp; Scope of Work will be incorporated into that Contract by reference.
  </p>
  ${buildSignatureHTML()}
  <p style="font-size:8.5pt;color:#888;margin-top:16px;">
    Preferred Builders General Services Inc. | LIC# HIC-197400 | 
    37 Duck Mill Road, Fitchburg, MA 01420 | 978-377-1784 | 
    jackson.deaquino@preferredbuildersusa.com
  </p>
</div>

</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════════════
// CONTRACT HTML — formal legal construction agreement
// Structured as numbered Articles, incorporating the Proposal by reference.
// ══════════════════════════════════════════════════════════════════════
function buildContractHTML(data) {
  const customer = data.customer || {};
  const project  = data.project  || {};
  const lineItems = data.lineItems || [];
  const pricing  = data.pricing  || {};
  const fmt = (n) => n ? `$${Number(n).toLocaleString()}` : '$0';

  const quoteNum   = data.quoteNumber || '—';
  const today      = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const total      = pricing.totalContractPrice || data.totalValue || 0;
  const deposit    = pricing.depositAmount || data.depositAmount || 0;
  const depositPct = pricing.depositPercent || 33;
  const city       = project.city || 'the applicable municipality';

  // Payment milestones (deposit = first payment, already in pricing.depositAmount)
  const m2 = Math.round(total * 0.33);
  const m3 = Math.round(total * 0.33);
  const m4 = Math.round(total * 0.01);

  const contractCSS = baseCSS() + `
    .contract-cover {
      background: ${BRAND_BLUE}; color: white;
      padding: 60px 56px 40px; min-height: 260px;
    }
    .contract-cover-label {
      font-size: 9pt; letter-spacing: 3px; text-transform: uppercase;
      opacity: 0.7; margin-bottom: 8px;
    }
    .contract-cover-title {
      font-size: 30pt; font-weight: bold; letter-spacing: 1px; line-height: 1.15;
    }
    .contract-cover-title span { color: ${BRAND_ORANGE}; }
    .contract-cover-divider {
      border: none; border-top: 2px solid ${BRAND_ORANGE};
      margin: 20px 0; opacity: 0.6;
    }
    .contract-cover-meta { font-size: 10.5pt; opacity: 0.85; line-height: 2.1; }
    .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0 24px; }
    .party-box { border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
    .party-box-header { background: ${BRAND_BLUE}; color: white; font-size: 9pt; font-weight: bold;
      letter-spacing: 1px; text-transform: uppercase; padding: 7px 14px; }
    .party-box-header.orange { background: ${BRAND_ORANGE}; }
    .party-box-body { padding: 12px 14px; font-size: 10pt; line-height: 1.8; background: #FAFAFA; }
    .preamble { font-size: 10pt; line-height: 1.75; color: #222; margin: 16px 0 20px;
      border-left: 3px solid ${BRAND_BLUE}; padding-left: 16px; }
    .contract-section { margin-top: 28px; page-break-inside: avoid; }
    .contract-section-title {
      font-size: 11pt; font-weight: bold; color: white;
      background: ${BRAND_BLUE}; padding: 8px 14px;
      margin-bottom: 12px; letter-spacing: 0.3px;
    }
    .contract-section-title.orange { background: ${BRAND_ORANGE}; }
    .ref-box {
      background: #EEF3FB; border: 1px solid #B3C7E8; border-left: 4px solid ${BRAND_BLUE};
      padding: 12px 16px; border-radius: 3px; margin: 0 0 16px;
      font-size: 10pt; color: #1a2a45; line-height: 1.7;
    }
    .payment-table th { background: ${BRAND_BLUE}; color: white; }
    .payment-table td { padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: middle; }
    .payment-table tr.due-at-signing td { background: #FFF8F0; font-weight: bold; }
    .payment-table tr.final-pay td { background: #F0F4FF; }
    .payment-table tr.total-row td { background: ${LIGHT_BLUE}; font-weight: bold; border-top: 2px solid ${BRAND_BLUE}; }
    .milestone-num {
      display: inline-block; width: 22px; height: 22px; border-radius: 50%;
      background: ${BRAND_BLUE}; color: white; font-size: 8.5pt; font-weight: bold;
      text-align: center; line-height: 22px; margin-right: 6px;
    }
    .contract-footer-bar {
      background: ${BRAND_BLUE}; color: white; padding: 10px 56px;
      font-size: 8.5pt; text-align: center; margin-top: 32px;
    }
    .sig-box { border: 1px solid #ccc; border-radius: 4px; padding: 20px 24px; margin-bottom: 20px; }
    .sig-box-title { font-size: 9pt; font-weight: bold; color: ${BRAND_BLUE};
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 14px;
      padding-bottom: 6px; border-bottom: 1px solid #eee; }
    .sig-trio { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-bottom: 14px; }
    .sig-field2 { }
    .sig-line2 { border-bottom: 1.5px solid #555; height: 38px; margin-bottom: 4px; }
    .sig-label2 { font-size: 8.5pt; color: #666; }
    .initials-row { display: flex; gap: 16px; margin-top: 24px; align-items: center; }
    .initials-block { border: 1px solid #ccc; padding: 8px 16px; border-radius: 3px; text-align: center; min-width: 90px; }
    .initials-line { border-bottom: 1px solid #555; height: 30px; margin-bottom: 4px; width: 80px; }
  `;

  const articleCSS = `
    .article { margin: 0 0 6px; page-break-inside: avoid; }
    .article-header {
      background: ${BRAND_BLUE}; color: white;
      padding: 7px 16px; font-size: 10.5pt; font-weight: bold;
      letter-spacing: 0.4px; margin: 22px 0 0; page-break-after: avoid;
    }
    .article-header.orange-hdr { background: ${BRAND_ORANGE}; }
    .article-body { padding: 10px 16px 4px; border-left: 3px solid #E0E8F5; margin-left: 0; }
    .clause { display: flex; gap: 12px; margin: 6px 0; font-size: 9.5pt; line-height: 1.65; color: #222; }
    .clause-num { font-weight: bold; color: ${BRAND_BLUE}; flex-shrink: 0; min-width: 28px; }
    .clause-text { flex: 1; }
    .witnesseth { font-size: 9.5pt; line-height: 1.8; color: #222; margin: 14px 0; padding: 14px 20px;
      border: 1px solid #dde4f0; border-left: 4px solid ${BRAND_BLUE}; background: #F7F9FD; }
    .whereas { margin: 6px 0; }
    .whereas strong { color: ${BRAND_BLUE}; }
    .now-therefore { font-weight: bold; color: ${BRAND_BLUE}; margin-top: 10px; font-size: 9.5pt; }
  `;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>${contractCSS}${articleCSS}</style></head>
<body>

<!-- ═══════════════════ COVER ═══════════════════ -->
<div class="contract-cover">
  <div class="contract-cover-label">Preferred Builders General Services Inc. &nbsp;|&nbsp; LIC# HIC-197400</div>
  <div class="contract-cover-title">HOME IMPROVEMENT<br><span>CONSTRUCTION CONTRACT</span></div>
  <hr class="contract-cover-divider">
  <div class="contract-cover-meta">
    Property Address: &nbsp;<strong>${project.address || '—'}, ${project.city || ''}, ${project.state || 'MA'}</strong><br>
    Owner: &nbsp;<strong>${customer.name || '—'}</strong><br>
    Contract No.: &nbsp;<strong>${quoteNum}</strong><br>
    Date of Agreement: &nbsp;<strong>${today}</strong><br>
    Total Contract Price: &nbsp;<strong>${fmt(total)}</strong>
  </div>
</div>

<div class="content">

<!-- ─── PARTIES ─── -->
<div class="party-grid" style="margin-top:20px;">
  <div class="party-box">
    <div class="party-box-header">Contractor</div>
    <div class="party-box-body">
      <strong>Preferred Builders General Services Inc.</strong><br>
      Massachusetts HIC License No. HIC-197400<br>
      37 Duck Mill Road, Fitchburg, MA 01420<br>
      Tel: 978-377-1784<br>
      jackson.deaquino@preferredbuildersusa.com
    </div>
  </div>
  <div class="party-box">
    <div class="party-box-header orange">Owner</div>
    <div class="party-box-body">
      <strong>${customer.name || '—'}</strong><br>
      ${project.address || ''}<br>
      ${[project.city, project.state].filter(Boolean).join(', ')}<br>
      ${customer.phone ? `Tel: ${customer.phone}<br>` : ''}
      ${customer.email || ''}
    </div>
  </div>
</div>

<!-- ─── WITNESSETH ─── -->
<div class="witnesseth">
  <p style="margin-bottom:8px;">
    This Home Improvement Construction Agreement ("<strong>Agreement</strong>" or "<strong>Contract</strong>") is
    made and entered into as of <strong>${today}</strong>, by and between
    <strong>Preferred Builders General Services Inc.</strong>, a Massachusetts corporation, Massachusetts HIC
    License No. HIC-197400 (hereinafter "<strong>Contractor</strong>"), and
    <strong>${customer.name || '—'}</strong>, owner of the property located at
    <strong>${project.address || '—'}, ${project.city || ''}, ${project.state || 'MA'}</strong>
    (hereinafter "<strong>Owner</strong>").
  </p>
  <div class="whereas"><strong>WITNESSETH:</strong></div>
  <div class="whereas">
    <strong>WHEREAS</strong>, Owner desires to engage Contractor to perform certain home improvement and
    construction work at the above-referenced Property; and
  </div>
  <div class="whereas">
    <strong>WHEREAS</strong>, Contractor is duly licensed under the laws of the Commonwealth of Massachusetts
    and has agreed to perform such work on the terms and conditions set forth herein;
  </div>
  <div class="now-therefore">
    NOW, THEREFORE, in consideration of the mutual covenants and agreements herein contained, and for other
    good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the parties
    hereby agree as follows:
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE I — THE WORK -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header">ARTICLE I — THE WORK</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">1.1</span>
      <span class="clause-text">
        Contractor shall furnish all labor, materials, equipment, tools, supervision, and services necessary to
        complete the work (the "<strong>Work</strong>") at the Property in a good and workmanlike manner, in
        accordance with this Contract and all applicable laws, codes, and regulations.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">1.2</span>
      <span class="clause-text">
        The scope, inclusions, and exclusions of the Work are described in full in the
        <strong>Project Proposal &amp; Scope of Work, Quote No. ${quoteNum}</strong>, dated <strong>${today}</strong>
        (the "<strong>Proposal</strong>"), which is incorporated herein by reference and made a part of this Contract
        as though fully set forth. In the event of any conflict between this Contract and the Proposal, the terms
        of this Contract shall govern.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">1.3</span>
      <span class="clause-text">
        The following table summarizes the phases and trade values included under this Contract. For trade-by-trade
        inclusions, exclusions, and material specifications, Owner shall refer to the Proposal.
      </span>
    </div>
  </div>

  <table class="payment-table" style="margin:0 0 8px;font-size:9.5pt;">
    <tr>
      <th style="width:30%;">Trade / Phase</th>
      <th>Description</th>
      <th style="text-align:right;width:120px;">Contract Value</th>
    </tr>
    ${lineItems.map(item => `
    <tr>
      <td><strong>${item.trade}</strong></td>
      <td style="color:#444;">${item.description ? item.description.substring(0, 130) + (item.description.length > 130 ? '…' : '') : 'Per Proposal — Quote No. ' + quoteNum}</td>
      <td style="text-align:right;">${fmt(item.finalPrice)}</td>
    </tr>`).join('')}
    <tr class="total-row">
      <td colspan="2"><strong>TOTAL CONTRACT PRICE</strong></td>
      <td style="text-align:right;"><strong>${fmt(total)}</strong></td>
    </tr>
  </table>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE II — CONTRACT PRICE -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header orange-hdr">ARTICLE II — CONTRACT PRICE</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">2.1</span>
      <span class="clause-text">
        Owner agrees to pay Contractor the total sum of <strong>${fmt(total)}</strong>
        (the "<strong>Contract Price</strong>") for the full and satisfactory completion of the Work, subject
        to additions and deductions for Change Orders as provided in Article IV.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">2.2</span>
      <span class="clause-text">
        The Contract Price includes contractor-grade material allowances as set forth in
        <strong>Exhibit A — Contractor-Grade Allowance Schedule</strong>, attached hereto and incorporated herein.
        Credits for Owner selections that fall below an allowance amount shall be applied as a credit to the final invoice.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">2.3</span>
      <span class="clause-text">
        <strong>Allowance Overages — Pre-Payment Requirement.</strong>&nbsp;
        Owner acknowledges and agrees that any material or product selection that exceeds the applicable allowance
        amount set forth in Exhibit A shall result in an overage charge equal to the difference between the actual
        cost and the allowance. <em>Such overage amount shall be paid by Owner to Contractor in full prior to
        Contractor's purchase or procurement of the subject item(s).</em> Contractor is under no obligation to
        order or install any item for which an approved allowance overage payment has not been received.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">2.4</span>
      <span class="clause-text">
        <strong>Contractor-Advanced Overages.</strong>&nbsp;
        In the event Contractor, at its sole discretion, elects to advance funds in excess of the applicable
        allowance amount prior to receiving the corresponding overage payment from Owner, the full advanced
        overage amount shall be collected at the next regularly scheduled invoice issuance. Said amount shall
        be clearly itemized on the payment invoice under the line item heading
        "<strong>Reimbursement to Contractor Budget — Allowance Overage</strong>" and shall be due and payable
        by Owner in accordance with the payment terms set forth in Article III. Contractor's election to advance
        funds on one occasion shall not obligate Contractor to do so on any future occasion.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">2.5</span>
      <span class="clause-text">
        All allowance selections shall be submitted by Owner in writing no later than framing completion.
        Late submissions may result in project delays and additional costs for which Contractor shall not be liable.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE III — PAYMENT SCHEDULE -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header">ARTICLE III — PAYMENT SCHEDULE</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">3.1</span>
      <span class="clause-text">
        The Contract Price shall be paid in installments upon completion of the milestones set forth below.
        All payments are due within <strong>five (5) business days</strong> of the applicable milestone.
      </span>
    </div>
  </div>

  <table class="payment-table" style="margin:4px 0 8px;font-size:9.5pt;">
    <tr>
      <th style="width:36px;">#</th>
      <th>Milestone / Trigger Event</th>
      <th style="text-align:center;width:60px;">Share</th>
      <th style="text-align:right;width:120px;">Amount Due</th>
    </tr>
    <tr class="due-at-signing">
      <td style="text-align:center;"><strong>1</strong></td>
      <td><strong>Deposit</strong> — Due upon execution of this Agreement and before Work commences</td>
      <td style="text-align:center;">${depositPct}%</td>
      <td style="text-align:right;"><strong>${fmt(deposit)}</strong></td>
    </tr>
    <tr>
      <td style="text-align:center;"><strong>2</strong></td>
      <td>Foundation completion and passing of foundation inspection</td>
      <td style="text-align:center;">33%</td>
      <td style="text-align:right;">${fmt(m2)}</td>
    </tr>
    <tr>
      <td style="text-align:center;"><strong>3</strong></td>
      <td>Framing inspection approval by the applicable building department</td>
      <td style="text-align:center;">33%</td>
      <td style="text-align:right;">${fmt(m3)}</td>
    </tr>
    <tr class="final-pay">
      <td style="text-align:center;"><strong>4</strong></td>
      <td>Substantial Completion and issuance of Certificate of Occupancy</td>
      <td style="text-align:center;">1%</td>
      <td style="text-align:right;">${fmt(m4)}</td>
    </tr>
    <tr class="total-row">
      <td colspan="2"><strong>TOTAL CONTRACT PRICE</strong></td>
      <td style="text-align:center;"><strong>100%</strong></td>
      <td style="text-align:right;"><strong>${fmt(total)}</strong></td>
    </tr>
  </table>

  <div class="article-body">
    <div class="clause">
      <span class="clause-num">3.2</span>
      <span class="clause-text">
        Any payment not received within five (5) business days of its due date shall bear a late charge of
        <strong>one and one-half percent (1.5%) per month</strong> on the unpaid balance from the due date until
        paid in full.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">3.3</span>
      <span class="clause-text">
        Contractor shall not be required to commence or continue work if any payment is more than ten (10)
        days past due. Contractor may suspend work upon written notice to Owner, and such suspension shall
        not constitute a breach of this Agreement.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE IV — CHANGE ORDERS -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header orange-hdr">ARTICLE IV — CHANGE ORDERS</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">4.1</span>
      <span class="clause-text">
        No changes, additions, deletions, or modifications to the scope of the Work shall be made or
        binding upon either party unless set forth in a written Change Order signed by both Owner and
        Contractor prior to commencement of any additional or modified work.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">4.2</span>
      <span class="clause-text">
        Each Change Order shall specify: (a) the description of work to be added, deleted, or modified;
        (b) the adjustment to the Contract Price; and (c) the adjustment, if any, to the project schedule.
        Verbal authorizations shall not be binding on either party.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">4.3</span>
      <span class="clause-text">
        Owner-requested changes that result in project delays shall extend the completion date by the period
        of such delay, and Contractor shall not be liable for any damages arising from such extensions.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE V — CONTRACTOR'S WARRANTY -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header">ARTICLE V — CONTRACTOR'S WARRANTY</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">5.1</span>
      <span class="clause-text">
        Contractor warrants all workmanship performed under this Agreement for a period of
        <strong>one (1) year</strong> from the date of Substantial Completion. This warranty covers defects
        in workmanship and materials supplied by Contractor that arise under normal use and are reported in
        writing to Contractor within the warranty period.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">5.2</span>
      <span class="clause-text">
        Manufacturer warranties on products and materials installed by Contractor are passed through directly
        to Owner. Contractor will reasonably cooperate in the assertion of manufacturer warranty claims upon
        Owner's written request.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">5.3</span>
      <span class="clause-text">
        This warranty shall be void and of no force or effect if the structure or any component thereof is
        modified, altered, or misused by any party other than Contractor or Contractor's authorized agents.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE VI — OWNER'S OBLIGATIONS -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header orange-hdr">ARTICLE VI — OWNER'S OBLIGATIONS</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">6.1</span>
      <span class="clause-text">
        Owner shall provide Contractor with unobstructed access to the Property and all areas of work
        during normal working hours and as reasonably required to complete the Work.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">6.2</span>
      <span class="clause-text">
        Owner shall maintain homeowner's property insurance on the Property in an amount not less than
        the replacement cost thereof throughout the duration of this Agreement.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">6.3</span>
      <span class="clause-text">
        Owner shall make all progress payments in a timely manner in accordance with Article III.
        Owner shall not withhold payment for any reason other than a bona fide written dispute as to
        work completed.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">6.4</span>
      <span class="clause-text">
        Owner shall submit all material selections, finish choices, and decisions required by Exhibit A
        no later than completion of framing. Owner acknowledges that late or incomplete submissions may
        cause delays and additional costs.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">6.5</span>
      <span class="clause-text">
        Owner shall obtain, at Owner's sole expense, any required easements, rights-of-way, or property
        line clearances necessary for completion of the Work.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">6.6</span>
      <span class="clause-text">
        Owner shall be available for scheduled walkthroughs, milestone inspections, and decision points
        with reasonable notice. Owner's failure to be available shall not delay payment obligations.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE VII — PERMITS & INSPECTIONS -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header">ARTICLE VII — PERMITS &amp; INSPECTIONS</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">7.1</span>
      <span class="clause-text">
        Contractor shall apply for and obtain all building permits required by the Town of ${city}
        for the Work described herein. Permit fees are included in the Contract Price unless otherwise
        noted in the Proposal.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">7.2</span>
      <span class="clause-text">
        Contractor shall schedule and manage all required inspections, including but not limited to
        foundation, framing, rough electrical, rough plumbing, insulation, final electrical, final
        plumbing, and final building inspections. All inspections are included in the Contract Price.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">7.3</span>
      <span class="clause-text">
        Contractor shall obtain a Certificate of Occupancy upon Substantial Completion, provided that
        Owner has fulfilled all obligations under this Agreement, including timely payment.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE VIII — INSURANCE -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header orange-hdr">ARTICLE VIII — INSURANCE</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">8.1</span>
      <span class="clause-text">
        Contractor shall maintain throughout the term of this Agreement:
        (a) Commercial General Liability insurance with limits of not less than <strong>$1,000,000 per
        occurrence</strong> and $2,000,000 in the aggregate; and
        (b) Workers' Compensation insurance as required by Massachusetts law (M.G.L. c. 152).
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">8.2</span>
      <span class="clause-text">
        Certificates of insurance evidencing the coverages required hereunder shall be provided to
        Owner upon written request. Owner shall be named as an additional insured on the Commercial
        General Liability policy.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE IX — SUBSTANTIAL COMPLETION -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header">ARTICLE IX — SUBSTANTIAL COMPLETION</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">9.1</span>
      <span class="clause-text">
        "<strong>Substantial Completion</strong>" means the stage in the progress of the Work when the Work
        is sufficiently complete, as evidenced by issuance of a Certificate of Occupancy by the Town of
        ${city}, such that Owner can occupy or utilize the Property for its intended use.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">9.2</span>
      <span class="clause-text">
        Punch list items remaining at Substantial Completion shall be completed within
        <strong>thirty (30) days</strong> of Substantial Completion, provided Owner cooperates in
        scheduling access. The existence of punch list items shall not constitute grounds to withhold
        the final payment installment.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE X — MECHANIC'S LIEN NOTICE -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header orange-hdr">ARTICLE X — MECHANIC'S LIEN NOTICE (M.G.L. c. 254)</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">10.1</span>
      <span class="clause-text">
        NOTICE: Under Massachusetts law (M.G.L. c. 254), any contractor, subcontractor, laborer, or
        materialman who provides labor or materials for improvements to real property may file a lien
        against that property if they are not paid. Such lien may be filed even if the Owner has paid
        the general contractor in full.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">10.2</span>
      <span class="clause-text">
        To protect Owner's interests, Contractor shall provide lien waivers from all subcontractors and
        material suppliers upon Owner's written request at each payment milestone. Owner may also record
        a Notice of Contract in the applicable Registry of Deeds.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE XI — MA HIC LICENSE DISCLOSURE -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header">ARTICLE XI — MASSACHUSETTS HIC LICENSE DISCLOSURE</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">11.1</span>
      <span class="clause-text">
        Preferred Builders General Services Inc. holds Massachusetts Home Improvement Contractor
        License No. <strong>HIC-197400</strong>, as required by M.G.L. c. 142A. All home improvement
        contractors performing residential contracting in Massachusetts must be registered with the
        Commonwealth. The Arbitration &amp; Guaranty Fund (M.G.L. c. 142A, §17) provides homeowners
        with recourse in the event a registered contractor fails to perform or causes damage.
        For information, visit <em>www.mass.gov/hic</em> or call (617) 973-8700.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE XII — THREE-DAY RIGHT OF RESCISSION -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header orange-hdr">ARTICLE XII — THREE-DAY RIGHT OF RESCISSION</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">12.1</span>
      <span class="clause-text">
        If this Agreement was signed at a location other than Contractor's principal place of business,
        Owner has the right to cancel this Agreement, without penalty or obligation, within
        <strong>three (3) business days</strong> of the date this Agreement was signed. Notice of
        cancellation must be made in writing and delivered or mailed to:
      </span>
    </div>
    <div style="padding:8px 16px 8px 44px;font-size:9.5pt;color:#333;">
      Preferred Builders General Services Inc.<br>
      37 Duck Mill Road, Fitchburg, MA 01420<br>
      Attn: Jackson Deaquino, Project Manager
    </div>
    <div class="clause">
      <span class="clause-num">12.2</span>
      <span class="clause-text">
        If Owner cancels within the rescission period, any deposit paid shall be returned within
        ten (10) business days of receipt of written notice of cancellation.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE XIII — DISPUTE RESOLUTION -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header">ARTICLE XIII — DISPUTE RESOLUTION</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">13.1</span>
      <span class="clause-text">
        The parties agree to make a good-faith effort to resolve any dispute arising out of or relating
        to this Agreement, including its validity, breach, or performance, through direct negotiation
        before resorting to formal proceedings.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">13.2</span>
      <span class="clause-text">
        If direct negotiation fails, the dispute shall be submitted to non-binding mediation before a
        mutually agreed-upon mediator. The cost of mediation shall be shared equally by the parties.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">13.3</span>
      <span class="clause-text">
        If mediation is unsuccessful, any unresolved dispute shall be submitted to binding arbitration
        pursuant to the Construction Industry Arbitration Rules of the American Arbitration Association
        then in effect. The award of the arbitrator shall be final and binding. Judgment upon the award
        may be entered in any court of competent jurisdiction. The prevailing party shall be entitled
        to recover reasonable attorneys' fees and costs.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">13.4</span>
      <span class="clause-text">
        This Agreement shall be governed by and construed in accordance with the laws of the
        <strong>Commonwealth of Massachusetts</strong>, without regard to conflict-of-law principles.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE XIV — FORCE MAJEURE -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header orange-hdr">ARTICLE XIV — FORCE MAJEURE</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">14.1</span>
      <span class="clause-text">
        Neither party shall be in default or liable to the other for delays caused by circumstances
        beyond its reasonable control, including but not limited to: acts of God, severe weather events,
        fire, strikes, labor disputes, material or equipment shortages, government-ordered shutdowns,
        pandemic, or failure of public utilities ("<strong>Force Majeure Event</strong>").
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">14.2</span>
      <span class="clause-text">
        The party experiencing a Force Majeure Event shall provide written notice to the other party
        within five (5) business days of the event's occurrence. The completion schedule and any
        affected milestone dates shall be extended by the period of the Force Majeure Event.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE XV — TERMINATION -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header">ARTICLE XV — TERMINATION</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">15.1</span>
      <span class="clause-text">
        <em>Termination by Owner for Cause:</em> Owner may terminate this Agreement for cause if
        Contractor materially breaches this Agreement and fails to cure such breach within
        <strong>fourteen (14) calendar days</strong> after receipt of written notice specifying the
        nature of the breach.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">15.2</span>
      <span class="clause-text">
        <em>Termination by Contractor for Cause:</em> Contractor may terminate this Agreement if
        Owner fails to make any payment when due under Article III and fails to cure such non-payment
        within <strong>seven (7) calendar days</strong> after receipt of written notice.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">15.3</span>
      <span class="clause-text">
        Upon termination for any reason, Owner shall pay Contractor for all Work completed and
        materials ordered, fabricated, or delivered as of the termination date, plus reasonable
        overhead and profit on completed Work. Contractor shall have no obligation to return
        any materials incorporated into the Work.
      </span>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ARTICLE XVI — GENERAL PROVISIONS -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="article">
  <div class="article-header orange-hdr">ARTICLE XVI — GENERAL PROVISIONS</div>
  <div class="article-body">
    <div class="clause">
      <span class="clause-num">16.1</span>
      <span class="clause-text">
        <em>Entire Agreement:</em> This Agreement, together with the Proposal (Quote No. ${quoteNum})
        and Exhibit A incorporated herein, constitutes the entire agreement between the parties
        with respect to the subject matter hereof and supersedes all prior negotiations,
        representations, warranties, and agreements, whether oral or written.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">16.2</span>
      <span class="clause-text">
        <em>Modifications:</em> This Agreement may not be amended or modified except by a written
        instrument signed by both parties. No waiver of any provision shall be effective unless in writing.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">16.3</span>
      <span class="clause-text">
        <em>Severability:</em> If any provision of this Agreement is held to be invalid, illegal, or
        unenforceable under applicable law, the remaining provisions shall continue in full force and effect.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">16.4</span>
      <span class="clause-text">
        <em>Notices:</em> All notices required or permitted under this Agreement shall be in writing
        and delivered by hand, certified mail, or email with read receipt to the addresses set forth
        on the cover page of this Agreement.
      </span>
    </div>
    <div class="clause">
      <span class="clause-num">16.5</span>
      <span class="clause-text">
        <em>Counterparts:</em> This Agreement may be executed in counterparts, each of which shall
        be deemed an original, and all of which together shall constitute one and the same instrument.
        Electronic or digital signatures shall be deemed valid and binding.
      </span>
    </div>
  </div>
</div>

</div><!-- end .content -->

<!-- ═══ EXHIBIT A ═══ -->
${buildExhibitAHTML(data, fmt)}

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- SIGNATURE / EXECUTION PAGE -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="content page-break">
  <div style="text-align:center;margin-bottom:20px;">
    <div style="font-size:14pt;font-weight:bold;color:${BRAND_BLUE};letter-spacing:0.5px;">IN WITNESS WHEREOF</div>
    <p style="font-size:10pt;color:#333;margin-top:8px;line-height:1.7;">
      the parties have executed this Home Improvement Construction Agreement as of the date first written above.
      Each party represents that it has read this Agreement in its entirety, understands its terms, and is
      authorized to execute it.
    </p>
  </div>

  <div class="sig-box">
    <div class="sig-box-title">Owner / Client</div>
    <div class="sig-trio">
      <div class="sig-field2">
        <div class="sig-line2"></div>
        <div class="sig-label2">Owner Signature</div>
      </div>
      <div class="sig-field2">
        <div class="sig-line2"></div>
        <div class="sig-label2">Date</div>
      </div>
    </div>
    <div class="sig-trio">
      <div class="sig-field2">
        <div class="sig-line2"></div>
        <div class="sig-label2">Printed Name</div>
      </div>
      <div class="sig-field2">
        <div class="sig-line2"></div>
        <div class="sig-label2">Phone / Email</div>
      </div>
    </div>
    <div style="font-size:9pt;color:#555;margin-top:6px;">
      Property Address: ${project.address || ''}, ${project.city || ''}, ${project.state || 'MA'}
    </div>
  </div>

  <div class="sig-box" style="border-color:${BRAND_BLUE};">
    <div class="sig-box-title">Contractor — Preferred Builders General Services Inc.</div>
    <div class="sig-trio">
      <div class="sig-field2">
        <div class="sig-line2" style="border-color:${BRAND_BLUE};"></div>
        <div class="sig-label2">Authorized Signature</div>
      </div>
      <div class="sig-field2">
        <div class="sig-line2"></div>
        <div class="sig-label2">Date</div>
      </div>
    </div>
    <div class="sig-trio">
      <div class="sig-field2">
        <div class="sig-line2"></div>
        <div class="sig-label2">Printed Name &amp; Title — Jackson Deaquino, Project Manager</div>
      </div>
      <div class="sig-field2">
        <div class="sig-line2"></div>
        <div class="sig-label2">MA HIC License No. HIC-197400</div>
      </div>
    </div>
    <div style="font-size:9pt;color:#555;margin-top:6px;">
      37 Duck Mill Road, Fitchburg, MA 01420 &nbsp;|&nbsp; 978-377-1784
    </div>
  </div>

  <div class="initials-row" style="margin-top:16px;">
    <span style="font-size:9pt;color:#555;font-weight:bold;white-space:nowrap;">INITIALS — BOTH PARTIES:</span>
    <div class="initials-block">
      <div class="initials-line"></div>
      <div style="font-size:8pt;color:#666;">Owner</div>
    </div>
    <div class="initials-block">
      <div class="initials-line"></div>
      <div style="font-size:8pt;color:#666;">Contractor</div>
    </div>
    <span style="font-size:9pt;color:#666;flex:1;line-height:1.5;">
      Initialing confirms receipt and review of: (1) this Agreement, (2) Project Proposal &amp; Scope of Work — Quote No. ${quoteNum}, (3) Exhibit A — Allowance Schedule, and (4) Addendum 1 — Notice of Contract.
    </span>
  </div>

  <p style="font-size:8pt;color:#aaa;margin-top:28px;text-align:center;border-top:1px solid #eee;padding-top:10px;">
    Preferred Builders General Services Inc. | LIC# HIC-197400 | 
    37 Duck Mill Road, Fitchburg, MA 01420 | 978-377-1784 | 
    jackson.deaquino@preferredbuildersusa.com
  </p>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!-- ADDENDUM 1 — NOTICE OF CONTRACT (M.G.L. c. 254, §4)      -->
<!-- ═══════════════════════════════════════════════════════════ -->
${buildNoticeOfContractHTML({ customer, project, quoteNum, today, total, lineItems, fmt })}

</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════════════
// SECTION BUILDERS — all template logic lives here
// ══════════════════════════════════════════════════════════════════════

function buildScopeHTML(lineItems) {
  return lineItems.map(item => {
    const included = item.scopeIncluded || [];
    return `
    <div class="sub-header">${item.trade}</div>
    ${item.description ? `<p style="font-size:10.5pt;color:#333;margin-bottom:10px;line-height:1.6;">${item.description}</p>` : ''}
    ${included.length ? `
    <p style="font-size:9.5pt;font-weight:bold;color:${BRAND_BLUE};margin:6px 0 4px;">This trade includes:</p>
    <ul class="check-list">
      ${included.map(i => `<li class="yes"><span class="label">${i}</span></li>`).join('')}
    </ul>` : ''}`;
  }).join('');
}

function buildExclusionsHTML(exclusions) {
  return `
  <table>
    <tr><th>Excluded Item</th><th>Why Excluded</th><th>Customer Budget Estimate</th></tr>
    ${exclusions.map(item => `
    <tr>
      <td><strong>${item.name || ''}</strong></td>
      <td>${item.reason || '—'}</td>
      <td>${item.budget || '—'}</td>
    </tr>`).join('')}
  </table>`;
}

function buildPermitChecklistHTML(data) {
  const job      = data.job     || {};
  const project  = data.project || {};
  const trades   = job.trades   || {};

  const isStretchCode   = project.stretchCodeTown || data.isStretchCodeTown || false;
  const isNewConstruct  = project.type === 'new_construction';
  const isADU           = project.type === 'adu';
  // hasBedrooms = true only for structures with actual sleeping/living quarters
  // (new homes, ADUs, in-law suites) — NOT garages, studios, workshops, art rooms, half-bath-only structures
  const hasBedrooms     = !!(project.hasBedrooms || isADU);
  // C of O only when the structure has bedrooms (residential living dwelling)
  const needsCO         = (isNewConstruct || isADU) && hasBedrooms;
  // HERS rating only for residential dwelling with bedrooms in a stretch code town
  const needsHERS       = isStretchCode && (isNewConstruct || isADU) && hasBedrooms;
  const hasElectrical   = !!trades.electrical;
  const hasPlumbing     = !!trades.plumbing;
  const hasHVAC         = !!trades.hvac;
  const hasSprinkler    = !!trades.sprinkler;
  const hasAnyTrade     = hasElectrical || hasPlumbing || hasHVAC || hasSprinkler;
  const needsPermit     = !!job.has_permit;
  const hasFraming      = !!job.has_framing || isNewConstruct;
  const hasInsulation   = !!job.has_insulation;

  // No permit and no trade work → no inspections at all
  if (!needsPermit && !hasAnyTrade && !isNewConstruct) {
    return `
  <div class="section-header">PERMIT &amp; INSPECTION STATUS</div>
  <div class="note-box">
    No permit or municipal inspections are required for this scope of work.
  </div>`;
  }

  const rows = [];

  // Foundation — new construction only
  if (isNewConstruct) rows.push('Foundation inspection');

  // Framing — if structural work or new build
  if (hasFraming) rows.push('Framing inspection');

  // Rough trade inspections
  if (hasElectrical) rows.push('Rough electrical inspection');
  if (hasPlumbing)   rows.push('Rough plumbing inspection');
  if (hasHVAC)       rows.push('Rough mechanical (HVAC) inspection');
  if (hasSprinkler)  rows.push('Rough sprinkler inspection');

  // Insulation
  if (hasInsulation) rows.push('Insulation inspection');

  // Final trade inspections
  if (hasElectrical) rows.push('Final electrical inspection');
  if (hasPlumbing)   rows.push('Final plumbing inspection');
  if (hasHVAC)       rows.push('Final mechanical (HVAC) inspection');
  if (hasSprinkler)  rows.push('Final sprinkler inspection');

  // Final building inspection — any permitted or structural work
  if (needsPermit || hasFraming || isNewConstruct) rows.push('Final building inspection');

  // HERS rating + blower door — only for ADU (living dwelling with bedrooms) in a stretch code town
  if (needsHERS) rows.push('HERS rating and blower door test (Stretch Code — ADU residential unit)');

  // Closing certificate:
  // C of O → ADU only (new residential living dwelling with bedrooms)
  // Certificate of Completion → new construction of accessory structures (garage, studio) and all renovations
  if (needsCO) {
    rows.push('Certificate of Occupancy (residential dwelling unit)');
  } else if (needsPermit || hasAnyTrade || isNewConstruct) {
    rows.push('Certificate of Completion');
  }

  return `
  <div class="section-header">PERMIT &amp; INSPECTION CHECKLIST</div>
  <p style="margin-bottom:10px;font-size:10pt;">The following inspections are required for this scope of work and are included in this proposal:</p>
  <table>
    <tr><th>Inspection / Milestone</th><th>Status</th></tr>
    ${rows.map(item => `
    <tr>
      <td>${item}</td>
      <td style="color:#2E7D32;font-weight:bold;">✓ Included</td>
    </tr>`).join('')}
  </table>`;
}

function buildCostSummaryHTML(lineItems, pricing, data, fmt) {
  let rows = lineItems.map(item => `
    <tr>
      <td>${item.trade}</td>
      <td style="text-align:right;">${fmt(item.finalPrice)}</td>
    </tr>`).join('');

  rows += `
    <tr class="total">
      <td>TOTAL CONTRACT VALUE</td>
      <td style="text-align:right;">${fmt(pricing.totalContractPrice || data.totalValue)}</td>
    </tr>
    <tr class="deposit">
      <td>DEPOSIT REQUIRED (${pricing.depositPercent || 33}%)</td>
      <td style="text-align:right;">${fmt(pricing.depositAmount || data.depositAmount)}</td>
    </tr>`;

  return `
  <table>
    <tr><th>Trade / Phase</th><th style="text-align:right;">Price</th></tr>
    ${rows}
  </table>`;
}

function buildResponsibilitiesHTML() {
  const items = [
    'Provide clear site access for construction vehicles and material deliveries',
    'Maintain homeowner\'s insurance during construction period',
    'Make timely progress payments per contract schedule',
    'Submit all material selections no later than framing completion',
    'Provide written approval for any change orders before work begins',
    'Obtain any required easements or property line clearances',
    'Be available for walkthroughs and milestone inspections when scheduled'
  ];
  return `
  <ul class="check-list">
    ${items.map(item => `<li class="bullet">${item}</li>`).join('')}
  </ul>`;
}

function buildSignatureHTML() {
  return `
  <div class="sig-block">
    <div class="sig-row">
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Customer Signature</div>
      </div>
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Date</div>
      </div>
    </div>
    <div class="sig-row">
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Printed Name</div>
      </div>
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Phone / Email</div>
      </div>
    </div>
    <div class="sig-row">
      <div class="sig-field">
        <div class="sig-line" style="border-bottom-color:${BRAND_BLUE}"></div>
        <div class="sig-label">Jackson Deaquino — Project Manager, Preferred Builders</div>
      </div>
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Date</div>
      </div>
    </div>
  </div>`;
}

function buildExhibitAHTML(data, fmt) {
  const { getDb } = require('../db/database');
  let settings = {};
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings WHERE category = ?').all('allowance');
    for (const row of rows) {
      try { settings[row.key] = JSON.parse(row.value); }
      catch { settings[row.key] = row.value; }
    }
  } catch (e) {}

  const customer = data.customer || {};
  const project = data.project || {};
  const quoteNum = data.quoteNumber || '';

  const get = (key, fallback) => {
    const v = settings[key];
    return v && typeof v === 'object' ? v : { amount: fallback, spec: '' };
  };

  const flooring = get('allowance.lvp', 6.50);
  const bathTile = get('allowance.tileBath', 4.50);
  const carpet = get('allowance.carpet', 3.50);
  const cabinets = get('allowance.cabinets', 12000);
  const quartz = get('allowance.quartz', 4250);
  const kitFaucet = get('allowance.kitFaucet', 250);
  const kitSink = get('allowance.kitSink', 350);
  const disposal = get('allowance.disposal', 150);
  const vanityFull = get('allowance.vanity', 650);
  const vanityHalf = get('allowance.vanitySmall', 350);
  const vanityTop = get('allowance.vanityTop', 350);
  const bathFaucet = get('allowance.bathFaucet', 180);
  const toilet = get('allowance.toilet', 280);
  const tub = get('allowance.tub', 850);
  const showerValve = get('allowance.showerValve', 350);
  const showerDoor = get('allowance.showerDoor', 250);
  const bathAccessories = get('allowance.bathAcc', 150);
  const exhaustFan = get('allowance.exhaustFan', 85);
  const intDoor = get('allowance.intDoor', 180);
  const passage = get('allowance.passage', 45);
  const privacy = get('allowance.privacy', 55);
  const bifold = get('allowance.bifold', 175);
  const baseMold = get('allowance.baseMold', 1.85);
  const casing = get('allowance.casing', 1.65);
  const windowStool = get('allowance.windowStool', 85);

  const fmtAmt = (v) => {
    if (typeof v === 'object' && v.amount !== undefined) return v.amount;
    return v;
  };

  return `
<div class="exhibit-header">
  <span class="exhibit-label">EXHIBIT A</span>
  <span class="exhibit-name">CONTRACTOR-GRADE ALLOWANCE SCHEDULE</span>
  <div class="exhibit-sub">${customer.name || ''} | ${project.address || ''} | Quote #${quoteNum}</div>
</div>

<div class="content">
  <p style="font-size:10pt;margin-bottom:12px;">
    The following allowances are included in the Contract Price and represent contractor-grade material pricing
    through Preferred Builders' trade accounts. If Owner selections fall <strong>below</strong> an allowance, the
    difference is applied as a credit on the final invoice. If Owner selections <strong>exceed</strong> an
    allowance, the overage is due and payable by Owner to Contractor <em>prior to purchase of the item</em>
    (see Contract Article II, Clauses 2.3 – 2.4). In the event Contractor elects to advance an overage,
    the reimbursement will appear on the next payment invoice as
    "<strong>Reimbursement to Contractor Budget — Allowance Overage</strong>."
  </p>
  <div class="note-box">
    📌 All selections must be submitted to Preferred Builders in writing no later than framing completion. 
    Late selections may cause project delays and additional costs for which Contractor shall not be liable.
  </div>

  <div class="sub-header">FLOORING</div>
  <table>
    <tr><th>Item</th><th>Location</th><th>Allowance</th><th>Spec</th></tr>
    <tr><td>LVP / Engineered Hardwood</td><td>All living areas</td><td>$${fmtAmt(flooring)}/sq ft</td><td>Supply only — Shaw, Armstrong or equiv</td></tr>
    <tr><td>Bath Floor Tile</td><td>All bathrooms</td><td>$${fmtAmt(bathTile)}/sq ft</td><td>12×12 ceramic or porcelain, supply only</td></tr>
    <tr><td>Carpet</td><td>Bedrooms (if selected)</td><td>$${fmtAmt(carpet)}/sq ft</td><td>Contractor grade, supply only</td></tr>
  </table>

  <div class="sub-header">KITCHEN</div>
  <table>
    <tr><th>Item</th><th>Allowance</th><th>Contractor-Grade Spec</th></tr>
    <tr><td>Cabinets — Base & Upper</td><td>$${Number(fmtAmt(cabinets)).toLocaleString()}</td><td>Stock/semi-stock — Kraftmaid, Yorktowne or equiv</td></tr>
    <tr><td>Countertop — Quartz</td><td>$${Number(fmtAmt(quartz)).toLocaleString()}</td><td>3cm slab — Cambria, MSI or equiv, up to 30 LF</td></tr>
    <tr><td>Kitchen Faucet</td><td>$${fmtAmt(kitFaucet)} each</td><td>Moen, Delta or Kohler — pull-down single handle</td></tr>
    <tr><td>Kitchen Sink</td><td>$${fmtAmt(kitSink)} each</td><td>Stainless undermount 60/40 double bowl</td></tr>
    <tr><td>Garbage Disposal</td><td>$${fmtAmt(disposal)} each</td><td>InSinkErator 1/2 HP contractor grade</td></tr>
  </table>

  <div class="sub-header">BATHROOMS</div>
  <table>
    <tr><th>Item</th><th>Allowance</th><th>Contractor-Grade Spec</th></tr>
    <tr><td>Vanity (full bath)</td><td>$${fmtAmt(vanityFull)} each</td><td>48"–60" stock — Kraftmaid, RSI or equiv</td></tr>
    <tr><td>Vanity (half bath)</td><td>$${fmtAmt(vanityHalf)} each</td><td>24"–30" stock</td></tr>
    <tr><td>Vanity Top / Sink</td><td>$${fmtAmt(vanityTop)} each</td><td>Cultured marble integrated</td></tr>
    <tr><td>Bath Faucet</td><td>$${fmtAmt(bathFaucet)} each</td><td>Moen Adler or Delta Foundations</td></tr>
    <tr><td>Toilet</td><td>$${fmtAmt(toilet)} each</td><td>Kohler Cimarron or Am Std — elongated 1.28 GPF</td></tr>
    <tr><td>Bathtub</td><td>$${fmtAmt(tub)} each</td><td>Alcove 60" — American Standard or Kohler</td></tr>
    <tr><td>Shower Valve & Trim</td><td>$${fmtAmt(showerValve)} each</td><td>Moen Posi-Temp or Delta Monitor</td></tr>
    <tr><td>Shower Door</td><td>$${fmtAmt(showerDoor)} each</td><td>Frameless bypass or curtain rod</td></tr>
    <tr><td>Bath Accessories</td><td>$${fmtAmt(bathAccessories)} per set</td><td>TP holder, towel bar, robe hook — matching set</td></tr>
    <tr><td>Exhaust Fan</td><td>$${fmtAmt(exhaustFan)} each</td><td>Broan or Panasonic — 80 CFM min (Stretch Code)</td></tr>
  </table>

  <div class="sub-header">DOORS & HARDWARE</div>
  <table>
    <tr><th>Item</th><th>Allowance</th><th>Spec</th></tr>
    <tr><td>Interior Door</td><td>$${fmtAmt(intDoor)} each</td><td>Hollow/solid core — 6-panel primed — Masonite or equiv</td></tr>
    <tr><td>Passage Set (doorknob)</td><td>$${fmtAmt(passage)} each</td><td>Kwikset or Schlage — satin nickel</td></tr>
    <tr><td>Privacy Set (bath/bed)</td><td>$${fmtAmt(privacy)} each</td><td>Kwikset or Schlage lockset</td></tr>
    <tr><td>Bifold Door</td><td>$${fmtAmt(bifold)} each</td><td>6-panel primed white</td></tr>
    <tr><td>Base Molding</td><td>$${fmtAmt(baseMold)}/LF</td><td>3-1/4" colonial or craftsman primed MDF</td></tr>
    <tr><td>Door/Window Casing</td><td>$${fmtAmt(casing)}/LF</td><td>2-1/4" colonial primed MDF</td></tr>
    <tr><td>Window Stool & Apron</td><td>$${fmtAmt(windowStool)} each</td><td>Primed MDF</td></tr>
  </table>

  <div class="note-box">
    All allowances are contractor-grade pricing through Preferred Builders' trade accounts. 
    Retail equivalents typically run 20–40% higher. Preferred Builders can assist in sourcing all items — 
    customers are not required to source independently.
  </div>

  <p style="font-size:9pt;margin-top:16px;">
    <strong>Allowance Terms:</strong> Selections exceeding the allowance are billed as change orders prior to ordering. 
    Credits for under-allowance selections are applied to the final invoice. All selections must be in writing. 
    This schedule is incorporated into and part of the contract.
  </p>

  <div class="sig-block" style="margin-top:32px;">
    <div class="sig-row">
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Customer Initials — Exhibit A Acknowledged</div>
      </div>
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Date</div>
      </div>
    </div>
  </div>
</div>`;
}

// ══════════════════════════════════════════════════════════════════════
// ADDENDUM 1 — NOTICE OF CONTRACT (M.G.L. Chapter 254, Section 4)
// A standalone, notarizable document for filing at the Registry of Deeds
// to establish and protect the Contractor's mechanic's lien rights.
// ══════════════════════════════════════════════════════════════════════
function buildNoticeOfContractHTML({ customer, project, quoteNum, today, total, lineItems, fmt }) {
  const workDescription = lineItems.map(i => i.trade).join('; ') || 'General construction and home improvement work';
  const county = 'Worcester'; // default; Townsend MA is Worcester County

  const noticeCSS = `
    .notice-page { page-break-before: always; font-family: Arial, sans-serif; }
    .recording-box {
      border: 2px solid #1B3A6B; padding: 14px 18px; margin-bottom: 20px;
      font-size: 9pt; color: #333; line-height: 1.8;
    }
    .recording-box-title {
      font-size: 8pt; font-weight: bold; text-transform: uppercase;
      color: #1B3A6B; letter-spacing: 0.5px; margin-bottom: 6px;
    }
    .notice-title {
      text-align: center; margin: 16px 0 4px;
    }
    .notice-title-main {
      font-size: 18pt; font-weight: bold; color: #1B3A6B; letter-spacing: 1px;
    }
    .notice-title-sub {
      font-size: 10pt; color: #555; margin-top: 4px;
    }
    .notice-divider {
      border: none; border-top: 2px solid #E07B2A; margin: 12px 0;
    }
    .notice-field { display: flex; margin: 10px 0; font-size: 10pt; align-items: flex-start; }
    .notice-label { font-weight: bold; color: #1B3A6B; min-width: 200px; flex-shrink: 0; font-size: 9.5pt; padding-top: 2px; }
    .notice-value { flex: 1; border-bottom: 1px solid #999; padding-bottom: 3px; min-height: 22px; line-height: 1.5; }
    .notice-section-title {
      font-size: 10pt; font-weight: bold; background: #1B3A6B; color: white;
      padding: 6px 14px; margin: 18px 0 8px;
    }
    .notary-box {
      border: 1px solid #ccc; padding: 16px 18px; margin-top: 12px;
      font-size: 9pt; color: #333; line-height: 2;
    }
    .notary-box-title {
      font-weight: bold; font-size: 10pt; color: #1B3A6B;
      border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 10px;
    }
    .notary-field-row { display: flex; gap: 24px; margin-top: 14px; }
    .notary-field { flex: 1; }
    .notary-line { border-bottom: 1px solid #555; height: 28px; margin-bottom: 3px; }
    .notary-label { font-size: 8pt; color: #666; }
    .stamp-area {
      border: 1px dashed #ccc; height: 80px; margin-top: 14px;
      display: flex; align-items: center; justify-content: center;
      color: #aaa; font-size: 9pt; font-style: italic;
    }
    .notice-sig-row { display: flex; gap: 32px; margin: 12px 0; }
    .notice-sig-field { flex: 1; }
    .notice-sig-line { border-bottom: 1.5px solid #555; height: 36px; margin-bottom: 4px; }
    .notice-sig-label { font-size: 8.5pt; color: #555; }
    .statutory-note {
      font-size: 8.5pt; color: #555; font-style: italic;
      border-left: 3px solid #E07B2A; padding: 8px 12px;
      margin: 12px 0; background: #FFFAF5; line-height: 1.65;
    }
  `;

  return `
<div class="notice-page" style="padding: 0 56px;">
<style>${noticeCSS}</style>

<!-- RECORDING INFORMATION BOX -->
<div class="recording-box">
  <div class="recording-box-title">For Recording at the ${county} County Registry of Deeds</div>
  <div style="display:flex;gap:40px;font-size:9pt;">
    <div style="flex:1;">
      <div>Book: &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:80px;">&nbsp;</span></div>
      <div style="margin-top:6px;">Page: &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:80px;">&nbsp;</span></div>
    </div>
    <div style="flex:1;">
      <div>Document No.: &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:100px;">&nbsp;</span></div>
      <div style="margin-top:6px;">Date Recorded: &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:100px;">&nbsp;</span></div>
    </div>
    <div style="flex:1;text-align:right;font-style:italic;color:#888;">
      Registry use only.<br>Do not write below this line.
    </div>
  </div>
</div>

<!-- TITLE -->
<div class="notice-title">
  <div style="font-size:8pt;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Addendum 1 to Construction Contract No. ${quoteNum}</div>
  <div class="notice-title-main">NOTICE OF CONTRACT</div>
  <div class="notice-title-sub">Pursuant to Massachusetts General Laws Chapter 254, Section 4</div>
</div>

<hr class="notice-divider">

<div class="statutory-note">
  This Notice of Contract is filed pursuant to M.G.L. c. 254, §4 to give notice to all persons that the
  Contractor named below has entered into a contract for the improvement of the real property described herein,
  and to preserve the Contractor's right to file a Notice of Contract and assert a mechanic's lien against
  said property in accordance with M.G.L. c. 254. This document should be recorded at the
  ${county} County Registry of Deeds prior to commencement of work.
</div>

<!-- OWNER -->
<div class="notice-section-title">I. OWNER OF THE PROPERTY</div>
<div class="notice-field">
  <span class="notice-label">Full Legal Name:</span>
  <span class="notice-value">${customer.name || ''}</span>
</div>
<div class="notice-field">
  <span class="notice-label">Address:</span>
  <span class="notice-value">${project.address || ''}, ${project.city || ''}, ${project.state || 'MA'}</span>
</div>
<div class="notice-field">
  <span class="notice-label">Phone:</span>
  <span class="notice-value">${customer.phone || ''}</span>
</div>
<div class="notice-field">
  <span class="notice-label">Email:</span>
  <span class="notice-value">${customer.email || ''}</span>
</div>

<!-- CONTRACTOR -->
<div class="notice-section-title">II. CONTRACTOR</div>
<div class="notice-field">
  <span class="notice-label">Full Legal Name:</span>
  <span class="notice-value">Preferred Builders General Services Inc.</span>
</div>
<div class="notice-field">
  <span class="notice-label">Address:</span>
  <span class="notice-value">37 Duck Mill Road, Fitchburg, MA 01420</span>
</div>
<div class="notice-field">
  <span class="notice-label">HIC License No.:</span>
  <span class="notice-value">HIC-197400</span>
</div>
<div class="notice-field">
  <span class="notice-label">Phone:</span>
  <span class="notice-value">978-377-1784</span>
</div>
<div class="notice-field">
  <span class="notice-label">Authorized Representative:</span>
  <span class="notice-value">Jackson Deaquino, Project Manager</span>
</div>

<!-- PROPERTY -->
<div class="notice-section-title">III. PROPERTY SUBJECT TO LIEN</div>
<div class="notice-field">
  <span class="notice-label">Property Address:</span>
  <span class="notice-value">${project.address || ''}, ${project.city || ''}, ${project.state || 'MA'}</span>
</div>
<div class="notice-field">
  <span class="notice-label">County:</span>
  <span class="notice-value">${county} County, Commonwealth of Massachusetts</span>
</div>
<div class="notice-field">
  <span class="notice-label">Assessor's Parcel No.:</span>
  <span class="notice-value">&nbsp;</span>
</div>
<div class="notice-field">
  <span class="notice-label">Title Reference:</span>
  <span class="notice-value">Book &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;, Page &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;, ${county} County Registry of Deeds</span>
</div>

<!-- CONTRACT DETAILS -->
<div class="notice-section-title">IV. CONTRACT DETAILS</div>
<div class="notice-field">
  <span class="notice-label">Contract / Quote No.:</span>
  <span class="notice-value">${quoteNum}</span>
</div>
<div class="notice-field">
  <span class="notice-label">Date of Contract:</span>
  <span class="notice-value">${today}</span>
</div>
<div class="notice-field">
  <span class="notice-label">Original Contract Price:</span>
  <span class="notice-value"><strong>${fmt(total)}</strong></span>
</div>
<div class="notice-field">
  <span class="notice-label">General Description of Work:</span>
  <span class="notice-value">${workDescription}. Work to be performed at the property described in Section III above, as more particularly described in the Project Proposal &amp; Scope of Work, Quote No. ${quoteNum}, incorporated herein by reference.</span>
</div>

<!-- SIGNATURES -->
<div class="notice-section-title">V. SIGNATURES</div>
<p style="font-size:9.5pt;color:#333;margin-bottom:14px;line-height:1.6;">
  The undersigned parties hereby certify that the above information is true and accurate and that a Construction
  Contract for the work described herein has been duly executed.
</p>

<div class="notice-sig-row">
  <div class="notice-sig-field">
    <div class="notice-sig-line"></div>
    <div class="notice-sig-label">Owner Signature</div>
  </div>
  <div class="notice-sig-field">
    <div class="notice-sig-line"></div>
    <div class="notice-sig-label">Date</div>
  </div>
</div>
<div class="notice-sig-row" style="margin-bottom:20px;">
  <div class="notice-sig-field">
    <div class="notice-sig-line"></div>
    <div class="notice-sig-label">Owner Printed Name: &nbsp;${customer.name || ''}</div>
  </div>
  <div class="notice-sig-field">
    <div class="notice-sig-line"></div>
    <div class="notice-sig-label">Phone / Email</div>
  </div>
</div>

<div class="notice-sig-row">
  <div class="notice-sig-field">
    <div class="notice-sig-line" style="border-color:#1B3A6B;"></div>
    <div class="notice-sig-label">Contractor Authorized Signature</div>
  </div>
  <div class="notice-sig-field">
    <div class="notice-sig-line"></div>
    <div class="notice-sig-label">Date</div>
  </div>
</div>
<div class="notice-sig-row" style="margin-bottom:24px;">
  <div class="notice-sig-field">
    <div class="notice-sig-line"></div>
    <div class="notice-sig-label">Printed Name &amp; Title: &nbsp;Jackson Deaquino, Project Manager — Preferred Builders General Services Inc.</div>
  </div>
  <div class="notice-sig-field">
    <div class="notice-sig-line"></div>
    <div class="notice-sig-label">MA HIC License No. HIC-197400</div>
  </div>
</div>

<!-- NOTARY — OWNER -->
<div class="notary-box">
  <div class="notary-box-title">Acknowledgment of Owner — Commonwealth of Massachusetts</div>
  <div style="font-size:9pt;line-height:1.9;">
    Commonwealth of Massachusetts<br>
    County of &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:120px;">&nbsp;</span>
    &nbsp;&nbsp;ss.<br><br>
    On this &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:40px;">&nbsp;</span>&nbsp; day of
    &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:100px;">&nbsp;</span>,
    &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:60px;">&nbsp;</span>,
    before me, the undersigned notary public, personally appeared
    &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:180px;">&nbsp;</span>,
    proved to me through satisfactory evidence of identification, which was
    &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:180px;">&nbsp;</span>,
    to be the person whose name is signed on this document, and acknowledged to me that
    he/she signed it voluntarily for its stated purpose.
  </div>
  <div class="notary-field-row">
    <div class="notary-field">
      <div class="notary-line"></div>
      <div class="notary-label">Notary Public Signature</div>
    </div>
    <div class="notary-field">
      <div class="notary-line"></div>
      <div class="notary-label">My Commission Expires</div>
    </div>
    <div class="notary-field">
      <div class="stamp-area">[ Notary Seal ]</div>
    </div>
  </div>
</div>

<!-- NOTARY — CONTRACTOR -->
<div class="notary-box" style="margin-top:16px;">
  <div class="notary-box-title">Acknowledgment of Contractor — Commonwealth of Massachusetts</div>
  <div style="font-size:9pt;line-height:1.9;">
    Commonwealth of Massachusetts<br>
    County of &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:120px;">&nbsp;</span>
    &nbsp;&nbsp;ss.<br><br>
    On this &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:40px;">&nbsp;</span>&nbsp; day of
    &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:100px;">&nbsp;</span>,
    &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:60px;">&nbsp;</span>,
    before me, the undersigned notary public, personally appeared Jackson Deaquino,
    Project Manager of Preferred Builders General Services Inc., proved to me through satisfactory
    evidence of identification, which was
    &nbsp;<span style="display:inline-block;border-bottom:1px solid #999;min-width:180px;">&nbsp;</span>,
    to be the person whose name is signed on this document, and acknowledged to me that
    he signed it voluntarily for its stated purpose as authorized representative of Preferred Builders
    General Services Inc.
  </div>
  <div class="notary-field-row">
    <div class="notary-field">
      <div class="notary-line"></div>
      <div class="notary-label">Notary Public Signature</div>
    </div>
    <div class="notary-field">
      <div class="notary-line"></div>
      <div class="notary-label">My Commission Expires</div>
    </div>
    <div class="notary-field">
      <div class="stamp-area">[ Notary Seal ]</div>
    </div>
  </div>
</div>

<p style="font-size:7.5pt;color:#aaa;text-align:center;margin-top:20px;border-top:1px solid #eee;padding-top:8px;">
  This Notice of Contract is prepared in connection with Construction Contract No. ${quoteNum} between 
  Preferred Builders General Services Inc. (HIC-197400) and ${customer.name || ''}.
  After execution and notarization, file the original at the ${county} County Registry of Deeds.
  Retain a copy in your project records.
</p>

</div>`;
}

// ══════════════════════════════════════════════════════════════════════
// BLANK CONTRACT DOCX — downloadable Word template with fillable blanks
// ══════════════════════════════════════════════════════════════════════
async function generateBlankContractDocx() {
  const HTMLtoDOCX = require('html-to-docx');

  const rawHtml = buildContractHTMLNew(blankContractSchema());

  // Strip <style> and <script> blocks — html-to-docx cannot handle CSS @-rules
  // and produces a cleaner, more editable Word document without embedded styles.
  const html = rawHtml
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\s*style="[^"]*"/gi, '');   // strip inline styles too for clean docx

  const buffer = await HTMLtoDOCX(html, null, {
    table:      { row: { cantSplit: true } },
    footer:     true,
    pageNumber: true,
    margins:    { top: 1080, right: 1080, bottom: 1080, left: 1080 }
  });

  return buffer;
}

module.exports = { generatePDF, generateBlankContractDocx };
