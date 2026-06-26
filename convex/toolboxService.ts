import { action } from './_generated/server'
import { v } from 'convex/values'

// ── WHY THIS FILE LOOKS LIKE THIS ─────────────────────────────────────────────
// Earlier approaches to keyword search failed with HTTP 403 "Scope not
// authorized":
//   1. `/toolbox-service/v2/assets:search` — tried without realizing it needs
//      the `creator-store-product:read` scope on the API key specifically
//      (not the generic Open Cloud "assets" scope used for upload/update).
//   2. `/toolbox-service/v2/assets/{id}` (Get Creator Store Asset Details) —
//      same scope issue.
//
// CONFIRMED FIX (per Roblox's official Open Cloud "Creator Store" reference,
// https://create.roblox.com/docs/cloud/reference/features/creator-store):
//   POST https://apis.roblox.com/toolbox-service/v2/assets:search
//   Header: x-api-key: <ROBLOX_API_KEY>
//   Required scope: creator-store-product:read
//
// This is the real "search the Toolbox by keyword" endpoint — it covers
// Models, Meshes, Plugins, Audio, Decals, Videos, Fonts (the actual Toolbox
// "Creator Store" categories), NOT the avatar Marketplace catalog
// (catalog.roblox.com), which only covers hats/shirts/gear/etc.
//
// You MUST create a Roblox Open Cloud API key with the
// `creator-store-product:read` scope at:
//   https://create.roblox.com/dashboard/credentials
// and set it as the ROBLOX_API_KEY environment variable in your Convex
// deployment (`npx convex env set ROBLOX_API_KEY "..."`).
//
// IMPORTANT: this service is keyword-search first. Most callers (the chat
// assistant included) only have a description of what they want — "house
// model", "footstep sfx" — not a numeric asset ID. `searchToolboxAssets` is
// therefore the primary entrypoint. `getToolboxAssetDetails` (by numeric ID,
// no API key required) is kept only as a secondary lookup for when an ID is
// already known (e.g. resolving an item returned by a previous search).

// ── TYPES ─────────────────────────────────────────────────────────────────────

// Raw shape from economy.roblox.com/v2/assets/{id}/details is not strictly
// typed by Roblox publicly, so we read defensively.
interface EconomyAssetRaw {
  AssetId?: number
  Name?: string
  Description?: string
  AssetTypeId?: number
  Creator?: { Id?: number; Name?: string; CreatorType?: string; IsVerifiedCreator?: boolean }
  IsForSale?: boolean
  PriceInRobux?: number | null
  Sales?: number
  [key: string]: unknown
}
export interface ToolboxAssetDetails {
  id: number
  name: string
  description: string
  category: string
  creator: string
  creatorVerified: boolean
  isForSale: boolean
  priceInRobux: number | null
  sales: number
  thumbnailUrl: string
  assetUrl: string
  // Raw response kept around so nothing is silently lost if Roblox's actual
  // field names differ from what we guessed above.
  _raw: EconomyAssetRaw
}

// Shape of a single item in `creatorStoreAssets` from the search endpoint.
// Roblox's docs leave several sub-fields as opaque "any", so we read
// defensively and keep the raw object around too.
interface CreatorStoreAssetRaw {
  asset?: {
    assetId?: string | number
    name?: string
    description?: string
    assetType?: string
    [key: string]: unknown
  }
  creator?: {
    name?: string
    userId?: string | number
    groupId?: string | number
    isVerifiedCreator?: boolean
    [key: string]: unknown
  }
  creatorStoreProduct?: {
    path?: string
    purchasePrice?: { currencyCode?: string; quantity?: { significand?: number; exponent?: number } }
    purchasable?: boolean
    [key: string]: unknown
  }
  voting?: unknown
  [key: string]: unknown
}

export interface ToolboxSearchResultItem {
  id: number | null
  name: string
  description: string
  assetType: string
  creator: string
  creatorVerified: boolean
  isForSale: boolean
  priceInRobux: number | null
  currencyCode: string | null
  priceLabel: string
  thumbnailUrl: string
  assetUrl: string
  _raw: CreatorStoreAssetRaw
}

