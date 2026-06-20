'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';

/* ─── Discord Icon ─── */
function DiscordIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#7289da" style={{ flexShrink: 0 }}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

/* ═══════════════════════ CSS ═══════════════════════ */
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
  --transition-fast: .18s cubic-bezier(.4,0,.2,1);
  --transition-med: .28s cubic-bezier(.4,0,.2,1);
  --transition-slow: .45s cubic-bezier(.4,0,.2,1);
}

*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;}
body{
  font-family:'JetBrains Mono',monospace;
  background:var(--bg);color:var(--text);
  font-size:13px;overflow-x:hidden;
  -webkit-font-smoothing:antialiased;
  width:100%;
}

img{max-width:100%;}

::-webkit-scrollbar{width:3px;}
::-webkit-scrollbar-thumb{background:rgba(0,229,255,.22);border-radius:3px;}
::-webkit-scrollbar-track{background:transparent;}

/* ─── Animated BG ─── */
.hp-canvas{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.3;}
.hp-grid{
  position:fixed;inset:0;pointer-events:none;z-index:1;
  background:
    linear-gradient(rgba(0,229,255,.01) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,229,255,.01) 1px,transparent 1px);
  background-size:52px 52px;
  animation:gridPulse 8s ease-in-out infinite;
}
@keyframes gridPulse{0%,100%{opacity:.6}50%{opacity:1}}
.hp-scanlines{
  position:fixed;inset:0;pointer-events:none;z-index:1;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.025) 2px,rgba(0,0,0,.025) 4px);
}
.hp-vignette{
  position:fixed;inset:0;pointer-events:none;z-index:1;
  background:radial-gradient(ellipse at 50% 50%,transparent 50%,rgba(0,0,0,.7) 100%);
}

/* ─── Orbs ─── */
.orbs{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden;}
.orb{position:absolute;border-radius:50%;filter:blur(130px);}
.orb1{width:650px;height:650px;background:rgba(0,229,255,.04);top:-200px;left:-160px;animation:orbDrift1 16s ease-in-out infinite alternate;}
.orb2{width:780px;height:780px;background:rgba(136,0,255,.05);top:180px;right:-240px;animation:orbDrift2 18s ease-in-out infinite alternate;}
.orb3{width:500px;height:500px;background:rgba(255,45,107,.03);bottom:60px;left:20%;animation:orbDrift3 13s ease-in-out infinite alternate;}
.orb4{width:360px;height:360px;background:rgba(0,255,170,.022);bottom:-100px;right:12%;animation:orbDrift4 11s ease-in-out infinite alternate;}
@keyframes orbDrift1{from{transform:translate(0,0) scale(1);}to{transform:translate(50px,32px) scale(1.08);}}
@keyframes orbDrift2{from{transform:translate(0,0) scale(1);}to{transform:translate(-40px,24px) scale(1.05);}}
@keyframes orbDrift3{from{transform:translate(0,0);}to{transform:translate(24px,-32px);}}
@keyframes orbDrift4{from{transform:translate(0,0);}to{transform:translate(-20px,26px);}}

/* ─── Particles ─── */
.particles{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden;}
.p{position:absolute;border-radius:50%;animation:pfloat linear infinite;}
@keyframes pfloat{
  0%{transform:translateY(105vh) scale(0) rotate(0deg);opacity:0}
  5%{opacity:.9} 90%{opacity:.15}
  100%{transform:translateY(-5vh) scale(1.8) rotate(180deg);opacity:0}
}

/* ─── Scroll Reveal ─── */
.reveal,.reveal-left,.reveal-right,.reveal-scale,.reveal-blur{
  opacity:0;transition:opacity .75s ease,transform .75s ease,filter .75s ease;
}
.reveal{transform:translateY(28px);}
.reveal-left{transform:translateX(-28px);}
.reveal-right{transform:translateX(28px);}
.reveal-scale{transform:scale(.93);}
.reveal-blur{transform:translateY(14px);filter:blur(10px);}
.reveal.active,.reveal-left.active,.reveal-right.active,.reveal-scale.active,.reveal-blur.active{
  opacity:1;transform:none;filter:none;
}
.d1{transition-delay:.07s!important}.d2{transition-delay:.15s!important}
.d3{transition-delay:.23s!important}.d4{transition-delay:.31s!important}
.d5{transition-delay:.39s!important}.d6{transition-delay:.47s!important}
@media(prefers-reduced-motion:reduce){
  .reveal,.reveal-left,.reveal-right,.reveal-scale,.reveal-blur{opacity:1;transform:none;filter:none;transition:none;}
}

/* ═══ NAVBAR ═══ */
.nav{
  position:fixed;top:0;left:0;right:0;z-index:100;
  height:60px;padding:0 36px;
  display:flex;align-items:center;gap:12px;
  background:linear-gradient(180deg,rgba(3,3,18,.96),rgba(3,3,18,.85));
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  border-bottom:1px solid var(--b);
  transition:height var(--transition-med),background var(--transition-med),border-color var(--transition-med);
}
.nav.scrolled{height:52px;background:rgba(3,3,18,.99);border-color:rgba(0,229,255,.14);}

.nav-logo-wrap{display:flex;align-items:center;gap:10px;text-decoration:none;flex-shrink:0;min-width:0;}
.nav-logo-icon{
  width:34px;height:34px;border-radius:10px;flex-shrink:0;
  border:1.5px solid rgba(0,229,255,.3);
  background:linear-gradient(135deg,rgba(0,229,255,.12),rgba(136,0,255,.12));
  box-shadow:0 0 20px rgba(0,229,255,.15),0 0 0 1px rgba(0,229,255,.06) inset;
  display:flex;align-items:center;justify-content:center;
  transition:var(--transition-med);position:relative;overflow:hidden;
}
.nav-logo-icon::before{
  content:'';position:absolute;inset:0;
  background:linear-gradient(135deg,rgba(255,255,255,.1),transparent);
}
.nav-logo-wrap:hover .nav-logo-icon{
  box-shadow:0 0 32px rgba(0,229,255,.35),0 0 0 1px rgba(0,229,255,.18) inset;
  border-color:rgba(0,229,255,.55);transform:rotate(-3deg) scale(1.05);
}
.nav-logo{
  font-family:'Orbitron',sans-serif;font-weight:900;font-size:13.5px;letter-spacing:3.5px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  white-space:nowrap;
}
.nav-divider{width:1px;height:20px;background:var(--dim2);margin:0 4px;flex-shrink:0;}
.nav-sub{font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:2px;white-space:nowrap;flex-shrink:0;}
.nav-live{
  display:flex;align-items:center;gap:6px;flex-shrink:0;
  padding:4px 13px;border-radius:20px;
  background:rgba(0,255,170,.06);border:1px solid rgba(0,255,170,.2);
  font-size:8.5px;color:var(--green);letter-spacing:1.5px;
  animation:navLivePulse 3s ease-in-out infinite;
}
@keyframes navLivePulse{0%,100%{box-shadow:none}50%{box-shadow:0 0 12px rgba(0,255,170,.12)}}
.nav-live-dot{width:5px;height:5px;border-radius:50%;background:var(--green);animation:liveDot 1.8s ease-in-out infinite;box-shadow:0 0 6px var(--green);}
@keyframes liveDot{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.2;transform:scale(.5);}}

.nav-r{margin-left:auto;display:flex;align-items:center;gap:8px;flex-shrink:0;}
.nav-discord{
  padding:7px 15px;border-radius:10px;
  border:1px solid rgba(88,101,242,.32);background:rgba(88,101,242,.07);
  color:#7289da;font-size:10px;text-decoration:none;
  transition:var(--transition-fast);display:flex;align-items:center;gap:7px;white-space:nowrap;
}
.nav-discord:hover{background:rgba(88,101,242,.2);border-color:rgba(88,101,242,.6);transform:translateY(-1px);}
.nav-login{
  padding:9px 24px;border-radius:10px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  color:white;font-family:'Orbitron',sans-serif;font-size:9.5px;font-weight:700;
  text-decoration:none;letter-spacing:1px;
  transition:var(--transition-fast);display:flex;align-items:center;gap:7px;
  position:relative;overflow:hidden;
  box-shadow:0 4px 22px rgba(0,229,255,.22);white-space:nowrap;
}
.nav-login::before{
  content:'';position:absolute;inset:0;
  background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.12) 50%,transparent 60%);
  transform:translateX(-100%);transition:transform .6s ease;
}
.nav-login:hover::before{transform:translateX(100%);}
.nav-login:hover{transform:translateY(-1px);box-shadow:0 8px 32px rgba(0,229,255,.35);}

