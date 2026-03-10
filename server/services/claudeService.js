// server/services/claudeService.js
// Claude extracts structured data from estimates. The system does ALL math and PDF templating.

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

  return `You are a construction estimating data extractor for Preferred Builders General Services Inc. (HIC-197400), a licensed Massachusetts general contractor based in Fitchburg, MA.

${isPortuguese ? `IMPORTANT: When communicating with Jackson directly (admin chat / clarification), respond in Portuguese (Brazilian). Data extraction output is always in English.` : ''}

YOUR ONLY JOB: Read estimates and return structured JSON data. You do NOT format documents, write HTML, or make template decisions. The system handles all of that.

## COMPANY INFO
Name: Preferred Builders General Services Inc.
License: HIC-197400
Address: 37 Duck Mill Road, Fitchburg, MA 01420
Phone: 978-377-1784
Project Manager: Jackson Deaquino

## MARKET RATE GRADING
Compare each trade line item against typical Central MA market rates. Flag items >15% above or below typical range in "flaggedItems" with a note like:
  "Foundation ($28,000) — 18% above typical range ($20,000–$25,000 for slab-on-grade)"

## MA STRETCH CODE
Stretch Code towns require: HERS rater, ERV system, EV-ready outlet, solar conduit.
ONLY flag these as missing in stretchCodeItems if they are NOT already covered in the estimate (e.g. if a Permits line says "stretch code compliance", those items are already included).

## CONSTRUCTION KNOWLEDGE
- Metal roof at 3:12 or lower pitch requires 2x12 rafters at 16" O.C. and structural ridge beam
- 2x6 framing required in MA Stretch Code towns for R-20
- Never include well, septic, underground electric, appliances, or driveway unless explicitly in the estimate

## KNOWLEDGE BASE
${knowledgeBase}`;
}

// ── PROCESS ESTIMATE → EXTRACT DATA ─────────────────────────────────
async function processEstimate(rawEstimateText, jobId, language = 'en') {
  const settings = loadSettings();
  const knowledgeBase = loadKnowledgeBase();
  const systemPrompt = buildSystemPrompt(settings, knowledgeBase, language);
  const rates = getMarkupRates(settings);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 6000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Extract structured data from this estimate. Return ONLY valid JSON — no commentary, no markdown, no explanation.

Job ID: ${jobId}

ESTIMATE DATA:
${rawEstimateText}

Return this EXACT JSON structure:
{
  "readyToGenerate": true,
  "clarificationsNeeded": [],
  "quoteNumber": "",
  "validUntil": "",
  "customer": { "name": "", "email": "", "phone": "" },
  "project": {
    "address": "",
    "city": "",
    "state": "MA",
    "description": "",
    "sqft": 0,
    "stretchCodeTown": true/false
  },
  "lineItems": [
    { "trade": "Foundation", "baseCost": 28000, "scopeIncluded": ["30\\" footings", "4000PSI slab"], "scopeExcluded": ["Excavation"] }
  ],
  "exclusions": [
    { "name": "Well drilling", "reason": "Not in scope", "budget": "$8,000 - $15,000" }
  ],
  "stretchCodeItems": [],
  "flaggedItems": [],
  "notes": ""
}

RULES:
1. Return ONLY valid JSON. Nothing else.
2. Extract validUntil exactly as written in the estimate. If not specified, leave empty string.
3. Extract sqft exactly as written. If not specified, estimate from the scope and note in "notes".
4. Use submitted line item prices as baseCost — these are what we pay subs/materials.
5. DO NOT calculate any markup, totals, or deposit. The system does all math.
6. For each trade, populate scopeIncluded (what this contract covers) and scopeExcluded (what is NOT covered for that trade) using the scope notes from the estimate.
7. List EVERY exclusion mentioned in the estimate in the exclusions array with a budget estimate for the customer.
8. Only set readyToGenerate to false if CRITICAL construction details are missing. NEVER ask for customer name/email/phone/address — those are always provided above.
9. If the estimate has a "total" line, IGNORE it — the system calculates its own total from line items.
10. Customer info is already collected — do NOT include it in clarificationsNeeded.
11. stretchCodeItems should list any stretch code requirements NOT already covered in the estimate. If permits line says "stretch code compliance", leave this empty.`
      }
    ]
  });

  const text = response.content[0].text;
  let extractedData;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    extractedData = JSON.parse(clean);
  } catch (e) {
    console.error('Failed to parse Claude response:', e);
    throw new Error('AI response parsing failed');
  }

  if (extractedData.stretchCodeItems?.length > 0) {
    const stretchCosts = { 'HERS Rater': 1200, 'ERV System': 3500, 'EV-Ready Outlet': 350, 'Solar Conduit': 300 };
    for (const item of extractedData.stretchCodeItems) {
      const cost = stretchCosts[item] || 0;
      if (cost > 0) {
        extractedData.lineItems = extractedData.lineItems || [];
        extractedData.lineItems.push({ trade: item, baseCost: cost, isStretchCode: true, scopeIncluded: [item], scopeExcluded: [] });
      }
    }
  }

  if (extractedData.readyToGenerate) {
    applyPricing(extractedData, rates);
  }

  return extractedData;
}

// ── SYSTEM-CONTROLLED PRICING MATH ──────────────────────────────────
function applyPricing(data, rates) {
  if (!data.validUntil) {
    const validDate = new Date();
    validDate.setDate(validDate.getDate() + 15);
    data.validUntil = validDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  const items = data.lineItems || [];
  const markupMultiplier = (1 + rates.subOandP) * (1 + rates.gcOandP) * (1 + rates.contingency);
  let totalContractPrice = 0;

  for (const item of items) {
    const cost = item.baseCost || 0;
    item.baseCost = cost;
    if (item.isStretchCode) {
      item.finalPrice = cost;
    } else {
      item.finalPrice = Math.round(cost * markupMultiplier);
    }
    totalContractPrice += item.finalPrice;
  }

  const depositAmount = Math.round(totalContractPrice * rates.deposit);

  data.pricing = {
    markupMultiplier: Math.round(markupMultiplier * 10000) / 10000,
    totalContractPrice,
    depositPercent: Math.round(rates.deposit * 100),
    depositAmount
  };

  data.totalValue = totalContractPrice;
  data.depositAmount = depositAmount;

  console.log(`[Pricing] Markup: ${markupMultiplier.toFixed(4)}x → Total: $${totalContractPrice.toLocaleString()} → Deposit: $${depositAmount.toLocaleString()}`);
}

// ── GENERATE CONTRACT (after customer approval) ──────────────────────
async function generateContract(proposalData, jobId, language = 'en') {
  return proposalData;
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
