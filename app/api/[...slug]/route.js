// app/api/[...slug]/route.js
// Catch-all router — 1 Vercel function untuk semua endpoint
// Handler ada di api/ (root), tidak dihitung sbg function terpisah

import { NextResponse } from 'next/server';

import adminHandler   from '../../../api/admin.js';
import aiHandler      from '../../../api/ai.js';
import authHandler    from '../../../api/auth.js';
import controlHandler from '../../../api/control.js';
import discordHandler from '../../../api/discord.js';
import gcbHandler     from '../../../api/google-callback.js';
import inboxHandler   from '../../../api/inbox.js';
import mainHandler    from '../../../api/main.js';
import paymentHandler from '../../../api/payment.js';
import redeemHandler  from '../../../api/redeem.js';
import reportHandler  from '../../../api/report.js';

// sync.js pakai CJS (module.exports) — pakai createRequire
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const syncHandler = require('../../../api/sync.js');

// ─── ROUTE TABLE ──────────────────────────────────────────────────────────────
const ROUTES = {
  'admin':           adminHandler,
  'ai':              aiHandler,
  'auth':            authHandler,
  'control':         controlHandler,
  'discord':         discordHandler,
  'google-callback': gcbHandler,
  'inbox':           inboxHandler,
  'main':            mainHandler,
  'payment':         paymentHandler,
  'redeem':          redeemHandler,
  'report':          reportHandler,
  'sync':            syncHandler,
};

// ─── ADAPTER: NextRequest (Web API) → req/res (Pages Router style) ───────────
async function runHandler(fn, request, slug) {
  // Parse body
  let body = {};
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = await request.json().catch(() => ({}));
    } else if (ct.includes('x-www-form-urlencoded')) {
      const text = await request.text().catch(() => '');
      body = Object.fromEntries(new URLSearchParams(text));
    }
  } catch (_) {}

  // Parse headers
  const headers = {};
  request.headers.forEach((v, k) => (headers[k] = v));

  // Parse query params
  const url   = new URL(request.url);
  const query = Object.fromEntries(url.searchParams);
  // slug[1+] jadi sub-path query (misal /api/control?user=x)
  if (slug.length > 1) query._subpath = slug.slice(1).join('/');

  // Mock req
  const req = {
    method:  request.method,
    url:     request.url,
    query,
    body,
    headers,
  };

  // Mock res
  let _status   = 200;
  let _body     = null;
  let _headers  = {};
  let _redirect = null;

  const res = {
    status(code)        { _status = code;     return res; },
    json(data)          { _body   = data;     return res; },
    send(data)          { _body   = data;     return res; },
    end()               {                     return res; },
    setHeader(k, v)     { _headers[k] = v;   return res; },
    getHeader(k)        { return _headers[k]; },
    removeHeader(k)     { delete _headers[k]; return res; },
    redirect(code, url) {
      if (typeof code === 'string') { url = code; code = 302; }
      _status   = code;
      _redirect = url;
      return res;
    },
    headersSent: false,
  };

  await Promise.resolve(fn(req, res));

  if (_redirect) {
    return NextResponse.redirect(_redirect, { status: _status });
  }

  const nextRes = typeof _body === 'string'
    ? new NextResponse(_body, { status: _status })
    : NextResponse.json(_body ?? {}, { status: _status });

  Object.entries(_headers).forEach(([k, v]) => {
    try { nextRes.headers.set(k, String(v)); } catch (_) {}
  });

  return nextRes;
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────
async function handle(request, context) {
  try {
    const params   = await context.params;
    const slug     = Array.isArray(params.slug) ? params.slug : [params.slug ?? ''];
    const endpoint = slug[0]?.toLowerCase().replace(/[^a-z0-9\-]/g, '') || '';

    const handler = ROUTES[endpoint];
    if (!handler) {
      return NextResponse.json(
        { error: `Endpoint "${endpoint}" tidak ditemukan.`, available: Object.keys(ROUTES) },
        { status: 404 }
      );
    }

    // Support ESM default export dan CJS module.exports
    const fn = typeof handler === 'function'
      ? handler
      : typeof handler?.default === 'function'
        ? handler.default
        : null;

    if (!fn) {
      return NextResponse.json({ error: `Handler "${endpoint}" tidak valid.` }, { status: 500 });
    }

    return await runHandler(fn, request, slug);

  } catch (err) {
    console.error('[route] Error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export const GET     = handle;
export const POST    = handle;
export const PUT     = handle;
export const PATCH   = handle;
export const DELETE  = handle;
export const OPTIONS = handle;

// Node.js runtime wajib — handler pakai fs, crypto, dll
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';