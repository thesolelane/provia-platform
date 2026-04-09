// server/services/claudeContract.js
// Contract AI: uses Claude Opus to derive county, duration, and special conditions.

const Anthropic = require('@anthropic-ai/sdk');
const { logTokenUsage } = require('../utils/tokenLogger');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateContract(proposalData, _jobId, _language = 'en') {
  const lineItems =
    (proposalData.lineItems || []).map((i) => i.trade).join(', ') || 'General construction';
  const projectType = proposalData.project?.type || 'renovation';
  const city = proposalData.project?.city || '';
  const totalValue = proposalData.pricing?.totalContractPrice || proposalData.totalValue || 0;

  let enrichment = {};
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 800,
      temperature: 0,
      system: `You are a Massachusetts construction contract assistant for Preferred Builders General Services Inc. (HIC-197400). Return ONLY valid JSON — no commentary, no markdown.`,
      messages: [
        {
          role: 'user',
          content: `Given this construction project, return contract enrichment data.

Project Type: ${projectType}
City/Town: ${city}, MA
Total Contract Value: $${Number(totalValue).toLocaleString()}
Trades/Scope: ${lineItems}

Return this EXACT JSON:
{
  "county": "Worcester",
  "estimatedDurationWeeks": 12,
  "specialConditions": []
}

Rules:
1. county: the Massachusetts county for the given city/town. Default to "Worcester" if unsure.
2. estimatedDurationWeeks: realistic duration based on project type and value. New home: 26–52. ADU: 16–26. Major renovation: 12–24. Bath/kitchen: 4–8. Painting/flooring: 1–3.
3. specialConditions: array of 0–3 short strings (max 120 chars each) for any project-specific legal or permit notes. Usually empty for standard renovations.`
        }
      ]
    });

    logTokenUsage({
      service: 'claude',
      model: 'claude-opus-4-5',
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      context: 'contract'
    });
    const text = response.content.find((b) => b.type === 'text')?.text?.trim() || '';
    const clean = text.replace(/```json|```/g, '').trim();
    enrichment = JSON.parse(clean);
    console.log(
      `[generateContract] Opus enrichment OK — county: ${enrichment.county}, duration: ${enrichment.estimatedDurationWeeks}w, conditions: ${(enrichment.specialConditions || []).length}`
    );
  } catch (e) {
    console.warn('[generateContract] Opus enrichment failed, using defaults:', e.message);
    enrichment = { county: 'Worcester', estimatedDurationWeeks: 12, specialConditions: [] };
  }

  return {
    ...proposalData,
    county: enrichment.county || 'Worcester',
    estimatedDurationWeeks: Number(enrichment.estimatedDurationWeeks) || 12,
    specialConditions: Array.isArray(enrichment.specialConditions)
      ? enrichment.specialConditions
      : []
  };
}

module.exports = { generateContract };
