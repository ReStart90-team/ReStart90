// Synthetic discharge summary for the demo persona Lin Kai (V0.2 brief). Not a real patient.

export const SAMPLE_DISCHARGE = {
  zh: `出院小结（合成病例，仅供演示）

姓名：林凯（Kai Lin）　性别：男　年龄：27岁
入院日期：2026年10月12日　手术日期：2026年10月14日　出院日期：2026年10月27日
入院诊断：交通事故致左小腿开放性粉碎骨折，软组织严重毁损
手术名称：左侧经胫骨截肢术（小腿截肢）

住院经过：患者因交通事故入院，左小腿无法保肢，行左侧小腿截肢术。术后伤口愈合中，残端无明显感染征象，部分缝线已拆除。既往体健，无糖尿病。

出院医嘱：
1. 伤口护理：每两天由社区护士换药一次，保持伤口干燥，拆线前不得淋浴。
2. 残肢塑形：每日使用弹力绷带"8"字包扎，每4小时重新包扎一次。
3. 活动限制：残肢暂不负重，右下肢可正常负重；可在家属保护下进行床椅转移。坐位时保持膝关节伸直，膝下不垫枕头。
4. 用药：对乙酰氨基酚按需止痛；幻肢痛加重时按医嘱服用加巴喷丁。
5. 复诊安排：2026年11月10日骨科门诊复诊拆线；术后6周至假肢中心评估。
6. 出现以下情况立即就诊：伤口红肿、渗液或有异味；体温≥38℃；残肢疼痛突然加重；跌倒；胸痛、气短或小腿肿痛请立即拨打急救电话。

康复意见（社区物理治疗师 Simone Wong）：每日上肢、核心及右下肢力量训练；练习床椅转移；家属避免过度代劳，逐步交还日常生活。`,
  en: `DISCHARGE SUMMARY (synthetic case, for demo only)

Name: Kai Lin   Sex: Male   Age: 27
Admitted: 12 Oct 2026   Surgery: 14 Oct 2026   Discharged: 27 Oct 2026
Diagnosis: Open comminuted fracture of the left lower leg with severe soft-tissue damage after a traffic collision
Procedure: Left transtibial amputation (below-knee amputation)

Hospital course: Admitted after a traffic collision; the left lower leg could not be saved and a left below-knee amputation was performed. The wound is healing; no signs of infection at the stump; some sutures removed. Previously healthy; no diabetes.

Discharge orders:
1. Wound care: Dressing changed by community nurse every two days. Keep the wound dry. No showering until sutures are removed.
2. Limb shaping: Figure-of-eight elastic bandage daily, rewrapped every 4 hours.
3. Activity: No weight bearing on the residual limb; full weight bearing on the right leg. Bed-to-wheelchair transfers with family standing by. Keep the knee straight when sitting; no pillow under the knee.
4. Medication: Acetaminophen as needed for pain; gabapentin as prescribed if phantom pain worsens.
5. Follow-up: Orthopaedic clinic on 10 Nov 2026 for suture removal; prosthetic centre assessment at 6 weeks after surgery.
6. Seek care immediately if: wound red, leaking or smelly; temperature 38°C or higher; sudden increase in limb pain; a fall; chest pain, breathlessness or a swollen painful calf (call emergency services).

Rehab note (community physiotherapist Simone Wong): Daily arm, core and right-leg strengthening; practise bed-to-wheelchair transfers; family should avoid doing too much and hand daily living back step by step.`,
};

