// api/control.ts — NEXUS AI Control API v14.1 (TypeScript)
// Converted from control.js:
//   • Full TypeScript strict types — no implicit 'any'
//   • Theme functions removed (theme_data, themes_list, theme_applied, theme_compare)
//   • Imports aligned with _security.ts (AdaptedRequest / AdaptedResponse)
//   • All sanitiser return types annotated
//   • setInterval / setTimeout typed via ReturnType<>

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync, statSync } from 'fs';
import crypto from 'crypto';
import type { AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route.js';

// ── VERSION ───────────────────────────────────────────────────────────────────
export const REQUIRED_PLUGIN_VERSION = 'V1.3.29';
export const WEB_VERSION             = 'V14.1';
const        API_VERSION             = 'v14';

// ── TUNABLES ──────────────────────────────────────────────────────────────────
const TMP                 = '/tmp';
const SESSION_TTL         = 24 * 60 * 60 * 1_000;
const SESSION_TOKEN_MAX   = 128;
const MIN_ADMIN_TOKEN_LEN = 16;
const MAX_BODY_FIELD_LEN  = 50_000;
const MAX_QUEUE_SIZE      = 300;
const MAX_PRIORITY_QUEUE  = 50;
const QUEUE_MAX_AGE       = 30 * 60_000;
const DEDUP_WINDOW        = 500;
const MAX_LOG_ENTRIES     = 500;
const MAX_HIST_ENTRIES    = 200;
const MAX_LOGSVC_ENTRIES  = 1_000;
const MAX_MENTION_ENTRIES = 100;
const MAX_USER_HIST       = 100;
const RATE_USER_PER_MIN   = 150;
const RATE_IP_PER_MIN     = 300;
const RATE_BURST_COUNT    = 20;
const RATE_BURST_WINDOW   = 5_000;
const TTL_TOOLBOX         =  5 * 60_000;
const TTL_ASSET           = 30 * 60_000;
const TTL_USER_INFO       = 10 * 60_000;
const TTL_GAME_INFO       = 15 * 60_000;

const DEFAULT_ADMIN_ACTIONS = new Set<string>([
  'play_test', 'run_test', 'stop_test',
  'delete',
]);

const ALLOWED_ORIGINS = new Set<string>([
  'https://nexusai-rbx.vercel.app',
  'https://nexusai.gg',
  'http://localhost:3000',
]);

// ── INTERFACES ────────────────────────────────────────────────────────────────
interface SessionEntry {
  token:      string;
  placeId:    string | null;
  userId:     string | null;
  createdAt:  number;
  lastSeen:   number;
  reconnects: number;
  cmdCount:   number;
}

interface SessionStats {
  hasSession: boolean;
  placeId:    string | null;
  userId:     string | null;
  ageMs:      number;
  lastSeenMs: number;
  reconnects: number;
  cmdCount:   number;
}

interface RateBucket {
  count: number;
  reset: number;
}

interface BurstBucket {
  count:     number;
  windowEnd: number;
}

interface CacheEntry<T> {
  data:      T;
  expiresAt: number;
}

interface QueueCommand {
  action:        string;
  _priority?:    string;
  _ts?:          number;
  _user?:        string;
  _target_user?: string;
  [key: string]: unknown;
}

interface ProjectData {
  projectId:   string;
  projectName: string;
  placeId:     string;
  updatedAt:   number;
}

interface WebhookData {
  url:       string;
  updatedAt: number;
}

interface AssetResult {
  valid:         boolean;
  assetId:       string;
  name:          string;
  description?:  string;
  assetType:     string;
  creator:       { name: string; type: string; userId: string };
  isPublic:      boolean;
  insertable:    boolean;
  insertScript:  string;
  unverified?:   boolean;
}

interface ToolboxResult {
  assets:     AssetItem[];
  nextCursor: string | null;
  total:      number;
}

interface AssetItem {
  assetId:     string;
  name:        string;
  description: string;
  assetType:   string;
  creator:     { name: string; type: string; userId: string };
  thumbnail:   string;
  updated:     string | null;
}

interface UserInfo {
  userId:      number;
  username:    string;
  displayName: string;
  description: string;
  isBanned:    boolean;
  created:     string | null;
  avatarUrl:   string;
}

interface GameInfo {
  universeId:     number;
  placeId:        number;
  name:           string;
  description:    string;
  creator:        { name: string; type: string };
  playing:        number;
  visits:         number;
  maxPlayers:     number;
  favoritedCount: number;
  genre:          string;
  thumbnailUrl:   string;
}

interface DocsResult {
  results: DocEntry[];
  source:  string;
  query:   string;
}

interface DocEntry {
  title:    string;
  url:      string;
  snippet:  string;
  category: string;
  score?:   number;
  keywords?: string;
}

interface AuthResult {
  ok:      boolean;
  status?: number;
  error?:  string;
}

interface FilterResult {
  safe:    QueueCommand[];
  removed: string[];
}

interface GlobalStats {
  totalCommands:  number;
  totalUsers:     number;
  startedAt:      number;
  userStats:      Record<string, { commands: number; firstSeen: number; lastSeen: number; lastAction?: string }>;
  popularActions: Record<string, number>;
}

// ── SANITISERS ────────────────────────────────────────────────────────────────
function san(user: unknown): string {
  if (user == null) return 'default';
  return String(user).replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase().substring(0, 40) || 'default';
}

function sanStr(str: unknown, maxLen: number = 200): string {
  if (typeof str !== 'string') str = String(str ?? '');
  return (str as string)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/[<>]/g, '')
    .substring(0, maxLen);
}

function sanStrSafe(str: unknown, maxLen: number = MAX_BODY_FIELD_LEN): string {
  if (typeof str !== 'string') str = String(str ?? '');
  return (str as string)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .substring(0, maxLen);
}

function escapeHtml(str: unknown, maxLen: number = 500): string {
  return String(str ?? '').substring(0, maxLen)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;');
}

function sanInt(val: unknown, def: number = 0, min: number = 0, max: number = 999_999): number {
  const n = parseInt(String(val ?? ''), 10);
  return isNaN(n) ? def : Math.max(min, Math.min(max, n));
}

function sanObj(val: unknown): Record<string, unknown> {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

function sanArr<T = unknown>(val: unknown, maxLen: number = 500): T[] {
  return Array.isArray(val) ? (val as T[]).slice(0, maxLen) : [];
}

function sanPriority(val: unknown): string {
  return ['critical', 'high', 'normal', 'low'].includes(String(val ?? ''))
    ? String(val)
    : 'normal';
}

function sanAction(val: unknown): string {
  return String(val || '').toLowerCase().replace(/[^a-z0-9_]/g, '').substring(0, 80);
}

function getAdminActions(): Set<string> {
  const env = process.env.NEXUS_ADMIN_ACTIONS || '';
  if (!env) return DEFAULT_ADMIN_ACTIONS;
  return new Set(env.split(',').map(s => s.trim()).filter(Boolean));
}

// ── FILE PATHS ────────────────────────────────────────────────────────────────
const fp = (prefix: string, u: string): string => `${TMP}/${prefix}_${san(u)}.json`;

const queueFile         = (u: string): string => fp('nq',        u);
const priorityQFile     = (u: string): string => fp('nqp',       u);
const pollFile          = (u: string): string => `${TMP}/np_${san(u)}.txt`;
const outFile           = (u: string): string => fp('no',        u);
const wsFile            = (u: string): string => fp('nw',        u);
const scriptFile        = (u: string): string => fp('ns',        u);
const scriptListFile    = (u: string): string => fp('nsl',       u);
const scriptLinesFile   = (u: string): string => fp('nslv',      u);
const logSvcFile        = (u: string): string => fp('nlg',       u);
const projectFile       = (u: string): string => fp('nprj',      u);
const mentionFile       = (u: string): string => fp('nmention',  u);
const searchFile        = (u: string): string => fp('nsearch',   u);
const gameScanFile      = (u: string): string => fp('ngscan',    u);
const descendantsFile   = (u: string): string => fp('ndesc',     u);
const propertiesFile    = (u: string): string => fp('nprop',     u);
const actionListFile    = (u: string): string => fp('nact',      u);
const assetLibFile      = (u: string): string => fp('nasset',    u);
const assetIdFile       = (u: string): string => fp('nassetid',  u);
const assetFolderFile   = (u: string): string => fp('nafolder',  u);
const moduleListFile    = (u: string): string => fp('nmodlist',  u);
const moduleDeployFile  = (u: string): string => fp('nmoddep',   u);
const terrainFile       = (u: string): string => fp('nterrain',  u);
const userHistFile      = (u: string): string => fp('nucmdh',    u);
const sessionAuditFile  = (u: string): string => fp('nsessaud',  u);
const webhookFile       = (u: string): string => fp('nwebhook',  u);
const runCodeResultFile = (u: string): string => fp('nrcresult', u);
const exprResultFile    = (u: string): string => fp('nexprres',  u);
const queryResultFile   = (u: string): string => fp('nqryres',   u);
const pluginErrorFile   = (u: string): string => fp('nplgerr',   u);

const LOG_FILE   = `${TMP}/nexus_log.json`;
const HIST_FILE  = `${TMP}/nexus_hist.json`;
const STATS_FILE = `${TMP}/nexus_global_stats.json`;

// Theme-related prefixes removed
const FILE_PREFIXES: string[] = [
  'nq_', 'nqp_', 'np_', 'no_', 'nw_', 'ns_', 'nsl_', 'nslv_', 'nlg_', 'nprj_',
  'nmention_', 'nsearch_', 'ngscan_', 'ndesc_', 'nprop_', 'nact_',
  'nasset_', 'nassetid_', 'nafolder_',
  'nmodlist_', 'nmoddep_', 'nterrain_', 'nucmdh_', 'nsessaud_', 'nwebhook_',
  'nrcresult_', 'nexprres_', 'nqryres_', 'nplgerr_',
];

// ── IN-MEMORY STORES ──────────────────────────────────────────────────────────
const sessionStore = new Map<string, SessionEntry>();
const rateLimits   = new Map<string, RateBucket>();
const ipRateLimits = new Map<string, RateBucket>();
const burstLimits  = new Map<string, BurstBucket>();
const apiCache     = new Map<string, CacheEntry<unknown>>();
const dedupCache   = new Map<string, number>();

// ── JSON HELPERS ──────────────────────────────────────────────────────────────
function readJson<T = unknown>(filePath: string, fallback: T): T {
  try {
    if (existsSync(filePath)) return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch (_) {}
  return fallback;
}

function writeJson(filePath: string, data: unknown): boolean {
  try { writeFileSync(filePath, JSON.stringify(data)); return true; }
  catch (_) { return false; }
}

function cleanControlChars(text: string): string {
  if (typeof text !== 'string') return '';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out += (c >= 32 || c === 9 || c === 10 || c === 13) ? text[i] : ' ';
  }
  return out;
}

function robustJsonParse(raw: unknown): unknown {
  if (!raw || typeof raw !== 'string') return null;
  const s = cleanControlChars(raw.trim());
  if (!s) return null;
  try { return JSON.parse(s); } catch (_) {}
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch (_) {}
  try {
    return JSON.parse(
      s.replace(/,\s*([}\]])/g, '$1')
       .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:(?!:))/g, '$1"$2"$3')
    );
  } catch (_) {}
  try {
    return JSON.parse(
      s.replace(/,\s*([}\]])/g, '$1')
       .replace(/:\s*nil\b/g, ': null')
       .replace(/([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*=\s*)/g, '$1"$2": ')
       .replace(
         /([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:(?![=:>]))/g,
         (_match: string, p: string, k: string) => `${p}"${k}": `,
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
    while (i < len && text[i] !== '{') i++;
    if (i >= len) break;
    let depth = 0, inString = false, escape = false;
    const start = i;
    for (; i < len; i++) {
      const ch = text[i];
      if (escape)                  { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true;  continue; }
      if (ch === '"')              { inString = !inString; continue; }
      if (inString)                continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { results.push(text.slice(start, i + 1)); i++; break; }
      }
    }
    if (depth !== 0) i = start + 1;
  }
  return results;
}

