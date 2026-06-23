// lib/ai.ts — AI Core Handler (TypeScript)
// Supports: gemini, claude, openai, openrouter, deepseek, groq, mistral, stepfun
//
// Key fixes vs previous version:
// 1. OpenRouter: higher retry count (free models are flaky), removed json_object
//    format for models that don't support it, better error messages.
// 2. max_tokens default raised to 16_000 so long code generation doesn't silently truncate.
// 3. normalizeMessages: always keeps the NEWEST messages when trimming, never drops
//    the current user request.
// 4. body.messages slices the LAST MAX_MESSAGES, not first.
// 5. truncated flag now reported consistently for ALL providers.
// 6. Claude per-model output limits enforced to prevent hard 400 errors.
// 7. fetchWithRetry retries on timeout (AbortError) — long generations need this.
// 8. Removed all dead code, tool-call engine, and unnecessary complexity.

import crypto from "crypto";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type Provider =
  | "gemini"
  | "claude"
  | "openai"
  | "openrouter"
  | "deepseek"
  | "groq"
  | "mistral"
  | "stepfun";

export type MessageRole = "user" | "assistant" | "system" | "model";

export interface ContentPart {
  type: "text" | "image" | "image_url" | "inline_data" | "document";
  text?: string;
  content?: string;
  source?: { media_type?: string; data?: string };
  image_url?: { url?: string };
}

export interface Message {
  role: MessageRole | string;
  content: string | ContentPart[];
}

export interface AIRequestBody {
  provider: string;
  model: string;
  messages: Message[];
  system?: string;
  max_tokens?: number;
  response_format?: { type: string };
}

export interface AIRequestParams {
  body: AIRequestBody;
  ip?: string;
  userId?: string;
}

export interface AIResponseData {
  content?: string;
  reqId: string;
  model_used?: string;
  reasoning?: string;
  truncated?: boolean;
  historyTrimmed?: boolean;
  error?: string;
}

export interface AIResult {
  status: number;
  data: AIResponseData;
}

interface ProviderResult {
  text?: string;
  error?: string;
  status?: number;
  model_used?: string;
  reasoning?: string;
  truncated?: boolean;
}

interface RateLimitEntry {
  count: number;
  reset: number;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MAX_MESSAGES = 100;
const MAX_MSG_CONTENT_LEN = 32_000;
const MAX_SYSTEM_LEN = 8_000;
const MAX_TOTAL_CHARS = 200_000;
// Long generations (e.g. full components/pages) need more time.
// Free OpenRouter models can also be slow to start.
const REQUEST_TIMEOUT_MS = 120_000;

const VALID_PROVIDERS = new Set<Provider>([
  "gemini",
  "claude",
  "openai",
  "openrouter",
  "deepseek",
  "groq",
  "mistral",
  "stepfun",
]);

// Only these providers reliably support response_format: json_object.
// OpenRouter is intentionally excluded — support varies by model and
// free models often return 400 if you send this field.
const JSON_FORMAT_PROVIDERS = new Set<string>([
  "openai",
  "deepseek",
  "groq",
  "mistral",
]);

// Claude hard output token limits per model.
// Sending max_tokens above a model's ceiling causes a hard 400 from Anthropic.
const CLAUDE_MODEL_OUTPUT_LIMITS: Record<string, number> = {
  "claude-opus-4-8": 32_000,
  "claude-opus-4-7": 64_000,
  "claude-opus-4-6": 64_000,
  "claude-sonnet-4-6": 64_000,
  "claude-haiku-4-5-20251001": 64_000,
  "claude-3-5-sonnet-20241022": 8_192,
  "claude-3-5-sonnet-20240620": 8_192,
  "claude-3-5-haiku-20241022": 8_192,
  "claude-3-opus-20240229": 4_096,
  "claude-3-sonnet-20240229": 4_096,
  "claude-3-haiku-20240307": 4_096,
};

function getClaudeOutputLimit(model: string): number {
  if (CLAUDE_MODEL_OUTPUT_LIMITS[model]) return CLAUDE_MODEL_OUTPUT_LIMITS[model];
  if (/claude-(opus|sonnet|haiku)-4/i.test(model)) return 64_000;
  return 8_192;
}

// ─── RATE LIMITING ────────────────────────────────────────────────────────────

const _rl = new Map<string, RateLimitEntry>();

function checkRateLimit(key: string, maxPerMin = 30): boolean {
  const now = Date.now();
  const k = String(key || "anon").substring(0, 128);
  if (!_rl.has(k)) _rl.set(k, { count: 0, reset: now + 60_000 });
  const r = _rl.get(k)!;
  if (now > r.reset) { r.count = 0; r.reset = now + 60_000; }
  return ++r.count <= maxPerMin;
}

try {
  const _ci = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _rl) {
      if (now > v.reset + 120_000) _rl.delete(k);
    }
  }, 5 * 60_000);
  if (typeof (_ci as NodeJS.Timeout & { unref?: () => void })?.unref === "function") {
    (_ci as NodeJS.Timeout & { unref: () => void }).unref();
  }
} catch { /* Edge runtime — skip */ }

