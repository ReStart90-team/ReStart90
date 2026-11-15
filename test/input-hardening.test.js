import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../lib/db.js';
import * as E from '../lib/engine.js';

process.env.RESTART90_OFFLINE = '1';

function fresh() {
  const db = openDb(':memory:');
  E.seedDemo(db);
  return { db, id: E.DEMO_ID };
}
const status = (code) => (e) => e.status === code;

test('engine rejects non-string free text with 400 instead of crashing or storing [object Object]', () => {
  const { db, id } = fresh();
  assert.throws(() => E.addNote(db, id, { role: 'family', text: 5 }), status(400));
  assert.throws(() => E.addNote(db, id, { role: 'family', text: { zh: 'x' } }), status(400));
  assert.throws(() => E.saveReview(db, id, { period: 'w1', role: 'patient', text: [1] }), status(400));
  assert.throws(() => E.saveReview(db, id, { period: ['w1'], role: 'patient', text: '' }), status(400));
  assert.throws(() => E.adjustAbility(db, id, 'grooming', { action: 'up', note: { x: 1 } }), status(400));
  assert.throws(() => E.confirmPlan(db, id, { note: 1 }), status(400));
  assert.throws(() => E.logTask(db, id, { taskId: 'ab:grooming', status: 'done', note: {} }), status(400));
  assert.throws(() => E.agentReply(db, id, { intent: 'talk', text: {} }), status(400));
  // Nothing was written by the rejected calls.
  assert.equal(E.levelsOf(db, id).grooming.level, 1);
});

test('check-in validates symptoms, wound and note before writing', () => {
  const { db, id } = fresh();
  assert.throws(() => E.checkin(db, id, { pain: 3, symptoms: 'fever' }), status(400));
  assert.throws(() => E.checkin(db, id, { pain: 3, wound: { leak: true } }), status(400));
  assert.throws(() => E.checkin(db, id, { pain: 3, note: 'a'.repeat(E.MAX_NOTE + 1) }), status(413));
  const ok = E.checkin(db, id, { pain: 3, mood: 4, symptoms: [], wound: 'normal', note: 'fine' });
  assert.ok(ok);
  // Unknown wound strings still fail safe: anything other than "normal" is a wound signal.
  assert.deepEqual(E.checkin(db, id, { pain: 3, wound: 'odd' }).signals, ['wound']);
});

test('createPatient rejects a missing or malformed form with 400', () => {
  const db = openDb(':memory:');
  assert.throws(() => E.createPatient(db, {}), status(400));
  assert.throws(() => E.createPatient(db, { form: [] }), status(400));
  assert.throws(() => E.createPatient(db, { form: { home: 'x' } }), status(400));
  assert.throws(() => E.createPatient(db, { form: { name: { a: 1 } } }), status(400));
  assert.throws(() => E.createPatient(db, { form: { goals: 'grooming' } }), status(400));
  assert.ok(E.createPatient(db, { form: { name: 'Test', goals: ['grooming'], home: {} } }).id);
});

test('a near-limit rehab note is accepted even though the stored note gets an ability-name prefix', () => {
  const { db, id } = fresh();
  E.adjustAbility(db, id, 'grooming', { action: 'up', note: 'a'.repeat(E.MAX_NOTE) });
  assert.equal(E.levelsOf(db, id).grooming.level, 2);
});

test('discharge dates must be real calendar dates; bad stored dates never break reads', () => {
  const db = openDb(':memory:');
  for (const bad of ['garbage', '2026-13-45', '2026-02-30', { a: 1 }]) {
    assert.throws(() => E.createPatient(db, { form: { dischargeDate: bad, home: {} } }), status(400));
  }
  // Model/regex-extracted dates that are not real dates fall back instead of failing.
  const { id } = E.createPatient(db, { extraction: { dischargeDate: '2026/10/14', surgeryDate: 'soon' }, form: { dischargeDate: '2026-10-20', home: {} } });
  const st = E.patientState(db, id);
  assert.equal(st.profile.dischargeDate, '2026-10-20');
  assert.equal(st.profile.surgeryDate, '');
  // A record already holding a bad date (written before this check) still loads.
  db.prepare('UPDATE patients SET profile = json_set(profile, \'$.dischargeDate\', \'garbage\') WHERE id = ?').run(id);
  assert.ok(E.patientState(db, id));
});

test('server answers malformed URLs and bodies with 4xx, never 500', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'restart90-hardening-'));
  const port = 41000 + Math.floor(Math.random() * 9000);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', RESTART90_DB: path.join(dir, 'demo.db'), DATABASE_URL: '', RESTART90_OFFLINE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stderr.on('data', (c) => { log += c; });
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dir, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (c) => { log += c; if (log.includes('running at')) resolve(); });
    child.once('exit', () => reject(new Error(`server exited: ${log}`)));
  });
  const url = `http://127.0.0.1:${port}`;
  const first = await fetch(`${url}/api/patients`);
  const cookie = first.headers.get('set-cookie').split(';')[0];
  const post = (p, body) => fetch(`${url}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });

  assert.equal((await fetch(`${url}/%E0%A4%A`)).status, 400);
  assert.equal((await fetch(`${url}/a%00b`)).status, 400);
  assert.equal((await fetch(`${url}/api/patients/%E0%A4%A`, { headers: { cookie } })).status, 400);
  assert.equal((await post('/api/patients/demo-lin/notes', { role: 'family', text: 5 })).status, 400);
  assert.equal((await post('/api/patients/demo-lin/checkin', { pain: 3, symptoms: 'fever' })).status, 400);
  assert.equal((await post('/api/patients/demo-lin/checkin', { pain: 3, note: 'a'.repeat(5000) })).status, 413);
  assert.equal((await post('/api/patients/demo-lin/agent', { intent: 'talk', text: {} })).status, 400);
  assert.equal((await post('/api/patients/demo-lin/notes', { role: 'family', text: 'hello' })).status, 200);
  assert.doesNotMatch(log, /Request failed/);
});
