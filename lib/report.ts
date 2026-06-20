// lib/report.ts — NEXUS AI Report System (TypeScript v3 — Gmail-safe)
//
// Changes v3 (fixes "email never arrives" + "blank email in Gmail"):
//   • Removed ALL unicode emoji from email subjects and HTML bodies.
//     Emoji characters are a common, hard-to-spot cause of API send failures:
//     if the source file or any step in the build/deploy pipeline does not
//     preserve UTF-8 byte-for-byte (common with certain editors, Windows
//     line-ending conversion, or some CI pipelines), the emoji bytes become
//     invalid UTF-8 sequences. The JSON.stringify() call still "succeeds"
//     syntactically, but the request body sent to the Resend API can be
//     rejected, and because the send is fire-and-forget, the failure was
//     only ever visible in server logs — never to the caller. Replaced with
//     plain text labels and safe HTML entities (&diams; &check; &cross; etc.)
//     which render identically in every mail client with zero encoding risk.
//   • Removed border-radius + overflow:hidden combinations on <table>/<td>.
//     Gmail (web and Android/iOS apps) strips border-radius and can, in some
//     versions, drop the entire content of a container that combines
//     border-radius with overflow:hidden, which can make a whole email
//     section (or the full body) appear blank.
//   • Removed all linear-gradient backgrounds on table cells — unsupported
//     in Gmail and silently dropped, contributing to blank-looking sections.
//   • Outer tables now use width="100%" with a max-width style instead of a
//     fixed pixel width, so the layout cannot overflow and "hide" content
//     off-screen on narrow phone viewports.
//   • sendEmail() failures are no longer fully swallowed: the POST and PATCH
//     handlers now include an `emailSent` boolean (and `emailError` when
//     applicable) in their JSON response, so a caller/admin can immediately
//     see if the notification failed to send instead of discovering it only
//     by checking server logs.
//   • All comments in English.
//   • No change to storage logic, validation rules, or response shape beyond
//     the added emailSent/emailError fields described above.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import crypto from 'crypto';
import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route.js';
import { verifyAdminToken, sanitizeStr, checkRateLimit } from './_security';

// ─── TYPES ────────────────────────────────────────────────────────────────────

type ReportStatus = 'pending' | 'confirmed' | 'rejected' | null;
type ReportType   = 'payment' | 'bug';

interface Report {
  id:            string;
  type:          ReportType;
  from:          string;
  userId:        string;
  avatar:        string;
  message:       string;
  plan:          string;
  credits:       number;
  time:          string;
  savedAt:       number;
  paymentPack:   string | null;
  paymentCR:     number | null;
  paymentMethod: string | null;
  paymentTotal:  string | null;
  transactionId: string | null;
  status:        ReportStatus;
  adminNote:     string | null;
  confirmedAt:   string | null;
}

