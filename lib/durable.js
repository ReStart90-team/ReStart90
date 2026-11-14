import crypto from 'node:crypto';
import fs from 'node:fs';
import { openDb } from './db.js';

// The only SQL identifiers used for SQLite snapshots. Keep these in sync with
// openDb's additive schema; never accept identifiers from a client or snapshot.
const COLUMNS = Object.freeze({
  patients: ['id', 'profile', 'current_day', 'baseline_pain', 'hold_day', 'hold_reason', 'created_at', 'sandbox'],
  abilities: ['patient_id', 'ability', 'level', 'smaller', 'paused'],
  pending: ['id', 'patient_id', 'ability', 'from_level', 'to_level', 'needs', 'day', 'reason', 'status', 'decided_by', 'decided_day', 'note', 'patient_ok', 'family_ok', 'family_note'],
  history: ['id', 'patient_id', 'day', 'ability', 'from_level', 'to_level', 'by_role', 'reason'],
  logs: ['patient_id', 'day', 'task_id', 'kind', 'ability', 'level', 'status', 'help', 'note', 'updated_at', 'plan_when'],
  checkins: ['patient_id', 'day', 'pain', 'wound', 'fever', 'mood', 'fall', 'symptoms', 'note', 'private', 'parsed'],
  alerts: ['id', 'patient_id', 'day', 'signals', 'level', 'summary', 'status', 'reply', 'resolved_day'],
  notes: ['id', 'patient_id', 'day', 'role', 'text', 'created_at', 'private'],
  reviews: ['patient_id', 'period', 'role', 'text'],
  snapshots: ['patient_id', 'day', 'levels'],
  todos: ['patient_id', 'todo_id', 'text', 'done'],
  sandboxes: ['token', 'last_seen'],
});
const TABLES = Object.keys(COLUMNS);
const SEQUENCES = ['pending', 'history', 'alerts', 'notes'];
const quote = (identifier) => `"${identifier}"`;
const error = (status, message) => Object.assign(new Error(message), { status });
const badSnapshot = () => error(400, 'Invalid single-patient snapshot');
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const scalar = (v) => v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

/** Export all twelve tables, scoped to exactly one patient's records.
 * Row insertion order and explicit AUTOINCREMENT IDs/high-water marks survive.
 * This never exports other patients or unrelated public-demo sandboxes.
 */
export function exportSnapshot(db, id) {
  if (typeof id !== 'string' || !id) throw badSnapshot();
  const patient = db.prepare('SELECT id, sandbox FROM patients WHERE id = ?').get(id);
  if (!patient) throw error(404, 'Patient not found');
  const tables = {};
  for (const table of TABLES) {
    const filter = table === 'patients' ? 'id' : table === 'sandboxes' ? 'token' : 'patient_id';
    const key = table === 'sandboxes' ? patient.sandbox : id;
    tables[table] = db.prepare(`SELECT ${COLUMNS[table].map(quote).join(', ')} FROM ${quote(table)} WHERE ${quote(filter)} = ? ORDER BY rowid`).all(key)
      .map((row) => Object.fromEntries(COLUMNS[table].map((column) => [column, row[column]])));
  }
  const sequences = {};
  for (const table of SEQUENCES) {
    sequences[table] = Number(db.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(table)?.seq || 0);
  }
  return { version: 1, patientId: id, tables, sequences };
}

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.version !== 1 || typeof snapshot.patientId !== 'string' || !snapshot.patientId ||
      !snapshot.tables || !snapshot.sequences ||
      Object.keys(snapshot).some((k) => !['version', 'patientId', 'tables', 'sequences'].includes(k)) ||
      Object.keys(snapshot.tables).length !== TABLES.length ||
      Object.keys(snapshot.tables).some((k) => !own(COLUMNS, k)) ||
      Object.keys(snapshot.sequences).length !== SEQUENCES.length ||
      Object.keys(snapshot.sequences).some((k) => !SEQUENCES.includes(k))) throw badSnapshot();
  if (!Array.isArray(snapshot.tables.patients) || snapshot.tables.patients.length !== 1) throw badSnapshot();
  const patient = snapshot.tables.patients[0];
  for (const table of TABLES) {
    const rows = snapshot.tables[table];
    if (!Array.isArray(rows) || (table === 'sandboxes' && rows.length > 1)) throw badSnapshot();
    for (const row of rows) {
      if (!row || Object.keys(row).length !== COLUMNS[table].length ||
          Object.keys(row).some((k) => !COLUMNS[table].includes(k)) ||
          COLUMNS[table].some((k) => !own(row, k) || !scalar(row[k]))) throw badSnapshot();
      if (table === 'patients' ? row.id !== snapshot.patientId :
          table === 'sandboxes' ? row.token !== patient.sandbox : row.patient_id !== snapshot.patientId) throw badSnapshot();
    }
  }
  for (const table of SEQUENCES) {
    const seq = snapshot.sequences[table];
    if (!Number.isSafeInteger(seq) || seq < 0 || snapshot.tables[table].some((r) => !Number.isSafeInteger(r.id) || r.id <= 0 || r.id > seq)) throw badSnapshot();
  }
}