function extractCommandsFromText(text: string): QueueCommand[] {
  if (!text || typeof text !== 'string') return [];
  const all: QueueCommand[] = [], seen = new Set<string>();

  function addCmd(cmd: unknown): void {
    if (!cmd || typeof cmd !== 'object' || !('action' in cmd)) return;
    const c = cmd as QueueCommand;
    c.action = String(c.action).toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!c.action) return;
    const key = JSON.stringify(c);
    if (!seen.has(key)) { seen.add(key); all.push(c); }
  }

  function processItem(item: unknown): void {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) { for (const sub of item) processItem(sub); return; }
    const obj = item as Record<string, unknown>;
    if (obj['action'] === 'batch_commands' && Array.isArray(obj['commands'])) {
      for (const sub of obj['commands']) { if ((sub as QueueCommand)?.action) addCmd(sub); }
    } else if (obj['actions'] && Array.isArray(obj['actions'])) {
      for (const sub of obj['actions']) { if ((sub as QueueCommand)?.action) addCmd(sub); }
    } else {
      addCmd(item);
    }
  }

  const codeBlockRe = /```(?:[a-zA-Z0-9]*\s*)?([\s\S]*?)```/g;
  const codeBlockRanges: [number, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = codeBlockRe.exec(text)) !== null) {
    const blockContent = m[1].trim();
    codeBlockRanges.push([m.index, m.index + m[0].length]);
    if (!blockContent) continue;
    const direct = robustJsonParse(blockContent);
    if (direct) { processItem(direct); continue; }
    for (const raw of findJsonObjects(blockContent)) {
      const parsed = robustJsonParse(raw);
      if (parsed) processItem(parsed);
    }
  }

  let textNoBraces = text;
  for (let r = codeBlockRanges.length - 1; r >= 0; r--) {
    const [start, end] = codeBlockRanges[r];
    textNoBraces = textNoBraces.slice(0, start) + ' '.repeat(end - start) + textNoBraces.slice(end);
  }

  for (const raw of findJsonObjects(textNoBraces)) {
    if (!/"action"\s*:/.test(raw)) continue;
    const parsed = robustJsonParse(raw);
    if (parsed) processItem(parsed);
  }
  return all;
}

// ── CACHE ─────────────────────────────────────────────────────────────────────
function cacheGet<T = unknown>(key: string): T | null {
  const entry = apiCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { apiCache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key: string, data: unknown, ttlMs: number): void {
  if (apiCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of apiCache) { if (now > v.expiresAt) apiCache.delete(k); }
    if (apiCache.size > 400) {
      let n = 0;
      for (const k of apiCache.keys()) { if (n++ >= 100) break; apiCache.delete(k); }
    }
  }
  apiCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function cacheClear(pattern: string | null): void {
  if (!pattern) { apiCache.clear(); return; }
  for (const k of apiCache.keys()) { if (k.includes(pattern)) apiCache.delete(k); }
}

(setInterval(() => {
  const now = Date.now();
  for (const [k, v] of apiCache)   { if (now > v.expiresAt)           apiCache.delete(k);  }
  for (const [k, v] of dedupCache) { if (now - v > DEDUP_WINDOW * 10) dedupCache.delete(k); }
}, 5 * 60_000) as ReturnType<typeof setInterval>).unref?.();

// ── SESSION MANAGEMENT ────────────────────────────────────────────────────────
function setSession(
  username: string,
  token:    string,
  placeId:  string | null,
  userId:   string | null,
): void {
  const u = san(username);
  const existing = sessionStore.get(u);
  sessionStore.set(u, {
    token:      String(token).substring(0, SESSION_TOKEN_MAX),
    placeId:    placeId ? sanStr(String(placeId), 30) : null,
    userId:     userId  ? sanStr(String(userId),  20) : null,
    createdAt:  existing?.createdAt ?? Date.now(),
    lastSeen:   Date.now(),
    reconnects: (existing?.reconnects ?? 0) + (existing ? 1 : 0),
    cmdCount:   existing?.cmdCount ?? 0,
  });
  appendSessionAudit(u, 'connect', { placeId, userId });
}

function getSession(username: string): SessionEntry | null {
  const u = san(username);
  const s = sessionStore.get(u);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL) {
    appendSessionAudit(u, 'expired', {});
    sessionStore.delete(u);
    return null;
  }
  s.lastSeen = Date.now();
  return s;
}

function touchSession(username: string): void {
  const s = sessionStore.get(san(username));
  if (s) { s.lastSeen = Date.now(); s.cmdCount = (s.cmdCount || 0) + 1; }
}

function getSessionStats(username: string): SessionStats | null {
  const s = getSession(san(username));
  if (!s) return null;
  return {
    hasSession: true,
    placeId:    s.placeId   ?? null,
    userId:     s.userId    ?? null,
    ageMs:      Date.now()  - s.createdAt,
    lastSeenMs: Date.now()  - s.lastSeen,
    reconnects: s.reconnects ?? 0,
    cmdCount:   s.cmdCount   ?? 0,
  };
}

function appendSessionAudit(username: string, event: string, data: Record<string, unknown>): void {
  try {
    const path = sessionAuditFile(username);
    let log = readJson<Record<string, unknown>[]>(path, []);
    log.unshift({ event, ...data, ts: Date.now() });
    if (log.length > 100) log = log.slice(0, 100);
    writeJson(path, log);
  } catch (_) {}
}

(setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessionStore) {
    if (now - v.createdAt > SESSION_TTL) {
      appendSessionAudit(k, 'expired', {});
      sessionStore.delete(k);
    }
  }
}, 30 * 60_000) as ReturnType<typeof setInterval>).unref?.();

// ── TOKEN VERIFICATION ────────────────────────────────────────────────────────
function verifyAdminToken(req: AdaptedRequest): boolean {
  const env = process.env.ADMIN_TOKEN ?? '';
  if (!env || env.length < MIN_ADMIN_TOKEN_LEN) return false;
  const candidate =
    ((req.headers?.['authorization'] as string | undefined) ?? '').replace(/^Bearer\s+/i, '').trim() ||
    ((req.headers?.['x-admin-token']  as string | undefined) ?? '').trim() ||
    (typeof req.query?.['token'] === 'string' ? (req.query['token'] as string).trim() : '');
  if (!candidate) return false;
  try {
    const padLen = Math.max(candidate.length, env.length, 32);
    const a = Buffer.alloc(padLen, 0);
    const b = Buffer.alloc(padLen, 0);
    Buffer.from(candidate).copy(a);
    Buffer.from(env).copy(b);
    return crypto.timingSafeEqual(a, b) && candidate === env;
  } catch (_) { return false; }
}

function verifyPluginHmac(req: AdaptedRequest, body: unknown): boolean {
  const secret = process.env.PLUGIN_HMAC_SECRET ?? '';
  if (!secret || secret.length < 16) return true;
  const sig = (
    ((req.headers?.['x-nexus-signature']  as string | undefined) ?? '') ||
    ((req.headers?.['x-roblox-signature'] as string | undefined) ?? '')
  ).trim();
  if (!sig) return true;
  try {
    const payload  = typeof body === 'string' ? body : JSON.stringify(body);
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const padLen   = Math.max(sig.length, expected.length, 32);
    const a = Buffer.alloc(padLen, 0);
    const b = Buffer.alloc(padLen, 0);
    Buffer.from(sig).copy(a);
    Buffer.from(expected).copy(b);
    return crypto.timingSafeEqual(a, b);
  } catch (_) { return false; }
}

function verifySessionToken(
  username:         string,
  candidateToken:   string,
  candidatePlaceId: string | null,
): string {
  if (!candidateToken) return 'missing';
  const s = getSession(username);
  if (!s) return 'no_session';
  try {
    const padLen = Math.max(String(candidateToken).length, s.token.length, 32);
    const a = Buffer.alloc(padLen, 0);
    const b = Buffer.alloc(padLen, 0);
    Buffer.from(String(candidateToken)).copy(a);
    Buffer.from(s.token).copy(b);
    if (!crypto.timingSafeEqual(a, b) || candidateToken !== s.token) return 'invalid';
  } catch (_) { return 'invalid'; }
  if (s.placeId && candidatePlaceId && String(candidatePlaceId) !== s.placeId)
    return 'place_mismatch';
  return 'ok';
}

// ── RATE LIMITING ─────────────────────────────────────────────────────────────
function checkRateLimit(user: string, max: number = RATE_USER_PER_MIN): boolean {
  const now = Date.now(), key = san(user);
  if (!rateLimits.has(key)) rateLimits.set(key, { count: 0, reset: now + 60_000 });
  const rl = rateLimits.get(key)!;
  if (now > rl.reset) { rl.count = 0; rl.reset = now + 60_000; }
  return ++rl.count <= max;
}

function checkIpRateLimit(ip: string): boolean {
  if (!ip) return true;
  const now = Date.now(), key = String(ip).substring(0, 45);
  if (!ipRateLimits.has(key)) ipRateLimits.set(key, { count: 0, reset: now + 60_000 });
  const rl = ipRateLimits.get(key)!;
  if (now > rl.reset) { rl.count = 0; rl.reset = now + 60_000; }
  return ++rl.count <= RATE_IP_PER_MIN;
}

function checkBurstLimit(user: string): boolean {
  const now = Date.now(), key = san(user);
  if (!burstLimits.has(key)) burstLimits.set(key, { count: 0, windowEnd: now + RATE_BURST_WINDOW });
  const bl = burstLimits.get(key)!;
  if (now > bl.windowEnd) { bl.count = 0; bl.windowEnd = now + RATE_BURST_WINDOW; }
  return ++bl.count <= RATE_BURST_COUNT;
}

function getClientIp(req: AdaptedRequest): string {
  return (
    ((req.headers?.['x-real-ip']      as string | undefined) ?? '') ||
    ((req.headers?.['x-forwarded-for'] as string | undefined) ?? '')
  ).toString().split(',')[0].trim();
}

(setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits)   { if (now > v.reset     + 60_000) rateLimits.delete(k);   }
  for (const [k, v] of ipRateLimits) { if (now > v.reset     + 60_000) ipRateLimits.delete(k); }
  for (const [k, v] of burstLimits)  { if (now > v.windowEnd + 60_000) burstLimits.delete(k);  }
}, 5 * 60_000) as ReturnType<typeof setInterval>).unref?.();

// ── DEDUPLICATION ─────────────────────────────────────────────────────────────
const DEDUP_ACTIONS = new Set<string>(['delete', 'play_test', 'clear_terrain']);

function isDuplicateCommand(cmd: QueueCommand): boolean {
  if (!DEDUP_ACTIONS.has(cmd?.action)) return false;
  const hash = crypto.createHash('md5')
    .update(JSON.stringify({
      action: cmd.action,
      name:   cmd.name,
      code:   (String(cmd.code ?? '')).substring(0, 100),
    }))
    .digest('hex');
  const last = dedupCache.get(hash);
  if (last && (Date.now() - last) < DEDUP_WINDOW) return true;
  dedupCache.set(hash, Date.now());
  return false;
}

// ── QUEUE MANAGEMENT ──────────────────────────────────────────────────────────
const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };

function getPriorityQueue(u: string): QueueCommand[]     { return readJson<QueueCommand[]>(priorityQFile(u), []); }
function savePriorityQueue(u: string, q: QueueCommand[]): void { writeJson(priorityQFile(u), q); }

function pushPriorityQueue(u: string, cmd: QueueCommand, priority: string = 'normal'): void {
  const q = getPriorityQueue(u);
  q.push({ ...cmd, _priority: priority, _ts: Date.now() });
  if (q.length > MAX_PRIORITY_QUEUE) q.splice(0, q.length - MAX_PRIORITY_QUEUE);
  q.sort((a, b) => {
    const pa = PRIORITY_ORDER[a._priority ?? 'normal'] ?? 2;
    const pb = PRIORITY_ORDER[b._priority ?? 'normal'] ?? 2;
    return pa !== pb ? pa - pb : (a._ts ?? 0) - (b._ts ?? 0);
  });
  savePriorityQueue(u, q);
}

function drainPriorityQueue(u: string): QueueCommand[] {
  const q = getPriorityQueue(u);
  if (q.length === 0) return [];
  savePriorityQueue(u, []);
  return q;
}

function getQueue(u: string): QueueCommand[]     { return readJson<QueueCommand[]>(queueFile(u), []); }
function saveQueue(u: string, q: QueueCommand[]): void { writeJson(queueFile(u), q); }

function clearQueue(u: string): void {
  saveQueue(u, []);
  savePriorityQueue(u, []);
}

function pushQueue(u: string, cmd: QueueCommand, priority: string = 'normal'): boolean {
  if (isDuplicateCommand(cmd)) return false;
  if (priority === 'critical' || priority === 'high') {
    pushPriorityQueue(u, cmd, priority);
    return true;
  }
  const now = Date.now();
  let q = getQueue(u).filter(c => (now - (c._ts ?? 0)) < QUEUE_MAX_AGE);
  q.push({ ...cmd, _ts: now });
  if (q.length > MAX_QUEUE_SIZE) q.splice(0, q.length - MAX_QUEUE_SIZE);
  saveQueue(u, q);
  return true;
}

function drainQueue(u: string): QueueCommand[] {
  const pq  = drainPriorityQueue(u);
  const now = Date.now();
  const nq  = getQueue(u).filter(c => (now - (c._ts ?? 0)) < QUEUE_MAX_AGE);
  clearQueue(u);
  return [...pq, ...nq];
}

// ── POLL / HEARTBEAT ──────────────────────────────────────────────────────────
function bumpPoll(u: string): void  { try { writeFileSync(pollFile(u), String(Date.now())); } catch (_) {} }
function lastPoll(u: string): number  { return parseInt(readJson<string>(pollFile(u), '0') ?? '0') || 0; }
function isOnline(u: string): boolean { return (Date.now() - lastPoll(u)) < 8_000; }

