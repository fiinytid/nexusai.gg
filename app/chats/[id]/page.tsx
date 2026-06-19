'use client'

import React, { useEffect, useRef } from 'react'
import Script from 'next/script'

/* ─────────────────────────────────────────────────────────────────────────────
   CSS — NEXUS AI · v9
   Changes:
   - Input UI: Claude-style (circle send btn, no bar top-border, bigger font)
   - Sidebar: overlay drawer on mobile (fixed position, slides in from left)
   - Hamburger menu button in header (mobile only)
   - Better touch targets (min 38px on mobile)
   - Improved tablet & mobile breakpoints
   - Language toggle removed from main UI (Settings only)
   - Overall polish & cleanup
─────────────────────────────────────────────────────────────────────────────── */
const PAGE_CSS = `
/* ══════════════════════════════════════════════
   RESET & ROOT VARIABLES
══════════════════════════════════════════════ */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg:     #030312;
  --bg2:    #06071a;
  --bg3:    #0a0b22;
  --bg4:    #0d0e28;
  --card:   rgba(0, 229, 255, 0.04);
  --hover:  rgba(0, 229, 255, 0.07);
  --cyan:   #00e5ff;
  --cyan2:  rgba(0, 229, 255, 0.35);
  --purple: #8800ff;
  --pink:   #ff2d6b;
  --green:  #00ffaa;
  --yellow: #ffd600;
  --text:   #b8cfff;
  --dim:    #3a4a7a;
  --b:      rgba(0, 229, 255, 0.12);
  --bb:     rgba(0, 229, 255, 0.30);
  --r:   8px;
  --r-s: 6px;
  --h-xs:  22px;
  --h-sm:  28px;
  --h-md:  32px;
  --h-lg:  36px;
  --h-xl:  40px;
  --h-inp: 44px;
  --sb-w:  252px;
  --fs-2xs: 8px;
  --fs-xs:  9px;
  --fs-sm:  10px;
  --fs-md:  11px;
  --fs-base: 13px;
}

html {
  height: 100%;
  font-family: 'JetBrains Mono', monospace;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  overflow: hidden;
}
body { height: 100%; overflow: hidden; min-height: 0; }

body::before {
  content: '';
  position: fixed; inset: 0;
  pointer-events: none; z-index: 0;
  background:
    linear-gradient(rgba(0,229,255,.013) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,229,255,.013) 1px, transparent 1px);
  background-size: 40px 40px;
}

::-webkit-scrollbar { width: 3px; height: 3px; }
::-webkit-scrollbar-thumb { background: var(--b); border-radius: 2px; }
::-webkit-scrollbar-track { background: transparent; }


/* ══════════════════════════════════════════════
   PAGE LOADER
══════════════════════════════════════════════ */
#pageLoader {
  position: fixed; inset: 0;
  background: var(--bg); z-index: 99999;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px;
  transition: opacity .5s ease;
}
#pageLoader.hide { opacity: 0; pointer-events: none; }
.pl-logo { width: 72px; height: 72px; border-radius: 18px; overflow: hidden; border: 2px solid rgba(0,229,255,.4); }
.pl-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pl-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 22px; font-weight: 900;
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.pl-bar-wrap { width: 220px; height: 3px; background: rgba(0,229,255,.1); border-radius: 3px; overflow: hidden; }
.pl-bar { height: 100%; width: 0%; background: linear-gradient(90deg, var(--cyan), var(--purple)); border-radius: 3px; transition: width .35s ease; }
.pl-txt { font-size: var(--fs-2xs); color: rgba(0,229,255,.5); letter-spacing: 1px; min-height: 16px; text-align: center; }


/* ══════════════════════════════════════════════
   APP SHELL
══════════════════════════════════════════════ */
#app {
  display: grid;
  grid-template-columns: var(--sb-w) 1fr;
  height: 100vh; height: 100dvh;
  min-height: 0; overflow: hidden;
  position: relative; z-index: 1;
  transition: grid-template-columns .22s ease;
}
#app.sb-hidden { grid-template-columns: 0 1fr; }
.hidden { display: none !important; }

/* ── Mobile sidebar overlay backdrop ── */
#sbOverlay {
  display: none;
  position: fixed; inset: 0;
  background: rgba(0,0,0,.65);
  z-index: 90;
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  transition: opacity .22s ease;
}
#sbOverlay.show { display: block; }


/* ══════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════ */
#sb {
  display: flex; flex-direction: column;
  background: var(--bg2); border-right: 1px solid var(--b);
  overflow: hidden; overflow-y: auto;
  position: relative; z-index: 5;
  width: var(--sb-w); min-width: 0; min-height: 0;
}

.sb-head {
  padding: 11px 14px 10px; border-bottom: 1px solid var(--b);
  display: flex; align-items: center; gap: 9px;
  flex-shrink: 0; height: 52px;
}
.sb-logo { width: 30px; height: 30px; border-radius: 7px; overflow: hidden; flex-shrink: 0; }
.sb-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sb-logo-text {
  font-family: 'Orbitron', sans-serif; font-weight: 900; font-size: 12px; line-height: 1.15;
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.sb-logo-sub { font-size: var(--fs-2xs); color: var(--dim); line-height: 1; }

.sb-user {
  padding: 8px 12px; display: flex; align-items: center; gap: 8px;
  border-bottom: 1px solid var(--b); flex-shrink: 0; height: 52px;
}
.sb-av {
  width: 32px; height: 32px; border-radius: 50%;
  border: 1.5px solid var(--cyan2); object-fit: cover;
  background: var(--bg3); flex-shrink: 0;
  cursor: pointer; transition: .2s;
}
.sb-av:hover { border-color: var(--cyan); transform: scale(1.08); }
.sb-un   { font-size: var(--fs-md); color: white; font-weight: 500; line-height: 1.3; }
.sb-role { font-size: var(--fs-2xs); color: var(--dim); line-height: 1; }
.sb-gear {
  margin-left: auto; flex-shrink: 0;
  width: var(--h-sm); height: var(--h-sm);
  display: flex; align-items: center; justify-content: center;
  background: none; border: 1px solid transparent; border-radius: var(--r-s);
  color: var(--dim); cursor: pointer; transition: .15s;
}
.sb-gear:hover { color: var(--cyan); border-color: var(--b); background: var(--hover); }
.sb-gear svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2; }

.creds {
  margin: 8px 12px 2px; padding: 8px 12px; border-radius: var(--r);
  background: linear-gradient(135deg, rgba(255,214,0,.06), rgba(255,119,0,.06));
  border: 1px solid rgba(255,214,0,.18);
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0; cursor: pointer; transition: .15s; height: 52px;
}
.creds:hover { border-color: rgba(255,214,0,.35); }
.creds.low   { border-color: rgba(255,45,107,.4); background: rgba(255,45,107,.06); }
.cred-v   { font-family: 'Orbitron', sans-serif; font-size: 20px; color: var(--yellow); font-weight: 700; line-height: 1; }
.creds.low .cred-v { color: var(--pink); }
.cred-l   { font-size: var(--fs-2xs); color: rgba(255,214,0,.6); text-transform: uppercase; letter-spacing: 1.5px; }
.cred-hint{ font-size: var(--fs-2xs); color: rgba(255,214,0,.45); margin-top: 2px; }

.sb-btn-group {
  display: flex; flex-direction: column; gap: 3px;
  padding: 8px 12px 4px; flex-shrink: 0;
}
.sb-nav-btn {
  display: flex; align-items: center; gap: 8px;
  width: 100%; height: var(--h-md); padding: 0 12px;
  border-radius: var(--r-s);
  font-family: 'JetBrains Mono', monospace; font-size: var(--fs-sm);
  cursor: pointer; border: 1px solid var(--b);
  transition: background .15s, border-color .15s, color .15s;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: var(--card); color: var(--text); flex-shrink: 0;
}
.sb-nav-btn svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.sb-nav-btn:hover       { border-color: var(--cyan2); color: var(--cyan); background: var(--hover); }
.sb-nav-btn.cyan        { color: var(--cyan); border-color: rgba(0,229,255,.18); }
.sb-nav-btn.cyan:hover  { border-color: var(--cyan); background: rgba(0,229,255,.08); }
.sb-nav-btn.yellow      { color: var(--yellow); border-color: rgba(255,214,0,.2); background: rgba(255,214,0,.05); }
.sb-nav-btn.yellow:hover{ border-color: rgba(255,214,0,.45); background: rgba(255,214,0,.1); }
.sb-nav-btn.purple      { color: #cc55ff; border-color: rgba(136,0,255,.22); background: rgba(136,0,255,.05); }
.sb-nav-btn.purple:hover{ border-color: rgba(136,0,255,.45); background: rgba(136,0,255,.1); }

.inbox-badge {
  margin-left: auto; background: var(--pink); color: white;
  font-size: var(--fs-2xs); font-weight: 700; padding: 2px 6px;
  border-radius: 10px; min-width: 18px; text-align: center; flex-shrink: 0;
}
.proj-chip {
  margin: 4px 12px; padding: 5px 10px;
  background: rgba(255,170,50,.05); border: 1px solid rgba(255,170,50,.2);
  border-radius: var(--r-s); font-size: var(--fs-2xs);
  color: rgba(255,170,50,.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0;
}
.sec-lbl {
  padding: 8px 14px 3px; font-size: var(--fs-2xs);
  color: var(--dim); text-transform: uppercase; letter-spacing: 2px; flex-shrink: 0;
}
.convs { flex: 1; overflow-y: auto; padding: 3px 8px; min-height: 0; }
.ci {
  padding: 6px 9px; border-radius: var(--r-s);
  cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background .1s;
}
.ci:hover  { background: var(--hover); }
.ci.act    { background: rgba(0,229,255,.06); border-left: 2px solid var(--cyan); padding-left: 7px; }
.ci-title  { font-size: var(--fs-sm); color: var(--text); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ci-time   { font-size: var(--fs-2xs); color: var(--dim); flex-shrink: 0; }
.ci-del    { font-size: var(--fs-sm); color: var(--dim); opacity: 0; padding: 2px 5px; cursor: pointer; background: none; border: none; border-radius: 3px; }
.ci:hover .ci-del { opacity: 1; }
.ci-del:hover     { color: var(--pink); background: rgba(255,45,107,.1); }
.conv-empty { padding: 20px 14px; text-align: center; color: var(--dim); font-size: var(--fs-md); line-height: 1.7; }

.sb-footer {
  padding: 7px 12px; font-size: var(--fs-2xs); color: var(--dim);
  text-align: center; border-top: 1px solid var(--b); flex-shrink: 0; line-height: 1.9;
}

.collapse-sb {
  position: absolute; right: -18px; top: 50%; transform: translateY(-50%);
  width: 18px; height: 40px;
  background: var(--bg2); border: 1px solid var(--b);
  border-left: none; border-radius: 0 6px 6px 0;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: var(--dim); z-index: 10; transition: color .15s;
}
.collapse-sb:hover { color: var(--cyan); }
.collapse-sb svg { width: 10px; height: 10px; stroke: currentColor; fill: none; stroke-width: 2; }


/* ══════════════════════════════════════════════
   CHAT PANEL
══════════════════════════════════════════════ */
#chat {
  display: flex; flex-direction: column;
  overflow: hidden; position: relative; min-height: 0; min-width: 0;
}

.plug-banner {
  padding: 0 14px; flex-shrink: 0;
  background: rgba(255,45,107,.08); border-bottom: 1px solid rgba(255,45,107,.2);
  font-size: var(--fs-xs); color: var(--pink);
  display: flex; align-items: center; gap: 7px; height: 30px;
}
.plug-banner svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.plug-banner a   { color: var(--cyan); cursor: pointer; text-decoration: none; }
.plug-banner.connected { background: rgba(0,255,170,.05); border-color: rgba(0,255,170,.2); color: var(--green); }


/* ══════════════════════════════════════════════
   HEADER
══════════════════════════════════════════════ */
.chat-hdr {
  padding: 0 12px 0 14px; border-bottom: 1px solid var(--b); background: var(--bg2);
  display: flex; align-items: center; gap: 8px;
  flex-shrink: 0; height: 48px; min-width: 0;
}

/* Hamburger — hidden on desktop, shown on mobile via media query */
#menuBtn { display: none; }

.chat-title-group {
  display: flex; align-items: center; gap: 6px;
  flex: 1 1 0; min-width: 0; overflow: hidden;
}
.chat-title {
  font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 700;
  color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex-shrink: 1; min-width: 0;
}
.proj-badge-hdr {
  font-size: var(--fs-2xs); padding: 2px 8px; border-radius: 10px; height: 20px; line-height: 16px;
  background: rgba(255,170,50,.07); border: 1px solid rgba(255,170,50,.2);
  color: rgba(255,170,50,.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 120px; flex-shrink: 0; display: flex; align-items: center;
}
.ver-badge {
  display: inline-flex; align-items: center;
  padding: 0 6px; height: 18px; border-radius: 9px;
  font-family: 'Orbitron', sans-serif; font-size: 7px; font-weight: 700;
  border: 1px solid; flex-shrink: 0; white-space: nowrap; letter-spacing: .6px;
  cursor: default; user-select: none; line-height: 1;
}
.ver-badge.alpha   { color: #ff4444; border-color: rgba(255,68,68,.35);   background: rgba(255,68,68,.08); }
.ver-badge.beta    { color: var(--yellow); border-color: rgba(255,214,0,.35); background: rgba(255,214,0,.06); }
.ver-badge.release { color: var(--green);  border-color: rgba(0,255,170,.35); background: rgba(0,255,170,.06); }

.status-badge {
  display: flex; align-items: center; gap: 4px; padding: 0 8px;
  border-radius: 20px; border: 1px solid; height: 22px;
  font-size: var(--fs-2xs); cursor: pointer; flex-shrink: 0; transition: .2s;
  white-space: nowrap; max-width: 110px; overflow: hidden;
}
.status-badge.off { border-color: rgba(255,45,107,.3); color: var(--pink); background: rgba(255,45,107,.06); }
.status-badge.on  { border-color: rgba(0,255,170,.3);  color: var(--green); background: rgba(0,255,170,.06); }
.sdot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.sdot.pulse { animation: pd 1.8s infinite; }
@keyframes pd { 0%,100%{opacity:1} 50%{opacity:.25} }


/* ══════════════════════════════════════════════
   TABS
══════════════════════════════════════════════ */
.chat-tabs {
  display: flex; gap: 4px; padding: 5px 14px; border-bottom: 1px solid var(--b);
  background: var(--bg2); flex-shrink: 0; align-items: center;
  overflow-x: auto; overflow-y: hidden; scrollbar-width: none; height: 42px;
}
.chat-tabs::-webkit-scrollbar { display: none; }
.tab-btn {
  display: flex; align-items: center; gap: 5px;
  height: var(--h-sm); padding: 0 13px;
  border-radius: var(--r-s); border: 1px solid transparent;
  font-family: 'JetBrains Mono', monospace; font-size: var(--fs-sm);
  cursor: pointer; color: var(--dim); background: none; transition: .1s;
  white-space: nowrap; flex-shrink: 0;
}
.tab-btn svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.tab-btn.act          { background: rgba(0,229,255,.08); border-color: var(--b); color: var(--cyan); }
.tab-btn:hover:not(.act) { color: var(--text); }


/* ══════════════════════════════════════════════
   MESSAGES
══════════════════════════════════════════════ */
#msgs {
  flex: 1; overflow-y: auto; padding: 16px 16px 8px;
  display: flex; flex-direction: column; gap: 10px; min-height: 0;
}

.welcome {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; text-align: center; gap: 12px; padding: 30px 16px; color: var(--dim);
}
.wt {
  font-family: 'Orbitron', sans-serif; font-size: 22px; font-weight: 900;
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.ws { font-size: var(--fs-md); line-height: 1.9; max-width: 340px; }
.suggs { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; max-width: 440px; margin-top: 4px; width: 100%; }
.sugg {
  padding: 9px 11px; background: var(--card); border: 1px solid var(--b);
  border-radius: var(--r); cursor: pointer; transition: .18s; text-align: left;
  font-family: 'JetBrains Mono', monospace; font-size: var(--fs-md); color: var(--text); line-height: 1.5;
}
.sugg:hover { border-color: var(--cyan2); background: var(--hover); color: white; }
.sugg-title {
  color: var(--cyan); display: flex; align-items: center; gap: 5px;
  margin-bottom: 3px; font-size: var(--fs-sm); font-weight: 700;
}
.sugg-title svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }

.msg       { display: flex; gap: 9px; animation: mi .22s ease; }
.msg.user  { flex-direction: row-reverse; }
@keyframes mi { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:none} }
.av { width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; overflow: hidden; background: var(--bg3); }
.av img { width: 100%; height: 100%; object-fit: cover; }
.mb-wrap    { max-width: 82%; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.msg-sender { font-size: var(--fs-2xs); color: var(--dim); display: flex; align-items: center; gap: 5px; padding: 0 3px; }
.msg.user .msg-sender { flex-direction: row-reverse; }
.bubble { padding: 10px 13px; border-radius: 10px; line-height: 1.7; font-size: 12.5px; word-break: break-word; }
.msg.user .bubble {
  background: linear-gradient(135deg, rgba(0,229,255,.08), rgba(136,0,255,.08));
  border: 1px solid rgba(0,229,255,.15); border-radius: 10px 2px 10px 10px; color: white;
}
.msg.ai .bubble { background: var(--bg2); border: 1px solid var(--b); border-radius: 2px 10px 10px 10px; color: var(--text); }
.msg-imgs { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 7px; }
.msg-img {
  max-width: 160px; max-height: 130px; border-radius: 6px; object-fit: cover;
  border: 1px solid var(--b); cursor: pointer; transition: .15s;
}
.msg-img:hover { border-color: var(--cyan); transform: scale(1.02); }

.code-block-wrap   { position: relative; margin: 8px 0; border-radius: 7px; overflow: hidden; border: 1px solid rgba(0,229,255,.1); }
.code-lang-bar     { display: flex; align-items: center; justify-content: space-between; padding: 4px 10px; background: rgba(0,229,255,.06); border-bottom: 1px solid rgba(0,229,255,.1); font-size: var(--fs-2xs); color: var(--cyan); height: 28px; }
.code-block-wrap pre { margin: 0; }
.code-block-wrap pre code.hljs { font-size: 11px; line-height: 1.55; padding: 12px 14px; border-radius: 0; border: none; }
.code-btns { display: flex; gap: 4px; align-items: center; }
.cbtn {
  background: rgba(10,11,34,.9); border: 1px solid rgba(0,229,255,.25); border-radius: 5px;
  color: var(--cyan); font-size: var(--fs-2xs); padding: 0 8px; cursor: pointer;
  display: flex; align-items: center; gap: 3px; transition: .12s; height: var(--h-xs);
}
.cbtn:hover { background: rgba(0,229,255,.15); }
.cbtn svg   { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; }
.cbtn.dl    { color: #cc55ff; border-color: rgba(136,0,255,.3); }
.bubble code:not(.hljs) { background: rgba(0,229,255,.08); padding: 2px 5px; border-radius: 3px; font-size: 11px; color: var(--cyan); }
.bubble p   { margin-bottom: 6px; } .bubble p:last-child { margin-bottom: 0; }
.bubble h1, .bubble h2, .bubble h3 { color: var(--cyan); margin: 10px 0 5px; font-family: 'Orbitron', sans-serif; }
.bubble h1  { font-size: 14px; } .bubble h2 { font-size: 13px; } .bubble h3 { font-size: 12px; }
.bubble ul, .bubble ol { padding-left: 18px; margin-bottom: 6px; }
.bubble li  { margin-bottom: 3px; line-height: 1.65; }
.bubble strong { color: white; }
.bubble table { width: 100%; border-collapse: collapse; margin: 7px 0; font-size: 11px; }
.bubble th, .bubble td { padding: 5px 9px; border: 1px solid var(--b); }
.bubble th  { background: rgba(0,229,255,.06); color: var(--cyan); }

.msg-acts { display: flex; gap: 2px; padding: 2px; flex-wrap: wrap; }
.mab {
  font-size: var(--fs-2xs); color: var(--dim); background: none; border: 1px solid transparent;
  cursor: pointer; padding: 0 6px; border-radius: 4px; transition: .12s;
  display: flex; align-items: center; gap: 3px;
  font-family: 'JetBrains Mono', monospace; height: var(--h-xs);
}
.mab:hover    { color: var(--cyan); border-color: var(--b); background: var(--card); }
.mab.liked    { color: var(--green); border-color: rgba(0,255,170,.3); }
.mab.disliked { color: var(--pink);  border-color: rgba(255,45,107,.3); }
.mab svg      { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; }

.attach-row { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; padding: 0 2px; }
.attach-row:empty { display: none; }
.attach-item { position: relative; }
.attach-item img { width: 52px; height: 52px; border-radius: 5px; object-fit: cover; border: 1px solid var(--b); }
.attach-file {
  padding: 5px 9px; border: 1px solid var(--b); border-radius: 5px;
  font-size: var(--fs-sm); color: var(--cyan); background: rgba(0,229,255,.04);
  display: flex; align-items: center; gap: 4px;
  max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.attach-rm {
  position: absolute; top: -5px; right: -5px;
  width: 16px; height: 16px; background: var(--pink); border: none; border-radius: 50%;
  color: white; font-size: var(--fs-2xs); cursor: pointer;
  display: flex; align-items: center; justify-content: center; z-index: 2;
}


/* ══════════════════════════════════════════════════════════════════════════
   INPUT AREA — CLAUDE-STYLE
   Desain bersih seperti Claude AI:
   - Box rounded dengan border subtle
   - Textarea dengan font lebih besar
   - Bar bawah tanpa separator garis
   - Send button lingkaran gradient
   - Attach button ikon bersih tanpa border
══════════════════════════════════════════════════════════════════════════ */
.inp-area {
  padding: 10px 14px 14px;
  border-top: 1px solid var(--b);
  background: var(--bg2);
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}

.inp-box {
  background: var(--bg3);
  border: 1.5px solid rgba(0, 229, 255, 0.18);
  border-radius: 18px;
  transition: border-color .22s, box-shadow .22s;
  overflow: hidden;
}
.inp-box.drag-over    { border-color: var(--cyan); box-shadow: 0 0 0 3px rgba(0,229,255,.08); }
.inp-box:focus-within { border-color: rgba(0,229,255,.42); box-shadow: 0 0 0 3px rgba(0,229,255,.05); }

#inp {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: rgba(255,255,255,.92);
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  padding: 14px 16px 6px;
  resize: none;
  min-height: 56px;
  max-height: 200px;
  line-height: 1.65;
  display: block;
  scrollbar-width: thin;
  scrollbar-color: var(--b) transparent;
}
#inp::placeholder { color: rgba(58,74,122,.75); font-size: 13px; }

/* ─── Input bar — no top border, Claude-style ─── */
.inp-bar {
  display: flex;
  align-items: center;
  padding: 6px 10px 10px;
  gap: 6px;
}

.inp-l {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

/* ─── Universal icon button ─── */
.ib {
  width: 32px;
  height: 32px;
  min-width: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  vertical-align: middle;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(58,74,122,.9);
  cursor: pointer;
  transition: color .14s, background .14s;
  padding: 0;
  line-height: 1;
  box-sizing: border-box;
  user-select: none;
  outline: none;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.ib:hover  { color: var(--text); background: rgba(0,229,255,.07); }
.ib:active { background: rgba(0,229,255,.12); }
.ib svg {
  width: 16px; height: 16px;
  stroke: currentColor; fill: none; stroke-width: 1.6;
  flex-shrink: 0;
  display: block;
  pointer-events: none;
}

/* ─── File input — truly off-screen ─── */
#fi {
  position: fixed !important;
  top: -9999px !important;
  left: -9999px !important;
  width: 1px !important;
  height: 1px !important;
  opacity: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
  visibility: hidden !important;
}

.inp-divider {
  width: 1px; height: 16px;
  background: rgba(0,229,255,.1);
  flex-shrink: 0; border-radius: 1px;
  margin: 0 2px;
}

/* Model selector pill */
.inp-model {
  display: flex; align-items: center; gap: 5px;
  height: 26px; padding: 0 8px;
  border-radius: 8px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.06);
  cursor: pointer; transition: .14s;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; color: var(--dim);
  max-width: clamp(110px, 180px, 32vw);
  min-width: 0; overflow: hidden; flex-shrink: 1;
  -webkit-tap-highlight-color: transparent;
}
.inp-model:hover { border-color: var(--b); color: var(--text); background: rgba(0,229,255,.04); }
.inp-model img   { width: 13px; height: 13px; border-radius: 2px; object-fit: contain; flex-shrink: 0; }
.inp-model-name  { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; font-size: 10px; min-width: 0; }
.inp-model-badge {
  font-size: 8px; font-weight: 700; flex-shrink: 0;
  padding: 1px 4px; border-radius: 3px; border: 1px solid;
}
.inp-model-badge[data-tier="fast"]  { color: var(--cyan);   border-color: rgba(0,229,255,.3);   background: rgba(0,229,255,.07); }
.inp-model-badge[data-tier="pro"]   { color: #cc55ff;       border-color: rgba(136,0,255,.35);  background: rgba(136,0,255,.07); }
.inp-model-badge[data-tier="think"] { color: var(--yellow); border-color: rgba(255,214,0,.3);   background: rgba(255,214,0,.06); }

/* ─── Send button — circle, Claude-style ─── */
.btn-send {
  width: 34px; height: 34px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  color: white;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: opacity .18s, transform .14s;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}
.btn-send:hover  { opacity: .85; transform: scale(1.07); }
.btn-send:active { transform: scale(.94); opacity: 1; }
.btn-send svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2.2; }

.btn-cancel {
  width: 30px; height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(255,45,107,.3);
  background: rgba(255,45,107,.08);
  color: var(--pink);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; transition: .14s; flex-shrink: 0;
}
.btn-cancel:hover { background: rgba(255,45,107,.18); }
.btn-cancel svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; }


/* ══════════════════════════════════════════════
   DROPDOWNS
══════════════════════════════════════════════ */
.model-dd {
  position: fixed; background: var(--bg3); border: 1px solid var(--b); border-radius: var(--r);
  z-index: 9000; display: none; box-shadow: 0 8px 32px rgba(0,0,0,.95);
  max-height: min(380px, 70vh); overflow-y: auto; min-width: 265px;
}
.model-dd::-webkit-scrollbar { width: 3px; }
.model-dd::-webkit-scrollbar-thumb { background: var(--b); }
.model-dd.open { display: block; }
.mg { padding: 6px 11px 3px; font-size: var(--fs-2xs); color: var(--dim); text-transform: uppercase; letter-spacing: 2px; border-top: 1px solid var(--b); }
.mg:first-child { border-top: none; }
.mo { padding: 7px 11px; display: flex; align-items: center; gap: 7px; cursor: pointer; transition: .1s; }
.mo:hover { background: var(--hover); }
.mo.act   { background: rgba(0,229,255,.06); }
.mo-icon  { width: 20px; height: 20px; border-radius: 4px; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.mo-icon img { width: 100%; height: 100%; object-fit: contain; }
.mo-n  { font-size: var(--fs-md); color: white; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mo-s  { font-size: var(--fs-2xs); color: var(--dim); }
.mb-badge { font-size: var(--fs-2xs); padding: 1px 5px; border-radius: 3px; font-weight: 700; white-space: nowrap; }
.mb-badge.f { background: rgba(0,255,170,.12); color: var(--green); }
.mb-badge.s { background: rgba(0,229,255,.12); color: var(--cyan); }
.mb-badge.p { background: rgba(136,0,255,.15); color: #cc55ff; }


/* ══════════════════════════════════════════════
   THINKING / STEPS
══════════════════════════════════════════════ */
.steps-wrap { display: flex; gap: 9px; animation: mi .22s ease; }
.steps-box  { background: var(--bg2); border: 1px solid var(--b); border-radius: 2px 10px 10px 10px; padding: 0; overflow: hidden; min-width: 280px; max-width: min(520px, 90vw); }
.steps-hdr  { padding: 9px 13px 8px; display: flex; align-items: center; gap: 7px; border-bottom: 1px solid var(--b); }
.steps-hdr-spinner { width: 11px; height: 11px; border: 1.5px solid rgba(0,229,255,.2); border-top-color: var(--cyan); border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }
.steps-hdr-txt   { font-family: 'Orbitron', sans-serif; font-size: var(--fs-2xs); color: var(--cyan); letter-spacing: .5px; flex: 1; }
.steps-hdr-count { font-size: var(--fs-2xs); color: var(--dim); }
.steps-list { padding: 4px 0; }
.step-row   { display: flex; align-items: flex-start; gap: 7px; padding: 3px 12px; font-size: var(--fs-md); line-height: 1.5; animation: stepIn .18s ease; }
@keyframes stepIn { from{opacity:0;transform:translateX(-3px)} to{opacity:1;transform:none} }
.step-ic    { width: 14px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
.step-spin  { width: 10px; height: 10px; border: 1.5px solid rgba(0,229,255,.15); border-top-color: var(--cyan); border-radius: 50%; animation: spin .6s linear infinite; }
.step-check { width: 10px; height: 10px; color: var(--green); stroke: currentColor; fill: none; stroke-width: 2.5; }
.step-err   { width: 10px; height: 10px; color: var(--pink);  stroke: currentColor; fill: none; stroke-width: 2.5; }
.step-pend  { width: 8px;  height: 8px;  border-radius: 50%; border: 1.5px solid var(--dim); }
.step-info  { width: 10px; height: 10px; color: var(--yellow); stroke: currentColor; fill: none; stroke-width: 2; }
.step-content { flex: 1; min-width: 0; }
.step-txt   { color: var(--text); word-break: break-word; }
.step-row[data-st="done"]    .step-txt { color: var(--dim); }
.step-row[data-st="running"] .step-txt { color: var(--cyan); }
.step-row[data-st="error"]   .step-txt { color: var(--pink); }
.step-row[data-st="info"]    .step-txt { color: var(--yellow); }
.step-sub   { font-size: var(--fs-2xs); color: var(--dim); margin-top: 1px; opacity: .8; }
.steps-cancel { padding: 7px 12px; border-top: 1px solid var(--b); }
.steps-cancel-btn {
  padding: 0 12px; height: var(--h-xs);
  background: rgba(255,45,107,.08); border: 1px solid rgba(255,45,107,.25);
  border-radius: 5px; color: var(--pink); font-size: var(--fs-2xs); cursor: pointer; transition: .1s;
  font-family: 'JetBrains Mono', monospace; display: inline-flex; align-items: center;
}
.steps-cancel-btn:hover { background: rgba(255,45,107,.16); }
@keyframes spin { to{transform:rotate(360deg)} }

.studio-summary-box   { margin-top: 8px; padding: 8px 10px; background: rgba(0,255,170,.04); border: 1px solid rgba(0,255,170,.15); border-radius: 6px; font-size: 10.5px; }
.studio-summary-title { color: var(--green); font-size: var(--fs-2xs); font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.studio-summary-item  { color: var(--text); padding: 1px 0; display: flex; align-items: center; gap: 5px; }
.studio-summary-dot   { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--green); flex-shrink: 0; }
.studio-summary-items { transition: all .2s ease; }


/* ══════════════════════════════════════════════
   GUI EDITOR TAB
══════════════════════════════════════════════ */
#guiTab { flex: 1; overflow: hidden; display: none; flex-direction: column; min-height: 0; }
.gui-toolbar {
  padding: 5px 12px; border-bottom: 1px solid var(--b); background: var(--bg2);
  display: flex; align-items: center; gap: 5px; flex-shrink: 0;
  overflow-x: auto; overflow-y: hidden; scrollbar-width: none; height: 44px;
}
.gui-toolbar::-webkit-scrollbar { display: none; }
.gui-add-label { font-size: var(--fs-xs); color: var(--dim); flex-shrink: 0; white-space: nowrap; }
.gui-btn {
  display: inline-flex; align-items: center; gap: 4px;
  height: var(--h-sm); padding: 0 9px;
  border-radius: var(--r-s); border: 1px solid var(--b); background: var(--card); color: var(--text);
  font-family: 'JetBrains Mono', monospace; font-size: var(--fs-xs); cursor: pointer; transition: .15s; white-space: nowrap; flex-shrink: 0;
}
.gui-btn:hover { border-color: var(--cyan2); color: var(--cyan); }
.gui-btn svg   { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 1.8; flex-shrink: 0; }
.gui-ai-btn {
  display: inline-flex; align-items: center; gap: 4px;
  height: var(--h-sm); padding: 0 11px;
  background: rgba(136,0,255,.15); border: 1px solid rgba(136,0,255,.4); border-radius: var(--r-s); color: #cc55ff;
  font-family: 'JetBrains Mono', monospace; font-size: var(--fs-xs); cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: .15s;
}
.gui-ai-btn:hover { background: rgba(136,0,255,.25); }
.gui-ai-btn svg   { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.gui-gen-btn {
  display: inline-flex; align-items: center; gap: 4px;
  height: var(--h-sm); padding: 0 11px;
  background: linear-gradient(135deg, var(--cyan), var(--purple)); border: none; border-radius: var(--r-s);
  color: white; font-family: 'Orbitron', sans-serif; font-size: var(--fs-xs); font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.gui-gen-btn svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.gui-main    { flex: 1; display: flex; overflow: hidden; position: relative; min-height: 0; }
.gui-layers  { width: 145px; background: var(--bg2); border-right: 1px solid var(--b); overflow-y: auto; padding: 6px; flex-shrink: 0; min-height: 0; }
.gui-layer-title { font-size: var(--fs-2xs); color: var(--dim); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px; padding: 0 2px; }
.gui-layer-item  { padding: 4px 7px; border-radius: 4px; font-size: var(--fs-sm); color: var(--text); cursor: pointer; display: flex; align-items: center; gap: 5px; transition: .1s; }
.gui-layer-item:hover { background: var(--hover); }
.gui-layer-item.sel   { background: rgba(0,229,255,.06); color: var(--cyan); }
.gui-layer-dot  { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.gui-canvas { flex: 1; position: relative; background: rgba(0,0,0,.3); overflow: auto; min-height: 0; min-width: 0; }
.gui-canvas-inner { width: 800px; height: 600px; position: relative; background: rgba(15,20,50,.85); border: 1px solid var(--b); margin: 20px auto; min-width: 400px; }
.gui-el { position: absolute; border: 1px solid transparent; cursor: move; user-select: none; display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; overflow: hidden; }
.gui-el.selected { outline: 1.5px solid var(--cyan) !important; outline-offset: 1px; }
.gui-resize { position: absolute; bottom: -4px; right: -4px; width: 9px; height: 9px; background: var(--cyan); border-radius: 2px; cursor: se-resize; }
.gui-props      { width: 210px; background: var(--bg2); border-left: 1px solid var(--b); overflow-y: auto; padding: 8px; flex-shrink: 0; min-height: 0; }
.gui-prop-label { font-size: var(--fs-2xs); color: var(--dim); margin-bottom: 2px; margin-top: 6px; }
.gui-prop-input { width: 100%; background: var(--bg3); border: 1px solid var(--b); border-radius: 4px; padding: 4px 7px; color: white; font-family: 'JetBrains Mono', monospace; font-size: var(--fs-md); outline: none; }
.gui-prop-input:focus { border-color: var(--cyan2); }
.gui-loading  { position: absolute; inset: 0; background: rgba(3,3,18,.85); display: none; align-items: center; justify-content: center; flex-direction: column; gap: 10px; font-size: var(--fs-md); color: var(--cyan); }
.gui-loading.show { display: flex; }
.gui-empty-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; color: rgba(0,229,255,.12); font-size: var(--fs-md); pointer-events: none; }
.gui-empty-hint svg { width: 30px; height: 30px; stroke: currentColor; fill: none; stroke-width: 1.5; }
.gui-right { margin-left: auto; display: flex; align-items: center; gap: 5px; flex-shrink: 0; flex-wrap: nowrap; }


/* ══════════════════════════════════════════════
   MODAL
══════════════════════════════════════════════ */
.ov {
  position: fixed; inset: 0; background: rgba(3,3,18,.93); z-index: 500;
  display: none; align-items: flex-start; justify-content: center;
  backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
  padding: 20px 16px; overflow-y: auto;
}
.ov.show { display: flex; }
.modal {
  background: var(--bg2); border: 1px solid var(--b); border-radius: 13px; padding: 22px;
  width: 500px; max-width: 100%; box-shadow: 0 24px 64px rgba(0,0,0,.9); margin: auto; position: relative;
}
.modal-t { font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 700; color: var(--cyan); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
.modal-t svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.modal-b     { font-size: var(--fs-md); color: var(--text); line-height: 1.75; margin-bottom: 14px; }
.modal-b code { font-family: 'JetBrains Mono'; background: rgba(0,229,255,.08); padding: 1px 5px; border-radius: 3px; color: var(--cyan); }
.modal-footer { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.btn-modal {
  display: inline-flex; align-items: center; justify-content: center;
  height: var(--h-lg); padding: 0 16px; border-radius: var(--r);
  font-family: 'Orbitron', sans-serif; font-size: var(--fs-sm); font-weight: 700;
  cursor: pointer; border: none; transition: .15s; white-space: nowrap;
}
.btn-modal.primary   { background: var(--cyan); color: #030312; }
.btn-modal.secondary { background: rgba(255,255,255,.06); color: var(--text); border: 1px solid var(--b); }
.btn-modal:hover     { opacity: .84; }

.settings-section { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--b); }
.settings-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.settings-title   { font-size: var(--fs-xs); color: var(--cyan); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; font-family: 'Orbitron', sans-serif; }
.settings-row     { display: flex; align-items: center; justify-content: space-between; padding: 5px 0; font-size: var(--fs-md); gap: 8px; flex-wrap: wrap; }
.settings-hint    { font-size: var(--fs-2xs); color: var(--dim); margin-top: 2px; line-height: 1.5; }
.settings-btn {
  display: inline-flex; align-items: center; height: var(--h-sm); padding: 0 13px;
  border-radius: var(--r-s); font-family: 'JetBrains Mono', monospace; font-size: var(--fs-sm); cursor: pointer;
  border: 1px solid var(--b); background: var(--card); color: var(--text);
  transition: .15s; white-space: nowrap; flex-shrink: 0; text-decoration: none;
}
.settings-btn:hover { border-color: var(--cyan2); color: var(--cyan); }
.settings-btn.danger       { border-color: rgba(255,45,107,.3); color: var(--pink); }
.settings-btn.danger:hover { background: rgba(255,45,107,.08); }
.settings-select {
  background: var(--bg3); border: 1px solid var(--b); border-radius: var(--r-s);
  padding: 0 8px; color: white; font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-sm); outline: none; cursor: pointer; height: var(--h-sm);
}
.toggle-sw {
  width: 38px; height: 20px; border-radius: 10px; background: var(--dim);
  border: none; cursor: pointer; position: relative; transition: .25s; flex-shrink: 0; outline: none;
}
.toggle-sw.on { background: var(--cyan); }
.toggle-sw::after {
  content: ''; position: absolute; top: 3px; left: 3px;
  width: 14px; height: 14px; border-radius: 50%;
  background: white; transition: .25s; box-shadow: 0 1px 4px rgba(0,0,0,.4);
}
.toggle-sw.on::after { left: 21px; }
.report-ta {
  width: 100%; background: var(--bg3); border: 1px solid var(--b); border-radius: 6px;
  padding: 8px 10px; color: white; font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-md); outline: none; resize: vertical; min-height: 80px; margin-top: 6px;
}

.install-step { display: flex; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--b); align-items: flex-start; }
.install-step:last-child { border-bottom: none; }
.install-num  { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, var(--cyan), var(--purple)); display: flex; align-items: center; justify-content: center; font-size: var(--fs-sm); font-weight: 700; color: white; flex-shrink: 0; margin-top: 1px; }
.install-txt  { font-size: var(--fs-md); color: var(--text); line-height: 1.65; flex: 1; }
.install-txt code { color: var(--cyan); background: rgba(0,229,255,.08); padding: 1px 4px; border-radius: 3px; font-size: var(--fs-sm); }

.badge-owner { background: linear-gradient(135deg, rgba(255,214,0,.2), rgba(255,140,0,.2)); color: var(--yellow); border: 1px solid rgba(255,214,0,.3); padding: 2px 8px; border-radius: 10px; font-size: var(--fs-2xs); font-weight: 700; font-family: 'Orbitron', sans-serif; }
.badge-admin { background: rgba(0,229,255,.1);  color: var(--cyan); border: 1px solid rgba(0,229,255,.3);  padding: 2px 8px; border-radius: 10px; font-size: var(--fs-2xs); font-weight: 700; }
.badge-pro   { background: rgba(136,0,255,.12); color: #cc55ff;    border: 1px solid rgba(136,0,255,.3);  padding: 2px 8px; border-radius: 10px; font-size: var(--fs-2xs); font-weight: 700; }
.share-modal-ta { width: 100%; background: var(--bg3); border: 1px solid var(--b); border-radius: 6px; padding: 8px 10px; color: var(--text); font-family: 'JetBrains Mono', monospace; font-size: var(--fs-sm); outline: none; resize: none; height: 200px; margin-top: 8px; }


/* ══════════════════════════════════════════════
   MENTION DROPDOWN
══════════════════════════════════════════════ */
.mention-dd {
  position: fixed; background: var(--bg3); border: 1px solid var(--bb); border-radius: var(--r);
  z-index: 8000; max-height: min(260px, 50vh); overflow-y: auto;
  box-shadow: 0 -10px 40px rgba(0,0,0,.97); min-width: 290px; display: none;
}
.mention-dd.open { display: block; }
.mention-hdr  { padding: 5px 12px 4px; font-size: var(--fs-2xs); color: var(--dim); text-transform: uppercase; letter-spacing: 2px; border-bottom: 1px solid var(--b); display: flex; align-items: center; gap: 5px; }
.mention-item { padding: 7px 12px; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: .1s; }
.mention-item:hover, .mention-item.sel { background: var(--hover); }
.mention-ic   { width: 20px; height: 20px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: var(--fs-2xs); font-weight: 700; flex-shrink: 0; }
.mention-ic.script { background: rgba(0,229,255,.1);  color: var(--cyan); }
.mention-ic.local  { background: rgba(0,255,170,.1);  color: var(--green); }
.mention-ic.module { background: rgba(136,0,255,.1);  color: #cc55ff; }
.mention-ic.obj    { background: rgba(255,214,0,.1);  color: var(--yellow); }
.mention-name { font-size: var(--fs-md); color: white; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.mention-path { font-size: var(--fs-2xs); color: var(--dim); }
.mention-empty{ padding: 12px; font-size: var(--fs-sm); color: var(--dim); text-align: center; }


/* ══════════════════════════════════════════════
   SUGGESTION CHIPS
══════════════════════════════════════════════ */
.suggestion-chips { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; margin-bottom: 2px; }
.suggestion-chip {
  display: flex; align-items: center; gap: 8px; padding: 7px 12px 7px 10px;
  background: rgba(0,229,255,.05); border: 1px solid rgba(0,229,255,.16); border-radius: 8px;
  color: var(--text); font-size: 11.5px; cursor: pointer; text-align: left;
  transition: background .14s, border-color .14s, color .14s, transform .1s;
  font-family: 'JetBrains Mono', monospace; width: fit-content; max-width: 100%; line-height: 1.4;
}
.suggestion-chip::before {
  content: ''; display: inline-flex; width: 0; height: 0;
  border-top: 4.5px solid transparent; border-bottom: 4.5px solid transparent;
  border-left: 7px solid var(--cyan); flex-shrink: 0; opacity: .55; transition: opacity .14s, transform .14s;
}
.suggestion-chip:hover { background: rgba(0,229,255,.12); border-color: rgba(0,229,255,.38); color: var(--cyan); }
.suggestion-chip:hover::before { opacity: 1; transform: translateX(2px); }
.suggestion-chip:active { transform: scale(.97); }
.suggestion-chip.sending { opacity: .5; pointer-events: none; }
@keyframes toastIn { from{opacity:0;transform:translateX(12px)} to{opacity:1;transform:none} }


/* ══════════════════════════════════════════════
   RESPONSIVE — TABLET & MOBILE
══════════════════════════════════════════════ */
@media (max-width: 1100px) { :root { --sb-w: 230px; } }
@media (max-width: 900px) {
  :root { --sb-w: 210px; }
  .inp-model { max-width: 140px; }
  .proj-badge-hdr { max-width: 90px; }
}

/* ── TABLET (768px–1024px) ── */
@media (max-width: 1024px) and (min-width: 769px) {
  :root { --sb-w: 220px; }
  .bubble { font-size: 12.5px; }
  .mb-wrap { max-width: 86%; }
}

/* ── MOBILE (≤768px) — Overlay Drawer Sidebar ── */
@media (max-width: 768px) {
  /* App: flex column, full height */
  #app {
    display: flex !important;
    flex-direction: column !important;
    height: 100vh !important;
    height: 100dvh !important;
    grid-template-columns: none !important;
    overflow: hidden !important;
  }
  /* sb-hidden has no effect on mobile (sidebar is fixed overlay) */
  #app.sb-hidden { grid-template-columns: none !important; }

  /* Sidebar: fixed overlay drawer from left */
  #sb {
    position: fixed !important;
    left: -100% !important;
    top: 0 !important;
    width: min(285px, 88vw) !important;
    height: 100% !important;
    height: 100dvh !important;
    max-height: none !important;
    z-index: 100 !important;
    border-right: 1px solid var(--b) !important;
    border-bottom: none !important;
    overflow-y: auto !important;
    box-shadow: 6px 0 40px rgba(0,0,0,.75) !important;
    transition: left .28s cubic-bezier(.4,0,.2,1) !important;
  }
  #sb.mobile-open { left: 0 !important; }

  /* Show hamburger button */
  #menuBtn { display: inline-flex !important; }
  .collapse-sb { display: none !important; }

  /* Restore sidebar content visibility in drawer */
  .convs     { display: flex !important; flex-direction: column; }
  .sec-lbl   { display: block !important; }
  .sb-footer { display: block !important; }
  .sb-btn-group { flex-direction: column !important; }

  /* Chat: takes full remaining space */
  #chat { flex: 1 !important; min-height: 0 !important; width: 100% !important; }

  /* Better touch targets */
  .ib { width: 38px !important; height: 38px !important; min-width: 38px !important; }
  .ib svg { width: 18px !important; height: 18px !important; }
  .btn-send { width: 40px !important; height: 40px !important; }
  .btn-send svg { width: 17px !important; height: 17px !important; }
  .btn-cancel { width: 36px !important; height: 36px !important; }

  /* Input */
  .inp-area { padding: 8px 10px 14px; }
  #inp {
    font-size: 16px !important; /* prevents iOS zoom */
    padding: 13px 14px 5px;
    min-height: 52px;
    max-height: 160px;
  }
  .inp-bar { padding: 4px 8px 9px; gap: 5px; }
  .inp-box { border-radius: 16px; }
  .inp-model { max-width: 120px; }

  /* Messages */
  .mb-wrap { max-width: 92%; }
  .bubble  { font-size: 13px; padding: 9px 11px; }
  #msgs    { padding: 12px 10px 6px; gap: 8px; }

  /* Header */
  .chat-hdr { padding: 0 10px; gap: 6px; height: 48px; }
  .chat-title { font-size: var(--fs-sm); }
  .proj-badge-hdr { display: none !important; }
  .status-badge { max-width: 88px; font-size: 8px; padding: 0 6px; height: 20px; }

  /* Tabs */
  .chat-tabs { padding: 4px 10px; gap: 3px; height: 40px; }
  .tab-btn   { padding: 0 11px; font-size: var(--fs-sm); }

  /* Welcome screen */
  .suggs { grid-template-columns: 1fr; }
  .wt { font-size: 20px; }
  .ws { font-size: var(--fs-md); }

  /* GUI */
  .gui-toolbar { flex-wrap: nowrap; padding: 5px 8px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .gui-toolbar::-webkit-scrollbar { display: none; }
  .gui-layers, .gui-props { display: none; }

  /* Modal */
  .ov { padding: 12px 10px; }
  .modal { padding: 16px; border-radius: 12px; }
  .modal-t { font-size: 12px; }

  /* Plugin banner */
  .plug-banner { font-size: 9px; padding: 0 10px; gap: 5px; height: 28px; }
}

@media (max-width: 480px) {
  .inp-model { max-width: 100px; }
  .chat-title { font-size: var(--fs-2xs); }
  .status-badge { max-width: 75px; }
  .modal { padding: 14px; }
  .wt { font-size: 18px; }
}

@media (max-width: 360px) {
  .status-badge { display: none; }
  .ver-badge { display: none; }
}
`

