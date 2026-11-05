import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../lib/db.js';
import * as E from '../lib/engine.js';
import { keywordSignals } from '../lib/ai.js';

process.env.RESTART90_OFFLINE = '1';

function fresh() {
  const db = openDb(':memory:');
  E.seedDemo(db);
  return { db, id: E.DEMO_ID };
}

const pendingFor = (db, id, ability) => E.patientState(db, id).pending.find((p) => p.ability === ability);

test('upgrade needs the patient, then family, then the rehab team (V0.2 flow)', () => {
  const { db, id } = fresh();
  const r = E.logTask(db, id, { taskId: 'ab:grooming', status: 'done' });
  assert.equal(r.change.type, 'up-suggested');
  const pid = r.change.pendingId;
  assert.throws(() => E.decidePending(db, id, pid, { decision: 'approve', role: 'rehab' }), /not said/);
  E.decidePending(db, id, pid, { decision: 'approve', role: 'patient' });
  E.decidePending(db, id, pid, { decision: 'approve', role: 'family' });
  assert.equal(E.levelsOf(db, id).grooming.level, 1, 'patient and family alone do not change the level');
  E.decidePending(db, id, pid, { decision: 'approve', role: 'rehab' });
  assert.equal(E.levelsOf(db, id).grooming.level, 2);
});

test('the patient saying "not yet" ends the request', () => {
  const { db, id } = fresh();
  const r = E.logTask(db, id, { taskId: 'ab:grooming', status: 'done' });
  E.decidePending(db, id, r.change.pendingId, { decision: 'decline', role: 'patient' });
  assert.equal(pendingFor(db, id, 'grooming'), undefined);
});

test('family saying the home is not ready shows up as a disagreement for the rehab team', () => {
  const { db, id } = fresh();
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
  E.decidePending(db, id, p.id, { decision: 'approve', role: 'family' });
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
  assert.match(crisis.reply.zh, /988|12356/);
  const cant = E.agentReply(db, id, { intent: 'cant', taskId: 'ab:grooming' }, null);
  assert.equal(cant.actions[0].act, 'smaller');
});

test('new patients wait for the rehab team to confirm the plan', () => {
  const { db } = fresh();
  const { id } = E.createPatient(db, { extraction: { name: 'Test', fields: [] }, form: { goals: ['grooming'] } });
  assert.equal(E.patientState(db, id).planConfirmed, false);
  E.confirmPlan(db, id, {});
  assert.equal(E.patientState(db, id).planConfirmed, true);
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
  E.seedDemo(db, { id: 'demo-lin-a', sandbox: 'a' });
  E.seedDemo(db, { id: 'demo-lin-b', sandbox: 'b' });
  E.createPatient(db, { extraction: { name: 'A2', fields: [] }, form: {} }, 'a');
  E.checkin(db, 'demo-lin-b', { pain: 4, mood: 3, wound: 'leak' }, { signals: [] });
  assert.equal(E.rehabOverview(db, 'a').length, 2);
  assert.equal(E.rehabOverview(db, 'b').length, 1);
  E.seedDemo(db, { id: 'demo-lin-a', sandbox: 'a' });
  assert.equal(E.rehabOverview(db, 'a').length, 1, 'reset removes only this sandbox’s profiles');
  assert.equal(E.rehabOverview(db, 'b')[0].openAlerts, 1, 'the other sandbox keeps its red flag');
});
