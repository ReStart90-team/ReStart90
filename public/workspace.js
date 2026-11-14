// Progressive disclosure over the existing, working components.
// Nodes are moved, not re-created: original data-act controls and field IDs remain intact.
let currentState;
let currentKey;
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const zh = (a, b) => currentState.lang === 'en' ? b : a;
const cleanTitle = node => node?.textContent.replace(/\s+/g, ' ').trim() || '';
const move = (target, nodes) => nodes.filter(Boolean).forEach(node => target.append(node));

function fold(node, key, title, description = '', tag = '', task = false) {
  if (!node) return null;
  const wrapper = el('details', `work-fold${task ? ' work-task' : ''}`);
  wrapper.dataset.workFold = `${currentKey}:${key}`;
  wrapper.open = !!currentState.ui.workspaceFolds?.[wrapper.dataset.workFold];
  const summary = el('summary', 'work-fold-summary');
  const text = el('div', 'work-fold-text');
  text.append(el('b', '', title));
  if (description) text.append(el('span', '', description));
  summary.append(text);
  if (tag) summary.append(el('span', 'work-status', tag));
  const action = task && !node.classList.contains('safe')
    ? (tag === zh('待记录', 'Not recorded') ? zh('开始记录', 'Record') : zh('查看记录', 'View record'))
    : zh('查看', 'Open');
  summary.append(el('span', 'work-open', action));
  const inside = el('div', 'work-fold-inside');
  inside.append(node);
  wrapper.append(summary, inside);
  return wrapper;
}

function taskFold(card, i, family = false) {
  const control = card.querySelector('[data-task]');
  const taskId = control?.dataset.task || `safe-${i}`;
  const task = [...currentState.data.tasks.main, ...currentState.data.tasks.secondary].find(t => t.id === taskId);
  const title = !family ? cleanTitle(card.querySelector('h3')) : task ? (currentState.lang === 'en' ? (task.life?.en || task.name?.en) : (task.life?.zh || task.name?.zh)) : cleanTitle(card.querySelector('h3'));
  const selected = card.querySelector(family ? '[data-help][aria-pressed="true"]' : '[data-status][aria-pressed="true"]');
  const hint = family ? zh('按今天的实际情况记录帮助程度', 'Record the help you actually gave today') : zh('安排时间，再记录今天做到的程度', 'Choose a time and record how it went');
  if (card.classList.contains('safe')) return fold(card, `task-${taskId}`, title, zh('今天的安全提醒，点开查看', 'Open today’s safety reminder'), zh('提醒', 'Reminder'), true);
  return fold(card, `task-${taskId}`, title, hint, selected ? cleanTitle(selected) : zh('待记录', 'Not recorded'), true);
}

