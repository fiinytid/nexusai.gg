'use client'
import { buildSysPrompt } from './system_prompt'

// ── TYPE DECLARATIONS ─────────────────────────────────────────────────────────
interface NexusUser {
  username: string
  robloxId: string
  avatar?: string
}
interface NexusSession {
  user: NexusUser
  data: Record<string, unknown>
  loginTime: number
}
interface ModelEntry {
  grp?: string
  id?: string
  prov?: string
  cost?: number
  label?: string
  icon?: string
  badge?: string
}
interface ConvMsg {
  role: string
  content: string | unknown[]
  time?: number
  attachments?: AttachItem[]
  studioSummary?: string[]
  _rawContent?: string
  _liked?: boolean
  _disliked?: boolean
}
interface Conv {
  id: string
  title?: string
  time?: number
  msgs: ConvMsg[]
  projectId?: string | null
}
interface AttachItem {
  type: string
  name: string
  mime?: string
  data?: string
  preview?: string
  text?: string
}
interface Cmd {
  action: string
  [key: string]: unknown
}
interface StepMeta {
  code: string
  name: string
  parent: string
  type: string
}
interface AppState {
  credits: number
  allConvs: Conv[]
  convs: Conv[]
  curConv: string | null
  gen: boolean
  cancelCtrl: AbortController | null
  model: ModelEntry
  guiModel: ModelEntry
  plan: string
  draftText: Record<string, string>
  attachments: AttachItem[]
  lastClaim: string | null
  unreadInbox: number
  currentProjectId: string | null
  currentProjectName: string | null
  projects: { id: string; name: string }[]
  playTestEnabled: boolean
  playTestDuration: number
}
interface SuggItem {
  title: string
  body: string
  q: string
  icon: string
}
interface LangStrings {
  placeholder: string
  noConv: string
  newchat: string
  recent: string
  dash: string
  son: string
  soff: string
  cancel: string
  connected: string
  disconnected: string
  creditsLabel: string
  credHint: string
  helpBtn: string
  inboxBtn: string
  welcomeText: string
  chatTitle: string
  installLink: string
  reconnectLink: string
  installTitle: string
  installSteps: string[]
  installClose: string
  settingsTitle: string
  accountTitle: string
  planLabel: string
  robloxIdLabel: string
  dailyTitle: string
  freePlan: string
  proPlan: string
  playTestTitle: string
  playTestLabel: string
  playTestHint: string
  playTestDurLabel: string
  langTitle: string
  langLabel: string
  reportTitle: string
  reportBtn: string
  redeemTitle: string
  redeemHint: string
  downloadTitle: string
  downloadHint: string
  downloadPluginBtn: string
  logoutLabel: string
  close: string
  guiAddLabel: string
  guiEmptyText: string
  guiLoadingText: string
  guiToPlaceText: string
  guiAiBuild: string
  guiClear: string
  guiExport: string
  guiCodeTitle: string
  copy: string
  download: string
  guiAiTitle: string
  guiAiDesc: string
  guiAiBuildBtn: string
  guiAiCancel: string
  guiPropsEmpty: string
  guiLayerTitle: string
  avatarClose: string
  copiedToast: string
  reconnectToast: string
  creditsExhausted: string
  creditsLow: string
  cancelToast: string
  modelBusyToast: string
  guiSentToast: string
  guiNotConnectedToast: string
  addElementFirst: string
  aiResponseInvalid: string
  errorPrefix: string
  clearConfirm: string
  shareModalTitle: string
  shareModalDesc: string
  shareModalCopy: string
  shareClose: string
  workingOn: string
  buildingInStudio: string
  analyzingReq: string
  designingSolution: string
  readingScript: string
  analyzingError: string
  designingFix: string
  designingUI: string
  buildingComponents: string
  preparingEdit: string
  preparingTest: string
  projectLabel: string
  testRunning: string
  testDone: string
  testError: string
  loaderInit: string
  loaderLoadData: string
  loaderConnecting: string
  loaderReady: string
  dailyReady: string
  dailyAlready: string
  dailyNext: string
  injFail: string
  tabChat: string
  tabGui: string
  retrying: string
  noScriptWarning: string
  injecting: string
  injectDone: string
  suggs: SuggItem[]
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 1 — SECURITY, CSRF, RATE LIMIT, CORE UTILITIES
// ══════════════════════════════════════════════════════════════════════════════

const _csrfNonce: string = (function () {
  try {
    return Array.from(crypto.getRandomValues(new Uint8Array(20)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
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
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:[^,]*base64/gi, '')
    .replace(/on\w{2,}\s*=/gi, '')
    .replace(/<iframe[\s\S]*?>/gi, '')
    .replace(/<object[\s\S]*?>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
}

const LUA_DANGEROUS_PATTERNS = [
  /require\s*\(\s*['"](http|ftp)/i,
  /loadstring\s*\(/i,
  /dofile\s*\(/i,
  /os\.execute\s*\(/i,
  /io\.(open|read|write)\s*\(/i,
  /debug\.getinfo\s*\(/i,
]
function sanitizeLuaCode(code: string): { ok: boolean; code: string; reason?: string } {
  if (!code || typeof code !== 'string') return { ok: false, code: '', reason: 'Empty code' }
  if (code.length > 150000) return { ok: false, code: '', reason: 'Code too large (max 150KB)' }
  for (let i = 0; i < LUA_DANGEROUS_PATTERNS.length; i++) {
    if (LUA_DANGEROUS_PATTERNS[i].test(code)) {
      console.warn('[NEXUS SECURITY] Suspicious Lua pattern detected, blocked.')
      return { ok: false, code: '', reason: 'Suspicious code pattern blocked for security' }
    }
  }
  const clean = code.replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  return { ok: true, code: clean }
}

function sanitizeApiStr(s: unknown, max = 500): string {
  if (typeof s !== 'string') return ''
  return s.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').slice(0, max)
}

function validateApiResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  if (!('content' in (data as Record<string, unknown>))) return false
  if (typeof (data as Record<string, unknown>).content !== 'string') return false
  return true
}

const _apiCallLog: Record<string, number[]> = {}
function checkClientRateLimit(key: string, maxPerMin = 30): boolean {
  const now = Date.now()
  if (!_apiCallLog[key]) _apiCallLog[key] = []
  _apiCallLog[key] = _apiCallLog[key].filter((t) => now - t < 60000)
  if (_apiCallLog[key].length >= maxPerMin) {
    toast(
      curLang === 'id' ? 'Terlalu banyak permintaan, tunggu sebentar' : 'Too many requests, please wait',
      'var(--yellow)', 3000
    )
    return false
  }
  _apiCallLog[key].push(now)
  return true
}

// ── GLOBAL STATE ──────────────────────────────────────────────────────────────
let curLang: string = typeof window !== 'undefined' ? (localStorage.getItem('nexus_lang') || 'id') : 'id'
let SESSION: NexusSession | null = null
let studioConnected = false
let studioPollTimer: ReturnType<typeof setInterval> | null = null
const API_URL = '/api/control'

function esc(s: unknown): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function toast(msg: string, col?: string, dur?: number): void {
  document.querySelectorAll('.nx-toast').forEach((x) => x.remove())
  const t = document.createElement('div')
  t.className = 'nx-toast'
  t.textContent = msg
  t.style.cssText = `position:fixed;bottom:22px;right:22px;background:var(--bg3);border:1px solid var(--b);border-radius:8px;padding:9px 15px;font-size:11px;z-index:9999;color:${col || 'var(--cyan)'};animation:toastIn .2s ease;pointer-events:none;max-width:300px;word-break:break-word;`
  document.body.appendChild(t)
  setTimeout(() => t.remove(), dur || 2800)
}

function updateLoader(p: number, m?: string): void {
  const b = document.getElementById('plBar'), tt = document.getElementById('plTxt')
  if (b) b.style.width = p + '%'
  if (tt && m) tt.textContent = m
}
function hideLoader(): void {
  const l = document.getElementById('pageLoader')
  if (!l) return
  l.classList.add('hide')
  setTimeout(() => { l.style.display = 'none' }, 500)
}

function stripAllCode(text: string): string {
  if (!text) return ''
  text = text.replace(/```[a-zA-Z]*\n[\s\S]*?```/g, '')
  text = text.replace(/```[\s\S]*?```/g, '')
  text = text.replace(/^\s*call:[a-z_]+\([\s\S]*?\)\s*$/gm, '')
  text = text.replace(/\b(?:inject_script|create_gui|create_remote|batch_commands|edit_script|create_script|create_local_script)\s*\(\{[\s\S]*?\}\)/g, '')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

function cleanAIResponse(text: string): string {
  if (!text) return ''
  text = text.replace(/```json[\s\S]*?```/gi, '')
  text = text.replace(/^\s*call:[a-z_]+\([\s\S]*?\)\s*$/gm, '')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

function isPureGreeting(txt: string): boolean {
  const t = txt.trim().toLowerCase()
  if (t.length > 100) return false
  return /^(halo|hai|hi|hello|hey|selamat\s*(pagi|siang|sore|malam)|good\s*(morning|afternoon|evening|night)|apa\s*kabar|how\s*are\s*you|nexus|ping|hei|yo|sup|test|tes|coba|ok|oke|siap|ready|mantap|bagus|keren|nice|thanks|makasih|thank\s*you|terima\s*kasih)[\s?!.,]*$/.test(t)
}

function isOwner(): boolean {
  if (!SESSION) return false
  const plan = (S.plan || (SESSION.data && SESSION.data.plan as string) || '').toLowerCase()
  if (plan === 'owner' || plan === 'unlimited') return true
  const roles = (SESSION.data && SESSION.data.roles as string[]) || []
  if (roles.indexOf('owner') >= 0) return true
  return OWNER_IDS.indexOf(String(SESSION.user.robloxId || '')) >= 0
}
function isAdmin(): boolean {
  if (!SESSION) return false
  if (isOwner()) return true
  const roles = (SESSION.data && SESSION.data.roles as string[]) || []
  return roles.indexOf('admin') >= 0 || ADMIN_IDS.indexOf(String(SESSION.user.robloxId || '')) >= 0
}

function _sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)) }
function _jitter(ms: number): number { return ms + Math.floor(Math.random() * ms * 0.4) }
function _isAbortError(e: unknown): boolean {
  if (!e) return false
  const err = e as { name?: string; message?: string }
  return err.name === 'AbortError' || String(err.message || '').includes('AbortError')
}

function safeMarked(md: string): string {
  try {
    const w = window as unknown as { marked?: { parse: (s: string) => string } }
    if (!w.marked) return esc(md)
    const raw = w.marked.parse(String(md || ''))
    return sanitizeHtml(raw)
  } catch { return esc(md) }
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 2 — LANGUAGE, MODELS, CONSTANTS, SESSION
// ══════════════════════════════════════════════════════════════════════════════

const _docsCache: Record<string, unknown> = {}

async function searchRobloxDocs(query: string, maxResults = 5): Promise<unknown> {
  if (!query || query.length < 3) return null
  const cacheKey = query.toLowerCase().trim().slice(0, 80)
  if (_docsCache[cacheKey]) return _docsCache[cacheKey]
  try {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ action: 'search_docs', query, doc_type: 'all', limit: maxResults, _user: SESSION ? SESSION.user.username : 'web' }),
    })
    clearTimeout(tid)
    if (!r.ok) return null
    const d = await r.json() as { results?: { title: string; snippet: string; url: string }[] }
    if (d && d.results && d.results.length > 0) { _docsCache[cacheKey] = d; return d }
  } catch (e) {
    if (e && (e as { name?: string }).name === 'AbortError') return null
    console.warn('[NEXUS docs] search error:', (e as Error).message)
  }
  return null
}

function _buildDocsContext(docsResult: unknown): string {
  const dr = docsResult as { results?: { title: string; snippet: string; url: string }[] }
  if (!dr || !dr.results || !dr.results.length) return ''
  const lines = ['[ROBLOX DOCS REFERENCE — Retrieved live for this query]']
  dr.results.slice(0, 4).forEach((r) => {
    lines.push(`• ${r.title}: ${r.snippet} → ${r.url}`)
  })
  lines.push('[Use these references to write accurate, up-to-date Roblox code]')
  return lines.join('\n')
}

const REPORT_URL = '/api/report'
const K: { gemini: string; turnstile: string } = { gemini: '', turnstile: '' }
let _turnstileWidget: unknown = null
const OWNER_IDS = ['128649548']
let ADMIN_IDS: string[] = []
const guiElements: Record<string, GuiEl> = {}
let selectedElId: string | null = null
let guiElCounter = 0
let _stepsEl: HTMLElement | null = null
let _stepsList: HTMLElement | null = null
const _stepsMap = new Map<number, HTMLElement>()
const _stepMeta = new Map<number, StepMeta>()
let _stepsId = 0
let _mentionActive = false
let _mentionAtPos = -1
let _mentionSelIdx = 0
let _wsCache: unknown = null
let _wsLoading = false
let _playTestActive = false

let _syncTimer: ReturnType<typeof setInterval> | null = null
let _syncInProgress = false
let _syncDebounceTimer: ReturnType<typeof setTimeout> | null = null
let _syncFailCount = 0

const _DOCS_KEYWORDS = [
  'tweenservice', 'tween', 'datastore', 'remoteevent', 'remotefunction', 'bindable',
  'humanoid', 'leaderstats', 'collectionservice', 'pathfinding', 'runservice',
  'userinputservice', 'httprequest', 'http', 'lighting', 'terrain', 'particles',
  'sound', 'animation', 'constraint', 'weld', 'billboardgui', 'surfacegui',
  'proximityprompt', 'clickdetector', 'badge', 'marketplace', 'textchatservice',
  'proximity', 'attachment', 'motor6d', 'hingeconstraint', 'springconstraint',
  'part', 'model', 'script', 'localscript', 'modulescript', 'error', 'bug',
  'issue', 'crash', 'api', 'method', 'function', 'service', 'instance', 'property',
  'event', 'enum', 'spawn', 'respawn', 'teleport', 'npc', 'enemy', 'mob', 'ai',
  'pathfind', 'jump', 'walk', 'health', 'damage', 'kill', 'inventory', 'backpack',
  'tool', 'equipment', 'shop', 'purchase', 'buy', 'sell', 'coin', 'gem', 'currency',
  'economy', 'rank', 'level', 'xp', 'exp', 'gui', 'frame', 'button', 'label',
  'image', 'scroll', 'viewport', 'color', 'material', 'mesh', 'texture', 'decal',
  'light', 'fire', 'smoke', 'timer', 'countdown', 'round', 'game mode', 'lobby',
  'match', 'session', 'admin', 'ban', 'kick', 'mute', 'chat', 'message', 'broadcast',
]
function _shouldSearchDocs(txt: string): boolean {
  if (!txt || txt.length < 5) return false
  const lower = txt.toLowerCase()
  for (let i = 0; i < _DOCS_KEYWORDS.length; i++) {
    if (lower.indexOf(_DOCS_KEYWORDS[i]) >= 0) return true
  }
  return false
}

const LANGS: Record<string, LangStrings> = {
  id: {
    placeholder: 'Tanya NEXUS AI tentang Roblox... (ketik @ untuk mention)',
    noConv: 'Belum ada percakapan', newchat: 'Percakapan Baru', recent: 'Riwayat Chat', dash: 'Dashboard',
    son: 'Studio: ON', soff: 'Studio: OFF', cancel: 'Batalkan',
    connected: 'Plugin terhubung — AI siap build di place kamu!',
    disconnected: 'Plugin belum terhubung —',
    creditsLabel: 'Credits', credHint: 'Klik untuk beli lebih', helpBtn: 'Butuh Bantuan?', inboxBtn: 'Inbox',
    welcomeText: 'AI Roblox cerdas — tulis Lua, debug script, buat GUI. Connect plugin untuk inject langsung ke Studio!',
    chatTitle: 'NEXUS AI — Asisten Roblox', installLink: 'Cara connect', reconnectLink: 'Reconnect',
    installTitle: 'Cara Install Plugin NEXUS AI',
    installSteps: [
      'Download dari <a href="https://create.roblox.com/store/asset/91870814099475/NEXUS-AI" target="_blank" style="color:var(--cyan)">Creator Store</a>',
      'Simpan ke: <code>C:\\Users\\[Nama]\\AppData\\Local\\Roblox\\Plugins\\</code>',
      'Studio: <strong>Manage Plugin</strong> → Enable <strong>HTTP Requests</strong> + <strong>Script Injection</strong>',
      'Klik <strong>NEXUS AI</strong> di toolbar Studio → Klik <strong>CONNECT</strong>',
      'Status hijau = terhubung!',
    ],
    installClose: 'MENGERTI', settingsTitle: 'Pengaturan', accountTitle: 'Akun',
    planLabel: 'Plan', robloxIdLabel: 'Roblox ID',
    dailyTitle: 'Daily Credits', freePlan: 'Free Plan', proPlan: 'Pro Plan',
    playTestTitle: 'Auto Play Test', playTestLabel: 'Jalankan play_test setelah inject',
    playTestHint: 'Nonaktifkan jika laptop crash saat play_test', playTestDurLabel: 'Durasi (detik)',
    langTitle: 'Bahasa', langLabel: 'Bahasa Interface & AI',
    reportTitle: 'Laporkan Masalah', reportBtn: 'Kirim Report',
    redeemTitle: 'Redeem Code',
    redeemHint: 'Dapatkan code di <a href="https://discord.gg/FzAF48mvK5" target="_blank" style="color:var(--cyan)">Discord NEXUS STUDIO</a>',
    downloadTitle: 'Download Plugin', downloadHint: 'Install NEXUS AI Plugin di Roblox Studio',
    downloadPluginBtn: 'Download dari Creator Store', logoutLabel: 'Logout', close: 'TUTUP',
    guiAddLabel: 'Tambah:', guiEmptyText: 'Tambah elemen atau klik AI Build',
    guiLoadingText: 'AI sedang membangun UI...', guiToPlaceText: 'Kirim ke Place',
    guiAiBuild: 'AI Build', guiClear: 'Hapus', guiExport: 'Export',
    guiCodeTitle: 'Generated GUI Script', copy: 'Copy', download: 'Download .lua',
    guiAiTitle: 'AI UI Builder', guiAiDesc: 'Deskripsikan UI yang Anda inginkan:',
    guiAiBuildBtn: 'Bangun dengan AI', guiAiCancel: 'Batal',
    guiPropsEmpty: 'Pilih elemen', guiLayerTitle: 'Layer',
    avatarClose: 'TUTUP', copiedToast: 'Tersalin!', reconnectToast: 'Menghubungkan ulang...',
    creditsExhausted: 'Credits habis! Beli di Payment.', creditsLow: 'Credits tidak cukup.',
    cancelToast: 'Dibatalkan', modelBusyToast: 'Model sibuk, coba lagi dalam beberapa detik.',
    guiSentToast: 'GUI dikirim ke Studio!', guiNotConnectedToast: 'Studio belum terhubung!',
    addElementFirst: 'Tambahkan elemen dulu!', aiResponseInvalid: 'AI response tidak valid',
    errorPrefix: 'Gagal', clearConfirm: 'Hapus semua pesan di percakapan ini?',
    shareModalTitle: 'Bagikan Chat', shareModalDesc: 'Salin teks percakapan ini:',
    shareModalCopy: 'Copy Teks', shareClose: 'Tutup',
    workingOn: 'Memproses permintaan...', buildingInStudio: 'Membangun di Studio...',
    analyzingReq: 'Menganalisis permintaan...', designingSolution: 'Merancang solusi...',
    readingScript: 'Membaca script dari Studio...', analyzingError: 'Menganalisis error...',
    designingFix: 'Merancang perbaikan...', designingUI: 'Merancang UI/UX...',
    buildingComponents: 'Membangun komponen...', preparingEdit: 'Mempersiapkan edit...',
    preparingTest: 'Mempersiapkan test...', projectLabel: 'Project',
    testRunning: 'Menjalankan play_test', testDone: 'Test selesai', testError: 'Error ditemukan',
    loaderInit: 'Menginisialisasi...', loaderLoadData: 'Memuat data...',
    loaderConnecting: 'Memeriksa koneksi Studio...', loaderReady: 'Siap!',
    dailyReady: 'Daily reward tersedia! Klik Claim.', dailyAlready: 'Sudah diklaim hari ini.',
    dailyNext: 'Berikutnya: ', injFail: 'Gagal kirim ke Studio', tabChat: 'Chat', tabGui: 'UI Editor',
    retrying: 'Mencoba ulang...', noScriptWarning: 'Tidak ada script yang terdeteksi untuk diinjeksi.',
    injecting: 'Menginjeksi ke Studio...', injectDone: 'Inject selesai!',
    suggs: [
      { title: 'Loading Screen', body: 'Loading screen animasi profesional', q: 'Buat loading screen profesional dengan animasi progress bar, tips random, dan transisi halus', icon: '<polyline points="1 6 1 22 23 22 23 6"/><path d="M1 6l11 7 11-7"/>' },
      { title: 'Shop GUI', body: 'Toko dengan animasi dan coins', q: 'Buat shop GUI lengkap dengan tombol buka tutup, item list, tombol beli, harga, coins display, dan animasi smooth', icon: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' },
      { title: 'Leaderboard', body: 'DataStore Coins + Level + Win', q: 'Buat sistem DataStore leaderboard untuk game Roblox dengan Coins, Level, dan Win', icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
      { title: 'Admin System', body: 'Admin commands dan UI panel', q: 'Buat sistem admin commands lengkap dengan kick, ban, give, speed, fly, dan UI panel rapi', icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
    ],
  },
  en: {
    placeholder: 'Ask NEXUS AI about Roblox... (type @ to mention)',
    noConv: 'No conversations yet', newchat: 'New Chat', recent: 'Chat History', dash: 'Dashboard',
    son: 'Studio: ON', soff: 'Studio: OFF', cancel: 'Cancel',
    connected: 'Plugin connected — AI ready to build in your place!',
    disconnected: 'Plugin not connected —',
    creditsLabel: 'Credits', credHint: 'Click to buy more', helpBtn: 'Need Help?', inboxBtn: 'Inbox',
    welcomeText: 'Smart Roblox AI — write Lua, debug scripts, build GUIs. Connect plugin to inject directly into Studio!',
    chatTitle: 'NEXUS AI — Roblox Dev Assistant', installLink: 'How to connect', reconnectLink: 'Reconnect',
    installTitle: 'How to Install NEXUS AI Plugin',
    installSteps: [
      'Download from <a href="https://create.roblox.com/store/asset/91870814099475/NEXUS-AI" target="_blank" style="color:var(--cyan)">Creator Store</a>',
      'Save to: <code>C:\\Users\\[Name]\\AppData\\Local\\Roblox\\Plugins\\</code>',
      'Studio: <strong>Manage Plugin</strong> → Enable <strong>HTTP Requests</strong> + <strong>Script Injection</strong>',
      'Click <strong>NEXUS AI</strong> in Studio toolbar → Click <strong>CONNECT</strong>',
      'Green status = connected!',
    ],
    installClose: 'GOT IT', settingsTitle: 'Settings', accountTitle: 'Account',
    planLabel: 'Plan', robloxIdLabel: 'Roblox ID',
    dailyTitle: 'Daily Credits', freePlan: 'Free Plan', proPlan: 'Pro Plan',
    playTestTitle: 'Auto Play Test', playTestLabel: 'Run play_test after inject',
    playTestHint: 'Disable if PC crashes during play_test', playTestDurLabel: 'Duration (seconds)',
    langTitle: 'Language', langLabel: 'Interface & AI Language',
    reportTitle: 'Report Issue', reportBtn: 'Send Report',
    redeemTitle: 'Redeem Code',
    redeemHint: 'Get codes at <a href="https://discord.gg/FzAF48mvK5" target="_blank" style="color:var(--cyan)">NEXUS STUDIO Discord</a>',
    downloadTitle: 'Download Plugin', downloadHint: 'Install NEXUS AI Plugin in Roblox Studio',
    downloadPluginBtn: 'Download from Creator Store', logoutLabel: 'Logout', close: 'CLOSE',
    guiAddLabel: 'Add:', guiEmptyText: 'Add elements or click AI Build',
    guiLoadingText: 'AI is building UI...', guiToPlaceText: 'Send to Place',
    guiAiBuild: 'AI Build', guiClear: 'Clear', guiExport: 'Export',
    guiCodeTitle: 'Generated GUI Script', copy: 'Copy', download: 'Download .lua',
    guiAiTitle: 'AI UI Builder', guiAiDesc: 'Describe the UI you want:',
    guiAiBuildBtn: 'Build with AI', guiAiCancel: 'Cancel',
    guiPropsEmpty: 'Select element', guiLayerTitle: 'Layers',
    avatarClose: 'CLOSE', copiedToast: 'Copied!', reconnectToast: 'Reconnecting...',
    creditsExhausted: 'Credits exhausted! Buy at Payment.', creditsLow: 'Not enough credits.',
    cancelToast: 'Cancelled', modelBusyToast: 'Model busy, please retry in a few seconds.',
    guiSentToast: 'GUI sent to Studio!', guiNotConnectedToast: 'Studio not connected!',
    addElementFirst: 'Add elements first!', aiResponseInvalid: 'AI response invalid',
    errorPrefix: 'Failed', clearConfirm: 'Delete all messages in this chat?',
    shareModalTitle: 'Share Chat', shareModalDesc: 'Copy conversation text:',
    shareModalCopy: 'Copy Text', shareClose: 'Close',
    workingOn: 'Processing request...', buildingInStudio: 'Building in Studio...',
    analyzingReq: 'Analyzing request...', designingSolution: 'Designing solution...',
    readingScript: 'Reading script from Studio...', analyzingError: 'Analyzing error...',
    designingFix: 'Designing fix...', designingUI: 'Designing UI/UX...',
    buildingComponents: 'Building components...', preparingEdit: 'Preparing edit...',
    preparingTest: 'Preparing test...', projectLabel: 'Project',
    testRunning: 'Running play_test', testDone: 'Test done', testError: 'Errors found',
    loaderInit: 'Initializing...', loaderLoadData: 'Loading data...',
    loaderConnecting: 'Checking Studio connection...', loaderReady: 'Ready!',
    dailyReady: 'Daily reward available! Click Claim.', dailyAlready: 'Already claimed today.',
    dailyNext: 'Next: ', injFail: 'Send to Studio failed', tabChat: 'Chat', tabGui: 'UI Editor',
    retrying: 'Retrying...', noScriptWarning: 'No scripts detected to inject.',
    injecting: 'Injecting to Studio...', injectDone: 'Inject complete!',
    suggs: [
      { title: 'Loading Screen', body: 'Professional animated loading screen', q: 'Create a professional loading screen with animated progress bar, random tips, and smooth transitions', icon: '<polyline points="1 6 1 22 23 22 23 6"/><path d="M1 6l11 7 11-7"/>' },
      { title: 'Shop GUI', body: 'Shop with animations and coins', q: 'Create a complete shop GUI with open/close button, item list, buy button, prices, coins display, and smooth animations', icon: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' },
      { title: 'Leaderboard', body: 'DataStore Coins + Level + Win', q: 'Create a DataStore leaderboard system for Roblox with Coins, Level, and Win stats', icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
      { title: 'Admin System', body: 'Admin commands and UI panel', q: 'Create a complete admin commands system with kick, ban, give, speed, fly, and a clean UI panel', icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
    ],
  },
}
function T(): LangStrings { return LANGS[curLang] || LANGS.en }

const MODEL_LIST: ModelEntry[] = [
  { grp: 'Google' },
  { id: 'gemini-3.5-flash', prov: 'gemini', cost: 3, label: 'Gemini 3.5 Flash', icon: '/images/gemini.png', badge: 'FAST' },
  { id: 'gemini-3.1-flash-lite', prov: 'gemini', cost: 2, label: 'Gemini 3.1 Flash Lite', icon: '/images/gemini.png', badge: 'FAST' },
  { id: 'gemini-3.1-pro-preview', prov: 'gemini', cost: 12, label: 'Gemini 3.1 Pro', icon: '/images/gemini.png', badge: 'BEST' },
  { grp: 'ChatGPT' },
  { id: 'openai/gpt-oss-120b:free', prov: 'openrouter', cost: 0, label: 'ChatGPT', icon: '/images/chatgpt.png', badge: 'FREE' },
  { grp: 'DeepSeek' },
  { id: 'deepseek/deepseek-v4-flash', prov: 'openrouter', cost: 15, label: 'DeepSeek V4 Pro', icon: '/images/deepseek.svg', badge: 'BEST' },
]

const S: AppState = {
  credits: 30, allConvs: [], convs: [], curConv: null,
  gen: false, cancelCtrl: null,
  model: { id: 'gemini-3.5-flash', prov: 'gemini', cost: 3, label: 'Gemini 3.5 Flash' },
  guiModel: { id: 'gemini-3.5-flash', prov: 'gemini', cost: 3, label: 'Gemini 3.5 Flash' },
  plan: 'free', draftText: {}, attachments: [], lastClaim: null, unreadInbox: 0,
  currentProjectId: null, currentProjectName: null, projects: [],
  playTestEnabled: typeof window !== 'undefined' ? localStorage.getItem('nexus_play_test') !== 'false' : false,
  playTestDuration: typeof window !== 'undefined' ? Math.max(5, Math.min(120, parseInt(localStorage.getItem('nexus_play_test_dur') || '15'))) : 15,
}

const _MODEL_ID_MIGRATION: Record<string, string> = {
  'gemini-2.5-flash-lite': 'gemini-3.1-flash-lite',
  'gemini-3-flash-preview': 'gemini-3.5-flash',
  'gemini-3.5-flash-preview': 'gemini-3.5-flash',
  'gemini-3-pro-preview': 'gemini-3.1-pro-preview',
  'gemini-3.5-pro-preview': 'gemini-3.1-pro-preview',
  'gemini-3.5-ultra-preview': 'gemini-3.1-pro-preview',
}
function _migrateModelId(modelObj: ModelEntry): ModelEntry {
  if (!modelObj || !modelObj.id) return modelObj
  const newId = _MODEL_ID_MIGRATION[modelObj.id]
  if (newId) {
    const found = MODEL_LIST.find((m) => m.id === newId)
    return found || Object.assign({}, modelObj, { id: newId })
  }
  return modelObj
}

// ── SESSION CHECK ─────────────────────────────────────────────────────────────
;(function () {
  if (typeof window === 'undefined') return
  try {
    const s = localStorage.getItem('nexus_session')
    if (!s) { location.replace('/'); return }
    const p = JSON.parse(s) as NexusSession
    if (!p || !p.user || !p.user.username || !p.user.robloxId) {
      localStorage.removeItem('nexus_session'); location.replace('/'); return
    }
    if (Date.now() - p.loginTime >= 86400000 * 7) {
      localStorage.removeItem('nexus_session'); location.replace('/'); return
    }
    SESSION = p
    if (!SESSION.data) SESSION.data = {}
    const urlp = new URLSearchParams(window.location.search)
    const pathParts = window.location.pathname.split('/')
    const chatsIdx = pathParts.indexOf('chats')
    const hasId = urlp.get('id') || (chatsIdx !== -1 && pathParts[chatsIdx + 1] && pathParts[chatsIdx + 1].length > 3)
    if (!hasId && window.location.pathname.endsWith('/chats')) {
      location.replace('/dashboard'); return
    }
    const appEl = document.getElementById('app')
    if (appEl) appEl.classList.remove('hidden')
  } catch {
    localStorage.removeItem('nexus_session'); location.replace('/')
  }
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
    const cur = S.convs.map((c) => { const cp = { ...c }; cp.projectId = S.currentProjectId; return cp })
    S.allConvs = [...others, ...cur]
  } else {
    S.allConvs = S.convs.slice()
  }
  SESSION.data.credits = S.credits
  SESSION.data.plan = S.plan
  SESSION.data.model = S.model
  SESSION.data.lastClaim = S.lastClaim
  SESSION.data.projects = S.projects || SESSION.data.projects
  SESSION.data.convs = getStoreConvs()
  try {
    localStorage.setItem('nexus_session', JSON.stringify(SESSION))
  } catch {
    try {
      SESSION.data.convs = getStoreConvs().slice(-5)
      localStorage.setItem('nexus_session', JSON.stringify(SESSION))
    } catch { console.warn('[NEXUS] localStorage full') }
  }
  _debouncedSync()
}

function _debouncedSync(): void {
  if (_syncFailCount >= 5) return
  if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer)
  _syncDebounceTimer = setTimeout(() => {
    _syncDebounceTimer = null
    if (!_syncInProgress) syncToServer()
  }, 4000)
}

async function syncToServer(): Promise<void> {
  if (!SESSION) return
  if (_syncInProgress) {
    if (!_syncDebounceTimer) {
      _syncDebounceTimer = setTimeout(() => {
        _syncDebounceTimer = null
        if (!_syncInProgress) syncToServer()
      }, 4000)
    }
    return
  }
  if (_syncFailCount >= 5) { setTimeout(() => { _syncFailCount = 0 }, 90000); return }
  _syncInProgress = true
  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), 12000)
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
        credits: S.credits, plan: S.plan, model: S.model,
        lastClaim: S.lastClaim,
        convs: convsTrimmed, projects: S.projects || [], lastSync: Date.now(),
      },
    }
    const resp = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nexus-Nonce': _csrfNonce },
      signal: ctrl.signal,
      body: JSON.stringify(payload),
    })
    clearTimeout(timeoutId)
    if (resp.ok) { _syncFailCount = 0 }
    else if (resp.status === 413) { _syncFailCount++; console.warn('[NEXUS sync] 413') }
    else if (resp.status === 500) { _syncFailCount++; console.warn('[NEXUS sync] 500') }
    else if (resp.status === 401 || resp.status === 403) { _syncFailCount = 5; console.warn('[NEXUS sync] auth error') }
    else { _syncFailCount++ }
  } catch (e) {
    clearTimeout(timeoutId)
    if (e && (e as { name?: string }).name !== 'AbortError') { _syncFailCount++; console.warn('[NEXUS sync] error:', (e as Error).message) }
  } finally {
    _syncInProgress = false
  }
}

function startAutoSync(): void {
  if (_syncTimer) clearInterval(_syncTimer)
  _syncTimer = setInterval(() => {
    if (document.hidden) return
    if (!_syncInProgress && !_syncDebounceTimer) syncToServer()
  }, 300000)
}

async function loadS(): Promise<void> {
  if (!SESSION) return
  S.credits = parseFloat(String((SESSION.data && SESSION.data.credits !== undefined) ? SESSION.data.credits : 30)) || 30
  S.plan = (SESSION.data && SESSION.data.plan as string) || 'free'
  S.lastClaim = (SESSION.data && SESSION.data.lastClaim as string) || null
  if (SESSION.data && SESSION.data.model) {
    const sm = SESSION.data.model as ModelEntry
    let found = MODEL_LIST.find((m) => m.id === sm.id)
    if (!found) {
      const migrated = _migrateModelId(sm)
      found = MODEL_LIST.find((m) => m.id === migrated.id) || migrated
    }
    S.model = found || sm
  }
  S.allConvs = (SESSION.data && SESSION.data.convs as Conv[]) || []
  S.convs = S.currentProjectId
    ? S.allConvs.filter((c) => c.projectId === S.currentProjectId)
    : S.allConvs.slice()
  try {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 12000)
    const r = await fetch(`/api/sync?user=${encodeURIComponent((SESSION.user.username || '').toLowerCase())}&robloxId=${encodeURIComponent(SESSION.user.robloxId || '')}`, { signal: ctrl.signal })
    clearTimeout(tid)
    if (r.ok) {
      const d = await r.json() as { credits?: number; plan?: string; lastClaim?: string; convs?: Conv[]; projects?: AppState['projects'] }
      if (d && d.credits !== undefined) {
        S.credits = parseFloat(String(d.credits)) || 0
        S.plan = d.plan || S.plan
        S.lastClaim = d.lastClaim || S.lastClaim
        if (d.convs && d.convs.length) {
          S.allConvs = d.convs
          S.convs = S.currentProjectId
            ? S.allConvs.filter((c) => c.projectId === S.currentProjectId)
            : S.allConvs.slice()
        }
        if (d.projects) S.projects = d.projects
        SESSION.data = Object.assign(SESSION.data || {}, d)
        try { localStorage.setItem('nexus_session', JSON.stringify(SESSION)) } catch { }
      }
    }
  } catch (e) { console.warn('[NEXUS loadS] sync fetch failed:', (e as Error).message) }
}

async function loadKeys(): Promise<void> {
  try {
    const r = await fetch('/api/main')
    if (r.ok) {
      const d = await r.json() as { gemini_key?: string; turnstile_site_key?: string }
      K.gemini = d.gemini_key || ''
      K.turnstile = d.turnstile_site_key || ''
      if (K.turnstile) {
        const w = window as unknown as { turnstile?: { render: (sel: string, opts: Record<string, unknown>) => unknown } }
        if (w.turnstile) {
          const wrap = document.getElementById('cf-turnstile-wrap')
          if (wrap) wrap.style.display = 'block'
          _turnstileWidget = w.turnstile.render('#cf-turnstile-report', {
            sitekey: K.turnstile, theme: 'dark', size: 'normal',
            callback: (token: string) => {
              const el = document.getElementById('_tsToken') as HTMLInputElement | null
              if (el) el.value = token
            },
          })
        }
      }
    }
  } catch (e) { console.warn('[NEXUS] loadKeys error:', (e as Error).message) }
}

async function loadAdminIds(): Promise<void> {
  try {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch('/api/sync?admin_ids=1', { signal: ctrl.signal })
    clearTimeout(tid)
    if (r.ok) { const d = await r.json() as { admin_ids?: string[] }; if (d && d.admin_ids) ADMIN_IDS = d.admin_ids }
  } catch (e) {
    if (e && (e as { name?: string }).name !== 'AbortError') console.warn('[NEXUS] loadAdminIds error:', (e as Error).message)
  }
}

async function loadInboxCount(): Promise<void> {
  try {
    const r = await fetch('/api/inbox?count=1&user=' + (SESSION ? SESSION.user.username : ''))
    if (r.ok) {
      const d = await r.json() as { count?: number }
      S.unreadInbox = d.count || 0
      const b = document.getElementById('inboxBadge')
      if (b) b.textContent = String(S.unreadInbox)
    }
  } catch (e) { console.warn('[NEXUS] loadInboxCount error:', (e as Error).message) }
}

// ── DAILY REWARD ──────────────────────────────────────────────────────────────
function checkDailyOnLoad(): void {
  if (isOwner() || isAdmin()) return
  const t = T()
  const ce = document.getElementById('lastClaimInfo')
  const cb = document.getElementById('claimDailyBtn') as HTMLButtonElement | null
  if (!S.lastClaim) { if (ce) ce.textContent = t.dailyReady; if (cb) cb.disabled = false; return }
  const diff = (Date.now() - new Date(S.lastClaim).getTime()) / 3600000
  if (diff >= 24) { if (ce) ce.textContent = t.dailyReady; if (cb) cb.disabled = false }
  else { const hrs = Math.ceil(24 - diff); if (ce) ce.textContent = t.dailyNext + hrs + 'h'; if (cb) cb.disabled = true }
}

function checkDailyCredits(): void { checkDailyOnLoad() }

function claimDaily(): void {
  if (isOwner() || isAdmin()) return
  const t = T()
  if (S.lastClaim) {
    const diff = (Date.now() - new Date(S.lastClaim).getTime()) / 3600000
    if (diff < 24) { toast(t.dailyAlready, 'var(--yellow)'); return }
  }
  const n = S.plan === 'pro' ? 25 : 2
  S.credits += n; S.lastClaim = new Date().toISOString()
  updateCreds(); saveS()
  const b = document.getElementById('claimDailyBtn') as HTMLButtonElement | null
  if (b) b.disabled = true
  const e = document.getElementById('lastClaimInfo')
  if (e) e.textContent = '+' + n + ' CR!'
  toast('+' + n + ' CR ' + (curLang === 'id' ? 'diklaim!' : 'claimed!'), 'var(--green)')
  setTimeout(checkDailyCredits, 500)
}

// ── PLAY TEST ─────────────────────────────────────────────────────────────────
function togglePlayTest(): void {
  S.playTestEnabled = !S.playTestEnabled
  localStorage.setItem('nexus_play_test', S.playTestEnabled ? 'true' : 'false')
  updatePlayTestUI()
  toast(
    S.playTestEnabled
      ? (curLang === 'id' ? 'Auto play_test aktif' : 'Auto play_test enabled')
      : (curLang === 'id' ? 'Dinonaktifkan' : 'Disabled'),
    S.playTestEnabled ? 'var(--green)' : 'var(--yellow)'
  )
}
function setPlayTestDur(val: string | number): void {
  const v = Math.max(5, Math.min(120, parseInt(String(val)) || 15))
  S.playTestDuration = v
  localStorage.setItem('nexus_play_test_dur', String(v))
  const inp = document.getElementById('playTestDurInput') as HTMLInputElement | null
  if (inp) inp.value = String(v)
}
function updatePlayTestUI(): void {
  const tg = document.getElementById('playTestToggle')
  if (tg) tg.className = 'toggle-sw' + (S.playTestEnabled ? ' on' : '')
  const dur = document.getElementById('playTestDurInput') as HTMLInputElement | null
  if (dur) dur.value = String(S.playTestDuration)
}

// ── CREDITS ───────────────────────────────────────────────────────────────────
function updateCreds(): void {
  const _cr = parseFloat(String(S.credits || 0))
  const v = (isOwner() || isAdmin()) ? '\u221e' : (_cr >= 100 ? _cr.toFixed(0) : _cr.toFixed(2))
  const el = document.getElementById('credDisp'); if (el) el.textContent = v
  const el2 = document.getElementById('settingsCredits'); if (el2) el2.textContent = v + ' CR'
  const el4 = document.getElementById('settingsRobloxId'); if (el4) el4.textContent = (SESSION && SESSION.user.robloxId) || '-'
  const c = document.getElementById('credsEl')
  if (c) {
    if (!isOwner() && !isAdmin() && parseFloat(String(S.credits)) < 5) c.classList.add('low')
    else c.classList.remove('low')
  }
}

function updateRoleDisplay(): void {
  if (!SESSION) return
  const plan = S.plan || 'free'; const isO = isOwner(), isA = isAdmin()
  const roleEl = document.getElementById('sbRole'),
    planEl = document.getElementById('settingsPlan'),
    badgeEl = document.getElementById('settingsBadge'),
    adminSec = document.getElementById('adminSection')
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
  const t = T()
  const badge = document.getElementById('studioBadge'),
    dot = document.getElementById('studioDot'),
    txt = document.getElementById('studioTxt'),
    banner = document.getElementById('plugBanner'),
    bTxt = document.getElementById('plugBannerTxt')
  if (on) {
    if (badge) badge.className = 'status-badge on'
    if (dot) dot.className = 'sdot pulse'
    if (txt) txt.textContent = t.son
    if (banner) banner.className = 'plug-banner connected'
    if (bTxt) bTxt.textContent = t.connected
    if (!_wsCache && !_wsLoading) fetchWsCache()
  } else {
    if (badge) badge.className = 'status-badge off'
    if (dot) dot.className = 'sdot pulse'
    if (txt) txt.textContent = t.soff
    if (banner) banner.className = 'plug-banner'
    if (bTxt) bTxt.textContent = t.disconnected
    _wsCache = null; _wsLoading = false
  }
}

function startStudioPoll(): void {
  if (studioPollTimer) clearInterval(studioPollTimer)
  checkStudio()
  studioPollTimer = setInterval(checkStudio, 5000)
}

let _pollFailCount = 0
const _POLL_FAIL_THRESHOLD = 2

async function checkStudio(): Promise<void> {
  if (!SESSION) return
  if (S.gen) { if (!studioConnected) return }
  const user = (SESSION.user.username || '').toLowerCase()
  try {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(`${API_URL}?check=1&user=${encodeURIComponent(user)}`, { signal: ctrl.signal })
    clearTimeout(tid)
    if (r.ok) {
      const d = await r.json() as { _pluginConnected?: boolean; connected?: boolean; online?: boolean }
      const newStatus = d._pluginConnected === true || d.connected === true || d.online === true
      const wasOn = studioConnected
      if (newStatus) {
        _pollFailCount = 0; setStudioStatus(true)
        if (!wasOn) { _wsCache = null; _wsLoading = false; fetchWsCache() }
      } else {
        _pollFailCount++
        if (_pollFailCount >= _POLL_FAIL_THRESHOLD && !S.gen) setStudioStatus(false)
      }
    } else {
      if (!S.gen) { _pollFailCount++; if (_pollFailCount >= _POLL_FAIL_THRESHOLD) setStudioStatus(false) }
    }
  } catch (e) {
    if (_isAbortError(e)) {
      if (!S.gen) { _pollFailCount++; if (_pollFailCount >= _POLL_FAIL_THRESHOLD + 1) setStudioStatus(false) }
    } else {
      if (!S.gen) { _pollFailCount++; if (_pollFailCount >= _POLL_FAIL_THRESHOLD) setStudioStatus(false) }
    }
  }
}

async function retryStudio(): Promise<void> {
  _pollFailCount = 0; toast(T().reconnectToast)
  await checkStudio()
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 4 — JSON PARSING PIPELINE
// ══════════════════════════════════════════════════════════════════════════════

function _stripLuaExpressions(str: string): string {
  if (typeof str !== 'string') return str
  str = str.replace(/UDim2\.new\s*\(\s*([-\d.\s,]+)\s*\)/g, (_, args) => {
    const parts = args.split(',').map((p: string) => parseFloat(p.trim()) || 0)
    return '[' + parts.join(',') + ']'
  })
  str = str.replace(/Vector3\.new\s*\(\s*([-\d.\s,]+)\s*\)/g, (_, args) => {
    const parts = args.split(',').map((p: string) => parseFloat(p.trim()) || 0)
    return '[' + parts.join(',') + ']'
  })
  str = str.replace(/Color3\.fromRGB\s*\(\s*([\d.\s,]+)\s*\)/g, (_, args) => {
    const parts = args.split(',').map((p: string) => parseInt(p.trim()) || 0)
    return '[' + parts.join(',') + ']'
  })
  str = str.replace(/Color3\.new\s*\([^)]*\)/g, 'null')
  str = str.replace(/Vector2\.new\s*\(\s*([-\d.\s,]+)\s*\)/g, (_, args) => {
    const parts = args.split(',').map((p: string) => parseFloat(p.trim()) || 0)
    return '[' + parts.join(',') + ']'
  })
  str = str.replace(/UDim\.new\s*\(\s*([-\d.\s,]+)\s*\)/g, (_, args) => {
    const parts = args.split(',').map((p: string) => parseFloat(p.trim()) || 0)
    return '[' + parts.join(',') + ']'
  })
  str = str.replace(/BrickColor\.new\s*\(\s*"([^"]+)"\s*\)/g, '"$1"')
  str = str.replace(/BrickColor\.new\s*\(\s*'([^']+)'\s*\)/g, '"$1"')
  str = str.replace(/Enum\.[A-Za-z]+\.([A-Za-z]+)/g, '"$1"')
  str = str.replace(/CFrame\.[a-zA-Z]*\s*\([^)]*\)/g, 'null')
  str = str.replace(/NumberRange\.new\s*\([^)]*\)/g, 'null')
  str = str.replace(/NumberSequence\.new\s*\([^)]*\)/g, 'null')
  str = str.replace(/ColorSequence\.new\s*\([^)]*\)/g, 'null')
  str = str.replace(/\b[A-Z][a-zA-Z]+\.[a-zA-Z]+\s*\([^)]{0,200}\)/g, 'null')
  return str
}

