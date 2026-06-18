// lib/inbox.ts — NEXUS AI Inbox System (Supabase v4 — TypeScript)
//
// Changes v4:
//   • Storage migrated from /tmp file to Supabase (nexus_inbox table)
//   • Admin token requirement removed — rate-limited open API
//   • All language in English
//   • Promise-based Supabase lock (same pattern as sync.ts)
//   • Exports deleteUserInbox() — called by sync.ts on user deletion

import type { SupabaseClient }                             from '@supabase/supabase-js';
import type { HandlerFn, AdaptedRequest, AdaptedResponse } from '../app/api/[...slug]/route.js';
import { sanitizeStr, checkRateLimit }                    from './_security';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface InboxMessage {
  id:      string;
  to:      string;
  from:    string;
  fromId:  string;
  subject: string;
  content: string;
  type:    string;
  ts:      number;
  read:    boolean;
}

// Supabase row shape — column names differ from interface (SQL reserved words)
interface SbInboxRow {
  id:        string;
  to_user:   string;
  from_user: string;
  from_id:   string;
  subject:   string;
  content:   string;
  type:      string;
  ts:        number;
  read:      boolean;
}

interface SbState {
  client:      SupabaseClient | null;
  ready:       boolean;
  error:       string | null;
  nextRetry:   number;
  envSnapshot: string;
  initPromise: Promise<SupabaseClient | null> | null;
}

interface SbRowRead {
  data:  SbInboxRow[] | null;
  error: unknown;
}

interface SbRowIds {
  data:  { id: string }[] | null;
  error: unknown;
}

interface SbRowWrite {
  error: unknown;
}

interface DeleteBody {
  user?:   string;
  id?:     string;
  action?: string;
  [key: string]: unknown;
}

interface PostBody {
  to?:        string;
  from?:      string;
  subject?:   string;
  content?:   string;
  type?:      string;
  sender_id?: string;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const INBOX_TABLE       = 'nexus_inbox' as const;
const MAX_MSGS_PER_USER = 50;
const MAX_CONTENT_LEN   = 3_000;
const TIMEOUT_OP        = 8_000;
const SB_RETRY_COOLDOWN = 30_000;

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`[timeout] "${label}" exceeded ${ms}ms`)), ms)
    ),
  ]);
}

function makeEnvSnap(...vars: (string | undefined)[]): string {
  return vars.map(v => v ?? '').join('|');
}

function formatSBError(error: unknown): string {
  if (!error) return 'Unknown Supabase error';
  const e = error as Record<string, unknown>;
  const parts: string[] = [String(e.message ?? error)];
  if (e.code)    parts.push(`code=${e.code}`);
  if (e.hint)    parts.push(`hint=${e.hint}`);
  if (e.details) parts.push(`details=${e.details}`);
  return parts.join(' | ');
}

function rowToMessage(row: SbInboxRow): InboxMessage {
  return {
    id:      row.id,
    to:      row.to_user,
    from:    row.from_user,
    fromId:  row.from_id,
    subject: row.subject,
    content: row.content,
    type:    row.type,
    ts:      Number(row.ts),
    read:    Boolean(row.read),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// Isolated from sync.ts to avoid circular dependencies.
// Both modules share the same env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
// ═══════════════════════════════════════════════════════════════════════════

const _sb: SbState = {
  client:      null,
  ready:       false,
  error:       null,
  nextRetry:   0,
  envSnapshot: '',
  initPromise: null,
};

async function _doInitSB(): Promise<SupabaseClient | null> {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !url.startsWith('https://')) {
      throw new Error('SUPABASE_URL is missing or invalid.');
    }
    if (!key || key.length < 20) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing or too short.');
    }

    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(url, key, {
      auth:   { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'X-Client-Info': 'nexus-inbox/4' } },
    });

    _sb.client    = client;
    _sb.ready     = true;
    _sb.error     = null;
    _sb.nextRetry = 0;
    console.log('[inbox] ✅ Supabase client initialized.');
    return client;
  } catch (e: unknown) {
    const msg     = e instanceof Error ? e.message : String(e);
    _sb.error     = msg;
    _sb.ready     = false;
    _sb.client    = null;
    _sb.nextRetry = Date.now() + SB_RETRY_COOLDOWN;
    console.error('[inbox] ❌ Supabase init failed:', msg);
    return null;
  } finally {
    _sb.initPromise = null;
  }
}

