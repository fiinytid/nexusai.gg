'use client'

import { useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState, useCallback } from 'react'

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────────────────────── */
interface Project {
  id: string
  name: string
  createdAt: string
}

interface UserData {
  credits?: number | string
  plan?: string
  roles?: string[]
  projects?: Project[]
  lastClaim?: string | null
  avatar?: string
  displayName?: string
  robloxId?: string
}

interface NexusSession {
  loginTime?: number
  user: {
    username: string
    avatar?: string
    robloxId?: string
    displayName?: string
  }
  data?: UserData
}

interface QueueItem {
  type: string
  payload: {
    user: string
    robloxId: string
    data: Partial<UserData>
  }
  ts: number
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */
const API_SYNC           = '/api/sync'
const API_CONTROL        = '/api/control'
const RETRY_MAX          = 4
const RETRY_BASE         = 800
const PROJECT_NAME_LIMIT = 16
const SESSION_MAX_AGE_MS = 86400000 * 7

/* ─────────────────────────────────────────────────────────────────────────────
   CSS
───────────────────────────────────────────────────────────────────────────── */
const PAGE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Inter:wght@300;400;500;600;700&display=swap');

:root {
  --bg:      #050514;
  --bg2:     #09091f;
  --bg3:     #0e0e28;
  --bg4:     #141432;
  --cyan:    #00d4ff;
  --cyan2:   #00a8cc;
  --cyan-dim: rgba(0,212,255,.12);
  --purple:  #7c3aed;
  --pink:    #f43f5e;
  --green:   #10b981;
  --yellow:  #f59e0b;
  --orange:  #f97316;
  --text:    #e2e8f0;
  --text2:   #94a3b8;
  --dim:     #334155;
  --dim2:    #475569;
  --border:  rgba(255,255,255,.07);
  --border2: rgba(0,212,255,.28);
  --r:  10px;
  --r2: 14px;
  --r3: 20px;
  --shadow:  0 4px 24px rgba(0,0,0,.5);
  --shadow2: 0 16px 56px rgba(0,0,0,.7);
  --glow-c:  0 0 32px rgba(0,212,255,.15);
  --glow-p:  0 0 32px rgba(124,58,237,.15);
}

*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

html {
  scroll-behavior: smooth;
  height: 100%;
  -webkit-text-size-adjust: 100%;
}

body {
  font-family: 'Inter', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-tap-highlight-color: transparent;
}

/* Subtle background layers */
body::before {
  content: "";
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background:
    radial-gradient(ellipse 70% 50% at 85% -10%, rgba(124,58,237,.18) 0%, transparent 100%),
    radial-gradient(ellipse 60% 40% at -10% 90%, rgba(0,212,255,.09) 0%, transparent 100%),
    radial-gradient(ellipse 90% 70% at 50% 120%, rgba(0,212,255,.05) 0%, transparent 100%);
}

body::after {
  content: "";
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    linear-gradient(rgba(0,212,255,.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,212,255,.022) 1px, transparent 1px);
  background-size: 52px 52px;
  mask-image: radial-gradient(ellipse 120% 80% at 50% 0%, black 30%, transparent 75%);
}

::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; }
::-webkit-scrollbar-track { background: transparent; }

/* ── KEYFRAMES ── */
@keyframes spin        { to { transform: rotate(360deg); } }
@keyframes fadeUp      { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes fadeIn      { from { opacity: 0; } to { opacity: 1; } }
@keyframes scaleIn     { from { opacity: 0; transform: scale(.95) translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes pulseDot    { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.7); } }
@keyframes shimmer     { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes glowBorder  { 0%,100% { border-color: rgba(0,212,255,.10); } 50% { border-color: rgba(0,212,255,.42); } }
@keyframes float       { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes toastSlide  { from { opacity: 0; transform: translateY(12px) scale(.97); } to { opacity: 1; transform: none; } }
@keyframes toastOut    { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(12px) scale(.97); } }
@keyframes cardIn      { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
@keyframes overlayIn   { from { opacity: 0; } to { opacity: 1; } }
@keyframes modalIn     { from { opacity: 0; transform: scale(.95) translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes slideUp     { from { transform: translateY(20px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes pulse       { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
@keyframes progressBar { from { width: 0%; } to { width: 100%; } }

/* ── LOADER ── */
#dash-loader {
  position: fixed; inset: 0; z-index: 9999;
  background: var(--bg);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 20px;
  transition: opacity .5s ease, visibility .5s ease;
}
#dash-loader.hide { opacity: 0; visibility: hidden; pointer-events: none; }

.loader-wordmark {
  font-family: 'Orbitron', sans-serif;
  font-size: 24px; font-weight: 900; letter-spacing: 6px;
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.loader-ring {
  width: 48px; height: 48px; border-radius: 50%;
  border: 2px solid rgba(0,212,255,.1);
  border-top-color: var(--cyan);
  animation: spin .9s linear infinite;
}
.loader-track {
  width: 200px; height: 2px;
  background: rgba(255,255,255,.05); border-radius: 2px; overflow: hidden;
}
.loader-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--cyan), var(--purple));
  border-radius: 2px; transition: width .28s ease;
}
.loader-label { font-size: 10px; color: var(--dim2); letter-spacing: 3px; text-transform: uppercase; }

/* ── SYNC / OFFLINE ── */
#syncBar {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 300;
  height: 2px; background: transparent;
}
#syncBar.syncing {
  background: linear-gradient(90deg, transparent, var(--cyan), var(--purple), transparent);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}
#syncBar.error { background: var(--pink); }
#syncBar.ok    { background: var(--green); }

#offlineBanner {
  position: fixed; top: 0; left: 0; right: 0; z-index: 9998;
  background: rgba(249,115,22,.08); border-bottom: 1px solid rgba(249,115,22,.2);
  padding: 10px 20px; display: none; align-items: center; justify-content: center;
  gap: 8px; font-size: 11px; color: var(--orange); backdrop-filter: blur(12px);
  animation: fadeIn .2s ease;
}
#offlineBanner.show { display: flex; }
#offlineBanner svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.btn-retry-offline {
  padding: 4px 14px; border-radius: 6px;
  border: 1px solid rgba(249,115,22,.3); background: rgba(249,115,22,.1);
  color: var(--orange); font-size: 10px; cursor: pointer;
  font-family: 'Inter', sans-serif; transition: background .15s; margin-left: 8px;
}
.btn-retry-offline:hover { background: rgba(249,115,22,.2); }

/* ── NAV ── */
.dnav {
  position: sticky; top: 0; z-index: 200;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; height: 62px;
  background: rgba(5,5,20,.9);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(40px) saturate(1.5);
  -webkit-backdrop-filter: blur(40px) saturate(1.5);
}

.dnav-brand {
  display: flex; align-items: center; gap: 10px;
  cursor: pointer; user-select: none; text-decoration: none;
}
.dnav-brand-icon {
  width: 34px; height: 34px; border-radius: 10px;
  overflow: hidden; border: 1px solid rgba(0,212,255,.15);
  flex-shrink: 0; box-shadow: var(--glow-c);
}
.dnav-brand-icon img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dnav-wordmark {
  font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 900;
  letter-spacing: 3px;
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}

.dnav-right { display: flex; align-items: center; gap: 8px; }

.credits-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 0 14px; height: 36px; border-radius: 20px;
  background: rgba(245,158,11,.06); border: 1px solid rgba(245,158,11,.2);
  font-size: 12px; font-weight: 600; color: var(--yellow);
  text-decoration: none; transition: all .2s; white-space: nowrap;
}
.credits-chip:hover { background: rgba(245,158,11,.12); border-color: rgba(245,158,11,.4); transform: translateY(-1px); }
.credits-chip svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2.2; }

/* ── USER PILL ── */
.user-pill-wrap { position: relative; }
.user-pill {
  display: flex; align-items: center; gap: 9px;
  padding: 5px 12px 5px 5px;
  border-radius: 24px; border: 1px solid var(--border);
  background: var(--bg2); cursor: pointer; user-select: none;
  transition: all .2s; min-height: 44px;
}
.user-pill:hover { border-color: var(--border2); background: var(--bg3); }
.user-pill.open  { border-color: var(--border2); }

.user-av-sm {
  width: 32px; height: 32px; border-radius: 50%;
  border: 1.5px solid rgba(0,212,255,.3); object-fit: cover;
  background: var(--bg3); flex-shrink: 0;
}
.user-name-pill { font-size: 12px; font-weight: 500; color: var(--text); }
.user-caret {
  width: 12px; height: 12px; stroke: var(--dim2); fill: none;
  stroke-width: 2; transition: transform .22s; flex-shrink: 0;
}
.user-pill.open .user-caret { transform: rotate(180deg); stroke: var(--cyan); }

/* ── DESKTOP DROPDOWN ── */
.user-dd {
  position: absolute; top: calc(100% + 10px); right: 0; width: 268px;
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r2);
  box-shadow: 0 24px 64px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.03);
  z-index: 9999; display: none; overflow: hidden;
}
.user-dd.open { display: block; animation: scaleIn .18s ease; }

.dd-header {
  padding: 16px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 12px;
  background: linear-gradient(135deg, rgba(0,212,255,.03), transparent);
}
.dd-av { width: 44px; height: 44px; border-radius: 50%; border: 1.5px solid rgba(0,212,255,.25); object-fit: cover; flex-shrink: 0; }
.dd-name { font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 2px; }
.dd-sub  { font-size: 10px; color: var(--dim2); }

.dd-section { padding: 5px 0; }
.dd-item {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 16px; cursor: pointer; font-size: 12px;
  color: var(--text2); text-decoration: none;
  transition: all .12s; min-height: 44px;
  border: none; background: none; width: 100%;
  font-family: 'Inter', sans-serif; text-align: left;
}
.dd-item:hover { background: rgba(255,255,255,.04); color: var(--text); }
.dd-item svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; opacity: .5; transition: opacity .12s; }
.dd-item:hover svg { opacity: 1; }
.dd-badge {
  margin-left: auto; font-size: 9px; font-weight: 700;
  padding: 2px 8px; border-radius: 8px;
  background: rgba(0,212,255,.08); color: var(--cyan);
  border: 1px solid rgba(0,212,255,.15);
}
.dd-item.danger { color: rgba(244,63,94,.7); }
.dd-item.danger:hover { background: rgba(244,63,94,.06); color: var(--pink); }
.dd-divider { height: 1px; background: var(--border); }

/* ── MOBILE MENU (BOTTOM SHEET) ── */
.sheet-overlay {
  position: fixed; inset: 0; z-index: 8000;
  background: rgba(0,0,0,.6); backdrop-filter: blur(10px);
  display: none; animation: overlayIn .2s ease;
}
.sheet-overlay.show { display: block; }

.bottom-sheet {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 8001;
  background: var(--bg2); border-top: 1px solid var(--border);
  border-radius: 20px 20px 0 0;
  padding: 8px 0 max(env(safe-area-inset-bottom, 20px), 20px);
  max-height: 88vh; overflow-y: auto; display: none;
}
.bottom-sheet.show { display: block; animation: slideUp .28s cubic-bezier(.32,1,.6,1) both; }

.sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--dim); margin: 8px auto 14px; }

