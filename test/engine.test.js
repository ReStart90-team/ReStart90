import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../lib/db.js';
import * as E from '../lib/engine.js';
import { keywordSignals } from '../lib/ai.js';
import { SAMPLE_DISCHARGE, SAMPLE_EXTRACTION } from '../lib/samples.js';

process.env.RESTART90_OFFLINE = '1';

function fresh() {
  const db = openDb(':memory:');
  E.seedDemo(db);
  return { db, id: E.DEMO_ID };
}

const pendingFor = (db, id, ability) => E.patientState(db, id).pending.find((p) => p.ability === ability);

test('on his own, Lin Kai checks the home himself; the rehab team still makes the final call (V0.3)', () => {
  const { db, id } = fresh();
  const r = E.logTask(db, id, { taskId: 'ab:grooming', status: 'done' });
  assert.equal(r.change.type, 'up-suggested');
  const pid = r.change.pendingId;
  assert.throws(() => E.decidePending(db, id, pid, { decision: 'approve', role: 'rehab' }), /not said/);
  assert.throws(() => E.decidePending(db, id, pid, { decision: 'approve', role: 'patient', home: true }), /First decide/);
  E.decidePending(db, id, pid, { decision: 'approve', role: 'patient' });
  assert.throws(() => E.decidePending(db, id, pid, { decision: 'approve', role: 'family' }), /not invited family/);
  E.decidePending(db, id, pid, { decision: 'approve', role: 'patient', home: true });
  assert.equal(pendingFor(db, id, 'grooming').home_by, 'self');
  assert.equal(E.levelsOf(db, id).grooming.level, 1, 'the patient alone does not change the level');
  E.decidePending(db, id, pid, { decision: 'approve', role: 'rehab' });
  assert.equal(E.levelsOf(db, id).grooming.level, 2);
  assert.equal(E.patientState(db, id).lifeToday, 1, 'today he took back one part of daily life');
});

test('with family invited, the home check is family’s call (V0.2 flow still holds)', () => {
  const { db, id } = fresh();
  E.setSupport(db, id, { layer: 'family', action: 'invite', name: 'Neighbour Karim' });
  const r = E.logTask(db, id, { taskId: 'ab:grooming', status: 'done' });
  const pid = r.change.pendingId;
  E.decidePending(db, id, pid, { decision: 'approve', role: 'patient' });
  assert.throws(() => E.decidePending(db, id, pid, { decision: 'approve', role: 'patient', home: true }), /Family checks/);
  E.decidePending(db, id, pid, { decision: 'approve', role: 'family' });
  E.decidePending(db, id, pid, { decision: 'approve', role: 'rehab' });
  assert.equal(E.levelsOf(db, id).grooming.level, 2);
});

test('family and rehab see nothing until the patient lets them in', () => {
  const { db, id } = fresh();
  assert.throws(() => E.patientState(db, id, 'family'), /not invited family/);
  assert.equal(E.patientState(db, id, 'rehab').support.rehab, true, 'Lin Kai let the village clinic doctor in on day 3');
  E.setSupport(db, id, { layer: 'rehab', action: 'remove' });
  assert.throws(() => E.patientState(db, id, 'rehab'), /rehab worker/);
  assert.equal(E.rehabOverview(db).length, 0, 'the rehab desk no longer lists him');
  assert.throws(() => E.adjustAbility(db, id, 'grooming', { action: 'up' }), /rehab worker/);
});

test('family never sees private words, mood answers or the wound photo', () => {
  const { db, id } = fresh();
  E.setSupport(db, id, { layer: 'family', action: 'invite', name: 'Brother' });
  const photo = `data:image/jpeg;base64,${Buffer.from('fake-jpeg').toString('base64')}`;
  E.checkin(db, id, { pain: 4, mood: 3, note: 'only for the team', private: true, photo, body: { hopeless: false, hardest: 'the bucket', woundAnswered: true } }, { signals: [] });
  const fam = E.patientState(db, id, 'family');
  assert.equal(fam.checkin.note, null);
  assert.equal(fam.checkin.photo, null);
  assert.equal(fam.checkin.body.hardest, undefined);
  assert.equal(fam.notes.some((n) => n.private), false);
  assert.equal(E.patientState(db, id, 'rehab').checkin.photo, photo);
});

