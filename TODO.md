# Preferred Builders AI System — To-Do & Roadmap

*Last updated: March 2026*

---

## App Health Snapshot

| Item | Current | Status |
|------|---------|--------|
| Total code | ~19,000 lines | Normal for this feature set |
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

- [ ] **SMS/email follow-up reminders**
  - When a "Reach Out" task is due, auto-send customer a reminder via Twilio/Mailgun
  - Job ID and contact ID are already stored on every Reach Out task — hook is ready
  - Trigger: task `due_at` passes, status still `pending`, priority `high`

- [ ] **Duplicate estimate detection**
  - Flag when two jobs are created for the same address or customer within 30 days
  - Prevents accidental double-quoting

- [ ] **Proportionality sanity check**
  - If one trade line item is more than 40% of the total estimate, flag it
  - Catches typos where someone enters $150,000 instead of $15,000

- [ ] **Backup script**
  - One-click backup of `/data`, `/uploads`, `/outputs`, `/knowledge-base` to a ZIP
  - Currently must be done manually via terminal

- [ ] **RFQ (Request for Quote) generator**
  - From a line item in an estimate, generate a formatted RFQ to send to a sub
  - Auto-fills trade, scope, job address, due date

---

## Features — Need Data to Accumulate First

Build these after you have 15–20 closed jobs with outcomes recorded.

- [ ] **Win/Loss analytics — meaningful patterns**
  - Win rate, loss reason breakdown, and revenue by month are built (Task #17)
  - Becomes useful around 15–20 closed jobs; currently shows sparse data
  - Action: close jobs and mark outcomes (Won / Lost-Price / etc.) consistently

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
| #17 | Win/Loss tracking & pipeline analytics |

---

*Preferred Builders General Services Inc. — LIC# HIC-197400*
