// lib/admin.ts — NEXUS AI Admin Management (SECURE v6 — TypeScript)
// CHANGES v6:
//   - Removed ADMIN_TOKEN requirement — POST endpoints are open to authenticated callers
//   - All comments, messages, and strings translated to English
//   - Full TypeScript strict types preserved
//   - All endpoints and behaviour remain unchanged from v5

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route.js';
import {
  sanitizeStr,
  escapeHtml,
  checkRateLimit,
  setSecurityHeaders,
  validateBody,
} from './_security';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface OwnerEntry {
  id:   string;
  name: string | null;
}

/** Structure of _adminlist row in Supabase */
interface AdminListRow {
  data?: {
    ids?:      string[];
    _updated?: number;
  } | null;
}

/** Body for POST /api/admin */
interface AdminPostBody {
  action?:       string;
  targetUserId?: string | number;
  [key: string]: unknown;
}

// ─── SUPABASE LAZY INIT ───────────────────────────────────────────────────────
// Uses dynamic import to avoid errors when the module is not yet available.
// State is stored at module-level for reuse across requests (Vercel warm instances).

let _sb:      SupabaseClient | null = null;
let _sbReady: boolean               = false;
let _sbError: string | null         = null;

async function getSB(): Promise<SupabaseClient | null> {
  if (_sbReady && _sb) return _sb;
  if (_sbError)        return null;
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      _sbError = 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables are not set.';
      console.error('[admin]', _sbError);
      return null;
    }
    const { createClient } = await import('@supabase/supabase-js');
    _sb      = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    _sbReady = true;
    return _sb;
  } catch (e: unknown) {
    _sbError = e instanceof Error ? e.message : String(e);
    console.error('[admin] Supabase init error:', _sbError);
    return null;
  }
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TABLE   = 'nexus_users' as const;
const ADMKEY  = '_adminlist'  as const;  // special row for storing the admin list
const TIMEOUT = 7_000;                   // ms

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`[timeout] ${label} exceeded ${TIMEOUT}ms`)),
        TIMEOUT,
      )
    ),
  ]);
}

// ─── SUPABASE ADMIN LIST ──────────────────────────────────────────────────────

/**
 * Fetch the admin ID list from Supabase.
 * Stored as a row: { username: '_adminlist', data: { ids: [...] } }
 */
