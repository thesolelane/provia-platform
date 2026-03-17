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
  "customer": {
    "name": "",
    "email": "",
    "phone": "",
    "address_line1": "",
    "city_state_zip": ""
  },
  "project": {
    "address": "",
    "city": "",
    "state": "MA",
    "jurisdiction": "",
    "parcel_number": "",
    "type": "renovation",
    "description": "",
    "sqft": 0,
    "stretchCodeTown": false
  },
  "job": {
    "has_demo": false,
    "has_framing": false,
    "has_insulation": false,
    "has_permit": false,
    "permit_fee": "",
    "has_engineer": false,
    "engineer_fee": "",
    "has_architect": false,
    "architect_fee": "",
    "sub_deposits": null,
    "special_order_deposits": null,
    "trades": {
      "electrical": false,
      "plumbing": false,
      "hvac": false,
      "sprinkler": false
    },
    "adu": {
      "on_septic": false,
      "separate_metering": false,
      "site_plan_required": false,
      "new_sewer_connection": false
    }
  },
  "allowances": {
    "flooring_lvp": false,
    "flooring_tile": false,
    "flooring_carpet": false,
    "kitchen_cabinets": false,
    "kitchen_counter": false,
    "kitchen_faucet": false,
    "kitchen_sink": false,
    "kitchen_disposal": false,
    "bath_vanity_full": false,
    "bath_vanity_half": false,
    "bath_vanity_top": false,
    "bath_faucet": false,
    "bath_toilet": false,
    "bath_tub": false,
    "bath_shower_valve": false,
    "bath_shower_door": false,
    "bath_accessories": false,
    "bath_exhaust_fan": false,
    "doors_interior": false,
    "doors_passage": false,
    "doors_privacy": false,
    "doors_bifold": false,
    "doors_base_molding": false,
    "doors_casing": false,
    "doors_window_stool": false
  },
  "lineItems": [
    {
      "trade": "Foundation",
      "baseCost": 28000,
      "description": "Install 30-inch concrete footings and 4,000 PSI slab on grade. Includes all forming, rebar, and concrete placement specific to this project.",
      "scopeIncluded": ["30\" continuous footings at frost depth", "4,000 PSI fiber-reinforced slab on grade", "Rebar per engineer specs", "Concrete forming and stripping"],
      "scopeExcluded": ["Excavation and site grading"]
    }
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
6. For each trade, write a "description" — 1 to 3 sentences describing the SPECIFIC work being done on THIS project (not generic boilerplate). Then populate scopeIncluded with specific, detailed work items directly from the estimate, and scopeExcluded with what is NOT covered for that trade. Never use generic filler — every item must be traceable to the actual estimate text.
7. List EVERY exclusion mentioned in the estimate in the exclusions array with a budget estimate for the customer.
8. Only set readyToGenerate to false if CRITICAL construction details are missing. NEVER ask for customer name/email/phone/address — those are always provided above.
9. If the estimate has a "total" line, IGNORE it — the system calculates its own total from line items.
10. Customer info is already collected — do NOT include it in clarificationsNeeded.
11. stretchCodeItems should list any stretch code requirements NOT already covered in the estimate. If permits line says "stretch code compliance", leave this empty.
12. project.type: set "new_construction" if building from the ground up (foundation, framing, full build). Set "adu" if the scope is an accessory dwelling unit / in-law suite / carriage house / garage apartment. Set "renovation" for all other projects (remodel, addition, fit-out, repair).
13. project.jurisdiction: the city or town name in format "City of Worcester" or "Town of Fitchburg". Use project.city if not explicitly stated.
14. project.parcel_number: extract if present in estimate documents (often labeled Parcel, APN, Map/Lot). Leave empty string if not found.
15. customer.address_line1 / city_state_zip: owner's own mailing address if it differs from the project address. Leave empty if same as project address.
16. job section: set all booleans by reading the actual scope — do NOT infer from trade names alone. has_permit=true if permit work is in scope. has_engineer=true if structural/MEP engineering is in scope. has_demo=true if demolition is in scope. has_framing=true if new or modified framing is in scope. has_insulation=true if insulation is in scope. trades.electrical=true if electrical rough-in or finish is in scope. trades.plumbing=true if plumbing rough-in or finish is in scope. trades.hvac=true if HVAC, mechanical, heat, or cooling is in scope.
17. permit_fee, engineer_fee, architect_fee: extract the dollar amount as a string (e.g. "$1,200") if explicitly stated in the estimate. Leave empty string if not stated.
18. sub_deposits: dollar amount (string) if the estimate calls for subcontractor mobilization deposits. null if not mentioned.
19. special_order_deposits: dollar amount (string) if the estimate includes custom, special-order, or long-lead material deposits. null if not mentioned.
20. allowances: set true for each allowance item that is relevant to this project scope. Example: if bathrooms are in scope, set bath_vanity_full, bath_toilet, bath_faucet, bath_exhaust_fan etc. to true. If flooring is in scope, set flooring_lvp and/or flooring_tile to true. If kitchen is in scope, set kitchen_* items to true. If interior doors and trim are in scope, set doors_* items to true. Only include allowances that make sense for the actual scope — do not set all to true for a simple repair job.
21. job.adu section: only populate if project.type === "adu". on_septic=true if the property uses a septic system. separate_metering=true if the ADU will have separate electric/gas metering. site_plan_required=true if the municipality requires site plan review. new_sewer_connection=true if a new sewer connection is required.`
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
  // Always set validUntil to today + 15 days — every generated proposal is valid for 15 days from generation
  const validDate = new Date();
  validDate.setDate(validDate.getDate() + 15);
  data.validUntil = validDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

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

  // Waste removal / dumpster — folded into total, not shown as a line item
  // Under $10K: $600 (min), $10K–$25K: $1,200 (40-yard 5T), above $25K: +$1,200 per $15K
  const hasDumpster = items.some(i =>
    /dumpster|waste\s*removal|debris\s*removal/i.test(i.trade || '')
  );
  if (!hasDumpster) {
    let totalBase = 0;
    for (const item of items) totalBase += (item.baseCost || 0);
    let dumpsterCost;
    if (totalBase < 10000) {
      dumpsterCost = 600;
    } else if (totalBase <= 25000) {
      dumpsterCost = 1200;
    } else {
      const extraDumpsters = Math.ceil((totalBase - 25000) / 15000);
      dumpsterCost = 1200 + (extraDumpsters * 1200);
    }
    totalContractPrice += Math.round(dumpsterCost * markupMultiplier);
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
// ── ADMIN TOOLS (for tool calling) ───────────────────────────────────────────
const ADMIN_TOOLS = [
  {
    name: 'lookup_contacts',
    description: 'Search for customer/contact information in the database by name, email, or phone number. Use this whenever someone asks about a customer\'s contact info.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, email, or phone to search for' }
      },
      required: ['query']
    }
  },
  {
    name: 'lookup_jobs',
    description: 'Search for jobs/projects by customer name or project address. Returns recent status and value info.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Customer name or project address to search for' }
      },
      required: ['query']
    }
  },
  {
    name: 'create_task',
    description: 'Create a task, reminder, or to-do item. Use this when someone says "remind me to", "schedule", "make a note", "add a task", or similar.',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string',  description: 'Short task title (e.g. "Call for inspection at 123 Main St")' },
        description: { type: 'string',  description: 'Additional details or notes about the task' },
        due_at:      { type: 'string',  description: 'Due date/time in ISO 8601 format (e.g. "2026-03-15T17:00:00"). Use the current date as reference if the user says "tomorrow" or "next week".' },
        priority:    { type: 'string',  enum: ['high', 'normal', 'low'], description: 'Priority level' },
        job_address: { type: 'string',  description: 'Project address if the task relates to a specific job' }
      },
      required: ['title']
    }
  }
];

async function runAdminTool(toolName, toolInput, db) {
  const { makeCalendarURL } = require('../routes/tasks');

  if (toolName === 'lookup_contacts') {
    const q = `%${toolInput.query}%`;
    const results = db.prepare(
      `SELECT name, email, phone, address, city, state, customer_number FROM contacts
       WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? LIMIT 5`
    ).all(q, q, q);
    if (!results.length) return 'No contacts found matching that search.';
    return results.map(c =>
      `**${c.name}** (${c.customer_number || 'no ID'})\nEmail: ${c.email || '—'}\nPhone: ${c.phone || '—'}\nAddress: ${[c.address, c.city, c.state].filter(Boolean).join(', ') || '—'}`
    ).join('\n\n');
  }

  if (toolName === 'lookup_jobs') {
    const q = `%${toolInput.query}%`;
    const results = db.prepare(
      `SELECT id, customer_name, customer_email, customer_phone, project_address, project_city, status, total_value, created_at
       FROM jobs WHERE archived = 0 AND (customer_name LIKE ? OR project_address LIKE ?) ORDER BY created_at DESC LIMIT 5`
    ).all(q, q);
    if (!results.length) return 'No jobs found matching that search.';
    return results.map(j =>
      `**${j.customer_name}** — ${j.project_address}${j.project_city ? ', ' + j.project_city : ''}\nStatus: ${j.status?.replace(/_/g, ' ')}\nValue: ${j.total_value ? '$' + Number(j.total_value).toLocaleString() : '—'}\nEmail: ${j.customer_email || '—'} | Phone: ${j.customer_phone || '—'}`
    ).join('\n\n');
  }

  if (toolName === 'create_task') {
    const { title, description, due_at, priority, job_address } = toolInput;
    let job_id = null;
    if (job_address) {
      const job = db.prepare(`SELECT id FROM jobs WHERE project_address LIKE ? LIMIT 1`).get(`%${job_address}%`);
      job_id = job?.id || null;
    }
    const task = { title, description: description || null, due_at: due_at || null, job_id, contact_id: null, priority: priority || 'normal', calendar_url: null };
    const info = db.prepare(
      `INSERT INTO tasks (title, description, due_at, job_id, priority) VALUES (?, ?, ?, ?, ?)`
    ).run(task.title, task.description, task.due_at, task.job_id, task.priority);
    const saved = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
    const calURL = makeCalendarURL(saved);
    if (calURL) { db.prepare('UPDATE tasks SET calendar_url = ? WHERE id = ?').run(calURL, saved.id); saved.calendar_url = calURL; }
    return JSON.stringify({ created: true, task_id: saved.id, title: saved.title, due_at: saved.due_at, calendar_url: saved.calendar_url });
  }

  return 'Unknown tool.';
}

async function adminChat(messages, language = 'en', db = null, sender = null) {
  const settings     = loadSettings();
  const knowledgeBase = loadKnowledgeBase();

  const today = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const senderName = sender ? sender.name : null;
  const senderRole = sender ? sender.role : 'team member';
  const senderLine = senderName
    ? `IMPORTANT: You are speaking with ${senderName} (${senderRole}). Their identity is confirmed — they are registered in the system. NEVER ask who they are. Always address them by name.`
    : `You are speaking with an authorized team member. Do not ask who they are.`;

  const systemPrompt = buildSystemPrompt(settings, knowledgeBase, language) + `

You are the Preferred Builders AI assistant in WhatsApp chat mode.
Today is: ${today}

${senderLine}

You have live access to the database and can:
- Look up any customer contact info (name, email, phone) using lookup_contacts
- Look up job/project status and info using lookup_jobs
- Create tasks, reminders, and to-do items using create_task

Answer questions about:
- Customer and contact information (always use the lookup tool)
- Job status and project details (always use the lookup tool)
- Pricing and estimates
- Massachusetts building codes
- Contract requirements
- Task and reminder creation (use the create_task tool)
- Construction best practices

Be helpful, precise, and direct. You can speak Portuguese if needed.
When you create a task, confirm it was saved and mention if a calendar link is available.

IMPORTANT STYLE RULES:
- Never introduce yourself or list your capabilities unprompted.
- Never say things like "I now have live access to..." or "Try asking..."
- If someone just says hi or starts a conversation with no specific request, reply only with: "👷 Hey ${senderName || 'there'}, what do you need?"
- Keep all responses short and direct.`;

  const msgsToSend = [...messages];
  let createdTask = null;

  // Tool-calling loop
  for (let turn = 0; turn < 5; turn++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      tools: db ? ADMIN_TOOLS : [],
      messages: msgsToSend
    });

    if (response.stop_reason === 'end_turn' || !response.content.some(b => b.type === 'tool_use')) {
      const text = response.content.find(b => b.type === 'text')?.text || '';
      return { reply: text, createdTask };
    }

    // Append assistant message with all content blocks
    msgsToSend.push({ role: 'assistant', content: response.content });

    // Execute tool calls
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      let result;
      try {
        result = await runAdminTool(block.name, block.input, db);
        // Track created tasks for the frontend
        if (block.name === 'create_task') {
          try { const parsed = JSON.parse(result); if (parsed.created) createdTask = parsed; } catch {}
        }
      } catch (e) {
        result = `Error: ${e.message}`;
      }
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }

    msgsToSend.push({ role: 'user', content: toolResults });
  }

  return { reply: 'I ran into an issue processing your request. Please try again.', createdTask };
}

module.exports = { processEstimate, generateContract, handleClarification, adminChat };
