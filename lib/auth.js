// api/auth.js — NEXUS AI Roblox OAuth Callback (SECURE v3)
// Security: CSRF state token, strict redirect URI, no secret leakage

import { generateStateToken, verifyStateToken, checkRateLimit, setSecurityHeaders } from './_security.js';

// Allowed redirect URIs — only these are valid (prevent open redirect)
const ALLOWED_REDIRECT_BASES = [
  'https://nexusai-rbx.vercel.app',
];

function getAllowedBase() {
  const env = (process.env.PRODUCTION_URL || '').replace(/\/api\/auth\/?$/, '').replace(/\/$/, '');
  return env || ALLOWED_REDIRECT_BASES[0];
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', getAllowedBase()); // not wildcard for OAuth
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';

  // ── GET state token (frontend must call this before OAuth redirect) ────────
  if (req.query.get_state === '1') {
    if (!checkRateLimit(`auth_state:${ip}`, 20)) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });
    }
    return res.status(200).json({ state: generateStateToken() });
  }

  const isApiCall = (req.headers['accept'] || '').includes('application/json');
  const { code, error, state } = req.query;

  // ── Validate CSRF state token ─────────────────────────────────────────────
  // Accept missing state if OAUTH_STATE_SECRET not set (backward compat during migration)
  // Once env var is set, state becomes mandatory
  const stateSecretSet = !!(process.env.OAUTH_STATE_SECRET || '').trim();
  if (stateSecretSet) {
    if (!state) {
      const msg = 'State token hilang — kemungkinan serangan CSRF.';
      return isApiCall
        ? res.status(403).json({ error: msg })
        : res.redirect(302, '/login?roblox_error=' + encodeURIComponent('state_missing'));
    }
    if (!verifyStateToken(state)) {
      const msg = 'State token tidak valid atau sudah kedaluwarsa.';
      return isApiCall
        ? res.status(403).json({ error: msg })
        : res.redirect(302, '/login?roblox_error=' + encodeURIComponent('state_invalid'));
    }
  }

  if (error) {
    // Don't reflect raw OAuth error to client — could contain sensitive info
    const safeError = ['access_denied', 'server_error', 'temporarily_unavailable'].includes(error)
      ? error : 'oauth_error';
    return isApiCall
      ? res.status(400).json({ error: 'Login dibatalkan.' })
      : res.redirect(302, '/login?roblox_error=' + encodeURIComponent(safeError));
  }

  if (!code || typeof code !== 'string' || code.length > 512) {
    return isApiCall
      ? res.status(400).json({ error: 'Kode tidak valid.' })
      : res.redirect(302, '/login');
  }

  // Rate limit by IP to prevent code-replay brute force
  if (!checkRateLimit(`auth_code:${ip}`, 10)) {
    return res.status(429).json({ error: 'Rate limit. Coba lagi nanti.' });
  }

  const clientId     = process.env.ROBLOX_CLIENT_ID;
  const clientSecret = process.env.ROBLOX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[auth] ROBLOX_CLIENT_ID atau ROBLOX_CLIENT_SECRET belum dikonfigurasi.');
    return isApiCall
      ? res.status(500).json({ error: 'Server belum dikonfigurasi.' })
      : res.redirect(302, '/login?roblox_error=server_config');
  }

  try {
    const base = getAllowedBase();
    const redirectUri = base + '/api/auth';

    // Exchange code for token
    const tokenResp = await fetch('https://apis.roblox.com/oauth/v1/token', {
      method: 'POST',
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
      const errData = await tokenResp.json().catch(() => ({}));
      // Log full error server-side, return generic message to client
      console.error('[auth] Token exchange failed:', errData);
      const clientMsg = 'Login gagal. Silakan coba lagi.';
      return isApiCall
        ? res.status(400).json({ error: clientMsg })
        : res.redirect(302, '/login?roblox_error=token_failed');
    }

    const tokenData   = await tokenResp.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return isApiCall
        ? res.status(400).json({ error: 'Token tidak diterima.' })
        : res.redirect(302, '/login?roblox_error=no_token');
    }

    // Get user info
    const userInfoResp = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken },
      signal: AbortSignal.timeout(8_000),
    });

    if (!userInfoResp.ok) {
      return isApiCall
        ? res.status(400).json({ error: 'Gagal mendapatkan info akun.' })
        : res.redirect(302, '/login?roblox_error=userinfo_failed');
    }

    const userInfo = await userInfoResp.json();
    const userId   = userInfo.sub;
    const username = userInfo.preferred_username || userInfo.name || '';

    if (!userId || !username) {
      return isApiCall
        ? res.status(400).json({ error: 'Data akun tidak lengkap.' })
        : res.redirect(302, '/login?roblox_error=incomplete_user');
    }

    // Validate userId is a numeric Roblox ID
    if (!/^\d{1,20}$/.test(String(userId))) {
      console.error('[auth] Suspicious userId:', userId);
      return isApiCall
        ? res.status(400).json({ error: 'ID akun tidak valid.' })
        : res.redirect(302, '/login?roblox_error=invalid_id');
    }

    // Fetch avatar (fire & forget, non-blocking)
    let avatarUrl = userInfo.picture || '';
    if (!avatarUrl && userId) {
      try {
        const avResp = await fetch(
          `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(userId)}&size=420x420&format=Png`,
          { signal: AbortSignal.timeout(5_000) }
        );
        if (avResp.ok) {
          const avData = await avResp.json();
          avatarUrl = avData?.data?.[0]?.imageUrl || '';
        }
      } catch (_) {}
    }

    const userData = {
      id:          String(userId),
      username:    String(username).substring(0, 50),
      displayName: String(userInfo.name || username).substring(0, 80),
      avatar:      String(avatarUrl).substring(0, 500),
    };

    if (isApiCall) return res.status(200).json({ user: userData });

    // Browser redirect — encode user data (NOT sensitive — just public profile)
    const encoded = Buffer.from(JSON.stringify(userData)).toString('base64url');
    return res.redirect(302, '/login?roblox_user=' + encodeURIComponent(encoded));

  } catch (e) {
    console.error('[auth] Unexpected error:', e.message);
    return isApiCall
      ? res.status(500).json({ error: 'Terjadi kesalahan server.' })
      : res.redirect(302, '/login?roblox_error=server_error');
  }
}