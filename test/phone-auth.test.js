import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createPhoneAuth, normalizePhone, hashPassword, verifyPassword } from '../lib/phone-auth.js';

// No real mysql2 import, DATABASE_URL connection, external identity or Preview
// user in this suite. Replace ONLY the driver boundary of the exact module.
const DRIVER = Symbol.for('restart90.phone-auth.test.driver');
const production = fs.readFileSync(new URL('../lib/phone-auth.js', import.meta.url), 'utf8');
assert.equal(production.split("await import('mysql2/promise')").length, 2);
const instrumented = production.replace("await import('mysql2/promise')", "await Promise.resolve({ default: globalThis[Symbol.for('restart90.phone-auth.test.driver')] })");
const { createPhoneAuth: mockAuth } = await import(`data:text/javascript;base64,${Buffer.from(instrumented).toString('base64')}`);
const SECRET = 'synthetic-test-only-stable-project-secret-000001';
const PHONE = '13800138000';
const PASSWORD = 'a friendly long passphrase';
const status = (code) => (error) => error.status === code;
const clone = (value) => structuredClone(value);
const hex = (value) => Buffer.from(value).toString('hex');
const tokenHash = (value) => crypto.createHash('sha256').update(value).digest('hex');

class MemoryMysql {
  constructor() {
    this.accounts = new Map(); this.sessions = new Map(); this.calls = []; this.tail = Promise.resolve(); this.ended = false;
    this.createPool = (options) => { this.options = options; return this; };
  }
  async execute(raw, params = []) {
    const sql = raw.replace(/\s+/g, ' ').trim();
    this.calls.push({ sql, params: clone(params) });
    if (this.failAll || (this.failSql && sql.startsWith(this.failSql))) throw new Error('Synthetic driver failure with credentials that must not leak');
    let result;
    if (sql.startsWith('CREATE TABLE')) {
      if (this.failDDL) throw new Error('Synthetic schema failure');
      result = { affectedRows: 0 };
    } else if (sql.endsWith('LIMIT 0')) {
      if (this.failSchema) throw new Error('Synthetic incompatible schema');
      result = [];
    } else if (sql.startsWith('INSERT INTO phone_accounts')) {
      const [open_id, phone_lookup, phone_cipher, password_hash, recovery_hash] = params;
      if ([...this.accounts.values()].some((a) => hex(a.phone_lookup) === hex(phone_lookup))) throw Object.assign(new Error('Synthetic duplicate'), { code: 'ER_DUP_ENTRY' });
      this.accounts.set(open_id, { open_id, phone_lookup: Buffer.from(phone_lookup), phone_cipher: Buffer.from(phone_cipher), password_hash, recovery_hash: Buffer.from(recovery_hash) });
      result = { affectedRows: 1 };
    } else if (sql.startsWith('INSERT INTO phone_sessions')) {
      const [token_hash, open_id] = params;
      assert.ok(this.accounts.has(open_id));
      this.sessions.set(hex(token_hash), { token_hash: Buffer.from(token_hash), open_id, expires: Date.now() + 30 * 86400000 });
      result = { affectedRows: 1 };
    } else if (sql.startsWith('SELECT a.open_id')) {
      const session = this.sessions.get(hex(params[0]));
      const row = session && session.expires > Date.now() ? this.accounts.get(session.open_id) : null;
      result = row ? [clone(row)] : [];
    } else if (sql.startsWith('SELECT open_id, phone_lookup, phone_cipher')) {
      result = [...this.accounts.values()].filter((a) => hex(a.phone_lookup) === hex(params[0])).map(clone);
    } else if (sql.startsWith('SELECT password_hash FROM phone_accounts')) {
      const row = this.accounts.get(params[0]); result = row ? [{ password_hash: row.password_hash }] : [];
    } else if (sql.startsWith('SELECT recovery_hash FROM phone_accounts')) {
      const row = this.accounts.get(params[0]); result = row ? [{ recovery_hash: clone(row.recovery_hash) }] : [];
    } else if (sql.startsWith('UPDATE phone_accounts SET password_hash')) {
      const [password_hash, recovery_hash, id] = params;
      const row = this.accounts.get(id);
      if (row) Object.assign(row, { password_hash, recovery_hash: Buffer.from(recovery_hash) });
      result = { affectedRows: row ? 1 : 0 };
    } else if (sql.startsWith('DELETE FROM phone_sessions WHERE open_id')) {
      let count = 0;
      for (const [key, row] of this.sessions) if (row.open_id === params[0]) { this.sessions.delete(key); count++; }
      result = { affectedRows: count };
    } else if (sql.startsWith('DELETE FROM phone_sessions WHERE token_hash')) {
      result = { affectedRows: this.sessions.delete(hex(params[0])) ? 1 : 0 };
    } else throw new Error(`Unsimulated SQL: ${sql}`);
    return [result, []];
  }
  async getConnection() {
    const fake = this;
    let unlock, backup;
    return {
      async beginTransaction() {
        const previous = fake.tail;
        fake.tail = new Promise((resolve) => { unlock = resolve; });
        await previous;
        backup = clone({ accounts: fake.accounts, sessions: fake.sessions });
      },
      execute: (...args) => fake.execute(...args),
      async commit() { backup = null; },
      async rollback() { if (backup) { fake.accounts = backup.accounts; fake.sessions = backup.sessions; } },
      release() { unlock?.(); },
    };
  }
  async end() { this.ended = true; }
}
class Browser {
  constructor(ip = '198.51.100.10') { this.cookies = new Map(); this.ip = ip; this.csrfToken = null; }
  req(extra = {}) {
    return {
      method: 'POST', headers: {
        host: '127.0.0.1:3090', 'x-forwarded-proto': 'https',
        cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(this.csrfToken ? { 'x-csrf-token': this.csrfToken } : {}), ...extra,
      }, socket: { remoteAddress: this.ip },
      user: { openId: 'forged-client-identity' },
    };
  }
  res(initial = []) {
    const headers = new Map(initial.length ? [['set-cookie', initial]] : []);
    return { getHeader: (key) => headers.get(key.toLowerCase()), setHeader: (key, value) => headers.set(key.toLowerCase(), value), headers };
  }
  apply(res, result) {
    for (const cookie of res.getHeader('Set-Cookie') || []) {
      const [pair] = cookie.split(';'); const index = pair.indexOf('=');
      const key = pair.slice(0, index), value = pair.slice(index + 1);
      if (/Max-Age=0(?:;|$)/.test(cookie)) this.cookies.delete(key); else this.cookies.set(key, value);
    }
    this.csrfToken = result.csrfToken;
  }
  async call(auth, method, body) {
    const res = this.res();
    const result = await auth[method](this.req(), res, body);
    this.apply(res, result);
    return { result, res };
  }
}
async function fixture(t, options = {}) {
  const driver = new MemoryMysql(); globalThis[DRIVER] = driver;
  const auth = mockAuth({ url: 'mysql://synthetic:synthetic@127.0.0.1/synthetic', secret: SECRET, ...options });
  await auth.init();
  t.after(async () => { await auth.close(); delete globalThis[DRIVER]; });
  const browser = new Browser(); await browser.call(auth, 'getSession');
  return { auth, driver, browser };
}
async function registered(t, options) {
  const context = await fixture(t, options);
  const { result } = await context.browser.call(context.auth, 'register', { phone: PHONE, password: PASSWORD });
  return { ...context, user: result.user, recoveryCode: result.recoveryCode };
}

