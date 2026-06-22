// app/api/[...slug]/route.ts
// Catch-all router — single Vercel function for all endpoints
// v10: Handler imports now use the "@/ts" path alias (tsconfig paths + Next.js
//      webpack alias → resolves to "<root>/ts/"); added rate limiting,
//      structured logging, request-size streaming guard, and graceful degradation.
//
// tsconfig.json must include:
//   "paths": { "@/ts/*": ["ts/*"] }
//
// next.config.ts (if needed for runtime resolution) must include:
//   webpack(config) {
//     config.resolve.alias['@/ts'] = path.resolve(__dirname, 'ts');
//     return config;
//   }

import { NextResponse, type NextRequest } from 'next/server';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type HandlerFn = (
  req: AdaptedRequest,
  res: AdaptedResponse,
) => unknown | Promise<unknown>;

export type AdaptedRequest = {
  method:    string;
  url:       string;
  query:     Record<string, string>;
  body:      Record<string, unknown>;
  headers:   Record<string, string>;
  requestId: string;
  startTime: number;
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

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** Maximum allowed request body size in bytes (1 MB) */
const MAX_BODY_BYTES = 1 * 1024 * 1024;

/** Handler execution timeout in milliseconds (30 s) */
const HANDLER_TIMEOUT_MS = 30_000;

/**
 * Allowed CORS origins.
 * Set ALLOWED_ORIGINS env var as a comma-separated list for production,
 * e.g. "https://app.example.com,https://www.example.com".
 * Falls back to wildcard ('*') only in non-production environments.
 */
const ALLOWED_ORIGINS: readonly string[] = (() => {
  const env = process.env.ALLOWED_ORIGINS?.trim();
  if (env) return env.split(',').map((o) => o.trim()).filter(Boolean);
  if (IS_PRODUCTION) {
    console.warn(
      '[route] ALLOWED_ORIGINS is not set — CORS will reject all cross-origin requests in production.',
    );
    return [];
  }
  return ['*'];
})();

// ─── RATE LIMITING ────────────────────────────────────────────────────────────

/**
 * Simple in-process token-bucket rate limiter.
 * Not suitable for multi-instance deployments without an external store
 * (e.g. Redis). For multi-instance use, replace this with an adapter that
 * reads/writes an external atomic counter (Upstash, Vercel KV, etc.).
 *
 * Defaults: 60 requests per IP per 60-second window.
 * Override via env vars RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS.
 */
const RATE_LIMIT_MAX        = parseInt(process.env.RATE_LIMIT_MAX        ?? '60',    10);
const RATE_LIMIT_WINDOW_MS  = parseInt(process.env.RATE_LIMIT_WINDOW_MS  ?? '60000', 10);

type RateLimitBucket = { count: number; resetAt: number };
const rateLimitMap = new Map<string, RateLimitBucket>();

/**
 * Returns true if the request is within the allowed rate limit.
 * Mutates the in-process map as a side-effect.
 */
function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now    = Date.now();
  const bucket = rateLimitMap.get(ip);

  if (!bucket || now >= bucket.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitMap.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }

  bucket.count += 1;
  const remaining = Math.max(0, RATE_LIMIT_MAX - bucket.count);
  return { allowed: bucket.count <= RATE_LIMIT_MAX, remaining, resetAt: bucket.resetAt };
}

/** Periodically prune expired buckets to avoid memory leaks. */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitMap) {
    if (now >= bucket.resetAt) rateLimitMap.delete(key);
  }
}, RATE_LIMIT_WINDOW_MS);

// ─── STRUCTURED LOGGING ───────────────────────────────────────────────────────

type LogLevel = 'info' | 'warn' | 'error';

type LogEntry = {
  level:     LogLevel;
  requestId: string;
  message:   string;
  [key: string]: unknown;
};

function log(level: LogLevel, requestId: string, message: string, extra?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    requestId,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  };

  const line = IS_PRODUCTION
    ? JSON.stringify(entry)
    : `[${entry.timestamp}] [${level.toUpperCase()}] [${requestId}] ${message}` +
      (extra ? ' ' + JSON.stringify(extra) : '');

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
}

// ─── KNOWN ENDPOINTS ──────────────────────────────────────────────────────────
// Valid endpoint names. Handlers are resolved dynamically at runtime (.ts / .js).
// Modules live in the "ts/" directory (renamed from "lib/").

