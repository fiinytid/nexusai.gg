// lib/redeem.ts — NEXUS AI Redeem Code System (TypeScript v2)
//
// Changes v2 (JS → TS):
//   • Full TypeScript strict types — no implicit 'any'
//   • verifyAdminToken & checkRateLimit diimport dari _security.ts
//     (lokal verifyAdminToken & checkRateLimit dihapus — tidak duplikat)
//   • CodeRecord, CodeListEntry, UserData interfaces menggantikan objek anonim
//   • generateRandomCode, validateCode dianotasi penuh
//   • Semua catch (e) → e: unknown dengan narrowing
//   • Tidak ada perubahan behaviour / endpoint / response shape

import crypto from 'crypto';
import { kv }  from '@vercel/kv';
import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route.js';
import { verifyAdminToken, sanitizeStr, checkRateLimit } from './_security';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface CodeRecord {
  code:      string;
  credits:   number;
  maxUses:   number;
  uses:      number;
  expiresAt: string | null;
  createdAt: string;
}

/** Lightweight summary stored in the master list key */
interface CodeListEntry {
  code:      string;
  credits:   number;
  maxUses:   number;
  uses:      number;
  expiresAt: string | null;
  createdAt: string;
}

interface UserData {
  credits?: number | string;
  [key: string]: unknown;
}

interface CreateBody {
  action?:       string;
  credits?:      unknown;
  maxUses?:      unknown;
  expiresInDays?: unknown;
  [key: string]: unknown;
}

