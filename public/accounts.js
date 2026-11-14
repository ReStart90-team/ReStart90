// Account UI. A POST response alone is never treated as proof of a stored session.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state = { user:null, csrfToken:'', loaded:false, persistent:false };
let config = {};
let sessionGeneration = 0;
const en = () => document.documentElement.lang === 'en';
const text = (zh, english) => en() ? english : zh;
export function configureAccounts(options) { config = options; }
export function accountState() { return state; }
export function accountHeaders() { return state.csrfToken ? {'X-CSRF-Token':state.csrfToken} : {}; }
export function recordRoute(record, demoRole = 'patient', id = record?.id) {
  const role = record?.private ? (record.accessRole || record.access?.role) : demoRole;
  const view = {patient:'p',family:'f',rehab:'r'}[role];
  return view && id ? `#/${view}/${encodeURIComponent(id)}` : '#/profiles';
}
async function request(path, body) {
  const generation = sessionGeneration, user = state.user?.openId;
  const guard = () => { if (generation !== sessionGeneration || user !== state.user?.openId) throw Object.assign(new Error('stale'), {stale:true}); };
  try {
    const res = await fetch(`/api${path}`, {credentials:'include',cache:'no-store',...(body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json',...accountHeaders()},body:JSON.stringify(body)})});
    const out = await res.json().catch(()=>({}));
    guard();
    if (!res.ok) throw Object.assign(new Error(out.i18n?.[en()?'en':'zh'] || out.error || text('请求未完成，请稍后再试。','Request failed. Please try again.')), {status:res.status});
    return out;
  } catch (error) { guard(); throw error; }
}
export async function refreshAccount() {
  const generation = ++sessionGeneration;
  const previous = state.user?.openId;
  try { const result = await request('/account/session'); if (generation !== sessionGeneration) return state; state = {...result,loaded:true}; }
  catch (error) { if (generation !== sessionGeneration || error.stale) return state; state = {user:null,csrfToken:'',loaded:true,persistent:false,error:error.message}; }
  if (previous !== state.user?.openId) config.onUserChange?.(state.user);
  return state;
}
function afterLogin() {
  const target = sessionStorage.getItem('rs90.account.next') || '#/profiles';
  sessionStorage.removeItem('rs90.account.next');
  config.go?.(/^#\/(start|profiles)$|^#\/join\/[A-Za-z0-9_-]{43}$/.test(target) ? target : '#/profiles');
}
export function rememberAccountTarget(target) { sessionStorage.setItem('rs90.account.next',target); }
function shell(title, body, header) { return `${header}<div class="page account-page"><div class="wrap"><div class="head"><div><h1>${title}</h1></div></div>${body}</div></div>`; }
export function showAccount(container, header, initial = 'login') {
  let mode = initial;
  const draw = () => {
    if (state.user) return showProfiles(container, header);
    const recovery = mode === 'recover';
    const signup = mode === 'register';
    container.innerHTML = shell(text('属于你的90天记录','Your own 90-day record'), `<section class="panel account-form-panel">
      <p class="account-lead">${text('同一账号，手机和电脑查看同一份档案。','The same account brings your records to phone and computer.')}</p>
      <div class="account-tabs" role="tablist">${['login','register'].map(m=>`<button type="button" role="tab" aria-selected="${mode===m}" data-account-mode="${m}">${m==='login'?text('登录','Log in'):text('注册','Register')}</button>`).join('')}</div>
      <form id="account-form">
        <label class="f"><span>${text('手机号','Phone number')}</span><input name="phone" type="tel" inputmode="tel" autocomplete="username" placeholder="${text('中国手机号，或 +国家码','Phone, including country code +…')}" required maxlength="24"></label>
        ${recovery?`<label class="f"><span>${text('恢复码','Recovery code')}</span><input name="recoveryCode" autocomplete="off" required maxlength="80"></label>`:''}
        <label class="f"><span>${recovery?text('新密码','New password'):text('密码','Password')}</span><input name="password" type="password" autocomplete="${signup||recovery?'new-password':'current-password'}" required minlength="12" maxlength="128"><small>${text('至少12个字符，可以使用容易记住的长句。','At least 12 characters; a memorable passphrase works.')}</small></label>
        <p class="account-status" role="status">${esc(state.error||'')}</p>
        <button class="btn sun" type="submit">${recovery?text('恢复账号','Recover account'):signup?text('创建账号','Create account'):text('登录','Log in')}</button>
      </form>
      <button class="account-text-btn" type="button" data-account-mode="${recovery?'login':'recover'}">${recovery?text('返回登录','Back to login'):text('忘记密码？使用恢复码','Forgot your password? Use your recovery code')}</button>
      <details class="account-privacy"><summary>${text('账号与隐私说明','Account and privacy')}</summary><p>${text('暂不发送短信。手机号仅作为登录名，没有被标成已验证；请勿使用他人的号码。私人档案按账号隔离，其他参与者必须由持有人邀请。平台不验证医护执业资格，医疗模板仍需专业审核。旧的浏览器演示不会自动变成私人档案。','No SMS is sent. The phone number is an unverified login name; do not use someone else’s number. Private records are account-scoped. Other participants need an owner invitation. Professional credentials are not verified, and clinical templates still need review. Old browser demos are not automatically imported.')}</p></details>
      <a class="account-demo-link" href="#/p/demo-lin">${text('先体验合成演示病例','Try the synthetic demo first')} ↗</a>
    </section>`, header);
    container.querySelectorAll('[data-account-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.accountMode;draw();});
    container.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget, submit = form.querySelector('[type=submit]'), status = container.querySelector('.account-status');
      submit.disabled = true; status.textContent = text('正在验证…','Verifying…');
      try {
        const data = new FormData(form);
        const body = {phone:data.get('phone'),password:data.get('password')};
        if (recovery) { body.newPassword=body.password;delete body.password;body.recoveryCode=data.get('recoveryCode'); }
        const result = await request(`/account/${recovery?'recover':signup?'register':'login'}`,body);
        await refreshAccount();
        if (result.recoveryCode) {
          container.innerHTML = shell(text('先保存你的恢复码','Save your recovery code'), `<section class="panel account-form-panel"><p>${text('没有短信找回服务。请把这段恢复码保存在安全的地方，不要发给别人；忘记密码时用它恢复账号。','There is no SMS recovery. Save this code securely, and never share it. It lets you recover a forgotten password.')}</p><code class="recovery-code">${esc(result.recoveryCode)}</code><button class="btn ghost" id="copy-recovery">${text('复制恢复码','Copy recovery code')}</button><p role="status" id="recovery-status"></p><button class="btn sun" id="recovery-done">${text('我已保存，继续','Saved — continue')}</button></section>`,header);
          container.querySelector('#copy-recovery').onclick=async()=>{try{await navigator.clipboard.writeText(result.recoveryCode);container.querySelector('#recovery-status').textContent=text('已复制，请安全保存。','Copied. Keep it safe.');}catch{container.querySelector('#recovery-status').textContent=text('请选中上面的恢复码手动复制。','Select and copy the code above.');}};
          container.querySelector('#recovery-done').onclick=()=>state.user?afterLogin():showAccount(container,header);
        } else if (!state.user) { throw new Error(text('账户已验证，但浏览器未保留登录Cookie。请在网站独立窗口登录，不要重复注册。','Credentials were verified, but this browser did not retain the login cookie. Log in in a standalone website tab; do not register again.')); }
        else afterLogin();
      } catch(error) { if(status.isConnected) status.textContent=error.message; }
      finally { if(submit.isConnected) submit.disabled=false; }
    };
  };
  return draw();
}
export async function showProfiles(container, header) {
  if (!state.user) { rememberAccountTarget('#/profiles');return showAccount(container,header); }
  const route = location.hash;
  container.innerHTML=shell(text('我的档案','My records'),`<p role="status">${text('正在读取你的档案…','Loading your records…')}</p>`,header);
  try {
    const rows = await request('/patients');
    if(location.hash!==route)return;
    const privateRows=rows.filter(p=>p.private);
    const roleName=r=>({patient:text('档案持有人','Record owner'),family:text('家属参与者','Family participant'),rehab:text('康复参与者','Rehab participant')}[r]||r);
    container.innerHTML=shell(text('我的档案','My records'), `<div class="account-user-line"><span>${esc(state.user.phoneMasked)} · ${text('手机号未验证','Phone unverified')}</span><button class="account-text-btn" id="account-logout">${text('退出登录','Log out')}</button></div>
      <a class="btn sun" href="#/start">＋ ${text('新建档案','New profile')}</a>
      <div class="account-records">${privateRows.length?privateRows.map(p=>{const role=p.accessRole||p.access?.role;const name=p.name?.[en()?'en':'zh']||p.name||p.profile?.name||text('未命名档案','Unnamed record');return `<a class="panel account-record" href="${recordRoute(p)}"><span class="account-record-role">${esc(roleName(role))}</span><h2>${esc(name)}</h2><p>${text('记录第','Record day ')} ${Number(p.day||p.currentDay||1)} ${text('天','')} · ${text('账户保存','Account saved')}</p><span class="account-record-open">${text('查看记录','Open record')} ↗</span></a>`;}).join(''):`<section class="panel"><h2>${text('从你的第一份档案开始','Start your first record')}</h2><p>${text('登录后新建的档案会保存在账户里。手机和电脑登录这个账号即可读取。','New records are saved to your account and can be opened after login on phone and computer.')}</p></section>`}</div>
      <details class="account-privacy"><summary>${text('被邀请的档案与旧演示','Shared records and old demos')}</summary><p>${text('收到授权链接后，登录并同意加入，档案才会出现在这里。普通浏览器演示和以前未登录建立的测试档案仍属临时演示，不会擅自归入账号。','Shared records appear after you log in and accept an invitation. Anonymous browser demos and previous test profiles remain temporary; they are not silently claimed by this account.')}</p><a href="#/p/demo-lin">${text('查看合成示例A','Open synthetic demo A')}</a></details>`,header);
    container.querySelector('#account-logout').onclick=async()=>{await request('/account/logout',{});await refreshAccount();config.go?.('#/');};
  } catch(error) {
    if (error.stale || location.hash !== route) return;
    if (error.status === 401) {
      await refreshAccount();
      if (location.hash !== route) return;
      if (!state.user) { rememberAccountTarget('#/profiles'); return showAccount(container, header); }
    }
    if(location.hash===route)container.innerHTML=shell(text('我的档案','My records'),`<p class="banner red">${esc(error.message)}</p><a href="#/account">${text('重新登录','Log in again')}</a>`,header);
  }
}
export async function showJoin(container,header,token) {
  if(!state.user){rememberAccountTarget(`#/join/${token}`);return showAccount(container,header);}
  container.innerHTML=shell(text('加入受邀档案','Join an invited record'),`<section class="panel account-form-panel"><p>${text('接受邀请后，你会以邀请指定的家属或康复参与者身份查看这份档案。不会获得其他患者的访问权。','Accepting grants the invitation’s family or rehab role for this record only. It grants no access to other patients.')}</p><p class="fine">${text('请先确认患者同意与你共享。平台未核验医护资质，参与专业确认前请核对真实医嘱与授权。','Confirm the patient’s consent. Professional credentials are not verified by this platform; check actual orders and authorization before clinical confirmations.')}</p><button class="btn sun" id="join-account">${text('同意并加入','Accept invitation')}</button><p role="status" id="join-status"></p></section>`,header);
  container.querySelector('#join-account').onclick=async event=>{event.target.disabled=true;try{const r=await request('/invites/accept',{token});config.go?.(`#/${{patient:'p',family:'f',rehab:'r'}[r.role]}/${r.caseId}`);}catch(error){container.querySelector('#join-status').textContent=error.message;event.target.disabled=false;}};
}
export function mountParticipants(d) {
  if (!d?.private || !d.access?.isOwner || document.getElementById('case-participants')) return;
  const host=document.querySelector('.work-content .work-panel:last-child')||document.querySelector('.work-content')||document.querySelector('.page .wrap');
  if(!host)return;
  const fold=document.createElement('details');fold.id='case-participants';fold.className='panel account-participants';
  fold.innerHTML=`<summary>${text('邀请或管理参与者','Invite or manage participants')}</summary><div><p>${text('只有接受邀请的账号能查看这份档案。请确认患者同意，并自行核对参与者身份和专业资质。授权链接7天有效，只能使用一次。','Only an invited account can join this record. Confirm patient consent and check participants’ identities and qualifications. Links last 7 days and are single-use.')}</p><div class="row"><button class="btn ghost" data-invite-role="family">${text('邀请家属','Invite family')}</button><button class="btn ghost" data-invite-role="rehab">${text('邀请康复参与者','Invite rehab participant')}</button></div><p role="status" class="invite-status"></p><div class="invite-link"></div><button class="account-text-btn" data-member-load>${text('查看已授权参与者','View authorized participants')}</button><div class="member-list"></div></div>`;
  host.append(fold);
  fold.querySelectorAll('[data-invite-role]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const result=await request(`/patients/${d.id}/invites`,{role:button.dataset.inviteRole});const url=`${location.origin}${location.pathname}#/join/${result.token}`;const box=fold.querySelector('.invite-link');box.innerHTML=`<input readonly aria-label="${text('授权链接','Invitation link')}"><button class="btn ghost">${text('复制授权链接','Copy invitation link')}</button>`;box.querySelector('input').value=url;box.querySelector('button').onclick=async()=>{try{await navigator.clipboard.writeText(url);fold.querySelector('.invite-status').textContent=text('已复制，请私下发给邀请对象。','Copied. Share privately with your invitee.');}catch{box.querySelector('input').select();}};fold.querySelector('.invite-status').textContent=location.hostname.endsWith('.manus.computer')?text('这是开发预览网址；正式分享请从已发布网站生成链接。','This is a development preview URL. Create sharing links on the published site.'):text('请私下分享，不要公开发布。','Share privately, not publicly.');}catch(error){fold.querySelector('.invite-status').textContent=error.message;}finally{button.disabled=false;}});
  fold.querySelector('[data-member-load]').onclick=async()=>{try{const result=await request(`/patients/${d.id}/members`);const list=Array.isArray(result)?result:result.members||[];const box=fold.querySelector('.member-list');box.innerHTML=list.map(m=>`<div><span>${esc(m.name)} · ${esc(m.role)}</span>${m.role!=='patient'?`<button class="account-text-btn" data-revoke="${esc(m.uid)}">${text('撤销授权','Revoke access')}</button>`:''}</div>`).join('');box.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{if(!confirm(text('撤销后，这个账号将不能再查看此档案。确定撤销？','This account will lose access to this record. Revoke?')))return;await request(`/patients/${d.id}/members/revoke`,{uid:b.dataset.revoke});b.closest('div').remove();});}catch(error){fold.querySelector('.invite-status').textContent=error.message;}};
}
