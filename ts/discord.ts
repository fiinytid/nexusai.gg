// ts/discord.ts — NEXUS AI Discord Bot Handler (Secure v4 TypeScript)

import crypto from 'crypto';
import {
  escapeHtml,
  sanitizeStr,
  verifyAdminToken,
  checkRateLimit,
  setSecurityHeaders,
} from './_security';
import type { AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface DiscordOption {
  name:  string;
  value: string | number | boolean;
  type?: number;
}

interface DiscordMember {
  user?: {
    id:             string;
    username?:      string;
    discriminator?: string;
  };
}

interface DiscordInteractionData {
  name:     string;
  options?: DiscordOption[];
}

interface DiscordInteraction {
  type:    number;
  data?:   DiscordInteractionData;
  member?: DiscordMember;
  user?:   { id: string; username?: string };
}

interface DiscordEmbedField {
  name:    string;
  value:   string;
  inline?: boolean;
}

interface DiscordEmbed {
  title?:       string;
  description?: string;
  color?:       number;
  fields?:      DiscordEmbedField[];
  timestamp?:   string;
  footer?:      { text: string };
  thumbnail?:   { url: string };
}

interface InteractionResponse {
  type: number;
  data: {
    content?: string;
    embeds?:  DiscordEmbed[];
    flags?:   number;
  };
}

interface UserRecord {
  credits?:   number;
  plan?:      string;
  banned?:    boolean;
  banReason?: string | null;
  bannedAt?:  number;
  _updated?:  number;
  robloxId?:  string | number;
  roles?:     string[];
}

interface PaymentNotifyBody {
  _nexusNotify:   true;
  type:           'payment';
  userId?:        string;
  from?:          string;
  paymentPack?:   string;
  paymentTotal?:  string;
  paymentMethod?: string;
  paymentCR?:     number;
}

interface ReportNotifyBody {
  _nexusNotify: true;
  type:         'report';
  userId?:      string;
  from?:        string;
  credits?:     number;
  plan?:        string;
  message?:     string;
}

interface GenericNotifyBody {
  _nexusNotify: true;
  type?:        string;
  message?:     string;
}

type NotifyBody = PaymentNotifyBody | ReportNotifyBody | GenericNotifyBody;

// ─── DISCORD SIGNATURE VERIFICATION ──────────────────────────────────────────

/**
 * Verify Discord Ed25519 interaction signature.
 * Rejects requests older than 5 minutes (replay protection).
 */
async function verifyDiscordSignature(
  req:     AdaptedRequest,
  rawBody: string,
): Promise<boolean> {
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!signature || !timestamp || !publicKey) return false;

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    console.warn('[discord] Stale or invalid signature timestamp:', ts);
    return false;
  }

  try {
    const encoder      = new TextEncoder();
    const publicKeyBuf = Buffer.from(publicKey, 'hex');
    const sigBuf       = Buffer.from(signature, 'hex');
    const msgBytes     = encoder.encode(timestamp + rawBody);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBuf,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );

    return await crypto.subtle.verify('Ed25519', cryptoKey, sigBuf, msgBytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[discord] Signature verification error:', msg);
    // In development, allow without verified signature when public key is not set
    return process.env.NODE_ENV !== 'production';
  }
}

// ─── OWNER / ADMIN LOOKUP ─────────────────────────────────────────────────────

