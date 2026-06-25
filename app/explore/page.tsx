'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Prompt {
  id:        string
  title:     string
  content:   string
  gifUrl:    string | null
  author:    string
  authorId:  string
  uses:      number
  rating:    number
  createdAt: string
  updatedAt: string
  featured?: boolean
}

interface NexusSession {
  loginTime?: number
  user: {
    username:     string
    avatar?:      string
    robloxId?:    string
    displayName?: string
  }
  data?: Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const SESSION_KEY        = 'nexus_session'
const SESSION_MAX_AGE_MS = 86_400_000 * 7
const SEARCH_DEBOUNCE_MS = 350
const MAX_LIST_LIMIT     = 60

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

const I = {
  sparkle: () => <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" strokeWidth="1.8"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z"/></svg>,
  search:  () => <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  play:    () => <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  copy:    () => <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  check:   () => <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  cross:   () => <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  image:   () => <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" fill="none" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
  film:    () => <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" fill="none" strokeWidth="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 9h5M2 15h5M17 9h5M17 15h5"/></svg>,
  loader:  () => <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" strokeWidth="2"><path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.36-6.36l-2.83 2.83M9.47 14.53l-2.83 2.83m12.72 0l-2.83-2.83M9.47 9.47L6.64 6.64"/></svg>,
  star:    () => <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" fill="none" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  empty:   () => <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/><path d="M8 16s1.5-2 4-2 4 2 4 2"/></svg>,
  user:    () => <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" fill="none" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  zap:     () => <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" fill="none" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const EXPLORE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@300;400;500;600&display=swap');

*{margin:0;padding:0;box-sizing:border-box}

:root{
  --bg:#050514;--bg2:#09091f;--bg3:#0e0e28;
  --card:rgba(0,212,255,.04);--hover:rgba(0,212,255,.08);
  --cyan:#00d4ff;--purple:#7c3aed;--pink:#f43f5e;
  --green:#10b981;--yellow:#f59e0b;
  --text:#e2e8f0;--text2:#94a3b8;--dim:#334155;--dim2:#475569;
  --b:rgba(0,212,255,.12);--r:10px;--r2:14px;
}

html,body{background:var(--bg);color:var(--text);font-family:'JetBrains Mono',monospace;overflow-x:hidden}
body{line-height:1.6;-webkit-tap-highlight-color:transparent}

::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,.10);border-radius:4px}
::-webkit-scrollbar-track{background:transparent}

@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes cardIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}
@keyframes toastIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
@keyframes toastOut{from{opacity:1}to{opacity:0;transform:translateY(12px) scale(.97)}}

.explore-container{min-height:100vh;background:var(--bg);position:relative;z-index:1}

body::before{
  content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(ellipse 70% 50% at 85% -10%,rgba(124,58,237,.16) 0%,transparent 100%),
    radial-gradient(ellipse 60% 40% at -10% 90%,rgba(0,212,255,.08) 0%,transparent 100%);
}

/* ── Header ── */
.explore-header{
  background:linear-gradient(135deg,rgba(0,212,255,.08),rgba(124,58,237,.08));
  border-bottom:1px solid var(--b);padding:22px 24px;
  position:sticky;top:0;z-index:100;backdrop-filter:blur(20px);
}
.header-content{
  max-width:1320px;margin:0 auto;
  display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
}
.header-left{display:flex;align-items:center;gap:14px;min-width:0}
.header-icon{
  width:42px;height:42px;border-radius:12px;flex-shrink:0;
  background:linear-gradient(135deg,rgba(0,212,255,.12),rgba(124,58,237,.12));
  border:1px solid rgba(0,212,255,.18);
  display:flex;align-items:center;justify-content:center;
}
.header-title{
  font-size:22px;font-weight:900;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  font-family:'Orbitron',sans-serif;line-height:1.2;
}
.header-subtitle{font-size:11px;color:var(--dim2);margin-top:2px}
.header-right{display:flex;align-items:center;gap:10px;flex-shrink:0}

/* ── Buttons ── */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  padding:0 18px;height:40px;border-radius:var(--r);
  border:1px solid rgba(0,212,255,.2);background:rgba(0,212,255,.04);
  color:var(--cyan);font-size:12px;font-weight:700;cursor:pointer;
  transition:all .2s;font-family:'JetBrains Mono',monospace;white-space:nowrap;
}
.btn:hover{background:rgba(0,212,255,.12);border-color:var(--cyan);transform:translateY(-1px)}
.btn:active{transform:translateY(0);opacity:.85}
.btn svg{flex-shrink:0}
.btn.ghost{border-color:var(--dim);color:var(--text2);background:transparent}
.btn.ghost:hover{border-color:rgba(0,212,255,.3);color:var(--cyan);background:rgba(0,212,255,.04)}

