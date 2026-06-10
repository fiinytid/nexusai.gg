"use client";
import { useEffect, useRef, useMemo } from "react";

/* ─── Palette ─── */
const C = {
  cyan: "#00e5ff",
  purple: "#8800ff",
  pink: "#ff2d6b",
  green: "#00ffaa",
  yellow: "#ffd600",
  amber: "#ff9500",
} as const;

/* ─── Particle hook ─── */
interface Particle {
  x: number; dur: number; del: number;
  size: number; color: string; opacity: number;
}

function useParticles(count: number): Particle[] {
  return useMemo(() => {
    const palette = [C.cyan, C.purple, C.pink, C.green, C.amber];
    return Array.from({ length: count }, () => ({
      x: Math.random() * 100,
      dur: 7 + Math.random() * 10,
      del: Math.random() * 14,
      size: 1.2 + Math.random() * 2.8,
      color: palette[Math.floor(Math.random() * palette.length)],
      opacity: 0.3 + Math.random() * 0.5,
    }));
  }, [count]);
}

/* ─── Matrix rain hook ─── */
function useMatrixRain(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const chars = "0123456789ABCDEFabcdefワークスペースサーバーストレージゲームスクリプト";
    const fontSize = 11;
    let cols = Math.floor(canvas.width / fontSize);
    const drops: number[] = Array(cols).fill(1);

    const draw = () => {
      ctx.fillStyle = "rgba(3,3,18,.055)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
      cols = Math.floor(canvas.width / fontSize);
      while (drops.length < cols) drops.push(1);

      for (let i = 0; i < cols; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        const alpha = 0.04 + Math.random() * 0.08;
        ctx.fillStyle = `rgba(0,229,255,${alpha})`;
        ctx.fillText(ch, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };

    const id = setInterval(draw, 55);
    return () => { clearInterval(id); window.removeEventListener("resize", resize); };
  }, [canvasRef]);
}