function getOwnerIds(): string[] {
  return (process.env.DISCORD_OWNER_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function getAdminIds(): string[] {
  return (process.env.DISCORD_ADMIN_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function isOwner(userId: string): boolean {
  return Boolean(userId) && getOwnerIds().includes(String(userId).trim());
}

function isAdmin(userId: string): boolean {
  return isOwner(userId) ||
    (Boolean(userId) && getAdminIds().includes(String(userId).trim()));
}

// ─── KV STORE HELPER ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _kv: any = null;

async function initKV(): Promise<typeof _kv> {
  if (_kv) return _kv;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@vercel/kv');
    _kv = mod.kv || mod.default || mod;
  } catch (_) {
    // KV not available in this environment
  }
  return _kv;
}

async function getUser(username: string): Promise<UserRecord | null> {
  const kv = await initKV();
  if (!kv) return null;
  try {
    return await kv.get(
      'nexusai:' + String(username || '').toLowerCase().trim(),
    ) as UserRecord | null;
  } catch (_) {
    return null;
  }
}

async function setUser(username: string, data: UserRecord): Promise<void> {
  const kv = await initKV();
  if (!kv) return;
  try {
    await kv.set(
      'nexusai:' + String(username || '').toLowerCase().trim(),
      data,
      { ex: 60 * 60 * 24 * 365 },
    );
  } catch (_) {}
}

// ─── DISCORD REST ─────────────────────────────────────────────────────────────

/**
 * Send a message to a Discord channel via the REST API.
 */
async function sendDiscordMessage(
  channelId: string,
  content:   string        = '',
  embeds:    DiscordEmbed[] = [],
): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token || !channelId) return;

  // Validate channelId is a Discord snowflake
  if (!/^\d{15,25}$/.test(String(channelId))) {
    console.error('[discord] Invalid channelId:', channelId);
    return;
  }

  try {
    const resp = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bot ${token}`,
        },
        body: JSON.stringify({
          content: String(content || '').substring(0, 2000),
          embeds:  Array.isArray(embeds) ? embeds.slice(0, 10) : [],
        }),
        signal: AbortSignal.timeout(8_000),
      },
    );

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('[discord] Send failed:', resp.status, errText.substring(0, 200));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[discord] Network error:', msg);
  }
}

// ─── EMBED BUILDERS ───────────────────────────────────────────────────────────

function buildReportEmbed(data: ReportNotifyBody): DiscordEmbed[] {
  const userId = String(data.userId || '').trim();
  const embed: DiscordEmbed = {
    title:  'New Bug Report',
    color:  0x00e5ff,
    fields: [
      {
        name:   'User',
        value:  `@${escapeHtml(data.from, 50)} (ID: ${escapeHtml(data.userId ?? '?', 20)})`,
        inline: true,
      },
      { name: 'Plan',    value: escapeHtml(data.plan    || 'free', 20),                                   inline: true },
      { name: 'Credits', value: String(parseFloat(String(data.credits ?? 0)).toFixed(2)) + ' CR',         inline: true },
      { name: 'Message', value: escapeHtml(data.message || '—', 1000) },
    ],
    timestamp: new Date().toISOString(),
    footer:    { text: 'NEXUS AI Report System' },
  };

  // Only attach thumbnail if userId is a valid Roblox numeric ID
  if (/^\d{1,20}$/.test(userId)) {
    embed.thumbnail = {
      url: `https://www.roblox.com/headshot-thumbnail/image?userId=${encodeURIComponent(userId)}&width=60&height=60&format=png`,
    };
  }

  return [embed];
}

