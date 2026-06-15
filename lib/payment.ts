// lib/payment.ts — NEXUS AI Payment System (SECURE v6 — TypeScript)
//
// Changes v6 (JS → TS):
//   • Full TypeScript strict types — no implicit 'any'
//   • Package, PaymentRecord, PostBody, PatchBody, SendEmailParams interfaces
//   • RobloxThumbnailResponse interface untuk avatar helper
//   • verifyAdminToken diganti ke _security.ts (konsisten dengan modul lain)
//   • Rate limiter lokal dihapus — pakai checkRateLimit dari _security.ts
//   • setInterval cleanup tidak dibutuhkan lagi (pakai opportunistic prune _security)
//   • buildPaymentEmail parameter destructuring dianotasi dengan interface
//   • sendEmail return type ExplicitEmailResult interface
//   • Semua catch (err) → err: unknown dengan narrowing
//   • Tidak ada perubahan behaviour / endpoint / response shape
// Email HTML v2: Gmail-compatible (no border-radius on td, no overflow:hidden,
//   no linear-gradient, table-based layout only)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import crypto from 'crypto';
import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route.js';
import { verifyAdminToken, sanitizeStr, checkRateLimit } from './_security';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Package {
  id:      string;
  cr:      number;
  idr:     number;
  usd:     number;
  label:   string;
  popular: boolean;
}

interface PaymentRecord {
  id:                string;
  username:          string;
  userId:            string;
  avatar:            string;
  package:           string;
  credits:           number;
  method:            string;
  total:             number;
  amountTransferred: number;
  note:              string;
  status:            'pending' | 'confirmed' | 'rejected';
  createdAt:         string;
  confirmedAt:       string | null;
  adminNote:         string | null;
}

interface PostBody {
  username?: unknown;
  userId?:   unknown;
  packId?:   unknown;
  method?:   unknown;
  amount?:   unknown;
  note?:     unknown;
  [key: string]: unknown;
}

interface PatchBody {
  id?:        unknown;
  action?:    unknown;
  adminNote?: unknown;
  [key: string]: unknown;
}

interface DeleteBody {
  id?: unknown;
  [key: string]: unknown;
}

interface BuildEmailParams {
  username:      string;
  userId:        string;
  avatarUrl:     string;
  pkg:           Package;
  method:        string;
  transactionId: string;
  note:          string;
  createdAt:     string;
}

interface EmailResult {
  ok:      boolean;
  status?: number;
  data?:   unknown;
  reason?: string;
  error?:  string;
}

interface RobloxThumbnailItem {
  imageUrl?: string;
  [key: string]: unknown;
}

