import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// No server, browser, secrets, database or on-disk storage. Execute the real
// front-end source with in-memory fetch/storage/DOM doubles only.
const source = name => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const response = (body, status = 200) => ({ ok:status < 400, status, statusText:'test error', json:async () => body });
const plain = value => JSON.parse(JSON.stringify(value));
function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { values, getItem:key => values.get(key) ?? null, setItem:(key, value) => values.set(key, String(value)), removeItem:key => values.delete(key) };
}
class Node {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.innerHTML = ''; this.textContent = ''; this.value = ''; this.isConnected = true; this.classList = { add() {}, toggle() {}, contains:() => false }; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); return node; }
  setAttribute() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
  remove() {}
  focus() {}
  scrollTo() {}
}
function environment(seed) {
  const nodes = new Map(['app','top','demobar','riri-root','ag-text','float-ag-text'].map(id => [id, new Node()]));
  const form = new Node('form');
  nodes.get('app').querySelector = selector => selector === 'form' ? form : selector === '#account-logout' ? new Node('button') : null;
  const location = { hash:'#/p/A', search:'', origin:'https://example.test', pathname:'/', hostname:'example.test' };
  const document = { documentElement:{ lang:'zh-CN' }, body:new Node('body'), getElementById:id => nodes.get(id) || null, querySelector:() => null, querySelectorAll:() => [], createElement:tag => new Node(tag), addEventListener() {} };
  const localStorage = storage(seed), sessionStorage = storage();
  const context = vm.createContext({ document, location, localStorage, sessionStorage, URLSearchParams, console, setTimeout:() => 0, clearTimeout() {}, matchMedia:() => ({matches:true}), navigator:{}, window:{scrollY:0,scrollTo() {},addEventListener() {},matchMedia:() => ({matches:true})}, fetch:async () => { throw new Error('unexpected fetch'); } });
  return { context, nodes, location, document, localStorage, sessionStorage };
}
function accounts(env) {
  const context = vm.createContext({ ...env.context });
  vm.runInContext(source('accounts.js').replace(/^export /gm, '') + '\nglobalThis.accounts = {configureAccounts,accountState,accountHeaders,refreshAccount,rememberAccountTarget,showAccount,showProfiles,showJoin,mountParticipants,recordRoute};', context);
  return { context, ...context.accounts };
}
function app(seed) {
  const env = environment(seed);
  const account = accounts(env);
  Object.assign(env.context, account, { syncVisuals() {}, applyWorkspace() {}, enhanceReview() {}, syncRiriPosition() {} });
  const code = source('app.js').replace(/^import .*;\n/gm, '').replace(/\(async function init\(\) \{[\s\S]*?\n\}\)\(\);/, '');
  vm.runInContext(code + '\nglobalThis.app = {S,STALE,api,read,loadPatient,actions,render,viewLanding,viewRehabList,agentPanel,checkinPanel,navigate,selectPatient,chatContext,chatHistory,saveChat};', env.context);
  // Exercise actions without rendering all medical UI fixtures after success.
  vm.runInContext('render = async () => {};', env.context);
  return { ...env, account, ...env.context.app };
}
function patient(id = 'A', extra = {}) { return { id, private:true, accessRole:'patient', day:1, date:'2026-11-09', baselinePain:2, checkin:null, profile:{name:id}, ...extra }; }
function loaded(h, id = 'A', extra = {}) {
  h.S.pid = id; h.S.dataPid = id; h.S.data = patient(id, extra);
  h.S.ui.ckScope = JSON.stringify([h.account.accountState().user?.openId || '', id, `${h.S.data.date}:${h.S.data.day}`]);
}
async function login(h, id = 'user-A') {
  h.account.context.fetch = async () => response({user:{openId:id,phoneMasked:'test'},csrfToken:'test-token',persistent:true});
  await h.account.refreshAccount();
}
async function stale(promise, h) { await assert.rejects(promise, error => error === h.STALE); }

