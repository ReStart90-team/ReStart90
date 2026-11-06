// ReStart90 front end — vanilla ES module, hash routing, bilingual.
// Every page is organised by the principles in DESIGN.md; the "Design rationale" toggle shows them in place.

const S = {
  // English first; Chinese is one tap away, and ?lang=zh opens a link straight in Chinese.
  lang: (() => { const q = new URLSearchParams(location.search).get('lang'); return q === 'zh' || q === 'en' ? q : localStorage.getItem('rs90.lang') || 'en'; })(),
  // Links and storage from before V0.3 said "demo-lin"; both mean the visitor's own copy of the demo.
  pid: ((p) => (!p || p === 'demo-lin' ? 'demo' : p))(localStorage.getItem('rs90.pid')),
  why: localStorage.getItem('rs90.why') === '1',
  meta: null,
  data: null,
  wizard: null,
  ui: {},
};

// ---------- copy ----------
const T = {
  brandSub: ['九十天重生', 'Ninety days to start again'],
  navHome: ['首页', 'Home'],
  navPatient: ['患者', 'Patient'],
  navFamily: ['家属', 'Family'],
  navRehab: ['康复人员', 'Rehab'],
  navMap: ['90天地图', '90-day map'],
  navNew: ['新建档案', 'New'],
  navWhy: ['为什么有效', 'Why it works'],
  langBtn: ['English', '中文'],
  whyBtn: ['设计依据', 'Design rationale'],

  // landing
  heroTitle: ['把生活<br>还给自己。', 'Take your<br>life back.'],
  heroLead: ['从出院第一天开始，把康复拆成今天能完成的三件事。', 'From day one at home, turn recovery into three clear steps for today.'],
  heroDemo: ['看看林凯的第 9 天', 'See Lin Kai’s day 9'],
  heroStart: ['上传出院资料', 'Upload discharge papers'],
  whyLink: ['为什么这样设计', 'Why it’s designed this way'],
  tcTitle: ['林凯，回家第 {d} 天', 'Lin Kai, day {d} at home'],
  tcPatient: ['患者做什么', 'Patient does'],
  tcFamily: ['帮的人做到哪里停', 'The helper stops at'],
  tcRehab: ['康复人员', 'Rehab team'],
  tcConfirmed: ['已确认当前等级', 'Current level confirmed'],
  tcWaiting: ['等待确认升级到「{next}」', 'To confirm: move up to “{next}”'],
  demoLife: ['自己洗脸、刷牙', 'Wash my face and brush my teeth'],
  demoWho: ['谁在做', 'Who does it'],
  demoFamily: ['帮的人', 'Helper'],
  demoDay: ['林凯，第 {d} 天', 'Lin Kai, day {d}'],
  me: ['我', 'me'],
  hlHere: ['你在这里', 'You are here'],
  heroWhere: ['林凯在第 {d} 天', 'Lin Kai is on day {d}'],
  heroScope: ['下肢截肢出院后的 90 天', 'The first 90 days home after a lower-limb amputation'],
  scrollHint: ['往下滑', 'Scroll'],
  stTitle: ['同一件事，走四站', 'One task, four stops'],
  stIntro: ['以「{life}」为例。林凯每往前走一站，帮他的人就退开一步。', 'Take “{life}”. Each stop Lin Kai moves forward, the person helping steps back once more.'],
  stKai: ['林凯做', 'Lin Kai does'],
  stFam: ['帮的人做到这里停', 'The helper stops here'],
  sfTitle: ['出现红旗，系统先停下来。', 'When a red flag appears, the system stops first.'],
  sfBody: ['伤口渗液、发烧、疼痛突然加重、跌倒：规则引擎立刻暂停相关任务，停止所有升级，再把数据库里的真实记录整理成一份给医生的摘要。AI 不做判断，也不说"这很正常"。', 'A leaking wound, a fever, a sudden rise in pain, a fall: the rules engine pauses the related tasks at once, stops every upgrade, and turns the recorded data into a summary for the doctor. The AI makes no judgement and never says “that’s normal”.'],
  sfTicket: ['【联系医生摘要】\n林凯，52 岁，左侧小腿截肢\n出院第 9 天\n触发信号：伤口渗液、有异味\n近 3 天疼痛：3 → 3 → 6（基线 4）\n系统已做：暂停残肢护理、床椅转移；停止所有升级\n本摘要不包含诊断', '[Summary for the doctor]\nLin Kai, 52, left below-knee amputation\nDay 9 after discharge\nSignal: wound leaking, smells\nPain, last 3 days: 3 → 3 → 6 (baseline 4)\nDone: limb care and transfers paused; all upgrades stopped\nThis summary contains no diagnosis'],
  sfTry: ['在演示里点「伤口异常」试试', 'Try “Wound problem” in the demo'],
  hlTap: ['点一站，看看帮的人退到哪里', 'Tap a stop to see how far the helper steps back'],
  hlPassed: ['这一站已经走过', 'Already past this stop'],
  hlAhead: ['还没走到这一站', 'Not at this stop yet'],
  hlKai: ['林凯', 'Lin Kai'],
  hlFamily: ['帮的人', 'Helper'],
  hlDay90: ['第 90 天', 'Day 90'],
  fam: ['帮的人', 'helper'],

  gapTitle: ['医院给了方案，回到家却没人分工', 'The hospital wrote a plan. At home, nobody split up the work.'],
  gapIntro: ['截肢之后，医院会讲清楚伤口、复诊和训练。真正回到家，患者和家属面对的是另一套问题。', 'After an amputation, the hospital explains wounds, follow-ups and exercises. At home, patient and family face a different set of questions.'],
  gapLeft: ['出院时拿到的', 'What you leave hospital with'],
  gapRight: ['回到家真正要回答的', 'What you actually need to answer at home'],
  gapRows: [
    [['伤口怎么换药', '今天谁扶他去厕所，扶到哪一步'], ['How to change the dressing', 'Who helps them to the toilet today, and how far']],
    [['活动和负重限制', '哪些事家属不能代做，免得越帮越依赖'], ['Activity and weight-bearing limits', 'What family must not do for them, so help doesn’t become dependence']],
    [['训练动作清单', '他什么时候可以自己来'], ['A list of exercises', 'When they can do it alone']],
    [['什么情况要就诊', '情绪崩溃的时候谁来接住'], ['When to seek care', 'Who catches them when they fall apart']],
  ],
  methodTitle: ['每一项生活能力，都走这四步', 'Every part of daily life takes these four steps'],
  methodIntro: ['照顾不会突然停止。在安全的前提下，家属一步一步退后，把生活的主导权交还给患者。', 'Care never stops all at once. As long as it is safe, family steps back one stage at a time and hands the lead back.'],
  dayTitle: ['同一天，三张不同的清单', 'One day, three different lists'],
  dayIntro: ['以林凯回家第 9 天为例。同一份医嘱，每一层支持看到的是各自要做的事。', 'Lin Kai’s day 9 at home. One set of orders; each layer of support sees its own job.'],
  dayP: ['我今天能自己做什么？', 'What can I do myself today?'],
  dayPItems: [['用镜子看一遍残肢，缠第一圈绷带', '坐轮椅到洗手池，自己刷牙洗脸', '读一条同伴故事'], ['Check the limb in a mirror and wrap the first turn', 'Wheel to the sink and wash up yourself', 'Read one peer story']],
  dayF: ['我该帮多少？什么时候放手？', 'How much do I help? When do I let go?'],
  dayFItems: [['把水和用品放在他够得着的地方，然后退开', '只在转移时保护，不替他洗', '红旗：伤口渗液立刻联系医生'], ['Put water and things within reach, then step back', 'Only stand by for transfers; don’t wash him', 'Red flag: a leaking wound means call the doctor']],
  dayR: ['他在家到底做得怎么样？', 'How are they really doing at home?'],
  dayRItems: [['查看疼痛和红旗反馈', '确认洗漱能不能继续升级', '床椅转移：患者愿意、家属已同意，待确认'], ['Check pain and red-flag reports', 'Decide whether washing up can move up', 'Transfers: patient willing, family agrees, waiting for you']],
  sciTitle: ['为什么这样做有效', 'Why this works'],
  sciIntro: ['每一个设计决定背后，都有心理学研究的依据。', 'Every design choice rests on research in psychology.'],
  sciApply: ['我们这样做：', 'What we do: '],
  sciNote: ['这些研究证明的是各个组成部分有依据，不证明 ReStart90 整体有效。整体效果需要用户测试和临床验证。', 'These studies support the parts, not ReStart90 as a whole. Overall effect still needs user testing and clinical validation.'],
  notTitle: ['我们不做的事', 'What we will not do'],
  nots: [
    [['不诊断', '不判断伤情，不替医生排除风险'], ['No diagnosis', 'We never judge an injury or rule out risk for the doctor']],
    [['不改医嘱', '任务只来自医嘱和审核过的模板'], ['No changing orders', 'Tasks only come from orders and reviewed templates']],
    [['不决定负重', '每一次升级最后都由专业人员确认'], ['No weight-bearing calls', 'Every upgrade ends with a professional’s confirmation']],
    [['不承诺治愈', '我们承诺的只是：每一步都安全、看得见'], ['No promise of a cure', 'Only that every step is safe and visible']],
    [['不用愧疚驱动', '没有断签惩罚，没有排行榜'], ['No guilt', 'No broken-streak penalties, no leaderboards']],
  ],
  ctaTitle: ['从第 1 天开始。', 'Start with day 1.'],
  ctaBody: ['先上传一份出院资料，选择谁和你一起，生成 90 天计划。或者先看看林凯的第 9 天。', 'Upload discharge papers, choose who is with you, and get a 90-day plan. Or look at Lin Kai’s day 9 first.'],
  foot: ['人物及医疗数据均为合成内容。内容模板 v0.1，待临床审核。', 'Synthetic character and medical data. Content templates v0.1, pending clinical review.'],

  // shared
  day: ['第 {d} 天', 'Day {d}'],
  of90: ['共 90 天', 'of 90'],
  dayOf: ['第 {d} 天，共 90 天', 'Day {d} of 90'],
  autonomy: ['已经拿回的生活', 'Life handed back'],
  handedBack: ['累计交还', 'Handed back'],
  times: ['{n} 次', '{n}'],
  trackBody: ['身体和安全', 'Body and safety'],
  trackLife: ['生活能力', 'Daily living'],
  trackSocial: ['心理和社会', 'Mind and connection'],
  stDone: ['做到了', 'Done'],
  stPartial: ['做到一部分', 'Partly'],
  stCant: ['今天做不到', 'Not today'],
  smallerBadge: ['今天换成更小的一步', 'A smaller step today'],
  goalBadge: ['你最想恢复的', 'Your goal'],
  goalBadgeOther: ['患者的目标', 'Patient’s goal'],
  source: ['来源：', 'Source: '],
  familyDoes: ['帮你的人：', 'Helper: '],
  pausedChip: ['暂停中', 'Paused'],
  startsPhase: ['第 {n} 阶段开始', 'Starts in phase {n}'],
  sos: ['急救：拨打当地急救电话。心理危机：拨打当地危机热线（例如加拿大和美国 988）。', 'Emergency: call your local emergency number. Crisis: call a local crisis line (for example, 988 in Canada and the US).'],
  saved: ['已记录', 'Saved'],
  copied: ['已复制', 'Copied'],
  copy: ['复制摘要', 'Copy summary'],
  by: { patient: ['患者', 'Patient'], family: ['家属', 'Family'], rehab: ['康复人员', 'Rehab team'], system: ['系统', 'System'] },

  // patient
  pSub: ['今天想拿回：{life}', 'Today I want back: {life}'],
  day90: ['第 90 天', 'Day 90'],
  routeLbl: ['我的 90 天路线', 'My 90-day route'],
  planWait: ['计划还在等康复人员确认。确认之前，所有能力都按最保守的等级执行。', 'The plan is waiting for the rehab team. Until then every ability stays at the safest level.'],
  stepPatient: ['患者愿意', 'Patient willing'],
  stepFamily: ['家属确认家里条件', 'Family: home ready'],
  stepRehab: ['康复人员确认', 'Rehab team confirms'],
  askSent: ['你说了愿意。等家属和康复人员确认后，下一次就按新等级做。', 'You said yes. Once family and the rehab team confirm, next time you’ll do it at the new level.'],
  famAsk: ['{name}愿意试试「{life}」的下一步：{next}。家里的条件允许吗？', '{name} wants to try the next step of “{life}”: {next}. Is the home ready for it?'],
  famYes: ['允许', 'Yes, it is'],
  famNo: ['还不行', 'Not yet'],
  famNoPh: ['还差什么？比如：洗手池太高、缺扶手', 'What’s missing? e.g. the sink is too high, no grab bar'],
  famWait: ['已告诉康复人员，等待最终确认。', 'The rehab team has been told and will make the final call.'],
  agentName: ['Riri', 'Riri'],
  agentSub: ['Riri 不修改医嘱；出现危险信号时，停止相关任务并提示求助。', 'Riri follows discharge instructions and stops when warning signs require professional help.'],
  agToday: ['我今天应该做什么', 'What should I do today'],
  agCant: ['这件事我做不到', 'I can’t do this one'],
  agNormal: ['这个情况正常吗', 'Is this normal'],
  agTalk: ['我只是想说说', 'I just want to talk'],
  agNormalPh: ['说说你看到或感觉到的情况', 'Describe what you see or feel'],
  agTalkPh: ['想说什么都可以', 'Say anything you like'],
  agSend: ['发送', 'Send'],
  agFine: ['Riri 不是医生，也不是心理治疗。', 'Riri is not a doctor and not therapy.'],
  agShared: ['已发给康复人员，家属看不到。', 'Sent to the rehab team. Family can’t see it.'],
  agReported: ['已报告，康复人员会收到提醒。', 'Reported. The rehab team has been alerted.'],
  pSubDone: ['今天的三件事都完成了。', 'All three are done today.'],
  ckTitle: ['先花 10 秒，告诉我们身体怎样', 'First, 10 seconds on how your body is'],
  ckWhy: ['身体的情况决定今天的任务要不要调整。', 'How your body is decides whether today’s plan changes.'],
  pain: ['疼痛', 'Pain'],
  painHint: ['0 不痛，10 最痛', '0 none, 10 worst'],
  wound: ['伤口和残肢', 'Wound and limb'],
  woundNormal: ['和昨天一样', 'Same as yesterday'],
  woundRed: ['发红或肿胀', 'Red or swollen'],
  woundLeak: ['渗液或有异味', 'Leaking or smelly'],
  mood: ['心情', 'Mood'],
  moods: [['很难受', '低落', '一般', '还不错', '很好'], ['Very hard', 'Low', 'Okay', 'Fairly good', 'Good']],
  moreCk: ['还有其他情况，或者想说几句', 'Something else, or want to say a few words'],
  fever: ['体温 38℃ 或以上', 'Temperature 38°C or higher'],
  fall: ['摔倒了', 'I fell'],
  noteLabel: ['想说什么都可以写，系统会帮你整理', 'Say anything; we’ll sort it out'],
  private: ['这段话只给康复人员看', 'Only the rehab team can read this'],
  sendCk: ['提交', 'Send'],
  ckDone: ['今天已经反馈：疼痛 {p}/10，心情「{m}」。', 'Checked in today: pain {p}/10, mood “{m}”.'],
  ckEdit: ['更新', 'Update'],
  ckOk: ['已记录，今天的计划照常。', 'Saved. Today’s plan stays the same.'],
  ckYellow: ['已记录。{why}', 'Saved. {why}'],
  ckPeople: ['已经连续几天心情很低。要不要和康复人员或一位同伴聊聊？', 'Your mood has been low for a few days. Talk to the rehab team or a peer?'],
  ckRed: ['已通知康复人员，普通任务已暂停。请按页面顶部的指引联系医生。', 'The rehab team has been told and ordinary tasks are paused. Follow the guidance at the top of the page.'],
  parsedAs: ['从你的话里识别到：{s}', 'From your note we picked up: {s}'],
  threeTitle: ['今天的三件事', 'Today’s three things'],
  alsoCan: ['有余力的话，也可以做', 'If you have energy left'],
  whenLbl: ['什么时候做？', 'When will you do it?'],
  slots: { morning: ['早饭后', 'After breakfast'], noon: ['午饭后', 'After lunch'], evening: ['晚饭后', 'After dinner'] },
  gradLeft: ['再完成 {n} 次，就可以试试「{next}」', '{n} more and you can try “{next}”'],
  gradReady: ['已经可以申请下一步「{next}」', 'Ready to ask for the next step: “{next}”'],
  msgUpPatient: ['做到了。要不要试下一步，先由你决定，看看页面上方。', 'Done. Whether to try the next step is your call first — see the top of the page.'],
  msgStreak: ['做到了，已经连续 {s} 次。', 'Done — {s} in a row.'],
  msgHeld: ['做到了。今天身体或情绪有波动，系统先暂缓升级。', 'Done. Your body or mood is off today, so upgrades wait.'],
  msgDone: ['做到了。', 'Done.'],
  msgPartial: ['做到一部分也算数。', 'Part of it still counts.'],
  msgSmaller: ['任务太大，不是你不行。明天换成更小的一步：', 'The step was too big — not you. Tomorrow’s step is smaller:'],
  msgDown: ['连续两天都难，已请康复人员帮你换一个更稳的起点。', 'Two hard days in a row; the rehab team will help find a steadier start.'],
  askPatient: ['你已经连续做到了「{name}」。下一次想试试「{next}」吗？', 'You’ve done “{name}” several times in a row. Want to try “{next}” next time?'],
  askBody: ['要不要试，由你决定。', 'Whether to try is your call.'],
  askYes: ['我愿意试试', 'I’ll try it'],
  askLater: ['再等等', 'Not yet'],
  waitRehab: ['等待康复人员确认：{name} → {next}', 'Waiting for the rehab team: {name} → {next}'],
  waitFamily: ['你愿意试了。等家属确认家里条件：{name} → {next}', 'You said yes. Waiting for family to check the home: {name} → {next}'],
  waitFamilyNo: ['家属觉得家里还没准备好：{name} → {next}。康复人员会和你们一起看。', 'Family feels the home isn’t ready yet: {name} → {next}. The rehab team will look at it with you.'],
  heldBy: ['系统已暂缓：{why}', 'On hold: {why}'],
  holdTitle: ['今天先不升级', 'No upgrades today'],
  alertTitle: ['普通任务已暂停', 'Ordinary tasks are paused'],
  emergencyTitle: ['请立即求助', 'Get help now'],
  summaryTitle: ['联系医生摘要', 'Summary for the doctor'],
  peakTitle: ['今天，你拿回了这些', 'Today you took these back'],
  peakTomorrow: ['明天是第 {d} 天。', 'Tomorrow is day {d}.'],
  milesTitle: ['下一个里程碑', 'Next milestones'],
  mileReady: ['可以申请了', 'Ready'],
  mileLeft: ['还差 {n} 次', '{n} to go'],
  abilTitle: ['我的生活能力', 'My daily life'],

  // family
  fH1: ['今天，你可以少做 {n} 件事。', 'Today you can do {n} fewer things.'],
  fH1None: ['今天先陪着他，一步一步来。', 'Today, stay close and take it one step at a time.'],
  fSub: ['放手不是不管。每一件都写清楚了要扶到哪里、在哪里停手。', 'Letting go is not leaving. Every task says how far to help and where to stop.'],
  fHelp: ['今天要协助的', 'Help with'],
  fLetGo: ['今天要放手的', 'Let go of'],
  fOwn: ['他自己做到的', 'What they did on their own'],
  fOwnNone: ['他自己做到的事会出现在这里。', 'Things they do on their own will show here.'],
  yourRole: ['你的角色', 'Your role'],
  dontDo: ['不要代做：', 'Don’t do it for them: '],
  howMuch: ['今天你实际帮了多少？', 'How much did you actually help today?'],
  helpLabels: [['替他做了', '陪他做了', '在旁保护', '他自己做的'], ['Did it for them', 'Did it together', 'Stood by', 'They did it alone']],
  letGoDone: ['{name}：他已经可以自己做到，你不需要参与了。', '{name}: they can do this alone now; you can step out.'],
  fRed: ['出现这些情况，立刻联系专业人员', 'Contact a professional right away if you see'],
  ptToday: ['他今天的反馈', 'Their check-in today'],
  noCheckin: ['他今天还没反馈。', 'No check-in yet today.'],
  privateHidden: ['（有一段只给康复人员看的话）', '(includes a note only for the rehab team)'],
  notesTitle: ['记下你观察到的', 'Note what you noticed'],
  notePh: ['比如：今天他自己推轮椅去了洗手池', 'e.g. Today they wheeled to the sink on their own'],
  saveNote: ['保存', 'Save'],
  todos: ['家里的准备', 'Getting the home ready'],
  careTitle: ['照顾者也需要休息', 'Carers need rest too'],
  careBody: ['每天给自己留出半小时，做一件和照顾无关的事。你状态好，他才更容易好起来。觉得撑不住的时候，也可以和康复人员说。', 'Keep half an hour a day for something that isn’t caring. When you are okay, recovery is easier for them too. If it gets too much, tell the rehab team.'],

  // rehab
  rTitle: ['康复人员工作台', 'Rehab team desk'],
  rSub: ['只把需要你判断的事放在最前面。', 'Only what needs your judgement comes first.'],
  rStalled: ['长期没有进展', 'Stalled'],
  rStalledItem: ['在「{lv}」停了 {n} 天', 'At “{lv}” for {n} days'],
  rDisagree: ['患者和家庭的分歧', 'Patient and family disagree'],
  rDisOver: ['计划是「{plan}」，家属记录「{help}」', 'Plan: “{plan}”; family logged “{help}”'],
  rDisMismatch: ['患者说自己做到了，家属记录「{help}」', 'Patient says done alone; family logged “{help}”'],
  rDisPending: ['患者愿意升级，家属认为家里还不行：{note}', 'Patient wants to move up; family says the home isn’t ready: {note}'],
  rPlanTitle: ['新档案等待确认', 'New plan to confirm'],
  rPlanBody: ['核对医学限制是否正确、家属能否安全协助、哪些动作需要现场教学，然后确认计划。', 'Check the medical limits, whether family can help safely, and which moves need hands-on teaching, then confirm.'],
  rPlanBtn: ['确认 90 天计划', 'Confirm the 90-day plan'],
  rNeedPatient: ['等患者表示愿意后才能确认', 'Can confirm once the patient says yes'],
  rNone: ['没有', 'None'],
  rUrgent: ['红旗', 'Red flags'],
  rPending: ['待确认', 'To confirm'],
  rOver: ['近 7 天过度代劳', 'Over-help, 7 days'],
  colPatient: ['患者', 'Patient'],
  colDay: ['天数', 'Day'],
  colAuto: ['已拿回', 'Handed back'],
  open: ['查看', 'Open'],
  todo: ['需要你处理', 'Needs you'],
  allClear: ['现在没有需要你处理的事。', 'Nothing needs you right now.'],
  replyPh: ['回复患者和家属：处理结果和下一步', 'Reply to patient and family: what was done, what’s next'],
  resolve: ['已处理，恢复任务', 'Handled, resume tasks'],
  approve: ['确认升级', 'Confirm'],
  decline: ['暂不升级', 'Not yet'],
  approveDown: ['确认退一级', 'Step back one level'],
  pendUp: ['{name}：{from} → {to}', '{name}: {from} → {to}'],
  abTitle: ['生活能力和近 7 天', 'Abilities and the last 7 days'],
  lgDone: ['做到了', 'Done'], lgPartial: ['做到一部分', 'Partly'], lgCant: ['做不到', 'Not today'], lgOver: ['家属帮得比建议多', 'Family over-helped'],
  actUp: ['升一级', 'Up'], actDown: ['退一级', 'Down'], actSmaller: ['更小的一步', 'Smaller step'], actPause: ['暂停', 'Pause'], actResume: ['恢复', 'Resume'],
  adviceTitle: ['给患者和家属的意见', 'Advice for patient and family'],
  advicePh: ['例如：本周重点是洗漱，转移先保持', 'e.g. Focus on washing up this week; keep transfers as they are'],
  trendTitle: ['疼痛和心情，近 7 天', 'Pain and mood, 7 days'],
  feedTitle: ['患者和家属的记录', 'Notes from patient and family'],
  histTitle: ['等级变化记录', 'Level changes'],
  ordersTitle: ['已确认的医嘱', 'Confirmed orders'],

  // map
  mapTitle: ['90 天地图', '90-day map'],
  mapSub: ['每一列是一天，每一行是一项生活能力。灰色是家属替你做，黄色是你自己能做到，红色是红旗暂停的日子。', 'Each column is a day, each row an ability. Grey: family does it. Yellow: you do it yourself. Red: paused for a red flag.'],
  famDay1: ['第 1 天家属替你做', 'Family did it, day 1'],
  famNow: ['今天家属替你做', 'Family does it today'],
  selfNow: ['你自己能做到', 'You do it yourself'],
  things: ['{n} 件', '{n}'],
  redFlags: ['红旗暂停', 'Paused by red flag'],
  rvTitle: ['复盘', 'Review'],
  week: ['第 {n} 周', 'Week {n}'],
  month: ['第 {n} 月', 'Month {n}'],
  rvGained: ['这段时间拿回的', 'Handed back in this period'],
  rvIndependent: ['已经可以独立完成', 'Done independently'],
  rvNeedHelp: ['仍需要协助', 'Still needs help'],
  rvNext: ['下一步可以试', 'Next to try'],
  rvNone: ['暂时没有', 'None yet'],
  rvStats: ['完成 {d} 次，做到一部分 {p} 次，做不到 {c} 次；红旗 {a} 次；家属过度代劳 {o} 次', '{d} done, {p} partly, {c} not today; {a} red flags; {o} over-help'],
  rvAuto: ['已拿回的生活：{a}% → {b}%', 'Life handed back: {a}% → {b}%'],
  rvVoices: ['三个人一起写', 'Written together'],
  rvSave: ['保存', 'Save'],
  rvPh: { patient: ['这段时间我的感受', 'How I felt'], family: ['我观察到的变化', 'What I noticed'], rehab: ['下一阶段的目标', 'Goals for the next stage'] },

  // wizard
  wzTitle: ['建立 90 天计划', 'Build a 90-day plan'],
  wzSub: ['前五步由你完成，大约五分钟。如果有康复人员加入，第六步由他确认；没有的话，计划保持最稳妥的等级，等专业人员看过。', 'You do the first five steps in about five minutes. If a rehab worker has joined, they confirm the sixth; if not, the plan stays at the safest level until a professional has seen it.'],
  wz1: ['上传资料', 'Upload'], wz2: ['核对关键信息', 'Check'], wzWho: ['谁和你一起', 'Who’s with you'], wz3: ['家里的情况', 'Home'], wz4: ['90 天目标', '90-day goal'], wz5: ['专业人员确认', 'A professional confirms'],
  wzPaste: ['粘贴出院小结的文字，或上传文件（.txt / .pdf）', 'Paste the discharge summary, or upload a file (.txt / .pdf)'],
  wzSample: ['使用示例出院小结（合成病例）', 'Use the sample discharge summary (synthetic)'],
  wzFile: ['选择文件', 'Choose a file'],
  wzExtract: ['开始提取', 'Extract'],
  wzExtracting: ['正在读取…', 'Reading…'],
  wzAiOn: ['AI 已连接：{m}', 'AI connected: {m}'],
  wzAiOff: ['离线模式：使用预生成结果和规则提取，现场断网也能演示。', 'Offline mode: pre-generated results and rule-based extraction. Works without a network.'],
  wzWarn: ['请只使用合成或去标识的资料，不要上传真实病历。', 'Use synthetic or de-identified records only. Never upload real patient records.'],
  modeAi: ['AI 提取', 'AI extraction'], modePregenerated: ['预生成结果（示例病历）', 'Pre-generated (sample record)'], modeOffline: ['规则提取（离线）', 'Rule-based (offline)'],
  wzConfirmIntro: ['对照左边高亮的原文，逐条确认或修改。', 'Check each field against the highlighted source on the left, then confirm or edit.'],
  fieldNames: { amputation: ['截肢部位和平面', 'Amputation'], wound: ['伤口和残肢护理', 'Wound and limb care'], activity: ['活动和负重限制', 'Activity limits'], followUp: ['复诊安排', 'Follow-up'], redFlags: ['红旗信号', 'Red flags'] },
  showSource: ['在原文中查看', 'Show in source'],
  confirmIt: ['我确认这一项', 'I confirm this'],
  notInDoc: ['原文没有提到', 'Not in the document'],
  quoteMissing: ['没有在原文中找到这段引用，请仔细核对', 'Quote not found in the source — check carefully'],
  confirmedN: ['已确认 {n}/5', '{n}/5 confirmed'],
  next: ['下一步', 'Next'],
  back: ['上一步', 'Back'],
  fName: ['患者姓名', 'Patient name'],
  fCaregiver: ['家属或帮你的人（名字和关系）', 'Family member or helper (name and relation)'],
  fPain: ['现在的疼痛（作为基线）', 'Pain now (the baseline)'],
  fConfidence: ['对自己恢复生活的信心', 'Confidence about getting life back'],
  confWords: [['几乎没有', '不太有', '一半一半', '比较有', '很有'], ['Almost none', 'Not much', 'Half and half', 'Fairly', 'Very']],
  fWorry: ['现在最担心的一件事', 'The one thing you worry about most'],
  fHome: ['家里的情况', 'At home'],
  hFloor: ['住在几楼', 'Which floor'],
  hElevator: ['有电梯', 'There is a lift'],
  hGrab: ['马桶旁有扶手', 'Grab bar by the toilet'],
  hShower: ['有淋浴椅', 'Shower chair'],
  hThreshold: ['门口有门槛', 'Door sills'],
  hWheel: ['已经有轮椅', 'Has a wheelchair'],
  fGoals: ['先从哪几件生活拿回（最多 3 项，由你本人决定）', 'Which parts of daily life first (up to 3; you decide)'],
  fCustom: ['90 天后，你最想重新做到什么？', 'In 90 days, what do you most want to be able to do again?'],
  customPh: ['比如：再去寨子外看一眼那片梯田', 'e.g. See the terraced fields from the lookout again'],
  create: ['生成 90 天计划', 'Create the 90-day plan'],
  created: ['90 天计划已生成', 'Your 90-day plan is ready'],

  // V0.3: one person can start; family and rehab are optional layers
  heroAlone: ['一个人也能开始。', 'Start on your own.'],
  filmLine: ['“如果以后每件事都要靠别人，这还是我的生活吗？”', '“If every part of my life depends on someone else, is it still mine?”'],
  navLife: ['拿回的生活', 'Life back'],
  layersTitle: ['一个人也能开始', 'One person can start'],
  layersIntro: ['多数康复产品默认患者身边已经有家属、康复师和医院。ReStart90 先服务那个独自带着出院单回家的人，家属和康复人员是之后可以加入的两层支持。', 'Most rehab products assume the patient already has family, a therapist and a hospital close by. ReStart90 serves the person who goes home alone with a discharge sheet first. Family and rehab are two layers of support that can join later.'],
  layer1: ['第一层：你和 Riri', 'Layer 1: you and Riri'],
  layer1Tag: ['基础模式，永远都在', 'The base. Always there'],
  layer1Items: [['上传出院资料，选出 90 天里最想拿回的生活', '每天三件最重要的事', '记录疼痛、残肢、伤口和情绪', '危险信号出现时暂停任务，告诉你去哪里求助'], ['Upload discharge papers and choose what you want back in 90 days', 'Three things that matter most each day', 'Record pain, the limb, the wound and mood', 'When a danger sign appears, pause tasks and show where to get help']],
  layer2: ['第二层：加上家属', 'Layer 2: add family'],
  layer2Tag: ['可选，由你邀请', 'Optional. You invite them'],
  layer2Items: [['今天需要帮什么、帮到哪一步', '哪些事不要再替你做', '出现什么情况必须求助', '你的私密倾诉默认不给家属看'], ['What to help with today, and how far', 'What not to do for you any more', 'Which signs mean get help now', 'Your private words stay private by default']],
  layer3: ['第三层：加上康复人员', 'Layer 3: add a rehab worker'],
  layer3Tag: ['可选，经你授权', 'Optional. Only with your permission'],
  layer3Items: [['红旗风险和疼痛、伤口趋势', '长期没有进展的能力', '等待确认的阶段升级', '复诊前的结构化摘要'], ['Red flags, and pain and wound trends', 'Abilities that have stalled', 'Steps waiting for a professional to confirm', 'A structured summary before each follow-up']],
  layersNote: ['康复人员不用每天盯着患者，只在真正需要专业判断时介入。', 'The rehab worker doesn’t watch every day. They step in when a professional call is really needed.'],
  whoTitle: ['谁和我一起', 'Who’s with me'],
  whoRiri: ['Riri：每天都在', 'Riri: here every day'],
  whoFamily: ['家属或帮你的人', 'Family or a helper'],
  whoRehab: ['康复人员', 'Rehab worker'],
  whoJoined: ['第 {d} 天加入：{name}', 'Joined day {d}: {name}'],
  whoJoinedNow: ['已加入：{name}', 'Joined: {name}'],
  whoNot: ['还没有加入', 'Not joined yet'],
  whoInvite: ['邀请', 'Invite'],
  whoRemove: ['移除', 'Remove'],
  whoNamePh: ['对方的名字和关系', 'Their name and relation'],
  whoAdd: ['加入', 'Add'],
  whoNoteFamily: ['家属只看到今天要帮什么、帮到哪一步、什么时候求助。', 'Family only sees what to help with today, how far, and when to get help.'],
  whoNoteRehab: ['康复人员看到红旗、趋势和待确认的升级，你可以随时移除。', 'A rehab worker sees red flags, trends and steps to confirm. You can remove them any time.'],
  whoDemo: ['演示：在真实产品里，对方会收到一条邀请链接。', 'Demo: in the real product they would get an invite link.'],
  notJoinedFamilyH: ['{name}还没有邀请家属', '{name} hasn’t invited family yet'],
  notJoinedFamilyP: ['ReStart90 一个人也能用。患者邀请之后，家属才会在这里看到：今天要帮什么、帮到哪一步、哪些事不要替他做、什么时候必须求助。私密的话不会出现在这里。', 'ReStart90 works for one person on their own. Only after the patient invites family will this page show what to help with today, how far, what not to do for them, and when to get help. Private words never appear here.'],
  notJoinedRehabH: ['{name}还没有授权康复人员', '{name} hasn’t let a rehab worker in'],
  notJoinedRehabP: ['康复人员只有在患者授权后才能看到红旗、趋势和待确认的升级。', 'A rehab worker sees red flags, trends and steps to confirm only after the patient grants access.'],
  goInvite: ['去患者页面邀请', 'Invite from the patient page'],
  rListNote: ['这里只显示授权了康复人员的患者。一个人使用的患者不会出现在这里。', 'Only patients who let a rehab worker in appear here. People using ReStart90 on their own do not.'],
  planWaitSolo: ['还没有专业人员确认这份计划，所以所有能力都按最稳妥的等级执行。复诊时把摘要给医生看，或者邀请一位康复人员加入。', 'No professional has confirmed this plan yet, so every ability stays at the safest level. Show the summary at your follow-up, or invite a rehab worker to join.'],
  stepSelf: ['你自己检查了家里', 'You checked the home'],
  stepPro: ['专业人员确认', 'A professional confirms'],
  waitSelf: ['你愿意试了。下一步：自己检查一下家里，{name} → {next}', 'You said yes. Next, check your home yourself: {name} → {next}'],
  selfCheck: ['开始前，确认这三件事', 'Before you try, check three things'],
  selfChecks: [['刹车能锁住，轮椅和床的位置合适', '要用的东西放在坐着够得到的地方', '地面干燥，通道上没有东西'], ['The brakes lock, and the chair and bed are in the right place', 'What you need is within seated reach', 'The floor is dry and the path is clear']],
  selfYes: ['都检查过了', 'All checked'],
  selfNo: ['还没准备好', 'Not ready yet'],
  waitProSolo: ['你已经准备好了：{name} → {next}。还需要一位专业人员确认，复诊时问，或者邀请康复人员加入。', 'You’re ready: {name} → {next}. A professional still has to confirm it. Ask at your follow-up, or invite a rehab worker.'],
  resolveSelfH: ['专业人员看过之后', 'After a professional has seen you'],
  resolveSelfPh: ['写下专业人员怎么说，比如：门诊护士换了药，少量渗液，继续观察', 'Write down what they told you, e.g. clinic nurse changed the dressing, small amount of fluid, keep watching'],
  resolveSelf: ['已经看过，恢复任务', 'Seen by a professional, resume'],
  rileyOpen: ['问 Riri', 'Ask Riri'],
  close: ['关闭', 'Close'],
  lifeToday: ['今天拿回了 {n} 件生活', 'Today you took back {n} part of daily life'],
  lifeTodayN: ['今天拿回了 {n} 件生活', 'Today you took back {n} parts of daily life'],
  lifeToday0: ['今天还没有拿回一件，慢慢来', 'Nothing taken back yet today. Take your time'],
  // body and wound record
  bodyLink: ['完整的身体和伤口记录', 'Full body and wound record'],
  bodyTitle: ['身体和伤口记录', 'Body and wound record'],
  bodySub: ['只用按钮、量表和照片，再加一句想说的话。系统只整理变化，不做诊断。', 'Buttons, scales and a photo, plus one sentence if you want. The system tracks changes and never diagnoses.'],
  bPain: ['疼痛', 'Pain'],
  bPainRising: ['疼痛在持续上升', 'The pain keeps rising'],
  bPainWhere: ['哪里痛', 'Where it hurts'],
  bPainImpact: ['对生活的影响', 'How much it gets in the way'],
  bPhantom: ['幻肢相关感受', 'Phantom limb'],
  bSensation: ['感觉变化', 'Changes in feeling'],
  bLimb: ['残肢变化', 'The residual limb'],
  bWound: ['伤口', 'The wound'],
  bWoundIntro: ['在和昨天相近的角度和光线下拍一张照片，再回答下面的问题。', 'Take a photo at about the same angle and light as yesterday, then answer the questions below.'],
  bPhotoBtn: ['拍照或选择照片', 'Take or choose a photo'],
  bPhotoYesterday: ['第 {d} 天的照片：尽量用同样的角度', 'Day {d} photo: match this angle'],
  bPhotoToday: ['今天的照片', 'Today’s photo'],
  bPhotoNone: ['还没有照片', 'No photo yet'],
  bPhotoFirst: ['这是第一张照片，以后每天和它对比', 'This is the first photo; later ones are compared with it'],
  bPhotoDark: ['照片有点暗，换个亮一点的地方再拍', 'The photo is dark; try somewhere brighter'],
  bPhotoBright: ['照片太亮，避开直射的光再拍', 'The photo is too bright; avoid direct light'],
  bPhotoBlur: ['照片可能有点模糊，拿稳再拍一次', 'The photo may be blurry; hold steady and try again'],
  bPhotoOk: ['照片清楚', 'The photo is clear'],
  bPhotoNote: ['AI 只检查照片是否清楚、问题是否填完，不判断伤口。', 'Only checks that the photo is clear and the questions are answered. It never judges the wound.'],
  bWoundAsk: ['今天伤口有没有这些情况？', 'Does the wound have any of these today?'],
  bWoundNone: ['都没有', 'None of these'],
  bGeneral: ['全身危险信号', 'Danger signs'],
  bMood: ['情绪', 'Mood'],
  bHopeless: ['我感到绝望', 'I feel hopeless'],
  bSelfHarm: ['我有伤害自己的想法', 'I have thoughts of harming myself'],
  bShare: ['把今天的情绪分享给康复人员', 'Share today’s mood with the rehab worker'],
  bLife: ['生活能力', 'Daily life'],
  bHelp: ['今天做事时，用了多少帮助？', 'How much help did you use today?'],
  bHardest: ['哪一步最难？', 'Which step was hardest?'],
  bWantBack: ['明天最想拿回什么？', 'What do you most want back tomorrow?'],
  bNote: ['还想说一句什么', 'Anything else, in one sentence'],
  bSubmit: ['保存今天的记录', 'Save today’s record'],
  bNeedWound: ['先回答伤口的问题', 'Answer the wound questions first'],
  bSavedPhoto: ['照片已记录。未进行医学诊断。', 'Photo recorded. No medical diagnosis was made.'],
  bSaved: ['今天的记录已保存。', 'Today’s record is saved.'],
  bBack: ['回到今天', 'Back to today'],
  bDone: ['今天已经记录过。可以随时更新。', 'Already recorded today. You can update it any time.'],
  // life back page
  lifeTitle: ['我拿回的生活', 'The life I’ve taken back'],
  lifeSub: ['从第 1 天到今天，哪些事从“别人替我做”走向了“我自己能做到”。', 'From day 1 to today: what has moved from “someone does it for me” towards “I can do it myself”.'],
  lifeDay1: ['第 1 天', 'Day 1'],
  lifeNow: ['今天', 'Today'],
  lifeDays: ['每天自己做到的生活', 'Daily life done each day'],
  lifeDaysNote: ['每一格是一天，数字是那天你记录为“做到了”的生活能力。红色是红旗暂停的日子。', 'One bar per day: the daily-life tasks you logged as done. Red marks days paused for a red flag.'],
  lifeUps: ['每一次交还', 'Each handback'],
  lifeUpsNone: ['第一次交还会出现在这里。', 'Your first handback will show here.'],
  lifeNext: ['下一步', 'Next step'],
  lifeGoal: ['90 天后', 'By day 90'],
  lifeBy: { rehab: ['专业人员确认', 'confirmed by a professional'], system: ['系统', 'system'], patient: ['你', 'you'], family: ['家属', 'family'] },
  // film and story
  filmKicker: ['宣传片', 'The film'],
  filmTitle: ['下一步', 'The Next Step'],
  filmBody: ['一位苗族银匠截肢出院，回到寨中。手艺还在，可一杯水、一扇门、一段石阶，都要等别人有空。片中人物和故事都是虚构的。', 'A Miao silversmith comes home to his village after an amputation. His hands still know the craft, but a glass of water, a door and a flight of stone steps now wait for someone else to have time. The person and story are fictional.'],
  filmSoon: ['影片制作中', 'Film in production'],
  storyLink: ['林凯的故事', 'Lin Kai’s story'],
  storyKicker: ['人物故事（虚构）', 'A story (fictional)'],
  storyH: ['他怕的不是慢，是每一件普通事都要等别人有空。', 'It isn’t being slow he fears. It’s waiting for someone else to have time.'],
  storyLead: ['林凯，52 岁，黔东南一个苗寨里的银匠。左小腿截肢后，他回到家中，身边没有人能一直陪着。银锤还放在旧木桌上，水杯却放在他够不着的地方。', 'Lin Kai is 52, a silversmith in a Miao village in southeast Guizhou. After a below-knee amputation he comes home with no one who can stay by his side. His silver hammer still lies on the old wooden bench; the glass of water sits just out of reach.'],
  storyGoal: ['他的 90 天目标：再去寨子外的观景处，看一眼那片梯田。', 'His 90-day goal: get back to the lookout outside the village and see the terraced fields again.'],
  storyNot: ['ReStart90 不会让他变回从前，也不会替他康复。失去一条腿，改变的是他走路的方式，不是他决定生活的权利。', 'ReStart90 won’t make him who he was before, and it won’t recover for him. Losing a leg changed how he moves, not his right to decide where his life goes next.'],
  storyBeats: [
    [['第 1 天', '选择“我现在一个人”，输入目标“再看一眼那片梯田”。Riri 说：今天，我们先从这杯水开始。他把水移到够得到的地方。'], ['第 9 天', '自己拿到了水。今天拿回 1 件生活。'], ['第 21 天', '出现风险信号。系统停止相关任务和升级，提示他求助。'], ['第 41 天', '回到银匠桌旁，把工具一件件整理好。'], ['第 63 天', '重新敲下第一锤。'], ['第 90 天', '借助辅助器具，在平缓安全的观景处站定。梯田第一次完整展开。他没有奔跑，只是重新到达了想去的地方。']],
    [['Day 1', 'Chooses “I’m on my own now” and types his goal: see the terraced fields again. Riri says: today, we start with the glass. He moves the water within reach.'], ['Day 9', 'Reaches the water himself. One part of daily life taken back today.'], ['Day 21', 'A warning sign appears. The system stops the related tasks and upgrades and tells him to get help.'], ['Day 41', 'Back at the silversmith’s bench, putting his tools in order one by one.'], ['Day 63', 'Strikes the first blow of the hammer again.'], ['Day 90', 'With a walking aid, he stands at a gentle, safe lookout. The terraced fields open up for the first time. He does not run; he has simply got back to where he wanted to be.']],
  ],
  storyOpen: ['打开林凯的第 9 天', 'Open Lin Kai’s day 9'],
  storySynthetic: ['林凯、他的病历和故事都是合成的，用来说明产品，不代表任何真实的人、家庭或村寨。', 'Lin Kai, his records and his story are synthetic. They illustrate the product and do not depict any real person, family or village.'],
  // wizard: who is with you
  wzWhoQ: ['谁和你一起完成康复？', 'Who will be with you through recovery?'],
  wzWhoSub: ['没有人也没关系。一个人也能开始，以后随时可以邀请别人加入。', 'No one is fine. You can start on your own and invite others any time.'],
  supportModes: {
    family: [['我有家属', '家人或其他可以帮忙的人'], ['I have family', 'Family or someone else who can help']],
    rehab: [['我有康复人员', '康复师、护士或社区卫生员'], ['I have a rehab worker', 'A therapist, nurse or community health worker']],
    both: [['他们都在', '家属和康复人员都可以加入'], ['Both', 'Family and a rehab worker can both join']],
    solo: [['我现在一个人', '一个人也能开始，先和 Riri 一起'], ['I’m on my own now', 'Start on your own, with Riri']],
  },
  fRehabName: ['康复人员（名字和机构）', 'Rehab worker (name and service)'],
  wzConfirmSolo: ['还没有专业人员加入。计划会先按最稳妥的等级执行；复诊时把摘要给医生看，或者以后邀请康复人员确认。', 'No professional has joined yet. The plan starts at the safest level. Show the summary at your follow-up, or invite a rehab worker later to confirm it.'],
  wzConfirmRehab: ['计划生成后会送到康复人员那里确认。确认之前，所有能力都按最稳妥的等级执行。', 'Once created, the plan goes to the rehab worker to confirm. Until then, every ability stays at the safest level.'],

  // demo
  demo: ['演示', 'Demo'],
  nextDay: ['下一天', 'Next day'],
  injYellow: ['疼痛上升和情绪低落', 'Pain up, mood low'],
  injRed: ['伤口异常', 'Wound problem'],
  reset: ['重置', 'Reset'],
  resetConfirm: ['重置所有演示数据，回到林凯的第 9 天？', 'Reset all demo data back to Lin Kai’s day 9?'],
  injNote: ['残端下面又渗出黄色的液体，有点味道', 'More yellow fluid under the stump, and a smell'],
  loadErr: ['加载失败：{e}', 'Could not load: {e}'],
};

