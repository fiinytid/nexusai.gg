// lib/ai.ts — NEXUS AI Core Handler (TypeScript)

import crypto from "crypto";

// ─── TYPES & INTERFACES ───────────────────────────────────────────────────────

export type Provider =
  | "gemini"
  | "claude"
  | "openai"
  | "openrouter"
  | "deepseek"
  | "groq"
  | "mistral"
  | "stepfun";

export type ToolAction =
  | "datetime"
  | "calculate"
  | "fetch_url"
  | "json_parse"
  | "base64"
  | "hash"
  | "uuid"
  | "random"
  | "string_ops"
  | "json_transform";

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
  tools?: boolean;
  inject_tool_guide?: boolean;
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
  tool_calls?: ToolUsed[];
  model_used?: string;
  reasoning?: string;
  truncated?: boolean;
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

interface ToolUsed {
  action: string;
  success: boolean;
}

interface ParsedAction {
  action: string;
  params: Record<string, unknown>;
  raw: string;
}

interface ToolResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
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
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_TOOL_ROUNDS = 5;

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

/** Providers that natively support `response_format: { type: "json_object" }` */
const JSON_FORMAT_PROVIDERS = new Set<string>([
  "openai",
  "openrouter",
  "deepseek",
  "groq",
  "mistral",
]);

// ─── RATE LIMITING ────────────────────────────────────────────────────────────

const _rl = new Map<string, RateLimitEntry>();

function checkRateLimit(key: string, maxPerMin = 30): boolean {
  const now = Date.now();
  const k = String(key || "anon").substring(0, 128);

  if (!_rl.has(k)) _rl.set(k, { count: 0, reset: now + 60_000 });

  const r = _rl.get(k)!;
  if (now > r.reset) {
    r.count = 0;
    r.reset = now + 60_000;
  }
  return ++r.count <= maxPerMin;
}

// Periodic cleanup of expired rate-limit entries
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
} catch {
  /* Edge runtime — skip */
}

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

function trimContent(
  content: unknown,
  maxLen = MAX_MSG_CONTENT_LEN
): string | ContentPart[] {
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

/** Redacts API keys and Bearer tokens from error messages. */
function safeErrMsg(msg: unknown): string {
  if (!msg) return "Unknown error";
  return String(msg)
    .replace(/sk-[a-zA-Z0-9_\-]{10,}/g, "[REDACTED]")
    .replace(/AIza[a-zA-Z0-9_\-]{30,}/g, "[REDACTED]")
    .replace(/Bearer [a-zA-Z0-9_\-\.]{20,}/g, "Bearer [REDACTED]")
    .substring(0, 400);
}

// ─── MESSAGE NORMALIZER ───────────────────────────────────────────────────────

function normalizeMessages(
  msgs: Message[],
  provider: string,
  supportsMultimodal = false
): Message[] {
  if (!Array.isArray(msgs) || msgs.length === 0) return [];

  const normalized: Message[] = [];
  let totalChars = 0;
  const isGemini = provider === "gemini";

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
      role = isGemini ? "user" : "user";
    }

    let content = trimContent(m.content);
    const contentLen =
      typeof content === "string"
        ? content.length
        : JSON.stringify(content).length;
    if (totalChars + contentLen > MAX_TOTAL_CHARS) break;
    totalChars += contentLen;

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

    normalized.push({ role: role as MessageRole, content });
  }

  // Gemini requires strictly alternating user/model turns
  if (isGemini && normalized.length > 0) {
    const deduped: Message[] = [];
    for (const msg of normalized) {
      const prev = deduped[deduped.length - 1];
      if (prev && prev.role === msg.role) {
        if (typeof prev.content === "string" && typeof msg.content === "string") {
          prev.content += "\n" + msg.content;
        }
      } else {
        deduped.push({ ...msg });
      }
    }
    return deduped;
  }

  return normalized;
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
    const existingSignal = options.signal as AbortSignal | undefined;
    const fetchOptions: RequestInit = { ...options, signal: controller.signal };
    if (existingSignal) {
      existingSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    return response;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.min(ms, 5000)));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 1,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      // 4xx errors are definitive — don't retry
      if (response.status >= 400 && response.status < 500) return response;
      if (!response.ok && attempt < retries) {
        await sleep(800 * Math.pow(2, attempt));
        continue;
      }
      return response;
    } catch (e) {
      lastError = e;
      if ((e as Error).name === "AbortError") throw e;
      if (attempt < retries) await sleep(800 * Math.pow(2, attempt));
    }
  }
  throw lastError ?? new Error("Request failed after retries");
}

interface ApiError {
  message: string;
  status: number;
  data: unknown;
}

async function parseApiError(response: Response, providerName: string): Promise<ApiError> {
  let errMsg = `${providerName} error ${response.status}`;
  let errData: unknown = null;
  try {
    const text = await response.text();
    if (text) {
      errData = JSON.parse(text);
      const d = errData as Record<string, unknown>;
      errMsg =
        (d?.error as Record<string, unknown>)?.message as string
        ?? (d?.message as string)
        ?? (typeof d?.error === "string" ? d.error : null)
        ?? errMsg;
    }
  } catch {
    /* ignore */
  }
  return { message: errMsg, status: response.status, data: errData };
}

