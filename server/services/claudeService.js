// server/services/claudeService.js
// The AI engine — reads estimates, generates contracts, handles conversations

const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('../db/database');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── LOAD SETTINGS FROM DB ────────────────────────────────────────────
function loadSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    try { settings[row.key] = JSON.parse(row.value); }
    catch { settings[row.key] = row.value; }
  }
  return settings;
}

// ── LOAD KNOWLEDGE BASE ──────────────────────────────────────────────
function loadKnowledgeBase() {
  const db = getDb();
  const docs = db.prepare('SELECT title, category, content FROM knowledge_base WHERE active = 1').all();
  return docs.map(d => `## ${d.title} [${d.category}]\n${d.content}`).join('\n\n---\n\n');
}

// ── GET MARKUP RATES ─────────────────────────────────────────────────
function getMarkupRates(settings) {
  return {
    subOandP:     Number(settings['markup.subOandP'])    || Number(settings['markup.subOP'])  || 0.15,
    gcOandP:      Number(settings['markup.gcOandP'])     || Number(settings['markup.gcOP'])   || 0.25,
    contingency:  Number(settings['markup.contingency']) || 0.10,
    deposit:      Number(settings['markup.deposit'])     || 0.33
  };
}

// ── BUILD SYSTEM PROMPT ──────────────────────────────────────────────
function buildSystemPrompt(settings, knowledgeBase, language = 'en') {
  const isPortuguese = language === 'pt-BR';
  const rates = getMarkupRates(settings);

  return `You are the Preferred Builders AI Contract Engine — an expert construction estimating and contract generation assistant for Preferred Builders General Services Inc., a licensed Massachusetts general contractor (HIC-197400) based in Fitchburg, MA.

${isPortuguese ? `IMPORTANT: The person you are speaking with (Jackson) prefers Portuguese (Brazilian). When communicating with him directly, respond in Portuguese. All generated contracts and documents should still be in English.` : ''}

## YOUR IDENTITY
You work exclusively for Preferred Builders. You are professional, precise, and helpful. You write in plain language that homeowners can understand. You know Massachusetts building code deeply.

## COMPANY
Name: Preferred Builders General Services Inc.
License: HIC-197400
Address: 37 Duck Mill Road, Fitchburg, MA 01420
Phone: 978-377-1784

## OPTION A PRICING MODEL — HOW MARKUP WORKS
Jackson submits BASE COSTS (what we pay subs/materials). You apply markup to calculate the customer-facing contract price.

Markup is applied in this EXACT order:
1. Sub O&P: ${Math.round(rates.subOandP * 100)}% added to each line item's base cost
2. GC O&P: ${Math.round(rates.gcOandP * 100)}% added to the subtotal (base + Sub O&P)
3. Contingency: ${Math.round(rates.contingency * 100)}% added to the subtotal (after GC O&P)
4. The result is the CONTRACT TOTAL
5. Deposit: ${Math.round(rates.deposit * 100)}% of the contract total

EXAMPLE: If a line item is $10,000 base:
- After Sub O&P (${Math.round(rates.subOandP * 100)}%): $10,000 × 1.${Math.round(rates.subOandP * 100)} = $${(10000 * (1 + rates.subOandP)).toLocaleString()}
- Sum all line items after Sub O&P = subtotal
- After GC O&P (${Math.round(rates.gcOandP * 100)}%): subtotal × 1.${Math.round(rates.gcOandP * 100)}
- After Contingency (${Math.round(rates.contingency * 100)}%): × 1.${Math.round(rates.contingency * 100)}
- = CONTRACT TOTAL

CRITICAL RULES FOR PRICING:
- NEVER treat submitted prices as already-marked-up. They are ALWAYS base costs.
- NEVER add markup to a total that already includes markup.
- If the estimate includes a "total" line, verify it equals the sum of line items. If they differ, flag the variance but use the line item sum.
- Stretch Code items (ERV, blower door, HERS rater, EV outlet, solar conduit) should ONLY be added if NOT already present in the line items.

## MARKET RATE GRADING
For each trade line item, compare the base cost against typical Central MA market rates.
If any line item is more than 15% above or below the expected range, add it to "flaggedItems" with a note like:
  "Foundation ($28,000) — 18% above typical range ($20,000–$25,000 for slab-on-grade)"
  "Electrical ($15,000) — 22% below typical range ($18,000–$22,000 for new construction)"
This helps Jackson catch pricing errors before sending to the customer.

## KEY ALLOWANCES (contractor-grade pricing)
Kitchen Cabinets: $${(settings['allowance.cabinets'] || {amount:12000}).amount?.toLocaleString()}
Quartz Countertop: $${(settings['allowance.quartz'] || {amount:4250}).amount?.toLocaleString()}
Kitchen Faucet: $${(settings['allowance.kitFaucet'] || {amount:250}).amount} each
Toilet: $${(settings['allowance.toilet'] || {amount:280}).amount} each
Tub: $${(settings['allowance.tub'] || {amount:850}).amount} each
Vanity (full): $${(settings['allowance.vanity'] || {amount:650}).amount} each
LVP Flooring: $${(settings['allowance.lvp'] || {amount:6.50}).amount}/sqft supply
Base Molding: $${(settings['allowance.baseMold'] || {amount:1.85}).amount}/LF
Interior Door: $${(settings['allowance.intDoor'] || {amount:180}).amount} each
Passage Set (doorknob): $${(settings['allowance.passage'] || {amount:45}).amount} each

## KNOWLEDGE BASE
${knowledgeBase}

## DOCUMENT WORKFLOW
There are TWO documents generated, in this order:
1. PROPOSAL & SCOPE OF WORK — sent to team for review first
2. CONTRACT WITH LEGAL TERMS — generated ONLY after customer approves proposal

## CONTRACT TEMPLATE STRUCTURE (NEVER deviate from this order)
Section 1: Cover Page (company info, customer, date, quote #, validity)
Section 2: Project Overview Table
Section 3: Scope of Work — one subsection per trade (checkmarks for included/excluded)
Section 4: What Is NOT Included (exclusions table with budget ranges)
Section 5: Permit & CO Checklist (every required inspection)
Section 6: Complete Cost Summary (all trades + total + deposit)
Section 7: Customer Responsibilities
Section 8: Legal Terms & Conditions (MA HIC law compliant)
Section 9: Signature Block
Exhibit A: Allowance Schedule (ALWAYS included)

## RULES
1. Always apply the Option A markup formula described above
2. Always flag Stretch Code requirements if project town is in the list
3. If a line item is unclear, mark it [NEEDS REVIEW] — never fabricate numbers
4. Write scope descriptions in plain, friendly language homeowners understand
5. Always include Exhibit A with every proposal
6. Never include well, septic, underground electric, appliances, or driveway unless explicitly in the estimate
7. If any required field is missing, list the specific questions needed — be concise
8. For MA Stretch Code towns: add HERS rater ($1,200), ERV ($3,500), EV outlet ($350), solar conduit ($300) — ONLY if not already in the line items
9. Metal roof at 3:12 or lower pitch requires 2x12 rafters at 16" O.C. and structural ridge beam
10. 2x6 framing is required in MA Stretch Code towns to achieve R-20

## OUTPUT FORMAT
When generating a proposal or contract, return ONLY valid JSON. No markdown, no preamble, no explanation outside the JSON.

JSON structure:
{
  "documentType": "proposal" | "contract",
  "jobId": "string",
  "quoteNumber": "string",
  "validUntil": "string",
  "customer": { "name": "", "email": "", "phone": "", "address": "" },
  "project": { "address": "", "city": "", "state": "MA", "description": "", "sqft": 0 },
  "isStretchCodeTown": boolean,
  "sections": [
    {
      "sectionNumber": 1,
      "title": "",
      "type": "cover|overview_table|scope|exclusions|permit_checklist|cost_summary|responsibilities|legal|signature|exhibit_a",
      "content": {} 
    }
  ],
  "totalValue": 0,
  "depositAmount": 0,
  "flaggedItems": ["item1", "item2"],
  "clarificationsNeeded": ["question1", "question2"],
  "readyToGenerate": boolean
}`;
}

