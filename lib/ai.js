// api/ai.js — NEXUS AI Proxy (SECURE v4)
// Security fixes:
//   • Rate limiting per-user + per-IP (prevent API credit abuse)
//   • Input size limits (prevent oversized payloads)
//   • Provider key presence checked before forwarding
//   • System prompt length capped (prevent prompt injection amplification)
//   • Error messages sanitized (no internal key/config leakage)
//   • model string sanitized (prevent path traversal in model names)

import crypto from 'crypto';

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const _rl = new Map();
function checkRateLimit(key, maxPerMin = 30) {
  const now = Date.now();
  const k = String(key || 'anon').substring(0, 128);
  if (!_rl.has(k)) _rl.set(k, { count: 0, reset: now + 60_000 });
  const r = _rl.get(k);
  if (now > r.reset) { r.count = 0; r.reset = now + 60_000; }
  return ++r.count <= maxPerMin;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rl) if (now > v.reset + 120_000) _rl.delete(k);
}, 5 * 60_000).unref?.();

// ─── INPUT SANITIZERS ────────────────────────────────────────────────────────
const MAX_MESSAGES        = 100;
const MAX_MSG_CONTENT_LEN = 32_000;  // chars per message
const MAX_SYSTEM_LEN      = 8_000;   // system prompt cap
const MAX_TOTAL_CHARS     = 200_000; // total request payload

// Safe model name: only alphanumeric, dash, dot, slash, colon, underscore
function sanitizeModelName(model) {
  return String(model || '')
    .replace(/[^a-zA-Z0-9\-._/:@]/g, '')
    .substring(0, 120);
}

function sanitizeProvider(provider) {
  return String(provider || '').replace(/[^a-z]/g, '').substring(0, 20);
}

// Trim message content to prevent oversized payloads
function trimContent(content) {
  if (typeof content === 'string') {
    return content.substring(0, MAX_MSG_CONTENT_LEN);
  }
  if (Array.isArray(content)) {
    return content.slice(0, 20).map(c => {
      if (!c || typeof c !== 'object') return null;
      if (c.type === 'text') return { ...c, text: String(c.text || '').substring(0, MAX_MSG_CONTENT_LEN) };
      if (c.type === 'image' || c.type === 'inline_data' || c.type === 'document') return c;
      return null;
    }).filter(Boolean);
  }
  return String(content || '').substring(0, MAX_MSG_CONTENT_LEN);
}

// ─── MESSAGE NORMALIZER ───────────────────────────────────────────────────────
function normalizeMessages(msgs, provider) {
  if (!Array.isArray(msgs)) return [];
  const normalized = [];
  let totalChars = 0;

  for (const m of msgs) {
    if (!m || !m.role) continue;
    const msg = { ...m };
    let role = msg.role;

    if (provider === 'gemini') {
      if (['assistant','ai','agent','model'].includes(role)) role = 'model';
      else role = 'user';
    } else {
      if (['assistant','ai','agent','model'].includes(role)) role = 'assistant';
      else if (role === 'system') role = 'system';
      else role = 'user';
    }

    msg.content = trimContent(msg.content);
    const contentLen = typeof msg.content === 'string'
      ? msg.content.length
      : JSON.stringify(msg.content).length;

    // Hard cap on total payload to prevent DoS
    if (totalChars + contentLen > MAX_TOTAL_CHARS) break;
    totalChars += contentLen;

    if (Array.isArray(msg.content)) {
      msg.content = msg.content.filter(c => c && (
        c.type === 'text' || c.type === 'image' ||
        c.type === 'document' || c.type === 'inline_data'
      ));
      if (msg.content.length === 0) continue;
    } else {
      msg.content = String(msg.content || '');
      if (!msg.content.trim()) continue;
    }

    msg.role = role;
    normalized.push(msg);
  }

  // Gemini: no consecutive same-role messages
  if (provider === 'gemini') {
    const deduped = [];
    for (const msg of normalized) {
      if (deduped.length > 0 && deduped[deduped.length - 1].role === msg.role) {
        const prev = deduped[deduped.length - 1];
        if (typeof prev.content === 'string' && typeof msg.content === 'string') {
          prev.content += '\n' + msg.content;
        }
      } else {
        deduped.push(msg);
      }
    }
    return deduped;
  }

  return normalized;
}

