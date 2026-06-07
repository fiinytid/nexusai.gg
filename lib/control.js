// api/control.js — NEXUS AI Control API

import {
  readFileSync, writeFileSync, existsSync,
  unlinkSync, readdirSync, statSync,
} from 'fs';
import crypto from 'crypto';

// ════════════════════════════════════════════════════════════════════════════
//  VERSION & TUNABLES
// ════════════════════════════════════════════════════════════════════════════

export const REQUIRED_PLUGIN_VERSION = 'V1.3.28';
export const WEB_VERSION             = 'V13.0';
const        API_VERSION             = 'v13';

const TMP = '/tmp';

// Session
const SESSION_TTL         = 24 * 60 * 60 * 1_000;   // 24 h
const SESSION_TOKEN_MAX   = 128;
const MIN_ADMIN_TOKEN_LEN = 16;
const MAX_BODY_FIELD_LEN  = 50_000;

// Queues
const MAX_QUEUE_SIZE      = 300;
const MAX_PRIORITY_QUEUE  = 50;
const QUEUE_MAX_AGE       = 30 * 60_000;             // 30 min — discard stale commands
const DEDUP_WINDOW        = 500;                     // ms — block identical destructive commands

// Log / history caps
const MAX_LOG_ENTRIES     = 500;
const MAX_HIST_ENTRIES    = 200;
const MAX_LOGSVC_ENTRIES  = 1_000;
const MAX_MENTION_ENTRIES = 100;
const MAX_USER_HIST       = 100;

// Rate limiting
const RATE_USER_PER_MIN   = 150;
const RATE_IP_PER_MIN     = 300;
const RATE_BURST_COUNT    = 20;
const RATE_BURST_WINDOW   = 5_000;                  // ms

// Cache TTLs
const TTL_TOOLBOX         =  5 * 60_000;
const TTL_ASSET           = 30 * 60_000;
const TTL_USER_INFO       = 10 * 60_000;
const TTL_GAME_INFO       = 15 * 60_000;

// Admin-only action names — loaded from env or this default list.
// Set NEXUS_ADMIN_ACTIONS in your environment to override (comma-separated).
const DEFAULT_ADMIN_ACTIONS = new Set([
  'run_lua', 'play_test', 'run_test', 'stop_test',
  'clear_workspace', 'delete_object', 'delete_multiple', 'delete_children',
  'delete_script', 'delete_empty_folders', 'create_anticheat_script',
]);

function getAdminActions() {
  const env = process.env.NEXUS_ADMIN_ACTIONS || '';
  if (!env) return DEFAULT_ADMIN_ACTIONS;
  return new Set(env.split(',').map(s => s.trim()).filter(Boolean));
}

// ════════════════════════════════════════════════════════════════════════════
//  ALLOWED ORIGINS
// ════════════════════════════════════════════════════════════════════════════

const ALLOWED_ORIGINS = new Set([
  'https://nexusai-roblox.vercel.app',
  'https://nexusai-gg-beta.vercel.app',
  'https://nexusai.gg',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
]);

// ════════════════════════════════════════════════════════════════════════════
//  FILE PATH HELPERS
// ════════════════════════════════════════════════════════════════════════════

/** Sanitise a username for use as a filename segment. */
function san(user) {
  return (user || 'default')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .toLowerCase()
    .substring(0, 40);
}

const fp = (prefix, u) => `${TMP}/${prefix}_${san(u)}.json`;

// Per-user files
const queueFile        = u => fp('nq',       u);
const priorityQFile    = u => fp('nqp',      u);
const pollFile         = u => `${TMP}/np_${san(u)}.txt`;
const outFile          = u => fp('no',       u);
const wsFile           = u => fp('nw',       u);
const scriptFile       = u => fp('ns',       u);
const scriptListFile   = u => fp('nsl',      u);
const scriptLinesFile  = u => fp('nslv',     u);
const logSvcFile       = u => fp('nlg',      u);
const projectFile      = u => fp('nprj',     u);
const mentionFile      = u => fp('nmention', u);
const searchFile       = u => fp('nsearch',  u);
const gameScanFile     = u => fp('ngscan',   u);
const descendantsFile  = u => fp('ndesc',    u);
const propertiesFile   = u => fp('nprop',    u);
const actionListFile   = u => fp('nact',     u);
const assetLibFile     = u => fp('nasset',   u);
const assetIdFile      = u => fp('nassetid', u);
const assetFolderFile  = u => fp('nafolder', u);
const themeDataFile    = u => fp('ntheme',   u);
const themesListFile   = u => fp('nthemes',  u);
const themeAppliedFile = u => fp('nthapply', u);
const themeCompareFile = u => fp('nthcmp',   u);
const moduleListFile   = u => fp('nmodlist', u);
const moduleDeployFile = u => fp('nmoddep',  u);
const terrainFile      = u => fp('nterrain', u);
const userHistFile     = u => fp('nucmdh',   u);
const sessionAuditFile = u => fp('nsessaud', u);
const webhookFile      = u => fp('nwebhook', u);

// Global files
const LOG_FILE   = `${TMP}/nexus_log.json`;
const HIST_FILE  = `${TMP}/nexus_hist.json`;
const STATS_FILE = `${TMP}/nexus_global_stats.json`;

// Prefixes used for stale-file cleanup
const FILE_PREFIXES = [
  'nq_', 'nqp_', 'np_', 'no_', 'nw_', 'ns_', 'nsl_', 'nslv_', 'nlg_', 'nprj_',
  'nmention_', 'nsearch_', 'ngscan_', 'ndesc_', 'nprop_', 'nact_',
  'nasset_', 'nassetid_', 'nafolder_', 'ntheme_', 'nthemes_', 'nthapply_',
  'nthcmp_', 'nmodlist_', 'nmoddep_', 'nterrain_', 'nucmdh_', 'nsessaud_', 'nwebhook_',
];

// ════════════════════════════════════════════════════════════════════════════
//  IN-MEMORY STORES
// ════════════════════════════════════════════════════════════════════════════

const sessionStore = new Map();   // username  → session object
const rateLimits   = new Map();   // username  → { count, reset }
const ipRateLimits = new Map();   // ip        → { count, reset }
const burstLimits  = new Map();   // username  → { count, windowEnd }
const apiCache     = new Map();   // cacheKey  → { data, expiresAt }
const dedupCache   = new Map();   // cmdHash   → timestamp

// ════════════════════════════════════════════════════════════════════════════
//  SANITISERS
// ════════════════════════════════════════════════════════════════════════════

/** Strip control characters and HTML angle-brackets. Max 200 chars by default. */
function sanStr(str, maxLen = 200) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/[<>]/g, '')
    .substring(0, maxLen);
}

/** Strip control characters only (keeps HTML). Used for long script bodies. */
function sanStrSafe(str, maxLen = MAX_BODY_FIELD_LEN) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').substring(0, maxLen);
}

/** Escape HTML entities for embedding in error messages. */
function escapeHtml(str, maxLen = 500) {
  return String(str ?? '').substring(0, maxLen)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;');
}

/** Clamp an integer between min and max. Returns def if NaN. */
function sanInt(val, def = 0, min = 0, max = 999_999) {
  const n = parseInt(val, 10);
  return isNaN(n) ? def : Math.max(min, Math.min(max, n));
}

/** Ensure value is a plain object (not array, not null). */
function sanObj(val) {
  return val && typeof val === 'object' && !Array.isArray(val) ? val : {};
}

/** Ensure value is an array, capped at maxLen. */
function sanArr(val, maxLen = 500) {
  return Array.isArray(val) ? val.slice(0, maxLen) : [];
}

/** Validate a priority string. Falls back to 'normal'. */
function sanPriority(val) {
  return ['critical', 'high', 'normal', 'low'].includes(val) ? val : 'normal';
}

/** Validate an action name: lowercase, alphanumeric + underscore, max 80 chars. */
function sanAction(val) {
  return String(val || '').toLowerCase().replace(/[^a-z0-9_]/g, '').substring(0, 80);
}

// ════════════════════════════════════════════════════════════════════════════
//  JSON HELPERS
// ════════════════════════════════════════════════════════════════════════════

/** Read a JSON file, returning fallback on error or absence. */
function readJson(filePath, fallback = null) {
  try {
    if (existsSync(filePath)) return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (_) {}
  return fallback;
}

/** Write data as JSON to filePath. Returns true on success. */
function writeJson(filePath, data) {
  try { writeFileSync(filePath, JSON.stringify(data)); return true; }
  catch (_) { return false; }
}

// ────────────────────────────────────────────────────────────────────────────
//  Robust JSON parser — tries multiple strategies for slightly malformed JSON.
// ────────────────────────────────────────────────────────────────────────────

function cleanControlChars(text) {
  if (typeof text !== 'string') return '';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out += (c >= 32 || c === 9 || c === 10 || c === 13) ? text[i] : ' ';
  }
  return out;
}

function robustJsonParse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = cleanControlChars(raw.trim());

  const attempts = [
    () => JSON.parse(s),
    () => JSON.parse(s.replace(/,(\s*[}\]])/g, '$1')),
    () => JSON.parse(
      s.replace(/,(\s*[}\]])/g, '$1')
       .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:(?!:))/g, '$1"$2"$3')
    ),
    () => JSON.parse(
      s.replace(/,(\s*[}\]])/g, '$1')
       .replace(/:\s*nil\b/g, ': null')
       .replace(/([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*=\s*)/g, '$1"$2": ')
       .replace(/([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:(?![=:>]))/g, (_, p, k) => `${p}"${k}": `)
    ),
  ];

  for (const attempt of attempts) {
    try { return attempt(); } catch (_) {}
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
//  Command extraction from free-form text (e.g. AI responses).
// ────────────────────────────────────────────────────────────────────────────

function extractCommandsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const all = [], seen = new Set();

  function addCmd(cmd) {
    if (!cmd?.action) return;
    const key = JSON.stringify(cmd);
    if (!seen.has(key)) { seen.add(key); all.push(cmd); }
  }

  function processItem(item) {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) { for (const sub of item) processItem(sub); return; }
    if (!item.action) return;
    if (item.action === 'batch_commands' && Array.isArray(item.commands)) {
      for (const sub of item.commands) { if (sub?.action) addCmd(sub); }
    } else { addCmd(item); }
  }

  // Extract from ```json ... ``` code blocks first.
  const codeBlockRe = /```(?:json|JSON|js|lua)?\s*([\s\S]*?)```/g;
  let m;
  while ((m = codeBlockRe.exec(text)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    const parsed = robustJsonParse(raw);
    if (parsed) processItem(parsed);
  }

  // Then scan inline JSON objects that contain "action".
  const stripped = text.replace(/```[\s\S]*?```/g, '');
  const jsonRe   = /(\{[^`]*?"action"\s*:\s*"[^"]+[^`]*?\})/gs;
  while ((m = jsonRe.exec(stripped)) !== null) {
    const p = robustJsonParse(m[1]);
    if (p?.action) processItem(p);
  }

  return all;
}

// ════════════════════════════════════════════════════════════════════════════
//  IN-MEMORY API CACHE
// ════════════════════════════════════════════════════════════════════════════

function cacheGet(key) {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { apiCache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, ttlMs) {
  // Evict expired entries if cache grows too large.
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

function cacheClear(pattern) {
  if (!pattern) { apiCache.clear(); return; }
  for (const k of apiCache.keys()) { if (k.includes(pattern)) apiCache.delete(k); }
}

// Periodic cleanup: expired cache entries + old dedup records.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of apiCache)  { if (now > v.expiresAt)                  apiCache.delete(k);  }
  for (const [k, v] of dedupCache){ if (now - v > DEDUP_WINDOW * 10)         dedupCache.delete(k); }
}, 5 * 60_000).unref?.();

// ════════════════════════════════════════════════════════════════════════════
//  SESSION MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

/**
 * Create or refresh a session for a username.
 * @param {string} username
 * @param {string} token    - Plugin-generated session token.
 * @param {string} placeId  - Roblox PlaceId (binds the session).
 * @param {string} userId   - Roblox UserId.
 */
