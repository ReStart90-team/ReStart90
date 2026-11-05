// ReStart90 content library — bilingual {zh, en}.
// Status: template draft v0.1, pending clinical review. Every task carries a `source` so the UI can show where it came from.

export const TEMPLATE_VERSION = 'v0.1';

export const LEVELS = [
  null,
  { id: 1, patient: { zh: '家属替我做', en: 'Family does it for me' }, family: { zh: '替他完成', en: 'Do it for them' }, formal: { zh: '完全协助', en: 'Full assistance' } },
  { id: 2, patient: { zh: '家属陪我做', en: 'We do it together' }, family: { zh: '陪他完成', en: 'Do it together' }, formal: { zh: '共同完成', en: 'Shared' } },
  { id: 3, patient: { zh: '家属在旁保护', en: 'Family stands by' }, family: { zh: '在旁边保护', en: 'Stand by' }, formal: { zh: '旁观监督', en: 'Supervised' } },
  { id: 4, patient: { zh: '我自己能做到', en: 'I can do it myself' }, family: { zh: '让他自己完成', en: 'Let them do it' }, formal: { zh: '独立完成', en: 'Independent' } },
];

// V0.2 brief: day 0 is onboarding, then four target windows. Windows are targets, never promises:
// a patient moves on only when the pass conditions are met and the rehab team confirms.
export const PHASES = [
  { id: 1, from: 1, to: 14,
    name: { zh: '先把生活稳住', en: 'Steady the ground' },
    goal: { zh: '控制安全风险，开始残肢观察，建立安全转移，让患者重新参与至少一项基础生活。', en: 'Control safety risks, start limb checks, make transfers safe, and get the patient back into at least one basic daily task.' },
    pass: { zh: '没有持续加重的红旗；能按要求观察残肢；能按规定协助等级完成转移；至少一项生活能力开始由患者参与。', en: 'No worsening red flags; checks the limb as instructed; transfers at the agreed help level; at least one daily task now involves the patient.' },
    pause: { zh: '明显红肿、异常渗液或气味、疼痛持续加重、发热、跌倒、胸痛气短或危机表达。', en: 'Clear redness or swelling, unusual fluid or smell, worsening pain, fever, a fall, chest pain or breathlessness, or crisis talk.' } },
  { id: 2, from: 15, to: 30,
    name: { zh: '没有假肢也能生活', en: 'Living without a prosthesis' },
    goal: { zh: '扩大个人护理能力，预防挛缩，提升核心、上肢、健侧下肢和平衡，建立安全的轮椅或其他移动方式。', en: 'Widen self-care, prevent contractures, build core, arm, sound-leg strength and balance, and a safe way to get around.' },
    pass: { zh: '残肢情况允许进一步训练；关节活动度没有持续恶化；基础转移达到约定安全等级；能完成部分个人护理。', en: 'Limb allows more training; joint range not getting worse; transfers at the agreed safety level; part of self-care done alone.' },
    pause: { zh: '同第一阶段的红旗，或关节活动度持续变差。', en: 'Phase 1 red flags, or joint range keeps getting worse.' } },
  { id: 3, from: 31, to: 60,
    name: { zh: '扩大生活半径', en: 'Widening the circle' },
    goal: { zh: '从房间走向家庭和社区；完成假肢前准备或完善非假肢移动；恢复学习、社交和兴趣。', en: 'From the room to the home and the neighbourhood; prepare for a prosthesis or refine other ways of moving; get back to learning, people and interests.' },
    pass: { zh: '安全使用当前主要移动方式；知道异常如何处理；完成一次计划内社区活动；家属能退到保护位置。', en: 'Uses the main way of moving safely; knows what to do when something is wrong; one planned outing done; family can step back to standing by.' },
    pause: { zh: '跌倒、皮肤破损或辅具问题。', en: 'A fall, skin breakdown, or equipment problems.' } },
  { id: 4, from: 61, to: 90,
    name: { zh: '准备自己生活', en: 'Ready to live on my own' },
    goal: { zh: '形成可持续的移动方式；恢复家庭、学习、工作或社会角色；建立 90 天之后的随访计划。', en: 'A lasting way to get around; back to family, study, work or social roles; a follow-up plan beyond day 90.' },
    pass: { zh: '第 90 天输出：已拿回的能力、仍需协助的能力、风险和复诊事项、下一阶段目标，以及家属继续做和停止做的事。', en: 'Day 90 output: abilities handed back, those still needing help, risks and follow-ups, next goals, and what family keeps doing or stops doing.' },
    pause: { zh: '任何红旗，或已交还的能力明显退步。', en: 'Any red flag, or a handed-back ability clearly slipping.' } },
];

