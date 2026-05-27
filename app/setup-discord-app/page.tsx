'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface NexusSession {
  user?: { username?: string; robloxId?: string };
  data?: { roles?: string[]; plan?: string };
}

interface LogEntry {
  ts?: string;
  action?: string;
  user?: string;
  target?: string;
  name?: string;
}

interface StatusState {
  dot: 'online' | 'offline' | 'checking';
  label: string;
}

interface Toast {
  id: number;
  msg: string;
  color: string;
}

interface NotifChannels {
  payment?: string;
  report?: string;
  general?: string;
  newuser?: string;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function esc(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── ICONS ───────────────────────────────────────────────────────────────────

const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
  </svg>
);

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function DiscordManager() {
  // Session / auth
  const [session, setSession] = useState<NexusSession | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authed, setAuthed]   = useState(false);
  const [denied, setDenied]   = useState(false);

  // Stats
  const [stats, setStats] = useState({ total: 0, pro: 0, credits: 0 });

  // Status checks
  const [statusApi, setStatusApi] = useState<StatusState>({ dot: 'checking', label: 'Checking...' });
  const [statusKv,  setStatusKv]  = useState<StatusState>({ dot: 'checking', label: 'Checking...' });
  const [statusAi,  setStatusAi]  = useState<StatusState>({ dot: 'checking', label: 'Checking...' });

  // Notif channels
  const [notifChannels, setNotifChannels] = useState<NotifChannels>({});