function setSession(username, token, placeId, userId) {
  const u        = san(username);
  const existing = sessionStore.get(u);
  sessionStore.set(u, {
    token:      String(token).substring(0, SESSION_TOKEN_MAX),
    placeId:    placeId ? sanStr(String(placeId), 30) : null,
    userId:     userId  ? sanStr(String(userId),  20) : null,
    createdAt:  existing?.createdAt || Date.now(),
    lastSeen:   Date.now(),
    reconnects: (existing?.reconnects || 0) + (existing ? 1 : 0),
    cmdCount:   existing?.cmdCount || 0,
  });
  appendSessionAudit(u, 'connect', { placeId, userId });
}

function getSession(username) {
  const s = sessionStore.get(san(username));
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL) {
    sessionStore.delete(san(username));
    return null;
  }
  s.lastSeen = Date.now();
  return s;
}

function touchSession(username) {
  const s = sessionStore.get(san(username));
  if (s) { s.lastSeen = Date.now(); s.cmdCount = (s.cmdCount || 0) + 1; }
}

function getSessionStats(username) {
  const s = getSession(san(username));
  if (!s) return null;
  return {
    hasSession: true,
    placeId:    s.placeId   || null,
    userId:     s.userId    || null,
    ageMs:      Date.now()  - s.createdAt,
    lastSeenMs: Date.now()  - s.lastSeen,
    reconnects: s.reconnects || 0,
    cmdCount:   s.cmdCount   || 0,
  };
}

function appendSessionAudit(username, event, data) {
  try {
    const path = sessionAuditFile(username);
    let log = readJson(path, []);
    log.unshift({ event, ...data, ts: Date.now() });
    if (log.length > 100) log = log.slice(0, 100);
    writeJson(path, log);
  } catch (_) {}
}

// Expire old sessions every 30 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessionStore) {
    if (now - v.createdAt > SESSION_TTL) {
      appendSessionAudit(k, 'expired', {});
      sessionStore.delete(k);
    }
  }
}, 30 * 60_000).unref?.();

// ════════════════════════════════════════════════════════════════════════════
//  TOKEN VERIFICATION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Verify the ADMIN_TOKEN from Authorization / X-Admin-Token headers.
 * Returns false if the token is unset, too short, or does not match.
 */
function verifyAdminToken(req) {
  const env = process.env.ADMIN_TOKEN;
  if (!env || env.length < MIN_ADMIN_TOKEN_LEN) return false;

  const candidate =
    (req.headers?.['authorization'] || '').replace(/^Bearer\s+/i, '').trim() ||
    (req.headers?.['x-admin-token']  || '').trim()                            ||
    (typeof req.query?.token === 'string' ? req.query.token.trim() : '');

  if (!candidate) return false;
  try {
    const padLen = 256;
    const a = Buffer.from(candidate.padEnd(padLen).substring(0, padLen));
    const b = Buffer.from(env.padEnd(padLen).substring(0, padLen));
    return crypto.timingSafeEqual(a, b) && candidate === env;
  } catch (_) { return false; }
}

/**
 * Verify the optional HMAC-SHA256 plugin request signature.
 * If PLUGIN_HMAC_SECRET is not configured, all requests pass.
 */
function verifyPluginHmac(req, body) {
  const secret = process.env.PLUGIN_HMAC_SECRET;
  if (!secret || secret.length < 16) return true;

  const sig = (
    req.headers?.['x-nexus-signature']  ||
    req.headers?.['x-roblox-signature'] || ''
  ).trim();
  if (!sig) return true; // Plugin does not yet sign requests — allow.

  try {
    const payload  = typeof body === 'string' ? body : JSON.stringify(body);
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const a = Buffer.from(sig.padEnd(200).substring(0, 200));
    const b = Buffer.from(expected.padEnd(200).substring(0, 200));
    return crypto.timingSafeEqual(a, b);
  } catch (_) { return false; }
}

/**
 * Verify a plugin session token.
 * @returns {'ok'|'missing'|'no_session'|'invalid'|'place_mismatch'}
 */
function verifySessionToken(username, candidateToken, candidatePlaceId) {
  if (!candidateToken) return 'missing';
  const s = getSession(username);
  if (!s) return 'no_session';

  try {
    const padLen = 256;
    const a = Buffer.from(String(candidateToken).padEnd(padLen).substring(0, padLen));
    const b = Buffer.from(s.token.padEnd(padLen).substring(0, padLen));
    if (!crypto.timingSafeEqual(a, b) || candidateToken !== s.token) return 'invalid';
  } catch (_) { return 'invalid'; }

  if (s.placeId && candidatePlaceId && String(candidatePlaceId) !== s.placeId)
    return 'place_mismatch';

  return 'ok';
}

// ════════════════════════════════════════════════════════════════════════════
//  RATE LIMITING
// ════════════════════════════════════════════════════════════════════════════

function checkRateLimit(user, max = RATE_USER_PER_MIN) {
  const now = Date.now(), key = san(user);
  if (!rateLimits.has(key)) rateLimits.set(key, { count: 0, reset: now + 60_000 });
  const rl = rateLimits.get(key);
  if (now > rl.reset) { rl.count = 0; rl.reset = now + 60_000; }
  return ++rl.count <= max;
}

function checkIpRateLimit(ip) {
  if (!ip) return true;
  const now = Date.now(), key = String(ip).substring(0, 45);
  if (!ipRateLimits.has(key)) ipRateLimits.set(key, { count: 0, reset: now + 60_000 });
  const rl = ipRateLimits.get(key);
  if (now > rl.reset) { rl.count = 0; rl.reset = now + 60_000; }
  return ++rl.count <= RATE_IP_PER_MIN;
}

function checkBurstLimit(user) {
  const now = Date.now(), key = san(user);
  if (!burstLimits.has(key)) burstLimits.set(key, { count: 0, windowEnd: now + RATE_BURST_WINDOW });
  const bl = burstLimits.get(key);
  if (now > bl.windowEnd) { bl.count = 0; bl.windowEnd = now + RATE_BURST_WINDOW; }
  return ++bl.count <= RATE_BURST_COUNT;
}

function getClientIp(req) {
  return (req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for'] || '')
    .toString().split(',')[0].trim();
}

// Cleanup stale rate-limit entries every 5 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits)   { if (now > v.reset     + 60_000) rateLimits.delete(k);   }
  for (const [k, v] of ipRateLimits) { if (now > v.reset     + 60_000) ipRateLimits.delete(k); }
  for (const [k, v] of burstLimits)  { if (now > v.windowEnd + 60_000) burstLimits.delete(k);  }
}, 5 * 60_000).unref?.();

// ════════════════════════════════════════════════════════════════════════════
//  COMMAND DEDUPLICATION
// ════════════════════════════════════════════════════════════════════════════

// Actions for which we block duplicates within DEDUP_WINDOW ms.
const DEDUP_ACTIONS = new Set([
  'delete_object', 'clear_workspace', 'play_test', 'run_lua', 'clear_terrain',
]);

/**
 * Returns true if an identical command was already queued within DEDUP_WINDOW.
 * Automatically registers the command if not a duplicate.
 */
function isDuplicateCommand(cmd) {
  if (!DEDUP_ACTIONS.has(cmd?.action)) return false;
  const hash = crypto.createHash('md5')
    .update(JSON.stringify({
      action: cmd.action,
      name:   cmd.name,
      code:   (cmd.code || '').substring(0, 100),
    }))
    .digest('hex');
  const last = dedupCache.get(hash);
  if (last && (Date.now() - last) < DEDUP_WINDOW) return true;
  dedupCache.set(hash, Date.now());
  return false;
}

// ════════════════════════════════════════════════════════════════════════════
//  QUEUE MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2, low: 3 };

// ── Priority queue (critical / high) ─────────────────────────────────────────

function getPriorityQueue(u)      { return readJson(priorityQFile(u), []); }
function savePriorityQueue(u, q)  { writeJson(priorityQFile(u), q); }

function pushPriorityQueue(u, cmd, priority = 'normal') {
  const q = getPriorityQueue(u);
  q.push({ ...cmd, _priority: priority, _ts: Date.now() });
  if (q.length > MAX_PRIORITY_QUEUE) q.splice(0, q.length - MAX_PRIORITY_QUEUE);
  q.sort((a, b) => {
    const pa = PRIORITY_ORDER[a._priority] ?? 2;
    const pb = PRIORITY_ORDER[b._priority] ?? 2;
    return pa !== pb ? pa - pb : a._ts - b._ts;
  });
  savePriorityQueue(u, q);
}

function drainPriorityQueue(u) {
  const q = getPriorityQueue(u);
  if (q.length === 0) return [];
  savePriorityQueue(u, []);
  return q;
}

// ── Normal queue ──────────────────────────────────────────────────────────────

function getQueue(u)     { return readJson(queueFile(u), []); }
function saveQueue(u, q) { writeJson(queueFile(u), q); }

function clearQueue(u) {
  saveQueue(u, []);
  savePriorityQueue(u, []);
}

/**
 * Add a command to the appropriate queue.
 * @returns {boolean} false if the command was deduplicated.
 */
function pushQueue(u, cmd, priority = 'normal') {
  if (isDuplicateCommand(cmd)) return false;

  if (priority === 'critical' || priority === 'high') {
    pushPriorityQueue(u, cmd, priority);
    return true;
  }

  // Remove commands older than QUEUE_MAX_AGE on every push.
  let q = getQueue(u).filter(c => (Date.now() - (c._ts || 0)) < QUEUE_MAX_AGE);
  q.push({ ...cmd, _ts: Date.now() });
  if (q.length > MAX_QUEUE_SIZE) q.splice(0, q.length - MAX_QUEUE_SIZE);
  saveQueue(u, q);
  return true;
}

/**
 * Drain priority queue first, then normal queue.
 * Discards commands older than QUEUE_MAX_AGE.
 */
function drainQueue(u) {
  const pq = drainPriorityQueue(u);
  const nq = getQueue(u).filter(c => (Date.now() - (c._ts || 0)) < QUEUE_MAX_AGE);
  clearQueue(u);
  return [...pq, ...nq];
}

// ════════════════════════════════════════════════════════════════════════════
//  HEARTBEAT / POLL TRACKING
// ════════════════════════════════════════════════════════════════════════════

function bumpPoll(u)  { try { writeFileSync(pollFile(u), String(Date.now())); } catch (_) {} }
function lastPoll(u)  { return parseInt(readJson(pollFile(u)) ?? '0') || 0; }
function isOnline(u)  { return (Date.now() - lastPoll(u)) < 8_000; }

// ════════════════════════════════════════════════════════════════════════════
//  LOGS & STATS
// ════════════════════════════════════════════════════════════════════════════

function pushLog(entry) {
  try {
    let l = readJson(LOG_FILE, []);
    l.unshift({ ...entry, ts: Date.now() });
    if (l.length > MAX_LOG_ENTRIES) l = l.slice(0, MAX_LOG_ENTRIES);
    writeJson(LOG_FILE, l);
  } catch (_) {}
}

function pushHist(entry) {
  try {
    let h = readJson(HIST_FILE, []);
    h.unshift({ ...entry, ts: Date.now() });
    if (h.length > MAX_HIST_ENTRIES) h = h.slice(0, MAX_HIST_ENTRIES);
    writeJson(HIST_FILE, h);
  } catch (_) {}
}

function pushUserHistory(u, action, details) {
  try {
    let h = readJson(userHistFile(u), []);
    h.unshift({ action, details: sanStr(details || '', 100), ts: Date.now() });
    if (h.length > MAX_USER_HIST) h = h.slice(0, MAX_USER_HIST);
    writeJson(userHistFile(u), h);
  } catch (_) {}
}

function getUserHistory(u, limit = 50) {
  return readJson(userHistFile(u), []).slice(0, sanInt(limit, 50, 1, MAX_USER_HIST));
}

function getGlobalStats() {
  return readJson(STATS_FILE, {
    totalCommands:  0,
    totalUsers:     0,
    startedAt:      Date.now(),
    userStats:      {},
    popularActions: {},
  });
}

