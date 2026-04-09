# Preferred Builders AI Contract System

## Overview
AI-powered construction estimation, contract generation, and team communication system for Preferred Builders General Services Inc. (HIC-197400).

**License:** MA Home Improvement Contractor HIC-197400  
**Project Supervisor:** Jackson Deaquino — CSL No. CS-121662 (active through 10/22/2028)  
**DB path:** `./data/pb_system.db`

---

## Architecture — Data Flow
1. Jackson submits estimate text (base costs + scope notes) via WhatsApp or email
2. **Claude** reads the estimate and returns **flat structured JSON** — just data, no formatting
3. **System** (`recalculatePricing` in `claudeService.js`) applies markup math to each line item
4. **PDF template** (`pdfService.js`) renders the proposal/contract — all layout logic lives here, never in Claude

Claude's JSON output shape:
```json
{
  "lineItems": [{ "trade": "Foundation", "baseCost": 28000, "scopeIncluded": [...], "scopeExcluded": [...] }],
  "exclusions": [{ "name": "...", "reason": "...", "budget": "..." }],
  "customer": {...}, "project": {...},
  "flaggedItems": [...], "stretchCodeItems": [...]
}
```
System adds: `finalPrice`, `pricing`, `totalValue`, `depositAmount`, `validUntil`

---

## Stack
- **Backend:** Express.js on port 5000
- **Frontend:** React (Create React App), served as static build from `client/build`
- **Database:** SQLite via `better-sqlite3` at `data/pb_system.db`
- **AI:** Anthropic Claude (`claude-sonnet-4-20250514`) via `server/services/claudeService.js`
- **PDF Generation:** Puppeteer via `server/services/pdfService.js`
- **Email:** Mailgun via `server/services/emailService.js`
- **WhatsApp:** Twilio sandbox + poller via `server/services/whatsappService.js` + `whatsappPoller.js`

---

## Key Files

### Server
- `server/index.js` — Main entry point; mounts all routes; signing router mounted before React catch-all
- `server/db/database.js` — SQLite schema + init + seed data (users, whitelist, settings defaults)
- `server/middleware/auth.js` — In-memory session Map; `createSession({ userId, name, email, role })`, `destroySession()`
- `server/routes/auth.js` — `POST /api/login` (email + bcrypt), `POST /api/logout`
- `server/routes/jobs.js` — Job CRUD, `/reprocess`, proposal/contract send + PDF generation; wizard endpoints (`/wizard/extract-text`, `/wizard/questions`, `/wizard/submit`)
- `server/routes/jobPhotos.js` — `POST/GET/DELETE /api/jobs/:id/photos`; files stored in `uploads/jobs/{jobId}/`
- `server/routes/signing.js` — Server-side HTML signing pages at `/sign/p/:token` and `/sign/c/:token`
- `server/routes/tasks.js` — Task CRUD + Google Calendar push; exports `{ router, makeCalendarURL }`
- `server/routes/analytics.js` — Pipeline analytics API (`/api/analytics/pipeline`) and per-job context (`/api/analytics/job/:id/context`); wins = complete/contract_signed jobs, losses = archived with closed_reason
- `server/routes/payments.js` — Payment ledger CRUD for checks received & paid out, per-job summaries
- `server/routes/settings.js` — Settings CRUD; `GET /api/tasks/calendars` for calendar picker
- `server/services/claudeService.js` — Claude extraction + pricing math + `adminChat()` (returns `{ reply, createdTask }`)
- `server/services/contractTemplate.js` — Full MA-compliant contract HTML (7 sections, CSL, change orders)
- `server/services/pdfService.js` — Proposal + contract PDF via Puppeteer
- `server/services/googleCalendar.js` — Google Calendar event creation (Replit connector — rebuild for own server)
- `server/services/emailService.js` — `sendEmail()` via Mailgun
- `server/services/whatsappService.js` — `sendWhatsApp()` via Twilio
- `config/parameters.js` — Company info, pricing defaults, team contact info

