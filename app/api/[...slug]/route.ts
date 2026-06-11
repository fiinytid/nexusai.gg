// app/api/[...slug]/route.ts
// Catch-all router — 1 Vercel function untuk semua endpoint
// v6: Dynamic import dengan fallback .ts/.js, improved error handling & tracing

import { NextResponse, type NextRequest } from 'next/server';

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
// Daftar nama endpoint yang valid.
// Handler-nya di-resolve secara dinamis saat runtime (mendukung .ts & .js).

const KNOWN_ENDPOINTS = [
  'admin',
  'ai',
  'auth',
  'control',
  'discord',
  'google-callback',
  'inbox',
  'main',
  'payment',
  'redeem',
  'report',
  'sync',
] as const;

type KnownEndpoint = (typeof KNOWN_ENDPOINTS)[number];

const AVAILABLE_ROUTES: string[] = [...KNOWN_ENDPOINTS].sort();

// ─── DYNAMIC HANDLER RESOLVER ─────────────────────────────────────────────────
// Mencoba import modul dengan ekstensi .ts terlebih dahulu, lalu .js sebagai
// fallback. Ini memungkinkan lib/ berisi campuran file .ts dan .js tanpa harus
// mengubah route ini setiap ada perubahan ekstensi.

const handlerCache = new Map<string, HandlerFn>();

async function loadHandler(endpoint: string): Promise<HandlerFn | null> {
  // Return dari cache jika sudah pernah di-load
  const cached = handlerCache.get(endpoint);
  if (cached) return cached;

  // Urutan ekstensi yang dicoba
  const extensions = ['.js', '.ts'];

  for (const ext of extensions) {
    try {
      // Path relatif dari app/api/[...slug]/route.ts ke lib/
      const mod = await import(`../../../lib/${endpoint}${ext}`) as HandlerModule;
      const fn  = resolveHandlerFn(mod);

      if (fn) {
        handlerCache.set(endpoint, fn);
        return fn;
      }
    } catch (err: unknown) {
      // MODULE_NOT_FOUND → coba ekstensi berikutnya
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
        continue;
      }
      // Error lain (syntax, runtime) → lempar supaya tidak diam-diam gagal
      throw err;
    }
  }

  return null; // Tidak ditemukan dengan ekstensi apapun
}

function resolveHandlerFn(mod: HandlerModule): HandlerFn | null {
  if (typeof mod         === 'function') return mod as unknown as HandlerFn;
  if (typeof mod.default === 'function') return mod.default;

  // Beberapa modul CommonJS mengexport fungsi langsung tanpa .default
  for (const key of Object.keys(mod)) {
    if (typeof mod[key] === 'function' && key !== '__esModule') {
      return mod[key] as HandlerFn;
    }
  }

  return null;
}

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

function newRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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

    // Fallback: coba parse sebagai JSON jika berbentuk object/array
    const text    = await request.clone().text();
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

    status(code)    { state.status = code;  return res; },
    json(data)      { state.body   = data;  return res; },
    send(data)      { state.body   = data;  return res; },
    end()           {                       return res; },

    setHeader(k, v) { state.headers[k] = v;    return res; },
    getHeader(k)    { return state.headers[k]; },
    removeHeader(k) { delete state.headers[k]; return res; },

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

  // String body — auto-detect content type
  if (typeof state.body === 'string') {
    const trimmed = state.body.trim();
    const ct      = (trimmed.startsWith('{') || trimmed.startsWith('['))
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

  // CORS preflight
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

    // Endpoint tidak ada di daftar
    if (!(KNOWN_ENDPOINTS as readonly string[]).includes(endpoint)) {
      return applyCors(
        NextResponse.json(
          { error: `Endpoint "${endpoint}" tidak ditemukan.`, available: AVAILABLE_ROUTES, requestId },
          { status: 404 },
        )
      );
    }

    // Dynamic import handler (mendukung .ts & .js)
    let fn: HandlerFn | null;
    try {
      fn = await loadHandler(endpoint);
    } catch (importErr: unknown) {
      const detail = importErr instanceof Error ? importErr.message : String(importErr);
      console.error(`[route][${requestId}] import error untuk "${endpoint}":`, detail);
      return applyCors(
        NextResponse.json(
          { error: `Gagal memuat handler "${endpoint}".`, detail, requestId },
          { status: 500 },
        )
      );
    }

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