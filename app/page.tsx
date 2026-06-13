'use client';

import { useEffect, useRef, useState } from 'react';

/* ─── Discord Icon ─── */
function DiscordIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#7289da" style={{ flexShrink: 0 }}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

/* ─── Inline SVG Model Icons (no broken img tags) ─── */
function GeminiIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="gem-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <path d="M12 2C12 2 7 7.5 7 12s5 10 5 10 5-4.5 5-10S12 2 12 2z" fill="url(#gem-g)" opacity=".9" />
      <path d="M2 12c0 0 5.5-5 10-5s10 5 10 5-4.5 5-10 5S2 12 2 12z" fill="url(#gem-g)" opacity=".7" />
    </svg>
  );
}

function DeepSeekIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#1A6CF0" />
      <path d="M7 12l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StepFunIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill="#FF6B35" />
      <path d="M6 8h12M6 12h8M6 16h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ClaudeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill="#D4A96A" />
      <path d="M12 6l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z" fill="white" opacity=".9" />
    </svg>
  );
}

function GPTIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill="#10A37F" />
      <path d="M12 4a8 8 0 1 0 0 16A8 8 0 0 0 12 4zm0 2a6 6 0 0 1 0 12A6 6 0 0 1 12 6z" fill="white" opacity=".5" />
      <path d="M12 8v8M8 12h8" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ─── CSS ─── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500;600&display=swap');

:root {
  --bg:#030312; --bg2:#06071a; --bg3:#0a0b22; --bg4:#0d0e28;
  --cyan:#00e5ff; --cyan2:rgba(0,229,255,.28); --cyan3:rgba(0,229,255,.07);
  --purple:#8800ff; --pink:#ff2d6b; --green:#00ffaa;
  --yellow:#ffd600; --amber:#ff9500;
  --text:#b8cfff; --text2:#7a9acf; --dim:#2e3e6a; --dim2:#1a2540;
  --b:rgba(0,229,255,.1); --bb:rgba(0,229,255,.22);
  --r:8px; --r2:12px; --r3:16px;
}

*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
html { scroll-behavior:smooth; }
body {
  font-family:'JetBrains Mono',monospace;
  background:var(--bg); color:var(--text);
  font-size:13px; overflow-x:hidden;
}
::-webkit-scrollbar { width:3px; }
::-webkit-scrollbar-thumb { background:rgba(0,229,255,.18); border-radius:3px; }
::-webkit-scrollbar-track { background:transparent; }

/* BG */
.hp-canvas { position:fixed; inset:0; z-index:0; pointer-events:none; opacity:.4; }
.hp-grid {
  position:fixed; inset:0; pointer-events:none; z-index:1;
  background:
    linear-gradient(rgba(0,229,255,.013) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,229,255,.013) 1px,transparent 1px);
  background-size:44px 44px;
}
.hp-scanlines {
  position:fixed; inset:0; pointer-events:none; z-index:1;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.04) 2px,rgba(0,0,0,.04) 4px);
}

/* Orbs */
.orbs { position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
.orb  { position:absolute; border-radius:50%; filter:blur(110px); }
.orb1 { width:560px;height:560px;background:rgba(0,229,255,.04);top:-160px;left:-120px;animation:orbDrift1 11s ease-in-out infinite alternate; }
.orb2 { width:680px;height:680px;background:rgba(136,0,255,.05);top:180px;right:-200px;animation:orbDrift2 13s ease-in-out infinite alternate; }
.orb3 { width:440px;height:440px;background:rgba(255,45,107,.035);bottom:60px;left:22%;animation:orbDrift3 9s ease-in-out infinite alternate; }
@keyframes orbDrift1{from{transform:translate(0,0);}to{transform:translate(30px,20px);}}
@keyframes orbDrift2{from{transform:translate(0,0);}to{transform:translate(-25px,15px);}}
@keyframes orbDrift3{from{transform:translate(0,0);}to{transform:translate(15px,-20px);}}

/* Particles */
.particles { position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
.p { position:absolute; border-radius:50%; animation:pfloat linear infinite; }
@keyframes pfloat {
  0%{transform:translateY(100vh) scale(0);opacity:0}
  8%{opacity:1} 85%{opacity:.15}
  100%{transform:translateY(-8vh) scale(1.4);opacity:0}
}

/* Scroll reveal */
.reveal       { opacity:0; transform:translateY(28px); transition:opacity .65s ease,transform .65s ease; }
.reveal-left  { opacity:0; transform:translateX(-28px); transition:opacity .65s ease,transform .65s ease; }
.reveal-right { opacity:0; transform:translateX(28px);  transition:opacity .65s ease,transform .65s ease; }
.reveal-scale { opacity:0; transform:scale(.93);        transition:opacity .6s ease,transform .6s ease; }
.reveal.active,.reveal-left.active,.reveal-right.active,.reveal-scale.active { opacity:1; transform:none; }
.d1{transition-delay:.05s!important} .d2{transition-delay:.12s!important}
.d3{transition-delay:.20s!important} .d4{transition-delay:.28s!important}
.d5{transition-delay:.36s!important} .d6{transition-delay:.44s!important}

/* ═══ NAVBAR ═══ */
.nav {
  position:fixed;top:0;left:0;right:0;z-index:100;
  height:56px; padding:0 32px;
  display:flex;align-items:center;gap:10px;
  background:linear-gradient(180deg,rgba(6,7,26,.97),rgba(6,7,26,.88));
  backdrop-filter:blur(16px);
  border-bottom:1px solid var(--b);
  transition:all .3s ease;
}
.nav.scrolled { height:48px; background:rgba(6,7,26,.98); }
.nav-logo-wrap { display:flex;align-items:center;gap:9px;text-decoration:none;flex-shrink:0; }
.nav-logo-icon {
  width:30px;height:30px;border-radius:8px;flex-shrink:0;
  border:1.5px solid rgba(0,229,255,.25);
  background:linear-gradient(135deg,rgba(0,229,255,.18),rgba(136,0,255,.18));
  box-shadow:0 0 12px rgba(0,229,255,.18);
  display:flex;align-items:center;justify-content:center;
}
.nav-logo {
  font-family:'Orbitron',sans-serif;font-weight:900;font-size:13px;letter-spacing:3px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.nav-divider { width:1px;height:16px;background:var(--dim2);margin:0 2px; }
.nav-sub { font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:2px; }
.nav-live {
  display:flex;align-items:center;gap:5px;
  padding:3px 10px;border-radius:20px;
  background:rgba(0,255,170,.06);border:1px solid rgba(0,255,170,.15);
  font-size:8.5px;color:var(--green);letter-spacing:1px;
}
.nav-live-dot { width:5px;height:5px;border-radius:50%;background:var(--green);animation:liveDot 1.8s ease-in-out infinite; }
@keyframes liveDot{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.3;transform:scale(.6);}}
.nav-r { margin-left:auto;display:flex;align-items:center;gap:8px; }
.nav-discord {
  padding:7px 14px;border-radius:8px;
  border:1px solid rgba(88,101,242,.3);background:rgba(88,101,242,.07);
  color:#7289da;font-size:10px;text-decoration:none;
  transition:.15s;display:flex;align-items:center;gap:7px;
  white-space:nowrap;
}
.nav-discord:hover{background:rgba(88,101,242,.16);border-color:rgba(88,101,242,.55);}
.nav-login {
  padding:8px 20px;border-radius:8px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  color:white;font-family:'Orbitron',sans-serif;font-size:9.5px;font-weight:700;
  text-decoration:none;letter-spacing:1px;
  transition:.18s;display:flex;align-items:center;gap:7px;
  position:relative;overflow:hidden;
  box-shadow:0 4px 18px rgba(0,229,255,.18);
  white-space:nowrap;
}
.nav-login::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(120deg,transparent 40%,rgba(255,255,255,.1) 50%,transparent 60%);
  transform:translateX(-100%);transition:transform .4s ease;
}
.nav-login:hover::after{transform:translateX(100%);}
.nav-login:hover{opacity:.88;transform:translateY(-1px);box-shadow:0 8px 28px rgba(0,229,255,.28);}

/* Mobile hamburger */
.nav-menu-btn {
  display:none;background:none;border:1px solid var(--b);border-radius:8px;
  padding:7px;cursor:pointer;color:var(--text);transition:.15s;
}
.nav-menu-btn:hover{border-color:var(--cyan2);color:var(--cyan);}
.nav-mobile-menu {
  display:none;
  position:fixed;top:56px;left:0;right:0;
  background:rgba(6,7,26,.97);border-bottom:1px solid var(--b);
  padding:16px;z-index:99;
  flex-direction:column;gap:10px;
  backdrop-filter:blur(16px);
}
.nav-mobile-menu.open{display:flex;}
.nav-mobile-item {
  padding:12px 16px;border-radius:10px;
  border:1px solid var(--b);color:var(--text);
  text-decoration:none;font-size:11px;
  display:flex;align-items:center;gap:8px;
  transition:.15s;
}
.nav-mobile-item:hover{border-color:var(--cyan2);color:var(--cyan);}
.nav-mobile-item.primary{
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  color:white;font-family:'Orbitron',sans-serif;font-weight:700;
  letter-spacing:1px;border-color:transparent;
}

/* ═══ HERO ═══ */
.hero {
  min-height:100vh;
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  text-align:center;
  padding:120px 20px 60px;
  position:relative;z-index:2;
  overflow:hidden;
}
.hero::before {
  content:'';position:absolute;inset:0;pointer-events:none;
  background:
    radial-gradient(ellipse 70% 55% at 50% -5%,rgba(136,0,255,.2) 0%,transparent 60%),
    radial-gradient(ellipse 50% 40% at 50% 75%,rgba(0,229,255,.06) 0%,transparent 55%);
}

.hero-badge {
  display:inline-flex;align-items:center;gap:8px;padding:6px 18px;
  background:rgba(0,229,255,.05);border:1px solid var(--b);
  border-radius:20px;font-size:9px;color:var(--cyan);
  margin-bottom:24px;letter-spacing:2px;text-transform:uppercase;
  animation:fadeUpHero .8s ease both;
  box-shadow:0 0 20px rgba(0,229,255,.06);
}
.badge-dot{width:6px;height:6px;border-radius:50%;background:var(--cyan);animation:liveDot 1.8s infinite;}

.hero-title {
  font-family:'Orbitron',sans-serif;
  font-size:clamp(28px,6.5vw,80px);font-weight:900;
  line-height:1.05;margin-bottom:0;
  animation:fadeUpHero .8s .1s ease both;
}
.hero-title .grad {
  background:linear-gradient(135deg,var(--cyan) 0%,var(--purple) 50%,var(--pink) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  display:inline-block;
}

/* Prompt Box */
.hero-prompt-wrap {
  width:100%;max-width:660px;
  margin:32px auto 0;
  position:relative;z-index:5;
  animation:fadeUpHero .8s .25s ease both;
}
.hero-prompt-box {
  display:flex;align-items:center;gap:0;
  background:rgba(10,11,34,.9);
  border:1.5px solid rgba(0,229,255,.22);
  border-radius:16px;
  padding:6px 6px 6px 18px;
  box-shadow:0 0 0 1px rgba(0,229,255,.06) inset, 0 20px 60px rgba(0,0,0,.55), 0 0 50px rgba(0,229,255,.07);
  backdrop-filter:blur(16px);
  transition:border-color .25s, box-shadow .25s;
}
.hero-prompt-box:focus-within {
  border-color:rgba(0,229,255,.5);
  box-shadow:0 0 0 1px rgba(0,229,255,.1) inset, 0 20px 60px rgba(0,0,0,.65), 0 0 60px rgba(0,229,255,.14);
}
.hero-prompt-input {
  flex:1;background:transparent;border:none;outline:none;
  font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text);
  padding:12px 0;line-height:1.5;
  resize:none;min-height:48px;max-height:120px;
}
.hero-prompt-input::placeholder { color:var(--dim); }
.hero-prompt-btn {
  flex-shrink:0;
  padding:12px 22px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  border:none;border-radius:12px;
  color:white;font-family:'Orbitron',sans-serif;font-size:9.5px;font-weight:700;
  cursor:pointer;transition:.2s;letter-spacing:1px;
  display:flex;align-items:center;gap:7px;
  position:relative;overflow:hidden;
  box-shadow:0 4px 20px rgba(0,229,255,.22);
  white-space:nowrap;
}
.hero-prompt-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(120deg,transparent 40%,rgba(255,255,255,.1) 50%,transparent 60%);transform:translateX(-100%);transition:.35s;}
.hero-prompt-btn:hover::after{transform:translateX(100%);}
.hero-prompt-btn:hover{opacity:.88;transform:translateY(-1px);box-shadow:0 8px 32px rgba(0,229,255,.32);}
.hero-prompt-btn:active{transform:scale(.97);}

