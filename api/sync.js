'use strict';

const crypto = require('crypto');

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
  } catch (_) {
    return candidate === envToken;
  }
}

/**
 * Sanitasi string: hapus karakter kontrol dan karakter berbahaya
 */
function sanitizeStr(str, maxLen) {
  maxLen = maxLen || 200;
  if (typeof str !== 'string') str = String(str == null ? '' : str);
  return str
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // karakter kontrol
    .replace(/[<>]/g, '')                                // basic XSS guard
    .trim()
    .substring(0, maxLen);
}

// ─── RATE LIMITER ─────────────────────────────────────────────────────────────
// Di lingkungan serverless, Map ini reset setiap cold start.
// Ini masih berguna untuk hot instances; untuk proteksi penuh gunakan KV/Redis.
const _rl = new Map();

function checkRateLimit(key, maxPerMin) {
  maxPerMin = maxPerMin || 60;
  const now = Date.now();
  const k   = String(key).substring(0, 100);

  let r = _rl.get(k);
  if (!r || now > r.reset) {
    r = { count: 0, reset: now + 60000 };
    _rl.set(k, r);
  }
  r.count++;
  // Bersihkan entri lama secara periodik agar tidak leak memory
  if (_rl.size > 5000) {
    for (const [mk, mv] of _rl) {
      if (now > mv.reset) _rl.delete(mk);
    }
  }
  return r.count <= maxPerMin;
}

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
let _sb      = null;
let _sbReady = false;
let _sbError = null;
let _sbEnvSnapshot = '';

function getSBSync() {
  // Deteksi perubahan env (misalnya live reload) dan reset client
  const envSnap = (process.env.STORAGE_NEXUS_SUPABASE_URL || '') + '|' + (process.env.STORAGE_NEXUS_SUPABASE_SERVICE_ROLE_KEY || '');
  if (_sbEnvSnapshot && _sbEnvSnapshot !== envSnap) {
    _sb = null; _sbReady = false; _sbError = null;
  }
  _sbEnvSnapshot = envSnap;

  if (_sbReady && _sb) return _sb;
  if (_sbError)        return null;

  try {
    const url = process.env.STORAGE_NEXUS_SUPABASE_URL;
    const key = process.env.STORAGE_NEXUS_SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      _sbError = 'STORAGE_NEXUS_SUPABASE_URL atau STORAGE_NEXUS_SUPABASE_SERVICE_ROLE_KEY belum di-set.';
      console.error('[sync] Supabase:', _sbError);
      return null;
    }
    const { createClient } = require('@supabase/supabase-js');
    _sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    _sbReady = true;
    console.log('[sync] Supabase client berhasil diinisialisasi.');
    return _sb;
  } catch (e) {
    _sbError = e.message;
    console.error('[sync] Supabase init error:', e.message);
    return null;
  }
}

// ─── KV CLIENT ────────────────────────────────────────────────────────────────
let _kv      = null;
let _kvReady = false;
let _kvError = null;
let _kvEnvSnapshot = '';

function getKVSync() {
  const envSnap = (process.env.KV_REST_API_URL || '') + '|' + (process.env.KV_REST_API_TOKEN || '');
  if (_kvEnvSnapshot && _kvEnvSnapshot !== envSnap) {
    _kv = null; _kvReady = false; _kvError = null;
  }
  _kvEnvSnapshot = envSnap;

  if (_kvReady && _kv) return _kv;
  if (_kvError)        return null;

  try {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      _kvError = 'KV_REST_API_URL atau KV_REST_API_TOKEN belum di-set.';
      return null;
    }
    const mod    = require('@vercel/kv');
    const client = mod.kv || mod.default || mod;
    if (typeof client.get !== 'function') throw new Error('@vercel/kv: method .get() tidak ada.');
    _kv      = client;
    _kvReady = true;
    console.log('[sync] KV client berhasil diinisialisasi.');
    return _kv;
  } catch (e) {
    _kvError = e.message;
    console.error('[sync] KV init error:', e.message);
    return null;
  }
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TABLE      = 'nexus_users';
const TIMEOUT_OP = 8000;
const MAX_RETRY  = 3;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error('[timeout] ' + label + ' melebihi ' + ms + 'ms')), ms)
    ),
  ]);
}

