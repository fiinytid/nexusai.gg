// api/google-callback.js — NEXUS AI Google OAuth Callback (SECURE v3)
// Security: CSRF state token, no secret leakage, strict redirect URI

import { generateStateToken, verifyStateToken, checkRateLimit, setSecurityHeaders } from './_security.js';

function getAllowedBase() {
  const env = (process.env.PRODUCTION_URL || '')
    .replace(/\/api\/google-callback\/?$/, '')
    .replace(/\/$/, '');
  return env || 'https://nexusai-roblox.vercel.app';
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', getAllowedBase());
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';

  // ── GET state token ───────────────────────────────────────────────────────
  if (req.query.get_state === '1') {
    if (!checkRateLimit(`gcb_state:${ip}`, 20)) {
      return res.status(429).json({ error: 'Rate limit. Coba lagi nanti.' });
    }
    return res.status(200).json({ state: generateStateToken('google') });
  }

  const isApiCall = (req.headers['accept'] || '').includes('application/json');
  const { code, error, state } = req.query;

  // ── Validate CSRF state ───────────────────────────────────────────────────
  const stateSecretSet = !!(process.env.OAUTH_STATE_SECRET || '').trim();
  if (stateSecretSet) {
    if (!state) {
      return isApiCall
        ? res.status(403).json({ error: 'State token hilang.' })
        : res.redirect(302, '/login?google_error=state_missing');
    }
    if (!verifyStateToken(state)) {
      return isApiCall
        ? res.status(403).json({ error: 'State token tidak valid.' })
        : res.redirect(302, '/login?google_error=state_invalid');
    }
  }

  if (error) {
    return isApiCall
      ? res.status(400).json({ error: 'Login Google dibatalkan.' })
      : res.redirect(302, '/login?google_error=cancelled');
  }

  if (!code || typeof code !== 'string' || code.length > 512) {
    return isApiCall
      ? res.status(400).json({ error: 'Kode tidak valid.' })
      : res.redirect(302, '/login');
  }

  if (!checkRateLimit(`gcb_code:${ip}`, 10)) {
    return res.status(429).json({ error: 'Rate limit. Coba lagi nanti.' });
  }

  const clientId     = process.env.GMAIL_KEY;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[google-callback] GMAIL_KEY atau GMAIL_CLIENT_SECRET belum dikonfigurasi.');
    return isApiCall
      ? res.status(500).json({ error: 'Server belum dikonfigurasi.' })
      : res.redirect(302, '/login?google_error=server_config');
  }

  try {
    const base        = getAllowedBase();
    const redirectUri = base + '/api/google-callback';

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code:          code.trim(),
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });

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

    const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tokens.access_token },
      signal: AbortSignal.timeout(8_000),
    });

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

    // Validate it's actually a Google account ID (numeric string)
    if (!/^\d{1,30}$/.test(String(gUser.id))) {
      console.error('[google-callback] Suspicious Google ID:', gUser.id);
      return isApiCall
        ? res.status(400).json({ error: 'ID akun tidak valid.' })
        : res.redirect(302, '/login?google_error=invalid_id');
    }

    const userData = {
      id:      String(gUser.id),
      name:    String(gUser.name  || gUser.email).substring(0, 80),
      email:   String(gUser.email || '').substring(0, 100),
      picture: String(gUser.picture || '').substring(0, 500),
    };

    if (isApiCall) return res.status(200).json({ user: userData });

    const encoded = Buffer.from(JSON.stringify(userData)).toString('base64url');
    return res.redirect(302, '/login?google_user=' + encodeURIComponent(encoded));

  } catch (e) {
    console.error('[google-callback] Unexpected error:', e.message);
    return isApiCall
      ? res.status(500).json({ error: 'Terjadi kesalahan server.' })
      : res.redirect(302, '/login?google_error=server_error');
  }
}