.hero-prompt-examples {
  display:flex;flex-wrap:wrap;gap:8px;justify-content:center;
  margin-top:14px;
}
.hero-prompt-ex {
  display:inline-flex;align-items:center;gap:6px;
  padding:5px 13px;border-radius:20px;
  background:rgba(0,229,255,.04);border:1px solid rgba(0,229,255,.12);
  font-size:9.5px;color:var(--text2);cursor:pointer;
  transition:.18s;white-space:nowrap;
}
.hero-prompt-ex:hover{background:rgba(0,229,255,.09);border-color:rgba(0,229,255,.3);color:var(--cyan);}

/* ═══ GAME CAROUSEL ═══ */
.hero-games-stage {
  position:relative;
  width:100%;max-width:1100px;
  height:340px;
  margin:48px auto 0;
  animation:fadeUpHero .8s .35s ease both;
  pointer-events:none;
}

.hg-side {
  position:absolute;top:50%;
  display:flex;flex-direction:column;gap:12px;
  pointer-events:auto;
}
.hg-left  { left:0;  transform:translateY(-50%); }
.hg-right { right:0; transform:translateY(-50%); }

.hg-card {
  display:flex;align-items:center;gap:10px;
  padding:8px 12px 8px 8px;
  background:rgba(6,7,26,.88);
  border:1px solid rgba(0,229,255,.14);
  border-radius:12px;
  backdrop-filter:blur(12px);
  box-shadow:0 8px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(0,229,255,.05) inset;
  font-size:10px;color:var(--text);
  white-space:nowrap;
  transition:border-color .22s, box-shadow .22s, transform .22s;
  cursor:pointer;
  min-width:200px;
}
.hg-card:hover{
  border-color:rgba(0,229,255,.35);
  box-shadow:0 12px 40px rgba(0,229,255,.12), 0 0 0 1px rgba(0,229,255,.1) inset;
  transform:translateY(-3px);
}
.hg-card-thumb {
  width:50px;height:50px;border-radius:8px;object-fit:cover;flex-shrink:0;
  border:1px solid rgba(0,229,255,.1);
  background:linear-gradient(135deg,rgba(0,229,255,.08),rgba(136,0,255,.08));
}
.hg-card-info { display:flex;flex-direction:column;gap:3px; }
.hg-card-label { font-size:8.5px;color:var(--dim);display:flex;align-items:center;gap:5px; }
.hg-card-name { font-size:10px;color:white;font-weight:600; }
.hg-card-prompt {
  font-size:8px;color:var(--cyan);opacity:.7;
  font-style:italic;max-width:130px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}

/* Center carousel */
.hg-center {
  position:absolute;
  left:50%;top:50%;
  transform:translate(-50%,-50%);
  width:380px;
  pointer-events:auto;
}
.hg-main-wrap {
  position:relative;
  width:100%;height:260px;
  border-radius:16px;overflow:hidden;
  border:1.5px solid rgba(0,229,255,.22);
  box-shadow:0 0 0 1px rgba(0,229,255,.07) inset, 0 24px 64px rgba(0,0,0,.7), 0 0 50px rgba(0,229,255,.1);
}
.hg-main-img {
  position:absolute;inset:0;
  width:100%;height:100%;object-fit:cover;
  transition:opacity .7s ease, transform .7s ease;
  background:linear-gradient(135deg,rgba(0,229,255,.05),rgba(136,0,255,.05));
}
.hg-main-img.entering { opacity:0; transform:scale(1.04); }
.hg-main-img.active   { opacity:1; transform:scale(1); }
.hg-main-img.leaving  { opacity:0; transform:scale(.97); }