/* ─── Styles ─── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500;600&display=swap');

  :root {
    --bg:#030312; --bg2:#06071a; --bg3:#0a0b22; --bg4:#0d0e28;
    --cyan:#00e5ff; --cyan2:rgba(0,229,255,.3); --cyan3:rgba(0,229,255,.08);
    --purple:#8800ff; --pink:#ff2d6b; --green:#00ffaa;
    --yellow:#ffd600; --amber:#ff9500;
    --text:#b8cfff; --text2:#7a9acf; --dim:#2e3e6a; --dim2:#1e2a4a;
    --b:rgba(0,229,255,.1); --bb:rgba(0,229,255,.22);
    --r:8px; --r2:12px; --r3:16px;
  }

  *{margin:0;padding:0;box-sizing:border-box;}

  html,body{
    height:100%;font-family:'JetBrains Mono',monospace;
    background:var(--bg);color:var(--text);font-size:13px;overflow:hidden;
  }

  /* ── Root ── */
  .nf-root{
    position:relative;height:100vh;overflow:hidden;
    font-family:'JetBrains Mono',monospace;
    background:var(--bg);color:var(--text);
  }

  /* ── BG layers ── */
  .nf-matrix{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.55;}
  .nf-grid{
    position:fixed;inset:0;pointer-events:none;z-index:1;
    background:
      linear-gradient(rgba(0,229,255,.018) 1px,transparent 1px),
      linear-gradient(90deg,rgba(0,229,255,.018) 1px,transparent 1px);
    background-size:44px 44px;
  }
  .nf-scanlines{
    position:fixed;inset:0;pointer-events:none;z-index:1;
    background:repeating-linear-gradient(
      0deg,transparent,transparent 2px,rgba(0,0,0,.055) 2px,rgba(0,0,0,.055) 4px
    );
  }
  .nf-vignette{
    position:fixed;inset:0;pointer-events:none;z-index:1;
    background:radial-gradient(ellipse 80% 80% at 50% 50%,transparent 40%,rgba(3,3,18,.75) 100%);
  }

  /* ── Blobs ── */
  .blob{position:fixed;border-radius:50%;filter:blur(130px);pointer-events:none;z-index:0;}
  .blob-1{width:600px;height:600px;background:rgba(136,0,255,.06);top:-200px;left:-150px;animation:bd1 9s ease-in-out infinite alternate;}
  .blob-2{width:450px;height:450px;background:rgba(0,229,255,.045);bottom:-120px;right:-100px;animation:bd2 11s ease-in-out infinite alternate;}
  .blob-3{width:350px;height:350px;background:rgba(255,45,107,.035);top:45%;left:48%;transform:translate(-50%,-50%);animation:bd3 7s ease-in-out infinite alternate;}
  .blob-4{width:250px;height:250px;background:rgba(0,255,170,.03);top:20%;right:15%;animation:bd4 13s ease-in-out infinite alternate;}
  @keyframes bd1{from{transform:translate(0,0) scale(1);}to{transform:translate(40px,25px) scale(1.1);}}
  @keyframes bd2{from{transform:translate(0,0) scale(1);}to{transform:translate(-30px,-20px) scale(1.08);}}
  @keyframes bd3{from{transform:translate(-50%,-50%) scale(1);}to{transform:translate(calc(-50% + 25px),calc(-50% + 15px)) scale(1.06);}}
  @keyframes bd4{from{transform:translate(0,0);}to{transform:translate(-20px,30px);}}

  /* ── Hex grid accent ── */
  .hex-ring{
    position:fixed;z-index:1;pointer-events:none;opacity:.12;
    top:50%;left:50%;transform:translate(-50%,-50%);
    width:min(90vw,600px);height:min(90vh,600px);
    background:
      radial-gradient(circle,transparent 38%,rgba(0,229,255,.06) 39%,rgba(0,229,255,.06) 40%,transparent 41%),
      radial-gradient(circle,transparent 55%,rgba(136,0,255,.05) 56%,rgba(136,0,255,.05) 57%,transparent 58%),
      radial-gradient(circle,transparent 72%,rgba(0,229,255,.04) 73%,rgba(0,229,255,.04) 74%,transparent 75%);
    border-radius:50%;
    animation:hexPulse 4s ease-in-out infinite;
  }
  @keyframes hexPulse{
    0%,100%{opacity:.12;transform:translate(-50%,-50%) scale(1);}
    50%{opacity:.18;transform:translate(-50%,-50%) scale(1.04);}
  }

  /* ── Particles ── */
  .nf-particles{position:fixed;inset:0;pointer-events:none;z-index:1;overflow:hidden;}
  .particle{
    position:absolute;border-radius:50%;opacity:0;
    animation:floatUp var(--dur,8s) ease-in infinite;
    animation-delay:var(--del,0s);
    box-shadow:0 0 6px var(--clr,#00e5ff);
  }
  @keyframes floatUp{
    0%{opacity:0;transform:translateY(100vh) scale(0);}
    10%{opacity:var(--op,.5);}
    90%{opacity:calc(var(--op,.5)*.3);}
    100%{opacity:0;transform:translateY(-8vh) scale(1.8);}
  }

  /* ── Top bar ── */
  .nf-topbar{
    position:fixed;top:0;left:0;right:0;height:48px;
    background:linear-gradient(180deg,rgba(6,7,26,.98),rgba(6,7,26,.92));
    border-bottom:1px solid var(--b);
    display:flex;align-items:center;padding:0 24px;gap:12px;z-index:20;
    backdrop-filter:blur(12px);
    animation:slideDown .5s cubic-bezier(.22,.68,0,1.2) both;
  }
  @keyframes slideDown{from{transform:translateY(-100%);opacity:0;}to{transform:none;opacity:1;}}

  .topbar-logo{
    width:28px;height:28px;border-radius:7px;overflow:hidden;flex-shrink:0;
    background:linear-gradient(135deg,var(--cyan),var(--purple));
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 0 12px rgba(0,229,255,.3);
  }
  .topbar-name{
    font-family:'Orbitron',sans-serif;font-weight:900;font-size:11.5px;
    background:linear-gradient(135deg,var(--cyan),var(--purple));
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
    letter-spacing:1.5px;
  }
  .topbar-divider{width:1px;height:18px;background:var(--dim2);margin:0 4px;}
  .topbar-sub{font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:2px;}
  .topbar-right{margin-left:auto;display:flex;align-items:center;gap:14px;}

  .topbar-ping{
    display:flex;align-items:center;gap:6px;
    padding:4px 10px;border-radius:20px;
    background:rgba(255,45,107,.08);border:1px solid rgba(255,45,107,.2);
  }
  .ping-dot{width:6px;height:6px;border-radius:50%;background:var(--pink);animation:pingPulse 1.6s ease-in-out infinite;}
  @keyframes pingPulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(255,45,107,.4);}50%{opacity:.5;box-shadow:0 0 0 4px rgba(255,45,107,0);}}
  .ping-label{font-size:9px;color:var(--pink);text-transform:uppercase;letter-spacing:1.5px;}

  .topbar-sys{display:flex;align-items:center;gap:4px;}
  .sys-bar{width:3px;border-radius:2px;background:var(--cyan);opacity:.4;}
  .sys-bar:nth-child(1){height:8px;opacity:.3;}
  .sys-bar:nth-child(2){height:12px;opacity:.5;}
  .sys-bar:nth-child(3){height:16px;opacity:.7;}
  .sys-bar:nth-child(4){height:10px;opacity:.4;}

  /* ── Page ── */
  .nf-page{
    position:relative;z-index:2;height:100vh;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:64px 24px 56px;text-align:center;gap:0;
  }

  /* ── 404 Glitch ── */
  .error-wrap{position:relative;margin-bottom:2px;}
  .error-code{
    font-family:'Orbitron',sans-serif;
    font-size:clamp(88px,17vw,168px);font-weight:900;line-height:1;
    position:relative;color:transparent;-webkit-text-stroke:1px rgba(0,229,255,.12);
    animation:fadeUp .6s ease .05s both;
  }
  .error-code::before,.error-code::after{
    content:'404';position:absolute;inset:0;
    font-family:'Orbitron',sans-serif;font-size:inherit;font-weight:900;
    background:linear-gradient(135deg,var(--cyan) 0%,var(--purple) 55%,var(--pink) 100%);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  }
  .error-code::before{animation:glitch1 4s infinite;clip-path:polygon(0 0,100% 0,100% 35%,0 35%);}
  .error-code::after {animation:glitch2 4s infinite;clip-path:polygon(0 65%,100% 65%,100% 100%,0 100%);}
  @keyframes glitch1{
    0%,92%,100%{transform:none;opacity:1;}
    93%{transform:translate(-4px,2px) skewX(-3deg);opacity:.85;filter:hue-rotate(25deg);}
    96%{transform:translate(3px,-1px) skewX(2deg);opacity:.9;}
  }
  @keyframes glitch2{
    0%,92%,100%{transform:none;opacity:1;}
    93%{transform:translate(4px,-2px) skewX(3deg);opacity:.85;filter:hue-rotate(-20deg);}
    96%{transform:translate(-3px,1px) skewX(-2deg);opacity:.9;}
  }

  /* scan line sweep over 404 */
  .error-scan{
    position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:4px;
  }
  .error-scan::after{
    content:'';position:absolute;left:0;right:0;height:3px;
    background:linear-gradient(90deg,transparent,rgba(0,229,255,.35),transparent);
    animation:scanSweep 3.5s linear infinite;
    animation-delay:1s;
  }
  @keyframes scanSweep{from{top:-4px;}to{top:110%;}}

  .code-label{
    font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:4px;
    font-family:'JetBrains Mono',monospace;margin-bottom:22px;
    display:flex;align-items:center;gap:10px;
    animation:fadeUp .6s ease .15s both;
  }
  .code-label::before,.code-label::after{content:'';display:block;width:36px;height:1px;background:linear-gradient(90deg,transparent,var(--dim));}
  .code-label::after{background:linear-gradient(90deg,var(--dim),transparent);}

  /* ── Terminal ── */
  .nf-terminal{
    background:rgba(6,7,26,.9);
    border:1px solid var(--b);border-radius:14px;overflow:hidden;
    max-width:520px;width:100%;margin-bottom:26px;
    animation:fadeUp .65s ease .2s both;
    box-shadow:
      0 0 0 1px rgba(0,229,255,.04) inset,
      0 20px 80px rgba(0,0,0,.7),
      0 0 60px rgba(0,229,255,.04);
    backdrop-filter:blur(10px);
  }

  .terminal-hdr{
    padding:9px 16px;
    background:linear-gradient(180deg,rgba(13,14,40,.95),rgba(10,11,34,.9));
    border-bottom:1px solid var(--b);
    display:flex;align-items:center;gap:7px;
  }
  .t-dot{width:10px;height:10px;border-radius:50%;cursor:pointer;transition:.15s;}
  .t-dot:hover{filter:brightness(1.3);}
  .t-dot-r{background:rgba(255,45,107,.75);}
  .t-dot-y{background:rgba(255,214,0,.65);}
  .t-dot-g{background:rgba(0,255,170,.6);}
  .terminal-path{
    font-size:9.5px;color:var(--dim);margin-left:auto;letter-spacing:.5px;
    padding:2px 8px;background:var(--dim2);border-radius:4px;
  }
  .terminal-tabs{display:flex;gap:1px;margin-left:10px;}
  .t-tab{
    font-size:9px;color:var(--dim);padding:2px 10px;border-radius:4px;
    background:transparent;cursor:pointer;letter-spacing:.5px;
    transition:.15s;
  }
  .t-tab.active{background:rgba(0,229,255,.08);color:var(--cyan);}

  .terminal-body{padding:16px 20px;text-align:left;font-size:11.5px;line-height:2.05;}
  .t-line{
    display:flex;align-items:flex-start;gap:9px;
    opacity:0;animation:typeIn .3s ease forwards;
  }
  .t-line:nth-child(1){animation-delay:.45s;}
  .t-line:nth-child(2){animation-delay:.8s;}
  .t-line:nth-child(3){animation-delay:1.15s;}
  .t-line:nth-child(4){animation-delay:1.5s;}
  .t-line:nth-child(5){animation-delay:1.85s;}
  .t-line:nth-child(6){animation-delay:2.2s;}
  @keyframes typeIn{from{opacity:0;transform:translateX(-8px);}to{opacity:1;transform:none;}}

  .t-prompt{color:var(--cyan);flex-shrink:0;user-select:none;}
  .t-prompt-err{color:var(--pink);}
  .t-prompt-ok {color:var(--green);}
  .t-prompt-wrn{color:var(--yellow);}
  .t-prompt-inf{color:var(--amber);}
  .hl{color:var(--cyan);}
  .err{color:var(--pink);}
  .ok {color:var(--green);}
  .wrn{color:var(--yellow);}
  .inf{color:var(--amber);}
  .dim{color:var(--text2);}
  .dimmer{color:var(--dim);}

  .cursor{
    display:inline-block;width:7px;height:13px;background:var(--cyan);
    border-radius:1px;margin-left:3px;vertical-align:middle;
    opacity:0;animation:blink .85s step-end infinite;
    animation-delay:2.6s;animation-fill-mode:forwards;
  }
  @keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}

  /* ── Status row ── */
  .status-row{
    display:flex;gap:8px;margin-bottom:26px;flex-wrap:wrap;justify-content:center;
    animation:fadeUp .65s ease .32s both;
  }
  .status-chip{
    display:flex;align-items:center;gap:6px;
    padding:5px 12px;border-radius:20px;font-size:9px;letter-spacing:1px;text-transform:uppercase;
    border:1px solid;
  }
  .chip-err{background:rgba(255,45,107,.07);border-color:rgba(255,45,107,.2);color:var(--pink);}
  .chip-wrn{background:rgba(255,214,0,.07);border-color:rgba(255,214,0,.2);color:var(--yellow);}
  .chip-ok {background:rgba(0,255,170,.07);border-color:rgba(0,255,170,.2);color:var(--green);}
  .chip-inf{background:rgba(255,149,0,.07);border-color:rgba(255,149,0,.2);color:var(--amber);}
  .chip-dot{width:5px;height:5px;border-radius:50%;background:currentColor;}

  /* ── Actions ── */
  .nf-actions{
    display:flex;gap:10px;flex-wrap:wrap;justify-content:center;
    animation:fadeUp .65s ease .42s both;
  }
  .btn{
    padding:11px 22px;border-radius:9px;
    font-family:'Orbitron',sans-serif;font-size:9.5px;font-weight:700;letter-spacing:1.2px;
    cursor:pointer;border:none;text-decoration:none;
    display:inline-flex;align-items:center;gap:8px;transition:.18s ease;
    position:relative;overflow:hidden;
  }
  .btn::after{
    content:'';position:absolute;inset:0;
    background:linear-gradient(120deg,transparent 40%,rgba(255,255,255,.06) 50%,transparent 60%);
    transform:translateX(-100%);transition:transform .4s ease;
  }
  .btn:hover::after{transform:translateX(100%);}
  .btn-primary{
    background:linear-gradient(135deg,var(--cyan),var(--purple));color:#fff;
    box-shadow:0 4px 24px rgba(0,229,255,.2),0 0 0 1px rgba(0,229,255,.15);
  }
  .btn-primary:hover{opacity:.88;transform:translateY(-1px);box-shadow:0 8px 32px rgba(0,229,255,.3);}
  .btn-primary:active{transform:translateY(0) scale(.98);}
  .btn-secondary{
    background:rgba(0,229,255,.05);border:1px solid var(--b);color:var(--cyan);
    box-shadow:0 0 0 0 rgba(0,229,255,0);
  }
  .btn-secondary:hover{
    border-color:rgba(0,229,255,.3);background:rgba(0,229,255,.09);
    transform:translateY(-1px);box-shadow:0 4px 20px rgba(0,229,255,.1);
  }
  .btn-secondary:active{transform:translateY(0) scale(.98);}
  .btn svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0;}

  /* ── Footer ── */
  .nf-footer{
    position:fixed;bottom:0;left:0;right:0;padding:9px 24px;
    background:linear-gradient(0deg,rgba(6,7,26,.98),rgba(6,7,26,.88));
    border-top:1px solid var(--b);
    display:flex;align-items:center;justify-content:center;gap:0;
    z-index:20;backdrop-filter:blur(12px);
    animation:slideUp .5s ease both;
  }
  @keyframes slideUp{from{transform:translateY(100%);opacity:0;}to{transform:none;opacity:1;}}
  .footer-inner{display:flex;align-items:center;gap:20px;flex-wrap:wrap;justify-content:center;}
  .footer-brand{display:flex;align-items:center;gap:7px;}
  .footer-brand-dot{width:5px;height:5px;border-radius:50%;background:var(--cyan);opacity:.6;}
  .footer-text{font-size:8.5px;color:var(--text2);letter-spacing:.5px;}
  .footer-accent{color:var(--cyan);}
  .footer-sep{color:var(--dim);margin:0 2px;}
  .footer-link{
    font-size:8.5px;color:var(--text2);text-decoration:none;
    transition:.15s;display:flex;align-items:center;gap:5px;
  }
  .footer-link:hover{color:var(--cyan);}
  .footer-yt{color:var(--pink)!important;}
  .footer-yt:hover{color:var(--pink)!important;opacity:.8;}

  /* ── Animations ── */
  @keyframes fadeUp{
    from{opacity:0;transform:translateY(28px);}to{opacity:1;transform:none;}
  }

  /* ── Responsive ── */
  @media(max-width:520px){
    .error-code{font-size:clamp(64px,19vw,100px);}
    .nf-terminal{max-width:96vw;}
    .nf-actions{flex-direction:column;align-items:center;}
    .btn{width:210px;justify-content:center;}
    .status-row{gap:6px;}
    .nf-footer{padding:7px 16px;}
    .footer-inner{gap:12px;}
    .nf-topbar{padding:0 16px;}
  }
