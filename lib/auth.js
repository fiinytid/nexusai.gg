// api/auth.js — NEXUS AI Roblox OAuth Callback (SECURE v5 - Fixed)

import crypto from 'crypto';

// ─── IN-MEMORY RATE LIMITER ───────────────────────────────────────────────────
const rateLimitMap = new Map();

function checkRateLimit(key, maxRequests, windowMs = 60_000) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now - val.windowStart > 120_000) rateLimitMap.delete(key);
  }
}, 300_000).unref?.();

// ─── CSRF STATE TOKEN (HMAC-SHA256, no external dep) ─────────────────────────
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateStateToken() {
  const secret = process.env.OAUTH_STATE_SECRET || '';
  const rand   = crypto.randomBytes(24).toString('base64url');
  const ts     = Date.now().toString(36);
  const payload = `${rand}.${ts}`;
  const sig    = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyStateToken(token) {
  try {
    const secret = process.env.OAUTH_STATE_SECRET || '';
    const parts  = token.split('.');
    if (parts.length !== 3) return false;

    const [rand, ts, sig] = parts;
    const payload = `${rand}.${ts}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');

    // Constant-time comparison
    const sigBuf = Buffer.from(sig,      'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;

    // Check TTL
    const issuedAt = parseInt(ts, 36);
    if (isNaN(issuedAt) || Date.now() - issuedAt > STATE_TTL_MS) return false;

    return true;
  } catch {
    return false;
  }
}

// ─── SECURITY HEADERS ─────────────────────────────────────────────────────────
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options',    'nosniff');
  res.setHeader('X-Frame-Options',           'DENY');
  res.setHeader('X-XSS-Protection',          '1; mode=block');
  res.setHeader('Referrer-Policy',           'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy',        'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'"
  );
}

// ─── PRODUCTION URL ───────────────────────────────────────────────────────────
function getProductionBase() {
  const raw = (process.env.PRODUCTION_URL || '').trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/\/api\/auth\/?$/, '')
    .replace(/\/api\/?$/, '')
    .replace(/\/+$/, '');

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function getRedirectUri() {
  const base = getProductionBase();
  if (!base) return null;
  return `${base}/api/auth`;
}

// ─── SAFE REDIRECT ────────────────────────────────────────────────────────────
function safeRedirect(res, path) {
  const base = getProductionBase();
  if (!base || !path.startsWith('/') || /^\/\/|:/.test(path)) {
    return res.status(500).json({ error: 'Redirect configuration error.' });
  }
  // Prevent redirect to /api/auth itself (loop prevention)
  if (path.startsWith('/api/auth')) {
    return res.status(500).json({ error: 'Redirect loop detected.' });
  }
  return res.redirect(302, `${base}${path}`);
}

// ─── AVATAR HELPER ────────────────────────────────────────────────────────────
const SAFE_AVATAR_DOMAINS = [
  'https://tr.rbxcdn.com/',
  'https://t0.rbxcdn.com/',
  'https://t1.rbxcdn.com/',
  'https://t2.rbxcdn.com/',
  'https://t3.rbxcdn.com/',
  'https://t4.rbxcdn.com/',
  'https://thumbnails.roblox.com/',
];

async function resolveRobloxAvatar(userId, fallbackUrl = '') {
  if (fallbackUrl && SAFE_AVATAR_DOMAINS.some(d => fallbackUrl.startsWith(d))) {
    return fallbackUrl.substring(0, 500);
  }

  const uid = String(userId || '').trim();
  if (!uid || !/^\d{1,20}$/.test(uid)) return '';

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 5_000);

    const apiUrl =
      `https://thumbnails.roblox.com/v1/users/avatar-headshot` +
      `?userIds=${encodeURIComponent(uid)}&size=420x420&format=Png&isCircular=false`;

    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return '';

    const json     = await res.json().catch(() => null);
    const imageUrl = json?.data?.[0]?.imageUrl || '';

    if (imageUrl && SAFE_AVATAR_DOMAINS.some(d => imageUrl.startsWith(d))) {
      return imageUrl.substring(0, 500);
    }
  } catch (err) {
    console.warn('[auth] Avatar fetch failed for uid', uid, '—', err.message);
  }

  return '';
}

// ─── SANITIZE STRING ─────────────────────────────────────────────────────────
function sanStr(str, max = 100) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/[<>]/g, '')
    .substring(0, max)
    .trim();
}