function _normalizeCmd(obj: unknown): Cmd | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const o = obj as Record<string, unknown>
  const actionName = String(o.action || o.command || o.type || '').trim()
  if (!actionName || actionName.length === 0 || actionName.length > 80) return null
  if (!/^[a-z_][a-z0-9_]*$/.test(actionName)) return null
  const result: Cmd = { action: actionName }
  if (o.params && typeof o.params === 'object' && !Array.isArray(o.params)) {
    Object.keys(o.params as Record<string, unknown>).forEach((k) => {
      if (k !== 'action' && k !== 'command' && k !== 'type') result[k] = (o.params as Record<string, unknown>)[k]
    })
  }
  Object.keys(o).forEach((k) => {
    if (k !== 'action' && k !== 'command' && k !== 'type' && k !== 'params') result[k] = o[k]
  })
  if (result.code && !result.source) { result.source = result.code; delete result.code }
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
    if (!inStr && c === '/' && str[i + 1] === '/') { while (i < str.length && str[i] !== '\n') i++; continue }
    if (!inStr && c === '/' && str[i + 1] === '*') { i += 2; while (i < str.length && !(str[i] === '*' && str[i + 1] === '/')) i++; i += 2; continue }
    if (!inStr && c === '-' && str[i + 1] === '-') { while (i < str.length && str[i] !== '\n') i++; continue }
    if (inStr) {
      if (c === '\n') { out += '\\n'; i++; continue }
      if (c === '\r') { out += '\\r'; i++; continue }
      if (c === '\t') { out += '\\t'; i++; continue }
      if (code < 0x20) { out += '\\u' + ('000' + code.toString(16)).slice(-4); i++; continue }
    }
    out += c; i++
  }
  return out
}

