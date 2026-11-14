import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { once } from 'node:events';
import * as E from '../lib/engine.js';

// Run the exact production server/auth/durable code. ONLY mysql2's dependency
// boundary is replaced with existing deterministic SQL fixtures. No managed DB
// connection, Preview identity, body identity bypass or real test account seeds.
const ROOT = new URL('..', import.meta.url);
const source = (file) => fs.readFileSync(new URL(file, ROOT), 'utf8');
const dataModule = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const classSource = (file, ending) => {
  const text = source(file);
  const start = text.indexOf('class MemoryMysql {');
  const end = text.indexOf(ending, start);
  assert.ok(start > 0 && end > start, 'SQL fixture class boundaries');
  return text.slice(start, end);
};
function drivers() {
  const DurableDriver = new Function('crypto', `const duplicate=()=>Object.assign(new Error('Synthetic duplicate'),{code:'ER_DUP_ENTRY'}); const copy=v=>structuredClone(v); ${classSource('test/durable.test.js', '\nasync function fixture')} return MemoryMysql;`)(crypto);
  const AuthDriver = new Function('assert', `const clone=v=>structuredClone(v); const hex=v=>Buffer.from(v).toString('hex'); ${classSource('test/phone-auth.test.js', '\nclass Browser')} return MemoryMysql;`)(assert);
  return { durable: new DurableDriver(), auth: new AuthDriver() };
}
async function fixture(t, ready = true) {
  const d = drivers();
  const key = `restart90-server-test-${crypto.randomUUID()}`;
  globalThis[key] = d;
  const importModule = (file, kind) => {
    const text = source(file).replace(/from '(\.\/[^']+)'/g, (_, p) => `from '${new URL(p, new URL(file, ROOT)).href}'`)
      .replace("await import('mysql2/promise')", `await Promise.resolve({default:globalThis[${JSON.stringify(key)}].${kind}})`);
    return dataModule(text);
  };
  const serverSource = source('server.js')
    .replace("from './lib/durable.js'", `from '${importModule('lib/durable.js', 'durable')}'`)
    .replace("from './lib/phone-auth.js'", `from '${importModule('lib/phone-auth.js', 'auth')}'`)
    .replace(/from '(\.\/[^']+)'/g, (_, p) => `from '${new URL(p, ROOT).href}'`)
    .replace('const here = path.dirname(fileURLToPath(import.meta.url));', `const here = ${JSON.stringify(new URL('.', ROOT).pathname.replace(/\/$/, ''))};`)
    .replace('const demoDb = openDb();', "const demoDb = openDb(':memory:');")
    .replace(/const PORT = .*;/, 'const PORT = 0;')
    .replace(/const HOST = .*;/, "const HOST = '127.0.0.1';")
    .replace(/const accountConfig = .*;/, `const accountConfig = {url:'mysql://synthetic:synthetic@127.0.0.1/synthetic',secret:${JSON.stringify(ready ? 'synthetic-test-only-long-stable-project-secret' : 'short')}};`);
  const previousSignals = Object.fromEntries(['SIGTERM', 'SIGINT'].map((sig) => [sig, new Set(process.listeners(sig))]));
  await import(dataModule(`${serverSource}\nglobalThis[${JSON.stringify(key)}].runtime={server,demoDb,durable,auth,accountInit,calendarOf};\n`));
  const runtime = d.runtime;
  if (!runtime.server.listening) await once(runtime.server, 'listening');
  await runtime.accountInit;
  const base = `http://127.0.0.1:${runtime.server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => runtime.server.close(resolve));
    await Promise.allSettled([runtime.durable.close(), runtime.auth.close()]);
    runtime.demoDb.close();
    for (const sig of ['SIGTERM', 'SIGINT']) for (const listener of process.listeners(sig)) if (!previousSignals[sig].has(listener)) process.removeListener(sig, listener);
    delete globalThis[key];
  });
  class Browser {
    constructor() { this.cookies = new Map(); this.csrf = ''; }
    async request(path, body, headers = {}) {
      const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST',
        headers: { Cookie: [...this.cookies].map(([k,v]) => `${k}=${v}`).join('; '), 'Content-Type': 'application/json', ...(this.csrf ? { 'X-CSRF-Token': this.csrf } : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      for (const cookie of response.headers.getSetCookie()) {
        const first = cookie.split(';')[0], at = first.indexOf('=');
        const name = first.slice(0, at), value = first.slice(at + 1);
        if (value) this.cookies.set(name, value); else this.cookies.delete(name);
      }
      const text = await response.text();
      let out; try { out = JSON.parse(text); } catch { out = text; }
      if (out?.csrfToken) this.csrf = out.csrfToken;
      return { status: response.status, out, headers: response.headers };
    }
    async register(phone) {
      assert.equal((await this.request('/api/account/session')).status, 200);
      const result = await this.request('/api/account/register', { phone, password: 'synthetic passphrase for tests only' });
      assert.equal(result.status, 200);
      const session = await this.request('/api/account/session');
      assert.equal(session.out.user.openId, result.out.user.openId);
      return result.out;
    }
    daily(id, suffix, body, day = 1) { return this.request(`/api/patients/${id}/${suffix}`, body, { 'X-Restart90-Day': String(day) }); }
  }
  return { ...runtime, driverDurable: d.durable, driverAuth: d.auth, base, Browser };
}

test('private server access: real password sessions, roles, calendar, privacy and own chat (isolated SQL)', async (t) => {
  const f = await fixture(t);
  const guest = new f.Browser(), owner = new f.Browser(), family = new f.Browser(), rehab = new f.Browser(), outsider = new f.Browser();
  let id, ownerIdentity, recoveryCode;
  await t.test('anonymous and fake Preview identity remain logged out; public demo remains fully callable', async () => {
    const anon = await guest.request('/api/account/session');
    assert.equal(anon.out.user, null); assert.equal(anon.out.persistent, true); assert.equal(anon.out.accountReady, true);
    assert.equal(anon.headers.get('cache-control'), 'no-store');
    const fake = await guest.request('/api/account/session', undefined, { Cookie: 'webdev_app_session=forged; app_session_id=forged', Authorization: 'Bearer forged' });
    assert.equal(fake.out.user, null);
    assert.equal((await guest.request('/api/patients', { form: { name: 'Forbidden' }, openId: 'forged' })).status, 401);
    const list = await guest.request('/api/patients'); assert.equal(list.out[0].id, 'demo-lin');
    const state = await guest.request('/api/patients/demo-lin'); assert.equal(state.out.day, 9);
    assert.equal((await guest.request('/api/patients/demo-lin/advance', {})).out.day, 10);
    const demoChat = await guest.request('/api/patients/demo-lin/agent', { intent: 'today' }); assert.ok(demoChat.out.reply.zh);
    // A preserved pre-account wizard profile remains browser-local, including after reset.
    const sb = guest.cookies.get('rs90sb');
    const legacy = E.createPatient(f.demoDb, { form: { name: 'Old synthetic browser profile' } }, sb);
    assert.equal((await guest.request(`/api/patients/${legacy.id}`)).status, 200);
    await guest.request('/api/demo/reset', {});
    assert.equal((await guest.request(`/api/patients/${legacy.id}`)).status, 200);
  });
  await t.test('signup establishes stable UUID session; new case exists only in encrypted durable storage', async () => {
    const account = await owner.register('13800138001');
    ownerIdentity = account.user.openId; recoveryCode = account.recoveryCode;
    assert.match(account.user.openId, /^[0-9a-f-]{36}$/); assert.equal(account.user.phoneVerified, false); assert.equal(account.user.email, '');
    await family.register('13800138002'); await rehab.register('13800138003'); await outsider.register('13800138004');
    assert.equal((await owner.request('/api/patients', { form: { name: 'No CSRF' } }, { 'X-CSRF-Token': '' })).status, 403);
    const created = await owner.request('/api/patients', { form: { name: 'Private synthetic case', dischargeDate: '2001-01-01' }, timezone: 'Not/A_Zone', openId: 'forged' });
    assert.equal(created.status, 200); id = created.out.id;
    assert.equal(created.out.private, true); assert.equal(created.out.owner, true); assert.equal(created.out.accessRole, 'patient');
    assert.equal(created.out.timezone, 'Asia/Shanghai');
    assert.equal(f.demoDb.prepare('SELECT id FROM patients WHERE id = ?').get(id), undefined);
    assert.ok(f.driverDurable.cases.get(id).snapshot.length > 30);
    assert.equal(Buffer.from(f.driverDurable.cases.get(id).snapshot).includes(Buffer.from('Private synthetic case')), false);
    const state = await owner.request(`/api/patients/${id}`); assert.equal(state.out.day, 1); assert.equal(state.out.id, id);
    assert.equal(state.out.planConfirmed, false); assert.equal(state.headers.get('cache-control'), 'no-store');
    assert.equal(state.out.date, state.out.calendarDate); assert.equal(state.out.profile.dischargeDate, '2001-01-01');
    assert.equal(state.out.dayBasis, 'recording'); assert.equal(state.out.recordingDay, 1);
    assert.equal((await guest.request(`/api/patients/${id}`)).status, 401);
    assert.equal((await outsider.request(`/api/patients/${id}`)).status, 404);
    assert.equal((await owner.request(`/api/patients/${id}?role=rehab`)).status, 403);
    const list = await owner.request('/api/patients'); assert.ok(list.out.some((p) => p.id === id && p.private && p.owner));
  });
  await t.test('owner invites fixed family/rehab roles; tokens are single-use and member administration is owner-only', async () => {
    assert.equal((await owner.request(`/api/patients/${id}/invites`, { role: 'patient' })).status, 400);
    const inviteFamily = await owner.request(`/api/patients/${id}/invites`, { role: 'family' });
    const inviteRehab = await owner.request(`/api/patients/${id}/invites`, { role: 'rehab' });
    const ownAccept = await owner.request('/api/invites/accept', { token: inviteFamily.out.token }); assert.equal(ownAccept.status, 403);
    const accepted = await family.request('/api/invites/accept', { token: inviteFamily.out.token });
    assert.equal(accepted.out.caseId, id); assert.equal(accepted.out.role, 'family');
    assert.equal((await outsider.request('/api/invites/accept', { token: inviteFamily.out.token })).status, 410);
    assert.equal((await rehab.request('/api/invites/accept', { token: inviteRehab.out.token })).out.role, 'rehab');
    assert.equal((await family.request(`/api/patients/${id}/members`)).status, 403);
    assert.equal((await family.request(`/api/patients/${id}/invites`, { role: 'rehab' })).status, 403);
    const members = await owner.request(`/api/patients/${id}/members`); assert.equal(members.out.length, 3);
    const fs = await family.request(`/api/patients/${id}?role=family`); assert.equal(fs.out.accessRole, 'family'); assert.equal(fs.out.owner, false);
    assert.equal((await family.request(`/api/patients/${id}?role=patient`)).status, 403);
  });
  await t.test('daily writes enforce CSRF/day/actual role; notes and reviews cannot impersonate role', async () => {
    assert.equal((await owner.request(`/api/patients/${id}/logs`, { taskId: 'ab:limbcare', status: 'done' })).status, 409);
    assert.equal((await owner.daily(id, 'logs', { taskId: 'ab:limbcare', status: 'done' }, 2)).status, 409);
    assert.equal((await owner.daily(id, 'logs', { taskId: 'ab:limbcare', status: 'done' })).status, 200);
    for (const [who, suffix, body] of [[family,'logs',{taskId:'ab:limbcare',status:'done'}],[rehab,'checkin',{pain:3}],[owner,'help',{taskId:'ab:limbcare',help:1}],[owner,'confirm-plan',{}],[family,'abilities/limbcare',{action:'up'}],[family,'alerts/1/resolve',{}]]) {
      assert.equal((await who.daily(id, suffix, body)).status, 403, suffix);
    }
    assert.equal((await family.daily(id, 'help', { taskId: 'ab:limbcare', help: 1 })).status, 200);
    assert.equal((await family.daily(id, 'todos/nightLight', { done: true })).status, 200);
    assert.equal((await rehab.daily(id, 'confirm-plan', { note: 'Synthetic authorization only' })).status, 200);
    assert.equal((await owner.request(`/api/patients/${id}/advance`, {})).status, 403);
    assert.equal((await owner.daily(id, 'notes', { role: 'rehab', text: 'PRIVATE_MARKER_924', private: true })).status, 200);
    await family.daily(id, 'notes', { role: 'patient', text: 'Family actual role' });
    const state = await owner.request(`/api/patients/${id}`);
    assert.equal(state.out.notes.find((n) => n.text.zh === 'PRIVATE_MARKER_924').role, 'patient');
    assert.equal(state.out.notes.find((n) => n.text.zh === 'Family actual role').role, 'family');
    await owner.request(`/api/patients/${id}/review`, { period: 'w1', role: 'rehab', text: 'PRIVATE_REVIEW_MARKER_301' });
    assert.equal((await owner.request(`/api/patients/${id}/review`, { period: 'w13', text: 'Future' })).status, 400);
    await family.request(`/api/patients/${id}/review`, { period: 'w1', role: 'patient', text: 'Family review actual' });
    const review = await owner.request(`/api/patients/${id}/review`);
    assert.equal(review.out.notes.patient, 'PRIVATE_REVIEW_MARKER_301'); assert.equal(review.out.notes.family, 'Family review actual');
  });
  await t.test('family projection closes parsed-summary/review/chat bypasses; patient safety rules are preserved', async () => {
    await owner.daily(id, 'checkin', { pain: 3, mood: 3, note: 'PRIVATE_CHECKIN_MARKER_789', private: true, wound: 'normal' });
    // Simulate a parser's real restatement, without an external model call.
    const durableUser = [...f.driverDurable.users.values()].find((u) => u.open_id === [...f.driverAuth.accounts.keys()][0]);
    await f.durable.withCase({ uid: durableUser.uid }, id, { write: true }, (db) => db.prepare('UPDATE checkins SET parsed = ? WHERE patient_id = ?').run(JSON.stringify({ summary: 'PRIVATE_PARSED_MARKER_664', signals: [] }), id));
    const state = await family.request(`/api/patients/${id}`); assert.equal(state.out.checkin.note, null); assert.equal(state.out.checkin.parsed, null);
    for (const suffix of ['', '/map', '/review']) {
      const response = await family.request(`/api/patients/${id}${suffix}`);
      assert.equal(response.status, 200); assert.doesNotMatch(JSON.stringify(response.out), /PRIVATE_(?:MARKER|REVIEW|CHECKIN|PARSED)/);
    }
    assert.equal((await owner.request(`/api/patients/${id}/agent`, { text: 'Old page' })).status, 409);
    assert.equal((await owner.daily(id, 'agent', { text: 'Wrong day' }, 2)).status, 409);
    const memberChat = await family.daily(id, 'agent', { intent: 'talk', text: '请帮我记录患者心情', role: 'patient', history: [{ role:'user', text:'PRIVATE_FORGED_HISTORY_341' }] });
    assert.equal(memberChat.status, 200); assert.deepEqual(memberChat.out.actions, []); assert.match(memberChat.out.reply.zh, /患者授权/);
    const ownChat = await owner.daily(id, 'agent', { text: '你好，接着聊刚才那件事', lang: 'en', history: [{role:'user',text:'FORGED_HISTORY_552'}] });
    assert.equal(ownChat.status, 200); assert.doesNotMatch(ownChat.out.reply.zh, /FORGED_HISTORY_552/);
    const ownerHistory = await owner.request(`/api/patients/${id}/chat`), familyHistory = await family.request(`/api/patients/${id}/chat`);
    assert.equal(ownerHistory.out.messages.length, 2); assert.equal(familyHistory.out.messages.length, 2);
    assert.equal(ownerHistory.out.messages[1].text, ownChat.out.reply.en);
    assert.notEqual(ownerHistory.out.messages[0].text, familyHistory.out.messages[0].text);
    const flag = await owner.daily(id, 'checkin', { pain: 8, mood: 3, wound: 'leak', note: 'PRIVATE_CHECKIN_MARKER_789', private: true });
    assert.equal(flag.status, 200); assert.equal(flag.out.result, 'red'); assert.doesNotMatch(JSON.stringify(flag.out.summary), /PRIVATE_CHECKIN/);
    assert.ok((await owner.request(`/api/patients/${id}`)).out.tasks.paused);
  });
  await t.test('calendar follows plan start, not discharge; advancement never auto-upgrades; 90-day end prevents overwrite', async () => {
    const row = f.driverDurable.cases.get(id);
    const original = row.plan_start_date;
    const yesterday = new Date(`${original}T00:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1); row.plan_start_date = yesterday.toISOString().slice(0,10);
    assert.equal((await owner.daily(id, 'logs', {taskId:'ab:limbcare',status:'done'}, 1)).status, 409);
    const state = await owner.request(`/api/patients/${id}`); assert.equal(state.out.day, 2); assert.equal(state.out.calendarEnded, false);
    assert.equal(state.out.abilities.find((a) => a.id === 'limbcare').level, 1);
    const ago = new Date(`${original}T00:00:00Z`); ago.setUTCDate(ago.getUTCDate() - 90); row.plan_start_date = ago.toISOString().slice(0,10);
    const ended = await owner.request(`/api/patients/${id}`); assert.equal(ended.out.day, 90); assert.equal(ended.out.calendarEnded, true);
    assert.equal((await owner.daily(id, 'checkin', {pain:1}, 90)).status, 409);
    assert.equal((await owner.daily(id, 'agent', {text:'Daily safety report'}, 90)).status, 409);
    assert.equal((await owner.request(`/api/patients/${id}/review`, {period:'m3',text:'End review'})).status, 200);
    assert.equal((await owner.request(`/api/patients/${id}`)).out.day, 90);
  });
  await t.test('revocation removes all access including chat and listings; logout invalidates session', async () => {
    const members = await owner.request(`/api/patients/${id}/members`);
    const uid = members.out.find((m) => m.role === 'family').uid;
    assert.equal((await family.request(`/api/patients/${id}/members/revoke`, { uid })).status, 403);
    assert.equal((await owner.request(`/api/patients/${id}/members/revoke`, { uid })).status, 200);
    assert.equal((await family.request(`/api/patients/${id}/chat`)).status, 404);
    assert.equal((await family.request('/api/patients')).out.some((p) => p.id === id), false);
    assert.equal((await owner.request('/api/account/logout', {}, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await owner.request('/api/account/logout', {})).status, 200);
    assert.equal((await owner.request('/api/account/session')).out.user, null);
    assert.equal((await owner.request(`/api/patients/${id}`)).status, 401);
    const login = await owner.request('/api/account/login', {phone:'13800138001',password:'synthetic passphrase for tests only'});
    assert.equal(login.status, 200); assert.equal(login.out.user.openId, ownerIdentity);
    const freshSession = await owner.request('/api/account/session'); assert.equal(freshSession.out.user.openId, ownerIdentity);
    await owner.request('/api/account/logout', {});
    const recovered = await owner.request('/api/account/recover', {phone:'13800138001',recoveryCode,newPassword:'another synthetic long passphrase'});
    assert.equal(recovered.status, 200); assert.equal(recovered.out.user.openId, ownerIdentity);
    assert.ok(recovered.out.recoveryCode); assert.notEqual(recovered.out.recoveryCode, recoveryCode);
    assert.equal((await owner.request(`/api/patients/${id}`)).status, 200);
  });
});

test('initialization fails closed, public demonstration remains available', async (t) => {
  const f = await fixture(t, false), browser = new f.Browser();
  const health = await browser.request('/api/health');
  assert.equal(health.out.ok, true); assert.equal(health.out.ready, false); assert.equal(health.out.persistent, false);
  assert.equal((await browser.request('/api/account/session')).status, 503);
  assert.equal((await browser.request('/api/patients')).out[0].id, 'demo-lin');
  assert.equal((await browser.request('/api/patients/private-case')).status, 503);
  assert.equal((await browser.request('/api/patients', {form:{name:'Not durable'}})).status, 503);
});