.sheet-header {
  padding: 0 20px 14px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 12px;
}
.sheet-av { width: 48px; height: 48px; border-radius: 50%; border: 1.5px solid rgba(0,212,255,.25); object-fit: cover; flex-shrink: 0; }
.sheet-name { font-size: 14px; color: #fff; font-weight: 600; margin-bottom: 2px; }
.sheet-sub  { font-size: 10px; color: var(--dim2); }

.sheet-item {
  display: flex; align-items: center; gap: 12px;
  padding: 0 20px; min-height: 52px; cursor: pointer;
  font-size: 13px; color: var(--text2); text-decoration: none;
  transition: background .12s; border: none; background: none;
  width: 100%; font-family: 'Inter', sans-serif; text-align: left;
}
.sheet-item:active { background: rgba(255,255,255,.04); }
.sheet-item svg { width: 17px; height: 17px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; opacity: .5; }
.sheet-badge {
  margin-left: auto; font-size: 10px; font-weight: 700;
  padding: 3px 10px; border-radius: 8px;
  background: rgba(0,212,255,.08); color: var(--cyan);
  border: 1px solid rgba(0,212,255,.15);
}
.sheet-item.danger { color: rgba(244,63,94,.8); }
.sheet-item.danger svg { opacity: .7; }
.sheet-divider { height: 1px; background: var(--border); margin: 5px 0; }

.sheet-footer { padding: 12px 20px 0; }
.sheet-close {
  width: 100%; min-height: 48px; border-radius: 10px;
  background: var(--bg3); border: 1px solid var(--border);
  color: var(--text2); font-family: 'Inter', sans-serif;
  font-size: 12px; cursor: pointer; transition: all .15s;
}
.sheet-close:active { border-color: rgba(0,212,255,.2); color: var(--text); }

/* ── MAIN LAYOUT ── */
.dash-main {
  max-width: 1100px; margin: 0 auto;
  padding: 40px 24px 100px;
  position: relative; z-index: 1;
}

/* ── PAGE HEADER ── */
.page-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; margin-bottom: 32px; flex-wrap: wrap;
  animation: fadeUp .4s ease both;
}
.ph-left { display: flex; align-items: center; gap: 16px; min-width: 0; }
.ph-avatar {
  width: 60px; height: 60px; border-radius: 16px;
  background: var(--bg2); border: 1px solid var(--border);
  overflow: hidden; flex-shrink: 0;
  box-shadow: var(--glow-c), var(--shadow);
  cursor: pointer; transition: transform .2s;
}
.ph-avatar:hover { transform: scale(1.05); }
.ph-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ph-info { min-width: 0; }
.ph-info h1 {
  font-family: 'Orbitron', sans-serif; font-size: 22px; font-weight: 900;
  color: #fff; margin-bottom: 5px; line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ph-info h1 span {
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.ph-info p { font-size: 12px; color: var(--dim2); }

.plan-badge {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 0 18px; height: 38px; border-radius: 24px;
  font-family: 'Orbitron', sans-serif; font-size: 9px; font-weight: 700;
  letter-spacing: 1.5px; cursor: pointer; transition: all .2s;
  text-decoration: none; white-space: nowrap; flex-shrink: 0;
  border: 1px solid rgba(16,185,129,.2); background: rgba(16,185,129,.05); color: var(--green);
}
.plan-badge.pro   { border-color: rgba(0,212,255,.25); background: rgba(0,212,255,.04); color: var(--cyan); }
.plan-badge.owner { border-color: rgba(245,158,11,.25); background: rgba(245,158,11,.05); color: var(--yellow); }
.plan-badge svg   { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; }
.plan-badge:hover { filter: brightness(1.2); transform: translateY(-1px); }

/* ── STATS ── */
.stats-row {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 14px; margin-bottom: 28px;
  animation: fadeUp .4s .06s ease both;
}
.stat-card {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r2); padding: 20px;
  display: flex; align-items: center; gap: 14px;
  transition: all .22s; position: relative; overflow: hidden;
}
.stat-card::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(0,212,255,.04), transparent);
  opacity: 0; transition: opacity .22s; pointer-events: none;
}
.stat-card:hover { border-color: rgba(255,255,255,.12); transform: translateY(-2px); box-shadow: var(--shadow2); }
.stat-card:hover::after { opacity: 1; }
.stat-icon {
  width: 44px; height: 44px; border-radius: 12px;
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
}
.stat-icon svg { width: 19px; height: 19px; stroke: currentColor; fill: none; stroke-width: 1.8; }
.stat-icon.yellow { background: rgba(245,158,11,.08); border: 1px solid rgba(245,158,11,.15); color: var(--yellow); }
.stat-icon.cyan   { background: rgba(0,212,255,.08);  border: 1px solid rgba(0,212,255,.13);  color: var(--cyan);   }
.stat-icon.green  { background: rgba(16,185,129,.08); border: 1px solid rgba(16,185,129,.13); color: var(--green);  }
.stat-val { font-family: 'Orbitron', sans-serif; font-size: 22px; font-weight: 700; color: #fff; line-height: 1; margin-bottom: 4px; }
.stat-lbl { font-size: 10px; color: var(--dim2); font-weight: 500; }

/* ── CREATE CARD ── */
.create-card {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r2); padding: 26px;
  margin-bottom: 28px; box-shadow: var(--shadow);
  animation: fadeUp .4s .12s ease both; position: relative; overflow: hidden;
}
.create-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent 5%, var(--cyan) 35%, var(--purple) 65%, transparent 95%);
}

.create-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 20px; gap: 12px; flex-wrap: wrap;
}
.create-title {
  font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 700;
  color: var(--cyan); display: flex; align-items: center; gap: 8px;
  letter-spacing: .5px;
}
.create-title svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2.5; }

.limit-chip {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: var(--dim2);
  background: rgba(0,0,0,.3); border: 1px solid var(--border);
  padding: 5px 14px; border-radius: 20px;
}
.limit-chip .used { color: var(--cyan); font-weight: 700; }

.input-wrap { display: flex; flex-direction: column; gap: 10px; }
.input-row  { display: flex; gap: 10px; align-items: stretch; }

.proj-input {
  flex: 1; background: rgba(0,0,0,.35); border: 1px solid var(--border);
  border-radius: var(--r); padding: 0 18px; height: 50px;
  color: #fff; font-family: 'Inter', sans-serif; font-size: 14px;
  outline: none; transition: all .22s; min-width: 0;
  -webkit-appearance: none; appearance: none;
}
.proj-input:focus { border-color: rgba(0,212,255,.4); box-shadow: 0 0 0 3px rgba(0,212,255,.07); }
.proj-input::placeholder { color: var(--dim2); }
.proj-input:disabled { opacity: .3; cursor: not-allowed; }
.proj-input.err { border-color: rgba(244,63,94,.5) !important; }

.input-foot {
  display: flex; align-items: center;
  justify-content: space-between; padding: 0 2px;
}
.input-hint { font-size: 10px; color: var(--dim2); display: flex; align-items: center; gap: 5px; }
.input-hint svg { width: 10px; height: 10px; stroke: currentColor; fill: none; stroke-width: 2; }
.char-cnt { font-size: 10px; color: var(--dim2); transition: color .2s; }
.char-cnt.warn  { color: var(--yellow); }
.char-cnt.over  { color: var(--pink); }

.btn-create {
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  color: #030314; border: none; border-radius: var(--r);
  padding: 0 26px; height: 50px; flex-shrink: 0;
  font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 900;
  cursor: pointer; transition: all .22s; letter-spacing: .5px;
  display: flex; align-items: center; gap: 8px; white-space: nowrap;
  position: relative; overflow: hidden;
}
.btn-create::before {
  content: ""; position: absolute; inset: 0;
  background: rgba(255,255,255,.12); opacity: 0; transition: opacity .2s;
}
.btn-create:hover:not(:disabled)::before { opacity: 1; }
.btn-create:active:not(:disabled) { transform: scale(.97); }
.btn-create:hover:not(:disabled)  { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(0,212,255,.3); }
.btn-create:disabled { opacity: .28; cursor: not-allowed; }
.btn-create svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2.5; }
.btn-spinner { display: none; width: 15px; height: 15px; border: 2px solid rgba(3,3,20,.25); border-top-color: #030314; border-radius: 50%; animation: spin .7s linear infinite; }
.btn-create.loading .btn-spinner { display: block; }
.btn-create.loading .btn-lbl    { display: none; }

.save-status { margin-top: 10px; font-size: 11px; display: none; align-items: center; gap: 6px; }
.save-status.show-saving { display: flex; color: var(--yellow); }
.save-status.show-saved  { display: flex; color: var(--green); }
.save-status.show-error  { display: flex; color: var(--pink); }
.save-status.show-retry  { display: flex; color: var(--orange); }
.save-status svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }

.queue-notice {
  display: none; align-items: center; gap: 10px;
  background: rgba(249,115,22,.04); border: 1px solid rgba(249,115,22,.15);
  border-radius: var(--r); padding: 12px 16px; margin-top: 12px;
}
.queue-notice.show { display: flex; animation: fadeUp .2s ease; }
.queue-notice svg  { width: 13px; height: 13px; stroke: var(--orange); fill: none; stroke-width: 2; flex-shrink: 0; }
.queue-notice p    { font-size: 11px; color: rgba(249,115,22,.85); flex: 1; }
.queue-retry {
  padding: 6px 14px; border-radius: 6px; border: 1px solid rgba(249,115,22,.3);
  background: rgba(249,115,22,.08); color: var(--orange);
  font-size: 10px; cursor: pointer; font-family: 'Inter', sans-serif;
  transition: background .15s; white-space: nowrap;
}
.queue-retry:hover { background: rgba(249,115,22,.16); }

.info-box {
  display: flex; align-items: flex-start; gap: 12px;
  background: rgba(0,212,255,.025); border: 1px solid rgba(0,212,255,.08);
  border-radius: var(--r); padding: 14px 16px; margin-top: 16px;
}
.info-box svg { width: 13px; height: 13px; stroke: var(--cyan); fill: none; stroke-width: 2; flex-shrink: 0; margin-top: 1px; opacity: .7; }
.info-box p   { font-size: 11px; color: var(--dim2); line-height: 1.75; }
.info-box strong { color: var(--text); }

/* ── FILTER ROW ── */
.filter-row { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.search-wrap { flex: 1; position: relative; min-width: 0; }
.search-wrap svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; stroke: var(--dim2); fill: none; stroke-width: 2; pointer-events: none; }
.search-input {
  width: 100%; background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r); padding: 0 14px 0 40px; height: 44px;
  color: var(--text); font-family: 'Inter', sans-serif; font-size: 13px;
  outline: none; transition: all .2s; -webkit-appearance: none; appearance: none;
}
.search-input:focus { border-color: rgba(0,212,255,.28); }
.search-input::placeholder { color: var(--dim2); }

.sort-select {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r); padding: 0 34px 0 14px;
  height: 44px; color: var(--text); font-family: 'Inter', sans-serif;
  font-size: 11px; outline: none; cursor: pointer;
  transition: all .2s; flex-shrink: 0; width: 115px;
  -webkit-appearance: none; appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23475569' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 12px center;
}
.sort-select:focus { border-color: rgba(0,212,255,.28); }

/* ── SECTION HEADER ── */
.section-hdr { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.section-hdr h2 { font-family: 'Orbitron', sans-serif; font-size: 9px; color: var(--dim2); text-transform: uppercase; letter-spacing: 2.5px; white-space: nowrap; }
.section-line   { flex: 1; height: 1px; background: var(--border); }
.section-count  { font-size: 10px; color: var(--dim2); padding: 2px 10px; background: rgba(0,0,0,.3); border: 1px solid var(--border); border-radius: 10px; flex-shrink: 0; }

/* ── PROJECT GRID ── */
.projects-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 14px;
}
.project-card {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r2); padding: 20px 20px 58px;
  transition: all .22s; cursor: pointer; position: relative;
  overflow: hidden; display: flex; flex-direction: column;
}
.project-card::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(0,212,255,.05), transparent 55%);
  opacity: 0; transition: opacity .22s; pointer-events: none;
}
.project-card:hover {
  transform: translateY(-3px); border-color: rgba(0,212,255,.25);
  box-shadow: 0 16px 44px rgba(0,0,0,.45), 0 0 0 1px rgba(0,212,255,.05);
}
.project-card:active { transform: scale(.98); }
.project-card:hover::after { opacity: 1; }
.project-card.pending-save { border-color: rgba(249,115,22,.2); animation: glowBorder 2.2s ease infinite; }
.project-card.card-enter   { animation: cardIn .35s ease both; }

