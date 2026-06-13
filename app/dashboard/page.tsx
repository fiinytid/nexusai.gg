'use client'

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
const API_SYNC    = '/api/sync'
const API_CONTROL = '/api/control'
const RETRY_MAX   = 4
const RETRY_BASE  = 800
const PROJECT_NAME_LIMIT = 16
const SESSION_TTL = 86400000 * 7 // 7 days

/* ─────────────────────────────────────────────────────────────────────────────
   CSS — MOBILE-FIRST, NO EMOJIS, FULL ICON SYSTEM
───────────────────────────────────────────────────────────────────────────── */
const PAGE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600&display=swap');

:root {
  --bg:      #020210;
  --bg2:     #07071c;
  --bg3:     #0c0c24;
  --bg4:     #10102c;
  --cyan:    #00d4ff;
  --cyan2:   #00a8cc;
  --purple:  #7c3aed;
  --pink:    #f43f5e;
  --green:   #10b981;
  --yellow:  #f59e0b;
  --orange:  #f97316;
  --text:    #cbd5e1;
  --text2:   #94a3b8;
  --dim:     #334155;
  --dim2:    #475569;
  --border:  rgba(0,212,255,.10);
  --border2: rgba(0,212,255,.22);
  --r:       10px;
  --r2:      14px;
  --r3:      18px;
  --shadow:  0 4px 24px rgba(0,0,0,.45);
  --shadow2: 0 12px 48px rgba(0,0,0,.65);
  --glow-cyan: 0 0 24px rgba(0,212,255,.18);
  --nav-h:   58px;
  --content-max: 1080px;
}

*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; height: 100%; }

body {
  font-family: 'Inter', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-font-smoothing: antialiased;
  -webkit-text-size-adjust: 100%;
  touch-action: manipulation;
}

body::before {
  content: "";
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background:
    radial-gradient(ellipse 60% 40% at 80% -5%,  rgba(124,58,237,.14) 0%, transparent 100%),
    radial-gradient(ellipse 50% 35% at -5% 85%,  rgba(0,212,255,.07)  0%, transparent 100%),
    radial-gradient(ellipse 80% 60% at 50% 110%, rgba(0,212,255,.04)  0%, transparent 100%);
}
body::after {
  content: "";
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    linear-gradient(rgba(0,212,255,.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,212,255,.025) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 100% 100% at 50% 0%, black 30%, transparent 70%);
}

::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 4px; }
::-webkit-scrollbar-track { background: transparent; }

/* ── KEYFRAMES ── */
@keyframes spin       { to { transform: rotate(360deg); } }
@keyframes fadeUp     { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes fadeIn     { from { opacity: 0; } to { opacity: 1; } }
@keyframes scaleIn    { from { opacity: 0; transform: scale(.94) translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes pulseDot   { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.75); } }
@keyframes shimmer    { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes glowBorder { 0%,100% { border-color: rgba(0,212,255,.10); } 50% { border-color: rgba(0,212,255,.38); } }
@keyframes float      { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes toastSlide { from { opacity: 0; transform: translateX(18px) scale(.97); } to { opacity: 1; transform: none; } }
@keyframes toastOut   { from { opacity: 1; } to { opacity: 0; transform: translateX(18px) scale(.97); } }
@keyframes cardIn     { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes overlayIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes modalIn    { from { opacity: 0; transform: scale(.94) translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes iconPulse  { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
@keyframes slideDown  { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }

/* ── LOADER ── */
#dash-loader {
  position: fixed; inset: 0; z-index: 9999;
  background: var(--bg);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 18px;
  transition: opacity .5s ease, visibility .5s ease;
}
#dash-loader.hide { opacity: 0; visibility: hidden; pointer-events: none; }
.loader-logo {
  font-family: 'Orbitron', sans-serif; font-size: 20px; font-weight: 900;
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  letter-spacing: 5px;
}
.loader-ring {
  width: 44px; height: 44px; border-radius: 50%;
  border: 2px solid rgba(0,212,255,.08);
  border-top-color: var(--cyan);
  animation: spin .9s linear infinite;
}
.loader-track {
  width: 180px; height: 2px;
  background: rgba(0,212,255,.06); border-radius: 2px; overflow: hidden;
}
.loader-bar {
  height: 100%; background: linear-gradient(90deg, var(--cyan), var(--purple));
  border-radius: 2px; transition: width .28s ease;
}
.loader-sub { font-size: 9px; color: var(--dim2); letter-spacing: 2.5px; text-transform: uppercase; }

/* ── OFFLINE BANNER ── */
#offlineBanner {
  position: fixed; top: 0; left: 0; right: 0; z-index: 9998;
  background: rgba(249,115,22,.08);
  border-bottom: 1px solid rgba(249,115,22,.22);
  padding: 8px 16px;
  display: none; align-items: center; justify-content: center; gap: 8px;
  font-size: 10px; color: var(--orange);
  backdrop-filter: blur(12px); flex-wrap: wrap; text-align: center;
}
#offlineBanner.show { display: flex; animation: slideDown .2s ease; }
#offlineBanner svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.btn-retry-offline {
  padding: 3px 11px; border-radius: 5px;
  border: 1px solid rgba(249,115,22,.35); background: rgba(249,115,22,.1);
  color: var(--orange); font-size: 9px; cursor: pointer;
  font-family: 'JetBrains Mono', monospace; transition: background .15s; min-height: 28px;
}
.btn-retry-offline:hover { background: rgba(249,115,22,.2); }

/* ── SYNC BAR ── */
#syncBar {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 300;
  height: 2px; background: transparent; transition: background .3s;
}
#syncBar.syncing {
  background: linear-gradient(90deg, transparent, var(--cyan), var(--purple), transparent);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}
#syncBar.error  { background: var(--pink); animation: none; }
#syncBar.ok     { background: var(--green); animation: none; }

/* ── NAV ── */
.dnav {
  position: sticky; top: 0; z-index: 200;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px; height: var(--nav-h);
  background: rgba(2,2,16,.92);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(32px) saturate(1.4);
  -webkit-backdrop-filter: blur(32px) saturate(1.4);
  gap: 12px;
}
.dnav-logo {
  font-family: 'Orbitron', sans-serif; font-size: 12px; font-weight: 900;
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  text-decoration: none; letter-spacing: 2.5px;
  display: flex; align-items: center; gap: 9px;
  cursor: pointer; user-select: none; flex-shrink: 0;
}
.dnav-logo-icon {
  width: 30px; height: 30px; border-radius: 8px;
  overflow: hidden; border: 1px solid var(--border); flex-shrink: 0;
}
.dnav-logo-icon img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dnav-logo-text { display: none; }
.dnav-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* Credits pill */
.nav-credits-pill {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: 24px;
  background: rgba(245,158,11,.04); border: 1px solid rgba(245,158,11,.18);
  font-size: 11px; color: var(--yellow); font-weight: 600;
  cursor: pointer; transition: all .2s; text-decoration: none;
  letter-spacing: .2px; min-height: 34px; white-space: nowrap;
}
.nav-credits-pill:hover { border-color: rgba(245,158,11,.4); background: rgba(245,158,11,.09); }
.nav-credits-pill svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2.2; flex-shrink: 0; }
.nav-credits-label { display: none; }

/* User pill */
.user-pill-wrap { position: relative; }
.user-pill {
  display: flex; align-items: center; gap: 7px;
  cursor: pointer; padding: 4px 10px 4px 4px;
  border-radius: 28px; border: 1px solid var(--border);
  background: var(--bg2); transition: all .2s; user-select: none;
  min-height: 40px; -webkit-tap-highlight-color: transparent;
}
.user-pill:hover  { border-color: var(--border2); background: var(--bg3); }
.user-pill.open   { border-color: rgba(0,212,255,.32); }
.user-av-sm {
  width: 28px; height: 28px; border-radius: 50%;
  border: 1.5px solid rgba(0,212,255,.3);
  object-fit: cover; background: var(--bg3); flex-shrink: 0;
}
.user-name-nav { font-size: 11px; color: var(--text); font-weight: 500; display: none; }
.user-caret {
  width: 11px; height: 11px; stroke: var(--dim2);
  fill: none; stroke-width: 2.2; transition: transform .22s; flex-shrink: 0;
}
.user-pill.open .user-caret { transform: rotate(180deg); stroke: var(--cyan); }

/* Dropdown */
.user-dd {
  position: absolute; top: calc(100% + 9px); right: 0; width: 260px;
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r2);
  box-shadow: 0 24px 64px rgba(0,0,0,.9), 0 0 0 1px rgba(0,212,255,.04);
  z-index: 9999; display: none; overflow: hidden;
}
.user-dd.open { display: block; animation: scaleIn .16s ease; }
.ud-hdr {
  padding: 14px 16px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 11px;
  background: linear-gradient(135deg, rgba(0,212,255,.025), transparent);
}
.ud-av { width: 40px; height: 40px; border-radius: 50%; border: 1.5px solid rgba(0,212,255,.28); object-fit: cover; flex-shrink: 0; }
.ud-name  { font-size: 12px; color: #fff; font-weight: 600; margin-bottom: 2px; }
.ud-role  { font-size: 9px; color: var(--dim2); letter-spacing: .5px; text-transform: uppercase; }
.ud-section { padding: 4px 0; }
.ud-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; cursor: pointer;
  font-size: 11px; color: var(--text);
  text-decoration: none; transition: all .12s; min-height: 40px;
}
.ud-item:hover { background: rgba(0,212,255,.05); color: var(--cyan); }
.ud-item svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; opacity: .5; transition: opacity .12s; }
.ud-item:hover svg { opacity: 1; }
.ud-badge {
  margin-left: auto; font-size: 8.5px; font-weight: 700;
  padding: 2px 8px; border-radius: 8px;
  background: rgba(0,212,255,.08); color: var(--cyan); border: 1px solid rgba(0,212,255,.14);
}
.ud-item.danger { color: rgba(244,63,94,.65); }
.ud-item.danger:hover { background: rgba(244,63,94,.07); color: var(--pink); }
.ud-divider { height: 1px; background: var(--border); }

