'use strict';

/**
 * sync.js — Vercel Serverless API: User Data Sync
 * Storage: Supabase (primary) + Vercel KV (fallback/cache)
 *
 * PERBAIKAN v13:
 * - Supabase init tidak lagi "fail once, fail forever" — retry tiap 30s
 * - storageGet membedakan null-not-found vs error koneksi
 * - Semua error Supabase di-log dengan detail (code, hint, details)
 * - Validasi env vars lebih ketat + pesan error lebih jelas
 * - Perbaikan race condition inisialisasi client (init lock)
 * - KV fallback lebih andal dengan status eksplisit
 * - Payload size guard lebih agresif
 * - Cleanup rate-limiter lebih efisien
 * - Dokumentasi inline ditingkatkan
 */

const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const TABLE       = 'nexus_users';
const TIMEOUT_OP  = 8000;   // ms per operasi storage
const MAX_RETRY   = 3;
const KV_PREFIX   = 'nexusai:';
const KV_TTL      = 60 * 60 * 24 * 365 * 2; // 2 tahun
const MAX_PAYLOAD = 900 * 1024;              // 900 KB — batas aman Supabase (<1 MB)
const SB_RETRY_COOLDOWN = 30_000;           // 30 detik sebelum retry init Supabase

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(
        () => rej(new Error(`[timeout] "${label}" melebihi ${ms}ms`)),
        ms
      )
    ),
  ]);
}

/**
 * Hapus karakter kontrol dan tag HTML dasar.
 */
function sanitizeStr(str, maxLen = 200) {
  if (typeof str !== 'string') str = String(str == null ? '' : str);
  return str
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .substring(0, maxLen);
}

