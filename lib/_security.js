// api/_security.js — NEXUS AI Shared Security Utilities v3
//
// Import:
//   import {
//     escapeHtml, sanitizeStr, validateBody,
//     verifyAdminToken,
//     checkRateLimit,
//     generateStateToken, verifyStateToken,
//     setSecurityHeaders,
//   } from './_security.js';
//
// Required env:
//   OAUTH_STATE_SECRET  — random string ≥ 32 chars  (for CSRF state tokens)
//   ADMIN_TOKEN         — random string ≥ 32 chars  (for admin route auth)
//
// Changes from v2:
//   • REMOVED 'fallback-insecure' fallback — functions now throw/return false explicitly
//   • HMAC no longer truncated (was 16 hex chars → now full 64-char SHA-256 hex)
//   • timingSafeEqual rewritten: compares equal-length HMAC digests — never throws
//   • State token separator changed from '.' to '~' (never appears in hex/base36)
//   • setSecurityHeaders adds HSTS, Cache-Control, Permissions-Policy, COOP/COEP
//   • checkRateLimit now accepts configurable windowMs parameter
//   • setInterval cleanup replaced with opportunistic prune — safe for edge runtimes
//   • escapeHtml no longer escapes '=' (not an XSS vector in quoted attributes)
//   • verifyAdminToken uses HMAC-digest constant-time comparison (not padEnd hack)

import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — HTML / STRING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Encodes all HTML/JS special chars to prevent XSS.
 * Use on EVERY piece of user-controlled data before writing to HTML.
 * @param {*}      str    — value to escape (coerced to string)
 * @param {number} maxLen — hard character limit before escaping (default 500)
 * @returns {string}
 */