// ─── SUPABASE OPS ─────────────────────────────────────────────────────────────
async function sbGet(username) {
  const sb = getSBSync();
  if (!sb) return null;
  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      const { data, error } = await withTimeout(
        sb.from(TABLE).select('data').eq('username', username).maybeSingle(),
        TIMEOUT_OP, 'sbGet'
      );
      if (error) throw new Error(error.message);
      return data ? data.data : null;
    } catch (e) {
      console.warn('[sync] sbGet attempt', i, ':', e.message);
      if (i === MAX_RETRY) return null;
      await sleep(200 * i);
    }
  }
  return null;
}

async function sbSet(username, payload) {
  const sb = getSBSync();
  if (!sb) throw new Error('Supabase tidak tersedia');

  payload = trimUserData(payload);

  // Cek ukuran payload — Supabase memiliki batas ~1MB per baris
  const sizeKB = Buffer.byteLength(JSON.stringify(payload), 'utf8') / 1024;
  if (sizeKB > 4096) {
    console.warn('[sync] Payload terlalu besar (' + sizeKB.toFixed(1) + ' KB), memangkas conv lama...');
    payload.convs    = (payload.convs    || []).slice(-8);
    payload.allConvs = (payload.allConvs || []).slice(-8);
  }

  let lastErr;
  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      const { error } = await withTimeout(
        sb.from(TABLE).upsert(
          { username, data: payload, updated_at: new Date().toISOString() },
          { onConflict: 'username' }
        ),
        TIMEOUT_OP, 'sbSet'
      );
      if (error) throw new Error(error.message);
      return payload;
    } catch (e) {
      lastErr = e;
      console.warn('[sync] sbSet attempt', i, ':', e.message);
      if (i === MAX_RETRY) break;
      await sleep(300 * i);
    }
  }
  throw lastErr;
}

async function sbDel(username) {
  const sb = getSBSync();
  if (!sb) return false;
  let lastErr;
  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      const { error } = await withTimeout(
        sb.from(TABLE).delete().eq('username', username),
        TIMEOUT_OP, 'sbDel'
      );
      if (error) throw new Error(error.message);
      return true;
    } catch (e) {
      lastErr = e;
      console.warn('[sync] sbDel attempt', i, ':', e.message);
      if (i === MAX_RETRY) break;
      await sleep(200 * i);
    }
  }
  throw lastErr;
}

async function sbList() {
  const sb = getSBSync();
  if (!sb) return {};
  try {
    const { data, error } = await withTimeout(
      sb.from(TABLE).select('username, data').order('username'),
      TIMEOUT_OP * 2, 'sbList'
    );
    if (error) throw new Error(error.message);
    const result = {};
    for (const row of (data || [])) {
      // Skip entri internal (diawali _)
      if (row.username && !row.username.startsWith('_')) {
        result[row.username] = row.data;
      }
    }
    return result;
  } catch (e) {
    console.error('[sync] sbList error:', e.message);
    return {};
  }
}

// ─── KV OPS ───────────────────────────────────────────────────────────────────
const KV_PREFIX = 'nexusai:';
const KV_TTL    = 60 * 60 * 24 * 365 * 2; // 2 tahun dalam detik

async function kvGet(username) {
  const kv = getKVSync();
  if (!kv) return null;
  try {
    const val = await withTimeout(kv.get(KV_PREFIX + username), TIMEOUT_OP, 'kvGet');
    return val == null ? null : val;
  } catch (e) {
    console.warn('[sync] kvGet error:', e.message);
    return null;
  }
}

