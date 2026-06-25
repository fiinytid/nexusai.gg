import { httpAction } from './_generated/server'
import { searchToolboxAssets } from './toolboxService'

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

// ── /toolbox-service ──────────────────────────────────────────────────────────
// Supports both:
//   GET  /toolbox-service?searchCategoryType=Model&query=coin&limit=6
//   POST /toolbox-service   body: { searchCategoryType, query, limit }
// Mirrors Roblox's own endpoint shape:
//   https://apis.roblox.com/toolbox-service/v2/assets:search?searchCategoryType=Model&query=coin
export const toolboxServiceHandler = httpAction(async (_ctx, request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })

  try {
    let query = ''
    let searchCategoryType = 'Model'
    let limit = 6

    if (request.method === 'GET') {
      const url = new URL(request.url)
      query = url.searchParams.get('query') || ''
      searchCategoryType = url.searchParams.get('searchCategoryType') || 'Model'
      limit = parseInt(url.searchParams.get('limit') || '6', 10) || 6
    } else if (request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>
      query = String(body.query || '')
      searchCategoryType = String(body.searchCategoryType || body.category || 'Model')
      limit = Number(body.limit) || 6
    } else {
      return json({ ok: false, error: 'Method not allowed' }, 405)
    }

    const result = await searchToolboxAssets(query, searchCategoryType, limit)
    return json(result, result.ok ? 200 : 400)
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || 'Internal error') }, 500)
  }
})