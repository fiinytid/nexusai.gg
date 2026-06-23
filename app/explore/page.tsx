'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import Link from 'next/link'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Prompt {
  id:          string
  title:       string
  description: string
  category:    string
  tags:        string[]
  author:      string
  authorId:    string
  content:     string
  uses:        number
  rating:      number
  createdAt:   string
  updatedAt:   string
  icon?:       string
  featured?:   boolean
}

interface PublishFormData {
  title:       string
  description: string
  category:    string
  tags:        string
  content:     string
}

interface UserSession {
  username:  string
  robloxId:  string
  email?:    string
  avatar?:   string
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES — inlined CSS
// ═══════════════════════════════════════════════════════════════════════════

const EXPLORE_CSS = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg:      #030312;
  --bg2:     #06071a;
  --bg3:     #0a0b22;
  --card:    rgba(0, 229, 255, 0.04);
  --hover:   rgba(0, 229, 255, 0.08);
  --cyan:    #00e5ff;
  --purple:  #8800ff;
  --pink:    #ff2d6b;
  --green:   #00ffaa;
  --yellow:  #ffd600;
  --text:    #b8cfff;
  --dim:     #3a4a7a;
  --b:       rgba(0, 229, 255, 0.12);
  --r:       8px;
}

html, body {
  background: var(--bg);
  color: var(--text);
  font-family: 'JetBrains Mono', monospace;
  overflow-x: hidden;
}

body {
  line-height: 1.6;
}

.explore-container {
  min-height: 100vh;
  background: var(--bg);
  padding: 0;
  overflow-x: hidden;
}

/* ─── Header ─────────────────────────────────────────────────────────── */
.explore-header {
  background: linear-gradient(135deg, rgba(0,229,255,.1), rgba(136,0,255,.1));
  border-bottom: 1px solid var(--b);
  padding: 32px 24px;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.header-title {
  font-size: 28px;
  font-weight: 900;
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-family: 'Orbitron', sans-serif;
}

.header-subtitle {
  font-size: 13px;
  color: var(--dim);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  height: 40px;
  border-radius: var(--r);
  border: 1px solid rgba(0, 229, 255, .2);
  background: rgba(0, 229, 255, .04);
  color: var(--cyan);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all .2s;
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}

.btn:hover {
  background: rgba(0, 229, 255, .12);
  border-color: var(--cyan);
  transform: translateY(-2px);
}

.btn:active {
  transform: translateY(0);
  opacity: .8;
}

.btn.primary {
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  color: white;
  border: none;
}

.btn.primary:hover {
  opacity: .9;
}

.btn.danger {
  color: var(--pink);
  border-color: rgba(255, 45, 107, .2);
  background: rgba(255, 45, 107, .04);
}

.btn.danger:hover {
  background: rgba(255, 45, 107, .12);
  border-color: var(--pink);
}

/* ─── Search & Filter Bar ───────────────────────────────────────────── */
.search-bar-wrapper {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.search-box {
  flex: 1;
  min-width: 250px;
  display: flex;
  align-items: center;
  background: var(--bg3);
  border: 1.5px solid rgba(0, 229, 255, .18);
  border-radius: 20px;
  padding: 0 16px;
  transition: all .2s;
}

.search-box:focus-within {
  border-color: var(--cyan);
  box-shadow: 0 0 0 3px rgba(0, 229, 255, .08);
}

.search-box input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: white;
  font-size: 13px;
  padding: 12px 8px;
  font-family: 'JetBrains Mono', monospace;
}

.search-box input::placeholder {
  color: rgba(58, 74, 122, .6);
}

.search-icon {
  width: 16px;
  height: 16px;
  color: var(--dim);
  flex-shrink: 0;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
}

.filter-select {
  background: var(--bg3);
  border: 1.5px solid rgba(0, 229, 255, .18);
  border-radius: var(--r);
  padding: 10px 14px;
  color: white;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  cursor: pointer;
  transition: all .2s;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300e5ff' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 16px;
  padding-right: 32px;
}

.filter-select:hover {
  border-color: var(--cyan);
  background-color: rgba(0, 229, 255, .04);
}

/* ─── Prompts Grid ──────────────────────────────────────────────────── */
.prompts-wrapper {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
}

.prompts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.prompt-card {
  background: var(--bg2);
  border: 1px solid var(--b);
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all .25s;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.prompt-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(0,229,255,.1), transparent);
  opacity: 0;
  transition: opacity .25s;
  pointer-events: none;
}