// Design rationale shown in place when the toggle is on (see DESIGN.md).
const WHY = {
  pyramid: [['结论先行', '首页第一句就是答案，后面每一段都在支撑它。', '金字塔原理，Minto 1987'], ['Answer first', 'The first line is the answer; every section below supports it.', 'Pyramid Principle, Minto 1987']],
  conflict: [['先讲冲突，再给方法', '情境、冲突、问题、答案。没有冲突，方法就没有分量。', 'SCQA 结构'], ['Conflict before method', 'Situation, complication, question, answer. Without the gap, the method has no weight.', 'SCQA']],
  story: [['讲一个人，不讲一群人', '一个具体的人比一组统计更能被理解和记住，所以全站和宣传片都跟着林凯。', '可识别受害者效应，Small et al. 2007'], ['One person, not a population', 'One specific person is understood and remembered better than statistics, so the site and the film both follow Lin Kai.', 'Identifiable victim effect, Small et al. 2007']],
  layers: [['先服务独自回家的人', '支持网络暂时不存在时，至少还有一个系统帮他整理信息、守住安全底线。家属和康复人员是可以加入的支持层，不是使用的前提。', 'V0.3 定位'], ['Serve the person who goes home alone first', 'When a support network isn’t there yet, at least one system helps organise information and holds the safety line. Family and rehab are layers that can join, not a condition for using it.', 'V0.3 positioning']],
  photo: [['照片只用来对比', '同样的角度和光线，让变化看得见。系统只检查照片是否清楚，判断交给专业人员。', '安全边界'], ['Photos are for comparing', 'Same angle and light make change visible. The system only checks the photo is clear; judgement is left to professionals.', 'Safety boundary']],
  scaffold: [['脚手架逐步撤除', '先在支架里做到，再一层层撤掉支架。四级就是撤架子的顺序。', 'Wood, Bruner & Ross 1976'], ['Scaffolding, then fading', 'Succeed with support first, then remove it layer by layer. The four levels are that order.', 'Wood, Bruner & Ross 1976']],
  evidence: [['用研究建立信任', '每个设计都标出处，并说清楚研究能证明什么、不能证明什么。', '可解释性'], ['Trust through evidence', 'Each choice cites its source and says what the research does and does not show.', 'Explainability']],
  trust: [['先说边界', '医疗产品先让人放心，再让人心动。说清楚不做什么，比说做什么更能建立信任。', '风险感知'], ['Boundaries first', 'In health, safety comes before appeal. Saying what we won’t do builds more trust than promises.', 'Risk perception']],
  fresh: [['新起点效应', '"第 1 天"这样的时间节点，让人更愿意开始改变。', 'Dai, Milkman & Riis 2014'], ['Fresh start effect', 'Time landmarks like “day 1” make people more willing to begin.', 'Dai, Milkman & Riis 2014']],
  safety: [['先安全，后任务', '红旗是一切任务的前提。三次点击完成，降低反馈成本。', '例外管理'], ['Safety before tasks', 'Red flags gate every task. Three taps keep the cost of reporting low.', 'Management by exception']],
  hick: [['每天只给三件事', '选项越多，决定越慢、越容易放弃。三件主任务，其余放在次级清单。', 'Hick 1952；Sweller 1988'], ['Only three things a day', 'More options mean slower decisions and more giving up. Three main tasks; the rest is secondary.', 'Hick 1952; Sweller 1988']],
  intention: [['先定好什么时候做', '提前说好"在什么情况下做"，执行率明显提高。', 'Gollwitzer 1999；元分析 d≈0.65'], ['Decide when, in advance', 'Saying in advance “when X, I’ll do Y” clearly raises follow-through.', 'Gollwitzer 1999; meta-analysis d≈0.65']],
  gradient: [['目标梯度', '越接近目标，人越有动力。所以显示"再完成 1 次"，而不是"还差 3 级"。', 'Kivetz et al. 2006'], ['Goal gradient', 'Motivation rises near the goal, so we show “1 more”, not “3 levels to go”.', 'Kivetz et al. 2006']],
  endowed: [['赋予进度', '从第 1 天就累计"已经拿回的生活"，让人看到自己已经在路上。', 'Nunes & Drèze 2006'], ['Endowed progress', 'Counting life handed back from day 1 shows you are already on the way.', 'Nunes & Drèze 2006']],
  peakEnd: [['峰终定律和进步原则', '一天的结尾决定对这一天的记忆；看见小进步是最强的日常动力。', 'Kahneman et al. 1993；Amabile & Kramer 2011'], ['Peak-end and the progress principle', 'How a day ends shapes how it is remembered; seeing small progress is the strongest daily motivator.', 'Kahneman et al. 1993; Amabile & Kramer 2011']],
  autonomy: [['自主由自己决定', '每一次升级都先问患者本人：点"我愿意试试"才会往下走，满足自主需要。', '自我决定理论，Ryan & Deci 2000'], ['The patient decides', 'Every upgrade starts with the patient: only “I’ll try it” moves it forward, meeting the need for autonomy.', 'Self-determination theory, Ryan & Deci 2000']],
  attribution: [['把困难归给任务，不归给人', '"任务太大，不是你不行"，然后换一步更小的。避免习得性无助。', 'Weiner 1985；Maier & Seligman 2016'], ['Blame the task, not the person', '“The step was too big, not you”, then a smaller step. Avoids learned helplessness.', 'Weiner 1985; Maier & Seligman 2016']],
  mastery: [['信心来自亲身做到', '没有空洞的"加油"，只展示他真的做到的事。', '自我效能，Bandura 1977'], ['Confidence comes from doing', 'No empty cheering; only what they actually did.', 'Self-efficacy, Bandura 1977']],
  dependency: [['打破依赖-支持循环', '照护者常对依赖马上回应，对独立反而不注意。所以第一眼看到的是"可以少做几件事"，并展示他自己做到的事。', 'Baltes 1996'], ['Break the dependency-support script', 'Carers respond to dependence and overlook independence. So the first thing they see is how much less to do, and what the patient did alone.', 'Baltes 1996']],
  contrast: [['对比让边界清楚', '"要协助的"和"要放手的"并排，一眼看清楚边界在哪里。', '对比原则'], ['Contrast makes the line clear', 'Help and let-go side by side shows exactly where the line is.', 'Contrast']],
  roleOne: [['一个角色，一个动作', '家属只需要记住今天自己的角色，例如"在旁边保护"。', '认知负荷'], ['One role, one action', 'Family only needs today’s role, e.g. “Stand by”.', 'Cognitive load']],
  monitor: [['自我监测加即时反馈', '记录实际帮了多少；帮多了温和提醒，不责备。', '行为自我监测'], ['Self-monitoring with feedback', 'Log how much you helped; a gentle note if it was more than suggested, never blame.', 'Behavioural self-monitoring']],
  caregiver: [['照顾照顾者', '家属的压力本身会影响康复，联结也包括对家属的支持。', '照护者负担研究'], ['Care for the carer', 'Carer strain affects recovery too; connection includes supporting family.', 'Caregiver burden research']],
  exception: [['例外优先', '只把需要专业判断的事放在最前面，一切正常的不打扰。', '例外管理'], ['Exceptions first', 'Only what needs professional judgement comes first; normal stays quiet.', 'Management by exception']],
  preattentive: [['不用读字也能看到', '颜色块和红框属于前注意属性，一眼就能发现异常。', '前注意加工'], ['Seen before read', 'Colour blocks and red outlines are pre-attentive: problems pop out at a glance.', 'Pre-attentive processing']],
  explain: [['说清楚为什么停下', '每次暂缓都写出原因，专业人员才能信任并纠正系统。', '可解释性'], ['Say why it stopped', 'Every hold states its reason so professionals can trust and correct the system.', 'Explainability']],
  mapWhy: [['一屏看完 90 天', '灰色在减少、黄色在增加，进度本身就是动力。', '目标梯度与赋予进度'], ['All 90 days at once', 'Grey shrinking, yellow growing: progress itself motivates.', 'Goal gradient and endowed progress']],
  reviewWhy: [['先写拿回了什么', '复盘先肯定胜任感，再谈下一步。', '峰终定律；自我效能'], ['Start with what came back', 'Reviews affirm competence first, then the next step.', 'Peak-end; self-efficacy']],
  related: [['三个人一起写', '患者、家属、康复人员各写一段，满足联结需要。', '自我决定理论'], ['Written by all three', 'Patient, family and rehab team each write a part: relatedness.', 'Self-determination theory']],
  source: [['原文高亮', '每个提取结果都对应原文，看得见来源才敢相信。', '可解释性'], ['Source highlighting', 'Each field maps to the source text; seeing the source earns trust.', 'Explainability']],
  human: [['人在回路', 'AI 只提取，人逐条确认，AI 不越过医疗边界。', '人机协作'], ['Human in the loop', 'AI extracts, a person confirms each line; AI never crosses the clinical line.', 'Human-in-the-loop']],
  agent: [['四扇固定的门', '智能体只开四扇门，回答只来自规则和审核过的内容；问它「这个情况正常吗」，它永远不会回答「正常」。', '安全边界'], ['Four fixed doors', 'The agent opens only four doors and answers only from rules and reviewed content; asked “is this normal?”, it never says yes.', 'Safety boundary']],
  upflow: [['升级要经过三步', '系统只提建议；患者决定愿不愿意，家属（或一个人时由患者自己）检查家里条件，专业人员最后拍板。', '自我决定理论；人在回路'], ['Three steps to move up', 'The system only suggests; the patient decides, family (or the patient, when on their own) checks the home, and a professional makes the final call.', 'Self-determination; human-in-the-loop']],
  route: [['地图，而不是完成率圆环', '90 格路线让人看到自己在整段旅程中的位置，比「今天 0/3」更有方向感。', '目标梯度；赋予进度'], ['A map, not a completion ring', 'A 90-cell route shows where you are on the whole journey; that gives more direction than “0/3 today”.', 'Goal gradient; endowed progress']],
  stall: [['停滞也是例外', '同一等级停 7 天以上会被列出来，专业人员可以及时换方法。', '例外管理'], ['Stalls are exceptions too', 'Seven days at one level gets listed so the team can change approach in time.', 'Management by exception']],
  ownGoal: [['目标用自己的话说', '自己说出的目标更容易坚持。', '自我决定理论'], ['Goals in your own words', 'Goals you state yourself are easier to keep.', 'Self-determination theory']],
};