// ─── OPENAI-COMPATIBLE MESSAGE BUILDER ───────────────────────────────────────

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
      if (typeof prev.content === "string") {
        const extra = Array.isArray(content) ? flattenContentToText(content) : content;
        prev.content += "\n" + extra;
      }
    } else {
      result.push({ role: role as MessageRole, content });
    }
  }

  if (result.length > 0 && result[0].role !== firstRole) {
    result.unshift({ role: firstRole as MessageRole, content: "." });
  }

  return result;
}

// ─── TOOL CALLING ENGINE ──────────────────────────────────────────────────────

/** Parse ```json { "action": "..." } ``` blocks from AI response text. */
function parseActionBlocks(text: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  const re = /```json\s*(\{[\s\S]*?\})\s*```/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[1]) as Record<string, unknown>;
      if (obj && typeof obj.action === "string") {
        actions.push({
          action: String(obj.action).toLowerCase().trim(),
          params: (obj.params as Record<string, unknown>) || obj,
          raw: match[0],
        });
      }
    } catch {
      /* malformed JSON — skip */
    }
  }
  return actions;
}

/** Execute a single built-in tool. Returns a typed ToolResult. */
async function executeTool(
  action: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  switch (action as ToolAction | string) {

    // ── datetime ──────────────────────────────────────────────────────────────
    case "datetime": {
      const tz = String(params?.timezone || "UTC").substring(0, 64);
      const locale = String(params?.locale || "en-US").substring(0, 16);
      try {
        const now = new Date();
        const iso = now.toISOString();
        const fmt = new Intl.DateTimeFormat(locale, {
          timeZone: tz,
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "short",
        }).format(now);
        return {
          success: true,
          result: {
            iso,
            formatted: fmt,
            timezone: tz,
            unix: Math.floor(now.getTime() / 1000),
          },
        };
      } catch (e) {
        return { success: false, error: `datetime error: ${(e as Error).message}` };
      }
    }

    // ── calculate ─────────────────────────────────────────────────────────────
    case "calculate": {
      const expr = String(
        params?.expression ?? params?.expr ?? ""
      ).substring(0, 500);
      if (!expr) return { success: false, error: "Missing expression" };

      const safe = expr.replace(/\s+/g, "");
      if (
        !/^[0-9+\-*/().,%^e\s]+$/i.test(safe) &&
        !/^Math\.[a-z]+/i.test(expr)
      ) {
        return {
          success: false,
          error: "Expression contains unsafe characters. Only basic math is allowed.",
        };
      }
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function("Math", `"use strict"; return (${expr});`);
        const result = fn(Math) as unknown;
        if (typeof result !== "number" || !isFinite(result)) {
          return { success: false, error: "Result is not a finite number." };
        }
        return {
          success: true,
          result: { expression: expr, value: result, formatted: String(result) },
        };
      } catch (e) {
        return { success: false, error: `Calculation error: ${(e as Error).message}` };
      }
    }

    // ── fetch_url ─────────────────────────────────────────────────────────────
    case "fetch_url": {
      const url = String(params?.url || "").trim().substring(0, 2048);
      if (!url) return { success: false, error: "Missing url parameter." };
      if (!/^https?:\/\//i.test(url))
        return { success: false, error: "Only http/https URLs are allowed." };

      const blocked =
        /localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0/i;
      if (blocked.test(url))
        return { success: false, error: "Private or localhost URLs are not allowed." };

      try {
        const r = await fetchWithTimeout(
          url,
          {
            method: "GET",
            headers: {
              "User-Agent": "NEXUS-AI-Bot/1.0",
              Accept: "text/html,application/json,text/plain",
            },
          },
          10_000
        );

        const contentType = r.headers.get("content-type") || "";
        let body = "";

        if (contentType.includes("application/json")) {
          const json = await r.json() as unknown;
          body = JSON.stringify(json).substring(0, 4000);
        } else {
          const text = await r.text();
          body = text
            .replace(/<[^>]{0,200}>/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim()
            .substring(0, 4000);
        }

        return {
          success: true,
          result: { url, status: r.status, content_type: contentType, body },
        };
      } catch (e) {
        if ((e as Error).name === "AbortError")
          return { success: false, error: `fetch_url timed out after 10s: ${url}` };
        return { success: false, error: `fetch_url failed: ${(e as Error).message}` };
      }
    }

    // ── json_parse ────────────────────────────────────────────────────────────
    case "json_parse": {
      const raw = String(params?.text ?? params?.json ?? "").substring(0, 20_000);
      if (!raw) return { success: false, error: "Missing text to parse." };
      try {
        const parsed = JSON.parse(raw) as unknown;
        return {
          success: true,
          result: { parsed, type: typeof parsed, is_array: Array.isArray(parsed) },
        };
      } catch (e) {
        return { success: false, error: `JSON parse error: ${(e as Error).message}` };
      }
    }

    // ── base64 ────────────────────────────────────────────────────────────────
    case "base64": {
      const text = String(params?.text || "").substring(0, 50_000);
      const op = String(params?.operation || "encode").toLowerCase();
      const encoding = String(params?.encoding || "utf8");
      if (!text) return { success: false, error: "Missing text parameter." };
      try {
        if (op === "encode") {
          const result = Buffer.from(text, encoding as BufferEncoding).toString("base64");
          return { success: true, result: { encoded: result, original_length: text.length } };
        }
        if (op === "decode") {
          const result = Buffer.from(text, "base64").toString(encoding as BufferEncoding);
          return { success: true, result: { decoded: result, original_length: text.length } };
        }
        return { success: false, error: 'operation must be "encode" or "decode".' };
      } catch (e) {
        return { success: false, error: `base64 error: ${(e as Error).message}` };
      }
    }

    // ── hash ──────────────────────────────────────────────────────────────────
    case "hash": {
      const text = String(params?.text || "").substring(0, 100_000);
      const algorithm = String(params?.algorithm || "sha256").toLowerCase();
      const allowed = ["md5", "sha1", "sha256", "sha384", "sha512"] as const;
      if (!text) return { success: false, error: "Missing text parameter." };
      if (!allowed.includes(algorithm as typeof allowed[number])) {
        return {
          success: false,
          error: `Algorithm must be one of: ${allowed.join(", ")}`,
        };
      }
      try {
        const hash = crypto
          .createHash(algorithm)
          .update(text, "utf8")
          .digest("hex");
        return {
          success: true,
          result: { hash, algorithm, input_length: text.length },
        };
      } catch (e) {
        return { success: false, error: `hash error: ${(e as Error).message}` };
      }
    }

    // ── uuid ──────────────────────────────────────────────────────────────────
    case "uuid": {
      const count = Math.min(parseInt(String(params?.count ?? 1)), 20);
      const uuids = Array.from({ length: count }, () => crypto.randomUUID());
      return { success: true, result: { uuids, count } };
    }

    // ── random ────────────────────────────────────────────────────────────────
    case "random": {
      const type = String(params?.type || "number").toLowerCase();

      if (type === "number") {
        const min = parseFloat(String(params?.min ?? 0));
        const max = parseFloat(String(params?.max ?? 100));
        const digits = Math.min(parseInt(String(params?.decimal_places ?? 0)), 10);
        if (isNaN(min) || isNaN(max) || min >= max) {
          return { success: false, error: "Invalid min/max. min must be less than max." };
        }
        const value = parseFloat(
          (Math.random() * (max - min) + min).toFixed(digits)
        );
        return { success: true, result: { value, min, max, type: "number" } };
      }

      if (type === "string") {
        const length = Math.min(parseInt(String(params?.length ?? 16)), 256);
        const charset = String(params?.charset || "alphanumeric");
        const chars: Record<string, string> = {
          alphanumeric:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
          alpha: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
          numeric: "0123456789",
          hex: "0123456789abcdef",
          symbols:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*",
        };
        const pool = chars[charset] ?? chars.alphanumeric;
        const result = Array.from(
          { length },
          () => pool[Math.floor(Math.random() * pool.length)]
        ).join("");
        return { success: true, result: { value: result, length, charset, type: "string" } };
      }

      if (type === "pick") {
        const items = Array.isArray(params?.items)
          ? (params.items as unknown[]).slice(0, 100)
          : [];
        if (items.length === 0)
          return {
            success: false,
            error: 'items array is required for type "pick".',
          };
        const count = Math.min(parseInt(String(params?.count ?? 1)), items.length);
        const picked = [...items].sort(() => Math.random() - 0.5).slice(0, count);
        return {
          success: true,
          result: { picked, from_count: items.length, type: "pick" },
        };
      }

      return {
        success: false,
        error: `Unknown random type: "${type}". Use "number", "string", or "pick".`,
      };
    }

    // ── string_ops ────────────────────────────────────────────────────────────
    case "string_ops": {
      const text = String(params?.text || "").substring(0, 50_000);
      const op = String(params?.operation || "").toLowerCase();
      if (!text && op !== "repeat")
        return { success: false, error: "Missing text parameter." };

      switch (op) {
        case "length":
          return {
            success: true,
            result: {
              length: text.length,
              words: text.trim().split(/\s+/).filter(Boolean).length,
              lines: text.split("\n").length,
            },
          };
        case "reverse":
          return {
            success: true,
            result: { reversed: text.split("").reverse().join("") },
          };
        case "uppercase":
          return { success: true, result: { result: text.toUpperCase() } };
        case "lowercase":
          return { success: true, result: { result: text.toLowerCase() } };
        case "trim":
          return { success: true, result: { result: text.trim() } };
        case "replace": {
          const from = String(params?.from || "");
          const to = String(params?.to || "");
          const all = params?.all !== false;
          const result = all ? text.split(from).join(to) : text.replace(from, to);
          return {
            success: true,
            result: {
              result,
              replacements: all
                ? text.split(from).length - 1
                : text.includes(from)
                ? 1
                : 0,
            },
          };
        }
        case "split": {
          const sep = String(params?.separator ?? "\n");
          const parts = text.split(sep).slice(0, 1000);
          return { success: true, result: { parts, count: parts.length } };
        }
        case "contains": {
          const needle = String(params?.search || "");
          return {
            success: true,
            result: { contains: text.includes(needle), case_sensitive: true, search: needle },
          };
        }
        case "slice": {
          const start = parseInt(String(params?.start ?? 0));
          const end =
            params?.end !== undefined ? parseInt(String(params.end)) : undefined;
          return { success: true, result: { result: text.slice(start, end) } };
        }
        case "count_occurrences": {
          const needle = String(params?.search || "");
          if (!needle) return { success: false, error: "Missing search parameter." };
          const count = text.split(needle).length - 1;
          return { success: true, result: { count, search: needle } };
        }
        default:
          return {
            success: false,
            error: `Unknown string operation: "${op}". Valid: length, reverse, uppercase, lowercase, trim, replace, split, contains, slice, count_occurrences.`,
          };
      }
    }

    // ── json_transform ────────────────────────────────────────────────────────
    case "json_transform": {
      const raw = params?.data;
      const path = String(params?.path || "").substring(0, 200);
      if (raw === undefined) return { success: false, error: "Missing data parameter." };
      if (!path) return { success: true, result: { value: raw } };

      // Simple dot-notation path resolver (no eval)
      const parts = path
        .replace(/\[(\d+)\]/g, ".$1")
        .split(".")
        .filter(Boolean);
      let current: unknown = raw;
      for (const part of parts) {
        if (current === null || typeof current !== "object") {
          return {
            success: false,
            error: `Path "${path}" not found at segment "${part}".`,
          };
        }
        current = (current as Record<string, unknown>)[part];
      }
      return { success: true, result: { value: current, path, type: typeof current } };
    }

    // ── unknown ───────────────────────────────────────────────────────────────
    default:
      return {
        success: false,
        error: `Unknown action: "${action}". Available tools: datetime, calculate, fetch_url, json_parse, base64, hash, uuid, random, string_ops, json_transform.`,
      };
  }
}

/** Run all action blocks found in an AI response. Returns modified text + tool metadata. */
async function processToolCalls(responseText: string): Promise<{
  text: string;
  toolsUsed: ToolUsed[];
}> {
  const actions = parseActionBlocks(responseText);
  if (actions.length === 0) return { text: responseText, toolsUsed: [] };

  let processedText = responseText;
  const toolsUsed: ToolUsed[] = [];

  for (const { action, params, raw } of actions) {
    const toolResult = await executeTool(action, params);
    toolsUsed.push({ action, success: toolResult.success });

    const resultBlock = toolResult.success
      ? "```json\n" +
        JSON.stringify(
          { action, status: "success", result: toolResult.result },
          null,
          2
        ) +
        "\n```"
      : "```json\n" +
        JSON.stringify(
          { action, status: "error", error: toolResult.error },
          null,
          2
        ) +
        "\n```";

    // Replace the original action block with the result block (first occurrence only)
    processedText = processedText.replace(raw, resultBlock);
  }

  return { text: processedText, toolsUsed };
}

// ─── TOOL GUIDE BUILDER ────────────────────────────────────────────────────────

/** Returns an inline tool usage guide to be appended to the last user message. */
function buildToolGuide(): string {
  return `

---
**Available Tools (use \`\`\`json action blocks):**

To call a tool, include a code block in your response like this:
\`\`\`json
{ "action": "tool_name", "params": { ... } }
\`\`\`

**Tool Reference:**
- \`datetime\` — \`{ "timezone": "Asia/Jakarta", "locale": "en-US" }\`
- \`calculate\` — \`{ "expression": "Math.sqrt(144) + 2**10" }\`
- \`fetch_url\` — \`{ "url": "https://api.example.com/data" }\`
- \`json_parse\` — \`{ "text": "{...}" }\`
- \`base64\` — \`{ "text": "hello", "operation": "encode" }\`
- \`hash\` — \`{ "text": "password", "algorithm": "sha256" }\`
- \`uuid\` — \`{ "count": 3 }\`
- \`random\` — \`{ "type": "number", "min": 1, "max": 100 }\` | \`{ "type": "string", "length": 16 }\` | \`{ "type": "pick", "items": ["a","b","c"] }\`
- \`string_ops\` — \`{ "text": "Hello World", "operation": "reverse" }\`
- \`json_transform\` — \`{ "data": {...}, "path": "user.address.city" }\`

After the tool result is shown, continue your response normally.
---
`;
}

// ─── PROVIDER CALL ────────────────────────────────────────────────────────────

interface CallProviderOptions {
  provider: string;
  model: string;
  messages: Message[];
  system?: string;
  max_tokens: number;
  useJsonFormat: boolean;
  reqId: string;
}

/** Call a single AI provider and return raw text (or error). */
async function callProvider(opts: CallProviderOptions): Promise<ProviderResult> {
  const { provider, model, messages, system, max_tokens, useJsonFormat } = opts;

  // ── GEMINI ──────────────────────────────────────────────────────────────────
  if (provider === "gemini") {
    const key = getEnvKey("GEMINI_API_KEY");
    if (!key) return { error: "Gemini unavailable. GEMINI_API_KEY not set.", status: 503 };

    const normalized = normalizeMessages(messages, "gemini", true);
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
          return {
            text: String(c.text ?? c.content ?? "").substring(0, MAX_MSG_CONTENT_LEN),
          };
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
    if (system)
      geminiBody.systemInstruction = { parts: [{ text: system }] };

    const modelChain = [...new Set([model, "gemini-2.0-flash", "gemini-1.5-flash"])];
    let lastGeminiError = "Gemini did not respond";

    for (const tryModel of modelChain) {
      try {
        const encodedKey = encodeURIComponent(key);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          tryModel
        )}:generateContent?key=${encodedKey}`;

        const r = await fetchWithRetry(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(geminiBody),
          },
          1,
          REQUEST_TIMEOUT_MS
        );

        if (!r.ok) {
          const err = await parseApiError(r, "Gemini");
          lastGeminiError = err.message;
          if (
            [429, 500, 503, 529].includes(err.status) ||
            /overloaded|quota|RESOURCE_EXHAUSTED|UNAVAILABLE|overload/i.test(err.message)
          )
            continue;
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
        const text =
          candidate?.content?.parts
            ?.map((p) => p.text || "")
            .join("")
            .trim() || "";

        if (!text) {
          const reason = candidate?.finishReason;
          if (reason === "SAFETY")
            return {
              error: "Response blocked by Gemini safety filter. Try rephrasing.",
              status: 400,
            };
          if (reason === "RECITATION")
            return { error: "Gemini rejected due to potential plagiarism.", status: 400 };
          if (reason === "MAX_TOKENS")
            return { text, truncated: true, model_used: tryModel };
          lastGeminiError = `Empty response from ${tryModel} (finishReason: ${
            reason || "unknown"
          })`;
          continue;
        }

        return { text, model_used: tryModel };
      } catch (e) {
        if ((e as Error).name === "AbortError")
          return { error: "Gemini request timed out. Try a smaller model.", status: 408 };
        lastGeminiError = (e as Error).message;
        continue;
      }
    }

    return { error: `Gemini unavailable: ${safeErrMsg(lastGeminiError)}`, status: 503 };
  }

  // ── CLAUDE ──────────────────────────────────────────────────────────────────
  if (provider === "claude") {
    const key = getEnvKey("CLAUDE_API_KEY");
    if (!key) return { error: "Claude unavailable. CLAUDE_API_KEY not set.", status: 503 };

    const normalized = normalizeMessages(messages, "claude", true);
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
      return {
        error: "No valid messages for Claude (need at least 1 user message).",
        status: 400,
      };

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
          max_tokens: Math.min(max_tokens, 64_000),
          system: combinedSystem,
          messages: cleanedMsgs,
        }),
      },
      1,
      REQUEST_TIMEOUT_MS
    );

    if (!r.ok) {
      const err = await parseApiError(r, "Claude");
      if (err.status === 401)
        return { error: "Claude: Invalid API key. Check CLAUDE_API_KEY.", status: 401 };
      if (err.status === 429) return { error: "Claude rate limit. Please wait.", status: 429 };
      if (err.status === 402 || /credit|billing/i.test(err.message))
        return { error: "Anthropic credits exhausted.", status: 402 };
      return { error: safeErrMsg(err.message), status: err.status || 500 };
    }

    interface ClaudeResponse {
      content?: Array<{ type: string; text?: string }>;
    }
    const d = (await r.json()) as ClaudeResponse;
    const text =
      d?.content?.find((c) => c.type === "text")?.text?.trim() || "";
    if (!text) return { error: "Empty response from Claude.", status: 500 };
    return { text };
  }

  // ── OPENAI-COMPATIBLE HELPER ──────────────────────────────────────────────
  async function openAICompatible(
    providerName: string,
    apiUrl: string,
    key: string,
    extraHeaders: Record<string, string> = {},
    tokenLimit = 128_000
  ): Promise<ProviderResult> {
    const normalized = normalizeMessages(messages, providerName, false);
    const allMsgs = buildOpenAIMessages(normalized, system);

    if (
      allMsgs.length === 0 ||
      (allMsgs.length === 1 && allMsgs[0].role === "system")
    ) {
      return { error: `No user messages for ${providerName}.`, status: 400 };
    }

    const body = {
      model,
      messages: allMsgs,
      max_tokens: Math.min(max_tokens, tokenLimit),
      temperature: 0.7,
      ...(useJsonFormat && JSON_FORMAT_PROVIDERS.has(providerName)
        ? { response_format: { type: "json_object" } }
        : {}),
    };

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
      1,
      REQUEST_TIMEOUT_MS
    );

    if (!r.ok) {
      const err = await parseApiError(r, providerName);
      if (err.status === 401)
        return { error: `${providerName}: Invalid API key.`, status: 401 };
      if (err.status === 429)
        return { error: `${providerName}: Rate limit hit. Try again soon.`, status: 429 };
      if (
        err.status === 402 ||
        /insufficient.quota|insufficient.balance/i.test(err.message)
      )
        return { error: `${providerName}: Insufficient credits.`, status: 402 };
      if (
        err.status === 413 ||
        /context.length|too long|context_length/i.test(err.message)
      )
        return {
          error: `${providerName}: Message too long. Start a new chat.`,
          status: 413,
        };
      return { error: safeErrMsg(err.message), status: err.status || 500 };
    }

    interface OpenAIResponse {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string } | string;
    }
    const d = (await r.json()) as OpenAIResponse;
    const text = d?.choices?.[0]?.message?.content?.trim() || "";
    if (!text) {
      const detail = d?.error
        ? safeErrMsg(
            typeof d.error === "string"
              ? d.error
              : (d.error as { message?: string })?.message
          )
        : "Empty response";
      return { error: `${providerName}: ${detail}.`, status: 500 };
    }
    return { text };
  }

  // ── OPENAI ──────────────────────────────────────────────────────────────────
  if (provider === "openai") {
    const key = getEnvKey("OPENAI_API_KEY");
    if (!key) return { error: "OpenAI unavailable. OPENAI_API_KEY not set.", status: 503 };
    return openAICompatible(
      "openai",
      "https://api.openai.com/v1/chat/completions",
      key,
      {},
      128_000
    );
  }

  // ── OPENROUTER ──────────────────────────────────────────────────────────────
  if (provider === "openrouter") {
    const key = getEnvKey("OPENROUTER_API_KEY");
    if (!key)
      return { error: "OpenRouter unavailable. OPENROUTER_API_KEY not set.", status: 503 };
    return openAICompatible(
      "openrouter",
      "https://openrouter.ai/api/v1/chat/completions",
      key,
      {
        "HTTP-Referer":
          getEnvKey("NEXT_PUBLIC_SITE_URL") || "https://nexusai-roblox.vercel.app",
        "X-Title": "NEXUS AI",
      },
      200_000
    );
  }

  // ── DEEPSEEK ─────────────────────────────────────────────────────────────────
  if (provider === "deepseek") {
    const key = getEnvKey("DEEPSEEK_API_KEY");
    if (!key)
      return { error: "DeepSeek unavailable. DEEPSEEK_API_KEY not set.", status: 503 };

    const normalized = normalizeMessages(messages, "deepseek", false);
    const allMsgs = buildOpenAIMessages(normalized, system);

    if (
      allMsgs.length === 0 ||
      (allMsgs.length === 1 && allMsgs[0].role === "system")
    )
      return { error: "No user messages for DeepSeek.", status: 400 };

    const r = await fetchWithRetry(
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: allMsgs,
          max_tokens: Math.min(max_tokens, 65_536),
          temperature: 0.7,
          ...(useJsonFormat ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      1,
      REQUEST_TIMEOUT_MS
    );

    if (!r.ok) {
      const err = await parseApiError(r, "DeepSeek");
      if (err.status === 401)
        return { error: "DeepSeek: Invalid API key.", status: 401 };
      if (err.status === 402 || /insufficient|balance/i.test(err.message))
        return { error: "DeepSeek: Insufficient credits.", status: 402 };
      if (err.status === 429)
        return { error: "DeepSeek: Rate limit. Please wait.", status: 429 };
      return { error: safeErrMsg(err.message), status: err.status || 500 };
    }

    interface DeepSeekResponse {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
        };
      }>;
    }
    const d = (await r.json()) as DeepSeekResponse;
    const choice = d?.choices?.[0];
    if (!choice) return { error: "Empty response from DeepSeek.", status: 500 };

    const mainContent = String(choice.message?.content ?? "").trim();
    const reasoning = String(choice.message?.reasoning_content ?? "").trim();

    let finalText = "";
    if (reasoning) finalText += "🧠 **Reasoning (DeepSeek R1):**\n" + reasoning + "\n\n---\n\n";
    finalText += mainContent;

    if (!finalText.trim()) return { error: "Empty response from DeepSeek.", status: 500 };
    return { text: finalText, reasoning: reasoning || undefined };
  }

  // ── GROQ ────────────────────────────────────────────────────────────────────
  if (provider === "groq") {
    const key = getEnvKey("GROQ_API_KEY");
    if (!key) return { error: "Groq unavailable. GROQ_API_KEY not set.", status: 503 };

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

    const normalized = normalizeMessages(messages, "groq", false);
    const allMsgs = buildOpenAIMessages(normalized, system);

    if (
      allMsgs.length === 0 ||
      (allMsgs.length === 1 && allMsgs[0].role === "system")
    )
      return { error: "No user messages for Groq.", status: 400 };

    const r = await fetchWithRetry(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: allMsgs,
          max_tokens: Math.min(max_tokens, modelMax),
          temperature: 0.7,
          ...(useJsonFormat ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      1,
      REQUEST_TIMEOUT_MS
    );

    if (!r.ok) {
      const err = await parseApiError(r, "Groq");
      if (err.status === 401) return { error: "Groq: Invalid API key.", status: 401 };
      if (err.status === 429)
        return { error: "Groq: Rate limit. Try again soon.", status: 429 };
      if (
        err.status === 413 ||
        /context.length|too long|context_length/i.test(err.message)
      )
        return { error: "Message too long for Groq. Start a new chat.", status: 413 };
      return { error: safeErrMsg(err.message), status: err.status || 500 };
    }

    interface GroqResponse {
      choices?: Array<{ message?: { content?: string } }>;
    }
    const d = (await r.json()) as GroqResponse;
    const text = d?.choices?.[0]?.message?.content?.trim() || "";
    if (!text) return { error: "Empty response from Groq.", status: 500 };
    return { text };
  }

  // ── MISTRAL ──────────────────────────────────────────────────────────────────
  if (provider === "mistral") {
    const key = getEnvKey("MISTRAL_API_KEY");
    if (!key)
      return { error: "Mistral unavailable. MISTRAL_API_KEY not set.", status: 503 };
    return openAICompatible(
      "mistral",
      "https://api.mistral.ai/v1/chat/completions",
      key,
      {},
      65_536
    );
  }

  // ── STEPFUN ──────────────────────────────────────────────────────────────────
  if (provider === "stepfun") {
    const key = getEnvKey("STEPFUN_API_KEY");
    if (!key)
      return {
        error: "StepFun unavailable. Add STEPFUN_API_KEY to Vercel Environment Variables.",
        status: 503,
      };

    const normalized = normalizeMessages(messages, "stepfun", false);
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

    const primaryFallback = stepfunFallback[model] || "step-1-8k";
    const modelChain = [...new Set([model, primaryFallback, "step-1-8k"])];
    let lastStepError = "StepFun did not respond";

    for (const tryModel of modelChain) {
      const maxTok = Math.min(max_tokens, stepfunMaxTokens[tryModel] || 8_192);
      try {
        const r = await fetchWithRetry(
          "https://api.stepfun.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: tryModel,
              messages: allMsgs,
              max_tokens: maxTok,
              temperature: 0.7,
            }),
          },
          1,
          REQUEST_TIMEOUT_MS
        );

        if (!r.ok) {
          const err = await parseApiError(r, "StepFun");
          lastStepError = err.message;
          if (err.status === 401)
            return { error: "StepFun: Invalid API key.", status: 401 };
          if (err.status === 402 || /insufficient|balance/i.test(err.message))
            return { error: "StepFun: Insufficient credits.", status: 402 };
          if (err.status === 429)
            return { error: "StepFun: Rate limit. Please wait.", status: 429 };
          if (err.status === 404 || /not found|model/i.test(err.message)) continue;
          if ([500, 503, 529].includes(err.status) || /overload/i.test(err.message))
            continue;
          return { error: safeErrMsg(err.message), status: err.status || 500 };
        }

        interface StepFunResponse {
          choices?: Array<{ message?: { content?: string } }>;
        }
        const d = (await r.json()) as StepFunResponse;
        const text = d?.choices?.[0]?.message?.content?.trim() || "";
        if (!text) {
          lastStepError = `Empty response from ${tryModel}`;
          continue;
        }
        return { text, model_used: tryModel };
      } catch (e) {
        if ((e as Error).name === "AbortError")
          return { error: "StepFun request timed out.", status: 408 };
        lastStepError = (e as Error).message;
        continue;
      }
    }

    return {
      error: `StepFun unavailable: ${safeErrMsg(lastStepError)}. Try Gemini or Groq.`,
      status: 503,
    };
  }

  // ── UNKNOWN PROVIDER ──────────────────────────────────────────────────────
  return { error: `Unknown provider: "${provider}".`, status: 400 };
}

// ─── MAIN PROCESSOR ───────────────────────────────────────────────────────────

/**
 * processAIRequest — core handler, fully App Router compatible.
 *
 * @param params.body    Validated request body
 * @param params.ip      Caller IP for rate limiting
 * @param params.userId  Optional user ID for per-user rate limiting
 */
export async function processAIRequest({
  body,
  ip = "unknown",
  userId = "",
}: AIRequestParams): Promise<AIResult> {
  const reqId = crypto.randomBytes(4).toString("hex");

  // ── Rate limiting ──────────────────────────────────────────────────────────
  if (!checkRateLimit(`ai_ip:${ip}`, 60)) {
    return {
      status: 429,
      data: { error: "Rate limit exceeded. Try again in 1 minute.", reqId },
    };
  }
  if (userId && !checkRateLimit(`ai_user:${userId}`, 40)) {
    return {
      status: 429,
      data: { error: "Per-user rate limit exceeded. Please wait.", reqId },
    };
  }

  // ── Validate body ──────────────────────────────────────────────────────────
  if (!body || typeof body !== "object") {
    return { status: 400, data: { error: "Request body is invalid or empty.", reqId } };
  }

  const provider = sanitizeProvider(body.provider) as Provider;
  const model = sanitizeModelName(body.model);
  const system = body.system
    ? String(body.system).substring(0, MAX_SYSTEM_LEN)
    : undefined;
  const max_tokens = Math.min(Math.max(parseInt(String(body.max_tokens)) || 1000, 1), 64_000);
  const enableTools = body.tools !== false; // tools enabled by default
  const useJsonFormat = body.response_format?.type === "json_object";
  const injectToolGuide = enableTools && body.inject_tool_guide === true; // opt-in

  if (!provider) {
    return { status: 400, data: { error: "`provider` is required.", reqId } };
  }
  if (!VALID_PROVIDERS.has(provider)) {
    return {
      status: 400,
      data: {
        error: `Unknown provider "${provider}". Available: ${[...VALID_PROVIDERS].join(", ")}`,
        reqId,
      },
    };
  }
  if (!model) {
    return { status: 400, data: { error: "`model` is required.", reqId } };
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return {
      status: 400,
      data: { error: "`messages` must be a non-empty array.", reqId },
    };
  }

  // ── Build working messages ─────────────────────────────────────────────────
  let workingMessages: Message[] = body.messages.slice(0, MAX_MESSAGES);

  // Optionally inject tool guide into the last user message (opt-in only)
  if (injectToolGuide && enableTools) {
    const lastUserIdx = [...workingMessages]
      .reverse()
      .findIndex((m) => String(m.role || "").toLowerCase() === "user");

    if (lastUserIdx !== -1) {
      const realIdx = workingMessages.length - 1 - lastUserIdx;
      const msg = { ...workingMessages[realIdx] };
      const guide = buildToolGuide();
      msg.content =
        (typeof msg.content === "string"
          ? msg.content
          : flattenContentToText(msg.content as ContentPart[])) + guide;
      workingMessages = [
        ...workingMessages.slice(0, realIdx),
        msg,
        ...workingMessages.slice(realIdx + 1),
      ];
    }
  }

  console.log(
    `[ai:${reqId}] provider=${provider} model=${model} msgs=${workingMessages.length} tools=${enableTools} json=${useJsonFormat} ip=${ip}`
  );

  try {
    // ── Tool calling loop ────────────────────────────────────────────────────
    let round = 0;
    let lastProviderResult: ProviderResult | null = null;
    let conversationMsgs: Message[] = workingMessages;
    const allToolsUsed: ToolUsed[] = [];

    while (round <= MAX_TOOL_ROUNDS) {
      const result = await callProvider({
        provider,
        model,
        messages: conversationMsgs,
        system,
        max_tokens,
        useJsonFormat,
        reqId,
      });

      if (result.error) {
        return { status: result.status || 500, data: { error: result.error, reqId } };
      }

      lastProviderResult = result;

      if (!enableTools) break;

      const rawText = result.text ?? "";
      const actions = parseActionBlocks(rawText);
      if (actions.length === 0) break; // No tools called — final response

      if (round >= MAX_TOOL_ROUNDS) {
        console.warn(`[ai:${reqId}] Max tool rounds (${MAX_TOOL_ROUNDS}) reached`);
        lastProviderResult = {
          ...result,
          text:
            (result.text || "") +
            `\n\n> ⚠️ Tool call limit (${MAX_TOOL_ROUNDS} rounds) reached.`,
        };
        break;
      }

      // Execute tools and build result text
      const { text: processedText, toolsUsed } = await processToolCalls(rawText);
      allToolsUsed.push(...toolsUsed);

      // Feed tool results back into the conversation for the next round
      conversationMsgs = [
        ...conversationMsgs,
        { role: "assistant", content: rawText },
        {
          role: "user",
          content: `Tool results have been executed. Here are the outputs:\n\n${processedText}\n\nPlease continue with your response using these results.`,
        },
      ];

      lastProviderResult = { ...result, text: processedText };
      round++;
    }

    // ── Final response ────────────────────────────────────────────────────────
    if (!lastProviderResult?.text) {
      return { status: 500, data: { error: "Empty response from provider.", reqId } };
    }

    const responseData: AIResponseData = {
      content: lastProviderResult.text,
      reqId,
      ...(allToolsUsed.length > 0 ? { tool_calls: allToolsUsed } : {}),
      ...(lastProviderResult.model_used ? { model_used: lastProviderResult.model_used } : {}),
      ...(lastProviderResult.reasoning ? { reasoning: lastProviderResult.reasoning } : {}),
      ...(lastProviderResult.truncated ? { truncated: lastProviderResult.truncated } : {}),
    };

    return { status: 200, data: responseData };
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      return { status: 408, data: { error: "Request timed out. Please try again.", reqId } };
    }
    console.error(`[ai:${reqId}] Unexpected error:`, (e as Error)?.message ?? e);
    return { status: 500, data: { error: "Internal server error.", reqId } };
  }
}

// ─── LEGACY PAGES ROUTER HANDLER ─────────────────────────────────────────────

import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Default export — legacy Next.js Pages Router handler.
 * For App Router, use `processAIRequest` directly.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AIResponseData>
): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-User-Id, X-Username");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST.", reqId: "" });
    return;
  }

  const rawIp = String(
    req.headers["x-forwarded-for"] ?? req.headers["x-real-ip"] ?? ""
  );
  const ip = rawIp.split(",")[0].trim() || "unknown";
  const userId = String(req.headers["x-user-id"] || "").substring(0, 64);

  const result = await processAIRequest({
    body: req.body as AIRequestBody,
    ip,
    userId,
  });
  res.status(result.status).json(result.data);
}