for (const target of ['B', 'demo-lin']) {
  test(`late private send is discarded on A -> ${target}, never stored locally`, async () => {
    const h = app(); await login(h); loaded(h);
    h.nodes.get('ag-text').value = 'A private note';
    const pending = deferred(); let request;
    h.context.fetch = (url, options) => { request = {url,options}; return pending.promise; };
    const send = h.actions['agent-send']({dataset:{}});
    h.selectPatient(target); loaded(h, target, {private:target !== 'demo-lin'});
    pending.resolve(response({reply:{zh:'private reply'}}));
    await stale(send, h);
    assert.equal(request.url, '/api/patients/A/agent');
    assert.equal(request.options.headers['X-Restart90-Day'], '1');
    assert.equal(h.S.ui.agent, null);
    assert.equal(h.S.ui.privateChat, undefined);
    assert.equal([...h.localStorage.values.keys()].some(key => key.startsWith('rs90.chat.')), false);
  });
}

test('late send after logout/login to another account is discarded even on the same PID/hash', async () => {
  const h = app(); await login(h); loaded(h);
  h.nodes.get('ag-text').value = 'account A secret';
  const pending = deferred(); h.context.fetch = () => pending.promise;
  const send = h.actions['agent-send']({dataset:{}});
  await login(h, 'user-B'); loaded(h);
  pending.resolve(response({reply:{zh:'old'}})); await stale(send, h);
  assert.equal(h.S.ui.privateChat, undefined);
  assert.equal(h.S.ui.agent, undefined);
});

test('same-context private send keeps captured account chat in memory; demo still uses its own local history', async () => {
  const h = app(); await login(h); loaded(h);
  h.context.fetch = async () => response({reply:{zh:'reply A'}});
  h.nodes.get('ag-text').value = 'private A';
  await h.actions['agent-send']({dataset:{}});
  assert.deepEqual(plain(h.S.ui.privateChat['user-A:A']), [{role:'user',text:'private A'},{role:'assistant',text:'reply A'}]);
  assert.equal(h.localStorage.getItem('rs90.chat.A'), null);
  h.selectPatient('demo-lin'); loaded(h, 'demo-lin', {private:false});
  h.nodes.get('ag-text').value = 'demo text';
  await h.actions['agent-send']({dataset:{}});
  assert.match(h.localStorage.getItem('rs90.chat.demo-lin'), /demo text/);
});

for (const intent of ['today','cant']) {
  test(`late ${intent} shortcut is discarded after a case switch`, async () => {
    const h = app(); await login(h); loaded(h);
    const pending = deferred(); h.context.fetch = () => pending.promise;
    const action = h.actions.agent({dataset:{intent,task:'task-A'}});
    h.selectPatient('B'); loaded(h, 'B');
    pending.resolve(response({reply:{zh:'old shortcut'}})); await stale(action, h);
    assert.equal(h.S.ui.agent, null);
    assert.equal(h.S.ui.privateChat, undefined);
  });
}

test('a newer conversation invalidates an earlier send on the same account/case', async () => {
  const h = app(); await login(h); loaded(h);
  h.nodes.get('ag-text').value = 'old conversation';
  const pending = deferred(); h.context.fetch = () => pending.promise;
  const send = h.actions['agent-send']({dataset:{}});
  await h.actions.agent({dataset:{intent:'talk'}});
  pending.resolve(response({reply:{zh:'old'}})); await stale(send, h);
  assert.equal(h.S.ui.agent.intent, 'talk');
  assert.equal(h.S.ui.privateChat, undefined);
});

test('navigation away and back to the same hash invalidates in-flight reads', async () => {
  const h = app(); loaded(h, 'A', {private:false});
  const pending = deferred(); h.context.fetch = () => pending.promise;
  const read = h.read('/patients/A');
  h.location.hash = '#/'; h.navigate(); h.location.hash = '#/p/A'; h.navigate();
  pending.resolve(response(patient('A'))); await stale(read, h);
});

test('loadPatient commits patient and private chat atomically; late A results cannot overwrite B', async () => {
  const h = app(); await login(h); loaded(h);
  const chat = deferred(), started = deferred();
  h.context.fetch = async url => {
    if (url === '/api/patients/A') return response(patient('A'));
    if (url === '/api/patients/A/chat') { started.resolve(); return chat.promise; }
    if (url === '/api/patients/B') return response(patient('B'));
    if (url === '/api/patients/B/chat') return response({messages:[{role:'user',text:'B only'}]});
    throw new Error(url);
  };
  const a = h.loadPatient('A'); await started.promise;
  await h.loadPatient('B');
  chat.resolve(response({messages:[{role:'user',text:'A secret'}]})); await stale(a, h);
  assert.equal(h.S.dataPid, 'B'); assert.equal(h.S.data.id, 'B');
  assert.equal(h.S.ui.privateChat['user-A:A'], undefined);
  assert.equal(h.S.ui.privateChat['user-A:B'][0].text, 'B only');
});