.nav-menu-btn{
  display:none;background:none;border:1px solid var(--b);border-radius:10px;
  padding:8px;cursor:pointer;color:var(--text);transition:var(--transition-fast);
  align-items:center;justify-content:center;flex-shrink:0;
}
.nav-menu-btn:hover{border-color:var(--cyan2);color:var(--cyan);}

.nav-mobile-menu{
  position:fixed;top:56px;left:0;right:0;
  background:rgba(3,3,18,.98);border-bottom:1px solid var(--b);
  padding:0 16px;z-index:99;
  display:flex;flex-direction:column;
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  max-height:0;overflow:hidden;
  transition:max-height .35s cubic-bezier(.4,0,.2,1),padding .35s ease;
}
.nav-mobile-menu.open{max-height:400px;padding:16px;overflow-y:auto;}
.nav-mobile-item{
  padding:14px 16px;border-radius:11px;margin-bottom:8px;
  border:1px solid var(--b);color:var(--text);
  text-decoration:none;font-size:11px;
  display:flex;align-items:center;gap:10px;
  transition:var(--transition-fast);
}
.nav-mobile-item:hover{border-color:var(--cyan2);color:var(--cyan);background:rgba(0,229,255,.04);}
.nav-mobile-item.primary{
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  color:white;font-family:'Orbitron',sans-serif;font-weight:700;
  letter-spacing:1px;border-color:transparent;
  box-shadow:0 4px 18px rgba(0,229,255,.22);
}
.nav-mobile-item.primary:hover{opacity:.88;transform:none;}

/* ═══ HERO ═══ */
.hero{
  min-height:100vh;
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  text-align:center;
  padding:140px 20px 80px;
  position:relative;z-index:2;
  overflow:hidden;
  width:100%;
}
.hero::before{
  content:'';position:absolute;inset:0;pointer-events:none;
  background:
    radial-gradient(ellipse 80% 60% at 50% -8%,rgba(136,0,255,.2) 0%,transparent 65%),
    radial-gradient(ellipse 60% 45% at 50% 85%,rgba(0,229,255,.06) 0%,transparent 60%);
  animation:heroBgBreath 10s ease-in-out infinite;
}
@keyframes heroBgBreath{0%,100%{opacity:.8}50%{opacity:1}}

.hero-badge{
  display:inline-flex;align-items:center;gap:10px;padding:8px 22px;
  background:rgba(0,229,255,.05);border:1px solid rgba(0,229,255,.18);
  border-radius:28px;font-size:9px;color:var(--cyan);
  margin-bottom:30px;letter-spacing:2px;text-transform:uppercase;
  animation:heroFadeUp 1s .1s ease both;
  box-shadow:0 0 28px rgba(0,229,255,.07),0 0 0 1px rgba(0,229,255,.05) inset;
  position:relative;overflow:hidden;
  max-width:100%;text-align:center;
}
.hero-badge::before{
  content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;
  background:linear-gradient(90deg,transparent,rgba(0,229,255,.08),transparent);
  animation:shimmerBadge 3.5s ease-in-out infinite;
}
@keyframes shimmerBadge{0%{left:-100%}100%{left:200%}}
.badge-dot{width:6px;height:6px;border-radius:50%;background:var(--cyan);animation:liveDot 1.8s infinite;box-shadow:0 0 10px var(--cyan);flex-shrink:0;}

.hero-title{
  font-family:'Orbitron',sans-serif;
  font-size:clamp(32px,7vw,86px);font-weight:900;
  line-height:1.05;margin-bottom:0;
  animation:heroFadeUp 1s .22s ease both;
  letter-spacing:-0.5px;
  max-width:100%;
}
.hero-title .line1{display:block;color:white;}
.hero-title .grad{
  display:block;margin-top:4px;
  background:linear-gradient(135deg,var(--cyan) 0%,var(--purple) 45%,var(--pink) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  filter:drop-shadow(0 0 50px rgba(0,229,255,.18));
  animation:gradShift 6s ease-in-out infinite alternate;
}
@keyframes gradShift{
  0%{filter:drop-shadow(0 0 30px rgba(0,229,255,.12));}
  100%{filter:drop-shadow(0 0 60px rgba(136,0,255,.2));}
}
@keyframes heroFadeUp{from{opacity:0;transform:translateY(28px);}to{opacity:1;transform:none;}}

/* ─── Prompt Box ─── */
.hero-prompt-wrap{
  width:100%;max-width:700px;
  margin:38px auto 0;
  position:relative;z-index:5;
  animation:heroFadeUp 1s .35s ease both;
}
.hero-prompt-box{
  display:flex;align-items:center;gap:0;
  background:rgba(6,7,26,.95);
  border:1.5px solid rgba(0,229,255,.22);
  border-radius:20px;
  padding:6px 6px 6px 22px;
  box-shadow:
    0 0 0 1px rgba(0,229,255,.06) inset,
    0 28px 80px rgba(0,0,0,.65),
    0 0 70px rgba(0,229,255,.05);
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  transition:border-color var(--transition-med),box-shadow var(--transition-med);
}
.hero-prompt-box:focus-within{
  border-color:rgba(0,229,255,.5);
  box-shadow:
    0 0 0 1px rgba(0,229,255,.1) inset,
    0 28px 80px rgba(0,0,0,.7),
    0 0 80px rgba(0,229,255,.14);
}
.hero-prompt-input{
  flex:1;background:transparent;border:none;outline:none;
  font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text);
  padding:14px 0;line-height:1.5;
  resize:none;min-height:52px;max-height:140px;
  width:100%;min-width:0;
}
.hero-prompt-input::placeholder{color:var(--dim);}
.hero-prompt-btn{
  flex-shrink:0;
  padding:14px 26px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  border:none;border-radius:15px;
  color:white;font-family:'Orbitron',sans-serif;font-size:9.5px;font-weight:700;
  cursor:pointer;transition:var(--transition-fast);letter-spacing:1px;
  display:flex;align-items:center;gap:8px;
  position:relative;overflow:hidden;
  box-shadow:0 4px 24px rgba(0,229,255,.26);white-space:nowrap;
}
.hero-prompt-btn::before{
  content:'';position:absolute;inset:0;
  background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.14) 50%,transparent 60%);
  transform:translateX(-100%);transition:transform .5s ease;
}
.hero-prompt-btn:hover::before{transform:translateX(100%);}
.hero-prompt-btn:hover{transform:translateY(-1px);box-shadow:0 8px 40px rgba(0,229,255,.38);}
.hero-prompt-btn:active{transform:scale(.97);}

.hero-prompt-examples{
  display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:14px;
}
.hero-prompt-ex{
  display:inline-flex;align-items:center;gap:6px;
  padding:6px 15px;border-radius:22px;
  background:rgba(0,229,255,.04);border:1px solid rgba(0,229,255,.11);
  font-size:9.5px;color:var(--text2);cursor:pointer;
  transition:var(--transition-fast);white-space:nowrap;
}
.hero-prompt-ex:hover{background:rgba(0,229,255,.1);border-color:rgba(0,229,255,.38);color:var(--cyan);transform:translateY(-2px);}

/* ═══ GAME CAROUSEL ═══ */
.hero-games-stage{
  position:relative;
  width:100%;max-width:1140px;
  height:360px;
  margin:56px auto 0;
  animation:heroFadeUp 1s .48s ease both;
  pointer-events:none;
}
.hg-side{
  position:absolute;top:50%;
  display:flex;flex-direction:column;gap:13px;
  pointer-events:auto;
}
.hg-left{left:0;transform:translateY(-50%);}
.hg-right{right:0;transform:translateY(-50%);}

