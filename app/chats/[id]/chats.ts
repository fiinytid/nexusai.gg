'use client'
import { buildSysPrompt } from './system_prompt'

// ── TYPE DECLARATIONS ─────────────────────────────────────────────────────────
interface NexusUser   { username: string; robloxId: string; avatar?: string }
interface NexusSession { user: NexusUser; data: Record<string, unknown>; loginTime: number }
interface ModelEntry  { grp?: string; id?: string; prov?: string; cost?: number; label?: string; icon?: string; badge?: string; inputImages?: 'enabled' | 'disabled' }
interface ConvMsg {
  role: string; content: string | unknown[]; time?: number
  attachments?: AttachItem[]; studioSummary?: string[]
  _rawContent?: string; _liked?: boolean; _disliked?: boolean
}
interface Conv { id: string; title?: string; time?: number; msgs: ConvMsg[]; projectId?: string | null }
interface AttachItem  { type: string; name: string; mime?: string; data?: string; preview?: string; text?: string }

// A command/action exactly as the NEXUS AI Studio plugin's ActionsManager
// expects it: { action: "<one of the 24 official actions>", ...params }
interface ActionCmd { action: string; [key: string]: unknown }

interface StepMeta    { code: string; name: string; parent: string; type: string }
interface AppState {
  credits: number; allConvs: Conv[]; convs: Conv[]
  curConv: string | null; gen: boolean; cancelCtrl: AbortController | null
  model: ModelEntry; plan: string; draftText: Record<string, string>
  attachments: AttachItem[]; lastClaim: string | null; unreadInbox: number
  currentProjectId: string | null; currentProjectName: string | null
  projects: { id: string; name: string }[]
  playTestEnabled: boolean; playTestDuration: number
}

// AI feed entry returned by the Convex backend's `ai_feed` endpoint —
// see control.ts pushAiFeed() / getAiFeedEntries(). Each entry is a durable,
// ordered "message to the AI" (read_script reports, output_log captures,
// runcode results, plugin errors, etc.) that survives independently of
// chat history, so the AI can react to Studio events even across sessions.
interface AiFeedEntry {
  id: string
  username: string
  kind: string
  summary: string
  data: unknown
  ts: number
  read: boolean
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 1 — SECURITY, CSRF, RATE LIMIT, CORE UTILITIES
// ══════════════════════════════════════════════════════════════════════════════

const _csrfNonce: string = (function () {
  try {
    return Array.from(crypto.getRandomValues(new Uint8Array(20)))
      .map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
})()

let _adminToken = ''
function generateAdminToken(): string {
  if (!SESSION) return ''
  const raw = `${SESSION.user.robloxId}|${SESSION.user.username}|${_csrfNonce}|${Date.now()}`
  try { return btoa(raw) } catch { return raw }
}
function getAdminHeaders(): Record<string, string> {
  if (!_adminToken) _adminToken = generateAdminToken()
  return {
    'Content-Type': 'application/json',
    'X-Nexus-Nonce': _csrfNonce,
    'X-Admin-Token': _adminToken,
    'X-Roblox-Id': SESSION ? String(SESSION.user.robloxId || '') : '',
    'X-Username': SESSION ? String(SESSION.user.username || '') : '',
  }
}

function sanitizeHtml(html: string): string {
  if (typeof html !== 'string') return ''
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript\s*:/gi, '').replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:[^,]*base64/gi, '').replace(/on\w{2,}\s*=/gi, '')
    .replace(/<iframe[\s\S]*?>/gi, '').replace(/<object[\s\S]*?>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
}

function validateApiResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  if (!('content' in (data as Record<string, unknown>))) return false
  return typeof (data as Record<string, unknown>).content === 'string'
}

const _apiCallLog: Record<string, number[]> = {}
function checkClientRateLimit(key: string, maxPerMin = 30): boolean {
  const now = Date.now()
  if (!_apiCallLog[key]) _apiCallLog[key] = []
  _apiCallLog[key] = _apiCallLog[key].filter((t) => now - t < 60000)
  if (_apiCallLog[key].length >= maxPerMin) { toast('Too many requests, please wait', 'var(--yellow)', 3000); return false }
  _apiCallLog[key].push(now)
  return true
}

// ── GLOBAL STATE ──────────────────────────────────────────────────────────────
let SESSION: NexusSession | null = null
let studioConnected = false
let studioPollTimer: ReturnType<typeof setInterval> | null = null
// ── NEXUS AI STUDIO PLUGIN BACKEND (Convex) ───────────────────────────────────
const NEXUS_API_URLS = [
  'https://fine-setter-131.convex.site', // [0] production
  'https://brazen-lapwing-697.convex.site', // [1] development
]
const NEXUS_API_ENV = 0 // index into NEXUS_API_URLS — 0 = production, 1 = development
const API_URL = NEXUS_API_URLS[NEXUS_API_ENV] ?? NEXUS_API_URLS[0]

function esc(s: unknown): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function toast(msg: string, col?: string, dur?: number): void {
  document.querySelectorAll('.nx-toast').forEach((x) => x.remove())
  const t = document.createElement('div')
  t.className = 'nx-toast'; t.textContent = msg
  t.style.cssText = `position:fixed;bottom:22px;right:22px;background:var(--bg3);border:1px solid var(--b);border-radius:8px;padding:9px 15px;font-size:11px;z-index:9999;color:${col || 'var(--cyan)'};pointer-events:none;max-width:300px;word-break:break-word;`
  document.body.appendChild(t); setTimeout(() => t.remove(), dur || 2800)
}

function updateLoader(p: number, m?: string): void {
  const b = document.getElementById('plBar'), tt = document.getElementById('plTxt')
  if (b) b.style.width = p + '%'; if (tt && m) tt.textContent = m
}
function hideLoader(): void {
  const l = document.getElementById('pageLoader'); if (!l) return
  l.classList.add('hide'); setTimeout(() => { l.style.display = 'none' }, 500)
}