/* ─────────────────────────────────────────────────────────────────────────────
   QUEUE-BASED wCall
─────────────────────────────────────────────────────────────────────────────── */
type AnyFn = (...args: unknown[]) => void

interface PendingCall {
  name: string
  args: unknown[]
}

const _pendingCalls: PendingCall[] = []
let   _chatsModuleLoaded = false

function wCall(name: string, ...args: unknown[]): void {
  const w  = window as unknown as Record<string, unknown>
  const fn = w[name]
  if (typeof fn === 'function') { ;(fn as AnyFn)(...args); return }
  if (!_chatsModuleLoaded) { _pendingCalls.push({ name, args }); return }
  setTimeout(() => {
    const fn2 = (window as unknown as Record<string, unknown>)[name]
    if (typeof fn2 === 'function') { ;(fn2 as AnyFn)(...args) }
    else console.warn('[NEXUS] wCall: fungsi tidak ditemukan →', name)
  }, 80)
}

function _flushPendingCalls(): void {
  _chatsModuleLoaded = true
  const queued = _pendingCalls.splice(0)
  queued.forEach(({ name, args }) => {
    const fn = (window as unknown as Record<string, unknown>)[name]
    if (typeof fn === 'function') { ;(fn as AnyFn)(...args) }
    else console.warn('[NEXUS] Flush: fungsi tidak ditemukan →', name)
  })
}

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
─────────────────────────────────────────────────────────────────────────────── */
type GuiType = 'Frame' | 'TextLabel' | 'TextButton' | 'TextBox' | 'ImageLabel' | 'ScrollingFrame'
interface GuiTypeConfig { type: GuiType; label: string; icon: React.ReactNode }
interface ThemeOption   { value: string; label: string }