function bumpStats(user, action) {
  try {
    const s = getGlobalStats();
    s.totalCommands   = (s.totalCommands  || 0) + 1;
    s.userStats       = s.userStats       || {};
    s.popularActions  = s.popularActions  || {};

    if (!s.userStats[user]) {
      s.userStats[user] = { commands: 0, firstSeen: Date.now(), lastSeen: Date.now() };
      s.totalUsers      = Object.keys(s.userStats).length;
    }
    const u    = s.userStats[user];
    u.commands = (u.commands || 0) + 1;
    u.lastSeen = Date.now();
    u.lastAction = sanStr(action || 'unknown', 50);

    const act = sanStr(action || 'unknown', 50);
    s.popularActions[act] = (s.popularActions[act] || 0) + 1;

    writeJson(STATS_FILE, s);
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════════════
//  LOG SERVICE (per-user plugin logs)
// ════════════════════════════════════════════════════════════════════════════

function saveLogSvc(u, logs) {
  try {
    const existing = readJson(logSvcFile(u), []);
    writeJson(logSvcFile(u), [...sanArr(logs, 100), ...existing].slice(0, MAX_LOGSVC_ENTRIES));
  } catch (_) {}
}

function getLogSvc(u) { return readJson(logSvcFile(u), []); }

// ════════════════════════════════════════════════════════════════════════════
//  OUTPUT (plugin stdout captures)
// ════════════════════════════════════════════════════════════════════════════

function saveOutput(u, arr) {
  writeJson(outFile(u), { outputs: sanArr(arr, 200), ts: Date.now() });
}
function getOutputData(u) { return readJson(outFile(u), { outputs: [] }); }

// ════════════════════════════════════════════════════════════════════════════
//  DATA STORE HELPERS (plugin → server callbacks)
// ════════════════════════════════════════════════════════════════════════════

const withTs  = d => ({ ...d, _ts: Date.now() });

const saveScriptContent = (u, d) => writeJson(scriptFile(u),       withTs(d));
const getScriptContent  = u      => readJson(scriptFile(u));
const saveScriptList    = (u, d) => writeJson(scriptListFile(u),   withTs(d));
const getScriptList     = u      => readJson(scriptListFile(u));
const saveScriptLines   = (u, d) => writeJson(scriptLinesFile(u),  withTs(d));
const getScriptLines    = u      => readJson(scriptLinesFile(u));
const saveSearch        = (u, d) => writeJson(searchFile(u),       withTs(d));
const getSearch         = u      => readJson(searchFile(u));
const saveGameScan      = (u, d) => writeJson(gameScanFile(u),     withTs(d));
const getGameScan       = u      => readJson(gameScanFile(u));
const saveDescendants   = (u, d) => writeJson(descendantsFile(u),  withTs(d));
const getDescendants    = u      => readJson(descendantsFile(u));
const saveProperties    = (u, d) => writeJson(propertiesFile(u),   withTs(d));
const getProperties     = u      => readJson(propertiesFile(u));
const saveActionList    = (u, d) => writeJson(actionListFile(u),   withTs(d));
const getActionList     = u      => readJson(actionListFile(u));
const saveAssetLib      = (u, d) => writeJson(assetLibFile(u),     withTs(d));
const getAssetLib       = u      => readJson(assetLibFile(u));
const saveAssetId       = (u, d) => writeJson(assetIdFile(u),      withTs(d));
const getAssetId        = u      => readJson(assetIdFile(u));
const saveAssetFolder   = (u, d) => writeJson(assetFolderFile(u),  withTs(d));
const getAssetFolder    = u      => readJson(assetFolderFile(u));
const saveThemeData     = (u, d) => writeJson(themeDataFile(u),    withTs(d));
const getThemeData      = u      => readJson(themeDataFile(u));
const saveThemesList    = (u, d) => writeJson(themesListFile(u),   withTs(d));
const getThemesList     = u      => readJson(themesListFile(u));
const saveThemeApplied  = (u, d) => writeJson(themeAppliedFile(u), withTs(d));
const getThemeApplied   = u      => readJson(themeAppliedFile(u));
const saveThemeCompare  = (u, d) => writeJson(themeCompareFile(u), withTs(d));
const getThemeCompare   = u      => readJson(themeCompareFile(u));
const saveModuleList    = (u, d) => writeJson(moduleListFile(u),   withTs(d));
const getModuleList     = u      => readJson(moduleListFile(u));
const saveModuleDeploy  = (u, d) => writeJson(moduleDeployFile(u), withTs(d));
const getModuleDeploy   = u      => readJson(moduleDeployFile(u));
const saveTerrainResult = (u, d) => writeJson(terrainFile(u),      withTs(d));
const getTerrainResult  = u      => readJson(terrainFile(u));

function saveMention(u, d) {
  let l = readJson(mentionFile(u), []);
  l.unshift(withTs(d));
  if (l.length > MAX_MENTION_ENTRIES) l = l.slice(0, MAX_MENTION_ENTRIES);
  writeJson(mentionFile(u), l);
}
function getMentions(u) { return readJson(mentionFile(u), []); }

function saveProject(u, d) {
  writeJson(projectFile(u), {
    projectId:   sanStr(d.projectId   || '', 100),
    projectName: sanStr(d.projectName || '', 100),
    placeId:     sanStr(d.placeId     || '', 50),
    updatedAt:   Date.now(),
  });
}
function getProject(u) {
  return readJson(projectFile(u), { projectId: '', projectName: '', placeId: '', updatedAt: 0 });
}

// ════════════════════════════════════════════════════════════════════════════
//  WEBHOOK
// ════════════════════════════════════════════════════════════════════════════

function saveWebhook(u, url) {
  if (!url) { try { unlinkSync(webhookFile(u)); } catch (_) {} return; }
  writeJson(webhookFile(u), { url: sanStr(String(url), 300), updatedAt: Date.now() });
}
function getWebhook(u) { return readJson(webhookFile(u), null); }

/** Fire-and-forget webhook dispatch. Only sends to HTTPS targets. */
async function dispatchWebhook(u, event, data) {
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

// ════════════════════════════════════════════════════════════════════════════
//  STALE FILE CLEANUP
// ════════════════════════════════════════════════════════════════════════════

/**
 * Remove NEXUS temp files older than maxAgeMs.
 * @returns {number} Number of files removed.
 */
function cleanStaleFiles(maxAgeMs = 3 * 60 * 60 * 1_000) {
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

// ════════════════════════════════════════════════════════════════════════════
//  SAFE FETCH (with timeout + retries)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Fetch with timeout and automatic retries on transient errors.
 * Respects Retry-After on 429 responses.
 */
async function safeFetch(url, options = {}, timeoutMs = 10_000, maxRetries = 2) {
  let lastError = null;

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
      lastError = err;
      if (err?.name === 'AbortError') break;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1_000 * (attempt + 1)));
    }
  }

  throw lastError || new Error('safeFetch: all retries failed');
}

// ════════════════════════════════════════════════════════════════════════════
//  ROBLOX API HELPERS
// ════════════════════════════════════════════════════════════════════════════

function getRobloxApiKey() {
  const key = process.env.ROBLOX_OPEN_CLOUD_KEY || '';
  return key.length >= 20 ? key : null;
}

// ── Toolbox Search ────────────────────────────────────────────────────────────

const VALID_TOOLBOX_TYPES = new Set([
  'Model', 'Plugin', 'Audio', 'Decal', 'Image',
  'MeshPart', 'Package', 'Hat', 'Shirt', 'Pants', 'TShirt', 'Gear',
]);

/**
 * Search the Roblox Toolbox for public assets.
 * Results are cached for TTL_TOOLBOX ms.
 */
async function robloxToolboxSearch(keyword, assetType = 'Model', limit = 10, cursor = null) {
  const cacheKey = `toolbox:${keyword}:${assetType}:${limit}:${cursor || ''}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  const apiKey = getRobloxApiKey();
  if (!apiKey) {
    throw Object.assign(
      new Error('ROBLOX_OPEN_CLOUD_KEY is not configured on the server.'),
      { code: 503 }
    );
  }

  const safeType  = VALID_TOOLBOX_TYPES.has(assetType) ? assetType : 'Model';
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const params    = new URLSearchParams({
    keyword:   String(keyword).substring(0, 100),
    assetType: safeType,
    limit:     String(safeLimit),
    ...(cursor ? { cursor } : {}),
  });

  let resp;
  try {
    resp = await safeFetch(
      `https://apis.roblox.com/toolbox-service/v2/assets:search?${params}`,
      {
        method:  'GET',
        headers: { 'x-api-key': apiKey, Accept: 'application/json', 'User-Agent': `NexusAI/${WEB_VERSION}` },
      },
      12_000, 2
    );
  } catch (err) {
    throw Object.assign(
      new Error(`Roblox Toolbox connection failed: ${err?.message || 'timeout'}`),
      { code: 502 }
    );
  }

  if (resp.status === 401 || resp.status === 403)
    throw Object.assign(new Error('Invalid API key — check ROBLOX_OPEN_CLOUD_KEY.'), { code: resp.status });
  if (resp.status === 429)
    throw Object.assign(new Error('Roblox Toolbox rate limit reached. Try again later.'), { code: 429 });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw Object.assign(new Error(`Roblox Toolbox HTTP ${resp.status}: ${sanStr(body, 80)}`), { code: resp.status });
  }

  let data;
  try { data = await resp.json(); }
  catch (_) { throw Object.assign(new Error('Non-JSON response from Roblox Toolbox.'), { code: 502 }); }

  const rawItems = data.data || data.assets || data.results || [];
  const assets   = rawItems.map(item => ({
    assetId:     String(item.assetId  || item.id || ''),
    name:        sanStr(item.name     || item.assetName    || 'Untitled', 120),
    description: sanStr(item.description || '', 250),
    assetType:   sanStr(item.assetType   || safeType, 30),
    creator: {
      name:   sanStr(item.creator?.name || item.creatorName || 'Unknown', 80),
      type:   sanStr(item.creator?.type || 'User', 20),
      userId: String(item.creator?.userId || item.creatorTargetId || ''),
    },
    thumbnail: sanStr(item.thumbnail?.url || item.thumbnailUrl || '', 300),
    updated:   item.updated || item.createdUtc || null,
  })).filter(a => a.assetId);

  const result = {
    assets,
    nextCursor: data.nextPageCursor || null,
    total:      data.totalCount     || assets.length,
  };
  cacheSet(cacheKey, result, TTL_TOOLBOX);
  return result;
}

// ── Asset Validation ──────────────────────────────────────────────────────────

const INSERTABLE_ASSET_TYPES = new Set([
  'Model', 'Plugin', 'Package', 'Hat', 'Shirt', 'Pants',
  'TShirt', 'Gear', 'Animation', 'MeshPart', 'Unknown',
]);

/** Build a Luau snippet that loads an asset into Workspace. */
function buildInsertScript(assetId, assetName) {
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

/**
 * Validate an asset ID and return its metadata.
 * Falls back gracefully when catalog APIs are unavailable.
 */
async function validateAsset(assetId) {
  const id = parseInt(String(assetId).replace(/\D/g, ''), 10);
  if (!id || id <= 0 || id > 99_999_999_999)
    throw Object.assign(new Error(`Invalid asset ID: "${sanStr(String(assetId), 30)}"`), { code: 400 });

  const cacheKey = `asset:${id}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  let assetData = null;
  for (const url of [
    `https://catalog.roblox.com/v1/catalog/items/${id}/details`,
    `https://economy.roblox.com/v2/assets/${id}/details`,
  ]) {
    try {
      const r = await safeFetch(url, { headers: { Accept: 'application/json' } }, 8_000, 1);
      if (r.ok) { assetData = await r.json(); break; }
    } catch (_) {}
  }

  // Last-resort: check asset delivery endpoint (just confirms the asset exists).
  if (!assetData) {
    try {
      const r = await safeFetch(
        `https://assetdelivery.roblox.com/v1/asset/?id=${id}`,
        { headers: { Accept: 'application/json' } }, 8_000, 1
      );
      if (r.ok || r.status === 302)
        assetData = { name: `Asset #${id}`, assetType: 'Model', creator: {} };
    } catch (_) {}
  }

  if (!assetData) {
    const result = {
      valid: true, assetId: String(id), name: `Asset #${id}`,
      assetType: 'Unknown', creator: { name: 'Unknown', type: 'User' },
      isPublic: true, unverified: true, insertable: true,
      insertScript: buildInsertScript(id, `Asset #${id}`),
    };
    cacheSet(cacheKey, result, TTL_ASSET / 4);
    return result;
  }

  const rawType   = sanStr(assetData.assetType || assetData.itemType || 'Model', 30);
  const assetName = sanStr(assetData.name || `Asset #${id}`, 120);
  const isPublic  = !(assetData.sales === 0 && assetData.isForSale === false);

  const result = {
    valid:        true,
    assetId:      String(id),
    name:         assetName,
    description:  sanStr(assetData.description || '', 250),
    assetType:    rawType,
    creator: {
      name:   sanStr(assetData.creator?.name               || 'Unknown', 80),
      type:   sanStr(assetData.creator?.creatorType        || 'User',    20),
      userId: String(assetData.creator?.creatorTargetId    || ''),
    },
    isPublic,
    insertable:   INSERTABLE_ASSET_TYPES.has(rawType),
    insertScript: buildInsertScript(id, assetName),
  };
  cacheSet(cacheKey, result, TTL_ASSET);
  return result;
}