function _jsonRepair(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw
  raw = _stripLuaExpressions(raw)
  raw = _jsonSanitize(raw)
  raw = raw.replace(/([{,\[]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*=\s*(?![=>]))/g, '$1"$2": ')
  raw = raw.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:(?!:))/g, '$1"$2"$3')
  raw = raw.replace(/:\s*'([^'\\]*)'/g, ':"$1"')
  raw = raw.replace(/\[\s*'([^'\\]*)'/g, '["$1"')
  raw = raw.replace(/,\s*'([^'\\]*)'/g, ',"$1"')
  raw = raw.replace(/,(\s*[}\]])/g, '$1')
  raw = raw.replace(/:\s*True\b/g, ':true').replace(/:\s*False\b/g, ':false')
  raw = raw.replace(/:\s*None\b/g, ':null').replace(/:\s*nil\b/g, ':null')
  return raw
}

function _tryParseJson(raw: string): unknown {
  if (!raw || typeof raw !== 'string') return null
  raw = raw.trim()
  if (!raw || raw.length > 80000) return null
  if (!raw.startsWith('{') && !raw.startsWith('[')) return null
  try { return JSON.parse(raw) } catch { }
  const stripped = _stripLuaExpressions(raw)
  try { return JSON.parse(stripped) } catch { }
  try { return JSON.parse(_jsonRepair(raw)) } catch { }
  try { return JSON.parse(_jsonRepair(stripped)) } catch { }
  const jm = stripped.match(/(\[[\s\S]+\]|\{[\s\S]+\})/)
  if (jm) {
    try { return JSON.parse(jm[1]) } catch { }
    try { return JSON.parse(_jsonRepair(jm[1])) } catch { }
  } else {
    const jm2 = raw.match(/(\[[\s\S]+\]|\{[\s\S]+\})/)
    if (jm2) { try { return JSON.parse(_jsonRepair(jm2[1])) } catch { } }
  }
  return null
}

function _parseBareArgs(argsStr: string): Record<string, unknown> | null {
  if (!argsStr || !argsStr.trim()) return null
  try {
    let json = '{' + argsStr.trim() + '}'
    json = json.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3')
    json = json.replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ':"$1"')
    json = _stripLuaExpressions(json)
    const result = _tryParseJson(json)
    if (result && typeof result === 'object' && !Array.isArray(result)) return result as Record<string, unknown>
    const result2 = _tryParseJson(_jsonRepair(json))
    if (result2 && typeof result2 === 'object' && !Array.isArray(result2)) return result2 as Record<string, unknown>
  } catch { }
  return null
}

