// ts/redeem.ts — NEXUS AI Redeem Code System (TypeScript v3)
//
// Changes v3:
//   • All comments and messages fully in English
//   • Added `regenerate` action: admin can regenerate a new random code
//     while keeping the same credits/maxUses/expiry settings
//   • Added `get-code` action: fetch a single code's full record by code string
//   • Added `update-code` action: patch credits / maxUses / expiresInDays on
//     an existing code without deleting and re-creating it
//   • Added `reset-uses` action: zero out the use counter on a code (e.g. after
//     a batch redeem error), without touching the used-by-user sentinel keys
//   • GET now accepts ?code=<CODE> to return a single code record instead of
//     the full list, saving bandwidth on large code lists
//   • All user-facing error messages are now in English
//   • verifyAdminToken & checkRateLimit imported from _security.ts (unchanged)
//   • No behaviour / storage shape / endpoint path changes vs v2

import crypto from 'crypto';
import { kv }  from '@vercel/kv';
import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route';
import { verifyAdminToken, sanitizeStr, checkRateLimit } from './_security';

// ─── TYPES ────────────────────────────────────────────────────────────────────

/** Full record stored at nexus:code:<CODE> */
interface CodeRecord {
  code:      string;
  credits:   number;
  maxUses:   number;
  uses:      number;
  expiresAt: string | null;
  createdAt: string;
  /** Optional human-readable label set at creation time */
  label?:    string;
}

/** Lightweight summary stored in the master list key (nexus:code_list) */
interface CodeListEntry {
  code:      string;
  credits:   number;
  maxUses:   number;
  uses:      number;
  expiresAt: string | null;
  createdAt: string;
  label?:    string;
}

interface UserData {
  credits?: number | string;
  [key: string]: unknown;
}

// Body shapes for POST actions
interface CreateBody {
  action?:        string;
  credits?:       unknown;
  maxUses?:       unknown;
  expiresInDays?: unknown;
  label?:         unknown;
  [key: string]:  unknown;
}

interface UpdateBody {
  action?:        string;
  code?:          unknown;
  credits?:       unknown;
  maxUses?:       unknown;
  expiresInDays?: unknown;
  label?:         unknown;
  [key: string]:  unknown;
}

interface RedeemBody {
  action?:  string;
  code?:    unknown;
  user?:    unknown;
  userId?:  unknown;
  [key: string]: unknown;
}