// ── LOGS & STATS ──────────────────────────────────────────────────────────────
function pushLog(entry: Record<string, unknown>): void {
  try {
    let l = readJson<Record<string, unknown>[]>(LOG_FILE, []);
    l.unshift({ ...entry, ts: Date.now() });
    if (l.length > MAX_LOG_ENTRIES) l = l.slice(0, MAX_LOG_ENTRIES);
    writeJson(LOG_FILE, l);
  } catch (_) {}
}

function pushHist(entry: Record<string, unknown>): void {
  try {
    let h = readJson<Record<string, unknown>[]>(HIST_FILE, []);
    h.unshift({ ...entry, ts: Date.now() });
    if (h.length > MAX_HIST_ENTRIES) h = h.slice(0, MAX_HIST_ENTRIES);
    writeJson(HIST_FILE, h);
  } catch (_) {}
}

function pushUserHistory(u: string, action: string, details: string): void {
  try {
    let h = readJson<Record<string, unknown>[]>(userHistFile(u), []);
    h.unshift({ action, details: sanStr(details || '', 100), ts: Date.now() });
    if (h.length > MAX_USER_HIST) h = h.slice(0, MAX_USER_HIST);
    writeJson(userHistFile(u), h);
  } catch (_) {}
}

function getUserHistory(u: string, limit: number = 50): Record<string, unknown>[] {
  return readJson<Record<string, unknown>[]>(userHistFile(u), [])
    .slice(0, sanInt(limit, 50, 1, MAX_USER_HIST));
}

function getGlobalStats(): GlobalStats {
  return readJson<GlobalStats>(STATS_FILE, {
    totalCommands: 0, totalUsers: 0, startedAt: Date.now(),
    userStats: {}, popularActions: {},
  });
}

function bumpStats(user: string, action: string): void {
  try {
    const s = getGlobalStats();
    s.totalCommands = (s.totalCommands || 0) + 1;
    s.userStats      = s.userStats      || {};
    s.popularActions = s.popularActions || {};
    if (!s.userStats[user]) {
      s.userStats[user] = { commands: 0, firstSeen: Date.now(), lastSeen: Date.now() };
      s.totalUsers = Object.keys(s.userStats).length;
    }
    const us = s.userStats[user];
    us.commands  = (us.commands || 0) + 1;
    us.lastSeen  = Date.now();
    us.lastAction = sanStr(action || 'unknown', 50);
    const act = sanStr(action || 'unknown', 50);
    s.popularActions[act] = (s.popularActions[act] || 0) + 1;
    writeJson(STATS_FILE, s);
  } catch (_) {}
}

// ── LOG SERVICE ───────────────────────────────────────────────────────────────
function saveLogSvc(u: string, logs: unknown[]): void {
  try {
    const existing = readJson<unknown[]>(logSvcFile(u), []);
    writeJson(logSvcFile(u), [...sanArr(logs, 100), ...existing].slice(0, MAX_LOGSVC_ENTRIES));
  } catch (_) {}
}

function getLogSvc(u: string): unknown[] { return readJson<unknown[]>(logSvcFile(u), []); }

// ── OUTPUT ────────────────────────────────────────────────────────────────────
function saveOutput(u: string, arr: unknown[]): void {
  writeJson(outFile(u), { outputs: sanArr(arr, 200), ts: Date.now() });
}
function getOutputData(u: string): Record<string, unknown> {
  return readJson<Record<string, unknown>>(outFile(u), { outputs: [] });
}

// ── DATA STORE HELPERS ────────────────────────────────────────────────────────
const withTs = <T extends Record<string, unknown>>(d: T): T & { _ts: number } =>
  ({ ...d, _ts: Date.now() });

const saveScriptContent = (u: string, d: Record<string, unknown>): boolean => writeJson(scriptFile(u),       withTs(d));
const getScriptContent  = (u: string): Record<string, unknown> | null       => readJson(scriptFile(u), null);
const saveScriptList    = (u: string, d: Record<string, unknown>): boolean  => writeJson(scriptListFile(u),   withTs(d));
const getScriptList     = (u: string): Record<string, unknown> | null       => readJson(scriptListFile(u), null);
const saveScriptLines   = (u: string, d: Record<string, unknown>): boolean  => writeJson(scriptLinesFile(u),  withTs(d));
const getScriptLines    = (u: string): Record<string, unknown> | null       => readJson(scriptLinesFile(u), null);
const saveSearch        = (u: string, d: Record<string, unknown>): boolean  => writeJson(searchFile(u),       withTs(d));
const getSearch         = (u: string): Record<string, unknown> | null       => readJson(searchFile(u), null);
const saveGameScan      = (u: string, d: Record<string, unknown>): boolean  => writeJson(gameScanFile(u),     withTs(d));
const getGameScan       = (u: string): Record<string, unknown> | null       => readJson(gameScanFile(u), null);
const saveDescendants   = (u: string, d: Record<string, unknown>): boolean  => writeJson(descendantsFile(u),  withTs(d));
const getDescendants    = (u: string): Record<string, unknown> | null       => readJson(descendantsFile(u), null);
const saveProperties    = (u: string, d: Record<string, unknown>): boolean  => writeJson(propertiesFile(u),   withTs(d));
const getProperties     = (u: string): Record<string, unknown> | null       => readJson(propertiesFile(u), null);
const saveActionList    = (u: string, d: Record<string, unknown>): boolean  => writeJson(actionListFile(u),   withTs(d));
const getActionList     = (u: string): Record<string, unknown> | null       => readJson(actionListFile(u), null);
const saveAssetLib      = (u: string, d: Record<string, unknown>): boolean  => writeJson(assetLibFile(u),     withTs(d));
const getAssetLib       = (u: string): Record<string, unknown> | null       => readJson(assetLibFile(u), null);
const saveAssetId       = (u: string, d: Record<string, unknown>): boolean  => writeJson(assetIdFile(u),      withTs(d));
const getAssetId        = (u: string): Record<string, unknown> | null       => readJson(assetIdFile(u), null);
const saveAssetFolder   = (u: string, d: Record<string, unknown>): boolean  => writeJson(assetFolderFile(u),  withTs(d));
const getAssetFolder    = (u: string): Record<string, unknown> | null       => readJson(assetFolderFile(u), null);
const saveModuleList    = (u: string, d: Record<string, unknown>): boolean  => writeJson(moduleListFile(u),   withTs(d));
const getModuleList     = (u: string): Record<string, unknown> | null       => readJson(moduleListFile(u), null);
const saveModuleDeploy  = (u: string, d: Record<string, unknown>): boolean  => writeJson(moduleDeployFile(u), withTs(d));
const getModuleDeploy   = (u: string): Record<string, unknown> | null       => readJson(moduleDeployFile(u), null);
const saveTerrainResult = (u: string, d: Record<string, unknown>): boolean  => writeJson(terrainFile(u),      withTs(d));
const getTerrainResult  = (u: string): Record<string, unknown> | null       => readJson(terrainFile(u), null);
const saveRunCodeResult = (u: string, d: Record<string, unknown>): boolean  => writeJson(runCodeResultFile(u), withTs(d));
const getRunCodeResult  = (u: string): Record<string, unknown> | null       => readJson(runCodeResultFile(u), null);
const saveExprResult    = (u: string, d: Record<string, unknown>): boolean  => writeJson(exprResultFile(u),    withTs(d));
const getExprResult     = (u: string): Record<string, unknown> | null       => readJson(exprResultFile(u), null);
const saveQueryResult   = (u: string, d: Record<string, unknown>): boolean  => writeJson(queryResultFile(u),   withTs(d));
const getQueryResult    = (u: string): Record<string, unknown> | null       => readJson(queryResultFile(u), null);

function savePluginError(u: string, d: Record<string, unknown>): void {
  let l = readJson<Record<string, unknown>[]>(pluginErrorFile(u), []);
  l.unshift(withTs(d));
  if (l.length > 200) l = l.slice(0, 200);
  writeJson(pluginErrorFile(u), l);
}
function getPluginErrors(u: string): Record<string, unknown>[] {
  return readJson<Record<string, unknown>[]>(pluginErrorFile(u), []);
}

function saveMention(u: string, d: Record<string, unknown>): void {
  let l = readJson<Record<string, unknown>[]>(mentionFile(u), []);
  l.unshift(withTs(d));
  if (l.length > MAX_MENTION_ENTRIES) l = l.slice(0, MAX_MENTION_ENTRIES);
  writeJson(mentionFile(u), l);
}
function getMentions(u: string): Record<string, unknown>[] {
  return readJson<Record<string, unknown>[]>(mentionFile(u), []);
}

function saveProject(u: string, d: Partial<ProjectData>): void {
  writeJson(projectFile(u), {
    projectId:   sanStr(d.projectId   || '', 100),
    projectName: sanStr(d.projectName || '', 100),
    placeId:     sanStr(d.placeId     || '', 50),
    updatedAt:   Date.now(),
  } satisfies ProjectData);
}

function getProject(u: string): ProjectData {
  return readJson<ProjectData>(projectFile(u), {
    projectId: '', projectName: '', placeId: '', updatedAt: 0,
  });
}

// ── WEBHOOK ───────────────────────────────────────────────────────────────────
function saveWebhook(u: string, url: string | null): void {
  if (!url) { try { unlinkSync(webhookFile(u)); } catch (_) {} return; }
  writeJson(webhookFile(u), { url: sanStr(String(url), 300), updatedAt: Date.now() } satisfies WebhookData);
}
function getWebhook(u: string): WebhookData | null {
  return readJson<WebhookData | null>(webhookFile(u), null);
}

async function dispatchWebhook(u: string, event: string, data: unknown): Promise<void> {
  const wh = getWebhook(u);
  if (!wh?.url?.startsWith('https://')) return;
  try {
    await safeFetch(wh.url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': `NexusAI/${WEB_VERSION}` },
      body:    JSON.stringify({ event, user: u, data, ts: Date.now() }),
    }, 5_000, 0);
  } catch (_) {}
}

// ── STALE FILE CLEANUP ────────────────────────────────────────────────────────
function cleanStaleFiles(maxAgeMs: number = 3 * 60 * 60 * 1_000): number {
  let count = 0;
  try {
    const now = Date.now();
    for (const fname of readdirSync(TMP)) {
      if (!FILE_PREFIXES.some(p => fname.startsWith(p))) continue;
      const path = `${TMP}/${fname}`;
      try {
        if (now - statSync(path).mtimeMs > maxAgeMs) { unlinkSync(path); count++; }
      } catch (_) {}
    }
  } catch (_) {}
  return count;
}

// ── SAFE FETCH ────────────────────────────────────────────────────────────────
async function safeFetch(
  url:        string,
  options:    RequestInit = {},
  timeoutMs:  number = 10_000,
  maxRetries: number = 2,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp  = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (resp.status === 429 && attempt < maxRetries) {
        const wait = Math.min(parseInt(resp.headers.get('Retry-After') || '2', 10) * 1_000, 5_000);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return resp;
    } catch (err) {
      lastError = err as Error;
      if ((err as Error)?.name === 'AbortError') break;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1_000 * (attempt + 1)));
    }
  }
  throw lastError ?? new Error('safeFetch: all retries failed');
}

// ── ROBLOX API ────────────────────────────────────────────────────────────────
function getRobloxApiKey(): string | null {
  const key = process.env.ROBLOX_OPEN_CLOUD_KEY || '';
  return key.length >= 20 ? key : null;
}

const VALID_TOOLBOX_TYPES = new Set<string>([
  'Model', 'Plugin', 'Audio', 'Decal', 'Image',
  'MeshPart', 'Package', 'Hat', 'Shirt', 'Pants', 'TShirt', 'Gear',
]);