export const phaseOf = (day) => PHASES.find((p) => day >= p.from && day <= p.to) || PHASES[PHASES.length - 1];

// risk 'high' → every upgrade needs rehab confirmation. 'low' → level 1→2 can be agreed by patient and family; higher needs rehab.
export const ABILITIES = [
  {
    id: 'limbcare', track: 'body', risk: 'high', phase: 1,
    name: { zh: '残肢观察与护理', en: 'Residual limb care' },
    life: { zh: '自己照顾好残肢', en: 'Look after my residual limb myself' },
    levels: [null,
      { p: { zh: '家属检查和包扎残肢时，你看着学：皮肤哪里要注意，绷带怎样缠。', en: 'Watch while your family checks and wraps the limb: where to look, how the bandage goes.' },
        f: { zh: '按医嘱检查并包扎，边做边讲每一步。', en: 'Check and wrap as ordered, explaining each step out loud.' } },
      { p: { zh: '用镜子自己看一遍残肢皮肤，缠绷带的第一圈由你来。', en: 'Use a mirror to check the skin yourself, and wrap the first turn of the bandage.' },
        f: { zh: '让他自己看皮肤，只帮他缠后半部分。', en: 'Let them look at the skin; only help with the second half of the wrap.' } },
      { p: { zh: '自己检查皮肤并缠好弹力绷带，家属只检查松紧。', en: 'Check the skin and wrap the bandage yourself; family only checks the tension.' },
        f: { zh: '只看三点：平整无褶皱、远端比近端紧、能伸进一指。', en: 'Check three things only: smooth, tighter at the end than the top, one finger fits.' } },
      { p: { zh: '每天自己检查、清洁、包扎残肢，发现异常主动报告。', en: 'Check, clean and wrap the limb yourself every day, and report anything unusual.' },
        f: { zh: '不再参与日常护理，每周看一次他的记录即可。', en: 'Step out of daily care; glance at their log once a week.' } },
    ],
    smaller: { zh: '今天只用镜子看一看残肢，说出你看到了什么。', en: 'Today, just look at the limb in a mirror and say what you see.' },
    noDo: { zh: '他不敢看残肢时，不要一直替他做。看着它，是接受身体的一步。', en: "If they can't bear to look at the limb, don't keep doing it for them. Looking is part of accepting the body." },
  },
  {
    id: 'transfer', track: 'life', risk: 'high', phase: 1,
    name: { zh: '床椅转移', en: 'Bed-to-wheelchair transfer' },
    life: { zh: '自己从床上坐到轮椅上', en: 'Get from bed to wheelchair on my own' },
    levels: [null,
      { p: { zh: '家属帮你转移时，你双手撑住扶手，数到三一起用力。', en: 'When family moves you, push on the armrests and lift together on three.' },
        f: { zh: '锁好刹车，轮椅放在健侧并与床成30–45度，由你完成主要动作。', en: 'Lock the brakes, park on the sound side at 30–45°, and do the main lift.' } },
      { p: { zh: '自己撑起身体、转身坐到轮椅上，家属扶着转移带。', en: 'Push up, pivot and sit down yourself while family holds the transfer belt.' },
        f: { zh: '只扶转移带，他失去平衡时才用力，不要直接抱起。', en: 'Hold the belt only; take weight only if they lose balance. Never lift them bodily.' } },
      { p: { zh: '自己完成整个转移，家属站在旁边一步远。', en: 'Do the whole transfer yourself with family one step away.' },
        f: { zh: '站在健侧一步远，手不碰他，只在要摔倒时扶住。', en: 'Stand one step away on the sound side, hands off, catch only if they start to fall.' } },
      { p: { zh: '床和轮椅之间来回，都自己完成。', en: 'Move between bed and wheelchair in both directions on your own.' },
        f: { zh: '可以离开房间，只需确认刹车和床高合适。', en: 'You can leave the room; just make sure brakes and bed height are right.' } },
    ],
    smaller: { zh: '今天只练从躺着到坐在床边，坐稳一分钟。', en: 'Today, only practise sitting up on the edge of the bed and staying steady for a minute.' },
    noDo: { zh: '不要把他整个抱到轮椅上。自己撑起身体，是他重新获得力量的机会。', en: "Don't lift them into the chair. Pushing up themselves is how they get strong again." },
  },
  {
    id: 'grooming', track: 'life', risk: 'low', phase: 1,
    name: { zh: '洗漱', en: 'Washing up' },
    life: { zh: '自己洗脸、刷牙、刮胡子', en: 'Wash my face and brush my teeth myself' },
    levels: [null,
      { p: { zh: '家属把水和用品端到床边，你自己擦脸、挤牙膏。', en: 'Family brings water and things to the bed; you wipe your face and put toothpaste on the brush.' },
        f: { zh: '准备好水和用品放在床边，他能做的步骤让他做。', en: 'Set up water and things by the bed; let them do every step they can.' } },
      { p: { zh: '坐轮椅到洗手池前，自己刷牙洗脸，家属帮你拿高处的东西。', en: 'Wheel to the sink and wash up yourself; family only fetches things out of reach.' },
        f: { zh: '只协助站位和取物，避免全程代劳。', en: 'Help only with positioning and fetching things; do not take over.' } },
      { p: { zh: '自己去洗手池完成洗漱，家属在门口。', en: 'Go to the sink and wash up on your own; family waits at the door.' },
        f: { zh: '在门口等，地面保持干燥，不插手。', en: 'Wait at the door, keep the floor dry, hands off.' } },
      { p: { zh: '每天早晚自己洗漱。', en: 'Wash up on your own morning and evening.' },
        f: { zh: '不再参与。把常用物品放在他坐着够得着的地方。', en: 'Step out. Keep everyday items within seated reach.' } },
    ],
    smaller: { zh: '今天只自己擦一次脸。', en: 'Today, just wipe your face once yourself.' },
    noDo: { zh: '他能自己擦脸刷牙时，不要因为快就替他做。', en: "When they can wash their own face, don't do it for them just because it's faster." },
  },
  {
    id: 'toilet', track: 'life', risk: 'high', phase: 1,
    name: { zh: '如厕', en: 'Using the toilet' },
    life: { zh: '夜里自己去厕所', en: 'Go to the toilet on my own, even at night' },
    levels: [null,
      { p: { zh: '在床边用坐便椅，擦拭和整理衣服自己来。', en: 'Use the bedside commode; wipe and adjust clothes yourself.' },
        f: { zh: '帮他用床边坐便椅，擦拭和穿脱裤子让他自己做。', en: 'Help with the commode; let them wipe and manage clothes themselves.' } },
      { p: { zh: '坐轮椅去卫生间，扶着扶手转到马桶上，家属在旁扶。', en: 'Wheel to the bathroom and move onto the toilet using the grab bar while family steadies you.' },
        f: { zh: '扶他转移到马桶上，然后退到门口。', en: 'Steady the transfer onto the toilet, then step back to the door.' } },
      { p: { zh: '自己去卫生间并完成转移，家属在门外。', en: 'Go and transfer on your own; family waits outside.' },
        f: { zh: '在门外等，门不反锁。夜里开好小夜灯。', en: 'Wait outside, door unlocked. Keep a night light on.' } },
      { p: { zh: '白天和夜里都自己去厕所。', en: 'Use the toilet on your own, day and night.' },
        f: { zh: '保证夜灯、扶手和通道畅通，地面干燥。', en: 'Keep the night light, grab bar and path clear, floor dry.' } },
    ],
    smaller: { zh: '今天只练一次：扶着扶手从轮椅站起再坐下。', en: 'Today, practise once: stand up from the wheelchair holding the bar, then sit down.' },
    noDo: { zh: '不要替他擦拭和穿脱裤子，除非他明确需要。', en: "Don't wipe or dress them unless they clearly ask." },
  },
  {
    id: 'dressing', track: 'life', risk: 'low', phase: 2,
    name: { zh: '穿衣', en: 'Getting dressed' },
    life: { zh: '自己穿上衣服和裤子', en: 'Put on my own clothes' },
    levels: [null,
      { p: { zh: '家属帮你穿裤子，上衣和扣子你自己来。', en: 'Family helps with trousers; you do your top and buttons.' },
        f: { zh: '帮他穿裤子，先穿残肢侧。上衣让他自己穿。', en: 'Help with trousers, limb side first. Let them do the top.' } },
      { p: { zh: '坐在床边自己穿裤子，家属帮你提到腰部。', en: 'Sit on the bed and put trousers on; family helps pull them to the waist.' },
        f: { zh: '只在他起身提裤子时扶稳。', en: 'Only steady them when they stand to pull trousers up.' } },
      { p: { zh: '坐着自己穿好全部衣服，家属在旁边。', en: 'Get fully dressed sitting down; family nearby.' },
        f: { zh: '把衣服放在他够得着的地方，然后在旁边等。', en: 'Put clothes within reach, then wait nearby.' } },
      { p: { zh: '每天自己选衣服、穿好。', en: 'Choose and put on your clothes every day.' },
        f: { zh: '让他自己决定穿什么。', en: 'Let them decide what to wear.' } },
    ],
    smaller: { zh: '今天只自己穿上衣，裤子请家属帮忙。', en: 'Today, just put on your top; family helps with trousers.' },
    noDo: { zh: '不要因为快就替他穿，慢一点没关系。', en: "Don't dress them because it's quicker. Slow is fine." },
  },
  {
    id: 'outing', track: 'social', risk: 'high', phase: 3,
    name: { zh: '出门', en: 'Going out' },
    life: { zh: '自己下楼走一走', en: 'Go downstairs and out on my own' },
    levels: [null,
      { p: { zh: '家属推你到楼下坐十五分钟，去哪儿由你定。', en: 'Family takes you downstairs for fifteen minutes; you choose where.' },
        f: { zh: '推他下楼，让他决定去哪儿、待多久。', en: 'Take them down; let them decide where and how long.' } },
      { p: { zh: '和家属一起在小区走一圈，你自己推轮椅。', en: 'Go round the block together; you push your own wheelchair.' },
        f: { zh: '陪在旁边，只在台阶和坡道帮一把。', en: 'Walk alongside; help only at steps and ramps.' } },
      { p: { zh: '自己去楼下小店买一样东西，家属远远跟着。', en: 'Buy one thing at the shop downstairs; family follows at a distance.' },
        f: { zh: '保持能看到他的距离，不主动上前。', en: 'Keep them in sight, but do not step in.' } },
      { p: { zh: '自己出门办一件想办的事。', en: 'Go out on your own to do one thing you want to do.' },
        f: { zh: '出门前确认手机有电，约好回家时间。', en: 'Check their phone is charged and agree a time to be back.' } },
    ],
    smaller: { zh: '今天只在窗边或阳台坐十分钟。', en: 'Today, just sit by the window or on the balcony for ten minutes.' },
    noDo: { zh: '有人围观或询问时，不要替他回答，让他自己决定怎么说。', en: 'When people stare or ask, don’t answer for them. Let them decide what to say.' },
  },
];

