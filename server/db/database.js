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

    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service TEXT NOT NULL,
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      job_id TEXT,
      context TEXT,
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
    db.prepare('SELECT archived FROM jobs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE jobs ADD COLUMN archived INTEGER DEFAULT 0');
    db.exec('ALTER TABLE jobs ADD COLUMN archived_at DATETIME');
  }

  // Migration: add customer serial number to contacts
  try {
    db.prepare('SELECT customer_number FROM contacts LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE contacts ADD COLUMN customer_number TEXT');
  }

  // Migration: add contact_id link on jobs
  try {
    db.prepare('SELECT contact_id FROM jobs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE jobs ADD COLUMN contact_id INTEGER');
  }

  // Migration: add quote versioning columns to jobs
  try {
    db.prepare('SELECT quote_number FROM jobs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE jobs ADD COLUMN quote_number TEXT');
  }
  try {
    db.prepare('SELECT version FROM jobs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE jobs ADD COLUMN version INTEGER DEFAULT 1');
  }
  try {
    db.prepare('SELECT parent_job_id FROM jobs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE jobs ADD COLUMN parent_job_id TEXT');
  }
  try {
    db.prepare('SELECT estimate_source FROM jobs LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE jobs ADD COLUMN estimate_source TEXT DEFAULT 'ai'");
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_quote_number ON jobs(quote_number)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_parent_job_id ON jobs(parent_job_id)`);

  // Atomic serial counter table for customer numbers
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_serial_counter (
      year    INTEGER PRIMARY KEY,
      next_seq INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Ensure uniqueness at the DB level (add if not already present)
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_customer_number ON contacts(customer_number)`
  );

  // Migration: backfill customer_number on any existing contacts that don't have one
  {
    const untagged = db
      .prepare(
        "SELECT id FROM contacts WHERE customer_number IS NULL OR customer_number = '' ORDER BY id ASC"
      )
      .all();
    const year = new Date().getFullYear();
    const prefix = `PB-C-${year}-`;
    const lastRow = db
      .prepare(
        'SELECT customer_number FROM contacts WHERE customer_number LIKE ? ORDER BY customer_number DESC LIMIT 1'
      )
      .get(prefix + '%');
    let seq = lastRow ? parseInt(lastRow.customer_number.slice(prefix.length)) + 1 : 1;
    const setCSN = db.prepare('UPDATE contacts SET customer_number = ? WHERE id = ?');
    for (const row of untagged) {
      setCSN.run(prefix + String(seq).padStart(4, '0'), row.id);
      seq++;
    }
  }

  // Sync counter table: set next_seq to max existing serial + 1 for each year
  {
    const years = db
      .prepare(
        'SELECT DISTINCT CAST(substr(customer_number, 6, 4) AS INTEGER) AS yr FROM contacts WHERE customer_number IS NOT NULL'
      )
      .all();
    for (const { yr } of years) {
      const pfx = `PB-C-${yr}-`;
      const last = db
        .prepare(
          'SELECT customer_number FROM contacts WHERE customer_number LIKE ? ORDER BY customer_number DESC LIMIT 1'
        )
        .get(pfx + '%');
      if (last) {
        const maxSeq = parseInt(last.customer_number.slice(pfx.length)) + 1;
        db.prepare(
          'INSERT INTO customer_serial_counter (year, next_seq) VALUES (?, ?) ON CONFLICT(year) DO UPDATE SET next_seq = MAX(next_seq, ?)'
        ).run(yr, maxSeq, maxSeq);
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
  try {
    db.prepare('SELECT phone FROM users LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
    db.exec("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en'");
    db.exec("ALTER TABLE users ADD COLUMN title TEXT DEFAULT 'Team Member'");
    db.exec('ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1');
  }

  // Migration: update roles to new permission system
  db.prepare(
    "UPDATE users SET role='system_admin', title='Project Manager' WHERE id=1 AND role IN ('owner','system_admin')"
  ).run();
  db.prepare(
    "UPDATE users SET role='admin', title='Project Manager' WHERE id=2 AND role IN ('pm','admin')"
  ).run();

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

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS whatsapp_processed (
      message_sid TEXT PRIMARY KEY,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `
  ).run();

  db.prepare(
    `
    DELETE FROM whatsapp_processed WHERE processed_at < datetime('now', '-24 hours')
  `
  ).run();

  // Payment tracking tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments_received (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id       TEXT NOT NULL,
      customer_name TEXT,
      check_number TEXT,
      amount       REAL NOT NULL,
      date_received DATE NOT NULL,
      time_received TEXT,
      payment_type TEXT NOT NULL DEFAULT 'deposit',
      credit_debit TEXT NOT NULL DEFAULT 'credit',
      recorded_by  TEXT,
      notes        TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments_made (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id       TEXT NOT NULL,
      payee_name   TEXT NOT NULL,
      check_number TEXT,
      amount       REAL NOT NULL,
      date_paid    DATE NOT NULL,
      time_paid    TEXT,
      category     TEXT NOT NULL DEFAULT 'subcontractor',
      credit_debit TEXT NOT NULL DEFAULT 'debit',
      recorded_by  TEXT,
      notes        TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );
  `);

  // Migration: add pb_number, external_ref, version tracking to jobs
  try {
    db.prepare('SELECT pb_number FROM jobs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE jobs ADD COLUMN pb_number TEXT');
  }
  try {
    db.prepare('SELECT external_ref FROM jobs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE jobs ADD COLUMN external_ref TEXT');
  }
  try {
    db.prepare('SELECT quote_version FROM jobs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE jobs ADD COLUMN quote_version INTEGER DEFAULT 1');
  }
  try {
    db.prepare('SELECT parent_job_id FROM jobs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE jobs ADD COLUMN parent_job_id TEXT');
  }

  // Atomic quote number counter (separate from customer serial counter)
  db.exec(`
    CREATE TABLE IF NOT EXISTS pb_quote_counter (
      year     INTEGER PRIMARY KEY,
      next_seq INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Sequential customer-facing quote number counter (1001, 1002, ...)
  db.exec(`
    CREATE TABLE IF NOT EXISTS quote_auto_counter (
      id       INTEGER PRIMARY KEY DEFAULT 1,
      next_seq INTEGER NOT NULL DEFAULT 1001
    )
  `);
  db.prepare('INSERT OR IGNORE INTO quote_auto_counter (id, next_seq) VALUES (1, 1001)').run();

  // Migration: advance counter past any existing numeric quote numbers already in the DB
  {
    const maxRow = db
      .prepare(
        `SELECT MAX(CAST(quote_number AS INTEGER)) AS mx FROM jobs
       WHERE quote_number IS NOT NULL AND quote_number GLOB '[0-9]*' AND LENGTH(quote_number) <= 6`
      )
      .get();
    if (maxRow?.mx) {
      const needed = maxRow.mx + 1;
      db.prepare(`UPDATE quote_auto_counter SET next_seq = MAX(next_seq, ?) WHERE id = 1`).run(
        needed
      );
    }
  }

  // Migration: add new columns to payments tables if missing (check each individually)
  const addColIfMissing = (table, col, def) => {
    try {
      db.prepare(`SELECT ${col} FROM ${table} LIMIT 1`).get();
    } catch {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    }
  };
  addColIfMissing('signing_sessions', 'decline_reason', 'TEXT');
  addColIfMissing('payments_received', 'time_received', 'TEXT');
  addColIfMissing('payments_received', 'credit_debit', "TEXT NOT NULL DEFAULT 'credit'");
  addColIfMissing('payments_received', 'recorded_by', 'TEXT');
  addColIfMissing('payments_made', 'time_paid', 'TEXT');
  addColIfMissing('payments_made', 'credit_debit', "TEXT NOT NULL DEFAULT 'debit'");
  addColIfMissing('payments_made', 'recorded_by', 'TEXT');
  addColIfMissing('jobs', 'takeoff_data', 'TEXT');
  addColIfMissing('jobs', 'closed_reason', 'TEXT');
  addColIfMissing('jobs', 'closed_note', 'TEXT');
  addColIfMissing('jobs', 'error_message', 'TEXT');

  // Migration: task reminder columns
  addColIfMissing('tasks', 'remind_at', 'DATETIME');
  addColIfMissing('tasks', 'remind_interval_hours', 'INTEGER DEFAULT 168');
  addColIfMissing('tasks', 'lead_id', 'INTEGER');

  // Backfill existing pending/in_progress tasks with remind_at = now + 7 days
  db.prepare(
    `UPDATE tasks SET remind_at = datetime('now', '+168 hours'), remind_interval_hours = 168
     WHERE status NOT IN ('done','cancelled') AND remind_at IS NULL`
  ).run();

  // Email log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id  TEXT,
      to_address  TEXT NOT NULL,
      subject     TEXT,
      email_type  TEXT DEFAULT 'general',
      job_id      TEXT,
      sent_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      opened_at   DATETIME,
      opened_count INTEGER DEFAULT 0
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_email_log_sent_at ON email_log(sent_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_email_log_job_id  ON email_log(job_id)`);

  // Migration: add html_body column for email preview (auto-wiped on contract signing)
  try {
    db.exec(`ALTER TABLE email_log ADD COLUMN html_body TEXT`);
  } catch {
    /* ignore */
  }

  // Field photos — standalone camera inbox with GPS grouping
  db.exec(`
    CREATE TABLE IF NOT EXISTS field_photos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      filename       TEXT NOT NULL,
      original_name  TEXT,
      taken_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      lat            REAL,
      lon            REAL,
      location_label TEXT,
      accuracy       REAL,
      job_id         TEXT,
      uploaded_by    TEXT,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_field_photos_job_id ON field_photos(job_id)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_field_photos_location_label ON field_photos(location_label)`
  );

  // ── Customer Activity Log ────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_activity_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_number TEXT,
      job_id        TEXT,
      event_type    TEXT NOT NULL,
      description   TEXT NOT NULL,
      document_ref  TEXT,
      recorded_by   TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_cal_customer_number ON customer_activity_log(customer_number)`
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cal_job_id ON customer_activity_log(job_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cal_created_at ON customer_activity_log(created_at)`);

  // ── Invoices ─────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id          TEXT NOT NULL,
      invoice_number  TEXT NOT NULL,
      invoice_type    TEXT NOT NULL DEFAULT 'contract_invoice',
      status          TEXT NOT NULL DEFAULT 'draft',
      amount          REAL NOT NULL DEFAULT 0,
      amount_paid     REAL NOT NULL DEFAULT 0,
      line_items      TEXT,
      notes           TEXT,
      pdf_path        TEXT,
      issued_at       DATETIME,
      paid_at         DATETIME,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    )
  `);
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number)`
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON invoices(job_id)`);

  // ── Invoice sequence counters per job ────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_counters (
      job_id           TEXT PRIMARY KEY,
      contract_seq     INTEGER NOT NULL DEFAULT 0,
      pass_through_seq INTEGER NOT NULL DEFAULT 0,
      co_seq           INTEGER NOT NULL DEFAULT 0,
      dept_seq         INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    )
  `);
  // Migration: add co_seq column if missing (separates change-order seq from dept_seq)
  addColIfMissing('invoice_counters', 'co_seq', 'INTEGER NOT NULL DEFAULT 0');

  // ── Migration: add payment_class and dept_code to payments_made ──────────────
  addColIfMissing('payments_made', 'payment_class', "TEXT NOT NULL DEFAULT 'cost_of_revenue'");
  addColIfMissing('payments_made', 'dept_code', 'TEXT');
  addColIfMissing('payments_made', 'is_pass_through', 'INTEGER NOT NULL DEFAULT 0');
  addColIfMissing('payments_made', 'line_item_ref', 'TEXT');
  // 'pb' = PB fronted the cost (default); 'customer_direct' = customer wrote check directly to vendor/municipality
  addColIfMissing('payments_made', 'paid_by', "TEXT NOT NULL DEFAULT 'pb'");

  // ── Migration: add payment_class and invoice link to payments_received ────────
  addColIfMissing('payments_received', 'payment_class', "TEXT NOT NULL DEFAULT 'contract'");
  addColIfMissing(
    'payments_received',
    'is_pass_through_reimbursement',
    'INTEGER NOT NULL DEFAULT 0'
  );
  addColIfMissing('payments_received', 'invoice_id', 'INTEGER');
  addColIfMissing('payments_received', 'line_item_ref', 'TEXT');

  // ── Field photos — lead link ──────────────────────────────────────────────────
  addColIfMissing('field_photos', 'lead_id', 'INTEGER');

  // ── Vendors / Subs directory ─────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name   TEXT NOT NULL,
      type           TEXT NOT NULL DEFAULT 'subcontractor',
      trade          TEXT,
      phone          TEXT,
      website        TEXT,
      address        TEXT,
      city           TEXT,
      state          TEXT,
      zip            TEXT,
      license_number TEXT,
      notes          TEXT,
      active         INTEGER NOT NULL DEFAULT 1,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vendors_type   ON vendors(type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors(active)`);

  // ── Migration: add pb_customer_number to contacts (new format: PB-C-XXXX) ────
  // The existing customer_number column uses PB-C-YEAR-NNNN format.
  // We add pb_customer_number as a simpler sequential PB-C-XXXX identifier.
  try {
    db.prepare('SELECT pb_customer_number FROM contacts LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE contacts ADD COLUMN pb_customer_number TEXT');
  }

  // Backfill pb_customer_number for contacts missing it
  {
    const untagged = db
      .prepare(
        "SELECT id FROM contacts WHERE pb_customer_number IS NULL OR pb_customer_number = '' ORDER BY id ASC"
      )
      .all();
    const lastRow = db
      .prepare(
        "SELECT pb_customer_number FROM contacts WHERE pb_customer_number LIKE 'PB-C-%' AND LENGTH(pb_customer_number) <= 10 ORDER BY LENGTH(pb_customer_number) DESC, pb_customer_number DESC LIMIT 1"
      )
      .get();
    let seq = 1;
    if (lastRow?.pb_customer_number) {
      const parts = lastRow.pb_customer_number.split('-');
      const lastSeq = parseInt(parts[parts.length - 1]);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    const setPN = db.prepare('UPDATE contacts SET pb_customer_number = ? WHERE id = ?');
    for (const row of untagged) {
      setPN.run('PB-C-' + String(seq).padStart(4, '0'), row.id);
      seq++;
    }
  }
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_pb_customer_number ON contacts(pb_customer_number)`
  );

  // ── pb_customer_counter: simple sequential counter for new contacts ───────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS pb_customer_counter (
      id       INTEGER PRIMARY KEY DEFAULT 1,
      next_seq INTEGER NOT NULL DEFAULT 1
    )
  `);
  db.prepare('INSERT OR IGNORE INTO pb_customer_counter (id, next_seq) VALUES (1, 1)').run();
  {
    const lastPN = db
      .prepare(
        "SELECT pb_customer_number FROM contacts WHERE pb_customer_number LIKE 'PB-C-%' AND LENGTH(pb_customer_number) <= 10 ORDER BY LENGTH(pb_customer_number) DESC, pb_customer_number DESC LIMIT 1"
      )
      .get();
    if (lastPN?.pb_customer_number) {
      const parts = lastPN.pb_customer_number.split('-');
      const lastSeq = parseInt(parts[parts.length - 1]);
      if (!isNaN(lastSeq)) {
        db.prepare('UPDATE pb_customer_counter SET next_seq = MAX(next_seq, ?) WHERE id = 1').run(
          lastSeq + 1
        );
      }
    }
  }

  // ── Migration: invoice line-item split columns ────────────────────────────
  try {
    db.prepare('SELECT contract_amount FROM invoices LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE invoices ADD COLUMN contract_amount REAL NOT NULL DEFAULT 0');
  }
  try {
    db.prepare('SELECT pass_through_amount FROM invoices LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE invoices ADD COLUMN pass_through_amount REAL NOT NULL DEFAULT 0');
  }
  // ── Migration: pb_due_amount — what is actually owed to PB after pay-direct items ──
  try {
    db.prepare('SELECT pb_due_amount FROM invoices LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE invoices ADD COLUMN pb_due_amount REAL NOT NULL DEFAULT 0');
  }
  // ── Migration: full_contract_value — informational total shown at top of Invoice 1 ──
  try {
    db.prepare('SELECT full_contract_value FROM invoices LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE invoices ADD COLUMN full_contract_value REAL NOT NULL DEFAULT 0');
  }

  // ── Agent keys + agent messages tables ──────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_keys (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      key_hash      TEXT NOT NULL UNIQUE,
      secret_hash   TEXT NOT NULL,
      callback_url  TEXT,
      last_seen     DATETIME,
      request_count INTEGER NOT NULL DEFAULT 0,
      key_displayed INTEGER NOT NULL DEFAULT 0,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id   INTEGER NOT NULL,
      direction  TEXT NOT NULL,
      message    TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agent_keys(id)
    );
  `);

  seedAgentKeys(db);

  // ── Leads table ──────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      caller_name  TEXT NOT NULL DEFAULT 'Unknown caller',
      caller_phone TEXT NOT NULL DEFAULT 'Unknown number',
      source       TEXT NOT NULL DEFAULT 'marblism',
      stage        TEXT NOT NULL DEFAULT 'incoming',
      notes        TEXT,
      contact_id   INTEGER,
      archived     INTEGER NOT NULL DEFAULT 0,
      archive_reason TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_stage     ON leads(stage)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_archived  ON leads(archived)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_contact_id ON leads(contact_id)`);

  // ── Leads pipeline extra fields (must come AFTER CREATE TABLE leads) ──────────
  addColIfMissing('leads', 'appointment_at', 'DATETIME');
  addColIfMissing('leads', 'job_address', 'TEXT');
  addColIfMissing('leads', 'job_city', 'TEXT');
  addColIfMissing('leads', 'job_email', 'TEXT');
  addColIfMissing('leads', 'job_scope', 'TEXT');
  addColIfMissing('leads', 'job_type', 'TEXT');
  addColIfMissing('leads', 'pb_customer_number', 'TEXT');
  addColIfMissing('leads', 'job_id', 'TEXT');

  // ── Purchase Orders table ─────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number    TEXT NOT NULL UNIQUE,
      job_id       TEXT NOT NULL,
      contact_id   INTEGER,
      vendor_id    INTEGER,
      vendor_name  TEXT,
      description  TEXT NOT NULL,
      category     TEXT NOT NULL DEFAULT 'materials',
      amount       REAL NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'draft',
      issued_at    DATETIME,
      received_at  DATETIME,
      closed_at    DATETIME,
      created_by   TEXT,
      notes        TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_po_job_id     ON purchase_orders(job_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_po_status     ON purchase_orders(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_po_category   ON purchase_orders(category)`);

  // ── PO counter table (per-year sequential number, format PO-YYYY-NNNN) ────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS po_counter (
      year     INTEGER NOT NULL,
      next_seq INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (year)
    )
  `);

  // ── Purchase Orders migrations (safe addColIfMissing for existing DBs) ───────
  addColIfMissing('purchase_orders', 'contact_id',  'INTEGER');
  addColIfMissing('purchase_orders', 'issued_at',   'DATETIME');
  addColIfMissing('purchase_orders', 'received_at', 'DATETIME');
  addColIfMissing('purchase_orders', 'closed_at',   'DATETIME');
  addColIfMissing('purchase_orders', 'created_by',  'TEXT');
  // Index on contact_id must come AFTER addColIfMissing for existing databases
  db.exec(`CREATE INDEX IF NOT EXISTS idx_po_contact_id ON purchase_orders(contact_id)`);

  // ── Migration: job metadata JSON blob (trade selection, etc.) ────────────────
  try {
    db.prepare('SELECT metadata FROM jobs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE jobs ADD COLUMN metadata TEXT');
  }

  // ── Migration: property_data JSON blob (MassGIS + lead check results) ─────────
  addColIfMissing('jobs', 'property_data', 'TEXT');
  addColIfMissing('leads', 'property_data', 'TEXT');

  seedDefaultSettings();
  seedDefaultSenders();
  seedKnowledgeBase();
  seedUsers();

  return db;
}

function seedDefaultSettings() {
  const defaults = [
    // Markup
    { key: 'markup.subOandP', value: '0.15', category: 'markup', label: 'Sub Overhead & Profit %' },
    { key: 'markup.gcOandP', value: '0.25', category: 'markup', label: 'GC Overhead & Profit %' },
    { key: 'markup.contingency', value: '0.10', category: 'markup', label: 'Contingency %' },
    { key: 'markup.deposit', value: '0.33', category: 'markup', label: 'Deposit %' },
    // Labor rates
    {
      key: 'labor.framing',
      value: JSON.stringify({ low: 12, high: 16, unit: 'sqft' }),
      category: 'labor',
      label: 'Framing'
    },
    {
      key: 'labor.roofing',
      value: JSON.stringify({ low: 10, high: 15, unit: 'sqft' }),
      category: 'labor',
      label: 'Roofing'
    },
    {
      key: 'labor.siding',
      value: JSON.stringify({ low: 8, high: 12, unit: 'sqft' }),
      category: 'labor',
      label: 'Siding'
    },
    {
      key: 'labor.electrical',
      value: JSON.stringify({ low: 85, high: 110, unit: 'hour' }),
      category: 'labor',
      label: 'Electrical'
    },
    {
      key: 'labor.plumbing',
      value: JSON.stringify({ low: 90, high: 115, unit: 'hour' }),
      category: 'labor',
      label: 'Plumbing'
    },
    {
      key: 'labor.hvac',
      value: JSON.stringify({ low: 85, high: 105, unit: 'hour' }),
      category: 'labor',
      label: 'HVAC'
    },
    {
      key: 'labor.drywall',
      value: JSON.stringify({ low: 3, high: 5, unit: 'sqft' }),
      category: 'labor',
      label: 'Drywall'
    },
    {
      key: 'labor.insulation',
      value: JSON.stringify({ low: 2, high: 4, unit: 'sqft' }),
      category: 'labor',
      label: 'Insulation'
    },
    {
      key: 'labor.tile',
      value: JSON.stringify({ low: 12, high: 18, unit: 'sqft' }),
      category: 'labor',
      label: 'Tile'
    },
    {
      key: 'labor.flooring',
      value: JSON.stringify({ low: 5, high: 8, unit: 'sqft' }),
      category: 'labor',
      label: 'Flooring'
    },
    // Allowances
    {
      key: 'allowance.lvp',
      value: JSON.stringify({ amount: 6.5, unit: 'sqft' }),
      category: 'allowance',
      label: 'LVP Flooring'
    },
    {
      key: 'allowance.hardwood',
      value: JSON.stringify({ amount: 8.0, unit: 'sqft' }),
      category: 'allowance',
      label: 'Engineered Hardwood'
    },
    {
      key: 'allowance.carpet',
      value: JSON.stringify({ amount: 3.5, unit: 'sqft' }),
      category: 'allowance',
      label: 'Carpet'
    },
    {
      key: 'allowance.tileBath',
      value: JSON.stringify({ amount: 4.5, unit: 'sqft' }),
      category: 'allowance',
      label: 'Bath Floor Tile'
    },
    {
      key: 'allowance.tileShower',
      value: JSON.stringify({ amount: 5.5, unit: 'sqft' }),
      category: 'allowance',
      label: 'Shower Tile'
    },
    {
      key: 'allowance.cabinets',
      value: JSON.stringify({ amount: 12000, unit: 'fixed' }),
      category: 'allowance',
      label: 'Kitchen Cabinets'
    },
    {
      key: 'allowance.quartz',
      value: JSON.stringify({ amount: 4250, unit: 'fixed' }),
      category: 'allowance',
      label: 'Quartz Countertop'
    },
    {
      key: 'allowance.kitFaucet',
      value: JSON.stringify({ amount: 250, unit: 'each' }),
      category: 'allowance',
      label: 'Kitchen Faucet'
    },
    {
      key: 'allowance.kitSink',
      value: JSON.stringify({ amount: 350, unit: 'each' }),
      category: 'allowance',
      label: 'Kitchen Sink'
    },
    {
      key: 'allowance.disposal',
      value: JSON.stringify({ amount: 150, unit: 'each' }),
      category: 'allowance',
      label: 'Disposal'
    },
    {
      key: 'allowance.vanity',
      value: JSON.stringify({ amount: 650, unit: 'each' }),
      category: 'allowance',
      label: 'Vanity (full)'
    },
    {
      key: 'allowance.vanitySmall',
      value: JSON.stringify({ amount: 350, unit: 'each' }),
      category: 'allowance',
      label: 'Vanity (small)'
    },
    {
      key: 'allowance.vanityTop',
      value: JSON.stringify({ amount: 350, unit: 'each' }),
      category: 'allowance',
      label: 'Vanity Top/Sink'
    },
    {
      key: 'allowance.bathFaucet',
      value: JSON.stringify({ amount: 180, unit: 'each' }),
      category: 'allowance',
      label: 'Bath Faucet'
    },
    {
      key: 'allowance.toilet',
      value: JSON.stringify({ amount: 280, unit: 'each' }),
      category: 'allowance',
      label: 'Toilet'
    },
    {
      key: 'allowance.tub',
      value: JSON.stringify({ amount: 850, unit: 'each' }),
      category: 'allowance',
      label: 'Bathtub'
    },
    {
      key: 'allowance.showerValve',
      value: JSON.stringify({ amount: 350, unit: 'each' }),
      category: 'allowance',
      label: 'Shower Valve'
    },
    {
      key: 'allowance.showerDoor',
      value: JSON.stringify({ amount: 250, unit: 'each' }),
      category: 'allowance',
      label: 'Shower Door'
    },
    {
      key: 'allowance.bathAcc',
      value: JSON.stringify({ amount: 150, unit: 'set' }),
      category: 'allowance',
      label: 'Bath Accessories'
    },
    {
      key: 'allowance.exhaustFan',
      value: JSON.stringify({ amount: 85, unit: 'each' }),
      category: 'allowance',
      label: 'Exhaust Fan'
    },
    {
      key: 'allowance.intDoor',
      value: JSON.stringify({ amount: 180, unit: 'each' }),
      category: 'allowance',
      label: 'Interior Door'
    },
    {
      key: 'allowance.passage',
      value: JSON.stringify({ amount: 45, unit: 'each' }),
      category: 'allowance',
      label: 'Passage Set (Doorknob)'
    },
    {
      key: 'allowance.privacy',
      value: JSON.stringify({ amount: 55, unit: 'each' }),
      category: 'allowance',
      label: 'Privacy Set'
    },
    {
      key: 'allowance.bifold',
      value: JSON.stringify({ amount: 175, unit: 'each' }),
      category: 'allowance',
      label: 'Bifold Door'
    },
    {
      key: 'allowance.baseMold',
      value: JSON.stringify({ amount: 1.85, unit: 'lf' }),
      category: 'allowance',
      label: 'Base Molding (per LF)'
    },
    {
      key: 'allowance.casing',
      value: JSON.stringify({ amount: 1.65, unit: 'lf' }),
      category: 'allowance',
      label: 'Door/Window Casing (per LF)'
    },
    {
      key: 'allowance.windowStool',
      value: JSON.stringify({ amount: 85, unit: 'each' }),
      category: 'allowance',
      label: 'Window Stool & Apron'
    },
    // Pricing targets
    {
      key: 'pricing.sqftLow',
      value: '320',
      category: 'pricing',
      label: 'Target Price Low ($/sqft)'
    },
    {
      key: 'pricing.sqftHigh',
      value: '350',
      category: 'pricing',
      label: 'Target Price High ($/sqft)'
    },
    {
      key: 'pricing.sqftRenoLow',
      value: '100',
      category: 'pricing',
      label: 'Renovation Target Price Low ($/sqft)'
    },
    {
      key: 'pricing.sqftRenoHigh',
      value: '150',
      category: 'pricing',
      label: 'Renovation Target Price High ($/sqft)'
    },
    // Bot behavior
    {
      key: 'bot.maxClarifications',
      value: '3',
      category: 'behavior',
      label: 'Max Clarification Rounds'
    },
    {
      key: 'bot.autoStretchCode',
      value: 'true',
      category: 'behavior',
      label: 'Auto-detect Stretch Code Town'
    },
    {
      key: 'bot.flagVariance',
      value: '15',
      category: 'behavior',
      label: 'Flag Variance % Threshold'
    },
    {
      key: 'bot.requireReview',
      value: 'true',
      category: 'behavior',
      label: 'Require Review Before Sending to Customer'
    },
    {
      key: 'bot.defaultRatePoint',
      value: 'mid',
      category: 'behavior',
      label: 'Default Rate Point (low/mid/high)'
    },
    {
      key: 'bot.proposalFirst',
      value: 'true',
      category: 'behavior',
      label: 'Generate Proposal Before Contract'
    },
    { key: 'bot.ccOwner', value: 'true', category: 'behavior', label: 'CC Owner on All Emails' },
    // Google Calendar
    { key: 'gcal.calendarId', value: 'primary', category: 'calendar', label: 'Google Calendar ID' },
    {
      key: 'gcal.enabled',
      value: 'true',
      category: 'calendar',
      label: 'Auto-add tasks to Google Calendar'
    },
    // Status report schedule
    {
      key: 'status.reportIntervalHours',
      value: '24',
      category: 'status',
      label: 'Status Report Interval (hours)'
    },
    {
      key: 'status.reportHourOfDay',
      value: '-1',
      category: 'status',
      label: 'Status Report Hour of Day (-1 = use interval only)'
    },
    // Backup schedule
    {
      key: 'backup.intervalHours',
      value: '24',
      category: 'backup',
      label: 'Backup Interval (hours)'
    },
    { key: 'backup.lastRanAt', value: '', category: 'backup', label: 'Last Backup Timestamp' },
    { key: 'backup.lastFile', value: '', category: 'backup', label: 'Last Backup Filename' },
    {
      key: 'backup.customPath',
      value: '',
      category: 'backup',
      label: 'Custom Backup Folder Path (leave blank for default)'
    }
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
    {
      identifier: 'jackson.deaquino@preferredbuildersusa.com',
      type: 'email',
      name: 'Jackson Deaquino',
      role: 'pm',
      language: 'pt-BR'
    },
    {
      identifier: 'cooper@preferredbuilders.com',
      type: 'email',
      name: 'Anthony Cooper',
      role: 'owner',
      language: 'en'
    }
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

function seedAgentKeys(db) {
  const crypto = require('crypto');
  const agents = [{ name: 'Marbilism Agent 1' }, { name: 'Marbilism Agent 2' }];
  for (const agent of agents) {
    const existing = db.prepare('SELECT id FROM agent_keys WHERE name = ?').get(agent.name);
    if (!existing) {
      const rawKey = crypto.randomBytes(32).toString('hex');
      const rawSecret = crypto.randomBytes(32).toString('hex');
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const secretHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
      db.prepare(
        'INSERT INTO agent_keys (name, key_hash, secret_hash, key_displayed) VALUES (?, ?, ?, 0)'
      ).run(agent.name, keyHash, secretHash);
      const row = db.prepare('SELECT id FROM agent_keys WHERE name = ?').get(agent.name);
      console.log(`\n${'='.repeat(60)}`);
      console.log(`MARBILISM AGENT CREDENTIALS — ${agent.name.toUpperCase()} (id=${row.id})`);
      console.log(`  API Key    : ${rawKey}`);
      console.log(`  API Secret : ${rawSecret}`);
      console.log(`  (Stored as SHA-256 hashes only — this is the ONLY time they appear)`);
      console.log(`${'='.repeat(60)}\n`);
      db.prepare('UPDATE agent_keys SET key_displayed = 1 WHERE id = ?').run(row.id);
    } else {
      const row = db
        .prepare('SELECT id, key_displayed FROM agent_keys WHERE name = ?')
        .get(agent.name);
      if (row && row.key_displayed === 0) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`MARBILISM AGENT — ${agent.name.toUpperCase()} (id=${row.id})`);
        console.log(`  Key/secret already stored; plaintext no longer available.`);
        console.log(`${'='.repeat(60)}\n`);
        db.prepare('UPDATE agent_keys SET key_displayed = 1 WHERE id = ?').run(row.id);
      }
    }
  }
}

function seedUsers() {
  const bcrypt = require('bcryptjs');
  const tempPassword = 'Preferred2024!';
  const hash = bcrypt.hashSync(tempPassword, 10);

  const users = [
    {
      name: 'Anthony Cooper',
      email: 'cooper@preferredbuildersusa.com',
      role: 'system_admin',
      title: 'Project Manager'
    },
    {
      name: 'Jackson Deaquino',
      email: 'jackson.deaquino@preferredbuildersusa.com',
      role: 'admin',
      title: 'Project Manager'
    }
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
