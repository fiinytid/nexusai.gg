// app/api/[...slug]/route.js
// Catch-all router — 1 Vercel function untuk semua endpoint

import { NextResponse } from 'next/server';

import adminHandler   from '../../../lib/admin.js';
import aiHandler      from '../../../lib/ai.js';
import authHandler    from '../../../lib/auth.js';
import controlHandler from '../../../lib/control.js';
import discordHandler from '../../../lib/discord.js';
import gcbHandler     from '../../../lib/google-callback.js';
import inboxHandler   from '../../../lib/inbox.js';
import mainHandler    from '../../../lib/main.js';
import paymentHandler from '../../../lib/payment.js';
import redeemHandler  from '../../../lib/redeem.js';
import reportHandler  from '../../../lib/report.js';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const syncHandler = require('../../../lib/sync.js');

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

// ─── HELPER: relative → absolute URL ─────────────────────────────────────────
function toAbsoluteUrl(redirectUrl, requestUrl) {
  try {
    // Sudah absolute (http/https), langsung pakai
    if (/^https?:\/\//i.test(redirectUrl)) return redirectUrl;
    // Relative path → gabungkan dengan origin request
    const base = new URL(requestUrl);
    return new URL(redirectUrl, base.origin).toString();
  } catch (_) {
    return redirectUrl;
  }
}

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
      // ✅ FIX: pastikan URL selalu absolute
      _redirect = toAbsoluteUrl(url, request.url);
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';