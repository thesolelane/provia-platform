# Preferred Builders AI - Troubleshooting & Handoff Guide

**Last Updated:** April 2026 — v1.5.0

---

## Environments at a Glance

| Environment | Where | How it runs | Logs |
|-------------|-------|-------------|------|
| Development | Windows machine (192.168.1.210) or Replit | PM2 (`pm2 start ecosystem.config.js`) | `logs/error.log`, `logs/out.log` in project root |
| Production | VPS / cloud server | Docker + PM2 + Caddy | `docker-compose logs -f` |

---

## Quick Start — Dev (Windows / PM2)

```bash
npm install
cd client && npm install && npm run build && cd ..
pm2 start ecosystem.config.js
pm2 save
```

Check status: `pm2 status`
Tail logs: `pm2 logs pb-server`
Restart after code change: `pm2 restart pb-server`

## Quick Start — Production (Docker)

```bash
git pull
docker-compose up -d --build
```

Logs: `docker-compose logs -f`

---

## Log File Paths

| Environment | Log location |
|-------------|-------------|
| Dev (PM2) | `logs/error.log` and `logs/out.log` in the project root |
| Production (Docker) | `docker-compose logs -f pb-server` (logs stay inside the container) |

> On Replit: check the **Console** tab in the workflow panel for live output.

---

## Common Issues

| Problem | Fix |
|---------|-----|
| Docker build fails | Run `npm ci --legacy-peer-deps` locally first to catch dep issues |
| Logo missing in UI or PDFs | Confirm `logo-bolinha.png` is in `client/public/images/` |
| Real-time notifications not working | Check browser console for WebSocket errors |
| PM2 process not found | Run `pm2 list` to confirm process name, then `pm2 restart pb-server` |
| Port already in use | `pm2 delete pb-server` then start again |
| Database locked | Stop all server instances before running migrations |
| PDF generation fails | Check `ANTHROPIC_API_KEY` is set and valid |
| Login fails after password reset | Clear browser cookies/session storage and retry |

---

## Staff / Field Worker Portal

- Go to **Settings tab**
- View only: Customer Name + Address
- Can upload photos by address only
- No access to financials, Ask the Bot, or reports

## Customer Portal

- Secure token-gated links for signing Proposal/Contract
- Upload photos and submit change orders
- Manual (scanned) signature upload supported via **POST /api/manual-signature/:jobId**

---

## Logo

- File: `client/public/images/logo-bolinha.png`
- Used in: Login page, sidebar header, and generated PDFs
- If updating the logo, replace this file — no code changes needed

---

## Data Folders (Back These Up)

```
data/           ← SQLite database
uploads/        ← Uploaded documents
outputs/        ← Generated PDFs
knowledge-base/ ← AI knowledge documents
```

Backup command:
```bash
tar -czf pb-backup-$(date +%Y%m%d).tar.gz data uploads outputs knowledge-base .env
```

---

*Preferred Builders General Services Inc. — LIC# HIC-197400*