/* ── MAIN LAYOUT ── */
.dash-main {
  max-width: var(--content-max); margin: 0 auto;
  padding: 28px 16px 80px;
  position: relative; z-index: 1;
}

/* ── PAGE HEADER ── */
.page-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 28px; flex-wrap: wrap;
  animation: fadeUp .4s ease both;
}
.header-left { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }
.header-av-wrap {
  width: 52px; height: 52px; border-radius: 12px; flex-shrink: 0;
  background: var(--bg2); border: 1px solid var(--border);
  overflow: hidden; box-shadow: var(--glow-cyan);
}
.header-av-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
.header-info h1 {
  font-family: 'Orbitron', sans-serif; font-size: 17px; font-weight: 900;
  color: #fff; margin-bottom: 4px; line-height: 1.25;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.header-info h1 span {
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.header-info p { color: var(--dim2); font-size: 10px; letter-spacing: .2px; }

.plan-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 24px; flex-shrink: 0;
  font-size: 9px; font-weight: 700;
  font-family: 'Orbitron', sans-serif; letter-spacing: 1.5px;
  cursor: pointer; transition: all .2s; text-decoration: none;
  border: 1px solid rgba(16,185,129,.22);
  background: rgba(16,185,129,.05); color: var(--green); min-height: 34px;
}
.plan-badge.pro    { border-color: rgba(0,212,255,.26); background: rgba(0,212,255,.04); color: var(--cyan); }
.plan-badge.owner  { border-color: rgba(245,158,11,.28); background: rgba(245,158,11,.05); color: var(--yellow); }
.plan-badge svg    { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.plan-badge:hover  { filter: brightness(1.15); transform: translateY(-1px); }

/* ── STATS ROW ── */
.stats-row {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 10px; margin-bottom: 24px;
  animation: fadeUp .4s .07s ease both;
}
.stat-card {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r2); padding: 16px 14px;
  display: flex; align-items: center; gap: 12px;
  transition: all .22s; position: relative; overflow: hidden;
}
.stat-card::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(0,212,255,.03), transparent);
  opacity: 0; transition: opacity .22s; pointer-events: none;
}
.stat-card:hover { border-color: var(--border2); transform: translateY(-2px); box-shadow: var(--shadow2); }
.stat-card:hover::after { opacity: 1; }
.stat-icon {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.stat-icon svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.8; }
.stat-icon.yellow { background: rgba(245,158,11,.07); border: 1px solid rgba(245,158,11,.14); color: var(--yellow); }
.stat-icon.cyan   { background: rgba(0,212,255,.07);  border: 1px solid rgba(0,212,255,.12);  color: var(--cyan); }
.stat-icon.green  { background: rgba(16,185,129,.07); border: 1px solid rgba(16,185,129,.12); color: var(--green); }
.stat-val { font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 700; color: #fff; line-height: 1; margin-bottom: 3px; }
.stat-lbl { font-size: 9px; color: var(--dim2); letter-spacing: .2px; }
.stat-text { min-width: 0; }

/* ── MOBILE NOTICE ── */
.mobile-notice {
  display: flex; align-items: flex-start; gap: 12px;
  background: rgba(249,115,22,.04); border: 1px solid rgba(249,115,22,.18);
  border-radius: var(--r); padding: 14px 14px;
  margin-bottom: 20px; animation: fadeUp .3s ease;
}
.mobile-notice-icon { flex-shrink: 0; margin-top: 1px; }
.mobile-notice-icon svg { width: 16px; height: 16px; stroke: var(--orange); fill: none; stroke-width: 2; }
.mobile-notice-body { flex: 1; min-width: 0; }
.mobile-notice-title { font-size: 11px; color: var(--orange); font-weight: 600; margin-bottom: 4px; font-family: 'Orbitron', sans-serif; letter-spacing: .3px; }
.mobile-notice-desc  { font-size: 10px; color: var(--dim2); line-height: 1.7; }
.mobile-notice-desc strong { color: var(--text); }
.btn-mobile-info {
  margin-top: 8px; padding: 6px 12px; border-radius: 7px;
  border: 1px solid rgba(249,115,22,.28); background: rgba(249,115,22,.07);
  color: var(--orange); font-size: 9px; cursor: pointer;
  font-family: 'JetBrains Mono', monospace; transition: background .15s;
  display: inline-flex; align-items: center; gap: 5px; min-height: 30px;
}
.btn-mobile-info svg { width: 10px; height: 10px; stroke: currentColor; fill: none; stroke-width: 2; }
.btn-mobile-info:hover { background: rgba(249,115,22,.15); }

/* ── MOBILE OVERLAY ── */
.mobile-overlay {
  position: fixed; inset: 0; z-index: 99999;
  background: rgba(2,2,16,.96);
  display: flex; align-items: center; justify-content: center;
  padding: 20px; overflow-y: auto;
  backdrop-filter: blur(24px) saturate(1.2);
  animation: overlayIn .3s ease;
}
.mobile-overlay::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 60% 40% at 50% 0%, rgba(249,115,22,.1) 0%, transparent 70%),
    radial-gradient(ellipse 50% 30% at 50% 100%, rgba(124,58,237,.08) 0%, transparent 60%);
}
.mobile-modal {
  background: linear-gradient(145deg, rgba(12,12,36,.98), rgba(7,7,28,.99));
  border: 1px solid rgba(249,115,22,.28); border-radius: 20px;
  padding: 32px 24px 28px; width: 100%; max-width: 380px;
  text-align: center; position: relative;
  box-shadow: 0 40px 90px rgba(0,0,0,.95), inset 0 1px 0 rgba(255,255,255,.04);
  animation: modalIn .35s cubic-bezier(.34,1.56,.64,1) both; margin: auto;
}
.mobile-modal::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent 8%, var(--orange) 38%, var(--yellow) 62%, transparent 92%);
  border-radius: 20px 20px 0 0;
}
.mm-icon-wrap {
  width: 68px; height: 68px; border-radius: 18px;
  background: linear-gradient(135deg, rgba(249,115,22,.1), rgba(245,158,11,.05));
  border: 1px solid rgba(249,115,22,.22);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 20px; animation: iconPulse 3s ease-in-out infinite;
}
.mm-icon-wrap svg { width: 30px; height: 30px; stroke: var(--orange); fill: none; stroke-width: 1.6; }
.mm-badge {
  display: inline-flex; align-items: center; gap: 5px;
  background: rgba(244,63,94,.07); border: 1px solid rgba(244,63,94,.2);
  border-radius: 20px; padding: 4px 12px;
  font-size: 8px; color: var(--pink);
  letter-spacing: 1.5px; font-family: 'Orbitron', sans-serif; font-weight: 700; margin-bottom: 14px;
}
.mm-badge svg { width: 9px; height: 9px; stroke: currentColor; fill: none; stroke-width: 2.5; }
.mm-title {
  font-family: 'Orbitron', sans-serif; font-size: 15px; font-weight: 900;
  color: #fff; margin-bottom: 10px; line-height: 1.3;
}
.mm-title span {
  background: linear-gradient(135deg, var(--orange), var(--yellow));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.mm-desc { font-size: 11px; color: var(--dim2); line-height: 1.85; margin-bottom: 20px; }
.mm-desc strong { color: var(--text); }
.mm-features { display: flex; flex-direction: column; gap: 8px; margin-bottom: 22px; text-align: left; }
.mm-feat {
  display: flex; align-items: center; gap: 10px;
  background: rgba(0,212,255,.025); border: 1px solid rgba(0,212,255,.07);
  border-radius: var(--r); padding: 9px 12px; font-size: 10px; color: var(--text);
}
.mm-feat svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.mm-feat.ok  svg { stroke: var(--green); }
.mm-feat.bad svg { stroke: var(--pink); }
.mm-feat span { color: var(--dim2); }
.mm-divider { height: 1px; background: var(--border); margin: 18px 0; }
.mm-url {
  background: rgba(0,0,0,.45); border: 1px solid var(--border);
  border-radius: var(--r); padding: 10px 13px;
  font-size: 10px; color: var(--cyan); letter-spacing: .4px;
  margin-bottom: 18px; display: flex; align-items: center; gap: 8px;
  word-break: break-all; text-align: left; font-family: 'JetBrains Mono', monospace;
}
.mm-url svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.btn-mm-continue {
  width: 100%; padding: 13px; border-radius: 11px;
  background: linear-gradient(135deg, rgba(249,115,22,.14), rgba(245,158,11,.07));
  border: 1px solid rgba(249,115,22,.32); color: var(--orange);
  font-family: 'Orbitron', sans-serif; font-size: 9.5px; font-weight: 700;
  letter-spacing: 1px; cursor: pointer; transition: all .2s; margin-bottom: 10px;
  display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px;
}
.btn-mm-continue:hover { background: linear-gradient(135deg, rgba(249,115,22,.22), rgba(245,158,11,.12)); }
.btn-mm-continue svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2.2; }
.btn-mm-dismiss {
  width: 100%; padding: 11px; border-radius: 10px;
  background: transparent; border: 1px solid var(--border);
  color: var(--dim2); font-size: 10px; cursor: pointer;
  transition: all .15s; font-family: 'JetBrains Mono', monospace; min-height: 42px;
}
.btn-mm-dismiss:hover { border-color: rgba(0,212,255,.18); color: var(--text); }