/* Center overlay with prompt */
.hg-main-overlay {
  position:absolute;bottom:0;left:0;right:0;z-index:3;
  background:linear-gradient(0deg,rgba(3,3,18,.95) 0%,rgba(3,3,18,.4) 70%,transparent 100%);
  padding:28px 16px 14px;
}
.hg-main-name{font-size:13px;font-weight:600;color:white;margin-bottom:2px;}
.hg-main-tag{font-size:8.5px;color:var(--cyan);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:5px;}
.hg-main-prompt {
  display:inline-flex;align-items:center;gap:6px;
  padding:4px 10px;border-radius:8px;
  background:rgba(0,229,255,.08);border:1px solid rgba(0,229,255,.2);
  font-size:8.5px;color:var(--text2);font-style:italic;
  cursor:pointer;transition:.15s;
}
.hg-main-prompt:hover{background:rgba(0,229,255,.15);color:var(--cyan);}

.hg-main-wrap::before{
  content:'';position:absolute;top:0;left:0;right:0;height:2px;z-index:2;
  background:linear-gradient(90deg,transparent,var(--cyan),var(--purple),transparent);
  animation:shimmerBar 3s ease-in-out infinite;
}
@keyframes shimmerBar{0%,100%{opacity:.5}50%{opacity:1}}

.hg-dots {
  display:flex;gap:6px;justify-content:center;margin-top:12px;
}
.hg-dot {
  width:6px;height:6px;border-radius:50%;
  background:rgba(0,229,255,.2);border:1px solid rgba(0,229,255,.15);
  cursor:pointer;transition:.2s;
}
.hg-dot.active{background:var(--cyan);box-shadow:0 0 8px rgba(0,229,255,.6);}

/* Stats */
.hero-stats{
  display:flex;gap:40px;margin-top:48px;flex-wrap:wrap;justify-content:center;
  animation:fadeUpHero .8s .45s ease both;
}
.stat{text-align:center;position:relative;}
.stat-n{
  font-family:'Orbitron',sans-serif;font-size:24px;font-weight:900;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  line-height:1.1;
}
.stat-l{font-size:8.5px;color:var(--dim);text-transform:uppercase;letter-spacing:2px;margin-top:5px;}
.stat-divider{width:1px;background:var(--b);align-self:stretch;margin:4px 0;}

/* Scroll arrow */
.hero-scroll{margin-top:40px;cursor:pointer;animation:bounce 2.2s infinite,fadeUpHero .8s .5s ease both;}
@keyframes bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(9px);}}
.hero-scroll svg{opacity:.3;transition:.2s;stroke:var(--text);fill:none;stroke-width:2;}
.hero-scroll:hover svg{opacity:.7;}

@keyframes fadeUpHero{from{opacity:0;transform:translateY(22px);}to{opacity:1;transform:none;}}

/* ═══ SECTIONS ═══ */
.section{padding:88px 32px;position:relative;z-index:1;max-width:1200px;margin:0 auto;}
.sec-eyebrow{
  font-size:9px;color:var(--cyan);text-transform:uppercase;letter-spacing:3px;
  margin-bottom:12px;text-align:center;
  display:flex;align-items:center;justify-content:center;gap:10px;
}
.sec-eyebrow::before,.sec-eyebrow::after{content:'';width:32px;height:1px;background:linear-gradient(90deg,transparent,rgba(0,229,255,.35));}
.sec-eyebrow::after{background:linear-gradient(90deg,rgba(0,229,255,.35),transparent);}
.sec-title{font-family:'Orbitron',sans-serif;font-size:clamp(20px,3.5vw,36px);font-weight:900;text-align:center;color:white;margin-bottom:10px;}
.sec-sub{font-size:11.5px;color:var(--text2);text-align:center;max-width:500px;margin:0 auto 52px;line-height:1.95;}

/* ═══ MYSTERY ═══ */
.mystery {
  padding:96px 24px;
  background:linear-gradient(180deg,transparent,rgba(136,0,255,.045),transparent);
  border-top:1px solid var(--b);border-bottom:1px solid var(--b);
  position:relative;z-index:1;text-align:center;
}
.mystery-inner{max-width:780px;margin:0 auto;}
.mystery-eyebrow{
  font-size:9px;color:var(--purple);text-transform:uppercase;letter-spacing:3px;margin-bottom:20px;
  display:flex;align-items:center;justify-content:center;gap:10px;
}
.mystery-eyebrow::before,.mystery-eyebrow::after{
  content:'';flex:1;max-width:80px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(136,0,255,.4));
}
.mystery-eyebrow::after{background:linear-gradient(90deg,rgba(136,0,255,.4),transparent);}
.mystery-title{font-family:'Orbitron',sans-serif;font-size:clamp(22px,4vw,44px);font-weight:900;color:white;margin-bottom:18px;line-height:1.15;}
.mystery-sub{font-size:12px;color:var(--text2);line-height:1.95;max-width:580px;margin:0 auto 14px;}
.mystery-lock{
  display:inline-flex;align-items:center;gap:8px;padding:6px 16px;margin-bottom:36px;
  background:rgba(255,45,107,.06);border:1px solid rgba(255,45,107,.22);
  border-radius:20px;font-size:9px;color:var(--pink);letter-spacing:1px;
}
.hint-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:36px;}
.hint-card{
  padding:22px 18px;background:rgba(136,0,255,.03);border:1px solid rgba(136,0,255,.12);
  border-radius:12px;text-align:left;transition:.22s;position:relative;overflow:hidden;
}
.hint-card::after{
  content:'';position:absolute;top:0;left:0;right:0;height:1.5px;
  background:linear-gradient(90deg,transparent,rgba(136,0,255,.5),transparent);
  opacity:0;transition:.22s;
}
.hint-card:hover{border-color:rgba(136,0,255,.35);background:rgba(136,0,255,.07);transform:translateY(-3px);}
.hint-card:hover::after{opacity:1;}
.hint-icon{width:36px;height:36px;border-radius:10px;background:rgba(136,0,255,.1);border:1px solid rgba(136,0,255,.18);display:flex;align-items:center;justify-content:center;margin-bottom:12px;}
.hint-title{font-size:11px;color:white;font-weight:600;margin-bottom:6px;}
.hint-sub{font-size:10px;color:var(--text2);line-height:1.75;}

/* ═══ SCREENSHOTS ═══ */
.screenshots-section{
  background:linear-gradient(180deg,transparent,rgba(0,229,255,.018),transparent);
  border-top:1px solid var(--b);border-bottom:1px solid var(--b);
  padding:88px 24px;position:relative;z-index:1;
}
.screen-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;max-width:1160px;margin:0 auto;}
.screen-card{
  border-radius:14px;overflow:hidden;border:1px solid var(--b);
  background:rgba(6,7,26,.8);transition:.28s;position:relative;
  box-shadow:0 8px 32px rgba(0,0,0,.4);
}
.screen-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1.5px;background:linear-gradient(90deg,transparent,var(--cyan),transparent);opacity:0;transition:.28s;z-index:2;}
.screen-card:hover{border-color:var(--cyan2);transform:translateY(-6px);box-shadow:0 24px 60px rgba(0,229,255,.1);}
.screen-card:hover::before{opacity:1;}
.screen-card-img{
  width:100%;height:200px;object-fit:cover;object-position:top;display:block;
  border-bottom:1px solid var(--b);
  background:linear-gradient(135deg,rgba(0,229,255,.04),rgba(136,0,255,.04));
}
.screen-card-body{padding:16px 18px;}
.screen-card-title{font-size:11px;color:white;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:8px;}
.screen-card-desc{font-size:10px;color:var(--text2);line-height:1.8;}
.screen-badge{position:absolute;top:10px;right:10px;padding:3px 10px;border-radius:6px;font-size:8px;font-weight:700;background:rgba(0,229,255,.1);color:var(--cyan);border:1px solid rgba(0,229,255,.22);backdrop-filter:blur(4px);text-transform:uppercase;letter-spacing:1px;}

/* ═══ FEATURES ═══ */
.features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;}
.feat{padding:26px;background:rgba(6,7,26,.7);border:1px solid var(--b);border-radius:14px;transition:.28s;position:relative;overflow:hidden;}
.feat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--cyan),transparent);opacity:0;transition:.28s;}
.feat:hover{border-color:var(--cyan2);background:rgba(0,229,255,.025);transform:translateY(-4px);box-shadow:0 16px 40px rgba(0,229,255,.06);}
.feat:hover::before{opacity:1;}
.feat-icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;flex-shrink:0;transition:.22s;}
.feat:hover .feat-icon{transform:scale(1.08);}
.feat-title{font-family:'Orbitron',sans-serif;font-size:10.5px;font-weight:700;color:white;margin-bottom:8px;letter-spacing:.3px;}
.feat-desc{font-size:10.5px;color:var(--text2);line-height:1.9;}
.feat-tag{display:inline-flex;align-items:center;gap:5px;margin-top:14px;padding:3px 10px;border-radius:6px;font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;}

