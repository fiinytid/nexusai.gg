'use client';

import { useEffect } from 'react';

export default function HomePage() {
  useEffect(() => {
    // Particles
    const container = document.getElementById('particles');
    if (container) {
      for (let i = 0; i < 30; i++) {
        const el = document.createElement('div');
        el.className = 'p';
        const sz = Math.random() * 3.5 + 1;
        const isCyan = Math.random() > 0.45;
        el.style.cssText =
          `width:${sz}px;height:${sz}px;left:${Math.random() * 100}%;` +
          `background:rgba(${isCyan ? '0,229,255' : '136,0,255'},${Math.random() * 0.35 + 0.07});` +
          `animation-duration:${Math.random() * 16 + 9}s;` +
          `animation-delay:${Math.random() * 14}s;`;
        container.appendChild(el);
      }
    }

    // Navbar scroll
    const navbar = document.getElementById('navbar');
    const handleScroll = () => {
      navbar?.classList.toggle('scrolled', window.scrollY > 60);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Hero scroll button
    const heroScroll = document.getElementById('heroScroll');
    heroScroll?.addEventListener('click', () => {
      document.getElementById('mystery')?.scrollIntoView({ behavior: 'smooth' });
    });

    // Scroll reveal
    const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
    const checkReveal = () => {
      const wh = window.innerHeight;
      els.forEach((el) => {
        if (el.getBoundingClientRect().top < wh - 60) el.classList.add('active');
      });
    };
    window.addEventListener('scroll', checkReveal, { passive: true });
    window.addEventListener('resize', checkReveal, { passive: true });
    setTimeout(checkReveal, 120);

    // Auth check
    try {
      const s = localStorage.getItem('nexus_session');
      if (s) {
        const p = JSON.parse(s);
        if (p?.user?.username && p.loginTime && Date.now() - p.loginTime < 86400000 * 7) {
          window.location.replace('/dashboard');
          return;
        }
      }
    } catch {
      localStorage.removeItem('nexus_session');
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', checkReveal);
      window.removeEventListener('resize', checkReveal);
    };
  }, []);

  return (
    <>
      <style>{`
        :root {
          --bg: #030312; --bg2: #06071a; --bg3: #0a0b22;
          --cyan: #00e5ff; --cyan2: rgba(0,229,255,.35);
          --purple: #8800ff; --pink: #ff2d6b;
          --green: #00ffaa; --yellow: #ffd600;
          --text: #b8cfff; --dim: #3a4a7a;
          --b: rgba(0,229,255,.12); --bb: rgba(0,229,255,.3); --r: 8px;
        }
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        html { scroll-behavior:smooth; }
        body {
          font-family:'JetBrains Mono',monospace;
          background:var(--bg); color:var(--text);
          font-size:13px; overflow-x:hidden;
        }
        body::before {
          content:''; position:fixed; inset:0;
          background:
            linear-gradient(rgba(0,229,255,.012) 1px,transparent 1px),
            linear-gradient(90deg,rgba(0,229,255,.012) 1px,transparent 1px);
          background-size:40px 40px; pointer-events:none; z-index:0;
        }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-thumb { background:var(--b); border-radius:4px; }

        .reveal { opacity:0; transform:translateY(28px); transition:opacity .65s ease,transform .65s ease; }
        .reveal-left { opacity:0; transform:translateX(-28px); transition:opacity .65s ease,transform .65s ease; }
        .reveal-right { opacity:0; transform:translateX(28px); transition:opacity .65s ease,transform .65s ease; }
        .reveal-scale { opacity:0; transform:scale(.93); transition:opacity .6s ease,transform .6s ease; }
        .reveal.active,.reveal-left.active,.reveal-right.active,.reveal-scale.active { opacity:1; transform:none; }
        .d1{transition-delay:.05s!important} .d2{transition-delay:.12s!important}
        .d3{transition-delay:.20s!important} .d4{transition-delay:.28s!important}
        .d5{transition-delay:.36s!important} .d6{transition-delay:.44s!important}

        .particles { position:fixed; inset:0; pointer-events:none; z-index:0; }
        .p { position:absolute; border-radius:50%; animation:float linear infinite; }
        @keyframes float {
          0%{transform:translateY(100vh) scale(0);opacity:0}
          10%{opacity:.55} 85%{opacity:.15}
          100%{transform:translateY(-8vh) scale(1);opacity:0}
        }

        .orbs { position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
        .orb  { position:absolute; border-radius:50%; filter:blur(100px); }
        .orb1 { width:520px;height:520px;background:rgba(0,229,255,.05);top:-140px;left:-100px; }
        .orb2 { width:620px;height:620px;background:rgba(136,0,255,.055);top:180px;right:-180px; }
        .orb3 { width:400px;height:400px;background:rgba(255,45,107,.04);bottom:60px;left:26%; }

        .nav {
          position:fixed;top:0;left:0;right:0;z-index:100;
          padding:14px 52px; display:flex;align-items:center;gap:12px;
          background:rgba(3,3,18,.8); backdrop-filter:blur(16px);
          border-bottom:1px solid var(--b); transition:padding .3s,background .3s;
        }
        .nav.scrolled { padding:10px 52px; background:rgba(3,3,18,.95); }
        .nav-logo-wrap { display:flex;align-items:center;gap:10px;text-decoration:none; }
        .nav-logo-img { width:28px;height:28px;border-radius:7px;object-fit:cover;border:1px solid rgba(0,229,255,.22); }
        .nav-logo {
          font-family:'Orbitron',sans-serif;font-weight:900;font-size:14px;
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:3px;
        }
        .nav-pulse { width:6px;height:6px;border-radius:50%;background:var(--green);animation:pd 1.8s infinite;flex-shrink:0; }
        @keyframes pd{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,255,170,.4)}50%{opacity:.4;box-shadow:0 0 0 5px rgba(0,255,170,0)}}
        .nav-status { font-size:9px;color:var(--green);letter-spacing:1px; }
        .nav-r { margin-left:auto;display:flex;align-items:center;gap:10px; }
        .nav-discord {
          padding:7px 16px;border-radius:7px;border:1px solid rgba(88,101,242,.35);
          background:rgba(88,101,242,.08);color:#7289da;font-size:10px;text-decoration:none;
          transition:.15s;display:flex;align-items:center;gap:6px;
        }
        .nav-discord:hover{background:rgba(88,101,242,.18);border-color:rgba(88,101,242,.6);}
        .nav-discord img{width:14px;height:14px;border-radius:2px;object-fit:cover;opacity:.85;}
        .nav-login {
          padding:8px 22px;border-radius:7px;
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          color:white;font-family:'Orbitron',sans-serif;font-size:10px;font-weight:700;
          text-decoration:none;letter-spacing:1px;transition:.15s;display:flex;align-items:center;gap:6px;
        }
        .nav-login:hover{opacity:.85;transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,229,255,.22);}

        .hero {
          min-height:100vh;display:flex;flex-direction:column;
          align-items:center;justify-content:center;
          text-align:center;padding:120px 24px 80px;position:relative;z-index:1;
        }
        .hero::before {
          content:'';position:absolute;inset:0;
          background:
            radial-gradient(ellipse at 50% 0%,rgba(136,0,255,.18) 0%,transparent 60%),
            radial-gradient(ellipse at 50% 65%,rgba(0,229,255,.07) 0%,transparent 50%);
          pointer-events:none;
        }
        .hero-badge {
          display:inline-flex;align-items:center;gap:7px;padding:6px 18px;
          background:rgba(0,229,255,.06);border:1px solid var(--b);
          border-radius:20px;font-size:9px;color:var(--cyan);
          margin-bottom:26px;letter-spacing:2px;text-transform:uppercase;
          animation:fadeUp .8s ease both;
        }
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .hero-badge .badge-dot{width:6px;height:6px;border-radius:50%;background:var(--cyan);animation:pd 1.8s infinite;}
        .hero-title {
          font-family:'Orbitron',sans-serif;font-size:clamp(38px,7.5vw,90px);font-weight:900;
          line-height:1.04;margin-bottom:16px;animation:fadeUp .8s .1s ease both;
        }
        .hero-title .grad {
          background:linear-gradient(135deg,var(--cyan) 0%,var(--purple) 50%,var(--pink) 100%);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
        }
        .hero-sub {
          font-size:clamp(12px,1.6vw,15px);color:var(--dim);
          max-width:540px;line-height:1.9;margin-bottom:40px;animation:fadeUp .8s .2s ease both;
        }
        .hero-cta{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;animation:fadeUp .8s .3s ease both;}
        .btn-primary {
          padding:14px 38px;background:linear-gradient(135deg,var(--cyan),var(--purple));
          border:none;border-radius:10px;color:white;
          font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;
          cursor:pointer;text-decoration:none;letter-spacing:1.5px;
          transition:.22s;display:inline-flex;align-items:center;gap:8px;
        }
        .btn-primary:hover{opacity:.84;transform:translateY(-2px);box-shadow:0 10px 36px rgba(0,229,255,.28);}
        .btn-secondary {
          padding:13px 28px;border:1px solid var(--b);border-radius:10px;color:var(--text);
          font-size:11px;cursor:pointer;text-decoration:none;transition:.2s;
          display:inline-flex;align-items:center;gap:7px;
          backdrop-filter:blur(6px);font-family:'JetBrains Mono',monospace;
        }
        .btn-secondary:hover{border-color:var(--cyan2);color:var(--cyan);background:rgba(0,229,255,.05);}
        .btn-secondary img{width:14px;height:14px;border-radius:2px;object-fit:cover;opacity:.8;}

        .hero-stats{display:flex;gap:40px;margin-top:56px;flex-wrap:wrap;justify-content:center;animation:fadeUp .8s .4s ease both;}
        .stat{text-align:center;}
        .stat-n{
          font-family:'Orbitron',sans-serif;font-size:30px;font-weight:900;
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
        }
        .stat-l{font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:2px;margin-top:4px;}
        .stat-divider{width:1px;background:var(--b);align-self:stretch;margin:4px 0;}
        .hero-scroll{margin-top:56px;cursor:pointer;animation:bounce 2.2s infinite,fadeUp .8s .5s ease both;}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(9px)}}
        .hero-scroll svg{opacity:.35;transition:.2s;stroke:var(--text);fill:none;stroke-width:2;}
        .hero-scroll:hover svg{opacity:.75;}

        .section{padding:90px 40px;position:relative;z-index:1;max-width:1200px;margin:0 auto;}
        .sec-label{
          font-size:9px;color:var(--cyan);text-transform:uppercase;letter-spacing:3px;
          margin-bottom:12px;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px;
        }
        .sec-label::before,.sec-label::after{content:'';width:30px;height:1px;background:rgba(0,229,255,.3);}
        .sec-title{font-family:'Orbitron',sans-serif;font-size:clamp(20px,3.5vw,36px);font-weight:900;text-align:center;color:white;margin-bottom:10px;}
        .sec-sub{font-size:12px;color:var(--dim);text-align:center;max-width:500px;margin:0 auto 56px;line-height:1.9;}

        .mystery {
          padding:90px 24px;
          background:linear-gradient(180deg,transparent,rgba(136,0,255,.055),transparent);
          border-top:1px solid var(--b);border-bottom:1px solid var(--b);
          position:relative;z-index:1;text-align:center;
        }
        .mystery-inner{max-width:760px;margin:0 auto;}
        .mystery-eyebrow{
          font-size:9px;color:var(--purple);text-transform:uppercase;letter-spacing:3px;margin-bottom:18px;
          display:flex;align-items:center;justify-content:center;gap:8px;
        }
        .mystery-eyebrow::before,.mystery-eyebrow::after{content:'';flex:1;max-width:80px;height:1px;background:rgba(136,0,255,.3);}
        .mystery-title{font-family:'Orbitron',sans-serif;font-size:clamp(22px,4vw,44px);font-weight:900;color:white;margin-bottom:18px;line-height:1.18;}
        .mystery-sub{font-size:12px;color:var(--dim);line-height:1.9;margin-bottom:14px;max-width:580px;margin-left:auto;margin-right:auto;}
        .mystery-lock{
          display:inline-flex;align-items:center;gap:8px;padding:6px 16px;margin-bottom:34px;
          background:rgba(255,45,107,.06);border:1px solid rgba(255,45,107,.22);
          border-radius:20px;font-size:9px;color:var(--pink);
        }
        .hint-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:38px;}
        .hint-card{
          padding:20px 16px;background:rgba(136,0,255,.04);border:1px solid rgba(136,0,255,.15);
          border-radius:10px;text-align:left;transition:.22s;
        }
        .hint-card:hover{border-color:rgba(136,0,255,.38);background:rgba(136,0,255,.08);transform:translateY(-2px);}
        .hint-icon{width:34px;height:34px;border-radius:9px;background:rgba(136,0,255,.1);display:flex;align-items:center;justify-content:center;margin-bottom:12px;}
        .hint-title{font-size:11px;color:white;font-weight:700;margin-bottom:5px;}
        .hint-sub{font-size:10px;color:var(--dim);line-height:1.7;}

        .screenshots-section{
          background:linear-gradient(180deg,transparent,rgba(0,229,255,.022),transparent);
          border-top:1px solid var(--b);border-bottom:1px solid var(--b);
          padding:90px 24px;position:relative;z-index:1;
        }
        .screen-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;max-width:1160px;margin:0 auto;}
        .screen-card{border-radius:12px;overflow:hidden;border:1px solid var(--b);background:var(--bg2);transition:.25s;position:relative;}
        .screen-card:hover{border-color:var(--cyan2);transform:translateY(-5px);box-shadow:0 20px 50px rgba(0,229,255,.1);}
        .screen-card-img{width:100%;height:210px;object-fit:cover;object-position:top;display:block;border-bottom:1px solid var(--b);background:var(--bg3);}
        .screen-card-body{padding:16px 18px;}
        .screen-card-title{font-size:11px;color:white;font-weight:700;margin-bottom:5px;display:flex;align-items:center;gap:7px;}
        .screen-card-desc{font-size:10px;color:var(--dim);line-height:1.75;}
        .screen-badge{
          position:absolute;top:10px;right:10px;padding:3px 9px;border-radius:5px;
          font-size:8px;font-weight:700;background:rgba(0,229,255,.1);color:var(--cyan);
          border:1px solid rgba(0,229,255,.25);backdrop-filter:blur(4px);
          text-transform:uppercase;letter-spacing:1px;
        }

        .features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;}
        .feat{padding:26px;background:var(--bg2);border:1px solid var(--b);border-radius:12px;transition:.25s;position:relative;overflow:hidden;}
        .feat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--cyan),transparent);opacity:0;transition:.25s;}
        .feat:hover{border-color:var(--cyan2);background:rgba(0,229,255,.025);transform:translateY(-3px);}
        .feat:hover::before{opacity:1;}
        .feat-icon{width:44px;height:44px;border-radius:11px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;flex-shrink:0;}
        .feat-title{font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;color:white;margin-bottom:8px;}
        .feat-desc{font-size:10.5px;color:var(--dim);line-height:1.85;}
        .feat-tag{display:inline-flex;align-items:center;gap:4px;margin-top:14px;padding:3px 9px;border-radius:5px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1px;}

        .how-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;}
        .step-card{text-align:center;padding:32px 22px;background:var(--bg2);border:1px solid var(--b);border-radius:12px;transition:.22s;position:relative;}
        .step-card:hover{border-color:var(--cyan2);transform:translateY(-3px);}
        .step-num{width:56px;height:56px;border-radius:50%;border:2px solid rgba(0,229,255,.35);background:rgba(0,229,255,.05);display:flex;align-items:center;justify-content:center;font-family:'Orbitron',sans-serif;font-size:20px;font-weight:900;color:var(--cyan);margin:0 auto 18px;transition:.22s;}
        .step-card:hover .step-num{border-color:var(--cyan);background:rgba(0,229,255,.1);box-shadow:0 0 22px rgba(0,229,255,.15);}
        .step-title{font-size:12px;font-weight:700;color:white;margin-bottom:8px;}
        .step-desc{font-size:10px;color:var(--dim);line-height:1.8;}

        .code-demo{max-width:700px;margin:40px auto 0;background:var(--bg3);border:1px solid rgba(0,229,255,.12);border-radius:12px;overflow:hidden;}
        .code-top{padding:10px 16px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:8px;}
        .code-dots{display:flex;gap:6px;}
        .cd{width:10px;height:10px;border-radius:50%;}
        .cd1{background:#ff5f57} .cd2{background:#febc2e} .cd3{background:#28c840}
        .code-label{font-size:9px;color:var(--dim);margin-left:4px;flex:1;}
        .code-tag{font-size:8px;padding:2px 8px;border-radius:4px;background:rgba(0,229,255,.08);color:var(--cyan);border:1px solid rgba(0,229,255,.15);}
        .code-body{padding:18px 20px;font-size:10.5px;line-height:1.7;}
        .code-body .k{color:#cc55ff} .code-body .s{color:var(--green)} .code-body .c{color:var(--dim);font-style:italic} .code-body .n{color:var(--cyan)} .code-body .v{color:var(--yellow)}
        .code-result{margin:0 16px 16px;padding:10px 14px;background:rgba(0,255,170,.05);border-radius:7px;border:1px solid rgba(0,255,170,.15);font-size:10px;display:flex;align-items:center;gap:8px;color:var(--green);}

        .models-wrap{max-width:1000px;margin:0 auto;}
        .model-category{width:100%;display:flex;align-items:center;gap:10px;margin:20px 0 8px;}
        .mc-label{font-size:8.5px;color:var(--dim);text-transform:uppercase;letter-spacing:2px;white-space:nowrap;}
        .mc-line{flex:1;height:1px;background:var(--b);}
        .models-grid{display:flex;flex-wrap:wrap;gap:10px;}
        .model-chip{padding:9px 16px;border:1px solid var(--b);border-radius:20px;font-size:10px;color:var(--text);background:var(--bg2);display:flex;align-items:center;gap:8px;transition:.18s;position:relative;}
        .model-chip:hover{border-color:var(--cyan2);color:var(--cyan);background:rgba(0,229,255,.04);}
        .model-chip img{width:16px;height:16px;border-radius:3px;object-fit:contain;flex-shrink:0;}
        .model-chip.is-new{border-color:rgba(255,45,107,.3);background:rgba(255,45,107,.04);}
        .model-chip.is-new:hover{border-color:rgba(255,45,107,.55);}
        .model-chip.is-soon{opacity:.45;cursor:default;}
        .model-chip.is-soon:hover{border-color:var(--b);color:var(--text);background:var(--bg2);}
        .mbadge{font-size:7.5px;padding:2px 6px;border-radius:4px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
        .mbadge.free{background:rgba(0,255,170,.12);color:var(--green);}
        .mbadge.cr{background:rgba(0,229,255,.1);color:var(--cyan);}
        .mbadge.new{background:rgba(255,45,107,.12);color:var(--pink);animation:pulse-new 2s infinite;}
        .mbadge.soon{background:rgba(255,214,0,.08);color:var(--yellow);}
        @keyframes pulse-new{0%,100%{box-shadow:0 0 0 0 rgba(255,45,107,.3)}50%{box-shadow:0 0 0 4px rgba(255,45,107,0)}}

        .gate-section{padding:90px 24px;text-align:center;position:relative;z-index:1;}
        .gate-box{max-width:480px;margin:0 auto;padding:52px 40px;background:var(--bg2);border:1px solid var(--b);border-radius:20px;position:relative;overflow:hidden;}
        .gate-box::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--purple),var(--cyan),var(--purple));}
        .gate-glow{position:absolute;bottom:-60px;left:50%;transform:translateX(-50%);width:220px;height:130px;background:rgba(136,0,255,.2);filter:blur(44px);pointer-events:none;}
        .gate-icon{width:62px;height:62px;border-radius:16px;background:rgba(136,0,255,.1);border:1px solid rgba(136,0,255,.25);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;}
        .gate-title{font-family:'Orbitron',sans-serif;font-size:18px;color:white;margin-bottom:10px;letter-spacing:1px;}
        .gate-sub{font-size:10.5px;color:var(--dim);margin-bottom:28px;line-height:1.85;}
        .gate-btn{display:inline-flex;align-items:center;gap:8px;padding:13px 34px;background:linear-gradient(135deg,var(--purple),var(--cyan));border:none;border-radius:9px;color:white;font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;cursor:pointer;transition:.22s;text-decoration:none;letter-spacing:1px;}
        .gate-btn:hover{opacity:.88;transform:translateY(-2px);box-shadow:0 12px 36px rgba(136,0,255,.35);}
        .gate-note{margin-top:16px;font-size:9px;color:var(--dim);}
        .gate-note span{color:var(--green);}

        .cta-section{padding:90px 24px;text-align:center;position:relative;z-index:1;}
        .cta-box{max-width:620px;margin:0 auto;padding:56px 44px;background:var(--bg2);border:1px solid var(--b);border-radius:20px;position:relative;overflow:hidden;}
        .cta-box::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--cyan),var(--purple),var(--pink));}
        .cta-free{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;margin-bottom:22px;background:rgba(0,255,170,.07);border:1px solid rgba(0,255,170,.22);border-radius:20px;font-size:9px;color:var(--green);font-weight:700;letter-spacing:1px;}
        .cta-title{font-family:'Orbitron',sans-serif;font-size:clamp(20px,3vw,30px);font-weight:900;color:white;margin-bottom:12px;}
        .cta-sub{font-size:11.5px;color:var(--dim);margin-bottom:30px;line-height:1.85;}
        .cta-actions{display:flex;flex-direction:column;align-items:center;gap:12px;}
        .cta-discord{display:inline-flex;align-items:center;gap:7px;font-size:10px;color:var(--dim);text-decoration:none;transition:.15s;padding:8px 14px;border-radius:7px;border:1px solid transparent;}
        .cta-discord:hover{color:var(--cyan);border-color:var(--b);}
        .cta-meta{margin-top:18px;font-size:9px;color:var(--dim);line-height:1.9;}
        .cta-meta span{color:var(--green);}

        footer{padding:34px 40px;border-top:1px solid var(--b);position:relative;z-index:1;}
        .footer-inner{max-width:1160px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;}
        .footer-brand{font-family:'Orbitron',sans-serif;font-size:12px;background:linear-gradient(135deg,var(--cyan),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:900;letter-spacing:2px;}
        .footer-links{display:flex;gap:22px;flex-wrap:wrap;}
        .footer-links a{font-size:10px;color:var(--dim);text-decoration:none;transition:.15s;}
        .footer-links a:hover{color:var(--cyan);}
        .footer-copy{font-size:9px;color:var(--dim);}

        @media(max-width:768px){
          .nav{padding:11px 16px;} .nav.scrolled{padding:9px 16px;}
          .nav-status{display:none;} .section{padding:60px 16px;}
          .screenshots-section,.mystery{padding:60px 16px;}
          .gate-section,.cta-section{padding:60px 16px;}
          .hero{padding:100px 16px 60px;} .hero-stats{gap:22px;}
          .stat-divider{display:none;} .how-grid{grid-template-columns:1fr;}
          .gate-box,.cta-box{padding:32px 20px;} .hint-grid{grid-template-columns:1fr 1fr;}
          .footer-inner{flex-direction:column;text-align:center;} .footer-links{justify-content:center;}
          .screen-grid{grid-template-columns:1fr;}
        }
        @media(max-width:480px){
          .hero-cta{flex-direction:column;align-items:stretch;}
          .btn-primary,.btn-secondary{justify-content:center;}
          .hint-grid{grid-template-columns:1fr;} .models-grid{justify-content:center;}
        }
      `}</style>

      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet" />

      <div className="particles" id="particles" />
      <div className="orbs">
        <div className="orb orb1" />
        <div className="orb orb2" />
        <div className="orb orb3" />
      </div>

      {/* NAVBAR */}
      <nav className="nav" id="navbar">
        <a href="/" className="nav-logo-wrap">
          <img src="favicon.ico" alt="NEXUS AI" className="nav-logo-img" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span className="nav-logo">NEXUS AI</span>
        </a>
        <div className="nav-pulse" />
        <span className="nav-status">Live</span>
        <div className="nav-r">
          <a href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noopener" className="nav-discord">
            <img src="/icon/discord.png" alt="Discord" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            Discord
          </a>
          <a href="/login" className="nav-login">
            <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Enter
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero" id="top">
        <div className="hero-badge">
          <div className="badge-dot" />
          Roblox Studio · Direct Injection · AI Agent
        </div>
        <h1 className="hero-title">
          Your Game.<br />
          <span className="grad">Built Instantly.</span>
        </h1>
        <p className="hero-sub">
          NEXUS AI is the most advanced AI assistant for Roblox developers.
          Describe your idea — watch it appear inside Roblox Studio in seconds.
          No copy-paste. No limits. Pure creation.
        </p>
        <div className="hero-cta">
          <a href="/login" className="btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Start Building Free
          </a>
          <a href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noopener" className="btn-secondary">
            <img src="/icon/discord.png" alt="Discord" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            Join Discord
          </a>
        </div>
        <div className="hero-stats">
          <div className="stat"><div className="stat-n">Free</div><div className="stat-l">To Start</div></div>
          <div className="stat-divider" />
          <div className="stat"><div className="stat-n">10+</div><div className="stat-l">AI Models</div></div>
          <div className="stat-divider" />
          <div className="stat"><div className="stat-n">Direct</div><div className="stat-l">Injection</div></div>
          <div className="stat-divider" />
          <div className="stat"><div className="stat-n">∞</div><div className="stat-l">Potential</div></div>
        </div>
        <div className="hero-scroll" id="heroScroll" role="button" aria-label="Scroll down">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            NEXUS AI skips all of that. It injects scripts, GUIs, parts, and full systems
            directly into your Roblox place — you just describe what you want.
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
              { icon: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />, color: 'var(--cyan)', title: 'Zero Copy-Paste', desc: 'Every script goes directly into Roblox Studio via plugin. Type once, it appears instantly.', delay: 'd1' },
              { icon: <><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>, color: 'var(--purple)', title: 'Studio-Aware AI', desc: 'The AI sees your workspace. It knows what scripts exist and builds on top of them.', delay: 'd2' },
              { icon: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />, color: 'var(--green)', title: 'Natural Language', desc: 'No technical syntax needed. Describe "make a shop with coins" and it happens.', delay: 'd3' },
              { icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, color: 'var(--yellow)', title: 'Auto Test & Fix', desc: 'AI runs a play test after building. If console errors appear — it stops, reads them, and self-fixes.', delay: 'd4' },
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
        <div style={{ textAlign: 'center', marginBottom: '48px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
          <div className="sec-label reveal">See It In Action</div>
          <h2 className="sec-title reveal d1">From Prompt to Studio</h2>
          <p className="sec-sub reveal d2" style={{ marginBottom: 0 }}>Watch an idea transform into real Roblox content in under 5 seconds.</p>
        </div>
        <div className="screen-grid">
          {[
            { badge: 'Web', img: 'screenshots/screen1.png', alt: 'Chat Interface', icon: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />, iconColor: 'var(--cyan)', title: 'Chat Interface', desc: 'Type your request in plain English. NEXUS AI breaks it down into precise actions and executes them immediately.', delay: 'd1' },
            { badge: 'Plugin', img: 'screenshots/screen2.png', alt: 'Studio Plugin', icon: <><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" /><line x1="16" y1="8" x2="2" y2="22" /></>, iconColor: 'var(--green)', title: 'Studio Plugin', desc: 'The companion plugin in Roblox Studio — connected, listening, injecting in real-time with zero lag.', delay: 'd2' },
            { badge: 'Connected', img: 'screenshots/screen3.png', alt: 'Connected State', icon: <polyline points="20 6 9 17 4 12" />, iconColor: 'var(--yellow)', title: 'Live & Injecting', desc: 'When connected, every AI command materializes in your place — parts, scripts, GUIs, systems — all live.', delay: 'd3' },
          ].map((s, i) => (
            <div key={i} className={`screen-card reveal ${s.delay}`}>
              <span className="screen-badge">{s.badge}</span>
              <img src={s.img} alt={s.alt} className="screen-card-img" onError={(e) => { (e.target as HTMLImageElement).style.minHeight = '140px'; }} />
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
        <div className="sec-label reveal">Core Capabilities</div>
        <h2 className="sec-title reveal d1">Built for Serious Developers</h2>
        <p className="sec-sub reveal d2">Every tool you need to build a complete Roblox game, powered by AI that actually understands Studio.</p>
        <div className="features-grid">
          {[
            { iconBg: 'rgba(0,229,255,.08)', iconColor: 'var(--cyan)', icon: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />, title: 'Direct Studio Injection', desc: 'Scripts, parts, GUIs — AI creates everything directly in Roblox Studio via the companion plugin. No manual copy-paste, ever.', tagBg: 'rgba(0,229,255,.07)', tagColor: 'var(--cyan)', tagLabel: 'Plugin Required', delay: 'd1' },
            { iconBg: 'rgba(136,0,255,.08)', iconColor: '#cc55ff', icon: <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />, title: 'Multiple AI Models', desc: 'Switch between Gemini, DeepSeek, Groq, Mistral, Step and more — all fine-tuned to write production-quality Lua for Roblox.', tagBg: 'rgba(0,255,170,.07)', tagColor: 'var(--green)', tagLabel: 'Many Free', delay: 'd2' },
            { iconBg: 'rgba(0,255,170,.07)', iconColor: 'var(--green)', icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>, title: 'Visual GUI Builder', desc: 'Drag-and-drop interface builder. Design your UI visually, then export as Lua or send directly to Studio with one click.', tagBg: 'rgba(0,255,170,.07)', tagColor: 'var(--green)', tagLabel: 'Drag & Drop', delay: 'd3' },
            { iconBg: 'rgba(255,214,0,.07)', iconColor: 'var(--yellow)', icon: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>, title: 'Auto Play-Test & Debug', desc: 'After building, AI runs a play-test automatically. If errors appear in the console, it stops, reads them, and re-injects a fix — all on its own.', tagBg: 'rgba(255,214,0,.08)', tagColor: 'var(--yellow)', tagLabel: 'Auto-Fix', delay: 'd4' },
            { iconBg: 'rgba(255,45,107,.07)', iconColor: 'var(--pink)', icon: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, title: '@ Mention System', desc: 'Type @ in chat to mention any script or object from your place. AI reads it, understands it, and builds on top of it intelligently.', tagBg: 'rgba(0,229,255,.07)', tagColor: 'var(--cyan)', tagLabel: 'Context-Aware', delay: 'd5' },
            { iconBg: 'rgba(0,229,255,.07)', iconColor: 'var(--cyan)', icon: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>, title: 'Roblox Account Sync', desc: 'Data tied to your Roblox account. Credits, chat history, and projects persist across all devices automatically.', tagBg: 'rgba(255,214,0,.08)', tagColor: 'var(--yellow)', tagLabel: 'Persistent', delay: 'd6' },
          ].map((f, i) => (
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
        <div className="sec-label reveal">Setup</div>
        <h2 className="sec-title reveal d1">3 Steps. That&apos;s It.</h2>
        <p className="sec-sub reveal d2">One-time setup, infinite creation.</p>
        <div className="how-grid">
          {[
            { n: '1', title: 'Login & Verify', desc: 'Sign in with your Roblox account. Get 30 free credits instantly — no credit card, no commitment.', delay: 'd1' },
            { n: '2', title: 'Install Plugin', desc: 'Install the NEXUS AI plugin from Creator Store. Open Studio, click CONNECT — green light means ready.', delay: 'd2' },
            { n: '3', title: 'Describe & Build', desc: 'Type what you want. AI builds, injects, tests. Your game grows while you watch.', delay: 'd3' },
          ].map((s, i) => (
            <div key={i} className={`step-card reveal ${s.delay}`}>
              <div className="step-num">{s.n}</div>
              <div className="step-title">{s.title}</div>
              <div className="step-desc">{s.desc}</div>
            </div>
          ))}
        </div>
        <div className="code-demo reveal d2">
          <div className="code-top">
            <div className="code-dots"><span className="cd cd1" /><span className="cd cd2" /><span className="cd cd3" /></div>
            <span className="code-label">AI Studio Pipeline</span>
            <span className="code-tag">Live Example</span>
          </div>
          <div className="code-body">
            <div><span className="c">{'// User says: "build a shop with coins and buy button"'}</span></div>
            <div style={{ marginTop: 8 }}><span className="c">{'// AI generates & sends to Studio:'}</span></div>
            <div style={{ marginTop: 6 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;batch_commands&quot;</span>, <span className="n">&quot;commands&quot;</span>: [</div>
            <div style={{ marginLeft: 16 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;create_remote&quot;</span>, <span className="n">&quot;name&quot;</span>: <span className="s">&quot;BuyItem&quot;</span> <span className="k">{'}'}</span>,</div>
            <div style={{ marginLeft: 16 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;inject_script&quot;</span>, <span className="n">&quot;name&quot;</span>: <span className="s">&quot;ShopServer&quot;</span> <span className="k">{'}'}</span>,</div>
            <div style={{ marginLeft: 16 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;create_gui&quot;</span>, <span className="n">&quot;name&quot;</span>: <span className="s">&quot;ShopGUI&quot;</span> <span className="k">{'}'}</span>,</div>
            <div style={{ marginLeft: 16 }}><span className="k">{'{'}</span> <span className="n">&quot;action&quot;</span>: <span className="s">&quot;play_test&quot;</span>, <span className="n">&quot;duration&quot;</span>: <span className="v">15</span> <span className="k">{'}'}</span></div>
            <div>] <span className="k">{'}'}</span></div>
          </div>
          <div className="code-result">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            4 commands executed · Shop built · Auto-tested · Zero errors
          </div>
        </div>
      </section>

      {/* AI MODELS */}
      <section className="section" style={{ paddingTop: 0 }} id="models">
        <div className="sec-label reveal">AI Models</div>
        <h2 className="sec-title reveal d1">Best-in-Class Model Selection</h2>
        <p className="sec-sub reveal d2">Handpicked models for speed, precision, and Roblox expertise. Many are completely free.</p>
        <div className="models-wrap reveal d2">
          {[
            { label: 'Google Gemini', models: [{ name: 'Gemini 3.5 Flash', badge: 'new', cls: 'is-new', icon: 'gemini.png' }, { name: 'Gemini 3.1 Pro', badge: 'cr', badgeTxt: '2 CR', icon: 'gemini.png' }, { name: 'Gemini 2.5 Flash', badge: 'cr', badgeTxt: '1 CR', icon: 'gemini.png' }, { name: 'Gemini 2.5 Flash Lite', badge: 'free', icon: 'gemini.png' }, { name: 'Gemini 3 Flash', badge: 'free', icon: 'gemini.png' }] },
            { label: 'DeepSeek', models: [{ name: 'DeepSeek V4 Pro', badge: 'new', cls: 'is-new', icon: 'deepseek.svg' }, { name: 'DeepSeek V3', badge: 'cr', badgeTxt: '1 CR', icon: 'deepseek.svg' }] },
            { label: 'Step Fun', models: [{ name: 'Step 3.5 Flash', badge: 'new', cls: 'is-new', icon: 'stepfun.png' }] },
            { label: 'Groq · Meta', models: [{ name: 'Llama 3.3 70B', badge: 'free', icon: 'groq.ico' }, { name: 'OpenAI OSS 120B', badge: 'free', icon: 'groq.ico' }] },
            { label: 'Mistral', models: [{ name: 'Mistral Small', badge: 'free', icon: 'mistral.png' }] },
            { label: 'Coming Soon', models: [{ name: 'Claude Sonnet', badge: 'soon', cls: 'is-soon', icon: 'claude.png' }, { name: 'GPT-4o', badge: 'soon', cls: 'is-soon', icon: 'chatgpt.png' }] },
          ].map((cat, i) => (
            <div key={i}>
              <div className="model-category"><div className="mc-line" /><div className="mc-label">{cat.label}</div><div className="mc-line" /></div>
              <div className="models-grid">
                {cat.models.map((m, j) => (
                  <div key={j} className={`model-chip ${m.cls || ''}`}>
                    <img src={`/icon/${m.icon}`} alt={m.name} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    {m.name}
                    <span className={`mbadge ${m.badge}`}>{m.badgeTxt || m.badge.toUpperCase()}</span>
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
          <div className="gate-sub">Projects, dashboard, full model access, credit system, plugin download, and daily rewards — all waiting behind one login.</div>
          <a href="/login" className="gate-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            Enter NEXUS AI
          </a>
          <div className="gate-note"><span>30 free credits</span> &nbsp;·&nbsp; No credit card &nbsp;·&nbsp; Sign in with Roblox</div>
        </div>
      </div>

      {/* CTA */}
      <section className="cta-section">
        <div className="cta-box reveal-scale">
          <div className="cta-free">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            30 Free Credits — No Card Required
          </div>
          <h2 className="cta-title">Ready to Build Faster?</h2>
          <p className="cta-sub">Join developers who have already stopped copy-pasting and started creating. Your game deserves better than manual scripting.</p>
          <div className="cta-actions">
            <a href="/login" className="btn-primary" style={{ width: '100%', maxWidth: '300px', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              Start Free Now
            </a>
            <a href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noopener" className="cta-discord">
              <img src="/icon/discord.png" alt="Discord" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              Join Discord for Plugin & Codes
            </a>
          </div>
          <div className="cta-meta"><span>30 CR on signup</span> &nbsp;·&nbsp; +2 CR daily free &nbsp;·&nbsp; Pro plan for power users</div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-inner">
          <span className="footer-brand">NEXUS AI</span>
          <div className="footer-links">
            <a href="https://discord.gg/FzAF48mvK5" target="_blank" rel="noopener">Discord</a>
            <a href="/login">Login</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
          <span className="footer-copy">&copy; 2026 NEXUS STUDIO · nexusai-roblox.vercel.app</span>
        </div>
      </footer>
    </>
  );
}