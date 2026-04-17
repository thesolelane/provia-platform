# Preferred Builders AI System — To-Do & Roadmap

*Last updated: April 2026*

---

## App Health Snapshot

| Item | Current | Status |
|------|---------|--------|
| Total code | ~25,000 lines | Normal for this feature set |
| Browser bundle | 123 KB gzipped | Small — no concern |
| Database | 196 KB | Tiny — handles 50,000+ jobs easily |
| Job detail page (JobDetail.jsx) | ~1,450 lines | Getting large — watch this |

---

## Code Maintenance (Do When It Hurts)

These don't change anything the user sees. Do them when bugs become hard to find, not before.

- [ ] **Split JobDetail.jsx into tab components**
  - Each tab (Assessment, Photos, Payments, Signatures, etc.) becomes its own file
  - `AssessmentTab.jsx`, `PhotosTab.jsx`, `PaymentsTab.jsx`, etc.
  - Main file drops from ~1,450 lines to ~300
  - Do this when the file gets to ~2,000 lines or when a bug is hard to locate

---

## Features — Ready to Build Now

These can be built with data already in the system.

- [x] **Duplicate estimate detection** *(done Apr 2026)*
  - Warning toast shown when same address or customer submitted within 30 days
  - Covers all three entry paths: file upload, manual text, and wizard

- [x] **Proportionality sanity check** *(done Apr 2026)*
  - Any line item >40% of total base cost auto-appended to flaggedItems
  - Shows in the existing ⚠️ Flagged review section on the job detail page

- [ ] **RFQ (Request for Quote) generator**
  - From a line item in an estimate, generate a formatted RFQ to send to a sub
  - Auto-fills trade, scope, job address, due date

---

## Features — Need Data to Accumulate First

Build these after you have 15–20 closed jobs with outcomes recorded.

- [ ] **Proposal velocity benchmarks**
  - Average days intake → proposal sent, proposal sent → contract signed
  - Auto-computes now but needs volume to be a reliable target

---

## Features — Needs New Data Infrastructure First

These require tracking data that doesn't exist yet. Revisit in 6–12 months.

- [ ] **Actual cost vs. estimated cost comparison**
  - Requires logging what you actually paid subs and materials per job
  - Until sub invoices are tracked in the system, this is not computable

- [ ] **Winning language analysis**
  - Analyze what proposal language correlates with signed contracts vs. rejections
  - Needs 50+ closed jobs with outcomes before any pattern is statistically meaningful

- [ ] **Claude prompt A/B testing**
  - Track which AI prompt version produced better win rates
  - Git already tracks prompt changes; build this after win/loss data is solid

---

## Infrastructure

- [ ] **Windows server sync strategy**
  - Photos uploaded via the Replit-hosted app do not sync to the Windows machine (192.168.1.210)
  - Decision needed: use Replit as primary (always on, accessible anywhere) OR Windows as primary (local network only)
  - Mixing both causes split data — pick one

- [ ] **Scheduled database backup**
  - Auto-backup `data/pb_system.db` to a cloud location (Google Drive, S3, etc.) nightly
  - Currently only backed up manually

---

## Completed (Reference)

| Task | Description |
|------|-------------|
| #1 | Self-contained local server packaging |
| #3 | PWA desktop install support |
| #4 | Per-user login (Cooper & Jackson) |
| #5 | PWA install + job photo upload with offline queue |
| #8 | Guided quote builder Phase 1 |
| #10 | Guided quote builder Phase 2 (AI questions + smart line items) |
| #11 | Material Take-Off page |
| #12 | Keep-alive self-ping service |
| #13 | Claude estimate consistency & versioning |
| #14 | Fix Revise Estimate workflow |
| #15 | Proposal Assessment tab + pipeline context + Reach Out task trigger |
| #16 | Job audit profit margin breakdown |
| #17 | Win/Loss tracking & pipeline analytics (built; meaningful at 15–20 closed jobs) |
| #18 | Leads pipeline — full CRM pipeline with stages and value tracking |
| #19 | Staff chat — real-time internal messaging widget |
| #20 | Field camera — field worker photo upload with GPS metadata |
| #21 | Purchase Orders — create and track POs linked to jobs |
| #22 | Contacts CRM — standalone contacts separate from jobs/leads |
| #23 | Vendor & subcontractor directory |
| #24 | Task system — assignable tasks with due dates and priorities |
| #25 | Invoice generation — PDF invoices from job data |
| #26 | Property enrichment — auto-fill address details on new jobs |
| #27 | Google Calendar integration — sync tasks and appointments |
| #28 | PDF signing — digital signatures on proposals and contracts |
| #29 | Lead documents — attach files to leads |
| #30 | Backup script — one-click ZIP of all data folders |
| #31 | SMS/email reminders — automated Reach Out reminders via Twilio/Mailgun |
| #54 | Wire logo-bolinha.png into Login and sidebar; update docs to v1.5.0 |

---

*Preferred Builders General Services Inc. — LIC# HIC-197400*
