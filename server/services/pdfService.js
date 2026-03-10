// server/services/pdfService.js
// Generates Proposal and Contract PDFs using Puppeteer
// Portable — works on any server with Chrome/Chromium

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, '../../outputs');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const BRAND_BLUE   = '#1B3A6B';
const BRAND_ORANGE = '#E07B2A';
const LIGHT_BLUE   = '#EEF3FB';
const LIGHT_GRAY   = '#F8F8F8';

async function generatePDF(documentData, type, jobId) {
  const html = type === 'proposal'
    ? buildProposalHTML(documentData)
    : buildContractHTML(documentData);

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

    .total-highlight { background: ${BRAND_BLUE}; color: white; padding: 14px 16px; margin: 16px 0; display: flex; justify-content: space-between; }
    .total-highlight .label { font-size: 12pt; font-weight: bold; }
    .total-highlight .amount { font-size: 14pt; font-weight: bold; }
    .deposit-highlight { background: ${BRAND_ORANGE}; color: white; padding: 10px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; }

    .page-break { page-break-before: always; }
  `;
}

function buildProposalHTML(data) {
  const customer = data.customer || {};
  const project = data.project || {};
  const sections = data.sections || [];

  const fmt = (n) => n ? `$${Number(n).toLocaleString()}` : '$0';
  const quoteNum = data.quoteNumber || '—';
  const validUntil = data.validUntil || '—';

  // Build scope sections — handle both formats: multiple scope sections or single scope with trades array
  let scopeSections = sections.filter(s => s.type === 'scope');
  if (scopeSections.length === 1 && scopeSections[0].content?.trades) {
    scopeSections = scopeSections[0].content.trades.map(t => ({
      title: t.trade,
      content: { included: t.included || [], excluded: t.excluded || [], note: t.note }
    }));
  }
  const exclusions = sections.find(s => s.type === 'exclusions');
  const costSummary = sections.find(s => s.type === 'cost_summary');
  const permitChecklist = sections.find(s => s.type === 'permit_checklist');
  const responsibilities = sections.find(s => s.type === 'responsibilities');
  const exhibitA = sections.find(s => s.type === 'exhibit_a');

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
    <div class="item value-cell">${project.address || ''}, ${project.city || ''}, MA</div>
    <div class="item label-cell">Description</div>
    <div class="item value-cell">${project.description || ''}</div>
    <div class="item label-cell">Square Footage</div>
    <div class="item value-cell">${project.sqft ? project.sqft.toLocaleString() + ' sq ft' : '—'}</div>
    <div class="item label-cell">Stretch Code Town</div>
    <div class="item value-cell">${data.isStretchCodeTown ? '⚠️ Yes — additional requirements apply' : 'No'}</div>
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
  ${scopeSections.map(s => renderScopeSection(s)).join('')}

  <!-- EXCLUSIONS -->
  ${exclusions ? `
  <div class="section-header">WHAT IS NOT INCLUDED</div>
  <p style="margin-bottom:10px;font-size:10pt;">The following are excluded from this proposal:</p>
  ${renderExclusions(exclusions)}` : ''}

  <!-- PERMIT CHECKLIST -->
  ${permitChecklist ? `
  <div class="section-header">PERMIT &amp; CERTIFICATE OF OCCUPANCY CHECKLIST</div>
  <p style="margin-bottom:10px;font-size:10pt;">All items below are included in this proposal and required to close permits:</p>
  ${renderPermitChecklist(permitChecklist)}` : ''}

  <!-- COST SUMMARY -->
  ${costSummary ? `
  <div class="section-header">COMPLETE COST SUMMARY</div>
  ${renderCostSummary(costSummary, data)}` : `
  <div class="total-highlight">
    <span class="label">TOTAL PROPOSAL VALUE</span>
    <span class="amount">${fmt(data.totalValue)}</span>
  </div>
  <div class="deposit-highlight">
    <span class="label">DEPOSIT REQUIRED (33%)</span>
    <span class="amount">${fmt(data.depositAmount)}</span>
  </div>`}

  <!-- CUSTOMER RESPONSIBILITIES -->
  ${responsibilities ? `
  <div class="section-header">CUSTOMER RESPONSIBILITIES</div>
  ${renderResponsibilities(responsibilities)}` : ''}

  <!-- MASSSAVE NOTE -->
  <div class="rebate-box">
    ⭐ <strong>MassSave Rebate Opportunity:</strong> All-electric mini split heat pump systems 
    qualify for MassSave rebates of $1,500–$10,000. EV charger rebates also available. 
    Preferred Builders will assist with all rebate applications prior to installation.
  </div>

</div>

<!-- EXHIBIT A -->
${exhibitA ? renderExhibitA(exhibitA, data, fmt) : renderDefaultExhibitA(data, fmt)}

<!-- SIGNATURE -->
<div class="content">
  <div class="section-header">ACCEPTANCE</div>
  <p style="margin-bottom:20px;font-size:10pt;">
    By signing below, the customer acknowledges receipt of this proposal and authorizes 
    Preferred Builders General Services Inc. to proceed upon receipt of the deposit. 
    This proposal is not a contract. A formal contract will be issued upon acceptance.
  </p>
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
  </div>
  <p style="font-size:8.5pt;color:#888;margin-top:16px;">
    Preferred Builders General Services Inc. | LIC# HIC-197400 | 
    37 Duck Mill Road, Fitchburg, MA 01420 | 978-377-1784 | 
    jackson.deaquino@preferredbuildersusa.com
  </p>
</div>

</body>
</html>`;
}

