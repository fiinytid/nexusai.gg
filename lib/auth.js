// api/auth.js — NEXUS AI Roblox OAuth Callback (SECURE v4)
//
// Security:
//   • CSRF state token validation (mandatory when OAUTH_STATE_SECRET is set)
//   • Redirect URI derived exclusively from PRODUCTION_URL env var
//   • CORS origin locked to production URL (no wildcard for OAuth)
//   • No sensitive data reflected to client — generic errors only
//   • Rate limiting on state generation and code exchange
//   • Strict userId / username validation before use
//   • Avatar resolved via Roblox Thumbnails API (safe CDN allowlist)
//
// Required env vars:
//   PRODUCTION_URL          — e.g. https://nexusai-rbx.vercel.app  (no trailing slash)
//   ROBLOX_CLIENT_ID        — from Roblox Developer Portal
//   ROBLOX_CLIENT_SECRET    — from Roblox Developer Portal
//   OAUTH_STATE_SECRET      — random secret ≥ 32 chars for CSRF token signing
//
// Optional env vars:
//   ROBLOX_SCOPES           — space-separated scopes (default: "openid profile")

import {
  generateStateToken,
  verifyStateToken,
  checkRateLimit,
  setSecurityHeaders,
} from './_security.js';

// ─── PRODUCTION URL ───────────────────────────────────────────────────────────
/**
 * Returns the validated production base URL from the PRODUCTION_URL env var.
 * Strips trailing slashes and any accidental path segments like /api/auth.
 * Throws if not configured — we never want to fall back to a hardcoded URL.
 */
function getProductionBase() {
  const raw = (process.env.PRODUCTION_URL || '').trim();
  if (!raw) return null;

  // Strip common accidental suffixes
  const cleaned = raw
    .replace(/\/api\/auth\/?$/, '')
    .replace(/\/api\/?$/, '')
    .replace(/\/+$/, '');

  // Must be a valid https:// URL
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:') return null;
    // Return origin only (no path) for safety
    return parsed.origin;
  } catch (_) {
    return null;
  }
}

/** Redirect URI registered in the Roblox Developer Portal. */
function getRedirectUri() {
  const base = getProductionBase();
  if (!base) return null;
  return `${base}/api/auth`;
}

// ─── SAFE REDIRECT HELPER ─────────────────────────────────────────────────────
/**
 * Only redirects to paths under the production origin.
 * Prevents open redirects if any path is constructed from external input.
 */
