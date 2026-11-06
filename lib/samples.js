// Synthetic discharge summary for the demo persona Lin Kai (final promo brief: a Miao silversmith, 52,
// from a fictional village near Kaili). Not a real patient, family, village or hospital. Pending clinical review.

export const SAMPLE_DISCHARGE = {
  zh: `出院小结（合成病例，仅供演示）

姓名：林凯（Lin Kai）　性别：男　年龄：52岁　职业：银匠
居住地：黔东南凯里附近苗寨（虚构）　家庭情况：子女在外地工作，家中无持续陪护
入院日期：2026年10月5日　手术日期：2026年10月8日　出院日期：2026年10月27日
入院诊断：左小腿严重软组织感染，保肢失败
手术名称：左侧经胫骨截肢术（小腿截肢）

住院经过：患者因左小腿严重感染入院，经抗感染治疗后仍无法保肢，行左侧小腿截肢术。术后伤口愈合中，残端无明显感染征象，部分缝线已拆除。已能借助轮椅独立完成床椅转移。既往体健，无糖尿病。

出院医嘱：
1. 伤口护理：每两天由寨卫生室乡村医生或在县医院门诊换药一次，保持伤口干燥，拆线前不得淋浴。
2. 残肢塑形：每日使用弹力绷带"8"字包扎，每4小时重新包扎一次。
3. 活动限制：残肢暂不负重，右下肢可正常负重；按病房教过的方法使用轮椅，刹车锁好后再转移。坐位时保持膝关节伸直，膝下不垫枕头。家中有门槛和石阶：上下台阶需有人在旁保护，不要独自走石阶。水、电话和药放在坐着够得到的地方。
4. 用药：对乙酰氨基酚按需止痛；幻肢痛加重时联系门诊，不要自行加药。
5. 复诊安排：2026年11月10日县医院骨科门诊复诊拆线；术后6周至康复中心评估假肢。
6. 出现以下情况立即就诊：伤口红肿、发热、渗液、有异味、出血或裂开；体温≥38℃；残肢疼痛突然加重；跌倒；胸痛、气短或小腿肿痛请立即拨打急救电话。

康复意见（县医院康复科）：每日上肢、核心及右下肢力量训练；练习床椅转移；先把每天要用的东西放到自己够得到的位置，再一项一项拿回生活。`,
  en: `DISCHARGE SUMMARY (synthetic case, for demo only)

Name: Lin Kai   Sex: Male   Age: 52   Occupation: silversmith
Home: a Miao village near Kaili, Guizhou (fictional)   His children work in other cities; no one at home to care for him full time
Admitted: 5 Oct 2026   Surgery: 8 Oct 2026   Discharged: 27 Oct 2026
Diagnosis: Severe soft-tissue infection of the left lower leg; the limb could not be saved
Procedure: Left transtibial amputation (below-knee amputation)

Hospital course: Admitted with a severe infection of the left lower leg. Despite treatment the limb could not be saved, and a left below-knee amputation was performed. The wound is healing; no signs of infection at the stump; some sutures removed. Transfers between bed and wheelchair on his own. Previously healthy; no diabetes.

Discharge orders:
1. Wound care: Dressing changed every two days by the village clinic doctor or at the county hospital clinic. Keep the wound dry. No showering until sutures are removed.
2. Limb shaping: Figure-of-eight elastic bandage daily, rewrapped every 4 hours.
3. Activity: No weight bearing on the residual limb; full weight bearing on the right leg. Use the wheelchair as taught on the ward and lock the brakes before every transfer. Keep the knee straight when sitting; no pillow under the knee. The house has door sills and stone steps: have someone stand by on steps and do not use the stone steps alone. Keep water, phone and medicines within seated reach.
4. Medication: Acetaminophen as needed for pain. If phantom pain gets worse, contact the clinic; do not add medicine yourself.
5. Follow-up: County hospital orthopaedic clinic on 10 Nov 2026 for suture removal; rehabilitation centre assessment for a prosthesis at 6 weeks after surgery.
6. Seek care immediately if: wound red, warm, leaking, smelly, bleeding or opening; temperature 38°C or higher; sudden increase in limb pain; a fall; chest pain, breathlessness or a swollen painful calf (call emergency services).

Rehab note (county hospital rehabilitation department): Daily arm, core and right-leg strengthening; practise bed-to-wheelchair transfers; first put the things you use every day within your own reach, then take daily life back one task at a time.`,
};

