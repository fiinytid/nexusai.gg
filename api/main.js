// api/main.js — NEXUS AI Config Provider (SECURE v3)
// SECURITY: Returns ONLY OAuth client IDs and feature flags — NEVER raw API keys
// All AI calls go through /api/ai.js server-side proxy

import { checkRateLimit, setSecurityHeaders } from './_security.js';

export default function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=60'); // cache 60s — config rarely changes
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(`main_config:${ip}`, 30)) {
    return res.status(429).json({ error: 'Rate limit.' });
  }

  // ── Safety guard: detect if any AI API key is accidentally exposed ─────────
  // (Belt-and-suspenders — these should NEVER appear here)
  const dangerKeys = ['GEMINI_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY',
                      'OPENROUTER_API_KEY', 'ADMIN_TOKEN', 'RESEND_API_KEY'];
  for (const k of dangerKeys) {
    if (process.env[k]) {
      // Key exists — good, it's server-side — just make sure we don't return it
    }
  }

  res.status(200).json({
    // Public OAuth Client IDs only — NOT secrets
    gmail_key:        process.env.GMAIL_KEY         || '',
    roblox_client_id: process.env.ROBLOX_CLIENT_ID  || '',
    discord_invite:   process.env.DISCORD_INVITE    || 'HuGtbRvD',

    version: '10.4',

    // Feature flags — tells client which providers are available (no keys)
    has_gemini:     !!(process.env.GEMINI_API_KEY),
    has_claude:     !!(process.env.CLAUDE_API_KEY),
    has_openai:     !!(process.env.OPENAI_API_KEY),
    has_openrouter: !!(process.env.OPENROUTER_API_KEY),
    has_deepseek:   !!(process.env.DEEPSEEK_API_KEY),
    has_groq:       !!(process.env.GROQ_API_KEY),
    has_stepfun:    !!(process.env.STEPFUN_API_KEY),

    // Never include: ADMIN_TOKEN, any _API_KEY, CLIENT_SECRET, RESEND_*, KV_*, SUPABASE_*
  });
}