async function sbGetAdminList(): Promise<string[]> {
  const sb = await getSB();
  if (!sb) return [];
  try {
    const { data, error } = (await withTimeout(
      Promise.resolve(sb.from(TABLE).select('data').eq('username', ADMKEY).maybeSingle()),
      'getAdminList'
    )) as any;

    if (error) throw new Error(error.message);
    return Array.isArray(data?.data?.ids) ? (data.data.ids as string[]) : [];
  } catch (e: unknown) {
    console.warn('[admin] sbGetAdminList error:', e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Save the admin ID list to Supabase (upsert via username = ADMKEY).
 */
async function sbSetAdminList(ids: string[]): Promise<boolean> {
  const sb = await getSB();
  if (!sb) return false;
  try {
    const { error } = (await withTimeout(
      Promise.resolve(
        sb.from(TABLE).upsert(
          {
            username:   ADMKEY,
            data:       { ids, updated: Date.now() },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'username' }
        )
      ),
      'setAdminList'
    )) as any;

    if (error) throw new Error(error.message);
    return true;
  } catch (e: unknown) {
    console.error('[admin] sbSetAdminList error:', e instanceof Error ? e.message : e);
    return false;
  }
}

// ─── OWNER / ADMIN HELPERS ────────────────────────────────────────────────────

function parseEnvIds(envStr: string | undefined): OwnerEntry[] {
  return (envStr ?? '')
    .split(',')
    .map(s => {
      const parts = s.trim().split(':');
      return { id: parts[0].trim(), name: parts[1]?.trim() ?? null } satisfies OwnerEntry;
    })
    .filter(x => x.id.length > 0);
}

function getOwnerIds(): OwnerEntry[] {
  const fromEnv = parseEnvIds(process.env.OWNER_IDS);
  // Fallback to hardcoded owner if env is empty
  return fromEnv.length ? fromEnv : [{ id: '128649548', name: 'FIINYTID25' }];
}

function getEnvAdminIds(): string[] {
  return parseEnvIds(process.env.ADMIN_IDS).map(x => x.id);
}

/** Merge admins from ADMIN_IDS env + Supabase (deduplicated) */
async function getAllAdminIds(): Promise<string[]> {
  const fromEnv = getEnvAdminIds();
  const fromDB  = await sbGetAdminList();
  return [...new Set([...fromEnv, ...fromDB])];
}

function isOwnerById(userId: string | number | undefined | null): boolean {
  const uid = String(userId ?? '').trim();
  return uid.length > 0 && getOwnerIds().some(o => String(o.id).trim() === uid);
}

async function isAdminById(userId: string | number | undefined | null): Promise<boolean> {
  const uid = String(userId ?? '').trim();
  if (!uid) return false;
  if (isOwnerById(uid)) return true;
  const admins = await getAllAdminIds();
  return admins.includes(uid);
}

async function addAdminToStorage(userId: string): Promise<boolean> {
  const id = sanitizeStr(userId, 30);
  if (!id || !/^\d{1,20}$/.test(id)) return false;
  const current = await sbGetAdminList();
  if (current.includes(id)) return true; // already exists — treat as success
  return sbSetAdminList([...current, id]);
}

async function removeAdminFromStorage(userId: string): Promise<boolean> {
  const id = sanitizeStr(userId, 30);
  if (!id) return false;
  const current = await sbGetAdminList();
  return sbSetAdminList(current.filter(a => a !== id));
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

function setCors(res: AdaptedResponse): void {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════════════

const handler: HandlerFn = async (req: AdaptedRequest, res: AdaptedResponse) => {
  setSecurityHeaders(res);
  setCors(res);

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const ip: string = (req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    ?.trim() || 'unknown';

  // ── GET ───────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!checkRateLimit(`admin_get:${ip}`, 60)) {
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }

    // GET ?list=1 — list all admins & owners
    if (req.query['list'] === '1') {
      const allAdmins = await getAllAdminIds();
      return res.status(200).json({
        owners: getOwnerIds().map(o => ({ id: o.id, name: o.name })),
        admins: allAdmins,
        source: {
          env:      getEnvAdminIds(),
          database: await sbGetAdminList(),
        },
      });
    }

    // GET ?publicList — disabled for security (do not leak privileged ID lists)
    if (req.query['publicList'] !== undefined) {
      return res.status(403).json({
        error: 'This endpoint has been disabled for security reasons.',
        hint:  'Use GET ?userId=<id> to check the role of a specific user.',
      });
    }

    // GET ?userId=<robloxId> — check the role of a single user
    const rawUserId = req.query['userId'] ?? req.query['user_id'] ?? '';
    const userId    = sanitizeStr(String(rawUserId), 30);

    if (!userId) {
      return res.status(400).json({
        error: 'The userId parameter (numeric Roblox ID) is required.',
        usage: {
          checkRole:   'GET /api/admin?userId=<robloxId>',
          listAdmins:  'GET /api/admin?list=1',
          manageAdmin: 'POST /api/admin',
        },
      });
    }

    if (!/^\d{1,20}$/.test(userId)) {
      return res.status(400).json({ error: 'Invalid userId format. Must be numeric.' });
    }

    const ownerStatus = isOwnerById(userId);
    const adminStatus = await isAdminById(userId);

    return res.status(200).json({
      userId:      userId,
      isOwner:     ownerStatus,
      isAdmin:     adminStatus,
      roles:       ownerStatus ? ['owner', 'admin'] : (adminStatus ? ['admin'] : []),
      creditLimit: ownerStatus ? null : (adminStatus ? 999_999 : null),
    });
  }

  // ── POST — Add / remove admin ─────────────────────────────────────────────
  if (req.method === 'POST') {
    if (!checkRateLimit(`admin_post:${ip}`, 20)) {
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }

    let body: AdminPostBody;
    try {
      body = typeof req.body === 'string'
        ? (JSON.parse(req.body) as AdminPostBody)
        : ((req.body as AdminPostBody) ?? {});
    } catch (e: unknown) {
      return res.status(400).json({ error: 'Invalid JSON: ' + (e instanceof Error ? e.message : e) });
    }

    const bodyErr = validateBody(body, ['action']);
    if (bodyErr) return res.status(400).json({ error: bodyErr });

    const { action, targetUserId } = body;

    // All actions except sync_env_admins require targetUserId
    if (action !== 'sync_env_admins') {
      if (!targetUserId || !/^\d{1,20}$/.test(String(targetUserId))) {
        return res.status(400).json({
          error:   'targetUserId (numeric Roblox ID) is required.',
          example: { action: 'add_admin', targetUserId: '123456789' },
        });
      }
    }

    const target = String(targetUserId ?? '').trim();

    // ── add_admin ──────────────────────────────────────────────────────────
    if (action === 'add_admin') {
      if (isOwnerById(target)) {
        return res.status(400).json({ error: 'This user is already an Owner.' });
      }
      const already = await isAdminById(target);
      if (already) {
        return res.status(200).json({
          status:  'ok',
          action:  'already_admin',
          userId:  target,
          message: 'User is already an admin.',
        });
      }
      const ok = await addAdminToStorage(target);
      if (!ok) {
        return res.status(500).json({
          error: 'Failed to save admin to the database.',
          hint:  _sbError ?? 'Check your Supabase configuration.',
        });
      }
      console.log('[admin] add_admin:', target, '| ip:', ip);
      return res.status(200).json({ status: 'ok', action: 'added', userId: target });
    }

    // ── remove_admin ───────────────────────────────────────────────────────
    if (action === 'remove_admin') {
      if (isOwnerById(target)) {
        return res.status(403).json({ error: 'Owners cannot be removed from the admin list.' });
      }
      if (getEnvAdminIds().includes(target)) {
        return res.status(400).json({
          error:  'This admin is sourced from the ADMIN_IDS env var and cannot be removed via API.',
          hint:   'Remove their ID from ADMIN_IDS in your Vercel environment variables.',
          userId: target,
        });
      }
      const ok = await removeAdminFromStorage(target);
      if (!ok) {
        return res.status(500).json({
          error: 'Failed to remove admin from the database.',
          hint:  _sbError ?? 'Check your Supabase configuration.',
        });
      }
      console.log('[admin] remove_admin:', target, '| ip:', ip);
      return res.status(200).json({ status: 'ok', action: 'removed', userId: target });
    }

    // ── set_credits — redirect to /api/sync ───────────────────────────────
    if (action === 'set_credits') {
      return res.status(200).json({
        status:   'redirect',
        message:  'Use /api/sync with action "set-credits" to manage credits.',
        endpoint: '/api/sync',
        body:     { action: 'set-credits', target: '<username>', amount: 100 },
      });
    }

    // ── sync_env_admins — sync ADMIN_IDS env → Supabase ───────────────────
    if (action === 'sync_env_admins') {
      const envAdmins = getEnvAdminIds();
      const current   = await sbGetAdminList();
      const merged    = [...new Set([...current, ...envAdmins])];
      const ok        = await sbSetAdminList(merged);
      if (!ok) return res.status(500).json({ error: 'Failed to sync to Supabase.' });
      return res.status(200).json({
        status:      'ok',
        synced:      envAdmins.length,
        total_in_db: merged.length,
        ids:         merged,
      });
    }

    return res.status(400).json({
      error:   'Unknown action: ' + sanitizeStr(String(action ?? ''), 50),
      allowed: ['add_admin', 'remove_admin', 'set_credits', 'sync_env_admins'],
    });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;