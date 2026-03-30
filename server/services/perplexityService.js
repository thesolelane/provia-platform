// server/services/perplexityService.js
// Perplexity Sonar API — Claude's tool for real-time data.
// Claude decides when to call this; we decide which model to use based on search_type.
// Goal: smallest query, smallest response, just the fact Claude needs.

const https = require('https');
const { logTokenUsage } = require('../utils/tokenLogger');

const API_KEY = process.env.PERPLEXITY_API_KEY;
const ENDPOINT = 'api.perplexity.ai';

// Model routing — cheap/fast for simple lookups, pro only for code/detailed research
const MODEL_MAP = {
  material_price: 'sonar', // current lumber, concrete, roofing prices
  permit_fee: 'sonar', // county permit fee schedules
  labor_rate: 'sonar', // subcontractor market rates
  building_code: 'sonar-pro', // code sections need more precision
  supplier: 'sonar', // local supplier research
  general: 'sonar' // catch-all, default to cheap
};

// Max tokens per model — keep responses tight
const MAX_TOKENS = {
  sonar: 250,
  'sonar-pro': 400
};

// System prompt for all Perplexity calls — instructs it to be concise and factual
const SONAR_SYSTEM = `You are a concise construction data assistant. Respond with ONLY the specific data point requested — no introductions, no caveats, no lists of options unless specifically asked. Return a single direct answer in 1–3 sentences maximum. If you cannot find current data, say so in one sentence.`;

function callPerplexity(model, query, searchType = 'general') {
  return new Promise((resolve, _reject) => {
    if (!API_KEY) {
      return resolve('[Perplexity] API key not configured — web search unavailable.');
    }

    const body = JSON.stringify({
      model,
      max_tokens: MAX_TOKENS[model] || 250,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SONAR_SYSTEM },
        { role: 'user', content: query }
      ]
    });

    const opts = {
      hostname: ENDPOINT,
      path: '/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.error) return resolve(`[Search error: ${json.error.message || json.error}]`);
          const answer = json.choices?.[0]?.message?.content || '[No result]';
          const usage = json.usage || {};
          console.log(
            `[Perplexity] model=${model} in=${usage.prompt_tokens || '?'} out=${usage.completion_tokens || '?'} query="${query.slice(0, 60)}"`
          );
          logTokenUsage({
            service: 'perplexity',
            model,
            inputTokens: usage.prompt_tokens || 0,
            outputTokens: usage.completion_tokens || 0,
            context: searchType || 'search'
          });
          resolve(answer.trim());
        } catch (e) {
          resolve(`[Search parse error: ${e.message}]`);
        }
      });
    });

    req.on('error', (err) => resolve(`[Search network error: ${err.message}]`));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve('[Search timeout]');
    });
    req.write(body);
    req.end();
  });
}

// ── Main entry point — called when Claude uses the web_search tool ────────────
// search_type determines model; query is what Claude asked for
async function search(query, search_type = 'general') {
  const model = MODEL_MAP[search_type] || 'sonar';
  try {
    return await callPerplexity(model, query, search_type);
  } catch (e) {
    console.error('[perplexityService] Error:', e.message);
    return `[Search failed: ${e.message}]`;
  }
}

// ── Batch search — for multiple queries at once (runs in parallel) ────────────
// More efficient than sequential calls when multiple data points are needed
async function searchBatch(queries) {
  return Promise.all(queries.map((q) => search(q.query, q.search_type)));
}

module.exports = { search, searchBatch, isConfigured: () => !!API_KEY };
