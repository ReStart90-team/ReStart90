// AI layer: understands documents and what people say. It never decides medical thresholds —
// those live in content.js SIGNALS and engine.js. Everything here has an offline path so the demo never breaks.

import { SAMPLE_DISCHARGE, SAMPLE_EXTRACTION } from './samples.js';
import { SIGNAL_PATTERNS } from './content.js';
import { ririProviderStatus } from './model-provider.js';

const MODEL = process.env.RESTART90_MODEL || 'claude-opus-5-5';
let clientPromise = null;

async function getClient() {
  if (process.env.RESTART90_OFFLINE === '1') return null;
  if (!clientPromise) {
    clientPromise = import('@anthropic-ai/sdk')
      .then(({ default: Anthropic }) => {
        const client = new Anthropic();
        return client.apiKey || client.authToken || process.env.ANTHROPIC_API_KEY ? client : null;
      })
      .catch(() => null);
  }
  return clientPromise;
}

export async function aiStatus() {
  return { enabled: !!(await getClient()), model: MODEL, ririProvider: ririProviderStatus() };
}

const FIELD_KEYS = ['amputation', 'wound', 'activity', 'followUp', 'redFlags'];

const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'age', 'sex', 'side', 'level', 'diabetes', 'surgeryDate', 'dischargeDate', 'fields'],
  properties: {
    name: { type: 'string' },
    age: { type: 'integer' },
    sex: { type: 'string', enum: ['male', 'female', 'unknown'] },
    side: { type: 'string', enum: ['left', 'right', 'both', 'unknown'] },
    level: { type: 'string', enum: ['below', 'above', 'other', 'unknown'] },
    diabetes: { type: 'boolean' },
    surgeryDate: { type: 'string', description: 'YYYY-MM-DD or empty' },
    dischargeDate: { type: 'string', description: 'YYYY-MM-DD or empty' },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'value', 'quote'],
        properties: {
          key: { type: 'string', enum: FIELD_KEYS },
          value: { type: 'string' },
          quote: { type: 'string' },
        },
      },
    },
  },
};

const EXTRACT_SYSTEM = `You read a discharge summary for a person who has just had a lower-limb amputation and extract what is written. You never add medical advice, never infer orders that are not written, and never change numbers.

Return exactly five fields, keys in this order: amputation (side, level, date, cause), wound (wound and residual-limb care orders), activity (weight bearing and movement restrictions), followUp (clinic dates), redFlags (when to seek care).
- value: a short plain-language summary of what the document says, in the output language given by the user.
- quote: the single most relevant passage copied character-for-character from the document, so the app can highlight it. If the document does not mention the field, set value to "" and quote to "".
Respond directly without preamble.`;

function normalize(s) {
  return (s || '').replace(/\s+/g, '');
}

function isSample(text) {
  const n = normalize(text);
  return n === normalize(SAMPLE_DISCHARGE.zh) || n === normalize(SAMPLE_DISCHARGE.en);
}

function markQuotes(result, text) {
  if (!text) return result;
  result.fields = result.fields.map((f) => ({ ...f, quoteFound: !!f.quote && text.includes(f.quote) }));
  return result;
}

// `offline: true` skips the model for this call (used when a visitor hits the public rate limit).
export async function extractDischarge({ text, pdfBase64, lang = 'zh', offline = false }) {
  const client = offline ? null : await getClient();
  if (client) {
    try {
      const content = [];
      if (pdfBase64) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } });
      content.push({ type: 'text', text: `${text ? `<document>\n${text}\n</document>\n\n` : ''}Output language: ${lang === 'zh' ? 'Simplified Chinese' : 'English'}.` });
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: EXTRACT_SCHEMA } },
        system: EXTRACT_SYSTEM,
        messages: [{ role: 'user', content }],
      });
      if (response.stop_reason === 'refusal') throw new Error('refused');
      const block = response.content.find((b) => b.type === 'text');
      const parsed = JSON.parse(block.text);
      const fields = FIELD_KEYS.map((k) => parsed.fields.find((f) => f.key === k) || { key: k, value: '', quote: '' });
      return markQuotes({ ...parsed, fields, mode: 'ai', model: response.model }, text);
    } catch (err) {
      console.warn('[ai] extraction failed, using offline path:', err?.message || err);
    }
  }
  if (isSample(text)) return markQuotes({ ...structuredClone(SAMPLE_EXTRACTION[lang]), mode: 'pregenerated' }, text);
  if (!text) {
    const e = new Error(lang === 'zh' ? '离线模式只能读取文字。请粘贴出院小结的文字，或使用示例出院小结。' : 'Offline mode reads text only. Paste the discharge summary text, or use the sample.');
    e.status = 422;
    throw e;
  }
  return markQuotes(offlineExtract(text, lang), text);
}