/* ═══ HOW IT WORKS ═══ */
.how-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;}
.step-card{text-align:center;padding:32px 22px;background:rgba(6,7,26,.7);border:1px solid var(--b);border-radius:14px;transition:.25s;position:relative;overflow:hidden;}
.step-card:hover{border-color:var(--cyan2);transform:translateY(-4px);box-shadow:0 16px 40px rgba(0,229,255,.07);}
.step-num-wrap{width:56px;height:56px;border-radius:50%;border:1.5px solid rgba(0,229,255,.3);background:rgba(0,229,255,.04);display:flex;align-items:center;justify-content:center;font-family:'Orbitron',sans-serif;font-size:20px;font-weight:900;color:var(--cyan);margin:0 auto 18px;transition:.25s;box-shadow:0 0 0 0 rgba(0,229,255,0);}
.step-card:hover .step-num-wrap{border-color:var(--cyan);background:rgba(0,229,255,.1);box-shadow:0 0 28px rgba(0,229,255,.18);}
.step-title{font-size:12px;font-weight:600;color:white;margin-bottom:9px;letter-spacing:.3px;}
.step-desc{font-size:10px;color:var(--text2);line-height:1.85;}

/* Code demo */
.code-demo{max-width:720px;margin:40px auto 0;background:rgba(6,7,26,.9);border:1px solid var(--b);border-radius:14px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,229,255,.04) inset,0 20px 60px rgba(0,0,0,.5);backdrop-filter:blur(10px);}
.code-top{padding:10px 16px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:8px;background:rgba(13,14,40,.8);}
.code-dots{display:flex;gap:6px;}
.cd{width:10px;height:10px;border-radius:50%;cursor:default;}
.cd1{background:rgba(255,95,86,.75);} .cd2{background:rgba(254,188,46,.65);} .cd3{background:rgba(40,200,64,.6);}
.code-lbl{font-size:9px;color:var(--dim);margin-left:6px;flex:1;}
.code-tag{font-size:8px;padding:2px 8px;border-radius:5px;background:rgba(0,229,255,.08);color:var(--cyan);border:1px solid rgba(0,229,255,.15);}
.code-body{padding:16px 20px;font-size:10.5px;line-height:1.75;overflow-x:auto;}
.code-body .k{color:#cc55ff} .code-body .s{color:var(--green)}
.code-body .c{color:var(--dim);font-style:italic} .code-body .n{color:var(--cyan)} .code-body .v{color:var(--yellow)}
.code-result{margin:0 14px 14px;padding:10px 14px;background:rgba(0,255,170,.05);border-radius:8px;border:1px solid rgba(0,255,170,.15);font-size:10px;display:flex;align-items:center;gap:8px;color:var(--green);}

/* ═══ AI MODELS ═══ */
.models-wrap{max-width:1000px;margin:0 auto;}
.model-category{display:flex;align-items:center;gap:10px;margin:22px 0 10px;}
.mc-label{font-size:8.5px;color:var(--text2);text-transform:uppercase;letter-spacing:2px;white-space:nowrap;}
.mc-line{flex:1;height:1px;background:var(--b);}
.models-grid{display:flex;flex-wrap:wrap;gap:10px;}
.model-chip{
  padding:8px 14px;border:1px solid var(--b);border-radius:20px;
  font-size:10px;color:var(--text);background:rgba(6,7,26,.7);
  display:flex;align-items:center;gap:8px;transition:.18s;
  position:relative;cursor:default;
}
.model-chip:hover{border-color:var(--cyan2);color:var(--cyan);background:rgba(0,229,255,.04);}
.model-icon-wrap{
  width:18px;height:18px;border-radius:4px;flex-shrink:0;overflow:hidden;
  display:flex;align-items:center;justify-content:center;
}
.model-chip.is-new{border-color:rgba(255,45,107,.28);background:rgba(255,45,107,.04);}
.model-chip.is-new:hover{border-color:rgba(255,45,107,.5);}
.model-chip.is-soon{opacity:.4;cursor:default;}
.model-chip.is-soon:hover{border-color:var(--b);color:var(--text);background:rgba(6,7,26,.7);}
.mbadge{font-size:7.5px;padding:2px 7px;border-radius:5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
.mbadge.free{background:rgba(0,255,170,.1);color:var(--green);}
.mbadge.cr{background:rgba(0,229,255,.08);color:var(--cyan);}
.mbadge.new{background:rgba(255,45,107,.12);color:var(--pink);animation:newPulse 2.2s infinite;}
.mbadge.soon{background:rgba(255,214,0,.08);color:var(--yellow);}
@keyframes newPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,45,107,.3);}50%{box-shadow:0 0 0 4px rgba(255,45,107,0);}}

/* ═══ GATE ═══ */
.gate-section{padding:88px 24px;text-align:center;position:relative;z-index:1;}
.gate-box{max-width:500px;margin:0 auto;padding:52px 40px;background:rgba(6,7,26,.85);border:1px solid var(--b);border-radius:22px;position:relative;overflow:hidden;box-shadow:0 0 0 1px rgba(0,229,255,.04) inset,0 40px 80px rgba(0,0,0,.6),0 0 60px rgba(136,0,255,.06);backdrop-filter:blur(12px);}
.gate-box::before{content:'';position:absolute;top:0;left:0;right:0;height:2.5px;background:linear-gradient(90deg,var(--purple),var(--cyan),var(--purple));opacity:.8;}
.gate-glow{position:absolute;bottom:-70px;left:50%;transform:translateX(-50%);width:260px;height:140px;background:rgba(136,0,255,.18);filter:blur(50px);pointer-events:none;}
.gate-icon{width:64px;height:64px;border-radius:18px;background:rgba(136,0,255,.1);border:1px solid rgba(136,0,255,.22);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;box-shadow:0 0 30px rgba(136,0,255,.12);}
.gate-title{font-family:'Orbitron',sans-serif;font-size:18px;color:white;margin-bottom:12px;letter-spacing:.5px;}
.gate-sub{font-size:10.5px;color:var(--text2);margin-bottom:28px;line-height:1.9;}
.gate-btn{display:inline-flex;align-items:center;gap:8px;padding:13px 34px;background:linear-gradient(135deg,var(--purple),var(--cyan));border:none;border-radius:10px;color:white;font-family:'Orbitron',sans-serif;font-size:10.5px;font-weight:700;cursor:pointer;transition:.22s;text-decoration:none;letter-spacing:1px;position:relative;overflow:hidden;box-shadow:0 6px 24px rgba(136,0,255,.3);}
.gate-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(120deg,transparent 40%,rgba(255,255,255,.08) 50%,transparent 60%);transform:translateX(-100%);transition:transform .4s ease;}
.gate-btn:hover::after{transform:translateX(100%);}
.gate-btn:hover{opacity:.88;transform:translateY(-2px);box-shadow:0 12px 40px rgba(136,0,255,.4);}
.gate-note{margin-top:18px;font-size:9px;color:var(--dim);line-height:1.8;}
.gate-note span{color:var(--green);}

