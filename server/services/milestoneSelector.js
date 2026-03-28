/**
 * milestoneSelector.js
 * Preferred Builders General Services Inc.
 *
 * Reads structured job data from the scope of work and returns an ordered
 * array of milestone objects for the contract payment schedule table.
 *
 * Usage:
 *   const { selectMilestones } = require('./milestoneSelector');
 *   const milestones = selectMilestones(job);
 *
 * Each milestone object returned:
 *   {
 *     code:        string   — e.g. "NC-7"
 *     title:       string   — e.g. "Framing Inspection Passed"
 *     description: string   — trigger / inspection detail
 *     invoiceRef:  string   — e.g. "Invoice No. INV-2026-004"
 *     share:       string   — e.g. "~20%"  (populated from job.milestoneShares if provided)
 *     amount:      string   — dollar amount (populated from job.milestoneAmounts if provided)
 *   }
 *
 * The FIRST milestone (Contract Deposit) and the LAST milestone
 * (Substantial Completion) are always injected automatically.
 * The system only needs to provide intermediate milestones.
 */

'use strict';

// ─── Master milestone definitions ────────────────────────────────────────────

const MILESTONE_DEFS = {

  // ── NEW CONSTRUCTION ───────────────────────────────────────────────────────
  'NC-2': {
    code: 'NC-2',
    title: 'Foundation / Slab Complete',
    description: 'Foundation inspection passed — building department. Required before framing begins.'
  },
  'NC-3': {
    code: 'NC-3',
    title: 'Exterior Wall Framing & Envelope Complete',
    description: 'Exterior walls framed, sheathed, and building envelope installed including windows and exterior doors. Contractor visual confirmation.'
  },
  'NC-4': {
    code: 'NC-4',
    title: 'Interior Wall Framing Complete',
    description: 'Interior wall framing complete and ready for rough-in trades to begin.'
  },
  'NC-5': {
    code: 'NC-5',
    title: 'Rough Electrical Inspection Passed',
    description: 'Rough electrical inspection passed — building department. Sequenced with rough plumbing per project conditions; both must be complete before Framing Inspection.'
  },
  'NC-6': {
    code: 'NC-6',
    title: 'Rough Plumbing Inspection Passed',
    description: 'Rough plumbing inspection passed — building department. Sequenced with rough electrical per project conditions; both must be complete before Framing Inspection.'
  },
  'NC-6H': {
    code: 'NC-6H',
    title: 'Rough HVAC Inspection Passed',
    description: 'Rough HVAC inspection passed — building department. Must be complete before Framing Inspection is scheduled.'
  },
  'NC-7': {
    code: 'NC-7',
    title: 'Framing Inspection Passed',
    description: 'Framing inspection passed — building department. Always the final inspection milestone before close-in. Triggered only after ALL applicable rough-in inspections (electrical, plumbing, HVAC where applicable) are complete.'
  },
  'NC-8': {
    code: 'NC-8',
    title: 'Insulation Complete',
    description: 'Insulation inspection passed — building department. Immediately follows framing inspection, before close-in / drywall.'
  },

  // ── RENOVATION / REMODEL ──────────────────────────────────────────────────
  'RN-2': {
    code: 'RN-2',
    title: 'Demolition Complete',
    description: 'Demo scope complete — visual sign-off by Contractor and Owner before framing or rough-in work begins.'
  },
  'RN-3': {
    code: 'RN-3',
    title: 'Framing Rough-In Complete',
    description: 'New or modified framing complete and ready for rough-in trades.'
  },
  'RN-4': {
    code: 'RN-4',
    title: 'Rough Electrical Inspection Passed',
    description: 'Rough electrical inspection passed — building department. Sequenced with rough plumbing per project conditions; both must be complete before Framing Inspection.'
  },
  'RN-5': {
    code: 'RN-5',
    title: 'Rough Plumbing Inspection Passed',
    description: 'Rough plumbing inspection passed — building department. Sequenced with rough electrical per project conditions; both must be complete before Framing Inspection.'
  },
  'RN-5H': {
    code: 'RN-5H',
    title: 'Rough HVAC Inspection Passed',
    description: 'Rough HVAC inspection passed — building department. Must be complete before Framing Inspection is scheduled.'
  },
  'RN-6': {
    code: 'RN-6',
    title: 'Framing Inspection Passed',
    description: 'Framing inspection passed — building department. Always the final inspection milestone before close-in. Triggered only after ALL applicable rough-in inspections are complete.'
  },
  'RN-7': {
    code: 'RN-7',
    title: 'Insulation Complete',
    description: 'Insulation inspection passed — building department. Follows framing inspection, before close-in / drywall.'
  },

  // ── ADU — ADDITIONAL (overlaid on NC sequence) ────────────────────────────
  'ADU-A': {
    code: 'ADU-A',
    title: 'Board of Health / Septic System Review & Approval',
    description: 'Board of Health confirms existing or new soil absorption system (Title 5) is adequate for the ADU. BOH approval required before or concurrent with building permit issuance.'
  },
  'ADU-B': {
    code: 'ADU-B',
    title: 'Utility Provider Coordination & Sign-Off',
    description: 'Coordination with electric/gas utility for new or separate service, metering, or upgraded capacity. Utility sign-off required before final inspection.'
  },
  'ADU-C': {
    code: 'ADU-C',
    title: 'Fire / Life Safety — Egress Inspection',
    description: 'Inspection confirming ADU has a separate entrance meeting 780 CMR egress requirements, as required by M.G.L. c. 40A §7. Conducted by building dept. or fire dept. per municipality.'
  },
  'ADU-D': {
    code: 'ADU-D',
    title: 'Municipal Site Plan Review Sign-Off',
    description: 'Written approval from planning or building department where site plan review for ADU is required under 760 CMR 71.00. Must precede Certificate of Occupancy.'
  },
  'ADU-E': {
    code: 'ADU-E',
    title: 'Sewer / Water Connection Inspection',
    description: 'New or upgraded sewer/water connection inspection and connection fee paid before final building inspection.'
  },

  // ── OPTIONAL ─────────────────────────────────────────────────────────────
  'OPT-ENG': {
    code: 'OPT-ENG',
    title: 'Engineer / Architect Sign-Off',
    description: 'Written sign-off from project engineer or architect of record, where required for permit or structural approval.'
  },
  'OPT-SPR': {
    code: 'OPT-SPR',
    title: 'Fire Suppression / Sprinkler Inspection Passed',
    description: 'Sprinkler / fire suppression rough-in inspection passed — local AHJ and/or fire department. Must be complete before Framing Inspection is scheduled.'
  },
  'OPT-CUSTOM': {
    code: 'OPT-CUSTOM',
    title: '', // Set from job.customMilestone.title
    description: '' // Set from job.customMilestone.description
  },
};

