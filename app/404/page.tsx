"use client";

import { useEffect, useRef, useMemo } from "react";

/* ─────────────────────────────────────────────
   Palette constants
───────────────────────────────────────────── */
const PALETTE = {
  cyan:   "#00e5ff",
  purple: "#8800ff",
  pink:   "#ff2d6b",
  green:  "#00ffaa",
  yellow: "#ffd600",
  amber:  "#ff9500",
} as const;

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface Particle {
  x:       number;
  dur:     number;
  del:     number;
  size:    number;
  color:   string;
  opacity: number;
}

/* ─────────────────────────────────────────────
   Hook – floating particles
───────────────────────────────────────────── */
function useParticles(count: number): Particle[] {
  return useMemo(() => {
    const colors = [
      PALETTE.cyan,
      PALETTE.purple,
      PALETTE.pink,
      PALETTE.green,
      PALETTE.amber,
    ];
    return Array.from({ length: count }, () => ({
      x:       Math.random() * 100,
      dur:     7 + Math.random() * 10,
      del:     Math.random() * 14,
      size:    1.2 + Math.random() * 2.8,
      color:   colors[Math.floor(Math.random() * colors.length)],
      opacity: 0.3 + Math.random() * 0.5,
    }));
  }, [count]);
}

/* ─────────────────────────────────────────────
   Hook – matrix rain canvas
───────────────────────────────────────────── */
function useMatrixRain(
  canvasRef: React.RefObject<HTMLCanvasElement | null>
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CHARS =
      "0123456789ABCDEFabcdefワークスペースサーバーストレージゲームスクリプト";
    const FONT_SIZE = 11;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const drops: number[] = [];
    const initDrops = () => {
      const cols = Math.floor(canvas.width / FONT_SIZE);
      drops.length = 0;
      for (let i = 0; i < cols; i++) drops.push(1);
    };
    initDrops();

    const onResize = () => {
      resize();
      initDrops();
    };
    window.addEventListener("resize", onResize);

    const draw = () => {
      ctx.fillStyle = "rgba(3,3,18,0.055)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${FONT_SIZE}px 'JetBrains Mono', monospace`;

      const cols = Math.floor(canvas.width / FONT_SIZE);
      while (drops.length < cols) drops.push(1);

      for (let i = 0; i < cols; i++) {
        const ch    = CHARS[Math.floor(Math.random() * CHARS.length)];
        const alpha = 0.04 + Math.random() * 0.08;
        ctx.fillStyle = `rgba(0,229,255,${alpha})`;
        ctx.fillText(ch, i * FONT_SIZE, drops[i] * FONT_SIZE);

        if (drops[i] * FONT_SIZE > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    const intervalId = setInterval(draw, 55);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("resize", onResize);
    };
  }, [canvasRef]);
}

