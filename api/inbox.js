// api/inbox.js — NEXUS AI Inbox System (SECURE v2)
// Security: admin token for send, rate limiting, XSS sanitization, input validation

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { verifyAdminToken, sanitizeStr, escapeHtml, checkRateLimit } from './_security.js';

const INBOX_FILE = '/tmp/nexus_inbox.json';
const MAX_MSGS_PER_USER = 50;
const MAX_CONTENT_LEN   = 3000;

function getInbox() {
  try {
    if (existsSync(INBOX_FILE)) return JSON.parse(readFileSync(INBOX_FILE, 'utf8'));
  } catch (_) {}
  return {};
}

function saveInbox(d) {
  try { writeFileSync(INBOX_FILE, JSON.stringify(d)); } catch (_) {}
}

function sanitizeMessage(msg) {
  return {
    id:      String(msg.id || ''),
    to:      sanitizeStr(msg.to, 50),
    from:    sanitizeStr(msg.from, 80),
    fromId:  sanitizeStr(msg.fromId, 30),
    subject: sanitizeStr(msg.subject, 200),
    content: sanitizeStr(msg.content, MAX_CONTENT_LEN),
    type:    sanitizeStr(msg.type, 30),
    ts:      Number(msg.ts) || 0,
    read:    !!msg.read,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';

  // ── GET — Read inbox (public, rate-limited) ───────────────────────────────
  if (req.method === 'GET') {
    if (!checkRateLimit(`inbox_get:${ip}`, 60)) {
      return res.status(429).json({ error: 'Rate limit. Coba lagi nanti.' });
    }

    const user = sanitizeStr((req.query.user || ''), 50).toLowerCase().trim();
    if (!user) return res.status(400).json({ error: 'user required' });
    if (!/^[a-z0-9_\-]{1,50}$/i.test(user)) {
      return res.status(400).json({ error: 'Format username tidak valid.' });
    }

    const inbox = getInbox();
    const msgs  = (inbox[user] || []).map(sanitizeMessage).sort((a, b) => b.ts - a.ts);

    return res.status(200).json({
      messages: msgs,
      unread:   msgs.filter(m => !m.read).length,
    });
  }

  // ── POST — Send message (requires admin token) ────────────────────────────
  if (req.method === 'POST') {
    // Only admins/system can send inbox messages — prevent spam
    if (!verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Forbidden: Admin token diperlukan untuk mengirim pesan.' });
    }

    if (!checkRateLimit(`inbox_post:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit. Coba lagi nanti.' });
    }

    const body = req.body || {};
    const { to, from, subject, content, type, sender_id } = body;

    if (!to || !content) {
      return res.status(400).json({ error: 'to dan content wajib diisi.' });
    }

    const toKey = sanitizeStr(String(to), 50).toLowerCase().trim();
    if (!toKey || !/^[a-z0-9_\-]{1,50}$/i.test(toKey)) {
      return res.status(400).json({ error: 'Format username penerima tidak valid.' });
    }

    const msg = {
      id:      Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      to:      toKey,
      from:    sanitizeStr(String(from || 'NEXUS AI'), 80),
      fromId:  sanitizeStr(String(sender_id || 'system'), 30),
      subject: sanitizeStr(String(subject || 'Message from NEXUS AI'), 200),
      content: sanitizeStr(String(content), MAX_CONTENT_LEN),
      type:    sanitizeStr(String(type || 'general'), 30),
      ts:      Date.now(),
      read:    false,
    };

    const inbox = getInbox();
    if (!Array.isArray(inbox[toKey])) inbox[toKey] = [];
    inbox[toKey].unshift(msg);
    if (inbox[toKey].length > MAX_MSGS_PER_USER) {
      inbox[toKey] = inbox[toKey].slice(0, MAX_MSGS_PER_USER);
    }
    saveInbox(inbox);

    return res.status(200).json({ status: 'ok', id: msg.id });
  }

  // ── DELETE — Mark read / delete (requires auth for delete, user self-service for read) ─────
  if (req.method === 'DELETE') {
    const body = req.body || {};
    const { user, id, action } = body;

    if (!user) return res.status(400).json({ error: 'user required' });

    const userKey = sanitizeStr(String(user), 50).toLowerCase().trim();
    if (!userKey || !/^[a-z0-9_\-]{1,50}$/i.test(userKey)) {
      return res.status(400).json({ error: 'Format username tidak valid.' });
    }

    // Deleting messages requires admin token; marking read is user self-service
    const isDeletion = action === 'delete' || (!id && !action);
    if (isDeletion && !verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Forbidden: Admin token diperlukan untuk menghapus pesan.' });
    }

    if (!checkRateLimit(`inbox_del:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit.' });
    }

    const inbox = getInbox();
    if (!Array.isArray(inbox[userKey])) {
      return res.status(200).json({ status: 'ok' });
    }

    if (action === 'read_all') {
      inbox[userKey].forEach(m => m.read = true);
    } else if (id) {
      const safeId = sanitizeStr(String(id), 40);
      if (action === 'delete') {
        inbox[userKey] = inbox[userKey].filter(m => m.id !== safeId);
      } else {
        const msg = inbox[userKey].find(m => m.id === safeId);
        if (msg) msg.read = true;
      }
    }

    saveInbox(inbox);
    return res.status(200).json({ status: 'ok' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}