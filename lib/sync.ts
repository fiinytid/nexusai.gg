// lib/sync.ts — NEXUS AI User Data Sync (TypeScript v16)
//
// Storage: Supabase (primary) + Vercel KV (fallback/cache)
//
// FIXES v16:
//   • ENV VAR MISMATCH fixed — semua pakai SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY
//   • initLock deadlock fixed — Promise-based lock
//   • KV retry mechanism added
//   • Unused `import crypto` removed
//   • healthCheck now cleans up __health__ record after test
//   • storageSet race condition fixed — getSB() only called once
//   • RLS Policy SQL fixed for Supabase service role

import type { SupabaseClient }                             from '@supabase/supabase-js';
import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route.js';
import { verifyAdminToken, sanitizeStr, checkRateLimit }  from './_security';

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
  msgs?: ConvMessage[];
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
  projects?:    unknown[];
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
  // FIX: Promise-based lock menggantikan boolean sederhana
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
  nextRetry:   number; // FIX: tambah retry untuk KV
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
const KV_RETRY_COOLDOWN = 60_000; // FIX: KV juga punya cooldown

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

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE — async lazy init (FIX: Promise-based lock)
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
    // FIX: nama env var sekarang konsisten — SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY
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
      global: { headers: { 'X-Client-Info': 'nexus-sync/16' } },
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
    // FIX: lock selalu di-release setelah selesai (sukses maupun gagal)
    _sb.initPromise = null;
  }
}

async function getSB(): Promise<SupabaseClient | null> {
  // FIX: envSnapshot sekarang pakai nama var yang sama dengan _doInitSB
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

  // FIX: kalau sudah ada init berjalan, tunggu hasilnya (tidak double-init)
  if (_sb.initPromise) return _sb.initPromise;

  _sb.initPromise = _doInitSB();
  return _sb.initPromise;
}

// ═══════════════════════════════════════════════════════════════════════════
// KV — async lazy init (FIX: tambah retry cooldown)
// ═══════════════════════════════════════════════════════════════════════════

const _kv: KvState = {
  client:      null,
  ready:       false,
  error:       null,
  nextRetry:   0, // FIX: KV sekarang punya nextRetry
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
    _kv.nextRetry = 0; // FIX: reset retry saat env berubah
  }
  _kv.envSnapshot = envSnap;

  if (_kv.ready && _kv.client) return _kv.client;
  // FIX: KV error sekarang punya cooldown, bukan selamanya null
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
    _kv.nextRetry = Date.now() + KV_RETRY_COOLDOWN; // FIX: retry setelah 60 detik
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
      // FIX: skip semua internal records (prefix _)
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
  // FIX: getSB() dipanggil sekali saja, tidak dua kali (race condition)
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

  // Sync ke KV secara async (fire-and-forget)
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
  delete d.draftAttach;
  return d;
}

