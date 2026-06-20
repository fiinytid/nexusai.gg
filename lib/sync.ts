// lib/sync.ts — NEXUS AI User Data Sync (TypeScript)

import type { SupabaseClient }                             from '@supabase/supabase-js';
import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route';
import { deleteUserInbox } from './inbox';
import { sanitizeStr, checkRateLimit }  from './_security';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Attachment {
  type: string;
  name?: string;
  mime?: string;
  [key: string]: unknown;
}

interface ConvMessage {
  content?:     string;
  attachments?: Attachment[];
  _rawContent?: unknown;
  [key: string]: unknown;
}

interface Conversation {
  id?:        string;
  projectId?: string | null;
  msgs?:      ConvMessage[];
  [key: string]: unknown;
}

interface Project {
  id:        string;
  name:      string;
  createdAt: string;
  [key: string]: unknown;
}

interface LastPayment {
  amount:        number;
  transactionId: string;
  ts:            number;
}

interface UserData {
  credits?:     number;
  plan?:        string;
  roles?:       string[];
  banned?:      boolean;
  banReason?:   string | null;
  bannedAt?:    number;
  unbannedAt?:  number;
  robloxId?:    string;
  googleEmail?: string;
  convs?:       Conversation[];
  allConvs?:    Conversation[];
  projects?:    Project[];
  lastPayment?: LastPayment;
  draftAttach?: unknown;
  _created?:    number;
  _updated?:    number;
  [key: string]: unknown;
}

interface SbState {
  client:      SupabaseClient | null;
  ready:       boolean;
  error:       string | null;
  nextRetry:   number;
  envSnapshot: string;
  initPromise: Promise<SupabaseClient | null> | null;
}

interface KvClient {
  get:     (key: string) => Promise<unknown>;
  set:     (key: string, value: unknown, opts?: { ex?: number }) => Promise<unknown>;
  del?:    (key: string) => Promise<unknown>;
  delete?: (key: string) => Promise<unknown>;
}

interface KvState {
  client:      KvClient | null;
  ready:       boolean;
  error:       string | null;
  nextRetry:   number;
  envSnapshot: string;
}

interface IdEntry {
  id:   string;
  name: string | null;
}

interface AdminUpdateBody {
  target?:        string;
  amount?:        unknown;
  transactionId?: unknown;
  plan?:          string;
  reason?:        string;
  // ── deduct-credits fields ──
  cost?:          unknown;
  requestId?:     unknown;
  [key: string]:  unknown;
}

interface PostBody {
  user?:      unknown;
  robloxId?:  unknown;
  data?:      unknown;
  action?:    string;
  [key: string]: unknown;
}

// ─── Raw Supabase response shapes ─────────────────────────────────────────

interface SbRowGet {
  data:  { data: UserData } | null;
  error: unknown;
}

interface SbRowWrite {
  error: unknown;
}

interface SbRowList {
  data:  { username: string; data: UserData }[] | null;
  error: unknown;
}

interface SbRowAny {
  data:  unknown;
  error: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const TABLE             = 'nexus_users' as const;
const TIMEOUT_OP        = 8_000;
const MAX_RETRY         = 3;
const KV_PREFIX         = 'nexusai:'   as const;
const KV_TTL            = 60 * 60 * 24 * 365 * 2;
const MAX_PAYLOAD       = 900 * 1024;
const SB_RETRY_COOLDOWN = 30_000;
const KV_RETRY_COOLDOWN = 60_000;

// Credit safety bounds — prevents corrupt/negative/absurd values from ever
// being persisted, regardless of where the number came from.
const MIN_CREDITS  = 0;
const MAX_CREDITS  = 1_000_000;
const DEFAULT_NEW_USER_CREDITS = 30;

// Bounds for a single deduction request — prevents a single malformed or
// malicious "deduct-credits" call from draining/corrupting a balance.
const MIN_DEDUCT_COST = 0;
const MAX_DEDUCT_COST = 1_000;

// How long a given requestId is remembered for idempotency purposes (so a
// retried network request never double-charges the same AI response).
const DEDUCT_DEDUPE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, rej) =>
      setTimeout(
        () => rej(new Error(`[timeout] "${label}" exceeded ${ms}ms`)),
        ms,
      )
    ),
  ]);
}

function normalizeKey(key: unknown): string {
  return String(key ?? '').toLowerCase().trim();
}

function makeEnvSnap(...vars: (string | undefined)[]): string {
  return vars.map(v => v ?? '').join('|');
}

// Clamp + validate a credits value. Returns `fallback` if the input is not
// a finite, usable number.
function safeCredits(value: unknown, fallback: number): number {
  const n = parseFloat(String(value));
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return Math.min(MAX_CREDITS, Math.max(MIN_CREDITS, parseFloat(n.toFixed(4))));
}

