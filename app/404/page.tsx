import { useEffect, useRef } from "react";

const CYAN = "#00e5ff";
const PURPLE = "#8800ff";
const PINK = "#ff2d6b";
const GREEN = "#00ffaa";
const YELLOW = "#ffd600";

interface Particle {
  x: number;
  dur: number;
  del: number;
  size: number;
  color: string;
}

function useParticles(count: number): Particle[] {
  const colors = [CYAN, PURPLE, PINK, GREEN];
  return Array.from({ length: count }, () => ({
    x: Math.random() * 100,
    dur: 6 + Math.random() * 10,
    del: Math.random() * 12,
    size: 1 + Math.random() * 2.5,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
}

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500&display=swap');

  :root {
    --bg: #030312; --bg2: #06071a; --bg3: #0a0b22;
    --cyan: #00e5ff; --cyan2: rgba(0,229,255,.35); --cyan3: rgba(0,229,255,.12);
    --purple: #8800ff; --pink: #ff2d6b; --green: #00ffaa;
    --yellow: #ffd600; --text: #b8cfff; --dim: #3a4a7a;
    --b: rgba(0,229,255,.12); --bb: rgba(0,229,255,.3); --r: 8px;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    height: 100%; font-family: 'JetBrains Mono', monospace;
    background: var(--bg); color: var(--text); font-size: 13px; overflow: hidden;
  }

  .nf-root {
    position: relative; height: 100vh; overflow: hidden;
    font-family: 'JetBrains Mono', monospace;
    background: var(--bg); color: var(--text); font-size: 13px;
  }

  .nf-grid {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      linear-gradient(rgba(0,229,255,.012) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,229,255,.012) 1px, transparent 1px);
    background-size: 40px 40px;
  }
  .nf-scanlines {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background: repeating-linear-gradient(
      0deg, transparent, transparent 2px,
      rgba(0,0,0,.06) 2px, rgba(0,0,0,.06) 4px
    );
  }

  .blob {
    position: fixed; border-radius: 50%; filter: blur(120px);
    pointer-events: none; z-index: 0;
    animation: blobDrift 8s ease-in-out infinite alternate;
  }
  .blob-1 { width:500px;height:500px;background:rgba(136,0,255,.07);top:-150px;left:-100px; }
  .blob-2 { width:400px;height:400px;background:rgba(0,229,255,.05);bottom:-100px;right:-80px;animation-delay:-4s; }
  .blob-3 { width:300px;height:300px;background:rgba(255,45,107,.04);top:50%;left:50%;transform:translate(-50%,-50%);animation-delay:-2s; }
  @keyframes blobDrift {
    from { transform: translate(0,0) scale(1); }
    to { transform: translate(30px,20px) scale(1.08); }
  }
  .blob-3 { animation: blobDrift3 8s ease-in-out infinite alternate; animation-delay:-2s; }
  @keyframes blobDrift3 {
    from { transform: translate(-50%,-50%) scale(1); }
    to { transform: translate(calc(-50% + 30px),calc(-50% + 20px)) scale(1.08); }
  }

  .nf-topbar {
    position: fixed; top:0;left:0;right:0; height:46px;
    background: var(--bg2); border-bottom:1px solid var(--b);
    display:flex; align-items:center; padding:0 20px; gap:10px; z-index:10;
    animation: slideDown .5s ease both;
  }
  @keyframes slideDown {
    from { transform:translateY(-100%); opacity:0; }
    to { transform:none; opacity:1; }
  }
  .topbar-logo {
    width:26px;height:26px;border-radius:6px;overflow:hidden;flex-shrink:0;
    background:linear-gradient(135deg,var(--cyan),var(--purple));
    display:flex;align-items:center;justify-content:center;
  }
  .topbar-name {
    font-family:'Orbitron',sans-serif;font-weight:900;font-size:12px;
    background:linear-gradient(135deg,var(--cyan),var(--purple));
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;
    background-clip:text;letter-spacing:1px;
  }
  .topbar-sep { color:var(--dim);font-size:11px;margin:0 2px; }
  .topbar-sub { font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:2px; }
  .topbar-right { margin-left:auto;display:flex;align-items:center;gap:6px; }
  .topbar-dot { width:6px;height:6px;border-radius:50%;background:var(--pink);animation:pulse 1.8s ease-in-out infinite; }
  @keyframes pulse {
    0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(.7);}
  }
  .topbar-status { font-size:9px;color:var(--pink);text-transform:uppercase;letter-spacing:1.5px; }

  .nf-page {
    position:relative;z-index:1;height:100vh;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:20px;text-align:center;
  }
  .nf-main { display:flex;flex-direction:column;align-items:center;gap:0;animation:fadeUp .7s ease .1s both; }
  @keyframes fadeUp {
    from{opacity:0;transform:translateY(24px);}to{opacity:1;transform:none;}
  }

  .error-code {
    font-family:'Orbitron',sans-serif;
    font-size:clamp(80px,16vw,160px);font-weight:900;line-height:1;
    position:relative;color:transparent;-webkit-text-stroke:1px rgba(0,229,255,.15);margin-bottom:4px;
  }
  .error-code::before,.error-code::after {
    content:'404';position:absolute;inset:0;
    font-family:'Orbitron',sans-serif;font-size:inherit;font-weight:900;
    background:linear-gradient(135deg,var(--cyan),var(--purple));
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  }
  .error-code::before { animation:glitch1 3.5s infinite;clip-path:polygon(0 0,100% 0,100% 40%,0 40%); }
  .error-code::after { animation:glitch2 3.5s infinite;clip-path:polygon(0 60%,100% 60%,100% 100%,0 100%); }
  @keyframes glitch1 {
    0%,94%,100%{transform:none;opacity:1;}
    95%{transform:translate(-3px,1px) skewX(-2deg);opacity:.9;}
    97%{transform:translate(3px,-1px) skewX(1deg);opacity:.85;}
  }
  @keyframes glitch2 {
    0%,94%,100%{transform:none;opacity:1;}
    95%{transform:translate(3px,-2px) skewX(2deg);opacity:.9;}
    97%{transform:translate(-2px,1px) skewX(-1deg);opacity:.85;}
  }

  .code-label {
    font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:3px;
    font-family:'JetBrains Mono',monospace;margin-bottom:18px;
    display:flex;align-items:center;gap:8px;
  }
  .code-label::before,.code-label::after {
    content:'';display:block;width:30px;height:1px;background:var(--b);
  }

  .nf-terminal {
    background:var(--bg2);border:1px solid var(--b);border-radius:12px;overflow:hidden;
    max-width:500px;width:100%;margin-bottom:24px;
    animation:fadeUp .7s ease .25s both;
    box-shadow:0 16px 64px rgba(0,0,0,.7),0 0 0 1px rgba(0,229,255,.04) inset;
  }
  .terminal-hdr {
    padding:8px 14px;background:var(--bg3);border-bottom:1px solid var(--b);
    display:flex;align-items:center;gap:7px;
  }
  .t-dot { width:9px;height:9px;border-radius:50%; }
  .t-dot-r{background:rgba(255,45,107,.7);}
  .t-dot-y{background:rgba(255,214,0,.6);}
  .t-dot-g{background:rgba(0,255,170,.55);}
  .terminal-path{font-size:9px;color:var(--dim);margin-left:auto;letter-spacing:.5px;}
  .terminal-body{padding:14px 18px;text-align:left;font-size:11.5px;line-height:2;}

  .t-line{display:flex;align-items:flex-start;gap:8px;opacity:0;animation:typeIn .3s ease forwards;}
  .t-line:nth-child(1){animation-delay:.4s;}
  .t-line:nth-child(2){animation-delay:.75s;}
  .t-line:nth-child(3){animation-delay:1.1s;}
  .t-line:nth-child(4){animation-delay:1.45s;}
  .t-line:nth-child(5){animation-delay:1.8s;}
  @keyframes typeIn{from{opacity:0;transform:translateX(-6px);}to{opacity:1;transform:none;}}

  .t-prompt{color:var(--cyan);flex-shrink:0;}
  .t-prompt-err{color:var(--pink);}
  .t-prompt-ok{color:var(--green);}
  .t-prompt-warn{color:var(--yellow);}
  .t-text{color:var(--text);}
  .hl{color:var(--cyan);}
  .err-text{color:var(--pink);}
  .ok-text{color:var(--green);}
  .warn-text{color:var(--yellow);}
  .dim-text{color:var(--dim);}

  .cursor {
    display:inline-block;width:7px;height:14px;background:var(--cyan);
    border-radius:1px;margin-left:3px;vertical-align:middle;
    animation:blink .8s step-end infinite;opacity:0;
    animation-delay:2.2s;animation-fill-mode:forwards;
  }
  @keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}

  .nf-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;animation:fadeUp .7s ease .45s both;}
  .btn{
    padding:10px 20px;border-radius:8px;font-family:'Orbitron',sans-serif;
    font-size:10px;font-weight:700;letter-spacing:1px;cursor:pointer;border:none;
    text-decoration:none;display:inline-flex;align-items:center;gap:7px;transition:.18s;
  }
  .btn-primary{background:linear-gradient(135deg,var(--cyan),var(--purple));color:white;}
  .btn-primary:hover{opacity:.82;transform:scale(1.04);}
  .btn-secondary{background:rgba(0,229,255,.06);border:1px solid var(--b);color:var(--cyan);}
  .btn-secondary:hover{border-color:var(--cyan2);background:rgba(0,229,255,.1);}
  .btn svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0;}

  .nf-footer {
    position:fixed;bottom:0;left:0;right:0;padding:8px 20px;
    background:var(--bg2);border-top:1px solid var(--b);
    display:flex;align-items:center;justify-content:center;gap:16px;
    font-size:8.5px;color:var(--dim);z-index:10;
    animation:slideUp .5s ease both;
  }
  @keyframes slideUp{from{transform:translateY(100%);opacity:0;}to{transform:none;opacity:1;}}
  .nf-footer .accent{color:var(--cyan);}
  .footer-sep{color:var(--b);}

  .particles-container{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden;}
  .particle{
    position:absolute;width:2px;height:2px;border-radius:50%;opacity:0;
    animation:floatUp var(--dur,8s) ease-in infinite;animation-delay:var(--del,0s);
  }
  @keyframes floatUp{
    0%{opacity:0;transform:translateY(100vh) scale(0);}
    10%{opacity:.6;}90%{opacity:.2;}
    100%{opacity:0;transform:translateY(-10vh) scale(1.5);}
  }

  @media(max-width:500px){
    .error-code{font-size:clamp(60px,18vw,100px);}
    .nf-terminal{max-width:95vw;}
    .nf-actions{flex-direction:column;align-items:center;}
    .btn{width:200px;justify-content:center;}
    .nf-footer{font-size:8px;gap:10px;}
  }
