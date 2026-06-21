import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";

// ── VERSION ────────────────────────────────────────────────────────────────────
const REQUIRED_PLUGIN_VERSION = "V1.3.29";

// ── TUNABLES ───────────────────────────────────────────────────────────────────
const SESSION_TTL           = 24 * 60 * 60 * 1_000;
const SESSION_TOKEN_MAX     = 128;
const MIN_ADMIN_TOKEN_LEN   = 16;
const MAX_BODY_FIELD_LEN    = 50_000;
const MAX_LOG_ENTRIES       = 500;
const MAX_HIST_ENTRIES      = 200;
const MAX_USER_HIST         = 100;
const RATE_USER_PER_MIN     = 150;
const RATE_IP_PER_MIN       = 300;
const RATE_BURST_COUNT      = 20;
const RATE_BURST_WINDOW     = 5_000;
const TTL_TOOLBOX           = 5  * 60_000;
const TTL_ASSET             = 30 * 60_000;
const TTL_USER_INFO         = 10 * 60_000;
const TTL_GAME_INFO         = 15 * 60_000;
const MAX_BATCH_COMMANDS    = 200;
const MAX_MULTI_TARGETS     = 20;
const MAX_AI_FEED_ENTRIES   = 300;
const AI_FEED_DEFAULT_LIMIT = 50;

// Nonce TTL: how long a nonce is remembered to prevent replay attacks.
// Set to 5 minutes — wide enough to cover slow plugin poll cycles.
// FIX: Previously, nonce replay was too aggressive because every GET poll
// also triggered nonce checking. Nonces are now ONLY checked on POST requests.
const NONCE_TTL_MS = 5 * 60_000;

// ── ALLOWED ORIGINS ────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set<string>([
  "https://nexusai-rbx.vercel.app",
  "https://nexusai.gg",
  "http://localhost:3000",
  "https://fine-setter-131.convex.site",   // production
  "https://brazen-lapwing-697.convex.site", // development
]);

// ── VALID ASSET TYPE SETS ──────────────────────────────────────────────────────
const VALID_TOOLBOX_TYPES = new Set<string>([
  "Model", "Plugin", "Audio", "Decal", "Image", "MeshPart",
  "Package", "Hat", "Shirt", "Pants", "TShirt", "Gear", "Animation",
]);

const INSERTABLE_ASSET_TYPES = new Set<string>([
  "Model", "Plugin", "Package", "Hat", "Shirt", "Pants",
  "TShirt", "Gear", "Animation", "MeshPart", "Unknown",
]);

// ── ADMIN-GATED ACTIONS ────────────────────────────────────────────────────────
// Returns the set of action names that require an admin token.
// Configured via the NEXUS_ADMIN_ACTIONS environment variable (comma-separated).
// If the env var is not set, no extra actions are admin-gated beyond the
// explicit checks already in place (e.g. dispatch_multi_target).
function getAdminGatedActions(): Set<string> {
  const env = process.env.NEXUS_ADMIN_ACTIONS ?? "";
  if (!env) return new Set();
  return new Set(env.split(",").map((s) => s.trim()).filter(Boolean));
}

// ── ACTION NAME MIGRATION ──────────────────────────────────────────────────────
// Maps legacy action names (sent by older plugin builds or older web/AI callers)
// to their current snake_case equivalents. Applied once immediately after parsing
// the action name, so all downstream logic only ever sees the new names.
const ACTION_RENAME_MAP: Record<string, string> = {
  // Plugin → server (report actions)
  script_content:         "read_script",
  log_output:             "output_log",
  output_data:            "output_report",
  workspace_data:         "workspace_scan",
  game_scan:              "workspace_scan",
  search_result:          "toolbox_search_report",
  descendants:            "descendants_report",
  object_properties:      "properties_report",
  set_properties_result:  "properties_set_report",
  action_list:            "action_list_report",
  asset_library:          "asset_library_report",
  assets_listed:          "asset_library_report",
  asset_id_result:        "asset_id_report",
  asset_folder_list:      "asset_folder_report",
  module_deployed:        "module_deploy_report",
  modules_list:           "module_list_report",
  terrain_materials:      "terrain_materials_report",
  runcode_result:         "runcode_report",
  expression_result:      "expression_report",
  query_result:           "query_report",
  mention_resolved:       "mention_report",
  mention_not_found:      "mention_report",
  plugin_error:           "plugin_error_report",
  script_list:            "script_list_report",
  check_list:             "script_list_report",
  script_lines:           "script_lines_report",
  nxai_connect:           "plugin_connect",
  nxai_disconnect:        "plugin_disconnect",

  // Web/AI → plugin (dispatch actions)
  inject_command:         "dispatch_command",
  batch_commands:         "dispatch_batch",
  execute_json:           "dispatch_from_text",
  execute_text:           "dispatch_from_text",
  multi_target:           "dispatch_multi_target",
};

function migrateActionName(raw: string): string {
  return ACTION_RENAME_MAP[raw] ?? raw;
}

// ── INTERFACES ─────────────────────────────────────────────────────────────────

interface QueueCommand {
  action: string;
  _priority?: string;
  _ts?: number;
  _user?: string;
  _target_user?: string;
  [key: string]: unknown;
}

interface ProjectData {
  projectId: string;
  projectName: string;
  placeId: string;
  updatedAt: number;
}

interface AssetResult {
  valid: boolean;
  assetId: string;
  name: string;
  description?: string;
  assetType: string;
  creator: { name: string; type: string; userId: string };
  isPublic: boolean;
  insertable: boolean;
  insertScript: string;
  unverified?: boolean;
}

interface ToolboxResult {
  assets: AssetItem[];
  nextCursor: string | null;
  total: number;
}

interface AssetItem {
  assetId: string;
  name: string;
  description: string;
  assetType: string;
  creator: { name: string; type: string; userId: string };
  thumbnail: string;
  updated: string | null;
}

interface UserInfo {
  userId: number;
  username: string;
  displayName: string;
  description: string;
  isBanned: boolean;
  created: string | null;
  avatarUrl: string;
}

interface GameInfo {
  universeId: number;
  placeId: number;
  name: string;
  description: string;
  creator: { name: string; type: string };
  playing: number;
  visits: number;
  maxPlayers: number;
  favoritedCount: number;
  genre: string;
  thumbnailUrl: string;
}

interface DocsResult {
  results: DocEntry[];
  source: string;
  query: string;
}

interface DocEntry {
  title: string;
  url: string;
  snippet: string;
  category: string;
  score?: number;
  keywords?: string;
}

interface AuthResult {
  ok: boolean;
  status?: number;
  error?: string;
}

interface FilterResult {
  safe: QueueCommand[];
  removed: string[];
}

// AiFeedEntry: a single durable, ordered message the AI can read later.
// Every plugin report (read_script, output_log, runcode_report, etc.) is
// appended here in addition to being saved as a snapshot via saveData().
// The AI polls GET ?ai_feed=1&user=... to retrieve unread entries; entries
// are marked read atomically so no entry is delivered twice.
interface AiFeedEntry {
  id: string;
  username: string;
  kind: string;
  summary: string;
  data: unknown;
  ts: number;
  read: boolean;
}

// ── SANITISERS ─────────────────────────────────────────────────────────────────

function san(user: unknown): string {
  if (user == null) return "default";
  return String(user)
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .toLowerCase()
    .substring(0, 40) || "default";
}

function sanStr(str: unknown, maxLen = 200): string {
  if (typeof str !== "string") str = String(str ?? "");
  return (str as string)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/[<>]/g, "")
    .substring(0, maxLen);
}

function sanStrSafe(str: unknown, maxLen = MAX_BODY_FIELD_LEN): string {
  if (typeof str !== "string") str = String(str ?? "");
  return (str as string)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .substring(0, maxLen);
}

function escapeHtml(str: unknown, maxLen = 500): string {
  return String(str ?? "")
    .substring(0, maxLen)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

function sanInt(val: unknown, def = 0, min = 0, max = 999_999): number {
  const n = parseInt(String(val ?? ""), 10);
  return isNaN(n) ? def : Math.max(min, Math.min(max, n));
}

function sanObj(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

function sanArr<T = unknown>(val: unknown, maxLen = 500): T[] {
  return Array.isArray(val) ? (val as T[]).slice(0, maxLen) : [];
}

function sanPriority(val: unknown): string {
  return ["critical", "high", "normal", "low"].includes(String(val ?? ""))
    ? String(val)
    : "normal";
}

function sanAction(val: unknown): string {
  return String(val || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .substring(0, 80);
}

function sanUrl(val: unknown): string | null {
  const s = sanStr(val, 500).trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

// ── JSON HELPERS ───────────────────────────────────────────────────────────────

function cleanControlChars(text: string): string {
  if (typeof text !== "string") return "";
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out += c >= 32 || c === 9 || c === 10 || c === 13 ? text[i] : " ";
  }
  return out;
}

function robustJsonParse(raw: unknown): unknown {
  if (!raw || typeof raw !== "string") return null;
  const s = cleanControlChars(raw.trim());
  if (!s) return null;

  // Attempt 1: standard parse
  try { return JSON.parse(s); } catch (_) {}
  // Attempt 2: strip trailing commas
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, "$1")); } catch (_) {}
  // Attempt 3: unquoted keys
  try {
    return JSON.parse(
      s
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:(?!:))/g, '$1"$2"$3')
    );
  } catch (_) {}
  // Attempt 4: Lua-style objects (key = value notation)
  try {
    return JSON.parse(
      s
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/:\s*nil\b/g, ": null")
        .replace(
          /([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*=\s*)/g,
          '$1"$2": '
        )
        .replace(
          /([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:(?![=:>]))/g,
          (_m: string, p: string, k: string) => `${p}"${k}": `
        )
    );
  } catch (_) {}
  return null;
}

function findJsonObjects(text: string): string[] {
  const results: string[] = [];
  let i = 0;
  const len = text.length;
  while (i < len) {
    while (i < len && text[i] !== "{") i++;
    if (i >= len) break;
    let depth = 0, inString = false, escape = false;
    const start = i;
    for (; i < len; i++) {
      const ch = text[i];
      if (escape)                  { escape = false; continue; }
      if (ch === "\\" && inString) { escape = true;  continue; }
      if (ch === '"')              { inString = !inString; continue; }
      if (inString)                continue;
      if (ch === "{")              depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { results.push(text.slice(start, i + 1)); i++; break; }
      }
    }
    if (depth !== 0) i = start + 1;
  }
  return results;
}

function extractCommandsFromText(text: string): QueueCommand[] {
  if (!text || typeof text !== "string") return [];
  const all: QueueCommand[] = [];
  const seen = new Set<string>();

  function addCmd(cmd: unknown): void {
    if (!cmd || typeof cmd !== "object" || !("action" in cmd)) return;
    const c = cmd as QueueCommand;
    c.action = migrateActionName(
      String(c.action).toLowerCase().replace(/[^a-z0-9_]/g, "")
    );
    if (!c.action) return;
    const key = JSON.stringify(c);
    if (!seen.has(key)) { seen.add(key); all.push(c); }
  }

  function processItem(item: unknown): void {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) { for (const sub of item) processItem(sub); return; }
    const obj = item as Record<string, unknown>;
    if (obj["action"] === "dispatch_batch" && Array.isArray(obj["commands"])) {
      for (const sub of obj["commands"]) {
        if ((sub as QueueCommand)?.action) addCmd(sub);
      }
    } else if (obj["actions"] && Array.isArray(obj["actions"])) {
      for (const sub of obj["actions"]) {
        if ((sub as QueueCommand)?.action) addCmd(sub);
      }
    } else {
      addCmd(item);
    }
  }

  const codeBlockRe = /```(?:[a-zA-Z0-9]*\s*)?([\s\S]*?)```/g;
  const codeBlockRanges: [number, number][] = [];
  let m: RegExpExecArray | null;

  while ((m = codeBlockRe.exec(text)) !== null) {
    const bc = m[1].trim();
    codeBlockRanges.push([m.index, m.index + m[0].length]);
    if (!bc) continue;
    const direct = robustJsonParse(bc);
    if (direct) { processItem(direct); continue; }
    for (const raw of findJsonObjects(bc)) {
      const p = robustJsonParse(raw);
      if (p) processItem(p);
    }
  }

  // Mask code block ranges before scanning bare text for JSON objects
  let textNoBraces = text;
  for (let r = codeBlockRanges.length - 1; r >= 0; r--) {
    const [start, end] = codeBlockRanges[r];
    textNoBraces =
      textNoBraces.slice(0, start) +
      " ".repeat(end - start) +
      textNoBraces.slice(end);
  }
  for (const raw of findJsonObjects(textNoBraces)) {
    if (!/"action"\s*:/.test(raw)) continue;
    const parsed = robustJsonParse(raw);
    if (parsed) processItem(parsed);
  }
  return all;
}