async function robloxToolboxSearch(
  keyword:   string,
  assetType: string = 'Model',
  limit:     number = 10,
  cursor:    string | null = null,
): Promise<ToolboxResult> {
  const cacheKey = `toolbox:${keyword}:${assetType}:${limit}:${cursor || ''}`;
  const cached   = cacheGet<ToolboxResult>(cacheKey);
  if (cached) return cached;
  const apiKey = getRobloxApiKey();
  if (!apiKey) throw Object.assign(new Error('ROBLOX_OPEN_CLOUD_KEY not configured.'), { code: 503 });
  const safeType  = VALID_TOOLBOX_TYPES.has(assetType) ? assetType : 'Model';
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const params = new URLSearchParams({
    keyword: String(keyword).substring(0, 100), assetType: safeType, limit: String(safeLimit),
    ...(cursor ? { cursor } : {}),
  });
  let resp: Response;
  try {
    resp = await safeFetch(
      `https://apis.roblox.com/toolbox-service/v2/assets:search?${params}`,
      { method: 'GET', headers: { 'x-api-key': apiKey, Accept: 'application/json', 'User-Agent': `NexusAI/${WEB_VERSION}` } },
      12_000, 2,
    );
  } catch (err) {
    throw Object.assign(
      new Error(`Roblox Toolbox connection failed: ${(err as Error)?.message || 'timeout'}`),
      { code: 502 },
    );
  }
  if (resp.status === 401 || resp.status === 403)
    throw Object.assign(new Error('Invalid API key.'), { code: resp.status });
  if (resp.status === 429)
    throw Object.assign(new Error('Roblox Toolbox rate limit reached.'), { code: 429 });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw Object.assign(new Error(`Roblox Toolbox HTTP ${resp.status}: ${sanStr(body, 80)}`), { code: resp.status });
  }
  let data: Record<string, unknown>;
  try { data = await resp.json() as Record<string, unknown>; }
  catch (_) { throw Object.assign(new Error('Non-JSON response from Roblox Toolbox.'), { code: 502 }); }
  const rawItems = sanArr<Record<string, unknown>>(data['data'] || data['assets'] || data['results']);
  const assets: AssetItem[] = rawItems.map(item => ({
    assetId:     String(item['assetId'] || item['id'] || ''),
    name:        sanStr(item['name'] || item['assetName'] || 'Untitled', 120),
    description: sanStr(item['description'] || '', 250),
    assetType:   sanStr(item['assetType'] || safeType, 30),
    creator: {
      name:   sanStr((item['creator'] as Record<string,unknown>)?.['name'] || item['creatorName'] || 'Unknown', 80),
      type:   sanStr((item['creator'] as Record<string,unknown>)?.['type'] || 'User', 20),
      userId: String((item['creator'] as Record<string,unknown>)?.['userId'] || item['creatorTargetId'] || ''),
    },
    thumbnail: sanStr((item['thumbnail'] as Record<string,unknown>)?.['url'] || item['thumbnailUrl'] || '', 300),
    updated:   (item['updated'] || item['createdUtc'] || null) as string | null,
  })).filter(a => a.assetId);
  const result: ToolboxResult = {
    assets,
    nextCursor: (data['nextPageCursor'] as string | null) || null,
    total:      (data['totalCount'] as number) || assets.length,
  };
  cacheSet(cacheKey, result, TTL_TOOLBOX);
  return result;
}

const INSERTABLE_ASSET_TYPES = new Set<string>([
  'Model', 'Plugin', 'Package', 'Hat', 'Shirt', 'Pants',
  'TShirt', 'Gear', 'Animation', 'MeshPart', 'Unknown',
]);

function buildInsertScript(assetId: string | number, assetName: string): string {
  const safeName = sanStr(String(assetName || 'Asset'), 80)
    .replace(/[^a-zA-Z0-9 _\-]/g, '').trim() || 'Asset';
  return (
    `-- Auto-generated by Nexus AI ${WEB_VERSION}\n` +
    `local InsertService = game:GetService("InsertService")\n` +
    `local ok, result = pcall(function() return InsertService:LoadAsset(${assetId}) end)\n` +
    `if ok then\n` +
    `    result.Name = "${safeName}"\n` +
    `    result.Parent = workspace\n` +
    `    print("[NexusAI] Inserted: ${safeName} (${assetId})")\n` +
    `else\n` +
    `    warn("[NexusAI] Insert failed ${assetId}: " .. tostring(result))\n` +
    `end`
  );
}

async function validateAsset(assetId: unknown): Promise<AssetResult> {
  const id = parseInt(String(assetId).replace(/\D/g, ''), 10);
  if (!id || id <= 0 || id > 99_999_999_999)
    throw Object.assign(new Error(`Invalid asset ID: "${sanStr(String(assetId), 30)}"`), { code: 400 });
  const cacheKey = `asset:${id}`;
  const cached   = cacheGet<AssetResult>(cacheKey);
  if (cached) return cached;
  let assetData: Record<string, unknown> | null = null;
  for (const url of [
    `https://catalog.roblox.com/v1/catalog/items/${id}/details`,
    `https://economy.roblox.com/v2/assets/${id}/details`,
  ]) {
    try {
      const r = await safeFetch(url, { headers: { Accept: 'application/json' } }, 8_000, 1);
      if (r.ok) { assetData = await r.json() as Record<string, unknown>; break; }
    } catch (_) {}
  }
  if (!assetData) {
    try {
      const r = await safeFetch(
        `https://assetdelivery.roblox.com/v1/asset/?id=${id}`,
        { headers: { Accept: 'application/json' } }, 8_000, 1,
      );
      if (r.ok || r.status === 302)
        assetData = { name: `Asset #${id}`, assetType: 'Model', creator: {} };
    } catch (_) {}
  }
  if (!assetData) {
    const result: AssetResult = {
      valid: true, assetId: String(id), name: `Asset #${id}`,
      assetType: 'Unknown', creator: { name: 'Unknown', type: 'User', userId: '' },
      isPublic: true, unverified: true, insertable: true,
      insertScript: buildInsertScript(id, `Asset #${id}`),
    };
    cacheSet(cacheKey, result, TTL_ASSET / 4);
    return result;
  }
  const rawType   = sanStr(String(assetData['assetType'] || assetData['itemType'] || 'Model'), 30);
  const assetName = sanStr(String(assetData['name'] || `Asset #${id}`), 120);
  const isPublic  = !(assetData['sales'] === 0 && assetData['isForSale'] === false);
  const creator   = sanObj(assetData['creator']);
  const result: AssetResult = {
    valid: true, assetId: String(id), name: assetName,
    description: sanStr(String(assetData['description'] || ''), 250), assetType: rawType,
    creator: {
      name:   sanStr(String(creator['name']            || 'Unknown'), 80),
      type:   sanStr(String(creator['creatorType']     || 'User'),    20),
      userId: String(creator['creatorTargetId'] || ''),
    },
    isPublic, insertable: INSERTABLE_ASSET_TYPES.has(rawType),
    insertScript: buildInsertScript(id, assetName),
  };
  cacheSet(cacheKey, result, TTL_ASSET);
  return result;
}

async function fetchUserInfo(userId: number): Promise<UserInfo> {
  const id = parseInt(String(userId).replace(/\D/g, ''), 10);
  if (!id || id <= 0) throw new Error('Invalid userId.');
  const cacheKey = `userinfo:${id}`;
  const cached   = cacheGet<UserInfo>(cacheKey);
  if (cached) return cached;
  const resp = await safeFetch(
    `https://users.roblox.com/v1/users/${id}`,
    { headers: { Accept: 'application/json' } }, 8_000, 1,
  );
  if (!resp.ok) throw new Error(`Roblox Users API error: HTTP ${resp.status}`);
  const d = await resp.json() as Record<string, unknown>;
  const result: UserInfo = {
    userId: id,
    username:    sanStr(String(d['name'] || ''), 80),
    displayName: sanStr(String(d['displayName'] || d['name'] || ''), 80),
    description: sanStr(String(d['description'] || ''), 300),
    isBanned:    Boolean(d['isBanned']),
    created:     (d['created'] as string | null) || null,
    avatarUrl:   `https://www.roblox.com/headshot-thumbnail/image?userId=${id}&width=150&height=150&format=png`,
  };
  cacheSet(cacheKey, result, TTL_USER_INFO);
  return result;
}

async function fetchGameInfo(id: number, isPlaceId: boolean = false): Promise<GameInfo> {
  const parsed = parseInt(String(id).replace(/\D/g, ''), 10);
  if (!parsed || parsed <= 0) throw new Error('Invalid universeId / placeId.');
  const cacheKey = `gameinfo:${parsed}:${isPlaceId}`;
  const cached   = cacheGet<GameInfo>(cacheKey);
  if (cached) return cached;
  let universeId = parsed;
  if (isPlaceId) {
    try {
      const r = await safeFetch(
        `https://apis.roblox.com/universes/v1/places/${parsed}/universe`,
        { headers: { Accept: 'application/json' } }, 8_000, 1,
      );
      if (r.ok) {
        const j = await r.json() as Record<string, unknown>;
        universeId = (j['universeId'] as number) || parsed;
      }
    } catch (_) {}
  }
  const resp = await safeFetch(
    `https://games.roblox.com/v1/games?universeIds=${universeId}`,
    { headers: { Accept: 'application/json' } }, 8_000, 1,
  );
  if (!resp.ok) throw new Error(`Roblox Games API error: HTTP ${resp.status}`);
  const d    = await resp.json() as { data?: Record<string, unknown>[] };
  const game = (d.data ?? [])[0];
  if (!game) throw new Error('Game not found.');
  const gameCreator = sanObj(game['creator']);
  const result: GameInfo = {
    universeId, placeId: (game['rootPlaceId'] as number) || parsed,
    name:        sanStr(String(game['name'] || ''), 120),
    description: sanStr(String(game['description'] || ''), 500),
    creator: {
      name: sanStr(String(gameCreator['name'] || ''), 80),
      type: sanStr(String(gameCreator['type'] || 'User'), 20),
    },
    playing:        (game['playing'] as number)        || 0,
    visits:         (game['visits'] as number)         || 0,
    maxPlayers:     (game['maxPlayers'] as number)     || 0,
    favoritedCount: (game['favoritedCount'] as number) || 0,
    genre:          sanStr(String(game['genre'] || ''), 30),
    thumbnailUrl:   `https://www.roblox.com/asset-thumbnail/image?assetId=${game['rootPlaceId'] || parsed}&width=768&height=432&format=png`,
  };
  cacheSet(cacheKey, result, TTL_GAME_INFO);
  return result;
}

