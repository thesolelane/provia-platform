# PREFERRED BUILDERS AI SYSTEM
## Complete Setup & Deployment Guide

---

## WHAT THIS SYSTEM DOES

1. Jackson finalizes an estimate in Hearth (or Wave)
2. Bot receives it automatically via webhook
3. Claude AI reads the estimate and generates a Proposal PDF
4. Jackson and the owner review via WhatsApp + email
5. Jackson replies APPROVE (or APROVAR in Portuguese)
6. Bot generates the full Contract with MA legal terms
7. Contract emailed to the team, then sent to the customer

**Two documents are always generated:**
- **Document 1:** Proposal & Scope of Work
- **Document 2:** Contract with Legal Terms (after approval)

---

## QUICK START (Replit)

### Step 1 — Upload this project
- Go to replit.com → Create Repl → Node.js
- Drag and drop this entire project folder

### Step 2 — Set your environment variables
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

### Step 3 — Install and run
```bash
npm install
cd client && npm install && npm run build && cd ..
npm start
```

### Step 4 — Configure webhooks
Set these URLs in your service dashboards:

| Service | Webhook URL |
|---------|------------|
| Hearth  | https://YOUR-URL/webhook/hearth |
| Mailgun (inbound) | https://YOUR-URL/webhook/email |
| Twilio WhatsApp | https://YOUR-URL/webhook/whatsapp |

---

## MOVING TO YOUR OWN SERVER

This is a Docker application — moving it is simple.

### What you need on the new server:
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
sudo apt install docker-compose
```

### Move the system:
```bash
# On old server — backup your data
tar -czf pb-backup.tar.gz ./data ./uploads ./outputs ./knowledge-base .env

# Copy backup to new server
scp pb-backup.tar.gz user@new-server:/home/user/

# On new server
tar -xzf pb-backup.tar.gz
git clone [your repo] pb-system  # or copy all files
cd pb-system
docker-compose up -d
```

**That's it.** Everything works identically on any server with Docker.

### Recommended VPS providers:
| Provider | Monthly Cost | Notes |
|----------|-------------|-------|
| DigitalOcean | $24/mo | Easy UI, good support |
| Linode (Akamai) | $18/mo | Great performance |
| Vultr | $20/mo | Fast setup |

---

## ADMIN PANEL GUIDE

Access at: https://YOUR-URL (login with ADMIN_PASSWORD)

### Dashboard
- See all jobs and their status
- View pipeline value
- Enter estimates manually if needed

### Ask the Bot
- Ask pricing questions, MA code questions, scope guidance
- Jackson can ask in Portuguese — bot replies in Portuguese
- Quick prompt buttons for common questions

### Settings
- **Markup tab:** Adjust OH&P percentages
- **Labor Rates:** Update trade labor rates
- **Allowances:** Update Exhibit A pricing
- **Integrations:** Switch between Hearth and Wave (one click)
- **Bot Behavior:** Turn auto-features on/off

### Knowledge Base
- Upload past invoices/contracts for the bot to learn from
- Add MA code updates, scope templates, pricing references
- Bot reads ALL active documents when generating proposals

### Jackson's Guide
- Mobile-friendly bilingual checklist (EN + PT-BR)
- Bookmark this on Jackson's phone: https://YOUR-URL/guide
- No login required — shareable link

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

## FILE STRUCTURE — YOUR PERSISTENT DATA

These 4 folders are YOUR data. Back them up regularly:

```
data/           ← SQLite database (all jobs, settings, conversations)
uploads/        ← Uploaded past invoices and documents
outputs/        ← Generated proposal and contract PDFs
knowledge-base/ ← Your knowledge documents (editable text files)
```

**Backup command:**
```bash
tar -czf pb-backup-$(date +%Y%m%d).tar.gz data uploads outputs knowledge-base .env
```

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

---

*Preferred Builders General Services Inc. — LIC# HIC-197400*
*37 Duck Mill Road, Fitchburg, MA 01420 — 978-377-1784*
