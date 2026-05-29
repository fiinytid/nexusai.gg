// app/api/[...slug]/route.js
// Catch-all router — 1 Vercel function untuk semua endpoint
// FIXED v2: robust body parsing, CORS at router level, better error handling

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

// ─── CORS HEADERS ─────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id, X-Username, X-Requested-With',
  'Access-Control-Max-Age':       '86400',
};

function withCors(nextRes) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => {
    try { nextRes.headers.set(k, v); } catch (_) {}
  });
  return nextRes;
}

// ─── HELPER: relative → absolute URL ─────────────────────────────────────────
function toAbsoluteUrl(redirectUrl, requestUrl) {
  try {
    if (/^https?:\/\//i.test(redirectUrl)) return redirectUrl;
    const base = new URL(requestUrl);
    return new URL(redirectUrl, base.origin).toString();
  } catch (_) {
    return redirectUrl;
  }
}

// ─── BODY PARSER: Robust — handles all content-types ─────────────────────────
async function parseBody(request) {
  try {
    const ct = (request.headers.get('content-type') || '').toLowerCase();

    // Clone request so we can read body multiple times if needed
    const cloned = request.clone();

    if (ct.includes('application/json')) {
      try {
        return await cloned.json();
      } catch (_) {
        // JSON parse failed — try reading as text then parsing
        const text = await request.clone().text().catch(() => '');
        if (!text || !text.trim()) return {};
        try { return JSON.parse(text); } catch (_) { return {}; }
      }
    }

    if (ct.includes('x-www-form-urlencoded')) {
      const text = await cloned.text().catch(() => '');
      return text ? Object.fromEntries(new URLSearchParams(text)) : {};
    }

    if (ct.includes('multipart/form-data')) {
      try {
        const formData = await cloned.formData();
        const result = {};
        formData.forEach((v, k) => { result[k] = v; });
        return result;
      } catch (_) { return {}; }
    }

    // Fallback: try JSON regardless of content-type header
    const text = await cloned.text().catch(() => '');
    if (text && text.trim().startsWith('{')) {
      try { return JSON.parse(text); } catch (_) {}
    }
    return {};

  } catch (_) {
    return {};
  }
}

// ─── ADAPTER: NextRequest (Web API) → req/res (Pages Router style) ───────────
async function runHandler(fn, request, slug) {
  const body = await parseBody(request);

  // Parse headers
  const headers = {};
  request.headers.forEach((v, k) => { headers[k] = v; });

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

  // Mock res state
  let _status   = 200;
  let _body     = null;
  let _headers  = { ...CORS_HEADERS }; // pre-populate CORS in every response
  let _redirect = null;
  let _responded = false;

  const res = {
    status(code)        { _status = code;     return res; },
    json(data)          { _body = data; _responded = true; return res; },
    send(data)          { _body = data; _responded = true; return res; },
    end()               { _responded = true;  return res; },
    setHeader(k, v)     { _headers[k] = v;   return res; },
    getHeader(k)        { return _headers[k]; },
    removeHeader(k)     { delete _headers[k]; return res; },
    redirect(code, url) {
      if (typeof code === 'string') { url = code; code = 302; }
      _status    = code;
      _redirect  = toAbsoluteUrl(url, request.url);
      _responded = true;
      return res;
    },
    // Some handlers check this before writing
    headersSent: false,
  };

  try {
    await Promise.resolve(fn(req, res));
  } catch (handlerErr) {
    console.error('[route] Handler threw:', handlerErr?.message ?? handlerErr);
    const errRes = NextResponse.json(
      { error: 'Handler error: ' + (handlerErr?.message || 'Unknown') },
      { status: 500 }
    );
    return withCors(errRes);
  }

  // Build response
  if (_redirect) {
    const redirectRes = NextResponse.redirect(_redirect, { status: _status });
    // Set non-CORS headers from handler
    Object.entries(_headers).forEach(([k, v]) => {
      if (!CORS_HEADERS[k]) {
        try { redirectRes.headers.set(k, String(v)); } catch (_) {}
      }
    });
    return withCors(redirectRes);
  }

  let nextRes;
  if (_body === null || _body === undefined) {
    nextRes = new NextResponse('', { status: _status });
  } else if (typeof _body === 'string') {
    nextRes = new NextResponse(_body, { status: _status });
    // Try to detect content type
    if (_body.trim().startsWith('{') || _body.trim().startsWith('[')) {
      nextRes.headers.set('Content-Type', 'application/json');
    } else {
      nextRes.headers.set('Content-Type', 'text/plain; charset=utf-8');
    }
  } else {
    nextRes = NextResponse.json(_body, { status: _status });
  }

  // Apply handler headers (CORS already in _headers)
  Object.entries(_headers).forEach(([k, v]) => {
    try { nextRes.headers.set(k, String(v)); } catch (_) {}
  });

  return nextRes;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
async function handle(request, context) {
  // Handle CORS preflight at router level — immediate response
  if (request.method === 'OPTIONS') {
    return withCors(new NextResponse(null, { status: 204 }));
  }

  try {
    const params   = await context.params;
    const slug     = Array.isArray(params.slug)
      ? params.slug
      : [params.slug ?? ''];

    const endpoint = slug[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9\-]/g, '') // allow hyphens for 'google-callback'
      || '';

    const handler = ROUTES[endpoint];
    if (!handler) {
      return withCors(NextResponse.json(
        {
          error:     `Endpoint "${endpoint}" tidak ditemukan.`,
          available: Object.keys(ROUTES),
        },
        { status: 404 }
      ));
    }

    // Resolve handler function — support both default export and direct export
    const fn =
      typeof handler === 'function'        ? handler :
      typeof handler?.default === 'function' ? handler.default :
      null;

    if (!fn) {
      return withCors(NextResponse.json(
        { error: `Handler "${endpoint}" tidak valid atau tidak mengexport fungsi.` },
        { status: 500 }
      ));
    }

    return await runHandler(fn, request, slug);

  } catch (err) {
    console.error('[route] Fatal error:', err?.message ?? err);
    return withCors(NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    ));
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