function safeRedirect(res, path) {
  const base = getProductionBase();
  // path must start with '/' and contain no protocol or double-slash
  if (!base || !path.startsWith('/') || /^\/\/|:/.test(path)) {
    return res.status(500).json({ error: 'Redirect configuration error.' });
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

/**
 * Fetches the user's Roblox headshot from the Thumbnails API.
 * Falls back to userInfo.picture if the API call fails.
 * Always validates the returned URL against the safe CDN allowlist.
 */
async function resolveRobloxAvatar(userId, fallbackUrl = '') {
  // Check if the fallback is already a safe CDN URL
  if (fallbackUrl && SAFE_AVATAR_DOMAINS.some(d => fallbackUrl.startsWith(d))) {
    return fallbackUrl.substring(0, 500);
  }

  const uid = String(userId || '').trim();
  if (!uid || !/^\d{1,20}$/.test(uid)) return '';

  try {
    const apiUrl =
      `https://thumbnails.roblox.com/v1/users/avatar-headshot` +
      `?userIds=${encodeURIComponent(uid)}&size=420x420&format=Png&isCircular=false`;

    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(5_000) });
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

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Security & CORS headers
  setSecurityHeaders(res);

  const productionBase = getProductionBase();
  if (!productionBase) {
    console.error('[auth] PRODUCTION_URL is not set or invalid in environment variables.');
    return res.status(500).json({
      error: 'Server misconfiguration: PRODUCTION_URL is not set.',
    });
  }

  // Lock CORS to the production origin only (no wildcard for OAuth flows)
  res.setHeader('Access-Control-Allow-Origin',   productionBase);
  res.setHeader('Access-Control-Allow-Methods',  'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',  'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const ip       = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const isApiReq = (req.headers['accept'] || '').includes('application/json');

  // Helpers for consistent error responses
  const apiError  = (status, msg)  => res.status(status).json({ error: msg });
  const pageError = (slug)         => safeRedirect(res, `/login?roblox_error=${encodeURIComponent(slug)}`);
  const respond   = (status, msg, slug) =>
    isApiReq ? apiError(status, msg) : pageError(slug);

  // ── Verify required secrets are configured ──────────────────────────────
  const clientId     = process.env.ROBLOX_CLIENT_ID;
  const clientSecret = process.env.ROBLOX_CLIENT_SECRET;
  const stateSecret  = (process.env.OAUTH_STATE_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    console.error('[auth] ROBLOX_CLIENT_ID or ROBLOX_CLIENT_SECRET is not configured.');
    return respond(500, 'Server not configured. Contact an administrator.', 'server_config');
  }

  // ── Route: GET ?get_state=1 — issue a fresh CSRF state token ───────────────
  // The frontend must request this and include the returned state in the OAuth URL.
  if (req.query.get_state === '1') {
    if (!checkRateLimit(`auth_state:${ip}`, 20)) {
      return apiError(429, 'Too many requests. Please try again later.');
    }
    if (!stateSecret) {
      console.warn('[auth] OAUTH_STATE_SECRET is not set — state tokens cannot be generated.');
      return apiError(500, 'CSRF protection is not configured on this server.');
    }
    return res.status(200).json({ state: generateStateToken() });
  }

  // ── Route: GET ?code=… — OAuth callback from Roblox ────────────────────────
  const { code, error: oauthError, state } = req.query;

  // Validate CSRF state token
  if (stateSecret) {
    if (!state || typeof state !== 'string') {
      console.warn(`[auth] State token missing from ${ip}`);
      return respond(403, 'Missing state token — possible CSRF attack.', 'state_missing');
    }
    if (!verifyStateToken(state)) {
      console.warn(`[auth] Invalid or expired state token from ${ip}`);
      return respond(403, 'Invalid or expired state token.', 'state_invalid');
    }
  } else {
    // Warn loudly — running without CSRF protection is a security risk
    console.warn('[auth] WARNING: OAUTH_STATE_SECRET is not set. CSRF protection is disabled.');
  }

  // Handle OAuth errors returned by Roblox
  if (oauthError) {
    const KNOWN_OAUTH_ERRORS = new Set([
      'access_denied',
      'server_error',
      'temporarily_unavailable',
      'invalid_request',
      'unauthorized_client',
      'unsupported_response_type',
    ]);
    const safeSlug = KNOWN_OAUTH_ERRORS.has(oauthError) ? oauthError : 'oauth_error';
    console.info(`[auth] OAuth error from Roblox (${ip}): ${oauthError}`);
    return respond(400, 'Login cancelled or denied.', safeSlug);
  }

  // Validate authorization code
  if (!code || typeof code !== 'string' || code.length < 4 || code.length > 512) {
    return respond(400, 'Invalid or missing authorization code.', 'bad_code');
  }

  // Rate limit code exchange to prevent replay / brute-force attempts
  if (!checkRateLimit(`auth_code:${ip}`, 10)) {
    return respond(429, 'Too many login attempts. Please try again later.', 'rate_limit');
  }

  const redirectUri = getRedirectUri();
  if (!redirectUri) {
    console.error('[auth] Could not construct redirect URI — PRODUCTION_URL may be invalid.');
    return respond(500, 'Server configuration error.', 'server_config');
  }

  try {
    // ── Step 1: Exchange authorization code for access token ──────────────
    const tokenResp = await fetch('https://apis.roblox.com/oauth/v1/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code:          code.trim(),
        redirect_uri:  redirectUri,
        client_id:     clientId,
        client_secret: clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenResp.ok) {
      // Log full error server-side; never expose OAuth internals to the client
      const errData = await tokenResp.json().catch(() => ({}));
      console.error('[auth] Token exchange failed:', tokenResp.status, errData);
      return respond(400, 'Login failed. Please try again.', 'token_failed');
    }

    const tokenData = await tokenResp.json().catch(() => null);
    if (!tokenData) {
      return respond(400, 'Received invalid token response.', 'bad_token_response');
    }

    const accessToken = tokenData.access_token;
    if (!accessToken || typeof accessToken !== 'string') {
      console.error('[auth] No access_token in token response.');
      return respond(400, 'No access token received.', 'no_token');
    }

    // ── Step 2: Fetch user info with the access token ─────────────────────
    const userInfoResp = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal:  AbortSignal.timeout(8_000),
    });

    if (!userInfoResp.ok) {
      console.error('[auth] Userinfo fetch failed:', userInfoResp.status);
      return respond(400, 'Failed to retrieve account information.', 'userinfo_failed');
    }

    const userInfo = await userInfoResp.json().catch(() => null);
    if (!userInfo) {
      return respond(400, 'Invalid user info response.', 'bad_userinfo');
    }

    const userId   = userInfo.sub;
    const username = userInfo.preferred_username || userInfo.name || '';

    // Validate both fields are present
    if (!userId || !username) {
      console.error('[auth] Incomplete user data from Roblox:', { userId, username });
      return respond(400, 'Incomplete account data received.', 'incomplete_user');
    }

    // Roblox user IDs are always numeric strings
    if (!/^\d{1,20}$/.test(String(userId))) {
      console.error('[auth] Suspicious non-numeric userId received:', userId);
      return respond(400, 'Invalid account ID format.', 'invalid_id');
    }

    // Sanitize display fields
    const cleanUsername    = sanStr(String(username), 50);
    const cleanDisplayName = sanStr(String(userInfo.name || username), 80);

    if (!cleanUsername) {
      return respond(400, 'Username is empty after sanitization.', 'bad_username');
    }

    // ── Step 3: Resolve avatar from Roblox CDN ────────────────────────────
    const avatarUrl = await resolveRobloxAvatar(
      String(userId),
      String(userInfo.picture || ''),
    );

    // Build the public user profile object
    // NOTE: This does NOT include the access token — never send that to the client
    const userData = {
      id:          String(userId),
      username:    cleanUsername,
      displayName: cleanDisplayName,
      avatar:      avatarUrl,
    };

    // ── Step 4: Return to caller ──────────────────────────────────────────
    if (isApiReq) {
      return res.status(200).json({ user: userData });
    }

    // Browser flow: encode profile as base64url and redirect to the login page
    // The frontend reads and validates this parameter to complete the login
    const encoded = Buffer.from(JSON.stringify(userData)).toString('base64url');
    return safeRedirect(res, `/login?roblox_user=${encodeURIComponent(encoded)}`);

  } catch (err) {
    // Catch network timeouts, JSON parse failures, unexpected errors
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
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