// ── Roblox User Info ──────────────────────────────────────────────────────────

/** Fetch Roblox user info by userId, with caching. */
async function fetchUserInfo(userId) {
  const id = parseInt(String(userId).replace(/\D/g, ''), 10);
  if (!id || id <= 0) throw new Error('Invalid userId.');

  const cacheKey = `userinfo:${id}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  const resp = await safeFetch(
    `https://users.roblox.com/v1/users/${id}`,
    { headers: { Accept: 'application/json' } },
    8_000, 1
  );
  if (!resp.ok) throw new Error(`Roblox Users API error: HTTP ${resp.status}`);

  const d      = await resp.json();
  const result = {
    userId:      id,
    username:    sanStr(d.name        || '', 80),
    displayName: sanStr(d.displayName || d.name || '', 80),
    description: sanStr(d.description || '', 300),
    isBanned:    d.isBanned  || false,
    created:     d.created   || null,
    avatarUrl:   `https://www.roblox.com/headshot-thumbnail/image?userId=${id}&width=150&height=150&format=png`,
  };
  cacheSet(cacheKey, result, TTL_USER_INFO);
  return result;
}

// ── Roblox Game Info ──────────────────────────────────────────────────────────

/** Fetch Roblox game info by universeId or placeId, with caching. */
async function fetchGameInfo(id, isPlaceId = false) {
  const parsed = parseInt(String(id).replace(/\D/g, ''), 10);
  if (!parsed || parsed <= 0) throw new Error('Invalid universeId / placeId.');

  const cacheKey = `gameinfo:${parsed}:${isPlaceId}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  let universeId = parsed;
  if (isPlaceId) {
    try {
      const r = await safeFetch(
        `https://apis.roblox.com/universes/v1/places/${parsed}/universe`,
        { headers: { Accept: 'application/json' } }, 8_000, 1
      );
      if (r.ok) universeId = (await r.json()).universeId || parsed;
    } catch (_) {}
  }

  const resp = await safeFetch(
    `https://games.roblox.com/v1/games?universeIds=${universeId}`,
    { headers: { Accept: 'application/json' } }, 8_000, 1
  );
  if (!resp.ok) throw new Error(`Roblox Games API error: HTTP ${resp.status}`);

  const d    = await resp.json();
  const game = (d.data || [])[0];
  if (!game) throw new Error('Game not found.');

  const result = {
    universeId,
    placeId:        game.rootPlaceId || parsed,
    name:           sanStr(game.name        || '', 120),
    description:    sanStr(game.description || '', 500),
    creator: {
      name: sanStr(game.creator?.name || '', 80),
      type: sanStr(game.creator?.type || 'User', 20),
    },
    playing:        game.playing        || 0,
    visits:         game.visits         || 0,
    maxPlayers:     game.maxPlayers     || 0,
    favoritedCount: game.favoritedCount || 0,
    genre:          sanStr(game.genre   || '', 30),
    thumbnailUrl:   `https://www.roblox.com/asset-thumbnail/image?assetId=${game.rootPlaceId || parsed}&width=768&height=432&format=png`,
  };
  cacheSet(cacheKey, result, TTL_GAME_INFO);
  return result;
}

// ── Luau Documentation Search ─────────────────────────────────────────────────

/**
 * Search Roblox/Luau documentation.
 * Tries the official Creator Docs API first, falls back to a local index.
 */
async function searchDocs(query, docType = 'all', limit = 5) {
  const q      = sanStr(query, 150).trim();
  const maxRes = Math.min(Math.max(1, limit), 20);
  if (!q) throw new Error('Query cannot be empty.');

  const cacheKey = `docs:${q}:${docType}:${limit}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  // Attempt the official API.
  try {
    const params = new URLSearchParams({
      query:  q,
      type:   docType === 'all' ? '' : docType,
      limit:  String(maxRes),
      locale: 'en-us',
    });
    const resp = await safeFetch(
      `https://create.roblox.com/api/search/docs?${params}`,
      { headers: { Accept: 'application/json', 'User-Agent': `NexusAI/${WEB_VERSION}` } },
      8_000, 1
    );
    if (resp.ok) {
      const data = await resp.json();
      const raw  = data.results || data.data || [];
      if (raw.length > 0) {
        const result = {
          results: raw.slice(0, maxRes).map(r => ({
            title:    sanStr(r.title    || r.name        || 'No Title',   120),
            url:      sanStr(r.url      || r.path        || '',           300),
            snippet:  sanStr(r.snippet  || r.excerpt     || r.description || '', 300),
            category: sanStr(r.category || r.type        || 'docs',        50),
          })),
          source: 'roblox_creator_docs',
          query:  q,
        };
        cacheSet(cacheKey, result, 10 * 60_000);
        return result;
      }
    }
  } catch (_) {}

  // Local fallback index.
  const index  = getLocalDocsIndex();
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);

  const scored = index
    .map(entry => {
      let score = 0;
      const haystack = `${entry.title} ${entry.keywords}`.toLowerCase();
      for (const t of tokens) {
        if (haystack.includes(t))                        score += t.length;
        if (entry.title.toLowerCase().startsWith(t))     score += 10;
        if (entry.title.toLowerCase() === t)             score += 20;
      }
      return { ...entry, score };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRes);

  if (scored.length === 0) {
    return {
      results: [{
        title:    'Roblox Creator Documentation',
        url:      'https://create.roblox.com/docs',
        snippet:  `No local results found for "${q}". Visit the docs directly.`,
        category: 'fallback',
      }],
      source: 'local_fallback',
      query:  q,
    };
  }

  const result = {
    results: scored.map(({ score: _s, keywords: _k, ...rest }) => rest),
    source:  'local_index',
    query:   q,
  };
  cacheSet(cacheKey, result, 60 * 60_000);
  return result;
}

