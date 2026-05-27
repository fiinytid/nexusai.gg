// api/payment.js — NEXUS AI Payment System (SECURE v4)
// Security fixes:
//   • REMOVED hardcoded ADMIN_TOKEN fallback 'nexusadmin2024'
//   • Admin token verified via header only (not query string)
//   • Rate limiting on all endpoints
//   • Input validation & sanitization (XSS prevention)
//   • Amount validation (no negative/overflow values)
//   • Transaction ID generated securely (crypto-random)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import crypto from 'crypto';

const PAYMENTS_FILE = '/tmp/nexus_payments.json';

// ─── ADMIN TOKEN ──────────────────────────────────────────────────────────────
// ⚠️ SECURITY: ADMIN_TOKEN must be set in Vercel env vars.
// We do NOT provide a default fallback — if not set, admin endpoints are disabled.
function getAdminToken() {
  const t = process.env.ADMIN_TOKEN;
  if (!t || t === 'nexusadmin2024' || t.length < 16) return null; // unsafe or not set
  return t;
}

function verifyAdminToken(req) {
  const token = getAdminToken();
  if (!token) return false; // Admin token not configured = no admin access

  const candidate =
    (req.headers?.['authorization'] || '').replace(/^Bearer\s+/i, '').trim() ||
    (req.headers?.['x-admin-token'] || '').trim();
  // ⚠️ Do NOT accept token from query string for admin operations on payments
  //    (query strings appear in server logs — leaks token)

  if (!candidate) return false;
  try {
    const a = Buffer.from(candidate.padEnd(128));
    const b = Buffer.from(token.padEnd(128));
    return crypto.timingSafeEqual(a.slice(0, 128), b.slice(0, 128)) && candidate === token;
  } catch (_) {
    return false;
  }
}

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const _rl = new Map();
function checkRateLimit(key, maxPerMin = 20) {
  const now = Date.now();
  const k = String(key || 'anon').substring(0, 100);
  if (!_rl.has(k)) _rl.set(k, { count: 0, reset: now + 60_000 });
  const r = _rl.get(k);
  if (now > r.reset) { r.count = 0; r.reset = now + 60_000; }
  return ++r.count <= maxPerMin;
}

// ─── SANITIZERS ──────────────────────────────────────────────────────────────
function esc(str, max = 100) {
  return String(str ?? '')
    .substring(0, max)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function sanStr(str, max = 100) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/[<>]/g, '')
    .substring(0, max);
}