// Six principles for the landing page.
const PRINCIPLES = [
  { name: ['脚手架', 'Scaffolding'], plain: ['先有人扶着做到，再一层层撤掉扶手。', 'First do it with support, then remove the support layer by layer.'], apply: ['四级交还：替我做、陪我做、在旁保护、我自己能做到。', 'Four levels: done for me, together, stood by, on my own.'], cite: 'Wood, Bruner & Ross, 1976' },
  { name: ['自主、胜任、联结', 'Autonomy, competence, relatedness'], plain: ['人在能自己选择、觉得做得到、和别人有联系时，最能坚持。', 'People keep going when they choose for themselves, feel capable, and feel connected.'], apply: ['升级先问患者愿不愿意；每天三件做得到的事；三方一起复盘。', 'Upgrades start with the patient’s yes; three doable tasks a day; reviews written by all three.'], cite: 'Ryan & Deci, 2000' },
  { name: ['亲身做到', 'Mastery experience'], plain: ['信心最强的来源，是自己做成功过，而不是别人的鼓励。', 'Confidence comes most from doing it yourself, not from being cheered on.'], apply: ['不说"加油"，只记录和展示他真的做到的事。', 'No cheering; we record and show what they actually did.'], cite: 'Bandura, 1977' },
  { name: ['执行意图', 'Implementation intentions'], plain: ['提前想好"在什么情况下做"，比只下决心有效得多。', 'Deciding “when X, I’ll do Y” works far better than resolve alone.'], apply: ['每件事都可以选：早饭后、午饭后、晚饭后。', 'Every task can be tied to after breakfast, lunch or dinner.'], cite: 'Gollwitzer & Sheeran, 2006' },
  { name: ['目标梯度', 'Goal gradient'], plain: ['离目标越近，人越有动力。', 'The closer the goal, the stronger the pull.'], apply: ['显示"再完成 1 次就能试下一步"，而不是遥远的终点。', 'We show “1 more to the next step”, not a distant finish line.'], cite: 'Kivetz, Urminsky & Zheng, 2006' },
  { name: ['打破依赖循环', 'Breaking the dependency script'], plain: ['照护者往往对依赖马上回应，对独立反而不注意，于是越帮越依赖。', 'Carers tend to respond to dependence and overlook independence, so help breeds dependence.'], apply: ['家属先看到"今天可以少做几件事"，也能看到他自己做到的事。', 'Family first sees how much less to do today, and what the patient did alone.'], cite: 'Baltes, 1996' },
];

