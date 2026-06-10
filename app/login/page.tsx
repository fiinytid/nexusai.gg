'use client';

import { useEffect, useRef } from 'react';

/* ─── Constants (unchanged) ─── */
const OWNER_USERS = ['FIINYTID25', 'fiinytid25'];
const SESSION_KEY = 'nexus_session';
const GOOGLE_TMP_KEY = 'nexus_google_tmp';
const RL_KEY = 'nexus_rl';
const STATE_KEY = 'nexus_oauth_state';
const INTEGRITY_SALT = 'NEXUS_GUARD_v2';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };

/* ─── Helpers (unchanged) ─── */
function simpleHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16);
}
function buildIntegrity(session: Record<string, unknown>): string {
  const user = (session.user as Record<string, unknown>) || {};
  const raw = `${INTEGRITY_SALT}|${session.loginTime || ''}|${user.id || ''}|${user.username || ''}|${session.version || ''}`;
  return simpleHash(raw);
}
function safeBase64Decode(b64: string): string {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return decodeURIComponent(escape(atob(b64)));
  }
}
function getRateData() {
  try { return JSON.parse(localStorage.getItem(RL_KEY) || '{"attempts":[],"locked":false}'); }
  catch { return { attempts: [], locked: false }; }
}
function saveRateData(d: unknown) { try { localStorage.setItem(RL_KEY, JSON.stringify(d)); } catch { } }
function recordAttempt() {
  const d = getRateData(); const now = Date.now();
  d.attempts = d.attempts.filter((t: number) => now - t < RATE_LIMIT.windowMs);
  d.attempts.push(now); saveRateData(d); return d.attempts.length;
}
function isRateLimited() {
  const d = getRateData(); const now = Date.now();
  d.attempts = d.attempts.filter((t: number) => now - t < RATE_LIMIT.windowMs);
  return d.attempts.length >= RATE_LIMIT.max;
}
function getRemainingLockoutMs() {
  const d = getRateData();
  if (!d.attempts.length) return 0;
  const oldest = Math.min(...d.attempts);
  return Math.max(0, RATE_LIMIT.windowMs - (Date.now() - oldest));
}
function generateStateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
function saveState(token: string, type: string) {
  try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ token, type, ts: Date.now() })); } catch { }
}

/* ─── CSS ─── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500;600&display=swap');

:root {
  --bg:#030312; --bg2:#06071a; --bg3:#0a0b22; --bg4:#0d0e28;
  --cyan:#00e5ff; --cyan2:rgba(0,229,255,.25); --cyan3:rgba(0,229,255,.07);
  --purple:#8800ff; --pink:#ff2d6b; --green:#00ffaa; --yellow:#ffd600; --amber:#ff9500;
  --text:#b8cfff; --text2:#7a9acf; --dim:#2e3e6a; --dim2:#1a2540;
  --b:rgba(0,229,255,.1); --bb:rgba(0,229,255,.22);
  --r:10px; --r2:14px; --r3:18px;
}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{height:100%;font-family:'JetBrains Mono',monospace;background:var(--bg);color:var(--text);font-size:13px;overflow-x:hidden;}

/* ── Background layers ── */
.lx-canvas{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.45;}
.lx-grid{
  position:fixed;inset:0;pointer-events:none;z-index:1;
  background:linear-gradient(rgba(0,229,255,.015) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,229,255,.015) 1px,transparent 1px);
  background-size:44px 44px;
}
.lx-grad{
  position:fixed;inset:0;pointer-events:none;z-index:1;
  background:
    radial-gradient(ellipse 70% 50% at 20% 20%,rgba(136,0,255,.12) 0%,transparent 60%),
    radial-gradient(ellipse 50% 60% at 85% 80%,rgba(0,229,255,.06) 0%,transparent 55%),
    radial-gradient(ellipse 40% 40% at 50% 50%,rgba(255,45,107,.03) 0%,transparent 50%);
}
.lx-scanlines{
  position:fixed;inset:0;pointer-events:none;z-index:1;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.04) 2px,rgba(0,0,0,.04) 4px);
}
.lx-vignette{
  position:fixed;inset:0;pointer-events:none;z-index:1;
  background:radial-gradient(ellipse 85% 85% at 50% 50%,transparent 35%,rgba(3,3,18,.6) 100%);
}

/* ── Particles ── */
.lx-particles{position:fixed;inset:0;pointer-events:none;z-index:1;overflow:hidden;}
.lp{position:absolute;border-radius:50%;pointer-events:none;animation:lpfloat linear infinite;}
@keyframes lpfloat{
  0%{transform:translateY(100vh) scale(0);opacity:0}
  8%{opacity:1}92%{opacity:.4}
  100%{transform:translateY(-8vh) scale(1.5);opacity:0}
}

/* ── Topbar ── */
.lx-topbar{
  position:fixed;top:0;left:0;right:0;height:46px;z-index:30;
  background:linear-gradient(180deg,rgba(6,7,26,.98),rgba(6,7,26,.88));
  border-bottom:1px solid var(--b);backdrop-filter:blur(14px);
  display:flex;align-items:center;padding:0 24px;gap:12px;
  animation:tbIn .5s cubic-bezier(.22,.68,0,1.2) both;
}
@keyframes tbIn{from{transform:translateY(-100%);opacity:0;}to{transform:none;opacity:1;}}
.tb-logo{
  width:26px;height:26px;border-radius:7px;overflow:hidden;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
  box-shadow:0 0 10px rgba(0,229,255,.25);
}
.tb-name{
  font-family:'Orbitron',sans-serif;font-weight:900;font-size:11px;letter-spacing:1.5px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.tb-div{width:1px;height:16px;background:var(--dim2);margin:0 2px;}
.tb-sub{font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:2px;}
.tb-right{margin-left:auto;display:flex;align-items:center;gap:8px;}
.tb-secure{
  display:flex;align-items:center;gap:6px;
  padding:4px 10px;border-radius:20px;
  background:rgba(0,255,170,.06);border:1px solid rgba(0,255,170,.18);
  font-size:9px;color:var(--green);letter-spacing:1px;text-transform:uppercase;
}
.tb-secure-dot{width:5px;height:5px;border-radius:50%;background:var(--green);animation:sdot 2s ease-in-out infinite;}
@keyframes sdot{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.3;transform:scale(.6);}}