async function searchDocs(query: string, docType: string = 'all', limit: number = 5): Promise<DocsResult> {
  const q      = sanStr(query, 150).trim();
  const maxRes = Math.min(Math.max(1, limit), 20);
  if (!q) throw new Error('Query cannot be empty.');
  const cacheKey = `docs:${q}:${docType}:${limit}`;
  const cached   = cacheGet<DocsResult>(cacheKey);
  if (cached) return cached;
  try {
    const params = new URLSearchParams({
      query: q, type: docType === 'all' ? '' : docType,
      limit: String(maxRes), locale: 'en-us',
    });
    const resp = await safeFetch(
      `https://create.roblox.com/api/search/docs?${params}`,
      { headers: { Accept: 'application/json', 'User-Agent': `NexusAI/${WEB_VERSION}` } }, 8_000, 1,
    );
    if (resp.ok) {
      const data = await resp.json() as Record<string, unknown>;
      const raw  = sanArr<Record<string, unknown>>(data['results'] || data['data']);
      if (raw.length > 0) {
        const result: DocsResult = {
          results: raw.slice(0, maxRes).map(r => ({
            title:    sanStr(String(r['title']    || r['name']        || 'No Title'), 120),
            url:      sanStr(String(r['url']      || r['path']        || ''),         300),
            snippet:  sanStr(String(r['snippet']  || r['excerpt']     || r['description'] || ''), 300),
            category: sanStr(String(r['category'] || r['type']        || 'docs'),     50),
          })),
          source: 'roblox_creator_docs', query: q,
        };
        cacheSet(cacheKey, result, 10 * 60_000);
        return result;
      }
    }
  } catch (_) {}
  const index  = getLocalDocsIndex();
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = index
    .map(entry => {
      let score = 0;
      const haystack = `${entry.title} ${entry.keywords}`.toLowerCase();
      for (const t of tokens) {
        if (haystack.includes(t))                    score += t.length;
        if (entry.title.toLowerCase().startsWith(t)) score += 10;
        if (entry.title.toLowerCase() === t)         score += 20;
      }
      return { ...entry, score };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRes);
  if (scored.length === 0) {
    return {
      results: [{
        title: 'Roblox Creator Documentation',
        url: 'https://create.roblox.com/docs',
        snippet: `No results found for "${q}".`,
        category: 'fallback',
      }],
      source: 'local_fallback', query: q,
    };
  }
  const result: DocsResult = {
    results: scored.map(({ score: _s, keywords: _k, ...rest }) => rest),
    source: 'local_index', query: q,
  };
  cacheSet(cacheKey, result, 60 * 60_000);
  return result;
}

function getLocalDocsIndex(): DocEntry[] {
  return [
    { title: 'Instance',             url: 'https://create.roblox.com/docs/reference/engine/classes/Instance',           snippet: 'Base class. FindFirstChild, WaitForChild, Destroy, Clone.',              category: 'api',   keywords: 'instance findfirstchild waitforchild destroy clone parent classname isa' },
    { title: 'Workspace',            url: 'https://create.roblox.com/docs/reference/engine/classes/Workspace',           snippet: 'Primary 3D container. Gravity, CurrentCamera.',                         category: 'api',   keywords: 'workspace gravity camera service 3d world' },
    { title: 'BasePart / Part',      url: 'https://create.roblox.com/docs/reference/engine/classes/BasePart',            snippet: 'Physical part. Size, Position, CFrame, Anchored, Material.',            category: 'api',   keywords: 'part size position cframe anchored material transparency mesh union' },
    { title: 'CFrame',               url: 'https://create.roblox.com/docs/reference/engine/datatypes/CFrame',            snippet: 'Position + rotation matrix. CFrame.new(x,y,z), Angles, lookAt.',        category: 'api',   keywords: 'cframe position rotation matrix lookvector angles lookat' },
    { title: 'Vector3',              url: 'https://create.roblox.com/docs/reference/engine/datatypes/Vector3',           snippet: 'Vector3.new(x,y,z). Magnitude, Unit, Lerp, Dot, Cross.',                category: 'api',   keywords: 'vector3 xyz magnitude unit lerp dot cross' },
    { title: 'Color3',               url: 'https://create.roblox.com/docs/reference/engine/datatypes/Color3',            snippet: 'Color3.fromRGB(r,g,b). Values 0-1.',                                    category: 'api',   keywords: 'color3 rgb fromrgb fromhsv colour' },
    { title: 'UDim2',                url: 'https://create.roblox.com/docs/reference/engine/datatypes/UDim2',             snippet: 'GUI size/position. UDim2.new(scaleX, offsetX, scaleY, offsetY).',       category: 'api',   keywords: 'udim2 gui size position scale offset ui frame' },
    { title: 'Script / LocalScript', url: 'https://create.roblox.com/docs/reference/engine/classes/Script',              snippet: 'Script: server. LocalScript: client. ModuleScript: shared.',            category: 'api',   keywords: 'script localscript modulescript server client require enabled source' },
    { title: 'RemoteEvent',          url: 'https://create.roblox.com/docs/reference/engine/classes/RemoteEvent',         snippet: 'FireServer, FireClient, FireAllClients, OnServerEvent, OnClientEvent.', category: 'api',   keywords: 'remoteevent onserverevent onclientevent fireserver fireclient' },
    { title: 'Players',              url: 'https://create.roblox.com/docs/reference/engine/classes/Players',             snippet: 'PlayerAdded, PlayerRemoving, GetPlayers, LocalPlayer.',                 category: 'api',   keywords: 'players playeradded playerremoving getplayers localplayer character' },
    { title: 'DataStoreService',     url: 'https://create.roblox.com/docs/reference/engine/classes/DataStoreService',    snippet: 'GetAsync, SetAsync, UpdateAsync. Always wrap with pcall.',              category: 'api',   keywords: 'datastore getasync setasync updateasync save load persistent' },
    { title: 'TweenService',         url: 'https://create.roblox.com/docs/reference/engine/classes/TweenService',        snippet: 'Create(instance, TweenInfo, goals). Play, Pause, Cancel.',              category: 'api',   keywords: 'tweenservice tween animation tweeninfo play pause cancel easing' },
    { title: 'RunService',           url: 'https://create.roblox.com/docs/reference/engine/classes/RunService',          snippet: 'Heartbeat, RenderStepped, Stepped. IsServer, IsClient.',                category: 'api',   keywords: 'runservice heartbeat renderstepped stepped loop isserver isclient' },
    { title: 'UserInputService',     url: 'https://create.roblox.com/docs/reference/engine/classes/UserInputService',    snippet: 'InputBegan, InputEnded, IsKeyDown. LocalScript only.',                  category: 'api',   keywords: 'userinputservice input keyboard mouse touch inputbegan keycode' },
    { title: 'InsertService',        url: 'https://create.roblox.com/docs/reference/engine/classes/InsertService',       snippet: 'LoadAsset(assetId). Asset must be public. Always pcall.',               category: 'api',   keywords: 'insertservice loadasset asset insert model pcall public' },
    { title: 'HttpService',          url: 'https://create.roblox.com/docs/reference/engine/classes/HttpService',         snippet: 'GetAsync, PostAsync, JSONEncode, JSONDecode.',                          category: 'api',   keywords: 'httpservice getasync postasync http json encode decode api webhook' },
    { title: 'ReplicatedStorage',    url: 'https://create.roblox.com/docs/reference/engine/classes/ReplicatedStorage',   snippet: 'Accessible by server and client. ServerStorage: server only.',          category: 'api',   keywords: 'replicatedstorage serverstorage storage replicate module asset' },
    { title: 'task Library',         url: 'https://create.roblox.com/docs/reference/engine/libraries/task',              snippet: 'task.wait, task.spawn, task.delay. Preferred over wait().',             category: 'guide', keywords: 'task wait spawn delay cancel coroutine thread async timing yield' },
    { title: 'Humanoid',             url: 'https://create.roblox.com/docs/reference/engine/classes/Humanoid',            snippet: 'Health, WalkSpeed. TakeDamage, MoveTo, LoadAnimation.',                 category: 'api',   keywords: 'humanoid health walkspeed jumpower takedamage moveto loadanimation npc' },
    { title: 'Terrain',              url: 'https://create.roblox.com/docs/reference/engine/classes/Terrain',             snippet: 'FillBlock, FillBall, FillCylinder. ReplaceMaterial.',                  category: 'api',   keywords: 'terrain fillblock fillball fillcylinder material grass water rock' },
    { title: 'Lighting',             url: 'https://create.roblox.com/docs/reference/engine/classes/Lighting',            snippet: 'Ambient, Brightness, ClockTime, FogEnd. Sky, Atmosphere.',             category: 'api',   keywords: 'lighting ambient brightness clock fog sky atmosphere bloom' },
    { title: 'PathfindingService',   url: 'https://create.roblox.com/docs/reference/engine/classes/PathfindingService',  snippet: 'CreatePath, ComputeAsync, GetWaypoints.',                               category: 'api',   keywords: 'pathfinding npc navigation ai moveto waypoints compute agent' },
    { title: 'MarketplaceService',   url: 'https://create.roblox.com/docs/reference/engine/classes/MarketplaceService',  snippet: 'PromptProductPurchase, UserOwnsGamePassAsync, GetProductInfo.',         category: 'api',   keywords: 'marketplaceservice purchase gamepass product prompt shop store' },
    { title: 'Enum Reference',       url: 'https://create.roblox.com/docs/reference/engine/enums',                       snippet: 'Enum.Material, Enum.KeyCode, Enum.Font, Enum.SortOrder.',              category: 'api',   keywords: 'enum material keycode font sortorder alignment direction' },
    { title: 'Attributes API',       url: 'https://create.roblox.com/docs/scripting/attributes',                         snippet: 'SetAttribute, GetAttribute, GetAttributes, AttributeChanged.',         category: 'api',   keywords: 'attribute setattribute getattribute getattributes changed' },
    { title: 'ProximityPrompt',      url: 'https://create.roblox.com/docs/reference/engine/classes/ProximityPrompt',     snippet: 'ActionText, HoldDuration, MaxActivationDistance. Triggered event.',    category: 'api',   keywords: 'proximityprompt interact trigger hold distance action text' },
    { title: 'Remote Events Security', url: 'https://create.roblox.com/docs/scripting/events/remote',                   snippet: 'Always validate on the server. Never trust client data.',               category: 'guide', keywords: 'remote event security validate server client trust exploit' },
    { title: 'DataStore Best Practices', url: 'https://create.roblox.com/docs/cloud/open-cloud/data-store-api-handling', snippet: 'Always pcall. UpdateAsync safer than SetAsync. Retry with backoff.',   category: 'guide', keywords: 'datastore best practice updateasync retry session lock save' },
  ];
}

// ── AUTHORISATION ─────────────────────────────────────────────────────────────
function authorizeCommand(
  req:         AdaptedRequest,
  senderUser:  string,
  targetUser:  string,
  action:      string | null,
): AuthResult {
  const isAdmin = verifyAdminToken(req);
  if (isAdmin) return { ok: true };
  if (senderUser !== targetUser)
    return { ok: false, status: 403, error: 'Forbidden: you may only target your own session.' };
  if (action && getAdminActions().has(action))
    return { ok: false, status: 403, error: `"${escapeHtml(action, 60)}" requires an admin token.` };
  const candidate =
    ((req.headers?.['x-session-token'] as string | undefined) ?? '').trim() ||
    (req.body?._session_token ? String(req.body._session_token).trim() : '');
  if (!candidate) return { ok: true };
  const placeId = req.body?._place_id ? sanStr(String(req.body._place_id), 30) : null;
  const result  = verifySessionToken(targetUser, candidate, placeId);
  switch (result) {
    case 'ok':             return { ok: true };
    case 'no_session':     return { ok: true };
    case 'place_mismatch': return { ok: false, status: 403, error: 'PlaceId mismatch.' };
    default:               return { ok: false, status: 401, error: 'Invalid session token.' };
  }
}

function filterBatch(commands: unknown[], isAdmin: boolean): FilterResult {
  if (isAdmin) return { safe: sanArr<QueueCommand>(commands, 200), removed: [] };
  const adminActions = getAdminActions();
  const safe: QueueCommand[] = [], removed: string[] = [];
  for (const cmd of sanArr<QueueCommand>(commands, 200)) {
    if (adminActions.has(cmd?.action)) removed.push(sanStr(cmd.action, 50));
    else safe.push(cmd);
  }
  return { safe, removed };
}

// ── SECURITY HEADERS ──────────────────────────────────────────────────────────
function setSecurityHeaders(req: AdaptedRequest, res: AdaptedResponse): void {
  const origin = ((req.headers?.['origin'] as string | undefined) ?? '').trim();
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.has(origin) ? origin : 'null');
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods',  'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Token, X-Session-Token, ' +
    'X-Nexus-Nonce, X-Nexus-Signature, X-Roblox-Signature, X-Api-Key');
  res.setHeader('Access-Control-Max-Age',  '86400');
  res.setHeader('X-Content-Type-Options',  'nosniff');
  res.setHeader('X-Frame-Options',         'DENY');
  res.setHeader('X-XSS-Protection',        '1; mode=block');
  res.setHeader('Referrer-Policy',         'strict-origin-when-cross-origin');
  res.setHeader('X-Nexus-Version',         WEB_VERSION);
  res.setHeader('X-Api-Version',           API_VERSION);
}

// ── RESPONSE HELPERS ──────────────────────────────────────────────────────────
function sendError(
  res:   AdaptedResponse,
  code:  number,
  error: string,
  extra: Record<string, unknown> = {},
): AdaptedResponse {
  const statusCode = (typeof code === 'number' && code >= 400 && code < 600) ? code : 500;
  return res.status(statusCode).json({
    ok: false, status: 'error', error,
    web_version: WEB_VERSION, api_version: API_VERSION, ts: Date.now(), ...extra,
  });
}

function sendRateLimit(res: AdaptedResponse, retryAfter: number = 60): AdaptedResponse {
  return res.status(429).json({
    ok: false, status: 'error', error: 'Rate limit exceeded.',
    retryAfter, ts: Date.now(),
  });
}

// ── VERSION PAYLOAD ───────────────────────────────────────────────────────────
function versionPayload(): Record<string, unknown> {
  return {
    ok:                      true,
    required_plugin_version: REQUIRED_PLUGIN_VERSION,
    web_version:             WEB_VERSION,
    api_version:             API_VERSION,
    update_url:              'https://discord.gg/FzAF48mvK5',
    changelog:               `v14.1 — Fixed HTTP 200 red-X bug, checkVersion, English comments, admin actions enforced.`,
    security_model: {
      session_token:   'Plugin generates token on connect',
      self_only:       'Non-admin can only target own session',
      ip_rate_limit:   `${RATE_IP_PER_MIN}/min per IP`,
      user_rate_limit: `${RATE_USER_PER_MIN}/min per user`,
      burst_limit:     `${RATE_BURST_COUNT} cmds per ${RATE_BURST_WINDOW}ms`,
      hmac:            'Optional X-Nexus-Signature HMAC-SHA256',
      cors:            'Strict origin whitelist (browser) / open for Roblox plugin',
      dedup:           `${DEDUP_WINDOW}ms window for destructive actions`,
    },
  };
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export default async function handler(req: AdaptedRequest, res: AdaptedResponse): Promise<AdaptedResponse | void> {
  try {
    setSecurityHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method === 'GET')     return await handleGet(req, res);
    if (req.method === 'POST')    return await handlePost(req, res);
    return sendError(res, 405, 'Method not allowed.', { allowed: ['GET', 'POST', 'OPTIONS'] });
  } catch (err) {
    console.error('[NEXUS v14.1] Unhandled error:', (err as Error)?.message ?? err);
    try {
      return res.status(500).json({
        ok: false, status: 'error', error: 'Internal server error.',
        message: sanStr(String((err as Error)?.message ?? 'Unknown'), 200),
        web_version: WEB_VERSION, ts: Date.now(),
      });
    } catch (_) {}
  }
}

