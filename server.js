import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './lib/db.js';
import * as E from './lib/engine.js';
import { extractDischarge, parseNote, aiStatus, listen } from './lib/ai.js';
import { ABILITIES, LEVELS, PHASES, SIGNALS, SOURCES, PEER_STORIES } from './lib/content.js';
import { SAMPLE_DISCHARGE } from './lib/samples.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');
const PORT = Number(process.env.PORT) || 3090;
const ROLES = ['patient', 'family', 'rehab'];

const db = openDb();

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
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; Max-Age=${SANDBOX_DAYS * 86400}; SameSite=Lax; HttpOnly${secure}`);
  }
  const now = Date.now();
  if (now - (seen.get(token) || 0) > 60_000) {
    seen.set(token, now);
    db.prepare("INSERT INTO sandboxes (token) VALUES (?) ON CONFLICT(token) DO UPDATE SET last_seen = datetime('now')").run(token);
  }
  return token;
}

const demoIdFor = (sb) => `demo-lin-${sb}`;

function ensureDemo(sb) {
  if (!db.prepare('SELECT 1 FROM patients WHERE id = ? AND sandbox = ?').get(demoIdFor(sb), sb)) E.seedDemo(db, { id: demoIdFor(sb), sandbox: sb });
}

// The client always says "demo-lin"; inside a sandbox that means this visitor's own copy.
function patientId(sb, id) {
  const real = id === E.DEMO_ID ? (ensureDemo(sb), demoIdFor(sb)) : id;
  if (!db.prepare('SELECT 1 FROM patients WHERE id = ? AND sandbox = ?').get(real, sb)) throw E.httpError(404, '找不到这位患者', 'Patient not found');
  return real;
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

route('GET', '/api/health', () => ({ ok: true }));

route('GET', '/api/meta', async () => ({
  levels: LEVELS, phases: PHASES, signals: SIGNALS, sources: SOURCES, peers: PEER_STORIES,
  abilities: ABILITIES.map(({ id, name, life, risk, phase, track, levels, smaller, noDo }) => ({ id, name, life, risk, phase, track, levels, smaller, noDo })),
  sample: SAMPLE_DISCHARGE,
  ai: await aiStatus(),
}));

route('POST', '/api/extract', async ({ body, ip }) => {
  if (!body.text && !body.pdfBase64) throw E.httpError(400, '请提供出院小结', 'Provide a discharge summary');
  if ((body.text || '').length > 60000) throw E.httpError(413, '文字太长，请只粘贴出院小结', 'Text too long; paste the discharge summary only');
  return extractDischarge({ text: body.text, pdfBase64: body.pdfBase64, lang: body.lang === 'en' ? 'en' : 'zh', offline: aiOffline(ip) });
});

route('GET', '/api/patients', ({ sb }) => {
  ensureDemo(sb);
  return E.rehabOverview(db, sb).map((p) => (p.id === demoIdFor(sb) ? { ...p, id: E.DEMO_ID } : p));
});
route('POST', '/api/patients', ({ body, sb }) => E.createPatient(db, body, sb));
route('GET', '/api/patients/:id', ({ params, query }) => E.patientState(db, params.id, query.get('role') || 'patient'));
route('GET', '/api/patients/:id/map', ({ params }) => E.map90(db, params.id));
route('GET', '/api/patients/:id/review', ({ params, query }) => E.review(db, params.id, query.get('type') === 'm' ? 'm' : 'w', Math.max(1, Number(query.get('index')) || 1)));
route('POST', '/api/patients/:id/review', ({ params, body }) => E.saveReview(db, params.id, { ...body, role: role(body.role) }));
route('POST', '/api/patients/:id/logs', ({ params, body }) => E.logTask(db, params.id, body));
route('POST', '/api/patients/:id/plan', ({ params, body }) => E.logPlan(db, params.id, body));
route('POST', '/api/patients/:id/help', ({ params, body }) => E.logHelp(db, params.id, body));
route('POST', '/api/patients/:id/checkin', async ({ params, body, ip }) => {
  const parsed = await parseNote(body.note || '', { offline: !body.note || aiOffline(ip) });
  return { ...E.checkin(db, params.id, body, parsed), parsed };
});
route('POST', '/api/patients/:id/pending/:pid', ({ params, body }) => E.decidePending(db, params.id, Number(params.pid), { ...body, role: role(body.role) }));
route('POST', '/api/patients/:id/abilities/:ability', ({ params, body }) => E.adjustAbility(db, params.id, params.ability, body));
route('POST', '/api/patients/:id/alerts/:aid/resolve', ({ params, body }) => E.resolveAlert(db, params.id, Number(params.aid), body));
route('POST', '/api/patients/:id/notes', ({ params, body }) => E.addNote(db, params.id, { role: role(body.role), text: body.text, private: !!body.private }));
route('POST', '/api/patients/:id/todos/:tid', ({ params, body }) => E.toggleTodo(db, params.id, params.tid, body.done));
route('POST', '/api/patients/:id/agent', async ({ params, body, ip }) => {
  const needsParse = ['normal', 'talk'].includes(body.intent);
  const offline = needsParse && aiOffline(ip);
  const parsed = needsParse ? await parseNote(body.text || '', { offline }) : null;
  const listened = body.intent === 'talk' && !parsed?.signals?.includes('crisis') ? await listen(body.text, { offline }) : null;
  return E.agentReply(db, params.id, body, parsed, listened);
});
route('POST', '/api/patients/:id/confirm-plan', ({ params, body }) => E.confirmPlan(db, params.id, body));
route('POST', '/api/patients/:id/advance', ({ params }) => E.advanceDay(db, params.id));
route('POST', '/api/demo/reset', ({ sb }) => { E.seedDemo(db, { id: demoIdFor(sb), sandbox: sb }); return { id: E.DEMO_ID }; });

function role(r) {
  if (!ROLES.includes(r)) throw E.httpError(400, '角色无效', 'Invalid role');
  return r;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

// Self-hosted typefaces (OFL), served straight from the installed packages; each file is immutable per version.
const VENDOR = { overpass: '@fontsource-variable/overpass', 'noto-sans-sc': '@fontsource-variable/noto-sans-sc' };
function serveVendor(res, pathname) {
  const [, , pkg, ...rest] = pathname.split('/');
  const root = VENDOR[pkg] && path.join(here, 'node_modules', VENDOR[pkg]);
  const file = root && path.normalize(path.join(root, ...rest));
  if (!root || !file.startsWith(root) || !/\.(css|woff2)$/.test(file)) return send(res, 404, { error: 'not found' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': file.endsWith('.css') ? MIME['.css'] : 'font/woff2', 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.end(data);
  });
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith('/vendor/')) return serveVendor(res, pathname);
  const file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
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
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, decodeURIComponent(url.pathname));
  const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
  if (!r) return send(res, 404, { error: 'Not found', i18n: { zh: '接口不存在', en: 'Not found' } });
  try {
    const m = url.pathname.match(r.re);
    const sb = sandboxOf(req, res);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    if (params.id) params.id = patientId(sb, params.id);
    // Only the discharge-summary upload may carry a PDF; everything else is small JSON.
    const body = req.method === 'POST' ? await readBody(req, url.pathname === '/api/extract' ? 15 * 1024 * 1024 : 256 * 1024) : {};
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
    const out = await r.handler({ params, query: url.searchParams, body, sb, ip });
    send(res, 200, out ?? { ok: true });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    send(res, status, { error: err.message, i18n: err.i18n || (status === 500 ? { zh: '服务器出错了，请重试', en: 'Server error, please retry' } : null) });
  }
});

server.listen(PORT, async () => {
  const ai = await aiStatus();
  console.log(`ReStart90 running at http://localhost:${PORT}  (AI: ${ai.enabled ? ai.model : 'offline mode'})`);
});