const KNOWN_ENDPOINTS = [
  'admin',
  'ai',
  'auth',
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

// ─── SECURITY HEADERS ─────────────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options':        'DENY',
  'X-XSS-Protection':      '1; mode=block',
  'Referrer-Policy':        'strict-origin-when-cross-origin',
  'Permissions-Policy':     'camera=(), microphone=(), geolocation=()',
  // HSTS — only meaningful over HTTPS / in production
  ...(IS_PRODUCTION
    ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
    : {}),
};

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS_STATIC: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-User-Id, X-Username, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

/**
 * Returns the correct Access-Control-Allow-Origin header value for the given
 * request origin, or null if the origin is not allowed.
 */
function resolveAllowedOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;
  if (ALLOWED_ORIGINS.includes('*')) return '*';
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return null;
}

/**
 * Attaches CORS + security headers to a NextResponse.
 * Always called with the original NextRequest so origin can be validated.
 */
function applyHeaders(res: NextResponse, request: NextRequest): NextResponse {
  const origin        = request.headers.get('origin');
  const allowedOrigin = resolveAllowedOrigin(origin);

  const headers: Record<string, string> = {
    ...CORS_STATIC,
    ...SECURITY_HEADERS,
  };

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    if (allowedOrigin !== '*') headers['Vary'] = 'Origin';
  }

  for (const [k, v] of Object.entries(headers)) {
    try { res.headers.set(k, v); } catch { /* immutable header — skip */ }
  }

  return res;
}

// ─── ERROR CLASSES ────────────────────────────────────────────────────────────

class BodyTooLargeError extends Error {
  constructor() {
    super(`Request body exceeds the ${MAX_BODY_BYTES / 1024} KB limit.`);
    this.name = 'BodyTooLargeError';
  }
}

class HandlerTimeoutError extends Error {
  constructor() {
    super(`Handler did not respond within ${HANDLER_TIMEOUT_MS / 1000} seconds.`);
    this.name = 'HandlerTimeoutError';
  }
}

class UnsupportedMediaTypeError extends Error {
  constructor(contentType: string) {
    super(`Unsupported Content-Type: "${contentType}". Expected application/json, application/x-www-form-urlencoded, or multipart/form-data.`);
    this.name = 'UnsupportedMediaTypeError';
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function newRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extracts the most reliable client IP address from standard proxy headers.
 * Falls back to a placeholder when no IP can be determined (e.g. in tests).
 */
function extractClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??    // Cloudflare
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
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

/**
 * Strips internal error details in production to avoid leaking implementation
 * specifics to clients. Always exposes the requestId for log correlation.
 */
function clientError(
  err: unknown,
  requestId: string,
): Record<string, unknown> {
  if (IS_PRODUCTION) return { requestId };
  const detail = err instanceof Error ? err.message : String(err);
  return { requestId, detail };
}

// ─── BODY PARSER ──────────────────────────────────────────────────────────────

/** Methods that must not carry a request body per RFC 9110. */
const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/**
 * Parses the request body according to its Content-Type.
 *
 * Improvements over v8:
 *   - Throws UnsupportedMediaTypeError for unknown non-empty content types
 *     instead of silently falling back to JSON guessing, which could mask bugs.
 *   - Uses a streaming byte-count guard (ReadableStream reader) so the body
 *     size check works even when Content-Length is absent or spoofed.
 */
async function parseBody(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  if (BODYLESS_METHODS.has(request.method)) return {};

  // Honour Content-Length if the client provided it (not always present)
  const lengthHeader = request.headers.get('content-length');
  if (lengthHeader) {
    const declared = parseInt(lengthHeader, 10);
    if (!Number.isNaN(declared) && declared > MAX_BODY_BYTES) {
      throw new BodyTooLargeError();
    }
  }

  const ct = (request.headers.get('content-type') ?? '').toLowerCase();

  // ── Helper: read body text with a hard byte cap ──────────────────────────
  async function readTextSafe(): Promise<string> {
    if (!request.body) return '';

    const reader  = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let   total   = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) {
          reader.cancel();
          throw new BodyTooLargeError();
        }
        chunks.push(value);
      }
    } finally {
      try { reader.releaseLock(); } catch { /* already released */ }
    }