test('phone syntax: default +86, explicit international E.164, never ownership validation', () => {
  assert.equal(normalizePhone(' 13800138000 '), '+8613800138000');
  assert.equal(normalizePhone('+8613800138000'), '+8613800138000');
  assert.equal(normalizePhone('+14155552671'), '+14155552671');
  assert.equal(normalizePhone('+442079460018'), '+442079460018');
  for (const value of ['1380013800', '01234567890', '+013800138000', '00442079460018', '+8612000138000', '+1234567890123456', '138-0013-8000', "13800138000' OR 1=1", null, 13800138000]) assert.throws(() => normalizePhone(value), status(400));
});

test('async scrypt: random salt, fixed bounded N/r/p, passphrase whitespace and constant-time check', async () => {
  const password = '  a friendly long phrase  ';
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.match(first, /^scrypt-v1\$32768\$8\$1\$/);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password.trim(), first), false);
  assert.equal(await verifyPassword('another long passphrase', first), false);
  assert.equal(await verifyPassword(password, first.replace('$32768$', '$1073741824$')), false);
  assert.equal(await verifyPassword(password, 'corrupted-hash'), false);
  for (const bad of ['short', 'x'.repeat(129), null]) await assert.rejects(hashPassword(bad), status(400));
  const maximum = 'x'.repeat(128);
  assert.equal(await verifyPassword(maximum, await hashPassword(maximum)), true);
  assert.equal(await verifyPassword('x'.repeat(129), first), false);
});