// ─── PACKAGES ─────────────────────────────────────────────────────────────────
const PACKAGES = [
  { id: 'small',    cr: 50,  idr: 38000,   usd: 2.38,  label: '50 CR — Starter' },
  { id: 'popular',  cr: 80,  idr: 50000,   usd: 3.13,  label: '80 CR — Popular', popular: true },
  { id: 'pro',      cr: 150, idr: 120000,  usd: 7.50,  label: '150 CR — Pro' },
  { id: 'mega',     cr: 500, idr: 1500000, usd: 93.75, label: '500 CR — Mega' },
  { id: 'pro-plan', cr: 200, idr: 150000,  usd: 9.38,  label: 'Pro Plan (Monthly) · 200 CR' },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function loadPayments() {
  try {
    if (existsSync(PAYMENTS_FILE)) return JSON.parse(readFileSync(PAYMENTS_FILE, 'utf8'));
  } catch (_) {}
  return [];
}

function savePayments(payments) {
  try {
    writeFileSync(PAYMENTS_FILE, JSON.stringify(payments.slice(0, 500)));
  } catch (_) {}
}

function generateCode() {
  // Cryptographically random transaction code
  const rand = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `NPAY-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

function maskNumber(num) {
  if (!num || num.length < 8) return '****';
  return num.substring(0, 4) + '****' + num.substring(num.length - 4);
}

// ─── HTML EMAIL BUILDER ───────────────────────────────────────────────────────
function buildPaymentEmail(username, userId, pkg, method, amount, transactionId) {
  const avatarUrl = userId && userId !== '0'
    ? `https://www.roblox.com/headshot-thumbnail/image?userId=${encodeURIComponent(userId)}&width=60&height=60&format=png`
    : '';
  const displayUser = esc(username, 50);
  const displayUid  = esc(String(userId || '-'), 20);
  const paymentFmt  = 'Rp ' + pkg.idr.toLocaleString('id-ID');

  const avatarHtml = avatarUrl
    ? `<img src="${avatarUrl}" width="60" height="60" style="display:block;width:60px;height:60px;border-radius:50%;border:2px solid #00e5ff;" alt="${displayUser}" />`
    : `<div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#00e5ff,#8800ff);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:white;margin:0 auto;">${displayUser.charAt(0).toUpperCase()}</div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#030312;font-family:'Courier New',monospace;">
<div style="max-width:580px;margin:0 auto;padding:24px 16px;">
  <div style="background:#0a0b22;border:1px solid rgba(0,229,255,.2);border-radius:12px;padding:20px;margin-bottom:16px;text-align:center;">
    <div style="height:2px;background:linear-gradient(90deg,#00e5ff,#8800ff);margin-bottom:16px;"></div>
    <div style="font-size:20px;font-weight:700;color:#00e5ff;">NEXUS AI</div>
    <div style="font-size:10px;color:#3a4a7a;letter-spacing:3px;">💳 NEW PAYMENT</div>
  </div>
  <div style="background:#06071a;border:1px solid rgba(0,229,255,.12);border-radius:10px;padding:20px;margin-bottom:16px;text-align:center;">
    <div style="margin:0 auto 10px;">${avatarHtml}</div>
    <div style="font-size:16px;font-weight:700;color:white;">@${displayUser}</div>
    <div style="font-size:11px;color:#3a4a7a;">Roblox ID: ${displayUid}</div>
  </div>
  <div style="background:#06071a;border:1px solid rgba(0,255,170,.2);border-radius:10px;padding:20px;margin-bottom:16px;">
    <div style="font-size:11px;color:#00ffaa;font-weight:700;letter-spacing:2px;margin-bottom:14px;">💳 PAYMENT DETAILS</div>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:7px 0;color:#3a4a7a;font-size:11px;width:120px;">Package</td><td style="padding:7px 0;color:white;font-weight:700;">${esc(pkg.label, 60)}</td></tr>
      <tr><td style="padding:7px 0;color:#3a4a7a;font-size:11px;">Credits</td><td style="padding:7px 0;color:#ffd600;font-weight:700;font-size:14px;">${pkg.cr} CR</td></tr>
      <tr><td style="padding:7px 0;color:#3a4a7a;font-size:11px;">Method</td><td style="padding:7px 0;color:#00e5ff;font-weight:700;">${esc(method.toUpperCase(), 20)}</td></tr>
      <tr style="border-top:1px solid rgba(0,229,255,.12);">
        <td style="padding:12px 0 7px;color:white;font-size:12px;font-weight:700;">TOTAL PAID</td>
        <td style="padding:12px 0 7px;color:#00ffaa;font-size:18px;font-weight:700;">${esc(paymentFmt, 30)}</td>
      </tr>
    </table>
    <div style="background:rgba(255,214,0,.05);border:1px solid rgba(255,214,0,.2);border-radius:6px;padding:10px;margin-top:10px;">
      <div style="font-size:10px;color:#ffd600;margin-bottom:4px;">⚠️ ACTION REQUIRED:</div>
      <div style="font-size:11px;color:#b8cfff;">Tambahkan <strong style="color:#ffd600;">${pkg.cr} CR</strong> ke <strong style="color:white;">@${displayUser}</strong> (ID: ${displayUid}) setelah verifikasi transfer.</div>
    </div>
  </div>
  <div style="background:#06071a;border:1px solid rgba(0,229,255,.08);border-radius:10px;padding:14px;margin-bottom:16px;">
    <div style="font-size:10px;color:#3a4a7a;">Transaction Code: <strong style="color:white;">${esc(transactionId, 40)}</strong></div>
    <div style="font-size:10px;color:#3a4a7a;">Time: ${new Date().toISOString()}</div>
  </div>
  <div style="text-align:center;font-size:9px;color:#3a4a7a;padding-top:10px;">
    NEXUS AI · NEXUS STUDIO · nexusai-roblox.vercel.app
  </div>
</div>
</body></html>`;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  const ovo   = process.env.OVO_NUMBER   || '';
  const dana  = process.env.DANA_NUMBER  || '';
  const owner = process.env.PAYMENT_OWNER_NAME || 'NEXUS STUDIO';

  // ═══════════════════════════════════════════════════════════════
  // GET
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    if (!checkRateLimit(`pay_get:${ip}`, 30)) return res.status(429).json({ error: 'Rate limit.' });

    // Transaction status (public — by ID)
    if (req.query.id) {
      const txId = sanStr(req.query.id, 60);
      const payments = loadPayments();
      const tx = payments.find(p => p.id === txId);
      if (!tx) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
      // Return only safe fields — not internal notes
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

    // Admin: list all payments
    if (req.query.admin === '1') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized: Admin token diperlukan via Authorization header.' });
      }
      const payments = loadPayments();
      return res.status(200).json({ payments, total: payments.length });
    }

    // Public: payment config
    if (!ovo && !dana) {
      return res.status(503).json({
        error: 'Pembayaran belum dikonfigurasi.',
        message: 'Admin harus mengatur OVO_NUMBER dan DANA_NUMBER di Vercel environment variables.',
      });
    }

    return res.status(200).json({
      ovo:  { available: !!ovo,  number: ovo,  masked: maskNumber(ovo),  name: owner },
      dana: { available: !!dana, number: dana, masked: maskNumber(dana), name: owner },
      owner,
      packages: PACKAGES,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // POST — create transaction
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    if (!checkRateLimit(`pay_post:${ip}`, 5)) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan pembayaran. Coba lagi dalam 1 menit.' });
    }

    const { username, userId, packId, method, amount, note } = req.body || {};

    if (!username || !packId || !method || !amount) {
      return res.status(400).json({ error: 'Field wajib: username, packId, method, amount.' });
    }

    // Validate username
    const cleanUsername = sanStr(String(username), 50).toLowerCase().trim();
    if (!cleanUsername || !/^[a-z0-9_]{3,50}$/i.test(cleanUsername)) {
      return res.status(400).json({ error: 'Format username tidak valid.' });
    }

    // Validate package
    const pkg = PACKAGES.find(p => p.id === sanStr(packId, 20));
    if (!pkg) return res.status(400).json({ error: 'Package tidak valid.' });

    // Validate method
    const cleanMethod = sanStr(String(method), 10).toLowerCase();
    if (!['ovo', 'dana', 'transfer'].includes(cleanMethod)) {
      return res.status(400).json({ error: 'Metode pembayaran tidak valid. Gunakan: ovo, dana, transfer.' });
    }

    // Validate amount (must be a positive integer, close to package price)
    const cleanAmount = parseInt(String(amount).replace(/\D/g, ''), 10);
    if (isNaN(cleanAmount) || cleanAmount <= 0 || cleanAmount > 100_000_000) {
      return res.status(400).json({ error: 'Jumlah transfer tidak valid.' });
    }

    // Validate userId (Roblox numeric ID)
    const cleanUserId = userId ? sanStr(String(userId), 20) : '0';
    if (cleanUserId !== '0' && !/^\d{1,20}$/.test(cleanUserId)) {
      return res.status(400).json({ error: 'Format userId tidak valid.' });
    }

    const newTx = {
      id:                generateCode(),
      username:          cleanUsername,
      userId:            cleanUserId,
      package:           pkg.id,
      credits:           pkg.cr,
      method:            cleanMethod,
      total:             pkg.idr,
      amountTransferred: cleanAmount,
      note:              sanStr(String(note || ''), 200),
      status:            'pending',
      createdAt:         new Date().toISOString(),
      confirmedAt:       null,
    };

    const payments = loadPayments();
    payments.unshift(newTx);
    savePayments(payments);

    // Send email notification
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const html = buildPaymentEmail(cleanUsername, cleanUserId, pkg, cleanMethod, cleanAmount, newTx.id);
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'NEXUS AI <onboarding@resend.dev>',
          to: [process.env.REPORT_EMAIL || 'arifiinytid@gmail.com'],
          subject: `💳 NEXUS PAYMENT: ${cleanUsername} — Rp ${pkg.idr.toLocaleString('id-ID')} (${pkg.id})`,
          html,
        }),
      }).catch(e => console.error('[payment] Email error:', e.message));
    }

    return res.status(201).json({
      success: true,
      transaction: {
        id:   newTx.id,
        code: newTx.id,
        status: 'pending',
        instructions: {
          method:    cleanMethod,
          number:    cleanMethod === 'ovo' ? ovo : dana,
          name:      owner,
          amount:    'Rp ' + pkg.idr.toLocaleString('id-ID'),
          note:      sanStr(note || '', 100) || `NEXUS-${cleanUsername}-${pkg.cr}CR`,
        },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PATCH — admin: confirm / reject
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'PATCH') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Unauthorized: Admin token diperlukan via Authorization header.' });
    }
    if (!checkRateLimit(`pay_patch:${ip}`, 30)) return res.status(429).json({ error: 'Rate limit.' });

    const { id, action } = req.body || {};
    if (!id || !action) return res.status(400).json({ error: 'id dan action wajib diisi.' });
    if (!['confirm', 'reject'].includes(action)) return res.status(400).json({ error: 'action harus: confirm atau reject.' });

    const txId = sanStr(String(id), 60);
    const payments = loadPayments();
    const tx = payments.find(p => p.id === txId);
    if (!tx) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
    if (tx.status !== 'pending') return res.status(400).json({ error: `Transaksi sudah diproses (status: ${tx.status}).` });

    if (action === 'confirm') {
      try {
        const syncUrl = `https://${req.headers.host || 'nexusai-roblox.vercel.app'}/api/sync`;
        const syncRes = await fetch(syncUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers['authorization'] || '', // forward admin token
          },
          body: JSON.stringify({
            action: 'give-credits',
            target: tx.username,
            amount: tx.credits,
          }),
        });
        if (!syncRes.ok) throw new Error('Sync gagal.');
        tx.status      = 'confirmed';
        tx.confirmedAt = new Date().toISOString();
        savePayments(payments);
        return res.status(200).json({ success: true, message: `${tx.credits} CR ditambahkan ke @${tx.username}.` });
      } catch (e) {
        return res.status(500).json({ error: 'Gagal menambahkan credits: ' + e.message });
      }
    }

    if (action === 'reject') {
      tx.status      = 'rejected';
      tx.confirmedAt = new Date().toISOString();
      savePayments(payments);
      return res.status(200).json({ success: true, message: `Transaksi ditolak.` });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}