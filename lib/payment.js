// api/payment.js — NEXUS AI Payment System (SECURE v5)
//
// Security:
//   • No hardcoded admin token fallbacks
//   • Admin token accepted via Authorization / X-Admin-Token headers ONLY
//     (never from query string — query params appear in server logs)
//   • Timing-safe token comparison (prevents timing attacks)
//   • Rate limiting on every endpoint
//   • Full input validation & sanitization (XSS prevention)
//   • Amount validation (no negative / overflow values)
//   • Cryptographically random transaction IDs
//   • Avatar resolved server-side via Roblox Thumbnails API (safe CDN only)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import crypto from 'crypto';

const PAYMENTS_FILE = '/tmp/nexus_payments.json';
const MAX_PAYMENTS  = 500;

// ─── ADMIN TOKEN ──────────────────────────────────────────────────────────────
/**
 * Returns the configured admin token or null if not set / too short.
 * We intentionally refuse tokens ≤ 15 chars to enforce strong secrets.
 */
function getAdminToken() {
  const t = process.env.ADMIN_TOKEN;
  if (!t || t.length < 16) return null;
  return t;
}

/**
 * Timing-safe token verification.
 * Accepts: Authorization: Bearer <token>  OR  X-Admin-Token: <token>
 * Query-string tokens are deliberately NOT accepted for payment actions.
 */
function verifyAdminToken(req) {
  const token = getAdminToken();
  if (!token) return false;

  const candidate =
    (req.headers?.['authorization'] || '').replace(/^Bearer\s+/i, '').trim() ||
    (req.headers?.['x-admin-token'] || '').trim();

  if (!candidate) return false;

  try {
    const maxLen = Math.max(candidate.length, token.length, 64);
    const a = Buffer.alloc(maxLen, 0);
    const b = Buffer.alloc(maxLen, 0);
    Buffer.from(candidate).copy(a);
    Buffer.from(token).copy(b);
    return crypto.timingSafeEqual(a, b) && candidate === token;
  } catch (_) {
    return false;
  }
}

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const _rl = new Map();

// Periodically clean up stale entries to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rl) if (now > v.reset + 120_000) _rl.delete(k);
}, 5 * 60_000).unref?.();

function checkRateLimit(key, maxPerMin = 20) {
  const now = Date.now();
  const k   = String(key || 'anon').substring(0, 100);
  if (!_rl.has(k)) _rl.set(k, { count: 0, reset: now + 60_000 });
  const r = _rl.get(k);
  if (now > r.reset) { r.count = 0; r.reset = now + 60_000; }
  return ++r.count <= maxPerMin;
}

// ─── SANITIZERS ──────────────────────────────────────────────────────────────
/** Escape HTML special characters for safe insertion into email templates. */
function esc(str, max = 100) {
  return String(str ?? '')
    .substring(0, max)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Strip control characters and angle brackets before storing. */
function sanStr(str, max = 100) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/[<>]/g, '')
    .substring(0, max);
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday:  'short',
      year:     'numeric',
      month:    'short',
      day:      'numeric',
      hour:     '2-digit',
      minute:   '2-digit',
      timeZone: 'Asia/Jakarta',
    }) + ' WIB';
  } catch (_) { return String(iso || '-'); }
}

// ─── PACKAGES ─────────────────────────────────────────────────────────────────
const PACKAGES = [
  {
    id:      'starter',
    cr:      50,
    idr:     38_000,
    usd:     2.38,
    label:   '50 CR — Starter',
    popular: false,
  },
  {
    id:      'popular',
    cr:      80,
    idr:     50_000,
    usd:     3.13,
    label:   '80 CR — Popular',
    popular: true,
  },
  {
    id:      'pro',
    cr:      150,
    idr:     120_000,
    usd:     7.50,
    label:   '150 CR — Pro',
    popular: false,
  },
  {
    id:      'mega',
    cr:      500,
    idr:     1_500_000,
    usd:     93.75,
    label:   '500 CR — Mega',
    popular: false,
  },
  {
    id:      'pro-plan',
    cr:      200,
    idr:     150_000,
    usd:     9.38,
    label:   'Pro Plan (Monthly) · 200 CR',
    popular: false,
  },
];