const _LUA_ACTION_PATTERNS = [
  /^\s*create_remote\s*\(/m, /^\s*inject_script\s*\(/m, /^\s*create_gui\s*\(/m,
  /^\s*create_frame\s*\(/m, /^\s*batch_commands\s*\(/m, /^\s*create_script\s*\(/m,
  /^\s*create_local_script\s*\(/m, /^\s*create_module\s*\(/m, /^\s*edit_script\s*\(/m,
  /^\s*create_part\s*\(/m, /^\s*set_property\s*\(/m, /^\s*create_text_label\s*\(/m,
  /^\s*inject_quick_script\s*\(/m, /^\s*set_lighting\s*\(/m, /^\s*create_npc\s*\(/m,
]

function isActionCallBlock(code: string): boolean {
  let count = 0
  for (let i = 0; i < _LUA_ACTION_PATTERNS.length; i++) {
    if (_LUA_ACTION_PATTERNS[i].test(code)) { count++; if (count >= 2) return true }
  }
  if (count === 1) {
    const hasRealLua = /\bgame:GetService\b|\blocal\s+\w+\s*=\s*Instance\.new\b|\bPlayers\.LocalPlayer\b|\bscript\.Parent\b|\btask\.spawn\b|\btask\.wait\b/.test(code)
    if (!hasRealLua) return true
  }
  return false
}

function parseLuaBlocks(text: string): string[] {
  const blocks: string[] = []
  const re = /```(?:lua|luau)\s*([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const c = m[1].trim()
    if (c.length < 10) continue
    if (isActionCallBlock(c)) continue
    if (/--\s*Command\s*Batch\s*Start/i.test(c)) continue
    if (/^\s*batch_commands\s*\(\s*\{/.test(c)) continue
    if (/^\s*\{\s*["']?action["']?\s*[=:]\s*["']/.test(c)) continue
    if (/^\s*(local\s+\w+\s*=\s*)?Instance\.new\(["']Remote(Event|Function)["']\)/.test(c) &&
      c.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--')).length <= 6) continue
    blocks.push(c)
  }
  return blocks
}

function parseJsonBlocks(text: string): Cmd[] {
  const cmds: Cmd[] = []
  const re = /```(?:json|JSON|Json)\s*\n?([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].trim()
    if (!raw || raw.length < 5 || raw.length > 50000) continue
    if (/^\s*(local\s+|function\s+[a-zA-Z]|game:Get|return\s+\{)/.test(raw) &&
      !/"action"/.test(raw) && !/"command"/.test(raw)) continue

    let processed = _stripLuaExpressions(raw)
    processed = processed.replace(/([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*=\s*(?![=>]))/g, '$1"$2": ')

    const fnMatch = processed.match(/^\s*([a-z_][a-z0-9_]{2,49})\s*\(\s*(\{[\s\S]+\})\s*\)\s*;?\s*$/)
    if (fnMatch) {
      const fnName = fnMatch[1], bodyStr = fnMatch[2], fnParsed = _tryParseJson(bodyStr)
      if (fnParsed && typeof fnParsed === 'object') {
        if (fnName === 'batch_commands') {
          const fp = fnParsed as Record<string, unknown>
          const batchArr = fp.commands || fp.actions || (Array.isArray(fnParsed) ? fnParsed : null)
          if (Array.isArray(batchArr)) { batchArr.forEach((sub) => { const norm = _normalizeCmd(sub); if (norm) cmds.push(norm) }); continue }
        } else {
          const fnCmd = Object.assign({ action: fnName }, Array.isArray(fnParsed) ? {} : fnParsed)
          const norm = _normalizeCmd(fnCmd); if (norm) { cmds.push(norm); continue }
        }
      }
    }

    const parsed = _tryParseJson(processed)
    if (!parsed) continue

    let items: unknown[] = []
    if (Array.isArray(parsed)) items = parsed
    else {
      const p = parsed as Record<string, unknown>
      if (p.batch_commands && Array.isArray(p.batch_commands)) items = p.batch_commands
      else if (p.commands && Array.isArray(p.commands)) items = p.commands
      else if (p.actions && Array.isArray(p.actions)) items = p.actions
      else if (p.action || p.command || p.type) items = [parsed]
      else {
        let foundArr = false
        Object.keys(p).forEach((k) => {
          if (!foundArr && Array.isArray(p[k]) && (p[k] as unknown[]).length > 0) {
            const first = (p[k] as unknown[])[0]
            if (first && typeof first === 'object' && ((first as Record<string, unknown>).action || (first as Record<string, unknown>).command || (first as Record<string, unknown>).type)) {
              items = p[k] as unknown[]; foundArr = true
            }
          }
        })
        if (!foundArr && Object.keys(p).length > 0) {
          Object.keys(p).forEach((k) => {
            if (/^[a-z_][a-z0-9_]*$/.test(k) && typeof p[k] === 'object' && !Array.isArray(p[k])) {
              const candidate = Object.assign({ action: k }, p[k] as Record<string, unknown>)
              if (_normalizeCmd(candidate)) items.push(candidate)
            }
          })
        }
      }
    }

    items.forEach((item) => {
      if (!item || typeof item !== 'object') return
      const it = item as Record<string, unknown>
      if (!Array.isArray(item)) {
        if (it.batch_commands && Array.isArray(it.batch_commands)) {
          (it.batch_commands as unknown[]).forEach((sub) => { const norm = _normalizeCmd(sub); if (norm) cmds.push(norm) }); return
        }
        if (it.commands && Array.isArray(it.commands)) {
          (it.commands as unknown[]).forEach((sub) => { const norm = _normalizeCmd(sub); if (norm) cmds.push(norm) }); return
        }
      }
      const norm = _normalizeCmd(item); if (norm) cmds.push(norm)
    })
  }
  return cmds
}

const _NEXUS_ACTION_FNS = [
  'create_script','create_local_script','create_module','inject_script','edit_script',
  'read_script','read_script_lines','rename_script','duplicate_script',
  'disable_script','enable_script','batch_inject','check_list','create_remote',
  'set_property','set_properties','batch_set_property','get_properties',
  'set_service_property','get_service_properties',
  'delete','clone_object','rename_object','batch_rename','parent_to','batch_parent',
  'select_object','select_multiple','lock_object','unlock_object',
  'set_visible','toggle_visible','toggle_anchored','set_primary_part',
  'copy_properties','replace_all',
  'add_collection_tag','remove_collection_tag','get_tags','find_tagged',
  'create_folder','create_instance','create_value','create_configuration',
  'create_part','create_model','move_object','rotate_object','resize_object',
  'group_parts','ungroup_model','align_objects','snap_to_grid','randomize_colors',
  'batch_create','weld_model','scale_model','anchor_model','unanchor_model',
  'anchor_all','unanchor_all','break_joints',
  'create_gui','create_frame','create_scrolling_frame','create_canvas_group',
  'create_text_label','create_text_button','create_text_box',
  'create_image_label','create_image_button',
  'create_proximity_prompt','create_click_detector',
  'create_ui_list_layout','create_ui_grid_layout',
  'create_ui_padding','create_ui_corner','create_ui_stroke','create_ui_gradient',
  'create_ui_size_constraint','create_ui_aspect_ratio','create_ui_scale',
  'add_highlight','remove_highlight','add_drag_detector',
  'set_lighting','create_sky','create_atmosphere','add_effect','remove_effect',
  'change_baseplate','set_gravity','set_camera',
  'fill_terrain','replace_terrain','clear_terrain',
  'terraform_flat','terraform_hills','terraform_island','terraform_mountain','create_river',
  'create_fire','remove_fire','create_smoke','remove_smoke','create_sparkles',
  'create_light','create_explosion','create_force_field','create_particle','create_trail',
  'create_sound','place_decal','place_texture',
  'create_weld','create_attachment','create_motor6d','create_constraint',
  'create_spawn_location','create_seat','create_team','create_animation',
  'create_animation_controller','create_tool','create_npc',
  'create_wall','create_platform','create_tree','create_tycoon_plot','create_checkpoint',
  'insert_model','play_test','stop_test','run_test',
  'scan_workspace','workspace_stats','get_descendants','list_children',
  'find_by_class','count_instances','search_instances','resolve_mention',
  'batch_commands','get_place_info','get_studio_theme','print_output',
  'ping','get_info','request_scan','clear_workspace','undo','redo',
  'save_waypoint','get_all_actions','set_project','run_lua','none',
  'create_billboard_gui','create_scroll_frame','create_viewport_frame',
  'delete_object','get_theme','inject_quick_script',
]
const _NEXUS_ACTION_FNS_SET = new Set(_NEXUS_ACTION_FNS)

function parseCallBlocks(text: string): Cmd[] {
  const cmds: Cmd[] = []
  const SKIP_FNS = new Set(['function','require','print','warn','error','typeof','instanceof',
    'Object','Array','String','Number','Boolean','Math','JSON','Promise',
    'fetch','console','setTimeout','setInterval','parseInt','parseFloat',
    'task','game','workspace','script','Instance','pcall','xpcall'])

  let luaActionText = ''
  const reLua = /```(?:lua|luau)\s*([\s\S]*?)```/gi
  let mLua: RegExpExecArray | null
  while ((mLua = reLua.exec(text)) !== null) {
    const block = mLua[1].trim()
    if (isActionCallBlock(block)) {
      const extracted = _extractActionsFromLuaBlock(block)
      extracted.forEach((cmd) => cmds.push(cmd))
      luaActionText += '\n' + block
    }
  }

  const textNoBlocks = text.replace(/```[\s\S]*?```/g, '')
  const searchText = textNoBlocks + '\n' + luaActionText

  const re1 = /call:([a-z_]+)\(\s*(\{[\s\S]+?\})\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re1.exec(searchText)) !== null) {
    const params = _tryParseJson(_stripLuaExpressions(m[2]))
    if (m[1] && params) {
      const cmd = Object.assign({ action: m[1] }, params)
      const norm = _normalizeCmd(cmd); if (norm) cmds.push(norm)
    }
  }

  const re2 = /\b([a-z_][a-z0-9_]{2,49})\s*\(\s*(\{[\s\S]*?\})\s*\)/g
  while ((m = re2.exec(textNoBlocks)) !== null) {
    const fnName = m[1]; if (SKIP_FNS.has(fnName)) continue
    const bodyStr = _stripLuaExpressions(m[2])
    const params2 = _tryParseJson(bodyStr)
    if (!params2 || typeof params2 !== 'object') continue
    const p2 = params2 as Record<string, unknown>
    if (fnName === 'batch_commands') {
      const batchCmds = p2.commands || p2.actions || (Array.isArray(params2) ? params2 : null)
      if (Array.isArray(batchCmds)) batchCmds.forEach((sub) => { const norm = _normalizeCmd(sub); if (norm) cmds.push(norm) })
    } else {
      const cmd2 = Object.assign({ action: fnName }, Array.isArray(params2) ? {} : params2)
      const norm2 = _normalizeCmd(cmd2); if (norm2) cmds.push(norm2)
    }
  }

  const reBare = new RegExp(`\\b(${_NEXUS_ACTION_FNS.join('|')})\\s*\\(([^)]{0,3000})\\)`, 'g')
  while ((m = reBare.exec(textNoBlocks)) !== null) {
    const fnNameBare = m[1], argsRaw = m[2].trim()
    if (argsRaw.startsWith('{')) continue
    if (argsRaw.length < 4) continue
    const paramsBare = _parseBareArgs(argsRaw)
    if (!paramsBare || typeof paramsBare !== 'object') continue
    const cmdBare = Object.assign({ action: fnNameBare }, paramsBare)
    const normBare = _normalizeCmd(cmdBare)
    if (normBare) {
      const isDupeBare = cmds.some((c) => c.action === normBare.action && (c.name || '') === (normBare.name || ''))
      if (!isDupeBare) cmds.push(normBare)
    }
  }

  const seen: Record<string, boolean> = {}
  return cmds.filter((cmd) => {
    const key = (cmd.action || '') + '|' + (cmd.name || '') + '|' + (cmd.parent || '')
    if (seen[key]) return false
    seen[key] = true
    return true
  })
}

function _extractActionsFromLuaBlock(blockCode: string): Cmd[] {
  const cmds: Cmd[] = []
  let pos = 0
  const code = blockCode
  const SKIP_FNS = new Set(['function','require','print','warn','error','local','if','for','while',
    'end','do','then','return','and','or','not','true','false','nil','table','string','math',
    'tostring','tonumber','type','pairs','ipairs','next','select','unpack','pcall','xpcall',
    'rawget','rawset','task','game','workspace','script'])

  while (pos < code.length) {
    const searchStr = code.slice(pos)
    const re = /\b([a-z_][a-z0-9_]{3,49})\s*\(\s*\{/g
    re.lastIndex = 0
    const m = re.exec(searchStr)
    if (!m) break
    const fnName = m[1]
    if (SKIP_FNS.has(fnName)) { pos += m.index + m[0].length; continue }
    const braceStart = pos + m.index + m[0].length - 1
    let depth = 0, inStr = false, strChar = '', inLongStr = false, bodyEnd = -1
    for (let bi = braceStart; bi < code.length; bi++) {
      const ch = code[bi]
      if (!inStr && ch === '[' && code[bi + 1] === '[') { inLongStr = true; bi += 1; continue }
      if (inLongStr && ch === ']' && code[bi + 1] === ']') { inLongStr = false; bi += 1; continue }
      if (inLongStr) continue
      if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strChar = ch; continue }
      if (inStr && ch === strChar && code[bi - 1] !== '\\') { inStr = false; continue }
      if (inStr) continue
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) { bodyEnd = bi; break } }
    }
    if (bodyEnd < 0) { pos += m.index + m[0].length; continue }
    const body = code.slice(braceStart, bodyEnd + 1)
    if (body.indexOf('[[') >= 0) {
      const nameM = body.match(/name\s*=\s*["']([^"']+)["']/)
      const parentM = body.match(/parent\s*=\s*["']([^"']+)["']/)
      const typeM = body.match(/script_type\s*=\s*["']([^"']+)["']/)
      const srcM = body.match(/source\s*=\s*\[\[([^\]]*(?:\][^\]][^\]]*)*)\]\]/)
      if (fnName === 'inject_script' && nameM) {
        const cmd: Cmd = {
          action: 'inject_script', name: nameM[1],
          parent: parentM ? parentM[1] : 'ServerScriptService',
          script_type: typeM ? typeM[1] : 'Script',
          source: srcM ? srcM[1].trim() : '',
        }
        if (cmd.source && String(cmd.source).length > 5) cmds.push(cmd)
      }
    } else {
      const stripped = _stripLuaExpressions(body)
      const parsed2 = _tryParseJson(stripped) || _tryParseJson(_jsonRepair(stripped))
      if (parsed2 && typeof parsed2 === 'object' && !Array.isArray(parsed2)) {
        const cmd2 = Object.assign({ action: fnName }, parsed2)
        const norm = _normalizeCmd(cmd2); if (norm) cmds.push(norm)
      }
    }
    pos = bodyEnd + 1
  }
  return cmds
}

function parseAllCommands(text: string): Cmd[] {
  const cmds = parseJsonBlocks(text)
  const callCmds = parseCallBlocks(text)
  callCmds.forEach((cmd) => {
    const exists = cmds.some((e) => e.action === cmd.action && (e.name || '') === (cmd.name || ''))
    if (!exists) cmds.push(cmd)
  })

  if (cmds.length === 0) {
    const jsonMatches = text.match(/(\[[\s\S]*?"action"[\s\S]*?\]|\{[\s\S]*?"action"[\s\S]*?\})/g)
    if (jsonMatches) {
      jsonMatches.forEach((raw) => {
        if (raw.length > 30000) return
        const parsed = _tryParseJson(raw.trim())
        if (!parsed) return
        const items = Array.isArray(parsed) ? parsed : [parsed]
        items.forEach((item) => {
          if (!item || !(item as Record<string, unknown>).action) return
          const norm = _normalizeCmd(item)
          if (norm) { const exists = cmds.some((e) => e.action === norm.action && (e.name || '') === (norm.name || '')); if (!exists) cmds.push(norm) }
        })
      })
    }
  }

  if (cmds.length === 0) {
    const batchMatch = text.match(/"commands"\s*:\s*(\[[\s\S]*?\])/)
    if (batchMatch) {
      const batchParsed = _tryParseJson(batchMatch[1])
      if (Array.isArray(batchParsed)) {
        batchParsed.forEach((item) => {
          const norm = _normalizeCmd(item)
          if (norm && !cmds.some((e) => e.action === norm.action && (e.name || '') === (norm.name || ''))) cmds.push(norm)
        })
      }
    }
  }

  if (cmds.length === 0) {
    const inlineRe = new RegExp(`\\b(${_NEXUS_ACTION_FNS.join('|')})\\s*\\([\\s\\S]{0,500}?\\)`, 'g')
    let mInline: RegExpExecArray | null
    while ((mInline = inlineRe.exec(text)) !== null) {
      const fnInline = mInline[1]
      const argsInline = mInline[0].slice(fnInline.length).replace(/^\s*\(/, '').replace(/\)\s*$/, '').trim()
      let parsed3: unknown = null
      if (argsInline.startsWith('{')) { parsed3 = _tryParseJson(_stripLuaExpressions(argsInline)) }
      else { parsed3 = _parseBareArgs(argsInline) }
      if (parsed3 && typeof parsed3 === 'object') {
        const cmdInline = Object.assign({ action: fnInline }, parsed3)
        const normInline = _normalizeCmd(cmdInline)
        if (normInline && !cmds.some((e) => e.action === normInline.action && (e.name || '') === (normInline.name || ''))) cmds.push(normInline)
      }
    }
  }

  return cmds
}

function detectScriptParent(code: string): { parent: string; type: string } {
  const c = code || '', first200 = c.slice(0, 200), trimmed = c.trim()
  const typeHint = c.match(/--\s*script_type:\s*(\w+)/i)
  const parentHint = c.match(/--\s*parent:\s*([\w.]+)/i)
  let type = 'Script', parent = 'ServerScriptService'
  const isModule = (/^\s*local\s+\w+\s*=\s*\{\s*\}/.test(trimmed) && /\breturn\s+\w+\s*$/.test(trimmed)) ||
    /^return\s*\{/.test(trimmed) || /^--\s*@?(module|modulescript)/im.test(first200)
  if (isModule) { parent = 'ReplicatedStorage'; type = 'ModuleScript' }
  else if (/Players\.LocalPlayer|PlayerGui|LocalUserInputService|UserInputService|StarterPlayerScripts/i.test(c) ||
    (/ScreenGui|StarterGui/i.test(c) && !/ServerScriptService|DataStoreService|PlayerAdded/i.test(c))) {
    if (/ReplicatedFirst|LoadingScreen_Client/i.test(c) || /ReplicatedFirst/i.test(first200)) {
      parent = 'ReplicatedFirst'; type = 'LocalScript'
    } else if (/StarterCharacterScripts/i.test(c)) {
      parent = 'StarterCharacterScripts'; type = 'LocalScript'
    } else { parent = 'StarterPlayerScripts'; type = 'LocalScript' }
  } else if (/DataStoreService|PlayerAdded|OnServerEvent|FireClient|ServerStorage|HttpService:GetAsync/i.test(c)) {
    parent = 'ServerScriptService'; type = 'Script'
  } else if (/ReplicatedFirst/i.test(first200)) { parent = 'ReplicatedFirst'; type = 'LocalScript' }
  else if (/Players\.LocalPlayer/i.test(first200)) { parent = 'StarterPlayerScripts'; type = 'LocalScript' }
  if (typeHint) type = typeHint[1]
  if (parentHint) parent = parentHint[1]
  return { parent, type }
}

function makeScriptName(prompt: string, i: number, code?: string): string {
  if (code) {
    const nm = code.match(/--\s*name:\s*([\w_]+)/i)
    if (nm && nm[1] && nm[1].length > 2) return nm[1]
  }
  const l = (prompt || '').toLowerCase()
  const kw: [string, string][] = [
    ['loading', 'LoadingScreen_Client'], ['shop gui', 'ShopGUI_Client'], ['shop', 'ShopSystem_Server'],
    ['leaderboard', 'Leaderboard_Server'], ['admin', 'AdminSystem_Server'], ['coin', 'CoinSystem_Server'],
    ['inventory', 'InventorySystem'], ['npc', 'NPCBehavior_Server'], ['datastore', 'DataStore_Module'],
    ['zombie', 'ZombieAI_Server'], ['vehicle', 'VehicleSystem'], ['tycoon', 'TycoonPlot'],
    ['round', 'RoundSystem_Server'], ['hud', 'HUD_Client'], ['gui', 'GUIScript_Client'],
    ['chat', 'ChatSystem_Client'], ['badge', 'BadgeManager_Server'], ['team', 'TeamSystem_Server'],
  ]
  for (let k = 0; k < kw.length; k++) {
    if (l.includes(kw[k][0])) return kw[k][1] + (i > 0 ? '_' + (i + 1) : '')
  }
  return 'GameScript' + (i > 0 ? '_' + (i + 1) : '')
}

function makeStepLabel(cmd: Cmd): string | null {
  const a = cmd.action || '', nm = String(cmd.name || '')
  if (a === 'inject_script') return 'Create ' + (cmd.script_type || 'Script') + ': ' + (nm || '?')
  if (a === 'create_script') return 'Create Script: ' + nm
  if (a === 'create_local_script') return 'Create LocalScript: ' + nm
  if (a === 'create_module') return 'Create ModuleScript: ' + nm
  if (a === 'edit_script') return 'Edit Script: ' + nm
  if (a === 'read_script' || a === 'read_script_lines') return 'Read script: ' + nm
  if (a === 'rename_script') return 'Rename script: ' + nm + ' → ' + (cmd.new_name || '?')
  if (a === 'create_remote') return 'Create ' + (cmd.type || cmd.remote_type || 'RemoteEvent') + ': ' + nm
  if (a === 'set_property' || a === 'set_properties') return 'Set property: ' + nm + (cmd.property ? '.' + String(cmd.property) : '')
  if (a === 'delete' || a === 'delete_object') return 'Delete: ' + nm
  if (a === 'create_gui') return 'Create GUI: ' + nm
  if (a === 'create_frame') return 'Create Frame: ' + nm
  if (a === 'create_text_label') return 'Create TextLabel: ' + nm
  if (a === 'create_text_button') return 'Create TextButton: ' + nm
  if (a === 'create_text_box') return 'Create TextBox: ' + nm
  if (a === 'create_image_label') return 'Create ImageLabel: ' + nm
  if (a === 'create_image_button') return 'Create ImageButton: ' + nm
  if (a === 'create_ui_corner') return 'UICorner → ' + (String(cmd.parent || '') || nm)
  if (a === 'create_ui_padding') return 'UIPadding → ' + (String(cmd.parent || '') || nm)
  if (a === 'create_ui_gradient') return 'UIGradient → ' + (String(cmd.parent || '') || nm)
  if (a === 'create_ui_stroke') return 'UIStroke → ' + (String(cmd.parent || '') || nm)
  if (a === 'create_ui_list_layout') return 'UIListLayout → ' + (String(cmd.parent || '') || nm)
  if (a === 'create_ui_grid_layout') return 'UIGridLayout → ' + (String(cmd.parent || '') || nm)
  if (a === 'set_lighting') return 'Set lighting'
  if (a === 'create_part') return 'Create Part: ' + nm
  if (a === 'create_model') return 'Create Model: ' + nm
  if (a === 'create_npc') return 'Create NPC: ' + nm
  if (a === 'create_tool') return 'Create Tool: ' + nm
  if (a === 'scan_workspace' || a === 'request_scan') return 'Scan workspace'
  if (a === 'play_test' || a === 'run_test') return 'Start play test'
  if (a === 'stop_test') return 'Stop play test'
  if (a === 'batch_commands') return 'Batch (' + ((cmd.commands as unknown[] || []).length) + ' cmds)'
  if (a === 'none') return null
  return a + (nm ? ': ' + nm : '')
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 5 — FETCH HELPERS + AUTO INJECT PIPELINE
// ══════════════════════════════════════════════════════════════════════════════

async function fetchRetry(url: string, opts: RequestInit, tries = 3): Promise<Response | null> {
  const headers = opts.headers as Record<string, string>
  if (headers && url.indexOf('/api/control') !== -1) {
    headers['X-Nexus-Nonce'] = _csrfNonce
    if (isAdmin() || isOwner()) headers['X-Admin-Token'] = _adminToken || generateAdminToken()
  }
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), 12000)
      const mergedOpts = Object.assign({}, opts, { signal: ctrl.signal })
      const r = await fetch(url, mergedOpts)
      clearTimeout(tid)
      if (r.ok) return r
      if (r.status === 429) { toast(curLang === 'id' ? 'Rate limit server, tunggu...' : 'Server rate limit, waiting...', 'var(--yellow)'); await _sleep(_jitter(3000 * (i + 1))) }
      else if (r.status >= 500) { if (i < tries - 1) await _sleep(_jitter(1000 * (i + 1))); else return r }
      else return r
    } catch (e) {
      if (_isAbortError(e)) {
        const opts2 = opts as RequestInit & { signal?: AbortSignal }
        if (opts2.signal && opts2.signal.aborted) throw e
        if (i < tries - 1) { await _sleep(_jitter(800 * (i + 1))); continue }
        throw e
      }
      if (i === tries - 1) throw e
      await _sleep(_jitter(800 * (i + 1)))
    }
  }
  return null
}

async function safeFetch(bodyData: Record<string, unknown>, signal?: AbortSignal): Promise<Response | null> {
  try {
    let bd = bodyData
    if (bd.command && typeof (bd.command as Record<string, unknown>).source === 'string' && ((bd.command as Record<string, unknown>).source as string).length > 80000) {
      bd = { ...bd, command: { ...(bd.command as Record<string, unknown>), source: ((bd.command as Record<string, unknown>).source as string).slice(0, 80000) + '\n-- [TRUNCATED]' } }
    }
    const opts: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nexus-Nonce': _csrfNonce }, body: JSON.stringify(bd) }
    if (signal && !signal.aborted) opts.signal = signal
    return await fetch(API_URL, opts)
  } catch (e) {
    if (_isAbortError(e)) throw e
    console.warn('[NEXUS inject] safeFetch error:', (e as Error).message)
    return null
  }
}

async function safeFetchWithRetry(bodyData: Record<string, unknown>, signal?: AbortSignal, maxRetries = 2): Promise<Response | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal && signal.aborted) throw new Error('AbortError')
    try {
      const r = await safeFetch(bodyData, signal)
      if (r) return r
      if (attempt < maxRetries) { await _sleep(_jitter(1000 * (attempt + 1))); continue }
      return null
    } catch (e) {
      if (_isAbortError(e)) throw e
      if (attempt < maxRetries) { await _sleep(_jitter(1000 * (attempt + 1))); continue }
      throw e
    }
  }
  return null
}

async function _injectCommand(cmdToSend: Cmd, user: string, signal?: AbortSignal): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const r = await safeFetchWithRetry({ type: 'inject_command', command: cmdToSend, _user: user, _target_user: user }, signal, 2)
  if (!r) return { ok: false, error: 'No response (network error)' }
  let rd: { status?: string; pushed?: number; error?: string }
  try { rd = await r.json() } catch { rd = {} }
  if (r.ok && (rd.status === 'ok' || (rd.pushed || 0) > 0)) return { ok: true, data: rd }
  const errTxt = rd.error ? rd.error.slice(0, 120) : ('HTTP ' + r.status)
  return { ok: false, error: errTxt }
}

async function autoInjectToStudio(aiResponse: string, userPrompt: string): Promise<string[] | null> {
  if (!studioConnected) return null
  const t = T(), summary: string[] = [], user = (SESSION ? SESSION.user.username : '').toLowerCase()
  const jsonCmds = parseAllCommands(aiResponse)
  const luaBlocks = parseLuaBlocks(aiResponse)

  interface AllCmd {
    type: 'json' | 'lua' | 'playtest'
    cmd?: Cmd
    code?: string
    info?: { parent: string; type: string }
    name?: string
    sid?: number | null
  }

  const allCmds: AllCmd[] = []
  jsonCmds.forEach((cmd) => { if (!cmd.action || cmd.action === 'none') return; allCmds.push({ type: 'json', cmd }) })
  luaBlocks.forEach((code, i) => {
    const sanR = sanitizeLuaCode(code)
    if (!sanR.ok) { console.warn('[NEXUS] Lua block blocked:', sanR.reason); return }
    const info = detectScriptParent(sanR.code)
    const tm = sanR.code.match(/--\s*script_type:\s*(\w+)/i); if (tm) info.type = tm[1]
    const pm = sanR.code.match(/--\s*parent:\s*([\w.]+)/i); if (pm) info.parent = pm[1]
    const sName = makeScriptName(userPrompt, i, sanR.code)
    allCmds.push({ type: 'lua', code: sanR.code, info, name: sName })
  })

  if (!allCmds.length) { console.warn('[NEXUS inject] No commands found.'); return null }

  const hasPlayTest = jsonCmds.some((c) => c.action === 'play_test' || c.action === 'run_test')
  const hasStopTest = jsonCmds.some((c) => c.action === 'stop_test')
  if (S.playTestEnabled && !hasPlayTest && !hasStopTest) allCmds.push({ type: 'playtest' })

  const planSteps: (AllCmd & { sid: number | null })[] = []
  allCmds.forEach((item) => {
    let lbl: string | null, sub: string = ''
    if (item.type === 'json') {
      lbl = makeStepLabel(item.cmd!)
      if (!lbl) return
      sub = String(item.cmd!.parent || item.cmd!.theme || '')
    } else if (item.type === 'lua') {
      lbl = (curLang === 'id' ? 'Buat ' : 'Create ') + item.info!.type + ': ' + item.name
      sub = item.info!.parent
    } else { lbl = t.testRunning; sub = 'auto play_test' }
    const sid = lbl ? addStep(lbl, 'pending', sub, item.type === 'lua' ? { code: item.code!, name: item.name!, parent: item.info!.parent, type: item.info!.type } : undefined) : null
    planSteps.push({ ...item, sid })
  })

  const cntEl = document.getElementById('stepsCount')
  if (cntEl) cntEl.textContent = '(0/' + planSteps.length + ')'

  let doneCount = 0
  for (let pi = 0; pi < planSteps.length; pi++) {
    const step = planSteps[pi]
    if (!S.gen) { console.log('[NEXUS inject] Cancelled'); break }
    const sig = S.cancelCtrl ? S.cancelCtrl.signal : undefined
    if (sig && sig.aborted) break
    if (!step.sid) { doneCount++; continue }

    updateStep(step.sid, 'running')
    await _sleep(120)

    if (step.type === 'lua') {
      const cmdPayload: Cmd = { action: 'inject_script', name: step.name!, parent: step.info!.parent, script_type: step.info!.type, source: step.code! }
      const res = await _injectCommand(cmdPayload, user, sig)
      if (res.ok) { updateStep(step.sid, 'done', step.info!.type + ': ' + step.name, step.info!.parent); summary.push(step.info!.type + ': ' + step.name!); await _sleep(600) }
      else { updateStep(step.sid, 'error', String(res.error || 'inject failed').slice(0, 100)); await _sleep(400) }
    } else if (step.type === 'playtest') {
      try {
        await safeFetchWithRetry({ type: 'batch_commands', commands: [{ action: 'play_test', duration: S.playTestDuration }], _user: user, _target_user: user }, sig, 1)
        await _sleep(5000); updateStep(step.sid, 'done', t.testDone)
      } catch (e) {
        if (_isAbortError(e)) return null
        updateStep(step.sid, 'error', String((e as Error).message || '').slice(0, 80))
      }
    } else {
      const cmd = step.cmd!, a = cmd.action || ''
      const cmdToSend: Cmd = { ...cmd }
      if (cmdToSend.code && !cmdToSend.source) { cmdToSend.source = cmdToSend.code; delete cmdToSend.code }
      const res2 = await _injectCommand(cmdToSend, user, sig)
      if (res2.ok) {
        if (a === 'play_test' || a === 'run_test') { updateStep(step.sid, 'running', t.testRunning); _playTestActive = true }
        else if (a === 'stop_test') { updateStep(step.sid, 'done'); _playTestActive = false }
        else if (a === 'read_script' || a === 'scan_workspace' || a === 'request_scan') { updateStep(step.sid, 'info'); await _sleep(300) }
        else {
          updateStep(step.sid, 'done')
          const lbl2 = makeStepLabel(cmd); if (lbl2) summary.push(lbl2)
          let _postDelay = 400
          if (a === 'set_property' || a === 'set_properties' || a === 'batch_set_property' || a === 'set_service_property') _postDelay = 900
          else if (['create_gui','create_frame','create_scrolling_frame','create_canvas_group','create_script','create_local_script','create_module','inject_script','create_text_label','create_text_button','create_text_box','create_image_label','create_image_button','create_remote','create_folder','create_instance'].includes(a)) _postDelay = 750
          else if (['create_ui_corner','create_ui_padding','create_ui_gradient','create_ui_stroke','create_ui_list_layout','create_ui_grid_layout','create_ui_size_constraint','create_ui_aspect_ratio','create_ui_scale'].includes(a)) _postDelay = 600
          await _sleep(_postDelay)
        }
      } else { updateStep(step.sid, 'error', String(res2.error || 'rejected').slice(0, 100)); await _sleep(400) }
    }

    doneCount++
    if (cntEl) cntEl.textContent = '(' + doneCount + '/' + planSteps.length + ')'
  }

  return summary.length > 0 ? summary : null
}

// ── SYSTEM PROMPT ──────────────────────────────────────────────────────────
let _sysPromptReady = true
let _sysPromptLoadPromise: Promise<void> | null = null

function _fallbackBuildSysPrompt(): string { return '' }

function _loadSysPromptScript(): Promise<void> {
  if (_sysPromptLoadPromise) return _sysPromptLoadPromise
  _sysPromptLoadPromise = new Promise<void>((resolve) => {
    _sysPromptReady = true; resolve()
  })
  return _sysPromptLoadPromise
}

function buildApiMsgs(): { role: string; content: string | unknown[] }[] {
  const cv = S.convs.find((x) => x.id === S.curConv)
  if (!cv) return []
  return (cv.msgs || []).slice(-28).map((m) => {
    const content = (m as ConvMsg & { _rawContent?: string })._rawContent || m.content || ''
    if (Array.isArray(m.content)) return { role: m.role === 'user' ? 'user' : 'model', content: m.content }
    return { role: m.role === 'user' ? 'user' : 'model', content: String(content) }
  })
}

function detectType(txt: string): string {
  if (/error|fix|bug|debug|broken|crash|not work|tidak bisa|gagal/i.test(txt)) return 'debug'
  if (/gui|hud|menu|shop|loading|inventory|screen|frame|button/i.test(txt)) return 'gui'
  if (/read|baca|lihat|cek|check script/i.test(txt)) return 'read'
  if (/edit|ubah|ganti|update|tambah ke/i.test(txt) && /script/i.test(txt)) return 'edit'
  if (/test|play|jalankan|run/i.test(txt)) return 'test'
  return 'normal'
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 6 — SEND FUNCTION
// ══════════════════════════════════════════════════════════════════════════════

function _resetGenState(): void {
  if (S.cancelCtrl) { try { S.cancelCtrl.abort() } catch { } S.cancelCtrl = null }
  S.gen = false; _playTestActive = false
  removeStepsCard()
  const sb = document.getElementById('sendBtn'), cb = document.getElementById('cancelBtn')
  if (sb) sb.classList.remove('hidden')
  if (cb) cb.classList.add('hidden')
}

function cancelGen(): void {
  _resetGenState(); toast(T().cancelToast, 'var(--yellow)')
}

async function callAiApi(body: Record<string, unknown>, abortSignal?: AbortSignal): Promise<{ ok: boolean; data?: { content: string }; error?: string; timeout?: boolean; status?: number }> {
  const MAX_RETRIES = 3
  const RETRY_DELAYS = [2000, 5000, 10000]

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (abortSignal && abortSignal.aborted) throw new Error('AbortError')

    const aiCtrl = new AbortController()
    const aiTimeoutId = setTimeout(() => aiCtrl.abort(), 90000)
    const _onUserCancel = () => { try { aiCtrl.abort() } catch { } }
    if (abortSignal && !abortSignal.aborted) abortSignal.addEventListener('abort', _onUserCancel, { once: true })

    try {
      const response = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: aiCtrl.signal,
      })
      clearTimeout(aiTimeoutId)
      if (abortSignal) { try { abortSignal.removeEventListener('abort', _onUserCancel) } catch { } }

      if (response.ok) {
        const rd = await response.json() as { content: string }
        if (!validateApiResponse(rd)) throw new Error('Invalid API response structure')
        return { ok: true, data: rd }
      }

      let errData: { error?: string; message?: string } = {}
      try { errData = await response.json() } catch { }
      const errMsg = errData.error || errData.message || ('API error ' + response.status)
      const isBusy = response.status === 503 || response.status === 429 ||
        (typeof errMsg === 'string' && /overloaded|busy|rate.limit|quota|capacity/i.test(errMsg))

      if (isBusy && attempt < MAX_RETRIES) {
        const waitMs = RETRY_DELAYS[attempt] || 5000
        if (attempt === 0) toast(curLang === 'id' ? 'Model sibuk, mencoba ulang...' : 'Model busy, retrying...', 'var(--yellow)', waitMs)
        const stepsTxt = document.getElementById('stepsTxt')
        if (stepsTxt) stepsTxt.textContent = T().retrying + ' (' + (attempt + 1) + '/' + MAX_RETRIES + ')'
        await _sleep(waitMs); continue
      }
      return { ok: false, error: String(errMsg), status: response.status }
    } catch (e) {
      clearTimeout(aiTimeoutId)
      if (abortSignal) { try { abortSignal.removeEventListener('abort', _onUserCancel) } catch { } }
      if (_isAbortError(e)) {
        if (abortSignal && abortSignal.aborted) throw e
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
  let totalChars = 0
  const result: typeof msgs = []
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')
    totalChars += content.length
    if (totalChars > maxChars && result.length > 2) break
    result.unshift(m)
  }
  if (result.length === 1 && typeof result[0].content === 'string' && result[0].content.length > maxChars) {
    result[0] = { ...result[0], content: result[0].content.slice(0, maxChars) + '\n[... truncated]' }
  }
  return result
}

async function send(): Promise<void> {
  if (S.gen) return
  const inp = document.getElementById('inp') as HTMLTextAreaElement | null
  const txt = (inp ? inp.value.trim() : '')
  const attachments = S.attachments.slice()
  if (!txt && !attachments.length) return

  const t = T()
  if (!checkClientRateLimit('send', 20)) return

  if (!isOwner() && !isAdmin()) {
    const _mc = S.model.cost || 0
    if (_mc > 0 && S.credits <= 0) { toast(t.creditsExhausted, 'var(--pink)'); return }
    if (_mc > 0 && S.credits < _mc) {
      toast((curLang === 'id' ? 'Butuh minimal ' : 'Need at least ') + _mc + ' CR untuk model ini', 'var(--yellow)'); return
    }
  }

  if (!S.curConv) newChat()
  let cv = S.convs.find((x) => x.id === S.curConv)
  if (!cv) { newChat(); cv = S.convs.find((x) => x.id === S.curConv); if (!cv) { toast('Error: conversation not found', 'var(--pink)'); return } }

  S.gen = true
  if (S.cancelCtrl) { try { S.cancelCtrl.abort() } catch { } }
  S.cancelCtrl = new AbortController()
  _playTestActive = false

  const sb = document.getElementById('sendBtn'), cb = document.getElementById('cancelBtn')
  if (sb) sb.classList.add('hidden')
  if (cb) cb.classList.remove('hidden')

  if (inp) { inp.value = ''; inp.style.height = 'auto' }
  delete S.draftText[S.curConv!]

  const userMsg: ConvMsg = { role: 'user', content: txt, time: Date.now() }
  if (attachments.length) userMsg.attachments = attachments
  cv.msgs = cv.msgs || []
  cv.msgs.push(userMsg)
  appendMsg(userMsg)

  const lastPrompt = txt
  S.attachments = []
  renderAttachRow()
  if (cv.msgs.length === 1) setConvTitle(S.curConv!, txt)
  hideMentionDD()

  const showThinking = !isPureGreeting(txt)
  if (showThinking) {
    createStepsCard()
    const rtype = detectType(txt)
    if (rtype === 'debug') {
      addStep(t.readingScript, 'running'); await _sleep(600); updateStep(1, 'done')
      addStep(t.analyzingError, 'running'); await _sleep(400); updateStep(2, 'done')
      addStep(t.designingFix, 'running')
    } else if (rtype === 'gui') {
      addStep(t.designingUI, 'running'); await _sleep(400); updateStep(1, 'done')
      addStep(t.buildingComponents, 'running')
    } else if (rtype === 'read') { addStep(t.readingScript, 'running')
    } else if (rtype === 'edit') { addStep(t.preparingEdit, 'running')
    } else if (rtype === 'test') { addStep(t.preparingTest, 'running')
    } else {
      addStep(t.analyzingReq, 'running'); await _sleep(400); updateStep(1, 'done')
      addStep(t.designingSolution, 'running')
    }
  }

  if (!S.gen || (S.cancelCtrl && S.cancelCtrl.signal.aborted)) { _resetGenState(); return }

  let msgs = buildApiMsgs()
  if (!_sysPromptReady) await _loadSysPromptScript()
  let sysPrompt = buildSysPrompt({
    session: SESSION ? {
      user: {
        username: SESSION.user.username,
        displayName: SESSION.user.username,
      }
    } : null,
    settings: {
      credits: S.credits,
      plan: S.plan,
      currentProjectName: S.currentProjectName,
      playTestEnabled: S.playTestEnabled,
      playTestDuration: S.playTestDuration,
    },
    studioConnected: studioConnected,
    isOwnerFn: isOwner,
    isAdminFn: isAdmin,
  })

  if (_shouldSearchDocs(txt) && sysPrompt) {
    try {
      const _docsResult = await searchRobloxDocs(txt, 5)
      if (_docsResult) { const _docsCtx = _buildDocsContext(_docsResult); if (_docsCtx) sysPrompt = sysPrompt + '\n\n' + _docsCtx }
    } catch { }
  }

  const SYS_CAP = 7500
  let apiMsgs = msgs.slice(0, -1)
  let sysMain = sysPrompt, sysOverflow = ''
  if (sysPrompt && sysPrompt.length > SYS_CAP) {
    sysMain = sysPrompt.slice(0, SYS_CAP); sysOverflow = sysPrompt.slice(SYS_CAP)
    const breakAt = sysMain.lastIndexOf('\n')
    if (breakAt > SYS_CAP * 0.8) { sysOverflow = sysMain.slice(breakAt) + sysOverflow; sysMain = sysMain.slice(0, breakAt) }
  }
  if (sysOverflow && sysOverflow.trim().length > 10) {
    apiMsgs = [
      { role: 'user', content: '[SYSTEM CONTEXT CONTINUED]\n' + sysOverflow },
      { role: 'assistant', content: 'Understood.' },
      ...apiMsgs,
    ]
  }

  interface ApiMsg { role: string; content: string | unknown[] }
  const lastM: ApiMsg = { role: 'user', content: txt }
  if (attachments.length) {
    const ca: unknown[] = [{ type: 'text', text: txt }]
    attachments.forEach((a) => {
      if (a.type === 'image') ca.push({ type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } })
    })
    lastM.content = ca
  }
  apiMsgs.push(lastM)
  apiMsgs = _truncateMsgsForApi(apiMsgs, 55000)

  let aiText = '', _localCancelSignal = S.cancelCtrl ? S.cancelCtrl.signal : undefined

  const apiBody = { provider: S.model.prov || 'gemini', model: S.model.id, messages: apiMsgs, system: sysMain, max_tokens: 65536 }
  const aiResult = await callAiApi(apiBody, _localCancelSignal)

  if (!S.gen || (_localCancelSignal && _localCancelSignal.aborted)) { _resetGenState(); return }

  if (!aiResult.ok) {
    if (aiResult.error && _isAbortError({ name: 'AbortError', message: aiResult.error })) { _resetGenState(); return }
    let errMsg = aiResult.error || 'Unknown error'
    if (aiResult.timeout) errMsg = curLang === 'id' ? 'Request timeout. Coba pesan lebih pendek.' : 'Request timeout. Try a shorter message.'
    else if (/overloaded|busy|503|429/i.test(String(errMsg))) errMsg = curLang === 'id' ? 'Model sedang sangat sibuk. Tunggu beberapa menit atau ganti model.' : 'Model is very busy. Wait a few minutes or switch model.'
    aiText = '**' + t.errorPrefix + '**\n\n' + errMsg + '\n\n' + (curLang === 'id' ? 'Saran: coba model lain.' : 'Suggestion: try another model.')
  } else {
    aiText = aiResult.data!.content || ''
  }

  const hasError = aiText && (aiText.startsWith('**Gagal') || aiText.startsWith('**Failed'))

  if (!isOwner() && !isAdmin() && aiText && !hasError) {
    const _baseCost = S.model.cost || 0
    let _totalCost = 0
    if (_baseCost > 0) {
      if (isPureGreeting(lastPrompt)) { _totalCost = 1 }
      else {
        const _numActions = parseAllCommands(aiText).length + parseLuaBlocks(aiText).length
        _totalCost = _numActions === 0 ? _baseCost : parseFloat((_baseCost + Math.max(0, _numActions - 1) * 0.5).toFixed(2))
      }
    }
    if (_totalCost > 0) { S.credits = parseFloat(Math.max(0, S.credits - _totalCost).toFixed(2)); updateCreds() }
  }

  let studioSummary: string[] | null = null, displayText = ''

  if (studioConnected && !hasError) {
    const _preCmds = parseAllCommands(aiText), _preLuas = parseLuaBlocks(aiText)
    const _hasAnything = _preCmds.length > 0 || _preLuas.length > 0

    if (_hasAnything) {
      const _totalActions = _preCmds.length + _preLuas.length
      if (showThinking) {
        clearSteps()
        const _injectSummaryStep = addStep(
          (curLang === 'id' ? 'Mengirim ' + _totalActions + ' action ke Studio...' : 'Sending ' + _totalActions + ' action(s) to Studio...'),
          'running', curLang === 'id' ? 'Satu per satu, tunggu sebentar' : 'One by one, please wait'
        )
        setStepTitle(t.buildingInStudio)
        await _sleep(200)
        if (_injectSummaryStep) updateStep(_injectSummaryStep, 'done')
      }
      studioSummary = await autoInjectToStudio(aiText, lastPrompt)
      if (!S.gen || (_localCancelSignal && _localCancelSignal.aborted)) {
        _resetGenState()
        const cancelMsg: ConvMsg = { role: 'ai', content: curLang === 'id' ? 'Proses dibatalkan.' : 'Process cancelled.', time: Date.now() }
        cv.msgs.push(cancelMsg); appendMsg(cancelMsg); saveS(); return
      }
    } else {
      if (showThinking) { finalizeSteps(); await _sleep(300); removeStepsCard() }
      displayText = cleanAIResponse(aiText) + '\n\n> ⚠️ ' + (curLang === 'id' ? 'Tidak ada script/command yang dideteksi.' : 'No scripts/commands detected.')
      const aiMsg0: ConvMsg & { _rawContent: string } = { role: 'ai', content: displayText, time: Date.now(), _rawContent: aiText }
      cv.msgs.push(aiMsg0); appendMsg(aiMsg0); _resetGenState(); saveS(); return
    }

    displayText = stripAllCode(aiText)
    if (!displayText || displayText.length < 20) {
      if (studioSummary && studioSummary.length > 0) {
        displayText = (curLang === 'id' ? 'Berhasil diinjeksi ke Studio:\n' : 'Successfully injected to Studio:\n') + studioSummary.map((s) => '• ' + s).join('\n')
      } else {
        displayText = curLang === 'id' ? 'Proses inject selesai. Cek Explorer di Studio.' : 'Inject complete. Check Explorer in Studio.'
      }
    }

    if (!_playTestActive) { if (showThinking) { finalizeSteps(); await _sleep(400); removeStepsCard() } }
    else { const cd = document.getElementById('stepsCancel'); if (cd) cd.remove() }
  } else {
    displayText = cleanAIResponse(aiText)
    if (showThinking) { finalizeSteps(); await _sleep(300); removeStepsCard() }
  }

  cv = S.convs.find((x) => x.id === S.curConv)
  if (!cv) { _resetGenState(); saveS(); return }

  const aiMsg: ConvMsg & { _rawContent: string; studioSummary?: string[] } = { role: 'ai', content: displayText, time: Date.now(), _rawContent: aiText }
  if (studioSummary) aiMsg.studioSummary = studioSummary
  cv.msgs.push(aiMsg); appendMsg(aiMsg)
  _resetGenState(); saveS()
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 7 — CONVERSATIONS, RENDER MESSAGES, STEPS CARD, MENTION, MODEL UI
// ══════════════════════════════════════════════════════════════════════════════

function renderSuggestions(): void {
  const t = T()
  const grid = document.getElementById('suggGrid')
  if (!grid) return
  grid.innerHTML = t.suggs.map((s) =>
    `<div class="sugg" onclick="window.useSugg(this.dataset.q)" data-q="${esc(s.q)}">` +
    `<div class="sugg-title"><svg viewBox="0 0 24 24">${s.icon}</svg>${esc(s.title)}</div>${esc(s.body)}</div>`
  ).join('')
}

function applyLang(): void {
  const t = T()
  function s(id: string, v: string) { const e = document.getElementById(id); if (e) e.textContent = v }
  function sh(id: string, v: string) { const e = document.getElementById(id); if (e) e.innerHTML = v }
  const sa = (id: string, a: string, v: string) => {
    const e = document.getElementById(id)
    if (e) (e as HTMLElement & Record<string, unknown>)[a] = v
  }
  sa('inp', 'placeholder', t.placeholder)
  s('newChatLbl', t.newchat); s('recentLbl', t.recent); s('dashLbl', t.dash)
  s('welcomeText', t.welcomeText); s('chatTitle', t.chatTitle)
  s('plugBannerTxt', studioConnected ? t.connected : t.disconnected)
  s('plugInstallLink', t.installLink); s('plugReconnectLink', t.reconnectLink)
  s('helpBtnText', t.helpBtn); s('inboxBtnText', t.inboxBtn)
  s('credLabel', t.creditsLabel); s('credHint', t.credHint); s('noConvLbl', t.noConv)
  s('settingsTitle', t.settingsTitle); s('settingsAccountTitle', t.accountTitle)
  s('settingsCreditsLabel', t.creditsLabel); s('settingsPlanLabel', t.planLabel)
  s('settingsRobloxIdLabel', t.robloxIdLabel); s('dailyCreditsTitle', t.dailyTitle)
  s('freePlanLabel', t.freePlan); s('proPlanLabel', t.proPlan)
  s('playTestTitle', t.playTestTitle); s('playTestLabel', t.playTestLabel)
  s('playTestHint', t.playTestHint); s('playTestDurLabel', t.playTestDurLabel)
  s('langTitle', t.langTitle); s('langLabel', t.langLabel)
  s('reportTitle', t.reportTitle); s('reportBtn', t.reportBtn)
  s('redeemTitle', t.redeemTitle); sh('redeemHint', t.redeemHint)
  s('downloadTitle', t.downloadTitle); s('downloadHint', t.downloadHint)
  s('downloadPluginBtn', t.downloadPluginBtn); s('logoutLabel', t.logoutLabel)
  s('settingsCloseBtn', t.close); s('avatarCloseBtn', t.avatarClose)
  s('installTitle', t.installTitle); s('installCloseBtn', t.installClose)
  const steps = document.querySelectorAll('.install-txt')
  t.installSteps.forEach((txt, i) => { const el = steps[i] as HTMLElement | undefined; if (el) el.innerHTML = txt })
  s('guiAddLabel', t.guiAddLabel); s('guiEmptyText', t.guiEmptyText)
  s('guiLoadingText', t.guiLoadingText); s('guiToPlaceText', t.guiToPlaceText)
  s('guiAiBuildLbl', t.guiAiBuild); s('guiClearLbl', t.guiClear); s('guiExportLbl', t.guiExport)
  s('guiCodeTitle', t.guiCodeTitle); s('guiCodeCopyBtn', t.copy); s('guiCodeDlBtn', t.download)
  s('guiCodeCloseBtn', t.close); s('guiAiTitle', t.guiAiTitle); s('guiAiDesc', t.guiAiDesc)
  s('guiAiBuildBtn', t.guiAiBuildBtn); s('guiAiCancelBtn', t.guiAiCancel)
  s('guiPropsEmpty', t.guiPropsEmpty); s('guiLayerTitle', t.guiLayerTitle)
  s('tabChatLbl', t.tabChat); s('tabGuiLbl', t.tabGui)
  s('shareModalTitle', t.shareModalTitle); s('shareModalDesc', t.shareModalDesc)
  s('shareModalCopyBtn', t.shareModalCopy); s('shareModalCloseBtn', t.shareClose)
  const mhdr = document.getElementById('mentionHdrTxt')
  if (mhdr) mhdr.textContent = curLang === 'id' ? 'Scripts & Objek di Place' : 'Scripts & Objects in Place'
  const aiP = document.getElementById('guiAIPrompt') as HTMLTextAreaElement | null
  if (aiP) aiP.placeholder = curLang === 'id' ? 'contoh: Shop GUI 3 item, scroll list, tombol beli...' : 'e.g. Shop GUI with 3 items, scroll list, buy button...'
  setStudioStatus(studioConnected)
  updateModelUI()
  renderConvs()
  updatePlayTestUI()
  renderSuggestions()
  document.documentElement.lang = curLang
}

function changeLang(l: string): void { curLang = l; localStorage.setItem('nexus_lang', l); applyLang() }

// ── CONVERSATIONS ─────────────────────────────────────────────────────────────
function renderConvs(): void {
  const t = T()
  const list = document.getElementById('convList')
  if (!list) return
  if (!S.convs || !S.convs.length) { list.innerHTML = `<div class="conv-empty">${t.noConv}</div>`; return }
  list.innerHTML = S.convs.slice().reverse().map((cv) => {
    const act = cv.id === S.curConv ? 'act' : ''
    const time = cv.time ? new Date(cv.time).toLocaleDateString(curLang === 'id' ? 'id-ID' : 'en-US', { day: '2-digit', month: '2-digit' }) : ''
    return `<div class="ci ${act}" onclick="window.loadConv('${cv.id}')">` +
      `<div class="ci-title">${esc(cv.title || (curLang === 'id' ? 'Percakapan' : 'Chat'))}</div>` +
      `<div class="ci-time">${time}</div>` +
      `<button class="ci-del" onclick="window.delConv(event,'${cv.id}')" title="Delete">x</button></div>`
  }).join('')
}

function newChat(): void {
  if (S.gen) _resetGenState()
  const id = 'c' + Date.now()
  const cv: Conv = { id, title: curLang === 'id' ? 'Percakapan Baru' : 'New Chat', time: Date.now(), msgs: [], projectId: S.currentProjectId }
  S.curConv = id
  if (!S.convs) S.convs = []
  S.convs.push(cv)
  renderConvs(); renderMsgs([])
  const ti = document.getElementById('chatTitle')
  if (ti) ti.textContent = S.currentProjectName ? T().projectLabel + ': ' + S.currentProjectName : T().chatTitle
  const w = document.getElementById('welcome'); if (w) w.style.display = 'flex'
  const inp = document.getElementById('inp') as HTMLTextAreaElement | null
  if (inp) { inp.value = ''; inp.style.height = 'auto' }
  S.attachments = []; renderAttachRow(); saveS()
}

function loadConv(id: string): void {
  if (S.gen && S.curConv !== id) _resetGenState()
  const cv = S.convs.find((x) => x.id === id); if (!cv) return
  S.curConv = id; renderConvs()
  const ti = document.getElementById('chatTitle'); if (ti) ti.textContent = cv.title || (curLang === 'id' ? 'Percakapan' : 'Chat')
  const w = document.getElementById('welcome'); if (w) w.style.display = (cv.msgs && cv.msgs.length) ? 'none' : 'flex'
  renderMsgs(cv.msgs || [])
  S.attachments = []; renderAttachRow()
  const inp = document.getElementById('inp') as HTMLTextAreaElement | null
  if (inp) {
    inp.value = S.draftText[id] || ''; inp.style.height = 'auto'
    if (inp.value) inp.style.height = Math.min(inp.scrollHeight, 130) + 'px'
  }
}

function delConv(e: Event, id: string): void {
  e.stopPropagation()
  S.convs = S.convs.filter((x) => x.id !== id)
  if (S.curConv === id) { if (S.convs.length) loadConv(S.convs[S.convs.length - 1].id); else newChat() }
  renderConvs(); saveS()
}

function saveDraft(): void {
  if (!S.curConv) return
  const inp = document.getElementById('inp') as HTMLTextAreaElement | null
  if (inp && inp.value.trim()) S.draftText[S.curConv] = inp.value
  else delete S.draftText[S.curConv]
}

function setConvTitle(convId: string, firstMsg: string): void {
  const cv = S.convs.find((x) => x.id === convId); if (!cv) return
  cv.title = firstMsg.slice(0, 45) + (firstMsg.length > 45 ? '..' : '')
  const ti = document.getElementById('chatTitle'); if (ti) ti.textContent = cv.title
  renderConvs()
}

function getProjectIdFromUrl(): string | null {
  const p = new URLSearchParams(window.location.search)
  const id = p.get('id'); if (id) return id
  const pts = window.location.pathname.split('/')
  const ci = pts.indexOf('chats')
  if (ci !== -1 && pts[ci + 1]) return pts[ci + 1]
  return null
}

function getProjectName(pid: string): string | null {
  if (!pid) return null
  const projs = S.projects || (SESSION && SESSION.data && SESSION.data.projects as AppState['projects']) || []
  const p = projs.find((x) => x.id === pid); return p ? p.name : null
}

function updateProjectUI(): void {
  const n = S.currentProjectName
  const chip = document.getElementById('sbProjChip'), cn = document.getElementById('sbProjName'), badge = document.getElementById('hdrProjBadge')
  if (n) {
    if (chip) { chip.style.display = ''; if (cn) cn.textContent = n }
    if (badge) { badge.style.display = ''; badge.textContent = n }
  } else {
    if (chip) chip.style.display = 'none'
    if (badge) badge.style.display = 'none'
  }
}

// ── MODEL UI ──────────────────────────────────────────────────────────────────
function getFreeModel(): ModelEntry {
  for (let i = 0; i < MODEL_LIST.length; i++) { if (MODEL_LIST[i].id && !MODEL_LIST[i].grp) return MODEL_LIST[i] }
  return { id: 'gemini-3.1-flash-lite', prov: 'gemini', cost: 0, label: 'Gemini 3.1 Flash Lite' }
}

function updateModelUI(): void {
  const m = S.model || getFreeModel()
  const el = document.getElementById('inpMName'); if (el) el.textContent = m.label || m.id || ''
  const b = document.getElementById('inpMBadge')
  if (b) {
    b.textContent = (m.cost || 0) <= 0 ? 'FREE' : m.cost + ' CR'
    b.style.color = (m.cost || 0) <= 0 ? 'var(--green)' : (m.cost || 0) <= 1 ? 'var(--cyan)' : (m.cost || 0) <= 3 ? 'var(--yellow)' : 'var(--pink)'
  }
  const ic = document.getElementById('inpMIcon') as HTMLImageElement | null
  if (ic) { ic.src = m.icon || ''; ic.style.display = m.icon ? '' : 'none' }

  const gm = S.guiModel || getFreeModel()
  const gel = document.getElementById('guiMName'); if (gel) gel.textContent = gm.label || gm.id || ''
  const gb = document.getElementById('guiMBadge')
  if (gb) {
    gb.textContent = (gm.cost || 0) <= 0 ? 'FREE' : gm.cost + ' CR'
    gb.style.color = (gm.cost || 0) <= 0 ? 'var(--green)' : 'var(--cyan)'
  }
  const gi = document.getElementById('guiMIcon') as HTMLImageElement | null
  if (gi) { gi.src = gm.icon || ''; gi.style.display = gm.icon ? '' : 'none' }
}

function buildMDDHtml(forGui: boolean): string {
  const curId = forGui ? S.guiModel.id : S.model.id
  let html = ''
  MODEL_LIST.forEach((m) => {
    if (m.grp) { html += `<div class="mg">${esc(m.grp)}</div>`; return }
    const act = m.id === curId
    const bc = (m.cost || 0) <= 0 ? 'f' : m.badge === 'BEST' ? 'p' : 's'
    const iconHtml = m.icon
      ? `<img src="${m.icon}" onerror="this.style.display='none'" style="width:18px;height:18px;object-fit:contain;border-radius:3px;">`
      : `<div style="width:18px;height:18px;border-radius:3px;background:rgba(0,229,255,.1);font-size:9px;display:flex;align-items:center;justify-content:center;color:var(--cyan);">AI</div>`
    html += `<div class="mo${act ? ' act' : ''}" onclick="window.selModel('${m.id}',${forGui})">` +
      `<div class="mo-icon">${iconHtml}</div>` +
      `<div><div class="mo-n">${esc(m.label || m.id || '')}</div><div class="mo-s">${(m.cost || 0) <= 0 ? 'Free' : m.cost + ' CR/msg'}</div></div>` +
      `<span class="mb-badge ${bc}">${m.badge || (m.cost + ' CR')}</span></div>`
  })
  return html
}

function toggleMDD(e: Event): void {
  e.stopPropagation()
  const dd = document.getElementById('mDD'); if (!dd) return
  dd.innerHTML = buildMDDHtml(false)
  const btn = document.getElementById('inpModelBtn')
  if (btn) {
    const r = btn.getBoundingClientRect()
    dd.style.bottom = (window.innerHeight - r.top + 4) + 'px'
    dd.style.left = r.left + 'px'; dd.style.right = 'auto'
  }
  dd.classList.toggle('open')
}

function toggleGuiMDD(e: Event): void {
  e.stopPropagation()
  const dd = document.getElementById('guiMDD'); if (!dd) return
  dd.innerHTML = buildMDDHtml(true)
  const btn = document.getElementById('guiModelBtn')
  if (btn) {
    const r = btn.getBoundingClientRect()
    dd.style.top = r.bottom + 'px'; dd.style.left = r.left + 'px'
  }
  dd.classList.toggle('open')
}

function selModel(id: string, forGui: boolean): void {
  const m = MODEL_LIST.find((x) => x.id === id); if (!m || m.grp) return
  if (forGui) S.guiModel = m; else S.model = m
  updateModelUI()
  const dd = document.getElementById(forGui ? 'guiMDD' : 'mDD'); if (dd) dd.classList.remove('open')
  saveS()
}

// ── SUGGESTION CHIPS ──────────────────────────────────────────────────────────
function _injectSuggChipStyles(): void {
  if (document.getElementById('nx-chip-styles')) return
  const s = document.createElement('style')
  s.id = 'nx-chip-styles'
  s.textContent =
    '.suggestion-chips{display:flex;flex-direction:column;gap:5px;margin-top:10px;margin-bottom:2px;}' +
    '.suggestion-chip{display:flex;align-items:center;gap:8px;padding:7px 12px 7px 10px;background:rgba(0,229,255,.05);border:1px solid rgba(0,229,255,.16);border-radius:8px;color:var(--fg,#b8cfff);font-size:11.5px;cursor:pointer;text-align:left;transition:background .14s,border-color .14s,color .14s,transform .1s;font-family:inherit;width:fit-content;max-width:100%;line-height:1.4;}' +
    '.suggestion-chip::before{content:"";display:inline-flex;width:0;height:0;border-top:4.5px solid transparent;border-bottom:4.5px solid transparent;border-left:7px solid var(--cyan,#00e5ff);flex-shrink:0;opacity:.55;transition:opacity .14s,transform .14s;}' +
    '.suggestion-chip:hover{background:rgba(0,229,255,.12);border-color:rgba(0,229,255,.38);color:var(--cyan,#00e5ff);}' +
    '.suggestion-chip:hover::before{opacity:1;transform:translateX(2px);}' +
    '.suggestion-chip:active{transform:scale(.97);}' +
    '.suggestion-chip.sending{opacity:.5;pointer-events:none;}' +
    '.steps-hdr{display:flex;align-items:center;gap:5px;flex-wrap:nowrap;}' +
    '#stepsToggle:hover{opacity:1 !important;}' +
    '.sum-toggle-btn:hover{opacity:1 !important;text-decoration:underline;}' +
    '.studio-summary-items{transition:all .2s ease;}'
  document.head.appendChild(s)
}

function _processSuggestionChips(bubble: HTMLElement): void {
  if (!bubble) return
  const uls = bubble.querySelectorAll('ul')
  if (!uls.length) return
  uls.forEach((ul) => {
    if (ul.getAttribute('data-chips-done')) return
    const liEls = ul.querySelectorAll('li')
    const count = liEls.length
    if (count < 2 || count > 12) return
    const allShort = Array.from(liEls).every((li) => li.textContent!.trim().length <= 100 && li.querySelectorAll('ul,ol,p,pre').length === 0)
    if (!allShort) return
    const wrap = document.createElement('div')
    wrap.className = 'suggestion-chips'
    Array.from(liEls).forEach((li) => {
      const text = li.textContent!.trim(); if (!text) return
      const btn = document.createElement('button')
      btn.className = 'suggestion-chip'; btn.textContent = text
      btn.title = curLang === 'id' ? 'Klik untuk tanya ini' : 'Click to ask this'
      btn.onclick = () => {
        if (S.gen) return
        btn.classList.add('sending')
        const inp = document.getElementById('inp') as HTMLTextAreaElement | null
        if (inp) { inp.value = text; inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 130) + 'px'; inp.focus() }
        setTimeout(() => send(), 80)
      }
      wrap.appendChild(btn)
    })
    if (wrap.children.length >= 2) {
      ul.parentNode!.insertBefore(wrap, ul.nextSibling); ul.style.display = 'none'; ul.setAttribute('data-chips-done', '1')
    }
  })
}

// ── RENDER MESSAGES ───────────────────────────────────────────────────────────
function renderMsgs(msgs: ConvMsg[]): void {
  const c = document.getElementById('msgs'); if (!c) return
  const w = document.getElementById('welcome')
  if (!msgs || !msgs.length) {
    if (w) w.style.display = 'flex'
    c.querySelectorAll('.msg,.steps-wrap').forEach((el) => el.remove()); return
  }
  if (w) w.style.display = 'none'
  c.querySelectorAll('.msg,.steps-wrap').forEach((el) => el.remove())
  msgs.forEach((m) => appendMsg(m, true))
  c.scrollTop = c.scrollHeight
}

function mkAv(role: string): HTMLElement {
  const av = document.createElement('div'); av.className = 'av'
  const setFallback = (container: HTMLElement, letter: string) => {
    container.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--cyan);background:rgba(0,229,255,.1);border-radius:50%;'
    container.textContent = letter || '?'
  }
  if (role === 'ai') {
    const img = document.createElement('img'); img.src = '/images/nexusai.png'; img.alt = 'N'
    img.onerror = () => {
      av.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--cyan);background:linear-gradient(135deg,rgba(0,229,255,.2),rgba(136,0,255,.2));border-radius:50%;'
      if (img.parentNode === av) av.removeChild(img); av.textContent = 'N'
    }
    av.appendChild(img)
  } else if (SESSION && SESSION.user && SESSION.user.avatar) {
    const img2 = document.createElement('img'); img2.src = SESSION.user.avatar; img2.alt = 'U'
    const fb = (SESSION.user.username || 'U').charAt(0).toUpperCase()
    img2.onerror = () => { if (img2.parentNode === av) av.removeChild(img2); setFallback(av, fb) }
    av.appendChild(img2)
  } else {
    setFallback(av, (SESSION && SESSION.user && SESSION.user.username || 'U').charAt(0).toUpperCase())
  }
  return av
}

function getLangLabel(lang: string): string {
  const map: Record<string, string> = { lua: 'Lua', luau: 'Luau', js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', python: 'Python', py: 'Python', html: 'HTML', css: 'CSS', json: 'JSON', bash: 'Bash', sh: 'Shell' }
  return map[(lang || '').toLowerCase()] || lang || 'Code'
}
function getFileExt(lang: string): string {
  const map: Record<string, string> = { lua: 'lua', luau: 'lua', js: 'js', ts: 'ts', py: 'py', python: 'py', html: 'html', css: 'css', json: 'json', bash: 'sh', sh: 'sh' }
  return map[(lang || '').toLowerCase()] || 'txt'
}

function appendMsg(m: ConvMsg, skipScroll?: boolean): void {
  const c = document.getElementById('msgs'); if (!c) return
  const w = document.getElementById('welcome'); if (w) w.style.display = 'none'
  const isUser = m.role === 'user'
  const wrap = document.createElement('div')
  wrap.className = 'msg ' + (isUser ? 'user' : 'ai')
  wrap.setAttribute('data-mid', String(c.querySelectorAll('.msg').length))
  wrap.appendChild(mkAv(m.role))
  const mbWrap = document.createElement('div'); mbWrap.className = 'mb-wrap'
  const sender = document.createElement('div'); sender.className = 'msg-sender'
  const t2 = new Date(m.time || Date.now())
  sender.innerHTML = `<span>${isUser ? '@' + (SESSION && SESSION.user && SESSION.user.username || 'You') : 'NEXUS AI'}</span><span>${t2.toLocaleTimeString(curLang === 'id' ? 'id-ID' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>`
  mbWrap.appendChild(sender)
  const bubble = document.createElement('div'); bubble.className = 'bubble'

  if (m.attachments && m.attachments.length) {
    const imgRow = document.createElement('div'); imgRow.className = 'msg-imgs'
    m.attachments.forEach((a) => {
      if (a.type === 'image') {
        const img = document.createElement('img'); img.className = 'msg-img'
        img.src = a.preview || ('data:' + (a.mime || 'image/png') + ';base64,' + a.data); img.alt = a.name || 'img'
        img.onclick = () => window.open(img.src, '_blank')
        imgRow.appendChild(img)
      }
    })
    bubble.appendChild(imgRow)
  }

  let content = String(m.content || '')
  if ((m as ConvMsg & { studioSummary?: string[] }).studioSummary) content = stripAllCode(content)
  const codeRe = /```(\w*)\n?([\s\S]*?)```/g
  const codeBlocks: { lang: string; code: string }[] = []
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
      const pre = document.createElement('pre'); const codeEl = document.createElement('code')
      codeEl.className = cb.lang ? 'language-' + cb.lang : ''; codeEl.textContent = cb.code; pre.appendChild(codeEl); w2.appendChild(pre)
      const hljs = (window as unknown as { hljs?: { highlightElement: (el: HTMLElement) => void } }).hljs
      if (hljs) try { hljs.highlightElement(codeEl) } catch { }
      bubble.appendChild(w2)
    } else if (part.trim()) {
      const d = document.createElement('div'); d.innerHTML = safeMarked(part); bubble.appendChild(d)
    }
  })

  const sm = (m as ConvMsg & { studioSummary?: string[] }).studioSummary
  if (sm && sm.length) {
    const sumDiv = document.createElement('div'); sumDiv.className = 'studio-summary-box'
    const _sumItems = sm; const _sumCollapsed = _sumItems.length > 4
    const _sumId = 'sum_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    const _lblShowAll = curLang === 'id' ? 'Lihat Semua (' + _sumItems.length + ')' : 'Show All (' + _sumItems.length + ')'
    const _lblShowLess = curLang === 'id' ? 'Lihat Sedikit' : 'Show Less'
    const renderSumItems = (collapsed: boolean) => (collapsed ? _sumItems.slice(0, 4) : _sumItems).map((it) =>
      `<div class="studio-summary-item"><span class="studio-summary-dot"></span>${esc(it)}</div>`).join('')
    sumDiv.innerHTML =
      `<div class="studio-summary-title"><svg width="10" height="10" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>${curLang === 'id' ? 'Dibangun di Studio' : 'Built in Studio'} <span style="color:var(--dim);font-size:9px;">(${_sumItems.length})</span></div>` +
      `<div id="${_sumId}" class="studio-summary-items">${renderSumItems(_sumCollapsed)}</div>` +
      (_sumItems.length > 4 ? `<button id="btn_${_sumId}" class="sum-toggle-btn" style="margin-top:5px;background:none;border:none;color:var(--cyan);font-size:9.5px;cursor:pointer;padding:2px 0;opacity:.8;">${_sumCollapsed ? _lblShowAll : _lblShowLess}</button>` : '')
    bubble.appendChild(sumDiv)
    if (_sumItems.length > 4) {
      setTimeout(() => {
        const toggleBtn = document.getElementById('btn_' + _sumId), itemsEl = document.getElementById(_sumId)
        if (!toggleBtn || !itemsEl) return
        let collapsed = _sumCollapsed
        toggleBtn.addEventListener('click', () => { collapsed = !collapsed; itemsEl.innerHTML = renderSumItems(collapsed); toggleBtn.textContent = collapsed ? _lblShowAll : _lblShowLess })
      }, 0)
    }
  }

  mbWrap.appendChild(bubble)
  if (!isUser) _processSuggestionChips(bubble)

  if (!isUser) {
    const acts = document.createElement('div'); acts.className = 'msg-acts'
    acts.innerHTML =
      `<button class="mab" onclick="window.copyMsgText(this)"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>` +
      `<button class="mab" onclick="window.retryMsg(this)"><svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg></button>` +
      `<button class="mab ${(m as ConvMsg & { _liked?: boolean })._liked ? 'liked' : ''}" onclick="window.likeMsg(this,true)"><svg viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg></button>` +
      `<button class="mab ${(m as ConvMsg & { _disliked?: boolean })._disliked ? 'disliked' : ''}" onclick="window.likeMsg(this,false)"><svg viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg></button>` +
      `<button class="mab" onclick="window.openShareModal()"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>`
    mbWrap.appendChild(acts)
  }

  wrap.appendChild(mbWrap); c.appendChild(wrap)
  if (!skipScroll) c.scrollTop = c.scrollHeight
}