.card-top {
  display: flex; align-items: flex-start;
  justify-content: space-between; margin-bottom: 14px; gap: 8px;
}
.card-icon {
  width: 42px; height: 42px; border-radius: 11px; flex-shrink: 0;
  background: linear-gradient(135deg, rgba(0,212,255,.08), rgba(124,58,237,.08));
  border: 1px solid rgba(255,255,255,.06);
  display: flex; align-items: center; justify-content: center;
}
.card-icon svg { width: 18px; height: 18px; stroke: var(--cyan); fill: none; stroke-width: 1.8; }

.card-top-right { display: flex; align-items: center; gap: 6px; }
.card-id-tag {
  font-size: 8px; color: var(--dim2); background: rgba(0,0,0,.4);
  padding: 3px 9px; border-radius: 5px; border: 1px solid rgba(255,255,255,.04);
  max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  cursor: help; font-family: 'Inter', sans-serif;
}
.btn-delete {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  background: rgba(244,63,94,.04); border: 1px solid rgba(244,63,94,.1);
  color: rgba(244,63,94,.3); display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .18s; z-index: 5;
}
.btn-delete:hover  { background: rgba(244,63,94,.14); border-color: var(--pink); color: var(--pink); transform: scale(1.08); }
.btn-delete:active { transform: scale(.92); }
.btn-delete svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2.2; }

.card-name {
  font-family: 'Orbitron', sans-serif; font-size: 14px; font-weight: 700;
  color: #fff; margin-bottom: 6px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.card-desc { font-size: 11px; color: var(--dim2); line-height: 1.7; flex: 1; }

.card-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 20px; position: absolute; bottom: 0; left: 0; right: 0;
  border-top: 1px solid rgba(255,255,255,.04);
  background: rgba(9,9,31,.8); backdrop-filter: blur(10px);
}
.card-date { font-size: 10px; color: var(--dim2); display: flex; align-items: center; gap: 4px; }
.card-date svg { width: 10px; height: 10px; stroke: currentColor; fill: none; stroke-width: 2; opacity: .4; }
.card-status {
  font-size: 9px; color: var(--green);
  background: rgba(16,185,129,.05); border: 1px solid rgba(16,185,129,.15);
  padding: 3px 10px; border-radius: 10px; display: flex; align-items: center; gap: 4px;
}
.card-status.pending { color: var(--orange); background: rgba(249,115,22,.05); border-color: rgba(249,115,22,.15); }
.status-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; animation: pulseDot 2s infinite; }

.card-open-btn {
  position: absolute; bottom: 0; left: 0; right: 0; padding: 12px 20px;
  background: linear-gradient(90deg, rgba(0,212,255,.1), rgba(124,58,237,.1));
  border-top: 1px solid rgba(0,212,255,.12);
  font-family: 'Orbitron', sans-serif; font-size: 9px; font-weight: 700;
  color: var(--cyan); letter-spacing: 1px; text-align: center;
  opacity: 0; transition: opacity .22s; pointer-events: none;
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
.card-open-btn svg { width: 10px; height: 10px; stroke: currentColor; fill: none; stroke-width: 2.5; }
.project-card:hover .card-open-btn { opacity: 1; }

/* ── EMPTY STATE ── */
.empty-state { grid-column: 1 / -1; text-align: center; padding: 70px 20px; }
.empty-icon {
  width: 64px; height: 64px; border-radius: 18px;
  background: var(--bg2); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 20px; animation: float 3.5s ease-in-out infinite;
}
.empty-icon svg { width: 26px; height: 26px; stroke: var(--dim2); fill: none; stroke-width: 1.5; }
.empty-state strong { display: block; font-family: 'Orbitron', sans-serif; font-size: 12px; color: var(--text); margin-bottom: 8px; letter-spacing: .5px; }
.empty-state p { font-size: 12px; color: var(--dim2); line-height: 1.9; }
.empty-hint {
  display: inline-flex; align-items: center; gap: 7px; margin-top: 16px;
  padding: 8px 18px; border-radius: var(--r);
  background: rgba(0,212,255,.04); border: 1px solid rgba(0,212,255,.1);
  font-size: 10px; color: var(--cyan);
}
.empty-hint svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; }

/* ════════════════════════════════════════════════════
   ACCOUNT MODAL — Full-featured, polished
════════════════════════════════════════════════════ */
.account-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0,0,0,.75); backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  display: flex; align-items: center; justify-content: center;
  padding: 16px; animation: overlayIn .22s ease;
}
.account-panel {
  position: relative; background: var(--bg2);
  border: 1px solid var(--border2); border-radius: 22px;
  box-shadow: 0 40px 90px rgba(0,0,0,.9), 0 0 0 1px rgba(0,212,255,.05);
  width: 100%; max-width: 540px;
  max-height: calc(100vh - 32px); overflow-y: auto;
  -webkit-overflow-scrolling: touch; animation: scaleIn .22s ease;
}
.account-panel::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent 5%, var(--cyan) 35%, var(--purple) 65%, transparent 95%);
  border-radius: 22px 22px 0 0; pointer-events: none; z-index: 1;
}

/* Account top bar */
.acc-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 18px; position: sticky; top: 0; z-index: 2;
  background: var(--bg2); border-bottom: 1px solid var(--border);
}
.acc-topbar-title {
  font-family: 'Orbitron', sans-serif; font-size: 12px; font-weight: 700;
  color: var(--cyan); display: flex; align-items: center; gap: 8px; letter-spacing: .5px;
}
.acc-topbar-title svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; }
.acc-close {
  width: 36px; height: 36px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--bg3);
  color: var(--dim2); cursor: pointer; display: flex;
  align-items: center; justify-content: center; transition: all .15s;
}
.acc-close svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; }
.acc-close:hover { border-color: rgba(244,63,94,.3); color: var(--pink); background: rgba(244,63,94,.07); }

/* Account hero */
.acc-hero {
  position: relative; overflow: hidden;
  padding: 28px 24px 24px;
  background: linear-gradient(160deg, rgba(0,212,255,.04), rgba(124,58,237,.04), transparent);
  border-bottom: 1px solid var(--border);
}
.acc-hero::before {
  content: "";
  position: absolute; top: -30px; right: -30px;
  width: 180px; height: 180px; border-radius: 50%;
  background: radial-gradient(circle, rgba(124,58,237,.12), transparent 70%);
  pointer-events: none;
}
.acc-hero-inner { display: flex; align-items: flex-start; gap: 20px; position: relative; }
.acc-avatar-wrap { position: relative; flex-shrink: 0; }
.acc-avatar {
  width: 76px; height: 76px; border-radius: 50%;
  border: 2.5px solid rgba(0,212,255,.35);
  object-fit: cover; display: block;
  box-shadow: 0 0 0 6px rgba(0,212,255,.06), var(--glow-c);
}
.acc-online-dot {
  position: absolute; bottom: 3px; right: 3px;
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--green); border: 2.5px solid var(--bg2);
}
.acc-hero-info { flex: 1; min-width: 0; }
.acc-display-name { font-size: 11px; color: var(--dim2); margin-bottom: 4px; font-weight: 500; }
.acc-username {
  font-family: 'Orbitron', sans-serif; font-size: 20px; font-weight: 900;
  color: #fff; margin-bottom: 6px; line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.acc-username span {
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.acc-roblox-id { font-size: 11px; color: var(--dim2); margin-bottom: 12px; }
.acc-badges { display: flex; flex-wrap: wrap; gap: 7px; }
.acc-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 12px; border-radius: 16px;
  font-size: 10px; font-weight: 600; font-family: 'Orbitron', sans-serif; letter-spacing: .5px;
}
.acc-badge.plan-free   { background: rgba(16,185,129,.06);  border: 1px solid rgba(16,185,129,.2);  color: var(--green); }
.acc-badge.plan-pro    { background: rgba(0,212,255,.06);   border: 1px solid rgba(0,212,255,.2);   color: var(--cyan);   }
.acc-badge.plan-owner  { background: rgba(245,158,11,.06);  border: 1px solid rgba(245,158,11,.2);  color: var(--yellow); }
.acc-badge.credits     { background: rgba(245,158,11,.05);  border: 1px solid rgba(245,158,11,.15); color: var(--yellow); }
.acc-badge svg { width: 10px; height: 10px; stroke: currentColor; fill: none; stroke-width: 2.2; }

/* Account nav tabs */
.acc-tabs {
  display: flex; border-bottom: 1px solid var(--border);
  padding: 0 24px; gap: 2px;
  background: var(--bg2); position: sticky; top: 65px; z-index: 1;
}
.acc-tab {
  padding: 13px 18px; font-size: 11px; font-weight: 600;
  color: var(--dim2); cursor: pointer; border: none; background: none;
  font-family: 'Inter', sans-serif; transition: color .15s; white-space: nowrap;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.acc-tab:hover { color: var(--text); }
.acc-tab.active { color: var(--cyan); border-bottom-color: var(--cyan); }

/* Account body */
.acc-body { padding: 24px; }
.acc-tab-panel { display: none; }
.acc-tab-panel.active { display: block; animation: fadeUp .25s ease; }

/* Account section blocks */
.acc-section { margin-bottom: 24px; }
.acc-section-title {
  font-size: 9px; color: var(--cyan); text-transform: uppercase;
  letter-spacing: 2px; font-family: 'Orbitron', sans-serif;
  margin-bottom: 14px; opacity: .8;
}
.acc-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,.04); gap: 12px;
}
.acc-row:last-child { border-bottom: none; }
.acc-row-label { font-size: 12px; color: var(--text2); flex: 1; }
.acc-row-value { font-size: 12px; font-weight: 600; }
.acc-row-value.c  { color: var(--cyan); }
.acc-row-value.y  { color: var(--yellow); }
.acc-row-value.g  { color: var(--green); }
.acc-row-value.p  { color: var(--purple); }

/* Stats grid inside account */
.acc-stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
.acc-stat {
  background: var(--bg3); border: 1px solid var(--border);
  border-radius: var(--r); padding: 14px; text-align: center;
}
.acc-stat-val { font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 4px; }
.acc-stat-lbl { font-size: 9px; color: var(--dim2); text-transform: uppercase; letter-spacing: .5px; }

/* Quick action buttons */
.acc-action {
  width: 100%; padding: 13px 16px; border-radius: var(--r);
  margin-bottom: 8px; font-family: 'Inter', sans-serif; font-size: 12px;
  font-weight: 500; cursor: pointer; transition: all .15s;
  border: 1px solid var(--border); background: var(--bg3);
  color: var(--text); display: flex; align-items: center; gap: 12px;
  min-height: 48px; text-decoration: none;
}
.acc-action svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; opacity: .55; transition: opacity .15s; }
.acc-action:hover { border-color: rgba(0,212,255,.2); color: var(--cyan); background: rgba(0,212,255,.03); }
.acc-action:hover svg { opacity: 1; }
.acc-action .action-arrow { margin-left: auto; opacity: .35; }
.acc-action.danger { color: rgba(244,63,94,.75); border-color: rgba(244,63,94,.15); }
.acc-action.danger:hover { color: var(--pink); background: rgba(244,63,94,.05); border-color: rgba(244,63,94,.3); }

