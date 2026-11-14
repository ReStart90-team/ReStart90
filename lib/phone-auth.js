import crypto from 'node:crypto';
import fs from 'node:fs';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = Object.freeze({ N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const SESSION_SECONDS = 30 * 86400;
const NONCE_SECONDS = 600;
const ACCOUNT_COOKIE = 'rs90_account';
const NONCE_COOKIE = 'rs90_auth_nonce';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });
const unavailable = () => fail(503, 'Phone authentication is unavailable');
const rejected = () => fail(401, 'Phone or credentials were not accepted');
const equal = (a, b) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const sha256 = (text) => crypto.createHash('sha256').update(text).digest();

/** Syntax normalization only, NOT proof that a person owns this phone number. */
export function normalizePhone(input) {
  if (typeof input !== 'string' || input.length > 32) throw fail(400, 'Use an international +E.164 phone or an 11-digit Chinese mobile number');
  const phone = input.trim();
  if (/^1[3-9]\d{9}$/.test(phone)) return `+86${phone}`;
  // At least five digits so the last-four display always hides a digit.
  if (/^\+[1-9]\d{4,14}$/.test(phone) && (!phone.startsWith('+86') || /^\+861[3-9]\d{9}$/.test(phone))) return phone;
  throw fail(400, 'Use an international +E.164 phone or an 11-digit Chinese mobile number');
}
function checkPassword(password) {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 512) throw fail(400, 'Password must contain 12 to 128 characters');
  const length = [...password].length;
  if (length < 12 || length > 128) throw fail(400, 'Password must contain 12 to 128 characters');
}
export async function hashPassword(password) {
  checkPassword(password);
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt-v1$32768$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 512 || [...password].length > 128) return false;
  const parts = typeof encoded === 'string' ? encoded.split('$') : [];
  // Never accept attacker-controlled work factors or unbounded DB input.
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt-v1$32768$8$1' ||
      !/^[A-Za-z0-9_-]{22}$/.test(parts[4]) || !/^[A-Za-z0-9_-]{86}$/.test(parts[5])) return false;
  const derived = await scrypt(password, Buffer.from(parts[4], 'base64url'), 64, SCRYPT);
  return equal(derived, Buffer.from(parts[5], 'base64url'));
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS phone_accounts (
    open_id CHAR(36) COLLATE utf8mb4_bin PRIMARY KEY,
    phone_lookup BINARY(32) NOT NULL UNIQUE,
    phone_cipher VARBINARY(128) NOT NULL,
    password_hash VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
    recovery_hash BINARY(32) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS phone_sessions (
    token_hash BINARY(32) PRIMARY KEY,
    open_id CHAR(36) COLLATE utf8mb4_bin NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX phone_sessions_account (open_id), INDEX phone_sessions_expiry (expires_at),
    CONSTRAINT phone_sessions_account_fk FOREIGN KEY (open_id) REFERENCES phone_accounts(open_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
];

function connectionOptions(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'mysql:' || !parsed.hostname || !parsed.pathname.slice(1)) throw new Error();
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    const local = ['localhost', '127.0.0.1', '::1'].includes(host);
    let ssl;
    if (!local) {
      // Ignore all URI attempts to disable certificate / hostname validation.
      ssl = { rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' };
      const caFile = parsed.searchParams.get('ssl-ca') || process.env.DATABASE_SSL_CA_FILE;
      if (caFile) ssl.ca = fs.readFileSync(caFile, 'utf8');
    }
    return {
      host, port: Number(parsed.port || 3306), user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password), database: decodeURIComponent(parsed.pathname.slice(1)),
      charset: 'utf8mb4', timezone: 'Z', ssl, connectionLimit: 8, connectTimeout: 10000,
      multipleStatements: false,
    };
  } catch { throw unavailable(); }
}
function cookieValue(req, name) {
  const header = req?.headers?.cookie;
  if (typeof header !== 'string' || header.length > 16384) return null;
  const matches = header.split(';').map((c) => c.trim()).filter((c) => c.startsWith(`${name}=`));
  // Duplicated cookies are ambiguous (including cookie tossing); fail closed.
  if (matches.length > 1) return 'invalid';
  return matches.length ? matches[0].slice(name.length + 1) : null;
}
function appendCookie(res, value) {
  const old = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(old ? (Array.isArray(old) ? old : [old]) : []), value]);
}
const derive = (secret, purpose) => Buffer.from(crypto.hkdfSync('sha256', secret, 'restart90/phone-auth/v1', purpose, 32));