test('the patient saying "not yet" ends the request', () => {
  const { db, id } = fresh();
  const r = E.logTask(db, id, { taskId: 'ab:grooming', status: 'done' });
  E.decidePending(db, id, r.change.pendingId, { decision: 'decline', role: 'patient' });
  assert.equal(pendingFor(db, id, 'grooming'), undefined);
});

test('family saying the home is not ready shows up as a disagreement for the rehab team', () => {
  const { db, id } = fresh();
  E.setSupport(db, id, { layer: 'family', action: 'invite', name: 'Brother' });
  E.logHelp(db, id, { taskId: 'ab:transfer', help: 1 });
  const r = E.logTask(db, id, { taskId: 'ab:grooming', status: 'done' });
  E.decidePending(db, id, r.change.pendingId, { decision: 'approve', role: 'patient' });
  E.decidePending(db, id, r.change.pendingId, { decision: 'decline', role: 'family', note: '洗手池太高' });
  const st = E.patientState(db, id, 'rehab');
  assert.ok(st.disagreements.some((x) => x.kind === 'pending' && x.ability === 'grooming'));
  assert.ok(st.disagreements.some((x) => x.kind === 'overhelp' && x.ability === 'transfer'));
  assert.ok(st.stalled.some((x) => x.ability === 'toilet'), 'toilet has sat at level 1 since day 0');
  assert.ok(!st.stalled.some((x) => x.ability === 'grooming'), 'an ability with an open request is moving, not stalled');
});

test('seeded transfer upgrade is ready for the rehab team only', () => {
  const { db, id } = fresh();
  const p = pendingFor(db, id, 'transfer');
  assert.deepEqual([p.patient_ok, p.family_ok, p.home_by], [1, 1, 'self']);
  assert.equal(E.levelsOf(db, id).transfer.level, 2);
  E.decidePending(db, id, p.id, { decision: 'approve', role: 'rehab' });
  assert.equal(E.levelsOf(db, id).transfer.level, 3);
});

test('agent: "is this normal?" never says normal, and escalates red flags', () => {
  const { db, id } = fresh();
  const safe = E.agentReply(db, id, { intent: 'normal', text: '有点累' }, { signals: [] });
  assert.match(safe.reply.zh, /不能判断/);
  const red = E.agentReply(db, id, { intent: 'normal', text: '残端流脓' }, { signals: ['wound'] });
  assert.equal(red.danger, true);
  const crisis = E.agentReply(db, id, { intent: 'talk', text: '不想活了' }, { signals: ['crisis'] });
  assert.match(crisis.reply.zh, /危机热线/);
  const cant = E.agentReply(db, id, { intent: 'cant', taskId: 'ab:grooming' }, null);
  assert.equal(cant.actions[0].act, 'smaller');
  const hi = E.agentReply(db, id, { intent: 'welcome' }, null);
  assert.match(hi.reply.en, /I won’t lie to you/);
  assert.match(hi.reply.en, /we start with the glass/);
  assert.doesNotMatch(hi.reply.en, /will walk|prosthesis/, 'Riri never promises an outcome');
  assert.match(E.agentReply(db, id, { intent: 'today' }, null).reply.en, /^First, take 10 seconds/);
});

test('new patients wait for the rehab team to confirm the plan', () => {
  const { db } = fresh();
  const { id } = E.createPatient(db, { extraction: { name: 'Test', fields: [] }, form: { goals: ['grooming'], support: 'rehab', rehabName: 'Clinic' } });
  assert.equal(E.patientState(db, id).planConfirmed, false);
  E.confirmPlan(db, id, {});
  assert.equal(E.patientState(db, id).planConfirmed, true);
  // Starting alone: the plan stays at the safest level until a professional joins and confirms it.
  const solo = E.createPatient(db, { extraction: { name: 'Solo', fields: [] }, form: { support: 'solo' } }).id;
  assert.equal(E.patientState(db, solo).support.mode, 'solo');
  assert.throws(() => E.confirmPlan(db, solo, {}), /rehab worker/);
  assert.ok(!E.rehabOverview(db).some((x) => x.id === solo));
  E.setSupport(db, solo, { layer: 'rehab', action: 'invite', name: 'Community physio' });
  assert.ok(E.rehabOverview(db).some((x) => x.id === solo && x.planPending));
});