.prompt-card:hover {
  border-color: var(--cyan);
  background: rgba(0, 229, 255, .06);
  transform: translateY(-4px);
}

.prompt-card:hover::before {
  opacity: 1;
}

.prompt-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.prompt-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(0, 229, 255, .1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.prompt-title-group {
  flex: 1;
  min-width: 0;
}

.prompt-title {
  font-size: 14px;
  font-weight: 700;
  color: white;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prompt-author {
  font-size: 11px;
  color: var(--dim);
}

.prompt-featured {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--yellow);
  padding: 2px 8px;
  background: rgba(255, 214, 0, .1);
  border-radius: 4px;
  font-weight: 700;
}

.prompt-description {
  font-size: 12px;
  color: var(--text);
  line-height: 1.5;
  margin-bottom: 12px;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.prompt-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  background: rgba(0, 229, 255, .08);
  border: 1px solid rgba(0, 229, 255, .15);
  border-radius: 4px;
  font-size: 10px;
  color: var(--cyan);
  white-space: nowrap;
}

.prompt-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--dim);
  padding-top: 12px;
  border-top: 1px solid rgba(0, 229, 255, .06);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-icon {
  width: 12px;
  height: 12px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
}

/* ─── Empty State ───────────────────────────────────────────────────── */
.empty-state {
  text-align: center;
  padding: 80px 24px;
  color: var(--dim);
}

.empty-icon {
  width: 60px;
  height: 60px;
  margin: 0 auto 20px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
  opacity: .5;
}

.empty-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--text);
}

.empty-text {
  font-size: 12px;
  line-height: 1.6;
  max-width: 400px;
  margin: 0 auto;
}

/* ─── Loading State ─────────────────────────────────────────────────── */
.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(0, 229, 255, .2);
  border-top-color: var(--cyan);
  border-radius: 50%;
  animation: spin .6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 12px;
}

/* ─── Modal/Dialog ──────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(3, 3, 18, .9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  opacity: 0;
  pointer-events: none;
  transition: opacity .3s;
}

.modal-overlay.show {
  opacity: 1;
  pointer-events: auto;
}

.modal-content {
  background: var(--bg2);
  border: 1px solid var(--b);
  border-radius: 12px;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 24px 64px rgba(0, 0, 0, .95);
  animation: modalSlide .3s;
}

@keyframes modalSlide {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  padding: 24px;
  border-bottom: 1px solid var(--b);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--cyan);
  font-family: 'Orbitron', sans-serif;
}

.modal-close {
  background: none;
  border: none;
  color: var(--dim);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: .2s;
}

.modal-close:hover {
  color: var(--text);
}

.modal-body {
  padding: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--cyan);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  background: var(--bg3);
  border: 1.5px solid rgba(0, 229, 255, .18);
  border-radius: var(--r);
  padding: 10px 14px;
  color: white;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  outline: none;
  transition: all .2s;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  border-color: var(--cyan);
  box-shadow: 0 0 0 3px rgba(0, 229, 255, .08);
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
  font-family: 'JetBrains Mono', monospace;
}

.form-hint {
  font-size: 11px;
  color: var(--dim);
  margin-top: 4px;
}

.modal-footer {
  padding: 24px;
  border-top: 1px solid var(--b);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

/* ─── Prompt Detail Modal ───────────────────────────────────────────── */
.prompt-detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.prompt-detail-header {
  display: flex;
  gap: 16px;
}

.prompt-detail-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  background: rgba(0, 229, 255, .1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  flex-shrink: 0;
}

.prompt-detail-info {
  flex: 1;
  min-width: 0;
}

.prompt-detail-title {
  font-size: 20px;
  font-weight: 900;
  color: white;
  margin-bottom: 4px;
}

.prompt-detail-author {
  font-size: 12px;
  color: var(--dim);
  margin-bottom: 8px;
}

