/**
 * test_pdfService.js
 * Run: node test_pdfService.js
 * Writes rendered HTML to /tmp/contract_test.html for browser inspection.
 */
const fs = require('fs');
const { buildContractHTML } = require('./pdfService');

const testData = {
  contract: {
    contract_number:      'PB-2026-001',
    invoice_number:       'INV-2026-001',
    quote_number:         'Q-2026-001',
    proposal_date:        'March 1, 2026',
    contract_date:        'March 12, 2026',
    total_contract_price: '$185,000',
    deposit_amount:       '$61,666',
    deposit_pct:          '33%',
  },
  owner: {
    full_name:      'John & Jane Smith',
    address_line1:  '123 Main Street',
    city_state_zip: 'Worcester, MA 01601',
    phone:          '508-555-1234',
    email:          'smith@email.com',
  },
  property: {
    address:      '123 Main Street',
    city:         'Worcester',
    jurisdiction: 'City of Worcester',
    parcel_number:'12-345-67',
  },
  job: {
    type:            'new_construction',
    has_demo:        false,
    has_framing:     true,
    has_insulation:  true,
    has_permit:      true,  permit_fee:   '$1,200',
    has_engineer:    true,  engineer_fee: '$3,500',
    has_architect:   false, architect_fee: null,
    sub_deposits:    '$4,000',
    trades: { electrical: true, plumbing: true, hvac: false, sprinkler: false },
    adu: { on_septic: false, separate_metering: false, site_plan_required: false, new_sewer_connection: false },
    milestoneShares:  { 'NC-2':'10%','NC-3':'15%','NC-4':'10%','NC-5':'10%','NC-6':'10%','NC-7':'15%','NC-8':'10%','OPT-ENG':'5%' },
    milestoneAmounts: { 'NC-2':'$18,500','NC-3':'$27,750','NC-4':'$18,500','NC-5':'$18,500','NC-6':'$18,500','NC-7':'$27,750','NC-8':'$18,500','OPT-ENG':'$9,250' },
    invoiceNumbers:   { 'NC-2':'INV-2026-002','NC-3':'INV-2026-003','NC-4':'INV-2026-004','NC-5':'INV-2026-005','NC-6':'INV-2026-006','NC-7':'INV-2026-007','NC-8':'INV-2026-008','OPT-ENG':'INV-2026-009' },
    final_milestone_share:  '1%',
    final_milestone_amount: '$1,850',
    final_invoice_number:   'INV-2026-010',
  },
  trades: [
    { phase: 'Pre-Construction', description: 'Permitting, engineering, sub mobilization', value: '$8,700' },
    { phase: 'Foundation',       description: 'Excavation, concrete foundation, slab',    value: '$22,000' },
    { phase: 'Framing',          description: 'Structural framing, sheathing, windows',   value: '$55,000' },
    { phase: 'Electrical',       description: 'Rough-in and finish electrical',            value: '$28,000' },
    { phase: 'Plumbing',         description: 'Rough-in and finish plumbing',              value: '$24,000' },
    { phase: 'Insulation',       description: 'Spray foam and batt insulation',            value: '$12,000' },
    { phase: 'Finishes',         description: 'Drywall, paint, flooring, trim',            value: '$35,300' },
  ],
  allowances: {
    flooring_lvp: true, flooring_tile: true, flooring_carpet: false,
    kitchen_cabinets: true, kitchen_counter: true, kitchen_faucet: true,
    kitchen_sink: true, kitchen_disposal: true,
    bath_vanity_full: true, bath_vanity_half: true, bath_vanity_top: true,
    bath_faucet: true, bath_toilet: true, bath_tub: true,
    bath_shower_valve: true, bath_shower_door: true, bath_accessories: true,
    bath_exhaust_fan: true,
    doors_interior: true, doors_passage: true, doors_privacy: true,
    doors_bifold: false, doors_base_molding: true, doors_casing: true,
    doors_window_stool: true,
  }
};

const html = buildContractHTML(testData);
fs.writeFileSync('/tmp/contract_test.html', html);

const lines = html.split('\n').length;
const size  = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`✓ Contract HTML generated: ${lines} lines, ${size} KB`);
console.log(`✓ Output written to /tmp/contract_test.html`);

// Quick sanity checks
const checks = [
  ['Cover table',        html.includes('PB-2026-001')],
  ['Owner name',         html.includes('John &amp; Jane Smith') || html.includes('John & Jane Smith')],
  ['Article I',          html.includes('Article I')],
  ['Article XVI',        html.includes('Article XVI')],
  ['Payment table',      html.includes('Contract Deposit')],
  ['NC-2 milestone',     html.includes('Foundation / Slab Complete')],
  ['NC-7 framing insp',  html.includes('Framing Inspection Passed')],
  ['NC-8 insulation',    html.includes('Insulation Complete')],
  ['Engineer milestone', html.includes('Engineer / Architect Sign-Off')],
  ['Pre-con advances',   html.includes('Building Permit Filing Fees')],
  ['Exhibit A',          html.includes('Exhibit A')],
  ['Allowance table',    html.includes('Kraftmaid')],
  ['Addendum 1',         html.includes('Notice of Contract')],
  ['Notary block',       html.includes('Notary Public Signature')],
  ['HIC disclosure',     html.includes('HIC-197400')],
  ['MA law cite',        html.includes('142A')],
];

let passed = 0;
checks.forEach(([name, result]) => {
  console.log(`  ${result ? '✓' : '✗'} ${name}`);
  if (result) passed++;
});
console.log(`\n${passed}/${checks.length} checks passed`);