const t = (k, v = {}) => {
  const e = T[k];
  let s = Array.isArray(e) ? e[S.lang === 'zh' ? 0 : 1] : k;
  if (typeof s === 'string') for (const [a, b] of Object.entries(v)) s = s.replaceAll(`{${a}}`, b);
  return s;
};
const tt = (pair) => pair[S.lang === 'zh' ? 0 : 1];
const tr = (o) => (o == null ? '' : typeof o === 'string' ? o : o[S.lang] ?? o.zh ?? '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const E = (o) => esc(tr(o));
const C = () => (S.lang === 'zh' ? '：' : ': ');
const SEMI = () => (S.lang === 'zh' ? '；' : '; ');
const pname = (d) => (S.lang === 'en' && d.profile.nameEn) || d.profile.name || '';
const why = (k) => {
  const [name, text, cite] = tt(WHY[k]);
  return `<aside class="why" aria-hidden="${!S.why}"><b>${esc(name)}</b>${esc(text)} <cite>${esc(cite)}</cite></aside>`;
};

// ---------- api ----------
async function api(path, body) {
  const res = await fetch(`/api${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(tr(data.i18n) || data.error || res.statusText), { status: res.status });
  return data;
}

// A page read that finishes after the user has already moved to another page is dropped,
// so a slow response can never paint an old page over the new one.
const STALE = new Error('stale');
async function read(path) {
  const h = location.hash;
  const d = await api(path);
  if (location.hash !== h) throw STALE;
  return d;
}

function toast(msg, err = false) {
  document.querySelectorAll('.toast').forEach((n) => n.remove());
  const n = document.createElement('div');
  n.className = `toast${err ? ' err' : ''}`;
  n.setAttribute('role', 'status');
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2600);
}

// ---------- shared pieces ----------
const LV = (i, role = 'patient') => tr(S.meta.levels[i][role]);
const trackName = (tk) => t({ body: 'trackBody', life: 'trackLife', social: 'trackSocial' }[tk] || 'trackBody');
const chip = (level, role = 'patient') => `<span class="chip lv${level}">${esc(LV(level, role))}</span>`;
const sourcesLine = (keys) => `<div class="src">${t('source')}${keys.map((k) => esc(tr(S.meta.sources[k]))).join(SEMI())}</div>`;
const moodWord = (m) => (m ? tt(T.moods)[m - 1] : '-');

// The small version of the Handover Line: four stops on a rail, filled up to the current level.
function track(level, { role = 'patient', size = '', labels = true } = {}) {
  const segs = [1, 2, 3, 4].map((i) => `<span class="seg s${i}${i <= level ? ' on' : ''}${i === level ? ' cur' : ''}"></span>`).join('');
  const lab = labels ? `<div class="track-labels" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<span class="${i === level ? 'cur' : ''}">${esc(LV(i, role))}</span>`).join('')}</div>` : '';
  return `<div class="track ${size} at${level}" role="img" aria-label="${esc(LV(level, role))}">${segs}</div>${lab}`;
}

// Signature glyph: the family ring steps away from the patient as the level rises.
const GAP = [0, 22, 46, 80, 124];
function gapGlyph(level, { w = 170, labels = true, id = '' } = {}) {
  const k = (w - 28) / GAP[4];
  const x = 14 + GAP[level] * k;
  return `<svg class="gap-glyph" ${id ? `id="${id}"` : ''} data-k="${k}" width="${w}" height="${labels ? 46 : 28}" viewBox="0 0 ${w} ${labels ? 46 : 28}" aria-hidden="true">
    <line class="tie" x1="14" y1="14" x2="${x}" y2="14"/>
    <circle class="me" cx="14" cy="14" r="9"/>
    <circle class="fam${level === 4 ? ' far' : ''}" cx="${x}" cy="14" r="9"/>
    ${labels ? `<text x="14" y="42" text-anchor="middle">${t('me')}</text><text class="famlabel" x="${x}" y="42" text-anchor="middle">${t('fam')}</text>` : ''}
  </svg>`;
}

// Signature: the Handover Line. A transit diagram for one ability. The patient's yellow line runs
// straight to day 90; the family line runs beside it and steps further away at each stop, then ends.
// Stops sit at the centres of a 4-column grid so the HTML labels above and below line up at any width.
// Two geometries: a wide one, and a compact one for phones so strokes and stops stay legible.
const HL_GEO = {
  wide: { W: 1200, H: 160, Y: 40, sw: 16, fw: 9, r: 15, rc: 19, off: [18, 52, 96], diag: 36, arrow: 36 },
  narrow: { W: 400, H: 90, Y: 20, sw: 9, fw: 5, r: 8, rc: 11, off: [11, 30, 52], diag: 16, arrow: 15 },
};
function hlSvg(g, { level, selected, cls }) {
  const gap = g.W / 4;
  const x = [0, 1, 2, 3].map((i) => gap * (i + 0.5));
  const fy = g.off.map((o) => g.Y + o);
  const run = gap * 0.47;
  const left = g.sw;
  const f = `M${left} ${fy[0]} H${x[0] + run} L${x[0] + run + g.diag} ${fy[1]} H${x[1] + run} L${x[1] + run + g.diag} ${fy[2]} H${x[2] + run - 10}`;
  const endX = x[2] + run - 10;
  const tip = g.W - g.arrow - 4;
  const ties = fy.map((y, i) => `<line class="tie${i === 0 ? ' near' : ''}${i + 1 === selected ? ' sel' : ''}" x1="${x[i]}" y1="${g.Y}" x2="${x[i]}" y2="${y}"/>`).join('');
  const stops = x.map((cx, i) => {
    const n = i + 1;
    const c = `st${n < level ? ' passed' : ''}${n === level ? ' cur' : ''}${n === selected ? ' sel' : ''}`;
    return `<circle class="${c}" style="--i:${i}" cx="${cx}" cy="${g.Y}" r="${n === level ? g.rc : g.r}" stroke-width="${g.fw * 0.68}"/>`;
  }).join('');
  return `<svg class="hl-svg ${cls}" viewBox="0 0 ${g.W} ${g.H}" aria-hidden="true">
      <path class="f-line" pathLength="1" stroke-width="${g.fw}" d="${f}"/>
      <line class="f-end" stroke-width="${g.fw}" x1="${endX}" y1="${fy[2] - g.fw * 1.4}" x2="${endX}" y2="${fy[2] + g.fw * 1.4}"/>
      ${ties}
      <path class="p-line" pathLength="1" stroke-width="${g.sw}" d="M${left} ${g.Y} H${tip}"/>
      <path class="p-arrow" d="M${tip} ${g.Y - g.arrow * 0.55} L${g.W - 2} ${g.Y} L${tip} ${g.Y + g.arrow * 0.55} Z"/>
      ${stops}
    </svg>`;
}
function handoverLine({ ability, level, selected = level, interactive = false, intro = false, rehab = '', here = true }) {
  const ab = S.meta.abilities.find((a) => a.id === ability);
  const labels = (role) => [1, 2, 3, 4].map((n) => interactive && role === 'patient'
    ? `<button type="button" class="hl-lb${n === selected ? ' sel' : ''}${n === level ? ' cur' : ''}" data-act="hl" data-n="${n}" aria-pressed="${n === selected}">${esc(LV(n, role))}</button>`
    : `<span class="hl-lb${n === selected ? ' sel' : ''}${n === level ? ' cur' : ''}">${esc(LV(n, role))}</span>`).join('');
  const lv = ab?.levels?.[selected];
  const rehabText = selected === level ? rehab : t(selected < level ? 'hlPassed' : 'hlAhead');
  return `<div class="hl${intro ? ' intro' : ''}" data-ability="${ability}" data-level="${level}">
    ${here ? `<div class="hl-row hl-here" aria-hidden="true">${[1, 2, 3, 4].map((n) => `<span>${n === level ? `<b class="here">${pin(15)}${t('hlHere')}</b>` : ''}</span>`).join('')}</div>` : ''}
    <div class="hl-row hl-p" role="group" aria-label="${t('hlKai')}">${labels('patient')}</div>
    <div role="img" aria-label="${esc(LV(level))}">${hlSvg(HL_GEO.wide, { level, selected, cls: 'wide' })}${hlSvg(HL_GEO.narrow, { level, selected, cls: 'narrow' })}</div>
    <div class="hl-row hl-f">${labels('family')}</div>
    ${lv ? `<dl class="hl-cap" aria-live="polite">
      <div><dt>${t('tcPatient')}</dt><dd>${E(lv.p)}</dd></div>
      <div><dt>${t('tcFamily')}</dt><dd>${E(lv.f)}</dd></div>
      <div><dt>${t('tcRehab')}</dt><dd>${rehabText}</dd></div>
    </dl>` : ''}
  </div>`;
}

const pin = (size = 18) => `<svg class="pin" width="${size}" height="${Math.round(size * 1.3)}" viewBox="0 0 20 26" aria-hidden="true"><path d="M10 1C5 1 1.5 4.6 1.5 9.3 1.5 15.6 10 25 10 25s8.5-9.4 8.5-15.7C18.5 4.6 15 1 10 1z"/><circle cx="10" cy="9.3" r="3"/></svg>`;

function routeStrip(map) {
  const cls = (d) => {
    if (d.paused?.length) return 'red';
    if (!d.levels) return '';
    const v = Object.values(d.levels);
    return `l${Math.min(4, Math.max(1, Math.round(v.reduce((a, b) => a + b, 0) / v.length)))}`;
  };
  const phases = S.meta.phases.map((p) => `<span class="${map.current >= p.from && map.current <= p.to ? 'on' : ''}" style="grid-column:${p.from} / ${p.to + 1}">${E(p.name)}</span>`).join('');
  return `<div class="route" role="img" aria-label="${t('routeLbl')}">${map.days.map((d) => `<i class="${cls(d)}${d.day === map.current ? ' today' : ''}" title="${t('day', { d: d.day })}"></i>`).join('')}</div>
    <div class="route-ph" aria-hidden="true">${phases}</div>`;
}

const meter = (pct) => `<div class="meter"><div class="label"><span>${t('autonomy')}</span><b class="num">${pct}%</b></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;

// Pictograms, drawn on a 20-unit grid with one stroke weight, like a signage set.
const ICONS = {
  p: '<circle cx="10" cy="5" r="2.6"/><path d="M10 9v5.5M6 11.5h8M10 14.5l-2.6 4M10 14.5l2.6 4"/>',
  f: '<circle cx="7" cy="5.5" r="2.3"/><circle cx="14" cy="6.5" r="1.9"/><path d="M7 9v5M4 11h6M7 14l-2 4M7 14l2 4M14 10v4M12 12h4M14 14l-1.5 3.5M14 14l1.5 3.5"/>',
  r: '<rect x="4" y="3.5" width="12" height="14" rx="1.5"/><path d="M10 7v6M7 10h6"/>',
  map: '<path d="M3 16c3 0 3-5 7-5s4-6 7-6"/><circle cx="3" cy="16" r="1.6"/><circle cx="17" cy="5" r="1.6"/>',
  start: '<path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M10 9v5M7.5 11.5h5"/>',
  why: '<circle cx="10" cy="10" r="7"/><path d="M10 9v5"/><circle cx="10" cy="6.3" r="0.6"/>',
  life: '<path d="M3 15.5h14"/><path d="M5.5 15.5V11M10 15.5V7.5M14.5 15.5V4"/><path d="M12.5 5.8 14.5 3.8l2 2"/>',
  riri: '<path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v6.5A1.5 1.5 0 0 1 16 14H9l-4 3v-3H4a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 4 4.5z"/><path d="M7 9.3h.01M10 9.3h.01M13 9.3h.01"/>',
  body: '<path d="M10 2.5v15M6 6.5h8"/><circle cx="10" cy="10" r="7.5"/>',
};
const icon = (k) => `<svg class="ico" viewBox="0 0 20 20" aria-hidden="true">${ICONS[k]}</svg>`;

function header(active) {
  const id = S.pid;
  const link = (href, key, name) => `<a href="${href}"${active === name ? ' aria-current="page"' : ''}>${icon(name)}<span>${t(key)}</span></a>`;
  document.getElementById('top').innerHTML = `<div class="wrap">
    <a class="brand" href="#/">${pin(15)}<b>ReStart90</b><span>${t('brandSub')}</span></a>
    <nav class="roles" aria-label="views">
      ${link(`#/p/${id}`, 'navPatient', 'p')}${link(`#/f/${id}`, 'navFamily', 'f')}${link(`#/r`, 'navRehab', 'r')}${link(`#/life/${id}`, 'navLife', 'life')}${link(`#/map/${id}`, 'navMap', 'map')}${link('#/start', 'navNew', 'start')}${link('#/why', 'navWhy', 'why')}
    </nav>
    <div class="tools"><button class="pill-btn" data-act="why" aria-pressed="${S.why}">${t('whyBtn')}</button><button class="pill-btn" data-act="lang">${t('langBtn')}</button></div>
  </div>`;
}

function demobar(show) {
  const el = document.getElementById('demobar');
  if (!show || !S.data) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="demobar" role="toolbar" aria-label="${t('demo')}">
    <b>${t('demo')}　${t('day', { d: S.data.day })}</b>
    <button data-act="advance">${t('nextDay')}</button>
    <button data-act="inject-yellow">${t('injYellow')}</button>
    <button class="warn" data-act="inject-red">${t('injRed')}</button>
    <button data-act="reset">${t('reset')}</button>
  </div>`;
}

function alertBanners(d, role) {
  return d.alerts.filter((a) => a.status === 'open').map((a) => {
    const sigs = a.signals.map((s) => S.meta.signals.find((x) => x.id === s)).filter(Boolean);
    const emergency = a.level === 'emergency';
    return `<section class="banner ${emergency ? 'emergency' : 'red'}" role="alert">
      <h3>${t(emergency ? 'emergencyTitle' : 'alertTitle')}</h3>
      <p>${sigs.map((s) => `<b>${E(s.label)}</b>${C()}${E(s.action)}`).join('<br>')}</p>
      ${sigs.some((s) => s.id === 'crisis') ? `<p class="small">${t('sos')}</p>` : ''}
      <details${role !== 'patient' ? ' open' : ''}><summary>${t('summaryTitle')}</summary><pre class="summary" id="sum-${a.id}">${E(a.summary)}</pre>
      <div class="row"><button class="btn sm ghost" data-act="copy" data-target="sum-${a.id}">${t('copy')}</button></div></details>
      ${role === 'patient' && !d.support?.rehab ? `<details class="self-resolve"><summary>${t('resolveSelfH')}</summary>
        <textarea id="reply-${a.id}" placeholder="${t('resolveSelfPh')}"></textarea>
        <div class="row"><button class="btn sm" data-act="resolve" data-aid="${a.id}" data-role="patient">${t('resolveSelf')}</button></div></details>` : ''}
    </section>`;
  }).join('');
}

function holdBanner(d) {
  if (!d.hold || d.alerts.some((a) => a.status === 'open')) return '';
  return `<section class="banner amber"><h3>${t('holdTitle')}</h3><p>${E(d.hold)}</p>${why('explain')}</section>`;
}

function headMeta(d) {
  return `<div class="meta"><b>${esc(pname(d))}</b><span class="chip">${E(d.phase.name)}</span>${d.date ? `<span class="num">${d.date}</span>` : ''}</div>`;
}

// ---------- landing ----------
// The 90-day route across the bottom of the hero: one tick a day, a taller tick where each phase begins.
function heroRoute(day) {
  const starts = new Set(S.meta.phases.map((p) => p.from));
  const ticks = Array.from({ length: 90 }, (_, i) => `<i class="${starts.has(i + 1) ? 'ph' : ''}${i + 1 <= day ? ' done' : ''}${i + 1 === day ? ' now' : ''}" style="--d:${i}"></i>`).join('');
  return `<div class="hroute${day > 70 ? ' end' : ''}" style="--day:${day}">
    <div class="hroute-pin"><b class="here">${pin(15)}${t('heroWhere', { d: day })}</b></div>
    <div class="hroute-line"><span class="hroute-fill"></span></div>
    <div class="hroute-ticks" aria-hidden="true">${ticks}</div>
    <div class="hroute-ph" aria-hidden="true">${S.meta.phases.map((p) => `<span style="grid-column:${p.from} / ${p.to + 1}">${E(p.name)}</span>`).join('')}</div>
    <div class="hroute-end" aria-hidden="true">${t('hlDay90')}</div>
  </div>`;
}

// Scroll story: the stage stays on screen while four markers scroll past; each one moves Kai a stop forward.
function storySection(ability) {
  const ab = S.meta.abilities.find((a) => a.id === ability);
  const step = (n) => `<article class="sto" data-n="${n}">
      <div class="sto-n num">${String(n).padStart(2, '0')}</div>
      <h3>${esc(LV(n))}</h3>
      <dl><div><dt>${t('stKai')}</dt><dd>${E(ab.levels[n].p)}</dd></div><div><dt>${t('stFam')}</dt><dd>${E(ab.levels[n].f)}</dd></div></dl>
    </article>`;
  return `<section class="story" id="story" data-step="1">
    <div class="story-stage">
      <div class="wrap story-grid">
        <div class="story-copy">
          <h2>${t('stTitle')}</h2>
          <p class="story-intro">${t('stIntro', { life: E(ab.life) })}</p>
          <div class="sto-stack">${[1, 2, 3, 4].map(step).join('')}</div>
        </div>
        <div class="story-vis">
          <div class="story-here" aria-hidden="true"><b class="here">${pin(15)}${t('hlHere')}</b></div>
          ${hlSvg(HL_GEO.wide, { level: 0, selected: 0, cls: 'wide' })}${hlSvg(HL_GEO.narrow, { level: 0, selected: 0, cls: 'narrow' })}
          <div class="story-labels">${[1, 2, 3, 4].map((n) => `<span data-n="${n}">${esc(LV(n))}<small>${esc(LV(n, 'family'))}</small></span>`).join('')}</div>
        </div>
      </div>
    </div>
    <div class="story-marks" aria-hidden="true">${[1, 2, 3, 4].map((n) => `<i data-n="${n}"></i>`).join('')}</div>
  </section>`;
}

function watchStory() {
  const story = document.getElementById('story');
  if (!story) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) story.dataset.step = e.target.dataset.n;
  }, { rootMargin: '-50% 0px -50% 0px' });
  story.querySelectorAll('.story-marks i').forEach((m) => io.observe(m));
}