// ── RESPONSE HELPERS ───────────────────────────────────────────────────────────

function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin":  ALLOWED_ORIGINS.has(origin) ? origin : "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": [
      "Content-Type", "Authorization", "X-Admin-Token",
      "X-Session-Token", "X-Nexus-Nonce", "X-Nexus-Signature",
      "X-Roblox-Signature", "X-Api-Key",
    ].join(", "),
    "Access-Control-Max-Age":       "86400",
    "X-Content-Type-Options":       "nosniff",
    "X-Frame-Options":              "DENY",
    "Referrer-Policy":              "strict-origin-when-cross-origin",
  };
}

function jsonResp(
  data: unknown,
  status = 200,
  cors: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({ ...(data as object), ts: Date.now() }),
    { status, headers: { "Content-Type": "application/json", ...cors } }
  );
}

function errResp(
  cors: Record<string, string>,
  code: number,
  error: string,
  extra: Record<string, unknown> = {}
): Response {
  const status = code >= 400 && code < 600 ? code : 500;
  return jsonResp({ ok: false, status: "error", error, ...extra }, status, cors);
}

function rateLimitResp(
  cors: Record<string, string>,
  retryAfter = 60
): Response {
  return jsonResp(
    { ok: false, status: "error", error: "Rate limit exceeded.", retryAfter },
    429,
    cors
  );
}

// ── CRYPTO HELPERS ─────────────────────────────────────────────────────────────

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function generateNonce(len = 32): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(
    new Uint8Array(buf),
    (b) => b.toString(16).padStart(2, "0")
  ).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data   = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufToHex(digest);
}

// ── TOKEN VERIFICATION ─────────────────────────────────────────────────────────

function verifyAdminToken(request: Request, queryToken?: string): boolean {
  const env = process.env.ADMIN_TOKEN ?? "";
  if (!env || env.length < MIN_ADMIN_TOKEN_LEN) return false;

  const candidate =
    (request.headers.get("authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim() ||
    (request.headers.get("x-admin-token") ?? "").trim() ||
    (queryToken ?? "");

  if (!candidate) return false;
  return timingSafeCompare(candidate, env);
}

// Verifies X-Nexus-Signature / X-Roblox-Signature as HMAC-SHA256 over the raw
// request body. The raw body string must be passed exactly as received —
// re-serializing a parsed JS object would break signature verification.
async function verifyPluginHmac(request: Request, rawBody: string): Promise<boolean> {
  const secret = process.env.PLUGIN_HMAC_SECRET ?? "";
  if (!secret || secret.length < 16) return true; // HMAC is opt-in; skip if unconfigured

  const sig = (
    (request.headers.get("x-nexus-signature") ?? "") ||
    (request.headers.get("x-roblox-signature") ?? "")
  ).trim();

  if (!sig) return true; // Signature is optional unless the deployer mandates it

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac         = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const expectedHex = bufToHex(mac);
    const provided    = sig.toLowerCase().replace(/^sha256=/, "");
    return timingSafeCompare(provided, expectedHex);
  } catch {
    return false;
  }
}

// FIX: Nonce replay guard now only runs on POST requests. Previously it ran
// on every request, causing "Nonce already used" errors for legitimate GET
// polls that reused the same nonce within the 5-minute window.
// The nonce header is optional — if absent, the check is skipped entirely.
async function checkNonceReplay(ctx: ActionCtx, request: Request): Promise<boolean> {
  const nonce = (request.headers.get("x-nexus-nonce") ?? "").trim();
  if (!nonce) return true;            // Nonce is opt-in
  if (nonce.length > 128) return false;

  const isReplay = await ctx.runMutation(internal.store.checkAndSetDedup, {
    hash:     `nonce:${nonce}`,
    windowMs: NONCE_TTL_MS,
  });
  return !isReplay;
}

function getClientIp(request: Request): string {
  return (
    (request.headers.get("x-real-ip") ?? "") ||
    (request.headers.get("x-forwarded-for") ?? "")
  )
    .split(",")[0]
    .trim()
    .substring(0, 45);
}

function getRobloxApiKey(): string | null {
  const key = process.env.ROBLOX_OPEN_CLOUD_KEY ?? "";
  return key.length >= 20 ? key : null;
}

// ── AUTHORISATION ──────────────────────────────────────────────────────────────
// Admin gating is driven entirely by the NEXUS_ADMIN_ACTIONS env var.
// Ownership and session-token verification are always enforced for non-admins.
async function authorizeCommand(
  ctx: ActionCtx,
  request: Request,
  body: Record<string, unknown>,
  senderUser: string,
  targetUser: string,
  action: string | null
): Promise<AuthResult> {
  const isAdmin = verifyAdminToken(request);
  if (isAdmin) return { ok: true };

  if (senderUser !== targetUser)
    return {
      ok: false,
      status: 403,
      error: "Forbidden: you may only target your own session.",
    };

  if (action && getAdminGatedActions().has(action))
    return {
      ok: false,
      status: 403,
      error: `"${escapeHtml(action, 60)}" requires an admin token.`,
    };

  const candidate =
    (request.headers.get("x-session-token") ?? "").trim() ||
    (body._session_token ? String(body._session_token).trim() : "");

  const placeId = body._place_id ? sanStr(String(body._place_id), 30) : null;
  const session = await ctx.runQuery(internal.store.getSession, {
    username: targetUser,
  });

  // No session registered yet (plugin never connected) — allow through.
  if (!session) return { ok: true };

  // A session exists, so a valid token is mandatory.
  if (!candidate)
    return { ok: false, status: 401, error: "Session token required." };

  if (!timingSafeCompare(candidate, session.token))
    return { ok: false, status: 401, error: "Invalid session token." };

  if (session.placeId && placeId && String(placeId) !== session.placeId)
    return { ok: false, status: 403, error: "PlaceId mismatch." };

  return { ok: true };
}

function filterBatch(commands: unknown[], isAdmin: boolean): FilterResult {
  if (isAdmin) {
    return { safe: sanArr<QueueCommand>(commands, MAX_BATCH_COMMANDS), removed: [] };
  }
  const adminGated = getAdminGatedActions();
  const safe: QueueCommand[] = [];
  const removed: string[]    = [];
  for (const cmd of sanArr<QueueCommand>(commands, MAX_BATCH_COMMANDS)) {
    const act = migrateActionName(String(cmd?.action ?? ""));
    if (adminGated.has(act)) removed.push(sanStr(act, 50));
    else safe.push({ ...cmd, action: act });
  }
  return { safe, removed };
}

// ── SAFE FETCH ─────────────────────────────────────────────────────────────────

async function safeFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10_000,
  maxRetries = 2
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), timeoutMs);
      const resp       = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);

      if (resp.status === 429 && attempt < maxRetries) {
        const wait = Math.min(
          parseInt(resp.headers.get("Retry-After") ?? "2", 10) * 1_000,
          5_000
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return resp;
    } catch (err) {
      lastError = err as Error;
      if ((err as Error)?.name === "AbortError") break;
      if (attempt < maxRetries)
        await new Promise((r) => setTimeout(r, 1_000 * (attempt + 1)));
    }
  }
  throw lastError ?? new Error("safeFetch: all retries failed");
}

// ── ROBLOX HELPERS ─────────────────────────────────────────────────────────────

function buildInsertScript(assetId: string | number, assetName: string): string {
  const safeName = sanStr(String(assetName ?? "Asset"), 80)
    .replace(/[^a-zA-Z0-9 _\-]/g, "")
    .trim() || "Asset";

  return [
    "-- Auto-generated by NexusAI",
    `local InsertService = game:GetService("InsertService")`,
    `local ok, result = pcall(function() return InsertService:LoadAsset(${assetId}) end)`,
    `if ok then`,
    `    result.Name = "${safeName}"`,
    `    result.Parent = workspace`,
    `    print("[NexusAI] Inserted: ${safeName} (${assetId})")`,
    `else`,
    `    warn("[NexusAI] Insert failed ${assetId}: " .. tostring(result))`,
    `end`,
  ].join("\n");
}

async function robloxToolboxSearch(
  ctx: ActionCtx,
  keyword: string,
  assetType = "Model",
  limit = 10,
  cursor: string | null = null
): Promise<ToolboxResult> {
  const cacheKey = `toolbox:${keyword}:${assetType}:${limit}:${cursor ?? ""}`;
  const cached   = await ctx.runQuery(internal.store.getCacheEntry, { key: cacheKey });
  if (cached) return JSON.parse(cached) as ToolboxResult;

  const apiKey = getRobloxApiKey();
  if (!apiKey)
    throw Object.assign(new Error("ROBLOX_OPEN_CLOUD_KEY not configured."), { code: 503 });

  const safeType = VALID_TOOLBOX_TYPES.has(assetType) ? assetType : "Model";
  const params   = new URLSearchParams({
    keyword:   String(keyword).substring(0, 100),
    assetType: safeType,
    limit:     String(Math.min(Math.max(1, limit), 100)),
    ...(cursor ? { cursor } : {}),
  });

  let resp: Response;
  try {
    resp = await safeFetch(
      `https://apis.roblox.com/toolbox-service/v2/assets:search?${params}`,
      {
        method:  "GET",
        headers: {
          "x-api-key":  apiKey,
          Accept:       "application/json",
          "User-Agent": "NexusAI",
        },
      },
      12_000,
      2
    );
  } catch (err) {
    throw Object.assign(
      new Error(`Roblox Toolbox connection failed: ${(err as Error)?.message ?? "timeout"}`),
      { code: 502 }
    );
  }

  if (resp.status === 401 || resp.status === 403)
    throw Object.assign(new Error("Invalid Roblox API key."), { code: resp.status });
  if (resp.status === 429)
    throw Object.assign(new Error("Roblox Toolbox rate limit reached."), { code: 429 });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw Object.assign(
      new Error(`Roblox Toolbox HTTP ${resp.status}: ${sanStr(body, 80)}`),
      { code: resp.status }
    );
  }

  let data: Record<string, unknown>;
  try {
    data = (await resp.json()) as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error("Non-JSON response from Roblox Toolbox."), { code: 502 });
  }

  const rawItems = sanArr<Record<string, unknown>>(
    data["data"] ?? data["assets"] ?? data["results"]
  );

  const assets: AssetItem[] = rawItems
    .map((item) => ({
      assetId: String(item["assetId"] ?? item["id"] ?? ""),
      name: sanStr(item["name"] ?? item["assetName"] ?? "Untitled", 120),
      description: sanStr(item["description"] ?? "", 250),
      assetType: sanStr(item["assetType"] ?? safeType, 30),
      creator: {
        name: sanStr(
          (item["creator"] as Record<string, unknown>)?.["name"] ??
          item["creatorName"] ?? "Unknown",
          80
        ),
        type: sanStr((item["creator"] as Record<string, unknown>)?.["type"] ?? "User", 20),
        userId: String(
          (item["creator"] as Record<string, unknown>)?.["userId"] ??
          item["creatorTargetId"] ?? ""
        ),
      },
      thumbnail: sanStr(
        (item["thumbnail"] as Record<string, unknown>)?.["url"] ??
        item["thumbnailUrl"] ?? "",
        300
      ),
      updated: (item["updated"] ?? item["createdUtc"] ?? null) as string | null,
    }))
    .filter((a) => a.assetId);

  const result: ToolboxResult = {
    assets,
    nextCursor: (data["nextPageCursor"] as string | null) ?? null,
    total:      (data["totalCount"] as number) ?? assets.length,
  };

  await ctx.runMutation(internal.store.setCacheEntry, {
    key:       cacheKey,
    value:     JSON.stringify(result),
    expiresAt: Date.now() + TTL_TOOLBOX,
  });
  return result;
}