.hg-card{
  display:flex;align-items:center;gap:11px;
  padding:10px 14px 10px 10px;
  background:rgba(6,7,26,.88);
  border:1px solid rgba(0,229,255,.13);
  border-radius:14px;
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  box-shadow:0 12px 40px rgba(0,0,0,.5),0 0 0 1px rgba(0,229,255,.04) inset;
  font-size:10px;color:var(--text);
  white-space:nowrap;transition:var(--transition-med);cursor:pointer;min-width:220px;
}
.hg-card:hover{
  border-color:rgba(0,229,255,.4);
  box-shadow:0 16px 50px rgba(0,229,255,.12),0 0 0 1px rgba(0,229,255,.1) inset;
  transform:translateY(-5px) translateX(3px);
}
.hg-right .hg-card:hover{transform:translateY(-5px) translateX(-3px);}
.hg-card-thumb{
  width:54px;height:54px;border-radius:10px;object-fit:cover;flex-shrink:0;
  border:1px solid rgba(0,229,255,.12);
  background:linear-gradient(135deg,rgba(0,229,255,.07),rgba(136,0,255,.07));
  transition:transform var(--transition-med);
}
.hg-card:hover .hg-card-thumb{transform:scale(1.05);}
.hg-card-info{display:flex;flex-direction:column;gap:3px;min-width:0;}
.hg-card-label{font-size:8.5px;color:var(--dim);display:flex;align-items:center;gap:5px;}
.hg-card-name{font-size:10px;color:white;font-weight:600;}
.hg-card-prompt{font-size:8px;color:var(--cyan);opacity:.65;font-style:italic;max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

/* Center carousel */
.hg-center{
  position:absolute;left:50%;top:50%;
  transform:translate(-50%,-50%);
  width:400px;pointer-events:auto;
}
.hg-main-wrap{
  position:relative;width:100%;height:278px;
  border-radius:20px;overflow:hidden;
  border:1.5px solid rgba(0,229,255,.22);
  box-shadow:0 0 0 1px rgba(0,229,255,.07) inset,0 32px 80px rgba(0,0,0,.75),0 0 70px rgba(0,229,255,.1);
  background:linear-gradient(135deg,rgba(0,229,255,.04),rgba(136,0,255,.04));
}

/* ─── Carousel image states ─── */
.hg-main-img{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  object-fit:cover;
  opacity:0;
  z-index:1;
  transition:none;
  pointer-events:none;
}
.hg-main-img.img-active{
  opacity:1;
  z-index:3;
  transform:scale(1);
  transition:opacity .6s cubic-bezier(.4,0,.2,1), transform .6s cubic-bezier(.4,0,.2,1);
}
.hg-main-img.img-leaving{
  opacity:0;
  z-index:2;
  transform:scale(.96);
  transition:opacity .6s cubic-bezier(.4,0,.2,1), transform .6s cubic-bezier(.4,0,.2,1);
}
.hg-main-img.img-entering{
  opacity:0;
  z-index:2;
  transform:scale(1.04);
  transition:none;
}

.hg-main-overlay{
  position:absolute;bottom:0;left:0;right:0;z-index:4;
  background:linear-gradient(0deg,rgba(3,3,18,.98) 0%,rgba(3,3,18,.5) 60%,transparent 100%);
  padding:32px 20px 18px;
}
.hg-main-name{font-size:14px;font-weight:700;color:white;margin-bottom:3px;}
.hg-main-tag{font-size:8.5px;color:var(--cyan);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:6px;}
.hg-main-prompt{
  display:inline-flex;align-items:center;gap:7px;
  padding:5px 12px;border-radius:9px;
  background:rgba(0,229,255,.08);border:1px solid rgba(0,229,255,.2);
  font-size:8.5px;color:var(--text2);font-style:italic;cursor:pointer;transition:var(--transition-fast);
  max-width:100%;
}
.hg-main-prompt:hover{background:rgba(0,229,255,.18);color:var(--cyan);transform:scale(1.02);}

/* Animated border on center */
.hg-main-wrap::before{
  content:'';position:absolute;top:0;left:0;right:0;height:2px;z-index:5;
  background:linear-gradient(90deg,transparent,var(--cyan),var(--purple),transparent);
  animation:shimmerBar 4s ease-in-out infinite;
}
@keyframes shimmerBar{0%,100%{opacity:.4}50%{opacity:1}}

.hg-dots{display:flex;gap:7px;justify-content:center;margin-top:16px;flex-wrap:wrap;}
.hg-dot{
  width:6px;height:6px;border-radius:50%;
  background:rgba(0,229,255,.18);border:1px solid rgba(0,229,255,.15);
  cursor:pointer;transition:var(--transition-med);
}
.hg-dot.active{background:var(--cyan);box-shadow:0 0 12px rgba(0,229,255,.8);width:22px;border-radius:4px;}

/* ─── Hero Stats ─── */
.hero-stats{
  display:flex;gap:50px;margin-top:56px;flex-wrap:wrap;justify-content:center;
  animation:heroFadeUp 1s .6s ease both;
  max-width:100%;
}
.stat{text-align:center;position:relative;}
.stat-n{
  font-family:'Orbitron',sans-serif;font-size:28px;font-weight:900;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  line-height:1.1;
}
.stat-l{font-size:8.5px;color:var(--dim);text-transform:uppercase;letter-spacing:2px;margin-top:6px;}
.stat-divider{width:1px;background:var(--b);align-self:stretch;margin:4px 0;}

/* Scroll arrow */
.hero-scroll{margin-top:48px;cursor:pointer;animation:bounce 2.8s ease-in-out infinite,heroFadeUp 1s .7s ease both;}
@keyframes bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(12px);}}
.hero-scroll svg{opacity:.25;transition:opacity var(--transition-fast);stroke:var(--cyan);fill:none;stroke-width:1.8;}
.hero-scroll:hover svg{opacity:.7;}

/* ═══ TICKER ═══ */
.ticker-wrap{
  overflow:hidden;border-top:1px solid var(--b);border-bottom:1px solid var(--b);
  padding:13px 0;background:rgba(6,7,26,.6);position:relative;z-index:1;
}
.ticker-wrap::before,.ticker-wrap::after{
  content:'';position:absolute;top:0;width:140px;height:100%;z-index:2;pointer-events:none;
}
.ticker-wrap::before{left:0;background:linear-gradient(90deg,var(--bg),transparent);}
.ticker-wrap::after{right:0;background:linear-gradient(270deg,var(--bg),transparent);}
.ticker-inner{display:flex;gap:0;animation:tickerMove 36s linear infinite;width:max-content;}
.ticker-inner:hover{animation-play-state:paused;}
.ticker-item{
  display:flex;align-items:center;gap:7px;white-space:nowrap;
  padding:0 32px;font-size:9.5px;color:var(--text2);
  border-right:1px solid var(--b);
}
.ticker-dot{width:4px;height:4px;border-radius:50%;background:var(--cyan);box-shadow:0 0 7px var(--cyan);flex-shrink:0;}
@keyframes tickerMove{from{transform:translateX(0);}to{transform:translateX(-50%);}}

/* ═══ SECTIONS ═══ */
.section{padding:100px 36px;position:relative;z-index:1;max-width:1200px;margin:0 auto;width:100%;}
.section-full{padding:100px 36px;position:relative;z-index:1;}

.sec-eyebrow{
  font-size:9px;color:var(--cyan);text-transform:uppercase;letter-spacing:3px;
  margin-bottom:14px;text-align:center;
  display:flex;align-items:center;justify-content:center;gap:14px;
}
.sec-eyebrow::before,.sec-eyebrow::after{
  content:'';width:44px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(0,229,255,.45));
}
.sec-eyebrow::after{background:linear-gradient(90deg,rgba(0,229,255,.45),transparent);}
.sec-title{
  font-family:'Orbitron',sans-serif;font-size:clamp(22px,3.5vw,40px);
  font-weight:900;text-align:center;color:white;margin-bottom:14px;line-height:1.2;
}
.sec-sub{
  font-size:11.5px;color:var(--text2);text-align:center;
  max-width:540px;margin:0 auto 58px;line-height:2.1;
}

/* ═══ WHAT IS NEXUS ═══ */
.mystery{
  padding:108px 28px;
  background:linear-gradient(180deg,transparent,rgba(136,0,255,.035),transparent);
  border-top:1px solid var(--b);border-bottom:1px solid var(--b);
  position:relative;z-index:1;text-align:center;overflow:hidden;
}
.mystery::before{
  content:'';position:absolute;top:50%;left:50%;
  transform:translate(-50%,-50%);
  width:800px;height:400px;
  background:rgba(136,0,255,.04);
  filter:blur(100px);pointer-events:none;
  animation:mystGlow 8s ease-in-out infinite alternate;
}
@keyframes mystGlow{from{transform:translate(-50%,-50%) scale(1);}to{transform:translate(-50%,-50%) scale(1.15);}}
.mystery-inner{max-width:860px;margin:0 auto;position:relative;}