// V0.3: three layers that join independently. The first one is enough to start.
function layersGrid() {
  const L = [['riri', 'layer1', 'layer1Tag', 'layer1Items'], ['f', 'layer2', 'layer2Tag', 'layer2Items'], ['r', 'layer3', 'layer3Tag', 'layer3Items']];
  return `<div class="layers">${L.map(([ic, h, tag, items], i) => `<article class="layer l${i + 1}">
      <div class="layer-top"><span class="layer-n num">${i + 1}</span><span class="xr-ico">${icon(ic)}</span></div>
      <h3>${t(h)}</h3><p class="layer-tag">${t(tag)}</p>
      <ul>${tt(T[items]).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </article>`).join('')}</div>`;
}

async function viewLanding() {
  header('home');
  demobar(false);
  let day = 9, ability = 'grooming';
  try {
    const d = await read('/patients/demo?role=patient');
    day = d.day;
    ability = (d.tasks.main.find((x) => x.kind === 'ability' && x.track === 'life') || d.tasks.main.find((x) => x.kind === 'ability'))?.ability || ability;
  } catch (e) { if (e === STALE) throw e; /* the page still works with the default day */ }
  const intro = !S.ui.introDone;
  S.ui.introDone = true;
  document.getElementById('app').innerHTML = `
  <section class="xhero${intro ? ' intro' : ''}">
    <div class="wrap xhero-in">
      <p class="xhero-scope">${t('heroScope')}</p>
      <h1>${t('heroTitle')}</h1>
      <div class="xhero-foot">
        <div><p class="lead">${t('heroLead')}</p><p class="lead alone">${t('heroAlone')}</p></div>
        <div class="actions"><a class="btn sun" href="#/p/demo" data-act="use-demo">${t('heroDemo')}</a><a class="btn outline-light" href="#/start">${t('heroStart')}</a></div>
      </div>
      ${why('pyramid')}
    </div>
    <div class="wrap">${heroRoute(day)}</div>
    <a class="scroll-hint" href="#story" data-act="to-story">${t('scrollHint')}</a>
  </section>
  ${filmSection()}
  <section class="xroles"><div class="wrap">
    <h2>${t('layersTitle')}</h2><p class="xintro">${t('layersIntro')}</p>
    ${layersGrid()}
    <p class="layers-note">${t('layersNote')}</p>
    ${why('layers')}
  </div></section>
  ${storySection(ability)}
  <section class="xentry"><div class="wrap xentry-in">
    <div><p class="kicker">${t('storyKicker')}</p><h2>${t('storyH')}</h2><p>${t('storyGoal')}</p></div>
    <a class="btn sun" href="#/story">${t('storyLink')} →</a>
    ${why('story')}
  </div></section>
  <section class="xsafe"><div class="wrap xsafe-grid">
    <div><h2>${t('sfTitle')}</h2><p>${t('sfBody')}</p><a class="btn outline-light" href="#/p/demo" data-act="use-demo">${t('sfTry')}</a></div>
    <pre class="ticket">${esc(t('sfTicket'))}</pre>
  </div></section>
  <section class="xcta"><div class="wrap">
    <h2>${t('ctaTitle')}</h2><p>${t('ctaBody')}</p>
    <div class="actions"><a class="btn" href="#/start">${t('heroStart')}</a><a class="btn ghost" href="#/p/demo" data-act="use-demo">${t('heroDemo')}</a><a class="btn ghost" href="#/why">${t('whyLink')}</a></div>
  </div></section>
  <footer class="foot"><div class="wrap">${t('foot')}</div></footer>`;
  watchStory();
  wireFilm();
}

// ---------- why it works (moved off the landing page) ----------
function viewWhy() {
  header('why');
  demobar(false);
  document.getElementById('app').innerHTML = `
  <section class="xopen"><div class="wrap">
    <h1>${t('gapTitle')}</h1><p class="intro">${t('gapIntro')}</p>
    <div class="gap-rows">
      <div class="gh"><span>${t('gapLeft')}</span><span>${t('gapRight')}</span></div>
      ${T.gapRows.map((r) => `<div class="gr"><span class="from">${esc(tt(r)[0])}</span><span class="to">${esc(tt(r)[1])}</span></div>`).join('')}
    </div>
    ${why('conflict')}
  </div></section>
  <section class="band"><div class="wrap">
    <h2>${t('methodTitle')}</h2><p class="intro">${t('methodIntro')}</p>
    <div class="hl-plate quiet">${handoverLine({ ability: 'grooming', level: 4, selected: 0, here: false })}</div>
    ${why('scaffold')}
  </div></section>
  <section class="band"><div class="wrap">
    <h2>${t('layersTitle')}</h2><p class="intro">${t('layersIntro')}</p>
    ${layersGrid()}
    ${why('layers')}
  </div></section>
  <section class="band"><div class="wrap">
    <h2>${t('sciTitle')}</h2><p class="intro">${t('sciIntro')}</p>
    <div class="sci-list">${PRINCIPLES.map((p) => `<article><div class="sci-name"><h3>${esc(tt(p.name))}</h3><cite>${esc(p.cite)}</cite></div><p class="plain">${esc(tt(p.plain))}</p><p class="apply"><b>${t('sciApply')}</b>${esc(tt(p.apply))}</p></article>`).join('')}</div>
    <p class="science-note">${t('sciNote')}</p>
    ${why('evidence')}
  </div></section>
  <section class="band"><div class="wrap">
    <h2>${t('notTitle')}</h2>
    <div class="no-signs">${T.nots.map((n) => `<div><svg class="no-ico" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16"/><path d="M8.7 8.7l22.6 22.6"/></svg><b>${esc(tt(n)[0])}</b><span>${esc(tt(n)[1])}</span></div>`).join('')}</div>
    ${why('trust')}
  </div></section>
  <section class="cta"><div class="wrap">
    <h2>${t('ctaTitle')}</h2><p>${t('ctaBody')}</p>
    <div class="actions"><a class="btn light" href="#/start">${t('heroStart')}</a><a class="btn outline-light" href="#/p/demo" data-act="use-demo">${t('heroDemo')}</a></div>
    ${why('fresh')}
  </div></section>
  <footer class="foot"><div class="wrap">${t('foot')}</div></footer>`;
}

// ---------- patient ----------
function checkinPanel(d) {
  const ck = d.checkin;
  if (ck && !S.ui.ckEdit) {
    return `<section class="panel"><div class="checkin-done"><span>${t('ckDone', { p: ck.pain ?? '-', m: moodWord(ck.mood) })}</span><span class="row" style="margin:0"><a class="btn sm ghost" href="#/body/${S.pid}">${t('bodyLink')}</a><button class="btn sm ghost" data-act="ck-edit">${t('ckEdit')}</button></span></div>${S.ui.ckResult || ''}</section>`;
  }
  const f = (S.ui.ck ||= { pain: ck?.pain ?? d.baselinePain, mood: ck?.mood ?? 3, wound: ck?.wound || 'normal', symptoms: ck?.symptoms || [], fever: !!ck?.fever, fall: !!ck?.fall, note: '', private: false });
  const sigs = ['soundFoot', 'chest', 'crisis'].map((id) => S.meta.signals.find((s) => s.id === id));
  return `<section class="panel" id="checkin">
    <h3>${t('ckTitle')}</h3>
    <p class="small muted" style="margin-top:-8px">${t('ckWhy')}</p>
    ${why('safety')}
    <div class="checkin">
      <div><span class="lbl">${t('pain')}（${t('painHint')}）</span><div class="painrow"><input type="range" min="0" max="10" value="${f.pain}" data-ck="pain" aria-label="${t('pain')}"><span class="painval" id="painv">${f.pain}</span></div></div>
      <div><span class="lbl">${t('wound')}</span><div class="choice">${[['normal', 'woundNormal'], ['red', 'woundRed'], ['leak', 'woundLeak']].map(([v, k]) => `<button aria-pressed="${f.wound === v}" data-act="ck-wound" data-v="${v}">${t(k)}</button>`).join('')}</div></div>
      <div><span class="lbl">${t('mood')}</span><div class="choice">${tt(T.moods).map((w, i) => `<button aria-pressed="${f.mood === i + 1}" data-act="ck-mood" data-v="${i + 1}">${w}</button>`).join('')}</div></div>
    </div>
    <details class="more"${f.note || f.fever || f.fall || f.symptoms.length ? ' open' : ''}><summary>${t('moreCk')}</summary>
      <div class="grid2" style="margin-top:12px">
        <div class="checks">
          <label><input type="checkbox" data-ck="fever"${f.fever ? ' checked' : ''}> ${t('fever')}</label>
          <label><input type="checkbox" data-ck="fall"${f.fall ? ' checked' : ''}> ${t('fall')}</label>
          ${sigs.map((s) => `<label><input type="checkbox" data-ck-sym="${s.id}"${f.symptoms.includes(s.id) ? ' checked' : ''}> ${E(s.label)}</label>`).join('')}
        </div>
        <div><label class="f"><span>${t('noteLabel')}</span><textarea data-ck="note">${esc(f.note)}</textarea></label>
          <div class="checks"><label><input type="checkbox" data-ck="private"${f.private ? ' checked' : ''}> ${t('private')}</label></div></div>
      </div>
    </details>
    <div style="margin-top:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn" data-act="checkin">${t('sendCk')}</button><a class="btn ghost" href="#/body/${S.pid}">${icon('body')}${t('bodyLink')}</a><span class="sos" style="margin:0">${t('sos')}</span></div>
    ${S.ui.ckResult || ''}
  </section>`;
}

function taskCard(task, d, { main = true, first = {} } = {}) {
  const log = d.logs[task.id] || {};
  const after = S.ui.after?.[task.id];
  const isAbility = task.kind === 'ability';
  const title = isAbility ? tr(task.life) : tr(task.name);
  const status = task.kind === 'safe' ? '' : `<div class="choice status" role="group" aria-label="${esc(title)}">
      ${['done', 'partial', 'cant'].map((s) => `<button class="st-${s}" aria-pressed="${log.status === s}" data-act="log" data-task="${task.id}" data-status="${s}">${t({ done: 'stDone', partial: 'stPartial', cant: 'stCant' }[s])}</button>`).join('')}
    </div>`;
  if (!main) {
    return `<div class="rowi"><div class="t">${esc(title)} ${isAbility ? chip(task.level) : ''}</div><div class="d">${E(task.patient)}${after ? `<div class="small" style="margin-top:6px">${after}</div>` : ''}</div>${status}</div>`;
  }
  const mile = isAbility ? d.milestones.find((m) => m.ability === task.ability) : null;
  const when = task.kind === 'safe' ? '' : `<div class="when"><span class="lbl">${t('whenLbl')}</span><div class="choice quiet">${Object.keys(T.slots).map((k) => `<button aria-pressed="${log.plan_when === k}" data-act="plan" data-task="${task.id}" data-when="${k}">${tt(T.slots[k])}</button>`).join('')}</div></div>`;
  const grad = mile ? `<div class="grad"><span class="pips">${Array.from({ length: mile.need }, (_, i) => `<i class="${i < mile.streak ? 'on' : ''}"></i>`).join('')}</span><span>${mile.left === 0 || mile.pending ? t('gradReady', { next: esc(LV(mile.to)) }) : t('gradLeft', { n: mile.left, next: esc(LV(mile.to)) })}</span></div>` : '';
  return `<article class="task ${task.kind === 'safe' ? 'safe' : task.track}${log.status === 'done' ? ' is-done' : ''}">
    <div class="kind">${trackName(task.track)}${isAbility ? ` ${chip(task.level)}` : ''}${task.smaller ? `<span class="chip amber">${t('smallerBadge')}</span>` : ''}${task.goal ? `<span class="chip goal">${t('goalBadge')}</span>` : ''}</div>
    ${task.kind === 'social' ? `<h3>${E(task.patient)}</h3>` : `<h3>${esc(title)}</h3><p class="do">${E(task.patient)}</p>`}
    ${when}${first.when ? why('intention') : ''}
    ${status}
    ${grad}${first.grad && grad ? why('gradient') : ''}
    ${after ? `<div class="after${S.ui.afterGood?.[task.id] ? ' good' : ''}">${after}</div>` : ''}
    <div class="fam">${t('familyDoes')}${E(task.family)}</div>
    ${sourcesLine(task.sources)}
  </article>`;
}

function upSteps(p, d = S.data) {
  const st = (v) => (v === 1 ? 'ok' : v === 0 ? 'no' : '');
  const self = p.home_by === 'self' || (p.home_by == null && !d?.support?.family);
  return `<div class="steps3"><span class="${st(p.patient_ok)}">${t('stepPatient')}</span><span class="${st(p.family_ok)}">${t(self ? 'stepSelf' : 'stepFamily')}</span><span>${t(d?.support?.rehab ? 'stepRehab' : 'stepPro')}</span></div>`;
}

function patientAsks(d) {
  return d.pending.filter((p) => p.to_level > p.from_level).map((p) => {
    const name = tr(p.name), next = LV(p.to_level);
    if (p.patient_ok == null) {
      return `<section class="banner sun"><h3>${t('askPatient', { name: esc(name), next: esc(next) })}</h3><p class="small">${t('askBody')}</p>
        <div style="margin-top:14px;max-width:560px">${track(p.to_level)}</div>
        <div class="row"><button class="btn sun" data-act="decide" data-pid="${p.id}" data-decision="approve" data-role="patient">${t('askYes')}</button><button class="btn ghost" data-act="decide" data-pid="${p.id}" data-decision="decline" data-role="patient">${t('askLater')}</button></div>
        ${upSteps(p)}${why('autonomy')}</section>`;
    }
    // On their own, the patient checks the home themselves (V0.3).
    if (!d.support.family && p.family_ok == null && p.status !== 'held') {
      return `<section class="banner sun"><h3>${t('waitSelf', { name: esc(name), next: esc(next) })}</h3>
        <p class="small" style="margin:8px 0 6px"><b>${t('selfCheck')}</b></p>
        <ul class="selfcheck">${tt(T.selfChecks).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <div class="row"><button class="btn sun" data-act="decide" data-pid="${p.id}" data-decision="approve" data-role="patient" data-home="1">${t('selfYes')}</button><button class="btn ghost" data-act="decide" data-pid="${p.id}" data-decision="decline" data-role="patient" data-home="1">${t('selfNo')}</button></div>
        ${upSteps(p)}${why('upflow')}</section>`;
    }
    const key = p.family_ok == null ? 'waitFamily' : p.family_ok === 0 ? 'waitFamilyNo' : d.support.rehab ? 'waitRehab' : 'waitProSolo';
    return `<section class="banner ${p.status === 'held' ? 'amber' : 'calm'}"><p style="margin:0">${p.status === 'held' ? t('heldBy', { why: E(p.note) }) : t(key, { name: esc(name), next: esc(next) })}</p>${upSteps(p)}</section>`;
  }).join('');
}

function familyAsks(d) {
  return d.pending.filter((p) => p.to_level > p.from_level && p.patient_ok === 1).map((p) => {
    const ab = d.abilities.find((a) => a.id === p.ability);
    if (p.family_ok == null) {
      return `<section class="banner sun"><h3>${t('famAsk', { name: esc(pname(d)), life: E(ab.life), next: esc(LV(p.to_level, 'family')) })}</h3>
        <textarea id="fn-${p.id}" placeholder="${t('famNoPh')}" style="min-height:52px;margin-top:10px"></textarea>
        <div class="row"><button class="btn sun" data-act="decide" data-pid="${p.id}" data-decision="approve" data-role="family">${t('famYes')}</button><button class="btn ghost" data-act="decide" data-pid="${p.id}" data-decision="decline" data-role="family">${t('famNo')}</button></div>
        ${upSteps(p)}${why('upflow')}</section>`;
    }
    return `<section class="banner calm"><p style="margin:0">${E(ab.name)}${C()}${t('famWait')}</p>${upSteps(p)}</section>`;
  }).join('');
}

function agentPanel(d) {
  const a = S.ui.agent || {};
  const door = (k, label) => `<button aria-pressed="${a.intent === k}" data-act="agent" data-intent="${k}">${t(label)}</button>`;
  const r = a.res;
  const peer = r?.peer ? S.meta.peers[d.day % S.meta.peers.length] : null;
  return `<section class="agent" id="agent">
    <div class="ah"><span class="riri-mark" aria-hidden="true">${icon('riri')}</span><div><b>${t('agentName')}</b><div class="small muted">${t('agentSub')}</div></div></div>
    <div class="doors">${door('today', 'agToday')}${door('cant', 'agCant')}${door('normal', 'agNormal')}${door('talk', 'agTalk')}</div>
    ${a.intent === 'normal' || a.intent === 'talk' ? `<label class="f" style="margin:12px 0 0"><span class="sr">${t(a.intent === 'normal' ? 'agNormalPh' : 'agTalkPh')}</span><textarea id="ag-text" placeholder="${t(a.intent === 'normal' ? 'agNormalPh' : 'agTalkPh')}" style="min-height:64px">${esc(a.text || '')}</textarea></label><div style="margin-top:8px"><button class="btn sm" data-act="agent-send">${t('agSend')}</button></div>` : ''}
    ${r ? `<div class="bubble${r.danger ? ' danger' : ''}" role="status">${E(r.reply)}
      ${r.choices ? `<div class="row">${r.choices.map((c) => `<button class="btn sm ghost" data-act="agent" data-intent="cant" data-task="${c.taskId}">${E(c.label)}</button>`).join('')}</div>` : ''}
      ${peer ? `<blockquote class="peer">${E(peer.text)}<cite>${E(peer.who)}</cite></blockquote>` : ''}
      ${r.actions ? `<div class="row">${r.actions.map((x) => `<button class="btn sm ${r.danger ? 'danger' : 'ghost'}" data-act="agent-do" data-do="${x.act}" data-task="${x.taskId || ''}">${E(x.label)}</button>`).join('')}</div>` : ''}
      ${a.done ? `<div class="small" style="margin-top:8px"><b>${a.done}</b></div>` : ''}
      ${r.danger ? `<p class="sos">${t('sos')}</p>` : ''}
    </div>` : ''}
    <div class="fine">${t('agFine')}</div>
    ${why('agent')}
  </section>`;
}

// V0.3: Riri is always there; family and rehab are layers the patient invites or removes.
function whoPanel(d) {
  const sp = d.support;
  const layer = (k, label, note) => {
    const on = sp[k];
    const nm = sp[`${k}Name`];
    const dd = sp[`${k}Day`];
    const open = S.ui.invite === k;
    return `<div class="who-row${on ? ' on' : ''}">
      <span class="who-dot" aria-hidden="true">${icon(k === 'family' ? 'f' : 'r')}</span>
      <div class="who-txt"><b>${t(label)}</b><span class="small muted">${on ? (dd ? t('whoJoined', { d: dd, name: E(nm) }) : t('whoJoinedNow', { name: E(nm) })) : t('whoNot')}</span>
        ${open ? `<div class="who-form"><input type="text" id="inv-${k}" placeholder="${t('whoNamePh')}" aria-label="${t('whoNamePh')}"><button class="btn sm" data-act="support" data-layer="${k}" data-action="invite">${t('whoAdd')}</button></div><p class="small muted" style="margin:6px 0 0">${t(note)} ${t('whoDemo')}</p>` : ''}
      </div>
      ${on ? `<button class="btn sm ghost" data-act="support" data-layer="${k}" data-action="remove">${t('whoRemove')}</button>` : open ? '' : `<button class="btn sm ghost" data-act="invite-open" data-layer="${k}">${t('whoInvite')}</button>`}
    </div>`;
  };
  return `<section class="panel who"><h3>${t('whoTitle')}</h3>
    <div class="who-row on riri"><span class="who-dot" aria-hidden="true">${icon('riri')}</span><div class="who-txt"><b>${t('whoRiri')}</b></div></div>
    ${layer('family', 'whoFamily', 'whoNoteFamily')}${layer('rehab', 'whoRehab', 'whoNoteRehab')}
    ${why('layers')}</section>`;
}

const lifeTodayLine = (n) => (n ? t(n === 1 ? 'lifeToday' : 'lifeTodayN', { n }) : t('lifeToday0'));

function abilityList(d, role) {
  return d.abilities.map((a) => `<div class="abil${a.active ? '' : ' inactive'}">
    <div class="nm"><b>${E(role === 'patient' ? a.life : a.name)}</b>${a.active ? (a.paused ? `<span class="chip red">${t('pausedChip')}</span>` : a.goal ? `<span class="chip goal">${t(role === 'patient' ? 'goalBadge' : 'goalBadgeOther')}</span>` : '') : `<span class="small muted">${t('startsPhase', { n: a.startsPhase })}</span>`}</div>
    ${a.active ? track(a.level, { role, labels: false }) : ''}
    ${a.active ? `<div class="small muted" style="margin-top:6px">${esc(LV(a.level, role))}</div>` : ''}
  </div>`).join('');
}

async function viewPatient(id) {
  await loadPatient(id, 'patient');
  const d = S.data;
  const map = await read(`/patients/${id}/map`);
  // Day one, nothing recorded yet: Riri speaks first (promo script V1.0).
  if (d.day === 1 && !d.checkin && !d.checkins.length && !S.ui.agent) S.ui.agent = { intent: 'welcome', res: await api(`/patients/${id}/agent`, { intent: 'welcome' }) };
  header('p');
  demobar(true);
  const tasks = d.tasks;
  const allDone = d.wins.total > 0 && d.wins.done === d.wins.total;
  const firstAbility = tasks.main.find((x) => x.kind === 'ability');
  const focus = tasks.main.find((x) => x.kind === 'ability' && x.track === 'life') || firstAbility;
  const doneTitles = tasks.main.filter((x) => d.logs[x.id]?.status === 'done').map((x) => (x.kind === 'ability' ? tr(x.life) : tr(x.patient)));
  document.getElementById('app').innerHTML = `<div class="page"><div class="wrap">
    <div class="head">
      <div><div class="meta"><b>${esc(pname(d))}</b>${d.date ? `<span class="num">${d.date}</span>` : ''}</div><h1 class="dayh"><span class="shield num" aria-hidden="true">${d.day}</span><span>${E(d.phase.name)}<small>${t('dayOf', { d: d.day })}</small></span></h1>
        <p class="sub">${allDone ? t('pSubDone') : focus ? t('pSub', { life: E(focus.life) }) : ''}</p>
        ${d.profile.customGoal ? `<div class="goalline">${pin(14)}<span>${t('day90')}${C()}${E(d.profile.customGoal)}</span></div>` : ''}
        ${why('fresh')}</div>
      <div class="head-stats" style="align-items:flex-end">
        <div class="route-wrap"><div class="label"><span>${t('routeLbl')}</span><span class="num">${d.day}/90</span></div>${routeStrip(map)}</div>
        <a class="stat life-stat" href="#/life/${id}"><b class="num">${d.lifeToday}</b><span>${lifeTodayLine(d.lifeToday)}</span></a>
      </div>
    </div>
    ${why('route')}
    ${d.planConfirmed ? '' : `<section class="banner amber"><p style="margin:0">${t(d.support.rehab ? 'planWait' : 'planWaitSolo')}</p></section>`}
    ${alertBanners(d, 'patient')}
    ${holdBanner(d)}
    ${patientAsks(d)}
    ${checkinPanel(d)}
    ${allDone ? `<section class="peak"><h2>${t('peakTitle')}</h2><ul>${doneTitles.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="muted" style="margin-top:10px">${t('peakTomorrow', { d: d.day + 1 })}</p>${why('peakEnd')}</section>` : ''}
    <div class="cols">
      <div>
        <div class="sec"><h2>${t('threeTitle')}</h2></div>
        ${why('hick')}
        ${tasks.main.map((x, i) => taskCard(x, d, { first: { when: i === 0, grad: x === firstAbility } })).join('')}
        ${tasks.secondary.length ? `<div class="sec"><h3>${t('alsoCan')}</h3></div><div class="rows">${tasks.secondary.map((x) => taskCard(x, d, { main: false })).join('')}</div>` : ''}
      </div>
      <aside>
        ${agentPanel(d)}
        ${whoPanel(d)}
        <section class="panel"><h3>${t('milesTitle')}</h3>
          ${d.milestones.slice(0, 3).map((m) => `<div class="mile"><b>${E(m.name)}</b><span class="pips">${Array.from({ length: m.need }, (_, i) => `<i class="${i < m.streak ? 'on' : ''}"></i>`).join('')}</span><span class="s">${esc(LV(m.level))} → ${esc(LV(m.to))}${C()}${m.left === 0 || m.pending ? t('mileReady') : t('mileLeft', { n: m.left })}</span></div>`).join('') || `<p class="empty">-</p>`}
          ${why('gradient')}
        </section>
        <section class="panel"><h3>${t('abilTitle')}</h3>${abilityList(d, 'patient')}${why('mastery')}</section>
      </aside>
    </div>
  </div></div>`;
}

// ---------- family ----------
// Family and rehab views ask first whether the patient has let that layer in, so a closed door is a page, not an error.
async function layerOpen(id, layer) {
  const d = await read(`/patients/${encodeURIComponent(id)}?role=patient`);
  return d.support?.[layer];
}

async function viewFamily(id) {
  if (!(await layerOpen(id, 'family'))) return viewNotJoined('f', id);
  await loadPatient(id, 'family');
  const d = S.data;
  header('f');
  demobar(true);
  const all = [...d.tasks.main, ...d.tasks.secondary];
  const help = all.filter((x) => x.kind === 'ability' || x.kind === 'safe');
  const others = all.filter((x) => x.kind === 'training' || x.kind === 'social');
  const letGo = [
    ...all.filter((x) => x.noDo).map((x) => `<li><b>${E(x.name)}</b>${C()}${E(x.noDo)}</li>`),
    ...d.abilities.filter((a) => a.active && a.level === 4).map((a) => `<li>${t('letGoDone', { name: E(a.name) })}</li>`),
  ];
  const own = [
    ...d.history.filter((h) => h.to_level > h.from_level).map((h) => ({ day: h.day, html: `<b>${E(h.name)}</b>${C()}${esc(LV(h.from_level, 'family'))} → ${esc(LV(h.to_level, 'family'))}` })),
    ...d.notes.filter((n) => n.role === 'patient').map((n) => ({ day: n.day, html: E(n.text) })),
  ].sort((a, b) => b.day - a.day).slice(0, 5);
  const ck = d.checkin;
  document.getElementById('app').innerHTML = `<div class="page"><div class="wrap">
    <div class="head">
      <div>${headMeta(d)}<h1>${d.familyLess ? t('fH1', { n: d.familyLess }) : t('fH1None')}</h1><p class="sub">${t('fSub')}</p>${why('dependency')}</div>
      <div class="head-stats"><div class="stat daystat"><span class="shield num" aria-hidden="true">${d.day}</span><div><b class="num">${t('day', { d: d.day })}</b><span>${t('of90')}</span></div></div>${meter(d.autonomy)}</div>
    </div>
    ${alertBanners(d, 'family')}
    ${holdBanner(d)}
    ${familyAsks(d)}
    <div class="cols">
      <div>
        <div class="sec"><h2>${t('fHelp')}</h2></div>
        ${help.map((x, i) => familyTask(x, d, i === 0)).join('')}
        <div class="rows">${others.map((x) => `<div class="rowi"><div class="t">${E(x.name)}</div><div class="d">${E(x.family)}</div></div>`).join('')}</div>
      </div>
      <aside>
        <div class="sec"><h2>${t('fLetGo')}</h2></div>
        <section class="panel"><ul class="letgo">${letGo.join('')}</ul>${why('contrast')}</section>
        <section class="panel"><h3>${t('fOwn')}</h3>${own.length ? own.map((o) => `<div class="own"><div class="who">${t('day', { d: o.day })}</div>${o.html}</div>`).join('') : `<p class="empty">${t('fOwnNone')}</p>`}</section>
        <section class="panel"><h3>${t('ptToday')}</h3>
          ${ck ? `<p style="margin:0">${t('pain')}${C()}<b class="num">${ck.pain ?? '-'}</b>/10　${t('mood')}${C()}<b>${moodWord(ck.mood)}</b></p>${ck.note ? `<p class="small" style="margin:8px 0 0">"${esc(ck.note)}"</p>` : ck.private ? `<p class="small muted">${t('privateHidden')}</p>` : ''}` : `<p class="empty">${t('noCheckin')}</p>`}
        </section>
        <section class="panel"><h3>${t('fRed')}</h3><ul class="letgo">${S.meta.signals.map((s) => `<li><b>${E(s.label)}</b>${C()}${E(s.action)}</li>`).join('')}</ul><p class="sos">${t('sos')}</p></section>
      </aside>
    </div>
    <div class="cols even" style="margin-top:12px">
      <section class="panel"><h3>${t('notesTitle')}</h3>
        <textarea id="fam-note" placeholder="${t('notePh')}"></textarea>
        <div style="margin-top:10px"><button class="btn sm" data-act="note" data-role="family" data-src="fam-note">${t('saveNote')}</button></div>
        <div class="feed" style="margin-top:12px">${d.notes.filter((n) => n.role === 'family').slice(0, 4).map(noteItem).join('')}</div>
      </section>
      <div>
        <section class="care"><h3>${t('careTitle')}</h3><p style="margin:0">${t('careBody')}</p>${why('caregiver')}</section>
        <section class="panel"><h3>${t('todos')}</h3><div class="checks">${d.todos.map((x) => `<label><input type="checkbox" data-act="todo" data-tid="${x.todo_id}"${x.done ? ' checked' : ''}> ${E(x.text)}</label>`).join('')}</div></section>
      </div>
    </div>
  </div></div>`;
}

function familyTask(x, d, first) {
  if (x.kind === 'safe') return `<article class="task safe"><h3>${E(x.name)}</h3><p class="do">${E(x.family)}</p></article>`;
  const log = d.logs[x.id] || {};
  const tip = S.ui.tip?.[x.id];
  return `<article class="task ${x.track}">
    <div class="kind">${E(x.name)}${log.plan_when ? `<span class="chip plan">${tt(T.slots[log.plan_when])}</span>` : ''}</div>
    <h3><span class="small muted" style="display:block;font-weight:500">${t('yourRole')}</span>${E(x.familyRole)}</h3>
    <p class="do">${E(x.family)}</p>
    ${first ? why('roleOne') : ''}
    <p class="small"><b>${t('dontDo')}</b>${E(x.noDo)}</p>
    <div class="small muted" style="margin:12px 0 8px">${t('howMuch')}</div>
    <div class="choice">${tt(T.helpLabels).map((w, i) => `<button aria-pressed="${log.help === i + 1}" data-act="help" data-task="${x.id}" data-help="${i + 1}">${w}</button>`).join('')}</div>
    ${first ? why('monitor') : ''}
    ${tip ? `<div class="after">${E(tip)}</div>` : ''}
    <div class="fam">${t('navPatient')}${C()}${E(x.patient)}${log.status ? ` <span class="chip">${t({ done: 'stDone', partial: 'stPartial', cant: 'stCant' }[log.status])}</span>` : ''}</div>
  </article>`;
}

const noteItem = (n) => `<div class="it"><div class="who">${t('day', { d: n.day })}　${tt(T.by[n.role] || T.by.system)}</div>${E(n.text)}</div>`;

// V0.3: family and rehab see a patient only after the patient lets them in.
async function viewNotJoined(view, id) {
  S.data = null;
  let name = '';
  try { const d = await read(`/patients/${encodeURIComponent(id)}?role=patient`); name = pname(d); S.data = d; } catch (e) { if (e === STALE) throw e; }
  header(view);
  demobar(false);
  const fam = view === 'f';
  document.getElementById('app').innerHTML = `<div class="page"><div class="wrap">
    <section class="not-joined">
      <div class="nj-ico" aria-hidden="true">${icon(fam ? 'f' : 'r')}</div>
      <h1>${t(fam ? 'notJoinedFamilyH' : 'notJoinedRehabH', { name: esc(name) })}</h1>
      <p>${t(fam ? 'notJoinedFamilyP' : 'notJoinedRehabP')}</p>
      <div class="actions"><a class="btn" href="#/p/${esc(id)}">${t('goInvite')}</a></div>
      ${why('layers')}
    </section>
  </div></div>`;
}

// ---------- rehab ----------
async function viewRehabList() {
  header('r');
  demobar(false);
  const list = (await read('/patients')).sort((a, b) => b.openAlerts - a.openAlerts || b.pending - a.pending);
  const sum = (k) => list.reduce((n, p) => n + (k === 'pending' ? p.pending + (p.planPending ? 1 : 0) : p[k]), 0);
  document.getElementById('app').innerHTML = `<div class="page"><div class="wrap">
    <div class="head"><div><h1>${t('rTitle')}</h1><p class="sub">${t('rSub')}</p></div>
      <div class="head-stats"><div class="stat red"><b class="num">${sum('openAlerts')}</b><span>${t('rUrgent')}</span></div><div class="stat amber"><b class="num">${sum('pending')}</b><span>${t('rPending')}</span></div><div class="stat"><b class="num">${sum('overHelp')}</b><span>${t('rOver')}</span></div></div></div>
    ${why('exception')}
    <p class="small muted">${t('rListNote')}</p>
    <section class="panel"><table class="list"><thead><tr><th>${t('colPatient')}</th><th>${t('colDay')}</th><th>${t('colAuto')}</th><th>${t('rUrgent')}</th><th>${t('rPending')}</th><th>${t('rOver')}</th><th></th></tr></thead>
    <tbody>${list.map((p) => `<tr><td><b>${esc((S.lang === 'en' && p.nameEn) || p.name)}</b></td><td>${t('day', { d: p.day })}<div class="small muted">${E(p.phase.name)}</div></td><td class="num">${p.autonomy}%</td>
      <td>${p.openAlerts ? `<span class="chip red">${p.openAlerts}</span>` : '0'}</td><td>${p.pending + (p.planPending ? 1 : 0) ? `<span class="chip amber">${p.pending + (p.planPending ? 1 : 0)}</span>` : '0'}</td><td>${p.overHelp}</td>
      <td><a class="btn sm ghost" href="#/r/${p.id}" data-act="pick" data-id="${p.id}">${t('open')}</a></td></tr>`).join('')}</tbody></table></section>
  </div></div>`;
}

// What the patient recorded today, listed as answers. Nothing here is interpreted.
function bodyToday(d) {
  const b = d.checkin?.body;
  const M = S.meta.body;
  const names = (k) => (b?.[k] || []).map((x) => M[k].find((o) => o.id === x)).filter(Boolean).map(opt);
  const rows = b ? [['bPhantom', names('phantom')], ['bSensation', names('sensation')], ['bLimb', names('limb')], ['bWound', b.woundAnswered && !b.woundChecks.length ? [t('bWoundNone')] : names('woundChecks')]].filter(([, v]) => v.length) : [];
  const photo = d.checkin?.photo;
  const last = d.lastPhoto;
  if (!rows.length && !photo && !last) return '';
  return `<section class="panel"><h3>${t('bodyTitle')}</h3>
    ${rows.map(([k, v]) => `<p class="small" style="margin:0 0 6px"><b>${t(k)}</b>${C()}${v.join(SEMI())}</p>`).join('')}
    ${photo || last ? `<div class="photo-pair sm">${last ? `<figure><img src="${last.photo}" alt=""><figcaption>${t('day', { d: last.day })}</figcaption></figure>` : ''}${photo ? `<figure><img src="${photo}" alt=""><figcaption>${t('day', { d: d.day })}</figcaption></figure>` : ''}</div><p class="small muted">${t('bPhotoNote')}</p>` : ''}
  </section>`;
}

function spark(points, key, max, color) {
  const w = 260, h = 54;
  if (points.length < 2) return '';
  const xs = (i) => 6 + (i * (w - 12)) / (points.length - 1);
  const ys = (v) => h - 6 - ((v ?? 0) / max) * (h - 12);
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" points="${points.map((p, i) => `${xs(i)},${ys(p[key])}`).join(' ')}"/>${points.map((p, i) => `<circle cx="${xs(i)}" cy="${ys(p[key])}" r="3" fill="${color}"/>`).join('')}</svg>`;
}

async function viewRehab(id) {
  if (!(await layerOpen(id, 'rehab'))) return viewNotJoined('r', id);
  await loadPatient(id, 'rehab');
  const d = S.data;
  header('r');
  demobar(true);
  const openAlerts = d.alerts.filter((a) => a.status === 'open').sort((a, b) => (b.level === 'emergency') - (a.level === 'emergency'));
  const rehabPending = d.pending.filter((p) => p.needs === 'rehab' || p.status === 'held').sort((a, b) => (b.status === 'held') - (a.status === 'held'));
  const overHelp = d.abilities.reduce((n, a) => n + a.week.filter((w) => w.help && w.level && w.help < w.level).length, 0);
  const days = Array.from({ length: 7 }, (_, i) => d.day - 6 + i).filter((x) => x >= 1);
  const todo = [
    ...openAlerts.map((a) => `<div class="banner ${a.level === 'emergency' ? 'emergency' : 'red'}"><h3>${a.signals.map((s) => E(S.meta.signals.find((x) => x.id === s)?.label)).join(SEMI())}</h3>
      <pre class="summary">${E(a.summary)}</pre>
      <label class="f" style="margin-top:12px"><span class="sr">${t('replyPh')}</span><textarea id="reply-${a.id}" placeholder="${t('replyPh')}"></textarea></label>
      <div class="row"><button class="btn" data-act="resolve" data-aid="${a.id}">${t('resolve')}</button></div></div>`),
    ...(d.planConfirmed ? [] : [`<div class="banner sun"><h3>${t('rPlanTitle')}</h3><p class="small">${t('rPlanBody')}</p><div class="row"><button class="btn sun" data-act="confirm-plan">${t('rPlanBtn')}</button></div></div>`]),
    ...rehabPending.map((p) => `<div class="banner ${p.status === 'held' ? 'amber' : 'calm'}">
      <h3>${t('pendUp', { name: E(p.name), from: esc(LV(p.from_level)), to: esc(LV(p.to_level)) })}</h3>
      <p class="small">${E(p.reason)}${p.status === 'held' ? `<br><b>${t('heldBy', { why: E(p.note) })}</b>` : ''}${p.family_ok === 0 && p.family_note ? `<br>${t('rDisPending', { note: esc(p.family_note) })}` : ''}</p>
      ${p.to_level > p.from_level ? upSteps(p) : ''}
      ${p.status === 'held' ? why('explain') : ''}
      <textarea id="pn-${p.id}" placeholder="${t('advicePh')}" style="min-height:56px;margin-top:12px"></textarea>
      <div class="row"><button class="btn" data-act="decide" data-pid="${p.id}" data-decision="approve" data-role="rehab"${p.patient_ok === 1 ? '' : ' disabled'}>${p.to_level < p.from_level ? t('approveDown') : t('approve')}</button><button class="btn ghost" data-act="decide" data-pid="${p.id}" data-decision="decline" data-role="rehab">${t('decline')}</button>${p.patient_ok === 1 ? '' : `<span class="small muted">${t('rNeedPatient')}</span>`}</div>
      ${p.to_level > p.from_level ? why('upflow') : ''}</div>`),
  ];
  const helpWord = (h) => tt(T.helpLabels)[h - 1];
  const disItem = (x) => `<div class="it"><span><b>${E(x.name)}</b>${C()}${x.kind === 'overhelp' ? t('rDisOver', { plan: esc(LV(x.plan, 'family')), help: esc(helpWord(x.help)) }) : x.kind === 'mismatch' ? t('rDisMismatch', { help: esc(helpWord(x.help)) }) : t('rDisPending', { note: esc(x.note || '-') })}</span><span class="s">${t('day', { d: x.day })}</span></div>`;
  document.getElementById('app').innerHTML = `<div class="page"><div class="wrap">
    <div class="head">
      <div>${headMeta(d)}<h1>${t('rTitle')}</h1><p class="sub">${t('rSub')}</p></div>
      <div class="head-stats"><div class="stat red"><b class="num">${openAlerts.length}</b><span>${t('rUrgent')}</span></div><div class="stat amber"><b class="num">${rehabPending.length + (d.planConfirmed ? 0 : 1)}</b><span>${t('rPending')}</span></div><div class="stat"><b class="num">${d.stalled.length}</b><span>${t('rStalled')}</span></div><div class="stat"><b class="num">${overHelp}</b><span>${t('rOver')}</span></div></div>
    </div>
    ${why('exception')}
    <div class="cols">
      <div>
        <div class="sec"><h2>${t('todo')}</h2></div>
        ${todo.length ? todo.join('') : `<div class="allclear">${gapGlyph(3, { w: 110, labels: false })}${t('allClear')}</div>`}
        <div class="cols even" style="margin-top:8px">
          <section class="panel"><h3>${t('rStalled')}</h3><div class="desk-list">${d.stalled.map((x) => `<div class="it"><b>${E(x.name)}</b><span class="s">${t('rStalledItem', { lv: esc(LV(x.level, 'formal')), n: x.days })}</span></div>`).join('') || `<p class="empty">${t('rNone')}</p>`}</div>${why('stall')}</section>
          <section class="panel"><h3>${t('rDisagree')}</h3><div class="desk-list">${d.disagreements.map(disItem).join('') || `<p class="empty">${t('rNone')}</p>`}</div></section>
        </div>
        <div class="sec"><h2>${t('abTitle')}</h2>
          <div class="legend"><span><i class="dots"><i class="done"></i></i>${t('lgDone')}</span><span><i class="dots"><i class="partial"></i></i>${t('lgPartial')}</span><span><i class="dots"><i class="cant"></i></i>${t('lgCant')}</span><span><i class="dots"><i class="over"></i></i>${t('lgOver')}</span></div></div>
        <section class="panel"><table class="list abl"><tbody>
          ${d.abilities.filter((a) => a.active).map((a) => `<tr>
            <td style="width:36%"><b>${E(a.name)}</b>${a.paused ? ` <span class="chip red">${t('pausedChip')}</span>` : ''}${a.goal ? ` <span class="chip goal">${t('goalBadgeOther')}</span>` : ''}<div style="margin-top:10px">${track(a.level, { labels: false })}</div><div class="small muted" style="margin-top:6px">${esc(LV(a.level, 'formal'))}</div></td>
            <td><div class="dots">${days.map((dd) => { const w = a.week.find((x) => x.day === dd); return `<i class="${w?.status || ''}${w && w.help && w.level && w.help < w.level ? ' over' : ''}" title="${t('day', { d: dd })}"></i>`; }).join('')}</div></td>
            <td><div class="ab-actions">
              <button class="btn sm ghost" data-act="adjust" data-ab="${a.id}" data-action="up"${a.level >= 4 ? ' disabled' : ''}>${t('actUp')}</button>
              <button class="btn sm ghost" data-act="adjust" data-ab="${a.id}" data-action="down"${a.level <= 1 ? ' disabled' : ''}>${t('actDown')}</button>
              <button class="btn sm ghost" data-act="adjust" data-ab="${a.id}" data-action="smaller">${t('actSmaller')}</button>
              <button class="btn sm ghost" data-act="adjust" data-ab="${a.id}" data-action="${a.paused ? 'resume' : 'pause'}">${t(a.paused ? 'actResume' : 'actPause')}</button>
            </div></td></tr>`).join('')}
        </tbody></table>${why('preattentive')}</section>
        <section class="panel"><h3>${t('adviceTitle')}</h3><textarea id="rehab-note" placeholder="${t('advicePh')}"></textarea>
          <div style="margin-top:10px"><button class="btn sm" data-act="note" data-role="rehab" data-src="rehab-note">${t('saveNote')}</button></div></section>
      </div>
      <aside>
        <section class="panel"><h3>${t('trendTitle')}</h3>
          <div class="small muted">${t('pain')}</div>${spark(d.checkins, 'pain', 10, 'oklch(52% 0.18 27)')}
          <div class="small muted" style="margin-top:10px">${t('mood')}</div>${spark(d.checkins, 'mood', 5, 'oklch(54% 0.13 256)')}
        </section>
        ${bodyToday(d)}
        <section class="panel"><h3>${t('feedTitle')}</h3><div class="feed">${d.notes.slice(0, 6).map(noteItem).join('')}</div></section>
        <section class="panel"><h3>${t('histTitle')}</h3><div class="feed">${d.history.map((h) => `<div class="it"><div class="who">${t('day', { d: h.day })}　${tt(T.by[h.by_role] || T.by.system)}</div><b>${E(h.name)}</b>${C()}${esc(LV(h.from_level))} → ${esc(LV(h.to_level))}<div class="small muted">${E(h.reason)}</div></div>`).join('') || `<p class="empty">-</p>`}</div></section>
        <section class="panel"><h3>${t('ordersTitle')}</h3><div class="feed">${(d.profile.orders || []).map((o) => `<div class="it"><div class="who">${tt(T.fieldNames[o.key] || [o.key, o.key])}</div>${esc(S.lang === 'en' && o.valueEn ? o.valueEn : o.value)}</div>`).join('')}</div></section>
      </aside>
    </div>
  </div></div>`;
}

// ---------- 90-day map + reviews ----------
async function viewMap(id) {
  await loadPatient(id, 'patient');
  const d = S.data;
  header('map');
  demobar(true);
  const map = await read(`/patients/${id}/map`);
  const abs = S.meta.abilities;
  const cw = 10, ch = 20, left = 160, top = 40, gap = 2;
  const W = left + map.days.length * cw + 24, H = top + abs.length * ch + 44;
  const color = { 1: 'var(--lv1)', 2: 'var(--lv2)', 3: 'var(--lv3)', 4: 'var(--lv4)' };
  const phaseOfDay = (dd) => S.meta.phases.find((p) => dd >= p.from && dd <= p.to)?.id || 4;
  let cells = '';
  map.days.forEach((day, i) => {
    abs.forEach((a, r) => {
      const x = left + i * cw, y = top + r * ch;
      const v = day.levels?.[a.id];
      if (v && day.paused?.includes(a.id)) cells += `<rect x="${x}" y="${y}" width="${cw - gap}" height="${ch - gap}" rx="2" fill="var(--red)"><title>${esc(tr(a.name))}　${t('day', { d: day.day })}　${t('redFlags')}</title></rect>`;
      else if (v) cells += `<rect x="${x}" y="${y}" width="${cw - gap}" height="${ch - gap}" rx="2" fill="${color[v]}"><title>${esc(tr(a.name))}　${t('day', { d: day.day })}　${esc(LV(v))}</title></rect>`;
      else if (!day.levels && a.phase <= phaseOfDay(day.day)) cells += `<rect x="${x + 0.5}" y="${y + 0.5}" width="${cw - gap - 1}" height="${ch - gap - 1}" rx="2" fill="none" stroke="var(--line)"/>`;
    });
    if (day.alert) cells += `<circle cx="${left + i * cw + (cw - gap) / 2}" cy="${top + abs.length * ch + 8}" r="3" fill="var(--red)"><title>${t('day', { d: day.day })}</title></circle>`;
  });
  const phases = map.phases.map((p) => `<line x1="${left + (p.from - 1) * cw - 1}" x2="${left + (p.from - 1) * cw - 1}" y1="${top - 24}" y2="${top + abs.length * ch}" stroke="var(--line-2)"/><text class="ph" x="${left + (p.from - 1) * cw + 4}" y="${top - 12}">${esc(tr(p.name))}</text>`).join('');
  const labels = abs.map((a, r) => `<text x="0" y="${top + r * ch + 13}">${esc(tr(a.name))}</text>`).join('');
  const todayX = left + (map.current - 1) * cw;
  const today = `<rect x="${todayX - 2}" y="${top - 4}" width="${cw + 2}" height="${abs.length * ch + 6}" fill="none" stroke="var(--ink)" stroke-width="2" rx="3"/><text x="${todayX - 4}" y="${top + abs.length * ch + 28}" style="fill:var(--ink);font-weight:600">${t('day', { d: map.current })}</text>`;
  const count = (lv, dd) => Object.values(dd.levels || {}).filter((x) => x === lv).length;
  const d1 = map.days[0], dn = map.days[map.current - 1];

  document.getElementById('app').innerHTML = `<div class="page"><div class="wrap">
    <div class="head">
      <div>${headMeta(d)}<h1>${t('mapTitle')}</h1><p class="sub">${t('mapSub')}</p></div>
      <div class="head-stats">
        <div class="stat"><b class="num">${t('things', { n: count(1, d1) })}</b><span>${t('famDay1')}</span></div>
        <div class="stat"><b class="num">${t('things', { n: count(1, dn) })}</b><span>${t('famNow')}</span></div>
        <div class="stat"><b class="num">${t('things', { n: count(4, dn) })}</b><span>${t('selfNow')}</span></div>
        ${meter(d.autonomy)}
      </div>
    </div>
    <section class="panel">
      <div class="map"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${t('mapTitle')}">${phases}${labels}${cells}${today}</svg></div>
      <div class="legend" style="margin-top:10px">${[1, 2, 3, 4].map((i) => `<span><svg width="12" height="12"><rect width="12" height="12" rx="2" fill="${color[i]}"/></svg>${esc(LV(i))}</span>`).join('')}<span><svg width="12" height="12"><rect width="12" height="12" rx="2" fill="var(--red)"/></svg>${t('redFlags')}</span></div>
      ${why('mapWhy')}
    </section>
    <div class="sec"><h2>${t('rvTitle')}</h2></div>
    <section class="panel" id="review"></section>
  </div></div>`;
  S.ui.review = S.ui.review && S.ui.reviewPid === id ? S.ui.review : { type: 'w', index: Math.ceil(d.day / 7) };
  S.ui.reviewPid = id;
  await renderReview(id);
}

async function renderReview(id) {
  const d = S.data;
  const { type, index } = S.ui.review;
  const rv = await read(`/patients/${id}/review?type=${type}&index=${index}`);
  const weeks = Math.ceil(d.day / 7), months = Math.ceil(d.day / 30);
  const tab = (ty, n) => `<button aria-pressed="${type === ty && index === n}" data-act="review" data-type="${ty}" data-index="${n}">${t(ty === 'w' ? 'week' : 'month', { n })}</button>`;
  const list = (arr, fn) => (arr.length ? `<ul>${arr.map(fn).join('')}</ul>` : `<p class="empty">${t('rvNone')}</p>`);
  document.getElementById('review').innerHTML = `
    <div class="tabs">${Array.from({ length: weeks }, (_, i) => tab('w', i + 1)).join('')}${Array.from({ length: months }, (_, i) => tab('m', i + 1)).join('')}</div>
    <p style="margin-bottom:4px"><b>${t('day', { d: rv.from })} – ${t('day', { d: rv.to })}</b>　${t('rvAuto', { a: rv.autonomyStart ?? '-', b: rv.autonomyEnd })}</p>
    <p class="small muted">${t('rvStats', { d: rv.counts.done, p: rv.counts.partial, c: rv.counts.cant, a: rv.alerts, o: rv.overHelp })}</p>
    <div class="review-grid" style="margin-top:20px">
      <div><h3>${t('rvGained')}</h3>${list(rv.gained, (h) => `<li><b>${E(h.name)}</b>${C()}${esc(LV(h.from_level))} → ${esc(LV(h.to_level))}</li>`)}</div>
      <div><h3>${t('rvIndependent')}</h3>${list(rv.independent, (a) => `<li>${E(a.name)}</li>`)}</div>
      <div><h3>${t('rvNeedHelp')}</h3>${list(rv.needHelp, (a) => `<li>${E(a.name)} ${chip(a.level)}</li>`)}</div>
      <div><h3>${t('rvNext')}</h3>${list(rv.next, (a) => `<li><b>${E(a.name)}</b>${C()}${E(a.patient)}</li>`)}</div>
    </div>
    ${why('reviewWhy')}
    <h3 style="margin:28px 0 12px">${t('rvVoices')}</h3>
    <div class="voices">${['patient', 'family', 'rehab'].map((r) => `<label class="f"><span>${tt(T.by[r])}</span><textarea id="rv-${r}" placeholder="${tt(T.rvPh[r])}">${esc(rv.notes[r] || '')}</textarea>
      <button class="btn sm ghost" style="margin-top:8px" data-act="save-review" data-role="${r}" data-period="${rv.period}">${t('rvSave')}</button></label>`).join('')}</div>
    ${why('related')}`;
}

// ---------- V0.3 body and wound record ----------
const opt = (o) => E(o.label);
function bodyForm(d) {
  const ck = d.checkin;
  const f = (S.ui.body ||= {
    pain: ck?.pain ?? d.baselinePain, mood: ck?.mood ?? 3, note: '', private: !!ck?.private,
    body: { painRising: false, painWhere: [], painImpact: null, phantom: [], sensation: [], limb: [], woundChecks: [], general: [], woundAnswered: false, hopeless: false, selfHarm: false, shareMood: false, help: null, hardest: '', wantBack: '', ...(ck?.body || {}) },
    photo: null, photoMsg: null,
  });
  const b = f.body;
  const M = S.meta.body;
  const multi = (key) => `<div class="choice wrap">${M[key].map((o) => `<button type="button" aria-pressed="${b[key].includes(o.id)}" data-act="b-multi" data-k="${key}" data-v="${o.id}">${opt(o)}</button>`).join('')}</div>`;
  const one = (key) => `<div class="choice wrap">${M[key].map((o) => `<button type="button" aria-pressed="${b[key] === o.id}" data-act="b-one" data-k="${key}" data-v="${o.id}">${opt(o)}</button>`).join('')}</div>`;
  const flag = (k, label, danger = false) => `<label class="flag${danger ? ' danger' : ''}"><input type="checkbox" data-b="${k}"${b[k] ? ' checked' : ''}> ${t(label)}</label>`;
  const last = d.lastPhoto;
  const photoNow = f.photo || ck?.photo;
  const woundNone = b.woundAnswered && !b.woundChecks.length;
  return `<div class="body-grid">
    <section class="panel bsec"><h2><span class="bnum num">1</span>${t('bPain')}</h2>
      <div class="painrow"><input type="range" min="0" max="10" value="${f.pain}" data-bf="pain" aria-label="${t('bPain')}"><span class="painval" id="b-painv">${f.pain}</span></div>
      <p class="small muted" style="margin:4px 0 12px">${t('painHint')}</p>
      ${flag('painRising', 'bPainRising')}
      <h4>${t('bPainWhere')}</h4>${multi('painWhere')}
      <h4>${t('bPainImpact')}</h4>${one('painImpact')}
    </section>
    <section class="panel bsec"><h2><span class="bnum num">2</span>${t('bPhantom')}</h2>${multi('phantom')}
      <h4>${t('bSensation')}</h4>${multi('sensation')}
      <h4>${t('bLimb')}</h4>${multi('limb')}
    </section>
    <section class="panel bsec wide wound-sec"><h2><span class="bnum num">3</span>${t('bWound')}</h2>
      <p class="small muted">${t('bWoundIntro')}</p>
      <div class="photo-pair">
        <figure>${last ? `<img src="${last.photo}" alt="${t('bPhotoYesterday', { d: last.day })}">` : `<div class="ph-empty">${t('bPhotoFirst')}</div>`}<figcaption>${last ? t('bPhotoYesterday', { d: last.day }) : '—'}</figcaption></figure>
        <figure>${photoNow ? `<img src="${photoNow}" alt="${t('bPhotoToday')}">` : `<label class="ph-empty ph-btn" for="b-photo">${icon('start')}<span>${t('bPhotoBtn')}</span></label>`}<figcaption>${t('bPhotoToday')}${photoNow ? ` · <label class="linkish" for="b-photo">${t('bPhotoBtn')}</label>` : ''}</figcaption></figure>
      </div>
      <input type="file" id="b-photo" class="sr" accept="image/*" capture="environment">
      ${f.photoMsg ? `<p class="photo-msg ${f.photoMsg.ok ? 'ok' : 'warn'}">${f.photoMsg.text}</p>` : ''}
      <p class="small muted">${t('bPhotoNote')}</p>
      ${why('photo')}
      <h4>${t('bWoundAsk')}</h4>
      <div class="choice wrap">${M.woundChecks.map((o) => `<button type="button" class="redq" aria-pressed="${b.woundChecks.includes(o.id)}" data-act="b-wound" data-v="${o.id}">${opt(o)}</button>`).join('')}<button type="button" aria-pressed="${woundNone}" data-act="b-wound" data-v="none">${t('bWoundNone')}</button></div>
    </section>
    <section class="panel bsec"><h2><span class="bnum num">4</span>${t('bGeneral')}</h2>
      <div class="choice wrap">${M.general.map((o) => `<button type="button" class="redq" aria-pressed="${b.general.includes(o.id)}" data-act="b-multi" data-k="general" data-v="${o.id}">${opt(o)}</button>`).join('')}</div>
      <p class="sos">${t('sos')}</p>
    </section>
    <section class="panel bsec"><h2><span class="bnum num">5</span>${t('bMood')}</h2>
      <div class="choice wrap">${tt(T.moods).map((w, i) => `<button type="button" aria-pressed="${f.mood === i + 1}" data-act="b-mood" data-v="${i + 1}">${w}</button>`).join('')}</div>
      <div class="flags">${flag('hopeless', 'bHopeless')}${flag('selfHarm', 'bSelfHarm', true)}${d.support.rehab ? flag('shareMood', 'bShare') : ''}</div>
    </section>
    <section class="panel bsec wide"><h2><span class="bnum num">6</span>${t('bLife')}</h2>
      <h4>${t('bHelp')}</h4>
      <div class="choice wrap">${M.helpUsed.map((o) => `<button type="button" aria-pressed="${b.help === o.id}" data-act="b-help" data-v="${o.id}">${opt(o)}</button>`).join('')}</div>
      <div class="grid2" style="margin-top:14px">
        <label class="f"><span>${t('bHardest')}</span><input type="text" data-bb="hardest" value="${esc(b.hardest || '')}"></label>
        <label class="f"><span>${t('bWantBack')}</span><input type="text" data-bb="wantBack" value="${esc(b.wantBack || '')}"></label>
      </div>
      <label class="f"><span>${t('bNote')}</span><input type="text" data-bf="note" value="${esc(f.note)}"></label>
      ${d.support.rehab ? `<div class="checks"><label><input type="checkbox" data-bf="private"${f.private ? ' checked' : ''}> ${t('private')}</label></div>` : ''}
    </section>
  </div>
  <div class="body-submit">
    <button class="btn sun" data-act="b-submit">${t('bSubmit')}</button>
    <a class="btn ghost" href="#/p/${S.pid}">${t('bBack')}</a>
    ${S.ui.bodyResult || ''}
  </div>`;
}

async function viewBody(id) {
  await loadPatient(id, 'patient');
  const d = S.data;
  header('p');
  demobar(true);
  document.getElementById('app').innerHTML = `<div class="page"><div class="wrap">
    <div class="head"><div>${headMeta(d)}<h1>${t('bodyTitle')}</h1><p class="sub">${t(d.checkin ? 'bDone' : 'bodySub')}</p></div>
      <div class="head-stats"><div class="stat daystat"><span class="shield num" aria-hidden="true">${d.day}</span><div><b class="num">${t('day', { d: d.day })}</b><span>${t('of90')}</span></div></div></div></div>
    ${alertBanners(d, 'patient')}
    ${bodyForm(d)}
  </div></div>`;
}

// Downscale to a small JPEG and check only what a camera can tell: is it bright enough, and sharp enough.
async function preparePhoto(file) {
  const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(file); });
  const scale = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
  const lum = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0; i < lum.length; i++) { lum[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]; sum += lum[i]; }
  const mean = sum / lum.length;
  let lap = 0, lap2 = 0, n = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const v = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - width] - lum[i + width];
    lap += v; lap2 += v * v; n++;
  }
  const sharp = n ? lap2 / n - (lap / n) ** 2 : 0;
  const msg = mean < 45 ? 'bPhotoDark' : mean > 225 ? 'bPhotoBright' : sharp < 30 ? 'bPhotoBlur' : 'bPhotoOk';
  let q = 0.72, url = c.toDataURL('image/jpeg', q);
  while (url.length > 110_000 && q > 0.3) { q -= 0.1; url = c.toDataURL('image/jpeg', q); }
  return { url, ok: msg === 'bPhotoOk', key: msg };
}

