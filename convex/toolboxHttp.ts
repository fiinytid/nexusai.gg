import { httpAction } from './_generated/server'
import { getToolboxAssetDetails, searchToolboxAssets } from './toolboxService'

// ── CORS ──────────────────────────────────────────────────────────────────────
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Nexus-Nonce, X-Admin-Token, X-Roblox-Id, X-Username',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

// ── /toolboxService ──────────────────────────────────────────────────────────
// Two modes. Mode is normally inferred from which params are present, but can
// be forced with `mode=search` / `mode=id` if both happen to be supplied:
//
//   1) Keyword search (default — this is what "find me a house model" /
//      "footstep sfx" type requests should use; requires ROBLOX_API_KEY env
//      var with the "creator-store-product:read" scope):
//        GET  /toolboxService?query=house
//        GET  /toolboxService?query=house&category=Model&limit=20
//        POST /toolboxService   body: { query: "house", searchCategoryType: "Model" }
//      Backed by: https://apis.roblox.com/toolbox-service/v2/assets:search
//
//   2) Get details by a known numeric asset ID (no API key needed) — only
//      useful once an ID is already known, e.g. resolving an item a previous
//      search already returned:
//        GET  /toolboxService?assetId=123456
//        POST /toolboxService   body: { assetId: 123456 }
//      Backed by: https://economy.roblox.com/v2/assets/{id}/details
//
// If both `query` and `assetId` are present, `query` (keyword search) takes
// priority, since that's the far more common intent — callers asking by
// description rather than by a specific known ID. Pass `mode=id` to force
// the assetId lookup instead in that situation.
// If neither is present, returns 400.
export const toolboxServiceHandler = httpAction(async (_ctx, request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })

  try {
    let assetId: string | number = ''
    let query = ''
    let mode = ''
    let searchCategoryType: string | undefined
    let maxPageSize: number | undefined
    let pageToken: string | undefined
    let pageNumber: number | undefined
    let includeOnlyVerifiedCreators: boolean | undefined
    let minPriceCents: number | undefined
    let maxPriceCents: number | undefined
    let tags: string[] | undefined
    let wantRaw = false

    if (request.method === 'GET') {
      const url = new URL(request.url)
      const sp = url.searchParams
      assetId = sp.get('assetId') || sp.get('id') || ''
      query = sp.get('query') || sp.get('q') || sp.get('keyword') || ''
      mode = (sp.get('mode') || '').toLowerCase()
      searchCategoryType = sp.get('category') || sp.get('searchCategoryType') || undefined
      maxPageSize = sp.has('limit') ? Number(sp.get('limit')) : undefined
      pageToken = sp.get('pageToken') || undefined
      pageNumber = sp.has('page') ? Number(sp.get('page')) : undefined
      includeOnlyVerifiedCreators = sp.has('verifiedOnly') ? sp.get('verifiedOnly') === 'true' : undefined
      minPriceCents = sp.has('minPriceCents') ? Number(sp.get('minPriceCents')) : undefined
      maxPriceCents = sp.has('maxPriceCents') ? Number(sp.get('maxPriceCents')) : undefined
      tags = sp.has('tags') ? sp.get('tags')!.split(',').map((t) => t.trim()).filter(Boolean) : undefined
      wantRaw = sp.get('raw') === '1'
    } else if (request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
      assetId = (body.assetId ?? body.id ?? '') as string | number
      query = (body.query ?? body.q ?? body.keyword ?? '') as string
      mode = String(body.mode ?? '').toLowerCase()
      searchCategoryType = (body.searchCategoryType ?? body.category) as string | undefined
      maxPageSize = body.maxPageSize as number | undefined
      pageToken = body.pageToken as string | undefined
      pageNumber = body.pageNumber as number | undefined
      includeOnlyVerifiedCreators = body.includeOnlyVerifiedCreators as boolean | undefined
      minPriceCents = body.minPriceCents as number | undefined
      maxPriceCents = body.maxPriceCents as number | undefined
      tags = Array.isArray(body.tags) ? (body.tags as unknown[]).map(String) : undefined
      wantRaw = body.raw === true || body.raw === '1'
    } else {
      return json({ ok: false, error: 'Method not allowed' }, 405)
    }

    const wantsIdLookup = mode === 'id' || (mode !== 'search' && !query && !!assetId)
    const wantsSearch = mode === 'search' || (mode !== 'id' && !!query)

    // Mode 1 (default/priority): keyword search
    if (wantsSearch) {
      const result = await searchToolboxAssets({
        query,
        searchCategoryType,
        maxPageSize,
        pageToken,
        pageNumber,
        includeOnlyVerifiedCreators,
        minPriceCents,
        maxPriceCents,
        tags,
      })
      // Debug helper: ?query=...&raw=1 includes the untouched Roblox payload
      // (via _raw on each item) front-and-center so field-shape issues are
      // easy to diagnose without digging through nested objects.
      if (result.ok && wantRaw) {
        return json({ ok: true, rawItems: result.result.items.map((i) => i._raw) }, 200)
      }
      return json(result, result.ok ? 200 : 400)
    }

    // Mode 2: get by ID
    if (wantsIdLookup) {
      const result = await getToolboxAssetDetails(assetId)
      return json(result, result.ok ? 200 : 400)
    }

    return json({ ok: false, error: 'Provide either "query" (keyword search, recommended) or "assetId" (lookup by known ID)' }, 400)
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || 'Internal error') }, 500)
  }
})