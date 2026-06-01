import { readFileSync, writeFileSync, existsSync } from 'fs';
import crypto from 'crypto';

const REPORT_FILE = '/tmp/nexus_reports.json';
const MAX_REPORTS = 500;

// ─── ADMIN TOKEN ──────────────────────────────────────────────────────────────
function getAdminToken() {
  const t = process.env.ADMIN_TOKEN;
  if (!t || t.length < 8) return null;
  return t;
}

function verifyAdminToken(req) {
  const token = getAdminToken();
  if (!token) return false;

  const candidate =
    (req.headers?.['authorization'] || '').replace(/^Bearer\s+/i, '').trim() ||
    (req.headers?.['x-admin-token'] || '').trim() ||
    (typeof req.query?.token === 'string' ? req.query.token.trim() : '');

  if (!candidate) return false;

  try {
    const maxLen = Math.max(candidate.length, token.length, 32);
    const a = Buffer.alloc(maxLen, 0);
    const b = Buffer.alloc(maxLen, 0);
    Buffer.from(candidate).copy(a);
    Buffer.from(token).copy(b);
    return crypto.timingSafeEqual(a, b) && candidate === token;
  } catch (_) {
    return candidate === token;
  }
}

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const _rl = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rl) if (now > v.reset + 120_000) _rl.delete(k);
}, 5 * 60_000).unref?.();

function checkRateLimit(key, max = 10) {
  const now = Date.now();
  const k   = String(key || 'anon').substring(0, 100);
  if (!_rl.has(k)) _rl.set(k, { count: 0, reset: now + 60_000 });
  const r = _rl.get(k);
  if (now > r.reset) { r.count = 0; r.reset = now + 60_000; }
  return ++r.count <= max;
}

// ─── SANITIZERS ──────────────────────────────────────────────────────────────
/** Escape HTML for safe rendering in email templates. */
function esc(str, max = 200) {
  return String(str ?? '')
    .substring(0, max)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Strip dangerous control chars and angle brackets before storing. */
function sanStr(str, max = 200) {
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

const PLAN_STYLE = {
  free:    { bg: '#1e1e2e', text: '#8888aa', border: '#2e2e44' },
  basic:   { bg: '#0a1a2e', text: '#00b8d9', border: '#0f3050' },
  pro:     { bg: '#1a0f2e', text: '#9f7aea', border: '#3a1a60' },
  premium: { bg: '#1e1600', text: '#d4a017', border: '#3a2a00' },
  owner:   { bg: '#0a1a0a', text: '#00ff88', border: '#0a3a1a' },
};

// ─── STORAGE ──────────────────────────────────────────────────────────────────
function loadReports() {
  try {
    if (existsSync(REPORT_FILE)) {
      const raw = readFileSync(REPORT_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

function saveReports(reports) {
  try {
    writeFileSync(
      REPORT_FILE,
      JSON.stringify(reports.slice(0, MAX_REPORTS), null, 2),
      'utf8',
    );
    return true;
  } catch (err) {
    console.error('[report] saveReports failed:', err.message);
    return false;
  }
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
 * Resolves a valid Roblox avatar CDN URL.
 * 1. Checks if the provided raw URL is already from a safe Roblox CDN.
 * 2. Falls back to fetching from the Roblox Thumbnails API using userId.
 * Returns empty string if nothing can be resolved.
 */
async function resolveAvatar(rawAvatar, userId) {
  // Case 1: Caller already provided a safe CDN URL
  if (rawAvatar && SAFE_AVATAR_DOMAINS.some(d => rawAvatar.startsWith(d))) {
    return rawAvatar.substring(0, 400);
  }

  // Case 2: Fetch from Roblox Thumbnails API
  const uid = String(userId || '').trim();
  if (!uid || !/^\d{1,20}$/.test(uid) || uid === '0') return '';

  try {
    const apiUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${uid}&size=150x150&format=Png&isCircular=false`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return '';
    const json = await res.json().catch(() => null);
    const imageUrl = json?.data?.[0]?.imageUrl || '';
    if (imageUrl && SAFE_AVATAR_DOMAINS.some(d => imageUrl.startsWith(d))) {
      return imageUrl.substring(0, 400);
    }
  } catch (err) {
    console.warn('[report] Avatar fetch failed for uid', uid, '—', err.message);
  }

  return '';
}

// ─── EMAIL TEMPLATES ──────────────────────────────────────────────────────────

/** Shared inline CSS snippets */
const FONT_MONO  = "'Courier New', Courier, monospace";
const FONT_SANS  = 'Arial, Helvetica, sans-serif';

/** Build the avatar block for email (table-based for Gmail compat). */
function buildAvatarBlock(avatarUrl, displayName, size = 80) {
  const initial = (displayName || '?').charAt(0).toUpperCase();
  const half    = Math.round(size / 2);
  if (avatarUrl) {
    return `
      <table cellpadding="0" cellspacing="0" border="0" align="center"
             style="margin:0 auto 14px;">
        <tr>
          <td width="${size + 6}" height="${size + 6}" align="center" valign="middle"
              style="width:${size + 6}px;height:${size + 6}px;
                     border-radius:${half + 3}px;
                     background:linear-gradient(135deg,#7c3aed,#00c8e0);
                     padding:3px;">
            <img src="${avatarUrl}"
                 width="${size}" height="${size}"
                 alt="@${displayName}"
                 style="display:block;width:${size}px;height:${size}px;
                        border-radius:${half}px;border:0;" />
          </td>
        </tr>
      </table>`;
  }
  return `
    <table cellpadding="0" cellspacing="0" border="0" align="center"
           style="margin:0 auto 14px;">
      <tr>
        <td width="${size}" height="${size}" align="center" valign="middle"
            style="width:${size}px;height:${size}px;
                   border-radius:${half}px;
                   background:linear-gradient(135deg,#1a1a40,#0f3060);
                   border:3px solid #00a8c0;
                   font-size:${Math.round(size * 0.35)}px;
                   font-weight:700;color:#ffffff;
                   font-family:${FONT_SANS};text-align:center;">
          ${initial}
        </td>
      </tr>
    </table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  NOTIFICATION EMAIL — sent to admin on new report / payment
// ─────────────────────────────────────────────────────────────────────────────
function buildNotificationEmail(report) {
  const isPayment     = report.type === 'payment';
  const displayName   = esc(report.from, 50);
  const rawMsg        = sanStr(String(report.message || ''), 2000);
  const displayMsg    = esc(rawMsg, 2000).replace(/\n/g, '<br>');
  const formattedTime = formatTime(report.time);
  const plan          = sanStr((report.plan || 'free').toLowerCase(), 20);
  const ps            = PLAN_STYLE[plan] || PLAN_STYLE.free;
  const avatarUrl     = report.avatar || '';

  const avatarBlock   = buildAvatarBlock(avatarUrl, displayName, 80);

  // ── Payment Detail Section ──────────────────────────────────────
  const paymentSection = isPayment ? `
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="margin-bottom:18px;background-color:#060d1e;
                  border:1px solid #0a3a1a;border-radius:10px;overflow:hidden;">
      <tr>
        <td colspan="2" height="3"
            style="background-color:#00a866;font-size:0;line-height:0;">&nbsp;</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:14px 20px 8px;">
          <p style="margin:0;font-family:${FONT_MONO};font-size:10px;
                    font-weight:700;color:#00c87a;letter-spacing:3px;
                    text-transform:uppercase;">
            💳 PAYMENT DETAILS
          </p>
        </td>
      </tr>

      <!-- PACKAGE -->
      <tr>
        <td style="padding:10px 20px;font-family:${FONT_MONO};font-size:10px;
                   color:#3a5a7a;width:110px;border-bottom:1px solid #0a1e2a;">
          PACKAGE
        </td>
        <td style="padding:10px 20px 10px 0;font-family:${FONT_SANS};font-size:13px;
                   color:#ffffff;font-weight:700;border-bottom:1px solid #0a1e2a;">
          ${esc(report.paymentPack || '-', 80)}
        </td>
      </tr>

      <!-- CREDITS -->
      <tr>
        <td style="padding:10px 20px;font-family:${FONT_MONO};font-size:10px;
                   color:#3a5a7a;border-bottom:1px solid #0a1e2a;">
          CREDITS
        </td>
        <td style="padding:10px 20px 10px 0;font-family:${FONT_MONO};font-size:20px;
                   color:#d4a017;font-weight:700;border-bottom:1px solid #0a1e2a;">
          ${esc(String(report.paymentCR ?? 0), 20)} CR
        </td>
      </tr>

      <!-- METHOD -->
      <tr>
        <td style="padding:10px 20px;font-family:${FONT_MONO};font-size:10px;
                   color:#3a5a7a;border-bottom:1px solid #0a1e2a;">
          METHOD
        </td>
        <td style="padding:10px 20px 10px 0;font-family:${FONT_SANS};font-size:12px;
                   color:#00c8e0;font-weight:700;text-transform:uppercase;
                   letter-spacing:1px;border-bottom:1px solid #0a1e2a;">
          ${esc((report.paymentMethod || 'UNKNOWN').toUpperCase(), 20)}
        </td>
      </tr>

      ${report.transactionId ? `
      <!-- TRANSACTION ID -->
      <tr>
        <td style="padding:10px 20px;font-family:${FONT_MONO};font-size:10px;
                   color:#3a5a7a;border-bottom:1px solid #0a1e2a;">
          TXN ID
        </td>
        <td style="padding:10px 20px 10px 0;font-family:${FONT_MONO};font-size:10px;
                   color:#4a6a8a;word-break:break-all;border-bottom:1px solid #0a1e2a;">
          ${esc(report.transactionId, 80)}
        </td>
      </tr>` : ''}

      <!-- TOTAL -->
      <tr>
        <td style="padding:14px 20px;font-family:${FONT_SANS};font-size:12px;
                   color:#ffffff;font-weight:700;letter-spacing:1px;">
          TOTAL PAID
        </td>
        <td style="padding:14px 20px 14px 0;font-family:${FONT_MONO};font-size:22px;
                   color:#00c87a;font-weight:700;">
          ${esc(report.paymentTotal || '-', 30)}
        </td>
      </tr>

      <!-- ACTION REQUIRED -->
      <tr>
        <td colspan="2" style="padding:0 16px 16px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="background-color:#1a1200;border:1px solid #3a2a00;border-radius:8px;">
            <tr>
              <td style="padding:14px 16px;">
                <p style="margin:0 0 8px;font-family:${FONT_SANS};font-size:10px;
                          font-weight:700;color:#d4a017;letter-spacing:2px;
                          text-transform:uppercase;">
                  ⚡ ACTION REQUIRED
                </p>
                <p style="margin:0;font-family:${FONT_SANS};font-size:12px;
                          color:#b8cce8;line-height:1.7;">
                  Add
                  <strong style="color:#d4a017;font-size:15px;">
                    ${esc(String(report.paymentCR ?? 0), 20)} CR
                  </strong>
                  to account
                  <strong style="color:#ffffff;">@${displayName}</strong>
                  <span style="color:#3a5a7a;">(UID: ${esc(report.userId || '-', 30)})</span>
                  after verifying the transfer.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>` : `

    <!-- Bug Report Meta Badges -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="margin-bottom:18px;">
      <tr>
        <td style="padding-right:8px;width:50%;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="background-color:#160808;border:1px solid #3a1010;border-radius:8px;">
            <tr>
              <td style="padding:12px 16px;">
                <p style="margin:0 0 5px;font-family:${FONT_MONO};font-size:9px;
                          color:#cc4444;letter-spacing:2px;text-transform:uppercase;">
                  TYPE
                </p>
                <p style="margin:0;font-family:${FONT_SANS};font-size:13px;
                          color:#ffffff;font-weight:700;">Bug Report</p>
              </td>
            </tr>
          </table>
        </td>
        <td style="padding-left:8px;width:50%;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="background-color:#060d1e;border:1px solid #0a2040;border-radius:8px;">
            <tr>
              <td style="padding:12px 16px;">
                <p style="margin:0 0 5px;font-family:${FONT_MONO};font-size:9px;
                          color:#00c8e0;letter-spacing:2px;text-transform:uppercase;">
                  STATUS
                </p>
                <p style="margin:0;font-family:${FONT_SANS};font-size:13px;
                          color:#ffffff;font-weight:700;">Open</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>NEXUS AI — ${isPayment ? 'New Payment' : 'New Bug Report'}</title>
</head>
<body style="margin:0;padding:0;background-color:#030312;">

<table cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background-color:#030312;">
<tr><td align="center" style="padding:28px 12px;">

  <table cellpadding="0" cellspacing="0" border="0" width="600"
         style="max-width:600px;width:100%;">

    <!-- HEADER -->
    <tr><td>
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="background-color:#0b0c24;border:1px solid #1a2a4a;
                    border-radius:14px 14px 0 0;overflow:hidden;">
        <!-- Tricolor top bar -->
        <tr>
          <td height="3" style="background-color:#7c3aed;font-size:0;width:34%;">&nbsp;</td>
          <td height="3" style="background-color:#00c8e0;font-size:0;width:33%;">&nbsp;</td>
          <td height="3" style="background-color:#00c87a;font-size:0;width:33%;">&nbsp;</td>
        </tr>
        <tr>
          <td colspan="3" align="center" style="padding:28px 28px 8px;">
            <p style="margin:0 0 4px;font-family:${FONT_MONO};font-size:10px;
                      font-weight:700;color:#7c3aed;letter-spacing:5px;
                      text-transform:uppercase;">
              ◆ NEXUS STUDIO ◆
            </p>
            <p style="margin:0;font-family:${FONT_MONO};font-size:30px;
                      font-weight:900;letter-spacing:5px;color:#00c8e0;">
              NEXUS AI
            </p>
          </td>
        </tr>
        <tr>
          <td colspan="3" align="center" style="padding:0 28px 26px;">
            <table cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td style="background-color:${isPayment ? '#003820' : '#001830'};
                           color:${isPayment ? '#00e890' : '#00c8e0'};
                           border:1px solid ${isPayment ? '#006040' : '#005070'};
                           border-radius:20px;padding:5px 18px;
                           font-family:${FONT_SANS};font-size:10px;font-weight:700;
                           letter-spacing:2px;text-transform:uppercase;">
                  ${isPayment ? '💳 NEW PAYMENT' : '📩 NEW REPORT'}
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
          <td align="center" style="padding:24px 20px 22px;">
            ${avatarBlock}
            <p style="margin:0 0 3px;font-family:${FONT_SANS};font-size:18px;
                      font-weight:700;color:#ffffff;letter-spacing:1px;">
              @${displayName}
            </p>
            <p style="margin:0 0 16px;font-family:${FONT_MONO};font-size:10px;
                      color:#3a5a7a;letter-spacing:1px;">
              ROBLOX UID:&nbsp;
              <span style="color:#5a7aaa;">${esc(report.userId || '-', 30)}</span>
            </p>
            <!-- Plan & Credits badges -->
            <table cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td style="background-color:#1e1400;color:#d4a017;
                           border:1px solid #3a2a00;border-radius:20px;
                           padding:4px 14px;font-family:${FONT_MONO};
                           font-size:11px;font-weight:700;letter-spacing:1px;">
                  ◆ ${esc(String(report.credits ?? 0), 20)} CR
                </td>
                <td width="8">&nbsp;</td>
                <td style="background-color:${ps.bg};color:${ps.text};
                           border:1px solid ${ps.border};border-radius:20px;
                           padding:4px 14px;font-family:${FONT_SANS};
                           font-size:11px;font-weight:700;letter-spacing:1px;
                           text-transform:uppercase;">
                  ${esc(plan, 20)} PLAN
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- PAYMENT / BUG SECTION -->
      ${paymentSection}

      <!-- MESSAGE BOX -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="margin-bottom:18px;background-color:#060818;
                    border:1px solid #0e1e3a;border-radius:10px;overflow:hidden;">
        <tr>
          <td width="4" style="background-color:#00c8e0;font-size:0;">&nbsp;</td>
          <td style="padding:18px 18px 18px 16px;">
            <p style="margin:0 0 12px;font-family:${FONT_MONO};font-size:9px;
                      font-weight:700;color:#00c8e0;letter-spacing:3px;
                      text-transform:uppercase;">
              ${isPayment ? '📋 TRANSFER NOTES' : '💬 REPORT MESSAGE'}
            </p>
            <p style="margin:0;font-family:${FONT_SANS};font-size:13px;
                      color:#b0c8e8;line-height:1.8;">
              ${displayMsg ||
                '<span style="color:#3a5a7a;font-style:italic;">No message provided.</span>'}
            </p>
          </td>
        </tr>
      </table>

      <!-- META INFO -->
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
                    Report ID
                  </p>
                  <p style="margin:0;font-family:${FONT_MONO};font-size:11px;
                            color:#4a6a9a;">
                    #${esc(report.id || '-', 40)}
                  </p>
                </td>
                <td align="right">
                  <p style="margin:0 0 3px;font-family:${FONT_MONO};font-size:9px;
                            color:#1e3050;letter-spacing:1px;text-transform:uppercase;">
                    Submitted
                  </p>
                  <p style="margin:0;font-family:${FONT_MONO};font-size:11px;
                            color:#4a6a9a;">
                    ${formattedTime}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${isPayment ? `
        <tr>
          <td style="padding:12px 18px;">
            <p style="margin:0 0 3px;font-family:${FONT_MONO};font-size:9px;
                      color:#1e3050;letter-spacing:1px;text-transform:uppercase;">
              Payment Status
            </p>
            <p style="margin:0;font-family:${FONT_SANS};font-size:12px;
                      font-weight:700;color:#d4a017;letter-spacing:1px;
                      text-transform:uppercase;">
              ⏳ AWAITING CONFIRMATION
            </p>
          </td>
        </tr>` : ''}
      </table>

    </td></tr>

    <!-- FOOTER -->
    <tr><td style="background-color:#03040e;border:1px solid #0f1830;
                   border-top:none;border-radius:0 0 14px 14px;padding:20px 24px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="margin-bottom:14px;">
        <tr>
          <td height="1" style="background-color:#7c3aed;font-size:0;width:33%;">&nbsp;</td>
          <td height="1" style="background-color:#00c8e0;font-size:0;width:34%;">&nbsp;</td>
          <td height="1" style="background-color:#00c87a;font-size:0;width:33%;">&nbsp;</td>
        </tr>
      </table>
      <p style="margin:0 0 5px;text-align:center;font-family:${FONT_MONO};font-size:9px;
                color:#1e2a4a;letter-spacing:3px;text-transform:uppercase;">
        NEXUS AI &nbsp;&middot;&nbsp; NEXUS STUDIO
      </p>
      <p style="margin:0;text-align:center;font-family:${FONT_SANS};font-size:10px;
                color:#141e30;line-height:1.5;">
        Automated system email — do not reply to this email.
      </p>
    </td></tr>

  </table>
</td></tr>
</table>

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIRMATION EMAIL — sent after confirm / reject action
// ─────────────────────────────────────────────────────────────────────────────
function buildConfirmationEmail(report, action, adminNote) {
  const isConfirmed  = action === 'confirm';
  const displayName  = esc(report.from, 50);
  const accentColor  = isConfirmed ? '#00c87a' : '#ff4444';
  const accentBg     = isConfirmed ? '#002a14' : '#200808';
  const accentBorder = isConfirmed ? '#005a28' : '#500010';
  const avatarBlock  = buildAvatarBlock(report.avatar || '', displayName, 70);

  const noteSection = adminNote ? `
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background-color:#100820;border:1px solid #2a1a50;
                  border-radius:10px;margin-bottom:18px;overflow:hidden;">
      <tr>
        <td width="4" style="background-color:#7c3aed;font-size:0;">&nbsp;</td>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 6px;font-family:${FONT_MONO};font-size:9px;
                    color:#7c3aed;letter-spacing:2px;text-transform:uppercase;">
            📝 Admin Note
          </p>
          <p style="margin:0;font-family:${FONT_SANS};font-size:12px;
                    color:#c0c0e0;line-height:1.7;">
            ${esc(adminNote, 500)}
          </p>
        </td>
      </tr>
    </table>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>NEXUS AI — Payment ${isConfirmed ? 'Confirmed' : 'Rejected'}</title>
</head>
<body style="margin:0;padding:0;background-color:#030312;">

<table cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background-color:#030312;">
<tr><td align="center" style="padding:28px 12px;">

  <table cellpadding="0" cellspacing="0" border="0" width="560"
         style="max-width:560px;width:100%;">

    <!-- HEADER -->
    <tr><td>
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="background-color:#0b0c24;border:1px solid ${accentBorder};
                    border-radius:14px 14px 0 0;overflow:hidden;">
        <tr>
          <td height="3"
              style="background-color:${accentColor};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 28px 24px;">
            ${avatarBlock}
            <p style="margin:0 0 8px;font-family:${FONT_MONO};font-size:26px;
                      font-weight:900;letter-spacing:5px;color:#00c8e0;">
              NEXUS AI
            </p>
            <p style="margin:0 0 12px;font-family:${FONT_SANS};font-size:32px;">
              ${isConfirmed ? '✅' : '❌'}
            </p>
            <table cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td style="background-color:${accentBg};color:${accentColor};
                           border:1px solid ${accentBorder};border-radius:20px;
                           padding:5px 18px;font-family:${FONT_SANS};font-size:11px;
                           font-weight:700;letter-spacing:2px;text-transform:uppercase;">
                  PAYMENT ${isConfirmed ? 'CONFIRMED' : 'REJECTED'}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- BODY -->
    <tr><td style="background-color:#07081e;border-left:1px solid #1a2a4a;
                   border-right:1px solid #1a2a4a;padding:24px;">

      <p style="margin:0 0 18px;font-family:${FONT_SANS};font-size:14px;
                color:#b0c8e8;line-height:1.8;">
        Hello <strong style="color:#ffffff;">@${displayName}</strong>,<br><br>
        ${isConfirmed
          ? `Your payment has been <strong style="color:#00c87a;">verified and confirmed</strong>.
             <strong style="color:#d4a017;">${esc(String(report.paymentCR ?? 0), 20)} CR</strong>
             has been added to your account. Thank you! 🎉`
          : `We're sorry — your payment submission <strong style="color:#ff4444;">
             could not be processed</strong>. Please contact an admin on Discord
             or resubmit with correct proof of transfer.`}
      </p>

      <!-- TRANSACTION SUMMARY -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="background-color:#04050f;border:1px solid #0a0f20;
                    border-radius:10px;margin-bottom:18px;overflow:hidden;">
        <tr>
          <td colspan="2" style="padding:12px 16px 6px;">
            <p style="margin:0;font-family:${FONT_MONO};font-size:9px;color:#1e3050;
                      letter-spacing:2px;text-transform:uppercase;">
              Transaction Summary
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:9px 16px;font-family:${FONT_SANS};font-size:11px;
                     color:#3a5a7a;width:130px;border-bottom:1px solid #0a0f1e;">Package</td>
          <td style="padding:9px 0;font-family:${FONT_SANS};font-size:12px;
                     color:#ffffff;font-weight:600;border-bottom:1px solid #0a0f1e;">
            ${esc(report.paymentPack || '-', 80)}
          </td>
        </tr>
        <tr>
          <td style="padding:9px 16px;font-family:${FONT_SANS};font-size:11px;
                     color:#3a5a7a;border-bottom:1px solid #0a0f1e;">Credits</td>
          <td style="padding:9px 0;font-family:${FONT_MONO};font-size:15px;
                     color:#d4a017;font-weight:700;border-bottom:1px solid #0a0f1e;">
            ${esc(String(report.paymentCR ?? 0), 20)} CR
          </td>
        </tr>
        <tr>
          <td style="padding:9px 16px;font-family:${FONT_SANS};font-size:11px;
                     color:#3a5a7a;border-bottom:1px solid #0a0f1e;">Amount Paid</td>
          <td style="padding:9px 0;font-family:${FONT_MONO};font-size:15px;
                     color:#00c87a;font-weight:700;border-bottom:1px solid #0a0f1e;">
            ${esc(report.paymentTotal || '-', 30)}
          </td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-family:${FONT_SANS};
                     font-size:11px;color:#3a5a7a;">Status</td>
          <td style="padding:11px 0;font-family:${FONT_SANS};font-size:12px;
                     font-weight:700;color:${accentColor};
                     letter-spacing:1px;text-transform:uppercase;">
            ${isConfirmed ? '✅ CONFIRMED' : '❌ REJECTED'}
          </td>
        </tr>
      </table>

      ${noteSection}

    </td></tr>

    <!-- FOOTER -->
    <tr><td style="background-color:#03040e;border:1px solid #0f1830;
                   border-top:none;border-radius:0 0 14px 14px;padding:18px 24px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="margin-bottom:12px;">
        <tr>
          <td height="1" style="background-color:#7c3aed;font-size:0;width:33%;">&nbsp;</td>
          <td height="1" style="background-color:#00c8e0;font-size:0;width:34%;">&nbsp;</td>
          <td height="1" style="background-color:#00c87a;font-size:0;width:33%;">&nbsp;</td>
        </tr>
      </table>
      <p style="margin:0;text-align:center;font-family:${FONT_MONO};font-size:9px;
                color:#1e2a4a;letter-spacing:3px;text-transform:uppercase;">
        NEXUS AI &nbsp;&middot;&nbsp; NEXUS STUDIO
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
    console.warn('[report] RESEND_API_KEY not configured — email skipped.');
    return { ok: false, reason: 'no_resend_key' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
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
    if (!r.ok) {
      console.error('[report] Resend error:', r.status, data);
    }
    return { ok: r.ok, status: r.status, data };
  } catch (err) {
    console.error('[report] sendEmail exception:', err.message);
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

  // ═══════════════════════════════════════════════════════════════════
  // GET — Admin: list reports with optional filters & pagination
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Unauthorized. Admin token required.' });
    }
    if (!checkRateLimit(`rpt_get:${ip}`, 60)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please slow down.' });
    }

    let reports = loadReports();

    // Optional filters
    if (req.query.type)   reports = reports.filter(r => r.type === req.query.type);
    if (req.query.id)     reports = reports.filter(r => r.id   === req.query.id);
    if (req.query.status) reports = reports.filter(r => r.status === req.query.status);
    if (req.query.from) {
      const q = sanStr(req.query.from, 50).toLowerCase();
      reports  = reports.filter(r => (r.from || '').toLowerCase().includes(q));
    }

    // Pagination
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const start = (page - 1) * limit;

    return res.json({
      reports: reports.slice(start, start + limit),
      total:   reports.length,
      page,
      limit,
      pages:   Math.ceil(reports.length / limit) || 1,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // POST — Submit a bug report or payment (public, rate-limited)
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    if (!checkRateLimit(`rpt_post:${ip}`, 5)) {
      return res.status(429).json({
        error: 'Too many submissions. Please wait 1 minute and try again.',
      });
    }

    const body = req.body || {};

    // Required field validation
    if (!body.from || !body.message) {
      return res.status(400).json({ error: '`from` and `message` are required.' });
    }

    const cleanFrom = sanStr(String(body.from), 50).trim();
    if (!cleanFrom) {
      return res.status(400).json({ error: 'Invalid `from` field.' });
    }

    const reportType = body.type === 'payment' ? 'payment' : 'bug';

    // Payment-specific validation
    if (reportType === 'payment') {
      if (!body.paymentCR || !body.paymentTotal || !body.paymentMethod) {
        return res.status(400).json({
          error: 'Payment reports require: paymentCR, paymentTotal, paymentMethod.',
        });
      }
      const cr = parseFloat(body.paymentCR);
      if (isNaN(cr) || cr <= 0 || cr > 100_000) {
        return res.status(400).json({
          error: 'paymentCR must be a number between 1 and 100,000.',
        });
      }
    }

    // Sanitize userId
    const rawUserId   = sanStr(String(body.userId || '0'), 30).trim();
    const cleanUserId = /^\d{1,20}$/.test(rawUserId) ? rawUserId : '0';

    // Resolve avatar — async fetch from Roblox Thumbnails API
    let cleanAvatar = '';
    try {
      cleanAvatar = await resolveAvatar(String(body.avatar || ''), cleanUserId);
    } catch (_) {
      cleanAvatar = '';
    }

    // Build the report object
    const report = {
      id:            `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
      type:          reportType,
      from:          cleanFrom,
      userId:        cleanUserId,
      avatar:        cleanAvatar,
      message:       sanStr(String(body.message), 2000),
      plan:          sanStr(String(body.plan || 'free').toLowerCase(), 20),
      credits:       Math.max(0, parseFloat(body.credits) || 0),
      time:          body.time
                       ? sanStr(String(body.time), 40)
                       : new Date().toISOString(),
      savedAt:       Date.now(),
      paymentPack:   body.paymentPack   ? sanStr(String(body.paymentPack),   80) : null,
      paymentCR:     body.paymentCR
                       ? Math.max(0, parseFloat(body.paymentCR))
                       : null,
      paymentMethod: body.paymentMethod ? sanStr(String(body.paymentMethod), 20) : null,
      paymentTotal:  body.paymentTotal  ? sanStr(String(body.paymentTotal),  30) : null,
      transactionId: body.transactionId ? sanStr(String(body.transactionId), 80) : null,
      status:        reportType === 'payment' ? 'pending' : null,
      adminNote:     null,
      confirmedAt:   null,
    };

    // Persist
    const reports = loadReports();
    reports.unshift(report);
    const saved = saveReports(reports);
    if (!saved) {
      console.error('[report] Failed to persist report', report.id);
      // Still return success to client — don't expose internals
    }

    // Fire-and-forget email notification to admin
    sendEmail({
      to:      ADMIN_EMAIL,
      subject: reportType === 'payment'
        ? `[NEXUS] 💳 New Payment — @${cleanFrom} (${report.paymentCR} CR)`
        : `[NEXUS] 📩 New Bug Report — @${cleanFrom}`,
      html: buildNotificationEmail(report),
    }).then(result => {
      if (!result.ok) {
        console.warn('[report] Email delivery failed:', result.reason || result.error);
      }
    }).catch(e => console.error('[report] Email exception:', e.message));

    return res.status(201).json({
      status:  'ok',
      id:      report.id,
      type:    report.type,
      message: 'Report submitted successfully.',
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

    const body = req.body || {};
    const { id, action, adminNote } = body;

    if (!id)     return res.status(400).json({ error: '`id` is required.' });
    if (!action) return res.status(400).json({ error: '`action` is required: confirm or reject.' });
    if (!['confirm', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use "confirm" or "reject".' });
    }

    const safeId   = sanStr(String(id), 60);
    const safeNote = sanStr(String(adminNote || ''), 500);

    const reports = loadReports();
    const idx     = reports.findIndex(r => r.id === safeId);

    if (idx === -1) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    const report = reports[idx];

    if (report.status !== 'pending') {
      return res.status(409).json({
        error:         `Report already processed (status: ${report.status}).`,
        currentStatus: report.status,
      });
    }

    // ── CONFIRM ─────────────────────────────────────────────────────
    if (action === 'confirm') {
      // Attempt credit sync via /api/sync
      if (report.type === 'payment' && report.paymentCR) {
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
              target:        report.from,
              amount:        report.paymentCR,
              transactionId: report.transactionId || report.id,
            }),
            signal: AbortSignal.timeout(10_000),
          });

          if (!syncRes.ok) {
            const errData = await syncRes.json().catch(() => ({}));
            console.error('[report] Credit sync failed:', errData);
            return res.status(502).json({
              error:     'Credit sync failed. Retry or add credits manually.',
              syncError: errData,
            });
          }
        } catch (err) {
          console.error('[report] Sync request error:', err.message);
          return res.status(502).json({
            error: 'Cannot reach the sync server. Please try again.',
          });
        }
      }

      // Update record
      reports[idx] = {
        ...report,
        status:      'confirmed',
        adminNote:   safeNote,
        confirmedAt: new Date().toISOString(),
      };
      saveReports(reports);

      // Log confirmation email
      sendEmail({
        to:      ADMIN_EMAIL,
        subject: `[NEXUS] ✅ Payment Confirmed — @${report.from} (${report.paymentCR} CR)`,
        html:    buildConfirmationEmail(report, 'confirm', safeNote),
      }).catch(() => {});

      return res.json({
        success: true,
        message: `Payment confirmed. ${report.paymentCR} CR added to @${report.from}.`,
        report:  reports[idx],
      });
    }

    // ── REJECT ──────────────────────────────────────────────────────
    if (action === 'reject') {
      reports[idx] = {
        ...report,
        status:      'rejected',
        adminNote:   safeNote,
        confirmedAt: new Date().toISOString(),
      };
      saveReports(reports);

      // Log rejection email
      sendEmail({
        to:      ADMIN_EMAIL,
        subject: `[NEXUS] ❌ Payment Rejected — @${report.from}`,
        html:    buildConfirmationEmail(report, 'reject', safeNote),
      }).catch(() => {});

      return res.json({
        success: true,
        message: `Payment rejected for @${report.from}.`,
        report:  reports[idx],
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

    const { id } = req.body || req.query || {};
    if (!id) return res.status(400).json({ error: '`id` is required.' });

    const safeId   = sanStr(String(id), 60);
    const reports  = loadReports();
    const filtered = reports.filter(r => r.id !== safeId);

    if (filtered.length === reports.length) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    saveReports(filtered);
    return res.json({ success: true, message: `Report ${safeId} deleted successfully.` });
  }

  return res.status(405).json({ error: `Method ${req.method} is not allowed.` });
}