// ---------- V0.3 life handed back ----------
async function viewLife(id) {
  await loadPatient(id, 'patient');
  const d = S.data;
  const l = await read(`/patients/${id}/life`);
  header('life');
  demobar(true);
  const max = Math.max(3, ...l.days.map((x) => x.done));
  const bars = l.days.map((x) => `<div class="lb${x.alert ? ' alert' : ''}${x.day === l.day ? ' today' : ''}" style="--h:${(x.done / max) * 100}%" title="${t('day', { d: x.day })}: ${x.done}"><i></i><span class="num">${x.day === 1 || x.day === l.day || x.day % 7 === 0 ? x.day : ''}</span></div>`).join('');
  const row = (a) => `<div class="lrow${a.active ? '' : ' inactive'}">
      <div class="lname"><b>${E(a.life)}</b>${a.active ? '' : `<span class="small muted">${t('startsPhase', { n: a.startsPhase })}</span>`}</div>
      ${a.active ? `<div class="lcols"><div><span class="small muted">${t('lifeDay1')}</span>${chip(a.start)}</div><span class="larrow${a.now > a.start ? ' up' : ''}" aria-hidden="true">→</span><div><span class="small muted">${t('lifeNow')}</span>${chip(a.now)}</div></div>
        <div class="lnext">${a.next ? `<span class="small muted">${t('lifeNext')}${C()}</span>${E(a.next)}` : ''}</div>` : ''}
    </div>`;
  document.getElementById('app').innerHTML = `<div class="page"><div class="wrap">
    <div class="head">
      <div>${headMeta(d)}<h1>${t('lifeTitle')}</h1><p class="sub">${t('lifeSub')}</p>
        ${l.customGoal ? `<div class="goalline">${pin(14)}<span>${t('lifeGoal')}${C()}${E(l.customGoal)}</span></div>` : ''}</div>
      <div class="head-stats">
        <div class="stat life-stat"><b class="num">${d.lifeToday}</b><span>${lifeTodayLine(d.lifeToday)}</span></div>
        <div class="stat"><b class="num">${l.autonomyStart}% → ${l.autonomyNow}%</b><span>${t('autonomy')}</span></div>
      </div>
    </div>
    ${why('endowed')}
    <section class="panel"><h3>${t('lifeDays')}</h3><div class="lbars" role="img" aria-label="${t('lifeDays')}">${bars}</div><p class="small muted" style="margin:10px 0 0">${t('lifeDaysNote')}</p></section>
    <div class="cols">
      <section class="panel"><h3>${t('abilTitle')}</h3><div class="lrows">${l.abilities.map(row).join('')}</div>${why('mastery')}</section>
      <aside><section class="panel"><h3>${t('lifeUps')}</h3>
        ${l.ups.length ? `<ol class="ups">${l.ups.map((u) => `<li><span class="shield num" aria-hidden="true">${u.day}</span><div><b>${E(u.life)}</b><div class="small">${esc(LV(u.from))} → ${esc(LV(u.to))}</div><div class="small muted">${t('day', { d: u.day })} · ${tt(T.lifeBy[u.by] || T.lifeBy.system)}</div></div></li>`).join('')}</ol>` : `<p class="empty">${t('lifeUpsNone')}</p>`}
      </section></aside>
    </div>
  </div></div>`;
}