export const abilityById = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));

// Psychological and social main task — one per day, rotated within the phase.
export const SOCIAL_TASKS = {
  1: [
    { zh: '选一句今天最想对家人说的话，说出来。', en: 'Pick one thing you most want to say to your family today, and say it.' },
    { zh: '告诉家人今天哪一件事你想自己来。', en: 'Tell your family one thing you want to do yourself today.' },
    { zh: '写下今天一件自己做到的事。', en: 'Write down one thing you managed yourself today.' },
  ],
  2: [
    { zh: '给一位朋友发一条消息，说说近况。', en: 'Send a friend a message about how you are doing.' },
    { zh: '在门口或阳台停留五分钟。', en: 'Spend five minutes at the door or on the balcony.' },
    { zh: '读一条同伴故事（示例），想想哪一句对你有用。', en: 'Read one peer story (sample) and notice which line speaks to you.' },
  ],
  3: [
    { zh: '计划一次短距离外出：去哪里、和谁、多久。', en: 'Plan a short trip out: where, with whom, how long.' },
    { zh: '联系一件和工作有关的小事。', en: 'Reach out about one small work-related thing.' },
    { zh: '和一位受训同伴通一次电话（示例入口）。', en: 'Call a trained peer visitor (sample entry).' },
  ],
  4: [
    { zh: '自己安排下周的日程。', en: 'Plan next week yourself.' },
    { zh: '写下九十天后你最想做的一件事。', en: 'Write down the one thing you most want to do after day 90.' },
  ],
};

