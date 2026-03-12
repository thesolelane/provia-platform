# Preferred Builders AI Contract System

## Overview
AI-powered construction estimation, contract generation, and team communication system for Preferred Builders General Services Inc. (HIC-197400).

## Architecture — Data Flow
1. Jackson submits estimate text (base costs + scope notes)
2. **Claude** reads the estimate and returns **flat structured JSON** — just data, no formatting
3. **System** (`recalculatePricing` in `claudeService.js`) applies markup math to each line item
4. **PDF template** (`pdfService.js`) reads the flat JSON and renders the document — all template logic lives here, never in Claude

Claude's JSON output:
```json
{
  "lineItems": [{ "trade": "Foundation", "baseCost": 28000, "scopeIncluded": [...], "scopeExcluded": [...] }],
  "exclusions": [{ "name": "...", "reason": "...", "budget": "..." }],
  "customer": {...}, "project": {...},
  "flaggedItems": [...], "stretchCodeItems": [...]
}
```
System adds: `finalPrice`, `pricing`, `totalValue`, `depositAmount`, `validUntil`

## Stack
- **Backend:** Express.js on port 5000
- **Frontend:** React (Create React App), served as static build from `client/build`
- **Database:** SQLite via better-sqlite3 (`data/preferred_builders.db`)
- **AI:** Anthropic Claude API (claude-sonnet-4-20250514) via `server/services/claudeService.js`
- **PDF Generation:** Puppeteer via `server/services/pdfService.js`
- **Email:** Mailgun via `server/services/emailService.js`
- **WhatsApp:** Twilio sandbox + poller via `server/services/whatsappService.js` and `server/services/whatsappPoller.js`

## Key Files
- `server/index.js` — Main server entry
- `server/db/database.js` — SQLite schema & init (7 tables + seed data)
- `server/routes/` — API routes (auth, jobs, settings, knowledge, conversations, whitelist, webhooks)
- `server/routes/jobs.js` — Job CRUD + `/reprocess` endpoint to re-run Claude + regenerate PDF
- `server/middleware/auth.js` — Session-based auth (in-memory Map)
- `server/services/claudeService.js` — Claude data extraction + `applyPricing()` math
- `server/services/pdfService.js` — Complete PDF template (proposal + contract + Exhibit A)
- `client/src/App.jsx` — React app root with auto-logout on 401
- `client/src/pages/` — Dashboard, JobDetail, Settings, KnowledgeBase, AdminChat, Whitelist, FieldGuide

## Pricing Model (Option A)
Jackson submits BASE COSTS (what we pay subs/materials). The SYSTEM applies markup per line item — Claude never does math:
- Combined multiplier: (1 + Sub O&P 15%) × (1 + GC O&P 25%) × (1 + Contingency 10%) = ~1.5813x
- Each trade line item: baseCost × multiplier = finalPrice (customer-facing)
- Stretch code items (isStretchCode: true) are passed through at flat cost — no markup
- Customer sees final prices per trade — no separate markup breakdown shown
- Deposit: 33% of contract total
- Valid-until: uses date from estimate if provided, otherwise 15 days from proposal date
- If estimate already includes stretch code compliance (e.g. in Permits line), system does NOT add duplicate items
Config: `config/parameters.js` (defaults) + `settings` table in DB (runtime overrides)
Claude grades each trade against Central MA market rates and flags items >15% above/below typical range.

## Archive System
Jobs are soft-deleted (archived) not hard-deleted. Archived jobs are automatically purged after 90 days. Users can restore archived jobs from the Dashboard.

## Important Notes
- PORT=5000 is set as Replit env var to override Replit's default PORT=3001
- `.env` file provides non-secret defaults only; Replit secrets take precedence
- NEVER use `dotenv.config({ override: true })`
- `multer` must NOT be used; only `express-fileupload`
- React client must be rebuilt (`cd client && npx react-scripts build`) after frontend changes
- WhatsApp uses polling (every 5s) because Twilio sandbox webhooks don't reliably forward to Replit proxy URLs
- Twilio credentials: TWILIO_API_KEY + TWILIO_API_SECRET + TWILIO_LIVE_ACCOUNT_SID for API auth
- Approved senders whitelist uses `whatsapp:+1XXXXXXXXXX` format
- Puppeteer needs Chrome — run `npx puppeteer browsers install chrome` if Chrome missing

## Docker Deployment
- `Dockerfile` — Multi-stage build: Stage 1 builds React frontend, Stage 2 creates production Node.js image with Puppeteer/Chromium
- `docker/Dockerfile.nginx` — Multi-stage build: builds React frontend and bundles it into nginx image
- `docker-compose.yml` — Two services: `app` (Node.js API) and `nginx` (reverse proxy + frontend). Nginx depends on app.
- `docker/nginx.conf` — Routes `/` to static React files, `/api/` and `/webhook/` to app container
- Persistent data (data/, uploads/, outputs/, knowledge-base/) mounted as host volumes on the app container
- SSL certs go in `docker/ssl/` (optional, mounted read-only into nginx)
- `.env.example` contains all environment variables; `scripts/setup.sh` creates `.env` interactively
- `scripts/backup.sh` creates a tarball of all persistent data

## Production TODO
- [ ] **Move sessions to SQLite** — Currently sessions are stored in-memory (`server/middleware/auth.js`). They are lost on every server restart. For production, store sessions in the SQLite database so they survive restarts.
- [ ] **Switch WhatsApp from poller to webhook** — On a real server with a static domain, configure the Twilio webhook URL directly and remove the polling mechanism.
- [ ] **Register WhatsApp Business number** (optional) — Only needed if WhatsApp is used to message customers. For internal team use, the sandbox is sufficient.
