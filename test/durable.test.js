import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { openDb } from '../lib/db.js';
import * as E from '../lib/engine.js';
import { createDurableStore, exportSnapshot, importSnapshot } from '../lib/durable.js';

// This suite NEVER imports mysql2 or connects to DATABASE_URL. Swap only the
// dependency boundary in a copy of the exact production source; the production
// interface stays unchanged and all SQL/CAS/encryption/authorization code runs.
const DRIVER = Symbol.for('restart90.durable.test.driver');
const sourceUrl = new URL('../lib/durable.js', import.meta.url);
const production = fs.readFileSync(sourceUrl, 'utf8');
assert.equal(production.split("await import('mysql2/promise')").length, 2);
const instrumented = production
  .replace("from './db.js'", `from '${new URL('../lib/db.js', import.meta.url).href}'`)
  .replace("await import('mysql2/promise')", "await Promise.resolve({ default: globalThis[Symbol.for('restart90.durable.test.driver')] })");
const { createDurableStore: fakeStore } = await import(`data:text/javascript;base64,${Buffer.from(instrumented).toString('base64')}`);
const SECRET = 'deterministic-test-only-project-secret-0001';
const duplicate = () => Object.assign(new Error('Synthetic duplicate'), { code: 'ER_DUP_ENTRY' });
const copy = (value) => structuredClone(value);