interface AdminCodeBody {
  action?: string;
  code?:   unknown;
  [key: string]: unknown;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CODES_LIST_KEY = 'nexus:code_list' as const;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Validate and normalise a redeem code string.
 * Accepts 6–12 uppercase alphanumeric characters.
 * Returns the normalised code, or null if invalid.
 */
function validateCode(code: unknown): string | null {
  const upper = String(code ?? '').toUpperCase().trim().replace(/\s/g, '');
  if (!/^[A-Z0-9]{6,12}$/.test(upper)) return null;
  return upper;
}

/**
 * Generate a cryptographically-random 8-character code.
 * Excludes ambiguous characters: 0, O, I, 1, L.
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

/**
 * Build a CodeListEntry summary from a full CodeRecord.
 */
function toListEntry(record: CodeRecord): CodeListEntry {
  return {
    code:      record.code,
    credits:   record.credits,
    maxUses:   record.maxUses,
    uses:      record.uses,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    ...(record.label ? { label: record.label } : {}),
  };
}

/**
 * Parse and validate an expiresInDays value.
 * Returns an ISO expiry string, null (never expires), or throws a descriptive Error.
 */
function parseExpiry(expiresInDays: unknown): string | null {
  if (
    expiresInDays === undefined ||
    expiresInDays === null      ||
    expiresInDays === ''
  ) {
    return null; // never expires
  }
  const days = parseInt(String(expiresInDays), 10);
  if (isNaN(days) || days < 1 || days > 3_650) {
    throw new Error('expiresInDays must be between 1 and 3650.');
  }
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

const handler: HandlerFn = async (req: AdaptedRequest, res: AdaptedResponse) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  res.setHeader('X-Content-Type-Options',       'nosniff');
  res.setHeader('Cache-Control',                'no-store');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const ip: string = (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';

  // ═══════════════════════════════════════════════════════════════
  // GET  — admin: list all codes  |  ?code=<CODE>: single record
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (!checkRateLimit(`rdm_get:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please slow down.' });
    }

    // ?code=<CODE>  → return single record
    const singleCode = validateCode(req.query['code']);
    if (singleCode) {
      try {
        const record = await kv.get<CodeRecord>(`nexus:code:${singleCode}`);
        if (!record) {
          return res.status(404).json({ error: 'Code not found.' });
        }
        return res.status(200).json({ code: record });
      } catch (e: unknown) {
        console.error('[redeem] GET single error:', e instanceof Error ? e.message : e);
        return res.status(500).json({ error: 'Failed to retrieve code.' });
      }
    }

    // No ?code → return full list
    try {
      const codes = (await kv.get<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
      return res.status(200).json({ codes });
    } catch (e: unknown) {
      console.error('[redeem] GET list error:', e instanceof Error ? e.message : e);
      return res.status(500).json({ error: 'Failed to retrieve code list.' });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // DELETE — admin: permanently delete a code
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'DELETE') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (!checkRateLimit(`rdm_del:${ip}`, 20)) {
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }

    const rawCode = (req.body as Record<string, unknown>)?.['code'];
    const code    = validateCode(rawCode);
    if (!code) return res.status(400).json({ error: 'Invalid code format.' });

    try {
      const codes    = (await kv.get<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
      const newCodes = codes.filter(c => c.code !== code);
      await kv.set(CODES_LIST_KEY, newCodes);
      await kv.del(`nexus:code:${code}`);
      return res.status(200).json({ success: true, deleted: code });
    } catch (e: unknown) {
      console.error('[redeem] DELETE error:', e instanceof Error ? e.message : e);
      return res.status(500).json({ error: 'Failed to delete code.' });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // POST
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    const body = (req.body ?? {}) as CreateBody & UpdateBody & RedeemBody & AdminCodeBody;

    // ── Admin: create a new redeem code ────────────────────────
    if (body.action === 'create') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }
      if (!checkRateLimit(`rdm_create:${ip}`, 10)) {
        return res.status(429).json({ error: 'Rate limit exceeded.' });
      }

      const { credits, maxUses, expiresInDays, label } = body;

      // Validate credits (1 – 10 000)
      const cr = parseFloat(String(credits ?? ''));
      if (isNaN(cr) || cr <= 0 || cr > 10_000) {
        return res.status(400).json({ error: 'credits must be between 1 and 10000.' });
      }

      // Validate maxUses (1 – 10 000)
      const mu = parseInt(String(maxUses ?? ''), 10);
      if (isNaN(mu) || mu <= 0 || mu > 10_000) {
        return res.status(400).json({ error: 'maxUses must be between 1 and 10000.' });
      }

      // Validate optional expiry
      let expiresAt: string | null;
      try {
        expiresAt = parseExpiry(expiresInDays);
      } catch (e: unknown) {
        return res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
      }

      // Optional label (max 60 chars)
      const cleanLabel = label ? sanitizeStr(String(label), 60) : undefined;

      try {
        const code: string = generateRandomCode();

        const newCode: CodeRecord = {
          code,
          credits:   parseFloat(cr.toFixed(4)),
          maxUses:   mu,
          uses:      0,
          expiresAt,
          createdAt: new Date().toISOString(),
          ...(cleanLabel ? { label: cleanLabel } : {}),
        };

        await kv.set(`nexus:code:${code}`, newCode);

        const codes = (await kv.get<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
        codes.push(toListEntry(newCode));
        await kv.set(CODES_LIST_KEY, codes);

        return res.status(200).json({ success: true, code: newCode });
      } catch (e: unknown) {
        console.error('[redeem] create error:', e instanceof Error ? e.message : e);
        return res.status(500).json({ error: 'Failed to create code.' });
      }
    }

    // ── Admin: update an existing code's settings ───────────────
    // Allows patching credits, maxUses, expiresInDays, and/or label
    // without deleting and re-creating the code.
    if (body.action === 'update-code') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }
      if (!checkRateLimit(`rdm_update:${ip}`, 20)) {
        return res.status(429).json({ error: 'Rate limit exceeded.' });
      }

      const code = validateCode(body.code);
      if (!code) return res.status(400).json({ error: 'Invalid code format.' });

      try {
        const existing = await kv.get<CodeRecord>(`nexus:code:${code}`);
        if (!existing) return res.status(404).json({ error: 'Code not found.' });

        // Apply patches selectively — only fields that are present in body
        let { credits, maxUses, expiresInDays, label } = body;

        let newCredits = existing.credits;
        if (credits !== undefined) {
          const cr = parseFloat(String(credits));
          if (isNaN(cr) || cr <= 0 || cr > 10_000) {
            return res.status(400).json({ error: 'credits must be between 1 and 10000.' });
          }
          newCredits = parseFloat(cr.toFixed(4));
        }

        let newMaxUses = existing.maxUses;
        if (maxUses !== undefined) {
          const mu = parseInt(String(maxUses), 10);
          if (isNaN(mu) || mu <= 0 || mu > 10_000) {
            return res.status(400).json({ error: 'maxUses must be between 1 and 10000.' });
          }
          newMaxUses = mu;
        }

        let newExpiresAt = existing.expiresAt;
        if (expiresInDays !== undefined) {
          try {
            newExpiresAt = parseExpiry(expiresInDays);
          } catch (e: unknown) {
            return res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
          }
        }

        const newLabel = label !== undefined
          ? (label ? sanitizeStr(String(label), 60) : undefined)
          : existing.label;

        const updated: CodeRecord = {
          ...existing,
          credits:   newCredits,
          maxUses:   newMaxUses,
          expiresAt: newExpiresAt,
          ...(newLabel ? { label: newLabel } : {}),
        };

        await kv.set(`nexus:code:${code}`, updated);

        // Patch master list entry in-place
        try {
          const codes = (await kv.get<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
          const idx   = codes.findIndex(c => c.code === code);
          if (idx !== -1) {
            codes[idx] = toListEntry(updated);
            await kv.set(CODES_LIST_KEY, codes);
          }
        } catch { /* non-critical */ }

        return res.status(200).json({ success: true, code: updated });
      } catch (e: unknown) {
        console.error('[redeem] update-code error:', e instanceof Error ? e.message : e);
        return res.status(500).json({ error: 'Failed to update code.' });
      }
    }

    // ── Admin: regenerate code string, keep same settings ────────
    // Useful when a code has been accidentally leaked. The old code is
    // deleted and a brand-new random string is issued with the same
    // credits / maxUses / expiresAt / label values.
    if (body.action === 'regenerate') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }
      if (!checkRateLimit(`rdm_regen:${ip}`, 10)) {
        return res.status(429).json({ error: 'Rate limit exceeded.' });
      }

      const oldCode = validateCode(body.code);
      if (!oldCode) return res.status(400).json({ error: 'Invalid code format.' });

      try {
        const existing = await kv.get<CodeRecord>(`nexus:code:${oldCode}`);
        if (!existing) return res.status(404).json({ error: 'Code not found.' });

        const newCodeStr = generateRandomCode();
        const regenerated: CodeRecord = {
          ...existing,
          code:      newCodeStr,
          uses:      0,                         // reset usage on the new code
          createdAt: new Date().toISOString(),
        };

        // Persist new record, remove old one
        await kv.set(`nexus:code:${newCodeStr}`, regenerated);
        await kv.del(`nexus:code:${oldCode}`);

        // Update master list: swap old entry for new one
        try {
          const codes = (await kv.get<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
          const idx   = codes.findIndex(c => c.code === oldCode);
          if (idx !== -1) {
            codes[idx] = toListEntry(regenerated);
          } else {
            codes.push(toListEntry(regenerated));
          }
          await kv.set(CODES_LIST_KEY, codes);
        } catch { /* non-critical */ }

        return res.status(200).json({ success: true, oldCode, code: regenerated });
      } catch (e: unknown) {
        console.error('[redeem] regenerate error:', e instanceof Error ? e.message : e);
        return res.status(500).json({ error: 'Failed to regenerate code.' });
      }
    }

    // ── Admin: reset use counter on a code ───────────────────────
    // Does NOT clear the per-user sentinel keys (nexus:code_used:…), so
    // users who already redeemed will still be blocked unless those keys
    // are individually deleted.
    if (body.action === 'reset-uses') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }
      if (!checkRateLimit(`rdm_reset:${ip}`, 20)) {
        return res.status(429).json({ error: 'Rate limit exceeded.' });
      }

      const code = validateCode(body.code);
      if (!code) return res.status(400).json({ error: 'Invalid code format.' });

      try {
        const existing = await kv.get<CodeRecord>(`nexus:code:${code}`);
        if (!existing) return res.status(404).json({ error: 'Code not found.' });

        const reset: CodeRecord = { ...existing, uses: 0 };
        await kv.set(`nexus:code:${code}`, reset);

        try {
          const codes = (await kv.get<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
          const idx   = codes.findIndex(c => c.code === code);
          if (idx !== -1) {
            codes[idx].uses = 0;
            await kv.set(CODES_LIST_KEY, codes);
          }
        } catch { /* non-critical */ }

        return res.status(200).json({ success: true, code: reset });
      } catch (e: unknown) {
        console.error('[redeem] reset-uses error:', e instanceof Error ? e.message : e);
        return res.status(500).json({ error: 'Failed to reset code uses.' });
      }
    }

    // ── Admin: get single code details via POST ───────────────────
    if (body.action === 'get-code') {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }

      const code = validateCode(body.code);
      if (!code) return res.status(400).json({ error: 'Invalid code format.' });

      try {
        const record = await kv.get<CodeRecord>(`nexus:code:${code}`);
        if (!record) return res.status(404).json({ error: 'Code not found.' });
        return res.status(200).json({ code: record });
      } catch (e: unknown) {
        console.error('[redeem] get-code error:', e instanceof Error ? e.message : e);
        return res.status(500).json({ error: 'Failed to retrieve code.' });
      }
    }

    // ── User: redeem a code ──────────────────────────────────────
    // Rate limit aggressively on both IP and username to prevent brute-force.
    if (!checkRateLimit(`rdm_use:${ip}`, 5)) {
      return res.status(429).json({
        error: 'Too many attempts. Please try again in 1 minute.',
      });
    }

    const { code: rawCode, user, userId } = body as RedeemBody;

    if (!rawCode || !user) {
      return res.status(400).json({ error: 'Both "code" and "user" are required.' });
    }

    const code = validateCode(rawCode);
    if (!code) {
      // Deliberately vague — do not help brute-force attackers
      return res.status(404).json({ error: 'Invalid or expired code.' });
    }

    const cleanUser = sanitizeStr(String(user), 50).toLowerCase().trim();
    if (!cleanUser || !/^[a-z0-9_]{3,50}$/i.test(cleanUser)) {
      return res.status(400).json({ error: 'Invalid username format.' });
    }

    // Per-user rate limit on redeem attempts
    if (!checkRateLimit(`rdm_user:${cleanUser}`, 3)) {
      return res.status(429).json({
        error: 'Too many attempts for this account. Please wait a moment.',
      });
    }

    try {
      const codeData = await kv.get<CodeRecord>(`nexus:code:${code}`);

      // Constant-time-like delay to prevent timing oracle on code existence
      await new Promise<void>(r => setTimeout(r, 50 + Math.random() * 50));

      if (!codeData) {
        return res.status(404).json({ error: 'Invalid or expired code.' });
      }

      // Check expiry
      if (codeData.expiresAt && new Date(codeData.expiresAt) < new Date()) {
        return res.status(400).json({ error: 'This code has expired.' });
      }

      // Check already used by this user
      const usedKey = `nexus:code_used:${code}:${cleanUser}`;
      let alreadyUsed = false;
      try {
        alreadyUsed = !!(await kv.get<boolean>(usedKey));
      } catch { /* treat as not used */ }

      if (alreadyUsed) {
        return res.status(400).json({ error: 'You have already redeemed this code.' });
      }

      // Check max uses
      if (codeData.uses >= codeData.maxUses) {
        return res.status(400).json({ error: 'This code has reached its usage limit.' });
      }

      // Validate credits value from stored record (never from user input)
      const redeemCredits = parseFloat(String(codeData.credits ?? 0));
      if (isNaN(redeemCredits) || redeemCredits <= 0 || redeemCredits > 10_000) {
        return res.status(500).json({ error: 'Code data is corrupt. Please contact support.' });
      }

      // Mark used (TTL: 3 years)
      await kv.set(usedKey, true, { ex: 86_400 * 365 * 3 });

      // Increment use counter
      const updatedCode: CodeRecord = { ...codeData, uses: codeData.uses + 1 };
      await kv.set(`nexus:code:${code}`, updatedCode);

      // Update master list (non-critical — may be stale if this fails)
      try {
        const codes = (await kv.get<CodeListEntry[]>(CODES_LIST_KEY)) ?? [];
        const idx   = codes.findIndex(c => c.code === code);
        if (idx !== -1) {
          codes[idx].uses = updatedCode.uses;
          await kv.set(CODES_LIST_KEY, codes);
        }
      } catch { /* non-critical */ }

      // Add credits to the user's record
      const userDataKey        = `nexusai:${cleanUser}`;
      const userData: UserData = (await kv.get<UserData>(userDataKey)) ?? {};
      const currentCredits     = parseFloat(String(userData.credits ?? 30));
      const newCredits         = parseFloat((currentCredits + redeemCredits).toFixed(4));

      if (newCredits > 999_999) {
        return res.status(400).json({ error: 'Your credits balance is already at the maximum.' });
      }

      await kv.set(userDataKey, { ...userData, credits: newCredits, _updated: Date.now() });

      return res.status(200).json({
        success:    true,
        credits:    redeemCredits,
        newCredits,
        label:      codeData.label ?? null,
      });

    } catch (e: unknown) {
      console.error('[redeem] redeem error:', e instanceof Error ? e.message : e);
      return res.status(500).json({ error: 'An error occurred. Please try again.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;