// Family side for the social task.
export const SOCIAL_FAMILY = { zh: '听他说完，不急着给建议。问一句：明天你最需要我怎样帮？', en: 'Listen to the end without rushing to advise. Ask: how can I best help tomorrow?' };

// Secondary list — training from the rehab plan, adjusted by amputation level.
export const TRAINING = {
  contracture: {
    belowKnee: { zh: '保持膝关节伸直：坐着时残肢放在平板上伸直，躺下时膝下不垫枕头。', en: 'Keep the knee straight: rest the limb on a board when sitting, no pillow under the knee when lying down.' },
    aboveKnee: { zh: '每天俯卧两次，每次二十分钟，防止髋关节变得伸不直。残肢下不垫枕头。', en: 'Lie on your front twice a day for 20 minutes to keep the hip straight. No pillow under the limb.' },
    family: { zh: '帮他计时，提醒不要在残肢下垫枕头。', en: 'Keep time and remind them: no pillow under the limb.' },
  },
  strength: {
    p: { zh: '上肢和健侧腿力量练习：坐着撑起身体 10 次 × 3 组，健侧抬腿 10 次 × 3 组。', en: 'Arm and sound-leg strength: seated push-ups 10 × 3, sound-leg raises 10 × 3.' },
    f: { zh: '帮他计数，不用帮他做。', en: 'Count for them; no need to help with the moves.' },
  },
  soundFoot: {
    p: { zh: '检查健侧脚：看有没有破皮、水泡、颜色变化（有糖尿病时尤其重要）。', en: 'Check your other foot for cuts, blisters or colour change (especially important with diabetes).' },
    f: { zh: '他看不到脚底时，帮他拿镜子。', en: 'Hold a mirror if they cannot see the sole.' },
  },
};