function normalizeKey(key) {
  return (key || '').toLowerCase().trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN TOKEN VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

function verifyAdminToken(req) {
  const envToken = process.env.ADMIN_TOKEN;
  if (!envToken || envToken.length < 8) return false;

  const candidate =
    (req.headers?.['authorization'] || '').replace(/^Bearer\s+/i, '').trim() ||
    (req.headers?.['x-admin-token'] || '').trim() ||
    (typeof req.query?.token === 'string' ? req.query.token.trim() : '');

  if (!candidate) return false;

  try {
    const maxLen = Math.max(candidate.length, envToken.length, 32);
    const a = Buffer.alloc(maxLen, 0);
    const b = Buffer.alloc(maxLen, 0);
    Buffer.from(candidate).copy(a);
    Buffer.from(envToken).copy(b);
    return crypto.timingSafeEqual(a, b) && candidate === envToken;
  } catch {
    return candidate === envToken;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITER (in-memory, per cold-start)
// ═══════════════════════════════════════════════════════════════════════════

const _rl = new Map();

function checkRateLimit(key, maxPerMin = 60) {
  const now = Date.now();
  const k   = String(key).substring(0, 100);

  let r = _rl.get(k);
  if (!r || now > r.reset) {
    r = { count: 0, reset: now + 60_000 };
    _rl.set(k, r);
  }
  r.count++;

  // Bersihkan entri kedaluwarsa secara periodik
  if (_rl.size > 2000) {
    for (const [mk, mv] of _rl) {
      if (now > mv.reset) _rl.delete(mk);
    }
  }

  return r.count <= maxPerMin;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT — singleton dengan retry-on-error
// ═══════════════════════════════════════════════════════════════════════════

const _sbState = {
  client:      null,
  ready:       false,
  error:       null,   // pesan error terakhir (string | null)
  nextRetry:   0,      // timestamp boleh retry (ms)
  envSnapshot: '',
  initLock:    false,  // cegah init bersamaan
};

/**
 * Mengembalikan Supabase client, atau null jika tidak tersedia.
 * Jika sebelumnya gagal, akan dicoba ulang setelah SB_RETRY_COOLDOWN.
 */
function getSBSync() {
  const envSnap =
    (process.env.STORAGE_NEXUS_SUPABASE_URL || '') + '|' +
    (process.env.STORAGE_NEXUS_SUPABASE_SERVICE_ROLE_KEY || '');

  // Reset jika env berubah (live reload / secret rotation)
  if (_sbState.envSnapshot && _sbState.envSnapshot !== envSnap) {
    console.log('[supabase] Env berubah, reset client...');
    Object.assign(_sbState, {
      client: null, ready: false, error: null, nextRetry: 0
    });
  }
  _sbState.envSnapshot = envSnap;

  if (_sbState.ready && _sbState.client) return _sbState.client;

  // Cooldown setelah error sebelumnya
  if (_sbState.error && Date.now() < _sbState.nextRetry) return null;

  // Cegah concurrent init
  if (_sbState.initLock) return null;
  _sbState.initLock = true;

  try {
    const url = process.env.STORAGE_NEXUS_SUPABASE_URL;
    const key = process.env.STORAGE_NEXUS_SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !url.startsWith('https://')) {
      throw new Error(
        'STORAGE_NEXUS_SUPABASE_URL tidak valid. ' +
        'Format: https://<project-id>.supabase.co'
      );
    }
    if (!key || key.length < 20) {
      throw new Error(
        'STORAGE_NEXUS_SUPABASE_SERVICE_ROLE_KEY tidak valid atau terlalu pendek.'
      );
    }

    const { createClient } = require('@supabase/supabase-js');
    _sbState.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { 'X-Client-Info': 'nexus-sync/13' },
      },
    });
    _sbState.ready     = true;
    _sbState.error     = null;
    _sbState.nextRetry = 0;
    console.log('[supabase] ✅ Client berhasil diinisialisasi.');
    return _sbState.client;
  } catch (e) {
    _sbState.error     = e.message;
    _sbState.ready     = false;
    _sbState.client    = null;
    _sbState.nextRetry = Date.now() + SB_RETRY_COOLDOWN;
    console.error('[supabase] ❌ Init gagal:', e.message);
    return null;
  } finally {
    _sbState.initLock = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// KV CLIENT — singleton
// ═══════════════════════════════════════════════════════════════════════════

const _kvState = {
  client:      null,
  ready:       false,
  error:       null,
  envSnapshot: '',
};

function getKVSync() {
  const envSnap =
    (process.env.KV_REST_API_URL || '') + '|' +
    (process.env.KV_REST_API_TOKEN || '');

  if (_kvState.envSnapshot && _kvState.envSnapshot !== envSnap) {
    Object.assign(_kvState, { client: null, ready: false, error: null });
  }
  _kvState.envSnapshot = envSnap;

  if (_kvState.ready && _kvState.client) return _kvState.client;
  if (_kvState.error) return null; // KV tidak retry (jarang berubah)

  try {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      throw new Error('KV_REST_API_URL atau KV_REST_API_TOKEN belum di-set.');
    }
    const mod    = require('@vercel/kv');
    const client = mod.kv || mod.default || mod;
    if (typeof client.get !== 'function') {
      throw new Error('@vercel/kv: method .get() tidak ditemukan.');
    }
    _kvState.client = client;
    _kvState.ready  = true;
    _kvState.error  = null;
    console.log('[kv] ✅ KV client berhasil diinisialisasi.');
    return _kvState.client;
  } catch (e) {
    _kvState.error = e.message;
    // KV opsional — tidak perlu error fatal
    console.warn('[kv] ⚠️ KV tidak tersedia (opsional):', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT ERROR SUPABASE — ekstrak detail dari response error
// ═══════════════════════════════════════════════════════════════════════════

function formatSBError(error) {
  if (!error) return 'Unknown Supabase error';
  const parts = [error.message || String(error)];
  if (error.code)    parts.push(`code=${error.code}`);
  if (error.hint)    parts.push(`hint=${error.hint}`);
  if (error.details) parts.push(`details=${error.details}`);
  return parts.join(' | ');
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ambil data user dari Supabase.
 * Returns: data object | null (tidak ada) | throws Error (error koneksi)
 */
async function sbGet(username) {
  const sb = getSBSync();
  if (!sb) throw new Error('Supabase tidak tersedia: ' + (_sbState.error || 'inisialisasi gagal'));

  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      const { data, error } = await withTimeout(
        sb.from(TABLE)
          .select('data')
          .eq('username', username)
          .maybeSingle(),
        TIMEOUT_OP,
        'sbGet'
      );
      if (error) throw new Error(formatSBError(error));
      return data ? data.data : null;
    } catch (e) {
      console.warn(`[supabase] sbGet attempt ${i}/${MAX_RETRY}:`, e.message);
      if (i === MAX_RETRY) throw e;
      await sleep(200 * i);
    }
  }
  return null;
}

/**
 * Simpan data user ke Supabase (upsert).
 */
async function sbSet(username, payload) {
  const sb = getSBSync();
  if (!sb) throw new Error('Supabase tidak tersedia: ' + (_sbState.error || 'inisialisasi gagal'));

  payload = trimUserData(payload);

  // Cek ukuran sebelum kirim
  const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (payloadBytes > MAX_PAYLOAD) {
    console.warn(
      `[supabase] Payload ${(payloadBytes / 1024).toFixed(1)} KB — memangkas convs lama...`
    );
    payload.convs    = (payload.convs    || []).slice(-6);
    payload.allConvs = (payload.allConvs || []).slice(-6);

    const sizeAfter = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (sizeAfter > MAX_PAYLOAD) {
      payload.convs    = [];
      payload.allConvs = [];
      console.warn('[supabase] Convs dikosongkan karena payload masih terlalu besar.');
    }
  }

  let lastErr;
  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      const { error } = await withTimeout(
        sb.from(TABLE).upsert(
          {
            username,
            data:       payload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'username' }
        ),
        TIMEOUT_OP,
        'sbSet'
      );
      if (error) throw new Error(formatSBError(error));
      return payload;
    } catch (e) {
      lastErr = e;
      console.warn(`[supabase] sbSet attempt ${i}/${MAX_RETRY}:`, e.message);
      if (i === MAX_RETRY) break;
      await sleep(300 * i);
    }
  }
  throw lastErr;
}

async function sbDel(username) {
  const sb = getSBSync();
  if (!sb) throw new Error('Supabase tidak tersedia');

  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      const { error } = await withTimeout(
        sb.from(TABLE).delete().eq('username', username),
        TIMEOUT_OP,
        'sbDel'
      );
      if (error) throw new Error(formatSBError(error));
      return true;
    } catch (e) {
      console.warn(`[supabase] sbDel attempt ${i}/${MAX_RETRY}:`, e.message);
      if (i === MAX_RETRY) throw e;
      await sleep(200 * i);
    }
  }
  return false;
}

