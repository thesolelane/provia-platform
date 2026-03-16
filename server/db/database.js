// server/db/database.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/pb_system.db');

let db;

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

async function initDatabase() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      hearth_estimate_id TEXT,
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      project_address TEXT,
      project_city TEXT,
      project_state TEXT DEFAULT 'MA',
      scope_summary TEXT,
      raw_estimate_data TEXT,
      proposal_data TEXT,
      contract_data TEXT,
      proposal_pdf_path TEXT,
      contract_pdf_path TEXT,
      total_value REAL,
      deposit_amount REAL,
      status TEXT DEFAULT 'received',
      stretch_code_town INTEGER DEFAULT 0,
      flagged_items TEXT,
      submitted_by TEXT,
      notes TEXT,
      archived INTEGER DEFAULT 0,
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      channel TEXT NOT NULL,
      from_address TEXT,
      to_address TEXT,
      message TEXT NOT NULL,
      attachments TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS clarifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT,
      asked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      answered_at DATETIME,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      category TEXT,
      label TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS knowledge_base (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      file_path TEXT,
      language TEXT DEFAULT 'en',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS approved_senders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      name TEXT,
      role TEXT,
      language TEXT DEFAULT 'en',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      performed_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      customer_type TEXT DEFAULT 'residential',
      source TEXT DEFAULT 'manual',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // contact_documents — files permanently attached to a contact
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      file_path TEXT NOT NULL,
      source TEXT DEFAULT 'bulk_import',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    )
  `);

  // Migration: add archived columns if missing
  try {
    db.prepare("SELECT archived FROM jobs LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE jobs ADD COLUMN archived INTEGER DEFAULT 0");
    db.exec("ALTER TABLE jobs ADD COLUMN archived_at DATETIME");
  }

  // Migration: add customer serial number to contacts
  try { db.prepare("SELECT customer_number FROM contacts LIMIT 1").get(); } catch {
    db.exec("ALTER TABLE contacts ADD COLUMN customer_number TEXT");
  }

  // Migration: add contact_id link on jobs
  try { db.prepare("SELECT contact_id FROM jobs LIMIT 1").get(); } catch {
    db.exec("ALTER TABLE jobs ADD COLUMN contact_id INTEGER");
  }

  // Atomic serial counter table for customer numbers
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_serial_counter (
      year    INTEGER PRIMARY KEY,
      next_seq INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Ensure uniqueness at the DB level (add if not already present)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_customer_number ON contacts(customer_number)`);

  // Migration: backfill customer_number on any existing contacts that don't have one
  {
    const untagged = db.prepare("SELECT id FROM contacts WHERE customer_number IS NULL OR customer_number = '' ORDER BY id ASC").all();
    const year = new Date().getFullYear();
    const prefix = `PB-C-${year}-`;
    const lastRow = db.prepare("SELECT customer_number FROM contacts WHERE customer_number LIKE ? ORDER BY customer_number DESC LIMIT 1").get(prefix + '%');
    let seq = lastRow ? parseInt(lastRow.customer_number.slice(prefix.length)) + 1 : 1;
    const setCSN = db.prepare("UPDATE contacts SET customer_number = ? WHERE id = ?");
    for (const row of untagged) {
      setCSN.run(prefix + String(seq).padStart(4, '0'), row.id);
      seq++;
    }
  }

  // Sync counter table: set next_seq to max existing serial + 1 for each year
  {
    const years = db.prepare("SELECT DISTINCT CAST(substr(customer_number, 6, 4) AS INTEGER) AS yr FROM contacts WHERE customer_number IS NOT NULL").all();
    for (const { yr } of years) {
      const pfx = `PB-C-${yr}-`;
      const last = db.prepare("SELECT customer_number FROM contacts WHERE customer_number LIKE ? ORDER BY customer_number DESC LIMIT 1").get(pfx + '%');
      if (last) {
        const maxSeq = parseInt(last.customer_number.slice(pfx.length)) + 1;
        db.prepare('INSERT INTO customer_serial_counter (year, next_seq) VALUES (?, ?) ON CONFLICT(year) DO UPDATE SET next_seq = MAX(next_seq, ?)').run(yr, maxSeq, maxSeq);
      }
    }
  }

  // Tasks / to-do list
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      description TEXT,
      due_at      DATETIME,
      job_id      TEXT,
      contact_id  INTEGER,
      status      TEXT DEFAULT 'pending',
      priority    TEXT DEFAULT 'normal',
      calendar_url TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Signing sessions for proposal & contract e-signatures
  db.exec(`
    CREATE TABLE IF NOT EXISTS signing_sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id      TEXT    NOT NULL,
      doc_type    TEXT    NOT NULL,
      token       TEXT    UNIQUE NOT NULL,
      email_sent_at DATETIME,
      opened_at   DATETIME,
      opened_ip   TEXT,
      signed_at   DATETIME,
      signed_ip   TEXT,
      signature_data TEXT,
      signer_name TEXT,
      status      TEXT DEFAULT 'sent',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Users table for per-user login
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: add profile columns to users
  try { db.prepare("SELECT phone FROM users LIMIT 1").get(); } catch {
    db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
    db.exec("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en'");
    db.exec("ALTER TABLE users ADD COLUMN title TEXT DEFAULT 'Team Member'");
    db.exec("ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1");
  }

  // Migration: update roles to new permission system
  db.prepare("UPDATE users SET role='system_admin', title='Project Manager' WHERE id=1 AND role IN ('owner','system_admin')").run();
  db.prepare("UPDATE users SET role='admin', title='Project Manager' WHERE id=2 AND role IN ('pm','admin')").run();

  db.exec(`
    CREATE TABLE IF NOT EXISTS job_photos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id      TEXT NOT NULL,
      filename    TEXT NOT NULL,
      original_name TEXT,
      caption     TEXT DEFAULT '',
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    )
  `);

  db.prepare(`
    CREATE TABLE IF NOT EXISTS whatsapp_processed (
      message_sid TEXT PRIMARY KEY,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare(`
    DELETE FROM whatsapp_processed WHERE processed_at < datetime('now', '-24 hours')
  `).run();

  seedDefaultSettings();
  seedDefaultSenders();
  seedKnowledgeBase();
  seedUsers();

  return db;
}