// Clamp + validate a single deduction "cost" value. Returns `null` if the
// input is not a usable positive number within bounds.
function safeDeductCost(value: unknown): number | null {
  const n = parseFloat(String(value));
  if (!Number.isFinite(n) || Number.isNaN(n)) return null;
  if (n <= MIN_DEDUCT_COST || n > MAX_DEDUCT_COST) return null;
  return parseFloat(n.toFixed(4));
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE — async lazy init (Promise-based lock, no double-init races)
// ═══════════════════════════════════════════════════════════════════════════

const _sb: SbState = {
  client:      null,
  ready:       false,
  error:       null,
  nextRetry:   0,
  envSnapshot: '',
  initPromise: null,
};

async function _doInitSB(): Promise<SupabaseClient | null> {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !url.startsWith('https://')) {
      throw new Error(
        'SUPABASE_URL is missing or invalid. ' +
        'Expected format: https://<project-id>.supabase.co',
      );
    }
    if (!key || key.length < 20) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing or too short.');
    }

    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(url, key, {
      auth:   { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'X-Client-Info': 'nexus-sync/18' } },
    });

    _sb.client    = client;
    _sb.ready     = true;
    _sb.error     = null;
    _sb.nextRetry = 0;
    console.log('[supabase] ✅ Client initialized successfully.');
    return client;
  } catch (e: unknown) {
    const msg     = e instanceof Error ? e.message : String(e);
    _sb.error     = msg;
    _sb.ready     = false;
    _sb.client    = null;
    _sb.nextRetry = Date.now() + SB_RETRY_COOLDOWN;
    console.error('[supabase] ❌ Init failed:', msg);
    return null;
  } finally {
    _sb.initPromise = null;
  }
}

async function getSB(): Promise<SupabaseClient | null> {
  const envSnap = makeEnvSnap(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (_sb.envSnapshot && _sb.envSnapshot !== envSnap) {
    console.log('[supabase] Env changed, resetting client...');
    _sb.client      = null;
    _sb.ready       = false;
    _sb.error       = null;
    _sb.nextRetry   = 0;
    _sb.initPromise = null;
  }
  _sb.envSnapshot = envSnap;

  if (_sb.ready && _sb.client) return _sb.client;
  if (_sb.error && Date.now() < _sb.nextRetry) {
    console.warn('[supabase] In cooldown, skipping init. Next retry in',
      Math.ceil((_sb.nextRetry - Date.now()) / 1000), 's');
    return null;
  }

  if (_sb.initPromise) return _sb.initPromise;

  _sb.initPromise = _doInitSB();
  return _sb.initPromise;
}

// ═══════════════════════════════════════════════════════════════════════════
// KV — async lazy init
// ═══════════════════════════════════════════════════════════════════════════

const _kv: KvState = {
  client:      null,
  ready:       false,
  error:       null,
  nextRetry:   0,
  envSnapshot: '',
};

async function getKV(): Promise<KvClient | null> {
  const envSnap = makeEnvSnap(
    process.env.KV_REST_API_URL,
    process.env.KV_REST_API_TOKEN,
  );

  if (_kv.envSnapshot && _kv.envSnapshot !== envSnap) {
    _kv.client    = null;
    _kv.ready     = false;
    _kv.error     = null;
    _kv.nextRetry = 0;
  }
  _kv.envSnapshot = envSnap;

  if (_kv.ready && _kv.client) return _kv.client;
  if (_kv.error && Date.now() < _kv.nextRetry) return null;

  try {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      throw new Error('KV_REST_API_URL or KV_REST_API_TOKEN is not set.');
    }
    const mod    = await import('@vercel/kv');
    const client = (mod as Record<string, unknown>).kv
                ?? (mod as Record<string, unknown>).default
                ?? mod;

    if (typeof (client as KvClient).get !== 'function') {
      throw new Error('@vercel/kv: method .get() not found on imported module.');
    }

    _kv.client    = client as KvClient;
    _kv.ready     = true;
    _kv.error     = null;
    _kv.nextRetry = 0;
    console.log('[kv] ✅ KV client initialized successfully.');
    return _kv.client;
  } catch (e: unknown) {
    const msg     = e instanceof Error ? e.message : String(e);
    _kv.error     = msg;
    _kv.ready     = false;
    _kv.client    = null;
    _kv.nextRetry = Date.now() + KV_RETRY_COOLDOWN;
    console.warn('[kv] ⚠️ KV not available (optional):', msg);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT SUPABASE ERROR
// ═══════════════════════════════════════════════════════════════════════════

function formatSBError(error: unknown): string {
  if (!error) return 'Unknown Supabase error';
  const e = error as Record<string, unknown>;
  const parts: string[] = [String(e.message ?? error)];
  if (e.code)    parts.push(`code=${e.code}`);
  if (e.hint)    parts.push(`hint=${e.hint}`);
  if (e.details) parts.push(`details=${e.details}`);
  return parts.join(' | ');
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function sbGet(username: string): Promise<UserData | null> {
  const sb = await getSB();
  if (!sb) throw new Error('Supabase not available: ' + (_sb.error ?? 'initialization failed'));

  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      const raw = await withTimeout(
        (sb.from(TABLE)
           .select('data')
           .eq('username', username)
           .maybeSingle() as unknown) as Promise<unknown>,
        TIMEOUT_OP,
        'sbGet',
      );
      const { data, error } = raw as SbRowGet;
      if (error) throw new Error(formatSBError(error));
      return data ? (data.data as UserData) : null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[supabase] sbGet attempt ${i}/${MAX_RETRY}:`, msg);
      if (i === MAX_RETRY) throw e;
      await sleep(200 * i);
    }
  }
  return null;
}

async function sbSet(username: string, payload: UserData): Promise<UserData> {
  const sb = await getSB();
  if (!sb) throw new Error('Supabase not available: ' + (_sb.error ?? 'initialization failed'));

  payload = trimUserData(payload);

  const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (payloadBytes > MAX_PAYLOAD) {
    console.warn(
      `[supabase] Payload ${(payloadBytes / 1024).toFixed(1)} KB — trimming old convs...`
    );
    payload.convs    = (payload.convs    ?? []).slice(-6);
    payload.allConvs = (payload.allConvs ?? []).slice(-6);

    const sizeAfter = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (sizeAfter > MAX_PAYLOAD) {
      payload.convs    = [];
      payload.allConvs = [];
      console.warn('[supabase] Convs cleared because payload is still too large.');
    }
  }

  let lastErr: unknown;
  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      const raw = await withTimeout(
        (sb.from(TABLE).upsert(
          {
            username,
            data:       payload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'username' },
        ) as unknown) as Promise<unknown>,
        TIMEOUT_OP,
        'sbSet',
      );
      const { error } = raw as SbRowWrite;
      if (error) throw new Error(formatSBError(error));
      return payload;
    } catch (e: unknown) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[supabase] sbSet attempt ${i}/${MAX_RETRY}:`, msg);
      if (i === MAX_RETRY) break;
      await sleep(300 * i);
    }
  }
  throw lastErr;
}