test('loadPatient latest request wins even for the same PID and hash', async () => {
  const h = app(); loaded(h, 'A', {private:false});
  const pending = deferred(); let calls = 0;
  h.context.fetch = () => ++calls === 1 ? pending.promise : Promise.resolve(response(patient('A', {private:false,name:'new'})));
  const old = h.loadPatient('A'); await h.loadPatient('A');
  pending.resolve(response(patient('A', {private:false,name:'old'}))); await stale(old, h);
  assert.equal(h.S.data.name, 'new');
});

test('an in-flight private chat read cannot cross account changes', async () => {
  const h = app(); await login(h); loaded(h);
  const pending = deferred(), started = deferred();
  h.context.fetch = async url => url.endsWith('/chat') ? (started.resolve(), pending.promise) : response(patient());
  const load = h.loadPatient('A'); await started.promise;
  await login(h, 'user-B'); loaded(h);
  pending.resolve(response({messages:[{text:'account A only'}]})); await stale(load, h);
  assert.equal(h.S.ui.privateChat, undefined);
});

test('check-in note is cleared before switching PID; stale draft cannot submit to B', async () => {
  const h = app(); await login(h); loaded(h);
  h.S.ui.ck = {note:'private A body note',symptoms:[]}; h.S.ui.agent = {res:{reply:'A'}};
  const pending = deferred(); h.context.fetch = () => pending.promise;
  const load = h.loadPatient('B');
  assert.equal(h.S.ui.ck, null); assert.equal(h.S.ui.ckScope, null); assert.equal(h.S.ui.agent, null);
  let submissions = 0; h.context.fetch = async () => { submissions++; throw new Error('must not submit'); };
  await h.actions.checkin(); assert.equal(submissions, 0);
  pending.resolve(response(patient('B', {private:false}))); await load;
  assert.equal(h.S.ui.ck, null);
});

test('date/day changes clear check-in draft and agent result and invalidate old sends', async () => {
  const h = app(); await login(h); loaded(h);
  h.S.ui.ck = {note:'yesterday',symptoms:[]}; h.nodes.get('ag-text').value = 'yesterday chat';
  const pending = deferred(); h.context.fetch = () => pending.promise;
  const send = h.actions['agent-send']({dataset:{}});
  h.context.fetch = async url => response(url.endsWith('/chat') ? {messages:[]} : patient('A', {day:2,date:'2026-11-10'}));
  await h.loadPatient('A');
  assert.equal(h.S.ui.ck, null); assert.equal(h.S.ui.agent, null);
  pending.resolve(response({reply:{zh:'yesterday reply'}})); await stale(send, h);
  assert.equal(h.S.ui.ckScope, JSON.stringify(['user-A','A','2026-11-10:2']));
});

test('check-in request uses a snapshot and ignores results after switching account/case', async () => {
  const h = app(); await login(h); loaded(h);
  h.S.ui.ck = {pain:2,mood:3,wound:'normal',note:'A body',symptoms:[]};
  const pending = deferred(); let sent;
  h.context.fetch = (url, options) => { sent = {url,body:JSON.parse(options.body)}; return pending.promise; };
  const action = h.actions.checkin(); h.selectPatient('B'); loaded(h, 'B');
  pending.resolve(response({result:'ok'})); await stale(action, h);
  assert.equal(sent.url, '/api/patients/A/checkin'); assert.equal(sent.body.note, 'A body');
  assert.equal(h.S.ui.ckResult, '');
});

test('401 rendering refreshes the real session, clears old user and displays login without a profile loop', async () => {
  const h = app(); await login(h); loaded(h); h.location.hash = '#/p/A';
  let sessions = 0;
  h.context.fetch = async () => response({error:'expired'},401);
  h.account.context.fetch = async url => { assert.equal(url,'/api/account/session'); sessions++; return response({user:null,csrfToken:'',persistent:false}); };
  await h.render();
  assert.equal(sessions, 1); assert.equal(h.account.accountState().user, null);
  assert.match(h.nodes.get('app').innerHTML, /account-form/);
  assert.equal(h.sessionStorage.getItem('rs90.account.next'), '#/profiles');
});

