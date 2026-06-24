'use client'

import React, { useEffect, useRef } from 'react'
import Script from 'next/script'

/* ─────────────────────────────────────────────────────────────────────────────
   CSS — NEXUS AI · v14
   Changes in this version:
   1. Storage endpoint: https://fine-setter-131.convex.site/storage
   2. Responsive overhaul — phone (≤768), small phone (≤480), tiny (≤360),
      tablet portrait (769–1024), tablet landscape, landscape phone
   3. Sidebar overlay: smoother cubic-bezier slide, backdrop blur on mobile
   4. Input bar: larger tap targets on all touch breakpoints (min 44 px)
   5. Message bubbles: better max-width scaling on ultra-narrow viewports
   6. Modal: max-height + overflow-y so tall modals stay scrollable on phone
   7. Welcome grid: single-column on ≤480, 2-col on 481–768, original above
   8. Code preview modal: 100% wide on mobile, scrollable pre block
   9. Steps card: always visible; cancel button always reachable on mobile
  10. Safe-area insets applied everywhere (notch / home-bar devices)
  11. coarse-pointer safety net expanded to ALL interactive controls
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
  --r:      8px;
  --r-s:    6px;
  --h-xs:   22px;
  --h-sm:   28px;
  --h-md:   32px;
  --h-lg:   36px;
  --h-xl:   40px;
  --h-inp:  44px;
  --sb-w:   252px;
  --fs-2xs: 8px;
  --fs-xs:  9px;
  --fs-sm:  10px;
  --fs-md:  11px;
  --fs-base:13px;
  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left:   env(safe-area-inset-left, 0px);
  --safe-right:  env(safe-area-inset-right, 0px);
}

html {
  height: 100%; height: 100dvh;
  font-family: 'JetBrains Mono', monospace;
  background: var(--bg); color: var(--text);
  font-size: 13px; overflow: hidden;
  overscroll-behavior: none;
}
body {
  height: 100%; height: 100dvh;
  overflow: hidden; min-height: 0;
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
}
body::before {
  content: ''; position: fixed; inset: 0;
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
  font-family: 'Orbitron', sans-serif; font-size: 22px; font-weight: 900;
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
  display: grid; grid-template-columns: var(--sb-w) 1fr;
  height: 100vh; height: 100dvh;
  min-height: 0; overflow: hidden;
  position: relative; z-index: 1;
  transition: grid-template-columns .22s ease;
}
#app.sb-hidden { grid-template-columns: 0 1fr; }
.hidden { display: none !important; }

#sbOverlay {
  display: none; position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.76); z-index: 90;
  opacity: 0; transition: opacity .28s ease;
  will-change: opacity;
  -webkit-tap-highlight-color: transparent;
}
#sbOverlay.show { display: block; opacity: 1; }


/* ══════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════ */
#sb {
  display: flex; flex-direction: column;
  background: var(--bg2); border-right: 1px solid var(--b);
  overflow: hidden; overflow-y: auto;
  position: relative; z-index: 5;
  width: var(--sb-w); min-width: 0; min-height: 0;
  -webkit-overflow-scrolling: touch;
}

.sb-head {
  padding: 11px 14px 10px; border-bottom: 1px solid var(--b);
  display: flex; align-items: center; gap: 9px;
  flex-shrink: 0; height: 52px;
}
.sb-logo { width: 30px; height: 30px; border-radius: 7px; overflow: hidden; flex-shrink: 0; }
.sb-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sb-brand { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.sb-logo-text {
  font-family: 'Orbitron', sans-serif; font-weight: 900; font-size: 12px; line-height: 1.1;
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  display: flex; align-items: center; gap: 6px;
}
.sb-beta-badge {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0 5px; height: 14px; border-radius: 6px;
  font-family: 'Orbitron', sans-serif; font-size: 6.5px; font-weight: 700;
  letter-spacing: .5px; border: 1px solid rgba(255,214,0,.4);
  background: rgba(255,214,0,.08); color: var(--yellow);
  flex-shrink: 0; white-space: nowrap; line-height: 1;
  vertical-align: middle;
}
.sb-logo-sub { font-size: var(--fs-2xs); color: var(--dim); line-height: 1; }

.sb-user {
  padding: 8px 12px; display: flex; align-items: center; gap: 8px;
  border-bottom: 1px solid var(--b); flex-shrink: 0; height: 52px;
}
.sb-av {
  width: 36px; height: 36px; border-radius: 50%;
  border: 1.5px solid var(--cyan2); object-fit: cover;
  background: var(--bg3); flex-shrink: 0;
  cursor: pointer; transition: .2s;
  -webkit-tap-highlight-color: transparent;
}
.sb-av:hover { border-color: var(--cyan); transform: scale(1.08); }
.sb-un   { font-size: var(--fs-md); color: white; font-weight: 500; line-height: 1.3; }
.sb-role { font-size: var(--fs-2xs); color: var(--dim); line-height: 1; }
.sb-gear {
  margin-left: auto; flex-shrink: 0;
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: 1px solid transparent; border-radius: var(--r-s);
  color: var(--dim); cursor: pointer; transition: .15s;
  -webkit-tap-highlight-color: transparent;
}
.sb-gear:hover { color: var(--cyan); border-color: var(--b); background: var(--hover); }
.sb-gear svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2; }

