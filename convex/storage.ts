import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";

// ── TUNABLES ───────────────────────────────────────────────────────────────────
const MAX_BASE64_LEN     = 14_000_000; // ~10.5 MB decoded ceiling (base64 is ~1.37x)
const MAX_DECODED_BYTES  = 10 * 1024 * 1024; // 10 MB hard cap per GIF
const RATE_USER_PER_MIN  = 20;   // uploads
const RATE_IP_PER_MIN    = 60;
const MAX_LIST_LIMIT     = 100;
const DEFAULT_LIST_LIMIT = 30;
const ALLOWED_MIME       = new Set(["image/gif", "image/png", "image/jpeg", "image/webp"]);

// ── ALLOWED ORIGINS (mirrors control.ts) ───────────────────────────────────────
const ALLOWED_ORIGINS = new Set<string>([
  "https://nexusai-rbx.vercel.app",
  "https://nexusai.gg",
  "http://localhost:3000",
  "https://fine-setter-131.convex.site",
  "https://brazen-lapwing-697.convex.site",
]);

// ── SANITISERS (mirrors control.ts conventions) ────────────────────────────────
function san(user: unknown): string {
  if (user == null) return "default";
  return String(user)
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .toLowerCase()
    .substring(0, 40) || "default";
}

function sanStr(str: unknown, maxLen = 200): string {
  if (typeof str !== "string") str = String(str ?? "");
  return (str as string)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/[<>]/g, "")
    .substring(0, maxLen);
}

function sanInt(val: unknown, def = 0, min = 0, max = 999_999): number {
  const n = parseInt(String(val ?? ""), 10);
  return isNaN(n) ? def : Math.max(min, Math.min(max, n));
}

// ── CORS / RESPONSE HELPERS (mirrors control.ts) ───────────────────────────────
function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin":  ALLOWED_ORIGINS.has(origin) ? origin : "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": [
      "Content-Type", "Authorization", "X-Admin-Token",
      "X-Session-Token", "X-Api-Key",
    ].join(", "),
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options":        "DENY",
  };
}

function jsonResp(data: unknown, status = 200, cors: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ ...(data as object), ts: Date.now() }),
    { status, headers: { "Content-Type": "application/json", ...cors } }
  );
}

function errResp(
  cors: Record<string, string>, code: number, error: string,
  extra: Record<string, unknown> = {}
): Response {
  const status = code >= 400 && code < 600 ? code : 500;
  return jsonResp({ ok: false, status: "error", error, ...extra }, status, cors);
}

function getClientIp(request: Request): string {
  return (
    (request.headers.get("x-real-ip") ?? "") ||
    (request.headers.get("x-forwarded-for") ?? "")
  ).split(",")[0].trim().substring(0, 45);
}