async function validateAsset(ctx: ActionCtx, assetId: unknown): Promise<AssetResult> {
  const id = parseInt(String(assetId).replace(/\D/g, ""), 10);
  if (!id || id <= 0 || id > 99_999_999_999)
    throw Object.assign(
      new Error(`Invalid asset ID: "${sanStr(String(assetId), 30)}"`),
      { code: 400 }
    );

  const cacheKey = `asset:${id}`;
  const cached   = await ctx.runQuery(internal.store.getCacheEntry, { key: cacheKey });
  if (cached) return JSON.parse(cached) as AssetResult;

  let assetData: Record<string, unknown> | null = null;

  for (const url of [
    `https://catalog.roblox.com/v1/catalog/items/${id}/details`,
    `https://economy.roblox.com/v2/assets/${id}/details`,
  ]) {
    try {
      const r = await safeFetch(url, { headers: { Accept: "application/json" } }, 8_000, 1);
      if (r.ok) { assetData = (await r.json()) as Record<string, unknown>; break; }
    } catch (_) {}
  }

  if (!assetData) {
    try {
      const r = await safeFetch(
        `https://assetdelivery.roblox.com/v1/asset/?id=${id}`,
        { headers: { Accept: "application/json" } },
        8_000,
        1
      );
      if (r.ok || r.status === 302)
        assetData = { name: `Asset #${id}`, assetType: "Model", creator: {} };
    } catch (_) {}
  }

  if (!assetData) {
    const result: AssetResult = {
      valid:        true,
      assetId:      String(id),
      name:         `Asset #${id}`,
      assetType:    "Unknown",
      creator:      { name: "Unknown", type: "User", userId: "" },
      isPublic:     true,
      unverified:   true,
      insertable:   true,
      insertScript: buildInsertScript(id, `Asset #${id}`),
    };
    await ctx.runMutation(internal.store.setCacheEntry, {
      key:       cacheKey,
      value:     JSON.stringify(result),
      expiresAt: Date.now() + TTL_ASSET / 4,
    });
    return result;
  }

  const rawType   = sanStr(String(assetData["assetType"] ?? assetData["itemType"] ?? "Model"), 30);
  const assetName = sanStr(String(assetData["name"] ?? `Asset #${id}`), 120);
  const isPublic  = !(assetData["sales"] === 0 && assetData["isForSale"] === false);
  const creator   = sanObj(assetData["creator"]);

  const result: AssetResult = {
    valid:        true,
    assetId:      String(id),
    name:         assetName,
    description:  sanStr(String(assetData["description"] ?? ""), 250),
    assetType:    rawType,
    creator: {
      name:   sanStr(String(creator["name"] ?? "Unknown"), 80),
      type:   sanStr(String(creator["creatorType"] ?? "User"), 20),
      userId: String(creator["creatorTargetId"] ?? ""),
    },
    isPublic,
    insertable:   INSERTABLE_ASSET_TYPES.has(rawType),
    insertScript: buildInsertScript(id, assetName),
  };

  await ctx.runMutation(internal.store.setCacheEntry, {
    key:       cacheKey,
    value:     JSON.stringify(result),
    expiresAt: Date.now() + TTL_ASSET,
  });
  return result;
}

async function fetchUserInfo(ctx: ActionCtx, userId: number): Promise<UserInfo> {
  const id = parseInt(String(userId).replace(/\D/g, ""), 10);
  if (!id || id <= 0) throw new Error("Invalid userId.");

  const cacheKey = `userinfo:${id}`;
  const cached   = await ctx.runQuery(internal.store.getCacheEntry, { key: cacheKey });
  if (cached) return JSON.parse(cached) as UserInfo;

  const resp = await safeFetch(
    `https://users.roblox.com/v1/users/${id}`,
    { headers: { Accept: "application/json" } },
    8_000,
    1
  );
  if (!resp.ok) throw new Error(`Roblox Users API error: HTTP ${resp.status}`);

  const d      = (await resp.json()) as Record<string, unknown>;
  const result: UserInfo = {
    userId,
    username:    sanStr(String(d["name"] ?? ""), 80),
    displayName: sanStr(String(d["displayName"] ?? d["name"] ?? ""), 80),
    description: sanStr(String(d["description"] ?? ""), 300),
    isBanned:    Boolean(d["isBanned"]),
    created:     (d["created"] as string | null) ?? null,
    avatarUrl:   `https://www.roblox.com/headshot-thumbnail/image?userId=${id}&width=150&height=150&format=png`,
  };

  await ctx.runMutation(internal.store.setCacheEntry, {
    key:       cacheKey,
    value:     JSON.stringify(result),
    expiresAt: Date.now() + TTL_USER_INFO,
  });
  return result;
}

async function fetchGameInfo(
  ctx: ActionCtx,
  id: number,
  isPlaceId = false
): Promise<GameInfo> {
  const parsed = parseInt(String(id).replace(/\D/g, ""), 10);
  if (!parsed || parsed <= 0) throw new Error("Invalid universeId / placeId.");

  const cacheKey = `gameinfo:${parsed}:${isPlaceId}`;
  const cached   = await ctx.runQuery(internal.store.getCacheEntry, { key: cacheKey });
  if (cached) return JSON.parse(cached) as GameInfo;

  let universeId = parsed;
  if (isPlaceId) {
    try {
      const r = await safeFetch(
        `https://apis.roblox.com/universes/v1/places/${parsed}/universe`,
        { headers: { Accept: "application/json" } },
        8_000,
        1
      );
      if (r.ok) {
        const j    = (await r.json()) as Record<string, unknown>;
        universeId = (j["universeId"] as number) ?? parsed;
      }
    } catch (_) {}
  }

  const resp = await safeFetch(
    `https://games.roblox.com/v1/games?universeIds=${universeId}`,
    { headers: { Accept: "application/json" } },
    8_000,
    1
  );
  if (!resp.ok) throw new Error(`Roblox Games API error: HTTP ${resp.status}`);

  const d    = (await resp.json()) as { data?: Record<string, unknown>[] };
  const game = (d.data ?? [])[0];
  if (!game) throw new Error("Game not found.");

  const gc     = sanObj(game["creator"]);
  const result: GameInfo = {
    universeId,
    placeId:        (game["rootPlaceId"] as number) ?? parsed,
    name:           sanStr(String(game["name"] ?? ""), 120),
    description:    sanStr(String(game["description"] ?? ""), 500),
    creator: {
      name: sanStr(String(gc["name"] ?? ""), 80),
      type: sanStr(String(gc["type"]  ?? "User"), 20),
    },
    playing:        (game["playing"]        as number) ?? 0,
    visits:         (game["visits"]         as number) ?? 0,
    maxPlayers:     (game["maxPlayers"]     as number) ?? 0,
    favoritedCount: (game["favoritedCount"] as number) ?? 0,
    genre:          sanStr(String(game["genre"] ?? ""), 30),
    thumbnailUrl:   `https://www.roblox.com/asset-thumbnail/image?assetId=${game["rootPlaceId"] ?? parsed}&width=768&height=432&format=png`,
  };

  await ctx.runMutation(internal.store.setCacheEntry, {
    key:       cacheKey,
    value:     JSON.stringify(result),
    expiresAt: Date.now() + TTL_GAME_INFO,
  });
  return result;
}

// ── LOCAL DOCS INDEX ───────────────────────────────────────────────────────────

function getLocalDocsIndex(): DocEntry[] {
  return [
    { title: "Instance",           url: "https://create.roblox.com/docs/reference/engine/classes/Instance",           snippet: "Base class. FindFirstChild, WaitForChild, Destroy, Clone.",                   category: "api",   keywords: "instance findfirstchild waitforchild destroy clone parent classname isa" },
    { title: "Workspace",          url: "https://create.roblox.com/docs/reference/engine/classes/Workspace",          snippet: "Primary 3D container. Gravity, CurrentCamera.",                               category: "api",   keywords: "workspace gravity camera service 3d world" },
    { title: "BasePart / Part",    url: "https://create.roblox.com/docs/reference/engine/classes/BasePart",           snippet: "Physical part. Size, Position, CFrame, Anchored, Material.",                 category: "api",   keywords: "part size position cframe anchored material transparency mesh union" },
    { title: "Script / LocalScript", url: "https://create.roblox.com/docs/reference/engine/classes/Script",           snippet: "Script: server. LocalScript: client. ModuleScript: shared.",                 category: "api",   keywords: "script localscript modulescript server client require enabled source" },
    { title: "RemoteEvent",        url: "https://create.roblox.com/docs/reference/engine/classes/RemoteEvent",        snippet: "FireServer, FireClient, FireAllClients, OnServerEvent, OnClientEvent.",       category: "api",   keywords: "remoteevent onserverevent onclientevent fireserver fireclient" },
    { title: "RemoteFunction",     url: "https://create.roblox.com/docs/reference/engine/classes/RemoteFunction",     snippet: "InvokeServer, InvokeClient, OnServerInvoke, OnClientInvoke.",                category: "api",   keywords: "remotefunction invokeserver invokeclient onserverinvoke" },
    { title: "Players",            url: "https://create.roblox.com/docs/reference/engine/classes/Players",            snippet: "PlayerAdded, PlayerRemoving, GetPlayers, LocalPlayer.",                      category: "api",   keywords: "players playeradded playerremoving getplayers localplayer character" },
    { title: "DataStoreService",   url: "https://create.roblox.com/docs/reference/engine/classes/DataStoreService",   snippet: "GetAsync, SetAsync, UpdateAsync. Always wrap with pcall.",                   category: "api",   keywords: "datastore getasync setasync updateasync save load persistent" },
    { title: "TweenService",       url: "https://create.roblox.com/docs/reference/engine/classes/TweenService",       snippet: "Create(instance, TweenInfo, goals). Play, Pause, Cancel.",                  category: "api",   keywords: "tweenservice tween animation tweeninfo play pause cancel easing" },
    { title: "RunService",         url: "https://create.roblox.com/docs/reference/engine/classes/RunService",         snippet: "Heartbeat, RenderStepped, Stepped. IsServer, IsClient.",                    category: "api",   keywords: "runservice heartbeat renderstepped stepped loop isserver isclient" },
    { title: "InsertService",      url: "https://create.roblox.com/docs/reference/engine/classes/InsertService",      snippet: "LoadAsset(assetId). Asset must be public. Always pcall.",                   category: "api",   keywords: "insertservice loadasset asset insert model pcall public" },
    { title: "HttpService",        url: "https://create.roblox.com/docs/reference/engine/classes/HttpService",        snippet: "GetAsync, PostAsync, JSONEncode, JSONDecode.",                               category: "api",   keywords: "httpservice getasync postasync http json encode decode api webhook" },
    { title: "task Library",       url: "https://create.roblox.com/docs/reference/engine/libraries/task",             snippet: "task.wait, task.spawn, task.delay. Preferred over wait().",                  category: "guide", keywords: "task wait spawn delay cancel coroutine thread async timing yield" },
    { title: "Terrain",            url: "https://create.roblox.com/docs/reference/engine/classes/Terrain",            snippet: "FillBlock, FillBall, FillCylinder. ReplaceMaterial.",                       category: "api",   keywords: "terrain fillblock fillball fillcylinder material grass water rock" },
    { title: "PathfindingService", url: "https://create.roblox.com/docs/reference/engine/classes/PathfindingService", snippet: "CreatePath, ComputeAsync, GetWaypoints.",                                   category: "api",   keywords: "pathfinding npc navigation ai moveto waypoints compute agent" },
    { title: "UserInputService",   url: "https://create.roblox.com/docs/reference/engine/classes/UserInputService",   snippet: "InputBegan, InputEnded, GetKeysPressed, TouchTap.",                         category: "api",   keywords: "input keyboard mouse touch gamepad keybind userinputservice" },
    { title: "SoundService",       url: "https://create.roblox.com/docs/reference/engine/classes/SoundService",       snippet: "PlayLocalSound, SetListener, GlobalSounds.",                                category: "api",   keywords: "sound audio music sfx soundservice play volume" },
    { title: "CollectionService",  url: "https://create.roblox.com/docs/reference/engine/classes/CollectionService",  snippet: "AddTag, RemoveTag, GetTagged, HasTag.",                                     category: "api",   keywords: "tag collection gettagged addtag removetag hastag collectionservice" },
    { title: "ContextActionService", url: "https://create.roblox.com/docs/reference/engine/classes/ContextActionService", snippet: "BindAction, UnbindAction. Mobile buttons, keyboard.",                   category: "api",   keywords: "bind action mobile button contextactionservice keyboard" },
    { title: "Lighting",           url: "https://create.roblox.com/docs/reference/engine/classes/Lighting",           snippet: "Ambient, Brightness, TimeOfDay, FogEnd.",                                   category: "api",   keywords: "lighting ambient brightness fog timeofday atmosphere" },
  ];
}

