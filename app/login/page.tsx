'use client';

import { useEffect, useRef } from 'react';

const OWNER_USERS = ['FIINYTID25', 'fiinytid25'];
const SESSION_KEY = 'nexus_session';
const GOOGLE_TMP_KEY = 'nexus_google_tmp';
const RL_KEY = 'nexus_rl';
const STATE_KEY = 'nexus_oauth_state';
const INTEGRITY_SALT = 'NEXUS_GUARD_v2';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };

function simpleHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16);
}

function buildIntegrity(session: Record<string, unknown>): string {
  const user = session.user as Record<string, unknown> || {};
  const raw = `${INTEGRITY_SALT}|${session.loginTime || ''}|${user.id || ''}|${user.username || ''}|${session.version || ''}`;
  return simpleHash(raw);
}

// FIX: Safe base64 decode untuk karakter unicode (nama/email non-ASCII)
function safeBase64Decode(b64: string): string {
  try {
    // Coba TextDecoder (lebih aman untuk UTF-8)
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    // Fallback: decodeURIComponent + escape (cara lama)
    return decodeURIComponent(escape(atob(b64)));
  }
}

function getRateData() {
  try { return JSON.parse(localStorage.getItem(RL_KEY) || '{"attempts":[],"locked":false}'); }
  catch { return { attempts: [], locked: false }; }
}
function saveRateData(d: unknown) { try { localStorage.setItem(RL_KEY, JSON.stringify(d)); } catch { } }

function recordAttempt() {
  const d = getRateData();
  const now = Date.now();
  d.attempts = d.attempts.filter((t: number) => now - t < RATE_LIMIT.windowMs);
  d.attempts.push(now);
  saveRateData(d);
  return d.attempts.length;
}