.mystery-eyebrow{
  font-size:9px;color:var(--purple);text-transform:uppercase;letter-spacing:3px;margin-bottom:22px;
  display:flex;align-items:center;justify-content:center;gap:14px;
}
.mystery-eyebrow::before,.mystery-eyebrow::after{
  content:'';flex:1;max-width:90px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(136,0,255,.5));
}
.mystery-eyebrow::after{background:linear-gradient(90deg,rgba(136,0,255,.5),transparent);}

.mystery-title{font-family:'Orbitron',sans-serif;font-size:clamp(24px,4.5vw,50px);font-weight:900;color:white;margin-bottom:22px;line-height:1.14;}
.mystery-sub{font-size:12px;color:var(--text2);line-height:2.1;max-width:640px;margin:0 auto 16px;}
.mystery-lock{
  display:inline-flex;align-items:center;gap:8px;padding:6px 20px;margin-bottom:44px;
  background:rgba(255,45,107,.07);border:1px solid rgba(255,45,107,.24);
  border-radius:24px;font-size:9px;color:var(--pink);letter-spacing:1px;
  animation:lockPulse 3s ease-in-out infinite;
  max-width:100%;text-align:center;
}
@keyframes lockPulse{0%,100%{box-shadow:none}50%{box-shadow:0 0 16px rgba(255,45,107,.12)}}

.hint-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:44px;}
.hint-card{
  padding:26px 22px;background:rgba(136,0,255,.04);border:1px solid rgba(136,0,255,.13);
  border-radius:14px;text-align:left;transition:var(--transition-med);position:relative;overflow:hidden;
}
.hint-card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1.5px;
  background:linear-gradient(90deg,transparent,rgba(136,0,255,.7),transparent);
  opacity:0;transition:opacity var(--transition-med);
}
.hint-card:hover{
  border-color:rgba(136,0,255,.4);background:rgba(136,0,255,.09);
  transform:translateY(-5px);box-shadow:0 14px 40px rgba(136,0,255,.1);
}
.hint-card:hover::before{opacity:1;}
.hint-icon{
  width:40px;height:40px;border-radius:12px;
  background:rgba(136,0,255,.1);border:1px solid rgba(136,0,255,.2);
  display:flex;align-items:center;justify-content:center;margin-bottom:14px;
  transition:var(--transition-fast);
}
.hint-card:hover .hint-icon{background:rgba(136,0,255,.22);border-color:rgba(136,0,255,.42);transform:scale(1.1) rotate(5deg);}
.hint-title{font-size:11px;color:white;font-weight:600;margin-bottom:8px;}
.hint-sub{font-size:10px;color:var(--text2);line-height:1.85;}

/* ═══ SCREENSHOTS ═══ */
.screenshots-section{
  background:linear-gradient(180deg,transparent,rgba(0,229,255,.015),transparent);
  border-top:1px solid var(--b);border-bottom:1px solid var(--b);
  padding:100px 28px;position:relative;z-index:1;
}
.screen-grid{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));
  gap:20px;max-width:1200px;margin:0 auto;
}
.screen-card{
  border-radius:18px;overflow:hidden;border:1px solid var(--b);
  background:rgba(6,7,26,.82);transition:var(--transition-med);position:relative;
  box-shadow:0 12px 40px rgba(0,0,0,.4);
}
.screen-card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1.5px;
  background:linear-gradient(90deg,transparent,var(--cyan),transparent);
  opacity:0;transition:opacity var(--transition-med);z-index:2;
}
.screen-card:hover{border-color:var(--cyan2);transform:translateY(-8px);box-shadow:0 32px 80px rgba(0,229,255,.1);}
.screen-card:hover::before{opacity:1;}
.screen-img-wrap{overflow:hidden;border-bottom:1px solid var(--b);}
.screen-card-img{
  width:100%;height:215px;object-fit:cover;object-position:top;display:block;
  background:linear-gradient(135deg,rgba(0,229,255,.04),rgba(136,0,255,.04));
  transition:transform .5s cubic-bezier(.4,0,.2,1);
}
.screen-card:hover .screen-card-img{transform:scale(1.04);}
.screen-card-body{padding:20px 22px;}
.screen-card-title{font-size:11.5px;color:white;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:9px;}
.screen-card-desc{font-size:10px;color:var(--text2);line-height:1.9;}
.screen-badge{
  position:absolute;top:12px;right:12px;
  padding:3px 12px;border-radius:8px;
  font-size:8px;font-weight:700;
  background:rgba(0,229,255,.1);color:var(--cyan);
  border:1px solid rgba(0,229,255,.24);
  backdrop-filter:blur(8px);text-transform:uppercase;letter-spacing:1px;
}

/* ═══ FEATURES ═══ */
.features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;}
.feat{
  padding:30px;background:rgba(6,7,26,.72);border:1px solid var(--b);
  border-radius:18px;transition:var(--transition-med);position:relative;overflow:hidden;
  cursor:default;
}
.feat::before{
  content:'';position:absolute;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,transparent,var(--cyan),transparent);
  opacity:0;transition:opacity var(--transition-med);
}
.feat::after{
  content:'';position:absolute;inset:0;
  background:radial-gradient(ellipse at 50% 0%,rgba(0,229,255,.04),transparent 70%);
  opacity:0;transition:opacity var(--transition-med);
}
.feat:hover{border-color:var(--cyan2);background:rgba(0,229,255,.02);transform:translateY(-6px);box-shadow:0 24px 60px rgba(0,229,255,.07);}
.feat:hover::before,.feat:hover::after{opacity:1;}
.feat-icon{
  width:48px;height:48px;border-radius:14px;
  display:flex;align-items:center;justify-content:center;
  margin-bottom:20px;flex-shrink:0;transition:var(--transition-med);
  position:relative;
}
.feat:hover .feat-icon{transform:scale(1.12) rotate(4deg);}
.feat-title{font-family:'Orbitron',sans-serif;font-size:10.5px;font-weight:700;color:white;margin-bottom:10px;letter-spacing:.3px;}
.feat-desc{font-size:10.5px;color:var(--text2);line-height:2;}
.feat-tag{
  display:inline-flex;align-items:center;gap:5px;
  margin-top:16px;padding:3px 12px;border-radius:8px;
  font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;
}

/* ═══ HOW IT WORKS ═══ */
.how-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;}
.step-card{
  text-align:center;padding:38px 26px;background:rgba(6,7,26,.72);
  border:1px solid var(--b);border-radius:18px;transition:var(--transition-med);
  position:relative;overflow:hidden;
}
.step-card::after{
  content:'';position:absolute;bottom:0;left:0;right:0;height:1.5px;
  background:linear-gradient(90deg,transparent,var(--cyan),transparent);
  opacity:0;transition:opacity var(--transition-med);
}
.step-card:hover{border-color:var(--cyan2);transform:translateY(-6px);box-shadow:0 22px 60px rgba(0,229,255,.08);}
.step-card:hover::after{opacity:1;}
.step-num-wrap{
  width:64px;height:64px;border-radius:50%;
  border:1.5px solid rgba(0,229,255,.3);
  background:rgba(0,229,255,.05);
  display:flex;align-items:center;justify-content:center;
  font-family:'Orbitron',sans-serif;font-size:24px;font-weight:900;color:var(--cyan);
  margin:0 auto 22px;transition:var(--transition-med);
}
.step-card:hover .step-num-wrap{
  border-color:var(--cyan);background:rgba(0,229,255,.12);
  box-shadow:0 0 36px rgba(0,229,255,.25);transform:scale(1.06);
}
.step-title{font-size:13px;font-weight:600;color:white;margin-bottom:11px;letter-spacing:.3px;}
.step-desc{font-size:10.5px;color:var(--text2);line-height:1.95;}