// Red-flag rules. Thresholds are deterministic; AI only turns free text into these signal ids.
export const SIGNALS = [
  { id: 'wound', level: 'red', label: { zh: '伤口发红、肿胀、渗液或有异味', en: 'Wound red, swollen, leaking or smelly' }, action: { zh: '今天联系手术医生或伤口门诊', en: 'Contact the surgeon or wound clinic today' }, pauses: ['limbcare', 'transfer'] },
  { id: 'fever', level: 'red', label: { zh: '体温 38℃ 或以上', en: 'Temperature 38°C or higher' }, action: { zh: '今天联系医生', en: 'Contact the doctor today' }, pauses: ['*'] },
  { id: 'pain', level: 'red', label: { zh: '疼痛 7 分以上，或比基线高 3 分以上', en: 'Pain 7+ or 3+ above baseline' }, action: { zh: '停止相关训练，联系康复人员或医生', en: 'Stop related training; contact the rehab team or doctor' }, pauses: ['transfer', 'toilet'] },
  { id: 'fall', level: 'red', label: { zh: '摔倒', en: 'A fall' }, action: { zh: '联系医生；撞到头或站不起来，立即拨打急救电话（中国 120，加拿大 911）', en: 'Contact the doctor; if the head was hit or you cannot get up, call 911 (Canada/US) now' }, pauses: ['*'] },
  { id: 'soundFoot', level: 'red', label: { zh: '健侧脚破皮、水泡或发黑', en: 'Sound foot has a cut, blister or dark skin' }, action: { zh: '今天联系医生', en: 'Contact the doctor today' }, pauses: ['outing'] },
  { id: 'chest', level: 'emergency', label: { zh: '胸痛、气短，或小腿肿痛', en: 'Chest pain, breathlessness, or a swollen painful calf' }, action: { zh: '立即拨打急救电话（中国 120，加拿大 911）', en: 'Call 911 (Canada/US) or your local emergency number now' }, pauses: ['*'] },
  { id: 'crisis', level: 'emergency', label: { zh: '有伤害自己的想法', en: 'Thoughts of harming yourself' }, action: { zh: '立即拨打心理危机热线（中国 12356，加拿大和美国 988），或急救电话；告诉身边的人', en: 'Call or text 988 (Canada/US) now, or emergency services; tell someone near you' }, pauses: ['*'] },
];
export const signalById = Object.fromEntries(SIGNALS.map((s) => [s.id, s]));