// ── CODE PREVIEW ──────────────────────────────────────────────────────────────
function openCodePreview(stepId: number): void {
  const meta = _stepMeta.get(stepId); if (!meta || !meta.code) return
  const title = document.getElementById('codePreviewTitle'), path = document.getElementById('codePreviewPath'), codeEl = document.getElementById('codePreviewCode')
  if (title) title.textContent = (meta.type || 'Script') + ': ' + meta.name
  if (path) path.textContent = meta.parent + '/' + meta.name
  if (codeEl) {
    codeEl.textContent = meta.code
    const hljs = (window as unknown as { hljs?: { highlightElement: (el: HTMLElement) => void } }).hljs
    if (hljs) try { hljs.highlightElement(codeEl as HTMLElement) } catch { }
  }
  const m = document.getElementById('codePreviewModal'); if (m) m.classList.add('show')
}
function copyPreviewCode(): void {
  const codeEl = document.getElementById('codePreviewCode')
  if (codeEl) navigator.clipboard.writeText(codeEl.textContent || '').then(() => toast(T().copiedToast))
}
function copyCode(btn: HTMLElement): void {
  const pre = btn.closest('.code-block-wrap')?.querySelector('pre code')
  if (pre) navigator.clipboard.writeText(pre.textContent || '').then(() => toast(T().copiedToast))
}
function downloadCode(btn: HTMLElement, lang: string): void {
  const pre = btn.closest('.code-block-wrap')?.querySelector('pre code'); if (!pre) return
  const a = document.createElement('a')
  a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(pre.textContent || '')
  a.download = 'nexus_code.' + getFileExt(lang); a.click()
}
function copyMsgText(btn: HTMLElement): void {
  const b = btn.closest('.mb-wrap')?.querySelector('.bubble')
  if (b) navigator.clipboard.writeText((b as HTMLElement).innerText || b.textContent || '').then(() => toast(T().copiedToast))
}