### Shared Data
- `shared/departments.json` — Master list of trade departments and sub-departments (with hidden `meaning` descriptions for AI context). Mirrored to `client/src/data/departments.json` for frontend use. Includes: Demo, Framing, Roofing, Siding, Insulation, Drywall, Electrical, Plumbing, HVAC, Flooring, Tile, Cabinets/Countertops, Painting, Permits.

### Client
- `client/src/App.jsx` — React router; persists token + user name/role in localStorage; auto-logout on 401
- `client/src/components/Layout.jsx` — Sidebar nav; shows "Logged in as [Name] (Role)" in footer
- `client/src/pages/Dashboard.jsx` — Job list with status color coding; stats bar; archive/restore with outcome capture modal (Lost–Price/Timing/Competitor, Ghosted, Mistake/Duplicate); guided 4-step wizard
- `client/src/pages/Analytics.jsx` — Pipeline analytics: summary cards (Total Jobs, Pipeline Value, Won Revenue, Win Rate), velocity metrics, avg won margin, pipeline funnel, loss breakdown, monthly revenue
- `client/src/pages/JobDetail.jsx` — Job tabs: Overview, Payments, Proposal, Contract, Signatures, Photos, Assessment (scorecard with margin compliance, $/sqft benchmarks, pipeline context, trade coverage)
- `client/src/pages/Payments.jsx` — Global payment ledger page; filter by job/date; add check in/out
- `client/src/components/PaymentsTab.jsx` — Payments tab within job detail; running totals + quick-add forms
- `client/src/components/PhotosTab.jsx` — Camera capture, upload, photo grid, offline pending badge
- `client/src/utils/offlinePhotoQueue.js` — IndexedDB offline queue + auto-sync + Background Sync API
- `client/src/pages/AdminChat.jsx` — Bot chat; tool-call results show as cards (tasks show calendar link)
- `client/src/pages/Tasks.jsx` — To-do list; date groups (Overdue / Today / Tomorrow); Google Calendar links
- `client/src/pages/Settings.jsx` — Tabs: Markup, Labor Rates, Allowances, Integrations, Bot Behavior, Calendar, Secrets
- `client/src/pages/KnowledgeBase.jsx` — Upload + manage knowledge documents for the bot
- `client/src/pages/Contacts.jsx` — Customer contact list (pseudonymized serial numbers)
- `client/src/pages/Vendors.jsx` — Subs & Vendors directory (searchable, filterable, Add/Edit/Delete modal)
- `client/src/pages/Whitelist.jsx` — Approved WhatsApp/email senders management
- `client/src/pages/FieldGuide.jsx` — Bilingual on-site checklist at `/guide` (no auth required)
- `client/src/pages/Login.jsx` — Email + password login
- `client/public/service-worker.js` — PWA: app shell caching + Background Sync for offline photos
- `client/public/manifest.json` — PWA manifest ("Preferred Builders", standalone, maskable icons)

---

## Database Tables
| Table | Purpose |
|-------|---------|
| `users` | Login accounts (Anthony Cooper + Jackson Deaquino, bcrypt passwords) |
| `jobs` | All jobs (soft-delete/archive; auto-purge after 90 days; closed_reason + closed_note for win/loss tracking) |
| `contacts` | Pseudonymized customer records (PB-XXXX serial numbers) |
| `whitelist` | Approved WhatsApp/email senders |
| `settings` | Runtime config overrides (markup %, labor rates, gcal settings) |
| `knowledge_docs` | Knowledge base documents for bot RAG |
| `tasks` | To-do items with due dates, priority, job links |
| `signing_sessions` | Proposal + contract e-signing tokens, read receipts, signature images |
| `job_photos` | Photo records per job (filename, caption, uploaded_at) |
| `payments_received` | Checks received (amount, date, time, check_number, payment_type, credit_debit, recorded_by, notes, job_id) |
| `payments_made` | Checks paid out (amount, date, time, check_number, category, credit_debit, recorded_by, notes, job_id) |
| `agent_keys` | Marbilism AI agent credentials (SHA-256 key_hash + secret_hash, callback_url, last_seen, request_count) |
| `agent_messages` | Chat thread between admin and each agent (direction: inbound/outbound) |
| `vendors` | Subs & Vendors directory (company_name, type, trade, phone, website, address, city, state, zip, license_number, notes, active) |