test('real uninstrumented module fails closed without configuration, before init, after failure and close', async () => {
  const auth = createPhoneAuth({ url: '', secret: '' });
  const browser = new Browser();
  for (const method of ['authenticate', 'getSession', 'validateCsrf', 'register', 'login', 'recover', 'logout']) await assert.rejects(auth[method](browser.req(), browser.res(), {}), status(503));
  await assert.rejects(auth.init(), status(503));
  await assert.rejects(auth.init(), status(503));
  assert.equal(auth.available, false);
  await auth.close(); await assert.rejects(auth.init(), status(503));
});

test('mock boundary: additive tables only, idempotent init, strict remote TLS despite disable URI options', async (t) => {
  const { auth, driver } = await fixture(t, { url: 'mysql://synthetic:synthetic@remote.example.invalid/synthetic?ssl=false&rejectUnauthorized=false&verifyIdentity=false' });
  const ddl = driver.calls.filter((c) => c.sql.startsWith('CREATE TABLE'));
  assert.equal(ddl.length, 2);
  assert.ok(ddl.every((c) => c.sql.includes('IF NOT EXISTS phone_')));
  assert.equal(driver.options.ssl.rejectUnauthorized, true);
  assert.equal(driver.options.ssl.verifyIdentity, true);
  assert.equal(driver.options.multipleStatements, false);
  await auth.init(); assert.equal(driver.calls.filter((c) => c.sql.startsWith('CREATE TABLE')).length, 2);
  assert.equal(auth.available, true);
  assert.ok(driver.calls.every((c) => !/DROP|ALTER|TRUNCATE/.test(c.sql)));
});

test('initialization/schema failures and missing stable secret cannot enter ready state', async () => {
  for (const failure of ['failDDL', 'failSchema']) {
    const driver = new MemoryMysql(); driver[failure] = true; globalThis[DRIVER] = driver;
    const auth = mockAuth({ url: 'mysql://synthetic:synthetic@localhost/synthetic', secret: SECRET });
    await assert.rejects(auth.init(), (e) => e.status === 503 && !e.message.includes('Synthetic'));
    assert.equal(driver.ended, true); assert.equal(auth.available, false);
    await assert.rejects(auth.authenticate(new Browser().req()), status(503)); await auth.close();
  }
  const driver = new MemoryMysql(); globalThis[DRIVER] = driver;
  const auth = mockAuth({ url: 'mysql://synthetic:synthetic@localhost/synthetic', secret: 'too-short' });
  await assert.rejects(auth.init(), status(503)); assert.equal(driver.calls.length, 0);
  await auth.close(); delete globalThis[DRIVER];
});