// ─── FETCH UTILITIES ──────────────────────────────────────────────────────────
async function fetchWithRetry(url, options, retries = 2, timeoutMs = 120_000) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal
          ? createMergedSignal(options.signal, controller.signal)
          : controller.signal,
      });
      clearTimeout(timeout);
      return response;
    } catch (e) {
      clearTimeout(timeout);
      lastError = e;
      if (e.name === 'AbortError') throw e;
      if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError || new Error('Request failed after retries');
}

function createMergedSignal(s1, s2) {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  s1.addEventListener('abort', abort);
  s2.addEventListener('abort', abort);
  return ctrl.signal;
}

async function parseApiError(response, providerName) {
  let errMsg = `${providerName} error ${response.status}`;
  try {
    const errData = await response.json();
    if (errData?.error?.message) errMsg = errData.error.message;
    else if (errData?.message) errMsg = errData.message;
    else if (typeof errData?.error === 'string') errMsg = errData.error;
    return { message: errMsg, status: response.status, data: errData };
  } catch (_) {
    return { message: errMsg, status: response.status, data: null };
  }
}

// Sanitize error message before returning to client (hide internal details)
function safeErrMsg(msg) {
  if (!msg) return 'Unknown error';
  // Strip anything that looks like an API key
  return String(msg)
    .replace(/sk-[a-zA-Z0-9]{10,}/g, '[REDACTED]')
    .replace(/AIza[a-zA-Z0-9_\-]{30,}/g, '[REDACTED]')
    .substring(0, 300);
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id, X-Username');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const ip       = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const userId   = req.headers['x-user-id'] || '';  // optional: sent by frontend
  const username = req.headers['x-username'] || '';

  // IP-level: 60/min (prevents unauthenticated abuse)
  if (!checkRateLimit(`ai_ip:${ip}`, 60)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Coba lagi dalam 1 menit.' });
  }
  // Per-user: 40/min if user identified
  if (userId && !checkRateLimit(`ai_user:${userId}`, 40)) {
    return res.status(429).json({ error: 'Rate limit per user exceeded. Coba lagi sebentar.' });
  }

  // ── Parse & validate body ─────────────────────────────────────────────────
  let body;
  try {
    body = req.body || {};
  } catch (_) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const provider   = sanitizeProvider(body.provider);
  const model      = sanitizeModelName(body.model);
  const system     = body.system ? String(body.system).substring(0, MAX_SYSTEM_LEN) : undefined;
  const max_tokens = Math.min(Math.max(parseInt(body.max_tokens) || 1000, 1), 64000);

  if (!provider || !model) {
    return res.status(400).json({ error: 'provider dan model wajib diisi.' });
  }

  // Whitelist providers to prevent arbitrary forwarding
  const VALID_PROVIDERS = new Set(['gemini','claude','openai','openrouter','deepseek','groq','mistral','stepfun']);
  if (!VALID_PROVIDERS.has(provider)) {
    return res.status(400).json({
      error: `Provider tidak dikenal: "${provider}". Supported: ${[...VALID_PROVIDERS].join(', ')}`,
    });
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: 'messages array wajib diisi dan tidak boleh kosong.' });
  }

  // Cap number of messages
  const rawMessages = body.messages.slice(0, MAX_MESSAGES);

  try {

    // ══════════════════════════════════════════════════════════════════
    // 1. GEMINI
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'gemini') {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return res.status(503).json({ error: 'Gemini tidak tersedia saat ini.' });

      const modelChain = [...new Set([model, 'gemini-2.5-flash-lite', 'gemini-2.0-flash'])];
      const normalized = normalizeMessages(rawMessages, 'gemini');

      const contents = normalized.map(m => {
        if (Array.isArray(m.content)) {
          const parts = m.content.map(c => {
            if (c.type === 'image' && c.source) {
              return { inline_data: { mime_type: c.source.media_type || 'image/png', data: c.source.data || '' } };
            }
            return { text: String(c.text || c.content || '').substring(0, MAX_MSG_CONTENT_LEN) };
          });
          return { role: m.role, parts };
        }
        return { role: m.role, parts: [{ text: String(m.content || '') }] };
      });

      const geminiBody = {
        contents,
        generationConfig: { maxOutputTokens: Math.min(max_tokens, 65536), temperature: 0.7 },
      };
      if (system) geminiBody.systemInstruction = { parts: [{ text: system }] };

      let lastError = null;
      for (const tryModel of modelChain) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(tryModel)}:generateContent?key=${key}`;
          const r = await fetchWithRetry(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody),
          });

          if (!r.ok) {
            const err = await parseApiError(r, 'Gemini');
            lastError = err.message;
            if ([503, 429].includes(err.status) || /overloaded|quota|RESOURCE_EXHAUSTED|UNAVAILABLE/.test(err.message)) continue;
            return res.status(err.status || 500).json({ error: safeErrMsg(err.message) });
          }

          const data = await r.json();
          const candidate = data?.candidates?.[0];
          const text = candidate?.content?.parts?.map(p => p.text || '').join('') || '';

          if (!text) {
            const reason = candidate?.finishReason;
            if (reason === 'SAFETY') return res.status(400).json({ error: 'Respons diblokir oleh filter keamanan. Coba rumuskan ulang pertanyaanmu.' });
            lastError = `Empty response from ${tryModel}`;
            continue;
          }
          return res.status(200).json({ content: text, model_used: tryModel });
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          lastError = e.message;
          continue;
        }
      }

      return res.status(503).json({ error: 'Gemini sedang kelebihan beban. Coba model lain.', overloaded: true, suggestion: 'Coba StepFun atau Groq.' });
    }

    // ══════════════════════════════════════════════════════════════════
    // 2. CLAUDE
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'claude') {
      const key = process.env.CLAUDE_API_KEY;
      if (!key) return res.status(503).json({ error: 'Claude tidak tersedia saat ini.' });

      const normalized = normalizeMessages(rawMessages, 'claude');
      // Strip 'anthropic/' prefix and validate model name
      const cleanModel = model.replace(/^anthropic\//i, '').trim();
      if (!cleanModel) return res.status(400).json({ error: 'Model Claude tidak valid.' });

      const r = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: cleanModel,
          max_tokens: Math.min(max_tokens, 64000),
          system: system || undefined,
          messages: normalized,
        }),
      });

      if (!r.ok) {
        const err = await parseApiError(r, 'Claude');
        return res.status(err.status || 500).json({ error: safeErrMsg(err.message) });
      }

      const d = await r.json();
      const text = d.content?.find(c => c.type === 'text')?.text || '';
      if (!text) return res.status(500).json({ error: 'Respons kosong dari Claude.' });
      return res.status(200).json({ content: text });
    }

    // ══════════════════════════════════════════════════════════════════
    // 3. OPENAI
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return res.status(503).json({ error: 'OpenAI tidak tersedia saat ini.' });

      const normalized = normalizeMessages(rawMessages, 'openai');
      const allMsgs = system ? [{ role: 'system', content: system }, ...normalized] : normalized;

      const r = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages: allMsgs, max_tokens: Math.min(max_tokens, 128000) }),
      });

      if (!r.ok) {
        const err = await parseApiError(r, 'OpenAI');
        if (err.status === 429) return res.status(429).json({ error: 'OpenAI rate limit. Coba lagi sebentar.' });
        if (err.status === 402 || err.message.includes('insufficient_quota')) return res.status(402).json({ error: 'Kuota OpenAI habis.' });
        return res.status(err.status || 500).json({ error: safeErrMsg(err.message) });
      }

      const d = await r.json();
      const text = d?.choices?.[0]?.message?.content;
      if (!text) return res.status(500).json({ error: 'Respons kosong dari OpenAI.' });
      return res.status(200).json({ content: text });
    }

    // ══════════════════════════════════════════════════════════════════
    // 4. OPENROUTER
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'openrouter') {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) return res.status(503).json({ error: 'OpenRouter tidak tersedia saat ini.' });

      const normalized = normalizeMessages(rawMessages, 'openrouter');
      const allMsgs = system ? [{ role: 'system', content: system }, ...normalized] : normalized;

      const r = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': 'https://nexusai-roblox.vercel.app',
          'X-Title': 'NEXUS AI',
        },
        body: JSON.stringify({ model, messages: allMsgs, max_tokens: Math.min(max_tokens, 200000), temperature: 0.7 }),
      });

      if (!r.ok) {
        const err = await parseApiError(r, 'OpenRouter');
        if (err.status === 402 || err.message.toLowerCase().includes('insufficient balance')) return res.status(402).json({ error: 'Saldo OpenRouter habis.' });
        if (err.status === 429) return res.status(429).json({ error: 'OpenRouter rate limit. Coba lagi.' });
        return res.status(err.status || 500).json({ error: safeErrMsg(err.message) });
      }

      const d = await r.json();
      const text = d?.choices?.[0]?.message?.content;
      if (!text) return res.status(500).json({ error: d?.error ? safeErrMsg(d.error.message || JSON.stringify(d.error)) : 'Respons kosong dari OpenRouter.' });
      return res.status(200).json({ content: text });
    }

    // ══════════════════════════════════════════════════════════════════
    // 5. DEEPSEEK
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'deepseek') {
      const key = process.env.DEEPSEEK_API_KEY;
      if (!key) return res.status(503).json({ error: 'DeepSeek tidak tersedia saat ini.' });

      const normalized = normalizeMessages(rawMessages, 'deepseek');
      const allMsgs = system ? [{ role: 'system', content: system }, ...normalized] : normalized;

      const r = await fetchWithRetry('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages: allMsgs, max_tokens: Math.min(max_tokens, 65536), temperature: 0.7 }),
      });

      if (!r.ok) {
        const err = await parseApiError(r, 'DeepSeek');
        if (err.status === 402 || err.message.toLowerCase().includes('insufficient')) return res.status(402).json({ error: 'Saldo DeepSeek habis.' });
        return res.status(err.status || 500).json({ error: safeErrMsg(err.message) });
      }

      const d = await r.json();
      const choice = d?.choices?.[0];
      if (!choice) return res.status(500).json({ error: 'Respons kosong dari DeepSeek.' });

      const content   = choice.message?.content || '';
      const reasoning = choice.message?.reasoning_content || '';
      let finalContent = '';
      if (reasoning) finalContent += '🧠 **Reasoning (DeepSeek R1):**\n' + reasoning + '\n\n---\n\n';
      finalContent += content;

      if (!finalContent.trim()) return res.status(500).json({ error: 'Respons kosong dari DeepSeek.' });
      return res.status(200).json({ content: finalContent, reasoning: reasoning || undefined });
    }

    // ══════════════════════════════════════════════════════════════════
    // 6. GROQ
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'groq') {
      const key = process.env.GROQ_API_KEY;
      if (!key) return res.status(503).json({ error: 'Groq tidak tersedia saat ini.' });

      const normalized = normalizeMessages(rawMessages, 'groq');
      const allMsgs = system ? [{ role: 'system', content: system }, ...normalized] : normalized;

      const groqMaxTokens = {
        'llama-3.1-8b-instant':  8192,
        'llama-3.3-70b-versatile': 32768,
        'openai/gpt-oss-120b':   16384,
      };
      const modelMax = groqMaxTokens[model] || 8192;

      const r = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages: allMsgs, max_completion_tokens: Math.min(max_tokens, modelMax), temperature: 0.7 }),
      });

      if (!r.ok) {
        const err = await parseApiError(r, 'Groq');
        if (err.status === 429) return res.status(429).json({ error: 'Groq rate limit. Coba lagi sebentar.' });
        if (err.status === 413 || err.message.includes('context_length_exceeded')) return res.status(413).json({ error: 'Pesan terlalu panjang untuk Groq. Mulai chat baru.' });
        return res.status(err.status || 500).json({ error: safeErrMsg(err.message) });
      }

      const d = await r.json();
      const text = d?.choices?.[0]?.message?.content;
      if (!text) return res.status(500).json({ error: 'Respons kosong dari Groq.' });
      return res.status(200).json({ content: text });
    }

    // ══════════════════════════════════════════════════════════════════
    // 7. MISTRAL
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'mistral') {
      const key = process.env.MISTRAL_API_KEY;
      if (!key) return res.status(503).json({ error: 'Mistral tidak tersedia saat ini.' });

      const normalized = normalizeMessages(rawMessages, 'mistral');
      const allMsgs = system ? [{ role: 'system', content: system }, ...normalized] : normalized;

      const r = await fetchWithRetry('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages: allMsgs, max_tokens: Math.min(max_tokens, 65536), temperature: 0.7 }),
      });

      if (!r.ok) {
        const err = await parseApiError(r, 'Mistral');
        if (err.status === 429) return res.status(429).json({ error: 'Mistral rate limit. Coba lagi.' });
        if (err.status === 402) return res.status(402).json({ error: 'Kuota Mistral habis.' });
        return res.status(err.status || 500).json({ error: safeErrMsg(err.message) });
      }

      const d = await r.json();
      const text = d?.choices?.[0]?.message?.content;
      if (!text) return res.status(500).json({ error: 'Respons kosong dari Mistral.' });
      return res.status(200).json({ content: text });
    }

    // ══════════════════════════════════════════════════════════════════
    // 8. STEPFUN
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'stepfun') {
      const key = process.env.STEPFUN_API_KEY;
      if (!key) return res.status(503).json({ error: 'StepFun tidak tersedia. Tambahkan STEPFUN_API_KEY ke Environment Variables Vercel.' });

      const normalized = normalizeMessages(rawMessages, 'stepfun');
      const allMsgs = system ? [{ role: 'system', content: system }, ...normalized] : normalized;

      const stepfunFallback = {
        'step-1-8k': 'step-1-8k', 'step-1-32k': 'step-1-8k',
        'step-1-128k': 'step-1-32k', 'step-1-256k': 'step-1-128k',
        'step-2-16k': 'step-1-32k', 'step-1o-mini': 'step-1-8k',
        'step-1o-turbo': 'step-1-32k', 'step-2-turbo': 'step-2-16k',
        'step-3-5-flash': 'step-1-32k',
      };
      const stepfunMaxTokens = {
        'step-1-8k': 8192, 'step-1-32k': 16384, 'step-1-128k': 32768,
        'step-1-256k': 32768, 'step-2-16k': 16384, 'step-1o-mini': 8192,
        'step-1o-turbo': 16384, 'step-2-turbo': 16384, 'step-3-5-flash': 16384,
      };

      const primaryFallback = stepfunFallback[model] || 'step-1-8k';
      const modelChain = [...new Set([model, primaryFallback, 'step-1-8k'])];

      let lastError = null;
      for (const tryModel of modelChain) {
        const maxTok = stepfunMaxTokens[tryModel] || 8192;
        try {
          const r = await fetchWithRetry('https://api.stepfun.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ model: tryModel, messages: allMsgs, max_tokens: Math.min(max_tokens, maxTok), temperature: 0.7 }),
          });

          if (!r.ok) {
            const err = await parseApiError(r, 'StepFun');
            lastError = err.message;
            if (err.status === 401) return res.status(401).json({ error: 'StepFun: API key tidak valid. Cek STEPFUN_API_KEY di Vercel.' });
            if (err.status === 404 || /model|not found/i.test(err.message)) continue;
            if (err.status === 429) return res.status(429).json({ error: 'StepFun rate limit.' });
            if (err.status === 402 || /insufficient|balance/i.test(err.message)) return res.status(402).json({ error: 'Kuota StepFun habis.' });
            if (err.status === 503 || err.status === 529 || /overload/i.test(err.message)) continue;
            return res.status(err.status || 500).json({ error: safeErrMsg(err.message) });
          }

          const d = await r.json();
          const text = d?.choices?.[0]?.message?.content;
          if (!text) { lastError = `Empty response from ${tryModel}`; continue; }
          return res.status(200).json({ content: text, model_used: tryModel });
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          lastError = e.message;
          continue;
        }
      }

      return res.status(503).json({ error: 'StepFun tidak tersedia. ' + safeErrMsg(lastError || ''), suggestion: 'Coba Gemini atau Groq.' });
    }

    // Unknown provider (shouldn't reach here due to whitelist above)
    return res.status(400).json({ error: `Provider tidak dikenal: "${provider}".` });

  } catch (e) {
    if (e.name === 'AbortError') return res.status(408).json({ error: 'Request timeout. Coba lagi.' });
    console.error('NEXUS AI Proxy Error:', e.message);
    return res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
}