/* ─────────────────────────────────────────────
   Inline styles (single <style> tag, avoids
   Tailwind / CSS-module dependency)
───────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500;600&display=swap');

  /* ── CSS custom properties ── */
  :root {
    --bg:     #030312;
    --bg2:    #06071a;
    --bg3:    #0a0b22;
    --bg4:    #0d0e28;

    --cyan:   #00e5ff;
    --cyan2:  rgba(0,229,255,.30);
    --cyan3:  rgba(0,229,255,.08);
    --purple: #8800ff;
    --pink:   #ff2d6b;
    --green:  #00ffaa;
    --yellow: #ffd600;
    --amber:  #ff9500;

    --text:   #b8cfff;
    --text2:  #7a9acf;
    --dim:    #2e3e6a;
    --dim2:   #1e2a4a;

    --border:       rgba(0,229,255,.10);
    --border-hover: rgba(0,229,255,.22);

    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
  }

  /* ── Reset ── */
  *, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html, body {
    height: 100%;
    font-family: 'JetBrains Mono', monospace;
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
    overflow: hidden;
  }

  /* ──────────────────────────────────────────
     Root shell
  ────────────────────────────────────────── */
  .nf-root {
    position: relative;
    height: 100dvh;           /* dynamic viewport height for mobile browsers */
    overflow: hidden;
    font-family: 'JetBrains Mono', monospace;
    background: var(--bg);
    color: var(--text);
  }

  /* ──────────────────────────────────────────
     Background layers
  ────────────────────────────────────────── */
  .nf-matrix {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    opacity: .55;
  }

  .nf-grid {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background:
      linear-gradient(rgba(0,229,255,.018) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,229,255,.018) 1px, transparent 1px);
    background-size: 44px 44px;
  }

  .nf-scanlines {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0,0,0,.055) 2px,
      rgba(0,0,0,.055) 4px
    );
  }

  .nf-vignette {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background: radial-gradient(
      ellipse 80% 80% at 50% 50%,
      transparent 40%,
      rgba(3,3,18,.75) 100%
    );
  }

  /* ──────────────────────────────────────────
     Ambient blobs
  ────────────────────────────────────────── */
  .blob {
    position: fixed;
    border-radius: 50%;
    filter: blur(130px);
    pointer-events: none;
    z-index: 0;
  }
  .blob-1 {
    width: 600px; height: 600px;
    background: rgba(136,0,255,.06);
    top: -200px; left: -150px;
    animation: blobDrift1 9s ease-in-out infinite alternate;
  }
  .blob-2 {
    width: 450px; height: 450px;
    background: rgba(0,229,255,.045);
    bottom: -120px; right: -100px;
    animation: blobDrift2 11s ease-in-out infinite alternate;
  }
  .blob-3 {
    width: 350px; height: 350px;
    background: rgba(255,45,107,.035);
    top: 45%; left: 48%;
    transform: translate(-50%, -50%);
    animation: blobDrift3 7s ease-in-out infinite alternate;
  }
  .blob-4 {
    width: 250px; height: 250px;
    background: rgba(0,255,170,.03);
    top: 20%; right: 15%;
    animation: blobDrift4 13s ease-in-out infinite alternate;
  }

  @keyframes blobDrift1 {
    from { transform: translate(0,0) scale(1); }
    to   { transform: translate(40px,25px) scale(1.1); }
  }
  @keyframes blobDrift2 {
    from { transform: translate(0,0) scale(1); }
    to   { transform: translate(-30px,-20px) scale(1.08); }
  }
  @keyframes blobDrift3 {
    from { transform: translate(-50%,-50%) scale(1); }
    to   { transform: translate(calc(-50% + 25px), calc(-50% + 15px)) scale(1.06); }
  }
  @keyframes blobDrift4 {
    from { transform: translate(0,0); }
    to   { transform: translate(-20px,30px); }
  }

  /* ──────────────────────────────────────────
     Hex-ring accent
  ────────────────────────────────────────── */
  .hex-ring {
    position: fixed;
    z-index: 1;
    pointer-events: none;
    opacity: .12;
    top: 50%; left: 50%;
    transform: translate(-50%,-50%);
    width:  min(90vw, 600px);
    height: min(90vh, 600px);
    background:
      radial-gradient(circle, transparent 38%, rgba(0,229,255,.06) 39%, rgba(0,229,255,.06) 40%, transparent 41%),
      radial-gradient(circle, transparent 55%, rgba(136,0,255,.05) 56%, rgba(136,0,255,.05) 57%, transparent 58%),
      radial-gradient(circle, transparent 72%, rgba(0,229,255,.04) 73%, rgba(0,229,255,.04) 74%, transparent 75%);
    border-radius: 50%;
    animation: hexPulse 4s ease-in-out infinite;
  }
  @keyframes hexPulse {
    0%,100% { opacity: .12; transform: translate(-50%,-50%) scale(1); }
    50%      { opacity: .18; transform: translate(-50%,-50%) scale(1.04); }
  }

  /* ──────────────────────────────────────────
     Floating particles
  ────────────────────────────────────────── */
  .nf-particles {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    overflow: hidden;
  }
  .particle {
    position: absolute;
    border-radius: 50%;
    opacity: 0;
    animation: floatUp var(--dur, 8s) ease-in infinite;
    animation-delay: var(--del, 0s);
    box-shadow: 0 0 6px var(--clr, #00e5ff);
  }
  @keyframes floatUp {
    0%   { opacity: 0; transform: translateY(100vh) scale(0); }
    10%  { opacity: var(--op, .5); }
    90%  { opacity: calc(var(--op, .5) * .3); }
    100% { opacity: 0; transform: translateY(-8vh) scale(1.8); }
  }

  /* ──────────────────────────────────────────
     Top bar
  ────────────────────────────────────────── */
  .nf-topbar {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 48px;
    background: linear-gradient(180deg, rgba(6,7,26,.98), rgba(6,7,26,.92));
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 24px;
    gap: 12px;
    z-index: 20;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    animation: slideDown .5s cubic-bezier(.22,.68,0,1.2) both;
  }
  @keyframes slideDown {
    from { transform: translateY(-100%); opacity: 0; }
    to   { transform: none; opacity: 1; }
  }

  .topbar-logo {
    width: 28px; height: 28px;
    border-radius: 7px;
    overflow: hidden;
    flex-shrink: 0;
    background: linear-gradient(135deg, var(--cyan), var(--purple));
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 12px rgba(0,229,255,.3);
  }

  .topbar-name {
    font-family: 'Orbitron', sans-serif;
    font-weight: 900;
    font-size: 11.5px;
    background: linear-gradient(135deg, var(--cyan), var(--purple));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: 1.5px;
    white-space: nowrap;
  }

  .topbar-divider {
    width: 1px; height: 18px;
    background: var(--dim2);
    margin: 0 4px;
    flex-shrink: 0;
  }

  .topbar-sub {
    font-size: 9px;
    color: var(--text2);
    text-transform: uppercase;
    letter-spacing: 2px;
    white-space: nowrap;
  }

  .topbar-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
  }

  /* Signal bars */
  .topbar-sys {
    display: flex;
    align-items: flex-end;
    gap: 3px;
  }
  .sys-bar {
    width: 3px;
    border-radius: 2px;
    background: var(--cyan);
  }
  .sys-bar:nth-child(1) { height: 6px;  opacity: .3; }
  .sys-bar:nth-child(2) { height: 10px; opacity: .5; }
  .sys-bar:nth-child(3) { height: 14px; opacity: .7; }
  .sys-bar:nth-child(4) { height: 18px; opacity: .9; }

  /* Ping badge */
  .topbar-ping {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 20px;
    background: rgba(255,45,107,.08);
    border: 1px solid rgba(255,45,107,.2);
  }
  .ping-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--pink);
    animation: pingPulse 1.6s ease-in-out infinite;
  }
  @keyframes pingPulse {
    0%,100% { opacity: 1; box-shadow: 0 0 0 0 rgba(255,45,107,.4); }
    50%      { opacity: .5; box-shadow: 0 0 0 4px rgba(255,45,107,0); }
  }
  .ping-label {
    font-size: 9px;
    color: var(--pink);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    white-space: nowrap;
  }

  /* ──────────────────────────────────────────
     Main page content
  ────────────────────────────────────────── */
  .nf-page {
    position: relative;
    z-index: 2;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 72px 24px 64px;   /* top / bottom clear topbar & footer */
    text-align: center;
    gap: 0;
    overflow-y: auto;
  }

  /* ──────────────────────────────────────────
     404 glitch headline
  ────────────────────────────────────────── */
  .error-wrap {
    position: relative;
    margin-bottom: 4px;
  }

  .error-code {
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(72px, 16vw, 168px);
    font-weight: 900;
    line-height: 1;
    position: relative;
    color: transparent;
    -webkit-text-stroke: 1px rgba(0,229,255,.12);
    animation: fadeUp .6s ease .05s both;
    user-select: none;
  }

  .error-code::before,
  .error-code::after {
    content: '404';
    position: absolute;
    inset: 0;
    font-family: 'Orbitron', sans-serif;
    font-size: inherit;
    font-weight: 900;
    background: linear-gradient(135deg, var(--cyan) 0%, var(--purple) 55%, var(--pink) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .error-code::before {
    animation: glitch1 4s infinite;
    clip-path: polygon(0 0, 100% 0, 100% 35%, 0 35%);
  }
  .error-code::after {
    animation: glitch2 4s infinite;
    clip-path: polygon(0 65%, 100% 65%, 100% 100%, 0 100%);
  }

  @keyframes glitch1 {
    0%,92%,100% { transform: none; opacity: 1; }
    93%          { transform: translate(-4px, 2px) skewX(-3deg); opacity: .85; filter: hue-rotate(25deg); }
    96%          { transform: translate(3px,-1px)  skewX(2deg);  opacity: .9; }
  }
  @keyframes glitch2 {
    0%,92%,100% { transform: none; opacity: 1; }
    93%          { transform: translate(4px,-2px)  skewX(3deg);  opacity: .85; filter: hue-rotate(-20deg); }
    96%          { transform: translate(-3px,1px)  skewX(-2deg); opacity: .9; }
  }

  /* Scan line sweep */
  .error-scan {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    border-radius: 4px;
  }
  .error-scan::after {
    content: '';
    position: absolute;
    left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, transparent, rgba(0,229,255,.35), transparent);
    animation: scanSweep 3.5s linear infinite 1s;
  }
  @keyframes scanSweep {
    from { top: -4px; }
    to   { top: 110%; }
  }

  /* Subtitle label */
  .code-label {
    font-size: 9px;
    color: var(--dim);
    text-transform: uppercase;
    letter-spacing: 4px;
    font-family: 'JetBrains Mono', monospace;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    animation: fadeUp .6s ease .15s both;
  }
  .code-label::before,
  .code-label::after {
    content: '';
    display: block;
    width: 36px; height: 1px;
    background: linear-gradient(90deg, transparent, var(--dim));
  }
  .code-label::after {
    background: linear-gradient(90deg, var(--dim), transparent);
  }

  /* ──────────────────────────────────────────
     Status chips
  ────────────────────────────────────────── */
  .status-row {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    flex-wrap: wrap;
    justify-content: center;
    animation: fadeUp .65s ease .22s both;
  }

  .status-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 9px;
    letter-spacing: 1px;
    text-transform: uppercase;
    border: 1px solid;
    white-space: nowrap;
  }
  .chip-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }

  .chip-err  { background: rgba(255,45,107,.07); border-color: rgba(255,45,107,.2);  color: var(--pink);   }
  .chip-wrn  { background: rgba(255,214,0,.07);  border-color: rgba(255,214,0,.2);   color: var(--yellow); }
  .chip-ok   { background: rgba(0,255,170,.07);  border-color: rgba(0,255,170,.2);   color: var(--green);  }
  .chip-inf  { background: rgba(255,149,0,.07);  border-color: rgba(255,149,0,.2);   color: var(--amber);  }

  /* ──────────────────────────────────────────
     Terminal card
  ────────────────────────────────────────── */
  .nf-terminal {
    background: rgba(6,7,26,.9);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    max-width: 520px;
    width: 100%;
    margin-bottom: 24px;
    animation: fadeUp .65s ease .30s both;
    box-shadow:
      0 0 0 1px rgba(0,229,255,.04) inset,
      0 20px 80px rgba(0,0,0,.7),
      0 0 60px rgba(0,229,255,.04);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  /* Window chrome */
  .terminal-hdr {
    padding: 9px 16px;
    background: linear-gradient(180deg, rgba(13,14,40,.95), rgba(10,11,34,.9));
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .t-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    cursor: default;
    transition: filter .15s;
    flex-shrink: 0;
  }
  .t-dot:hover { filter: brightness(1.3); }
  .t-dot-r { background: rgba(255,45,107,.75); }
  .t-dot-y { background: rgba(255,214,0,.65); }
  .t-dot-g { background: rgba(0,255,170,.60); }

  .terminal-tabs {
    display: flex;
    gap: 1px;
    margin-left: 10px;
  }
  .t-tab {
    font-size: 9px;
    color: var(--dim);
    padding: 2px 10px;
    border-radius: 4px;
    background: transparent;
    cursor: default;
    letter-spacing: .5px;
    transition: background .15s, color .15s;
    font-family: 'JetBrains Mono', monospace;
  }
  .t-tab.active {
    background: rgba(0,229,255,.08);
    color: var(--cyan);
  }

  .terminal-path {
    font-size: 9.5px;
    color: var(--dim);
    margin-left: auto;
    letter-spacing: .5px;
    padding: 2px 8px;
    background: var(--dim2);
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
  }

  /* Terminal lines */
  .terminal-body {
    padding: 16px 20px;
    text-align: left;
    font-size: 11.5px;
    line-height: 2.1;
  }

  .t-line {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    opacity: 0;
    animation: typeIn .3s ease forwards;
  }
  .t-line:nth-child(1) { animation-delay: .45s; }
  .t-line:nth-child(2) { animation-delay: .80s; }
  .t-line:nth-child(3) { animation-delay: 1.15s; }
  .t-line:nth-child(4) { animation-delay: 1.50s; }
  .t-line:nth-child(5) { animation-delay: 1.85s; }
  .t-line:nth-child(6) { animation-delay: 2.20s; }

  @keyframes typeIn {
    from { opacity: 0; transform: translateX(-8px); }
    to   { opacity: 1; transform: none; }
  }

  /* Prompt icons */
  .t-prompt     { color: var(--cyan);  flex-shrink: 0; user-select: none; }
  .t-prompt-err { color: var(--pink);  flex-shrink: 0; user-select: none; }
  .t-prompt-ok  { color: var(--green); flex-shrink: 0; user-select: none; }
  .t-prompt-wrn { color: var(--yellow);flex-shrink: 0; user-select: none; }
  .t-prompt-inf { color: var(--amber); flex-shrink: 0; user-select: none; }

  /* Inline colour helpers */
  .hl  { color: var(--cyan);   }
  .err { color: var(--pink);   }
  .ok  { color: var(--green);  }
  .wrn { color: var(--yellow); }
  .inf { color: var(--amber);  }
  .dim    { color: var(--text2); }
  .dimmer { color: var(--dim);   }

  /* Blinking cursor */
  .cursor {
    display: inline-block;
    width: 7px; height: 13px;
    background: var(--cyan);
    border-radius: 1px;
    margin-left: 3px;
    vertical-align: middle;
    opacity: 0;
    animation: blink .85s step-end infinite 2.6s;
    animation-fill-mode: forwards;
  }
  @keyframes blink {
    0%,100% { opacity: 1; }
    50%      { opacity: 0; }
  }

  /* ──────────────────────────────────────────
     Action buttons
  ────────────────────────────────────────── */
  .nf-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
    animation: fadeUp .65s ease .42s both;
  }

  .btn {
    padding: 11px 22px;
    border-radius: 9px;
    font-family: 'Orbitron', sans-serif;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 1.2px;
    cursor: pointer;
    border: none;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: opacity .18s, transform .18s, box-shadow .18s;
    position: relative;
    overflow: hidden;
    white-space: nowrap;
  }

  /* Shimmer sweep */
  .btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      120deg,
      transparent 40%,
      rgba(255,255,255,.07) 50%,
      transparent 60%
    );
    transform: translateX(-100%);
    transition: transform .4s ease;
  }
  .btn:hover::after  { transform: translateX(100%); }
  .btn:focus-visible {
    outline: 2px solid var(--cyan);
    outline-offset: 3px;
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--cyan), var(--purple));
    color: #fff;
    box-shadow: 0 4px 24px rgba(0,229,255,.2), 0 0 0 1px rgba(0,229,255,.15);
  }
  .btn-primary:hover  { opacity: .88; transform: translateY(-1px); box-shadow: 0 8px 32px rgba(0,229,255,.3); }
  .btn-primary:active { transform: translateY(0) scale(.98); }

  .btn-secondary {
    background: rgba(0,229,255,.05);
    border: 1px solid var(--border);
    color: var(--cyan);
  }
  .btn-secondary:hover  { border-color: rgba(0,229,255,.3); background: rgba(0,229,255,.09); transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,229,255,.1); }
  .btn-secondary:active { transform: translateY(0) scale(.98); }

  .btn svg {
    width: 13px; height: 13px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex-shrink: 0;
  }

  /* ──────────────────────────────────────────
     Footer
  ────────────────────────────────────────── */
  .nf-footer {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    padding: 9px 24px;
    background: linear-gradient(0deg, rgba(6,7,26,.98), rgba(6,7,26,.88));
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    animation: slideUp .5s ease both;
  }
  @keyframes slideUp {
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: none; opacity: 1; }
  }

  .footer-inner {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .footer-brand {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .footer-brand-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--cyan);
    opacity: .6;
    flex-shrink: 0;
  }
  .footer-text {
    font-size: 8.5px;
    color: var(--text2);
    letter-spacing: .5px;
    white-space: nowrap;
  }
  .footer-accent  { color: var(--cyan); }
  .footer-sep     { color: var(--dim); }

  .footer-link {
    font-size: 8.5px;
    color: var(--text2);
    text-decoration: none;
    transition: color .15s;
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }
  .footer-link:hover        { color: var(--cyan); }
  .footer-link:focus-visible { outline: 1px solid var(--cyan); border-radius: 2px; }
  .footer-yt                { color: var(--pink) !important; }
  .footer-yt:hover          { opacity: .8; }

  .footer-status {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 8.5px;
    color: var(--dim);
  }
  .footer-status-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--green);
    animation: pingPulse 2.5s ease-in-out infinite;
  }

  /* ──────────────────────────────────────────
     Shared fade-up keyframe
  ────────────────────────────────────────── */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(28px); }
    to   { opacity: 1; transform: none; }
  }

  /* ──────────────────────────────────────────
     Responsive — tablet (≤ 768 px)
  ────────────────────────────────────────── */
  @media (max-width: 768px) {
    .topbar-sub        { display: none; }
    .topbar-divider    { display: none; }
    .terminal-path     { max-width: 120px; font-size: 8.5px; }
    .nf-page           { padding: 64px 16px 60px; }
  }

  /* ──────────────────────────────────────────
     Responsive — mobile (≤ 520 px)
  ────────────────────────────────────────── */
  @media (max-width: 520px) {
    html, body { font-size: 12px; }

    .nf-topbar         { padding: 0 14px; gap: 8px; }
    .topbar-name       { font-size: 10px; letter-spacing: 1px; }
    .topbar-sys        { display: none; }

    .error-code        { font-size: clamp(64px, 20vw, 100px); }

    .nf-page           { padding: 60px 12px 58px; }

    .nf-terminal       { max-width: 100%; }
    .terminal-body     { padding: 12px 14px; font-size: 10.5px; }
    .terminal-path     { display: none; }

    .status-row        { gap: 6px; }
    .status-chip       { font-size: 8px; padding: 4px 10px; }

    .nf-actions        { flex-direction: column; align-items: center; }
    .btn               { width: 220px; justify-content: center; font-size: 9px; }

    .nf-footer         { padding: 7px 12px; }
    .footer-inner      { gap: 10px; }
  }

  /* ──────────────────────────────────────────
     Respect reduced-motion preference
  ────────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
    }
    .nf-matrix { display: none; }
  }
`;

/* ─────────────────────────────────────────────
   SVG icon helpers (keeps JSX clean)
───────────────────────────────────────────── */
const IconHome = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const IconChat = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);

