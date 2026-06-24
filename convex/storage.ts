import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";

// ── TUNABLES ───────────────────────────────────────────────────────────────────
const MAX_BASE64_LEN     = 14_000_000; // ~10.5 MB decoded ceiling (base64 is ~1.37x)
const MAX_DECODED_BYTES  = 10 * 1024 * 1024; // 10 MB hard cap per file
const RATE_USER_PER_MIN  = 20;   // uploads per user per minute
const RATE_IP_PER_MIN    = 60;   // uploads per IP per minute
const MAX_LIST_LIMIT     = 100;
const DEFAULT_LIST_LIMIT = 30;
const ALLOWED_MIME       = new Set([
  "image/gif",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

// How old a GIF can be (ms) and still be considered "from this play test".
// chats.ts calls GET /storage?user=x&limit=1&for_publish=1 right after play_test
// finishes — we surface the record only if it was captured within this window.
const FRESH_GIF_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

// ── ALLOWED ORIGINS (mirrors control.ts) ───────────────────────────────────────
const ALLOWED_ORIGINS = new Set<string>([
  "https://nexusai-rbx.vercel.app",
  "https://nexusai.gg",
  "http://localhost:3000",
  "https://fine-setter-131.convex.site",
  "https://brazen-lapwing-697.convex.site",
]);

// ── SANITISERS ─────────────────────────────────────────────────────────────────
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

function sanBool(val: unknown): boolean {
  return val === true || val === "1" || val === "true";
}

// ── CORS / RESPONSE HELPERS ────────────────────────────────────────────────────
function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin":  ALLOWED_ORIGINS.has(origin) ? origin : "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": [
      "Content-Type", "Authorization", "X-Admin-Token",
      "X-Session-Token", "X-Api-Key", "X-Nexus-Nonce",
    ].join(", "),
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options":        "DENY",
  };
}

function jsonResp(
  data: unknown,
  status = 200,
  cors: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({ ...(data as object), ts: Date.now() }),
    { status, headers: { "Content-Type": "application/json", ...cors } },
  );
}