/** Static local documentation index (used as offline fallback). */
function getLocalDocsIndex() {
  return [
    { title: 'Instance',                 url: 'https://create.roblox.com/docs/reference/engine/classes/Instance',          snippet: 'Base class. FindFirstChild, WaitForChild, Destroy, Clone, GetChildren, GetDescendants.',           category: 'api',   keywords: 'instance object findfirstchild waitforchild destroy clone parent classname isa' },
    { title: 'Workspace',                url: 'https://create.roblox.com/docs/reference/engine/classes/Workspace',         snippet: 'Primary 3D container. Gravity, CurrentCamera.',                                                    category: 'api',   keywords: 'workspace gravity camera service 3d game world' },
    { title: 'BasePart / Part',          url: 'https://create.roblox.com/docs/reference/engine/classes/BasePart',          snippet: 'Physical part. Size, Position, CFrame, Anchored, CanCollide, Material, Transparency.',             category: 'api',   keywords: 'part size position cframe anchored material transparency brickcolor mesh union' },
    { title: 'CFrame',                   url: 'https://create.roblox.com/docs/reference/engine/datatypes/CFrame',          snippet: 'Position + rotation matrix. CFrame.new(x,y,z), Angles, lookAt.',                                    category: 'api',   keywords: 'cframe position rotation matrix lookvector angles lookat right up transform' },
    { title: 'Vector3',                  url: 'https://create.roblox.com/docs/reference/engine/datatypes/Vector3',         snippet: 'Vector3.new(x,y,z). Magnitude, Unit, Lerp, Dot, Cross.',                                           category: 'api',   keywords: 'vector3 xyz magnitude unit lerp dot cross math direction' },
    { title: 'Color3',                   url: 'https://create.roblox.com/docs/reference/engine/datatypes/Color3',          snippet: 'Color3.new(r,g,b) or fromRGB(r,g,b). Values 0–1.',                                                  category: 'api',   keywords: 'color3 rgb fromrgb fromhsv colour' },
    { title: 'UDim2',                    url: 'https://create.roblox.com/docs/reference/engine/datatypes/UDim2',           snippet: 'GUI size/position. UDim2.new(scaleX, offsetX, scaleY, offsetY).',                                   category: 'api',   keywords: 'udim2 gui size position scale offset ui frame' },
    { title: 'Script / LocalScript',     url: 'https://create.roblox.com/docs/reference/engine/classes/Script',            snippet: 'Script: server. LocalScript: client. ModuleScript: shared via require().',                          category: 'api',   keywords: 'script localscript modulescript server client require enabled source' },
    { title: 'RemoteEvent',              url: 'https://create.roblox.com/docs/reference/engine/classes/RemoteEvent',       snippet: 'Server–client messaging. FireServer, FireClient, FireAllClients, OnServerEvent, OnClientEvent.',    category: 'api',   keywords: 'remoteevent onserverevent onclientevent fireserver fireclient fireallclients' },
    { title: 'BindableEvent',            url: 'https://create.roblox.com/docs/reference/engine/classes/BindableEvent',     snippet: 'Same-side script-to-script. Event:Fire(), Event.Event:Connect().',                                  category: 'api',   keywords: 'bindableevent fire event connect invoke callback internal' },
    { title: 'Players',                  url: 'https://create.roblox.com/docs/reference/engine/classes/Players',           snippet: 'PlayerAdded, PlayerRemoving, GetPlayers, LocalPlayer.',                                             category: 'api',   keywords: 'players playeradded playerremoving getplayers localplayer character' },
    { title: 'DataStoreService',         url: 'https://create.roblox.com/docs/reference/engine/classes/DataStoreService',  snippet: 'GetAsync, SetAsync, UpdateAsync, RemoveAsync. Always wrap with pcall.',                             category: 'api',   keywords: 'datastore getasync setasync updateasync removeasync save load persistent' },
    { title: 'TweenService',             url: 'https://create.roblox.com/docs/reference/engine/classes/TweenService',      snippet: 'Create(instance, TweenInfo, goals). Play, Pause, Cancel, Completed.',                              category: 'api',   keywords: 'tweenservice tween animation tweeninfo play pause cancel smooth easing' },
    { title: 'RunService',               url: 'https://create.roblox.com/docs/reference/engine/classes/RunService',        snippet: 'Heartbeat, RenderStepped, Stepped. IsServer, IsClient, IsStudio.',                                 category: 'api',   keywords: 'runservice heartbeat renderstepped stepped frame loop isserver isclient' },
    { title: 'UserInputService',         url: 'https://create.roblox.com/docs/reference/engine/classes/UserInputService',  snippet: 'InputBegan, InputEnded, IsKeyDown. LocalScript only.',                                              category: 'api',   keywords: 'userinputservice input keyboard mouse touch inputbegan keycode' },
    { title: 'CollectionService',        url: 'https://create.roblox.com/docs/reference/engine/classes/CollectionService', snippet: 'AddTag, RemoveTag, GetTagged, HasTag.',                                                             category: 'api',   keywords: 'collectionservice tag addtag removetag gettagged hastag modular' },
    { title: 'InsertService',            url: 'https://create.roblox.com/docs/reference/engine/classes/InsertService',     snippet: 'LoadAsset(assetId). Asset must be public. Always wrap with pcall.',                                category: 'api',   keywords: 'insertservice loadasset asset insert model pcall public' },
    { title: 'HttpService',              url: 'https://create.roblox.com/docs/reference/engine/classes/HttpService',       snippet: 'GetAsync, PostAsync, JSONEncode, JSONDecode. Enable in Game Settings.',                             category: 'api',   keywords: 'httpservice getasync postasync http json encode decode api webhook' },
    { title: 'ReplicatedStorage',        url: 'https://create.roblox.com/docs/reference/engine/classes/ReplicatedStorage', snippet: 'Accessible by server and client. ServerStorage: server only.',                                     category: 'api',   keywords: 'replicatedstorage serverstorage storage replicate module asset' },
    { title: 'MessagingService',         url: 'https://create.roblox.com/docs/reference/engine/classes/MessagingService',  snippet: 'PublishAsync, SubscribeAsync. Cross-server messaging.',                                             category: 'api',   keywords: 'messagingservice cross server publish subscribe topic broadcast' },
    { title: 'MarketplaceService',       url: 'https://create.roblox.com/docs/reference/engine/classes/MarketplaceService',snippet: 'PromptProductPurchase, UserOwnsGamePassAsync, GetProductInfo.',                                    category: 'api',   keywords: 'marketplaceservice purchase gamepass product prompt owns shop store' },
    { title: 'BadgeService',             url: 'https://create.roblox.com/docs/reference/engine/classes/BadgeService',      snippet: 'AwardBadge, UserHasBadgeAsync, GetBadgeInfoAsync.',                                                category: 'api',   keywords: 'badgeservice award badge hasbadge getbadgeinfo user' },
    { title: 'PhysicsService',           url: 'https://create.roblox.com/docs/reference/engine/classes/PhysicsService',    snippet: 'Collision groups. RegisterCollisionGroup, SetPartCollisionGroup.',                                 category: 'api',   keywords: 'physicsservice collision group register collidable part' },
    { title: 'Humanoid',                 url: 'https://create.roblox.com/docs/reference/engine/classes/Humanoid',          snippet: 'Health, WalkSpeed, JumpPower. TakeDamage, MoveTo, LoadAnimation. Died.',                           category: 'api',   keywords: 'humanoid health walkspeed jumpower takedamage moveto loadanimation npc' },
    { title: 'Terrain',                  url: 'https://create.roblox.com/docs/reference/engine/classes/Terrain',           snippet: 'FillBlock, FillBall, FillCylinder. ReplaceMaterial. Enum.Material.',                              category: 'api',   keywords: 'terrain fillblock fillball fillcylinder material grass water rock sand smooth' },
    { title: 'Lighting',                 url: 'https://create.roblox.com/docs/reference/engine/classes/Lighting',          snippet: 'Ambient, Brightness, ClockTime, FogEnd. Sky, Atmosphere, BloomEffect.',                            category: 'api',   keywords: 'lighting ambient brightness clock fog sky atmosphere bloom environment' },
    { title: 'ParticleEmitter',          url: 'https://create.roblox.com/docs/reference/engine/classes/ParticleEmitter',   snippet: 'Texture, Rate, Lifetime. Fire: Size, Heat. Smoke: Color, Density.',                               category: 'api',   keywords: 'particleemitter fire smoke sparkles trail beam particle vfx' },
    { title: 'Camera',                   url: 'https://create.roblox.com/docs/reference/engine/classes/Camera',            snippet: 'CameraType, CFrame, FieldOfView, ViewportSize. GetPartsObscuringTarget.',                         category: 'api',   keywords: 'camera cameratype cframe fov viewport scriptable custom follow' },
    { title: 'PathfindingService',       url: 'https://create.roblox.com/docs/reference/engine/classes/PathfindingService',snippet: 'CreatePath, ComputeAsync, GetWaypoints. AgentParameters.',                                        category: 'api',   keywords: 'pathfinding npc navigation ai moveto waypoints compute agent radius' },
    { title: 'SoundService / Sound',     url: 'https://create.roblox.com/docs/reference/engine/classes/SoundService',      snippet: 'PlayLocalSound, GetListener. Sound: Play, Stop, Pause, Volume.',                                  category: 'api',   keywords: 'soundservice sound audio music ambient reverb listener play stop' },
    { title: 'UICorner / UIStroke',      url: 'https://create.roblox.com/docs/reference/engine/classes/UICorner',          snippet: 'UICorner: rounded corners. UIStroke: border. UIPadding: margins. UIGradient.',                    category: 'api',   keywords: 'uicorner uistroke uipadding uigradient corner border margin gradient rounded' },
    { title: 'ContextActionService',     url: 'https://create.roblox.com/docs/reference/engine/classes/ContextActionService',snippet:'BindAction, UnbindAction. Mobile button support.',                                               category: 'api',   keywords: 'contextactionservice bindaction unbindaction mobile button input touch' },
    { title: 'task Library',             url: 'https://create.roblox.com/docs/reference/engine/libraries/task',            snippet: 'task.wait, task.spawn, task.delay, task.cancel. Preferred over wait().',                           category: 'guide', keywords: 'task wait spawn delay cancel coroutine thread async timing yield' },
    { title: 'Luau Type Checking',       url: 'https://create.roblox.com/docs/luau/types',                                 snippet: 'local x: number. Types: string, number, boolean, nil, any. typeof() for runtime.',                category: 'guide', keywords: 'luau type annotation number string boolean typeof inference' },
    { title: 'Metatables & OOP',         url: 'https://create.roblox.com/docs/luau/metatables',                            snippet: '__index, setmetatable. Class pattern. Inheritance.',                                               category: 'guide', keywords: 'metatable oop class object new inherit setmetatable module pattern' },
    { title: 'pcall & xpcall',           url: 'https://create.roblox.com/docs/luau/functions#pcall',                       snippet: 'pcall(fn, ...) → ok, result. Use for DataStore, HTTP, InsertService.',                            category: 'guide', keywords: 'pcall xpcall error handler try catch protection safe' },
    { title: 'Tables',                   url: 'https://create.roblox.com/docs/luau/tables',                                snippet: 'Array {1,2,3}. Dictionary {key="val"}. ipairs, pairs. table.insert/remove/sort.',                  category: 'guide', keywords: 'table array dictionary ipairs pairs insert remove find sort' },
    { title: 'String Library',           url: 'https://create.roblox.com/docs/luau/string',                                snippet: 'format, sub, find, match, gsub, split, upper, lower.',                                            category: 'guide', keywords: 'string format sub find match gsub split upper lower concat' },
    { title: 'Math Library',             url: 'https://create.roblox.com/docs/luau/math',                                  snippet: 'floor, ceil, round, abs, max, min, random, sqrt, sin, cos, pi, clamp.',                           category: 'guide', keywords: 'math floor ceil round abs max min random sqrt sin cos pi clamp' },
    { title: 'DataStore Best Practices', url: 'https://create.roblox.com/docs/cloud/open-cloud/data-store-api-handling',   snippet: 'Always pcall. UpdateAsync is safer than SetAsync. Retry with backoff. SessionLocking.',            category: 'guide', keywords: 'datastore best practice updateasync retry session lock save' },
    { title: 'Remote Events Security',   url: 'https://create.roblox.com/docs/scripting/events/remote',                   snippet: 'Always validate on the server. Never trust client data.',                                          category: 'guide', keywords: 'remote event security validate server client trust exploit' },
    { title: 'TweenInfo',                url: 'https://create.roblox.com/docs/reference/engine/datatypes/TweenInfo',       snippet: 'TweenInfo.new(Time, EasingStyle, EasingDirection, RepeatCount, Reverses, DelayTime).',            category: 'api',   keywords: 'tweeninfo time easingstyle easingdirection repeat reverses delay' },
    { title: 'Enum Reference',           url: 'https://create.roblox.com/docs/reference/engine/enums',                    snippet: 'Enum.Material, Enum.KeyCode, Enum.Font, Enum.SortOrder.',                                          category: 'api',   keywords: 'enum material keycode font sortorder alignment fill direction' },
    { title: 'Attributes API',           url: 'https://create.roblox.com/docs/scripting/attributes',                      snippet: 'SetAttribute, GetAttribute, GetAttributes, AttributeChanged.',                                    category: 'api',   keywords: 'attribute setattribute getattribute getattributes changed metadata' },
    { title: 'Signals & Connections',    url: 'https://create.roblox.com/docs/scripting/events/bindable',                 snippet: 'Connect, Once, Wait. Disconnect via connection:Disconnect().',                                    category: 'api',   keywords: 'signal event connect once wait disconnect rbxscriptconnection' },
    { title: 'MemoryStoreService',       url: 'https://create.roblox.com/docs/reference/engine/classes/MemoryStoreService',snippet:'Fast temporary store. SortedMap, Queue. Max TTL 45 days.',                                        category: 'api',   keywords: 'memorystoreservice fast cache temporary sorted map queue cross server' },
    { title: 'ProximityPrompt',          url: 'https://create.roblox.com/docs/reference/engine/classes/ProximityPrompt',  snippet: 'ActionText, HoldDuration, MaxActivationDistance. Triggered event.',                               category: 'api',   keywords: 'proximityprompt interact trigger hold distance action text' },
    { title: 'MemoryStoreService',       url: 'https://create.roblox.com/docs/reference/engine/classes/MemoryStoreService',snippet:'Fast cross-server temporary storage. SortedMap, Queue.',                                          category: 'api',   keywords: 'memorystoreservice fast cache sorted map queue cross server' },
    { title: 'ProfileService',           url: 'https://github.com/MadStudioRoblox/ProfileService',                        snippet: 'Popular DataStore library. LoadProfileAsync, session lock.',                                       category: 'guide', keywords: 'profileservice datastore library session lock save load popular' },
    { title: 'Knit Framework',           url: 'https://sleitnick.github.io/Knit/',                                        snippet: 'CreateService, CreateController. Automatic server/client communication.',                          category: 'guide', keywords: 'knit framework service controller roblox architecture module' },
  ];
}

// ════════════════════════════════════════════════════════════════════════════
//  AUTHORISATION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Authorise a command dispatch.
 * Non-admins may only target their own session; admin-only actions require a
 * valid admin token.
 * @returns {{ ok: boolean, status?: number, error?: string }}
 */
function authorizeCommand(req, senderUser, targetUser, action) {
  const isAdmin = verifyAdminToken(req);
  if (isAdmin) return { ok: true };

  if (senderUser !== targetUser)
    return { ok: false, status: 403, error: 'Forbidden: you may only target your own session.' };

  if (action && getAdminActions().has(action))
    return { ok: false, status: 403, error: `"${escapeHtml(action, 60)}" requires an admin token.` };

  // Optional session-token verification.
  const candidate =
    (req.headers?.['x-session-token'] || '').trim() ||
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

/**
 * Remove admin-only actions from a batch unless the caller is an admin.
 * @returns {{ safe: object[], removed: string[] }}
 */
function filterBatch(commands, isAdmin) {
  if (isAdmin) return { safe: commands, removed: [] };
  const adminActions = getAdminActions();
  const safe = [], removed = [];
  for (const cmd of sanArr(commands, 200)) {
    if (adminActions.has(cmd?.action)) removed.push(sanStr(cmd.action, 50));
    else safe.push(cmd);
  }
  return { safe, removed };
}

// ════════════════════════════════════════════════════════════════════════════
//  SECURITY HEADERS
// ════════════════════════════════════════════════════════════════════════════

function setSecurityHeaders(req, res) {
  const origin = req.headers?.['origin'] || '';
  res.setHeader('Access-Control-Allow-Origin',
    ALLOWED_ORIGINS.has(origin) ? origin : (origin ? 'null' : '*'));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Token, X-Session-Token, ' +
    'X-Nexus-Nonce, X-Roblox-Signature, X-Nexus-Signature');
  res.setHeader('Access-Control-Max-Age',   '86400');
  res.setHeader('X-Content-Type-Options',   'nosniff');
  res.setHeader('X-Frame-Options',          'DENY');
  res.setHeader('X-XSS-Protection',         '1; mode=block');
  res.setHeader('Referrer-Policy',          'strict-origin-when-cross-origin');
  res.setHeader('X-Nexus-Version',          WEB_VERSION);
  res.setHeader('X-Api-Version',            API_VERSION);
}

