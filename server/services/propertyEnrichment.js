// server/services/propertyEnrichment.js
// Non-blocking background enrichment: runs MassGIS + lead check for a job or lead
// and stores the result in the property_data JSON column.

const { lookupPropertyByAddress, parseAddress } = require('./massGisService');
const { checkLeadRecord } = require('./leadCheckService');
const perplexity = require('./perplexityService');

/**
 * Enrich a record with property data. Runs in the background (fire-and-forget).
 *
 * @param {object} db - better-sqlite3 database instance
 * @param {'job'|'lead'} type - record type
 * @param {string} id - record id
 * @param {string} address - full address string (e.g. "123 Main St, Fitchburg, MA 01420")
 */
async function enrichProperty(db, type, id, address) {
  if (!address) return;

  // Best-effort: the app operates exclusively in Massachusetts.
  // We don't gate on detecting "MA" in the address string because users often
  // enter addresses without the state abbreviation (e.g. "123 Main St, Fitchburg").
  // The MassGIS API will simply return no results if the address is outside MA
  // (or misspelled), and the service handles that case gracefully.

  const table = type === 'lead' ? 'leads' : 'jobs';

  try {
    console.log(`[PropertyEnrichment] Starting enrichment for ${type} ${id} at "${address}"`);

    let massGisData = null;
    let leadData = null;

    // MassGIS lookup
    try {
      massGisData = await lookupPropertyByAddress(address);
      if (!massGisData && perplexity.isConfigured()) {
        console.log(`[PropertyEnrichment] MassGIS returned no result — falling back to web_search for ${address}`);
        const webResult = await perplexity.search(
          `property assessor data year built ${address} Massachusetts`,
          'general'
        );
        if (webResult) {
          massGisData = { webSearchFallback: true, webResult, queriedAt: new Date().toISOString() };
        }
      }
    } catch (err) {
      console.warn(`[PropertyEnrichment] MassGIS error for ${type} ${id}:`, err.message);
    }

    // Lead check lookup
    try {
      const parsed = parseAddress(address);
      if (parsed?.town && parsed?.streetName) {
        leadData = await checkLeadRecord({
          town: parsed.town,
          street: parsed.streetName,
          number: parsed.streetNumber
        });
      }
    } catch (err) {
      console.warn(`[PropertyEnrichment] Lead check error for ${type} ${id}:`, err.message);
    }

    const propertyData = {
      massGis: massGisData,
      leadCheck: leadData,
      enrichedAt: new Date().toISOString()
    };

    db.prepare(`UPDATE ${table} SET property_data = ? WHERE id = ?`).run(
      JSON.stringify(propertyData),
      id
    );

    console.log(
      `[PropertyEnrichment] Saved property_data for ${type} ${id} — ` +
        `MassGIS: ${massGisData ? 'found' : 'null'}, ` +
        `Lead: ${leadData ? (leadData.hasRecord ? 'found' : 'not found') : 'null'}`
    );
  } catch (err) {
    console.error(`[PropertyEnrichment] Unexpected error for ${type} ${id}:`, err.message);
  }
}

/**
 * Fire-and-forget wrapper — never throws, never blocks the caller.
 */
function enrichPropertyBackground(db, type, id, address) {
  if (!address || !id) return;
  setImmediate(() => {
    enrichProperty(db, type, id, address).catch((err) =>
      console.error('[PropertyEnrichment] Unhandled:', err.message)
    );
  });
}

module.exports = { enrichPropertyBackground, enrichProperty };
