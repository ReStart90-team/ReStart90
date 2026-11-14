import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDischarge } from '../lib/ai.js';
import { SAMPLE_DISCHARGE, SAMPLE_EXTRACTION } from '../lib/samples.js';

process.env.RESTART90_OFFLINE = '1';
const extract = (text, lang = 'zh') => extractDischarge({ text, lang, offline: true });
const keys = ['amputation', 'wound', 'activity', 'followUp', 'redFlags'];

// Exact copies of the delivery fixtures, kept here so npm test needs no external files.
// 合成出院小结_陈芳_右侧膝下.txt
const chen = `出院小结（合成测试病例）
仅供 ReStart90 上传与建档测试，不是真实患者病历，未经临床审核，不作为诊疗或训练指引。

姓名：陈芳
性别：女
年龄：45岁
入院日期：2026年10月29日
手术日期：2026年11月01日
出院日期：2026年11月09日

入院诊断：交通事故导致右小腿严重损伤。
手术名称：右侧经胫骨截肢术（膝下截肢）。
住院经过：术后接受伤口处理与生活活动评估，拟出院回家继续按已确认医嘱康复。
既往史：无糖尿病。

出院医嘱（以下内容同为合成测试资料）：
1. 伤口护理：由社区护士按本例已确认的医嘱换药，保持伤口干燥；包扎操作需经康复人员指导后进行。
2. 活动限制：残肢暂不负重；床椅转移按康复人员确认的协助等级进行，不自行增加负重或训练难度。
3. 复诊：2026年11月23日康复门诊复诊；假肢使用与后续活动计划由专业人员评估确认。
4. 出现以下情况立即就诊：伤口红肿、渗液或异味，发热，疼痛突然加重或跌倒；胸痛、气短应及时寻求急救。

生活背景（合成）：陈芳希望逐渐自己完成洗漱与床椅转移。家中有配偶可协助，但帮助范围应按每日确认的角色执行。
`;

// 合成出院小结_吴建国_左侧膝上.txt
const wu = `出院小结（合成测试病例）
仅供 ReStart90 上传与建档测试，不是真实患者病历，未经临床审核，不作为诊疗或训练指引。

姓名：吴建国
性别：男
年龄：61岁
入院日期：2026年10月18日
手术日期：2026年10月22日
出院日期：2026年11月08日

入院诊断：左下肢严重损伤，接受手术处理。
手术名称：左侧经股骨截肢术（膝上截肢）。
住院经过：术后完成住院观察与生活活动评估，出院后按专业人员确认的计划继续康复。
既往史：已确诊糖尿病，相关用药继续按原医嘱执行，不由本系统调整。

出院医嘱（以下内容同为合成测试资料）：
1. 伤口护理：由社区护士按本例已确认的医嘱换药，保持伤口清洁干燥；若发现伤口异常，及时联系专业人员。
2. 活动限制：残肢不负重；转移需按专业人员确认的协助等级进行，不擅自改变活动限制。
3. 复诊：2026年11月22日康复门诊复诊，后续假肢与训练安排由专业人员评估。
4. 出现以下情况立即就诊：伤口红肿、渗液或异味，发热，疼痛突然加重，跌倒，另一只脚新出现损伤；胸痛、气短应及时寻求急救。

生活背景（合成）：吴建国希望能够参与洗漱、按计划完成转移。出院后女儿可以提供必要帮助，但不应超出当天明确的协助范围。
`;

function assertOfflineFields(result, text, filled = true) {
  assert.equal(result.mode, 'offline');
  assert.equal(result.model, undefined);
  assert.deepEqual(result.fields.map((f) => f.key), keys);
  for (const field of result.fields) {
    assert.equal(field.value, field.quote, `${field.key}: no invented advice or paraphrase`);
    assert.equal(field.quoteFound, Boolean(field.quote) && text.includes(field.quote));
    if (filled) {
      assert.ok(field.quote, `${field.key}: present in this fixture`);
      assert.ok(text.includes(field.quote), `${field.key}: exact source substring`);
      assert.equal(field.quoteFound, true);
    }
  }
}

