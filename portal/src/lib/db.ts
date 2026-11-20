import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || "./data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL UNIQUE,
  link_active INTEGER NOT NULL DEFAULT 1,
  services TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'not_started',
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT
);
CREATE TABLE IF NOT EXISTS answers (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  form_key TEXT NOT NULL,
  field_key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (client_id, form_key, field_key)
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  form_key TEXT NOT NULL,
  field_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  login_url TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  password_enc TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  not_applicable INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, platform)
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_client ON files(client_id);
CREATE INDEX IF NOT EXISTS idx_activity_client ON activity(client_id, created_at);

-- Phase 2: locking, change requests, change history
CREATE TABLE IF NOT EXISTS locks (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  form_key TEXT NOT NULL,
  section_key TEXT NOT NULL,
  locked_by TEXT NOT NULL,
  locked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (client_id, form_key, section_key)
);
CREATE TABLE IF NOT EXISTS change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  form_key TEXT NOT NULL,
  section_key TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  admin_note TEXT NOT NULL DEFAULT '',
  resolved_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS answer_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  form_key TEXT NOT NULL,
  field_key TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_history_client ON answer_history(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cr_client ON change_requests(client_id, status);
`;

/** Add columns to existing tables without losing data. */
function migrate(db: Database.Database) {
  const cols = (t: string) => new Set((db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name));
  const clientCols = cols("clients");
  const add = (col: string, def: string) => {
    if (!clientCols.has(col)) db.exec(`ALTER TABLE clients ADD COLUMN ${col} ${def}`);
  };
  add("invited_at", "TEXT"); // first invite email; reminders count from here
  add("reminders_sent", "INTEGER NOT NULL DEFAULT 0");
  add("last_reminder_at", "TEXT");
  add("changes_notified_at", "TEXT"); // last "client changed details" digest
  add("first_submitted_at", "TEXT");
  add("admin_seen_at", "TEXT"); // last time an admin opened this client (for "new activity" badges)

  // users: two-factor login + forced password change for accounts created by someone else
  const userCols = cols("users");
  const addU = (col: string, def: string) => {
    if (!userCols.has(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
  };
  addU("totp_secret_enc", "TEXT"); // encrypted with ENCRYPTION_KEY
  addU("totp_enabled", "INTEGER NOT NULL DEFAULT 0");
  addU("must_change_password", "INTEGER NOT NULL DEFAULT 0");
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_challenges (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS login_failures (
      key TEXT PRIMARY KEY,          -- lowercased email
      count INTEGER NOT NULL,
      first_at TEXT NOT NULL,
      locked_until TEXT
    );
  `); // "changed since submitted" is measured from here
}

declare global {
  var __portalDb: Database.Database | undefined;
}

function open(): Database.Database {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "portal.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Reuse one connection across hot reloads in dev.
export const db: Database.Database = globalThis.__portalDb ?? (globalThis.__portalDb = open());

export function logActivity(clientId: number | null, actor: string, action: string, detail = "") {
  db.prepare("INSERT INTO activity (client_id, actor, action, detail) VALUES (?, ?, ?, ?)").run(
    clientId,
    actor,
    action,
    detail,
  );
}