/* ═══ GATE ═══ */
.gate-section{padding:100px 28px;text-align:center;position:relative;z-index:1;}
.gate-box{
  max-width:540px;margin:0 auto;padding:60px 48px;
  background:rgba(6,7,26,.9);border:1px solid var(--b);
  border-radius:28px;position:relative;overflow:hidden;
  box-shadow:0 0 0 1px rgba(0,229,255,.05) inset,0 48px 96px rgba(0,0,0,.65),0 0 80px rgba(136,0,255,.07);
  backdrop-filter:blur(16px);
}
.gate-box::before{
  content:'';position:absolute;top:0;left:0;right:0;height:2.5px;
  background:linear-gradient(90deg,var(--purple),var(--cyan),var(--pink),var(--purple));
  background-size:200% 100%;
  animation:gradMove 4s linear infinite;
}
@keyframes gradMove{from{background-position:0% 0%}to{background-position:200% 0%}}
.gate-glow{
  position:absolute;bottom:-100px;left:50%;transform:translateX(-50%);
  width:300px;height:160px;
  background:rgba(136,0,255,.18);filter:blur(70px);
  pointer-events:none;animation:gateGlowPulse 5s ease-in-out infinite alternate;
}
@keyframes gateGlowPulse{from{opacity:.7}to{opacity:1}}
.gate-icon{
  width:72px;height:72px;border-radius:22px;
  background:rgba(136,0,255,.1);border:1px solid rgba(136,0,255,.24);
  display:flex;align-items:center;justify-content:center;
  margin:0 auto 26px;box-shadow:0 0 40px rgba(136,0,255,.15);
  transition:var(--transition-med);
}
.gate-box:hover .gate-icon{
  background:rgba(136,0,255,.2);border-color:rgba(136,0,255,.45);
  box-shadow:0 0 60px rgba(136,0,255,.28);transform:scale(1.05);
}
.gate-title{font-family:'Orbitron',sans-serif;font-size:22px;color:white;margin-bottom:16px;letter-spacing:.4px;}
.gate-sub{font-size:10.5px;color:var(--text2);margin-bottom:32px;line-height:2;}
.gate-btn{
  display:inline-flex;align-items:center;gap:9px;padding:15px 38px;
  background:linear-gradient(135deg,var(--purple),var(--cyan));
  border:none;border-radius:12px;color:white;font-family:'Orbitron',sans-serif;
  font-size:10.5px;font-weight:700;cursor:pointer;transition:var(--transition-fast);
  text-decoration:none;letter-spacing:1px;position:relative;overflow:hidden;
  box-shadow:0 6px 30px rgba(136,0,255,.34);
}
.gate-btn::before{
  content:'';position:absolute;inset:0;
  background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.12) 50%,transparent 60%);
  transform:translateX(-100%);transition:transform .5s ease;
}
.gate-btn:hover::before{transform:translateX(100%);}
.gate-btn:hover{transform:translateY(-2px);box-shadow:0 14px 48px rgba(136,0,255,.48);}
.gate-note{margin-top:22px;font-size:9px;color:var(--dim);line-height:2;}
.gate-note span{color:var(--green);}

/* ═══ CTA ═══ */
.cta-section{padding:100px 28px;text-align:center;position:relative;z-index:1;}
.cta-box{
  max-width:680px;margin:0 auto;padding:64px 52px;
  background:rgba(6,7,26,.88);border:1px solid var(--b);
  border-radius:28px;position:relative;overflow:hidden;
  box-shadow:0 0 0 1px rgba(0,229,255,.05) inset,0 48px 96px rgba(0,0,0,.65);
  backdrop-filter:blur(16px);
}
.cta-box::before{
  content:'';position:absolute;top:0;left:0;right:0;height:2.5px;
  background:linear-gradient(90deg,var(--cyan),var(--purple),var(--pink),var(--cyan));
  background-size:200% 100%;
  animation:gradMove 5s linear infinite;
}
.cta-box::after{
  content:'';position:absolute;top:-120px;left:50%;transform:translateX(-50%);
  width:480px;height:240px;background:rgba(0,229,255,.035);filter:blur(80px);pointer-events:none;
}
.cta-free{
  display:inline-flex;align-items:center;gap:7px;padding:6px 18px;margin-bottom:24px;
  background:rgba(0,255,170,.08);border:1px solid rgba(0,255,170,.24);
  border-radius:22px;font-size:9px;color:var(--green);font-weight:700;letter-spacing:1px;
  animation:ctaFree 3s ease-in-out infinite;
  max-width:100%;text-align:center;
}
@keyframes ctaFree{0%,100%{box-shadow:none}50%{box-shadow:0 0 16px rgba(0,255,170,.1)}}
.cta-title{font-family:'Orbitron',sans-serif;font-size:clamp(20px,3.2vw,32px);font-weight:900;color:white;margin-bottom:16px;position:relative;z-index:1;}
.cta-sub{font-size:11px;color:var(--text2);margin-bottom:34px;line-height:2.1;position:relative;z-index:1;max-width:480px;margin-left:auto;margin-right:auto;}
.cta-actions{display:flex;flex-direction:column;align-items:center;gap:14px;position:relative;z-index:1;}
.cta-discord{
  display:inline-flex;align-items:center;gap:8px;font-size:10px;color:var(--text2);
  text-decoration:none;transition:var(--transition-fast);
  padding:10px 18px;border-radius:10px;border:1px solid transparent;
}
.cta-discord:hover{color:#7289da;border-color:rgba(88,101,242,.3);background:rgba(88,101,242,.06);}
.cta-meta{margin-top:24px;font-size:9px;color:var(--dim);line-height:2.1;position:relative;z-index:1;}
.cta-meta span{color:var(--green);}

/* ═══ BUTTONS ═══ */
.btn-primary{
  padding:14px 38px;background:linear-gradient(135deg,var(--cyan),var(--purple));
  border:none;border-radius:12px;color:white;font-family:'Orbitron',sans-serif;
  font-size:10.5px;font-weight:700;cursor:pointer;text-decoration:none;
  letter-spacing:1.5px;transition:var(--transition-fast);
  display:inline-flex;align-items:center;gap:9px;
  position:relative;overflow:hidden;box-shadow:0 4px 24px rgba(0,229,255,.24);
}
.btn-primary::before{
  content:'';position:absolute;inset:0;
  background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.12) 50%,transparent 60%);
  transform:translateX(-100%);transition:transform .5s ease;
}
.btn-primary:hover::before{transform:translateX(100%);}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 44px rgba(0,229,255,.36);}
.btn-primary:active{transform:translateY(0) scale(.98);}