/* Security badge */
.acc-security-note {
  display: flex; align-items: flex-start; gap: 10px;
  background: rgba(0,212,255,.025); border: 1px solid rgba(0,212,255,.08);
  border-radius: var(--r); padding: 13px 15px; margin-top: 4px;
}
.acc-security-note svg { width: 13px; height: 13px; stroke: var(--cyan); fill: none; stroke-width: 2; flex-shrink: 0; margin-top: 1px; opacity: .7; }
.acc-security-note p   { font-size: 11px; color: var(--dim2); line-height: 1.75; }
.acc-security-note a   { color: var(--cyan); text-decoration: none; }
.acc-security-note a:hover { text-decoration: underline; }

/* Plan comparison */
.acc-plan-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.acc-plan-card {
  border: 1px solid var(--border); border-radius: var(--r);
  padding: 14px; background: var(--bg3); transition: border-color .2s;
}
.acc-plan-card.active-plan { border-color: var(--cyan); background: rgba(0,212,255,.04); }
.acc-plan-name { font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 700; color: #fff; margin-bottom: 6px; letter-spacing: .5px; }
.acc-plan-price { font-size: 18px; font-weight: 700; color: var(--cyan); margin-bottom: 8px; }
.acc-plan-price span { font-size: 11px; color: var(--dim2); font-weight: 400; }
.acc-plan-feat { font-size: 10px; color: var(--dim2); margin-bottom: 4px; display: flex; align-items: center; gap: 5px; }
.acc-plan-feat svg { width: 10px; height: 10px; stroke: var(--green); fill: none; stroke-width: 2.5; flex-shrink: 0; }
.acc-plan-badge { font-size: 8px; color: var(--cyan); background: rgba(0,212,255,.1); border: 1px solid rgba(0,212,255,.2); border-radius: 6px; padding: 2px 7px; display: inline-block; margin-bottom: 8px; font-family: 'Orbitron', sans-serif; letter-spacing: .5px; }

/* ════════════════════════════════════════════════════
   TOAST
════════════════════════════════════════════════════ */
.nx-toast {
  position: fixed; bottom: 20px; right: 16px; z-index: 99999;
  padding: 12px 16px; border-radius: 10px; font-size: 12px;
  font-family: 'Inter', sans-serif; background: var(--bg3);
  border: 1px solid var(--border);
  box-shadow: 0 12px 40px rgba(0,0,0,.8);
  pointer-events: none; max-width: min(320px, calc(100vw - 32px));
  display: flex; align-items: center; gap: 9px; font-weight: 500;
}
.nx-toast.in  { animation: toastSlide .22s ease; }
.nx-toast.out { animation: toastOut  .22s ease forwards; }
.nx-toast svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }

/* ════════════════════════════════════════════════════
   MODALS & OVERLAYS
════════════════════════════════════════════════════ */
.overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.8); z-index: 500;
  display: none; align-items: flex-end; justify-content: center;
  backdrop-filter: blur(12px); overflow-y: auto; padding: 0;
}
.overlay.show { display: flex; animation: overlayIn .2s ease; }

.modal-box {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 20px 20px 0 0;
  padding: 24px 24px max(env(safe-area-inset-bottom, 24px), 24px);
  width: 100%; max-width: 100%;
  box-shadow: 0 -24px 60px rgba(0,0,0,.8);
  animation: slideUp .28s cubic-bezier(.32,1,.6,1);
  position: relative;
}
.modal-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--dim); margin: 0 auto 20px; }

.modal-icon {
  width: 46px; height: 46px; border-radius: 12px;
  background: rgba(244,63,94,.08); border: 1px solid rgba(244,63,94,.2);
  display: flex; align-items: center; justify-content: center; margin-bottom: 16px;
}
.modal-icon svg { width: 20px; height: 20px; stroke: var(--pink); fill: none; stroke-width: 2; }

.modal-title { font-family: 'Orbitron', sans-serif; font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 10px; }
.modal-desc  { font-size: 12px; color: var(--dim2); line-height: 1.8; margin-bottom: 22px; }
.highlight   { color: var(--cyan); font-weight: 600; }

.modal-btns { display: flex; flex-direction: column; gap: 10px; }
.modal-btn {
  width: 100%; padding: 14px; border-radius: var(--r);
  font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all .15s; border: none; min-height: 48px;
}
.modal-btn.cancel  { background: var(--bg3); color: var(--text); border: 1px solid var(--border); }
.modal-btn.cancel:hover { border-color: rgba(0,212,255,.2); color: var(--cyan); }
.modal-btn.danger  { background: rgba(244,63,94,.1); color: var(--pink); border: 1px solid rgba(244,63,94,.25); }
.modal-btn.danger:hover { background: rgba(244,63,94,.18); }

/* ── SETTINGS MODAL ── */
.settings-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
.settings-title { font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 700; color: var(--cyan); display: flex; align-items: center; gap: 8px; }
.settings-title svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2; }
.settings-close { background: none; border: none; color: var(--dim2); cursor: pointer; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all .12s; }
.settings-close svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; }
.settings-close:hover { color: var(--pink); background: rgba(244,63,94,.08); }

.settings-sec { margin-bottom: 22px; padding-bottom: 22px; border-bottom: 1px solid var(--border); }
.settings-sec:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.settings-sec-title { font-size: 9px; color: var(--cyan); text-transform: uppercase; letter-spacing: 2px; font-family: 'Orbitron', sans-serif; margin-bottom: 14px; opacity: .8; }

.settings-av-row { display: flex; align-items: center; gap: 14px; padding: 4px 0 14px; }
.settings-av { width: 52px; height: 52px; border-radius: 50%; border: 2px solid rgba(0,212,255,.25); object-fit: cover; flex-shrink: 0; }
.settings-av-name { font-size: 14px; color: white; font-weight: 600; margin-bottom: 3px; }
.settings-av-id   { font-size: 11px; color: var(--dim2); }

.settings-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 0; font-size: 12px; gap: 10px; flex-wrap: wrap; min-height: 42px;
}
.settings-row label { color: var(--text); flex: 1; }
.s-val { font-weight: 700; }
.s-val.y { color: var(--yellow); }
.s-val.c { color: var(--cyan); }
.s-val.g { color: var(--green); }

.settings-btn {
  padding: 8px 16px; border-radius: 8px; font-size: 11px; cursor: pointer;
  border: 1px solid var(--border); background: rgba(0,212,255,.03);
  color: var(--text); transition: all .15s; font-family: 'Inter', sans-serif;
  min-height: 40px; display: inline-flex; align-items: center; gap: 6px;
}
.settings-btn:hover:not(:disabled) { border-color: rgba(0,212,255,.25); color: var(--cyan); background: rgba(0,212,255,.05); }
.settings-btn.danger { border-color: rgba(244,63,94,.22); color: var(--pink); }
.settings-btn.danger:hover { background: rgba(244,63,94,.08); }
.settings-btn.success { border-color: rgba(16,185,129,.22); color: var(--green); }
.settings-btn.success:hover { background: rgba(16,185,129,.06); }
.settings-btn:disabled { opacity: .3; cursor: not-allowed; }
.settings-btn svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2; }

.redeem-row { display: flex; gap: 8px; width: 100%; margin-top: 8px; flex-wrap: wrap; }
.redeem-input {
  flex: 1; background: var(--bg3); border: 1px solid var(--border);
  border-radius: 8px; padding: 0 14px; height: 48px;
  color: white; font-family: 'Inter', sans-serif; font-size: 12px;
  outline: none; transition: all .18s; min-width: 120px;
}
.redeem-input:focus { border-color: rgba(0,212,255,.32); box-shadow: 0 0 0 2px rgba(0,212,255,.06); }
.redeem-msg { font-size: 11px; margin-top: 8px; }

/* ── RESPONSIVE ── */
@media (max-width: 900px) and (min-width: 601px) {
  .dnav { padding: 0 20px; }
  .dash-main { padding: 32px 20px 90px; }
  .projects-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 600px) {
  .dnav { padding: 0 14px; height: 56px; }
  .dnav-wordmark { display: none; }
  .dash-main { padding: 20px 14px 80px; }
  .stats-row { grid-template-columns: 1fr 1fr; gap: 10px; }
  .stat-card { padding: 15px; gap: 10px; }
  .stat-icon { width: 38px; height: 38px; }
  .stat-val  { font-size: 19px; }
  .ph-info h1 { font-size: 18px; }
  .ph-avatar  { width: 50px; height: 50px; }
  .user-name-pill { display: none; }
  .create-card { padding: 20px 16px; }
  .input-row { flex-direction: column; gap: 8px; }
  .btn-create { width: 100%; justify-content: center; }
  .proj-input { font-size: 14px; }
  .projects-grid { grid-template-columns: 1fr; }
  .sort-select { width: 90px; font-size: 10px; padding-right: 26px; }
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .plan-badge { align-self: flex-start; }
  .stats-row { margin-bottom: 20px; }
  .acc-stats-grid { grid-template-columns: repeat(3, 1fr); }
  .acc-plan-cards { grid-template-columns: 1fr; }
  .acc-tabs { padding: 0 16px; overflow-x: auto; }
  .acc-body { padding: 16px; }
  .acc-topbar { padding: 16px 16px 14px; }
  .acc-hero { padding: 22px 16px 20px; }
  .acc-hero-inner { flex-direction: column; gap: 14px; }
  .acc-avatar { width: 64px; height: 64px; }
  .acc-username { font-size: 17px; }
  /* account modal full bottom-sheet on mobile */
  .account-overlay { align-items: flex-end; padding: 0; }
  .account-panel { border-radius: 20px 20px 0 0; max-height: 92vh; max-width: 100%; }
  .account-panel::before { border-radius: 20px 20px 0 0; }
}

