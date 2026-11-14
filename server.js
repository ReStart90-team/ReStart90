import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { openDb } from './lib/db.js';
import { createDurableStore } from './lib/durable.js';
import { createPhoneAuth } from './lib/phone-auth.js';
import * as E from './lib/engine.js';
import { extractDischarge, parseNote, aiStatus, listen } from './lib/ai.js';
import { isRiriIntent, ririReply } from './lib/riri.js';
import { ABILITIES, LEVELS, PHASES, SIGNALS, SOURCES, PEER_STORIES } from './lib/content.js';
import { SAMPLE_DISCHARGE } from './lib/samples.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');
const cliValue = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const PORT = Number(process.env.PORT || cliValue('--port')) || 3090;
const HOST = process.env.HOST || cliValue('--host') || '127.0.0.1';
const ROLES = ['patient', 'family', 'rehab'];

const demoDb = openDb();
const caseContext = new AsyncLocalStorage();
// Existing engine routes remain unchanged: each asynchronous request binds its
// own single-case memory SQLite connection, never a process-global switch.
const db = new Proxy(demoDb, { get(target, key) {
  const active = caseContext.getStore()?.db || target;
  const value = Reflect.get(active, key, active);
  return typeof value === 'function' ? value.bind(active) : value;
} });
const accountConfig = { url: process.env.DATABASE_URL, secret: process.env.RESTART90_DATA_SECRET || process.env.MANUS_JWT_SECRET };
const durable = createDurableStore(accountConfig);
const auth = createPhoneAuth(accountConfig);
let accountState = 'initializing';
const accountInit = Promise.all([durable.init(), auth.init()]).then(() => {
  accountState = 'ready';
}, () => {
  accountState = 'unavailable';
  console.warn('[accounts] Private account/storage initialization unavailable; public demo remains available');
});
async function requireAccounts() {
  await accountInit;
  if (accountState !== 'ready' || !durable.persistent || !auth.available) throw E.httpError(503, '私人账号和持久存储暂不可用，请稍后重试', 'Private accounts and persistent storage are unavailable');
}
async function accountUser(req) {
  await requireAccounts();
  const user = await auth.authenticate(req);
  if (!user) throw E.httpError(401, '请先用手机号和密码登录', 'Phone and password login required');
  return durable.upsertUser({ openId: user.openId, name: user.name || '', email: user.email || '' });
}
async function optionalAccount(req) {
  await accountInit;
  if (accountState !== 'ready') {
    if (/(?:^|;\s*)rs90_account=/.test(req.headers.cookie || '')) await requireAccounts();
    return null;
  }
  const user = await auth.authenticate(req);
  return user ? durable.upsertUser({ openId: user.openId, name: user.name || '', email: user.email || '' }) : null;
}

// PDFs are read locally as text, never sent to a vision model. Poppler is the
// only external dependency; scans, unreadable and encrypted files fail closed.
async function pdfText(pdfBase64) {
  const unreadable = () => E.httpError(422, '无法可靠读取这份 PDF 的文字（可能是扫描件或加密文件）。请粘贴出院小结文字，或使用演示示例；系统不进行图像诊断。', 'Cannot reliably read text from this PDF (it may be scanned or encrypted). Paste the discharge text or use the demo sample. Images are not used for diagnosis.');
  if (typeof pdfBase64 !== 'string') throw E.httpError(400, 'PDF 格式错误', 'Invalid PDF format');
  if (pdfBase64.length > 14 * 1024 * 1024) throw E.httpError(413, 'PDF 太大，请使用 10 MB 以内的文件', 'Use a PDF smaller than 10 MB');
  const encoded = pdfBase64.replace(/\s/g, '');
  if (!encoded || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw E.httpError(400, 'PDF 编码无效', 'Invalid PDF encoding');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > 10 * 1024 * 1024) throw E.httpError(413, 'PDF 太大，请使用 10 MB 以内的文件', 'Use a PDF smaller than 10 MB');
  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw E.httpError(400, '文件不是有效的 PDF', 'The file is not a valid PDF');
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'restart90-pdf-'));
  try {
    const file = path.join(dir, 'discharge.pdf');
    await fs.promises.writeFile(file, bytes, { mode: 0o600 });
    const text = await new Promise((resolve, reject) => {
      const child = spawn('pdftotext', ['-layout', file, '-'], { shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
      const chunks = [];
      let size = 0;
      let finished = false;
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (error) { child.kill('SIGKILL'); reject(error); } else resolve(value);
      };
      const timer = setTimeout(() => finish(unreadable()), 5000);
      child.stdout.on('data', (chunk) => {
        size += chunk.length;
        if (size > 256 * 1024) return finish(E.httpError(413, 'PDF 文字过多，请只提供出院小结', 'Too much PDF text; provide the discharge summary only'));
        chunks.push(chunk);
      });
      child.once('error', () => finish(unreadable()));
      child.once('close', (code) => finish(code === 0 ? null : unreadable(), Buffer.concat(chunks).toString('utf8').replace(/\f/g, '\n').trim()));
    });
    // Require actual letters, not page numbers or extraction control characters.
    if ((text.match(/\p{L}/gu) || []).length < 10 || text.includes('\uFFFD')) throw unreadable();
    if (text.length > 60000) throw E.httpError(413, '文字太长，请只提供出院小结', 'Text too long; provide the discharge summary only');
    return text;
  } finally { await fs.promises.rm(dir, { recursive: true, force: true }); }
}