function stripAllCode(text: string): string {
  if (!text) return ''
  text = text.replace(/```[a-zA-Z]*\n[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '')
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

function cleanAIResponse(text: string): string {
  if (!text) return ''
  text = text.replace(/```json[\s\S]*?```/gi, '')
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

function isPureGreeting(txt: string): boolean {
  const t = txt.trim().toLowerCase()
  if (t.length > 100) return false
  return /^(hello|hey|hi|good\s*(morning|afternoon|evening|night)|how\s*are\s*you|nexus|ping|yo|sup|test|ok|ready|nice|thanks|thank\s*you)[\s?!.,]*$/.test(t)
}

function isOwner(): boolean {
  if (!SESSION) return false
  const plan = (S.plan || (SESSION.data?.plan as string) || '').toLowerCase()
  if (plan === 'owner' || plan === 'unlimited') return true
  const roles = (SESSION.data?.roles as string[]) || []
  if (roles.includes('owner')) return true
  return OWNER_IDS.includes(String(SESSION.user.robloxId || ''))
}
function isAdmin(): boolean {
  if (!SESSION) return false
  if (isOwner()) return true
  const roles = (SESSION.data?.roles as string[]) || []
  return roles.includes('admin') || ADMIN_IDS.includes(String(SESSION.user.robloxId || ''))
}

function _sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)) }
function _jitter(ms: number): number { return ms + Math.floor(Math.random() * ms * 0.4) }
function _isAbortError(e: unknown): boolean {
  if (!e) return false
  const err = e as { name?: string; message?: string }
  return err.name === 'AbortError' || String(err.message || '').includes('AbortError')
}

function _genRequestId(): string {
  try {
    return Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
}

function safeMarked(md: string): string {
  try {
    const w = window as unknown as { marked?: { parse: (s: string) => string } }
    if (!w.marked) return esc(md)
    return sanitizeHtml(w.marked.parse(String(md || '')))
  } catch { return esc(md) }
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 1B — INJECTED UI FIXES
// ══════════════════════════════════════════════════════════════════════════════
// page.tsx ships its own <style> block (PAGE_CSS) that we cannot edit
// directly from here. The fixes below are appended as a SEPARATE stylesheet
// with higher specificity / !important so they win without touching
// page.tsx. This covers:
//   1. Attach <label> vs <button> misalignment in the input bar
//   2. Model dropdown visual polish (spacing, badges, group headers, shadow)
//   3. Small steps-card stability tweak (paired with the JS timing fix below)
function _injectUiFixStyles(): void {
  if (document.getElementById('nx-ui-fix-styles')) return
  const s = document.createElement('style')
  s.id = 'nx-ui-fix-styles'
  s.textContent = `
/* ─── FIX: input-bar icon buttons (label vs button) perfectly aligned ─── */
.inp-l { align-items: center !important; }
.inp-l > .ib,
.inp-l > label.ib,
.inp-l > button.ib {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  vertical-align: middle !important;
  line-height: 0 !important;
  box-sizing: border-box !important;
  margin: 0 !important;
  -webkit-appearance: none;
  appearance: none;
}
.inp-l > label.ib { padding: 0 !important; }
.inp-l > label.ib svg, .inp-l > button.ib svg {
  display: block !important;
  margin: 0 auto !important;
  pointer-events: none;
}
.inp-bar { align-items: center !important; }

/* ─── FIX: model dropdown — full visual redesign ─── */
.model-dd {
  padding: 8px !important;
  border-radius: 14px !important;
  border: 1px solid rgba(0,229,255,.22) !important;
  box-shadow: 0 24px 70px rgba(0,0,0,.92), 0 0 0 1px rgba(0,229,255,.06), 0 0 24px rgba(0,229,255,.04) !important;
  background: linear-gradient(180deg, rgba(10,11,34,.99), rgba(6,7,26,.99)) !important;
}
.model-dd .mg {
  padding: 9px 8px 6px !important;
  margin-top: 4px !important;
  font-size: 8px !important;
  letter-spacing: 2.2px !important;
  font-weight: 800 !important;
  color: rgba(184,207,255,.4) !important;
}
.model-dd .mg:first-child { margin-top: 2px !important; }
.model-dd .mo {
  padding: 9px 10px !important;
  border-radius: 10px !important;
  gap: 11px !important;
  min-height: 52px !important;
  border: 1px solid transparent !important;
  transition: background .12s ease, border-color .12s ease, transform .12s ease !important;
}
.model-dd .mo:hover {
  background: rgba(0,229,255,.08) !important;
  border-color: rgba(0,229,255,.16) !important;
  transform: translateX(1px);
}
.model-dd .mo.act {
  background: rgba(0,229,255,.1) !important;
  border-color: rgba(0,229,255,.28) !important;
}
.model-dd .mo-icon {
  width: 30px !important; height: 30px !important; border-radius: 8px !important;
  background: rgba(0,229,255,.08) !important;
  border: 1px solid rgba(0,229,255,.14) !important;
}
.model-dd .mo-n { font-size: 11.5px !important; letter-spacing: .1px; }
.model-dd .mo-s { font-size: 9px !important; margin-top: 3px !important; }
.model-dd .mb-badge {
  font-size: 8px !important; font-weight: 800 !important; letter-spacing: .4px !important;
  padding: 3px 7px !important; border-radius: 5px !important; border: 1px solid !important;
  white-space: nowrap !important; line-height: 1.5 !important;
}
.model-dd .mb-badge.f { color: var(--green) !important; border-color: rgba(0,255,170,.32) !important; background: rgba(0,255,170,.08) !important; }
.model-dd .mb-badge.p { color: #cc55ff !important; border-color: rgba(136,0,255,.38) !important; background: rgba(136,0,255,.1) !important; }
.model-dd .mb-badge.s { color: var(--cyan) !important; border-color: rgba(0,229,255,.32) !important; background: rgba(0,229,255,.08) !important; }
.model-dd::-webkit-scrollbar { width: 4px !important; }

/* ─── FIX: steps card cannot collapse / flicker mid-stream ─── */
.steps-wrap { min-height: 60px; }
.steps-box  { min-height: 56px !important; }

/* ─── Attach button — visual cue when active model has no image input ─── */
.ib-disabled { position: relative; }
.ib-disabled svg { opacity: .55; }
.ib-disabled::after {
  content: ''; position: absolute; left: 5px; right: 5px; top: 50%;
  height: 1.5px; background: var(--pink); transform: rotate(-38deg);
  border-radius: 2px; opacity: .85; pointer-events: none;
}
`
  document.head.appendChild(s)
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 2 — MODELS, CONSTANTS, SESSION
// ══════════════════════════════════════════════════════════════════════════════

const _docsCache: Record<string, unknown> = {}

async function searchRobloxDocs(query: string, maxResults = 5): Promise<unknown> {
  if (!query || query.length < 3) return null
  const cacheKey = query.toLowerCase().trim().slice(0, 80)
  if (_docsCache[cacheKey]) return _docsCache[cacheKey]
  try {
    const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ action: 'search_docs', query, doc_type: 'all', limit: maxResults, _user: SESSION?.user.username ?? 'web' }),
    })
    clearTimeout(tid)
    if (!r.ok) return null
    const d = await r.json() as { results?: { title: string; snippet: string; url: string }[] }
    if (d?.results?.length) { _docsCache[cacheKey] = d; return d }
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') return null
  }
  return null
}

function _buildDocsContext(docsResult: unknown): string {
  const dr = docsResult as { results?: { title: string; snippet: string; url: string }[] }
  if (!dr?.results?.length) return ''
  const lines = ['[ROBLOX DOCS REFERENCE — Retrieved live for this query]']
  dr.results.slice(0, 4).forEach((r) => lines.push(`• ${r.title}: ${r.snippet} → ${r.url}`))
  lines.push('[Use these references to write accurate, up-to-date Roblox code]')
  return lines.join('\n')
}

// ── AI FEED FETCH ──────────────────────────────────────────────────────────────
// Pulls unread "messages to the AI" (read_script reports, output_log
// captures, runcode results, plugin errors, ...) from the Convex backend's
// durable per-user feed (see control.ts pushAiFeed / GET ?ai_feed=1).
// Entries are marked read server-side as soon as they're returned, so this
// is safe to call every time without re-processing the same event twice.
let _aiFeedInFlight = false
async function fetchAiFeed(maxResults = 8): Promise<AiFeedEntry[] | null> {
  if (!SESSION || !studioConnected || _aiFeedInFlight) return null
  _aiFeedInFlight = true
  try {
    const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 7000)
    const user = (SESSION.user.username || '').toLowerCase()
    const r = await fetch(`${API_URL}/?ai_feed=1&user=${encodeURIComponent(user)}&limit=${maxResults}`, { signal: ctrl.signal })
    clearTimeout(tid)
    if (!r.ok) return null
    const d = await r.json() as { entries?: AiFeedEntry[] }
    return d?.entries?.length ? d.entries : null
  } catch { return null }
  finally { _aiFeedInFlight = false }
}

// True when the user's message + recent context suggests the AI feed
// (Studio-reported events) is actually relevant — avoids spending a round
// trip on every single "hi" or unrelated question.
function _shouldCheckAiFeed(txt: string): boolean {
  if (!studioConnected) return false
  if (isPureGreeting(txt)) return false
  return /error|bug|debug|broken|crash|not work|failed|fix|read|check|output|log|result|test|ran|run/i.test(txt)
    || detectType(txt) === 'debug' || detectType(txt) === 'read' || detectType(txt) === 'edit' || detectType(txt) === 'test'
}

function _buildAiFeedContext(entries: AiFeedEntry[]): string {
  if (!entries?.length) return ''
  const lines = ['[NEXUS STUDIO FEED — Recent reports from the Studio plugin, oldest first]']
  entries.forEach((e) => {
    const when = e.ts ? new Date(e.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''
    lines.push(`• [${when}] (${e.kind}) ${e.summary}`)
  })
  lines.push('[Use this information if relevant to the current request. Do not repeat it verbatim unless asked.]')
  return lines.join('\n')
}

const REPORT_URL = '/api/report'
const K: { gemini: string; turnstile: string } = { gemini: '', turnstile: '' }
let _turnstileWidget: unknown = null
const OWNER_IDS = ['128649548']
let ADMIN_IDS: string[] = []
let _stepsEl: HTMLElement | null = null
let _stepsList: HTMLElement | null = null
const _stepsMap = new Map<number, HTMLElement>()
const _stepMeta = new Map<number, StepMeta>()
let _stepsId = 0
let _mentionActive = false; let _mentionAtPos = -1; let _mentionSelIdx = 0
let _wsCache: unknown = null; let _wsLoading = false; let _playTestActive = false
let _syncTimer: ReturnType<typeof setInterval> | null = null
let _syncInProgress = false; let _syncDebounceTimer: ReturnType<typeof setTimeout> | null = null
let _syncFailCount = 0; let _lastNewChatTime = 0
const _NEW_CHAT_DEBOUNCE = 800

const _DOCS_KEYWORDS = [
  'tweenservice','tween','datastore','remoteevent','remotefunction','bindable',
  'humanoid','leaderstats','collectionservice','pathfinding','runservice',
  'userinputservice','httprequest','http','lighting','terrain','particles',
  'sound','animation','constraint','weld','billboardgui','surfacegui',
  'proximityprompt','clickdetector','badge','marketplace','textchatservice',
  'proximity','attachment','motor6d','hingeconstraint','springconstraint',
  'part','model','script','localscript','modulescript','error','bug',
  'issue','crash','api','method','function','service','instance','property',
  'event','enum','spawn','respawn','teleport','npc','enemy','mob','ai',
  'pathfind','jump','walk','health','damage','kill','inventory','backpack',
  'tool','equipment','shop','purchase','buy','sell','coin','gem','currency',
  'economy','rank','level','xp','exp','gui','frame','button','label',
  'image','scroll','viewport','color','material','mesh','texture','decal',
  'light','fire','smoke','timer','countdown','round','game mode','lobby',
  'match','session','admin','ban','kick','mute','chat','message','broadcast',
  'terrain','fillblock','fillball','fillregion',
]
function _shouldSearchDocs(txt: string): boolean {
  if (!txt || txt.length < 5) return false
  const lower = txt.toLowerCase()
  return _DOCS_KEYWORDS.some((k) => lower.includes(k))
}

// ── UI STRINGS ─────────────────────────────────────────────────────────────────
const UI = {
  placeholder:    'Ask NEXUS AI about Roblox... (type @ to mention)',
  noConv:         'No conversations yet',
  son:            'Studio: ON',
  soff:           'Studio: OFF',
  cancel:         'Cancel',
  connected:      'Plugin connected — AI ready to build in your place!',
  disconnected:   'Plugin not connected —',
  chatTitle:      'NEXUS AI',
  copiedToast:    'Copied!',
  reconnectToast: 'Reconnecting...',
  creditsExhausted:'Credits exhausted! Buy at Payment.',
  cancelToast:    'Cancelled',
  errorPrefix:    'Failed',
  clearConfirm:   'Delete all messages in this chat?',
  workingOn:      'Processing request...',
  buildingInStudio:'Building in Studio...',
  analyzingReq:   'Analyzing request...',
  designingSolution:'Designing solution...',
  readingScript:  'Reading script from Studio...',
  analyzingError: 'Analyzing error...',
  designingFix:   'Designing fix...',
  designingUI:    'Designing UI/UX...',
  buildingComponents:'Building components...',
  preparingEdit:  'Preparing edit...',
  preparingTest:  'Preparing test...',
  checkingFeed:   'Checking Studio feed...',
  projectLabel:   'Project',
  testRunning:    'Running play_test',
  testDone:       'Test done',
  loaderInit:     'Initializing...',
  loaderLoadData: 'Loading data...',
  loaderConnecting:'Checking Studio connection...',
  loaderReady:    'Ready!',
  dailyReady:     'Daily reward available! Click Claim.',
  dailyAlready:   'Already claimed today.',
  dailyNext:      'Next: ',
  retrying:       'Retrying...',
  injecting:      'Sending to Studio...',
  installSteps: [
    'Download from <a href="https://create.roblox.com/store/asset/91870814099475/NEXUS-AI" target="_blank" style="color:var(--cyan)">Creator Store</a>',
    'Save to: <code>C:\\Users\\[Name]\\AppData\\Local\\Roblox\\Plugins\\</code>',
    'Studio: <strong>Manage Plugin</strong> → Enable <strong>HTTP Requests</strong> + <strong>Script Injection</strong>',
    'Click <strong>NEXUS AI</strong> in Studio toolbar → Click <strong>CONNECT</strong>',
    'Green status = connected!',
  ],
  suggs: [
    { title: 'Loading Screen', body: 'Professional animated loading screen', q: 'Create a professional loading screen with animated progress bar, random tips, and smooth transitions', icon: '<polyline points="1 6 1 22 23 22 23 6"/><path d="M1 6l11 7 11-7"/>' },
    { title: 'Shop GUI',       body: 'Shop with animations and coins',        q: 'Create a complete shop GUI with open/close button, item list, buy button, prices, coins display, and smooth animations', icon: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' },
    { title: 'Leaderboard',    body: 'DataStore Coins + Level + Win',         q: 'Create a DataStore leaderboard system for Roblox with Coins, Level, and Win stats', icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
    { title: 'Admin System',   body: 'Admin commands and UI panel',            q: 'Create a complete admin commands system with kick, ban, give, speed, fly, and a clean UI panel', icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
  ],
}

// ── MODEL LIST ────────────────────────────────────────────────────────────────
// `inputImages` marks whether a model's provider/endpoint actually accepts
// image content blocks. Models with 'disabled' will have the attach button
// disabled in the UI whenever they're the active model, and any pending
// image attachments are dropped (with a toast) if the user switches into
// one of these models while images are queued up.
const MODEL_LIST: ModelEntry[] = [
  { grp: 'Google' },
  { id: 'gemini-3.5-flash',     prov: 'gemini',     cost: 3,  label: 'Gemini 3.5 Flash',    icon: '/images/gemini.png',   badge: 'FAST', inputImages: 'enabled' },
  { id: 'gemini-3.1-flash-lite',prov: 'gemini',     cost: 2,  label: 'Gemini 3.1 Flash Lite',icon: '/images/gemini.png',  badge: 'FAST', inputImages: 'enabled' },
  { id: 'gemini-3.1-pro',       prov: 'gemini',     cost: 12, label: 'Gemini 3.1 Pro',       icon: '/images/gemini.png',  badge: 'BEST', inputImages: 'enabled' },
  { grp: 'Nex Agi' },
  { id: 'nex-agi/nex-n2-pro:free',     prov: 'openrouter',     cost: 1,  label: 'Nex N2 Pro',    icon: '/images/NexAGI.svg',   badge: 'BEST', inputImages: 'enabled' },
  { grp: 'ChatGPT' },
  { id: 'openai/gpt-oss-120b:free', prov: 'openrouter', cost: 0, label: 'ChatGPT 4o',       icon: '/images/chatgpt.png', badge: 'FREE', inputImages: 'disabled' },
  { grp: 'DeepSeek' },
  { id: 'deepseek/deepseek-v4-flash', prov: 'openrouter', cost: 15, label: 'DeepSeek V4',   icon: '/images/deepseek.svg', badge: 'BEST', inputImages: 'disabled' },
]

function getFreeModel(): ModelEntry {
  const real = MODEL_LIST.filter((m) => m.id && !m.grp)
  const free = real.find((m) => (m.cost ?? 999) === 0)
  if (free) return free
  return real.reduce((a, b) => (a.cost ?? 999) <= (b.cost ?? 999) ? a : b,
    { id: 'gemini-3.5-flash', prov: 'gemini', cost: 3, label: 'Gemini 3.5 Flash' })
}

function _resolveModel(modelObj: unknown): ModelEntry {
  if (!modelObj || typeof modelObj !== 'object') return getFreeModel()
  const m = modelObj as ModelEntry
  if (!m.id) return getFreeModel()
  const found = MODEL_LIST.find((x) => x.id === m.id && !x.grp)
  return found ?? getFreeModel()
}

// True if the given model entry's provider/endpoint accepts image content
// blocks. Defaults to enabled for any model that doesn't explicitly set
// the flag (keeps older/未来 entries working without edits).
function modelSupportsImages(m: ModelEntry): boolean {
  return m.inputImages !== 'disabled'
}

const MAX_IMAGE_ATTACHMENTS = 5

// Per-image cost: 0.15x the model's base text cost, rounded to 2 decimals.
// Free models (cost 0) always cost 0 CR per image — no minimum floor.
// This is intentionally proportional rather than flat: a premium model
// (e.g. Gemini 3.1 Pro at 12 CR) costs more per attached image than a
// cheap one (Gemini 3.1 Flash Lite at 2 CR), matching how much more the
// underlying request actually costs upstream.
const IMAGE_COST_MULTIPLIER = 0.15
function costPerImageForModel(m: ModelEntry): number {
  const base = m.cost || 0
  if (base <= 0) return 0
  return parseFloat((base * IMAGE_COST_MULTIPLIER).toFixed(2))
}

// Drops any queued image attachments if the now-active model can't accept
// them, with a toast so the user isn't left wondering where their images
// went. Non-image attachments (text files) are unaffected since every
// model accepts plain text content.
function _dropUnsupportedImageAttachments(): void {
  if (modelSupportsImages(S.model)) return
  const before = S.attachments.length
  const hadImages = S.attachments.some((a) => a.type === 'image')
  if (!hadImages) return
  S.attachments = S.attachments.filter((a) => a.type !== 'image')
  renderAttachRow()
  if (before !== S.attachments.length) {
    toast(`${S.model.label || S.model.id} doesn't support image input — removed attached image(s).`, 'var(--yellow)', 3600)
  }
}

// Reflects current model's image support in the attach button (disabled +
// tooltip) so the limitation is visible before the user even tries.
function updateAttachAvailability(): void {
  const lbl = document.getElementById('fi')?.closest('label') as HTMLLabelElement | null
    ?? (document.querySelector('label[for="fi"]') as HTMLLabelElement | null)
  if (!lbl) return
  const supported = modelSupportsImages(S.model)
  if (supported) {
    lbl.classList.remove('ib-disabled')
    lbl.removeAttribute('aria-disabled')
    lbl.title = 'Attach image or file'
    lbl.style.opacity = ''
    lbl.style.pointerEvents = ''
  } else {
    lbl.classList.add('ib-disabled')
    lbl.setAttribute('aria-disabled', 'true')
    lbl.title = `${S.model.label || S.model.id} doesn't support image input. Attach text files only, or switch model.`
    lbl.style.opacity = '0.4'
    // Text files are still fine for any model, so we don't fully block
    // clicking — the file input itself still accepts .lua/.txt/etc. We
    // just signal reduced capability visually rather than hard-disabling,
    // since the same input also handles non-image files.
    lbl.style.pointerEvents = ''
  }
}

const _defaultModel = { id: 'gemini-3.5-flash', prov: 'gemini', cost: 3, label: 'Gemini 3.5 Flash' }

const S: AppState = {
  credits: 30, allConvs: [], convs: [], curConv: null,
  gen: false, cancelCtrl: null, model: _defaultModel,
  plan: 'free', draftText: {}, attachments: [], lastClaim: null, unreadInbox: 0,
  currentProjectId: null, currentProjectName: null, projects: [],
  playTestEnabled: typeof window !== 'undefined' ? localStorage.getItem('nexus_play_test') !== 'false' : false,
  playTestDuration: typeof window !== 'undefined' ? Math.max(5, Math.min(120, parseInt(localStorage.getItem('nexus_play_test_dur') || '15'))) : 15,
}

// ── SESSION CHECK ─────────────────────────────────────────────────────────────
;(function () {
  if (typeof window === 'undefined') return
  try {
    const s = localStorage.getItem('nexus_session')
    if (!s) { location.replace('/'); return }
    const p = JSON.parse(s) as NexusSession
    if (!p?.user?.username || !p.user.robloxId) { localStorage.removeItem('nexus_session'); location.replace('/'); return }
    if (Date.now() - p.loginTime >= 86400000 * 7) { localStorage.removeItem('nexus_session'); location.replace('/'); return }
    SESSION = p
    if (!SESSION.data) SESSION.data = {}
    const urlp = new URLSearchParams(window.location.search)
    const pathParts = window.location.pathname.split('/')
    const chatsIdx = pathParts.indexOf('chats')
    const hasId = urlp.get('id') || (chatsIdx !== -1 && pathParts[chatsIdx + 1]?.length > 3)
    if (!hasId && window.location.pathname.endsWith('/chats')) { location.replace('/dashboard'); return }
    document.getElementById('app')?.classList.remove('hidden')
  } catch { localStorage.removeItem('nexus_session'); location.replace('/') }
})()

// ══════════════════════════════════════════════════════════════════════════════
// PART 3 — SAVE / LOAD / SYNC, DAILY REWARD, CREDITS, STUDIO POLL
// ══════════════════════════════════════════════════════════════════════════════

function getStoreConvs(): Conv[] {
  return (S.allConvs || []).slice(-30).map((c) => ({
    ...c,
    msgs: (c.msgs || []).slice(-40).map((m) => {
      const mc = { ...m } as ConvMsg & { _rawContent?: string }
      delete mc._rawContent
      if (typeof mc.content === 'string' && mc.content.length > 6000)
        mc.content = mc.content.slice(0, 6000) + '...'
      return mc
    }),
  }))
}

function saveS(): void {
  if (!SESSION) return
  if (!S.allConvs) S.allConvs = []
  if (S.currentProjectId) {
    const others = S.allConvs.filter((c) => c.projectId !== S.currentProjectId)
    const cur = S.convs.map((c) => ({ ...c, projectId: S.currentProjectId }))
    S.allConvs = [...others, ...cur]
  } else { S.allConvs = S.convs.slice() }
  SESSION.data.plan = S.plan; SESSION.data.model = S.model
  SESSION.data.lastClaim = S.lastClaim
  SESSION.data.projects = S.projects || SESSION.data.projects
  SESSION.data.convs = getStoreConvs()
  try { localStorage.setItem('nexus_session', JSON.stringify(SESSION)) } catch {
    try { SESSION.data.convs = getStoreConvs().slice(-5); localStorage.setItem('nexus_session', JSON.stringify(SESSION)) } catch { console.warn('[NEXUS] localStorage full') }
  }
  _debouncedSync()
}

function _debouncedSync(): void {
  if (_syncFailCount >= 5) return
  if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer)
  _syncDebounceTimer = setTimeout(() => { _syncDebounceTimer = null; if (!_syncInProgress) syncToServer() }, 4000)
}

async function syncToServer(): Promise<void> {
  if (!SESSION) return
  if (_syncInProgress) { if (!_syncDebounceTimer) _debouncedSync(); return }
  if (_syncFailCount >= 5) { setTimeout(() => { _syncFailCount = 0 }, 90000); return }
  _syncInProgress = true
  const ctrl = new AbortController(); const timeoutId = setTimeout(() => ctrl.abort(), 12000)
  try {
    const convsTrimmed = getStoreConvs().slice(-15).map((c) => ({
      ...c,
      msgs: (c.msgs || []).slice(-20).map((m) => {
        const mc = { ...m } as ConvMsg & { _rawContent?: string }
        delete mc._rawContent
        if (typeof mc.content === 'string' && mc.content.length > 3000)
          mc.content = mc.content.slice(0, 3000) + '\u2026'
        return mc
      }),
    }))
    const payload = {
      user: (SESSION.user.username || '').toLowerCase(),
      robloxId: SESSION.user.robloxId,
      data: {
        plan: S.plan, model: S.model, lastClaim: S.lastClaim,
        convs: convsTrimmed, projects: S.projects || [], lastSync: Date.now(),
      },
    }
    const resp = await fetch('/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nexus-Nonce': _csrfNonce },
      signal: ctrl.signal, body: JSON.stringify(payload),
    })
    clearTimeout(timeoutId)
    if (resp.ok) {
      const d = await resp.json() as { credits?: number; plan?: string }
      if (d && typeof d.credits === 'number') {
        S.credits = d.credits; updateCreds()
        if (SESSION) {
          SESSION.data.credits = S.credits
          try { localStorage.setItem('nexus_session', JSON.stringify(SESSION)) } catch { }
        }
      }
      _syncFailCount = 0
    }
    else if (resp.status === 413) { _syncFailCount++; console.warn('[NEXUS sync] 413') }
    else if (resp.status === 500) { _syncFailCount++; console.warn('[NEXUS sync] 500') }
    else if (resp.status === 401 || resp.status === 403) { _syncFailCount = 5 }
    else { _syncFailCount++ }
  } catch (e) {
    clearTimeout(timeoutId)
    if ((e as { name?: string }).name !== 'AbortError') { _syncFailCount++; console.warn('[NEXUS sync] error:', (e as Error).message) }
  } finally { _syncInProgress = false }
}

