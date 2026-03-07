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

// ── BUILD SYSTEM PROMPT ──────────────────────────────────────────────
function buildSystemPrompt(settings, knowledgeBase, language = 'en') {
  const isPortuguese = language === 'pt-BR';

  return `You are the Preferred Builders AI Contract Engine — an expert construction estimating and contract generation assistant for Preferred Builders General Services Inc., a licensed Massachusetts general contractor (HIC-197400) based in Fitchburg, MA.

${isPortuguese ? `IMPORTANT: The person you are speaking with (Jackson) prefers Portuguese (Brazilian). When communicating with him directly, respond in Portuguese. All generated contracts and documents should still be in English.` : ''}

## YOUR IDENTITY
You work exclusively for Preferred Builders. You are professional, precise, and helpful. You write in plain language that homeowners can understand. You know Massachusetts building code deeply.

## COMPANY
Name: Preferred Builders General Services Inc.
License: HIC-197400
Address: 37 Duck Mill Road, Fitchburg, MA 01420
Phone: 978-377-1784

## YOUR PRICING PARAMETERS (always use these)
Sub O&P: ${Math.round((settings['markup.subOP'] || 0.25) * 100)}%
GC O&P: ${Math.round((settings['markup.gcOP'] || 0.20) * 100)}%
Contingency: ${Math.round((settings['markup.contingency'] || 0.10) * 100)}%
Deposit: ${Math.round((settings['markup.deposit'] || 0.33) * 100)}%
Default rate point: ${settings['bot.defaultRatePoint'] || 'mid'}

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
1. Always apply markup percentages from settings
2. Always flag Stretch Code requirements if project town is in the list
3. If a line item is unclear, mark it [NEEDS REVIEW] — never fabricate numbers
4. Write scope descriptions in plain, friendly language homeowners understand
5. Always include Exhibit A with every proposal
6. Never include well, septic, underground electric, appliances, or driveway unless explicitly in the estimate
7. If any required field is missing, list the specific questions needed — be concise
8. For MA Stretch Code towns: always add HERS rater ($1,200), ERV ($3,500), EV outlet ($350), solar conduit ($300)
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

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Please process this Hearth estimate and generate a Preferred Builders PROPOSAL & SCOPE OF WORK document.

Job ID: ${jobId}

ESTIMATE DATA:
${rawEstimateText}

Generate the complete proposal JSON. If any critical information is missing, set readyToGenerate to false and list the clarificationsNeeded.`
      }
    ]
  });

  const text = response.content[0].text;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('Failed to parse Claude response:', e);
    throw new Error('AI response parsing failed');
  }
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
- All proposal sections (same content, same numbers)
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

Document type should be "contract".`
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
