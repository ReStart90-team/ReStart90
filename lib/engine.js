// Rules engine: today's three lists, level changes, red flags and reviews.
// All numbers shown to users come from here, never from the model.

import crypto from 'node:crypto';
import { J, P, tx } from './db.js';
import {
  ABILITIES, abilityById, LEVELS, PHASES, phaseOf, SOCIAL_TASKS, SOCIAL_FAMILY, TRAINING, SIGNALS, signalById, SOURCES, BODY,
} from './content.js';
import { SAMPLE_EXTRACTION, DEMO_PROFILE_EXTRA } from './samples.js';

const bi = (zh, en) => ({ zh, en });
const same = (t) => ({ zh: t, en: t });
const MAX_DAY = 90;

export function httpError(status, zh, en) {
  const e = new Error(en);
  e.status = status;
  e.i18n = bi(zh, en);
  return e;
}

// ---------- reads ----------

export function getPatientRow(db, id) {
  const row = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  if (!row) throw httpError(404, '找不到这位患者', 'Patient not found');
  return { ...row, profile: P(row.profile, {}) };
}

export function levelsOf(db, id) {
  const rows = db.prepare('SELECT * FROM abilities WHERE patient_id = ?').all(id);
  return Object.fromEntries(rows.map((r) => [r.ability, { level: r.level, smaller: !!r.smaller, paused: !!r.paused }]));
}

// V0.3: the patient and Riri are always there. Family and rehab are support layers the patient lets in,
// and either can join later. Profiles from before V0.3 have no `support` and keep both layers.
export function layersOf(profile) {
  const s = profile.support;
  if (!s) return { family: true, rehab: true, familyName: profile.caregiver || null, rehabName: profile.rehabName || null, familyDay: null, rehabDay: null };
  return {
    family: !!s.family, rehab: !!s.rehab,
    familyName: s.family?.name || null, rehabName: s.rehab?.name || null,
    familyDay: s.family?.day ?? null, rehabDay: s.rehab?.day ?? null,
  };
}
const supportMode = (l) => (l.family && l.rehab ? 'both' : l.family ? 'family' : l.rehab ? 'rehab' : 'solo');

function requireLayer(profile, layer) {
  if (layersOf(profile)[layer]) return;
  throw layer === 'rehab'
    ? httpError(403, '患者还没有授权康复人员加入', 'The patient has not let a rehab worker join yet')
    : httpError(403, '患者还没有邀请家属加入', 'The patient has not invited family yet');
}

// The patient invites or removes a support layer. Nothing is shared until they do.
export function setSupport(db, id, { layer, action, name }) {
  if (!['family', 'rehab'].includes(layer)) throw httpError(400, '支持层无效', 'Invalid support layer');
  const p = getPatientRow(db, id);
  const l = layersOf(p.profile);
  const support = {
    mode: p.profile.support?.mode || supportMode(l),
    family: l.family ? { name: l.familyName, day: l.familyDay } : null,
    rehab: l.rehab ? { name: l.rehabName, day: l.rehabDay } : null,
  };
  if (action === 'invite') {
    const n = String(name || '').trim().slice(0, 80);
    if (!n) throw httpError(400, '请写上对方的名字', 'Add their name');
    support[layer] = { name: same(n), day: p.current_day };
  } else if (action === 'remove') {
    support[layer] = null;
  } else throw httpError(400, '操作无效', 'Invalid action');
  db.prepare('UPDATE patients SET profile = ? WHERE id = ?').run(J({ ...p.profile, support }), id);
  return { ok: true, support: layersOf({ support }) };
}

const activeAbilities = (day) => ABILITIES.filter((a) => a.phase <= phaseOf(day).id);