// ── GET HANDLER ───────────────────────────────────────────────────────────────
async function handleGet(req: AdaptedRequest, res: AdaptedResponse): Promise<AdaptedResponse> {
  const q = (req.query ?? {}) as Record<string, unknown>;

  if (q['version'] === '1' || Object.keys(q).length === 0) {
    return res.status(200).json(versionPayload());
  }

  if (q['health'] === '1') {
    const s    = getGlobalStats();
    const upMs = Date.now() - (s.startedAt || Date.now());
    return res.status(200).json({
      ok:                      true,
      status:                  'healthy',
      web_version:             WEB_VERSION,
      api_version:             API_VERSION,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      uptime:                  upMs,
      uptimeHuman:             `${Math.floor(upMs / 3_600_000)}h ${Math.floor((upMs % 3_600_000) / 60_000)}m`,
      totalCommands:           s.totalCommands  || 0,
      totalUsers:              s.totalUsers     || 0,
      activeSessions:          sessionStore.size,
      cacheSize:               apiCache.size,
      ts:                      Date.now(),
    });
  }

  if (q['userinfo'] === '1') {
    const uid = parseInt(String(q['userId'] || '0'), 10);
    if (!uid || uid <= 0 || uid > 9_999_999_999) return sendError(res, 400, 'Invalid userId.');
    try {
      const info = await fetchUserInfo(uid);
      return res.status(200).json({ ok: true, ...info });
    } catch (e) {
      return sendError(res, 502, sanStr((e as Error)?.message || 'Failed to fetch user info.', 100));
    }
  }

  if (q['gameinfo'] === '1') {
    const id = parseInt(String(q['id'] || '0'), 10);
    if (!id) return sendError(res, 400, 'Parameter "id" is required.');
    try {
      const info = await fetchGameInfo(id, q['type'] === 'place');
      return res.status(200).json({ ok: true, ...info });
    } catch (e) {
      return sendError(res, 502, sanStr((e as Error)?.message || 'Failed to fetch game info.', 100));
    }
  }

  if (q['check'] != null) {
    const u    = san(q['user'] || '');
    const s    = getGlobalStats();
    const sess = getSession(u);
    const qLen = getQueue(u).length + getPriorityQueue(u).length;
    return res.status(200).json({
      ok:                      true,
      connected:               isOnline(u),
      _pluginConnected:        isOnline(u),
      online:                  isOnline(u),
      user:                    u,
      queueLength:             qLen,
      sessionStats:            getSessionStats(u),
      hasSession:              !!sess,
      placeId:                 sess?.placeId ?? null,
      userId:                  sess?.userId  ?? null,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      web_version:             WEB_VERSION,
      currentProject:          getProject(u),
      globalStats:             { totalCommands: s.totalCommands || 0, totalUsers: s.totalUsers || 0 },
    });
  }

  if (q['clear_cache'] != null) {
    if (!verifyAdminToken(req)) return sendError(res, 401, 'Admin token required.');
    cacheClear((q['pattern'] as string | null) ?? null);
    return res.status(200).json({
      ok: true, message: 'Cache cleared.',
      pattern: q['pattern'] ?? null, ts: Date.now(),
    });
  }

  if (q['cleanup'] === '1') {
    if (!verifyAdminToken(req)) return sendError(res, 401, 'Admin token required.');
    const maxAge = sanInt(q['max_age'], 3 * 3600, 60, 86400) * 1_000;
    return res.status(200).json({ ok: true, cleaned: cleanStaleFiles(maxAge), ts: Date.now() });
  }

  const u = san(q['user'] || '');

  if (q['get_webhook'] != null) {
    const wh = getWebhook(u);
    return res.status(200).json({
      ok: true,
      webhook: wh ? { url: wh.url, updatedAt: wh.updatedAt } : null,
      user: u,
    });
  }

  // ── Data getters (plugin → web) — theme getters removed ──────────────────
  const dataGetters: Record<string, () => Record<string, unknown> | null> = {
    get_project:        () => ({ ok: true, ...getProject(u) }),
    get_output:         () => ({ ok: true, ...getOutputData(u) }),
    get_workspace:      () => getGameScan(u) ?? readJson(wsFile(u), null),
    get_script:         () => getScriptContent(u),
    get_script_list:    () => getScriptList(u),
    get_script_lines:   () => getScriptLines(u),
    get_search:         () => getSearch(u),
    get_game_scan:      () => getGameScan(u),
    get_descendants:    () => getDescendants(u),
    get_properties:     () => getProperties(u),
    get_action_list:    () => getActionList(u),
    get_asset_lib:      () => getAssetLib(u),
    get_asset_id:       () => getAssetId(u),
    get_asset_folder:   () => getAssetFolder(u),
    get_module_list:    () => getModuleList(u),
    get_module_deploy:  () => getModuleDeploy(u),
    get_terrain:        () => getTerrainResult(u),
    get_runcode_result: () => getRunCodeResult(u),
    get_expr_result:    () => getExprResult(u),
    get_query_result:   () => getQueryResult(u),
    get_plugin_errors:  () => ({ errors: getPluginErrors(u), count: getPluginErrors(u).length }),
  };

  for (const [param, fn] of Object.entries(dataGetters)) {
    if (q[param] != null) {
      const d = fn();
      if (!d) return sendError(res, 404, `No data available for "${param}".`);
      return res.status(200).json({ ok: true, ...d });
    }
  }

  if (q['get_mentions'] != null) {
    const m = getMentions(u);
    return res.status(200).json({ ok: true, mentions: m, count: m.length });
  }

  if (q['get_cmd_history'] != null) {
    const limit = sanInt(q['limit'], 50, 1, MAX_USER_HIST);
    return res.status(200).json({ ok: true, history: getUserHistory(u, limit), user: u });
  }

  if (q['queue_stats'] != null) {
    const nq = getQueue(u), pq = getPriorityQueue(u);
    return res.status(200).json({
      ok: true, user: u, normalQueue: nq.length, priorityQueue: pq.length,
      total: nq.length + pq.length,
      oldestMs: nq[0]?._ts ? Date.now() - (nq[0]._ts as number) : null,
      pluginOnline: isOnline(u),
    });
  }

  if (q['get_logsvc'] != null) {
    let logs  = getLogSvc(u) as Record<string, unknown>[];
    const since = sanInt(q['since'], 0, 0, Number.MAX_SAFE_INTEGER);
    if (since) logs = logs.filter(l => ((l['ts'] as number) || 0) > since);
    if (q['level']) logs = logs.filter(l => l['level'] === q['level'] || l['type'] === q['level']);
    return res.status(200).json({ ok: true, logs, count: logs.length });
  }

  if (q['get_logs'] != null) {
    if (!verifyAdminToken(req)) return sendError(res, 401, 'Admin token required.');
    let logs = readJson<Record<string, unknown>[]>(LOG_FILE, []);
    if (q['filter_user']) logs = logs.filter(l => l['user'] === san(q['filter_user']) || l['target'] === san(q['filter_user']));
    const limit = sanInt(q['limit'], 100, 1, MAX_LOG_ENTRIES);
    return res.status(200).json({ ok: true, logs: logs.slice(0, limit), count: logs.length });
  }

  if (q['get_history'] != null) {
    if (!verifyAdminToken(req)) return sendError(res, 401, 'Admin token required.');
    const hist  = readJson<Record<string, unknown>[]>(HIST_FILE, []);
    const limit = sanInt(q['limit'], 50, 1, MAX_HIST_ENTRIES);
    return res.status(200).json({ ok: true, history: hist.slice(0, limit), count: hist.length });
  }

  if (q['get_stats'] != null) {
    const s = getGlobalStats();
    return res.status(200).json({
      ok: true, totalCommands: s.totalCommands || 0, totalUsers: s.totalUsers || 0,
      startedAt: s.startedAt || 0, uptime: Date.now() - (s.startedAt || Date.now()),
      activeSessions: sessionStore.size,
      popularActions: Object.entries(s.popularActions || {})
        .sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 20)
        .reduce<Record<string, number>>((acc, [k, v]) => { acc[k] = v as number; return acc; }, {}),
    });
  }

  if (q['clear_queue'] != null) {
    if (!verifyAdminToken(req)) return sendError(res, 401, 'Admin token required.');
    if (!u) return sendError(res, 400, '"user" parameter is required.');
    clearQueue(u);
    return res.status(200).json({ ok: true, message: 'Queue cleared.', user: u });
  }

  // ── Plugin Poll ───────────────────────────────────────────────────────────
  if (!u) return sendError(res, 400, '"user" parameter is required.');

  if (q['session_token']) {
    const token   = sanStr(String(q['session_token']), SESSION_TOKEN_MAX).trim();
    const placeId = q['place_id'] ? sanStr(String(q['place_id']), 30) : null;
    const userId  = q['user_id']  ? sanStr(String(q['user_id']),  20) : null;
    if (token.length >= 16) setSession(u, token, placeId, userId);
  } else {
    touchSession(u);
  }

  bumpPoll(u);
  const queue = drainQueue(u);
  const proj  = getProject(u);

  return res.status(200).json({
    ok:                      true,
    status:                  'ok',
    queue,
    count:                   queue.length,
    priorityCount:           queue.filter(c => c._priority === 'critical' || c._priority === 'high').length,
    required_plugin_version: REQUIRED_PLUGIN_VERSION,
    web_version:             WEB_VERSION,
    api_version:             API_VERSION,
    currentProject:          proj,
    projectId:               proj.projectId   || '',
    projectName:             proj.projectName || '',
    placeId:                 proj.placeId     || '',
    ts:                      Date.now(),
  });
}