---

## Pricing Model
Jackson submits **base costs** (what we pay subs/materials). System applies markup — Claude never does math:
- Combined multiplier: (1 + Sub O&P 15%) × (1 + GC O&P 25%) × (1 + Contingency 10%) ≈ 1.5813×
- `finalPrice = baseCost × multiplier` per line item
- Stretch code items (`isStretchCode: true`) pass through at flat cost — no markup
- Deposit: 33% of contract total
- Valid-until: from estimate date if provided, otherwise 15 days from proposal date

Config source: `config/parameters.js` (defaults) → `settings` table (runtime overrides via Settings page)

---

## Job Status Flow
```
new_lead → estimate_pending → proposal_ready
  → [Send for Signature] → proposal_sent → proposal_approved (customer signs)
  → contract_ready → [Send Contract for Signature] → contract_sent → contract_signed
  → [Mark Complete] → completed
```
Archived jobs can be restored from Dashboard. Auto-purged after 90 days.

---

## Auth System
- **Per-user login:** Email + bcrypt password. Two seeded users:
  - Anthony Cooper — `cooper@preferredbuildersusa.com` — role: `system_admin` (Project Manager + System Admin rights)
  - Jackson Deaquino — `jackson.deaquino@preferredbuildersusa.com` — role: `admin` (Project Manager + Admin rights)
  - Temp password set in `server/db/database.js` seed — **must be changed before production**
- Sessions stored in-memory (lost on restart — move to SQLite for production)
- Auth header: `x-auth-token`
- Signing pages (`/sign/p/:token`, `/sign/c/:token`) are outside auth — public by design

### Permission Levels
| Role | Level | Access |
|------|-------|--------|
| `system_admin` | 4 | Everything: secrets, user management, all settings |
| `admin` | 3 | Jobs, tasks, contacts, settings — no secrets/user management |
| `pm` | 2 | Jobs, tasks, contacts, chat |
| `staff` | 1 | View only (future) |

---

## PWA (Progressive Web App)
- Installable via "Add to Home Screen" on iOS Safari and Android Chrome
- Service worker caches app shell for offline loading
- Photos taken offline queue in IndexedDB, auto-upload when signal returns
- Background Sync API used (with manual "Upload Pending" fallback for older iOS)

---

## Bot (Admin Chat) Tool Calling
`adminChat()` returns `{ reply, createdTask }` — NOT a plain string.  
Available tools: `lookup_contacts`, `lookup_jobs`, `create_task`  
Route must pass `db` to `adminChat()`. History stores only final text replies.

---

## Secrets Tab (Settings → Secrets)
Owner-only tab for managing a fixed allowlist of environment variables (`MANAGED_KEYS` in `server/routes/secrets.js`). Displays values masked by default, grouped by category (AI, Email, WhatsApp, Contacts, System). Updates write to `.env` file and `process.env`. Backend routes: `GET /api/secrets` (read all) and `PUT /api/secrets` (bulk update). Owner role required; changes take effect immediately for `process.env`, persisted to `.env` for restarts.

---