/**
 * Additive, application-owned authentication; NO OAuth/Preview identity bypass.
 * Keep secret stable across deployments (rotation requires re-encrypting phones).
 * Set publicUrl to the known browser-facing HTTPS origin when ingress omits
 * x-forwarded-proto; use a separate publicUrl=http://localhost configuration for
 * direct loopback development. Never infer cookie policy from NODE_ENV.
 * trustProxy is ONLY for an ingress that sanitizes X-Forwarded-For. Default IP
 * limits use the socket address; HTTPS forwarding only strengthens cookie policy.
 * Rate limits are bounded per-process; multiple workers need a shared edge limit.
 * Caller must await init(); map user.email=null to '' for durable.upsertUser.
 */
export function createPhoneAuth({
  url = process.env.DATABASE_URL, secret = process.env.MANUS_JWT_SECRET,
  publicUrl = process.env.RESTART90_PUBLIC_URL || '', trustProxy = false,
} = {}) {
  let pool, state = 'new', initializing, phoneKey, lookupKey, csrfKey, nonceKey, rateKey, dummyHash;
  let activeKdf = 0;
  const hits = new Map();
  const ready = () => { if (state !== 'ready') throw unavailable(); };
  const hmac = (key, text) => crypto.createHmac('sha256', key).update(text).digest();
  const lookup = (phone) => hmac(lookupKey, phone);
  function secureContext(req) {
    const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    if (proto === 'https' || req?.socket?.encrypted) return true;
    let known;
    try { if (publicUrl) known = new URL(publicUrl); } catch { throw unavailable(); }
    if (known?.protocol === 'https:') return true;
    if (known && (known.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(known.hostname))) throw unavailable();
    // Only direct loopback HTTP may receive non-Secure cookies. A public HTTP
    // site must not silently send a private account cookie in the clear.
    let host;
    try { host = new URL(`http://${req?.headers?.host || ''}`).hostname; } catch { throw unavailable(); }
    const peer = req?.socket?.remoteAddress;
    if ((!proto || proto === 'http') && ['localhost', '127.0.0.1', '[::1]'].includes(host) &&
        ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)) return false;
    throw unavailable();
  }
  function setCookie(req, res, name, value, age) {
    const secure = secureContext(req);
    appendCookie(res, `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; SameSite=${secure ? 'None' : 'Lax'}${secure ? '; Secure' : ''}`);
    res.setHeader('Cache-Control', 'no-store');
  }
  const csrf = (kind, token) => hmac(csrfKey, `${kind}:${token}`).toString('base64url');
  function validNonce(value) {
    if (typeof value !== 'string' || value.length > 120) return false;
    const [token, expiry, signature, ...extra] = value.split('.');
    if (extra.length || !TOKEN_RE.test(token || '') || !/^\d{10,13}$/.test(expiry || '') || !TOKEN_RE.test(signature || '')) return false;
    const expires = Number(expiry);
    const now = Date.now();
    return expires > now && expires <= now + NONCE_SECONDS * 1000 &&
      equal(hmac(nonceKey, `${token}.${expiry}`), Buffer.from(signature, 'base64url'));
  }
  function anonymous(req, res, rotate = false) {
    let nonce = cookieValue(req, NONCE_COOKIE);
    if (rotate || !validNonce(nonce)) {
      const base = `${randomToken()}.${Date.now() + NONCE_SECONDS * 1000}`;
      nonce = `${base}.${hmac(nonceKey, base).toString('base64url')}`;
      setCookie(req, res, NONCE_COOKIE, nonce, NONCE_SECONDS);
    }
    res.setHeader('Cache-Control', 'no-store');
    return { user: null, csrfToken: csrf('nonce', nonce) };
  }
  function sealPhone(phone, id) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', phoneKey, iv);
    cipher.setAAD(Buffer.from(`phone-v1:${id}`));
    const encrypted = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
  }
  function userOf(row) {
    try {
      if (!UUID_RE.test(row.open_id)) throw new Error();
      const bytes = Buffer.from(row.phone_cipher);
      if (bytes.length < 31 || bytes[0] !== 1) throw new Error();
      const decipher = crypto.createDecipheriv('aes-256-gcm', phoneKey, bytes.subarray(1, 13));
      decipher.setAAD(Buffer.from(`phone-v1:${row.open_id}`));
      decipher.setAuthTag(bytes.subarray(13, 29));
      const phone = Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString('utf8');
      if (normalizePhone(phone) !== phone || !equal(lookup(phone), row.phone_lookup)) throw new Error();
      const last = phone.slice(-4);
      return { openId: row.open_id, name: `用户${last}`, email: null, phoneMasked: `+${'*'.repeat(phone.length - 5)}${last}`, phoneVerified: false };
    } catch { throw unavailable(); }
  }
  async function execute(sql, params = [], connection = pool) {
    ready();
    try { return (await connection.execute(sql, params))[0]; }
    catch (e) { if (e.code === 'ER_DUP_ENTRY') throw e; throw unavailable(); }
  }
  async function transaction(callback) {
    ready();
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (e) {
      if (connection) await connection.rollback().catch(() => {});
      if (e.status) throw e;
      if (e.code === 'ER_DUP_ENTRY') throw rejected();
      throw unavailable();
    } finally { connection?.release(); }
  }
  async function liveSession(req) {
    ready();
    const token = cookieValue(req, ACCOUNT_COOKIE);
    if (!TOKEN_RE.test(token || '')) return null;
    const rows = await execute(`SELECT a.open_id, a.phone_lookup, a.phone_cipher FROM phone_sessions s
      JOIN phone_accounts a ON a.open_id = s.open_id
      WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)`, [sha256(token)]);
    return rows.length ? { user: userOf(rows[0]), token } : null;
  }
  async function validateCsrf(req) {
    ready();
    const provided = req?.headers?.['x-csrf-token'];
    if (typeof provided !== 'string' || !TOKEN_RE.test(provided)) throw fail(403, 'Invalid CSRF token');
    const session = await liveSession(req);
    // A stale/forged account cookie must not fall back to an anonymous nonce.
    const nonce = cookieValue(req, NONCE_COOKIE);
    const expected = session ? csrf('session', session.token) :
      !cookieValue(req, ACCOUNT_COOKIE) && validNonce(nonce) ? csrf('nonce', nonce) : null;
    if (!expected || !equal(provided, expected)) throw fail(403, 'Invalid CSRF token');
    return true;
  }
  function limit(req, account) {
    const now = Date.now(), windowMs = 15 * 60 * 1000;
    for (const [key, value] of hits) if (value.expires <= now) hits.delete(key);
    const forwarded = req?.headers?.['x-forwarded-for'];
    const ip = trustProxy && typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req?.socket?.remoteAddress;
    const ipKey = `ip:${hmac(rateKey, String(ip || 'unknown').slice(0, 128)).toString('hex')}`;
    const accountKey = `account:${account.toString('hex')}`;
    // Both buckets are charged even if the other is already blocked. All auth
    // attempts, including successes, share these limits; no existence oracle.
    const buckets = [[ipKey, 30], [accountKey, 10]];
    if (hits.size + buckets.filter(([key]) => !hits.has(key)).length > 10000) throw fail(429, 'Too many authentication attempts; try later');
    let over = false;
    for (const [key, maximum] of buckets) {
      const value = hits.get(key) || { count: 0, expires: now + windowMs };
      if (value.count >= maximum) over = true;
      value.count = Math.min(value.count + 1, maximum + 1);
      hits.set(key, value);
    }
    if (over) throw fail(429, 'Too many authentication attempts; try later');
  }
  async function kdf(callback) {
    // Memory/CPU bound: no unbounded queue of expensive scrypt requests.
    if (activeKdf >= 4) throw fail(429, 'Too many authentication attempts; try later');
    activeKdf++;
    try { return await callback(); } finally { activeKdf--; }
  }
  async function authInput(req, phone) {
    await validateCsrf(req);
    let normalized;
    try { normalized = normalizePhone(phone); }
    catch (e) { limit(req, hmac(lookupKey, 'invalid-phone')); throw e; }
    const account = lookup(normalized);
    limit(req, account);
    return { normalized, account };
  }
  async function insertSession(connection, id) {
    const token = randomToken();
    await execute(`INSERT INTO phone_sessions (token_hash, open_id, expires_at)
      VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 DAY))`, [sha256(token), id], connection);
    return token;
  }
  function finish(req, res, user, token, recoveryCode) {
    setCookie(req, res, ACCOUNT_COOKIE, token, SESSION_SECONDS);
    setCookie(req, res, NONCE_COOKIE, '', 0);
    return { user, csrfToken: csrf('session', token), ...(recoveryCode ? { recoveryCode } : {}) };
  }

  const auth = {
    get available() { return state === 'ready'; },
    async init() {
      if (state === 'ready') return auth;
      if (state === 'failed' || state === 'closed') throw unavailable();
      if (initializing) return initializing;
      initializing = (async () => {
        try {
          if (typeof url !== 'string' || !url || !((typeof secret === 'string' || Buffer.isBuffer(secret)) && Buffer.byteLength(secret) >= 32)) throw unavailable();
          const options = connectionOptions(url);
          if (publicUrl) {
            const known = new URL(publicUrl);
            if (known.protocol !== 'https:' && !(known.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(known.hostname))) throw unavailable();
          }
          phoneKey = derive(secret, 'phone/aes-256-gcm'); lookupKey = derive(secret, 'phone/hmac-sha256');
          csrfKey = derive(secret, 'csrf/hmac-sha256'); nonceKey = derive(secret, 'nonce/hmac-sha256'); rateKey = derive(secret, 'rate/hmac-sha256');
          const imported = await import('mysql2/promise');
          pool = (imported.default || imported).createPool(options);
          for (const sql of DDL) await pool.execute(sql);
          for (const sql of [
            'SELECT open_id, phone_lookup, phone_cipher, password_hash, recovery_hash FROM phone_accounts LIMIT 0',
            'SELECT token_hash, open_id, expires_at FROM phone_sessions LIMIT 0',
          ]) await pool.execute(sql);
          dummyHash = await hashPassword(randomToken());
          state = 'ready';
          return auth;
        } catch {
          state = 'failed';
          if (pool) { await pool.end().catch(() => {}); pool = null; }
          for (const key of [phoneKey, lookupKey, csrfKey, nonceKey, rateKey]) key?.fill(0);
          throw unavailable();
        }
      })();
      return initializing;
    },
    validateCsrf,
    async authenticate(req) { return (await liveSession(req))?.user || null; },
    async getSession(req, res) {
      const session = await liveSession(req);
      res.setHeader('Cache-Control', 'no-store');
      if (session) return { user: session.user, csrfToken: csrf('session', session.token) };
      if (cookieValue(req, ACCOUNT_COOKIE)) setCookie(req, res, ACCOUNT_COOKIE, '', 0);
      return anonymous(req, res);
    },
    async register(req, res, { phone, password } = {}) {
      const { normalized, account } = await authInput(req, phone);
      checkPassword(password);
      secureContext(req); // Fail before persisting credentials if cookies cannot work securely.
      const passwordHash = await kdf(() => hashPassword(password));
      const id = crypto.randomUUID(), recoveryCode = randomToken();
      const row = { open_id: id, phone_lookup: account, phone_cipher: sealPhone(normalized, id) };
      const token = await transaction(async (connection) => {
        await execute(`INSERT INTO phone_accounts (open_id, phone_lookup, phone_cipher, password_hash, recovery_hash)
          VALUES (?, ?, ?, ?, ?)`, [id, account, row.phone_cipher, passwordHash, sha256(recoveryCode)], connection);
        return insertSession(connection, id);
      });
      return finish(req, res, userOf(row), token, recoveryCode);
    },
    async login(req, res, { phone, password } = {}) {
      const { account } = await authInput(req, phone);
      secureContext(req);
      const rows = await execute('SELECT open_id, phone_lookup, phone_cipher, password_hash FROM phone_accounts WHERE phone_lookup = ?', [account]);
      const row = rows[0];
      // Missing accounts perform the same expensive password verification.
      const valid = await kdf(() => verifyPassword(password, row?.password_hash || dummyHash));
      if (!row || !valid) throw rejected();
      const user = userOf(row);
      const token = await transaction(async (connection) => {
        const current = await execute('SELECT password_hash FROM phone_accounts WHERE open_id = ? FOR UPDATE', [row.open_id], connection);
        if (!current.length || !equal(current[0].password_hash, row.password_hash)) throw rejected();
        return insertSession(connection, row.open_id);
      });
      return finish(req, res, user, token);
    },
    async recover(req, res, { phone, recoveryCode, newPassword } = {}) {
      const { account } = await authInput(req, phone);
      secureContext(req);
      const rows = await execute('SELECT open_id, phone_lookup, phone_cipher, recovery_hash FROM phone_accounts WHERE phone_lookup = ?', [account]);
      const row = rows[0];
      const validFormat = typeof recoveryCode === 'string' && TOKEN_RE.test(recoveryCode);
      const submitted = sha256(validFormat ? recoveryCode : 'invalid-recovery-code');
      const valid = equal(submitted, row?.recovery_hash || sha256('missing-account'));
      if (!row || !validFormat || !valid) throw rejected();
      checkPassword(newPassword);
      const passwordHash = await kdf(() => hashPassword(newPassword));
      const rotated = randomToken(), user = userOf(row);
      const token = await transaction(async (connection) => {
        const current = await execute('SELECT recovery_hash FROM phone_accounts WHERE open_id = ? FOR UPDATE', [row.open_id], connection);
        if (!current.length || !equal(submitted, current[0].recovery_hash)) throw rejected();
        await execute('UPDATE phone_accounts SET password_hash = ?, recovery_hash = ? WHERE open_id = ?', [passwordHash, sha256(rotated), row.open_id], connection);
        // Only this authentication module's sessions are removed; no app records.
        await execute('DELETE FROM phone_sessions WHERE open_id = ?', [row.open_id], connection);
        return insertSession(connection, row.open_id);
      });
      return finish(req, res, user, token, rotated);
    },
    async logout(req, res) {
      await validateCsrf(req);
      secureContext(req);
      const token = cookieValue(req, ACCOUNT_COOKIE);
      if (TOKEN_RE.test(token || '')) await execute('DELETE FROM phone_sessions WHERE token_hash = ?', [sha256(token)]);
      setCookie(req, res, ACCOUNT_COOKIE, '', 0);
      return anonymous(req, res, true);
    },
    async close() {
      if (initializing) await initializing.catch(() => {});
      state = 'closed';
      const previous = pool; pool = null; hits.clear(); dummyHash = null;
      try { if (previous) await previous.end(); }
      finally { for (const key of [phoneKey, lookupKey, csrfKey, nonceKey, rateKey]) key?.fill(0); }
    },
  };
  return auth;
}
