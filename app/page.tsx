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

/* ─── Model Image Icon ─── */
function ModelImg({ src, alt, size = 18 }: { src: string; alt: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 4, flexShrink: 0,
        background: 'rgba(0,229,255,.12)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: size * 0.55, color: 'var(--cyan)',
        fontWeight: 700, fontFamily: 'monospace',
      }}>
        {alt.charAt(0)}
      </div>
    );
  }
  return (
    <Image
      src={src} alt={alt} width={size} height={size}
      style={{ borderRadius: 4, objectFit: 'contain', flexShrink: 0 }}
      onError={() => setErr(true)}
      unoptimized
    />
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
::-webkit-scrollbar-thumb { background:rgba(0,229,255,.22); border-radius:3px; }
::-webkit-scrollbar-track { background:transparent; }

/* ─── BG ─── */
.hp-canvas { position:fixed; inset:0; z-index:0; pointer-events:none; opacity:.35; }
.hp-grid {
  position:fixed; inset:0; pointer-events:none; z-index:1;
  background:
    linear-gradient(rgba(0,229,255,.012) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,229,255,.012) 1px,transparent 1px);
  background-size:48px 48px;
}
.hp-scanlines {
  position:fixed; inset:0; pointer-events:none; z-index:1;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.035) 2px,rgba(0,0,0,.035) 4px);
}
.hp-vignette {
  position:fixed; inset:0; pointer-events:none; z-index:1;
  background:radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,.65) 100%);
}

/* ─── Orbs ─── */
.orbs { position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
.orb  { position:absolute; border-radius:50%; filter:blur(120px); }
.orb1 { width:600px;height:600px;background:rgba(0,229,255,.045);top:-180px;left:-140px;animation:orbDrift1 14s ease-in-out infinite alternate; }
.orb2 { width:720px;height:720px;background:rgba(136,0,255,.05);top:200px;right:-220px;animation:orbDrift2 16s ease-in-out infinite alternate; }
.orb3 { width:460px;height:460px;background:rgba(255,45,107,.03);bottom:80px;left:22%;animation:orbDrift3 11s ease-in-out infinite alternate; }
.orb4 { width:320px;height:320px;background:rgba(0,255,170,.025);bottom:-80px;right:15%;animation:orbDrift4 9s ease-in-out infinite alternate; }
@keyframes orbDrift1{from{transform:translate(0,0);}to{transform:translate(40px,28px);}}
@keyframes orbDrift2{from{transform:translate(0,0);}to{transform:translate(-32px,20px);}}
@keyframes orbDrift3{from{transform:translate(0,0);}to{transform:translate(20px,-28px);}}
@keyframes orbDrift4{from{transform:translate(0,0);}to{transform:translate(-16px,22px);}}

/* ─── Particles ─── */
.particles { position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
.p { position:absolute; border-radius:50%; animation:pfloat linear infinite; }
@keyframes pfloat {
  0%{transform:translateY(100vh) scale(0);opacity:0}
  6%{opacity:1} 88%{opacity:.12}
  100%{transform:translateY(-8vh) scale(1.6);opacity:0}
}

/* ─── Scroll Reveal ─── */
.reveal,.reveal-left,.reveal-right,.reveal-scale,.reveal-blur {
  opacity:0; transition:opacity .7s ease, transform .7s ease, filter .7s ease;
}
.reveal       { transform:translateY(30px); }
.reveal-left  { transform:translateX(-30px); }
.reveal-right { transform:translateX(30px); }
.reveal-scale { transform:scale(.92); }
.reveal-blur  { transform:translateY(16px); filter:blur(8px); }
.reveal.active,.reveal-left.active,.reveal-right.active,.reveal-scale.active,.reveal-blur.active {
  opacity:1; transform:none; filter:none;
}
.d1{transition-delay:.06s!important} .d2{transition-delay:.14s!important}
.d3{transition-delay:.22s!important} .d4{transition-delay:.30s!important}
.d5{transition-delay:.38s!important} .d6{transition-delay:.46s!important}
.d7{transition-delay:.54s!important}
@media(prefers-reduced-motion:reduce){
  .reveal,.reveal-left,.reveal-right,.reveal-scale,.reveal-blur{opacity:1;transform:none;filter:none;transition:none;}
}

/* ═══ NAVBAR ═══ */
.nav {
  position:fixed;top:0;left:0;right:0;z-index:100;
  height:58px; padding:0 32px;
  display:flex;align-items:center;gap:10px;
  background:linear-gradient(180deg,rgba(3,3,18,.97),rgba(3,3,18,.88));
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border-bottom:1px solid var(--b);
  transition:height .3s ease, background .3s ease;
}
.nav.scrolled { height:50px; background:rgba(3,3,18,.99); }
.nav-logo-wrap { display:flex;align-items:center;gap:10px;text-decoration:none;flex-shrink:0; }
.nav-logo-icon {
  width:32px;height:32px;border-radius:9px;flex-shrink:0;
  border:1.5px solid rgba(0,229,255,.28);
  background:linear-gradient(135deg,rgba(0,229,255,.15),rgba(136,0,255,.15));
  box-shadow:0 0 16px rgba(0,229,255,.18),0 0 0 1px rgba(0,229,255,.06) inset;
  display:flex;align-items:center;justify-content:center;
  position:relative;overflow:hidden;transition:.2s;
}
.nav-logo-icon::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(135deg,rgba(255,255,255,.08),transparent);
}
.nav-logo-wrap:hover .nav-logo-icon{
  box-shadow:0 0 26px rgba(0,229,255,.32),0 0 0 1px rgba(0,229,255,.15) inset;
  border-color:rgba(0,229,255,.5);
}
.nav-logo {
  font-family:'Orbitron',sans-serif;font-weight:900;font-size:13.5px;letter-spacing:3.5px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  white-space:nowrap;
}
.nav-divider { width:1px;height:18px;background:var(--dim2);margin:0 4px;flex-shrink:0; }
.nav-sub { font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:2px;white-space:nowrap;flex-shrink:0; }
.nav-live {
  display:flex;align-items:center;gap:5px;flex-shrink:0;
  padding:4px 11px;border-radius:20px;
  background:rgba(0,255,170,.06);border:1px solid rgba(0,255,170,.18);
  font-size:8.5px;color:var(--green);letter-spacing:1px;
}
.nav-live-dot { width:5px;height:5px;border-radius:50%;background:var(--green);animation:liveDot 1.8s ease-in-out infinite; }
@keyframes liveDot{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.25;transform:scale(.55);}}

.nav-r { margin-left:auto;display:flex;align-items:center;gap:8px; }
.nav-discord {
  padding:7px 14px;border-radius:9px;
  border:1px solid rgba(88,101,242,.32);background:rgba(88,101,242,.07);
  color:#7289da;font-size:10px;text-decoration:none;
  transition:.18s;display:flex;align-items:center;gap:7px;white-space:nowrap;
}
.nav-discord:hover{background:rgba(88,101,242,.18);border-color:rgba(88,101,242,.6);transform:translateY(-1px);}
.nav-login {
  padding:9px 22px;border-radius:9px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  color:white;font-family:'Orbitron',sans-serif;font-size:9.5px;font-weight:700;
  text-decoration:none;letter-spacing:1px;
  transition:.2s;display:flex;align-items:center;gap:7px;
  position:relative;overflow:hidden;
  box-shadow:0 4px 20px rgba(0,229,255,.2);white-space:nowrap;
}
.nav-login::before{
  content:'';position:absolute;top:-50%;left:-60%;
  width:40%;height:200%;
  background:rgba(255,255,255,.12);
  transform:skewX(-20deg);
  animation:navShine 3.5s ease-in-out infinite;
}
@keyframes navShine{0%,100%{left:-60%;opacity:0}50%{left:120%;opacity:1}}
.nav-login:hover{opacity:.88;transform:translateY(-1px);box-shadow:0 8px 30px rgba(0,229,255,.32);}