async function searchDocs(
  ctx: ActionCtx,
  query: string,
  docType = "all",
  limit = 5
): Promise<DocsResult> {
  const q      = sanStr(query, 150).trim();
  const maxRes = Math.min(Math.max(1, limit), 20);
  if (!q) throw new Error("Query cannot be empty.");

  const cacheKey = `docs:${q}:${docType}:${limit}`;
  const cached   = await ctx.runQuery(internal.store.getCacheEntry, { key: cacheKey });
  if (cached) return JSON.parse(cached) as DocsResult;

  // Try the live Roblox Creator Docs search API first
  try {
    const params = new URLSearchParams({
      query:  q,
      type:   docType === "all" ? "" : docType,
      limit:  String(maxRes),
      locale: "en-us",
    });
    const resp = await safeFetch(
      `https://create.roblox.com/api/search/docs?${params}`,
      { headers: { Accept: "application/json", "User-Agent": "NexusAI" } },
      8_000,
      1
    );
    if (resp.ok) {
      const data = (await resp.json()) as Record<string, unknown>;
      const raw  = sanArr<Record<string, unknown>>(data["results"] ?? data["data"]);
      if (raw.length > 0) {
        const result: DocsResult = {
          results: raw.slice(0, maxRes).map((r) => ({
            title:    sanStr(String(r["title"]    ?? r["name"]        ?? "No Title"), 120),
            url:      sanStr(String(r["url"]      ?? r["path"]        ?? ""), 300),
            snippet:  sanStr(String(r["snippet"]  ?? r["excerpt"]     ?? r["description"] ?? ""), 300),
            category: sanStr(String(r["category"] ?? r["type"]        ?? "docs"), 50),
          })),
          source: "roblox_creator_docs",
          query:  q,
        };
        await ctx.runMutation(internal.store.setCacheEntry, {
          key:       cacheKey,
          value:     JSON.stringify(result),
          expiresAt: Date.now() + 10 * 60_000,
        });
        return result;
      }
    }
  } catch (_) {}

  // Fall back to the bundled local index
  const index  = getLocalDocsIndex();
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = index
    .map((entry) => {
      let score = 0;
      const hay = `${entry.title} ${entry.keywords}`.toLowerCase();
      for (const t of tokens) {
        if (hay.includes(t))                          score += t.length;
        if (entry.title.toLowerCase().startsWith(t)) score += 10;
        if (entry.title.toLowerCase() === t)         score += 20;
      }
      return { ...entry, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRes);

  if (scored.length === 0) {
    return {
      results: [{
        title:    "Roblox Creator Documentation",
        url:      "https://create.roblox.com/docs",
        snippet:  `No local results found for "${q}". Try the full docs site.`,
        category: "fallback",
      }],
      source: "local_fallback",
      query:  q,
    };
  }

  const result: DocsResult = {
    results: scored.map(({ score: _s, keywords: _k, ...rest }) => rest),
    source:  "local_index",
    query:   q,
  };
  await ctx.runMutation(internal.store.setCacheEntry, {
    key:       cacheKey,
    value:     JSON.stringify(result),
    expiresAt: Date.now() + 60 * 60_000,
  });
  return result;
}

// ── DATA STORE HELPERS ─────────────────────────────────────────────────────────

async function saveData(
  ctx: ActionCtx,
  username: string,
  key: string,
  data: Record<string, unknown>
): Promise<void> {
  await ctx.runMutation(internal.store.upsertData, {
    username,
    key,
    value: JSON.stringify({ ...data, _ts: Date.now() }),
  });
}

async function loadData(
  ctx: ActionCtx,
  username: string,
  key: string
): Promise<Record<string, unknown> | null> {
  const v = await ctx.runQuery(internal.store.getData, { username, key });
  if (!v) return null;
  try { return JSON.parse(v) as Record<string, unknown>; } catch { return null; }
}

async function dispatchWebhook(
  ctx: ActionCtx,
  u: string,
  event: string,
  data: unknown
): Promise<void> {
  const wh = await ctx.runQuery(internal.store.getWebhook, { username: u });
  if (!wh?.url?.startsWith("https://")) return;
  try {
    await safeFetch(
      wh.url,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "NexusAI" },
        body:    JSON.stringify({ event, user: u, data, ts: Date.now() }),
      },
      5_000,
      0
    );
  } catch (_) {}
}

// ── AI FEED ────────────────────────────────────────────────────────────────────
// Durable, ordered outbox of messages the AI can pull at any time.
//
// Every plugin report (read_script, output_log, runcode_report, etc.) also
// appends a small AiFeedEntry here. The AI polls GET ?ai_feed=1&user=... to
// consume unread entries oldest-first; entries are marked read atomically on
// retrieval so nothing is delivered twice. The snapshot written via saveData()
// is always preserved, so the AI can still query the latest state directly.
async function pushAiFeed(
  ctx: ActionCtx,
  username: string,
  kind: string,
  summary: string,
  data: unknown
): Promise<void> {
  await ctx.runMutation(internal.store.pushAiFeedEntry, {
    username,
    kind,
    summary: sanStr(summary, 300),
    data:    JSON.stringify(data ?? {}),
    ts:      Date.now(),
  });
}

// ── PROJECT ────────────────────────────────────────────────────────────────────

async function getProject(ctx: ActionCtx, u: string): Promise<ProjectData> {
  const d = await loadData(ctx, u, "project");
  return d
    ? (d as unknown as ProjectData)
    : { projectId: "", projectName: "", placeId: "", updatedAt: 0 };
}

async function saveProject(
  ctx: ActionCtx,
  u: string,
  d: Partial<ProjectData>
): Promise<void> {
  await saveData(ctx, u, "project", {
    projectId:   sanStr(d.projectId   ?? "", 100),
    projectName: sanStr(d.projectName ?? "", 100),
    placeId:     sanStr(d.placeId     ?? "", 50),
    updatedAt:   Date.now(),
  });
}

// ── SESSION HELPERS ────────────────────────────────────────────────────────────

async function setSessionDb(
  ctx: ActionCtx,
  username: string,
  token: string,
  placeId: string | null,
  userId: string | null
): Promise<void> {
  const u        = san(username);
  const existing = await ctx.runQuery(internal.store.getSession, { username: u });
  await ctx.runMutation(internal.store.upsertSession, {
    username:   u,
    token:      String(token).substring(0, SESSION_TOKEN_MAX),
    placeId:    placeId ? sanStr(String(placeId), 30) : null,
    userId:     userId  ? sanStr(String(userId),  20) : null,
    createdAt:  existing?.createdAt ?? Date.now(),
    lastSeen:   Date.now(),
    reconnects: (existing?.reconnects ?? 0) + (existing ? 1 : 0),
    cmdCount:   existing?.cmdCount ?? 0,
  });
  await ctx.runMutation(internal.store.pushSessionAudit, {
    username: u,
    event:    "connect",
    data:     JSON.stringify({ placeId, userId }),
  });
}

async function getSessionStats(ctx: ActionCtx, username: string) {
  const s = await ctx.runQuery(internal.store.getSession, { username: san(username) });
  if (!s) return null;
  return {
    hasSession:  true,
    placeId:     s.placeId  ?? null,
    userId:      s.userId   ?? null,
    ageMs:       Date.now() - s.createdAt,
    lastSeenMs:  Date.now() - s.lastSeen,
    reconnects:  s.reconnects ?? 0,
    cmdCount:    s.cmdCount   ?? 0,
  };
}

// ── QUEUE ──────────────────────────────────────────────────────────────────────

async function pushQueue(
  ctx: ActionCtx,
  u: string,
  cmd: QueueCommand,
  priority = "normal"
): Promise<boolean> {
  const isPriority = priority === "critical" || priority === "high";
  await ctx.runMutation(internal.store.pushQueueItem, {
    username:    u,
    payload:     JSON.stringify({ ...cmd, _priority: priority, _ts: Date.now() }),
    priority,
    ts:          Date.now(),
    isPriority,
  });
  return true;
}

// ── MAIN HTTP ACTION ───────────────────────────────────────────────────────────