function startAutoSync(): void {
  if (_syncTimer) clearInterval(_syncTimer)
  _syncTimer = setInterval(() => {
    if (document.hidden) return
    if (!_syncInProgress && !_syncDebounceTimer) syncToServer()
  }, 180000) // every 3 min
}

async function loadS(): Promise<void> {
  if (!SESSION) return
  try {
    const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 12000)
    const r = await fetch(
      `/api/sync?user=${encodeURIComponent((SESSION.user.username || '').toLowerCase())}&robloxId=${encodeURIComponent(SESSION.user.robloxId || '')}`,
      { signal: ctrl.signal }
    )
    clearTimeout(tid)
    if (r.ok) {
      const d = await r.json() as { credits?: number; plan?: string; lastClaim?: string; convs?: Conv[]; projects?: AppState['projects'] }
      if (d) {
        S.credits = typeof d.credits === 'number' ? d.credits : parseFloat(String(SESSION.data?.credits ?? 30)) || 30
        S.plan = d.plan || (SESSION.data?.plan as string) || 'free'
        S.lastClaim = d.lastClaim || (SESSION.data?.lastClaim as string) || null
        if (d.convs?.length) {
          S.allConvs = d.convs
          S.convs = S.currentProjectId ? S.allConvs.filter((c) => c.projectId === S.currentProjectId) : S.allConvs.slice()
        } else {
          S.allConvs = (SESSION.data?.convs as Conv[]) || []
          S.convs = S.currentProjectId ? S.allConvs.filter((c) => c.projectId === S.currentProjectId) : S.allConvs.slice()
        }
        if (d.projects) S.projects = d.projects
        SESSION.data = Object.assign(SESSION.data || {}, d)
        SESSION.data.credits = S.credits
        try { localStorage.setItem('nexus_session', JSON.stringify(SESSION)) } catch { }
        if (SESSION.data?.model) S.model = _resolveModel(SESSION.data.model)
        return
      }
    }
  } catch (e) { console.warn('[NEXUS loadS] server fetch failed:', (e as Error).message) }

  S.credits = parseFloat(String(SESSION.data?.credits ?? 30)) || 30
  S.plan = (SESSION.data?.plan as string) || 'free'
  S.lastClaim = (SESSION.data?.lastClaim as string) || null
  S.allConvs = (SESSION.data?.convs as Conv[]) || []
  S.convs = S.currentProjectId ? S.allConvs.filter((c) => c.projectId === S.currentProjectId) : S.allConvs.slice()
  if (SESSION.data?.model) S.model = _resolveModel(SESSION.data.model)
}

async function loadKeys(): Promise<void> {
  try {
    const r = await fetch('/api/main'); if (!r.ok) return
    const d = await r.json() as { gemini_key?: string; turnstile_site_key?: string }
    K.gemini = d.gemini_key || ''; K.turnstile = d.turnstile_site_key || ''
    if (K.turnstile) {
      const w = window as unknown as { turnstile?: { render: (sel: string, opts: Record<string, unknown>) => unknown } }
      if (w.turnstile) {
        const wrap = document.getElementById('cf-turnstile-wrap'); if (wrap) wrap.style.display = 'block'
        _turnstileWidget = w.turnstile.render('#cf-turnstile-report', {
          sitekey: K.turnstile, theme: 'dark', size: 'normal',
          callback: (token: string) => { const el = document.getElementById('_tsToken') as HTMLInputElement | null; if (el) el.value = token },
        })
      }
    }
  } catch (e) { console.warn('[NEXUS] loadKeys error:', (e as Error).message) }
}

async function loadAdminIds(): Promise<void> {
  try {
    const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch('/api/sync?admin_ids=1', { signal: ctrl.signal }); clearTimeout(tid)
    if (r.ok) {
      const d = await r.json() as { admin_ids?: unknown; owner_ids?: unknown }
      if (d && Array.isArray(d.admin_ids)) ADMIN_IDS = d.admin_ids.filter((x): x is string => typeof x === 'string' && x.length > 0)
      if (d && Array.isArray(d.owner_ids)) {
        const extras = d.owner_ids.filter((x): x is string => typeof x === 'string')
        extras.forEach((id) => { if (!OWNER_IDS.includes(id)) OWNER_IDS.push(id) })
      }
    }
  } catch (e) { if ((e as { name?: string }).name !== 'AbortError') console.warn('[NEXUS] loadAdminIds error (non-fatal):', (e as Error).message) }
}

async function loadInboxCount(): Promise<void> {
  try {
    const r = await fetch('/api/inbox?count=1&user=' + (SESSION?.user.username ?? '')); if (!r.ok) return
    const d = await r.json() as { count?: number }
    S.unreadInbox = d.count || 0
    const b = document.getElementById('inboxBadge'); if (b) b.textContent = String(S.unreadInbox)
  } catch { }
}

// ── DAILY REWARD ──────────────────────────────────────────────────────────────
function checkDailyOnLoad(): void {
  if (isOwner() || isAdmin()) return
  const ce = document.getElementById('lastClaimInfo'), cb = document.getElementById('claimDailyBtn') as HTMLButtonElement | null
  if (!S.lastClaim) { if (ce) ce.textContent = UI.dailyReady; if (cb) cb.disabled = false; return }
  const diff = (Date.now() - new Date(S.lastClaim).getTime()) / 3600000
  if (diff >= 24) { if (ce) ce.textContent = UI.dailyReady; if (cb) cb.disabled = false }
  else { const hrs = Math.ceil(24 - diff); if (ce) ce.textContent = UI.dailyNext + hrs + 'h'; if (cb) cb.disabled = true }
}
function checkDailyCredits(): void { checkDailyOnLoad() }

function claimDaily(): void {
  if (isOwner() || isAdmin()) return
  if (S.lastClaim && (Date.now() - new Date(S.lastClaim).getTime()) / 3600000 < 24) { toast(UI.dailyAlready, 'var(--yellow)'); return }
  const n = S.plan === 'pro' ? 25 : 2
  S.credits += n; S.lastClaim = new Date().toISOString()
  updateCreds(); saveS(); _debouncedSync()
  const b = document.getElementById('claimDailyBtn') as HTMLButtonElement | null; if (b) b.disabled = true
  const e = document.getElementById('lastClaimInfo'); if (e) e.textContent = '+' + n + ' CR!'
  toast('+' + n + ' CR claimed!', 'var(--green)'); setTimeout(checkDailyCredits, 500)
}

// ── PLAY TEST ─────────────────────────────────────────────────────────────────
function togglePlayTest(): void {
  S.playTestEnabled = !S.playTestEnabled
  localStorage.setItem('nexus_play_test', S.playTestEnabled ? 'true' : 'false')
  updatePlayTestUI()
  toast(S.playTestEnabled ? 'Auto play_test enabled' : 'Disabled', S.playTestEnabled ? 'var(--green)' : 'var(--yellow)')
}
function setPlayTestDur(val: string | number): void {
  const v = Math.max(5, Math.min(120, parseInt(String(val)) || 15))
  S.playTestDuration = v; localStorage.setItem('nexus_play_test_dur', String(v))
  const inp = document.getElementById('playTestDurInput') as HTMLInputElement | null; if (inp) inp.value = String(v)
}
function updatePlayTestUI(): void {
  const tg = document.getElementById('playTestToggle'); if (tg) tg.className = 'toggle-sw' + (S.playTestEnabled ? ' on' : '')
  const dur = document.getElementById('playTestDurInput') as HTMLInputElement | null; if (dur) dur.value = String(S.playTestDuration)
}

// ── CREDITS ───────────────────────────────────────────────────────────────────
async function deductCredits(cost: number): Promise<boolean> {
  if (!SESSION || cost <= 0) return true
  if (isOwner() || isAdmin()) return true

  const requestId = _genRequestId()
  try {
    const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 10000)
    const r = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nexus-Nonce': _csrfNonce },
      signal: ctrl.signal,
      body: JSON.stringify({
        action: 'deduct-credits',
        target: (SESSION.user.username || '').toLowerCase(),
        cost,
        requestId,
      }),
    })
    clearTimeout(tid)
    const d = await r.json().catch(() => null) as { success?: boolean; credits?: number; error?: string } | null

    if (d && typeof d.credits === 'number') {
      S.credits = d.credits
      updateCreds()
      if (SESSION) {
        SESSION.data.credits = S.credits
        try { localStorage.setItem('nexus_session', JSON.stringify(SESSION)) } catch { }
      }
    }

    if (!r.ok || !d?.success) {
      if (d?.error === 'insufficient_credits') toast(UI.creditsExhausted, 'var(--pink)')
      return false
    }
    return true
  } catch (e) {
    console.warn('[NEXUS deductCredits] error:', (e as Error).message)
    return false
  }
}

function updateCreds(): void {
  const _cr = parseFloat(String(S.credits || 0))
  const v = (isOwner() || isAdmin()) ? '\u221e' : (_cr >= 100 ? _cr.toFixed(0) : _cr.toFixed(2))
  const el = document.getElementById('credDisp'); if (el) el.textContent = v
  const el2 = document.getElementById('settingsCredits'); if (el2) el2.textContent = v + ' CR'
  const el4 = document.getElementById('settingsRobloxId'); if (el4) el4.textContent = (SESSION?.user.robloxId) || '-'
  const c = document.getElementById('credsEl')
  if (c) { if (!isOwner() && !isAdmin() && _cr < 5) c.classList.add('low'); else c.classList.remove('low') }
}

function updateRoleDisplay(): void {
  if (!SESSION) return
  const plan = S.plan || 'free'; const isO = isOwner(), isA = isAdmin()
  const roleEl = document.getElementById('sbRole'), planEl = document.getElementById('settingsPlan'),
    badgeEl = document.getElementById('settingsBadge'), adminSec = document.getElementById('adminSection')
  if (roleEl) {
    if (isO) roleEl.textContent = 'Owner · Unlimited'
    else if (isA) roleEl.textContent = 'Admin'
    else if (plan === 'pro') roleEl.textContent = 'Pro Member'
    else roleEl.textContent = 'Roblox Developer'
  }
  if (planEl) planEl.textContent = isO ? 'OWNER' : isA ? 'Admin' : plan.charAt(0).toUpperCase() + plan.slice(1)
  if (badgeEl) {
    if (isO) badgeEl.innerHTML = '<span class="badge-owner">OWNER</span>'
    else if (isA) badgeEl.innerHTML = '<span class="badge-admin">ADMIN</span>'
    else if (plan === 'pro') badgeEl.innerHTML = '<span class="badge-pro">PRO</span>'
    else badgeEl.innerHTML = '<span style="font-size:9px;color:var(--dim);">FREE</span>'
  }
  if (adminSec) adminSec.style.display = (isO || isA) ? 'block' : 'none'
}

// ── STUDIO POLL ───────────────────────────────────────────────────────────────
function setStudioStatus(on: boolean): void {
  studioConnected = on
  const badge = document.getElementById('studioBadge'), dot = document.getElementById('studioDot'),
    txt = document.getElementById('studioTxt'), banner = document.getElementById('plugBanner'),
    bTxt = document.getElementById('plugBannerTxt')
  if (on) {
    if (badge) badge.className = 'status-badge on'; if (dot) dot.className = 'sdot pulse'
    if (txt) txt.textContent = UI.son; if (banner) banner.className = 'plug-banner connected'
    if (bTxt) bTxt.textContent = UI.connected
    if (!_wsCache && !_wsLoading) fetchWsCache()
  } else {
    if (badge) badge.className = 'status-badge off'; if (dot) dot.className = 'sdot pulse'
    if (txt) txt.textContent = UI.soff; if (banner) banner.className = 'plug-banner'
    if (bTxt) bTxt.textContent = UI.disconnected
    _wsCache = null; _wsLoading = false
  }
}

function startStudioPoll(): void {
  if (studioPollTimer) clearInterval(studioPollTimer)
  checkStudio(); studioPollTimer = setInterval(checkStudio, 5000)
}

let _pollFailCount = 0
const _POLL_FAIL_THRESHOLD = 2

async function checkStudio(): Promise<void> {
  if (!SESSION) return
  if (S.gen && !studioConnected) return
  const user = (SESSION.user.username || '').toLowerCase()
  try {
    const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(`${API_URL}/?check=1&user=${encodeURIComponent(user)}`, { signal: ctrl.signal })
    clearTimeout(tid)
    if (r.ok) {
      const d = await r.json() as { _pluginConnected?: boolean; connected?: boolean; online?: boolean }
      const newStatus = d._pluginConnected === true || d.connected === true || d.online === true
      const wasOn = studioConnected
      if (newStatus) { _pollFailCount = 0; setStudioStatus(true); if (!wasOn) { _wsCache = null; _wsLoading = false; fetchWsCache() } }
      else { _pollFailCount++; if (_pollFailCount >= _POLL_FAIL_THRESHOLD && !S.gen) setStudioStatus(false) }
    } else { if (!S.gen) { _pollFailCount++; if (_pollFailCount >= _POLL_FAIL_THRESHOLD) setStudioStatus(false) } }
  } catch (e) {
    if (!S.gen) { _pollFailCount++; if (_pollFailCount >= _POLL_FAIL_THRESHOLD + (_isAbortError(e) ? 1 : 0)) setStudioStatus(false) }
  }
}

async function retryStudio(): Promise<void> { _pollFailCount = 0; toast(UI.reconnectToast); await checkStudio() }

// ══════════════════════════════════════════════════════════════════════════════
// PART 4 — ACTION PARSING (24 official NEXUS AI Studio plugin actions)
// ══════════════════════════════════════════════════════════════════════════════

const NEXUS_ACTIONS = [
  'create_instance', 'create_script', 'edit_script', 'read_script',
  'set_properties', 'rename', 'delete', 'parent', 'list',
  'insert_asset', 'play_test', 'terrain', 'undo', 'redo',
  'resolve_mention', 'RunCode', 'run_code', 'get_output',
  'ping', 'get_info', 'set_project', 'get_all_actions',
  'run_test', 'stop_test', 'none',
] as const

const _NEXUS_ACTIONS_SET = new Set<string>(NEXUS_ACTIONS)

function isKnownAction(name: string): boolean {
  return _NEXUS_ACTIONS_SET.has(name)
}

function _stripLuaExpressions(str: string): string {
  if (typeof str !== 'string') return str
  str = str.replace(/Vector3\.new\s*\(\s*([-\d.\s,]+)\s*\)/g, (_, args) => '[' + args.split(',').map((p: string) => parseFloat(p.trim()) || 0).join(',') + ']')
  str = str.replace(/Color3\.fromRGB\s*\(\s*([\d.\s,]+)\s*\)/g, (_, args) => '[' + args.split(',').map((p: string) => parseInt(p.trim()) || 0).join(',') + ']')
  str = str.replace(/Color3\.new\s*\([^)]*\)/g, 'null')
  return str
}

function _normalizeCmd(obj: unknown): ActionCmd | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const o = obj as Record<string, unknown>
  const actionName = String(o.action || '').trim()
  if (!actionName || actionName.length === 0 || actionName.length > 80) return null
  if (!isKnownAction(actionName)) return null
  const result: ActionCmd = { action: actionName }
  Object.keys(o).forEach((k) => { if (k !== 'action') result[k] = o[k] })
  return result
}

function _jsonSanitize(str: string): string {
  if (!str || typeof str !== 'string') return str
  let out = '', inStr = false, escaped = false, i = 0
  while (i < str.length) {
    const c = str[i], code = str.charCodeAt(i)
    if (escaped) { out += c; escaped = false; i++; continue }
    if (c === '\\' && inStr) { out += c; escaped = true; i++; continue }
    if (c === '"') { inStr = !inStr; out += c; i++; continue }
    if (!inStr && c === '/' && str[i+1] === '/') { while (i < str.length && str[i] !== '\n') i++; continue }
    if (!inStr && c === '/' && str[i+1] === '*') { i += 2; while (i < str.length && !(str[i] === '*' && str[i+1] === '/')) i++; i += 2; continue }
    if (inStr) {
      if (c === '\n') { out += '\\n'; i++; continue } if (c === '\r') { out += '\\r'; i++; continue }
      if (c === '\t') { out += '\\t'; i++; continue } if (code < 0x20) { out += '\\u' + ('000' + code.toString(16)).slice(-4); i++; continue }
    }
    out += c; i++
  }
  return out
}

