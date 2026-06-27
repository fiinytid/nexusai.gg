// ts/sync.ts — NEXUS AI User Data Sync (TypeScript)

import crypto from 'crypto';
import type { SupabaseClient }                             from '@supabase/supabase-js';
import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route';
import { deleteUserInbox }                                 from './inbox';
import { sanitizeStr, checkRateLimit, verifyAdminToken }  from './_security';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Attachment {
  type: string;
  name?: string;
  mime?: string;
  data?: string;    // base64 payload — now preserved on save (see trimMsgs)
  preview?: string; // optional data: URL preview, also preserved
  text?: string;    // for non-image text-file attachments
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
  time?:      number;
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
  lastClaim?:   string | null;
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

// ─── Redeem code types ─────────────────────────────────────────────────────

/** Full record stored at nexus:code:<CODE> */
interface CodeRecord {
  code:      string;
  credits:   number;
  maxUses:   number;
  uses:      number;
  expiresAt: string | null;
  createdAt: string;
  label?:    string;
}

/** Lightweight summary stored in the master list key */
interface CodeListEntry {
  code:      string;
  credits:   number;
  maxUses:   number;
  uses:      number;
  expiresAt: string | null;
  createdAt: string;
  label?:    string;
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

// Supabase's default row/column payload ceiling we guard against. This is
// now used ONLY as a last-resort safety valve (see trimUserDataForStorage),
// never as a per-message truncation rule. Raised generously since we are
// intentionally storing full code + full base64 images now.
const MAX_PAYLOAD       = 8 * 1024 * 1024; // 8 MB safety ceiling
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

// How many conversations / how many messages per conversation we keep at
// most. These are generous "sanity ceilings", not content truncation —
// they only drop WHOLE old conversations/messages when truly necessary,
// they never cut the text/code inside a kept message.
const MAX_CONVS_KEPT      = 200; // generous ceiling on number of conversations
const MAX_MSGS_PER_CONV   = 400; // generous ceiling on number of messages per conv

// Redeem code constants
const CODES_LIST_KEY        = 'nexus:code_list' as const;
const MAX_CODE_CREDITS      = 10_000;
const MAX_CODE_USES         = 10_000;
const CODE_USED_TTL_SECONDS = 86_400 * 365 * 3; // 3 years

// ─── Daily-claim constants ─────────────────────────────────────────────────
// Server-side mirror of the client's daily-reward rules. These MUST stay
// authoritative here — the whole point of the `claim-daily` action is that
// the client can no longer just add credits locally and hope a generic sync
// carries it through (it won't: `credits` is deliberately excluded from
// SAFE_FIELDS below, so any client-side credit bump from a non-action sync
// is silently discarded and the server's last-known value wins instead —
// which is what made daily-claim credits appear to "revert").
const DAILY_MS               = 24 * 60 * 60 * 1000;
const FREE_DAILY_REWARD      = 2;
const PRO_DAILY_REWARD       = 25;
const MAX_DAILY_CATCHUP_DAYS = 7; // cap how many missed days can be claimed at once

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

// ─── Daily-claim utilities ──────────────────────────────────────────────────

// Resolve the per-day reward for a user record, mirroring the client's
// `_perDayReward()`. Plan is the only input that affects the amount.
function dailyRewardForPlan(plan: unknown): number {
  return String(plan ?? '').toLowerCase() === 'pro' ? PRO_DAILY_REWARD : FREE_DAILY_REWARD;
}

// How many whole daily periods have elapsed since `lastClaim`, clamped to
// [0, MAX_DAILY_CATCHUP_DAYS]. No `lastClaim` at all (first-ever claim)
// counts as exactly 1 day owed, same as the client's `_daysSinceLastClaim`.
function daysOwedSinceClaim(lastClaim: unknown): number {
  if (!lastClaim) return 1;
  const ts = new Date(String(lastClaim)).getTime();
  if (!Number.isFinite(ts)) return 1;
  const elapsedMs = Date.now() - ts;
  if (elapsedMs < 0) return 0; // clock skew / future timestamp — owe nothing
  return Math.min(Math.floor(elapsedMs / DAILY_MS), MAX_DAILY_CATCHUP_DAYS);
}

// ─── Redeem code utilities ─────────────────────────────────────────────────

/**
 * Validate and normalise a redeem code string.
 * Accepts 6–12 uppercase alphanumeric characters.
 * Returns the normalised code, or null if invalid.
 */
function validateCode(code: unknown): string | null {
  const upper = String(code ?? '').toUpperCase().trim().replace(/\s/g, '');
  if (!/^[A-Z0-9]{6,12}$/.test(upper)) return null;
  return upper;
}

/**
 * Generate a cryptographically-random 8-character code.
 * Excludes ambiguous characters: 0, O, I, 1, L.
 */
function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let code    = '';
  for (const byte of bytes) {
    code += chars[byte % chars.length];
  }
  return code.substring(0, 8);
}

/**
 * Build a CodeListEntry summary from a full CodeRecord.
 */
function toListEntry(record: CodeRecord): CodeListEntry {
  return {
    code:      record.code,
    credits:   record.credits,
    maxUses:   record.maxUses,
    uses:      record.uses,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    ...(record.label ? { label: record.label } : {}),
  };
}

/**
 * Parse and validate an expiresInDays value.
 * Returns an ISO expiry string, null (never expires), or throws a descriptive Error.
 */
function parseExpiry(expiresInDays: unknown): string | null {
  if (
    expiresInDays === undefined ||
    expiresInDays === null      ||
    expiresInDays === ''
  ) {
    return null; // never expires
  }
  const days = parseInt(String(expiresInDays), 10);
  if (isNaN(days) || days < 1 || days > 3_650) {
    throw new Error('expiresInDays must be between 1 and 3650.');
  }
  return new Date(Date.now() + days * 86_400_000).toISOString();
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
      global: { headers: { 'X-Client-Info': 'nexus-sync/21' } },
    });

    _sb.client    = client;
    _sb.ready     = true;
    _sb.error     = null;
    _sb.nextRetry = 0;
    console.log('[supabase] Client initialized successfully.');
    return client;
  } catch (e: unknown) {
    const msg     = e instanceof Error ? e.message : String(e);
    _sb.error     = msg;
    _sb.ready     = false;
    _sb.client    = null;
    _sb.nextRetry = Date.now() + SB_RETRY_COOLDOWN;
    console.error('[supabase] Init failed:', msg);
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
    console.log('[kv] KV client initialized successfully.');
    return _kv.client;
  } catch (e: unknown) {
    const msg     = e instanceof Error ? e.message : String(e);
    _kv.error     = msg;
    _kv.ready     = false;
    _kv.client    = null;
    _kv.nextRetry = Date.now() + KV_RETRY_COOLDOWN;
    console.warn('[kv] KV not available (optional):', msg);
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

  payload = trimUserDataForStorage(payload);

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

// ─── KV raw key helpers (for redeem code storage) ─────────────────────────

async function kvRawGet<T>(key: string): Promise<T | null> {
  const kv = await getKV();
  if (!kv) return null;
  try {
    const val = await withTimeout(kv.get(key), TIMEOUT_OP, 'kvRawGet');
    return val == null ? null : (val as T);
  } catch (e: unknown) {
    console.warn('[kv] kvRawGet error:', e instanceof Error ? e.message : e);
    return null;
  }
}

async function kvRawSet(key: string, value: unknown, opts?: { ex?: number }): Promise<boolean> {
  const kv = await getKV();
  if (!kv) return false;
  try {
    await withTimeout(kv.set(key, value, opts), TIMEOUT_OP, 'kvRawSet');
    return true;
  } catch (e: unknown) {
    console.warn('[kv] kvRawSet error:', e instanceof Error ? e.message : e);
    return false;
  }
}

async function kvRawDel(key: string): Promise<void> {
  const kv = await getKV();
  if (!kv) return;
  try {
    const delFn =
      typeof kv.del    === 'function' ? kv.del.bind(kv)    :
      typeof kv.delete === 'function' ? kv.delete.bind(kv) :
      null;
    if (delFn) await withTimeout(delFn(key), TIMEOUT_OP, 'kvRawDel');
  } catch (e: unknown) {
    console.warn('[kv] kvRawDel error (non-fatal):', e instanceof Error ? e.message : e);
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
    const saved = await kvSet(username, trimUserDataForStorage(data));
    if (saved) {
      console.warn('[storage] Supabase not available — data saved to KV only.');
      return saved;
    }
    console.error('[storage] ALL storage backends unavailable! Data not saved:', username);
    return trimUserDataForStorage(data);
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
//
// IMPORTANT — behavior change from the previous version:
//   The old `trimMsgs()` / `trimUserData()` pair used to ALWAYS truncate any
//   message content over 6,000 characters and ALWAYS strip image attachment
//   data down to just `{ type, name, mime }` before saving, no matter how
//   small the actual payload was. That is what caused:
//     1. Long AI-generated Lua scripts to come back shortened after
//        reopening a chat (the full code was deleted from `content` and
//        `_rawContent` before it ever reached the database).
//     2. Sent/received images to disappear after reload (the base64 `data`
//        field was deleted before it ever reached the database).
//
//   The fix: we no longer touch message content or attachment data at all
//   during a normal save. We only step in with non-destructive measures
//   (capping conversation/message COUNTS, never their CONTENT) if, and only
//   if, the actual computed payload size for THIS save is large enough to
//   risk a storage error. Recent conversations are always preserved first;
//   only the oldest conversations are ever dropped, and only as a last
//   resort, only enough to get back under the limit.
// ═══════════════════════════════════════════════════════════════════════════

function payloadByteSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return Infinity;
  }
}

// Cap on raw COUNTS only — never rewrites/truncates message content or
// attachment data. This protects against unbounded array growth (e.g. a
// user with thousands of conversations) without ever shortening what's
// inside a kept message.
function capCounts(data: UserData): UserData {
  const d: UserData = { ...data };
  if (Array.isArray(d.convs)) {
    d.convs = d.convs.slice(-MAX_CONVS_KEPT).map(cv => ({
      ...cv,
      msgs: Array.isArray(cv.msgs) ? cv.msgs.slice(-MAX_MSGS_PER_CONV) : cv.msgs,
    }));
  }
  if (Array.isArray(d.allConvs)) {
    d.allConvs = d.allConvs.slice(-MAX_CONVS_KEPT).map(cv => ({
      ...cv,
      msgs: Array.isArray(cv.msgs) ? cv.msgs.slice(-MAX_MSGS_PER_CONV) : cv.msgs,
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

// Last-resort safety valve: if the payload is still too large for storage
// after count-capping, drop WHOLE conversations starting from the OLDEST
// one (lowest `time`), one at a time, until it fits — or until only the
// single most recent conversation remains. This never edits message
// content/attachments inside a conversation that is kept; it only removes
// entire older conversations so the newest chats (full code, full images)
// always survive intact.
function dropOldestConversationsUntilFits(
  d: UserData,
  field: 'convs' | 'allConvs',
  maxBytes: number,
): void {
  const list = d[field] as Conversation[] | undefined;
  if (!Array.isArray(list) || list.length <= 1) return;

  // Sort a working copy oldest-first by `time` (fallback: original order).
  const withIdx = list.map((cv, idx) => ({ cv, idx }));
  withIdx.sort((a, b) => (a.cv.time ?? a.idx) - (b.cv.time ?? b.idx));

  let current = list.slice();
  let oldestPointer = 0;

  while (payloadByteSize(d) > maxBytes && current.length > 1 && oldestPointer < withIdx.length) {
    const oldestConv = withIdx[oldestPointer].cv;
    current = current.filter(cv => cv !== oldestConv);
    d[field] = current;
    oldestPointer++;
  }
}

function trimUserDataForStorage(data: UserData): UserData {
  if (!data || typeof data !== 'object') return data;

  // Step 1: non-destructive count caps only (no content/attachment edits).
  let d = capCounts(data);

  // Step 2: only if the real payload is still oversized, drop whole OLD
  // conversations (oldest first) — never truncate what's inside a kept one.
  if (payloadByteSize(d) > MAX_PAYLOAD) {
    console.warn(
      `[storage] Payload ${(payloadByteSize(d) / 1024 / 1024).toFixed(2)} MB exceeds ` +
      `${(MAX_PAYLOAD / 1024 / 1024).toFixed(0)} MB — dropping oldest conversations ` +
      `(newest chats, including full code and images, are kept intact).`
    );
    dropOldestConversationsUntilFits(d, 'allConvs', MAX_PAYLOAD);
    dropOldestConversationsUntilFits(d, 'convs', MAX_PAYLOAD);

    if (payloadByteSize(d) > MAX_PAYLOAD) {
      console.error(
        '[storage] Payload still exceeds the safety ceiling even after dropping ' +
        'all but the most recent conversation. The most recent conversation is ' +
        'kept as-is (full content, never truncated); storage may still reject ' +
        'this write if a single conversation alone is larger than the ceiling.'
      );
    }
  }

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

    // GET ?admin_ids=1 — no token check.
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

    // GET ?codes=1 — admin: list all redeem codes.
    if (req.query['codes'] === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }
      if (!checkRateLimit(`sync_codes_get:${ip}`, 30)) {
        return res.status(429).json({ error: 'Rate limit exceeded.' });
      }
      try {
        const codes = (await kvRawGet<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
        return res.status(200).json({ codes });
      } catch (e: unknown) {
        console.error('[sync] GET codes error:', e instanceof Error ? e.message : e);
        return res.status(500).json({ error: 'Failed to retrieve code list.' });
      }
    }

    // GET ?code=<CODE> — admin: fetch a single redeem code record.
    if (req.query['code']) {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }
      const singleCode = validateCode(req.query['code']);
      if (!singleCode) {
        return res.status(400).json({ error: 'Invalid code format.' });
      }
      try {
        const record = await kvRawGet<CodeRecord>(`nexus:code:${singleCode}`);
        if (!record) return res.status(404).json({ error: 'Code not found.' });
        return res.status(200).json({ code: record });
      } catch (e: unknown) {
        console.error('[sync] GET single code error:', e instanceof Error ? e.message : e);
        return res.status(500).json({ error: 'Failed to retrieve code.' });
      }
    }

    // GET ?daily_status=1&user=<name> — read-only daily-claim status check.
    // Lets the client show an accurate countdown/availability without
    // having to guess locally from a possibly-stale cached `lastClaim`.
    if (req.query['daily_status'] === '1') {
      if (!userKey) {
        return res.status(400).json({ error: 'Parameter "user" must not be empty' });
      }
      try {
        const existing = await getUser(userKey);
        const data     = existing ? applyRoleOverrides({ ...existing }) : null;
        const roles    = data?.roles ?? [];
        const plan     = (data?.plan ?? 'free').toLowerCase();
        const unlimitedPlan = plan === 'owner' || roles.includes('owner') || roles.includes('admin');

        if (unlimitedPlan) {
          return res.status(200).json({
            claimable: false,
            unlimited: true,
            reward:    0,
            daysOwed:  0,
            lastClaim: data?.lastClaim ?? null,
          });
        }

        const daysOwed = daysOwedSinceClaim(data?.lastClaim ?? null);
        return res.status(200).json({
          claimable: daysOwed > 0,
          unlimited: false,
          reward:    daysOwed > 0 ? daysOwed * dailyRewardForPlan(plan) : 0,
          daysOwed,
          lastClaim: data?.lastClaim ?? null,
        });
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

    // ── ACTIONS ────────────────────────────────────────────
    if (action) {

      // ── Helper: perform a read-modify-write on a user record ──
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

      const ab = body as AdminUpdateBody & Record<string, unknown>;

      switch (action) {

        // ────────────────────────────────────────────────────────────────
        // DAILY CREDITS CLAIM (server-authoritative)
        // ────────────────────────────────────────────────────────────────

        // claim-daily: credits the caller's own account for any daily
        // reward(s) owed, exactly like `deduct-credits` is the only sanctioned
        // way to subtract credits. This exists because the generic user-sync
        // path below deliberately excludes `credits` from SAFE_FIELDS — a
        // client that just bumps `S.credits` locally and relies on a normal
        // sync to persist it will always have that bump silently discarded,
        // and the next sync response will hand back the server's old value,
        // which is exactly what made daily-claim rewards appear to "revert"
        // a few seconds after being claimed. This action performs the whole
        // read-modify-write itself, so the number that's added is the same
        // number that's actually persisted and returned.
        //
        // Body: { action: 'claim-daily', user }
        // (robloxId may also be supplied for first-time account creation —
        //  same convention as the normal sync path below.)
        case 'claim-daily': {
          const rawUser = ab.user ?? user;
          if (!rawUser) {
            return res.status(400).json({ error: 'Field "user" is required' });
          }

          const cleanUser = normalizeKey(String(rawUser));
          if (!cleanUser || cleanUser.length > 50) {
            return res.status(400).json({ error: 'Username is invalid or too long' });
          }

          // Cheap per-account throttle: a person mashing the claim button
          // shouldn't be able to fire more requests than could possibly
          // matter (claims are gated to once per DAILY_MS server-side
          // anyway, this just stops needless storage round-trips).
          if (!checkRateLimit(`claim_daily:${cleanUser}`, 10)) {
            return res.status(429).json({ error: 'Too many requests. Please slow down.' });
          }

          try {
            const existing = await getUser(cleanUser);

            if (existing?.banned) {
              return res.status(403).json({
                error:  'Account banned',
                reason: existing.banReason ?? 'Violation of ToS',
              });
            }

            const current = existing ?? {};
            const roles   = current.roles ?? [];
            const plan    = (current.plan ?? 'free').toLowerCase();

            // Owners/admins run on unlimited credits already — there is
            // nothing meaningful to "claim", and we don't want a stray
            // claim to perturb their (already MAX_CREDITS) balance or
            // overwrite lastClaim in a way that's visible to the client.
            if (plan === 'owner' || roles.includes('owner') || roles.includes('admin')) {
              return res.status(200).json({
                success:   true,
                claimed:   false,
                reason:    'owner_or_admin',
                credits:   MAX_CREDITS,
                reward:    0,
                lastClaim: current.lastClaim ?? null,
              });
            }

            const daysOwed = daysOwedSinceClaim(current.lastClaim ?? null);
            if (daysOwed <= 0) {
              // Nothing to claim yet — report current state so the client
              // can correct any optimistic UI without granting credits.
              return res.status(200).json({
                success:   true,
                claimed:   false,
                reason:    'not_yet_available',
                credits:   safeCredits(current.credits, DEFAULT_NEW_USER_CREDITS),
                reward:    0,
                lastClaim: current.lastClaim ?? null,
              });
            }

            const reward         = daysOwed * dailyRewardForPlan(plan);
            const balanceBefore  = safeCredits(current.credits, DEFAULT_NEW_USER_CREDITS);
            const balanceAfter   = safeCredits(balanceBefore + reward, balanceBefore);
            const nowIso         = new Date().toISOString();

            const nextData: UserData = {
              ...current,
              credits:   balanceAfter,
              lastClaim: nowIso,
              _updated:  Date.now(),
              ...(!existing ? {
                plan:      current.plan      ?? 'free',
                roles:     current.roles     ?? [],
                banned:    false,
                banReason: null,
                robloxId:  sanitizeStr(String(bodyRobloxId ?? current.robloxId ?? ''), 50),
                _created:  Date.now(),
              } : {}),
            };

            await setUser(cleanUser, nextData);

            return res.status(200).json({
              success:   true,
              claimed:   true,
              daysOwed,
              reward,
              credits:   balanceAfter,
              lastClaim: nowIso,
            });
          } catch (e: unknown) {
            return errResponse(res, e);
          }
        }

        // ────────────────────────────────────────────────────────────────
        // REDEEM CODE MANAGEMENT ACTIONS
        // All actions below require a valid admin token.
        // ────────────────────────────────────────────────────────────────

        // admin-create-code: create a new redeem code.
        // Body: { action, code?, credits, maxUses, expiresInDays?, label? }
        // If `code` is provided and valid it is used as the code string;
        // otherwise a random 8-character code is generated automatically.
        case 'admin-create-code': {
          if (!verifyAdminToken(req)) {
            return res.status(401).json({ error: 'Unauthorized.' });
          }
          if (!checkRateLimit(`sync_code_create:${ip}`, 10)) {
            return res.status(429).json({ error: 'Rate limit exceeded.' });
          }

          const { credits, maxUses, expiresInDays, label } = ab as {
            credits?:       unknown;
            maxUses?:       unknown;
            expiresInDays?: unknown;
            label?:         unknown;
          };

          // Validate credits (1 – 10 000)
          const cr = parseFloat(String(credits ?? ''));
          if (isNaN(cr) || cr <= 0 || cr > MAX_CODE_CREDITS) {
            return res.status(400).json({
              error: `credits must be between 1 and ${MAX_CODE_CREDITS}.`,
            });
          }

          // Validate maxUses (1 – 10 000)
          const mu = parseInt(String(maxUses ?? ''), 10);
          if (isNaN(mu) || mu <= 0 || mu > MAX_CODE_USES) {
            return res.status(400).json({
              error: `maxUses must be between 1 and ${MAX_CODE_USES}.`,
            });
          }

          // Validate optional expiry
          let expiresAt: string | null;
          try {
            expiresAt = parseExpiry(expiresInDays);
          } catch (e: unknown) {
            return res.status(400).json({
              error: e instanceof Error ? e.message : String(e),
            });
          }

          // Determine final code string
          const customCode = ab.code ? validateCode(ab.code) : null;
          if (ab.code && !customCode) {
            return res.status(400).json({
              error: 'Invalid code format. Must be 6–12 uppercase alphanumeric characters.',
            });
          }

          // If a custom code was provided, make sure it doesn't already exist
          if (customCode) {
            const existingCode = await kvRawGet<CodeRecord>(`nexus:code:${customCode}`);
            if (existingCode) {
              return res.status(409).json({ error: 'A code with that string already exists.' });
            }
          }

          const codeStr   = customCode ?? generateRandomCode();
          const cleanLabel = label ? sanitizeStr(String(label), 60) : undefined;

          try {
            const newCode: CodeRecord = {
              code:      codeStr,
              credits:   parseFloat(cr.toFixed(4)),
              maxUses:   mu,
              uses:      0,
              expiresAt,
              createdAt: new Date().toISOString(),
              ...(cleanLabel ? { label: cleanLabel } : {}),
            };

            await kvRawSet(`nexus:code:${codeStr}`, newCode);

            const codes = (await kvRawGet<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
            codes.push(toListEntry(newCode));
            await kvRawSet(CODES_LIST_KEY, codes);

            return res.status(200).json({ success: true, code: newCode });
          } catch (e: unknown) {
            console.error('[sync] admin-create-code error:', e instanceof Error ? e.message : e);
            return res.status(500).json({ error: 'Failed to create code.' });
          }
        }

        // admin-update-code: patch credits / maxUses / expiresInDays / label
        // on an existing code without deleting and re-creating it.
        // Body: { action, code, credits?, maxUses?, expiresInDays?, label? }
        case 'admin-update-code': {
          if (!verifyAdminToken(req)) {
            return res.status(401).json({ error: 'Unauthorized.' });
          }
          if (!checkRateLimit(`sync_code_update:${ip}`, 20)) {
            return res.status(429).json({ error: 'Rate limit exceeded.' });
          }

          const code = validateCode(ab.code);
          if (!code) return res.status(400).json({ error: 'Invalid code format.' });

          try {
            const existing = await kvRawGet<CodeRecord>(`nexus:code:${code}`);
            if (!existing) return res.status(404).json({ error: 'Code not found.' });

            const { credits, maxUses, expiresInDays, label } = ab as {
              credits?:       unknown;
              maxUses?:       unknown;
              expiresInDays?: unknown;
              label?:         unknown;
            };

            let newCredits = existing.credits;
            if (credits !== undefined) {
              const cr = parseFloat(String(credits));
              if (isNaN(cr) || cr <= 0 || cr > MAX_CODE_CREDITS) {
                return res.status(400).json({
                  error: `credits must be between 1 and ${MAX_CODE_CREDITS}.`,
                });
              }
              newCredits = parseFloat(cr.toFixed(4));
            }

            let newMaxUses = existing.maxUses;
            if (maxUses !== undefined) {
              const mu = parseInt(String(maxUses), 10);
              if (isNaN(mu) || mu <= 0 || mu > MAX_CODE_USES) {
                return res.status(400).json({
                  error: `maxUses must be between 1 and ${MAX_CODE_USES}.`,
                });
              }
              newMaxUses = mu;
            }

            let newExpiresAt = existing.expiresAt;
            if (expiresInDays !== undefined) {
              try {
                newExpiresAt = parseExpiry(expiresInDays);
              } catch (e: unknown) {
                return res.status(400).json({
                  error: e instanceof Error ? e.message : String(e),
                });
              }
            }

            const newLabel = label !== undefined
              ? (label ? sanitizeStr(String(label), 60) : undefined)
              : existing.label;

            const updated: CodeRecord = {
              ...existing,
              credits:   newCredits,
              maxUses:   newMaxUses,
              expiresAt: newExpiresAt,
              ...(newLabel ? { label: newLabel } : {}),
            };

            await kvRawSet(`nexus:code:${code}`, updated);

            // Patch master list entry in-place (non-critical)
            try {
              const codes = (await kvRawGet<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
              const idx   = codes.findIndex(c => c.code === code);
              if (idx !== -1) {
                codes[idx] = toListEntry(updated);
                await kvRawSet(CODES_LIST_KEY, codes);
              }
            } catch { /* non-critical */ }

            return res.status(200).json({ success: true, code: updated });
          } catch (e: unknown) {
            console.error('[sync] admin-update-code error:', e instanceof Error ? e.message : e);
            return res.status(500).json({ error: 'Failed to update code.' });
          }
        }

        // admin-delete-code: permanently delete a redeem code.
        // Body: { action, code }
        case 'admin-delete-code': {
          if (!verifyAdminToken(req)) {
            return res.status(401).json({ error: 'Unauthorized.' });
          }
          if (!checkRateLimit(`sync_code_del:${ip}`, 20)) {
            return res.status(429).json({ error: 'Rate limit exceeded.' });
          }

          const code = validateCode(ab.code);
          if (!code) return res.status(400).json({ error: 'Invalid code format.' });

          try {
            const codes    = (await kvRawGet<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
            const newCodes = codes.filter(c => c.code !== code);
            await kvRawSet(CODES_LIST_KEY, newCodes);
            await kvRawDel(`nexus:code:${code}`);
            return res.status(200).json({ success: true, deleted: code });
          } catch (e: unknown) {
            console.error('[sync] admin-delete-code error:', e instanceof Error ? e.message : e);
            return res.status(500).json({ error: 'Failed to delete code.' });
          }
        }

        // admin-regenerate: issue a new random code string with the same
        // credits / maxUses / expiresAt / label. The old code is deleted.
        // Useful when a code has been accidentally leaked.
        // Body: { action, code }
        case 'admin-regenerate': {
          if (!verifyAdminToken(req)) {
            return res.status(401).json({ error: 'Unauthorized.' });
          }
          if (!checkRateLimit(`sync_code_regen:${ip}`, 10)) {
            return res.status(429).json({ error: 'Rate limit exceeded.' });
          }

          const oldCode = validateCode(ab.code);
          if (!oldCode) return res.status(400).json({ error: 'Invalid code format.' });

          try {
            const existing = await kvRawGet<CodeRecord>(`nexus:code:${oldCode}`);
            if (!existing) return res.status(404).json({ error: 'Code not found.' });

            const newCodeStr = generateRandomCode();
            const regenerated: CodeRecord = {
              ...existing,
              code:      newCodeStr,
              uses:      0,
              createdAt: new Date().toISOString(),
            };

            await kvRawSet(`nexus:code:${newCodeStr}`, regenerated);
            await kvRawDel(`nexus:code:${oldCode}`);

            // Swap master list entry (non-critical)
            try {
              const codes = (await kvRawGet<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
              const idx   = codes.findIndex(c => c.code === oldCode);
              if (idx !== -1) {
                codes[idx] = toListEntry(regenerated);
              } else {
                codes.push(toListEntry(regenerated));
              }
              await kvRawSet(CODES_LIST_KEY, codes);
            } catch { /* non-critical */ }

            return res.status(200).json({ success: true, oldCode, code: regenerated });
          } catch (e: unknown) {
            console.error('[sync] admin-regenerate error:', e instanceof Error ? e.message : e);
            return res.status(500).json({ error: 'Failed to regenerate code.' });
          }
        }

        // admin-reset-uses: zero out the use counter on a code.
        // Does NOT clear per-user sentinel keys, so users who already
        // redeemed will still be blocked unless those keys are deleted.
        // Body: { action, code }
        case 'admin-reset-uses': {
          if (!verifyAdminToken(req)) {
            return res.status(401).json({ error: 'Unauthorized.' });
          }
          if (!checkRateLimit(`sync_code_reset:${ip}`, 20)) {
            return res.status(429).json({ error: 'Rate limit exceeded.' });
          }

          const code = validateCode(ab.code);
          if (!code) return res.status(400).json({ error: 'Invalid code format.' });

          try {
            const existing = await kvRawGet<CodeRecord>(`nexus:code:${code}`);
            if (!existing) return res.status(404).json({ error: 'Code not found.' });

            const reset: CodeRecord = { ...existing, uses: 0 };
            await kvRawSet(`nexus:code:${code}`, reset);

            try {
              const codes = (await kvRawGet<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
              const idx   = codes.findIndex(c => c.code === code);
              if (idx !== -1) {
                codes[idx].uses = 0;
                await kvRawSet(CODES_LIST_KEY, codes);
              }
            } catch { /* non-critical */ }

            return res.status(200).json({ success: true, code: reset });
          } catch (e: unknown) {
            console.error('[sync] admin-reset-uses error:', e instanceof Error ? e.message : e);
            return res.status(500).json({ error: 'Failed to reset code uses.' });
          }
        }

        // admin-list-codes: list all redeem codes.
        // Body: { action }
        case 'admin-list-codes': {
          if (!verifyAdminToken(req)) {
            return res.status(401).json({ error: 'Unauthorized.' });
          }
          if (!checkRateLimit(`sync_code_list:${ip}`, 30)) {
            return res.status(429).json({ error: 'Rate limit exceeded.' });
          }
          try {
            const codes = (await kvRawGet<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
            return res.status(200).json({ codes });
          } catch (e: unknown) {
            console.error('[sync] admin-list-codes error:', e instanceof Error ? e.message : e);
            return res.status(500).json({ error: 'Failed to retrieve code list.' });
          }
        }

        // admin-get-code: fetch a single code record by code string.
        // Body: { action, code }
        case 'admin-get-code': {
          if (!verifyAdminToken(req)) {
            return res.status(401).json({ error: 'Unauthorized.' });
          }

          const code = validateCode(ab.code);
          if (!code) return res.status(400).json({ error: 'Invalid code format.' });

          try {
            const record = await kvRawGet<CodeRecord>(`nexus:code:${code}`);
            if (!record) return res.status(404).json({ error: 'Code not found.' });
            return res.status(200).json({ code: record });
          } catch (e: unknown) {
            console.error('[sync] admin-get-code error:', e instanceof Error ? e.message : e);
            return res.status(500).json({ error: 'Failed to retrieve code.' });
          }
        }

        // ── redeem-code: user redeems a code ─────────────────────────────
        // Validates the code, marks it used for this user (idempotent via a
        // per-user sentinel key in KV), increments the use counter, and
        // credits the user's account via a server-side atomic write.
        //
        // Rate-limited aggressively on both IP and username to prevent
        // brute-force attacks against the code namespace.
        //
        // Body: { action, code, user, userId? }
        case 'redeem-code': {
          // Per-IP rate limit (5 attempts per window)
          if (!checkRateLimit(`rdm_use:${ip}`, 5)) {
            return res.status(429).json({
              error: 'Too many attempts. Please try again in 1 minute.',
            });
          }

          const rawCode  = ab.code;
          const rawUser  = ab.user ?? user;

          if (!rawCode || !rawUser) {
            return res.status(400).json({ error: 'Both "code" and "user" are required.' });
          }

          const code = validateCode(rawCode);
          if (!code) {
            // Deliberately vague — do not help brute-force attackers
            return res.status(404).json({ error: 'Invalid or expired code.' });
          }

          const cleanUser = sanitizeStr(String(rawUser), 50).toLowerCase().trim();
          if (!cleanUser || !/^[a-z0-9_]{3,50}$/i.test(cleanUser)) {
            return res.status(400).json({ error: 'Invalid username format.' });
          }

          // Per-user rate limit (3 attempts per window)
          if (!checkRateLimit(`rdm_user:${cleanUser}`, 3)) {
            return res.status(429).json({
              error: 'Too many attempts for this account. Please wait a moment.',
            });
          }

          try {
            const codeData = await kvRawGet<CodeRecord>(`nexus:code:${code}`);

            // Constant-time-like delay to prevent timing oracle on code existence
            await new Promise<void>(r => setTimeout(r, 50 + Math.random() * 50));

            if (!codeData) {
              return res.status(404).json({ error: 'Invalid or expired code.' });
            }

            // Check expiry
            if (codeData.expiresAt && new Date(codeData.expiresAt) < new Date()) {
              return res.status(400).json({ error: 'This code has expired.' });
            }

            // Check already redeemed by this user
            const usedKey      = `nexus:code_used:${code}:${cleanUser}`;
            let alreadyUsed    = false;
            try {
              alreadyUsed = !!(await kvRawGet<boolean>(usedKey));
            } catch { /* treat as not used */ }

            if (alreadyUsed) {
              return res.status(400).json({ error: 'You have already redeemed this code.' });
            }

            // Check max uses
            if (codeData.uses >= codeData.maxUses) {
              return res.status(400).json({ error: 'This code has reached its usage limit.' });
            }

            // Validate credits from stored record — never from user input
            const redeemCredits = parseFloat(String(codeData.credits ?? 0));
            if (isNaN(redeemCredits) || redeemCredits <= 0 || redeemCredits > MAX_CODE_CREDITS) {
              return res.status(500).json({
                error: 'Code data is corrupt. Please contact support.',
              });
            }

            // Mark used (TTL: 3 years)
            await kvRawSet(usedKey, true, { ex: CODE_USED_TTL_SECONDS });

            // Increment use counter
            const updatedCode: CodeRecord = { ...codeData, uses: codeData.uses + 1 };
            await kvRawSet(`nexus:code:${code}`, updatedCode);

            // Update master list (non-critical — may be stale if this fails)
            try {
              const codes = (await kvRawGet<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
              const idx   = codes.findIndex(c => c.code === code);
              if (idx !== -1) {
                codes[idx].uses = updatedCode.uses;
                await kvRawSet(CODES_LIST_KEY, codes);
              }
            } catch { /* non-critical */ }

            // Credit the user's account via a server-side read-modify-write.
            // We update Supabase (primary store) then fire-and-forget KV sync,
            // exactly like the normal deduct-credits action.
            const existingUser = await getUser(cleanUser);
            const currentData  = existingUser ?? {};

            if (currentData.banned) {
              return res.status(403).json({
                error:  'Account banned',
                reason: currentData.banReason ?? 'Violation of ToS',
              });
            }

            const currentCredits  = safeCredits(currentData.credits, DEFAULT_NEW_USER_CREDITS);
            const newCredits      = safeCredits(currentCredits + redeemCredits, currentCredits);

            if (newCredits > MAX_CREDITS) {
              return res.status(400).json({
                error: 'Your credits balance is already at the maximum.',
              });
            }

            const nextData: UserData = {
              ...currentData,
              credits:  newCredits,
              _updated: Date.now(),
              ...(!existingUser ? {
                plan:      'free',
                roles:     [],
                banned:    false,
                banReason: null,
                _created:  Date.now(),
              } : {}),
            };

            try {
              await setUser(cleanUser, nextData);
            } catch (e: unknown) {
              // Credit write failed — roll back the use-counter increment
              // to avoid double-charging on a retry.
              const rollback: CodeRecord = { ...updatedCode, uses: codeData.uses };
              await kvRawSet(`nexus:code:${code}`, rollback).catch(() => undefined);
              return errResponse(res, e);
            }

            return res.status(200).json({
              success:    true,
              credits:    redeemCredits,
              newCredits,
              label:      codeData.label ?? null,
            });

          } catch (e: unknown) {
            console.error('[sync] redeem-code error:', e instanceof Error ? e.message : e);
            return res.status(500).json({ error: 'An error occurred. Please try again.' });
          }
        }

        // ────────────────────────────────────────────────────────────────
        // USER / ACCOUNT MANAGEMENT ACTIONS (unchanged from original)
        // ────────────────────────────────────────────────────────────────

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

          if (existing?.robloxId && isAdminById(existing.robloxId)) {
            return res.status(200).json({
              success:  true,
              credits:  MAX_CREDITS,
              deducted: 0,
              skipped:  'owner_or_admin',
            });
          }

          const current = existing ?? {};

          const ledger = Array.isArray(current._deductLedger)
            ? (current._deductLedger as { id: string; ts: number }[])
            : [];
          const cutoff      = Date.now() - DEDUCT_DEDUPE_TTL_MS;
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
            return res.status(200).json({
              success:  false,
              error:    'insufficient_credits',
              credits:  balanceBefore,
              deducted: 0,
            });
          }

          const balanceAfter = safeCredits(balanceBefore - cost, balanceBefore);

          freshLedger.push({ id: requestId, ts: Date.now() });

          const next: UserData = {
            ...current,
            credits:       balanceAfter,
            _deductLedger: freshLedger.slice(-200),
            _updated:      Date.now(),
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

      // Fields the client is allowed to overwrite directly.
      // "credits" is intentionally NOT in this list — credits are only
      // ever changed through controlled arithmetic (deduct-credits,
      // redeem-code, claim-daily, and the other admin actions above).
      // "lastClaim" IS in this list (read-only-ish in practice): the client
      // may report its last known claim timestamp for display/UX purposes,
      // but it carries no credit value on its own — `claim-daily` is the
      // only action that can turn a claim into an actual credits change,
      // and it sets `lastClaim` itself based on server time, not on
      // whatever the client sends here.
      const SAFE_FIELDS: (keyof UserData)[] = [
        'convs', 'allConvs', 'curConv', 'model', 'guiModel',
        'lastClaim', 'draftText', 'avatar', 'displayName',
        'settings', 'preferences', 'projects',
      ];

      const clientUpdate: UserData = {};
      for (const f of SAFE_FIELDS) {
        if (clientData[f] !== undefined) clientUpdate[f] = clientData[f];
      }

      // Cascade-clean conversations when the client's project list
      // shrinks — same logic as the dedicated delete-project action.
      if (existing && Array.isArray(existing.projects) && Array.isArray(clientUpdate.projects)) {
        const beforeIds  = new Set(existing.projects.map(p => p.id));
        const afterIds   = new Set(clientUpdate.projects.map(p => p.id));
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
        storageWarning = 'No storage backend available. Data may not have been saved.';
      } else if (!sbAvail) {
        storageWarning = 'Supabase not available, using KV only.';
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