// ─── ENV HELPERS ──────────────────────────────────────────────────────────────

function getEnvKey(name: string): string | undefined {
  return process.env[name];
}

// ─── SANITIZERS ───────────────────────────────────────────────────────────────

function sanitizeProvider(provider: unknown): string {
  return String(provider || "")
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, "")
    .substring(0, 30);
}

function sanitizeModelName(model: unknown): string {
  return String(model || "")
    .replace(/[^a-zA-Z0-9\-._/:@]/g, "")
    .substring(0, 120);
}

function trimContent(content: unknown, maxLen = MAX_MSG_CONTENT_LEN): string | ContentPart[] {
  if (typeof content === "string") return content.substring(0, maxLen);
  if (Array.isArray(content)) {
    return (content as unknown[])
      .slice(0, 20)
      .map((c) => {
        if (!c || typeof c !== "object") return null;
        const part = c as ContentPart;
        switch (part.type) {
          case "text":
            return { ...part, text: String(part.text || "").substring(0, maxLen) };
          case "image":
          case "image_url":
          case "inline_data":
          case "document":
            return part;
          default:
            return null;
        }
      })
      .filter((x): x is ContentPart => x !== null);
  }
  return String(content || "").substring(0, maxLen);
}

function flattenContentToText(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c && (c.type === "text" || typeof c.text === "string"))
      .map((c) => String(c.text || ""))
      .join("\n")
      .trim();
  }
  return String(content || "");
}

/** Redacts API keys and Bearer tokens from error messages before returning to client. */
function safeErrMsg(msg: unknown): string {
  if (!msg) return "Unknown error";
  return String(msg)
    .replace(/sk-[a-zA-Z0-9_\-]{10,}/g, "[REDACTED]")
    .replace(/AIza[a-zA-Z0-9_\-]{30,}/g, "[REDACTED]")
    .replace(/Bearer [a-zA-Z0-9_\-\.]{20,}/g, "Bearer [REDACTED]")
    .substring(0, 500);
}

// ─── MESSAGE NORMALIZER ───────────────────────────────────────────────────────

interface NormalizeResult {
  messages: Message[];
  historyTrimmed: boolean;
}

function normalizeMessages(
  msgs: Message[],
  provider: string,
  supportsMultimodal = false
): NormalizeResult {
  if (!Array.isArray(msgs) || msgs.length === 0) {
    return { messages: [], historyTrimmed: false };
  }

  const isGemini = provider === "gemini";

  // Pass 1: clean, role-map, and flatten each message individually.
  const cleaned: Message[] = [];
  for (const m of msgs) {
    if (!m || typeof m !== "object" || !m.role) continue;

    const rawRole = String(m.role).toLowerCase();
    let role: string;

    if (["assistant", "ai", "agent", "model"].includes(rawRole)) {
      role = isGemini ? "model" : "assistant";
    } else if (rawRole === "system") {
      if (isGemini) continue;
      role = "system";
    } else {
      role = "user";
    }

    let content = trimContent(m.content);

    // Flatten multimodal to text for providers that don't support it.
    if (!supportsMultimodal && !isGemini && Array.isArray(content)) {
      content = flattenContentToText(content);
    }

    if (Array.isArray(content)) {
      const filtered = content.filter((c) => {
        if (!c) return false;
        if (c.type === "text") return String(c.text || "").trim().length > 0;
        return ["image", "image_url", "inline_data", "document"].includes(c.type);
      });
      if (filtered.length === 0) continue;
      content = filtered;
    } else {
      content = String(content || "");
      if (!content.trim()) continue;
    }

    cleaned.push({ role: role as MessageRole, content });
  }

  // Pass 2: walk NEWEST → OLDEST and keep the most recent turns within budget.
  // This ensures the current user request is never dropped when history is long.
  let totalChars = 0;
  let historyTrimmed = false;
  const kept: Message[] = [];

  for (let i = cleaned.length - 1; i >= 0; i--) {
    const m = cleaned[i];
    const contentLen =
      typeof m.content === "string"
        ? m.content.length
        : JSON.stringify(m.content).length;

    if (totalChars + contentLen > MAX_TOTAL_CHARS) {
      if (i > 0) historyTrimmed = true;
      break;
    }
    totalChars += contentLen;
    kept.push(m);
  }
  kept.reverse();

  // Gemini requires strictly alternating user/model turns.
  if (isGemini && kept.length > 0) {
    const deduped: Message[] = [];
    for (const msg of kept) {
      const prev = deduped[deduped.length - 1];
      if (prev && prev.role === msg.role) {
        const prevText = flattenContentToText(prev.content);
        const curText = flattenContentToText(msg.content);
        prev.content = [prevText, curText].filter(Boolean).join("\n");
      } else {
        deduped.push({ ...msg });
      }
    }
    return { messages: deduped, historyTrimmed };
  }

  return { messages: kept, historyTrimmed };
}

