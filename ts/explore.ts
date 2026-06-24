// ts/explore.ts — NEXUS AI Explore / Community Prompts (TypeScript)
//
// Auto-publish flow:
//   1. chats.ts mendeteksi nexus_auto_publish === 'true' di localStorage
//   2. Setelah play_test / stop_test selesai, chats.ts call POST /api/explore
//      dengan { user, robloxId, title, content, gifUrl }
//   3. gifUrl diambil dari GET /storage?user=x&limit=1 (GIF terbaru)
//   4. Prompt tersimpan di Supabase dan muncul di halaman Explore
//
// Storage conventions sama seperti sync.ts: Supabase sebagai primary store.

import type { SupabaseClient }                             from '@supabase/supabase-js';
import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route';
import { sanitizeStr, checkRateLimit }                     from './_security';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PromptRecord {
  id:        string;
  title:     string;
  content:   string;
  gifUrl:    string | null;
  author:    string;
  authorId:  string;
  uses:      number;
  rating:    number;
  createdAt: string;
  updatedAt: string;
  featured?: boolean;
}

interface PublishBody {
  user?:     unknown;
  robloxId?: unknown;
  title?:    unknown;
  content?:  unknown;
  gifUrl?:   unknown;
  // auto_publish flag — dikirim oleh chats.ts saat auto-publish
  auto?:     unknown;
  [key: string]: unknown;
}

interface SbRowList {
  data:  Record<string, unknown>[] | null;
  error: unknown;
}

interface SbRowWrite {
  error: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const TABLE             = 'nexus_prompts' as const;
const TIMEOUT_OP         = 8_000;
const MAX_RETRY          = 3;
const SB_RETRY_COOLDOWN  = 30_000;

const MAX_TITLE_LEN      = 80;
const MIN_TITLE_LEN      = 3;
const MAX_CONTENT_LEN    = 12_000;
const MIN_CONTENT_LEN    = 10;
const MAX_LIST_LIMIT     = 60;
const DEFAULT_LIMIT      = 30;

// Rate limit: per user, max publish per menit
// Auto-publish diberi sedikit lebih longgar karena dipicu sistem, bukan manual
const RL_PUBLISH_MANUAL  = 10;  // per menit per user (manual)
const RL_PUBLISH_AUTO    = 30;  // per menit per user (auto dari chats.ts)

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
      setTimeout(() => rej(new Error(`[timeout] "${label}" exceeded ${ms}ms`)), ms)
    ),
  ]);
}

function normalizeKey(key: unknown): string {
  return String(key ?? '').toLowerCase().trim();
}