export interface ToolboxSearchResult {
  items: ToolboxSearchResultItem[]
  totalResults: number
  nextPageToken: string | null
  filteredKeyword: string | null
  query: string
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const ECONOMY_ASSET_URL = 'https://economy.roblox.com/v2/assets'
const SEARCH_URL = 'https://apis.roblox.com/toolbox-service/v2/assets:search'
const REQUEST_TIMEOUT_MS = 10000
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const MIN_PAGE_SIZE = 1

// AssetTypeId -> human readable category (common Studio-relevant types)
const ASSET_TYPE_MAP: Record<number, string> = {
  1: 'Image', 2: 'TShirt', 3: 'Audio', 4: 'Mesh', 5: 'Lua', 8: 'Hat',
  9: 'Place', 10: 'Model', 11: 'Shirt', 12: 'Pants', 13: 'Decal',
  16: 'Avatar', 17: 'Head', 18: 'Face', 19: 'Gear', 21: 'Badge',
  24: 'Animation', 32: 'Plugin', 34: 'MeshPart', 38: 'SolidModel',
  39: 'MeshHat', 40: 'MeshPants', 41: 'HairAccessory', 42: 'FaceAccessory',
  43: 'NeckAccessory', 44: 'ShoulderAccessory', 45: 'FrontAccessory',
  46: 'BackAccessory', 47: 'WaistAccessory', 61: 'EmoteAnimation',
  62: 'Video', 64: 'FontFamily',
}

// Known-ish values for searchCategoryType, kept loose since Roblox doesn't
// publicly enumerate the exact accepted strings. Exposed so callers (and the
// chat assistant) can validate/normalize user-facing category names instead
// of guessing.
export const TOOLBOX_CATEGORIES = [
  'Model', 'Decal', 'Mesh', 'MeshPart', 'Plugin', 'Audio', 'Video',
  'FontFamily', 'Animation',
] as const

// ── HELPERS ───────────────────────────────────────────────────────────────────
function buildThumbnailUrl(assetId: number): string {
  // Generic thumbnail endpoint, works without auth for public assets
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=420&height=420&format=png`
}

function mapAsset(raw: EconomyAssetRaw, fallbackId: number): ToolboxAssetDetails {
  const id = raw.AssetId ?? fallbackId
  return {
    id,
    name: raw.Name || 'Untitled',
    description: (raw.Description || '').slice(0, 300),
    category: (raw.AssetTypeId && ASSET_TYPE_MAP[raw.AssetTypeId]) || 'Unknown',
    creator: raw.Creator?.Name || 'Unknown',
    creatorVerified: raw.Creator?.IsVerifiedCreator === true,
    isForSale: raw.IsForSale === true,
    priceInRobux: typeof raw.PriceInRobux === 'number' ? raw.PriceInRobux : null,
    sales: raw.Sales ?? 0,
    thumbnailUrl: buildThumbnailUrl(id),
    assetUrl: `https://www.roblox.com/library/${id}`,
    _raw: raw,
  }
}

function parseAssetId(input: string | number): number | null {
  const n = typeof input === 'number' ? input : parseInt(String(input).trim(), 10)
  if (!n || !Number.isFinite(n) || n <= 0) return null
  return n
}

// Turns a Money-ish object ({significand, exponent}) into a plain float.
// Creator Store prices are USD (Money type), not Robux. We still surface a
// `priceInRobux`-named field for backwards shape-compatibility with the
// economy-API result, but treat its value as "price in the listed currency"
// for Creator Store items. `currencyCode` + `priceLabel` disambiguate this
// for any caller that renders it to a user.
function moneyToNumber(money?: { significand?: number; exponent?: number }): number | null {
  if (!money || typeof money.significand !== 'number' || typeof money.exponent !== 'number') return null
  if (!Number.isFinite(money.significand) || !Number.isFinite(money.exponent)) return null
  return money.significand * Math.pow(10, money.exponent)
}