// ── THINKING STEPS ────────────────────────────────────────────────────────────
function createStepsCard(): void {
  removeStepsCard()
  const c = document.getElementById('msgs'); if (!c) return
  const w = document.getElementById('welcome'); if (w) w.style.display = 'none'
  const wrap = document.createElement('div'); wrap.className = 'steps-wrap'; wrap.id = 'stepsWrap'
  wrap.appendChild(mkAv('ai'))
  const mbW = document.createElement('div'); mbW.className = 'mb-wrap'
  const sender = document.createElement('div'); sender.className = 'msg-sender'
  sender.innerHTML = `<span>NEXUS AI</span><span>${new Date().toLocaleTimeString(curLang === 'id' ? 'id-ID' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>`
  mbW.appendChild(sender)
  const box = document.createElement('div'); box.className = 'steps-box'
  const hdr = document.createElement('div'); hdr.className = 'steps-hdr'; hdr.id = 'stepsHdr'
  const spinner = document.createElement('div'); spinner.className = 'steps-hdr-spinner'; spinner.id = 'stepsSpinner'
  const hdrTxt = document.createElement('span'); hdrTxt.className = 'steps-hdr-txt'; hdrTxt.id = 'stepsTxt'; hdrTxt.textContent = T().workingOn
  const hdrCount = document.createElement('span'); hdrCount.className = 'steps-hdr-count'; hdrCount.id = 'stepsCount'; hdrCount.textContent = '(0/0)'
  const hdrToggle = document.createElement('button'); hdrToggle.id = 'stepsToggle'
  hdrToggle.style.cssText = 'margin-left:auto;background:none;border:none;color:var(--cyan);font-size:9px;cursor:pointer;padding:2px 6px;opacity:.75;white-space:nowrap;flex-shrink:0;'
  hdrToggle.textContent = curLang === 'id' ? 'Lihat Sedikit' : 'Show Less'
  let _stepsExpanded = true
  hdrToggle.onclick = () => {
    _stepsExpanded = !_stepsExpanded
    const sl = document.getElementById('stepsList'); if (sl) sl.style.display = _stepsExpanded ? '' : 'none'
    hdrToggle.textContent = _stepsExpanded ? (curLang === 'id' ? 'Lihat Sedikit' : 'Show Less') : (curLang === 'id' ? 'Lihat Semua' : 'Show All')
  }
  hdr.appendChild(spinner); hdr.appendChild(hdrTxt); hdr.appendChild(hdrCount); hdr.appendChild(hdrToggle)
  box.appendChild(hdr)
  const list = document.createElement('div'); list.className = 'steps-list'; list.id = 'stepsList'
  box.appendChild(list)
  const cancelDiv = document.createElement('div'); cancelDiv.className = 'steps-cancel'; cancelDiv.id = 'stepsCancel'
  const cb = document.createElement('button'); cb.className = 'steps-cancel-btn'; cb.textContent = T().cancel; cb.onclick = cancelGen
  cancelDiv.appendChild(cb); box.appendChild(cancelDiv); mbW.appendChild(box); wrap.appendChild(mbW)
  c.appendChild(wrap)
  _stepsEl = wrap; _stepsList = list; _stepsMap.clear(); _stepsId = 0
  c.scrollTop = c.scrollHeight
}