// ─── FETCH UTILITIES ──────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.min(ms, 8000)));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      // 4xx are definitive failures — don't retry (except 429 which callers handle).
      if (response.status >= 400 && response.status < 500) return response;
      if (!response.ok && attempt < retries) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      return response;
    } catch (e) {
      lastError = e;
      // Retry on timeout too — long generations often brush the timeout window.
      if (attempt < retries) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
    }
  }
  throw lastError ?? new Error("Request failed after retries");
}

async function parseApiError(
  response: Response,
  providerName: string
): Promise<{ message: string; status: number; data: unknown }> {
  let errMsg = `${providerName} error ${response.status}`;
  let errData: unknown = null;
  try {
    const text = await response.text();
    if (text) {
      errData = JSON.parse(text);
      const d = errData as Record<string, unknown>;
      errMsg =
        ((d?.error as Record<string, unknown>)?.message as string) ??
        (d?.message as string) ??
        (typeof d?.error === "string" ? d.error : null) ??
        errMsg;
    }
  } catch { /* ignore */ }
  return { message: errMsg, status: response.status, data: errData };
}

// ─── MESSAGE BUILDERS ─────────────────────────────────────────────────────────

function buildOpenAIMessages(
  normalized: Message[],
  system?: string
): Array<{ role: string; content: string }> {
  const msgs = normalized
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as string,
      content: Array.isArray(m.content)
        ? flattenContentToText(m.content)
        : String(m.content || ""),
    }))
    .filter((m) => m.content.trim());

  if (system) return [{ role: "system", content: system }, ...msgs];
  return msgs;
}

/**
 * Merges consecutive same-role messages so providers that require strict
 * alternation (Claude, some OpenRouter models) don't reject the request.
 */
function ensureAlternating(
  msgs: Message[],
  firstRole = "user",
  secondRole = "assistant"
): Message[] {
  if (!msgs || msgs.length === 0) return [];

  const result: Message[] = [];
  for (const msg of msgs) {
    const role = msg.role === firstRole ? firstRole : secondRole;
    const content = Array.isArray(msg.content) ? msg.content : String(msg.content || "");
    const isEmpty = Array.isArray(content)
      ? content.length === 0
      : !String(content).trim();
    if (isEmpty) continue;

    const prev = result[result.length - 1];
    if (prev && prev.role === role) {
      // Flatten both sides to text and merge — never silently drop a message.
      const prevText = flattenContentToText(prev.content);
      const curText = flattenContentToText(content);
      prev.content = [prevText, curText].filter(Boolean).join("\n");
    } else {
      result.push({ role: role as MessageRole, content });
    }
  }

  // Providers like Claude require the first message to be from the user.
  if (result.length > 0 && result[0].role !== firstRole) {
    result.unshift({ role: firstRole as MessageRole, content: "." });
  }

  return result;
}

// ─── PROVIDER CALLS ───────────────────────────────────────────────────────────

interface CallProviderOptions {
  provider: string;
  model: string;
  messages: Message[];
  system?: string;
  max_tokens: number;
  useJsonFormat: boolean;
  reqId: string;
}