/* ── CREATE CARD ── */
.create-card {
  position: relative; overflow: hidden;
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r2); padding: 22px 18px 20px;
  margin-bottom: 24px; box-shadow: var(--shadow);
  animation: fadeUp .4s .14s ease both;
}
.create-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent 5%, var(--cyan) 35%, var(--purple) 65%, transparent 95%);
}
.create-card-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px; gap: 10px; flex-wrap: wrap;
}
.card-title {
  font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 700; color: var(--cyan);
  display: flex; align-items: center; gap: 7px;
}
.card-title svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2.5; }
.limit-pill {
  font-size: 10px; color: var(--dim2);
  background: rgba(0,0,0,.3); border: 1px solid var(--border);
  padding: 4px 12px; border-radius: 20px; display: flex; align-items: center; gap: 4px;
}
.limit-pill .used  { color: var(--cyan); font-weight: 700; }
.limit-pill .sep   { opacity: .22; }

/* Mobile create block */
.create-block-overlay {
  position: absolute; inset: 0; z-index: 10;
  background: rgba(2,2,16,.78); backdrop-filter: blur(6px);
  border-radius: var(--r2);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; cursor: not-allowed;
  padding: 20px;
}
.create-block-overlay svg  { width: 26px; height: 26px; stroke: var(--orange); fill: none; stroke-width: 1.6; }
.create-block-overlay h3   { font-size: 12px; color: var(--orange); font-family: 'Orbitron', sans-serif; font-weight: 700; letter-spacing: .3px; text-align: center; }
.create-block-overlay p    { font-size: 10px; color: var(--dim2); text-align: center; line-height: 1.65; }
.create-block-overlay button {
  margin-top: 4px; padding: 8px 18px; border-radius: 8px;
  border: 1px solid rgba(249,115,22,.28); background: rgba(249,115,22,.09);
  color: var(--orange); font-size: 10px; cursor: pointer;
  font-family: 'JetBrains Mono', monospace; transition: background .15s; min-height: 36px;
}
.create-block-overlay button:hover { background: rgba(249,115,22,.18); }

/* Input group */
.input-group { display: flex; flex-direction: column; gap: 8px; }
.input-row   { display: flex; gap: 10px; align-items: stretch; flex-wrap: wrap; }

.project-input {
  flex: 1; min-width: 180px; background: rgba(0,0,0,.4);
  border: 1px solid var(--border); border-radius: var(--r);
  padding: 0 16px; color: #fff; height: 48px;
  font-family: 'Inter', sans-serif; font-size: 14px;
  outline: none; transition: all .22s; appearance: none;
}
.project-input:focus {
  border-color: rgba(0,212,255,.38);
  box-shadow: 0 0 0 3px rgba(0,212,255,.06);
}
.project-input::placeholder { color: var(--dim2); font-size: 13px; }
.project-input:disabled { opacity: .28; cursor: not-allowed; }
.project-input.error { border-color: rgba(244,63,94,.5) !important; }

.input-meta {
  display: flex; align-items: center; justify-content: space-between; padding: 0 2px;
}
.input-hint { font-size: 9px; color: var(--dim2); display: flex; align-items: center; gap: 5px; }
.input-hint svg { width: 9px; height: 9px; stroke: currentColor; fill: none; stroke-width: 2; }
.char-count { font-size: 9.5px; color: var(--dim2); transition: color .2s; font-family: 'JetBrains Mono', monospace; }
.char-count.warn  { color: var(--yellow); }
.char-count.limit { color: var(--pink); }

.btn-create {
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  color: #020210; border: none; border-radius: var(--r);
  padding: 0 24px; height: 48px; flex-shrink: 0;
  font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 900;
  cursor: pointer; transition: all .22s; letter-spacing: .5px;
  display: flex; align-items: center; gap: 7px;
  white-space: nowrap; position: relative; overflow: hidden;
  -webkit-tap-highlight-color: transparent; min-width: 120px; justify-content: center;
}
.btn-create::before {
  content: ""; position: absolute; inset: 0;
  background: rgba(255,255,255,.1); opacity: 0; transition: opacity .2s;
}
.btn-create:hover:not(:disabled)::before { opacity: 1; }
.btn-create:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(0,212,255,.28); }
.btn-create:disabled { opacity: .28; cursor: not-allowed; }
.btn-create svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2.5; }
.btn-spinner {
  display: none; width: 14px; height: 14px;
  border: 2px solid rgba(2,2,16,.2); border-top-color: #020210;
  border-radius: 50%; animation: spin .7s linear infinite;
}
.btn-create.loading .btn-spinner { display: block; }
.btn-create.loading .btn-lbl    { display: none; }

/* Save status */
.save-status {
  margin-top: 10px; font-size: 10px; display: none; align-items: center; gap: 6px;
}
.save-status.show-saving  { display: flex; color: var(--yellow); }
.save-status.show-saved   { display: flex; color: var(--green); }
.save-status.show-error   { display: flex; color: var(--pink); }
.save-status.show-retry   { display: flex; color: var(--orange); }
.save-status svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }

/* Queue notice */
.queue-notice {
  display: none; align-items: center; gap: 10px;
  background: rgba(249,115,22,.04); border: 1px solid rgba(249,115,22,.16);
  border-radius: var(--r); padding: 11px 14px; margin-top: 12px; flex-wrap: wrap;
}
.queue-notice.show { display: flex; animation: fadeUp .2s ease; }
.queue-notice svg  { width: 13px; height: 13px; stroke: var(--orange); fill: none; stroke-width: 2; flex-shrink: 0; }
.queue-notice p    { font-size: 10px; color: rgba(249,115,22,.85); flex: 1; min-width: 0; }
.queue-notice button {
  padding: 4px 12px; border-radius: 6px;
  border: 1px solid rgba(249,115,22,.3); background: rgba(249,115,22,.08);
  color: var(--orange); font-size: 9px; cursor: pointer;
  font-family: 'JetBrains Mono', monospace; transition: background .15s; min-height: 30px;
}
.queue-notice button:hover { background: rgba(249,115,22,.16); }

.info-notice {
  display: flex; align-items: flex-start; gap: 11px;
  background: rgba(0,212,255,.025); border: 1px solid rgba(0,212,255,.09);
  border-radius: var(--r); padding: 12px 14px; margin-top: 16px;
}
.info-notice svg { width: 13px; height: 13px; stroke: var(--cyan); fill: none; stroke-width: 2; flex-shrink: 0; margin-top: 1px; opacity: .7; }
.info-notice p   { font-size: 10px; color: var(--dim2); line-height: 1.75; }
.info-notice strong { color: var(--text); }