class MemoryMysql {
  constructor() {
    this.users = new Map(); this.cases = new Map(); this.members = new Map(); this.invites = new Map(); this.chat = new Map();
    this.calls = []; this.ended = false; this.sequence = 0; this.tail = Promise.resolve();
    this.createPool = (options) => { this.options = options; return this; };
  }
  authorized(uid, id, role) {
    const row = this.cases.get(id);
    if (!row) return false;
    return row.owner_uid === uid || (this.members.has(`${id}:${uid}`) && (!role || this.members.get(`${id}:${uid}`).role === role));
  }
  async execute(raw, params = []) {
    const sql = raw.replace(/\s+/g, ' ').trim();
    this.calls.push({ sql, params });
    let result;
    if (sql.startsWith('CREATE TABLE')) {
      if (this.failDDL) throw new Error('Synthetic schema failure');
      result = { affectedRows: 0 };
    } else if (sql.endsWith('LIMIT 0')) result = [];
    else if (sql.startsWith('INSERT INTO durable_users')) {
      const [uid, openId, name, email] = params;
      const existing = [...this.users.values()].find((u) => u.open_id === openId);
      if (existing) Object.assign(existing, { name, email });
      else this.users.set(uid, { uid, open_id: openId, name, email });
      result = { affectedRows: 1 };
    } else if (sql.startsWith('SELECT uid, open_id, name, email FROM durable_users')) {
      const column = sql.includes('WHERE open_id') ? 'open_id' : 'uid';
      result = [...this.users.values()].filter((u) => u[column] === params[0]).map(copy);
    } else if (sql.startsWith('INSERT INTO durable_cases')) {
      const [id, owner, timezone, startDate, snapshot] = params;
      if (this.cases.has(id)) throw duplicate();
      this.cases.set(id, { id, owner_uid: owner, timezone, plan_start_date: startDate, snapshot: Buffer.from(snapshot), revision: '1' });
      result = { affectedRows: 1 };
    } else if (sql.startsWith('SELECT c.*, m.role AS member_role')) {
      const [uid, id] = params;
      result = this.authorized(uid, id) ? [{ ...copy(this.cases.get(id)), member_role: this.members.get(`${id}:${uid}`)?.role || null }] : [];
    } else if (sql.startsWith('UPDATE durable_cases c SET snapshot')) {
      const [snapshot, id, revision, uid, , role] = params;
      const row = this.cases.get(id);
      const ok = row && row.revision === revision && this.authorized(uid, id, role);
      if (ok) { row.snapshot = Buffer.from(snapshot); row.revision = String(BigInt(row.revision) + 1n); }
      result = { affectedRows: ok ? 1 : 0 };
    } else if (sql.startsWith('SELECT c.id FROM durable_cases')) {
      result = [...this.cases.values()].filter((c) => this.authorized(params[0], c.id)).map((c) => ({ id: c.id }));
    } else if (sql.startsWith('INSERT INTO durable_invites')) {
      const [hash, role, caseId, uid] = params;
      const ok = this.cases.get(caseId)?.owner_uid === uid;
      if (ok) this.invites.set(Buffer.from(hash).toString('hex'), { token_hash: Buffer.from(hash), case_id: caseId, role, expires: Date.now() + 7 * 86400000, consumed_by: null });
      result = { affectedRows: ok ? 1 : 0 };
    } else if (sql.startsWith('SELECT i.case_id, i.role, c.owner_uid')) {
      const invite = this.invites.get(Buffer.from(params[0]).toString('hex'));
      result = invite && !invite.consumed_by && invite.expires > Date.now() ? [{ case_id: invite.case_id, role: invite.role, owner_uid: this.cases.get(invite.case_id).owner_uid }] : [];
    } else if (sql.startsWith('SELECT role FROM durable_case_members')) {
      const member = this.members.get(`${params[0]}:${params[1]}`);
      result = member ? [copy(member)] : [];
    } else if (sql.startsWith('INSERT INTO durable_case_members')) {
      const [case_id, uid, role] = params;
      const key = `${case_id}:${uid}`;
      if (this.members.has(key)) throw duplicate();
      this.members.set(key, { case_id, uid, role });
      result = { affectedRows: 1 };
    } else if (sql.startsWith('UPDATE durable_invites SET consumed_by')) {
      const [uid, hash] = params;
      const invite = this.invites.get(Buffer.from(hash).toString('hex'));
      const ok = invite && !invite.consumed_by && invite.expires > Date.now();
      if (ok) invite.consumed_by = uid;
      result = { affectedRows: ok ? 1 : 0 };
    } else if (sql.startsWith("SELECT u.uid, u.open_id, u.name, u.email, 'patient' AS role")) {
      const [caseId, uid] = params;
      result = this.cases.get(caseId)?.owner_uid === uid ? [
        { ...copy(this.users.get(uid)), role: 'patient' },
        ...[...this.members.values()].filter((m) => m.case_id === caseId).map((m) => ({ ...copy(this.users.get(m.uid)), role: m.role })),
      ] : [];
    } else if (sql.startsWith('DELETE m FROM durable_case_members')) {
      const [caseId, member, uid] = params;
      const ok = this.cases.get(caseId)?.owner_uid === uid && this.members.delete(`${caseId}:${member}`);
      result = { affectedRows: ok ? 1 : 0 };
    } else if (sql.startsWith('INSERT INTO durable_chat')) {
      const [id, uid, message, caseId] = params;
      const ok = this.authorized(uid, caseId);
      if (ok) this.chat.set(id, { id, uid, case_id: caseId, message: Buffer.from(message), seq: ++this.sequence });
      result = { affectedRows: ok ? 1 : 0 };
    } else if (sql.startsWith('SELECT h.id, h.message FROM durable_chat')) {
      const [caseId, uid] = params;
      result = this.authorized(uid, caseId) ? [...this.chat.values()].filter((h) => h.uid === uid && h.case_id === caseId).sort((a, b) => a.seq - b.seq).map(copy) : [];
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
        backup = copy({ members: fake.members, invites: fake.invites });
      },
      execute: (...args) => fake.execute(...args),
      async commit() { backup = null; },
      async rollback() { if (backup) { fake.members = backup.members; fake.invites = backup.invites; } },
      release() { unlock?.(); },
    };
  }
  async end() { this.ended = true; }
}