// Pre-generated extraction — used when no API key is configured or the call fails.
// Quotes are exact substrings of the sample text so the UI can highlight them.
export const SAMPLE_EXTRACTION = {
  zh: {
    name: '林凯', age: 27, sex: 'male',
    side: 'left', level: 'below', diabetes: false,
    surgeryDate: '2026-10-14', dischargeDate: '2026-10-27',
    fields: [
      { key: 'amputation', value: '左侧小腿截肢（经胫骨），2026年10月14日手术；原因：交通事故', quote: '左侧经胫骨截肢术（小腿截肢）' },
      { key: 'wound', value: '社区护士每两天换药；保持干燥；拆线前不得淋浴；每日弹力绷带"8"字包扎', quote: '每两天由社区护士换药一次，保持伤口干燥，拆线前不得淋浴。' },
      { key: 'activity', value: '残肢暂不负重，右下肢可正常负重；家属保护下床椅转移；坐位膝关节伸直，膝下不垫枕头', quote: '残肢暂不负重，右下肢可正常负重；可在家属保护下进行床椅转移。' },
      { key: 'followUp', value: '2026年11月10日骨科门诊拆线；术后6周假肢中心评估', quote: '2026年11月10日骨科门诊复诊拆线；术后6周至假肢中心评估。' },
      { key: 'redFlags', value: '伤口红肿渗液或异味；体温≥38℃；疼痛突然加重；跌倒；胸痛气短或小腿肿痛（拨打急救电话）', quote: '伤口红肿、渗液或有异味；体温≥38℃；残肢疼痛突然加重；跌倒；胸痛、气短或小腿肿痛请立即拨打急救电话。' },
    ],
  },
  en: {
    name: 'Kai Lin', age: 27, sex: 'male',
    side: 'left', level: 'below', diabetes: false,
    surgeryDate: '2026-10-14', dischargeDate: '2026-10-27',
    fields: [
      { key: 'amputation', value: 'Left below-knee (transtibial) amputation on 14 Oct 2026; cause: traffic collision', quote: 'Left transtibial amputation (below-knee amputation)' },
      { key: 'wound', value: 'Dressing by community nurse every 2 days; keep dry; no shower until sutures out; daily figure-of-eight bandage', quote: 'Dressing changed by community nurse every two days. Keep the wound dry. No showering until sutures are removed.' },
      { key: 'activity', value: 'No weight bearing on the residual limb; full on the right leg; transfers with family standing by; knee straight, no pillow under the knee', quote: 'No weight bearing on the residual limb; full weight bearing on the right leg. Bed-to-wheelchair transfers with family standing by.' },
      { key: 'followUp', value: 'Orthopaedic clinic 10 Nov 2026 for suture removal; prosthetic assessment at 6 weeks', quote: 'Orthopaedic clinic on 10 Nov 2026 for suture removal; prosthetic centre assessment at 6 weeks after surgery.' },
      { key: 'redFlags', value: 'Wound red, leaking or smelly; temp ≥38°C; sudden pain increase; a fall; chest pain, breathlessness or swollen calf (emergency)', quote: 'wound red, leaking or smelly; temperature 38°C or higher; sudden increase in limb pain; a fall; chest pain, breathlessness or a swollen painful calf (call emergency services)' },
    ],
  },
};

export const DEMO_PROFILE_EXTRA = {
  caregiver: { zh: '林慧（母亲）', en: 'Lin Hui (mother)' },
  rehabName: { zh: 'Simone Wong（社区物理治疗师）', en: 'Simone Wong (community physiotherapist)' },
  occupation: { zh: '城市地图与导视设计师，住在温哥华', en: 'Map and wayfinding designer, Vancouver' },
  goals: ['grooming', 'outing', 'transfer'],
  customGoal: { zh: '一个人走出家门，坐公交回到自己的工作室', en: 'Walk out the door alone, take the bus, and get back to my studio' },
  longGoal: { zh: '和残障者一起做一份"Route 90 无障碍生活地图"', en: 'Make a “Route 90” accessible-living map together with other disabled people' },
  worry: { zh: '我以前替别人设计路线，现在连卧室到门口这三米都不想走。', en: 'I used to design routes for other people. Now I don’t even want to walk the three metres from my bedroom to the door.' },
  confidence: 2,
};
