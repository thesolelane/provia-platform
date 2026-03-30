// server/services/claudeService.js
// Barrel re-export — all Claude AI logic has been split into focused modules:
//   claudeEstimate.js  — pricing math, system prompt, processEstimate, applyPricing
//   claudeContract.js  — generateContract (Claude Opus enrichment)
//   claudeChat.js      — handleClarification, adminChat, generateWizardQuestions

const estimate = require('./claudeEstimate');
const contract = require('./claudeContract');
const chat     = require('./claudeChat');

module.exports = {
  // From claudeEstimate
  loadSettings:           estimate.loadSettings,
  loadKnowledgeBase:      estimate.loadKnowledgeBase,
  getMarkupRates:         estimate.getMarkupRates,
  buildRatesSection:      estimate.buildRatesSection,
  buildSystemPrompt:      estimate.buildSystemPrompt,
  buildMemoryContext:     estimate.buildMemoryContext,
  getPriorVersionContext: estimate.getPriorVersionContext,
  WEB_SEARCH_TOOL:        estimate.WEB_SEARCH_TOOL,
  runWithTools:           estimate.runWithTools,
  processEstimate:        estimate.processEstimate,
  applyPricing:           estimate.applyPricing,

  // From claudeContract
  generateContract: contract.generateContract,

  // From claudeChat
  handleClarification:     chat.handleClarification,
  ADMIN_TOOLS:             chat.ADMIN_TOOLS,
  runAdminTool:            chat.runAdminTool,
  adminChat:               chat.adminChat,
  generateWizardQuestions: chat.generateWizardQuestions
};