/* ── Page ── */
.lx-page{
  min-height:100vh;display:flex;align-items:center;justify-content:center;
  padding:66px 20px 24px;position:relative;z-index:2;
}

/* ── Login card ── */
.lx-card{
  display:flex;width:100%;max-width:900px;
  background:rgba(6,7,26,.85);
  border:1px solid var(--b);border-radius:22px;overflow:hidden;
  box-shadow:
    0 0 0 1px rgba(0,229,255,.04) inset,
    0 40px 100px rgba(0,0,0,.75),
    0 0 80px rgba(136,0,255,.07);
  backdrop-filter:blur(14px);
  animation:cardIn .55s cubic-bezier(.16,1,.3,1) both;
  animation-delay:.1s;
}
@keyframes cardIn{from{opacity:0;transform:translateY(24px) scale(.97);}to{opacity:1;transform:none;}}

/* ── Left panel ── */
.lx-left{
  flex:0 0 330px;padding:44px 36px;
  background:linear-gradient(160deg,rgba(136,0,255,.09) 0%,rgba(0,229,255,.02) 100%);
  border-right:1px solid var(--b);
  display:flex;flex-direction:column;position:relative;overflow:hidden;
}
.lx-left::before{
  content:'';position:absolute;top:-80px;left:-80px;
  width:240px;height:240px;
  background:radial-gradient(circle,rgba(136,0,255,.22),transparent 70%);
  pointer-events:none;animation:lbDrift 8s ease-in-out infinite alternate;
}
.lx-left::after{
  content:'';position:absolute;bottom:-50px;right:-50px;
  width:180px;height:180px;
  background:radial-gradient(circle,rgba(0,229,255,.1),transparent 70%);
  pointer-events:none;animation:lbDrift2 10s ease-in-out infinite alternate;
}
@keyframes lbDrift{from{transform:translate(0,0);}to{transform:translate(20px,15px);}}
@keyframes lbDrift2{from{transform:translate(0,0);}to{transform:translate(-15px,-10px);}}

/* hex accent ring on left */
.lx-hex{
  position:absolute;bottom:60px;right:-30px;
  width:180px;height:180px;border-radius:50%;
  border:1px solid rgba(0,229,255,.06);
  pointer-events:none;
}
.lx-hex::before{
  content:'';position:absolute;inset:20px;border-radius:50%;
  border:1px solid rgba(136,0,255,.07);
  animation:hexS 5s ease-in-out infinite;
}
.lx-hex::after{
  content:'';position:absolute;inset:40px;border-radius:50%;
  border:1px solid rgba(0,229,255,.05);
  animation:hexS 5s ease-in-out infinite reverse;animation-delay:.5s;
}
@keyframes hexS{0%,100%{transform:scale(1);opacity:.6;}50%{transform:scale(1.05);opacity:1;}}

.lx-brand{position:relative;z-index:1;margin-bottom:28px;}
.lx-logo-wrap{
  width:68px;height:68px;border-radius:16px;overflow:hidden;
  border:1.5px solid rgba(0,229,255,.18);margin-bottom:18px;
  background:rgba(0,229,255,.04);
  box-shadow:0 0 24px rgba(0,229,255,.08);
}
.lx-logo-wrap img{width:100%;height:100%;object-fit:cover;}
.lx-brand-name{
  font-family:'Orbitron',sans-serif;font-size:24px;font-weight:900;letter-spacing:3px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  line-height:1;margin-bottom:5px;
}
.lx-brand-tag{font-size:9px;color:var(--text2);letter-spacing:3px;text-transform:uppercase;}

.lx-desc{
  position:relative;z-index:1;
  font-size:11.5px;color:var(--text2);line-height:1.8;margin-bottom:24px;
}

/* Feature list */
.lx-features{position:relative;z-index:1;display:flex;flex-direction:column;gap:1px;margin-bottom:auto;}
.lx-feat{
  display:flex;align-items:center;gap:10px;
  padding:8px 10px;border-radius:8px;
  font-size:10.5px;color:var(--text2);
  transition:.2s;
}
.lx-feat:hover{background:rgba(0,229,255,.04);color:var(--text);}
.lx-feat-ic{
  width:24px;height:24px;border-radius:6px;flex-shrink:0;
  background:rgba(0,229,255,.07);border:1px solid rgba(0,229,255,.12);
  display:flex;align-items:center;justify-content:center;
}
.lx-feat-ic svg{width:11px;height:11px;stroke:var(--cyan);fill:none;stroke-width:2;}

/* Online badge */
.lx-online{
  position:relative;z-index:1;margin-top:24px;
  display:inline-flex;align-items:center;gap:7px;
  padding:6px 14px;border-radius:20px;
  background:rgba(0,255,170,.05);border:1px solid rgba(0,255,170,.18);
  font-size:9px;color:var(--green);letter-spacing:1px;text-transform:uppercase;width:fit-content;
}
.lx-online-dot{
  width:7px;height:7px;border-radius:50%;background:var(--green);
  box-shadow:0 0 8px rgba(0,255,170,.5);
  animation:olDot 1.8s ease-in-out infinite;
}
@keyframes olDot{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.3;transform:scale(.6);}}

/* ── Right panel ── */
.lx-right{flex:1;padding:44px 42px;display:flex;flex-direction:column;min-width:0;}