// ─── Main selector ────────────────────────────────────────────────────────────

/**
 * selectMilestones(job)
 *
 * @param {object} job — structured job data from scope of work
 * @returns {Array}    — ordered milestone objects (deposit and SC are added by the HTML builder)
 *
 * job shape expected:
 * {
 *   type: 'new_construction' | 'renovation' | 'adu',
 *   trades: {
 *     electrical: bool,
 *     plumbing:   bool,
 *     hvac:       bool,
 *     sprinkler:  bool,   // multi-unit or AHJ required
 *   },
 *   has_demo:              bool,
 *   has_framing:           bool,  // renovation only — has new/modified framing
 *   has_insulation:        bool,
 *   has_engineer:          bool,
 *   adu: {
 *     on_septic:            bool,
 *     separate_metering:    bool,
 *     site_plan_required:   bool,
 *     new_sewer_connection: bool,
 *   },
 *   customMilestone: {          // optional
 *     title:       string,
 *     description: string,
 *   },
 *   // Optional: pre-set shares and amounts keyed by milestone code
 *   milestoneShares:  { 'NC-2': '20%', ... },
 *   milestoneAmounts: { 'NC-2': '$37,000', ... },
 *   invoiceNumbers:   { 'NC-2': 'INV-2026-002', ... },
 * }
 */