function _jsonRepair(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw
  raw = _stripLuaExpressions(raw); raw = _jsonSanitize(raw)
  raw = raw.replace(/([{,\[]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*=\s*(?![=>]))/g, '$1"$2": ')
  raw = raw.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:(?!:))/g, '$1"$2"$3')
  raw = raw.replace(/:\s*'([^'\\]*)'/g, ':"$1"').replace(/\[\s*'([^'\\]*)'/g, '["$1"').replace(/,\s*'([^'\\]*)'/g, ',"$1"')
  raw = raw.replace(/,(\s*[}\]])/g, '$1')
  raw = raw.replace(/:\s*True\b/g, ':true').replace(/:\s*False\b/g, ':false')
  raw = raw.replace(/:\s*None\b/g, ':null').replace(/:\s*nil\b/g, ':null')
  return raw
}

function _tryParseJson(raw: string): unknown {
  if (!raw || typeof raw !== 'string') return null
  raw = raw.trim()
  if (!raw || raw.length > 80000 || (!raw.startsWith('{') && !raw.startsWith('['))) return null
  try { return JSON.parse(raw) } catch { }
  const stripped = _stripLuaExpressions(raw)
  try { return JSON.parse(stripped) } catch { }
  try { return JSON.parse(_jsonRepair(raw)) } catch { }
  try { return JSON.parse(_jsonRepair(stripped)) } catch { }
  const jm = stripped.match(/(\[[\s\S]+\]|\{[\s\S]+\})/)
  if (jm) { try { return JSON.parse(jm[1]) } catch { } try { return JSON.parse(_jsonRepair(jm[1])) } catch { } }
  else { const jm2 = raw.match(/(\[[\s\S]+\]|\{[\s\S]+\})/); if (jm2) { try { return JSON.parse(_jsonRepair(jm2[1])) } catch { } } }
  return null
}

function parseActionBlocks(text: string): ActionCmd[] {
  const cmds: ActionCmd[] = []
  const re = /```(?:json|JSON|Json)\s*\n?([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].trim()
    if (!raw || raw.length < 5 || raw.length > 50000) continue
    const parsed = _tryParseJson(raw)
    if (!parsed) continue

    let items: unknown[] = []
    if (Array.isArray(parsed)) {
      items = parsed
    } else {
      const p = parsed as Record<string, unknown>
      if (Array.isArray(p.actions)) items = p.actions
      else if (p.action) items = [parsed]
    }

    items.forEach((item) => {
      const norm = _normalizeCmd(item)
      if (norm) cmds.push(norm)
    })
  }
  return cmds
}

function parseAllCommands(text: string): ActionCmd[] {
  const cmds = parseActionBlocks(text)
  if (cmds.length > 0) return cmds

  const jsonMatches = text.match(/(\[[\s\S]*?"action"[\s\S]*?\]|\{[\s\S]*?"action"[\s\S]*?\})/g)
  if (jsonMatches) {
    jsonMatches.forEach((raw) => {
      if (raw.length > 30000) return
      const parsed = _tryParseJson(raw.trim())
      if (!parsed) return
      const items = Array.isArray(parsed) ? parsed : [parsed]
      items.forEach((item) => {
        const norm = _normalizeCmd(item)
        if (norm && !cmds.some((e) => e.action === norm.action && JSON.stringify(e) === JSON.stringify(norm))) {
          cmds.push(norm)
        }
      })
    })
  }
  return cmds
}

function makeStepLabel(cmd: ActionCmd): string | null {
  const a = cmd.action || ''
  const nm = String(cmd.name || cmd.target || '')
  switch (a) {
    case 'create_instance':  return `Create ${String(cmd.class_name || 'Instance')}: ${nm || '?'}`
    case 'create_script':    return `Create ${String(cmd.type || cmd.script_type || 'Script')}: ${nm || '?'}`
    case 'edit_script':      return `Edit script: ${nm}`
    case 'read_script':      return `Read script: ${nm}`
    case 'set_properties':   return `Set property: ${nm}${cmd.property ? '.' + String(cmd.property) : ''}`
    case 'rename':            return `Rename: ${nm} → ${String(cmd.new_name || '?')}`
    case 'delete':            return `Delete: ${nm || String(cmd.class || '')}`
    case 'parent':             return `Reparent: ${nm} → ${String(cmd.parent || '?')}`
    case 'list':                return 'List instances/scripts'
    case 'insert_asset':     return `Insert asset: ${String(cmd.asset_id || cmd.id || '?')}`
    case 'play_test':
    case 'run_test':           return UI.testRunning
    case 'stop_test':          return 'Stop play test'
    case 'terrain':            return `Terrain: ${String(cmd.op || 'fill_block')}`
    case 'undo':                return 'Undo last change'
    case 'redo':                return 'Redo last change'
    case 'resolve_mention':  return `Resolve @${nm}`
    case 'RunCode':
    case 'run_code':            return `RunCode: ${String(cmd.mode || 'pipeline')}`
    case 'get_output':        return 'Read Studio output log'
    case 'ping':                return 'Health check'
    case 'get_info':           return 'Get plugin info'
    case 'set_project':       return 'Set project info'
    case 'get_all_actions':  return 'List available actions'
    case 'none':                return null
    default:                     return a + (nm ? ': ' + nm : '')
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 5 — FETCH HELPERS + AUTO INJECT PIPELINE
// ══════════════════════════════════════════════════════════════════════════════

function _isNexusBackendUrl(url: string): boolean {
  return NEXUS_API_URLS.some((base) => base && url.startsWith(base))
}

async function fetchRetry(url: string, opts: RequestInit, tries = 3): Promise<Response | null> {
  const headers = opts.headers as Record<string, string>
  if (headers && _isNexusBackendUrl(url)) {
    headers['X-Nexus-Nonce'] = _csrfNonce
    if (isAdmin() || isOwner()) headers['X-Admin-Token'] = _adminToken || generateAdminToken()
  }
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 12000)
      const r = await fetch(url, { ...opts, signal: ctrl.signal }); clearTimeout(tid)
      if (r.ok) return r
      if (r.status === 429) { toast('Server rate limit, waiting...', 'var(--yellow)'); await _sleep(_jitter(3000 * (i + 1))) }
      else if (r.status >= 500) { if (i < tries - 1) await _sleep(_jitter(1000 * (i + 1))); else return r }
      else return r
    } catch (e) {
      if (_isAbortError(e)) { const opts2 = opts as RequestInit & { signal?: AbortSignal }; if (opts2.signal?.aborted) throw e; if (i < tries - 1) { await _sleep(_jitter(800 * (i + 1))); continue }; throw e }
      if (i === tries - 1) throw e
      await _sleep(_jitter(800 * (i + 1)))
    }
  }
  return null
}

async function safeFetch(bodyData: Record<string, unknown>, signal?: AbortSignal): Promise<Response | null> {
  try {
    let bd = bodyData
    if (bd.command && typeof (bd.command as Record<string, unknown>).source === 'string' && ((bd.command as Record<string, unknown>).source as string).length > 80000)
      bd = { ...bd, command: { ...(bd.command as Record<string, unknown>), source: ((bd.command as Record<string, unknown>).source as string).slice(0, 80000) + '\n-- [TRUNCATED]' } }
    const opts: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nexus-Nonce': _csrfNonce }, body: JSON.stringify(bd) }
    if (signal && !signal.aborted) opts.signal = signal
    return await fetch(API_URL + '/', opts)
  } catch (e) { if (_isAbortError(e)) throw e; console.warn('[NEXUS inject] safeFetch error:', (e as Error).message); return null }
}

async function safeFetchWithRetry(bodyData: Record<string, unknown>, signal?: AbortSignal, maxRetries = 2): Promise<Response | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new Error('AbortError')
    try {
      const r = await safeFetch(bodyData, signal); if (r) return r
      if (attempt < maxRetries) { await _sleep(_jitter(1000 * (attempt + 1))); continue }
      return null
    } catch (e) { if (_isAbortError(e)) throw e; if (attempt < maxRetries) { await _sleep(_jitter(1000 * (attempt + 1))); continue }; throw e }
  }
  return null
}

async function _injectCommand(cmdToSend: ActionCmd, user: string, signal?: AbortSignal): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const r = await safeFetchWithRetry({ type: 'inject_command', command: cmdToSend, _user: user, _target_user: user }, signal, 2)
  if (!r) return { ok: false, error: 'No response (network error)' }
  let rd: { status?: string; pushed?: number; error?: string }
  try { rd = await r.json() } catch { rd = {} }
  if (r.ok && (rd.status === 'ok' || (rd.pushed || 0) > 0)) return { ok: true, data: rd }
  return { ok: false, error: rd.error ? rd.error.slice(0, 120) : ('HTTP ' + r.status) }
}

async function autoInjectToStudio(aiResponse: string, _userPrompt: string): Promise<string[] | null> {
  if (!studioConnected) return null
  const summary: string[] = [], user = (SESSION?.user.username ?? '').toLowerCase()
  const cmds = parseAllCommands(aiResponse)
  if (!cmds.length) return null

  const hasPlayTest = cmds.some((c) => c.action === 'play_test' || c.action === 'run_test')
  const hasStopTest = cmds.some((c) => c.action === 'stop_test')
  if (S.playTestEnabled && !hasPlayTest && !hasStopTest) {
    cmds.push({ action: 'run_test', duration: S.playTestDuration })
  }

  const planSteps: { cmd: ActionCmd; sid: number | null }[] = []
  cmds.forEach((cmd) => {
    if (cmd.action === 'none') return
    const lbl = makeStepLabel(cmd)
    if (!lbl) return
    const sub = String(cmd.parent || cmd.target || '')
    const sid = addStep(lbl, 'pending', sub)
    planSteps.push({ cmd, sid })
  })

  const cntEl = document.getElementById('stepsCount'); if (cntEl) cntEl.textContent = '(0/' + planSteps.length + ')'
  let doneCount = 0

  for (let pi = 0; pi < planSteps.length; pi++) {
    const step = planSteps[pi]; if (!S.gen) break
    const sig = S.cancelCtrl?.signal; if (sig?.aborted) break
    if (!step.sid) { doneCount++; continue }
    updateStep(step.sid, 'running'); await _sleep(120)

    const cmd = step.cmd, a = cmd.action || ''
    const res = await _injectCommand(cmd, user, sig)

    if (res.ok) {
      if (a === 'play_test' || a === 'run_test') {
        updateStep(step.sid, 'running', UI.testRunning); _playTestActive = true
      } else if (a === 'stop_test') {
        updateStep(step.sid, 'done'); _playTestActive = false
      } else if (a === 'read_script' || a === 'list' || a === 'get_output' || a === 'resolve_mention') {
        updateStep(step.sid, 'info'); await _sleep(300)
      } else {
        updateStep(step.sid, 'done')
        const lbl2 = makeStepLabel(cmd); if (lbl2) summary.push(lbl2)
        let postDelay = 400
        if (a === 'set_properties') postDelay = 900
        else if (a === 'create_instance' || a === 'create_script' || a === 'RunCode' || a === 'run_code') postDelay = 750
        else if (a === 'terrain' || a === 'insert_asset') postDelay = 600
        await _sleep(postDelay)
      }
    } else {
      updateStep(step.sid, 'error', String(res.error || 'rejected').slice(0, 100)); await _sleep(400)
    }

    doneCount++; if (cntEl) cntEl.textContent = '(' + doneCount + '/' + planSteps.length + ')'
  }

  return summary.length > 0 ? summary : null
}

// ── SYSTEM PROMPT ──────────────────────────────────────────────────────────────
function _fallbackBuildSysPrompt(): string { return '' }

function buildApiMsgs(): { role: string; content: string | unknown[] }[] {
  const cv = S.convs.find((x) => x.id === S.curConv); if (!cv) return []
  return (cv.msgs || []).slice(-28).map((m) => {
    const content = (m as ConvMsg & { _rawContent?: string })._rawContent || m.content || ''
    if (Array.isArray(m.content)) return { role: m.role === 'user' ? 'user' : 'model', content: m.content }
    return { role: m.role === 'user' ? 'user' : 'model', content: String(content) }
  })
}

function detectType(txt: string): string {
  if (/error|fix|bug|debug|broken|crash|not work|failed/i.test(txt)) return 'debug'
  if (/gui|hud|menu|shop|loading|inventory|screen|frame|button/i.test(txt)) return 'gui'
  if (/read|check script/i.test(txt)) return 'read'
  if (/edit|change|update|add to/i.test(txt) && /script/i.test(txt)) return 'edit'
  if (/test|play|run/i.test(txt)) return 'test'
  return 'normal'
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 6 — SEND FUNCTION
// ══════════════════════════════════════════════════════════════════════════════

function _resetGenState(): void {
  if (S.cancelCtrl) { try { S.cancelCtrl.abort() } catch { } S.cancelCtrl = null }
  S.gen = false; _playTestActive = false; removeStepsCard()
  const sb = document.getElementById('sendBtn'), cb = document.getElementById('cancelBtn')
  if (sb) sb.classList.remove('hidden'); if (cb) cb.classList.add('hidden')
}
function cancelGen(): void { _resetGenState(); toast(UI.cancelToast, 'var(--yellow)') }

async function callAiApi(body: Record<string, unknown>, abortSignal?: AbortSignal): Promise<{ ok: boolean; data?: { content: string }; error?: string; timeout?: boolean; status?: number }> {
  const MAX_RETRIES = 3; const RETRY_DELAYS = [2000, 5000, 10000]
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (abortSignal?.aborted) throw new Error('AbortError')
    const aiCtrl = new AbortController(); const aiTimeoutId = setTimeout(() => aiCtrl.abort(), 90000)
    const _onUserCancel = () => { try { aiCtrl.abort() } catch { } }
    if (abortSignal && !abortSignal.aborted) abortSignal.addEventListener('abort', _onUserCancel, { once: true })
    try {
      const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: aiCtrl.signal })
      clearTimeout(aiTimeoutId); try { abortSignal?.removeEventListener('abort', _onUserCancel) } catch { }
      if (response.ok) {
        const rd = await response.json() as { content: string }
        if (!validateApiResponse(rd)) throw new Error('Invalid API response structure')
        return { ok: true, data: rd }
      }
      let errData: { error?: string; message?: string } = {}; try { errData = await response.json() } catch { }
      const errMsg = errData.error || errData.message || ('API error ' + response.status)
      const isBusy = response.status === 503 || response.status === 429 || (typeof errMsg === 'string' && /overloaded|busy|rate.limit|quota|capacity/i.test(errMsg))
      if (isBusy && attempt < MAX_RETRIES) {
        const waitMs = RETRY_DELAYS[attempt] || 5000
        if (attempt === 0) toast('Model busy, retrying...', 'var(--yellow)', waitMs)
        const stepsTxt = document.getElementById('stepsTxt'); if (stepsTxt) stepsTxt.textContent = UI.retrying + ' (' + (attempt + 1) + '/' + MAX_RETRIES + ')'
        await _sleep(waitMs); continue
      }
      return { ok: false, error: String(errMsg), status: response.status }
    } catch (e) {
      clearTimeout(aiTimeoutId); try { abortSignal?.removeEventListener('abort', _onUserCancel) } catch { }
      if (_isAbortError(e)) {
        if (abortSignal?.aborted) throw e
        if (attempt < MAX_RETRIES) { await _sleep(RETRY_DELAYS[attempt] || 3000); continue }
        return { ok: false, error: 'Request timeout', timeout: true }
      }
      if (attempt < MAX_RETRIES) { await _sleep(_jitter(1500 * (attempt + 1))); continue }
      return { ok: false, error: String((e as Error).message || 'Network error') }
    }
  }
  return { ok: false, error: 'Max retries exceeded' }
}

function _truncateMsgsForApi(msgs: { role: string; content: string | unknown[] }[], maxChars = 60000): typeof msgs {
  let totalChars = 0; const result: typeof msgs = []
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]; const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')
    totalChars += content.length; if (totalChars > maxChars && result.length > 2) break; result.unshift(m)
  }
  if (result.length === 1 && typeof result[0].content === 'string' && result[0].content.length > maxChars)
    result[0] = { ...result[0], content: result[0].content.slice(0, maxChars) + '\n[... truncated]' }
  return result
}

async function send(): Promise<void> {
  if (S.gen) return
  const inp = document.getElementById('inp') as HTMLTextAreaElement | null
  const txt = inp?.value.trim() ?? ''; const attachments = S.attachments.slice()
  if (!txt && !attachments.length) return
  if (!checkClientRateLimit('send', 20)) return

  // Defense-in-depth: handleFile/paste already prevent queuing images for
  // a model that doesn't support them, but if the user queued images then
  // switched models through some other path, block here rather than
  // silently sending image blocks a provider will reject.
  const imageCount = attachments.filter((a) => a.type === 'image').length
  if (imageCount > 0 && !modelSupportsImages(S.model)) {
    toast(`${S.model.label || S.model.id} doesn't support image input. Remove the image(s) or switch model.`, 'var(--pink)', 3800)
    return
  }
  if (imageCount > MAX_IMAGE_ATTACHMENTS) {
    toast(`Maximum ${MAX_IMAGE_ATTACHMENTS} images per message.`, 'var(--yellow)', 3200)
    return
  }

  if (!isOwner() && !isAdmin()) {
    const _mc = S.model.cost || 0
    const _imgCost = imageCount * costPerImageForModel(S.model)
    const _estTotal = _mc + _imgCost
    if (_mc > 0 && S.credits <= 0) { toast(UI.creditsExhausted, 'var(--pink)'); return }
    if (_estTotal > 0 && S.credits < _estTotal) {
      toast(`Need at least ${_estTotal.toFixed(2)} CR for this model${imageCount ? ' + ' + imageCount + ' image(s)' : ''}`, 'var(--yellow)')
      return
    }
  }
  if (!S.curConv) newChat()
  let cv = S.convs.find((x) => x.id === S.curConv)
  if (!cv) { newChat(); cv = S.convs.find((x) => x.id === S.curConv); if (!cv) { toast('Error: conversation not found', 'var(--pink)'); return } }
  S.gen = true; if (S.cancelCtrl) { try { S.cancelCtrl.abort() } catch { } }; S.cancelCtrl = new AbortController(); _playTestActive = false
  const sb = document.getElementById('sendBtn'), cb = document.getElementById('cancelBtn')
  if (sb) sb.classList.add('hidden'); if (cb) cb.classList.remove('hidden')
  if (inp) { inp.value = ''; inp.style.height = 'auto' }; delete S.draftText[S.curConv!]
  const userMsg: ConvMsg = { role: 'user', content: txt, time: Date.now() }
  if (attachments.length) userMsg.attachments = attachments
  cv.msgs = cv.msgs || []; cv.msgs.push(userMsg); appendMsg(userMsg)
  const lastPrompt = txt; S.attachments = []; renderAttachRow()
  if (cv.msgs.length === 1) setConvTitle(S.curConv!, txt); hideMentionDD()
  const showThinking = !isPureGreeting(txt)

  // ── THINKING CARD ────────────────────────────────────────────────────────
  // FIX (flicker bug): the steps card is created once here and is only ever
  // removed in exactly two places for the success path: right before
  // appendMsg(aiMsg) at the very end, or inside one of the early-return
  // branches below. There is no longer any intermediate
  // "finalizeSteps(); await _sleep(...); removeStepsCard()" pattern with a
  // gap before the bubble is appended — that gap was the empty/flicker
  // window users were seeing between "thinking disappears" and "AI message
  // appears". Now finalizeSteps() (success checkmark sweep) and
  // removeStepsCard() + appendMsg() happen back-to-back with no awaits
  // between them.
  if (showThinking) {
    createStepsCard(); const rtype = detectType(txt)
    if (rtype === 'debug') { addStep(UI.readingScript, 'running'); await _sleep(500); updateStep(1, 'done'); addStep(UI.analyzingError, 'running'); await _sleep(350); updateStep(2, 'done'); addStep(UI.designingFix, 'running') }
    else if (rtype === 'gui') { addStep(UI.designingUI, 'running'); await _sleep(350); updateStep(1, 'done'); addStep(UI.buildingComponents, 'running') }
    else if (rtype === 'read') { addStep(UI.readingScript, 'running') }
    else if (rtype === 'edit') { addStep(UI.preparingEdit, 'running') }
    else if (rtype === 'test') { addStep(UI.preparingTest, 'running') }
    else { addStep(UI.analyzingReq, 'running'); await _sleep(350); updateStep(1, 'done'); addStep(UI.designingSolution, 'running') }
  }
  if (!S.gen || S.cancelCtrl?.signal.aborted) { _resetGenState(); return }

  // ── AI FEED CHECK ────────────────────────────────────────────────────────
  // Pulls unread Studio-reported events (read_script results, output_log
  // captures, runcode results, plugin errors) from the durable Convex feed
  // and folds them into the system prompt as extra context — but only when
  // it's actually likely to matter (Studio connected + relevant message),
  // so a plain "hi" doesn't spend a round trip on this.
  let aiFeedCtx = ''
  if (_shouldCheckAiFeed(txt)) {
    const feedStep = showThinking ? addStep(UI.checkingFeed, 'running') : null
    try {
      const entries = await fetchAiFeed(8)
      if (entries?.length) aiFeedCtx = _buildAiFeedContext(entries)
      if (feedStep) updateStep(feedStep, entries?.length ? 'done' : 'info', entries?.length ? undefined : 'No new Studio events')
    } catch { if (feedStep) updateStep(feedStep, 'error', 'Feed check failed') }
  }
  if (!S.gen || S.cancelCtrl?.signal.aborted) { _resetGenState(); return }

  let msgs = buildApiMsgs()
  let sysPrompt = buildSysPrompt({
    session: SESSION ? { user: { username: SESSION.user.username, displayName: SESSION.user.username } } : null,
    settings: { credits: S.credits, plan: S.plan, currentProjectName: S.currentProjectName, playTestEnabled: S.playTestEnabled, playTestDuration: S.playTestDuration },
    studioConnected, isOwnerFn: isOwner, isAdminFn: isAdmin,
  })
  if (aiFeedCtx) sysPrompt = sysPrompt + '\n\n' + aiFeedCtx
  if (_shouldSearchDocs(txt) && sysPrompt) {
    try { const _docsResult = await searchRobloxDocs(txt, 5); if (_docsResult) { const _docsCtx = _buildDocsContext(_docsResult); if (_docsCtx) sysPrompt = sysPrompt + '\n\n' + _docsCtx } } catch { }
  }
  const SYS_CAP = 7500; let apiMsgs = msgs.slice(0, -1); let sysMain = sysPrompt, sysOverflow = ''
  if (sysPrompt && sysPrompt.length > SYS_CAP) {
    sysMain = sysPrompt.slice(0, SYS_CAP); sysOverflow = sysPrompt.slice(SYS_CAP)
    const breakAt = sysMain.lastIndexOf('\n'); if (breakAt > SYS_CAP * 0.8) { sysOverflow = sysMain.slice(breakAt) + sysOverflow; sysMain = sysMain.slice(0, breakAt) }
  }
  if (sysOverflow?.trim().length > 10) apiMsgs = [{ role: 'user', content: '[SYSTEM CONTEXT CONTINUED]\n' + sysOverflow }, { role: 'assistant', content: 'Understood.' }, ...apiMsgs]
  interface ApiMsg { role: string; content: string | unknown[] }
  const lastM: ApiMsg = { role: 'user', content: txt }
  if (attachments.length) {
    const ca: unknown[] = [{ type: 'text', text: txt }]
    attachments.forEach((a) => { if (a.type === 'image') ca.push({ type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } }) })
    lastM.content = ca
  }
  apiMsgs.push(lastM); apiMsgs = _truncateMsgsForApi(apiMsgs, 55000)
  let aiText = ''; const _localCancelSignal = S.cancelCtrl?.signal
  const apiBody = { provider: S.model.prov || 'gemini', model: S.model.id, messages: apiMsgs, system: sysMain, max_tokens: 65536 }
  const aiResult = await callAiApi(apiBody, _localCancelSignal)
  if (!S.gen || _localCancelSignal?.aborted) { _resetGenState(); return }
  if (!aiResult.ok) {
    if (aiResult.error && _isAbortError({ name: 'AbortError', message: aiResult.error })) { _resetGenState(); return }
    let errMsg = aiResult.error || 'Unknown error'
    if (aiResult.timeout) errMsg = 'Request timeout. Try a shorter message.'
    else if (/overloaded|busy|503|429/i.test(String(errMsg))) errMsg = 'Model is very busy. Wait a few minutes or switch model.'
    aiText = '**' + UI.errorPrefix + '**\n\n' + errMsg + '\n\nSuggestion: try another model.'
  } else { aiText = aiResult.data!.content || '' }
  const hasError = aiText && (aiText.startsWith('**Failed') || aiText.startsWith('**Error'))

  // ── CREDIT DEDUCTION (server-authoritative) ─────────────────────────
  // Total cost = base model cost (skipped/min'd for pure greetings) +
  // extra per additional action beyond the first + per-image surcharge
  // (proportional to the model's base cost — see costPerImageForModel()).
  // Credits can be fractional (e.g. "3.45 CR"), matching the server side
  // which already stores/returns credits as a float.
  if (!isOwner() && !isAdmin() && aiText && !hasError) {
    const _baseCost = S.model.cost || 0
    const _imageCost = imageCount * costPerImageForModel(S.model)
    if (_baseCost > 0 || _imageCost > 0) {
      const _numActions = parseAllCommands(aiText).length
      const _actionCost = isPureGreeting(lastPrompt) ? 0 : Math.max(0, _numActions - 1) * 0.5
      const _textCost = isPureGreeting(lastPrompt) ? (_baseCost > 0 ? 1 : 0) : _baseCost + _actionCost
      const _totalCost = parseFloat((_textCost + _imageCost).toFixed(2))
      if (_totalCost > 0) { await deductCredits(_totalCost) }
    }
  }

  let studioSummary: string[] | null = null, displayText = ''
  if (studioConnected && !hasError) {
    const _preCmds = parseAllCommands(aiText)
    if (_preCmds.length > 0) {
      const _totalActions = _preCmds.length
      if (showThinking) { clearSteps(); const _injectSummaryStep = addStep('Sending ' + _totalActions + ' action(s) to Studio...', 'running', 'One by one, please wait'); setStepTitle(UI.buildingInStudio); await _sleep(200); if (_injectSummaryStep) updateStep(_injectSummaryStep, 'done') }
      studioSummary = await autoInjectToStudio(aiText, lastPrompt)
      if (!S.gen || _localCancelSignal?.aborted) { _resetGenState(); const cancelMsg: ConvMsg = { role: 'ai', content: 'Process cancelled.', time: Date.now() }; cv.msgs.push(cancelMsg); appendMsg(cancelMsg); saveS(); return }
    } else {
      // No actions detected — finalize + remove the card and append the
      // message immediately afterward, with no awaited gap between them.
      if (showThinking) finalizeSteps()
      displayText = cleanAIResponse(aiText) + '\n\n> ⚠️ No actions detected.'
      const aiMsg0: ConvMsg & { _rawContent: string } = { role: 'ai', content: displayText, time: Date.now(), _rawContent: aiText }
      removeStepsCard()
      cv.msgs.push(aiMsg0); appendMsg(aiMsg0); _resetGenState(); saveS(); return
    }
    displayText = stripAllCode(aiText)
    if (!displayText || displayText.length < 20) displayText = studioSummary?.length ? 'Successfully sent to Studio:\n' + studioSummary.map((s) => '• ' + s).join('\n') : 'Done. Check Explorer in Studio.'
    if (!_playTestActive) { if (showThinking) finalizeSteps() }
    else { document.getElementById('stepsCancel')?.remove() }
  } else {
    displayText = cleanAIResponse(aiText)
    if (showThinking) finalizeSteps()
  }
  cv = S.convs.find((x) => x.id === S.curConv); if (!cv) { removeStepsCard(); _resetGenState(); saveS(); return }
  const aiMsg: ConvMsg & { _rawContent: string; studioSummary?: string[] } = { role: 'ai', content: displayText, time: Date.now(), _rawContent: aiText }
  if (studioSummary) aiMsg.studioSummary = studioSummary
  // Remove the steps card and append the real message back-to-back — this
  // is the core of the flicker fix: there is no "removeStepsCard() ...
  // (gap) ... appendMsg()" anymore. Whatever delay existed (network,
  // injection) already happened *before* this point, while the steps card
  // was still visibly progressing.
  removeStepsCard()
  cv.msgs.push(aiMsg); appendMsg(aiMsg); _resetGenState(); saveS()
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 7 — CONVERSATIONS, RENDER MESSAGES, STEPS CARD, MENTION, MODEL UI
// ══════════════════════════════════════════════════════════════════════════════

