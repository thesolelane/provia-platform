// server/services/leadCheckService.js
// Server-side proxy for leadsafehomes.mass.gov (Lead Safe Homes 1.0).
// POST to the ASP.NET form, parse the HTML response, and return a result object.
// Must run server-side to avoid CORS restrictions.
/* global AbortSignal */

const LEAD_URL = 'https://leadsafehomes.mass.gov/leadsafehomes/default.aspx';
const LEADSAFE_URL = 'https://leadsafehomes.mass.gov/leadsafehomes/';
const LEADSAFE2_URL = 'https://massit.hylandcloud.com/203CLPPPPublicAccess/';

function extractHidden(html, name) {
  const match =
    html.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`, 'i')) ||
    html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'i'));
  return match ? match[1] : '';
}

function detectRecord(html) {
  const negative = [
    /no records found/i,
    /no results found/i,
    /did not return any results/i,
    /0 records/i
  ];
  const positive = [
    /class="searchResults"/i,
    /class="GridRow"/i,
    /StreetNum/i,
    /Inspection Date/i,
    /Compliance/i
  ];

  for (const pat of negative) {
    if (pat.test(html)) return false;
  }
  for (const pat of positive) {
    if (pat.test(html)) return true;
  }

  const tableRows = (html.match(/<tr[\s>]/gi) || []).length;
  return tableRows > 3;
}

/**
 * Check whether a property has a lead inspection record in the CLPPP historical database.
 *
 * @param {object} opts
 * @param {string} opts.town - MA city/town name (e.g. "FITCHBURG")
 * @param {string} opts.street - Street name (e.g. "MAIN ST")
 * @param {string} [opts.number] - Street number (e.g. "100")
 * @returns {Promise<{hasRecord: boolean, leadsafeUrl: string, leadsafe2Url: string, note: string, queriedAt: string}>}
 */
async function checkLeadRecord({ town, street, number = '' } = {}) {
  if (!town || !street) {
    throw new Error('town and street are required');
  }

  // Step 1: GET the page to grab ASP.NET hidden fields
  const pageRes = await fetch(LEAD_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PBLeadCheckProxy/1.0)' },
    signal: AbortSignal.timeout(20000)
  });

  if (!pageRes.ok) {
    throw new Error(`Lead Safe Homes returned HTTP ${pageRes.status}`);
  }

  const pageHtml = await pageRes.text();
  const cookies = pageRes.headers.get('set-cookie') || '';

  const viewstate = extractHidden(pageHtml, '__VIEWSTATE');
  const viewstateGen = extractHidden(pageHtml, '__VIEWSTATEGENERATOR');
  const eventValidation = extractHidden(pageHtml, '__EVENTVALIDATION');

  // Step 2: POST the search form
  const formBody = new URLSearchParams({
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    __VIEWSTATE: viewstate,
    __VIEWSTATEGENERATOR: viewstateGen,
    __EVENTVALIDATION: eventValidation,
    'ctl00$ContentPlaceHolder1$ddlCity': town.toUpperCase(),
    'ctl00$ContentPlaceHolder1$txtStreetName': street.toUpperCase(),
    'ctl00$ContentPlaceHolder1$txtStreetNum': number || '',
    'ctl00$ContentPlaceHolder1$btnSearch': 'Search'
  });

  const searchRes = await fetch(LEAD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (compatible; PBLeadCheckProxy/1.0)',
      Cookie: cookies,
      Referer: LEAD_URL
    },
    body: formBody.toString(),
    signal: AbortSignal.timeout(20000)
  });

  const resultHtml = await searchRes.text();
  const hasRecord = detectRecord(resultHtml);

  return {
    hasRecord,
    leadsafeUrl: LEADSAFE_URL,
    leadsafe2Url: LEADSAFE2_URL,
    note: hasRecord
      ? 'A lead inspection record exists. Visit Lead Safe Homes 2.0 for full documents.'
      : 'No lead inspection record found in the historical database.',
    source: 'Lead Safe Homes 1.0 (CLPPP historical database)',
    queriedAt: new Date().toISOString()
  };
}

module.exports = { checkLeadRecord };