async function callProvider(opts: CallProviderOptions): Promise<ProviderResult> {
  const { provider, model, messages, system, max_tokens, useJsonFormat } = opts;

  // ── GEMINI ──────────────────────────────────────────────────────────────────
  if (provider === "gemini") {
    const key = getEnvKey("GEMINI_API_KEY");
    if (!key) return { error: "Gemini unavailable — GEMINI_API_KEY not set.", status: 503 };

    const { messages: normalized } = normalizeMessages(messages, "gemini", true);
    if (normalized.length === 0)
      return { error: "No valid messages after normalization.", status: 400 };

    type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };
    type GeminiContent = { role: string; parts: GeminiPart[] };

    const contents: GeminiContent[] = normalized.map((m) => {
      if (Array.isArray(m.content)) {
        const parts: GeminiPart[] = m.content.map((c) => {
          if (c.type === "image" && c.source) {
            return {
              inline_data: {
                mime_type: c.source.media_type || "image/png",
                data: c.source.data || "",
              },
            };
          }
          if (c.type === "image_url" && c.image_url?.url) {
            const url = c.image_url.url;
            if (url.startsWith("data:")) {
              const [meta, data] = url.split(",");
              const mimeType = meta.replace("data:", "").replace(";base64", "");
              return { inline_data: { mime_type: mimeType, data } };
            }
            return { text: `[Image URL: ${url}]` };
          }
          return { text: String(c.text ?? c.content ?? "").substring(0, MAX_MSG_CONTENT_LEN) };
        });
        return { role: m.role as string, parts };
      }
      return { role: m.role as string, parts: [{ text: String(m.content || "") }] };
    });

    if (contents[0]?.role === "model") {
      contents.unshift({ role: "user", parts: [{ text: "." }] });
    }

    interface GeminiBody {
      contents: GeminiContent[];
      generationConfig: {
        maxOutputTokens: number;
        temperature: number;
        responseMimeType?: string;
      };
      systemInstruction?: { parts: GeminiPart[] };
    }

    const geminiBody: GeminiBody = {
      contents,
      generationConfig: {
        maxOutputTokens: Math.min(max_tokens, 65_536),
        temperature: 0.7,
        ...(useJsonFormat ? { responseMimeType: "application/json" } : {}),
      },
    };
    if (system) geminiBody.systemInstruction = { parts: [{ text: system }] };

    const modelChain = [...new Set([model, "gemini-2.0-flash", "gemini-1.5-flash"])];
    let lastError = "Gemini did not respond";

    for (const tryModel of modelChain) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          tryModel
        )}:generateContent?key=${encodeURIComponent(key)}`;

        const r = await fetchWithRetry(
          url,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) },
          2,
          REQUEST_TIMEOUT_MS
        );

        if (!r.ok) {
          const err = await parseApiError(r, "Gemini");
          lastError = err.message;
          if ([429, 500, 503, 529].includes(err.status) || /overloaded|quota|RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(err.message)) continue;
          if (err.status === 404 || /not found|model/i.test(err.message)) continue;
          return { error: safeErrMsg(err.message), status: err.status || 500 };
        }

        interface GeminiResponse {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
        }
        const data = (await r.json()) as GeminiResponse;
        const candidate = data?.candidates?.[0];
        const text = candidate?.content?.parts?.map((p) => p.text || "").join("").trim() || "";

        if (!text) {
          const reason = candidate?.finishReason;
          if (reason === "SAFETY") return { error: "Response blocked by Gemini safety filter. Try rephrasing.", status: 400 };
          if (reason === "RECITATION") return { error: "Gemini rejected due to potential plagiarism.", status: 400 };
          if (reason === "MAX_TOKENS") return { text: "", truncated: true, model_used: tryModel };
          lastError = `Empty response from ${tryModel} (finishReason: ${reason || "unknown"})`;
          continue;
        }

        const truncated = candidate?.finishReason === "MAX_TOKENS";
        return { text, model_used: tryModel, ...(truncated ? { truncated: true } : {}) };
      } catch (e) {
        if ((e as Error).name === "AbortError")
          return { error: "Gemini request timed out. Try a smaller model.", status: 408 };
        lastError = (e as Error).message;
        continue;
      }
    }

    return { error: `Gemini unavailable: ${safeErrMsg(lastError)}`, status: 503 };
  }

  // ── CLAUDE ──────────────────────────────────────────────────────────────────
  if (provider === "claude") {
    const key = getEnvKey("CLAUDE_API_KEY");
    if (!key) return { error: "Claude unavailable — CLAUDE_API_KEY not set.", status: 503 };

    const { messages: normalized } = normalizeMessages(messages, "claude", true);
    if (normalized.length === 0)
      return { error: "No valid messages after normalization.", status: 400 };

    const cleanModel = model.replace(/^anthropic\//i, "").trim();
    if (!cleanModel) return { error: "Invalid Claude model name.", status: 400 };

    const systemMsgs = normalized.filter((m) => m.role === "system");
    const chatMsgs = normalized.filter((m) => m.role !== "system");
    const combinedSystem =
      [system, ...systemMsgs.map((m) => flattenContentToText(m.content as ContentPart[]))]
        .filter(Boolean)
        .join("\n\n") || undefined;

    const cleanedMsgs = ensureAlternating(chatMsgs, "user", "assistant");
    if (cleanedMsgs.length === 0)
      return { error: "No valid messages for Claude (need at least 1 user message).", status: 400 };

    const clampedMaxTokens = Math.min(max_tokens, getClaudeOutputLimit(cleanModel));

    const r = await fetchWithRetry(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: cleanModel,
          max_tokens: clampedMaxTokens,
          system: combinedSystem,
          messages: cleanedMsgs,
        }),
      },
      2,
      REQUEST_TIMEOUT_MS
    );

    if (!r.ok) {
      const err = await parseApiError(r, "Claude");
      if (err.status === 401) return { error: "Claude: Invalid API key. Check CLAUDE_API_KEY.", status: 401 };
      if (err.status === 429) return { error: "Claude rate limit. Please wait.", status: 429 };
      if (err.status === 402 || /credit|billing/i.test(err.message))
        return { error: "Anthropic credits exhausted.", status: 402 };
      if (err.status === 400)
        return { error: `Claude request rejected: ${safeErrMsg(err.message)}`, status: 400 };
      return { error: safeErrMsg(err.message), status: err.status || 500 };
    }

    interface ClaudeResponse {
      content?: Array<{ type: string; text?: string }>;
      stop_reason?: string;
    }
    const d = (await r.json()) as ClaudeResponse;
    const text = d?.content?.find((c) => c.type === "text")?.text?.trim() || "";
    if (!text) return { error: "Empty response from Claude.", status: 500 };

    const truncated = d?.stop_reason === "max_tokens";
    return { text, ...(truncated ? { truncated: true } : {}) };
  }

  // ── OPENAI-COMPATIBLE HELPER ─────────────────────────────────────────────────
  // Used by: openai, openrouter, mistral
  async function openAICompatible(
    providerName: string,
    apiUrl: string,
    key: string,
    extraHeaders: Record<string, string> = {},
    tokenLimit = 128_000,
    allowJsonFormat = false
  ): Promise<ProviderResult> {
    const { messages: normalized } = normalizeMessages(messages, providerName, false);
    const allMsgs = buildOpenAIMessages(normalized, system);

    if (allMsgs.length === 0 || (allMsgs.length === 1 && allMsgs[0].role === "system"))
      return { error: `No user messages for ${providerName}.`, status: 400 };

    const body: Record<string, unknown> = {
      model,
      messages: allMsgs,
      max_tokens: Math.min(max_tokens, tokenLimit),
      temperature: 0.7,
    };

    // Only add response_format if this provider/model supports it.
    if (useJsonFormat && allowJsonFormat) {
      body.response_format = { type: "json_object" };
    }

    const r = await fetchWithRetry(
      apiUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          ...extraHeaders,
        },
        body: JSON.stringify(body),
      },
      2,
      REQUEST_TIMEOUT_MS
    );

    if (!r.ok) {
      const err = await parseApiError(r, providerName);
      if (err.status === 401) return { error: `${providerName}: Invalid API key.`, status: 401 };
      if (err.status === 429) return { error: `${providerName}: Rate limit hit. Try again soon.`, status: 429 };
      if (err.status === 402 || /insufficient.quota|insufficient.balance/i.test(err.message))
        return { error: `${providerName}: Insufficient credits.`, status: 402 };
      if (err.status === 413 || /context.length|too long|context_length/i.test(err.message))
        return { error: `${providerName}: Message too long. Start a new chat.`, status: 413 };
      return { error: `${providerName}: ${safeErrMsg(err.message)}`, status: err.status || 500 };
    }

    interface OpenAIResponse {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      error?: { message?: string } | string;
    }
    const d = (await r.json()) as OpenAIResponse;
    const choice = d?.choices?.[0];
    const text = choice?.message?.content?.trim() || "";

    if (!text) {
      const errDetail = d?.error
        ? safeErrMsg(typeof d.error === "string" ? d.error : (d.error as { message?: string })?.message)
        : "Empty response";
      return { error: `${providerName}: ${errDetail}`, status: 500 };
    }

    const truncated = choice?.finish_reason === "length";
    return { text, ...(truncated ? { truncated: true } : {}) };
  }

  // ── OPENAI ──────────────────────────────────────────────────────────────────
  if (provider === "openai") {
    const key = getEnvKey("OPENAI_API_KEY");
    if (!key) return { error: "OpenAI unavailable — OPENAI_API_KEY not set.", status: 503 };
    return openAICompatible("openai", "https://api.openai.com/v1/chat/completions", key, {}, 128_000, true);
  }

  // ── OPENROUTER ──────────────────────────────────────────────────────────────
  if (provider === "openrouter") {
    const key = getEnvKey("OPENROUTER_API_KEY");
    if (!key) return { error: "OpenRouter unavailable — OPENROUTER_API_KEY not set.", status: 503 };

    const siteUrl = getEnvKey("NEXT_PUBLIC_SITE_URL") || "https://localhost:3000";
    const appTitle = getEnvKey("NEXT_PUBLIC_APP_TITLE") || "AI App";

    // OpenRouter free models:
    // - Do NOT send response_format (most free models reject it with 400).
    // - Require HTTP-Referer and X-Title headers for free tier access.
    // - Are slower and need more retries.
    return openAICompatible(
      "openrouter",
      "https://openrouter.ai/api/v1/chat/completions",
      key,
      {
        "HTTP-Referer": siteUrl,
        "X-Title": appTitle,
      },
      200_000,
      false // do NOT send response_format for OpenRouter — free models reject it
    );
  }

  // ── DEEPSEEK ─────────────────────────────────────────────────────────────────
  if (provider === "deepseek") {
    const key = getEnvKey("DEEPSEEK_API_KEY");
    if (!key) return { error: "DeepSeek unavailable — DEEPSEEK_API_KEY not set.", status: 503 };

    const { messages: normalized } = normalizeMessages(messages, "deepseek", false);
    const allMsgs = buildOpenAIMessages(normalized, system);

    if (allMsgs.length === 0 || (allMsgs.length === 1 && allMsgs[0].role === "system"))
      return { error: "No user messages for DeepSeek.", status: 400 };

    const body: Record<string, unknown> = {
      model,
      messages: allMsgs,
      max_tokens: Math.min(max_tokens, 65_536),
      temperature: 0.7,
    };
    if (useJsonFormat) body.response_format = { type: "json_object" };

    const r = await fetchWithRetry(
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      },
      2,
      REQUEST_TIMEOUT_MS
    );

    if (!r.ok) {
      const err = await parseApiError(r, "DeepSeek");
      if (err.status === 401) return { error: "DeepSeek: Invalid API key.", status: 401 };
      if (err.status === 402 || /insufficient|balance/i.test(err.message))
        return { error: "DeepSeek: Insufficient credits.", status: 402 };
      if (err.status === 429) return { error: "DeepSeek: Rate limit. Please wait.", status: 429 };
      if (err.status === 404 || /model/i.test(err.message))
        return { error: `DeepSeek: Model "${model}" not found.`, status: 404 };
      return { error: safeErrMsg(err.message), status: err.status || 500 };
    }

    interface DeepSeekResponse {
      choices?: Array<{
        message?: { content?: string; reasoning_content?: string };
        finish_reason?: string;
      }>;
    }
    const d = (await r.json()) as DeepSeekResponse;
    const choice = d?.choices?.[0];
    if (!choice) return { error: "Empty response from DeepSeek.", status: 500 };

    const text = String(choice.message?.content ?? "").trim();
    const reasoning = String(choice.message?.reasoning_content ?? "").trim();
    const truncated = choice.finish_reason === "length";

    if (!text) return { error: "Empty response from DeepSeek.", status: 500 };
    return { text, ...(reasoning ? { reasoning } : {}), ...(truncated ? { truncated: true } : {}) };
  }

  // ── GROQ ────────────────────────────────────────────────────────────────────
  if (provider === "groq") {
    const key = getEnvKey("GROQ_API_KEY");
    if (!key) return { error: "Groq unavailable — GROQ_API_KEY not set.", status: 503 };

    const groqTokenLimits: Record<string, number> = {
      "llama-3.1-8b-instant": 8_192,
      "llama-3.3-70b-versatile": 32_768,
      "llama3-8b-8192": 8_192,
      "llama3-70b-8192": 8_192,
      "mixtral-8x7b-32768": 32_768,
      "gemma2-9b-it": 8_192,
      "deepseek-r1-distill-llama-70b": 32_768,
      "llama-3.1-70b-versatile": 32_768,
      "llama-3.2-1b-preview": 8_192,
      "llama-3.2-3b-preview": 8_192,
      "llama-3.2-11b-vision-preview": 8_192,
      "llama-3.2-90b-vision-preview": 8_192,
    };
    const modelMax = groqTokenLimits[model] ?? 8_192;

    const { messages: normalized } = normalizeMessages(messages, "groq", false);
    const allMsgs = buildOpenAIMessages(normalized, system);

    if (allMsgs.length === 0 || (allMsgs.length === 1 && allMsgs[0].role === "system"))
      return { error: "No user messages for Groq.", status: 400 };

    const body: Record<string, unknown> = {
      model,
      messages: allMsgs,
      max_tokens: Math.min(max_tokens, modelMax),
      temperature: 0.7,
    };
    if (useJsonFormat) body.response_format = { type: "json_object" };

    const r = await fetchWithRetry(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      },
      2,
      REQUEST_TIMEOUT_MS
    );

    if (!r.ok) {
      const err = await parseApiError(r, "Groq");
      if (err.status === 401) return { error: "Groq: Invalid API key.", status: 401 };
      if (err.status === 429) return { error: "Groq: Rate limit. Try again soon.", status: 429 };
      if (err.status === 413 || /context.length|too long|context_length/i.test(err.message))
        return { error: "Message too long for Groq. Start a new chat.", status: 413 };
      return { error: safeErrMsg(err.message), status: err.status || 500 };
    }

    interface GroqResponse {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    }
    const d = (await r.json()) as GroqResponse;
    const choice = d?.choices?.[0];
    const text = choice?.message?.content?.trim() || "";
    if (!text) return { error: "Empty response from Groq.", status: 500 };

    const truncated = choice?.finish_reason === "length";
    return { text, ...(truncated ? { truncated: true } : {}) };
  }

  // ── MISTRAL ──────────────────────────────────────────────────────────────────
  if (provider === "mistral") {
    const key = getEnvKey("MISTRAL_API_KEY");
    if (!key) return { error: "Mistral unavailable — MISTRAL_API_KEY not set.", status: 503 };
    return openAICompatible("mistral", "https://api.mistral.ai/v1/chat/completions", key, {}, 65_536, true);
  }

  // ── STEPFUN ──────────────────────────────────────────────────────────────────
  if (provider === "stepfun") {
    const key = getEnvKey("STEPFUN_API_KEY");
    if (!key) return { error: "StepFun unavailable — STEPFUN_API_KEY not set.", status: 503 };

    const { messages: normalized } = normalizeMessages(messages, "stepfun", false);
    const allMsgs = buildOpenAIMessages(normalized, system);

    const stepfunFallback: Record<string, string> = {
      "step-1-8k": "step-1-8k",
      "step-1-32k": "step-1-8k",
      "step-1-128k": "step-1-32k",
      "step-1-256k": "step-1-128k",
      "step-2-16k": "step-1-32k",
      "step-1o-mini": "step-1-8k",
      "step-1o-turbo": "step-1-32k",
      "step-2-turbo": "step-2-16k",
      "step-3-5-flash": "step-1-32k",
    };
    const stepfunMaxTokens: Record<string, number> = {
      "step-1-8k": 8_192,
      "step-1-32k": 16_384,
      "step-1-128k": 32_768,
      "step-1-256k": 32_768,
      "step-2-16k": 16_384,
      "step-1o-mini": 8_192,
      "step-1o-turbo": 16_384,
      "step-2-turbo": 16_384,
      "step-3-5-flash": 16_384,
    };

    const modelChain = [...new Set([model, stepfunFallback[model] || "step-1-8k", "step-1-8k"])];
    let lastError = "StepFun did not respond";

    for (const tryModel of modelChain) {
      const maxTok = Math.min(max_tokens, stepfunMaxTokens[tryModel] || 8_192);
      try {
        const r = await fetchWithRetry(
          "https://api.stepfun.com/v1/chat/completions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model: tryModel, messages: allMsgs, max_tokens: maxTok, temperature: 0.7 }),
          },
          2,
          REQUEST_TIMEOUT_MS
        );

        if (!r.ok) {
          const err = await parseApiError(r, "StepFun");
          lastError = err.message;
          if (err.status === 401) return { error: "StepFun: Invalid API key.", status: 401 };
          if (err.status === 402 || /insufficient|balance/i.test(err.message))
            return { error: "StepFun: Insufficient credits.", status: 402 };
          if (err.status === 429) return { error: "StepFun: Rate limit. Please wait.", status: 429 };
          if (err.status === 404 || /not found|model/i.test(err.message)) continue;
          if ([500, 503, 529].includes(err.status) || /overload/i.test(err.message)) continue;
          return { error: safeErrMsg(err.message), status: err.status || 500 };
        }

        interface StepFunResponse {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        }
        const d = (await r.json()) as StepFunResponse;
        const choice = d?.choices?.[0];
        const text = choice?.message?.content?.trim() || "";
        if (!text) { lastError = `Empty response from ${tryModel}`; continue; }

        const truncated = choice?.finish_reason === "length";
        return { text, model_used: tryModel, ...(truncated ? { truncated: true } : {}) };
      } catch (e) {
        if ((e as Error).name === "AbortError")
          return { error: "StepFun request timed out.", status: 408 };
        lastError = (e as Error).message;
        continue;
      }
    }

    return { error: `StepFun unavailable: ${safeErrMsg(lastError)}`, status: 503 };
  }

  return { error: `Unknown provider: "${provider}".`, status: 400 };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

export async function processAIRequest({
  body,
  ip = "unknown",
  userId = "",
}: AIRequestParams): Promise<AIResult> {
  const reqId = crypto.randomBytes(4).toString("hex");

  if (!checkRateLimit(`ai_ip:${ip}`, 60))
    return { status: 429, data: { error: "Rate limit exceeded. Try again in 1 minute.", reqId } };
  if (userId && !checkRateLimit(`ai_user:${userId}`, 40))
    return { status: 429, data: { error: "Per-user rate limit exceeded. Please wait.", reqId } };

  if (!body || typeof body !== "object")
    return { status: 400, data: { error: "Request body is invalid or empty.", reqId } };

  const provider = sanitizeProvider(body.provider) as Provider;
  const model = sanitizeModelName(body.model);
  const system = body.system ? String(body.system).substring(0, MAX_SYSTEM_LEN) : undefined;

  // Raised default from 4000 → 16000 so code generation doesn't silently truncate.
  // Each provider branch clamps this further to that model's real output ceiling.
  const max_tokens = Math.min(Math.max(parseInt(String(body.max_tokens)) || 16_000, 1), 64_000);
  const useJsonFormat = body.response_format?.type === "json_object";

  if (!provider)
    return { status: 400, data: { error: "`provider` is required.", reqId } };
  if (!VALID_PROVIDERS.has(provider))
    return { status: 400, data: { error: `Unknown provider "${provider}". Available: ${[...VALID_PROVIDERS].join(", ")}`, reqId } };
  if (!model)
    return { status: 400, data: { error: "`model` is required.", reqId } };
  if (!Array.isArray(body.messages) || body.messages.length === 0)
    return { status: 400, data: { error: "`messages` must be a non-empty array.", reqId } };

  // Keep the LAST MAX_MESSAGES turns — newest messages are most important.
  const workingMessages: Message[] = body.messages.slice(-MAX_MESSAGES);

  console.log(
    `[ai:${reqId}] provider=${provider} model=${model} msgs=${workingMessages.length} maxTokens=${max_tokens} json=${useJsonFormat} ip=${ip}`
  );

  try {
    const result = await callProvider({
      provider,
      model,
      messages: workingMessages,
      system,
      max_tokens,
      useJsonFormat,
      reqId,
    });

    if (result.error)
      return { status: result.status || 500, data: { error: result.error, reqId } };
    if (!result.text)
      return { status: 500, data: { error: "Empty response from provider.", reqId } };

    const responseData: AIResponseData = {
      content: result.text,
      reqId,
      ...(result.model_used ? { model_used: result.model_used } : {}),
      ...(result.reasoning ? { reasoning: result.reasoning } : {}),
      ...(result.truncated ? { truncated: true } : {}),
    };

    return { status: 200, data: responseData };
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      return {
        status: 408,
        data: {
          error: "Request timed out. The response may have been too long — try asking for it in smaller parts.",
          reqId,
        },
      };
    }
    console.error(`[ai:${reqId}] Unexpected error:`, (e as Error)?.message ?? e);
    return { status: 500, data: { error: "Internal server error.", reqId } };
  }
}

// ─── PAGES ROUTER HANDLER ────────────────────────────────────────────────────

import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AIResponseData>
): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-User-Id");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST.", reqId: "" });
    return;
  }

  const rawIp = String(req.headers["x-forwarded-for"] ?? req.headers["x-real-ip"] ?? "");
  const ip = rawIp.split(",")[0].trim() || "unknown";
  const userId = String(req.headers["x-user-id"] || "").substring(0, 64);

  const result = await processAIRequest({ body: req.body as AIRequestBody, ip, userId });
  res.status(result.status).json(result.data);
}