@media (min-width: 769px) {
  .overlay { align-items: center; padding: 24px 16px; }
  .modal-box { border-radius: var(--r2); max-width: 440px; padding: 28px 28px 28px; animation: modalIn .22s ease; }
  .modal-box.wide { max-width: 500px; }
  .modal-handle { display: none; }
  .modal-btns { flex-direction: row; }
  .modal-btn { width: auto; flex: 1; }
  .bottom-sheet  { display: none !important; }
  .sheet-overlay { display: none !important; }
  .user-dd { display: none; }
  .user-dd.open { display: block; }
}
@media (max-width: 768px) {
  .user-dd { display: none !important; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }
function generateProjectId(): string {
  let r = ''
  try {
    const a = new Uint8Array(12)
    crypto.getRandomValues(a)
    r = Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    const c = 'abcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 24; i++) r += c[Math.floor(Math.random() * c.length)]
  }
  return 'nxs_' + r + '_' + Date.now().toString(36)
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* ─────────────────────────────────────────────────────────────────────────────
   ICONS
───────────────────────────────────────────────────────────────────────────── */
const I = {
  bolt:          () => <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  folder:        () => <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  shield:        () => <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  plus:          () => <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  star:          () => <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  settings:      () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  logout:        () => <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  trash:         () => <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  search:        () => <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  calendar:      () => <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  info:          () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  wifi_off:      () => <svg viewBox="0 0 24 24"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>,
  check:         () => <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  cross:         () => <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  chevron:       () => <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>,
  arrow:         () => <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>,
  inbox:         () => <svg viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>,
  discord:       () => <svg viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>,
  play:          () => <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  download:      () => <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  warning:       () => <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  chevron_right: () => <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>,
  user:          () => <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  key:           () => <svg viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  lock:          () => <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  external:      () => <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  gift:          () => <svg viewBox="0 0 24 24"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>,
  zap:           () => <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  activity:      () => <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  credit_card:   () => <svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
}

/* ─────────────────────────────────────────────────────────────────────────────
   ACCOUNT MODAL
───────────────────────────────────────────────────────────────────────────── */
function AccountModal({
  session, userData, av, planLabel, planCls, creditsDisplay,
  allProjects, onClose, onLogout, claimDaily, dailyDisabled, dailyInfo,
}: {
  session: NexusSession | null
  userData: UserData
  av: string
  planLabel: string
  planCls: string
  creditsDisplay: string
  allProjects: Project[]
  onClose: () => void
  onLogout: () => void
  claimDaily: () => void
  dailyDisabled: boolean
  dailyInfo: string
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'plan' | 'security' | 'actions'>('overview')

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const joinDate = session?.loginTime
    ? new Date(session.loginTime).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'N/A'

  return (
    <div className="account-overlay" role="dialog" aria-modal="true" aria-label="Account" onClick={handleOverlayClick}>
      <div className="account-panel">

        {/* Sticky top bar */}
        <div className="acc-topbar">
          <div className="acc-topbar-title"><I.user />My Account</div>
          <button className="acc-close" onClick={onClose} aria-label="Close account">
            <I.cross />
          </button>
        </div>

        {/* Hero section */}
        <div className="acc-hero">
          <div className="acc-hero-inner">
            <div className="acc-avatar-wrap">
              <img
                className="acc-avatar"
                src={av}
                alt={`@${session?.user.username}`}
                onError={e => { (e.currentTarget as HTMLImageElement).src = '/images/nexusai.png' }}
              />
              <span className="acc-online-dot" title="Active session" />
            </div>
            <div className="acc-hero-info">
              {session?.user.displayName && (
                <div className="acc-display-name">{session.user.displayName}</div>
              )}
              <div className="acc-username">
                <span>@{session?.user.username || '—'}</span>
              </div>
              <div className="acc-roblox-id">Roblox ID: {session?.user.robloxId || '—'}</div>
              <div className="acc-badges">
                <span className={`acc-badge plan-${planCls || 'free'}`}>
                  <I.star />{planLabel} Plan
                </span>
                <span className="acc-badge credits">
                  <I.bolt />{creditsDisplay} CR
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="acc-tabs" role="tablist">
          {(['overview', 'plan', 'security', 'actions'] as const).map(tab => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={`acc-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'overview' ? 'Overview' :
               tab === 'plan'     ? 'Plan & Credits' :
               tab === 'security' ? 'Security' :
               'Quick Actions'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="acc-body">

          {/* ── OVERVIEW ── */}
          <div className={`acc-tab-panel${activeTab === 'overview' ? ' active' : ''}`} role="tabpanel">
            <div className="acc-stats-grid">
              <div className="acc-stat">
                <div className="acc-stat-val" style={{ color: 'var(--yellow)' }}>{creditsDisplay}</div>
                <div className="acc-stat-lbl">Credits</div>
              </div>
              <div className="acc-stat">
                <div className="acc-stat-val" style={{ color: 'var(--cyan)' }}>{allProjects.length}</div>
                <div className="acc-stat-lbl">Projects</div>
              </div>
              <div className="acc-stat">
                <div className="acc-stat-val" style={{ color: 'var(--green)', fontSize: 14 }}>{planLabel}</div>
                <div className="acc-stat-lbl">Current Plan</div>
              </div>
            </div>

            <div className="acc-section">
              <div className="acc-section-title">Account Details</div>
              <div className="acc-row">
                <span className="acc-row-label">Username</span>
                <span className="acc-row-value c">@{session?.user.username || '—'}</span>
              </div>
              {session?.user.displayName && (
                <div className="acc-row">
                  <span className="acc-row-label">Display Name</span>
                  <span className="acc-row-value">{session.user.displayName}</span>
                </div>
              )}
              <div className="acc-row">
                <span className="acc-row-label">Roblox ID</span>
                <span className="acc-row-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {session?.user.robloxId || '—'}
                </span>
              </div>
              <div className="acc-row">
                <span className="acc-row-label">Member Since</span>
                <span className="acc-row-value g">{joinDate}</span>
              </div>
              <div className="acc-row">
                <span className="acc-row-label">Daily Credits</span>
                <span className="acc-row-value" style={{ fontSize: 11, color: dailyDisabled ? 'var(--dim2)' : 'var(--green)' }}>
                  {dailyInfo}
                </span>
              </div>
            </div>

            {allProjects.length > 0 && (
              <div className="acc-section">
                <div className="acc-section-title">Recent Projects</div>
                {allProjects.slice(0, 3).map(p => (
                  <div className="acc-row" key={p.id}>
                    <span className="acc-row-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <I.folder />{p.name}
                    </span>
                    <span className="acc-row-value" style={{ fontSize: 10, color: 'var(--dim2)' }}>
                      {formatDateShort(p.createdAt)}
                    </span>
                  </div>
                ))}
                {allProjects.length > 3 && (
                  <div style={{ fontSize: 10, color: 'var(--dim2)', padding: '8px 0' }}>
                    +{allProjects.length - 3} more projects
                  </div>
                )}
              </div>
            )}

            <button className="acc-action" onClick={() => { onClose(); onLogout() }} style={{ marginTop: 4 }}>
              <I.logout />Sign Out of NEXUS AI
              <span className="action-arrow"><I.chevron_right /></span>
            </button>
          </div>

          {/* ── PLAN & CREDITS ── */}
          <div className={`acc-tab-panel${activeTab === 'plan' ? ' active' : ''}`} role="tabpanel">
            <div className="acc-section">
              <div className="acc-section-title">Your Current Plan</div>
              <div className="acc-plan-cards">
                <div className={`acc-plan-card${(userData.plan || 'free') === 'free' ? ' active-plan' : ''}`}>
                  <div className="acc-plan-name">FREE</div>
                  <div className="acc-plan-price">Free <span>forever</span></div>
                  {(userData.plan || 'free') === 'free' && <div className="acc-plan-badge">CURRENT</div>}
                  <div className="acc-plan-feat"><I.check />3 Projects</div>
                  <div className="acc-plan-feat"><I.check />30 Starting Credits</div>
                  <div className="acc-plan-feat"><I.check />+2 Daily Credits</div>
                  <div className="acc-plan-feat"><I.check />Studio Plugin Sync</div>
                </div>
                <div className={`acc-plan-card${(userData.plan || 'free') === 'pro' ? ' active-plan' : ''}`}>
                  <div className="acc-plan-name">PRO</div>
                  <div className="acc-plan-price" style={{ color: 'var(--cyan)' }}>Pro <span>plan</span></div>
                  {(userData.plan || 'free') === 'pro' && <div className="acc-plan-badge">CURRENT</div>}
                  <div className="acc-plan-feat"><I.check />10 Projects</div>
                  <div className="acc-plan-feat"><I.check />+25 Daily Credits</div>
                  <div className="acc-plan-feat"><I.check />Priority Support</div>
                  <div className="acc-plan-feat"><I.check />All Free Features</div>
                </div>
              </div>
            </div>

            <div className="acc-section">
              <div className="acc-section-title">Credits Balance</div>
              <div className="acc-row">
                <span className="acc-row-label">Available Credits</span>
                <span className="acc-row-value y" style={{ fontSize: 18, fontFamily: 'Orbitron, sans-serif' }}>
                  {creditsDisplay} CR
                </span>
              </div>
              <div className="acc-row">
                <span className="acc-row-label">Daily Claim</span>
                <span className="acc-row-value" style={{ fontSize: 11, color: dailyDisabled ? 'var(--dim2)' : 'var(--green)' }}>
                  {dailyInfo}
                </span>
              </div>
              <button
                className="acc-action"
                style={{ marginTop: 8, opacity: dailyDisabled ? .4 : 1 }}
                onClick={() => !dailyDisabled && claimDaily()}
                disabled={dailyDisabled}
              >
                <I.gift />Claim Daily Credits
                <span className="action-arrow"><I.chevron_right /></span>
              </button>
            </div>

            <button
              className="acc-action"
              onClick={() => window.open('/payment', '_self')}
            >
              <I.credit_card />Buy More Credits
              <span className="action-arrow"><I.chevron_right /></span>
            </button>
          </div>

          {/* ── SECURITY ── */}
          <div className={`acc-tab-panel${activeTab === 'security' ? ' active' : ''}`} role="tabpanel">
            <div className="acc-section">
              <div className="acc-section-title">Authentication</div>
              <div className="acc-row">
                <span className="acc-row-label">Login Method</span>
                <span className="acc-row-value g">Roblox OAuth</span>
              </div>
              <div className="acc-row">
                <span className="acc-row-label">Session Status</span>
                <span className="acc-row-value g" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                  Active
                </span>
              </div>
              <div className="acc-row">
                <span className="acc-row-label">Password Storage</span>
                <span className="acc-row-value" style={{ fontSize: 11, color: 'var(--green)' }}>Not stored by NEXUS</span>
              </div>
            </div>

            <div className="acc-security-note">
              <I.lock />
              <p>
                Your identity is managed entirely by <strong style={{ color: 'var(--text)' }}>Roblox</strong>.
                NEXUS AI does not store passwords or sensitive credentials.
                To update your email, username, or security settings,
                visit{' '}
                <a href="https://www.roblox.com/my/account#!/security" target="_blank" rel="noreferrer">
                  Roblox Account Settings ↗
                </a>
              </p>
            </div>

            <div className="acc-section" style={{ marginTop: 20 }}>
              <div className="acc-section-title">Session Management</div>
              <button className="acc-action danger" onClick={() => { onClose(); onLogout() }}>
                <I.logout />Sign Out of NEXUS AI
                <span className="action-arrow"><I.chevron_right /></span>
              </button>
            </div>
          </div>

          {/* ── QUICK ACTIONS ── */}
          <div className={`acc-tab-panel${activeTab === 'actions' ? ' active' : ''}`} role="tabpanel">
            <div className="acc-section">
              <div className="acc-section-title">Credits & Payments</div>
              <button className="acc-action" onClick={() => window.open('/payment', '_self')}>
                <I.bolt />Buy More Credits
                <span className="action-arrow"><I.chevron_right /></span>
              </button>
              <button
                className="acc-action"
                onClick={() => !dailyDisabled && claimDaily()}
                style={{ opacity: dailyDisabled ? .4 : 1 }}
              >
                <I.gift />Claim Daily Credits — {dailyInfo}
                <span className="action-arrow"><I.chevron_right /></span>
              </button>
            </div>

            <div className="acc-section">
              <div className="acc-section-title">Community & Resources</div>
              <button className="acc-action" onClick={() => window.open('https://discord.gg/FzAF48mvK5', '_blank')}>
                <I.discord />Join Discord Community
                <span className="action-arrow"><I.chevron_right /></span>
              </button>
              <button className="acc-action" onClick={() => window.open('/inbox', '_self')}>
                <I.inbox />Inbox & Notifications
                <span className="action-arrow"><I.chevron_right /></span>
              </button>
            </div>

            <div className="acc-section">
              <div className="acc-section-title">Studio Integration</div>
              <button
                className="acc-action"
                onClick={() => window.open('https://create.roblox.com/store/asset/91870814099475/NEXUS-AI', '_blank')}
              >
                <I.download />Download Studio Plugin
                <span className="action-arrow"><I.chevron_right /></span>
              </button>
            </div>

            <div className="acc-section" style={{ marginTop: 4 }}>
              <button className="acc-action danger" onClick={() => { onClose(); onLogout() }}>
                <I.logout />Sign Out
                <span className="action-arrow"><I.chevron_right /></span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [loaded,       setLoaded]       = useState(false)
  const [loaderPct,    setLoaderPct]    = useState(0)
  const [session,      setSession]      = useState<NexusSession | null>(null)
  const [userData,     setUserData]     = useState<UserData>({})
  const [pendingQueue, setPendingQueue] = useState<QueueItem[]>([])
  const [isOnline,     setIsOnline]     = useState(true)
  const [syncState,    setSyncState]    = useState<'' | 'syncing' | 'error' | 'ok'>('')
  const [saveState,    setSaveState]    = useState<{ state: string; msg: string } | null>(null)
  const [ddOpen,       setDdOpen]       = useState(false)
  const [sheetOpen,    setSheetOpen]    = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deleteModal,  setDeleteModal]  = useState<{ id: string; name: string } | null>(null)
  const [logoutModal,  setLogoutModal]  = useState(false)
  const [accountOpen,  setAccountOpen]  = useState(false)
  const [searchQ,      setSearchQ]      = useState('')
  const [sortBy,       setSortBy]       = useState<'newest' | 'oldest' | 'name'>('newest')
  const [projectName,  setProjectName]  = useState('')
  const [creating,     setCreating]     = useState(false)
  const [redeemCode,   setRedeemCode]   = useState('')
  const [redeemMsg,    setRedeemMsg]    = useState<{ msg: string; ok: boolean } | null>(null)
  const [dailyInfo,    setDailyInfo]    = useState('')
  const [dailyDisabled, setDailyDisabled] = useState(false)
  const [inputError,   setInputError]   = useState(false)

  const sessionRef  = useRef<NexusSession | null>(null)
  const userDataRef = useRef<UserData>({})

  useEffect(() => { sessionRef.current  = session  }, [session])
  useEffect(() => { userDataRef.current = userData }, [userData])
  useEffect(() => { document.title = 'NEXUS AI — Dashboard' }, [])
  useEffect(() => { initDashboard() }, [])           // eslint-disable-line
  useEffect(() => { updateDailyStatus(userData) }, [userData])

  useEffect(() => {
    if (!saveState) return
    let t: ReturnType<typeof setTimeout>
    if (saveState.state === 'saved') t = setTimeout(() => setSaveState(null), 3000)
    if (saveState.state === 'error') t = setTimeout(() => setSaveState(null), 6000)
    return () => clearTimeout(t)
  }, [saveState])

  useEffect(() => {
    document.body.style.overflow = accountOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [accountOpen])

  /* Online/offline */
  useEffect(() => {
    const on  = () => { setIsOnline(true); setTimeout(retryQueue, 1200) }
    const off = () => setIsOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    setIsOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Dropdown close on outside click */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const w = document.getElementById('userPillWrap')
      if (w && !w.contains(e.target as Node)) setDdOpen(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])

  /* Keyboard shortcuts */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (accountOpen)  { setAccountOpen(false);  return }
        if (settingsOpen) { setSettingsOpen(false);  return }
        if (deleteModal)  { setDeleteModal(null);    return }
        if (logoutModal)  { setLogoutModal(false);   return }
        setDdOpen(false); setSheetOpen(false)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        document.getElementById('projNameInput')?.focus()
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [accountOpen, settingsOpen, deleteModal, logoutModal])

  /* ── INIT ── */
  async function initDashboard() {
    setLoaderPct(15)
    const raw = localStorage.getItem('nexus_session')
    if (!raw) { window.location.replace('/'); return }
    let sess: NexusSession
    try {
      sess = JSON.parse(raw)
      if (!sess?.user?.username) throw new Error('no user')
      if (Date.now() - (sess.loginTime || 0) > SESSION_MAX_AGE_MS) throw new Error('expired')
    } catch {
      localStorage.removeItem('nexus_session')
      window.location.replace('/')
      return
    }
    setSession(sess); sessionRef.current = sess
    try {
      const q = JSON.parse(localStorage.getItem('nexus_pending_queue') || '[]')
      if (Array.isArray(q)) setPendingQueue(q)
    } catch {}
    setLoaderPct(40)
    const ud = await syncFromServer(sess)
    setUserData(ud); userDataRef.current = ud
    setLoaderPct(90)
    setLoaderPct(100)
    setTimeout(() => setLoaded(true), 320)
    if (navigator.onLine) setTimeout(retryQueue, 2200)
  }

  async function syncFromServer(sess: NexusSession): Promise<UserData> {
    try {
      const username = (sess.user.username || '').toLowerCase()
      const ctrl = new AbortController()
      const tid  = setTimeout(() => ctrl.abort(), 8000)
      const r    = await fetch(`${API_SYNC}?user=${encodeURIComponent(username)}`, { signal: ctrl.signal })
      clearTimeout(tid)
      if (r.ok) {
        const d = await r.json()
        if (d && typeof d === 'object') {
          if (!Array.isArray(d.projects)) d.projects = []
          const updated = { ...sess, data: { ...(sess.data || {}), ...d } }
          localStorage.setItem('nexus_session', JSON.stringify(updated))
          sessionRef.current = updated; setSession(updated)
          return d as UserData
        }
      }
    } catch (e: unknown) {
      const err = e as Error
      console.warn('[NEXUS] sync:', err.name === 'AbortError' ? 'timeout' : err.message)
    }
    const fallback = { ...(sess.data || {}) } as UserData
    if (!Array.isArray(fallback.projects)) fallback.projects = []
    return fallback
  }

  const saveLocal = useCallback((ud: UserData, sess: NexusSession) => {
    try {
      const updated = { ...sess, data: { ...(sess.data || {}), ...ud } }
      localStorage.setItem('nexus_session', JSON.stringify(updated))
      sessionRef.current = updated; setSession(updated)
    } catch {}
  }, [])

  async function saveToServer(ud: UserData, sess: NexusSession, showStatus?: boolean): Promise<boolean> {
    saveLocal(ud, sess)
    if (showStatus) setSaveState({ state: 'saving', msg: 'Saving...' })
    setSyncState('syncing')
    const payload: QueueItem['payload'] = {
      user:     (sess.user.username || '').toLowerCase(),
      robloxId: sess.user.robloxId || '',
      data: {
        projects:    ud.projects    || [],
        lastClaim:   ud.lastClaim   || null,
        avatar:      sess.user.avatar      || '',
        displayName: sess.user.displayName || '',
        robloxId:    sess.user.robloxId    || '',
      }
    }
    const ok = await attemptSave(payload, RETRY_MAX, showStatus, ud)
    if (ok) {
      setSyncState('ok'); setTimeout(() => setSyncState(''), 1500); return true
    } else {
      setSyncState('error'); setTimeout(() => setSyncState(''), 3000)
      enqueueSave(payload)
      if (showStatus) setSaveState({ state: 'error', msg: isOnline ? 'Save failed — queued for retry' : 'Offline — queued for retry' })
      return false
    }
  }

  async function attemptSave(payload: QueueItem['payload'], maxRetry: number, showStatus: boolean | undefined, ud: UserData): Promise<boolean> {
    let delay = RETRY_BASE
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      try {
        const ctrl = new AbortController()
        const tid  = setTimeout(() => ctrl.abort(), 9000)
        const r    = await fetch(API_SYNC, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
          signal:  ctrl.signal,
        })
        clearTimeout(tid)
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const result = await r.json()
        if (result.success || result.data) {
          if (result.data) {
            const newUd = { ...ud }
            if (result.data.credits  !== undefined)  newUd.credits  = result.data.credits
            if (result.data.plan)                    newUd.plan     = result.data.plan
            if (result.data.roles)                   newUd.roles    = result.data.roles
            if (Array.isArray(result.data.projects)) newUd.projects = result.data.projects
            setUserData(newUd); userDataRef.current = newUd
            if (sessionRef.current) saveLocal(newUd, sessionRef.current)
          }
          if (showStatus) setSaveState({ state: 'saved', msg: 'Saved successfully' })
          return true
        }
        throw new Error(result.error || 'Server rejected')
      } catch (e: unknown) {
        const err = e as Error
        console.warn(`[NEXUS] save attempt ${attempt}/${maxRetry}:`, err.name === 'AbortError' ? 'timeout' : err.message)
        if (attempt < maxRetry) {
          if (showStatus) setSaveState({ state: 'retry', msg: `Retrying... (${attempt}/${maxRetry})` })
          await sleep(delay)
          delay = Math.min(delay * 2, 6000)
        }
      }
    }
    return false
  }

  function enqueueSave(payload: QueueItem['payload']) {
    setPendingQueue(q => {
      const newQ = [...q, { type: 'save', payload, ts: Date.now() }]
      localStorage.setItem('nexus_pending_queue', JSON.stringify(newQ))
      return newQ
    })
  }

  async function retryQueue() {
    if (!navigator.onLine) return
    setPendingQueue(q => {
      if (q.length === 0) return q
      const toRetry = [...q]
      localStorage.setItem('nexus_pending_queue', JSON.stringify([]))
      ;(async () => {
        const failed: QueueItem[] = []
        for (const item of toRetry) {
          if (item.type === 'save') {
            const ok = await attemptSave(item.payload, 1, false, userDataRef.current)
            if (!ok) failed.push(item)
          }
        }
        if (failed.length > 0) {
          setPendingQueue(prev => {
            const combined = [...prev, ...failed]
            localStorage.setItem('nexus_pending_queue', JSON.stringify(combined))
            return combined
          })
        } else if (toRetry.length > 0) {
          showToast('All changes synced to server', 'var(--green)')
        }
      })()
      return []
    })
  }

  async function notifyPlugin(projectId: string, projectName: string) {
    if (!sessionRef.current) return
    const username = (sessionRef.current.user.username || '').toLowerCase()
    try {
      await fetch(API_CONTROL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'set_project', _user: username, user: username, projectId, projectName }),
      })
    } catch {}
  }

  /* ── COMPUTED ── */
  function getCredits(ud: UserData) {
    const c         = ud.credits ?? sessionRef.current?.data?.credits ?? 30
    const plan      = (ud.plan || 'free').toLowerCase()
    const roles     = ud.roles || []
    const unlimited = plan === 'owner' || plan === 'unlimited' || roles.includes('owner')
    return { display: unlimited ? '∞' : parseFloat(String(c)).toFixed(0), unlimited }
  }

  function getPlanInfo(ud: UserData) {
    const plan  = (ud.plan || 'free').toLowerCase()
    const roles = ud.roles || []
    if (plan === 'owner' || roles.includes('owner')) return { label: 'OWNER', cls: 'owner' }
    if (roles.includes('admin'))                     return { label: 'ADMIN', cls: 'pro' }
    if (plan === 'pro')                              return { label: 'PRO',   cls: 'pro' }
    return { label: 'FREE', cls: '' }
  }

  function getLimit(ud: UserData) {
    const plan  = (ud.plan || 'free').toLowerCase()
    const roles = ud.roles || []
    if (plan === 'owner' || roles.includes('owner') || roles.includes('admin')) return 999
    return plan === 'pro' ? 10 : 3
  }

  function updateDailyStatus(ud: UserData) {
    const plan  = (ud.plan || 'free').toLowerCase()
    const roles = ud.roles || []
    if (plan === 'owner' || roles.includes('owner') || roles.includes('admin')) {
      setDailyInfo('Unlimited credits active'); setDailyDisabled(true); return
    }
    const last = ud.lastClaim
    if (last) {
      const diff = (Date.now() - new Date(last).getTime()) / 3_600_000
      if (diff < 24) {
        setDailyInfo(`Next claim in ${Math.ceil(24 - diff)}h`); setDailyDisabled(true); return
      }
    }
    setDailyInfo('Daily credits available'); setDailyDisabled(false)
  }

  /* ── HANDLERS ── */
  function handleNameChange(val: string) {
    if (val.length <= PROJECT_NAME_LIMIT) {
      setProjectName(val)
      if (inputError) setInputError(false)
    }
  }

  async function handleCreate() {
    if (!projectName.trim()) {
      setInputError(true)
      setTimeout(() => setInputError(false), 1800)
      showToast('Enter a project name first', 'var(--yellow)'); return
    }
    const limit = getLimit(userData)
    if ((userData.projects || []).length >= limit) {
      showToast('Project limit reached — upgrade to Pro', 'var(--pink)'); return
    }
    setCreating(true)
    const pid  = generateProjectId()
    const proj: Project = { id: pid, name: projectName.trim(), createdAt: new Date().toISOString() }
    const newUd = { ...userData, projects: [proj, ...(userData.projects || [])] }
    setUserData(newUd); userDataRef.current = newUd
    if (sessionRef.current) saveLocal(newUd, sessionRef.current)
    setProjectName('')
    const saved = sessionRef.current ? await saveToServer(newUd, sessionRef.current, true) : false
    setCreating(false)
    showToast(
      saved ? 'Project created — opening chat...' : 'Saved locally — will sync when online',
      saved ? 'var(--green)' : 'var(--orange)',
      saved ? 1800 : 2500,
    )
    await notifyPlugin(pid, proj.name)
    setTimeout(() => { window.location.href = '/chats/' + encodeURIComponent(pid) }, 900)
  }

  async function openProject(id: string, name: string) {
    await notifyPlugin(id, name)
    window.location.href = '/chats/' + encodeURIComponent(id)
  }

  async function executeDelete(id: string) {
    setDeleteModal(null)
    const newUd = { ...userData, projects: (userData.projects || []).filter(p => p.id !== id) }
    setUserData(newUd); userDataRef.current = newUd
    if (sessionRef.current) {
      const ok = await saveToServer(newUd, sessionRef.current)
      showToast(ok ? 'Project deleted' : 'Deleted locally — will sync when online', ok ? 'var(--dim2)' : 'var(--orange)')
    }
  }

  async function claimDaily() {
    const plan  = (userData.plan || 'free').toLowerCase()
    const roles = userData.roles || []
    if (plan === 'owner' || roles.includes('owner') || roles.includes('admin')) return
    const n = plan === 'pro' ? 25 : 2
    const newUd = { ...userData, credits: (parseFloat(String(userData.credits)) || 0) + n, lastClaim: new Date().toISOString() }
    setUserData(newUd); userDataRef.current = newUd
    if (sessionRef.current) await saveToServer(newUd, sessionRef.current)
    showToast(`+${n} CR claimed!`, 'var(--green)')
  }

  async function handleRedeem() {
    if (!redeemCode.trim()) { showToast('Enter a redeem code', 'var(--yellow)'); return }
    const code = redeemCode.trim().toUpperCase()
    setRedeemMsg(null)
    try {
      const r = await fetch('/api/redeem', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          code,
          user:   (session?.user.username || '').toLowerCase(),
          userId: session?.user.robloxId || '',
        })
      })
      const d = await r.json()
      if (d.success) {
        const newUd = { ...userData, credits: (parseFloat(String(userData.credits)) || 0) + parseFloat(d.credits || 0) }
        setUserData(newUd); userDataRef.current = newUd
        if (sessionRef.current) await saveToServer(newUd, sessionRef.current)
        setRedeemMsg({ msg: `+${d.credits} CR redeemed successfully!`, ok: true })
        setRedeemCode('')
      } else {
        setRedeemMsg({ msg: d.error || 'Invalid code', ok: false })
      }
    } catch {
      setRedeemMsg({ msg: 'Failed to connect to server', ok: false })
    }
  }

  function doLogout() { localStorage.removeItem('nexus_session'); window.location.replace('/') }

  function openMenu() {
    const isMobile = window.innerWidth <= 768
    if (isMobile) setSheetOpen(true)
    else setDdOpen(o => !o)
  }

  function openAccountModal() {
    setDdOpen(false); setSheetOpen(false); setSettingsOpen(false); setAccountOpen(true)
  }

  function showToast(msg: string, color?: string, dur?: number) {
    document.querySelectorAll('.nx-toast').forEach(t => t.remove())
    const t = document.createElement('div')
    t.className = 'nx-toast in'
    t.style.color = color || 'var(--cyan)'
    const isWarn = color === 'var(--pink)' || color === 'var(--yellow)' || color === 'var(--orange)'
    t.innerHTML = isWarn
      ? `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>${esc(msg)}</span>`
      : `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>${esc(msg)}</span>`
    document.body.appendChild(t)
    const total = dur || 2800
    setTimeout(() => { t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 250) }, total)
  }

  /* ── DERIVED ── */
  const av = session?.user?.avatar
    || (session?.user?.robloxId
      ? `https://www.roblox.com/headshot-thumbnail/image?userId=${session.user.robloxId}&width=150&height=150&format=png`
      : '/images/nexusai.png')

  const { display: creditsDisplay }        = getCredits(userData)
  const { label: planLabel, cls: planCls } = getPlanInfo(userData)
  const limit     = getLimit(userData)
  const unlimited = limit === 999
  const allProjects = userData.projects || []
  const atLimit   = allProjects.length >= limit

  const filtered = (searchQ
    ? allProjects.filter(p => p.name.toLowerCase().includes(searchQ.toLowerCase()))
    : [...allProjects])
  if      (sortBy === 'newest') filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  else if (sortBy === 'oldest') filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  else                          filtered.sort((a, b) => a.name.localeCompare(b.name))

  const pendingIds   = new Set(pendingQueue.flatMap(q => (q.payload?.data?.projects || []).map((p: Project) => p.id)))
  const charLen      = projectName.length
  const charCls      = charLen >= PROJECT_NAME_LIMIT ? 'over' : charLen >= PROJECT_NAME_LIMIT - 3 ? 'warn' : ''
  const saveStateCls = saveState ? `save-status show-${saveState.state}` : 'save-status'

  /* ── SHARED MENU CONTENT ── */
  const menuContent = (onAction: () => void, mobile = false) => {
    const Wrap   = mobile ? 'div' : 'div'
    const Item   = mobile ? 'button' : 'button'
    const ic     = mobile ? 'sheet-item' : 'dd-item'
    const header = mobile ? 'sheet-header' : 'dd-header'
    const av_cls = mobile ? 'sheet-av' : 'dd-av'
    const name_cls = mobile ? 'sheet-name' : 'dd-name'
    const sub_cls  = mobile ? 'sheet-sub'  : 'dd-sub'
    const div_cls  = mobile ? 'sheet-divider' : 'dd-divider'
    const badge_cls = mobile ? 'sheet-badge' : 'dd-badge'
    return (
      <>
        <div className={header}>
          <img className={av_cls} src={av} alt="" onError={e => { (e.currentTarget as HTMLImageElement).src = '/images/nexusai.png' }} />
          <div>
            <div className={name_cls}>@{session?.user.username}</div>
            <div className={sub_cls}>{planLabel} · {creditsDisplay} CR</div>
          </div>
        </div>
        <div className={mobile ? '' : 'dd-section'}>
          <button className={ic} onClick={() => { onAction(); openAccountModal() }}>
            <I.user />My Account
          </button>
          <button className={ic} onClick={() => { setSettingsOpen(true); onAction() }}>
            <I.settings />Settings
          </button>
          <a className={ic} href="/payment" onClick={onAction}>
            <I.bolt />Buy Credits <span className={badge_cls}>{creditsDisplay} CR</span>
          </a>
          <a className={ic} href="/inbox" onClick={onAction}>
            <I.inbox />Inbox
          </a>
          <a className={ic} href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noreferrer" onClick={onAction}>
            <I.discord />Discord
          </a>
        </div>
        <div className={div_cls} />
        <div className={mobile ? '' : 'dd-section'}>
          <button className={ic} onClick={() => { claimDaily(); onAction() }}>
            <I.calendar />{dailyDisabled ? dailyInfo : 'Claim Daily Credits'}
          </button>
        </div>
        <div className={div_cls} />
        <div className={mobile ? '' : 'dd-section'}>
          <button className={`${ic} danger`} onClick={() => { setLogoutModal(true); onAction() }}>
            <I.logout />Sign Out
          </button>
        </div>
        {mobile && (
          <div className="sheet-footer">
            <button className="sheet-close" onClick={onAction}>Close</button>
          </div>
        )}
      </>
    )
  }

  /* ── RENDER ── */
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* Sync bar */}
      <div id="syncBar" className={syncState} />

      {/* Offline banner */}
      <div id="offlineBanner" className={!isOnline ? 'show' : ''}>
        <I.wifi_off />
        No connection — changes are saved locally
        <button className="btn-retry-offline" onClick={retryQueue}>Retry</button>
      </div>

      {/* Account modal */}
      {accountOpen && (
        <AccountModal
          session={session}
          userData={userData}
          av={av}
          planLabel={planLabel}
          planCls={planCls}
          creditsDisplay={creditsDisplay}
          allProjects={allProjects}
          onClose={() => setAccountOpen(false)}
          onLogout={() => setLogoutModal(true)}
          claimDaily={claimDaily}
          dailyDisabled={dailyDisabled}
          dailyInfo={dailyInfo}
        />
      )}

      {/* Loader */}
      <div id="dash-loader" className={loaded ? 'hide' : ''} role="status" aria-label="Loading">
        <div className="loader-wordmark">NEXUS AI</div>
        <div className="loader-ring" aria-hidden="true" />
        <div className="loader-track">
          <div className="loader-bar" style={{ width: loaderPct + '%' }} />
        </div>
        <div className="loader-label">Loading workspace...</div>
      </div>

      {/* Nav */}
      <nav className="dnav" role="navigation" aria-label="Main navigation">
        <a className="dnav-brand" onClick={() => window.location.href = '/dashboard'} role="link" tabIndex={0}>
          <div className="dnav-brand-icon">
            <img src="/images/nexusai.png" alt="NEXUS AI" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          </div>
          <span className="dnav-wordmark">NEXUS AI</span>
        </a>

        <div className="dnav-right">
          <a href="/payment" className="credits-chip" title="Buy credits">
            <I.bolt />{creditsDisplay} CR
          </a>

          <div className="user-pill-wrap" id="userPillWrap">
            <div
              className={`user-pill${ddOpen ? ' open' : ''}`}
              onClick={openMenu}
              role="button" aria-expanded={ddOpen || sheetOpen} aria-label="User menu"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu() } }}
            >
              <img className="user-av-sm" src={av} alt="" onError={e => { (e.currentTarget as HTMLImageElement).src = '/images/nexusai.png' }} />
              <span className="user-name-pill">@{session?.user.username || '...'}</span>
              <svg className="user-caret" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </div>

            {/* Desktop dropdown */}
            <div className={`user-dd${ddOpen ? ' open' : ''}`} role="menu">
              {menuContent(() => setDdOpen(false), false)}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile bottom sheet */}
      <div className={`sheet-overlay${sheetOpen ? ' show' : ''}`} onClick={() => setSheetOpen(false)} aria-hidden="true" />
      <div className={`bottom-sheet${sheetOpen ? ' show' : ''}`} role="dialog" aria-modal="true" aria-label="Menu">
        <div className="sheet-handle" />
        {menuContent(() => setSheetOpen(false), true)}
      </div>

      {/* Main */}
      <main className="dash-main" role="main">

        {/* Page header */}
        <header className="page-header">
          <div className="ph-left">
            <div className="ph-avatar" onClick={openAccountModal} title="Manage your account">
              <img src={av} alt={`@${session?.user.username}`} onError={e => { (e.currentTarget as HTMLImageElement).src = '/images/nexusai.png' }} />
            </div>
            <div className="ph-info">
              <h1>Welcome, <span>{session?.user.username || 'Developer'}</span></h1>
              <p>Select a project below to start chatting with NEXUS AI</p>
            </div>
          </div>
          <a href="/payment" className={`plan-badge${planCls ? ' ' + planCls : ''}`}>
            <I.star />{planLabel} PLAN
          </a>
        </header>

        {/* Stats */}
        <div className="stats-row" role="region" aria-label="Account statistics">
          <div className="stat-card">
            <div className="stat-icon yellow"><I.bolt /></div>
            <div>
              <div className="stat-val">{creditsDisplay}</div>
              <div className="stat-lbl">Credits Available</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon cyan"><I.folder /></div>
            <div>
              <div className="stat-val">{allProjects.length}</div>
              <div className="stat-lbl">Total Projects</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green"><I.shield /></div>
            <div>
              <div className="stat-val">{planLabel}</div>
              <div className="stat-lbl">Current Plan</div>
            </div>
          </div>
        </div>

        {/* Create card */}
        <section className="create-card" aria-label="Create new project">
          <div className="create-header">
            <div className="create-title"><I.plus />New Project</div>
            <div className="limit-chip">
              <span className="used">{allProjects.length}</span>
              <span style={{ opacity: .3 }}>/</span>
              <span>{unlimited ? '∞' : limit}</span>
              &nbsp;used
            </div>
          </div>

          <div className="input-wrap">
            <div className="input-row">
              <input
                id="projNameInput"
                type="text"
                className={`proj-input${inputError ? ' err' : ''}`}
                placeholder="Project name (max 16 characters)..."
                maxLength={PROJECT_NAME_LIMIT}
                value={projectName}
                disabled={atLimit || creating}
                onChange={e => handleNameChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                aria-label="Project name"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className={`btn-create${creating ? ' loading' : ''}`}
                disabled={atLimit || creating}
                onClick={handleCreate}
                aria-label="Create project"
              >
                <div className="btn-spinner" aria-hidden="true" />
                <span className="btn-lbl">CREATE</span>
                <span className="btn-lbl"><I.chevron_right /></span>
              </button>
            </div>

            <div className="input-foot">
              <span className="input-hint">
                <I.info />Letters, numbers, spaces · max {PROJECT_NAME_LIMIT} characters
              </span>
              <span className={`char-cnt ${charCls}`} aria-live="polite">
                {charLen} / {PROJECT_NAME_LIMIT}
              </span>
            </div>
          </div>

          {saveState && (
            <div className={saveStateCls} role="status" aria-live="polite">
              <I.check /><span>{saveState.msg}</span>
            </div>
          )}

          {pendingQueue.length > 0 && (
            <div className="queue-notice show" role="alert">
              <I.info />
              <p><strong>{pendingQueue.length}</strong> unsaved change{pendingQueue.length !== 1 ? 's' : ''} — will sync when online.</p>
              <button className="queue-retry" onClick={retryQueue}>Retry Now</button>
            </div>
          )}

          <div className="info-box" role="note">
            <I.info />
            <p>
              <strong>A project is required to start chatting.</strong> Each project has its own isolated chat history and syncs automatically with your Roblox Studio plugin. Press <strong>Ctrl+N</strong> to quickly focus the input.
            </p>
          </div>
        </section>

        {/* Search & Sort */}
        <div className="filter-row" role="search">
          <div className="search-wrap">
            <I.search />
            <input
              type="search"
              className="search-input"
              placeholder="Search projects..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              aria-label="Search projects"
            />
          </div>
          <select
            className="sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'newest' | 'oldest' | 'name')}
            aria-label="Sort order"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">A – Z</option>
          </select>
        </div>

        {/* Section header */}
        <div className="section-hdr">
          <h2>Your Projects</h2>
          <div className="section-line" />
          <div className="section-count">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Project grid */}
        <div className="projects-grid" role="list" aria-label="Projects">
          {filtered.length === 0 ? (
            searchQ ? (
              <div className="empty-state" role="listitem">
                <div className="empty-icon"><I.search /></div>
                <strong>No results found</strong>
                <p>No projects match &quot;<strong>{searchQ}</strong>&quot;. Try a different search term.</p>
              </div>
            ) : (
              <div className="empty-state" role="listitem">
                <div className="empty-icon"><I.folder /></div>
                <strong>No projects yet</strong>
                <p>Create your first project above to start chatting with NEXUS AI.<br/>Each project keeps its own isolated chat history.</p>
                <div className="empty-hint"><I.plus />Type a name above and press CREATE</div>
              </div>
            )
          ) : (
            filtered.map((p, i) => (
              <div
                key={p.id}
                className={`project-card card-enter${pendingIds.has(p.id) ? ' pending-save' : ''}`}
                style={{ animationDelay: `${i * 0.055}s` }}
                onClick={() => openProject(p.id, p.name)}
                role="listitem"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProject(p.id, p.name) } }}
                aria-label={`Open project ${p.name}`}
              >
                <div className="card-top">
                  <div className="card-icon"><I.folder /></div>
                  <div className="card-top-right">
                    <span className="card-id-tag" title={p.id}>{p.id.slice(0, 12)}…</span>
                    <button
                      className="btn-delete"
                      title="Delete project"
                      onClick={e => { e.stopPropagation(); setDeleteModal({ id: p.id, name: p.name }) }}
                      aria-label={`Delete ${p.name}`}
                    >
                      <I.trash />
                    </button>
                  </div>
                </div>
                <div className="card-name" title={p.name}>{p.name}</div>
                <div className="card-desc">Roblox AI project · isolated chat history · Studio sync</div>
                <div className="card-footer">
                  <span className="card-date"><I.calendar />{formatDate(p.createdAt)}</span>
                  <span className={`card-status${pendingIds.has(p.id) ? ' pending' : ''}`}>
                    <span className="status-dot" />
                    {pendingIds.has(p.id) ? 'Syncing' : 'Active'}
                  </span>
                </div>
                <div className="card-open-btn" aria-hidden="true">
                  <I.play />OPEN PROJECT
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Delete modal */}
      <div
        className={`overlay${deleteModal ? ' show' : ''}`}
        onClick={e => { if (e.target === e.currentTarget) setDeleteModal(null) }}
        role="dialog" aria-modal="true" aria-label="Confirm delete"
      >
        <div className="modal-box">
          <div className="modal-handle" />
          <div className="modal-icon"><I.trash /></div>
          <div className="modal-title">Delete Project?</div>
          <div className="modal-desc">
            Permanently delete <span className="highlight">&quot;{deleteModal?.name}&quot;</span>?
            All chat history will be removed. This action cannot be undone.
          </div>
          <div className="modal-btns">
            <button className="modal-btn cancel" onClick={() => setDeleteModal(null)}>Cancel</button>
            <button className="modal-btn danger" onClick={() => deleteModal && executeDelete(deleteModal.id)}>Delete</button>
          </div>
        </div>
      </div>

      {/* Logout modal */}
      <div
        className={`overlay${logoutModal ? ' show' : ''}`}
        onClick={e => { if (e.target === e.currentTarget) setLogoutModal(false) }}
        role="dialog" aria-modal="true" aria-label="Confirm sign out"
      >
        <div className="modal-box">
          <div className="modal-handle" />
          <div className="modal-icon"><I.logout /></div>
          <div className="modal-title">Sign Out?</div>
          <div className="modal-desc">
            You will be signed out of NEXUS AI. Your projects and chat history are safely stored on the server.
          </div>
          <div className="modal-btns">
            <button className="modal-btn cancel" onClick={() => setLogoutModal(false)}>Cancel</button>
            <button className="modal-btn danger" onClick={doLogout}>Sign Out</button>
          </div>
        </div>
      </div>

      {/* Settings modal */}
      <div
        className={`overlay${settingsOpen ? ' show' : ''}`}
        onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}
        role="dialog" aria-modal="true" aria-label="Settings"
      >
        <div className="modal-box wide">
          <div className="modal-handle" />
          <div className="settings-hdr">
            <div className="settings-title"><I.settings />Settings</div>
            <button className="settings-close" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
              <I.cross />
            </button>
          </div>

          {/* Roblox Account */}
          <div className="settings-sec">
            <div className="settings-sec-title">Roblox Account</div>
            <div className="settings-av-row">
              <img className="settings-av" src={av} alt="" onError={e => { (e.currentTarget as HTMLImageElement).src = '/images/nexusai.png' }} />
              <div>
                <div className="settings-av-name">@{session?.user.username}</div>
                <div className="settings-av-id">Roblox ID: {session?.user.robloxId || '–'}</div>
              </div>
            </div>
            <div className="settings-row">
              <label>Credits</label>
              <span className="s-val y">{creditsDisplay} CR</span>
            </div>
            <div className="settings-row">
              <label>Current Plan</label>
              <span className="s-val c">{planLabel}</span>
            </div>
            <div className="settings-row">
              <label>Manage account</label>
              <button className="settings-btn" onClick={openAccountModal}>My Account</button>
            </div>
          </div>

          {/* Daily Credits */}
          <div className="settings-sec">
            <div className="settings-sec-title">Daily Credits</div>
            <div className="settings-row"><label>Free plan</label><span style={{ color: 'var(--green)', fontSize: 12 }}>+2 CR / day</span></div>
            <div className="settings-row"><label>Pro plan</label><span style={{ color: 'var(--cyan)', fontSize: 12 }}>+25 CR / day</span></div>
            <div className="settings-row">
              <span style={{ fontSize: 11, color: 'var(--dim2)', flex: 1 }}>{dailyInfo}</span>
              <button className="settings-btn success" disabled={dailyDisabled} onClick={claimDaily}>
                <I.gift />Claim
              </button>
            </div>
          </div>

          {/* Redeem Code */}
          <div className="settings-sec">
            <div className="settings-sec-title">Redeem Code</div>
            <div style={{ fontSize: 11, color: 'var(--dim2)', marginBottom: 10 }}>
              Get codes on{' '}
              <a href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)', textDecoration: 'none' }}>
                NEXUS STUDIO Discord ↗
              </a>
            </div>
            <div className="redeem-row">
              <input
                type="text"
                className="redeem-input"
                placeholder="Enter redeem code..."
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRedeem() }}
                aria-label="Redeem code"
                autoComplete="off"
                autoCapitalize="characters"
              />
              <button className="settings-btn" onClick={handleRedeem}>Redeem</button>
            </div>
            {redeemMsg && (
              <div className="redeem-msg" style={{ color: redeemMsg.ok ? 'var(--green)' : 'var(--pink)' }} role="alert">
                {redeemMsg.msg}
              </div>
            )}
          </div>

          {/* Studio Plugin */}
          <div className="settings-sec">
            <div className="settings-sec-title">Studio Plugin</div>
            <div className="settings-row">
              <label>NEXUS AI Plugin for Roblox Studio</label>
              <button className="settings-btn" onClick={() => window.open('https://create.roblox.com/store/asset/91870814099475/NEXUS-AI', '_blank')}>
                <I.download />Download
              </button>
            </div>
          </div>

          {/* Danger */}
          <div className="settings-sec">
            <div className="settings-sec-title" style={{ color: 'var(--pink)', opacity: .8 }}>Session</div>
            <div className="settings-row">
              <label>Sign out of this session</label>
              <button className="settings-btn danger" onClick={() => { setSettingsOpen(false); setLogoutModal(true) }}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}