/* ═══ CTA ═══ */
.cta-section{padding:88px 24px;text-align:center;position:relative;z-index:1;}
.cta-box{max-width:640px;margin:0 auto;padding:56px 44px;background:rgba(6,7,26,.85);border:1px solid var(--b);border-radius:22px;position:relative;overflow:hidden;box-shadow:0 0 0 1px rgba(0,229,255,.04) inset,0 40px 80px rgba(0,0,0,.6);backdrop-filter:blur(12px);}
.cta-box::before{content:'';position:absolute;top:0;left:0;right:0;height:2.5px;background:linear-gradient(90deg,var(--cyan),var(--purple),var(--pink));}
.cta-free{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;margin-bottom:20px;background:rgba(0,255,170,.07);border:1px solid rgba(0,255,170,.2);border-radius:20px;font-size:9px;color:var(--green);font-weight:700;letter-spacing:1px;}
.cta-title{font-family:'Orbitron',sans-serif;font-size:clamp(18px,3vw,28px);font-weight:900;color:white;margin-bottom:13px;}
.cta-sub{font-size:11px;color:var(--text2);margin-bottom:30px;line-height:1.95;}
.cta-actions{display:flex;flex-direction:column;align-items:center;gap:12px;}
.cta-discord{display:inline-flex;align-items:center;gap:7px;font-size:10px;color:var(--text2);text-decoration:none;transition:.15s;padding:8px 14px;border-radius:8px;border:1px solid transparent;}
.cta-discord:hover{color:var(--cyan);border-color:var(--b);}
.cta-meta{margin-top:20px;font-size:9px;color:var(--dim);line-height:1.95;}
.cta-meta span{color:var(--green);}

/* ═══ BUTTONS ═══ */
.btn-primary {
  padding:13px 34px;background:linear-gradient(135deg,var(--cyan),var(--purple));border:none;border-radius:10px;color:white;font-family:'Orbitron',sans-serif;font-size:10.5px;font-weight:700;cursor:pointer;text-decoration:none;letter-spacing:1.5px;transition:.22s;display:inline-flex;align-items:center;gap:9px;position:relative;overflow:hidden;box-shadow:0 4px 20px rgba(0,229,255,.2);
}
.btn-primary::after{content:'';position:absolute;inset:0;background:linear-gradient(120deg,transparent 40%,rgba(255,255,255,.08) 50%,transparent 60%);transform:translateX(-100%);transition:transform .4s ease;}
.btn-primary:hover::after{transform:translateX(100%);}
.btn-primary:hover{opacity:.86;transform:translateY(-2px);box-shadow:0 10px 36px rgba(0,229,255,.3);}
.btn-primary:active{transform:translateY(0) scale(.98);}
.btn-secondary {
  padding:12px 26px;border:1px solid var(--b);border-radius:10px;color:var(--text);font-size:10.5px;cursor:pointer;text-decoration:none;transition:.2s;display:inline-flex;align-items:center;gap:8px;backdrop-filter:blur(6px);font-family:'JetBrains Mono',monospace;background:rgba(0,229,255,.03);
}
.btn-secondary:hover{border-color:var(--cyan2);color:var(--cyan);background:rgba(0,229,255,.07);transform:translateY(-1px);}

