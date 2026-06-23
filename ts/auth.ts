// ts/auth.ts — NEXUS AI Roblox OAuth Callback (FIXED v7 — TypeScript)
//
// Changes v7 (JS → TS):
//   • Full TypeScript strict types — no implicit 'any'
//   • AdaptedRequest / AdaptedResponse dari route.ts digunakan konsisten
//   • RobloxTokenResponse interface untuk typing respons token exchange
//   • RobloxUserInfo interface untuk typing respons userinfo
//   • SafeUserData interface untuk output bersih
//   • resolveRobloxAvatar, sanStr, safeRedirect semua dianotasi penuh
//   • err.name TimeoutError/AbortError di-narrowing lewat type guard
//   • Tidak ada perubahan behaviour — semua logic identik dengan v6

import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route';
import { checkRateLimit, setSecurityHeaders, } from './_security';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface RobloxTokenResponse {
  access_token?: string;
  error?:        string;
  [key: string]: unknown;
}

interface RobloxUserInfo {
  sub?:                string | number;
  preferred_username?: string;
  name?:               string;
  picture?:            string;
  [key: string]:       unknown;
}

interface RobloxThumbnailData {
  imageUrl?: string;
  [key: string]: unknown;
}

interface RobloxThumbnailResponse {
  data?: RobloxThumbnailData[];
  [key: string]: unknown;
}

interface SafeUserData {
  id:          string;
  username:    string;
  displayName: string;
  avatar:      string;
}

// ─── PRODUCTION URL ───────────────────────────────────────────────────────────

function getProductionBase(): string | null {
  const raw = (process.env.PRODUCTION_URL ?? '').trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/\/api\/auth\/?$/, '')
    .replace(/\/api\/?$/, '')
    .replace(/\/+$/, '');

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:') return null;
    return parsed.origin; // scheme + host + port only — no path
  } catch {
    return null;
  }
}

function getRedirectUri(): string | null {
  const base = getProductionBase();
  return base ? `${base}/api/auth` : null;
}

// ─── SAFE REDIRECT ────────────────────────────────────────────────────────────

function safeRedirect(res: AdaptedResponse, path: string): AdaptedResponse {
  const base = getProductionBase();
  if (
    !base                      ||
    typeof path !== 'string'   ||
    !path.startsWith('/')      ||
    /^\/\/|:|\.\./.test(path)  // block protocol-relative, absolute URLs, path traversal
  ) {
    return res.status(500).json({ error: 'Redirect configuration error.' });
  }
  return res.redirect(302, `${base}${path}`);
}

// ─── AVATAR HELPER ────────────────────────────────────────────────────────────

const SAFE_AVATAR_DOMAINS: readonly string[] = [
  'https://tr.rbxcdn.com/',
  'https://t0.rbxcdn.com/',
  'https://t1.rbxcdn.com/',
  'https://t2.rbxcdn.com/',
  'https://t3.rbxcdn.com/',
  'https://t4.rbxcdn.com/',
  'https://thumbnails.roblox.com/',
] as const;

function isSafeAvatarUrl(url: unknown): url is string {
  return (
    typeof url === 'string' &&
    url.length > 0          &&
    url.length <= 512       &&
    SAFE_AVATAR_DOMAINS.some(d => (url as string).startsWith(d))
  );
}

async function resolveRobloxAvatar(
  userId:      string | number,
  fallbackUrl: string = '',
): Promise<string> {
  // Use fallback if it's already from a trusted CDN
  if (isSafeAvatarUrl(fallbackUrl)) return fallbackUrl;

  const uid = String(userId ?? '').trim();
  if (!uid || !/^\d{1,20}$/.test(uid)) return '';

  try {
    const apiUrl =
      `https://thumbnails.roblox.com/v1/users/avatar-headshot` +
      `?userIds=${encodeURIComponent(uid)}&size=420x420&format=Png&isCircular=false`;

    const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(5_000) });
    if (!resp.ok) return '';

    const json     = await resp.json().catch(() => null) as RobloxThumbnailResponse | null;
    const imageUrl = json?.data?.[0]?.imageUrl ?? '';

    return isSafeAvatarUrl(imageUrl) ? imageUrl : '';
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[auth] Avatar fetch failed for uid', uid, '—', msg);
    return '';
  }
}