/* ═══ FOOTER ═══ */
footer{
  padding:40px 36px;border-top:1px solid var(--b);
  position:relative;z-index:1;
  background:linear-gradient(0deg,rgba(3,3,18,.8),transparent);
}
.footer-inner{
  max-width:1200px;margin:0 auto;
  display:flex;align-items:center;justify-content:space-between;
  flex-wrap:wrap;gap:20px;
}
.footer-brand-wrap{display:flex;align-items:center;gap:13px;}
.footer-logo-icon{
  width:30px;height:30px;border-radius:9px;
  border:1px solid rgba(0,229,255,.22);
  background:linear-gradient(135deg,rgba(0,229,255,.1),rgba(136,0,255,.1));
  display:flex;align-items:center;justify-content:center;
}
.footer-brand{
  font-family:'Orbitron',sans-serif;font-size:12px;font-weight:900;letter-spacing:2.5px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.footer-online{display:flex;align-items:center;gap:5px;font-size:8.5px;color:var(--green);}
.footer-online-dot{width:5px;height:5px;border-radius:50%;background:var(--green);animation:liveDot 1.8s infinite;box-shadow:0 0 7px var(--green);}
.footer-links{display:flex;gap:24px;flex-wrap:wrap;}
.footer-links a{font-size:10px;color:var(--dim);text-decoration:none;transition:color var(--transition-fast);}
.footer-links a:hover{color:var(--cyan);}
.footer-copy{font-size:9px;color:var(--dim);}

/* ═══ RESPONSIVE ═══ */

/* Tablet / small laptop */
@media(max-width:1100px){
  .hg-side{display:none;}
  .hero-games-stage{height:320px;}
  .hg-center{width:380px;}
  .hg-main-wrap{height:256px;}
  .features-grid{grid-template-columns:repeat(2,1fr);}
}

/* Tablet portrait */
@media(max-width:900px){
  .nav{padding:0 20px;}
  .nav-sub{display:none;}
  .hero{padding:120px 24px 64px;}
  .section{padding:80px 24px;}
  .section-full{padding:80px 24px;}
  .gate-box,.cta-box{padding:48px 36px;}
}

@media(max-width:768px){
  .nav{padding:0 16px;height:56px;}
  .nav.scrolled{height:48px;}
  .nav-sub,.nav-divider,.nav-live{display:none;}
  .nav-discord{display:none;}
  .nav-menu-btn{display:flex;}
  .nav-r .nav-login{display:none;}
  .nav-mobile-menu{top:56px;}

  .hero{padding:96px 18px 56px;width:100%;}
  .hero-title{font-size:clamp(28px,8.5vw,46px);}
  .hero-badge{font-size:8px;padding:6px 14px;gap:8px;}

  .hero-games-stage{height:auto;margin-top:36px;}
  .hg-center{position:relative;left:auto;top:auto;transform:none;width:100%;max-width:480px;margin:0 auto;}
  .hg-main-wrap{height:220px;border-radius:16px;}
  .hg-main-name{font-size:13px;}
  .hg-main-overlay{padding:26px 16px 14px;}

  .hero-stats{gap:22px;margin-top:36px;}
  .stat-n{font-size:22px;}
  .stat-l{font-size:7.5px;letter-spacing:1.4px;}
  .stat-divider{display:none;}
  .hero-scroll{margin-top:32px;}

  .hero-prompt-wrap{margin-top:28px;}
  .hero-prompt-box{padding:5px 5px 5px 16px;border-radius:16px;flex-wrap:wrap;}
  .hero-prompt-input{font-size:12px;min-height:46px;}
  .hero-prompt-btn{padding:11px 18px;font-size:8.5px;gap:6px;border-radius:12px;}
  .hero-prompt-examples{display:none;}

  .section{padding:60px 16px;}
  .section-full{padding:60px 16px;}
  .mystery{padding:64px 16px;}
  .screenshots-section{padding:64px 16px;}
  .gate-section,.cta-section{padding:60px 16px;}
  .gate-box{padding:36px 24px;border-radius:22px;}
  .cta-box{padding:36px 24px;border-radius:22px;}
  .sec-sub{margin-bottom:34px;font-size:11px;}
  .sec-title{font-size:clamp(20px,6vw,30px);}

  .mystery-title{font-size:clamp(22px,7vw,34px);}
  .mystery-sub{font-size:11px;line-height:1.95;}

  .hint-grid{grid-template-columns:1fr 1fr;gap:10px;}
  .hint-card{padding:18px 16px;}
  .how-grid{grid-template-columns:1fr;}
  .features-grid{grid-template-columns:1fr;}
  .screen-grid{grid-template-columns:1fr;}

  .gate-title{font-size:18px;}
  .cta-title{font-size:clamp(18px,5.5vw,26px);}
  .gate-note,.cta-meta{font-size:8px;line-height:1.9;}

  footer{padding:28px 16px;}
  .footer-inner{flex-direction:column;text-align:center;}
  .footer-links{justify-content:center;gap:16px;}
  .footer-brand-wrap{justify-content:center;flex-direction:column;gap:10px;}
}

@media(max-width:480px){
  .hero-title{font-size:clamp(24px,9.5vw,36px);}
  .hero-badge{font-size:7.5px;padding:6px 12px;}
  .hint-grid{grid-template-columns:1fr;}
  .gate-box,.cta-box{padding:28px 18px;}
  .hg-main-wrap{height:190px;}
  .hg-main-name{font-size:12px;}
  .hero-stats{gap:16px;}
  .stat-n{font-size:20px;}
  .stat-l{font-size:7px;}
  .step-card{padding:28px 18px;}
  .feat{padding:22px 18px;}
  .btn-primary{width:100%;justify-content:center;}
  .features-grid,.how-grid{gap:12px;}
  .gate-btn{width:100%;justify-content:center;padding:14px 24px;}
  .cta-discord{font-size:9px;text-align:center;}
}

@media(max-width:360px){
  .hero-title{font-size:22px;}
  .nav-logo{font-size:11px;letter-spacing:1.5px;}
  .gate-box,.cta-box{padding:24px 14px;}
  .hero-prompt-btn{padding:10px 14px;font-size:8px;}
  .hg-main-wrap{height:170px;}
  .hero-badge{font-size:7px;padding:5px 10px;}
}
`;

/* ─── Game Data ─── */
const GAMES = [
  { file:'99_nights_in_the_forest', name:'99 Nights in the Forest', genre:'Adventure RPG',  prompt:'Build an open world forest RPG with day/night cycle' },
  { file:'dead_rails',              name:'Dead Rails',              genre:'Survival',        prompt:'Build a zombie survival game on a moving train' },
  { file:'escape_tsunami_for_brainrot', name:'Escape Tsunami',     genre:'Obby',            prompt:'Build a disaster escape obby with rising water' },
  { file:'fish_it',                 name:'Fish It!',                genre:'Simulator',       prompt:'Build a fishing simulator with rare fish and a shop' },
  { file:'fps_flick',               name:'FPS Flick',               genre:'Shooter',         prompt:'Build a first-person shooter with aim training' },
  { file:'grow_a_garden',           name:'Grow a Garden',           genre:'Tycoon',          prompt:'Build a garden tycoon with crops and a selling system' },
  { file:'raft_tycoon',             name:'Raft Tycoon',             genre:'Tycoon',          prompt:'Build a raft builder tycoon on the ocean' },
  { file:'shooter',                 name:'Shooter',                 genre:'PvP',             prompt:'Build a team-based PvP shooter with killstreak rewards' },
  { file:'steal_a_brainrot',        name:'Steal a Brainrot',        genre:'Comedy',          prompt:'Build a comedy heist game with silly characters' },
  { file:'the_forge',               name:'The Forge',               genre:'Fantasy RPG',     prompt:'Build a fantasy smithing game with an upgrade system' },
];

const EXAMPLE_PROMPTS = [
  'Build a police roleplay game...',
  'Build a zombie survival game...',
  'Build an oil tycoon game...',
  'Build a mansion obby...',
  'Build a shop with coins system...',
  'Build a racing game with leaderboards...',
];

const TICKER_ITEMS = [
  'Direct Studio Injection','AI Script Generation','Auto Play-Test',
  '@ Mention System','Roblox Account Sync',
  '30 Free Credits','Zero Copy-Paste','Studio-Aware AI','Natural Language',
  'Auto Error Fix','Instant Injection',
];

const imgFail = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const el = e.target as HTMLImageElement;
  el.style.background = 'linear-gradient(135deg,rgba(0,229,255,.05),rgba(136,0,255,.05))';
  el.src = '';
};

/* ─── Hero Game Carousel ─── */
/*
  Carousel logic:
  - Three explicit phases tracked in refs, not just state.
  - Phase flow: idle -> transitioning (leaving+entering rendered) -> idle (new active)
  - Only 2 images are visually active at a time; everything else is hidden (opacity:0, no transition).
  - Timer is stored in a ref and properly cleared/restarted whenever the active slide changes,
    so manual navigation (clicking a dot or side card) doesn't fight with the autoplay timer.
*/
function HeroGames({ onPromptClick }: { onPromptClick: (p: string) => void }) {
  const [activeIdx, setActiveIdx]       = useState(0);
  const [transiting, setTransiting]     = useState(false);
  const [nextIdx, setNextIdx]           = useState<number>(0);
  const [showEntering, setShowEntering] = useState(false);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLocked    = useRef(false);

  const startTimer = useCallback((currentIdx: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const nxt = (currentIdx + 1) % GAMES.length;
      triggerTransition(nxt);
    }, 4200);
  }, []); // eslint-disable-line

  const triggerTransition = useCallback((nxt: number) => {
    if (isLocked.current) return;
    isLocked.current = true;
    setNextIdx(nxt);
    setShowEntering(false);   // make sure entering image is invisible with no transition
    setTransiting(true);      // show leaving state on current active

    // After one frame, add transition to entering image
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setShowEntering(true); // now entering image fades in
      });
    });

    // After transition duration, swap active
    setTimeout(() => {
      setActiveIdx(nxt);
      setTransiting(false);
      setShowEntering(false);
      isLocked.current = false;
      startTimer(nxt);
    }, 650);
  }, [startTimer]);

  const goTo = useCallback((idx: number) => {
    if (idx === activeIdx || isLocked.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
    triggerTransition(idx);
  }, [activeIdx, triggerTransition]);

  // Start timer on mount
  useEffect(() => {
    startTimer(0);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []); // eslint-disable-line

  const sideLeft  = GAMES.slice(0, 3);
  const sideRight = GAMES.slice(7, 10);

  // Determine which image gets which class
  const getImgClass = (i: number): string => {
    if (transiting) {
      if (i === activeIdx) return 'img-leaving';
      if (i === nextIdx)   return showEntering ? 'img-active' : 'img-entering';
      return 'hg-img-hidden';
    }
    return i === activeIdx ? 'img-active' : 'hg-img-hidden';
  };

  const displayIdx = transiting ? nextIdx : activeIdx;

  return (
    <div className="hero-games-stage">
      {/* Left side cards */}
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
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {g.genre}
              </div>
              <div className="hg-card-name">{g.name}</div>
              <div className="hg-card-prompt">&quot;{g.prompt}&quot;</div>
            </div>
          </div>
        ))}
      </div>

      {/* Center carousel */}
      <div className="hg-center">
        <div className="hg-main-wrap">
          {GAMES.map((g, i) => {
            const cls = getImgClass(i);
            return (
              <img
                key={g.file}
                src={`/screenshot/game/${g.file}.webp`}
                alt={g.name}
                className={`hg-main-img ${cls}`}
                style={cls === 'hg-img-hidden' ? { opacity: 0, zIndex: 1, transition: 'none' } : undefined}
                onError={imgFail}
              />
            );
          })}
          <div className="hg-main-overlay">
            <div className="hg-main-name">{GAMES[displayIdx].name}</div>
            <div className="hg-main-tag">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              {GAMES[displayIdx].genre}
            </div>
            <div
              className="hg-main-prompt"
              onClick={() => onPromptClick(GAMES[displayIdx].prompt)}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              &quot;{GAMES[displayIdx].prompt}&quot;
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

      {/* Right side cards */}
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
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {g.genre}
              </div>
              <div className="hg-card-name">{g.name}</div>
              <div className="hg-card-prompt">&quot;{g.prompt}&quot;</div>
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
    const t = setInterval(() => setExIdx(i => (i + 1) % EXAMPLE_PROMPTS.length), 3200);
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
        {EXAMPLE_PROMPTS.slice(0, 5).map((ex, i) => (
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

/* ─── Mobile Nav ─── */
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
      <a href="#how" className="nav-mobile-item">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        How It Works
      </a>
      <a href="/login" className="nav-mobile-item primary">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        Start for Free — Enter NEXUS AI
      </a>
    </div>
  );
}

/* ─── Features data ─── */
const FEATURES = [
  {
    iconBg:'rgba(0,229,255,.09)', iconColor:'var(--cyan)',
    icon:<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
    title:'Direct Studio Injection',
    desc:'Scripts and game objects go straight into Roblox Studio via the companion plugin. No copy-pasting, no manual steps — ever.',
    tagBg:'rgba(0,229,255,.07)', tagColor:'var(--cyan)', tagLabel:'Plugin Required', delay:'d1',
  },
  {
    iconBg:'rgba(136,0,255,.09)', iconColor:'#cc55ff',
    icon:<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />,
    title:'AI Script Generation',
    desc:'Describe what you want in plain English and the AI writes production-quality Lua code tailored to your project.',
    tagBg:'rgba(0,255,170,.07)', tagColor:'var(--green)', tagLabel:'Powered by AI', delay:'d2',
  },
  {
    iconBg:'rgba(255,214,0,.08)', iconColor:'var(--yellow)',
    icon:<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    title:'Auto Play-Test & Fix',
    desc:'After building, AI runs a play-test automatically. Errors in the console? It reads them, stops, and re-injects a fix on its own.',
    tagBg:'rgba(255,214,0,.08)', tagColor:'var(--yellow)', tagLabel:'Auto-Fix', delay:'d3',
  },
  {
    iconBg:'rgba(255,45,107,.08)', iconColor:'var(--pink)',
    icon:<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    title:'@ Mention System',
    desc:'Type @ to reference any script or object in your project. AI reads it, understands it, and builds on top of it intelligently.',
    tagBg:'rgba(0,229,255,.07)', tagColor:'var(--cyan)', tagLabel:'Context-Aware', delay:'d4',
  },
  {
    iconBg:'rgba(0,229,255,.08)', iconColor:'var(--cyan)',
    icon:<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    title:'Roblox Account Sync',
    desc:'Credits, history, and projects are tied to your Roblox account and stay synced automatically across every device.',
    tagBg:'rgba(255,214,0,.08)', tagColor:'var(--yellow)', tagLabel:'Persistent', delay:'d5',
  },
  {
    iconBg:'rgba(0,255,170,.08)', iconColor:'var(--green)',
    icon:<><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>,
    title:'Studio-Aware AI',
    desc:'The AI sees your workspace as you build. It knows what scripts already exist and builds intelligently on top of them.',
    tagBg:'rgba(0,255,170,.07)', tagColor:'var(--green)', tagLabel:'Context-Aware', delay:'d6',
  },
];

/* ═══ MAIN PAGE ═══ */
export default function HomePage() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [promptVal, setPromptVal] = useState('');
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [logoErr,   setLogoErr]   = useState(false);

  /* Matrix rain canvas */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const chars = '01アイウエオカキLuaABCDEF{}[]<>;';
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
        ctx.fillStyle = `rgba(0,229,255,${0.018 + Math.random() * 0.045})`;
        ctx.fillText(ch, i * fs, drops[i] * fs);
        if (drops[i] * fs > canvas.height && Math.random() > .975) drops[i] = 0;
        drops[i]++;
      }
    };
    const id = setInterval(draw, 68);
    return () => { clearInterval(id); window.removeEventListener('resize', resize); };
  }, []);

  useEffect(() => {
    /* Floating particles */
    const container = document.getElementById('particles');
    if (container && container.children.length === 0) {
      for (let i = 0; i < 28; i++) {
        const el = document.createElement('div');
        el.className = 'p';
        const sz = Math.random() * 4 + 1;
        const isCyan = Math.random() > .4;
        const isPurple = !isCyan && Math.random() > .5;
        const color = isCyan ? '0,229,255' : isPurple ? '136,0,255' : '0,255,170';
        el.style.cssText =
          `width:${sz}px;height:${sz}px;left:${Math.random() * 100}%;` +
          `background:rgba(${color},${Math.random() * 0.3 + 0.06});` +
          `box-shadow:0 0 8px rgba(${color},.28);` +
          `animation-duration:${Math.random() * 20 + 10}s;animation-delay:${Math.random() * 18}s;`;
        container.appendChild(el);
      }
    }

    /* Navbar scroll effect */
    const navbar = document.getElementById('navbar');
    const handleScroll = () => navbar?.classList.toggle('scrolled', window.scrollY > 60);
    window.addEventListener('scroll', handleScroll, { passive: true });

    /* Hero scroll button */
    const heroScroll = document.getElementById('heroScroll');
    heroScroll?.addEventListener('click', () =>
      document.getElementById('mystery')?.scrollIntoView({ behavior: 'smooth' })
    );

    /* Scroll reveal observer */
    const revealEls = document.querySelectorAll('.reveal,.reveal-left,.reveal-right,.reveal-scale,.reveal-blur');
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('active'); }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    revealEls.forEach(el => observer.observe(el));

    /* Session check */
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
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <style>{CSS}</style>

      {/* ─── Background layers ─── */}
      <canvas ref={canvasRef} className="hp-canvas" />
      <div className="hp-grid" />
      <div className="hp-scanlines" />
      <div className="hp-vignette" />
      <div className="particles" id="particles" />
      <div className="orbs">
        <div className="orb orb1" /><div className="orb orb2" />
        <div className="orb orb3" /><div className="orb orb4" />
      </div>

      {/* ═══ NAVBAR ═══ */}
      <nav className="nav" id="navbar">
        <a href="/" className="nav-logo-wrap">
          <div className="nav-logo-icon">
            {logoErr ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            ) : (
              <Image src="/images/nexusai.png" alt="NEXUS AI" width={20} height={20}
                style={{ objectFit:'contain' }} onError={() => setLogoErr(true)} unoptimized />
            )}
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
            Enter Free
          </a>
          <button className="nav-menu-btn" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {menuOpen
                ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                : <><line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" /></>
              }
            </svg>
          </button>
        </div>
      </nav>
      <MobileMenu open={menuOpen} />

      {/* ═══ HERO ═══ */}
      <section className="hero" id="top">
        <div className="hero-badge">
          <div className="badge-dot" />
          Roblox Studio · Direct Injection · AI Agent
        </div>

        <h1 className="hero-title">
          <span className="line1">Build The Game</span>
          <span className="grad">Only You Can Imagine</span>
        </h1>

        <HeroPrompt value={promptVal} onChange={setPromptVal} />
        <HeroGames onPromptClick={p => setPromptVal(p)} />

        <div className="hero-stats">
          <div className="stat">
            <div className="stat-n">Free</div>
            <div className="stat-l">To Start</div>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <div className="stat-n">AI</div>
            <div className="stat-l">Powered</div>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <div className="stat-n">Direct</div>
            <div className="stat-l">Injection</div>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <div className="stat-n">&#8734;</div>
            <div className="stat-l">Potential</div>
          </div>
        </div>

        <div className="hero-scroll" id="heroScroll" role="button" aria-label="Scroll down">
          <svg width="26" height="26" viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </section>

      {/* ═══ TICKER ═══ */}
      <div className="ticker-wrap">
        <div className="ticker-inner">
          {[...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <div key={i} className="ticker-item">
              <div className="ticker-dot" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ WHAT IS NEXUS AI ═══ */}
      <div className="mystery" id="mystery">
        <div className="mystery-inner">
          <div className="mystery-eyebrow reveal">What is NEXUS AI?</div>
          <h2 className="mystery-title reveal d1">
            The AI That Lives<br />
            <span style={{ color:'var(--cyan)' }}>Inside Your Studio</span>
          </h2>
          <p className="mystery-sub reveal d2">
            Most AI tools give you code you still have to copy, paste, and test yourself.<br />
            NEXUS AI skips all of that — it injects scripts and full systems
            directly into your Roblox place. Just describe what you want, and watch it appear.
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
              {
                icon:<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
                color:'var(--cyan)', title:'Zero Copy-Paste',
                desc:'Every script goes directly into Roblox Studio via plugin. Type once, it appears instantly — no clipboard needed.',
                delay:'d1',
              },
              {
                icon:<><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>,
                color:'var(--purple)', title:'Studio-Aware AI',
                desc:'The AI sees your workspace. It knows what scripts exist and builds intelligently on top of them.',
                delay:'d2',
              },
              {
                icon:<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
                color:'var(--green)', title:'Natural Language',
                desc:'No technical syntax needed. Just describe what you want — "add a shop with coins" — and it happens.',
                delay:'d3',
              },
              {
                icon:<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
                color:'var(--yellow)', title:'Auto Test & Fix',
                desc:'AI runs a play-test after every build. Console errors? It reads them and self-corrects automatically.',
                delay:'d4',
              },
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
          <a href="/login" className="btn-primary reveal d3" style={{ display:'inline-flex' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Unlock Everything — Free
          </a>
        </div>
      </div>

      {/* ═══ SCREENSHOTS ═══ */}
      <div className="screenshots-section" id="screenshots">
        <div style={{ textAlign:'center', marginBottom:'50px', maxWidth:'640px', marginLeft:'auto', marginRight:'auto' }}>
          <div className="sec-eyebrow reveal">See It In Action</div>
          <h2 className="sec-title reveal d1">From Prompt to Studio</h2>
          <p className="sec-sub reveal d2" style={{ marginBottom:0 }}>
            Watch an idea transform into real Roblox content in under 5 seconds.
          </p>
        </div>
        <div className="screen-grid">
          {[
            {
              badge:'Web', img:'/screenshot/screen1.png', alt:'Chat Interface',
              iconColor:'var(--cyan)',
              icon:<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
              title:'Chat Interface',
              desc:'Type your request in plain English. NEXUS AI breaks it into precise actions and executes them immediately in Studio.',
              delay:'d1',
            },
            {
              badge:'Plugin', img:'/screenshot/screen2.png', alt:'Studio Plugin',
              iconColor:'var(--green)',
              icon:<><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" /><line x1="16" y1="8" x2="2" y2="22" /></>,
              title:'Studio Plugin',
              desc:'The companion plugin lives inside Roblox Studio — always connected, always listening, injecting in real-time.',
              delay:'d2',
            },
            {
              badge:'Live', img:'/screenshot/screen3.png', alt:'Live Injection',
              iconColor:'var(--yellow)',
              icon:<polyline points="20 6 9 17 4 12" />,
              title:'Live & Injecting',
              desc:'Every AI command materializes in your place — parts, scripts, full systems. All live, all instant.',
              delay:'d3',
            },
          ].map((s, i) => (
            <div key={i} className={`screen-card reveal ${s.delay}`}>
              <span className="screen-badge">{s.badge}</span>
              <div className="screen-img-wrap">
                <img
                  src={s.img} alt={s.alt} className="screen-card-img"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.08'; }}
                />
              </div>
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

      {/* ═══ FEATURES ═══ */}
      <section className="section" id="features">
        <div className="sec-eyebrow reveal">Core Capabilities</div>
        <h2 className="sec-title reveal d1">Built for Serious Developers</h2>
        <p className="sec-sub reveal d2">
          Every tool you need to ship a complete Roblox game, powered by AI that truly understands Studio.
        </p>
        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <div key={i} className={`feat reveal ${f.delay}`}>
              <div className="feat-icon" style={{ background:f.iconBg }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={f.iconColor} strokeWidth="2">{f.icon}</svg>
              </div>
              <div className="feat-title">{f.title}</div>
              <div className="feat-desc">{f.desc}</div>
              <span className="feat-tag" style={{ background:f.tagBg, color:f.tagColor }}>{f.tagLabel}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="section" style={{ paddingTop:0 }} id="how">
        <div className="sec-eyebrow reveal">Setup</div>
        <h2 className="sec-title reveal d1">3 Steps. That&apos;s It.</h2>
        <p className="sec-sub reveal d2">One-time setup. Infinite creation from there.</p>
        <div className="how-grid">
          {[
            {
              n:'1', title:'Login & Verify',
              desc:'Sign in with your Roblox account. You get 30 free credits instantly — no credit card, no commitment.',
              delay:'d1',
            },
            {
              n:'2', title:'Install the Plugin',
              desc:'Grab the NEXUS AI plugin from Creator Store. Open Studio, click Connect — a green light means you\'re ready to build.',
              delay:'d2',
            },
            {
              n:'3', title:'Describe & Build',
              desc:'Type what you want in plain English. AI builds, injects, and tests it inside Studio while you watch.',
              delay:'d3',
            },
          ].map((s, i) => (
            <div key={i} className={`step-card reveal ${s.delay}`}>
              <div className="step-num-wrap">{s.n}</div>
              <div className="step-title">{s.title}</div>
              <div className="step-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ GATE ═══ */}
      <div className="gate-section" id="gate">
        <div className="gate-box reveal-scale">
          <div className="gate-glow" />
          <div className="gate-icon">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#cc55ff" strokeWidth="1.8">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              <circle cx="12" cy="16" r="1" fill="#cc55ff" />
            </svg>
          </div>
          <div className="gate-title">The Rest is Inside</div>
          <div className="gate-sub">
            Your dashboard, full AI access, credit system, plugin download, daily rewards, and project history — all waiting behind one free login.
          </div>
          <a href="/login" className="gate-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Enter NEXUS AI
          </a>
          <div className="gate-note">
            <span>30 free credits</span> &nbsp;&middot;&nbsp; No credit card required &nbsp;&middot;&nbsp; Sign in with Roblox
          </div>
        </div>
      </div>

      {/* ═══ CTA ═══ */}
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
            Join developers who have stopped copy-pasting and started creating.
            Your game deserves better than manual scripting.
          </p>
          <div className="cta-actions">
            <a href="/login" className="btn-primary" style={{ width:'100%', maxWidth:'340px', justifyContent:'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Start Free Now
            </a>
            <a href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noopener" className="cta-discord">
              <DiscordIcon />
              Join Discord for Plugin &amp; Promo Codes
            </a>
          </div>
          <div className="cta-meta">
            <span>30 credits on signup</span> &nbsp;&middot;&nbsp; +2 free daily &nbsp;&middot;&nbsp; Pro plan for power users
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer>
        <div className="footer-inner">
          <div className="footer-brand-wrap">
            <div className="footer-logo-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
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
          <span className="footer-copy">&copy; 2026 NEXUS STUDIO &middot; nexusai-rbx.vercel.app</span>
        </div>
      </footer>
    </>
  );
}