async function kvSet(username, data) {
  const kv = getKVSync();
  if (!kv) return null;
  try {
    await withTimeout(
      kv.set(KV_PREFIX + username, data, { ex: KV_TTL }),
      TIMEOUT_OP, 'kvSet'
    );
    return data;
  } catch (e) {
    console.warn('[sync] kvSet error:', e.message);
    return null;
  }
}

async function kvDel(username) {
  const kv = getKVSync();
  if (!kv) return;
  try {
    // Beberapa versi @vercel/kv menggunakan .del(), beberapa .delete()
    const delFn = typeof kv.del === 'function' ? kv.del.bind(kv)
                : typeof kv.delete === 'function' ? kv.delete.bind(kv)
                : null;
    if (delFn) {
      await withTimeout(delFn(KV_PREFIX + username), TIMEOUT_OP, 'kvDel');
    }
  } catch (e) {
    console.warn('[sync] kvDel error (non-fatal):', e.message);
  }
}

// ─── STORAGE ABSTRACTION ─────────────────────────────────────────────────────

async function storageGet(username) {
  // Coba Supabase dulu (primary)
  const sbData = await sbGet(username);
  if (sbData !== null) return sbData;
  // Fallback ke KV
  return await kvGet(username);
}

async function storageSet(username, data) {
  const sb = getSBSync();

  if (!sb) {
    // Supabase tidak tersedia, coba KV saja
    const saved = await kvSet(username, trimUserData(data));
    if (saved) {
      console.warn('[sync] Supabase tidak tersedia; data disimpan ke KV saja.');
      return saved;
    }
    console.error('[sync] SEMUA storage tidak tersedia! Data TIDAK disimpan untuk user:', username);
    // Kembalikan data yang sudah di-trim agar response tetap bisa dikirim
    return trimUserData(data);
  }

  // Simpan ke Supabase (primary) — ini yang utama
  const saved = await sbSet(username, data);

  // Sinkronisasi ke KV secara async (fire-and-forget, tidak block response)
  const kv = getKVSync();
  if (kv) {
    kvSet(username, saved).catch(e =>
      console.warn('[sync] KV background sync gagal (non-fatal):', e.message)
    );
  }

  return saved;
}

async function storageDelete(username) {
  // Hapus dari kedua storage
  const sbResult = await sbDel(username).catch(e => {
    console.warn('[sync] sbDel error (non-fatal):', e.message);
    return false;
  });
  await kvDel(username);
  return sbResult;
}

/**
 * FIX v12: storageList sebelumnya tidak didefinisikan — crash pada ?list=1
 */
async function storageList() {
  // Gunakan Supabase sebagai sumber utama untuk listing
  const sbData = await sbList();
  // Jika Supabase kosong dan KV tersedia, kita hanya bisa return apa yang ada
  // (KV tidak mendukung scan/list yang efisien, jadi Supabase adalah sumber kebenaran)
  return sbData;
}

// ─── DATA TRIMMING ────────────────────────────────────────────────────────────
function trimMsgs(msgs, maxMsgs, maxChars) {
  maxMsgs  = maxMsgs  || 60;
  maxChars = maxChars || 6000;
  if (!Array.isArray(msgs)) return [];
  return msgs.slice(-maxMsgs).map(function (m) {
    const msg = Object.assign({}, m);
    if (typeof msg.content === 'string' && msg.content.length > maxChars) {
      msg.content = msg.content.slice(0, maxChars) + '\n...[trimmed]';
    }
    if (Array.isArray(msg.attachments)) {
      msg.attachments = msg.attachments.map(function (a) {
        if (a.type === 'image') return { type: 'image', name: a.name, mime: a.mime };
        return { type: a.type, name: a.name };
      });
    }
    delete msg._rawContent;
    return msg;
  });
}