async function fixture(t, url = 'mysql://synthetic:synthetic@127.0.0.1/synthetic') {
  const driver = new MemoryMysql();
  globalThis[DRIVER] = driver;
  const store = fakeStore({ url, secret: SECRET });
  await store.init();
  const owner = await store.upsertUser({ openId: 'test-only-owner', name: 'Synthetic owner' });
  const family = await store.upsertUser({ openId: 'test-only-family' });
  const rehab = await store.upsertUser({ openId: 'test-only-rehab' });
  const outsider = await store.upsertUser({ openId: 'test-only-outsider' });
  const create = (user = owner) => store.createCase(user, async (db, namespace) => E.createPatient(db, { form: { name: 'Private synthetic name', dischargeDate: '2001-01-01' } }, namespace));
  const { id } = await create();
  t.after(async () => { await store.close(); delete globalThis[DRIVER]; });
  return { store, driver, owner, family, rehab, outsider, id, create };
}
const status = (code) => (e) => e.status === code;
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function fullSQLite() {
  const db = openDb(':memory:');
  const { id } = E.createPatient(db, { form: { name: '测试患者 — private', home: {}, dischargeDate: '2001-01-01' } }, 'namespace-private');
  db.prepare('INSERT INTO sandboxes (token, last_seen) VALUES (?, ?)').run('namespace-private', '2020-02-03 04:05:06');
  db.prepare('INSERT INTO pending (id,patient_id,ability,from_level,to_level,needs,day,reason,family_note) VALUES (7,?,?,?,?,?,?,?,?)').run(id, 'grooming', 1, 2, 'rehab', 1, '{"zh":"原因"}', '家庭说明');
  db.prepare('INSERT INTO pending (id,patient_id,ability,from_level,to_level,needs,day,reason) VALUES (100,?,?,?,?,?,?,?)').run(id, 'grooming', 1, 2, 'rehab', 1, '{}');
  db.prepare('DELETE FROM pending WHERE id = ?').run(100);
  db.prepare('INSERT INTO history (id,patient_id,day,ability,from_level,to_level,by_role,reason) VALUES (9,?,?,?,?,?,?,?)').run(id, 1, 'grooming', 1, 2, 'rehab', '{}');
  db.prepare('INSERT INTO logs (patient_id,day,task_id,kind,status,note,plan_when) VALUES (?,1,?,?,?,?,?)').run(id, 'ab:grooming', 'ability', 'done', '真实原话', 'morning');
  db.prepare('INSERT INTO checkins (patient_id,day,pain,note,private,parsed) VALUES (?,1,3,?,1,?)').run(id, '私人感受', '{"signals":[]}');
  db.prepare('INSERT INTO alerts (id,patient_id,day,signals,level,summary) VALUES (11,?,1,?,?,?)').run(id, '["pain"]', 'red', '{"zh":"联系医生"}');
  db.prepare('INSERT INTO notes (id,patient_id,day,role,text,private) VALUES (13,?,1,?,?,1)').run(id, 'rehab', '{"zh":"秘密记录"}');
  db.prepare('INSERT INTO reviews (patient_id,period,role,text) VALUES (?,?,?,?)').run(id, 'w1', 'patient', '复盘');
  E.snapshot(db, id, 1);
  E.createPatient(db, { form: { name: 'Not exported' } }, 'namespace-other');
  db.prepare('INSERT INTO sandboxes (token) VALUES (?)').run('namespace-other');
  return { db, id };
}

test('all 12 SQLite tables round-trip one patient, fields, explicit IDs, sequence and order', () => {
  const { db, id } = fullSQLite();
  try {
    const snapshot = exportSnapshot(db, id);
    assert.equal(Object.keys(snapshot.tables).length, 12);
    for (const rows of Object.values(snapshot.tables)) assert.ok(rows.length > 0);
    assert.equal(snapshot.tables.patients.length, 1);
    assert.equal(snapshot.tables.sandboxes.length, 1);
    assert.equal(snapshot.sequences.pending, 100);
    assert.equal(JSON.stringify(snapshot).includes('Not exported'), false);
    const restored = importSnapshot(snapshot);
    try {
      assert.deepEqual(exportSnapshot(restored, id), snapshot);
      assert.equal(restored.prepare('SELECT COUNT(*) n FROM patients').get().n, 1);
      assert.equal(E.patientState(restored, id, 'family').notes.length, 0);
      assert.equal(E.patientState(restored, id, 'family').checkin.note, null);
      const next = restored.prepare('INSERT INTO pending (patient_id,ability,from_level,to_level,needs,day,reason) VALUES (?,?,?,?,?,?,?)').run(id, 'grooming', 1, 2, 'rehab', 2, '{}');
      assert.equal(Number(next.lastInsertRowid), 101);
      assert.equal(E.advanceDay(restored, id).day, 2);
    } finally { restored.close(); }
  } finally { db.close(); }
});

test('snapshot import rejects identifier injection, foreign patients, missing/unknown fields and broken IDs', () => {
  const { db, id } = fullSQLite();
  try {
    const original = exportSnapshot(db, id);
    for (const mutate of [
      (s) => { s.tables['patients; DROP TABLE patients'] = []; },
      (s) => { s.tables.patients[0].unexpected = 'x'; },
      (s) => { delete s.tables.logs[0].plan_when; },
      (s) => { s.tables.notes[0].patient_id = 'someone-else'; },
      (s) => { s.tables.sandboxes[0].token = 'someone-else'; },
      (s) => { s.tables.patients.push(copy(s.tables.patients[0])); },
      (s) => { s.sequences.pending = 1; },
      (s) => { s.tables.alerts[0].id = -1; },
    ]) {
      const snapshot = copy(original); mutate(snapshot);
      assert.throws(() => importSnapshot(snapshot), status(400));
    }
    assert.equal(db.prepare('SELECT COUNT(*) n FROM patients').get().n, 2);
  } finally { db.close(); }
});

