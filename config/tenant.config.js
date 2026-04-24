// config/tenant.config.js
// ─────────────────────────────────────────────────────────────────────────────
// PROVIA — Tenant Configuration
// Edit this file to deploy Provia for any contractor.
// All values are read from environment variables — no defaults are hardcoded.
// Set these in your .env file before starting the app.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {

  // ── Platform identity (do not change) ────────────────────────────────────
  platform: {
    name:    'Provia',
    tagline: 'The Way Forward',
    plusEnabled: process.env.PROVIA_PLUS === 'true',
  },

  // ── Company identity ──────────────────────────────────────────────────────
  company: {
    name:        process.env.COMPANY_NAME        || '',
    license:     process.env.COMPANY_LICENSE     || '',
    hicLicense:  process.env.COMPANY_HIC_LICENSE || '',
    address:     process.env.COMPANY_ADDRESS     || '',
    phone:       process.env.COMPANY_PHONE       || '',
    email:       process.env.COMPANY_EMAIL       || '',
    botEmail:    process.env.BOT_EMAIL           || '',
    website:     process.env.COMPANY_WEBSITE     || '',
    city:        process.env.COMPANY_CITY        || '',
    state:       process.env.COMPANY_STATE       || '',
    zip:         process.env.COMPANY_ZIP         || '',
  },

  // ── Primary contact (appears on contracts, PDFs, AI prompts) ─────────────
  primaryContact: {
    name:     process.env.PRIMARY_CONTACT_NAME     || '',
    title:    process.env.PRIMARY_CONTACT_TITLE    || 'Project Manager',
    email:    process.env.PRIMARY_CONTACT_EMAIL    || process.env.COMPANY_EMAIL || '',
    whatsapp: process.env.JACKSON_WHATSAPP         || '',
    language: process.env.PRIMARY_CONTACT_LANGUAGE || 'en',
  },

  // ── Owner / admin ─────────────────────────────────────────────────────────
  owner: {
    name:     process.env.OWNER_NAME     || 'Owner',
    email:    process.env.OWNER_EMAIL    || '',
    whatsapp: process.env.OWNER_WHATSAPP || '',
  },

  // ── Approved inbound email senders ───────────────────────────────────────
  approvedSenders: (process.env.APPROVED_SENDERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  // ── Brand colors — Provia platform colors, not tenant-configurable ─────────
  brand: {
    primary:   '#2F5A7E',   // Provia dark blue
    accent:    '#FF9500',   // Provia orange
    lightBlue: '#2E8CCF',   // Provia light blue
    dark:      '#163853',   // Provia darkest blue
    lightGray: '#F8F8F8',
  },

  // ── AI / bot behavior ─────────────────────────────────────────────────────
  botBehavior: {
    maxClarificationRounds:      parseInt(process.env.BOT_MAX_CLARIFICATIONS || '3'),
    flagVariancePercent:         parseInt(process.env.BOT_FLAG_VARIANCE      || '15'),
    requireReviewBeforeCustomer: process.env.BOT_REQUIRE_REVIEW !== 'false',
    defaultRatePoint:            process.env.BOT_DEFAULT_RATE   || 'mid',
    alwaysIncludeExhibitA:       process.env.BOT_EXHIBIT_A      !== 'false',
    ccOwnerOnAll:                process.env.BOT_CC_OWNER       !== 'false',
    proposalFirst:               process.env.BOT_PROPOSAL_FIRST !== 'false',
    maxProcessingMinutes:        parseInt(process.env.BOT_MAX_MINUTES        || '5'),
  },

};
