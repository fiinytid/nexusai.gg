// api/discord.js — NEXUS AI Discord Bot Handler (Secure v3)
//
// Changes from v2:
//  • All comments and user-facing strings in English
//  • Internal notify now requires Authorization: Bearer <ADMIN_TOKEN>
//  • Command list expanded with /status, /info, /give, /take, /setplan, /ban, /unban, /userinfo, /broadcast
//  • Cleaner embed builders (no emoji dependency — uses text prefixes)
//  • Rate limiting tuned per endpoint
//  • Replay protection on all signed interactions
//  • Sanitized error responses (no stack traces in prod)
//  • Credits bounds enforced: 1–100,000 per operation
//  • All user strings sanitized before DB writes

import crypto from 'crypto';

// ─── SANITIZERS ──────────────────────────────────────────────────────────────

/**
 * Strip control characters, angle brackets, and truncate.
 */
function sanStr(str, max = 200) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/[<>]/g, '')
    .substring(0, max);
}

/**
 * HTML-escape a string (for embed fields that render HTML).
 */
function esc(str, max = 200) {
  return String(str ?? '')
    .substring(0, max)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ─── RATE LIMITING ────────────────────────────────────────────────────────────

const _rateMap = new Map();

/**
 * Simple in-memory sliding window rate limiter.
 * @param {string} key  - identifier (IP, userId, etc.)
 * @param {number} maxPerMin
 * @returns {boolean} true if request is allowed
 */
function checkRateLimit(key, maxPerMin = 30) {
  const now = Date.now();
  const k   = String(key || 'anon').substring(0, 100);
  if (!_rateMap.has(k)) _rateMap.set(k, { count: 0, reset: now + 60_000 });
  const record = _rateMap.get(k);
  if (now > record.reset) { record.count = 0; record.reset = now + 60_000; }
  return ++record.count <= maxPerMin;
}

// ─── DISCORD SIGNATURE VERIFICATION ──────────────────────────────────────────

/**
 * Verify Discord Ed25519 interaction signature.
 * Rejects requests older than 5 minutes (replay protection).
 */
async function verifyDiscordSignature(req, rawBody) {
  const signature = req.headers['x-signature-ed25519'];
  const timestamp  = req.headers['x-signature-timestamp'];
  const publicKey  = process.env.DISCORD_PUBLIC_KEY;

  if (!signature || !timestamp || !publicKey) return false;

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    console.warn('[discord] Stale or invalid signature timestamp:', ts);
    return false;
  }

  try {
    const encoder       = new TextEncoder();
    const publicKeyBuf  = Buffer.from(publicKey, 'hex');
    const signatureBuf  = Buffer.from(signature, 'hex');
    const messageBytes  = encoder.encode(timestamp + rawBody);

    const cryptoKey = await crypto.subtle.importKey(
      'raw', publicKeyBuf,
      { name: 'Ed25519' },
      false, ['verify']
    );
    return await crypto.subtle.verify('Ed25519', cryptoKey, signatureBuf, messageBytes);
  } catch (err) {
    console.warn('[discord] Signature verification error:', err.message);
    // In development allow without verified signature when public key is not set
    return process.env.NODE_ENV !== 'production';
  }
}

// ─── OWNER / ADMIN LOOKUP ─────────────────────────────────────────────────────