test('anonymous CSRF is signed, short-lived, HttpOnly and bound to its browser cookie', async (t) => {
  const { auth, browser, driver } = await fixture(t);
  assert.equal(await auth.authenticate(browser.req()), null);
  const nonce = browser.cookies.get('rs90_auth_nonce');
  assert.ok(nonce); assert.equal(await auth.validateCsrf(browser.req()), true);
  const other = new Browser('198.51.100.11'); await other.call(auth, 'getSession');
  await assert.rejects(auth.validateCsrf(other.req({ 'x-csrf-token': browser.csrfToken })), status(403));
  await assert.rejects(auth.register(browser.req({ 'x-csrf-token': undefined }), browser.res(), { phone: PHONE, password: PASSWORD }), status(403));
  for (const tampered of [nonce.replace(/.$/, nonce.endsWith('A') ? 'B' : 'A'), nonce.replace(/\.\d+\./, '.1.')]) {
    await assert.rejects(auth.validateCsrf(browser.req({ cookie: `rs90_auth_nonce=${tampered}` })), status(403));
  }
  await assert.rejects(auth.validateCsrf(browser.req({ cookie: `rs90_auth_nonce=${nonce}; rs90_auth_nonce=${nonce}` })), status(403));
  assert.equal(driver.accounts.size, 0);
  const res = browser.res(['rs90sb=syntheticdemo; Path=/']);
  const result = await auth.getSession(new Browser().req(), res);
  assert.equal(result.user, null);
  assert.match(res.getHeader('Set-Cookie')[1], /Max-Age=600; HttpOnly; SameSite=None; Secure/);
  assert.equal(res.getHeader('Set-Cookie')[0], 'rs90sb=syntheticdemo; Path=/');
});