interface RobloxThumbnailResponse {
  data?: RobloxThumbnailItem[];
  [key: string]: unknown;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PAYMENTS_FILE = '/tmp/nexus_payments.json' as const;
const MAX_PAYMENTS  = 500;

const FONT_MONO = "'Courier New', Courier, monospace" as const;
const FONT_SANS = 'Arial, Helvetica, sans-serif'     as const;

const SAFE_AVATAR_DOMAINS: readonly string[] = [
  'https://tr.rbxcdn.com/',
  'https://t0.rbxcdn.com/',
  'https://t1.rbxcdn.com/',
  'https://t2.rbxcdn.com/',
  'https://t3.rbxcdn.com/',
  'https://t4.rbxcdn.com/',
  'https://thumbnails.roblox.com/',
  'https://www.roblox.com/',
] as const;

// ─── PACKAGES ─────────────────────────────────────────────────────────────────

const PACKAGES: readonly Package[] = [
  { id: 'starter',  cr: 50,  idr: 38_000,    usd: 2.38,  label: '50 CR — Starter',              popular: false },
  { id: 'popular',  cr: 80,  idr: 50_000,    usd: 3.13,  label: '80 CR — Popular',              popular: true  },
  { id: 'pro',      cr: 150, idr: 120_000,   usd: 7.50,  label: '150 CR — Pro',                 popular: false },
  { id: 'mega',     cr: 500, idr: 1_500_000, usd: 93.75, label: '500 CR — Mega',                popular: false },
  { id: 'pro-plan', cr: 200, idr: 150_000,   usd: 9.38,  label: 'Pro Plan (Monthly) · 200 CR', popular: false },
] as const;

// ─── STORAGE ──────────────────────────────────────────────────────────────────

function loadPayments(): PaymentRecord[] {
  try {
    if (existsSync(PAYMENTS_FILE)) {
      const raw    = readFileSync(PAYMENTS_FILE, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as PaymentRecord[];
    }
  } catch { /* return empty */ }
  return [];
}

function savePayments(payments: PaymentRecord[]): boolean {
  try {
    writeFileSync(
      PAYMENTS_FILE,
      JSON.stringify(payments.slice(0, MAX_PAYMENTS), null, 2),
      'utf8',
    );
    return true;
  } catch (err: unknown) {
    console.error('[payment] savePayments failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ─── SANITIZERS ──────────────────────────────────────────────────────────────

/** Escape HTML special chars for safe use in email templates. */
function esc(str: unknown, max: number = 100): string {
  return String(str ?? '')
    .substring(0, max)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function formatTime(iso: string): string {
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
  } catch { return String(iso || '-'); }
}

/** Format IDR amount. */
function fmtIDR(amount: number): string {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

/** Mask a payment number for public display (e.g. 0812****5678). */
function maskNumber(num: string | number): string {
  const s = String(num ?? '');
  if (s.length < 8) return '****';
  return s.substring(0, 4) + '****' + s.substring(s.length - 4);
}

/** Cryptographically random transaction ID. */
function generateTransactionId(): string {
  const rand = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `NPAY-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

// ─── AVATAR HELPER ────────────────────────────────────────────────────────────

async function resolveAvatar(rawAvatar: string, userId: string): Promise<string> {
  if (rawAvatar && SAFE_AVATAR_DOMAINS.some(d => rawAvatar.startsWith(d))) {
    return rawAvatar.substring(0, 400);
  }
  const uid = String(userId ?? '').trim();
  if (!uid || !/^\d{1,20}$/.test(uid) || uid === '0') return '';
  try {
    const apiUrl =
      `https://thumbnails.roblox.com/v1/users/avatar-headshot` +
      `?userIds=${uid}&size=150x150&format=Png&isCircular=false`;
    const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(5_000) });
    if (!resp.ok) return '';
    const json     = await resp.json().catch(() => null) as RobloxThumbnailResponse | null;
    const imageUrl = json?.data?.[0]?.imageUrl ?? '';
    if (imageUrl && SAFE_AVATAR_DOMAINS.some(d => imageUrl.startsWith(d))) {
      return imageUrl.substring(0, 400);
    }
  } catch (err: unknown) {
    console.warn('[payment] Avatar fetch failed for uid', uid, '—',
      err instanceof Error ? err.message : err);
  }
  return '';
}

// ─── EMAIL BUILDER ────────────────────────────────────────────────────────────

/**
 * Gmail-compatible avatar block.
 * - No border-radius on <td> (Gmail strips it) — use a wrapping <img> with style
 * - No linear-gradient backgrounds on <td>
 * - Fallback initial block uses a flat solid color
 */
function buildAvatarBlock(avatarUrl: string, displayName: string, size: number = 70): string {
  const initial  = (displayName || '?').charAt(0).toUpperCase();
  const fontSize = Math.round(size * 0.38);

  if (avatarUrl) {
    return `
      <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px;">
        <tr>
          <td align="center" valign="middle" width="${size}" height="${size}"
              style="width:${size}px;height:${size}px;padding:3px;background-color:#5500cc;">
            <img src="${avatarUrl}" width="${size}" height="${size}"
                 alt="@${displayName}"
                 style="display:block;width:${size}px;height:${size}px;border:0;" />
          </td>
        </tr>
      </table>`;
  }

  return `
    <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px;">
      <tr>
        <td align="center" valign="middle" width="${size}" height="${size}"
            style="width:${size}px;height:${size}px;background-color:#0a1040;
                   border:3px solid #00e5ff;
                   font-size:${fontSize}px;font-weight:700;color:#ffffff;
                   font-family:${FONT_SANS};text-align:center;">
          ${initial}
        </td>
      </tr>
    </table>`;
}

function buildPaymentEmail({
  username, userId, avatarUrl,
  pkg, method, transactionId, note, createdAt,
}: BuildEmailParams): string {
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

<!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background-color:#030312;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px;">

      <table cellpadding="0" cellspacing="0" border="0" width="580"
             style="max-width:580px;width:100%;">

        <!-- ══ HEADER TOP COLOR BAR ══ -->
        <tr>
          <td width="194" height="4" bgcolor="#8800ff" style="font-size:0;line-height:0;">&nbsp;</td>
          <td width="193" height="4" bgcolor="#00e5ff" style="font-size:0;line-height:0;">&nbsp;</td>
          <td width="193" height="4" bgcolor="#00ffaa" style="font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- ══ HEADER ══ -->
        <tr>
          <td colspan="3" bgcolor="#0b0c24"
              style="padding:26px 28px 8px;border-left:1px solid #1a2a4a;
                     border-right:1px solid #1a2a4a;text-align:center;">
            <p style="margin:0 0 4px;font-family:${FONT_MONO};font-size:10px;
                      font-weight:700;color:#8800ff;letter-spacing:5px;
                      text-transform:uppercase;">&#9670; NEXUS STUDIO &#9670;</p>
            <p style="margin:0;font-family:${FONT_MONO};font-size:28px;
                      font-weight:900;letter-spacing:5px;color:#00e5ff;">NEXUS AI</p>
          </td>
        </tr>
        <tr>
          <td colspan="3" bgcolor="#0b0c24"
              style="padding:0 28px 24px;border-left:1px solid #1a2a4a;
                     border-right:1px solid #1a2a4a;text-align:center;">
            <table cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td bgcolor="#002a18"
                    style="color:#00ffaa;border:1px solid #005a30;
                           padding:5px 18px;font-family:${FONT_SANS};
                           font-size:10px;font-weight:700;letter-spacing:2px;
                           text-transform:uppercase;">
                  &#128179; NEW PAYMENT RECEIVED
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ BODY ══ -->
        <tr>
          <td colspan="3" bgcolor="#07081e"
              style="padding:24px 24px 8px;border-left:1px solid #1a2a4a;
                     border-right:1px solid #1a2a4a;">

            <!-- USER CARD -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%"
                   style="margin-bottom:18px;">
              <!-- top border line -->
              <tr>
                <td bgcolor="#00e5ff" height="2" style="font-size:0;line-height:0;">&nbsp;</td>
              </tr>
              <tr>
                <td bgcolor="#0c0e26"
                    style="padding:22px 20px 20px;border-left:1px solid #1a2a50;
                           border-right:1px solid #1a2a50;text-align:center;">
                  ${avatarBlock}
                  <p style="margin:0 0 3px;font-family:${FONT_SANS};font-size:17px;
                            font-weight:700;color:#ffffff;letter-spacing:1px;">
                    @${displayName}
                  </p>
                  <p style="margin:0;font-family:${FONT_MONO};font-size:10px;
                            color:#3a5a7a;letter-spacing:1px;">
                    Roblox UID:&nbsp;<span style="color:#5a7aaa;">${displayUid}</span>
                  </p>
                </td>
              </tr>
              <tr>
                <td bgcolor="#1a2a50" height="1" style="font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>

            <!-- PAYMENT DETAILS TABLE -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%"
                   style="margin-bottom:18px;">
              <!-- top accent bar -->
              <tr>
                <td colspan="2" bgcolor="#00ffaa" height="3"
                    style="font-size:0;line-height:0;">&nbsp;</td>
              </tr>
              <!-- section title -->
              <tr>
                <td colspan="2" bgcolor="#060d1e"
                    style="padding:14px 20px 8px;border-left:1px solid #0a3a1a;
                           border-right:1px solid #0a3a1a;">
                  <p style="margin:0;font-family:${FONT_MONO};font-size:10px;font-weight:700;
                            color:#00ffaa;letter-spacing:3px;text-transform:uppercase;">
                    &#128179; PAYMENT DETAILS
                  </p>
                </td>
              </tr>
              <!-- row: package -->
              <tr>
                <td bgcolor="#060d1e" width="120"
                    style="padding:10px 20px;font-family:${FONT_MONO};font-size:10px;
                           color:#3a5a7a;border-left:1px solid #0a3a1a;
                           border-bottom:1px solid #0a1e2a;">
                  PACKAGE
                </td>
                <td bgcolor="#060d1e"
                    style="padding:10px 20px 10px 0;font-family:${FONT_SANS};font-size:13px;
                           color:#ffffff;font-weight:700;border-right:1px solid #0a3a1a;
                           border-bottom:1px solid #0a1e2a;">
                  ${esc(pkg.label, 70)}
                </td>
              </tr>
              <!-- row: credits -->
              <tr>
                <td bgcolor="#060d1e"
                    style="padding:10px 20px;font-family:${FONT_MONO};font-size:10px;
                           color:#3a5a7a;border-left:1px solid #0a3a1a;
                           border-bottom:1px solid #0a1e2a;">
                  CREDITS
                </td>
                <td bgcolor="#060d1e"
                    style="padding:10px 20px 10px 0;font-family:${FONT_MONO};font-size:20px;
                           color:#ffd600;font-weight:700;border-right:1px solid #0a3a1a;
                           border-bottom:1px solid #0a1e2a;">
                  ${pkg.cr} CR
                </td>
              </tr>
              <!-- row: method -->
              <tr>
                <td bgcolor="#060d1e"
                    style="padding:10px 20px;font-family:${FONT_MONO};font-size:10px;
                           color:#3a5a7a;border-left:1px solid #0a3a1a;
                           border-bottom:1px solid #0a1e2a;">
                  METHOD
                </td>
                <td bgcolor="#060d1e"
                    style="padding:10px 20px 10px 0;font-family:${FONT_SANS};font-size:12px;
                           color:#00e5ff;font-weight:700;text-transform:uppercase;
                           letter-spacing:1px;border-right:1px solid #0a3a1a;
                           border-bottom:1px solid #0a1e2a;">
                  ${esc(method.toUpperCase(), 20)}
                </td>
              </tr>
              <!-- row: total -->
              <tr>
                <td bgcolor="#060d1e"
                    style="padding:14px 20px;font-family:${FONT_SANS};font-size:12px;
                           color:#ffffff;font-weight:700;letter-spacing:1px;
                           border-left:1px solid #0a3a1a;border-bottom:1px solid #0a3a1a;">
                  TOTAL PAID
                </td>
                <td bgcolor="#060d1e"
                    style="padding:14px 20px 14px 0;font-family:${FONT_MONO};font-size:22px;
                           color:#00ffaa;font-weight:700;border-right:1px solid #0a3a1a;
                           border-bottom:1px solid #0a3a1a;">
                  ${esc(paymentFmt, 30)}
                </td>
              </tr>
              <!-- ACTION REQUIRED box -->
              <tr>
                <td colspan="2" bgcolor="#060d1e"
                    style="padding:12px 16px 16px;border-left:1px solid #0a3a1a;
                           border-right:1px solid #0a3a1a;border-bottom:1px solid #0a3a1a;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td bgcolor="#1a1200"
                          style="padding:14px 16px;border:1px solid #3a2a00;">
                        <p style="margin:0 0 8px;font-family:${FONT_SANS};font-size:10px;
                                  font-weight:700;color:#ffd600;letter-spacing:2px;
                                  text-transform:uppercase;">
                          &#9889; ACTION REQUIRED
                        </p>
                        <p style="margin:0;font-family:${FONT_SANS};font-size:12px;
                                  color:#b8cce8;line-height:1.7;">
                          Add <strong style="color:#ffd600;font-size:15px;">${pkg.cr} CR</strong>
                          to account <strong style="color:#ffffff;">@${displayName}</strong>
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
                   style="margin-bottom:18px;">
              <tr>
                <td width="4" bgcolor="#8800ff" style="font-size:0;">&nbsp;</td>
                <td bgcolor="#06080f"
                    style="padding:14px 16px;border-top:1px solid #0e1e3a;
                           border-right:1px solid #0e1e3a;border-bottom:1px solid #0e1e3a;">
                  <p style="margin:0 0 8px;font-family:${FONT_MONO};font-size:9px;
                            font-weight:700;color:#8800ff;letter-spacing:3px;
                            text-transform:uppercase;">
                    &#128203; TRANSFER NOTE
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
                   style="margin-bottom:24px;">
              <tr>
                <td colspan="2" bgcolor="#04050f"
                    style="padding:14px 18px;border:1px solid #0a0f20;
                           border-bottom:1px solid #0a0f1e;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="vertical-align:top;">
                        <p style="margin:0 0 3px;font-family:${FONT_MONO};font-size:9px;
                                  color:#1e3050;letter-spacing:1px;text-transform:uppercase;">
                          Transaction ID
                        </p>
                        <p style="margin:0;font-family:${FONT_MONO};font-size:11px;
                                  color:#4a6a9a;word-break:break-all;">
                          ${esc(transactionId, 60)}
                        </p>
                      </td>
                      <td align="right" style="white-space:nowrap;padding-left:16px;vertical-align:top;">
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
                <td colspan="2" bgcolor="#04050f"
                    style="padding:12px 18px;border-left:1px solid #0a0f20;
                           border-right:1px solid #0a0f20;border-bottom:1px solid #0a0f20;">
                  <p style="margin:0 0 3px;font-family:${FONT_MONO};font-size:9px;
                            color:#1e3050;letter-spacing:1px;text-transform:uppercase;">
                    Payment Status
                  </p>
                  <p style="margin:0;font-family:${FONT_SANS};font-size:12px;font-weight:700;
                            color:#ffd600;letter-spacing:1px;text-transform:uppercase;">
                    &#9203; AWAITING CONFIRMATION
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- ══ FOOTER ══ -->
        <tr>
          <td colspan="3" bgcolor="#03040e"
              style="padding:0;border-left:1px solid #0f1830;
                     border-right:1px solid #0f1830;border-bottom:1px solid #0f1830;">
            <!-- divider bar -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="194" height="1" bgcolor="#8800ff" style="font-size:0;">&nbsp;</td>
                <td width="193" height="1" bgcolor="#00e5ff" style="font-size:0;">&nbsp;</td>
                <td width="193" height="1" bgcolor="#00ffaa" style="font-size:0;">&nbsp;</td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="padding:18px 24px;text-align:center;">
                  <p style="margin:0 0 4px;font-family:${FONT_MONO};font-size:9px;
                            color:#1e2a4a;letter-spacing:3px;text-transform:uppercase;">
                    NEXUS AI &nbsp;&middot;&nbsp; NEXUS STUDIO
                  </p>
                  <p style="margin:0;font-family:${FONT_SANS};font-size:10px;color:#141e30;">
                    Automated notification — do not reply to this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->

</body>
</html>`;
}

// ─── EMAIL SENDER ─────────────────────────────────────────────────────────────

interface SendEmailParams {
  to:      string | string[];
  subject: string;
  html:    string;
}

async function sendEmail({ to, subject, html }: SendEmailParams): Promise<EmailResult> {
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
    const data: unknown = await r.json().catch(() => ({}));
    if (!r.ok) console.error('[payment] Resend error:', r.status, data);
    return { ok: r.ok, status: r.status, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[payment] sendEmail exception:', msg);
    return { ok: false, error: msg };
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

const handler: HandlerFn = async (req: AdaptedRequest, res: AdaptedResponse) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options',        'DENY');
  res.setHeader('Referrer-Policy',        'no-referrer');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const ip:          string = (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';
  const ADMIN_EMAIL: string = process.env.REPORT_EMAIL   ?? 'arifiinytid@gmail.com';
  const ovo:         string = process.env.OVO_NUMBER         ?? '';
  const dana:        string = process.env.DANA_NUMBER        ?? '';
  const owner:       string = process.env.PAYMENT_OWNER_NAME ?? 'NEXUS STUDIO';

  // ═══════════════════════════════════════════════════════════════════
  // GET
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    if (!checkRateLimit(`pay_get:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please slow down.' });
    }

    // Public: check transaction status by ID
    if (req.query['id']) {
      const txId = sanitizeStr(String(req.query['id']), 60);
      const all  = loadPayments();
      const tx   = all.find(p => p.id === txId);
      if (!tx) return res.status(404).json({ error: 'Transaction not found.' });

      return res.status(200).json({
        id:          tx.id,
        status:      tx.status,
        package:     tx.package,
        credits:     tx.credits,
        method:      tx.method,
        total:       tx.total,
        createdAt:   tx.createdAt,
        confirmedAt: tx.confirmedAt ?? null,
      });
    }

    // Admin: list all payments with filtering & pagination
    if (req.query['admin'] === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({
          error: 'Unauthorized. Admin token required via Authorization header.',
        });
      }

      let payments = loadPayments();

      if (req.query['status'])   payments = payments.filter(p => p.status  === req.query['status']);
      if (req.query['method'])   payments = payments.filter(p => p.method  === req.query['method']);
      if (req.query['username']) {
        const q = sanitizeStr(String(req.query['username']), 50).toLowerCase();
        payments = payments.filter(p => p.username.toLowerCase().includes(q));
      }

      const page  = Math.max(1, parseInt(String(req.query['page']  ?? '1'),  10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '50'), 10)));
      const start = (page - 1) * limit;