// ── PROCESS ESTIMATE → GENERATE PROPOSAL ────────────────────────────
async function processEstimate(rawEstimateText, jobId, language = 'en') {
  const settings = loadSettings();
  const knowledgeBase = loadKnowledgeBase();
  const systemPrompt = buildSystemPrompt(settings, knowledgeBase, language);
  const rates = getMarkupRates(settings);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Process this estimate and generate a Preferred Builders PROPOSAL & SCOPE OF WORK document.

Job ID: ${jobId}

ESTIMATE DATA:
${rawEstimateText}

INSTRUCTIONS:
- All submitted line item prices are BASE COSTS (what we pay subs/materials).
- DO NOT calculate markup, totals, or deposit. The system will do the math automatically.
- Just provide the line items with their base costs exactly as submitted.
- If the estimate includes a total, verify it matches the sum of line items. If they differ, flag the variance in flaggedItems.
- Grade each trade against Central MA market rates. Flag items >15% above or below typical range in flaggedItems.
- If line item prices are provided, USE THEM as base costs — do not ask for clarification on pricing.
- Only set readyToGenerate to false if CRITICAL construction details are missing (like foundation type for a new build). NEVER ask for customer name, email, phone, or address — those are always provided above the estimate data.
- For any details not specified (like sqft, foundation type, etc.), make reasonable assumptions based on the scope and note them in the proposal.
- For Stretch Code towns: ONLY add HERS rater ($1,200), ERV ($3,500), EV outlet ($350), solar conduit ($300) if NONE of these are mentioned or covered anywhere in the estimate. If there is a "Permits" line that says "stretch code compliance" or similar, those items are ALREADY INCLUDED — do NOT add them again. When in doubt, do NOT add them. If you do add any, mark them with "isStretchCode": true.
- Set readyToGenerate to true and generate the full proposal.
- Leave "validUntil", "totalValue", and "depositAmount" empty — the system fills them.

IMPORTANT — Cost Summary (sections[type="cost_summary"].content) format:
{
  "lineItems": [
    { "label": "Foundation", "baseCost": 28000 },
    { "label": "Framing", "baseCost": 130000 },
    { "label": "HERS Rater", "baseCost": 1200, "isStretchCode": true },
    { "label": "ERV System", "baseCost": 3500, "isStretchCode": true }
  ]
}
ONLY provide lineItems with "label", "baseCost", and optionally "isStretchCode": true for stretch code compliance items.
Stretch code items (HERS rater, ERV, EV outlet, solar conduit) MUST have "isStretchCode": true.
The system will calculate all markup, totals, and deposit automatically.
Stretch code items are added at flat cost — NO markup is applied to them.`
      }
    ]
  });

  const text = response.content[0].text;
  let proposalData;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    proposalData = JSON.parse(clean);
  } catch (e) {
    console.error('Failed to parse Claude response:', e);
    throw new Error('AI response parsing failed');
  }

  if (proposalData.readyToGenerate) {
    recalculatePricing(proposalData, rates);
  }

  return proposalData;
}

// ── SYSTEM-CONTROLLED PRICING MATH ──────────────────────────────────
function recalculatePricing(data, rates) {
  const validDate = new Date();
  validDate.setDate(validDate.getDate() + 15);
  data.validUntil = validDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const costSection = data.sections?.find(s => s.type === 'cost_summary');
  if (!costSection || !costSection.content) return;

  const items = costSection.content.lineItems || [];

  let tradeTotal = 0;
  let stretchCodeTotal = 0;

  for (const item of items) {
    const cost = item.baseCost || item.amount || item.cost || 0;
    item.baseCost = cost;
    if (item.isStretchCode) {
      stretchCodeTotal += cost;
    } else {
      tradeTotal += cost;
    }
  }

  const subOandPAmount = Math.round(tradeTotal * rates.subOandP);
  const subtotalAfterSubOP = tradeTotal + subOandPAmount;
  const gcOandPAmount = Math.round(subtotalAfterSubOP * rates.gcOandP);
  const subtotalAfterGCOP = subtotalAfterSubOP + gcOandPAmount;
  const contingencyAmount = Math.round(subtotalAfterGCOP * rates.contingency);
  const markedUpTotal = subtotalAfterGCOP + contingencyAmount;
  const totalContractPrice = markedUpTotal + stretchCodeTotal;
  const depositAmount = Math.round(totalContractPrice * rates.deposit);

  costSection.content = {
    lineItems: items,
    tradeTotal,
    stretchCodeTotal,
    subOandPPercent: Math.round(rates.subOandP * 100),
    subOandPAmount,
    subtotalAfterSubOP,
    gcOandPPercent: Math.round(rates.gcOandP * 100),
    gcOandPAmount,
    subtotalAfterGCOP,
    contingencyPercent: Math.round(rates.contingency * 100),
    contingencyAmount,
    totalContractPrice,
    depositPercent: Math.round(rates.deposit * 100),
    depositAmount
  };

  data.totalValue = totalContractPrice;
  data.depositAmount = depositAmount;

  console.log(`[Pricing] Trades: $${tradeTotal.toLocaleString()} → Sub O&P: $${subOandPAmount.toLocaleString()} → GC O&P: $${gcOandPAmount.toLocaleString()} → Contingency: $${contingencyAmount.toLocaleString()} + Stretch Code: $${stretchCodeTotal.toLocaleString()} → Total: $${totalContractPrice.toLocaleString()} → Deposit: $${depositAmount.toLocaleString()}`);
}

// ── GENERATE CONTRACT (after customer approval) ──────────────────────
async function generateContract(proposalData, jobId, language = 'en') {
  const settings = loadSettings();
  const knowledgeBase = loadKnowledgeBase();
  const systemPrompt = buildSystemPrompt(settings, knowledgeBase, language);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 10000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `The customer has APPROVED the proposal. Now generate the full CONTRACT WITH LEGAL TERMS.

Job ID: ${jobId}
Approved Proposal Data:
${JSON.stringify(proposalData, null, 2)}

Generate the complete contract JSON including:
- All proposal sections (same content, same numbers — do NOT recalculate pricing)
- Section 8: Full MA-compliant legal terms and conditions including:
  * Payment schedule and terms
  * Change order policy  
  * Contractor warranty (1 year workmanship)
  * Dispute resolution (mediation first)
  * MA HIC License disclosure (HIC-197400)
  * MA Homeowner Rights notice
  * Lien rights notice (MA Chapter 254)
  * Substantial completion definition
  * Force majeure clause
  * Termination rights
  * Insurance requirements
- Section 9: Signature block with date lines
- Exhibit A: Full allowance schedule

Document type should be "contract".
IMPORTANT: Keep all pricing numbers exactly the same as the approved proposal. Do not recalculate.`
      }
    ]
  });

  const text = response.content[0].text;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    throw new Error('Contract generation parsing failed');
  }
}

// ── HANDLE CLARIFICATION CONVERSATION ────────────────────────────────
async function handleClarification(jobId, userMessage, conversationHistory, language = 'en') {
  const settings = loadSettings();
  const knowledgeBase = loadKnowledgeBase();
  const systemPrompt = buildSystemPrompt(settings, knowledgeBase, language);

  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: systemPrompt + `\n\nYou are in a clarification conversation about job ${jobId}. 
    If the user's answers complete all missing information, respond with JSON: {"type":"ready","message":"..."} 
    If more questions remain, respond with JSON: {"type":"question","message":"...","questionsRemaining":N}
    If responding to Jackson in Portuguese, use {"type":"question","message":"...em português...","questionsRemaining":N}`,
    messages
  });

  const text = response.content[0].text;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { type: 'message', message: text };
  }
}

// ── ADMIN CHAT — Free conversation with the bot ──────────────────────
async function adminChat(messages, language = 'en') {
  const settings = loadSettings();
  const knowledgeBase = loadKnowledgeBase();
  const systemPrompt = buildSystemPrompt(settings, knowledgeBase, language) + `
  
You are in admin chat mode. Answer questions about:
- Pricing and estimates
- Massachusetts building codes
- Contract requirements
- How to complete Hearth estimates properly
- Construction best practices
Be helpful, precise, and direct. You can speak Portuguese if needed.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: systemPrompt,
    messages
  });

  return response.content[0].text;
}

module.exports = { processEstimate, generateContract, handleClarification, adminChat };