function generatePromptId(): string {
  return `pmt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// Hanya allow https URL agar tidak bisa embed URL berbahaya
function sanitizeGifUrl(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return null;
    return u.toString().substring(0, 500);
  } catch {
    return null;
  }
}

function formatSBError(error: unknown): string {
  if (!error) return 'Unknown Supabase error';
  const e = error as Record<string, unknown>;
  const parts: string[] = [String(e.message ?? error)];
  if (e.code) parts.push(`code=${e.code}`);
  if (e.hint) parts.push(`hint=${e.hint}`);
  return parts.join(' | ');
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE — lazy init (sama seperti sync.ts)
// ═══════════════════════════════════════════════════════════════════════════

interface SbState {
  client:      SupabaseClient | null;
  ready:       boolean;
  error:       string | null;
  nextRetry:   number;
  envSnapshot: string;
  initPromise: Promise<SupabaseClient | null> | null;
}

const _sb: SbState = {
  client: null, ready: false, error: null, nextRetry: 0,
  envSnapshot: '', initPromise: null,
};

function makeEnvSnap(...vars: (string | undefined)[]): string {
  return vars.map(v => v ?? '').join('|');
}

async function _doInitSB(): Promise<SupabaseClient | null> {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !url.startsWith('https://')) throw new Error('SUPABASE_URL missing/invalid.');
    if (!key || key.length < 20)              throw new Error('SUPABASE_SERVICE_ROLE_KEY missing/short.');

    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(url, key, {
      auth:   { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'X-Client-Info': 'nexus-explore/2' } },
    });

    _sb.client = client;
    _sb.ready  = true;
    _sb.error  = null;
    return client;
  } catch (e: unknown) {
    _sb.error     = e instanceof Error ? e.message : String(e);
    _sb.ready     = false;
    _sb.client    = null;
    _sb.nextRetry = Date.now() + SB_RETRY_COOLDOWN;
    console.error('[explore] Supabase init failed:', _sb.error);
    return null;
  } finally {
    _sb.initPromise = null;
  }
}

async function getSB(): Promise<SupabaseClient | null> {
  const envSnap = makeEnvSnap(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (_sb.envSnapshot && _sb.envSnapshot !== envSnap) {
    _sb.client = null; _sb.ready = false; _sb.error = null; _sb.nextRetry = 0; _sb.initPromise = null;
  }
  _sb.envSnapshot = envSnap;

  if (_sb.ready && _sb.client) return _sb.client;
  if (_sb.error && Date.now() < _sb.nextRetry) return null;
  if (_sb.initPromise) return _sb.initPromise;

  _sb.initPromise = _doInitSB();
  return _sb.initPromise;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function sbListPrompts(authorFilter?: string): Promise<Record<string, unknown>[]> {
  const sb = await getSB();
  if (!sb) return [];
  try {
    let q = sb.from(TABLE).select('*').order('created_at', { ascending: false });
    if (authorFilter) q = (q as unknown as { eq: (col: string, val: string) => typeof q }).eq('author', authorFilter) as typeof q;
    const raw = await withTimeout(
      (q as unknown) as Promise<unknown>,
      TIMEOUT_OP * 2,
      'sbListPrompts',
    );
    const { data, error } = raw as SbRowList;
    if (error) throw new Error(formatSBError(error));
    return data ?? [];
  } catch (e: unknown) {
    console.error('[explore] sbListPrompts error:', e instanceof Error ? e.message : e);
    return [];
  }
}

async function sbInsertPrompt(record: PromptRecord): Promise<boolean> {
  const sb = await getSB();
  if (!sb) throw new Error('Supabase not available: ' + (_sb.error ?? 'init failed'));

  let lastErr: unknown;
  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      const raw = await withTimeout(
        (sb.from(TABLE).insert({
          id:         record.id,
          title:      record.title,
          content:    record.content,
          gif_url:    record.gifUrl,
          author:     record.author,
          author_id:  record.authorId,
          uses:       record.uses,
          rating:     record.rating,
          featured:   record.featured ?? false,
          created_at: record.createdAt,
          updated_at: record.updatedAt,
        }) as unknown) as Promise<unknown>,
        TIMEOUT_OP,
        'sbInsertPrompt',
      );
      const { error } = raw as SbRowWrite;
      if (error) throw new Error(formatSBError(error));
      return true;
    } catch (e: unknown) {
      lastErr = e;
      if (i === MAX_RETRY) break;
      await sleep(300 * i);
    }
  }
  throw lastErr;
}

async function sbDeletePrompt(id: string, authorId: string): Promise<boolean> {
  const sb = await getSB();
  if (!sb) throw new Error('Supabase not available');

  const raw = await withTimeout(
    (sb.from(TABLE).delete().eq('id', id).eq('author_id', authorId) as unknown) as Promise<unknown>,
    TIMEOUT_OP,
    'sbDeletePrompt',
  );
  const { error } = raw as SbRowWrite;
  if (error) throw new Error(formatSBError(error));
  return true;
}

async function sbIncrementUses(id: string): Promise<void> {
  const sb = await getSB();
  if (!sb) return;
  try {
    await withTimeout(
      (sb.rpc('increment_prompt_uses', { prompt_id: id }) as unknown) as Promise<unknown>,
      TIMEOUT_OP,
      'sbIncrementUses',
    );
  } catch (e: unknown) {
    // Non-critical
    console.warn('[explore] sbIncrementUses failed (non-fatal):', e instanceof Error ? e.message : e);
  }
}

// Map raw Supabase row (snake_case) → camelCase PromptRecord
function rowToPrompt(row: Record<string, unknown>): PromptRecord {
  return {
    id:        String(row.id ?? ''),
    title:     String(row.title ?? ''),
    content:   String(row.content ?? ''),
    gifUrl:    row.gif_url ? String(row.gif_url) : null,
    author:    String(row.author ?? ''),
    authorId:  String(row.author_id ?? ''),
    uses:      Number(row.uses ?? 0),
    rating:    Number(row.rating ?? 0),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    featured:  Boolean(row.featured ?? false),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

function validatePublishBody(body: PublishBody): { error: string } | {
  title: string; content: string; gifUrl: string | null;
} {
  const title   = sanitizeStr(String(body.title ?? ''), MAX_TITLE_LEN).trim();
  const content = sanitizeStr(String(body.content ?? ''), MAX_CONTENT_LEN).trim();
  const gifUrl  = body.gifUrl ? sanitizeGifUrl(body.gifUrl) : null;

  if (title.length < MIN_TITLE_LEN)   return { error: `Title must be at least ${MIN_TITLE_LEN} characters.` };
  if (content.length < MIN_CONTENT_LEN) return { error: `Prompt must be at least ${MIN_CONTENT_LEN} characters.` };
  if (body.gifUrl && !gifUrl)          return { error: 'gifUrl must be a valid https URL.' };

  return { title, content, gifUrl };
}

// ═══════════════════════════════════════════════════════════════════════════
// CORS & ERROR HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function setCors(res: AdaptedResponse): void {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Nexus-Nonce');
  res.setHeader('X-Content-Type-Options',       'nosniff');
  res.setHeader('Cache-Control',                'no-store');
}

function errResponse(res: AdaptedResponse, e: unknown): AdaptedResponse {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[explore] storage error:', msg);
  return res.status(500).json({
    error:  'A storage error occurred.',
    code:   'STORAGE_ERROR',
    detail: msg,
    hint:   _sb.error ? 'Supabase init error: ' + _sb.error : undefined,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

const handler: HandlerFn = async (req: AdaptedRequest, res: AdaptedResponse) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const ip: string = (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';
  if (!checkRateLimit(`explore:${ip}`, 120)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  // ══════════════════════════════════════════════════════════
  // GET — list / search / filter prompts
  //   ?q=<search>           filter by title or content
  //   ?author=<username>    only this author's prompts
  //   ?limit=<n>            default 30, max 60
  // ══════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    try {
      const author = normalizeKey(req.query['author'] ?? '');
      const all    = await sbListPrompts(author || undefined);
      let prompts  = all.map(rowToPrompt);

      const q     = normalizeKey(req.query['q'] ?? '');
      const limit = Math.min(
        MAX_LIST_LIMIT,
        Math.max(1, parseInt(String(req.query['limit'] ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
      );

      if (q) {
        prompts = prompts.filter(p =>
          p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
        );
      }

      // Featured first → highest rating → most used → newest
      prompts.sort((a, b) => {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        if (b.rating !== a.rating) return b.rating - a.rating;
        if (b.uses !== a.uses) return b.uses - a.uses;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return res.status(200).json({
        prompts: prompts.slice(0, limit),
        total:   prompts.length,
      });
    } catch (e: unknown) {
      return errResponse(res, e);
    }
  }

  // ══════════════════════════════════════════════════════════
  // POST — publish prompt baru
  //   Body: { user, robloxId, title, content, gifUrl?, auto? }
  //
  //   Field `auto: true` dikirim oleh chats.ts saat auto-publish
  //   agar bisa dibedakan dari publish manual untuk rate limiting.
  // ══════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    let body: PublishBody;
    try {
      body = typeof req.body === 'string'
        ? (JSON.parse(req.body) as PublishBody)
        : ((req.body as PublishBody) ?? {});
    } catch (e: unknown) {
      return res.status(400).json({ error: 'Invalid JSON: ' + (e instanceof Error ? e.message : e) });
    }

    const username = sanitizeStr(String(body.user ?? ''), 50).toLowerCase().trim();
    if (!username || !/^[a-z0-9_]{3,50}$/i.test(username)) {
      return res.status(400).json({ error: 'A valid "user" is required.' });
    }

    // Rate limit berbeda untuk auto vs manual
    const isAuto    = body.auto === true || body.auto === 'true';
    const rlKey     = `explore_publish:${username}`;
    const rlLimit   = isAuto ? RL_PUBLISH_AUTO : RL_PUBLISH_MANUAL;
    if (!checkRateLimit(rlKey, rlLimit)) {
      return res.status(429).json({ error: 'Too many publish attempts. Please wait a moment.' });
    }

    const validated = validatePublishBody(body);
    if ('error' in validated) {
      return res.status(400).json({ error: validated.error });
    }

    const now = new Date().toISOString();
    const record: PromptRecord = {
      id:        generatePromptId(),
      title:     validated.title,
      content:   validated.content,
      gifUrl:    validated.gifUrl,
      author:    username,
      authorId:  sanitizeStr(String(body.robloxId ?? ''), 50),
      uses:      0,
      rating:    0,
      createdAt: now,
      updatedAt: now,
      featured:  false,
    };

    try {
      await sbInsertPrompt(record);
      return res.status(200).json({
        success: true,
        prompt:  record,
        auto:    isAuto,
      });
    } catch (e: unknown) {
      return errResponse(res, e);
    }
  }

  // ══════════════════════════════════════════════════════════
  // DELETE — hapus prompt milik caller
  //   ?id=<promptId>&authorId=<robloxId>
  // ══════════════════════════════════════════════════════════
  if (req.method === 'DELETE') {
    const id       = sanitizeStr(String(req.query['id'] ?? ''), 100);
    const authorId = sanitizeStr(String(req.query['authorId'] ?? ''), 50);

    if (!id)       return res.status(400).json({ error: 'Parameter "id" is required.' });
    if (!authorId) return res.status(400).json({ error: 'Parameter "authorId" is required.' });

    try {
      await sbDeletePrompt(id, authorId);
      return res.status(200).json({ success: true, deleted: id });
    } catch (e: unknown) {
      return errResponse(res, e);
    }
  }

  // ══════════════════════════════════════════════════════════
  // PATCH — increment use counter saat prompt di-copy/dipakai
  //   Body: { id }
  // ══════════════════════════════════════════════════════════
  if (req.method === 'PATCH') {
    let body: { id?: unknown };
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    } catch {
      return res.status(400).json({ error: 'Invalid JSON.' });
    }
    const id = sanitizeStr(String(body.id ?? ''), 100);
    if (!id) return res.status(400).json({ error: 'Parameter "id" is required.' });

    await sbIncrementUses(id);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;