function isRateLimited() {
  const d = getRateData();
  const now = Date.now();
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

export default function LoginPage() {
  const pageLoadTime = useRef(Date.now());
  const interacted = useRef(false);
  const lockoutInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const googleClientId = useRef('');
  const robloxClientId = useRef('');

  useEffect(() => {
    const setInteracted = () => { interacted.current = true; };
    document.addEventListener('mousemove', setInteracted, { once: true, passive: true });
    document.addEventListener('touchstart', setInteracted, { once: true, passive: true });
    document.addEventListener('keydown', setInteracted, { once: true, passive: true });

    const container = document.getElementById('particles');
    if (container) {
      for (let i = 0; i < 20; i++) {
        const el = document.createElement('div');
        el.className = 'p';
        const sz = Math.random() * 3 + 1;
        el.style.cssText =
          `width:${sz}px;height:${sz}px;left:${Math.random() * 100}%;` +
          `background:rgba(${Math.random() > .5 ? '0,229,255' : '136,0,255'},${Math.random() * .35 + .08});` +
          `animation-duration:${Math.random() * 14 + 8}s;animation-delay:${Math.random() * 12}s;`;
        container.appendChild(el);
      }
    }

    loadConfig().then(() => {
      if (isRateLimited()) startLockoutCountdown();
      handleParams();
    });

    return () => {
      if (lockoutInterval.current) clearInterval(lockoutInterval.current);
    };
  }, []);

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

  function tooFast() {
    return (Date.now() - pageLoadTime.current < 800) && !interacted.current;
  }

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
      s1.className = 'step-num active'; s2.className = 'step-num';
      st1.className = 'step-txt active'; st2.className = 'step-txt';
      sl.className = 'step-connector';
      if (rt) rt.textContent = 'Sign in to NEXUS AI';
      if (rs) rs.textContent = 'Step 1 of 2 — Verify with Google';
    } else {
      s1.className = 'step-num done'; s1.textContent = '✓';
      s2.className = 'step-num active';
      st1.className = 'step-txt'; st2.className = 'step-txt active';
      sl.className = 'step-connector done';
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
    if (!googleClientId.current) {
      showErr('googleErr', 'Google Client ID not configured. Please contact the administrator.');
      return;
    }
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
    const errEl = document.getElementById('robloxErr');
    errEl?.classList.remove('show');
    if (!robloxClientId.current) {
      showErr('robloxErr', 'Roblox Client ID not configured. Please contact the administrator.');
      return;
    }
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
    if (!robloxUser?.username) {
      showPanel('roblox');
      showErr('robloxErr', 'Roblox login is required. Please connect your Roblox account.');
      return;
    }
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
        // FIX: Gunakan safeBase64Decode untuk mendukung karakter unicode
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
      // FIX: Tampilkan pesan error yang lebih ramah
      const errorMessages: Record<string, string> = {
        redirect_uri_mismatch: 'Konfigurasi server bermasalah. Hubungi admin.',
        token_failed: 'Login Google gagal. Coba lagi.',
        rate_limited: 'Terlalu banyak percobaan. Tunggu beberapa menit.',
        server_error: 'Server error. Coba lagi nanti.',
        server_config: 'Server belum dikonfigurasi. Hubungi admin.',
      };
      const msg = errorMessages[decodeURIComponent(gep)] || `Google sign-in failed: ${decodeURIComponent(gep)}`;
      showErr('googleErr', msg);
      showPanel('google');
      return;
    }

    const rup = params.get('roblox_user');
    if (rup) {
      window.history.replaceState({}, '', '/login');
      (async () => {
        try {
          // FIX: Gunakan safeBase64Decode juga untuk roblox user
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

  return (
    <>
      <style>{`
        :root{--bg:#030312;--bg2:#06071a;--bg3:#0a0b22;--cyan:#00e5ff;--purple:#8800ff;--pink:#ff2d6b;--green:#00ffaa;--yellow:#ffd600;--text:#b8cfff;--dim:#3a4a7a;--b:rgba(0,229,255,.12);--r:10px;}
        *{margin:0;padding:0;box-sizing:border-box;}
        html,body{height:100%;font-family:'JetBrains Mono',monospace;background:var(--bg);color:var(--text);font-size:13px;overflow-x:hidden;}
        body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(136,0,255,.22) 0%,transparent 55%),radial-gradient(ellipse at 100% 100%,rgba(0,229,255,.07) 0%,transparent 40%),radial-gradient(ellipse at 0% 60%,rgba(255,45,107,.04) 0%,transparent 35%);pointer-events:none;z-index:0;}
        body::after{content:'';position:fixed;inset:0;background:linear-gradient(rgba(0,229,255,.008) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.008) 1px,transparent 1px);background-size:44px 44px;pointer-events:none;z-index:0;}
        .particles{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden;}
        .p{position:absolute;border-radius:50%;pointer-events:none;animation:pfloat linear infinite;}
        @keyframes pfloat{0%{transform:translateY(100vh) scale(0);opacity:0}8%{opacity:1}92%{opacity:.5}100%{transform:translateY(-8vh) scale(1);opacity:0}}
        .page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;position:relative;z-index:1;}
        .login-wrap{display:flex;width:100%;max-width:860px;background:var(--bg2);border:1px solid var(--b);border-radius:20px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,229,255,.04),0 40px 80px rgba(0,0,0,.7),0 0 80px rgba(136,0,255,.08);animation:wrapIn .5s cubic-bezier(.16,1,.3,1);}
        @keyframes wrapIn{from{opacity:0;transform:translateY(20px) scale(.97)}to{opacity:1;transform:none}}
        .left-panel{flex:0 0 320px;padding:44px 36px;background:linear-gradient(160deg,rgba(136,0,255,.08) 0%,rgba(0,229,255,.03) 100%);border-right:1px solid var(--b);display:flex;flex-direction:column;gap:0;position:relative;overflow:hidden;}
        .left-panel::before{content:'';position:absolute;top:-60px;left:-60px;width:200px;height:200px;background:radial-gradient(circle,rgba(136,0,255,.2),transparent 70%);pointer-events:none;}
        .left-panel::after{content:'';position:absolute;bottom:-40px;right:-40px;width:160px;height:160px;background:radial-gradient(circle,rgba(0,229,255,.1),transparent 70%);pointer-events:none;}
        .brand-logo{font-family:'Orbitron',sans-serif;font-size:26px;font-weight:900;background:linear-gradient(135deg,var(--cyan),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:3px;margin-bottom:4px;}
        .brand-tag{font-size:9px;color:var(--dim);letter-spacing:3px;text-transform:uppercase;margin-bottom:24px;}
        .brand-icon-wrap{width:72px;height:72px;border-radius:16px;overflow:hidden;border:1.5px solid rgba(0,229,255,.2);margin-bottom:22px;background:rgba(0,229,255,.04);}
        .brand-icon-wrap img{width:100%;height:100%;object-fit:cover;}
        .brand-desc{font-size:11.5px;color:var(--text);line-height:1.75;margin-bottom:28px;flex:1;}
        .brand-feature{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:10.5px;color:var(--dim);}
        .brand-feature::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--cyan);flex-shrink:0;opacity:.6;}
        .online-indicator{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;margin-top:auto;background:rgba(0,255,170,.05);border:1px solid rgba(0,255,170,.18);font-size:9px;color:var(--green);}
        .online-dot{width:6px;height:6px;border-radius:50%;background:var(--green);animation:pd 1.8s infinite;}
        @keyframes pd{0%,100%{opacity:1}50%{opacity:.3}}
        .right-panel{flex:1;padding:44px 40px;display:flex;flex-direction:column;}
        .right-header{margin-bottom:28px;}
        .right-title{font-family:'Orbitron',sans-serif;font-size:16px;font-weight:700;color:#fff;margin-bottom:5px;}
        .right-sub{font-size:11px;color:var(--dim);line-height:1.6;}
        .step-indicator{display:flex;align-items:center;gap:0;margin-bottom:24px;}
        .step-item{display:flex;align-items:center;gap:7px;flex:1;}
        .step-num{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;border:1.5px solid var(--b);color:var(--dim);background:transparent;transition:.3s;flex-shrink:0;}
        .step-num.active{border-color:var(--cyan);color:var(--cyan);background:rgba(0,229,255,.07);box-shadow:0 0 12px rgba(0,229,255,.15);}
        .step-num.done{border-color:var(--green);color:var(--green);background:rgba(0,255,170,.07);}
        .step-txt{font-size:10px;color:var(--dim);transition:.3s;}
        .step-txt.active{color:var(--text);}
        .step-connector{height:1px;background:var(--b);flex:1;margin:0 8px;transition:.3s;}
        .step-connector.done{background:var(--green);}
        #panelGoogle,#panelRoblox{flex:1;display:flex;flex-direction:column;}
        .section-label{font-size:10.5px;color:var(--text);margin-bottom:12px;line-height:1.65;font-weight:500;}
        .info-card{padding:12px 14px;border-radius:8px;background:rgba(0,229,255,.03);border:1px solid rgba(0,229,255,.1);font-size:10.5px;color:var(--dim);line-height:1.7;margin-bottom:14px;}
        .info-card strong{color:var(--cyan);}
        .info-card.required{background:rgba(255,45,107,.04);border-color:rgba(255,45,107,.18);}
        .info-card.required strong{color:var(--pink);}
        .lockout-card{display:none;padding:13px 14px;border-radius:8px;background:rgba(255,45,107,.06);border:1px solid rgba(255,45,107,.3);font-size:10.5px;color:var(--pink);line-height:1.7;margin-bottom:14px;text-align:center;}
        .lockout-card.show{display:block;}
        .lockout-timer{font-family:'Orbitron',sans-serif;font-size:14px;font-weight:700;margin-top:4px;}
        .btn-google{width:100%;background:#fff;color:#3c4043;border:1px solid rgba(255,255,255,.15);border-radius:var(--r);padding:12px 16px;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;cursor:pointer;transition:.2s;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:10px;}
        .btn-google:hover{background:#f1f3f4;box-shadow:0 2px 12px rgba(0,0,0,.15);}
        .btn-google:disabled{opacity:.5;cursor:not-allowed;}
        .btn-roblox{width:100%;border:none;border-radius:var(--r);padding:13px 16px;font-family:'Orbitron',sans-serif;font-size:10px;font-weight:900;cursor:pointer;transition:.2s;letter-spacing:.5px;display:flex;align-items:center;justify-content:center;gap:10px;background:linear-gradient(135deg,#e03131,#c0392b);color:#fff;box-shadow:0 4px 15px rgba(192,57,43,.25);}
        .btn-roblox:hover{opacity:.9;transform:translateY(-1px);box-shadow:0 6px 20px rgba(192,57,43,.35);}
        .btn-roblox:disabled{opacity:.45;cursor:not-allowed;transform:none;}
        .btn-roblox img{width:16px;height:16px;object-fit:contain;flex-shrink:0;}
        .google-preview{display:none;padding:14px;background:rgba(0,255,170,.04);border:1px solid rgba(0,255,170,.18);border-radius:var(--r);margin-bottom:14px;flex-direction:row;align-items:center;gap:12px;}
        .google-preview.show{display:flex;}
        .google-av{width:44px;height:44px;border-radius:50%;border:2px solid rgba(0,255,170,.3);object-fit:cover;flex-shrink:0;}
        .google-info{flex:1;min-width:0;}
        .google-name{font-size:12px;color:#fff;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .google-email{font-size:10px;color:var(--dim);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .google-verified{font-size:9px;color:var(--green);margin-top:4px;display:flex;align-items:center;gap:4px;}
        .google-bar{display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:14px;background:rgba(0,255,170,.04);border:1px solid rgba(0,255,170,.15);border-radius:var(--r);}
        .google-bar-av{width:30px;height:30px;border-radius:50%;border:1.5px solid rgba(0,255,170,.35);flex-shrink:0;object-fit:cover;}
        .google-bar-name{flex:1;font-size:11px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .google-bar-badge{font-size:8px;color:var(--green);display:flex;align-items:center;gap:4px;flex-shrink:0;}
        .btn-change{background:none;border:1px solid var(--b);border-radius:5px;color:var(--dim);font-size:9px;padding:3px 9px;cursor:pointer;font-family:'JetBrains Mono',monospace;transition:.15s;flex-shrink:0;}
        .btn-change:hover{color:var(--cyan);border-color:rgba(0,229,255,.3);}
        .required-row{display:flex;align-items:center;gap:6px;margin-bottom:12px;}
        .required-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:10px;background:rgba(255,45,107,.08);border:1px solid rgba(255,45,107,.25);font-size:9px;color:var(--pink);font-weight:700;letter-spacing:.5px;}
        .err{display:none;color:var(--pink);font-size:10.5px;padding:9px 12px;background:rgba(255,45,107,.06);border-radius:6px;border:1px solid rgba(255,45,107,.18);margin-bottom:10px;line-height:1.55;}
        .err.show{display:block;}
        .ld{display:none;align-items:center;gap:8px;color:var(--dim);font-size:10px;margin-bottom:10px;}
        .ld.show{display:flex;}
        .spin{width:14px;height:14px;border:2px solid rgba(0,229,255,.1);border-top-color:var(--cyan);border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;}
        @keyframes spin{to{transform:rotate(360deg)}}
        .divider{display:flex;align-items:center;gap:12px;margin:12px 0;font-size:9px;color:var(--dim);}
        .divider::before,.divider::after{content:'';flex:1;height:1px;background:var(--b);}
        .hp-field{position:absolute;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;pointer-events:none;visibility:hidden;}
        .form-footer{margin-top:auto;padding-top:18px;font-size:9.5px;color:var(--dim);line-height:1.7;text-align:center;}
        .form-footer a{color:var(--cyan);text-decoration:none;}
        .form-footer a:hover{text-decoration:underline;}
        .loading-overlay{position:fixed;inset:0;background:rgba(3,3,18,.97);z-index:9999;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;backdrop-filter:blur(8px);}
        .loading-overlay.show{display:flex;}
        .loading-logo{font-family:'Orbitron',sans-serif;font-size:24px;font-weight:900;background:linear-gradient(135deg,var(--cyan),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:3px;}
        .loading-spinner{width:42px;height:42px;border:3px solid rgba(0,229,255,.1);border-top-color:var(--cyan);border-radius:50%;animation:spin .9s linear infinite;}
        .loading-text{font-size:11px;color:var(--dim);}
        .loading-progress{width:200px;height:2px;background:rgba(0,229,255,.08);border-radius:2px;overflow:hidden;}
        .loading-progress-bar{height:100%;background:linear-gradient(90deg,var(--cyan),var(--purple));border-radius:2px;animation:prog 2s ease infinite;}
        @keyframes prog{0%{width:0%;margin-left:0}50%{width:70%}100%{width:0%;margin-left:100%}}
        @media(max-width:640px){.login-wrap{flex-direction:column;border-radius:16px;}.left-panel{flex:none;padding:28px 24px 20px;border-right:none;border-bottom:1px solid var(--b);}.brand-feature{display:none;}.right-panel{padding:28px 24px;}}
        @media(max-width:420px){.page{padding:12px;}.right-panel{padding:22px 18px;}.left-panel{padding:22px 18px 16px;}.brand-logo{font-size:22px;}}
      `}</style>

      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet" />

      <div className="particles" id="particles" />

      <div className="loading-overlay" id="loadingOverlay">
        <div className="loading-logo">NEXUS AI</div>
        <div className="loading-spinner" />
        <div className="loading-progress"><div className="loading-progress-bar" /></div>
        <div className="loading-text" id="loadingText">Completing login...</div>
      </div>

      <div className="hp-field" aria-hidden="true">
        <input type="text" name="username" id="hp_username" tabIndex={-1} autoComplete="off" />
        <input type="email" name="email" id="hp_email" tabIndex={-1} autoComplete="off" />
        <input type="password" name="password" id="hp_password" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="page">
        <div className="login-wrap">
          <div className="left-panel">
            <div className="brand-logo">NEXUS AI</div>
            <div className="brand-tag">Roblox Dev Intelligence</div>
            <div className="brand-icon-wrap">
              <img src="nexusai.png" alt="NEXUS" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '.2'; }} />
            </div>
            <div className="brand-desc">Your smart Roblox Studio assistant. Write Lua, debug scripts, build GUIs — and inject directly into Studio.</div>
            {['AI-powered Lua code generation', 'Direct Studio plugin injection', 'DataStore & system design', 'GUI builder & UI editor', 'Anti-exploit best practices'].map((f, i) => (
              <div key={i} className="brand-feature">{f}</div>
            ))}
            <div style={{ flex: 1 }} />
            <div className="online-indicator">
              <div className="online-dot" />
              System Online
            </div>
          </div>

          <div className="right-panel">
            <div className="right-header">
              <div className="right-title" id="rightTitle">Sign in to NEXUS AI</div>
              <div className="right-sub" id="rightSub">Connect your accounts to get started</div>
            </div>

            <div className="step-indicator">
              <div className="step-item">
                <div className="step-num active" id="step1Dot">1</div>
                <span className="step-txt active" id="step1Txt">Google</span>
              </div>
              <div className="step-connector" id="stepLine1" />
              <div className="step-item" style={{ justifyContent: 'flex-end' }}>
                <span className="step-txt" id="step2Txt" style={{ textAlign: 'right' }}>Roblox</span>
                <div className="step-num" id="step2Dot">2</div>
              </div>
            </div>

            <div id="panelGoogle">
              <div className="lockout-card" id="lockoutCard">
                <strong>Too many attempts.</strong> Please wait before trying again.<br />
                <div className="lockout-timer" id="lockoutTimer">—</div>
              </div>
              <div className="section-label">Sign in with your Google account to continue.</div>
              <div className="info-card">
                <strong>Step 1 of 2 — Google Verification</strong><br />
                We use Google to verify your identity. Your email is kept private and never shared.
              </div>
              <div className="google-preview" id="googlePreview">
                <img className="google-av" id="googleAvImg" src="" alt="" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '.2'; }} />
                <div className="google-info">
                  <div className="google-name" id="googleName">-</div>
                  <div className="google-email" id="googleEmail">-</div>
                  <div className="google-verified">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                    Verified
                  </div>
                </div>
              </div>
              <div className="err" id="googleErr" />
              <div className="ld" id="googleLd"><div className="spin" /><span>Connecting to Google...</span></div>
              <button className="btn-google" id="googleSignInBtn" onClick={googleSignIn}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </button>
              <div className="divider">or</div>
              <div style={{ textAlign: 'center', fontSize: '10px', color: 'var(--dim)', lineHeight: 1.6 }}>
                By signing in, you agree to our<br />
                <a href="/terms" target="_blank" style={{ color: 'var(--cyan)' }}>Terms of Service</a> ·{' '}
                <a href="/privacy" target="_blank" style={{ color: 'var(--cyan)' }}>Privacy Policy</a>
              </div>
              <div className="form-footer">
                Need help? Join <a href="https://discord.gg/FzAF48mvK5" target="_blank">NEXUS STUDIO Discord</a><br />
                Made by <span style={{ color: 'var(--cyan)' }}>NEXUS STUDIO</span>
              </div>
            </div>

            <div id="panelRoblox" style={{ display: 'none', flexDirection: 'column' }}>
              <div className="section-label">Connect your Roblox account to complete sign-in.</div>
              <div className="google-bar" id="googleBar">
                <img className="google-bar-av" id="googleSmallAv" src="" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '.2'; }} />
                <span className="google-bar-name" id="googleSmallName">-</span>
                <div className="google-bar-badge">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  Google OK
                </div>
                <button className="btn-change" onClick={logoutGoogle}>Change</button>
              </div>
              <div className="required-row">
                <div className="required-badge">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  ROBLOX REQUIRED
                </div>
              </div>
              <div className="info-card required">
                <strong>Step 2 of 2 — Roblox Account</strong><br />
                A Roblox account is <strong>required</strong>. All your data — credits, chat history, settings — is stored to your Roblox account and synced across all devices.
              </div>
              <div className="err" id="robloxErr" />
              <div className="ld" id="robloxLd"><div className="spin" /><span>Connecting to Roblox...</span></div>
              <button className="btn-roblox" id="robloxLoginBtn" onClick={startRobloxOAuth}>
                <img src="/roblox.png" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                Connect Roblox Account
              </button>
              <div style={{ fontSize: '9.5px', color: 'var(--dim)', textAlign: 'center', marginTop: '10px', lineHeight: 1.7 }}>
                You will be redirected to the official Roblox login page.<br />
                Your credentials are safe — we never store your password.
              </div>
              <div className="form-footer">
                Need help? Join <a href="https://discord.gg/FzAF48mvK5" target="_blank">NEXUS STUDIO Discord</a><br />
                Made by <span style={{ color: 'var(--cyan)' }}>NEXUS STUDIO</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}