function buildPaymentEmbed(data: PaymentNotifyBody): DiscordEmbed[] {
  const userId = String(data.userId || '').trim();
  const embed: DiscordEmbed = {
    title:       'New Payment Received',
    color:       0x00ff88,
    description: 'Please verify the transfer and add credits to this user.',
    fields: [
      {
        name:   'User',
        value:  `@${escapeHtml(data.from, 50)} (ID: ${escapeHtml(data.userId ?? '?', 20)})`,
        inline: true,
      },
      { name: 'Package', value: escapeHtml(data.paymentPack                    || '—', 60), inline: true },
      { name: 'Total',   value: escapeHtml(data.paymentTotal                   || '—', 30), inline: true },
      { name: 'Method',  value: escapeHtml((data.paymentMethod || '—').toUpperCase(), 20),  inline: true },
      { name: 'Credits', value: String(parseFloat(String(data.paymentCR ?? 0))) + ' CR',    inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer:    { text: 'NEXUS AI Payment System' },
  };

  if (/^\d{1,20}$/.test(userId)) {
    embed.thumbnail = {
      url: `https://www.roblox.com/headshot-thumbnail/image?userId=${encodeURIComponent(userId)}&width=60&height=60&format=png`,
    };
  }

  return [embed];
}

// ─── COMMAND HANDLER ──────────────────────────────────────────────────────────

async function handleCommand(
  interaction: DiscordInteraction,
): Promise<InteractionResponse> {
  const { data, member, user } = interaction;
  const cmdName = String(data?.name || '');
  const userId  = String(member?.user?.id || user?.id || '');

  // Parse options into a plain object
  const opts: Record<string, string | number | boolean> = {};
  (data?.options || []).forEach(o => {
    if (o?.name) opts[sanitizeStr(o.name, 50)] = o.value;
  });

  // ── Response helpers ───────────────────────────────────────
  const reply = (content: string, ephemeral = false): InteractionResponse => ({
    type: 4,
    data: {
      content: String(content).substring(0, 2000),
      flags:   ephemeral ? 64 : 0,
    },
  });

  const replyEmbed = (
    embeds:    DiscordEmbed[],
    content:   string  = '',
    ephemeral: boolean = false,
  ): InteractionResponse => ({
    type: 4,
    data: {
      content: String(content).substring(0, 2000),
      embeds,
      flags: ephemeral ? 64 : 0,
    },
  });

  // ── /help ─────────────────────────────────────────────────
  if (cmdName === 'help') {
    const adminUser = isAdmin(userId);
    const lines: string[] = [
      '`/help` — Show available commands',
      '`/status` — NEXUS AI system status',
      '`/info <username>` — Look up a user',
      ...(adminUser
        ? [
            '',
            '**Admin commands:**',
            '`/give <username> <amount>` — Add credits',
            '`/take <username> <amount>` — Remove credits',
            '`/setplan <username> <plan>` — Change user plan',
            '`/ban <username> [reason]` — Ban user',
            '`/unban <username>` — Unban user',
            '`/userinfo <username>` — Detailed user info',
            '`/broadcast <message>` — Send announcement (Owner only)',
          ]
        : []),
    ];
    return replyEmbed(
      [{
        title:       'NEXUS AI — Command Reference',
        color:       0x00e5ff,
        description: lines.join('\n'),
        footer:      { text: 'NEXUS AI · NEXUS STUDIO' },
      }],
      '',
      true,
    );
  }

  // ── /status ───────────────────────────────────────────────
  if (cmdName === 'status') {
    return replyEmbed([{
      title:  'NEXUS AI System Status',
      color:  0x00ff88,
      fields: [
        { name: 'Website', value: 'nexusai-rbx.vercel.app',                                        inline: true },
        { name: 'Version', value: 'V11 Secure',                                                    inline: true },
        { name: 'API',     value: 'Online',                                                        inline: true },
        { name: 'Discord', value: `discord.gg/${process.env.DISCORD_INVITE || 'HuGtbRvD'}`,       inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer:    { text: 'NEXUS AI · NEXUS STUDIO' },
    }]);
  }

  // ── /info <username> ──────────────────────────────────────
  if (cmdName === 'info') {
    const username = sanitizeStr(String(opts.username || ''), 50);
    if (!username)                           return reply('Username is required.', true);
    if (!/^[a-z0-9_]{3,50}$/i.test(username)) return reply('Invalid username format.', true);

    const userData = await getUser(username);
    if (!userData) return reply(`User @${escapeHtml(username, 50)} was not found.`, true);

    return replyEmbed(
      [{
        title:  `User: @${escapeHtml(username, 50)}`,
        color:  0x00e5ff,
        fields: [
          { name: 'Credits', value: parseFloat(String(userData.credits || 0)).toFixed(2) + ' CR', inline: true },
          { name: 'Plan',    value: escapeHtml(userData.plan || 'free', 20),                       inline: true },
          { name: 'Banned',  value: userData.banned ? 'Yes' : 'No',                               inline: true },
        ],
        footer: { text: 'NEXUS AI Database' },
      }],
      '',
      true,
    );
  }

  // ── Admin gate ────────────────────────────────────────────
  if (!isAdmin(userId)) {
    return reply('You do not have permission to use this command.', true);
  }

  // ── /give ─────────────────────────────────────────────────
  if (cmdName === 'give') {
    const username = sanitizeStr(String(opts.username || ''), 50);
    const amount   = parseFloat(String(opts.amount));
    if (!username)                                        return reply('Username is required.', true);
    if (isNaN(amount) || amount < 1 || amount > 100_000) return reply('Amount must be between 1 and 100,000.', true);

    const existing: UserRecord = (await getUser(username)) || {};
    existing.credits  = parseFloat(((existing.credits || 0) + amount).toFixed(4));
    existing._updated = Date.now();
    await setUser(username, existing);
    return reply(`+${amount} CR added to @${escapeHtml(username, 50)}\nNew balance: ${existing.credits} CR`);
  }

  // ── /take ─────────────────────────────────────────────────
  if (cmdName === 'take') {
    const username = sanitizeStr(String(opts.username || ''), 50);
    const amount   = parseFloat(String(opts.amount));
    if (!username)                                        return reply('Username is required.', true);
    if (isNaN(amount) || amount < 1 || amount > 100_000) return reply('Amount must be between 1 and 100,000.', true);

    const existing: UserRecord = (await getUser(username)) || {};
    existing.credits  = parseFloat(Math.max(0, (existing.credits || 0) - amount).toFixed(4));
    existing._updated = Date.now();
    await setUser(username, existing);
    return reply(`-${amount} CR removed from @${escapeHtml(username, 50)}\nRemaining: ${existing.credits} CR`);
  }

  // ── /setplan ──────────────────────────────────────────────
  if (cmdName === 'setplan') {
    const username = sanitizeStr(String(opts.username || ''), 50);
    const plan     = String(opts.plan || '');
    if (!username)                                               return reply('Username is required.', true);
    if (!(['free', 'pro', 'owner'] as string[]).includes(plan)) return reply('Plan must be: free, pro, or owner.', true);

    const existing: UserRecord = (await getUser(username)) || {};
    existing.plan     = plan;
    if (plan === 'pro')   existing.credits = Math.max(existing.credits || 0, 200);
    if (plan === 'owner') existing.credits = 999999;
    existing._updated = Date.now();
    await setUser(username, existing);
    return reply(`Plan for @${escapeHtml(username, 50)} set to ${plan.toUpperCase()}`);
  }

  // ── /ban ──────────────────────────────────────────────────
  if (cmdName === 'ban') {
    const username = sanitizeStr(String(opts.username || ''), 50);
    const reason   = sanitizeStr(String(opts.reason   || 'No reason provided'), 200);
    if (!username) return reply('Username is required.', true);

    const existing: UserRecord = (await getUser(username)) || {};
    existing.banned    = true;
    existing.banReason = reason;
    existing.bannedAt  = Date.now();
    existing._updated  = Date.now();
    await setUser(username, existing);
    return reply(`@${escapeHtml(username, 50)} has been banned.\nReason: ${escapeHtml(reason, 200)}`);
  }

  // ── /unban ────────────────────────────────────────────────
  if (cmdName === 'unban') {
    const username = sanitizeStr(String(opts.username || ''), 50);
    if (!username) return reply('Username is required.', true);

    const existing: UserRecord = (await getUser(username)) || {};
    existing.banned    = false;
    existing.banReason = null;
    existing._updated  = Date.now();
    await setUser(username, existing);
    return reply(`@${escapeHtml(username, 50)} has been unbanned.`);
  }

  // ── /userinfo ─────────────────────────────────────────────
  if (cmdName === 'userinfo') {
    const username = sanitizeStr(String(opts.username || ''), 50);
    if (!username) return reply('Username is required.', true);

    const userData = await getUser(username);
    if (!userData) return reply(`User @${escapeHtml(username, 50)} was not found.`, true);

    const bannedValue = userData.banned
      ? `Yes — ${escapeHtml(userData.banReason ?? '?', 80)}`
      : 'No';

    return replyEmbed(
      [{
        title:  `Admin View: @${escapeHtml(username, 50)}`,
        color:  0xffd600,
        fields: [
          { name: 'Credits',   value: parseFloat(String(userData.credits || 0)).toFixed(2) + ' CR',    inline: true },
          { name: 'Plan',      value: escapeHtml(userData.plan || 'free', 20),                          inline: true },
          { name: 'Banned',    value: bannedValue,                                                      inline: true },
          { name: 'Roblox ID', value: escapeHtml(String(userData.robloxId || '—'), 20),                inline: true },
          {
            name:   'Updated',
            value:  userData._updated
              ? new Date(userData._updated).toLocaleString('en-US')
              : '—',
            inline: true,
          },
          {
            name:   'Roles',
            value:  escapeHtml((userData.roles || []).join(', ') || 'none', 50),
            inline: true,
          },
        ],
        footer: { text: 'NEXUS AI Admin Panel' },
      }],
      '',
      true,
    );
  }

  // ── /broadcast (owner only) ───────────────────────────────
  if (cmdName === 'broadcast') {
    if (!isOwner(userId)) return reply('This command requires Owner access.', true);

    const message = sanitizeStr(String(opts.message || ''), 1000);
    if (!message) return reply('Message is required.', true);

    const notifChannel = process.env.DISCORD_NOTIF_CHANNEL;
    if (notifChannel) {
      await sendDiscordMessage(
        notifChannel,
        `NEXUS AI Broadcast:\n${escapeHtml(message, 1000)}`,
      );
    }
    return reply('Broadcast sent.');
  }

  return reply('Unknown command.', true);
}

// ─── SLASH COMMAND DEFINITIONS ────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { name: 'help',   description: 'Show NEXUS AI command list' },
  { name: 'status', description: 'Show NEXUS AI system status' },
  {
    name: 'info', description: 'Look up a user',
    options: [{ name: 'username', description: 'Roblox username', type: 3, required: true }],
  },
  {
    name: 'give', description: '[Admin] Add credits to a user',
    options: [
      { name: 'username', description: 'Roblox username',           type: 3,  required: true },
      { name: 'amount',   description: 'Credits to add (1–100000)', type: 10, required: true },
    ],
  },
  {
    name: 'take', description: '[Admin] Remove credits from a user',
    options: [
      { name: 'username', description: 'Roblox username',   type: 3,  required: true },
      { name: 'amount',   description: 'Credits to remove', type: 10, required: true },
    ],
  },
  {
    name: 'setplan', description: '[Admin] Change user plan',
    options: [
      { name: 'username', description: 'Roblox username', type: 3, required: true },
      {
        name: 'plan', description: 'Target plan', type: 3, required: true,
        choices: [
          { name: 'Free',  value: 'free'  },
          { name: 'Pro',   value: 'pro'   },
          { name: 'Owner', value: 'owner' },
        ],
      },
    ],
  },
  {
    name: 'ban', description: '[Admin] Ban a user',
    options: [
      { name: 'username', description: 'Roblox username', type: 3, required: true  },
      { name: 'reason',   description: 'Ban reason',      type: 3, required: false },
    ],
  },
  {
    name: 'unban', description: '[Admin] Unban a user',
    options: [{ name: 'username', description: 'Roblox username', type: 3, required: true }],
  },
  {
    name: 'userinfo', description: '[Admin] Detailed user info',
    options: [{ name: 'username', description: 'Roblox username', type: 3, required: true }],
  },
  {
    name: 'broadcast', description: '[Owner] Broadcast a message to the notification channel',
    options: [{ name: 'message', description: 'Message to broadcast', type: 3, required: true }],
  },
] as const;

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

export default async function handler(
  req: AdaptedRequest,
  res: AdaptedResponse,
): Promise<void> {
  // Security headers (via shared utility — same as all other NEXUS AI endpoints)
  setSecurityHeaders(res);

  // Override CORS origin for Discord-facing endpoint
  res.setHeader('Access-Control-Allow-Origin',  'https://nexusai-roblox.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Signature-Ed25519, X-Signature-Timestamp');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const ip = (
    (req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown'
  ).trim();

  // ── GET: Register slash commands or health check ──────────
  if (req.method === 'GET') {
    if (req.query['register'] !== '1') {
      res.json({ status: 'NEXUS AI Discord Bot', version: 'V11 Secure' });
      return;
    }

    const token    = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;

    if (!token || !clientId) {
      res.status(400).json({ error: 'DISCORD_TOKEN and DISCORD_CLIENT_ID are required.' });
      return;
    }

    if (!verifyAdminToken(req)) {
      res.status(401).json({ error: 'Admin token required to register commands.' });
      return;
    }

    try {
      const regResp = await fetch(
        `https://discord.com/api/v10/applications/${clientId}/commands`,
        {
          method:  'PUT',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bot ${token}`,
          },
          body: JSON.stringify(SLASH_COMMANDS),
        },
      );
      const regData = await regResp.json();
      res.json({ success: regResp.ok, registered: SLASH_COMMANDS.length, data: regData });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[discord] Command registration error:', msg);
      res.status(500).json({ error: 'Failed to register commands.' });
    }
    return;
  }

  // ── POST ──────────────────────────────────────────────────
  if (req.method === 'POST') {
    if (!checkRateLimit(`discord:${ip}`, 60)) {
      res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;

    // ── Internal notification from NEXUS backend ──────────
    if (body['_nexusNotify'] === true) {
      if (!verifyAdminToken(req)) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const notifChannel = process.env.DISCORD_NOTIF_CHANNEL;
      if (!notifChannel) {
        res.json({ status: 'no notification channel configured' });
        return;
      }

      // ✅ Fix: cast through unknown to satisfy TS2352
      // body is runtime-validated (_nexusNotify === true), so the double
      // assertion is intentional and safe here.
      const notifyBody = body as unknown as NotifyBody;

      if (notifyBody.type === 'payment') {
        await sendDiscordMessage(
          notifChannel,
          'New payment received:',
          buildPaymentEmbed(notifyBody as PaymentNotifyBody),
        );
      } else if (notifyBody.type === 'report') {
        await sendDiscordMessage(
          notifChannel,
          'New bug report:',
          buildReportEmbed(notifyBody as ReportNotifyBody),
        );
      } else {
        const generic = notifyBody as GenericNotifyBody;
        await sendDiscordMessage(
          notifChannel,
          sanitizeStr(String(generic.message || 'Notification from NEXUS AI'), 500),
        );
      }

      res.json({ status: 'ok' });
      return;
    }

    // ── Discord PING (type 1) ─────────────────────────────
    if (body['type'] === 1) {
      const rawBody = JSON.stringify(body);
      const valid   = await verifyDiscordSignature(req, rawBody);
      if (!valid && process.env.DISCORD_PUBLIC_KEY) {
        res.status(401).json({ error: 'Invalid request signature.' });
        return;
      }
      res.json({ type: 1 });
      return;
    }

    // ── Slash command (type 2) ────────────────────────────
    if (body['type'] === 2) {
      const rawBody = JSON.stringify(body);
      const valid   = await verifyDiscordSignature(req, rawBody);
      if (!valid && process.env.DISCORD_PUBLIC_KEY) {
        console.warn('[discord] Invalid signature from', ip);
        res.status(401).json({ error: 'Invalid request signature.' });
        return;
      }

      try {
        const response = await handleCommand(body as unknown as DiscordInteraction);
        res.json(response);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[discord] Command handler error:', msg);
        res.json({
          type: 4,
          data: { content: 'An error occurred. Please try again.', flags: 64 },
        });
      }
      return;
    }

    // Acknowledge unknown interaction types
    res.json({ type: 1 });
    return;
  }

  res.status(405).json({ error: 'Method not allowed.' });
}