async function sbList() {
  const sb = getSBSync();
  if (!sb) return {};
  try {
    const { data, error } = await withTimeout(
      sb.from(TABLE)
        .select('username, data')
        .order('username'),
      TIMEOUT_OP * 2,
      'sbList'
    );
    if (error) throw new Error(formatSBError(error));
    const result = {};
    for (const row of (data || [])) {
      if (row.username && !row.username.startsWith('_')) {
        result[row.username] = row.data;
      }
    }
    return result;
  } catch (e) {
    console.error('[supabase] sbList error:', e.message);
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// KV OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function kvGet(username) {
  const kv = getKVSync();
  if (!kv) return null;
  try {
    const val = await withTimeout(
      kv.get(KV_PREFIX + username),
      TIMEOUT_OP,
      'kvGet'
    );
    return val == null ? null : val;
  } catch (e) {
    console.warn('[kv] kvGet error (non-fatal):', e.message);
    return null;
  }
}

async function kvSet(username, data) {
  const kv = getKVSync();
  if (!kv) return null;
  try {
    await withTimeout(
      kv.set(KV_PREFIX + username, data, { ex: KV_TTL }),
      TIMEOUT_OP,
      'kvSet'
    );
    return data;
  } catch (e) {
    console.warn('[kv] kvSet error (non-fatal):', e.message);
    return null;
  }
}

async function kvDel(username) {
  const kv = getKVSync();
  if (!kv) return;
  try {
    const delFn =
      typeof kv.del    === 'function' ? kv.del.bind(kv) :
      typeof kv.delete === 'function' ? kv.delete.bind(kv) :
      null;
    if (delFn) {
      await withTimeout(delFn(KV_PREFIX + username), TIMEOUT_OP, 'kvDel');
    }
  } catch (e) {
    console.warn('[kv] kvDel error (non-fatal):', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE ABSTRACTION — gabungan Supabase + KV
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ambil data user.
 * Prioritas: Supabase → KV fallback
 */
async function storageGet(username) {
  // Coba Supabase
  try {
    const sbData = await sbGet(username);
    // sbGet mengembalikan null jika record tidak ada (bukan error)
    if (sbData !== null) return sbData;

    // Record tidak ada di Supabase — cek apakah ada di KV (migrasi lama)
    const kvData = await kvGet(username);
    return kvData;
  } catch (sbErr) {
    // Supabase error — fallback ke KV
    console.warn('[storage] Supabase get gagal, fallback ke KV:', sbErr.message);
    const kvData = await kvGet(username);
    if (kvData !== null) {
      console.log('[storage] KV fallback berhasil untuk user:', username);
    }
    return kvData; // bisa null jika keduanya tidak punya data
  }
}

/**
 * Simpan data user.
 * Supabase sebagai primary; KV sebagai cache async.
 */
async function storageSet(username, data) {
  const sb = getSBSync();

  if (!sb) {
    // Supabase tidak tersedia — simpan ke KV saja
    const saved = await kvSet(username, trimUserData(data));
    if (saved) {
      console.warn('[storage] ⚠️ Supabase tidak tersedia — data disimpan ke KV saja.');
      return saved;
    }
    // Kedua storage tidak tersedia — kembalikan data yang sudah di-trim
    // (jangan crash; client tetap mendapat response)
    console.error('[storage] ❌ SEMUA storage tidak tersedia! Data tidak tersimpan:', username);
    return trimUserData(data);
  }

  // Simpan ke Supabase (primary)
  const saved = await sbSet(username, data);

  // Sinkronisasi ke KV secara async (fire-and-forget)
  const kv = getKVSync();
  if (kv) {
    kvSet(username, saved).catch(e =>
      console.warn('[storage] KV background sync gagal (non-fatal):', e.message)
    );
  }

  return saved;
}

async function storageDelete(username) {
  const sbResult = await sbDel(username).catch(e => {
    console.warn('[storage] sbDel error:', e.message);
    return false;
  });
  await kvDel(username);
  return sbResult;
}

async function storageList() {
  return await sbList();
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA TRIMMING
// ═══════════════════════════════════════════════════════════════════════════

function trimMsgs(msgs, maxMsgs = 60, maxChars = 6000) {
  if (!Array.isArray(msgs)) return [];
  return msgs.slice(-maxMsgs).map(m => {
    const msg = { ...m };
    if (typeof msg.content === 'string' && msg.content.length > maxChars) {
      msg.content = msg.content.slice(0, maxChars) + '\n...[trimmed]';
    }
    if (Array.isArray(msg.attachments)) {
      msg.attachments = msg.attachments.map(a =>
        a.type === 'image'
          ? { type: 'image', name: a.name, mime: a.mime }
          : { type: a.type, name: a.name }
      );
    }
    delete msg._rawContent;
    return msg;
  });
}

function trimUserData(data) {
  if (!data || typeof data !== 'object') return data;
  const d = { ...data };
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
  delete d.draftAttach; // jangan simpan draft besar ke server
  return d;
}

// ═══════════════════════════════════════════════════════════════════════════
// OWNER / ADMIN
// ═══════════════════════════════════════════════════════════════════════════

function parseIdList(envStr) {
  return (envStr || '')
    .split(',')
    .map(s => {
      const parts = s.trim().split(':');
      return { id: parts[0].trim(), name: parts[1]?.trim() || null };
    })
    .filter(x => x.id);
}

function getOwnerIds() {
  const fromEnv = parseIdList(process.env.OWNER_IDS);
  return fromEnv.length ? fromEnv : [{ id: '128649548', name: 'FIINYTID25' }];
}

function getAdminIds() {
  return parseIdList(process.env.ADMIN_IDS);
}

function isOwnerById(userId) {
  const uid = String(userId || '').trim();
  return uid ? getOwnerIds().some(o => String(o.id).trim() === uid) : false;
}

function isAdminById(userId) {
  if (isOwnerById(userId)) return true;
  const uid = String(userId || '').trim();
  return uid ? getAdminIds().some(a => String(a.id).trim() === uid) : false;
}

function applyRoleOverrides(data) {
  if (!data?.robloxId) return data;
  if (isOwnerById(data.robloxId)) {
    data.credits = 999999;
    data.plan    = 'owner';
    data.roles   = ['owner', 'admin'];
  } else if (isAdminById(data.robloxId)) {
    data.credits = 999999;
    if (!Array.isArray(data.roles)) data.roles = [];
    if (!data.roles.includes('admin')) data.roles.push('admin');
  }
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRUD HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function getUser(username) {
  const key = normalizeKey(username);
  if (!key) return null;
  try {
    return await storageGet(key);
  } catch (e) {
    console.error('[crud] getUser error:', e.message);
    return null;
  }
}

async function setUser(username, data) {
  const key = normalizeKey(username);
  if (!key)  throw new Error('Username tidak valid');
  if (!data) throw new Error('Data tidak boleh kosong');
  return await storageSet(key, data);
}

// ═══════════════════════════════════════════════════════════════════════════
// CORS & ERROR HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Token'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
}

function errResponse(res, e) {
  const msg = e?.message || String(e);
  console.error('[handler] storage error:', msg);

  let hint = 'Cek environment variables.';
  if (_sbState.error) {
    hint = 'Supabase: ' + _sbState.error;
  } else if (_kvState.error) {
    hint = 'KV: ' + _kvState.error;
  }

  return res.status(500).json({
    error:  'Terjadi kesalahan penyimpanan.',
    code:   'STORAGE_ERROR',
    detail: msg,
    hint,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Rate limiting per IP
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (!checkRateLimit('sync:' + ip, 120)) {
    return res.status(429).json({ error: 'Terlalu banyak request. Coba lagi nanti.' });
  }

  const userKey = normalizeKey(req.query.user || '');

  // ══════════════════════════════════════════════════════════
  // GET
  // ══════════════════════════════════════════════════════════
  if (req.method === 'GET') {

    // GET ?admin_ids=1
    if (req.query.admin_ids === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized: admin token diperlukan.' });
      }
      return res.json({
        admin_ids: getAdminIds().map(a => a.id).filter(Boolean),
        owner_ids: getOwnerIds().map(o => o.id).filter(Boolean),
      });
    }

    // GET ?health=1 — status storage
    if (req.query.health === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized: admin token diperlukan.' });
      }
      const sb = getSBSync();
      let canWrite = false, canRead = false, healthErr = null;
      if (sb) {
        try {
          const testRecord = {
            username:   '__health__',
            data:       { ok: true, ts: Date.now() },
            updated_at: new Date().toISOString(),
          };
          const { error: wErr } = await withTimeout(
            sb.from(TABLE).upsert(testRecord, { onConflict: 'username' }),
            5000,
            'healthWrite'
          );
          if (wErr) throw new Error(formatSBError(wErr));
          canWrite = true;

          const { data: rData, error: rErr } = await withTimeout(
            sb.from(TABLE)
              .select('data')
              .eq('username', '__health__')
              .maybeSingle(),
            5000,
            'healthRead'
          );
          if (rErr) throw new Error(formatSBError(rErr));
          canRead = !!rData;
        } catch (e) {
          healthErr = e.message;
        }
      }
      return res.json({
        ok:          canWrite && canRead,
        supabase:    !!sb,
        kv:          !!getKVSync(),
        canWrite,
        canRead,
        sbInitError: _sbState.error || null,
        kvInitError: _kvState.error || null,
        opsError:    healthErr      || null,
        timestamp:   new Date().toISOString(),
      });
    }

    // GET ?list=1
    if (req.query.list === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized: admin token diperlukan.' });
      }
      try {
        const allUsers = await storageList();
        return res.json(allUsers);
      } catch (e) {
        return errResponse(res, e);
      }
    }

    // GET ?user=<username>
    if (!userKey) return res.json(null);

    try {
      let data = await getUser(userKey);
      if (!data) return res.json(null);
      data = applyRoleOverrides(data);
      return res.json(data);
    } catch (e) {
      return errResponse(res, e);
    }
  }

  // ══════════════════════════════════════════════════════════
  // POST
  // ══════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string'
        ? JSON.parse(req.body)
        : (req.body || {});
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON: ' + e.message });
    }

    const { user, robloxId: bodyRobloxId, data, action } = body;

    // ── ADMIN ACTIONS ────────────────────────────────────────
    if (action) {
      if (!verifyAdminToken(req)) {
        return res.status(403).json({
          error: 'Forbidden: ADMIN_TOKEN diperlukan via Authorization: Bearer <token>.',
        });
      }

      /**
       * Ambil, modifikasi, dan simpan data user.
       * Returns null jika sukses, atau Response Error jika gagal.
       */
      async function adminUpdate(target, updateFn) {
        if (!target) return res.status(400).json({ error: 'field "target" wajib diisi' });
        const tKey = normalizeKey(target);
        if (!tKey || tKey.length > 50) {
          return res.status(400).json({ error: 'target tidak valid atau terlalu panjang' });
        }
        const existing = (await getUser(tKey)) || {};
        const next     = updateFn(existing);
        next._updated  = Date.now();
        try {
          await setUser(tKey, next);
          return null;
        } catch (e) {
          return errResponse(res, e);
        }
      }

      switch (action) {
        case 'give-credits': {
          const { target, amount } = body;
          const amt = parseFloat(amount);
          if (!target || isNaN(amt) || amt <= 0 || amt > 100_000) {
            return res.status(400).json({ error: 'target dan amount (1–100000) wajib diisi' });
          }
          const errRes = await adminUpdate(target, ex => {
            ex.credits = parseFloat(((ex.credits || 0) + amt).toFixed(4));
            return ex;
          });
          if (errRes) return errRes;
          const updated = await getUser(normalizeKey(target));
          return res.json({ success: true, newCredits: updated?.credits ?? null, user: target });
        }

        case 'set-credits': {
          const { target, amount } = body;
          const amt = parseFloat(amount);
          if (!target || isNaN(amt) || amt < 0) {
            return res.status(400).json({ error: 'target dan amount (≥0) wajib diisi' });
          }
          const errRes = await adminUpdate(target, ex => {
            ex.credits = parseFloat(amt.toFixed(4));
            return ex;
          });
          if (errRes) return errRes;
          return res.json({ success: true });
        }

        case 'confirm-payment': {
          const { target, amount, transactionId } = body;
          const amt = parseFloat(amount);
          if (!target || isNaN(amt) || amt <= 0) {
            return res.status(400).json({ error: 'target dan amount wajib diisi' });
          }
          const errRes = await adminUpdate(target, ex => {
            ex.credits     = parseFloat(((ex.credits || 0) + amt).toFixed(4));
            ex.lastPayment = {
              amount:        amt,
              transactionId: sanitizeStr(String(transactionId || ''), 100),
              ts:            Date.now(),
            };
            return ex;
          });
          if (errRes) return errRes;
          return res.json({ success: true, credited: amt, user: target });
        }

        case 'set-plan': {
          const { target, plan } = body;
          const allowedPlans = ['free', 'pro', 'owner'];
          if (!target || !allowedPlans.includes(plan)) {
            return res.status(400).json({ error: 'target dan plan (free/pro/owner) wajib diisi' });
          }
          const errRes = await adminUpdate(target, ex => {
            ex.plan = plan;
            if (plan === 'pro')   ex.credits = Math.max(ex.credits || 0, 200);
            if (plan === 'owner') ex.credits = 999_999;
            return ex;
          });
          if (errRes) return errRes;
          return res.json({ success: true });
        }

        case 'reset-credits': {
          const { target } = body;
          if (!target) return res.status(400).json({ error: 'target wajib diisi' });
          const errRes = await adminUpdate(target, ex => {
            ex.credits = 30;
            return ex;
          });
          if (errRes) return errRes;
          return res.json({ success: true });
        }

        case 'ban': {
          const { target, reason } = body;
          if (!target) return res.status(400).json({ error: 'target wajib diisi' });
          const safeReason = sanitizeStr(String(reason || 'No reason given'), 200);
          const errRes = await adminUpdate(target, ex => {
            ex.banned    = true;
            ex.banReason = safeReason;
            ex.bannedAt  = Date.now();
            return ex;
          });
          if (errRes) return errRes;
          return res.json({ success: true });
        }

        case 'unban': {
          const { target } = body;
          if (!target) return res.status(400).json({ error: 'target wajib diisi' });
          const errRes = await adminUpdate(target, ex => {
            ex.banned     = false;
            ex.banReason  = null;
            ex.unbannedAt = Date.now();
            return ex;
          });
          if (errRes) return errRes;
          return res.json({ success: true });
        }

        case 'add-admin': {
          const { target } = body;
          if (!target) return res.status(400).json({ error: 'target wajib diisi' });
          const errRes = await adminUpdate(target, ex => {
            if (!Array.isArray(ex.roles)) ex.roles = [];
            if (!ex.roles.includes('admin')) ex.roles.push('admin');
            ex.credits = 999_999;
            return ex;
          });
          if (errRes) return errRes;
          return res.json({ success: true });
        }

        case 'remove-admin': {
          const { target } = body;
          if (!target) return res.status(400).json({ error: 'target wajib diisi' });
          const errRes = await adminUpdate(target, ex => {
            ex.roles = (ex.roles || []).filter(r => r !== 'admin');
            return ex;
          });
          if (errRes) return errRes;
          return res.json({ success: true });
        }

        default:
          return res.status(400).json({
            error: 'Unknown action: ' + sanitizeStr(action, 50),
          });
      }
    }

    // ── NORMAL USER SYNC ────────────────────────────────────
    if (!user) {
      return res.status(400).json({ error: 'Field "user" tidak boleh kosong' });
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Field "data" harus berupa object' });
    }

    const key = normalizeKey(user);
    if (!key || key.length > 50) {
      return res.status(400).json({
        error: 'Username tidak valid atau terlalu panjang (maks 50 karakter)',
      });
    }

    try {
      const existing = await getUser(key);

      if (existing?.banned) {
        return res.status(403).json({
          error:  'Account banned',
          reason: existing.banReason || 'Violation of ToS',
        });
      }

      // Whitelist field yang boleh ditulis client
      const SAFE_FIELDS = [
        'convs', 'allConvs', 'curConv', 'model', 'guiModel',
        'lastClaim', 'draftText', 'avatar', 'displayName',
        'settings', 'preferences', 'projects',
      ];

      const clientUpdate = {};
      SAFE_FIELDS.forEach(f => {
        if (data[f] !== undefined) clientUpdate[f] = data[f];
      });

      // robloxId: tidak boleh dioverwrite setelah tersimpan di server
      const resolvedRobloxId =
        (existing?.robloxId)
          ? existing.robloxId
          : sanitizeStr(String(bodyRobloxId || data.robloxId || ''), 50);

      let merged;
      if (existing) {
        merged = {
          ...existing,
          ...clientUpdate,
          // Field kritis — server selalu menang
          credits:     existing.credits     !== undefined ? existing.credits : (parseFloat(data.credits) || 30),
          plan:        existing.plan        || 'free',
          roles:       existing.roles       || [],
          banned:      existing.banned      || false,
          banReason:   existing.banReason   || null,
          robloxId:    resolvedRobloxId,
          googleEmail: existing.googleEmail || sanitizeStr(String(data.googleEmail || ''), 100),
          _updated:    Date.now(),
        };
      } else {
        // User baru
        merged = {
          ...clientUpdate,
          credits:     data.credits !== undefined ? parseFloat(data.credits) : 30,
          plan:        'free',
          roles:       [],
          banned:      false,
          banReason:   null,
          robloxId:    resolvedRobloxId,
          googleEmail: sanitizeStr(String(data.googleEmail || ''), 100),
          _created:    Date.now(),
          _updated:    Date.now(),
        };
      }

      merged = applyRoleOverrides(merged);

      let savedPayload;
      try {
        savedPayload = await setUser(key, merged);
      } catch (e) {
        return errResponse(res, e);
      }

      if (!savedPayload) savedPayload = merged;

      const responseData = applyRoleOverrides({ ...savedPayload });

      let storageWarning;
      if (!getSBSync() && !getKVSync()) {
        storageWarning = '⚠️ Tidak ada storage backend yang tersedia. Data mungkin tidak tersimpan.';
      } else if (!getSBSync()) {
        storageWarning = '⚠️ Supabase tidak tersedia, menggunakan KV saja.';
      }

      return res.json({
        success:        true,
        credits:        responseData.credits,
        plan:           responseData.plan,
        roles:          responseData.roles    || [],
        robloxId:       responseData.robloxId || '',
        storageWarning: storageWarning || undefined,
        data:           responseData,
      });

    } catch (e) {
      console.error('[handler] POST sync error:', e.message);
      return res.status(500).json({ error: 'Internal error saat menyimpan data.' });
    }
  }

  // ══════════════════════════════════════════════════════════
  // DELETE
  // ══════════════════════════════════════════════════════════
  if (req.method === 'DELETE') {
    if (!verifyAdminToken(req)) {
      return res.status(403).json({
        error: 'Forbidden: Admin token diperlukan untuk menghapus data.',
      });
    }
    if (!userKey) {
      return res.status(400).json({ error: 'Parameter "user" tidak boleh kosong' });
    }
    try {
      await storageDelete(userKey);
      return res.json({ success: true, deleted: userKey });
    } catch (e) {
      return errResponse(res, e);
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * SETUP SUPABASE TABLE (jalankan sekali di SQL Editor Supabase)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CREATE TABLE IF NOT EXISTS nexus_users (
 *   username   TEXT PRIMARY KEY,
 *   data       JSONB        NOT NULL DEFAULT '{}',
 *   updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
 * );
 *
 * -- Index untuk query cepat
 * CREATE INDEX IF NOT EXISTS idx_nexus_users_updated
 *   ON nexus_users (updated_at DESC);
 *
 * -- Row Level Security (opsional tapi disarankan)
 * ALTER TABLE nexus_users ENABLE ROW LEVEL SECURITY;
 *
 * -- Hanya service_role yang boleh akses (API ini pakai service role key)
 * CREATE POLICY "service_role_only" ON nexus_users
 *   USING (auth.role() = 'service_role');
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ENVIRONMENT VARIABLES YANG DIPERLUKAN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * STORAGE_NEXUS_SUPABASE_URL           = https://<project>.supabase.co
 * STORAGE_NEXUS_SUPABASE_SERVICE_ROLE_KEY = eyJ...  (dari Project Settings > API)
 * ADMIN_TOKEN                          = token-rahasia-minimal-8-karakter
 *
 * Opsional (KV fallback):
 * KV_REST_API_URL                      = https://...upstash.io
 * KV_REST_API_TOKEN                    = ...
 *
 * Opsional (owner/admin):
 * OWNER_IDS  = 128649548:FIINYTID25,99999:NamaLain
 * ADMIN_IDS  = 11111:Admin1,22222:Admin2
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */