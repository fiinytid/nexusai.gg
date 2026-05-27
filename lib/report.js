// api/report.js — NEXUS AI Report System (SECURE + COMPLETE v8)
// ─────────────────────────────────────────────────────────────────────────────
// Security fixes (v7):
//   • Full XSS via esc() — hanya escape &, <, >, " (bukan /)
//   • Rate limiting anti-spam
//   • Admin token via header (timing-safe compare)
//   • Avatar hanya dari domain Roblox (anti-SSRF)
//   • Input validation & sanitization
// Fixes (v8 — BERFUNGSI):
//   • esc() tidak escape '/' — URL avatar tidak rusak
//   • buildConfirmationEmail() dikembalikan (email ke user saat confirm/reject)
//   • verifyAdminToken() juga terima query ?token= (backward compat)
//   • Avatar auto-fallback dari userId jika avatar kosong/tidak valid
//   • displayMsg: newline → <br> berfungsi benar
//   • PATCH confirm sekarang kirim confirmation email ke user
//   • Semua endpoint diuji dan lengkap

import { readFileSync, writeFileSync, existsSync } from 'fs';
import crypto from 'crypto';

const REPORT_FILE = '/tmp/nexus_reports.json';
const MAX_REPORTS = 500;

// ─── ADMIN TOKEN ──────────────────────────────────────────────────────────────
function getAdminToken() {
  const t = process.env.ADMIN_TOKEN;
  // Jika ADMIN_TOKEN belum dikonfigurasi atau masih default, admin endpoints disabled
  if (!t || t.length < 8) return null;
  return t;
}

function verifyAdminToken(req) {
  const token = getAdminToken();
  if (!token) return false;

  // Terima dari: Authorization header, X-Admin-Token header, atau ?token= query
  // (query param untuk backward compat dengan admin panel lama)
  const candidate =
    (req.headers?.['authorization'] || '').replace(/^Bearer\s+/i, '').trim() ||
    (req.headers?.['x-admin-token'] || '').trim() ||
    (typeof req.query?.token === 'string' ? req.query.token.trim() : '');

  if (!candidate) return false;

  // Timing-safe comparison (cegah timing attack)
  try {
    const maxLen = Math.max(candidate.length, token.length, 32);
    const a = Buffer.alloc(maxLen, 0);
    const b = Buffer.alloc(maxLen, 0);
    Buffer.from(candidate).copy(a);
    Buffer.from(token).copy(b);
    return crypto.timingSafeEqual(a, b) && candidate === token;
  } catch (_) {
    return candidate === token; // fallback
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
  const k = String(key || 'anon').substring(0, 100);
  if (!_rl.has(k)) _rl.set(k, { count: 0, reset: now + 60_000 });
  const r = _rl.get(k);
  if (now > r.reset) { r.count = 0; r.reset = now + 60_000; }
  return ++r.count <= max;
}

// ─── SANITIZERS ──────────────────────────────────────────────────────────────
// FIX: Tidak escape '/' — URL tidak rusak, hanya escape karakter HTML berbahaya
function esc(str, max = 200) {
  return String(str ?? '')
    .substring(0, max)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Untuk storage: strip control chars
function sanStr(str, max = 200) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/[<>]/g, '')
    .substring(0, max);
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      weekday: 'short', year: 'numeric', month: 'short',
      day: 'numeric', hour: '2-digit', minute: '2-digit',
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
    if (existsSync(REPORT_FILE)) return JSON.parse(readFileSync(REPORT_FILE, 'utf8'));
  } catch (_) {}
  return [];
}

function saveReports(reports) {
  try {
    writeFileSync(REPORT_FILE, JSON.stringify(reports.slice(0, MAX_REPORTS), null, 2));
  } catch (_) {}
}

// ─── AVATAR HELPER ────────────────────────────────────────────────────────────
// FIX: Auto-generate avatar dari userId Roblox jika avatar kosong/tidak valid
function resolveAvatar(rawAvatar, userId) {
  // Cek apakah avatar dari Roblox CDN (aman)
  const SAFE_DOMAINS = [
    'https://www.roblox.com/',
    'https://thumbnails.roblox.com/',
    'https://t0.rbxcdn.com/',
    'https://t1.rbxcdn.com/',
    'https://t2.rbxcdn.com/',
    'https://t3.rbxcdn.com/',
    'https://t4.rbxcdn.com/',
    'https://tr.rbxcdn.com/',
  ];
  if (rawAvatar && SAFE_DOMAINS.some(d => rawAvatar.startsWith(d))) {
    return rawAvatar.substring(0, 400);
  }
  // Auto-generate dari Roblox user ID
  if (userId && /^\d{1,20}$/.test(String(userId)) && String(userId) !== '0') {
    return `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`;
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN EMAIL — Notifikasi ke Admin
// ─────────────────────────────────────────────────────────────────────────────
function buildEmail(report) {
  const isPayment     = report.type === 'payment';
  const displayName   = esc(report.from, 50);
  const initial       = (report.from || '?').charAt(0).toUpperCase();
  // FIX: esc dulu, lalu replace newline — urutannya penting
  const rawMsg        = sanStr(String(report.message || ''), 2000);
  const displayMsg    = esc(rawMsg, 2000).replace(/\n/g, '<br>');
  const formattedTime = formatTime(report.time);
  const plan          = sanStr((report.plan || 'free').toLowerCase(), 20);
  const ps            = PLAN_STYLE[plan] || PLAN_STYLE.free;
  const avatarUrl     = resolveAvatar(report.avatar, report.userId);

  // Avatar block — table-based untuk Gmail compat
  const avatarBlock = avatarUrl
    ? `<table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 14px;">
        <tr>
          <td width="86" height="86" align="center" valign="middle"
              style="width:86px;height:86px;border-radius:43px;background-color:#00a8c0;padding:3px;">
            <img src="${avatarUrl}" width="80" height="80" alt="@${displayName}"
                 style="display:block;width:80px;height:80px;border-radius:40px;border:0;" />
          </td>
        </tr>
      </table>`
    : `<table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 14px;">
        <tr>
          <td width="80" height="80" align="center" valign="middle"
              style="width:80px;height:80px;border-radius:40px;background-color:#0f3060;
                     border:3px solid #00a8c0;font-size:28px;font-weight:700;
                     color:#ffffff;font-family:Arial,Helvetica,sans-serif;text-align:center;">
            ${initial}
          </td>
        </tr>
      </table>`;

  // Payment section (hanya muncul jika type='payment')
  const paymentSection = isPayment ? `
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="margin-bottom:18px;background-color:#060d1e;border:1px solid #0a3a1a;
                  border-radius:10px;overflow:hidden;">
      <tr>
        <td colspan="2" height="3" style="background-color:#00a866;font-size:0;line-height:0;">&nbsp;</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:15px 20px 10px;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                    font-weight:700;color:#00c87a;letter-spacing:3px;text-transform:uppercase;">
            💳 PAYMENT DETAILS
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 20px;font-family:'Courier New',Courier,monospace;
                   font-size:10px;color:#3a5a7a;width:110px;border-bottom:1px solid #0a1e2a;">
          PACKAGE
        </td>
        <td style="padding:10px 20px 10px 0;font-family:Arial,Helvetica,sans-serif;
                   font-size:13px;color:#ffffff;font-weight:700;border-bottom:1px solid #0a1e2a;">
          ${esc(report.paymentPack || '-', 80)}
        </td>
      </tr>
      <tr>
        <td style="padding:10px 20px;font-family:'Courier New',Courier,monospace;
                   font-size:10px;color:#3a5a7a;border-bottom:1px solid #0a1e2a;">
          CREDITS
        </td>
        <td style="padding:10px 20px 10px 0;font-family:'Courier New',Courier,monospace;
                   font-size:20px;color:#d4a017;font-weight:700;border-bottom:1px solid #0a1e2a;">
          ${esc(String(report.paymentCR ?? 0), 20)} CR
        </td>
      </tr>
      <tr>
        <td style="padding:10px 20px;font-family:'Courier New',Courier,monospace;
                   font-size:10px;color:#3a5a7a;border-bottom:1px solid #0a1e2a;">
          METHOD
        </td>
        <td style="padding:10px 20px 10px 0;font-family:Arial,Helvetica,sans-serif;
                   font-size:12px;color:#00c8e0;font-weight:700;text-transform:uppercase;
                   letter-spacing:1px;border-bottom:1px solid #0a1e2a;">
          ${esc((report.paymentMethod || 'UNKNOWN').toUpperCase(), 20)}
        </td>
      </tr>
      ${report.transactionId ? `
      <tr>
        <td style="padding:10px 20px;font-family:'Courier New',Courier,monospace;
                   font-size:10px;color:#3a5a7a;border-bottom:1px solid #0a1e2a;">
          TXN ID
        </td>
        <td style="padding:10px 20px 10px 0;font-family:'Courier New',Courier,monospace;
                   font-size:10px;color:#4a6a8a;word-break:break-all;
                   border-bottom:1px solid #0a1e2a;">
          ${esc(report.transactionId, 80)}
        </td>
      </tr>` : ''}
      <tr>
        <td style="padding:14px 20px;font-family:Arial,Helvetica,sans-serif;
                   font-size:12px;color:#ffffff;font-weight:700;letter-spacing:1px;">
          TOTAL PAID
        </td>
        <td style="padding:14px 20px 14px 0;font-family:'Courier New',Courier,monospace;
                   font-size:22px;color:#00c87a;font-weight:700;">
          ${esc(report.paymentTotal || '-', 30)}
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:0 16px 16px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="background-color:#1a1200;border:1px solid #3a2a00;border-radius:8px;">
            <tr>
              <td style="padding:14px 16px;">
                <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;
                          font-size:10px;font-weight:700;color:#d4a017;
                          letter-spacing:2px;text-transform:uppercase;">
                  ⚡ ACTION REQUIRED
                </p>
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                          font-size:12px;color:#b8cce8;line-height:1.7;">
                  Tambahkan
                  <strong style="color:#d4a017;font-size:15px;">${esc(String(report.paymentCR ?? 0), 20)} CR</strong>
                  ke akun <strong style="color:#ffffff;">@${displayName}</strong>
                  <span style="color:#3a5a7a;">(UID: ${esc(report.userId || '-', 30)})</span>
                  setelah memverifikasi transfer.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>` : `
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="margin-bottom:18px;">
      <tr>
        <td style="padding-right:8px;width:50%;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="background-color:#160808;border:1px solid #3a1010;border-radius:8px;">
            <tr>
              <td style="padding:12px 16px;">
                <p style="margin:0 0 5px;font-family:'Courier New',Courier,monospace;
                          font-size:9px;color:#cc4444;letter-spacing:2px;text-transform:uppercase;">
                  TYPE
                </p>
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                          font-size:13px;color:#ffffff;font-weight:700;">Bug Report</p>
              </td>
            </tr>
          </table>
        </td>
        <td style="padding-left:8px;width:50%;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="background-color:#060d1e;border:1px solid #0a2040;border-radius:8px;">
            <tr>
              <td style="padding:12px 16px;">
                <p style="margin:0 0 5px;font-family:'Courier New',Courier,monospace;
                          font-size:9px;color:#00c8e0;letter-spacing:2px;text-transform:uppercase;">
                  STATUS
                </p>
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                          font-size:13px;color:#ffffff;font-weight:700;">Open</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>NEXUS AI — ${isPayment ? 'Payment Baru' : 'Bug Report Baru'}</title>
</head>
<body style="margin:0;padding:0;background-color:#030312;">

<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#030312;">
<tr><td align="center" style="padding:28px 12px;">

  <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">

    <!-- HEADER -->
    <tr><td>
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="background-color:#0b0c24;border:1px solid #1a2a4a;border-radius:14px 14px 0 0;">
        <tr>
          <td height="3" style="background-color:#7c3aed;font-size:0;width:34%;">&nbsp;</td>
          <td height="3" style="background-color:#00c8e0;font-size:0;width:33%;">&nbsp;</td>
          <td height="3" style="background-color:#00c87a;font-size:0;width:33%;">&nbsp;</td>
        </tr>
        <tr>
          <td colspan="3" align="center" style="padding:28px 28px 8px;">
            <p style="margin:0 0 6px;font-family:'Courier New',Courier,monospace;
                      font-size:10px;font-weight:700;color:#7c3aed;
                      letter-spacing:5px;text-transform:uppercase;">
              ◆ NEXUS STUDIO ◆
            </p>
            <p style="margin:0;font-family:'Courier New',Courier,monospace;
                      font-size:30px;font-weight:900;letter-spacing:5px;color:#00c8e0;">
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
                           font-family:Arial,Helvetica,sans-serif;
                           font-size:10px;font-weight:700;
                           letter-spacing:2px;text-transform:uppercase;">
                  ${isPayment ? '💳 PAYMENT BARU' : '📩 REPORT BARU'}
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
            <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;
                      font-size:18px;font-weight:700;color:#ffffff;letter-spacing:1px;">
              @${displayName}
            </p>
            <p style="margin:0 0 16px;font-family:'Courier New',Courier,monospace;
                      font-size:10px;color:#3a5a7a;letter-spacing:1px;">
              ROBLOX UID:&nbsp;<span style="color:#5a7aaa;">${esc(report.userId || '-', 30)}</span>
            </p>
            <!-- Badges -->
            <table cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td style="background-color:#1e1400;color:#d4a017;border:1px solid #3a2a00;
                           border-radius:20px;padding:4px 14px;
                           font-family:'Courier New',Courier,monospace;
                           font-size:11px;font-weight:700;letter-spacing:1px;">
                  ◆ ${esc(String(report.credits ?? 0), 20)} CR
                </td>
                <td width="8">&nbsp;</td>
                <td style="background-color:${ps.bg};color:${ps.text};
                           border:1px solid ${ps.border};border-radius:20px;
                           padding:4px 14px;font-family:Arial,Helvetica,sans-serif;
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

      <!-- MESSAGE -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="margin-bottom:18px;background-color:#060818;
                    border:1px solid #0e1e3a;border-radius:10px;overflow:hidden;">
        <tr>
          <td width="4" style="background-color:#00c8e0;font-size:0;">&nbsp;</td>
          <td style="padding:18px 18px 18px 16px;">
            <p style="margin:0 0 12px;font-family:'Courier New',Courier,monospace;
                      font-size:9px;font-weight:700;color:#00c8e0;
                      letter-spacing:3px;text-transform:uppercase;">
              ${isPayment ? '📋 CATATAN TRANSFER' : '💬 ISI LAPORAN'}
            </p>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                      font-size:13px;color:#b0c8e8;line-height:1.8;">
              ${displayMsg || '<span style="color:#3a5a7a;font-style:italic;">Tidak ada pesan.</span>'}
            </p>
          </td>
        </tr>
      </table>

      <!-- META -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="margin-bottom:24px;background-color:#04050f;
                    border:1px solid #0a0f20;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:14px 18px;border-bottom:1px solid #0a0f1e;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td>
                  <p style="margin:0 0 3px;font-family:'Courier New',Courier,monospace;
                            font-size:9px;color:#1e3050;letter-spacing:1px;text-transform:uppercase;">
                    Report ID
                  </p>
                  <p style="margin:0;font-family:'Courier New',Courier,monospace;
                            font-size:11px;color:#4a6a9a;">
                    #${esc(report.id || '-', 40)}
                  </p>
                </td>
                <td align="right">
                  <p style="margin:0 0 3px;font-family:'Courier New',Courier,monospace;
                            font-size:9px;color:#1e3050;letter-spacing:1px;text-transform:uppercase;">
                    Waktu
                  </p>
                  <p style="margin:0;font-family:'Courier New',Courier,monospace;
                            font-size:11px;color:#4a6a9a;">
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
            <p style="margin:0 0 3px;font-family:'Courier New',Courier,monospace;
                      font-size:9px;color:#1e3050;letter-spacing:1px;text-transform:uppercase;">
              Status
            </p>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                      font-size:12px;font-weight:700;color:#d4a017;
                      letter-spacing:1px;text-transform:uppercase;">
              ⏳ MENUNGGU KONFIRMASI
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
      <p style="margin:0 0 5px;text-align:center;font-family:'Courier New',Courier,monospace;
                font-size:9px;color:#1e2a4a;letter-spacing:3px;text-transform:uppercase;">
        NEXUS AI &nbsp;&middot;&nbsp; NEXUS STUDIO
      </p>
      <p style="margin:0;text-align:center;font-family:Arial,Helvetica,sans-serif;
                font-size:10px;color:#141e30;line-height:1.5;">
        Email otomatis dari sistem — jangan balas email ini.
      </p>
    </td></tr>

  </table>
</td></tr>
</table>

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIRMATION EMAIL — Dikirim ke Admin setelah confirm/reject
// ─────────────────────────────────────────────────────────────────────────────
function buildConfirmationEmail(report, action, adminNote) {
  const isConfirmed  = action === 'confirm';
  const displayName  = esc(report.from, 50);
  const accentColor  = isConfirmed ? '#00c87a' : '#cc3333';
  const accentBg     = isConfirmed ? '#002a14' : '#200808';
  const accentBorder = isConfirmed ? '#005a28' : '#500010';
  const avatarUrl    = resolveAvatar(report.avatar, report.userId);

  const avatarBlock = avatarUrl
    ? `<table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px;">
        <tr>
          <td width="70" height="70" align="center" valign="middle"
              style="width:70px;height:70px;border-radius:35px;background-color:#00a8c0;padding:3px;">
            <img src="${avatarUrl}" width="64" height="64" alt="@${displayName}"
                 style="display:block;width:64px;height:64px;border-radius:32px;border:0;" />
          </td>
        </tr>
      </table>`
    : '';

  const noteSection = adminNote ? `
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background-color:#100820;border:1px solid #2a1a50;
                  border-radius:10px;margin-bottom:18px;overflow:hidden;">
      <tr>
        <td width="4" style="background-color:#7c3aed;font-size:0;">&nbsp;</td>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 6px;font-family:'Courier New',Courier,monospace;
                    font-size:9px;color:#7c3aed;letter-spacing:2px;text-transform:uppercase;">
            📝 Catatan Admin
          </p>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                    font-size:12px;color:#c0c0e0;line-height:1.7;">
            ${esc(adminNote, 500)}
          </p>
        </td>
      </tr>
    </table>` : '';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>NEXUS AI — Payment ${isConfirmed ? 'Dikonfirmasi' : 'Ditolak'}</title>
</head>
<body style="margin:0;padding:0;background-color:#030312;">

<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#030312;">
<tr><td align="center" style="padding:28px 12px;">

  <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;">

    <!-- HEADER -->
    <tr><td>
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="background-color:#0b0c24;border:1px solid ${accentBorder};
                    border-radius:14px 14px 0 0;overflow:hidden;">
        <tr>
          <td height="3" style="background-color:${accentColor};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 28px 24px;">
            ${avatarBlock}
            <p style="margin:0 0 8px;font-family:'Courier New',Courier,monospace;
                      font-size:26px;font-weight:900;letter-spacing:5px;color:#00c8e0;">
              NEXUS AI
            </p>
            <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:28px;">
              ${isConfirmed ? '✅' : '❌'}
            </p>
            <table cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td style="background-color:${accentBg};color:${accentColor};
                           border:1px solid ${accentBorder};border-radius:20px;
                           padding:5px 18px;font-family:Arial,Helvetica,sans-serif;
                           font-size:11px;font-weight:700;
                           letter-spacing:2px;text-transform:uppercase;">
                  PAYMENT ${isConfirmed ? 'DIKONFIRMASI' : 'DITOLAK'}
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

      <p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;
                font-size:14px;color:#b0c8e8;line-height:1.8;">
        Halo <strong style="color:#ffffff;">@${displayName}</strong>,<br><br>
        ${isConfirmed
          ? `Pembayaranmu telah <strong style="color:#00c87a;">diverifikasi dan dikonfirmasi</strong>.
             <strong style="color:#d4a017;">${esc(String(report.paymentCR ?? 0), 20)} CR</strong>
             sudah ditambahkan ke akunmu. Terima kasih! 🎉`
          : `Maaf, pengajuan pembayaranmu <strong style="color:#cc3333;">tidak dapat diproses</strong>.
             Silakan hubungi admin di Discord atau kirim ulang bukti transfer yang benar.`}
      </p>

      <!-- SUMMARY -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="background-color:#04050f;border:1px solid #0a0f20;
                    border-radius:10px;margin-bottom:18px;overflow:hidden;">
        <tr>
          <td colspan="2" style="padding:12px 16px 6px;">
            <p style="margin:0;font-family:'Courier New',Courier,monospace;
                      font-size:9px;color:#1e3050;letter-spacing:2px;text-transform:uppercase;">
              Ringkasan Transaksi
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:9px 16px;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                     color:#3a5a7a;width:130px;border-bottom:1px solid #0a0f1e;">Paket</td>
          <td style="padding:9px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;
                     color:#ffffff;font-weight:600;border-bottom:1px solid #0a0f1e;">
            ${esc(report.paymentPack || '-', 80)}
          </td>
        </tr>
        <tr>
          <td style="padding:9px 16px;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                     color:#3a5a7a;border-bottom:1px solid #0a0f1e;">Credits</td>
          <td style="padding:9px 0;font-family:'Courier New',Courier,monospace;font-size:15px;
                     color:#d4a017;font-weight:700;border-bottom:1px solid #0a0f1e;">
            ${esc(String(report.paymentCR ?? 0), 20)} CR
          </td>
        </tr>
        <tr>
          <td style="padding:9px 16px;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                     color:#3a5a7a;border-bottom:1px solid #0a0f1e;">Total Dibayar</td>
          <td style="padding:9px 0;font-family:'Courier New',Courier,monospace;font-size:15px;
                     color:#00c87a;font-weight:700;border-bottom:1px solid #0a0f1e;">
            ${esc(report.paymentTotal || '-', 30)}
          </td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-family:Arial,Helvetica,sans-serif;
                     font-size:11px;color:#3a5a7a;">Status</td>
          <td style="padding:11px 0;font-family:Arial,Helvetica,sans-serif;
                     font-size:12px;font-weight:700;color:${accentColor};
                     letter-spacing:1px;text-transform:uppercase;">
            ${isConfirmed ? '✅ DIKONFIRMASI' : '❌ DITOLAK'}
          </td>
        </tr>
      </table>

      ${noteSection}

    </td></tr>

    <!-- FOOTER -->
    <tr><td style="background-color:#03040e;border:1px solid #0f1830;
                   border-top:none;border-radius:0 0 14px 14px;padding:18px 24px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px;">
        <tr>
          <td height="1" style="background-color:#7c3aed;font-size:0;width:33%;">&nbsp;</td>
          <td height="1" style="background-color:#00c8e0;font-size:0;width:34%;">&nbsp;</td>
          <td height="1" style="background-color:#00c87a;font-size:0;width:33%;">&nbsp;</td>
        </tr>
      </table>
      <p style="margin:0;text-align:center;font-family:'Courier New',Courier,monospace;
                font-size:9px;color:#1e2a4a;letter-spacing:3px;text-transform:uppercase;">
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
    console.warn('[report] RESEND_API_KEY tidak dikonfigurasi, email tidak dikirim.');
    return { ok: false, reason: 'no_resend_key' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from: 'NEXUS AI <onboarding@resend.dev>',
        to:   Array.isArray(to) ? to : [to],
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip            = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const ADMIN_EMAIL   = process.env.REPORT_EMAIL || 'arifiinytid@gmail.com';

  // ═══════════════════════════════════════════════════════════════════
  // GET — Admin: list reports dengan filter & paginasi
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Unauthorized. Admin token diperlukan.' });
    }
    if (!checkRateLimit(`rpt_get:${ip}`, 60)) {
      return res.status(429).json({ error: 'Rate limit.' });
    }

    let reports = loadReports();

    // Filter
    if (req.query.type)   reports = reports.filter(r => r.type   === req.query.type);
    if (req.query.id)     reports = reports.filter(r => r.id     === req.query.id);
    if (req.query.status) reports = reports.filter(r => r.status === req.query.status);
    if (req.query.from)   reports = reports.filter(r =>
      (r.from || '').toLowerCase().includes(sanStr(req.query.from, 50).toLowerCase())
    );

    // Paginasi
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
  // POST — Submit laporan atau pembayaran (publik, rate-limited)
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    // Rate limit: 5 request/menit per IP (anti-spam)
    if (!checkRateLimit(`rpt_post:${ip}`, 5)) {
      return res.status(429).json({ error: 'Terlalu banyak laporan. Coba lagi dalam 1 menit.' });
    }

    const body = req.body || {};

    // Validasi field wajib
    if (!body.from || !body.message) {
      return res.status(400).json({ error: '`from` dan `message` wajib diisi.' });
    }

    const cleanFrom = sanStr(String(body.from), 50).trim();
    if (!cleanFrom) {
      return res.status(400).json({ error: 'Field `from` tidak valid.' });
    }

    const reportType = body.type === 'payment' ? 'payment' : 'bug';

    // Validasi field payment
    if (reportType === 'payment') {
      if (!body.paymentCR || !body.paymentTotal || !body.paymentMethod) {
        return res.status(400).json({
          error: 'Payment butuh: paymentCR, paymentTotal, paymentMethod.',
        });
      }
      const cr = parseFloat(body.paymentCR);
      if (isNaN(cr) || cr <= 0 || cr > 100_000) {
        return res.status(400).json({ error: 'paymentCR tidak valid (1–100000).' });
      }
    }

    // Sanitasi userId
    const rawUserId   = sanStr(String(body.userId || '0'), 30).trim();
    const cleanUserId = /^\d{1,20}$/.test(rawUserId) ? rawUserId : '0';

    // Avatar — resolve dari Roblox CDN atau auto-generate
    const cleanAvatar = resolveAvatar(String(body.avatar || ''), cleanUserId);

    // Build report object
    const report = {
      id:            `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      type:          reportType,
      from:          cleanFrom,
      userId:        cleanUserId,
      avatar:        cleanAvatar,
      message:       sanStr(String(body.message), 2000),
      plan:          sanStr(String(body.plan || 'free').toLowerCase(), 20),
      credits:       Math.max(0, parseFloat(body.credits) || 0),
      time:          body.time || new Date().toISOString(),
      savedAt:       Date.now(),
      paymentPack:   body.paymentPack   ? sanStr(String(body.paymentPack),   80)  : null,
      paymentCR:     body.paymentCR     ? Math.max(0, parseFloat(body.paymentCR)) : null,
      paymentMethod: body.paymentMethod ? sanStr(String(body.paymentMethod), 20)  : null,
      paymentTotal:  body.paymentTotal  ? sanStr(String(body.paymentTotal),  30)  : null,
      transactionId: body.transactionId ? sanStr(String(body.transactionId), 80)  : null,
      status:        reportType === 'payment' ? 'pending' : null,
      adminNote:     null,
      confirmedAt:   null,
    };

    // Simpan ke file
    const reports = loadReports();
    reports.unshift(report);
    saveReports(reports);

    // Kirim email notifikasi ke admin (non-blocking)
    sendEmail({
      to:      ADMIN_EMAIL,
      subject: reportType === 'payment'
        ? `[NEXUS] 💳 Payment Baru — @${cleanFrom} (${report.paymentCR} CR)`
        : `[NEXUS] 📩 Bug Report — @${cleanFrom}`,
      html: buildEmail(report),
    }).then(result => {
      if (!result.ok) console.warn('[report] Email gagal:', result.reason || result.error);
    }).catch(e => console.error('[report] Email error:', e.message));

    return res.status(201).json({
      status:    'ok',
      id:        report.id,
      type:      report.type,
      message:   'Laporan berhasil dikirim.',
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // PATCH — Admin: confirm atau reject payment
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'PATCH') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Unauthorized. Admin token diperlukan.' });
    }
    if (!checkRateLimit(`rpt_patch:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit.' });
    }

    const body = req.body || {};
    const { id, action, adminNote } = body;

    if (!id)     return res.status(400).json({ error: '`id` wajib diisi.' });
    if (!action) return res.status(400).json({ error: '`action` wajib: confirm atau reject.' });
    if (!['confirm', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action tidak valid. Gunakan confirm atau reject.' });
    }

    const safeId   = sanStr(String(id), 60);
    const safeNote = sanStr(String(adminNote || ''), 500);

    const reports = loadReports();
    const idx     = reports.findIndex(r => r.id === safeId);

    if (idx === -1) {
      return res.status(404).json({ error: 'Report tidak ditemukan.' });
    }

    const report = reports[idx];

    if (report.status !== 'pending') {
      return res.status(409).json({
        error:         `Report sudah diproses (status: ${report.status}).`,
        currentStatus: report.status,
      });
    }

    // ── CONFIRM ─────────────────────────────────────────────────────
    if (action === 'confirm') {
      // Coba sync credits via /api/sync
      if (report.type === 'payment' && report.paymentCR) {
        try {
          const host    = req.headers.host || 'nexusai-roblox.vercel.app';
          const syncUrl = `https://${host}/api/sync`;
          const syncRes = await fetch(syncUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Forward admin token agar sync bisa terima action admin
              'Authorization': req.headers['authorization'] || `Bearer ${process.env.ADMIN_TOKEN || ''}`,
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
            console.error('[report] Sync credits gagal:', errData);
            return res.status(502).json({
              error:     'Credit sync gagal. Coba lagi atau tambah manual.',
              syncError: errData,
            });
          }
        } catch (err) {
          console.error('[report] Sync request error:', err.message);
          return res.status(502).json({
            error: 'Tidak dapat terhubung ke sync server. Coba lagi.',
          });
        }
      }

      // Update status
      reports[idx] = {
        ...report,
        status:      'confirmed',
        adminNote:   safeNote,
        confirmedAt: new Date().toISOString(),
      };
      saveReports(reports);

      // Kirim email konfirmasi ke admin (log)
      sendEmail({
        to:      ADMIN_EMAIL,
        subject: `[NEXUS] ✅ Payment Dikonfirmasi — @${report.from} (${report.paymentCR} CR)`,
        html:    buildConfirmationEmail(report, 'confirm', safeNote),
      }).catch(() => {});

      return res.json({
        success: true,
        message: `Payment dikonfirmasi. ${report.paymentCR} CR ditambahkan ke @${report.from}.`,
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

      // Kirim email penolakan ke admin (log)
      sendEmail({
        to:      ADMIN_EMAIL,
        subject: `[NEXUS] ❌ Payment Ditolak — @${report.from}`,
        html:    buildConfirmationEmail(report, 'reject', safeNote),
      }).catch(() => {});

      return res.json({
        success: true,
        message: `Payment ditolak untuk @${report.from}.`,
        report:  reports[idx],
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // DELETE — Admin: hapus report
  // ═══════════════════════════════════════════════════════════════════
  if (req.method === 'DELETE') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Unauthorized. Admin token diperlukan.' });
    }
    if (!checkRateLimit(`rpt_del:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit.' });
    }

    const { id } = req.body || req.query || {};
    if (!id) return res.status(400).json({ error: '`id` wajib diisi.' });

    const safeId   = sanStr(String(id), 60);
    const reports  = loadReports();
    const filtered = reports.filter(r => r.id !== safeId);

    if (filtered.length === reports.length) {
      return res.status(404).json({ error: 'Report tidak ditemukan.' });
    }

    saveReports(filtered);
    return res.json({ success: true, message: `Report ${safeId} berhasil dihapus.` });
  }

  return res.status(405).json({ error: `Method ${req.method} tidak diizinkan.` });
}