.nav-menu-btn {
  display:none;background:none;border:1px solid var(--b);border-radius:9px;
  padding:8px;cursor:pointer;color:var(--text);transition:.18s;
  align-items:center;justify-content:center;
}
.nav-menu-btn:hover{border-color:var(--cyan2);color:var(--cyan);}
.nav-mobile-menu {
  display:none;
  position:fixed;top:58px;left:0;right:0;
  background:rgba(3,3,18,.98);border-bottom:1px solid var(--b);
  padding:18px 16px;z-index:99;
  flex-direction:column;gap:10px;
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  transform:translateY(-10px);opacity:0;
  transition:transform .25s ease, opacity .25s ease;
  pointer-events:none;
}
.nav-mobile-menu.open{
  display:flex;transform:translateY(0);opacity:1;pointer-events:auto;
}
.nav-mobile-item {
  padding:13px 16px;border-radius:11px;
  border:1px solid var(--b);color:var(--text);
  text-decoration:none;font-size:11px;
  display:flex;align-items:center;gap:9px;transition:.18s;
}
.nav-mobile-item:hover{border-color:var(--cyan2);color:var(--cyan);background:rgba(0,229,255,.04);}
.nav-mobile-item.primary{
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  color:white;font-family:'Orbitron',sans-serif;font-weight:700;
  letter-spacing:1px;border-color:transparent;
  box-shadow:0 4px 16px rgba(0,229,255,.2);
}

/* ═══ HERO ═══ */
.hero {
  min-height:100vh;
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  text-align:center;
  padding:130px 20px 70px;
  position:relative;z-index:2;
  overflow:hidden;
}
.hero::before {
  content:'';position:absolute;inset:0;pointer-events:none;
  background:
    radial-gradient(ellipse 75% 55% at 50% -5%,rgba(136,0,255,.22) 0%,transparent 60%),
    radial-gradient(ellipse 55% 40% at 50% 80%,rgba(0,229,255,.07) 0%,transparent 55%);
}

.hero-badge {
  display:inline-flex;align-items:center;gap:9px;padding:7px 20px;
  background:rgba(0,229,255,.05);border:1px solid rgba(0,229,255,.18);
  border-radius:24px;font-size:9px;color:var(--cyan);
  margin-bottom:28px;letter-spacing:2px;text-transform:uppercase;
  animation:fadeUpHero .9s ease both;
  box-shadow:0 0 24px rgba(0,229,255,.07),0 0 0 1px rgba(0,229,255,.05) inset;
  position:relative;overflow:hidden;
}
.hero-badge::before{
  content:'';position:absolute;top:-50%;left:-80%;width:60%;height:200%;
  background:linear-gradient(90deg,transparent,rgba(0,229,255,.08),transparent);
  animation:badgeShine 4s ease-in-out infinite;
}
@keyframes badgeShine{0%,100%{left:-80%}50%{left:120%}}
.badge-dot{width:6px;height:6px;border-radius:50%;background:var(--cyan);animation:liveDot 1.8s infinite;box-shadow:0 0 8px var(--cyan);}

.hero-title {
  font-family:'Orbitron',sans-serif;
  font-size:clamp(30px,6.5vw,82px);font-weight:900;
  line-height:1.06;margin-bottom:0;
  animation:fadeUpHero .9s .12s ease both;
  letter-spacing:-0.5px;
}
.hero-title .grad {
  background:linear-gradient(135deg,var(--cyan) 0%,var(--purple) 45%,var(--pink) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  display:inline-block;
  filter:drop-shadow(0 0 40px rgba(0,229,255,.2));
}

/* ─── Prompt Box ─── */
.hero-prompt-wrap {
  width:100%;max-width:680px;
  margin:36px auto 0;
  position:relative;z-index:5;
  animation:fadeUpHero .9s .25s ease both;
}
.hero-prompt-box {
  display:flex;align-items:center;gap:0;
  background:rgba(6,7,26,.92);
  border:1.5px solid rgba(0,229,255,.24);
  border-radius:18px;
  padding:6px 6px 6px 20px;
  box-shadow:
    0 0 0 1px rgba(0,229,255,.07) inset,
    0 24px 70px rgba(0,0,0,.6),
    0 0 60px rgba(0,229,255,.06);
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  transition:border-color .28s, box-shadow .28s;
}
.hero-prompt-box:focus-within {
  border-color:rgba(0,229,255,.55);
  box-shadow:
    0 0 0 1px rgba(0,229,255,.12) inset,
    0 24px 70px rgba(0,0,0,.7),
    0 0 70px rgba(0,229,255,.16);
}
.hero-prompt-input {
  flex:1;background:transparent;border:none;outline:none;
  font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text);
  padding:13px 0;line-height:1.5;
  resize:none;min-height:50px;max-height:130px;
}
.hero-prompt-input::placeholder { color:var(--dim); }
.hero-prompt-btn {
  flex-shrink:0;
  padding:13px 24px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  border:none;border-radius:13px;
  color:white;font-family:'Orbitron',sans-serif;font-size:9.5px;font-weight:700;
  cursor:pointer;transition:.22s;letter-spacing:1px;
  display:flex;align-items:center;gap:8px;
  position:relative;overflow:hidden;
  box-shadow:0 4px 22px rgba(0,229,255,.24);white-space:nowrap;
}
.hero-prompt-btn::before{
  content:'';position:absolute;top:-50%;left:-60%;
  width:40%;height:200%;
  background:rgba(255,255,255,.1);
  transform:skewX(-20deg);
  animation:navShine 2.5s ease-in-out infinite 1s;
}
.hero-prompt-btn:hover{opacity:.88;transform:translateY(-1px);box-shadow:0 8px 36px rgba(0,229,255,.36);}
.hero-prompt-btn:active{transform:scale(.97);}

.hero-prompt-examples {
  display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:15px;
}
.hero-prompt-ex {
  display:inline-flex;align-items:center;gap:6px;
  padding:6px 14px;border-radius:22px;
  background:rgba(0,229,255,.04);border:1px solid rgba(0,229,255,.12);
  font-size:9.5px;color:var(--text2);cursor:pointer;
  transition:.2s;white-space:nowrap;
}
.hero-prompt-ex:hover{background:rgba(0,229,255,.1);border-color:rgba(0,229,255,.35);color:var(--cyan);transform:translateY(-2px);}

/* ═══ GAME CAROUSEL ═══ */
.hero-games-stage {
  position:relative;
  width:100%;max-width:1120px;
  height:350px;
  margin:52px auto 0;
  animation:fadeUpHero .9s .35s ease both;
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
  display:flex;align-items:center;gap:11px;
  padding:9px 13px 9px 9px;
  background:rgba(6,7,26,.9);
  border:1px solid rgba(0,229,255,.14);
  border-radius:13px;
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  box-shadow:0 10px 36px rgba(0,0,0,.55),0 0 0 1px rgba(0,229,255,.05) inset;
  font-size:10px;color:var(--text);
  white-space:nowrap;transition:.24s;cursor:pointer;min-width:210px;
}
.hg-card:hover{
  border-color:rgba(0,229,255,.38);
  box-shadow:0 14px 44px rgba(0,229,255,.14),0 0 0 1px rgba(0,229,255,.12) inset;
  transform:translateY(-4px);
}
.hg-card-thumb {
  width:52px;height:52px;border-radius:9px;object-fit:cover;flex-shrink:0;
  border:1px solid rgba(0,229,255,.12);
  background:linear-gradient(135deg,rgba(0,229,255,.08),rgba(136,0,255,.08));
}
.hg-card-info { display:flex;flex-direction:column;gap:3px; }
.hg-card-label { font-size:8.5px;color:var(--dim);display:flex;align-items:center;gap:5px; }
.hg-card-name  { font-size:10px;color:white;font-weight:600; }
.hg-card-prompt{ font-size:8px;color:var(--cyan);opacity:.7;font-style:italic;max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }

/* Center */
.hg-center {
  position:absolute;left:50%;top:50%;
  transform:translate(-50%,-50%);
  width:390px;pointer-events:auto;
}
.hg-main-wrap {
  position:relative;width:100%;height:270px;
  border-radius:18px;overflow:hidden;
  border:1.5px solid rgba(0,229,255,.24);
  box-shadow:0 0 0 1px rgba(0,229,255,.08) inset,0 28px 72px rgba(0,0,0,.72),0 0 60px rgba(0,229,255,.12);
}
.hg-main-img {
  position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
  transition:opacity .72s ease, transform .72s ease;
  background:linear-gradient(135deg,rgba(0,229,255,.05),rgba(136,0,255,.05));
}
.hg-main-img.entering { opacity:0; transform:scale(1.05); }
.hg-main-img.active   { opacity:1; transform:scale(1); }
.hg-main-img.leaving  { opacity:0; transform:scale(.96); }

.hg-main-overlay {
  position:absolute;bottom:0;left:0;right:0;z-index:3;
  background:linear-gradient(0deg,rgba(3,3,18,.97) 0%,rgba(3,3,18,.45) 65%,transparent 100%);
  padding:30px 18px 16px;
}
.hg-main-name{font-size:14px;font-weight:700;color:white;margin-bottom:3px;}
.hg-main-tag{font-size:8.5px;color:var(--cyan);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:5px;}
.hg-main-prompt{
  display:inline-flex;align-items:center;gap:7px;
  padding:5px 11px;border-radius:9px;
  background:rgba(0,229,255,.09);border:1px solid rgba(0,229,255,.22);
  font-size:8.5px;color:var(--text2);font-style:italic;cursor:pointer;transition:.18s;
}
.hg-main-prompt:hover{background:rgba(0,229,255,.18);color:var(--cyan);}

.hg-main-wrap::before{
  content:'';position:absolute;top:0;left:0;right:0;height:2px;z-index:4;
  background:linear-gradient(90deg,transparent,var(--cyan),var(--purple),transparent);
  animation:shimmerBar 3.5s ease-in-out infinite;
}
@keyframes shimmerBar{0%,100%{opacity:.45}50%{opacity:1}}

.hg-dots{display:flex;gap:7px;justify-content:center;margin-top:14px;}
.hg-dot{
  width:6px;height:6px;border-radius:50%;
  background:rgba(0,229,255,.18);border:1px solid rgba(0,229,255,.15);
  cursor:pointer;transition:.22s;
}
.hg-dot.active{background:var(--cyan);box-shadow:0 0 10px rgba(0,229,255,.7);width:20px;border-radius:4px;}

/* ─── Stats ─── */
.hero-stats{
  display:flex;gap:44px;margin-top:52px;flex-wrap:wrap;justify-content:center;
  animation:fadeUpHero .9s .48s ease both;
}
.stat{text-align:center;position:relative;}
.stat-n{
  font-family:'Orbitron',sans-serif;font-size:26px;font-weight:900;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  line-height:1.1;
}
.stat-l{font-size:8.5px;color:var(--dim);text-transform:uppercase;letter-spacing:2px;margin-top:6px;}
.stat-divider{width:1px;background:var(--b);align-self:stretch;margin:4px 0;}

/* Scroll arrow */
.hero-scroll{margin-top:44px;cursor:pointer;animation:bounce 2.5s infinite,fadeUpHero .9s .55s ease both;}
@keyframes bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(10px);}}
.hero-scroll svg{opacity:.28;transition:.2s;stroke:var(--text);fill:none;stroke-width:2;}
.hero-scroll:hover svg{opacity:.65;}

@keyframes fadeUpHero{from{opacity:0;transform:translateY(24px);}to{opacity:1;transform:none;}}

/* ═══ SECTIONS ═══ */
.section{padding:96px 32px;position:relative;z-index:1;max-width:1200px;margin:0 auto;}
.section-full{padding:96px 32px;position:relative;z-index:1;}

.sec-eyebrow{
  font-size:9px;color:var(--cyan);text-transform:uppercase;letter-spacing:3px;
  margin-bottom:14px;text-align:center;
  display:flex;align-items:center;justify-content:center;gap:12px;
}
.sec-eyebrow::before,.sec-eyebrow::after{
  content:'';width:38px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(0,229,255,.4));
}
.sec-eyebrow::after{background:linear-gradient(90deg,rgba(0,229,255,.4),transparent);}
.sec-title{font-family:'Orbitron',sans-serif;font-size:clamp(22px,3.5vw,38px);font-weight:900;text-align:center;color:white;margin-bottom:12px;line-height:1.2;}
.sec-sub{font-size:11.5px;color:var(--text2);text-align:center;max-width:520px;margin:0 auto 56px;line-height:2;}

/* ═══ MYSTERY ═══ */
.mystery {
  padding:104px 24px;
  background:linear-gradient(180deg,transparent,rgba(136,0,255,.04),transparent);
  border-top:1px solid var(--b);border-bottom:1px solid var(--b);
  position:relative;z-index:1;text-align:center;
}
.mystery-inner{max-width:820px;margin:0 auto;}
.mystery-eyebrow{
  font-size:9px;color:var(--purple);text-transform:uppercase;letter-spacing:3px;margin-bottom:22px;
  display:flex;align-items:center;justify-content:center;gap:12px;
}
.mystery-eyebrow::before,.mystery-eyebrow::after{
  content:'';flex:1;max-width:90px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(136,0,255,.45));
}
.mystery-eyebrow::after{background:linear-gradient(90deg,rgba(136,0,255,.45),transparent);}
.mystery-title{font-family:'Orbitron',sans-serif;font-size:clamp(24px,4.5vw,48px);font-weight:900;color:white;margin-bottom:20px;line-height:1.15;}
.mystery-sub{font-size:12px;color:var(--text2);line-height:2;max-width:620px;margin:0 auto 16px;}
.mystery-lock{
  display:inline-flex;align-items:center;gap:8px;padding:6px 18px;margin-bottom:40px;
  background:rgba(255,45,107,.07);border:1px solid rgba(255,45,107,.24);
  border-radius:22px;font-size:9px;color:var(--pink);letter-spacing:1px;
}
.hint-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:40px;}
.hint-card{
  padding:24px 20px;background:rgba(136,0,255,.04);border:1px solid rgba(136,0,255,.13);
  border-radius:13px;text-align:left;transition:.25s;position:relative;overflow:hidden;
}
.hint-card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1.5px;
  background:linear-gradient(90deg,transparent,rgba(136,0,255,.6),transparent);
  opacity:0;transition:.25s;
}
.hint-card:hover{border-color:rgba(136,0,255,.38);background:rgba(136,0,255,.08);transform:translateY(-4px);box-shadow:0 12px 36px rgba(136,0,255,.1);}
.hint-card:hover::before{opacity:1;}
.hint-icon{width:38px;height:38px;border-radius:11px;background:rgba(136,0,255,.11);border:1px solid rgba(136,0,255,.2);display:flex;align-items:center;justify-content:center;margin-bottom:14px;transition:.25s;}
.hint-card:hover .hint-icon{background:rgba(136,0,255,.2);border-color:rgba(136,0,255,.4);transform:scale(1.1);}
.hint-title{font-size:11px;color:white;font-weight:600;margin-bottom:7px;}
.hint-sub{font-size:10px;color:var(--text2);line-height:1.8;}