/* ── Search bar ── */
.search-bar-wrapper{
  max-width:1320px;margin:0 auto;padding:22px 24px 0;
  display:flex;gap:12px;align-items:center;
}
.search-box{
  flex:1;display:flex;align-items:center;
  background:var(--bg2);border:1.5px solid rgba(0,212,255,.16);
  border-radius:20px;padding:0 16px;transition:all .2s;height:46px;
}
.search-box:focus-within{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(0,212,255,.08)}
.search-box input{
  flex:1;background:transparent;border:none;outline:none;color:#fff;
  font-size:13px;padding:0 10px;font-family:'JetBrains Mono',monospace;
  min-width:0;
}
.search-box input::placeholder{color:var(--dim2)}
.search-spinner{
  width:13px;height:13px;border:2px solid rgba(0,212,255,.2);
  border-top-color:var(--cyan);border-radius:50%;
  animation:spin .6s linear infinite;flex-shrink:0;
}
.search-clear{
  width:20px;height:20px;border-radius:50%;border:none;
  background:rgba(255,255,255,.06);color:var(--dim2);
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;flex-shrink:0;transition:all .15s;
}
.search-clear:hover{background:rgba(244,63,94,.15);color:var(--pink)}
.result-count{font-size:11px;color:var(--dim2);white-space:nowrap;flex-shrink:0}

/* ── Grid ── */
.prompts-wrapper{max-width:1320px;margin:0 auto;padding:22px 24px 80px}
.prompts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}

.prompt-card{
  background:var(--bg2);border:1px solid var(--b);border-radius:var(--r2);
  cursor:pointer;transition:all .22s;position:relative;overflow:hidden;
  display:flex;flex-direction:column;animation:cardIn .35s ease both;
}
.prompt-card:hover{
  border-color:rgba(0,212,255,.32);transform:translateY(-3px);
  box-shadow:0 16px 40px rgba(0,0,0,.45);
}

.prompt-media{
  width:100%;aspect-ratio:16/9;background:var(--bg3);position:relative;overflow:hidden;
  border-bottom:1px solid rgba(0,212,255,.08);
}
.prompt-media img{width:100%;height:100%;object-fit:cover;display:block}
.prompt-media .media-placeholder{
  width:100%;height:100%;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,rgba(0,212,255,.05),rgba(124,58,237,.05));
}
.media-badge{
  position:absolute;bottom:8px;right:8px;
  display:inline-flex;align-items:center;gap:4px;
  font-size:9px;font-weight:700;color:#fff;
  padding:3px 8px;background:rgba(0,0,0,.55);border-radius:6px;
  backdrop-filter:blur(4px);
}

.prompt-body{padding:16px;display:flex;flex-direction:column;flex:1;gap:10px}
.prompt-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.prompt-title{
  font-size:14px;font-weight:700;color:#fff;
  overflow:hidden;text-overflow:ellipsis;display:-webkit-box;
  -webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.4;
}
.prompt-featured{
  display:inline-flex;align-items:center;gap:3px;font-size:9px;color:var(--yellow);
  padding:3px 8px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.2);
  border-radius:5px;font-weight:700;flex-shrink:0;white-space:nowrap;
}
.prompt-author{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dim2)}
.prompt-preview{
  font-size:11px;color:var(--text2);line-height:1.6;flex:1;
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;
}
.prompt-meta{
  display:flex;justify-content:space-between;align-items:center;
  font-size:10px;color:var(--dim2);padding-top:10px;
  border-top:1px solid rgba(0,212,255,.06);
}
.meta-item{display:flex;align-items:center;gap:4px}

/* auto-published badge */
.auto-badge{
  position:absolute;top:8px;left:8px;
  display:inline-flex;align-items:center;gap:3px;
  font-size:8px;font-weight:800;color:var(--green);
  padding:2px 7px;background:rgba(16,185,129,.12);
  border:1px solid rgba(16,185,129,.28);border-radius:5px;letter-spacing:.3px;
}