export function dateOfDay(profile, day) {
  if (!profile.dischargeDate) return null;
  const d = new Date(`${profile.dischargeDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day - 1);
  return d.toISOString().slice(0, 10);
}

function openAlerts(db, id) {
  return db.prepare("SELECT * FROM alerts WHERE patient_id = ? AND status = 'open' ORDER BY id").all(id)
    .map((a) => ({ ...a, signals: P(a.signals, []), summary: P(a.summary) }));
}

function pausedSet(db, id, levels) {
  const s = new Set();
  for (const a of openAlerts(db, id)) for (const sig of a.signals) (signalById[sig]?.pauses || []).forEach((x) => s.add(x));
  for (const [ab, v] of Object.entries(levels)) if (v.paused) s.add(ab);
  return s;
}

function lastChangeBy(db, id, ability) {
  return db.prepare('SELECT by_role FROM history WHERE patient_id = ? AND ability = ? ORDER BY id DESC LIMIT 1').get(id, ability)?.by_role;
}

export function autonomy(levels, day) {
  const act = activeAbilities(day);
  if (!act.length) return 0;
  const sum = act.reduce((n, a) => n + ((levels[a.id]?.level ?? 1) - 1), 0);
  return Math.round((sum / (act.length * 3)) * 100);
}

// ---------- today's lists ----------

export function buildTasks(db, id, day) {
  const p = getPatientRow(db, id);
  day = day ?? p.current_day;
  const levels = levelsOf(db, id);
  const paused = pausedSet(db, id, levels);
  const phase = phaseOf(day);
  const goals = p.profile.goals || [];

  const abilityTask = (a, track) => {
    const st = levels[a.id];
    const lv = st.level;
    const sources = ['template'];
    if (['limbcare', 'transfer'].includes(a.id)) sources.unshift('order');
    if (lastChangeBy(db, id, a.id) === 'rehab') sources.push('rehab');
    return {
      id: `ab:${a.id}`, kind: 'ability', ability: a.id, track, level: lv, risk: a.risk,
      name: a.name, life: a.life,
      patient: st.smaller ? a.smaller : a.levels[lv].p,
      family: a.levels[lv].f,
      familyRole: LEVELS[lv].family,
      noDo: a.noDo,
      smaller: st.smaller,
      goal: goals.includes(a.id),
      sources,
    };
  };

  if (paused.has('*')) {
    const alert = openAlerts(db, id).at(-1);
    const sig = alert?.signals.map((s) => signalById[s]).filter(Boolean) || [];
    const emergency = sig.some((s) => s.level === 'emergency');
    return {
      day, phase, paused: 'all',
      main: [{
        id: 'safe:all', kind: 'safe', track: 'body',
        name: bi('今天先停下普通任务', 'Ordinary tasks are paused today'),
        patient: emergency ? sig.find((s) => s.level === 'emergency').action : bi('保持舒适体位休息，不要勉强训练。按下方指引联系医疗团队。', 'Rest in a comfortable position and do not push training. Contact the care team as shown below.'),
        family: bi('陪在他身边，按指引联系医疗团队，记录症状变化。', 'Stay with them, contact the care team as directed, and note any change.'),
        sources: ['order'],
      }],
      secondary: [],
    };
  }

  const main = [];
  // 1. Body and safety
  if (paused.has('limbcare')) {
    main.push({
      id: 'safe:limbcare', kind: 'safe', track: 'body',
      name: bi('残肢护理暂停', 'Limb care paused'),
      patient: bi('按医嘱处理伤口，等待医生意见。今天不自己拆绷带或换药。', 'Follow the wound orders and wait for the doctor. Do not change the dressing yourself today.'),
      family: bi('留意伤口变化，不要自行处理渗液或涂药。', 'Watch the wound; do not treat leaking or apply anything yourself.'),
      sources: ['order'],
    });
  } else {
    main.push(abilityTask(abilityById.limbcare, 'body'));
  }

  // 2. Daily living — the patient's own goals first
  const order = (a) => {
    const g = goals.indexOf(a.id);
    return g === -1 ? 100 + ABILITIES.indexOf(a) : g;
  };
  const candidates = activeAbilities(day)
    .filter((a) => a.id !== 'limbcare' && levels[a.id].level < 4 && !paused.has(a.id))
    .sort((a, b) => order(a) - order(b));
  const focus = candidates[0];
  if (focus) main.push(abilityTask(focus, 'life'));

  // 3. Mind and social
  const pool = SOCIAL_TASKS[phase.id];
  const si = (day - 1) % pool.length;
  main.push({
    id: `social:${phase.id}-${si}`, kind: 'social', track: 'social',
    name: bi('心理和社会', 'Mind and connection'),
    patient: pool[si], family: SOCIAL_FAMILY, sources: ['template', 'patient'],
  });

  // Secondary list: rehab-plan training and other abilities
  const lvl = p.profile.level === 'above' ? 'aboveKnee' : 'belowKnee';
  const secondary = [
    { id: 'train:contracture', kind: 'training', track: 'body', name: bi('防止关节挛缩', 'Prevent joint stiffness'), patient: TRAINING.contracture[lvl], family: TRAINING.contracture.family, sources: ['order'] },
    { id: 'train:strength', kind: 'training', track: 'body', name: bi('力量训练', 'Strength training'), patient: TRAINING.strength.p, family: TRAINING.strength.f, sources: ['rehabPlan'] },
  ];
  if (p.profile.diabetes) {
    secondary.push({ id: 'train:soundFoot', kind: 'training', track: 'body', name: bi('检查健侧脚', 'Check the other foot'), patient: TRAINING.soundFoot.p, family: TRAINING.soundFoot.f, sources: ['order'] });
  }
  candidates.slice(1, 3).forEach((a) => secondary.push(abilityTask(a, 'life')));

  return { day, phase, paused: paused.size ? [...paused] : false, main, secondary };
}

// ---------- logging and level changes ----------

function findTask(db, id, day, taskId) {
  const t = buildTasks(db, id, day);
  const task = [...t.main, ...t.secondary].find((x) => x.id === taskId);
  if (!task) throw httpError(400, '今天没有这项任务', 'That task is not on today’s list');
  return task;
}

export function logTask(db, id, { taskId, status, note }) {
  const p = getPatientRow(db, id);
  const day = p.current_day;
  if (!['done', 'partial', 'cant'].includes(status)) throw httpError(400, '状态无效', 'Invalid status');
  const task = findTask(db, id, day, taskId);
  db.prepare(`INSERT INTO logs (patient_id, day, task_id, kind, ability, level, status, note)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(patient_id, day, task_id) DO UPDATE SET status = excluded.status,
                note = COALESCE(excluded.note, logs.note), updated_at = datetime('now')`)
    .run(id, day, taskId, task.kind, task.ability ?? null, task.level ?? null, status, note || null);
  let change = null;
  if (task.kind === 'ability') change = evaluateAbility(db, id, task.ability, day);
  return { ok: true, change };
}

// Implementation intention: the patient picks when they will do it (Gollwitzer, 1999).
export const PLAN_SLOTS = ['morning', 'noon', 'evening'];
export function logPlan(db, id, { taskId, when }) {
  const p = getPatientRow(db, id);
  if (!PLAN_SLOTS.includes(when)) throw httpError(400, '时间无效', 'Invalid time');
  const task = findTask(db, id, p.current_day, taskId);
  db.prepare(`INSERT INTO logs (patient_id, day, task_id, kind, ability, level, plan_when)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(patient_id, day, task_id) DO UPDATE SET plan_when = excluded.plan_when, updated_at = datetime('now')`)
    .run(id, p.current_day, taskId, task.kind, task.ability ?? null, task.level ?? null, when);
  return { ok: true };
}

function streakOf(db, id, ability, level) {
  const recent = db.prepare("SELECT level, status FROM logs WHERE patient_id = ? AND ability = ? AND kind = 'ability' AND status IS NOT NULL ORDER BY day DESC LIMIT 10").all(id, ability);
  let n = 0;
  for (const r of recent) {
    if (r.status === 'done' && r.level === level) n++;
    else break;
  }
  return n;
}

export function logHelp(db, id, { taskId, help }) {
  const p = getPatientRow(db, id);
  requireLayer(p.profile, 'family');
  const day = p.current_day;
  help = Number(help);
  if (!(help >= 1 && help <= 4)) throw httpError(400, '协助等级无效', 'Invalid help level');
  const task = findTask(db, id, day, taskId);
  db.prepare(`INSERT INTO logs (patient_id, day, task_id, kind, ability, level, help)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(patient_id, day, task_id) DO UPDATE SET help = excluded.help, updated_at = datetime('now')`)
    .run(id, day, taskId, task.kind, task.ability ?? null, task.level ?? null, help);
  const over = task.level && help < task.level;
  return {
    ok: true,
    tip: over
      ? bi(`今天帮得比建议多了一点。建议是"${LEVELS[task.level].family.zh}"，明天试着退后一步。`, `You helped a bit more than suggested ("${LEVELS[task.level].family.en}"). Try stepping back a little tomorrow.`)
      : task.level && help > task.level
        ? bi('今天放手比建议更多。确认过程安全，就把这件事记录给康复人员。', 'You stepped back more than suggested. If it was safe, it will be shown to the rehab team.')
        : null,
  };
}

function openPendingFor(db, id, ability) {
  return db.prepare("SELECT * FROM pending WHERE patient_id = ? AND ability = ? AND status IN ('open','held')").get(id, ability);
}

function evaluateAbility(db, id, ability, day) {
  const p = getPatientRow(db, id);
  const a = abilityById[ability];
  const st = levelsOf(db, id)[ability];
  const recent = db.prepare("SELECT day, level, status FROM logs WHERE patient_id = ? AND ability = ? AND kind = 'ability' AND status IS NOT NULL ORDER BY day DESC LIMIT 10").all(id, ability);
  const latest = recent[0]?.status;

  if (latest === 'cant') {
    db.prepare('UPDATE abilities SET smaller = 1 WHERE patient_id = ? AND ability = ?').run(id, ability);
    const cants = recent.slice(0, 2).filter((r) => r.status === 'cant' && r.level === st.level).length;
    if (cants >= 2 && st.level > 1 && !openPendingFor(db, id, ability)) {
      createPending(db, id, ability, st.level, st.level - 1, 'rehab', day,
        bi('连续两次做不到。建议退回上一级，换一个更稳的起点，这不是退步。', 'Two days in a row it did not work. Suggest going back one level for a steadier start. This is not failure.'));
      return { type: 'down-suggested' };
    }
    return { type: 'smaller' };
  }
  if (latest === 'done' && st.smaller) db.prepare('UPDATE abilities SET smaller = 0 WHERE patient_id = ? AND ability = ?').run(id, ability);
  if (latest !== 'done' || st.level >= 4) return null;

  let streak = 0;
  for (const r of recent) {
    if (r.status === 'done' && r.level === st.level) streak++;
    else break;
  }
  const need = st.level === 1 ? 2 : 3;
  if (streak < need) return { type: 'streak', streak, need };
  if (openPendingFor(db, id, ability) || st.paused || openAlerts(db, id).length) return null;

  // V0.2 flow: system suggests -> patient says if willing -> family says if home allows -> rehab confirms.
  const needs = 'rehab';
  const reason = bi(`连续 ${streak} 次完成，没有红旗信号`, `Completed ${streak} times in a row with no red flags`);
  const pending = createPending(db, id, ability, st.level, st.level + 1, needs, day, reason);
  if (p.hold_day === day) {
    db.prepare("UPDATE pending SET status = 'held', note = ? WHERE id = ?").run(p.hold_reason, pending);
    return { type: 'held', pendingId: pending };
  }
  return { type: 'up-suggested', needs, pendingId: pending };
}

function createPending(db, id, ability, from, to, needs, day, reason) {
  // A suggested step back is the rehab team's call alone, so patient and family inputs are pre-filled.
  const pre = to < from ? 1 : null;
  const r = db.prepare('INSERT INTO pending (patient_id, ability, from_level, to_level, needs, day, reason, patient_ok, family_ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, ability, from, to, needs, day, J(reason), pre, pre);
  return Number(r.lastInsertRowid);
}

function setLevel(db, id, ability, to, role, day, reason) {
  const from = levelsOf(db, id)[ability].level;
  if (from === to) return;
  db.prepare('UPDATE abilities SET level = ?, smaller = 0 WHERE patient_id = ? AND ability = ?').run(to, id, ability);
  db.prepare('INSERT INTO history (patient_id, day, ability, from_level, to_level, by_role, reason) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, day, ability, from, to, role, J(reason));
}

export function decidePending(db, id, pendingId, { decision, role, note, home }) {
  const p = getPatientRow(db, id);
  const row = db.prepare('SELECT * FROM pending WHERE id = ? AND patient_id = ?').get(pendingId, id);
  if (!row || !['open', 'held'].includes(row.status)) throw httpError(404, '这条待确认事项不存在或已处理', 'That item is gone or already decided');
  const yes = decision === 'approve';
  const layers = layersOf(p.profile);
  return tx(db, () => {
    // V0.3: with no family layer, the patient checks the home themselves. With family, it stays family's call.
    if (role === 'patient' && home) {
      if (layers.family) throw httpError(409, '家里条件由家属确认', 'Family checks the home for this patient');
      if (row.patient_ok !== 1) throw httpError(409, '先决定愿不愿意试', 'First decide whether you want to try');
      db.prepare("UPDATE pending SET family_ok = ?, family_note = ?, home_by = 'self' WHERE id = ?").run(yes ? 1 : 0, note || null, pendingId);
      if (note) addNote(db, id, { role: 'patient', text: note });
      return { ok: true };
    }
    if (role === 'patient') {
      // The patient's "not yet" ends the request: trying is their choice.
      if (yes) db.prepare('UPDATE pending SET patient_ok = 1 WHERE id = ?').run(pendingId);
      else db.prepare("UPDATE pending SET status = 'declined', patient_ok = 0, decided_by = 'patient', decided_day = ? WHERE id = ?").run(p.current_day, pendingId);
      return { ok: true };
    }
    if (role === 'family') {
      requireLayer(p.profile, 'family');
      db.prepare("UPDATE pending SET family_ok = ?, family_note = ?, home_by = 'family' WHERE id = ?").run(yes ? 1 : 0, note || null, pendingId);
      if (note) addNote(db, id, { role, text: note });
      return { ok: true };
    }
    // Rehab team makes the final call, and only once the patient has said they want to try.
    // Without a rehab layer nobody can confirm: the request waits for a professional.
    requireLayer(p.profile, 'rehab');
    if (yes && row.patient_ok !== 1) throw httpError(409, '患者还没有表示愿意尝试', 'The patient has not said they want to try yet');
    if (yes) {
      const reason = bi(`康复人员确认：${note || P(row.reason).zh}`, `Rehab team confirmed: ${note || P(row.reason).en}`);
      setLevel(db, id, row.ability, row.to_level, 'rehab', p.current_day, reason);
    }
    db.prepare('UPDATE pending SET status = ?, decided_by = ?, decided_day = ?, note = COALESCE(?, note) WHERE id = ?')
      .run(yes ? 'approved' : 'declined', 'rehab', p.current_day, note || null, pendingId);
    if (note) addNote(db, id, { role: 'rehab', text: note });
    return { ok: true };
  });
}

export function adjustAbility(db, id, ability, { action, note }) {
  const p = getPatientRow(db, id);
  requireLayer(p.profile, 'rehab');
  if (!abilityById[ability]) throw httpError(400, '没有这项能力', 'Unknown ability');
  const st = levelsOf(db, id)[ability];
  return tx(db, () => {
    if (action === 'down' && st.level > 1) setLevel(db, id, ability, st.level - 1, 'rehab', p.current_day, bi(`康复人员调整：${note || '退回上一级'}`, `Rehab team adjusted: ${note || 'back one level'}`));
    if (action === 'up' && st.level < 4) setLevel(db, id, ability, st.level + 1, 'rehab', p.current_day, bi(`康复人员调整：${note || '升一级'}`, `Rehab team adjusted: ${note || 'up one level'}`));
    if (action === 'smaller') db.prepare('UPDATE abilities SET smaller = 1 WHERE patient_id = ? AND ability = ?').run(id, ability);
    if (action === 'pause') db.prepare('UPDATE abilities SET paused = 1 WHERE patient_id = ? AND ability = ?').run(id, ability);
    if (action === 'resume') db.prepare('UPDATE abilities SET paused = 0 WHERE patient_id = ? AND ability = ?').run(id, ability);
    if (['down', 'up', 'pause'].includes(action)) db.prepare("UPDATE pending SET status = 'declined', decided_by = 'rehab', decided_day = ? WHERE patient_id = ? AND ability = ? AND status IN ('open','held')").run(p.current_day, id, ability);
    if (note) addNote(db, id, { role: 'rehab', text: `${abilityById[ability].name.zh}｜${note}`, textEn: `${abilityById[ability].name.en} | ${note}` });
    return { ok: true };
  });
}

// ---------- daily check-in, red flags, doctor summary ----------

// Keeps only known answers from the V0.3 body record, so stored data always matches the content library.
const MAX_PHOTO = 120_000; // characters of a data URL; the browser sends a ~320px JPEG
function cleanBody(raw = {}) {
  const pick = (key) => [...new Set((raw[key] || []).filter((x) => BODY[key].some((o) => o.id === x)))];
  const one = (key) => (BODY[key].some((o) => o.id === raw[key]) ? raw[key] : null);
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null);
  return {
    painRising: !!raw.painRising, painWhere: pick('painWhere'), painImpact: one('painImpact'),
    phantom: pick('phantom'), sensation: pick('sensation'), limb: pick('limb'),
    woundChecks: pick('woundChecks'), general: pick('general'),
    woundAnswered: !!raw.woundAnswered,
    hopeless: !!raw.hopeless, selfHarm: !!raw.selfHarm, shareMood: !!raw.shareMood,
    help: BODY.helpUsed.some((o) => o.id === Number(raw.help)) ? Number(raw.help) : null,
    hardest: text(raw.hardest), wantBack: text(raw.wantBack),
  };
}

export function checkin(db, id, data, parsed) {
  const p = getPatientRow(db, id);
  const day = p.current_day;
  const pain = clampInt(data.pain, 0, 10);
  const mood = clampInt(data.mood, 1, 5);
  const symptoms = (data.symptoms || []).filter((s) => signalById[s]);
  const body = data.body ? cleanBody(data.body) : null;
  // The photo is stored for the patient and the rehab team to compare over time. The system never analyses it.
  let photo = null;
  if (data.photo) {
    if (typeof data.photo !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.photo)) throw httpError(400, '照片格式无效', 'Invalid photo');
    if (data.photo.length > MAX_PHOTO) throw httpError(413, '照片太大', 'Photo too large');
    photo = data.photo;
  }
  const woundCol = body?.woundChecks.length ? body.woundChecks.join(',') : data.wound || 'normal';
  const fever = data.fever || body?.general.includes('fever');
  const fall = data.fall || body?.general.includes('fall');
  db.prepare(`INSERT INTO checkins (patient_id, day, pain, wound, fever, mood, fall, symptoms, note, private, parsed, body, photo)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(patient_id, day) DO UPDATE SET pain = excluded.pain, wound = excluded.wound, fever = excluded.fever,
                mood = excluded.mood, fall = excluded.fall, symptoms = excluded.symptoms, note = excluded.note,
                private = excluded.private, parsed = excluded.parsed,
                body = COALESCE(excluded.body, checkins.body), photo = COALESCE(excluded.photo, checkins.photo)`)
    .run(id, day, pain, woundCol, fever ? 1 : 0, mood, fall ? 1 : 0, J(symptoms), data.note || null, data.private ? 1 : 0, J(parsed || null), body ? J(body) : null, photo);

  const prev = db.prepare('SELECT pain, mood FROM checkins WHERE patient_id = ? AND day < ? ORDER BY day DESC LIMIT 1').get(id, day);
  const sig = new Set(symptoms);
  const triggers = [];
  if (pain != null && (pain >= 7 || pain - p.baseline_pain >= 3)) { sig.add('pain'); triggers.push(bi(`疼痛 ${pain}/10（基线 ${p.baseline_pain}）`, `Pain ${pain}/10 (baseline ${p.baseline_pain})`)); }
  if (data.wound && data.wound !== 'normal') sig.add('wound');
  if (fever) sig.add('fever');
  if (fall) sig.add('fall');
  // Fixed answers that are red flags by rule (V0.3 §6): wound checks, general danger signs, thoughts of self-harm.
  if (body) {
    for (const k of ['woundChecks', 'general']) for (const x of body[k]) { const s = BODY[k].find((o) => o.id === x)?.signal; if (s) sig.add(s); }
    if (body.selfHarm) sig.add('crisis');
  }
  (parsed?.signals || []).forEach((s) => signalById[s] && sig.add(s));

  if (sig.size) {
    return tx(db, () => {
      // A second check-in on the same day adds to today's open alert; it never clears earlier signals.
      const existing = db.prepare("SELECT id, signals FROM alerts WHERE patient_id = ? AND day = ? AND status = 'open'").get(id, day);
      const signals = [...new Set([...P(existing?.signals, []), ...sig])];
      const level = signals.some((s) => signalById[s].level === 'emergency') ? 'emergency' : 'red';
      const summary = doctorSummary(db, id, signals, data);
      let alertId;
      if (existing) {
        db.prepare('UPDATE alerts SET signals = ?, level = ?, summary = ? WHERE id = ?').run(J(signals), level, J(summary), existing.id);
        alertId = existing.id;
      } else {
        alertId = Number(db.prepare('INSERT INTO alerts (patient_id, day, signals, level, summary) VALUES (?, ?, ?, ?, ?)').run(id, day, J(signals), level, J(summary)).lastInsertRowid);
      }
      const names = signals.map((x) => signalById[x].label);
      holdUpgrades(db, id, day, bi(`出现红旗信号（${names.map((n) => n.zh).join('；')}），系统已停止升级`, `Red flag reported (${names.map((n) => n.en.toLowerCase()).join('; ')}); upgrades stopped`), { red: true });
      return { result: level, signals, alertId, summary };
    });
  }

  const yellow = [];
  if (prev && pain != null && prev.pain != null && pain - prev.pain >= 2) yellow.push(bi(`疼痛比昨天高 ${pain - prev.pain} 分`, `Pain up ${pain - prev.pain} points from yesterday`));
  else if (body?.painRising) yellow.push(bi('疼痛在持续上升', 'Pain keeps rising'));
  if (body?.hopeless) yellow.push(bi('感到绝望', 'feeling hopeless'));
  else if (mood != null && mood <= 2) yellow.push(bi('情绪低落', 'low mood'));
  if (yellow.length) {
    const reason = bi(`今天${yellow.map((y) => y.zh).join('、')}，系统暂缓升级`, `${yellow.map((y) => y.en).join(' and ')} today; upgrades on hold`);
    // An open red flag outranks a yellow signal: keep its reason on screen.
    if (!openAlerts(db, id).length) holdUpgrades(db, id, day, reason);
    const lowMoodDays = db.prepare('SELECT COUNT(*) n FROM checkins WHERE patient_id = ? AND day > ? AND mood <= 2').get(id, day - 3).n;
    return { result: 'yellow', reason, suggestPeople: lowMoodDays >= 3 || !!body?.hopeless };
  }
  if (p.hold_day === day) db.prepare('UPDATE patients SET hold_day = NULL, hold_reason = NULL WHERE id = ?').run(id);
  return { result: 'ok' };
}

// A red flag also rewrites requests a yellow signal already held, so the stronger reason is the one shown.
function holdUpgrades(db, id, day, reason, { red = false } = {}) {
  db.prepare('UPDATE patients SET hold_day = ?, hold_reason = ? WHERE id = ?').run(day, J(reason), id);
  db.prepare(`UPDATE pending SET status = 'held', note = ? WHERE patient_id = ? AND status IN (${red ? "'open', 'held'" : "'open'"}) AND to_level > from_level`).run(J(reason), id);
}

const clampInt = (v, lo, hi) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Math.max(lo, Math.min(hi, Math.round(Number(v)))));

function doctorSummary(db, id, signals, data) {
  const p = getPatientRow(db, id);
  const pr = p.profile;
  const day = p.current_day;
  const recent = db.prepare('SELECT day, pain, mood FROM checkins WHERE patient_id = ? AND day > ? ORDER BY day').all(id, day - 3);
  const famNotes = db.prepare("SELECT text FROM notes WHERE patient_id = ? AND role = 'family' AND day > ? ORDER BY id DESC LIMIT 2").all(id, day - 3).map((n) => P(n.text));
  const pauses = new Set(signals.flatMap((s) => signalById[s].pauses));
  const pausedNames = pauses.has('*') ? [bi('全部普通任务', 'all ordinary tasks')] : [...pauses].map((x) => abilityById[x].name);
  const sideZh = { left: '左侧', right: '右侧', both: '双侧' }[pr.side] || '';
  const sideEn = { left: 'left', right: 'right', both: 'bilateral' }[pr.side] || '';
  const lvZh = { below: '膝下截肢', above: '膝上截肢' }[pr.level] || '下肢截肢';
  const lvEn = { below: 'below-knee amputation', above: 'above-knee amputation' }[pr.level] || 'lower-limb amputation';
  const date = dateOfDay(pr, day);
  const actions = [...new Set(signals.map((s) => signalById[s]))];
  const quote = data.note && !data.private ? data.note : null;
  const today = db.prepare('SELECT body, photo FROM checkins WHERE patient_id = ? AND day = ?').get(id, day);
  const b = P(today?.body);
  const labelsOf = (k) => (b?.[k] || []).map((x) => BODY[k].find((o) => o.id === x)?.label).filter(Boolean);
  const recorded = ['woundChecks', 'phantom', 'sensation', 'limb'].flatMap(labelsOf);
  const photoLine = today?.photo ? bi('今天有伤口记录照片（系统未做判断，可在康复人员页查看）', 'A wound photo was recorded today (not assessed by the system; viewable on the rehab desk)') : null;
  const zh = [
    '【ReStart90 联系医生摘要】',
    `患者：${pr.name || '未填写'}，${pr.age ?? '?'}岁；${sideZh}${lvZh}${pr.surgeryDate ? `（${pr.surgeryDate} 手术）` : ''}${pr.diabetes ? '；合并糖尿病' : ''}`,
    `出院第 ${day} 天${date ? `（${date}）` : ''}`,
    `触发信号：${signals.map((s) => signalById[s].label.zh).join('；')}`,
    `近 ${recent.length} 天疼痛：${recent.map((r) => r.pain ?? '-').join(' → ')}（基线 ${p.baseline_pain}）；情绪（1–5）：${recent.map((r) => r.mood ?? '-').join(' → ')}`,
    recorded.length ? `今天记录：${recorded.map((x) => x.zh).join('；')}` : null,
    photoLine?.zh,
    quote ? `患者原话："${quote}"` : null,
    famNotes.length ? `家属观察：${famNotes.map((n) => n.zh).join('；')}` : null,
    `系统已做：暂停 ${pausedNames.map((n) => n.zh).join('、')}，停止所有能力升级`,
    `建议：${actions.map((s) => s.action.zh).join('；')}`,
    '数据来源：ReStart90 每日记录中的结构化数据。本摘要不包含诊断。',
  ].filter(Boolean).join('\n');
  const en = [
    '[ReStart90 summary for the doctor]',
    `Patient: ${pr.nameEn || pr.name || 'not given'}, ${pr.age ?? '?'}; ${sideEn} ${lvEn}${pr.surgeryDate ? ` (surgery ${pr.surgeryDate})` : ''}${pr.diabetes ? '; diabetes' : ''}`,
    `Day ${day} after discharge${date ? ` (${date})` : ''}`,
    `Signals: ${signals.map((s) => signalById[s].label.en).join('; ')}`,
    `Pain over the last ${recent.length} days: ${recent.map((r) => r.pain ?? '-').join(' → ')} (baseline ${p.baseline_pain}); mood (1–5): ${recent.map((r) => r.mood ?? '-').join(' → ')}`,
    recorded.length ? `Recorded today: ${recorded.map((x) => x.en).join('; ')}` : null,
    photoLine?.en,
    quote ? `Patient’s words: "${quote}"` : null,
    famNotes.length ? `Family observed: ${famNotes.map((n) => n.en).join('; ')}` : null,
    `Already done: paused ${pausedNames.map((n) => n.en).join(', ')}; all level upgrades stopped`,
    `Next step: ${actions.map((s) => s.action.en).join('; ')}`,
    'Source: structured data from ReStart90 daily records. This summary contains no diagnosis.',
  ].filter(Boolean).join('\n');
  return { zh, en };
}

// The rehab team resolves an alert. A patient with no rehab layer can do it only after a professional
// has seen them, and must write down what they were told.
export function resolveAlert(db, id, alertId, { reply, role = 'rehab' }) {
  const p = getPatientRow(db, id);
  if (role === 'patient') {
    if (layersOf(p.profile).rehab) throw httpError(409, '由康复人员处理这条提醒', 'The rehab team handles this alert');
    if (!reply || !reply.trim()) throw httpError(400, '请写下专业人员怎么说', 'Write down what the professional told you');
  } else requireLayer(p.profile, 'rehab');
  const r = db.prepare("UPDATE alerts SET status = 'resolved', reply = ?, resolved_day = ? WHERE id = ? AND patient_id = ? AND status = 'open'")
    .run(J(same(reply || '')), p.current_day, alertId, id);
  if (!r.changes) throw httpError(404, '这条提醒不存在或已处理', 'Alert not found or already resolved');
  if (reply) addNote(db, id, { role: role === 'patient' ? 'patient' : 'rehab', text: reply });
  return { ok: true };
}

// ---------- notes, todos, reviews, day ----------

export function addNote(db, id, { role, text, textEn, private: priv }) {
  if (!text || !text.trim()) throw httpError(400, '内容不能为空', 'Text is empty');
  const p = getPatientRow(db, id);
  db.prepare('INSERT INTO notes (patient_id, day, role, text, private) VALUES (?, ?, ?, ?, ?)').run(id, p.current_day, role, J(bi(text.trim(), (textEn || text).trim())), priv ? 1 : 0);
  return { ok: true };
}

// Onboarding ends with the rehab team confirming the plan (V0.2 brief).
export function confirmPlan(db, id, { note }) {
  const p = getPatientRow(db, id);
  requireLayer(p.profile, 'rehab');
  db.prepare('UPDATE patients SET profile = ? WHERE id = ?').run(J({ ...p.profile, planConfirmed: true }), id);
  if (note) addNote(db, id, { role: 'rehab', text: note });
  return { ok: true };
}

export function toggleTodo(db, id, todoId, done) {
  db.prepare('UPDATE todos SET done = ? WHERE patient_id = ? AND todo_id = ?').run(done ? 1 : 0, id, todoId);
  return { ok: true };
}

export function saveReview(db, id, { period, role, text }) {
  if (!/^[wm]\d+$/.test(period)) throw httpError(400, '复盘周期无效', 'Invalid period');
  db.prepare(`INSERT INTO reviews (patient_id, period, role, text) VALUES (?, ?, ?, ?)
              ON CONFLICT(patient_id, period, role) DO UPDATE SET text = excluded.text`).run(id, period, role, text || '');
  return { ok: true };
}

export function snapshot(db, id, day) {
  const levels = Object.fromEntries(Object.entries(levelsOf(db, id)).map(([k, v]) => [k, v.level]));
  db.prepare('INSERT INTO snapshots (patient_id, day, levels) VALUES (?, ?, ?) ON CONFLICT(patient_id, day) DO UPDATE SET levels = excluded.levels').run(id, day, J(levels));
}

export function advanceDay(db, id) {
  const p = getPatientRow(db, id);
  if (p.current_day >= MAX_DAY) throw httpError(400, '已经是第 90 天', 'Already day 90');
  return tx(db, () => {
    snapshot(db, id, p.current_day);
    db.prepare('UPDATE patients SET current_day = current_day + 1 WHERE id = ?').run(id);
    return { day: p.current_day + 1 };
  });
}

export function review(db, id, type, index) {
  const p = getPatientRow(db, id);
  const span = type === 'm' ? 30 : 7;
  const from = (index - 1) * span + 1;
  const to = Math.min(index * span, p.current_day);
  if (from > p.current_day) throw httpError(400, '这个周期还没开始', 'That period has not started yet');
  const levels = levelsOf(db, id);
  const logs = db.prepare('SELECT * FROM logs WHERE patient_id = ? AND day BETWEEN ? AND ?').all(id, from, to);
  const count = (s) => logs.filter((l) => l.status === s).length;
  const hist = db.prepare('SELECT * FROM history WHERE patient_id = ? AND day BETWEEN ? AND ? ORDER BY day').all(id, from, to)
    .map((h) => ({ ...h, reason: P(h.reason), name: abilityById[h.ability].name }));
  const snapAt = (d) => {
    if (d >= p.current_day) return Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, { level: v.level }]));
    const s = db.prepare('SELECT levels FROM snapshots WHERE patient_id = ? AND day <= ? ORDER BY day DESC LIMIT 1').get(id, d);
    return s ? Object.fromEntries(Object.entries(P(s.levels)).map(([k, v]) => [k, { level: v }])) : null;
  };
  const startSnap = snapAt(from - 1) || snapAt(from);
  const act = activeAbilities(p.current_day);
  const ck = db.prepare('SELECT AVG(pain) pain, AVG(mood) mood, COUNT(*) n FROM checkins WHERE patient_id = ? AND day BETWEEN ? AND ?').get(id, from, to);
  const notes = Object.fromEntries(db.prepare('SELECT role, text FROM reviews WHERE patient_id = ? AND period = ?').all(id, `${type}${index}`).map((r) => [r.role, r.text]));
  return {
    period: `${type}${index}`, type, index, from, to,
    counts: { done: count('done'), partial: count('partial'), cant: count('cant') },
    overHelp: logs.filter((l) => l.help && l.level && l.help < l.level).length,
    alerts: db.prepare('SELECT COUNT(*) n FROM alerts WHERE patient_id = ? AND day BETWEEN ? AND ?').get(id, from, to).n,
    avgPain: ck.pain != null ? Math.round(ck.pain * 10) / 10 : null,
    avgMood: ck.mood != null ? Math.round(ck.mood * 10) / 10 : null,
    gained: hist.filter((h) => h.to_level > h.from_level),
    steppedBack: hist.filter((h) => h.to_level < h.from_level),
    independent: act.filter((a) => levels[a.id].level === 4).map((a) => ({ id: a.id, name: a.name })),
    needHelp: act.filter((a) => levels[a.id].level < 4).map((a) => ({ id: a.id, name: a.name, level: levels[a.id].level })),
    next: act.filter((a) => levels[a.id].level < 4).map((a) => ({ id: a.id, name: a.name, to: levels[a.id].level + 1, patient: a.levels[levels[a.id].level + 1].p })),
    autonomyStart: startSnap ? autonomy(startSnap, from) : null,
    autonomyEnd: autonomy(levels, p.current_day),
    notes,
  };
}

export function map90(db, id) {
  const p = getPatientRow(db, id);
  const snaps = Object.fromEntries(db.prepare('SELECT day, levels FROM snapshots WHERE patient_id = ?').all(id).map((s) => [s.day, P(s.levels)]));
  const live = Object.fromEntries(Object.entries(levelsOf(db, id)).map(([k, v]) => [k, v.level]));
  const alertRows = db.prepare('SELECT day, signals FROM alerts WHERE patient_id = ?').all(id);
  const alertDays = new Set(alertRows.map((a) => a.day));
  const pausedOn = (d) => {
    const s = new Set(alertRows.filter((a) => a.day === d).flatMap((a) => P(a.signals, []).flatMap((x) => signalById[x]?.pauses || [])));
    return s.has('*') ? ABILITIES.map((a) => a.id) : [...s];
  };
  const changeDays = db.prepare('SELECT day, ability, from_level, to_level FROM history WHERE patient_id = ?').all(id);
  const days = [];
  for (let d = 1; d <= MAX_DAY; d++) {
    const lv = d === p.current_day ? live : d < p.current_day ? snaps[d] : null;
    const act = activeAbilities(d).map((a) => a.id);
    days.push({
      day: d,
      levels: lv ? Object.fromEntries(act.map((a) => [a, lv[a] ?? 1])) : null,
      alert: alertDays.has(d),
      paused: alertDays.has(d) ? pausedOn(d) : [],
      changes: changeDays.filter((c) => c.day === d),
    });
  }
  return { current: p.current_day, phases: PHASES, days };
}

// ---------- life handed back (V0.3: the autonomy change page) ----------
export function lifeBack(db, id) {
  const p = getPatientRow(db, id);
  const day = p.current_day;
  const levels = levelsOf(db, id);
  const snap1 = P(db.prepare('SELECT levels FROM snapshots WHERE patient_id = ? AND day = 1').get(id)?.levels, null);
  const doneBy = Object.fromEntries(db.prepare("SELECT day, COUNT(*) n FROM logs WHERE patient_id = ? AND kind = 'ability' AND status = 'done' GROUP BY day").all(id).map((r) => [r.day, r.n]));
  const alertDays = new Set(db.prepare('SELECT day FROM alerts WHERE patient_id = ?').all(id).map((r) => r.day));
  const ups = db.prepare('SELECT * FROM history WHERE patient_id = ? AND to_level > from_level ORDER BY day, id').all(id)
    .map((h) => ({ day: h.day, ability: h.ability, name: abilityById[h.ability].name, life: abilityById[h.ability].life, from: h.from_level, to: h.to_level, by: h.by_role }));
  const start = Object.fromEntries(ABILITIES.map((a) => [a.id, { level: snap1?.[a.id] ?? 1 }]));
  return {
    day, phase: phaseOf(day), customGoal: p.profile.customGoal || null,
    autonomyStart: autonomy(start, 1), autonomyNow: autonomy(levels, day),
    abilities: ABILITIES.map((a) => ({
      id: a.id, name: a.name, life: a.life, active: a.phase <= phaseOf(day).id, startsPhase: a.phase,
      start: start[a.id].level, now: levels[a.id].level, paused: levels[a.id].paused,
      next: levels[a.id].level < 4 ? a.levels[levels[a.id].level + 1].p : null,
    })),
    days: Array.from({ length: day }, (_, i) => ({ day: i + 1, done: doneBy[i + 1] || 0, alert: alertDays.has(i + 1) })),
    ups,
  };
}

// ---------- full state for the three role views ----------

export function patientState(db, id, role = 'patient') {
  const p = getPatientRow(db, id);
  // V0.3: family and rehab only see a patient after the patient lets them in.
  if (role === 'family' || role === 'rehab') requireLayer(p.profile, role);
  const support = { ...layersOf(p.profile), mode: supportMode(layersOf(p.profile)), chosen: p.profile.support?.mode || null };
  const day = p.current_day;
  const levels = levelsOf(db, id);
  const tasks = buildTasks(db, id, day);
  const logs = Object.fromEntries(db.prepare('SELECT * FROM logs WHERE patient_id = ? AND day = ?').all(id, day).map((l) => [l.task_id, l]));
  const ck = db.prepare('SELECT * FROM checkins WHERE patient_id = ? AND day = ?').get(id, day);
  // Family sees what it needs to help; the patient's private words, mood answers and wound photo stay out of its view.
  const ckBody = P(ck?.body);
  const checkinToday = ck ? {
    ...ck, symptoms: P(ck.symptoms, []), parsed: P(ck.parsed),
    note: ck.private && role === 'family' ? null : ck.note,
    body: role === 'family' && ckBody ? { ...ckBody, hopeless: undefined, selfHarm: undefined, hardest: undefined } : ckBody,
    photo: role === 'family' ? null : ck.photo,
  } : null;
  const lastPhoto = role === 'family' ? null : db.prepare('SELECT day, photo FROM checkins WHERE patient_id = ? AND day < ? AND photo IS NOT NULL ORDER BY day DESC LIMIT 1').get(id, day) || null;
  const pending = db.prepare("SELECT * FROM pending WHERE patient_id = ? AND status IN ('open','held') ORDER BY id").all(id)
    .map((x) => ({ ...x, reason: P(x.reason), note: P(x.note, x.note), name: abilityById[x.ability].name }));
  const alerts = db.prepare('SELECT * FROM alerts WHERE patient_id = ? ORDER BY id DESC LIMIT 10').all(id)
    .map((a) => ({ ...a, signals: P(a.signals, []), summary: P(a.summary), reply: P(a.reply) }));
  const history = db.prepare('SELECT * FROM history WHERE patient_id = ? ORDER BY id DESC LIMIT 20').all(id)
    .map((h) => ({ ...h, reason: P(h.reason), name: abilityById[h.ability].name }));
  const notes = db.prepare('SELECT * FROM notes WHERE patient_id = ? ORDER BY id DESC LIMIT 30').all(id)
    .filter((n) => !(n.private && role === 'family'))
    .map((n) => ({ ...n, text: P(n.text) }));
  const todos = db.prepare('SELECT * FROM todos WHERE patient_id = ? ORDER BY rowid').all(id).map((t) => ({ ...t, text: P(t.text) }));
  const week = db.prepare('SELECT ability, day, status, help, level FROM logs WHERE patient_id = ? AND kind = ? AND day > ? ORDER BY day').all(id, 'ability', day - 7);
  const checkins = db.prepare('SELECT day, pain, mood FROM checkins WHERE patient_id = ? AND day > ? ORDER BY day').all(id, day - 7);
  // Goal gradient: the nearest next step for each ability still in progress.
  const openPend = new Set(pending.map((x) => x.ability));
  const milestones = activeAbilities(day)
    .filter((a) => levels[a.id].level < 4 && !levels[a.id].paused)
    .map((a) => {
      const lv = levels[a.id].level;
      const need = lv === 1 ? 2 : 3;
      const pend = openPend.has(a.id);
      // Without an open request, the next "done" is what files it, so at least one is always left.
      const streak = pend ? need : Math.min(streakOf(db, id, a.id, lv), need - 1);
      return { ability: a.id, name: a.name, level: lv, to: lv + 1, streak, need, left: need - streak, pending: pend };
    })
    .sort((x, y) => (x.pending - y.pending) || (x.left - y.left));
  // Rehab desk: abilities stuck at one level for 7+ days, and where patient, family and plan disagree.
  const lastChange = Object.fromEntries(db.prepare('SELECT ability, MAX(day) d FROM history WHERE patient_id = ? GROUP BY ability').all(id).map((r) => [r.ability, r.d]));
  const stalled = activeAbilities(day)
    .filter((a) => levels[a.id].level < 4 && !levels[a.id].paused && !openPend.has(a.id) && day - (lastChange[a.id] || 0) >= 7)
    .map((a) => ({ ability: a.id, name: a.name, level: levels[a.id].level, days: day - (lastChange[a.id] || 0) }));
  const disagreements = [
    ...db.prepare("SELECT day, ability, level, status, help FROM logs WHERE patient_id = ? AND kind = 'ability' AND day > ? AND help IS NOT NULL AND level IS NOT NULL ORDER BY day DESC").all(id, day - 7)
      .filter((l) => l.help < l.level || (l.status === 'done' && l.help === 1 && l.level >= 2))
      .map((l) => ({ day: l.day, ability: l.ability, name: abilityById[l.ability].name, kind: l.help < l.level ? 'overhelp' : 'mismatch', plan: l.level, help: l.help })),
    ...pending.filter((x) => x.patient_ok === 1 && x.family_ok === 0)
      .map((x) => ({ day: x.day, ability: x.ability, name: x.name, kind: 'pending', note: x.family_note })),
  ];
  const mainIds = tasks.main.filter((x) => x.kind !== 'safe').map((x) => x.id);
  const wins = { done: mainIds.filter((tid) => logs[tid]?.status === 'done').length, logged: mainIds.filter((tid) => logs[tid]?.status).length, total: mainIds.length };
  const ups = db.prepare('SELECT COUNT(*) n FROM history WHERE patient_id = ? AND to_level > from_level').get(id).n;
  // "Today you took back N parts of daily life": daily-living and body tasks the patient logged as done today.
  const lifeToday = Object.values(logs).filter((l) => l.kind === 'ability' && l.status === 'done').length;
  const familyLess = [...tasks.main, ...tasks.secondary].filter((x) => x.kind === 'ability' && x.level >= 2).length;
  return {
    id, day, date: dateOfDay(p.profile, day), phase: phaseOf(day),
    milestones, wins, handedBack: ups, lifeToday, familyLess, stalled, disagreements, support, lastPhoto,
    planConfirmed: p.profile.planConfirmed !== false,
    selfCount: activeAbilities(day).filter((a) => levels[a.id].level === 4).length,
    profile: p.profile, baselinePain: p.baseline_pain,
    hold: p.hold_day === day ? P(p.hold_reason) : null,
    autonomy: autonomy(levels, day),
    abilities: ABILITIES.map((a) => ({
      id: a.id, name: a.name, life: a.life, risk: a.risk, track: a.track,
      active: a.phase <= phaseOf(day).id, startsPhase: a.phase,
      level: levels[a.id].level, smaller: levels[a.id].smaller, paused: levels[a.id].paused,
      goal: (p.profile.goals || []).includes(a.id),
      now: a.levels[levels[a.id].level],
      next: levels[a.id].level < 4 ? a.levels[levels[a.id].level + 1] : null,
      week: week.filter((w) => w.ability === a.id),
    })),
    tasks, logs, checkin: checkinToday, checkins, pending, alerts, history, notes, todos,
  };
}

// `sandbox` scopes everything to one visitor of the public demo ('' is the local, unscoped space).
export function rehabOverview(db, sandbox = '') {
  // Only patients who let a rehab worker in appear on the desk.
  return db.prepare('SELECT id FROM patients WHERE sandbox = ? ORDER BY created_at').all(sandbox).filter(({ id }) => layersOf(getPatientRow(db, id).profile).rehab).map(({ id }) => {
    const p = getPatientRow(db, id);
    const levels = levelsOf(db, id);
    return {
      id, name: p.profile.name, nameEn: p.profile.nameEn, day: p.current_day,
      phase: phaseOf(p.current_day),
      autonomy: autonomy(levels, p.current_day),
      openAlerts: db.prepare("SELECT COUNT(*) n FROM alerts WHERE patient_id = ? AND status = 'open'").get(id).n,
      pending: db.prepare("SELECT COUNT(*) n FROM pending WHERE patient_id = ? AND status IN ('open','held') AND needs = 'rehab'").get(id).n,
      overHelp: db.prepare('SELECT COUNT(*) n FROM logs WHERE patient_id = ? AND day > ? AND help IS NOT NULL AND level IS NOT NULL AND help < level').get(id, p.current_day - 7).n,
      planPending: p.profile.planConfirmed === false,
    };
  });
}

// ---------- creating patients ----------

const HOME_TODOS = {
  grabBar: bi('在马桶旁安装扶手', 'Fit a grab bar next to the toilet'),
  showerChair: bi('准备淋浴椅和防滑垫', 'Get a shower chair and a non-slip mat'),
  threshold: bi('去掉门槛或加装小斜坡', 'Remove door sills or add small ramps'),
  nightLight: bi('卧室到卫生间装好夜灯', 'Put night lights between bedroom and bathroom'),
  wheelchair: bi('借用或租用轮椅（可问社区康复站）', 'Borrow or rent a wheelchair (ask the community rehab centre)'),
  stairs: bi('住楼上且没有电梯：和康复人员商量上下楼方案', 'Upstairs with no lift: plan stairs with the rehab team'),
};

export function createPatient(db, { extraction, form }, sandbox = '') {
  if (db.prepare('SELECT COUNT(*) n FROM patients WHERE sandbox = ?').get(sandbox).n >= 20) throw httpError(429, '演示里的档案太多了，请先重置', 'Too many profiles in this demo; reset it first');
  const id = crypto.randomUUID().slice(0, 8);
  const ex = extraction || {};
  const home = form.home || {};
  // V0.3: "Who is with you?" One person can start alone; the others are optional layers.
  const mode = ['solo', 'family', 'rehab', 'both'].includes(form.support) ? form.support : 'solo';
  const hasFamily = mode === 'family' || mode === 'both';
  const hasRehab = mode === 'rehab' || mode === 'both';
  const support = {
    mode,
    family: hasFamily ? { name: same(String(form.caregiver || '').trim() || '—'), day: 1 } : null,
    rehab: hasRehab ? { name: same(String(form.rehabName || '').trim() || '—'), day: 1 } : null,
  };
  const profile = {
    name: ex.name || form.name || '', nameEn: form.nameEn || ex.name || '',
    age: ex.age ?? form.age ?? null, sex: ex.sex || 'unknown',
    side: ex.side || 'unknown', level: ex.level || 'unknown', diabetes: !!ex.diabetes,
    surgeryDate: ex.surgeryDate || '', dischargeDate: ex.dischargeDate || form.dischargeDate || new Date().toISOString().slice(0, 10),
    orders: (ex.fields || []).filter((f) => f.confirmed !== false),
    extractionMode: ex.mode || 'manual',
    confidence: clampInt(form.confidence, 1, 5) ?? 3,
    worry: form.worry ? same(form.worry) : null,
    caregiver: form.caregiver ? same(form.caregiver) : null,
    rehabName: form.rehabName ? same(form.rehabName) : null,
    support,
    goals: (form.goals || []).filter((g) => abilityById[g]),
    customGoal: form.customGoal ? same(form.customGoal) : null,
    home,
    planConfirmed: false,
  };
  return tx(db, () => {
    db.prepare('INSERT INTO patients (id, profile, current_day, baseline_pain, sandbox) VALUES (?, ?, 1, ?, ?)').run(id, J(profile), clampInt(form.pain, 0, 10) ?? 3, sandbox);
    for (const a of ABILITIES) db.prepare('INSERT INTO abilities (patient_id, ability, level) VALUES (?, ?, 1)').run(id, a.id);
    const todos = [];
    if (!home.grabBar) todos.push('grabBar');
    if (!home.showerChair) todos.push('showerChair');
    if (home.threshold) todos.push('threshold');
    todos.push('nightLight');
    if (!home.wheelchair) todos.push('wheelchair');
    if (home.floor > 1 && !home.elevator) todos.push('stairs');
    for (const t of todos) db.prepare('INSERT INTO todos (patient_id, todo_id, text) VALUES (?, ?, ?)').run(id, t, J(HOME_TODOS[t]));
    return { id };
  });
}

// ---------- agent Riri: fixed doors, rules first ----------
// Not a free medical chatbot. Medical answers come only from rules and reviewed content; danger goes straight to escalation.
// Riri never changes orders, never raises training load, never calls a wound normal and never promises a prosthesis or walking.
export function agentReply(db, id, { intent, text, taskId }, parsed, listened) {
  const st = patientState(db, id, 'patient');
  const main = st.tasks.main.filter((x) => x.kind !== 'safe');
  const titleOf = (x) => (x.kind === 'ability' ? x.life : x.kind === 'social' ? x.patient : x.name);
  const name = st.profile.nameEn || st.profile.name || '';
  const nameZh = st.profile.name || name;
  // First words on day one (final promo brief): no false promise, then one small thing — the glass of water.
  if (intent === 'welcome') {
    const alone = !st.support.family;
    return {
      reply: bi(
        `${nameZh}，我不会骗你：九十天不会把你变回从前，我也不能替医生做决定。但生活可以一件一件拿回来。今天，我们先${alone ? '从这杯水开始：把水放到你自己够得到的地方' : `做这一件：${titleOf(main[1] || main[0]).zh}`}，再花 10 秒记录身体。`,
        `${name}, I won’t lie to you: ninety days won’t make you who you were before, and I can’t make decisions for your doctor. But life can come back one thing at a time. Today we start ${alone ? 'with the glass: put water where you can reach it yourself' : `with this: ${titleOf(main[1] || main[0]).en.replace(/^./, (c) => c.toLowerCase())}`}, then take 10 seconds to record your body.`),
      actions: [{ act: 'body', label: bi('记录身体', 'Record my body') }],
    };
  }
  if (intent === 'today') {
    if (st.tasks.paused === 'all') return { reply: bi('今天的普通任务已经暂停。先按页面顶部的指引联系医疗团队。', 'Ordinary tasks are paused today. First contact the care team as shown at the top of the page.') };
    const todo = main.filter((x) => st.logs[x.id]?.status !== 'done');
    const slot = { morning: bi('早饭后', 'after breakfast'), noon: bi('午饭后', 'after lunch'), evening: bi('晚饭后', 'after dinner') };
    const bodyFirst = st.checkin ? null : bi('先花 10 秒记录身体。', 'First, take 10 seconds to record your body. ');
    if (!todo.length) return { reply: bi('今天的三件事都完成了。剩下的时间是你自己的。', 'All three are done today. The rest of the day is yours.') };
    const first = todo[0];
    const when = st.logs[first.id]?.plan_when;
    const m = st.milestones[0];
    return {
      reply: bi(
        `${bodyFirst?.zh || ''}今天还有 ${todo.length} 件。先做这一件：${titleOf(first).zh}${when ? `，你定的是${slot[when].zh}` : ''}。${m ? `${m.name.zh}再完成 ${m.left} 次，就可以试下一步。` : ''}`,
        `${bodyFirst?.en || ''}${todo.length} left today. Start with: ${titleOf(first).en}${when ? `, which you planned for ${slot[when].en}` : ''}. ${m ? `${m.name.en}: ${m.left} more and you can try the next step.` : ''}`),
      actions: bodyFirst ? [{ act: 'body', label: bi('记录身体', 'Record my body') }] : undefined,
    };
  }
  if (intent === 'cant') {
    const options = main.filter((x) => x.kind === 'ability');
    const task = options.find((x) => x.id === taskId);
    if (!task) return { reply: bi('哪一件做不到？选一件，我们把它变小。', 'Which one is too hard? Pick one and we’ll make it smaller.'), choices: options.map((x) => ({ taskId: x.id, label: x.life })) };
    const a = abilityById[task.ability];
    return {
      reply: bi(`任务太大，不是你不行。可以先换成这一步：${a.smaller.zh}`, `The step is too big, not you. Try this instead: ${a.smaller.en}`),
      peer: true,
      actions: [{ act: 'smaller', taskId: task.id, label: bi('今天换成这一步', 'Swap to this step today') }],
    };
  }
  if (intent === 'normal') {
    const sigs = (parsed?.signals || []).filter((x) => signalById[x]);
    if (sigs.length) {
      return {
        reply: bi(`你说的「${sigs.map((x) => signalById[x].label.zh).join('、')}」需要专业人员来看，不能等：${sigs.map((x) => signalById[x].action.zh).join('；')}。`, `What you describe (${sigs.map((x) => signalById[x].label.en.toLowerCase()).join(', ')}) needs a professional, don’t wait: ${sigs.map((x) => signalById[x].action.en).join('; ')}.`),
        danger: true, signals: sigs,
        actions: [{ act: 'report', label: st.support.rehab ? bi('现在报告给康复人员', 'Report to the rehab team now') : bi('记录下来，暂停相关任务', 'Record it and pause the related tasks') }],
      };
    }
    return {
      reply: st.support.rehab
        ? bi('我不能判断这是否正常，也不会替医生下结论。你描述的情况没有命中红旗规则。如果你担心，可以发给康复人员看。', 'I can’t tell you whether this is normal, and I won’t make that call for a doctor. What you describe doesn’t match a red-flag rule. If you’re worried, send it to the rehab team.')
        : bi('我不能判断这是否正常，也不会替医生下结论。你描述的情况没有命中红旗规则。如果你担心，请按出院资料上的电话联系门诊，或在下次复诊时问。', 'I can’t tell you whether this is normal, and I won’t make that call for a doctor. What you describe doesn’t match a red-flag rule. If you’re worried, call the clinic number on your discharge papers, or ask at your next follow-up.'),
      actions: st.support.rehab ? [{ act: 'share', label: bi('发给康复人员', 'Send to the rehab team') }] : undefined,
    };
  }
  if (intent === 'talk') {
    if ((parsed?.signals || []).includes('crisis')) {
      return { reply: bi(`谢谢你告诉我。你现在的安全最重要：${signalById.crisis.action.zh}。`, `Thank you for telling me. Your safety comes first: ${signalById.crisis.action.en}.`), danger: true, signals: ['crisis'], actions: [{ act: 'report', label: st.support.rehab ? bi('告诉康复人员', 'Tell the rehab team') : bi('记录下来', 'Record it') }] };
    }
    return {
      reply: listened || bi('我听到了。这些话只留在这里，除非你选择分享给康复人员。', 'I hear you. This stays here unless you choose to share it with the rehab team.'),
      actions: st.support.rehab ? [{ act: 'share', label: bi('分享给康复人员（家属看不到）', 'Share with the rehab team (family can’t see it)') }] : undefined,
    };
  }
  throw httpError(400, '不认识这个问题', 'Unknown question');
}

// Demo patient: Lin Kai on day 9 (final promo brief), with eight days of history. All synthetic.
// He chose "I'm on my own now"; on day 3 he let the village clinic doctor join as his rehab layer. No family layer.
export const DEMO_ID = 'demo';
// Resets one sandbox: removes its profiles and seeds Lin Kai at day 9 under `id`.
export function seedDemo(db, { id = DEMO_ID, sandbox = '' } = {}) {
  db.prepare('DELETE FROM patients WHERE sandbox = ? OR id = ?').run(sandbox, id);
  const ex = SAMPLE_EXTRACTION.zh;
  const X = DEMO_PROFILE_EXTRA;
  const profile = {
    name: ex.name, nameEn: SAMPLE_EXTRACTION.en.name, age: ex.age, sex: ex.sex, side: ex.side, level: ex.level, diabetes: ex.diabetes,
    surgeryDate: ex.surgeryDate, dischargeDate: ex.dischargeDate,
    orders: ex.fields.map((f, i) => ({ ...f, valueEn: SAMPLE_EXTRACTION.en.fields[i].value, quoteEn: SAMPLE_EXTRACTION.en.fields[i].quote, confirmed: true })),
    extractionMode: 'pregenerated', confidence: X.confidence,
    worry: X.worry, rehabName: X.support.rehab.name, occupation: X.occupation, support: X.support,
    goals: X.goals, customGoal: X.customGoal,
    home: { floor: 1, elevator: false, grabBar: false, showerChair: false, threshold: true, wheelchair: true },
    planConfirmed: true,
  };
  tx(db, () => {
    db.prepare('INSERT INTO patients (id, profile, current_day, baseline_pain, sandbox) VALUES (?, ?, 9, 4, ?)').run(id, J(profile), sandbox);
    const final = { limbcare: 2, transfer: 2, grooming: 1, toilet: 1, dressing: 1, outing: 1 };
    for (const a of ABILITIES) db.prepare('INSERT INTO abilities (patient_id, ability, level, smaller) VALUES (?, ?, ?, 0)').run(id, a.id, final[a.id]);

    const H = (day, ability, from, to, role, zh, en) => db.prepare('INSERT INTO history (patient_id, day, ability, from_level, to_level, by_role, reason) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, day, ability, from, to, role, J(bi(zh, en)));
    H(3, 'transfer', 1, 2, 'rehab', '卫生室复诊时确认：连续 2 次完成，会先锁刹车，没有红旗信号', 'Confirmed at the clinic visit: done twice in a row, locks the brakes first, no red flags');
    H(4, 'limbcare', 1, 2, 'rehab', '康复人员确认：能用镜子看清残端，愿意自己缠第一圈', 'Rehab team confirmed: checks the stump with a mirror and wants to wrap the first turn');

    const L = (day, taskId, kind, ability, level, status) => db.prepare('INSERT INTO logs (patient_id, day, task_id, kind, ability, level, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, day, taskId, kind, ability, level, status);
    const grooming = ['partial', 'cant', 'partial', 'done', 'partial', 'cant', 'partial', 'done'];
    const transferLv = (d) => (d < 3 ? 1 : 2);
    const limbLv = (d) => (d < 4 ? 1 : 2);
    for (let d = 1; d <= 8; d++) {
      if (d !== 5) L(d, 'ab:limbcare', 'ability', 'limbcare', limbLv(d), d === 2 ? 'partial' : 'done');
      L(d, 'ab:grooming', 'ability', 'grooming', 1, grooming[d - 1]);
      L(d, `social:1-${(d - 1) % 3}`, 'social', null, null, d % 3 === 0 ? 'partial' : 'done');
      L(d, 'train:contracture', 'training', null, null, 'done');
      L(d, 'train:strength', 'training', null, null, d === 5 ? 'cant' : 'done');
      if (d !== 5) L(d, 'ab:transfer', 'ability', 'transfer', transferLv(d), 'done');
      L(d, 'ab:toilet', 'ability', 'toilet', 1, d < 6 ? 'partial' : 'done');
    }
    // Daily body records (V0.3 §6): phantom pain early on, swelling settling, one leaking-wound day.
    const C = (day, pain, mood, body, wound = 'normal', note = null) => db.prepare('INSERT INTO checkins (patient_id, day, pain, wound, fever, mood, fall, symptoms, note, body) VALUES (?, ?, ?, ?, 0, ?, 0, ?, ?, ?)').run(id, day, pain, wound, mood, '[]', note, J(cleanBody(body)));
    C(1, 5, 2, { phantom: ['phantomPain', 'phantomFeel'], limb: ['swelling'], painWhere: ['stump', 'phantom'], painImpact: 'stops', woundAnswered: true, help: 2 });
    C(2, 5, 1, { phantom: ['phantomPain', 'electric'], limb: ['swelling', 'tight'], painWhere: ['phantom'], painImpact: 'stops', woundAnswered: true, help: 2 });
    C(3, 4, 2, { phantom: ['phantomPain'], limb: ['swelling'], sensation: ['tingling'], painWhere: ['phantom'], painImpact: 'some', woundAnswered: true, help: 3 });
    C(4, 4, 2, { phantom: ['phantomPain'], painWhere: ['stump'], painImpact: 'some', woundAnswered: true, help: 3 });
    C(5, 5, 2, { woundChecks: ['discharge'], painWhere: ['stump'], painImpact: 'some', woundAnswered: true }, 'discharge', '残端下面有点黄色的水');
    C(6, 4, 3, { phantom: ['phantomFeel'], painWhere: ['stump'], painImpact: 'some', woundAnswered: true, help: 3, wantBack: '自己拿水' });
    C(7, 3, 3, { phantom: ['phantomFeel'], painImpact: 'none', woundAnswered: true, help: 3 });
    C(8, 3, 3, { painImpact: 'none', woundAnswered: true, help: 4, hardest: '把热水瓶从灶边拿到床边', wantBack: '自己推开门' });

    db.prepare("INSERT INTO alerts (patient_id, day, signals, level, summary, status, reply, resolved_day) VALUES (?, 5, ?, 'red', ?, 'resolved', ?, 5)").run(
      id, J(['wound']),
      J(bi('【ReStart90 联系医生摘要】\n患者：林凯，52岁；左侧膝下截肢（2026-10-08 手术）\n出院第 5 天（2026-10-31）\n触发信号：伤口发红、发热、肿胀、渗液、有异味、出血或裂开\n今天记录：异常渗液\n患者原话："残端下面有点黄色的水"\n系统已做：暂停 残肢观察与护理、床椅转移，停止所有能力升级\n建议：今天联系手术医生或伤口门诊',
        '[ReStart90 summary for the doctor]\nPatient: Lin Kai, 52; left below-knee amputation (surgery 2026-10-08)\nDay 5 after discharge (2026-10-31)\nSignals: Wound red, warm, swollen, leaking, smelly, bleeding or opening\nRecorded today: Unusual fluid\nPatient’s words: "a bit of yellow fluid under the stump"\nAlready done: paused Residual limb care, Bed-to-wheelchair transfer; all level upgrades stopped\nNext step: Contact the surgeon or wound clinic today')),
      J(bi('杨医生已上门换药。渗液为少量浆液，没有感染迹象。明天恢复训练，继续观察。', 'Dr Yang changed the dressing at home. Small amount of serous fluid, no sign of infection. Resume training tomorrow and keep watching.')),
    );

    const N = (day, role, zh, en, priv = 0) => db.prepare('INSERT INTO notes (patient_id, day, role, text, private) VALUES (?, ?, ?, ?, ?)').run(id, day, role, J(bi(zh, en)), priv);
    N(2, 'patient', '我不想看那条腿。', 'I don’t want to look at the leg.', 1);
    N(3, 'rehab', '卫生室复诊：转移已经能自己完成，会先锁刹车。他同意让我看到他的记录。', 'Clinic visit: transfers on his own and locks the brakes first. He agreed to let me see his records.');
    N(5, 'rehab', '已上门换药，明天恢复训练。', 'Home visit to change the dressing; resume training tomorrow.');
    N(6, 'patient', '水杯放在柜子上，看得见，够不着。今天把水、电话和药都挪到了床边的矮凳上。', 'The glass was on the cupboard: I could see it but not reach it. Today I moved the water, phone and medicine onto the low stool by the bed.');
    N(7, 'patient', '邻居在门口看着，我自己从床上挪到了轮椅上。比想象中稳。', 'With a neighbour watching from the door, I moved from bed to wheelchair myself. Steadier than I expected.');
    N(8, 'patient', '银匠桌上的灰，我擦掉了一点。锤子还不想拿。', 'I wiped a little dust off my silversmith’s bench. Not ready to pick up the hammer yet.');

    // Transfers: system suggested on day 8; Lin Kai is willing and checked his home himself; waiting for the rehab team.
    db.prepare("INSERT INTO pending (patient_id, ability, from_level, to_level, needs, day, reason, patient_ok, family_ok, home_by) VALUES (?, ?, 2, 3, ?, 8, ?, 1, 1, 'self')").run(id, 'transfer', 'rehab', J(bi('连续 3 次完成，没有红旗信号', 'Completed 3 times in a row with no red flags')));

    const snap = (d) => ({ limbcare: limbLv(d), transfer: transferLv(d), grooming: 1, toilet: 1, dressing: 1, outing: 1 });
    for (let d = 1; d <= 8; d++) db.prepare('INSERT INTO snapshots (patient_id, day, levels) VALUES (?, ?, ?)').run(id, d, J(snap(d)));

    const T = (t, done) => db.prepare('INSERT INTO todos (patient_id, todo_id, text, done) VALUES (?, ?, ?, ?)').run(id, t, J(HOME_TODOS[t]), done ? 1 : 0);
    T('nightLight', true); T('grabBar', false); T('threshold', false);

    db.prepare('INSERT INTO reviews (patient_id, period, role, text) VALUES (?, ?, ?, ?)').run(id, 'w1', 'patient', '第一周我只想躺着。现在至少知道今天要做哪三件事。');
    db.prepare('INSERT INTO reviews (patient_id, period, role, text) VALUES (?, ?, ?, ?)').run(id, 'w1', 'rehab', '转移进步快。下周重点：洗漱从"替我做"走到"陪我做"；常用物品一直放在坐着够得到的地方。');
  });
  return { id };
}

export { LEVELS, ABILITIES, PHASES, SIGNALS, SOURCES };