function trimUserData(data) {
  if (!data || typeof data !== 'object') return data;
  const d = Object.assign({}, data);
  if (Array.isArray(d.convs)) {
    d.convs = d.convs.slice(-50).map(cv =>
      Object.assign({}, cv, { msgs: trimMsgs(cv.msgs) })
    );
  }
  if (Array.isArray(d.allConvs)) {
    d.allConvs = d.allConvs.slice(-50).map(cv =>
      Object.assign({}, cv, { msgs: trimMsgs(cv.msgs) })
    );
  }
  if (Array.isArray(d.projects)) d.projects = d.projects.slice(-100);
  // Hapus field draft besar yang tidak perlu disimpan ke server
  delete d.draftAttach;
  return d;
}

// ─── OWNER / ADMIN ────────────────────────────────────────────────────────────
function parseIdList(envStr) {
  return (envStr || '').split(',').map(s => {
    const parts = s.trim().split(':');
    return { id: parts[0].trim(), name: parts[1] ? parts[1].trim() : null };
  }).filter(x => x.id);
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

function normalizeKey(key) {
  return (key || '').toLowerCase().trim();
}

function applyRoleOverrides(data) {
  if (!data || !data.robloxId) return data;
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

// ─── CRUD ─────────────────────────────────────────────────────────────────────
async function getUser(username) {
  const key = normalizeKey(username);
  if (!key) return null;
  try {
    return await storageGet(key);
  } catch (e) {
    console.error('[sync] getUser error:', e.message);
    return null;
  }
}

async function setUser(username, data) {
  const key = normalizeKey(username);
  if (!key)  throw new Error('Username tidak valid');
  if (!data) throw new Error('Data tidak boleh kosong');
  return await storageSet(key, data);
}

// ─── CORS & ERROR ─────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
}

function errResponse(res, e) {
  const msg = e && e.message ? e.message : String(e);
  console.error('[sync] storage error:', msg);
  return res.status(500).json({
    error: 'Terjadi kesalahan penyimpanan.',
    code:  'STORAGE_ERROR',
    hint:  _sbError
      ? 'Cek konfigurasi Supabase: ' + _sbError
      : (_kvError ? 'KV error: ' + _kvError : 'Cek env vars storage.'),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═════════════════════════════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  setCors(res);

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Rate limiting per IP
  const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || 'unknown';
  if (!checkRateLimit('sync:' + ip, 120)) {
    res.status(429).json({ error: 'Terlalu banyak request. Coba lagi nanti.' });
    return;
  }

  const userKey = normalizeKey(req.query.user || '');

  // ════════════════════════════════════════════════════════════
  // GET
  // ════════════════════════════════════════════════════════════
  if (req.method === 'GET') {

    // GET ?admin_ids=1 — daftar admin/owner (butuh admin token)
    if (req.query.admin_ids === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized: admin token diperlukan.' });
      }
      return res.json({
        admin_ids: getAdminIds().map(a => a.id).filter(Boolean),
        owner_ids: getOwnerIds().map(o => o.id).filter(Boolean),
      });
    }

    // GET ?health=1 — status kesehatan storage (butuh admin token)
    if (req.query.health === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized: admin token diperlukan.' });
      }
      const sb = getSBSync();
      let canWrite = false, canRead = false, healthErr = null;
      if (sb) {
        try {
          const { error: wErr } = await withTimeout(
            sb.from(TABLE).upsert(
              { username: '__health__', data: { ok: true, ts: Date.now() }, updated_at: new Date().toISOString() },
              { onConflict: 'username' }
            ),
            5000, 'healthWrite'
          );
          if (wErr) throw new Error(wErr.message);
          canWrite = true;

          const { data: rData, error: rErr } = await withTimeout(
            sb.from(TABLE).select('data').eq('username', '__health__').maybeSingle(),
            5000, 'healthRead'
          );
          if (rErr) throw new Error(rErr.message);
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
        sbInitError: _sbError  || null,
        kvInitError: _kvError  || null,
        opsError:    healthErr || null,
        timestamp:   new Date().toISOString(),
      });
    }

    // GET ?list=1 — list semua user (butuh admin token)
    // FIX v12: storageList() sebelumnya tidak didefinisikan → crash
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

    // GET ?user=<username> — ambil data user
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

  // ════════════════════════════════════════════════════════════
  // POST
  // ════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON: ' + e.message });
    }

    const { user, robloxId: bodyRobloxId, data, action } = body;

    // ── ADMIN ACTIONS ─────────────────────────────────────────
    if (action) {
      if (!verifyAdminToken(req)) {
        return res.status(403).json({
          error: 'Forbidden: ADMIN_TOKEN diperlukan via Authorization: Bearer <token> untuk admin actions.',
        });
      }

      /**
       * Helper: ambil user, modifikasi via updateFn, simpan kembali.
       * Mengembalikan null jika sukses, atau objek response error.
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
          return null; // sukses
        } catch (e) {
          return errResponse(res, e);
        }
      }

      // give-credits — tambah kredit ke user
      if (action === 'give-credits') {
        const { target, amount } = body;
        const amt = parseFloat(amount);
        if (!target || isNaN(amt) || amt <= 0 || amt > 100000) {
          return res.status(400).json({ error: 'target dan amount (1–100000) wajib diisi' });
        }
        const errRes = await adminUpdate(target, ex => {
          ex.credits = parseFloat(((ex.credits || 0) + amt).toFixed(4));
          return ex;
        });
        if (errRes) return errRes;
        const updated = await getUser(normalizeKey(target));
        return res.json({ success: true, newCredits: updated ? updated.credits : null, user: target });
      }

      // set-credits — set kredit tepat
      if (action === 'set-credits') {
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

      // confirm-payment — konfirmasi pembayaran & tambah kredit
      if (action === 'confirm-payment') {
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

      // set-plan — atur plan user
      if (action === 'set-plan') {
        const { target, plan } = body;
        const allowedPlans = ['free', 'pro', 'owner'];
        if (!target || !allowedPlans.includes(plan)) {
          return res.status(400).json({ error: 'target dan plan (free/pro/owner) wajib diisi' });
        }
        const errRes = await adminUpdate(target, ex => {
          ex.plan = plan;
          if (plan === 'pro')   ex.credits = Math.max(ex.credits || 0, 200);
          if (plan === 'owner') ex.credits = 999999;
          return ex;
        });
        if (errRes) return errRes;
        return res.json({ success: true });
      }

      // reset-credits — reset kredit ke default (30)
      if (action === 'reset-credits') {
        const { target } = body;
        if (!target) return res.status(400).json({ error: 'target wajib diisi' });
        const errRes = await adminUpdate(target, ex => {
          ex.credits = 30;
          return ex;
        });
        if (errRes) return errRes;
        return res.json({ success: true });
      }

      // ban — ban user
      if (action === 'ban') {
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

      // unban — hapus ban user
      if (action === 'unban') {
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

      // add-admin — jadikan user admin
      if (action === 'add-admin') {
        const { target } = body;
        if (!target) return res.status(400).json({ error: 'target wajib diisi' });
        const errRes = await adminUpdate(target, ex => {
          if (!Array.isArray(ex.roles)) ex.roles = [];
          if (!ex.roles.includes('admin')) ex.roles.push('admin');
          ex.credits = 999999;
          return ex;
        });
        if (errRes) return errRes;
        return res.json({ success: true });
      }

      // remove-admin — cabut hak admin dari user
      if (action === 'remove-admin') {
        const { target } = body;
        if (!target) return res.status(400).json({ error: 'target wajib diisi' });
        const errRes = await adminUpdate(target, ex => {
          ex.roles = (ex.roles || []).filter(r => r !== 'admin');
          return ex;
        });
        if (errRes) return errRes;
        return res.json({ success: true });
      }

      // Unknown action
      return res.status(400).json({ error: 'Unknown action: ' + sanitizeStr(action, 50) });
    }

    // ── NORMAL USER SYNC ──────────────────────────────────────
    if (!user) return res.status(400).json({ error: 'Field "user" tidak boleh kosong' });
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Field "data" harus berupa object' });
    }

    const key = normalizeKey(user);
    if (!key || key.length > 50) {
      return res.status(400).json({ error: 'Username tidak valid atau terlalu panjang (maks 50 karakter)' });
    }

    try {
      const existing = await getUser(key);

      // Cek ban sebelum melanjutkan
      if (existing && existing.banned) {
        return res.status(403).json({
          error:  'Account banned',
          reason: existing.banReason || 'Violation of ToS',
        });
      }

      // Field yang boleh diupdate oleh client (whitelist)
      const SAFE_FIELDS = [
        'convs', 'allConvs', 'curConv', 'model', 'guiModel',
        'lastClaim', 'draftText', 'avatar', 'displayName',
        'settings', 'preferences', 'projects',
      ];

      const clientUpdate = {};
      SAFE_FIELDS.forEach(f => {
        if (data[f] !== undefined) clientUpdate[f] = data[f];
      });

      // robloxId: prioritaskan dari body langsung, lalu dari data, lalu dari existing
      // FIX v12: client TIDAK bisa overwrite robloxId yang sudah tersimpan di server
      const resolvedRobloxId =
        (existing && existing.robloxId)
          ? existing.robloxId
          : sanitizeStr(String(bodyRobloxId || data.robloxId || ''), 50);

      let merged;
      if (existing) {
        merged = Object.assign({}, existing, clientUpdate, {
          // Field kritis tidak bisa dioverwrite oleh client
          credits:     existing.credits     !== undefined ? existing.credits : (parseFloat(data.credits) || 30),
          plan:        existing.plan        || 'free',
          roles:       existing.roles       || [],
          banned:      existing.banned      || false,
          banReason:   existing.banReason   || null,
          robloxId:    resolvedRobloxId,
          googleEmail: existing.googleEmail || sanitizeStr(String(data.googleEmail || ''), 100),
          _updated:    Date.now(),
        });
      } else {
        // User baru
        merged = Object.assign({}, clientUpdate, {
          credits:     data.credits !== undefined ? parseFloat(data.credits) : 30,
          plan:        'free',
          roles:       [],
          banned:      false,
          banReason:   null,
          robloxId:    resolvedRobloxId,
          googleEmail: sanitizeStr(String(data.googleEmail || ''), 100),
          _created:    Date.now(),
          _updated:    Date.now(),
        });
      }

      // Terapkan override owner/admin (kredit & role dari env)
      merged = applyRoleOverrides(merged);

      let savedPayload;
      try {
        savedPayload = await setUser(key, merged);
      } catch (e) {
        return errResponse(res, e);
      }

      // setUser tidak seharusnya return null, tapi jaga-jaga
      if (!savedPayload) savedPayload = merged;

      const responseData = applyRoleOverrides(Object.assign({}, savedPayload));
      const storageWarning = (!getSBSync() && !getKVSync())
        ? 'PERINGATAN: Tidak ada storage backend yang tersedia. Data mungkin tidak tersimpan.'
        : (!getSBSync() ? 'PERINGATAN: Supabase tidak tersedia, menggunakan KV saja.' : undefined);

      return res.json({
        success:        true,
        credits:        responseData.credits,
        plan:           responseData.plan,
        roles:          responseData.roles    || [],
        robloxId:       responseData.robloxId || '',
        storageWarning: storageWarning,
        data:           responseData,
      });

    } catch (e) {
      console.error('[sync] POST sync error:', e.message);
      return res.status(500).json({ error: 'Internal error saat menyimpan data.' });
    }
  }

  // ════════════════════════════════════════════════════════════
  // DELETE — hapus data user (butuh admin token)
  // ════════════════════════════════════════════════════════════
  if (req.method === 'DELETE') {
    if (!verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Forbidden: Admin token diperlukan untuk menghapus data.' });
    }
    if (!userKey) return res.status(400).json({ error: 'Parameter "user" tidak boleh kosong' });
    try {
      await storageDelete(userKey);
      return res.json({ success: true, deleted: userKey });
    } catch (e) {
      return errResponse(res, e);
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};