.lx-right-hdr{margin-bottom:30px;}
.lx-rtitle{
  font-family:'Orbitron',sans-serif;font-size:15px;font-weight:700;
  color:#fff;margin-bottom:6px;letter-spacing:.5px;
}
.lx-rsub{font-size:11px;color:var(--text2);line-height:1.65;}

/* ── Step indicator ── */
.lx-steps{display:flex;align-items:center;gap:0;margin-bottom:28px;}
.lx-step{display:flex;align-items:center;gap:8px;}
.lx-step-num{
  width:32px;height:32px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-family:'Orbitron',sans-serif;font-size:10px;font-weight:700;
  border:1.5px solid var(--b);color:var(--dim);background:rgba(0,229,255,.02);
  transition:all .35s cubic-bezier(.22,.68,0,1.2);flex-shrink:0;
}
.lx-step-num.active{
  border-color:var(--cyan);color:var(--cyan);
  background:rgba(0,229,255,.08);
  box-shadow:0 0 16px rgba(0,229,255,.18),0 0 0 3px rgba(0,229,255,.06);
}
.lx-step-num.done{
  border-color:var(--green);color:var(--green);
  background:rgba(0,255,170,.07);
  box-shadow:0 0 10px rgba(0,255,170,.12);
}
.lx-step-label{font-size:10px;color:var(--dim);transition:.3s;white-space:nowrap;}
.lx-step-label.active{color:var(--text);}
.lx-step-conn{
  flex:1;height:1.5px;margin:0 10px;
  background:var(--dim2);border-radius:2px;
  transition:background .4s ease;overflow:hidden;position:relative;
}
.lx-step-conn.done::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(90deg,var(--green),rgba(0,255,170,.4));
  animation:connFill .5s ease both;
}
@keyframes connFill{from{transform:scaleX(0);transform-origin:left;}to{transform:scaleX(1);transform-origin:left;}}

/* ── Panels ── */
#panelGoogle,#panelRoblox{flex:1;display:flex;flex-direction:column;gap:0;}
.panel-body{flex:1;display:flex;flex-direction:column;gap:10px;}

/* ── Info cards ── */
.lx-info{
  padding:13px 15px;border-radius:10px;
  background:rgba(0,229,255,.03);border:1px solid rgba(0,229,255,.1);
  font-size:10.5px;color:var(--text2);line-height:1.75;
}
.lx-info strong{color:var(--cyan);}
.lx-info.danger{background:rgba(255,45,107,.04);border-color:rgba(255,45,107,.18);}
.lx-info.danger strong{color:var(--pink);}
.lx-info-label{
  display:flex;align-items:center;gap:6px;font-size:9px;
  text-transform:uppercase;letter-spacing:1.5px;font-weight:600;margin-bottom:5px;
}
.lx-info-label svg{width:10px;height:10px;flex-shrink:0;}

/* ── Lockout card ── */
.lx-lockout{
  display:none;padding:14px 16px;border-radius:10px;
  background:rgba(255,45,107,.06);border:1px solid rgba(255,45,107,.3);
  font-size:10.5px;color:var(--pink);line-height:1.7;text-align:center;
}
.lx-lockout.show{display:block;}
.lx-lockout-timer{
  font-family:'Orbitron',sans-serif;font-size:22px;font-weight:700;
  margin-top:6px;letter-spacing:2px;
  text-shadow:0 0 20px rgba(255,45,107,.4);
}

/* ── Google preview / bar ── */
.lx-gpreview{
  display:none;padding:14px;border-radius:10px;
  background:rgba(0,255,170,.04);border:1px solid rgba(0,255,170,.15);
  flex-direction:row;align-items:center;gap:12px;
}
.lx-gpreview.show{display:flex;}
.lx-gav{
  width:46px;height:46px;border-radius:50%;object-fit:cover;flex-shrink:0;
  border:2px solid rgba(0,255,170,.25);
  box-shadow:0 0 14px rgba(0,255,170,.1);
}
.lx-ginfo{flex:1;min-width:0;}
.lx-gname{font-size:12.5px;color:#fff;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lx-gemail{font-size:10px;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lx-gverified{
  display:inline-flex;align-items:center;gap:4px;
  font-size:8.5px;color:var(--green);margin-top:5px;
  padding:2px 8px;border-radius:10px;
  background:rgba(0,255,170,.07);border:1px solid rgba(0,255,170,.15);width:fit-content;
}
.lx-gverified svg{width:9px;height:9px;stroke:var(--green);fill:none;stroke-width:2.5;}