test('registration stores encrypted phone/HMAC and hashes only; stable real-account UUID, never verified', async (t) => {
  const { auth, driver, browser, user, recoveryCode } = await registered(t);
  assert.match(user.openId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(user, { openId: user.openId, name: '用户8000', email: null, phoneMasked: '+*********8000', phoneVerified: false });
  const row = driver.accounts.get(user.openId);
  assert.equal(row.phone_lookup.length, 32);
  assert.equal(Buffer.from(row.phone_cipher).includes(Buffer.from(PHONE)), false);
  assert.equal(Buffer.from(row.recovery_hash).equals(Buffer.from(recoveryCode)), false);
  assert.equal(hex(row.recovery_hash), tokenHash(recoveryCode));
  const token = browser.cookies.get('rs90_account');
  assert.ok(driver.sessions.has(tokenHash(token)));
  assert.ok(driver.calls.every((c) => !c.sql.includes(PHONE) && !c.params.includes(PASSWORD) && !c.params.includes(recoveryCode) && !c.params.includes(token)));
  assert.equal(browser.cookies.has('rs90_auth_nonce'), false);
  assert.equal(await auth.validateCsrf(browser.req()), true);
  assert.deepEqual(await auth.authenticate(browser.req()), user);
  assert.deepEqual((await browser.call(auth, 'getSession')).result.user, user);
});

test('login/logout rotate session+CSRF; logout rejects missing/cross-browser CSRF and invalidates DB session', async (t) => {
  const { auth, driver, browser, user } = await registered(t);
  const oldToken = browser.cookies.get('rs90_account'), oldCsrf = browser.csrfToken;
  const other = new Browser('198.51.100.20'); await other.call(auth, 'getSession');
  const anonymousCsrf = other.csrfToken;
  const { result, res } = await other.call(auth, 'login', { phone: `+86${PHONE}`, password: PASSWORD, openId: 'forged' });
  assert.deepEqual(result.user, user);
  assert.notEqual(other.cookies.get('rs90_account'), oldToken);
  assert.notEqual(result.csrfToken, anonymousCsrf);
  assert.ok(res.getHeader('Set-Cookie').some((c) => /rs90_account=.*Max-Age=2592000; HttpOnly; SameSite=None; Secure/.test(c)));
  await assert.rejects(auth.logout(other.req({ 'x-csrf-token': oldCsrf }), other.res()), status(403));
  await assert.rejects(auth.logout(other.req({ 'x-csrf-token': undefined }), other.res()), status(403));
  await assert.rejects(auth.validateCsrf(other.req({ 'x-csrf-token': anonymousCsrf })), status(403));
  assert.equal(driver.sessions.size, 2);
  await browser.call(auth, 'logout');
  assert.equal(driver.sessions.has(tokenHash(oldToken)), false);
  assert.equal(await auth.authenticate(browser.req()), null);
  assert.equal((await auth.authenticate(other.req())).openId, user.openId);
  assert.equal(await auth.validateCsrf(browser.req()), true);
});

test('true/fake identity boundary ignores Preview/platform cookies, Bearer, body and req.user', async (t) => {
  const { auth, browser } = await fixture(t);
  const forged = browser.req({ cookie: 'app_session_id=fake; webdev_app_session=fake; rs90sb=syntheticdemo', authorization: 'Bearer fake' });
  assert.equal(await auth.authenticate(forged), null);
  assert.equal(await auth.authenticate(browser.req({ cookie: `rs90_account=${'A'.repeat(43)}` })), null);
  await assert.rejects(auth.validateCsrf(browser.req({ cookie: `${browser.req().headers.cookie}; rs90_account=${'A'.repeat(43)}` })), status(403));
});

test('expired/revoked sessions never authenticate or pass CSRF; getSession clears stale account cookie', async (t) => {
  const { auth, driver, browser } = await registered(t);
  const token = browser.cookies.get('rs90_account');
  driver.sessions.get(tokenHash(token)).expires = Date.now() - 1;
  assert.equal(await auth.authenticate(browser.req()), null);
  await assert.rejects(auth.validateCsrf(browser.req()), status(403));
  const { result, res } = await browser.call(auth, 'getSession');
  assert.equal(result.user, null);
  assert.ok(res.getHeader('Set-Cookie').some((c) => c.startsWith('rs90_account=;') && c.includes('Max-Age=0')));
  assert.ok(browser.cookies.has('rs90_auth_nonce'));
  assert.equal(await auth.validateCsrf(browser.req()), true);
});

test('wrong-password, unknown-account and duplicate registration failures have identical generic message', async (t) => {
  const { auth, browser, driver } = await registered(t);
  const anonymous = new Browser('198.51.100.21'); await anonymous.call(auth, 'getSession');
  const errors = [];
  for (const [method, body] of [
    ['login', { phone: PHONE, password: 'wrong but long password' }],
    ['login', { phone: '13900139000', password: 'wrong but long password' }],
    ['register', { phone: PHONE, password: PASSWORD }],
  ]) {
    try { await anonymous.call(auth, method, body); assert.fail('must reject'); } catch (e) { errors.push(e); }
  }
  assert.ok(errors.every((e) => e.status === 401 && e.message === errors[0].message && !e.message.includes(PHONE)));
  assert.equal(driver.accounts.size, 1); assert.equal(driver.sessions.size, 1);
  assert.equal((await auth.authenticate(browser.req())).phoneVerified, false);
});

test('rate limit binds account across IPs and IP across accounts; untrusted forwarded-for cannot bypass', async (t) => {
  const { auth, browser } = await fixture(t);
  for (let index = 0; index < 10; index++) {
    browser.ip = `198.51.100.${index + 40}`;
    await assert.rejects(auth.login(browser.req(), browser.res(), { phone: PHONE, password: PASSWORD }), status(401));
  }
  browser.ip = '198.51.100.200';
  await assert.rejects(auth.login(browser.req(), browser.res(), { phone: PHONE, password: PASSWORD }), status(429));
  browser.ip = '198.51.100.201';
  for (let index = 0; index < 30; index++) {
    const phone = `+1415555${String(index).padStart(4, '0')}`;
    await assert.rejects(auth.login(browser.req({ 'x-forwarded-for': `203.0.113.${index}` }), browser.res(), { phone, password: PASSWORD }), status(401));
  }
  await assert.rejects(auth.login(browser.req({ 'x-forwarded-for': '203.0.113.250' }), browser.res(), { phone: '+14155559999', password: PASSWORD }), status(429));
});

test('recovery: one-time random hash-only code, stable account, session revocation, password/code rotation', async (t) => {
  const { auth, driver, browser, user, recoveryCode } = await registered(t);
  const oldReq = browser.req(), oldHash = driver.accounts.get(user.openId).password_hash;
  const other = new Browser('198.51.100.80'); await other.call(auth, 'getSession');
  const newPassword = 'a different friendly passphrase';
  await assert.rejects(auth.recover(other.req({ 'x-csrf-token': undefined }), other.res(), { phone: PHONE, recoveryCode, newPassword }), status(403));
  for (const phone of [PHONE, '13900139000']) await assert.rejects(other.call(auth, 'recover', { phone, recoveryCode: 'A'.repeat(43), newPassword }), status(401));
  const { result } = await other.call(auth, 'recover', { phone: PHONE, recoveryCode, newPassword });
  assert.deepEqual(result.user, user); assert.notEqual(result.recoveryCode, recoveryCode);
  assert.equal(driver.sessions.size, 1);
  assert.equal(await auth.authenticate(oldReq), null);
  await assert.rejects(auth.validateCsrf(oldReq), status(403));
  assert.notEqual(driver.accounts.get(user.openId).password_hash, oldHash);
  assert.equal(hex(driver.accounts.get(user.openId).recovery_hash), tokenHash(result.recoveryCode));
  await assert.rejects(other.call(auth, 'recover', { phone: PHONE, recoveryCode, newPassword }), status(401));
  const third = new Browser('198.51.100.81'); await third.call(auth, 'getSession');
  await assert.rejects(third.call(auth, 'login', { phone: PHONE, password: PASSWORD }), status(401));
  assert.deepEqual((await third.call(auth, 'login', { phone: PHONE, password: newPassword })).result.user, user);
});

test('concurrent recovery consumes a code only once under account row lock', async (t) => {
  const { auth, driver, recoveryCode } = await registered(t);
  const first = new Browser('198.51.100.90'), second = new Browser('198.51.100.91');
  await first.call(auth, 'getSession'); await second.call(auth, 'getSession');
  const results = await Promise.allSettled([first, second].map((b) => b.call(auth, 'recover', { phone: PHONE, recoveryCode, newPassword: 'a concurrent long passphrase' })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.status === 401).length, 1);
  assert.equal(driver.sessions.size, 1);
});

test('transaction failure rolls back registration/recovery; runtime DB failures are sanitized 503', async (t) => {
  const { auth, driver, browser } = await fixture(t);
  driver.failSql = 'INSERT INTO phone_sessions';
  await assert.rejects(browser.call(auth, 'register', { phone: PHONE, password: PASSWORD }), (e) => e.status === 503 && !e.message.includes('credentials'));
  assert.equal(driver.accounts.size, 0); assert.equal(driver.sessions.size, 0);
  driver.failSql = null;
  const { result } = await browser.call(auth, 'register', { phone: PHONE, password: PASSWORD });
  const before = clone(driver.accounts.get(result.user.openId));
  driver.failSql = 'INSERT INTO phone_sessions';
  await assert.rejects(browser.call(auth, 'recover', { phone: PHONE, recoveryCode: result.recoveryCode, newPassword: 'a rollback long passphrase' }), status(503));
  assert.deepEqual(driver.accounts.get(result.user.openId), before); assert.equal(driver.sessions.size, 1);
  driver.failSql = null; driver.failAll = true;
  await assert.rejects(auth.authenticate(browser.req()), status(503));
  await assert.rejects(auth.validateCsrf(browser.req()), status(503));
  await assert.rejects(browser.call(auth, 'getSession'), status(503));
});

test('AES-GCM is bound to account identity and project secret; corruption does not expose phones', async (t) => {
  const { auth, driver, browser, user } = await registered(t);
  const row = driver.accounts.get(user.openId), original = Buffer.from(row.phone_cipher);
  row.phone_cipher[original.length - 1] ^= 1;
  await assert.rejects(auth.authenticate(browser.req()), status(503));
  row.phone_cipher = original;
  row.phone_lookup = Buffer.alloc(32);
  await assert.rejects(auth.authenticate(browser.req()), status(503));
});

test('cookie policy uses HTTPS forwarding/known public origin, not NODE_ENV; HTTP only on separate loopback', async (t) => {
  const { auth, driver } = await fixture(t, { publicUrl: 'https://known-public.example.invalid' });
  const browser = new Browser();
  const res = browser.res();
  await auth.getSession(browser.req({ 'x-forwarded-proto': undefined }), res);
  assert.match(res.getHeader('Set-Cookie')[0], /SameSite=None; Secure/);
  assert.equal(driver.options.ssl, undefined);
  const localDriver = new MemoryMysql(); globalThis[DRIVER] = localDriver;
  const local = mockAuth({ url: 'mysql://synthetic:synthetic@localhost/synthetic', secret: SECRET, publicUrl: 'http://localhost:3090' });
  await local.init(); t.after(() => local.close());
  const localBrowser = new Browser('127.0.0.1');
  const localRes = localBrowser.res();
  await local.getSession(localBrowser.req({ host: 'localhost:3090', 'x-forwarded-proto': undefined }), localRes);
  assert.match(localRes.getHeader('Set-Cookie')[0], /HttpOnly; SameSite=Lax$/);
  const remote = new Browser('198.51.100.100');
  await assert.rejects(local.getSession(remote.req({ host: 'public.example.invalid', 'x-forwarded-proto': 'http' }), remote.res()), status(503));
  await assert.rejects(local.register(remote.req({ 'x-forwarded-proto': 'http' }), remote.res(), { phone: PHONE, password: PASSWORD }), status(403));
  assert.equal(localDriver.accounts.size, 0);
});

test('short international input cannot cause post-commit masking failure', () => {
  for (const short of ['+12', '+123', '+1234']) assert.throws(() => normalizePhone(short), status(400));
  assert.equal(normalizePhone('+12345'), '+12345');
});

test('stable secret across module restarts preserves account UUID/HMAC/cipher; different secret fails closed', async (t) => {
  const { auth, driver, browser, user } = await registered(t);
  globalThis[DRIVER] = driver;
  const restarted = mockAuth({ url: 'mysql://synthetic:synthetic@localhost/synthetic', secret: SECRET });
  await restarted.init(); t.after(() => restarted.close());
  assert.deepEqual(await restarted.authenticate(browser.req()), user);
  const fresh = new Browser('198.51.100.120'); await fresh.call(restarted, 'getSession');
  assert.deepEqual((await fresh.call(restarted, 'login', { phone: PHONE, password: PASSWORD })).result.user, user);
  assert.equal(driver.accounts.size, 1);
  const changedSecret = mockAuth({ url: 'mysql://synthetic:synthetic@localhost/synthetic', secret: `${SECRET}-changed` });
  await changedSecret.init(); t.after(() => changedSecret.close());
  await assert.rejects(changedSecret.authenticate(browser.req()), status(503));
  assert.deepEqual(await auth.authenticate(browser.req()), user);
});

test('signed but expired anonymous nonce is rejected, not just a bad signature', async (t) => {
  const { auth, browser } = await fixture(t);
  const nonceKey = Buffer.from(crypto.hkdfSync('sha256', SECRET, 'restart90/phone-auth/v1', 'nonce/hmac-sha256', 32));
  const csrfKey = Buffer.from(crypto.hkdfSync('sha256', SECRET, 'restart90/phone-auth/v1', 'csrf/hmac-sha256', 32));
  const base = `${'A'.repeat(43)}.${Date.now() - 1000}`;
  const nonce = `${base}.${crypto.createHmac('sha256', nonceKey).update(base).digest('base64url')}`;
  const csrfToken = crypto.createHmac('sha256', csrfKey).update(`nonce:${nonce}`).digest('base64url');
  await assert.rejects(auth.validateCsrf(browser.req({ cookie: `rs90_auth_nonce=${nonce}`, 'x-csrf-token': csrfToken })), status(403));
});

test('global KDF concurrency is bounded; fifth expensive request is refused without unbounded queue', async (t) => {
  const { auth, browser } = await fixture(t);
  const results = await Promise.allSettled(Array.from({ length: 5 }, (_, index) =>
    auth.login(browser.req(), browser.res(), { phone: `+1415555120${index}`, password: PASSWORD })));
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.status === 401).length, 4);
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.status === 429).length, 1);
});

test('valid CSRF cannot register over insecure public HTTP; invalid password never creates account', async (t) => {
  const { auth, browser, driver } = await fixture(t);
  await assert.rejects(auth.register(browser.req({ host: 'public.example.invalid', 'x-forwarded-proto': 'http' }), browser.res(), { phone: PHONE, password: PASSWORD }), status(503));
  for (const password of ['short', 'x'.repeat(129), null]) await assert.rejects(browser.call(auth, 'register', { phone: PHONE, password }), status(400));
  assert.equal(driver.accounts.size, 0); assert.equal(driver.sessions.size, 0);
});