function errResp(
  cors: Record<string, string>,
  code: number,
  error: string,
  extra: Record<string, unknown> = {},
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

// ── BASE64 → BYTES ─────────────────────────────────────────────────────────────
function decodeBase64(input: string): Uint8Array {
  // Strip a data: URL prefix if present, e.g. "data:image/gif;base64,AAAA..."
  const commaIdx = input.indexOf(",");
  const cleaned  =
    input.startsWith("data:") && commaIdx !== -1
      ? input.slice(commaIdx + 1)
      : input;
  const binary = atob(cleaned);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function detectMimeFromBase64Prefix(input: string): string | null {
  const m = /^data:([a-zA-Z0-9/+.\-]+);base64,/.exec(input);
  return m ? m[1].toLowerCase() : null;
}

// ── GIF RECORD SHAPE (returned from store queries) ─────────────────────────────
interface GifRecord {
  _id:       string;
  username:  string;
  storageId: string;
  mime:      string;
  name:      string;
  seen:      boolean;
  createdAt: number;
  sizeBytes?: number;
}

// ── MAIN HTTP ACTION ───────────────────────────────────────────────────────────
export const storageHandler = httpAction(async (ctx, request) => {
  try {
    const cors = buildCorsHeaders(request);

    switch (request.method) {
      case "OPTIONS": return new Response(null, { status: 200, headers: cors });
      case "GET":     return await handleGet(ctx, request, cors);
      case "POST":    return await handlePost(ctx, request, cors);
      case "PATCH":   return await handlePatch(ctx, request, cors);
      case "DELETE":  return await handleDelete(ctx, request, cors);
      default:        return errResp(cors, 405, "Method not allowed.");
    }
  } catch (err) {
    console.error("[NEXUS storage] unhandled error:", (err as Error)?.message ?? err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error.", ts: Date.now() }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET
// ══════════════════════════════════════════════════════════════════════════════
//
//  ?id=<storageRecordId>                  → redirect (or JSON) for a single file
//  ?id=<id>&redirect=0                    → JSON with url, no redirect
//  ?user=<username>                       → list all gifs for user
//  ?user=<username>&limit=<n>             → paginated list
//  ?user=<username>&unread=1              → only unseen gifs
//  ?user=<username>&limit=1&for_publish=1 → latest fresh gif for auto-publish
//
async function handleGet(
  ctx: ActionCtx,
  request: Request,
  cors: Record<string, string>,
): Promise<Response> {
  const url = new URL(request.url);
  const q   = Object.fromEntries(url.searchParams.entries());

  // ── Single file by record id ─────────────────────────────────────────────
  if (q["id"]) {
    const record = await ctx.runQuery(internal.store.getGifRecord, {
      id: sanStr(q["id"], 64),
    }) as GifRecord | null;

    if (!record) return errResp(cors, 404, "File not found.");

    const fileUrl = await ctx.storage.getUrl(record.storageId);
    if (!fileUrl) return errResp(cors, 404, "File no longer exists in storage.");

    if (q["redirect"] === "0") {
      return jsonResp(
        {
          ok: true,
          id:        record._id,
          url:       fileUrl,
          user:      record.username,
          mime:      record.mime,
          name:      record.name,
          seen:      record.seen,
          sizeBytes: record.sizeBytes ?? null,
          createdAt: record.createdAt,
        },
        200,
        cors,
      );
    }

    return Response.redirect(fileUrl, 302);
  }

  // ── List gifs for a user ─────────────────────────────────────────────────
  if (q["user"]) {
    const username   = san(q["user"]);
    const limit      = sanInt(q["limit"], DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT);
    const unreadOnly = sanBool(q["unread"]);
    const forPublish = sanBool(q["for_publish"]); // flag from chats.ts auto-publish

    const records = await ctx.runQuery(internal.store.listGifRecords, {
      username,
      limit,
      unreadOnly,
    }) as GifRecord[];

    // Resolve storage URLs in parallel
    const gifs = await Promise.all(
      records.map(async (r) => ({
        id:        r._id,
        url:       await ctx.storage.getUrl(r.storageId),
        mime:      r.mime,
        name:      r.name,
        seen:      r.seen,
        sizeBytes: r.sizeBytes ?? null,
        createdAt: r.createdAt,
      })),
    );

    // Only include records that actually have a live URL
    const valid = gifs.filter((g) => g.url != null) as Array<typeof gifs[number] & { url: string }>;

    // for_publish=1: return only the most recent GIF if it was captured within
    // FRESH_GIF_WINDOW_MS. This is what chats.ts checks right after a play test.
    if (forPublish) {
      const now    = Date.now();
      const latest = valid[0] ?? null; // already sorted newest-first by the query
      const fresh  =
        latest && now - latest.createdAt < FRESH_GIF_WINDOW_MS
          ? latest
          : null;

      return jsonResp(
        {
          ok:    true,
          user:  username,
          fresh: fresh !== null,
          gif:   fresh,
          // convenience: also expose whether this gif has already been used in a publish
          seen:  fresh?.seen ?? null,
        },
        200,
        cors,
      );
    }

    return jsonResp(
      {
        ok:    true,
        user:  username,
        gifs:  valid,
        count: valid.length,
      },
      200,
      cors,
    );
  }

  return errResp(cors, 400, 'Provide either "id" or "user" as a query parameter.');
}

// ══════════════════════════════════════════════════════════════════════════════
// POST — upload a new gif (called by Roblox Studio plugin after play test)
// ══════════════════════════════════════════════════════════════════════════════
//
//  Body: { user, base64, mime?, name? }
//
async function handlePost(
  ctx: ActionCtx,
  request: Request,
  cors: Record<string, string>,
): Promise<Response> {
  const ip = getClientIp(request);

  // IP-level rate limit
  const okIp = await ctx.runMutation(internal.store.checkAndIncrRateLimit, {
    key: ip, kind: "ip", max: RATE_IP_PER_MIN, windowMs: 60_000,
  });
  if (!okIp) return errResp(cors, 429, "IP rate limit exceeded. Please wait before uploading again.");

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return errResp(cors, 400, "Invalid JSON body.");
  }

  const username = san(body["user"] ?? body["_user"] ?? "");
  if (!username || username === "default") {
    return errResp(cors, 400, '"user" is required and must be a valid username.');
  }

  // User-level rate limit
  const okUser = await ctx.runMutation(internal.store.checkAndIncrRateLimit, {
    key: username, kind: "user", max: RATE_USER_PER_MIN, windowMs: 60_000,
  });
  if (!okUser) {
    return errResp(cors, 429, `Rate limit exceeded for user "${username}". Please wait before uploading again.`);
  }

  // Validate base64 payload
  const rawBase64 = String(body["base64"] ?? body["data"] ?? "");
  if (!rawBase64) {
    return errResp(cors, 400, '"base64" (or "data") is required.');
  }
  if (rawBase64.length > MAX_BASE64_LEN) {
    return errResp(
      cors, 413,
      `File too large. Maximum decoded size is ${Math.floor(MAX_DECODED_BYTES / 1024 / 1024)} MB.`,
    );
  }

  // Resolve MIME type (prefer explicit body field, fall back to data: prefix)
  const inlineMime = detectMimeFromBase64Prefix(rawBase64);
  const mime       = sanStr(
    String(body["mime"] ?? inlineMime ?? "image/gif"),
    60,
  ).toLowerCase();

  if (!ALLOWED_MIME.has(mime)) {
    return errResp(
      cors, 400,
      `Unsupported MIME type "${mime}". Allowed types: ${[...ALLOWED_MIME].join(", ")}.`,
    );
  }

  // Decode
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(rawBase64);
  } catch {
    return errResp(cors, 400, "Failed to decode base64 payload. Make sure it is valid base64.");
  }

  if (bytes.byteLength === 0) {
    return errResp(cors, 400, "Decoded file is empty.");
  }
  if (bytes.byteLength > MAX_DECODED_BYTES) {
    return errResp(
      cors, 413,
      `Decoded file is ${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB — exceeds the ${Math.floor(MAX_DECODED_BYTES / 1024 / 1024)} MB limit.`,
    );
  }

  // Store in Convex file storage
  // Note: `bytes` is always from `new Uint8Array(n)` (never SharedArrayBuffer), so
  // the cast to Uint8Array<ArrayBuffer> is safe even though TypeScript's lib type
  // widens the buffer to ArrayBufferLike.
  const blob      = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
  const storageId = await ctx.storage.store(blob);

  const name      = sanStr(body["name"] ?? "play_test_capture", 100);
  const now       = Date.now();

  const recordId = await ctx.runMutation(internal.store.insertGifRecord, {
    username,
    storageId,
    mime,
    name,
    sizeBytes: bytes.byteLength,
    createdAt: now,
  });

  const fileUrl = await ctx.storage.getUrl(storageId);

  // Push an AI-feed notification so the web app can surface "new GIF ready"
  // without hard polling. chats.ts uses the feed to trigger auto-publish.
  await ctx.runMutation(internal.store.pushAiFeedEntry, {
    username,
    kind:    "gif_captured",
    summary: `New play-test capture ready: ${name} (${(bytes.byteLength / 1024).toFixed(0)} KB)`,
    data:    JSON.stringify({ id: recordId, url: fileUrl, mime, sizeBytes: bytes.byteLength }),
    ts:      now,
  });

  return jsonResp(
    {
      ok:   true,
      status: "ok",
      id:   recordId,
      url:  fileUrl,
      mime,
      name,
      sizeBytes: bytes.byteLength,
    },
    200,
    cors,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PATCH — mark gif(s) as seen, or mark a gif as used-in-publish
// ══════════════════════════════════════════════════════════════════════════════
//
//  Body (mark seen):          { user, id }          — mark one gif as seen by web UI
//  Body (mark all seen):      { user, mark_all: true }
//  Body (mark used/publish):  { user, id, used_in_publish: true }
//
//  "seen" means the web UI has displayed the gif to the user.
//  "used_in_publish" means the gif was included in an auto-publish to /api/explore.
//
async function handlePatch(
  ctx: ActionCtx,
  request: Request,
  cors: Record<string, string>,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return errResp(cors, 400, "Invalid JSON body.");
  }

  const username = san(body["user"] ?? "");
  if (!username || username === "default") {
    return errResp(cors, 400, '"user" is required.');
  }

  // Mark all unseen gifs for this user as seen
  if (sanBool(body["mark_all"])) {
    const count = await ctx.runMutation(internal.store.markAllGifsSeen, { username });
    return jsonResp({ ok: true, markedSeen: count }, 200, cors);
  }

  // Mark a specific gif as seen (or used in publish)
  const id = sanStr(String(body["id"] ?? ""), 64);
  if (!id) {
    return errResp(cors, 400, '"id" is required (or pass mark_all: true to mark all).');
  }

  const record = await ctx.runQuery(internal.store.getGifRecord, { id }) as GifRecord | null;
  if (!record) return errResp(cors, 404, "GIF record not found.");
  if (record.username !== username) {
    return errResp(cors, 403, "You may only update your own GIF records.");
  }

  const usedInPublish = sanBool(body["used_in_publish"]);

  await ctx.runMutation(internal.store.markGifSeen, {
    id,
    usedInPublish,
  });

  return jsonResp(
    {
      ok:            true,
      id,
      seen:          true,
      usedInPublish,
    },
    200,
    cors,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DELETE — remove a gif record and its underlying file
// ══════════════════════════════════════════════════════════════════════════════
//
//  Query params: ?id=<storageRecordId>&user=<username>
//  A user may only delete their own records.
//
async function handleDelete(
  ctx: ActionCtx,
  request: Request,
  cors: Record<string, string>,
): Promise<Response> {
  const url      = new URL(request.url);
  const id       = sanStr(url.searchParams.get("id") ?? "", 64);
  const username = san(url.searchParams.get("user") ?? "");

  if (!id)       return errResp(cors, 400, '"id" query parameter is required.');
  if (!username) return errResp(cors, 400, '"user" query parameter is required.');

  const record = await ctx.runQuery(internal.store.getGifRecord, { id }) as GifRecord | null;
  if (!record) return errResp(cors, 404, "GIF record not found.");

  if (record.username !== username) {
    return errResp(cors, 403, "You may only delete your own GIF records.");
  }

  // Delete both the Convex storage object and the metadata record
  await ctx.storage.delete(record.storageId);
  await ctx.runMutation(internal.store.deleteGifRecord, { id });

  return jsonResp(
    { ok: true, status: "ok", deleted: id },
    200,
    cors,
  );
}