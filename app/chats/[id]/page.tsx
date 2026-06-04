'use client'

import React, { useEffect } from 'react'

/* ─────────────────────────────────────────────────────────────────────────────
   NEXUS AI — Chats Page v2.0
   Enhanced design: better animations, polished UI, improved hierarchy
───────────────────────────────────────────────────────────────────────────── */
const PAGE_CSS = `
:root {
  --bg:#030312; --bg2:#06071a; --bg3:#0a0b22; --bg4:#0d0e28;
  --card:rgba(0,229,255,.04); --hover:rgba(0,229,255,.07);
  --cyan:#00e5ff; --cyan2:rgba(0,229,255,.35); --cyan3:rgba(0,229,255,.08);
  --purple:#8800ff; --purple2:rgba(136,0,255,.3);
  --pink:#ff2d6b; --green:#00ffaa; --yellow:#ffd600; --orange:#ff7700;
  --text:#b8cfff; --text2:#8899cc; --dim:#3a4a7a; --dim2:#2a3660;
  --b:rgba(0,229,255,.1); --bb:rgba(0,229,255,.28); --bh:rgba(0,229,255,.22);
  --r:9px; --r2:12px; --btn-h:32px; --btn-sm:28px; --sb-w:258px;
  --shadow:0 8px 32px rgba(0,0,0,.7);
  --shadow-sm:0 2px 12px rgba(0,0,0,.5);
  --glow:0 0 20px rgba(0,229,255,.08);
}

*, *::before, *::after { margin:0; padding:0; box-sizing:border-box }

html {
  height:100%; font-family:'JetBrains Mono',monospace;
  background:var(--bg); color:var(--text); font-size:13px; overflow:hidden;
}
body { height:100%; overflow:hidden; min-height:0; }

/* ── GRID BG ── */
body::before {
  content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
  background:
    linear-gradient(rgba(0,229,255,.014) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,229,255,.014) 1px,transparent 1px);
  background-size:44px 44px;
}
body::after {
  content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
  background:radial-gradient(ellipse 70% 50% at 20% 0%,rgba(136,0,255,.06) 0%,transparent 60%),
             radial-gradient(ellipse 50% 40% at 80% 100%,rgba(0,229,255,.04) 0%,transparent 60%);
}

::-webkit-scrollbar { width:3px; height:3px }
::-webkit-scrollbar-thumb { background:rgba(0,229,255,.15); border-radius:2px }
::-webkit-scrollbar-track { background:transparent }

/* ─────────────────────── PAGE LOADER ─────────────────────── */
#pageLoader {
  position:fixed; inset:0; background:var(--bg); z-index:99999;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:18px; transition:opacity .6s ease;
}
#pageLoader.hide { opacity:0; pointer-events:none }

.pl-ring {
  position:relative; width:82px; height:82px; flex-shrink:0;
}
.pl-ring::before {
  content:''; position:absolute; inset:-6px; border-radius:50%;
  border:1.5px solid transparent;
  border-top-color:var(--cyan); border-right-color:rgba(0,229,255,.3);
  animation:plSpin 1.4s linear infinite;
}
.pl-ring::after {
  content:''; position:absolute; inset:-12px; border-radius:50%;
  border:1px solid transparent;
  border-bottom-color:var(--purple); border-left-color:rgba(136,0,255,.25);
  animation:plSpin 2.2s linear infinite reverse;
}
@keyframes plSpin { to { transform:rotate(360deg) } }

.pl-logo {
  width:82px; height:82px; border-radius:20px; overflow:hidden;
  border:1.5px solid rgba(0,229,255,.3);
  box-shadow:0 0 30px rgba(0,229,255,.12), inset 0 0 20px rgba(0,229,255,.04);
  position:absolute; inset:0;
}
.pl-logo img { width:100%; height:100%; object-fit:cover; display:block }

.pl-brand { display:flex; flex-direction:column; align-items:center; gap:3px }
.pl-title {
  font-family:'Orbitron',sans-serif; font-size:24px; font-weight:900; letter-spacing:2px;
  background:linear-gradient(135deg,var(--cyan) 0%,var(--purple) 100%);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
}
.pl-sub { font-size:9px; color:var(--dim); letter-spacing:3px; text-transform:uppercase }

.pl-bar-wrap {
  width:200px; height:2px; background:rgba(0,229,255,.08);
  border-radius:2px; overflow:hidden; position:relative;
}
.pl-bar {
  height:100%; width:0%; border-radius:2px; transition:width .35s ease;
  background:linear-gradient(90deg,var(--cyan),var(--purple),var(--cyan));
  background-size:200% 100%; animation:barShimmer 1.5s linear infinite;
}
@keyframes barShimmer { to { background-position:-200% 0 } }
.pl-txt { font-size:9.5px; color:rgba(0,229,255,.4); letter-spacing:1.5px; min-height:15px }

/* ─────────────────────── APP SHELL ─────────────────────── */
#app {
  display:grid; grid-template-columns:var(--sb-w) 1fr;
  height:100vh; height:100dvh; min-height:0;
  position:relative; z-index:1;
  transition:grid-template-columns .22s cubic-bezier(.4,0,.2,1);
  overflow:hidden;
}
#app.sb-hidden { grid-template-columns:0 1fr }

/* ─────────────────────── SIDEBAR ─────────────────────── */
#sb {
  display:flex; flex-direction:column;
  background:var(--bg2); border-right:1px solid var(--b);
  overflow:hidden; overflow-y:auto;
  position:relative; z-index:5;
  min-height:0; width:var(--sb-w); min-width:0;
}

/* Sidebar glow top */
#sb::before {
  content:''; position:absolute; top:0; left:0; right:0; height:120px;
  background:linear-gradient(to bottom,rgba(136,0,255,.06),transparent);
  pointer-events:none; z-index:0;
}

.sb-head {
  padding:13px 15px 11px; border-bottom:1px solid var(--b);
  display:flex; align-items:center; gap:10px; flex-shrink:0;
  position:relative; z-index:1;
}
.sb-logo {
  width:32px; height:32px; border-radius:9px; overflow:hidden;
  flex-shrink:0; border:1.5px solid rgba(0,229,255,.2);
  box-shadow:0 0 12px rgba(0,229,255,.08);
}
.sb-logo img { width:100%; height:100%; object-fit:cover; display:block }
.sb-logo-text {
  font-family:'Orbitron',sans-serif; font-weight:900; font-size:13px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
  letter-spacing:.5px;
}
.sb-logo-sub { font-size:8px; color:var(--dim); letter-spacing:2px }

.sb-user {
  padding:9px 13px; display:flex; align-items:center; gap:9px;
  border-bottom:1px solid var(--b); flex-shrink:0; position:relative; z-index:1;
}
.sb-av {
  width:34px; height:34px; border-radius:50%;
  border:2px solid var(--cyan2); object-fit:cover;
  background:var(--bg3); flex-shrink:0; cursor:pointer;
  transition:border-color .2s, transform .2s, box-shadow .2s;
}
.sb-av:hover {
  border-color:var(--cyan); transform:scale(1.07);
  box-shadow:0 0 14px rgba(0,229,255,.2);
}
.sb-un { font-size:11.5px; color:white; font-weight:600; line-height:1.3 }
.sb-role { font-size:9px; color:var(--dim); margin-top:1px }
.sb-gear {
  margin-left:auto; color:var(--dim); cursor:pointer; flex-shrink:0;
  background:none; border:1px solid transparent; padding:5px; border-radius:7px;
  display:flex; align-items:center; justify-content:center; transition:.15s;
}
.sb-gear:hover { color:var(--cyan); border-color:var(--b); background:var(--card) }
.sb-gear svg { width:15px; height:15px; stroke:currentColor; fill:none; stroke-width:2 }

/* Credits */
.creds {
  margin:8px 12px; padding:10px 13px;
  background:linear-gradient(135deg,rgba(255,214,0,.07),rgba(255,140,0,.05));
  border:1px solid rgba(255,214,0,.2); border-radius:var(--r);
  display:flex; align-items:center; justify-content:space-between;
  flex-shrink:0; cursor:pointer; transition:all .18s; position:relative; overflow:hidden;
}
.creds::before {
  content:''; position:absolute; right:-10px; top:-10px; width:60px; height:60px;
  background:radial-gradient(circle,rgba(255,214,0,.08),transparent 70%);
  pointer-events:none;
}
.creds:hover { border-color:rgba(255,214,0,.4); box-shadow:0 4px 20px rgba(255,214,0,.08) }
.creds.low { border-color:rgba(255,45,107,.4); background:rgba(255,45,107,.06) }
.creds.low::before { background:radial-gradient(circle,rgba(255,45,107,.1),transparent 70%) }
.cred-v {
  font-family:'Orbitron',sans-serif; font-size:20px; color:var(--yellow); font-weight:900;
  line-height:1;
}
.creds.low .cred-v { color:var(--pink) }
.cred-l { font-size:9px; color:rgba(255,214,0,.55); text-transform:uppercase; letter-spacing:1.5px }
.cred-unit { font-size:8px; color:rgba(255,214,0,.45); margin-top:2px }
.cred-buy { font-size:8.5px; color:rgba(255,214,0,.45); margin-top:2px }

/* Buttons */
.sb-btn-group { display:flex; flex-direction:column; gap:4px; padding:0 12px 4px; flex-shrink:0 }
.btn-nc, .help-btn, .inbox-btn {
  display:flex; align-items:center; gap:7px;
  width:100%; height:var(--btn-h); padding:0 12px; border-radius:var(--r);
  font-family:'JetBrains Mono',monospace; font-size:11px; cursor:pointer;
  transition:all .15s; white-space:nowrap; overflow:hidden; flex-shrink:0;
}
.btn-nc svg, .help-btn svg, .inbox-btn svg {
  width:13px; height:13px; stroke:currentColor; fill:none; stroke-width:2; flex-shrink:0;
}
.btn-nc {
  background:var(--cyan3); border:1px solid var(--b); color:var(--cyan);
}
.btn-nc:hover { border-color:var(--bb); background:rgba(0,229,255,.1); box-shadow:var(--glow) }
.help-btn {
  background:rgba(255,214,0,.05); border:1px solid rgba(255,214,0,.18); color:var(--yellow);
}
.help-btn:hover { background:rgba(255,214,0,.1); border-color:rgba(255,214,0,.35) }
.inbox-btn {
  background:rgba(136,0,255,.06); border:1px solid rgba(136,0,255,.2); color:#cc55ff;
}
.inbox-btn:hover { background:rgba(136,0,255,.12); border-color:rgba(136,0,255,.4) }
.inbox-badge {
  margin-left:auto; background:var(--pink); color:white; font-size:8px;
  font-weight:700; padding:2px 6px; border-radius:10px; min-width:18px;
  text-align:center; flex-shrink:0; box-shadow:0 0 8px rgba(255,45,107,.4);
}

/* Project chip */
.proj-chip {
  margin:0 12px 4px; padding:5px 10px;
  background:rgba(255,170,50,.05); border:1px solid rgba(255,170,50,.18);
  border-radius:6px; font-size:9px; color:rgba(255,170,50,.8);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex-shrink:0;
  display:flex; align-items:center; gap:5px;
}
.proj-chip::before {
  content:''; width:6px; height:6px; border-radius:50%;
  background:var(--orange); flex-shrink:0;
}

/* Section label */
.sec-lbl {
  padding:6px 15px 3px; font-size:9px; color:var(--dim);
  text-transform:uppercase; letter-spacing:2px; flex-shrink:0;
  display:flex; align-items:center; justify-content:space-between;
}

/* Conversation list */
.convs {
  flex:1; overflow-y:auto; padding:3px 8px; min-height:0;
}
.convs::-webkit-scrollbar { width:2px }
.convs::-webkit-scrollbar-thumb { background:var(--dim2) }

.ci {
  padding:7px 10px; border-radius:var(--r); cursor:pointer;
  display:flex; align-items:center; gap:7px; transition:all .12s;
  position:relative; margin-bottom:1px;
}
.ci::before {
  content:''; position:absolute; left:0; top:50%; transform:translateY(-50%);
  width:0px; height:16px; background:var(--cyan); border-radius:0 2px 2px 0;
  transition:width .15s;
}
.ci:hover { background:var(--hover) }
.ci.act { background:rgba(0,229,255,.06); }
.ci.act::before { width:2.5px }
.ci-icon {
  width:22px; height:22px; border-radius:5px; background:rgba(0,229,255,.06);
  border:1px solid var(--b); display:flex; align-items:center; justify-content:center;
  flex-shrink:0;
}
.ci-icon svg { width:10px; height:10px; stroke:var(--dim); fill:none; stroke-width:2 }
.ci.act .ci-icon { background:rgba(0,229,255,.1); border-color:var(--bb) }
.ci.act .ci-icon svg { stroke:var(--cyan) }
.ci-body { flex:1; min-width:0 }
.ci-title { font-size:11px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.ci.act .ci-title { color:white }
.ci-time { font-size:8.5px; color:var(--dim); flex-shrink:0 }
.ci-del {
  font-size:11px; color:var(--dim); opacity:0; padding:1px 5px;
  cursor:pointer; background:none; border:none; border-radius:3px;
  transition:.1s; flex-shrink:0;
}
.ci:hover .ci-del { opacity:1 }
.ci-del:hover { color:var(--pink); background:rgba(255,45,107,.12) }
.conv-empty {
  padding:24px 14px; text-align:center; color:var(--dim);
  font-size:11px; line-height:1.8;
}
.conv-empty svg {
  width:28px; height:28px; stroke:var(--dim2); fill:none; stroke-width:1.5;
  display:block; margin:0 auto 8px; opacity:.5;
}

/* Footer */
.sb-footer {
  padding:7px 13px; font-size:8px; color:var(--dim);
  text-align:center; border-top:1px solid var(--b); flex-shrink:0; line-height:1.9;
}

/* Collapse button */
.collapse-sb {
  position:absolute; right:-18px; top:50%; transform:translateY(-50%);
  width:18px; height:42px; background:var(--bg2); border:1px solid var(--b);
  border-left:none; border-radius:0 7px 7px 0; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  color:var(--dim); z-index:10; transition:color .15s, background .15s;
}
.collapse-sb:hover { color:var(--cyan); background:rgba(0,229,255,.05) }
.collapse-sb svg { width:10px; height:10px; stroke:currentColor; fill:none; stroke-width:2 }

/* ─────────────────────── CHAT PANEL ─────────────────────── */
#chat {
  display:flex; flex-direction:column; overflow:hidden;
  position:relative; min-height:0; min-width:0;
}

/* Plugin banner */
.plug-banner {
  padding:6px 15px; border-bottom:1px solid rgba(255,45,107,.2);
  font-size:10px; color:var(--pink); display:flex; align-items:center; gap:8px;
  flex-shrink:0; background:rgba(255,45,107,.07);
}
.plug-banner svg { width:11px; height:11px; stroke:currentColor; fill:none; stroke-width:2; flex-shrink:0 }
.plug-banner a { cursor:pointer; text-decoration:none; font-weight:600; transition:opacity .15s }
.plug-banner a:first-of-type { color:var(--cyan) }
.plug-banner a:hover { opacity:.75 }
.plug-banner .plug-reconnect { color:var(--green); margin-left:6px }
.plug-banner.connected {
  background:rgba(0,255,170,.05); border-color:rgba(0,255,170,.15); color:var(--green);
}

/* Chat header */
.chat-hdr {
  padding:9px 16px; border-bottom:1px solid var(--b);
  background:linear-gradient(to bottom,var(--bg4),var(--bg2));
  display:flex; align-items:center; gap:10px; flex-shrink:0; min-width:0;
}
.chat-title {
  font-family:'Orbitron',sans-serif; font-size:11px; font-weight:700;
  color:white; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0;
}
.proj-badge-hdr {
  font-size:9px; padding:3px 9px; border-radius:10px;
  background:rgba(255,170,50,.07); border:1px solid rgba(255,170,50,.2);
  color:rgba(255,170,50,.8); white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; max-width:130px; flex-shrink:0;
}
.status-badge {
  display:flex; align-items:center; gap:5px; padding:4px 11px;
  border-radius:20px; border:1px solid; font-size:9px; cursor:pointer;
  flex-shrink:0; transition:all .2s; white-space:nowrap; font-weight:600;
}
.status-badge.off {
  border-color:rgba(255,45,107,.3); color:var(--pink); background:rgba(255,45,107,.07);
}
.status-badge.off:hover { border-color:rgba(255,45,107,.5); background:rgba(255,45,107,.12) }
.status-badge.on {
  border-color:rgba(0,255,170,.3); color:var(--green); background:rgba(0,255,170,.07);
  box-shadow:0 0 12px rgba(0,255,170,.08);
}
.sdot { width:5px; height:5px; border-radius:50%; background:currentColor }
.sdot.pulse { animation:pd 1.8s infinite }
@keyframes pd { 0%,100%{opacity:1} 50%{opacity:.2} }

/* Hdr action buttons */
.hdr-act {
  width:28px; height:28px; border-radius:7px; border:1px solid var(--b);
  background:var(--card); color:var(--dim); cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  transition:.15s; flex-shrink:0;
}
.hdr-act:hover { color:var(--cyan); border-color:var(--bb); background:var(--hover) }
.hdr-act svg { width:13px; height:13px; stroke:currentColor; fill:none; stroke-width:2 }

/* Toggle switch */
.toggle-sw {
  width:38px; height:20px; border-radius:10px; background:var(--dim2);
  border:none; cursor:pointer; position:relative; transition:.25s; flex-shrink:0; outline:none;
}
.toggle-sw.on { background:linear-gradient(135deg,var(--cyan),#00b8d9) }
.toggle-sw::after {
  content:''; position:absolute; top:3px; left:3px;
  width:14px; height:14px; border-radius:50%; background:white;
  transition:.25s; box-shadow:0 1px 5px rgba(0,0,0,.5);
}
.toggle-sw.on::after { left:21px }

/* Chat tabs */
.chat-tabs {
  display:flex; gap:4px; padding:6px 15px; border-bottom:1px solid var(--b);
  background:var(--bg2); flex-shrink:0; align-items:center;
  overflow-x:auto; overflow-y:hidden; scrollbar-width:none;
}
.chat-tabs::-webkit-scrollbar { display:none }
.tab-btn {
  display:flex; align-items:center; gap:5px; height:var(--btn-sm);
  padding:0 13px; border-radius:7px; border:1px solid transparent;
  font-family:'JetBrains Mono',monospace; font-size:10px; cursor:pointer;
  color:var(--dim); transition:all .15s; background:none;
  white-space:nowrap; flex-shrink:0;
}
.tab-btn svg { width:11px; height:11px; stroke:currentColor; fill:none; stroke-width:2; flex-shrink:0 }
.tab-btn.act {
  background:var(--cyan3); border-color:var(--b); color:var(--cyan);
  box-shadow:var(--glow);
}
.tab-btn:hover:not(.act) { color:var(--text2); background:var(--card) }

/* ─────────────────────── MESSAGES ─────────────────────── */
#msgs {
  flex:1; overflow-y:auto; padding:16px 18px;
  display:flex; flex-direction:column; gap:12px; min-height:0;
}
#msgs::-webkit-scrollbar { width:3px }
#msgs::-webkit-scrollbar-thumb { background:var(--dim2) }

/* Welcome screen */
.welcome {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  flex:1; text-align:center; gap:14px; padding:30px 20px; color:var(--dim);
}
.welcome-logo {
  width:64px; height:64px; border-radius:18px; overflow:hidden; position:relative;
  border:2px solid rgba(0,229,255,.25); flex-shrink:0;
  box-shadow:0 0 40px rgba(0,229,255,.1), 0 0 80px rgba(136,0,255,.08);
}
.welcome-logo::after {
  content:''; position:absolute; inset:0; border-radius:inherit;
  background:linear-gradient(135deg,rgba(0,229,255,.08),rgba(136,0,255,.08));
}
.welcome-logo img { width:100%; height:100%; object-fit:cover; display:block }
.wt {
  font-family:'Orbitron',sans-serif; font-size:24px; font-weight:900;
  background:linear-gradient(135deg,var(--cyan) 0%,#44aaff 50%,var(--purple) 100%);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
  letter-spacing:1px;
}
.ws { font-size:12px; line-height:2; max-width:360px; color:var(--text2) }
.suggs {
  display:grid; grid-template-columns:1fr 1fr; gap:8px;
  max-width:460px; margin-top:6px; width:100%;
}
.sugg {
  padding:10px 12px; background:var(--card); border:1px solid var(--b);
  border-radius:var(--r); cursor:pointer; transition:all .2s; text-align:left;
  font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--text2);
  line-height:1.55; position:relative; overflow:hidden;
}
.sugg::before {
  content:''; position:absolute; inset:0;
  background:linear-gradient(135deg,rgba(0,229,255,.04),rgba(136,0,255,.02));
  opacity:0; transition:opacity .2s;
}
.sugg:hover { border-color:var(--bh); color:white; transform:translateY(-1px); box-shadow:0 4px 20px rgba(0,0,0,.3) }
.sugg:hover::before { opacity:1 }
.sugg-title {
  color:var(--cyan); display:flex; align-items:center; gap:5px;
  margin-bottom:4px; font-size:10px; font-weight:700;
}
.sugg-title svg { width:12px; height:12px; stroke:currentColor; fill:none; stroke-width:2; flex-shrink:0 }

/* Message bubbles */
.msg { display:flex; gap:10px; animation:msgIn .2s ease }
.msg.user { flex-direction:row-reverse }
@keyframes msgIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }

.av {
  width:32px; height:32px; border-radius:50%; flex-shrink:0; overflow:hidden;
  background:var(--bg3); border:1.5px solid var(--dim2);
}
.av img { width:100%; height:100%; object-fit:cover }
.msg.ai .av { border-color:rgba(0,229,255,.2) }

.mb-wrap { max-width:82%; display:flex; flex-direction:column; gap:4px; min-width:0 }
.msg-sender {
  font-size:9px; color:var(--dim); display:flex; align-items:center;
  gap:6px; padding:0 4px;
}
.msg-sender span:first-child { color:var(--text2); font-weight:600 }
.msg.user .msg-sender { flex-direction:row-reverse }

.bubble {
  padding:11px 14px; border-radius:11px; line-height:1.75;
  font-size:12.5px; word-break:break-word;
}
.msg.user .bubble {
  background:linear-gradient(135deg,rgba(0,229,255,.09),rgba(136,0,255,.09));
  border:1px solid rgba(0,229,255,.18); border-radius:11px 3px 11px 11px; color:white;
}
.msg.ai .bubble {
  background:var(--bg2); border:1px solid var(--b);
  border-radius:3px 11px 11px 11px; color:var(--text);
}
.msg-imgs { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px }
.msg-img {
  max-width:170px; max-height:140px; border-radius:8px; object-fit:cover;
  border:1px solid var(--b); cursor:pointer; transition:.15s;
}
.msg-img:hover { border-color:var(--cyan); transform:scale(1.02) }

/* Code blocks */
.code-block-wrap {
  margin:9px 0; border-radius:9px; overflow:hidden;
  border:1px solid rgba(0,229,255,.12);
  box-shadow:var(--shadow-sm);
}
.code-lang-bar {
  display:flex; align-items:center; justify-content:space-between;
  padding:5px 12px; background:rgba(0,229,255,.07);
  border-bottom:1px solid rgba(0,229,255,.1); font-size:9px; color:var(--cyan);
}
.code-block-wrap pre { margin:0 }
.code-block-wrap pre code.hljs { font-size:11px; line-height:1.6; padding:14px 16px; border-radius:0; border:none }
.code-btns { display:flex; gap:4px }
.cbtn {
  background:rgba(10,11,34,.9); border:1px solid rgba(0,229,255,.22);
  border-radius:5px; color:var(--cyan); font-size:9px; padding:3px 8px;
  cursor:pointer; display:flex; align-items:center; gap:3px; transition:.12s;
}
.cbtn:hover { background:rgba(0,229,255,.15) }
.cbtn svg { width:11px; height:11px; stroke:currentColor; fill:none; stroke-width:2 }
.cbtn.dl { color:#cc55ff; border-color:rgba(136,0,255,.3) }
.cbtn.dl:hover { background:rgba(136,0,255,.15) }

/* Inline code, markdown */
.bubble code:not(.hljs) {
  background:rgba(0,229,255,.09); padding:2px 6px; border-radius:4px;
  font-size:11px; color:var(--cyan);
}
.bubble p { margin-bottom:7px }
.bubble p:last-child { margin-bottom:0 }
.bubble h1,.bubble h2,.bubble h3 {
  color:var(--cyan); margin:12px 0 6px; font-family:'Orbitron',sans-serif;
}
.bubble h1{font-size:14px} .bubble h2{font-size:13px} .bubble h3{font-size:12px}
.bubble ul,.bubble ol { padding-left:18px; margin-bottom:7px }
.bubble li { margin-bottom:4px; line-height:1.7 }
.bubble strong { color:white }
.bubble blockquote {
  border-left:2px solid var(--cyan); padding-left:10px;
  color:var(--text2); font-style:italic; margin:6px 0;
}
.bubble table { width:100%; border-collapse:collapse; margin:8px 0; font-size:11px }
.bubble th,.bubble td { padding:5px 10px; border:1px solid var(--b) }
.bubble th { background:rgba(0,229,255,.07); color:var(--cyan) }

/* Message action bar */
.msg-acts { display:flex; gap:3px; padding:2px 4px; flex-wrap:wrap; margin-top:1px }
.mab {
  font-size:9px; color:var(--dim); background:none; border:1px solid transparent;
  cursor:pointer; padding:3px 7px; border-radius:5px; transition:.12s;
  display:flex; align-items:center; gap:3px; font-family:'JetBrains Mono',monospace;
}
.mab:hover { color:var(--cyan); border-color:var(--b); background:var(--card) }
.mab.liked { color:var(--green); border-color:rgba(0,255,170,.3) }
.mab.disliked { color:var(--pink); border-color:rgba(255,45,107,.3) }
.mab svg { width:11px; height:11px; stroke:currentColor; fill:none; stroke-width:2 }

/* Attachments */
.attach-row { display:flex; gap:7px; margin-bottom:7px; flex-wrap:wrap; padding:0 3px }
.attach-row:empty { display:none }
.attach-item { position:relative }
.attach-item img { width:54px; height:54px; border-radius:8px; object-fit:cover; border:1px solid var(--b) }
.attach-file {
  padding:5px 10px; border:1px solid var(--b); border-radius:6px;
  font-size:10px; color:var(--cyan); background:var(--cyan3);
  display:flex; align-items:center; gap:4px; max-width:150px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.attach-rm {
  position:absolute; top:-5px; right:-5px; width:16px; height:16px;
  background:var(--pink); border:none; border-radius:50%; color:white;
  font-size:9px; cursor:pointer; display:flex; align-items:center;
  justify-content:center; z-index:2; box-shadow:0 2px 6px rgba(255,45,107,.4);
}

/* ─────────────────────── INPUT AREA ─────────────────────── */
.inp-area {
  padding:10px 15px; border-top:1px solid var(--b); background:var(--bg2);
  flex-shrink:0; position:relative; z-index:2;
}
.inp-box {
  background:var(--bg3); border:1px solid var(--b); border-radius:var(--r2);
  transition:border-color .2s, box-shadow .2s; overflow:hidden;
}
.inp-box:focus-within {
  border-color:var(--cyan2); box-shadow:0 0 0 3px rgba(0,229,255,.05), var(--glow);
}
.inp-box.drag-over { border-color:var(--cyan); box-shadow:0 0 0 3px rgba(0,229,255,.08) }
#inp {
  width:100%; background:transparent; border:none; outline:none;
  color:white; font-family:'JetBrains Mono',monospace; font-size:13px;
  padding:12px 15px; resize:none; min-height:46px; max-height:130px;
  line-height:1.6; display:block;
}
#inp::placeholder { color:var(--dim) }

.inp-bar {
  display:flex; align-items:center; height:46px; padding:0 10px;
  border-top:1px solid var(--b); gap:5px; flex-wrap:nowrap; overflow:hidden;
}
.inp-l {
  display:flex; align-items:center; gap:5px; flex:1; min-width:0;
  overflow:hidden; height:100%;
}
.ib {
  width:28px; height:28px; border-radius:6px; border:1px solid var(--b);
  background:transparent; color:var(--dim); cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center;
  transition:.15s; flex-shrink:0; padding:0; margin:0; user-select:none;
  -webkit-user-select:none; vertical-align:middle; line-height:1;
  appearance:none; -webkit-appearance:none; outline:none; box-sizing:border-box;
  font-family:'JetBrains Mono',monospace;
}
.ib:hover { color:var(--cyan); border-color:var(--bh); background:var(--card) }
.ib svg { width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:1.5; flex-shrink:0; pointer-events:none }
input[type="file"].hidden-fi {
  position:absolute; width:0!important; height:0!important;
  opacity:0; overflow:hidden; pointer-events:none; clip:rect(0,0,0,0); white-space:nowrap;
}
.inp-model {
  display:flex; align-items:center; gap:4px; padding:0 8px; height:28px;
  border-radius:7px; background:var(--card); border:1px solid var(--b);
  cursor:pointer; transition:.15s; font-family:'JetBrains Mono',monospace;
  font-size:9px; color:var(--dim); max-width:clamp(100px,175px,30vw);
  min-width:0; overflow:hidden; flex-shrink:1;
}
.inp-model:hover { border-color:var(--bh); color:var(--cyan) }
.inp-model img { width:14px; height:14px; border-radius:3px; object-fit:contain; flex-shrink:0 }
.inp-model-name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; font-size:9px; min-width:0 }
.inp-model-badge { font-size:8px; font-weight:700; flex-shrink:0 }

.theme-picker-btn {
  display:flex; align-items:center; gap:4px; padding:0 8px; height:28px;
  border-radius:7px; background:var(--card); border:1px solid var(--b);
  cursor:pointer; transition:.15s; font-family:'JetBrains Mono',monospace;
  font-size:9px; color:var(--dim); flex-shrink:0;
}
.theme-picker-btn:hover { border-color:var(--bh); color:var(--cyan) }
.theme-swatch { width:10px; height:10px; border-radius:50%; flex-shrink:0; border:1px solid rgba(255,255,255,.2) }

.btn-send, .btn-cancel {
  border:none; border-radius:9px; width:36px; height:36px;
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:all .18s; flex-shrink:0;
}
.btn-send {
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  color:white; box-shadow:0 2px 12px rgba(0,229,255,.25);
}
.btn-send:hover { opacity:.85; transform:scale(1.06); box-shadow:0 4px 20px rgba(0,229,255,.35) }
.btn-send svg, .btn-cancel svg { width:15px; height:15px; stroke:currentColor; fill:none; stroke-width:2 }
.btn-cancel {
  background:rgba(255,45,107,.12); border:1px solid rgba(255,45,107,.3); color:var(--pink);
}
.btn-cancel:hover { background:rgba(255,45,107,.22) }

/* ─────────────────────── DROPDOWNS ─────────────────────── */
.model-dd, .theme-dd {
  position:fixed; background:var(--bg3); border:1px solid var(--bb);
  border-radius:var(--r2); z-index:9000; display:none;
  box-shadow:0 12px 48px rgba(0,0,0,.96), 0 0 0 1px rgba(0,229,255,.05);
}
.model-dd { max-height:min(390px,70vh); overflow-y:auto; min-width:275px }
.model-dd::-webkit-scrollbar { width:3px }
.model-dd::-webkit-scrollbar-thumb { background:var(--dim2) }
.model-dd.open, .theme-dd.open { display:block; animation:ddIn .15s ease }
@keyframes ddIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
.mg {
  padding:7px 12px 3px; font-size:9px; color:var(--dim);
  text-transform:uppercase; letter-spacing:2px; border-top:1px solid var(--b);
}
.mg:first-child { border-top:none }
.mo { padding:8px 12px; display:flex; align-items:center; gap:8px; cursor:pointer; transition:.1s }
.mo:hover { background:var(--hover) }
.mo.act { background:rgba(0,229,255,.07) }
.mo-icon {
  width:22px; height:22px; border-radius:5px; overflow:hidden;
  flex-shrink:0; display:flex; align-items:center; justify-content:center;
  background:rgba(0,229,255,.05); border:1px solid var(--b);
}
.mo-icon img { width:100%; height:100%; object-fit:contain }
.mo-n { font-size:11.5px; color:white; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.mo-s { font-size:9px; color:var(--dim) }
.mb-badge { font-size:8px; padding:2px 6px; border-radius:4px; font-weight:700; white-space:nowrap }
.mb-badge.f { background:rgba(0,255,170,.1); color:var(--green) }
.mb-badge.s { background:rgba(0,229,255,.1); color:var(--cyan) }
.mb-badge.p { background:rgba(136,0,255,.12); color:#cc55ff }
.mb-badge.n { background:rgba(255,214,0,.1); color:var(--yellow) }

.theme-dd { width:230px; padding:8px }
.theme-dd-title {
  font-size:8px; color:var(--dim); text-transform:uppercase; letter-spacing:2px;
  padding:2px 6px 7px; border-bottom:1px solid var(--b); margin-bottom:5px;
}
.theme-opt { display:flex; align-items:center; gap:9px; padding:7px 9px; border-radius:7px; cursor:pointer; transition:.12s }
.theme-opt:hover { background:var(--hover) }
.theme-opt.act { background:rgba(0,229,255,.08); outline:1px solid rgba(0,229,255,.22) }
.theme-preview { display:flex; gap:2px; flex-shrink:0 }
.theme-preview span { width:8px; height:22px; border-radius:3px }
.theme-opt-name { font-size:10.5px; color:var(--text); flex:1; font-family:'JetBrains Mono',monospace }
.theme-opt-check { width:12px; height:12px; color:var(--cyan); stroke:currentColor; fill:none; stroke-width:2.5 }

/* ─────────────────────── STEPS / THINKING ─────────────────────── */
.steps-wrap { display:flex; gap:10px; animation:msgIn .2s ease }
.steps-box {
  background:var(--bg2); border:1px solid var(--b);
  border-radius:3px 12px 12px 12px; overflow:hidden;
  min-width:290px; max-width:min(540px,90vw);
  box-shadow:var(--shadow-sm);
}
.steps-hdr {
  padding:10px 14px 9px; display:flex; align-items:center; gap:8px;
  border-bottom:1px solid var(--b);
  background:linear-gradient(to right,rgba(0,229,255,.04),transparent);
}
.steps-hdr-spinner {
  width:12px; height:12px; border:1.5px solid rgba(0,229,255,.15);
  border-top-color:var(--cyan); border-radius:50%;
  animation:spin .65s linear infinite; flex-shrink:0;
}
.steps-hdr-txt {
  font-family:'Orbitron',sans-serif; font-size:9.5px; color:var(--cyan);
  letter-spacing:.5px; flex:1;
}
.steps-hdr-count { font-size:8.5px; color:var(--dim); flex-shrink:0 }
.steps-toggle-btn {
  background:none; border:1px solid var(--b); color:var(--dim);
  font-size:8.5px; cursor:pointer; padding:2px 8px; border-radius:5px;
  transition:.12s; white-space:nowrap; flex-shrink:0;
  font-family:'JetBrains Mono',monospace;
}
.steps-toggle-btn:hover { color:var(--cyan); border-color:var(--bh) }
.steps-list { padding:5px 0 }
.step-row {
  display:flex; align-items:flex-start; gap:8px; padding:4px 14px;
  font-size:11px; line-height:1.55; animation:stepIn .16s ease;
  transition:background .1s;
}
.step-row:hover { background:rgba(0,229,255,.02) }
@keyframes stepIn { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:none} }
.step-ic {
  width:14px; flex-shrink:0; display:flex; align-items:center;
  justify-content:center; margin-top:1px;
}
.step-spin {
  width:10px; height:10px; border:1.5px solid rgba(0,229,255,.12);
  border-top-color:var(--cyan); border-radius:50%; animation:spin .6s linear infinite;
}
.step-check { width:10px; height:10px; color:var(--green); stroke:currentColor; fill:none; stroke-width:2.5 }
.step-err { width:10px; height:10px; color:var(--pink); stroke:currentColor; fill:none; stroke-width:2.5 }
.step-pend { width:8px; height:8px; border-radius:50%; border:1.5px solid var(--dim) }
.step-info { width:10px; height:10px; color:var(--yellow); stroke:currentColor; fill:none; stroke-width:2 }
.step-content { flex:1; min-width:0 }
.step-txt { color:var(--text); word-break:break-word }
.step-row[data-st="done"] .step-txt { color:var(--dim) }
.step-row[data-st="running"] .step-txt { color:var(--cyan) }
.step-row[data-st="error"] .step-txt { color:var(--pink) }
.step-row[data-st="info"] .step-txt { color:var(--yellow) }
.step-sub { font-size:9px; color:var(--dim); margin-top:1px; opacity:.75 }
.steps-cancel { padding:8px 13px; border-top:1px solid var(--b) }
.steps-cancel-btn {
  padding:4px 12px; background:rgba(255,45,107,.07); border:1px solid rgba(255,45,107,.22);
  border-radius:6px; color:var(--pink); font-size:9.5px; cursor:pointer;
  transition:.12s; font-family:'JetBrains Mono',monospace;
}
.steps-cancel-btn:hover { background:rgba(255,45,107,.15) }
@keyframes spin { to { transform:rotate(360deg) } }

/* ─────────────────────── GUI EDITOR ─────────────────────── */
#guiTab { flex:1; overflow:hidden; display:none; flex-direction:column; min-height:0 }
.gui-toolbar {
  padding:7px 13px; border-bottom:1px solid var(--b); background:var(--bg2);
  display:flex; align-items:center; gap:5px; flex-wrap:wrap; flex-shrink:0;
  overflow-x:auto; overflow-y:hidden; scrollbar-width:none;
}
.gui-toolbar::-webkit-scrollbar { display:none }
.gui-btn {
  display:flex; align-items:center; gap:3px; height:var(--btn-sm); padding:0 10px;
  border-radius:6px; border:1px solid var(--b); background:var(--card);
  color:var(--text); font-family:'JetBrains Mono',monospace; font-size:10px;
  cursor:pointer; transition:.15s; white-space:nowrap; flex-shrink:0;
}
.gui-btn:hover { border-color:var(--bh); color:var(--cyan) }
.gui-btn svg { width:11px; height:11px; stroke:currentColor; fill:none; stroke-width:1.8 }
.gui-main { flex:1; display:flex; overflow:hidden; position:relative; min-height:0 }
.gui-layers {
  width:148px; background:var(--bg2); border-right:1px solid var(--b);
  overflow-y:auto; padding:8px; flex-shrink:0; min-height:0;
}
.gui-layer-title {
  font-size:8.5px; color:var(--dim); text-transform:uppercase;
  letter-spacing:1.5px; margin-bottom:7px; padding:0 2px;
}
.gui-layer-item {
  padding:4px 7px; border-radius:5px; font-size:10px; color:var(--text);
  cursor:pointer; display:flex; align-items:center; gap:5px; transition:.1s;
}
.gui-layer-item:hover { background:var(--hover) }
.gui-layer-item.sel { background:rgba(0,229,255,.07); color:var(--cyan) }
.gui-layer-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0 }
.gui-canvas { flex:1; position:relative; background:rgba(0,0,0,.35); overflow:auto; min-height:0; min-width:0 }
.gui-canvas-inner {
  width:800px; height:600px; position:relative;
  background:rgba(15,20,52,.9); border:1px solid var(--b);
  margin:20px auto; min-width:400px;
}
.gui-el {
  position:absolute; border:1px solid transparent; cursor:move;
  user-select:none; display:flex; align-items:center;
  justify-content:center; font-family:'JetBrains Mono',monospace; overflow:hidden;
}
.gui-el.selected { outline:2px solid var(--cyan)!important; outline-offset:1px }
.gui-resize {
  position:absolute; bottom:-4px; right:-4px; width:9px; height:9px;
  background:var(--cyan); border-radius:2px; cursor:se-resize;
}
.gui-props {
  width:215px; background:var(--bg2); border-left:1px solid var(--b);
  overflow-y:auto; padding:9px; flex-shrink:0; min-height:0;
}
.gui-prop-label { font-size:9px; color:var(--dim); margin-bottom:3px; margin-top:7px }
.gui-prop-input {
  width:100%; background:var(--bg3); border:1px solid var(--b); border-radius:5px;
  padding:4px 8px; color:white; font-family:'JetBrains Mono',monospace; font-size:11px; outline:none;
}
.gui-prop-input:focus { border-color:var(--cyan2) }
.gui-gen-btn {
  display:flex; align-items:center; gap:4px; height:var(--btn-sm); padding:0 12px;
  background:linear-gradient(135deg,var(--cyan),var(--purple)); border:none;
  border-radius:7px; color:white; font-family:'Orbitron',sans-serif;
  font-size:10px; font-weight:700; cursor:pointer; white-space:nowrap; flex-shrink:0;
}
.gui-ai-btn {
  display:flex; align-items:center; gap:4px; height:var(--btn-sm); padding:0 11px;
  background:rgba(136,0,255,.12); border:1px solid rgba(136,0,255,.38);
  border-radius:7px; color:#cc55ff; font-family:'JetBrains Mono',monospace;
  font-size:10px; cursor:pointer; white-space:nowrap; flex-shrink:0; transition:.15s;
}
.gui-ai-btn:hover { background:rgba(136,0,255,.22) }
.gui-ai-btn svg, .gui-gen-btn svg { width:11px; height:11px; stroke:currentColor; fill:none; stroke-width:2; flex-shrink:0 }
.gui-loading {
  position:absolute; inset:0; background:rgba(3,3,18,.88);
  display:none; align-items:center; justify-content:center;
  flex-direction:column; gap:12px; font-size:11px; color:var(--cyan);
}
.gui-loading.show { display:flex }
.gui-empty-hint {
  position:absolute; inset:0; display:flex; align-items:center;
  justify-content:center; flex-direction:column; gap:8px;
  color:rgba(0,229,255,.1); font-size:11px; pointer-events:none;
}
.gui-empty-hint svg { width:34px; height:34px; stroke:currentColor; fill:none; stroke-width:1.2 }

/* ─────────────────────── MODALS ─────────────────────── */
.ov {
  position:fixed; inset:0; background:rgba(3,3,18,.95); z-index:500;
  display:none; align-items:flex-start; justify-content:center;
  backdrop-filter:blur(8px); padding:24px 18px; overflow-y:auto;
}
.ov.show { display:flex; animation:ovIn .2s ease }
@keyframes ovIn { from{opacity:0} to{opacity:1} }

.modal {
  background:var(--bg2); border:1px solid var(--bb); border-radius:16px;
  padding:24px; width:500px; max-width:100%;
  box-shadow:0 32px 80px rgba(0,0,0,.95), 0 0 0 1px rgba(0,229,255,.04),
             inset 0 1px 0 rgba(255,255,255,.04);
  margin:auto; position:relative; overflow:hidden;
}
.modal::before {
  content:''; position:absolute; top:0; left:0; right:0; height:80px;
  background:linear-gradient(to bottom,rgba(0,229,255,.03),transparent);
  pointer-events:none;
}
.modal-t {
  font-family:'Orbitron',sans-serif; font-size:13px; font-weight:700;
  color:var(--cyan); margin-bottom:14px; display:flex; align-items:center; gap:9px;
  position:relative;
}
.modal-t svg { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:2; flex-shrink:0 }
.modal-b { font-size:11.5px; color:var(--text); line-height:1.8; margin-bottom:15px }
.modal-b code {
  font-family:'JetBrains Mono'; background:rgba(0,229,255,.09);
  padding:2px 6px; border-radius:4px; color:var(--cyan);
}
.modal-footer { display:flex; gap:8px; flex-wrap:wrap; align-items:center }
.btn-modal {
  display:flex; align-items:center; justify-content:center;
  height:36px; padding:0 18px; border-radius:var(--r);
  font-family:'Orbitron',sans-serif; font-size:10px; font-weight:700;
  cursor:pointer; border:none; transition:.15s; white-space:nowrap;
}
.btn-modal.primary {
  background:linear-gradient(135deg,var(--cyan),#0099cc); color:#030312;
  box-shadow:0 2px 12px rgba(0,229,255,.3);
}
.btn-modal.primary:hover { opacity:.88; transform:translateY(-1px) }
.btn-modal.secondary {
  background:rgba(255,255,255,.05); color:var(--text); border:1px solid var(--b);
}
.btn-modal.secondary:hover { border-color:var(--bh); color:white }

/* Settings */
.settings-section {
  margin-bottom:18px; padding-bottom:18px; border-bottom:1px solid var(--b);
}
.settings-section:last-child { border-bottom:none; margin-bottom:0; padding-bottom:0 }
.settings-title {
  font-size:9.5px; color:var(--cyan); text-transform:uppercase;
  letter-spacing:2px; margin-bottom:11px; font-family:'Orbitron',sans-serif;
  display:flex; align-items:center; gap:6px;
}
.settings-title::before {
  content:''; width:3px; height:12px; background:var(--cyan);
  border-radius:2px; flex-shrink:0; opacity:.7;
}
.settings-row {
  display:flex; align-items:center; justify-content:space-between;
  padding:5px 0; font-size:11px; gap:8px; flex-wrap:wrap;
}
.settings-hint { font-size:9px; color:var(--dim); margin-top:2px; line-height:1.6 }
.settings-btn {
  display:flex; align-items:center; gap:5px; height:var(--btn-sm); padding:0 14px;
  border-radius:7px; font-family:'JetBrains Mono',monospace; font-size:10px;
  cursor:pointer; border:1px solid var(--b); background:var(--card);
  color:var(--text); transition:.15s; white-space:nowrap;
}
.settings-btn:hover { border-color:var(--bh); color:var(--cyan) }
.settings-btn.danger { border-color:rgba(255,45,107,.3); color:var(--pink) }
.settings-btn.danger:hover { background:rgba(255,45,107,.08) }
.settings-select {
  background:var(--bg3); border:1px solid var(--b); border-radius:6px;
  padding:4px 8px; color:white; font-family:'JetBrains Mono',monospace;
  font-size:10px; outline:none; cursor:pointer; transition:.15s;
}
.settings-select:focus { border-color:var(--cyan2) }
.report-ta {
  width:100%; background:var(--bg3); border:1px solid var(--b); border-radius:7px;
  padding:9px 11px; color:white; font-family:'JetBrains Mono',monospace;
  font-size:11px; outline:none; resize:vertical; min-height:80px; margin-top:7px;
  transition:.15s;
}
.report-ta:focus { border-color:var(--cyan2) }

/* Install steps */
.install-step {
  display:flex; gap:12px; padding:10px 0; border-bottom:1px solid var(--b); align-items:flex-start;
}
.install-step:last-child { border-bottom:none }
.install-num {
  width:24px; height:24px; border-radius:50%;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  display:flex; align-items:center; justify-content:center;
  font-size:10px; font-weight:700; color:white; flex-shrink:0; margin-top:1px;
  box-shadow:0 2px 8px rgba(0,229,255,.25);
}
.install-txt { font-size:11px; color:var(--text); line-height:1.7; flex:1 }
.install-txt code {
  color:var(--cyan); background:rgba(0,229,255,.09); padding:1px 5px;
  border-radius:4px; font-size:10px;
}
.install-txt strong { color:white }
.install-txt a { color:var(--cyan); text-decoration:none }
.install-txt a:hover { text-decoration:underline }

/* Badges */
.badge-owner {
  background:linear-gradient(135deg,rgba(255,214,0,.18),rgba(255,140,0,.15));
  color:var(--yellow); border:1px solid rgba(255,214,0,.3);
  padding:2px 9px; border-radius:10px; font-size:9px; font-weight:700;
  font-family:'Orbitron',sans-serif;
}
.badge-admin {
  background:rgba(0,229,255,.1); color:var(--cyan);
  border:1px solid rgba(0,229,255,.3); padding:2px 9px;
  border-radius:10px; font-size:9px; font-weight:700;
}
.badge-pro {
  background:rgba(136,0,255,.12); color:#cc55ff;
  border:1px solid rgba(136,0,255,.3); padding:2px 9px;
  border-radius:10px; font-size:9px; font-weight:700;
}

.share-modal-ta {
  width:100%; background:var(--bg3); border:1px solid var(--b); border-radius:7px;
  padding:9px 11px; color:var(--text); font-family:'JetBrains Mono',monospace;
  font-size:10px; outline:none; resize:none; height:200px; margin-top:9px;
}
.hidden { display:none!important }

/* Studio summary */
.studio-summary-box {
  margin-top:9px; padding:9px 11px;
  background:rgba(0,255,170,.04); border:1px solid rgba(0,255,170,.14);
  border-radius:8px; font-size:10.5px;
}
.studio-summary-title {
  color:var(--green); font-size:9px; font-weight:700; margin-bottom:5px;
  display:flex; align-items:center; gap:5px;
}
.studio-summary-item {
  color:var(--text); padding:2px 0; display:flex; align-items:center; gap:6px;
}
.studio-summary-dot {
  display:inline-block; width:5px; height:5px; border-radius:50%;
  background:var(--green); flex-shrink:0;
}

/* Mention dropdown */
.mention-dd {
  position:fixed; background:var(--bg3); border:1px solid var(--bb);
  border-radius:var(--r2); z-index:8000;
  max-height:min(270px,50vh); overflow-y:auto;
  box-shadow:0 -12px 48px rgba(0,0,0,.98), 0 0 0 1px rgba(0,229,255,.05);
  min-width:295px; display:none;
}
.mention-dd.open { display:block; animation:ddIn .12s ease }
.mention-hdr {
  padding:6px 13px 5px; font-size:8px; color:var(--dim);
  text-transform:uppercase; letter-spacing:2px; border-bottom:1px solid var(--b);
  display:flex; align-items:center; gap:5px;
}
.mention-item {
  padding:8px 13px; display:flex; align-items:center; gap:9px;
  cursor:pointer; transition:.1s;
}
.mention-item:hover, .mention-item.sel { background:var(--hover) }
.mention-ic {
  width:22px; height:22px; border-radius:5px; display:flex;
  align-items:center; justify-content:center; font-size:8px; font-weight:700; flex-shrink:0;
}
.mention-ic.script { background:rgba(0,229,255,.1); color:var(--cyan) }
.mention-ic.local { background:rgba(0,255,170,.1); color:var(--green) }
.mention-ic.module { background:rgba(136,0,255,.1); color:#cc55ff }
.mention-ic.obj { background:rgba(255,214,0,.1); color:var(--yellow) }
.mention-name {
  font-size:11.5px; color:white; flex:1; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; min-width:0;
}
.mention-path { font-size:8.5px; color:var(--dim) }
.mention-empty { padding:14px; font-size:10px; color:var(--dim); text-align:center }

/* Suggestion chips (from JS) */
.suggestion-chips{display:flex;flex-direction:column;gap:5px;margin-top:10px;margin-bottom:2px}
.suggestion-chip{
  display:flex;align-items:center;gap:8px;padding:7px 12px 7px 10px;
  background:rgba(0,229,255,.04);border:1px solid rgba(0,229,255,.14);
  border-radius:8px;color:var(--text);font-size:11.5px;cursor:pointer;
  text-align:left;transition:all .14s;font-family:inherit;
  width:fit-content;max-width:100%;line-height:1.4;
}
.suggestion-chip::before{
  content:'';display:inline-flex;width:0;height:0;
  border-top:4.5px solid transparent;border-bottom:4.5px solid transparent;
  border-left:7px solid var(--cyan);flex-shrink:0;opacity:.5;transition:all .14s;
}
.suggestion-chip:hover{
  background:rgba(0,229,255,.1);border-color:rgba(0,229,255,.35);color:var(--cyan);
}
.suggestion-chip:hover::before{opacity:1;transform:translateX(2px)}
.suggestion-chip:active{transform:scale(.97)}
.suggestion-chip.sending{opacity:.5;pointer-events:none}

/* Sum toggle */
.sum-toggle-btn:hover{opacity:1!important;text-decoration:underline}
.studio-summary-items{transition:all .2s ease}

/* CF Turnstile */
.cf-turnstile { border-radius:7px; overflow:hidden }
@keyframes toastIn { from{opacity:0;transform:translateX(14px)} to{opacity:1;transform:none} }

/* ─────────────────────── RESPONSIVE ─────────────────────── */
@media(max-width:1100px){ :root{--sb-w:232px} }
@media(max-width:900px){
  :root{--sb-w:212px}
  .inp-model{max-width:135px}
  .theme-picker-btn{display:none}
  .proj-badge-hdr{max-width:100px}
}
@media(max-width:768px){
  #app{
    display:flex!important; flex-direction:column;
    height:100vh; height:100dvh;
    grid-template-columns:none!important; overflow:hidden;
  }
  #app.sb-hidden #sb{display:none}
  #sb{
    width:100%!important; border-right:none; border-bottom:1px solid var(--b);
    flex-shrink:0; max-height:46vh; overflow-y:auto;
  }
  .convs,.sb-footer,.sec-lbl{ display:none }
  .creds{ margin:5px 10px; padding:7px 11px }
  .cred-v{ font-size:16px }
  .sb-btn-group{
    flex-direction:row; overflow-x:auto; gap:5px;
    padding:5px 10px 6px; -webkit-overflow-scrolling:touch; scrollbar-width:none;
  }
  .sb-btn-group::-webkit-scrollbar{ display:none }
  .btn-nc,.help-btn,.inbox-btn{ width:auto; flex-shrink:0; padding:0 10px; height:30px; font-size:10px }
  #chat{ flex:1; min-height:0 }
  .mb-wrap{ max-width:92% }
  .bubble{ font-size:12px; padding:8px 11px }
  .inp-area{ padding:7px 10px }
  #inp{ font-size:12px; padding:9px 11px; min-height:40px }
  .inp-bar{ flex-wrap:wrap; gap:4px; padding:0 8px; height:auto; min-height:46px }
  .inp-l{ order:1; flex:1; min-width:0 }
  .btn-send,.btn-cancel{ order:2; flex-shrink:0 }
  .inp-model{ max-width:130px }
  .theme-picker-btn{ display:none }
  .chat-hdr{ padding:7px 11px; gap:7px }
  .chat-title{ font-size:10px }
  .proj-badge-hdr{ display:none }
  .chat-tabs{ padding:4px 9px; gap:3px }
  .tab-btn{ padding:0 11px; font-size:9px; height:26px }
  .gui-toolbar{ overflow-x:auto; flex-wrap:nowrap; padding:5px 9px; -webkit-overflow-scrolling:touch; scrollbar-width:none }
  .gui-toolbar::-webkit-scrollbar{ display:none }
  .gui-layers{ display:none }
  .gui-props{ width:165px }
  .collapse-sb{ display:none }
  .modal{ padding:17px; border-radius:12px }
  .modal-t{ font-size:12px }
  .suggs{ grid-template-columns:1fr }
  .wt{ font-size:19px }
}
@media(max-width:550px){
  .btn-nc,.help-btn,.inbox-btn{ font-size:9px; padding:0 8px; height:28px }
  .inp-model{ max-width:110px }
  .chat-title{ font-size:9px }
  .inp-bar{ flex-wrap:wrap }
  .inp-l{ width:100%; order:1 }
  .btn-send,.btn-cancel{ order:2 }
  .wt{ font-size:17px }
  .ws{ font-size:11px }
}
@media(max-width:390px){
  .btn-nc,.help-btn,.inbox-btn{ font-size:9px; padding:0 8px; height:28px }
  .inp-model{ max-width:100px }
  .modal{ padding:13px }
}
`