function removeStepsCard(): void {
  const el = document.getElementById('stepsWrap'); if (el) el.remove()
  _stepsEl = null; _stepsList = null; _stepsMap.clear(); _stepMeta.clear()
}

function clearSteps(): void {
  if (!_stepsList) return; _stepsList.innerHTML = ''; _stepsMap.clear(); _stepsId = 0
  const cnt = document.getElementById('stepsCount'); if (cnt) cnt.textContent = ''
}

function addStep(text: string, state: string, sub?: string, meta?: StepMeta): number | null {
  if (!_stepsList) return null
  const id = ++_stepsId
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
  if (meta && meta.code) {
    _stepMeta.set(id, meta)
    txtEl.style.cssText = 'cursor:pointer;display:flex;align-items:center;gap:4px;'
    txtEl.innerHTML = text.replace(/</g, '&lt;') + '<svg width="10" height="10" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" style="flex-shrink:0;color:var(--cyan);"><polyline points="9 18 15 12 9 6"/></svg>'
    txtEl.onclick = () => openCodePreview(id)
    txtEl.title = curLang === 'id' ? 'Klik untuk lihat kode' : 'Click to preview code'
  } else { txtEl.textContent = text }
  cont.appendChild(txtEl)
  if (sub) { const sv = document.createElement('div'); sv.className = 'step-sub'; sv.textContent = sub; cont.appendChild(sv) }
  row.appendChild(cont); _stepsList.appendChild(row); _stepsMap.set(id, row)
  const cc = document.getElementById('msgs'); if (cc) cc.scrollTop = cc.scrollHeight
  const cnt = document.getElementById('stepsCount')
  if (cnt) { const done = _stepsList.querySelectorAll('[data-st="done"]').length; cnt.textContent = '(' + done + '/' + _stepsId + ')' }
  return id
}

function updateStep(id: number, state: string, text?: string, sub?: string): void {
  const row = _stepsMap.get(id); if (!row) return
  row.setAttribute('data-st', state)
  const ic = row.querySelector('.step-ic')
  if (ic) {
    if (state === 'running') ic.innerHTML = '<div class="step-spin"></div>'
    else if (state === 'done') ic.innerHTML = '<svg class="step-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'
    else if (state === 'error') ic.innerHTML = '<svg class="step-err" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    else if (state === 'info') ic.innerHTML = '<svg class="step-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  }
  if (text) { const t = row.querySelector('.step-txt'); if (t) t.textContent = text }
  if (sub !== undefined) {
    let sv = row.querySelector('.step-sub') as HTMLElement | null
    if (!sv && sub) { sv = document.createElement('div'); sv.className = 'step-sub'; row.querySelector('.step-content')!.appendChild(sv) }
    if (sv) sv.textContent = sub || ''
  }
  if (_stepsList) {
    const cnt = document.getElementById('stepsCount')
    if (cnt) { const done = _stepsList.querySelectorAll('[data-st="done"]').length; cnt.textContent = '(' + done + '/' + _stepsId + ')' }
  }
}

function finalizeSteps(): void {
  const spinner = document.getElementById('stepsSpinner'); if (spinner) spinner.style.display = 'none'
  const hdrTxt = document.getElementById('stepsTxt'); if (hdrTxt) hdrTxt.style.color = 'var(--green)'
  const cancelDiv = document.getElementById('stepsCancel'); if (cancelDiv) cancelDiv.remove()
  _stepsMap.forEach((row) => {
    if (row.getAttribute('data-st') === 'running') {
      const ic = row.querySelector('.step-ic')
      if (ic) ic.innerHTML = '<svg class="step-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'
      row.setAttribute('data-st', 'done')
    }
  })
}

function setStepTitle(txt: string): void { const el = document.getElementById('stepsTxt'); if (el) el.textContent = txt }

// ── MENTION ───────────────────────────────────────────────────────────────────
async function fetchWsCache(): Promise<void> {
  if (_wsCache || _wsLoading || !SESSION || !studioConnected) return
  _wsLoading = true
  try {
    const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(`${API_URL}?get_workspace=1&user=${encodeURIComponent((SESSION.user.username || '').toLowerCase())}`, { signal: ctrl.signal })
    if (r.ok) { const d = await r.json() as { data?: unknown }; if (d && d.data) _wsCache = d.data; else _wsCache = d }
  } catch { }
  _wsLoading = false
}

function extractMentionItems(scan: unknown, query: string): { name: string; cls: string; svc: string }[] {
  if (!scan) return []
  const items: { name: string; cls: string; svc: string }[] = [], q = (query || '').toLowerCase()
  interface ScanNode { name?: string; class?: string; children?: ScanNode[] }
  const traverse = (node: ScanNode, svc: string) => {
    if (!node || !node.name || items.length >= 25) return
    if (!q || node.name.toLowerCase().includes(q)) items.push({ name: node.name, cls: node.class || '', svc })
    if (node.children) node.children.forEach((c) => traverse(c, svc))
  }
  const scanObj = scan as Record<string, ScanNode>
  ;['ServerScriptService','ReplicatedStorage','StarterGui','StarterPlayer','StarterPack','ReplicatedFirst','Workspace'].forEach((sn) => {
    if (scanObj[sn] && scanObj[sn].children) scanObj[sn].children!.forEach((c) => traverse(c, sn))
    else if (scanObj[sn]) traverse(scanObj[sn], sn)
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
  if (!dd || !inp) return
  const items = extractMentionItems(_wsCache, query)
  const list = document.getElementById('mentionList'); if (!list) return
  _mentionSelIdx = 0
  if (!studioConnected) { list.innerHTML = `<div class="mention-empty">${curLang === 'id' ? 'Studio belum terhubung' : 'Studio not connected'}</div>` }
  else if (!_wsCache) { list.innerHTML = `<div class="mention-empty">${curLang === 'id' ? 'Memuat...' : 'Loading...'}</div>`; fetchWsCache() }
  else if (!items.length) { list.innerHTML = `<div class="mention-empty">${curLang === 'id' ? 'Tidak ada hasil' : 'No results'}</div>` }
  else {
    list.innerHTML = items.map((item, idx) => {
      const ic = getMentionIcon(item.cls)
      return `<div class="mention-item${idx === 0 ? ' sel' : ''}" onclick="window.insertMention('${esc(item.name)}')"><div class="mention-ic ${ic.css}">${ic.lbl}</div><div style="flex:1;min-width:0;"><div class="mention-name">${esc(item.name)}</div><div class="mention-path">${esc(item.cls || 'Instance')} — ${esc(item.svc)}</div></div></div>`
    }).join('')
  }
  const r2 = inp.getBoundingClientRect()
  dd.style.bottom = (window.innerHeight - r2.top + 4) + 'px'
  dd.style.left = r2.left + 'px'
  dd.style.width = Math.max(290, r2.width) + 'px'
  dd.classList.add('open')
}

function hideMentionDD(): void {
  const dd = document.getElementById('mentionDD'); if (dd) dd.classList.remove('open')
  _mentionActive = false; _mentionAtPos = -1; _mentionSelIdx = 0
}

function insertMention(name: string): void {
  const inp = document.getElementById('inp') as HTMLTextAreaElement | null; if (!inp) return
  const val = inp.value, pos = inp.selectionStart || 0
  const atPos = _mentionAtPos >= 0 ? _mentionAtPos : val.lastIndexOf('@', pos - 1)
  if (atPos >= 0) {
    inp.value = val.slice(0, atPos) + '@' + name + ' ' + val.slice(pos)
    inp.selectionStart = inp.selectionEnd = atPos + name.length + 2
  }
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
// PART 8 — FILE HANDLING, UI ACTIONS, GUI EDITOR, INIT, EVENTS
// ══════════════════════════════════════════════════════════════════════════════

function handleFile(e: Event): void {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  files.forEach((file) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const d = (ev.target!.result as string)
        S.attachments.push({ type: 'image', name: file.name, mime: file.type, data: d.split(',')[1], preview: d })
        renderAttachRow()
      }
      reader.readAsDataURL(file)
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => { S.attachments.push({ type: 'file', name: file.name, text: ev.target!.result as string }); renderAttachRow() }
      reader.readAsText(file)
    }
  })
  ;(e.target as HTMLInputElement).value = ''
}

function renderAttachRow(): void {
  const row = document.getElementById('attachRow'); if (!row) return
  row.innerHTML = S.attachments.map((a, i) => {
    if (a.type === 'image') {
      const src = a.preview || ('data:' + (a.mime || 'image/png') + ';base64,' + a.data)
      return `<div class="attach-item"><img src="${src}" alt=""><button class="attach-rm" onclick="window.removeAttach(${i})">x</button></div>`
    }
    return `<div class="attach-item"><div class="attach-file"><svg width="11" height="11" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>${esc(a.name)}</div><button class="attach-rm" onclick="window.removeAttach(${i})">x</button></div>`
  }).join('')
}

function removeAttach(i: number): void { S.attachments.splice(i, 1); renderAttachRow() }

function clearChat(): void {
  if (!S.curConv) return
  if (!confirm(T().clearConfirm)) return
  const cv = S.convs.find((x) => x.id === S.curConv); if (cv) cv.msgs = []
  renderMsgs([]); saveS()
}

function openSettings(): void {
  updateCreds(); checkDailyCredits(); updateRoleDisplay(); updatePlayTestUI()
  const m = document.getElementById('settingsModal'); if (m) m.classList.add('show')
}

function openAvatarModal(): void {
  if (!SESSION) return
  const u = SESSION.user
  const nameEl = document.getElementById('avatarModalName'); if (nameEl) nameEl.textContent = '@' + (u.username || '-')
  const imgEl = document.getElementById('avatarModalImg') as HTMLImageElement | null
  if (imgEl) { imgEl.src = u.avatar || '/images/nexusai.png'; imgEl.onerror = () => { imgEl.src = '/images/nexusai.png' } }
  const roleEl = document.getElementById('avatarModalRole'); if (roleEl) roleEl.textContent = isOwner() ? 'Owner' : isAdmin() ? 'Admin' : 'Roblox Developer'
  const idEl = document.getElementById('avatarModalId'); if (idEl) idEl.textContent = 'Roblox ID: ' + (u.robloxId || '-')
  const m = document.getElementById('avatarModal'); if (m) m.classList.add('show')
}

function closeModal(id: string): void { const el = document.getElementById(id); if (el) el.classList.remove('show') }
function logout(): void { localStorage.removeItem('nexus_session'); location.replace('/') }

function useSugg(q: string): void {
  const inp = document.getElementById('inp') as HTMLTextAreaElement | null
  if (inp) {
    inp.value = q
    inp.style.height = 'auto'
    inp.style.height = Math.min(inp.scrollHeight, 130) + 'px'
    inp.focus()
  }
  send()
}

function showInstall(): void { const m = document.getElementById('installModal'); if (m) m.classList.add('show') }

function toggleSidebar(): void {
  const app = document.getElementById('app'), icon = document.getElementById('collapseSbIcon')
  if (!app) return
  app.classList.toggle('sb-hidden')
  if (icon) icon.innerHTML = app.classList.contains('sb-hidden') ? '<polyline points="9 18 15 12 9 6"/>' : '<polyline points="15 18 9 12 15 6"/>'
}

function switchTab(tab: string, btn: HTMLElement): void {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('act'))
  btn.classList.add('act')
  const ct = document.getElementById('chatTab'), gt = document.getElementById('guiTab')
  if (tab === 'chat') { if (ct) { ct.style.display = 'flex'; ct.style.flexDirection = 'column' } if (gt) gt.style.display = 'none' }
  else { if (ct) ct.style.display = 'none'; if (gt) { gt.style.display = 'flex'; gt.style.flexDirection = 'column' } }
}

function likeMsg(btn: HTMLElement, isLike: boolean): void {
  const msgEl = btn.closest('.msg.ai'); if (!msgEl) return
  const lb = msgEl.querySelector('.mab[onclick*="true"]'), db = msgEl.querySelector('.mab[onclick*="false"]')
  if (isLike) { if (lb) lb.classList.toggle('liked'); if (db) db.classList.remove('disliked') }
  else { if (db) db.classList.toggle('disliked'); if (lb) lb.classList.remove('liked') }
}

function retryMsg(btn: HTMLElement): void {
  const msgEl = btn.closest('.msg.ai'); if (!msgEl) return
  const idx = parseInt(msgEl.getAttribute('data-mid') || '0')
  const cv = S.convs.find((x) => x.id === S.curConv); if (!cv) return
  if (idx > 0 && cv.msgs[idx - 1] && cv.msgs[idx - 1].role === 'user') {
    const inp = document.getElementById('inp') as HTMLTextAreaElement | null
    if (inp) { inp.value = String(cv.msgs[idx - 1].content || ''); inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 130) + 'px'; send() }
  }
}

function openShareModal(): void {
  const cv = S.convs.find((x) => x.id === S.curConv); if (!cv) return
  let text = ''
  ;(cv.msgs || []).forEach((m) => {
    const name = m.role === 'user' ? ('@' + (SESSION && SESSION.user && SESSION.user.username || 'You')) : 'NEXUS AI'
    const time = m.time ? new Date(m.time).toLocaleTimeString(curLang === 'id' ? 'id-ID' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : ''
    text += '[' + time + '] ' + name + ':\n' + (m.content || '') + '\n\n'
  })
  const ta = document.getElementById('shareModalTa') as HTMLTextAreaElement | null; if (ta) ta.value = text
  const m = document.getElementById('shareModal'); if (m) m.classList.add('show')
}

function copyShareText(): void {
  const ta = document.getElementById('shareModalTa') as HTMLTextAreaElement | null
  if (ta) navigator.clipboard.writeText(ta.value).then(() => toast(T().copiedToast))
}

async function sendReport(): Promise<void> {
  const ta = document.getElementById('reportTa') as HTMLTextAreaElement | null
  const btn = document.getElementById('reportBtn') as HTMLButtonElement | null
  const st = document.getElementById('reportStatus')
  if (!ta || !ta.value.trim()) return
  let cfToken = ''
  if (K.turnstile) {
    const tw = window as unknown as { turnstile?: { getResponse: (w: unknown) => string; reset: (w: unknown) => void } }
    if (tw.turnstile) {
      try {
        cfToken = tw.turnstile.getResponse(_turnstileWidget) || ''
        if (!cfToken) await new Promise<void>((resolve) => setTimeout(resolve, 12000))
        cfToken = tw.turnstile.getResponse(_turnstileWidget) || ''
      } catch { cfToken = '' }
    }
    if (!cfToken) { if (st) st.textContent = curLang === 'id' ? 'Selesaikan CAPTCHA dulu' : 'Complete CAPTCHA first'; return }
  }
  if (btn) btn.disabled = true
  try {
    await fetch(REPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: SESSION && SESSION.user && SESSION.user.username || '?', userId: SESSION && SESSION.user && SESSION.user.robloxId || '?', message: ta.value, type: 'report', 'cf-turnstile-response': cfToken, time: new Date().toISOString() }) })
    if (st) st.textContent = curLang === 'id' ? 'Terkirim!' : 'Sent!'
    if (ta) ta.value = ''
    const tw = window as unknown as { turnstile?: { reset: (w: unknown) => void } }
    if (K.turnstile && tw.turnstile && _turnstileWidget !== null) tw.turnstile.reset(_turnstileWidget)
  } catch { if (st) st.textContent = 'Error' }
  if (btn) setTimeout(() => { btn.disabled = false }, 3000)
}

async function redeemCode(): Promise<void> {
  const inp = document.getElementById('redeemInput') as HTMLInputElement | null
  const btn = document.getElementById('redeemBtn') as HTMLButtonElement | null
  const st = document.getElementById('redeemStatus')
  if (!inp || !inp.value.trim()) return
  if (!checkClientRateLimit('redeem', 3)) return
  const code = inp.value.trim().toUpperCase().replace(/[^A-Z0-9\-_]/g, '')
  if (btn) btn.disabled = true
  try {
    const r = await fetch('/api/redeem', { method: 'POST', headers: getAdminHeaders(), body: JSON.stringify({ code, user: (SESSION && SESSION.user && SESSION.user.username || '').toLowerCase(), userId: SESSION && SESSION.user && SESSION.user.robloxId || '' }) })
    const d = await r.json() as { success?: boolean; credits?: number; error?: string }
    if (d.success) { S.credits += parseFloat(String(d.credits || 0)); updateCreds(); saveS(); if (st) st.textContent = '+' + d.credits + ' CR'; if (inp) inp.value = '' }
    else if (st) st.textContent = 'Error: ' + (d.error || 'Invalid')
  } catch { if (st) st.textContent = 'Error' }
  if (btn) setTimeout(() => { btn.disabled = false }, 3000)
}

// ── GUI EDITOR ────────────────────────────────────────────────────────────────
interface GuiEl {
  id: string; type: string; name: string; x: number; y: number; w: number; h: number
  bgColor: string; textColor: string; text: string; fontSize: number; cornerRadius: number
}

// Default palette used by the GUI editor (no user-selectable themes)
const GUI_DEFAULT: { bg: string; panel: string; card: string; accent: string; text: string; corner: number } = {
  bg: '#030312', panel: '#06071a', card: '#0a0b22', accent: '#00e5ff', text: '#b8cfff', corner: 10,
}

function addEl(type: string): void {
  guiElCounter++
  const id = 'el' + guiElCounter
  const th = GUI_DEFAULT
  const defs: Record<string, Partial<GuiEl>> = {
    Frame: { w: 200, h: 120, bgColor: th.panel, text: '', textColor: th.text, cornerRadius: th.corner },
    TextLabel: { w: 160, h: 40, bgColor: 'transparent', text: 'Label', textColor: th.text, fontSize: 16, cornerRadius: 0 },
    TextButton: { w: 140, h: 40, bgColor: th.accent, text: 'Button', textColor: '#030312', fontSize: 14, cornerRadius: th.corner },
    TextBox: { w: 180, h: 36, bgColor: th.card, text: '', textColor: th.text, fontSize: 13, cornerRadius: th.corner },
    ImageLabel: { w: 80, h: 80, bgColor: th.card, text: '', textColor: th.text, cornerRadius: 0 },
    ScrollingFrame: { w: 200, h: 150, bgColor: th.bg, text: '', textColor: th.text, cornerRadius: th.corner },
  }
  const def = defs[type] || defs.Frame
  guiElements[id] = { id, type, name: type + '_' + guiElCounter, x: 20 + guiElCounter * 12, y: 20 + guiElCounter * 10, w: def.w || 200, h: def.h || 40, bgColor: def.bgColor || th.panel, textColor: def.textColor || th.text, text: def.text || '', fontSize: def.fontSize || 14, cornerRadius: def.cornerRadius || 0 }
  const empt = document.getElementById('guiEmpty'); if (empt) empt.style.display = 'none'
  renderGuiEl(id); selectEl(id); updateLayerList()
}

function renderGuiEl(id: string): void {
  const el = guiElements[id]; if (!el) return
  const canvas = document.getElementById('guiCanvasInner'); if (!canvas) return
  const existing = canvas.querySelector(`[data-elid="${id}"]`); if (existing) existing.remove()
  const div = document.createElement('div'); div.className = 'gui-el'; div.setAttribute('data-elid', id)
  div.style.cssText = `left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.bgColor && el.bgColor !== 'transparent' ? el.bgColor : 'rgba(30,32,64,0.5)'};color:${el.textColor || '#fff'};font-size:${el.fontSize || 14}px;border-radius:${el.cornerRadius || 0}px;border:1px solid rgba(0,229,255,0.15);box-shadow:0 2px 8px rgba(0,0,0,.3);`
  if (el.text) { const sp = document.createElement('span'); sp.textContent = el.text; sp.style.cssText = 'pointer-events:none;padding:0 4px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;'; div.appendChild(sp) }
  div.onmousedown = (e) => startDrag(e, id)
  const resize = document.createElement('div'); resize.className = 'gui-resize'
  resize.onmousedown = (e) => startResize(e, id)
  div.appendChild(resize); canvas.appendChild(div)
}

function updateLayerList(): void {
  const list = document.getElementById('guiLayerList'); if (!list) return
  const els = Object.values(guiElements); if (!els.length) { list.innerHTML = ''; return }
  const typeColors: Record<string, string> = { Frame: '#00e5ff', TextLabel: '#00ffaa', TextButton: '#ff4fa0', TextBox: '#ffd600', ImageLabel: '#cc55ff', ScrollingFrame: '#8800ff' }
  list.innerHTML = els.map((el) =>
    `<div class="gui-layer-item${el.id === selectedElId ? ' sel' : ''}" onclick="window.selectEl('${el.id}')"><div class="gui-layer-dot" style="background:${typeColors[el.type] || '#888'};"></div><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:10px;">${esc(el.name)}</span></div>`
  ).join('')
}

function selectEl(id: string): void {
  selectedElId = id
  document.querySelectorAll('.gui-el').forEach((el) => el.classList.remove('selected'))
  const el = document.querySelector(`[data-elid="${id}"]`); if (el) el.classList.add('selected')
  updatePropsPanel(); updateLayerList()
}

