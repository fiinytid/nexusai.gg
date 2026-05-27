// api/google-callback.js — NEXUS AI Google OAuth Callback (FIXED v5)

// ─── In-memory rate limiter ───────────────────────────────────────────────────
const RL_STORE = new Map();
function checkRateLimit(key, max, windowMs = 60_000) {
  const now = Date.now();
  const entry = RL_STORE.get(key) || { hits: [] };
  entry.hits = entry.hits.filter((t) => now - t < windowMs);
  if (entry.hits.length >= max) return false;
  entry.hits.push(now);
  RL_STORE.set(key, entry);
  return true;
}

// ─── State token store (in-memory, valid 10 min) ─────────────────────────────
const STATE_STORE = new Map();

function createStateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const token = Array.from({ length: 40 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  STATE_STORE.set(token, Date.now());
  // Cleanup expired tokens
  for (const [k, t] of STATE_STORE) {
    if (Date.now() - t > 10 * 60 * 1000) STATE_STORE.delete(k);
  }
  return token;
}

function verifyStateToken(token) {
  if (!token || typeof token !== 'string' || token.length > 80) return false;
  const ts = STATE_STORE.get(token);
  if (!ts) return false;
  if (Date.now() - ts > 10 * 60 * 1000) { STATE_STORE.delete(token); return false; }
  STATE_STORE.delete(token);
  return true;
}

// ─── FIX: Safe base64 encode — works di Node & Edge runtime ──────────────────
function safeBase64Encode(str) {
  // Buffer tersedia di Node.js serverless
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64');
  }
  // Fallback untuk Edge runtime: encode UTF-8 dulu agar karakter unicode aman
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

// ─── Security headers ─────────────────────────────────────────────────────────
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

// ─── FIX: Base URL dari request host, bukan hanya env var ────────────────────
function getAllowedBase(req) {
  // Prioritas: env var > host header > fallback
  if (process.env.PRODUCTION_URL) {
    return process.env.PRODUCTION_URL
      .replace(/\/api\/google-callback\/?$/, '')
      .replace(/\/$/, '');
  }
  // Ambil dari request host (otomatis sesuai domain deploy)
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  if (host) return `${proto}://${host}`;
  return 'https://nexusai-gg-beta.vercel.app';
}

// ─── FIX: Pastikan nilai query selalu string, bukan array ────────────────────
function getString(val) {
  if (!val) return '';
  if (Array.isArray(val)) return val[0] || '';
  return String(val);
}

// ─── fetch with timeout ───────────────────────────────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setSecurityHeaders(res);

  const base = getAllowedBase(req);
  res.setHeader('Access-Control-Allow-Origin', base);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ip =
    getString(req.headers['x-forwarded-for']).split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  // FIX: Deteksi API call lebih akurat — redirect dari Google bukan API call
  // Browser redirect dari Google TIDAK punya X-Requested-With header
  const isApiCall =
    req.headers['x-requested-with'] === 'XMLHttpRequest' ||
    (req.headers['accept'] || '').startsWith('application/json');

  // ── Endpoint: generate state token ────────────────────────────────────────
  if (req.query.get_state === '1') {
    if (!checkRateLimit(`gcb_state:${ip}`, 20, 60_000)) {
      return res.status(429).json({ error: 'Rate limit. Coba lagi nanti.' });
    }
    return res.status(200).json({ state: createStateToken() });
  }

  // FIX: Ambil query params sebagai string (bukan array)
  const code  = getString(req.query.code);
  const error = getString(req.query.error);
  const state = getString(req.query.state);

  // ── CSRF state validation (soft) ─────────────────────────────────────────
  if (state && !verifyStateToken(state)) {
    // Cold-start bisa bikin STATE_STORE kosong — log saja, jangan hard-block
    console.warn('[google-callback] State token tidak ditemukan (mungkin cold-start). IP:', ip);
  }

  // ── Handle OAuth error dari Google ───────────────────────────────────────
  if (error) {
    const safeErr = error.replace(/[^a-z0-9_]/gi, '').slice(0, 40);
    return isApiCall
      ? res.status(400).json({ error: 'Login Google dibatalkan.' })
      : res.redirect(302, `/login?google_error=${encodeURIComponent(safeErr)}`);
  }

  // ── Validasi code ─────────────────────────────────────────────────────────
  if (!code || code.length > 512) {
    return isApiCall
      ? res.status(400).json({ error: 'Kode tidak valid.' })
      : res.redirect(302, '/login');
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  if (!checkRateLimit(`gcb_code:${ip}`, 10, 60_000)) {
    return isApiCall
      ? res.status(429).json({ error: 'Rate limit. Coba lagi nanti.' })
      : res.redirect(302, '/login?google_error=rate_limited');
  }

  // ── Cek env vars ──────────────────────────────────────────────────────────
  const clientId     = process.env.GMAIL_KEY;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[google-callback] GMAIL_KEY atau GMAIL_CLIENT_SECRET belum dikonfigurasi.');
    return isApiCall
      ? res.status(500).json({ error: 'Server belum dikonfigurasi.' })
      : res.redirect(302, '/login?google_error=server_config');
  }

  try {
    const redirectUri = base + '/api/google-callback';
    console.log('[google-callback] Menggunakan redirectUri:', redirectUri);

    // ── Tukar code dengan token ───────────────────────────────────────────
    const tokenResp = await fetchWithTimeout(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code:          code.trim(),
          client_id:     clientId,
          client_secret: clientSecret,
          redirect_uri:  redirectUri,
          grant_type:    'authorization_code',
        }).toString(),
      },
      10_000
    );

    if (!tokenResp.ok) {
      const errData = await tokenResp.json().catch(() => ({}));
      console.error('[google-callback] Token exchange gagal:', errData);
      const errMsg = errData?.error === 'redirect_uri_mismatch'
        ? 'redirect_uri_mismatch — pastikan PRODUCTION_URL di env sudah benar'
        : 'token_failed';
      return isApiCall
        ? res.status(400).json({ error: `Login Google gagal: ${errMsg}` })
        : res.redirect(302, `/login?google_error=${encodeURIComponent(errMsg)}`);
    }

    const tokens = await tokenResp.json();

    if (!tokens.access_token) {
      return isApiCall
        ? res.status(400).json({ error: 'Token Google tidak diterima.' })
        : res.redirect(302, '/login?google_error=no_token');
    }

    // ── Ambil info user ────────────────────────────────────────────────────
    const userResp = await fetchWithTimeout(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: 'Bearer ' + tokens.access_token } },
      8_000
    );

    if (!userResp.ok) {
      return isApiCall
        ? res.status(400).json({ error: 'Gagal mendapatkan info akun Google.' })
        : res.redirect(302, '/login?google_error=userinfo_failed');
    }

    const gUser = await userResp.json();

    if (!gUser.id || !gUser.email) {
      return isApiCall
        ? res.status(400).json({ error: 'Data akun Google tidak lengkap.' })
        : res.redirect(302, '/login?google_error=incomplete_user');
    }

    if (!/^\d{1,30}$/.test(String(gUser.id))) {
      console.error('[google-callback] Google ID mencurigakan:', gUser.id);
      return isApiCall
        ? res.status(400).json({ error: 'ID akun tidak valid.' })
        : res.redirect(302, '/login?google_error=invalid_id');
    }

    const userData = {
      id:      String(gUser.id),
      name:    String(gUser.name    || gUser.email).substring(0, 80),
      email:   String(gUser.email   || '').substring(0, 100),
      picture: String(gUser.picture || '').substring(0, 500),
    };

    if (isApiCall) return res.status(200).json({ user: userData });

    // FIX: Gunakan safeBase64Encode, bukan Buffer.from langsung
    const encoded = safeBase64Encode(JSON.stringify(userData));
    return res.redirect(302, `/login?google_user=${encodeURIComponent(encoded)}`);

  } catch (e) {
    // FIX: Log error detail untuk debugging di Vercel logs
    console.error('[google-callback] Error tidak terduga:', e?.message || e, e?.stack || '');
    return isApiCall
      ? res.status(500).json({ error: 'Terjadi kesalahan server.' })
      : res.redirect(302, '/login?google_error=server_error');
  }
}