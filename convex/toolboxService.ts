import { action } from './_generated/server'
import { v } from 'convex/values'

// ── TYPES ─────────────────────────────────────────────────────────────────────
interface ToolboxCreator {
  creator?: string
  userId?: number
  name?: string
  verified?: boolean
}
interface ToolboxAsset {
  id?: number
  assetId?: number
  name?: string
  description?: string
  assetType?: string
  creator?: ToolboxCreator
  voting?: { upVotes?: number; downVotes?: number; upVotePercent?: number }
  thumbnailUrl?: string
}
interface ToolboxSearchResponse {
  nextPageToken?: string
  creatorStoreAssets?: ToolboxAsset[]
  data?: ToolboxAsset[] // fallback shape in case Roblox changes the key name
}
export interface ToolboxResultItem {
  id: number
  name: string
  description: string
  category: string
  creator: string
  creatorVerified: boolean
  upVotes: number
  downVotes: number
  upVotePercent: number
  thumbnailUrl: string
  assetUrl: string
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const TOOLBOX_SEARCH_URL = 'https://apis.roblox.com/toolbox-service/v2/assets:search'
const VALID_CATEGORIES = new Set([
  'Model', 'Decal', 'Mesh', 'Audio', 'Plugin', 'Animation', 'Video',
  'FontFamily', 'EnvironmentEmote', 'Image',
])
const MAX_RESULTS = 10
const REQUEST_TIMEOUT_MS = 10000

// ── HELPERS ───────────────────────────────────────────────────────────────────
function normalizeCategory(category: string): string {
  if (!category) return 'Model'
  const found = Array.from(VALID_CATEGORIES).find(c => c.toLowerCase() === category.toLowerCase())
  return found || 'Model'
}

function buildThumbnailUrl(assetId: number): string {
  // Generic thumbnail endpoint, works without auth for public assets
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=420&height=420&format=png`
}

function mapAsset(raw: ToolboxAsset): ToolboxResultItem | null {
  const id = raw.id ?? raw.assetId
  if (!id) return null
  return {
    id,
    name: raw.name || 'Untitled',
    description: (raw.description || '').slice(0, 300),
    category: raw.assetType || 'Model',
    creator: raw.creator?.name || 'Unknown',
    creatorVerified: raw.creator?.verified === true,
    upVotes: raw.voting?.upVotes ?? 0,
    downVotes: raw.voting?.downVotes ?? 0,
    upVotePercent: raw.voting?.upVotePercent ?? 0,
    thumbnailUrl: raw.thumbnailUrl || buildThumbnailUrl(id),
    assetUrl: `https://www.roblox.com/library/${id}`,
  }
}

// ── CORE SEARCH FUNCTION (reusable, not exported as Convex action) ───────────
export async function searchToolboxAssets(
  query: string,
  searchCategoryType: string,
  limit: number = MAX_RESULTS,
): Promise<{ ok: true; results: ToolboxResultItem[] } | { ok: false; error: string }> {
  const cleanQuery = (query || '').trim().slice(0, 100)
  if (!cleanQuery) return { ok: false, error: 'Query is required' }

  const category = normalizeCategory(searchCategoryType)
  const apiKey = process.env.ROBLOX_OPEN_CLOUD_KEY
  if (!apiKey) return { ok: false, error: 'Roblox Open Cloud key is not configured on the server' }

  const url = `${TOOLBOX_SEARCH_URL}?searchCategoryType=${encodeURIComponent(category)}&query=${encodeURIComponent(cleanQuery)}`

  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      signal: ctrl.signal,
    })
    clearTimeout(timeoutId)

    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => '')
      return { ok: false, error: `Toolbox search failed (HTTP ${resp.status})${bodyText ? ': ' + bodyText.slice(0, 200) : ''}` }
    }

    const data = (await resp.json()) as ToolboxSearchResponse
    const rawAssets = data.creatorStoreAssets || data.data || []
    const results = rawAssets
      .map(mapAsset)
      .filter((a): a is ToolboxResultItem => a !== null)
      .slice(0, Math.max(1, Math.min(limit, MAX_RESULTS)))

    return { ok: true, results }
  } catch (e) {
    clearTimeout(timeoutId)
    const err = e as { name?: string; message?: string }
    if (err.name === 'AbortError') return { ok: false, error: 'Toolbox search timed out' }
    return { ok: false, error: String(err.message || 'Network error contacting Roblox Toolbox API') }
  }
}

// ── CONVEX ACTION (callable from chats.ts / main.ts) ──────────────────────────
export const searchToolbox = action({
  args: {
    query: v.string(),
    searchCategoryType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const result = await searchToolboxAssets(
      args.query,
      args.searchCategoryType || 'Model',
      args.limit ?? MAX_RESULTS,
    )
    return result
  },
})