function updatePropsPanel(): void {
  const p = document.getElementById('guiProps'); if (!p) return
  const t = T()
  if (!selectedElId || !guiElements[selectedElId]) { p.innerHTML = `<div style="font-size:10px;color:var(--dim);text-align:center;padding:20px 0;">${t.guiPropsEmpty}</div>`; return }
  const el = guiElements[selectedElId], sid = selectedElId
  p.innerHTML =
    `<div style="font-size:9px;color:var(--cyan);font-family:Orbitron,sans-serif;letter-spacing:1px;margin-bottom:8px;">${esc(el.type)}</div>` +
    `<div class="gui-prop-label">Name</div><input class="gui-prop-input" value="${esc(el.name || '')}" onchange="window.updateElProp('${sid}','name',this.value)">` +
    `<div class="gui-prop-label">Text</div><input class="gui-prop-input" value="${esc(el.text || '')}" onchange="window.updateElProp('${sid}','text',this.value)">` +
    `<div class="gui-prop-label">Font Size</div><input class="gui-prop-input" type="number" value="${el.fontSize || 14}" min="8" max="72" onchange="window.updateElProp('${sid}','fontSize',parseInt(this.value))">` +
    `<div class="gui-prop-label">BG Color</div><input class="gui-prop-input" type="color" value="${el.bgColor && el.bgColor !== 'transparent' ? el.bgColor : '#1e2040'}" onchange="window.updateElProp('${sid}','bgColor',this.value)">` +
    `<div class="gui-prop-label">Text Color</div><input class="gui-prop-input" type="color" value="${el.textColor || '#ffffff'}" onchange="window.updateElProp('${sid}','textColor',this.value)">` +
    `<div class="gui-prop-label">Corner Radius</div><input class="gui-prop-input" type="number" value="${el.cornerRadius || 0}" min="0" max="100" onchange="window.updateElProp('${sid}','cornerRadius',parseInt(this.value))">` +
    `<div class="gui-prop-label">Width</div><input class="gui-prop-input" type="number" value="${el.w}" min="20" onchange="window.resizeElProp('${sid}','w',parseInt(this.value))">` +
    `<div class="gui-prop-label">Height</div><input class="gui-prop-input" type="number" value="${el.h}" min="10" onchange="window.resizeElProp('${sid}','h',parseInt(this.value))">` +
    `<div class="gui-prop-label">X</div><input class="gui-prop-input" type="number" value="${el.x}" onchange="window.moveElProp('${sid}','x',parseInt(this.value))">` +
    `<div class="gui-prop-label">Y</div><input class="gui-prop-input" type="number" value="${el.y}" onchange="window.moveElProp('${sid}','y',parseInt(this.value))">` +
    `<button style="margin-top:12px;width:100%;padding:6px;background:rgba(0,229,255,.06);border:1px solid var(--b);border-radius:5px;color:var(--cyan);font-size:10px;cursor:pointer;" onclick="window.duplicateEl('${sid}')">${curLang === 'id' ? 'Duplikat' : 'Duplicate'}</button>` +
    `<button style="margin-top:5px;width:100%;padding:6px;background:rgba(255,45,107,.08);border:1px solid rgba(255,45,107,.25);border-radius:5px;color:var(--pink);font-size:10px;cursor:pointer;" onclick="window.deleteEl('${sid}')">${curLang === 'id' ? 'Hapus' : 'Remove'}</button>`
}

function updateElProp(elId: string, prop: string, val: string | number): void {
  if (!guiElements[elId]) return; (guiElements[elId] as unknown as Record<string, unknown>)[prop] = val
  const el = document.querySelector(`[data-elid="${elId}"]`) as HTMLElement | null; if (!el) return
  if (prop === 'text') { const sp = el.querySelector('span'); if (sp) sp.textContent = String(val); else if (val) { const s2 = document.createElement('span'); s2.textContent = String(val); s2.style.cssText = 'pointer-events:none;padding:0 4px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;'; el.appendChild(s2) } }
  if (prop === 'bgColor') el.style.background = String(val)
  if (prop === 'textColor') el.style.color = String(val)
  if (prop === 'fontSize') el.style.fontSize = val + 'px'
  if (prop === 'cornerRadius') el.style.borderRadius = val + 'px'
  if (prop === 'name') updateLayerList()
}
function resizeElProp(elId: string, prop: string, val: number): void {
  if (!guiElements[elId] || isNaN(val) || val < 10) return
  ;(guiElements[elId] as unknown as Record<string, unknown>)[prop] = val
  const el = document.querySelector(`[data-elid="${elId}"]`) as HTMLElement | null
  if (el) { if (prop === 'w') el.style.width = val + 'px'; if (prop === 'h') el.style.height = val + 'px' }
}
function moveElProp(elId: string, prop: string, val: number): void {
  if (!guiElements[elId] || isNaN(val)) return
  ;(guiElements[elId] as unknown as Record<string, unknown>)[prop] = val
  const el = document.querySelector(`[data-elid="${elId}"]`) as HTMLElement | null
  if (el) { if (prop === 'x') el.style.left = val + 'px'; if (prop === 'y') el.style.top = val + 'px' }
}
function duplicateEl(elId: string): void {
  const src = guiElements[elId]; if (!src) return
  guiElCounter++; const newId = 'el' + guiElCounter
  guiElements[newId] = { ...src, id: newId, name: src.name + '_copy', x: src.x + 15, y: src.y + 15 }
  renderGuiEl(newId); selectEl(newId); updateLayerList()
}
function deleteEl(elId: string): void {
  delete guiElements[elId]
  const el = document.querySelector(`[data-elid="${elId}"]`); if (el) el.remove()
  selectedElId = null; updatePropsPanel(); updateLayerList()
  if (!Object.keys(guiElements).length) { const empt = document.getElementById('guiEmpty'); if (empt) empt.style.display = '' }
}
function clearCanvas(): void {
  Object.keys(guiElements).forEach((k) => delete guiElements[k])
  guiElCounter = 0; selectedElId = null
  const c = document.getElementById('guiCanvasInner'); if (c) c.querySelectorAll('.gui-el').forEach((el) => el.remove())
  const empt = document.getElementById('guiEmpty'); if (empt) empt.style.display = ''
  updatePropsPanel(); updateLayerList()
}

function generateGuiCode(): void {
  const t = T(), els = Object.values(guiElements)
  if (!els.length) { toast(t.addElementFirst, 'var(--yellow)'); return }
  const hx = (h: string) => {
    const r = (h || '#1e2040').replace('#', '')
    if (r.length < 6) return '30,32,64'
    return parseInt(r.substr(0, 2), 16) + ',' + parseInt(r.substr(2, 2), 16) + ',' + parseInt(r.substr(4, 2), 16)
  }
  const isID = curLang === 'id'
  const lines = ['-- Generated by NEXUS AI UI Editor', '-- name: NexusGUI_Client', '-- parent: StarterGui', '-- script_type: LocalScript', '', "local Players = game:GetService('Players')", 'local player = Players.LocalPlayer', "local playerGui = player:WaitForChild('PlayerGui')", '', 'local screenGui = Instance.new("ScreenGui")', 'screenGui.Name = "NexusGUI"', 'screenGui.DisplayOrder = 999', 'screenGui.ResetOnSpawn = false', 'screenGui.IgnoreGuiInset = true', 'screenGui.Parent = playerGui', '']
  els.forEach((el) => {
    const v = el.name.replace(/[^a-zA-Z0-9_]/g, '_')
    lines.push(''); lines.push(`local ${v} = Instance.new("${el.type}")`); lines.push(`${v}.Name = "${el.name}"`); lines.push(`${v}.Size = UDim2.new(0, ${el.w}, 0, ${el.h})`); lines.push(`${v}.Position = UDim2.new(0, ${el.x}, 0, ${el.y})`)
    if (el.bgColor && el.bgColor !== 'transparent') lines.push(`${v}.BackgroundColor3 = Color3.fromRGB(${hx(el.bgColor)})`); else lines.push(`${v}.BackgroundTransparency = 1`)
    if (el.type !== 'Frame' && el.type !== 'ScrollingFrame' && el.type !== 'ImageLabel') {
      if (el.textColor) lines.push(`${v}.TextColor3 = Color3.fromRGB(${hx(el.textColor)})`)
      lines.push(`${v}.Text = "${String(el.text || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
      if (el.fontSize) lines.push(`${v}.TextSize = ${el.fontSize}`)
      lines.push(`${v}.Font = Enum.Font.GothamBold`); lines.push(`${v}.TextXAlignment = Enum.TextXAlignment.Center`)
    }
    lines.push(`${v}.BorderSizePixel = 0`)
    if (el.cornerRadius && el.cornerRadius > 0) { lines.push(`local ${v}_c = Instance.new("UICorner", ${v})`); lines.push(`${v}_c.CornerRadius = UDim.new(0, ${el.cornerRadius})`) }
    lines.push(`${v}.Parent = screenGui`)
    if (el.type === 'TextButton') { lines.push(''); lines.push(`${v}.MouseButton1Click:Connect(function()`); lines.push(`\tprint("${el.name} ${isID ? 'diklik' : 'clicked'}")`); lines.push('end)') }
  })
  const out = document.getElementById('guiCodeOutput'); if (out) out.textContent = lines.join('\n')
  const m = document.getElementById('guiCodeModal'); if (m) m.classList.add('show')
}
function copyGuiCode(): void { const p = document.getElementById('guiCodeOutput'); if (p) navigator.clipboard.writeText(p.textContent || '').then(() => toast(T().copiedToast)) }
function downloadGuiCode(): void {
  const p = document.getElementById('guiCodeOutput'); if (!p) return
  const a = document.createElement('a'); a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(p.textContent || ''); a.download = 'NexusGUI.lua'; a.click()
}
function openGuiAIChat(): void { const m = document.getElementById('guiAIChatModal'); if (m) m.classList.add('show') }

async function generateGuiFromAI(): Promise<void> {
  const t = T()
  const prompt = document.getElementById('guiAIPrompt') as HTMLTextAreaElement | null
  if (!prompt || !prompt.value.trim()) return
  closeModal('guiAIChatModal')
  const loading = document.getElementById('guiLoading'); if (loading) loading.classList.add('show')
  const th = GUI_DEFAULT
  try {
    const sysMsg = `You are a Roblox GUI JSON generator. Output ONLY a valid JSON array. No markdown, no extra text.\n\nFormat: [{"type":"Frame|TextLabel|TextButton|TextBox|ImageLabel|ScrollingFrame","name":"ElementName","x":0,"y":0,"w":200,"h":100,"bgColor":"#hexcolor or transparent","textColor":"#hexcolor","text":"label text","fontSize":14,"cornerRadius":8}]\n\nCanvas: 800x600px.\nBackground: ${th.bg} Panel: ${th.panel} Accent: ${th.accent} Text: ${th.text}\nIMPORTANT: Return ONLY the JSON array, nothing else.`
    const body = { provider: S.guiModel.prov || 'gemini', model: S.guiModel.id, system: sysMsg, messages: [{ role: 'user', content: 'Create: ' + prompt.value }], max_tokens: 3000 }
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (r.ok) {
      const d = await r.json() as { content: string }
      const content = (d.content || '').replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim()
      const jm = content.match(/\[[\s\S]+\]/)
      if (jm) {
        try {
          const parsed = JSON.parse(jm[0]) as Partial<GuiEl>[]
          clearCanvas()
          parsed.forEach((el) => {
            if (!el.type) return; guiElCounter++; const id = 'el' + guiElCounter
            guiElements[id] = { id, type: el.type, name: el.name || el.type + '_' + guiElCounter, w: Math.max(el.w || 200, 40), h: Math.max(el.h || 40, 20), x: Math.max(el.x || 0, 0), y: Math.max(el.y || 0, 0), bgColor: el.bgColor || th.panel, textColor: el.textColor || th.text, text: el.text || '', fontSize: el.fontSize || 14, cornerRadius: el.cornerRadius || 0 }
            renderGuiEl(id)
          })
          const empt = document.getElementById('guiEmpty'); if (empt) empt.style.display = 'none'
          updateLayerList()
          toast(curLang === 'id' ? 'UI berhasil dibuat!' : 'UI built successfully!', 'var(--green)', 2500)
        } catch { toast(t.aiResponseInvalid, 'var(--yellow)') }
      } else { toast(t.aiResponseInvalid, 'var(--yellow)') }
    } else { toast('API error: ' + r.status, 'var(--pink)') }
  } catch (e) { toast('Error: ' + ((e as Error).message || 'unknown'), 'var(--pink)') }
  if (loading) loading.classList.remove('show')
}

async function sendGuiToPlace(): Promise<void> {
  const t = T()
  if (!studioConnected) { toast(t.guiNotConnectedToast, 'var(--pink)'); return }
  const els = Object.values(guiElements)
  if (!els.length) { toast(t.addElementFirst, 'var(--yellow)'); return }
  const hRgb = (h: string) => { if (!h || h === 'transparent') return [30, 32, 64]; const r = h.replace('#', ''); if (r.length < 6) return [30, 32, 64]; return [parseInt(r.substr(0, 2), 16), parseInt(r.substr(2, 2), 16), parseInt(r.substr(4, 2), 16)] }
  const cmd = { action: 'create_gui', name: 'NexusGUI', parent: 'StarterGui', display_order: 999, ignore_inset: true, reset_on_spawn: false, elements: els.map((el) => ({ class: el.type, name: el.name, size: [0, el.w, 0, el.h], position: [0, el.x, 0, el.y], background_color: el.bgColor && el.bgColor !== 'transparent' ? hRgb(el.bgColor) : [30, 32, 64], background_transparency: el.bgColor === 'transparent' ? 1 : 0, text_color: hRgb(el.textColor || '#ffffff'), text: el.text || '', text_size: el.fontSize || 14, corner_radius: el.cornerRadius || 0, z_index: 1 })) }
  try {
    const r = await fetchRetry(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'batch_commands', commands: [cmd], _user: SESSION ? SESSION.user.username : 'web', target: (SESSION ? SESSION.user.username : '').toLowerCase() }) }, 3)
    if (r) { const d = await r.json() as { pushed?: number; status?: string }; if ((d.pushed || 0) > 0 || d.status === 'ok') toast(t.guiSentToast, 'var(--green)'); else toast(curLang === 'id' ? 'Diantri ke Studio' : 'Queued to Studio', 'var(--yellow)') }
  } catch (e) { toast('Error: ' + ((e as Error).message || ''), 'var(--pink)') }
}

function startDrag(e: MouseEvent, elId: string): void {
  if ((e.target as HTMLElement).classList.contains('gui-resize')) return
  e.preventDefault(); selectEl(elId)
  const el = document.querySelector(`[data-elid="${elId}"]`) as HTMLElement | null; if (!el) return
  const sx = e.clientX, sy = e.clientY, sl = el.offsetLeft, st2 = el.offsetTop
  const onMove = (ev: MouseEvent) => { const nx = Math.max(0, sl + ev.clientX - sx), ny = Math.max(0, st2 + ev.clientY - sy); el.style.left = nx + 'px'; el.style.top = ny + 'px'; if (guiElements[elId]) { guiElements[elId].x = nx; guiElements[elId].y = ny } }
  const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); updatePropsPanel() }
  document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
}
function startResize(e: MouseEvent, elId: string): void {
  e.preventDefault(); e.stopPropagation()
  const el = document.querySelector(`[data-elid="${elId}"]`) as HTMLElement | null; if (!el) return
  const sx = e.clientX, sy = e.clientY, sw = el.offsetWidth, sh = el.offsetHeight
  const onMove = (ev: MouseEvent) => { const nw = Math.max(40, sw + ev.clientX - sx), nh = Math.max(20, sh + ev.clientY - sy); el.style.width = nw + 'px'; el.style.height = nh + 'px'; if (guiElements[elId]) { guiElements[elId].w = nw; guiElements[elId].h = nh } }
  const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); updatePropsPanel() }
  document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
}

// ══════════════════════════════════════════════════════════════════════════════
// INIT APP
// ══════════════════════════════════════════════════════════════════════════════
async function initApp(): Promise<void> {
  if (!SESSION) return
  const t = T()
  _injectSuggChipStyles()
  updateLoader(8, t.loaderInit)
  S.currentProjectId = getProjectIdFromUrl()
  updateLoader(22, t.loaderLoadData)
  await loadS()
  updateLoader(42, t.loaderLoadData)
  if (S.currentProjectId) {
    S.currentProjectName = getProjectName(S.currentProjectId) || null
    if (!S.currentProjectName && SESSION.data && SESSION.data.projects) {
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
  updateRoleDisplay(); updateCreds(); updatePlayTestUI()
  updateLoader(58, t.loaderLoadData)
  await _loadSysPromptScript()
  await loadKeys(); await loadAdminIds(); await loadInboxCount()
  updateLoader(72, t.loaderConnecting)
  applyLang(); updateModelUI()
  updateLoader(84, t.loaderConnecting)
  startStudioPoll(); startAutoSync()
  updateLoader(93, t.loaderConnecting)
  renderConvs()
  if (S.curConv && S.convs.some((x) => x.id === S.curConv)) { loadConv(S.curConv) }
  else if (S.convs.length > 0) {
    const latest = S.convs.reduce((a, b) => (b.time || 0) > (a.time || 0) ? b : a)
    S.curConv = latest.id; loadConv(S.curConv)
  } else { newChat() }
  checkDailyCredits(); checkDailyOnLoad()
  updateLoader(100, t.loaderReady)
  setTimeout(hideLoader, 500)
  const urlp = new URLSearchParams(window.location.search)
  if (urlp.get('settings') === 'true') setTimeout(() => openSettings(), 800)
}

// ══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════════════════════════════
document.querySelectorAll('.ov').forEach((ov) => {
  ov.addEventListener('click', (e) => { if (e.target === ov) (ov as HTMLElement).classList.remove('show') })
})

const _inpEl = document.getElementById('inp') as HTMLTextAreaElement | null
if (_inpEl) {
  _inpEl.addEventListener('input', function () {
    if (this.value && this.value.includes('\x00')) this.value = this.value.replace(/\x00/g, '')
    this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 130) + 'px'
    saveDraft()
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

// ── CLOSE DROPDOWNS ON OUTSIDE CLICK ─────────────────────────────────────────
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement

  const mDD = document.getElementById('mDD')
  if (mDD && mDD.classList.contains('open') && !mDD.contains(target)) {
    const btn = document.getElementById('inpModelBtn')
    if (!btn || !btn.contains(target)) mDD.classList.remove('open')
  }

  const guiMDD = document.getElementById('guiMDD')
  if (guiMDD && guiMDD.classList.contains('open') && !guiMDD.contains(target)) {
    const btn = document.getElementById('guiModelBtn')
    if (!btn || !btn.contains(target)) guiMDD.classList.remove('open')
  }

  const mentionDD = document.getElementById('mentionDD')
  if (mentionDD && mentionDD.classList.contains('open') && !mentionDD.contains(target)) {
    const inp = document.getElementById('inp')
    if (!inp || !inp.contains(target)) hideMentionDD()
  }
})

// ── PASTE HANDLER (image paste) ───────────────────────────────────────────────
const _inpPasteEl = document.getElementById('inp') as HTMLTextAreaElement | null
if (_inpPasteEl) {
  _inpPasteEl.addEventListener('paste', (e: ClipboardEvent) => {
    const items = e.clipboardData && e.clipboardData.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = (ev) => {
          const d = (ev.target!.result as string)
          S.attachments.push({ type: 'image', name: 'pasted_image.png', mime: file.type, data: d.split(',')[1], preview: d })
          renderAttachRow()
        }
        reader.readAsDataURL(file)
        e.preventDefault()
      }
    }
  })
}

// ── VISIBILITY CHANGE (pause sync when hidden) ────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && SESSION) {
    if (!_syncInProgress && !_syncDebounceTimer) _debouncedSync()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// WINDOW ASSIGNMENTS — expose all functions for JSX onClick / inline handlers
// ══════════════════════════════════════════════════════════════════════════════
;(function assignWindowFns() {
  if (typeof window === 'undefined') return
  const w = window as unknown as Record<string, unknown>

  // Chat & conversation
  w.send            = send
  w.cancelGen       = cancelGen
  w.newChat         = newChat
  w.loadConv        = loadConv
  w.delConv         = delConv
  w.clearChat       = clearChat
  w.useSugg         = useSugg
  w.retryMsg        = retryMsg
  w.likeMsg         = likeMsg
  w.copyMsgText     = copyMsgText
  w.openShareModal  = openShareModal
  w.copyShareText   = copyShareText

  // Code blocks
  w.copyCode        = copyCode
  w.downloadCode    = downloadCode
  w.copyPreviewCode = copyPreviewCode

  // Mention
  w.insertMention   = insertMention

  // Model dropdown
  w.toggleMDD       = toggleMDD
  w.toggleGuiMDD    = toggleGuiMDD
  w.selModel        = selModel

  // Settings / modals
  w.openSettings    = openSettings
  w.openAvatarModal = openAvatarModal
  w.closeModal      = closeModal
  w.logout          = logout
  w.showInstall     = showInstall

  // Daily / credits / play test
  w.claimDaily      = claimDaily
  w.togglePlayTest  = togglePlayTest
  w.setPlayTestDur  = setPlayTestDur

  // Language
  w.changeLang      = changeLang

  // Studio
  w.retryStudio     = retryStudio

  // Sidebar / tabs
  w.toggleSidebar   = toggleSidebar
  w.switchTab       = switchTab

  // File attachment
  w.handleFile      = handleFile
  w.removeAttach    = removeAttach

  // Report / redeem
  w.sendReport      = sendReport
  w.redeemCode      = redeemCode

  // GUI editor
  w.addEl           = addEl
  w.selectEl        = selectEl
  w.updateElProp    = updateElProp
  w.resizeElProp    = resizeElProp
  w.moveElProp      = moveElProp
  w.duplicateEl     = duplicateEl
  w.deleteEl        = deleteEl
  w.clearCanvas     = clearCanvas
  w.generateGuiCode = generateGuiCode
  w.copyGuiCode     = copyGuiCode
  w.downloadGuiCode = downloadGuiCode
  w.openGuiAIChat   = openGuiAIChat
  w.generateGuiFromAI = generateGuiFromAI
  w.sendGuiToPlace  = sendGuiToPlace

  // Expose buildSysPrompt fallback
  if (!w.buildSysPrompt) w.buildSysPrompt = _fallbackBuildSysPrompt
})()

// ══════════════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp)
  } else {
    initApp()
  }
}