/** Return a fresh openDb(':memory:'); the caller owns its lifetime. */
export function importSnapshot(snapshot) {
  validateSnapshot(snapshot);
  const db = openDb(':memory:');
  try {
    db.exec('BEGIN');
    for (const table of TABLES) {
      const columns = COLUMNS[table];
      const statement = db.prepare(`INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
      for (const row of snapshot.tables[table]) statement.run(...columns.map((c) => row[c]));
    }
    for (const table of SEQUENCES) {
      db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(table);
      db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(table, snapshot.sequences[table]);
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw badSnapshot();
    db.exec('COMMIT');
    return db;
  } catch {
    db.close();
    throw badSnapshot();
  }
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS durable_users (
    uid CHAR(36) COLLATE utf8mb4_bin PRIMARY KEY,
    open_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL DEFAULT '', email VARCHAR(320) NOT NULL DEFAULT '',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS durable_cases (
    id VARCHAR(64) COLLATE utf8mb4_bin PRIMARY KEY,
    owner_uid CHAR(36) COLLATE utf8mb4_bin NOT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    timezone VARCHAR(64) NOT NULL, plan_start_date DATE NOT NULL,
    snapshot LONGBLOB NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX durable_cases_owner (owner_uid),
    CONSTRAINT durable_cases_owner_fk FOREIGN KEY (owner_uid) REFERENCES durable_users(uid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS durable_case_members (
    case_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
    uid CHAR(36) COLLATE utf8mb4_bin NOT NULL,
    role ENUM('patient','family','rehab') NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (case_id, uid), INDEX durable_member_uid (uid),
    CONSTRAINT durable_members_case_fk FOREIGN KEY (case_id) REFERENCES durable_cases(id),
    CONSTRAINT durable_members_user_fk FOREIGN KEY (uid) REFERENCES durable_users(uid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS durable_invites (
    token_hash BINARY(32) PRIMARY KEY,
    case_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
    role ENUM('family','rehab') NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    consumed_by CHAR(36) COLLATE utf8mb4_bin NULL,
    consumed_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX durable_invite_case (case_id),
    CONSTRAINT durable_invites_case_fk FOREIGN KEY (case_id) REFERENCES durable_cases(id),
    CONSTRAINT durable_invites_consumer_fk FOREIGN KEY (consumed_by) REFERENCES durable_users(uid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS durable_chat (
    id CHAR(36) COLLATE utf8mb4_bin PRIMARY KEY,
    seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
    case_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
    uid CHAR(36) COLLATE utf8mb4_bin NOT NULL,
    message BLOB NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX durable_chat_scope (case_id, uid, seq),
    CONSTRAINT durable_chat_case_fk FOREIGN KEY (case_id) REFERENCES durable_cases(id),
    CONSTRAINT durable_chat_user_fk FOREIGN KEY (uid) REFERENCES durable_users(uid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
];

// No URI options may disable certificate/hostname verification. Only literal
// loopback hosts can use the platform's local authenticated database proxy.
function connectionOptions(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw error(503, 'Durable database configuration is invalid'); }
  if (parsed.protocol !== 'mysql:' || !parsed.hostname || !parsed.pathname.slice(1)) throw error(503, 'Durable database configuration is invalid');
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  let ssl;
  if (!local) {
    ssl = { rejectUnauthorized: true, verifyIdentity: true };
    // Optional CA file for a remote managed database with a private CA.
    const caFile = parsed.searchParams.get('ssl-ca') || process.env.DATABASE_SSL_CA_FILE;
    if (caFile) ssl.ca = fs.readFileSync(caFile, 'utf8');
  }
  return {
    host, port: Number(parsed.port || 3306), user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password), database: decodeURIComponent(parsed.pathname.slice(1)),
    charset: 'utf8mb4', timezone: 'Z', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true,
    ssl, connectionLimit: 8, connectTimeout: 10000, multipleStatements: false,
  };
}

const KEY_SALT = 'restart90/durable/v1/project-key';
const derive = (secret, purpose) => Buffer.from(crypto.hkdfSync('sha256', secret, KEY_SALT, purpose, 32));
function seal(key, value, aad) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), ciphertext]);
}
function unseal(key, encrypted, aad) {
  try {
    const bytes = Buffer.from(encrypted);
    if (bytes.length < 30 || bytes[0] !== 1) throw new Error();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(1, 13));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(bytes.subarray(13, 29));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString('utf8'));
  } catch { throw error(503, 'Private data could not be decrypted'); }
}
const snapshotAAD = (id, owner) => JSON.stringify(['restart90-snapshot-v1', id, owner]);
const chatAAD = (caseId, uid, id) => JSON.stringify(['restart90-chat-v1', caseId, uid, id]);
const inviteHash = (token) => crypto.createHash('sha256').update(token).digest();
const userResult = (row) => ({ uid: row.uid, id: row.uid, openId: row.open_id, name: row.name, email: row.email });
const revisionOf = (row) => BigInt(row.revision);
function dateInZone(timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch { throw error(400, 'Invalid timezone'); }
}

/** Auth-agnostic: openId is a stable identity from the SERVER's verified login,
 * never an unverified request body. This module is not a login/JWT service.
 * Keep the project secret stable across devices/deploys; rotation needs a
 * separate re-encryption migration. init() must succeed before persistent=true.
 */
export function createDurableStore({ url = process.env.DATABASE_URL, secret = process.env.MANUS_JWT_SECRET } = {}) {
  let pool = null;
  let state = 'new';
  let initializing;
  let snapshotKey, chatKey, namespaceKey;
  const ready = () => { if (state !== 'ready') throw error(503, 'Private persistent storage is unavailable'); };
  const execute = async (sql, params = []) => { ready(); return (await pool.execute(sql, params))[0]; };
  async function identify(user) {
    ready();
    const uid = user?.uid || user?.id;
    if (typeof uid !== 'string' || !uid) throw error(401, 'Verified login required');
    const rows = await execute('SELECT uid, open_id, name, email FROM durable_users WHERE uid = ?', [uid]);
    const found = rows[0];
    if (!found || (user.openId !== undefined && user.openId !== found.open_id)) throw error(401, 'Verified login required');
    return found.uid;
  }
  async function accessRow(uid, caseId, requestedRole, ownerOnly = false) {
    if (typeof caseId !== 'string' || !caseId) throw error(404, 'Case not found');
    const rows = await execute(`SELECT c.*, m.role AS member_role FROM durable_cases c
      LEFT JOIN durable_case_members m ON m.case_id = c.id AND m.uid = ?
      WHERE c.id = ? AND (c.owner_uid = ? OR m.uid IS NOT NULL)`, [uid, caseId, uid]);
    const row = rows[0];
    if (!row) throw error(404, 'Case not found');
    const isOwner = row.owner_uid === uid;
    const role = isOwner ? 'patient' : row.member_role;
    if (!['patient', 'family', 'rehab'].includes(role) || (ownerOnly && !isOwner) || (requestedRole != null && requestedRole !== role)) throw error(403, 'Case role is not authorized');
    return { row, access: Object.freeze({ role, ownerId: row.owner_uid, timezone: row.timezone, startDate: row.plan_start_date, isOwner }) };
  }
  function load(row) {
    const snapshot = unseal(snapshotKey, row.snapshot, snapshotAAD(row.id, row.owner_uid));
    if (snapshot.patientId !== row.id) throw error(503, 'Private case identity mismatch');
    return importSnapshot(snapshot);
  }
  function onlyPatient(db, id) {
    const patients = db.prepare('SELECT id FROM patients').all();
    if (patients.length !== 1 || patients[0].id !== id) throw error(400, 'A private case must contain exactly one patient');
  }
  async function runCase(uid, id, { requestedRole, write = false } = {}, callback, overview = false) {
    if (typeof callback !== 'function') throw error(400, 'Case callback required');
    for (let attempt = 0; attempt < 3; attempt++) {
      const { row, access } = await accessRow(uid, id, requestedRole);
      const db = load(row);
      try {
        const before = JSON.stringify(exportSnapshot(db, id));
        // rehabOverview(db) defaults to sandbox=''. In this scoped memory-only
        // view, temporarily alias just this patient's namespace; persist the
        // original namespace again before comparing/exporting.
        const originalSandbox = overview ? db.prepare('SELECT sandbox FROM patients WHERE id = ?').get(id).sandbox : null;
        if (overview) db.prepare("UPDATE patients SET sandbox = '' WHERE id = ?").run(id);
        const result = await callback(db, access);
        if (overview) db.prepare('UPDATE patients SET sandbox = ? WHERE id = ?').run(originalSandbox, id);
        onlyPatient(db, id);
        const after = exportSnapshot(db, id);
        const changed = before !== JSON.stringify(after);
        // Recheck after awaits. No MySQL connection/row lock is held while an
        // external model callback runs. Revoked users must not receive results.
        const latest = await accessRow(uid, id, access.role);
        if (changed) {
          const encrypted = seal(snapshotKey, after, snapshotAAD(id, row.owner_uid));
          const updated = await execute(`UPDATE durable_cases c SET snapshot = ?, revision = revision + 1
            WHERE c.id = ? AND c.revision = ? AND (c.owner_uid = ? OR EXISTS
              (SELECT 1 FROM durable_case_members m WHERE m.case_id = c.id AND m.uid = ? AND m.role = ?))`,
          [encrypted, id, String(row.revision), uid, uid, access.role]);
          if (updated.affectedRows !== 1) throw error(409, 'Case changed concurrently; reload before trying again');
        } else if (revisionOf(latest.row) !== revisionOf(row)) {
          if (!write && attempt < 2) continue;
          throw error(409, 'Case changed concurrently; reload before trying again');
        }
        return result;
      } finally { db.close(); }
    }
    throw error(409, 'Case changed concurrently; reload before trying again');
  }

  const store = {
    get persistent() { return state === 'ready'; },
    async init() {
      if (state === 'ready') return store;
      if (state === 'closed' || state === 'failed') throw error(503, 'Private persistent storage is unavailable');
      if (initializing) return initializing;
      initializing = (async () => {
        try {
          if (typeof url !== 'string' || !url || !((typeof secret === 'string' || Buffer.isBuffer(secret)) && Buffer.byteLength(secret) >= 32)) throw error(503, 'Stable project encryption secret and database URL are required');
          const options = connectionOptions(url);
          snapshotKey = derive(secret, 'case-snapshot/aes-256-gcm');
          chatKey = derive(secret, 'private-chat/aes-256-gcm');
          namespaceKey = derive(secret, 'user-namespace/hmac-sha256');
          const imported = await import('mysql2/promise');
          pool = (imported.default || imported).createPool(options);
          for (const sql of DDL) await pool.execute(sql);
          // Verify compatibility too; IF NOT EXISTS must not disguise an
          // incompatible preexisting table as an initialized persistent store.
          for (const sql of [
            'SELECT uid, open_id, name, email FROM durable_users LIMIT 0',
            'SELECT id, owner_uid, revision, timezone, plan_start_date, snapshot FROM durable_cases LIMIT 0',
            'SELECT case_id, uid, role FROM durable_case_members LIMIT 0',
            'SELECT token_hash, case_id, role, expires_at, consumed_by, consumed_at FROM durable_invites LIMIT 0',
            'SELECT id, seq, case_id, uid, message, created_at FROM durable_chat LIMIT 0',
          ]) await pool.execute(sql);
          state = 'ready';
          return store;
        } catch {
          state = 'failed';
          if (pool) { await pool.end().catch(() => {}); pool = null; }
          snapshotKey?.fill(0); chatKey?.fill(0); namespaceKey?.fill(0);
          throw error(503, 'Private persistent storage initialization failed');
        }
      })();
      return initializing;
    },
    async upsertUser({ openId, name = '', email = '' } = {}) {
      ready();
      if (typeof openId !== 'string' || !openId.trim() || openId.length > 191 || typeof name !== 'string' || name.length > 255 || typeof email !== 'string' || email.length > 320) throw error(400, 'Invalid verified user identity');
      await execute(`INSERT INTO durable_users (uid, open_id, name, email) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email)`, [crypto.randomUUID(), openId, name, email]);
      const rows = await execute('SELECT uid, open_id, name, email FROM durable_users WHERE open_id = ?', [openId]);
      return userResult(rows[0]);
    },
    async createCase(user, callback, { timezone = 'Asia/Shanghai' } = {}) {
      const uid = await identify(user);
      if (typeof timezone !== 'string' || timezone.length > 64) throw error(400, 'Invalid timezone');
      const startDate = dateInZone(timezone);
      if (typeof callback !== 'function') throw error(400, 'Case callback required');
      const namespace = crypto.createHmac('sha256', namespaceKey).update(uid).digest('hex');
      const db = openDb(':memory:');
      try {
        const result = await callback(db, namespace);
        const rows = db.prepare('SELECT id FROM patients').all();
        if (rows.length !== 1 || !result || typeof result !== 'object' || result.id !== rows[0].id || rows[0].id.length > 64) throw error(400, 'Case callback must create and return exactly one patient');
        const id = rows[0].id;
        const snapshot = exportSnapshot(db, id);
        const encrypted = seal(snapshotKey, snapshot, snapshotAAD(id, uid));
        try {
          await execute('INSERT INTO durable_cases (id, owner_uid, revision, timezone, plan_start_date, snapshot) VALUES (?, ?, 1, ?, ?, ?)', [id, uid, timezone, startDate, encrypted]);
        } catch (e) { if (e.code === 'ER_DUP_ENTRY') throw error(409, 'Case identifier collision; retry creation'); throw e; }
        return { ...result, accessRole: 'patient' };
      } finally { db.close(); }
    },
    async withCase(user, id, options, callback) {
      return runCase(await identify(user), id, options, callback);
    },
    async listCases(user, callback) {
      const uid = await identify(user);
      const rows = await execute(`SELECT c.id FROM durable_cases c WHERE c.owner_uid = ? OR EXISTS
        (SELECT 1 FROM durable_case_members m WHERE m.case_id = c.id AND m.uid = ?) ORDER BY c.created_at, c.id`, [uid, uid]);
      const summaries = [];
      for (const row of rows) {
        try { summaries.push(await runCase(uid, row.id, { write: false }, callback, true)); }
        catch (e) { if (e.status !== 404) throw e; } // membership revoked during enumeration
      }
      return summaries;
    },
    async createInvite(user, caseId, role) {
      const uid = await identify(user);
      if (!['family', 'rehab'].includes(role)) throw error(400, 'Invites are only for family or rehab members');
      await accessRow(uid, caseId, undefined, true);
      const token = crypto.randomBytes(32).toString('base64url');
      const inserted = await execute(`INSERT INTO durable_invites (token_hash, case_id, role, expires_at)
        SELECT ?, id, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 7 DAY) FROM durable_cases WHERE id = ? AND owner_uid = ?`, [inviteHash(token), role, caseId, uid]);
      if (inserted.affectedRows !== 1) throw error(403, 'Only the case owner can invite');
      return { token, caseId };
    },
    async acceptInvite(user, token) {
      const uid = await identify(user);
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw error(400, 'Invalid or expired invitation');
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [invites] = await connection.execute(`SELECT i.case_id, i.role, c.owner_uid FROM durable_invites i
          JOIN durable_cases c ON c.id = i.case_id WHERE i.token_hash = ? AND i.consumed_by IS NULL
          AND i.expires_at > UTC_TIMESTAMP(3) FOR UPDATE`, [inviteHash(token)]);
        const invite = invites[0];
        if (!invite) throw error(410, 'Invalid, expired or already used invitation');
        if (invite.owner_uid === uid) throw error(403, 'An owner cannot join their own invitation');
        const [existing] = await connection.execute('SELECT role FROM durable_case_members WHERE case_id = ? AND uid = ?', [invite.case_id, uid]);
        if (existing.length) throw error(409, 'Already a member; an invitation cannot change a fixed role');
        await connection.execute('INSERT INTO durable_case_members (case_id, uid, role) VALUES (?, ?, ?)', [invite.case_id, uid, invite.role]);
        const [updated] = await connection.execute(`UPDATE durable_invites SET consumed_by = ?, consumed_at = UTC_TIMESTAMP(3)
          WHERE token_hash = ? AND consumed_by IS NULL AND expires_at > UTC_TIMESTAMP(3)`, [uid, inviteHash(token)]);
        if (updated.affectedRows !== 1) throw error(410, 'Invitation is no longer available');
        await connection.commit();
        return { caseId: invite.case_id, role: invite.role };
      } catch (e) {
        await connection.rollback().catch(() => {});
        if (e.code === 'ER_DUP_ENTRY') throw error(409, 'Already a member');
        throw e;
      } finally { connection.release(); }
    },
    async getMembers(user, caseId) {
      const uid = await identify(user);
      await accessRow(uid, caseId, undefined, true);
      const rows = await execute(`SELECT u.uid, u.open_id, u.name, u.email, 'patient' AS role FROM durable_cases c
        JOIN durable_users u ON u.uid = c.owner_uid WHERE c.id = ? AND c.owner_uid = ?
        UNION ALL SELECT u.uid, u.open_id, u.name, u.email, m.role FROM durable_case_members m
        JOIN durable_users u ON u.uid = m.uid JOIN durable_cases c ON c.id = m.case_id
        WHERE m.case_id = ? AND c.owner_uid = ?`, [caseId, uid, caseId, uid]);
      return rows.map(({ uid: memberUid, name, email, role }) => ({ uid: memberUid, name, email, role }));
    },
    async revokeMember(user, caseId, memberUid) {
      const uid = await identify(user);
      await accessRow(uid, caseId, undefined, true);
      if (memberUid === uid) throw error(400, 'The owner cannot be revoked');
      if (typeof memberUid !== 'string' || !memberUid) throw error(400, 'Invalid member identity');
      const removed = await execute(`DELETE m FROM durable_case_members m JOIN durable_cases c ON c.id = m.case_id
        WHERE m.case_id = ? AND m.uid = ? AND c.owner_uid = ?`, [caseId, memberUid, uid]);
      return { ok: true, revoked: removed.affectedRows === 1 };
    },
    async getChat(user, caseId) {
      const uid = await identify(user);
      await accessRow(uid, caseId);
      const rows = await execute(`SELECT h.id, h.message FROM durable_chat h WHERE h.case_id = ? AND h.uid = ? AND EXISTS
        (SELECT 1 FROM durable_cases c WHERE c.id = h.case_id AND (c.owner_uid = ? OR EXISTS
          (SELECT 1 FROM durable_case_members m WHERE m.case_id = c.id AND m.uid = ?))) ORDER BY h.seq`, [caseId, uid, uid, uid]);
      await accessRow(uid, caseId);
      return rows.map((row) => unseal(chatKey, row.message, chatAAD(caseId, uid, row.id)));
    },
    async appendChat(user, caseId, { role, text } = {}) {
      const uid = await identify(user);
      await accessRow(uid, caseId);
      // Conversation role, NOT a care-team authorization role. The verified
      // server may append assistant replies; end users must not choose that route.
      if (!['user', 'assistant'].includes(role) || typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 32000) throw error(400, 'Invalid chat message');
      const id = crypto.randomUUID();
      const message = { role, text };
      const encrypted = seal(chatKey, message, chatAAD(caseId, uid, id));
      const inserted = await execute(`INSERT INTO durable_chat (id, case_id, uid, message)
        SELECT ?, c.id, ?, ? FROM durable_cases c WHERE c.id = ? AND (c.owner_uid = ? OR EXISTS
          (SELECT 1 FROM durable_case_members m WHERE m.case_id = c.id AND m.uid = ?))`, [id, uid, encrypted, caseId, uid, uid]);
      if (inserted.affectedRows !== 1) throw error(404, 'Case not found');
      return { ok: true };
    },
    async close() {
      if (initializing) await initializing.catch(() => {});
      state = 'closed';
      const previous = pool; pool = null;
      try { if (previous) await previous.end(); }
      finally { snapshotKey?.fill(0); chatKey?.fill(0); namespaceKey?.fill(0); }
    },
  };
  return store;
}