/* Project chip in sidebar */
.sb-proj-chip {
  display: none; margin: 0 12px 4px;
  align-items: center; gap: 5px;
  padding: 4px 9px; border-radius: 6px;
  background: rgba(255,170,50,.06); border: 1px solid rgba(255,170,50,.18);
  font-size: var(--fs-2xs); color: rgba(255,170,50,.8);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sb-proj-chip.show { display: flex; }
.sb-proj-chip-dot { width: 5px; height: 5px; border-radius: 50%; background: rgba(255,170,50,.7); flex-shrink: 0; }

.creds {
  margin: 8px 12px 2px; padding: 8px 12px; border-radius: var(--r);
  background: linear-gradient(135deg, rgba(255,214,0,.06), rgba(255,119,0,.06));
  border: 1px solid rgba(255,214,0,.18);
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0; cursor: pointer; transition: .15s; height: 52px;
  -webkit-tap-highlight-color: transparent;
}
.creds:hover { border-color: rgba(255,214,0,.35); }
.creds.low   { border-color: rgba(255,45,107,.4); background: rgba(255,45,107,.06); }
.cred-v   { font-family: 'Orbitron', sans-serif; font-size: 20px; color: var(--yellow); font-weight: 700; line-height: 1; }
.creds.low .cred-v { color: var(--pink); }
.cred-l   { font-size: var(--fs-2xs); color: rgba(255,214,0,.6); text-transform: uppercase; letter-spacing: 1.5px; }
.cred-hint{ font-size: var(--fs-2xs); color: rgba(255,214,0,.45); margin-top: 2px; }

.sb-btn-group { display: flex; flex-direction: column; gap: 3px; padding: 8px 12px 4px; flex-shrink: 0; }
.sb-nav-btn {
  display: flex; align-items: center; gap: 8px;
  width: 100%; height: 40px; padding: 0 12px;
  border-radius: var(--r-s);
  font-family: 'JetBrains Mono', monospace; font-size: var(--fs-sm);
  cursor: pointer; border: 1px solid var(--b);
  transition: background .15s, border-color .15s, color .15s;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: var(--card); color: var(--text); flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}
.sb-nav-btn svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.sb-nav-btn:hover       { border-color: var(--cyan2); color: var(--cyan); background: var(--hover); }
.sb-nav-btn:active      { opacity: .75; }
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
.sec-lbl { padding: 8px 14px 3px; font-size: var(--fs-2xs); color: var(--dim); text-transform: uppercase; letter-spacing: 2px; flex-shrink: 0; }
.convs { flex: 1; overflow-y: auto; padding: 3px 8px; min-height: 0; -webkit-overflow-scrolling: touch; }
.ci {
  padding: 8px 9px; border-radius: var(--r-s);
  cursor: pointer; display: flex; align-items: center; gap: 6px;
  transition: background .1s; min-height: 40px;
  -webkit-tap-highlight-color: transparent;
}
.ci:hover  { background: var(--hover); }
.ci.act    { background: rgba(0,229,255,.06); border-left: 2px solid var(--cyan); padding-left: 7px; }
.ci-title  { font-size: var(--fs-sm); color: var(--text); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ci-time   { font-size: var(--fs-2xs); color: var(--dim); flex-shrink: 0; }
.ci-del {
  font-size: var(--fs-sm); color: var(--dim); opacity: 0; padding: 4px 7px;
  cursor: pointer; background: none; border: none; border-radius: 3px;
  min-width: 28px; min-height: 28px; display: flex; align-items: center; justify-content: center;
}
.ci:hover .ci-del { opacity: 1; }
.ci-del:hover     { color: var(--pink); background: rgba(255,45,107,.1); }
.conv-empty { padding: 20px 14px; text-align: center; color: var(--dim); font-size: var(--fs-md); line-height: 1.7; }

.sb-footer {
  padding: 7px 12px; font-size: var(--fs-2xs); color: var(--dim);
  text-align: center; border-top: 1px solid var(--b); flex-shrink: 0; line-height: 1.9;
  padding-bottom: calc(7px + var(--safe-bottom));
}
.collapse-sb {
  position: absolute; right: -18px; top: 50%; transform: translateY(-50%);
  width: 18px; height: 40px;
  background: var(--bg2); border: 1px solid var(--b); border-left: none;
  border-radius: 0 6px 6px 0;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: var(--dim); z-index: 10; transition: color .15s;
}
.collapse-sb:hover { color: var(--cyan); }
.collapse-sb svg { width: 10px; height: 10px; stroke: currentColor; fill: none; stroke-width: 2; }


/* ══════════════════════════════════════════════
   CHAT PANEL
══════════════════════════════════════════════ */
#chat { display: flex; flex-direction: column; overflow: hidden; position: relative; min-height: 0; min-width: 0; }

.plug-banner {
  padding: 0 14px; flex-shrink: 0;
  background: rgba(255,45,107,.08); border-bottom: 1px solid rgba(255,45,107,.2);
  font-size: var(--fs-xs); color: var(--pink);
  display: flex; align-items: center; gap: 7px; height: 30px;
  padding-left: calc(14px + var(--safe-left));
  padding-right: calc(14px + var(--safe-right));
}
.plug-banner svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
.plug-banner a   { color: var(--cyan); cursor: pointer; text-decoration: none; white-space: nowrap; }
.plug-banner.connected { background: rgba(0,255,170,.05); border-color: rgba(0,255,170,.2); color: var(--green); }


/* ══════════════════════════════════════════════
   HEADER
══════════════════════════════════════════════ */
.chat-hdr {
  padding: 0 12px 0 14px; border-bottom: 1px solid var(--b); background: var(--bg2);
  display: flex; align-items: center; gap: 8px;
  flex-shrink: 0; height: 52px; min-width: 0;
  padding-left: calc(14px + var(--safe-left));
  padding-right: calc(12px + var(--safe-right));
}
#menuBtn { display: none; }
.chat-title-group {
  display: flex; flex-direction: column; justify-content: center;
  flex: 1 1 0; min-width: 0; overflow: hidden; gap: 2px;
}
.chat-title-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.chat-title {
  font-family: 'Orbitron', sans-serif; font-size: 12px; font-weight: 700;
  color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex-shrink: 1; min-width: 0; line-height: 1;
}
.proj-name-pill {
  display: none; align-items: center; gap: 4px;
  font-size: var(--fs-2xs); color: rgba(255,170,50,.8);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 200px; line-height: 1;
}
.proj-name-pill.visible { display: flex; }
.proj-name-dot { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,170,50,.7); flex-shrink: 0; }

.status-badge {
  display: flex; align-items: center; gap: 4px; padding: 0 8px;
  border-radius: 20px; border: 1px solid; height: 24px;
  font-size: var(--fs-2xs); cursor: pointer; flex-shrink: 0; transition: .2s;
  white-space: nowrap; max-width: 120px; overflow: hidden;
  -webkit-tap-highlight-color: transparent;
}
.status-badge.off { border-color: rgba(255,45,107,.3); color: var(--pink); background: rgba(255,45,107,.06); }
.status-badge.on  { border-color: rgba(0,255,170,.3);  color: var(--green); background: rgba(0,255,170,.06); }
.sdot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.sdot.pulse { animation: pd 1.8s infinite; }
@keyframes pd { 0%,100%{opacity:1} 50%{opacity:.25} }


/* ══════════════════════════════════════════════
   MESSAGES
══════════════════════════════════════════════ */
#msgs {
  flex: 1; overflow-y: auto; padding: 16px 16px 8px;
  display: flex; flex-direction: column; gap: 10px; min-height: 0;
  -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
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
  -webkit-tap-highlight-color: transparent;
}
.sugg:hover { border-color: var(--cyan2); background: var(--hover); color: white; }
.sugg:active { opacity: .75; }
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
.msg-img { max-width: 160px; max-height: 130px; border-radius: 6px; object-fit: cover; border: 1px solid var(--b); cursor: pointer; transition: .15s; }
.msg-img:hover { border-color: var(--cyan); transform: scale(1.02); }