    const merged = new Uint8Array(total);
    let   offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new TextDecoder().decode(merged);
  }

  try {
    // ── JSON ──────────────────────────────────────────────────────────────────
    if (!ct || ct.includes('application/json')) {
      const text = await readTextSafe();
      return text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
    }

    // ── URL-encoded form ──────────────────────────────────────────────────────
    if (ct.includes('x-www-form-urlencoded')) {
      const text = await readTextSafe();
      return text ? Object.fromEntries(new URLSearchParams(text)) : {};
    }

    // ── Multipart form ────────────────────────────────────────────────────────
    if (ct.includes('multipart/form-data')) {
      const formData = await request.clone().formData();
      const result: Record<string, unknown> = {};
      formData.forEach((v, k) => { result[k] = v; });
      return result;
    }

    // ── Unknown content type with a body — reject rather than guess ───────────
    // If there is no Content-Length or the body could be empty, skip quietly.
    if (lengthHeader && parseInt(lengthHeader, 10) > 0) {
      throw new UnsupportedMediaTypeError(ct);
    }

    return {};
  } catch (err) {
    if (
      err instanceof BodyTooLargeError ||
      err instanceof UnsupportedMediaTypeError
    ) throw err;

    console.warn('[route] parseBody failed:', err instanceof Error ? err.message : err);
    return {};
  }
}

// ─── DYNAMIC HANDLER LOADER ───────────────────────────────────────────────────
// Handlers live in "@/ts/" — resolved via the tsconfig "paths" alias and the
// Next.js webpack alias to "<project-root>/ts/".
//
// Probes ".js" first, then ".ts", so the directory may contain a mix of
// extensions without any change to this router.
//
// Why dynamic import instead of a static @/ts import?
//   The endpoint name is only known at runtime, so we must use a template-
//   literal import(). Next.js / webpack will still tree-shake unused modules
//   because the alias prefix "@/ts/" is stable and recognisable at build time.

const handlerCache = new Map<string, HandlerFn>();

async function loadHandler(endpoint: KnownEndpoint): Promise<HandlerFn | null> {
  const cached = handlerCache.get(endpoint);
  if (cached) return cached;

  for (const ext of ['.js', '.ts'] as const) {
    try {
      // ── @/ts alias → resolves to "<root>/ts/${endpoint}${ext}" at runtime ──
      const mod = (await import(
        `@/ts/${endpoint}${ext}`
      )) as HandlerModule;
      const fn  = resolveHandlerFn(mod);

      if (fn) {
        handlerCache.set(endpoint, fn);
        return fn;
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      // Module not found → try next extension
      if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
        continue;
      }
      // Syntax / runtime error → surface immediately; do not silently skip
      throw err;
    }
  }

  return null; // Not found under any supported extension
}

/**
 * Resolves the handler function from a module, regardless of export style.
 *
 * Priority:
 *   1. Module itself is a function (CommonJS module.exports = fn)
 *   2. module.default is a function (ESM default export)
 *   3. First named function export that is not module metadata
 *
 * Keys excluded from the named-export scan to avoid accidentally treating
 * helper utilities as the handler.
 */
const MODULE_META_KEYS = new Set([
  '__esModule', 'default', 'module', 'exports',
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', // Next.js route exports
]);

function resolveHandlerFn(mod: HandlerModule): HandlerFn | null {
  if (typeof mod          === 'function') return mod as unknown as HandlerFn;
  if (typeof mod.default  === 'function') return mod.default;

  for (const key of Object.keys(mod)) {
    if (!MODULE_META_KEYS.has(key) && typeof mod[key] === 'function') {
      return mod[key] as HandlerFn;
    }
  }

  return null;
}

// ─── REQUEST ADAPTER ──────────────────────────────────────────────────────────

/**
 * Hop-by-hop headers that must NOT be forwarded to upstream handlers
 * (RFC 9110 §7.6.1 / RFC 7230 §6.1).
 */
const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