test('real interface stays closed without configuration, before init, after failed init and after close', async () => {
  const store = createDurableStore({ url: '', secret: '' });
  assert.equal(store.persistent, false);
  await assert.rejects(store.upsertUser({ openId: 'never-created' }), status(503));
  await assert.rejects(store.init(), status(503));
  assert.equal(store.persistent, false);
  await assert.rejects(store.init(), status(503));
  await store.close();
  const driver = new MemoryMysql(); driver.failDDL = true; globalThis[DRIVER] = driver;
  const failing = fakeStore({ url: 'mysql://fake:fake@localhost/fake', secret: SECRET });
  await assert.rejects(failing.init(), status(503));
  assert.equal(driver.ended, true); assert.equal(failing.persistent, false);
  await failing.close(); delete globalThis[DRIVER];
});

test('schema initialization is additive/idempotent; remote TLS cannot be disabled; close clears availability', async (t) => {
  const { store, driver } = await fixture(t, 'mysql://fake:fake@remote.example.invalid/fake?ssl=false&rejectUnauthorized=false');
  const creates = driver.calls.filter((c) => c.sql.startsWith('CREATE TABLE'));
  assert.equal(creates.length, 5);
  assert.ok(creates.every((c) => c.sql.includes('IF NOT EXISTS')));
  await store.init(); assert.equal(driver.calls.filter((c) => c.sql.startsWith('CREATE TABLE')).length, 5);
  assert.equal(driver.options.ssl.rejectUnauthorized, true);
  assert.equal(driver.options.ssl.verifyIdentity, true);
  assert.equal(driver.options.multipleStatements, false);
  assert.equal(store.persistent, true);
  await store.close(); assert.equal(store.persistent, false);
  await assert.rejects(store.init(), status(503));
});