.code-block-wrap   { position: relative; margin: 8px 0; border-radius: 7px; overflow: hidden; border: 1px solid rgba(0,229,255,.1); }
.code-lang-bar     { display: flex; align-items: center; justify-content: space-between; padding: 4px 10px; background: rgba(0,229,255,.06); border-bottom: 1px solid rgba(0,229,255,.1); font-size: var(--fs-2xs); color: var(--cyan); height: 28px; }
.code-block-wrap pre { margin: 0; overflow-x: auto; }
.code-block-wrap pre code.hljs { font-size: 11px; line-height: 1.55; padding: 12px 14px; border-radius: 0; border: none; }
.code-btns { display: flex; gap: 4px; align-items: center; }
.cbtn {
  background: rgba(10,11,34,.9); border: 1px solid rgba(0,229,255,.25); border-radius: 5px;
  color: var(--cyan); font-size: var(--fs-2xs); padding: 0 8px; cursor: pointer;
  display: flex; align-items: center; gap: 3px; transition: .12s; height: var(--h-xs);
  min-height: 28px;
  -webkit-tap-highlight-color: transparent;
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
.bubble table { width: 100%; border-collapse: collapse; margin: 7px 0; font-size: 11px; overflow-x: auto; display: block; }
.bubble th, .bubble td { padding: 5px 9px; border: 1px solid var(--b); white-space: nowrap; }
.bubble th  { background: rgba(0,229,255,.06); color: var(--cyan); }

.msg-acts { display: flex; gap: 2px; padding: 2px; flex-wrap: wrap; }
.mab {
  font-size: var(--fs-2xs); color: var(--dim); background: none; border: 1px solid transparent;
  cursor: pointer; padding: 0 6px; border-radius: 4px; transition: .12s;
  display: flex; align-items: center; gap: 3px;
  font-family: 'JetBrains Mono', monospace;
  height: 28px; min-width: 28px;
  -webkit-tap-highlight-color: transparent;
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
  width: 20px; height: 20px; background: var(--pink); border: none; border-radius: 50%;
  color: white; font-size: var(--fs-2xs); cursor: pointer;
  display: flex; align-items: center; justify-content: center; z-index: 2;
}


/* ══════════════════════════════════════════════
   INPUT AREA
══════════════════════════════════════════════ */
.inp-area {
  padding: 10px 14px 14px;
  border-top: 1px solid var(--b);
  background: var(--bg2);
  flex-shrink: 0; position: relative; z-index: 2;
  padding-bottom: calc(14px + var(--safe-bottom));
  padding-left: calc(14px + var(--safe-left));
  padding-right: calc(14px + var(--safe-right));
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
  width: 100%; background: transparent; border: none; outline: none;
  color: rgba(255,255,255,.92);
  font-family: 'JetBrains Mono', monospace; font-size: 14px;
  padding: 14px 16px 6px; resize: none;
  min-height: 52px; max-height: 180px; line-height: 1.65;
  display: block; scrollbar-width: thin; scrollbar-color: var(--b) transparent;
}
#inp::placeholder { color: rgba(58,74,122,.75); font-size: 13px; }

.inp-bar {
  display: flex; align-items: center;
  padding: 6px 10px 10px; gap: 6px;
}
.inp-l {
  display: flex; align-items: center;
  gap: 4px; flex: 1; min-width: 0; overflow: hidden;
}

/* Universal icon button — works for <button> AND <label> */
.ib {
  width: 32px; height: 32px; min-width: 32px;
  display: inline-flex !important;
  align-items: center; justify-content: center;
  flex-shrink: 0; vertical-align: middle;
  border: none; border-radius: 8px;
  background: transparent; color: rgba(58,74,122,.9);
  cursor: pointer; transition: color .14s, background .14s;
  padding: 0; line-height: 1; box-sizing: border-box;
  user-select: none; outline: none;
  -webkit-tap-highlight-color: transparent;
  position: relative;
  font-size: 0;
  text-align: center;
}
.ib:hover  { color: var(--text); background: rgba(0,229,255,.07); }
.ib:active { background: rgba(0,229,255,.12); opacity: .75; }
.ib svg {
  width: 16px; height: 16px;
  stroke: currentColor; fill: none; stroke-width: 1.6;
  flex-shrink: 0; display: block; pointer-events: none;
}

/* File input — truly off-screen */
#fi {
  position: fixed !important; top: -9999px !important; left: -9999px !important;
  width: 1px !important; height: 1px !important; opacity: 0 !important;
  overflow: hidden !important; pointer-events: none !important; visibility: hidden !important;
}

.inp-divider { width: 1px; height: 16px; background: rgba(0,229,255,.1); flex-shrink: 0; border-radius: 1px; margin: 0 2px; }

/* Model selector pill */
.inp-model {
  display: flex; align-items: center; gap: 5px;
  height: 28px; padding: 0 8px; border-radius: 8px;
  background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06);
  cursor: pointer; transition: .14s;
  font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--dim);
  max-width: clamp(100px, 170px, 28vw); min-width: 0; overflow: hidden; flex-shrink: 1;
  -webkit-tap-highlight-color: transparent;
}
.inp-model:hover { border-color: var(--b); color: var(--text); background: rgba(0,229,255,.04); }
.inp-model img   { width: 13px; height: 13px; border-radius: 2px; object-fit: contain; flex-shrink: 0; }
.inp-model-name  { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; font-size: 10px; min-width: 0; }
.inp-model-badge {
  font-size: 7.5px; font-weight: 700; flex-shrink: 0;
  padding: 1px 4px; border-radius: 3px; border: 1px solid;
  letter-spacing: .3px;
}
.inp-model-badge[data-tier="fast"]  { color: var(--cyan);   border-color: rgba(0,229,255,.3);   background: rgba(0,229,255,.07); }
.inp-model-badge[data-tier="pro"]   { color: #cc55ff;       border-color: rgba(136,0,255,.35);  background: rgba(136,0,255,.07); }
.inp-model-badge[data-tier="think"] { color: var(--yellow); border-color: rgba(255,214,0,.3);   background: rgba(255,214,0,.06); }
.inp-model-badge[data-tier="free"]  { color: var(--green);  border-color: rgba(0,255,170,.3);   background: rgba(0,255,170,.06); }

/* Send / Cancel buttons */
.btn-send {
  width: 36px; height: 36px; border-radius: 50%; border: none;
  background: linear-gradient(135deg, var(--cyan), var(--purple));
  color: white;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; transition: opacity .18s, transform .14s; flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}
.btn-send:hover  { opacity: .85; transform: scale(1.07); }
.btn-send:active { transform: scale(.94); opacity: 1; }
.btn-send svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2.2; }
.btn-cancel {
  width: 32px; height: 32px; border-radius: 50%;
  border: 1px solid rgba(255,45,107,.3); background: rgba(255,45,107,.08);
  color: var(--pink);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; transition: .14s; flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}
.btn-cancel:hover { background: rgba(255,45,107,.18); }
.btn-cancel svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; }


/* ══════════════════════════════════════════════
   MODEL DROPDOWN
══════════════════════════════════════════════ */
.model-dd {
  position: fixed; background: var(--bg3);
  border: 1px solid rgba(0,229,255,.18); border-radius: 12px;
  z-index: 9000; display: none;
  box-shadow: 0 20px 60px rgba(0,0,0,.95), 0 0 0 1px rgba(0,229,255,.04);
  max-height: min(400px, 60vh); overflow-y: auto; min-width: 280px;
  -webkit-overflow-scrolling: touch; padding: 6px;
}
.model-dd::-webkit-scrollbar { width: 3px; }
.model-dd::-webkit-scrollbar-thumb { background: var(--b); border-radius: 2px; }
.model-dd.open { display: block; }

.mg {
  padding: 8px 10px 4px; margin-top: 2px;
  font-size: 7.5px; font-weight: 700; letter-spacing: 2px;
  color: var(--dim); text-transform: uppercase;
  display: flex; align-items: center; gap: 6px;
}
.mg::after { content: ''; flex: 1; height: 1px; background: var(--b); border-radius: 1px; }
.mg:first-child { margin-top: 0; padding-top: 4px; }

.mo {
  padding: 8px 10px; display: flex; align-items: center; gap: 10px;
  cursor: pointer; transition: background .1s; min-height: 48px;
  border-radius: 8px; margin-bottom: 2px;
  -webkit-tap-highlight-color: transparent;
}
.mo:hover { background: var(--hover); }
.mo.act   { background: rgba(0,229,255,.07); border: 1px solid rgba(0,229,255,.15); }
.mo-icon  {
  width: 28px; height: 28px; border-radius: 7px; overflow: hidden;
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0,229,255,.06); border: 1px solid var(--b);
}
.mo-icon img { width: 18px; height: 18px; object-fit: contain; }
.mo-info { flex: 1; min-width: 0; }
.mo-n  { font-size: 11px; color: white; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; }
.mo-s  { font-size: 9px; color: var(--dim); margin-top: 2px; line-height: 1; }
.mo-right { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
.mo-badge {
  font-size: 8px; padding: 2px 6px; border-radius: 4px; font-weight: 700;
  border: 1px solid; white-space: nowrap; letter-spacing: .3px; line-height: 1.4;
}
.mo-badge.fast { background: rgba(0,229,255,.1);   color: var(--cyan);   border-color: rgba(0,229,255,.3);   }
.mo-badge.best { background: rgba(136,0,255,.12);  color: #cc55ff;       border-color: rgba(136,0,255,.35);  }
.mo-badge.free { background: rgba(0,255,170,.1);   color: var(--green);  border-color: rgba(0,255,170,.3);   }
.mo-badge.lite { background: rgba(0,229,255,.07);  color: rgba(0,229,255,.7); border-color: rgba(0,229,255,.2); }
.mo-cost { font-size: 8px; color: var(--dim); line-height: 1; }
.mo-sel-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--cyan); flex-shrink: 0; align-self: center;
}