/* ── FILTER ROW ── */
.filter-row { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.search-wrap { flex: 1; min-width: 160px; position: relative; }
.search-wrap svg {
  position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
  width: 13px; height: 13px; stroke: var(--dim2); fill: none; stroke-width: 2; pointer-events: none;
}
.search-input {
  width: 100%; background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r); padding: 0 12px 0 34px; height: 40px;
  color: var(--text); font-family: 'Inter', sans-serif; font-size: 12px;
  outline: none; transition: all .2s; appearance: none;
}
.search-input:focus { border-color: rgba(0,212,255,.28); box-shadow: 0 0 0 2px rgba(0,212,255,.04); }
.search-input::placeholder { color: var(--dim2); }
.sort-select {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r); padding: 0 13px; height: 40px;
  color: var(--text); font-family: 'Inter', sans-serif;
  font-size: 11px; outline: none; cursor: pointer; transition: all .2s; appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpolyline points='0,0 5,6 10,0' fill='none' stroke='%23475569' stroke-width='1.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: calc(100% - 10px) center;
  padding-right: 30px; min-width: 130px;
}
.sort-select:focus { border-color: rgba(0,212,255,.28); }

/* ── SECTION HEADER ── */
.section-hdr { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.section-hdr h2 {
  font-family: 'Orbitron', sans-serif; font-size: 8.5px;
  color: var(--dim2); text-transform: uppercase; letter-spacing: 2.5px; white-space: nowrap;
}
.section-line { flex: 1; height: 1px; background: var(--border); }
.section-count {
  font-size: 9px; color: var(--dim2);
  padding: 2px 10px; background: rgba(0,0,0,.3);
  border: 1px solid var(--border); border-radius: 10px; flex-shrink: 0;
}

/* ── PROJECT GRID ── */
.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.project-card {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r2); padding: 18px 18px 52px;
  transition: all .22s; cursor: pointer;
  position: relative; overflow: hidden;
  display: flex; flex-direction: column;
  -webkit-tap-highlight-color: transparent;
}
.project-card::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(0,212,255,.045), transparent 55%);
  opacity: 0; transition: opacity .22s; pointer-events: none;
}
.project-card:hover, .project-card:focus-within {
  transform: translateY(-2px);
  border-color: rgba(0,212,255,.26);
  box-shadow: 0 14px 40px rgba(0,0,0,.42);
}
.project-card:hover::after, .project-card:focus-within::after { opacity: 1; }
.project-card.pending-save { border-color: rgba(249,115,22,.22); animation: glowBorder 2.2s ease infinite; }
.project-card.card-enter { animation: cardIn .35s ease both; }

.project-card-top {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: 12px; gap: 8px;
}
.project-icon {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  background: linear-gradient(135deg, rgba(0,212,255,.07), rgba(124,58,237,.07));
  border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;
}
.project-icon svg { width: 17px; height: 17px; stroke: var(--cyan); fill: none; stroke-width: 1.8; }
.project-top-right { display: flex; align-items: center; gap: 6px; }
.project-id-tag {
  font-size: 8px; color: var(--dim2); background: rgba(0,0,0,.4);
  padding: 3px 7px; border-radius: 5px; border: 1px solid rgba(255,255,255,.04);
  max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  cursor: help; font-family: 'JetBrains Mono', monospace;
}
.btn-delete {
  width: 30px; height: 30px; border-radius: 7px; flex-shrink: 0;
  background: rgba(244,63,94,.04); border: 1px solid rgba(244,63,94,.12);
  color: rgba(244,63,94,.3); display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .18s; z-index: 5; -webkit-tap-highlight-color: transparent;
}
.btn-delete:hover, .btn-delete:focus { background: rgba(244,63,94,.14); border-color: var(--pink); color: var(--pink); outline: none; }
.btn-delete svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2.2; }

.project-name {
  font-family: 'Orbitron', sans-serif; font-size: 12px; font-weight: 700;
  color: #fff; margin-bottom: 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.project-desc { font-size: 9.5px; color: var(--dim2); line-height: 1.7; flex: 1; }

.project-meta {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 18px; position: absolute; bottom: 0; left: 0; right: 0;
  border-top: 1px solid rgba(255,255,255,.04);
  background: rgba(7,7,28,.75); backdrop-filter: blur(10px);
}
.meta-date { font-size: 9px; color: var(--dim2); display: flex; align-items: center; gap: 4px; }
.meta-date svg { width: 9px; height: 9px; stroke: currentColor; fill: none; stroke-width: 2; opacity: .4; }
.meta-status {
  font-size: 8.5px; color: var(--green);
  background: rgba(16,185,129,.05); border: 1px solid rgba(16,185,129,.16);
  padding: 3px 9px; border-radius: 10px; display: flex; align-items: center; gap: 4px;
}
.meta-status.pending { color: var(--orange); background: rgba(249,115,22,.05); border-color: rgba(249,115,22,.16); }
.status-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; animation: pulseDot 2s infinite; }

.project-open-btn {
  position: absolute; bottom: 0; left: 0; right: 0; padding: 12px 18px;
  background: linear-gradient(90deg, rgba(0,212,255,.12), rgba(124,58,237,.12));
  border-top: 1px solid rgba(0,212,255,.15);
  font-family: 'Orbitron', sans-serif; font-size: 9px; font-weight: 700;
  color: var(--cyan); letter-spacing: 1px; text-align: center;
  opacity: 0; transition: opacity .22s; pointer-events: none;
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
.project-open-btn svg { width: 10px; height: 10px; stroke: currentColor; fill: none; stroke-width: 2.5; }
.project-card:hover .project-open-btn,
.project-card:focus-within .project-open-btn { opacity: 1; }

/* ── EMPTY STATE ── */
.empty-state { grid-column: 1 / -1; text-align: center; padding: 60px 16px; }
.empty-icon {
  width: 60px; height: 60px; border-radius: 16px;
  background: var(--bg2); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 18px; animation: float 3.5s ease-in-out infinite;
}
.empty-icon svg { width: 24px; height: 24px; stroke: var(--dim2); fill: none; stroke-width: 1.5; }
.empty-state strong { display: block; font-family: 'Orbitron', sans-serif; font-size: 11px; color: var(--text); margin-bottom: 8px; letter-spacing: .4px; }
.empty-state p { font-size: 10.5px; color: var(--dim2); line-height: 1.85; max-width: 320px; margin: 0 auto; }
.empty-hint {
  display: inline-flex; align-items: center; gap: 7px;
  margin-top: 16px; padding: 8px 16px; border-radius: var(--r);
  background: rgba(0,212,255,.04); border: 1px solid rgba(0,212,255,.1);
  font-size: 9.5px; color: var(--cyan);
}
.empty-hint svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; }
.empty-hint.warn { color: var(--orange); border-color: rgba(249,115,22,.18); background: rgba(249,115,22,.04); }
.empty-hint.warn svg { stroke: var(--orange); }

/* ── TOAST ── */
.nx-toast {
  position: fixed; bottom: 20px; right: 16px; z-index: 9999;
  padding: 11px 15px; border-radius: var(--r);
  font-size: 11px; font-family: 'Inter', sans-serif;
  background: var(--bg3); border: 1px solid var(--border);
  box-shadow: 0 10px 36px rgba(0,0,0,.75);
  pointer-events: none; max-width: 280px;
  display: flex; align-items: center; gap: 8px;
}
.nx-toast.in  { animation: toastSlide .22s ease; }
.nx-toast.out { animation: toastOut  .22s ease forwards; }
.nx-toast svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }

/* ── OVERLAY & MODALS ── */
.overlay {
  position: fixed; inset: 0; background: rgba(2,2,16,.88); z-index: 500;
  display: none; align-items: flex-start; justify-content: center;
  backdrop-filter: blur(10px); overflow-y: auto; padding: 20px 16px;
}
.overlay.show { display: flex; animation: overlayIn .2s ease; }

.modal-box {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r2); padding: 26px 22px;
  width: 420px; max-width: 100%;
  box-shadow: 0 36px 90px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.02);
  animation: modalIn .22s ease; margin: auto; position: relative;
}
.modal-box.wide { width: 500px; }

