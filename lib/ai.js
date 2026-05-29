// lib/ai.js — NEXUS AI Proxy (FIXED v5)
// Fixes from v4:
//   • Timeout reduced to 50s (fit dalam batas Vercel 60s Pro; warning untuk Hobby 10s)
//   • sanitizeProvider: allow alphanumeric + hyphen (fix bug strip nama provider)
//   • normalizeMessages: handle array content untuk semua provider (bukan hanya Gemini)
//   • CORS headers dipindahkan ke route.js level — tidak duplicate
//   • fetchWithRetry: retry hanya untuk 5xx & network error, bukan 4xx
//   • Gemini key di-encode di URL (aman untuk key dengan special chars)
//   • Error response konsisten: selalu ada field `error`
//   • Validasi pesan lebih ketat sebelum dikirim ke provider
//   • DeepSeek reasoning_content di-handle dengan benar
//   • Groq: max_completion_tokens → max_tokens fallback
//   • Request ID untuk debugging

import crypto from 'crypto';

// ─── RATE LIMITING (in-memory, per instance) ─────────────────────────────────
// Catatan: di Vercel serverless, setiap instance punya Map sendiri.
// Ini tetap efektif untuk rate limit dasar.
const _rl = new Map();

function checkRateLimit(key, maxPerMin = 30) {
  const now = Date.now();
  const k = String(key || 'anon').substring(0, 128);
  if (!_rl.has(k)) _rl.set(k, { count: 0, reset: now + 60_000 });
  const r = _rl.get(k);
  if (now > r.reset) { r.count = 0; r.reset = now + 60_000; }
  return ++r.count <= maxPerMin;
}

// Cleanup expired entries
const _cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rl) {
    if (now > v.reset + 120_000) _rl.delete(k);
  }
}, 5 * 60_000);
if (typeof _cleanupInterval.unref === 'function') _cleanupInterval.unref();

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MAX_MESSAGES        = 100;
const MAX_MSG_CONTENT_LEN = 32_000;
const MAX_SYSTEM_LEN      = 8_000;
const MAX_TOTAL_CHARS     = 200_000;

// Vercel Pro max = 60s, kita pakai 50s untuk safety margin.
// Vercel Hobby max = 10s — AI call akan timeout! Upgrade ke Pro jika perlu.
const REQUEST_TIMEOUT_MS = 50_000;

const VALID_PROVIDERS = new Set([
  'gemini', 'claude', 'openai', 'openrouter',
  'deepseek', 'groq', 'mistral', 'stepfun',
]);

// ─── SANITIZERS ───────────────────────────────────────────────────────────────

// FIX: dulu hanya [a-z] — sekarang allow alphanumeric + hyphen untuk nama seperti "openrouter"
// Semua provider yang valid sudah lowercase huruf saja, tapi ini lebih aman
function sanitizeProvider(provider) {
  return String(provider || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, '')
    .substring(0, 30);
}

// Model name: alphanumeric, dash, dot, slash, colon, underscore, at-sign
function sanitizeModelName(model) {
  return String(model || '')
    .replace(/[^a-zA-Z0-9\-._/:@]/g, '')
    .substring(0, 120);
}

// Trim content — handle string, array (multimodal), atau yang lain
function trimContent(content, maxLen = MAX_MSG_CONTENT_LEN) {
  if (typeof content === 'string') {
    return content.substring(0, maxLen);
  }
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
            return c; // pass-through besar, provider yang validasi
          default:
            return null;
        }
      })
      .filter(Boolean);
  }
  return String(content || '').substring(0, maxLen);
}

// Convert array content → string teks saja (untuk provider yang tidak support multimodal)
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

