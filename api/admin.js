// api/admin.js — NEXUS AI Admin Management (SECURE v4)
// FIXES v4:
//   - Kembali ke ESM (import/export default) — konsisten dengan _security.js
//   - Import langsung dari ./_security.js (file ini memang ada di repo)
//   - /tmp storage DIHAPUS — admin list kini tersimpan di Supabase (persistent)
//   - publicList endpoint DINONAKTIFKAN (keamanan: tidak bocorkan ID privilege)
//   - Semua endpoint yang dibutuhkan admin panel HTML tersedia lengkap
//   - CORS, rate limit, sanitasi, security headers via _security.js

import crypto from 'crypto';
import {
  verifyAdminToken,
  sanitizeStr,
  escapeHtml,
  checkRateLimit,
  setSecurityHeaders,
  validateBody,
} from './_security.js';

// ─── SUPABASE CLIENT (sync init, createClient adalah fungsi sync) ─────────────
let _sb = null, _sbReady = false, _sbError = null;

function getSBSync() {
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
    // @supabase/supabase-js: createClient adalah synchronous
    const { createClient } = await import('@supabase/supabase-js');
    _sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    _sbReady = true;
    return _sb;
  } catch (e) {
    _sbError = e.message;
    console.error('[admin] Supabase init error:', e.message);
    return null;
  }
}

// Karena ESM top-level await tidak selalu tersedia di Vercel Edge,
// gunakan lazy init async untuk Supabase
async function getSB() {
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
    _sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    _sbReady = true;
    return _sb;
  } catch (e) {
    _sbError = e.message;
    console.error('[admin] Supabase init error:', e.message);
    return null;
  }
}

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const TABLE   = 'nexus_users';
const ADMKEY  = '_adminlist';  // baris khusus di nexus_users untuk simpan daftar admin
const TIMEOUT = 7000;

function withTimeout(p, label) {
  return Promise.race([
    p,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`[timeout] ${label} melebihi ${TIMEOUT}ms`)), TIMEOUT)
    ),
  ]);
}

// ─── ADMIN LIST — TERSIMPAN DI SUPABASE (tidak pakai /tmp) ───────────────────

/**
 * Ambil daftar admin dari Supabase.
 * Disimpan sebagai baris { username: '_adminlist', data: { ids: [...] } }
 */
async function sbGetAdminList() {
  const sb = await getSB();
  if (!sb) return [];
  try {
    const { data, error } = await withTimeout(
      sb.from(TABLE).select('data').eq('username', ADMKEY).maybeSingle(),
      'getAdminList'
    );
    if (error) throw new Error(error.message);
    return Array.isArray(data?.data?.ids) ? data.data.ids : [];
  } catch (e) {
    console.warn('[admin] sbGetAdminList error:', e.message);
    return [];
  }
}

/**
 * Simpan daftar admin ke Supabase.
 */
async function sbSetAdminList(ids) {
  const sb = await getSB();
  if (!sb) return false;
  try {
    const { error } = await withTimeout(
      sb.from(TABLE).upsert(
        {
          username:   ADMKEY,
          data:       { ids, _updated: Date.now() },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'username' }
      ),
      'setAdminList'
    );
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.error('[admin] sbSetAdminList error:', e.message);
    return false;
  }
}

// ─── OWNER / ADMIN HELPERS ───────────────────────────────────────────────────

function parseEnvIds(envStr) {
  return (envStr || '').split(',').map(s => {
    const parts = s.trim().split(':');
    return { id: parts[0].trim(), name: parts[1]?.trim() || null };
  }).filter(x => x.id);
}

function getOwnerIds() {
  const fromEnv = parseEnvIds(process.env.OWNER_IDS);
  // Fallback ke hardcoded owner jika env kosong
  return fromEnv.length ? fromEnv : [{ id: '128649548', name: 'FIINYTID25' }];
}

function getEnvAdminIds() {
  return parseEnvIds(process.env.ADMIN_IDS).map(x => x.id);
}

/**
 * Gabungkan admin dari env ADMIN_IDS + dari Supabase (deduplicate)
 */
async function getAllAdminIds() {
  const fromEnv = getEnvAdminIds();
  const fromDB  = await sbGetAdminList();
  return [...new Set([...fromEnv, ...fromDB])];
}

function isOwnerById(userId) {
  const uid = String(userId || '').trim();
  return uid ? getOwnerIds().some(o => String(o.id).trim() === uid) : false;
}

async function isAdminById(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  if (isOwnerById(uid)) return true;
  const admins = await getAllAdminIds();
  return admins.includes(uid);
}

async function addAdminToStorage(userId) {
  const id = sanitizeStr(String(userId), 30);
  if (!id || !/^\d{1,20}$/.test(id)) return false;
  const current = await sbGetAdminList();
  if (current.includes(id)) return true; // sudah ada, anggap sukses
  return sbSetAdminList([...current, id]);
}