// ─── fetchWithTimeout helper (replaces AbortSignal.timeout) ───────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─── BASE64URL encode (replaces Buffer.from().toString('base64url')) ──────────
function toBase64Url(str) {
  // Works in both Node.js (with Buffer) and Edge Runtime
  try {
    return Buffer.from(str).toString('base64url');
  } catch {
    // Edge fallback
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setSecurityHeaders(res);

  const productionBase = getProductionBase();
  if (!productionBase) {
    console.error('[auth] PRODUCTION_URL is not set or invalid.');
    return res.status(500).json({
      error: 'Server misconfiguration: PRODUCTION_URL is not set.',
    });
  }

  res.setHeader('Access-Control-Allow-Origin',      productionBase);
  res.setHeader('Access-Control-Allow-Methods',     'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',     'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const ip      = String((req.headers['x-forwarded-for'] || '').split(',')[0]).trim() || 'unknown';
  const isApiReq = (req.headers['accept'] || '').includes('application/json');

  const apiError  = (status, msg)  => res.status(status).json({ error: msg });
  const pageError = (slug)         => safeRedirect(res, `/login?roblox_error=${encodeURIComponent(slug)}`);
  const respond   = (status, msg, slug) =>
    isApiReq ? apiError(status, msg) : pageError(slug);

  // ── Verify required env vars ─────────────────────────────────────────────
  const clientId     = (process.env.ROBLOX_CLIENT_ID     || '').trim();
  const clientSecret = (process.env.ROBLOX_CLIENT_SECRET || '').trim();
  const stateSecret  = (process.env.OAUTH_STATE_SECRET   || '').trim();

  if (!clientId || !clientSecret) {
    console.error('[auth] Missing ROBLOX_CLIENT_ID or ROBLOX_CLIENT_SECRET.');
    return respond(500, 'Server not configured. Contact an administrator.', 'server_config');
  }

  // ── Route: GET ?get_state=1 ──────────────────────────────────────────────
  if (req.query.get_state === '1') {
    if (!checkRateLimit(`auth_state:${ip}`, 20)) {
      return apiError(429, 'Too many requests. Please try again later.');
    }
    if (!stateSecret) {
      console.warn('[auth] OAUTH_STATE_SECRET is not set.');
      return apiError(500, 'CSRF protection is not configured on this server.');
    }
    return res.status(200).json({ state: generateStateToken() });
  }

  // ── Route: GET ?code=… (OAuth callback) ──────────────────────────────────
  const { code, error: oauthError, state } = req.query;

  // ── CSRF state validation ────────────────────────────────────────────────
  if (stateSecret) {
    if (!state || typeof state !== 'string' || state.length < 10) {
      console.warn(`[auth] State token missing or malformed from ${ip}`);
      return respond(403, 'Missing state token — possible CSRF attack.', 'state_missing');
    }
    if (!verifyStateToken(state)) {
      console.warn(`[auth] Invalid or expired state token from ${ip}`);
      return respond(403, 'Invalid or expired state token.', 'state_invalid');
    }
  } else {
    console.warn('[auth] WARNING: OAUTH_STATE_SECRET not set — CSRF protection disabled.');
  }

  // ── OAuth errors from Roblox ─────────────────────────────────────────────
  if (oauthError) {
    const KNOWN = new Set([
      'access_denied', 'server_error', 'temporarily_unavailable',
      'invalid_request', 'unauthorized_client', 'unsupported_response_type',
    ]);
    const safeSlug = KNOWN.has(String(oauthError)) ? String(oauthError) : 'oauth_error';
    console.info(`[auth] OAuth error from Roblox (${ip}): ${oauthError}`);
    return respond(400, 'Login cancelled or denied.', safeSlug);
  }

  // ── Validate authorization code ──────────────────────────────────────────
  if (
    !code ||
    typeof code !== 'string' ||
    code.length < 4    ||
    code.length > 1024 ||
    !/^[\w\-._~+/]+=*$/.test(code)   // only URL-safe chars
  ) {
    return respond(400, 'Invalid or missing authorization code.', 'bad_code');
  }

  if (!checkRateLimit(`auth_code:${ip}`, 10)) {
    return respond(429, 'Too many login attempts. Please try again later.', 'rate_limit');
  }

  const redirectUri = getRedirectUri();
  if (!redirectUri) {
    console.error('[auth] Could not construct redirect URI.');
    return respond(500, 'Server configuration error.', 'server_config');
  }

  try {
    // ── Step 1: Token exchange ────────────────────────────────────────────
    const tokenResp = await fetchWithTimeout(
      'https://apis.roblox.com/oauth/v1/token',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'authorization_code',
          code:          code.trim(),
          redirect_uri:  redirectUri,
          client_id:     clientId,
          client_secret: clientSecret,
        }).toString(),
      },
      10_000
    );

    if (!tokenResp.ok) {
      const errData = await tokenResp.json().catch(() => ({}));
      console.error('[auth] Token exchange failed:', tokenResp.status, JSON.stringify(errData));
      return respond(400, 'Login failed. Please try again.', 'token_failed');
    }

    const tokenData = await tokenResp.json().catch(() => null);
    if (!tokenData || typeof tokenData !== 'object') {
      return respond(400, 'Received invalid token response.', 'bad_token_response');
    }

    const accessToken = tokenData.access_token;
    if (!accessToken || typeof accessToken !== 'string' || accessToken.length < 8) {
      console.error('[auth] No valid access_token in token response.');
      return respond(400, 'No access token received.', 'no_token');
    }

    // ── Step 2: Fetch user info ───────────────────────────────────────────
    const userInfoResp = await fetchWithTimeout(
      'https://apis.roblox.com/oauth/v1/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
      8_000
    );

    if (!userInfoResp.ok) {
      console.error('[auth] Userinfo fetch failed:', userInfoResp.status);
      return respond(400, 'Failed to retrieve account information.', 'userinfo_failed');
    }

    const userInfo = await userInfoResp.json().catch(() => null);
    if (!userInfo || typeof userInfo !== 'object') {
      return respond(400, 'Invalid user info response.', 'bad_userinfo');
    }

    const userId   = userInfo.sub;
    const username = userInfo.preferred_username || userInfo.name || '';

    if (!userId || !username) {
      console.error('[auth] Incomplete user data:', { userId, username });
      return respond(400, 'Incomplete account data received.', 'incomplete_user');
    }

    if (!/^\d{1,20}$/.test(String(userId))) {
      console.error('[auth] Suspicious non-numeric userId:', userId);
      return respond(400, 'Invalid account ID format.', 'invalid_id');
    }

    const cleanUsername    = sanStr(String(username), 50);
    const cleanDisplayName = sanStr(String(userInfo.name || username), 80);

    if (!cleanUsername) {
      return respond(400, 'Username is empty after sanitization.', 'bad_username');
    }

    // ── Step 3: Resolve avatar ────────────────────────────────────────────
    const avatarUrl = await resolveRobloxAvatar(
      String(userId),
      String(userInfo.picture || ''),
    );

    const userData = {
      id:          String(userId),
      username:    cleanUsername,
      displayName: cleanDisplayName,
      avatar:      avatarUrl,
    };

    // ── Step 4: Respond ───────────────────────────────────────────────────
    if (isApiReq) {
      return res.status(200).json({ user: userData });
    }

    // Browser flow: encode as base64url → redirect to /login
    const encoded = toBase64Url(JSON.stringify(userData));
    return safeRedirect(res, `/login?roblox_user=${encodeURIComponent(encoded)}`);

  } catch (err) {
    const isTimeout = err.name === 'AbortError' || err.name === 'TimeoutError';
    console.error('[auth] Unexpected error:', err.name, err.message);
    return respond(
      isTimeout ? 503 : 500,
      isTimeout
        ? 'Login timed out. Please try again.'
        : 'An unexpected server error occurred.',
      isTimeout ? 'timeout' : 'server_error',
    );
  }
}