.modal-icon {
  width: 42px; height: 42px; border-radius: 11px;
  background: rgba(244,63,94,.08); border: 1px solid rgba(244,63,94,.2);
  display: flex; align-items: center; justify-content: center; margin-bottom: 16px;
}
.modal-icon svg { width: 18px; height: 18px; stroke: var(--pink); fill: none; stroke-width: 2; }
.modal-icon.cyan { background: rgba(0,212,255,.07); border-color: rgba(0,212,255,.18); }
.modal-icon.cyan svg { stroke: var(--cyan); }
.modal-title { font-family: 'Orbitron', sans-serif; font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 10px; }
.modal-desc   { font-size: 11px; color: var(--dim2); line-height: 1.75; margin-bottom: 22px; }
.highlight    { color: var(--cyan); font-weight: 600; }
.modal-btns { display: flex; gap: 10px; }
.modal-btn {
  flex: 1; padding: 12px; border-radius: var(--r);
  font-family: 'Inter', sans-serif; font-size: 12px;
  font-weight: 600; cursor: pointer; transition: all .15s; border: none; min-height: 44px;
}
.modal-btn.cancel { background: var(--bg3); color: var(--text); border: 1px solid var(--border); }
.modal-btn.cancel:hover { border-color: rgba(0,212,255,.28); color: var(--cyan); }
.modal-btn.danger { background: rgba(244,63,94,.1); color: var(--pink); border: 1px solid rgba(244,63,94,.25); }
.modal-btn.danger:hover { background: var(--pink); color: #fff; }
.modal-btn.primary { background: linear-gradient(135deg, var(--cyan), var(--purple)); color: #020210; }
.modal-btn.primary:hover { opacity: .88; }

/* ── SETTINGS MODAL ── */
.settings-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
.settings-hdr-title {
  font-family: 'Orbitron', sans-serif; font-size: 12px; font-weight: 700;
  color: var(--cyan); display: flex; align-items: center; gap: 8px;
}
.settings-hdr-title svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; }
.settings-close {
  background: none; border: none; color: var(--dim2); cursor: pointer;
  width: 30px; height: 30px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center; transition: all .12s; flex-shrink: 0;
}
.settings-close svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; }
.settings-close:hover { color: var(--pink); background: rgba(244,63,94,.08); }

.settings-sec { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
.settings-sec:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.settings-sec-title {
  font-size: 8.5px; color: var(--cyan); text-transform: uppercase;
  letter-spacing: 2px; font-family: 'Orbitron', sans-serif; margin-bottom: 12px; opacity: .8;
}

.settings-av-row { display: flex; align-items: center; gap: 13px; padding: 4px 0 12px; }
.settings-av { width: 48px; height: 48px; border-radius: 50%; border: 2px solid rgba(0,212,255,.28); object-fit: cover; flex-shrink: 0; }
.settings-av-name { font-size: 13px; color: white; font-weight: 600; margin-bottom: 3px; }
.settings-av-id   { font-size: 10px; color: var(--dim2); font-family: 'JetBrains Mono', monospace; }

.settings-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 0; font-size: 11px; gap: 10px; flex-wrap: wrap; min-height: 38px;
}
.settings-row label { color: var(--text); flex: 1; }
.s-val { font-weight: 700; font-family: 'JetBrains Mono', monospace; }
.s-val.yellow { color: var(--yellow); }
.s-val.cyan   { color: var(--cyan); }
.s-val.green  { color: var(--green); }
.settings-btn {
  padding: 6px 14px; border-radius: 7px; font-size: 10px; cursor: pointer;
  border: 1px solid var(--border); background: rgba(0,212,255,.03);
  color: var(--text); transition: all .15s; font-family: 'Inter', sans-serif; min-height: 32px;
}
.settings-btn:hover:not(:disabled) { border-color: rgba(0,212,255,.28); color: var(--cyan); }
.settings-btn.danger   { border-color: rgba(244,63,94,.26); color: var(--pink); }
.settings-btn.danger:hover { background: rgba(244,63,94,.09); }
.settings-btn.success  { border-color: rgba(16,185,129,.26); color: var(--green); }
.settings-btn.success:hover { background: rgba(16,185,129,.07); }
.settings-btn:disabled { opacity: .3; cursor: not-allowed; }

.redeem-row { display: flex; gap: 8px; width: 100%; margin-top: 8px; flex-wrap: wrap; }
.redeem-input {
  flex: 1; min-width: 140px; background: var(--bg3); border: 1px solid var(--border);
  border-radius: 7px; padding: 0 12px; height: 38px; color: white;
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  outline: none; transition: all .18s; text-transform: uppercase; letter-spacing: 1px;
}
.redeem-input:focus { border-color: rgba(0,212,255,.32); box-shadow: 0 0 0 2px rgba(0,212,255,.05); }
.redeem-msg { font-size: 10px; margin-top: 8px; display: none; }
.redeem-msg.show { display: block; }

/* Device status in settings */
.device-status-row {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  background: rgba(0,0,0,.2); border: 1px solid var(--border); border-radius: var(--r);
  margin-top: 6px;
}
.device-status-row svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.device-status-row.mobile-dev { color: var(--orange); border-color: rgba(249,115,22,.18); }
.device-status-row.desktop-dev { color: var(--green); border-color: rgba(16,185,129,.18); }
.device-status-label { font-size: 11px; font-weight: 500; }
.device-status-sub   { font-size: 9px; color: var(--dim2); margin-top: 1px; }

/* ── RESPONSIVE BREAKPOINTS ── */

/* ≥ 360px: default mobile-first base above */

/* ≥ 480px */
@media (min-width: 480px) {
  .dnav { padding: 0 24px; }
  .nav-credits-label { display: inline; }
  .stat-val { font-size: 20px; }
}

/* ≥ 640px */
@media (min-width: 640px) {
  .dash-main { padding: 36px 24px 90px; }
  .dnav-logo-text { display: inline; }
  .user-name-nav { display: inline; }
  .header-av-wrap { width: 60px; height: 60px; }
  .header-info h1 { font-size: 20px; }
  .create-card { padding: 26px 26px 24px; }
  .projects-grid { grid-template-columns: repeat(2, 1fr); }
}

/* ≥ 768px */
@media (min-width: 768px) {
  :root { --nav-h: 62px; }
  .dnav { padding: 0 32px; }
  .dash-main { padding: 44px 28px 100px; }
  .stats-row { gap: 14px; }
  .stat-card { padding: 18px 20px; }
  .stat-icon { width: 44px; height: 44px; }
  .stat-val { font-size: 22px; }
  .input-row { flex-wrap: nowrap; }
  .filter-row { flex-wrap: nowrap; }
}

