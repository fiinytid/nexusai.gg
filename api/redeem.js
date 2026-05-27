// api/redeem.js — NEXUS AI Redeem Code Manager (SECURE v3)
// Security fixes:
//   • REMOVED hardcoded ADMIN_TOKEN fallback 'nexusadmin2024'
//   • Timing-safe token comparison
//   • Rate limiting (prevent brute-force code guessing)
//   • Input sanitization on all fields
//   • Code format validation (prevents injection)
//   • Credit amount bounds check

import { kv } from "@vercel/kv";
import crypto from 'crypto';

const CODES_LIST_KEY = 'nexus:code_list';

// ─── ADMIN TOKEN (no fallback) ────────────────────────────────────────────────
function getAdminToken() {
  const t = process.env.ADMIN_TOKEN;
  if (!t || t === 'nexusadmin2024' || t.length < 16) return null;
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
    const a = Buffer.from(candidate.padEnd(128));
    const b = Buffer.from(token.padEnd(128));
    return crypto.timingSafeEqual(a.slice(0, 128), b.slice(0, 128)) && candidate === token;
  } catch (_) {
    return false;
  }
}

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const _rl = new Map();
function checkRateLimit(key, maxPerMin = 10) {
  const now = Date.now();
  const k = String(key || 'anon').substring(0, 100);
  if (!_rl.has(k)) _rl.set(k, { count: 0, reset: now + 60_000 });
  const r = _rl.get(k);
  if (now > r.reset) { r.count = 0; r.reset = now + 60_000; }
  return ++r.count <= maxPerMin;
}

// ─── SANITIZERS ──────────────────────────────────────────────────────────────
function sanStr(str, max = 100) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>'"]/g, '')
    .substring(0, max);
}

// Valid redeem code: 6-12 uppercase alphanumeric
function validateCode(code) {
  const upper = String(code || '').toUpperCase().trim().replace(/\s/g, '');
  if (!/^[A-Z0-9]{6,12}$/.test(upper)) return null;
  return upper;
}