function getOwnerIds() {
  return (process.env.DISCORD_OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function getAdminIds() {
  return (process.env.DISCORD_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function isOwner(userId) {
  return Boolean(userId) && getOwnerIds().includes(String(userId).trim());
}

function isAdmin(userId) {
  return isOwner(userId) || (Boolean(userId) && getAdminIds().includes(String(userId).trim()));
}

// ─── ADMIN TOKEN VERIFICATION ─────────────────────────────────────────────────

/**
 * Verify the Authorization: Bearer <ADMIN_TOKEN> header for internal API calls.
 */
function verifyAdminToken(req) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return false;
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  return bearer === adminToken;
}

// ─── KV STORE HELPER ─────────────────────────────────────────────────────────

let _kv = null;

async function initKV() {
  if (_kv) return _kv;
  try {
    const mod = require('@vercel/kv');
    _kv = mod.kv || mod.default || mod;
  } catch (_) {
    // KV not available
  }
  return _kv;
}

async function getUser(username) {
  const kv = await initKV();
  if (!kv) return null;
  try {
    return await kv.get('nexusai:' + String(username || '').toLowerCase().trim());
  } catch (_) {
    return null;
  }
}

async function setUser(username, data) {
  const kv = await initKV();
  if (!kv) return;
  try {
    await kv.set(
      'nexusai:' + String(username || '').toLowerCase().trim(),
      data,
      { ex: 60 * 60 * 24 * 365 }
    );
  } catch (_) {}
}

// ─── DISCORD REST ─────────────────────────────────────────────────────────────

/**
 * Send a message to a Discord channel via the REST API.
 */
async function sendDiscordMessage(channelId, content = '', embeds = []) {
  const token = process.env.DISCORD_TOKEN;
  if (!token || !channelId) return;

  // Validate channelId is a Discord snowflake
  if (!/^\d{15,25}$/.test(String(channelId))) {
    console.error('[discord] Invalid channelId:', channelId);
    return;
  }

  try {
    const resp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
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
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.error('[discord] Send failed:', resp.status, err.substring(0, 200));
    }
  } catch (err) {
    console.error('[discord] Network error:', err.message);
  }
}

// ─── EMBED BUILDERS ───────────────────────────────────────────────────────────

function buildReportEmbed(data) {
  const userId = String(data.userId || '').trim();
  const embed = {
    title:     'New Bug Report',
    color:     0x00e5ff,
    fields: [
      { name: 'User',     value: `@${esc(data.from, 50)} (ID: ${esc(data.userId || '?', 20)})`, inline: true },
      { name: 'Plan',     value: esc(data.plan || 'free', 20), inline: true },
      { name: 'Credits',  value: String(parseFloat(data.credits ?? 0).toFixed(2)) + ' CR', inline: true },
      { name: 'Message',  value: esc(data.message || '—', 1000) },
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

function buildPaymentEmbed(data) {
  const userId = String(data.userId || '').trim();
  const embed = {
    title:       'New Payment Received',
    color:       0x00ff88,
    description: 'Please verify the transfer and add credits to this user.',
    fields: [
      { name: 'User',    value: `@${esc(data.from, 50)} (ID: ${esc(data.userId || '?', 20)})`, inline: true },
      { name: 'Package', value: esc(data.paymentPack || '—', 60), inline: true },
      { name: 'Total',   value: esc(data.paymentTotal || '—', 30), inline: true },
      { name: 'Method',  value: esc((data.paymentMethod || '—').toUpperCase(), 20), inline: true },
      { name: 'Credits', value: String(parseFloat(data.paymentCR ?? 0)) + ' CR', inline: true },
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

async function handleCommand(interaction) {
  const { data, member, user } = interaction;
  const cmdName = String(data?.name || '');
  const userId  = String(member?.user?.id || user?.id || '');

  // Parse options into a plain object
  const opts = {};
  (data?.options || []).forEach(o => {
    if (o?.name) opts[sanStr(o.name, 50)] = o.value;
  });

  // Response helpers
  const reply = (content, ephemeral = false) => ({
    type: 4,
    data: { content: String(content).substring(0, 2000), flags: ephemeral ? 64 : 0 },
  });

  const replyEmbed = (embeds, content = '', ephemeral = false) => ({
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
    const lines = [
      '`/help` — Show available commands',
      '`/status` — NEXUS AI system status',
      '`/info <username>` — Look up a user',
      ...(adminUser ? [
        '',
        '**Admin commands:**',
        '`/give <username> <amount>` — Add credits',
        '`/take <username> <amount>` — Remove credits',
        '`/setplan <username> <plan>` — Change user plan',
        '`/ban <username> [reason]` — Ban user',
        '`/unban <username>` — Unban user',
        '`/userinfo <username>` — Detailed user info',
        '`/broadcast <message>` — Send announcement (Owner only)',
      ] : []),
    ];
    return replyEmbed([{
      title:       'NEXUS AI — Command Reference',
      color:       0x00e5ff,
      description: lines.join('\n'),
      footer:      { text: 'NEXUS AI · NEXUS STUDIO' },
    }], '', true);
  }

  // ── /status ───────────────────────────────────────────────
  if (cmdName === 'status') {
    return replyEmbed([{
      title:  'NEXUS AI System Status',
      color:  0x00ff88,
      fields: [
        { name: 'Website', value: 'nexusai-roblox.vercel.app', inline: true },
        { name: 'Version', value: 'V11 Secure', inline: true },
        { name: 'API',     value: 'Online', inline: true },
        { name: 'Discord', value: `discord.gg/${process.env.DISCORD_INVITE || 'HuGtbRvD'}`, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer:    { text: 'NEXUS AI · NEXUS STUDIO' },
    }]);
  }

  // ── /info <username> ──────────────────────────────────────
  if (cmdName === 'info') {
    const username = sanStr(String(opts.username || ''), 50);
    if (!username) return reply('Username is required.', true);
    if (!/^[a-z0-9_]{3,50}$/i.test(username)) return reply('Invalid username format.', true);

    const userData = await getUser(username);
    if (!userData) return reply(`User @${esc(username, 50)} was not found.`, true);

    return replyEmbed([{
      title:  `User: @${esc(username, 50)}`,
      color:  0x00e5ff,
      fields: [
        { name: 'Credits', value: parseFloat(userData.credits || 0).toFixed(2) + ' CR', inline: true },
        { name: 'Plan',    value: esc(userData.plan || 'free', 20), inline: true },
        { name: 'Banned',  value: userData.banned ? 'Yes' : 'No', inline: true },
      ],
      footer: { text: 'NEXUS AI Database' },
    }], '', true);
  }

  // ── Admin gate ────────────────────────────────────────────
  if (!isAdmin(userId)) {
    return reply('You do not have permission to use this command.', true);
  }

  // ── /give ─────────────────────────────────────────────────
  if (cmdName === 'give') {
    const username = sanStr(String(opts.username || ''), 50);
    const amount   = parseFloat(opts.amount);
    if (!username)                         return reply('Username is required.', true);
    if (isNaN(amount) || amount < 1 || amount > 100_000) return reply('Amount must be between 1 and 100,000.', true);

    const existing = (await getUser(username)) || {};
    existing.credits  = parseFloat(((existing.credits || 0) + amount).toFixed(4));
    existing._updated = Date.now();
    await setUser(username, existing);
    return reply(`+${amount} CR added to @${esc(username, 50)}\nNew balance: ${existing.credits} CR`);
  }

  // ── /take ─────────────────────────────────────────────────
  if (cmdName === 'take') {
    const username = sanStr(String(opts.username || ''), 50);
    const amount   = parseFloat(opts.amount);
    if (!username)                         return reply('Username is required.', true);
    if (isNaN(amount) || amount < 1 || amount > 100_000) return reply('Amount must be between 1 and 100,000.', true);

    const existing = (await getUser(username)) || {};
    existing.credits  = parseFloat(Math.max(0, (existing.credits || 0) - amount).toFixed(4));
    existing._updated = Date.now();
    await setUser(username, existing);
    return reply(`-${amount} CR removed from @${esc(username, 50)}\nRemaining: ${existing.credits} CR`);
  }

  // ── /setplan ──────────────────────────────────────────────
  if (cmdName === 'setplan') {
    const username = sanStr(String(opts.username || ''), 50);
    const plan     = String(opts.plan || '');
    if (!username)                                      return reply('Username is required.', true);
    if (!['free', 'pro', 'owner'].includes(plan))       return reply('Plan must be: free, pro, or owner.', true);

    const existing = (await getUser(username)) || {};
    existing.plan     = plan;
    if (plan === 'pro')   existing.credits = Math.max(existing.credits || 0, 200);
    if (plan === 'owner') existing.credits = 999999;
    existing._updated = Date.now();
    await setUser(username, existing);
    return reply(`Plan for @${esc(username, 50)} set to ${plan.toUpperCase()}`);
  }

  // ── /ban ──────────────────────────────────────────────────
  if (cmdName === 'ban') {
    const username = sanStr(String(opts.username || ''), 50);
    const reason   = sanStr(String(opts.reason || 'No reason provided'), 200);
    if (!username) return reply('Username is required.', true);

    const existing = (await getUser(username)) || {};
    existing.banned    = true;
    existing.banReason = reason;
    existing.bannedAt  = Date.now();
    existing._updated  = Date.now();
    await setUser(username, existing);
    return reply(`@${esc(username, 50)} has been banned.\nReason: ${esc(reason, 200)}`);
  }

  // ── /unban ────────────────────────────────────────────────
  if (cmdName === 'unban') {
    const username = sanStr(String(opts.username || ''), 50);
    if (!username) return reply('Username is required.', true);

    const existing = (await getUser(username)) || {};
    existing.banned    = false;
    existing.banReason = null;
    existing._updated  = Date.now();
    await setUser(username, existing);
    return reply(`@${esc(username, 50)} has been unbanned.`);
  }

  // ── /userinfo ─────────────────────────────────────────────
  if (cmdName === 'userinfo') {
    const username = sanStr(String(opts.username || ''), 50);
    if (!username) return reply('Username is required.', true);

    const userData = await getUser(username);
    if (!userData) return reply(`User @${esc(username, 50)} was not found.`, true);

    return replyEmbed([{
      title:  `Admin View: @${esc(username, 50)}`,
      color:  0xffd600,
      fields: [
        { name: 'Credits',  value: parseFloat(userData.credits || 0).toFixed(2) + ' CR', inline: true },
        { name: 'Plan',     value: esc(userData.plan || 'free', 20), inline: true },
        { name: 'Banned',   value: userData.banned ? `Yes — ${esc(userData.banReason || '?', 80)}` : 'No', inline: true },
        { name: 'Roblox ID', value: esc(String(userData.robloxId || '—'), 20), inline: true },
        { name: 'Updated',  value: userData._updated ? new Date(userData._updated).toLocaleString('en-US') : '—', inline: true },
        { name: 'Roles',    value: esc((userData.roles || []).join(', ') || 'none', 50), inline: true },
      ],
      footer: { text: 'NEXUS AI Admin Panel' },
    }], '', true);
  }

  // ── /broadcast (owner only) ───────────────────────────────
  if (cmdName === 'broadcast') {
    if (!isOwner(userId)) return reply('This command requires Owner access.', true);

    const message = sanStr(String(opts.message || ''), 1000);
    if (!message) return reply('Message is required.', true);

    const notifChannel = process.env.DISCORD_NOTIF_CHANNEL;
    if (notifChannel) {
      await sendDiscordMessage(notifChannel, `NEXUS AI Broadcast:\n${esc(message, 1000)}`);
    }
    return reply('Broadcast sent.');
  }

  return reply('Unknown command.', true);
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin',  'https://nexusai-roblox.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Signature-Ed25519, X-Signature-Timestamp');
  res.setHeader('X-Content-Type-Options',       'nosniff');
  res.setHeader('X-Frame-Options',              'DENY');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();

  // ── GET: Register slash commands or health check ──────────
  if (req.method === 'GET') {
    if (req.query.register !== '1') {
      return res.json({ status: 'NEXUS AI Discord Bot', version: 'V11 Secure' });
    }

    const token    = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!token || !clientId) {
      return res.status(400).json({ error: 'DISCORD_TOKEN and DISCORD_CLIENT_ID are required.' });
    }

    if (!verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Admin token required to register commands.' });
    }

    const commands = [
      { name: 'help',   description: 'Show NEXUS AI command list' },
      { name: 'status', description: 'Show NEXUS AI system status' },
      {
        name: 'info', description: 'Look up a user',
        options: [{ name: 'username', description: 'Roblox username', type: 3, required: true }],
      },
      {
        name: 'give', description: '[Admin] Add credits to a user',
        options: [
          { name: 'username', description: 'Roblox username', type: 3,  required: true },
          { name: 'amount',   description: 'Credits to add (1–100000)', type: 10, required: true },
        ],
      },
      {
        name: 'take', description: '[Admin] Remove credits from a user',
        options: [
          { name: 'username', description: 'Roblox username', type: 3,  required: true },
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
          { name: 'username', description: 'Roblox username', type: 3, required: true },
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
    ];

    try {
      const regResp = await fetch(
        `https://discord.com/api/v10/applications/${clientId}/commands`,
        {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${token}` },
          body:    JSON.stringify(commands),
        }
      );
      const regData = await regResp.json();
      return res.json({ success: regResp.ok, registered: commands.length, data: regData });
    } catch (err) {
      console.error('[discord] Command registration error:', err.message);
      return res.status(500).json({ error: 'Failed to register commands.' });
    }
  }

  // ── POST ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    if (!checkRateLimit(`discord:${ip}`, 60)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
    }

    const body = req.body || {};

    // ── Internal notification from NEXUS backend ──────────
    if (body._nexusNotify === true) {
      if (!verifyAdminToken(req)) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }

      const notifChannel = process.env.DISCORD_NOTIF_CHANNEL;
      if (!notifChannel) return res.json({ status: 'no notification channel configured' });

      if (body.type === 'payment') {
        await sendDiscordMessage(notifChannel, 'New payment received:', buildPaymentEmbed(body));
      } else if (body.type === 'report') {
        await sendDiscordMessage(notifChannel, 'New bug report:', buildReportEmbed(body));
      } else {
        await sendDiscordMessage(notifChannel, sanStr(String(body.message || 'Notification from NEXUS AI'), 500));
      }

      return res.json({ status: 'ok' });
    }

    // ── Discord PING (type 1) ─────────────────────────────
    if (body.type === 1) {
      const rawBody = JSON.stringify(body);
      const valid   = await verifyDiscordSignature(req, rawBody);
      if (!valid && process.env.DISCORD_PUBLIC_KEY) {
        return res.status(401).json({ error: 'Invalid request signature.' });
      }
      return res.json({ type: 1 });
    }

    // ── Slash command (type 2) ────────────────────────────
    if (body.type === 2) {
      const rawBody = JSON.stringify(body);
      const valid   = await verifyDiscordSignature(req, rawBody);
      if (!valid && process.env.DISCORD_PUBLIC_KEY) {
        console.warn('[discord] Invalid signature from', ip);
        return res.status(401).json({ error: 'Invalid request signature.' });
      }

      try {
        const response = await handleCommand(body);
        return res.json(response);
      } catch (err) {
        console.error('[discord] Command handler error:', err.message);
        return res.json({ type: 4, data: { content: 'An error occurred. Please try again.', flags: 64 } });
      }
    }

    // Acknowledge unknown interaction types
    return res.json({ type: 1 });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}