async function runHandler(
  fn:        HandlerFn,
  request:   NextRequest,
  slug:      string[],
  requestId: string,
  startTime: number,
): Promise<NextResponse> {
  const url  = new URL(request.url);
  const body = await parseBody(request); // may throw BodyTooLargeError / UnsupportedMediaTypeError

  const query = Object.fromEntries(url.searchParams) as Record<string, string>;
  // Expose sub-path segments after the first slug to the handler
  if (slug.length > 1) query._subpath = slug.slice(1).join('/');

  // Forward headers, excluding hop-by-hop headers
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    if (!HOP_BY_HOP_HEADERS.has(k.toLowerCase())) headers[k] = v;
  });

  const req: AdaptedRequest = {
    method:    request.method,
    url:       request.url,
    query,
    body,
    headers,
    requestId,
    startTime,
  };

  const state: ResponseState = {
    status:   200,
    body:     null,
    headers:  { 'X-Request-Id': requestId },
    redirect: null,
  };

  const res: AdaptedResponse = {
    headersSent: false,

    status(code)    { state.status = code; return res; },
    json(data)      { state.body   = data; return res; },
    send(data)      { state.body   = data; return res; },
    end()           {                      return res; },

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

  // Race the handler against a hard timeout to prevent hanging requests
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new HandlerTimeoutError()), HANDLER_TIMEOUT_MS),
  );

  try {
    await Promise.race([Promise.resolve(fn(req, res)), timeout]);
  } catch (err: unknown) {
    // Propagate infrastructure errors up to the main dispatcher
    if (err instanceof BodyTooLargeError)      throw err;
    if (err instanceof HandlerTimeoutError)    throw err;
    if (err instanceof UnsupportedMediaTypeError) throw err;

    // All other errors are handler-level bugs — return 500 with details
    const msg = err instanceof Error ? err.message : String(err);
    log('error', requestId, 'Handler threw an unhandled error', { error: msg });
    return buildResponse(
      {
        status:   500,
        body:     { error: 'Handler error.', ...clientError(err, requestId) },
        headers:  state.headers,
        redirect: null,
      },
      request,
    );
  }

  return buildResponse(state, request);
}

// ─── BUILD NEXTRESPONSE ───────────────────────────────────────────────────────

/**
 * Converts a ResponseState into a NextResponse.
 * Custom handler headers are applied first; CORS + security headers are
 * always added last so they cannot be overridden by handler code.
 */
function buildResponse(state: ResponseState, request: NextRequest): NextResponse {
  const attachCustomHeaders = (res: NextResponse): NextResponse => {
    // Determine which header names are "managed" (CORS / security)
    // so handler code cannot accidentally override them.
    const managed = new Set([
      ...Object.keys(CORS_STATIC),
      ...Object.keys(SECURITY_HEADERS),
      'Access-Control-Allow-Origin',
      'Vary',
    ]);

    for (const [k, v] of Object.entries(state.headers)) {
      if (!managed.has(k)) {
        try { res.headers.set(k, String(v)); } catch { /* skip */ }
      }
    }

    return applyHeaders(res, request);
  };

  // ── Redirect ──────────────────────────────────────────────────────────────
  if (state.redirect) {
    return attachCustomHeaders(
      NextResponse.redirect(state.redirect, { status: state.status }),
    );
  }

  // ── Empty body ────────────────────────────────────────────────────────────
  if (state.body === null || state.body === undefined) {
    return attachCustomHeaders(new NextResponse('', { status: state.status }));
  }

  // ── String body — auto-detect content type ────────────────────────────────
  if (typeof state.body === 'string') {
    const trimmed = state.body.trim();
    const ct =
      trimmed.startsWith('{') || trimmed.startsWith('[')
        ? 'application/json; charset=utf-8'
        : 'text/plain; charset=utf-8';

    return attachCustomHeaders(
      new NextResponse(state.body, {
        status:  state.status,
        headers: { 'Content-Type': ct },
      }),
    );
  }

  // ── Object / array → JSON ─────────────────────────────────────────────────
  return attachCustomHeaders(
    NextResponse.json(state.body, { status: state.status }),
  );
}

// ─── MAIN DISPATCHER ─────────────────────────────────────────────────────────