for (const [label, text, expected] of [
  ['陈芳', chen, { name: '陈芳', sex: 'female', age: 45, side: 'right', level: 'below', diabetes: false, surgeryDate: '2026-11-01', dischargeDate: '2026-11-09' }],
  ['吴建国', wu, { name: '吴建国', sex: 'male', age: 61, side: 'left', level: 'above', diabetes: true, surgeryDate: '2026-10-22', dischargeDate: '2026-11-08' }],
]) {
  test(`new synthetic discharge: ${label} has patient demographics, dates and five exact quotes`, async () => {
    const result = await extract(text);
    for (const [key, value] of Object.entries(expected)) assert.equal(result[key], value, key);
    assertOfflineFields(result, text);
  });
}

test('explicit inline patient labels take priority and relatives cannot supply demographics', async () => {
  const text = '家属姓名：林慧 性别：女 年龄：32岁\n患者姓名：周明　性别：男　年龄：60岁\n女儿可帮助换药。';
  const result = await extract(text);
  assert.equal(result.name, '周明');
  assert.equal(result.sex, 'male');
  assert.equal(result.age, 60);
  assertOfflineFields(result, text, false);
});

test('female-only labels work; absent, denied or unknown sex is never inferred from prose', async () => {
  for (const [text, expected] of [
    ['姓名：陈芳\n性别：女', 'female'],
    ['性别：女性', 'female'],
    ['性别：男\n家属性别：女\n女儿陪同出院。', 'male'],
    ['性别：未知\n女儿陪同；男性家属协助。', 'unknown'],
    ['性别：不详\n家属为女性。', 'unknown'],
    ['性别：未记录\n患者不是男性。', 'unknown'],
    ['患者由女儿陪同，男性家属协助。', 'unknown'],
    ['女儿姓名：小芳 性别：女 年龄：20岁', 'unknown'],
  ]) {
    const result = await extract(text);
    assert.equal(result.sex, expected, text);
    assertOfflineFields(result, text, false);
  }
});

test('diabetes requires affirmative patient history and handles common Chinese and English negatives', async () => {
  for (const text of [
    '既往史：无糖尿病。', '既往史：否认糖尿病史。', '既往史：没有糖尿病。', '既往史：未患糖尿病。',
    '既往史：无高血压及糖尿病。', '既往史：糖尿病史不详。', '诊断：疑似糖尿病，待查。',
    '家族史：母亲有糖尿病。', '请留意糖尿病风险。', '没有记录既往史。',
    'Medical history: No diabetes.', 'Patient denies diabetes.', 'History: without diabetes.',
    'Diabetes: no', 'Diabetes: negative', 'Diabetes: unknown', 'Patient is not diabetic.',
    'Family history: diabetes.',
  ]) {
    assert.equal((await extract(text)).diabetes, false, text);
  }
  for (const text of [
    '既往史：已确诊糖尿病。', '既往史：患有2型糖尿病。', '既往史：糖尿病。',
    '无高血压，有糖尿病。', '糖尿病：有', 'Medical history: Type 2 diabetes.',
    'Patient has diabetes.', 'Patient was diagnosed with diabetes.', 'Patient is diabetic.', 'Diabetes: yes',
  ]) {
    assert.equal((await extract(text)).diabetes, true, text);
  }
});

test('missing fields stay empty or unknown rather than adding orders or using admission/follow-up dates', async () => {
  const text = '入院日期：2026年10月18日\n复诊：2026年11月22日。\n女儿可以协助。';
  const result = await extract(text);
  assert.deepEqual(
    Object.fromEntries(['name', 'age', 'sex', 'side', 'level', 'diabetes', 'surgeryDate', 'dischargeDate'].map((k) => [k, result[k]])),
    { name: '', age: null, sex: 'unknown', side: 'unknown', level: 'unknown', diabetes: false, surgeryDate: '', dischargeDate: '' },
  );
  assertOfflineFields(result, text, false);
  for (const field of result.fields.filter((f) => f.key !== 'followUp')) {
    assert.deepEqual(field, { key: field.key, value: '', quote: '', quoteFound: false });
  }
});