function renderSuggestions(): void {
  const grid = document.getElementById('suggGrid'); if (!grid) return
  grid.innerHTML = UI.suggs.map((s) =>
    `<div class="sugg" onclick="window.useSugg(this.dataset.q)" data-q="${esc(s.q)}"><div class="sugg-title"><svg viewBox="0 0 24 24">${s.icon}</svg>${esc(s.title)}</div>${esc(s.body)}</div>`
  ).join('')
}

function applyLang(): void {
  function s(id: string, v: string) { const e = document.getElementById(id); if (e) e.textContent = v }
  function sh(id: string, v: string) { const e = document.getElementById(id); if (e) e.innerHTML = v }
  const sa = (id: string, a: string, v: string) => { const e = document.getElementById(id); if (e) (e as HTMLElement & Record<string, unknown>)[a] = v }
  sa('inp', 'placeholder', UI.placeholder)
  s('plugBannerTxt', studioConnected ? UI.connected : UI.disconnected)
  const steps = document.querySelectorAll('.install-txt')
  UI.installSteps.forEach((txt, i) => { const el = steps[i] as HTMLElement | undefined; if (el) el.innerHTML = txt })
  const mhdr = document.getElementById('mentionHdrTxt'); if (mhdr) mhdr.textContent = 'Scripts & Objects in Place'
  sh('redeemHint', 'Get codes at <a href="https://discord.gg/FzAF48mvK5" target="_blank" style="color:var(--cyan)">NEXUS STUDIO Discord</a>')
  setStudioStatus(studioConnected); updateModelUI(); renderConvs(); updatePlayTestUI(); renderSuggestions()
  document.documentElement.lang = 'en'
}

// ── CONVERSATIONS ─────────────────────────────────────────────────────────────
function renderConvs(): void {
  const list = document.getElementById('convList'); if (!list) return
  if (!S.convs?.length) { list.innerHTML = `<div class="conv-empty">${UI.noConv}</div>`; return }
  list.innerHTML = S.convs.slice().reverse().map((cv) => {
    const act = cv.id === S.curConv ? 'act' : ''
    const time = cv.time ? new Date(cv.time).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' }) : ''
    return `<div class="ci ${act}" onclick="window.loadConv('${cv.id}')"><div class="ci-title">${esc(cv.title || 'Chat')}</div><div class="ci-time">${time}</div><button class="ci-del" onclick="window.delConv(event,'${cv.id}')" title="Delete">x</button></div>`
  }).join('')
}

function newChat(): void {
  const now = Date.now(); if (now - _lastNewChatTime < _NEW_CHAT_DEBOUNCE) return; _lastNewChatTime = now
  if (S.gen) _resetGenState()
  const id = 'c' + Date.now()
  const cv: Conv = { id, title: 'New Chat', time: Date.now(), msgs: [], projectId: S.currentProjectId }
  S.curConv = id; if (!S.convs) S.convs = []; S.convs.push(cv)
  renderConvs(); renderMsgs([])
  const ti = document.getElementById('chatTitle'); if (ti) ti.textContent = S.currentProjectName ? UI.projectLabel + ': ' + S.currentProjectName : UI.chatTitle
  const w = document.getElementById('welcome'); if (w) w.style.display = 'flex'
  const inp = document.getElementById('inp') as HTMLTextAreaElement | null; if (inp) { inp.value = ''; inp.style.height = 'auto' }
  S.attachments = []; renderAttachRow(); saveS()
}