test('V0.3 body record: fixed wound answers and danger signs are red flags by rule', () => {
  const { db, id } = fresh();
  const r = E.checkin(db, id, { pain: 4, mood: 3, body: { woundChecks: ['warm', 'nonsense'], phantom: ['burning'], woundAnswered: true } }, { signals: [] });
  assert.equal(r.result, 'red');
  assert.deepEqual(r.signals, ['wound']);
  assert.match(r.summary.en, /Recorded today: Warm to the touch; Burning/);
  const stored = E.patientState(db, id).checkin.body;
  assert.deepEqual(stored.woundChecks, ['warm'], 'unknown answers are dropped');
});

test('V0.3 body record: self-harm thoughts escalate; hopelessness holds upgrades and suggests people', () => {
  let { db, id } = fresh();
  assert.equal(E.checkin(db, id, { pain: 3, mood: 2, body: { selfHarm: true } }, { signals: [] }).result, 'emergency');
  ({ db, id } = fresh());
  const y = E.checkin(db, id, { pain: 3, mood: 3, body: { hopeless: true } }, { signals: [] });
  assert.equal(y.result, 'yellow');
  assert.equal(y.suggestPeople, true);
  ({ db, id } = fresh());
  assert.equal(E.checkin(db, id, { pain: 3, mood: 3, body: { general: ['breath'] } }, { signals: [] }).result, 'emergency');
});

test('wound photos are stored, never analysed, and must be a small JPEG', () => {
  const { db, id } = fresh();
  assert.throws(() => E.checkin(db, id, { pain: 3, mood: 3, photo: 'data:text/html;base64,PHNjcmlwdD4=' }, { signals: [] }), /Invalid photo/);
  assert.throws(() => E.checkin(db, id, { pain: 3, mood: 3, photo: `data:image/jpeg;base64,${'A'.repeat(130_000)}` }, { signals: [] }), /too large/);
  const photo = `data:image/jpeg;base64,${'A'.repeat(400)}`;
  assert.equal(E.checkin(db, id, { pain: 3, mood: 3, photo }, { signals: [] }).result, 'ok');
  E.advanceDay(db, id);
  assert.equal(E.patientState(db, id).lastPhoto.day, 9, 'tomorrow shows yesterday’s photo to match the angle');
});

test('on his own with no rehab layer, Lin Kai can resume after a professional has seen him', () => {
  const { db, id } = fresh();
  E.setSupport(db, id, { layer: 'rehab', action: 'remove' });
  const r = E.checkin(db, id, { pain: 4, mood: 3, wound: 'leak' }, { signals: [] });
  assert.throws(() => E.resolveAlert(db, id, r.alertId, { role: 'patient', reply: '' }), /what the professional told you/);
  E.resolveAlert(db, id, r.alertId, { role: 'patient', reply: 'Clinic nurse: small serous fluid, keep watching' });
  assert.equal(E.patientState(db, id).alerts.filter((a) => a.status === 'open').length, 0);
});

test('life handed back: day 1 vs today, and each handback in order', () => {
  const { db, id } = fresh();
  const l = E.lifeBack(db, id);
  assert.equal(l.day, 9);
  assert.deepEqual(l.ups.map((u) => [u.day, u.ability]), [[3, 'transfer'], [4, 'limbcare']]);
  assert.equal(l.abilities.find((a) => a.id === 'transfer').start, 1);
  assert.equal(l.abilities.find((a) => a.id === 'transfer').now, 2);
  assert.ok(l.autonomyNow > l.autonomyStart);
  assert.equal(l.days.length, 9);
});

test('sample discharge quotes are exact substrings, so the wizard can highlight them', () => {
  for (const lang of ['zh', 'en']) for (const f of SAMPLE_EXTRACTION[lang].fields) assert.ok(SAMPLE_DISCHARGE[lang].includes(f.quote), `${lang} ${f.key}`);
});

test('rising pain and low mood put upgrades on hold', () => {
  const { db, id } = fresh();
  const r = E.checkin(db, id, { pain: 6, mood: 2, wound: 'normal' }, { signals: [] });
  assert.equal(r.result, 'yellow');
  assert.equal(pendingFor(db, id, 'transfer').status, 'held');
  const g = E.logTask(db, id, { taskId: 'ab:grooming', status: 'done' });
  assert.equal(g.change.type, 'held');
});