/* ══════════════════════════════════════════════
   THINKING / STEPS CARD
══════════════════════════════════════════════ */
.steps-wrap {
  display: flex; gap: 9px; animation: mi .22s ease;
  position: relative; z-index: 3;
}
.steps-box  {
  background: var(--bg2); border: 1px solid var(--b);
  border-radius: 2px 10px 10px 10px;
  overflow: hidden; min-width: 280px; max-width: min(520px, 88vw);
  min-height: 52px;
}
.steps-hdr  {
  padding: 9px 13px 8px; display: flex; align-items: center; gap: 7px;
  border-bottom: 1px solid var(--b); flex-wrap: nowrap;
  background: rgba(0,229,255,.02);
}
.steps-hdr-spinner {
  width: 11px; height: 11px;
  border: 1.5px solid rgba(0,229,255,.2); border-top-color: var(--cyan);
  border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0;
}
.steps-hdr-txt   { font-family: 'Orbitron', sans-serif; font-size: var(--fs-2xs); color: var(--cyan); letter-spacing: .5px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.steps-hdr-count { font-size: var(--fs-2xs); color: var(--dim); flex-shrink: 0; }
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
  min-height: 36px;
  -webkit-tap-highlight-color: transparent;
}
.steps-cancel-btn:hover { background: rgba(255,45,107,.16); }
@keyframes spin { to{transform:rotate(360deg)} }

.studio-summary-box   { margin-top: 8px; padding: 8px 10px; background: rgba(0,255,170,.04); border: 1px solid rgba(0,255,170,.15); border-radius: 6px; font-size: 10.5px; }
.studio-summary-title { color: var(--green); font-size: var(--fs-2xs); font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.studio-summary-item  { color: var(--text); padding: 1px 0; display: flex; align-items: center; gap: 5px; }
.studio-summary-dot   { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--green); flex-shrink: 0; }
.studio-summary-items { transition: all .2s ease; }


/* ══════════════════════════════════════════════
   MENTION DROPDOWN
══════════════════════════════════════════════ */
.mention-dd {
  position: fixed; background: var(--bg3); border: 1px solid var(--bb); border-radius: var(--r);
  z-index: 8000; max-height: min(260px, 45vh); overflow-y: auto;
  box-shadow: 0 -10px 40px rgba(0,0,0,.97); min-width: 290px; display: none;
  -webkit-overflow-scrolling: touch;
}
.mention-dd.open { display: block; }
.mention-hdr  { padding: 5px 12px 4px; font-size: var(--fs-2xs); color: var(--dim); text-transform: uppercase; letter-spacing: 2px; border-bottom: 1px solid var(--b); display: flex; align-items: center; gap: 5px; }
.mention-item { padding: 9px 12px; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: .1s; min-height: 44px; -webkit-tap-highlight-color: transparent; }
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
  display: flex; align-items: center; gap: 8px; padding: 8px 12px 8px 10px;
  background: rgba(0,229,255,.05); border: 1px solid rgba(0,229,255,.16); border-radius: 8px;
  color: var(--text); font-size: 11.5px; cursor: pointer; text-align: left;
  transition: background .14s, border-color .14s, color .14s, transform .1s;
  font-family: 'JetBrains Mono', monospace; width: fit-content; max-width: 100%; line-height: 1.4;
  min-height: 40px;
  -webkit-tap-highlight-color: transparent;
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


/* ══════════════════════════════════════════════
   MODALS
══════════════════════════════════════════════ */
.ov {
  position: fixed; inset: 0; background: rgba(3,3,18,.93); z-index: 500;
  display: none; align-items: flex-start; justify-content: center;
  padding: 20px 16px; overflow-y: auto;
  -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
  padding-top: calc(20px + var(--safe-top));
  padding-bottom: calc(20px + var(--safe-bottom));
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
  cursor: pointer; border: none; transition: .15s; white-space: nowrap; min-height: 44px;
  -webkit-tap-highlight-color: transparent;
}
.btn-modal.primary   { background: var(--cyan); color: #030312; }
.btn-modal.secondary { background: rgba(255,255,255,.06); color: var(--text); border: 1px solid var(--b); }
.btn-modal:hover     { opacity: .84; }

.settings-section { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--b); }
.settings-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.settings-title   { font-size: var(--fs-xs); color: var(--cyan); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; font-family: 'Orbitron', sans-serif; }
.settings-row     { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; font-size: var(--fs-md); gap: 8px; flex-wrap: wrap; min-height: 40px; }
.settings-hint    { font-size: var(--fs-2xs); color: var(--dim); margin-top: 2px; line-height: 1.5; }
.settings-btn {
  display: inline-flex; align-items: center; height: 36px; padding: 0 13px;
  border-radius: var(--r-s); font-family: 'JetBrains Mono', monospace; font-size: var(--fs-sm); cursor: pointer;
  border: 1px solid var(--b); background: var(--card); color: var(--text);
  transition: .15s; white-space: nowrap; flex-shrink: 0; text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.settings-btn:hover { border-color: var(--cyan2); color: var(--cyan); }
.settings-btn.danger       { border-color: rgba(255,45,107,.3); color: var(--pink); }
.settings-btn.danger:hover { background: rgba(255,45,107,.08); }
.settings-select {
  background: var(--bg3); border: 1px solid var(--b); border-radius: var(--r-s);
  padding: 0 8px; color: white; font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-sm); outline: none; cursor: pointer; height: 36px;
  -webkit-appearance: none; appearance: none;
}
.toggle-sw {
  width: 44px; height: 24px; border-radius: 12px; background: var(--dim);
  border: none; cursor: pointer; position: relative; transition: .25s; flex-shrink: 0; outline: none;
  -webkit-tap-highlight-color: transparent;
}
.toggle-sw.on { background: var(--cyan); }
.toggle-sw::after {
  content: ''; position: absolute; top: 3px; left: 3px;
  width: 18px; height: 18px; border-radius: 50%;
  background: white; transition: .25s; box-shadow: 0 1px 4px rgba(0,0,0,.4);
}
.toggle-sw.on::after { left: 23px; }
.report-ta {
  width: 100%; background: var(--bg3); border: 1px solid var(--b); border-radius: 6px;
  padding: 8px 10px; color: white; font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-md); outline: none; resize: vertical; min-height: 80px; margin-top: 6px;
  -webkit-appearance: none;
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
   RESPONSIVE — full pass
   ≤1100px narrow desktop
   ≤1024px tablet landscape
   ≤900px  tablet portrait (sidebar stays docked)
   ≤768px  mobile — sidebar becomes overlay drawer
   ≤480px  small phone
   ≤360px  very small phone
   landscape + short viewport override
   (pointer:coarse) safety net
══════════════════════════════════════════════ */

/* ── Narrow desktop ── */
@media (max-width: 1100px) { :root { --sb-w: 230px; } }

/* ── Tablet landscape ── */
@media (max-width: 1024px) {
  :root { --sb-w: 220px; }
  .inp-model { max-width: 150px; }
  .mb-wrap { max-width: 86%; }
}