function formatPriceLabel(amount: number | null, currencyCode: string | null, purchasable: boolean): string {
  if (!purchasable) return 'Free'
  if (amount == null) return 'Unknown price'
  if (currencyCode === 'USD') return `$${amount.toFixed(2)}`
  if (currencyCode) return `${amount.toFixed(2)} ${currencyCode}`
  return String(amount)
}

function mapSearchItem(raw: CreatorStoreAssetRaw): ToolboxSearchResultItem {
  const idRaw = raw.asset?.assetId
  const id = idRaw != null ? parseAssetId(idRaw) : null
  const purchasePrice = raw.creatorStoreProduct?.purchasePrice
  const purchasable = raw.creatorStoreProduct?.purchasable === true
  const priceInRobux = moneyToNumber(purchasePrice?.quantity)
  const currencyCode = purchasePrice?.currencyCode ?? null
  return {
    id,
    name: raw.asset?.name || 'Untitled',
    description: (raw.asset?.description || '').slice(0, 300),
    assetType: raw.asset?.assetType || 'Unknown',
    creator: raw.creator?.name || 'Unknown',
    creatorVerified: raw.creator?.isVerifiedCreator === true,
    isForSale: purchasable,
    priceInRobux,
    currencyCode,
    priceLabel: formatPriceLabel(priceInRobux, currencyCode, purchasable),
    thumbnailUrl: id ? buildThumbnailUrl(id) : '',
    assetUrl: id ? `https://www.roblox.com/library/${id}` : '',
    _raw: raw,
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

function clampPageSize(input: unknown): number {
  const n = typeof input === 'number' && Number.isFinite(input) ? input : DEFAULT_PAGE_SIZE
  return Math.min(Math.max(Math.round(n), MIN_PAGE_SIZE), MAX_PAGE_SIZE)
}

// ── CORE FUNCTION: get details by ID ──────────────────────────────────────────
// Get Product Info — GET economy.roblox.com/v2/assets/{id}/details
// Public endpoint, no API key required. Use this ONLY when a numeric asset ID
// is already known (e.g. resolving an item a previous search returned). For
// "find me a house model" / "find a footstep sound" type requests, use
// searchToolboxAssets with a `query` instead — that's the actual keyword
// search.
export async function getToolboxAssetDetails(
  assetId: string | number,
): Promise<{ ok: true; result: ToolboxAssetDetails } | { ok: false; error: string }> {
  const id = parseAssetId(assetId)
  if (!id) return { ok: false, error: 'A valid numeric asset ID is required' }

  const url = `${ECONOMY_ASSET_URL}/${id}/details`

  try {
    const resp = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => '')
      const hint = resp.status === 404
        ? ' (asset not found, private, or deleted)'
        : resp.status === 429
        ? ' (rate limited by Roblox, try again shortly)'
        : ''
      return { ok: false, error: `Get asset details failed (HTTP ${resp.status})${hint}${bodyText ? ': ' + bodyText.slice(0, 200) : ''}` }
    }

    const raw = (await resp.json()) as EconomyAssetRaw
    const result = mapAsset(raw, id)
    return { ok: true, result }
  } catch (e) {
    const err = e as { name?: string; message?: string }
    if (err.name === 'AbortError') return { ok: false, error: 'Request to Roblox timed out' }
    return { ok: false, error: String(err.message || 'Network error contacting Roblox') }
  }
}

// ── CORE FUNCTION: keyword search ─────────────────────────────────────────────
// Search Creator Store Assets — POST apis.roblox.com/toolbox-service/v2/assets:search
// Requires a Roblox Open Cloud API key with the `creator-store-product:read`
// scope, passed via the ROBLOX_API_KEY environment variable.
//
// This is the PRIMARY way to find Toolbox assets: pass free-text `query`
// (e.g. "modern house", "footstep sfx", "low poly tree") plus optional
// filters. Do not require an assetId here — most callers won't have one yet.
export interface SearchToolboxOptions {
  query: string
  searchCategoryType?: string // e.g. "Model", "MeshPart", "Plugin", "Audio", "Decal" — left as string since Roblox doesn't publicly enumerate exact values
  maxPageSize?: number
  pageToken?: string
  pageNumber?: number
  includeOnlyVerifiedCreators?: boolean
  minPriceCents?: number
  maxPriceCents?: number
  tags?: string[]
}