function seedDefaultSettings() {
  const defaults = [
    // Markup
    { key: 'markup.subOandP',    value: '0.15',  category: 'markup',     label: 'Sub Overhead & Profit %' },
    { key: 'markup.gcOandP',     value: '0.25',  category: 'markup',     label: 'GC Overhead & Profit %' },
    { key: 'markup.contingency', value: '0.10',  category: 'markup',     label: 'Contingency %' },
    { key: 'markup.deposit',     value: '0.33',  category: 'markup',     label: 'Deposit %' },
    // Labor rates
    { key: 'labor.framing',      value: JSON.stringify({low:12, high:16, unit:'sqft'}),  category:'labor', label:'Framing' },
    { key: 'labor.roofing',      value: JSON.stringify({low:10, high:15, unit:'sqft'}),  category:'labor', label:'Roofing' },
    { key: 'labor.siding',       value: JSON.stringify({low:8,  high:12, unit:'sqft'}),  category:'labor', label:'Siding' },
    { key: 'labor.electrical',   value: JSON.stringify({low:85, high:110,unit:'hour'}),  category:'labor', label:'Electrical' },
    { key: 'labor.plumbing',     value: JSON.stringify({low:90, high:115,unit:'hour'}),  category:'labor', label:'Plumbing' },
    { key: 'labor.hvac',         value: JSON.stringify({low:85, high:105,unit:'hour'}),  category:'labor', label:'HVAC' },
    { key: 'labor.drywall',      value: JSON.stringify({low:3,  high:5,  unit:'sqft'}),  category:'labor', label:'Drywall' },
    { key: 'labor.insulation',   value: JSON.stringify({low:2,  high:4,  unit:'sqft'}),  category:'labor', label:'Insulation' },
    { key: 'labor.tile',         value: JSON.stringify({low:12, high:18, unit:'sqft'}),  category:'labor', label:'Tile' },
    { key: 'labor.flooring',     value: JSON.stringify({low:5,  high:8,  unit:'sqft'}),  category:'labor', label:'Flooring' },
    // Allowances
    { key: 'allowance.lvp',          value: JSON.stringify({amount:6.50, unit:'sqft'}),  category:'allowance', label:'LVP Flooring' },
    { key: 'allowance.hardwood',     value: JSON.stringify({amount:8.00, unit:'sqft'}),  category:'allowance', label:'Engineered Hardwood' },
    { key: 'allowance.carpet',       value: JSON.stringify({amount:3.50, unit:'sqft'}),  category:'allowance', label:'Carpet' },
    { key: 'allowance.tileBath',     value: JSON.stringify({amount:4.50, unit:'sqft'}),  category:'allowance', label:'Bath Floor Tile' },
    { key: 'allowance.tileShower',   value: JSON.stringify({amount:5.50, unit:'sqft'}),  category:'allowance', label:'Shower Tile' },
    { key: 'allowance.cabinets',     value: JSON.stringify({amount:12000,unit:'fixed'}), category:'allowance', label:'Kitchen Cabinets' },
    { key: 'allowance.quartz',       value: JSON.stringify({amount:4250, unit:'fixed'}), category:'allowance', label:'Quartz Countertop' },
    { key: 'allowance.kitFaucet',    value: JSON.stringify({amount:250,  unit:'each'}),  category:'allowance', label:'Kitchen Faucet' },
    { key: 'allowance.kitSink',      value: JSON.stringify({amount:350,  unit:'each'}),  category:'allowance', label:'Kitchen Sink' },
    { key: 'allowance.disposal',     value: JSON.stringify({amount:150,  unit:'each'}),  category:'allowance', label:'Disposal' },
    { key: 'allowance.vanity',       value: JSON.stringify({amount:650,  unit:'each'}),  category:'allowance', label:'Vanity (full)' },
    { key: 'allowance.vanitySmall',  value: JSON.stringify({amount:350,  unit:'each'}),  category:'allowance', label:'Vanity (small)' },
    { key: 'allowance.vanityTop',    value: JSON.stringify({amount:350,  unit:'each'}),  category:'allowance', label:'Vanity Top/Sink' },
    { key: 'allowance.bathFaucet',   value: JSON.stringify({amount:180,  unit:'each'}),  category:'allowance', label:'Bath Faucet' },
    { key: 'allowance.toilet',       value: JSON.stringify({amount:280,  unit:'each'}),  category:'allowance', label:'Toilet' },
    { key: 'allowance.tub',          value: JSON.stringify({amount:850,  unit:'each'}),  category:'allowance', label:'Bathtub' },
    { key: 'allowance.showerValve',  value: JSON.stringify({amount:350,  unit:'each'}),  category:'allowance', label:'Shower Valve' },
    { key: 'allowance.showerDoor',   value: JSON.stringify({amount:250,  unit:'each'}),  category:'allowance', label:'Shower Door' },
    { key: 'allowance.bathAcc',      value: JSON.stringify({amount:150,  unit:'set'}),   category:'allowance', label:'Bath Accessories' },
    { key: 'allowance.exhaustFan',   value: JSON.stringify({amount:85,   unit:'each'}),  category:'allowance', label:'Exhaust Fan' },
    { key: 'allowance.intDoor',      value: JSON.stringify({amount:180,  unit:'each'}),  category:'allowance', label:'Interior Door' },
    { key: 'allowance.passage',      value: JSON.stringify({amount:45,   unit:'each'}),  category:'allowance', label:'Passage Set (Doorknob)' },
    { key: 'allowance.privacy',      value: JSON.stringify({amount:55,   unit:'each'}),  category:'allowance', label:'Privacy Set' },
    { key: 'allowance.bifold',       value: JSON.stringify({amount:175,  unit:'each'}),  category:'allowance', label:'Bifold Door' },
    { key: 'allowance.baseMold',     value: JSON.stringify({amount:1.85, unit:'lf'}),    category:'allowance', label:'Base Molding (per LF)' },
    { key: 'allowance.casing',       value: JSON.stringify({amount:1.65, unit:'lf'}),    category:'allowance', label:'Door/Window Casing (per LF)' },
    { key: 'allowance.windowStool',  value: JSON.stringify({amount:85,   unit:'each'}),  category:'allowance', label:'Window Stool & Apron' },
    // Bot behavior
    { key: 'bot.maxClarifications',  value: '3',     category:'behavior', label:'Max Clarification Rounds' },
    { key: 'bot.autoStretchCode',    value: 'true',  category:'behavior', label:'Auto-detect Stretch Code Town' },
    { key: 'bot.flagVariance',       value: '15',    category:'behavior', label:'Flag Variance % Threshold' },
    { key: 'bot.requireReview',      value: 'true',  category:'behavior', label:'Require Review Before Sending to Customer' },
    { key: 'bot.defaultRatePoint',   value: 'mid',   category:'behavior', label:'Default Rate Point (low/mid/high)' },
    { key: 'bot.proposalFirst',      value: 'true',  category:'behavior', label:'Generate Proposal Before Contract' },
    { key: 'bot.ccOwner',            value: 'true',  category:'behavior', label:'CC Owner on All Emails' },
    // Google Calendar
    { key: 'gcal.calendarId',        value: 'primary', category:'calendar', label:'Google Calendar ID' },
    { key: 'gcal.enabled',           value: 'true',    category:'calendar', label:'Auto-add tasks to Google Calendar' },
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value, category, label) 
    VALUES (@key, @value, @category, @label)
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) insert.run(item);
  });

  insertMany(defaults);
}