async function getSB(): Promise<SupabaseClient | null> {
  const envSnap = makeEnvSnap(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (_sb.envSnapshot && _sb.envSnapshot !== envSnap) {
    _sb.client      = null;
    _sb.ready       = false;
    _sb.error       = null;
    _sb.nextRetry   = 0;
    _sb.initPromise = null;
  }
  _sb.envSnapshot = envSnap;

  if (_sb.ready && _sb.client) return _sb.client;
  if (_sb.error && Date.now() < _sb.nextRetry) {
    console.warn('[inbox] Supabase in cooldown, next retry in',
      Math.ceil((_sb.nextRetry - Date.now()) / 1000), 's');
    return null;
  }
  if (_sb.initPromise) return _sb.initPromise;

  _sb.initPromise = _doInitSB();
  return _sb.initPromise;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function dbGetMessages(toUser: string): Promise<InboxMessage[]> {
  const sb = await getSB();
  if (!sb) throw new Error('Supabase unavailable: ' + (_sb.error ?? 'init failed'));

  const raw = await withTimeout(
    (sb.from(INBOX_TABLE)
       .select('*')
       .eq('to_user', toUser)
       .order('ts', { ascending: false })
       .limit(MAX_MSGS_PER_USER) as unknown) as Promise<unknown>,
    TIMEOUT_OP,
    'dbGetMessages',
  );
  const { data, error } = raw as SbRowRead;
  if (error) throw new Error(formatSBError(error));
  return (data ?? []).map(rowToMessage);
}

async function dbInsertMessage(msg: InboxMessage): Promise<void> {
  const sb = await getSB();
  if (!sb) throw new Error('Supabase unavailable: ' + (_sb.error ?? 'init failed'));

  const row: SbInboxRow = {
    id:        msg.id,
    to_user:   msg.to,
    from_user: msg.from,
    from_id:   msg.fromId,
    subject:   msg.subject,
    content:   msg.content,
    type:      msg.type,
    ts:        msg.ts,
    read:      msg.read,
  };

  const rawInsert = await withTimeout(
    (sb.from(INBOX_TABLE).insert(row) as unknown) as Promise<unknown>,
    TIMEOUT_OP,
    'dbInsertMessage',
  );
  const { error: insertErr } = rawInsert as SbRowWrite;
  if (insertErr) throw new Error(formatSBError(insertErr));

  // Enforce MAX_MSGS_PER_USER: fire-and-forget cleanup of oldest messages
  Promise.resolve().then(async () => {
    try {
      const rawIds = await withTimeout(
        (sb.from(INBOX_TABLE)
           .select('id')
           .eq('to_user', msg.to)
           .order('ts', { ascending: true }) as unknown) as Promise<unknown>,
        TIMEOUT_OP,
        'dbTrimSelect',
      );
      const { data: allRows, error: selErr } = rawIds as SbRowIds;
      if (selErr || !allRows || allRows.length <= MAX_MSGS_PER_USER) return;

      const toDelete = allRows
        .slice(0, allRows.length - MAX_MSGS_PER_USER)
        .map(r => r.id);

      await withTimeout(
        (sb.from(INBOX_TABLE)
           .delete()
           .in('id', toDelete) as unknown) as Promise<unknown>,
        TIMEOUT_OP,
        'dbTrimDelete',
      );
    } catch (e: unknown) {
      console.warn('[inbox] Trim old messages failed (non-fatal):',
        e instanceof Error ? e.message : e);
    }
  }).catch(() => undefined);
}

async function dbMarkAllRead(toUser: string): Promise<void> {
  const sb = await getSB();
  if (!sb) throw new Error('Supabase unavailable');

  const raw = await withTimeout(
    (sb.from(INBOX_TABLE)
       .update({ read: true })
       .eq('to_user', toUser) as unknown) as Promise<unknown>,
    TIMEOUT_OP,
    'dbMarkAllRead',
  );
  const { error } = raw as SbRowWrite;
  if (error) throw new Error(formatSBError(error));
}

async function dbMarkRead(id: string, toUser: string): Promise<void> {
  const sb = await getSB();
  if (!sb) throw new Error('Supabase unavailable');

  const raw = await withTimeout(
    (sb.from(INBOX_TABLE)
       .update({ read: true })
       .eq('id', id)
       .eq('to_user', toUser) as unknown) as Promise<unknown>,
    TIMEOUT_OP,
    'dbMarkRead',
  );
  const { error } = raw as SbRowWrite;
  if (error) throw new Error(formatSBError(error));
}

async function dbDeleteMessage(id: string, toUser: string): Promise<void> {
  const sb = await getSB();
  if (!sb) throw new Error('Supabase unavailable');

  const raw = await withTimeout(
    (sb.from(INBOX_TABLE)
       .delete()
       .eq('id', id)
       .eq('to_user', toUser) as unknown) as Promise<unknown>,
    TIMEOUT_OP,
    'dbDeleteMessage',
  );
  const { error } = raw as SbRowWrite;
  if (error) throw new Error(formatSBError(error));
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED HELPER — called by sync.ts storageDelete()
// ═══════════════════════════════════════════════════════════════════════════

export async function deleteUserInbox(username: string): Promise<void> {
  const sb = await getSB();
  if (!sb) {
    console.warn('[inbox] Cannot delete inbox for user', username,
      '— Supabase unavailable:', _sb.error ?? 'init failed');
    return;
  }
  try {
    const raw = await withTimeout(
      (sb.from(INBOX_TABLE)
         .delete()
         .eq('to_user', username) as unknown) as Promise<unknown>,
      TIMEOUT_OP,
      'deleteUserInbox',
    );
    const { error } = raw as SbRowWrite;
    if (error) throw new Error(formatSBError(error));
    console.log('[inbox] ✅ Inbox cleared for deleted user:', username);
  } catch (e: unknown) {
    console.error('[inbox] Failed to delete inbox for user:', username,
      e instanceof Error ? e.message : e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE SANITIZER
// ═══════════════════════════════════════════════════════════════════════════

function sanitizeMessage(msg: Partial<InboxMessage>): InboxMessage {
  return {
    id:      String(msg.id      ?? ''),
    to:      sanitizeStr(msg.to,      50),
    from:    sanitizeStr(msg.from,    80),
    fromId:  sanitizeStr(msg.fromId,  30),
    subject: sanitizeStr(msg.subject, 200),
    content: sanitizeStr(msg.content, MAX_CONTENT_LEN),
    type:    sanitizeStr(msg.type,    30),
    ts:      Number(msg.ts) || 0,
    read:    !!msg.read,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

const handler: HandlerFn = async (req: AdaptedRequest, res: AdaptedResponse) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options',       'nosniff');
  res.setHeader('Cache-Control',                'no-store');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const ip: string = (req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]?.trim() || 'unknown';

  // ── GET — Read inbox ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!checkRateLimit(`inbox_get:${ip}`, 60)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    const user = sanitizeStr(req.query['user'] ?? '', 50).toLowerCase().trim();
    if (!user) return res.status(400).json({ error: 'Parameter "user" is required.' });
    if (!/^[a-z0-9_\-]{1,50}$/i.test(user)) {
      return res.status(400).json({ error: 'Invalid username format.' });
    }

    try {
      const msgs = await dbGetMessages(user);
      return res.status(200).json({
        messages: msgs.map(sanitizeMessage),
        unread:   msgs.filter(m => !m.read).length,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[inbox] GET error:', msg);
      return res.status(500).json({ error: 'Failed to fetch messages.', detail: msg });
    }
  }

  // ── POST — Send message ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    if (!checkRateLimit(`inbox_post:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    const body = (req.body ?? {}) as PostBody;
    const { to, from, subject, content, type, sender_id } = body;

    if (!to || !content) {
      return res.status(400).json({ error: '"to" and "content" are required.' });
    }

    const toKey = sanitizeStr(String(to), 50).toLowerCase().trim();
    if (!toKey || !/^[a-z0-9_\-]{1,50}$/i.test(toKey)) {
      return res.status(400).json({ error: 'Invalid recipient username format.' });
    }

    const msg: InboxMessage = {
      id:      Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      to:      toKey,
      from:    sanitizeStr(String(from      ?? 'NEXUS AI'), 80),
      fromId:  sanitizeStr(String(sender_id ?? 'system'),   30),
      subject: sanitizeStr(String(subject   ?? 'Message from NEXUS AI'), 200),
      content: sanitizeStr(String(content),  MAX_CONTENT_LEN),
      type:    sanitizeStr(String(type       ?? 'general'), 30),
      ts:      Date.now(),
      read:    false,
    };

    try {
      await dbInsertMessage(msg);
      return res.status(200).json({ status: 'ok', id: msg.id });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[inbox] POST error:', errMsg);
      return res.status(500).json({ error: 'Failed to send message.', detail: errMsg });
    }
  }

  // ── DELETE — Mark read / delete ───────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!checkRateLimit(`inbox_del:${ip}`, 30)) {
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }

    const body = (req.body ?? {}) as DeleteBody;
    const { user, id, action } = body;

    if (!user) return res.status(400).json({ error: '"user" is required.' });

    const userKey = sanitizeStr(String(user), 50).toLowerCase().trim();
    if (!userKey || !/^[a-z0-9_\-]{1,50}$/i.test(userKey)) {
      return res.status(400).json({ error: 'Invalid username format.' });
    }

    try {
      if (action === 'read_all') {
        await dbMarkAllRead(userKey);
      } else if (id) {
        const safeId = sanitizeStr(String(id), 40);
        if (action === 'delete') {
          await dbDeleteMessage(safeId, userKey);
        } else {
          // Default with id = mark that message as read
          await dbMarkRead(safeId, userKey);
        }
      } else {
        // No id, no action = mark all read (backwards-compatible)
        await dbMarkAllRead(userKey);
      }
      return res.status(200).json({ status: 'ok' });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[inbox] DELETE error:', errMsg);
      return res.status(500).json({ error: 'Operation failed.', detail: errMsg });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;