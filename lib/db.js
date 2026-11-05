import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.RESTART90_DB || path.join(process.cwd(), 'data', 'restart90.db');

export function openDb(file = DB_PATH) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      profile TEXT NOT NULL,          -- JSON: identity, confirmed orders, home, goals
      current_day INTEGER NOT NULL DEFAULT 1,
      baseline_pain INTEGER NOT NULL DEFAULT 3,
      hold_day INTEGER,               -- upgrades on hold for this day (yellow signal)
      hold_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS abilities (
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      ability TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      smaller INTEGER NOT NULL DEFAULT 0,   -- show the smaller version next time
      paused INTEGER NOT NULL DEFAULT 0,    -- paused by rehab team
      PRIMARY KEY (patient_id, ability)
    );

    CREATE TABLE IF NOT EXISTS pending (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      ability TEXT NOT NULL,
      from_level INTEGER NOT NULL,
      to_level INTEGER NOT NULL,
      needs TEXT NOT NULL,            -- 'patient' | 'rehab'
      day INTEGER NOT NULL,
      reason TEXT NOT NULL,           -- JSON {zh,en}
      status TEXT NOT NULL DEFAULT 'open',  -- open | held | approved | declined
      decided_by TEXT,
      decided_day INTEGER,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      ability TEXT NOT NULL,
      from_level INTEGER NOT NULL,
      to_level INTEGER NOT NULL,
      by_role TEXT NOT NULL,          -- patient | family | rehab | system
      reason TEXT NOT NULL            -- JSON {zh,en}
    );

    CREATE TABLE IF NOT EXISTS logs (
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      task_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      ability TEXT,
      level INTEGER,
      status TEXT,                    -- done | partial | cant
      help INTEGER,                   -- family-reported help actually given, 1..4
      note TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (patient_id, day, task_id)
    );

    CREATE TABLE IF NOT EXISTS checkins (
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      pain INTEGER, wound TEXT, fever INTEGER, mood INTEGER, fall INTEGER,
      symptoms TEXT,                  -- JSON array of signal ids ticked by the user
      note TEXT,
      private INTEGER NOT NULL DEFAULT 0,
      parsed TEXT,                    -- JSON: what the parser found in the note
      PRIMARY KEY (patient_id, day)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      signals TEXT NOT NULL,          -- JSON array
      level TEXT NOT NULL,            -- red | emergency
      summary TEXT NOT NULL,          -- JSON {zh,en}
      status TEXT NOT NULL DEFAULT 'open',
      reply TEXT,
      resolved_day INTEGER
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,             -- JSON {zh,en}
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      period TEXT NOT NULL,           -- w1, w2 ... m1, m2, m3
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (patient_id, period, role)
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      levels TEXT NOT NULL,           -- JSON {ability: level}
      PRIMARY KEY (patient_id, day)
    );

    CREATE TABLE IF NOT EXISTS todos (
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      todo_id TEXT NOT NULL,
      text TEXT NOT NULL,             -- JSON {zh,en}
      done INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (patient_id, todo_id)
    );
  `);
  // Migrations for databases created by earlier versions.
  const logCols = db.prepare('PRAGMA table_info(logs)').all().map((c) => c.name);
  if (!logCols.includes('plan_when')) db.exec('ALTER TABLE logs ADD COLUMN plan_when TEXT');
  const pendCols = db.prepare('PRAGMA table_info(pending)').all().map((c) => c.name);
  if (!pendCols.includes('patient_ok')) db.exec('ALTER TABLE pending ADD COLUMN patient_ok INTEGER');   // 1 willing, 0 not yet
  if (!pendCols.includes('family_ok')) db.exec('ALTER TABLE pending ADD COLUMN family_ok INTEGER');     // 1 home allows, 0 not yet
  if (!pendCols.includes('family_note')) db.exec('ALTER TABLE pending ADD COLUMN family_note TEXT');
  const patCols = db.prepare('PRAGMA table_info(patients)').all().map((c) => c.name);
  if (!patCols.includes('sandbox')) db.exec("ALTER TABLE patients ADD COLUMN sandbox TEXT NOT NULL DEFAULT ''"); // one visitor of the public demo
  db.exec(`
    CREATE INDEX IF NOT EXISTS patients_sandbox ON patients(sandbox);
    CREATE TABLE IF NOT EXISTS sandboxes (
      token TEXT PRIMARY KEY,
      last_seen TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const noteCols = db.prepare('PRAGMA table_info(notes)').all().map((c) => c.name);
  if (!noteCols.includes('private')) db.exec('ALTER TABLE notes ADD COLUMN private INTEGER NOT NULL DEFAULT 0'); // only for rehab team
  return db;
}

export const J = (v) => JSON.stringify(v);
export const P = (s, fallback = null) => {
  if (s == null) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
};

export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