// ---------- the story behind the film (fictional) ----------
function viewStory() {
  header('home');
  demobar(false);
  const beats = tt(T.storyBeats);
  document.getElementById('app').innerHTML = `
  <section class="xstory"><div class="wrap">
    <p class="kicker">${t('storyKicker')}</p>
    <h1>${t('storyH')}</h1>
    <p class="lead">${t('storyLead')}</p>
    <p class="story-goal">${pin(16)}<span>${t('storyGoal')}</span></p>
  </div></section>
  ${filmSection()}
  <section class="band"><div class="wrap">
    <ol class="beats">${beats.map(([d, txt], i) => `<li style="--i:${i}"><span class="beat-day">${esc(d)}</span><p>${esc(txt)}</p></li>`).join('')}</ol>
    <p class="story-not">${t('storyNot')}</p>
    <div class="actions"><a class="btn sun" href="#/p/demo" data-act="use-demo">${t('storyOpen')}</a><a class="btn ghost" href="#/">${t('navHome')}</a></div>
    <p class="small muted" style="margin-top:22px">${t('storySynthetic')}</p>
  </div></section>
  <footer class="foot"><div class="wrap">${t('foot')}</div></footer>`;
  wireFilm();
}

// The promo film slot. Drop the-next-step.mp4 (and optional .vtt subtitles and poster.jpg) into public/media/.
function filmSection() {
  return `<section class="xfilm" id="film"><div class="wrap xfilm-grid">
    <div class="xfilm-copy"><p class="kicker">${t('filmKicker')}</p><h2>${t('filmTitle')}<small>THE NEXT STEP</small></h2><p>${t('filmBody')}</p><p class="film-line">${t('filmLine')}</p></div>
    <div class="film-frame" data-film>
      <div class="film-ph"><span class="film-end"><b>ReStart90</b><span>把生活还给自己。</span><span>Take your life back.</span><small>人物及医疗数据均为合成内容　Synthetic character and medical data.</small></span><span class="film-soon small">${t('filmSoon')}</span></div>
    </div>
  </div></section>`;
}
function wireFilm() {
  const box = document.querySelector('[data-film]');
  if (!box) return;
  const film = S.meta.film || {};
  if (!film.video) return;
  const sub = (l) => `<track kind="subtitles" srclang="${l}" label="${l === 'zh' ? '中文' : 'English'}" src="/media/the-next-step.${l}.vtt"${S.lang === l ? ' default' : ''}>`;
  box.innerHTML = `<video controls playsinline preload="metadata"${film.poster ? ' poster="/media/poster.jpg"' : ''}><source src="/media/the-next-step.mp4" type="video/mp4">${(film.subs || []).map(sub).join('')}</video>`;
}

// ---------- Riri: one fixed way in from every patient page ----------
function ririDrawer() {
  let host = document.getElementById('riri');
  if (!host) { host = document.createElement('div'); host.id = 'riri'; document.body.appendChild(host); }
  const [, view] = (location.hash || '#/').split('/');
  if (!['p', 'body', 'life', 'map'].includes(view) || !S.data) { host.innerHTML = ''; return; }
  const open = S.ui.riri && view !== 'p';
  host.innerHTML = `<button class="riri-fab" data-act="${open ? 'riri-close' : 'riri-open'}" aria-expanded="${open}">${icon('riri')}<span>${t('rileyOpen')}</span></button>
    ${open ? `<div class="riri-drawer" role="dialog" aria-label="${t('agentName')}"><button class="riri-x" data-act="riri-close" aria-label="${t('close')}">×</button>${agentPanel(S.data)}</div>` : ''}`;
}

// ---------- upload wizard ----------
function viewStart() {
  header('start');
  demobar(false);
  const w = (S.wizard ||= { step: 1, text: '', pdf: null, fileName: '', result: null, confirm: {}, form: { pain: 3, confidence: 3, goals: [], home: { floor: 1 }, support: null } });
  // V0.3: step 3 asks who is with you; one person can start alone.
  const steps = ['wz1', 'wz2', 'wzWho', 'wz3', 'wz4', 'wz5'];
  const stepper = `<ol class="stepper" style="grid-template-columns:repeat(6,1fr)">${steps.map((k, i) => `<li class="${i + 1 === w.step ? 'on' : i + 1 < w.step ? 'done' : ''}">${i + 1}　${t(k)}</li>`).join('')}</ol>`;
  const body = [null, wizardUpload, wizardConfirm, wizardWho, wizardHome, wizardGoals][w.step](w);
  document.getElementById('app').innerHTML = `<div class="page"><div class="wrap"><div class="head"><div><h1>${t('wzTitle')}</h1><p class="sub">${t('wzSub')}</p></div></div>${stepper}${body}</div></div>`;
}

function wizardUpload(w) {
  const ai = S.meta.ai;
  return `<section class="panel">
    <p class="small ${ai.enabled ? '' : 'muted'}">${ai.enabled ? t('wzAiOn', { m: esc(ai.model) }) : t('wzAiOff')}</p>
    <p class="small" style="color:var(--amber)">${t('wzWarn')}</p>
    <label class="f"><span>${t('wzPaste')}</span><textarea id="wz-text" style="min-height:300px">${esc(w.text)}</textarea></label>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
      <button class="btn ghost" data-act="wz-sample">${t('wzSample')}</button>
      <label class="btn ghost" for="wz-file">${t('wzFile')}</label><input type="file" id="wz-file" class="sr" accept=".txt,.pdf,text/plain,application/pdf">
      ${w.fileName ? `<span class="small">${esc(w.fileName)}</span>` : ''}
      <span style="flex:1"></span>
      <button class="btn" data-act="wz-extract">${S.ui.extracting ? t('wzExtracting') : t('wzExtract')}</button>
    </div>
  </section>`;
}

function highlightDoc(text, fields, active) {
  const spans = fields.filter((f) => f.quote && text.includes(f.quote)).map((f) => ({ key: f.key, start: text.indexOf(f.quote), end: text.indexOf(f.quote) + f.quote.length })).sort((a, b) => a.start - b.start);
  let out = '', pos = 0;
  for (const s of spans) {
    if (s.start < pos) continue;
    out += esc(text.slice(pos, s.start)) + `<mark id="q-${s.key}" class="${active === s.key ? 'active' : ''}">${esc(text.slice(s.start, s.end))}</mark>`;
    pos = s.end;
  }
  return out + esc(text.slice(pos));
}

function wizardConfirm(w) {
  const r = w.result;
  const n = r.fields.filter((f) => w.confirm[f.key]).length;
  const modeKey = { ai: 'modeAi', pregenerated: 'modePregenerated', offline: 'modeOffline' }[r.mode];
  return `<p class="muted">${t('wzConfirmIntro')}</p>
    <p><span class="chip">${t(modeKey)}</span>　<b class="num">${t('confirmedN', { n })}</b></p>
    <div class="cols">
      <div><div class="doc" aria-label="source">${w.text ? highlightDoc(w.text, r.fields, S.ui.activeField) : esc(w.fileName)}</div>${why('source')}</div>
      <div>
        ${why('human')}
        ${r.fields.map((f) => `<div class="field${w.confirm[f.key] ? ' ok' : ''}">
          <div class="h"><b>${tt(T.fieldNames[f.key])}</b>${f.quote && f.quoteFound !== false ? `<button class="btn sm ghost" data-act="wz-focus" data-key="${f.key}">${t('showSource')}</button>` : ''}</div>
          <textarea data-wz-field="${f.key}" aria-label="${tt(T.fieldNames[f.key])}">${esc(f.value)}</textarea>
          ${f.quote && f.quoteFound === false ? `<div class="quote" style="color:var(--red)">${t('quoteMissing')}</div>` : ''}
          ${!f.value ? `<div class="quote">${t('notInDoc')}</div>` : ''}
          <div class="checks" style="margin-top:10px"><label><input type="checkbox" data-act="wz-confirm" data-key="${f.key}"${w.confirm[f.key] ? ' checked' : ''}> ${t('confirmIt')}</label></div>
        </div>`).join('')}
        <div style="display:flex;gap:10px;justify-content:space-between;margin-top:8px">
          <button class="btn ghost" data-act="wz-step" data-step="1">${t('back')}</button>
          <button class="btn" data-act="wz-step" data-step="3"${n < 5 ? ' disabled' : ''}>${t('next')}</button>
        </div>
      </div>
    </div>`;
}

function wizardWho(w) {
  const f = w.form;
  const modes = ['solo', 'family', 'rehab', 'both'];
  const card = (m) => { const [h, sub] = tt(T.supportModes[m]); return `<button type="button" class="mode-card${m === 'solo' ? ' solo' : ''}" aria-pressed="${f.support === m}" data-act="wz-support" data-v="${m}"><span class="mode-ico" aria-hidden="true">${icon(m === 'solo' ? 'riri' : m === 'family' ? 'f' : m === 'rehab' ? 'r' : 'p')}</span><b>${esc(h)}</b><span>${esc(sub)}</span></button>`; };
  const fam = f.support === 'family' || f.support === 'both';
  const reh = f.support === 'rehab' || f.support === 'both';
  return `<section class="panel">
    <label class="f"><span>${t('fName')}</span><input type="text" data-wz="name" value="${esc(f.name ?? w.result.name ?? '')}"></label>
    <h2 class="wz-q">${t('wzWhoQ')}</h2><p class="muted" style="margin-top:-6px">${t('wzWhoSub')}</p>
    <div class="mode-grid" role="group" aria-label="${t('wzWhoQ')}">${modes.map(card).join('')}</div>
    ${fam || reh ? `<div class="grid2" style="margin-top:16px">
      ${fam ? `<label class="f"><span>${t('fCaregiver')}</span><input type="text" data-wz="caregiver" value="${esc(f.caregiver || '')}"></label>` : ''}
      ${reh ? `<label class="f"><span>${t('fRehabName')}</span><input type="text" data-wz="rehabName" value="${esc(f.rehabName || '')}"></label>` : ''}
    </div>` : ''}
    ${why('layers')}
    <div style="display:flex;gap:10px;justify-content:space-between;margin-top:14px">
      <button class="btn ghost" data-act="wz-step" data-step="2">${t('back')}</button>
      <button class="btn" data-act="wz-step" data-step="4"${f.support ? '' : ' disabled'}>${t('next')}</button>
    </div>
  </section>`;
}