export const controlHandler = httpAction(async (ctx, request) => {
  try {
    const cors = buildCorsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
    if (request.method === "GET")     return await handleGet(ctx, request, cors);
    if (request.method === "POST")    return await handlePost(ctx, request, cors);
    return errResp(cors, 405, "Method not allowed.");
  } catch (err) {
    console.error("[NEXUS Convex]", (err as Error)?.message ?? err);
    return new Response(
      JSON.stringify({
        ok:      false,
        error:   "Internal server error.",
        message: sanStr(String((err as Error)?.message ?? ""), 200),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// ── GET HANDLER ────────────────────────────────────────────────────────────────
// NOTE: Nonce replay checking does NOT run for GET requests. GET polls are
// read-only and may be repeated many times with the same nonce by the plugin.
async function handleGet(
  ctx: ActionCtx,
  request: Request,
  cors: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const q   = Object.fromEntries(url.searchParams.entries()) as Record<string, string>;

  // ── Ping (no params) ────────────────────────────────────────────────────────
  if (Object.keys(q).length === 0)
    return jsonResp(
      { ok: true, status: "ok", required_plugin_version: REQUIRED_PLUGIN_VERSION },
      200,
      cors
    );

  // ── Health check ────────────────────────────────────────────────────────────
  if (q["health"] === "1") {
    const rawStats = await ctx.runQuery(internal.store.getGlobalStats, {});
    const s        = rawStats
      ? (JSON.parse(rawStats) as { totalCommands: number; totalUsers: number; startedAt: number })
      : { totalCommands: 0, totalUsers: 0, startedAt: Date.now() };
    const upMs           = Date.now() - (s.startedAt ?? Date.now());
    const activeSessions = await ctx.runQuery(internal.store.countActiveSessions, {});
    return jsonResp(
      {
        ok:                      true,
        status:                  "healthy",
        required_plugin_version: REQUIRED_PLUGIN_VERSION,
        uptime:                  upMs,
        uptimeHuman:             `${Math.floor(upMs / 3_600_000)}h ${Math.floor((upMs % 3_600_000) / 60_000)}m`,
        totalCommands:           s.totalCommands ?? 0,
        totalUsers:              s.totalUsers    ?? 0,
        activeSessions,
        ts:                      Date.now(),
      },
      200,
      cors
    );
  }

  // ── User info lookup ────────────────────────────────────────────────────────
  if (q["userinfo"] === "1") {
    const uid = parseInt(String(q["userId"] ?? "0"), 10);
    if (!uid || uid <= 0 || uid > 9_999_999_999)
      return errResp(cors, 400, "Invalid userId.");
    try {
      const info = await fetchUserInfo(ctx, uid);
      return jsonResp({ ok: true, ...info }, 200, cors);
    } catch (e) {
      return errResp(cors, 502, sanStr((e as Error)?.message ?? "Failed to fetch user info.", 100));
    }
  }

  // ── Game info lookup ────────────────────────────────────────────────────────
  if (q["gameinfo"] === "1") {
    const id = parseInt(String(q["id"] ?? "0"), 10);
    if (!id) return errResp(cors, 400, 'Parameter "id" is required.');
    try {
      const info = await fetchGameInfo(ctx, id, q["type"] === "place");
      return jsonResp({ ok: true, ...info }, 200, cors);
    } catch (e) {
      return errResp(cors, 502, sanStr((e as Error)?.message ?? "Failed to fetch game info.", 100));
    }
  }

  // ── Connection / status check ────────────────────────────────────────────────
  if (q["check"] != null) {
    const u        = san(q["user"] ?? "");
    const rawStats = await ctx.runQuery(internal.store.getGlobalStats, {});
    const s        = rawStats
      ? (JSON.parse(rawStats) as { totalCommands: number; totalUsers: number })
      : { totalCommands: 0, totalUsers: 0 };
    const sess       = await ctx.runQuery(internal.store.getSession,    { username: u });
    const qCount     = await ctx.runQuery(internal.store.countQueueItems, { username: u });
    const lastPollTs = await ctx.runQuery(internal.store.getLastPoll,   { username: u });
    const online     = Date.now() - lastPollTs < 8_000;
    return jsonResp(
      {
        ok:                      true,
        connected:               online,
        _pluginConnected:        online,
        online,
        user:                    u,
        queueLength:             qCount.total,
        sessionStats:            await getSessionStats(ctx, u),
        hasSession:              !!sess,
        placeId:                 sess?.placeId ?? null,
        userId:                  sess?.userId  ?? null,
        required_plugin_version: REQUIRED_PLUGIN_VERSION,
        currentProject:          await getProject(ctx, u),
        globalStats: {
          totalCommands: s.totalCommands ?? 0,
          totalUsers:    s.totalUsers    ?? 0,
        },
      },
      200,
      cors
    );
  }

  // ── Admin: clear cache ───────────────────────────────────────────────────────
  if (q["clear_cache"] != null) {
    if (!verifyAdminToken(request, q["token"]))
      return errResp(cors, 401, "Admin token required.");
    return jsonResp(
      { ok: true, message: "Cache cleared (use Convex dashboard to clear data table).", ts: Date.now() },
      200,
      cors
    );
  }

  const u = san(q["user"] ?? "");

  // ── AI Feed ──────────────────────────────────────────────────────────────────
  // GET ?ai_feed=1&user=<username>          → unread entries (consumed, oldest first)
  // GET ?ai_feed=1&user=<username>&peek=1   → unread entries (NOT consumed)
  // GET ?ai_feed=1&user=<username>&all=1    → full history (read + unread)
  if (q["ai_feed"] != null) {
    if (!u) return errResp(cors, 400, '"user" parameter is required.');
    const limit = sanInt(q["limit"], AI_FEED_DEFAULT_LIMIT, 1, MAX_AI_FEED_ENTRIES);

    if (q["all"] === "1") {
      const entries = await ctx.runQuery(internal.store.getAiFeedEntries, {
        username:   u,
        limit,
        unreadOnly: false,
      });
      return jsonResp({ ok: true, user: u, entries, count: entries.length, mode: "all" }, 200, cors);
    }

    const entries = await ctx.runQuery(internal.store.getAiFeedEntries, {
      username:   u,
      limit,
      unreadOnly: true,
    });

    if (q["peek"] !== "1" && entries.length > 0) {
      await ctx.runMutation(internal.store.markAiFeedRead, {
        username: u,
        ids:      entries.map((e: AiFeedEntry) => e.id),
      });
    }

    return jsonResp(
      {
        ok:      true,
        user:    u,
        entries,
        count:   entries.length,
        mode:    q["peek"] === "1" ? "peek" : "unread_consumed",
      },
      200,
      cors
    );
  }

  // ── Webhook info ─────────────────────────────────────────────────────────────
  if (q["get_webhook"] != null) {
    const wh = await ctx.runQuery(internal.store.getWebhook, { username: u });
    return jsonResp({ ok: true, webhook: wh, user: u }, 200, cors);
  }

  // ── Project info ─────────────────────────────────────────────────────────────
  if (q["get_project"] != null)
    return jsonResp({ ok: true, ...(await getProject(ctx, u)) }, 200, cors);

  // ── Output report snapshot ───────────────────────────────────────────────────
  if (q["get_output_data"] != null) {
    const d = await loadData(ctx, u, "output_report");
    return jsonResp({ ok: true, ...(d ?? { outputs: [] }) }, 200, cors);
  }

  // ── Studio Output log ────────────────────────────────────────────────────────
  if (q["get_output"] != null) {
    const raw   = await ctx.runQuery(internal.store.getData, { username: u, key: "output_log" });
    let logs    = raw ? (JSON.parse(raw) as Record<string, unknown>[]) : [];
    const since = sanInt(q["since"], 0, 0, Number.MAX_SAFE_INTEGER);
    if (since) logs = logs.filter((l) => ((l["ts"] as number) ?? 0) > since);
    if (q["level"]) logs = logs.filter((l) => l["level"] === q["level"] || l["type"] === q["level"]);
    return jsonResp({ ok: true, logs, count: logs.length }, 200, cors);
  }

  // ── Generic data getters ──────────────────────────────────────────────────────
  // FIX: ?get_workspace now returns an empty-but-valid response instead of 404
  // when no workspace scan has been stored yet. This prevents the repeated red
  // errors seen in devtools when the AI polls before the plugin has run a scan.
  const dataGetterKeys: Record<string, string> = {
    get_workspace:       "workspace_scan",
    get_script:          "read_script",
    get_script_list:     "script_list_report",
    get_script_lines:    "script_lines_report",
    get_search:          "toolbox_search_report",
    get_workspace_scan:  "workspace_scan",
    get_descendants:     "descendants_report",
    get_properties:      "properties_report",
    get_action_list:     "action_list_report",
    get_asset_lib:       "asset_library_report",
    get_asset_id:        "asset_id_report",
    get_asset_folder:    "asset_folder_report",
    get_module_list:     "module_list_report",
    get_module_deploy:   "module_deploy_report",
    get_terrain:         "terrain_materials_report",
    get_runcode_result:  "runcode_report",
    get_expr_result:     "expression_report",
    get_query_result:    "query_report",
  };

  // Empty-result defaults returned when no data has been stored yet.
  // Avoids noisy 404s on early polls before the plugin has run any commands.
  const emptyDefaults: Record<string, Record<string, unknown>> = {
    workspace_scan:         { data: {}, ts: 0, user: u },
    read_script:            { name: "", source: "", lineCount: 0, class: "Script" },
    script_list_report:     { scripts: [], count: 0, total: 0, breakdown: {} },
    script_lines_report:    { content: "", lineStart: 0, lineEnd: 0, total: 0 },
    toolbox_search_report:  { results: [], count: 0, query: "" },
    descendants_report:     { descendants: [], count: 0, target: "" },
    properties_report:      { properties: {}, name: "" },
    action_list_report:     { actions: [], count: 0 },
    asset_library_report:   { data: {}, category: "all" },
    asset_id_report:        { id: "", name: "", category: "" },
    asset_folder_report:    { contents: {}, folder: "all" },
    module_list_report:     { modules: [], count: 0 },
    module_deploy_report:   { name: "", parent: "", source: "" },
    terrain_materials_report: { materials: [], count: 0 },
    runcode_report:         { success: false, output: null, log: [], mode: "pipeline" },
    expression_report:      { expression: "", result: null },
    query_report:           { results: [], count: 0 },
  };

  for (const [param, key] of Object.entries(dataGetterKeys)) {
    if (q[param] != null) {
      const d = await loadData(ctx, u, key);
      // Return the stored snapshot if available, otherwise an empty-but-valid default.
      return jsonResp(
        { ok: true, ...(d ?? emptyDefaults[key] ?? {}) },
        200,
        cors
      );
    }
  }

  // ── Plugin errors ────────────────────────────────────────────────────────────
  if (q["get_plugin_errors"] != null) {
    const raw    = await ctx.runQuery(internal.store.getData, { username: u, key: "plugin_error_report" });
    const errors = raw ? (JSON.parse(raw) as unknown[]) : [];
    return jsonResp({ ok: true, errors, count: errors.length }, 200, cors);
  }

  // ── Mentions ─────────────────────────────────────────────────────────────────
  if (q["get_mentions"] != null) {
    const raw      = await ctx.runQuery(internal.store.getData, { username: u, key: "mentions" });
    const mentions = raw ? (JSON.parse(raw) as unknown[]) : [];
    return jsonResp({ ok: true, mentions, count: mentions.length }, 200, cors);
  }

  // ── Command history (per user) ───────────────────────────────────────────────
  if (q["get_cmd_history"] != null) {
    const limit   = sanInt(q["limit"], 50, 1, MAX_USER_HIST);
    const history = await ctx.runQuery(internal.store.getUserHistory, { username: u, limit });
    return jsonResp({ ok: true, history, user: u }, 200, cors);
  }

  // ── Queue stats ──────────────────────────────────────────────────────────────
  if (q["queue_stats"] != null) {
    const qc         = await ctx.runQuery(internal.store.countQueueItems, { username: u });
    const lastPollTs = await ctx.runQuery(internal.store.getLastPoll,     { username: u });
    return jsonResp(
      {
        ok:            true,
        user:          u,
        normalQueue:   qc.normal,
        priorityQueue: qc.priority,
        total:         qc.total,
        oldestMs:      qc.oldest ? Date.now() - qc.oldest : null,
        pluginOnline:  Date.now() - lastPollTs < 8_000,
      },
      200,
      cors
    );
  }

  // ── Admin: raw logs ──────────────────────────────────────────────────────────
  if (q["get_logs"] != null) {
    if (!verifyAdminToken(request, q["token"]))
      return errResp(cors, 401, "Admin token required.");
    const limit = sanInt(q["limit"], 100, 1, MAX_LOG_ENTRIES);
    const logs  = await ctx.runQuery(internal.store.getLogs, {
      limit,
      filterUser: q["filter_user"],
    });
    return jsonResp({ ok: true, logs, count: logs.length }, 200, cors);
  }

  // ── Admin: history ───────────────────────────────────────────────────────────
  if (q["get_history"] != null) {
    if (!verifyAdminToken(request, q["token"]))
      return errResp(cors, 401, "Admin token required.");
    const limit   = sanInt(q["limit"], 50, 1, MAX_HIST_ENTRIES);
    const history = await ctx.runQuery(internal.store.getHistory, { limit });
    return jsonResp({ ok: true, history, count: history.length }, 200, cors);
  }

  // ── Admin: global stats ──────────────────────────────────────────────────────
  if (q["get_stats"] != null) {
    const rawStats = await ctx.runQuery(internal.store.getGlobalStats, {});
    const s        = rawStats
      ? (JSON.parse(rawStats) as {
          totalCommands: number;
          totalUsers:    number;
          startedAt:     number;
          popularActions: Record<string, number>;
        })
      : { totalCommands: 0, totalUsers: 0, startedAt: Date.now(), popularActions: {} };
    const activeSessions = await ctx.runQuery(internal.store.countActiveSessions, {});
    return jsonResp(
      {
        ok:             true,
        totalCommands:  s.totalCommands  ?? 0,
        totalUsers:     s.totalUsers     ?? 0,
        startedAt:      s.startedAt      ?? 0,
        uptime:         Date.now() - (s.startedAt ?? Date.now()),
        activeSessions,
        popularActions: Object.entries(s.popularActions ?? {})
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 20)
          .reduce<Record<string, number>>((acc, [k, v]) => {
            acc[k] = v as number;
            return acc;
          }, {}),
      },
      200,
      cors
    );
  }

  // ── Admin: clear queue ───────────────────────────────────────────────────────
  if (q["clear_queue"] != null) {
    if (!verifyAdminToken(request, q["token"]))
      return errResp(cors, 401, "Admin token required.");
    if (!u) return errResp(cors, 400, '"user" parameter is required.');
    await ctx.runMutation(internal.store.clearQueueItems, { username: u });
    return jsonResp({ ok: true, message: "Queue cleared.", user: u }, 200, cors);
  }

  // ── Plugin Poll ──────────────────────────────────────────────────────────────
  if (!u) return errResp(cors, 400, '"user" parameter is required.');

  if (q["session_token"]) {
    const token   = sanStr(String(q["session_token"]), SESSION_TOKEN_MAX).trim();
    const placeId = q["place_id"] ? sanStr(String(q["place_id"]), 30) : null;
    const userId  = q["user_id"]  ? sanStr(String(q["user_id"]),  20) : null;
    if (token.length >= 16) await setSessionDb(ctx, u, token, placeId, userId);
  } else {
    await ctx.runMutation(internal.store.touchSession, { username: u });
  }

  await ctx.runMutation(internal.store.bumpPoll, { username: u });
  const queue = await ctx.runMutation(internal.store.drainQueueItems, { username: u });
  const proj  = await getProject(ctx, u);

  return jsonResp(
    {
      ok:                      true,
      status:                  "ok",
      queue,
      count:                   queue.length,
      priorityCount:           queue.filter(
        (c: QueueCommand) => c._priority === "critical" || c._priority === "high"
      ).length,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      currentProject:          proj,
      projectId:               proj.projectId   ?? "",
      projectName:             proj.projectName ?? "",
      placeId:                 proj.placeId     ?? "",
    },
    200,
    cors
  );
}

// ── POST HANDLER ───────────────────────────────────────────────────────────────
async function handlePost(
  ctx: ActionCtx,
  request: Request,
  cors: Record<string, string>
): Promise<Response> {
  const rawBody = await request.text().catch(() => "");
  let body: Record<string, unknown>;
  try {
    body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    body = (robustJsonParse(rawBody) as Record<string, unknown>) ?? {};
  }

  const ip          = getClientIp(request);
  const hasIdentity = !!(body["_user"] ?? body["user"]);
  const ratUser     = hasIdentity ? san(body["_user"] ?? body["user"]) : `ip_${ip || "unknown"}`;

  // ── Rate limiting ────────────────────────────────────────────────────────────
  const okIp = await ctx.runMutation(internal.store.checkAndIncrRateLimit, {
    key: ip, kind: "ip", max: RATE_IP_PER_MIN, windowMs: 60_000,
  });
  if (!okIp) return rateLimitResp(cors, 60);

  const okUser = await ctx.runMutation(internal.store.checkAndIncrRateLimit, {
    key: ratUser, kind: "user", max: RATE_USER_PER_MIN, windowMs: 60_000,
  });
  if (!okUser) return rateLimitResp(cors, 60);

  const okBurst = await ctx.runMutation(internal.store.checkAndIncrBurst, {
    key: ratUser, max: RATE_BURST_COUNT, windowMs: RATE_BURST_WINDOW,
  });
  if (!okBurst) return rateLimitResp(cors, 5);

  // ── HMAC + nonce replay verification (POST only) ─────────────────────────────
  if (!(await verifyPluginHmac(request, rawBody)))
    return errResp(cors, 401, "Invalid HMAC signature.", { hint: "Check PLUGIN_HMAC_SECRET." });

  if (!(await checkNonceReplay(ctx, request)))
    return errResp(cors, 401, "Nonce already used (possible replay).");

  const rawAction    = migrateActionName(sanStr(String(body["action"] ?? body["type"] ?? ""), 80));
  const resolvedUser = san(body["_user"] ?? "");

  // ── Plugin connect ───────────────────────────────────────────────────────────
  if (rawAction === "plugin_connect") {
    const token   = sanStr(String(body["token"] ?? body["session_token"] ?? ""), SESSION_TOKEN_MAX).trim();
    const placeId = body["place_id"] ? sanStr(String(body["place_id"]), 30) : null;
    const userId  = body["user_id"]  ? sanStr(String(body["user_id"]),  20) : null;
    if (token.length >= 16) await setSessionDb(ctx, resolvedUser, token, placeId, userId);
    await ctx.runMutation(internal.store.bumpPoll, { username: resolvedUser });
    await ctx.runMutation(internal.store.pushLog, {
      action:  "plugin_connect",
      user:    resolvedUser,
      details: JSON.stringify({ placeId, userId }),
    });
    const proj = await getProject(ctx, resolvedUser);
    return jsonResp(
      {
        ok:                      true,
        status:                  "ok",
        required_plugin_version: REQUIRED_PLUGIN_VERSION,
        currentProject:          proj,
        projectId:               proj.projectId   ?? "",
        projectName:             proj.projectName ?? "",
      },
      200,
      cors
    );
  }

  // ── Plugin disconnect ────────────────────────────────────────────────────────
  if (rawAction === "plugin_disconnect") {
    const sess = await ctx.runQuery(internal.store.getSession, { username: san(resolvedUser) });
    if (sess) {
      await ctx.runMutation(internal.store.pushSessionAudit, {
        username: san(resolvedUser),
        event:    "disconnect",
        data:     "{}",
      });
      await ctx.runMutation(internal.store.deleteSession, { username: san(resolvedUser) });
    }
    await ctx.runMutation(internal.store.pushLog, {
      action: "plugin_disconnect",
      user:   resolvedUser,
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── read_script: plugin reports a script's source ───────────────────────────
  if (rawAction === "read_script") {
    const name       = sanStr(body["name"] ?? "", 100);
    const reportData = {
      name,
      parent:    sanStr(body["parentName"] ?? body["parent"] ?? "", 100),
      fullPath:  sanStr(body["fullPath"]   ?? "", 200),
      class:     sanStr(body["class"]      ?? body["scriptType"] ?? "Script", 30),
      source:    sanStrSafe(body["source"] ?? ""),
      lineCount: sanInt(body["lineCount"], 0, 0, 99_999),
      disabled:  !!body["disabled"],
      updatedAt: Date.now(),
    };
    await saveData(ctx, resolvedUser, "read_script", reportData);
    await pushAiFeed(
      ctx,
      resolvedUser,
      "read_script",
      `Script "${name}" (${reportData.class}, ${reportData.lineCount} lines) was read from Studio.`,
      reportData
    );
    await ctx.runMutation(internal.store.pushLog, {
      action:  "read_script",
      user:    resolvedUser,
      details: name,
    });
    return jsonResp({ ok: true, status: "ok", name }, 200, cors);
  }

  // ── workspace_scan ───────────────────────────────────────────────────────────
  if (rawAction === "workspace_scan") {
    const d = { data: sanObj(body["data"]), ts: (body["ts"] as number) ?? Date.now(), user: resolvedUser };
    await saveData(ctx, resolvedUser, "workspace_scan", d);
    return jsonResp({ ok: true, status: "ok", ts: d.ts }, 200, cors);
  }

  // ── output_report ────────────────────────────────────────────────────────────
  if (rawAction === "output_report") {
    await saveData(ctx, resolvedUser, "output_report", {
      outputs: sanArr(body["outputs"], 200),
      ts:      Date.now(),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── script_list_report ───────────────────────────────────────────────────────
  if (rawAction === "script_list_report") {
    const count = sanInt(body["total"] ?? body["count"], 0, 0, 99_999);
    await saveData(ctx, resolvedUser, "script_list_report", {
      parent:    sanStr(body["parent"] ?? "all", 100),
      scripts:   sanArr(body["scripts"] ?? body["entries"]),
      count,
      total:     count,
      breakdown: sanObj(body["breakdown"]),
      updatedAt: Date.now(),
    });
    await ctx.runMutation(internal.store.pushLog, {
      action:  "script_list_report",
      user:    resolvedUser,
      details: String(count),
    });
    return jsonResp({ ok: true, status: "ok", count }, 200, cors);
  }

  // ── script_lines_report ──────────────────────────────────────────────────────
  if (rawAction === "script_lines_report") {
    await saveData(ctx, resolvedUser, "script_lines_report", {
      name:      sanStr(body["name"] ?? "", 100),
      lineStart: sanInt(body["lineStart"], 1, 1, 99_999),
      lineEnd:   sanInt(body["lineEnd"],   1, 1, 99_999),
      total:     sanInt(body["total"],     0, 0, 99_999),
      content:   sanStrSafe(body["content"] ?? ""),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── output_log: plugin reports captured Studio Output log entries ─────────────
  if (rawAction === "output_log") {
    const logs = sanArr(body["logs"], 100);
    await ctx.runMutation(internal.store.pushLogSvc, {
      username: resolvedUser,
      newLogs:  JSON.stringify(logs),
    });
    if (logs.length > 0) {
      const errorCount = logs.filter(
        (l: any) => l?.level === "ERROR" || l?.level === "WARN"
      ).length;
      await pushAiFeed(
        ctx,
        resolvedUser,
        "output_log",
        `Studio output captured: ${logs.length} entries (${errorCount} warning/error).`,
        { logs, count: logs.length }
      );
    }
    return jsonResp({ ok: true, status: "ok", received: logs.length }, 200, cors);
  }

  // ── mention_report ───────────────────────────────────────────────────────────
  if (rawAction === "mention_report") {
    await ctx.runMutation(internal.store.pushMention, {
      username: resolvedUser,
      item: JSON.stringify({
        mention: sanStr(body["mention"] ?? "", 100),
        object:  body["object"] != null ? sanObj(body["object"]) : null,
        found:   body["object"] != null,
        ts:      Date.now(),
      }),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── toolbox_search_report ────────────────────────────────────────────────────
  if (rawAction === "toolbox_search_report") {
    const count = sanInt(body["count"], 0, 0, 99_999);
    await saveData(ctx, resolvedUser, "toolbox_search_report", {
      query:   sanStr(body["query"] ?? "", 200),
      results: sanArr(body["results"]),
      count,
    });
    return jsonResp({ ok: true, status: "ok", count }, 200, cors);
  }

  // ── descendants_report ───────────────────────────────────────────────────────
  if (rawAction === "descendants_report") {
    await saveData(ctx, resolvedUser, "descendants_report", {
      target:      sanStr(body["target"] ?? "", 100),
      descendants: sanArr(body["descendants"]),
      count:       sanInt(body["count"], 0, 0, 99_999),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── properties_report ────────────────────────────────────────────────────────
  if (rawAction === "properties_report") {
    await saveData(ctx, resolvedUser, "properties_report", {
      name:       sanStr(body["name"] ?? "", 100),
      properties: sanObj(body["properties"]),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── properties_set_report ────────────────────────────────────────────────────
  if (rawAction === "properties_set_report") {
    await saveData(ctx, resolvedUser, "properties_report", {
      name:       sanStr(body["name"] ?? body["instance"] ?? "", 100),
      properties: sanObj(body["properties"] ?? body["changed"] ?? {}),
      count:      sanInt(body["count"], 0, 0, 9_999),
      updatedAt:  Date.now(),
    });
    await ctx.runMutation(internal.store.pushLog, {
      action:  "properties_set_report",
      user:    resolvedUser,
      details: sanStr(String(body["name"] ?? ""), 50),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── action_list_report ───────────────────────────────────────────────────────
  if (rawAction === "action_list_report") {
    await saveData(ctx, resolvedUser, "action_list_report", {
      actions: sanArr(body["actions"]),
      count:   sanInt(body["count"], 0, 0, 9_999),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── asset_library_report ─────────────────────────────────────────────────────
  if (rawAction === "asset_library_report") {
    await saveData(ctx, resolvedUser, "asset_library_report", {
      category: sanStr(body["category"] ?? "all", 50),
      data:     sanObj(body["data"] ?? body["summary"]),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── asset_id_report ──────────────────────────────────────────────────────────
  if (rawAction === "asset_id_report") {
    await saveData(ctx, resolvedUser, "asset_id_report", {
      category: sanStr(body["category"] ?? "", 50),
      sub:      sanStr(body["sub"]      ?? "", 50),
      name:     sanStr(body["name"]     ?? "", 100),
      id:       sanStr(body["id"]       ?? "", 100),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── asset_folder_report ──────────────────────────────────────────────────────
  if (rawAction === "asset_folder_report") {
    await saveData(ctx, resolvedUser, "asset_folder_report", {
      folder:   sanStr(body["folder"] ?? "all", 50),
      contents: sanObj(body["contents"]),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── module_deploy_report ─────────────────────────────────────────────────────
  if (rawAction === "module_deploy_report") {
    await saveData(ctx, resolvedUser, "module_deploy_report", {
      name:   sanStr(body["name"]   ?? "", 100),
      parent: sanStr(body["parent"] ?? "", 100),
      source: sanStr(body["source"] ?? "", 100),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── module_list_report ───────────────────────────────────────────────────────
  if (rawAction === "module_list_report") {
    await saveData(ctx, resolvedUser, "module_list_report", {
      folder:  sanStr(body["folder"] ?? "modulescripts", 100),
      modules: sanArr(body["modules"]),
      count:   sanInt(body["count"], 0, 0, 999),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── terrain_materials_report ─────────────────────────────────────────────────
  if (rawAction === "terrain_materials_report") {
    await saveData(ctx, resolvedUser, "terrain_materials_report", {
      materials: sanArr(body["materials"]),
      count:     sanInt(body["count"], 0, 0, 999),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── runcode_report: result of a run_code action, forwarded to the AI feed ────
  if (rawAction === "runcode_report") {
    const result = {
      mode:    sanStr(body["mode"] ?? "pipeline", 20),
      success: !!body["success"],
      output:  body["output"] ?? null,
      log:     sanArr(body["log"], 200),
      ts:      Date.now(),
    };
    await saveData(ctx, resolvedUser, "runcode_report", result);
    await pushAiFeed(
      ctx,
      resolvedUser,
      "runcode_report",
      `run_code (${result.mode}) finished: ${result.success ? "success" : "failed"}.`,
      result
    );
    await ctx.runMutation(internal.store.pushLog, {
      action:  "runcode_report",
      user:    resolvedUser,
      details: JSON.stringify({ mode: result.mode, success: result.success }),
    });
    return jsonResp({ ok: true, status: "ok", mode: result.mode, success: result.success }, 200, cors);
  }

  // ── expression_report ────────────────────────────────────────────────────────
  if (rawAction === "expression_report") {
    const result = {
      expression: sanStr(body["expression"] ?? "", 300),
      result:     body["result"] != null ? String(body["result"]).substring(0, 2000) : null,
      ts:         Date.now(),
    };
    await saveData(ctx, resolvedUser, "expression_report", result);
    return jsonResp({ ok: true, status: "ok", expression: result.expression }, 200, cors);
  }

  // ── query_report ─────────────────────────────────────────────────────────────
  if (rawAction === "query_report") {
    const result = {
      results: sanArr(body["results"], 200),
      count:   sanInt(body["count"], 0, 0, 99_999),
      ts:      Date.now(),
    };
    await saveData(ctx, resolvedUser, "query_report", result);
    return jsonResp({ ok: true, status: "ok", count: result.count }, 200, cors);
  }

  // ── plugin_error_report: forwarded to AI feed so problems surface proactively ─
  if (rawAction === "plugin_error_report") {
    const errorEntry = {
      actionName: sanStr(body["actionName"] ?? body["action_name"] ?? "unknown", 80),
      message:    sanStr(body["message"]    ?? body["error"]       ?? "", 500),
      timestamp:  (body["timestamp"] as number) ?? Date.now(),
      ts:         Date.now(),
    };
    await ctx.runMutation(internal.store.pushPluginError, {
      username: resolvedUser,
      item:     JSON.stringify(errorEntry),
    });
    await pushAiFeed(
      ctx,
      resolvedUser,
      "plugin_error_report",
      `Plugin error in "${errorEntry.actionName}": ${errorEntry.message.substring(0, 120)}`,
      errorEntry
    );
    await ctx.runMutation(internal.store.pushLog, {
      action:  "plugin_error_report",
      user:    resolvedUser,
      details: errorEntry.message.substring(0, 80),
    });
    return jsonResp({ ok: true, status: "ok" }, 200, cors);
  }

  // ── dispatch_command: web/AI → plugin, single command ────────────────────────
  if (rawAction === "dispatch_command") {
    const sender   = san(body["_user"]        ?? "");
    const target   = san(body["_target_user"] ?? sender);
    const cmd      = sanObj(body["command"]);
    const priority = sanPriority(body["priority"] ?? body["_priority"]);

    if (!target)
      return jsonResp({ ok: false, status: "error", error: '"_user" or "_target_user" is required.', pushed: 0 }, 200, cors);

    const act = migrateActionName(sanAction(cmd["action"]));
    if (!act)
      return jsonResp({ ok: false, status: "error", error: '"command.action" is required.', pushed: 0 }, 200, cors);

    const auth = await authorizeCommand(ctx, request, body, sender, target, act);
    if (!auth.ok)
      return jsonResp(
        { ok: false, status: "error", error: auth.error, pushed: 0, required_plugin_version: REQUIRED_PLUGIN_VERSION },
        200,
        cors
      );

    const cmdToQueue: QueueCommand = {
      ...(cmd as QueueCommand),
      action:         act,
      _user:          String(body["_user"] ?? "web").substring(0, 50),
      _target_user:   target,
      _apiKey:        undefined,
      _session_token: undefined,
      _place_id:      undefined,
    };

    const pushed     = await pushQueue(ctx, target, cmdToQueue, priority);
    const lastPollTs = await ctx.runQuery(internal.store.getLastPoll,     { username: target });
    const qc         = await ctx.runQuery(internal.store.countQueueItems, { username: target });

    await ctx.runMutation(internal.store.bumpStats,       { user: sender ?? "web", action: act });
    await ctx.runMutation(internal.store.pushLog,         { action: act, user: sender ?? "web", target, details: sanStr(String(cmd["name"] ?? ""), 50) });
    await ctx.runMutation(internal.store.pushUserHistory, { username: sender, action: act, details: sanStr(String(cmd["name"] ?? ""), 60) });

    return jsonResp(
      {
        ok:                      true,
        status:                  "ok",
        pushed:                  pushed ? 1 : 0,
        action:                  act,
        target,
        priority,
        pluginConnected:         Date.now() - lastPollTs < 8_000,
        queueLength:             qc.total,
        required_plugin_version: REQUIRED_PLUGIN_VERSION,
      },
      200,
      cors
    );
  }

  // ── reset: clear queue ───────────────────────────────────────────────────────
  if (rawAction === "reset") {
    const target = san(body["_user"] ?? body["user"] ?? "");
    if (!target) return errResp(cors, 400, '"user" is required.');
    const auth = await authorizeCommand(ctx, request, body, ratUser, target, null);
    if (!auth.ok) return errResp(cors, auth.status!, auth.error!);
    await ctx.runMutation(internal.store.clearQueueItems, { username: target });
    return jsonResp({ ok: true, status: "ok", message: "Queue reset.", user: target }, 200, cors);
  }

  // ── status ───────────────────────────────────────────────────────────────────
  if (rawAction === "status") {
    const target     = san(body["_user"] ?? body["user"] ?? "");
    const sess       = await ctx.runQuery(internal.store.getSession,      { username: target });
    const qc         = await ctx.runQuery(internal.store.countQueueItems, { username: target });
    const lastPollTs = await ctx.runQuery(internal.store.getLastPoll,     { username: target });
    return jsonResp(
      {
        ok:                      true,
        connected:               Date.now() - lastPollTs < 8_000,
        lastPoll:                lastPollTs,
        queueLength:             qc.total,
        priorityQueue:           qc.priority,
        normalQueue:             qc.normal,
        sessionStats:            await getSessionStats(ctx, target),
        hasSession:              !!sess,
        placeId:                 sess?.placeId ?? null,
        required_plugin_version: REQUIRED_PLUGIN_VERSION,
        currentProject:          await getProject(ctx, target),
      },
      200,
      cors
    );
  }

  // ── set_project ──────────────────────────────────────────────────────────────
  if (rawAction === "set_project") {
    if (!resolvedUser) return errResp(cors, 400, '"_user" is required.');
    const auth = await authorizeCommand(ctx, request, body, ratUser, resolvedUser, "set_project");
    if (!auth.ok) return errResp(cors, auth.status!, auth.error!);
    const data: Partial<ProjectData> = {
      projectId:   sanStr(String(body["projectId"]   ?? body["project_id"]   ?? ""), 100),
      projectName: sanStr(String(body["projectName"] ?? body["project_name"] ?? ""), 100),
      placeId:     sanStr(String(body["placeId"]     ?? body["place_id"]     ?? ""), 50),
    };
    await saveProject(ctx, resolvedUser, data);
    await ctx.runMutation(internal.store.pushLog, {
      action:  "set_project",
      user:    resolvedUser,
      details: JSON.stringify(data),
    });
    return jsonResp({ ok: true, status: "ok", ...data }, 200, cors);
  }

  // ── set_webhook ──────────────────────────────────────────────────────────────
  if (rawAction === "set_webhook") {
    if (!resolvedUser) return errResp(cors, 400, '"_user" is required.');
    const auth = await authorizeCommand(ctx, request, body, ratUser, resolvedUser, null);
    if (!auth.ok) return errResp(cors, auth.status!, auth.error!);

    const webhookUrl = body["url"] ? sanUrl(String(body["url"])) : null;
    if (body["url"] && !webhookUrl)
      return errResp(cors, 400, "Webhook URL must be a valid HTTPS URL.");

    if (webhookUrl)
      await ctx.runMutation(internal.store.upsertWebhook, { username: resolvedUser, url: webhookUrl });
    else
      await ctx.runMutation(internal.store.deleteWebhook, { username: resolvedUser });

    return jsonResp(
      { ok: true, status: "ok", webhookSet: !!webhookUrl, user: resolvedUser },
      200,
      cors
    );
  }

  // ── dispatch_multi_target (admin only) ───────────────────────────────────────
  if (rawAction === "dispatch_multi_target" && Array.isArray(body["targets"])) {
    if (!verifyAdminToken(request))
      return errResp(cors, 401, "Admin token required for dispatch_multi_target.");

    const targets  = sanArr<unknown>(body["targets"], MAX_MULTI_TARGETS).map((t) => san(String(t)));
    const cmd      = sanObj(body["command"]);
    const act      = migrateActionName(sanAction(cmd["action"]));
    const priority = sanPriority(body["priority"]);

    if (!act) return errResp(cors, 400, '"command.action" is required.');

    let pushed = 0;
    const results: Record<string, { sent: boolean; online: boolean }> = {};

    for (const target of targets) {
      const lastPollTs = await ctx.runQuery(internal.store.getLastPoll, { username: target });
      const sent       = await pushQueue(ctx, target, {
        ...(cmd as QueueCommand),
        action:         act,
        _user:          resolvedUser,
        _target_user:   target,
        _apiKey:        undefined,
        _session_token: undefined,
        _place_id:      undefined,
      }, priority);
      results[target] = { sent, online: Date.now() - lastPollTs < 8_000 };
      if (sent) pushed++;
    }

    await ctx.runMutation(internal.store.bumpStats, {
      user:   resolvedUser ?? "admin",
      action: `multi:${act}`,
    });
    return jsonResp({ ok: true, status: "ok", pushed, targets: results }, 200, cors);
  }

  // ── Admin: get_logs / get_history via POST ────────────────────────────────────
  if (rawAction === "get_logs" || rawAction === "get_history") {
    if (!verifyAdminToken(request)) return errResp(cors, 401, "Admin token required.");
    if (rawAction === "get_logs") {
      const limit = sanInt(body["limit"], 100, 1, 300);
      const logs  = await ctx.runQuery(internal.store.getLogs, { limit });
      return jsonResp({ ok: true, logs }, 200, cors);
    }
    const limit   = sanInt(body["limit"], 50, 1, 150);
    const history = await ctx.runQuery(internal.store.getHistory, { limit });
    return jsonResp({ ok: true, history }, 200, cors);
  }

  // ── search_toolbox ───────────────────────────────────────────────────────────
  if (rawAction === "search_toolbox") {
    const sender    = san(body["_user"] ?? "");
    const keyword   = sanStr(String(body["keyword"] ?? body["query"] ?? body["term"] ?? ""), 100).trim();
    const assetType = sanStr(String(body["asset_type"] ?? body["assetType"] ?? "Model"), 30);
    const limit     = sanInt(body["limit"] ?? body["count"], 10, 1, 50);
    const cursor    = body["cursor"] ? sanStr(String(body["cursor"]), 200) : null;

    if (!keyword) return errResp(cors, 400, '"keyword" is required.');

    try {
      const result     = await robloxToolboxSearch(ctx, keyword, assetType, limit, cursor);
      const target     = san(body["_target_user"] ?? sender);
      const lastPollTs = await ctx.runQuery(internal.store.getLastPoll, { username: target });

      if (target && Date.now() - lastPollTs < 8_000) {
        await pushQueue(ctx, target, {
          action:     "toolbox_search_report",
          keyword,
          assetType,
          assets:     result.assets.slice(0, 20),
          nextCursor: result.nextCursor,
          total:      result.total,
          _user:      sender,
        }, "normal");
      }

      await ctx.runMutation(internal.store.bumpStats, { user: sender ?? "web", action: "search_toolbox" });
      await ctx.runMutation(internal.store.pushLog, {
        action:  "search_toolbox",
        user:    sender ?? "web",
        target,
        details: JSON.stringify({ keyword: sanStr(keyword, 50), assetType, found: result.assets.length }),
      });

      return jsonResp(
        {
          ok:             true,
          status:         "ok",
          keyword,
          assetType,
          assets:         result.assets,
          nextCursor:     result.nextCursor,
          total:          result.total,
          count:          result.assets.length,
          pluginNotified: Date.now() - lastPollTs < 8_000,
        },
        200,
        cors
      );
    } catch (err) {
      const code = (err as { code?: number })?.code ?? 500;
      return errResp(
        cors,
        code === 400 ? 400 : code === 429 ? 429 : 502,
        sanStr((err as Error)?.message ?? "Toolbox search failed.", 200)
      );
    }
  }

  // ── insert_model ─────────────────────────────────────────────────────────────
  if (rawAction === "insert_model") {
    const sender   = san(body["_user"] ?? "");
    const target   = san(body["_target_user"] ?? sender);
    const assetId  = body["asset_id"] ?? body["assetId"] ?? body["id"] ?? "";
    const parent   = sanStr(String(body["parent"] ?? body["parentPath"] ?? "workspace"), 100);
    const priority = sanPriority(body["priority"]);

    if (!assetId) return errResp(cors, 400, '"asset_id" is required.');
    if (!target)  return errResp(cors, 400, '"_user" is required.');

    const auth = await authorizeCommand(ctx, request, body, sender, target, "insert_asset");
    if (!auth.ok) return errResp(cors, auth.status!, auth.error!);

    try {
      const asset = await validateAsset(ctx, assetId);
      if (!asset.insertable && asset.assetType !== "Unknown")
        return errResp(cors, 400, `AssetType "${asset.assetType}" cannot be inserted into Workspace.`);

      await pushQueue(ctx, target, {
        action:        "insert_asset",
        asset_id:      asset.assetId,
        name:          asset.name,
        parent,
        insert_script: asset.insertScript,
        _user:         sender,
        _target_user:  target,
      }, priority);

      const lastPollTs = await ctx.runQuery(internal.store.getLastPoll,     { username: target });
      const qc         = await ctx.runQuery(internal.store.countQueueItems, { username: target });

      await ctx.runMutation(internal.store.bumpStats,       { user: sender ?? "web", action: "insert_model" });
      await ctx.runMutation(internal.store.pushLog,         { action: "insert_model", user: sender ?? "web", target, details: JSON.stringify({ assetId: asset.assetId, assetName: sanStr(asset.name, 50), parent }) });
      await ctx.runMutation(internal.store.pushUserHistory, { username: sender, action: "insert_model", details: `${asset.name} (${asset.assetId})` });

      return jsonResp(
        {
          ok:              true,
          status:          "ok",
          assetId:         asset.assetId,
          name:            asset.name,
          description:     asset.description ?? "",
          assetType:       asset.assetType,
          creator:         asset.creator,
          isPublic:        asset.isPublic,
          unverified:      asset.unverified  ?? false,
          insertable:      asset.insertable,
          insertScript:    asset.insertScript,
          parent,
          priority,
          pluginConnected: Date.now() - lastPollTs < 8_000,
          queued:          true,
          queueLength:     qc.total,
        },
        200,
        cors
      );
    } catch (err) {
      const code = (err as { code?: number })?.code ?? 500;
      return errResp(cors, code === 400 ? 400 : 502, sanStr((err as Error)?.message ?? "Insert failed.", 200));
    }
  }

  // ── search_docs ──────────────────────────────────────────────────────────────
  if (rawAction === "search_docs") {
    const sender  = san(body["_user"] ?? "");
    const query   = sanStr(String(body["query"] ?? body["keyword"] ?? body["q"] ?? ""), 150).trim();
    const docType = ["api", "guide", "all"].includes(String(body["doc_type"] ?? ""))
      ? String(body["doc_type"])
      : "all";
    const limit = sanInt(body["limit"], 5, 1, 20);

    if (!query) return errResp(cors, 400, '"query" is required.');

    try {
      const result = await searchDocs(ctx, query, docType, limit);
      await ctx.runMutation(internal.store.bumpStats, { user: sender ?? "web", action: "search_docs" });
      return jsonResp(
        {
          ok:      true,
          status:  "ok",
          query,
          docType,
          results: result.results,
          count:   result.results.length,
          source:  result.source,
        },
        200,
        cors
      );
    } catch (err) {
      return errResp(cors, 500, sanStr((err as Error)?.message ?? "Docs search failed.", 200));
    }
  }

  // ── get_game_info ────────────────────────────────────────────────────────────
  if (rawAction === "get_game_info") {
    const sender  = san(body["_user"] ?? "");
    const isPlace = body["type"] === "place" || !!body["place_id"];
    const id      = parseInt(
      String(body["id"] ?? body["universe_id"] ?? body["place_id"] ?? "0").replace(/\D/g, ""),
      10
    );
    if (!id) return errResp(cors, 400, '"id" is required.');
    try {
      const info = await fetchGameInfo(ctx, id, isPlace);
      await ctx.runMutation(internal.store.bumpStats, { user: sender ?? "web", action: "get_game_info" });
      return jsonResp({ ok: true, status: "ok", ...info }, 200, cors);
    } catch (err) {
      return errResp(cors, 502, sanStr((err as Error)?.message ?? "Failed to fetch game info.", 200));
    }
  }

  // ── get_user_info / get_avatar_info ──────────────────────────────────────────
  if (rawAction === "get_user_info" || rawAction === "get_avatar_info") {
    const sender = san(body["_user"] ?? "");
    const userId = parseInt(
      String(body["user_id"] ?? body["userId"] ?? body["id"] ?? "0").replace(/\D/g, ""),
      10
    );
    if (!userId) return errResp(cors, 400, '"user_id" is required.');
    try {
      const info = await fetchUserInfo(ctx, userId);
      await ctx.runMutation(internal.store.bumpStats, { user: sender ?? "web", action: rawAction });
      return jsonResp({ ok: true, status: "ok", ...info }, 200, cors);
    } catch (err) {
      return errResp(cors, 502, sanStr((err as Error)?.message ?? "Failed to fetch user info.", 200));
    }
  }

  // ── validate_asset ───────────────────────────────────────────────────────────
  if (rawAction === "validate_asset") {
    const sender  = san(body["_user"] ?? "");
    const assetId = body["asset_id"] ?? body["assetId"] ?? body["id"] ?? "";
    if (!assetId) return errResp(cors, 400, '"asset_id" is required.');
    try {
      const asset = await validateAsset(ctx, assetId);
      await ctx.runMutation(internal.store.bumpStats, { user: sender ?? "web", action: "validate_asset" });
      return jsonResp({ ok: true, status: "ok", ...asset }, 200, cors);
    } catch (err) {
      const code = (err as { code?: number })?.code ?? 500;
      return errResp(cors, code === 400 ? 400 : 502, sanStr((err as Error)?.message ?? "", 200));
    }
  }

  // ── dispatch_batch ───────────────────────────────────────────────────────────
  if (rawAction === "dispatch_batch") {
    const sender   = san(body["_user"] ?? "");
    const target   = san(body["target"] ?? body["_target_user"] ?? sender);
    const priority = sanPriority(body["priority"]);

    if (!target) return errResp(cors, 400, '"target" is required.');

    let rawCommands: unknown[] = [];
    if (Array.isArray(body["commands"]))       rawCommands = body["commands"] as unknown[];
    else if (typeof body["text"] === "string") rawCommands = extractCommandsFromText(body["text"] as string);

    const isAdmin = verifyAdminToken(request);
    if (!isAdmin && sender !== target)
      return errResp(cors, 403, "Forbidden: cannot target another user.");
    if (!isAdmin) {
      const auth = await authorizeCommand(ctx, request, body, sender, target, null);
      if (!auth.ok) return errResp(cors, auth.status!, auth.error!);
    }

    const { safe, removed } = filterBatch(rawCommands, isAdmin);
    let pushed = 0;
    const skipped: string[] = [...removed];

    for (const cmd of safe) {
      if (!cmd?.action) continue;
      const act = migrateActionName(sanAction(cmd.action));
      if (!act) { skipped.push(String(cmd.action)); continue; }
      await pushQueue(ctx, target, {
        ...cmd,
        action:         act,
        _user:          String(body["_user"] ?? "web").substring(0, 50),
        _target_user:   target,
        _apiKey:        undefined,
        _session_token: undefined,
        _place_id:      undefined,
      }, priority);
      pushed++;
    }

    dispatchWebhook(ctx, sender, "dispatch_batch", { pushed, target }).catch(() => {});

    const lastPollTs = await ctx.runQuery(internal.store.getLastPoll,     { username: target });
    const qc         = await ctx.runQuery(internal.store.countQueueItems, { username: target });

    await ctx.runMutation(internal.store.bumpStats,       { user: sender ?? "web", action: "dispatch_batch" });
    await ctx.runMutation(internal.store.pushLog,         { action: "dispatch_batch", user: sender ?? "web", target, details: JSON.stringify({ count: pushed, skipped, priority }) });
    await ctx.runMutation(internal.store.pushUserHistory, { username: sender, action: "dispatch_batch", details: `${pushed} commands → ${target}` });

    return jsonResp(
      {
        ok:                      true,
        status:                  "ok",
        pushed,
        skipped,
        priority,
        warning:                 removed.length > 0 ? `${removed.length} admin-gated action(s) removed.` : undefined,
        pluginConnected:         Date.now() - lastPollTs < 8_000,
        queueLength:             qc.total,
        required_plugin_version: REQUIRED_PLUGIN_VERSION,
      },
      200,
      cors
    );
  }

  // ── dispatch_from_text ───────────────────────────────────────────────────────
  if (rawAction === "dispatch_from_text") {
    const sender   = san(body["_user"] ?? "");
    const target   = san(body["_target_user"] ?? sender);
    const priority = sanPriority(body["priority"]);

    if (!target) return errResp(cors, 400, '"_target_user" is required.');

    const isAdmin = verifyAdminToken(request);
    if (!isAdmin && sender !== target)
      return errResp(cors, 403, "Forbidden: dispatch_from_text cannot target another user.");
    if (!isAdmin) {
      const auth = await authorizeCommand(ctx, request, body, sender, target, null);
      if (!auth.ok) return errResp(cors, auth.status!, auth.error!);
    }

    const inputText = String(
      body["text"] ??
      (Array.isArray(body["commands"]) ? JSON.stringify({ commands: body["commands"] }) : "")
    );

    const extracted  = extractCommandsFromText(inputText);
    const adminGated = getAdminGatedActions();
    let pushed = 0;
    const skipped: string[] = [];

    for (const cmd of extracted) {
      if (!cmd?.action) continue;
      const act = migrateActionName(sanAction(cmd.action));
      if (!act)                            { skipped.push(String(cmd.action)); continue; }
      if (!isAdmin && adminGated.has(act)) { skipped.push(`[admin-only] ${act}`); continue; }
      await pushQueue(ctx, target, {
        ...cmd,
        action:         act,
        _user:          String(body["_user"] ?? "web").substring(0, 50),
        _target_user:   target,
        _apiKey:        undefined,
        _session_token: undefined,
        _place_id:      undefined,
      }, priority);
      pushed++;
    }

    const lastPollTs = await ctx.runQuery(internal.store.getLastPoll,     { username: target });
    const qc         = await ctx.runQuery(internal.store.countQueueItems, { username: target });

    await ctx.runMutation(internal.store.bumpStats, { user: sender ?? "web", action: "dispatch_from_text" });
    await ctx.runMutation(internal.store.pushLog,   { action: "dispatch_from_text", user: sender ?? "web", target, details: JSON.stringify({ count: pushed, skipped }) });

    return jsonResp(
      {
        ok:              true,
        status:          "ok",
        pushed,
        skipped,
        priority,
        pluginConnected: Date.now() - lastPollTs < 8_000,
        queueLength:     qc.total,
      },
      200,
      cors
    );
  }

  // ── Generic single-action dispatch ───────────────────────────────────────────
  // Handles all plugin-registered actions not covered above:
  // create_instance, create_script, edit_script, set_properties, rename,
  // delete, parent, list, insert_asset, play_test, run_test, stop_test,
  // terrain, undo, redo, resolve_mention, run_code, ping, get_info,
  // get_all_actions, none, etc.
  if (rawAction) {
    const act      = migrateActionName(sanAction(rawAction));
    const priority = sanPriority(body["priority"] ?? body["_priority"]);
    const sender   = san(body["_user"] ?? "");
    const target   = san(body["_target_user"] ?? sender);

    if (!act)    return errResp(cors, 400, "Action name could not be parsed.");
    if (!target) return errResp(cors, 400, '"_target_user" or "_user" is required.');

    const auth = await authorizeCommand(ctx, request, body, sender, target, act);
    if (!auth.ok) return errResp(cors, auth.status!, auth.error!);

    await pushQueue(ctx, target, {
      ...(body as QueueCommand),
      action:         act,
      _user:          String(body["_user"] ?? "web").substring(0, 50),
      _target_user:   target,
      _apiKey:        undefined,
      _session_token: undefined,
      _place_id:      undefined,
    }, priority);

    dispatchWebhook(ctx, sender, "command_queued", { action: act, target }).catch(() => {});

    const lastPollTs = await ctx.runQuery(internal.store.getLastPoll,     { username: target });
    const qc         = await ctx.runQuery(internal.store.countQueueItems, { username: target });

    await ctx.runMutation(internal.store.bumpStats,       { user: sender ?? "web", action: act });
    await ctx.runMutation(internal.store.pushLog,         { action: act, user: sender ?? "web", target, details: sanStr(String(body["name"] ?? ""), 50) });
    await ctx.runMutation(internal.store.pushHistory,     { action: act, details: sanStr(String(body["name"] ?? JSON.stringify(body).substring(0, 80)), 200), user: sender ?? "web", target });
    await ctx.runMutation(internal.store.pushUserHistory, { username: sender, action: act, details: sanStr(String(body["name"] ?? ""), 60) });

    return jsonResp(
      {
        ok:                      true,
        status:                  "ok",
        action:                  act,
        target,
        priority,
        pluginConnected:         Date.now() - lastPollTs < 8_000,
        queueLength:             qc.total,
        required_plugin_version: REQUIRED_PLUGIN_VERSION,
      },
      200,
      cors
    );
  }

  // ── Fallback ─────────────────────────────────────────────────────────────────
  return errResp(
    cors,
    400,
    'Request not recognised. Include a valid "action" or query parameter.',
    { hint: 'POST with { "action": "your_action", "_user": "username", ... }' }
  );
}