function seedDefaultSenders() {
  const senders = [
    { identifier: 'jackson.deaquino@preferredbuildersusa.com', type: 'email',     name: 'Jackson Deaquino', role: 'pm',    language: 'pt-BR' },
    { identifier: 'cooper@preferredbuilders.com',               type: 'email',     name: 'Anthony Cooper',   role: 'owner', language: 'en' },
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO approved_senders (identifier, type, name, role, language)
    VALUES (@identifier, @type, @name, @role, @language)
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) insert.run(item);
  });

  insertMany(senders);
}

function seedKnowledgeBase() {
  const existing = db.prepare('SELECT COUNT(*) as count FROM knowledge_base').get();
  if (existing.count > 0) return;

  const docs = [
    {
      title: 'Massachusetts Stretch Code — Ashby & Surrounding Towns',
      category: 'codes',
      language: 'en',
      content: `
# Massachusetts Stretch Code

Ashby, MA adopted the Stretch Code effective January 1, 2014.

## HERS Requirements (New Construction)
- All-electric homes: HERS 45 maximum
- Mixed fuel homes: HERS 42 maximum  
- Low-carbon materials credit: +3 points
- HERS rater REQUIRED — certified blower door test

## Required Elements for New Residential Construction
1. ERV (Energy Recovery Ventilator) — ventilation requirement
2. EV-ready outlet — 240V circuit in garage
3. Solar-ready conduit — roof to panel
4. HERS rating by certified rater

## Wall Assembly
- Minimum R-20 walls (Climate Zone 5A)
- 2x6 framing effectively required to achieve R-20 with batt
- Alternative: 2x4 + continuous exterior rigid insulation (more expensive)

## Insulation Minimums (Climate Zone 5A)
- Walls: R-20
- Roof/Ceiling: R-49  
- Floor over unconditioned: R-30

## Stretch Code Towns in Service Area
Ashby, Fitchburg, Leominster, Gardner, Westminster, Winchendon,
Athol, Orange, Templeton, Phillipston, Royalston, Petersham,
Barre, Hubbardston, Princeton, Sterling, Bolton, Lancaster,
Harvard, Shirley, Lunenburg, Townsend, Pepperell, Groton, Ayer
      `
    },
    {
      title: 'MA Residential Contract Requirements (780 CMR / HIC Law)',
      category: 'legal',
      language: 'en',
      content: `
# Massachusetts Residential Construction Contract Requirements

## Required Under MA HIC (Home Improvement Contractor) Law

### Mandatory Disclosures
- Contractor name, address, registration number
- HIC License number (Preferred Builders: HIC-197400)
- Start and completion dates
- Description of work
- Total contract price
- Payment schedule
- Three-day right of rescission notice (for contracts signed at consumer's home)

### Payment Terms (Standard MA Residential)
- Deposit: Not to exceed 1/3 of contract price
- Progress payments tied to completion milestones
- Final payment upon substantial completion

### MA Mechanic's Lien Law (Chapter 254)
- Contractor has lien rights on property for unpaid work
- Notice of contract must be filed with registry of deeds for contracts over $5,000
- Subcontractors have independent lien rights

### Warranty Requirements
- Implied warranty of habitability applies to new construction
- Workmanship warranty: minimum 1 year recommended
- Materials warranty: per manufacturer

### Required Clauses
1. Change order procedure — written approval required
2. Dispute resolution — mediation before litigation
3. Substantial completion definition
4. Force majeure
5. Insurance requirements (contractor must carry GL + Workers Comp)
6. Termination rights for both parties
      `
    },
    {
      title: 'Standard Scope Language — Framing',
      category: 'scope-templates',
      language: 'en',
      content: `
# Standard Framing Scope Language

## What to Always Include in Framing Scope
- Exterior wall framing (specify 2x6 for MA Stretch Code towns)
- Interior partitions (list rooms)
- Floor system (specify: TJI, dimensional lumber, or LVL)
- Roof framing (specify: trusses or stick frame, rafter size)
- Structural ridge beam if cathedral ceiling
- Sheathing (specify thickness: 7/16" standard, 5/8" for metal roof)
- Deck framing if applicable
- Fireplace chase if applicable

## Metal Roof Framing Requirements
- 2x12 rafters minimum at 16" O.C.
- Structural ridge beam (LVL or steel) — NOT a ridge board
- 5/8" plywood sheathing (screws hold better than OSB)
- Solid blocking at all eaves
- Ice & water shield full coverage (MA code)

## Cathedral Ceiling Requirements  
- Structural ridge beam required (engineer must spec)
- No collar ties visible — must be designed out
- Closed cell spray foam OR rigid insulation above deck to hit R-49

## Standard Framing Exclusions (Always List)
- Foundation / slab (separate scope)
- Windows and doors (separate line item)
- Insulation (separate scope)
- Any MEP rough-in
      `
    },
    {
      title: 'Preferred Builders — Pricing Reference',
      category: 'pricing',
      language: 'en',
      content: `
# Preferred Builders Pricing Reference

## Markup Structure
- Subcontractor O&P: 25% on all sub costs
- GC O&P: 20% on subtotal after sub markup
- Contingency: 10% recommended buffer
- Deposit: 33% of total contract

## Key Pricing Data Points
- Framing: $12-16/sqft labor (metal roof premium: +$4-5/sqft)
- Metal standing seam roofing: $17-30/sqft installed
- Architectural shingles: $9-15/sqft installed  
- Board & batten siding: $8-12/sqft installed
- Vinyl siding: $5-8/sqft installed
- Electrical full package: $33-45K typical new home
- Plumbing full package: $24-35K typical new home
- Mini splits (3-4 head): $18-25K installed
- Insulation + drywall + plaster: $36-50K typical
- Spray foam closed cell: $6-9/sqft at 7-8"

## Common Exclusions (Never Include Without Discussion)
- Well and septic
- Underground electrical service  
- Perc test and engineering
- Appliances
- Driveway/paving
- Wood stove and chimney
- Garage insulation/drywall (not required for CO)
      `
    }
  ];

  const insert = db.prepare(`
    INSERT INTO knowledge_base (title, category, content, language)
    VALUES (@title, @category, @content, @language)
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) insert.run(item);
  });

  insertMany(docs);
}

function seedUsers() {
  const bcrypt = require('bcryptjs');
  const tempPassword = 'Preferred2024!';
  const hash = bcrypt.hashSync(tempPassword, 10);

  const users = [
    { name: 'Anthony Cooper', email: 'cooper@preferredbuildersusa.com', role: 'system_admin', title: 'Project Manager' },
    { name: 'Jackson Deaquino', email: 'jackson.deaquino@preferredbuildersusa.com', role: 'admin', title: 'Project Manager' },
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (name, email, password_hash, role, title)
    VALUES (@name, @email, @hash, @role, @title)
  `);

  for (const u of users) {
    insert.run({ ...u, hash });
  }
}

module.exports = { getDb, initDatabase };