// ── POST HANDLER ──────────────────────────────────────────────────────────────
async function handlePost(req: AdaptedRequest, res: AdaptedResponse): Promise<AdaptedResponse> {
  const body    = (req.body ?? {}) as Record<string, unknown>;
  const ip      = getClientIp(req);
  const ratUser = san(body['_user'] || body['user'] || 'anon');

  if (!checkIpRateLimit(ip))     return sendRateLimit(res, 60);
  if (!checkRateLimit(ratUser))  return sendRateLimit(res, 60);
  if (!checkBurstLimit(ratUser)) return sendRateLimit(res,  5);
  if (!verifyPluginHmac(req, body))
    return sendError(res, 401, 'Invalid HMAC signature.', { hint: 'Check PLUGIN_HMAC_SECRET.' });

  const rawAction    = sanStr(String(body['action'] || body['type'] || ''), 80);
  const resolvedUser = san(body['_user'] ?? '');

  // ── Plugin Callbacks ──────────────────────────────────────────────────────
  type CallbackFn = () => AdaptedResponse;
  const pluginCallbacks: Record<string, CallbackFn> = {

    nxai_connect: () => {
      const token   = sanStr(String(body['token'] || body['session_token'] || ''), SESSION_TOKEN_MAX).trim();
      const placeId = body['place_id'] ? sanStr(String(body['place_id']), 30) : null;
      const userId  = body['user_id']  ? sanStr(String(body['user_id']),  20) : null;
      if (token.length >= 16) setSession(resolvedUser, token, placeId, userId);
      bumpPoll(resolvedUser);
      pushLog({ action: 'nxai_connect', user: resolvedUser, placeId, userId });
      const proj = getProject(resolvedUser);
      return res.status(200).json({
        ok: true, status: 'ok',
        required_plugin_version: REQUIRED_PLUGIN_VERSION,
        web_version: WEB_VERSION, api_version: API_VERSION,
        currentProject: proj, projectId: proj.projectId || '',
        projectName: proj.projectName || '', ts: Date.now(),
      });
    },

    nxai_disconnect: () => {
      const sess = sessionStore.get(san(resolvedUser));
      if (sess) { appendSessionAudit(san(resolvedUser), 'disconnect', {}); sessionStore.delete(san(resolvedUser)); }
      pushLog({ action: 'nxai_disconnect', user: resolvedUser });
      return res.status(200).json({ ok: true, status: 'ok', ts: Date.now() });
    },

    game_scan: () => {
      const d = { data: sanObj(body['data']), ts: (body['ts'] as number) || Date.now(), user: resolvedUser };
      saveGameScan(resolvedUser, d);
      writeJson(wsFile(resolvedUser), withTs(d));
      return res.status(200).json({ ok: true, status: 'ok', ts: d.ts });
    },

    workspace_data: () => {
      writeJson(wsFile(resolvedUser), withTs(body));
      return res.status(200).json({ ok: true, status: 'ok' });
    },

    output_data: () => {
      saveOutput(resolvedUser, sanArr(body['outputs']));
      return res.status(200).json({ ok: true, status: 'ok' });
    },

    script_content: () => {
      saveScriptContent(resolvedUser, {
        name:      sanStr(body['name']       || '', 100),
        parent:    sanStr(body['parentName'] || body['parent'] || '', 100),
        fullPath:  sanStr(body['fullPath']   || '', 200),
        class:     sanStr(body['class']      || body['scriptType'] || 'Script', 30),
        source:    sanStrSafe(body['source'] || ''),
        lineCount: sanInt(body['lineCount'], 0, 0, 99_999),
        disabled:  !!body['disabled'],
        updatedAt: Date.now(),
      });
      pushLog({ action: 'script_read', user: resolvedUser, name: sanStr(String(body['name'] || ''), 50) });
      return res.status(200).json({ ok: true, status: 'ok', name: sanStr(String(body['name'] || ''), 50) });
    },

    script_list: () => {
      saveScriptList(resolvedUser, {
        parent:  sanStr(body['parent'] || '', 100),
        scripts: sanArr(body['scripts']),
        count:   sanInt(body['count'], 0, 0, 99_999),
      });
      return res.status(200).json({ ok: true, status: 'ok', count: sanInt(body['count'], 0, 0, 99_999) });
    },

    check_list: () => {
      const count = sanInt(body['total'] || body['count'], 0, 0, 99_999);
      saveScriptList(resolvedUser, {
        parent:    sanStr(body['parent'] || 'all', 100),
        scripts:   sanArr(body['scripts'] || body['entries']),
        count, total: count, breakdown: sanObj(body['breakdown']), updatedAt: Date.now(),
      });
      pushLog({ action: 'check_list', user: resolvedUser, count });
      return res.status(200).json({ ok: true, status: 'ok', count });
    },

    script_lines: () => {
      saveScriptLines(resolvedUser, {
        name:      sanStr(body['name'] || '', 100),
        lineStart: sanInt(body['lineStart'], 1, 1, 99_999),
        lineEnd:   sanInt(body['lineEnd'],   1, 1, 99_999),
        total:     sanInt(body['total'],     0, 0, 99_999),
        content:   sanStrSafe(body['content'] || ''),
      });
      return res.status(200).json({ ok: true, status: 'ok' });
    },

    log_output: () => {
      const logs = sanArr(body['logs'], 100);
      saveLogSvc(resolvedUser, logs);
      return res.status(200).json({ ok: true, status: 'ok', received: logs.length });
    },

    mention_resolved: () => {
      saveMention(resolvedUser, {
        mention: sanStr(body['mention'] || '', 100),
        object:  sanObj(body['object']),
        found:   true,
      });
      return res.status(200).json({ ok: true, status: 'ok' });
    },

    mention_not_found: () => {
      saveMention(resolvedUser, {
        mention: sanStr(body['mention'] || '', 100),
        object:  null,
        found:   false,
        ts:      Date.now(),
      });
      pushLog({ action: 'mention_not_found', user: resolvedUser, mention: sanStr(String(body['mention'] || ''), 50) });
      return res.status(200).json({ ok: true, status: 'ok' });
    },

    search_result: () => {
      saveSearch(resolvedUser, {
        query:   sanStr(body['query'] || '', 200),
        results: sanArr(body['results']),
        count:   sanInt(body['count'], 0, 0, 99_999),
      });
      return res.status(200).json({ ok: true, status: 'ok', count: sanInt(body['count'], 0, 0, 99_999) });
    },

    descendants: () => {
      saveDescendants(resolvedUser, {
        target:      sanStr(body['target'] || '', 100),
        descendants: sanArr(body['descendants']),
        count:       sanInt(body['count'], 0, 0, 99_999),
      });
      return res.status(200).json({ ok: true, status: 'ok' });
    },

    object_properties: () => {
      saveProperties(resolvedUser, {
        name:       sanStr(body['name'] || '', 100),
        properties: sanObj(body['properties']),
      });
      return res.status(200).json({ ok: true, status: 'ok' });
    },

    set_properties_result: () => {
      saveProperties(resolvedUser, {
        name:       sanStr(body['name']       || body['instance'] || '', 100),
        properties: sanObj(body['properties'] || body['changed']  || {}),
        count:      sanInt(body['count'], 0, 0, 9_999),
        updatedAt:  Date.now(),
      });
      pushLog({ action: 'set_properties_result', user: resolvedUser, name: sanStr(String(body['name'] || ''), 50) });
      return res.status(200).json({ ok: true, status: 'ok' });
    },

    action_list: () => {
      saveActionList(resolvedUser, {
        actions: sanArr(body['actions']),
        count:   sanInt(body['count'], 0, 0, 9_999),
      });
      return res.status(200).json({ ok: true, status: 'ok' });
    },

    asset_library:   () => { saveAssetLib(resolvedUser,    { category: sanStr(body['category'] || 'all', 50), data: sanObj(body['data'] || body['summary']) }); return res.status(200).json({ ok: true, status: 'ok' }); },
    assets_listed:   () => { saveAssetLib(resolvedUser,    { category: sanStr(body['category'] || 'all', 50), data: sanObj(body['data'] || body['summary']) }); return res.status(200).json({ ok: true, status: 'ok' }); },
    asset_id_result: () => { saveAssetId(resolvedUser,     { category: sanStr(body['category'] || '', 50), sub: sanStr(body['sub'] || '', 50), name: sanStr(body['name'] || '', 100), id: sanStr(body['id'] || '', 100) }); return res.status(200).json({ ok: true, status: 'ok' }); },
    asset_folder_list: () => { saveAssetFolder(resolvedUser, { folder: sanStr(body['folder'] || 'all', 50), contents: sanObj(body['contents']) }); return res.status(200).json({ ok: true, status: 'ok' }); },

    // Theme callbacks removed — theme_data, themes_list, theme_list, theme_applied, theme_compare

    module_deployed:   () => { saveModuleDeploy(resolvedUser,  { name: sanStr(body['name'] || '', 100), parent: sanStr(body['parent'] || '', 100), source: sanStr(body['source'] || '', 100) }); return res.status(200).json({ ok: true, status: 'ok' }); },
    modules_list:      () => { saveModuleList(resolvedUser,    { folder: sanStr(body['folder'] || 'modulescripts', 100), modules: sanArr(body['modules']), count: sanInt(body['count'], 0, 0, 999) }); return res.status(200).json({ ok: true, status: 'ok' }); },
    terrain_materials: () => { saveTerrainResult(resolvedUser, { materials: sanArr(body['materials']), count: sanInt(body['count'], 0, 0, 999) }); return res.status(200).json({ ok: true, status: 'ok' }); },

    runcode_result: () => {
      const result = {
        mode:    sanStr(body['mode'] || 'pipeline', 20),
        success: !!body['success'],
        output:  body['output'] ?? null,
        log:     sanArr(body['log'], 200),
        ts:      Date.now(),
      };
      saveRunCodeResult(resolvedUser, result);
      pushLog({ action: 'runcode_result', user: resolvedUser, mode: result.mode, success: result.success });
      return res.status(200).json({ ok: true, status: 'ok', mode: result.mode, success: result.success });
    },

    expression_result: () => {
      const result = {
        expression: sanStr(body['expression'] || '', 300),
        result:     body['result'] != null ? String(body['result']).substring(0, 2000) : null,
        ts:         Date.now(),
      };
      saveExprResult(resolvedUser, result);
      pushLog({ action: 'expression_result', user: resolvedUser, expression: sanStr(String(body['expression'] || ''), 80) });
      return res.status(200).json({ ok: true, status: 'ok', expression: result.expression });
    },

    query_result: () => {
      const result = {
        results: sanArr(body['results'], 200),
        count:   sanInt(body['count'], 0, 0, 99_999),
        ts:      Date.now(),
      };
      saveQueryResult(resolvedUser, result);
      pushLog({ action: 'query_result', user: resolvedUser, count: result.count });
      return res.status(200).json({ ok: true, status: 'ok', count: result.count });
    },

    plugin_error: () => {
      const errorEntry = {
        actionName: sanStr(body['actionName'] || body['action_name'] || 'unknown', 80),
        message:    sanStr(body['message']    || body['error']       || '',        500),
        timestamp:  (body['timestamp'] as number) || Date.now(),
        ts:         Date.now(),
      };
      savePluginError(resolvedUser, errorEntry);
      pushLog({
        action:     'plugin_error',
        user:       resolvedUser,
        actionName: errorEntry.actionName,
        message:    errorEntry.message.substring(0, 80),
      });
      return res.status(200).json({ ok: true, status: 'ok' });
    },

    inject_command: () => {
      const sender   = san(body['_user'] ?? '');
      const target   = san(body['_target_user'] || sender);
      const cmd      = sanObj(body['command']);
      const priority = sanPriority(body['priority'] || body['_priority']);

      if (!target) return res.status(200).json({
        ok: false, status: 'error', error: '"_user" or "_target_user" is required.', pushed: 0,
      });

      const act = sanAction(cmd['action']);
      if (!act) return res.status(200).json({
        ok: false, status: 'error', error: '"command.action" is required.', pushed: 0,
      });

      const auth = authorizeCommand(req, sender, target, act);
      if (!auth.ok) {
        return res.status(200).json({
          ok: false, status: 'error',
          error: auth.error, pushed: 0,
          required_plugin_version: REQUIRED_PLUGIN_VERSION,
        });
      }

      const cmdToQueue: QueueCommand = {
        ...cmd as QueueCommand, action: act,
        _user:        String(body['_user'] || 'web').substring(0, 50),
        _target_user: target,
        _apiKey:      undefined,
      };

      const pushed = pushQueue(target, cmdToQueue, priority);

      bumpStats(sender || 'web', act);
      pushLog({ action: act, user: sender || 'web', target, name: sanStr(String(cmd['name'] || ''), 50) });
      pushUserHistory(sender, act, sanStr(String(cmd['name'] || ''), 60));

      return res.status(200).json({
        ok:                      true,
        status:                  'ok',
        pushed:                  pushed ? 1 : 0,
        action:                  act,
        target,
        priority,
        pluginConnected:         isOnline(target),
        queueLength:             getQueue(target).length + getPriorityQueue(target).length,
        required_plugin_version: REQUIRED_PLUGIN_VERSION,
        api_version:             API_VERSION,
        ts:                      Date.now(),
      });
    },
  };

  if (pluginCallbacks[rawAction]) return pluginCallbacks[rawAction]();

  // ── Control Actions ───────────────────────────────────────────────────────

  if (rawAction === 'reset') {
    const target = san(body['_user'] || body['user'] || '');
    if (!target) return sendError(res, 400, '"user" is required.');
    const auth = authorizeCommand(req, ratUser, target, null);
    if (!auth.ok) return sendError(res, auth.status!, auth.error!);
    clearQueue(target);
    return res.status(200).json({ ok: true, status: 'ok', message: 'Queue reset.', user: target });
  }

  if (rawAction === 'status') {
    const target = san(body['_user'] || body['user'] || '');
    const sess   = getSession(target);
    const nq     = getQueue(target), pq = getPriorityQueue(target);
    return res.status(200).json({
      ok:                      true,
      connected:               isOnline(target),
      lastPoll:                lastPoll(target),
      queueLength:             nq.length + pq.length,
      priorityQueue:           pq.length,
      normalQueue:             nq.length,
      sessionStats:            getSessionStats(target),
      hasSession:              !!sess,
      placeId:                 sess?.placeId ?? null,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      web_version:             WEB_VERSION,
      currentProject:          getProject(target),
    });
  }

  if (rawAction === 'set_project') {
    if (!resolvedUser) return sendError(res, 400, '"_user" is required.');
    const auth = authorizeCommand(req, ratUser, resolvedUser, 'set_project');
    if (!auth.ok) return sendError(res, auth.status!, auth.error!);
    const data: Partial<ProjectData> = {
      projectId:   sanStr(String(body['projectId']   || body['project_id']   || ''), 100),
      projectName: sanStr(String(body['projectName'] || body['project_name'] || ''), 100),
      placeId:     sanStr(String(body['placeId']     || body['place_id']     || ''), 50),
    };
    saveProject(resolvedUser, data);
    pushLog({ action: 'set_project', user: resolvedUser, ...data });
    return res.status(200).json({ ok: true, status: 'ok', ...data });
  }

  if (rawAction === 'set_webhook') {
    if (!resolvedUser) return sendError(res, 400, '"_user" is required.');
    const auth = authorizeCommand(req, ratUser, resolvedUser, null);
    if (!auth.ok) return sendError(res, auth.status!, auth.error!);
    const webhookUrl = body['url'] ? sanStr(String(body['url']), 300) : null;
    if (webhookUrl && !webhookUrl.startsWith('https://'))
      return sendError(res, 400, 'Webhook URL must use HTTPS.');
    saveWebhook(resolvedUser, webhookUrl);
    return res.status(200).json({ ok: true, status: 'ok', webhookSet: !!webhookUrl, user: resolvedUser });
  }

  if (rawAction === 'multi_target' && Array.isArray(body['targets'])) {
    if (!verifyAdminToken(req)) return sendError(res, 401, 'Admin token required for multi_target.');
    const targets  = sanArr<unknown>(body['targets'], 20).map(t => san(String(t)));
    const cmd      = sanObj(body['command']);
    const act      = sanAction(cmd['action']);
    const priority = sanPriority(body['priority']);
    if (!act) return sendError(res, 400, '"command.action" is required.');
    let pushed = 0;
    const results: Record<string, { sent: boolean; online: boolean }> = {};
    for (const target of targets) {
      const sent = pushQueue(target, { ...(cmd as QueueCommand), action: act, _user: resolvedUser, _target_user: target }, priority);
      results[target] = { sent, online: isOnline(target) };
      if (sent) pushed++;
    }
    bumpStats(resolvedUser || 'admin', `multi:${act}`);
    return res.status(200).json({ ok: true, status: 'ok', pushed, targets: results, ts: Date.now() });
  }

  if (rawAction === 'get_logs' || rawAction === 'get_history') {
    if (!verifyAdminToken(req)) return sendError(res, 401, 'Admin token required.');
    if (rawAction === 'get_logs') {
      const logs  = readJson<Record<string, unknown>[]>(LOG_FILE, []);
      const limit = sanInt(body['limit'], 100, 1, 300);
      return res.status(200).json({ ok: true, logs: logs.slice(0, limit) });
    }
    const hist  = readJson<Record<string, unknown>[]>(HIST_FILE, []);
    const limit = sanInt(body['limit'], 50, 1, 150);
    return res.status(200).json({ ok: true, history: hist.slice(0, limit) });
  }

  if (rawAction === 'search_toolbox') {
    const sender    = san(body['_user'] ?? '');
    const keyword   = sanStr(String(body['keyword'] || body['query'] || body['term'] || ''), 100).trim();
    const assetType = sanStr(String(body['asset_type'] || body['assetType'] || 'Model'), 30);
    const limit     = sanInt(body['limit'] || body['count'], 10, 1, 50);
    const cursor    = body['cursor'] ? sanStr(String(body['cursor']), 200) : null;
    if (!keyword) return sendError(res, 400, '"keyword" is required.');
    try {
      const result = await robloxToolboxSearch(keyword, assetType, limit, cursor);
      const target = san(body['_target_user'] || sender);
      if (target && isOnline(target)) {
        pushQueue(target, {
          action: 'search_result_toolbox', keyword, assetType,
          assets: result.assets.slice(0, 20),
          nextCursor: result.nextCursor, total: result.total, _user: sender,
        }, 'normal');
      }
      bumpStats(sender || 'web', 'search_toolbox');
      pushLog({ action: 'search_toolbox', user: sender || 'web', keyword: sanStr(keyword, 50), assetType, found: result.assets.length });
      return res.status(200).json({
        ok: true, status: 'ok', keyword, assetType, assets: result.assets,
        nextCursor: result.nextCursor, total: result.total, count: result.assets.length,
        pluginNotified: target ? isOnline(san(String(body['_target_user'] || sender))) : false, ts: Date.now(),
      });
    } catch (err) {
      const code = (err as { code?: number })?.code ?? 500;
      pushLog({ action: 'search_toolbox_error', user: body['_user'] || 'web', error: sanStr((err as Error)?.message || '', 100) });
      return sendError(res, code === 400 ? 400 : code === 429 ? 429 : 502, sanStr((err as Error)?.message || 'Toolbox search failed.', 200));
    }
  }

  if (rawAction === 'insert_model') {
    const sender   = san(body['_user'] ?? '');
    const target   = san(body['_target_user'] || sender);
    const assetId  = body['asset_id'] || body['assetId'] || body['id'] || '';
    const parent   = sanStr(String(body['parent'] || body['parentPath'] || 'workspace'), 100);
    const priority = sanPriority(body['priority']);
    if (!assetId) return sendError(res, 400, '"asset_id" is required.');
    if (!target)  return sendError(res, 400, '"_user" is required.');
    const auth = authorizeCommand(req, sender, target, 'insert_rbx_model');
    if (!auth.ok) return sendError(res, auth.status!, auth.error!);
    try {
      const asset = await validateAsset(assetId);
      if (!asset.insertable && asset.assetType !== 'Unknown')
        return sendError(res, 400, `AssetType "${asset.assetType}" cannot be inserted into Workspace.`);
      pushQueue(target, {
        action: 'insert_rbx_model', asset_id: asset.assetId, name: asset.name,
        parent, insert_script: asset.insertScript, _user: sender, _target_user: target,
      }, priority);
      bumpStats(sender || 'web', 'insert_model');
      pushLog({ action: 'insert_model', user: sender || 'web', target, assetId: asset.assetId, assetName: sanStr(asset.name, 50), parent });
      pushUserHistory(sender, 'insert_model', `${asset.name} (${asset.assetId})`);
      return res.status(200).json({
        ok: true, status: 'ok', assetId: asset.assetId, name: asset.name,
        description: asset.description || '', assetType: asset.assetType,
        creator: asset.creator, isPublic: asset.isPublic,
        unverified: asset.unverified || false, insertable: asset.insertable,
        insertScript: asset.insertScript, parent, priority,
        pluginConnected: isOnline(target), queued: true,
        queueLength: getQueue(target).length, ts: Date.now(),
      });
    } catch (err) {
      const code = (err as { code?: number })?.code ?? 500;
      pushLog({ action: 'insert_model_error', user: body['_user'] || 'web', error: sanStr((err as Error)?.message || '', 100) });
      return sendError(res, code === 400 ? 400 : 502, sanStr((err as Error)?.message || 'Insert failed.', 200));
    }
  }

  if (rawAction === 'search_docs') {
    const sender  = san(body['_user'] ?? '');
    const query   = sanStr(String(body['query'] || body['keyword'] || body['q'] || ''), 150).trim();
    const docType = ['api', 'guide', 'all'].includes(String(body['doc_type'] || '')) ? String(body['doc_type']) : 'all';
    const limit   = sanInt(body['limit'], 5, 1, 20);
    if (!query) return sendError(res, 400, '"query" is required.');
    try {
      const result = await searchDocs(query, docType, limit);
      bumpStats(sender || 'web', 'search_docs');
      pushLog({ action: 'search_docs', user: sender || 'web', query: sanStr(query, 50), found: result.results.length, source: result.source });
      return res.status(200).json({ ok: true, status: 'ok', query, docType, results: result.results, count: result.results.length, source: result.source, ts: Date.now() });
    } catch (err) {
      return sendError(res, 500, sanStr((err as Error)?.message || 'Docs search failed.', 200));
    }
  }

  if (rawAction === 'get_game_info') {
    const sender  = san(body['_user'] ?? '');
    const isPlace = body['type'] === 'place' || !!body['place_id'];
    const id      = parseInt(String(body['id'] || body['universe_id'] || body['place_id'] || '0').replace(/\D/g, ''), 10);
    if (!id) return sendError(res, 400, '"id" is required.');
    try {
      const info = await fetchGameInfo(id, isPlace);
      bumpStats(sender || 'web', 'get_game_info');
      return res.status(200).json({ ok: true, status: 'ok', ...info, ts: Date.now() });
    } catch (err) {
      return sendError(res, 502, sanStr((err as Error)?.message || 'Failed to fetch game info.', 200));
    }
  }

  if (rawAction === 'get_user_info' || rawAction === 'get_avatar_info') {
    const sender = san(body['_user'] ?? '');
    const userId = parseInt(String(body['user_id'] || body['userId'] || body['id'] || '0').replace(/\D/g, ''), 10);
    if (!userId) return sendError(res, 400, '"user_id" is required.');
    try {
      const info = await fetchUserInfo(userId);
      bumpStats(sender || 'web', rawAction);
      return res.status(200).json({ ok: true, status: 'ok', ...info, ts: Date.now() });
    } catch (err) {
      return sendError(res, 502, sanStr((err as Error)?.message || 'Failed to fetch user info.', 200));
    }
  }

  if (rawAction === 'validate_asset') {
    const sender  = san(body['_user'] ?? '');
    const assetId = body['asset_id'] || body['assetId'] || body['id'] || '';
    if (!assetId) return sendError(res, 400, '"asset_id" is required.');
    try {
      const asset = await validateAsset(assetId);
      bumpStats(sender || 'web', 'validate_asset');
      return res.status(200).json({ ok: true, status: 'ok', ...asset, ts: Date.now() });
    } catch (err) {
      const code = (err as { code?: number })?.code ?? 500;
      return sendError(res, code === 400 ? 400 : 502, sanStr((err as Error)?.message || '', 200));
    }
  }

  // ── Batch Commands ────────────────────────────────────────────────────────
  if (rawAction === 'batch_commands') {
    const sender   = san(body['_user'] ?? '');
    const target   = san(body['target'] || body['_target_user'] || sender);
    const priority = sanPriority(body['priority']);
    if (!target) return sendError(res, 400, '"target" is required.');
    let rawCommands: unknown[] = [];
    if (Array.isArray(body['commands']))        rawCommands = body['commands'] as unknown[];
    else if (typeof body['text'] === 'string') rawCommands = extractCommandsFromText(body['text'] as string);
    const isAdmin = verifyAdminToken(req);
    if (!isAdmin && sender !== target) return sendError(res, 403, 'Forbidden: cannot target another user.');
    if (!isAdmin) {
      const auth = authorizeCommand(req, sender, target, null);
      if (!auth.ok) return sendError(res, auth.status!, auth.error!);
    }
    const { safe, removed } = filterBatch(rawCommands, isAdmin);
    let pushed = 0;
    const skipped: string[] = [...removed];
    for (const cmd of safe) {
      if (!cmd?.action) continue;
      const act = sanAction(cmd.action);
      if (!act) { skipped.push(String(cmd.action)); continue; }
      pushQueue(target, {
        ...cmd, action: act,
        _user: String(body['_user'] || 'web').substring(0, 50),
        _target_user: target,
        _apiKey: undefined,
      }, priority);
      pushed++;
    }
    bumpStats(sender || 'web', 'batch_commands');
    pushLog({ action: 'batch_commands', user: sender || 'web', target, count: pushed, skipped, priority });
    pushUserHistory(sender, 'batch_commands', `${pushed} commands -> ${target}`);
    dispatchWebhook(sender, 'batch_commands', { pushed, target }).catch(() => {});
    return res.status(200).json({
      ok:                      true,
      status:                  'ok',
      pushed,
      skipped,
      priority,
      warning:                 removed.length > 0 ? `${removed.length} admin-only action(s) removed.` : undefined,
      pluginConnected:         isOnline(target),
      queueLength:             getQueue(target).length,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      ts:                      Date.now(),
    });
  }

  // ── Execute JSON / Text ───────────────────────────────────────────────────
  if (rawAction === 'execute_json' || rawAction === 'execute_text') {
    const sender   = san(body['_user'] ?? '');
    const target   = san(body['_target_user'] || sender);
    const priority = sanPriority(body['priority']);
    if (!target) return sendError(res, 400, '"_target_user" is required.');
    const isAdmin = verifyAdminToken(req);
    if (!isAdmin && sender !== target) return sendError(res, 403, 'Forbidden: execute cannot target another user.');
    if (!isAdmin) {
      const auth = authorizeCommand(req, sender, target, null);
      if (!auth.ok) return sendError(res, auth.status!, auth.error!);
    }
    const inputText  = String(body['text'] || (Array.isArray(body['commands']) ? JSON.stringify({ commands: body['commands'] }) : ''));
    const extracted  = extractCommandsFromText(inputText);
    const adminActions = getAdminActions();
    let pushed = 0;
    const skipped: string[] = [];
    for (const cmd of extracted) {
      if (!cmd?.action) continue;
      const act = sanAction(cmd.action);
      if (!act) { skipped.push(String(cmd.action)); continue; }
      if (!isAdmin && adminActions.has(act)) { skipped.push(`[admin-only] ${act}`); continue; }
      pushQueue(target, {
        ...cmd, action: act,
        _user: String(body['_user'] || 'web').substring(0, 50),
        _target_user: target,
        _apiKey: undefined,
      }, priority);
      pushed++;
    }
    bumpStats(sender || 'web', 'execute_json');
    pushLog({ action: 'execute_json', user: sender || 'web', target, count: pushed, skipped });
    pushUserHistory(sender, 'execute_json', `${pushed} extracted commands`);
    return res.status(200).json({
      ok:              true,
      status:          'ok',
      pushed,
      skipped,
      priority,
      pluginConnected: isOnline(target),
      queueLength:     getQueue(target).length,
      ts:              Date.now(),
    });
  }

  // ── Generic Single-Action Dispatch ────────────────────────────────────────
  if (rawAction) {
    const act      = sanAction(rawAction);
    const priority = sanPriority(body['priority'] || body['_priority']);
    const sender   = san(body['_user'] ?? '');
    const target   = san(body['_target_user'] || sender);
    if (!act)    return sendError(res, 400, 'Action name could not be parsed.');
    if (!target) return sendError(res, 400, '"_target_user" or "_user" is required.');
    const auth = authorizeCommand(req, sender, target, act);
    if (!auth.ok) return sendError(res, auth.status!, auth.error!);
    pushQueue(target, {
      ...body as QueueCommand, action: act,
      _user:          String(body['_user'] || 'web').substring(0, 50),
      _target_user:   target,
      _apiKey:        undefined,
      _session_token: undefined,
      _place_id:      undefined,
    }, priority);
    bumpStats(sender || 'web', act);
    pushLog({ action: act, user: sender || 'web', target, name: sanStr(String(body['name'] || ''), 50), parent: sanStr(String(body['parent'] || ''), 50) });
    pushHist({ action: act, details: sanStr(String(body['name'] || JSON.stringify(body).substring(0, 80)), 200), user: sender || 'web', target });
    pushUserHistory(sender, act, sanStr(String(body['name'] || ''), 60));
    dispatchWebhook(sender, 'command_queued', { action: act, target }).catch(() => {});
    return res.status(200).json({
      ok:                      true,
      status:                  'ok',
      action:                  act,
      target,
      priority,
      pluginConnected:         isOnline(target),
      queueLength:             getQueue(target).length + getPriorityQueue(target).length,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      api_version:             API_VERSION,
      ts:                      Date.now(),
    });
  }

  return sendError(res, 400, 'Request not recognised. Include a valid "action" or query parameter.', {
    hint: 'POST with { action: "your_action", _user: "username", ... }',
    web_version: WEB_VERSION, api_version: API_VERSION,
  });
}