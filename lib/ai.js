// lib/ai.js — NEXUS AI Core Handler (FIXED v6)
// Fixes from v5:
//   • Refactored ke processAIRequest() — tidak ada req/res dependency (App Router compatible)
//   • Default export handler() tetap ada untuk Pages Router backward compatibility
//   • setInterval cleanup dibungkus try/catch (aman untuk Edge runtime)
//   • fetchWithTimeout tidak pakai mergeSignals (lebih simple & robust)
//   • Semua path dijamin return value — tidak ada unhandled code path
//   • CORS TIDAK diset di sini — hanya di route.js (tidak duplikat)
//   • Timeout dipisah: AI call 45s, bukan hardcode global
//   • Error messages lebih jelas dan konsisten
//   • Validasi body.messages[].role lebih ketat

import crypto from 'crypto';

// ─── RATE LIMITING (in-memory, per instance) ─────────────────────────────────
const _rl = new Map();

function checkRateLimit(key, maxPerMin = 30) {
  const now = Date.now();
  const k   = String(key || 'anon').substring(0, 128);
  if (!_rl.has(k)) _rl.set(k, { count: 0, reset: now + 60_000 });
  const r = _rl.get(k);
  if (now > r.reset) { r.count = 0; r.reset = now + 60_000; }
  return ++r.count <= maxPerMin;
}

// Cleanup expired rate limit entries (safe wrapper for serverless)
try {
  const _cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _rl) {
      if (now > v.reset + 120_000) _rl.delete(k);
    }
  }, 5 * 60_000);
  if (typeof _cleanupInterval?.unref === 'function') _cleanupInterval.unref();
} catch (_) { /* Edge runtime — skip interval */ }

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MAX_MESSAGES        = 100;
const MAX_MSG_CONTENT_LEN = 32_000;
const MAX_SYSTEM_LEN      = 8_000;
const MAX_TOTAL_CHARS     = 200_000;

// Timeout untuk AI call. Vercel Pro = 60s max, kita pakai 45s.
// Vercel Hobby = 10s max → AI call AKAN timeout. Upgrade ke Pro.
const REQUEST_TIMEOUT_MS = 45_000;

const VALID_PROVIDERS = new Set([
  'gemini', 'claude', 'openai', 'openrouter',
  'deepseek', 'groq', 'mistral', 'stepfun',
]);

// ─── SANITIZERS ───────────────────────────────────────────────────────────────
function sanitizeProvider(provider) {
  return String(provider || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, '')
    .substring(0, 30);
}

function sanitizeModelName(model) {
  return String(model || '')
    .replace(/[^a-zA-Z0-9\-._/:@]/g, '')
    .substring(0, 120);
}

function trimContent(content, maxLen = MAX_MSG_CONTENT_LEN) {
  if (typeof content === 'string') return content.substring(0, maxLen);
  if (Array.isArray(content)) {
    return content
      .slice(0, 20)
      .map(c => {
        if (!c || typeof c !== 'object') return null;
        switch (c.type) {
          case 'text':
            return { ...c, text: String(c.text || '').substring(0, maxLen) };
          case 'image':
          case 'image_url':
          case 'inline_data':
          case 'document':
            return c;
          default:
            return null;
        }
      })
      .filter(Boolean);
  }
  return String(content || '').substring(0, maxLen);
}

function flattenContentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(c => c && (c.type === 'text' || typeof c.text === 'string'))
      .map(c => String(c.text || ''))
      .join('\n')
      .trim();
  }
  return String(content || '');
}

function safeErrMsg(msg) {
  if (!msg) return 'Unknown error';
  return String(msg)
    .replace(/sk-[a-zA-Z0-9_\-]{10,}/g, '[REDACTED]')
    .replace(/AIza[a-zA-Z0-9_\-]{30,}/g, '[REDACTED]')
    .replace(/Bearer [a-zA-Z0-9_\-\.]{20,}/g, 'Bearer [REDACTED]')
    .substring(0, 400);
}