/* ≥ 1024px */
@media (min-width: 1024px) {
  .dash-main { padding: 48px 28px 100px; }
  .header-info h1 { font-size: 22px; }
  .projects-grid { grid-template-columns: repeat(3, 1fr); }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`

/* ─────────────────────────────────────────────────────────────────────────────
   MOBILE DETECTION — User Agent Only
───────────────────────────────────────────────────────────────────────────── */
function detectMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false
  return /\b(Android|iPhone|iPod|IEMobile|Opera Mini|BlackBerry|webOS)\b/i.test(navigator.userAgent)
}

/* ─────────────────────────────────────────────────────────────────────────────
   UTILS
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
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '–' }
}

/* ─────────────────────────────────────────────────────────────────────────────
   SVG ICONS (no emojis anywhere)
───────────────────────────────────────────────────────────────────────────── */
const Icon = {
  lightning:    <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  folder:       <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  shield:       <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  star:         <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  plus:         <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  chevRight:    <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>,
  chevDown:     <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>,
  search:       <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  trash:        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  calendar:     <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  info:         <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  warn:         <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  gear:         <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  logout:       <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  inbox:        <svg viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>,
  discord:      <svg viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>,
  monitor:      <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  smartphone:   <svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  check:        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  x:            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  wifi_off:     <svg viewBox="0 0 24 24"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>,
  globe:        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>,
  play:         <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  arrow_right:  <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>,
  download:     <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  link:         <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
  spin_ring:    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" strokeWidth="2" strokeDasharray="60" strokeLinecap="round"/></svg>,
}

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [loaded,          setLoaded]          = useState(false)
  const [loaderPct,       setLoaderPct]       = useState(0)
  const [session,         setSession]         = useState<NexusSession | null>(null)
  const [userData,        setUserData]        = useState<UserData>({})
  const [pendingQueue,    setPendingQueue]    = useState<QueueItem[]>([])
  const [isOnline,        setIsOnline]        = useState(true)
  const [syncState,       setSyncState]       = useState<'' | 'syncing' | 'error' | 'ok'>('')
  const [saveState,       setSaveState]       = useState<{ state: string; msg: string } | null>(null)
  const [ddOpen,          setDdOpen]          = useState(false)
  const [settingsOpen,    setSettingsOpen]    = useState(false)
  const [deleteModal,     setDeleteModal]     = useState<{ id: string; name: string } | null>(null)
  const [logoutModal,     setLogoutModal]     = useState(false)
  const [searchQ,         setSearchQ]         = useState('')
  const [sortBy,          setSortBy]          = useState<'newest' | 'oldest' | 'name'>('newest')
  const [projectName,     setProjectName]     = useState('')
  const [creating,        setCreating]        = useState(false)
  const [redeemCode,      setRedeemCode]      = useState('')
  const [redeemMsg,       setRedeemMsg]       = useState<{ msg: string; ok: boolean } | null>(null)
  const [dailyInfo,       setDailyInfo]       = useState('')
  const [dailyDisabled,   setDailyDisabled]   = useState(false)
  const [inputError,      setInputError]      = useState(false)

  // Mobile (UA-only)
  const [isMobile,             setIsMobile]             = useState(false)
  const [mobilePopupVisible,   setMobilePopupVisible]   = useState(false)
  const [mobilePopupDismissed, setMobilePopupDismissed] = useState(false)

  const sessionRef  = useRef<NexusSession | null>(null)
  const userDataRef = useRef<UserData>({})

  useEffect(() => { sessionRef.current  = session  }, [session])
  useEffect(() => { userDataRef.current = userData }, [userData])

  // UA-only mobile detection
  useEffect(() => {
    const mobile = detectMobileUA()
    setIsMobile(mobile)
    if (mobile) {
      const t = setTimeout(() => setMobilePopupVisible(true), 700)
      return () => clearTimeout(t)
    }
  }, [])

  useEffect(() => { document.title = 'NEXUS AI — Dashboard' }, [])

  // Online/offline listeners
  useEffect(() => {
    const on  = () => { setIsOnline(true);  setTimeout(retryQueue, 1200) }
    const off = () => setIsOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    setIsOnline(navigator.onLine)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const w = document.getElementById('userPillWrap')
      if (w && !w.contains(e.target as Node)) setDdOpen(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSettingsOpen(false); setDeleteModal(null)
        setLogoutModal(false);  setDdOpen(false)
        setMobilePopupVisible(false)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        if (!isMobile) document.getElementById('projNameInput')?.focus()
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [isMobile])

  useEffect(() => { initDashboard() }, []) // eslint-disable-line
  useEffect(() => { updateDailyStatus(userData) }, [userData])

  // Auto-clear save state
  useEffect(() => {
    if (!saveState) return
    let t: ReturnType<typeof setTimeout>
    if (saveState.state === 'saved') t = setTimeout(() => setSaveState(null), 3200)
    if (saveState.state === 'error') t = setTimeout(() => setSaveState(null), 6000)
    return () => clearTimeout(t)
  }, [saveState])

  /* ── INIT ── */
  async function initDashboard() {
    setLoaderPct(15)
    const raw = localStorage.getItem('nexus_session')
    if (!raw) { window.location.replace('/'); return }
    let sess: NexusSession
    try {
      sess = JSON.parse(raw)
      if (!sess?.user?.username) throw new Error('no user')
      if (Date.now() - (sess.loginTime || 0) > SESSION_TTL) throw new Error('expired')
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
      user: (sess.user.username || '').toLowerCase(),
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl.signal
        })
        clearTimeout(tid)
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const result = await r.json()
        if (result.success || result.data) {
          if (result.data) {
            const newUd = { ...ud }
            if (result.data.credits   !== undefined)   newUd.credits  = result.data.credits
            if (result.data.plan)                       newUd.plan     = result.data.plan
            if (result.data.roles)                      newUd.roles    = result.data.roles
            if (Array.isArray(result.data.projects))    newUd.projects = result.data.projects
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'set_project', _user: username, user: username, projectId, projectName })
      })
    } catch {}
  }

  /* ── COMPUTED HELPERS ── */
  function getCredits(ud: UserData) {
    const c     = ud.credits ?? sessionRef.current?.data?.credits ?? 30
    const plan  = (ud.plan || 'free').toLowerCase()
    const roles = ud.roles || []
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

  /* ── ACTIONS ── */
  function handleNameChange(val: string) {
    if (val.length <= PROJECT_NAME_LIMIT) {
      setProjectName(val)
      if (inputError) setInputError(false)
    }
  }

  async function handleCreate() {
    if (isMobile) { setMobilePopupVisible(true); return }
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
      saved ? 1800 : 2500
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
    const newUd = {
      ...userData,
      credits:   (parseFloat(String(userData.credits)) || 0) + n,
      lastClaim: new Date().toISOString()
    }
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          user:   (session?.user.username || '').toLowerCase(),
          userId: session?.user.robloxId || ''
        })
      })
      const d = await r.json()
      if (d.success) {
        const newUd = { ...userData, credits: (parseFloat(String(userData.credits)) || 0) + parseFloat(d.credits || 0) }
        setUserData(newUd); userDataRef.current = newUd
        if (sessionRef.current) await saveToServer(newUd, sessionRef.current)
        setRedeemMsg({ msg: `+${d.credits} CR redeemed!`, ok: true })
        setRedeemCode('')
      } else {
        setRedeemMsg({ msg: d.error || 'Invalid or expired code', ok: false })
      }
    } catch {
      setRedeemMsg({ msg: 'Failed to connect — try again', ok: false })
    }
  }

  function doLogout() { localStorage.removeItem('nexus_session'); window.location.replace('/') }

  function showToast(msg: string, color?: string, dur?: number) {
    document.querySelectorAll('.nx-toast').forEach(t => t.remove())
    const t = document.createElement('div')
    t.className = 'nx-toast in'
    t.style.color = color || 'var(--cyan)'
    const isWarn = color === 'var(--pink)' || color === 'var(--yellow)' || color === 'var(--orange)'
    const iconSvg = isWarn
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`
    t.innerHTML = iconSvg + `<span>${esc(msg)}</span>`
    document.body.appendChild(t)
    const total = dur || 2800
    setTimeout(() => {
      t.classList.remove('in'); t.classList.add('out')
      setTimeout(() => t.remove(), 250)
    }, total)
  }

  /* ── DERIVED VALUES ── */
  const av = session?.user?.avatar
    || (session?.user?.robloxId
      ? `https://www.roblox.com/headshot-thumbnail/image?userId=${session.user.robloxId}&width=150&height=150&format=png`
      : '/images/nexusai.png')

  const { display: creditsDisplay } = getCredits(userData)
  const { label: planLabel, cls: planCls } = getPlanInfo(userData)
  const limit     = getLimit(userData)
  const unlimited = limit === 999
  const allProjects = userData.projects || []
  const atLimit   = allProjects.length >= limit

  const filtered = (searchQ
    ? allProjects.filter(p => p.name.toLowerCase().includes(searchQ.toLowerCase()))
    : [...allProjects])
  if (sortBy === 'newest')       filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  else if (sortBy === 'oldest')  filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  else                           filtered.sort((a, b) => a.name.localeCompare(b.name))

  const pendingIds = new Set(pendingQueue.flatMap(q => (q.payload?.data?.projects || []).map((p: Project) => p.id)))

  const charLen = projectName.length
  const charCls = charLen >= PROJECT_NAME_LIMIT ? 'limit' : charLen >= PROJECT_NAME_LIMIT - 3 ? 'warn' : ''
  const saveStateCls = saveState ? `save-status show-${saveState.state}` : 'save-status'

  /* ── RENDER ── */
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* ── SYNC BAR ── */}
      <div id="syncBar" className={syncState} />

      {/* ── OFFLINE BANNER ── */}
      <div id="offlineBanner" className={!isOnline ? 'show' : ''} role="alert">
        {Icon.wifi_off}
        No network connection — changes are queued locally
        <button className="btn-retry-offline" onClick={retryQueue}>Retry Now</button>
      </div>

      {/* ════════════════════════════════════════
          MOBILE WARNING POPUP
      ════════════════════════════════════════ */}
      {isMobile && mobilePopupVisible && (
        <div className="mobile-overlay" role="dialog" aria-modal="true" aria-label="Mobile device detected">
          <div className="mobile-modal">
            <div className="mm-icon-wrap">{Icon.monitor}</div>

            <div className="mm-badge">
              {Icon.warn}
              MOBILE DEVICE DETECTED
            </div>

            <div className="mm-title">
              Desktop Recommended<br/>for <span>Full Access</span>
            </div>

            <div className="mm-desc">
              NEXUS AI is designed for <strong>desktop browsers</strong>. On a mobile device,{' '}
              <strong>project creation is disabled</strong> to prevent errors.
              You can still view and manage existing projects.
            </div>

            <div className="mm-features">
              <div className="mm-feat ok">
                {Icon.check}
                <div>
                  <strong style={{ color: 'var(--green)' }}>Desktop / Laptop</strong>
                  &ensp;<span>Full access — project creation enabled</span>
                </div>
              </div>
              <div className="mm-feat bad">
                {Icon.x}
                <div>
                  <strong style={{ color: 'var(--pink)' }}>Mobile / Tablet</strong>
                  &ensp;<span>View only — project creation disabled</span>
                </div>
              </div>
            </div>

            <div className="mm-divider" />

            <div style={{ fontSize: 9, color: 'var(--dim2)', marginBottom: 10, textAlign: 'center', letterSpacing: '.5px', textTransform: 'uppercase' }}>
              Open on your desktop browser:
            </div>
            <div className="mm-url">
              {Icon.globe}
              {typeof window !== 'undefined' ? window.location.hostname : 'nexusai.app'}/dashboard
            </div>

            <button className="btn-mm-continue" onClick={() => setMobilePopupVisible(false)}>
              {Icon.arrow_right}
              Continue on Mobile (Limited)
            </button>
            <button className="btn-mm-dismiss" onClick={() => { setMobilePopupVisible(false); setMobilePopupDismissed(true) }}>
              Don&apos;t show this again
            </button>
          </div>
        </div>
      )}

      {/* ── LOADER ── */}
      <div id="dash-loader" className={loaded ? 'hide' : ''} role="status" aria-label="Loading dashboard">
        <div className="loader-logo">NEXUS AI</div>
        <div className="loader-ring" aria-hidden="true" />
        <div className="loader-track">
          <div className="loader-bar" style={{ width: loaderPct + '%' }} />
        </div>
        <div className="loader-sub">Loading workspace...</div>
      </div>

      {/* ── NAV ── */}
      <nav className="dnav" role="navigation" aria-label="Main navigation">
        <a className="dnav-logo" onClick={() => window.location.href = '/dashboard'} role="link" tabIndex={0}>
          <div className="dnav-logo-icon">
            <img src="/images/nexusai.png" alt="NEXUS AI" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          </div>
          <span className="dnav-logo-text">NEXUS AI</span>
        </a>

        <div className="dnav-right">
          <a href="/payment" className="nav-credits-pill" title="Buy credits">
            {Icon.lightning}
            <span className="nav-credits-label">{creditsDisplay} CR</span>
            <span style={{ display: 'none' }} className="nav-credits-label"> </span>
            <span className="nav-credits-label" style={{ display: 'inline' }}>{creditsDisplay}</span>
          </a>

          <div className="user-pill-wrap" id="userPillWrap">
            <div
              className={`user-pill${ddOpen ? ' open' : ''}`}
              onClick={() => setDdOpen(o => !o)}
              role="button" aria-expanded={ddOpen} aria-label="User menu"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDdOpen(o => !o) } }}
            >
              <img className="user-av-sm" src={av} alt="" onError={e => { (e.currentTarget as HTMLImageElement).src = '/images/nexusai.png' }} />
              <span className="user-name-nav">@{session?.user.username || '...'}</span>
              <svg className="user-caret" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </div>

            <div className={`user-dd${ddOpen ? ' open' : ''}`} role="menu">
              <div className="ud-hdr">
                <img className="ud-av" src={av} alt="" onError={e => { (e.currentTarget as HTMLImageElement).src = '/images/nexusai.png' }} />
                <div>
                  <div className="ud-name">@{session?.user.username}</div>
                  <div className="ud-role">{planLabel} Plan</div>
                </div>
              </div>

              <div className="ud-section">
                <div className="ud-item" onClick={() => { setSettingsOpen(true); setDdOpen(false) }} role="menuitem" tabIndex={0}>
                  {Icon.gear} Settings
                </div>
                <a className="ud-item" href="/payment" onClick={() => setDdOpen(false)} role="menuitem">
                  {Icon.lightning} Buy Credits
                  <span className="ud-badge">{creditsDisplay} CR</span>
                </a>
                <a className="ud-item" href="/inbox" onClick={() => setDdOpen(false)} role="menuitem">
                  {Icon.inbox} Inbox
                </a>
                <a className="ud-item" href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noreferrer" onClick={() => setDdOpen(false)} role="menuitem">
                  {Icon.discord} Discord Community
                </a>
              </div>

              <div className="ud-divider" />
              <div className="ud-section">
                <div
                  className="ud-item"
                  onClick={() => { claimDaily(); setDdOpen(false) }}
                  role="menuitem" tabIndex={0}
                  style={{ opacity: dailyDisabled ? .5 : 1, pointerEvents: dailyDisabled ? 'none' : 'auto' }}
                >
                  {Icon.calendar}
                  {dailyDisabled ? dailyInfo : 'Claim Daily Credits'}
                </div>
              </div>

              <div className="ud-divider" />
              <div className="ud-section">
                <div className="ud-item danger" onClick={() => { setLogoutModal(true); setDdOpen(false) }} role="menuitem" tabIndex={0}>
                  {Icon.logout} Sign Out
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <main className="dash-main" role="main">

        {/* PAGE HEADER */}
        <header className="page-header">
          <div className="header-left">
            <div className="header-av-wrap">
              <img src={av} alt={`@${session?.user.username}`} onError={e => { (e.currentTarget as HTMLImageElement).src = '/images/nexusai.png' }} />
            </div>
            <div className="header-info">
              <h1>Welcome, <span>{session?.user.username || 'Developer'}</span></h1>
              <p>NEXUS AI Project Hub — Select a project to start chatting</p>
            </div>
          </div>
          <a href="/payment" className={`plan-badge${planCls ? ' ' + planCls : ''}`}>
            {Icon.star}
            {planLabel} PLAN
          </a>
        </header>

        {/* STATS */}
        <div className="stats-row" role="region" aria-label="Account statistics">
          <div className="stat-card">
            <div className="stat-icon yellow">{Icon.lightning}</div>
            <div className="stat-text">
              <div className="stat-val">{creditsDisplay}</div>
              <div className="stat-lbl">Credits</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon cyan">{Icon.folder}</div>
            <div className="stat-text">
              <div className="stat-val">{allProjects.length}</div>
              <div className="stat-lbl">Projects</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">{Icon.shield}</div>
            <div className="stat-text">
              <div className="stat-val" style={{ fontSize: planLabel.length > 4 ? 14 : undefined }}>{planLabel}</div>
              <div className="stat-lbl">Plan</div>
            </div>
          </div>
        </div>

        {/* MOBILE PERSISTENT NOTICE */}
        {isMobile && mobilePopupDismissed && (
          <div className="mobile-notice">
            <div className="mobile-notice-icon">{Icon.monitor}</div>
            <div className="mobile-notice-body">
              <div className="mobile-notice-title">Desktop Recommended</div>
              <div className="mobile-notice-desc">
                You&apos;re on a <strong>mobile device</strong>. Project creation is disabled.
                Switch to a desktop browser for full access.
              </div>
              <button className="btn-mobile-info" onClick={() => setMobilePopupVisible(true)}>
                {Icon.info} View details
              </button>
            </div>
          </div>
        )}

        {/* CREATE CARD */}
        <section className="create-card" aria-label="Create new project">
          {isMobile && (
            <div className="create-block-overlay" role="alert" aria-live="polite">
              {Icon.monitor}
              <h3>Desktop Required</h3>
              <p>Project creation is only available on desktop browsers.</p>
              <button onClick={() => setMobilePopupVisible(true)}>Learn More</button>
            </div>
          )}

          <div className="create-card-header">
            <div className="card-title">
              {Icon.plus}
              New Project
            </div>
            <div className="limit-pill">
              <span className="used">{allProjects.length}</span>
              <span className="sep">/</span>
              <span>{unlimited ? '∞' : limit}</span>
              &nbsp;used
            </div>
          </div>

          <div className="input-group">
            <div className="input-row">
              <input
                id="projNameInput"
                type="text"
                className={`project-input${inputError ? ' error' : ''}`}
                placeholder="Project name (max 16 chars)..."
                maxLength={PROJECT_NAME_LIMIT}
                value={projectName}
                disabled={atLimit || creating || isMobile}
                onChange={e => handleNameChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                aria-label="Project name"
                aria-describedby="char-count-hint"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button
                className={`btn-create${creating ? ' loading' : ''}`}
                disabled={atLimit || creating || isMobile}
                onClick={handleCreate}
                aria-label="Create project"
              >
                <div className="btn-spinner" aria-hidden="true" />
                <span className="btn-lbl">CREATE</span>
                <span className="btn-lbl" style={{ display: 'flex' }}>{Icon.chevRight}</span>
              </button>
            </div>

            {!isMobile && (
              <div className="input-meta" id="char-count-hint">
                <span className="input-hint">
                  {Icon.info}
                  Letters, numbers, spaces — max {PROJECT_NAME_LIMIT} chars
                </span>
                <span className={`char-count ${charCls}`} aria-live="polite">
                  {charLen} / {PROJECT_NAME_LIMIT}
                </span>
              </div>
            )}
          </div>

          {saveState && (
            <div className={saveStateCls} role="status" aria-live="polite">
              {Icon.check}
              <span>{saveState.msg}</span>
            </div>
          )}

          {pendingQueue.length > 0 && (
            <div className="queue-notice show" role="alert">
              {Icon.warn}
              <p>
                <strong>{pendingQueue.length}</strong> unsaved change{pendingQueue.length !== 1 ? 's' : ''} queued — will sync automatically when online.
              </p>
              <button onClick={retryQueue}>Retry</button>
            </div>
          )}

          <div className="info-notice" role="note">
            {Icon.info}
            <p>
              <strong>A project is required to chat.</strong> Create or select a project below to access the AI chat.
              Each project has its own isolated chat history and syncs with your Roblox Studio plugin.
            </p>
          </div>
        </section>

        {/* SEARCH & SORT */}
        <div className="filter-row" role="search">
          <div className="search-wrap">
            {Icon.search}
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
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">A – Z</option>
          </select>
        </div>

        {/* SECTION HEADER */}
        <div className="section-hdr">
          <h2>Your Projects</h2>
          <div className="section-line" />
          <div className="section-count">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {/* PROJECT GRID */}
        <div className="projects-grid" role="list" aria-label="Projects">
          {filtered.length === 0 ? (
            searchQ ? (
              <div className="empty-state" role="listitem">
                <div className="empty-icon">{Icon.search}</div>
                <strong>No results found</strong>
                <p>No projects match &quot;<strong>{searchQ}</strong>&quot;. Try a different search term.</p>
              </div>
            ) : (
              <div className="empty-state" role="listitem">
                <div className="empty-icon">{Icon.folder}</div>
                <strong>No projects yet</strong>
                <p>
                  {isMobile
                    ? 'Open NEXUS AI on a desktop browser to create your first project.'
                    : 'Create a project above to start chatting with NEXUS AI. Each project has its own isolated chat history.'}
                </p>
                {!isMobile && (
                  <div className="empty-hint">
                    {Icon.plus}
                    Type a name above and click CREATE
                  </div>
                )}
                {isMobile && (
                  <div className="empty-hint warn">
                    {Icon.monitor}
                    Desktop required to create projects
                  </div>
                )}
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
                <div className="project-card-top">
                  <div className="project-icon">{Icon.folder}</div>
                  <div className="project-top-right">
                    <span className="project-id-tag" title={p.id}>{p.id.slice(0, 12)}…</span>
                    <button
                      className="btn-delete"
                      title="Delete project"
                      onClick={e => { e.stopPropagation(); setDeleteModal({ id: p.id, name: p.name }) }}
                      aria-label={`Delete project ${p.name}`}
                    >
                      {Icon.trash}
                    </button>
                  </div>
                </div>

                <div className="project-name" title={p.name}>{p.name}</div>
                <div className="project-desc">Roblox AI project — isolated chat history &amp; Studio sync</div>

                <div className="project-meta">
                  <span className="meta-date">
                    {Icon.calendar}
                    {formatDate(p.createdAt)}
                  </span>
                  <span className={`meta-status${pendingIds.has(p.id) ? ' pending' : ''}`}>
                    <span className="status-dot" />
                    {pendingIds.has(p.id) ? 'Pending sync' : 'Active'}
                  </span>
                </div>

                <div className="project-open-btn" aria-hidden="true">
                  {Icon.play}
                  OPEN PROJECT
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* ════════════
          DELETE MODAL
      ════════════ */}
      <div
        className={`overlay${deleteModal ? ' show' : ''}`}
        onClick={e => { if (e.target === e.currentTarget) setDeleteModal(null) }}
        role="dialog" aria-modal="true" aria-label="Confirm delete"
      >
        <div className="modal-box">
          <div className="modal-icon">{Icon.trash}</div>
          <div className="modal-title">Delete Project?</div>
          <div className="modal-desc">
            Are you sure you want to delete <span className="highlight">&quot;{deleteModal?.name}&quot;</span>?
            All chat history will be permanently removed. This action cannot be undone.
          </div>
          <div className="modal-btns">
            <button className="modal-btn cancel" onClick={() => setDeleteModal(null)}>Cancel</button>
            <button className="modal-btn danger" onClick={() => deleteModal && executeDelete(deleteModal.id)}>Delete Project</button>
          </div>
        </div>
      </div>

      {/* ════════════
          LOGOUT MODAL
      ════════════ */}
      <div
        className={`overlay${logoutModal ? ' show' : ''}`}
        onClick={e => { if (e.target === e.currentTarget) setLogoutModal(false) }}
        role="dialog" aria-modal="true" aria-label="Confirm sign out"
      >
        <div className="modal-box">
          <div className="modal-icon">{Icon.logout}</div>
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

      {/* ════════════════
          SETTINGS MODAL
      ════════════════ */}
      <div
        className={`overlay${settingsOpen ? ' show' : ''}`}
        onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}
        role="dialog" aria-modal="true" aria-label="Settings"
      >
        <div className="modal-box wide">
          <div className="settings-hdr">
            <div className="settings-hdr-title">
              {Icon.gear}
              Settings
            </div>
            <button className="settings-close" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
              {Icon.x}
            </button>
          </div>

          {/* Account */}
          <div className="settings-sec">
            <div className="settings-sec-title">Roblox Account</div>
            <div className="settings-av-row">
              <img className="settings-av" src={av} alt="" onError={e => { (e.currentTarget as HTMLImageElement).src = '/images/nexusai.png' }} />
              <div>
                <div className="settings-av-name">@{session?.user.username}</div>
                <div className="settings-av-id">ID: {session?.user.robloxId || '–'}</div>
              </div>
            </div>
            <div className="settings-row">
              <label>Credits balance</label>
              <span className="s-val yellow">{creditsDisplay} CR</span>
            </div>
            <div className="settings-row">
              <label>Current plan</label>
              <span className="s-val cyan">{planLabel}</span>
            </div>
          </div>

          {/* Daily */}
          <div className="settings-sec">
            <div className="settings-sec-title">Daily Credits</div>
            <div className="settings-row"><label>Free plan</label><span style={{ color: 'var(--green)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>+2 CR / day</span></div>
            <div className="settings-row"><label>Pro plan</label><span style={{ color: 'var(--cyan)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>+25 CR / day</span></div>
            <div className="settings-row">
              <span style={{ fontSize: 10, color: 'var(--dim2)', flex: 1 }}>{dailyInfo}</span>
              <button className="settings-btn success" disabled={dailyDisabled} onClick={claimDaily}>
                Claim Daily
              </button>
            </div>
          </div>

          {/* Redeem */}
          <div className="settings-sec">
            <div className="settings-sec-title">Redeem Code</div>
            <div style={{ fontSize: 10, color: 'var(--dim2)', marginBottom: 10 }}>
              Get codes on{' '}
              <a href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)', textDecoration: 'none' }}>
                NEXUS STUDIO Discord
              </a>
            </div>
            <div className="redeem-row">
              <input
                type="text"
                className="redeem-input"
                placeholder="ENTER CODE..."
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRedeem() }}
                aria-label="Redeem code"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button className="settings-btn" onClick={handleRedeem}>Redeem</button>
            </div>
            {redeemMsg && (
              <div className="redeem-msg show" style={{ color: redeemMsg.ok ? 'var(--green)' : 'var(--pink)' }} role="alert">
                {redeemMsg.msg}
              </div>
            )}
          </div>

          {/* Plugin */}
          <div className="settings-sec">
            <div className="settings-sec-title">Studio Plugin</div>
            <div className="settings-row">
              <label>NEXUS AI for Roblox Studio</label>
              <button className="settings-btn" onClick={() => window.open('https://create.roblox.com/store/asset/91870814099475/NEXUS-AI', '_blank')}>
                Download
              </button>
            </div>
          </div>

          {/* Device */}
          <div className="settings-sec">
            <div className="settings-sec-title">Device</div>
            <div className={`device-status-row${isMobile ? ' mobile-dev' : ' desktop-dev'}`}>
              {isMobile ? Icon.smartphone : Icon.monitor}
              <div>
                <div className="device-status-label">{isMobile ? 'Mobile Device' : 'Desktop Browser'}</div>
                <div className="device-status-sub">{isMobile ? 'Limited mode — view only' : 'Full access — all features enabled'}</div>
              </div>
            </div>
            {isMobile && (
              <div className="settings-row" style={{ marginTop: 8 }}>
                <label style={{ color: 'var(--dim2)', fontSize: 10 }}>Project creation requires a desktop browser</label>
                <button className="settings-btn" onClick={() => { setSettingsOpen(false); setMobilePopupVisible(true) }}>Details</button>
              </div>
            )}
          </div>

          {/* Danger */}
          <div className="settings-sec">
            <div className="settings-sec-title" style={{ color: 'var(--pink)', opacity: .85 }}>Danger Zone</div>
            <div className="settings-row">
              <label>Sign out of this session</label>
              <button className="settings-btn danger" onClick={() => { setSettingsOpen(false); setLogoutModal(true) }}>Sign Out</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}