      return res.status(200).json({
        payments: payments.slice(start, start + limit),
        total:    payments.length,
        page,
        limit,
        pages:    Math.ceil(payments.length / limit) || 1,
      });
    }

    // Public: payment configuration
    if (!ovo && !dana) {
      return res.status(503).json({
        error:   'Payment methods not configured.',
        message: 'Admin must set OVO_NUMBER and DANA_NUMBER in environment variables.',
      });
    }

    return res.status(200).json({
      ovo:      { available: !!ovo,  number: ovo,  masked: maskNumber(ovo),  name: owner },
      dana:     { available: !!dana, number: dana, masked: maskNumber(dana), name: owner },
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

    const body = (req.body ?? {}) as PostBody;
    const { username, userId, packId, method, amount, note } = body;

    if (!username || !packId || !method || !amount) {
      return res.status(400).json({
        error: 'Required fields: username, packId, method, amount.',
      });
    }

    const cleanUsername = sanitizeStr(String(username), 50).trim();
    if (!cleanUsername || !/^[a-zA-Z0-9_]{3,50}$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Invalid username format.' });
    }

    const pkg = PACKAGES.find(p => p.id === sanitizeStr(String(packId), 20));
    if (!pkg) {
      return res.status(400).json({
        error:    'Invalid package ID.',
        validIds: PACKAGES.map(p => p.id),
      });
    }

    const cleanMethod = sanitizeStr(String(method), 10).toLowerCase();
    if (!['ovo', 'dana', 'transfer'].includes(cleanMethod)) {
      return res.status(400).json({
        error: 'Invalid payment method. Accepted: ovo, dana, transfer.',
      });
    }

    const cleanAmount = parseInt(String(amount).replace(/\D/g, ''), 10);
    if (isNaN(cleanAmount) || cleanAmount <= 0 || cleanAmount > 100_000_000) {
      return res.status(400).json({ error: 'Invalid transfer amount.' });
    }

    const rawUserId   = sanitizeStr(String(userId ?? '0'), 30).trim();
    const cleanUserId = /^\d{1,20}$/.test(rawUserId) ? rawUserId : '0';

    let avatarUrl = '';
    try { avatarUrl = await resolveAvatar('', cleanUserId); } catch { avatarUrl = ''; }

    const cleanNote = sanitizeStr(String(note ?? ''), 300);
    const txId      = generateTransactionId();
    const now       = new Date().toISOString();

    const newTx: PaymentRecord = {
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

    const html = buildPaymentEmail({
      username: cleanUsername, userId: cleanUserId, avatarUrl,
      pkg, method: cleanMethod, transactionId: txId,
      note: cleanNote, createdAt: now,
    });

    // Fire-and-forget email notification
    sendEmail({
      to:      ADMIN_EMAIL,
      subject: `[NEXUS] New Payment — @${cleanUsername} · ${pkg.cr} CR (${pkg.id})`,
      html,
    }).then(r => {
      if (!r.ok) console.warn('[payment] Email delivery failed:', r.reason ?? r.error);
    }).catch((e: unknown) =>
      console.error('[payment] Email exception:', e instanceof Error ? e.message : e)
    );

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
          message:      `Transfer ${fmtIDR(pkg.idr)} via ${cleanMethod.toUpperCase()} ke ${maskNumber(paymentNumber)} (${owner}).`,
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

    const body = (req.body ?? {}) as PatchBody;
    const { id, action, adminNote } = body;

    if (!id)     return res.status(400).json({ error: '`id` is required.' });
    if (!action) return res.status(400).json({ error: '`action` is required: confirm or reject.' });
    if (!['confirm', 'reject'].includes(String(action))) {
      return res.status(400).json({ error: 'Invalid action. Use "confirm" or "reject".' });
    }

    const txId     = sanitizeStr(String(id),          60);
    const safeNote = sanitizeStr(String(adminNote ?? ''), 500);

    const payments = loadPayments();
    const idx      = payments.findIndex(p => p.id === txId);

    if (idx === -1) return res.status(404).json({ error: 'Transaction not found.' });

    const tx = payments[idx];
    if (tx.status !== 'pending') {
      return res.status(409).json({
        error:         `Transaction already processed (status: ${tx.status}).`,
        currentStatus: tx.status,
      });
    }

    // ── CONFIRM ────────────────────────────────────────────────────
    if (action === 'confirm') {
      try {
        const host    = req.headers['host'] ?? 'nexusai-rbx.vercel.app';
        const syncUrl = `https://${host}/api/sync`;
        const syncRes = await fetch(syncUrl, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:
              req.headers['authorization'] ??
              `Bearer ${process.env.ADMIN_TOKEN ?? ''}`,
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
          const errData: unknown = await syncRes.json().catch(() => ({}));
          console.error('[payment] Credit sync failed:', errData);
          return res.status(502).json({
            error:     'Credit sync failed. Retry or add credits manually.',
            syncError: errData,
          });
        }
      } catch (err: unknown) {
        console.error('[payment] Sync request error:', err instanceof Error ? err.message : err);
        return res.status(502).json({ error: 'Could not reach sync server. Please try again.' });
      }

      payments[idx] = { ...tx, status: 'confirmed', adminNote: safeNote, confirmedAt: new Date().toISOString() };
      savePayments(payments);

      return res.status(200).json({
        success: true,
        message: `Payment confirmed. ${tx.credits} CR added to @${tx.username}.`,
        transaction: payments[idx],
      });
    }

    // ── REJECT ─────────────────────────────────────────────────────
    if (action === 'reject') {
      payments[idx] = { ...tx, status: 'rejected', adminNote: safeNote, confirmedAt: new Date().toISOString() };
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

    const body    = (req.body ?? {}) as DeleteBody;
    const queryId = req.query['id'];
    const rawId   = body.id ?? queryId;
    if (!rawId) return res.status(400).json({ error: '`id` is required.' });

    const txId     = sanitizeStr(String(rawId), 60);
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
};

export default handler;