// ═══════════════════════════════════════════════════════════════════════════
// OWNER / ADMIN
// ═══════════════════════════════════════════════════════════════════════════

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
    data.credits = 999_999;
    data.plan    = 'owner';
    data.roles   = ['owner', 'admin'];
  } else if (isAdminById(data.robloxId)) {
    data.credits = 999_999;
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
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

    if (req.query['admin_ids'] === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized: admin token required.' });
      }
      return res.status(200).json({
        admin_ids: getAdminIds().map(a => a.id).filter(Boolean),
        owner_ids: getOwnerIds().map(o => o.id).filter(Boolean),
      });
    }

    // GET ?health=1
    if (req.query['health'] === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized: admin token required.' });
      }
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

          // write
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

          // read
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

          // FIX: cleanup __health__ record setelah test
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

    if (req.query['list'] === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized: admin token required.' });
      }
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

    if (action) {
      if (!verifyAdminToken(req)) {
        return res.status(403).json({
          error: 'Forbidden: ADMIN_TOKEN required via Authorization: Bearer <token>.',
        });
      }

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
            ex.credits = parseFloat(((ex.credits ?? 0) + amt).toFixed(4));
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
            ex.credits = parseFloat(amt.toFixed(4));
            return ex;
          });
          if (errRes) return errRes;
          return res.status(200).json({ success: true });
        }

        case 'confirm-payment': {
          const amt = parseFloat(String(ab.amount ?? ''));
          if (!ab.target || isNaN(amt) || amt <= 0) {
            return res.status(400).json({ error: 'target and amount are required' });
          }
          const errRes = await adminUpdate(ab.target, ex => {
            ex.credits     = parseFloat(((ex.credits ?? 0) + amt).toFixed(4));
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
            if (plan === 'pro')   ex.credits = Math.max(ex.credits ?? 0, 200);
            if (plan === 'owner') ex.credits = 999_999;
            return ex;
          });
          if (errRes) return errRes;
          return res.status(200).json({ success: true });
        }

        case 'reset-credits': {
          if (!ab.target) return res.status(400).json({ error: 'target is required' });
          const errRes = await adminUpdate(ab.target, ex => {
            ex.credits = 30;
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
            ex.credits = 999_999;
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

      const SAFE_FIELDS: (keyof UserData)[] = [
        'convs', 'allConvs', 'curConv', 'model', 'guiModel',
        'lastClaim', 'draftText', 'avatar', 'displayName',
        'settings', 'preferences', 'projects',
      ];

      const clientUpdate: UserData = {};
      for (const f of SAFE_FIELDS) {
        if (clientData[f] !== undefined) clientUpdate[f] = clientData[f];
      }

      const resolvedRobloxId: string =
        existing?.robloxId
          ? existing.robloxId
          : sanitizeStr(String(bodyRobloxId ?? clientData.robloxId ?? ''), 50);

      let merged: UserData;

      if (existing) {
        merged = {
          ...existing,
          ...clientUpdate,
          credits:     existing.credits !== undefined
                         ? existing.credits
                         : (parseFloat(String(clientData.credits)) || 30),
          plan:        existing.plan      ?? 'free',
          roles:       existing.roles     ?? [],
          banned:      existing.banned    ?? false,
          banReason:   existing.banReason ?? null,
          robloxId:    resolvedRobloxId,
          googleEmail: existing.googleEmail ?? sanitizeStr(String(clientData.googleEmail ?? ''), 100),
          _updated:    Date.now(),
        };
      } else {
        merged = {
          ...clientUpdate,
          credits:     clientData.credits !== undefined
                         ? parseFloat(String(clientData.credits))
                         : 30,
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

      // FIX: gunakan sb yang sudah di-resolve, tidak panggil getSB() lagi
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
  // DELETE
  // ══════════════════════════════════════════════════════════
  if (req.method === 'DELETE') {
    if (!verifyAdminToken(req)) {
      return res.status(403).json({
        error: 'Forbidden: Admin token required to delete data.',
      });
    }
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

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * SUPABASE TABLE SETUP (run once in Supabase SQL Editor)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CREATE TABLE IF NOT EXISTS nexus_users (
 *   username   TEXT PRIMARY KEY,
 *   data       JSONB        NOT NULL DEFAULT '{}',
 *   updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
 * );
 *
 * CREATE INDEX IF NOT EXISTS idx_nexus_users_updated
 *   ON nexus_users (updated_at DESC);
 *
 * ALTER TABLE nexus_users ENABLE ROW LEVEL SECURITY;
 *
 * -- FIX v16: Policy yang benar untuk service_role di Supabase terbaru
 * -- auth.role() tidak reliable untuk service role, pakai TO service_role
 * CREATE POLICY "service_role_full_access" ON nexus_users
 *   AS PERMISSIVE
 *   FOR ALL
 *   TO service_role
 *   USING (true)
 *   WITH CHECK (true);
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ENVIRONMENT VARIABLES — v16 (NAMA SUDAH DISTANDARISASI)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Required:
 *   SUPABASE_URL              = https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY = eyJ...
 *   ADMIN_TOKEN               = secret-token-min-16-chars
 *
 * Optional (KV fallback):
 *   KV_REST_API_URL   = https://...upstash.io
 *   KV_REST_API_TOKEN = ...
 *
 * Optional (owner/admin):
 *   OWNER_IDS = 128649548:FIINYTID25,99999:OtherName
 *   ADMIN_IDS = 11111:Admin1,22222:Admin2
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */