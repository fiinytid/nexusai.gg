// app/api/[...slug]/route.ts
// Catch-all router — 1 Vercel function untuk semua endpoint
// v4: Full ESM imports, streaming support, improved error handling, Vercel-optimized

import { NextResponse, type NextRequest } from 'next/server';
import { readFileSync }                   from 'fs';
import { join }                           from 'path';
import { pathToFileURL }                  from 'url';

// ─── API HANDLERS ─────────────────────────────────────────────────────────────
// Semua handler wajib menggunakan named export atau default export fungsi
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

type HandlerFn = (req: AdaptedRequest, res: AdaptedResponse) => unknown | Promise<unknown>;

interface HandlerModule {
  default?: HandlerFn;
  [key: string]: unknown;
}

interface AdaptedRequest {
  method:  string;
  url:     string;
  query:   Record<string, string>;
  body:    Record<string, unknown>;
  headers: Record<string, string>;
}

interface AdaptedResponse {
  status:       (code: number) => AdaptedResponse;
  json:         (data: unknown) => AdaptedResponse;
  send:         (data: unknown) => AdaptedResponse;
  end:          () => AdaptedResponse;
  setHeader:    (k: string, v: string) => AdaptedResponse;
  getHeader:    (k: string) => string | undefined;
  removeHeader: (k: string) => AdaptedResponse;
  redirect:     (codeOrUrl: number | string, url?: string) => AdaptedResponse;
  headersSent:  boolean;
}

interface ResponseState {
  status:   number;
  body:     unknown;
  headers:  Record<string, string>;
  redirect: string | null;
}

// ─── ROUTE TABLE ──────────────────────────────────────────────────────────────

const ROUTES: Record<string, HandlerModule | HandlerFn> = {
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

// ─── JS FILE ROUTES ───────────────────────────────────────────────────────────
// GET /api/js/chats          → lib/app/chats.js
// GET /api/js/system_prompt  → lib/app/system_prompt.js

const JS_FILES: Record<string, string> = {
  'chats':         join(process.cwd(), 'lib', 'app', 'chats.js'),
  'system_prompt': join(process.cwd(), 'lib', 'app', 'system_prompt.js'),
};

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id, X-Username, X-Requested-With',
  'Access-Control-Max-Age':       '86400',
};

function applyCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    try { res.headers.set(k, v); } catch (_) { /* immutable header — ignore */ }
  }
  return res;
}

// ─── URL HELPERS ──────────────────────────────────────────────────────────────

function toAbsoluteUrl(redirectUrl: string, requestUrl: string): string {
  if (/^https?:\/\//i.test(redirectUrl)) return redirectUrl;
  try {
    const base = new URL(requestUrl);
    return new URL(redirectUrl, base.origin).toString();
  } catch (_) {
    return redirectUrl;
  }
}

// ─── BODY PARSER ──────────────────────────────────────────────────────────────

async function parseBody(request: NextRequest): Promise<Record<string, unknown>> {
  const ct = (request.headers.get('content-type') ?? '').toLowerCase();

  try {
    if (ct.includes('application/json')) {
      const text = await request.clone().text();
      if (!text.trim()) return {};
      return JSON.parse(text) as Record<string, unknown>;
    }

    if (ct.includes('x-www-form-urlencoded')) {
      const text = await request.clone().text();
      return text ? (Object.fromEntries(new URLSearchParams(text)) as Record<string, unknown>) : {};
    }

    if (ct.includes('multipart/form-data')) {
      const formData = await request.clone().formData();
      const result: Record<string, unknown> = {};
      formData.forEach((v, k) => { result[k] = v; });
      return result;
    }

    // Fallback: attempt JSON parse
    const text = await request.clone().text();
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try { return JSON.parse(text) as Record<string, unknown>; } catch (_) {}
    }
    return {};
  } catch (_) {
    return {};
  }
}

// ─── RESOLVE HANDLER ─────────────────────────────────────────────────────────

function resolveHandlerFn(handler: HandlerModule | HandlerFn): HandlerFn | null {
  if (typeof handler === 'function') return handler as HandlerFn;
  if (typeof (handler as HandlerModule).default === 'function') {
    return (handler as HandlerModule).default as HandlerFn;
  }
  return null;
}

// ─── ADAPTER: NextRequest → Pages-style req/res ───────────────────────────────

async function runHandler(
  fn:      HandlerFn,
  request: NextRequest,
  slug:    string[],
): Promise<NextResponse> {
  const body    = await parseBody(request);
  const url     = new URL(request.url);
  const query   = Object.fromEntries(url.searchParams) as Record<string, string>;
  if (slug.length > 1) query._subpath = slug.slice(1).join('/');

  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k] = v; });

  const req: AdaptedRequest = { method: request.method, url: request.url, query, body, headers };

  const state: ResponseState = {
    status:   200,
    body:     null,
    headers:  { ...CORS_HEADERS },
    redirect: null,
  };

  const res: AdaptedResponse = {
    status(code)           { state.status = code;              return res; },
    json(data)             { state.body   = data;              return res; },
    send(data)             { state.body   = data;              return res; },
    end()                  {                                   return res; },
    setHeader(k, v)        { state.headers[k] = v;             return res; },
    getHeader(k)           { return state.headers[k];               },
    removeHeader(k)        { delete state.headers[k];          return res; },
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
    headersSent: false,
  };

  try {
    await Promise.resolve(fn(req, res));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[route] handler threw:', msg);
    return applyCors(
      NextResponse.json({ error: 'Handler error', detail: msg }, { status: 500 })
    );
  }

  return buildResponse(state, request);
}

// ─── BUILD NEXTRESPONSE FROM STATE ────────────────────────────────────────────

function buildResponse(state: ResponseState, request: NextRequest): NextResponse {
  const applyCustomHeaders = (res: NextResponse): NextResponse => {
    for (const [k, v] of Object.entries(state.headers)) {
      if (!CORS_HEADERS[k]) {
        try { res.headers.set(k, String(v)); } catch (_) {}
      }
    }
    return applyCors(res);
  };

  // Redirect
  if (state.redirect) {
    const res = NextResponse.redirect(state.redirect, { status: state.status });
    return applyCustomHeaders(res);
  }

  // Empty body
  if (state.body === null || state.body === undefined) {
    const res = new NextResponse('', { status: state.status });
    return applyCustomHeaders(res);
  }

  // String body — detect JSON vs plain text
  if (typeof state.body === 'string') {
    const trimmed = state.body.trim();
    const isJson  = trimmed.startsWith('{') || trimmed.startsWith('[');
    const res = new NextResponse(state.body, {
      status:  state.status,
      headers: { 'Content-Type': isJson ? 'application/json' : 'text/plain; charset=utf-8' },
    });
    return applyCustomHeaders(res);
  }

  // Object / array — serialize as JSON
  const res = NextResponse.json(state.body, { status: state.status });
  return applyCustomHeaders(res);
}

// ─── JS FILE HANDLER ─────────────────────────────────────────────────────────

function serveJsFile(filePath: string): NextResponse {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return new NextResponse(content, {
      status:  200,
      headers: {
        'Content-Type':  'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        ...CORS_HEADERS,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'File not found';
    console.error('[route] serveJsFile error:', filePath, msg);
    return applyCors(
      NextResponse.json({ error: 'JS file not found', detail: msg }, { status: 404 })
    );
  }
}

// ─── MAIN DISPATCHER ─────────────────────────────────────────────────────────

async function handle(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> },
): Promise<NextResponse> {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return applyCors(new NextResponse(null, { status: 204 }));
  }

  try {
    const { slug: rawSlug } = await context.params;
    const slug = Array.isArray(rawSlug) ? rawSlug : [rawSlug ?? ''];

    // ── /api/js/<name> ────────────────────────────────────────────────────────
    if (slug[0]?.toLowerCase() === 'js') {
      if (slug.length < 2) {
        return applyCors(
          NextResponse.json(
            { error: 'Nama file JS tidak diberikan.', available: Object.keys(JS_FILES) },
            { status: 400 },
          )
        );
      }

      const jsName = slug[1].toLowerCase().replace(/[^a-z0-9_]/g, '');
      const jsPath = JS_FILES[jsName];

      if (!jsPath) {
        return applyCors(
          NextResponse.json(
            {
              error:     `JS file "${jsName}" tidak ditemukan.`,
              available: Object.keys(JS_FILES),
            },
            { status: 404 },
          )
        );
      }

      return serveJsFile(jsPath);
    }

    // ── /api/<endpoint>[/subpath...] ──────────────────────────────────────────
    const endpoint = slug[0]?.toLowerCase().replace(/[^a-z0-9\-]/g, '') ?? '';

    const handlerModule = ROUTES[endpoint];
    if (!handlerModule) {
      return applyCors(
        NextResponse.json(
          {
            error:     `Endpoint "${endpoint}" tidak ditemukan.`,
            available: [...Object.keys(ROUTES), ...Object.keys(JS_FILES).map(k => `js/${k}`)],
          },
          { status: 404 },
        )
      );
    }

    const fn = resolveHandlerFn(handlerModule as HandlerModule | HandlerFn);
    if (!fn) {
      return applyCors(
        NextResponse.json(
          { error: `Handler "${endpoint}" tidak mengexport fungsi yang valid.` },
          { status: 500 },
        )
      );
    }

    return await runHandler(fn, request, slug);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[route] fatal error:', msg);
    return applyCors(
      NextResponse.json({ error: 'Internal server error.', detail: msg }, { status: 500 })
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