/* ── Tablet portrait ── */
@media (max-width: 900px) and (min-width: 769px) {
  :root { --sb-w: 200px; }
  .inp-model { max-width: 130px; }
  .sb-nav-btn { font-size: var(--fs-sm); }
  .bubble { font-size: 12.8px; }
  #msgs { padding: 14px 14px 8px; }
}

/* ══════════════════════════════════════════════
   MOBILE ≤768px — sidebar overlay drawer
══════════════════════════════════════════════ */
@media (max-width: 768px) {
  #app {
    display: flex !important; flex-direction: column !important;
    height: 100vh !important; height: 100dvh !important;
    grid-template-columns: none !important; overflow: hidden !important;
  }
  #app.sb-hidden { grid-template-columns: none !important; }

  /* Sidebar: fixed overlay drawer */
  #sb {
    position: fixed !important; left: 0 !important; top: 0 !important;
    width: min(290px, 85vw) !important; height: 100% !important; height: 100dvh !important;
    max-height: none !important; z-index: 100 !important;
    border-right: 1px solid var(--b) !important; border-bottom: none !important;
    overflow-y: auto !important;
    box-shadow: 6px 0 40px rgba(0,0,0,.8) !important;
    transform: translateX(-105%) !important;
    transition: transform .28s cubic-bezier(.4,0,.2,1) !important;
    will-change: transform; -webkit-overflow-scrolling: touch;
    padding-top: var(--safe-top) !important;
  }
  #sb.mobile-open { transform: translateX(0) !important; }

  #menuBtn { display: inline-flex !important; }
  .collapse-sb { display: none !important; }
  #chat { flex: 1 !important; min-height: 0 !important; width: 100% !important; overflow: hidden !important; }

  /* Sidebar internals — bigger tap targets */
  .sb-head { height: 56px !important; }
  .sb-user { height: 56px !important; }
  .sb-av   { width: 40px !important; height: 40px !important; }
  .sb-gear { width: 40px !important; height: 40px !important; }
  .creds   { height: 56px !important; }
  .sb-nav-btn { height: 44px !important; font-size: 11px !important; }
  .ci { min-height: 44px !important; padding: 9px 10px !important; }
  .ci-del { min-width: 36px !important; min-height: 36px !important; opacity: 1 !important; }

  /* Header */
  .chat-hdr {
    height: 48px !important; padding: 0 10px !important;
    padding-left: calc(10px + var(--safe-left)) !important;
    padding-right: calc(10px + var(--safe-right)) !important;
    gap: 6px !important;
  }
  .chat-title { font-size: 11px !important; }
  .proj-name-pill { max-width: 130px !important; }
  .status-badge { max-width: 90px !important; font-size: 8px !important; padding: 0 6px !important; height: 22px !important; }

  /* Plugin banner — single line on mobile */
  .plug-banner {
    font-size: 9px !important; height: 28px !important;
    padding: 0 10px !important;
    padding-left: calc(10px + var(--safe-left)) !important;
    gap: 5px !important;
    overflow: hidden !important;
  }
  .plug-banner > *:not(:first-child):not(:nth-child(2)):not(:nth-child(3)) {
    display: none !important;
  }

  /* Messages */
  #msgs { padding: 10px 10px 6px !important; gap: 8px !important; }
  .mb-wrap { max-width: 91% !important; }
  .bubble  { font-size: 13px !important; padding: 9px 11px !important; }
  .av { width: 28px !important; height: 28px !important; }
  .msg { gap: 7px !important; }
  .msg-img { max-width: 130px !important; max-height: 110px !important; }

  /* Suggestions welcome grid — 1 column on small phones, 2 otherwise */
  .suggs { grid-template-columns: 1fr 1fr !important; max-width: 100% !important; }
  .wt { font-size: 20px !important; }
  .ws { font-size: var(--fs-md) !important; max-width: 280px !important; }

  /* Input area */
  .inp-area {
    padding: 8px 10px 12px !important;
    padding-left: calc(10px + var(--safe-left)) !important;
    padding-right: calc(10px + var(--safe-right)) !important;
    padding-bottom: calc(12px + var(--safe-bottom)) !important;
  }
  .inp-box { border-radius: 16px !important; }
  #inp {
    font-size: 16px !important;
    padding: 13px 14px 5px !important;
    min-height: 52px !important; max-height: 140px !important;
  }
  .inp-bar { padding: 4px 8px 8px !important; gap: 5px !important; }
  .ib { width: 40px !important; height: 40px !important; min-width: 40px !important; }
  .ib svg { width: 18px !important; height: 18px !important; }
  .btn-send { width: 44px !important; height: 44px !important; }
  .btn-send svg { width: 17px !important; height: 17px !important; }
  .btn-cancel { width: 40px !important; height: 40px !important; }
  .inp-model { max-width: 110px !important; height: 30px !important; }

  /* Steps card */
  .steps-box { max-width: calc(100vw - 52px) !important; min-width: 220px !important; }
  .steps-cancel-btn { min-height: 40px !important; }

  /* Modals */
  .ov { padding: 10px 10px !important; padding-top: calc(10px + var(--safe-top)) !important; padding-bottom: calc(10px + var(--safe-bottom)) !important; }
  .modal {
    padding: 16px !important; border-radius: 12px !important;
    max-height: calc(100dvh - 20px - var(--safe-top) - var(--safe-bottom)) !important;
    overflow-y: auto !important;
  }
  .modal-t { font-size: 12px !important; }
  .btn-modal { height: 44px !important; min-height: 44px !important; }

  /* Settings */
  .settings-row { gap: 6px !important; min-height: 44px !important; }
  .settings-btn { height: 40px !important; min-height: 40px !important; }
  .settings-select { height: 40px !important; font-size: 13px !important; }
  .toggle-sw { width: 48px !important; height: 27px !important; }
  .toggle-sw::after { width: 21px !important; height: 21px !important; }
  .toggle-sw.on::after { left: 24px !important; }

  /* Mention dropdown */
  .mention-dd { min-width: 0 !important; width: calc(100vw - 20px) !important; max-width: 360px !important; }
  .mention-item { min-height: 48px !important; }

  /* Model dropdown */
  .model-dd { min-width: 0 !important; width: calc(100vw - 24px) !important; max-width: 340px !important; }
  .mo { min-height: 52px !important; }

  /* Code block — scrollable on mobile */
  .code-block-wrap pre { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
  .code-block-wrap pre code.hljs { font-size: 10px !important; padding: 10px 12px !important; }

  /* Message actions — bigger tap area */
  .mab { height: 34px !important; min-width: 34px !important; }
}