test('profiles 401 performs session refresh, then draws login rather than stale-user recursion', async () => {
  const h = app(); await login(h); h.location.hash = '#/profiles';
  const urls = [];
  h.account.context.fetch = async url => { urls.push(url); return url === '/api/patients' ? response({error:'expired'},401) : response({user:null,csrfToken:''}); };
  await h.account.showProfiles(h.nodes.get('app'), '');
  assert.deepEqual(urls, ['/api/patients','/api/account/session']);
  assert.equal(h.account.accountState().user, null);
  assert.match(h.nodes.get('app').innerHTML, /account-form/);
});

test('a still-valid session after an unrelated 401 is not falsely logged out or recursively reloaded', async () => {
  const h = app(); await login(h); h.location.hash = '#/profiles';
  let calls = 0;
  h.account.context.fetch = async url => { calls++; return url === '/api/patients' ? response({error:'other unauthorized'},401) : response({user:{openId:'user-A'},csrfToken:'valid'}); };
  await h.account.showProfiles(h.nodes.get('app'), '');
  assert.equal(calls, 2); assert.equal(h.account.accountState().user.openId, 'user-A');
  assert.match(h.nodes.get('app').innerHTML, /other unauthorized/);
});

test('concurrent refreshes never restore an older account over the current one', async () => {
  const h = app(); const old = deferred(); let calls = 0;
  h.account.context.fetch = () => ++calls === 1 ? old.promise : Promise.resolve(response({user:{openId:'new'},csrfToken:'new'}));
  const refresh = h.account.refreshAccount(); await h.account.refreshAccount();
  old.resolve(response({user:{openId:'old'},csrfToken:'old'})); await refresh;
  assert.equal(h.account.accountState().user.openId, 'new');
});

test('real accessRole drives private routes; demo retains patient, family and rehab routes', () => {
  const h = app();
  for (const [role,view] of [['patient','p'],['family','f'],['rehab','r']]) {
    assert.equal(h.account.recordRoute(patient('case', {accessRole:role})), `#/${view}/case`);
    assert.equal(h.account.recordRoute({id:'case',private:true,access:{role}}), `#/${view}/case`);
    assert.equal(h.account.recordRoute({id:'demo-lin',private:false},role), `#/${view}/demo-lin`);
  }
  assert.equal(h.account.recordRoute({id:'case',private:true}), '#/profiles');
});

test('rehab list links and Riri context follow the authorized role, not hard-coded r/p', async () => {
  const h = app(); await login(h); loaded(h,'A',{accessRole:'family'});
  h.S.meta = {peers:[]};
  const panel = h.agentPanel(h.S.data,true);
  assert.match(panel, /href="#\/f\/A"/); assert.doesNotMatch(panel, /href="#\/p\/A"/);
  h.context.fetch = async () => response(['patient','family','rehab'].map((role,i) => ({id:`case${i}`,private:true,accessRole:role,name:role,day:1,phase:{name:{zh:'first'}},autonomy:0,openAlerts:0,pending:0,overHelp:0})));
  await h.viewRehabList();
  for (const route of ['#/p/case0','#/f/case1','#/r/case2']) assert.ok(h.nodes.get('app').innerHTML.includes(`href="${route}"`));
});