export async function searchToolboxAssets(
  opts: SearchToolboxOptions,
): Promise<{ ok: true; result: ToolboxSearchResult } | { ok: false; error: string }> {
  const apiKey = process.env.ROBLOX_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      error:
        'ROBLOX_API_KEY is not set. Create an Open Cloud API key with the "creator-store-product:read" scope at https://create.roblox.com/dashboard/credentials and run `npx convex env set ROBLOX_API_KEY "..."`.',
    }
  }

  const query = (opts.query || '').trim()
  if (!query) return { ok: false, error: 'A non-empty "query" string is required (e.g. "house model", "footstep sfx")' }
  if (query.length > 200) return { ok: false, error: 'Query is too long (max 200 characters)' }

  const body: Record<string, unknown> = {
    query,
    maxPageSize: clampPageSize(opts.maxPageSize),
  }
  if (opts.searchCategoryType) body.searchCategoryType = opts.searchCategoryType
  if (opts.pageToken) body.pageToken = opts.pageToken
  if (typeof opts.pageNumber === 'number' && Number.isFinite(opts.pageNumber)) body.pageNumber = opts.pageNumber
  if (typeof opts.includeOnlyVerifiedCreators === 'boolean') body.includeOnlyVerifiedCreators = opts.includeOnlyVerifiedCreators
  if (typeof opts.minPriceCents === 'number' && Number.isFinite(opts.minPriceCents)) body.minPriceCents = opts.minPriceCents
  if (typeof opts.maxPriceCents === 'number' && Number.isFinite(opts.maxPriceCents)) body.maxPriceCents = opts.maxPriceCents
  if (opts.tags && opts.tags.length) body.tags = opts.tags.filter((t) => typeof t === 'string' && t.trim()).slice(0, 20)

  try {
    const resp = await fetchWithTimeout(SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => '')
      const hint =
        resp.status === 403
          ? ' (check that the API key has the "creator-store-product:read" scope)'
          : resp.status === 429
          ? ' (rate limited by Roblox, retry with backoff)'
          : resp.status === 400
          ? ' (check query/filters are valid)'
          : ''
      return { ok: false, error: `Search failed (HTTP ${resp.status})${hint}${bodyText ? ': ' + bodyText.slice(0, 300) : ''}` }
    }

    const raw = (await resp.json()) as {
      nextPageToken?: string
      creatorStoreAssets?: CreatorStoreAssetRaw[]
      totalResults?: number
      filteredKeyword?: string
    }

    const items = (raw.creatorStoreAssets || []).map(mapSearchItem)

    return {
      ok: true,
      result: {
        items,
        totalResults: raw.totalResults ?? items.length,
        nextPageToken: raw.nextPageToken ?? null,
        filteredKeyword: raw.filteredKeyword ?? null,
        query,
      },
    }
  } catch (e) {
    const err = e as { name?: string; message?: string }
    if (err.name === 'AbortError') return { ok: false, error: 'Request to Roblox timed out' }
    return { ok: false, error: String(err.message || 'Network error contacting Roblox') }
  }
}

// ── CONVEX ACTIONS (callable from the HTTP route / dispatcher) ───────────────
export const getAssetDetails = action({
  args: {
    assetId: v.union(v.string(), v.number()),
  },
  handler: async (_ctx, args) => {
    return await getToolboxAssetDetails(args.assetId)
  },
})

export const searchAssets = action({
  args: {
    query: v.string(),
    searchCategoryType: v.optional(v.string()),
    maxPageSize: v.optional(v.number()),
    pageToken: v.optional(v.string()),
    pageNumber: v.optional(v.number()),
    includeOnlyVerifiedCreators: v.optional(v.boolean()),
    minPriceCents: v.optional(v.number()),
    maxPriceCents: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (_ctx, args) => {
    return await searchToolboxAssets(args)
  },
})