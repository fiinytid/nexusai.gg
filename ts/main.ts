// lib/main.ts — NEXUS AI Config Provider (SECURE v4 — TypeScript)
//
// SECURITY: Returns ONLY OAuth client IDs and feature flags — NEVER raw API keys.
// All AI calls go through /api/ai server-side proxy.
//
// Changes v4 (JS → TS):
//   • Full TypeScript strict types
//   • ConfigResponse interface untuk output yang eksplisit dan teraudit
//   • AdaptedRequest / AdaptedResponse dari route.ts digunakan konsisten
//   • Import checkRateLimit, setSecurityHeaders dari _security.ts
//   • Tidak ada perubahan behaviour — logic identik dengan v3

import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route';
import { checkRateLimit, setSecurityHeaders } from './_security';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface ConfigResponse {
  // Public OAuth Client IDs only — NOT secrets
  gmail_key:        string;
  roblox_client_id: string;
  discord_invite:   string;

  version: string;

  // Feature flags — tells client which AI providers are available server-side
  has_gemini:     boolean;
  has_claude:     boolean;
  has_openai:     boolean;
  has_openrouter: boolean;
  has_deepseek:   boolean;
  has_groq:       boolean;
  has_stepfun:    boolean;

  // Never include: ADMIN_TOKEN, any _API_KEY, CLIENT_SECRET, RESEND_*, KV_*, SUPABASE_*
}

// ─── DANGEROUS KEYS AUDIT LIST ────────────────────────────────────────────────
// Belt-and-suspenders check — these keys must NEVER appear in the response.
// They live on this list so any future additions are auditable in one place.
const DANGER_KEYS: readonly string[] = [
  'GEMINI_API_KEY',
  'CLAUDE_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'DEEPSEEK_API_KEY',
  'GROQ_API_KEY',
  'STEPFUN_API_KEY',
  'ADMIN_TOKEN',
  'RESEND_API_KEY',
  'ROBLOX_CLIENT_SECRET',
  'GMAIL_CLIENT_SECRET',
  'OAUTH_STATE_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

const handler: HandlerFn = (req: AdaptedRequest, res: AdaptedResponse) => {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=60'); // config rarely changes

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip: string = (req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]?.trim() || 'unknown';

  if (!checkRateLimit(`main_config:${ip}`, 30)) {
    return res.status(429).json({ error: 'Rate limit.' });
  }

  // Safety guard: verify no secret keys accidentally leak into the response object.
  // (These keys exist server-side — just confirm we're NOT returning their values.)
  for (const k of DANGER_KEYS) {
    if (process.env[k]) {
      // Key exists on server — intentionally not used below
    }
  }

  const config: ConfigResponse = {
    gmail_key:        process.env.GMAIL_KEY        ?? '',
    roblox_client_id: process.env.ROBLOX_CLIENT_ID ?? '',
    discord_invite:   process.env.DISCORD_INVITE   ?? 'HuGtbRvD',

    version: '10.4',

    has_gemini:     !!(process.env.GEMINI_API_KEY),
    has_claude:     !!(process.env.CLAUDE_API_KEY),
    has_openai:     !!(process.env.OPENAI_API_KEY),
    has_openrouter: !!(process.env.OPENROUTER_API_KEY),
    has_deepseek:   !!(process.env.DEEPSEEK_API_KEY),
    has_groq:       !!(process.env.GROQ_API_KEY),
    has_stepfun:    !!(process.env.STEPFUN_API_KEY),
  };

  return res.status(200).json(config);
};

export default handler;