export default function ChatsPage() {
  useEffect(() => {
    document.title = 'NEXUS AI — Roblox Dev Intelligence'
    const ph = { h: document.documentElement.style.height, o: document.documentElement.style.overflow }
    document.documentElement.style.height = '100%'
    document.documentElement.style.overflow = 'hidden'
    document.body.style.height = '100%'
    document.body.style.overflow = 'hidden'

    const addLink = (href: string) => {
      if (document.querySelector(`link[href="${href}"]`)) return null
      const el = document.createElement('link')
      el.rel = 'stylesheet'; el.href = href
      document.head.appendChild(el); return el
    }
    const l1 = addLink('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500;700&display=swap')
    const l2 = addLink('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css')

    const loadScript = (src: string, attrs: Record<string, string> = {}): Promise<void> =>
      new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
        const s = document.createElement('script'); s.src = src
        for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v)
        s.onload = () => resolve()
        s.onerror = () => reject(new Error(`Failed: ${src}`))
        document.head.appendChild(s)
      })

    ;(async () => {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/marked/marked.min.js')
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js')
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/lua.min.js')
        void loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', { async:'true', defer:'true' })
        await loadScript('/js/system_prompt.js')
        await loadScript('/js/chats.js')
      } catch (err) { console.error('[NEXUS] Script load error:', err) }
    })()

    return () => {
      document.documentElement.style.height = ph.h
      document.documentElement.style.overflow = ph.o
      document.body.style.height = ''; document.body.style.overflow = ''
      l1?.remove(); l2?.remove()
    }
  }, [])

  type WF = (...a: unknown[]) => void
  const win = (fn: string) => (window as unknown as Record<string, WF>)[fn]
  const call = (fn: string, ...args: unknown[]): React.MouseEventHandler =>
    () => win(fn)?.(...args)
  const gradErr = (col = 'linear-gradient(135deg,#00e5ff,#8800ff)'): React.ReactEventHandler<HTMLImageElement> =>
    (e) => { const t = e.currentTarget; if (t.parentElement) t.parentElement.style.background = col; t.style.display = 'none' }

  /* ── GUI element type definitions ── */
  const GUI_TYPES = [
    { type:'Frame', label:'Frame', icon:<rect x="3" y="3" width="18" height="18" rx="2"/> },
    { type:'TextLabel', label:'Label', icon:<><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></> },
    { type:'TextButton', label:'Button', icon:<rect x="2" y="7" width="20" height="10" rx="3"/> },
    { type:'TextBox', label:'Input', icon:<><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="12" x2="17" y2="12"/></> },
    { type:'ImageLabel', label:'Image', icon:<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></> },
    { type:'ScrollingFrame', label:'Scroll', icon:<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></> },
  ] as const

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* ── PAGE LOADER ── */}
      <div id="pageLoader">
        <div className="pl-ring">
          <div className="pl-logo">
            <img src="/nexusai.png" alt="" onError={gradErr()} />
          </div>
        </div>
        <div className="pl-brand">
          <div className="pl-title">NEXUS AI</div>
          <div className="pl-sub">Roblox Dev Intelligence</div>
        </div>
        <div className="pl-bar-wrap"><div className="pl-bar" id="plBar" /></div>
        <div className="pl-txt" id="plTxt">Initializing...</div>
      </div>

      {/* ── MENTION DROPDOWN ── */}
      <div className="mention-dd" id="mentionDD">
        <div className="mention-hdr">
          <svg viewBox="0 0 24 24" width={10} height={10} stroke="currentColor" fill="none" strokeWidth={2}>
            <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/>
          </svg>
          <span id="mentionHdrTxt">Scripts &amp; Objects</span>
        </div>
        <div id="mentionList" />
      </div>

      {/* ── APP ── */}
      <div id="app" className="hidden">

        {/* ════════════ SIDEBAR ════════════ */}
        <div id="sb">
          {/* Head */}
          <div className="sb-head">
            <div className="sb-logo">
              <img src="/nexusai.png" alt="N" onError={gradErr()} />
            </div>
            <div>
              <div className="sb-logo-text">NEXUS AI</div>
              <div className="sb-logo-sub">ROBLOX DEV</div>
            </div>
          </div>

          {/* User */}
          <div className="sb-user">
            <img className="sb-av" id="sbAv" src="/nexusai.png" alt=""
              onError={(e) => { e.currentTarget.style.opacity='.3' }}
              onClick={call('openAvatarModal')} />
            <div style={{minWidth:0,flex:1}}>
              <div className="sb-un" id="sbUn">-</div>
              <div className="sb-role" id="sbRole">Roblox Developer</div>
            </div>
            <button className="sb-gear" onClick={call('openSettings')} aria-label="Settings">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </button>
          </div>

          {/* Credits */}
          <div className="creds" id="credsEl" onClick={() => { window.location.href='/payment' }} role="button">
            <div>
              <div className="cred-l" id="credLabel">Credits</div>
              <div className="cred-buy" id="credHint">Click to buy more</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="cred-v" id="credDisp">30</div>
              <div className="cred-unit">CR</div>
            </div>
          </div>

          {/* Nav buttons */}
          <div className="sb-btn-group">
            <button className="btn-nc" onClick={() => { window.location.href='/dashboard' }}>
              <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span id="dashLbl">Dashboard</span>
            </button>
            <button className="btn-nc" onClick={call('newChat')}>
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span id="newChatLbl">New Chat</span>
            </button>
            <button className="help-btn" onClick={() => { window.location.href='/agent' }}>
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span id="helpBtnText">Need Help?</span>
            </button>
            <button className="inbox-btn" onClick={() => { window.location.href='/inbox' }}>
              <svg viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>
              <span id="inboxBtnText">Inbox</span>
              <span className="inbox-badge" id="inboxBadge">0</span>
            </button>
          </div>

          {/* Project chip */}
          <div className="proj-chip" id="sbProjChip" style={{display:'none'}}>
            <span id="sbProjName">-</span>
          </div>

          {/* Conversation list */}
          <div className="sec-lbl" id="recentLbl">
            Chat History
          </div>
          <div className="convs" id="convList">
            <div className="conv-empty" id="noConvLbl">
              <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              No conversations yet
            </div>
          </div>

          <div className="sb-footer">
            Made by <span style={{color:'var(--cyan)'}}>NEXUS STUDIO</span>
            <br/>YouTube · Discord · Roblox
          </div>

          <div className="collapse-sb" onClick={call('toggleSidebar')} id="collapseSbBtn" role="button">
            <svg id="collapseSbIcon" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          </div>
        </div>

        {/* ════════════ CHAT PANEL ════════════ */}
        <div id="chat">

          {/* Plugin banner */}
          <div className="plug-banner" id="plugBanner">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span id="plugBannerTxt">Plugin not connected —</span>
            <a onClick={call('showInstall')} id="plugInstallLink" style={{cursor:'pointer'}}>How to connect</a>
            <a onClick={call('retryStudio')} className="plug-reconnect" id="plugReconnectLink" style={{cursor:'pointer'}}>Reconnect</a>
          </div>

          {/* Header */}
          <div className="chat-hdr">
            <div className="chat-title" id="chatTitle">NEXUS AI</div>
            <div className="proj-badge-hdr" id="hdrProjBadge" style={{display:'none'}} />
            {/* Clear + Share buttons */}
            <button className="hdr-act" onClick={call('clearChat')} title="Clear chat">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
            <button className="hdr-act" onClick={call('openShareModal')} title="Share chat">
              <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
            <div className="status-badge off" id="studioBadge" onClick={call('retryStudio')}>
              <div className="sdot pulse" id="studioDot" />
              <span id="studioTxt">Studio: OFF</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="chat-tabs">
            <button className="tab-btn act" id="tabChat"
              onClick={(e) => win('switchTab')?.('chat', e.currentTarget)}>
              <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              <span id="tabChatLbl">Chat</span>
            </button>
            <button className="tab-btn" id="tabGui"
              onClick={(e) => win('switchTab')?.('gui', e.currentTarget)}>
              <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              <span id="tabGuiLbl">UI Editor</span>
            </button>
          </div>

          {/* ── Chat Tab ── */}
          <div id="chatTab" style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',minHeight:0}}>
            <div id="msgs">
              <div className="welcome" id="welcome">
                <div className="welcome-logo">
                  <img src="/nexusai.png" alt="" onError={(e) => {
                    if (e.currentTarget.parentElement)
                      e.currentTarget.parentElement.style.background='linear-gradient(135deg,#030312,#0a0b22)'
                  }} />
                </div>
                <div className="wt">NEXUS AI</div>
                <div className="ws" id="welcomeText">Smart Roblox AI — write Lua, debug scripts, build GUIs.</div>
                <div className="suggs" id="suggGrid" />
              </div>
            </div>

            {/* Input area */}
            <div className="inp-area" id="inpArea">
              <div className="attach-row" id="attachRow" />
              <div className="inp-box" id="inpBox">
                <textarea id="inp" placeholder="Ask NEXUS AI... (type @ to mention)" rows={1} />
                <div className="inp-bar">
                  <div className="inp-l">
                    {/* File attach */}
                    <div style={{position:'relative',flexShrink:0,display:'inline-flex'}}>
                      <label htmlFor="fi" className="ib" title="Attach file" role="button" tabIndex={0}>
                        <svg viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                      </label>
                      <input type="file" id="fi" accept="image/*,.lua,.txt,.json,.js,.py,.html,.css"
                        style={{position:'absolute',width:0,height:0,opacity:0,overflow:'hidden',pointerEvents:'none'}}
                        onChange={(e) => win('handleFile')?.(e)} multiple tabIndex={-1} />
                    </div>

                    {/* Model selector */}
                    <div className="inp-model" id="inpModelBtn"
                      onClick={(e) => win('toggleMDD')?.(e)} role="button" aria-label="Select model">
                      <img id="inpMIcon" src="" alt=""
                        onError={(e) => { e.currentTarget.style.display='none' }}
                        style={{width:14,height:14,borderRadius:3,flexShrink:0}} />
                      <span className="inp-model-name" id="inpMName">Gemini 3.5 Flash</span>
                      <span className="inp-model-badge" id="inpMBadge" style={{color:'var(--cyan)'}}>FAST</span>
                      <svg width={8} height={8} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={2} style={{color:'var(--dim)',flexShrink:0}}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>

                    {/* Theme picker */}
                    <button className="theme-picker-btn" id="themePickerBtn"
                      onClick={(e) => win('toggleThemeDD')?.(e)} title="Select Theme">
                      <div className="theme-swatch" id="themeSwatchBtn" style={{background:'#00e5ff'}} />
                      <span id="themePickerLabel">nexus_ai</span>
                      <svg width={8} height={8} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={2} style={{color:'var(--dim)'}}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                  </div>

                  <button className="btn-cancel hidden" id="cancelBtn" onClick={call('cancelGen')}>
                    <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                  <button className="btn-send" id="sendBtn" onClick={call('send')} aria-label="Send">
                    <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </div>
              </div>
              <div className="model-dd" id="mDD" />
              <div className="theme-dd" id="themeDD" />
            </div>
          </div>

          {/* ── GUI Editor Tab ── */}
          <div id="guiTab">
            <div className="gui-toolbar">
              <span style={{fontSize:10,color:'var(--dim)',flexShrink:0}} id="guiAddLabel">Add:</span>
              {GUI_TYPES.map(({type,label,icon}) => (
                <button key={type} className="gui-btn" onClick={call('addEl', type)}>
                  <svg viewBox="0 0 24 24">{icon}</svg>{label}
                </button>
              ))}
              <div style={{marginLeft:'auto',display:'flex',gap:5,alignItems:'center',flexWrap:'nowrap',flexShrink:0}}>
                {/* GUI Model */}
                <div className="inp-model" id="guiModelBtn"
                  onClick={(e) => win('toggleGuiMDD')?.(e)} style={{maxWidth:155}}>
                  <img id="guiMIcon" src="" alt="" onError={(e) => { e.currentTarget.style.display='none' }}
                    style={{width:14,height:14,borderRadius:3,flexShrink:0}} />
                  <span className="inp-model-name" id="guiMName">Gemini 3.5 Flash</span>
                  <span className="inp-model-badge" id="guiMBadge" style={{color:'var(--cyan)'}}>FAST</span>
                  <svg width={8} height={8} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={2} style={{color:'var(--dim)',flexShrink:0}}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
                <div className="model-dd" id="guiMDD" />

                <select id="guiThemeSelect" className="settings-select"
                  style={{fontSize:9,padding:'3px 7px',maxWidth:115}}
                  onChange={(e) => win('applyGuiTheme')?.(e.target.value)}>
                  <option value="">Theme...</option>
                  {['nexus_ai','aurora','candy','dark','default','midnight','studs'].map(t=>(
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="custom">custom</option>
                </select>

                <button className="gui-ai-btn" onClick={call('openGuiAIChat')}>
                  <svg viewBox="0 0 24 24"><path d="M9 18h6M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17H8v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/></svg>
                  <span id="guiAiBuildLbl">AI Build</span>
                </button>
                <button className="gui-btn" onClick={call('clearCanvas')}>
                  <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  <span id="guiClearLbl">Clear</span>
                </button>
                <button className="gui-gen-btn" onClick={call('generateGuiCode')}>
                  <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                  <span id="guiExportLbl">Export</span>
                </button>
                <button className="gui-gen-btn" onClick={call('sendGuiToPlace')}
                  style={{background:'linear-gradient(135deg,var(--green),var(--cyan))'}}>
                  <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  <span id="guiToPlaceText">Send to Place</span>
                </button>
              </div>
            </div>

            <div className="gui-main">
              <div className="gui-layers" id="guiLayers">
                <div className="gui-layer-title" id="guiLayerTitle">Layers</div>
                <div id="guiLayerList" />
              </div>
              <div className="gui-canvas">
                <div className="gui-canvas-inner" id="guiCanvasInner">
                  <div className="gui-empty-hint" id="guiEmpty">
                    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                    <div id="guiEmptyText">Add elements or click AI Build</div>
                  </div>
                </div>
                <div className="gui-loading" id="guiLoading">
                  <div style={{width:22,height:22,border:'2px solid rgba(0,229,255,.15)',borderTopColor:'var(--cyan)',borderRadius:'50%',animation:'spin .7s linear infinite'}} />
                  <span id="guiLoadingText">AI is building UI...</span>
                </div>
              </div>
              <div className="gui-props" id="guiProps">
                <div style={{fontSize:10,color:'var(--dim)',textAlign:'center',padding:'22px 0'}} id="guiPropsEmpty">Select element</div>
              </div>
            </div>
          </div>

        </div>{/* /chat */}
      </div>{/* /app */}

      {/* ════════════════════════ MODALS ════════════════════════ */}

      {/* Avatar */}
      <div className="ov" id="avatarModal">
        <div className="modal" style={{width:340,textAlign:'center',padding:'28px 24px'}}>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:14,color:'var(--cyan)',marginBottom:16}} id="avatarModalName">-</div>
          <div style={{position:'relative',width:120,height:120,margin:'0 auto 14px'}}>
            <div style={{position:'absolute',inset:-6,borderRadius:'50%',border:'1.5px solid rgba(0,229,255,.25)',animation:'plSpin 3s linear infinite'}} />
            <img id="avatarModalImg" src="" alt=""
              style={{width:120,height:120,borderRadius:'50%',border:'2px solid var(--cyan2)',objectFit:'cover',display:'block'}}
              onError={(e) => { e.currentTarget.src='/nexusai.png' }} />
          </div>
          <div id="settingsBadge" style={{marginBottom:8,display:'flex',justifyContent:'center'}} />
          <div style={{fontSize:11,color:'var(--dim)',marginBottom:3}} id="avatarModalRole">Developer</div>
          <div style={{fontSize:10,color:'var(--dim)'}} id="avatarModalId">-</div>
          <div className="modal-footer" style={{justifyContent:'center',marginTop:16}}>
            <button className="btn-modal primary" onClick={call('closeModal','avatarModal')} id="avatarCloseBtn">CLOSE</button>
          </div>
        </div>
      </div>

      {/* Install */}
      <div className="ov" id="installModal">
        <div className="modal">
          <div className="modal-t">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span id="installTitle">Install NEXUS AI Plugin</span>
          </div>
          <div className="modal-b">
            {[1,2,3,4,5].map(n => (
              <div className="install-step" key={n}>
                <div className="install-num">{n}</div>
                <div className="install-txt" id={`installStep${n}`}>Step {n}</div>
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button className="btn-modal primary" onClick={call('closeModal','installModal')} id="installCloseBtn">GOT IT</button>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="ov" id="settingsModal">
        <div className="modal" style={{width:530}}>
          <div className="modal-t">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            <span id="settingsTitle">Settings</span>
          </div>

          {/* Account */}
          <div className="settings-section">
            <div className="settings-title" id="settingsAccountTitle">Account</div>
            <div className="settings-row">
              <span style={{color:'white',fontWeight:700,fontSize:13}} id="settingsUsername">-</span>
              <span id="settingsBadge2" />
            </div>
            <div className="settings-row"><span id="settingsCreditsLabel">Credits</span><span id="settingsCredits" style={{color:'var(--yellow)',fontWeight:700,fontSize:13}}>-</span></div>
            <div className="settings-row"><span id="settingsPlanLabel">Plan</span><span id="settingsPlan" style={{color:'var(--green)'}}>Free</span></div>
            <div className="settings-row"><span id="settingsRobloxIdLabel">Roblox ID</span><span id="settingsRobloxId" style={{color:'var(--dim)',fontSize:10}}>-</span></div>
          </div>

          {/* Daily */}
          <div className="settings-section">
            <div className="settings-title" id="dailyCreditsTitle">Daily Credits</div>
            <div className="settings-row"><span id="freePlanLabel">Free Plan</span><span style={{color:'var(--green)'}}>+2 CR / day</span></div>
            <div className="settings-row"><span id="proPlanLabel">Pro Plan</span><span style={{color:'var(--cyan)'}}>+25 CR / day</span></div>
            <div className="settings-row">
              <span id="lastClaimInfo" style={{fontSize:10,color:'var(--dim)'}} />
              <button className="settings-btn" id="claimDailyBtn" onClick={call('claimDaily')}>Claim Daily</button>
            </div>
          </div>

          {/* Play test */}
          <div className="settings-section">
            <div className="settings-title" id="playTestTitle">Auto Play Test</div>
            <div className="settings-row">
              <div>
                <div id="playTestLabel">Run play_test after inject</div>
                <div className="settings-hint" id="playTestHint">Disable if PC crashes during play_test</div>
              </div>
              <button className="toggle-sw on" id="playTestToggle" onClick={call('togglePlayTest')} />
            </div>
            <div className="settings-row">
              <span id="playTestDurLabel">Duration (seconds)</span>
              <input type="number" id="playTestDurInput" className="settings-select"
                style={{width:75}} min={5} max={120} defaultValue={15}
                onChange={(e) => win('setPlayTestDur')?.(e.target.value)} />
            </div>
          </div>

          {/* Language */}
          <div className="settings-section">
            <div className="settings-title" id="langTitle">Language</div>
            <div className="settings-row">
              <span id="langLabel">Interface &amp; AI Language</span>
              <select className="settings-select" id="langSelector"
                onChange={(e) => win('changeLang')?.(e.target.value)}>
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {/* Report */}
          <div className="settings-section">
            <div className="settings-title" id="reportTitle">Report Issue</div>
            <textarea className="report-ta" id="reportTa" placeholder="Describe the issue in detail..." />
            <div id="cf-turnstile-wrap" style={{marginTop:9,minHeight:65,display:'none'}}>
              <div id="cf-turnstile-report" style={{transform:'scale(0.85)',transformOrigin:'left'}} />
            </div>
            <div style={{marginTop:9,display:'flex',alignItems:'center',gap:9}}>
              <button className="settings-btn" onClick={call('sendReport')} id="reportBtn">Send Report</button>
              <span id="reportStatus" style={{fontSize:10,color:'var(--green)'}} />
            </div>
          </div>

          {/* Admin */}
          <div className="settings-section" id="adminSection" style={{display:'none'}}>
            <div className="settings-title">Admin Panel</div>
            <div style={{marginTop:7}}>
              <a href="/admin-panel" className="settings-btn" style={{textDecoration:'none',display:'inline-flex'}}>Open Admin Panel</a>
            </div>
          </div>

          {/* Redeem */}
          <div className="settings-section">
            <div className="settings-title" id="redeemTitle">Redeem Code</div>
            <div className="settings-row" style={{flexDirection:'column',alignItems:'flex-start',gap:7}}>
              <div style={{fontSize:10,color:'var(--dim)'}} id="redeemHint">Get codes on Discord</div>
              <div style={{display:'flex',gap:9,width:'100%'}}>
                <input type="text" id="redeemInput" className="settings-select"
                  style={{flex:1,padding:'6px 11px'}} placeholder="Enter code (e.g. NEXUS-XXXX)..." />
                <button className="settings-btn" onClick={call('redeemCode')} id="redeemBtn">Redeem</button>
              </div>
              <span id="redeemStatus" style={{fontSize:10,color:'var(--green)'}} />
            </div>
          </div>

          {/* Download */}
          <div className="settings-section">
            <div className="settings-title" id="downloadTitle">Download Plugin</div>
            <div className="settings-row" style={{flexDirection:'column',gap:6,alignItems:'flex-start'}}>
              <div style={{fontSize:10,color:'var(--dim)'}} id="downloadHint">Install NEXUS AI Plugin in Roblox Studio</div>
              <button className="settings-btn" id="downloadPluginBtn"
                onClick={() => window.open('https://create.roblox.com/store/asset/91870814099475/NEXUS-AI','_blank')}>
                <svg width={11} height={11} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={2}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download from Creator Store
              </button>
            </div>
          </div>

          {/* Logout */}
          <div className="settings-section">
            <div className="settings-title" id="accountTitle">Session</div>
            <div className="settings-row">
              <span id="logoutLabel">Logout from NEXUS AI</span>
              <button className="settings-btn danger" onClick={call('logout')}>Logout</button>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn-modal primary" onClick={call('closeModal','settingsModal')} id="settingsCloseBtn">CLOSE</button>
          </div>
        </div>
      </div>

      {/* GUI Code Export */}
      <div className="ov" id="guiCodeModal">
        <div className="modal" style={{width:660}}>
          <div className="modal-t">
            <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            <span id="guiCodeTitle">Generated GUI Script</span>
          </div>
          <div className="modal-b">
            <pre id="guiCodeOutput" style={{
              maxHeight:400, overflowY:'auto', whiteSpace:'pre-wrap', wordBreak:'break-all',
              fontSize:10.5, color:'var(--text)', background:'rgba(0,0,0,.5)',
              padding:14, borderRadius:8, border:'1px solid var(--b)',
            }} />
          </div>
          <div className="modal-footer">
            <button className="btn-modal primary" onClick={call('copyGuiCode')} id="guiCodeCopyBtn">Copy</button>
            <button className="btn-modal secondary" onClick={call('downloadGuiCode')} id="guiCodeDlBtn">Download .lua</button>
            <button className="btn-modal secondary" onClick={call('closeModal','guiCodeModal')} id="guiCodeCloseBtn">Close</button>
          </div>
        </div>
      </div>

      {/* GUI AI Build */}
      <div className="ov" id="guiAIChatModal">
        <div className="modal" style={{width:520}}>
          <div className="modal-t">
            <svg viewBox="0 0 24 24"><path d="M9 18h6M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17H8v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/></svg>
            <span id="guiAiTitle">AI UI Builder</span>
          </div>
          <div className="modal-b" style={{marginBottom:9}}>
            <p style={{marginBottom:9,fontSize:11,color:'var(--text2)'}} id="guiAiDesc">Describe the UI you want:</p>
            <select id="guiAiThemeSelect" className="settings-select" style={{width:'100%',marginBottom:9,fontSize:10}}>
              {['nexus_ai','aurora','candy','dark','default','midnight','studs'].map(t=>(
                <option key={t} value={t}>Theme: {t}</option>
              ))}
              <option value="custom">Custom (No Theme)</option>
            </select>
            <textarea id="guiAIPrompt" style={{
              width:'100%', background:'var(--bg3)', border:'1px solid var(--b)',
              borderRadius:8, padding:11, color:'white',
              fontFamily:"'JetBrains Mono',monospace", fontSize:12,
              outline:'none', resize:'vertical', minHeight:100, transition:'.15s',
            }} placeholder="e.g. Shop GUI with 3 item cards, coin display, buy button with animations..." />
          </div>
          <div className="modal-footer">
            <button className="btn-modal primary" onClick={call('generateGuiFromAI')} id="guiAiBuildBtn">Build with AI</button>
            <button className="btn-modal secondary" onClick={call('closeModal','guiAIChatModal')} id="guiAiCancelBtn">Cancel</button>
          </div>
        </div>
      </div>

      {/* Code Preview */}
      <div className="ov" id="codePreviewModal">
        <div className="modal" style={{width:720}}>
          <div className="modal-t">
            <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            <span id="codePreviewTitle">Script Preview</span>
            <span style={{marginLeft:'auto',fontSize:9,color:'var(--dim)',fontFamily:'monospace'}} id="codePreviewPath" />
          </div>
          <div className="modal-b" style={{margin:0}}>
            <div className="code-block-wrap" style={{margin:0}}>
              <div className="code-lang-bar">
                <span>Lua</span>
                <div className="code-btns">
                  <button className="cbtn" onClick={call('copyPreviewCode')}>
                    <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    Copy
                  </button>
                </div>
              </div>
              <pre style={{maxHeight:460,overflowY:'auto',margin:0}}>
                <code id="codePreviewCode" className="language-lua"
                  style={{fontSize:11,lineHeight:1.55,padding:15,display:'block'}} />
              </pre>
            </div>
          </div>
          <div className="modal-footer" style={{marginTop:13}}>
            <button className="btn-modal secondary" onClick={call('closeModal','codePreviewModal')} id="codePreviewCloseBtn">Close</button>
          </div>
        </div>
      </div>

      {/* Share */}
      <div className="ov" id="shareModal">
        <div className="modal" style={{width:540}}>
          <div className="modal-t">
            <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            <span id="shareModalTitle">Share Chat</span>
          </div>
          <div className="modal-b" style={{marginBottom:9}}>
            <p style={{fontSize:11,color:'var(--text2)',marginBottom:7}} id="shareModalDesc">Copy conversation text:</p>
            <textarea className="share-modal-ta" id="shareModalTa" readOnly />
          </div>
          <div className="modal-footer">
            <button className="btn-modal primary" onClick={call('copyShareText')} id="shareModalCopyBtn">Copy Text</button>
            <button className="btn-modal secondary" onClick={call('closeModal','shareModal')} id="shareModalCloseBtn">Close</button>
          </div>
        </div>
      </div>

    </>
  )
}