// ════════════════════════════════════════════════════════════════════════════
//  STANDARD RESPONSE HELPERS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Send a structured error response.
 * @param {object} res   - Express response object.
 * @param {number} code  - HTTP status code.
 * @param {string} error - Human-readable error message.
 * @param {object} extra - Additional fields to merge into the response body.
 */
function sendError(res, code, error, extra = {}) {
  return res.status(code).json({
    ok: false, status: 'error', error,
    web_version: WEB_VERSION, api_version: API_VERSION,
    ts: Date.now(), ...extra,
  });
}

/** Send a 429 rate-limit response. */
function sendRateLimit(res, retryAfter = 60) {
  return res.status(429).json({
    ok: false, status: 'error',
    error: 'Rate limit exceeded.',
    retryAfter, ts: Date.now(),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ════════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  try {
    setSecurityHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method === 'GET')     return await handleGet(req, res);
    if (req.method === 'POST')    return await handlePost(req, res);

    return sendError(res, 405, 'Method not allowed.', { allowed: ['GET', 'POST', 'OPTIONS'] });
  } catch (err) {
    console.error('[NEXUS v13] Unhandled error:', err?.message || err);
    try {
      return res.status(500).json({
        ok: false, status: 'error',
        error:   'Internal server error.',
        message: sanStr(String(err?.message || 'Unknown'), 200),
        web_version: WEB_VERSION, ts: Date.now(),
      });
    } catch (_) {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  GET HANDLER
// ════════════════════════════════════════════════════════════════════════════

async function handleGet(req, res) {
  const q = req.query || {};

  // ── Version ───────────────────────────────────────────────────────────────
  if (q.version === '1') {
    return res.status(200).json({
      ok:                      true,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      web_version:             WEB_VERSION,
      api_version:             API_VERSION,
      update_url:              'https://discord.gg/FzAF48mvK5',
      changelog:               `v13 — Action lists removed from server; plugin owns vocabulary. Cleaner API.`,
      security_model: {
        session_token:  'Plugin generates token on connect',
        self_only:      'Non-admin can only target own session',
        place_binding:  'Session locked to placeId',
        ip_rate_limit:  `${RATE_IP_PER_MIN}/min per IP`,
        user_rate_limit:`${RATE_USER_PER_MIN}/min per user`,
        burst_limit:    `${RATE_BURST_COUNT} commands per ${RATE_BURST_WINDOW}ms`,
        hmac:           'Optional X-Nexus-Signature HMAC-SHA256',
        cors:           'Strict origin whitelist',
        dedup:          `${DEDUP_WINDOW}ms window for destructive actions`,
      },
    });
  }

  // ── Health ────────────────────────────────────────────────────────────────
  if (q.health === '1') {
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
      dedupCacheSize:          dedupCache.size,
      popularActions: Object.entries(s.popularActions || {})
        .sort(([, a], [, b]) => b - a).slice(0, 10)
        .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {}),
      ts: Date.now(),
    });
  }

  // ── Roblox User Info ──────────────────────────────────────────────────────
  if (q.userinfo === '1') {
    const uid = parseInt(q.userId || '0', 10);
    if (!uid || uid <= 0 || uid > 9_999_999_999)
      return sendError(res, 400, 'Invalid userId.');
    try {
      const info = await fetchUserInfo(uid);
      return res.status(200).json({ ok: true, ...info });
    } catch (e) {
      return sendError(res, 502, sanStr(e?.message || 'Failed to fetch user info.', 100));
    }
  }

  // ── Roblox Game Info ──────────────────────────────────────────────────────
  if (q.gameinfo === '1') {
    const id = parseInt(q.id || '0', 10);
    if (!id) return sendError(res, 400, 'Parameter "id" is required.');
    try {
      const info = await fetchGameInfo(id, q.type === 'place');
      return res.status(200).json({ ok: true, ...info });
    } catch (e) {
      return sendError(res, 502, sanStr(e?.message || 'Failed to fetch game info.', 100));
    }
  }

  // ── Connection Check ──────────────────────────────────────────────────────
  if (q.check != null) {
    const u    = san(q.user || '');
    const s    = getGlobalStats();
    const sess = getSession(u);
    const qLen = getQueue(u).length + getPriorityQueue(u).length;
    return res.status(200).json({
      ok:                      true,
      connected:               isOnline(u),
      user:                    u,
      queueLength:             qLen,
      sessionStats:            getSessionStats(u),
      hasSession:              !!sess,
      placeId:                 sess?.placeId || null,
      userId:                  sess?.userId  || null,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      web_version:             WEB_VERSION,
      currentProject:          getProject(u),
      globalStats:             { totalCommands: s.totalCommands || 0, totalUsers: s.totalUsers || 0 },
    });
  }

  // ── Cache Control (admin only) ────────────────────────────────────────────
  if (q.clear_cache != null) {
    if (!verifyAdminToken(req)) return sendError(res, 401, 'Admin token required.');
    cacheClear(q.pattern || null);
    return res.status(200).json({ ok: true, message: 'Cache cleared.', pattern: q.pattern || null, ts: Date.now() });
  }

  // ── Stale File Cleanup (admin only) ───────────────────────────────────────
  if (q.cleanup === '1') {
    if (!verifyAdminToken(req)) return sendError(res, 401, 'Admin token required.');
    const maxAge = sanInt(q.max_age, 3 * 3600, 60, 86400) * 1_000;
    return res.status(200).json({ ok: true, cleaned: cleanStaleFiles(maxAge), ts: Date.now() });
  }

  const u = san(q.user || '');

  // ── Data Getters (all return consistent { ok, ...data } shape) ────────────
  const dataGetters = {
    get_project:      () => ({ ok: true, ...getProject(u) }),
    get_output:       () => ({ ok: true, ...getOutputData(u) }),
    get_workspace:    () => getGameScan(u) || readJson(wsFile(u)),
    get_script:       () => getScriptContent(u),
    get_script_list:  () => getScriptList(u),
    get_script_lines: () => getScriptLines(u),
    get_search:       () => getSearch(u),
    get_game_scan:    () => getGameScan(u),
    get_descendants:  () => getDescendants(u),
    get_properties:   () => getProperties(u),
    get_action_list:  () => getActionList(u),
    get_asset_lib:    () => getAssetLib(u),
    get_asset_id:     () => getAssetId(u),
    get_asset_folder: () => getAssetFolder(u),
    get_theme_data:   () => getThemeData(u),
    get_themes_list:  () => getThemesList(u),
    get_theme_applied:() => getThemeApplied(u),
    get_theme_compare:() => getThemeCompare(u),
    get_module_list:  () => getModuleList(u),
    get_module_deploy:() => getModuleDeploy(u),
    get_terrain:      () => getTerrainResult(u),
  };

  for (const [param, fn] of Object.entries(dataGetters)) {
    if (q[param] != null) {
      const d = fn();
      if (!d) return sendError(res, 404, `No data available for "${param}".`);
      return res.status(200).json({ ok: true, ...d });
    }
  }

  // ── Mentions ──────────────────────────────────────────────────────────────
  if (q.get_mentions != null) {
    const m = getMentions(u);
    return res.status(200).json({ ok: true, mentions: m, count: m.length });
  }

  // ── User Command History ──────────────────────────────────────────────────
  if (q.get_cmd_history != null) {
    const limit = sanInt(q.limit, 50, 1, MAX_USER_HIST);
    return res.status(200).json({ ok: true, history: getUserHistory(u, limit), user: u });
  }

  // ── Queue Stats ───────────────────────────────────────────────────────────
  if (q.queue_stats != null) {
    const nq = getQueue(u), pq = getPriorityQueue(u);
    return res.status(200).json({
      ok:            true,
      user:          u,
      normalQueue:   nq.length,
      priorityQueue: pq.length,
      total:         nq.length + pq.length,
      oldestMs:      nq[0]?._ts ? Date.now() - nq[0]._ts : null,
      pluginOnline:  isOnline(u),
    });
  }

  // ── Log Service ───────────────────────────────────────────────────────────
  if (q.get_logsvc != null) {
    let logs  = getLogSvc(u);
    const since = sanInt(q.since, 0, 0, Number.MAX_SAFE_INTEGER);
    if (since) logs = logs.filter(l => (l.ts || 0) > since);
    if (q.level) logs = logs.filter(l => l.level === q.level || l.type === q.level);
    return res.status(200).json({ ok: true, logs, count: logs.length });
  }

  // ── Admin: Logs, History, Stats ───────────────────────────────────────────
  if (q.get_logs != null) {
    if (!verifyAdminToken(req)) return sendError(res, 401, 'Admin token required.');
    let logs  = readJson(LOG_FILE, []);
    if (q.filter_user) logs = logs.filter(l => l.user === san(q.filter_user) || l.target === san(q.filter_user));
    const limit = sanInt(q.limit, 100, 1, MAX_LOG_ENTRIES);
    return res.status(200).json({ ok: true, logs: logs.slice(0, limit), count: logs.length });
  }

  if (q.get_history != null) {
    if (!verifyAdminToken(req)) return sendError(res, 401, 'Admin token required.');
    const hist  = readJson(HIST_FILE, []);
    const limit = sanInt(q.limit, 50, 1, MAX_HIST_ENTRIES);
    return res.status(200).json({ ok: true, history: hist.slice(0, limit), count: hist.length });
  }

  if (q.get_stats != null) {
    const s = getGlobalStats();
    return res.status(200).json({
      ok:             true,
      totalCommands:  s.totalCommands  || 0,
      totalUsers:     s.totalUsers     || 0,
      startedAt:      s.startedAt      || 0,
      uptime:         Date.now() - (s.startedAt || Date.now()),
      activeSessions: sessionStore.size,
      popularActions: Object.entries(s.popularActions || {})
        .sort(([, a], [, b]) => b - a).slice(0, 20)
        .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {}),
    });
  }

  if (q.clear_queue != null) {
    if (!verifyAdminToken(req)) return sendError(res, 401, 'Admin token required.');
    if (!u) return sendError(res, 400, '"user" parameter is required.');
    clearQueue(u);
    return res.status(200).json({ ok: true, message: 'Queue cleared.', user: u });
  }

  // ── Plugin Poll (default GET — no special query param) ────────────────────
  if (!u) return sendError(res, 400, '"user" parameter is required.');

  // Register or touch session.
  if (q.session_token) {
    const token   = sanStr(String(q.session_token), SESSION_TOKEN_MAX).trim();
    const placeId = q.place_id ? sanStr(String(q.place_id), 30) : null;
    const userId  = q.user_id  ? sanStr(String(q.user_id),  20) : null;
    if (token.length >= 16) setSession(u, token, placeId, userId);
  } else {
    touchSession(u);
  }

  bumpPoll(u);

  const queue = drainQueue(u);
  const proj  = getProject(u);

  return res.status(200).json({
    ok:    true,
    queue,
    count:         queue.length,
    priorityCount: queue.filter(c => c._priority === 'critical' || c._priority === 'high').length,
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

// ════════════════════════════════════════════════════════════════════════════
//  POST HANDLER
// ════════════════════════════════════════════════════════════════════════════

async function handlePost(req, res) {
  const body    = req.body || {};
  const ip      = getClientIp(req);
  const ratUser = san(body._user || body.user || 'anon');

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  if (!checkIpRateLimit(ip))    return sendRateLimit(res, 60);
  if (!checkRateLimit(ratUser)) return sendRateLimit(res, 60);
  if (!checkBurstLimit(ratUser))return sendRateLimit(res,  5);

  // ── HMAC Check ────────────────────────────────────────────────────────────
  if (!verifyPluginHmac(req, body))
    return sendError(res, 401, 'Invalid HMAC signature.', { hint: 'Check PLUGIN_HMAC_SECRET.' });

  const rawAction    = sanStr(body.action || body.type || '', 80);
  const resolvedUser = san(body._user || '');

  // ════════════════════════════════════════════════════════════════════════
  //  PLUGIN CALLBACKS — data arriving FROM the plugin
  // ════════════════════════════════════════════════════════════════════════

  const pluginCallbacks = {

    game_scan: () => {
      const d = { data: sanObj(body.data), ts: body.ts || Date.now(), user: resolvedUser };
      saveGameScan(resolvedUser, d);
      writeJson(wsFile(resolvedUser), withTs(d));
      return res.status(200).json({ ok: true, ts: d.ts });
    },

    workspace_data: () => {
      writeJson(wsFile(resolvedUser), withTs(body));
      return res.status(200).json({ ok: true });
    },

    output_data: () => {
      saveOutput(resolvedUser, sanArr(body.outputs));
      return res.status(200).json({ ok: true });
    },

    script_content: () => {
      saveScriptContent(resolvedUser, {
        name:       sanStr(body.name       || '', 100),
        parent:     sanStr(body.parent     || '', 100),
        fullPath:   sanStr(body.fullPath   || '', 200),
        scriptType: sanStr(body.scriptType || 'Script', 30),
        source:     String(body.source     || ''),
        lineCount:  sanInt(body.lineCount, 0, 0, 99_999),
        disabled:   !!body.disabled,
        updatedAt:  Date.now(),
      });
      pushLog({ action: 'script_read', user: resolvedUser, name: sanStr(body.name || '', 50) });
      return res.status(200).json({ ok: true, name: sanStr(body.name || '', 50) });
    },

    script_list: () => {
      saveScriptList(resolvedUser, {
        parent:  sanStr(body.parent || '', 100),
        scripts: sanArr(body.scripts),
        count:   sanInt(body.count,  0, 0, 99_999),
      });
      return res.status(200).json({ ok: true, count: sanInt(body.count, 0, 0, 99_999) });
    },

    script_lines: () => {
      saveScriptLines(resolvedUser, {
        name:      sanStr(body.name    || '', 100),
        lineStart: sanInt(body.lineStart, 1, 1, 99_999),
        lineEnd:   sanInt(body.lineEnd,   1, 1, 99_999),
        total:     sanInt(body.total,     0, 0, 99_999),
        content:   sanStrSafe(body.content || ''),
      });
      return res.status(200).json({ ok: true });
    },

    log_output: () => {
      const logs = sanArr(body.logs, 100);
      saveLogSvc(resolvedUser, logs);
      return res.status(200).json({ ok: true, received: logs.length });
    },

    mention_resolved: () => {
      saveMention(resolvedUser, {
        mention: sanStr(body.mention || '', 100),
        object:  sanObj(body.object),
      });
      return res.status(200).json({ ok: true });
    },

    search_result: () => {
      saveSearch(resolvedUser, {
        query:   sanStr(body.query   || '', 200),
        results: sanArr(body.results),
        count:   sanInt(body.count,   0, 0, 99_999),
      });
      return res.status(200).json({ ok: true, count: sanInt(body.count, 0, 0, 99_999) });
    },

    descendants: () => {
      saveDescendants(resolvedUser, {
        target:      sanStr(body.target || '', 100),
        descendants: sanArr(body.descendants),
        count:       sanInt(body.count,  0, 0, 99_999),
      });
      return res.status(200).json({ ok: true });
    },

    object_properties: () => {
      saveProperties(resolvedUser, {
        name:       sanStr(body.name || '', 100),
        properties: sanObj(body.properties),
      });
      return res.status(200).json({ ok: true });
    },

    action_list: () => {
      saveActionList(resolvedUser, {
        actions: sanArr(body.actions),
        count:   sanInt(body.count, 0, 0, 9_999),
      });
      return res.status(200).json({ ok: true });
    },

    asset_library: () => {
      saveAssetLib(resolvedUser, {
        category: sanStr(body.category || 'all', 50),
        data:     sanObj(body.data || body.summary),
      });
      return res.status(200).json({ ok: true });
    },

    assets_listed: () => {
      saveAssetLib(resolvedUser, {
        category: sanStr(body.category || 'all', 50),
        data:     sanObj(body.data || body.summary),
      });
      return res.status(200).json({ ok: true });
    },

    asset_id_result: () => {
      saveAssetId(resolvedUser, {
        category: sanStr(body.category || '', 50),
        sub:      sanStr(body.sub      || '', 50),
        name:     sanStr(body.name     || '', 100),
        id:       sanStr(body.id       || '', 100),
      });
      return res.status(200).json({ ok: true });
    },

    asset_folder_list: () => {
      saveAssetFolder(resolvedUser, {
        folder:   sanStr(body.folder || 'all', 50),
        contents: sanObj(body.contents),
      });
      return res.status(200).json({ ok: true });
    },

    theme_data: () => {
      saveThemeData(resolvedUser, {
        name:  sanStr(body.name  || body.theme || 'nexus_ai', 50),
        label: sanStr(body.label || '', 50),
        theme: sanObj(body.theme || body.data),
      });
      return res.status(200).json({ ok: true });
    },

    themes_list: () => {
      saveThemesList(resolvedUser, {
        themes: sanArr(body.themes),
        count:  sanInt(body.count, 0, 0, 999),
      });
      return res.status(200).json({ ok: true });
    },

    theme_list: () => {
      saveThemesList(resolvedUser, {
        themes: sanArr(body.themes),
        count:  sanInt(body.count, 0, 0, 999),
      });
      return res.status(200).json({ ok: true });
    },

    theme_applied: () => {
      saveThemeApplied(resolvedUser, {
        target: sanStr(body.target || '', 100),
        theme:  sanStr(body.theme  || '', 50),
        count:  sanInt(body.count,  0, 0, 9_999),
      });
      return res.status(200).json({ ok: true });
    },

    theme_compare: () => {
      saveThemeCompare(resolvedUser, {
        theme_a: sanObj(body.theme_a),
        theme_b: sanObj(body.theme_b),
      });
      return res.status(200).json({ ok: true });
    },

    module_deployed: () => {
      saveModuleDeploy(resolvedUser, {
        name:   sanStr(body.name   || '', 100),
        parent: sanStr(body.parent || '', 100),
        source: sanStr(body.source || '', 100),
      });
      return res.status(200).json({ ok: true });
    },

    modules_list: () => {
      saveModuleList(resolvedUser, {
        folder:  sanStr(body.folder || 'modulescripts', 100),
        modules: sanArr(body.modules),
        count:   sanInt(body.count, 0, 0, 999),
      });
      return res.status(200).json({ ok: true });
    },

    terrain_materials: () => {
      saveTerrainResult(resolvedUser, {
        materials: sanArr(body.materials),
        count:     sanInt(body.count, 0, 0, 999),
      });
      return res.status(200).json({ ok: true });
    },
  };

  if (pluginCallbacks[rawAction]) return pluginCallbacks[rawAction]();

  // ════════════════════════════════════════════════════════════════════════
  //  CONTROL ACTIONS
  // ════════════════════════════════════════════════════════════════════════

  // ── Reset Queue ───────────────────────────────────────────────────────────
  if (rawAction === 'reset') {
    const target = san(body._user || body.user || '');
    if (!target) return sendError(res, 400, '"user" is required.');
    const auth = authorizeCommand(req, ratUser, target, null);
    if (!auth.ok) return sendError(res, auth.status, auth.error);
    clearQueue(target);
    return res.status(200).json({ ok: true, message: 'Queue reset.', user: target });
  }

  // ── Status ────────────────────────────────────────────────────────────────
  if (rawAction === 'status') {
    const target = san(body._user || body.user || '');
    const sess   = getSession(target);
    const nq     = getQueue(target);
    const pq     = getPriorityQueue(target);
    return res.status(200).json({
      ok:                      true,
      connected:               isOnline(target),
      lastPoll:                lastPoll(target),
      queueLength:             nq.length + pq.length,
      priorityQueue:           pq.length,
      normalQueue:             nq.length,
      sessionStats:            getSessionStats(target),
      hasSession:              !!sess,
      placeId:                 sess?.placeId || null,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      web_version:             WEB_VERSION,
      currentProject:          getProject(target),
    });
  }

  // ── Set Project ───────────────────────────────────────────────────────────
  if (rawAction === 'set_project') {
    if (!resolvedUser) return sendError(res, 400, '"_user" is required.');
    const auth = authorizeCommand(req, ratUser, resolvedUser, 'set_project');
    if (!auth.ok) return sendError(res, auth.status, auth.error);

    const data = {
      projectId:   sanStr(body.projectId   || body.project_id   || '', 100),
      projectName: sanStr(body.projectName || body.project_name || '', 100),
      placeId:     sanStr(body.placeId     || body.place_id     || '', 50),
    };
    saveProject(resolvedUser, data);
    pushLog({ action: 'set_project', user: resolvedUser, ...data });
    return res.status(200).json({ ok: true, ...data });
  }

  // ── Set Webhook ───────────────────────────────────────────────────────────
  if (rawAction === 'set_webhook') {
    if (!resolvedUser) return sendError(res, 400, '"_user" is required.');
    const auth = authorizeCommand(req, ratUser, resolvedUser, null);
    if (!auth.ok) return sendError(res, auth.status, auth.error);

    const webhookUrl = body.url ? sanStr(String(body.url), 300) : null;
    if (webhookUrl && !webhookUrl.startsWith('https://'))
      return sendError(res, 400, 'Webhook URL must use HTTPS.');

    saveWebhook(resolvedUser, webhookUrl);
    return res.status(200).json({ ok: true, webhookSet: !!webhookUrl, user: resolvedUser });
  }

  // ── Multi-Target (admin only) ─────────────────────────────────────────────
  if (rawAction === 'multi_target' && Array.isArray(body.targets)) {
    if (!verifyAdminToken(req))
      return sendError(res, 401, 'Admin token required for multi_target.');

    const targets  = sanArr(body.targets, 20).map(t => san(String(t)));
    const cmd      = sanObj(body.command);
    const act      = sanAction(cmd.action);
    const priority = sanPriority(body.priority);

    if (!act) return sendError(res, 400, '"command.action" is required.');

    let pushed = 0;
    const results = {};
    for (const target of targets) {
      const sent = pushQueue(target, { ...cmd, action: act, _user: resolvedUser, _target_user: target }, priority);
      results[target] = { sent, online: isOnline(target) };
      if (sent) pushed++;
    }

    bumpStats(resolvedUser || 'admin', `multi:${act}`);
    return res.status(200).json({ ok: true, pushed, targets: results, ts: Date.now() });
  }

  // ── Admin Log Reads ───────────────────────────────────────────────────────
  if (rawAction === 'get_logs' || rawAction === 'get_history') {
    if (!verifyAdminToken(req)) return sendError(res, 401, 'Admin token required.');
    if (rawAction === 'get_logs') {
      const logs  = readJson(LOG_FILE, []);
      const limit = sanInt(body.limit, 100, 1, 300);
      return res.status(200).json({ ok: true, logs: logs.slice(0, limit) });
    }
    const hist  = readJson(HIST_FILE, []);
    const limit = sanInt(body.limit, 50, 1, 150);
    return res.status(200).json({ ok: true, history: hist.slice(0, limit) });
  }

  // ── Server-Side API: search_toolbox ──────────────────────────────────────
  if (rawAction === 'search_toolbox') {
    const sender    = san(body._user || '');
    const keyword   = sanStr(body.keyword || body.query || body.term || '', 100).trim();
    const assetType = sanStr(body.asset_type || body.assetType || 'Model', 30);
    const limit     = sanInt(body.limit || body.count, 10, 1, 50);
    const cursor    = body.cursor ? sanStr(String(body.cursor), 200) : null;

    if (!keyword) return sendError(res, 400, '"keyword" is required.');

    try {
      const result   = await robloxToolboxSearch(keyword, assetType, limit, cursor);
      const target   = san(body._target_user || sender);

      // Optionally relay results to the plugin's command queue.
      if (target && isOnline(target)) {
        pushQueue(target, {
          action:     'search_result_toolbox',
          keyword,
          assetType,
          assets:     result.assets.slice(0, 20),
          nextCursor: result.nextCursor,
          total:      result.total,
          _user:      sender,
        }, 'normal');
      }

      bumpStats(sender || 'web', 'search_toolbox');
      pushLog({ action: 'search_toolbox', user: sender || 'web', keyword: sanStr(keyword, 50), assetType, found: result.assets.length });

      return res.status(200).json({
        ok:             true,
        keyword,
        assetType,
        assets:         result.assets,
        nextCursor:     result.nextCursor,
        total:          result.total,
        count:          result.assets.length,
        pluginNotified: target ? isOnline(san(body._target_user || sender)) : false,
        ts:             Date.now(),
      });
    } catch (err) {
      const code = err?.code || 500;
      pushLog({ action: 'search_toolbox_error', user: body._user || 'web', error: sanStr(err?.message || '', 100) });
      return sendError(res, code === 400 ? 400 : code === 429 ? 429 : 502, sanStr(err?.message || 'Toolbox search failed.', 200));
    }
  }

  // ── Server-Side API: insert_model ─────────────────────────────────────────
  if (rawAction === 'insert_model') {
    const sender   = san(body._user || '');
    const target   = san(body._target_user || sender);
    const assetId  = body.asset_id || body.assetId || body.id || '';
    const parent   = sanStr(body.parent || body.parentPath || 'workspace', 100);
    const priority = sanPriority(body.priority);

    if (!assetId) return sendError(res, 400, '"asset_id" is required.');
    if (!target)  return sendError(res, 400, '"_user" is required.');

    const auth = authorizeCommand(req, sender, target, 'insert_rbx_model');
    if (!auth.ok) return sendError(res, auth.status, auth.error);

    try {
      const asset = await validateAsset(assetId);
      if (!asset.insertable && asset.assetType !== 'Unknown')
        return sendError(res, 400, `AssetType "${asset.assetType}" cannot be inserted into Workspace.`);

      pushQueue(target, {
        action:       'insert_rbx_model',
        asset_id:     asset.assetId,
        name:         asset.name,
        parent,
        insert_script: asset.insertScript,
        _user:        sender,
        _target_user: target,
      }, priority);

      bumpStats(sender || 'web', 'insert_model');
      pushLog({ action: 'insert_model', user: sender || 'web', target, assetId: asset.assetId, assetName: sanStr(asset.name, 50), parent });
      pushUserHistory(sender, 'insert_model', `${asset.name} (${asset.assetId})`);

      return res.status(200).json({
        ok:              true,
        assetId:         asset.assetId,
        name:            asset.name,
        description:     asset.description    || '',
        assetType:       asset.assetType,
        creator:         asset.creator,
        isPublic:        asset.isPublic,
        unverified:      asset.unverified     || false,
        insertable:      asset.insertable,
        insertScript:    asset.insertScript,
        parent,
        priority,
        pluginConnected: isOnline(target),
        queued:          true,
        queueLength:     getQueue(target).length,
        ts:              Date.now(),
      });
    } catch (err) {
      const code = err?.code || 500;
      pushLog({ action: 'insert_model_error', user: body._user || 'web', error: sanStr(err?.message || '', 100) });
      return sendError(res, code === 400 ? 400 : 502, sanStr(err?.message || 'Insert failed.', 200));
    }
  }

  // ── Server-Side API: search_docs ─────────────────────────────────────────
  if (rawAction === 'search_docs') {
    const sender  = san(body._user || '');
    const query   = sanStr(body.query || body.keyword || body.q || '', 150).trim();
    const docType = ['api', 'guide', 'all'].includes(body.doc_type) ? body.doc_type : 'all';
    const limit   = sanInt(body.limit, 5, 1, 20);

    if (!query) return sendError(res, 400, '"query" is required.');

    try {
      const result = await searchDocs(query, docType, limit);
      bumpStats(sender || 'web', 'search_docs');
      pushLog({ action: 'search_docs', user: sender || 'web', query: sanStr(query, 50), found: result.results.length, source: result.source });
      return res.status(200).json({
        ok:      true,
        query,
        docType,
        results: result.results,
        count:   result.results.length,
        source:  result.source,
        ts:      Date.now(),
      });
    } catch (err) {
      return sendError(res, 500, sanStr(err?.message || 'Docs search failed.', 200));
    }
  }

  // ── Server-Side API: get_game_info ────────────────────────────────────────
  if (rawAction === 'get_game_info') {
    const sender  = san(body._user || '');
    const isPlace = body.type === 'place' || !!body.place_id;
    const id      = parseInt(String(body.id || body.universe_id || body.place_id || '0').replace(/\D/g, ''), 10);
    if (!id) return sendError(res, 400, '"id" is required.');
    try {
      const info = await fetchGameInfo(id, isPlace);
      bumpStats(sender || 'web', 'get_game_info');
      return res.status(200).json({ ok: true, ...info, ts: Date.now() });
    } catch (err) {
      return sendError(res, 502, sanStr(err?.message || 'Failed to fetch game info.', 200));
    }
  }

  // ── Server-Side API: get_user_info / get_avatar_info ─────────────────────
  if (rawAction === 'get_user_info' || rawAction === 'get_avatar_info') {
    const sender = san(body._user || '');
    const userId = parseInt(String(body.user_id || body.userId || body.id || '0').replace(/\D/g, ''), 10);
    if (!userId) return sendError(res, 400, '"user_id" is required.');
    try {
      const info = await fetchUserInfo(userId);
      bumpStats(sender || 'web', rawAction);
      return res.status(200).json({ ok: true, ...info, ts: Date.now() });
    } catch (err) {
      return sendError(res, 502, sanStr(err?.message || 'Failed to fetch user info.', 200));
    }
  }

  // ── Server-Side API: validate_asset ──────────────────────────────────────
  if (rawAction === 'validate_asset') {
    const sender  = san(body._user || '');
    const assetId = body.asset_id || body.assetId || body.id || '';
    if (!assetId) return sendError(res, 400, '"asset_id" is required.');
    try {
      const asset = await validateAsset(assetId);
      bumpStats(sender || 'web', 'validate_asset');
      return res.status(200).json({ ok: true, ...asset, ts: Date.now() });
    } catch (err) {
      const code = err?.code || 500;
      return sendError(res, code === 400 ? 400 : 502, sanStr(err?.message || '', 200));
    }
  }

  // ── Batch Commands ────────────────────────────────────────────────────────
  if (rawAction === 'batch_commands') {
    const sender   = san(body._user || '');
    const target   = san(body.target || body._target_user || sender);
    const priority = sanPriority(body.priority);

    if (!target) return sendError(res, 400, '"target" is required.');

    let rawCommands = [];
    if (Array.isArray(body.commands))         rawCommands = body.commands;
    else if (typeof body.text === 'string')   rawCommands = extractCommandsFromText(body.text);

    const isAdmin = verifyAdminToken(req);
    if (!isAdmin && sender !== target)
      return sendError(res, 403, 'Forbidden: cannot target another user.');
    if (!isAdmin) {
      const auth = authorizeCommand(req, sender, target, null);
      if (!auth.ok) return sendError(res, auth.status, auth.error);
    }

    const { safe, removed } = filterBatch(rawCommands, isAdmin);
    let pushed = 0;
    const skipped = [...removed];

    for (const cmd of safe) {
      if (!cmd?.action) continue;
      const act = sanAction(cmd.action);
      if (!act) { skipped.push(String(cmd.action)); continue; }
      pushQueue(target, {
        ...cmd, action: act,
        _user:          String(body._user || 'web').substring(0, 50),
        _target_user:   target,
        _apiKey:        undefined,
      }, priority);
      pushed++;
    }

    bumpStats(sender || 'web', 'batch_commands');
    pushLog({ action: 'batch_commands', user: sender || 'web', target, count: pushed, skipped, priority });
    pushUserHistory(sender, 'batch_commands', `${pushed} commands → ${target}`);
    dispatchWebhook(sender, 'batch_commands', { pushed, target }).catch(() => {});

    return res.status(200).json({
      ok:              true,
      pushed,
      skipped,
      priority,
      warning:         removed.length > 0 ? `${removed.length} admin-only action(s) removed.` : undefined,
      pluginConnected: isOnline(target),
      queueLength:     getQueue(target).length,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      ts:              Date.now(),
    });
  }

  // ── Execute JSON / Text ───────────────────────────────────────────────────
  if (rawAction === 'execute_json' || rawAction === 'execute_text') {
    const sender   = san(body._user || '');
    const target   = san(body._target_user || sender);
    const priority = sanPriority(body.priority);

    if (!target) return sendError(res, 400, '"_target_user" is required.');

    const isAdmin = verifyAdminToken(req);
    if (!isAdmin && sender !== target)
      return sendError(res, 403, 'Forbidden: execute cannot target another user.');
    if (!isAdmin) {
      const auth = authorizeCommand(req, sender, target, null);
      if (!auth.ok) return sendError(res, auth.status, auth.error);
    }

    const inputText = body.text ||
      (Array.isArray(body.commands) ? JSON.stringify({ commands: body.commands }) : '');
    const extracted = extractCommandsFromText(String(inputText));
    const adminActions = getAdminActions();
    let pushed = 0;
    const skipped = [];

    for (const cmd of extracted) {
      if (!cmd?.action) continue;
      const act = sanAction(cmd.action);
      if (!act) { skipped.push(String(cmd.action)); continue; }
      if (!isAdmin && adminActions.has(act)) { skipped.push(`[admin-only] ${act}`); continue; }
      pushQueue(target, {
        ...cmd, action: act,
        _user:        String(body._user || 'web').substring(0, 50),
        _target_user: target,
        _apiKey:      undefined,
      }, priority);
      pushed++;
    }

    bumpStats(sender || 'web', 'execute_json');
    pushLog({ action: 'execute_json', user: sender || 'web', target, count: pushed, skipped });
    pushUserHistory(sender, 'execute_json', `${pushed} extracted commands`);

    return res.status(200).json({
      ok:              true,
      pushed,
      skipped,
      priority,
      pluginConnected: isOnline(target),
      queueLength:     getQueue(target).length,
      ts:              Date.now(),
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  GENERIC SINGLE-ACTION DISPATCH
  //  Any action name the plugin sends is accepted as-is (after sanitising).
  //  The plugin is the source of truth for valid action names.
  // ════════════════════════════════════════════════════════════════════════

  if (rawAction) {
    const act      = sanAction(rawAction);
    const priority = sanPriority(body.priority || body._priority);
    const sender   = san(body._user || '');
    const target   = san(body._target_user || sender);

    if (!act)    return sendError(res, 400, 'Action name could not be parsed.');
    if (!target) return sendError(res, 400, '"_target_user" or "_user" is required.');

    const auth = authorizeCommand(req, sender, target, act);
    if (!auth.ok) return sendError(res, auth.status, auth.error);

    pushQueue(target, {
      ...body,
      action:         act,
      _user:          String(body._user || 'web').substring(0, 50),
      _target_user:   target,
      // Strip sensitive fields before storing in the queue file.
      _apiKey:        undefined,
      _session_token: undefined,
      _place_id:      undefined,
    }, priority);

    bumpStats(sender || 'web', act);
    pushLog({ action: act, user: sender || 'web', target, name: sanStr(body.name || '', 50), parent: sanStr(body.parent || '', 50) });
    pushHist({ action: act, details: sanStr(body.name || JSON.stringify(body).substring(0, 80), 200), user: sender || 'web', target });
    pushUserHistory(sender, act, sanStr(body.name || '', 60));
    dispatchWebhook(sender, 'command_queued', { action: act, target }).catch(() => {});

    return res.status(200).json({
      ok:              true,
      action:          act,
      target,
      priority,
      pluginConnected: isOnline(target),
      queueLength:     getQueue(target).length + getPriorityQueue(target).length,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      api_version:     API_VERSION,
      ts:              Date.now(),
    });
  }

  // ── Unrecognised request ──────────────────────────────────────────────────
  return sendError(res, 400, 'Request not recognised. Include a valid "action" or query parameter.', {
    hint:        'POST with { action: "your_action", _user: "username", ... }',
    web_version: WEB_VERSION,
    api_version: API_VERSION,
  });
}