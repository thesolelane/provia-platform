// server/services/pdfService.js
// Generates Proposal and Contract PDFs using Puppeteer
// Template lives HERE — Claude only provides data, never formatting.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, '../../outputs');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const BRAND_BLUE   = '#1B3A6B';
const BRAND_ORANGE = '#E07B2A';
const LIGHT_BLUE   = '#EEF3FB';
const LIGHT_GRAY   = '#F8F8F8';

async function generatePDF(data, type, jobId) {
  const html = type === 'proposal'
    ? buildProposalHTML(data)
    : buildContractHTML(data);

  const filename = `PB_${type === 'proposal' ? 'Proposal' : 'Contract'}_${jobId.slice(0,8)}_${Date.now()}.pdf`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
      headerTemplate: `<div style="font-size:8px;color:#999;width:100%;text-align:center;padding-top:4px;">
        Preferred Builders General Services Inc. | LIC# HIC-197400 | 978-377-1784
      </div>`,
      footerTemplate: `<div style="font-size:8px;color:#999;width:100%;text-align:center;padding-bottom:4px;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span> &nbsp;|&nbsp; 
        ${type === 'proposal' ? 'PROPOSAL' : 'CONTRACT'} — Confidential
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
  <div class="overview-grid">
    <div class="item label-cell">Customer</div>
    <div class="item value-cell">${customer.name || ''}</div>
    <div class="item label-cell">Email</div>
    <div class="item value-cell">${customer.email || ''}</div>
    <div class="item label-cell">Phone</div>
    <div class="item value-cell">${customer.phone || ''}</div>
    <div class="item label-cell">Project Address</div>
    <div class="item value-cell">${project.address || ''}</div>
    <div class="item label-cell">Description</div>
    <div class="item value-cell">${project.description || ''}</div>
    <div class="item label-cell">Square Footage</div>
    <div class="item value-cell">${project.sqft ? Number(project.sqft).toLocaleString() + ' sq ft' : '—'}</div>
    <div class="item label-cell">Stretch Code Town</div>
    <div class="item value-cell">${isStretchCode ? '⚠️ Yes — additional requirements apply' : 'No'}</div>
    <div class="item label-cell">Quote Number</div>
    <div class="item value-cell">${quoteNum}</div>
    <div class="item label-cell">Offer Valid Until</div>
    <div class="item value-cell">${validUntil}</div>
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
  <div class="section-header">PERMIT &amp; CERTIFICATE OF OCCUPANCY CHECKLIST</div>
  <p style="margin-bottom:10px;font-size:10pt;">All items below are included in this proposal and required to close permits:</p>
  ${buildPermitChecklistHTML(isStretchCode)}

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
    By signing below, the customer acknowledges receipt of this proposal and authorizes 
    Preferred Builders General Services Inc. to proceed upon receipt of the deposit. 
    This proposal is not a contract. A formal contract will be issued upon acceptance.
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
// CONTRACT HTML — proposal + legal terms
// ══════════════════════════════════════════════════════════════════════
function buildContractHTML(data) {
  const proposalHTML = buildProposalHTML(data);
  const legalSection = buildLegalSection(data);

  return proposalHTML.replace(
    '<!-- SIGNATURE -->',
    legalSection + '\n<!-- SIGNATURE -->'
  ).replace(
    'PROPOSAL — NOT A CONTRACT',
    'CONSTRUCTION CONTRACT'
  ).replace(
    'This proposal is not a contract. A formal contract will be issued upon acceptance.',
    'By signing below, both parties agree to be bound by all terms and conditions set forth in this contract including Exhibit A.'
  );
}

// ══════════════════════════════════════════════════════════════════════
// SECTION BUILDERS — all template logic lives here
// ══════════════════════════════════════════════════════════════════════

function buildScopeHTML(lineItems) {
  return lineItems.map(item => {
    const included = item.scopeIncluded || [];
    const excluded = item.scopeExcluded || [];
    return `
    <div class="sub-header">${item.trade}</div>
    <ul class="check-list">
      ${included.map(i => `<li class="yes"><span class="label">${i}</span></li>`).join('')}
      ${excluded.map(i => `<li class="no"><span class="label">${i}</span></li>`).join('')}
    </ul>`;
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

function buildPermitChecklistHTML(isStretchCode) {
  const inspections = [
    'Foundation inspection',
    'Framing inspection',
    'Rough electrical inspection',
    'Rough plumbing inspection',
    'Insulation inspection',
    'Final electrical inspection',
    'Final plumbing inspection',
    'Final building inspection'
  ];
  if (isStretchCode) {
    inspections.push('HERS rating and blower door test (Stretch Code)');
  }
  inspections.push('Certificate of Occupancy');

  return `
  <table>
    <tr><th>Inspection</th><th>Status</th></tr>
    ${inspections.map(item => `
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
    The following allowances are included in the contract price. Allowances represent contractor-grade pricing. 
    If customer selections exceed the allowance, the difference is billed as a change order. If under, customer receives a credit.
  </p>
  <div class="note-box">
    📌 All selections must be submitted to Preferred Builders no later than framing completion. 
    Late selections may cause delays and additional costs.
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

function buildLegalSection(data) {
  const project = data.project || {};
  return `
<div class="content page-break">
  <div class="section-header">TERMS AND CONDITIONS</div>
  <div class="legal-text">

    <h3>1. PAYMENT TERMS</h3>
    <p>A deposit of thirty-three percent (33%) of the total contract price is due upon execution of this contract. 
    Progress payments shall be made at the following milestones: (a) 33% upon foundation completion; 
    (b) 33% upon framing inspection approval; (c) final 1% upon substantial completion and issuance of 
    Certificate of Occupancy. All payments are due within five (5) business days of milestone completion. 
    A late charge of 1.5% per month shall apply to overdue balances.</p>

    <h3>2. CHANGE ORDERS</h3>
    <p>No changes to the scope of work shall be made without a written Change Order signed by both parties 
    prior to commencement of the additional work. Change Orders shall specify the work to be added or deleted, 
    the adjustment to the contract price, and the adjustment to the completion schedule. Verbal authorizations 
    shall not be binding. Owner-requested changes that result in delays shall extend the completion date accordingly.</p>

    <h3>3. CONTRACTOR WARRANTY</h3>
    <p>Preferred Builders General Services Inc. warrants all workmanship for a period of one (1) year from 
    the date of substantial completion. This warranty covers defects in workmanship and materials supplied 
    by Contractor. Manufacturer warranties on products and materials are passed through to the Owner. 
    This warranty is void if the structure is modified or misused by parties other than Contractor.</p>

    <h3>4. MASSACHUSETTS HIC LICENSE DISCLOSURE</h3>
    <p>Preferred Builders General Services Inc. holds Massachusetts Home Improvement Contractor (HIC) 
    License #HIC-197400. As required by Massachusetts law (M.G.L. c. 142A), all home improvement 
    contractors must be registered with the Commonwealth. The Guaranty Fund (M.G.L. c. 142A) 
    provides homeowners with recourse if a registered contractor fails to complete work or causes damage. 
    For information: www.mass.gov/hic or call (617) 973-8700.</p>

    <h3>5. HOMEOWNER RIGHTS — THREE-DAY RIGHT OF RESCISSION</h3>
    <p>If this contract was signed at a location other than the contractor's principal place of business, 
    the Owner has the right to cancel this contract within three (3) business days of signing without 
    penalty. Notice of cancellation must be in writing and delivered to: Preferred Builders General 
    Services Inc., 37 Duck Mill Road, Fitchburg, MA 01420.</p>

    <h3>6. MECHANIC'S LIEN NOTICE (M.G.L. c. 254)</h3>
    <p>Under Massachusetts law, any contractor, subcontractor, or supplier who provides labor or 
    materials for improvements to your property may file a lien against your property if they are 
    not paid. This lien may be filed even if you have paid your contractor in full. To protect yourself, 
    obtain a lien waiver from each subcontractor and supplier upon payment. Preferred Builders will 
    provide lien waivers from all subcontractors upon request at each payment milestone.</p>

    <h3>7. INSURANCE</h3>
    <p>Contractor shall maintain throughout the duration of this contract: (a) Commercial General 
    Liability insurance with limits of not less than $1,000,000 per occurrence; (b) Workers' 
    Compensation insurance as required by Massachusetts law. Certificates of insurance shall be 
    provided to Owner upon request.</p>

    <h3>8. SUBSTANTIAL COMPLETION</h3>
    <p>Substantial Completion means the stage in the progress of the Work when the Work is sufficiently 
    complete in accordance with the Contract Documents so that the Owner can occupy or utilize the Work 
    for its intended use, as evidenced by issuance of a Certificate of Occupancy by the Town of 
    ${project.city || 'the applicable municipality'}. Punch list items remaining at Substantial 
    Completion shall be completed within thirty (30) days thereof.</p>

    <h3>9. DISPUTE RESOLUTION</h3>
    <p>Any dispute arising from this contract shall first be submitted to non-binding mediation before 
    a mutually agreed-upon mediator. If mediation is unsuccessful, disputes shall be resolved by 
    binding arbitration under the rules of the American Arbitration Association. The prevailing party 
    shall be entitled to recover reasonable attorney's fees. This contract shall be governed by 
    the laws of the Commonwealth of Massachusetts.</p>

    <h3>10. FORCE MAJEURE</h3>
    <p>Neither party shall be liable for delays caused by circumstances beyond their reasonable control, 
    including but not limited to: acts of God, severe weather, strikes, material shortages, pandemic, 
    government-ordered shutdowns, or utility failures. Contractor shall notify Owner in writing within 
    five (5) business days of any such delay. The completion date shall be extended by the period 
    of the delay.</p>

    <h3>11. TERMINATION</h3>
    <p>Owner may terminate this contract for cause if Contractor materially breaches the contract and 
    fails to cure such breach within fourteen (14) days of written notice. Contractor may terminate 
    if Owner fails to make payment when due and fails to cure within seven (7) days of written notice. 
    Upon termination, Owner shall pay Contractor for all work completed and materials ordered to date, 
    plus reasonable overhead and profit on completed work.</p>

    <h3>12. ENTIRE AGREEMENT</h3>
    <p>This contract, including all exhibits and attachments, constitutes the entire agreement between 
    the parties and supersedes all prior negotiations, representations, and agreements. This contract 
    may only be modified by a written Change Order signed by both parties.</p>

  </div>
</div>`;
}

module.exports = { generatePDF };
