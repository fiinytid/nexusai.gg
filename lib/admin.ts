// lib/admin.ts — NEXUS AI Admin Management (SECURE v5 — TypeScript)
// CHANGES v5:
//   - Converted dari admin.js ke TypeScript penuh (strict types)
//   - Supabase lazy-init dengan proper typing (SupabaseClient)
//   - Hapus getSBSync() yang tidak dipakai & bergantung pada createClient yang belum di-import
//   - Type-safe untuk semua helper: parseEnvIds, sbGetAdminList, dsb.
//   - Import _security dari path relatif (mendukung .ts & .js via route resolver)
//   - Tidak ada perubahan behaviour — semua endpoint tetap sama

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route.js';
import {
  verifyAdminToken,
  sanitizeStr,
  escapeHtml,
  checkRateLimit,
  setSecurityHeaders,
  validateBody,
} from './_security';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface OwnerEntry {
  id:   string;
  name: string | null;
}

/** Struktur baris _adminlist di Supabase */
interface AdminListRow {
  data?: {
    ids?:      string[];
    _updated?: number;
  } | null;
}

/** Body POST /api/admin */
interface AdminPostBody {
  action?:       string;
  targetUserId?: string | number;
  [key: string]: unknown;
}

// ─── SUPABASE LAZY INIT ───────────────────────────────────────────────────────
// Menggunakan dynamic import supaya tidak error saat modul belum tersedia.
// State disimpan di module-level untuk re-use antar request (Vercel warm instance).

let _sb:      SupabaseClient | null = null;
let _sbReady: boolean               = false;
let _sbError: string | null         = null;

async function getSB(): Promise<SupabaseClient | null> {
  if (_sbReady && _sb) return _sb;
  if (_sbError)        return null;
  try {
    const url = process.env.STORAGE_NEXUS_SUPABASE_URL;
    const key = process.env.STORAGE_NEXUS_SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      _sbError = 'STORAGE_NEXUS_SUPABASE_URL atau SERVICE_ROLE_KEY belum di-set.';
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

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const TABLE   = 'nexus_users' as const;
const ADMKEY  = '_adminlist'  as const;  // baris khusus untuk simpan daftar admin
const TIMEOUT = 7_000;                   // ms

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`[timeout] ${label} melebihi ${TIMEOUT}ms`)),
        TIMEOUT,
      )
    ),
  ]);
}

// ─── SUPABASE ADMIN LIST ─────────────────────────────────────────────────────

/**
 * Ambil daftar admin ID dari Supabase.
 * Disimpan sebagai baris: { username: '_adminlist', data: { ids: [...] } }
 */