// ─── STORAGE ──────────────────────────────────────────────────────────────────
function loadPayments() {
  try {
    if (existsSync(PAYMENTS_FILE)) {
      const raw    = readFileSync(PAYMENTS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

function savePayments(payments) {
  try {
    writeFileSync(
      PAYMENTS_FILE,
      JSON.stringify(payments.slice(0, MAX_PAYMENTS), null, 2),
      'utf8',
    );
    return true;
  } catch (err) {
    console.error('[payment] savePayments failed:', err.message);
    return false;
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
/** Generate a cryptographically random transaction code. */
function generateTransactionId() {
  const rand = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `NPAY-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

/** Mask a payment number for public display (e.g. 0812****5678). */
function maskNumber(num) {
  const s = String(num || '');
  if (s.length < 8) return '****';
  return s.substring(0, 4) + '****' + s.substring(s.length - 4);
}

/** Format IDR amount. */
function fmtIDR(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
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
  'https://www.roblox.com/',
];

/**
 * Resolves a valid Roblox avatar headshot CDN URL.
 * Uses the Roblox Thumbnails API to get the real CDN URL,
 * then validates it against an allowlist of safe Roblox domains.
 */
async function resolveAvatar(rawAvatar, userId) {
  // If a safe CDN URL was already provided, use it directly
  if (rawAvatar && SAFE_AVATAR_DOMAINS.some(d => rawAvatar.startsWith(d))) {
    return rawAvatar.substring(0, 400);
  }

  const uid = String(userId || '').trim();
  if (!uid || !/^\d{1,20}$/.test(uid) || uid === '0') return '';

  try {
    const apiUrl =
      `https://thumbnails.roblox.com/v1/users/avatar-headshot` +
      `?userIds=${uid}&size=150x150&format=Png&isCircular=false`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return '';
    const json     = await res.json().catch(() => null);
    const imageUrl = json?.data?.[0]?.imageUrl || '';
    if (imageUrl && SAFE_AVATAR_DOMAINS.some(d => imageUrl.startsWith(d))) {
      return imageUrl.substring(0, 400);
    }
  } catch (err) {
    console.warn('[payment] Avatar fetch failed for uid', uid, '—', err.message);
  }

  return '';
}

// ─── EMAIL CONSTANTS ──────────────────────────────────────────────────────────
const FONT_MONO = "'Courier New', Courier, monospace";
const FONT_SANS = 'Arial, Helvetica, sans-serif';

/** Build a table-based avatar block compatible with Gmail / Outlook. */
function buildAvatarBlock(avatarUrl, displayName, size = 70) {
  const initial = (displayName || '?').charAt(0).toUpperCase();
  const half    = Math.round(size / 2);

  if (avatarUrl) {
    return `
      <table cellpadding="0" cellspacing="0" border="0" align="center"
             style="margin:0 auto 12px;">
        <tr>
          <td width="${size + 6}" height="${size + 6}" align="center" valign="middle"
              style="width:${size + 6}px;height:${size + 6}px;
                     border-radius:${half + 3}px;
                     background:linear-gradient(135deg,#00e5ff,#8800ff);
                     padding:3px;">
            <img src="${avatarUrl}" width="${size}" height="${size}"
                 alt="@${displayName}"
                 style="display:block;width:${size}px;height:${size}px;
                        border-radius:${half}px;border:0;" />
          </td>
        </tr>
      </table>`;
  }

  return `
    <table cellpadding="0" cellspacing="0" border="0" align="center"
           style="margin:0 auto 12px;">
      <tr>
        <td width="${size}" height="${size}" align="center" valign="middle"
            style="width:${size}px;height:${size}px;
                   border-radius:${half}px;
                   background:linear-gradient(135deg,#0a1040,#0f2060);
                   border:3px solid #00e5ff;
                   font-size:${Math.round(size * 0.38)}px;
                   font-weight:700;color:#ffffff;
                   font-family:${FONT_SANS};text-align:center;">
          ${initial}
        </td>
      </tr>
    </table>`;
}

// ─── EMAIL BUILDER ────────────────────────────────────────────────────────────
/**
 * Builds the admin notification email for a new payment submission.
 * All arguments must already be sanitized before calling.
 */
function buildPaymentEmail({
  username, userId, avatarUrl,
  pkg, method, transactionId, note, createdAt,
}) {
  const displayName = esc(username, 50);
  const displayUid  = esc(String(userId || '-'), 20);
  const avatarBlock = buildAvatarBlock(avatarUrl, displayName, 70);
  const paymentFmt  = fmtIDR(pkg.idr);
  const formattedAt = formatTime(createdAt);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>NEXUS AI — New Payment Received</title>
</head>
<body style="margin:0;padding:0;background-color:#030312;">

<table cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background-color:#030312;">
<tr><td align="center" style="padding:28px 12px;">

  <table cellpadding="0" cellspacing="0" border="0" width="580"
         style="max-width:580px;width:100%;">

    <!-- HEADER -->
    <tr><td>
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="background-color:#0b0c24;border:1px solid #1a2a4a;
                    border-radius:14px 14px 0 0;overflow:hidden;">
        <tr>
          <td height="3" style="background-color:#8800ff;font-size:0;width:33%;">&nbsp;</td>
          <td height="3" style="background-color:#00e5ff;font-size:0;width:34%;">&nbsp;</td>
          <td height="3" style="background-color:#00ffaa;font-size:0;width:33%;">&nbsp;</td>
        </tr>
        <tr>
          <td colspan="3" align="center" style="padding:26px 28px 8px;">
            <p style="margin:0 0 4px;font-family:${FONT_MONO};font-size:10px;
                      font-weight:700;color:#8800ff;letter-spacing:5px;
                      text-transform:uppercase;">
              ◆ NEXUS STUDIO ◆
            </p>
            <p style="margin:0;font-family:${FONT_MONO};font-size:28px;
                      font-weight:900;letter-spacing:5px;color:#00e5ff;">
              NEXUS AI
            </p>
          </td>
        </tr>
        <tr>
          <td colspan="3" align="center" style="padding:0 28px 24px;">
            <table cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td style="background-color:#002a18;color:#00ffaa;
                           border:1px solid #005a30;border-radius:20px;
                           padding:5px 18px;font-family:${FONT_SANS};
                           font-size:10px;font-weight:700;
                           letter-spacing:2px;text-transform:uppercase;">
                  💳 NEW PAYMENT RECEIVED
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- BODY -->
    <tr><td style="background-color:#07081e;border-left:1px solid #1a2a4a;
                   border-right:1px solid #1a2a4a;padding:24px 24px 8px;">

      <!-- USER CARD -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="background-color:#0c0e26;border:1px solid #1a2a50;
                    border-radius:12px;margin-bottom:18px;">
        <tr>
          <td align="center" style="padding:22px 20px 20px;">
            ${avatarBlock}
            <p style="margin:0 0 3px;font-family:${FONT_SANS};font-size:17px;
                      font-weight:700;color:#ffffff;letter-spacing:1px;">
              @${displayName}
            </p>
            <p style="margin:0;font-family:${FONT_MONO};font-size:10px;
                      color:#3a5a7a;letter-spacing:1px;">
              Roblox UID:&nbsp;
              <span style="color:#5a7aaa;">${displayUid}</span>
            </p>
          </td>
        </tr>
      </table>

      <!-- PAYMENT DETAILS -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="margin-bottom:18px;background-color:#060d1e;
                    border:1px solid #0a3a1a;border-radius:10px;overflow:hidden;">
        <tr>
          <td colspan="2" height="3"
              style="background-color:#00ffaa;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:14px 20px 8px;">
            <p style="margin:0;font-family:${FONT_MONO};font-size:10px;
                      font-weight:700;color:#00ffaa;letter-spacing:3px;
                      text-transform:uppercase;">
              💳 PAYMENT DETAILS
            </p>
          </td>
        </tr>

        <!-- Package -->
        <tr>
          <td style="padding:10px 20px;font-family:${FONT_MONO};font-size:10px;
                     color:#3a5a7a;width:120px;border-bottom:1px solid #0a1e2a;">
            PACKAGE
          </td>
          <td style="padding:10px 20px 10px 0;font-family:${FONT_SANS};
                     font-size:13px;color:#ffffff;font-weight:700;
                     border-bottom:1px solid #0a1e2a;">
            ${esc(pkg.label, 70)}
          </td>
        </tr>

        <!-- Credits -->
        <tr>
          <td style="padding:10px 20px;font-family:${FONT_MONO};font-size:10px;
                     color:#3a5a7a;border-bottom:1px solid #0a1e2a;">
            CREDITS
          </td>
          <td style="padding:10px 20px 10px 0;font-family:${FONT_MONO};
                     font-size:20px;color:#ffd600;font-weight:700;
                     border-bottom:1px solid #0a1e2a;">
            ${pkg.cr} CR
          </td>
        </tr>

        <!-- Method -->
        <tr>
          <td style="padding:10px 20px;font-family:${FONT_MONO};font-size:10px;
                     color:#3a5a7a;border-bottom:1px solid #0a1e2a;">
            METHOD
          </td>
          <td style="padding:10px 20px 10px 0;font-family:${FONT_SANS};
                     font-size:12px;color:#00e5ff;font-weight:700;
                     text-transform:uppercase;letter-spacing:1px;
                     border-bottom:1px solid #0a1e2a;">
            ${esc(method.toUpperCase(), 20)}
          </td>
        </tr>

        <!-- Total -->
        <tr>
          <td style="padding:14px 20px;font-family:${FONT_SANS};font-size:12px;
                     color:#ffffff;font-weight:700;letter-spacing:1px;">
            TOTAL PAID
          </td>
          <td style="padding:14px 20px 14px 0;font-family:${FONT_MONO};
                     font-size:22px;color:#00ffaa;font-weight:700;">
            ${esc(paymentFmt, 30)}
          </td>
        </tr>

        <!-- Action required -->
        <tr>
          <td colspan="2" style="padding:0 16px 16px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%"
                   style="background-color:#1a1200;border:1px solid #3a2a00;
                          border-radius:8px;">
              <tr>
                <td style="padding:14px 16px;">
                  <p style="margin:0 0 8px;font-family:${FONT_SANS};font-size:10px;
                            font-weight:700;color:#ffd600;letter-spacing:2px;
                            text-transform:uppercase;">
                    ⚡ ACTION REQUIRED
                  </p>
                  <p style="margin:0;font-family:${FONT_SANS};font-size:12px;
                            color:#b8cce8;line-height:1.7;">
                    Add
                    <strong style="color:#ffd600;font-size:15px;">${pkg.cr} CR</strong>
                    to account
                    <strong style="color:#ffffff;">@${displayName}</strong>
                    <span style="color:#3a5a7a;">(UID: ${displayUid})</span>
                    after verifying the transfer.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${note ? `
      <!-- TRANSFER NOTE -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="margin-bottom:18px;background-color:#06080f;
                    border:1px solid #0e1e3a;border-radius:10px;overflow:hidden;">
        <tr>
          <td width="4" style="background-color:#8800ff;font-size:0;">&nbsp;</td>
          <td style="padding:14px 16px;">
            <p style="margin:0 0 8px;font-family:${FONT_MONO};font-size:9px;
                      font-weight:700;color:#8800ff;letter-spacing:3px;
                      text-transform:uppercase;">
              📋 TRANSFER NOTE
            </p>
            <p style="margin:0;font-family:${FONT_SANS};font-size:12px;
                      color:#b0c8e8;line-height:1.7;">
              ${esc(note, 300)}
            </p>
          </td>
        </tr>
      </table>` : ''}

      <!-- TRANSACTION META -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="margin-bottom:24px;background-color:#04050f;
                    border:1px solid #0a0f20;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:14px 18px;border-bottom:1px solid #0a0f1e;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td>
                  <p style="margin:0 0 3px;font-family:${FONT_MONO};font-size:9px;
                            color:#1e3050;letter-spacing:1px;text-transform:uppercase;">
                    Transaction ID
                  </p>
                  <p style="margin:0;font-family:${FONT_MONO};font-size:11px;
                            color:#4a6a9a;word-break:break-all;">
                    ${esc(transactionId, 60)}
                  </p>
                </td>
                <td align="right" style="white-space:nowrap;padding-left:16px;">
                  <p style="margin:0 0 3px;font-family:${FONT_MONO};font-size:9px;
                            color:#1e3050;letter-spacing:1px;text-transform:uppercase;">
                    Submitted
                  </p>
                  <p style="margin:0;font-family:${FONT_MONO};font-size:11px;
                            color:#4a6a9a;">
                    ${formattedAt}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 18px;">
            <p style="margin:0 0 3px;font-family:${FONT_MONO};font-size:9px;
                      color:#1e3050;letter-spacing:1px;text-transform:uppercase;">
              Payment Status
            </p>
            <p style="margin:0;font-family:${FONT_SANS};font-size:12px;
                      font-weight:700;color:#ffd600;letter-spacing:1px;
                      text-transform:uppercase;">
              ⏳ AWAITING CONFIRMATION
            </p>
          </td>
        </tr>
      </table>

    </td></tr>

    <!-- FOOTER -->
    <tr><td style="background-color:#03040e;border:1px solid #0f1830;
                   border-top:none;border-radius:0 0 14px 14px;padding:20px 24px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="margin-bottom:14px;">
        <tr>
          <td height="1" style="background-color:#8800ff;font-size:0;width:33%;">&nbsp;</td>
          <td height="1" style="background-color:#00e5ff;font-size:0;width:34%;">&nbsp;</td>
          <td height="1" style="background-color:#00ffaa;font-size:0;width:33%;">&nbsp;</td>
        </tr>
      </table>
      <p style="margin:0 0 4px;text-align:center;font-family:${FONT_MONO};font-size:9px;
                color:#1e2a4a;letter-spacing:3px;text-transform:uppercase;">
        NEXUS AI &nbsp;&middot;&nbsp; NEXUS STUDIO
      </p>
      <p style="margin:0;text-align:center;font-family:${FONT_SANS};font-size:10px;
                color:#141e30;">
        Automated notification — do not reply to this email.
      </p>
    </td></tr>

  </table>
</td></tr>
</table>

</body>
</html>`;
}

// ─── EMAIL SENDER ─────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[payment] RESEND_API_KEY not configured — email skipped.');
    return { ok: false, reason: 'no_resend_key' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${key}`,
      },
      body: JSON.stringify({
        from:    'NEXUS AI <onboarding@resend.dev>',
        to:      Array.isArray(to) ? to : [to],
        subject: String(subject).substring(0, 200),
        html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) console.error('[payment] Resend error:', r.status, data);
    return { ok: r.ok, status: r.status, data };
  } catch (err) {
    console.error('[payment] sendEmail exception:', err.message);
    return { ok: false, error: err.message };
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS & security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip          = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const ADMIN_EMAIL = process.env.REPORT_EMAIL || 'arifiinytid@gmail.com';
  const ovo         = process.env.OVO_NUMBER          || '';
  const dana        = process.env.DANA_NUMBER         || '';
  const owner       = process.env.PAYMENT_OWNER_NAME  || 'NEXUS STUDIO';

  // ═══════════════════════════════════════════════════════════════════
  // GET
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    if (!checkRateLimit(`pay_get:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please slow down.' });
    }

    // ── Public: check transaction status by ID ──────────────────────
    if (req.query.id) {
      const txId    = sanStr(req.query.id, 60);
      const all     = loadPayments();
      const tx      = all.find(p => p.id === txId);
      if (!tx) return res.status(404).json({ error: 'Transaction not found.' });

      // Return only safe, non-sensitive fields to the public
      return res.status(200).json({
        id:          tx.id,
        status:      tx.status,
        package:     tx.package,
        credits:     tx.credits,
        method:      tx.method,
        total:       tx.total,
        createdAt:   tx.createdAt,
        confirmedAt: tx.confirmedAt || null,
      });
    }

    // ── Admin: list all payments with filtering & pagination ────────
    if (req.query.admin === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({
          error: 'Unauthorized. Admin token required via Authorization header.',
        });
      }

      let payments = loadPayments();

      // Optional filters
      if (req.query.status)   payments = payments.filter(p => p.status   === req.query.status);
      if (req.query.method)   payments = payments.filter(p => p.method   === req.query.method);
      if (req.query.username) {
        const q = sanStr(req.query.username, 50).toLowerCase();
        payments  = payments.filter(p =>
          (p.username || '').toLowerCase().includes(q),
        );
      }

      // Pagination
      const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
      const start = (page - 1) * limit;

      return res.status(200).json({
        payments: payments.slice(start, start + limit),
        total:    payments.length,
        page,
        limit,
        pages:    Math.ceil(payments.length / limit) || 1,
      });
    }

    // ── Public: payment configuration ──────────────────────────────
    if (!ovo && !dana) {
      return res.status(503).json({
        error:   'Payment methods not configured.',
        message: 'Admin must set OVO_NUMBER and DANA_NUMBER in environment variables.',
      });
    }

    return res.status(200).json({
      ovo: {
        available: !!ovo,
        number:    ovo,
        masked:    maskNumber(ovo),
        name:      owner,
      },
      dana: {
        available: !!dana,
        number:    dana,
        masked:    maskNumber(dana),
        name:      owner,
      },
      owner,
      packages: PACKAGES,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // POST — Create a new payment transaction
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    if (!checkRateLimit(`pay_post:${ip}`, 5)) {
      return res.status(429).json({
        error: 'Too many payment requests. Please wait 1 minute and try again.',
      });
    }

    const body = req.body || {};
    const { username, userId, packId, method, amount, note } = body;

    // Required fields
    if (!username || !packId || !method || !amount) {
      return res.status(400).json({
        error: 'Required fields: username, packId, method, amount.',
      });
    }

    // Validate username (Roblox usernames: 3–20 alphanumeric + underscore)
    const cleanUsername = sanStr(String(username), 50).trim();
    if (!cleanUsername || !/^[a-zA-Z0-9_]{3,50}$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Invalid username format.' });
    }

    // Validate package
    const pkg = PACKAGES.find(p => p.id === sanStr(String(packId), 20));
    if (!pkg) {
      return res.status(400).json({
        error: 'Invalid package ID.',
        validIds: PACKAGES.map(p => p.id),
      });
    }

    // Validate payment method
    const cleanMethod = sanStr(String(method), 10).toLowerCase();
    if (!['ovo', 'dana', 'transfer'].includes(cleanMethod)) {
      return res.status(400).json({
        error: 'Invalid payment method. Accepted: ovo, dana, transfer.',
      });
    }

    // Validate amount (positive integer, max 100M IDR)
    const cleanAmount = parseInt(String(amount).replace(/\D/g, ''), 10);
    if (isNaN(cleanAmount) || cleanAmount <= 0 || cleanAmount > 100_000_000) {
      return res.status(400).json({ error: 'Invalid transfer amount.' });
    }

    // Validate userId (numeric Roblox ID)
    const rawUserId   = sanStr(String(userId || '0'), 30).trim();
    const cleanUserId = /^\d{1,20}$/.test(rawUserId) ? rawUserId : '0';

    // Resolve avatar from Roblox API
    let avatarUrl = '';
    try {
      avatarUrl = await resolveAvatar('', cleanUserId);
    } catch (_) {
      avatarUrl = '';
    }

    const cleanNote = sanStr(String(note || ''), 300);
    const txId      = generateTransactionId();
    const now       = new Date().toISOString();

    const newTx = {
      id:                txId,
      username:          cleanUsername,
      userId:            cleanUserId,
      avatar:            avatarUrl,
      package:           pkg.id,
      credits:           pkg.cr,
      method:            cleanMethod,
      total:             pkg.idr,
      amountTransferred: cleanAmount,
      note:              cleanNote,
      status:            'pending',
      createdAt:         now,
      confirmedAt:       null,
      adminNote:         null,
    };

    const payments = loadPayments();
    payments.unshift(newTx);
    savePayments(payments);

    // Fire-and-forget email notification to admin
    const html = buildPaymentEmail({
      username:      cleanUsername,
      userId:        cleanUserId,
      avatarUrl,
      pkg,
      method:        cleanMethod,
      transactionId: txId,
      note:          cleanNote,
      createdAt:     now,
    });

    sendEmail({
      to:      ADMIN_EMAIL,
      subject: `[NEXUS] 💳 New Payment — @${cleanUsername} · ${pkg.cr} CR (${pkg.id})`,
      html,
    }).then(r => {
      if (!r.ok) console.warn('[payment] Email delivery failed:', r.reason || r.error);
    }).catch(e => console.error('[payment] Email exception:', e.message));

    // Return instructions to user
    const paymentNumber = cleanMethod === 'ovo' ? ovo : dana;
    return res.status(201).json({
      success: true,
      transaction: {
        id:     txId,
        code:   txId,
        status: 'pending',
        instructions: {
          method:       cleanMethod,
          number:       paymentNumber,
          maskedNumber: maskNumber(paymentNumber),
          name:         owner,
          amount:       fmtIDR(pkg.idr),
          reference:    cleanNote || `NEXUS-${cleanUsername}-${pkg.cr}CR`,
          message:      `Transfer ${fmtIDR(pkg.idr)} via ${cleanMethod.toUpperCase()} to ${maskNumber(paymentNumber)} (${owner}).`,
        },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // PATCH — Admin: confirm or reject a payment
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'PATCH') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({
        error: 'Unauthorized. Admin token required via Authorization header.',
      });
    }
    if (!checkRateLimit(`pay_patch:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }

    const body = req.body || {};
    const { id, action, adminNote } = body;

    if (!id)     return res.status(400).json({ error: '`id` is required.' });
    if (!action) return res.status(400).json({ error: '`action` is required: confirm or reject.' });
    if (!['confirm', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use "confirm" or "reject".' });
    }

    const txId     = sanStr(String(id),         60);
    const safeNote = sanStr(String(adminNote || ''), 500);

    const payments = loadPayments();
    const idx      = payments.findIndex(p => p.id === txId);

    if (idx === -1) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const tx = payments[idx];

    if (tx.status !== 'pending') {
      return res.status(409).json({
        error:         `Transaction already processed (status: ${tx.status}).`,
        currentStatus: tx.status,
      });
    }

    // ── CONFIRM ─────────────────────────────────────────────────────
    if (action === 'confirm') {
      try {
        const host    = req.headers.host || 'nexusai-roblox.vercel.app';
        const syncUrl = `https://${host}/api/sync`;
        const syncRes = await fetch(syncUrl, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:
              req.headers['authorization'] ||
              `Bearer ${process.env.ADMIN_TOKEN || ''}`,
          },
          body: JSON.stringify({
            action:        'give-credits',
            target:        tx.username,
            amount:        tx.credits,
            transactionId: tx.id,
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!syncRes.ok) {
          const errData = await syncRes.json().catch(() => ({}));
          console.error('[payment] Credit sync failed:', errData);
          return res.status(502).json({
            error:     'Credit sync failed. Retry or add credits manually.',
            syncError: errData,
          });
        }
      } catch (err) {
        console.error('[payment] Sync request error:', err.message);
        return res.status(502).json({
          error: 'Could not reach sync server. Please try again.',
        });
      }

      payments[idx] = {
        ...tx,
        status:      'confirmed',
        adminNote:   safeNote,
        confirmedAt: new Date().toISOString(),
      };
      savePayments(payments);

      return res.status(200).json({
        success: true,
        message: `Payment confirmed. ${tx.credits} CR added to @${tx.username}.`,
        transaction: payments[idx],
      });
    }

    // ── REJECT ──────────────────────────────────────────────────────
    if (action === 'reject') {
      payments[idx] = {
        ...tx,
        status:      'rejected',
        adminNote:   safeNote,
        confirmedAt: new Date().toISOString(),
      };
      savePayments(payments);

      return res.status(200).json({
        success: true,
        message: `Payment rejected for @${tx.username}.`,
        transaction: payments[idx],
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // DELETE — Admin: permanently remove a transaction record
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'DELETE') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({
        error: 'Unauthorized. Admin token required via Authorization header.',
      });
    }
    if (!checkRateLimit(`pay_del:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }

    const { id } = req.body || req.query || {};
    if (!id) return res.status(400).json({ error: '`id` is required.' });

    const txId     = sanStr(String(id), 60);
    const payments = loadPayments();
    const filtered = payments.filter(p => p.id !== txId);

    if (filtered.length === payments.length) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    savePayments(filtered);
    return res.status(200).json({
      success: true,
      message: `Transaction ${txId} deleted successfully.`,
    });
  }

  return res.status(405).json({ error: `Method ${req.method} is not allowed.` });
}