/* ═══ SCREENSHOTS ═══ */
.screenshots-section{
  background:linear-gradient(180deg,transparent,rgba(0,229,255,.018),transparent);
  border-top:1px solid var(--b);border-bottom:1px solid var(--b);
  padding:96px 24px;position:relative;z-index:1;
}
.screen-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:20px;max-width:1180px;margin:0 auto;}
.screen-card{
  border-radius:16px;overflow:hidden;border:1px solid var(--b);
  background:rgba(6,7,26,.82);transition:.3s;position:relative;
  box-shadow:0 10px 36px rgba(0,0,0,.42);
}
.screen-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1.5px;background:linear-gradient(90deg,transparent,var(--cyan),transparent);opacity:0;transition:.3s;z-index:2;}
.screen-card:hover{border-color:var(--cyan2);transform:translateY(-7px);box-shadow:0 28px 70px rgba(0,229,255,.12);}
.screen-card:hover::before{opacity:1;}
.screen-card-img{
  width:100%;height:210px;object-fit:cover;object-position:top;display:block;
  border-bottom:1px solid var(--b);
  background:linear-gradient(135deg,rgba(0,229,255,.04),rgba(136,0,255,.04));
  transition:transform .4s ease;
}
.screen-card:hover .screen-card-img{transform:scale(1.03);}
.screen-card-body{padding:18px 20px;}
.screen-card-title{font-size:11.5px;color:white;font-weight:600;margin-bottom:7px;display:flex;align-items:center;gap:9px;}
.screen-card-desc{font-size:10px;color:var(--text2);line-height:1.85;}
.screen-badge{position:absolute;top:12px;right:12px;padding:3px 11px;border-radius:7px;font-size:8px;font-weight:700;background:rgba(0,229,255,.1);color:var(--cyan);border:1px solid rgba(0,229,255,.24);backdrop-filter:blur(6px);text-transform:uppercase;letter-spacing:1px;}

/* ═══ FEATURES ═══ */
.features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:18px;}
.feat{
  padding:28px;background:rgba(6,7,26,.72);border:1px solid var(--b);
  border-radius:16px;transition:.3s;position:relative;overflow:hidden;
}
.feat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--cyan),transparent);opacity:0;transition:.3s;}
.feat::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(0,229,255,.04),transparent 70%);opacity:0;transition:.3s;}
.feat:hover{border-color:var(--cyan2);background:rgba(0,229,255,.025);transform:translateY(-5px);box-shadow:0 20px 50px rgba(0,229,255,.08);}
.feat:hover::before,.feat:hover::after{opacity:1;}
.feat-icon{width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;margin-bottom:18px;flex-shrink:0;transition:.25s;}
.feat:hover .feat-icon{transform:scale(1.1) rotate(3deg);}
.feat-title{font-family:'Orbitron',sans-serif;font-size:10.5px;font-weight:700;color:white;margin-bottom:9px;letter-spacing:.3px;}
.feat-desc{font-size:10.5px;color:var(--text2);line-height:1.95;}
.feat-tag{display:inline-flex;align-items:center;gap:5px;margin-top:15px;padding:3px 11px;border-radius:7px;font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;}

/* ═══ HOW IT WORKS ═══ */
.how-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px;}
.step-connector{display:none;}
.step-card{
  text-align:center;padding:36px 24px;background:rgba(6,7,26,.72);
  border:1px solid var(--b);border-radius:16px;transition:.28s;position:relative;overflow:hidden;
}
.step-card::after{
  content:'';position:absolute;bottom:0;left:0;right:0;height:1.5px;
  background:linear-gradient(90deg,transparent,var(--cyan),transparent);
  opacity:0;transition:.28s;
}
.step-card:hover{border-color:var(--cyan2);transform:translateY(-5px);box-shadow:0 18px 50px rgba(0,229,255,.09);}
.step-card:hover::after{opacity:1;}
.step-num-wrap{
  width:60px;height:60px;border-radius:50%;border:1.5px solid rgba(0,229,255,.32);
  background:rgba(0,229,255,.05);display:flex;align-items:center;justify-content:center;
  font-family:'Orbitron',sans-serif;font-size:22px;font-weight:900;color:var(--cyan);
  margin:0 auto 20px;transition:.28s;
  box-shadow:0 0 0 0 rgba(0,229,255,0);
}
.step-card:hover .step-num-wrap{
  border-color:var(--cyan);background:rgba(0,229,255,.12);
  box-shadow:0 0 32px rgba(0,229,255,.22);
}
.step-title{font-size:12.5px;font-weight:600;color:white;margin-bottom:10px;letter-spacing:.3px;}
.step-desc{font-size:10.5px;color:var(--text2);line-height:1.9;}

/* Code demo */
.code-demo{
  max-width:740px;margin:44px auto 0;
  background:rgba(6,7,26,.92);border:1px solid var(--b);border-radius:16px;overflow:hidden;
  box-shadow:0 0 0 1px rgba(0,229,255,.05) inset,0 24px 70px rgba(0,0,0,.55);
  backdrop-filter:blur(12px);
}
.code-top{
  padding:11px 18px;border-bottom:1px solid var(--b);
  display:flex;align-items:center;gap:9px;background:rgba(13,14,40,.8);
}
.code-dots{display:flex;gap:7px;}
.cd{width:11px;height:11px;border-radius:50%;cursor:default;}
.cd1{background:rgba(255,95,86,.8);} .cd2{background:rgba(254,188,46,.7);} .cd3{background:rgba(40,200,64,.65);}
.code-lbl{font-size:9px;color:var(--dim);margin-left:6px;flex:1;}
.code-tag{font-size:8px;padding:3px 9px;border-radius:6px;background:rgba(0,229,255,.09);color:var(--cyan);border:1px solid rgba(0,229,255,.18);}
.code-body{padding:18px 22px;font-size:10.5px;line-height:1.8;overflow-x:auto;}
.code-body .k{color:#cc55ff}.code-body .s{color:var(--green)}
.code-body .c{color:var(--dim);font-style:italic}.code-body .n{color:var(--cyan)}.code-body .v{color:var(--yellow)}
.code-result{
  margin:0 16px 16px;padding:12px 16px;
  background:rgba(0,255,170,.06);border-radius:10px;
  border:1px solid rgba(0,255,170,.18);
  font-size:10px;display:flex;align-items:center;gap:9px;color:var(--green);
}

/* ═══ AI MODELS ═══ */
.models-wrap{max-width:1040px;margin:0 auto;}
.model-category{display:flex;align-items:center;gap:10px;margin:24px 0 12px;}
.mc-label{font-size:8.5px;color:var(--text2);text-transform:uppercase;letter-spacing:2px;white-space:nowrap;}
.mc-line{flex:1;height:1px;background:var(--b);}
.models-grid{display:flex;flex-wrap:wrap;gap:10px;}
.model-chip{
  padding:9px 15px;border:1px solid var(--b);border-radius:22px;
  font-size:10px;color:var(--text);background:rgba(6,7,26,.72);
  display:flex;align-items:center;gap:9px;transition:.2s;
  position:relative;cursor:default;
}
.model-chip:hover{border-color:var(--cyan2);color:var(--cyan);background:rgba(0,229,255,.05);transform:translateY(-2px);}
.model-icon-wrap{
  width:20px;height:20px;border-radius:5px;flex-shrink:0;overflow:hidden;
  display:flex;align-items:center;justify-content:center;
}
.model-chip.is-new{border-color:rgba(255,45,107,.28);background:rgba(255,45,107,.04);}
.model-chip.is-new:hover{border-color:rgba(255,45,107,.55);color:var(--pink);}
.model-chip.is-soon{opacity:.38;cursor:not-allowed;}
.model-chip.is-soon:hover{border-color:var(--b);color:var(--text);background:rgba(6,7,26,.72);transform:none;}
.mbadge{font-size:7.5px;padding:2px 8px;border-radius:6px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;flex-shrink:0;}
.mbadge.free{background:rgba(0,255,170,.12);color:var(--green);}
.mbadge.cr{background:rgba(0,229,255,.09);color:var(--cyan);}
.mbadge.new{background:rgba(255,45,107,.14);color:var(--pink);animation:newPulse 2.5s infinite;}
.mbadge.soon{background:rgba(255,214,0,.09);color:var(--yellow);}
@keyframes newPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,45,107,.35);}50%{box-shadow:0 0 0 5px rgba(255,45,107,0);}}