async function sbGetAdminList(): Promise<string[]> {
  const sb = await getSB();
  if (!sb) return [];
  try {
    // Kita bungkus query Supabase pakai Promise.resolve agar tipenya sah menjadi Promise murni
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
 * Simpan daftar admin ID ke Supabase (upsert via username = ADMKEY).
 */
async function sbSetAdminList(ids: string[]): Promise<boolean> {
  const sb = await getSB();
  if (!sb) return false;
  try {
    // Di sini juga kita bungkus pakai Promise.resolve
    const { error } = (await withTimeout(
      Promise.resolve(
        sb.from(TABLE).upsert(
          {
            username: ADMKEY,
            data: { ids, updated: Date.now() },
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

// ─── OWNER / ADMIN HELPERS ───────────────────────────────────────────────────

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
  // Fallback ke hardcoded owner jika env kosong
  return fromEnv.length ? fromEnv : [{ id: '128649548', name: 'FIINYTID25' }];
}

function getEnvAdminIds(): string[] {
  return parseEnvIds(process.env.ADMIN_IDS).map(x => x.id);
}

/** Gabungkan admin dari env ADMIN_IDS + dari Supabase (deduplicate) */
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
  if (current.includes(id)) return true; // sudah ada — anggap sukses
  return sbSetAdminList([...current, id]);
}

async function removeAdminFromStorage(userId: string): Promise<boolean> {
  const id = sanitizeStr(userId, 30);
  if (!id) return false;
  const current = await sbGetAdminList();
  return sbSetAdminList(current.filter(a => a !== id));
}

// ─── CORS ────────────────────────────────────────────────────────────────────

function setCors(res: AdaptedResponse): void {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═════════════════════════════════════════════════════════════════════════════

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
      return res.status(429).json({ error: 'Rate limit.' });
    }

    // GET ?list=1 — daftar semua admin & owner (butuh token)
    if (req.query['list'] === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized: Admin token diperlukan.' });
      }
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

    // GET ?publicList — DINONAKTIFKAN (keamanan: jangan bocorkan daftar ID privilege)
    if (req.query['publicList'] !== undefined) {
      return res.status(403).json({
        error: 'Endpoint ini telah dinonaktifkan karena alasan keamanan.',
        hint:  'Gunakan GET ?userId=<id> untuk mengecek role user tertentu.',
      });
    }

    // GET ?userId=<robloxId> — cek role satu user
    const rawUserId = req.query['userId'] ?? req.query['user_id'] ?? '';
    const userId    = sanitizeStr(String(rawUserId), 30);

    if (!userId) {
      return res.status(400).json({
        error: 'Parameter userId (Roblox ID numerik) diperlukan.',
        usage: {
          checkRole:   'GET /api/admin?userId=<robloxId>',
          listAdmins:  'GET /api/admin?list=1  [Authorization: Bearer TOKEN]',
          manageAdmin: 'POST /api/admin         [Authorization: Bearer TOKEN]',
        },
      });
    }

    if (!/^\d{1,20}$/.test(userId)) {
      return res.status(400).json({ error: 'Format userId tidak valid. Harus berupa angka.' });
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

  // ── POST — Tambah / hapus admin (butuh ADMIN_TOKEN) ───────────────────────
  if (req.method === 'POST') {
    if (!checkRateLimit(`admin_post:${ip}`, 20)) {
      return res.status(429).json({ error: 'Rate limit.' });
    }

    // ⚠️ Token WAJIB dari Authorization header atau X-Admin-Token header.
    if (!verifyAdminToken(req)) {
      return res.status(403).json({
        error: 'Forbidden: ADMIN_TOKEN diperlukan via Authorization: Bearer <token>.',
        hint:  'Set ADMIN_TOKEN di env vars Vercel dan kirim via header.',
      });
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

    // Semua action kecuali sync_env_admins butuh targetUserId
    if (action !== 'sync_env_admins') {
      if (!targetUserId || !/^\d{1,20}$/.test(String(targetUserId))) {
        return res.status(400).json({
          error:   'targetUserId (Roblox ID numerik) wajib diisi.',
          example: { action: 'add_admin', targetUserId: '123456789' },
        });
      }
    }

    const target = String(targetUserId ?? '').trim();

    // ── add_admin ─────────────────────────────────────────────────────────
    if (action === 'add_admin') {
      if (isOwnerById(target)) {
        return res.status(400).json({ error: 'User ini sudah menjadi Owner.' });
      }
      const already = await isAdminById(target);
      if (already) {
        return res.status(200).json({
          status:  'ok',
          action:  'already_admin',
          userId:  target,
          message: 'User sudah menjadi admin.',
        });
      }
      const ok = await addAdminToStorage(target);
      if (!ok) {
        return res.status(500).json({
          error: 'Gagal menyimpan admin ke database.',
          hint:  _sbError ?? 'Cek konfigurasi Supabase.',
        });
      }
      console.log('[admin] add_admin:', target, '| ip:', ip);
      return res.status(200).json({ status: 'ok', action: 'added', userId: target });
    }

    // ── remove_admin ──────────────────────────────────────────────────────
    if (action === 'remove_admin') {
      if (isOwnerById(target)) {
        return res.status(403).json({ error: 'Owner tidak dapat dihapus dari daftar admin.' });
      }
      if (getEnvAdminIds().includes(target)) {
        return res.status(400).json({
          error:  'Admin ini berasal dari ADMIN_IDS env var dan tidak dapat dihapus via API.',
          hint:   'Hapus ID-nya dari ADMIN_IDS di Vercel environment variables.',
          userId: target,
        });
      }
      const ok = await removeAdminFromStorage(target);
      if (!ok) {
        return res.status(500).json({
          error: 'Gagal menghapus admin dari database.',
          hint:  _sbError ?? 'Cek konfigurasi Supabase.',
        });
      }
      console.log('[admin] remove_admin:', target, '| ip:', ip);
      return res.status(200).json({ status: 'ok', action: 'removed', userId: target });
    }

    // ── set_credits — arahkan ke /api/sync ───────────────────────────────
    if (action === 'set_credits') {
      return res.status(200).json({
        status:   'redirect',
        message:  'Gunakan /api/sync dengan action "set-credits" untuk mengatur credits.',
        endpoint: '/api/sync',
        body:     { action: 'set-credits', target: '<username>', amount: 100 },
      });
    }

    // ── sync_env_admins — sinkronisasi ADMIN_IDS env → Supabase ──────────
    if (action === 'sync_env_admins') {
      const envAdmins = getEnvAdminIds();
      const current   = await sbGetAdminList();
      const merged    = [...new Set([...current, ...envAdmins])];
      const ok        = await sbSetAdminList(merged);
      if (!ok) return res.status(500).json({ error: 'Gagal sync ke Supabase.' });
      return res.status(200).json({
        status:      'ok',
        synced:      envAdmins.length,
        total_in_db: merged.length,
        ids:         merged,
      });
    }

    return res.status(400).json({
      error:   'Action tidak dikenal: ' + sanitizeStr(String(action ?? ''), 50),
      allowed: ['add_admin', 'remove_admin', 'set_credits', 'sync_env_admins'],
    });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;