// ─── MESSAGE NORMALIZER ───────────────────────────────────────────────────────
function normalizeMessages(msgs, provider, supportsMultimodal = false) {
  if (!Array.isArray(msgs) || msgs.length === 0) return [];

  const normalized = [];
  let totalChars   = 0;
  const isGemini   = provider === 'gemini';

  for (const m of msgs) {
    if (!m || typeof m !== 'object' || !m.role) continue;

    const rawRole = String(m.role).toLowerCase();
    let role;

    if (['assistant', 'ai', 'agent', 'model'].includes(rawRole)) {
      role = isGemini ? 'model' : 'assistant';
    } else if (rawRole === 'system') {
      if (isGemini) continue; // Gemini system → systemInstruction
      role = 'system';
    } else {
      role = isGemini ? 'user' : 'user';
    }

    let content = trimContent(m.content);
    const contentLen = typeof content === 'string'
      ? content.length
      : JSON.stringify(content).length;
    if (totalChars + contentLen > MAX_TOTAL_CHARS) break;
    totalChars += contentLen;

    // Flatten array content untuk provider yang tidak support multimodal
    if (!supportsMultimodal && !isGemini && Array.isArray(content)) {
      content = flattenContentToText(content);
    }

    // Skip pesan kosong
    if (Array.isArray(content)) {
      const filtered = content.filter(c => {
        if (!c) return false;
        if (c.type === 'text') return String(c.text || '').trim().length > 0;
        return ['image', 'image_url', 'inline_data', 'document'].includes(c.type);
      });
      if (filtered.length === 0) continue;
      content = filtered;
    } else {
      content = String(content || '');
      if (!content.trim()) continue;
    }

    normalized.push({ role, content });
  }

  // Gemini: merge consecutive same-role messages
  if (isGemini && normalized.length > 0) {
    const deduped = [];
    for (const msg of normalized) {
      const prev = deduped[deduped.length - 1];
      if (prev && prev.role === msg.role) {
        if (typeof prev.content === 'string' && typeof msg.content === 'string') {
          prev.content += '\n' + msg.content;
        }
        // Array content: keep as-is (provider handles)
      } else {
        deduped.push({ ...msg });
      }
    }
    return deduped;
  }

  return normalized;
}

// ─── FETCH UTILITIES ──────────────────────────────────────────────────────────
async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Merge existing signal with our timeout signal
    const existingSignal = options.signal;
    const fetchOptions   = { ...options, signal: controller.signal };

    if (existingSignal) {
      existingSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    return response;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

async function fetchWithRetry(url, options, retries = 1, timeoutMs = REQUEST_TIMEOUT_MS) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      // 4xx = client error, jangan retry
      if (response.status >= 400 && response.status < 500) return response;
      // 5xx = server error, retry
      if (!response.ok && attempt < retries) {
        await sleep(800 * Math.pow(2, attempt));
        continue;
      }
      return response;
    } catch (e) {
      lastError = e;
      if (e.name === 'AbortError') throw e; // timeout — jangan retry
      if (attempt < retries) await sleep(800 * Math.pow(2, attempt));
    }
  }
  throw lastError ?? new Error('Request failed after retries');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, Math.min(ms, 5000)));
}

async function parseApiError(response, providerName) {
  let errMsg  = `${providerName} error ${response.status}`;
  let errData = null;
  try {
    const text = await response.text();
    if (text) {
      errData = JSON.parse(text);
      errMsg  = errData?.error?.message
        ?? errData?.message
        ?? (typeof errData?.error === 'string' ? errData.error : null)
        ?? errMsg;
    }
  } catch (_) { /* ignore */ }
  return { message: errMsg, status: response.status, data: errData };
}

// ─── OPENAI-COMPATIBLE MESSAGE BUILDER ───────────────────────────────────────
function buildOpenAIMessages(normalized, system) {
  const msgs = normalized
    .filter(m => m.role !== 'system')
    .map(m => ({
      role:    m.role,
      content: Array.isArray(m.content)
        ? flattenContentToText(m.content)
        : String(m.content || ''),
    }))
    .filter(m => m.content.trim());

  if (system) return [{ role: 'system', content: system }, ...msgs];
  return msgs;
}