## PDF Auth Fix
The `requireAuth` middleware (`server/middleware/auth.js`) accepts auth via either the `x-auth-token` header or a `?token=` query parameter. This applies to all protected routes, including the PDF file route at `GET /outputs/:filename`. The query param fix resolves "Unauthorized" errors when opening PDFs in a new browser tab (which can't send custom headers). Frontend links append `?token=` to `/outputs/` URLs for direct browser access.

---

## Code Quality (ESLint & Prettier)
- `npm run lint` — ESLint scans `server/` for issues (warnings only, no auto-fix)
- `npm run format` — Prettier auto-formats all `server/**/*.js` files
- Config: `eslint.config.js` (flat config, ESLint v10+) and `.prettierrc`
- Settings: single quotes, 2-space indent, no trailing commas, 100-char line width
- Validation step "server-lint" is registered and runs `npm run lint`

---

## Important Dev Notes
- `PORT=5000` set as Replit env var — do not override
- NEVER use `dotenv.config({ override: true })` — Replit secrets must win
- Use `express-fileupload` only — NOT multer. `useTempFiles: true` → use `file.tempFilePath`
- Rebuild React after any frontend change: `cd client && npm run build`
- WhatsApp uses polling (every 5s) — Twilio webhooks don't work reliably behind Replit proxy
- Signing router mounted at root level BEFORE React catch-all in `index.js`
- Tasks route exports `{ router, makeCalendarURL }` — mount as `require('./routes/tasks').router`
- Chromium path (Replit): `/nix/store/gasnw5878924jbw6bql257ll29hkm4fd-chromium-123.0.6312.105/bin/chromium`
- Port conflict fix: `fuser -k 5000/tcp` then restart workflow

---

## Google Calendar (Replit-specific)
Current integration uses Replit connectors (`REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`).  
**When migrating to own server:** rebuild with standard Google OAuth 2.0 (Client ID + Secret from Google Cloud Console, store refresh token in DB). The calendar picker and auto-push logic stays the same — only the token retrieval changes.

---

## Docker / Migration Files
- `Dockerfile` — Multi-stage: builds React, then production Node.js image with Alpine Chromium
- `docker/Dockerfile.nginx` — Nginx image with bundled React static files
- `docker-compose.yml` — `app` (Node API) + `nginx` (reverse proxy). Volumes for data/, uploads/, outputs/, knowledge-base/
- `docker/nginx.conf` — Routes `/api/` and `/webhook/` to app; serves React from nginx
- `docker/ssl/` — Drop SSL certs here (mounted read-only into nginx)
- `.env.example` — All required environment variables with comments
- `scripts/setup.sh` — Interactive first-run wizard that creates `.env` from template
- `scripts/backup.sh` — Tarballs all persistent data (data/, uploads/, outputs/, knowledge-base/, .env)

---

## Windows Server (Production)
- **Location:** `C:\Users\theso\Desktop\preferred-builders-ai`
- **Local IP:** `192.168.1.210`
- **Public URL:** `https://preferredbuilders.duckdns.org` (Let's Encrypt cert, auto-renews)
- **PM2 processes:** `preferred-builders` (Node app) + `caddy` (HTTPS reverse proxy via `run-caddy.js`)
- **Caddy config:** `Caddyfile` in project root — reverse proxy from HTTPS:443 → localhost:5000
- **DuckDNS:** Auto-updater batch script on Desktop, runs every 5 min via Task Scheduler
- **Office computers on same network:** Add `192.168.1.210 preferredbuilders.duckdns.org` to `/etc/hosts` (Mac) or `C:\Windows\System32\drivers\etc\hosts` (Windows) for HTTPS to work locally (hairpin NAT workaround)

---

## Production TODO (before going live on own server)
- [ ] **Move sessions to SQLite** — In-memory sessions are lost on restart. Store in `sessions` table.
- [ ] **Switch WhatsApp to webhook** — Replace poller with Twilio webhook on static domain.
- [ ] **Rebuild Google Calendar auth** — Replace Replit connector with standard Google OAuth 2.0.
- [ ] **Change passwords** — Both users must reset from the development seed password
- [ ] **Register WhatsApp Business number** — Only if messaging customers directly (sandbox is fine for internal use)