interface PostBody {
  from?:          unknown;
  message?:       unknown;
  type?:          unknown;
  userId?:        unknown;
  avatar?:        unknown;
  plan?:          unknown;
  credits?:       unknown;
  time?:          unknown;
  paymentPack?:   unknown;
  paymentCR?:     unknown;
  paymentMethod?: unknown;
  paymentTotal?:  unknown;
  transactionId?: unknown;
  [key: string]:  unknown;
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

interface EmailResult {
  ok:      boolean;
  status?: number;
  data?:   unknown;
  reason?: string;
  error?:  string;
}

interface SendEmailParams {
  to:      string | string[];
  subject: string;
  html:    string;
}

interface PlanStyle {
  bg:     string;
  text:   string;
  border: string;
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

const REPORT_FILE = '/tmp/nexus_reports.json' as const;
const MAX_REPORTS = 500;

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

type PlanKey = 'free' | 'basic' | 'pro' | 'premium' | 'owner';

const PLAN_STYLE: Record<PlanKey, PlanStyle> = {
  free:    { bg: '#1e1e2e', text: '#8888aa', border: '#2e2e44' },
  basic:   { bg: '#0a1a2e', text: '#00b8d9', border: '#0f3050' },
  pro:     { bg: '#1a0f2e', text: '#9f7aea', border: '#3a1a60' },
  premium: { bg: '#1e1600', text: '#d4a017', border: '#3a2a00' },
  owner:   { bg: '#0a1a0a', text: '#00ff88', border: '#0a3a1a' },
};

const PLAN_STYLE_DEFAULT = PLAN_STYLE.free;

// ─── STORAGE ──────────────────────────────────────────────────────────────────

function loadReports(): Report[] {
  try {
    if (existsSync(REPORT_FILE)) {
      const raw:    string  = readFileSync(REPORT_FILE, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Report[];
    }
  } catch { /* return empty */ }
  return [];
}

function saveReports(reports: Report[]): boolean {
  try {
    writeFileSync(
      REPORT_FILE,
      JSON.stringify(reports.slice(0, MAX_REPORTS), null, 2),
      'utf8',
    );
    return true;
  } catch (err: unknown) {
    console.error('[report] saveReports failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ─── SANITIZERS ──────────────────────────────────────────────────────────────

/** Escape HTML for safe rendering in email templates. */
function esc(str: unknown, max: number = 200): string {
  return String(str ?? '')
    .substring(0, max)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Strip dangerous control chars and angle brackets before storing. */
function sanStr(str: unknown, max: number = 200): string {
  const s = typeof str === 'string' ? str : String(str ?? '');
  return s
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/[<>]/g, '')
    .substring(0, max);
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
    console.warn('[report] Avatar fetch failed for uid', uid, '—',
      err instanceof Error ? err.message : err);
  }
  return '';
}

// ─── EMAIL HELPERS ────────────────────────────────────────────────────────────
//
// Gmail-safe rules applied throughout the templates below:
//   1. No border-radius combined with overflow:hidden on any table/td — this
//      combination can cause entire sections to render blank in Gmail.
//   2. No linear-gradient backgrounds — unsupported and silently dropped.
//   3. No emoji characters — replaced with plain text or HTML entities.
//   4. Every table uses width="100%" with a max-width style on the outer
//      wrapper only, so nothing can overflow or get clipped off-screen.

function buildAvatarBlock(avatarUrl: string, displayName: string, size: number = 80): string {
  const initial  = (displayName || '?').charAt(0).toUpperCase();
  const fontSize = Math.round(size * 0.35);

  if (avatarUrl) {
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
             style="margin:0 auto 14px;">
        <tr>
          <td width="${size + 6}" height="${size + 6}" align="center" valign="middle"
              style="width:${size + 6}px;height:${size + 6}px;
                     background-color:#5500cc;padding:3px;">
            <img src="${avatarUrl}" width="${size}" height="${size}"
                 alt="@${displayName}"
                 style="display:block;width:${size}px;height:${size}px;border:0;" />
          </td>
        </tr>
      </table>`;
  }

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
           style="margin:0 auto 14px;">
      <tr>
        <td width="${size}" height="${size}" align="center" valign="middle"
            style="width:${size}px;height:${size}px;
                   background-color:#0a1040;
                   border:3px solid #00a8c0;
                   font-size:${fontSize}px;
                   font-weight:700;color:#ffffff;
                   font-family:${FONT_SANS};text-align:center;">
          ${initial}
        </td>
      </tr>
    </table>`;
}

// ─── NOTIFICATION EMAIL ───────────────────────────────────────────────────────

function buildNotificationEmail(report: Report): string {
  const isPayment     = report.type === 'payment';
  const displayName   = esc(report.from, 50);
  const rawMsg        = sanStr(String(report.message ?? ''), 2000);
  const displayMsg    = esc(rawMsg, 2000).replace(/\n/g, '<br>');
  const formattedTime = formatTime(report.time);
  const planKey       = sanStr((report.plan || 'free').toLowerCase(), 20) as PlanKey;
  const ps            = PLAN_STYLE[planKey] ?? PLAN_STYLE_DEFAULT;
  const avatarUrl     = report.avatar ?? '';
  const avatarBlock   = buildAvatarBlock(avatarUrl, displayName, 80);

  const paymentSection = isPayment ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="width:100%;margin-bottom:16px;background-color:#060d1e;
                  border:1px solid #0a3a1a;">
      <tr>
        <td height="3" bgcolor="#00a866" style="font-size:0;line-height:0;">&nbsp;</td>
      </tr>
      <tr>
        <td style="padding:14px 18px 8px;">
          <p style="margin:0;font-family:${FONT_MONO};font-size:10px;font-weight:700;
                    color:#00c87a;letter-spacing:3px;text-transform:uppercase;">
            &diams; PAYMENT DETAILS</p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 18px;border-bottom:1px solid #0a1e2a;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
            <tr>
              <td style="font-family:${FONT_MONO};font-size:10px;color:#3a5a7a;
                         white-space:nowrap;padding-right:10px;vertical-align:top;">PACKAGE</td>
              <td align="right" style="font-family:${FONT_SANS};font-size:13px;
                         color:#ffffff;font-weight:700;word-break:break-word;">
                ${esc(report.paymentPack ?? '-', 80)}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 18px;border-bottom:1px solid #0a1e2a;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
            <tr>
              <td style="font-family:${FONT_MONO};font-size:10px;color:#3a5a7a;
                         white-space:nowrap;padding-right:10px;">CREDITS</td>
              <td align="right" style="font-family:${FONT_MONO};font-size:18px;
                         color:#d4a017;font-weight:700;">
                ${esc(String(report.paymentCR ?? 0), 20)} CR</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 18px;border-bottom:1px solid #0a1e2a;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
            <tr>
              <td style="font-family:${FONT_MONO};font-size:10px;color:#3a5a7a;
                         white-space:nowrap;padding-right:10px;">METHOD</td>
              <td align="right" style="font-family:${FONT_SANS};font-size:12px;
                         color:#00c8e0;font-weight:700;text-transform:uppercase;
                         letter-spacing:1px;">
                ${esc((report.paymentMethod ?? 'UNKNOWN').toUpperCase(), 20)}</td>
            </tr>
          </table>
        </td>
      </tr>
      ${report.transactionId ? `
      <tr>
        <td style="padding:10px 18px;border-bottom:1px solid #0a1e2a;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
            <tr>
              <td style="font-family:${FONT_MONO};font-size:10px;color:#3a5a7a;
                         white-space:nowrap;padding-right:10px;vertical-align:top;">TXN ID</td>
              <td align="right" style="font-family:${FONT_MONO};font-size:10px;
                         color:#4a6a8a;word-break:break-all;">
                ${esc(report.transactionId, 80)}</td>
            </tr>
          </table>
        </td>
      </tr>` : ''}
      <tr>
        <td style="padding:13px 18px;border-bottom:1px solid #0a3a1a;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
            <tr>
              <td style="font-family:${FONT_SANS};font-size:12px;color:#ffffff;
                         font-weight:700;letter-spacing:1px;white-space:nowrap;
                         padding-right:10px;vertical-align:middle;">TOTAL PAID</td>
              <td align="right" style="font-family:${FONT_MONO};font-size:20px;
                         color:#00c87a;font-weight:700;">
                ${esc(report.paymentTotal ?? '-', 30)}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 14px 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="width:100%;background-color:#1a1200;border:1px solid #3a2a00;">
            <tr><td style="padding:13px 14px;">
              <p style="margin:0 0 8px;font-family:${FONT_SANS};font-size:10px;font-weight:700;
                        color:#d4a017;letter-spacing:2px;text-transform:uppercase;">
                ACTION REQUIRED</p>
              <p style="margin:0;font-family:${FONT_SANS};font-size:12px;
                        color:#b8cce8;line-height:1.7;word-break:break-word;">
                Add <strong style="color:#d4a017;font-size:15px;">
                  ${esc(String(report.paymentCR ?? 0), 20)} CR
                </strong> to account
                <strong style="color:#ffffff;">@${displayName}</strong>
                <span style="color:#3a5a7a;">(UID: ${esc(report.userId ?? '-', 30)})</span>
                after verifying the transfer.</p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>` : `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="width:100%;margin-bottom:16px;">
      <tr>
        <td width="50%" style="padding-right:8px;vertical-align:top;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="width:100%;background-color:#160808;border:1px solid #3a1010;">
            <tr><td style="padding:12px 16px;">
              <p style="margin:0 0 5px;font-family:${FONT_MONO};font-size:9px;
                        color:#cc4444;letter-spacing:2px;text-transform:uppercase;">TYPE</p>
              <p style="margin:0;font-family:${FONT_SANS};font-size:13px;
                        color:#ffffff;font-weight:700;">Bug Report</p>
            </td></tr>
          </table>
        </td>
        <td width="50%" style="padding-left:8px;vertical-align:top;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="width:100%;background-color:#060d1e;border:1px solid #0a2040;">
            <tr><td style="padding:12px 16px;">
              <p style="margin:0 0 5px;font-family:${FONT_MONO};font-size:9px;
                        color:#00c8e0;letter-spacing:2px;text-transform:uppercase;">STATUS</p>
              <p style="margin:0;font-family:${FONT_SANS};font-size:13px;
                        color:#ffffff;font-weight:700;">Open</p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>NEXUS AI — ${isPayment ? 'New Payment' : 'New Bug Report'}</title>
</head>
<body style="margin:0;padding:0;background-color:#030312;width:100%;">

<!--[if mso]>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td>
<![endif]-->

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background-color:#030312;margin:0;padding:0;width:100%;">
  <tr>
    <td align="center" style="padding:20px 10px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="width:100%;max-width:600px;margin:0 auto;">

        <!-- TOP ACCENT BAR -->
        <tr>
          <td style="line-height:0;font-size:0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
              <tr>
                <td width="34%" height="3" bgcolor="#7c3aed" style="font-size:0;line-height:0;">&nbsp;</td>
                <td width="33%" height="3" bgcolor="#00c8e0" style="font-size:0;line-height:0;">&nbsp;</td>
                <td width="33%" height="3" bgcolor="#00c87a" style="font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- OUTER FRAME -->
        <tr>
          <td bgcolor="#0b0c24" style="border:1px solid #1a2a4a;border-top:none;">

            <!-- HEADER -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
              <tr>
                <td style="padding:26px 20px 8px;text-align:center;">
                  <p style="margin:0 0 4px;font-family:${FONT_MONO};font-size:10px;font-weight:700;
                            color:#7c3aed;letter-spacing:5px;text-transform:uppercase;">
                    NEXUS STUDIO</p>
                  <p style="margin:0;font-family:${FONT_MONO};font-size:26px;font-weight:900;
                            letter-spacing:4px;color:#00c8e0;">NEXUS AI</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 20px 22px;text-align:center;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                    <tr>
                      <td bgcolor="${isPayment ? '#003820' : '#001830'}"
                          style="color:${isPayment ? '#00e890' : '#00c8e0'};
                                 border:1px solid ${isPayment ? '#006040' : '#005070'};
                                 padding:5px 16px;font-family:${FONT_SANS};
                                 font-size:10px;font-weight:700;letter-spacing:2px;
                                 text-transform:uppercase;white-space:nowrap;">
                        ${isPayment ? 'NEW PAYMENT' : 'NEW REPORT'}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- BODY -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                   style="width:100%;background-color:#07081e;">
              <tr>
                <td style="padding:20px 16px 6px;">

                  <!-- USER CARD -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                         style="width:100%;background-color:#0c0e26;border:1px solid #1a2a50;margin-bottom:16px;">
                    <tr>
                      <td style="padding:22px 18px 20px;text-align:center;">
                        ${avatarBlock}
                        <p style="margin:0 0 3px;font-family:${FONT_SANS};font-size:17px;
                                  font-weight:700;color:#ffffff;letter-spacing:0.5px;
                                  word-break:break-word;">@${displayName}</p>
                        <p style="margin:0 0 14px;font-family:${FONT_MONO};font-size:10px;
                                  color:#3a5a7a;letter-spacing:1px;">
                          ROBLOX UID:&nbsp;
                          <span style="color:#5a7aaa;">${esc(report.userId ?? '-', 30)}</span>
                        </p>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
                          <td bgcolor="#1e1400" style="color:#d4a017;border:1px solid #3a2a00;
                                     padding:4px 12px;font-family:${FONT_MONO};
                                     font-size:11px;font-weight:700;letter-spacing:1px;white-space:nowrap;">
                            ${esc(String(report.credits ?? 0), 20)} CR</td>
                          <td width="8">&nbsp;</td>
                          <td bgcolor="${ps.bg}" style="color:${ps.text};
                                     border:1px solid ${ps.border};
                                     padding:4px 12px;font-family:${FONT_SANS};
                                     font-size:11px;font-weight:700;letter-spacing:1px;
                                     text-transform:uppercase;white-space:nowrap;">
                            ${esc(planKey, 20)} PLAN</td>
                        </tr></table>
                      </td>
                    </tr>
                  </table>

                  ${paymentSection}

                  <!-- MESSAGE / NOTE -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                         style="width:100%;background-color:#060818;border:1px solid #0e1e3a;
                                border-left:4px solid #00c8e0;margin-bottom:16px;">
                    <tr>
                      <td style="padding:16px 16px 16px 14px;">
                        <p style="margin:0 0 10px;font-family:${FONT_MONO};font-size:9px;font-weight:700;
                                  color:#00c8e0;letter-spacing:3px;text-transform:uppercase;">
                          ${isPayment ? 'TRANSFER NOTES' : 'REPORT MESSAGE'}</p>
                        <p style="margin:0;font-family:${FONT_SANS};font-size:13px;
                                  color:#b0c8e8;line-height:1.8;word-break:break-word;">
                          ${displayMsg ||
                            '<span style="color:#3a5a7a;font-style:italic;">No message provided.</span>'}
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- META -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                         style="width:100%;background-color:#04050f;border:1px solid #0a0f20;margin-bottom:20px;">
                    <tr>
                      <td style="padding:13px 16px;border-bottom:1px solid #0a0f1e;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
                          <tr>
                            <td style="vertical-align:top;width:55%;">
                              <p style="margin:0 0 3px;font-family:${FONT_MONO};font-size:9px;
                                        color:#1e3050;letter-spacing:1px;text-transform:uppercase;">
                                Report ID</p>
                              <p style="margin:0;font-family:${FONT_MONO};font-size:11px;color:#4a6a9a;
                                        word-break:break-all;">
                                #${esc(report.id ?? '-', 40)}</p>
                            </td>
                            <td align="right" style="vertical-align:top;width:45%;">
                              <p style="margin:0 0 3px;font-family:${FONT_MONO};font-size:9px;
                                        color:#1e3050;letter-spacing:1px;text-transform:uppercase;">
                                Submitted</p>
                              <p style="margin:0;font-family:${FONT_MONO};font-size:11px;color:#4a6a9a;
                                        word-break:break-word;">
                                ${formattedTime}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    ${isPayment ? `
                    <tr>
                      <td style="padding:12px 16px;">
                        <p style="margin:0 0 3px;font-family:${FONT_MONO};font-size:9px;
                                  color:#1e3050;letter-spacing:1px;text-transform:uppercase;">
                          Payment Status</p>
                        <p style="margin:0;font-family:${FONT_SANS};font-size:12px;font-weight:700;
                                  color:#d4a017;letter-spacing:1px;text-transform:uppercase;">
                          AWAITING CONFIRMATION</p>
                      </td>
                    </tr>` : ''}
                  </table>

                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- BOTTOM ACCENT BAR -->
        <tr>
          <td style="line-height:0;font-size:0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
              <tr>
                <td width="33%" height="1" bgcolor="#7c3aed" style="font-size:0;line-height:0;">&nbsp;</td>
                <td width="34%" height="1" bgcolor="#00c8e0" style="font-size:0;line-height:0;">&nbsp;</td>
                <td width="33%" height="1" bgcolor="#00c87a" style="font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td bgcolor="#03040e" style="border:1px solid #0f1830;border-top:none;padding:18px 20px;text-align:center;">
            <p style="margin:0 0 4px;font-family:${FONT_MONO};font-size:9px;
                      color:#1e2a4a;letter-spacing:3px;text-transform:uppercase;">
              NEXUS AI &nbsp;&middot;&nbsp; NEXUS STUDIO</p>
            <p style="margin:0;font-family:${FONT_SANS};font-size:10px;color:#141e30;line-height:1.5;">
              Automated system email — do not reply to this email.</p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

<!--[if mso]>
</td></tr></table>
<![endif]-->

</body>
</html>`;
}

// ─── CONFIRMATION EMAIL ───────────────────────────────────────────────────────

function buildConfirmationEmail(
  report:    Report,
  action:    'confirm' | 'reject',
  adminNote: string,
): string {
  const isConfirmed  = action === 'confirm';
  const displayName  = esc(report.from, 50);
  const accentColor  = isConfirmed ? '#00c87a' : '#ff4444';
  const accentBg     = isConfirmed ? '#002a14' : '#200808';
  const accentBorder = isConfirmed ? '#005a28' : '#500010';
  const avatarBlock  = buildAvatarBlock(report.avatar ?? '', displayName, 70);

  const noteSection = adminNote ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="width:100%;background-color:#100820;border:1px solid #2a1a50;
                  border-left:4px solid #7c3aed;margin-bottom:16px;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 6px;font-family:${FONT_MONO};font-size:9px;
                    color:#7c3aed;letter-spacing:2px;text-transform:uppercase;">
            Admin Note</p>
          <p style="margin:0;font-family:${FONT_SANS};font-size:12px;
                    color:#c0c0e0;line-height:1.7;word-break:break-word;">${esc(adminNote, 500)}</p>
        </td>
      </tr>
    </table>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>NEXUS AI — Payment ${isConfirmed ? 'Confirmed' : 'Rejected'}</title>
</head>
<body style="margin:0;padding:0;background-color:#030312;width:100%;">

<!--[if mso]>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td>
<![endif]-->

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background-color:#030312;margin:0;padding:0;width:100%;">
  <tr>
    <td align="center" style="padding:20px 10px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="width:100%;max-width:580px;margin:0 auto;">

        <!-- OUTER FRAME -->
        <tr>
          <td bgcolor="#0b0c24" style="border:1px solid ${accentBorder};">

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
              <tr>
                <td height="3" bgcolor="${accentColor}" style="font-size:0;line-height:0;">&nbsp;</td>
              </tr>
              <tr>
                <td style="padding:26px 24px 22px;text-align:center;">
                  ${avatarBlock}
                  <p style="margin:0 0 8px;font-family:${FONT_MONO};font-size:24px;
                            font-weight:900;letter-spacing:4px;color:#00c8e0;">NEXUS AI</p>
                  <p style="margin:0 0 10px;font-family:${FONT_SANS};font-size:13px;font-weight:700;
                            color:${accentColor};letter-spacing:1px;">
                    ${isConfirmed ? 'PAYMENT VERIFIED' : 'PAYMENT NOT VERIFIED'}</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
                    <td bgcolor="${accentBg}" style="color:${accentColor};
                               border:1px solid ${accentBorder};
                               padding:5px 16px;font-family:${FONT_SANS};font-size:11px;
                               font-weight:700;letter-spacing:2px;text-transform:uppercase;
                               white-space:nowrap;">
                      PAYMENT ${isConfirmed ? 'CONFIRMED' : 'REJECTED'}</td>
                  </tr></table>
                </td>
              </tr>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                   style="width:100%;background-color:#07081e;">
              <tr>
                <td style="padding:24px 18px;">
                  <p style="margin:0 0 18px;font-family:${FONT_SANS};font-size:14px;
                            color:#b0c8e8;line-height:1.8;word-break:break-word;">
                    Hello <strong style="color:#ffffff;">@${displayName}</strong>,<br><br>
                    ${isConfirmed
                      ? `Your payment has been <strong style="color:#00c87a;">verified and confirmed</strong>.
                         <strong style="color:#d4a017;">${esc(String(report.paymentCR ?? 0), 20)} CR</strong>
                         has been added to your account. Thank you!`
                      : `We're sorry — your payment submission
                         <strong style="color:#ff4444;">could not be processed</strong>.
                         Please contact an admin on Discord or resubmit with correct proof of transfer.`}
                  </p>

                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                         style="width:100%;background-color:#04050f;border:1px solid #0a0f20;margin-bottom:16px;">
                    <tr>
                      <td style="padding:12px 16px 6px;">
                        <p style="margin:0;font-family:${FONT_MONO};font-size:9px;color:#1e3050;
                                  letter-spacing:2px;text-transform:uppercase;">
                          Transaction Summary</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:9px 16px;border-bottom:1px solid #0a0f1e;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
                          <tr>
                            <td style="font-family:${FONT_SANS};font-size:11px;color:#3a5a7a;
                                       white-space:nowrap;padding-right:10px;vertical-align:top;">Package</td>
                            <td align="right" style="font-family:${FONT_SANS};font-size:12px;
                                       color:#ffffff;font-weight:600;word-break:break-word;">
                              ${esc(report.paymentPack ?? '-', 80)}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:9px 16px;border-bottom:1px solid #0a0f1e;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
                          <tr>
                            <td style="font-family:${FONT_SANS};font-size:11px;color:#3a5a7a;
                                       white-space:nowrap;padding-right:10px;">Credits</td>
                            <td align="right" style="font-family:${FONT_MONO};font-size:14px;
                                       color:#d4a017;font-weight:700;">
                              ${esc(String(report.paymentCR ?? 0), 20)} CR</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:9px 16px;border-bottom:1px solid #0a0f1e;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
                          <tr>
                            <td style="font-family:${FONT_SANS};font-size:11px;color:#3a5a7a;
                                       white-space:nowrap;padding-right:10px;">Amount Paid</td>
                            <td align="right" style="font-family:${FONT_MONO};font-size:14px;
                                       color:#00c87a;font-weight:700;">
                              ${esc(report.paymentTotal ?? '-', 30)}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:11px 16px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
                          <tr>
                            <td style="font-family:${FONT_SANS};font-size:11px;color:#3a5a7a;
                                       white-space:nowrap;padding-right:10px;">Status</td>
                            <td align="right" style="font-family:${FONT_SANS};font-size:12px;font-weight:700;
                                       color:${accentColor};letter-spacing:1px;text-transform:uppercase;">
                              ${isConfirmed ? 'CONFIRMED' : 'REJECTED'}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  ${noteSection}

                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td bgcolor="#03040e" style="border:1px solid #0f1830;border-top:none;padding:18px 24px;text-align:center;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                   style="width:100%;margin-bottom:12px;">
              <tr>
                <td width="33%" height="1" bgcolor="#7c3aed" style="font-size:0;line-height:0;">&nbsp;</td>
                <td width="34%" height="1" bgcolor="#00c8e0" style="font-size:0;line-height:0;">&nbsp;</td>
                <td width="33%" height="1" bgcolor="#00c87a" style="font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>
            <p style="margin:0;font-family:${FONT_MONO};font-size:9px;
                      color:#1e2a4a;letter-spacing:3px;text-transform:uppercase;">
              NEXUS AI &nbsp;&middot;&nbsp; NEXUS STUDIO</p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

<!--[if mso]>
</td></tr></table>
<![endif]-->

</body>
</html>`;
}

// ─── EMAIL SENDER ─────────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html }: SendEmailParams): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[report] RESEND_API_KEY not configured — email skipped.');
    return { ok: false, reason: 'no_resend_key' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
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
    if (!r.ok) console.error('[report] Resend error:', r.status, data);
    return { ok: r.ok, status: r.status, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[report] sendEmail exception:', msg);
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
  const ADMIN_EMAIL: string = process.env.REPORT_EMAIL ?? 'arifiinytid@gmail.com';

  // ═══════════════════════════════════════════════════════════════════
  // GET — Admin: list reports
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Unauthorized. Admin token required.' });
    }
    if (!checkRateLimit(`rpt_get:${ip}`, 60)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please slow down.' });
    }

    let reports = loadReports();

    if (req.query['type'])   reports = reports.filter(r => r.type   === req.query['type']);
    if (req.query['id'])     reports = reports.filter(r => r.id     === req.query['id']);
    if (req.query['status']) reports = reports.filter(r => r.status === req.query['status']);
    if (req.query['from']) {
      const q = sanStr(req.query['from'], 50).toLowerCase();
      reports  = reports.filter(r => r.from.toLowerCase().includes(q));
    }

    const page  = Math.max(1, parseInt(String(req.query['page']  ?? '1'),  10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '50'), 10)));
    const start = (page - 1) * limit;

    return res.status(200).json({
      reports: reports.slice(start, start + limit),
      total:   reports.length,
      page,
      limit,
      pages:   Math.ceil(reports.length / limit) || 1,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // POST — Submit a bug report or payment
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    if (!checkRateLimit(`rpt_post:${ip}`, 5)) {
      return res.status(429).json({
        error: 'Too many submissions. Please wait 1 minute and try again.',
      });
    }

    const body = (req.body ?? {}) as PostBody;

    if (!body.from || !body.message) {
      return res.status(400).json({ error: '`from` and `message` are required.' });
    }

    const cleanFrom = sanStr(String(body.from), 50).trim();
    if (!cleanFrom) return res.status(400).json({ error: 'Invalid `from` field.' });

    const reportType: ReportType = body.type === 'payment' ? 'payment' : 'bug';

    if (reportType === 'payment') {
      if (!body.paymentCR || !body.paymentTotal || !body.paymentMethod) {
        return res.status(400).json({
          error: 'Payment reports require: paymentCR, paymentTotal, paymentMethod.',
        });
      }
      const cr = parseFloat(String(body.paymentCR));
      if (isNaN(cr) || cr <= 0 || cr > 100_000) {
        return res.status(400).json({
          error: 'paymentCR must be a number between 1 and 100,000.',
        });
      }
    }

    const rawUserId   = sanStr(String(body.userId ?? '0'), 30).trim();
    const cleanUserId = /^\d{1,20}$/.test(rawUserId) ? rawUserId : '0';

    let cleanAvatar = '';
    try {
      cleanAvatar = await resolveAvatar(String(body.avatar ?? ''), cleanUserId);
    } catch { cleanAvatar = ''; }

    const report: Report = {
      id:            `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
      type:          reportType,
      from:          cleanFrom,
      userId:        cleanUserId,
      avatar:        cleanAvatar,
      message:       sanStr(String(body.message), 2000),
      plan:          sanStr(String(body.plan ?? 'free').toLowerCase(), 20),
      credits:       Math.max(0, parseFloat(String(body.credits ?? 0)) || 0),
      time:          body.time
                       ? sanStr(String(body.time), 40)
                       : new Date().toISOString(),
      savedAt:       Date.now(),
      paymentPack:   body.paymentPack   ? sanStr(String(body.paymentPack),   80) : null,
      paymentCR:     body.paymentCR     ? Math.max(0, parseFloat(String(body.paymentCR))) : null,
      paymentMethod: body.paymentMethod ? sanStr(String(body.paymentMethod), 20) : null,
      paymentTotal:  body.paymentTotal  ? sanStr(String(body.paymentTotal),  30) : null,
      transactionId: body.transactionId ? sanStr(String(body.transactionId), 80) : null,
      status:        reportType === 'payment' ? 'pending' : null,
      adminNote:     null,
      confirmedAt:   null,
    };

    const reports = loadReports();
    reports.unshift(report);
    const saved = saveReports(reports);
    if (!saved) console.error('[report] Failed to persist report', report.id);

    // Email is sent synchronously (awaited) here so that a delivery failure
    // is visible in the API response instead of being silently swallowed.
    let emailSent  = false;
    let emailError: string | undefined;
    try {
      const result = await sendEmail({
        to:      ADMIN_EMAIL,
        subject: reportType === 'payment'
          ? `[NEXUS] New Payment - @${cleanFrom} (${report.paymentCR} CR)`
          : `[NEXUS] New Bug Report - @${cleanFrom}`,
        html: buildNotificationEmail(report),
      });
      emailSent = result.ok;
      if (!result.ok) emailError = result.reason ?? result.error ?? 'unknown_error';
    } catch (e: unknown) {
      emailError = e instanceof Error ? e.message : String(e);
      console.error('[report] Email exception:', emailError);
    }

    return res.status(201).json({
      status:  'ok',
      id:      report.id,
      type:    report.type,
      message: 'Report submitted successfully.',
      emailSent,
      ...(emailError ? { emailError } : {}),
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // PATCH — Admin: confirm or reject a payment
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'PATCH') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Unauthorized. Admin token required.' });
    }
    if (!checkRateLimit(`rpt_patch:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }

    const body = (req.body ?? {}) as PatchBody;
    const { id, action, adminNote } = body;

    if (!id)     return res.status(400).json({ error: '`id` is required.' });
    if (!action) return res.status(400).json({ error: '`action` is required: confirm or reject.' });
    if (!['confirm', 'reject'].includes(String(action))) {
      return res.status(400).json({ error: 'Invalid action. Use "confirm" or "reject".' });
    }

    const safeId   = sanitizeStr(String(id),          60);
    const safeNote = sanitizeStr(String(adminNote ?? ''), 500);

    const reports = loadReports();
    const idx     = reports.findIndex(r => r.id === safeId);

    if (idx === -1) return res.status(404).json({ error: 'Report not found.' });

    const report = reports[idx];
    if (report.status !== 'pending') {
      return res.status(409).json({
        error:         `Report already processed (status: ${report.status}).`,
        currentStatus: report.status,
      });
    }

    // ── CONFIRM ────────────────────────────────────────────────────
    if (action === 'confirm') {
      if (report.type === 'payment' && report.paymentCR) {
        try {
          const host    = req.headers['host'] ?? 'nexusai-roblox.vercel.app';
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
              target:        report.from,
              amount:        report.paymentCR,
              transactionId: report.transactionId ?? report.id,
            }),
            signal: AbortSignal.timeout(10_000),
          });

          if (!syncRes.ok) {
            const errData: unknown = await syncRes.json().catch(() => ({}));
            console.error('[report] Credit sync failed:', errData);
            return res.status(502).json({
              error:     'Credit sync failed. Retry or add credits manually.',
              syncError: errData,
            });
          }
        } catch (err: unknown) {
          console.error('[report] Sync error:', err instanceof Error ? err.message : err);
          return res.status(502).json({ error: 'Cannot reach the sync server. Please try again.' });
        }
      }

      reports[idx] = { ...report, status: 'confirmed', adminNote: safeNote, confirmedAt: new Date().toISOString() };
      saveReports(reports);

      let emailSent  = false;
      let emailError: string | undefined;
      try {
        const result = await sendEmail({
          to:      ADMIN_EMAIL,
          subject: `[NEXUS] Payment Confirmed - @${report.from} (${report.paymentCR} CR)`,
          html:    buildConfirmationEmail(report, 'confirm', safeNote),
        });
        emailSent = result.ok;
        if (!result.ok) emailError = result.reason ?? result.error ?? 'unknown_error';
      } catch (e: unknown) {
        emailError = e instanceof Error ? e.message : String(e);
      }

      return res.status(200).json({
        success: true,
        message: `Payment confirmed. ${report.paymentCR} CR added to @${report.from}.`,
        report:  reports[idx],
        emailSent,
        ...(emailError ? { emailError } : {}),
      });
    }

    // ── REJECT ─────────────────────────────────────────────────────
    if (action === 'reject') {
      reports[idx] = { ...report, status: 'rejected', adminNote: safeNote, confirmedAt: new Date().toISOString() };
      saveReports(reports);

      let emailSent  = false;
      let emailError: string | undefined;
      try {
        const result = await sendEmail({
          to:      ADMIN_EMAIL,
          subject: `[NEXUS] Payment Rejected - @${report.from}`,
          html:    buildConfirmationEmail(report, 'reject', safeNote),
        });
        emailSent = result.ok;
        if (!result.ok) emailError = result.reason ?? result.error ?? 'unknown_error';
      } catch (e: unknown) {
        emailError = e instanceof Error ? e.message : String(e);
      }

      return res.status(200).json({
        success: true,
        message: `Payment rejected for @${report.from}.`,
        report:  reports[idx],
        emailSent,
        ...(emailError ? { emailError } : {}),
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // DELETE — Admin: delete a report
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'DELETE') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Unauthorized. Admin token required.' });
    }
    if (!checkRateLimit(`rpt_del:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }

    const body    = (req.body ?? {}) as DeleteBody;
    const queryId = req.query['id'];
    const rawId   = body.id ?? queryId;
    if (!rawId) return res.status(400).json({ error: '`id` is required.' });

    const safeId   = sanitizeStr(String(rawId), 60);
    const reports  = loadReports();
    const filtered = reports.filter(r => r.id !== safeId);

    if (filtered.length === reports.length) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    saveReports(filtered);
    return res.status(200).json({ success: true, message: `Report ${safeId} deleted successfully.` });
  }

  return res.status(405).json({ error: `Method ${req.method} is not allowed.` });
};

export default handler;