// Server-only, optional conversational provider. No browser receives credentials.
// API contract verified against https://api-docs.deepseek.com/ and
// https://api-docs.deepseek.com/api/create-chat-completion/ (2026-11-09).

function settings(env) {
  const key = typeof env.DEEPSEEK_API_KEY === 'string' ? env.DEEPSEEK_API_KEY.trim() : '';
  const model = env.DEEPSEEK_MODEL || 'deepseek-flash';
  let endpoint;
  try {
    const url = new URL(env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) throw new Error('invalid URL');
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/chat/completions`;
    url.search = ''; url.hash = '';
    endpoint = url.href;
  } catch { endpoint = null; }
  const requested = Number(env.DEEPSEEK_TIMEOUT_MS || env.DEEPSEEK_TIMEOUT || 8000);
  const timeoutMs = Number.isFinite(requested) ? Math.max(50, Math.min(30000, requested)) : 8000;
  return { key, model, endpoint, timeoutMs, disabled: env.RESTART90_OFFLINE === '1' };
}

export function ririProviderStatus(env = process.env) {
  const c = settings(env);
  const enabled = !!c.key && !!c.endpoint && !c.disabled;
  // "configured" is not a claim that a network connection has been tested.
  return {
    name: 'deepseek', enabled, configured: !!c.key,
    mode: enabled ? 'ai' : 'demo', status: enabled ? 'configured' : 'offline',
    ...(enabled ? { model: c.model } : {}),
  };
}

function failure(code, retryable = false) {
  const e = new Error(code);
  e.retryable = retryable;
  return e;
}

// A timer covers fetching AND decoding the response. Promise.race also bounds a
// misbehaving upstream/test stub that ignores AbortSignal. At most two attempts.
async function attempt(c, messages, fetchImpl) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(c.endpoint, {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
          body: JSON.stringify({
            model: c.model, messages, stream: false, max_tokens: 800,
            temperature: 0.4, thinking: { type: 'disabled' },
            response_format: { type: 'json_object' },
          }),
        });
        if (!response.ok) throw failure('provider_http_error', response.status === 429 || response.status >= 500);
        const data = await response.json();
        const choice = data?.choices?.[0];
        if (choice?.finish_reason !== 'stop' || choice?.message?.tool_calls?.length) throw failure('provider_incomplete');
        const raw = choice?.message?.content;
        if (typeof raw !== 'string' || raw.length > 6000) throw failure('provider_invalid_response');
        let reply;
        try { reply = JSON.parse(raw); } catch { throw failure('provider_invalid_json'); }
        if (typeof reply?.zh !== 'string' || typeof reply?.en !== 'string' || !reply.zh.trim() || !reply.en.trim()
          || reply.zh.length > 1800 || reply.en.length > 2200) throw failure('provider_invalid_reply');
        // Ignore all other JSON fields: the model cannot create actions/signals.
        return { reply: { zh: reply.zh.trim(), en: reply.en.trim() }, model: typeof data.model === 'string' ? data.model.slice(0, 100) : c.model };
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(failure('provider_timeout', true)); }, c.timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error?.retryable !== undefined) throw error;
    throw failure('provider_network_error', true);
  } finally { clearTimeout(timer); }
}

export async function completeRiri(messages, { env = process.env, fetchImpl = globalThis.fetch, offline = false } = {}) {
  const c = settings(env);
  if (offline || c.disabled || !c.key || !c.endpoint || typeof fetchImpl !== 'function') return null;
  for (let i = 0; i < 2; i++) {
    try { return await attempt(c, messages, fetchImpl); }
    catch (error) {
      // No provider error body, request text or credentials are logged/returned.
      if (!error.retryable || i === 1) return null;
    }
  }
  return null;
}