.prompt-detail-stats {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: var(--text);
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-icon {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
}

.prompt-detail-section {
  padding-top: 20px;
  border-top: 1px solid rgba(0, 229, 255, .06);
}

.prompt-detail-label {
  font-size: 11px;
  color: var(--cyan);
  font-weight: 700;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.prompt-detail-content {
  background: rgba(0, 229, 255, .04);
  border: 1px solid rgba(0, 229, 255, .08);
  border-radius: var(--r);
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
  color: var(--text);
}

/* ─── Responsive ────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .explore-header {
    padding: 20px 16px;
  }

  .header-content {
    flex-direction: column;
    align-items: stretch;
  }

  .header-title {
    font-size: 22px;
  }

  .header-right {
    width: 100%;
    justify-content: stretch;
  }

  .header-right .btn {
    flex: 1;
    justify-content: center;
  }

  .search-bar-wrapper {
    flex-direction: column;
  }

  .search-box {
    min-width: auto;
  }

  .filter-select {
    width: 100%;
  }

  .prompts-grid {
    grid-template-columns: 1fr;
  }

  .modal-content {
    max-width: calc(100vw - 40px);
  }
}
`

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function ExplorePage() {
  const router = useRouter()

  // ─── State ─────────────────────────────────────────────────────────────
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [filteredPrompts, setFilteredPrompts] = useState<Prompt[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [loadingPrompts, setLoadingPrompts] = useState(false)
  const [publishError, setPublishError] = useState('')

  const [formData, setFormData] = useState<PublishFormData>({
    title: '',
    description: '',
    category: 'general',
    tags: '',
    content: '',
  })

  // ─── Check Auth on Mount ───────────────────────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userStr = localStorage.getItem('nexus_session')
        if (!userStr) {
          router.push('/')
          return
        }

        const userData = JSON.parse(userStr) as UserSession
        setUser(userData)
      } catch (err) {
        console.error('Auth check failed:', err)
        router.push('/')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  // ─── Fetch Prompts from Convex Cloud ───────────────────────────────────
  const fetchPrompts = useCallback(async () => {
    setLoadingPrompts(true)
    try {
      const response = await fetch('/api/explore')
      if (!response.ok) throw new Error('Failed to fetch prompts')
      const data = await response.json()
      setPrompts(data.prompts || [])
    } catch (err) {
      console.error('Error fetching prompts:', err)
      setPrompts([])
    } finally {
      setLoadingPrompts(false)
    }
  }, [])

  // ─── Load Prompts on Mount ─────────────────────────────────────────────
  useEffect(() => {
    if (user) {
      fetchPrompts()
    }
  }, [user, fetchPrompts])

  // ─── Filter Prompts ────────────────────────────────────────────────────
  useEffect(() => {
    let filtered = [...prompts]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        p =>
          p.title.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term) ||
          p.tags.some(t => t.toLowerCase().includes(term)),
      )
    }

    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => p.category === selectedCategory)
    }

    // Sort by featured first, then by rating, then by uses
    filtered.sort((a, b) => {
      if (a.featured && !b.featured) return -1
      if (!a.featured && b.featured) return 1
      if (b.rating !== a.rating) return b.rating - a.rating
      return b.uses - a.uses
    })

    setFilteredPrompts(filtered)
  }, [prompts, searchTerm, selectedCategory])

  // ─── Publish Prompt to Supabase ────────────────────────────────────────
  const handlePublish = async () => {
    if (!user || !formData.title.trim() || !formData.content.trim()) {
      setPublishError('Title and content are required')
      return
    }

    setPublishing(true)
    setPublishError('')

    try {
      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)

      const newPrompt: Prompt = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        tags: tagsArray,
        author: user.username,
        authorId: user.robloxId,
        content: formData.content.trim(),
        uses: 0,
        rating: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        featured: false,
      }

      // Save to Supabase via API
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: user.username,
          action: 'publish-prompt',
          prompt: newPrompt,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to publish prompt')
      }

      // Add to local state
      setPrompts(prev => [newPrompt, ...prev])

      // Reset form
      setFormData({
        title: '',
        description: '',
        category: 'general',
        tags: '',
        content: '',
      })

      setShowPublishModal(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setPublishError(message)
      console.error('Publish error:', err)
    } finally {
      setPublishing(false)
    }
  }

  // ─── Handlers ──────────────────────────────────────────────────────────
  const handleOpenDetail = (prompt: Prompt) => {
    setSelectedPrompt(prompt)
    setShowDetailModal(true)
  }

  const handleCloseDetail = () => {
    setShowDetailModal(false)
    setSelectedPrompt(null)
  }

  const handleClosePublish = () => {
    setShowPublishModal(false)
    setFormData({
      title: '',
      description: '',
      category: 'general',
      tags: '',
      content: '',
    })
    setPublishError('')
  }

  const handleCopyPrompt = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="explore-container">
        <div className="loading-container">
          <div className="loading-spinner" />
          <span>Loading explore page...</span>
        </div>
      </div>
    )
  }

  const categories = ['all', 'general', 'scripting', 'ui', 'gameplay', 'optimization']

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: EXPLORE_CSS }} />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@300;400;500&display=swap"
      />

      <div className="explore-container">
        {/* ─── HEADER ─────────────────────────────────────────────────────── */}
        <div className="explore-header">
          <div className="header-content">
            <div className="header-left">
              <div>
                <div className="header-title">EXPLORE</div>
                <div className="header-subtitle">Discover & share powerful prompts</div>
              </div>
            </div>
            <div className="header-right">
              <button className="btn primary" onClick={() => setShowPublishModal(true)}>
                <span>+ Publish Prompt</span>
              </button>
              <Link href="/dashboard">
                <button className="btn">Dashboard</button>
              </Link>
            </div>
          </div>
        </div>

        {/* ─── SEARCH & FILTER ─────────────────────────────────────────────── */}
        <div className="search-bar-wrapper">
          <div className="search-box">
            <svg className="search-icon" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search prompts by title, description, or tags..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="filter-select"
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* ─── PROMPTS GRID ───────────────────────────────────────────────── */}
        <div className="prompts-wrapper">
          {loadingPrompts ? (
            <div className="loading-container">
              <div className="loading-spinner" />
              <span>Loading prompts...</span>
            </div>
          ) : filteredPrompts.length === 0 ? (
            <div className="empty-state">
              <svg className="empty-icon" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z" />
              </svg>
              <div className="empty-title">No prompts found</div>
              <div className="empty-text">
                {searchTerm || selectedCategory !== 'all'
                  ? 'Try adjusting your search or filter criteria.'
                  : 'Be the first to publish a prompt! Click "Publish Prompt" to get started.'}
              </div>
            </div>
          ) : (
            <div className="prompts-grid">
              {filteredPrompts.map(prompt => (
                <div
                  key={prompt.id}
                  className="prompt-card"
                  onClick={() => handleOpenDetail(prompt)}
                >
                  <div className="prompt-header">
                    <div className="prompt-icon">{prompt.icon || '✨'}</div>
                    <div className="prompt-title-group">
                      <div className="prompt-title">{prompt.title}</div>
                      <div className="prompt-author">by {prompt.author}</div>
                    </div>
                    {prompt.featured && (
                      <div className="prompt-featured">
                        ⭐ Featured
                      </div>
                    )}
                  </div>

                  <div className="prompt-description">{prompt.description}</div>

                  <div className="prompt-tags">
                    {prompt.tags.slice(0, 3).map((tag, idx) => (
                      <div key={idx} className="tag">
                        {tag}
                      </div>
                    ))}
                    {prompt.tags.length > 3 && (
                      <div className="tag">+{prompt.tags.length - 3}</div>
                    )}
                  </div>

                  <div className="prompt-meta">
                    <div className="meta-item">
                      <svg className="meta-icon" viewBox="0 0 24 24">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                      </svg>
                      {prompt.uses} uses
                    </div>
                    <div className="meta-item">
                      <svg className="meta-icon" viewBox="0 0 24 24">
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2l-2.81 6.63L2 9.24l5.46 4.73L5.82 21 12 17.27z" />
                      </svg>
                      {prompt.rating.toFixed(1)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── DETAIL MODAL ───────────────────────────────────────────────── */}
        <div className={`modal-overlay ${showDetailModal ? 'show' : ''}`}
          onClick={handleCloseDetail}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            {selectedPrompt && (
              <>
                <div className="modal-header">
                  <div className="modal-title">Prompt Details</div>
                  <button className="modal-close" onClick={handleCloseDetail}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className="modal-body">
                  <div className="prompt-detail">
                    <div className="prompt-detail-header">
                      <div className="prompt-detail-icon">
                        {selectedPrompt.icon || '✨'}
                      </div>
                      <div className="prompt-detail-info">
                        <div className="prompt-detail-title">
                          {selectedPrompt.title}
                        </div>
                        <div className="prompt-detail-author">
                          by {selectedPrompt.author}
                        </div>
                        <div className="prompt-detail-stats">
                          <div className="stat">
                            <svg className="stat-icon" viewBox="0 0 24 24">
                              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5z" />
                            </svg>
                            {selectedPrompt.uses} uses
                          </div>
                          <div className="stat">
                            <svg className="stat-icon" viewBox="0 0 24 24">
                              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2l-2.81 6.63L2 9.24l5.46 4.73L5.82 21 12 17.27z" />
                            </svg>
                            {selectedPrompt.rating.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="prompt-detail-section">
                      <div className="prompt-detail-label">Description</div>
                      <div className="prompt-detail-content">
                        {selectedPrompt.description}
                      </div>
                    </div>

                    <div className="prompt-detail-section">
                      <div className="prompt-detail-label">Category</div>
                      <div className="prompt-detail-content">
                        {selectedPrompt.category}
                      </div>
                    </div>

                    <div className="prompt-detail-section">
                      <div className="prompt-detail-label">Tags</div>
                      <div className="prompt-tags">
                        {selectedPrompt.tags.map((tag, idx) => (
                          <div key={idx} className="tag">
                            {tag}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="prompt-detail-section">
                      <div className="prompt-detail-label">Prompt Content</div>
                      <div className="prompt-detail-content">
                        {selectedPrompt.content}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    className="btn"
                    onClick={() => handleCopyPrompt(selectedPrompt.content)}
                  >
                    📋 Copy
                  </button>
                  <button className="btn primary" onClick={handleCloseDetail}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── PUBLISH MODAL ──────────────────────────────────────────────── */}
        <div className={`modal-overlay ${showPublishModal ? 'show' : ''}`}
          onClick={handleClosePublish}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Publish Your Prompt</div>
              <button className="modal-close" onClick={handleClosePublish}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter a descriptive title for your prompt"
                  value={formData.title}
                  onChange={e =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                />
                <div className="form-hint">
                  Be clear and descriptive (e.g., "Roblox GUI Generator", "Lua Table Parser")
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="What does this prompt do?"
                  value={formData.description}
                  onChange={e =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
                <div className="form-hint">
                  Write a brief overview of the prompt's purpose
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="form-select"
                  value={formData.category}
                  onChange={e =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                >
                  <option value="general">General</option>
                  <option value="scripting">Scripting</option>
                  <option value="ui">UI Design</option>
                  <option value="gameplay">Gameplay</option>
                  <option value="optimization">Optimization</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Tags</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="lua, roblox, script (comma separated)"
                  value={formData.tags}
                  onChange={e => setFormData({ ...formData, tags: e.target.value })}
                />
                <div className="form-hint">
                  Add up to 5 tags separated by commas
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Prompt Content</label>
                <textarea
                  className="form-textarea"
                  placeholder="Paste your prompt here..."
                  value={formData.content}
                  onChange={e =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                />
                <div className="form-hint">
                  The actual prompt text that will be shared
                </div>
              </div>

              {publishError && (
                <div
                  style={{
                    padding: '12px',
                    background: 'rgba(255, 45, 107, .1)',
                    border: '1px solid rgba(255, 45, 107, .2)',
                    borderRadius: 'var(--r)',
                    color: '#ff2d6b',
                    fontSize: '12px',
                    marginBottom: '16px',
                  }}
                >
                  {publishError}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn" onClick={handleClosePublish}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}