// Keyword rules for the offline parser (also used as a safety net after the AI parser).
export const SIGNAL_PATTERNS = {
  wound: [/渗|脓|红肿|发红|异味|臭|裂开|黄水|流水/, /\b(leak\w*|pus|ooz\w*|smell\w*|swollen|redness|red)\b/i],
  fever: [/发烧|发热|3[89](\.\d)?\s*(℃|°|度)/, /\bfever\b|\b3[89](\.\d)?\s*°/i],
  fall: [/摔|跌倒/, /\b(fell|fall|fallen)\b/i],
  soundFoot: [/水泡|破皮|发黑|破溃/, /\b(blister\w*|black(ened)?)\b/i],
  chest: [/胸痛|胸闷|喘不上|气短|小腿肿/, /\bchest\b|short of breath|breathless|swollen calf/i],
  crisis: [/不想活|想死|自杀|伤害自己|活着没意思|活着没意义/, /kill myself|suicid|end it all|harm myself|want to die|don'?t want to live/i],
};

export const PEER_STORIES = [
  { who: { zh: '老周，膝下截肢两年（示例）', en: 'Zhou, two years after a below-knee amputation (sample)' },
    text: { zh: '刚回家那会儿，我连坐起来都要人扶。第一次自己挪到轮椅上，用了二十分钟。慢没关系，是自己挪的。', en: 'When I first came home I needed help just to sit up. The first time I got into the chair myself it took twenty minutes. Slow was fine. It was me who did it.' } },
  { who: { zh: '阿梅，膝上截肢一年（示例）', en: 'Mei, one year after an above-knee amputation (sample)' },
    text: { zh: '有一周我什么都不想做。后来我只定一个目标：每天自己洗一次脸。那一周过去了，下一周就好多了。', en: "There was a week I didn't want to do anything. So I set one goal: wash my own face once a day. That week passed, and the next was better." } },
];

export const SOURCES = {
  order: { zh: '医嘱', en: 'Doctor’s order' },
  template: { zh: `审核模板 ${TEMPLATE_VERSION}（待临床审核）`, en: `Reviewed template ${TEMPLATE_VERSION} (pending clinical review)` },
  rehab: { zh: '康复人员确认', en: 'Confirmed by rehab team' },
  rehabPlan: { zh: '康复人员方案', en: 'Rehab plan' },
  patient: { zh: '患者自己选择', en: 'Chosen by the patient' },
};