// ---------- public demo sandboxes ----------
// Every browser gets its own copy of the demo (a cookie token), so one judge pressing
// "red flag" or "reset" never changes what another judge sees. Profiles created in the
// wizard stay inside the same sandbox. Idle sandboxes are swept after a week.
const COOKIE = 'rs90sb';
const TOKEN_RE = /^[A-Za-z0-9_-]{16}$/;
const SANDBOX_DAYS = 7;
const MAX_SANDBOXES = 5000;
const seen = new Map(); // token -> last write time, so last_seen is written at most once a minute

function sandboxOf(req, res) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  let token = raw && TOKEN_RE.test(raw) ? raw : null;
  if (!token) {
    token = crypto.randomBytes(12).toString('base64url');
    const secure = req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; Max-Age=${SANDBOX_DAYS * 86400}; SameSite=${secure ? 'None' : 'Lax'}; HttpOnly${secure ? '; Secure' : ''}`);
  }
  const now = Date.now();
  if (now - (seen.get(token) || 0) > 60_000) {
    seen.set(token, now);
    db.prepare("INSERT INTO sandboxes (token) VALUES (?) ON CONFLICT(token) DO UPDATE SET last_seen = datetime('now')").run(token);
  }
  return token;
}

const demoIdFor = (sb) => `demo-lin-${sb}`;

function seedSandboxDemo(sb) {
  // seedDemo intentionally clears its namespace. Protect older browser-local
  // profiles: neither signing in nor resetting the sample deletes/binds them.
  const others = demoDb.prepare('SELECT id FROM patients WHERE sandbox = ? AND id <> ?').all(sb, demoIdFor(sb));
  const temporary = `preserved-${crypto.randomUUID()}`;
  for (const { id } of others) demoDb.prepare('UPDATE patients SET sandbox = ? WHERE id = ?').run(temporary, id);
  try { return E.seedDemo(demoDb, { id: demoIdFor(sb), sandbox: sb }); }
  finally { for (const { id } of others) demoDb.prepare('UPDATE patients SET sandbox = ? WHERE id = ?').run(sb, id); }
}

function ensureDemo(sb) {
  if (!db.prepare('SELECT 1 FROM patients WHERE id = ? AND sandbox = ?').get(demoIdFor(sb), sb)) seedSandboxDemo(sb);
}

// The client always says "demo-lin"; inside a sandbox that means this visitor's own copy.
function patientId(sb, id) {
  const real = id === E.DEMO_ID ? (ensureDemo(sb), demoIdFor(sb)) : id;
  if (!db.prepare('SELECT 1 FROM patients WHERE id = ? AND sandbox = ?').get(real, sb)) throw E.httpError(404, '找不到这位患者', 'Patient not found');
  return real;
}

function timezoneOf(value) {
  try {
    if (typeof value !== 'string' || value.length > 64) return 'Asia/Shanghai';
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value;
  } catch { return 'Asia/Shanghai'; }
}
function calendarOf(access, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: access.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (key) => parts.find((p) => p.type === key).value;
  const calendarDate = `${part('year')}-${part('month')}-${part('day')}`;
  const elapsed = Math.floor((Date.parse(`${calendarDate}T00:00:00Z`) - Date.parse(`${access.startDate}T00:00:00Z`)) / 86400000) + 1;
  if (!Number.isFinite(elapsed)) throw E.httpError(503, '病例日历数据不可用', 'Private case calendar is unavailable');
  return { calendarDate, calendarEnded: elapsed > 90, day: Math.max(1, Math.min(90, elapsed)) };
}
function syncCalendar(memdb, id, access) {
  const calendar = calendarOf(access);
  let day = E.getPatientRow(memdb, id).current_day;
  while (day < calendar.day) day = E.advanceDay(memdb, id).day;
  if (day !== calendar.day) throw E.httpError(409, '记录日期异常，请刷新并联系支持', 'Case record day is inconsistent; reload and contact support');
  return calendar;
}
function privateResult(out, id, access, calendar) {
  if (!out || typeof out !== 'object' || Array.isArray(out)) return out;
  return { ...out, id: out.id || id, private: true, accessRole: access.role, owner: access.isOwner,
    access: { role: access.role, isOwner: access.isOwner }, timezone: access.timezone, startDate: access.startDate,
    date: calendar.calendarDate, calendarDate: calendar.calendarDate, calendarEnded: calendar.calendarEnded,
    recordingDay: calendar.day, dayBasis: 'recording',
    calendarNotice: { zh: '这是建档后的记录日，不是术后医学阶段；原始出院日期保留在出院资料中。', en: 'This is the recording day since the case was opened, not a postoperative clinical stage. The original discharge date remains in the discharge information.' } };
}
function projectFamilyState(st) {
  // engine already hides flagged note text; its parsed summary also restates it.
  if (st.checkin?.private) st.checkin = { ...st.checkin, note: null, parsed: null };
  st.logs = Object.fromEntries(Object.entries(st.logs).map(([id, log]) => [id, log.kind === 'social' ? { ...log, note: null } : log]));
  return st;
}
function assertPrivateWrite(req, pathname, access, calendar) {
  const suffix = pathname.replace(/^\/api\/patients\/[^/]+/, '');
  if (suffix === '/advance') throw E.httpError(403, '私人病例使用真实日期，不能手动推进演示天数', 'Private cases use real dates; manual demo advance is forbidden');
  const required = /^\/(logs|plan|checkin)$/.test(suffix) ? 'patient' :
    /^\/(help|todos\/[^/]+)$/.test(suffix) ? 'family' :
      /^\/(confirm-plan|abilities\/[^/]+|alerts\/[^/]+\/resolve)$/.test(suffix) ? 'rehab' : null;
  if (required && access.role !== required) throw E.httpError(403, '当前授权角色不能执行此操作', 'This operation is not authorized for your case role');
  if (['/invites', '/members/revoke'].includes(suffix) && !access.isOwner) throw E.httpError(403, '只有患者本人可以管理授权', 'Only the case owner can manage access');
  // Reviews have their own period; membership does not write daily records.
  // Riri may invoke the original safety-report writer, so it also needs the day guard.
  if (!['/review', '/invites', '/members/revoke'].includes(suffix)) {
    if (calendar.calendarEnded) throw E.httpError(409, '90 天记录期已结束，不能将新一天的数据写入第 90 天', 'The 90-day recording period has ended; day 90 cannot be overwritten with a new day');
    if (String(req.headers['x-restart90-day'] || '') !== String(calendar.day)) throw E.httpError(409, '记录日期已变化，请先刷新页面再提交', 'The recording day changed; refresh before submitting');
  }
}

function sweepSandboxes() {
  const old = db.prepare(`SELECT token FROM sandboxes WHERE last_seen < datetime('now', '-${SANDBOX_DAYS} days')
    UNION SELECT token FROM (SELECT token FROM sandboxes ORDER BY last_seen DESC LIMIT -1 OFFSET ${MAX_SANDBOXES})`).all().map((r) => r.token);
  for (const t of old) {
    db.prepare('DELETE FROM patients WHERE sandbox = ?').run(t);
    db.prepare('DELETE FROM sandboxes WHERE token = ?').run(t);
    seen.delete(t);
  }
  if (old.length) console.log(`Swept ${old.length} idle demo sandbox(es)`);
}
sweepSandboxes();
setInterval(sweepSandboxes, 3600_000).unref();

// ---------- AI rate limit (only matters when a model key is configured) ----------
// Past the limit the call still works, just with the offline rules and pregenerated results.
const AI_LIMIT = Number(process.env.RESTART90_AI_LIMIT) || 40; // model calls per visitor IP per hour
const aiHits = new Map();
function aiOffline(ip) {
  const now = Date.now();
  const hits = (aiHits.get(ip) || []).filter((t) => now - t < 3600_000);
  const over = hits.length >= AI_LIMIT;
  if (!over) hits.push(now);
  aiHits.set(ip, hits);
  return over;
}
setInterval(() => { const now = Date.now(); for (const [ip, h] of aiHits) if (!h.some((t) => now - t < 3600_000)) aiHits.delete(ip); }, 600_000).unref();

const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ method, re, keys, handler });
};

route('GET', '/api/health', () => ({ ok: true, publicDemo: true, ready: accountState === 'ready' && durable.persistent && auth.available,
  accountReady: accountState === 'ready' && auth.available, accounts: accountState, persistent: accountState === 'ready' && durable.persistent }));
function accountResponse(out) {
  return { ...out, user: out?.user ? { ...out.user, email: out.user.email || '' } : null, persistent: durable.persistent, accountReady: auth.available && accountState === 'ready' };
}
route('GET', '/api/account/session', async ({ req, res }) => { await requireAccounts(); return accountResponse(await auth.getSession(req, res)); });
for (const action of ['register', 'login', 'logout', 'recover']) route('POST', `/api/account/${action}`, async ({ req, res, body }) => {
  await requireAccounts();
  await auth.validateCsrf(req);
  return accountResponse(await auth[action](req, res, body));
});

route('GET', '/api/meta', async () => ({
  levels: LEVELS, phases: PHASES, signals: SIGNALS, sources: SOURCES, peers: PEER_STORIES,
  abilities: ABILITIES.map(({ id, name, life, risk, phase, track, levels, smaller, noDo }) => ({ id, name, life, risk, phase, track, levels, smaller, noDo })),
  sample: SAMPLE_DISCHARGE,
  ai: await aiStatus(),
}));

route('POST', '/api/extract', async ({ body, ip }) => {
  if (!body.text && !body.pdfBase64) throw E.httpError(400, '请提供出院小结', 'Provide a discharge summary');
  if (body.text != null && typeof body.text !== 'string') throw E.httpError(400, '出院小结必须是文字', 'Discharge text must be a string');
  const text = body.pdfBase64 ? await pdfText(body.pdfBase64) : body.text;
  if ((text || '').length > 60000) throw E.httpError(413, '文字太长，请只粘贴出院小结', 'Text too long; paste the discharge summary only');
  return extractDischarge({ text, pdfBase64: undefined, lang: body.lang === 'en' ? 'en' : 'zh', offline: aiOffline(ip) });
});

route('GET', '/api/patients', async ({ sb, req, res }) => {
  res.setHeader('Cache-Control', 'no-store');
  ensureDemo(sb);
  const demos = E.rehabOverview(db, sb).map((p) => ({ ...p, id: p.id === demoIdFor(sb) ? E.DEMO_ID : p.id, private: false }));
  const user = await optionalAccount(req);
  if (!user) return demos;
  res.setHeader('Cache-Control', 'no-store');
  const cases = await durable.listCases(user, (memdb, access) => {
    const id = memdb.prepare('SELECT id FROM patients').get().id;
    const calendar = syncCalendar(memdb, id, access);
    return privateResult(E.rehabOverview(memdb)[0], id, access, calendar);
  });
  return [...demos, ...cases];
});
route('POST', '/api/patients', async ({ body, req, res }) => {
  res.setHeader('Cache-Control', 'no-store');
  const user = await accountUser(req);
  await auth.validateCsrf(req);
  const timezone = timezoneOf(body.timezone);
  const result = await durable.createCase(user, (memdb, namespace) => E.createPatient(memdb, body, namespace), { timezone });
  return durable.withCase(user, result.id, {}, (memdb, access) => privateResult(result, result.id, access, syncCalendar(memdb, result.id, access)));
});
route('GET', '/api/patients/:id', ({ params, query, access }) => {
  const st = E.patientState(db, params.id, access?.role || query.get('role') || 'patient');
  return access?.role === 'family' ? projectFamilyState(st) : st;
});
route('GET', '/api/patients/:id/map', ({ params }) => E.map90(db, params.id));
route('GET', '/api/patients/:id/review', ({ params, query, access }) => {
  const out = E.review(db, params.id, query.get('type') === 'm' ? 'm' : 'w', Math.max(1, Number(query.get('index')) || 1));
  if (access?.role === 'family') out.notes = out.notes.family === undefined ? {} : { family: out.notes.family };
  return out;
});
route('POST', '/api/patients/:id/review', ({ params, body, access }) => {
  if (access) {
    const match = /^([wm])(\d+)$/.exec(body.period || '');
    if (!match || Number(match[2]) < 1) throw E.httpError(400, '复盘周期无效', 'Invalid review period');
    E.review(db, params.id, match[1], Number(match[2]));
  }
  return E.saveReview(db, params.id, { ...body, role: access?.role || role(body.role) });
});
route('POST', '/api/patients/:id/logs', ({ params, body }) => E.logTask(db, params.id, body));
route('POST', '/api/patients/:id/plan', ({ params, body }) => E.logPlan(db, params.id, body));
route('POST', '/api/patients/:id/help', ({ params, body }) => E.logHelp(db, params.id, body));
route('POST', '/api/patients/:id/checkin', async ({ params, body, ip }) => {
  const parsed = await parseNote(body.note || '', { offline: !body.note || aiOffline(ip) });
  return { ...E.checkin(db, params.id, body, parsed), parsed };
});
route('POST', '/api/patients/:id/pending/:pid', ({ params, body, access }) => E.decidePending(db, params.id, Number(params.pid), { ...body, role: access?.role || role(body.role) }));
route('POST', '/api/patients/:id/abilities/:ability', ({ params, body }) => E.adjustAbility(db, params.id, params.ability, body));
route('POST', '/api/patients/:id/alerts/:aid/resolve', ({ params, body }) => E.resolveAlert(db, params.id, Number(params.aid), body));
route('POST', '/api/patients/:id/notes', ({ params, body, access }) => E.addNote(db, params.id, { role: access?.role || role(body.role), text: body.text, private: !!body.private }));
route('POST', '/api/patients/:id/todos/:tid', ({ params, body }) => E.toggleTodo(db, params.id, params.tid, body.done));
route('GET', '/api/patients/:id/chat', async ({ params, user, access }) => {
  if (!access) throw E.httpError(400, '演示聊天只保存在当前浏览器', 'Demo chat is browser-local');
  return { messages: await durable.getChat(user, params.id) };
});
route('POST', '/api/patients/:id/invites', ({ params, body, user, access }) => {
  if (!access) throw E.httpError(400, '演示病例不能授权真实账号', 'Demo cases cannot invite accounts');
  return durable.createInvite(user, params.id, body.role);
});
route('GET', '/api/patients/:id/members', ({ params, user, access }) => {
  if (!access) throw E.httpError(400, '演示病例没有真实成员', 'Demo cases have no account members');
  return durable.getMembers(user, params.id);
});
route('POST', '/api/patients/:id/members/revoke', ({ params, body, user, access }) => {
  if (!access) throw E.httpError(400, '演示病例没有真实成员', 'Demo cases have no account members');
  return durable.revokeMember(user, params.id, body.uid);
});
route('POST', '/api/invites/accept', async ({ req, res, body }) => {
  res.setHeader('Cache-Control', 'no-store');
  const user = await accountUser(req);
  await auth.validateCsrf(req);
  return durable.acceptInvite(user, body.token);
});
route('POST', '/api/patients/:id/agent', async ({ params, body, ip, access, user }) => {
  if (access) body = { ...body, role: access.role, history: await durable.getChat(user, params.id) };
  if (isRiriIntent(body.intent) || (access && access.role !== 'patient')) {
    const input = access && !isRiriIntent(body.intent) ? { ...body, text: body.text || '请说明我的授权角色可以做什么', intent: 'chat' } : body;
    return ririReply(db, params.id, input, { offline: aiOffline(ip), role: access?.role || 'patient', private: !!access });
  }
  const needsParse = ['normal', 'talk'].includes(body.intent);
  const offline = needsParse && aiOffline(ip);
  const parsed = needsParse ? await parseNote(body.text || '', { offline }) : null;
  const listened = body.intent === 'talk' && !parsed?.signals?.includes('crisis') ? await listen(body.text, { offline }) : null;
  return E.agentReply(db, params.id, body, parsed, listened);
});
route('POST', '/api/patients/:id/confirm-plan', ({ params, body }) => E.confirmPlan(db, params.id, body));
route('POST', '/api/patients/:id/advance', ({ params }) => E.advanceDay(db, params.id));
route('POST', '/api/demo/reset', ({ sb }) => { seedSandboxDemo(sb); return { id: E.DEMO_ID }; });

function role(r) {
  if (!ROLES.includes(r)) throw E.httpError(400, '角色无效', 'Invalid role');
  return r;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.vtt': 'text/vtt; charset=utf-8', '.pdf': 'application/pdf', '.ico': 'image/x-icon', '.json': 'application/json' };

// Self-hosted typefaces (OFL), served straight from the installed packages; each file is immutable per version.
const VENDOR = { overpass: '@fontsource-variable/overpass', 'noto-sans-sc': '@fontsource-variable/noto-sans-sc' };
function serveVendor(res, pathname) {
  const [, , pkg, ...rest] = pathname.split('/');
  const root = VENDOR[pkg] && path.join(here, 'node_modules', VENDOR[pkg]);
  const file = root && path.normalize(path.join(root, ...rest));
  if (!root || !file.startsWith(`${root}${path.sep}`) || !/\.(css|woff2)$/.test(file)) return send(res, 404, { error: 'not found' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': file.endsWith('.css') ? MIME['.css'] : 'font/woff2', 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.end(data);
  });
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith('/vendor/')) return serveVendor(res, pathname);
  const file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(`${PUBLIC}${path.sep}`)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, html) => (e2 ? send(res, 404, { error: 'not found' }) : (res.writeHead(200, { 'Content-Type': MIME['.html'] }), res.end(html))));
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(E.httpError(413, '文件太大', 'Payload too large')); req.removeAllListeners('data'); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(E.httpError(400, '请求格式错误', 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, decodeURIComponent(url.pathname));
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) return send(res, 404, { error: 'Not found', i18n: { zh: '接口不存在', en: 'Not found' } });
    if (url.pathname.startsWith('/api/account/') || url.pathname === '/api/invites/accept' || (req.method === 'POST' && url.pathname === '/api/patients')) res.setHeader('Cache-Control', 'no-store');
    const m = url.pathname.match(r.re);
    const sb = sandboxOf(req, res);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    // Only the discharge-summary upload may carry a PDF; everything else is small JSON.
    const body = req.method === 'POST' ? await readBody(req, url.pathname === '/api/extract' ? 15 * 1024 * 1024 : 256 * 1024) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw E.httpError(400, '请求必须是 JSON 对象', 'Request must be a JSON object');
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
    const ctx = { params, query: url.searchParams, body, sb, ip, req, res };
    let out;
    const browserLocal = params.id && demoDb.prepare('SELECT 1 FROM patients WHERE id = ? AND sandbox = ?').get(params.id, sb);
    if (!params.id || params.id === E.DEMO_ID || browserLocal || params.id === demoIdFor(sb)) {
      if (params.id) params.id = patientId(sb, params.id);
      out = await r.handler(ctx);
    } else {
      res.setHeader('Cache-Control', 'no-store');
      const user = await accountUser(req);
      if (req.method === 'POST') await auth.validateCsrf(req);
      out = await durable.withCase(user, params.id, { requestedRole: url.searchParams.get('role') ?? undefined, write: req.method === 'POST' }, async (memdb, access) => {
        const calendar = syncCalendar(memdb, params.id, access);
        if (req.method === 'POST') assertPrivateWrite(req, url.pathname, access, calendar);
        const result = await caseContext.run({ db: memdb }, () => r.handler({ ...ctx, access, user }));
        if (url.pathname.endsWith('/agent') && result?.reply) result.reply = {
          zh: result.reply.zh?.replace(/出院第 (\d+) 天/g, '记录第 $1 天'),
          en: result.reply.en?.replace(/day (\d+) after discharge/gi, 'recording day $1'),
        };
        return privateResult(result, params.id, access, calendar);
      });
      // Append only server-owned messages after successful case authorization,
      // model response and optimistic snapshot commit; never trust body.history.
      if (req.method === 'POST' && url.pathname.endsWith('/agent')) {
        if (typeof body.text === 'string' && body.text.trim()) await durable.appendChat(user, params.id, { role: 'user', text: body.text.trim() });
        const reply = out.reply?.[body.lang === 'en' ? 'en' : 'zh'];
        if (reply) await durable.appendChat(user, params.id, { role: 'assistant', text: reply });
      }
    }
    send(res, 200, out ?? { ok: true });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error('[server] Request failed');
    send(res, status, { error: status === 500 ? 'Server error, please retry' : err.message, i18n: err.i18n || (status === 500 ? { zh: '服务器出错了，请重试', en: 'Server error, please retry' } : null) });
  }
});

server.listen(PORT, HOST, async () => {
  const ai = await aiStatus();
  console.log(`ReStart90 running at http://${HOST}:${PORT}  (extraction: ${ai.enabled ? ai.model : 'offline mode'}; Riri: ${ai.ririProvider.enabled ? 'DeepSeek configured, connects on request' : 'offline demo'})`);
});

for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  server.close(async () => {
    await Promise.allSettled([durable.close(), auth.close()]);
    demoDb.close();
    process.exit(0);
  });
});