function loadConv(id: string): void {
  if (S.gen && S.curConv !== id) _resetGenState()
  const cv = S.convs.find((x) => x.id === id); if (!cv) return
  S.curConv = id; renderConvs()
  const ti = document.getElementById('chatTitle'); if (ti) ti.textContent = cv.title || 'Chat'
  const w = document.getElementById('welcome'); if (w) w.style.display = (cv.msgs?.length) ? 'none' : 'flex'
  renderMsgs(cv.msgs || []); S.attachments = []; renderAttachRow()
  const inp = document.getElementById('inp') as HTMLTextAreaElement | null
  if (inp) { inp.value = S.draftText[id] || ''; inp.style.height = 'auto'; if (inp.value) inp.style.height = Math.min(inp.scrollHeight, 130) + 'px' }
}

function delConv(e: Event, id: string): void {
  e.stopPropagation(); S.convs = S.convs.filter((x) => x.id !== id)
  if (S.curConv === id) { if (S.convs.length) loadConv(S.convs[S.convs.length - 1].id); else newChat() }
  renderConvs(); saveS()
}

function saveDraft(): void {
  if (!S.curConv) return
  const inp = document.getElementById('inp') as HTMLTextAreaElement | null
  if (inp?.value.trim()) S.draftText[S.curConv] = inp.value; else delete S.draftText[S.curConv]
}

function setConvTitle(convId: string, firstMsg: string): void {
  const cv = S.convs.find((x) => x.id === convId); if (!cv) return
  cv.title = firstMsg.slice(0, 45) + (firstMsg.length > 45 ? '..' : '')
  const ti = document.getElementById('chatTitle'); if (ti) ti.textContent = cv.title; renderConvs()
}

function getProjectIdFromUrl(): string | null {
  const p = new URLSearchParams(window.location.search); const id = p.get('id'); if (id) return id
  const pts = window.location.pathname.split('/'); const ci = pts.indexOf('chats')
  if (ci !== -1 && pts[ci + 1]) return pts[ci + 1]; return null
}

function getProjectName(pid: string): string | null {
  if (!pid) return null
  const projs = S.projects || (SESSION?.data?.projects as AppState['projects']) || []
  return projs.find((x) => x.id === pid)?.name ?? null
}

function updateProjectUI(): void {
  const n = S.currentProjectName
  const pill = document.getElementById('projNamePill'), pillText = document.getElementById('projNameText')
  if (n) { if (pill) { pill.style.display = 'flex'; } if (pillText) pillText.textContent = n }
  else { if (pill) pill.style.display = 'none' }
  const chip = document.getElementById('sbProjChip'), cn = document.getElementById('sbProjName')
  if (chip) { chip.style.display = n ? '' : 'none'; if (cn && n) cn.textContent = n }
}

// ── MODEL UI ──────────────────────────────────────────────────────────────────
function updateModelUI(): void {
  const m = S.model || getFreeModel()
  const el = document.getElementById('inpMName'); if (el) el.textContent = m.label || m.id || ''
  const b = document.getElementById('inpMBadge')
  if (b) { b.textContent = (m.cost || 0) <= 0 ? 'FREE' : m.cost + ' CR'; b.style.color = (m.cost || 0) <= 0 ? 'var(--green)' : (m.cost || 0) <= 1 ? 'var(--cyan)' : (m.cost || 0) <= 3 ? 'var(--yellow)' : 'var(--pink)' }
  const ic = document.getElementById('inpMIcon') as HTMLImageElement | null
  if (ic) { ic.src = m.icon || ''; ic.style.display = m.icon ? '' : 'none' }
  updateAttachAvailability()
}

// ── MODEL DROPDOWN — REDESIGNED MARKUP ────────────────────────────────────────
// Cleaner structure: explicit per-row layout, badge classes mapped to the
// `.mb-badge` rules injected in _injectUiFixStyles() above (f = free,
// p = premium/best, s = standard/fast). Group headers get a small icon-less
// divider rhythm via CSS only — markup just needs the right classes/text.
function buildMDDHtml(): string {
  const curId = S.model.id; let html = ''
  MODEL_LIST.forEach((m) => {
    if (m.grp) { html += `<div class="mg">${esc(m.grp)}</div>`; return }
    const act = m.id === curId
    const bc = (m.cost || 0) <= 0 ? 'f' : m.badge === 'BEST' ? 'p' : 's'
    const iconHtml = m.icon
      ? `<img src="${m.icon}" onerror="this.style.display='none'" style="width:18px;height:18px;object-fit:contain;border-radius:4px;">`
      : `<div style="width:18px;height:18px;border-radius:4px;background:rgba(0,229,255,.12);font-size:9px;display:flex;align-items:center;justify-content:center;color:var(--cyan);font-weight:700;">AI</div>`
    const costLabel = (m.cost || 0) <= 0 ? 'Free' : m.cost + ' CR / msg'
    const noImageTag = !modelSupportsImages(m)
      ? `<span title="Does not support image input" style="display:inline-flex;align-items:center;gap:2px;color:var(--dim);font-size:8px;margin-top:2px;"><svg width="9" height="9" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><line x1="3" y1="21" x2="21" y2="3"/></svg>No images</span>`
      : ''
    html += `<div class="mo${act ? ' act' : ''}" onclick="window.selModel('${m.id}')">` +
      `<div class="mo-icon">${iconHtml}</div>` +
      `<div class="mo-info"><div class="mo-n">${esc(m.label || m.id || '')}</div><div class="mo-s">${esc(costLabel)}</div>${noImageTag}</div>` +
      `<div class="mo-right"><span class="mb-badge ${bc}">${esc(m.badge || (m.cost + ' CR'))}</span></div>` +
      (act ? `<div class="mo-sel-dot"></div>` : '') +
      `</div>`
  })
  return html
}

function toggleMDD(e: Event): void {
  e.stopPropagation(); const dd = document.getElementById('mDD'); if (!dd) return
  dd.innerHTML = buildMDDHtml()
  const btn = document.getElementById('inpModelBtn')
  if (btn) { const r = btn.getBoundingClientRect(); dd.style.bottom = (window.innerHeight - r.top + 8) + 'px'; dd.style.left = r.left + 'px'; dd.style.right = 'auto' }
  dd.classList.toggle('open')
}

function selModel(id: string): void {
  const m = MODEL_LIST.find((x) => x.id === id); if (!m || m.grp) return
  S.model = m; updateModelUI(); _dropUnsupportedImageAttachments(); updateAttachAvailability()
  const dd = document.getElementById('mDD'); if (dd) dd.classList.remove('open'); saveS()
}

// ── SUGGESTION CHIPS ──────────────────────────────────────────────────────────
function _injectSuggChipStyles(): void {
  if (document.getElementById('nx-chip-styles')) return
  const s = document.createElement('style'); s.id = 'nx-chip-styles'
  s.textContent = '.suggestion-chips{display:flex;flex-direction:column;gap:5px;margin-top:10px;margin-bottom:2px;}.suggestion-chip{display:flex;align-items:center;gap:8px;padding:7px 12px 7px 10px;background:rgba(0,229,255,.05);border:1px solid rgba(0,229,255,.16);border-radius:8px;color:var(--fg,#b8cfff);font-size:11.5px;cursor:pointer;text-align:left;transition:background .14s,border-color .14s,color .14s,transform .1s;font-family:inherit;width:fit-content;max-width:100%;line-height:1.4;}.suggestion-chip::before{content:"";display:inline-flex;width:0;height:0;border-top:4.5px solid transparent;border-bottom:4.5px solid transparent;border-left:7px solid var(--cyan,#00e5ff);flex-shrink:0;opacity:.55;transition:opacity .14s,transform .14s;}.suggestion-chip:hover{background:rgba(0,229,255,.12);border-color:rgba(0,229,255,.38);color:var(--cyan,#00e5ff);}.suggestion-chip:hover::before{opacity:1;transform:translateX(2px);}.suggestion-chip:active{transform:scale(.97);}.suggestion-chip.sending{opacity:.5;pointer-events:none;}.steps-hdr{display:flex;align-items:center;gap:5px;flex-wrap:nowrap;}.studio-summary-items{transition:all .2s ease;}'
  document.head.appendChild(s)
}

function _processSuggestionChips(bubble: HTMLElement): void {
  if (!bubble) return; const uls = bubble.querySelectorAll('ul'); if (!uls.length) return
  uls.forEach((ul) => {
    if (ul.getAttribute('data-chips-done')) return; const liEls = ul.querySelectorAll('li'); const count = liEls.length
    if (count < 2 || count > 12) return
    const allShort = Array.from(liEls).every((li) => li.textContent!.trim().length <= 100 && li.querySelectorAll('ul,ol,p,pre').length === 0)
    if (!allShort) return
    const wrap = document.createElement('div'); wrap.className = 'suggestion-chips'
    Array.from(liEls).forEach((li) => {
      const text = li.textContent!.trim(); if (!text) return
      const btn = document.createElement('button'); btn.className = 'suggestion-chip'; btn.textContent = text; btn.title = 'Click to ask this'
      btn.onclick = () => { if (S.gen) return; btn.classList.add('sending'); const inp = document.getElementById('inp') as HTMLTextAreaElement | null; if (inp) { inp.value = text; inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 130) + 'px'; inp.focus() }; setTimeout(() => send(), 80) }
      wrap.appendChild(btn)
    })
    if (wrap.children.length >= 2) { ul.parentNode!.insertBefore(wrap, ul.nextSibling); ul.style.display = 'none'; ul.setAttribute('data-chips-done', '1') }
  })
}

// ── RENDER MESSAGES ───────────────────────────────────────────────────────────
function renderMsgs(msgs: ConvMsg[]): void {
  const c = document.getElementById('msgs'); if (!c) return
  const w = document.getElementById('welcome')
  if (!msgs?.length) { if (w) w.style.display = 'flex'; c.querySelectorAll('.msg,.steps-wrap').forEach((el) => el.remove()); return }
  if (w) w.style.display = 'none'; c.querySelectorAll('.msg,.steps-wrap').forEach((el) => el.remove())
  msgs.forEach((m) => appendMsg(m, true)); c.scrollTop = c.scrollHeight
}

function mkAv(role: string): HTMLElement {
  const av = document.createElement('div'); av.className = 'av'
  const setFallback = (container: HTMLElement, letter: string) => { container.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--cyan);background:rgba(0,229,255,.1);border-radius:50%;'; container.textContent = letter || '?' }
  if (role === 'ai') {
    const img = document.createElement('img'); img.src = '/images/nexusai.png'; img.alt = 'N'
    img.onerror = () => { av.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--cyan);background:linear-gradient(135deg,rgba(0,229,255,.2),rgba(136,0,255,.2));border-radius:50%;'; if (img.parentNode === av) av.removeChild(img); av.textContent = 'N' }
    av.appendChild(img)
  } else if (SESSION?.user?.avatar) {
    const img2 = document.createElement('img'); img2.src = SESSION.user.avatar; img2.alt = 'U'
    const fb = (SESSION.user.username || 'U').charAt(0).toUpperCase()
    img2.onerror = () => { if (img2.parentNode === av) av.removeChild(img2); setFallback(av, fb) }; av.appendChild(img2)
  } else { setFallback(av, (SESSION?.user?.username || 'U').charAt(0).toUpperCase()) }
  return av
}

function getLangLabel(lang: string): string {
  const map: Record<string, string> = { lua:'Lua',luau:'Luau',js:'JavaScript',javascript:'JavaScript',ts:'TypeScript',python:'Python',py:'Python',html:'HTML',css:'CSS',json:'JSON',bash:'Bash',sh:'Shell' }
  return map[(lang || '').toLowerCase()] || lang || 'Code'
}
function getFileExt(lang: string): string {
  const map: Record<string, string> = { lua:'lua',luau:'lua',js:'js',ts:'ts',py:'py',python:'py',html:'html',css:'css',json:'json',bash:'sh',sh:'sh' }
  return map[(lang || '').toLowerCase()] || 'txt'
}

function appendMsg(m: ConvMsg, skipScroll?: boolean): void {
  const c = document.getElementById('msgs'); if (!c) return
  const w = document.getElementById('welcome'); if (w) w.style.display = 'none'
  const isUser = m.role === 'user'
  const wrap = document.createElement('div'); wrap.className = 'msg ' + (isUser ? 'user' : 'ai')
  wrap.setAttribute('data-mid', String(c.querySelectorAll('.msg').length)); wrap.appendChild(mkAv(m.role))
  const mbWrap = document.createElement('div'); mbWrap.className = 'mb-wrap'
  const sender = document.createElement('div'); sender.className = 'msg-sender'
  const t2 = new Date(m.time || Date.now())
  sender.innerHTML = `<span>${isUser ? '@' + (SESSION?.user?.username || 'You') : 'NEXUS AI'}</span><span>${t2.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>`
  mbWrap.appendChild(sender)
  const bubble = document.createElement('div'); bubble.className = 'bubble'
  if (m.attachments?.length) {
    const imgRow = document.createElement('div'); imgRow.className = 'msg-imgs'
    m.attachments.forEach((a) => { if (a.type === 'image') { const img = document.createElement('img'); img.className = 'msg-img'; img.src = a.preview || ('data:' + (a.mime || 'image/png') + ';base64,' + a.data); img.alt = a.name || 'img'; img.onclick = () => window.open(img.src, '_blank'); imgRow.appendChild(img) } })
    bubble.appendChild(imgRow)
  }
  let content = String(m.content || '')
  if ((m as ConvMsg & { studioSummary?: string[] }).studioSummary) content = stripAllCode(content)
  const codeRe = /```(\w*)\n?([\s\S]*?)```/g; const codeBlocks: { lang: string; code: string }[] = []
  let processed = content.replace(codeRe, (match, lang, code) => {
    const l = (lang || '').toLowerCase()
    if (l === 'json' || (m as ConvMsg & { studioSummary?: string[] }).studioSummary) return ''
    const i = codeBlocks.length; codeBlocks.push({ lang: lang || '', code: code.trim() }); return '%%CB_' + i + '%%'
  })
  processed.split(/(%%CB_\d+%%)/).forEach((part) => {
    const cm = part.match(/%%CB_(\d+)%%/)
    if (cm) {
      const cb = codeBlocks[parseInt(cm[1])]; if (!cb) return
      const w2 = document.createElement('div'); w2.className = 'code-block-wrap'
      const langBar = document.createElement('div'); langBar.className = 'code-lang-bar'
      const btns = document.createElement('div'); btns.className = 'code-btns'
      btns.innerHTML = `<button class="cbtn" onclick="window.copyCode(this)"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</button><button class="cbtn dl" onclick="window.downloadCode(this,'${cb.lang}')"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</button>`
      langBar.innerHTML = `<span>${esc(getLangLabel(cb.lang))}</span>`; langBar.appendChild(btns); w2.appendChild(langBar)
      const pre = document.createElement('pre'); const codeEl = document.createElement('code'); codeEl.className = cb.lang ? 'language-' + cb.lang : ''; codeEl.textContent = cb.code; pre.appendChild(codeEl); w2.appendChild(pre)
      const hljs = (window as unknown as { hljs?: { highlightElement: (el: HTMLElement) => void } }).hljs
      if (hljs) try { hljs.highlightElement(codeEl) } catch { }
      bubble.appendChild(w2)
    } else if (part.trim()) { const d = document.createElement('div'); d.innerHTML = safeMarked(part); bubble.appendChild(d) }
  })
  const sm = (m as ConvMsg & { studioSummary?: string[] }).studioSummary
  if (sm?.length) {
    const sumDiv = document.createElement('div'); sumDiv.className = 'studio-summary-box'
    const _sumItems = sm; const _sumCollapsed = _sumItems.length > 4
    const _sumId = 'sum_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    const _lblShowAll = 'Show All (' + _sumItems.length + ')'; const _lblShowLess = 'Show Less'
    const renderSumItems = (collapsed: boolean) => (collapsed ? _sumItems.slice(0, 4) : _sumItems).map((it) => `<div class="studio-summary-item"><span class="studio-summary-dot"></span>${esc(it)}</div>`).join('')
    sumDiv.innerHTML = `<div class="studio-summary-title"><svg width="10" height="10" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Built in Studio <span style="color:var(--dim);font-size:9px;">(${_sumItems.length})</span></div><div id="${_sumId}" class="studio-summary-items">${renderSumItems(_sumCollapsed)}</div>` + (_sumItems.length > 4 ? `<button id="btn_${_sumId}" class="sum-toggle-btn" style="margin-top:5px;background:none;border:none;color:var(--cyan);font-size:9.5px;cursor:pointer;padding:2px 0;opacity:.8;">${_sumCollapsed ? _lblShowAll : _lblShowLess}</button>` : '')
    bubble.appendChild(sumDiv)
    if (_sumItems.length > 4) {
      setTimeout(() => {
        const toggleBtn = document.getElementById('btn_' + _sumId), itemsEl = document.getElementById(_sumId)
        if (!toggleBtn || !itemsEl) return; let collapsed = _sumCollapsed
        toggleBtn.addEventListener('click', () => { collapsed = !collapsed; itemsEl.innerHTML = renderSumItems(collapsed); toggleBtn.textContent = collapsed ? _lblShowAll : _lblShowLess })
      }, 0)
    }
  }
  mbWrap.appendChild(bubble); if (!isUser) _processSuggestionChips(bubble)
  if (!isUser) {
    const acts = document.createElement('div'); acts.className = 'msg-acts'
    acts.innerHTML = `<button class="mab" onclick="window.copyMsgText(this)"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button><button class="mab" onclick="window.retryMsg(this)"><svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg></button><button class="mab ${(m as ConvMsg & { _liked?: boolean })._liked ? 'liked' : ''}" onclick="window.likeMsg(this,true)"><svg viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg></button><button class="mab ${(m as ConvMsg & { _disliked?: boolean })._disliked ? 'disliked' : ''}" onclick="window.likeMsg(this,false)"><svg viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg></button><button class="mab" onclick="window.openShareModal()"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>`
    mbWrap.appendChild(acts)
  }
  wrap.appendChild(mbWrap); c.appendChild(wrap); if (!skipScroll) c.scrollTop = c.scrollHeight
}