export function escapeHtml(str, maxLen = 500) {
  return String(str ?? '')
    .substring(0, maxLen)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/`/g,  '&#96;');
  // NOTE: '=' intentionally NOT escaped — not an XSS vector in quoted attrs
  // and escaping it breaks URLs / base64 / data attributes.
}

/**
 * Strips control characters and angle brackets for safe DB/JSON storage.
 * Does NOT HTML-encode — call escapeHtml() separately before rendering.
 * @param {*}      str    — value to sanitize (coerced to string)
 * @param {number} maxLen — maximum kept length (default 200)
 * @returns {string}
 */
export function sanitizeStr(str, maxLen = 200) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // strip non-printable control chars
    .replace(/[<>]/g, '')                                 // strip angle brackets
    .substring(0, maxLen);
}

/**
 * Validates that a request body is a plain object with all required fields
 * present and non-empty.
 * @param {*}        body     — parsed request body
 * @param {string[]} required — field names that must be present and non-empty
 * @returns {string|null}     — error message, or null if valid
 */
export function validateBody(body, required = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Body harus berupa objek JSON.';
  }
  for (const field of required) {
    const val = body[field];
    if (val === undefined || val === null || val === '') {
      return `Field '${field}' wajib diisi.`;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — CONSTANT-TIME STRING COMPARISON
// ═══════════════════════════════════════════════════════════════════════════════

// One random key generated per process lifetime — used to HMAC-hash both sides
// before comparing. Both HMAC-SHA256 digests are always 32 bytes, so
// timingSafeEqual never throws from a length mismatch.
const _CMP_KEY = crypto.randomBytes(32);

/**
 * Compares two strings in constant time. Safe against length-based timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function _safeEqual(a, b) {
  const ha = crypto.createHmac('sha256', _CMP_KEY).update(String(a)).digest();
  const hb = crypto.createHmac('sha256', _CMP_KEY).update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb); // both always 32 bytes — never throws
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — ADMIN TOKEN VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verifies the admin token from an incoming request.
 * Checks (in order): Authorization header > x-admin-token header > ?token query param.
 * NEVER reads from the request body (prevents body-injection attacks).
 * @param {object} req — Node/Vercel request object
 * @returns {boolean}
 */
export function verifyAdminToken(req) {
  const envToken = (process.env.ADMIN_TOKEN || '').trim();

  if (!envToken || envToken === 'nexusadmin2024' || envToken.length < 16) {
    console.error('[security][ERR-A01] ADMIN_TOKEN not configured or uses insecure default.');
    return false;
  }

  const candidate = (
    (req?.headers?.['authorization'] || '').replace(/^Bearer\s+/i, '').trim() ||
    (req?.headers?.['x-admin-token'] || '').trim()                             ||
    (typeof req?.query?.token === 'string' ? req.query.token.trim() : '')
  );

  if (!candidate) return false;

  // Constant-time HMAC-digest comparison — no length leakage
  return _safeEqual(candidate, envToken);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════════

// NOTE: in-process store — resets on cold start. For strict production limits
// replace with Redis / Upstash / KV.

/** @type {Map<string, { count: number, resetAt: number }>} */
const _rl = new Map();

/** Remove buckets that expired more than graceSec seconds ago. */
function _pruneRL(graceSec = 120) {
  const cutoff = Date.now() - graceSec * 1_000;
  for (const [k, v] of _rl) {
    if (v.resetAt < cutoff) _rl.delete(k);
  }
}

/**
 * Sliding-window rate limiter (in-process; resets on cold start).
 * @param {string} key         — bucket identifier, e.g. "auth_code:1.2.3.4"
 * @param {number} maxRequests — allowed calls per window (default 60)
 * @param {number} windowMs    — window length in ms (default 60 000)
 * @returns {boolean}          — true = allowed, false = throttled
 */
export function checkRateLimit(key, maxRequests = 60, windowMs = 60_000) {
  const now = Date.now();
  const k   = String(key || 'anon').substring(0, 128);

  // Opportunistic cleanup ~0.5% of calls — avoids setInterval in edge runtimes
  if (Math.random() < 0.005) _pruneRL();

  const rl = _rl.get(k);

  if (!rl || now > rl.resetAt) {
    _rl.set(k, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (rl.count >= maxRequests) return false;
  rl.count++;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — OAUTH STATE TOKENS (CSRF protection)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Token format (before base64url):
//   <timestamp_base36> ~ <random_hex_32> ~ [extra] ~ <hmac_sha256_hex_64>
//
// '~' separator never appears in base36, hex, or base64url output.
// Full 64-char HMAC-SHA256 is used — no truncation.
//

const _SEP          = '~';
const _STATE_MAX_MS = 10 * 60_000; // 10 minutes

/**
 * Generates a signed, time-limited CSRF state token.
 * @param {string} [extra=''] — optional context data to bind into the token
 * @returns {string}            base64url-encoded signed token
 * @throws  {Error}             if OAUTH_STATE_SECRET is missing or too short
 */
export function generateStateToken(extra = '') {
  const secret = (process.env.OAUTH_STATE_SECRET || '').trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      '[security] OAUTH_STATE_SECRET is not set or too short — minimum 16 chars required.',
    );
  }

  const ts        = Date.now().toString(36);
  const rand      = crypto.randomBytes(16).toString('hex'); // 32-char hex nonce
  const safeExtra = String(extra || '').replace(new RegExp(_SEP, 'g'), '');
  const payload   = [ts, rand, safeExtra].join(_SEP);
  const sig       = crypto.createHmac('sha256', secret).update(payload).digest('hex'); // full 64 chars

  return Buffer.from(`${payload}${_SEP}${sig}`).toString('base64url');
}

/**
 * Verifies a CSRF state token from generateStateToken().
 * Returns true only when signature is valid AND token is not expired.
 * @param {string} token      — token from the OAuth callback ?state= param
 * @param {number} [maxAgeMs] — max token age in ms (default 10 min)
 * @returns {boolean}
 */
export function verifyStateToken(token, maxAgeMs = _STATE_MAX_MS) {
  const secret = (process.env.OAUTH_STATE_SECRET || '').trim();
  if (!secret || secret.length < 16) return false;
  if (!token  || typeof token !== 'string')   return false;

  // Decode base64url
  let decoded;
  try {
    decoded = Buffer.from(token.trim(), 'base64url').toString('utf8');
  } catch {
    return false;
  }

  // Split at LAST separator — everything before is payload, last part is sig
  const idx = decoded.lastIndexOf(_SEP);
  if (idx === -1) return false;

  const payload = decoded.substring(0, idx);
  const sig     = decoded.substring(idx + 1);
  if (!payload || !sig) return false;

  // Recompute full 64-char HMAC and compare in constant time
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (!_safeEqual(sig, expected)) return false;

  // Extract and validate timestamp (first segment of payload)
  const firstSep = payload.indexOf(_SEP);
  if (firstSep === -1) return false;

  const ts = parseInt(payload.substring(0, firstSep), 36);
  if (!Number.isFinite(ts) || ts <= 0) return false;

  return (Date.now() - ts) < maxAgeMs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — HTTP SECURITY HEADERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sets a comprehensive set of HTTP security hardening headers.
 * Call at the very top of every API handler, before any branching.
 * @param {object} res — Node/Vercel response object
 */
export function setSecurityHeaders(res) {
  // Prevent MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Legacy XSS filter (belt-and-suspenders for older browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Limit referrer header leakage
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict unused browser features
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  );

  // Force HTTPS for 2 years — API endpoints must never be served over HTTP
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  );

  // Tightest possible CSP — pure API, no HTML output
  res.setHeader('Content-Security-Policy', "default-src 'none'");

  // Prevent cross-origin opener/resource attacks
  res.setHeader('Cross-Origin-Opener-Policy',   'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // Prevent caching of any auth/API responses
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma',        'no-cache');
  res.setHeader('Expires',       '0');
}