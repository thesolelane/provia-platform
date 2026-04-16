# Preferred Builders AI - Troubleshooting & Handoff Guide

**Last Updated:** April 2026

## Quick Start

1. Pull latest from GitHub
2. Copy `.env.example` → `.env` and fill values
3. Run `docker-compose up --build`

## Staff / Field Worker Portal
- Go to **Settings tab**
- View only: Customer Name + Address
- Can upload photos by address only
- No access to financials, Ask the Bot, or reports

## Customer Portal
- Secure links for signing Proposal/Contract
- Upload photos and submit change orders
- Manual signature upload supported

## Common Troubleshooting
- Docker build fails → Run `npm ci --legacy-peer-deps` locally first
- Logo missing in PDFs → Confirm logo-bolinha.png is in client/public/images/
- Real-time not working → Check browser console
- Logs → Check logs/error.log and use `docker-compose logs -f`

For any issues, check logs first.