/* ── Empty / Loading ── */
.empty-state,.loading-state{grid-column:1/-1;text-align:center;padding:70px 24px}
.empty-icon,.loading-icon{
  width:56px;height:56px;border-radius:16px;background:var(--bg2);
  border:1px solid var(--b);display:flex;align-items:center;justify-content:center;
  margin:0 auto 18px;
}
.loading-icon svg{animation:spin 1s linear infinite}
.empty-title{font-family:'Orbitron',sans-serif;font-size:13px;color:#fff;margin-bottom:8px;letter-spacing:.3px}
.empty-text{font-size:12px;color:var(--dim2);line-height:1.7;max-width:380px;margin:0 auto}

/* ── Modal ── */
.modal-overlay{
  position:fixed;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(10px);
  z-index:1000;display:flex;align-items:flex-end;justify-content:center;
  opacity:0;pointer-events:none;transition:opacity .25s;overflow-y:auto;
}
.modal-overlay.show{opacity:1;pointer-events:auto;animation:fadeIn .2s ease}
.modal-content{
  background:var(--bg2);border:1px solid var(--b);border-radius:20px 20px 0 0;
  max-width:620px;width:100%;max-height:92vh;overflow-y:auto;
  box-shadow:0 -24px 64px rgba(0,0,0,.7);
  animation:slideUp .3s cubic-bezier(.32,1,.6,1);position:relative;
}
.modal-content::before{
  content:"";position:absolute;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,transparent 5%,var(--cyan) 35%,var(--purple) 65%,transparent 95%);
}
.modal-header{
  padding:20px 22px;border-bottom:1px solid var(--b);
  display:flex;align-items:center;justify-content:space-between;gap:12px;
}
.modal-title{font-size:15px;font-weight:700;color:var(--cyan);font-family:'Orbitron',sans-serif}
.modal-close{
  width:34px;height:34px;border-radius:9px;background:var(--bg3);border:1px solid var(--b);
  color:var(--dim2);cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:.15s;flex-shrink:0;
}
.modal-close:hover{color:var(--pink);border-color:rgba(244,63,94,.3);background:rgba(244,63,94,.06)}
.modal-body{padding:22px}
.modal-footer{padding:18px 22px;border-top:1px solid var(--b);display:flex;gap:10px;justify-content:flex-end}