/* ─────────────────────────────────────────────────────────────────────────────
   ICONS
─────────────────────────────────────────────────────────────────────────────── */
const Icon: Record<string, React.ReactElement> = {
  settings: (
    <svg viewBox="0 0 24 24" width={15} height={15} stroke="currentColor" fill="none" strokeWidth={2}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  menu: (<svg viewBox="0 0 24 24" width={18} height={18} stroke="currentColor" fill="none" strokeWidth={2}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>),
  chat: (<svg viewBox="0 0 24 24" width={11} height={11} stroke="currentColor" fill="none" strokeWidth={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>),
  code: (<svg viewBox="0 0 24 24" width={11} height={11} stroke="currentColor" fill="none" strokeWidth={2}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>),
  grid: (<svg viewBox="0 0 24 24" width={11} height={11} stroke="currentColor" fill="none" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>),
  send: (<svg viewBox="0 0 24 24" width={14} height={14} stroke="currentColor" fill="none" strokeWidth={2.2}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>),
  x:    (<svg viewBox="0 0 24 24" width={14} height={14} stroke="currentColor" fill="none" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>),
  chevronDown: (<svg width={8} height={8} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={2} style={{ color: 'var(--dim)', flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>),
  attach: (<svg viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={1.6}><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>),
  trash: (<svg viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={1.6}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>),
  bulb: (<svg viewBox="0 0 24 24" width={11} height={11} stroke="currentColor" fill="none" strokeWidth={2}><path d="M9 18h6M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17H8v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z"/></svg>),
  download: (<svg viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>),
  share: (<svg viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={2}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>),
  info: (<svg viewBox="0 0 24 24" width={11} height={11} stroke="currentColor" fill="none" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>),
  copy: (<svg viewBox="0 0 24 24" width={11} height={11} stroke="currentColor" fill="none" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>),
  home: (<svg viewBox="0 0 24 24" width={13} height={13} stroke="currentColor" fill="none" strokeWidth={2}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>),
  plus: (<svg viewBox="0 0 24 24" width={13} height={13} stroke="currentColor" fill="none" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>),
  help: (<svg viewBox="0 0 24 24" width={13} height={13} stroke="currentColor" fill="none" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>),
  inbox: (<svg viewBox="0 0 24 24" width={13} height={13} stroke="currentColor" fill="none" strokeWidth={2}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>),
  tag: (<svg viewBox="0 0 24 24" width={11} height={11} stroke="currentColor" fill="none" strokeWidth={2}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>),
}

/* ─────────────────────────────────────────────────────────────────────────────
   PAGE COMPONENT
─────────────────────────────────────────────────────────────────────────────── */
export default function ChatsPage() {
  const scriptsLoadedRef = useRef(false)

  /* Mobile sidebar toggle — pure DOM, no wCall needed */
  const handleMobileMenuToggle = () => {
    const sb      = document.getElementById('sb')
    const overlay = document.getElementById('sbOverlay')
    const isOpen  = sb?.classList.contains('mobile-open')
    if (isOpen) {
      sb?.classList.remove('mobile-open')
      overlay?.classList.remove('show')
    } else {
      sb?.classList.add('mobile-open')
      overlay?.classList.add('show')
    }
  }

  const closeMobileSidebar = () => {
    document.getElementById('sb')?.classList.remove('mobile-open')
    document.getElementById('sbOverlay')?.classList.remove('show')
  }

  useEffect(() => {
    document.title = 'NEXUS AI - Roblox Dev Intelligence'
    document.documentElement.style.height   = '100%'
    document.documentElement.style.overflow = 'hidden'
    document.body.style.height   = '100%'
    document.body.style.overflow = 'hidden'

    if (!scriptsLoadedRef.current) {
      scriptsLoadedRef.current = true
      import('./system_prompt')
        .then((mod) => {
          const smod = mod as Record<string, unknown>
          const w    = window as unknown as Record<string, unknown>
          if (typeof smod.buildSysPrompt === 'function') w.buildSysPrompt = smod.buildSysPrompt
          else if (typeof smod.default === 'function')   w.buildSysPrompt = smod.default
          return import('./chats')
        })
        .then(() => { _flushPendingCalls() })
        .catch((err: unknown) => {
          console.error('[NEXUS] Module load error:', err)
          _chatsModuleLoaded = true
          _pendingCalls.length = 0
        })
    }

    return () => {
      document.documentElement.style.height   = ''
      document.documentElement.style.overflow = ''
      document.body.style.height   = ''
      document.body.style.overflow = ''
    }
  }, [])

  /* handlers */
  const handleClick = (fn: string, ...args: unknown[]) =>
    (): void => wCall(fn, ...args)

  const handleClickWithEvent = (fn: string, ...args: unknown[]) =>
    (e: React.MouseEvent<HTMLElement>): void => { e.stopPropagation(); wCall(fn, e, ...args) }

  const handleTabClick = (tab: string) =>
    (e: React.MouseEvent<HTMLButtonElement>): void => wCall('switchTab', tab, e.currentTarget)

  const handleImgErr = (e: React.SyntheticEvent<HTMLImageElement>): void => {
    e.currentTarget.style.display = 'none'
  }
  const handleLogoErr = (e: React.SyntheticEvent<HTMLImageElement>): void => {
    const p = e.currentTarget.parentElement
    if (p) p.style.background = 'linear-gradient(135deg,#00e5ff,#8800ff)'
    e.currentTarget.style.display = 'none'
  }
  const handleFileChange        = (e: React.ChangeEvent<HTMLInputElement>): void  => wCall('handleFile', e)
  const handlePlayTestDurChange = (e: React.ChangeEvent<HTMLInputElement>): void  => wCall('setPlayTestDur', e.target.value)
  const handleLangChange        = (e: React.ChangeEvent<HTMLSelectElement>): void => wCall('changeLang', e.target.value)
  const handleGuiThemeChange    = (e: React.ChangeEvent<HTMLSelectElement>): void => wCall('applyGuiTheme', e.target.value)

  /* GUI element types */
  const guiTypes: GuiTypeConfig[] = [
    { type: 'Frame',          label: 'Frame',  icon: <rect x="3" y="3" width="18" height="18" rx="2"/> },
    { type: 'TextLabel',      label: 'Label',  icon: <><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></> },
    { type: 'TextButton',     label: 'Tombol', icon: <rect x="2" y="7" width="20" height="10" rx="3"/> },
    { type: 'TextBox',        label: 'Input',  icon: <><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="12" x2="17" y2="12"/></> },
    { type: 'ImageLabel',     label: 'Gambar', icon: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></> },
    { type: 'ScrollingFrame', label: 'Scroll', icon: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></> },
  ]

  const guiThemeOptions: ThemeOption[] = [
    { value: 'nexus_ai', label: 'NEXUS AI' },
    { value: 'aurora',   label: 'Aurora'   },
    { value: 'candy',    label: 'Candy'    },
    { value: 'dark',     label: 'Dark'     },
    { value: 'default',  label: 'Default'  },
    { value: 'midnight', label: 'Midnight' },
    { value: 'studs',    label: 'Studs'    },
    { value: 'custom',   label: 'Custom'   },
  ]

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════════ */
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500&display=swap"/>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css"/>

      <Script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"                                           strategy="beforeInteractive"/>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"                 strategy="beforeInteractive"/>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/lua.min.js"             strategy="beforeInteractive"/>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"                       strategy="afterInteractive"/>

      {/* ── PAGE LOADER ── */}
      <div id="pageLoader">
        <div className="pl-logo">
          <img src="/images/nexusai.png" alt="N" onError={handleLogoErr}/>
        </div>
        <div className="pl-title">NEXUS AI</div>
        <div className="pl-bar-wrap"><div className="pl-bar" id="plBar"/></div>
        <div className="pl-txt" id="plTxt">Menginisialisasi...</div>
      </div>

      {/* ── MOBILE SIDEBAR OVERLAY ── */}
      <div id="sbOverlay" onClick={closeMobileSidebar}/>

      {/* ── MENTION DROPDOWN ── */}
      <div className="mention-dd" id="mentionDD">
        <div className="mention-hdr">
          <svg viewBox="0 0 24 24" width={10} height={10} stroke="currentColor" fill="none" strokeWidth={2}>
            <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/>
          </svg>
          <span id="mentionHdrTxt">Scripts &amp; Objek di Place</span>
        </div>
        <div id="mentionList"/>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          APP SHELL
      ════════════════════════════════════════════════════════════════════ */}
      <div id="app" className="hidden">

        {/* ═══ SIDEBAR ═══ */}
        <div id="sb">
          {/* Logo */}
          <div className="sb-head">
            <div className="sb-logo">
              <img src="/images/nexusai.png" alt="N" onError={handleLogoErr}/>
            </div>
            <div>
              <div className="sb-logo-text">NEXUS AI</div>
              <div className="sb-logo-sub">Roblox Dev</div>
            </div>
          </div>

          {/* User */}
          <div className="sb-user">
            <img
              className="sb-av" id="sbAv"
              src="/images/nexusai.png" alt=""
              onError={(e) => { e.currentTarget.style.opacity = '0.3' }}
              onClick={handleClick('openAvatarModal')}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="sb-un"   id="sbUn">-</div>
              <div className="sb-role" id="sbRole">Roblox Developer</div>
            </div>
            <button
              className="sb-gear" type="button"
              onClick={handleClick('openSettings')}
              aria-label="Pengaturan"
            >
              {Icon.settings}
            </button>
          </div>

          {/* Credits */}
          <div
            className="creds" id="credsEl"
            onClick={() => { window.location.href = '/payment' }}
            role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') window.location.href = '/payment' }}
          >
            <div>
              <div className="cred-l"    id="credLabel">Credits</div>
              <div className="cred-hint" id="credHint">Klik untuk beli lebih</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="cred-v" id="credDisp">30</div>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'rgba(255,214,0,.5)' }}>CR</div>
            </div>
          </div>

          {/* Nav buttons */}
          <div className="sb-btn-group">
            <button className="sb-nav-btn cyan"   type="button" onClick={() => { window.location.href = '/dashboard' }}>
              {Icon.home}<span id="dashLbl">Dashboard</span>
            </button>
            <button className="sb-nav-btn cyan"   type="button" onClick={handleClick('newChat')}>
              {Icon.plus}<span id="newChatLbl">Percakapan Baru</span>
            </button>
            <button className="sb-nav-btn yellow" type="button" onClick={() => { window.location.href = '/agent' }}>
              {Icon.help}<span id="helpBtnText">Butuh Bantuan?</span>
            </button>
            <button className="sb-nav-btn purple" type="button" onClick={() => { window.location.href = '/inbox' }}>
              {Icon.inbox}<span id="inboxBtnText">Inbox</span>
              <span className="inbox-badge" id="inboxBadge">0</span>
            </button>
          </div>

          {/* Project chip */}
          <div className="proj-chip" id="sbProjChip" style={{ display: 'none' }}>
            <span id="sbProjName">-</span>
          </div>

          <div className="sec-lbl" id="recentLbl">Riwayat Chat</div>
          <div className="convs" id="convList">
            <div className="conv-empty" id="noConvLbl">Belum ada percakapan</div>
          </div>

          <div className="sb-footer">
            Dibuat oleh <span style={{ color: 'var(--cyan)' }}>NEXUS STUDIO</span><br/>
            YouTube: <span style={{ color: 'rgba(0,229,255,.6)' }}>NEXUS STUDIO</span>
          </div>

          {/* Desktop collapse toggle */}
          <div
            className="collapse-sb"
            onClick={handleClick('toggleSidebar')}
            role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') wCall('toggleSidebar') }}
          >
            <svg id="collapseSbIcon" viewBox="0 0 24 24" width={10} height={10} stroke="currentColor" fill="none" strokeWidth={2}>
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </div>
        </div>
        {/* end #sb */}

        {/* ═══ CHAT PANEL ═══ */}
        <div id="chat">

          {/* Plugin banner */}
          <div className="plug-banner" id="plugBanner">
            {Icon.info}
            <span id="plugBannerTxt">Plugin belum terhubung —</span>
            <a
              onClick={handleClick('showInstall')} id="plugInstallLink"
              role="button" tabIndex={0} style={{ cursor: 'pointer' }}
              onKeyDown={(e) => { if (e.key === 'Enter') wCall('showInstall') }}
            >
              Cara connect
            </a>
            <a
              onClick={handleClick('retryStudio')} id="plugReconnectLink"
              role="button" tabIndex={0}
              style={{ marginLeft: 8, color: 'var(--green)', cursor: 'pointer' }}
              onKeyDown={(e) => { if (e.key === 'Enter') wCall('retryStudio') }}
            >
              Reconnect
            </a>
          </div>

          {/* Header */}
          <div className="chat-hdr">
            {/* Hamburger — mobile only (hidden via CSS on desktop) */}
            <button
              id="menuBtn"
              type="button"
              className="ib"
              onClick={handleMobileMenuToggle}
              aria-label="Buka menu"
              style={{ flexShrink: 0 }}
            >
              {Icon.menu}
            </button>

            <div className="chat-title-group">
              <div className="chat-title" id="chatTitle">NEXUS AI</div>
              <div className="proj-badge-hdr" id="hdrProjBadge" style={{ display: 'none' }}/>
              <span className="ver-badge beta" id="verBadge">BETA</span>
            </div>
            <div
              className="status-badge off" id="studioBadge"
              onClick={handleClick('retryStudio')}
              role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') wCall('retryStudio') }}
            >
              <div className="sdot pulse" id="studioDot"/>
              <span id="studioTxt">Studio: OFF</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="chat-tabs">
            <button className="tab-btn act" id="tabChat" type="button" onClick={handleTabClick('chat')}>
              {Icon.chat}<span id="tabChatLbl">Chat</span>
            </button>
            <button className="tab-btn" id="tabGui" type="button" onClick={handleTabClick('gui')}>
              {Icon.grid}<span id="tabGuiLbl">UI Editor</span>
            </button>
          </div>

          {/* ── TAB CHAT ── */}
          <div id="chatTab" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

            {/* Messages */}
            <div id="msgs">
              <div className="welcome" id="welcome">
                <div style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden', border: '2px solid rgba(0,229,255,.3)', flexShrink: 0 }}>
                  <img src="/images/nexusai.png" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" onError={handleLogoErr}/>
                </div>
                <div className="wt">NEXUS AI</div>
                <div className="ws" id="welcomeText">
                  AI Roblox cerdas — tulis Lua, debug script, buat GUI. Connect plugin untuk inject langsung ke Studio!
                </div>
                <div className="suggs" id="suggGrid"/>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════
                INPUT AREA — CLAUDE-STYLE
                Layout:
                  .inp-area
                    .attach-row      ← preview lampiran
                    .inp-box         ← rounded box (Claude-like)
                      #inp           ← textarea (font 14px, no border)
                      .inp-bar       ← baris bawah (no top border)
                        .inp-l       ← kiri: attach + trash + divider + model
                        btn-cancel   ← tersembunyi saat idle
                        btn-send     ← lingkaran gradient (kanan)
                    .model-dd        ← dropdown model
            ══════════════════════════════════════════════════ */}
            <div className="inp-area">
              <div className="attach-row" id="attachRow"/>

              <div className="inp-box" id="inpBox">
                {/* Textarea */}
                <textarea
                  id="inp"
                  placeholder="Tanya NEXUS AI tentang Roblox... (ketik @ untuk mention)"
                  rows={1}
                />

                {/* Bottom bar */}
                <div className="inp-bar">
                  {/* ── Kiri ── */}
                  <div className="inp-l">

                    {/* Attach button — label styled as .ib */}
                    <label
                      htmlFor="fi"
                      className="ib"
                      title="Lampirkan gambar / file"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          document.getElementById('fi')?.click()
                        }
                      }}
                    >
                      {Icon.attach}
                    </label>

                    {/* File input — truly offscreen */}
                    <input
                      type="file"
                      id="fi"
                      accept="image/*,.lua,.txt,.json,.js,.py,.html,.css"
                      onChange={handleFileChange}
                      multiple
                      tabIndex={-1}
                      aria-hidden="true"
                    />

                    {/* Clear chat */}
                    <button
                      className="ib" type="button"
                      onClick={handleClick('clearChat')}
                      title="Hapus chat"
                    >
                      {Icon.trash}
                    </button>

                    <div className="inp-divider"/>

                    {/* Model selector */}
                    <div
                      className="inp-model" id="inpModelBtn"
                      onClick={handleClickWithEvent('toggleMDD')}
                      role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') wCall('toggleMDD', e) }}
                    >
                      <img
                        id="inpMIcon" src="" alt=""
                        onError={handleImgErr}
                        style={{ width: 13, height: 13, borderRadius: 2, objectFit: 'contain', flexShrink: 0 }}
                      />
                      <span className="inp-model-name"  id="inpMName">Gemini 3.5 Flash</span>
                      <span className="inp-model-badge" id="inpMBadge" data-tier="fast">FAST</span>
                      {Icon.chevronDown}
                    </div>
                  </div>

                  {/* ── Kanan ── */}
                  <button
                    className="btn-cancel hidden" id="cancelBtn"
                    type="button"
                    onClick={handleClick('cancelGen')}
                    title="Batalkan"
                  >
                    {Icon.x}
                  </button>
                  <button
                    className="btn-send" id="sendBtn"
                    type="button"
                    onClick={handleClick('send')}
                    title="Kirim pesan"
                  >
                    {Icon.send}
                  </button>
                </div>
              </div>

              {/* Model dropdown */}
              <div className="model-dd" id="mDD"/>
            </div>
          </div>
          {/* end #chatTab */}

          {/* ── TAB GUI EDITOR ── */}
          <div id="guiTab">
            <div className="gui-toolbar">
              <span className="gui-add-label" id="guiAddLabel">Tambah:</span>
              {guiTypes.map(({ type, label, icon }) => (
                <button key={type} className="gui-btn" type="button" onClick={handleClick('addEl', type)}>
                  <svg viewBox="0 0 24 24" width={11} height={11} stroke="currentColor" fill="none" strokeWidth={1.8}>{icon}</svg>
                  {label}
                </button>
              ))}

              <div className="gui-right">
                <div
                  className="inp-model" id="guiModelBtn"
                  onClick={handleClickWithEvent('toggleGuiMDD')}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') wCall('toggleGuiMDD', e) }}
                  style={{ maxWidth: 150 }}
                >
                  <img id="guiMIcon" src="" alt="" onError={handleImgErr}
                    style={{ width: 13, height: 13, borderRadius: 2, flexShrink: 0 }}/>
                  <span className="inp-model-name"  id="guiMName">Gemini 3.5 Flash</span>
                  <span className="inp-model-badge" id="guiMBadge" data-tier="fast">FAST</span>
                  {Icon.chevronDown}
                </div>
                <div className="model-dd" id="guiMDD"/>

                <button className="gui-ai-btn" type="button" onClick={handleClick('openGuiAIChat')}>
                  {Icon.bulb}<span id="guiAiBuildLbl">AI Build</span>
                </button>
                <button className="gui-btn" type="button" onClick={handleClick('clearCanvas')}>
                  <svg viewBox="0 0 24 24" width={11} height={11} stroke="currentColor" fill="none" strokeWidth={1.8}>
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                  </svg>
                  <span id="guiClearLbl">Hapus</span>
                </button>
                <button className="gui-gen-btn" type="button" onClick={handleClick('generateGuiCode')}>
                  {Icon.code}<span id="guiExportLbl">Export</span>
                </button>
                <button
                  className="gui-gen-btn" type="button"
                  onClick={handleClick('sendGuiToPlace')}
                  style={{ background: 'linear-gradient(135deg,var(--green),var(--cyan))' }}
                >
                  {Icon.send}<span id="guiToPlaceText">Kirim ke Place</span>
                </button>
              </div>
            </div>

            <div className="gui-main">
              <div className="gui-layers" id="guiLayers">
                <div className="gui-layer-title" id="guiLayerTitle">Layer</div>
                <div id="guiLayerList"/>
              </div>
              <div className="gui-canvas">
                <div className="gui-canvas-inner" id="guiCanvasInner">
                  <div className="gui-empty-hint" id="guiEmpty">
                    <svg viewBox="0 0 24 24" width={30} height={30} stroke="currentColor" fill="none" strokeWidth={1.5}>
                      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                    </svg>
                    <span id="guiEmptyText">Tambah elemen atau klik AI Build</span>
                  </div>
                </div>
                <div className="gui-loading" id="guiLoading">
                  <div style={{ width: 20, height: 20, border: '2px solid rgba(0,229,255,.2)', borderTopColor: 'var(--cyan)', borderRadius: '50%', animation: 'spin .7s linear infinite' }}/>
                  <span id="guiLoadingText">AI sedang membangun UI...</span>
                </div>
              </div>
              <div className="gui-props" id="guiProps">
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)', textAlign: 'center', padding: '20px 0' }} id="guiPropsEmpty">
                  Pilih elemen
                </div>
              </div>
            </div>
          </div>
          {/* end #guiTab */}

        </div>
        {/* end #chat */}
      </div>
      {/* end #app */}

      {/* ════════════════════════════════════════════════════════════════════
          MODALS
      ════════════════════════════════════════════════════════════════════ */}

      {/* Avatar */}
      <div className="ov" id="avatarModal">
        <div className="modal" style={{ width: 340, textAlign: 'center', padding: 26 }}>
          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 13, color: 'var(--cyan)', marginBottom: 14 }} id="avatarModalName">@-</div>
          <img
            id="avatarModalImg" src="" alt=""
            style={{ width: 110, height: 110, borderRadius: '50%', border: '3px solid var(--cyan)', objectFit: 'cover', margin: '0 auto 12px', display: 'block' }}
            onError={(e) => { e.currentTarget.src = '/images/nexusai.png' }}
          />
          <div style={{ fontSize: 'var(--fs-md)', color: 'var(--dim)', marginBottom: 3 }} id="avatarModalRole">Developer</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }} id="avatarModalId">Roblox ID: -</div>
          <div className="modal-footer" style={{ justifyContent: 'center', marginTop: 14 }}>
            <button className="btn-modal primary" type="button" onClick={handleClick('closeModal', 'avatarModal')} id="avatarCloseBtn">TUTUP</button>
          </div>
        </div>
      </div>

      {/* Install */}
      <div className="ov" id="installModal">
        <div className="modal">
          <div className="modal-t">{Icon.download}<span id="installTitle">Cara Install Plugin NEXUS AI</span></div>
          <div className="modal-b">
            {[1,2,3,4,5].map((n) => (
              <div key={n} className="install-step">
                <div className="install-num">{n}</div>
                <div className="install-txt" id={`installStep${n}`}>Langkah {n}</div>
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button className="btn-modal primary" type="button" onClick={handleClick('closeModal', 'installModal')} id="installCloseBtn">MENGERTI</button>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="ov" id="settingsModal">
        <div className="modal" style={{ width: 520 }}>
          <div className="modal-t">{Icon.settings}<span id="settingsTitle">Pengaturan</span></div>

          <div className="settings-section">
            <div className="settings-title" id="settingsAccountTitle">Akun</div>
            <div className="settings-row">
              <span style={{ color: 'white', fontWeight: 600 }} id="settingsUsername">@-</span>
              <span id="settingsBadge"/>
            </div>
            <div className="settings-row">
              <span id="settingsCreditsLabel">Credits</span>
              <span id="settingsCredits" style={{ color: 'var(--yellow)', fontWeight: 700 }}>-</span>
            </div>
            <div className="settings-row">
              <span id="settingsPlanLabel">Plan</span>
              <span id="settingsPlan" style={{ color: 'var(--green)' }}>Free</span>
            </div>
            <div className="settings-row">
              <span id="settingsRobloxIdLabel">Roblox ID</span>
              <span id="settingsRobloxId" style={{ color: 'var(--dim)', fontSize: 'var(--fs-sm)' }}>-</span>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-title" id="dailyCreditsTitle">Daily Credits</div>
            <div className="settings-row"><span id="freePlanLabel">Free Plan</span><span style={{ color: 'var(--green)' }}>+2 CR / hari</span></div>
            <div className="settings-row"><span id="proPlanLabel">Pro Plan</span><span style={{ color: 'var(--cyan)' }}>+25 CR / hari</span></div>
            <div className="settings-row">
              <span id="lastClaimInfo" style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }}/>
              <button className="settings-btn" type="button" id="claimDailyBtn" onClick={handleClick('claimDaily')}>Klaim Harian</button>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-title" id="playTestTitle">Auto Play Test</div>
            <div className="settings-row">
              <div>
                <div id="playTestLabel">Jalankan play_test setelah inject</div>
                <div className="settings-hint" id="playTestHint">Nonaktifkan jika laptop crash saat play_test</div>
              </div>
              <button className="toggle-sw on" id="playTestToggle" type="button" onClick={handleClick('togglePlayTest')}/>
            </div>
            <div className="settings-row">
              <span id="playTestDurLabel">Durasi (detik)</span>
              <input
                type="number" id="playTestDurInput" className="settings-select"
                style={{ width: 70 }} min={5} max={120} defaultValue={15}
                onChange={handlePlayTestDurChange}
              />
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-title" id="langTitle">Bahasa</div>
            <div className="settings-row">
              <span id="langLabel">Bahasa Interface &amp; AI</span>
              <select className="settings-select" id="langSelector" onChange={handleLangChange} defaultValue="id">
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-title" id="reportTitle">Laporkan Masalah</div>
            <textarea className="report-ta" id="reportTa" placeholder="Deskripsikan masalahnya..."/>
            <div id="cf-turnstile-wrap" style={{ marginTop: 8, minHeight: 65, display: 'none' }}>
              <div id="cf-turnstile-report" style={{ transform: 'scale(0.85)', transformOrigin: 'left' }}/>
            </div>
            <input type="hidden" id="_tsToken" value=""/>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="settings-btn" type="button" onClick={handleClick('sendReport')} id="reportBtn">Kirim Report</button>
              <span id="reportStatus" style={{ fontSize: 'var(--fs-sm)', color: 'var(--green)' }}/>
            </div>
          </div>

          <div className="settings-section" id="adminSection" style={{ display: 'none' }}>
            <div className="settings-title">Panel Admin</div>
            <div style={{ marginTop: 6 }}>
              <a href="/admin-panel" className="settings-btn" style={{ textDecoration: 'none' }}>Buka Panel Admin</a>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-title" id="redeemTitle">Redeem Code</div>
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }} id="redeemHint">Dapatkan code di Discord NEXUS STUDIO</div>
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <input
                  type="text" id="redeemInput" className="settings-select"
                  style={{ flex: 1, padding: '0 10px', height: 'var(--h-sm)' }}
                  placeholder="Masukkan kode..."
                />
                <button className="settings-btn" type="button" onClick={handleClick('redeemCode')} id="redeemBtn">Redeem</button>
              </div>
              <span id="redeemStatus" style={{ fontSize: 'var(--fs-sm)', color: 'var(--green)' }}/>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-title" id="downloadTitle">Download Plugin</div>
            <div className="settings-row" style={{ flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }} id="downloadHint">Install NEXUS AI Plugin di Roblox Studio</div>
              <button
                className="settings-btn" type="button" id="downloadPluginBtn"
                onClick={() => window.open('https://create.roblox.com/store/asset/91870814099475/NEXUS-AI', '_blank')}
              >
                Download dari Creator Store
              </button>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-title" id="accountTitle">Akun</div>
            <div className="settings-row">
              <span id="logoutLabel">Logout</span>
              <button className="settings-btn danger" type="button" onClick={handleClick('logout')}>Logout</button>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn-modal primary" type="button" onClick={handleClick('closeModal', 'settingsModal')} id="settingsCloseBtn">TUTUP</button>
          </div>
        </div>
      </div>

      {/* Export GUI Code */}
      <div className="ov" id="guiCodeModal">
        <div className="modal" style={{ width: 640 }}>
          <div className="modal-t">{Icon.code}<span id="guiCodeTitle">Script GUI yang Dihasilkan</span></div>
          <div className="modal-b">
            <pre
              id="guiCodeOutput"
              style={{ maxHeight: 380, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 10.5, color: 'var(--text)', background: 'rgba(0,0,0,.4)', padding: 12, borderRadius: 6, border: '1px solid var(--b)' }}
            />
          </div>
          <div className="modal-footer">
            <button className="btn-modal primary"   type="button" onClick={handleClick('copyGuiCode')}               id="guiCodeCopyBtn">Salin</button>
            <button className="btn-modal secondary" type="button" onClick={handleClick('downloadGuiCode')}           id="guiCodeDlBtn">Download .lua</button>
            <button className="btn-modal secondary" type="button" onClick={handleClick('closeModal', 'guiCodeModal')} id="guiCodeCloseBtn">Tutup</button>
          </div>
        </div>
      </div>

      {/* AI GUI Builder */}
      <div className="ov" id="guiAIChatModal">
        <div className="modal" style={{ width: 500 }}>
          <div className="modal-t">{Icon.bulb}<span id="guiAiTitle">AI UI Builder</span></div>
          <div className="modal-b" style={{ marginBottom: 8 }}>
            <p style={{ marginBottom: 8, fontSize: 'var(--fs-md)' }} id="guiAiDesc">Deskripsikan UI yang kamu inginkan:</p>
            <select
              id="guiAiThemeSelect" className="settings-select"
              style={{ width: '100%', marginBottom: 8, height: 'var(--h-sm)' }}
              defaultValue="nexus_ai"
              onChange={handleGuiThemeChange}
            >
              {guiThemeOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
            <textarea
              id="guiAIPrompt"
              style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--b)', borderRadius: 6, padding: 10, color: 'white', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, outline: 'none', resize: 'vertical', minHeight: 90 }}
              placeholder="contoh: Shop GUI 3 item, scroll list, tombol beli, animasi smooth..."
            />
          </div>
          <div className="modal-footer">
            <button className="btn-modal primary"   type="button" onClick={handleClick('generateGuiFromAI')}          id="guiAiBuildBtn">Bangun dengan AI</button>
            <button className="btn-modal secondary" type="button" onClick={handleClick('closeModal', 'guiAIChatModal')} id="guiAiCancelBtn">Batal</button>
          </div>
        </div>
      </div>

      {/* Code Preview */}
      <div className="ov" id="codePreviewModal">
        <div className="modal" style={{ width: 700 }}>
          <div className="modal-t">
            {Icon.code}
            <span id="codePreviewTitle">Preview Script</span>
            <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-2xs)', color: 'var(--dim)' }} id="codePreviewPath"/>
          </div>
          <div className="modal-b" style={{ margin: 0 }}>
            <div className="code-block-wrap" style={{ margin: 0 }}>
              <div className="code-lang-bar">
                <span>Lua</span>
                <div className="code-btns">
                  <button className="cbtn" type="button" onClick={handleClick('copyPreviewCode')}>
                    {Icon.copy} Salin
                  </button>
                </div>
              </div>
              <pre style={{ maxHeight: 440, overflowY: 'auto', margin: 0 }}>
                <code id="codePreviewCode" className="language-lua" style={{ fontSize: 11, lineHeight: 1.5, padding: 14, display: 'block' }}/>
              </pre>
            </div>
          </div>
          <div className="modal-footer" style={{ marginTop: 12 }}>
            <button className="btn-modal secondary" type="button" onClick={handleClick('closeModal', 'codePreviewModal')}>Tutup</button>
          </div>
        </div>
      </div>

      {/* Share */}
      <div className="ov" id="shareModal">
        <div className="modal" style={{ width: 520 }}>
          <div className="modal-t">{Icon.share}<span id="shareModalTitle">Bagikan Chat</span></div>
          <div className="modal-b" style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 'var(--fs-md)', color: 'var(--dim)', marginBottom: 6 }} id="shareModalDesc">Salin teks percakapan ini:</p>
            <textarea className="share-modal-ta" id="shareModalTa" readOnly/>
          </div>
          <div className="modal-footer">
            <button className="btn-modal primary"   type="button" onClick={handleClick('copyShareText')}           id="shareModalCopyBtn">Salin Teks</button>
            <button className="btn-modal secondary" type="button" onClick={handleClick('closeModal', 'shareModal')} id="shareModalCloseBtn">Tutup</button>
          </div>
        </div>
      </div>

    </>
  )
}