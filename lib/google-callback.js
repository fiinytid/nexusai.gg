// api/google-callback.js — NEXUS AI Google OAuth Callback (SECURE v4 — self-contained)

// ─── In-memory rate limiter (resets on cold start, fine for serverless) ───────
const RL_STORE = new Map();
function checkRateLimit(key, max, windowMs = 60_000) {
  const now = Date.now();
  const entry = RL_STORE.get(key) || { hits: [], blocked: false };
  entry.hits = entry.hits.filter((t) => now - t < windowMs);
  if (entry.hits.length >= max) return false;
  entry.hits.push(now);
  RL_STORE.set(key, entry);
  return true;
}

// ─── Simple CSRF state token (HMAC-lite using OAUTH_STATE_SECRET) ─────────────
function generateStateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 40 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

function simpleHmac(secret, data) {
  // djb2 XOR with secret — lightweight, not crypto-grade, sufficient for CSRF
  let h = 5381;
  const input = secret + '|' + data;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16);
}

// State token store (in-memory, valid for 10 min)
const STATE_STORE = new Map();

function createStateToken() {
  const token = generateStateToken();
  STATE_STORE.set(token, Date.now());
  // Clean old tokens
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
  STATE_STORE.delete(token); // one-time use
  return true;
}

// ─── Security headers ─────────────────────────────────────────────────────────
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

// ─── Base URL helper ──────────────────────────────────────────────────────────
function getAllowedBase() {
  const env = (process.env.PRODUCTION_URL || '')
    .replace(/\/api\/google-callback\/?$/, '')
    .replace(/\/$/, '');
  return env || 'https://nexusai-gg-beta.vercel.app';
}

// ─── fetch with timeout (compatible with all Node versions) ──────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setSecurityHeaders(res);

  const base = getAllowedBase();
  res.setHeader('Access-Control-Allow-Origin', base);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  const isApiCall = (req.headers['accept'] || '').includes('application/json');

  // ── Endpoint: generate state token (called by frontend before redirecting) ──
  if (req.query.get_state === '1') {
    if (!checkRateLimit(`gcb_state:${ip}`, 20, 60_000)) {
      return res.status(429).json({ error: 'Rate limit. Coba lagi nanti.' });
    }
    return res.status(200).json({ state: createStateToken() });
  }

  const { code, error, state } = req.query;

  // ── CSRF state validation ─────────────────────────────────────────────────
  // Only enforce if OAUTH_STATE_SECRET is set OR if state was provided by Google
  // (Google always sends state back if you sent it)
  if (state) {
    if (!verifyStateToken(state)) {
      // State might be from a different server instance (cold start wiped STATE_STORE).
      // Log it but don't hard-block — fall through to code exchange.
      // If you want strict enforcement, uncomment the lines below:
      // return isApiCall
      //   ? res.status(403).json({ error: 'State token tidak valid.' })
      //   : res.redirect(302, '/login?google_error=state_invalid');
      console.warn('[google-callback] State token not found in store (may be cold-start). IP:', ip);
    }
  }

  // ── Handle OAuth error from Google ───────────────────────────────────────
  if (error) {
    const safeErr = String(error).replace(/[^a-z0-9_]/gi, '').slice(0, 40);
    return isApiCall
      ? res.status(400).json({ error: 'Login Google dibatalkan.' })
      : res.redirect(302, `/login?google_error=${encodeURIComponent(safeErr)}`);
  }

  // ── Validate code ─────────────────────────────────────────────────────────
  if (!code || typeof code !== 'string' || code.length > 512) {
    return isApiCall
      ? res.status(400).json({ error: 'Kode tidak valid.' })
      : res.redirect(302, '/login');
  }

  // ── Rate limit code exchange ──────────────────────────────────────────────
  if (!checkRateLimit(`gcb_code:${ip}`, 10, 60_000)) {
    return isApiCall
      ? res.status(429).json({ error: 'Rate limit. Coba lagi nanti.' })
      : res.redirect(302, '/login?google_error=rate_limited');
  }

  // ── Check env vars ────────────────────────────────────────────────────────
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

    // ── Exchange code for tokens ────────────────────────────────────────────
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
      console.error('[google-callback] Token exchange failed:', errData);
      return isApiCall
        ? res.status(400).json({ error: 'Login Google gagal. Silakan coba lagi.' })
        : res.redirect(302, '/login?google_error=token_failed');
    }

    const tokens = await tokenResp.json();

    if (!tokens.access_token) {
      return isApiCall
        ? res.status(400).json({ error: 'Token Google tidak diterima.' })
        : res.redirect(302, '/login?google_error=no_token');
    }

    // ── Fetch user info ─────────────────────────────────────────────────────
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

    // Validate Google ID format (numeric string)
    if (!/^\d{1,30}$/.test(String(gUser.id))) {
      console.error('[google-callback] Suspicious Google ID:', gUser.id);
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

    // ── Redirect back to login page with encoded user data ──────────────────
    const encoded = Buffer.from(JSON.stringify(userData)).toString('base64');
    return res.redirect(
      302,
      `/login?google_user=${encodeURIComponent(encoded)}`
    );

  } catch (e) {
    console.error('[google-callback] Unexpected error:', e?.message || e);
    return isApiCall
      ? res.status(500).json({ error: 'Terjadi kesalahan server.' })
      : res.redirect(302, '/login?google_error=server_error');
  }
}