// Pre-generated extraction — used when no API key is configured or the call fails.
// Quotes are exact substrings of the sample text so the UI can highlight them.
export const SAMPLE_EXTRACTION = {
  zh: {
    name: '林凯', age: 52, sex: 'male',
    side: 'left', level: 'below', diabetes: false,
    surgeryDate: '2026-10-08', dischargeDate: '2026-10-27',
    fields: [
      { key: 'amputation', value: '左侧小腿截肢（经胫骨），2026年10月8日手术；原因：严重软组织感染，保肢失败', quote: '左侧经胫骨截肢术（小腿截肢）' },
      { key: 'wound', value: '乡村医生或门诊每两天换药；保持干燥；拆线前不得淋浴；每日弹力绷带"8"字包扎', quote: '每两天由寨卫生室乡村医生或在县医院门诊换药一次，保持伤口干燥，拆线前不得淋浴。' },
      { key: 'activity', value: '残肢暂不负重，右下肢可正常负重；锁好刹车再转移；坐位膝关节伸直，膝下不垫枕头；上下石阶需有人在旁保护；常用物品放在够得到的地方', quote: '残肢暂不负重，右下肢可正常负重；按病房教过的方法使用轮椅，刹车锁好后再转移。' },
      { key: 'followUp', value: '2026年11月10日县医院骨科门诊拆线；术后6周康复中心假肢评估', quote: '2026年11月10日县医院骨科门诊复诊拆线；术后6周至康复中心评估假肢。' },
      { key: 'redFlags', value: '伤口红肿、发热、渗液、异味、出血或裂开；体温≥38℃；疼痛突然加重；跌倒；胸痛气短或小腿肿痛（拨打急救电话）', quote: '伤口红肿、发热、渗液、有异味、出血或裂开；体温≥38℃；残肢疼痛突然加重；跌倒；胸痛、气短或小腿肿痛请立即拨打急救电话。' },
    ],
  },
  en: {
    name: 'Lin Kai', age: 52, sex: 'male',
    side: 'left', level: 'below', diabetes: false,
    surgeryDate: '2026-10-08', dischargeDate: '2026-10-27',
    fields: [
      { key: 'amputation', value: 'Left below-knee (transtibial) amputation on 8 Oct 2026; cause: severe soft-tissue infection, limb could not be saved', quote: 'Left transtibial amputation (below-knee amputation)' },
      { key: 'wound', value: 'Dressing every 2 days by the village clinic doctor or county clinic; keep dry; no shower until sutures out; daily figure-of-eight bandage', quote: 'Dressing changed every two days by the village clinic doctor or at the county hospital clinic. Keep the wound dry. No showering until sutures are removed.' },
      { key: 'activity', value: 'No weight bearing on the residual limb; full on the right leg; lock brakes before transfers; knee straight, no pillow under the knee; someone stands by on steps; keep things within reach', quote: 'No weight bearing on the residual limb; full weight bearing on the right leg. Use the wheelchair as taught on the ward and lock the brakes before every transfer.' },
      { key: 'followUp', value: 'County hospital orthopaedic clinic 10 Nov 2026 for suture removal; prosthetic assessment at 6 weeks', quote: 'County hospital orthopaedic clinic on 10 Nov 2026 for suture removal; rehabilitation centre assessment for a prosthesis at 6 weeks after surgery.' },
      { key: 'redFlags', value: 'Wound red, warm, leaking, smelly, bleeding or opening; temp ≥38°C; sudden pain increase; a fall; chest pain, breathlessness or swollen calf (emergency)', quote: 'wound red, warm, leaking, smelly, bleeding or opening; temperature 38°C or higher; sudden increase in limb pain; a fall; chest pain, breathlessness or a swollen painful calf (call emergency services)' },
    ],
  },
};

export const DEMO_PROFILE_EXTRA = {
  // He chose "I'm on my own now"; on day 3 he let the village clinic doctor join as his rehab layer.
  support: { mode: 'solo', family: null, rehab: { name: { zh: '杨医生（寨卫生室乡村医生）', en: 'Dr Yang (village clinic doctor)' }, day: 3 } },
  occupation: { zh: '苗族银匠', en: 'Miao silversmith' },
  goals: ['grooming', 'transfer', 'toilet'],
  // Final promo brief: the goal is the lookout over the terraced fields, reached safely with support or an aid.
  customGoal: { zh: '再去寨子外的观景处，看一眼那片梯田', en: 'Get back to the lookout outside the village and see the terraced fields again' },
  worry: { zh: '我怕的不是慢，是以后每一件普通事，都要等别人有空。', en: 'It’s not being slow I’m afraid of. It’s waiting for someone to have time for every ordinary thing.' },
  confidence: 2,
};