test('home and map load authorized patient state without forcing patient role', async () => {
  const h = app({'rs90.pid':'shared','rs90.lastAccount':'user-A'}); await login(h);
  assert.equal(h.S.pid,'shared','same-account startup preserves recent shared case');
  const urls = [];
  h.context.fetch = async url => {
    urls.push(url);
    if (url.includes('demo-lin')) return response({day:9,tasks:{main:[]}});
    if (url.endsWith('/chat')) return response({messages:[]});
    return response(patient('shared',{accessRole:'family'}));
  };
  // End after recovery; remaining landing visuals are unrelated to this guard.
  vm.runInContext('heroRoute = () => { throw new Error("landing-fixture-end"); };', h.context);
  await assert.rejects(h.viewLanding(), /landing-fixture-end/);
  assert.ok(urls.includes('/api/patients/shared'));
  assert.equal(urls.includes('/api/patients/shared?role=patient'),false);
  assert.equal(h.S.data.accessRole,'family');
  assert.match(source('app.js'), /async function viewMap\(id\) \{\s*await loadPatient\(id\);/);
});

test('workspace private contact goes to records while demo contact still opens rehab', () => {
  const env = environment();
  vm.runInContext(source('workspace.js').replace(/^export /gm,'') + '\nglobalThis.setup = (s) => { currentState = s; currentKey = "p:A"; }; globalThis.patientWorkspace = patient;', env.context);
  vm.runInContext('notice = () => {}; selectTab = () => {}; createWorkspace = () => ({root:{},sections:globalThis.sections});', env.context);
  for (const privateCase of [true,false]) {
    const sections = {today:new Node(),progress:new Node(),help:new Node()}; env.context.sections = sections;
    env.context.setup({lang:'zh',pid:'A',data:{id:'A',private:privateCase,pending:[],tasks:{main:[],secondary:[]}},meta:{signals:[]},ui:{}});
    const wrap = new Node(), left = new Node(), right = new Node();
    env.context.patientWorkspace(wrap,{children:[left,right],remove() {}});
    const safety = sections.help.children[0], actions = safety.children.find(n => n.className === 'row');
    assert.equal(actions.children[1].href,privateCase ? '#/profiles' : '#/r/A');
    assert.match(actions.children[1].textContent,privateCase ? /我的档案/ : /康复人员端/);
  }
});

for (const failure of ['401','network']) {
  test(`same-PID late load ${failure} is stale after a newer successful load`, async () => {
    const h = app(); loaded(h,'A',{private:false});
    const pending = deferred(); h.context.fetch = () => pending.promise;
    const load = h.loadPatient('A');
    h.context.fetch = async () => response(patient('A',{private:false,name:'current'}));
    await h.loadPatient('A');
    if (failure === '401') pending.resolve(response({error:'old expired'},401));
    else pending.reject(new Error('old network error'));
    await stale(load,h);
    assert.equal(h.S.data.name,'current');
  });
  test(`a newer conversation drops an old send ${failure}, not just old successes`, async () => {
    const h = app(); await login(h); loaded(h); h.nodes.get('ag-text').value = 'old';
    const pending = deferred(); h.context.fetch = () => pending.promise;
    const send = h.actions['agent-send']({dataset:{}});
    await h.actions.agent({dataset:{intent:'normal'}});
    if (failure === '401') pending.resolve(response({error:'old expired'},401));
    else pending.reject(new Error('old network error'));
    await stale(send,h);
    assert.equal(h.S.ui.agent.intent,'normal');
  });
}

for (const changed of [{date:'2026-11-10'},{day:2}]) {
  test(`feedback isolation resets draft when ${Object.keys(changed)[0]} alone changes`, async () => {
    const h = app(); await login(h); loaded(h); h.S.ui.ck = {note:'old body',symptoms:[]};
    h.context.fetch = async url => response(url.endsWith('/chat') ? {messages:[]} : patient('A',changed));
    await h.loadPatient('A');
    assert.equal(h.S.ui.ck,null); assert.equal(h.S.ui.ckResult,'');
  });
}

test('without a loaded current case, chat cannot fall through to demo localStorage', () => {
  const h = app(); h.S.data = null; h.S.dataPid = null;
  h.localStorage.setItem('rs90.chat.demo-lin',JSON.stringify([{text:'demo only'}]));
  assert.deepEqual(plain(h.chatHistory()),[]);
  assert.throws(() => h.chatContext(), error => error === h.STALE);
});

test('old agent action cannot turn A text into B notes', async () => {
  const h = app(); await login(h); loaded(h); h.S.ui.agent = {recordText:'A private',res:{reply:'A'}};
  h.selectPatient('B'); loaded(h,'B');
  let posts = 0;
  h.context.fetch = async (url,options) => { if (options.method === 'POST') posts++; return response(url.endsWith('/chat') ? {messages:[]} : patient('B')); };
  await h.actions['agent-do']({dataset:{do:'share'}});
  assert.equal(posts,0);
});