// ── BASE64 → BLOB ────────────────────────────────────────────────────────────────
function decodeBase64(input: string): Uint8Array {
  // Strip a data: URL prefix if present, e.g. "data:image/gif;base64,AAAA..."
  const commaIdx = input.indexOf(",");
  const cleaned  = input.startsWith("data:") && commaIdx !== -1
    ? input.slice(commaIdx + 1)
    : input;
  const binary = atob(cleaned);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function detectMimeFromBase64Prefix(input: string): string | null {
  const m = /^data:([a-zA-Z0-9/+.-]+);base64,/.exec(input);
  return m ? m[1].toLowerCase() : null;
}

// ── MAIN HTTP ACTION ───────────────────────────────────────────────────────────
export const storageHandler = httpAction(async (ctx, request) => {
  try {
    const cors = buildCorsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
    if (request.method === "GET")     return await handleGet(ctx, request, cors);
    if (request.method === "POST")    return await handlePost(ctx, request, cors);
    if (request.method === "DELETE")  return await handleDelete(ctx, request, cors);
    return errResp(cors, 405, "Method not allowed.");
  } catch (err) {
    console.error("[NEXUS storage]", (err as Error)?.message ?? err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error.", ts: Date.now() }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// ── GET ────────────────────────────────────────────────────────────────────────
// GET /storage?id=<storageRecordId>        → redirect to the file's URL
// GET /storage?user=<username>             → list that user's uploaded gifs
// GET /storage?user=<username>&unread=1    → list only gifs not yet seen by web
async function handleGet(
  ctx: ActionCtx, request: Request, cors: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const q   = Object.fromEntries(url.searchParams.entries());

  // ── Serve / redirect a single file by record id ──
  if (q["id"]) {
    const record = await ctx.runQuery(internal.store.getGifRecord, {
      id: sanStr(q["id"], 64),
    });
    if (!record) return errResp(cors, 404, "File not found.");

    const fileUrl = await ctx.storage.getUrl(record.storageId);
    if (!fileUrl) return errResp(cors, 404, "File no longer exists in storage.");

    if (q["redirect"] === "0") {
      return jsonResp({ ok: true, id: record._id, url: fileUrl, user: record.username, mime: record.mime, createdAt: record.createdAt }, 200, cors);
    }
    return Response.redirect(fileUrl, 302);
  }

  // ── List gifs belonging to a user ──
  if (q["user"]) {
    const username  = san(q["user"]);
    const limit     = sanInt(q["limit"], DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT);
    const unreadOnly = q["unread"] === "1";

    const records = await ctx.runQuery(internal.store.listGifRecords, {
      username, limit, unreadOnly,
    });

    const gifs = await Promise.all(
      records.map(async (r) => ({
        id:        r._id,
        url:       await ctx.storage.getUrl(r.storageId),
        mime:      r.mime,
        name:      r.name,
        seen:      r.seen,
        createdAt: r.createdAt,
      }))
    );

    return jsonResp({
      ok: true, user: username,
      gifs: gifs.filter((g) => g.url),
      count: gifs.length,
    }, 200, cors);
  }

  return errResp(cors, 400, 'Provide either "id" or "user" as a query parameter.');
}

// ── POST ───────────────────────────────────────────────────────────────────────
// Body: { user, base64, mime?, name? }
// Called by the Roblox Studio plugin after CaptureService records a play-test gif.
async function handlePost(
  ctx: ActionCtx, request: Request, cors: Record<string, string>
): Promise<Response> {
  const ip = getClientIp(request);

  const okIp = await ctx.runMutation(internal.store.checkAndIncrRateLimit, {
    key: ip, kind: "ip", max: RATE_IP_PER_MIN, windowMs: 60_000,
  });
  if (!okIp) return errResp(cors, 429, "Rate limit exceeded.");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return errResp(cors, 400, "Invalid JSON body.");
  }

  const username = san(body["user"] ?? body["_user"] ?? "");
  if (!username || username === "default") {
    return errResp(cors, 400, '"user" is required.');
  }

  const okUser = await ctx.runMutation(internal.store.checkAndIncrRateLimit, {
    key: username, kind: "user", max: RATE_USER_PER_MIN, windowMs: 60_000,
  });
  if (!okUser) return errResp(cors, 429, "Rate limit exceeded for this user.");

  const rawBase64 = String(body["base64"] ?? body["data"] ?? "");
  if (!rawBase64) return errResp(cors, 400, '"base64" is required.');
  if (rawBase64.length > MAX_BASE64_LEN) {
    return errResp(cors, 413, `File too large. Max ~${Math.floor(MAX_DECODED_BYTES / 1024 / 1024)}MB decoded.`);
  }

  const inlineMime = detectMimeFromBase64Prefix(rawBase64);
  const mime       = (sanStr(body["mime"] ?? inlineMime ?? "image/gif", 60)).toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return errResp(cors, 400, `Unsupported mime type "${mime}". Allowed: ${[...ALLOWED_MIME].join(", ")}`);
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(rawBase64);
  } catch {
    return errResp(cors, 400, "Failed to decode base64 payload.");
  }

  if (bytes.byteLength > MAX_DECODED_BYTES) {
    return errResp(cors, 413, `File too large (${(bytes.byteLength / 1024 / 1024).toFixed(2)}MB). Max ${Math.floor(MAX_DECODED_BYTES / 1024 / 1024)}MB.`);
  }
  if (bytes.byteLength === 0) {
    return errResp(cors, 400, "Decoded file is empty.");
  }

  // Newer TS lib defs type Uint8Array's underlying buffer as
  // ArrayBufferLike (ArrayBuffer | SharedArrayBuffer), but BlobPart only
  // accepts a concrete ArrayBuffer — this is a type-level mismatch only.
  // `bytes` always comes from decodeBase64()'s `new Uint8Array(n)`, which
  // is never backed by a SharedArrayBuffer, so the cast is safe at runtime.
  const blob       = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
  const storageId  = await ctx.storage.store(blob);
  const name       = sanStr(body["name"] ?? "play_test_capture", 100);

  const recordId = await ctx.runMutation(internal.store.insertGifRecord, {
    username,
    storageId,
    mime,
    name,
    sizeBytes: bytes.byteLength,
    createdAt: Date.now(),
  });

  const fileUrl = await ctx.storage.getUrl(storageId);

  // Notify the web app via the same AI Feed channel used elsewhere, so the
  // explore/publish UI can surface "new gif available" without polling hard.
  await ctx.runMutation(internal.store.pushAiFeedEntry, {
    username,
    kind:    "gif_captured",
    summary: `New play-test capture ready: ${name}`,
    data:    JSON.stringify({ id: recordId, url: fileUrl, mime }),
    ts:      Date.now(),
  });

  return jsonResp({
    ok: true, status: "ok",
    id:   recordId,
    url:  fileUrl,
    mime, name,
    sizeBytes: bytes.byteLength,
  }, 200, cors);
}

// ── DELETE ─────────────────────────────────────────────────────────────────────
// DELETE /storage?id=<storageRecordId>&user=<username>
// A user may only delete their own gif record + underlying file.
async function handleDelete(
  ctx: ActionCtx, request: Request, cors: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const id       = sanStr(url.searchParams.get("id") ?? "", 64);
  const username = san(url.searchParams.get("user") ?? "");

  if (!id)       return errResp(cors, 400, '"id" is required.');
  if (!username) return errResp(cors, 400, '"user" is required.');

  const record = await ctx.runQuery(internal.store.getGifRecord, { id });
  if (!record) return errResp(cors, 404, "File not found.");
  if (record.username !== username) {
    return errResp(cors, 403, "You may only delete your own uploads.");
  }

  await ctx.storage.delete(record.storageId);
  await ctx.runMutation(internal.store.deleteGifRecord, { id });

  return jsonResp({ ok: true, status: "ok", deleted: id }, 200, cors);
}