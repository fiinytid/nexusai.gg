'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────
interface NexusSession {
  user?: { username?: string; robloxId?: string };
  data?: { roles?: string[]; plan?: string };
}
interface LogEntry {
  action?: string; user?: string; target?: string; name?: string; ts?: string;
}
type DotStatus = 'checking' | 'online' | 'offline';
interface DotState { status: DotStatus; label: string }

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500&display=swap');
:root{--bg:#030312;--bg2:#06071a;--bg3:#0a0b22;--cyan:#00e5ff;--cyan2:rgba(0,229,255,.35);--purple:#8800ff;--pink:#ff2d6b;--green:#00ffaa;--yellow:#ffd600;--discord:#5865F2;--text:#b8cfff;--dim:#3a4a7a;--border:rgba(0,229,255,.12);--r:10px}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html,body{min-height:100%;font-family:'JetBrains Mono',monospace;background:var(--bg);color:var(--text);font-size:13px}
body::before{content:'';position:fixed;inset:0;background:linear-gradient(rgba(0,229,255,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.012) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0}
.nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:10px;padding:10px 24px;background:rgba(3,3,18,.95);border-bottom:1px solid var(--border);backdrop-filter:blur(12px)}
.nav-logo{font-family:'Orbitron',sans-serif;font-size:14px;font-weight:900;background:linear-gradient(135deg,var(--cyan),var(--discord));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-decoration:none}
.nav-badge{display:flex;align-items:center;gap:5px;padding:3px 10px;background:rgba(88,101,242,.12);border:1px solid rgba(88,101,242,.3);border-radius:12px;font-size:9px;color:var(--discord);letter-spacing:.5px}
.nav-badge svg{width:11px;height:11px}
.nav-back{margin-left:auto;display:inline-flex;align-items:center;gap:5px;background:none;border:1px solid var(--border);border-radius:5px;color:var(--dim);font-size:10px;padding:4px 10px;cursor:pointer;font-family:'JetBrains Mono',monospace;text-decoration:none;transition:.15s}
.nav-back:hover{color:var(--cyan);border-color:var(--cyan)}
.nav-back svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2}
.main{max-width:920px;margin:0 auto;padding:28px 16px 60px;position:relative;z-index:1}
.access-guard{display:flex;align-items:center;justify-content:center;min-height:60vh;flex-direction:column;gap:16px;text-align:center;padding:20px}
.guard-icon{width:64px;height:64px;border-radius:16px;background:rgba(255,45,107,.1);border:1px solid rgba(255,45,107,.25);display:flex;align-items:center;justify-content:center}
.guard-icon svg{width:30px;height:30px;stroke:var(--pink);fill:none;stroke-width:1.8}
.guard-title{font-family:'Orbitron',sans-serif;font-size:18px;color:var(--pink)}
.guard-sub{font-size:11px;color:var(--dim);max-width:320px;line-height:1.7}
.hero{text-align:center;margin-bottom:28px}
.hero-title{font-family:'Orbitron',sans-serif;font-size:22px;font-weight:900;background:linear-gradient(135deg,var(--discord),var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:6px}
.hero-sub{font-size:11px;color:var(--dim)}
.hero-role{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:9px;font-weight:700;letter-spacing:1px;margin-top:8px}
.hero-role svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2}
.role-owner{background:rgba(255,214,0,.1);border:1px solid rgba(255,214,0,.25);color:var(--yellow)}
.role-admin{background:rgba(0,229,255,.1);border:1px solid rgba(0,229,255,.25);color:var(--cyan)}
.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
.stat-box{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px;text-align:center;transition:border-color .15s}
.stat-box:hover{border-color:rgba(0,229,255,.25)}
.stat-num{font-family:'Orbitron',sans-serif;font-size:24px;font-weight:900;color:var(--yellow);line-height:1;margin-bottom:4px}
.stat-label{font-size:9px;color:var(--dim);letter-spacing:.5px}
.stat-icon{width:28px;height:28px;border-radius:7px;background:rgba(255,214,0,.08);display:flex;align-items:center;justify-content:center;margin:0 auto 8px}
.stat-icon svg{width:14px;height:14px;stroke:var(--yellow);fill:none;stroke-width:2}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:18px}
.card-title{font-family:'Orbitron',sans-serif;font-size:10px;color:var(--cyan);letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.card-title svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0}
.status-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(0,229,255,.06)}
.status-row:last-of-type{border-bottom:none}
.status-label{font-size:10px;color:var(--text)}
.status-val{display:flex;align-items:center;gap:7px;font-size:9px;color:var(--dim)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--pink);flex-shrink:0;transition:background .3s}
.dot.online{background:var(--green);box-shadow:0 0 6px rgba(0,255,170,.5)}
.dot.checking{background:var(--yellow);animation:pulse .8s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.notif-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.notif-card{background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:10px 12px;transition:.15s}
.notif-card:hover{border-color:var(--cyan2)}
.notif-card.set{border-color:rgba(0,255,170,.3)}
.notif-card-type{font-size:8px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
.notif-card-val{font-size:10px;color:var(--text)}
.notif-card.set .notif-card-val{color:var(--green)}
.form-group{margin-bottom:12px}
.form-label{display:block;font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}
.form-input,.form-select,.form-textarea{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 11px;color:#fff;font-family:'JetBrains Mono',monospace;font-size:11px;outline:none;transition:border-color .15s;-webkit-appearance:none}
.form-input:focus,.form-select:focus,.form-textarea:focus{border-color:var(--cyan2)}
.form-input::placeholder,.form-textarea::placeholder{color:var(--dim)}
.form-textarea{min-height:72px;resize:vertical;line-height:1.6}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 18px;border-radius:7px;border:none;font-family:'Orbitron',sans-serif;font-size:9px;font-weight:700;cursor:pointer;transition:opacity .15s,transform .1s;letter-spacing:1px;white-space:nowrap}
.btn svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2}
.btn:hover:not(:disabled){opacity:.85;transform:translateY(-1px)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-discord{background:linear-gradient(135deg,var(--discord),var(--purple));color:#fff}
.btn-cyan{background:linear-gradient(135deg,var(--cyan),var(--purple));color:#030312}
.btn-secondary{background:rgba(255,255,255,.05);border:1px solid var(--border);color:var(--text)}
.btn-danger{background:rgba(255,45,107,.12);border:1px solid rgba(255,45,107,.25);color:var(--pink)}
.btn-full{width:100%}
.btn-sm{padding:5px 12px;font-size:8px}
.cmd-list{display:flex;flex-direction:column;gap:3px}
.cmd-item{display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg3);border-radius:5px;font-size:10px;transition:background .15s}
.cmd-item:hover{background:rgba(0,229,255,.04)}
.cmd-name{color:var(--discord);font-weight:700;min-width:180px;font-size:10px}
.cmd-desc{color:var(--dim);font-size:9px;flex:1}
.cmd-badge{font-size:7px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;flex-shrink:0}
.badge-public{background:rgba(0,255,170,.1);color:var(--green)}
.badge-admin{background:rgba(255,214,0,.1);color:var(--yellow)}
.badge-owner{background:rgba(255,45,107,.1);color:var(--pink)}
.log-box{background:rgba(0,0,0,.4);border:1px solid var(--border);border-radius:7px;padding:10px;height:150px;overflow-y:auto;font-family:'JetBrains Mono',monospace;font-size:10px;line-height:1.65}
.log-box::-webkit-scrollbar{width:4px}
.log-box::-webkit-scrollbar-thumb{background:var(--dim);border-radius:2px}
.log-line{padding:1px 0}
.log-line.ok{color:var(--green)}
.log-line.err{color:var(--pink)}
.log-line.info{color:var(--yellow)}
.log-line.dim{color:var(--dim)}
.status-msg{font-size:10px;margin-top:8px;min-height:16px}
.status-msg.ok{color:var(--green)}
.status-msg.err{color:var(--pink)}
.section-heading{font-family:'Orbitron',sans-serif;font-size:9px;color:var(--dim);letter-spacing:2px;text-transform:uppercase;margin:20px 0 10px}
.hint{font-size:9px;color:var(--dim);margin-bottom:10px;line-height:1.6}
.code-inline{background:rgba(88,101,242,.15);color:var(--discord);padding:1px 5px;border-radius:3px;font-size:9px}
.quick-link{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:6px;background:linear-gradient(135deg,var(--cyan),var(--purple));color:#030312;font-family:'Orbitron',sans-serif;font-size:9px;font-weight:700;text-decoration:none;letter-spacing:.5px;transition:opacity .15s;margin-top:10px;width:100%;justify-content:center}
.quick-link:hover{opacity:.85}
.quick-link svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2}
.card-full{margin-bottom:16px}
@media(max-width:640px){.grid{grid-template-columns:1fr}}
@media(max-width:600px){.stats-grid{grid-template-columns:1fr 1fr};.main{padding:16px 10px 60px};.cmd-name{min-width:120px}}
`;

// ─── Component ────────────────────────────────────────────────────────────────
export default function DiscordPage() {
  const [accessGranted, setAccessGranted] = useState<boolean | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [heroSub, setHeroSub] = useState('Loading...');
  const [heroRole, setHeroRole] = useState({ visible: false, isOwner: false, text: 'Admin' });
  const [stats, setStats] = useState({ total: '—', pro: '—', credits: '—' });
  const [apiDot, setApiDot] = useState<DotState>({ status: 'checking', label: 'Checking...' });
  const [kvDot, setKvDot]   = useState<DotState>({ status: 'checking', label: 'Checking...' });
  const [aiDot, setAiDot]   = useState<DotState>({ status: 'checking', label: 'Checking...' });
  const [notifChannels] = useState({ pay: 'Not set', rep: 'Not set', gen: 'Not set', newUser: 'Not set' });
  const [notifType, setNotifType]   = useState('general');
  const [notifMsg,  setNotifMsg]    = useState('');
  const [notifSt,   setNotifSt]     = useState({ msg: '', cls: '' });
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemCR,   setRedeemCR]   = useState('');
  const [redeemMax,  setRedeemMax]  = useState('');
  const [redeemSt,   setRedeemSt]   = useState({ msg: '', cls: '' });
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logBoxRef   = useRef<HTMLDivElement>(null);
  const sessionRef  = useRef<NexusSession | null>(null);
  const isOwnerRef  = useRef(false);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem('nexus_session');
      if (!raw) { setAccessGranted(false); return; }
      const sess: NexusSession = JSON.parse(raw);
      if (!sess?.user) { setAccessGranted(false); return; }
      const roles = sess.data?.roles || [];
      const plan  = sess.data?.plan  || 'free';
      const ownerFlag = plan === 'owner' || roles.includes('owner');
      const adminFlag = ownerFlag || roles.includes('admin');
      if (!adminFlag) { setAccessGranted(false); return; }
      sessionRef.current  = sess;
      isOwnerRef.current  = ownerFlag;
      setIsOwner(ownerFlag);
      setAccessGranted(true);
      setHeroSub(`${ownerFlag ? 'Owner Panel' : 'Admin Panel'} — @${sess.user?.username || '?'} — NEXUS AI V8.2`);
      setHeroRole({ visible: true, isOwner: ownerFlag, text: ownerFlag ? 'Owner' : 'Admin' });
      fetchStats();
      checkStatus();
      loadLogs();
    } catch { setAccessGranted(false); }
  }, []);

  // ── API Helpers ────────────────────────────────────────────────────────────
  async function fetchStats() {
    try {
      const r = await fetch('/api/sync?list=1');
      if (!r.ok) return;
      const all = await r.json();
      const users: [string, any][] = Object.entries(all).filter(([k]) => !k.startsWith('_'));
      setStats({
        total:   String(users.length),
        pro:     String(users.filter(([, v]) => v?.plan === 'pro').length),
        credits: users.reduce((s, [, v]) => s + parseFloat(v?.credits || 0), 0).toFixed(0),
      });
    } catch {}
  }

  async function checkStatus() {
    setApiDot({ status: 'checking', label: 'Checking...' });
    setKvDot ({ status: 'checking', label: 'Checking...' });
    setAiDot ({ status: 'checking', label: 'Checking...' });
    try {
      const r = await fetch('/api/main', { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        setApiDot({ status: 'online', label: 'Online' });
        const d = await r.json().catch(() => ({}));
        setAiDot({ status: d.gemini ? 'online' : 'offline', label: d.gemini ? 'Configured' : 'Not configured' });
      } else { setApiDot({ status: 'offline', label: `HTTP ${r.status}` }); setAiDot({ status: 'offline', label: 'Unknown' }); }
    } catch { setApiDot({ status: 'offline', label: 'Offline' }); setAiDot({ status: 'offline', label: 'Unknown' }); }
    try {
      const r2 = await fetch('/api/sync?list=1', { signal: AbortSignal.timeout(5000) });
      setKvDot({ status: r2.ok ? 'online' : 'offline', label: r2.ok ? 'Online' : `Error ${r2.status}` });
    } catch { setKvDot({ status: 'offline', label: 'Offline' }); }
  }

  async function sendWebNotif() {
    if (!notifMsg.trim()) { setNotifSt({ msg: 'Message cannot be empty.', cls: 'err' }); return; }
    try {
      const sess = sessionRef.current;
      const r = await fetch('/api/discord', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _nexusNotify: true, type: notifType, message: notifMsg, from: sess?.user?.username || 'Admin', userId: sess?.user?.robloxId || '0' }),
      });
      if (r.ok) { setNotifSt({ msg: 'Notification sent successfully.', cls: 'ok' }); setNotifMsg(''); setTimeout(() => setNotifSt({ msg: '', cls: '' }), 3500); }
      else { const d = await r.json().catch(() => ({})); setNotifSt({ msg: `Error: ${d.error || 'HTTP ' + r.status}`, cls: 'err' }); }
    } catch (e: any) { setNotifSt({ msg: `Error: ${e.message}`, cls: 'err' }); }
  }

  async function addRedeemCode() {
    if (!isOwnerRef.current) return;
    const code = redeemCode.trim().toUpperCase();
    const credits = parseInt(redeemCR || '0', 10);
    const maxUses = parseInt(redeemMax || '9999', 10) || 9999;
    if (!code) { setRedeemSt({ msg: 'Code is required.', cls: 'err' }); return; }
    if (!credits || credits < 1) { setRedeemSt({ msg: 'Credits must be > 0.', cls: 'err' }); return; }
    setRedeemLoading(true);
    try {
      const r = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: '_custom_codes', action: '_internal_add_code', code, credits, maxUses, expires: 'never' }) });
      if (r.ok) { setRedeemSt({ msg: `Code ${code} (+${credits} CR, max ${maxUses} uses) saved.`, cls: 'ok' }); setRedeemCode(''); setRedeemCR(''); setRedeemMax(''); setTimeout(() => setRedeemSt({ msg: '', cls: '' }), 3500); }
      else { const d = await r.json().catch(() => ({})); setRedeemSt({ msg: `Error: ${d.error || 'HTTP ' + r.status}`, cls: 'err' }); }
    } catch (e: any) { setRedeemSt({ msg: `Error: ${e.message}`, cls: 'err' }); }
    setRedeemLoading(false);
  }

  async function loadLogs() {
    try {
      const r = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'get_logs' }) });
      const d = await r.json();
      setLogs((d.logs || []).slice(0, 40));
      setTimeout(() => { if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight; }, 50);
    } catch { setLogs([]); }
  }

  function dotCls(s: DotStatus) { return `dot${s === 'online' ? ' online' : s === 'checking' ? ' checking' : ''}`; }

  if (accessGranted === null) return null;

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* NAV */}
      <nav className="nav">
        <img src="/nexusai.png" style={{ width: 22, height: 22, borderRadius: 5 }} alt=""
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <Link href="/" className="nav-logo">NEXUS AI</Link>
        <div className="nav-badge">
          <svg viewBox="0 0 24 24" style={{ width: 11, height: 11 }} fill="var(--discord)">
            <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
          </svg>
          Discord Manager
        </div>
        <button className="nav-back" onClick={() => window.history.back()}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
      </nav>

      {/* ACCESS DENIED */}
      {accessGranted === false && (
        <div className="access-guard">
          <div className="guard-icon">
            <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
          <div className="guard-title">Access Denied</div>
          <div className="guard-sub">This page is restricted to <strong>Admin</strong> and <strong>Owner</strong> roles only.</div>
          <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', marginTop: 4 }}>Go to Chat</Link>
        </div>
      )}

      {/* MAIN CONTENT */}
      {accessGranted === true && (
        <div className="main">

          {/* Hero */}
          <div className="hero">
            <div className="hero-title">Discord Bot Manager</div>
            <div className="hero-sub">{heroSub}</div>
            {heroRole.visible && (
              <div className={`hero-role ${heroRole.isOwner ? 'role-owner' : 'role-admin'}`}>
                <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>{heroRole.text}</span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="stats-grid">
            {[
              { num: stats.total,   label: 'Total Users',   icon: <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
              { num: stats.pro,     label: 'Pro Users',     icon: <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
              { num: stats.credits, label: 'Total Credits', icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
            ].map(s => (
              <div key={s.label} className="stat-box">
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-num">{s.num}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Row 1 — Status + Notif Channels */}
          <div className="grid">
            <div className="card">
              <div className="card-title">
                <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                System Status
              </div>
              {[
                { label: 'Vercel API', dot: apiDot },
                { label: 'Vercel KV',  dot: kvDot  },
                { label: 'Gemini AI',  dot: aiDot  },
              ].map(({ label, dot }) => (
                <div key={label} className="status-row">
                  <span className="status-label">{label}</span>
                  <div className="status-val">
                    <div className={dotCls(dot.status)} />
                    <span>{dot.label}</span>
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-full" style={{ marginTop: 14 }} onClick={checkStatus}>
                <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                Refresh Status
              </button>
              <Link href="/actions" className="quick-link">
                <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                Open Full Admin Panel
              </Link>
            </div>

            <div className="card">
              <div className="card-title">
                <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                Notification Channels
              </div>
              <p className="hint">Set via Discord: <span className="code-inline">/set-notif-channel</span></p>
              <div className="notif-grid">
                {[
                  { type: 'Payment',    val: notifChannels.pay     },
                  { type: 'Bug Report', val: notifChannels.rep     },
                  { type: 'General',    val: notifChannels.gen     },
                  { type: 'New User',   val: notifChannels.newUser },
                ].map(({ type, val }) => (
                  <div key={type} className={`notif-card${val !== 'Not set' ? ' set' : ''}`}>
                    <div className="notif-card-type">{type}</div>
                    <div className="notif-card-val">{val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2 — Send Notif + Redeem */}
          <div className="grid">
            <div className="card">
              <div className="card-title">
                <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Send Notification to Discord
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={notifType} onChange={e => setNotifType(e.target.value)}>
                  <option value="general">General</option>
                  <option value="payment">Payment</option>
                  <option value="report">Report</option>
                  <option value="newuser">New User</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea className="form-textarea" value={notifMsg} onChange={e => setNotifMsg(e.target.value)} placeholder="Notification content..." />
              </div>
              <button className="btn btn-discord btn-full" onClick={sendWebNotif}>
                <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Send to Discord
              </button>
              {notifSt.msg && <div className={`status-msg ${notifSt.cls}`}>{notifSt.msg}</div>}
            </div>

            <div className="card">
              <div className="card-title">
                <svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                Add Redeem Code
                <span style={{ marginLeft: 'auto', fontSize: 8, color: 'var(--pink)', letterSpacing: 1 }}>OWNER ONLY</span>
              </div>
              <div className="form-group">
                <label className="form-label">Code</label>
                <input type="text" className="form-input" value={redeemCode} onChange={e => setRedeemCode(e.target.value.toUpperCase())} placeholder="NEXUS2026" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Credits</label>
                  <input type="number" className="form-input" value={redeemCR} onChange={e => setRedeemCR(e.target.value)} placeholder="100" min="1" />
                </div>
                <div className="form-group">
                  <label className="form-label">Max Uses</label>
                  <input type="number" className="form-input" value={redeemMax} onChange={e => setRedeemMax(e.target.value)} placeholder="9999" min="1" />
                </div>
              </div>
              <button className="btn btn-cyan btn-full" onClick={addRedeemCode} disabled={!isOwner || redeemLoading}>
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                {redeemLoading ? 'Saving...' : 'Add Code'}
              </button>
              {redeemSt.msg && <div className={`status-msg ${redeemSt.cls}`}>{redeemSt.msg}</div>}
            </div>
          </div>

          {/* Bot Commands */}
          <div className="card card-full">
            <div className="card-title">
              <svg viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
              Bot Commands Reference
            </div>

            {[
              {
                heading: 'Public Commands', badge: 'public',
                cmds: [
                  ['/help', 'Show command list'], ['/ping', 'Check bot latency'],
                  ['/credits', 'Check your credit balance'], ['/redeem <code> <username>', 'Redeem a bonus code'],
                  ['/nexus <question>', 'Ask NEXUS AI a question'], ['/stats', 'Show bot statistics'],
                  ['@NEXUS AI <message>', 'Chat directly with the AI'],
                ],
              },
              {
                heading: 'Admin Commands', badge: 'admin',
                cmds: [
                  ['/give-credits', 'Add credits to a user'], ['/take-credits', 'Remove credits from a user'],
                  ['/set-plan', 'Set user plan (free/pro)'], ['/ban / /unban', 'Ban or unban a user account'],
                  ['/user-info', 'View detailed user info'], ['/list-users [page]', 'List all registered users'],
                  ['/broadcast', 'Send an announcement'], ['/reset-credits', 'Reset user credits to 30'],
                  ['/clear-chat', 'Delete channel messages'],
                ],
              },
              {
                heading: 'Owner Commands', badge: 'owner',
                cmds: [
                  ['/setup-ticket', 'Setup support ticket panel'], ['/set-notif-channel', 'Set notification channel per type'],
                  ['/bot-status', 'Show all system statuses'], ['/add-redeem', 'Add a new redeem code'],
                ],
              },
            ].map(({ heading, badge, cmds }) => (
              <div key={heading}>
                <div className="section-heading">{heading}</div>
                <div className="cmd-list" style={{ marginBottom: 12 }}>
                  {cmds.map(([name, desc]) => (
                    <div key={name} className="cmd-item">
                      <span className="cmd-name">{name}</span>
                      <span className="cmd-desc">{desc}</span>
                      <span className={`cmd-badge badge-${badge}`}>{badge.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Activity Log */}
          <div className="card">
            <div className="card-title">
              <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Activity Log
            </div>
            <div className="log-box" ref={logBoxRef}>
              {logs.length === 0
                ? <div className="log-line dim">No logs available.</div>
                : logs.map((l, i) => {
                    const cls  = l.action === 'prompt' ? 'dim' : 'ok';
                    const time = l.ts ? new Date(l.ts).toLocaleTimeString('en-US', { hour12: false }) : '?';
                    return (
                      <div key={i} className={`log-line ${cls}`}>
                        [{time}] {l.action || ''} · {l.user || ''} → {l.target || ''}{l.name ? ` (${l.name})` : ''}
                      </div>
                    );
                  })
              }
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={loadLogs}>
                <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                Refresh
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setLogs([])}>
                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                Clear View
              </button>
            </div>
          </div>

        </div>
      )}
    </>
  );
}