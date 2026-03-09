# Preferred Builders AI Contract System

## Overview
AI-powered construction estimation, contract generation, and team communication system for Preferred Builders General Services Inc. (HIC-197400).

## Architecture
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
- `server/middleware/auth.js` — Session-based auth (in-memory Map)
- `server/services/` — Claude AI, WhatsApp, email, PDF, audit services
- `client/src/App.jsx` — React app root with auto-logout on 401
- `client/src/pages/` — Dashboard, JobDetail, Settings, KnowledgeBase, AdminChat, Whitelist, FieldGuide

## Important Notes
- PORT=5000 is set as Replit env var to override Replit's default PORT=3001
- `.env` file provides non-secret defaults only; Replit secrets take precedence
- NEVER use `dotenv.config({ override: true })`
- `multer` must NOT be used; only `express-fileupload`
- React client must be rebuilt (`cd client && npx react-scripts build`) after frontend changes
- WhatsApp uses polling (every 5s) because Twilio sandbox webhooks don't reliably forward to Replit proxy URLs
- Twilio credentials: TWILIO_API_KEY + TWILIO_API_SECRET + TWILIO_LIVE_ACCOUNT_SID for API auth
- Approved senders whitelist uses `whatsapp:+1XXXXXXXXXX` format

## Production TODO
- [ ] **Move sessions to SQLite** — Currently sessions are stored in-memory (`server/middleware/auth.js`). They are lost on every server restart. For production, store sessions in the SQLite database so they survive restarts.
- [ ] **Switch WhatsApp from poller to webhook** — On a real server with a static domain, configure the Twilio webhook URL directly and remove the polling mechanism.
- [ ] **Register WhatsApp Business number** (optional) — Only needed if WhatsApp is used to message customers. For internal team use, the sandbox is sufficient.