// ── CODE PREVIEW ──────────────────────────────────────────────────────────────
function openCodePreview(stepId: number): void {
  const meta = _stepMeta.get(stepId); if (!meta?.code) return
  const title = document.getElementById('codePreviewTitle'), path = document.getElementById('codePreviewPath'), codeEl = document.getElementById('codePreviewCode')
  if (title) title.textContent = (meta.type || 'Script') + ': ' + meta.name
  if (path) path.textContent = meta.parent + '/' + meta.name
  if (codeEl) { codeEl.textContent = meta.code; const hljs = (window as unknown as { hljs?: { highlightElement: (el: HTMLElement) => void } }).hljs; if (hljs) try { hljs.highlightElement(codeEl as HTMLElement) } catch { } }
  document.getElementById('codePreviewModal')?.classList.add('show')
}
function copyPreviewCode(): void { const codeEl = document.getElementById('codePreviewCode'); if (codeEl) navigator.clipboard.writeText(codeEl.textContent || '').then(() => toast(UI.copiedToast)) }
function copyCode(btn: HTMLElement): void { const pre = btn.closest('.code-block-wrap')?.querySelector('pre code'); if (pre) navigator.clipboard.writeText(pre.textContent || '').then(() => toast(UI.copiedToast)) }
function downloadCode(btn: HTMLElement, lang: string): void { const pre = btn.closest('.code-block-wrap')?.querySelector('pre code'); if (!pre) return; const a = document.createElement('a'); a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(pre.textContent || ''); a.download = 'nexus_code.' + getFileExt(lang); a.click() }
function copyMsgText(btn: HTMLElement): void { const b = btn.closest('.mb-wrap')?.querySelector('.bubble'); if (b) navigator.clipboard.writeText((b as HTMLElement).innerText || b.textContent || '').then(() => toast(UI.copiedToast)) }

// ── THINKING STEPS ────────────────────────────────────────────────────────────
function createStepsCard(): void {
  removeStepsCard(); const c = document.getElementById('msgs'); if (!c) return
  const w = document.getElementById('welcome'); if (w) w.style.display = 'none'
  const wrap = document.createElement('div'); wrap.className = 'steps-wrap'; wrap.id = 'stepsWrap'; wrap.appendChild(mkAv('ai'))
  const mbW = document.createElement('div'); mbW.className = 'mb-wrap'
  const sender = document.createElement('div'); sender.className = 'msg-sender'
  sender.innerHTML = `<span>NEXUS AI</span><span>${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>`
  mbW.appendChild(sender)
  const box = document.createElement('div'); box.className = 'steps-box'
  const hdr = document.createElement('div'); hdr.className = 'steps-hdr'; hdr.id = 'stepsHdr'
  const spinner = document.createElement('div'); spinner.className = 'steps-hdr-spinner'; spinner.id = 'stepsSpinner'
  const hdrTxt = document.createElement('span'); hdrTxt.className = 'steps-hdr-txt'; hdrTxt.id = 'stepsTxt'; hdrTxt.textContent = UI.workingOn
  const hdrCount = document.createElement('span'); hdrCount.className = 'steps-hdr-count'; hdrCount.id = 'stepsCount'; hdrCount.textContent = '(0/0)'
  const hdrToggle = document.createElement('button'); hdrToggle.id = 'stepsToggle'
  hdrToggle.style.cssText = 'margin-left:auto;background:none;border:none;color:var(--cyan);font-size:9px;cursor:pointer;padding:2px 6px;opacity:.75;white-space:nowrap;flex-shrink:0;'
  hdrToggle.textContent = 'Show Less'; let _stepsExpanded = true
  hdrToggle.onclick = () => { _stepsExpanded = !_stepsExpanded; const sl = document.getElementById('stepsList'); if (sl) sl.style.display = _stepsExpanded ? '' : 'none'; hdrToggle.textContent = _stepsExpanded ? 'Show Less' : 'Show All' }
  hdr.appendChild(spinner); hdr.appendChild(hdrTxt); hdr.appendChild(hdrCount); hdr.appendChild(hdrToggle); box.appendChild(hdr)
  const list = document.createElement('div'); list.className = 'steps-list'; list.id = 'stepsList'; box.appendChild(list)
  const cancelDiv = document.createElement('div'); cancelDiv.className = 'steps-cancel'; cancelDiv.id = 'stepsCancel'
  const cb = document.createElement('button'); cb.className = 'steps-cancel-btn'; cb.textContent = UI.cancel; cb.onclick = cancelGen
  cancelDiv.appendChild(cb); box.appendChild(cancelDiv); mbW.appendChild(box); wrap.appendChild(mbW); c.appendChild(wrap)
  _stepsEl = wrap; _stepsList = list; _stepsMap.clear(); _stepsId = 0; c.scrollTop = c.scrollHeight
}

function removeStepsCard(): void { document.getElementById('stepsWrap')?.remove(); _stepsEl = null; _stepsList = null; _stepsMap.clear(); _stepMeta.clear() }
function clearSteps(): void { if (!_stepsList) return; _stepsList.innerHTML = ''; _stepsMap.clear(); _stepsId = 0; const cnt = document.getElementById('stepsCount'); if (cnt) cnt.textContent = '' }

function addStep(text: string, state: string, sub?: string, meta?: StepMeta): number | null {
  if (!_stepsList) return null; const id = ++_stepsId
  const row = document.createElement('div'); row.className = 'step-row'; row.setAttribute('data-st', state || 'running')
  const ic = document.createElement('div'); ic.className = 'step-ic'
  if (state === 'running') { const sp = document.createElement('div'); sp.className = 'step-spin'; ic.appendChild(sp) }
  else if (state === 'done') ic.innerHTML = '<svg class="step-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'
  else if (state === 'error') ic.innerHTML = '<svg class="step-err" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  else if (state === 'info') ic.innerHTML = '<svg class="step-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  else ic.innerHTML = '<div class="step-pend"></div>'
  row.appendChild(ic)
  const cont = document.createElement('div'); cont.className = 'step-content'
  const txtEl = document.createElement('div'); txtEl.className = 'step-txt'
  if (meta?.code) {
    _stepMeta.set(id, meta); txtEl.style.cssText = 'cursor:pointer;display:flex;align-items:center;gap:4px;'
    txtEl.innerHTML = text.replace(/</g, '&lt;') + '<svg width="10" height="10" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" style="flex-shrink:0;color:var(--cyan);"><polyline points="9 18 15 12 9 6"/></svg>'
    txtEl.onclick = () => openCodePreview(id); txtEl.title = 'Click to preview code'
  } else { txtEl.textContent = text }
  cont.appendChild(txtEl)
  if (sub) { const sv = document.createElement('div'); sv.className = 'step-sub'; sv.textContent = sub; cont.appendChild(sv) }
  row.appendChild(cont); _stepsList.appendChild(row); _stepsMap.set(id, row)
  document.getElementById('msgs')?.scrollTo(0, 99999)
  const cnt = document.getElementById('stepsCount'); if (cnt) { const done = _stepsList.querySelectorAll('[data-st="done"]').length; cnt.textContent = '(' + done + '/' + _stepsId + ')' }
  return id
}

function updateStep(id: number, state: string, text?: string, sub?: string): void {
  const row = _stepsMap.get(id); if (!row) return; row.setAttribute('data-st', state)
  const ic = row.querySelector('.step-ic')
  if (ic) {
    if (state === 'running') ic.innerHTML = '<div class="step-spin"></div>'
    else if (state === 'done') ic.innerHTML = '<svg class="step-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'
    else if (state === 'error') ic.innerHTML = '<svg class="step-err" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    else if (state === 'info') ic.innerHTML = '<svg class="step-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  }
  if (text) { const t = row.querySelector('.step-txt'); if (t) t.textContent = text }
  if (sub !== undefined) { let sv = row.querySelector('.step-sub') as HTMLElement | null; if (!sv && sub) { sv = document.createElement('div'); sv.className = 'step-sub'; row.querySelector('.step-content')!.appendChild(sv) }; if (sv) sv.textContent = sub || '' }
  if (_stepsList) { const cnt = document.getElementById('stepsCount'); if (cnt) { const done = _stepsList.querySelectorAll('[data-st="done"]').length; cnt.textContent = '(' + done + '/' + _stepsId + ')' } }
}

function finalizeSteps(): void {
  const spinner = document.getElementById('stepsSpinner'); if (spinner) spinner.style.display = 'none'
  const hdrTxt = document.getElementById('stepsTxt'); if (hdrTxt) hdrTxt.style.color = 'var(--green)'
  document.getElementById('stepsCancel')?.remove()
  _stepsMap.forEach((row) => { if (row.getAttribute('data-st') === 'running') { const ic = row.querySelector('.step-ic'); if (ic) ic.innerHTML = '<svg class="step-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'; row.setAttribute('data-st', 'done') } })
}

function setStepTitle(txt: string): void { const el = document.getElementById('stepsTxt'); if (el) el.textContent = txt }

// ── MENTION ───────────────────────────────────────────────────────────────────
async function fetchWsCache(): Promise<void> {
  if (_wsCache || _wsLoading || !SESSION || !studioConnected) return; _wsLoading = true
  try {
    const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(`${API_URL}/?get_workspace=1&user=${encodeURIComponent((SESSION.user.username || '').toLowerCase())}`, { signal: ctrl.signal })
    if (r.ok) { const d = await r.json() as { data?: unknown }; _wsCache = d?.data ?? d }
  } catch { }; _wsLoading = false
}

function extractMentionItems(scan: unknown, query: string): { name: string; cls: string; svc: string }[] {
  if (!scan) return []
  const items: { name: string; cls: string; svc: string }[] = [], q = (query || '').toLowerCase()
  interface ScanNode { name?: string; class?: string; children?: ScanNode[] }
  const traverse = (node: ScanNode, svc: string) => {
    if (!node?.name || items.length >= 25) return
    if (!q || node.name.toLowerCase().includes(q)) items.push({ name: node.name, cls: node.class || '', svc })
    if (node.children) node.children.forEach((c) => traverse(c, svc))
  }
  const scanObj = scan as Record<string, ScanNode>
  ;['ServerScriptService','ReplicatedStorage','StarterGui','StarterPlayer','StarterPack','ReplicatedFirst','Workspace'].forEach((sn) => {
    if (scanObj[sn]?.children) scanObj[sn].children!.forEach((c) => traverse(c, sn)); else if (scanObj[sn]) traverse(scanObj[sn], sn)
  })
  items.sort((a, b) => (a.cls.includes('Script') ? 0 : 1) - (b.cls.includes('Script') ? 0 : 1) || a.name.localeCompare(b.name))
  return items.slice(0, 20)
}

function getMentionIcon(cls: string): { css: string; lbl: string } {
  if (cls === 'LocalScript') return { css: 'local', lbl: 'LS' }
  if (cls === 'ModuleScript') return { css: 'module', lbl: 'M' }
  if (cls === 'Script') return { css: 'script', lbl: 'S' }
  return { css: 'obj', lbl: 'O' }
}

function showMentionDD(query: string): void {
  const dd = document.getElementById('mentionDD'), inp = document.getElementById('inp') as HTMLInputElement | null
  if (!dd || !inp) return; const items = extractMentionItems(_wsCache, query)
  const list = document.getElementById('mentionList'); if (!list) return; _mentionSelIdx = 0
  if (!studioConnected) { list.innerHTML = `<div class="mention-empty">Studio not connected</div>` }
  else if (!_wsCache) { list.innerHTML = `<div class="mention-empty">Loading...</div>`; fetchWsCache() }
  else if (!items.length) { list.innerHTML = `<div class="mention-empty">No results</div>` }
  else { list.innerHTML = items.map((item, idx) => { const ic = getMentionIcon(item.cls); return `<div class="mention-item${idx === 0 ? ' sel' : ''}" onclick="window.insertMention('${esc(item.name)}')"><div class="mention-ic ${ic.css}">${ic.lbl}</div><div style="flex:1;min-width:0;"><div class="mention-name">${esc(item.name)}</div><div class="mention-path">${esc(item.cls || 'Instance')} — ${esc(item.svc)}</div></div></div>` }).join('') }
  const r2 = inp.getBoundingClientRect(); dd.style.bottom = (window.innerHeight - r2.top + 4) + 'px'; dd.style.left = r2.left + 'px'; dd.style.width = Math.max(290, r2.width) + 'px'; dd.classList.add('open')
}

function hideMentionDD(): void { document.getElementById('mentionDD')?.classList.remove('open'); _mentionActive = false; _mentionAtPos = -1; _mentionSelIdx = 0 }

function insertMention(name: string): void {
  const inp = document.getElementById('inp') as HTMLTextAreaElement | null; if (!inp) return
  const val = inp.value, pos = inp.selectionStart || 0
  const atPos = _mentionAtPos >= 0 ? _mentionAtPos : val.lastIndexOf('@', pos - 1)
  if (atPos >= 0) { inp.value = val.slice(0, atPos) + '@' + name + ' ' + val.slice(pos); inp.selectionStart = inp.selectionEnd = atPos + name.length + 2 }
  hideMentionDD(); inp.focus(); inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 130) + 'px'
}

function moveMentionSel(dir: number): void {
  const list = document.getElementById('mentionList'); if (!list) return
  const items = list.querySelectorAll('.mention-item'); if (!items.length) return
  _mentionSelIdx = Math.max(0, Math.min(items.length - 1, _mentionSelIdx + dir))
  items.forEach((el, i) => el.classList.toggle('sel', i === _mentionSelIdx))
  if (items[_mentionSelIdx]) (items[_mentionSelIdx] as HTMLElement).scrollIntoView({ block: 'nearest' })
}

