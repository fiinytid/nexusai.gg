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
  type: 'success' | 'error' | 'info';
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

const DiscordIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
  </svg>
);

const RefreshIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);

const SendIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const PlusIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const ActivityIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const BellIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);

const FileIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const ShieldIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const LockIcon = ({ size = 30 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

const BackIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const UsersIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);

const StarIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const CreditIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const CardIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

const TerminalIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

const GridIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);

const TrashIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
  </svg>
);

const CheckIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const AlertIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const LoadingSpinner = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin .7s linear infinite' }}>
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function DiscordManager() {
  const [session, setSession] = useState<NexusSession | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'notifications' | 'codes' | 'commands' | 'logs'>('overview');

  const [stats, setStats] = useState({ total: 0, pro: 0, credits: 0 });
  const [statsLoading, setStatsLoading] = useState(false);

  const [statusApi, setStatusApi] = useState<StatusState>({ dot: 'checking', label: 'Checking...' });
  const [statusKv, setStatusKv] = useState<StatusState>({ dot: 'checking', label: 'Checking...' });
  const [statusAi, setStatusAi] = useState<StatusState>({ dot: 'checking', label: 'Checking...' });
  const [statusChecking, setStatusChecking] = useState(false);

  const [notifChannels, setNotifChannels] = useState<NotifChannels>({});
  const [notifType, setNotifType] = useState('general');
  const [notifMsg, setNotifMsg] = useState('');
  const [notifStatus, setNotifStatus] = useState('');
  const [notifOk, setNotifOk] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  const [redeemCode, setRedeemCode] = useState('');
  const [redeemCR, setRedeemCR] = useState('');
  const [redeemMax, setRedeemMax] = useState('');
  const [redeemExpiry, setRedeemExpiry] = useState('never');
  const [redeemStatus, setRedeemStatus] = useState('');
  const [redeemOk, setRedeemOk] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsErr, setLogsErr] = useState('');
  const [logsClear, setLogsClear] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFilter, setLogsFilter] = useState('');

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastRef = useRef(0);

  // ── Toast ──────────────────────────────────────────────────────────────────

  const addToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = ++toastRef.current;
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem('nexus_session');
      if (!raw) { setDenied(true); return; }
      const s: NexusSession = JSON.parse(raw);
      if (!s?.user) { setDenied(true); return; }

      const roles: string[] = s.data?.roles ?? [];
      const plan = s.data?.plan ?? 'free';
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
    setStatsLoading(true);
    try {
      const r = await fetch('/api/sync?list=1');
      if (!r.ok) return;
      const all = await r.json();
      const users = Object.entries(all).filter(([k]) => !k.startsWith('_')) as [string, { plan?: string; credits?: number }][];
      setStats({
        total: users.length,
        pro: users.filter(([, d]) => d?.plan === 'pro' || d?.plan === 'owner').length,
        credits: Math.round(users.reduce((s, [, d]) => s + parseFloat(String(d?.credits ?? 0)), 0)),
      });
    } catch {
      addToast('Failed to load stats', 'error');
    } finally {
      setStatsLoading(false);
    }
  }, [addToast]);

  const checkStatus = useCallback(async () => {
    setStatusChecking(true);
    setStatusApi({ dot: 'checking', label: 'Checking...' });
    setStatusKv({ dot: 'checking', label: 'Checking...' });
    setStatusAi({ dot: 'checking', label: 'Checking...' });

    try {
      const r = await fetch('/api/main', { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        setStatusApi({ dot: 'online', label: 'Online' });
        const d = await r.json().catch(() => ({}));
        setStatusAi({ dot: d.gemini ? 'online' : 'offline', label: d.gemini ? 'Configured' : 'Not configured' });
      } else {
        setStatusApi({ dot: 'offline', label: 'HTTP ' + r.status });
        setStatusAi({ dot: 'offline', label: 'Unknown' });
      }
    } catch {
      setStatusApi({ dot: 'offline', label: 'Offline' });
      setStatusAi({ dot: 'offline', label: 'Unknown' });
    }

    try {
      const r2 = await fetch('/api/sync?list=1', { signal: AbortSignal.timeout(5000) });
      setStatusKv({ dot: r2.ok ? 'online' : 'offline', label: r2.ok ? 'Online' : 'Error ' + r2.status });
    } catch {
      setStatusKv({ dot: 'offline', label: 'Offline' });
    }

    setStatusChecking(false);
  }, []);

  const loadNotifChannels = useCallback(async () => {
    try {
      const r = await fetch('/api/sync?user=_notif_channels');
      if (!r.ok) return;
      const d = await r.json();
      setNotifChannels({ payment: d.payment, report: d.report, general: d.general, newuser: d.newuser });
    } catch { /* noop */ }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsClear(false);
    setLogsErr('');
    try {
      const r = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'get_logs' }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      setLogs((d.logs ?? []).slice(0, 100));
      addToast('Logs refreshed', 'success');
    } catch (e: unknown) {
      setLogsErr('Failed to load logs: ' + (e instanceof Error ? e.message : String(e)));
      addToast('Failed to load logs', 'error');
    } finally {
      setLogsLoading(false);
    }
  }, [addToast]);

  const sendNotification = useCallback(async () => {
    if (!notifMsg.trim()) {
      setNotifStatus('Message cannot be empty.');
      setNotifOk(false);
      return;
    }
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
        addToast('Notification sent to Discord', 'success');
        setTimeout(() => setNotifStatus(''), 4000);
      } else {
        const d = await r.json().catch(() => ({}));
        const errMsg = 'Error: ' + (d.error ?? 'HTTP ' + r.status);
        setNotifStatus(errMsg);
        setNotifOk(false);
        addToast(errMsg, 'error');
      }
    } catch (e: unknown) {
      const errMsg = 'Error: ' + (e instanceof Error ? e.message : String(e));
      setNotifStatus(errMsg);
      setNotifOk(false);
      addToast(errMsg, 'error');
    } finally {
      setNotifLoading(false);
    }
  }, [notifMsg, notifType, session, addToast]);

  const addRedeemCode = useCallback(async () => {
    if (!isOwner) { addToast('Owner access required', 'error'); return; }
    const code = redeemCode.trim().toUpperCase();
    const credits = parseInt(redeemCR || '0', 10);
    const maxUses = parseInt(redeemMax || '9999', 10);

    if (!code) { setRedeemStatus('Code is required.'); setRedeemOk(false); return; }
    if (credits < 1) { setRedeemStatus('Credits must be greater than 0.'); setRedeemOk(false); return; }

    setRedeemLoading(true);
    setRedeemStatus('');
    try {
      const r = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: '_custom_codes', action: '_internal_add_code',
          code, credits, maxUses: maxUses < 1 ? 9999 : maxUses,
          expires: redeemExpiry,
        }),
      });
      if (r.ok) {
        const uses = maxUses < 1 ? 9999 : maxUses;
        setRedeemStatus(`Code ${code} created — ${credits} credits, max ${uses} uses, expires: ${redeemExpiry}.`);
        setRedeemOk(true);
        setRedeemCode(''); setRedeemCR(''); setRedeemMax(''); setRedeemExpiry('never');
        addToast(`Code ${code} created successfully`, 'success');
        setTimeout(() => setRedeemStatus(''), 5000);
      } else {
        const d = await r.json().catch(() => ({}));
        const errMsg = 'Error: ' + (d.error ?? 'HTTP ' + r.status);
        setRedeemStatus(errMsg);
        setRedeemOk(false);
        addToast(errMsg, 'error');
      }
    } catch (e: unknown) {
      const errMsg = 'Error: ' + (e instanceof Error ? e.message : String(e));
      setRedeemStatus(errMsg);
      setRedeemOk(false);
      addToast(errMsg, 'error');
    } finally {
      setRedeemLoading(false);
    }
  }, [isOwner, redeemCode, redeemCR, redeemMax, redeemExpiry, addToast]);

  const filteredLogs = logs.filter(l => {
    if (!logsFilter) return true;
    const f = logsFilter.toLowerCase();
    return (l.action ?? '').toLowerCase().includes(f) ||
      (l.user ?? '').toLowerCase().includes(f) ||
      (l.target ?? '').toLowerCase().includes(f) ||
      (l.name ?? '').toLowerCase().includes(f);
  });

  // ─── STYLES ─────────────────────────────────────────────────────────────────

  const globalCss = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600&display=swap');
    *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
    :root {
      --bg: #080c16;
      --bg2: #0d1120;
      --bg3: #111827;
      --bg4: #1a2235;
      --cyan: #38bdf8;
      --cyan-dim: rgba(56,189,248,.15);
      --cyan-glow: rgba(56,189,248,.35);
      --purple: #818cf8;
      --purple-dim: rgba(129,140,248,.15);
      --pink: #f472b6;
      --pink-dim: rgba(244,114,182,.1);
      --green: #34d399;
      --green-dim: rgba(52,211,153,.12);
      --yellow: #fbbf24;
      --yellow-dim: rgba(251,191,36,.1);
      --discord: #5865f2;
      --discord-dim: rgba(88,101,242,.15);
      --text: #cbd5e1;
      --text-muted: #64748b;
      --text-bright: #f1f5f9;
      --border: rgba(255,255,255,.07);
      --border-hover: rgba(56,189,248,.2);
      --radius: 10px;
      --radius-sm: 6px;
      --radius-lg: 14px;
    }
    html, body { min-height: 100%; font-family: 'Space Grotesk', sans-serif; background: var(--bg); color: var(--text); font-size: 14px; }
    body::before {
      content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
      background: radial-gradient(ellipse 70% 50% at 50% -10%, rgba(56,189,248,.06), transparent),
                  radial-gradient(ellipse 40% 30% at 90% 100%, rgba(129,140,248,.05), transparent);
    }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
    input, textarea, select { font-family: 'Space Grotesk', sans-serif; }
    input:focus, textarea:focus, select:focus { outline: none; border-color: var(--cyan-glow) !important; box-shadow: 0 0 0 2px var(--cyan-dim) !important; }
    input::placeholder, textarea::placeholder { color: var(--text-muted); }
    a { text-decoration: none; }
    button { cursor: pointer; }
    select { appearance: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @keyframes slide-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
    @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    .animate-fade-up { animation: fade-up .35s ease both; }
    .animate-slide-in { animation: slide-in .25s ease both; }
    .dot-online { background: var(--green) !important; box-shadow: 0 0 8px rgba(52,211,153,.5) !important; }
    .dot-offline { background: var(--pink) !important; }
    .dot-checking { background: var(--yellow) !important; animation: pulse-dot .9s ease-in-out infinite; }
    .skeleton {
      background: linear-gradient(90deg, var(--bg3) 25%, var(--bg4) 50%, var(--bg3) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s ease infinite;
      border-radius: 4px;
    }

    /* Focus-visible accessibility */
    :focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; border-radius: 4px; }

    /* Card base */
    .card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px;
      transition: border-color .2s;
    }
    .card:hover { border-color: rgba(56,189,248,.12); }
    .card-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--cyan);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Nav */
    .nav-link {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      color: var(--text-muted); font-size: 12px; font-weight: 500;
      transition: color .15s, border-color .15s, background .15s;
    }
    .nav-link:hover { color: var(--text-bright); border-color: var(--border-hover); background: var(--bg3); }

    /* Tabs */
    .tab-bar { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 2px; }
    .tab-bar::-webkit-scrollbar { height: 0; }
    .tab-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 14px; border-radius: var(--radius-sm);
      border: 1px solid transparent;
      color: var(--text-muted); font-size: 12px; font-weight: 500;
      background: transparent; white-space: nowrap;
      transition: color .15s, background .15s, border-color .15s;
    }
    .tab-btn:hover { color: var(--text); background: var(--bg3); }
    .tab-btn.active {
      color: var(--cyan); background: var(--cyan-dim);
      border-color: rgba(56,189,248,.25);
    }

    /* Stat card */
    .stat-card {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 20px;
      display: flex; flex-direction: column; gap: 6px;
      transition: border-color .2s, transform .15s;
      position: relative; overflow: hidden;
    }
    .stat-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, var(--cyan), var(--purple));
      opacity: 0; transition: opacity .2s;
    }
    .stat-card:hover::before { opacity: 1; }
    .stat-card:hover { border-color: rgba(56,189,248,.15); transform: translateY(-1px); }

    /* Form elements */
    .form-label {
      display: block; font-size: 11px; font-weight: 600;
      color: var(--text-muted); text-transform: uppercase;
      letter-spacing: 1px; margin-bottom: 6px;
    }
    .form-input {
      width: 100%; background: var(--bg3);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 9px 12px;
      color: var(--text-bright); font-size: 13px;
      transition: border-color .15s, box-shadow .15s;
    }
    .form-group { margin-bottom: 14px; }

    /* Buttons */
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 7px;
      padding: 9px 18px; border-radius: var(--radius-sm);
      font-size: 12px; font-weight: 600; letter-spacing: .3px;
      border: 1px solid transparent;
      transition: opacity .15s, transform .1s, box-shadow .15s;
      white-space: nowrap; cursor: pointer;
    }
    .btn:hover:not(:disabled) { opacity: .88; transform: translateY(-1px); }
    .btn:active:not(:disabled) { transform: none; }
    .btn:disabled { opacity: .45; cursor: not-allowed; }
    .btn-full { width: 100%; }
    .btn-sm { padding: 6px 12px; font-size: 11px; }
    .btn-discord { background: var(--discord); color: #fff; box-shadow: 0 2px 12px rgba(88,101,242,.25); }
    .btn-discord:hover:not(:disabled) { box-shadow: 0 4px 20px rgba(88,101,242,.4); }
    .btn-cyan { background: var(--cyan); color: #080c16; font-weight: 700; box-shadow: 0 2px 12px rgba(56,189,248,.2); }
    .btn-cyan:hover:not(:disabled) { box-shadow: 0 4px 20px rgba(56,189,248,.35); }
    .btn-ghost { background: var(--bg3); border-color: var(--border); color: var(--text); }
    .btn-ghost:hover:not(:disabled) { border-color: var(--border-hover); background: var(--bg4); }
    .btn-danger { background: var(--pink-dim); border-color: rgba(244,114,182,.25); color: var(--pink); }
    .btn-danger:hover:not(:disabled) { background: rgba(244,114,182,.18); }
    .btn-icon { padding: 8px; }

    /* Badge */
    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 20px;
      font-size: 10px; font-weight: 700; letter-spacing: .5px;
    }
    .badge-owner { background: var(--yellow-dim); border: 1px solid rgba(251,191,36,.25); color: var(--yellow); }
    .badge-admin { background: var(--cyan-dim); border: 1px solid rgba(56,189,248,.25); color: var(--cyan); }
    .badge-public { background: var(--green-dim); border: 1px solid rgba(52,211,153,.25); color: var(--green); }
    .badge-danger { background: var(--pink-dim); border: 1px solid rgba(244,114,182,.2); color: var(--pink); }
    .badge-discord { background: var(--discord-dim); border: 1px solid rgba(88,101,242,.25); color: var(--discord); }

    /* Status rows */
    .status-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 0; border-bottom: 1px solid var(--border);
    }
    .status-row:last-child { border-bottom: none; }
    .status-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--text-muted); flex-shrink: 0;
      transition: background .3s, box-shadow .3s;
    }

    /* Notif channel card */
    .notif-card {
      background: var(--bg3); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 12px;
      transition: border-color .15s;
    }
    .notif-card.set { border-color: rgba(52,211,153,.2); }

    /* Command rows */
    .cmd-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px; background: var(--bg3);
      border-radius: var(--radius-sm); font-size: 12px;
      transition: background .15s; gap: 8px;
    }
    .cmd-row:hover { background: var(--bg4); }
    .cmd-name {
      color: var(--discord); font-weight: 600; font-family: 'JetBrains Mono', monospace;
      font-size: 11px; flex-shrink: 0; min-width: 200px;
    }
    .cmd-desc { color: var(--text-muted); font-size: 11px; flex: 1; }

    /* Log line */
    .log-line {
      padding: 3px 0; font-family: 'JetBrains Mono', monospace;
      font-size: 11px; line-height: 1.7; border-bottom: 1px solid rgba(255,255,255,.03);
    }
    .log-line:last-child { border-bottom: none; }
    .log-line.action-prompt { color: var(--text-muted); }
    .log-line.action-other { color: var(--green); }

    /* Toasts */
    .toast {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 16px; border-radius: var(--radius);
      font-size: 12px; font-weight: 500;
      box-shadow: 0 8px 32px rgba(0,0,0,.4);
      animation: slide-in .2s ease;
      max-width: 320px; min-width: 220px;
      pointer-events: none;
    }
    .toast-success { background: var(--bg3); border: 1px solid rgba(52,211,153,.25); color: var(--green); }
    .toast-error { background: var(--bg3); border: 1px solid rgba(244,114,182,.25); color: var(--pink); }
    .toast-info { background: var(--bg3); border: 1px solid rgba(56,189,248,.25); color: var(--cyan); }

    /* Feedback message */
    .feedback {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 10px 12px; border-radius: var(--radius-sm);
      font-size: 12px; margin-top: 10px;
    }
    .feedback-success { background: var(--green-dim); color: var(--green); border: 1px solid rgba(52,211,153,.2); }
    .feedback-error { background: var(--pink-dim); color: var(--pink); border: 1px solid rgba(244,114,182,.2); }

    /* Section divider */
    .section-label {
      font-size: 10px; font-weight: 700; letter-spacing: 2px;
      text-transform: uppercase; color: var(--text-muted);
      margin: 20px 0 10px;
      display: flex; align-items: center; gap: 10px;
    }
    .section-label::after {
      content: ''; flex: 1; height: 1px; background: var(--border);
    }

    /* Search / filter input */
    .search-input {
      width: 100%; background: var(--bg4);
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 7px 12px; color: var(--text-bright); font-size: 12px;
      transition: border-color .15s, box-shadow .15s;
    }
    .search-input:focus { border-color: var(--cyan-glow); box-shadow: 0 0 0 2px var(--cyan-dim); outline: none; }

    /* Responsive */
    @media (max-width: 768px) {
      .grid-2 { grid-template-columns: 1fr !important; }
      .grid-3 { grid-template-columns: 1fr 1fr !important; }
      .cmd-name { min-width: 140px !important; }
      .hide-mobile { display: none !important; }
      .cmd-row { flex-wrap: wrap; gap: 6px; }
    }
    @media (max-width: 480px) {
      .grid-3 { grid-template-columns: 1fr !important; }
      .stat-card { padding: 16px; }
      .card { padding: 16px; }
    }
  `;

  // ─── GUARD ──────────────────────────────────────────────────────────────────

  if (denied) return (
    <>
      <style>{globalCss}</style>
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: 'rgba(8,12,22,.95)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(16px)' }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 700, letterSpacing: 1, color: 'var(--cyan)' }}>NEXUS AI</span>
        <a href="/" className="nav-link" style={{ marginLeft: 'auto' }}><BackIcon size={12} /> Back</a>
      </nav>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: 16, textAlign: 'center', padding: 24, position: 'relative', zIndex: 1 }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--pink-dim)', border: '1px solid rgba(244,114,182,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pink)' }}>
          <LockIcon size={32} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-bright)' }}>Access Denied</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.7 }}>
          This page requires <strong style={{ color: 'var(--text)' }}>Admin</strong> or <strong style={{ color: 'var(--text)' }}>Owner</strong> role.
        </div>
        <a href="/" className="btn btn-ghost" style={{ marginTop: 8, fontFamily: 'Space Grotesk', fontSize: 12 }}><BackIcon size={12} /> Go to Chat</a>
      </div>
    </>
  );

  if (!authed) return (
    <>
      <style>{globalCss}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
        <LoadingSpinner size={16} color="var(--cyan)" /> Loading session...
      </div>
    </>
  );

  // ─── PANEL ─────────────────────────────────────────────────────────────────

  const statusRows = [
    { label: 'Vercel API', state: statusApi, icon: <ActivityIcon size={12} /> },
    { label: 'Vercel KV', state: statusKv, icon: <CreditIcon size={12} /> },
    { label: 'Gemini AI', state: statusAi, icon: <ShieldIcon size={12} /> },
  ];

  const notifCardDefs: { label: string; key: keyof NotifChannels; type: string }[] = [
    { label: 'Payment', key: 'payment', type: 'payment' },
    { label: 'Bug Report', key: 'report', type: 'report' },
    { label: 'General', key: 'general', type: 'general' },
    { label: 'New User', key: 'newuser', type: 'newuser' },
  ];

  const publicCmds: [string, string][] = [
    ['/help', 'Display the full command list'],
    ['/ping', 'Check bot response latency'],
    ['/credits', 'View your current credit balance'],
    ['/redeem <code> <username>', 'Redeem a bonus code for credits'],
    ['/nexus <question>', 'Ask NEXUS AI a question'],
    ['/stats', 'View bot-wide statistics'],
    ['@NEXUS AI <message>', 'Chat directly with the AI assistant'],
  ];

  const adminCmds: [string, string][] = [
    ['/give-credits <user> <amount>', 'Add credits to a user account'],
    ['/take-credits <user> <amount>', 'Remove credits from a user account'],
    ['/set-plan <user> <plan>', 'Set a user plan (free / pro)'],
    ['/ban <user>', 'Ban a user account'],
    ['/unban <user>', 'Unban a previously banned user'],
    ['/user-info <user>', 'View detailed info for a user'],
    ['/list-users [page]', 'List all registered users, paginated'],
    ['/broadcast <message>', 'Send an announcement to all users'],
    ['/reset-credits <user>', 'Reset a user\'s credits to 30'],
    ['/clear-chat [count]', 'Delete messages in the current channel'],
  ];

  const ownerCmds: [string, string][] = [
    ['/setup-ticket', 'Set up the support ticket panel'],
    ['/set-notif-channel <type>', 'Assign a notification channel by type'],
    ['/bot-status', 'Display all system status indicators'],
    ['/add-redeem <code>', 'Add a new redeemable code'],
  ];

  const commandSections = [
    { heading: 'Public Commands', cmds: publicCmds, badgeClass: 'badge-public', badgeLabel: 'PUBLIC' },
    { heading: 'Admin Commands', cmds: adminCmds, badgeClass: 'badge-admin', badgeLabel: 'ADMIN' },
    { heading: 'Owner Commands', cmds: ownerCmds, badgeClass: 'badge-danger', badgeLabel: 'OWNER' },
  ] as const;

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: <GridIcon size={13} /> },
    { id: 'notifications' as const, label: 'Notifications', icon: <SendIcon size={13} /> },
    { id: 'codes' as const, label: 'Redeem Codes', icon: <CardIcon size={13} /> },
    { id: 'commands' as const, label: 'Commands', icon: <TerminalIcon size={13} /> },
    { id: 'logs' as const, label: 'Activity Log', icon: <FileIcon size={13} /> },
  ];

  return (
    <>
      <style>{globalCss}</style>

      {/* ── Toasts ── */}
      <div style={{ position: 'fixed', bottom: 20, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' && <CheckIcon size={14} />}
            {t.type === 'error' && <AlertIcon size={14} />}
            {t.type === 'info' && <BellIcon size={14} />}
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── Nav ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', background: 'rgba(8,12,22,.96)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(20px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,var(--cyan),var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DiscordIcon size={14} />
          </div>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700, letterSpacing: 1, color: 'var(--text-bright)' }}>NEXUS AI</span>
        </div>

        <div className="badge badge-discord hide-mobile" style={{ marginLeft: 4 }}>
          <DiscordIcon size={11} /> Discord Manager
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="hide-mobile" style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{session?.user?.username ?? '?'}</span>
          <span className={`badge ${isOwner ? 'badge-owner' : 'badge-admin'}`}><ShieldIcon size={10} />{isOwner ? 'Owner' : 'Admin'}</span>
          <a href="javascript:history.back()" className="nav-link"><BackIcon size={12} />Back</a>
        </div>
      </nav>

      {/* ── Main ── */}
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px 80px', position: 'relative', zIndex: 1 }}>

        {/* Hero */}
        <div className="animate-fade-up" style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>Discord Bot Manager</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            NEXUS AI V8.2 — {isOwner ? 'Owner Panel' : 'Admin Panel'}
          </p>
        </div>

        {/* Stats */}
        <div className="grid-3 animate-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { icon: <UsersIcon size={16} />, num: statsLoading ? '—' : stats.total, label: 'Total Users', color: 'var(--cyan)', bg: 'var(--cyan-dim)' },
            { icon: <StarIcon size={16} />, num: statsLoading ? '—' : stats.pro, label: 'Pro Users', color: 'var(--purple)', bg: 'var(--purple-dim)' },
            { icon: <CreditIcon size={16} />, num: statsLoading ? '—' : stats.credits, label: 'Total Credits', color: 'var(--yellow)', bg: 'var(--yellow-dim)' },
          ].map(s => (
            <div key={s.label} className="stat-card" onClick={loadStats} title="Click to refresh" style={{ cursor: 'pointer' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, marginBottom: 2 }}>{s.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: 'JetBrains Mono', lineHeight: 1 }}>
                {statsLoading ? <span className="skeleton" style={{ width: 60, height: 28, display: 'block' }} /> : s.num}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div className="tab-bar animate-fade-up" style={{ marginBottom: 20 }}>
          {tabs.map(tab => (
            <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div className="animate-fade-up">
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* System Status */}
              <div className="card">
                <div className="card-title"><ActivityIcon /> System Status</div>
                {statusRows.map(({ label, state, icon }) => (
                  <div key={label} className="status-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
                      {label}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-muted)' }}>
                      <div className={`status-dot dot-${state.dot}`} />
                      {state.label}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <button onClick={checkStatus} disabled={statusChecking} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>
                    {statusChecking ? <LoadingSpinner size={12} /> : <RefreshIcon size={12} />}
                    {statusChecking ? 'Checking...' : 'Refresh Status'}
                  </button>
                  <a href="/admin-panel" className="btn btn-cyan btn-sm" style={{ flex: 1, textDecoration: 'none' }}>
                    <GridIcon size={12} /> Admin Panel
                  </a>
                </div>
              </div>

              {/* Notification Channels */}
              <div className="card">
                <div className="card-title"><BellIcon /> Notification Channels</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
                  Configure via Discord:&nbsp;
                  <code style={{ background: 'var(--discord-dim)', color: 'var(--discord)', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontFamily: 'JetBrains Mono' }}>/set-notif-channel</code>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {notifCardDefs.map(nc => {
                    const val = notifChannels[nc.key];
                    return (
                      <div key={nc.key} className={`notif-card ${val ? 'set' : ''}`}>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 4 }}>{nc.label}</div>
                        <div style={{ fontSize: 12, color: val ? 'var(--green)' : 'var(--text-muted)', fontFamily: 'JetBrains Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {val ?? 'Not configured'}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={loadNotifChannels} className="btn btn-ghost btn-sm" style={{ marginTop: 12, width: '100%' }}>
                  <RefreshIcon size={12} /> Refresh Channels
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ── NOTIFICATIONS TAB ── */}
        {activeTab === 'notifications' && (
          <div className="animate-fade-up">
            <div className="card" style={{ maxWidth: 560 }}>
              <div className="card-title"><SendIcon /> Send Notification to Discord</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.6 }}>
                Send an admin notification to the configured Discord channel for the selected type.
              </p>

              <div className="form-group">
                <label className="form-label">Notification Type</label>
                <select value={notifType} onChange={e => setNotifType(e.target.value)} className="form-input">
                  <option value="general">General</option>
                  <option value="payment">Payment</option>
                  <option value="report">Bug Report</option>
                  <option value="newuser">New User</option>
                </select>
              </div>

              {notifType && notifChannels[notifType as keyof NotifChannels] && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckIcon size={11} /> Sending to channel:&nbsp;
                  <code style={{ color: 'var(--green)', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{notifChannels[notifType as keyof NotifChannels]}</code>
                </div>
              )}
              {notifType && !notifChannels[notifType as keyof NotifChannels] && (
                <div style={{ fontSize: 11, color: 'var(--yellow)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertIcon size={11} /> Channel not configured for this type.
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea
                  value={notifMsg}
                  onChange={e => setNotifMsg(e.target.value)}
                  placeholder="Write your notification message here..."
                  className="form-input"
                  style={{ minHeight: 100, resize: 'vertical', lineHeight: 1.6 }}
                  onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') sendNotification(); }}
                />
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Press Ctrl+Enter to send</div>
              </div>

              <button onClick={sendNotification} disabled={notifLoading || !notifMsg.trim()} className="btn btn-discord btn-full">
                {notifLoading ? <LoadingSpinner size={13} color="#fff" /> : <SendIcon size={13} />}
                {notifLoading ? 'Sending...' : 'Send to Discord'}
              </button>

              {notifStatus && (
                <div className={`feedback feedback-${notifOk ? 'success' : 'error'}`}>
                  {notifOk ? <CheckIcon size={13} /> : <AlertIcon size={13} />}
                  {notifStatus}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CODES TAB ── */}
        {activeTab === 'codes' && (
          <div className="animate-fade-up">
            {!isOwner && (
              <div className="feedback feedback-error" style={{ marginBottom: 16, fontSize: 13 }}>
                <AlertIcon size={14} /> This section requires <strong>Owner</strong> access.
              </div>
            )}
            <div className="card" style={{ maxWidth: 560, opacity: isOwner ? 1 : .5, pointerEvents: isOwner ? 'auto' : 'none' }}>
              <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
                <CardIcon /> Add Redeem Code
                <span className="badge badge-danger" style={{ marginLeft: 'auto', fontSize: 9 }}>OWNER ONLY</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.6 }}>
                Create promotional redeem codes that users can activate via <code style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--discord)' }}>/redeem</code> in Discord.
              </p>

              <div className="form-group">
                <label className="form-label">Code</label>
                <input
                  type="text"
                  value={redeemCode}
                  onChange={e => setRedeemCode(e.target.value.toUpperCase())}
                  placeholder="NEXUS2026"
                  className="form-input"
                  style={{ textTransform: 'uppercase', fontFamily: 'JetBrains Mono', letterSpacing: 1 }}
                  maxLength={24}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Credits to Award</label>
                  <input type="number" value={redeemCR} onChange={e => setRedeemCR(e.target.value)} placeholder="100" min={1} max={999999} className="form-input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Max Uses</label>
                  <input type="number" value={redeemMax} onChange={e => setRedeemMax(e.target.value)} placeholder="9999" min={1} className="form-input" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Expiry</label>
                <select value={redeemExpiry} onChange={e => setRedeemExpiry(e.target.value)} className="form-input">
                  <option value="never">Never expires</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                </select>
              </div>

              <button onClick={addRedeemCode} disabled={redeemLoading || !isOwner} className="btn btn-cyan btn-full">
                {redeemLoading ? <LoadingSpinner size={13} color="var(--bg)" /> : <PlusIcon size={13} />}
                {redeemLoading ? 'Creating Code...' : 'Create Code'}
              </button>

              {redeemStatus && (
                <div className={`feedback feedback-${redeemOk ? 'success' : 'error'}`}>
                  {redeemOk ? <CheckIcon size={13} /> : <AlertIcon size={13} />}
                  {redeemStatus}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── COMMANDS TAB ── */}
        {activeTab === 'commands' && (
          <div className="animate-fade-up">
            <div className="card">
              <div className="card-title"><TerminalIcon /> Bot Commands Reference</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.6 }}>
                All slash commands available in the NEXUS AI Discord bot. Commands are scoped by access level.
              </p>

              {commandSections.map(section => (
                <div key={section.heading}>
                  <div className="section-label">
                    <span className={`badge ${section.badgeClass}`}>{section.badgeLabel}</span>
                    {section.heading}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {section.cmds.map(([name, desc]) => (
                      <div key={name} className="cmd-row">
                        <span className="cmd-name">{name}</span>
                        <span className="cmd-desc hide-mobile">{desc}</span>
                        <span className={`badge ${section.badgeClass} hide-mobile`} style={{ marginLeft: 'auto', flexShrink: 0 }}>{section.badgeLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── LOGS TAB ── */}
        {activeTab === 'logs' && (
          <div className="animate-fade-up">
            <div className="card">
              <div className="card-title"><FileIcon /> Activity Log</div>

              {/* Controls */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={logsFilter}
                  onChange={e => setLogsFilter(e.target.value)}
                  placeholder="Filter by action, user, target..."
                  className="search-input"
                  style={{ flex: 1, minWidth: 180 }}
                />
                <button onClick={loadLogs} disabled={logsLoading} className="btn btn-ghost btn-sm">
                  {logsLoading ? <LoadingSpinner size={12} /> : <RefreshIcon size={12} />}
                  Refresh
                </button>
                <button onClick={() => { setLogsClear(true); setLogsFilter(''); }} className="btn btn-danger btn-sm">
                  <TrashIcon size={12} /> Clear View
                </button>
              </div>

              {/* Log count info */}
              {!logsClear && !logsErr && logs.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Showing {filteredLogs.length} of {logs.length} entries
                  {logsFilter ? ` matching "${logsFilter}"` : ' (latest 100)'}
                </div>
              )}

              {/* Log box */}
              <div style={{ background: 'rgba(0,0,0,.3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', height: 280, overflowY: 'auto' }}>
                {logsClear ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, paddingTop: 8 }}>Log view cleared. Click Refresh to reload.</div>
                ) : logsLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12, paddingTop: 8 }}>
                    <LoadingSpinner size={13} color="var(--cyan)" /> Loading logs...
                  </div>
                ) : logsErr ? (
                  <div style={{ color: 'var(--pink)', fontSize: 12, paddingTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertIcon size={13} /> {logsErr}
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, paddingTop: 8 }}>
                    {logsFilter ? `No entries match "${logsFilter}".` : 'No activity logs available.'}
                  </div>
                ) : (
                  filteredLogs.map((l, i) => {
                    const t = l.ts ? new Date(l.ts).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—';
                    const line = esc(`[${t}] ${l.action ?? '—'} · ${l.user ?? '?'} → ${l.target ?? '—'}${l.name ? ` (${l.name})` : ''}`);
                    const isPrompt = l.action === 'prompt';
                    return (
                      <div key={i} className={`log-line ${isPrompt ? 'action-prompt' : 'action-other'}`}
                        dangerouslySetInnerHTML={{ __html: line }} />
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}