test('stable generic identities/namespaces, engine-created IDs, real start dates and encrypted snapshots', async (t) => {
  const { store, driver, owner, id } = await fixture(t);
  const same = await store.upsertUser({ openId: owner.openId, name: 'Updated' });
  assert.equal(same.uid, owner.uid);
  const namespaces = [];
  for (let i = 0; i < 2; i++) {
    const result = await store.createCase(owner, async (db, namespace) => { namespaces.push(namespace); return E.createPatient(db, { form: { name: 'Synthetic' } }, namespace); });
    assert.equal(result.accessRole, 'patient');
  }
  assert.equal(namespaces[0], namespaces[1]);
  assert.match(namespaces[0], /^[a-f0-9]{64}$/);
  const row = driver.cases.get(id);
  assert.equal(row.plan_start_date, new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  assert.notEqual(row.plan_start_date, '2001-01-01');
  assert.equal(row.revision, '1');
  assert.equal(row.snapshot.includes(Buffer.from('Private synthetic name')), false);
  const read = await store.withCase(owner, id, {}, async (db, access) => ({ profile: E.getPatientRow(db, id).profile, access }));
  assert.equal(read.profile.dischargeDate, '2001-01-01');
  assert.deepEqual(read.access, { role: 'patient', ownerId: owner.uid, timezone: 'Asia/Shanghai', startDate: row.plan_start_date, isOwner: true });
  await assert.rejects(store.withCase(owner, id, { requestedRole: 'rehab' }, async () => {}), status(403));
  await assert.rejects(store.withCase({ uid: owner.uid, openId: 'forged-identity' }, id, {}, async () => {}), status(401));
  await assert.rejects(store.createCase(owner, async () => ({ id: 'invented' })), status(400));
  await assert.rejects(store.createCase(owner, async (db, ns) => E.createPatient(db, { form: {} }, ns), { timezone: 'Mars/Nowhere' }), status(400));
});

test('owners/members are fixed roles; outsiders cannot access IDs, lists, invitations, members or chat', async (t) => {
  const { store, owner, family, rehab, outsider, id, create } = await fixture(t);
  await assert.rejects(store.withCase(outsider, id, {}, async () => 'leak'), status(404));
  await assert.rejects(store.getChat(outsider, id), status(404));
  await assert.rejects(store.appendChat(outsider, id, { role: 'user', text: 'not permitted' }), status(404));
  assert.deepEqual(await store.listCases(outsider, async () => 'leak'), []);
  await assert.rejects(store.createInvite(owner, id, 'patient'), status(400));
  const invite = await store.createInvite(owner, id, 'family');
  assert.deepEqual(Object.keys(invite).sort(), ['caseId', 'token']);
  await assert.rejects(store.acceptInvite(owner, invite.token), status(403));
  assert.deepEqual(await store.acceptInvite(family, invite.token), { caseId: id, role: 'family' });
  await assert.rejects(store.acceptInvite(rehab, invite.token), status(410));
  const familyRole = await store.withCase(family, id, { requestedRole: 'family' }, async (_, access) => access);
  assert.equal(familyRole.role, 'family'); assert.equal(familyRole.isOwner, false);
  await assert.rejects(store.withCase(family, id, { requestedRole: 'rehab' }, async () => {}), status(403));
  await assert.rejects(store.getMembers(family, id), status(403));
  await assert.rejects(store.createInvite(family, id, 'rehab'), status(403));
  await assert.rejects(store.revokeMember(family, id, owner.uid), status(403));
  const otherRole = await store.createInvite(owner, id, 'rehab');
  await assert.rejects(store.acceptInvite(family, otherRole.token), status(409));
  await store.acceptInvite(rehab, otherRole.token);
  assert.deepEqual((await store.getMembers(owner, id)).map((m) => m.role).sort(), ['family', 'patient', 'rehab']);
  await create(outsider);
  const summaries = await store.listCases(family, async (db, access) => ({ ...E.rehabOverview(db)[0], accessRole: access.role }));
  assert.equal(summaries.length, 1); assert.equal(summaries[0].id, id); assert.equal(summaries[0].accessRole, 'family');
  assert.deepEqual(await store.revokeMember(owner, id, family.uid), { ok: true, revoked: true });
  await assert.rejects(store.withCase(family, id, {}, async () => {}), status(404));
  await assert.rejects(store.appendChat(family, id, { role: 'user', text: 'revoked' }), status(404));
  assert.deepEqual(await store.listCases(family, async () => 'leak'), []);
});

test('invite hashes only, seven-day expiry, atomic one-use consumption and rollback', async (t) => {
  const { store, driver, owner, family, rehab, id } = await fixture(t);
  const expired = await store.createInvite(owner, id, 'family');
  const record = driver.invites.get(hashToken(expired.token));
  assert.equal(record.token_hash.length, 32);
  assert.ok(Math.abs(record.expires - Date.now() - 7 * 86400000) < 1000);
  assert.equal(Object.values(record).includes(expired.token), false);
  record.expires = Date.now() - 1;
  await assert.rejects(store.acceptInvite(family, expired.token), status(410));
  assert.equal(driver.members.size, 0);
  const one = await store.createInvite(owner, id, 'rehab');
  const results = await Promise.allSettled([store.acceptInvite(family, one.token), store.acceptInvite(rehab, one.token)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.status === 410).length, 1);
  assert.equal(driver.members.size, 1);
});

test('optimistic revision CAS prevents overwrites and closes memory DBs; false-write mutations do not retry', async (t) => {
  const { store, driver, owner, id } = await fixture(t);
  const waiting = deferred(), finish = deferred();
  let staleDb, staleCalls = 0;
  const stale = store.withCase(owner, id, { write: false }, async (db) => {
    staleDb = db; staleCalls++;
    db.prepare('UPDATE patients SET baseline_pain = ? WHERE id = ?').run(8, id);
    waiting.resolve(); await finish.promise; return 'stale';
  });
  await waiting.promise;
  await store.withCase(owner, id, { write: true }, async (db) => db.prepare('UPDATE patients SET baseline_pain = ? WHERE id = ?').run(4, id));
  finish.resolve();
  await assert.rejects(stale, status(409));
  assert.equal(staleCalls, 1);
  assert.throws(() => staleDb.prepare('SELECT 1'), /closed|not open/i);
  assert.equal(driver.cases.get(id).revision, '2');
  assert.equal(await store.withCase(owner, id, {}, async (db) => E.getPatientRow(db, id).baseline_pain), 4);
  let failedDb;
  await assert.rejects(store.withCase(owner, id, { write: true }, async (db) => { failedDb = db; throw new Error('Callback failure'); }), /Callback failure/);
  assert.throws(() => failedDb.prepare('SELECT 1'), /closed|not open/i);
  assert.equal(driver.cases.get(id).revision, '2');
  let createdDb;
  await assert.rejects(store.createCase(owner, async (db) => { createdDb = db; throw new Error('Create failure'); }), /Create failure/);
  assert.throws(() => createdDb.prepare('SELECT 1'), /closed|not open/i);
});

test('only genuinely unchanged read callbacks retry safely after concurrent revisions', async (t) => {
  const { store, owner, id } = await fixture(t);
  const waiting = deferred(), finish = deferred();
  let count = 0; const readDbs = [];
  const reading = store.withCase(owner, id, { write: false }, async (db) => {
    readDbs.push(db); count++;
    const pain = E.getPatientRow(db, id).baseline_pain;
    if (count === 1) { waiting.resolve(); await finish.promise; }
    return pain;
  });
  await waiting.promise;
  await store.withCase(owner, id, { write: true }, async (db) => db.prepare('UPDATE patients SET baseline_pain = 5 WHERE id = ?').run(id));
  finish.resolve(); assert.equal(await reading, 5); assert.equal(count, 2);
  for (const db of readDbs) assert.throws(() => db.prepare('SELECT 1'), /closed|not open/i);
});

test('member revocation during an awaited callback prevents both return and persistence', async (t) => {
  const { store, driver, owner, family, id } = await fixture(t);
  const invite = await store.createInvite(owner, id, 'family'); await store.acceptInvite(family, invite.token);
  const waiting = deferred(), finish = deferred();
  const operation = store.withCase(family, id, { write: true }, async (db) => {
    db.prepare('UPDATE patients SET baseline_pain = 9 WHERE id = ?').run(id);
    waiting.resolve(); await finish.promise; return 'must not return';
  });
  await waiting.promise; await store.revokeMember(owner, id, family.uid); finish.resolve();
  await assert.rejects(operation, status(404)); assert.equal(driver.cases.get(id).revision, '1');
});

test('private chat is encrypted, ordered and scoped to case+uid; ciphertext is bound to its purpose and record', async (t) => {
  const { store, driver, owner, family, id, create } = await fixture(t);
  const invite = await store.createInvite(owner, id, 'family'); await store.acceptInvite(family, invite.token);
  await store.appendChat(owner, id, { role: 'user', text: 'owner private secret 中文' });
  await store.appendChat(owner, id, { role: 'assistant', text: 'owner reply' });
  await store.appendChat(family, id, { role: 'user', text: 'family private secret' });
  assert.deepEqual(await store.getChat(owner, id), [{ role: 'user', text: 'owner private secret 中文' }, { role: 'assistant', text: 'owner reply' }]);
  assert.deepEqual(await store.getChat(family, id), [{ role: 'user', text: 'family private secret' }]);
  const { id: second } = await create(); assert.deepEqual(await store.getChat(owner, second), []);
  assert.ok([...driver.chat.values()].every((r) => !Buffer.from(r.message).includes(Buffer.from('private secret'))));
  await assert.rejects(store.appendChat(owner, id, { role: 'rehab', text: 'role spoof' }), status(400));
  await assert.rejects(store.appendChat(owner, id, { role: 'user', text: ' ' }), status(400));
  const familyMessage = [...driver.chat.values()].find((r) => r.uid === family.uid);
  const originalUid = familyMessage.uid; familyMessage.uid = owner.uid;
  await assert.rejects(store.getChat(owner, id), status(503)); familyMessage.uid = originalUid;
  const row = driver.cases.get(id); const original = row.snapshot;
  row.snapshot = Buffer.from([...driver.chat.values()][0].message);
  await assert.rejects(store.withCase(owner, id, {}, async () => 'leak'), status(503)); row.snapshot = original;
  const corrupt = Buffer.from(original); corrupt[corrupt.length - 1] ^= 1; row.snapshot = corrupt;
  await assert.rejects(store.withCase(owner, id, {}, async () => 'leak'), status(503)); row.snapshot = original;
  const other = driver.cases.get(second); const otherOriginal = other.snapshot; other.snapshot = original;
  await assert.rejects(store.withCase(owner, second, {}, async () => 'leak'), status(503)); other.snapshot = otherOriginal;
  await store.revokeMember(owner, id, family.uid);
  await assert.rejects(store.getChat(family, id), status(404));
});