function createWorkspace(wrap, tabs) {
  const root = el('div', 'work-layout');
  root.dataset.workRoot = currentKey;
  const nav = el('nav', 'work-nav');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', zh('页面分类', 'Page sections'));
  nav.append(el('div', 'work-nav-caption', zh('只看你需要的', 'ONE THING AT A TIME')));
  const content = el('div', 'work-content');
  const sections = {};
  tabs.forEach((tab, i) => {
    const button = el('button', 'work-tab');
    button.id = `work-tab-${tab.id}`;
    button.dataset.workTab = tab.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `work-panel-${tab.id}`);
    button.append(el('span', 'work-tab-number', `0${i + 1}`), el('b', '', tab.title));
    if (tab.count) button.append(el('span', 'work-count', String(tab.count)));
    nav.append(button);
    const panel = el('section', 'work-panel');
    panel.id = `work-panel-${tab.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    const heading = el('div', 'work-panel-heading');
    heading.append(el('h2', '', tab.title));
    if (tab.hint) heading.append(el('p', '', tab.hint));
    panel.append(heading);
    sections[tab.id] = panel;
    content.append(panel);
  });
  root.append(nav, content);
  wrap.append(root);
  return { root, sections };
}

function selectTab(root, id, focus = false) {
  if (!root.querySelector(`[data-work-tab="${id}"]`)) id = root.querySelector('[data-work-tab]').dataset.workTab;
  currentState.ui.workspaceTabs ||= {};
  currentState.ui.workspaceTabs[root.dataset.workRoot] = id;
  root.querySelectorAll('[data-work-tab]').forEach(btn => {
    const selected = btn.dataset.workTab === id;
    btn.setAttribute('aria-selected', String(selected));
    btn.tabIndex = selected ? 0 : -1;
    if (selected && focus) btn.focus();
  });
  root.querySelectorAll('.work-panel').forEach(panel => { panel.hidden = panel.id !== `work-panel-${id}`; });
}

function notice(wrap, id, count) {
  if (!count) return;
  const button = el('button', 'work-notice');
  button.dataset.workJump = id;
  button.append(el('span', '', zh(`${count} 项下一步等你确认`, `${count} next step${count > 1 ? 's' : ''} to review`)), el('b', '', zh('去看看 →', 'Review →')));
  wrap.append(button);
}

function patient(wrap, cols) {
  const d = currentState.data;
  const left = cols.children[0], right = cols.children[1];
  const original = [...wrap.children];
  const asks = original.filter(n => n.matches('.banner.sun,.banner.calm') && n.querySelector('.steps3'));
  const feedback = original.find(n => n.id === 'checkin' || n.querySelector?.('.checkin-done'));
  const peak = original.find(n => n.matches('.peak'));
  const tasks = [...left.children].filter(n => n.matches('.task'));
  const extras = left.querySelector('.rows');
  notice(wrap, 'progress', d.pending.length);
  const { root, sections: s } = createWorkspace(wrap, [
    { id:'today', title:zh('今天做什么', 'Today'), hint:zh('先看身体，再做今天的一小步。点开一项就可以记录。', 'Check in, then take a small step. Open any task to record it.'), count:tasks.length },
    { id:'progress', title:zh('我的进度', 'My progress'), hint:zh('生活在一点点交还给你。下一步，仍由你决定。', 'See your progress. You decide when to take the next step.'), count:d.pending.length },
    { id:'help', title:zh('联系与帮助', 'Help & contact'), hint:zh('有疑问就说出来，不需要自己判断。', 'You do not have to judge what is happening on your own.') }
  ]);
  if (feedback) s.today.append(fold(feedback, 'checkin', zh('今天的身体感觉', 'How you feel today'), d.checkin ? zh('已经记录，点开可以修改', 'Recorded — open to edit') : zh('疼痛 · 伤口 · 心情', 'Pain · wound · mood'), d.checkin ? zh('已记录', 'Recorded') : zh('未填写', 'Not yet')));
  tasks.forEach((card, i) => s.today.append(taskFold(card, i)));
  if (peak) s.today.append(fold(peak, 'wins', zh('今天做到的事', 'Today’s wins')));
  move(s.progress, asks);
  [...right.querySelectorAll(':scope > .panel')].forEach((panel, i) => s.progress.append(fold(panel, `progress-${i}`, cleanTitle(panel.querySelector('h3')))));
  if (extras) s.progress.append(fold(extras, 'extra-tasks', zh('其他可以做的事', 'Other available tasks')));
  const safety = el('section', 'work-help-card');
  safety.append(el('h3', '', zh('需要帮助时，先找对的人', 'Find the right help')));
  safety.append(el('p', '', zh('伤口、身体变化或紧急症状，请联系医生或康复人员。瑞瑞不能替你诊断。', 'For wounds, new symptoms or emergencies, contact a doctor or the rehab team. Riri cannot diagnose.')));
  const actions = el('div', 'row');
  const chat = el('button', 'btn sun', zh('和瑞瑞说说', 'Talk to Riri')); chat.dataset.act = 'riri-toggle';
  const team = el('a', 'btn ghost', d.private ? zh('我的档案', 'My records') : zh('查看康复人员端', 'View rehab team'));
  team.href = d.private ? '#/profiles' : `#/r/${encodeURIComponent(d.id || currentState.pid)}`;
  actions.append(chat, team); safety.append(actions);
  safety.append(el('small', '', d.private
    ? zh('可在档案中邀请或管理授权参与者；不会自动联系真实医生。出现紧急情况请及时就医。', 'Invite or manage authorized participants from your record; no doctor is automatically contacted. Seek urgent care for emergencies.')
    : zh('演示模式：不会自动发送给真实医生。出现紧急情况请及时就医。', 'Demo mode: no real doctor is contacted. Seek urgent care for emergencies.')));
  s.help.append(safety);
  const signals = el('div', 'work-safety-list');
  currentState.meta.signals.forEach(signal => {
    const block = el('p');
    block.append(el('b', '', currentState.lang === 'en' ? signal.label.en : signal.label.zh), el('span', '', currentState.lang === 'en' ? signal.action.en : signal.action.zh));
    signals.append(block);
  });
  s.help.append(fold(signals, 'safety-guide', zh('哪些情况需要及时求助', 'When to seek help')));
  const agent = right.querySelector('.agent');
  if (agent) s.help.append(agent);
  cols.remove();
  selectTab(root, currentState.ui.workspaceTabs?.[currentKey] || 'today');
}

function family(wrap, cols) {
  const d = currentState.data;
  const left = cols.children[0], right = cols.children[1];
  const footer = [...wrap.children].find(n => n.matches('.cols.even'));
  const asks = [...wrap.children].filter(n => n.matches('.banner.sun,.banner.calm') && n.querySelector('.steps3'));
  const cards = [...left.querySelectorAll(':scope > .task')];
  const panels = [...right.querySelectorAll(':scope > .panel')];
  notice(wrap, 'care', asks.length);
  const { root, sections:s } = createWorkspace(wrap, [
    { id:'today', title:zh('今天怎么帮', 'Help today'), hint:zh('点开一项，先看你今天的角色；按这个范围帮助，再记录实际帮了多少。', 'Open a task to see your role. Help within that scope, then record the help you actually gave.'), count:cards.length },
    { id:'home', title:zh('准备与留言', 'Prepare & note'), hint:zh('看看家里要准备什么，写下你观察到的变化，也照顾好自己。', 'Prepare what is needed at home, note the changes you observe, and look after yourself too.') },
    { id:'care', title:zh('放手与安全', 'Step back & safety'), hint:zh('哪些可以让他自己来，哪些仍需要帮助或专业人员确认。', 'See what they can do on their own, and what still needs help or a professional’s confirmation.'), count:asks.length }
  ]);
  cards.forEach((card,i) => s.today.append(taskFold(card,i,true)));
  const others = left.querySelector('.rows');
  if (others?.children.length) s.today.append(fold(others, 'other-help', zh('其他陪伴与提醒', 'Other support')));
  if (panels[2]) s.today.append(fold(panels[2], 'patient-checkin', cleanTitle(panels[2].querySelector('h3'))));
  move(s.care, asks);
  if (panels[0]) s.care.append(fold(panels[0], 'let-go', zh('今天可以放手的事', 'Where you can step back')));
  if (panels[3]) s.care.append(fold(panels[3], 'red-flags', cleanTitle(panels[3].querySelector('h3'))));
  if (footer) {
    const note = footer.querySelector('#fam-note')?.closest('.panel');
    const todos = [...footer.querySelectorAll('.panel')].find(n => n.querySelector('[data-act="todo"]'));
    if (todos) s.home.append(fold(todos, 'home-prep', cleanTitle(todos.querySelector('h3'))));
    if (note) s.home.append(fold(note, 'family-note', cleanTitle(note.querySelector('h3')), zh('写下观察，再保存', 'Write an observation, then save')));
    if (panels[1]) s.home.append(fold(panels[1], 'patient-ownership', cleanTitle(panels[1].querySelector('h3'))));
    const care = footer.querySelector('.care');
    if (care) s.home.append(fold(care, 'self-care', cleanTitle(care.querySelector('h3'))));
    footer.remove();
  }
  cols.remove();
  selectTab(root, currentState.ui.workspaceTabs?.[currentKey] || 'today');
}

function rehab(wrap, cols) {
  const d = currentState.data;
  const left = cols.children[0], right = cols.children[1];
  const pending = [...left.children].filter(n => n.matches('.banner') && !n.matches('.red,.emergency'));
  const urgent = [...left.children].filter(n => n.matches('.banner.red,.banner.emergency'));
  urgent.forEach(node => { node.setAttribute('role','alert'); wrap.append(node); });
  const { root, sections:s } = createWorkspace(wrap, [
    { id:'todo', title:zh('待处理', 'To review'), hint:zh('只看需要你确认的事，其余资料按需打开。', 'Focus on decisions. Open background information as needed.'), count:pending.length },
    { id:'abilities', title:zh('生活能力', 'Daily abilities'), hint:zh('先看等级和记录，点“调整”再操作。', 'Review levels and records. Open “Adjust” to make a change.') },
    { id:'records', title:zh('记录与资料', 'Notes & records'), hint:zh('观察、趋势、升级历史与已确认医嘱。', 'Observations, trends, upgrade history and confirmed orders.') }
  ]);
  pending.forEach((node,i) => s.todo.append(fold(node, `pending-${i}`, cleanTitle(node.querySelector('h3')))));
  const clear = left.querySelector('.allclear'); if (clear) s.todo.append(clear);
  const exceptions = [...left.children].find(n => n.matches('.cols.even'));
  if (exceptions) [...exceptions.children].forEach((node,i) => s.todo.append(fold(node, `exception-${i}`, cleanTitle(node.querySelector('h3')))));
  const abilities = left.querySelector('table.abl')?.closest('.panel');
  if (abilities) {
    abilities.querySelectorAll('.ab-actions').forEach((node,i) => {
      const parent = node.parentNode;
      const detail = fold(node, `adjust-${i}`, zh('调整', 'Adjust'));
      detail.classList.add('work-adjust'); parent.append(detail);
    });
    s.abilities.append(abilities);
    const legend = left.querySelector('.legend'); if (legend) s.abilities.prepend(legend);
  }
  const note = left.querySelector('#rehab-note')?.closest('.panel');
  if (note) s.records.append(fold(note, 'rehab-note', cleanTitle(note.querySelector('h3'))));
  [...right.querySelectorAll(':scope > .panel')].forEach((node,i) => s.records.append(fold(node, `record-${i}`, cleanTitle(node.querySelector('h3')))));
  cols.remove();
  selectTab(root, currentState.ui.workspaceTabs?.[currentKey] || 'todo');
}

function guidedConfirm(wrap) {
  const fields = [...wrap.querySelectorAll('.field')];
  const first = fields.find(node => !node.querySelector('[data-act="wz-confirm"]')?.checked);
  fields.forEach((node, i) => {
    const parent = node.parentNode;
    const anchor = document.createComment('confirmed-field');
    parent.insertBefore(anchor, node);
    const checked = !!node.querySelector('[data-act="wz-confirm"]')?.checked;
    const wrapper = fold(node, `wizard-${i}`, `${String(i + 1).padStart(2, '0')} · ${cleanTitle(node.querySelector('.h b'))}`, '', checked ? zh('已确认', 'Confirmed') : zh('待确认', 'To confirm'));
    wrapper.classList.add('wizard-field');
    wrapper.open = node === first;
    anchor.replaceWith(wrapper);
  });
  wrap.querySelector('.doc')?.classList.add('wizard-source');
}

function mapWorkspace(wrap) {
  if (wrap.classList.contains('work-map') || !wrap.querySelector('.map-overview')) return;
  const matrix = wrap.querySelector('.map-matrix');
  const stats = wrap.querySelector('.head-stats');
  if (matrix) {
    if (stats) matrix.prepend(stats);
    const parent = matrix.parentNode;
    const detail = fold(matrix, 'map-matrix', zh('逐日记录详情', 'Daily record details'), zh('点开查看各项能力、日期与暂停记录', 'Open abilities, dates and recorded pauses'));
    parent.insertBefore(detail, wrap.querySelector('.review-heading'));
  }
  const review = wrap.querySelector('#review');
  if (review) {
    const parent = review.parentNode;
    const detail = fold(review, 'review', zh('打开复盘', 'Open review'), zh('选择一周或一个月，查看变化并留下留言', 'Choose a week or month, review changes and leave a note'));
    parent.append(detail);
  }
  wrap.classList.add('work-page','work-map');
}

export function enhanceReview(state) {
  currentState = state;
  currentKey = `map:${state.pid}`;
  const review = document.getElementById('review');
  if (!review) return;
  const grid = review.querySelector('.review-grid');
  if (grid && !grid.querySelector('.work-fold')) {
    [...grid.children].forEach((node,i) => {
      const detail = fold(node, `review-result-${i}`, cleanTitle(node.querySelector('h3')));
      detail.classList.add('work-review-result');
      grid.append(detail);
    });
  }
  const voices = review.querySelector('.voices');
  if (voices && !voices.querySelector('.work-fold')) {
    voices.classList.add('work-review-voices');
    [...voices.children].forEach((node,i) => {
      const detail = fold(node, `review-voice-${i}`, cleanTitle(node.querySelector('span')), zh('点开填写，原样保存到这段复盘', 'Open to write and save a note for this period'));
      voices.append(detail);
    });
  }
}

function compactChrome(view) {
  const brand = document.querySelector('.brand');
  const label = brand?.querySelector('b');
  if (label) label.innerHTML = 'ReStart<span class="brand-90">90</span>';
  const toolbar = document.querySelector('#demobar > .demobar');
  if (toolbar) {
    const detail = el('details','work-demo-tools');
    detail.dataset.workFold = 'demo-tools';
    detail.open = !!currentState.ui.workspaceFolds?.['demo-tools'];
    detail.append(el('summary','',zh(`演示模式 · 第 ${currentState.data.day} 天`, `Demo mode · Day ${currentState.data.day}`)),toolbar);
    document.getElementById('demobar').append(detail);
  }
}

export function applyWorkspace(view, state) {
  currentState = state;
  currentKey = `${view}:${state.pid}`;
  compactChrome(view);
  const wrap = document.querySelector('#app .page > .wrap');
  if (view === 'map' && wrap) { mapWorkspace(wrap); return; }
  if (view === 'start' && wrap && state.wizard?.step === 2 && !wrap.querySelector('.wizard-field')) { guidedConfirm(wrap); return; }
  const cols = wrap && [...wrap.children].find(n => n.matches('.cols:not(.even)'));
  if (!cols || !['p','f','r'].includes(view)) return;
  wrap.classList.add('work-page');
  if (view === 'p') patient(wrap,cols);
  if (view === 'f') family(wrap,cols);
  if (view === 'r') rehab(wrap,cols);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-work-tab],[data-work-jump]');
  if (!button) return;
  const root = document.querySelector('[data-work-root]');
  if (!root) return;
  selectTab(root,button.dataset.workTab || button.dataset.workJump);
});
document.addEventListener('keydown', event => {
  const button = event.target.closest('[data-work-tab]');
  if (!button || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const root = button.closest('[data-work-root]');
  const buttons = [...root.querySelectorAll('[data-work-tab]')];
  const index = buttons.indexOf(button);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  selectTab(root,buttons[next].dataset.workTab,true);
});
document.addEventListener('toggle', event => {
  const target = event.target;
  if (!target.matches?.('[data-work-fold]') || !currentState) return;
  currentState.ui.workspaceFolds ||= {};
  currentState.ui.workspaceFolds[target.dataset.workFold] = target.open;
  if (target.open && target.matches('.work-task')) {
    target.parentNode.querySelectorAll(':scope > .work-task[open]').forEach(other => { if (other !== target) other.open = false; });
  }
},true);
