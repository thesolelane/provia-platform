# PREFERRED BUILDERS AI SYSTEM
## Complete Setup & Deployment Guide — v1.5.0

---

## WHAT THIS SYSTEM DOES

A full-stack AI-powered field operations and contract management system for Preferred Builders General Services Inc. Key capabilities:

- **Job & Lead Pipeline** — Intake leads, convert to jobs, track through full lifecycle
- **AI Proposal & Contract Generation** — Claude AI reads estimates and generates Proposal + Contract PDFs
- **Digital Signatures** — Send proposals and contracts for e-signature via secure customer portal
- **Payments Tracking** — Log deposits and payments per job
- **Purchase Orders** — Create and track POs linked to jobs
- **Field Camera** — Field workers upload photos with GPS metadata
- **Staff Portal** — Field worker view (address + photo only, no financials)
- **Contacts CRM** — Standalone contact management
- **Vendor & Sub Directory** — Manage subcontractors and vendors
- **Task System** — Assignable tasks with due dates and priorities
- **Invoice Generation** — PDF invoices from job data
- **Staff Chat** — Real-time internal messaging widget
- **Material Take-Off** — Line-item material calculations
- **Win/Loss Analytics** — Pipeline value, win rates, revenue by month
- **Google Calendar Integration** — Sync tasks and appointments
- **Knowledge Base** — AI reads uploaded documents when generating proposals
- **WhatsApp Commands** — APPROVE / REVISE / STATUS via WhatsApp bot

---

## ENVIRONMENTS

### Development / Windows Machine (PM2)

Run on your Windows machine (192.168.1.210) or local dev server:

```bash
# Install dependencies (first time only)
npm install
cd client && npm install && npm run build && cd ..

# Start with PM2 (keeps running after terminal closes)
pm2 start ecosystem.config.js
pm2 save

# Useful PM2 commands
pm2 status              # See running processes
pm2 logs pb-server      # Tail logs
pm2 restart pb-server   # Restart after code changes
pm2 stop pb-server      # Stop the server
```

Logs on Windows machine: `logs/error.log` and `logs/out.log` in the project root.

Access locally at: `http://192.168.1.210:3000` (or whatever PORT is set in `.env`)

### Production (Docker + PM2 + Caddy)

Production runs via Docker with Caddy as the reverse proxy:

```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f

# Restart after changes
docker-compose restart
```

Logs inside Docker: `docker-compose logs -f pb-server`

Caddy handles HTTPS automatically. No manual cert setup needed.

---

## QUICK START (Replit)

### Step 1 — Set your environment variables
In Replit, go to **Secrets** (lock icon) and add:

```
ANTHROPIC_API_KEY       = your Claude API key
MAILGUN_API_KEY         = your Mailgun API key
MAILGUN_DOMAIN          = mg.preferredbuildersusa.com
BOT_EMAIL               = estimates@preferredbuildersusa.com
TWILIO_ACCOUNT_SID      = your Twilio SID
TWILIO_AUTH_TOKEN       = your Twilio token
TWILIO_WHATSAPP_NUMBER  = whatsapp:+14155238886
HEARTH_API_KEY          = your Hearth API key
HEARTH_WEBHOOK_SECRET   = your Hearth webhook secret
ADMIN_PASSWORD          = choose a strong password
SESSION_SECRET          = any random long string
OWNER_WHATSAPP          = whatsapp:+1XXXXXXXXXX
JACKSON_WHATSAPP        = whatsapp:+1XXXXXXXXXX
OWNER_EMAIL             = owner@preferredbuildersusa.com
APP_URL                 = https://your-replit-url.repl.co
```

### Step 2 — Install and run
```bash
npm install
cd client && npm install && npm run build && cd ..
npm start
```

---

## FILE STRUCTURE — YOUR PERSISTENT DATA

These folders are YOUR data. Back them up regularly:

```
data/           ← SQLite database (all jobs, settings, conversations)
uploads/        ← Uploaded past invoices and documents
outputs/        ← Generated proposal and contract PDFs
knowledge-base/ ← Your knowledge documents (editable text files)
client/public/images/logo-bolinha.png  ← Company logo (used in UI + PDFs)
```

**Backup command:**
```bash
tar -czf pb-backup-$(date +%Y%m%d).tar.gz data uploads outputs knowledge-base .env
```

---

## WHATSAPP COMMANDS

| Command | Portuguese | What it does |
|---------|-----------|-------------|
| APPROVE | APROVAR | Approve proposal, generate contract |
| REVISE | REVISAR | Request revision |
| REVISE: [details] | REVISAR: [detalhes] | Revise with specific changes |
| STATUS | STATUS | See 5 most recent jobs |
| HELP | AJUDA | Show command menu |

---

## INTEGRATION SWITCHING (Hearth → Wave)

When ready to switch:
1. Go to Settings → Integrations tab
2. Click "Switch to Wave"
3. Enter Wave API token
4. Done — all new estimates processed through Wave

Past jobs are never affected. Jackson continues his normal workflow.

**Cost savings:** $1,800/yr (Hearth) → $192/yr (Wave Pro) = **$1,608/yr saved**

---

## SUPPORT CONTACTS

- Anthropic API: https://console.anthropic.com
- Mailgun: https://app.mailgun.com
- Twilio WhatsApp: https://console.twilio.com
- Hearth API: Contact Hearth support for API docs
- Wave API: https://developer.waveapps.com

---

## VERSION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | March 2026 | Initial build — full system |
| 1.2.0 | March 2026 | Leads pipeline, staff chat, field camera, purchase orders |
| 1.3.0 | March 2026 | Contacts CRM, vendor directory, task system, invoices |
| 1.4.0 | April 2026 | Google Calendar, PDF signing, lead documents, customer portal |
| 1.5.0 | April 2026 | logo-bolinha.png wired into UI; PM2 dev section added; docs updated |

---

*Preferred Builders General Services Inc. — LIC# HIC-197400*
*37 Duck Mill Road, Fitchburg, MA 01420 — 978-377-1784*
