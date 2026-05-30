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

/* ─────────────────────────────────────────────────────────────────────────────
   CSS
───────────────────────────────────────────────────────────────────────────── */
const PAGE_CSS = `
:root{
  --bg:#030312;--bg2:#06071a;--bg3:#0a0b22;--bg4:#0d0e28;
  --cyan:#00e5ff;--purple:#8800ff;--pink:#ff2d6b;
  --green:#00ffaa;--yellow:#ffd600;--orange:#ff8c00;
  --text:#b8cfff;--dim:#3a4a7a;--dim2:#5a6a9a;
  --b:rgba(0,229,255,.10);--bb:rgba(0,229,255,.25);--r:12px;
  --shadow:0 8px 32px rgba(0,0,0,.5);
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
html{scroll-behavior:smooth;height:100%;}
body{
  font-family:"JetBrains Mono",monospace;
  background:var(--bg);color:var(--text);
  min-height:100vh;overflow-x:hidden;
  /* FIXED: allow body to scroll normally */
  overflow-y:auto;
}
body::before{
  content:"";position:fixed;inset:0;
  background:
    radial-gradient(ellipse at 75% -10%,rgba(136,0,255,.18) 0%,transparent 50%),
    radial-gradient(ellipse at -5% 90%,rgba(0,229,255,.08) 0%,transparent 45%),
    radial-gradient(ellipse at 50% 50%,rgba(0,229,255,.02) 0%,transparent 70%),
    linear-gradient(rgba(0,229,255,.004) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,229,255,.004) 1px,transparent 1px);
  background-size:auto,auto,auto,44px 44px,44px 44px;
  pointer-events:none;z-index:0;
}

/* ── ANIMATIONS ── */
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}
@keyframes toastIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes glow-border{0%,100%{border-color:rgba(0,229,255,.15)}50%{border-color:rgba(0,229,255,.4)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}

/* ── SCROLLBAR ── */
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-thumb{background:var(--b);border-radius:4px}
::-webkit-scrollbar-track{background:transparent}

/* ── LOADER ── */
#dash-loader{
  position:fixed;inset:0;background:var(--bg);z-index:9999;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:20px;transition:opacity .45s ease;
}
#dash-loader.hide{opacity:0;pointer-events:none;}
.loader-logo{font-family:"Orbitron",sans-serif;font-size:26px;font-weight:900;background:linear-gradient(135deg,var(--cyan),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:4px;}
.loader-ring{width:48px;height:48px;border-radius:50%;border:2px solid rgba(0,229,255,.08);border-top-color:var(--cyan);animation:spin .9s linear infinite;}
.loader-sub{font-size:9px;color:var(--dim);letter-spacing:2.5px;text-transform:uppercase;}
.loader-progress{width:160px;height:2px;background:rgba(0,229,255,.08);border-radius:2px;overflow:hidden;}
.loader-progress-bar{height:100%;width:0%;background:linear-gradient(90deg,var(--cyan),var(--purple));border-radius:2px;transition:width .3s ease;}

/* ── OFFLINE BANNER ── */
#offlineBanner{
  position:fixed;top:0;left:0;right:0;z-index:9998;
  background:rgba(255,140,0,.12);border-bottom:1px solid rgba(255,140,0,.3);
  padding:7px 20px;display:none;align-items:center;justify-content:center;
  gap:8px;font-size:10px;color:var(--orange);
}
#offlineBanner.show{display:flex;}
#offlineBanner svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0;}
.retry-btn-offline{padding:3px 10px;border-radius:5px;border:1px solid rgba(255,140,0,.4);background:rgba(255,140,0,.1);color:var(--orange);font-size:9px;cursor:pointer;font-family:"JetBrains Mono",monospace;transition:.15s;margin-left:8px;}
.retry-btn-offline:hover{background:rgba(255,140,0,.2);}

/* ── SYNC BAR ── */
#syncBar{position:fixed;bottom:0;left:0;right:0;z-index:300;height:2px;background:transparent;transition:.3s;}
#syncBar.syncing{background:linear-gradient(90deg,transparent,var(--cyan),var(--purple),transparent);background-size:200% 100%;animation:shimmer 1.5s linear infinite;}
#syncBar.error{background:var(--pink);}
#syncBar.ok{background:var(--green);animation:none;}

/* ── NAV ── */
.dnav{
  position:sticky;top:0;z-index:200;
  display:flex;align-items:center;justify-content:space-between;
  padding:0 32px;height:58px;
  background:rgba(3,3,18,.95);border-bottom:1px solid var(--b);
  backdrop-filter:blur(28px);
}
.dnav-logo{
  font-family:"Orbitron",sans-serif;font-size:14px;font-weight:900;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  text-decoration:none;letter-spacing:2.5px;
  display:flex;align-items:center;gap:10px;
  cursor:pointer;
}
.dnav-logo-icon{width:30px;height:30px;border-radius:8px;overflow:hidden;border:1px solid var(--b);flex-shrink:0;box-shadow:0 0 12px rgba(0,229,255,.15);}
.dnav-logo-icon img{width:100%;height:100%;object-fit:cover;display:block;}
.dnav-right{display:flex;align-items:center;gap:10px;}
.nav-credits-link{
  display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:22px;
  background:rgba(255,214,0,.05);border:1px solid rgba(255,214,0,.2);
  font-size:11px;color:var(--yellow);font-weight:600;cursor:pointer;
  transition:.2s;text-decoration:none;
}
.nav-credits-link:hover{border-color:rgba(255,214,0,.45);background:rgba(255,214,0,.1);transform:translateY(-1px);}
.nav-credits-link svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2.2;}

/* ── USER PILL ── */
.user-pill-wrap{position:relative;}
.user-pill{display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 12px 4px 4px;border-radius:24px;border:1px solid var(--b);background:var(--bg2);transition:.2s;user-select:none;}
.user-pill:hover{border-color:var(--bb);background:var(--bg3);}
.user-pill.open{border-color:rgba(0,229,255,.35);}
.user-av-sm{width:30px;height:30px;border-radius:50%;border:1.5px solid rgba(0,229,255,.35);object-fit:cover;background:var(--bg3);flex-shrink:0;}
.user-name-nav{font-size:11px;color:var(--text);font-weight:500;}
.user-caret{width:11px;height:11px;stroke:var(--dim);fill:none;stroke-width:2.2;transition:.2s;flex-shrink:0;}
.user-pill.open .user-caret{transform:rotate(180deg);stroke:var(--cyan);}

/* ── DROPDOWN ── */
.user-dd{
  position:absolute;top:calc(100% + 8px);right:0;width:256px;
  background:var(--bg2);border:1px solid var(--b);border-radius:14px;
  box-shadow:0 24px 64px rgba(0,0,0,.95),0 0 0 1px rgba(0,229,255,.05);
  z-index:9999;display:none;overflow:hidden;animation:fadeIn .16s ease;
}
.user-dd.open{display:block;}
.ud-hdr{padding:16px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:12px;background:rgba(0,229,255,.02);}
.ud-av{width:44px;height:44px;border-radius:50%;border:2px solid rgba(0,229,255,.3);object-fit:cover;flex-shrink:0;}
.ud-name{font-size:12.5px;color:white;font-weight:600;margin-bottom:2px;}
.ud-role{font-size:9px;color:var(--dim2);letter-spacing:.5px;}
.ud-section{padding:4px 0;}
.ud-item{display:flex;align-items:center;gap:10px;padding:9px 16px;cursor:pointer;font-size:11px;color:var(--text);text-decoration:none;transition:.12s;}
.ud-item:hover{background:rgba(0,229,255,.05);color:var(--cyan);}
.ud-item svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0;opacity:.55;transition:.12s;}
.ud-item:hover svg{opacity:1;}
.ud-badge{margin-left:auto;font-size:8.5px;font-weight:700;padding:2px 8px;border-radius:8px;background:rgba(0,229,255,.1);color:var(--cyan);border:1px solid rgba(0,229,255,.15);}
.ud-item.danger{color:rgba(255,45,107,.7);}
.ud-item.danger:hover{background:rgba(255,45,107,.07);color:var(--pink);}
.ud-divider{height:1px;background:var(--b);}

/* ── MAIN ── */
.dash-main{max-width:1080px;margin:0 auto;padding:44px 24px 80px;position:relative;z-index:1;}

/* ── PAGE HEADER ── */
.page-header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:36px;flex-wrap:wrap;}
.header-left{display:flex;align-items:center;gap:18px;}
.header-av-wrap{width:64px;height:64px;border-radius:16px;background:var(--bg2);border:1px solid var(--b);overflow:hidden;flex-shrink:0;box-shadow:0 0 32px rgba(0,229,255,.1),var(--shadow);}
.header-av-wrap img{width:100%;height:100%;object-fit:cover;display:block;}
.header-info h1{font-family:"Orbitron",sans-serif;font-size:23px;font-weight:900;color:#fff;margin-bottom:5px;line-height:1.2;}
.header-info h1 span{background:linear-gradient(135deg,var(--cyan),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.header-info p{color:var(--dim2);font-size:10.5px;letter-spacing:.3px;}
.plan-badge{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;border-radius:22px;font-size:9px;font-weight:700;font-family:"Orbitron",sans-serif;letter-spacing:1.5px;cursor:pointer;transition:.2s;border:1px solid rgba(0,255,170,.22);background:rgba(0,255,170,.05);color:var(--green);text-decoration:none;}
.plan-badge.pro{border-color:rgba(0,229,255,.28);background:rgba(0,229,255,.05);color:var(--cyan);}
.plan-badge.owner{border-color:rgba(255,214,0,.28);background:rgba(255,214,0,.05);color:var(--yellow);}
.plan-badge svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;}
.plan-badge:hover{filter:brightness(1.2);transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,0,0,.3);}

/* ── STATS ── */
.stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:32px;}
.stat-card{background:var(--bg2);border:1px solid var(--b);border-radius:var(--r);padding:20px;display:flex;align-items:center;gap:14px;transition:.22s;cursor:default;position:relative;overflow:hidden;}
.stat-card::before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(0,229,255,.02),transparent);opacity:0;transition:.22s;}
.stat-card:hover{border-color:rgba(0,229,255,.22);transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,.35);}
.stat-card:hover::before{opacity:1;}
.stat-icon{width:44px;height:44px;border-radius:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
.stat-icon svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:1.8;}
.stat-icon.yellow{background:rgba(255,214,0,.07);border:1px solid rgba(255,214,0,.13);color:var(--yellow);}
.stat-icon.cyan{background:rgba(0,229,255,.07);border:1px solid rgba(0,229,255,.11);color:var(--cyan);}
.stat-icon.green{background:rgba(0,255,170,.07);border:1px solid rgba(0,255,170,.11);color:var(--green);}
.stat-val{font-family:"Orbitron",sans-serif;font-size:22px;font-weight:700;color:#fff;line-height:1;margin-bottom:4px;}
.stat-lbl{font-size:9.5px;color:var(--dim2);letter-spacing:.3px;}

/* ── CREATE CARD ── */
.create-card{position:relative;overflow:hidden;background:var(--bg2);border:1px solid var(--b);border-radius:14px;padding:26px 28px 24px;margin-bottom:36px;box-shadow:var(--shadow);}
.create-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent 3%,var(--cyan) 35%,var(--purple) 65%,transparent 97%);}
.create-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;gap:10px;flex-wrap:wrap;}
.card-title{font-family:"Orbitron",sans-serif;font-size:11px;font-weight:700;color:var(--cyan);display:flex;align-items:center;gap:8px;}
.card-title svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5;}
.limit-badge{font-size:10px;color:var(--dim2);background:rgba(0,0,0,.35);border:1px solid var(--b);padding:5px 13px;border-radius:20px;display:flex;align-items:center;gap:5px;}
.limit-badge .used{color:var(--cyan);font-weight:700;}
.limit-badge .sep{opacity:.25;}
.input-row{display:flex;gap:10px;align-items:stretch;}
.project-input{flex:1;background:rgba(0,0,0,.45);border:1px solid var(--b);border-radius:10px;padding:13px 18px;color:#fff;font-family:"JetBrains Mono",monospace;font-size:13px;outline:none;transition:.22s;min-width:0;}
.project-input:focus{border-color:rgba(0,229,255,.4);box-shadow:0 0 0 3px rgba(0,229,255,.06),inset 0 0 0 1px rgba(0,229,255,.08);}
.project-input::placeholder{color:var(--dim);}
.project-input:disabled{opacity:.3;cursor:not-allowed;}
.btn-create{background:linear-gradient(135deg,var(--cyan),var(--purple));color:#030312;border:none;border-radius:10px;padding:0 24px;height:48px;flex-shrink:0;font-family:"Orbitron",sans-serif;font-size:10px;font-weight:900;cursor:pointer;transition:.22s;letter-spacing:.5px;display:flex;align-items:center;gap:8px;white-space:nowrap;position:relative;overflow:hidden;}
.btn-create:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 28px rgba(0,229,255,.3);}
.btn-create:disabled{opacity:.28;cursor:not-allowed;}
.btn-create svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2.5;}
.btn-spinner{display:none;width:14px;height:14px;border:2px solid rgba(3,3,18,.2);border-top-color:#030312;border-radius:50%;animation:spin .7s linear infinite;}
.btn-create.loading .btn-spinner{display:block;}
.btn-create.loading .btn-lbl{display:none;}
.save-status{margin-top:10px;font-size:10px;display:none;align-items:center;gap:6px;}
.save-status.saving{display:flex;color:var(--yellow);}
.save-status.saved{display:flex;color:var(--green);}
.save-status.error{display:flex;color:var(--pink);}
.save-status.retry{display:flex;color:var(--orange);}
.save-status svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0;}
.queue-notice{display:none;align-items:center;gap:10px;background:rgba(255,140,0,.04);border:1px solid rgba(255,140,0,.18);border-radius:10px;padding:11px 15px;margin-top:12px;}
.queue-notice.show{display:flex;}
.queue-notice svg{width:13px;height:13px;stroke:var(--orange);fill:none;stroke-width:2;flex-shrink:0;}
.queue-notice p{font-size:10px;color:rgba(255,140,0,.85);flex:1;}
.queue-notice button{padding:3px 10px;border-radius:5px;border:1px solid rgba(255,140,0,.3);background:rgba(255,140,0,.08);color:var(--orange);font-size:9px;cursor:pointer;font-family:"JetBrains Mono",monospace;white-space:nowrap;}
.must-notice{display:flex;align-items:flex-start;gap:12px;background:rgba(0,229,255,.03);border:1px solid rgba(0,229,255,.1);border-radius:10px;padding:13px 16px;margin-top:16px;}
.must-notice svg{width:14px;height:14px;stroke:var(--cyan);fill:none;stroke-width:2;flex-shrink:0;margin-top:1px;opacity:.8;}
.must-notice p{font-size:10.5px;color:var(--dim2);line-height:1.75;}
.must-notice strong{color:var(--cyan);}

/* ── SEARCH ── */
.search-row{display:flex;align-items:center;gap:10px;margin-bottom:18px;}
.search-wrap{flex:1;position:relative;}
.search-wrap svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:13px;height:13px;stroke:var(--dim);fill:none;stroke-width:2;pointer-events:none;}
.search-input{width:100%;background:var(--bg2);border:1px solid var(--b);border-radius:9px;padding:9px 12px 9px 34px;color:var(--text);font-family:"JetBrains Mono",monospace;font-size:11px;outline:none;transition:.2s;}
.search-input:focus{border-color:rgba(0,229,255,.3);box-shadow:0 0 0 2px rgba(0,229,255,.04);}
.search-input::placeholder{color:var(--dim);}
.sort-select{background:var(--bg2);border:1px solid var(--b);border-radius:9px;padding:9px 12px;color:var(--text);font-family:"JetBrains Mono",monospace;font-size:10px;outline:none;cursor:pointer;transition:.2s;}
.sort-select:focus{border-color:rgba(0,229,255,.3);}

/* ── SECTION HEADER ── */
.section-header{display:flex;align-items:center;gap:12px;margin-bottom:16px;}
.section-header h2{font-family:"Orbitron",sans-serif;font-size:9px;color:var(--dim2);text-transform:uppercase;letter-spacing:2.5px;white-space:nowrap;}
.section-line{flex:1;height:1px;background:var(--b);}
.section-count{font-size:9px;color:var(--dim2);padding:2px 10px;background:rgba(0,0,0,.35);border:1px solid var(--b);border-radius:10px;flex-shrink:0;}

/* ── PROJECTS GRID ── */
.projects-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(295px,1fr));gap:16px;}

/* ── PROJECT CARD ── */
.project-card{background:var(--bg2);border:1px solid var(--b);border-radius:14px;padding:20px 20px 52px;transition:.22s;cursor:pointer;position:relative;overflow:hidden;display:flex;flex-direction:column;animation:slideUp .3s ease both;}
.project-card::after{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(0,229,255,.04),transparent 55%);opacity:0;transition:.22s;pointer-events:none;}
.project-card:hover{transform:translateY(-3px);border-color:rgba(0,229,255,.28);box-shadow:0 12px 36px rgba(0,0,0,.4),0 0 0 1px rgba(0,229,255,.05);}
.project-card:hover::after{opacity:1;}
.project-card.pending-save{border-color:rgba(255,140,0,.25);animation:glow-border 2s ease infinite;}
.project-card-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;gap:8px;}
.project-icon{width:42px;height:42px;border-radius:11px;flex-shrink:0;background:linear-gradient(135deg,rgba(0,229,255,.08),rgba(136,0,255,.08));border:1px solid var(--b);display:flex;align-items:center;justify-content:center;}
.project-icon svg{width:18px;height:18px;stroke:var(--cyan);fill:none;stroke-width:1.8;}
.project-top-right{display:flex;align-items:center;gap:6px;}
.project-id-tag{font-size:8px;color:var(--dim);background:rgba(0,0,0,.45);padding:3px 8px;border-radius:5px;border:1px solid rgba(255,255,255,.04);max-width:108px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:help;}
.btn-del{width:28px;height:28px;border-radius:7px;flex-shrink:0;background:rgba(255,45,107,.05);border:1px solid rgba(255,45,107,.15);color:rgba(255,45,107,.35);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.18s;z-index:5;}
.btn-del:hover{background:rgba(255,45,107,.16);border-color:var(--pink);color:var(--pink);transform:scale(1.1);}
.btn-del svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2.2;}
.project-name{font-family:"Orbitron",sans-serif;font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.project-desc{font-size:9.5px;color:var(--dim2);line-height:1.7;flex:1;}
.project-meta{display:flex;align-items:center;justify-content:space-between;padding:10px 20px;position:absolute;bottom:0;left:0;right:0;border-top:1px solid rgba(255,255,255,.04);background:rgba(6,7,26,.7);backdrop-filter:blur(8px);}
.meta-date{font-size:9px;color:var(--dim);display:flex;align-items:center;gap:4px;}
.meta-date svg{width:9px;height:9px;stroke:currentColor;fill:none;stroke-width:2;opacity:.4;}
.meta-status{font-size:8.5px;color:var(--green);background:rgba(0,255,170,.06);border:1px solid rgba(0,255,170,.18);padding:3px 9px;border-radius:10px;display:flex;align-items:center;gap:4px;}
.meta-status.pending{color:var(--orange);background:rgba(255,140,0,.06);border-color:rgba(255,140,0,.18);}
.status-dot{width:5px;height:5px;border-radius:50%;background:currentColor;animation:pulse-dot 2s infinite;}
.project-open-btn{position:absolute;bottom:0;left:0;right:0;padding:11px 20px;background:linear-gradient(90deg,rgba(0,229,255,.12),rgba(136,0,255,.12));border-top:1px solid rgba(0,229,255,.16);font-family:"Orbitron",sans-serif;font-size:9px;font-weight:700;color:var(--cyan);letter-spacing:1px;text-align:center;opacity:0;transition:.22s;pointer-events:none;display:flex;align-items:center;justify-content:center;gap:6px;}
.project-open-btn svg{width:10px;height:10px;stroke:currentColor;fill:none;stroke-width:2.5;}
.project-card:hover .project-open-btn{opacity:1;}

/* ── EMPTY STATE ── */
.empty-state{grid-column:1/-1;text-align:center;padding:72px 20px;}
.empty-icon{width:64px;height:64px;border-radius:16px;background:var(--bg2);border:1px solid var(--b);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;animation:float 3s ease-in-out infinite;}
.empty-icon svg{width:26px;height:26px;stroke:var(--dim);fill:none;stroke-width:1.4;}
.empty-state strong{display:block;font-family:"Orbitron",sans-serif;font-size:12px;color:var(--text);margin-bottom:10px;letter-spacing:.5px;}
.empty-state p{font-size:10.5px;color:var(--dim2);line-height:1.85;}
.empty-hint{display:inline-flex;align-items:center;gap:7px;margin-top:18px;padding:8px 16px;border-radius:8px;background:rgba(0,229,255,.04);border:1px solid rgba(0,229,255,.12);font-size:9.5px;color:var(--cyan);}
.empty-hint svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;}

/* ── TOAST ── */
.nx-toast{position:fixed;bottom:22px;right:22px;z-index:9999;padding:11px 16px;border-radius:9px;font-size:11px;font-family:"JetBrains Mono",monospace;background:var(--bg3);border:1px solid var(--b);box-shadow:0 8px 32px rgba(0,0,0,.7);animation:toastIn .22s ease;pointer-events:none;max-width:300px;display:flex;align-items:center;gap:8px;}
.nx-toast svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0;}

/* ── OVERLAYS & MODALS ──
   FIXED: overlay scrollable, modal uses max-height + internal scroll
── */
.overlay{
  position:fixed;inset:0;background:rgba(3,3,18,.88);z-index:500;
  display:none;align-items:flex-start;justify-content:center;
  backdrop-filter:blur(8px);
  /* FIXED: overlay is scrollable so tall modals don't get cut off */
  overflow-y:auto;
  padding:20px 16px;
}
.overlay.show{display:flex;}
.modal-box{
  background:var(--bg2);border:1px solid var(--b);border-radius:16px;padding:28px;
  width:420px;max-width:100%;
  box-shadow:0 32px 80px rgba(0,0,0,.95),0 0 0 1px rgba(255,255,255,.03);
  animation:fadeIn .2s ease;
  /* FIXED: margin:auto centers within scrollable overlay */
  margin:auto;
  /* FIXED: no fixed max-height on modal-box — let it grow naturally */
  position:relative;
}
.modal-box.wide{width:510px;}
.modal-icon{width:44px;height:44px;border-radius:11px;background:rgba(255,45,107,.09);border:1px solid rgba(255,45,107,.22);display:flex;align-items:center;justify-content:center;margin:0 0 16px;}
.modal-icon svg{width:19px;height:19px;stroke:var(--pink);fill:none;stroke-width:2;}
.modal-icon.cyan-icon{background:rgba(0,229,255,.07);border-color:rgba(0,229,255,.18);}
.modal-icon.cyan-icon svg{stroke:var(--cyan);}
.modal-title{font-family:"Orbitron",sans-serif;font-size:13.5px;font-weight:700;color:#fff;margin-bottom:9px;}
.modal-desc{font-size:11px;color:var(--dim2);line-height:1.75;margin-bottom:22px;}
.highlight{color:var(--cyan);font-weight:600;}
.modal-btns{display:flex;gap:9px;}
.modal-btn{flex:1;padding:11px;border-radius:9px;font-family:"JetBrains Mono",monospace;font-size:11px;font-weight:600;cursor:pointer;transition:.15s;border:none;}
.modal-btn.cancel{background:var(--bg3);color:var(--text);border:1px solid var(--b);}
.modal-btn.cancel:hover{border-color:rgba(0,229,255,.3);color:var(--cyan);}
.modal-btn.danger{background:rgba(255,45,107,.1);color:var(--pink);border:1px solid rgba(255,45,107,.28);}
.modal-btn.danger:hover{background:var(--pink);color:#fff;}
.modal-btn.primary{background:linear-gradient(135deg,var(--cyan),var(--purple));color:#030312;}
.modal-btn.primary:hover{opacity:.88;}

/* ── SETTINGS MODAL ── */
.settings-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;}
.settings-hdr-title{font-family:"Orbitron",sans-serif;font-size:13px;font-weight:700;color:var(--cyan);display:flex;align-items:center;gap:8px;}
.settings-hdr-title svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;}
.settings-close{background:none;border:none;color:var(--dim2);cursor:pointer;width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:.12s;}
.settings-close svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;}
.settings-close:hover{color:var(--pink);background:rgba(255,45,107,.08);}
.settings-sec{margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid var(--b);}
.settings-sec:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0;}
.settings-sec-title{font-size:9px;color:var(--cyan);text-transform:uppercase;letter-spacing:2px;font-family:"Orbitron",sans-serif;margin-bottom:14px;opacity:.8;}
.settings-av-row{display:flex;align-items:center;gap:14px;padding:8px 0 12px;}
.settings-av{width:52px;height:52px;border-radius:50%;border:2px solid rgba(0,229,255,.3);object-fit:cover;flex-shrink:0;}
.settings-av-name{font-size:13px;color:white;font-weight:600;margin-bottom:3px;}
.settings-av-id{font-size:10px;color:var(--dim2);}
.settings-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;font-size:11px;gap:10px;flex-wrap:wrap;}
.settings-row label{color:var(--text);flex:1;}
.s-val{font-weight:700;}
.s-val.yellow{color:var(--yellow);}
.s-val.cyan{color:var(--cyan);}
.s-val.green{color:var(--green);}
.settings-btn{padding:6px 14px;border-radius:7px;font-size:10px;cursor:pointer;border:1px solid var(--b);background:rgba(0,229,255,.04);color:var(--text);transition:.15s;font-family:"JetBrains Mono",monospace;}
.settings-btn:hover{border-color:rgba(0,229,255,.3);color:var(--cyan);}
.settings-btn.danger{border-color:rgba(255,45,107,.28);color:var(--pink);}
.settings-btn.danger:hover{background:rgba(255,45,107,.1);}
.settings-btn.success{border-color:rgba(0,255,170,.28);color:var(--green);}
.settings-btn.success:hover{background:rgba(0,255,170,.07);}
.settings-btn:disabled{opacity:.35;cursor:not-allowed;}
.redeem-row{display:flex;gap:8px;width:100%;margin-top:8px;}
.redeem-input{flex:1;background:var(--bg3);border:1px solid var(--b);border-radius:7px;padding:8px 12px;color:white;font-family:"JetBrains Mono",monospace;font-size:11px;outline:none;transition:.18s;min-width:0;}
.redeem-input:focus{border-color:rgba(0,229,255,.35);box-shadow:0 0 0 2px rgba(0,229,255,.05);}
.redeem-msg{font-size:10px;margin-top:8px;display:none;}
.redeem-msg.show{display:block;}

/* ── RESPONSIVE ── */
@media(max-width:768px){
  .dnav{padding:0 16px;}
  .dash-main{padding:28px 14px 64px;}
  .stats-row{grid-template-columns:1fr 1fr;}
  .header-info h1{font-size:19px;}
  .user-name-nav{display:none;}
  .create-card{padding:20px 18px 20px;}
  .projects-grid{grid-template-columns:1fr 1fr;}
}
@media(max-width:640px){
  .input-row{flex-direction:column;}
  .btn-create{width:100%;justify-content:center;height:46px;}
  .projects-grid{grid-template-columns:1fr;}
}
@media(max-width:420px){
  .stats-row{grid-template-columns:1fr;}
  .modal-box{padding:20px 16px;}
}
`

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

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  /* ── state ── */
  const [loaded, setLoaded] = useState(false)
  const [loaderPct, setLoaderPct] = useState(0)
  const [session, setSession] = useState<NexusSession | null>(null)
  const [userData, setUserData] = useState<UserData>({})
  const [pendingQueue, setPendingQueue] = useState<QueueItem[]>([])
  const [isOnline, setIsOnline] = useState(true)
  const [syncState, setSyncState] = useState<'' | 'syncing' | 'error' | 'ok'>('')
  const [saveState, setSaveState] = useState<{state:string,msg:string}|null>(null)

  const [ddOpen, setDdOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{id:string,name:string}|null>(null)
  const [logoutModal, setLogoutModal] = useState(false)

  const [searchQ, setSearchQ] = useState('')
  const [sortBy, setSortBy] = useState<'newest'|'oldest'|'name'>('newest')
  const [projectName, setProjectName] = useState('')
  const [creating, setCreating] = useState(false)
  const [redeemCode, setRedeemCode] = useState('')
  const [redeemMsg, setRedeemMsg] = useState<{msg:string,ok:boolean}|null>(null)
  const [dailyInfo, setDailyInfo] = useState('')
  const [dailyDisabled, setDailyDisabled] = useState(false)

  const sessionRef = useRef<NexusSession | null>(null)
  const userDataRef = useRef<UserData>({})

  /* keep refs in sync */
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { userDataRef.current = userData }, [userData])

  /* ── inject fonts & styles ── */
  useEffect(() => {
    document.title = 'NEXUS AI — Dashboard'
    const addLink = (href: string) => {
      if (document.querySelector(`link[href="${href}"]`)) return
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href
      document.head.appendChild(l)
    }
    addLink('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@300;400;500;600&display=swap')
  }, [])

  /* ── online/offline ── */
  useEffect(() => {
    const on = () => { setIsOnline(true); setTimeout(retryQueue, 1000) }
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    setIsOnline(navigator.onLine)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── close DD on outside click ── */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const w = document.getElementById('userPillWrap')
      if (w && !w.contains(e.target as Node)) setDdOpen(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])

  /* ── keyboard shortcuts ── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSettingsOpen(false); setDeleteModal(null); setLogoutModal(false); setDdOpen(false) }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); document.getElementById('projNameInput')?.focus() }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  /* ── init ── */
  useEffect(() => {
    initDashboard()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── update daily status when userData changes ── */
  useEffect(() => {
    updateDailyStatus(userData)
  }, [userData])

  /* ── INIT ── */
  async function initDashboard() {
    setLoaderPct(15)
    const raw = localStorage.getItem('nexus_session')
    if (!raw) { window.location.replace('/'); return }
    let sess: NexusSession
    try {
      sess = JSON.parse(raw)
      if (!sess?.user?.username) throw new Error('no user')
      if (Date.now() - (sess.loginTime || 0) > 86400000 * 7) throw new Error('expired')
    } catch {
      localStorage.removeItem('nexus_session')
      window.location.replace('/')
      return
    }
    setSession(sess)
    sessionRef.current = sess

    /* load pending queue */
    try {
      const q = JSON.parse(localStorage.getItem('nexus_pending_queue') || '[]')
      if (Array.isArray(q)) setPendingQueue(q)
    } catch {}

    setLoaderPct(40)
    const ud = await syncFromServer(sess)
    setUserData(ud)
    userDataRef.current = ud
    setLoaderPct(90)
    setLoaderPct(100)
    setTimeout(() => setLoaded(true), 300)

    if (navigator.onLine) {
      setTimeout(() => retryQueue(), 2000)
    }
  }

  /* ── SYNC FROM SERVER ── */
  async function syncFromServer(sess: NexusSession): Promise<UserData> {
    try {
      const username = (sess.user.username || '').toLowerCase()
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), 8000)
      const r = await fetch(`${API_SYNC}?user=${encodeURIComponent(username)}`, { signal: ctrl.signal })
      clearTimeout(tid)
      if (r.ok) {
        const d = await r.json()
        if (d && typeof d === 'object') {
          if (!Array.isArray(d.projects)) d.projects = []
          const updated = { ...sess, data: { ...(sess.data || {}), ...d } }
          localStorage.setItem('nexus_session', JSON.stringify(updated))
          sessionRef.current = updated
          setSession(updated)
          return d as UserData
        }
      }
    } catch(e: unknown) {
      const err = e as Error
      console.warn('[NEXUS] sync:', err.name === 'AbortError' ? 'timeout' : err.message)
    }
    const fallback = sess.data || {}
    if (!Array.isArray((fallback as UserData).projects)) (fallback as UserData).projects = []
    return fallback as UserData
  }

  /* ── SAVE LOCAL ── */
  const saveLocal = useCallback((ud: UserData, sess: NexusSession) => {
    try {
      const updated = { ...sess, data: { ...(sess.data || {}), ...ud } }
      localStorage.setItem('nexus_session', JSON.stringify(updated))
      sessionRef.current = updated
      setSession(updated)
    } catch {}
  }, [])

  /* ── SAVE TO SERVER ── */
  async function saveToServer(ud: UserData, sess: NexusSession, showStatus?: boolean): Promise<boolean> {
    saveLocal(ud, sess)
    if (showStatus) setSaveState({ state: 'saving', msg: 'Saving to server...' })
    setSyncState('syncing')

    const payload = {
      user: (sess.user.username || '').toLowerCase(),
      robloxId: sess.user.robloxId || '',
      data: {
        projects: ud.projects || [],
        lastClaim: ud.lastClaim || null,
        avatar: sess.user.avatar || '',
        displayName: sess.user.displayName || '',
        robloxId: sess.user.robloxId || '',
      }
    }
    const ok = await attemptSave(payload, RETRY_MAX, showStatus, ud)
    if (ok) {
      setSyncState('ok')
      setTimeout(() => setSyncState(''), 1500)
      return true
    } else {
      setSyncState('error')
      setTimeout(() => setSyncState(''), 3000)
      enqueueSave(payload)
      if (showStatus) setSaveState({ state: 'error', msg: isOnline ? 'Save failed — queued for retry' : 'Offline — queued for retry' })
      return false
    }
  }

  async function attemptSave(
    payload: QueueItem['payload'],
    maxRetry: number,
    showStatus: boolean | undefined,
    ud: UserData
  ): Promise<boolean> {
    let delay = RETRY_BASE
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      try {
        const ctrl = new AbortController()
        const tid = setTimeout(() => ctrl.abort(), 9000)
        const r = await fetch(API_SYNC, {
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
            if (result.data.credits !== undefined) newUd.credits = result.data.credits
            if (result.data.plan) newUd.plan = result.data.plan
            if (result.data.roles) newUd.roles = result.data.roles
            if (Array.isArray(result.data.projects)) newUd.projects = result.data.projects
            setUserData(newUd)
            userDataRef.current = newUd
            if (sessionRef.current) saveLocal(newUd, sessionRef.current)
          }
          if (showStatus) setSaveState({ state: 'saved', msg: 'Saved to server' })
          return true
        }
        throw new Error(result.error || 'Server rejected')
      } catch(e: unknown) {
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

  /* ── QUEUE ── */
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

  /* ── NOTIFY PLUGIN ── */
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

  /* ── HELPERS ── */
  function getCredits(ud: UserData) {
    const c = ud.credits ?? (sessionRef.current?.data?.credits) ?? 30
    const plan = (ud.plan || 'free').toLowerCase()
    const roles = ud.roles || []
    const unlimited = plan === 'owner' || plan === 'unlimited' || roles.includes('owner')
    return { display: unlimited ? '∞' : parseFloat(String(c)).toFixed(0), unlimited }
  }

  function getPlanInfo(ud: UserData) {
    const plan = (ud.plan || 'free').toLowerCase()
    const roles = ud.roles || []
    const isOwner = plan === 'owner' || roles.includes('owner')
    const isAdmin = roles.includes('admin')
    const isPro   = plan === 'pro'
    if (isOwner) return { label: 'OWNER', cls: 'owner' }
    if (isAdmin) return { label: 'ADMIN', cls: 'pro' }
    if (isPro)   return { label: 'PRO',   cls: 'pro' }
    return { label: 'FREE', cls: '' }
  }

  function getLimit(ud: UserData) {
    const plan = (ud.plan || 'free').toLowerCase()
    const roles = ud.roles || []
    if (plan === 'owner' || roles.includes('owner') || roles.includes('admin')) return 999
    return plan === 'pro' ? 10 : 3
  }

  function updateDailyStatus(ud: UserData) {
    const plan = (ud.plan || 'free').toLowerCase()
    const roles = ud.roles || []
    if (plan === 'owner' || roles.includes('owner') || roles.includes('admin')) {
      setDailyInfo('Credits unlimited'); setDailyDisabled(true); return
    }
    const last = ud.lastClaim
    if (last) {
      const diff = (Date.now() - new Date(last).getTime()) / 3600000
      if (diff < 24) {
        const h = Math.ceil(24 - diff)
        setDailyInfo(`Next claim in ${h}h`); setDailyDisabled(true); return
      }
    }
    setDailyInfo('Daily credits available!'); setDailyDisabled(false)
  }

  /* ── CREATE PROJECT ── */
  async function handleCreate() {
    if (!projectName.trim()) {
      const el = document.getElementById('projNameInput') as HTMLInputElement | null
      if (el) { el.style.borderColor = 'rgba(255,45,107,.6)'; setTimeout(() => { el.style.borderColor = '' }, 1800) }
      showToast('Please enter a project name', 'var(--yellow)'); return
    }
    const limit = getLimit(userData)
    if ((userData.projects || []).length >= limit) { showToast('Project limit reached — upgrade to Pro', 'var(--pink)'); return }

    setCreating(true)
    const pid  = generateProjectId()
    const proj: Project = { id: pid, name: projectName.trim(), createdAt: new Date().toISOString() }
    const newUd = { ...userData, projects: [proj, ...(userData.projects || [])] }
    setUserData(newUd); userDataRef.current = newUd
    if (sessionRef.current) saveLocal(newUd, sessionRef.current)
    setProjectName('')

    const saved = sessionRef.current ? await saveToServer(newUd, sessionRef.current, true) : false
    setCreating(false)
    showToast(saved ? 'Project created — opening chat...' : 'Saved locally — will sync when online', saved ? 'var(--green)' : 'var(--orange)', saved ? 1800 : 2500)
    await notifyPlugin(pid, proj.name)
    setTimeout(() => { window.location.href = '/chats?id=' + encodeURIComponent(pid) }, 900)
  }

  /* ── OPEN PROJECT ── */
  async function openProject(id: string, name: string) {
    await notifyPlugin(id, name)
    window.location.href = '/chats?id=' + encodeURIComponent(id)
  }

  /* ── DELETE PROJECT ── */
  async function executeDelete(id: string) {
    setDeleteModal(null)
    const newUd = { ...userData, projects: (userData.projects || []).filter(p => p.id !== id) }
    setUserData(newUd); userDataRef.current = newUd
    if (sessionRef.current) {
      const ok = await saveToServer(newUd, sessionRef.current)
      showToast(ok ? 'Project deleted' : 'Deleted locally — will sync when online', ok ? 'var(--dim2)' : 'var(--orange)')
    }
  }

  /* ── DAILY CLAIM ── */
  async function claimDaily() {
    const plan = (userData.plan || 'free').toLowerCase()
    const roles = userData.roles || []
    if (plan === 'owner' || roles.includes('owner') || roles.includes('admin')) return
    const n = plan === 'pro' ? 25 : 2
    const newUd = { ...userData, credits: (parseFloat(String(userData.credits)) || 0) + n, lastClaim: new Date().toISOString() }
    setUserData(newUd); userDataRef.current = newUd
    if (sessionRef.current) await saveToServer(newUd, sessionRef.current)
    showToast(`+${n} CR claimed!`, 'var(--green)')
  }

  /* ── REDEEM ── */
  async function handleRedeem() {
    if (!redeemCode.trim()) { showToast('Enter a redeem code', 'var(--yellow)'); return }
    const code = redeemCode.trim().toUpperCase()
    setRedeemMsg(null)
    try {
      const r = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, user: (session?.user.username || '').toLowerCase(), userId: session?.user.robloxId || '' })
      })
      const d = await r.json()
      if (d.success) {
        const newUd = { ...userData, credits: (parseFloat(String(userData.credits)) || 0) + parseFloat(d.credits || 0) }
        setUserData(newUd); userDataRef.current = newUd
        if (sessionRef.current) await saveToServer(newUd, sessionRef.current)
        setRedeemMsg({ msg: `+${d.credits} CR redeemed successfully!`, ok: true })
        setRedeemCode('')
      } else {
        setRedeemMsg({ msg: 'Error: ' + (d.error || 'Invalid code'), ok: false })
      }
    } catch {
      setRedeemMsg({ msg: 'Failed to connect to server', ok: false })
    }
  }

  /* ── LOGOUT ── */
  function doLogout() { localStorage.removeItem('nexus_session'); window.location.replace('/') }

  /* ── TOAST ── */
  function showToast(msg: string, color?: string, dur?: number) {
    document.querySelectorAll('.nx-toast').forEach(t => t.remove())
    const t = document.createElement('div')
    t.className = 'nx-toast'
    t.style.color = color || 'var(--cyan)'
    const isWarn = color === 'var(--pink)' || color === 'var(--yellow)' || color === 'var(--orange)'
    t.innerHTML = isWarn
      ? `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>${esc(msg)}</span>`
      : `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><span>${esc(msg)}</span>`
    document.body.appendChild(t)
    setTimeout(() => t.remove(), dur || 2800)
  }

  /* ── AVATAR URL ── */
  const av = session?.user?.avatar
    || (session?.user?.robloxId
      ? `https://www.roblox.com/headshot-thumbnail/image?userId=${session.user.robloxId}&width=150&height=150&format=png`
      : '/nexusai.png')

  const { display: creditsDisplay } = getCredits(userData)
  const { label: planLabel, cls: planCls } = getPlanInfo(userData)
  const limit = getLimit(userData)
  const unlimited = limit === 999

  /* ── FILTER & SORT PROJECTS ── */
  const allProjects = userData.projects || []
  const filtered = searchQ
    ? allProjects.filter(p => p.name.toLowerCase().includes(searchQ.toLowerCase()))
    : [...allProjects]
  if (sortBy === 'newest') filtered.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  else if (sortBy === 'oldest') filtered.sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  else filtered.sort((a,b) => a.name.localeCompare(b.name))

  const pendingIds = new Set(pendingQueue.flatMap(q => (q.payload?.data?.projects || []).map(p => p.id)))
  const atLimit = allProjects.length >= limit

  /* ── SAVE STATUS AUTO-HIDE ── */
  useEffect(() => {
    if (!saveState) return
    if (saveState.state === 'saved') { const t = setTimeout(() => setSaveState(null), 3000); return () => clearTimeout(t) }
    if (saveState.state === 'error') { const t = setTimeout(() => setSaveState(null), 6000); return () => clearTimeout(t) }
  }, [saveState])

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* SYNC BAR */}
      <div id="syncBar" className={syncState} />

      {/* OFFLINE BANNER */}
      <div id="offlineBanner" className={!isOnline ? 'show' : ''}>
        <svg viewBox="0 0 24 24"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>
        No network connection — changes are queued locally
        <button className="retry-btn-offline" onClick={() => retryQueue()}>Retry Now</button>
      </div>

      {/* LOADER */}
      <div id="dash-loader" className={loaded ? 'hide' : ''}>
        <div className="loader-logo">NEXUS AI</div>
        <div className="loader-ring" />
        <div className="loader-progress"><div className="loader-progress-bar" style={{ width: loaderPct + '%' }} /></div>
        <div className="loader-sub">Loading workspace...</div>
      </div>

      {/* NAV */}
      <nav className="dnav">
        <a className="dnav-logo" onClick={() => window.location.href = '/dashboard'}>
          <div className="dnav-logo-icon"><img src="/nexusai.png" alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display='none' }} /></div>
          NEXUS AI
        </a>
        <div className="dnav-right">
          <a href="/payment" className="nav-credits-link">
            <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {creditsDisplay} CR
          </a>
          <div className="user-pill-wrap" id="userPillWrap">
            <div className={`user-pill${ddOpen ? ' open' : ''}`} onClick={() => setDdOpen(o => !o)}>
              <img className="user-av-sm" src={av} alt="" onError={e => { (e.currentTarget as HTMLImageElement).src='/nexusai.png' }} />
              <span className="user-name-nav">@{session?.user.username || '...'}</span>
              <svg className="user-caret" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div className={`user-dd${ddOpen ? ' open' : ''}`}>
              <div className="ud-hdr">
                <img className="ud-av" src={av} alt="" onError={e => { (e.currentTarget as HTMLImageElement).src='/nexusai.png' }} />
                <div>
                  <div className="ud-name">@{session?.user.username}</div>
                  <div className="ud-role">{planLabel} Plan</div>
                </div>
              </div>
              <div className="ud-section">
                <div className="ud-item" onClick={() => { setSettingsOpen(true); setDdOpen(false) }}>
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                  Settings
                </div>
                <a className="ud-item" href="/payment" onClick={() => setDdOpen(false)}>
                  <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  Buy Credits
                  <span className="ud-badge">{creditsDisplay} CR</span>
                </a>
                <a className="ud-item" href="/inbox" onClick={() => setDdOpen(false)}>
                  <svg viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>
                  Inbox
                </a>
                <a className="ud-item" href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noreferrer" onClick={() => setDdOpen(false)}>
                  <svg viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>
                  Discord Community
                </a>
              </div>
              <div className="ud-divider" />
              <div className="ud-section">
                <div className="ud-item" onClick={() => { claimDaily(); setDdOpen(false) }}>
                  <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {dailyDisabled ? dailyInfo : 'Claim Daily Credits'}
                </div>
              </div>
              <div className="ud-divider" />
              <div className="ud-section">
                <div className="ud-item danger" onClick={() => { setLogoutModal(true); setDdOpen(false) }}>
                  <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sign Out
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* MAIN */}
      <div className="dash-main">
        {/* Page Header */}
        <div className="page-header">
          <div className="header-left">
            <div className="header-av-wrap">
              <img id="headerAv" src={av} alt="" onError={e => { (e.currentTarget as HTMLImageElement).src='/nexusai.png' }} />
            </div>
            <div className="header-info">
              <h1>Welcome, <span>{session?.user.username || 'Dev'}</span>!</h1>
              <p>NEXUS AI Project Hub — Select a project to start chatting</p>
            </div>
          </div>
          <a href="/payment" className={`plan-badge${planCls ? ' ' + planCls : ''}`}>
            <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            {planLabel} PLAN
          </a>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-icon yellow">
              <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <div><div className="stat-val">{creditsDisplay}</div><div className="stat-lbl">Credits Available</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon cyan">
              <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            </div>
            <div><div className="stat-val">{allProjects.length}</div><div className="stat-lbl">Total Projects</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">
              <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div><div className="stat-val">{planLabel}</div><div className="stat-lbl">Current Plan</div></div>
          </div>
        </div>

        {/* Create Card */}
        <div className="create-card">
          <div className="create-card-top">
            <div className="card-title">
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Project
            </div>
            <div className="limit-badge">
              <span className="used">{allProjects.length}</span>
              <span className="sep">/</span>
              <span>{unlimited ? '∞' : limit}</span>
              &nbsp;used
            </div>
          </div>
          <div className="input-row">
            <input
              id="projNameInput"
              type="text"
              className="project-input"
              placeholder="Project name — e.g. Obby Game, Shop System, Simulator..."
              maxLength={60}
              value={projectName}
              disabled={atLimit || creating}
              onChange={e => setProjectName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            />
            <button
              className={`btn-create${creating ? ' loading' : ''}`}
              disabled={atLimit || creating}
              onClick={handleCreate}
            >
              <div className="btn-spinner" />
              <span className="btn-lbl">CREATE</span>
              <svg className="btn-lbl" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          {saveState && (
            <div className={`save-status ${saveState.state}`} style={{ display: 'flex' }}>
              <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              <span>{saveState.msg}</span>
            </div>
          )}
          {pendingQueue.length > 0 && (
            <div className="queue-notice show">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p><strong>{pendingQueue.length}</strong> unsaved change(s) queued — will sync automatically when online.</p>
              <button onClick={retryQueue}>Retry</button>
            </div>
          )}
          <div className="must-notice">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p><strong>Project required to chat.</strong> Create or select a project below before accessing AI chat. Each project has its own isolated chat history and automatically syncs with your Studio plugin.</p>
          </div>
        </div>

        {/* Search */}
        <div className="search-row">
          <div className="search-wrap">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              className="search-input"
              placeholder="Search projects..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
            />
          </div>
          <select
            className="sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'newest'|'oldest'|'name')}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">A – Z</option>
          </select>
        </div>

        {/* Section header */}
        <div className="section-header">
          <h2>Your Projects</h2>
          <div className="section-line" />
          <div className="section-count">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Projects Grid */}
        <div className="projects-grid">
          {filtered.length === 0 ? (
            searchQ ? (
              <div className="empty-state">
                <div className="empty-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
                <strong>No results</strong>
                <p>No projects match "<strong>{searchQ}</strong>".<br/>Try a different search term.</p>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon"><svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg></div>
                <strong>No projects yet</strong>
                <p>Create a project above to start chatting with NEXUS AI.<br/>Each project has its own isolated AI chat history.</p>
                <div className="empty-hint">
                  <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Type a name above and click CREATE
                </div>
              </div>
            )
          ) : filtered.map((p, i) => (
            <div
              key={p.id}
              className={`project-card${pendingIds.has(p.id) ? ' pending-save' : ''}`}
              style={{ animationDelay: `${i * 0.05}s` }}
              onClick={() => openProject(p.id, p.name)}
            >
              <div className="project-card-top">
                <div className="project-icon">
                  <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                </div>
                <div className="project-top-right">
                  <span className="project-id-tag" title={p.id}>{p.id.slice(0, 15)}…</span>
                  <button
                    className="btn-del"
                    title="Delete project"
                    onClick={e => { e.stopPropagation(); setDeleteModal({ id: p.id, name: p.name }) }}
                  >
                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              </div>
              <div className="project-name" title={p.name}>{p.name}</div>
              <div className="project-desc">Roblox AI project — isolated chat history &amp; Studio sync</div>
              <div className="project-meta">
                <span className="meta-date">
                  <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span className={`meta-status${pendingIds.has(p.id) ? ' pending' : ''}`}>
                  <span className="status-dot" />
                  {pendingIds.has(p.id) ? 'Pending sync' : 'Active'}
                </span>
              </div>
              <div className="project-open-btn">
                <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                OPEN PROJECT
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════ DELETE MODAL ═══════════ */}
      <div className={`overlay${deleteModal ? ' show' : ''}`} onClick={e => { if (e.target === e.currentTarget) setDeleteModal(null) }}>
        <div className="modal-box">
          <div className="modal-icon">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </div>
          <div className="modal-title">Delete Project?</div>
          <div className="modal-desc">
            Are you sure you want to delete{' '}
            <span className="highlight">"{deleteModal?.name}"</span>?{' '}
            All chat history will be permanently removed. This action cannot be undone.
          </div>
          <div className="modal-btns">
            <button className="modal-btn cancel" onClick={() => setDeleteModal(null)}>Cancel</button>
            <button className="modal-btn danger" onClick={() => deleteModal && executeDelete(deleteModal.id)}>Delete Project</button>
          </div>
        </div>
      </div>

      {/* ═══════════ LOGOUT MODAL ═══════════ */}
      <div className={`overlay${logoutModal ? ' show' : ''}`} onClick={e => { if (e.target === e.currentTarget) setLogoutModal(false) }}>
        <div className="modal-box">
          <div className="modal-icon">
            <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </div>
          <div className="modal-title">Sign Out?</div>
          <div className="modal-desc">You will be signed out of NEXUS AI. Your projects and chat history are safely stored on the server.</div>
          <div className="modal-btns">
            <button className="modal-btn cancel" onClick={() => setLogoutModal(false)}>Cancel</button>
            <button className="modal-btn danger" onClick={doLogout}>Sign Out</button>
          </div>
        </div>
      </div>

      {/* ═══════════ SETTINGS MODAL ═══════════ */}
      <div className={`overlay${settingsOpen ? ' show' : ''}`} onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}>
        <div className="modal-box wide">
          <div className="settings-hdr">
            <div className="settings-hdr-title">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              Settings
            </div>
            <button className="settings-close" onClick={() => setSettingsOpen(false)}>
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Roblox Account */}
          <div className="settings-sec">
            <div className="settings-sec-title">Roblox Account</div>
            <div className="settings-av-row">
              <img className="settings-av" src={av} alt="" onError={e => { (e.currentTarget as HTMLImageElement).src='/nexusai.png' }} />
              <div>
                <div className="settings-av-name">@{session?.user.username}</div>
                <div className="settings-av-id">Roblox ID: {session?.user.robloxId || '–'}</div>
              </div>
            </div>
            <div className="settings-row">
              <label>Credits</label>
              <span className="s-val yellow">{creditsDisplay} CR</span>
            </div>
            <div className="settings-row">
              <label>Plan</label>
              <span className="s-val cyan">{planLabel}</span>
            </div>
          </div>

          {/* Daily Credits */}
          <div className="settings-sec">
            <div className="settings-sec-title">Daily Credits</div>
            <div className="settings-row"><label>Free Plan</label><span style={{ color: 'var(--green)', fontSize: 11 }}>+2 CR / day</span></div>
            <div className="settings-row"><label>Pro Plan</label><span style={{ color: 'var(--cyan)', fontSize: 11 }}>+25 CR / day</span></div>
            <div className="settings-row">
              <span style={{ fontSize: 10, color: 'var(--dim2)', flex: 1 }}>{dailyInfo}</span>
              <button className="settings-btn success" disabled={dailyDisabled} onClick={claimDaily}>Claim Daily</button>
            </div>
          </div>

          {/* Redeem Code */}
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
                placeholder="Enter redeem code..."
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRedeem() }}
              />
              <button className="settings-btn" onClick={handleRedeem}>Redeem</button>
            </div>
            {redeemMsg && (
              <div className="redeem-msg show" style={{ color: redeemMsg.ok ? 'var(--green)' : 'var(--pink)' }}>
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
                Download
              </button>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="settings-sec">
            <div className="settings-sec-title" style={{ color: 'var(--pink)', opacity: .9 }}>Danger Zone</div>
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