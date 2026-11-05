// AI layer: understands documents and what people say. It never decides medical thresholds —
// those live in content.js SIGNALS and engine.js. Everything here has an offline path so the demo never breaks.

import { SAMPLE_DISCHARGE, SAMPLE_EXTRACTION } from './samples.js';
import { SIGNAL_PATTERNS } from './content.js';

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
  return { enabled: !!(await getClient()), model: MODEL };
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
  const lower = text.toLowerCase();
  return {
    name: (text.match(/姓名[:：]\s*(\S+)/) || text.match(/Name:\s*([A-Za-z ]+?)\s{2,}/) || [])[1] || '',
    age: Number((text.match(/年龄[:：]\s*(\d+)/) || text.match(/Age:\s*(\d+)/) || [])[1]) || null,
    sex: /男|male/i.test(text) ? (/female|女/i.test(text) ? 'female' : 'male') : 'unknown',
    side: /右|right/i.test(pick.amputation) ? 'right' : /左|left/i.test(pick.amputation) ? 'left' : 'unknown',
    level: /膝下|胫骨|below|transtibial/i.test(pick.amputation) ? 'below' : /膝上|股骨|above|transfemoral/i.test(pick.amputation) ? 'above' : 'unknown',
    diabetes: lower.includes('糖尿病') || lower.includes('diabet'),
    surgeryDate: '', dischargeDate: '',
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