test('English newline labels, female, negative diabetes and explicit numeric dates', async () => {
  const text = `Patient Name: Jane Doe
Gender: Female
Age: 45 years old
Surgery Date: 2026/11/1
Discharge Date: 2026-11-09
Procedure: Right transtibial amputation (below-knee amputation).
Medical history: no diabetes.
Wound care: dressing by the nurse.
Activity: no weight bearing.
Follow-up: clinic on 2026-11-23.
Seek care immediately if wound symptoms worsen.
Daughter: Female caregiver available.`;
  const result = await extract(text, 'en');
  assert.deepEqual(
    [result.name, result.sex, result.age, result.side, result.level, result.diabetes, result.surgeryDate, result.dischargeDate],
    ['Jane Doe', 'female', 45, 'right', 'below', false, '2026-11-01', '2026-11-09'],
  );
  assertOfflineFields(result, text);
});

test('English inline case-insensitive labels, male, affirmative diabetes and named-month dates', async () => {
  const text = `Daughter Name: Jane Doe Sex: Female Age: 22
name: John Smith sex: M age: 61
Admitted: 18 Oct 2026 Surgery: 22 Oct 2026 Discharged: 8 November 2026
Procedure: Left transfemoral amputation (above-knee amputation).
Diagnosis: Type 2 diabetes.
Wound care: dressing as prescribed.
Activity: no weight bearing.
Follow-up: clinic on 22 Nov 2026.
Seek care immediately if symptoms worsen.`;
  const result = await extract(text, 'en');
  assert.deepEqual(
    [result.name, result.sex, result.age, result.side, result.level, result.diabetes, result.surgeryDate, result.dischargeDate],
    ['John Smith', 'male', 61, 'left', 'above', true, '2026-10-22', '2026-11-08'],
  );
  assertOfflineFields(result, text);
});

test('common alternate date labels normalize valid dates only', async () => {
  for (const [text, surgery, discharge] of [
    ['手术日期：2026年2月3日　出院日期：2026年2月9日', '2026-02-03', '2026-02-09'],
    ['Operation Date: 2026.2.3\nDate of Discharge: 2026/2/9', '2026-02-03', '2026-02-09'],
    ['Date of Surgery: 29 Feb 2024\nDischarged: 1 March 2024', '2024-02-29', '2024-03-01'],
    ['手术日期：2026年2月29日\n出院日期：2026-13-09', '', ''],
    ['手术日期：未定\n入院日期：2026年10月18日\n复诊：2026年11月22日', '', ''],
    ['Date of Surgery: unknown\nAdmitted: 2026-10-18\nFollow-up: 2026-11-22', '', ''],
    ['Surgery Date: 11/01/2026\nDischarge Date: tomorrow', '', ''],
  ]) {
    const result = await extract(text);
    assert.equal(result.surgeryDate, surgery, text);
    assert.equal(result.dischargeDate, discharge, text);
  }
});

for (const lang of ['zh', 'en']) {
  test(`original ${lang} sample remains pregenerated and unchanged`, async () => {
    const text = SAMPLE_DISCHARGE[lang];
    const result = await extract(text, lang);
    assert.deepEqual(result, {
      ...structuredClone(SAMPLE_EXTRACTION[lang]),
      fields: SAMPLE_EXTRACTION[lang].fields.map((f) => ({ ...f, quoteFound: Boolean(f.quote) && text.includes(f.quote) })),
      mode: 'pregenerated',
    });
    assert.deepEqual(result.fields.map((f) => f.key), keys);
    assert.ok(result.fields.every((f) => f.quoteFound && text.includes(f.quote)));
    result.fields[0].value = 'changed only in test result';
    assert.notEqual((await extract(text, lang)).fields[0].value, result.fields[0].value);
  });
}

test('empty offline text still rejects without a model call', async () => {
  await assert.rejects(extract(''), (err) => err.status === 422);
});