// Pastikan messages berinterleave user/assistant, dimulai dari firstRole
function ensureAlternating(msgs, firstRole = 'user', secondRole = 'assistant') {
  if (!msgs || msgs.length === 0) return [];

  const result = [];
  for (const msg of msgs) {
    const role    = msg.role === firstRole ? firstRole : secondRole;
    const content = Array.isArray(msg.content) ? msg.content : String(msg.content || '');
    const isEmpty = Array.isArray(content)
      ? content.length === 0
      : !String(content).trim();
    if (isEmpty) continue;

    const prev = result[result.length - 1];
    if (prev && prev.role === role) {
      // Gabungkan dengan pesan sebelumnya
      if (typeof prev.content === 'string') {
        const extra = Array.isArray(content) ? flattenContentToText(content) : content;
        prev.content += '\n' + extra;
      }
    } else {
      result.push({ role, content });
    }
  }

  // Harus dimulai dengan firstRole
  if (result.length > 0 && result[0].role !== firstRole) {
    result.unshift({ role: firstRole, content: '.' });
  }

  return result;
}

// ─── MAIN PROCESSOR ───────────────────────────────────────────────────────────
/**
 * processAIRequest — core handler, tidak ada dependency ke req/res.
 * Dipakai oleh App Router route.js maupun Pages Router handler.
 *
 * @param {{ body: object, ip?: string, userId?: string }} params
 * @returns {Promise<{ status: number, data: object }>}
 */