/* ═══ GATE ═══ */
.gate-section{padding:96px 24px;text-align:center;position:relative;z-index:1;}
.gate-box{
  max-width:520px;margin:0 auto;padding:56px 44px;
  background:rgba(6,7,26,.88);border:1px solid var(--b);
  border-radius:24px;position:relative;overflow:hidden;
  box-shadow:0 0 0 1px rgba(0,229,255,.05) inset,0 44px 88px rgba(0,0,0,.65),0 0 70px rgba(136,0,255,.07);
  backdrop-filter:blur(14px);
}
.gate-box::before{content:'';position:absolute;top:0;left:0;right:0;height:2.5px;background:linear-gradient(90deg,var(--purple),var(--cyan),var(--purple));opacity:.85;}
.gate-glow{position:absolute;bottom:-80px;left:50%;transform:translateX(-50%);width:280px;height:150px;background:rgba(136,0,255,.2);filter:blur(60px);pointer-events:none;}
.gate-icon{width:68px;height:68px;border-radius:20px;background:rgba(136,0,255,.1);border:1px solid rgba(136,0,255,.24);display:flex;align-items:center;justify-content:center;margin:0 auto 24px;box-shadow:0 0 36px rgba(136,0,255,.14);transition:.3s;}
.gate-box:hover .gate-icon{background:rgba(136,0,255,.18);border-color:rgba(136,0,255,.4);box-shadow:0 0 50px rgba(136,0,255,.24);}
.gate-title{font-family:'Orbitron',sans-serif;font-size:20px;color:white;margin-bottom:14px;letter-spacing:.5px;}
.gate-sub{font-size:10.5px;color:var(--text2);margin-bottom:30px;line-height:1.95;}
.gate-btn{
  display:inline-flex;align-items:center;gap:9px;padding:14px 36px;
  background:linear-gradient(135deg,var(--purple),var(--cyan));
  border:none;border-radius:11px;color:white;font-family:'Orbitron',sans-serif;
  font-size:10.5px;font-weight:700;cursor:pointer;transition:.24s;
  text-decoration:none;letter-spacing:1px;position:relative;overflow:hidden;
  box-shadow:0 6px 28px rgba(136,0,255,.32);
}
.gate-btn::before{content:'';position:absolute;top:-50%;left:-60%;width:40%;height:200%;background:rgba(255,255,255,.1);transform:skewX(-20deg);animation:navShine 3s ease-in-out infinite 0.5s;}
.gate-btn:hover{opacity:.88;transform:translateY(-2px);box-shadow:0 14px 44px rgba(136,0,255,.44);}
.gate-note{margin-top:20px;font-size:9px;color:var(--dim);line-height:1.9;}
.gate-note span{color:var(--green);}