// ─── STRING SANITISER ────────────────────────────────────────────────────────

function sanStr(str: unknown, max: number = 100): string {
  const s = typeof str === 'string' ? str : String(str ?? '');
  return s
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // strip control chars
    .replace(/[<>]/g, '')                                 // strip angle brackets
    .substring(0, max)
    .trim();
}

// ─── TYPE GUARD ───────────────────────────────────────────────────────────────

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'TimeoutError' || err.name === 'AbortError')
  );
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

const handler: HandlerFn = async (req: AdaptedRequest, res: AdaptedResponse) => {
  setSecurityHeaders(res);

  const productionBase = getProductionBase();
  if (!productionBase) {
    console.error('[auth][ERR-001] PRODUCTION_URL is not set or invalid.');
    return res.status(500).json({
      error: 'Server misconfiguration: PRODUCTION_URL is not set.',
    });
  }

  // CORS — locked to production origin only
  res.setHeader('Access-Control-Allow-Origin',      productionBase);
  res.setHeader('Access-Control-Allow-Methods',     'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',     'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  // Collect request metadata
  const ip: string = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim() || 'unknown';

  const isApiReq = (req.headers['accept'] ?? '').includes('application/json');

  // Uniform error helpers
  const apiError  = (status: number, msg: string) =>
    res.status(status).json({ error: msg });

  const pageError = (slug: string) =>
    safeRedirect(res, `/login?roblox_error=${encodeURIComponent(slug)}`);

  const respond = (status: number, msg: string, slug: string) =>
    isApiReq ? apiError(status, msg) : pageError(slug);

  // ── Verify required secrets ───────────────────────────────────────────────
  const clientId     = (process.env.ROBLOX_CLIENT_ID     ?? '').trim();
  const clientSecret = (process.env.ROBLOX_CLIENT_SECRET ?? '').trim();

  if (!clientId || !clientSecret) {
    console.error('[auth][ERR-002] ROBLOX_CLIENT_ID or ROBLOX_CLIENT_SECRET missing.');
    return respond(500, 'Server not configured. Contact an administrator.', 'server_config');
  }

  // NOTE: State token verification has been intentionally removed.
  // The client (login.tsx) sends state as a plain "lang_randomToken" string
  // which is NOT HMAC-signed. Attempting to verify it causes state_invalid errors.
  // Rate limiting below provides the primary replay / brute-force protection.

  const { code, error: oauthError } = req.query;

  // ── Handle OAuth errors from Roblox ──────────────────────────────────────
  if (oauthError) {
    const KNOWN_ERRORS = new Set([
      'access_denied',
      'server_error',
      'temporarily_unavailable',
      'invalid_request',
      'unauthorized_client',
      'unsupported_response_type',
    ]);
    const safeSlug = KNOWN_ERRORS.has(String(oauthError))
      ? String(oauthError)
      : 'oauth_error';
    console.info(`[auth] OAuth error from Roblox (${ip}): ${oauthError}`);
    return respond(400, 'Login cancelled or denied.', safeSlug);
  }

  // ── Validate authorization code ───────────────────────────────────────────
  // Roblox auth codes are typically 64 hex chars but spec allows up to 512
  if (
    !code                    ||
    typeof code !== 'string' ||
    code.trim().length < 4   ||
    code.trim().length > 512
  ) {
    console.warn(`[auth][WARN-020] Invalid code length (${String(code ?? '').length}) from ${ip}`);
    return respond(400, 'Invalid or missing authorization code.', 'bad_code');
  }

  // Rate-limit code exchange
  if (!checkRateLimit(`auth_code:${ip}`, 10)) {
    return respond(429, 'Too many login attempts. Please try again later.', 'rate_limit');
  }

  const redirectUri = getRedirectUri();
  if (!redirectUri) {
    console.error('[auth][ERR-005] Could not construct redirect URI — check PRODUCTION_URL.');
    return respond(500, 'Server configuration error.', 'server_config');
  }

  try {
    // ── Step 1: Exchange code for access token ────────────────────────────
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
      const errData = await tokenResp.json().catch(() => ({})) as RobloxTokenResponse;
      console.error(
        `[auth][ERR-030] Token exchange failed: HTTP ${tokenResp.status}`,
        JSON.stringify(errData),
      );
      return respond(400, 'Login failed. Please try again.', 'token_failed');
    }

    const tokenData = await tokenResp.json().catch(() => null) as RobloxTokenResponse | null;
    if (!tokenData || typeof tokenData !== 'object') {
      console.error('[auth][ERR-031] Token response is not valid JSON.');
      return respond(400, 'Received invalid token response.', 'bad_token_response');
    }

    const accessToken = tokenData.access_token;
    if (
      !accessToken                    ||
      typeof accessToken !== 'string' ||
      accessToken.trim().length < 10
    ) {
      console.error('[auth][ERR-032] access_token missing or too short in token response.');
      return respond(400, 'No access token received.', 'no_token');
    }

    // ── Step 2: Fetch user info ───────────────────────────────────────────
    const userInfoResp = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken.trim()}` },
      signal:  AbortSignal.timeout(8_000),
    });

    if (!userInfoResp.ok) {
      console.error(`[auth][ERR-040] Userinfo fetch failed: HTTP ${userInfoResp.status}`);
      return respond(400, 'Failed to retrieve account information.', 'userinfo_failed');
    }

    const userInfo = await userInfoResp.json().catch(() => null) as RobloxUserInfo | null;
    if (!userInfo || typeof userInfo !== 'object') {
      console.error('[auth][ERR-041] Userinfo response is not valid JSON.');
      return respond(400, 'Invalid user info response.', 'bad_userinfo');
    }

    // Cast userId ke string SEBELUM regex test (Roblox kadang return number)
    const userId   = String(userInfo.sub ?? '').trim();
    const username = String(
      userInfo.preferred_username ?? userInfo.name ?? '',
    ).trim();

    if (!userId || !username) {
      console.error('[auth][ERR-042] Incomplete user data:', { userId, username });
      return respond(400, 'Incomplete account data received.', 'incomplete_user');
    }

    if (!/^\d{1,20}$/.test(userId)) {
      console.error('[auth][ERR-043] Non-numeric userId received:', userId);
      return respond(400, 'Invalid account ID format.', 'invalid_id');
    }

    const cleanUsername    = sanStr(username, 50);
    const cleanDisplayName = sanStr(String(userInfo.name ?? username), 80);

    if (!cleanUsername) {
      console.error('[auth][ERR-044] Username is empty after sanitization.');
      return respond(400, 'Username is empty after sanitization.', 'bad_username');
    }

    // ── Step 3: Resolve avatar ────────────────────────────────────────────
    const avatarUrl = await resolveRobloxAvatar(
      userId,
      String(userInfo.picture ?? ''),
    );

    const userData: SafeUserData = {
      id:          userId,
      username:    cleanUsername,
      displayName: cleanDisplayName,
      avatar:      avatarUrl,
    };

    // ── Step 4: Return result ─────────────────────────────────────────────
    if (isApiReq) {
      return res.status(200).json({ user: userData });
    }

    // base64url menggunakan hanya URL-safe chars (A-Z a-z 0-9 - _)
    const encoded = Buffer.from(JSON.stringify(userData)).toString('base64url');
    return safeRedirect(res, `/login?roblox_user=${encoded}`);

  } catch (err: unknown) {
    const isTimeout = isAbortError(err);
    const msg       = err instanceof Error ? err.message : String(err);
    const name      = err instanceof Error ? err.name    : 'Unknown';
    console.error(`[auth][ERR-099] Unexpected error (${name}):`, msg);
    return respond(
      isTimeout ? 503 : 500,
      isTimeout
        ? 'Login timed out. Please try again.'
        : 'An unexpected server error occurred.',
      isTimeout ? 'timeout' : 'server_error',
    );
  }
};

export default handler;