function buildContractHTML(data) {
  // Contract is same as proposal + legal terms section
  const proposalHTML = buildProposalHTML(data);
  const legalSection = buildLegalSection(data);

  // Insert legal section before signature
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

function buildLegalSection(data) {
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
    ${data.project?.city || 'the applicable municipality'}. Punch list items remaining at Substantial 
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

function renderScopeSection(section) {
  const content = section.content || {};
  const included = content.included || [];
  const excluded = content.excluded || [];

  return `
  <div class="sub-header">${section.title || ''} ${content.cost ? `— ${content.cost}` : ''}</div>
  ${content.description ? `<p style="margin-bottom:8px;font-size:10pt;">${content.description}</p>` : ''}
  <ul class="check-list">
    ${included.map(item => `
      <li class="yes">
        <span class="label">${item.label || item}</span>
        ${item.detail ? `<span class="detail"> — ${item.detail}</span>` : ''}
      </li>`).join('')}
    ${excluded.map(item => `
      <li class="no">
        <span class="label">${item.label || item}</span>
        ${item.detail ? `<span class="detail"> — ${item.detail}</span>` : ''}
      </li>`).join('')}
  </ul>
  ${content.note ? `<div class="note-box">📌 ${content.note}</div>` : ''}`;
}

function renderExclusions(section) {
  const content = section.content || {};
  const items = content.items || content.exclusions || [];
  return `
  <table>
    <tr><th>Excluded Item</th><th>Why Excluded</th><th>Customer Budget Estimate</th></tr>
    ${items.map((item, i) => `
    <tr>
      <td><strong>${item.name || item.item || item}</strong></td>
      <td>${item.reason || item.why || '—'}</td>
      <td>${item.budget || item.budgetRange || item.budgetEstimate || '—'}</td>
    </tr>`).join('')}
  </table>`;
}

function renderPermitChecklist(section) {
  const content = section.content || {};
  const items = content.items || content.inspections || [];
  return `
  <table>
    <tr><th>Inspection</th><th>Status</th></tr>
    ${items.map(item => `
    <tr>
      <td>${item.name || item}</td>
      <td style="color:#2E7D32;font-weight:bold;">✓ Included</td>
    </tr>`).join('')}
  </table>`;
}

function renderCostSummary(section, data) {
  const fmt = (n) => n ? `$${Number(n).toLocaleString()}` : '—';
  const content = section.content || {};
  const items = content.lineItems || [];

  let rows = items.map(item => {
    const label = item.label || item.trade || item.description || String(item);
    const price = item.finalPrice || item.baseCost || item.amount || item.cost || 0;
    return `
    <tr>
      <td>${label}</td>
      <td style="text-align:right;">${fmt(price)}</td>
    </tr>`;
  }).join('');

  rows += `
    <tr class="total">
      <td>TOTAL CONTRACT VALUE</td>
      <td style="text-align:right;">${fmt(content.totalContractPrice || data.totalValue)}</td>
    </tr>
    <tr class="deposit">
      <td>DEPOSIT REQUIRED (${content.depositPercent || 33}%)</td>
      <td style="text-align:right;">${fmt(content.depositAmount || data.depositAmount)}</td>
    </tr>`;

  return `
  <table>
    <tr><th>Trade / Phase</th><th style="text-align:right;">Price</th></tr>
    ${rows}
  </table>`;
}

function renderResponsibilities(section) {
  const content = section.content || {};
  const items = content.items || content.responsibilities || [];
  return `
  <ul class="check-list">
    ${items.map(item => `<li class="bullet">${item}</li>`).join('')}
  </ul>`;
}

function renderExhibitA(section, data, fmt) {
  const content = section.content || {};
  return buildExhibitAHTML(content.allowances || {}, data, fmt);
}

function renderDefaultExhibitA(data, fmt) {
  return buildExhibitAHTML({}, data, fmt);
}

function buildExhibitAHTML(allowances, data, fmt) {
  const { getDb } = require('../db/database');
  let settings = {};
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings WHERE category = ?').all('allowance');
    for (const row of rows) {
      try { settings[row.key] = JSON.parse(row.value); }
      catch { settings[row.key] = { amount: row.value }; }
    }
  } catch(e) {}

  const a = (key, fallback) => {
    const s = settings[`allowance.${key}`];
    return s ? fmt(s.amount) : fmt(fallback);
  };

  return `
<div class="content exhibit-header">
  <span class="exhibit-label">EXHIBIT A</span>
  <span class="exhibit-name">CONTRACTOR-GRADE ALLOWANCE SCHEDULE</span>
  <div class="exhibit-sub">
    ${data.customer?.name || ''} | ${data.project?.address || ''} | Quote #${data.quoteNumber || ''}
  </div>
</div>

<div class="content">
  <p style="margin-bottom:14px;font-size:10pt;">
    The following allowances are included in the contract price. Allowances represent 
    contractor-grade pricing. If customer selections exceed the allowance, the difference 
    is billed as a change order. If under, customer receives a credit.
  </p>

  <div class="note-box">
    📌 All selections must be submitted to Preferred Builders no later than framing completion. 
    Late selections may cause delays and additional costs.
  </div>

  <div class="section-header">FLOORING</div>
  <table>
    <tr><th>Item</th><th>Location</th><th>Allowance</th><th>Spec</th></tr>
    <tr><td><strong>LVP / Engineered Hardwood</strong></td><td>All living areas</td><td>${a('lvp',6.50)}/sq ft</td><td>Supply only — Shaw, Armstrong or equiv</td></tr>
    <tr><td><strong>Bath Floor Tile</strong></td><td>All bathrooms</td><td>${a('tileBath',4.50)}/sq ft</td><td>12×12 ceramic or porcelain, supply only</td></tr>
    <tr><td><strong>Carpet</strong></td><td>Bedrooms (if selected)</td><td>${a('carpet',3.50)}/sq ft</td><td>Contractor grade, supply only</td></tr>
  </table>

  <div class="section-header">KITCHEN</div>
  <table>
    <tr><th>Item</th><th>Allowance</th><th>Contractor-Grade Spec</th></tr>
    <tr><td><strong>Cabinets — Base &amp; Upper</strong></td><td>${a('cabinets',12000)}</td><td>Stock/semi-stock — Kraftmaid, Yorktowne or equiv</td></tr>
    <tr><td><strong>Countertop — Quartz</strong></td><td>${a('quartz',4250)}</td><td>3cm slab — Cambria, MSI or equiv, up to 30 LF</td></tr>
    <tr><td><strong>Kitchen Faucet</strong></td><td>${a('kitFaucet',250)} each</td><td>Moen, Delta or Kohler — pull-down single handle</td></tr>
    <tr><td><strong>Kitchen Sink</strong></td><td>${a('kitSink',350)} each</td><td>Stainless undermount 60/40 double bowl</td></tr>
    <tr><td><strong>Garbage Disposal</strong></td><td>${a('disposal',150)} each</td><td>InSinkErator 1/2 HP contractor grade</td></tr>
  </table>

  <div class="section-header">BATHROOMS</div>
  <table>
    <tr><th>Item</th><th>Allowance</th><th>Contractor-Grade Spec</th></tr>
    <tr><td><strong>Vanity (full bath)</strong></td><td>${a('vanity',650)} each</td><td>48"–60" stock — Kraftmaid, RSI or equiv</td></tr>
    <tr><td><strong>Vanity (half bath)</strong></td><td>${a('vanitySmall',350)} each</td><td>24"–30" stock</td></tr>
    <tr><td><strong>Vanity Top / Sink</strong></td><td>${a('vanityTop',350)} each</td><td>Cultured marble integrated</td></tr>
    <tr><td><strong>Bath Faucet</strong></td><td>${a('bathFaucet',180)} each</td><td>Moen Adler or Delta Foundations</td></tr>
    <tr><td><strong>Toilet</strong></td><td>${a('toilet',280)} each</td><td>Kohler Cimarron or Am Std — elongated 1.28 GPF</td></tr>
    <tr><td><strong>Bathtub</strong></td><td>${a('tub',850)} each</td><td>Alcove 60" — American Standard or Kohler</td></tr>
    <tr><td><strong>Shower Valve &amp; Trim</strong></td><td>${a('showerValve',350)} each</td><td>Moen Posi-Temp or Delta Monitor</td></tr>
    <tr><td><strong>Shower Door</strong></td><td>${a('showerDoor',250)} each</td><td>Frameless bypass or curtain rod</td></tr>
    <tr><td><strong>Bath Accessories</strong></td><td>${a('bathAcc',150)} per set</td><td>TP holder, towel bar, robe hook — matching set</td></tr>
    <tr><td><strong>Exhaust Fan</strong></td><td>${a('exhaustFan',85)} each</td><td>Broan or Panasonic — 80 CFM min (Stretch Code)</td></tr>
  </table>

  <div class="section-header">DOORS &amp; HARDWARE</div>
  <table>
    <tr><th>Item</th><th>Allowance</th><th>Spec</th></tr>
    <tr><td><strong>Interior Door</strong></td><td>${a('intDoor',180)} each</td><td>Hollow/solid core — 6-panel primed — Masonite or equiv</td></tr>
    <tr><td><strong>Passage Set (doorknob)</strong></td><td>${a('passage',45)} each</td><td>Kwikset or Schlage — satin nickel</td></tr>
    <tr><td><strong>Privacy Set (bath/bed)</strong></td><td>${a('privacy',55)} each</td><td>Kwikset or Schlage lockset</td></tr>
    <tr><td><strong>Bifold Door</strong></td><td>${a('bifold',175)} each</td><td>6-panel primed white</td></tr>
    <tr><td><strong>Base Molding</strong></td><td>${a('baseMold',1.85)}/LF</td><td>3-1/4" colonial or craftsman primed MDF</td></tr>
    <tr><td><strong>Door/Window Casing</strong></td><td>${a('casing',1.65)}/LF</td><td>2-1/4" colonial primed MDF</td></tr>
    <tr><td><strong>Window Stool &amp; Apron</strong></td><td>${a('windowStool',85)} each</td><td>Primed MDF</td></tr>
  </table>

  <div class="note-box">
    All allowances are contractor-grade pricing through Preferred Builders' trade accounts. 
    Retail equivalents typically run 20–40% higher. Preferred Builders can assist in sourcing 
    all items — customers are not required to source independently.
  </div>

  <p style="margin-top:16px;font-size:9.5pt;color:#555;">
    <strong>Allowance Terms:</strong> Selections exceeding the allowance are billed as change orders 
    prior to ordering. Credits for under-allowance selections are applied to the final invoice. 
    All selections must be in writing. This schedule is incorporated into and part of the contract.
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

module.exports = { generatePDF };