async function sbDel(username: string): Promise<boolean> {
  const sb = await getSB();
  if (!sb) throw new Error('Supabase not available');

  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      const raw = await withTimeout(
        (sb.from(TABLE)
           .delete()
           .eq('username', username) as unknown) as Promise<unknown>,
        TIMEOUT_OP,
        'sbDel',
      );
      const { error } = raw as SbRowWrite;
      if (error) throw new Error(formatSBError(error));
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[supabase] sbDel attempt ${i}/${MAX_RETRY}:`, msg);
      if (i === MAX_RETRY) throw e;
      await sleep(200 * i);
    }
  }
  return false;
}

async function sbList(): Promise<Record<string, UserData>> {
  const sb = await getSB();
  if (!sb) return {};
  try {
    const raw = await withTimeout(
      (sb.from(TABLE)
         .select('username, data')
         .order('username') as unknown) as Promise<unknown>,
      TIMEOUT_OP * 2,
      'sbList',
    );
    const { data, error } = raw as SbRowList;
    if (error) throw new Error(formatSBError(error));
    const result: Record<string, UserData> = {};
    for (const row of (data ?? [])) {
      if (row.username && !row.username.startsWith('_')) {
        result[row.username] = row.data;
      }
    }
    return result;
  } catch (e: unknown) {
    console.error('[supabase] sbList error:', e instanceof Error ? e.message : e);
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// KV OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function kvGet(username: string): Promise<UserData | null> {
  const kv = await getKV();
  if (!kv) return null;
  try {
    const val = await withTimeout(kv.get(KV_PREFIX + username), TIMEOUT_OP, 'kvGet');
    return val == null ? null : (val as UserData);
  } catch (e: unknown) {
    console.warn('[kv] kvGet error (non-fatal):', e instanceof Error ? e.message : e);
    return null;
  }
}

async function kvSet(username: string, data: UserData): Promise<UserData | null> {
  const kv = await getKV();
  if (!kv) return null;
  try {
    await withTimeout(
      kv.set(KV_PREFIX + username, data, { ex: KV_TTL }),
      TIMEOUT_OP,
      'kvSet',
    );
    return data;
  } catch (e: unknown) {
    console.warn('[kv] kvSet error (non-fatal):', e instanceof Error ? e.message : e);
    return null;
  }
}

async function kvDel(username: string): Promise<void> {
  const kv = await getKV();
  if (!kv) return;
  try {
    const delFn =
      typeof kv.del    === 'function' ? kv.del.bind(kv)    :
      typeof kv.delete === 'function' ? kv.delete.bind(kv) :
      null;
    if (delFn) await withTimeout(delFn(KV_PREFIX + username), TIMEOUT_OP, 'kvDel');
  } catch (e: unknown) {
    console.warn('[kv] kvDel error (non-fatal):', e instanceof Error ? e.message : e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE ABSTRACTION
// ═══════════════════════════════════════════════════════════════════════════

async function storageGet(username: string): Promise<UserData | null> {
  try {
    const sbData = await sbGet(username);
    if (sbData !== null) return sbData;
    return await kvGet(username);
  } catch (sbErr: unknown) {
    const msg = sbErr instanceof Error ? sbErr.message : String(sbErr);
    console.warn('[storage] Supabase get failed, falling back to KV:', msg);
    const kvData = await kvGet(username);
    if (kvData !== null) {
      console.log('[storage] KV fallback succeeded for user:', username);
    }
    return kvData;
  }
}

async function storageSet(username: string, data: UserData): Promise<UserData> {
  const sb = await getSB();

  if (!sb) {
    const saved = await kvSet(username, trimUserData(data));
    if (saved) {
      console.warn('[storage] ⚠️ Supabase not available — data saved to KV only.');
      return saved;
    }
    console.error('[storage] ❌ ALL storage backends unavailable! Data not saved:', username);
    return trimUserData(data);
  }

  const saved = await sbSet(username, data);

  // Sync to KV in the background (fire-and-forget, never blocks the response)
  getKV().then(kv => {
    if (kv) {
      kvSet(username, saved).catch((e: unknown) =>
        console.warn('[storage] KV background sync failed (non-fatal):',
          e instanceof Error ? e.message : e)
      );
    }
  }).catch(() => undefined);

  return saved;
}

async function storageDelete(username: string): Promise<boolean> {
  const sbResult = await sbDel(username).catch((e: unknown) => {
    console.warn('[storage] sbDel error:', e instanceof Error ? e.message : e);
    return false;
  });

  await kvDel(username);
  await deleteUserInbox(username);

  return sbResult;
}

async function storageList(): Promise<Record<string, UserData>> {
  return sbList();
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA TRIMMING
// ═══════════════════════════════════════════════════════════════════════════

function trimMsgs(msgs: unknown, maxMsgs = 60, maxChars = 6_000): ConvMessage[] {
  if (!Array.isArray(msgs)) return [];
  return (msgs as ConvMessage[]).slice(-maxMsgs).map(m => {
    const msg: ConvMessage = { ...m };
    if (typeof msg.content === 'string' && msg.content.length > maxChars) {
      msg.content = msg.content.slice(0, maxChars) + '\n...[trimmed]';
    }
    if (Array.isArray(msg.attachments)) {
      msg.attachments = (msg.attachments as Attachment[]).map(a =>
        a.type === 'image'
          ? { type: 'image', name: a.name, mime: a.mime }
          : { type: a.type,  name: a.name },
      );
    }
    delete msg._rawContent;
    return msg;
  });
}

function trimUserData(data: UserData): UserData {
  if (!data || typeof data !== 'object') return data;
  const d: UserData = { ...data };
  if (Array.isArray(d.convs)) {
    d.convs = d.convs.slice(-50).map(cv => ({
      ...cv,
      msgs: trimMsgs(cv.msgs),
    }));
  }
  if (Array.isArray(d.allConvs)) {
    d.allConvs = d.allConvs.slice(-50).map(cv => ({
      ...cv,
      msgs: trimMsgs(cv.msgs),
    }));
  }
  if (Array.isArray(d.projects)) d.projects = d.projects.slice(-100);
  // Bound the dedupe ledger too, so it can never grow without limit.
  if (Array.isArray(d._deductLedger)) {
    const cutoff = Date.now() - DEDUCT_DEDUPE_TTL_MS;
    d._deductLedger = (d._deductLedger as { id: string; ts: number }[])
      .filter(e => e && typeof e.ts === 'number' && e.ts > cutoff)
      .slice(-200);
  }
  delete d.draftAttach;
  return d;
}

// Remove every conversation that belongs to a given projectId, from both
// `convs` and `allConvs`. Used when a project is deleted, so chat history
// tied to that project never lingers as orphaned data in Supabase.
function stripConvsForProject(data: UserData, projectId: string): UserData {
  if (!projectId) return data;
  const matches = (cv: Conversation) => cv && cv.projectId === projectId;
  if (Array.isArray(data.convs))    data.convs    = data.convs.filter(cv => !matches(cv));
  if (Array.isArray(data.allConvs)) data.allConvs = data.allConvs.filter(cv => !matches(cv));
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// OWNER / ADMIN ROLE RESOLUTION (role-tagging only — NOT an auth gate)
// ═══════════════════════════════════════════════════════════════════════════
//
// These helpers decide whether a *stored user record* should be tagged as
// owner/admin (e.g. to grant unlimited credits in their own data). They are
// not used to authorize who may call the admin actions below — per this
// version's requirements, there is no authorization check on those routes
// at all.

function parseIdList(envStr: string | undefined): IdEntry[] {
  return (envStr ?? '')
    .split(',')
    .map(s => {
      const parts = s.trim().split(':');
      return { id: parts[0].trim(), name: parts[1]?.trim() ?? null } satisfies IdEntry;
    })
    .filter(x => x.id.length > 0);
}

function getOwnerIds(): IdEntry[] {
  const fromEnv = parseIdList(process.env.OWNER_IDS);
  return fromEnv.length ? fromEnv : [{ id: '128649548', name: 'FIINYTID25' }];
}

function getAdminIds(): IdEntry[] {
  return parseIdList(process.env.ADMIN_IDS);
}

function isOwnerById(userId: unknown): boolean {
  const uid = String(userId ?? '').trim();
  return uid.length > 0 && getOwnerIds().some(o => o.id === uid);
}

function isAdminById(userId: unknown): boolean {
  if (isOwnerById(userId)) return true;
  const uid = String(userId ?? '').trim();
  return uid.length > 0 && getAdminIds().some(a => a.id === uid);
}

function applyRoleOverrides(data: UserData): UserData {
  if (!data?.robloxId) return data;
  if (isOwnerById(data.robloxId)) {
    data.credits = MAX_CREDITS;
    data.plan    = 'owner';
    data.roles   = ['owner', 'admin'];
  } else if (isAdminById(data.robloxId)) {
    data.credits = MAX_CREDITS;
    if (!Array.isArray(data.roles)) data.roles = [];
    if (!data.roles.includes('admin')) data.roles.push('admin');
  }
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRUD HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function getUser(username: string): Promise<UserData | null> {
  const key = normalizeKey(username);
  if (!key) return null;
  try {
    return await storageGet(key);
  } catch (e: unknown) {
    console.error('[crud] getUser error:', e instanceof Error ? e.message : e);
    return null;
  }
}

async function setUser(username: string, data: UserData): Promise<UserData> {
  const key = normalizeKey(username);
  if (!key)  throw new Error('Username is invalid');
  if (!data) throw new Error('Data must not be empty');
  return storageSet(key, data);
}

// ═══════════════════════════════════════════════════════════════════════════
// CORS & ERROR HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function setCors(res: AdaptedResponse): void {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options',       'nosniff');
  res.setHeader('Cache-Control',                'no-store');
}

function errResponse(res: AdaptedResponse, e: unknown): AdaptedResponse {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[handler] storage error:', msg);

  let hint = 'Check environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).';
  if (_sb.error)      hint = 'Supabase init error: ' + _sb.error;
  else if (_kv.error) hint = 'KV init error: '       + _kv.error;

  return res.status(500).json({
    error:  'A storage error occurred.',
    code:   'STORAGE_ERROR',
    detail: msg,
    hint,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

const handler: HandlerFn = async (req: AdaptedRequest, res: AdaptedResponse) => {
  setCors(res);

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const ip: string =
    (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';
  if (!checkRateLimit(`sync:${ip}`, 120)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const userKey = normalizeKey(req.query['user'] ?? '');

  // ══════════════════════════════════════════════════════════
  // GET
  // ══════════════════════════════════════════════════════════
  if (req.method === 'GET') {

    // NOTE: no token check — reachable by anyone who hits this URL.
    if (req.query['admin_ids'] === '1') {
      return res.status(200).json({
        admin_ids: getAdminIds().map(a => a.id).filter(Boolean),
        owner_ids: getOwnerIds().map(o => o.id).filter(Boolean),
      });
    }

    // GET ?health=1 — no token check.
    if (req.query['health'] === '1') {
      const sb = await getSB();
      let canWrite   = false;
      let canRead    = false;
      let healthErr: string | null = null;

      if (sb) {
        try {
          const testRecord = {
            username:   '__health__',
            data:       { ok: true, ts: Date.now() },
            updated_at: new Date().toISOString(),
          };

          const rawW = await withTimeout(
            (sb.from(TABLE).upsert(
              testRecord,
              { onConflict: 'username' },
            ) as unknown) as Promise<unknown>,
            5_000,
            'healthWrite',
          );
          const { error: wErr } = rawW as SbRowWrite;
          if (wErr) throw new Error(formatSBError(wErr));
          canWrite = true;

          const rawR = await withTimeout(
            (sb.from(TABLE)
               .select('data')
               .eq('username', '__health__')
               .maybeSingle() as unknown) as Promise<unknown>,
            5_000,
            'healthRead',
          );
          const { data: rData, error: rErr } = rawR as SbRowAny;
          if (rErr) throw new Error(formatSBError(rErr));
          canRead = !!rData;

          await withTimeout(
            (sb.from(TABLE)
               .delete()
               .eq('username', '__health__') as unknown) as Promise<unknown>,
            5_000,
            'healthCleanup',
          );
        } catch (e: unknown) {
          healthErr = e instanceof Error ? e.message : String(e);
        }
      }

      const kv = await getKV();
      return res.status(200).json({
        ok:          canWrite && canRead,
        supabase:    !!sb,
        kv:          !!kv,
        canWrite,
        canRead,
        sbInitError: _sb.error  ?? null,
        kvInitError: _kv.error  ?? null,
        opsError:    healthErr  ?? null,
        timestamp:   new Date().toISOString(),
      });
    }

    // GET ?list=1 — no token check.
    if (req.query['list'] === '1') {
      try {
        const allUsers = await storageList();
        return res.status(200).json(allUsers);
      } catch (e: unknown) {
        return errResponse(res, e);
      }
    }

    if (!userKey) return res.status(200).json(null);

    try {
      let data = await getUser(userKey);
      if (!data) return res.status(200).json(null);
      data = applyRoleOverrides(data);
      return res.status(200).json(data);
    } catch (e: unknown) {
      return errResponse(res, e);
    }
  }

  // ══════════════════════════════════════════════════════════
  // POST
  // ══════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    let body: PostBody;
    try {
      body = typeof req.body === 'string'
        ? (JSON.parse(req.body) as PostBody)
        : ((req.body as PostBody) ?? {});
    } catch (e: unknown) {
      return res.status(400).json({
        error: 'Invalid JSON: ' + (e instanceof Error ? e.message : e),
      });
    }

    const { user, robloxId: bodyRobloxId, data, action } = body;

    // ── ADMIN-STYLE ACTIONS — NO TOKEN CHECK ───────────────
    // Anyone who can reach this route and knows the body shape can call
    // these. See the security note at the top of this file.
    if (action) {

      async function adminUpdate(
        target:   unknown,
        updateFn: (existing: UserData) => UserData,
      ): Promise<AdaptedResponse | null> {
        if (!target) return res.status(400).json({ error: 'field "target" is required' });
        const tKey = normalizeKey(String(target));
        if (!tKey || tKey.length > 50) {
          return res.status(400).json({ error: 'target is invalid or too long' });
        }
        const existing = (await getUser(tKey)) ?? {};
        const next     = updateFn(existing);
        next._updated  = Date.now();
        try {
          await setUser(tKey, next);
          return null;
        } catch (e: unknown) {
          return errResponse(res, e);
        }
      }

      const ab = body as AdminUpdateBody;

      switch (action) {

        case 'give-credits': {
          const amt = parseFloat(String(ab.amount ?? ''));
          if (!ab.target || isNaN(amt) || amt <= 0 || amt > 100_000) {
            return res.status(400).json({
              error: 'target and amount (1–100000) are required',
            });
          }
          const errRes = await adminUpdate(ab.target, ex => {
            ex.credits = safeCredits((ex.credits ?? 0) + amt, ex.credits ?? 0);
            return ex;
          });
          if (errRes) return errRes;
          const updated = await getUser(normalizeKey(ab.target));
          return res.status(200).json({
            success:    true,
            newCredits: updated?.credits ?? null,
            user:       ab.target,
          });
        }

        case 'set-credits': {
          const amt = parseFloat(String(ab.amount ?? ''));
          if (!ab.target || isNaN(amt) || amt < 0) {
            return res.status(400).json({ error: 'target and amount (≥0) are required' });
          }
          const errRes = await adminUpdate(ab.target, ex => {
            ex.credits = safeCredits(amt, 0);
            return ex;
          });
          if (errRes) return errRes;
          return res.status(200).json({ success: true });
        }

        // ── deduct-credits ──────────────────────────────────────────────
        // Atomic, server-side credit deduction for a single AI request.
        // This is the missing piece that previously caused the "credits
        // bounce back to the old value" bug: the client used to compute
        // a deduction locally and only ever display it — the regular sync
        // route never accepted a "credits" field from the client (by
        // design, to stop raw client-side overwrites), so the server
        // balance was never actually touched. The next sync (debounced,
        // periodic, or on tab focus) would then read the untouched DB
        // value and overwrite the client's optimistic number.
        //
        // This action fixes that by giving the client an explicit,
        // narrow, validated way to say "subtract this specific cost for
        // this specific request" — entirely separate from the generic
        // data-sync path, and idempotent via requestId so retries/double
        // sends can never double-charge the same response.
        case 'deduct-credits': {
          const targetUser = ab.target ?? user;
          const cost       = safeDeductCost(ab.cost);
          const requestId  = sanitizeStr(String(ab.requestId ?? ''), 100);

          if (!targetUser) {
            return res.status(400).json({ error: 'target (or user) is required' });
          }
          if (cost === null) {
            return res.status(400).json({
              error: `cost must be a number greater than 0 and at most ${MAX_DEDUCT_COST}`,
            });
          }
          if (!requestId) {
            return res.status(400).json({
              error: 'requestId is required (used to prevent duplicate deductions)',
            });
          }

          const tKey = normalizeKey(String(targetUser));
          if (!tKey || tKey.length > 50) {
            return res.status(400).json({ error: 'target is invalid or too long' });
          }

          const existing = await getUser(tKey);

          // Owner/admin accounts are unlimited — never actually deduct,
          // just report their effectively-infinite balance back.
          if (existing?.robloxId && isAdminById(existing.robloxId)) {
            return res.status(200).json({
              success:  true,
              credits:  MAX_CREDITS,
              deducted: 0,
              skipped:  'owner_or_admin',
            });
          }

          const current = existing ?? {};

          // Idempotency check — if this exact requestId was already
          // processed within the dedupe window, return the *current*
          // balance without deducting again.
          const ledger = Array.isArray(current._deductLedger)
            ? (current._deductLedger as { id: string; ts: number }[])
            : [];
          const cutoff   = Date.now() - DEDUCT_DEDUPE_TTL_MS;
          const freshLedger = ledger.filter(e => e && typeof e.ts === 'number' && e.ts > cutoff);
          const alreadyDone = freshLedger.some(e => e.id === requestId);

          if (alreadyDone) {
            return res.status(200).json({
              success:  true,
              credits:  safeCredits(current.credits, DEFAULT_NEW_USER_CREDITS),
              deducted: 0,
              skipped:  'duplicate_request',
            });
          }

          const balanceBefore = safeCredits(current.credits, DEFAULT_NEW_USER_CREDITS);

          if (balanceBefore < cost) {
            // Not enough balance — do not deduct, do not go negative.
            // Report the real balance so the client can correct its UI.
            return res.status(200).json({
              success:        false,
              error:          'insufficient_credits',
              credits:        balanceBefore,
              deducted:       0,
            });
          }

          const balanceAfter = safeCredits(balanceBefore - cost, balanceBefore);

          freshLedger.push({ id: requestId, ts: Date.now() });

          const next: UserData = {
            ...current,
            credits:        balanceAfter,
            _deductLedger:  freshLedger.slice(-200),
            _updated:       Date.now(),
          };

          try {
            await setUser(tKey, next);
          } catch (e: unknown) {
            return errResponse(res, e);
          }

          return res.status(200).json({
            success:  true,
            credits:  balanceAfter,
            deducted: cost,
          });
        }

        case 'confirm-payment': {
          const amt = parseFloat(String(ab.amount ?? ''));
          if (!ab.target || isNaN(amt) || amt <= 0) {
            return res.status(400).json({ error: 'target and amount are required' });
          }
          const errRes = await adminUpdate(ab.target, ex => {
            ex.credits     = safeCredits((ex.credits ?? 0) + amt, ex.credits ?? 0);
            ex.lastPayment = {
              amount:        amt,
              transactionId: sanitizeStr(String(ab.transactionId ?? ''), 100),
              ts:            Date.now(),
            };
            return ex;
          });
          if (errRes) return errRes;
          return res.status(200).json({ success: true, credited: amt, user: ab.target });
        }

        case 'set-plan': {
          const allowedPlans = ['free', 'pro', 'owner'] as const;
          if (
            !ab.target ||
            !ab.plan   ||
            !allowedPlans.includes(ab.plan as (typeof allowedPlans)[number])
          ) {
            return res.status(400).json({
              error: 'target and plan (free/pro/owner) are required',
            });
          }
          const plan = ab.plan as string;
          const errRes = await adminUpdate(ab.target, ex => {
            ex.plan = plan;
            if (plan === 'pro')   ex.credits = safeCredits(Math.max(ex.credits ?? 0, 200), 200);
            if (plan === 'owner') ex.credits = MAX_CREDITS;
            return ex;
          });
          if (errRes) return errRes;
          return res.status(200).json({ success: true });
        }

        case 'reset-credits': {
          if (!ab.target) return res.status(400).json({ error: 'target is required' });
          const errRes = await adminUpdate(ab.target, ex => {
            ex.credits = DEFAULT_NEW_USER_CREDITS;
            return ex;
          });
          if (errRes) return errRes;
          return res.status(200).json({ success: true });
        }

        case 'ban': {
          if (!ab.target) return res.status(400).json({ error: 'target is required' });
          const safeReason = sanitizeStr(String(ab.reason ?? 'No reason given'), 200);
          const errRes = await adminUpdate(ab.target, ex => {
            ex.banned    = true;
            ex.banReason = safeReason;
            ex.bannedAt  = Date.now();
            return ex;
          });
          if (errRes) return errRes;
          return res.status(200).json({ success: true });
        }

        case 'unban': {
          if (!ab.target) return res.status(400).json({ error: 'target is required' });
          const errRes = await adminUpdate(ab.target, ex => {
            ex.banned     = false;
            ex.banReason  = null;
            ex.unbannedAt = Date.now();
            return ex;
          });
          if (errRes) return errRes;
          return res.status(200).json({ success: true });
        }

        case 'add-admin': {
          if (!ab.target) return res.status(400).json({ error: 'target is required' });
          const errRes = await adminUpdate(ab.target, ex => {
            if (!Array.isArray(ex.roles)) ex.roles = [];
            if (!ex.roles.includes('admin')) ex.roles.push('admin');
            ex.credits = MAX_CREDITS;
            return ex;
          });
          if (errRes) return errRes;
          return res.status(200).json({ success: true });
        }

        case 'remove-admin': {
          if (!ab.target) return res.status(400).json({ error: 'target is required' });
          const errRes = await adminUpdate(ab.target, ex => {
            ex.roles = (ex.roles ?? []).filter(r => r !== 'admin');
            return ex;
          });
          if (errRes) return errRes;
          return res.status(200).json({ success: true });
        }

        // ── delete-project: removes a project AND every conversation tied
        // to it (cascading delete), so no orphaned chat data is left in
        // Supabase. The dashboard's "delete project" button should call
        // this action instead of (or in addition to) just resyncing a
        // trimmed projects[] array, to guarantee server-side cleanup even
        // if the client crashes mid-operation.
        case 'delete-project': {
          const targetUser = ab.target ?? user;
          const projectId  = sanitizeStr(String((body as Record<string, unknown>).projectId ?? ''), 100);
          if (!targetUser || !projectId) {
            return res.status(400).json({ error: 'target (or user) and projectId are required' });
          }
          const errRes = await adminUpdate(targetUser, ex => {
            ex.projects = (ex.projects ?? []).filter(p => p.id !== projectId);
            ex = stripConvsForProject(ex, projectId);
            return ex;
          });
          if (errRes) return errRes;
          return res.status(200).json({ success: true, deletedProjectId: projectId });
        }

        default:
          return res.status(400).json({
            error: 'Unknown action: ' + sanitizeStr(String(action), 50),
          });
      }
    }

    // ── NORMAL USER SYNC ──────────────────────────────────
    if (!user) {
      return res.status(400).json({ error: 'Field "user" must not be empty' });
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Field "data" must be an object' });
    }

    const key = normalizeKey(String(user));
    if (!key || key.length > 50) {
      return res.status(400).json({
        error: 'Username is invalid or too long (max 50 characters)',
      });
    }

    try {
      const existing = await getUser(key);

      if (existing?.banned) {
        return res.status(403).json({
          error:  'Account banned',
          reason: existing.banReason ?? 'Violation of ToS',
        });
      }

      const clientData = data as UserData;

      // Fields the client is allowed to overwrite directly. Notice
      // "credits" is intentionally NOT in this list — credits are only
      // ever changed through controlled arithmetic (see "deduct-credits"
      // and the other admin actions above), never by a raw client-sent
      // number overwriting the stored value.
      const SAFE_FIELDS: (keyof UserData)[] = [
        'convs', 'allConvs', 'curConv', 'model', 'guiModel',
        'lastClaim', 'draftText', 'avatar', 'displayName',
        'settings', 'preferences', 'projects',
      ];

      const clientUpdate: UserData = {};
      for (const f of SAFE_FIELDS) {
        if (clientData[f] !== undefined) clientUpdate[f] = clientData[f];
      }

      // If the client's project list dropped one or more projects that
      // existed before, treat that as a deletion and cascade-clean the
      // matching conversations server-side. This covers the normal
      // dashboard flow (resync after removing a project from the array)
      // without requiring the client to know about the dedicated
      // 'delete-project' action above.
      if (existing && Array.isArray(existing.projects) && Array.isArray(clientUpdate.projects)) {
        const beforeIds = new Set(existing.projects.map(p => p.id));
        const afterIds  = new Set(clientUpdate.projects.map(p => p.id));
        const removedIds = [...beforeIds].filter(id => !afterIds.has(id));
        for (const removedId of removedIds) {
          if (Array.isArray(clientUpdate.convs)) {
            clientUpdate.convs = clientUpdate.convs.filter(
              cv => cv.projectId !== removedId,
            );
          }
          if (existing.allConvs) {
            existing.allConvs = existing.allConvs.filter(
              cv => cv.projectId !== removedId,
            );
          }
        }
      }

      const resolvedRobloxId: string =
        existing?.robloxId
          ? existing.robloxId
          : sanitizeStr(String(bodyRobloxId ?? clientData.robloxId ?? ''), 50);

      let merged: UserData;

      if (existing) {
        // Existing user: credits ALWAYS come from the stored record. The
        // client never gets to overwrite this value directly — this is
        // what fixes the "credits reset to 30 on refresh" bug, since a
        // stale/partial client payload can no longer clobber a real saved
        // balance. Actual usage-based deductions happen exclusively
        // through the "deduct-credits" action above.
        merged = {
          ...existing,
          ...clientUpdate,
          credits:     safeCredits(existing.credits, DEFAULT_NEW_USER_CREDITS),
          plan:        existing.plan      ?? 'free',
          roles:       existing.roles     ?? [],
          banned:      existing.banned    ?? false,
          banReason:   existing.banReason ?? null,
          robloxId:    resolvedRobloxId,
          googleEmail: existing.googleEmail ?? sanitizeStr(String(clientData.googleEmail ?? ''), 100),
          _updated:    Date.now(),
        };
      } else {
        // Brand new user — this is the ONLY situation where a client-sent
        // credits value is allowed to seed the initial balance, and even
        // then it is validated and bounded.
        merged = {
          ...clientUpdate,
          credits:     clientData.credits !== undefined
                         ? safeCredits(clientData.credits, DEFAULT_NEW_USER_CREDITS)
                         : DEFAULT_NEW_USER_CREDITS,
          plan:        'free',
          roles:       [],
          banned:      false,
          banReason:   null,
          robloxId:    resolvedRobloxId,
          googleEmail: sanitizeStr(String(clientData.googleEmail ?? ''), 100),
          _created:    Date.now(),
          _updated:    Date.now(),
        };
      }

      merged = applyRoleOverrides(merged);

      let savedPayload: UserData;
      try {
        savedPayload = await setUser(key, merged);
      } catch (e: unknown) {
        return errResponse(res, e);
      }

      if (!savedPayload) savedPayload = merged;

      const responseData = applyRoleOverrides({ ...savedPayload });

      const sbAvail = !!_sb.client && _sb.ready;
      const kvAvail = !!_kv.client && _kv.ready;
      let storageWarning: string | undefined;
      if (!sbAvail && !kvAvail) {
        storageWarning = '⚠️ No storage backend available. Data may not have been saved.';
      } else if (!sbAvail) {
        storageWarning = '⚠️ Supabase not available, using KV only.';
      }

      return res.status(200).json({
        success:        true,
        credits:        responseData.credits,
        plan:           responseData.plan,
        roles:          responseData.roles    ?? [],
        robloxId:       responseData.robloxId ?? '',
        storageWarning: storageWarning,
        data:           responseData,
      });

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[handler] POST sync error:', msg);
      return res.status(500).json({ error: 'Internal error while saving data.' });
    }
  }

  // ══════════════════════════════════════════════════════════
  // DELETE — no token check.
  // ══════════════════════════════════════════════════════════
  if (req.method === 'DELETE') {
    if (!userKey) {
      return res.status(400).json({ error: 'Parameter "user" must not be empty' });
    }
    try {
      await storageDelete(userKey);
      return res.status(200).json({ success: true, deleted: userKey });
    } catch (e: unknown) {
      return errResponse(res, e);
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;