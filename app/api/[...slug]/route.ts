// app/api/[...slug]/route.ts
// Catch-all router — 1 Vercel function untuk semua endpoint
// v5: Removed /lib/app JS serving, improved types, request tracing & timing

import { NextResponse, type NextRequest } from 'next/server';

// ─── API HANDLERS ─────────────────────────────────────────────────────────────

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
import syncHandler    from '../../../lib/sync.js';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type HandlerFn = (
  req: AdaptedRequest,
  res: AdaptedResponse,
) => unknown | Promise<unknown>;

export type AdaptedRequest = {
  method:  string;
  url:     string;
  query:   Record<string, string>;
  body:    Record<string, unknown>;
  headers: Record<string, string>;
};

export type AdaptedResponse = {
  status:       (code: number) => AdaptedResponse;
  json:         (data: unknown) => AdaptedResponse;
  send:         (data: unknown) => AdaptedResponse;
  end:          () => AdaptedResponse;
  setHeader:    (k: string, v: string) => AdaptedResponse;
  getHeader:    (k: string) => string | undefined;
  removeHeader: (k: string) => AdaptedResponse;
  redirect:     (codeOrUrl: number | string, url?: string) => AdaptedResponse;
  headersSent:  boolean;
};

type HandlerModule = { default?: HandlerFn; [key: string]: unknown };

type ResponseState = {
  status:   number;
  body:     unknown;
  headers:  Record<string, string>;
  redirect: string | null;
};

// ─── ROUTE TABLE ──────────────────────────────────────────────────────────────

const ROUTES: Record<string, HandlerModule | HandlerFn> = {
  admin:             adminHandler,
  ai:                aiHandler,
  auth:              authHandler,
  control:           controlHandler,
  discord:           discordHandler,
  'google-callback': gcbHandler,
  inbox:             inboxHandler,
  main:              mainHandler,
  payment:           paymentHandler,
  redeem:            redeemHandler,
  report:            reportHandler,
  sync:              syncHandler,
};

const AVAILABLE_ROUTES = Object.keys(ROUTES).sort();

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id, X-Username, X-Requested-With',
  'Access-Control-Max-Age':       '86400',
};

function applyCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    try { res.headers.set(k, v); } catch { /* immutable header — skip */ }
  }
  return res;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Buat UUID sederhana untuk request tracing */
function newRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Resolve URL relatif ke absolut berdasarkan origin request */
function toAbsoluteUrl(redirectUrl: string, requestUrl: string): string {
  if (/^https?:\/\//i.test(redirectUrl)) return redirectUrl;
  try {
    const { origin } = new URL(requestUrl);
    return new URL(redirectUrl, origin).toString();
  } catch {
    return redirectUrl;
  }
}

// ─── BODY PARSER ──────────────────────────────────────────────────────────────

async function parseBody(request: NextRequest): Promise<Record<string, unknown>> {
  const ct = (request.headers.get('content-type') ?? '').toLowerCase();

  try {
    // JSON
    if (ct.includes('application/json')) {
      const text = await request.clone().text();
      return text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
    }

    // URL-encoded form
    if (ct.includes('x-www-form-urlencoded')) {
      const text = await request.clone().text();
      return text ? Object.fromEntries(new URLSearchParams(text)) : {};
    }

    // Multipart form
    if (ct.includes('multipart/form-data')) {
      const formData = await request.clone().formData();
      const result: Record<string, unknown> = {};
      formData.forEach((v, k) => { result[k] = v; });
      return result;
    }

    // Fallback: coba parse sebagai JSON jika bentuknya seperti object/array
    const text = await request.clone().text();
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed) as Record<string, unknown>; } catch { /* bukan JSON */ }
    }

    return {};
  } catch (err) {
    console.warn('[route] parseBody failed:', err instanceof Error ? err.message : err);
    return {};
  }
}

// ─── RESOLVE HANDLER ─────────────────────────────────────────────────────────

function resolveHandlerFn(mod: HandlerModule | HandlerFn): HandlerFn | null {
  if (typeof mod === 'function') return mod;
  if (typeof mod.default === 'function') return mod.default;
  return null;
}

// ─── REQUEST ADAPTER ─────────────────────────────────────────────────────────

async function runHandler(
  fn:        HandlerFn,
  request:   NextRequest,
  slug:      string[],
  requestId: string,
): Promise<NextResponse> {
  const url   = new URL(request.url);
  const body  = await parseBody(request);
  const query = Object.fromEntries(url.searchParams) as Record<string, string>;

  // Expose subpath (slug setelah segment pertama) ke handler via query
  if (slug.length > 1) query._subpath = slug.slice(1).join('/');

  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k] = v; });

  const req: AdaptedRequest = {
    method: request.method,
    url:    request.url,
    query,
    body,
    headers,
  };

  const state: ResponseState = {
    status:   200,
    body:     null,
    headers:  { ...CORS_HEADERS, 'X-Request-Id': requestId },
    redirect: null,
  };

  const res: AdaptedResponse = {
    headersSent: false,

    status(code)     { state.status = code;  return res; },
    json(data)       { state.body   = data;  return res; },
    send(data)       { state.body   = data;  return res; },
    end()            {                       return res; },

    setHeader(k, v)  { state.headers[k] = v;   return res; },
    getHeader(k)     { return state.headers[k]; },
    removeHeader(k)  { delete state.headers[k]; return res; },

    redirect(codeOrUrl, url?) {
      if (typeof codeOrUrl === 'string') {
        state.status   = 302;
        state.redirect = toAbsoluteUrl(codeOrUrl, request.url);
      } else {
        state.status   = codeOrUrl;
        state.redirect = toAbsoluteUrl(url ?? '/', request.url);
      }
      return res;
    },
  };

  try {
    await Promise.resolve(fn(req, res));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[route][${requestId}] handler threw:`, msg);
    return applyCors(
      NextResponse.json(
        { error: 'Handler error', detail: msg, requestId },
        { status: 500 },
      )
    );
  }

  return buildResponse(state);
}

// ─── BUILD NEXTRESPONSE ───────────────────────────────────────────────────────

function buildResponse(state: ResponseState): NextResponse {
  /** Tulis header custom (non-CORS) ke response */
  const attachHeaders = (res: NextResponse): NextResponse => {
    for (const [k, v] of Object.entries(state.headers)) {
      if (!Object.hasOwn(CORS_HEADERS, k)) {
        try { res.headers.set(k, String(v)); } catch { /* skip */ }
      }
    }
    return applyCors(res);
  };

  // Redirect
  if (state.redirect) {
    return attachHeaders(
      NextResponse.redirect(state.redirect, { status: state.status })
    );
  }

  // Body kosong
  if (state.body === null || state.body === undefined) {
    return attachHeaders(new NextResponse('', { status: state.status }));
  }

  // String body — auto-detect tipe konten
  if (typeof state.body === 'string') {
    const trimmed = state.body.trim();
    const ct      = trimmed.startsWith('{') || trimmed.startsWith('[')
      ? 'application/json; charset=utf-8'
      : 'text/plain; charset=utf-8';

    return attachHeaders(
      new NextResponse(state.body, {
        status:  state.status,
        headers: { 'Content-Type': ct },
      })
    );
  }

  // Object / array → JSON
  return attachHeaders(
    NextResponse.json(state.body, { status: state.status })
  );
}

// ─── MAIN DISPATCHER ─────────────────────────────────────────────────────────

async function handle(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> },
): Promise<NextResponse> {
  const requestId = newRequestId();
  const startTime = Date.now();

  // CORS preflight — selesaikan lebih awal
  if (request.method === 'OPTIONS') {
    return applyCors(new NextResponse(null, { status: 204 }));
  }

  try {
    const { slug: rawSlug } = await context.params;
    const slug     = Array.isArray(rawSlug) ? rawSlug : [rawSlug ?? ''];
    const endpoint = (slug[0] ?? '').toLowerCase().replace(/[^a-z0-9\-]/g, '');

    console.info(`[route][${requestId}] ${request.method} /api/${slug.join('/')}`);

    // Endpoint tidak diberikan
    if (!endpoint) {
      return applyCors(
        NextResponse.json(
          { error: 'Endpoint tidak diberikan.', available: AVAILABLE_ROUTES, requestId },
          { status: 400 },
        )
      );
    }

    // Endpoint tidak dikenal
    const handlerModule = ROUTES[endpoint];
    if (!handlerModule) {
      return applyCors(
        NextResponse.json(
          { error: `Endpoint "${endpoint}" tidak ditemukan.`, available: AVAILABLE_ROUTES, requestId },
          { status: 404 },
        )
      );
    }

    // Handler tidak valid
    const fn = resolveHandlerFn(handlerModule as HandlerModule | HandlerFn);
    if (!fn) {
      return applyCors(
        NextResponse.json(
          { error: `Handler "${endpoint}" tidak mengexport fungsi yang valid.`, requestId },
          { status: 500 },
        )
      );
    }

    const response = await runHandler(fn, request, slug, requestId);

    const elapsed = Date.now() - startTime;
    console.info(`[route][${requestId}] ${response.status} — ${elapsed}ms`);

    return response;

  } catch (err: unknown) {
    const msg     = err instanceof Error ? err.message : String(err);
    const elapsed = Date.now() - startTime;
    console.error(`[route][${requestId}] fatal error (${elapsed}ms):`, msg);

    return applyCors(
      NextResponse.json(
        { error: 'Internal server error.', detail: msg, requestId },
        { status: 500 },
      )
    );
  }
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

export const GET     = handle;
export const POST    = handle;
export const PUT     = handle;
export const PATCH   = handle;
export const DELETE  = handle;
export const OPTIONS = handle;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';