`;

/* ─── Component ─── */
export default function NotFound() {
  const particles = useParticles(32);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useMatrixRain(canvasRef);

  return (
    <>
      <style>{CSS}</style>
      <div className="nf-root">

        {/* BG Layers */}
        <canvas ref={canvasRef} className="nf-matrix" />
        <div className="nf-grid" />
        <div className="nf-scanlines" />
        <div className="nf-vignette" />
        <div className="hex-ring" />

        {/* Blobs */}
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob blob-4" />

        {/* Particles */}
        <div className="nf-particles">
          {particles.map((p, i) => (
            <div
              key={i}
              className="particle"
              style={{
                left: `${p.x}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                background: p.color,
                ["--clr" as string]: p.color,
                ["--dur" as string]: `${p.dur}s`,
                ["--del" as string]: `${p.del}s`,
                ["--op"  as string]: `${p.opacity}`,
              }}
            />
          ))}
        </div>

        {/* ── Top Bar ── */}
        <div className="nf-topbar">
          <div className="topbar-logo">
            <img
              src="images/nexusai.png" alt="N" width={28} height={28}
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
            />
          </div>
          <span className="topbar-name">NEXUS AI</span>
          <div className="topbar-divider" />
          <span className="topbar-sub">Roblox Dev Intelligence</span>

          <div className="topbar-right">
            <div className="topbar-sys">
              <div className="sys-bar" />
              <div className="sys-bar" />
              <div className="sys-bar" />
              <div className="sys-bar" />
            </div>
            <div className="topbar-ping">
              <div className="ping-dot" />
              <span className="ping-label">404 Error</span>
            </div>
          </div>
        </div>

        {/* ── Page ── */}
        <div className="nf-page">

          {/* 404 Glitch */}
          <div className="error-wrap">
            <div className="error-code">404</div>
            <div className="error-scan" />
          </div>

          <div className="code-label">ROUTE_NOT_FOUND</div>

          {/* Status chips */}
          <div className="status-row">
            <div className="status-chip chip-err">
              <div className="chip-dot" />
              HTTP 404
            </div>
            <div className="status-chip chip-wrn">
              <div className="chip-dot" />
              Route Missing
            </div>
            <div className="status-chip chip-inf">
              <div className="chip-dot" />
              ServerStorage
            </div>
            <div className="status-chip chip-ok">
              <div className="chip-dot" />
              Core Online
            </div>
          </div>

          {/* Terminal */}
          <div className="nf-terminal">
            <div className="terminal-hdr">
              <span className="t-dot t-dot-r" />
              <span className="t-dot t-dot-y" />
              <span className="t-dot t-dot-g" />
              <div className="terminal-tabs">
                <span className="t-tab active">nexus-cli</span>
                <span className="t-tab">debug</span>
              </div>
              <span className="terminal-path">nexusai.vercel.app / ~</span>
            </div>
            <div className="terminal-body">
              <div className="t-line">
                <span className="t-prompt">$</span>
                <span>
                  nexus scan <span className="hl">--route</span>{" "}
                  <span className="wrn">&quot;/???&quot;</span>{" "}
                  <span className="dimmer">--depth 3</span>
                </span>
              </div>
              <div className="t-line">
                <span className="t-prompt t-prompt-inf">~</span>
                <span><span className="dim">Scanning workspace index...</span></span>
              </div>
              <div className="t-line">
                <span className="t-prompt t-prompt-err">✗</span>
                <span>
                  <span className="err">ERROR 404</span>{" "}
                  <span className="dim">Route not found in workspace</span>
                </span>
              </div>
              <div className="t-line">
                <span className="t-prompt t-prompt-wrn">!</span>
                <span>
                  <span className="wrn">WARN</span>{" "}
                  <span className="dim">Instance missing from ServerStorage</span>
                </span>
              </div>
              <div className="t-line">
                <span className="t-prompt t-prompt-ok">→</span>
                <span>
                  <span className="dim">Suggest:</span>{" "}
                  <span className="ok">redirect to /dashboard</span>
                </span>
              </div>
              <div className="t-line">
                <span className="t-prompt dimmer">_</span>
                <span>
                  <span className="dimmer">Awaiting input</span>
                  <span className="cursor" />
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="nf-actions">
            <a href="/dashboard" className="btn btn-primary">
              <svg viewBox="0 0 24 24">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Dashboard
            </a>
            <a href="/chats" className="btn btn-secondary">
              <svg viewBox="0 0 24 24">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              Open Chat
            </a>
            <a
              href="#"
              className="btn btn-secondary"
              onClick={(e) => { e.preventDefault(); window.history.back(); }}
            >
              <svg viewBox="0 0 24 24">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Go Back
            </a>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="nf-footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <div className="footer-brand-dot" />
              <span className="footer-text">
                Made by <span className="footer-accent">NEXUS STUDIO</span>
              </span>
            </div>
            <span className="footer-sep">·</span>
            <a
              href="https://www.youtube.com/@NEXUSSTUDIO"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link footer-yt"
            >
              <svg
                width="11" height="11" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.95C5.12 20 12 20 12 20s6.88 0 8.59-.47a2.78 2.78 0 001.95-1.95A29 29 0 0023 12a29 29 0 00-.46-5.58z" />
                <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" />
              </svg>
              NEXUS STUDIO
            </a>
            <span className="footer-sep">·</span>
            <span className="footer-text" style={{ color: "var(--dim)" }}>
              All systems operational
            </span>
          </div>
        </div>

      </div>
    </>
  );
}