interface RedeemBody {
  action?: string;
  code?:   unknown;
  user?:   unknown;
  userId?: unknown;
  [key: string]: unknown;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CODES_LIST_KEY = 'nexus:code_list' as const;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Valid redeem code: 6–12 uppercase alphanumeric. Returns normalized code or null. */
function validateCode(code: unknown): string | null {
  const upper = String(code ?? '').toUpperCase().trim().replace(/\s/g, '');
  if (!/^[A-Z0-9]{6,12}$/.test(upper)) return null;
  return upper;
}

/**
 * Generate a cryptographically random 8-char code.
 * Avoids ambiguous chars: 0, O, I, 1, L.
 */
function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let code    = '';
  for (const byte of bytes) {
    code += chars[byte % chars.length];
  }
  return code.substring(0, 8);
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

const handler: HandlerFn = async (req: AdaptedRequest, res: AdaptedResponse) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  res.setHeader('X-Content-Type-Options',       'nosniff');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const ip: string = (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';

  // ═══════════════════════════════════════════════════════════════
  // GET — admin: list all codes
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (!checkRateLimit(`rdm_get:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit.' });
    }

    try {
      const codes = (await kv.get<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
      return res.status(200).json({ codes });
    } catch (e: unknown) {
      console.error('[redeem] GET error:', e instanceof Error ? e.message : e);
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
    if (!checkRateLimit(`rdm_del:${ip}`, 20)) {
      return res.status(429).json({ error: 'Rate limit.' });
    }

    const rawCode = (req.body as Record<string, unknown>)?.['code'];
    const code    = validateCode(rawCode);
    if (!code) return res.status(400).json({ error: 'Format kode tidak valid.' });

    try {
      const codes    = (await kv.get<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
      const newCodes = codes.filter(c => c.code !== code);
      await kv.set(CODES_LIST_KEY, newCodes);
      await kv.del(`nexus:code:${code}`);
      return res.status(200).json({ success: true, deleted: code });
    } catch (e: unknown) {
      console.error('[redeem] DELETE error:', e instanceof Error ? e.message : e);
      return res.status(500).json({ error: 'Gagal menghapus kode.' });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // POST
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    const body = (req.body ?? {}) as CreateBody & RedeemBody;

    // ── Admin: create new code ──────────────────────────────────
    if (body.action === 'create') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }
      if (!checkRateLimit(`rdm_create:${ip}`, 10)) {
        return res.status(429).json({ error: 'Rate limit.' });
      }

      const { credits, maxUses, expiresInDays } = body;

      // Validate credits (1 – 10 000)
      const cr = parseFloat(String(credits ?? ''));
      if (isNaN(cr) || cr <= 0 || cr > 10_000) {
        return res.status(400).json({ error: 'credits harus antara 1 dan 10000.' });
      }

      // Validate maxUses (1 – 10 000)
      const mu = parseInt(String(maxUses ?? ''), 10);
      if (isNaN(mu) || mu <= 0 || mu > 10_000) {
        return res.status(400).json({ error: 'maxUses harus antara 1 dan 10000.' });
      }

      // Validate expiresInDays (1 – 3 650, optional)
      let expiresAt: string | null = null;
      if (
        expiresInDays !== undefined &&
        expiresInDays !== null      &&
        expiresInDays !== ''
      ) {
        const days = parseInt(String(expiresInDays), 10);
        if (isNaN(days) || days < 1 || days > 3_650) {
          return res.status(400).json({ error: 'expiresInDays harus antara 1 dan 3650.' });
        }
        expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
      }

      try {
        const code: string = generateRandomCode();

        const newCode: CodeRecord = {
          code,
          credits:   parseFloat(cr.toFixed(4)),
          maxUses:   mu,
          uses:      0,
          expiresAt,
          createdAt: new Date().toISOString(),
        };

        await kv.set(`nexus:code:${code}`, newCode);

        const codes = (await kv.get<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
        const entry: CodeListEntry = {
          code,
          credits:   newCode.credits,
          maxUses:   newCode.maxUses,
          uses:      0,
          expiresAt,
          createdAt: newCode.createdAt,
        };
        codes.push(entry);
        await kv.set(CODES_LIST_KEY, codes);

        return res.status(200).json({ success: true, code: newCode });
      } catch (e: unknown) {
        console.error('[redeem] create error:', e instanceof Error ? e.message : e);
        return res.status(500).json({ error: 'Gagal membuat kode.' });
      }
    }

    // ── User: redeem code ────────────────────────────────────────
    // ⚠️ Rate limit aggressively to prevent brute-force guessing
    if (!checkRateLimit(`rdm_use:${ip}`, 5)) {
      return res.status(429).json({
        error: 'Terlalu banyak percobaan. Coba lagi dalam 1 menit.',
      });
    }

    const { code: rawCode, user, userId } = body as RedeemBody;

    if (!rawCode || !user) {
      return res.status(400).json({ error: 'code dan user wajib diisi.' });
    }

    const code = validateCode(rawCode);
    if (!code) {
      // Deliberately vague — don't help brute-forcers
      return res.status(404).json({ error: 'Kode tidak valid atau sudah kedaluwarsa.' });
    }

    const cleanUser = sanitizeStr(String(user), 50).toLowerCase().trim();
    if (!cleanUser || !/^[a-z0-9_]{3,50}$/i.test(cleanUser)) {
      return res.status(400).json({ error: 'Format username tidak valid.' });
    }

    // Per-user rate limit on redeem attempts
    if (!checkRateLimit(`rdm_user:${cleanUser}`, 3)) {
      return res.status(429).json({
        error: 'Terlalu banyak percobaan untuk akun ini.',
      });
    }

    try {
      const codeData = await kv.get<CodeRecord>(`nexus:code:${code}`);

      // Constant-time-like delay to prevent timing oracle on code existence
      await new Promise<void>(r => setTimeout(r, 50 + Math.random() * 50));

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
      try {
        alreadyUsed = !!(await kv.get<boolean>(usedKey));
      } catch { /* treat as not used */ }

      if (alreadyUsed) {
        return res.status(400).json({ error: 'Kamu sudah pernah menggunakan kode ini.' });
      }

      // Check max uses
      if (codeData.uses >= codeData.maxUses) {
        return res.status(400).json({ error: 'Kode sudah mencapai batas penggunaan.' });
      }

      // Validate credits value from stored data (not from user input)
      const redeemCredits = parseFloat(String(codeData.credits ?? 0));
      if (isNaN(redeemCredits) || redeemCredits <= 0 || redeemCredits > 10_000) {
        return res.status(500).json({ error: 'Data kode tidak valid.' });
      }

      // Mark used (TTL 3 years)
      await kv.set(usedKey, true, { ex: 86_400 * 365 * 3 });

      // Increment uses
      const updatedCode: CodeRecord = { ...codeData, uses: codeData.uses + 1 };
      await kv.set(`nexus:code:${code}`, updatedCode);

      // Update master list
      try {
        const codes = (await kv.get<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
        const idx   = codes.findIndex(c => c.code === code);
        if (idx !== -1) {
          codes[idx].uses = updatedCode.uses;
          await kv.set(CODES_LIST_KEY, codes);
        }
      } catch { /* non-critical — master list may be stale */ }

      // Add credits to user
      const userDataKey                = `nexusai:${cleanUser}`;
      const userData: UserData         = (await kv.get<UserData>(userDataKey)) ?? {};
      const currentCredits             = parseFloat(String(userData.credits ?? 30));
      const newCredits                 = parseFloat((currentCredits + redeemCredits).toFixed(4));

      if (newCredits > 999_999) {
        return res.status(400).json({ error: 'Credits sudah mencapai batas maksimum.' });
      }

      await kv.set(userDataKey, { ...userData, credits: newCredits, _updated: Date.now() });

      return res.status(200).json({ success: true, credits: redeemCredits, newCredits });

    } catch (e: unknown) {
      console.error('[redeem] Error:', e instanceof Error ? e.message : e);
      return res.status(500).json({ error: 'Terjadi kesalahan. Coba lagi.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;