  // Send notification form
  const [notifType,   setNotifType]   = useState('general');
  const [notifMsg,    setNotifMsg]    = useState('');
  const [notifStatus, setNotifStatus] = useState('');
  const [notifOk,     setNotifOk]     = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  // Redeem code form
  const [redeemCode,    setRedeemCode]    = useState('');
  const [redeemCR,      setRedeemCR]      = useState('');
  const [redeemMax,     setRedeemMax]     = useState('');
  const [redeemStatus,  setRedeemStatus]  = useState('');
  const [redeemOk,      setRedeemOk]      = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);

  // Logs
  const [logs,     setLogs]     = useState<LogEntry[]>([]);
  const [logsErr,  setLogsErr]  = useState('');
  const [logsClear, setLogsClear] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastRef = useRef(0);

  // ── Toast ──────────────────────────────────────────────────────────────────

  const addToast = useCallback((msg: string, color = 'var(--cyan)') => {
    const id = ++toastRef.current;
    setToasts(p => [...p, { id, msg, color }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem('nexus_session');
      if (!raw) { setDenied(true); return; }
      const s: NexusSession = JSON.parse(raw);
      if (!s?.user) { setDenied(true); return; }

      const roles: string[] = s.data?.roles ?? [];
      const plan  = s.data?.plan ?? 'free';
      const owner = plan === 'owner' || roles.includes('owner');
      const admin = owner || roles.includes('admin');

      if (!admin) { setDenied(true); return; }

      setSession(s);
      setIsOwner(owner);
      setIsAdmin(admin);
      setAuthed(true);
    } catch {
      setDenied(true);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadStats();
    checkStatus();
    loadLogs();
    loadNotifChannels();
  }, [authed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── API calls ──────────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/sync?list=1');
      if (!r.ok) return;
      const all = await r.json();
      const users = Object.entries(all).filter(([k]) => !k.startsWith('_')) as [string, { plan?: string; credits?: number }][];
      setStats({
        total:   users.length,
        pro:     users.filter(([, d]) => d?.plan === 'pro' || d?.plan === 'owner').length,
        credits: Math.round(users.reduce((s, [, d]) => s + parseFloat(String(d?.credits ?? 0)), 0)),
      });
    } catch { /* noop */ }
  }, []);

  const checkStatus = useCallback(async () => {
    setStatusApi({ dot: 'checking', label: 'Checking...' });
    setStatusKv ({ dot: 'checking', label: 'Checking...' });
    setStatusAi ({ dot: 'checking', label: 'Checking...' });

    // API + AI
    try {
      const r = await fetch('/api/main', { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        setStatusApi({ dot: 'online', label: 'Online' });
        const d = await r.json().catch(() => ({}));
        setStatusAi({ dot: d.gemini ? 'online' : 'offline', label: d.gemini ? 'Configured' : 'Not configured' });
      } else {
        setStatusApi({ dot: 'offline', label: 'HTTP ' + r.status });
        setStatusAi ({ dot: 'offline', label: 'Unknown' });
      }
    } catch {
      setStatusApi({ dot: 'offline', label: 'Offline' });
      setStatusAi ({ dot: 'offline', label: 'Unknown' });
    }

    // KV
    try {
      const r2 = await fetch('/api/sync?list=1', { signal: AbortSignal.timeout(5000) });
      setStatusKv({ dot: r2.ok ? 'online' : 'offline', label: r2.ok ? 'Online' : 'Error ' + r2.status });
    } catch {
      setStatusKv({ dot: 'offline', label: 'Offline' });
    }
  }, []);

  const loadNotifChannels = useCallback(async () => {
    try {
      const r = await fetch('/api/sync?user=_notif_channels');
      if (!r.ok) return;
      const d = await r.json();
      setNotifChannels({
        payment: d.payment,
        report:  d.report,
        general: d.general,
        newuser: d.newuser,
      });
    } catch { /* noop */ }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsClear(false);
    try {
      const r = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'get_logs' }),
      });
      const d = await r.json();
      setLogs((d.logs ?? []).slice(0, 40));
      setLogsErr('');
    } catch (e: unknown) {
      setLogsErr('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, []);

  const sendNotification = useCallback(async () => {
    if (!notifMsg.trim()) { setNotifStatus('Message cannot be empty.'); setNotifOk(false); return; }
    setNotifLoading(true);
    setNotifStatus('');
    try {
      const r = await fetch('/api/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _nexusNotify: true,
          type: notifType,
          message: notifMsg.trim(),
          from: session?.user?.username ?? 'Admin',
          userId: session?.user?.robloxId ?? '0',
        }),
      });
      if (r.ok) {
        setNotifStatus('Notification sent successfully.');
        setNotifOk(true);
        setNotifMsg('');
        addToast('✉ Notification sent to Discord!', 'var(--discord)');
        setTimeout(() => setNotifStatus(''), 3500);
      } else {
        const d = await r.json().catch(() => ({}));
        setNotifStatus('Error: ' + (d.error ?? 'HTTP ' + r.status));
        setNotifOk(false);
      }
    } catch (e: unknown) {
      setNotifStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
      setNotifOk(false);
    }
    setNotifLoading(false);
  }, [notifMsg, notifType, session, addToast]);

  const addRedeemCode = useCallback(async () => {
    if (!isOwner) { addToast('Owner access required.', 'var(--pink)'); return; }
    const code    = redeemCode.trim().toUpperCase();
    const credits = parseInt(redeemCR || '0', 10);
    const maxUses = parseInt(redeemMax || '9999', 10);

    if (!code)        { setRedeemStatus('Code is required.');     setRedeemOk(false); return; }
    if (credits < 1)  { setRedeemStatus('Credits must be > 0.');  setRedeemOk(false); return; }

    setRedeemLoading(true);
    setRedeemStatus('');
    try {
      const r = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: '_custom_codes', action: '_internal_add_code',
          code, credits, maxUses: maxUses < 1 ? 9999 : maxUses, expires: 'never',
        }),
      });
      if (r.ok) {
        setRedeemStatus(`Code ${code} (+${credits} CR, max ${maxUses < 1 ? 9999 : maxUses} uses) saved.`);
        setRedeemOk(true);
        setRedeemCode(''); setRedeemCR(''); setRedeemMax('');
        addToast(`🎟 Code ${code} created!`, 'var(--green)');
        setTimeout(() => setRedeemStatus(''), 3500);
      } else {
        const d = await r.json().catch(() => ({}));
        setRedeemStatus('Error: ' + (d.error ?? 'HTTP ' + r.status));
        setRedeemOk(false);
      }
    } catch (e: unknown) {
      setRedeemStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
      setRedeemOk(false);
    }
    setRedeemLoading(false);
  }, [isOwner, redeemCode, redeemCR, redeemMax, addToast]);

  // ── Styles ─────────────────────────────────────────────────────────────────

  const globalCss = `
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500&display=swap');
    :root {
      --bg:#030312; --bg2:#06071a; --bg3:#0a0b22;
      --cyan:#00e5ff; --cyan2:rgba(0,229,255,.35); --cyan3:rgba(0,229,255,.12);
      --purple:#8800ff; --pink:#ff2d6b;
      --green:#00ffaa; --yellow:#ffd600;
      --discord:#5865F2;
      --text:#b8cfff; --dim:#3a4a7a;
      --border:rgba(0,229,255,.12);
    }
    *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
    html, body {
      min-height:100%; font-family:'JetBrains Mono',monospace;
      background:var(--bg); color:var(--text); font-size:13px;
    }
    body::before {
      content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
      background:
        linear-gradient(rgba(0,229,255,.012) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,229,255,.012) 1px, transparent 1px);
      background-size:40px 40px;
    }
    ::-webkit-scrollbar { width:4px; height:4px; }
    ::-webkit-scrollbar-thumb { background:var(--dim); border-radius:2px; }
    @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.35} }
    @keyframes glow-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
    @keyframes toast-in { from{opacity:0;transform:translateX(12px)} to{opacity:1;transform:none} }
    @keyframes spin { to{transform:rotate(360deg)} }
    .dot-online  { background:var(--green)!important; box-shadow:0 0 8px rgba(0,255,170,.5)!important; }
    .dot-offline { background:var(--pink)!important; }
    .dot-checking{ animation:pulse-dot .8s ease-in-out infinite; }
    .card-hover:hover { border-color:rgba(0,229,255,.25)!important; }
    .notif-hover:hover { border-color:var(--cyan2)!important; }
    .btn-row-hover:hover:not(:disabled) { opacity:.85; transform:translateY(-1px); }
    .btn-row-hover:active:not(:disabled) { transform:none; }
    .cmd-item-hover:hover { background:rgba(0,229,255,.04)!important; }
    .link-hover:hover { color:var(--cyan)!important; border-color:var(--cyan)!important; }
    .quick-link-hover:hover { opacity:.85; }
    .stat-hover:hover { border-color:rgba(0,229,255,.25)!important; }
    input, textarea, select { font-family:'JetBrains Mono',monospace; }
    input:focus, textarea:focus, select:focus { border-color:var(--cyan2)!important; outline:none; }
    input::placeholder, textarea::placeholder { color:var(--dim); }
    @media(max-width:640px){
      .resp-grid { grid-template-columns:1fr!important; }
      .resp-stats { grid-template-columns:1fr 1fr!important; }
      .resp-pad { padding:16px 10px 60px!important; }
      .cmd-name-resp { min-width:120px!important; }
    }
  `;

  const iSt: React.CSSProperties = {
    width:'100%', background:'var(--bg3)', border:'1px solid var(--border)',
    borderRadius:'6px', padding:'8px 11px', color:'#fff',
    fontSize:'11px', outline:'none', transition:'border-color .15s',
    appearance:'none' as 'none',
  };
  const taSt: React.CSSProperties = { ...iSt, minHeight:'72px', resize:'vertical' as 'vertical', lineHeight:'1.6' };
  const labelSt: React.CSSProperties = { display:'block', fontSize:'9px', color:'var(--dim)', textTransform:'uppercase' as 'uppercase', letterSpacing:'1px', marginBottom:'5px' };
  const fgSt: React.CSSProperties = { marginBottom:'12px' };

  // ─── GUARD ──────────────────────────────────────────────────────────────────

  if (denied) {
    return (
      <>
        <style>{globalCss}</style>
        <nav style={{ position:'sticky', top:0, zIndex:100, display:'flex', alignItems:'center', gap:'10px', padding:'10px 24px', background:'rgba(3,3,18,.95)', borderBottom:'1px solid var(--border)', backdropFilter:'blur(12px)' }}>
          <img src="/favicon.ico" width={22} height={22} style={{ borderRadius:'5px' }} alt="" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
          <a href="/" style={{ fontFamily:'Orbitron,sans-serif', fontSize:'14px', fontWeight:900, background:'linear-gradient(135deg,var(--cyan),var(--discord))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', textDecoration:'none' }}>NEXUS AI</a>
          <a href="/" className="link-hover" style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:'5px', background:'none', border:'1px solid var(--border)', borderRadius:'5px', color:'var(--dim)', fontSize:'10px', padding:'4px 10px', textDecoration:'none', transition:'.15s' }}>← Back</a>
        </nav>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', gap:'16px', textAlign:'center', position:'relative', zIndex:1 }}>
          <div style={{ width:'64px', height:'64px', borderRadius:'16px', background:'rgba(255,45,107,.1)', border:'1px solid rgba(255,45,107,.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="var(--pink)" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
          <div style={{ fontFamily:'Orbitron,sans-serif', fontSize:'18px', color:'var(--pink)' }}>Access Denied</div>
          <div style={{ fontSize:'11px', color:'var(--dim)', maxWidth:'320px', lineHeight:'1.7' }}>This page is restricted to <strong style={{color:'var(--text)'}}>Admin</strong> and <strong style={{color:'var(--text)'}}>Owner</strong> roles only.</div>
          <a href="/" style={{ marginTop:'4px', display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 18px', borderRadius:'7px', background:'rgba(255,255,255,.05)', border:'1px solid var(--border)', color:'var(--text)', fontFamily:'Orbitron,sans-serif', fontSize:'9px', fontWeight:700, textDecoration:'none', letterSpacing:'1px' }}>Go to Chat</a>
        </div>
      </>
    );
  }

  if (!authed) return (
    <>
      <style>{globalCss}</style>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', color:'var(--dim)', fontSize:'11px' }}>Loading...</div>
    </>
  );

  // ─── PANEL ─────────────────────────────────────────────────────────────────

  const heroSub = `${isOwner ? 'Owner Panel' : 'Admin Panel'} — @${session?.user?.username ?? '?'} — NEXUS AI V8.2`;

  const statusRows: { label: string; state: StatusState }[] = [
    { label: 'Vercel API', state: statusApi },
    { label: 'Vercel KV',  state: statusKv  },
    { label: 'Gemini AI',  state: statusAi  },
  ];

  const notifCards: { type: string; key: keyof NotifChannels; id: string }[] = [
    { type: 'Payment',    key: 'payment', id: 'notifPay' },
    { type: 'Bug Report', key: 'report',  id: 'notifRep' },
    { type: 'General',    key: 'general', id: 'notifGen' },
    { type: 'New User',   key: 'newuser', id: 'notifNew' },
  ];

  const publicCmds = [
    ['/help', 'Show command list'],
    ['/ping', 'Check bot latency'],
    ['/credits', 'Check your credit balance'],
    ['/redeem <code> <username>', 'Redeem a bonus code'],
    ['/nexus <question>', 'Ask NEXUS AI a question'],
    ['/stats', 'Show bot statistics'],
    ['@NEXUS AI <message>', 'Chat directly with the AI'],
  ];

  const adminCmds = [
    ['/give-credits', 'Add credits to a user'],
    ['/take-credits', 'Remove credits from a user'],
    ['/set-plan', 'Set user plan (free/pro)'],
    ['/ban / /unban', 'Ban or unban a user account'],
    ['/user-info', 'View detailed user info'],
    ['/list-users [page]', 'List all registered users'],
    ['/broadcast', 'Send an announcement'],
    ['/reset-credits', 'Reset user credits to 30'],
    ['/clear-chat', 'Delete channel messages'],
  ];

  const ownerCmds = [
    ['/setup-ticket', 'Setup support ticket panel'],
    ['/set-notif-channel', 'Set notification channel per type'],
    ['/bot-status', 'Show all system statuses'],
    ['/add-redeem', 'Add a new redeem code'],
  ];

  const cardSt: React.CSSProperties = { background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'18px', transition:'border-color .15s' };
  const cardTitleSt: React.CSSProperties = { fontFamily:'Orbitron,sans-serif', fontSize:'10px', color:'var(--cyan)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'14px', display:'flex', alignItems:'center', gap:'8px' };

  function Btn({ onClick, disabled, variant, full, sm, children }: {
    onClick?: () => void; disabled?: boolean;
    variant?: 'discord' | 'cyan' | 'secondary' | 'danger';
    full?: boolean; sm?: boolean; children: React.ReactNode;
  }) {
    const variantStyles: Record<string, React.CSSProperties> = {
      discord:   { background:'linear-gradient(135deg,var(--discord),var(--purple))', color:'#fff', border:'none' },
      cyan:      { background:'linear-gradient(135deg,var(--cyan),var(--purple))', color:'#030312', border:'none' },
      secondary: { background:'rgba(255,255,255,.05)', border:'1px solid var(--border)', color:'var(--text)' },
      danger:    { background:'rgba(255,45,107,.12)', border:'1px solid rgba(255,45,107,.25)', color:'var(--pink)' },
    };
    return (
      <button onClick={onClick} disabled={disabled} className="btn-row-hover" style={{
        display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'6px',
        padding: sm ? '5px 12px' : '9px 18px',
        borderRadius:'7px',
        fontFamily:'Orbitron,sans-serif', fontSize: sm ? '8px' : '9px', fontWeight:700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing:'1px', whiteSpace:'nowrap',
        width: full ? '100%' : undefined,
        opacity: disabled ? .5 : 1,
        transition:'opacity .15s, transform .1s',
        ...(variantStyles[variant ?? 'secondary']),
      }}>{children}</button>
    );
  }

  return (
    <>
      <style>{globalCss}</style>

      {/* ── Toasts ── */}
      <div style={{ position:'fixed', bottom:'20px', right:'20px', zIndex:9999, display:'flex', flexDirection:'column', gap:'8px' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'8px',
            padding:'10px 16px', fontSize:'11px', color:t.color, pointerEvents:'none',
            animation:'toast-in .2s ease', boxShadow:'0 4px 20px rgba(0,0,0,.5)',
            fontFamily:'JetBrains Mono,monospace',
          }}>{t.msg}</div>
        ))}
      </div>

      {/* ── Nav ── */}
      <nav style={{ position:'sticky', top:0, zIndex:100, display:'flex', alignItems:'center', gap:'10px', padding:'10px 24px', background:'rgba(3,3,18,.95)', borderBottom:'1px solid var(--border)', backdropFilter:'blur(12px)' }}>
        <img src="/favicon.ico" width={22} height={22} style={{ borderRadius:'5px', flexShrink:0 }} alt="NEXUS AI" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
        <a href="/" style={{ fontFamily:'Orbitron,sans-serif', fontSize:'14px', fontWeight:900, background:'linear-gradient(135deg,var(--cyan),var(--discord))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', textDecoration:'none', flexShrink:0 }}>NEXUS AI</a>

        <div style={{ display:'flex', alignItems:'center', gap:'5px', padding:'3px 10px', background:'rgba(88,101,242,.12)', border:'1px solid rgba(88,101,242,.3)', borderRadius:'12px', fontSize:'9px', color:'var(--discord)', letterSpacing:'.5px', flexShrink:0 }}>
          <DiscordIcon /> Discord Manager
        </div>

        <div style={{ marginLeft:'auto' }} />

        <a href="javascript:history.back()" className="link-hover" style={{ display:'inline-flex', alignItems:'center', gap:'5px', background:'none', border:'1px solid var(--border)', borderRadius:'5px', color:'var(--dim)', fontSize:'10px', padding:'4px 10px', cursor:'pointer', fontFamily:'JetBrains Mono,monospace', textDecoration:'none', transition:'.15s', flexShrink:0 }}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </a>
      </nav>

      {/* ── Main ── */}
      <div className="resp-pad" style={{ maxWidth:'920px', margin:'0 auto', padding:'28px 16px 60px', position:'relative', zIndex:1 }}>

        {/* Hero */}
        <div style={{ textAlign:'center', marginBottom:'28px', animation:'glow-in .5s ease' }}>
          <div style={{ fontFamily:'Orbitron,sans-serif', fontSize:'22px', fontWeight:900, background:'linear-gradient(135deg,var(--discord),var(--cyan))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:'6px' }}>
            Discord Bot Manager
          </div>
          <div style={{ fontSize:'11px', color:'var(--dim)', marginBottom:'8px' }}>{heroSub}</div>
          <div style={{
            display:'inline-flex', alignItems:'center', gap:'6px', padding:'4px 12px',
            borderRadius:'20px', fontSize:'9px', fontWeight:700, letterSpacing:'1px',
            background: isOwner ? 'rgba(255,214,0,.1)' : 'rgba(0,229,255,.1)',
            border: isOwner ? '1px solid rgba(255,214,0,.25)' : '1px solid rgba(0,229,255,.25)',
            color: isOwner ? 'var(--yellow)' : 'var(--cyan)',
          }}>
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            {isOwner ? 'Owner' : 'Admin'}
          </div>
        </div>

        {/* Stats */}
        <div className="resp-stats" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px', marginBottom:'20px' }}>
          {[
            { icon: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--yellow)" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>, num: stats.total, label:'Total Users' },
            { icon: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--yellow)" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, num: stats.pro, label:'Pro Users' },
            { icon: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--yellow)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>, num: stats.credits, label:'Total Credits' },
          ].map(s => (
            <div key={s.label} className="card-hover stat-hover" style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'16px', textAlign:'center', transition:'border-color .15s' }}>
              <div style={{ width:'28px', height:'28px', borderRadius:'7px', background:'rgba(255,214,0,.08)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 8px' }}>{s.icon}</div>
              <div style={{ fontFamily:'Orbitron,sans-serif', fontSize:'24px', fontWeight:900, color:'var(--yellow)', lineHeight:'1', marginBottom:'4px' }}>{s.num}</div>
              <div style={{ fontSize:'9px', color:'var(--dim)', letterSpacing:'.5px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Row 1 */}
        <div className="resp-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>

          {/* System Status */}
          <div className="card-hover" style={cardSt}>
            <div style={cardTitleSt}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              System Status
            </div>
            {statusRows.map(({ label, state }) => (
              <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(0,229,255,.06)' }}>
                <span style={{ fontSize:'10px', color:'var(--text)' }}>{label}</span>
                <div style={{ display:'flex', alignItems:'center', gap:'7px', fontSize:'9px', color:'var(--dim)' }}>
                  <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'var(--pink)', flexShrink:0, transition:'background .3s' }} className={`dot-${state.dot}`} />
                  {state.label}
                </div>
              </div>
            ))}
            <button onClick={checkStatus} className="btn-row-hover" style={{ marginTop:'14px', width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'9px 18px', borderRadius:'7px', background:'rgba(255,255,255,.05)', border:'1px solid var(--border)', color:'var(--text)', fontFamily:'Orbitron,sans-serif', fontSize:'9px', fontWeight:700, cursor:'pointer', letterSpacing:'1px', transition:'opacity .15s, transform .1s' }}>
              <RefreshIcon /> Refresh Status
            </button>
            <a href="/actions" className="quick-link-hover" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'5px', padding:'7px 14px', borderRadius:'6px', background:'linear-gradient(135deg,var(--cyan),var(--purple))', color:'#030312', fontFamily:'Orbitron,sans-serif', fontSize:'9px', fontWeight:700, textDecoration:'none', letterSpacing:'.5px', transition:'opacity .15s', marginTop:'10px', width:'100%' }}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              Open Full Admin Panel
            </a>
          </div>

          {/* Notif Channels */}
          <div className="card-hover" style={cardSt}>
            <div style={cardTitleSt}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
              Notification Channels
            </div>
            <div style={{ fontSize:'9px', color:'var(--dim)', marginBottom:'10px', lineHeight:'1.6' }}>
              Set via Discord: <span style={{ background:'rgba(88,101,242,.15)', color:'var(--discord)', padding:'1px 5px', borderRadius:'3px', fontSize:'9px' }}>/set-notif-channel</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              {notifCards.map(nc => {
                const val = notifChannels[nc.key];
                return (
                  <div key={nc.id} className="notif-hover" style={{ background:'var(--bg3)', border:`1px solid ${val ? 'rgba(0,255,170,.3)' : 'var(--border)'}`, borderRadius:'7px', padding:'10px 12px', transition:'.15s' }}>
                    <div style={{ fontSize:'8px', color:'var(--dim)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'3px' }}>{nc.type}</div>
                    <div style={{ fontSize:'10px', color: val ? 'var(--green)' : 'var(--dim)' }}>{val ?? 'Not set'}</div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Row 2 */}
        <div className="resp-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>

          {/* Send Discord Notification */}
          <div className="card-hover" style={cardSt}>
            <div style={cardTitleSt}>
              <SendIcon />
              Send Notification to Discord
            </div>
            <div style={fgSt}>
              <label style={labelSt}>Type</label>
              <select value={notifType} onChange={e => setNotifType(e.target.value)} style={iSt}>
                <option value="general">General</option>
                <option value="payment">Payment</option>
                <option value="report">Report</option>
                <option value="newuser">New User</option>
              </select>
            </div>
            <div style={fgSt}>
              <label style={labelSt}>Message</label>
              <textarea value={notifMsg} onChange={e => setNotifMsg(e.target.value)} placeholder="Notification content..." style={taSt} />
            </div>
            <Btn onClick={sendNotification} disabled={notifLoading} variant="discord" full>
              <SendIcon /> {notifLoading ? 'Sending...' : 'Send to Discord'}
            </Btn>
            {notifStatus && <div style={{ fontSize:'10px', marginTop:'8px', color: notifOk ? 'var(--green)' : 'var(--pink)' }}>{notifStatus}</div>}
          </div>

          {/* Add Redeem Code (Owner only) */}
          <div className="card-hover" style={cardSt}>
            <div style={{ ...cardTitleSt, flexWrap:'wrap' as 'wrap' }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              Add Redeem Code
              <span style={{ marginLeft:'auto', fontSize:'8px', color:'var(--pink)', letterSpacing:'1px' }}>OWNER ONLY</span>
            </div>
            <div style={fgSt}>
              <label style={labelSt}>Code</label>
              <input type="text" value={redeemCode} onChange={e => setRedeemCode(e.target.value.toUpperCase())} placeholder="NEXUS2026" style={{ ...iSt, textTransform:'uppercase' as 'uppercase' }} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              <div style={fgSt}>
                <label style={labelSt}>Credits</label>
                <input type="number" value={redeemCR} onChange={e => setRedeemCR(e.target.value)} placeholder="100" min={1} max={999999} style={iSt} />
              </div>
              <div style={fgSt}>
                <label style={labelSt}>Max Uses</label>
                <input type="number" value={redeemMax} onChange={e => setRedeemMax(e.target.value)} placeholder="9999" min={1} style={iSt} />
              </div>
            </div>
            <Btn onClick={addRedeemCode} disabled={redeemLoading || !isOwner} variant="cyan" full>
              <PlusIcon /> {redeemLoading ? 'Saving...' : 'Add Code'}
            </Btn>
            {redeemStatus && <div style={{ fontSize:'10px', marginTop:'8px', color: redeemOk ? 'var(--green)' : 'var(--pink)' }}>{redeemStatus}</div>}
          </div>

        </div>

        {/* Bot Commands Reference */}
        <div className="card-hover" style={{ ...cardSt, marginBottom:'16px' }}>
          <div style={cardTitleSt}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            Bot Commands Reference
          </div>

          {([
            { heading: 'Public Commands',  cmds: publicCmds, badge: { label: 'PUBLIC', bg: 'rgba(0,255,170,.1)', color: 'var(--green)' } },
            { heading: 'Admin Commands',   cmds: adminCmds,  badge: { label: 'ADMIN',  bg: 'rgba(255,214,0,.1)', color: 'var(--yellow)' } },
            { heading: 'Owner Commands',   cmds: ownerCmds,  badge: { label: 'OWNER',  bg: 'rgba(255,45,107,.1)', color: 'var(--pink)' } },
          ] as const).map(section => (
            <div key={section.heading} style={{ marginBottom:'12px' }}>
              <div style={{ fontFamily:'Orbitron,sans-serif', fontSize:'9px', color:'var(--dim)', letterSpacing:'2px', textTransform:'uppercase', margin:'20px 0 10px' }}>{section.heading}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
                {section.cmds.map(([name, desc]) => (
                  <div key={name} className="cmd-item-hover" style={{ display:'flex', alignItems:'center', gap:'8px', padding:'7px 10px', background:'var(--bg3)', borderRadius:'5px', fontSize:'10px', transition:'background .15s' }}>
                    <span className="cmd-name-resp" style={{ color:'var(--discord)', fontWeight:700, minWidth:'180px', fontSize:'10px', fontFamily:'JetBrains Mono,monospace' }}>{name}</span>
                    <span style={{ color:'var(--dim)', fontSize:'9px', flex:1 }}>{desc}</span>
                    <span style={{ fontSize:'7px', fontWeight:700, padding:'2px 7px', borderRadius:'10px', whiteSpace:'nowrap', flexShrink:0, background:section.badge.bg, color:section.badge.color }}>{section.badge.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Activity Log */}
        <div className="card-hover" style={cardSt}>
          <div style={cardTitleSt}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Activity Log
          </div>

          {/* Log box */}
          <div style={{ background:'rgba(0,0,0,.4)', border:'1px solid var(--border)', borderRadius:'7px', padding:'10px', height:'150px', overflowY:'auto', fontSize:'10px', lineHeight:'1.65', fontFamily:'JetBrains Mono,monospace' }}>
            {logsClear
              ? <div style={{ color:'var(--dim)' }}>Log display cleared.</div>
              : logsErr
              ? <div style={{ color:'var(--pink)' }}>{logsErr}</div>
              : logs.length === 0
              ? <div style={{ color:'var(--dim)' }}>No logs available.</div>
              : logs.map((l, i) => {
                  const t = l.ts ? new Date(l.ts).toLocaleTimeString('en-US', { hour12: false }) : '?';
                  const line = esc(`[${t}] ${l.action ?? ''} · ${l.user ?? ''} → ${l.target ?? ''}${l.name ? ` (${l.name})` : ''}`);
                  const isPrompt = l.action === 'prompt';
                  return (
                    <div key={i} style={{ padding:'1px 0', color: isPrompt ? 'var(--dim)' : 'var(--green)' }}
                      dangerouslySetInnerHTML={{ __html: line }} />
                  );
                })
            }
          </div>

          <div style={{ display:'flex', gap:'8px', marginTop:'8px' }}>
            <Btn onClick={loadLogs} variant="secondary" sm><RefreshIcon /> Refresh</Btn>
            <Btn onClick={() => setLogsClear(true)} variant="danger" sm>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
              Clear View
            </Btn>
          </div>
        </div>

      </div>
    </>
  );
}