// Rule-based fallback: picks the sentence that mentions each field. Crude by design; the user confirms every field.
function offlineExtract(text, lang) {
  const sentences = text.split(/(?<=[。；;\n]|\.\s)/).map((s) => s.trim()).filter(Boolean);
  const find = (words) => sentences.find((s) => words.some((w) => s.toLowerCase().includes(w.toLowerCase()))) || '';
  const pick = {
    amputation: find(['截肢', 'amputation']),
    wound: find(['换药', '伤口护理', 'dressing', 'wound care']),
    activity: find(['负重', '活动限制', 'weight bearing', 'activity']),
    followUp: find(['复诊', '随访', 'follow-up', 'clinic']),
    redFlags: find(['立即就诊', '立即', 'seek care', 'immediately']),
  };
  // Only common, explicit patient labels; relatives and prose do not supply demographics.
  const relative = /^(?:家属|女儿|儿子|配偶|父亲|母亲|家族史|family\b|daughter\b|son\b|wife\b|husband\b|mother\b|father\b|caregiver\b|next of kin\b)/i;
  const patientLines = text.split(/\r?\n/).map((s) => s.trim()).filter((s) => !relative.test(s));
  const labels = '姓名|性别|年龄|入院日期|手术日期|出院日期|Name|Sex|Gender|Age|Admitted|Surgery(?: Date)?|Operation Date|Date of Surgery|Discharged|Discharge Date|Date of Discharge';
  const nextLabel = new RegExp(`\\s+(?=(?:(?:患者|病人)\\s*|Patient(?:'s)?\\s+)?(?:${labels})\\s*[:：])`, 'i');
  const labeled = (label) => {
    const re = new RegExp(`(?:^|[\\s,，;；])(?:(?:患者|病人)\\s*|Patient(?:'s)?\\s+)?(?:${label})\\s*[:：]\\s*([^\\r\\n,，;；]+)`, 'i');
    for (const line of patientLines) {
      const match = line.match(re);
      if (match) return match[1].split(nextLabel)[0].trim().replace(/[。.]+$/, '');
    }
    return '';
  };
  const sex = labeled('性别|Sex|Gender');
  const age = labeled('年龄|Age').match(/^(\d{1,3})(?:\s*(?:岁|years?(?:\s+old)?|y\/o))?$/i);
  const date = (label) => {
    const value = labeled(label);
    let parts = value.match(/^(\d{4})(?:年(\d{1,2})月(\d{1,2})日|[-/.](\d{1,2})[-/.](\d{1,2}))(?:$|\s)/);
    let y, m, d;
    if (parts) {
      [y, m, d] = [Number(parts[1]), Number(parts[2] || parts[4]), Number(parts[3] || parts[5])];
    } else {
      parts = value.match(/^(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})(?:$|\s)/i);
      if (!parts) return '';
      y = Number(parts[3]);
      m = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(parts[2].slice(0, 3).toLowerCase()) + 1;
      d = Number(parts[1]);
    }
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return '';
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  // The existing boolean cannot represent unknown: true requires an affirmative history/diagnosis.
  const diabetes = sentences.flatMap((s) => s.split(/[，,]/)).some((s) => {
    if (!/糖尿病|\bdiabet(?:es|ic)\b/i.test(s)) return false;
    if (/家族史|家属|女儿|儿子|配偶|父亲|母亲|\b(?:family|daughter|son|wife|husband|mother|father|caregiver)\b/i.test(s)) return false;
    if (/(?:无|没有|否认|未患|未确诊|排除)[^。；;，,\n]{0,12}糖尿病|糖尿病[^。；;，,\n]{0,8}(?:否认|不详|未知|待查|待排)|疑似|可能|\b(?:no|not|without|denies|denied|negative for|unknown|uncertain|possible|suspected|rule out)\b|\bdiabetes(?: mellitus)?\s*[:：]?\s*(?:negative|absent)\b/i.test(s)) return false;
    return /(?:患有?|确诊|诊断为|合并|有)[12一二２型\s]*糖尿病|糖尿病(?:史)?\s*[:：]\s*(?:有|是|阳性)|(?:既往史|诊断)\s*[:：][^。；;，,\n]*糖尿病|\b(?:has|have|diagnosed with|history of|known)\s+(?:type\s*[12]\s+)?diabetes\b|\b(?:is|was)\s+diabetic\b|\bdiabetes(?: mellitus)?\s*[:：]\s*(?:yes|positive|present)\b|\b(?:medical history|diagnosis|history)\s*[:：][^。；;，,\n]*\bdiabet(?:es|ic)\b/i.test(s);
  });
  return {
    name: labeled('姓名|Name'),
    age: age ? Number(age[1]) : null,
    sex: /^(?:女|女性|female|f)(?:$|[\s（(])/i.test(sex) ? 'female' : /^(?:男|男性|male|m)(?:$|[\s（(])/i.test(sex) ? 'male' : 'unknown',
    side: /右|right/i.test(pick.amputation) ? 'right' : /左|left/i.test(pick.amputation) ? 'left' : 'unknown',
    level: /膝下|胫骨|below|transtibial/i.test(pick.amputation) ? 'below' : /膝上|股骨|above|transfemoral/i.test(pick.amputation) ? 'above' : 'unknown',
    diabetes,
    surgeryDate: date('手术日期|Surgery(?: Date)?|Operation Date|Date of Surgery'),
    dischargeDate: date('出院日期|Discharged|Discharge Date|Date of Discharge'),
    fields: FIELD_KEYS.map((k) => ({ key: k, value: pick[k], quote: pick[k] })),
    mode: 'offline',
  };
}

const NOTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['signals', 'summary'],
  properties: {
    signals: { type: 'array', items: { type: 'string', enum: ['wound', 'fever', 'pain', 'fall', 'soundFoot', 'chest', 'crisis'] } },
    summary: { type: 'string' },
  },
};

const NOTE_SYSTEM = `A person recovering from a lower-limb amputation, or their family member, wrote a short daily note. Map what they describe to these signal ids only when the note actually describes it:
wound = wound red, swollen, leaking or smelly; fever = fever or temperature 38°C+; pain = severe or sharply worse pain; fall = a fall; soundFoot = sore, blister or dark skin on the other foot; chest = chest pain, breathlessness, swollen painful calf; crisis = any thought of self-harm or not wanting to live.
summary: one neutral sentence restating the note in the note's language. Do not give advice or reassurance.`;

export async function parseNote(note, { offline = false } = {}) {
  const found = new Set(keywordSignals(note));
  let summary = '';
  let mode = 'rules';
  const client = offline ? null : await getClient();
  if (client && note && note.trim()) {
    try {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 1000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: NOTE_SCHEMA } },
        system: NOTE_SYSTEM,
        messages: [{ role: 'user', content: note }],
      });
      if (response.stop_reason !== 'refusal') {
        const parsed = JSON.parse(response.content.find((b) => b.type === 'text').text);
        parsed.signals.forEach((s) => found.add(s));
        summary = parsed.summary;
        mode = 'ai+rules';
      }
    } catch (err) {
      console.warn('[ai] note parsing failed, rules only:', err?.message || err);
    }
  }
  return { signals: [...found], summary, mode };
}

// Safety net: always runs, whether or not the model is available.
export function keywordSignals(note) {
  if (!note) return [];
  return Object.entries(SIGNAL_PATTERNS)
    .filter(([, patterns]) => patterns.some((re) => re.test(note)))
    .map(([id]) => id);
}

const LISTEN_SYSTEM = `You reply to someone a few days home after a lower-limb amputation who just wants to talk. Reply in the same language as their message, in at most two short sentences.
Reflect back what they said and how it seems to feel, in plain words. Do not give advice, medical information, reassurance about their body, or promises. Do not call this therapy. End by saying this stays private unless they choose to share it with their rehab team.`;

// Optional reflective listening for the "I just want to talk" door. Returns {zh,en} or null (offline).
export async function listen(text, { offline = false } = {}) {
  const client = offline ? null : await getClient();
  if (!client || !text || !text.trim()) return null;
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 600,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: LISTEN_SYSTEM,
      messages: [{ role: 'user', content: text }],
    });
    if (response.stop_reason === 'refusal') return null;
    const out = response.content.find((b) => b.type === 'text')?.text?.trim();
    return out ? { zh: out, en: out } : null;
  } catch (err) {
    console.warn('[ai] listen failed, using template:', err?.message || err);
    return null;
  }
}