async function removeAdminFromStorage(userId) {
  const id = sanitizeStr(String(userId), 30);
  if (!id) return false;
  const current = await sbGetAdminList();
  return sbSetAdminList(current.filter(a => a !== id));
}

// ─── CORS ────────────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═════════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  setSecurityHeaders(res);
  setCors(res);

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';

  // ── GET ───────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!checkRateLimit(`admin_get:${ip}`, 60)) {
      return res.status(429).json({ error: 'Rate limit.' });
    }

    // GET ?list=1 — daftar semua admin & owner (butuh token)
    if (req.query.list === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized: Admin token diperlukan.' });
      }
      const allAdmins = await getAllAdminIds();
      return res.status(200).json({
        owners:  getOwnerIds().map(o => ({ id: o.id, name: o.name })),
        admins:  allAdmins,
        source: {
          env:      getEnvAdminIds(),
          database: await sbGetAdminList(),
        },
      });
    }

    // GET ?publicList — DINONAKTIFKAN (keamanan: jangan bocorkan daftar ID privilege)
    if (req.query.publicList !== undefined) {
      return res.status(403).json({
        error: 'Endpoint ini telah dinonaktifkan karena alasan keamanan.',
        hint:  'Gunakan GET ?userId=<id> untuk mengecek role user tertentu.',
      });
    }

    // GET ?userId=<robloxId> — cek role satu user (dipakai auth check di HTML admin panel)
    const userId = sanitizeStr(req.query.userId || req.query.user_id || '', 30);

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
      creditLimit: ownerStatus ? null : (adminStatus ? 999999 : null),
    });
  }

  // ── POST — Tambah / hapus admin (butuh ADMIN_TOKEN) ───────────────────────
  if (req.method === 'POST') {
    if (!checkRateLimit(`admin_post:${ip}`, 20)) {
      return res.status(429).json({ error: 'Rate limit.' });
    }

    // ⚠️ Token WAJIB dari Authorization header atau X-Admin-Token header.
    // Tidak diterima dari body (mencegah spoofing via Roblox ID yang diketahui).
    if (!verifyAdminToken(req)) {
      return res.status(403).json({
        error: 'Forbidden: ADMIN_TOKEN diperlukan via Authorization: Bearer <token>.',
        hint:  'Set ADMIN_TOKEN di env vars Vercel dan kirim via header.',
      });
    }

    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON: ' + e.message });
    }

    // Validasi body menggunakan validateBody dari _security.js
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

    const target = String(targetUserId || '').trim();

    // ── add_admin — jadikan user admin ───────────────────────────────────────
    if (action === 'add_admin') {
      if (isOwnerById(target)) {
        return res.status(400).json({ error: 'User ini sudah menjadi Owner.' });
      }
      const already = await isAdminById(target);
      if (already) {
        return res.status(200).json({
          status: 'ok', action: 'already_admin', userId: target,
          message: 'User sudah menjadi admin.',
        });
      }
      const ok = await addAdminToStorage(target);
      if (!ok) {
        return res.status(500).json({
          error: 'Gagal menyimpan admin ke database.',
          hint:  _sbError || 'Cek konfigurasi Supabase.',
        });
      }
      console.log('[admin] add_admin:', target, '| ip:', ip);
      return res.status(200).json({ status: 'ok', action: 'added', userId: target });
    }

    // ── remove_admin — cabut hak admin ───────────────────────────────────────
    if (action === 'remove_admin') {
      if (isOwnerById(target)) {
        return res.status(403).json({ error: 'Owner tidak dapat dihapus dari daftar admin.' });
      }
      // Admin dari env tidak bisa dihapus via API — harus edit ADMIN_IDS di Vercel
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
          hint:  _sbError || 'Cek konfigurasi Supabase.',
        });
      }
      console.log('[admin] remove_admin:', target, '| ip:', ip);
      return res.status(200).json({ status: 'ok', action: 'removed', userId: target });
    }

    // ── set_credits — arahkan ke /api/sync ───────────────────────────────────
    if (action === 'set_credits') {
      return res.status(200).json({
        status:   'redirect',
        message:  'Gunakan /api/sync dengan action "set-credits" untuk mengatur credits.',
        endpoint: '/api/sync',
        body:     { action: 'set-credits', target: '<username>', amount: 100 },
      });
    }

    // ── sync_env_admins — sinkronisasi ADMIN_IDS env → Supabase ─────────────
    // Berguna saat pertama deploy atau setelah mengubah env vars
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
      error:   'Action tidak dikenal: ' + sanitizeStr(action || '', 50),
      allowed: ['add_admin', 'remove_admin', 'set_credits', 'sync_env_admins'],
    });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}