/* ═══ FOOTER ═══ */
footer{padding:32px 32px;border-top:1px solid var(--b);position:relative;z-index:1;background:linear-gradient(0deg,rgba(6,7,26,.6),transparent);}
.footer-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;}
.footer-brand-wrap{display:flex;align-items:center;gap:10px;}
.footer-brand{font-family:'Orbitron',sans-serif;font-size:12px;font-weight:900;letter-spacing:2px;background:linear-gradient(135deg,var(--cyan),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.footer-online{display:flex;align-items:center;gap:5px;font-size:8.5px;color:var(--green);}
.footer-online-dot{width:5px;height:5px;border-radius:50%;background:var(--green);animation:liveDot 1.8s infinite;}
.footer-links{display:flex;gap:20px;flex-wrap:wrap;}
.footer-links a{font-size:10px;color:var(--dim);text-decoration:none;transition:.15s;}
.footer-links a:hover{color:var(--cyan);}
.footer-copy{font-size:9px;color:var(--dim);}

/* ═══ RESPONSIVE ═══ */

/* Tablet */
@media(max-width:1024px){
  .hg-side{ display:none; }
  .hero-games-stage{ height:300px; }
  .hg-center{ width:340px; }
  .hg-main-wrap{ height:230px; }
  .features-grid{ grid-template-columns:repeat(2,1fr); }
}

/* Mobile large */
@media(max-width:768px){
  .nav{ padding:0 16px; height:52px; }
  .nav.scrolled{ height:44px; }
  .nav-sub,.nav-divider,.nav-live{ display:none; }
  .nav-discord{ display:none; }
  .nav-menu-btn{ display:flex; align-items:center; justify-content:center; }
  .nav-r .nav-login{ display:none; }

  .hero{ padding:88px 16px 48px; }
  .hero-title{ font-size:clamp(26px,7vw,42px); }
  .hero-badge{ font-size:8px; padding:5px 14px; }
  .hero-games-stage{ height:auto; margin-top:32px; }
  .hg-center{
    position:relative; left:auto; top:auto;
    transform:none; width:100%; margin:0 auto;
  }
  .hg-main-wrap{ height:200px; border-radius:12px; }
  .hero-stats{ gap:20px; margin-top:32px; }
  .stat-n{ font-size:20px; }
  .stat-divider{ display:none; }

  .hero-prompt-wrap{ margin-top:24px; }
  .hero-prompt-box{ padding:5px 5px 5px 14px; border-radius:12px; }
  .hero-prompt-input{ font-size:12px; min-height:44px; }
  .hero-prompt-btn{ padding:10px 16px; font-size:9px; }
  .hero-prompt-examples{ display:none; }

  .section{ padding:56px 16px; }
  .mystery{ padding:64px 16px; }
  .screenshots-section{ padding:64px 16px; }
  .gate-section,.cta-section{ padding:56px 16px; }
  .gate-box{ padding:32px 20px; }
  .cta-box{ padding:32px 20px; }

  .hint-grid{ grid-template-columns:1fr 1fr; }
  .how-grid{ grid-template-columns:1fr; }
  .features-grid{ grid-template-columns:1fr; }
  .screen-grid{ grid-template-columns:1fr; }

  footer{ padding:24px 16px; }
  .footer-inner{ flex-direction:column; text-align:center; }
  .footer-links{ justify-content:center; }
  .footer-brand-wrap{ justify-content:center; }

  .code-body{ font-size:9.5px; }
}

/* Mobile small */
@media(max-width:480px){
  .hero-title{ font-size:clamp(24px,8vw,36px); }
  .hint-grid{ grid-template-columns:1fr; }
  .models-grid{ justify-content:center; }
  .gate-box,.cta-box{ padding:26px 14px; }
  .hg-main-wrap{ height:180px; }
  .hero-stats{ gap:16px; }
  .stat-n{ font-size:18px; }
  .stat-l{ font-size:7.5px; }
  .step-card{ padding:24px 16px; }
  .feat{ padding:20px; }
  .btn-primary,.btn-secondary{ width:100%; justify-content:center; }
}
`;

/* ─── Game data with prompts ─── */
const GAMES = [
  {
    file: '99_nights_in_the_forest',
    name: '99 Nights in the Forest',
    genre: 'Adventure RPG',
    prompt: 'Make an open world forest RPG with day/night cycle',
  },
  {
    file: 'dead_rails',
    name: 'Dead Rails',
    genre: 'Survival',
    prompt: 'Make a zombie survival on a moving train',
  },
  {
    file: 'escape_tsunami_for_brainrot',
    name: 'Escape Tsunami',
    genre: 'Obby',
    prompt: 'Make a disaster escape obby with rising water',
  },
  {
    file: 'fish_it',
    name: 'Fish It!',
    genre: 'Simulator',
    prompt: 'Make a fishing simulator with rare fish and shop',
  },
  {
    file: 'fps_flick',
    name: 'FPS Flick',
    genre: 'Shooter',
    prompt: 'Make a first-person shooter with aim training',
  },
  {
    file: 'grow_a_garden',
    name: 'Grow a Garden',
    genre: 'Tycoon',
    prompt: 'Make a garden tycoon with crops and selling system',
  },
  {
    file: 'raft_tycoon',
    name: 'Raft Tycoon',
    genre: 'Tycoon',
    prompt: 'Make a raft builder tycoon on the ocean',
  },
  {
    file: 'shooter',
    name: 'Shooter',
    genre: 'PvP',
    prompt: 'Make a team-based PvP shooter with killstreak rewards',
  },
  {
    file: 'steal_a_brainrot',
    name: 'Steal a Brainrot',
    genre: 'Comedy',
    prompt: 'Make a comedy heist game with silly characters',
  },
  {
    file: 'the_forge',
    name: 'The Forge',
    genre: 'Fantasy RPG',
    prompt: 'Make a fantasy smithing game with upgrade system',
  },
];

const EXAMPLE_PROMPTS = [
  'Make a police roleplay game...',
  'Make a zombie survival game...',
  'Make an oil tycoon...',
  'Make a mansion obby...',
  'Make a shop with coins system...',
  'Make a racing game with leaderboards...',
];

const imgFail = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const el = e.target as HTMLImageElement;
  el.style.background = 'linear-gradient(135deg,rgba(0,229,255,.08),rgba(136,0,255,.08))';
  el.style.display = 'block';
  el.src = '';
};

/* ─── Hero Game Carousel ─── */
function HeroGames({ onPromptClick }: { onPromptClick: (p: string) => void }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [phase, setPhase] = useState<'active' | 'leaving' | 'entering'>('active');
  const nextIdx = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = (idx: number) => {
    if (idx === activeIdx || phase !== 'active') return;
    nextIdx.current = idx;
    setPhase('leaving');
  };

  useEffect(() => {
    if (phase === 'leaving') {
      const t = setTimeout(() => { setActiveIdx(nextIdx.current); setPhase('entering'); }, 380);
      return () => clearTimeout(t);
    }
    if (phase === 'entering') {
      const t = setTimeout(() => setPhase('active'), 60);
      return () => clearTimeout(t);
    }
  }, [phase]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      const nxt = (activeIdx + 1) % GAMES.length;
      nextIdx.current = nxt;
      setPhase('leaving');
    }, 3500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeIdx]);

  const sideLeft = GAMES.slice(0, 3);
  const sideRight = GAMES.slice(7, 10);

  return (
    <div className="hero-games-stage">
      {/* Left cards */}
      <div className="hg-side hg-left">
        {sideLeft.map((g, i) => (
          <div key={g.file} className="hg-card" onClick={() => goTo(i)}>
            <img
              src={`/screenshot/game/${g.file}.webp`}
              alt={g.name}
              className="hg-card-thumb"
              onError={imgFail}
            />
            <div className="hg-card-info">
              <div className="hg-card-label">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {g.genre}
              </div>
              <div className="hg-card-name">{g.name}</div>
              <div className="hg-card-prompt">"{g.prompt}"</div>
            </div>
          </div>
        ))}
      </div>

      {/* Center */}
      <div className="hg-center">
        <div className="hg-main-wrap">
          {GAMES.map((g, i) => (
            <img
              key={g.file}
              src={`/screenshot/game/${g.file}.webp`}
              alt={g.name}
              className={`hg-main-img ${
                i === activeIdx
                  ? phase === 'leaving' ? 'leaving' : 'active'
                  : 'entering'
              }`}
              style={{ zIndex: i === activeIdx ? 2 : 1 }}
              onError={imgFail}
            />
          ))}
          <div className="hg-main-overlay">
            <div className="hg-main-name">{GAMES[activeIdx].name}</div>
            <div className="hg-main-tag">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              {GAMES[activeIdx].genre}
            </div>
            <div
              className="hg-main-prompt"
              onClick={() => onPromptClick(GAMES[activeIdx].prompt)}
              title="Click to use this prompt"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              "{GAMES[activeIdx].prompt}"
            </div>
          </div>
        </div>
        <div className="hg-dots">
          {GAMES.map((_, i) => (
            <div
              key={i}
              className={`hg-dot${i === activeIdx ? ' active' : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>

      {/* Right cards */}
      <div className="hg-side hg-right">
        {sideRight.map((g, i) => (
          <div key={g.file} className="hg-card" onClick={() => goTo(7 + i)}>
            <img
              src={`/screenshot/game/${g.file}.webp`}
              alt={g.name}
              className="hg-card-thumb"
              onError={imgFail}
            />
            <div className="hg-card-info">
              <div className="hg-card-label">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {g.genre}
              </div>
              <div className="hg-card-name">{g.name}</div>
              <div className="hg-card-prompt">"{g.prompt}"</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Prompt Box ─── */
function HeroPrompt({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [exIdx, setExIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setExIdx(i => (i + 1) % EXAMPLE_PROMPTS.length), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="hero-prompt-wrap">
      <div className="hero-prompt-box">
        <textarea
          className="hero-prompt-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={EXAMPLE_PROMPTS[exIdx]}
          rows={1}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (value.trim()) window.location.href = '/login';
            }
          }}
        />
        <button className="hero-prompt-btn" onClick={() => window.location.href = '/login'}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Generate
        </button>
      </div>
      <div className="hero-prompt-examples">
        {EXAMPLE_PROMPTS.slice(0, 4).map((ex, i) => (
          <div key={i} className="hero-prompt-ex" onClick={() => onChange(ex)}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {ex}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Mobile Nav Menu ─── */
function MobileMenu({ open }: { open: boolean }) {
  return (
    <div className={`nav-mobile-menu${open ? ' open' : ''}`}>
      <a href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noopener" className="nav-mobile-item">
        <DiscordIcon size={14} />
        Discord Community
      </a>
      <a href="#mystery" className="nav-mobile-item">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        What is NEXUS AI
      </a>
      <a href="#features" className="nav-mobile-item">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        Features
      </a>
      <a href="/login" className="nav-mobile-item primary">
        Enter NEXUS AI — Free
      </a>
    </div>
  );
}

/* ─── Feature data ─── */
const FEATURES = [
  {
    iconBg: 'rgba(0,229,255,.08)', iconColor: 'var(--cyan)',
    icon: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
    title: 'Direct Studio Injection',
    desc: 'Scripts, parts, GUIs — AI creates everything directly in Roblox Studio via the companion plugin. No manual copy-paste, ever.',
    tagBg: 'rgba(0,229,255,.07)', tagColor: 'var(--cyan)', tagLabel: 'Plugin Required', delay: 'd1',
  },
  {
    iconBg: 'rgba(136,0,255,.08)', iconColor: '#cc55ff',
    icon: <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />,
    title: 'Multi-Model AI',
    desc: 'Switch between Gemini, DeepSeek, Step — all fine-tuned to write production-quality Lua for Roblox.',
    tagBg: 'rgba(0,255,170,.07)', tagColor: 'var(--green)', tagLabel: 'Many Free', delay: 'd2',
  },
  {
    iconBg: 'rgba(0,255,170,.07)', iconColor: 'var(--green)',
    icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
    title: 'Visual GUI Builder',
    desc: 'Design your UI visually, then export as Lua or send directly to Studio with one click.',
    tagBg: 'rgba(0,255,170,.07)', tagColor: 'var(--green)', tagLabel: 'Drag & Drop', delay: 'd3',
  },
  {
    iconBg: 'rgba(255,214,0,.07)', iconColor: 'var(--yellow)',
    icon: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    title: 'Auto Play-Test & Fix',
    desc: 'After building, AI runs a play-test automatically. Console errors? AI stops, reads, and re-injects a fix on its own.',
    tagBg: 'rgba(255,214,0,.08)', tagColor: 'var(--yellow)', tagLabel: 'Auto-Fix', delay: 'd4',
  },
  {
    iconBg: 'rgba(255,45,107,.07)', iconColor: 'var(--pink)',
    icon: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    title: '@ Mention System',
    desc: 'Type @ to mention any script or object. AI reads it, understands it, and builds on top of it intelligently.',
    tagBg: 'rgba(0,229,255,.07)', tagColor: 'var(--cyan)', tagLabel: 'Context-Aware', delay: 'd5',
  },
  {
    iconBg: 'rgba(0,229,255,.07)', iconColor: 'var(--cyan)',
    icon: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    title: 'Roblox Account Sync',
    desc: 'Credits, history, and projects tied to your Roblox account. Persistent across every device automatically.',
    tagBg: 'rgba(255,214,0,.08)', tagColor: 'var(--yellow)', tagLabel: 'Persistent', delay: 'd6',
  },
];

/* ─── AI Models ─── */
const AI_MODELS = [
  {
    label: 'Google Gemini',
    models: [
      { name: 'Gemini 3.5 Flash', badge: 'new' as const, cls: 'is-new', IconComp: GeminiIcon },
      { name: 'Gemini 3.1 Pro',   badge: 'cr'  as const, cls: 'is-new', IconComp: GeminiIcon },
    ],
  },
  {
    label: 'DeepSeek',
    models: [
      { name: 'DeepSeek V4 Pro', badge: 'new' as const, cls: 'is-new', IconComp: DeepSeekIcon },
    ],
  },
  {
    label: 'Step Fun',
    models: [
      { name: 'Step 3.5 Flash', badge: 'new' as const, cls: 'is-new', IconComp: StepFunIcon },
    ],
  },
  {
    label: 'Coming Soon',
    models: [
      { name: 'Claude Sonnet', badge: 'soon' as const, cls: 'is-soon', IconComp: ClaudeIcon },
      { name: 'Claude Opus',   badge: 'soon' as const, cls: 'is-soon', IconComp: ClaudeIcon },
      { name: 'GPT-5.5',       badge: 'soon' as const, cls: 'is-soon', IconComp: GPTIcon },
    ],
  },
];

/* ─── Main Component ─── */
export default function HomePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [promptVal, setPromptVal] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  /* Matrix rain */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const chars = '01アイウエオカキクABCDEF{}[];=><Lua';
    const fs = 11;
    let cols = Math.floor(canvas.width / fs);
    const drops: number[] = Array(cols).fill(1);
    const draw = () => {
      ctx.fillStyle = 'rgba(3,3,18,.055)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fs}px 'JetBrains Mono',monospace`;
      cols = Math.floor(canvas.width / fs);
      while (drops.length < cols) drops.push(1);
      for (let i = 0; i < cols; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = `rgba(0,229,255,${0.025 + Math.random() * 0.055})`;
        ctx.fillText(ch, i * fs, drops[i] * fs);
        if (drops[i] * fs > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };
    const id = setInterval(draw, 60);
    return () => { clearInterval(id); window.removeEventListener('resize', resize); };
  }, []);

  useEffect(() => {
    /* Particles */
    const container = document.getElementById('particles');
    if (container) {
      for (let i = 0; i < 28; i++) {
        const el = document.createElement('div');
        el.className = 'p';
        const sz = Math.random() * 3.5 + 1;
        const isCyan = Math.random() > 0.45;
        el.style.cssText =
          `width:${sz}px;height:${sz}px;left:${Math.random() * 100}%;` +
          `background:rgba(${isCyan ? '0,229,255' : '136,0,255'},${Math.random() * 0.3 + 0.07});` +
          `box-shadow:0 0 6px rgba(${isCyan ? '0,229,255' : '136,0,255'},.3);` +
          `animation-duration:${Math.random() * 16 + 9}s;animation-delay:${Math.random() * 14}s;`;
        container.appendChild(el);
      }
    }

    /* Navbar scroll */
    const navbar = document.getElementById('navbar');
    const handleScroll = () => navbar?.classList.toggle('scrolled', window.scrollY > 60);
    window.addEventListener('scroll', handleScroll, { passive: true });

    /* Hero scroll btn */
    const heroScroll = document.getElementById('heroScroll');
    heroScroll?.addEventListener('click', () =>
      document.getElementById('mystery')?.scrollIntoView({ behavior: 'smooth' })
    );

    /* Scroll reveal */
    const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
    const checkReveal = () => {
      const wh = window.innerHeight;
      els.forEach(el => { if (el.getBoundingClientRect().top < wh - 60) el.classList.add('active'); });
    };
    window.addEventListener('scroll', checkReveal, { passive: true });
    window.addEventListener('resize', checkReveal, { passive: true });
    setTimeout(checkReveal, 120);

    /* Auth check */
    try {
      const s = localStorage.getItem('nexus_session');
      if (s) {
        const p = JSON.parse(s);
        if (p?.user?.username && p.loginTime && Date.now() - p.loginTime < 86400000 * 7) {
          window.location.replace('/dashboard');
          return;
        }
      }
    } catch { localStorage.removeItem('nexus_session'); }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', checkReveal);
      window.removeEventListener('resize', checkReveal);
    };
  }, []);

  const handleGamePrompt = (p: string) => setPromptVal(p);

  return (
    <>
      <style>{CSS}</style>

      {/* BG */}
      <canvas ref={canvasRef} className="hp-canvas" />
      <div className="hp-grid" />
      <div className="hp-scanlines" />
      <div className="particles" id="particles" />
      <div className="orbs">
        <div className="orb orb1" />
        <div className="orb orb2" />
        <div className="orb orb3" />
      </div>

      {/* NAVBAR */}
      <nav className="nav" id="navbar">
        <a href="/" className="nav-logo-wrap">
          <div className="nav-logo-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <span className="nav-logo">NEXUS AI</span>
        </a>
        <div className="nav-divider" />
        <span className="nav-sub">Roblox Dev Intelligence</span>
        <div className="nav-live">
          <div className="nav-live-dot" />
          Live
        </div>
        <div className="nav-r">
          <a href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noopener" className="nav-discord">
            <DiscordIcon size={13} />
            Discord
          </a>
          <a href="/login" className="nav-login">
            <svg width="11" height="11" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Enter
          </a>
          <button className="nav-menu-btn" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {menuOpen
                ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                : <><line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" /></>
              }
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <MobileMenu open={menuOpen} />

      {/* HERO */}
      <section className="hero" id="top">
        <div className="hero-badge">
          <div className="badge-dot" />
          Roblox Studio · Direct Injection · AI Agent
        </div>

        <h1 className="hero-title">
          Build The Game<br />
          <span className="grad">Only You Can Imagine</span>
        </h1>

        <HeroPrompt value={promptVal} onChange={setPromptVal} />
        <HeroGames onPromptClick={handleGamePrompt} />

        <div className="hero-stats">
          <div className="stat"><div className="stat-n">Free</div><div className="stat-l">To Start</div></div>
          <div className="stat-divider" />
          <div className="stat"><div className="stat-n">7+</div><div className="stat-l">AI Models</div></div>
          <div className="stat-divider" />
          <div className="stat"><div className="stat-n">Direct</div><div className="stat-l">Injection</div></div>
          <div className="stat-divider" />
          <div className="stat"><div className="stat-n">∞</div><div className="stat-l">Potential</div></div>
        </div>

        <div className="hero-scroll" id="heroScroll" role="button" aria-label="Scroll down">
          <svg width="22" height="22" viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </section>

      {/* WHAT IS NEXUS AI */}
      <div className="mystery" id="mystery">
        <div className="mystery-inner">
          <div className="mystery-eyebrow reveal">What is NEXUS AI?</div>
          <h2 className="mystery-title reveal d1">
            The AI That Lives<br />
            <span style={{ color: 'var(--cyan)' }}>Inside Your Studio</span>
          </h2>
          <p className="mystery-sub reveal d2">
            Most AI tools give you code you still have to copy, paste, organize, test, and fix.<br />
            NEXUS AI skips all of that — it injects scripts, GUIs, parts, and full systems
            directly into your Roblox place. Just describe what you want.
          </p>
          <div className="mystery-lock reveal d2">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Full capabilities revealed after login
          </div>
          <div className="hint-grid">
            {[
              { icon: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />, color: 'var(--cyan)',   title: 'Zero Copy-Paste',   desc: 'Every script goes directly into Roblox Studio via plugin. Type once, it appears instantly.', delay: 'd1' },
              { icon: <><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>, color: 'var(--purple)', title: 'Studio-Aware AI', desc: 'The AI sees your workspace. It knows what scripts exist and builds on top of them.', delay: 'd2' },
              { icon: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />, color: 'var(--green)',  title: 'Natural Language', desc: 'No technical syntax needed. Describe "make a shop with coins" and it happens.', delay: 'd3' },
              { icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, color: 'var(--yellow)', title: 'Auto Test & Fix',  desc: 'AI runs a play-test after building. Console errors appear? It self-fixes automatically.', delay: 'd4' },
            ].map((h, i) => (
              <div key={i} className={`hint-card reveal ${h.delay}`}>
                <div className="hint-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={h.color} strokeWidth="2">{h.icon}</svg>
                </div>
                <div className="hint-title">{h.title}</div>
                <div className="hint-sub">{h.desc}</div>
              </div>
            ))}
          </div>
          <a href="/login" className="btn-primary reveal d3" style={{ display: 'inline-flex' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Unlock Everything
          </a>
        </div>
      </div>

      {/* SCREENSHOTS */}
      <div className="screenshots-section" id="screenshots">
        <div style={{ textAlign:'center', marginBottom:'44px', maxWidth:'600px', marginLeft:'auto', marginRight:'auto' }}>
          <div className="sec-eyebrow reveal">See It In Action</div>
          <h2 className="sec-title reveal d1">From Prompt to Studio</h2>
          <p className="sec-sub reveal d2" style={{ marginBottom:0 }}>
            Watch an idea transform into real Roblox content in under 5 seconds.
          </p>
        </div>
        <div className="screen-grid">
          {[
            { badge: 'Web',       img: '/screenshot/screen1.png', alt: 'Chat Interface',  iconColor: 'var(--cyan)',   icon: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />, title: 'Chat Interface',   desc: 'Type your request in plain English. NEXUS AI breaks it into precise actions and executes immediately.', delay: 'd1' },
            { badge: 'Plugin',    img: '/screenshot/screen2.png', alt: 'Studio Plugin',   iconColor: 'var(--green)',  icon: <><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" /><line x1="16" y1="8" x2="2" y2="22" /></>, title: 'Studio Plugin',   desc: 'The companion plugin in Roblox Studio — connected, listening, injecting in real-time with zero lag.', delay: 'd2' },
            { badge: 'Connected', img: '/screenshot/screen3.png', alt: 'Live Injection',  iconColor: 'var(--yellow)', icon: <polyline points="20 6 9 17 4 12" />, title: 'Live & Injecting', desc: 'Every AI command materializes in your place — parts, scripts, GUIs, full systems — all live.', delay: 'd3' },
          ].map((s, i) => (
            <div key={i} className={`screen-card reveal ${s.delay}`}>
              <span className="screen-badge">{s.badge}</span>
              <img
                src={s.img}
                alt={s.alt}
                className="screen-card-img"
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15'; }}
              />
              <div className="screen-card-body">
                <div className="screen-card-title">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={s.iconColor} strokeWidth="2">{s.icon}</svg>
                  {s.title}
                </div>
                <div className="screen-card-desc">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <section className="section" id="features">
        <div className="sec-eyebrow reveal">Core Capabilities</div>
        <h2 className="sec-title reveal d1">Built for Serious Developers</h2>
        <p className="sec-sub reveal d2">
          Every tool you need to build a complete Roblox game, powered by AI that actually understands Studio.
        </p>
        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <div key={i} className={`feat reveal ${f.delay}`}>
              <div className="feat-icon" style={{ background: f.iconBg }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={f.iconColor} strokeWidth="2">{f.icon}</svg>
              </div>
              <div className="feat-title">{f.title}</div>
              <div className="feat-desc">{f.desc}</div>
              <span className="feat-tag" style={{ background: f.tagBg, color: f.tagColor }}>{f.tagLabel}</span>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" style={{ paddingTop: 0 }} id="how">
        <div className="sec-eyebrow reveal">Setup</div>
        <h2 className="sec-title reveal d1">3 Steps. That&apos;s It.</h2>
        <p className="sec-sub reveal d2">One-time setup, then infinite creation.</p>
        <div className="how-grid">
          {[
            { n: '1', title: 'Login & Verify',   desc: 'Sign in with your Roblox account. Get 30 free credits instantly — no credit card, no commitment.', delay: 'd1' },
            { n: '2', title: 'Install Plugin',   desc: 'Install the NEXUS AI plugin from Creator Store. Open Studio, click Connect — green light means ready.', delay: 'd2' },
            { n: '3', title: 'Describe & Build', desc: 'Type what you want. AI builds, injects, tests. Your game grows while you watch.', delay: 'd3' },
          ].map((s, i) => (
            <div key={i} className={`step-card reveal ${s.delay}`}>
              <div className="step-num-wrap">{s.n}</div>
              <div className="step-title">{s.title}</div>
              <div className="step-desc">{s.desc}</div>
            </div>
          ))}
        </div>
        <div className="code-demo reveal d2">
          <div className="code-top">
            <div className="code-dots">
              <span className="cd cd1" /><span className="cd cd2" /><span className="cd cd3" />
            </div>
            <span className="code-lbl">AI Studio Pipeline</span>
            <span className="code-tag">Live Example</span>
          </div>
          <div className="code-body">
            <div><span className="c">{'// User: "build a shop with coins and buy button"'}</span></div>
            <div style={{ marginTop:8 }}><span className="c">{'// AI generates & sends to Studio:'}</span></div>
            <div style={{ marginTop:6 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;batch_commands&quot;</span>, <span className="n">&quot;commands&quot;</span>: [</div>
            <div style={{ marginLeft:16 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;create_remote&quot;</span>, <span className="n">&quot;name&quot;</span>: <span className="s">&quot;BuyItem&quot;</span> <span className="k">{'}'}</span>,</div>
            <div style={{ marginLeft:16 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;inject_script&quot;</span>, <span className="n">&quot;name&quot;</span>: <span className="s">&quot;ShopServer&quot;</span> <span className="k">{'}'}</span>,</div>
            <div style={{ marginLeft:16 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;create_gui&quot;</span>, <span className="n">&quot;name&quot;</span>: <span className="s">&quot;ShopGUI&quot;</span> <span className="k">{'}'}</span>,</div>
            <div style={{ marginLeft:16 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;play_test&quot;</span>, <span className="n">&quot;duration&quot;</span>: <span className="v">15</span> <span className="k">{'}'}</span></div>
            <div>] <span className="k">{'}'}</span></div>
          </div>
          <div className="code-result">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            4 commands executed · Shop built · Auto-tested · Zero errors
          </div>
        </div>
      </section>

      {/* AI MODELS */}
      <section className="section" style={{ paddingTop: 0 }} id="models">
        <div className="sec-eyebrow reveal">AI Models</div>
        <h2 className="sec-title reveal d1">Best-in-Class Model Selection</h2>
        <p className="sec-sub reveal d2">Handpicked models for speed, precision, and Roblox expertise. Many are completely free.</p>
        <div className="models-wrap reveal d2">
          {AI_MODELS.map((cat, i) => (
            <div key={i}>
              <div className="model-category">
                <div className="mc-line" />
                <div className="mc-label">{cat.label}</div>
                <div className="mc-line" />
              </div>
              <div className="models-grid">
                {cat.models.map((m, j) => (
                  <div key={j} className={`model-chip ${m.cls || ''}`}>
                    <div className="model-icon-wrap">
                      <m.IconComp size={16} />
                    </div>
                    {m.name}
                    <span className={`mbadge ${m.badge}`}>{m.badge.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* GATE */}
      <div className="gate-section" id="gate">
        <div className="gate-box reveal-scale">
          <div className="gate-glow" />
          <div className="gate-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#cc55ff" strokeWidth="1.8">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              <circle cx="12" cy="16" r="1" fill="#cc55ff" />
            </svg>
          </div>
          <div className="gate-title">The Rest is Inside</div>
          <div className="gate-sub">
            Projects, dashboard, full model access, credit system, plugin download, and daily rewards — all waiting behind one login.
          </div>
          <a href="/login" className="gate-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Enter NEXUS AI
          </a>
          <div className="gate-note">
            <span>30 free credits</span> &nbsp;·&nbsp; No credit card &nbsp;·&nbsp; Sign in with Roblox
          </div>
        </div>
      </div>

      {/* CTA */}
      <section className="cta-section">
        <div className="cta-box reveal-scale">
          <div className="cta-free">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            30 Free Credits — No Card Required
          </div>
          <h2 className="cta-title">Ready to Build Faster?</h2>
          <p className="cta-sub">
            Join developers who have already stopped copy-pasting and started creating.
            Your game deserves better than manual scripting.
          </p>
          <div className="cta-actions">
            <a href="/login" className="btn-primary" style={{ width:'100%', maxWidth:'300px', justifyContent:'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Start Free Now
            </a>
            <a href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noopener" className="cta-discord">
              <DiscordIcon />
              Join Discord for Plugin &amp; Codes
            </a>
          </div>
          <div className="cta-meta">
            <span>30 CR on signup</span> &nbsp;·&nbsp; +2 CR daily free &nbsp;·&nbsp; Pro plan for power users
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-inner">
          <div className="footer-brand-wrap">
            <span className="footer-brand">NEXUS AI</span>
            <div className="footer-online">
              <div className="footer-online-dot" />
              All systems online
            </div>
          </div>
          <div className="footer-links">
            <a href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noopener">Discord</a>
            <a href="/login">Login</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
          <span className="footer-copy">&copy; 2026 NEXUS STUDIO · nexusai-rbx.vercel.app</span>
        </div>
      </footer>
    </>
  );
}