export async function processAIRequest({ body, ip = 'unknown', userId = '' }) {
  const reqId = crypto.randomBytes(4).toString('hex');

  // ── Rate limiting ──────────────────────────────────────────────────────────
  if (!checkRateLimit(`ai_ip:${ip}`, 60)) {
    return { status: 429, data: { error: 'Rate limit terlampaui. Coba lagi dalam 1 menit.', reqId } };
  }
  if (userId && !checkRateLimit(`ai_user:${userId}`, 40)) {
    return { status: 429, data: { error: 'Rate limit per user terlampaui. Tunggu sebentar.', reqId } };
  }

  // ── Validasi body ──────────────────────────────────────────────────────────
  if (!body || typeof body !== 'object') {
    return { status: 400, data: { error: 'Request body tidak valid atau kosong.', reqId } };
  }

  const provider   = sanitizeProvider(body.provider);
  const model      = sanitizeModelName(body.model);
  const system     = body.system ? String(body.system).substring(0, MAX_SYSTEM_LEN) : undefined;
  const max_tokens = Math.min(Math.max(parseInt(body.max_tokens) || 1000, 1), 64_000);

  if (!provider) {
    return { status: 400, data: { error: '`provider` wajib diisi.', reqId } };
  }
  if (!VALID_PROVIDERS.has(provider)) {
    return {
      status: 400,
      data: {
        error: `Provider "${provider}" tidak dikenal. Provider yang tersedia: ${[...VALID_PROVIDERS].join(', ')}`,
        reqId,
      },
    };
  }
  if (!model) {
    return { status: 400, data: { error: '`model` wajib diisi.', reqId } };
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { status: 400, data: { error: '`messages` harus berupa array dan tidak boleh kosong.', reqId } };
  }

  const rawMessages = body.messages.slice(0, MAX_MESSAGES);
  console.log(`[ai:${reqId}] provider=${provider} model=${model} msgs=${rawMessages.length} ip=${ip}`);

  try {

    // ══════════════════════════════════════════════════════════════════
    // 1. GEMINI
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'gemini') {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return { status: 503, data: { error: 'Gemini tidak tersedia. GEMINI_API_KEY belum diset di Environment Variables.', reqId } };
      }

      const normalized = normalizeMessages(rawMessages, 'gemini', true);
      if (normalized.length === 0) {
        return { status: 400, data: { error: 'Tidak ada pesan valid setelah normalisasi.', reqId } };
      }

      // Konversi ke format Gemini contents
      const contents = normalized.map(m => {
        if (Array.isArray(m.content)) {
          const parts = m.content.map(c => {
            if (c.type === 'image' && c.source) {
              return { inline_data: { mime_type: c.source.media_type || 'image/png', data: c.source.data || '' } };
            }
            if (c.type === 'image_url' && c.image_url?.url) {
              const url = c.image_url.url;
              if (url.startsWith('data:')) {
                const [meta, data] = url.split(',');
                const mimeType = meta.replace('data:', '').replace(';base64', '');
                return { inline_data: { mime_type: mimeType, data } };
              }
              return { text: `[Image URL: ${url}]` };
            }
            return { text: String(c.text || c.content || '').substring(0, MAX_MSG_CONTENT_LEN) };
          });
          return { role: m.role, parts };
        }
        return { role: m.role, parts: [{ text: String(m.content || '') }] };
      });

      // Gemini harus dimulai dari 'user'
      if (contents[0]?.role === 'model') {
        contents.unshift({ role: 'user', parts: [{ text: '.' }] });
      }

      const geminiBody = {
        contents,
        generationConfig: {
          maxOutputTokens: Math.min(max_tokens, 65_536),
          temperature:     0.7,
        },
      };
      if (system) {
        geminiBody.systemInstruction = { parts: [{ text: system }] };
      }

      const modelChain    = [...new Set([model, 'gemini-2.0-flash', 'gemini-1.5-flash'])];
      let lastGeminiError = 'Gemini tidak merespons';

      for (const tryModel of modelChain) {
        try {
          const encodedKey = encodeURIComponent(key);
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(tryModel)}:generateContent?key=${encodedKey}`;

          const r = await fetchWithRetry(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(geminiBody),
          }, 1, REQUEST_TIMEOUT_MS);

          if (!r.ok) {
            const err = await parseApiError(r, 'Gemini');
            lastGeminiError = err.message;
            if ([429, 500, 503, 529].includes(err.status) ||
                /overloaded|quota|RESOURCE_EXHAUSTED|UNAVAILABLE|overload/i.test(err.message)) continue;
            if (err.status === 404 || /not found|model/i.test(err.message)) continue;
            return { status: err.status || 500, data: { error: safeErrMsg(err.message), reqId } };
          }

          const data      = await r.json();
          const candidate = data?.candidates?.[0];
          const text      = candidate?.content?.parts
            ?.map(p => p.text || '')
            .join('')
            .trim() || '';

          if (!text) {
            const reason = candidate?.finishReason;
            if (reason === 'SAFETY')    return { status: 400, data: { error: 'Respons diblokir filter keamanan Gemini. Coba rumuskan ulang pertanyaan.', reqId } };
            if (reason === 'RECITATION') return { status: 400, data: { error: 'Gemini menolak karena potensi plagiarisme.', reqId } };
            if (reason === 'MAX_TOKENS') return { status: 200, data: { content: text, model_used: tryModel, truncated: true, reqId } };
            lastGeminiError = `Respons kosong dari ${tryModel} (finishReason: ${reason || 'unknown'})`;
            continue;
          }

          return { status: 200, data: { content: text, model_used: tryModel, reqId } };

        } catch (e) {
          if (e.name === 'AbortError') {
            return { status: 408, data: { error: 'Request ke Gemini timeout. Coba lagi atau pakai model yang lebih kecil.', reqId } };
          }
          lastGeminiError = e.message;
          continue;
        }
      }

      return {
        status: 503,
        data: {
          error:      'Gemini sedang tidak tersedia atau kelebihan beban.',
          detail:     safeErrMsg(lastGeminiError),
          suggestion: 'Coba model lain seperti Groq atau DeepSeek.',
          reqId,
        },
      };
    }

    // ══════════════════════════════════════════════════════════════════
    // 2. CLAUDE (Anthropic)
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'claude') {
      const key = process.env.CLAUDE_API_KEY;
      if (!key) {
        return { status: 503, data: { error: 'Claude tidak tersedia. CLAUDE_API_KEY belum diset.', reqId } };
      }

      const normalized = normalizeMessages(rawMessages, 'claude', true);
      if (normalized.length === 0) {
        return { status: 400, data: { error: 'Tidak ada pesan valid setelah normalisasi.', reqId } };
      }

      const cleanModel = model.replace(/^anthropic\//i, '').trim();
      if (!cleanModel) return { status: 400, data: { error: 'Model Claude tidak valid.', reqId } };

      const systemMsgs     = normalized.filter(m => m.role === 'system');
      const chatMsgs       = normalized.filter(m => m.role !== 'system');
      const combinedSystem = [
        system,
        ...systemMsgs.map(m => flattenContentToText(m.content)),
      ].filter(Boolean).join('\n\n') || undefined;

      const cleanedMsgs = ensureAlternating(chatMsgs, 'user', 'assistant');
      if (cleanedMsgs.length === 0) {
        return { status: 400, data: { error: 'Pesan tidak valid untuk Claude (butuh minimal 1 pesan user).', reqId } };
      }

      const r = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      cleanModel,
          max_tokens: Math.min(max_tokens, 64_000),
          system:     combinedSystem,
          messages:   cleanedMsgs,
        }),
      }, 1, REQUEST_TIMEOUT_MS);

      if (!r.ok) {
        const err = await parseApiError(r, 'Claude');
        if (err.status === 401) return { status: 401, data: { error: 'Claude: API key tidak valid. Cek CLAUDE_API_KEY.', reqId } };
        if (err.status === 429) return { status: 429, data: { error: 'Claude rate limit. Tunggu sebentar.', reqId } };
        if (err.status === 402 || /credit|billing/i.test(err.message)) {
          return { status: 402, data: { error: 'Kredit Anthropic habis. Top up di console.anthropic.com.', reqId } };
        }
        return { status: err.status || 500, data: { error: safeErrMsg(err.message), reqId } };
      }

      const d    = await r.json();
      const text = d?.content?.find(c => c.type === 'text')?.text?.trim() || '';
      if (!text) return { status: 500, data: { error: 'Respons kosong dari Claude.', reqId } };
      return { status: 200, data: { content: text, reqId } };
    }

    // ══════════════════════════════════════════════════════════════════
    // 3. OPENAI
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) {
        return { status: 503, data: { error: 'OpenAI tidak tersedia. OPENAI_API_KEY belum diset.', reqId } };
      }

      const normalized = normalizeMessages(rawMessages, 'openai', false);
      const allMsgs    = buildOpenAIMessages(normalized, system);

      if (allMsgs.length === 0 || (allMsgs.length === 1 && allMsgs[0].role === 'system')) {
        return { status: 400, data: { error: 'Tidak ada pesan user untuk OpenAI.', reqId } };
      }

      const r = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body:    JSON.stringify({ model, messages: allMsgs, max_tokens: Math.min(max_tokens, 128_000) }),
      }, 1, REQUEST_TIMEOUT_MS);

      if (!r.ok) {
        const err = await parseApiError(r, 'OpenAI');
        if (err.status === 401) return { status: 401, data: { error: 'OpenAI: API key tidak valid.', reqId } };
        if (err.status === 429) return { status: 429, data: { error: 'OpenAI rate limit. Coba lagi sebentar.', reqId } };
        if (err.status === 402 || /insufficient_quota/i.test(err.message)) {
          return { status: 402, data: { error: 'Kuota OpenAI habis. Top up akun Anda.', reqId } };
        }
        return { status: err.status || 500, data: { error: safeErrMsg(err.message), reqId } };
      }

      const d    = await r.json();
      const text = d?.choices?.[0]?.message?.content?.trim() || '';
      if (!text) return { status: 500, data: { error: 'Respons kosong dari OpenAI.', reqId } };
      return { status: 200, data: { content: text, reqId } };
    }

    // ══════════════════════════════════════════════════════════════════
    // 4. OPENROUTER
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'openrouter') {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) {
        return { status: 503, data: { error: 'OpenRouter tidak tersedia. OPENROUTER_API_KEY belum diset.', reqId } };
      }

      const normalized = normalizeMessages(rawMessages, 'openrouter', false);
      const allMsgs    = buildOpenAIMessages(normalized, system);

      const r = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer':  process.env.NEXT_PUBLIC_SITE_URL || 'https://nexusai-roblox.vercel.app',
          'X-Title':       'NEXUS AI',
        },
        body: JSON.stringify({
          model,
          messages:    allMsgs,
          max_tokens:  Math.min(max_tokens, 200_000),
          temperature: 0.7,
        }),
      }, 1, REQUEST_TIMEOUT_MS);

      if (!r.ok) {
        const err = await parseApiError(r, 'OpenRouter');
        if (err.status === 401) return { status: 401, data: { error: 'OpenRouter: API key tidak valid.', reqId } };
        if (err.status === 402 || /insufficient.balance/i.test(err.message)) {
          return { status: 402, data: { error: 'Saldo OpenRouter habis.', reqId } };
        }
        if (err.status === 429) return { status: 429, data: { error: 'OpenRouter rate limit. Coba lagi.', reqId } };
        return { status: err.status || 500, data: { error: safeErrMsg(err.message), reqId } };
      }

      const d    = await r.json();
      const text = d?.choices?.[0]?.message?.content?.trim() || '';
      if (!text) {
        const detail = d?.error ? safeErrMsg(String(d.error.message || d.error)) : 'Respons kosong';
        return { status: 500, data: { error: `OpenRouter: ${detail}.`, reqId } };
      }
      return { status: 200, data: { content: text, reqId } };
    }

    // ══════════════════════════════════════════════════════════════════
    // 5. DEEPSEEK
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'deepseek') {
      const key = process.env.DEEPSEEK_API_KEY;
      if (!key) {
        return { status: 503, data: { error: 'DeepSeek tidak tersedia. DEEPSEEK_API_KEY belum diset.', reqId } };
      }

      const normalized = normalizeMessages(rawMessages, 'deepseek', false);
      const allMsgs    = buildOpenAIMessages(normalized, system);

      const r = await fetchWithRetry('https://api.deepseek.com/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body:    JSON.stringify({
          model,
          messages:    allMsgs,
          max_tokens:  Math.min(max_tokens, 65_536),
          temperature: 0.7,
        }),
      }, 1, REQUEST_TIMEOUT_MS);

      if (!r.ok) {
        const err = await parseApiError(r, 'DeepSeek');
        if (err.status === 401) return { status: 401, data: { error: 'DeepSeek: API key tidak valid.', reqId } };
        if (err.status === 402 || /insufficient|balance/i.test(err.message)) {
          return { status: 402, data: { error: 'Saldo DeepSeek habis.', reqId } };
        }
        if (err.status === 429) return { status: 429, data: { error: 'DeepSeek rate limit. Tunggu sebentar.', reqId } };
        return { status: err.status || 500, data: { error: safeErrMsg(err.message), reqId } };
      }

      const d      = await r.json();
      const choice = d?.choices?.[0];
      if (!choice) return { status: 500, data: { error: 'Respons kosong dari DeepSeek.', reqId } };

      const mainContent = String(choice.message?.content || '').trim();
      const reasoning   = String(choice.message?.reasoning_content || '').trim();

      let finalContent = '';
      if (reasoning) {
        finalContent += '🧠 **Reasoning (DeepSeek R1):**\n' + reasoning + '\n\n---\n\n';
      }
      finalContent += mainContent;

      if (!finalContent.trim()) {
        return { status: 500, data: { error: 'Respons kosong dari DeepSeek.', reqId } };
      }

      return { status: 200, data: { content: finalContent, reasoning: reasoning || undefined, reqId } };
    }

    // ══════════════════════════════════════════════════════════════════
    // 6. GROQ
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'groq') {
      const key = process.env.GROQ_API_KEY;
      if (!key) {
        return { status: 503, data: { error: 'Groq tidak tersedia. GROQ_API_KEY belum diset.', reqId } };
      }

      const normalized = normalizeMessages(rawMessages, 'groq', false);
      const allMsgs    = buildOpenAIMessages(normalized, system);

      const groqTokenLimits = {
        'llama-3.1-8b-instant':          8_192,
        'llama-3.3-70b-versatile':       32_768,
        'llama3-8b-8192':                8_192,
        'llama3-70b-8192':               8_192,
        'mixtral-8x7b-32768':            32_768,
        'gemma2-9b-it':                  8_192,
        'deepseek-r1-distill-llama-70b': 32_768,
        'llama-3.1-70b-versatile':       32_768,
        'llama-3.2-1b-preview':          8_192,
        'llama-3.2-3b-preview':          8_192,
        'llama-3.2-11b-vision-preview':  8_192,
        'llama-3.2-90b-vision-preview':  8_192,
      };
      const modelMax = groqTokenLimits[model] ?? 8_192;

      const r = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body:    JSON.stringify({
          model,
          messages:    allMsgs,
          max_tokens:  Math.min(max_tokens, modelMax),
          temperature: 0.7,
        }),
      }, 1, REQUEST_TIMEOUT_MS);

      if (!r.ok) {
        const err = await parseApiError(r, 'Groq');
        if (err.status === 401) return { status: 401, data: { error: 'Groq: API key tidak valid.', reqId } };
        if (err.status === 429) return { status: 429, data: { error: 'Groq rate limit. Coba lagi sebentar.', reqId } };
        if (err.status === 413 || /context.length|too long|context_length/i.test(err.message)) {
          return { status: 413, data: { error: 'Pesan terlalu panjang untuk Groq. Mulai chat baru.', reqId } };
        }
        return { status: err.status || 500, data: { error: safeErrMsg(err.message), reqId } };
      }

      const d    = await r.json();
      const text = d?.choices?.[0]?.message?.content?.trim() || '';
      if (!text) return { status: 500, data: { error: 'Respons kosong dari Groq.', reqId } };
      return { status: 200, data: { content: text, reqId } };
    }

    // ══════════════════════════════════════════════════════════════════
    // 7. MISTRAL
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'mistral') {
      const key = process.env.MISTRAL_API_KEY;
      if (!key) {
        return { status: 503, data: { error: 'Mistral tidak tersedia. MISTRAL_API_KEY belum diset.', reqId } };
      }

      const normalized = normalizeMessages(rawMessages, 'mistral', false);
      const allMsgs    = buildOpenAIMessages(normalized, system);

      const r = await fetchWithRetry('https://api.mistral.ai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body:    JSON.stringify({
          model,
          messages:    allMsgs,
          max_tokens:  Math.min(max_tokens, 65_536),
          temperature: 0.7,
        }),
      }, 1, REQUEST_TIMEOUT_MS);

      if (!r.ok) {
        const err = await parseApiError(r, 'Mistral');
        if (err.status === 401) return { status: 401, data: { error: 'Mistral: API key tidak valid.', reqId } };
        if (err.status === 429) return { status: 429, data: { error: 'Mistral rate limit. Coba lagi.', reqId } };
        if (err.status === 402) return { status: 402, data: { error: 'Kuota Mistral habis.', reqId } };
        return { status: err.status || 500, data: { error: safeErrMsg(err.message), reqId } };
      }

      const d    = await r.json();
      const text = d?.choices?.[0]?.message?.content?.trim() || '';
      if (!text) return { status: 500, data: { error: 'Respons kosong dari Mistral.', reqId } };
      return { status: 200, data: { content: text, reqId } };
    }

    // ══════════════════════════════════════════════════════════════════
    // 8. STEPFUN
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'stepfun') {
      const key = process.env.STEPFUN_API_KEY;
      if (!key) {
        return {
          status: 503,
          data: {
            error: 'StepFun tidak tersedia. Tambahkan STEPFUN_API_KEY ke Environment Variables Vercel.',
            reqId,
          },
        };
      }

      const normalized = normalizeMessages(rawMessages, 'stepfun', false);
      const allMsgs    = buildOpenAIMessages(normalized, system);

      const stepfunFallback = {
        'step-1-8k':      'step-1-8k',
        'step-1-32k':     'step-1-8k',
        'step-1-128k':    'step-1-32k',
        'step-1-256k':    'step-1-128k',
        'step-2-16k':     'step-1-32k',
        'step-1o-mini':   'step-1-8k',
        'step-1o-turbo':  'step-1-32k',
        'step-2-turbo':   'step-2-16k',
        'step-3-5-flash': 'step-1-32k',
      };
      const stepfunMaxTokens = {
        'step-1-8k':      8_192,
        'step-1-32k':     16_384,
        'step-1-128k':    32_768,
        'step-1-256k':    32_768,
        'step-2-16k':     16_384,
        'step-1o-mini':   8_192,
        'step-1o-turbo':  16_384,
        'step-2-turbo':   16_384,
        'step-3-5-flash': 16_384,
      };

      const primaryFallback = stepfunFallback[model] || 'step-1-8k';
      const modelChain      = [...new Set([model, primaryFallback, 'step-1-8k'])];
      let lastStepError     = 'StepFun tidak merespons';

      for (const tryModel of modelChain) {
        const maxTok = Math.min(max_tokens, stepfunMaxTokens[tryModel] || 8_192);
        try {
          const r = await fetchWithRetry('https://api.stepfun.com/v1/chat/completions', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body:    JSON.stringify({
              model:       tryModel,
              messages:    allMsgs,
              max_tokens:  maxTok,
              temperature: 0.7,
            }),
          }, 1, REQUEST_TIMEOUT_MS);

          if (!r.ok) {
            const err = await parseApiError(r, 'StepFun');
            lastStepError = err.message;
            if (err.status === 401) return { status: 401, data: { error: 'StepFun: API key tidak valid. Cek STEPFUN_API_KEY.', reqId } };
            if (err.status === 402 || /insufficient|balance/i.test(err.message)) {
              return { status: 402, data: { error: 'Kuota StepFun habis.', reqId } };
            }
            if (err.status === 429) return { status: 429, data: { error: 'StepFun rate limit. Tunggu sebentar.', reqId } };
            if (err.status === 404 || /not found|model/i.test(err.message)) continue;
            if ([500, 503, 529].includes(err.status) || /overload/i.test(err.message)) continue;
            return { status: err.status || 500, data: { error: safeErrMsg(err.message), reqId } };
          }

          const d    = await r.json();
          const text = d?.choices?.[0]?.message?.content?.trim() || '';
          if (!text) { lastStepError = `Respons kosong dari ${tryModel}`; continue; }
          return { status: 200, data: { content: text, model_used: tryModel, reqId } };

        } catch (e) {
          if (e.name === 'AbortError') {
            return { status: 408, data: { error: 'Request ke StepFun timeout.', reqId } };
          }
          lastStepError = e.message;
          continue;
        }
      }

      return {
        status: 503,
        data: {
          error:      'StepFun sedang tidak tersedia.',
          detail:     safeErrMsg(lastStepError),
          suggestion: 'Coba Gemini atau Groq.',
          reqId,
        },
      };
    }

    // Fallback (seharusnya tidak pernah dicapai karena sudah divalidasi)
    return { status: 400, data: { error: `Provider "${provider}" tidak dikenal.`, reqId } };

  } catch (e) {
    if (e.name === 'AbortError') {
      return { status: 408, data: { error: 'Request timeout. Coba lagi.', reqId } };
    }
    console.error(`[ai:${reqId}] Unexpected error:`, e?.message ?? e);
    return { status: 500, data: { error: 'Terjadi kesalahan server internal.', reqId } };
  }
}

// ─── LEGACY PAGES ROUTER HANDLER ─────────────────────────────────────────────
// Dipakai jika project masih pakai pages/api/ai.js
// Untuk App Router, gunakan app/api/ai/route.js
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id, X-Username');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Gunakan POST.' });
  }

  const rawIp  = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  const ip     = rawIp.split(',')[0].trim() || 'unknown';
  const userId = String(req.headers['x-user-id'] || '').substring(0, 64);

  const result = await processAIRequest({ body: req.body, ip, userId });
  return res.status(result.status).json(result.data);
}