test('a red flag after a yellow hold replaces the reason, and a later yellow does not hide it', () => {
  const { db, id } = fresh();
  E.checkin(db, id, { pain: 6, mood: 2, wound: 'normal' }, { signals: [] });
  E.checkin(db, id, { pain: 6, mood: 2, wound: 'leak' }, { signals: [] });
  const red = pendingFor(db, id, 'transfer').note;
  assert.match(red.zh, /红旗信号（伤口/);
  assert.match(E.patientState(db, id, 'patient').hold.zh, /红旗信号/);
  E.checkin(db, id, { pain: 9, mood: 1, wound: 'normal' }, { signals: [] });
  assert.match(pendingFor(db, id, 'transfer').note.zh, /红旗信号/);
});

test('red flag pauses related tasks, stops upgrades and writes a doctor summary', () => {
  const { db, id } = fresh();
  const r = E.checkin(db, id, { pain: 4, mood: 3, wound: 'leak' }, { signals: [] });
  assert.equal(r.result, 'red');
  assert.match(r.summary.zh, /联系医生摘要/);
  assert.match(r.summary.en, /no diagnosis/);
  const t = E.buildTasks(db, id);
  assert.ok(t.main.some((x) => x.id === 'safe:limbcare'));
  assert.ok(![...t.main, ...t.secondary].some((x) => x.id === 'ab:transfer'));
  const g = E.logTask(db, id, { taskId: 'ab:grooming', status: 'done' });
  assert.equal(g.change, null, 'no upgrade while an alert is open');
});

test('a second check-in the same day keeps earlier red flags', () => {
  const { db, id } = fresh();
  E.checkin(db, id, { pain: 4, mood: 3, wound: 'leak' }, { signals: [] });
  const r = E.checkin(db, id, { pain: 4, mood: 3, wound: 'normal', fall: true }, { signals: [] });
  assert.deepEqual(r.signals.sort(), ['fall', 'wound']);
});

test('emergency signals pause everything', () => {
  const { db, id } = fresh();
  const r = E.checkin(db, id, { pain: 2, mood: 3, symptoms: ['chest'] }, { signals: [] });
  assert.equal(r.result, 'emergency');
  assert.equal(E.buildTasks(db, id).paused, 'all');
});

test('two failed days in a row suggest stepping back one level', () => {
  const { db, id } = fresh();
  E.logTask(db, id, { taskId: 'ab:limbcare', status: 'cant' });
  E.advanceDay(db, id);
  const r = E.logTask(db, id, { taskId: 'ab:limbcare', status: 'cant' });
  assert.equal(r.change.type, 'down-suggested');
  assert.equal(E.levelsOf(db, id).limbcare.smaller, true);
});

test('keyword safety net catches plain-language red flags in both languages', () => {
  assert.deepEqual(keywordSignals('残端流了一些黄色的脓，有点臭'), ['wound']);
  assert.ok(keywordSignals('I fell in the bathroom').includes('fall'));
  assert.ok(keywordSignals('有时候觉得活着没意思').includes('crisis'));
  assert.deepEqual(keywordSignals('I feel tired but okay'), []);
});

test('patient can plan when to do a task, and milestones show the nearest next step', () => {
  const { db, id } = fresh();
  E.logPlan(db, id, { taskId: 'ab:grooming', when: 'morning' });
  const st = E.patientState(db, id);
  assert.equal(st.logs['ab:grooming'].plan_when, 'morning');
  const g = st.milestones.find((m) => m.ability === 'grooming');
  assert.deepEqual([g.streak, g.need, g.left], [1, 2, 1]);
  assert.equal(st.wins.total, 3);
  assert.throws(() => E.logPlan(db, id, { taskId: 'ab:grooming', when: 'midnight' }));
});

test('demo sandboxes are independent: resetting one leaves the others alone', () => {
  const db = openDb(':memory:');
  E.seedDemo(db, { id: 'demo-a', sandbox: 'a' });
  E.seedDemo(db, { id: 'demo-b', sandbox: 'b' });
  E.createPatient(db, { extraction: { name: 'A2', fields: [] }, form: { support: 'both' } }, 'a');
  E.checkin(db, 'demo-b', { pain: 4, mood: 3, wound: 'leak' }, { signals: [] });
  assert.equal(E.rehabOverview(db, 'a').length, 2);
  assert.equal(E.rehabOverview(db, 'b').length, 1);
  E.seedDemo(db, { id: 'demo-a', sandbox: 'a' });
  assert.equal(E.rehabOverview(db, 'a').length, 1, 'reset removes only this sandbox’s profiles');
  assert.equal(E.rehabOverview(db, 'b')[0].openAlerts, 1, 'the other sandbox keeps its red flag');
});