// Generate cryptographically random code
function generateRandomCode() {
  // Avoid ambiguous chars (0, O, I, 1, L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const byte of bytes) {
    code += chars[byte % chars.length];
  }
  return code.substring(0, 8);
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  // ═══════════════════════════════════════════════════════════════
  // GET — admin: list all codes
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (!checkRateLimit(`rdm_get:${ip}`, 30)) return res.status(429).json({ error: 'Rate limit.' });

    try {
      const codes = (await kv.get(CODES_LIST_KEY)) || [];
      return res.status(200).json({ codes });
    } catch (e) {
      return res.status(500).json({ error: 'Gagal mengambil data kode.' });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // DELETE — admin: delete a code
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'DELETE') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (!checkRateLimit(`rdm_del:${ip}`, 20)) return res.status(429).json({ error: 'Rate limit.' });

    const rawCode = (req.body || {}).code;
    const code = validateCode(rawCode);
    if (!code) return res.status(400).json({ error: 'Format kode tidak valid.' });

    try {
      const codes = (await kv.get(CODES_LIST_KEY)) || [];
      const newCodes = codes.filter(c => c.code !== code);
      await kv.set(CODES_LIST_KEY, newCodes);
      await kv.del(`nexus:code:${code}`);
      return res.status(200).json({ success: true, deleted: code });
    } catch (e) {
      return res.status(500).json({ error: 'Gagal menghapus kode.' });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // POST
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    const body = req.body || {};

    // ── Admin: create new code ────────────────────────────────────
    if (body.action === 'create') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }
      if (!checkRateLimit(`rdm_create:${ip}`, 10)) return res.status(429).json({ error: 'Rate limit.' });

      const { credits, maxUses, expiresInDays } = body;

      // Validate credits (1 – 10000)
      const cr = parseFloat(credits);
      if (isNaN(cr) || cr <= 0 || cr > 10_000) {
        return res.status(400).json({ error: 'credits harus antara 1 dan 10000.' });
      }

      // Validate maxUses (1 – 10000)
      const mu = parseInt(maxUses, 10);
      if (isNaN(mu) || mu <= 0 || mu > 10_000) {
        return res.status(400).json({ error: 'maxUses harus antara 1 dan 10000.' });
      }

      // Validate expiresInDays (1 – 3650)
      let expiresAt = null;
      if (expiresInDays !== undefined && expiresInDays !== null && expiresInDays !== '') {
        const days = parseInt(expiresInDays, 10);
        if (isNaN(days) || days < 1 || days > 3650) {
          return res.status(400).json({ error: 'expiresInDays harus antara 1 dan 3650.' });
        }
        expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
      }

      try {
        const code = generateRandomCode();
        const newCode = {
          code,
          credits: parseFloat(cr.toFixed(4)),
          maxUses: mu,
          uses:    0,
          expiresAt,
          createdAt: new Date().toISOString(),
        };

        await kv.set(`nexus:code:${code}`, newCode);

        const codes = (await kv.get(CODES_LIST_KEY)) || [];
        codes.push({ code, credits: newCode.credits, maxUses: newCode.maxUses, uses: 0, expiresAt, createdAt: newCode.createdAt });
        await kv.set(CODES_LIST_KEY, codes);

        return res.status(200).json({ success: true, code: newCode });
      } catch (e) {
        return res.status(500).json({ error: 'Gagal membuat kode.' });
      }
    }

    // ── User: redeem code ─────────────────────────────────────────
    // ⚠️ Rate limit aggressively to prevent brute-force guessing
    if (!checkRateLimit(`rdm_use:${ip}`, 5)) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 1 menit.' });
    }

    const { code: rawCode, user, userId } = body;

    if (!rawCode || !user) {
      return res.status(400).json({ error: 'code dan user wajib diisi.' });
    }

    const code = validateCode(rawCode);
    if (!code) {
      // Deliberate vague message to not help brute-forcers
      return res.status(404).json({ error: 'Kode tidak valid atau sudah kedaluwarsa.' });
    }

    const cleanUser = sanStr(String(user), 50).toLowerCase().trim();
    if (!cleanUser || !/^[a-z0-9_]{3,50}$/i.test(cleanUser)) {
      return res.status(400).json({ error: 'Format username tidak valid.' });
    }

    // Per-user rate limit on redeem attempts
    if (!checkRateLimit(`rdm_user:${cleanUser}`, 3)) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan untuk akun ini.' });
    }

    try {
      const codeData = await kv.get(`nexus:code:${code}`);

      // Constant-time-like delay to prevent timing oracle on code existence
      await new Promise(r => setTimeout(r, 50 + Math.random() * 50));

      if (!codeData) {
        return res.status(404).json({ error: 'Kode tidak valid atau sudah kedaluwarsa.' });
      }

      // Check expiry
      if (codeData.expiresAt && new Date(codeData.expiresAt) < new Date()) {
        return res.status(400).json({ error: 'Kode sudah kedaluwarsa.' });
      }

      // Check already used by this user
      const usedKey = `nexus:code_used:${code}:${cleanUser}`;
      let alreadyUsed = false;
      try { alreadyUsed = !!(await kv.get(usedKey)); } catch (_) {}
      if (alreadyUsed) {
        return res.status(400).json({ error: 'Kamu sudah pernah menggunakan kode ini.' });
      }

      // Check max uses
      if (codeData.uses >= codeData.maxUses) {
        return res.status(400).json({ error: 'Kode sudah mencapai batas penggunaan.' });
      }

      // Validate credits value from stored data (not from user input)
      const redeemCredits = parseFloat(codeData.credits || 0);
      if (isNaN(redeemCredits) || redeemCredits <= 0 || redeemCredits > 10_000) {
        return res.status(500).json({ error: 'Data kode tidak valid.' });
      }

      // Mark used
      await kv.set(usedKey, true, { ex: 86400 * 365 * 3 });

      // Increment uses
      const updatedCode = { ...codeData, uses: codeData.uses + 1 };
      await kv.set(`nexus:code:${code}`, updatedCode);

      // Update list
      try {
        const codes = (await kv.get(CODES_LIST_KEY)) || [];
        const idx = codes.findIndex(c => c.code === code);
        if (idx !== -1) { codes[idx].uses = updatedCode.uses; await kv.set(CODES_LIST_KEY, codes); }
      } catch (_) {}

      // Add credits to user
      const userDataKey = `nexusai:${cleanUser}`;
      const userData = (await kv.get(userDataKey)) || {};
      const currentCredits = parseFloat(userData.credits ?? 30);
      const newCredits = parseFloat((currentCredits + redeemCredits).toFixed(4));

      if (newCredits > 999_999) {
        return res.status(400).json({ error: 'Credits sudah mencapai batas maksimum.' });
      }

      await kv.set(userDataKey, { ...userData, credits: newCredits, _updated: Date.now() });

      return res.status(200).json({ success: true, credits: redeemCredits, newCredits });

    } catch (e) {
      console.error('[redeem] Error:', e.message);
      return res.status(500).json({ error: 'Terjadi kesalahan. Coba lagi.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}