function selectCurrentMention(): boolean {
  const list = document.getElementById('mentionList'); if (!list) return false
  const sel = list.querySelectorAll('.mention-item')[_mentionSelIdx] as HTMLElement | undefined
  if (!sel) return false; sel.click(); return true
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 8 — FILE HANDLING, UI ACTIONS, INIT, EVENTS
// ══════════════════════════════════════════════════════════════════════════════

function handleFile(e: Event): void {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  const imageFiles = files.filter((f) => f.type.startsWith('image/'))
  const otherFiles = files.filter((f) => !f.type.startsWith('image/'))

  if (imageFiles.length && !modelSupportsImages(S.model)) {
    toast(`${S.model.label || S.model.id} doesn't support image input. Switch model to attach images.`, 'var(--pink)', 3600)
  } else if (imageFiles.length) {
    const currentImageCount = S.attachments.filter((a) => a.type === 'image').length
    const room = Math.max(0, MAX_IMAGE_ATTACHMENTS - currentImageCount)
    if (room <= 0) {
      toast(`Maximum ${MAX_IMAGE_ATTACHMENTS} images per message.`, 'var(--yellow)', 3200)
    } else {
      const toAdd = imageFiles.slice(0, room)
      if (imageFiles.length > room) toast(`Only ${room} more image(s) added — ${MAX_IMAGE_ATTACHMENTS} max per message.`, 'var(--yellow)', 3600)
      toAdd.forEach((file) => {
        const reader = new FileReader(); reader.onload = (ev) => { const d = (ev.target!.result as string); S.attachments.push({ type: 'image', name: file.name, mime: file.type, data: d.split(',')[1], preview: d }); renderAttachRow() }; reader.readAsDataURL(file)
      })
    }
  }

  otherFiles.forEach((file) => { const reader = new FileReader(); reader.onload = (ev) => { S.attachments.push({ type: 'file', name: file.name, text: ev.target!.result as string }); renderAttachRow() }; reader.readAsText(file) })
  ;(e.target as HTMLInputElement).value = ''
}

function renderAttachRow(): void {
  const row = document.getElementById('attachRow'); if (!row) return
  row.innerHTML = S.attachments.map((a, i) => {
    if (a.type === 'image') { const src = a.preview || ('data:' + (a.mime || 'image/png') + ';base64,' + a.data); return `<div class="attach-item"><img src="${src}" alt=""><button class="attach-rm" onclick="window.removeAttach(${i})">x</button></div>` }
    return `<div class="attach-item"><div class="attach-file"><svg width="11" height="11" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>${esc(a.name)}</div><button class="attach-rm" onclick="window.removeAttach(${i})">x</button></div>`
  }).join('')
}

function removeAttach(i: number): void { S.attachments.splice(i, 1); renderAttachRow() }

function clearChat(): void {
  if (!S.curConv) return; if (!confirm(UI.clearConfirm)) return
  const cv = S.convs.find((x) => x.id === S.curConv); if (cv) cv.msgs = []
  renderMsgs([]); saveS()
}

function openSettings(): void {
  updateCreds(); checkDailyCredits(); updateRoleDisplay(); updatePlayTestUI()
  document.getElementById('settingsModal')?.classList.add('show')
}

function openAvatarModal(): void {
  if (!SESSION) return; const u = SESSION.user
  const nameEl = document.getElementById('avatarModalName'); if (nameEl) nameEl.textContent = '@' + (u.username || '-')
  const imgEl = document.getElementById('avatarModalImg') as HTMLImageElement | null
  if (imgEl) { imgEl.src = u.avatar || '/images/nexusai.png'; imgEl.onerror = () => { imgEl.src = '/images/nexusai.png' } }
  const roleEl = document.getElementById('avatarModalRole'); if (roleEl) roleEl.textContent = isOwner() ? 'Owner' : isAdmin() ? 'Admin' : 'Roblox Developer'
  const idEl = document.getElementById('avatarModalId'); if (idEl) idEl.textContent = 'Roblox ID: ' + (u.robloxId || '-')
  document.getElementById('avatarModal')?.classList.add('show')
}

function closeModal(id: string): void { document.getElementById(id)?.classList.remove('show') }
function logout(): void { localStorage.removeItem('nexus_session'); location.replace('/') }

function useSugg(q: string): void {
  const inp = document.getElementById('inp') as HTMLTextAreaElement | null
  if (inp) { inp.value = q; inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 130) + 'px'; inp.focus() }
  send()
}

function showInstall(): void { document.getElementById('installModal')?.classList.add('show') }

function toggleSidebar(): void {
  const app = document.getElementById('app'), icon = document.getElementById('collapseSbIcon'); if (!app) return
  app.classList.toggle('sb-hidden')
  if (icon) icon.innerHTML = app.classList.contains('sb-hidden') ? '<polyline points="9 18 15 12 9 6"/>' : '<polyline points="15 18 9 12 15 6"/>'
}

function likeMsg(btn: HTMLElement, isLike: boolean): void {
  const msgEl = btn.closest('.msg.ai'); if (!msgEl) return
  const lb = msgEl.querySelector('.mab[onclick*="true"]'), db = msgEl.querySelector('.mab[onclick*="false"]')
  if (isLike) { lb?.classList.toggle('liked'); db?.classList.remove('disliked') }
  else { db?.classList.toggle('disliked'); lb?.classList.remove('liked') }
}

function retryMsg(btn: HTMLElement): void {
  const msgEl = btn.closest('.msg.ai'); if (!msgEl) return
  const idx = parseInt(msgEl.getAttribute('data-mid') || '0')
  const cv = S.convs.find((x) => x.id === S.curConv); if (!cv) return
  if (idx > 0 && cv.msgs[idx - 1]?.role === 'user') {
    const inp = document.getElementById('inp') as HTMLTextAreaElement | null
    if (inp) { inp.value = String(cv.msgs[idx - 1].content || ''); inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 130) + 'px'; send() }
  }
}

function openShareModal(): void {
  const cv = S.convs.find((x) => x.id === S.curConv); if (!cv) return
  let text = ''
  ;(cv.msgs || []).forEach((m) => {
    const name = m.role === 'user' ? ('@' + (SESSION?.user?.username || 'You')) : 'NEXUS AI'
    const time = m.time ? new Date(m.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''
    text += '[' + time + '] ' + name + ':\n' + (m.content || '') + '\n\n'
  })
  const ta = document.getElementById('shareModalTa') as HTMLTextAreaElement | null; if (ta) ta.value = text
  document.getElementById('shareModal')?.classList.add('show')
}

function copyShareText(): void { const ta = document.getElementById('shareModalTa') as HTMLTextAreaElement | null; if (ta) navigator.clipboard.writeText(ta.value).then(() => toast(UI.copiedToast)) }

async function sendReport(): Promise<void> {
  const ta = document.getElementById('reportTa') as HTMLTextAreaElement | null
  const btn = document.getElementById('reportBtn') as HTMLButtonElement | null
  const st = document.getElementById('reportStatus')
  if (!ta?.value.trim()) return
  let cfToken = ''
  if (K.turnstile) {
    const tw = window as unknown as { turnstile?: { getResponse: (w: unknown) => string; reset: (w: unknown) => void } }
    if (tw.turnstile) {
      try { cfToken = tw.turnstile.getResponse(_turnstileWidget) || ''; if (!cfToken) await new Promise<void>((resolve) => setTimeout(resolve, 12000)); cfToken = tw.turnstile.getResponse(_turnstileWidget) || '' } catch { cfToken = '' }
    }
    if (!cfToken) { if (st) st.textContent = 'Complete CAPTCHA first'; return }
  }
  if (btn) btn.disabled = true
  try {
    await fetch(REPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: SESSION?.user?.username || '?', userId: SESSION?.user?.robloxId || '?', message: ta.value, type: 'report', 'cf-turnstile-response': cfToken, time: new Date().toISOString() }) })
    if (st) st.textContent = 'Sent!'; if (ta) ta.value = ''
    const tw = window as unknown as { turnstile?: { reset: (w: unknown) => void } }
    if (K.turnstile && tw.turnstile && _turnstileWidget !== null) tw.turnstile.reset(_turnstileWidget)
  } catch { if (st) st.textContent = 'Error' }
  if (btn) setTimeout(() => { btn.disabled = false }, 3000)
}

async function redeemCode(): Promise<void> {
  const inp = document.getElementById('redeemInput') as HTMLInputElement | null
  const btn = document.getElementById('redeemBtn') as HTMLButtonElement | null
  const st = document.getElementById('redeemStatus')
  if (!inp?.value.trim()) return; if (!checkClientRateLimit('redeem', 3)) return
  const code = inp.value.trim().toUpperCase().replace(/[^A-Z0-9\-_]/g, '')
  if (btn) btn.disabled = true
  try {
    const r = await fetch('/api/redeem', { method: 'POST', headers: getAdminHeaders(), body: JSON.stringify({ code, user: (SESSION?.user?.username || '').toLowerCase(), userId: SESSION?.user?.robloxId || '' }) })
    const d = await r.json() as { success?: boolean; credits?: number; error?: string }
    if (d.success) { S.credits += parseFloat(String(d.credits || 0)); updateCreds(); saveS(); if (st) st.textContent = '+' + d.credits + ' CR'; if (inp) inp.value = '' }
    else if (st) st.textContent = 'Error: ' + (d.error || 'Invalid')
  } catch { if (st) st.textContent = 'Error' }
  if (btn) setTimeout(() => { btn.disabled = false }, 3000)
}

// ══════════════════════════════════════════════════════════════════════════════
// INIT APP
// ══════════════════════════════════════════════════════════════════════════════
async function initApp(): Promise<void> {
  if (!SESSION) return
  _injectUiFixStyles(); _injectSuggChipStyles(); updateLoader(8, UI.loaderInit)
  S.currentProjectId = getProjectIdFromUrl(); updateLoader(22, UI.loaderLoadData)
  await loadS(); updateLoader(42, UI.loaderLoadData)
  if (S.currentProjectId) {
    S.currentProjectName = getProjectName(S.currentProjectId) || null
    if (!S.currentProjectName && SESSION.data?.projects) {
      const proj = (SESSION.data.projects as AppState['projects']).find((x) => x.id === S.currentProjectId!)
      if (proj) S.currentProjectName = proj.name
    }
  }
  updateProjectUI()
  const u = SESSION.user
  const av = document.getElementById('sbAv') as HTMLImageElement | null
  if (av) { av.src = u.avatar || '/images/nexusai.png'; av.onerror = () => { try { av.src = '/images/nexusai.png' } catch { } } }
  const unEl = document.getElementById('sbUn'); if (unEl) unEl.textContent = '@' + (u.username || '-')
  const suEl = document.getElementById('settingsUsername'); if (suEl) suEl.textContent = '@' + (u.username || '-')
  updateRoleDisplay(); updateCreds(); updatePlayTestUI(); updateLoader(58, UI.loaderLoadData)
  await loadKeys(); await loadAdminIds(); await loadInboxCount()
  updateLoader(72, UI.loaderConnecting); applyLang(); updateModelUI()
  updateLoader(84, UI.loaderConnecting); startStudioPoll(); startAutoSync()
  updateLoader(93, UI.loaderConnecting); renderConvs()
  if (S.curConv && S.convs.some((x) => x.id === S.curConv)) { loadConv(S.curConv) }
  else if (S.convs.length > 0) { const latest = S.convs.reduce((a, b) => (b.time || 0) > (a.time || 0) ? b : a); S.curConv = latest.id; loadConv(S.curConv) }
  else { newChat() }
  checkDailyCredits(); checkDailyOnLoad(); updateLoader(100, UI.loaderReady); setTimeout(hideLoader, 500)
  const urlp = new URLSearchParams(window.location.search)
  if (urlp.get('settings') === 'true') setTimeout(() => openSettings(), 800)
  setTimeout(() => { if (!_syncInProgress) syncToServer() }, 2000)
}

// ══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════════════════════════════
document.querySelectorAll('.ov').forEach((ov) => { ov.addEventListener('click', (e) => { if (e.target === ov) (ov as HTMLElement).classList.remove('show') }) })

const _inpEl = document.getElementById('inp') as HTMLTextAreaElement | null
if (_inpEl) {
  _inpEl.addEventListener('input', function () {
    if (this.value?.includes('\x00')) this.value = this.value.replace(/\x00/g, '')
    this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 130) + 'px'; saveDraft()
    const val = this.value, pos = this.selectionStart || 0, atIdx = val.lastIndexOf('@', pos - 1)
    if (atIdx >= 0 && (atIdx === 0 || /\s/.test(val[atIdx - 1]))) {
      const afterAt = val.slice(atIdx + 1, pos)
      if (!afterAt.includes(' ')) { _mentionActive = true; _mentionAtPos = atIdx; showMentionDD(afterAt); return }
    }
    hideMentionDD()
  })
  _inpEl.addEventListener('keydown', function (e) {
    if (_mentionActive) {
      if (e.key === 'ArrowUp') { e.preventDefault(); moveMentionSel(-1); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); moveMentionSel(1); return }
      if (e.key === 'Enter' || e.key === 'Tab') { if (selectCurrentMention()) { e.preventDefault(); return } }
      if (e.key === 'Escape') { hideMentionDD(); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  })
}

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  const mDD = document.getElementById('mDD')
  if (mDD?.classList.contains('open') && !mDD.contains(target)) { const btn = document.getElementById('inpModelBtn'); if (!btn?.contains(target)) mDD.classList.remove('open') }
  const mentionDD = document.getElementById('mentionDD')
  if (mentionDD?.classList.contains('open') && !mentionDD.contains(target)) { const inp = document.getElementById('inp'); if (!inp?.contains(target)) hideMentionDD() }
})

const _inpPasteEl = document.getElementById('inp') as HTMLTextAreaElement | null
if (_inpPasteEl) {
  _inpPasteEl.addEventListener('paste', (e: ClipboardEvent) => {
    const items = e.clipboardData?.items; if (!items) return
    const imageItems: DataTransferItem[] = []
    for (let i = 0; i < items.length; i++) { if (items[i].type.startsWith('image/')) imageItems.push(items[i]) }
    if (!imageItems.length) return
    if (!modelSupportsImages(S.model)) {
      toast(`${S.model.label || S.model.id} doesn't support image input. Switch model to paste images.`, 'var(--pink)', 3600)
      e.preventDefault(); return
    }
    const currentImageCount = S.attachments.filter((a) => a.type === 'image').length
    const room = Math.max(0, MAX_IMAGE_ATTACHMENTS - currentImageCount)
    if (room <= 0) { toast(`Maximum ${MAX_IMAGE_ATTACHMENTS} images per message.`, 'var(--yellow)', 3200); e.preventDefault(); return }
    if (imageItems.length > room) toast(`Only ${room} more image(s) added — ${MAX_IMAGE_ATTACHMENTS} max per message.`, 'var(--yellow)', 3600)
    imageItems.slice(0, room).forEach((item) => {
      const file = item.getAsFile(); if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => { const d = (ev.target!.result as string); S.attachments.push({ type: 'image', name: 'pasted_image.png', mime: file.type, data: d.split(',')[1], preview: d }); renderAttachRow() }
      reader.readAsDataURL(file)
    })
    e.preventDefault()
  })
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && SESSION) {
    if (!_syncInProgress && !_syncDebounceTimer) syncToServer()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// WINDOW ASSIGNMENTS
// ══════════════════════════════════════════════════════════════════════════════
;(function assignWindowFns() {
  if (typeof window === 'undefined') return
  const w = window as unknown as Record<string, unknown>
  w.send             = send
  w.cancelGen        = cancelGen
  w.newChat          = newChat
  w.loadConv         = loadConv
  w.delConv          = delConv
  w.clearChat        = clearChat
  w.useSugg          = useSugg
  w.retryMsg         = retryMsg
  w.likeMsg          = likeMsg
  w.copyMsgText      = copyMsgText
  w.openShareModal   = openShareModal
  w.copyShareText    = copyShareText
  w.copyCode         = copyCode
  w.downloadCode     = downloadCode
  w.copyPreviewCode  = copyPreviewCode
  w.insertMention    = insertMention
  w.toggleMDD        = toggleMDD
  w.selModel         = selModel
  w.openSettings     = openSettings
  w.openAvatarModal  = openAvatarModal
  w.closeModal       = closeModal
  w.logout           = logout
  w.showInstall      = showInstall
  w.claimDaily       = claimDaily
  w.togglePlayTest   = togglePlayTest
  w.setPlayTestDur   = setPlayTestDur
  w.retryStudio      = retryStudio
  w.toggleSidebar    = toggleSidebar
  w.handleFile       = handleFile
  w.removeAttach     = removeAttach
  w.sendReport       = sendReport
  w.redeemCode       = redeemCode
  if (!w.buildSysPrompt) w.buildSysPrompt = _fallbackBuildSysPrompt
})()

// ══════════════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp)
  else initApp()
}