`;

export default function NotFound() {
  const particles = useParticles(28);

  return (
    <>
      <style>{styles}</style>
      <div className="nf-root">
        <div className="nf-grid" />
        <div className="nf-scanlines" />

        {/* Blobs */}
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />

        {/* Particles */}
        <div className="particles-container">
          {particles.map((p, i) => (
            <div
              key={i}
              className="particle"
              style={{
                left: `${p.x}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                background: p.color,
                ["--dur" as string]: `${p.dur}s`,
                ["--del" as string]: `${p.del}s`,
              }}
            />
          ))}
        </div>

        {/* Top Bar */}
        <div className="nf-topbar">
          <div className="topbar-logo">
            <img
              src="/nexusai.png"
              alt="N"
              width={26}
              height={26}
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
            />
          </div>
          <span className="topbar-name">NEXUS AI</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-sub">Roblox Dev Intelligence</span>
          <div className="topbar-right">
            <div className="topbar-dot" />
            <span className="topbar-status">Page Error</span>
          </div>
        </div>

        {/* Page */}
        <div className="nf-page">
          <div className="nf-main">
            {/* Glitch 404 */}
            <div className="error-code">404</div>
            <div className="code-label">PAGE_NOT_FOUND</div>

            {/* Terminal */}
            <div className="nf-terminal">
              <div className="terminal-hdr">
                <span className="t-dot t-dot-r" />
                <span className="t-dot t-dot-y" />
                <span className="t-dot t-dot-g" />
                <span className="terminal-path">nexusai-roblox.vercel.app/~</span>
              </div>
              <div className="terminal-body">
                <div className="t-line">
                  <span className="t-prompt">$</span>
                  <span className="t-text">
                    nexus scan <span className="hl">--path</span>{" "}
                    <span className="warn-text">"/???"</span>
                  </span>
                </div>
                <div className="t-line">
                  <span className="t-prompt t-prompt-err">✗</span>
                  <span className="t-text">
                    <span className="err-text">ERROR</span>{" "}
                    <span className="dim-text">Route not found in workspace</span>
                  </span>
                </div>
                <div className="t-line">
                  <span className="t-prompt t-prompt-warn">!</span>
                  <span className="t-text">
                    <span className="warn-text">WARN</span>{" "}
                    <span className="dim-text">Instance does not exist in ServerStorage</span>
                  </span>
                </div>
                <div className="t-line">
                  <span className="t-prompt t-prompt-ok">→</span>
                  <span className="t-text">
                    <span className="dim-text">Suggest:</span>{" "}
                    <span className="ok-text">redirect to /dashboard</span>
                  </span>
                </div>
                <div className="t-line">
                  <span className="t-prompt">_</span>
                  <span className="t-text">
                    <span className="dim-text">Waiting for input...</span>
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
                Back
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="nf-footer">
          Made by <span className="accent">NEXUS STUDIO</span>
          <span className="footer-sep">|</span>
          YouTube: <span className="accent">NEXUS STUDIO</span>
          <span className="footer-sep">|</span>
          <span style={{ color: "var(--dim)" }}>v10.6</span>
        </div>
      </div>
    </>
  );
}