function wizardHome(w) {
  const f = w.form;
  return `<section class="panel">
    <div class="f"><span class="small">${t('fHome')}</span>
      <div class="grid2" style="margin-top:8px">
        <label class="f"><span>${t('hFloor')}</span><input type="number" min="1" max="60" data-wz-home="floor" value="${f.home.floor || 1}"></label>
        <div class="checks">${[['elevator', 'hElevator'], ['grabBar', 'hGrab'], ['showerChair', 'hShower'], ['threshold', 'hThreshold'], ['wheelchair', 'hWheel']].map(([k, l]) => `<label><input type="checkbox" data-wz-home="${k}"${f.home[k] ? ' checked' : ''}> ${t(l)}</label>`).join('')}</div>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:space-between;margin-top:8px">
      <button class="btn ghost" data-act="wz-step" data-step="3">${t('back')}</button>
      <button class="btn" data-act="wz-step" data-step="5">${t('next')}</button>
    </div>
  </section>`;
}

function wizardGoals(w) {
  const f = w.form;
  return `<section class="panel">
    <div class="grid2">
      <label class="f"><span>${t('fPain')}${C()}<b id="wz-painv" class="num">${f.pain}</b>/10</span><input type="range" min="0" max="10" value="${f.pain}" data-wz="pain"></label>
      <div class="f"><span class="small">${t('fConfidence')}</span><div class="choice" style="margin-top:6px">${tt(T.confWords).map((wd, i) => `<button aria-pressed="${f.confidence === i + 1}" data-act="wz-conf" data-v="${i + 1}">${wd}</button>`).join('')}</div></div>
    </div>
    <label class="f wz-goal" style="margin-top:14px"><span>${t('fCustom')}</span><input type="text" data-wz="customGoal" placeholder="${t('customPh')}" value="${esc(f.customGoal || '')}"></label>
    <label class="f"><span>${t('fWorry')}</span><input type="text" data-wz="worry" value="${esc(f.worry || '')}"></label>
    <div class="f" style="margin-top:6px"><span class="small">${t('fGoals')}</span><div class="choice" style="margin-top:8px">${S.meta.abilities.map((a) => `<button aria-pressed="${f.goals.includes(a.id)}" data-act="wz-goal" data-id="${a.id}">${E(a.life)}</button>`).join('')}</div></div>
    ${why('ownGoal')}
    <p class="banner calm" style="margin:16px 0 0">${t(f.support === 'rehab' || f.support === 'both' ? 'wzConfirmRehab' : 'wzConfirmSolo')}</p>
    <div style="display:flex;gap:10px;justify-content:space-between;margin-top:14px">
      <button class="btn ghost" data-act="wz-step" data-step="4">${t('back')}</button>
      <button class="btn sun" data-act="wz-create">${t('create')}</button>
    </div>
  </section>`;
}

// ---------- data + routing ----------
async function loadPatient(id, role) {
  S.pid = id;
  localStorage.setItem('rs90.pid', id);
  S.data = await read(`/patients/${encodeURIComponent(id)}?role=${role}`);
}

async function render() {
  await renderView();
  ririDrawer();
}

async function renderView() {
  const [, view, id] = (location.hash || '#/').split('/');
  document.documentElement.lang = S.lang === 'zh' ? 'zh-CN' : 'en';
  document.title = S.lang === 'zh' ? 'ReStart90｜把生活还给自己' : 'ReStart90 — Take your life back';
  document.body.classList.toggle('why-on', S.why);
  try {
    if (!view) return await viewLanding();
    if (view === 'start') return viewStart();
    if (view === 'why') return viewWhy();
    if (view === 'p') return await viewPatient(id || S.pid);
    if (view === 'f') return await viewFamily(id || S.pid);
    if (view === 'r') return id ? await viewRehab(id) : await viewRehabList();
    if (view === 'map') return await viewMap(id || S.pid);
    if (view === 'body') return await viewBody(id || S.pid);
    if (view === 'life') return await viewLife(id || S.pid);
    if (view === 'story') return viewStory();
    return await viewLanding();
  } catch (e) {
    if (e === STALE) return;
    if (e.status === 403 && (view === 'f' || view === 'r')) return viewNotJoined(view, id || S.pid);
    document.getElementById('app').innerHTML = `<div class="page"><div class="wrap"><p class="banner red">${esc(t('loadErr', { e: e.message }))}</p><a class="btn" href="#/p/demo">${t('heroDemo')}</a></div></div>`;
  }
}

const rerender = async () => {
  const y = window.scrollY;
  await render();
  window.scrollTo(0, y);
};

// Route changes get a view transition: the user sees where they came from and where they are.
function navigate() {
  S.ui.after = {}; S.ui.tip = {}; S.ui.ckResult = ''; S.ui.ckEdit = false; S.ui.agent = null;
  S.ui.riri = false; S.ui.invite = null; S.ui.body = null; S.ui.bodyResult = '';
  let ran = false;
  const go = () => {
    if (ran) return undefined;
    ran = true;
    return render().then(() => window.scrollTo(0, 0));
  };
  if (document.startViewTransition && document.visibilityState === 'visible' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const vt = document.startViewTransition(go);
    // A transition interrupted by another quick navigation is harmless; the new page still renders.
    [vt.ready, vt.finished, vt.updateCallbackDone].forEach((p) => p.catch(() => {}));
    // If the browser never gets a frame to start the transition (a throttled window), render without it.
    setTimeout(() => { if (!ran) { vt.skipTransition(); go(); } }, 400);
  } else go();
}

// ---------- actions ----------
function afterLogMessage(task, status, change) {
  if (status === 'cant') {
    const peer = S.meta.peers[(S.data.day + task.id.length) % S.meta.peers.length];
    const ab = task.kind === 'ability' ? S.meta.abilities.find((a) => a.id === task.ability) : null;
    return `${change?.type === 'down-suggested' ? `${t('msgDown')}<br>` : ''}${ab ? `${t('msgSmaller')}<b>${E(ab.smaller)}</b>` : ''}<blockquote class="peer">${E(peer.text)}<cite>${E(peer.who)}</cite></blockquote>${why('attribution')}`;
  }
  if (status === 'partial') return t('msgPartial');
  if (!change) return t('msgDone');
  if (change.type === 'up-suggested') return t('msgUpPatient');
  if (change.type === 'streak') return t('msgStreak', { s: change.streak });
  if (change.type === 'held') return t('msgHeld');
  return t('msgDone');
}

function showCheckinResult(r) {
  const parsed = r.parsed?.signals?.length ? `<br><span class="small">${t('parsedAs', { s: r.parsed.signals.map((s) => E(S.meta.signals.find((x) => x.id === s)?.label)).join(SEMI()) })}</span>` : '';
  if (r.result === 'ok') S.ui.ckResult = `<div class="banner calm" style="margin:14px 0 0">${t('ckOk')}${parsed}</div>`;
  else if (r.result === 'yellow') S.ui.ckResult = `<div class="banner amber" style="margin:14px 0 0">${t('ckYellow', { why: E(r.reason) })}${r.suggestPeople ? `<br>${t('ckPeople')}` : ''}</div>`;
  else S.ui.ckResult = `<div class="banner red" style="margin:14px 0 0">${t('ckRed')}${parsed}</div>`;
}

const actions = {
  lang: () => { S.lang = S.lang === 'zh' ? 'en' : 'zh'; localStorage.setItem('rs90.lang', S.lang); rerender(); },
  why: () => { S.why = !S.why; localStorage.setItem('rs90.why', S.why ? '1' : '0'); rerender(); },
  'use-demo': () => { S.pid = 'demo'; },
  'to-story': (el, ev) => { ev.preventDefault(); document.getElementById('story')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); },
  hl(el) {
    const box = el.closest('.hl');
    const n = Number(el.dataset.n);
    const next = handoverLine({ ability: box.dataset.ability, level: Number(box.dataset.level), selected: n, interactive: true, rehab: S.ui.hlRehab });
    box.outerHTML = next;
    document.querySelector(`.hl [data-act="hl"][data-n="${n}"]`)?.focus();
  },
  pick: (el) => { S.pid = el.dataset.id; },
  'invite-open': (el) => { S.ui.invite = el.dataset.layer; rerender().then(() => document.getElementById(`inv-${el.dataset.layer}`)?.focus()); },
  async support(el) {
    const { layer, action } = el.dataset;
    const name = document.getElementById(`inv-${layer}`)?.value;
    if (action === 'invite' && !name?.trim()) return document.getElementById(`inv-${layer}`)?.focus();
    await api(`/patients/${S.pid}/support`, { layer, action, name });
    S.ui.invite = null;
    toast(t('saved'));
    await rerender();
  },
  'riri-open': () => {
    const panel = document.getElementById('agent');
    if (panel && !panel.closest('.riri-drawer')) { panel.scrollIntoView({ block: 'center', behavior: 'smooth' }); panel.querySelector('button')?.focus({ preventScroll: true }); return; }
    S.ui.riri = true; ririDrawer();
  },
  'riri-close': () => { S.ui.riri = false; ririDrawer(); document.querySelector('.riri-fab')?.focus(); },
  async log(el) {
    const { task: taskId, status } = el.dataset;
    const r = await api(`/patients/${S.pid}/logs`, { taskId, status });
    const task = [...S.data.tasks.main, ...S.data.tasks.secondary].find((x) => x.id === taskId);
    (S.ui.after ||= {})[taskId] = afterLogMessage(task, status, r.change);
    (S.ui.afterGood ||= {})[taskId] = status === 'done';
    await rerender();
  },
  async plan(el) {
    await api(`/patients/${S.pid}/plan`, { taskId: el.dataset.task, when: el.dataset.when });
    await rerender();
  },
  async help(el) {
    const r = await api(`/patients/${S.pid}/help`, { taskId: el.dataset.task, help: Number(el.dataset.help) });
    (S.ui.tip ||= {})[el.dataset.task] = r.tip || null;
    if (!r.tip) toast(t('saved'));
    await rerender();
  },
  async decide(el) {
    const note = document.getElementById(`pn-${el.dataset.pid}`)?.value || document.getElementById(`fn-${el.dataset.pid}`)?.value || undefined;
    await api(`/patients/${S.pid}/pending/${el.dataset.pid}`, { decision: el.dataset.decision, role: el.dataset.role, note, home: el.dataset.home === '1' || undefined });
    toast(t('saved'));
    await rerender();
  },
  async adjust(el) {
    const note = document.getElementById('rehab-note')?.value || undefined;
    await api(`/patients/${S.pid}/abilities/${el.dataset.ab}`, { action: el.dataset.action, note });
    toast(t('saved'));
    await rerender();
  },
  async resolve(el) {
    const reply = document.getElementById(`reply-${el.dataset.aid}`);
    if (el.dataset.role === 'patient' && !reply.value.trim()) return reply.focus();
    await api(`/patients/${S.pid}/alerts/${el.dataset.aid}/resolve`, { reply: reply.value, role: el.dataset.role || 'rehab' });
    toast(t('saved'));
    await rerender();
  },
  async note(el) {
    const ta = document.getElementById(el.dataset.src);
    if (!ta.value.trim()) return ta.focus();
    await api(`/patients/${S.pid}/notes`, { role: el.dataset.role, text: ta.value });
    toast(t('saved'));
    await rerender();
  },
  async agent(el) {
    const intent = el.dataset.intent;
    S.ui.agent = { intent, text: S.ui.agent?.intent === intent ? S.ui.agent.text : '' };
    if (intent === 'today' || intent === 'cant') S.ui.agent.res = await api(`/patients/${S.pid}/agent`, { intent, taskId: el.dataset.task || undefined });
    await rerender();
  },
  async 'agent-send'() {
    const text = document.getElementById('ag-text').value;
    if (!text.trim()) return document.getElementById('ag-text').focus();
    const { intent } = S.ui.agent;
    S.ui.agent = { intent, text, res: await api(`/patients/${S.pid}/agent`, { intent, text }) };
    await rerender();
  },
  async 'agent-do'(el) {
    const a = S.ui.agent;
    const what = el.dataset.do;
    if (what === 'body') { S.ui.riri = false; location.hash = `#/body/${S.pid}`; return; }
    if (what === 'smaller') {
      await api(`/patients/${S.pid}/logs`, { taskId: el.dataset.task, status: 'cant' });
      a.done = t('saved');
    } else if (what === 'share') {
      await api(`/patients/${S.pid}/notes`, { role: 'patient', text: a.text, private: true });
      a.done = t('agShared');
    } else if (what === 'report') {
      const last = S.data.checkins.at(-1);
      const r = await api(`/patients/${S.pid}/checkin`, { pain: S.data.checkin?.pain ?? last?.pain ?? S.data.baselinePain, mood: S.data.checkin?.mood ?? 3, wound: 'normal', symptoms: a.res.signals || [], note: a.text });
      showCheckinResult(r);
      a.done = t('agReported');
    }
    await rerender();
  },
  async 'confirm-plan'() {
    await api(`/patients/${S.pid}/confirm-plan`, {});
    toast(t('saved'));
    await rerender();
  },
  async todo(el) { await api(`/patients/${S.pid}/todos/${el.dataset.tid}`, { done: el.checked }); },
  async copy(el) {
    await navigator.clipboard?.writeText(document.getElementById(el.dataset.target).textContent).catch(() => {});
    toast(t('copied'));
  },
  'b-multi': (el) => { const a = S.ui.body.body[el.dataset.k]; const i = a.indexOf(el.dataset.v); if (i >= 0) a.splice(i, 1); else a.push(el.dataset.v); rerender(); },
  'b-one': (el) => { const b = S.ui.body.body; b[el.dataset.k] = b[el.dataset.k] === el.dataset.v ? null : el.dataset.v; rerender(); },
  'b-wound': (el) => {
    const b = S.ui.body.body;
    b.woundAnswered = true;
    if (el.dataset.v === 'none') b.woundChecks = [];
    else { const i = b.woundChecks.indexOf(el.dataset.v); if (i >= 0) b.woundChecks.splice(i, 1); else b.woundChecks.push(el.dataset.v); }
    rerender();
  },
  'b-mood': (el) => { S.ui.body.mood = Number(el.dataset.v); rerender(); },
  'b-help': (el) => { S.ui.body.body.help = Number(el.dataset.v); rerender(); },
  async 'b-submit'() {
    const f = S.ui.body;
    if (!f.body.woundAnswered && !f.body.woundChecks.length) {
      toast(t('bNeedWound'), true);
      return document.querySelector('.wound-sec')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    const r = await api(`/patients/${S.pid}/checkin`, { pain: f.pain, mood: f.mood, note: f.note, private: f.private, body: f.body, photo: f.photo || undefined });
    const parsed = r.parsed?.signals?.length ? `<br><span class="small">${t('parsedAs', { s: r.parsed.signals.map((x) => E(S.meta.signals.find((y) => y.id === x)?.label)).join(SEMI()) })}</span>` : '';
    const photoLine = f.photo ? `<b>${t('bSavedPhoto')}</b><br>` : '';
    S.ui.bodyResult = r.result === 'ok' ? `<div class="banner calm">${photoLine}${t('ckOk')}${parsed}</div>`
      : r.result === 'yellow' ? `<div class="banner amber">${photoLine}${t('ckYellow', { why: E(r.reason) })}${r.suggestPeople ? `<br>${t('ckPeople')}` : ''}</div>`
      : `<div class="banner red">${photoLine}${t('ckRed')}${parsed}</div>`;
    S.ui.body = null;
    await rerender();
    if (r.result === 'red' || r.result === 'emergency') window.scrollTo({ top: 0, behavior: 'smooth' });
    else document.querySelector('.body-submit')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  },
  'ck-edit': () => { S.ui.ckEdit = true; S.ui.ck = null; S.ui.ckResult = ''; rerender(); },
  'ck-wound': (el) => { S.ui.ck.wound = el.dataset.v; rerender(); },
  'ck-mood': (el) => { S.ui.ck.mood = Number(el.dataset.v); rerender(); },
  async checkin() {
    const r = await api(`/patients/${S.pid}/checkin`, S.ui.ck);
    showCheckinResult(r);
    S.ui.ck = null;
    S.ui.ckEdit = false;
    await rerender();
    if (r.result === 'red' || r.result === 'emergency') window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  async advance() {
    await api(`/patients/${S.pid}/advance`, {});
    S.ui = { review: null };
    await rerender();
  },
  async 'inject-yellow'() {
    const r = await api(`/patients/${S.pid}/checkin`, { pain: Math.min(10, (S.data.checkins.at(-1)?.pain ?? S.data.baselinePain) + 3), mood: 2, wound: 'normal', note: '' });
    showCheckinResult(r);
    await rerender();
  },
  async 'inject-red'() {
    const r = await api(`/patients/${S.pid}/checkin`, { pain: 6, mood: 2, wound: 'leak', note: t('injNote') });
    showCheckinResult(r);
    await rerender();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  async reset() {
    if (!confirm(t('resetConfirm'))) return;
    await api('/demo/reset', {});
    S.pid = 'demo';
    S.ui = {};
    if (location.hash === '#/p/demo') await rerender();
    else location.hash = '#/p/demo';
  },
  review: (el) => { S.ui.review = { type: el.dataset.type, index: Number(el.dataset.index) }; renderReview(S.pid); },
  async 'save-review'(el) {
    await api(`/patients/${S.pid}/review`, { period: el.dataset.period, role: el.dataset.role, text: document.getElementById(`rv-${el.dataset.role}`).value });
    toast(t('saved'));
  },
  'wz-sample': () => { S.wizard.text = S.meta.sample[S.lang]; S.wizard.pdf = null; S.wizard.fileName = ''; viewStart(); },
  async 'wz-extract'() {
    const w = S.wizard;
    w.text = document.getElementById('wz-text').value;
    if (!w.text.trim() && !w.pdf) return document.getElementById('wz-text').focus();
    S.ui.extracting = true; viewStart();
    try {
      w.result = await api('/extract', { text: w.text || undefined, pdfBase64: w.pdf || undefined, lang: S.lang });
      w.confirm = {};
      w.form.name = w.result.name || '';
      w.step = 2;
    } finally { S.ui.extracting = false; viewStart(); }
  },
  'wz-focus': (el) => { S.ui.activeField = el.dataset.key; viewStart(); document.getElementById(`q-${el.dataset.key}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); },
  'wz-confirm': (el) => { S.wizard.confirm[el.dataset.key] = el.checked; viewStart(); },
  'wz-step': (el) => { S.wizard.step = Number(el.dataset.step); viewStart(); window.scrollTo(0, 0); },
  'wz-support': (el) => { S.wizard.form.support = el.dataset.v; viewStart(); },
  'wz-conf': (el) => { S.wizard.form.confidence = Number(el.dataset.v); viewStart(); },
  'wz-goal': (el) => {
    const g = S.wizard.form.goals;
    const i = g.indexOf(el.dataset.id);
    if (i >= 0) g.splice(i, 1); else if (g.length < 3) g.push(el.dataset.id);
    viewStart();
  },
  async 'wz-create'() {
    const w = S.wizard, r = w.result;
    const extraction = { ...r, name: w.form.name || r.name, fields: r.fields.map((f) => ({ ...f, confirmed: !!w.confirm[f.key] })) };
    const { id } = await api('/patients', { extraction, form: { ...w.form, nameEn: w.form.name } });
    S.wizard = null;
    toast(t('created'));
    location.hash = `#/p/${id}`;
  },
};

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'BUTTON') ev.preventDefault();
  try {
    if (el.tagName === 'BUTTON') el.disabled = true;
    await fn(el, ev);
  } catch (e) {
    if (e !== STALE) toast(e.message, true);
  } finally {
    if (el.isConnected && el.tagName === 'BUTTON') el.disabled = false;
  }
});

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.ck && S.ui.ck) {
    S.ui.ck[el.dataset.ck] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    if (el.dataset.ck === 'pain') document.getElementById('painv').textContent = el.value;
  }
  if (el.id === 'ag-text' && S.ui.agent) S.ui.agent.text = el.value;
  if (S.ui.body) {
    if (el.dataset.bf) {
      S.ui.body[el.dataset.bf] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
      if (el.dataset.bf === 'pain') document.getElementById('b-painv').textContent = el.value;
    }
    if (el.dataset.bb) S.ui.body.body[el.dataset.bb] = el.value;
    if (el.dataset.b) S.ui.body.body[el.dataset.b] = el.checked;
  }
  if (el.dataset.ckSym && S.ui.ck) {
    const s = new Set(S.ui.ck.symptoms);
    if (el.checked) s.add(el.dataset.ckSym); else s.delete(el.dataset.ckSym);
    S.ui.ck.symptoms = [...s];
  }
  if (S.wizard) {
    if (el.dataset.wz) {
      S.wizard.form[el.dataset.wz] = el.type === 'range' ? Number(el.value) : el.value;
      if (el.dataset.wz === 'pain') document.getElementById('wz-painv').textContent = el.value;
    }
    if (el.dataset.wzHome) S.wizard.form.home[el.dataset.wzHome] = el.type === 'checkbox' ? el.checked : Number(el.value);
    if (el.dataset.wzField) S.wizard.result.fields.find((x) => x.key === el.dataset.wzField).value = el.value;
    if (el.id === 'wz-text') S.wizard.text = el.value;
  }
});

document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.id === 'b-photo' && el.files[0] && S.ui.body) {
    try {
      const r = await preparePhoto(el.files[0]);
      S.ui.body.photo = r.url;
      S.ui.body.photoMsg = { ok: r.ok, text: t(r.key) };
    } catch { toast(t('bPhotoBlur'), true); }
    return rerender();
  }
  if (el.id !== 'wz-file' || !el.files[0]) return;
  const file = el.files[0];
  S.wizard.fileName = file.name;
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    S.wizard.pdf = btoa(bin);
    S.wizard.text = '';
  } else {
    S.wizard.text = await file.text();
    S.wizard.pdf = null;
  }
  viewStart();
});

window.addEventListener('hashchange', navigate);

(async function init() {
  try {
    S.meta = await api('/meta');
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="page"><div class="wrap"><p class="banner red">${esc(e.message)}</p></div></div>`;
    return;
  }
  render();
})();
