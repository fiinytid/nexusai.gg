// lib/google-callback.ts — NEXUS AI Google OAuth Callback (FIXED v6 — TypeScript)
//
// Changes v6 (JS → TS):
//   • Full TypeScript strict types — no implicit 'any'
//   • AdaptedRequest / AdaptedResponse dari route.ts digunakan konsisten
//   • GoogleUserInfo interface untuk typing respons Google API
//   • TokenResponse interface untuk typing respons token exchange
//   • RateLimitEntry interface menggantikan objek inline
//   • safeBase64Encode, fetchWithTimeout, getAllowedBase semua dianotasi penuh
//   • Tidak ada perubahan behaviour — semua logic identik dengan v5

import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route.js';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface RateLimitEntry {
  hits: number[];
}

interface TokenResponse {
  access_token?: string;
  error?:        string;
  [key: string]: unknown;
}

interface GoogleUserInfo {
  id?:      string | number;
  email?:   string;
  name?:    string;
  picture?: string;
  [key: string]: unknown;
}

interface SafeUserData {
  id:      string;
  name:    string;
  email:   string;
  picture: string;
}

// ─── IN-MEMORY RATE LIMITER ───────────────────────────────────────────────────

const RL_STORE = new Map<string, RateLimitEntry>();

function checkRateLimit(key: string, max: number, windowMs: number = 60_000): boolean {
  const now   = Date.now();
  const entry = RL_STORE.get(key) ?? { hits: [] };
  entry.hits  = entry.hits.filter(t => now - t < windowMs);
  if (entry.hits.length >= max) return false;
  entry.hits.push(now);
  RL_STORE.set(key, entry);
  return true;
}

// ─── STATE TOKEN STORE (in-memory, valid 10 min) ─────────────────────────────

const STATE_STORE = new Map<string, number>();

function createStateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const token = Array.from(
    { length: 40 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join('');

  STATE_STORE.set(token, Date.now());

  // Cleanup expired tokens
  const expiry = 10 * 60 * 1_000;
  for (const [k, t] of STATE_STORE) {
    if (Date.now() - t > expiry) STATE_STORE.delete(k);
  }
  return token;
}

function verifyStateToken(token: string): boolean {
  if (!token || typeof token !== 'string' || token.length > 80) return false;
  const ts = STATE_STORE.get(token);
  if (!ts) return false;
  if (Date.now() - ts > 10 * 60 * 1_000) {
    STATE_STORE.delete(token);
    return false;
  }
  STATE_STORE.delete(token);
  return true;
}

// ─── SAFE BASE64 ENCODE ───────────────────────────────────────────────────────

function safeBase64Encode(str: string): string {
  // Buffer tersedia di Node.js serverless
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64');
  }
  // Fallback untuk Edge runtime: encode UTF-8 dulu agar karakter unicode aman
  const bytes = new TextEncoder().encode(str);
  let binary  = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

// ─── SECURITY HEADERS ────────────────────────────────────────────────────────

function setSecurityHeaders(res: AdaptedResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options',        'DENY');
  res.setHeader('X-XSS-Protection',       '1; mode=block');
  res.setHeader('Referrer-Policy',        'no-referrer');
  res.setHeader('Cache-Control',          'no-store, no-cache, must-revalidate');
}

// ─── BASE URL ─────────────────────────────────────────────────────────────────

function getAllowedBase(req: AdaptedRequest): string {
  // Prioritas: env var > host header > fallback
  if (process.env.PRODUCTION_URL) {
    return process.env.PRODUCTION_URL
      .replace(/\/api\/google-callback\/?$/, '')
      .replace(/\/$/, '');
  }
  const host  = req.headers['x-forwarded-host'] ?? req.headers['host'] ?? '';
  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  if (host) return `${proto}://${host}`;
  return 'https://nexusai-rbx.vercel.app';
}

// ─── QUERY HELPER ────────────────────────────────────────────────────────────

function getString(val: string | string[] | undefined | null): string {
  if (!val) return '';
  if (Array.isArray(val)) return val[0] ?? '';
  return String(val);
}

// ─── FETCH WITH TIMEOUT ───────────────────────────────────────────────────────

async function fetchWithTimeout(
  url:       string,
  options:   RequestInit = {},
  timeoutMs: number      = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

const handler: HandlerFn = async (req: AdaptedRequest, res: AdaptedResponse) => {
  setSecurityHeaders(res);

  const base = getAllowedBase(req);
  res.setHeader('Access-Control-Allow-Origin',  base);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET')     { res.status(405).json({ error: 'Method not allowed' }); return; }

  const ip: string =
    getString(req.headers['x-forwarded-for']).split(',')[0].trim() ||
    'unknown';

  // Deteksi API call — browser redirect dari Google TIDAK punya X-Requested-With
  const isApiCall =
    req.headers['x-requested-with'] === 'XMLHttpRequest' ||
    (req.headers['accept'] ?? '').startsWith('application/json');

  // ── Endpoint: generate state token ───────────────────────────────────────
  if (req.query['get_state'] === '1') {
    if (!checkRateLimit(`gcb_state:${ip}`, 20, 60_000)) {
      return res.status(429).json({ error: 'Rate limit. Coba lagi nanti.' });
    }
    return res.status(200).json({ state: createStateToken() });
  }

  // Ambil query params sebagai string (bukan array)
  const code  = getString(req.query['code']);
  const error = getString(req.query['error']);
  const state = getString(req.query['state']);

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
    const redirectUri = `${base}/api/google-callback`;
    console.log('[google-callback] Menggunakan redirectUri:', redirectUri);

    // ── Tukar code dengan token ───────────────────────────────────────────
    const tokenResp = await fetchWithTimeout(
      'https://oauth2.googleapis.com/token',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code:          code.trim(),
          client_id:     clientId,
          client_secret: clientSecret,
          redirect_uri:  redirectUri,
          grant_type:    'authorization_code',
        }).toString(),
      },
      10_000,
    );

    if (!tokenResp.ok) {
      const errData = await tokenResp.json().catch(() => ({})) as TokenResponse;
      console.error('[google-callback] Token exchange gagal:', errData);
      const errMsg = errData?.error === 'redirect_uri_mismatch'
        ? 'redirect_uri_mismatch — pastikan PRODUCTION_URL di env sudah benar'
        : 'token_failed';
      return isApiCall
        ? res.status(400).json({ error: `Login Google gagal: ${errMsg}` })
        : res.redirect(302, `/login?google_error=${encodeURIComponent(errMsg)}`);
    }

    const tokens = await tokenResp.json() as TokenResponse;

    if (!tokens.access_token) {
      return isApiCall
        ? res.status(400).json({ error: 'Token Google tidak diterima.' })
        : res.redirect(302, '/login?google_error=no_token');
    }

    // ── Ambil info user ────────────────────────────────────────────────────
    const userResp = await fetchWithTimeout(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      8_000,
    );

    if (!userResp.ok) {
      return isApiCall
        ? res.status(400).json({ error: 'Gagal mendapatkan info akun Google.' })
        : res.redirect(302, '/login?google_error=userinfo_failed');
    }

    const gUser = await userResp.json() as GoogleUserInfo;

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

    const userData: SafeUserData = {
      id:      String(gUser.id),
      name:    String(gUser.name    ?? gUser.email).substring(0, 80),
      email:   String(gUser.email   ?? '').substring(0, 100),
      picture: String(gUser.picture ?? '').substring(0, 500),
    };

    if (isApiCall) return res.status(200).json({ user: userData });

    const encoded = safeBase64Encode(JSON.stringify(userData));
    return res.redirect(302, `/login?google_user=${encodeURIComponent(encoded)}`);

  } catch (e: unknown) {
    const msg   = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? (e.stack ?? '') : '';
    console.error('[google-callback] Error tidak terduga:', msg, stack);
    return isApiCall
      ? res.status(500).json({ error: 'Terjadi kesalahan server.' })
      : res.redirect(302, '/login?google_error=server_error');
  }
};

export default handler;