// api/_security.js — NEXUS AI Shared Security Utilities
// Import: import { verifyAdminToken, escapeHtml, sanitizeStr, checkRateLimit, generateStateToken, verifyStateToken } from './_security.js';

import crypto from 'crypto';

// ─── HTML ESCAPE (full XSS protection) ───────────────────────────────────────
// Encodes ALL special HTML/JS characters — use in every user-data output
export function escapeHtml(str, maxLen = 500) {
  return String(str ?? '')
    .substring(0, maxLen)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/`/g, '&#96;')
    .replace(/=/g, '&#x3D;');
}

// ─── STRING SANITIZER (for DB/JSON storage — strips control chars) ────────────
export function sanitizeStr(str, maxLen = 200) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // strip control chars (keep \t \n \r)
    .replace(/[<>]/g, '')                                 // strip angle brackets
    .substring(0, maxLen);
}

// ─── ADMIN TOKEN VERIFICATION ────────────────────────────────────────────────
// Checks Authorization header > x-admin-token header > query param
// NEVER accept token from body (prevents request-body injection)
export function verifyAdminToken(req) {
  const envToken = process.env.ADMIN_TOKEN;

  // Reject if no token configured or still using insecure defaults
  if (!envToken || envToken === 'nexusadmin2024' || envToken.length < 16) {
    console.error('[NEXUS security] ADMIN_TOKEN not configured or uses insecure default!');
    return false;
  }

  const candidate =
    req.headers?.['authorization']?.replace(/^Bearer\s+/i, '').trim() ||
    req.headers?.['x-admin-token']?.trim() ||
    (typeof req.query?.token === 'string' ? req.query.token.trim() : null);

  if (!candidate) return false;

  // Constant-time comparison to prevent timing attacks
  try {
    const a = Buffer.from(candidate.padEnd(128));
    const b = Buffer.from(envToken.padEnd(128));
    return crypto.timingSafeEqual(a.slice(0, 128), b.slice(0, 128)) && candidate === envToken;
  } catch (_) {
    return false;
  }
}

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const _rateLimits = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rateLimits) {
    if (now > v.reset + 120_000) _rateLimits.delete(k);
  }
}, 5 * 60_000).unref?.();

export function checkRateLimit(key, maxPerMinute = 60) {
  const now = Date.now();
  const k = String(key || 'anon').substring(0, 128);
  if (!_rateLimits.has(k)) _rateLimits.set(k, { count: 0, reset: now + 60_000 });
  const rl = _rateLimits.get(k);
  if (now > rl.reset) { rl.count = 0; rl.reset = now + 60_000; }
  return ++rl.count <= maxPerMinute;
}

// ─── OAUTH STATE TOKEN (CSRF protection) ─────────────────────────────────────
// Generates a signed, time-limited state token for OAuth CSRF protection
export function generateStateToken(extra = '') {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.ADMIN_TOKEN || 'fallback-insecure';
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(12).toString('hex');
  const payload = `${ts}.${rand}.${extra}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').substring(0, 16);
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

export function verifyStateToken(token, maxAgeMs = 10 * 60_000) {
  try {
    const secret = process.env.OAUTH_STATE_SECRET || process.env.ADMIN_TOKEN || 'fallback-insecure';
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length < 4) return false;
    const sig = parts.pop();
    const payload = parts.join('.');
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex').substring(0, 16);
    if (!crypto.timingSafeEqual(Buffer.from(sig.padEnd(32)), Buffer.from(expectedSig.padEnd(32)))) return false;
    // Check age
    const ts = parseInt(parts[0], 36);
    return !isNaN(ts) && (Date.now() - ts) < maxAgeMs;
  } catch (_) {
    return false;
  }
}

// ─── SECURITY HEADERS ─────────────────────────────────────────────────────────
export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
}

// ─── INPUT VALIDATOR ─────────────────────────────────────────────────────────
export function validateBody(body, required = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Body harus berupa objek JSON.';
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return `Field '${field}' wajib diisi.`;
    }
  }
  return null;
}