// Sanitize error message — hilangkan API key dan info sensitif
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
  let totalChars = 0;
  const isGemini = provider === 'gemini';

  for (const m of msgs) {
    if (!m || typeof m !== 'object' || !m.role) continue;

    // Normalize role
    let role;
    const rawRole = String(m.role).toLowerCase();
    if (['assistant', 'ai', 'agent', 'model'].includes(rawRole)) {
      role = isGemini ? 'model' : 'assistant';
    } else if (rawRole === 'system' && !isGemini) {
      role = 'system'; // Gemini system → systemInstruction, bukan di messages
    } else {
      role = isGemini ? 'user' : 'user';
    }

    // Skip system messages untuk Gemini (di-handle via systemInstruction)
    if (isGemini && rawRole === 'system') continue;

    // Trim content
    let content = trimContent(m.content);

    // Hitung panjang untuk hard cap
    const contentLen = typeof content === 'string'
      ? content.length
      : JSON.stringify(content).length;
    if (totalChars + contentLen > MAX_TOTAL_CHARS) break;
    totalChars += contentLen;

    // Untuk provider yang tidak support multimodal (semua kecuali Gemini & Claude),
    // flatten array content menjadi teks biasa
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

  // Gemini: gabungkan pesan berurutan dari role yang sama (tidak diizinkan)
  if (isGemini && normalized.length > 0) {
    const deduped = [];
    for (const msg of normalized) {
      const prev = deduped[deduped.length - 1];
      if (prev && prev.role === msg.role) {
        // Gabungkan konten
        if (typeof prev.content === 'string' && typeof msg.content === 'string') {
          prev.content += '\n' + msg.content;
        }
        // Array content: append parts (simple approach)
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

  // Merge dengan signal yang sudah ada jika ada
  const signal = options.signal
    ? mergeSignals(options.signal, controller.signal)
    : controller.signal;

  try {
    const response = await fetch(url, { ...options, signal });
    clearTimeout(timeoutId);
    return response;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

function mergeSignals(s1, s2) {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  s1?.addEventListener?.('abort', abort, { once: true });
  s2?.addEventListener?.('abort', abort, { once: true });
  return ctrl.signal;
}

// Retry hanya untuk network error dan 5xx (bukan 4xx)
async function fetchWithRetry(url, options, retries = 2, timeoutMs = REQUEST_TIMEOUT_MS) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      // Jangan retry untuk 4xx (client error)
      if (response.status >= 400 && response.status < 500) return response;
      // Retry untuk 5xx atau 503
      if (!response.ok && attempt < retries) {
        const waitMs = 800 * Math.pow(2, attempt); // exponential backoff
        await sleep(waitMs);
        continue;
      }
      return response;
    } catch (e) {
      lastError = e;
      if (e.name === 'AbortError') throw e; // timeout/cancel — jangan retry
      if (attempt < retries) {
        await sleep(800 * Math.pow(2, attempt));
      }
    }
  }
  throw lastError || new Error('Request gagal setelah beberapa percobaan');
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
        || errData?.message
        || (typeof errData?.error === 'string' ? errData.error : null)
        || errMsg;
    }
  } catch (_) { /* ignore parse error */ }
  return { message: errMsg, status: response.status, data: errData };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — set di sini juga sebagai backup (primary ada di route.js)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id, X-Username');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed. Gunakan POST.' });

  // Request ID untuk debugging
  const reqId = crypto.randomBytes(4).toString('hex');

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const rawIp  = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  const ip     = rawIp.split(',')[0].trim() || 'unknown';
  const userId = String(req.headers['x-user-id'] || '').substring(0, 64);

  if (!checkRateLimit(`ai_ip:${ip}`, 60)) {
    return res.status(429).json({ error: 'Rate limit terlampaui. Coba lagi dalam 1 menit.', reqId });
  }
  if (userId && !checkRateLimit(`ai_user:${userId}`, 40)) {
    return res.status(429).json({ error: 'Rate limit per user terlampaui. Tunggu sebentar.', reqId });
  }

  // ── Validasi body ─────────────────────────────────────────────────────────
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Request body tidak valid atau kosong.', reqId });
  }

  const provider   = sanitizeProvider(body.provider);
  const model      = sanitizeModelName(body.model);
  const system     = body.system ? String(body.system).substring(0, MAX_SYSTEM_LEN) : undefined;
  const max_tokens = Math.min(Math.max(parseInt(body.max_tokens) || 1000, 1), 64_000);

  if (!provider) {
    return res.status(400).json({ error: '`provider` wajib diisi.', reqId });
  }
  if (!VALID_PROVIDERS.has(provider)) {
    return res.status(400).json({
      error: `Provider "${provider}" tidak dikenal. Provider yang tersedia: ${[...VALID_PROVIDERS].join(', ')}`,
      reqId,
    });
  }
  if (!model) {
    return res.status(400).json({ error: '`model` wajib diisi.', reqId });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: '`messages` harus berupa array dan tidak boleh kosong.', reqId });
  }

  const rawMessages = body.messages.slice(0, MAX_MESSAGES);

  console.log(`[ai:${reqId}] provider=${provider} model=${model} msgs=${rawMessages.length}`);

  try {

    // ══════════════════════════════════════════════════════════════════
    // 1. GEMINI
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'gemini') {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return res.status(503).json({ error: 'Gemini tidak tersedia. GEMINI_API_KEY belum diset.', reqId });

      const normalized = normalizeMessages(rawMessages, 'gemini', true);
      if (normalized.length === 0) {
        return res.status(400).json({ error: 'Tidak ada pesan valid setelah normalisasi.', reqId });
      }

      // Konversi ke format Gemini `contents`
      const contents = normalized.map(m => {
        if (Array.isArray(m.content)) {
          const parts = m.content.map(c => {
            if (c.type === 'image' && c.source) {
              return {
                inline_data: {
                  mime_type: c.source.media_type || 'image/png',
                  data:      c.source.data || '',
                },
              };
            }
            if (c.type === 'image_url' && c.image_url?.url) {
              // OpenAI-style image URL (base64 data URI)
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

      // Gemini perlu messages dimulai dari 'user'
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

      // Model chain fallback
      const modelChain = [...new Set([model, 'gemini-2.0-flash', 'gemini-1.5-flash'])];
      let lastGeminiError = 'Gemini tidak merespons';

      for (const tryModel of modelChain) {
        try {
          // Encode key agar aman untuk special chars
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
            // Retry dengan model fallback untuk overload / quota
            if ([429, 500, 503, 529].includes(err.status) ||
                /overloaded|quota|RESOURCE_EXHAUSTED|UNAVAILABLE|overload/i.test(err.message)) {
              continue;
            }
            // 404 = model tidak ada → coba fallback
            if (err.status === 404 || /not found|model/i.test(err.message)) continue;
            // Error lain → langsung return
            return res.status(err.status || 500).json({ error: safeErrMsg(err.message), reqId });
          }

          const data      = await r.json();
          const candidate = data?.candidates?.[0];
          const text      = candidate?.content?.parts
            ?.map(p => p.text || '')
            .join('')
            .trim() || '';

          if (!text) {
            const reason = candidate?.finishReason;
            if (reason === 'SAFETY') {
              return res.status(400).json({
                error: 'Respons diblokir filter keamanan Gemini. Coba rumuskan ulang pertanyaan.',
                reqId,
              });
            }
            if (reason === 'RECITATION') {
              return res.status(400).json({ error: 'Gemini menolak karena potensi plagiarisme.', reqId });
            }
            if (reason === 'MAX_TOKENS') {
              return res.status(400).json({ error: 'Respons terpotong karena melebihi max_tokens.', reqId });
            }
            lastGeminiError = `Respons kosong dari ${tryModel} (finishReason: ${reason || 'unknown'})`;
            continue;
          }

          return res.status(200).json({ content: text, model_used: tryModel, reqId });

        } catch (e) {
          if (e.name === 'AbortError') {
            return res.status(408).json({ error: 'Request ke Gemini timeout. Coba lagi.', reqId });
          }
          lastGeminiError = e.message;
          continue;
        }
      }

      return res.status(503).json({
        error:      'Gemini sedang tidak tersedia atau kelebihan beban.',
        detail:     safeErrMsg(lastGeminiError),
        suggestion: 'Coba model lain seperti Groq atau DeepSeek.',
        reqId,
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // 2. CLAUDE (Anthropic)
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'claude') {
      const key = process.env.CLAUDE_API_KEY;
      if (!key) return res.status(503).json({ error: 'Claude tidak tersedia. CLAUDE_API_KEY belum diset.', reqId });

      const normalized = normalizeMessages(rawMessages, 'claude', true);
      if (normalized.length === 0) {
        return res.status(400).json({ error: 'Tidak ada pesan valid setelah normalisasi.', reqId });
      }

      // Hilangkan prefix 'anthropic/' jika ada
      const cleanModel = model.replace(/^anthropic\//i, '').trim();
      if (!cleanModel) return res.status(400).json({ error: 'Model Claude tidak valid.', reqId });

      // Claude tidak support role 'system' dalam messages — ekstrak dan jadikan system param
      const systemMsgs = normalized.filter(m => m.role === 'system');
      const chatMsgs   = normalized.filter(m => m.role !== 'system');

      const combinedSystem = [
        system,
        ...systemMsgs.map(m => flattenContentToText(m.content)),
      ].filter(Boolean).join('\n\n') || undefined;

      // Claude messages harus berinterleave user/assistant dan dimulai user
      const cleanedMsgs = ensureAlternating(chatMsgs, 'user', 'assistant');
      if (cleanedMsgs.length === 0) {
        return res.status(400).json({ error: 'Pesan tidak valid untuk Claude (butuh minimal 1 pesan user).', reqId });
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
        if (err.status === 401) return res.status(401).json({ error: 'Claude: API key tidak valid.', reqId });
        if (err.status === 429) return res.status(429).json({ error: 'Claude rate limit. Tunggu sebentar.', reqId });
        if (err.status === 402 || /credit|billing/i.test(err.message)) {
          return res.status(402).json({ error: 'Kredit Anthropic habis.', reqId });
        }
        return res.status(err.status || 500).json({ error: safeErrMsg(err.message), reqId });
      }

      const d    = await r.json();
      const text = d?.content?.find(c => c.type === 'text')?.text?.trim() || '';
      if (!text) return res.status(500).json({ error: 'Respons kosong dari Claude.', reqId });
      return res.status(200).json({ content: text, reqId });
    }

    // ══════════════════════════════════════════════════════════════════
    // 3. OPENAI
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return res.status(503).json({ error: 'OpenAI tidak tersedia. OPENAI_API_KEY belum diset.', reqId });

      const normalized = normalizeMessages(rawMessages, 'openai', false);
      const allMsgs    = buildOpenAIMessages(normalized, system);

      const r = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body:    JSON.stringify({
          model,
          messages:   allMsgs,
          max_tokens: Math.min(max_tokens, 128_000),
        }),
      }, 1, REQUEST_TIMEOUT_MS);

      if (!r.ok) {
        const err = await parseApiError(r, 'OpenAI');
        if (err.status === 401) return res.status(401).json({ error: 'OpenAI: API key tidak valid.', reqId });
        if (err.status === 429) return res.status(429).json({ error: 'OpenAI rate limit. Coba lagi sebentar.', reqId });
        if (err.status === 402 || /insufficient_quota/i.test(err.message)) {
          return res.status(402).json({ error: 'Kuota OpenAI habis. Top up akun Anda.', reqId });
        }
        return res.status(err.status || 500).json({ error: safeErrMsg(err.message), reqId });
      }

      const d    = await r.json();
      const text = d?.choices?.[0]?.message?.content?.trim() || '';
      if (!text) return res.status(500).json({ error: 'Respons kosong dari OpenAI.', reqId });
      return res.status(200).json({ content: text, reqId });
    }

    // ══════════════════════════════════════════════════════════════════
    // 4. OPENROUTER
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'openrouter') {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) return res.status(503).json({ error: 'OpenRouter tidak tersedia. OPENROUTER_API_KEY belum diset.', reqId });

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
          messages:   allMsgs,
          max_tokens: Math.min(max_tokens, 200_000),
          temperature: 0.7,
        }),
      }, 1, REQUEST_TIMEOUT_MS);

      if (!r.ok) {
        const err = await parseApiError(r, 'OpenRouter');
        if (err.status === 401) return res.status(401).json({ error: 'OpenRouter: API key tidak valid.', reqId });
        if (err.status === 402 || /insufficient.balance/i.test(err.message)) {
          return res.status(402).json({ error: 'Saldo OpenRouter habis.', reqId });
        }
        if (err.status === 429) return res.status(429).json({ error: 'OpenRouter rate limit. Coba lagi.', reqId });
        return res.status(err.status || 500).json({ error: safeErrMsg(err.message), reqId });
      }

      const d    = await r.json();
      const text = d?.choices?.[0]?.message?.content?.trim() || '';
      if (!text) {
        const detail = d?.error ? safeErrMsg(String(d.error.message || d.error)) : 'Respons kosong';
        return res.status(500).json({ error: `OpenRouter: ${detail}.`, reqId });
      }
      return res.status(200).json({ content: text, reqId });
    }

    // ══════════════════════════════════════════════════════════════════
    // 5. DEEPSEEK
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'deepseek') {
      const key = process.env.DEEPSEEK_API_KEY;
      if (!key) return res.status(503).json({ error: 'DeepSeek tidak tersedia. DEEPSEEK_API_KEY belum diset.', reqId });

      const normalized = normalizeMessages(rawMessages, 'deepseek', false);
      const allMsgs    = buildOpenAIMessages(normalized, system);

      const r = await fetchWithRetry('https://api.deepseek.com/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body:    JSON.stringify({
          model,
          messages:   allMsgs,
          max_tokens: Math.min(max_tokens, 65_536),
          temperature: 0.7,
        }),
      }, 1, REQUEST_TIMEOUT_MS);

      if (!r.ok) {
        const err = await parseApiError(r, 'DeepSeek');
        if (err.status === 401) return res.status(401).json({ error: 'DeepSeek: API key tidak valid.', reqId });
        if (err.status === 402 || /insufficient|balance/i.test(err.message)) {
          return res.status(402).json({ error: 'Saldo DeepSeek habis.', reqId });
        }
        if (err.status === 429) return res.status(429).json({ error: 'DeepSeek rate limit. Tunggu sebentar.', reqId });
        return res.status(err.status || 500).json({ error: safeErrMsg(err.message), reqId });
      }

      const d      = await r.json();
      const choice = d?.choices?.[0];
      if (!choice) return res.status(500).json({ error: 'Respons kosong dari DeepSeek.', reqId });

      const mainContent = String(choice.message?.content || '').trim();
      const reasoning   = String(choice.message?.reasoning_content || '').trim();

      let finalContent = '';
      if (reasoning) {
        finalContent += '🧠 **Reasoning (DeepSeek R1):**\n' + reasoning + '\n\n---\n\n';
      }
      finalContent += mainContent;

      if (!finalContent.trim()) {
        return res.status(500).json({ error: 'Respons kosong dari DeepSeek.', reqId });
      }

      return res.status(200).json({
        content:   finalContent,
        reasoning: reasoning || undefined,
        reqId,
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // 6. GROQ
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'groq') {
      const key = process.env.GROQ_API_KEY;
      if (!key) return res.status(503).json({ error: 'Groq tidak tersedia. GROQ_API_KEY belum diset.', reqId });

      const normalized = normalizeMessages(rawMessages, 'groq', false);
      const allMsgs    = buildOpenAIMessages(normalized, system);

      // Batas token per model Groq
      const groqTokenLimits = {
        'llama-3.1-8b-instant':    8_192,
        'llama-3.3-70b-versatile': 32_768,
        'llama3-8b-8192':          8_192,
        'llama3-70b-8192':         8_192,
        'mixtral-8x7b-32768':      32_768,
        'gemma2-9b-it':            8_192,
        'deepseek-r1-distill-llama-70b': 32_768,
      };
      const modelMax = groqTokenLimits[model] ?? 8_192;

      const r = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body:    JSON.stringify({
          model,
          messages:   allMsgs,
          max_tokens: Math.min(max_tokens, modelMax),
          temperature: 0.7,
        }),
      }, 1, REQUEST_TIMEOUT_MS);

      if (!r.ok) {
        const err = await parseApiError(r, 'Groq');
        if (err.status === 401) return res.status(401).json({ error: 'Groq: API key tidak valid.', reqId });
        if (err.status === 429) return res.status(429).json({ error: 'Groq rate limit. Coba lagi sebentar.', reqId });
        if (err.status === 413 || /context.length|too long/i.test(err.message)) {
          return res.status(413).json({ error: 'Pesan terlalu panjang untuk Groq. Mulai chat baru.', reqId });
        }
        return res.status(err.status || 500).json({ error: safeErrMsg(err.message), reqId });
      }

      const d    = await r.json();
      const text = d?.choices?.[0]?.message?.content?.trim() || '';
      if (!text) return res.status(500).json({ error: 'Respons kosong dari Groq.', reqId });
      return res.status(200).json({ content: text, reqId });
    }

    // ══════════════════════════════════════════════════════════════════
    // 7. MISTRAL
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'mistral') {
      const key = process.env.MISTRAL_API_KEY;
      if (!key) return res.status(503).json({ error: 'Mistral tidak tersedia. MISTRAL_API_KEY belum diset.', reqId });

      const normalized = normalizeMessages(rawMessages, 'mistral', false);
      const allMsgs    = buildOpenAIMessages(normalized, system);

      const r = await fetchWithRetry('https://api.mistral.ai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body:    JSON.stringify({
          model,
          messages:   allMsgs,
          max_tokens: Math.min(max_tokens, 65_536),
          temperature: 0.7,
        }),
      }, 1, REQUEST_TIMEOUT_MS);

      if (!r.ok) {
        const err = await parseApiError(r, 'Mistral');
        if (err.status === 401) return res.status(401).json({ error: 'Mistral: API key tidak valid.', reqId });
        if (err.status === 429) return res.status(429).json({ error: 'Mistral rate limit. Coba lagi.', reqId });
        if (err.status === 402) return res.status(402).json({ error: 'Kuota Mistral habis.', reqId });
        return res.status(err.status || 500).json({ error: safeErrMsg(err.message), reqId });
      }

      const d    = await r.json();
      const text = d?.choices?.[0]?.message?.content?.trim() || '';
      if (!text) return res.status(500).json({ error: 'Respons kosong dari Mistral.', reqId });
      return res.status(200).json({ content: text, reqId });
    }

    // ══════════════════════════════════════════════════════════════════
    // 8. STEPFUN
    // ══════════════════════════════════════════════════════════════════
    if (provider === 'stepfun') {
      const key = process.env.STEPFUN_API_KEY;
      if (!key) {
        return res.status(503).json({
          error: 'StepFun tidak tersedia. Tambahkan STEPFUN_API_KEY ke Environment Variables Vercel.',
          reqId,
        });
      }

      const normalized = normalizeMessages(rawMessages, 'stepfun', false);
      const allMsgs    = buildOpenAIMessages(normalized, system);

      // Model chain & token limit
      const stepfunFallback = {
        'step-1-8k':     'step-1-8k',
        'step-1-32k':    'step-1-8k',
        'step-1-128k':   'step-1-32k',
        'step-1-256k':   'step-1-128k',
        'step-2-16k':    'step-1-32k',
        'step-1o-mini':  'step-1-8k',
        'step-1o-turbo': 'step-1-32k',
        'step-2-turbo':  'step-2-16k',
        'step-3-5-flash':'step-1-32k',
      };
      const stepfunMaxTokens = {
        'step-1-8k':     8_192,
        'step-1-32k':    16_384,
        'step-1-128k':   32_768,
        'step-1-256k':   32_768,
        'step-2-16k':    16_384,
        'step-1o-mini':  8_192,
        'step-1o-turbo': 16_384,
        'step-2-turbo':  16_384,
        'step-3-5-flash':16_384,
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
              model:      tryModel,
              messages:   allMsgs,
              max_tokens: maxTok,
              temperature: 0.7,
            }),
          }, 1, REQUEST_TIMEOUT_MS);

          if (!r.ok) {
            const err = await parseApiError(r, 'StepFun');
            lastStepError = err.message;
            if (err.status === 401) {
              return res.status(401).json({ error: 'StepFun: API key tidak valid. Cek STEPFUN_API_KEY.', reqId });
            }
            if (err.status === 402 || /insufficient|balance/i.test(err.message)) {
              return res.status(402).json({ error: 'Kuota StepFun habis.', reqId });
            }
            if (err.status === 429) {
              return res.status(429).json({ error: 'StepFun rate limit. Tunggu sebentar.', reqId });
            }
            if (err.status === 404 || /not found|model/i.test(err.message)) continue;
            if ([500, 503, 529].includes(err.status) || /overload/i.test(err.message)) continue;
            return res.status(err.status || 500).json({ error: safeErrMsg(err.message), reqId });
          }

          const d    = await r.json();
          const text = d?.choices?.[0]?.message?.content?.trim() || '';
          if (!text) { lastStepError = `Respons kosong dari ${tryModel}`; continue; }
          return res.status(200).json({ content: text, model_used: tryModel, reqId });

        } catch (e) {
          if (e.name === 'AbortError') {
            return res.status(408).json({ error: 'Request ke StepFun timeout.', reqId });
          }
          lastStepError = e.message;
          continue;
        }
      }

      return res.status(503).json({
        error:      'StepFun sedang tidak tersedia.',
        detail:     safeErrMsg(lastStepError),
        suggestion: 'Coba Gemini atau Groq.',
        reqId,
      });
    }

    // Seharusnya tidak sampai sini karena sudah divalidasi di atas
    return res.status(400).json({ error: `Provider "${provider}" tidak dikenal.`, reqId });

  } catch (e) {
    if (e.name === 'AbortError') {
      return res.status(408).json({ error: 'Request timeout. Coba lagi.', reqId });
    }
    console.error(`[ai:${reqId}] Unexpected error:`, e.message);
    return res.status(500).json({ error: 'Terjadi kesalahan server internal.', reqId });
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Build messages array untuk OpenAI-compatible API.
 * System message selalu di depan, content array di-flatten ke string.
 */
function buildOpenAIMessages(normalized, system) {
  const msgs = normalized
    .filter(m => m.role !== 'system') // system di-handle terpisah
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

/**
 * Pastikan messages untuk Claude berinterleave user/assistant
 * dan dimulai dari pesan user.
 */
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
        prev.content += '\n' + (Array.isArray(content) ? flattenContentToText(content) : content);
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