.lx-gbar{
  display:flex;align-items:center;gap:10px;padding:10px 13px;
  background:rgba(0,255,170,.04);border:1px solid rgba(0,255,170,.13);border-radius:10px;
}
.lx-gbar-av{
  width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;
  border:1.5px solid rgba(0,255,170,.3);
}
.lx-gbar-name{flex:1;font-size:11px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lx-gbar-badge{
  display:flex;align-items:center;gap:4px;
  font-size:8.5px;color:var(--green);flex-shrink:0;
}
.lx-gbar-badge svg{width:9px;height:9px;stroke:var(--green);fill:none;stroke-width:2.5;}

/* ── Required row ── */
.lx-req-badge{
  display:inline-flex;align-items:center;gap:6px;
  padding:4px 11px;border-radius:20px;
  background:rgba(255,45,107,.08);border:1px solid rgba(255,45,107,.25);
  font-size:9px;color:var(--pink);font-weight:700;letter-spacing:1px;text-transform:uppercase;
}
.lx-req-badge svg{width:9px;height:9px;stroke:var(--pink);fill:none;stroke-width:2;}

/* ── Error ── */
.lx-err{
  display:none;color:var(--pink);font-size:10.5px;padding:11px 13px;
  background:rgba(255,45,107,.06);border-radius:8px;
  border:1px solid rgba(255,45,107,.2);line-height:1.6;
  animation:errIn .2s ease;
}
.lx-err.show{display:block;}
@keyframes errIn{from{opacity:0;transform:translateX(-4px);}to{opacity:1;transform:none;}}

/* ── Loading inline ── */
.lx-ld{display:none;align-items:center;gap:8px;color:var(--text2);font-size:10px;}
.lx-ld.show{display:flex;}
.lx-spin{
  width:14px;height:14px;border-radius:50%;flex-shrink:0;
  border:2px solid rgba(0,229,255,.1);border-top-color:var(--cyan);
  animation:spin .7s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── Buttons ── */
.btn-google{
  width:100%;background:#ffffff;color:#3c4043;
  border:1px solid rgba(255,255,255,.1);border-radius:var(--r);
  padding:13px 18px;font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:500;
  cursor:pointer;display:flex;align-items:center;justify-content:center;gap:11px;
  transition:all .2s ease;position:relative;overflow:hidden;
  box-shadow:0 2px 12px rgba(0,0,0,.2);
}
.btn-google::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(120deg,transparent 40%,rgba(255,255,255,.1) 50%,transparent 60%);
  transform:translateX(-100%);transition:transform .45s ease;
}
.btn-google:hover::after{transform:translateX(100%);}
.btn-google:hover{background:#f1f3f4;box-shadow:0 4px 20px rgba(0,0,0,.25);transform:translateY(-1px);}
.btn-google:active{transform:translateY(0) scale(.99);}
.btn-google:disabled{opacity:.45;cursor:not-allowed;transform:none!important;}

.btn-roblox{
  width:100%;border:none;border-radius:var(--r);
  padding:14px 18px;font-family:'Orbitron',sans-serif;font-size:10px;font-weight:900;
  cursor:pointer;letter-spacing:.7px;text-transform:uppercase;
  display:flex;align-items:center;justify-content:center;gap:11px;
  background:linear-gradient(135deg,#e03131 0%,#c0392b 100%);color:#fff;
  box-shadow:0 4px 20px rgba(192,57,43,.3),0 0 0 1px rgba(255,80,60,.15);
  transition:all .2s ease;position:relative;overflow:hidden;
}
.btn-roblox::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(120deg,transparent 40%,rgba(255,255,255,.08) 50%,transparent 60%);
  transform:translateX(-100%);transition:transform .45s ease;
}
.btn-roblox:hover::after{transform:translateX(100%);}
.btn-roblox:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(192,57,43,.4),0 0 0 1px rgba(255,80,60,.2);}
.btn-roblox:active{transform:translateY(0) scale(.99);}
.btn-roblox:disabled{opacity:.4;cursor:not-allowed;transform:none!important;}
.btn-roblox img{width:16px;height:16px;object-fit:contain;flex-shrink:0;}

.btn-change{
  background:none;border:1px solid var(--b);border-radius:6px;
  color:var(--text2);font-size:9px;padding:4px 10px;cursor:pointer;
  font-family:'JetBrains Mono',monospace;transition:.15s;flex-shrink:0;
}
.btn-change:hover{color:var(--cyan);border-color:rgba(0,229,255,.3);background:rgba(0,229,255,.04);}

/* ── Divider ── */
.lx-div{
  display:flex;align-items:center;gap:12px;
  font-size:9px;color:var(--dim);margin:4px 0;
}
.lx-div::before,.lx-div::after{content:'';flex:1;height:1px;background:var(--b);}

/* ── Footer ── */
.lx-footer{
  margin-top:auto;padding-top:16px;
  font-size:9.5px;color:var(--dim);line-height:1.8;text-align:center;
  border-top:1px solid var(--dim2);
}
.lx-footer a{color:var(--cyan);text-decoration:none;transition:.15s;}
.lx-footer a:hover{opacity:.75;}

/* ── Loading overlay ── */
.lx-overlay{
  position:fixed;inset:0;
  background:rgba(3,3,18,.97);z-index:9999;
  display:none;flex-direction:column;align-items:center;justify-content:center;gap:20px;
  backdrop-filter:blur(10px);
}
.lx-overlay.show{display:flex;}
.lx-ov-logo{
  font-family:'Orbitron',sans-serif;font-size:26px;font-weight:900;letter-spacing:3px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.lx-ov-ring{
  width:52px;height:52px;border-radius:50%;
  border:3px solid rgba(0,229,255,.08);
  border-top-color:var(--cyan);border-right-color:rgba(0,229,255,.3);
  animation:spin .85s linear infinite;
}
.lx-ov-bar{
  width:220px;height:2px;background:rgba(0,229,255,.08);border-radius:2px;overflow:hidden;
}
.lx-ov-bar-inner{
  height:100%;background:linear-gradient(90deg,var(--cyan),var(--purple));
  border-radius:2px;animation:prog 2.2s ease infinite;
}
@keyframes prog{
  0%{width:0%;margin-left:0;}
  50%{width:65%;margin-left:0;}
  100%{width:0%;margin-left:100%;}
}
.lx-ov-text{font-size:11px;color:var(--text2);letter-spacing:.5px;}

/* ── Honeypot ── */
.hp-trap{position:absolute;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;pointer-events:none;visibility:hidden;}

/* ── Responsive ── */
@media(max-width:680px){
  .lx-card{flex-direction:column;border-radius:16px;}
  .lx-left{flex:none;padding:28px 24px 20px;border-right:none;border-bottom:1px solid var(--b);}
  .lx-features{display:none;}
  .lx-right{padding:28px 24px;}
  .lx-hex{display:none;}
}
@media(max-width:420px){
  .lx-page{padding:56px 12px 16px;}
  .lx-right{padding:22px 18px;}
  .lx-left{padding:22px 18px 16px;}
  .lx-brand-name{font-size:20px;}
}
`;

/* ─── Features list ─── */
const FEATURES = [
  { icon: <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>, label: 'AI-powered Lua code generation' },
  { icon: <><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></>, label: 'Direct Studio plugin injection' },
  { icon: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>, label: 'DataStore & system design' },
  { icon: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></>, label: 'GUI builder & UI editor' },
  { icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>, label: 'Anti-exploit best practices' },
];

/* ─── Component ─── */
export default function LoginPage() {
  const pageLoadTime = useRef(Date.now());
  const interacted = useRef(false);
  const lockoutInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const googleClientId = useRef('');
  const robloxClientId = useRef('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* Matrix rain */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const chars = '01アイウエオカキクケコサシスセソABCDEF{}[]();=><-+';
    const fs = 11;
    let cols = Math.floor(canvas.width / fs);
    const drops: number[] = Array(cols).fill(1);
    const draw = () => {
      ctx.fillStyle = 'rgba(3,3,18,.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fs}px 'JetBrains Mono',monospace`;
      cols = Math.floor(canvas.width / fs);
      while (drops.length < cols) drops.push(1);
      for (let i = 0; i < cols; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = `rgba(0,229,255,${0.03 + Math.random() * 0.06})`;
        ctx.fillText(ch, i * fs, drops[i] * fs);
        if (drops[i] * fs > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };
    const id = setInterval(draw, 60);
    return () => { clearInterval(id); window.removeEventListener('resize', resize); };
  }, []);

  useEffect(() => {
    const setInteracted = () => { interacted.current = true; };
    document.addEventListener('mousemove', setInteracted, { once: true, passive: true });
    document.addEventListener('touchstart', setInteracted, { once: true, passive: true });
    document.addEventListener('keydown', setInteracted, { once: true, passive: true });

    const container = document.getElementById('lxParticles');
    if (container) {
      const palette = ['0,229,255', '136,0,255', '255,45,107', '0,255,170'];
      for (let i = 0; i < 22; i++) {
        const el = document.createElement('div');
        el.className = 'lp';
        const sz = Math.random() * 3 + 1.2;
        const clr = palette[Math.floor(Math.random() * palette.length)];
        el.style.cssText =
          `width:${sz}px;height:${sz}px;left:${Math.random() * 100}%;` +
          `background:rgba(${clr},${Math.random() * .3 + .08});` +
          `box-shadow:0 0 6px rgba(${clr},.4);` +
          `animation-duration:${Math.random() * 14 + 8}s;animation-delay:${Math.random() * 14}s;`;
        container.appendChild(el);
      }
    }

    loadConfig().then(() => {
      if (isRateLimited()) startLockoutCountdown();
      handleParams();
    });

    return () => { if (lockoutInterval.current) clearInterval(lockoutInterval.current); };
  }, []);

  /* ── Auth helpers (unchanged logic) ── */
  async function loadConfig() {
    try {
      const r = await fetch('/api/main', { credentials: 'same-origin' });
      if (r.ok) {
        const d = await r.json();
        googleClientId.current = d.gmail_key || '';
        robloxClientId.current = d.roblox_client_id || '';
      }
    } catch { }
  }

  function startLockoutCountdown() {
    const card = document.getElementById('lockoutCard');
    const timer = document.getElementById('lockoutTimer');
    const btn = document.getElementById('googleSignInBtn') as HTMLButtonElement | null;
    card?.classList.add('show');
    if (btn) btn.disabled = true;
    if (lockoutInterval.current) clearInterval(lockoutInterval.current);
    lockoutInterval.current = setInterval(() => {
      const ms = getRemainingLockoutMs();
      if (ms <= 0) {
        clearInterval(lockoutInterval.current!);
        card?.classList.remove('show');
        if (btn) btn.disabled = false;
        if (timer) timer.textContent = '';
      } else {
        const sec = Math.ceil(ms / 1000);
        const m = Math.floor(sec / 60), s = sec % 60;
        if (timer) timer.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
      }
    }, 500);
  }

  function honeypotFilled() {
    const u = document.getElementById('hp_username') as HTMLInputElement | null;
    const e = document.getElementById('hp_email') as HTMLInputElement | null;
    const p = document.getElementById('hp_password') as HTMLInputElement | null;
    return !!(u?.value || e?.value || p?.value);
  }
  function tooFast() { return (Date.now() - pageLoadTime.current < 800) && !interacted.current; }

  function showPanel(id: 'google' | 'roblox') {
    const pg = document.getElementById('panelGoogle');
    const pr = document.getElementById('panelRoblox');
    if (pg) pg.style.display = id === 'google' ? 'flex' : 'none';
    if (pr) pr.style.display = id === 'roblox' ? 'flex' : 'none';
    setStep(id === 'google' ? 1 : 2);
  }

  function setStep(step: number) {
    const s1 = document.getElementById('step1Dot')!;
    const s2 = document.getElementById('step2Dot')!;
    const st1 = document.getElementById('step1Txt')!;
    const st2 = document.getElementById('step2Txt')!;
    const sl = document.getElementById('stepLine1')!;
    const rt = document.getElementById('rightTitle');
    const rs = document.getElementById('rightSub');
    if (step === 1) {
      s1.className = 'lx-step-num active'; s1.textContent = '1';
      s2.className = 'lx-step-num';
      st1.className = 'lx-step-label active'; st2.className = 'lx-step-label';
      sl.className = 'lx-step-conn';
      if (rt) rt.textContent = 'Sign in to NEXUS AI';
      if (rs) rs.textContent = 'Step 1 of 2 — Verify with Google';
    } else {
      s1.className = 'lx-step-num done'; s1.textContent = '✓';
      s2.className = 'lx-step-num active';
      st1.className = 'lx-step-label'; st2.className = 'lx-step-label active';
      sl.className = 'lx-step-conn done';
      if (rt) rt.textContent = 'Connect Roblox';
      if (rs) rs.textContent = 'Step 2 of 2 — Link your Roblox account';
    }
  }

  function showErr(id: string, msg: string) {
    const e = document.getElementById(id);
    if (e) { e.textContent = msg; e.classList.add('show'); }
  }

  function showRobloxPanel(gUser: Record<string, string>) {
    const av = document.getElementById('googleSmallAv') as HTMLImageElement | null;
    const nm = document.getElementById('googleSmallName');
    if (av) av.src = gUser.picture || '';
    if (nm) nm.textContent = gUser.name || gUser.email || '';
    showPanel('roblox');
  }

  function logoutGoogle() {
    try { localStorage.removeItem(GOOGLE_TMP_KEY); } catch { }
    document.getElementById('googleErr')?.classList.remove('show');
    const btn = document.getElementById('googleSignInBtn') as HTMLButtonElement | null;
    if (btn) btn.disabled = false;
    document.getElementById('googleLd')?.classList.remove('show');
    document.getElementById('googlePreview')?.classList.remove('show');
    if (isRateLimited()) startLockoutCountdown();
    showPanel('google');
  }

  function googleSignIn() {
    if (honeypotFilled()) { recordAttempt(); return; }
    if (tooFast()) { recordAttempt(); return; }
    if (isRateLimited()) { startLockoutCountdown(); return; }
    document.getElementById('googleErr')?.classList.remove('show');
    if (!googleClientId.current) { showErr('googleErr', 'Google Client ID not configured. Please contact the administrator.'); return; }
    recordAttempt();
    document.getElementById('googleLd')?.classList.add('show');
    const btn = document.getElementById('googleSignInBtn') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    const stateToken = generateStateToken();
    saveState(stateToken, 'google');
    const redirectUri = encodeURIComponent(window.location.origin + '/api/google-callback');
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(googleClientId.current)}&response_type=code&redirect_uri=${redirectUri}&scope=${encodeURIComponent('openid email profile')}&state=${encodeURIComponent(stateToken)}&access_type=offline&prompt=select_account`;
  }

  function startRobloxOAuth() {
    document.getElementById('robloxErr')?.classList.remove('show');
    if (!robloxClientId.current) { showErr('robloxErr', 'Roblox Client ID not configured. Please contact the administrator.'); return; }
    const btn = document.getElementById('robloxLoginBtn') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    document.getElementById('robloxLd')?.classList.add('show');
    const lang = localStorage.getItem('nexus_lang') || 'en';
    const stateToken = generateStateToken();
    saveState(stateToken, 'roblox');
    const redirectUri = encodeURIComponent(window.location.origin + '/api/auth');
    window.location.href = `https://authorize.roblox.com/?client_id=${robloxClientId.current}&response_type=code&redirect_uri=${redirectUri}&scope=${encodeURIComponent('openid profile')}&state=${encodeURIComponent(lang + '_' + stateToken)}`;
  }

  async function loadUserDataFromServer(robloxUsername: string) {
    try {
      const r = await fetch(`/api/sync?user=${encodeURIComponent(robloxUsername.toLowerCase())}`, { credentials: 'same-origin' });
      if (r.ok) { const d = await r.json(); if (d?.credits !== undefined) return d; }
    } catch { }
    return null;
  }

  async function finishLogin(gUser: Record<string, string>, robloxUser: Record<string, string>) {
    if (!robloxUser?.username) { showPanel('roblox'); showErr('robloxErr', 'Roblox login is required. Please connect your Roblox account.'); return; }
    const ov = document.getElementById('loadingOverlay');
    const lt = document.getElementById('loadingText');
    ov?.classList.add('show');
    if (lt) lt.textContent = `Loading account for @${robloxUser.username}...`;
    const username = robloxUser.username;
    const isOwner = OWNER_USERS.includes(username) || OWNER_USERS.includes(username.toLowerCase());
    const serverData = await loadUserDataFromServer(username);
    if (lt) lt.textContent = 'Setting up your session...';
    const userData = serverData || {
      credits: isOwner ? 999999 : 30, convs: [], plan: 'free', lastClaim: null,
      draftText: {}, draftAttach: {},
      model: { id: 'gemini-2.5-flash-lite', provider: 'gemini', cost: 0, label: 'Gemini 2.5 Flash Lite' },
      language: 'en', roles: isOwner ? ['owner'] : [], loginMethod: 'roblox',
      robloxId: robloxUser.id, googleEmail: gUser.email || '', createdAt: Date.now(),
    };
    userData.avatar = robloxUser.avatar || gUser.picture || userData.avatar || '';
    userData.googleEmail = gUser.email || userData.googleEmail || '';
    userData.robloxId = robloxUser.id || userData.robloxId;
    userData.loginMethod = 'roblox';
    userData.lastSeen = Date.now();
    if (!userData.createdAt) userData.createdAt = Date.now();
    const session: Record<string, unknown> = {
      user: { id: robloxUser.id, username, displayName: robloxUser.displayName || username, avatar: userData.avatar, email: gUser.email || '', robloxId: robloxUser.id, canInject: true },
      data: userData, loginTime: Date.now(), version: 2,
    };
    session._guard = buildIntegrity(session);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    try { localStorage.removeItem(GOOGLE_TMP_KEY); } catch { }
    try { localStorage.removeItem(RL_KEY); } catch { }
    try {
      await fetch('/api/sync', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: username.toLowerCase(), data: userData }) });
    } catch { }
    if (lt) lt.textContent = 'Success! Redirecting...';
    let dest = '/dashboard';
    try {
      const saved = sessionStorage.getItem('nexus_redirect');
      if (saved && saved.startsWith('/') && saved !== '/login') { dest = saved; sessionStorage.removeItem('nexus_redirect'); }
    } catch { }
    setTimeout(() => window.location.replace(dest), 700);
  }

  function handleParams() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.user?.username && s.user.robloxId && s.loginTime && (Date.now() - s.loginTime) < MAX_AGE_MS) {
          if (!s._guard || s._guard === buildIntegrity(s)) { window.location.replace('/dashboard'); return; }
          localStorage.removeItem(SESSION_KEY);
        } else { localStorage.removeItem(SESSION_KEY); }
      }
    } catch { try { localStorage.removeItem(SESSION_KEY); } catch { } }

    const params = new URLSearchParams(window.location.search);

    const gup = params.get('google_user');
    if (gup) {
      window.history.replaceState({}, '', '/login');
      try {
        const gUser = JSON.parse(safeBase64Decode(decodeURIComponent(gup)));
        if (!gUser?.id) throw new Error('Invalid Google data');
        gUser.id = String(gUser.id).replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
        gUser.email = String(gUser.email || '').slice(0, 256);
        gUser.name = String(gUser.name || '').slice(0, 100);
        gUser.picture = String(gUser.picture || '').slice(0, 512);
        localStorage.setItem(GOOGLE_TMP_KEY, JSON.stringify(gUser));
        const avImg = document.getElementById('googleAvImg') as HTMLImageElement | null;
        if (avImg) avImg.src = gUser.picture || '';
        const nmEl = document.getElementById('googleName');
        if (nmEl) nmEl.textContent = gUser.name || gUser.email || '';
        const emEl = document.getElementById('googleEmail');
        if (emEl) emEl.textContent = gUser.email || '';
        document.getElementById('googlePreview')?.classList.add('show');
        showRobloxPanel(gUser);
      } catch (e: unknown) { showErr('googleErr', `Failed to process Google data: ${(e as Error).message}`); showPanel('google'); }
      return;
    }

    const gep = params.get('google_error');
    if (gep) {
      window.history.replaceState({}, '', '/login');
      const errorMessages: Record<string, string> = {
        redirect_uri_mismatch: 'Konfigurasi server bermasalah. Hubungi admin.',
        token_failed: 'Login Google gagal. Coba lagi.',
        rate_limited: 'Terlalu banyak percobaan. Tunggu beberapa menit.',
        server_error: 'Server error. Coba lagi nanti.',
        server_config: 'Server belum dikonfigurasi. Hubungi admin.',
      };
      showErr('googleErr', errorMessages[decodeURIComponent(gep)] || `Google sign-in failed: ${decodeURIComponent(gep)}`);
      showPanel('google');
      return;
    }

    const rup = params.get('roblox_user');
    if (rup) {
      window.history.replaceState({}, '', '/login');
      (async () => {
        try {
          const rUser = JSON.parse(safeBase64Decode(decodeURIComponent(rup)));
          if (!rUser?.id) throw new Error('Invalid Roblox data');
          rUser.id = String(rUser.id).replace(/[^0-9]/g, '').slice(0, 20);
          rUser.username = String(rUser.username || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 50);
          rUser.displayName = String(rUser.displayName || '').slice(0, 100);
          rUser.avatar = String(rUser.avatar || '').slice(0, 512);
          let gTmp = null;
          try { gTmp = JSON.parse(localStorage.getItem(GOOGLE_TMP_KEY) || 'null'); } catch { }
          if (!gTmp) { showPanel('google'); showErr('googleErr', 'Google session expired. Please sign in with Google first.'); return; }
          await finishLogin(gTmp, rUser);
        } catch (e: unknown) { showPanel('google'); showErr('googleErr', `Roblox login failed: ${(e as Error).message}`); }
      })();
      return;
    }

    const rep = params.get('roblox_error');
    if (rep) {
      window.history.replaceState({}, '', '/login');
      let gTmp2 = null;
      try { gTmp2 = JSON.parse(localStorage.getItem(GOOGLE_TMP_KEY) || 'null'); } catch { }
      if (gTmp2) { showRobloxPanel(gTmp2); showErr('robloxErr', `Roblox login failed: ${decodeURIComponent(rep)}. Please try again.`); }
      else { showPanel('google'); showErr('googleErr', `Roblox login failed: ${decodeURIComponent(rep)}`); }
      return;
    }

    showPanel('google');
  }

  /* ── Render ── */
  return (
    <>
      <style>{CSS}</style>

      {/* Background */}
      <canvas ref={canvasRef} className="lx-canvas" />
      <div className="lx-grid" />
      <div className="lx-grad" />
      <div className="lx-scanlines" />
      <div className="lx-vignette" />
      <div className="lx-particles" id="lxParticles" />

      {/* Loading overlay */}
      <div className="lx-overlay" id="loadingOverlay">
        <div className="lx-ov-logo">NEXUS AI</div>
        <div className="lx-ov-ring" />
        <div className="lx-ov-bar"><div className="lx-ov-bar-inner" /></div>
        <div className="lx-ov-text" id="loadingText">Completing login...</div>
      </div>

      {/* Honeypot */}
      <div className="hp-trap" aria-hidden="true">
        <input type="text" name="username" id="hp_username" tabIndex={-1} autoComplete="off" />
        <input type="email" name="email" id="hp_email" tabIndex={-1} autoComplete="off" />
        <input type="password" name="password" id="hp_password" tabIndex={-1} autoComplete="off" />
      </div>

      {/* Topbar */}
      <div className="lx-topbar">
        <div className="tb-logo">
          <img
            src="/images/nexusai.png" alt="N" width={26} height={26}
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
          />
        </div>
        <span className="tb-name">NEXUS AI</span>
        <div className="tb-div" />
        <span className="tb-sub">Roblox Dev Intelligence</span>
        <div className="tb-right">
          <div className="tb-secure">
            <div className="tb-secure-dot" />
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0}}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Secure
          </div>
        </div>
      </div>

      {/* Page */}
      <div className="lx-page">
        <div className="lx-card">

          {/* ── Left ── */}
          <div className="lx-left">
            <div className="lx-hex" />
            <div className="lx-brand">
              <div className="lx-logo-wrap">
                <img src="/images/nexusai.png" alt="NEXUS"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '.15'; }} />
              </div>
              <div className="lx-brand-name">NEXUS AI</div>
              <div className="lx-brand-tag">Roblox Dev Intelligence</div>
            </div>

            <div className="lx-desc">
              Your smart Roblox Studio assistant. Write Lua, debug scripts, build GUIs — and inject directly into Studio.
            </div>

            <div className="lx-features">
              {FEATURES.map((f, i) => (
                <div className="lx-feat" key={i}>
                  <div className="lx-feat-ic">
                    <svg viewBox="0 0 24 24">{f.icon}</svg>
                  </div>
                  <span>{f.label}</span>
                </div>
              ))}
            </div>

            <div className="lx-online">
              <div className="lx-online-dot" />
              System Online
            </div>
          </div>

          {/* ── Right ── */}
          <div className="lx-right">
            <div className="lx-right-hdr">
              <div className="lx-rtitle" id="rightTitle">Sign in to NEXUS AI</div>
              <div className="lx-rsub" id="rightSub">Connect your accounts to get started</div>
            </div>

            {/* Step indicator */}
            <div className="lx-steps">
              <div className="lx-step">
                <div className="lx-step-num active" id="step1Dot">1</div>
                <span className="lx-step-label active" id="step1Txt">Google</span>
              </div>
              <div className="lx-step-conn" id="stepLine1" />
              <div className="lx-step" style={{ justifyContent: 'flex-end' }}>
                <span className="lx-step-label" id="step2Txt" style={{ textAlign: 'right' }}>Roblox</span>
                <div className="lx-step-num" id="step2Dot">2</div>
              </div>
            </div>

            {/* ── Panel Google ── */}
            <div id="panelGoogle">
              <div className="panel-body">
                <div className="lx-lockout" id="lockoutCard">
                  <strong>Too many login attempts.</strong><br />
                  Please wait before trying again.
                  <div className="lx-lockout-timer" id="lockoutTimer">—</div>
                </div>

                <div className="lx-info">
                  <div className="lx-info-label" style={{ color: 'var(--cyan)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    Step 1 of 2 — Google Verification
                  </div>
                  We use Google to verify your identity. Your email is kept private and never shared.
                </div>

                <div className="lx-gpreview" id="googlePreview">
                  <img className="lx-gav" id="googleAvImg" src="" alt=""
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = '.2'; }} />
                  <div className="lx-ginfo">
                    <div className="lx-gname" id="googleName">—</div>
                    <div className="lx-gemail" id="googleEmail">—</div>
                    <div className="lx-gverified">
                      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
                      Verified with Google
                    </div>
                  </div>
                </div>

                <div className="lx-err" id="googleErr" />
                <div className="lx-ld" id="googleLd">
                  <div className="lx-spin" />
                  <span>Connecting to Google...</span>
                </div>

                <button className="btn-google" id="googleSignInBtn" onClick={googleSignIn}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>

                <div className="lx-div">or</div>
                <div style={{ textAlign: 'center', fontSize: '10px', color: 'var(--dim)', lineHeight: 1.8 }}>
                  By signing in, you agree to our{' '}
                  <a href="/terms" target="_blank" style={{ color: 'var(--cyan)' }}>Terms of Service</a>
                  {' · '}
                  <a href="/privacy" target="_blank" style={{ color: 'var(--cyan)' }}>Privacy Policy</a>
                </div>
              </div>

              <div className="lx-footer">
                Need help? Join{' '}
                <a href="https://discord.gg/FzAF48mvK5" target="_blank">NEXUS STUDIO Discord</a>
                <br />
                Made by <span style={{ color: 'var(--cyan)' }}>NEXUS STUDIO</span>
              </div>
            </div>

            {/* ── Panel Roblox ── */}
            <div id="panelRoblox" style={{ display: 'none', flexDirection: 'column' }}>
              <div className="panel-body">
                <div className="lx-gbar">
                  <img className="lx-gbar-av" id="googleSmallAv" src=""
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = '.2'; }} />
                  <span className="lx-gbar-name" id="googleSmallName">—</span>
                  <div className="lx-gbar-badge">
                    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
                    Google OK
                  </div>
                  <button className="btn-change" onClick={logoutGoogle}>Change</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="lx-req-badge">
                    <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                    Roblox Required
                  </div>
                </div>

                <div className="lx-info danger">
                  <div className="lx-info-label" style={{ color: 'var(--pink)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    Step 2 of 2 — Roblox Account
                  </div>
                  A Roblox account is <strong>required</strong>. All your data — credits, chat history, settings — is stored to your Roblox account and synced across all devices.
                </div>

                <div className="lx-err" id="robloxErr" />
                <div className="lx-ld" id="robloxLd">
                  <div className="lx-spin" />
                  <span>Connecting to Roblox...</span>
                </div>

                <button className="btn-roblox" id="robloxLoginBtn" onClick={startRobloxOAuth}>
                  <img src="/images/roblox.png" alt=""
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  Connect Roblox Account
                </button>

                <div style={{ fontSize: '9.5px', color: 'var(--dim)', textAlign: 'center', lineHeight: 1.8 }}>
                  You will be redirected to the official Roblox login page.<br />
                  Your credentials are safe — we never store your password.
                </div>
              </div>

              <div className="lx-footer">
                Need help? Join{' '}
                <a href="https://discord.gg/FzAF48mvK5" target="_blank">NEXUS STUDIO Discord</a>
                <br />
                Made by <span style={{ color: 'var(--cyan)' }}>NEXUS STUDIO</span>
              </div>
            </div>

          </div>{/* lx-right */}
        </div>{/* lx-card */}
      </div>{/* lx-page */}
    </>
  );
}