function selectMilestones(job) {
  const codes = [];
  const isNC  = job.type === 'new_construction' || job.type === 'adu';
  const isRN  = job.type === 'renovation';
  const isADU = job.type === 'adu';

  // ── New Construction sequence ──────────────────────────────────────────────
  if (isNC) {
    codes.push('NC-2');                                    // Foundation — always
    codes.push('NC-3');                                    // Exterior framing & envelope — always
    codes.push('NC-4');                                    // Interior framing — always

    // Rough-in inspections — order: electrical, plumbing, HVAC (any order among
    // themselves, all must complete before framing inspection)
    if (job.trades && job.trades.electrical) codes.push('NC-5');
    if (job.trades && job.trades.plumbing)   codes.push('NC-6');
    if (job.trades && job.trades.hvac)       codes.push('NC-6H');
    if (job.trades && job.trades.sprinkler)  codes.push('OPT-SPR');

    codes.push('NC-7');                                    // Framing inspection — always last before close-in
    codes.push('NC-8');                                    // Insulation — always follows framing inspection
  }

  // ── Renovation sequence ───────────────────────────────────────────────────
  if (isRN) {
    if (job.has_demo)    codes.push('RN-2');               // Demo — if in scope
    if (job.has_framing) codes.push('RN-3');               // Framing rough-in — if in scope

    if (job.trades && job.trades.electrical) codes.push('RN-4');
    if (job.trades && job.trades.plumbing)   codes.push('RN-5');
    if (job.trades && job.trades.hvac)       codes.push('RN-5H');
    if (job.trades && job.trades.sprinkler)  codes.push('OPT-SPR');

    if (job.has_framing) {
      codes.push('RN-6');                                  // Framing inspection — only if framing in scope
      if (job.has_insulation) codes.push('RN-7');          // Insulation — follows framing inspection
    }
  }

  // ── ADU additions (overlaid on NC sequence) ───────────────────────────────
  if (isADU && job.adu) {
    // ADU-A and ADU-B are pre-permit — insert after deposit (before NC-2)
    // They are handled as notes on the deposit row in the HTML builder.
    // ADU-C, D, E are final-phase — insert after insulation, before SC.
    if (job.adu.on_septic)             codes.push('ADU-A');
    if (job.adu.separate_metering)     codes.push('ADU-B');
    codes.push('ADU-C');                                   // Egress — always required for ADU
    if (job.adu.site_plan_required)    codes.push('ADU-D');
    if (job.adu.new_sewer_connection)  codes.push('ADU-E');
  }

  // ── Optional: engineer / architect sign-off ───────────────────────────────
  if (job.has_engineer || job.has_architect) {
    codes.push('OPT-ENG');
  }

  // ── Optional: custom milestone ────────────────────────────────────────────
  if (job.customMilestone && job.customMilestone.title) {
    codes.push('OPT-CUSTOM');
  }

  // ── Build final objects ────────────────────────────────────────────────────
  return codes.map((code, idx) => {
    const def = { ...MILESTONE_DEFS[code] };

    // Handle custom milestone content
    if (code === 'OPT-CUSTOM' && job.customMilestone) {
      def.title       = job.customMilestone.title       || 'Custom Milestone';
      def.description = job.customMilestone.description || 'As defined in Project Proposal.';
    }

    // Invoice number: 2-based (slot 1 = deposit, so milestones start at slot 2)
    const invoiceSlot = idx + 2;
    def.invoiceRef = (job.invoiceNumbers && job.invoiceNumbers[code])
      ? job.invoiceNumbers[code]
      : `Invoice No. — See Proposal`;

    def.share  = (job.milestoneShares  && job.milestoneShares[code])  || '—';
    def.amount = (job.milestoneAmounts && job.milestoneAmounts[code]) || '—';
    def.slot   = invoiceSlot;

    return def;
  });
}

// ─── Pre-construction advance selector ───────────────────────────────────────

/**
 * selectPreConAdvances(job)
 * Returns the pre-construction advance line items for Invoice 1 itemization.
 */
function selectPreConAdvances(job) {
  const advances = [];

  if (job.has_permit) {
    const paidBy = job.permit_paid_by || 'pb';
    advances.push({
      item:    'Building Permit Filing Fees',
      detail:  'Actual municipal fee — paid to building department',
      amount:  job.permit_fee || '—',
      paid_by: paidBy
    });
  }
  if (job.has_engineer) {
    const paidBy = job.engineer_paid_by || 'pb';
    advances.push({
      item:    'Engineering Fees',
      detail:  'Structural, civil, or MEP engineering required for permit',
      amount:  job.engineer_fee || '—',
      paid_by: paidBy
    });
  }
  if (job.has_architect) {
    const paidBy = job.architect_paid_by || 'pb';
    advances.push({
      item:    'Architectural / Design Fees',
      detail:  'Required for permit or design-build scope',
      amount:  job.architect_fee || '—',
      paid_by: paidBy
    });
  }
  if (job.sub_deposits) {
    advances.push({
      item:    'Subcontractor Mobilization Deposits',
      detail:  'Documented deposits required before project start',
      amount:  job.sub_deposits || '—',
      paid_by: 'pb'
    });
  }
  if (job.special_order_deposits) {
    advances.push({
      item:    'Special-Order / Long-Lead Material Deposits',
      detail:  'Custom or non-returnable items per M.G.L. c. 142A §2',
      amount:  job.special_order_deposits || '—',
      paid_by: 'pb'
    });
  }

  return advances;
}

module.exports = { selectMilestones, selectPreConAdvances, MILESTONE_DEFS };