/* ── Detail ── */
.detail-media{
  width:100%;max-height:320px;border-radius:var(--r);overflow:hidden;
  background:var(--bg3);margin-bottom:18px;border:1px solid var(--b);
}
.detail-media img{width:100%;height:100%;object-fit:contain;display:block;max-height:320px}
.detail-title{font-size:18px;font-weight:900;color:#fff;margin-bottom:6px;font-family:'Orbitron',sans-serif;line-height:1.4}
.detail-author{font-size:11px;color:var(--dim2);margin-bottom:16px;display:flex;align-items:center;gap:6px}
.detail-label{font-size:10px;color:var(--cyan);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:1.5px}
.detail-content{
  background:rgba(0,212,255,.04);border:1px solid rgba(0,212,255,.08);border-radius:var(--r);
  padding:14px;font-size:12px;line-height:1.7;word-break:break-word;color:var(--text);
  white-space:pre-wrap;max-height:280px;overflow-y:auto;
}
.detail-stats{display:flex;gap:16px;margin-top:14px;font-size:11px;color:var(--text2)}
.detail-stat{display:flex;align-items:center;gap:5px}

/* ── Toast ── */
.nx-toast{
  position:fixed;bottom:20px;right:16px;z-index:99999;
  padding:12px 16px;border-radius:10px;font-size:12px;
  font-family:'JetBrains Mono',monospace;background:var(--bg3);border:1px solid var(--b);
  box-shadow:0 12px 40px rgba(0,0,0,.8);pointer-events:none;
  max-width:min(320px,calc(100vw - 32px));display:flex;align-items:center;gap:9px;font-weight:500;
}
.nx-toast.in{animation:toastIn .22s ease}
.nx-toast.out{animation:toastOut .22s ease forwards}

/* ── Responsive ── */
@media(max-width:480px){
  .explore-header{padding:14px 16px}
  .header-title{font-size:17px}
  .header-subtitle{display:none}
  .header-icon{width:36px;height:36px}
  .search-bar-wrapper{padding:14px 16px 0;gap:8px}
  .search-box{height:42px}
  .result-count{display:none}
  .prompts-wrapper{padding:14px 16px 70px}
  .prompts-grid{grid-template-columns:1fr;gap:12px}
  .btn{height:36px;padding:0 14px;font-size:11px}
}
@media(min-width:481px) and (max-width:768px){
  .explore-header{padding:16px 20px}
  .search-bar-wrapper{padding:18px 20px 0}
  .prompts-wrapper{padding:18px 20px 70px}
  .prompts-grid{grid-template-columns:1fr;gap:14px}
}
@media(min-width:769px){
  .modal-overlay{align-items:center;padding:24px}
  .modal-content{border-radius:var(--r2);max-height:88vh}
  .prompts-grid{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms !important;transition-duration:.01ms !important}
}
`

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function showToast(msg: string, color?: string) {
  document.querySelectorAll('.nx-toast').forEach(t => t.remove())
  const t = document.createElement('div')
  t.className   = 'nx-toast in'
  t.style.color = color || 'var(--cyan)'
  t.innerHTML   = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>${msg.replace(/</g, '&lt;')}</span>`
  document.body.appendChild(t)
  setTimeout(() => {
    t.classList.remove('in')
    t.classList.add('out')
    setTimeout(() => t.remove(), 250)
  }, 2400)
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function ExplorePage() {
  const router = useRouter()

  // ── Auth ────────────────────────────────────────────────────────────────
  const [session,       setSession] = useState<NexusSession | null>(null)
  const [loading,       setLoading] = useState(true)

  // ── Prompts ─────────────────────────────────────────────────────────────
  const [prompts,        setPrompts]        = useState<Prompt[]>([])
  const [loadingPrompts, setLoadingPrompts] = useState(false)
  const [searchInput,    setSearchInput]    = useState('')
  const [searchTerm,     setSearchTerm]     = useState('')
  const [searching,      setSearching]      = useState(false)

  // ── Detail modal ────────────────────────────────────────────────────────
  const [showDetail,     setShowDetail]     = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [copiedId,       setCopiedId]       = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Auth check ───────────────────────────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) { router.push('/'); return }
    try {
      const sess = JSON.parse(raw) as NexusSession
      if (!sess?.user?.username) throw new Error('no user')
      if (Date.now() - (sess.loginTime || 0) > SESSION_MAX_AGE_MS) throw new Error('expired')
      setSession(sess)
    } catch {
      localStorage.removeItem(SESSION_KEY)
      router.push('/')
      return
    }
    setLoading(false)
  }, [router])

  // ── Fetch prompts ────────────────────────────────────────────────────────
  const fetchPrompts = useCallback(async (q: string) => {
    setLoadingPrompts(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      params.set('limit', String(MAX_LIST_LIMIT))
      const res = await fetch(`/api/explore?${params.toString()}`)
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      setPrompts(data.prompts || [])
    } catch (e) {
      console.error('fetchPrompts error:', e)
      setPrompts([])
    } finally {
      setLoadingPrompts(false)
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (!loading) fetchPrompts(searchTerm)
  }, [loading, searchTerm, fetchPrompts])

  // ── Debounced search ─────────────────────────────────────────────────────
  function handleSearchChange(value: string) {
    setSearchInput(value)
    setSearching(!!value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearchTerm(value), SEARCH_DEBOUNCE_MS)
  }

  function clearSearch() {
    setSearchInput('')
    setSearchTerm('')
    setSearching(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // ── Listen event auto-publish dari chats.ts ──────────────────────────────
  useEffect(() => {
    function onPromptPublished(e: Event) {
      const detail = (e as CustomEvent<Prompt>).detail
      if (!detail?.id) return
      setPrompts(prev => [detail, ...prev.filter(p => p.id !== detail.id)])
      showToast('Your prompt was auto-published to Explore!', 'var(--green)')
    }
    window.addEventListener('nexus:prompt-published', onPromptPublished)
    return () => window.removeEventListener('nexus:prompt-published', onPromptPublished)
  }, [])

  // ── Detail modal ─────────────────────────────────────────────────────────
  function openDetail(prompt: Prompt) {
    setSelectedPrompt(prompt)
    setShowDetail(true)
    fetch('/api/explore', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: prompt.id }),
    }).catch(() => {})
  }

  async function copyPrompt(prompt: Prompt) {
    try {
      await navigator.clipboard.writeText(prompt.content)
      setCopiedId(prompt.id)
      showToast('Copied to clipboard', 'var(--green)')
      setTimeout(() => setCopiedId(null), 1800)
    } catch {
      showToast('Copy failed', 'var(--pink)')
    }
  }

  // ── Loading screen ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: EXPLORE_CSS }} />
        <div className="explore-container">
          <div className="loading-state" style={{ paddingTop: 120 }}>
            <div className="loading-icon"><I.loader /></div>
            <div className="empty-text">Loading Explore...</div>
          </div>
        </div>
      </>
    )
  }

  const hasQuery = searchTerm.trim().length > 0

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: EXPLORE_CSS }} />

      <div className="explore-container">

        {/* ── HEADER ── */}
        <div className="explore-header">
          <div className="header-content">
            <div className="header-left">
              <div className="header-icon"><I.sparkle /></div>
              <div>
                <div className="header-title">EXPLORE</div>
                <div className="header-subtitle">Community prompts — discover &amp; use</div>
              </div>
            </div>
            <div className="header-right">
              <Link href="/dashboard">
                <button className="btn ghost">Dashboard</button>
              </Link>
            </div>
          </div>
        </div>

        {/* ── SEARCH ── */}
        <div className="search-bar-wrapper">
          <div className="search-box">
            <I.search />
            <input
              type="text"
              placeholder="Search prompts by title or content..."
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              aria-label="Search prompts"
              autoComplete="off"
              spellCheck={false}
            />
            {searching && <div className="search-spinner" aria-hidden="true" />}
            {!searching && searchInput && (
              <button className="search-clear" onClick={clearSearch} aria-label="Clear search">
                <I.cross />
              </button>
            )}
          </div>
          {!loadingPrompts && (
            <span className="result-count">
              {prompts.length} prompt{prompts.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* ── GRID ── */}
        <div className="prompts-wrapper">
          <div className="prompts-grid">
            {loadingPrompts ? (
              <div className="loading-state">
                <div className="loading-icon"><I.loader /></div>
                <div className="empty-text">Loading prompts...</div>
              </div>
            ) : prompts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><I.empty /></div>
                <div className="empty-title">No prompts found</div>
                <div className="empty-text">
                  {hasQuery
                    ? <>Nothing matches &quot;{searchTerm}&quot;. Try different keywords.</>
                    : <>No community prompts yet. Be the first to publish one from Studio!</>
                  }
                </div>
              </div>
            ) : (
              prompts.map((prompt, i) => (
                <div
                  key={prompt.id}
                  className="prompt-card"
                  onClick={() => openDetail(prompt)}
                  style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }}
                >
                  {session && prompt.author === session.user.username.toLowerCase() && prompt.gifUrl && (
                    <div className="auto-badge"><I.zap />Auto</div>
                  )}

                  <div className="prompt-media">
                    {prompt.gifUrl ? (
                      <>
                        <img src={prompt.gifUrl} alt="" loading="lazy" />
                        <span className="media-badge"><I.film />GIF</span>
                      </>
                    ) : (
                      <div className="media-placeholder"><I.image /></div>
                    )}
                  </div>

                  <div className="prompt-body">
                    <div className="prompt-header">
                      <div className="prompt-title">{prompt.title}</div>
                      {prompt.featured && (
                        <div className="prompt-featured"><I.star />Featured</div>
                      )}
                    </div>
                    <div className="prompt-author"><I.user />@{prompt.author}</div>
                    <div className="prompt-preview">{prompt.content}</div>
                    <div className="prompt-meta">
                      <div className="meta-item"><I.play />{prompt.uses} uses</div>
                      <div className="meta-item"><I.star />{prompt.rating.toFixed(1)}</div>
                      <div className="meta-item">{timeAgo(prompt.createdAt)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── DETAIL MODAL ── */}
        <div
          className={`modal-overlay${showDetail ? ' show' : ''}`}
          onClick={() => setShowDetail(false)}
        >
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            {selectedPrompt && (
              <>
                <div className="modal-header">
                  <div className="modal-title">Prompt Details</div>
                  <button className="modal-close" onClick={() => setShowDetail(false)} aria-label="Close">
                    <I.cross />
                  </button>
                </div>
                <div className="modal-body">
                  {selectedPrompt.gifUrl && (
                    <div className="detail-media">
                      <img src={selectedPrompt.gifUrl} alt="" />
                    </div>
                  )}
                  <div className="detail-title">{selectedPrompt.title}</div>
                  <div className="detail-author"><I.user />@{selectedPrompt.author}</div>
                  <div className="detail-label">Prompt</div>
                  <div className="detail-content">{selectedPrompt.content}</div>
                  <div className="detail-stats">
                    <div className="detail-stat"><I.play />{selectedPrompt.uses} uses</div>
                    <div className="detail-stat"><I.star />{selectedPrompt.rating.toFixed(1)}</div>
                    <div className="detail-stat">{timeAgo(selectedPrompt.createdAt)}</div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn ghost" onClick={() => copyPrompt(selectedPrompt)}>
                    {copiedId === selectedPrompt.id
                      ? <><I.check />Copied</>
                      : <><I.copy />Copy Prompt</>}
                  </button>
                  <button className="btn" onClick={() => setShowDetail(false)}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </>
  )
}