async function handle(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> },
): Promise<NextResponse> {
  const requestId = newRequestId();
  const startTime = Date.now();
  const clientIp  = extractClientIp(request);

  // ── CORS preflight ────────────────────────────────────────────────────────
  if (request.method === 'OPTIONS') {
    return applyHeaders(new NextResponse(null, { status: 204 }), request);
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const rateCheck = checkRateLimit(clientIp);
  if (!rateCheck.allowed) {
    log('warn', requestId, 'Rate limit exceeded', { ip: clientIp });
    const retryAfterSec = Math.ceil((rateCheck.resetAt - Date.now()) / 1000);
    const res = applyHeaders(
      NextResponse.json(
        { error: 'Too many requests. Please slow down and try again shortly.', requestId },
        { status: 429 },
      ),
      request,
    );
    try {
      res.headers.set('Retry-After',               String(retryAfterSec));
      res.headers.set('X-RateLimit-Limit',         String(RATE_LIMIT_MAX));
      res.headers.set('X-RateLimit-Remaining',     '0');
      res.headers.set('X-RateLimit-Reset',         String(Math.ceil(rateCheck.resetAt / 1000)));
    } catch { /* immutable header — skip */ }
    return res;
  }

  // Attach rate-limit info to every successful response via state.headers
  // (populated into the response builder by runHandler).

  try {
    const { slug: rawSlug } = await context.params;
    const slug     = Array.isArray(rawSlug) ? rawSlug : [rawSlug ?? ''];

    // Sanitize: lowercase + allow only [a-z0-9-]
    const endpoint = (slug[0] ?? '').toLowerCase().replace(/[^a-z0-9\-]/g, '');

    log('info', requestId, `${request.method} /api/${slug.join('/')}`, {
      ip:       clientIp,
      endpoint,
    });

    // ── No endpoint given ─────────────────────────────────────────────────
    if (!endpoint) {
      return applyHeaders(
        NextResponse.json(
          { error: 'No endpoint provided.', available: AVAILABLE_ROUTES, requestId },
          { status: 400 },
        ),
        request,
      );
    }

    // ── Endpoint not registered ───────────────────────────────────────────
    if (!(KNOWN_ENDPOINTS as readonly string[]).includes(endpoint)) {
      return applyHeaders(
        NextResponse.json(
          {
            error:     `Endpoint "${endpoint}" not found.`,
            available: AVAILABLE_ROUTES,
            requestId,
          },
          { status: 404 },
        ),
        request,
      );
    }

    // ── Load handler module ───────────────────────────────────────────────
    let fn: HandlerFn | null;
    try {
      fn = await loadHandler(endpoint as KnownEndpoint);
    } catch (importErr: unknown) {
      log('error', requestId, `Import error for endpoint "${endpoint}"`, {
        error: importErr instanceof Error ? importErr.message : String(importErr),
      });
      return applyHeaders(
        NextResponse.json(
          {
            error: `Failed to load handler "${endpoint}".`,
            ...clientError(importErr, requestId),
          },
          { status: 500 },
        ),
        request,
      );
    }

    if (!fn) {
      return applyHeaders(
        NextResponse.json(
          {
            error:     `Handler "${endpoint}" does not export a valid function.`,
            requestId,
          },
          { status: 500 },
        ),
        request,
      );
    }

    // ── Execute handler ───────────────────────────────────────────────────
    let response: NextResponse;
    try {
      response = await runHandler(fn, request, slug, requestId, startTime);
    } catch (err: unknown) {
      if (err instanceof BodyTooLargeError) {
        return applyHeaders(
          NextResponse.json({ error: err.message, requestId }, { status: 413 }),
          request,
        );
      }
      if (err instanceof UnsupportedMediaTypeError) {
        return applyHeaders(
          NextResponse.json({ error: err.message, requestId }, { status: 415 }),
          request,
        );
      }
      if (err instanceof HandlerTimeoutError) {
        log('error', requestId, `Handler timeout for endpoint "${endpoint}"`, {
          timeoutMs: HANDLER_TIMEOUT_MS,
        });
        return applyHeaders(
          NextResponse.json({ error: err.message, requestId }, { status: 504 }),
          request,
        );
      }
      throw err; // Unexpected — let outer catch handle it
    }

    const elapsed = Date.now() - startTime;
    log('info', requestId, `Response sent`, {
      status:  response.status,
      elapsed: `${elapsed}ms`,
    });

    // Attach rate-limit headers to the final response
    try {
      response.headers.set('X-RateLimit-Limit',     String(RATE_LIMIT_MAX));
      response.headers.set('X-RateLimit-Remaining', String(rateCheck.remaining));
      response.headers.set('X-RateLimit-Reset',     String(Math.ceil(rateCheck.resetAt / 1000)));
    } catch { /* immutable header — skip */ }

    return response;

  } catch (err: unknown) {
    const elapsed = Date.now() - startTime;
    log('error', requestId, 'Fatal unhandled error', {
      elapsed: `${elapsed}ms`,
      error:   err instanceof Error ? err.message : String(err),
    });

    return applyHeaders(
      NextResponse.json(
        { error: 'Internal server error.', ...clientError(err, requestId) },
        { status: 500 },
      ),
      request,
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