/* ═══ CTA ═══ */
.cta-section{padding:96px 24px;text-align:center;position:relative;z-index:1;}
.cta-box{
  max-width:660px;margin:0 auto;padding:60px 48px;
  background:rgba(6,7,26,.88);border:1px solid var(--b);
  border-radius:24px;position:relative;overflow:hidden;
  box-shadow:0 0 0 1px rgba(0,229,255,.05) inset,0 44px 88px rgba(0,0,0,.65);
  backdrop-filter:blur(14px);
}
.cta-box::before{content:'';position:absolute;top:0;left:0;right:0;height:2.5px;background:linear-gradient(90deg,var(--cyan),var(--purple),var(--pink));}
.cta-box::after{content:'';position:absolute;top:-100px;left:50%;transform:translateX(-50%);width:400px;height:200px;background:rgba(0,229,255,.04);filter:blur(60px);pointer-events:none;}
.cta-free{display:inline-flex;align-items:center;gap:7px;padding:6px 16px;margin-bottom:22px;background:rgba(0,255,170,.08);border:1px solid rgba(0,255,170,.22);border-radius:22px;font-size:9px;color:var(--green);font-weight:700;letter-spacing:1px;}
.cta-title{font-family:'Orbitron',sans-serif;font-size:clamp(20px,3.2vw,30px);font-weight:900;color:white;margin-bottom:15px;position:relative;z-index:1;}
.cta-sub{font-size:11px;color:var(--text2);margin-bottom:32px;line-height:2;position:relative;z-index:1;}
.cta-actions{display:flex;flex-direction:column;align-items:center;gap:13px;position:relative;z-index:1;}
.cta-discord{display:inline-flex;align-items:center;gap:8px;font-size:10px;color:var(--text2);text-decoration:none;transition:.18s;padding:9px 16px;border-radius:9px;border:1px solid transparent;}
.cta-discord:hover{color:#7289da;border-color:rgba(88,101,242,.3);}
.cta-meta{margin-top:22px;font-size:9px;color:var(--dim);line-height:2;position:relative;z-index:1;}
.cta-meta span{color:var(--green);}

/* ═══ BUTTONS ═══ */
.btn-primary{
  padding:14px 36px;background:linear-gradient(135deg,var(--cyan),var(--purple));
  border:none;border-radius:11px;color:white;font-family:'Orbitron',sans-serif;
  font-size:10.5px;font-weight:700;cursor:pointer;text-decoration:none;
  letter-spacing:1.5px;transition:.24s;display:inline-flex;align-items:center;gap:9px;
  position:relative;overflow:hidden;box-shadow:0 4px 22px rgba(0,229,255,.22);
}
.btn-primary::before{content:'';position:absolute;top:-50%;left:-60%;width:40%;height:200%;background:rgba(255,255,255,.1);transform:skewX(-20deg);animation:navShine 3s ease-in-out infinite;}
.btn-primary:hover{opacity:.86;transform:translateY(-2px);box-shadow:0 12px 40px rgba(0,229,255,.34);}
.btn-primary:active{transform:translateY(0) scale(.98);}
.btn-secondary{
  padding:13px 28px;border:1px solid var(--b);border-radius:11px;color:var(--text);
  font-size:10.5px;cursor:pointer;text-decoration:none;transition:.22s;
  display:inline-flex;align-items:center;gap:8px;backdrop-filter:blur(6px);
  font-family:'JetBrains Mono',monospace;background:rgba(0,229,255,.03);
}
.btn-secondary:hover{border-color:var(--cyan2);color:var(--cyan);background:rgba(0,229,255,.08);transform:translateY(-2px);}

/* ═══ TICKER ═══ */
.ticker-wrap{overflow:hidden;border-top:1px solid var(--b);border-bottom:1px solid var(--b);padding:12px 0;background:rgba(6,7,26,.5);position:relative;z-index:1;}
.ticker-wrap::before,.ticker-wrap::after{content:'';position:absolute;top:0;width:120px;height:100%;z-index:2;pointer-events:none;}
.ticker-wrap::before{left:0;background:linear-gradient(90deg,var(--bg),transparent);}
.ticker-wrap::after{right:0;background:linear-gradient(270deg,var(--bg),transparent);}
.ticker-inner{display:flex;gap:0;animation:tickerMove 32s linear infinite;}
.ticker-inner:hover{animation-play-state:paused;}
.ticker-item{
  display:flex;align-items:center;gap:7px;white-space:nowrap;
  padding:0 28px;font-size:9.5px;color:var(--text2);
  border-right:1px solid var(--b);
}
.ticker-item:last-child{border-right:none;}
.ticker-dot{width:4px;height:4px;border-radius:50%;background:var(--cyan);box-shadow:0 0 6px var(--cyan);}
@keyframes tickerMove{from{transform:translateX(0);}to{transform:translateX(-50%);}}

/* ═══ FOOTER ═══ */
footer{padding:36px 32px;border-top:1px solid var(--b);position:relative;z-index:1;background:linear-gradient(0deg,rgba(3,3,18,.7),transparent);}
.footer-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:18px;}
.footer-brand-wrap{display:flex;align-items:center;gap:12px;}
.footer-logo-icon{width:28px;height:28px;border-radius:8px;border:1px solid rgba(0,229,255,.2);background:linear-gradient(135deg,rgba(0,229,255,.1),rgba(136,0,255,.1));display:flex;align-items:center;justify-content:center;}
.footer-brand{font-family:'Orbitron',sans-serif;font-size:12px;font-weight:900;letter-spacing:2.5px;background:linear-gradient(135deg,var(--cyan),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.footer-online{display:flex;align-items:center;gap:5px;font-size:8.5px;color:var(--green);}
.footer-online-dot{width:5px;height:5px;border-radius:50%;background:var(--green);animation:liveDot 1.8s infinite;box-shadow:0 0 6px var(--green);}
.footer-links{display:flex;gap:22px;flex-wrap:wrap;}
.footer-links a{font-size:10px;color:var(--dim);text-decoration:none;transition:.18s;}
.footer-links a:hover{color:var(--cyan);}
.footer-copy{font-size:9px;color:var(--dim);}

/* ═══ RESPONSIVE ═══ */
@media(max-width:1100px){
  .hg-side{display:none;}
  .hero-games-stage{height:310px;}
  .hg-center{width:360px;}
  .hg-main-wrap{height:240px;}
  .features-grid{grid-template-columns:repeat(2,1fr);}
}

@media(max-width:768px){
  .nav{padding:0 16px;height:54px;}
  .nav.scrolled{height:46px;}
  .nav-sub,.nav-divider,.nav-live{display:none;}
  .nav-discord{display:none;}
  .nav-menu-btn{display:flex;}
  .nav-r .nav-login{display:none;}
  .nav-mobile-menu{top:54px;}

  .hero{padding:96px 16px 52px;}
  .hero-title{font-size:clamp(28px,8vw,44px);}
  .hero-badge{font-size:8.5px;padding:6px 15px;}
  .hero-games-stage{height:auto;margin-top:36px;}
  .hg-center{position:relative;left:auto;top:auto;transform:none;width:100%;max-width:500px;margin:0 auto;}
  .hg-main-wrap{height:220px;border-radius:14px;}
  .hero-stats{gap:22px;margin-top:36px;}
  .stat-n{font-size:22px;}
  .stat-divider{display:none;}
  .hero-scroll{margin-top:32px;}

  .hero-prompt-wrap{margin-top:28px;}
  .hero-prompt-box{padding:5px 5px 5px 15px;border-radius:14px;}
  .hero-prompt-input{font-size:12px;min-height:46px;}
  .hero-prompt-btn{padding:11px 18px;font-size:9px;gap:6px;}
  .hero-prompt-examples{display:none;}

  .section{padding:60px 16px;}
  .section-full{padding:60px 16px;}
  .mystery{padding:70px 16px;}
  .screenshots-section{padding:70px 16px;}
  .gate-section,.cta-section{padding:60px 16px;}
  .gate-box{padding:36px 24px;}
  .cta-box{padding:36px 24px;}

  .hint-grid{grid-template-columns:1fr 1fr;}
  .how-grid{grid-template-columns:1fr;}
  .features-grid{grid-template-columns:1fr;}
  .screen-grid{grid-template-columns:1fr;}

  .sec-sub{margin-bottom:36px;}
  .code-body{font-size:9.5px;}

  footer{padding:26px 16px;}
  .footer-inner{flex-direction:column;text-align:center;}
  .footer-links{justify-content:center;}
  .footer-brand-wrap{justify-content:center;flex-direction:column;gap:8px;}
}

@media(max-width:480px){
  .hero-title{font-size:clamp(24px,9vw,36px);}
  .hint-grid{grid-template-columns:1fr;}
  .models-grid{justify-content:center;}
  .gate-box,.cta-box{padding:28px 16px;}
  .hg-main-wrap{height:190px;}
  .hero-stats{gap:16px;}
  .stat-n{font-size:20px;}
  .stat-l{font-size:7.5px;}
  .step-card{padding:28px 18px;}
  .feat{padding:22px 18px;}
  .btn-primary,.btn-secondary{width:100%;justify-content:center;}
  .features-grid{gap:12px;}
  .how-grid{gap:12px;}
  .hero-stats{gap:14px;}
  .stat-divider{display:none;}
}

@media(max-width:360px){
  .hero-title{font-size:24px;}
  .nav-logo{font-size:12px;letter-spacing:2px;}
  .gate-box,.cta-box{padding:24px 14px;}
  .hero-prompt-btn{padding:10px 14px;font-size:8.5px;}
}
`;

/* ─── Game Data ─── */
const GAMES = [
  { file:'99_nights_in_the_forest', name:'99 Nights in the Forest', genre:'Adventure RPG',  prompt:'Make an open world forest RPG with day/night cycle' },
  { file:'dead_rails',              name:'Dead Rails',              genre:'Survival',        prompt:'Make a zombie survival on a moving train' },
  { file:'escape_tsunami_for_brainrot', name:'Escape Tsunami',     genre:'Obby',            prompt:'Make a disaster escape obby with rising water' },
  { file:'fish_it',                 name:'Fish It!',                genre:'Simulator',       prompt:'Make a fishing simulator with rare fish and shop' },
  { file:'fps_flick',               name:'FPS Flick',               genre:'Shooter',         prompt:'Make a first-person shooter with aim training' },
  { file:'grow_a_garden',           name:'Grow a Garden',           genre:'Tycoon',          prompt:'Make a garden tycoon with crops and selling system' },
  { file:'raft_tycoon',             name:'Raft Tycoon',             genre:'Tycoon',          prompt:'Make a raft builder tycoon on the ocean' },
  { file:'shooter',                 name:'Shooter',                 genre:'PvP',             prompt:'Make a team-based PvP shooter with killstreak rewards' },
  { file:'steal_a_brainrot',        name:'Steal a Brainrot',        genre:'Comedy',          prompt:'Make a comedy heist game with silly characters' },
  { file:'the_forge',               name:'The Forge',               genre:'Fantasy RPG',     prompt:'Make a fantasy smithing game with upgrade system' },
];

const EXAMPLE_PROMPTS = [
  'Make a police roleplay game...',
  'Make a zombie survival game...',
  'Make an oil tycoon...',
  'Make a mansion obby...',
  'Make a shop with coins system...',
  'Make a racing game with leaderboards...',
];

const TICKER_ITEMS = [
  'Direct Studio Injection','Multi-Model AI','Visual GUI Builder',
  'Auto Play-Test & Fix','@ Mention System','Roblox Account Sync',
  '30 Free Credits','Zero Copy-Paste','Studio-Aware AI','Natural Language',
  'Auto Test & Fix','Direct Injection','Direct Studio Injection','Multi-Model AI',
  'Visual GUI Builder','Auto Play-Test & Fix','@ Mention System','Roblox Account Sync',
  '30 Free Credits','Zero Copy-Paste',
];

const imgFail = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const el = e.target as HTMLImageElement;
  el.style.background = 'linear-gradient(135deg,rgba(0,229,255,.06),rgba(136,0,255,.06))';
  el.src = '';
};

/* ─── Hero Game Carousel ─── */
function HeroGames({ onPromptClick }: { onPromptClick: (p: string) => void }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [phase, setPhase] = useState<'active'|'leaving'|'entering'>('active');
  const nextIdx = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  const goTo = useCallback((idx: number) => {
    if (idx === activeIdx || phase !== 'active') return;
    nextIdx.current = idx;
    setPhase('leaving');
  }, [activeIdx, phase]);

  useEffect(() => {
    if (phase === 'leaving') {
      const t = setTimeout(() => { setActiveIdx(nextIdx.current); setPhase('entering'); }, 400);
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
    }, 4000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeIdx]);

  const sideLeft  = GAMES.slice(0, 3);
  const sideRight = GAMES.slice(7, 10);

  const BoltIcon = () => (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );

  return (
    <div className="hero-games-stage">
      {/* Left */}
      <div className="hg-side hg-left">
        {sideLeft.map((g, i) => (
          <div key={g.file} className="hg-card" onClick={() => goTo(i)}>
            <img src={`/screenshot/game/${g.file}.webp`} alt={g.name} className="hg-card-thumb" onError={imgFail} />
            <div className="hg-card-info">
              <div className="hg-card-label"><BoltIcon />{g.genre}</div>
              <div className="hg-card-name">{g.name}</div>
              <div className="hg-card-prompt">&quot;{g.prompt}&quot;</div>
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
              className={`hg-main-img ${i === activeIdx ? (phase === 'leaving' ? 'leaving' : 'active') : 'entering'}`}
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
            <div className="hg-main-prompt" onClick={() => onPromptClick(GAMES[activeIdx].prompt)}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              &quot;{GAMES[activeIdx].prompt}&quot;
            </div>
          </div>
        </div>
        <div className="hg-dots">
          {GAMES.map((_, i) => (
            <div key={i} className={`hg-dot${i === activeIdx ? ' active' : ''}`} onClick={() => goTo(i)} />
          ))}
        </div>
      </div>

      {/* Right */}
      <div className="hg-side hg-right">
        {sideRight.map((g, i) => (
          <div key={g.file} className="hg-card" onClick={() => goTo(7 + i)}>
            <img src={`/screenshot/game/${g.file}.webp`} alt={g.name} className="hg-card-thumb" onError={imgFail} />
            <div className="hg-card-info">
              <div className="hg-card-label"><BoltIcon />{g.genre}</div>
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
    const t = setInterval(() => setExIdx(i => (i + 1) % EXAMPLE_PROMPTS.length), 3000);
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
      <a href="#models" className="nav-mobile-item">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
        AI Models
      </a>
      <a href="/login" className="nav-mobile-item primary">
        ⚡ Enter NEXUS AI — Free
      </a>
    </div>
  );
}

/* ─── Features data ─── */
const FEATURES = [
  {
    iconBg:'rgba(0,229,255,.09)',iconColor:'var(--cyan)',
    icon:<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
    title:'Direct Studio Injection',
    desc:'Scripts, parts, GUIs — AI creates everything directly in Roblox Studio via the companion plugin. No manual copy-paste, ever.',
    tagBg:'rgba(0,229,255,.07)',tagColor:'var(--cyan)',tagLabel:'Plugin Required',delay:'d1',
  },
  {
    iconBg:'rgba(136,0,255,.09)',iconColor:'#cc55ff',
    icon:<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />,
    title:'Multi-Model AI',
    desc:'Switch between Gemini, DeepSeek, Step Fun — all fine-tuned to write production-quality Lua for Roblox.',
    tagBg:'rgba(0,255,170,.07)',tagColor:'var(--green)',tagLabel:'Many Free',delay:'d2',
  },
  {
    iconBg:'rgba(0,255,170,.08)',iconColor:'var(--green)',
    icon:<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
    title:'Visual GUI Builder',
    desc:'Design your UI visually, then export as Lua or send directly to Studio with one click.',
    tagBg:'rgba(0,255,170,.07)',tagColor:'var(--green)',tagLabel:'Drag & Drop',delay:'d3',
  },
  {
    iconBg:'rgba(255,214,0,.08)',iconColor:'var(--yellow)',
    icon:<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    title:'Auto Play-Test & Fix',
    desc:'After building, AI runs a play-test automatically. Console errors? AI stops, reads, and re-injects a fix on its own.',
    tagBg:'rgba(255,214,0,.08)',tagColor:'var(--yellow)',tagLabel:'Auto-Fix',delay:'d4',
  },
  {
    iconBg:'rgba(255,45,107,.08)',iconColor:'var(--pink)',
    icon:<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    title:'@ Mention System',
    desc:'Type @ to mention any script or object. AI reads it, understands it, and builds on top of it intelligently.',
    tagBg:'rgba(0,229,255,.07)',tagColor:'var(--cyan)',tagLabel:'Context-Aware',delay:'d5',
  },
  {
    iconBg:'rgba(0,229,255,.08)',iconColor:'var(--cyan)',
    icon:<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    title:'Roblox Account Sync',
    desc:'Credits, history, and projects tied to your Roblox account. Persistent across every device automatically.',
    tagBg:'rgba(255,214,0,.08)',tagColor:'var(--yellow)',tagLabel:'Persistent',delay:'d6',
  },
];

/* ─── AI Models ─── */
const AI_MODELS = [
  {
    label:'Google Gemini',
    models:[
      { name:'Gemini 3.5 Flash', badge:'new' as const, cls:'is-new', imgSrc:'/images/gemini.png' },
      { name:'Gemini 3.1 Pro',   badge:'cr'  as const, cls:'is-new', imgSrc:'/images/gemini.png' },
    ],
  },
  {
    label:'DeepSeek',
    models:[
      { name:'DeepSeek V4 Pro', badge:'new' as const, cls:'is-new', imgSrc:'/images/deepseek.svg' },
    ],
  },
  {
    label:'Step Fun',
    models:[
      { name:'Step 3.5 Flash', badge:'new' as const, cls:'is-new', imgSrc:'/images/stepfun.png' },
    ],
  },
  {
    label:'Coming Soon',
    models:[
      { name:'Claude Sonnet', badge:'soon' as const, cls:'is-soon', imgSrc:'/images/claude.png' },
      { name:'Claude Opus',   badge:'soon' as const, cls:'is-soon', imgSrc:'/images/claude.png' },
      { name:'GPT-5.5',       badge:'soon' as const, cls:'is-soon', imgSrc:'/images/chatgpt.png' },
    ],
  },
];

/* ═══ MAIN ═══ */
export default function HomePage() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [promptVal, setPromptVal] = useState('');
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [logoErr,   setLogoErr]   = useState(false);

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
      ctx.fillStyle = 'rgba(3,3,18,.052)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fs}px 'JetBrains Mono',monospace`;
      cols = Math.floor(canvas.width / fs);
      while (drops.length < cols) drops.push(1);
      for (let i = 0; i < cols; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = `rgba(0,229,255,${0.02 + Math.random() * 0.05})`;
        ctx.fillText(ch, i * fs, drops[i] * fs);
        if (drops[i] * fs > canvas.height && Math.random() > .975) drops[i] = 0;
        drops[i]++;
      }
    };
    const id = setInterval(draw, 65);
    return () => { clearInterval(id); window.removeEventListener('resize', resize); };
  }, []);

  useEffect(() => {
    /* Particles */
    const container = document.getElementById('particles');
    if (container && container.children.length === 0) {
      for (let i = 0; i < 32; i++) {
        const el = document.createElement('div');
        el.className = 'p';
        const sz = Math.random() * 3.8 + 1;
        const isCyan = Math.random() > .42;
        const isPurple = !isCyan && Math.random() > .55;
        const color = isCyan ? '0,229,255' : isPurple ? '136,0,255' : '0,255,170';
        el.style.cssText =
          `width:${sz}px;height:${sz}px;left:${Math.random() * 100}%;` +
          `background:rgba(${color},${Math.random() * 0.32 + 0.07});` +
          `box-shadow:0 0 7px rgba(${color},.3);` +
          `animation-duration:${Math.random() * 18 + 9}s;animation-delay:${Math.random() * 16}s;`;
        container.appendChild(el);
      }
    }

    /* Navbar scroll */
    const navbar = document.getElementById('navbar');
    const handleScroll = () => navbar?.classList.toggle('scrolled', window.scrollY > 60);
    window.addEventListener('scroll', handleScroll, { passive: true });

    /* Hero scroll */
    const heroScroll = document.getElementById('heroScroll');
    heroScroll?.addEventListener('click', () =>
      document.getElementById('mystery')?.scrollIntoView({ behavior: 'smooth' })
    );

    /* Scroll reveal */
    const revealEls = document.querySelectorAll('.reveal,.reveal-left,.reveal-right,.reveal-scale,.reveal-blur');
    const checkReveal = () => {
      const wh = window.innerHeight;
      revealEls.forEach(el => {
        if (el.getBoundingClientRect().top < wh - 55) el.classList.add('active');
      });
    };
    window.addEventListener('scroll', checkReveal, { passive: true });
    window.addEventListener('resize', checkReveal, { passive: true });
    setTimeout(checkReveal, 140);

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
              <Image
                src="/images/nexusai.png" alt="NEXUS AI" width={20} height={20}
                style={{ objectFit:'contain' }} onError={() => setLogoErr(true)} unoptimized
              />
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
            Enter
          </a>
          <button className="nav-menu-btn" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          <svg width="24" height="24" viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </section>

      {/* ═══ TICKER ═══ */}
      <div className="ticker-wrap">
        <div className="ticker-inner">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
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
              { icon:<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />, color:'var(--cyan)',   title:'Zero Copy-Paste',   desc:'Every script goes directly into Roblox Studio via plugin. Type once, it appears instantly.',delay:'d1' },
              { icon:<><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>, color:'var(--purple)', title:'Studio-Aware AI', desc:'The AI sees your workspace. It knows what scripts exist and builds on top of them.', delay:'d2' },
              { icon:<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />, color:'var(--green)',  title:'Natural Language', desc:'No technical syntax needed. Describe "make a shop with coins" and it happens.', delay:'d3' },
              { icon:<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, color:'var(--yellow)', title:'Auto Test & Fix',  desc:'AI runs a play-test after building. Console errors appear? It self-fixes automatically.', delay:'d4' },
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
            Unlock Everything
          </a>
        </div>
      </div>

      {/* ═══ SCREENSHOTS ═══ */}
      <div className="screenshots-section" id="screenshots">
        <div style={{ textAlign:'center',marginBottom:'48px',maxWidth:'620px',marginLeft:'auto',marginRight:'auto' }}>
          <div className="sec-eyebrow reveal">See It In Action</div>
          <h2 className="sec-title reveal d1">From Prompt to Studio</h2>
          <p className="sec-sub reveal d2" style={{ marginBottom:0 }}>
            Watch an idea transform into real Roblox content in under 5 seconds.
          </p>
        </div>
        <div className="screen-grid">
          {[
            { badge:'Web',       img:'/screenshot/screen1.png', alt:'Chat Interface', iconColor:'var(--cyan)',   icon:<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />, title:'Chat Interface',   desc:'Type your request in plain English. NEXUS AI breaks it into precise actions and executes immediately.', delay:'d1' },
            { badge:'Plugin',    img:'/screenshot/screen2.png', alt:'Studio Plugin',  iconColor:'var(--green)',  icon:<><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" /><line x1="16" y1="8" x2="2" y2="22" /></>, title:'Studio Plugin',   desc:'The companion plugin in Roblox Studio — connected, listening, injecting in real-time with zero lag.', delay:'d2' },
            { badge:'Connected', img:'/screenshot/screen3.png', alt:'Live Injection',  iconColor:'var(--yellow)',icon:<polyline points="20 6 9 17 4 12" />, title:'Live & Injecting', desc:'Every AI command materializes in your place — parts, scripts, GUIs, full systems — all live.', delay:'d3' },
          ].map((s, i) => (
            <div key={i} className={`screen-card reveal ${s.delay}`}>
              <span className="screen-badge">{s.badge}</span>
              <img
                src={s.img} alt={s.alt} className="screen-card-img"
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0.1'; }}
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

      {/* ═══ FEATURES ═══ */}
      <section className="section" id="features">
        <div className="sec-eyebrow reveal">Core Capabilities</div>
        <h2 className="sec-title reveal d1">Built for Serious Developers</h2>
        <p className="sec-sub reveal d2">
          Every tool you need to build a complete Roblox game, powered by AI that actually understands Studio.
        </p>
        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <div key={i} className={`feat reveal ${f.delay}`}>
              <div className="feat-icon" style={{ background:f.iconBg }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={f.iconColor} strokeWidth="2">{f.icon}</svg>
              </div>
              <div className="feat-title">{f.title}</div>
              <div className="feat-desc">{f.desc}</div>
              <span className="feat-tag" style={{ background:f.tagBg,color:f.tagColor }}>{f.tagLabel}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="section" style={{ paddingTop:0 }} id="how">
        <div className="sec-eyebrow reveal">Setup</div>
        <h2 className="sec-title reveal d1">3 Steps. That&apos;s It.</h2>
        <p className="sec-sub reveal d2">One-time setup, then infinite creation.</p>
        <div className="how-grid">
          {[
            { n:'1', title:'Login & Verify',   desc:'Sign in with your Roblox account. Get 30 free credits instantly — no credit card, no commitment.', delay:'d1' },
            { n:'2', title:'Install Plugin',   desc:'Install the NEXUS AI plugin from Creator Store. Open Studio, click Connect — green light means ready.', delay:'d2' },
            { n:'3', title:'Describe & Build', desc:'Type what you want. AI builds, injects, tests. Your game grows while you watch.', delay:'d3' },
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
              <span className="cd cd1"/><span className="cd cd2"/><span className="cd cd3"/>
            </div>
            <span className="code-lbl">AI Studio Pipeline</span>
            <span className="code-tag">Live Example</span>
          </div>
          <div className="code-body">
            <div><span className="c">{'// User: "build a shop with coins and buy button"'}</span></div>
            <div style={{ marginTop:8 }}><span className="c">{'// AI generates & sends to Studio:'}</span></div>
            <div style={{ marginTop:6 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;batch_commands&quot;</span>, <span className="n">&quot;commands&quot;</span>: [</div>
            <div style={{ marginLeft:18 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;create_remote&quot;</span>, <span className="n">&quot;name&quot;</span>: <span className="s">&quot;BuyItem&quot;</span> <span className="k">{'}'}</span>,</div>
            <div style={{ marginLeft:18 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;inject_script&quot;</span>, <span className="n">&quot;name&quot;</span>: <span className="s">&quot;ShopServer&quot;</span> <span className="k">{'}'}</span>,</div>
            <div style={{ marginLeft:18 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;create_gui&quot;</span>, <span className="n">&quot;name&quot;</span>: <span className="s">&quot;ShopGUI&quot;</span> <span className="k">{'}'}</span>,</div>
            <div style={{ marginLeft:18 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;play_test&quot;</span>, <span className="n">&quot;duration&quot;</span>: <span className="v">15</span> <span className="k">{'}'}</span></div>
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

      {/* ═══ AI MODELS ═══ */}
      <section className="section" style={{ paddingTop:0 }} id="models">
        <div className="sec-eyebrow reveal">AI Models</div>
        <h2 className="sec-title reveal d1">Best-in-Class Model Selection</h2>
        <p className="sec-sub reveal d2">
          Handpicked models for speed, precision, and Roblox expertise. Many are completely free.
        </p>
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
                      <ModelImg src={m.imgSrc} alt={m.name} size={18} />
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
            Join developers who have already stopped copy-pasting and started creating.
            Your game deserves better than manual scripting.
          </p>
          <div className="cta-actions">
            <a href="/login" className="btn-primary" style={{ width:'100%',maxWidth:'320px',justifyContent:'center' }}>
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
          <span className="footer-copy">&copy; 2026 NEXUS STUDIO · nexusai-rbx.vercel.app</span>
        </div>
      </footer>
    </>
  );
}