const IconBack = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const IconYouTube = () => (
  <svg
    width="11" height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.95C5.12 20 12 20 12 20s6.88 0 8.59-.47a2.78 2.78 0 001.95-1.95A29 29 0 0023 12a29 29 0 00-.46-5.58z" />
    <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" />
  </svg>
);

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function NotFound() {
  const particles  = useParticles(32);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  useMatrixRain(canvasRef);

  const handleBack = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    window.history.back();
  };

  return (
    <>
      <style>{CSS}</style>

      <div className="nf-root">

        {/* ── Background layers ── */}
        <canvas ref={canvasRef} className="nf-matrix" aria-hidden="true" />
        <div className="nf-grid"      aria-hidden="true" />
        <div className="nf-scanlines" aria-hidden="true" />
        <div className="nf-vignette"  aria-hidden="true" />
        <div className="hex-ring"     aria-hidden="true" />

        {/* ── Ambient blobs ── */}
        <div className="blob blob-1" aria-hidden="true" />
        <div className="blob blob-2" aria-hidden="true" />
        <div className="blob blob-3" aria-hidden="true" />
        <div className="blob blob-4" aria-hidden="true" />

        {/* ── Floating particles ── */}
        <div className="nf-particles" aria-hidden="true">
          {particles.map((p, i) => (
            <div
              key={i}
              className="particle"
              style={{
                left:                     `${p.x}%`,
                width:                    `${p.size}px`,
                height:                   `${p.size}px`,
                background:               p.color,
                ["--clr" as string]:      p.color,
                ["--dur" as string]:      `${p.dur}s`,
                ["--del" as string]:      `${p.del}s`,
                ["--op"  as string]:      `${p.opacity}`,
              }}
            />
          ))}
        </div>

        {/* ── Top bar ── */}
        <header className="nf-topbar" role="banner">
          {/* Logo */}
          <div className="topbar-logo" aria-hidden="true">
            <img
              src="/images/nexusai.png"
              alt=""
              width={28}
              height={28}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>

          <span className="topbar-name">NEXUS AI</span>

          <div className="topbar-divider" aria-hidden="true" />
          <span className="topbar-sub">Roblox Dev Intelligence</span>

          <div className="topbar-right">
            {/* Signal bars */}
            <div className="topbar-sys" aria-label="Signal strength: strong" role="img">
              <div className="sys-bar" />
              <div className="sys-bar" />
              <div className="sys-bar" />
              <div className="sys-bar" />
            </div>

            {/* Error badge */}
            <div className="topbar-ping" role="status" aria-label="HTTP 404 error detected">
              <div className="ping-dot" aria-hidden="true" />
              <span className="ping-label">404 Error</span>
            </div>
          </div>
        </header>

        {/* ── Main content ── */}
        <main className="nf-page" role="main">

          {/* 404 headline */}
          <div className="error-wrap" aria-label="Error 404">
            <div className="error-code" aria-hidden="true">404</div>
            <div className="error-scan" aria-hidden="true" />
          </div>

          <p className="code-label" role="heading" aria-level={1}>
            ROUTE_NOT_FOUND
          </p>

          {/* Status chips */}
          <div className="status-row" role="list" aria-label="System status">
            <div className="status-chip chip-err" role="listitem">
              <div className="chip-dot" aria-hidden="true" />
              HTTP 404
            </div>
            <div className="status-chip chip-wrn" role="listitem">
              <div className="chip-dot" aria-hidden="true" />
              Route Missing
            </div>
            <div className="status-chip chip-inf" role="listitem">
              <div className="chip-dot" aria-hidden="true" />
              ServerStorage
            </div>
            <div className="status-chip chip-ok" role="listitem">
              <div className="chip-dot" aria-hidden="true" />
              Core Online
            </div>
          </div>

          {/* Terminal card */}
          <div
            className="nf-terminal"
            role="region"
            aria-label="Diagnostic terminal output"
          >
            {/* Window chrome */}
            <div className="terminal-hdr" aria-hidden="true">
              <span className="t-dot t-dot-r" />
              <span className="t-dot t-dot-y" />
              <span className="t-dot t-dot-g" />
              <div className="terminal-tabs">
                <span className="t-tab active">nexus-cli</span>
                <span className="t-tab">debug</span>
              </div>
              <span className="terminal-path">nexusai.vercel.app / ~</span>
            </div>

            {/* Output lines */}
            <div className="terminal-body" aria-live="polite">

              <div className="t-line">
                <span className="t-prompt" aria-hidden="true">$</span>
                <span>
                  nexus scan{" "}
                  <span className="hl">--route</span>{" "}
                  <span className="wrn">&quot;/???&quot;</span>{" "}
                  <span className="dimmer">--depth 3</span>
                </span>
              </div>

              <div className="t-line">
                <span className="t-prompt t-prompt-inf" aria-hidden="true">~</span>
                <span>
                  <span className="dim">Scanning workspace index…</span>
                </span>
              </div>

              <div className="t-line">
                <span className="t-prompt t-prompt-err" aria-label="Error">✗</span>
                <span>
                  <span className="err">ERROR 404</span>{" "}
                  <span className="dim">Route not found in workspace</span>
                </span>
              </div>

              <div className="t-line">
                <span className="t-prompt t-prompt-wrn" aria-label="Warning">!</span>
                <span>
                  <span className="wrn">WARN</span>{" "}
                  <span className="dim">Instance missing from ServerStorage</span>
                </span>
              </div>

              <div className="t-line">
                <span className="t-prompt t-prompt-ok" aria-label="Suggestion">→</span>
                <span>
                  <span className="dim">Suggest:</span>{" "}
                  <span className="ok">redirect to /dashboard</span>
                </span>
              </div>

              <div className="t-line">
                <span className="t-prompt dimmer" aria-hidden="true">_</span>
                <span>
                  <span className="dimmer">Awaiting input</span>
                  <span className="cursor" aria-hidden="true" />
                </span>
              </div>

            </div>
          </div>

          {/* CTA buttons */}
          <nav className="nf-actions" aria-label="Recovery actions">
            <a href="/dashboard" className="btn btn-primary">
              <IconHome />
              Dashboard
            </a>
            <a href="/chats" className="btn btn-secondary">
              <IconChat />
              Open Chat
            </a>
            <a
              href="#"
              className="btn btn-secondary"
              onClick={handleBack}
              aria-label="Go back to previous page"
            >
              <IconBack />
              Go Back
            </a>
          </nav>

        </main>

        {/* ── Footer ── */}
        <footer className="nf-footer" role="contentinfo">
          <div className="footer-inner">

            <div className="footer-brand">
              <div className="footer-brand-dot" aria-hidden="true" />
              <span className="footer-text">
                Made by{" "}
                <span className="footer-accent">NEXUS STUDIO</span>
              </span>
            </div>

            <span className="footer-sep" aria-hidden="true">·</span>

            <a
              href="https://www.youtube.com/@NEXUSSTUDIO"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link footer-yt"
              aria-label="Visit NEXUS STUDIO on YouTube (opens in new tab)"
            >
              <IconYouTube />
              NEXUS STUDIO
            </a>

            <span className="footer-sep" aria-hidden="true">·</span>

            <div className="footer-status" role="status" aria-label="All systems operational">
              <div className="footer-status-dot" aria-hidden="true" />
              <span>All systems operational</span>
            </div>

          </div>
        </footer>

      </div>
    </>
  );
}