/* ══════════════════════════════════════════════
   SMALL PHONE ≤480px
══════════════════════════════════════════════ */
@media (max-width: 480px) {
  .suggs { grid-template-columns: 1fr !important; }
  .inp-model { max-width: 95px !important; }
  .chat-title { font-size: 10px !important; }
  .status-badge { max-width: 78px !important; font-size: 7.5px !important; }
  .wt { font-size: 18px !important; }
  .ws { font-size: 10.5px !important; }
  .modal { padding: 14px !important; }
  .mb-wrap { max-width: 94% !important; }
  .bubble { font-size: 12.5px !important; }
  .sugg { padding: 8px 10px !important; }
  .sb-footer { font-size: 7.5px !important; }
  .settings-row { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
  .settings-row > span:first-child,
  .settings-row > div:first-child { width: 100% !important; }
  .modal-footer { flex-direction: column !important; align-items: stretch !important; }
  .modal-footer .btn-modal { width: 100% !important; justify-content: center !important; }
  /* Code preview modal: full width, taller scrollable area */
  #codePreviewModal .modal { width: 100% !important; }
  #codePreviewCode { font-size: 10px !important; padding: 10px !important; }
  /* Report textarea: easier to type */
  .report-ta { font-size: 16px !important; }
  /* Attach/attach row smaller */
  .attach-item img { width: 44px !important; height: 44px !important; }
}

/* ══════════════════════════════════════════════
   VERY SMALL ≤360px
══════════════════════════════════════════════ */
@media (max-width: 360px) {
  .status-badge { display: none !important; }
  .proj-name-pill { display: none !important; }
  .inp-model { max-width: 80px !important; }
  .sb-logo-text { font-size: 11px !important; }
  .cred-v { font-size: 18px !important; }
  .plug-banner a:last-child { display: none !important; }
  .sugg-title { font-size: 9px !important; }
  .steps-box { min-width: 180px !important; }
}

/* ══════════════════════════════════════════════
   LANDSCAPE PHONE — short viewport
══════════════════════════════════════════════ */
@media (max-width: 900px) and (orientation: landscape) and (max-height: 500px) {
  .chat-hdr { height: 40px !important; }
  .plug-banner { height: 24px !important; }
  #inp { max-height: 80px !important; min-height: 40px !important; }
  .inp-area { padding-top: 5px !important; padding-bottom: calc(5px + var(--safe-bottom)) !important; }
  #msgs { padding: 7px 10px 4px !important; gap: 6px !important; }
  .welcome { padding: 10px 16px !important; gap: 7px !important; }
  .wt { font-size: 17px !important; }
  .ws { line-height: 1.5 !important; }
  .suggs { grid-template-columns: 1fr 1fr !important; }
  .ov { padding-top: calc(6px + var(--safe-top)) !important; padding-bottom: calc(6px + var(--safe-bottom)) !important; }
  .modal { max-height: calc(100dvh - 12px - var(--safe-top) - var(--safe-bottom)) !important; }
  /* Sidebar: narrower in landscape */
  #sb { width: min(260px, 75vw) !important; }
}

/* ══════════════════════════════════════════════
   COARSE POINTER — safety net for all touch devices
   Ensures every interactive control ≥ 40×40 px
══════════════════════════════════════════════ */
@media (pointer: coarse) {
  .ib, .btn-cancel { min-width: 40px !important; min-height: 40px !important; }
  .btn-send { min-width: 44px !important; min-height: 44px !important; }
  .sb-gear, .sb-av { min-width: 40px !important; min-height: 40px !important; }
  .ci-del { min-width: 36px !important; min-height: 36px !important; opacity: 1 !important; }
  .settings-btn, .btn-modal { min-height: 44px !important; }
  .mab { min-height: 36px !important; min-width: 36px !important; }
  .cbtn { min-height: 32px !important; }
  .attach-rm { width: 24px !important; height: 24px !important; }
  .steps-cancel-btn { min-height: 44px !important; }
  .mo { min-height: 52px !important; }
  .mention-item { min-height: 48px !important; }
  .suggestion-chip { min-height: 44px !important; }
}
`

/* ─────────────────────────────────────────────────────────────────────────────
   QUEUE-BASED wCall
─────────────────────────────────────────────────────────────────────────────── */
type AnyFn = (...args: unknown[]) => void
interface PendingCall { name: string; args: unknown[] }
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
    else console.warn('[NEXUS] wCall: function not found →', name)
  }, 80)
}

function _flushPendingCalls(): void {
  _chatsModuleLoaded = true
  const queued = _pendingCalls.splice(0)
  queued.forEach(({ name, args }) => {
    const fn = (window as unknown as Record<string, unknown>)[name]
    if (typeof fn === 'function') { ;(fn as AnyFn)(...args) }
    else console.warn('[NEXUS] Flush: function not found →', name)
  })
}

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
  menu:     (<svg viewBox="0 0 24 24" width={18} height={18} stroke="currentColor" fill="none" strokeWidth={2}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>),
  send:     (<svg viewBox="0 0 24 24" width={14} height={14} stroke="currentColor" fill="none" strokeWidth={2.2}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>),
  x:        (<svg viewBox="0 0 24 24" width={14} height={14} stroke="currentColor" fill="none" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>),
  chevronDown: (<svg width={8} height={8} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={2} style={{ color: 'var(--dim)', flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>),
  attach:   (<svg viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={1.6}><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>),
  trash:    (<svg viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={1.6}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>),
  download: (<svg viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>),
  share:    (<svg viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={2}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>),
  info:     (<svg viewBox="0 0 24 24" width={11} height={11} stroke="currentColor" fill="none" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>),
  copy:     (<svg viewBox="0 0 24 24" width={11} height={11} stroke="currentColor" fill="none" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>),
  home:     (<svg viewBox="0 0 24 24" width={13} height={13} stroke="currentColor" fill="none" strokeWidth={2}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>),
  plus:     (<svg viewBox="0 0 24 24" width={13} height={13} stroke="currentColor" fill="none" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>),
  help:     (<svg viewBox="0 0 24 24" width={13} height={13} stroke="currentColor" fill="none" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>),
  inbox:    (<svg viewBox="0 0 24 24" width={13} height={13} stroke="currentColor" fill="none" strokeWidth={2}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>),
  code:     (<svg viewBox="0 0 24 24" width={11} height={11} stroke="currentColor" fill="none" strokeWidth={2}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>),
}

/* ─────────────────────────────────────────────────────────────────────────────
   PAGE COMPONENT
─────────────────────────────────────────────────────────────────────────────── */
export default function ChatsPage() {
  const scriptsLoadedRef = useRef(false)

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
    document.body.style.height              = '100%'
    document.body.style.overflow            = 'hidden'

    const preventBodyScroll = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest(
        '#msgs, #sb, .convs, .ov, .model-dd, .mention-dd, .modal'
      )) return
      e.preventDefault()
    }
    document.addEventListener('touchmove', preventBodyScroll, { passive: false })

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
      document.body.style.height              = ''
      document.body.style.overflow            = ''
      document.removeEventListener('touchmove', preventBodyScroll)
    }
  }, [])

  const handleClick = (fn: string, ...args: unknown[]) =>
    (): void => wCall(fn, ...args)

  const handleClickWithEvent = (fn: string, ...args: unknown[]) =>
    (e: React.MouseEvent<HTMLElement>): void => { e.stopPropagation(); wCall(fn, e, ...args) }

  const handleImgErr  = (e: React.SyntheticEvent<HTMLImageElement>): void => { e.currentTarget.style.display = 'none' }
  const handleLogoErr = (e: React.SyntheticEvent<HTMLImageElement>): void => {
    const p = e.currentTarget.parentElement
    if (p) p.style.background = 'linear-gradient(135deg,#00e5ff,#8800ff)'
    e.currentTarget.style.display = 'none'
  }
  const handleFileChange        = (e: React.ChangeEvent<HTMLInputElement>): void => wCall('handleFile', e)
  const handlePlayTestDurChange = (e: React.ChangeEvent<HTMLInputElement>): void => wCall('setPlayTestDur', e.target.value)

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

      {/* PAGE LOADER */}
      <div id="pageLoader">
        <div className="pl-logo">
          <img src="/images/nexusai.png" alt="N" onError={handleLogoErr}/>
        </div>
        <div className="pl-title">NEXUS AI</div>
        <div className="pl-bar-wrap"><div className="pl-bar" id="plBar"/></div>
        <div className="pl-txt" id="plTxt">Initializing...</div>
      </div>

      {/* MOBILE SIDEBAR OVERLAY */}
      <div id="sbOverlay" onClick={closeMobileSidebar}/>

      {/* MENTION DROPDOWN */}
      <div className="mention-dd" id="mentionDD">
        <div className="mention-hdr">
          <svg viewBox="0 0 24 24" width={10} height={10} stroke="currentColor" fill="none" strokeWidth={2}>
            <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/>
          </svg>
          <span id="mentionHdrTxt">Scripts &amp; Objects in Place</span>
        </div>
        <div id="mentionList"/>
      </div>

      {/* APP SHELL */}
      <div id="app" className="hidden">

        {/* ═══════════════════════════════
            SIDEBAR
        ═══════════════════════════════ */}
        <div id="sb">

          {/* Logo + Brand + BETA */}
          <div className="sb-head">
            <div className="sb-logo">
              <img src="/images/nexusai.png" alt="N" onError={handleLogoErr}/>
            </div>
            <div className="sb-brand">
              <div className="sb-logo-text">
                NEXUS AI
                <span className="sb-beta-badge" id="verBadge">BETA</span>
              </div>
              <div className="sb-logo-sub">Roblox Dev</div>
            </div>
          </div>

          {/* User */}
          <div className="sb-user">
            <img
              className="sb-av" id="sbAv"
              src="/images/nexusai.png" alt="Avatar"
              onError={(e) => { e.currentTarget.style.opacity = '0.3' }}
              onClick={handleClick('openAvatarModal')}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="sb-un"   id="sbUn">—</div>
              <div className="sb-role" id="sbRole">Roblox Developer</div>
            </div>
            <button className="sb-gear" type="button" onClick={handleClick('openSettings')} aria-label="Settings">
              {Icon.settings}
            </button>
          </div>

          {/* Project chip (shown by JS when in a project) */}
          <div className="sb-proj-chip" id="sbProjChip">
            <span className="sb-proj-chip-dot"/>
            <span id="sbProjName"/>
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
              <div className="cred-hint" id="credHint">Tap to buy more</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="cred-v" id="credDisp">30</div>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'rgba(255,214,0,.5)' }}>CR</div>
            </div>
          </div>

          {/* Nav */}
          <div className="sb-btn-group">
            <button className="sb-nav-btn cyan"   type="button" onClick={() => { window.location.href = '/dashboard' }}>
              {Icon.home}<span id="dashLbl">Dashboard</span>
            </button>
            <button className="sb-nav-btn cyan"   type="button" onClick={handleClick('newChat')}>
              {Icon.plus}<span id="newChatLbl">New Conversation</span>
            </button>
            <button className="sb-nav-btn yellow" type="button" onClick={() => { window.location.href = '/agent' }}>
              {Icon.help}<span id="helpBtnText">Need Help?</span>
            </button>
            <button className="sb-nav-btn purple" type="button" onClick={() => { window.location.href = '/inbox' }}>
              {Icon.inbox}<span id="inboxBtnText">Inbox</span>
              <span className="inbox-badge" id="inboxBadge">0</span>
            </button>
          </div>

          <div className="sec-lbl" id="recentLbl">Chat History</div>
          <div className="convs" id="convList">
            <div className="conv-empty" id="noConvLbl">No conversations yet</div>
          </div>

          <div className="sb-footer">
            Built by <span style={{ color: 'var(--cyan)' }}>NEXUS STUDIO</span><br/>
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

        {/* ═══════════════════════════════
            CHAT PANEL
        ═══════════════════════════════ */}
        <div id="chat">

          {/* Plugin status banner */}
          <div className="plug-banner" id="plugBanner">
            {Icon.info}
            <span id="plugBannerTxt">Plugin not connected —</span>
            <a
              onClick={handleClick('showInstall')} id="plugInstallLink"
              role="button" tabIndex={0} style={{ cursor: 'pointer' }}
              onKeyDown={(e) => { if (e.key === 'Enter') wCall('showInstall') }}
            >
              How to connect
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

          {/* HEADER */}
          <div className="chat-hdr">
            {/* Hamburger — mobile only */}
            <button
              id="menuBtn" type="button" className="ib"
              onClick={handleMobileMenuToggle}
              aria-label="Open menu"
              style={{ flexShrink: 0 }}
            >
              {Icon.menu}
            </button>

            {/* Title */}
            <div className="chat-title-group">
              <div className="chat-title-row">
                <div className="chat-title" id="chatTitle">NEXUS AI</div>
              </div>
              <div className="proj-name-pill" id="projNamePill">
                <span className="proj-name-dot"/>
                <span id="projNameText"/>
              </div>
            </div>

            {/* Studio status */}
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

          {/* CHAT CONTENT */}
          <div
            id="chatTab"
            style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}
          >
            {/* Messages */}
            <div id="msgs">
              <div className="welcome" id="welcome">
                <div style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden', border: '2px solid rgba(0,229,255,.3)', flexShrink: 0 }}>
                  <img src="/images/nexusai.png" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" onError={handleLogoErr}/>
                </div>
                <div className="wt">NEXUS AI</div>
                <div className="ws" id="welcomeText">
                  Smart Roblox AI — write Lua, debug scripts, build GUIs. Connect the plugin to inject directly into Studio!
                </div>
                <div className="suggs" id="suggGrid"/>
              </div>
            </div>

            {/* INPUT AREA */}
            <div className="inp-area">
              <div className="attach-row" id="attachRow"/>

              <div className="inp-box" id="inpBox">
                <textarea
                  id="inp"
                  placeholder="Ask NEXUS AI about Roblox... (type @ to mention)"
                  rows={1}
                />

                <div className="inp-bar">
                  <div className="inp-l">
                    {/* Attach label — matches .ib button visually */}
                    <label
                      htmlFor="fi"
                      className="ib"
                      title="Attach image or file"
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

                    {/* Hidden file input */}
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
                      title="Clear conversation"
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
                      aria-label="Select AI model"
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

                  {/* Cancel / Send */}
                  <button
                    className="btn-cancel hidden" id="cancelBtn"
                    type="button"
                    onClick={handleClick('cancelGen')}
                    title="Cancel generation"
                    aria-label="Cancel"
                  >
                    {Icon.x}
                  </button>
                  <button
                    className="btn-send" id="sendBtn"
                    type="button"
                    onClick={handleClick('send')}
                    title="Send message"
                    aria-label="Send"
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

        </div>
        {/* end #chat */}
      </div>
      {/* end #app */}

      {/* ════════════════════════
          MODALS
      ════════════════════════ */}

      {/* Avatar Modal */}
      <div className="ov" id="avatarModal">
        <div className="modal" style={{ width: 340, textAlign: 'center', padding: 26 }}>
          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 13, color: 'var(--cyan)', marginBottom: 14 }} id="avatarModalName">@—</div>
          <img
            id="avatarModalImg" src="" alt="Avatar"
            style={{ width: 110, height: 110, borderRadius: '50%', border: '3px solid var(--cyan)', objectFit: 'cover', margin: '0 auto 12px', display: 'block' }}
            onError={(e) => { e.currentTarget.src = '/images/nexusai.png' }}
          />
          <div style={{ fontSize: 'var(--fs-md)', color: 'var(--dim)', marginBottom: 3 }} id="avatarModalRole">Developer</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }} id="avatarModalId">Roblox ID: —</div>
          <div className="modal-footer" style={{ justifyContent: 'center', marginTop: 14 }}>
            <button className="btn-modal primary" type="button" onClick={handleClick('closeModal', 'avatarModal')} id="avatarCloseBtn">CLOSE</button>
          </div>
        </div>
      </div>

      {/* Install Plugin Modal */}
      <div className="ov" id="installModal">
        <div className="modal">
          <div className="modal-t">{Icon.download}<span id="installTitle">How to Install NEXUS AI Plugin</span></div>
          <div className="modal-b">
            {[1,2,3,4,5].map((n) => (
              <div key={n} className="install-step">
                <div className="install-num">{n}</div>
                <div className="install-txt" id={`installStep${n}`}>Step {n}</div>
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button className="btn-modal primary" type="button" onClick={handleClick('closeModal', 'installModal')} id="installCloseBtn">GOT IT</button>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <div className="ov" id="settingsModal">
        <div className="modal" style={{ width: 520 }}>
          <div className="modal-t">{Icon.settings}<span id="settingsTitle">Settings</span></div>

          <div className="settings-section">
            <div className="settings-title" id="settingsAccountTitle">Account</div>
            <div className="settings-row">
              <span style={{ color: 'white', fontWeight: 600 }} id="settingsUsername">@—</span>
              <span id="settingsBadge"/>
            </div>
            <div className="settings-row">
              <span id="settingsCreditsLabel">Credits</span>
              <span id="settingsCredits" style={{ color: 'var(--yellow)', fontWeight: 700 }}>—</span>
            </div>
            <div className="settings-row">
              <span id="settingsPlanLabel">Plan</span>
              <span id="settingsPlan" style={{ color: 'var(--green)' }}>Free</span>
            </div>
            <div className="settings-row">
              <span id="settingsRobloxIdLabel">Roblox ID</span>
              <span id="settingsRobloxId" style={{ color: 'var(--dim)', fontSize: 'var(--fs-sm)' }}>—</span>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-title" id="dailyCreditsTitle">Daily Credits</div>
            <div className="settings-row"><span id="freePlanLabel">Free Plan</span><span style={{ color: 'var(--green)' }}>+2 CR / day</span></div>
            <div className="settings-row"><span id="proPlanLabel">Pro Plan</span><span style={{ color: 'var(--cyan)' }}>+25 CR / day</span></div>
            <div className="settings-row">
              <span id="lastClaimInfo" style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }}/>
              <button className="settings-btn" type="button" id="claimDailyBtn" onClick={handleClick('claimDaily')}>Claim Daily</button>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-title" id="playTestTitle">Auto Play Test</div>
            <div className="settings-row">
              <div>
                <div id="playTestLabel">Run play test after inject</div>
                <div className="settings-hint" id="playTestHint">Disable if your PC crashes during play test</div>
              </div>
              <button className="toggle-sw on" id="playTestToggle" type="button" onClick={handleClick('togglePlayTest')} aria-label="Toggle auto play test"/>
            </div>
            <div className="settings-row">
              <span id="playTestDurLabel">Duration (seconds)</span>
              <input
                type="number" id="playTestDurInput" className="settings-select"
                style={{ width: 70 }} min={5} max={120} defaultValue={15}
                onChange={handlePlayTestDurChange}
              />
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-title" id="reportTitle">Report an Issue</div>
            <textarea className="report-ta" id="reportTa" placeholder="Describe the problem..."/>
            <div id="cf-turnstile-wrap" style={{ marginTop: 8, minHeight: 65, display: 'none' }}>
              <div id="cf-turnstile-report" style={{ transform: 'scale(0.85)', transformOrigin: 'left' }}/>
            </div>
            <input type="hidden" id="_tsToken" value=""/>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="settings-btn" type="button" onClick={handleClick('sendReport')} id="reportBtn">Send Report</button>
              <span id="reportStatus" style={{ fontSize: 'var(--fs-sm)', color: 'var(--green)' }}/>
            </div>
          </div>

          <div className="settings-section" id="adminSection" style={{ display: 'none' }}>
            <div className="settings-title">Admin Panel</div>
            <div style={{ marginTop: 6 }}>
              <a href="/admin-panel" className="settings-btn" style={{ textDecoration: 'none' }}>Open Admin Panel</a>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-title" id="redeemTitle">Redeem Code</div>
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }} id="redeemHint">Get codes from the NEXUS STUDIO Discord</div>
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <input
                  type="text" id="redeemInput" className="settings-select"
                  style={{ flex: 1, padding: '0 10px', height: 36 }}
                  placeholder="Enter code..."
                />
                <button className="settings-btn" type="button" onClick={handleClick('redeemCode')} id="redeemBtn">Redeem</button>
              </div>
              <span id="redeemStatus" style={{ fontSize: 'var(--fs-sm)', color: 'var(--green)' }}/>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-title" id="downloadTitle">Download Plugin</div>
            <div className="settings-row" style={{ flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }} id="downloadHint">Install the NEXUS AI Plugin in Roblox Studio</div>
              <button
                className="settings-btn" type="button" id="downloadPluginBtn"
                onClick={() => window.open('https://create.roblox.com/store/asset/91870814099475/NEXUS-AI', '_blank')}
              >
                Download from Creator Store
              </button>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-title" id="accountTitle">Account</div>
            <div className="settings-row">
              <span id="logoutLabel">Sign out of NEXUS AI</span>
              <button className="settings-btn danger" type="button" onClick={handleClick('logout')}>Sign Out</button>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn-modal primary" type="button" onClick={handleClick('closeModal', 'settingsModal')} id="settingsCloseBtn">CLOSE</button>
          </div>
        </div>
      </div>

      {/* Code Preview Modal */}
      <div className="ov" id="codePreviewModal">
        <div className="modal" style={{ width: 700 }}>
          <div className="modal-t">
            {Icon.code}
            <span id="codePreviewTitle">Script Preview</span>
            <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-2xs)', color: 'var(--dim)' }} id="codePreviewPath"/>
          </div>
          <div className="modal-b" style={{ margin: 0 }}>
            <div className="code-block-wrap" style={{ margin: 0 }}>
              <div className="code-lang-bar">
                <span>Lua</span>
                <div className="code-btns">
                  <button className="cbtn" type="button" onClick={handleClick('copyPreviewCode')}>
                    {Icon.copy} Copy
                  </button>
                </div>
              </div>
              <pre style={{ maxHeight: 440, overflowY: 'auto', overflowX: 'auto', margin: 0 }}>
                <code id="codePreviewCode" className="language-lua" style={{ fontSize: 11, lineHeight: 1.5, padding: 14, display: 'block' }}/>
              </pre>
            </div>
          </div>
          <div className="modal-footer" style={{ marginTop: 12 }}>
            <button className="btn-modal secondary" type="button" onClick={handleClick('closeModal', 'codePreviewModal')}>Close</button>
          </div>
        </div>
      </div>

      {/* Share Modal */}
      <div className="ov" id="shareModal">
        <div className="modal" style={{ width: 520 }}>
          <div className="modal-t">{Icon.share}<span id="shareModalTitle">Share Chat</span></div>
          <div className="modal-b" style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 'var(--fs-md)', color: 'var(--dim)', marginBottom: 6 }} id="shareModalDesc">Copy this conversation:</p>
            <textarea className="share-modal-ta" id="shareModalTa" readOnly/>
          </div>
          <div className="modal-footer">
            <button className="btn-modal primary"   type="button" onClick={handleClick('copyShareText')}            id="shareModalCopyBtn">Copy Text</button>
            <button className="btn-modal secondary" type="button" onClick={handleClick('closeModal', 'shareModal')}  id="shareModalCloseBtn">Close</button>
          </div>
        </div>
      </div>

    </>
  )
}