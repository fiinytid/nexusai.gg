'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  NEXUS AI — Admin Panel  ·  Enhanced Security Edition
// ───────────────────────────────────────────────────────────────────────────
//  SERVER ENV YANG WAJIB DISET (di .env.local / deployment env):
//
//    ADMIN_TOKEN=your_super_secret_admin_token_here
//
//  Semua API route harus memvalidasi:
//    if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
//      return res.status(401).json({ error: 'Unauthorized' });
//    }
//
//  AKSES: Hanya role "owner" dan "admin" yang diizinkan masuk panel.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface UserData {
  credits?: number;
  plan?: string;
  robloxId?: string;
  banned?: boolean;
  banReason?: string;
  googleEmail?: string;
  roles?: string[];
  _updated?: string;
}

interface Report {
  id: string;
  type: string;
  from: string;
  status: string;
  time?: string;
  message?: string;
  paymentCR?: string;
  paymentPack?: string;
  paymentMethod?: string;
  paymentTotal?: string;
  transactionId?: string;
}

interface RedeemCode {
  code: string;
  credits: number;
  uses: number;
  maxUses: number;
  expiresAt?: string;
  createdAt?: string;
}

interface Log {
  ts?: string;
  action?: string;
  user?: string;
  target?: string;
  name?: string;
  details?: string;
}

interface Toast {
  id: number;
  msg: string;
  color: string;
}

interface Stats {
  total: number;
  pro: number;
  active: number;
  credits: number;
}

interface SecurityEvent {
  ts: string;
  type: 'login_ok' | 'login_fail' | 'lockout' | 'role_denied' | 'fp_mismatch' | 'session_expired' | 'logout' | 'action';
  detail: string;
}

type TabName = 'overview' | 'users' | 'reports' | 'codes' | 'inbox' | 'logs' | 'security';

// ─── SECURITY LAYER ──────────────────────────────────────────────────────────

/** XOR-obfuscation untuk localStorage – mencegah plain-text token di storage */
const _OBF = 'nxa_sec_2025_obfs_layer_v2';
function obfs(s: string): string {
  try {
    const encoded = encodeURIComponent(s);
    const xored = encoded.split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ _OBF.charCodeAt(i % _OBF.length))
    ).join('');
    return btoa(xored);
  } catch { return ''; }
}
function deobfs(s: string): string {
  try {
    const xored = atob(s);
    const decoded = xored.split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ _OBF.charCodeAt(i % _OBF.length))
    ).join('');
    return decodeURIComponent(decoded);
  } catch { return ''; }
}

/** Browser fingerprint – mengikat sesi ke browser tertentu */
function getBrowserFP(): string {
  try {
    const parts = [
      navigator.userAgent.slice(0, 64),
      navigator.language,
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      String(new Date().getTimezoneOffset()),
      String(navigator.hardwareConcurrency ?? 2),
      String(navigator.maxTouchPoints ?? 0),
    ];
    // FNV-1a hash
    let h = 0x811c9dc5 >>> 0;
    const str = parts.join('|||');
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36).padStart(7, '0');
  } catch { return 'fp_unknown'; }
}

/** Nonce unik per-request – anti-replay */
function genNonce(): string {
  const arr = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Validasi apakah role user diizinkan mengakses panel admin */
const ALLOWED_ROLES = new Set(['owner', 'admin']);
function hasAdminRole(data: UserData | null): boolean {
  if (!data) return false;
  const plan = data.plan ?? '';
  const roles = data.roles ?? [];
  return plan === 'owner' || roles.some(r => ALLOWED_ROLES.has(r));
}

/** Sanitasi input – strip null bytes, limit panjang, encode HTML entities */
function sanitize(str: unknown, maxLen = 2000): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\0/g, '')
    .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .substring(0, maxLen)
    .trim();
}

function escHtml(str: string | number | undefined | null): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const SEC = {
  MAX_ATTEMPTS: 5,
  /** Progressive lockout: makin sering gagal, makin lama dikunci */
  LOCKOUT_SECS: [60, 180, 600, 1800, 3600] as const,
  SESSION_MS: 30 * 60 * 1000,   // 30 menit
  WARN_MS: 5 * 60 * 1000,       // warn 5 menit sebelum expire
  HIDDEN_MS: 15 * 60 * 1000,    // auto-logout jika tab tersembunyi >15 menit
  /** Kunci storage – nama tidak informatif untuk menyulitkan reverse engineering */
  K: {
    TOKEN:    'nxa_s1', // obfuscated admin token
    ATTEMPT:  'nxa_a1', // jumlah percobaan gagal
    LOCKOUT:  'nxa_l1', // timestamp akhir lockout
    L_COUNT:  'nxa_l2', // berapa kali pernah dikunci (untuk progressive)
    FP:       'nxa_fp', // browser fingerprint saat login
    EV_LOG:   'nxa_ev', // security event log
  },
};

const PER_PAGE = 20;
const RPT_PER_PAGE = 15;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function fmtDate(ts?: string): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('id-ID', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(ts); }
}

function fmtRelative(ts?: string): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  if (isNaN(diff)) return '—';
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function getStore(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}
function setStore(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* noop */ }
}
function delStore(key: string): void {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

function logSecEvent(type: SecurityEvent['type'], detail: string): void {
  try {
    const raw = getStore(SEC.K.EV_LOG);
    const events: SecurityEvent[] = raw ? JSON.parse(deobfs(raw)) : [];
    events.unshift({ ts: new Date().toISOString(), type, detail });
    if (events.length > 50) events.length = 50; // keep last 50
    setStore(SEC.K.EV_LOG, obfs(JSON.stringify(events)));
  } catch { /* noop */ }
}

function readSecEvents(): SecurityEvent[] {
  try {
    const raw = getStore(SEC.K.EV_LOG);
    return raw ? JSON.parse(deobfs(raw)) : [];
  } catch { return []; }
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function AdminPanel() {

  // ── Auth state ──────────────────────────────────────────────────────────
  const [adminToken, setAdminToken]       = useState('');
  const [loginInput, setLoginInput]       = useState('');
  const [showPass, setShowPass]           = useState(false);
  const [loginErr, setLoginErr]           = useState('');
  const [loginOk, setLoginOk]             = useState('');
  const [loginLoading, setLoginLoading]   = useState(false);
  const [loginStep, setLoginStep]         = useState<'token' | 'verifying_role' | 'done'>('token');
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil]   = useState(0);
  const [lockoutRemain, setLockoutRemain] = useState(0);
  const [lockoutCount, setLockoutCount]   = useState(0);
  const [showLogin, setShowLogin]         = useState(true);
  const [roleDenied, setRoleDenied]       = useState(false); // akses ditolak karena role
  const [sessionUser, setSessionUser]     = useState('Token Auth');
  const [sessionLabel, setSessionLabel]   = useState('🔑 Admin Token');
  const [sessionRole, setSessionRole]     = useState('');   // role yang terverifikasi
  const [inactivityWarn, setInactivityWarn] = useState(false);
  const [secEvents, setSecEvents]           = useState<SecurityEvent[]>([]);
  const [fpMismatch, setFpMismatch]         = useState(false);

  // ── Tabs ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabName>('overview');

  // ── Stats ────────────────────────────────────────────────────────────────
  const [stats, setStats]                 = useState<Stats>({ total: 0, pro: 0, active: 0, credits: 0 });
  const [pendingPayments, setPendingPayments] = useState<Report[]>([]);

  // ── Users ────────────────────────────────────────────────────────────────
  const [allUsers, setAllUsers]       = useState<[string, UserData][]>([]);
  const [userSearch, setUserSearch]   = useState('');
  const [userPage, setUserPage]       = useState(1);
  const [usersLoaded, setUsersLoaded] = useState(false);

  // ── User lookup ──────────────────────────────────────────────────────────
  const [lookupInput, setLookupInput]     = useState('');
  const [foundUser, setFoundUser]         = useState('');
  const [foundData, setFoundData]         = useState<UserData | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // ── Quick manage ─────────────────────────────────────────────────────────
  const [qUsername, setQUsername]     = useState('');
  const [qAmount, setQAmount]         = useState(50);
  const [qStatus, setQStatus]         = useState('');
  const [qStatusType, setQStatusType] = useState<'ok'|'err'|'info'>('info');

  // ── Credits manage ───────────────────────────────────────────────────────
  const [credU, setCredU]         = useState('');
  const [credAmt, setCredAmt]     = useState('');
  const [credPlan, setCredPlan]   = useState('');
  const [credSt, setCredSt]       = useState('');
  const [credStType, setCredStType] = useState<'ok'|'err'|'info'>('info');

  // ── Ban/Unban ────────────────────────────────────────────────────────────
  const [banU, setBanU]             = useState('');
  const [banReason, setBanReason]   = useState('');
  const [banSt, setBanSt]           = useState('');
  const [banStType, setBanStType]   = useState<'ok'|'err'|'info'>('info');

  // ── Set Plan ─────────────────────────────────────────────────────────────
  const [planU, setPlanU]           = useState('');
  const [planChoice, setPlanChoice] = useState('free');
  const [planCR, setPlanCR]         = useState('');
  const [planSt, setPlanSt]         = useState('');
  const [planStType, setPlanStType] = useState<'ok'|'err'|'info'>('info');

  // ── Reports ──────────────────────────────────────────────────────────────
  const [allReports, setAllReports]   = useState<Report[]>([]);
  const [rptType, setRptType]         = useState('');
  const [rptStatus, setRptStatus]     = useState('');
  const [rptFrom, setRptFrom]         = useState('');
  const [rptPage, setRptPage]         = useState(1);
  const [rptModalOpen, setRptModalOpen]       = useState(false);
  const [currentReport, setCurrentReport]     = useState<Report | null>(null);
  const [rptAdminNote, setRptAdminNote]       = useState('');
  const [rptModalSt, setRptModalSt]           = useState('');
  const [rptModalStType, setRptModalStType]   = useState<'ok'|'err'|'info'>('info');
  const [rptModalProcessing, setRptModalProcessing] = useState(false);

  // ── Redeem Codes ─────────────────────────────────────────────────────────
  const [codes, setCodes]           = useState<RedeemCode[]>([]);
  const [codeCredits, setCodeCredits] = useState(50);
  const [codeUses, setCodeUses]       = useState(10);
  const [codeExpiry, setCodeExpiry]   = useState('');
  const [codeSt, setCodeSt]           = useState('');
  const [codeStType, setCodeStType]   = useState<'ok'|'err'|'info'>('info');

  // ── Inbox ────────────────────────────────────────────────────────────────
  const [inboxTo, setInboxTo]           = useState('');
  const [inboxSubject, setInboxSubject] = useState('');
  const [inboxContent, setInboxContent] = useState('');
  const [inboxType, setInboxType]       = useState('general');
  const [inboxSt, setInboxSt]           = useState('');
  const [inboxStType, setInboxStType]   = useState<'ok'|'err'|'info'>('info');
  const [bcRecipients, setBcRecipients] = useState('');
  const [bcSubject, setBcSubject]       = useState('');
  const [bcContent, setBcContent]       = useState('');
  const [bcSt, setBcSt]                 = useState('');
  const [bcStType, setBcStType]         = useState<'ok'|'err'|'info'>('info');

  // ── Logs ─────────────────────────────────────────────────────────────────
  const [logs, setLogs]         = useState<Log[]>([]);
  const [history, setHistory]   = useState<Log[]>([]);
  const [logFilter, setLogFilter] = useState('');

  // ── Toasts ───────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  // ── Timers ───────────────────────────────────────────────────────────────
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockoutIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hiddenTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Tab visibility: auto-logout jika tersembunyi terlalu lama ────────────
  useEffect(() => {
    const onVisChange = () => {
      if (document.hidden) {
        hiddenTimerRef.current = setTimeout(() => {
          if (adminToken) {
            logSecEvent('session_expired', 'Auto-logout: tab hidden > 15min');
            addToast('⏱ Auto-logout: tab tersembunyi terlalu lama.', 'var(--yellow)');
            doLogout();
          }
        }, SEC.HIDDEN_MS);
      } else {
        if (hiddenTimerRef.current) clearTimeout(hiddenTimerRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      if (hiddenTimerRef.current) clearTimeout(hiddenTimerRef.current);
    };
  }, [adminToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toast helper ─────────────────────────────────────────────────────────
  const addToast = useCallback((msg: string, color = 'var(--cyan)') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, msg, color }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // ── API helper – setiap request disertai nonce + fingerprint ─────────────
  const api = useCallback(async (
    url: string,
    opts?: { method?: string; body?: Record<string, unknown> },
    token?: string
  ) => {
    const tok = token ?? adminToken;
    if (!tok) return { ok: false, status: 401, data: { error: 'No token.' } };

    // Sanitasi body
    const body = opts?.body;
    let cleanedBody: Record<string, unknown> | undefined;
    if (body) {
      cleanedBody = {};
      for (const k of Object.keys(body)) {
        const v = body[k];
        cleanedBody[k] = typeof v === 'string' ? sanitize(v) : v;
      }
    }

    const nonce = genNonce();
    const fp    = getBrowserFP();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + tok,
      'X-Admin-Token': tok,         // ← server validasi ini vs process.env.ADMIN_TOKEN
      'X-Requested-With': 'XMLHttpRequest',
      'X-Nonce': nonce,             // anti-replay per-request
      'X-Client-FP': fp,            // fingerprint binding
      'X-Request-Time': String(Date.now()),
    };

    const init: RequestInit = {
      method: opts?.method ?? 'GET',
      headers,
      ...(cleanedBody ? { body: JSON.stringify(cleanedBody) } : {}),
    };

    try {
      const r = await fetch(url, init);
      let data: Record<string, unknown>;
      try { data = await r.json(); }
      catch { data = { error: 'Invalid JSON (' + r.status + ')' }; }

      if (r.status === 401) {
        addToast('⛔ Unauthorized — token tidak valid atau kadaluarsa.', 'var(--pink)');
        logSecEvent('session_expired', 'API returned 401 on ' + url);
      }
      if (r.status === 403) {
        addToast('🚫 Forbidden — akses ditolak server.', 'var(--pink)');
        logSecEvent('role_denied', 'API returned 403 on ' + url);
      }
      return { ok: r.ok, status: r.status, data };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, status: 0, data: { error: 'Network error: ' + msg } };
    }
  }, [adminToken, addToast]);

  // ── Inactivity tracker ───────────────────────────────────────────────────
  const resetActivity = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    setInactivityWarn(false);
    if (!adminToken) return;
    warnTimerRef.current = setTimeout(() => setInactivityWarn(true), SEC.SESSION_MS - SEC.WARN_MS);
    inactivityTimerRef.current = setTimeout(() => {
      logSecEvent('session_expired', 'Inactivity timeout');
      addToast('⏱ Session expired karena tidak aktif.', 'var(--yellow)');
      doLogout();
    }, SEC.SESSION_MS);
  }, [adminToken, addToast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const evs = ['mousemove','keydown','click','scroll','touchstart'];
    evs.forEach(e => document.addEventListener(e, resetActivity, { passive: true }));
    return () => evs.forEach(e => document.removeEventListener(e, resetActivity));
  }, [resetActivity]);

  // ── Progressive lockout countdown ────────────────────────────────────────
  useEffect(() => {
    if (lockoutUntil && lockoutUntil > Date.now()) {
      lockoutIntervalRef.current = setInterval(() => {
        const remain = lockoutUntil - Date.now();
        if (remain <= 0) {
          setLockoutRemain(0);
          setLockoutUntil(0);
          setLoginAttempts(0);
          setLoginErr('Kamu bisa mencoba lagi sekarang.');
          delStore(SEC.K.LOCKOUT);
          delStore(SEC.K.ATTEMPT);
          if (lockoutIntervalRef.current) clearInterval(lockoutIntervalRef.current);
        } else {
          setLockoutRemain(Math.ceil(remain / 1000));
        }
      }, 1000);
    }
    return () => { if (lockoutIntervalRef.current) clearInterval(lockoutIntervalRef.current); };
  }, [lockoutUntil]);

  // ── Auto-refresh pending payments ─────────────────────────────────────────
  useEffect(() => {
    if (!adminToken) return;
    const iv = setInterval(() => {
      if (!document.hidden) loadPendingPayments();
    }, 30000);
    return () => clearInterval(iv);
  }, [adminToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Boot: cek token tersimpan ─────────────────────────────────────────────
  useEffect(() => {
    // Load security event log
    setSecEvents(readSecEvents());

    // Restore lockout state
    const lockTs    = parseInt(getStore(SEC.K.LOCKOUT) || '0', 10);
    const lockCnt   = parseInt(getStore(SEC.K.L_COUNT) || '0', 10);
    const attempts  = parseInt(getStore(SEC.K.ATTEMPT) || '0', 10);
    if (lockTs && Date.now() < lockTs) setLockoutUntil(lockTs);
    setLockoutCount(lockCnt);
    setLoginAttempts(attempts);

    // Coba resume sesi
    const saved = getStore(SEC.K.TOKEN);
    if (!saved) return;
    const tok = deobfs(saved);
    if (!tok) { delStore(SEC.K.TOKEN); return; }

    // Verifikasi fingerprint cocok
    const savedFP = getStore(SEC.K.FP);
    const curFP   = getBrowserFP();
    if (savedFP && savedFP !== curFP) {
      delStore(SEC.K.TOKEN);
      delStore(SEC.K.FP);
      logSecEvent('fp_mismatch', `Stored FP ${savedFP} ≠ current ${curFP}`);
      setFpMismatch(true);
      setLoginErr('⚠ Sesi tidak valid: browser berbeda terdeteksi. Silakan login ulang.');
      return;
    }

    setLoginOk('⟳ Melanjutkan sesi...');
    setLoginLoading(true);
    setLoginStep('verifying_role');

    fetch('/api/sync?admin_check=1', {
      headers: {
        'Authorization': 'Bearer ' + tok,
        'X-Admin-Token': tok,
        'X-Requested-With': 'XMLHttpRequest',
        'X-Nonce': genNonce(),
        'X-Client-FP': curFP,
      },
    }).then(async r => {
      if (!r.ok) {
        delStore(SEC.K.TOKEN);
        delStore(SEC.K.FP);
        setLoginOk('');
        setLoginErr('Sesi sebelumnya sudah kadaluarsa. Silakan login kembali.');
        setLoginLoading(false);
        setLoginStep('token');
        logSecEvent('session_expired', 'Resume failed: server rejected token');
        return;
      }
      // Token valid, sekarang verifikasi role
      const roleOk = await verifyRole(tok);
      if (!roleOk) {
        delStore(SEC.K.TOKEN);
        delStore(SEC.K.FP);
        setLoginOk('');
        setLoginStep('token');
        setLoginLoading(false);
        return;
      }
      setAdminToken(tok);
      setLoginOk('✅ Sesi dilanjutkan!');
      setTimeout(() => { setShowLogin(false); mountPanel(tok); }, 400);
    }).catch(() => {
      setLoginLoading(false);
      setLoginOk('');
      setLoginStep('token');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Verifikasi role setelah token valid ──────────────────────────────────
  /**
   * Mengambil data user yang sedang login via nexus_session,
   * lalu memastikan role = owner atau admin.
   * Jika tidak bisa verifikasi via session, trust server validation saja.
   */
  const verifyRole = useCallback(async (tok: string): Promise<boolean> => {
    // 1. Cek nexus_session di localStorage
    try {
      const raw = localStorage.getItem('nexus_session');
      if (raw) {
        const session = JSON.parse(raw);
        if (session?.user && session?.data) {
          const sdata = session.data as UserData;
          const roles: string[] = sdata.roles ?? [];
          const isOwner = sdata.plan === 'owner' || roles.includes('owner');
          const isAdmin = isOwner || roles.includes('admin');
          if (!isAdmin) {
            setRoleDenied(true);
            setLoginErr('🚫 Akses ditolak: Hanya Owner dan Admin yang bisa mengakses panel ini.');
            logSecEvent('role_denied', `User role denied: plan=${sdata.plan} roles=${roles.join(',')}`);
            addToast('🚫 Akses ditolak. Role tidak mencukupi.', 'var(--pink)');
            return false;
          }
          const label = isOwner ? '⭐ Owner' : '🛡 Admin';
          const uname = '@' + (session.user.username ?? '?');
          const role  = isOwner ? 'owner' : 'admin';
          setSessionLabel(label);
          setSessionUser(uname);
          setSessionRole(role);
          logSecEvent('login_ok', `Role verified: ${uname} as ${role}`);
          return true;
        }
      }
    } catch { /* fallback ke server check */ }

    // 2. Fallback: minta data dari server (jika ada endpoint /api/sync?me=1)
    try {
      const r = await fetch('/api/sync?admin_role_check=1', {
        headers: {
          'Authorization': 'Bearer ' + tok,
          'X-Admin-Token': tok,
          'X-Requested-With': 'XMLHttpRequest',
          'X-Nonce': genNonce(),
          'X-Client-FP': getBrowserFP(),
        },
      });
      if (r.ok) {
        const data = await r.json() as UserData & { username?: string };
        if (!hasAdminRole(data)) {
          setRoleDenied(true);
          setLoginErr('🚫 Akses ditolak: Role tidak mencukupi untuk mengakses panel admin.');
          logSecEvent('role_denied', 'Server role check failed');
          addToast('🚫 Role tidak diizinkan.', 'var(--pink)');
          return false;
        }
        const roles: string[] = data.roles ?? [];
        const role = data.plan === 'owner' || roles.includes('owner') ? 'owner' : 'admin';
        setSessionLabel(role === 'owner' ? '⭐ Owner' : '🛡 Admin');
        setSessionUser(data.username ? '@' + data.username : 'Admin');
        setSessionRole(role);
        logSecEvent('login_ok', `Server role verified as ${role}`);
        return true;
      }
    } catch { /* noop */ }

    // 3. Last resort: token valid di server = percaya. Tapi tandai sebagai token-only auth.
    setSessionLabel('🔑 Token Auth');
    setSessionUser('Admin');
    setSessionRole('admin');
    logSecEvent('login_ok', 'Token-only auth (role unverifiable – server accepted token)');
    return true;
  }, [addToast]);

  // ── Mount panel setelah auth ──────────────────────────────────────────────
  const mountPanel = useCallback((tok: string) => {
    resetActivity();
    setTimeout(() => {
      loadStats(tok);
      loadPendingPaymentsWithToken(tok);
    }, 100);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Login ─────────────────────────────────────────────────────────────────
  const doLogin = async () => {
    setLoginErr('');
    setLoginOk('');
    setRoleDenied(false);

    const now = Date.now();
    if (lockoutUntil && now < lockoutUntil) return;

    const token = sanitize(loginInput);
    if (!token) { setLoginErr('Token tidak boleh kosong.'); return; }
    if (token.length < 8)   { setLoginErr('Token terlalu pendek.'); return; }
    if (token.length > 512) { setLoginErr('Token terlalu panjang.'); return; }
    // Cegah karakter berbahaya di token
    if (/[\x00-\x1f\x7f]/.test(token)) { setLoginErr('Token mengandung karakter tidak valid.'); return; }

    setLoginLoading(true);
    setLoginStep('verifying_role');
    setLoginOk('⟳ Memverifikasi token...');

    try {
      const fp = getBrowserFP();
      const r = await fetch('/api/sync?admin_check=1', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
          'X-Admin-Token': token,
          'X-Requested-With': 'XMLHttpRequest',
          'X-Nonce': genNonce(),
          'X-Client-FP': fp,
        },
      });

      if (r.status === 401 || r.status === 403) {
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);
        setStore(SEC.K.ATTEMPT, String(newAttempts));
        logSecEvent('login_fail', `Attempt ${newAttempts}/${SEC.MAX_ATTEMPTS} – status ${r.status}`);

        if (newAttempts >= SEC.MAX_ATTEMPTS) {
          // Progressive lockout
          const newLockCnt = lockoutCount + 1;
          const lockSecs   = SEC.LOCKOUT_SECS[Math.min(newLockCnt - 1, SEC.LOCKOUT_SECS.length - 1)];
          const lockTs     = Date.now() + lockSecs * 1000;
          setLockoutUntil(lockTs);
          setLockoutCount(newLockCnt);
          setStore(SEC.K.LOCKOUT, String(lockTs));
          setStore(SEC.K.L_COUNT, String(newLockCnt));
          delStore(SEC.K.ATTEMPT);
          setLoginAttempts(0);
          const menit = lockSecs >= 60 ? Math.ceil(lockSecs / 60) + ' menit' : lockSecs + ' detik';
          setLoginErr(`🔒 Terlalu banyak percobaan gagal. Dikunci selama ${menit}.`);
          logSecEvent('lockout', `Locked for ${lockSecs}s (count #${newLockCnt})`);
        } else {
          const left = SEC.MAX_ATTEMPTS - newAttempts;
          setLoginErr(`✗ Token tidak valid. ${left} percobaan tersisa.`);
          setLoginInput('');
        }
        setLoginLoading(false);
        setLoginStep('token');
        return;
      }

      let data: Record<string, unknown> = {};
      try { data = await r.json(); } catch { /* noop */ }

      if (!r.ok) {
        setLoginErr('✗ ' + (data.error as string ?? 'Autentikasi gagal.'));
        setLoginLoading(false);
        setLoginStep('token');
        return;
      }

      // Token valid – verifikasi role
      setLoginOk('✅ Token valid. Memverifikasi role...');
      const fp2    = getBrowserFP();
      const roleOk = await verifyRole(token);
      if (!roleOk) {
        setLoginLoading(false);
        setLoginStep('token');
        return;
      }

      // Semua oke – simpan session
      setAdminToken(token);
      setStore(SEC.K.TOKEN, obfs(token));
      setStore(SEC.K.FP, fp2);
      setLoginAttempts(0);
      setStore(SEC.K.ATTEMPT, '0');
      delStore(SEC.K.LOCKOUT);
      setLoginOk('✅ Terautentikasi! Memuat panel...');
      setLoginStep('done');
      setSecEvents(readSecEvents());

      setTimeout(() => {
        setShowLogin(false);
        mountPanel(token);
      }, 600);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoginErr('✗ Network error: ' + msg);
      setLoginLoading(false);
      setLoginStep('token');
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const doLogout = useCallback(() => {
    logSecEvent('logout', `User ${sessionUser} logged out`);
    // Bersihkan semua state sensitif
    setAdminToken('');
    delStore(SEC.K.TOKEN);
    delStore(SEC.K.FP);
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (warnTimerRef.current)       clearTimeout(warnTimerRef.current);
    if (hiddenTimerRef.current)     clearTimeout(hiddenTimerRef.current);
    setShowLogin(true);
    setLoginInput('');
    setLoginErr('');
    setLoginOk('');
    setLoginLoading(false);
    setLoginStep('token');
    setSessionUser('Token Auth');
    setSessionLabel('🔑 Admin Token');
    setSessionRole('');
    setRoleDenied(false);
    setFpMismatch(false);
    setInactivityWarn(false);
    // Bersihkan data panel
    setAllUsers([]);
    setAllReports([]);
    setCodes([]);
    setLogs([]);
    setHistory([]);
    setPendingPayments([]);
    setFoundUser('');
    setFoundData(null);
    addToast('Berhasil keluar.', 'var(--dim)');
  }, [sessionUser, addToast]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const loadStats = useCallback(async (tok?: string) => {
    const r = await api('/api/sync?list=1', undefined, tok);
    if (!r.ok) return;
    const entries = Object.entries(r.data ?? {}).filter(
      ([k]) => !k.startsWith('_')
    ) as [string, UserData][];
    setAllUsers(entries.sort((a, b) => (b[1]?.credits ?? 0) - (a[1]?.credits ?? 0)));
    const today = new Date().toDateString();
    setStats({
      total:   entries.length,
      pro:     entries.filter(([, d]) => d?.plan === 'pro' || d?.plan === 'owner').length,
      active:  entries.filter(([, d]) => d?._updated && new Date(d._updated).toDateString() === today).length,
      credits: entries.reduce((s, [, d]) => s + parseFloat(String(d?.credits ?? 0)), 0),
    });
  }, [api]);

  const loadPendingPayments = useCallback(async () => {
    const r = await api('/api/report?status=pending&type=payment&limit=5');
    if (!r.ok) return;
    setPendingPayments((r.data as { reports?: Report[] })?.reports ?? []);
  }, [api]);

  const loadPendingPaymentsWithToken = useCallback(async (tok: string) => {
    const r = await api('/api/report?status=pending&type=payment&limit=5', undefined, tok);
    if (!r.ok) return;
    setPendingPayments((r.data as { reports?: Report[] })?.reports ?? []);
  }, [api]);

  // ── Tab switching ─────────────────────────────────────────────────────────
  const switchTab = (tab: TabName) => {
    setActiveTab(tab);
    if (tab === 'users'    && !usersLoaded) loadUsers();
    if (tab === 'reports') loadReports();
    if (tab === 'codes')   loadCodes();
    if (tab === 'logs')    { loadLogs(); loadHistory(); }
    if (tab === 'security') setSecEvents(readSecEvents());
  };

  // ── Quick manage ──────────────────────────────────────────────────────────
  const qAction = async (type: string) => {
    const u   = sanitize(qUsername).toLowerCase();
    const amt = qAmount;
    if (!u) { setQStatus('⚠ Masukkan username!'); setQStatusType('err'); return; }
    if (!/^[a-z0-9_]{3,20}$/.test(u)) { setQStatus('⚠ Username tidak valid.'); setQStatusType('err'); return; }
    setQStatus('⟳ Processing...'); setQStatusType('info');

    let payload: Record<string, unknown> = {};
    if (type === 'give')  payload = { action: 'give-credits',  target: u, amount: amt };
    if (type === 'take')  payload = { action: 'give-credits',  target: u, amount: -amt };
    if (type === 'pro')   payload = { action: 'set-plan',       target: u, plan: 'pro' };
    if (type === 'ban')   payload = { action: 'ban',            target: u, reason: 'Admin action' };
    if (type === 'unban') payload = { action: 'unban',          target: u };
    if (type === 'reset') payload = { action: 'reset-credits',  target: u };

    const r = await api('/api/sync', { method: 'POST', body: payload });
    const d = r.data as { success?: boolean; error?: string };
    if (r.ok && d.success !== false && !d.error) {
      const msg: Record<string, string> = { give:'+'+amt+' CR', take:'-'+amt+' CR', pro:'Plan Pro set', ban:'Banned', unban:'Unbanned', reset:'Credits reset' };
      setQStatus('✅ ' + (msg[type] ?? 'Done') + ' → @' + u); setQStatusType('ok');
      addToast((msg[type] ?? 'Done') + ' → @' + u, 'var(--green)');
      logSecEvent('action', `${type} on @${u} by ${sessionUser}`);
      loadStats();
    } else {
      setQStatus('✗ ' + escHtml(d?.error ?? 'Gagal.')); setQStatusType('err');
    }
  };

  // ── User lookup ───────────────────────────────────────────────────────────
  const lookupUser = async (u?: string) => {
    const username = sanitize(u ?? lookupInput).toLowerCase();
    if (!username) return;
    if (!/^[a-z0-9_]{1,25}$/.test(username)) { addToast('Username tidak valid.', 'var(--pink)'); return; }
    setLookupLoading(true);
    setFoundUser(''); setFoundData(null);
    const r = await api('/api/sync?user=' + encodeURIComponent(username));
    setLookupLoading(false);
    if (!r.ok || !r.data || !Object.keys(r.data).length) {
      addToast('User @' + username + ' tidak ditemukan.', 'var(--pink)'); return;
    }
    setFoundUser(username);
    setFoundData(r.data as UserData);
  };

  const urAction = async (type: string) => {
    if (!foundUser) return;
    let payload: Record<string, unknown> = {};
    if (type === 'give')  payload = { action: 'give-credits', target: foundUser, amount: 50 };
    if (type === 'take')  payload = { action: 'give-credits', target: foundUser, amount: -50 };
    if (type === 'ban')   payload = { action: 'ban',           target: foundUser, reason: 'Admin action' };
    if (type === 'unban') payload = { action: 'unban',         target: foundUser };
    if (type === 'pro')   payload = { action: 'set-plan',      target: foundUser, plan: 'pro' };
    if (type === 'free')  payload = { action: 'set-plan',      target: foundUser, plan: 'free' };
    if (type === 'reset') payload = { action: 'reset-credits', target: foundUser };

    const r = await api('/api/sync', { method: 'POST', body: payload });
    const d = r.data as { success?: boolean; error?: string };
    if (r.ok && d.success !== false && !d.error) {
      addToast('✅ Done → @' + foundUser, 'var(--green)');
      logSecEvent('action', `${type} on @${foundUser} by ${sessionUser}`);
      await lookupUser(foundUser); loadStats();
    } else {
      addToast('✗ ' + escHtml(d?.error ?? 'Gagal'), 'var(--pink)');
    }
  };

  // ── Credits manage ────────────────────────────────────────────────────────
  const manageCredits = async (dir: number) => {
    const u   = sanitize(credU).toLowerCase();
    const amt = parseFloat(credAmt);
    if (!u || isNaN(amt) || amt <= 0) { setCredSt('⚠ Isi username dan amount!'); setCredStType('err'); return; }
    if (!/^[a-z0-9_]{1,25}$/.test(u)) { setCredSt('⚠ Username tidak valid.'); setCredStType('err'); return; }
    setCredSt('⟳ Processing...'); setCredStType('info');
    const r = await api('/api/sync', { method: 'POST', body: { action: 'give-credits', target: u, amount: amt * dir } });
    const d = r.data as { error?: string; newCredits?: number };
    if (!r.ok || d.error) { setCredSt('✗ ' + escHtml(d?.error ?? 'Gagal.')); setCredStType('err'); return; }
    setCredSt(`✅ ${dir > 0 ? '+' : ''}${amt * dir} CR → @${u} | Total: ${parseFloat(String(d.newCredits ?? 0)).toFixed(2)}`);
    setCredStType('ok');
    if (credPlan) await api('/api/sync', { method: 'POST', body: { action: 'set-plan', target: u, plan: credPlan } });
    addToast(`${dir > 0 ? '+' : ''}${amt * dir} CR → @${u}`, dir > 0 ? 'var(--green)' : 'var(--pink)');
    logSecEvent('action', `credits ${dir > 0 ? '+' : ''}${amt * dir} on @${u} by ${sessionUser}`);
    loadStats();
  };

  // ── Ban / Unban ───────────────────────────────────────────────────────────
  const doBan = async (isBan: boolean) => {
    const u      = sanitize(banU).toLowerCase();
    const reason = sanitize(banReason) || 'No reason given';
    if (!u) { setBanSt('⚠ Isi username!'); setBanStType('err'); return; }
    if (!/^[a-z0-9_]{1,25}$/.test(u)) { setBanSt('⚠ Username tidak valid.'); setBanStType('err'); return; }
    setBanSt('⟳ Processing...'); setBanStType('info');
    const r = await api('/api/sync', { method: 'POST', body: { action: isBan ? 'ban' : 'unban', target: u, reason } });
    const d = r.data as { success?: boolean; error?: string };
    if (r.ok && d.success !== false && !d.error) {
      setBanSt(`✅ User @${u} ${isBan ? 'BANNED' : 'UNBANNED'}`); setBanStType('ok');
      addToast((isBan ? '🔨 Banned' : '✅ Unbanned') + ' @' + u, isBan ? 'var(--pink)' : 'var(--green)');
      logSecEvent('action', `${isBan ? 'ban' : 'unban'} @${u} – reason: ${reason}`);
      loadStats();
    } else { setBanSt('✗ ' + escHtml(d?.error ?? 'Gagal.')); setBanStType('err'); }
  };

  // ── Set Plan ──────────────────────────────────────────────────────────────
  const doSetPlan = async () => {
    const u = sanitize(planU).toLowerCase();
    if (!u) { setPlanSt('⚠ Isi username!'); setPlanStType('err'); return; }
    if (!/^[a-z0-9_]{1,25}$/.test(u)) { setPlanSt('⚠ Username tidak valid.'); setPlanStType('err'); return; }
    setPlanSt('⟳ Setting plan...'); setPlanStType('info');
    const r = await api('/api/sync', { method: 'POST', body: { action: 'set-plan', target: u, plan: planChoice } });
    const d = r.data as { error?: string };
    if (!r.ok || d.error) { setPlanSt('✗ ' + escHtml(d?.error ?? 'Gagal')); setPlanStType('err'); return; }
    if (planCR && !isNaN(parseFloat(planCR))) {
      await api('/api/sync', { method: 'POST', body: { action: 'set-credits', target: u, amount: parseFloat(planCR) } });
    }
    setPlanSt(`✅ @${u} → ${planChoice.toUpperCase()}${planCR ? ' + ' + planCR + ' CR' : ''}`); setPlanStType('ok');
    addToast('Plan @' + u + ' → ' + planChoice.toUpperCase(), 'var(--yellow)');
    logSecEvent('action', `set-plan @${u} → ${planChoice} by ${sessionUser}`);
    loadStats();
  };

  // ── Users list ────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    const r = await api('/api/sync?list=1');
    if (!r.ok) return;
    const entries = Object.entries(r.data ?? {}).filter(([k]) => !k.startsWith('_')) as [string, UserData][];
    setAllUsers(entries.sort((a, b) => (b[1]?.credits ?? 0) - (a[1]?.credits ?? 0)));
    setUsersLoaded(true); setUserPage(1);
  }, [api]);

  const filteredUsers  = allUsers.filter(([u]) => !userSearch || u.includes(userSearch.toLowerCase()));
  const userPageCount  = Math.ceil(filteredUsers.length / PER_PAGE);
  const userSlice      = filteredUsers.slice((userPage - 1) * PER_PAGE, userPage * PER_PAGE);

  const quickBanUser = async (u: string) => {
    if (!confirm('Ban @' + u + '?')) return;
    const r = await api('/api/sync', { method: 'POST', body: { action: 'ban', target: u, reason: 'Admin panel' } });
    if (r.ok) { addToast('🔨 Banned @' + u, 'var(--pink)'); logSecEvent('action', `quick-ban @${u}`); loadUsers(); }
    else addToast('Error: ' + escHtml((r.data as { error?: string })?.error ?? '?'), 'var(--pink)');
  };
  const quickUnban = async (u: string) => {
    const r = await api('/api/sync', { method: 'POST', body: { action: 'unban', target: u } });
    if (r.ok) { addToast('✅ Unbanned @' + u, 'var(--green)'); loadUsers(); }
    else addToast('Error: ' + escHtml((r.data as { error?: string })?.error ?? '?'), 'var(--pink)');
  };

  // ── Reports ───────────────────────────────────────────────────────────────
  const loadReports = useCallback(async () => {
    const p = new URLSearchParams();
    if (rptType)   p.set('type',   rptType);
    if (rptStatus) p.set('status', rptStatus);
    if (rptFrom)   p.set('from',   sanitize(rptFrom));
    p.set('limit', '100');
    const r = await api('/api/report?' + p.toString());
    if (!r.ok) return;
    setAllReports((r.data as { reports?: Report[] })?.reports ?? []);
    setRptPage(1);
  }, [api, rptType, rptStatus, rptFrom]);

  useEffect(() => {
    if (activeTab === 'reports') loadReports();
  }, [rptType, rptStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const rptPageCount = Math.ceil(allReports.length / RPT_PER_PAGE);
  const rptSlice     = allReports.slice((rptPage - 1) * RPT_PER_PAGE, rptPage * RPT_PER_PAGE);

  const openReportModal = (rpt: Report) => { setCurrentReport(rpt); setRptAdminNote(''); setRptModalSt(''); setRptModalOpen(true); };

  const processReport = async (action: 'confirm' | 'reject') => {
    if (!currentReport) return;
    setRptModalProcessing(true); setRptModalSt('⟳ Processing...'); setRptModalStType('info');
    const r = await api('/api/report', { method: 'PATCH', body: { id: currentReport.id, action, adminNote: sanitize(rptAdminNote) } });
    const d = r.data as { success?: boolean; error?: string };
    setRptModalProcessing(false);
    if (r.ok && d.success) {
      setRptModalSt('✅ ' + (action === 'confirm' ? 'Payment confirmed!' : 'Payment rejected.')); setRptModalStType('ok');
      addToast(action === 'confirm' ? '✅ Dikonfirmasi!' : '❌ Ditolak', action === 'confirm' ? 'var(--green)' : 'var(--pink)');
      logSecEvent('action', `${action} payment ${currentReport.id} – @${currentReport.from}`);
      setTimeout(() => { setRptModalOpen(false); loadReports(); loadPendingPayments(); }, 1500);
    } else { setRptModalSt('✗ ' + escHtml(d?.error ?? 'Gagal.')); setRptModalStType('err'); }
  };

  const deleteReport = async (id: string) => {
    if (!confirm('Delete report ' + id + '?')) return;
    const r = await api('/api/report', { method: 'DELETE', body: { id } });
    const d = r.data as { success?: boolean; error?: string };
    if (r.ok && d.success) { addToast('Report dihapus.', 'var(--dim)'); loadReports(); }
    else addToast('Error: ' + escHtml(d?.error ?? '?'), 'var(--pink)');
  };

  const quickConfirm = async (id: string) => {
    if (!confirm('Confirm payment ' + id + '?')) return;
    const r = await api('/api/report', { method: 'PATCH', body: { id, action: 'confirm', adminNote: '' } });
    const d = r.data as { success?: boolean; error?: string };
    if (r.ok && d.success) { addToast('✅ Payment confirmed!', 'var(--green)'); loadPendingPayments(); }
    else addToast('Error: ' + escHtml(d?.error ?? '?'), 'var(--pink)');
  };

  const quickReject = async (id: string) => {
    if (!confirm('Reject payment ' + id + '?')) return;
    const r = await api('/api/report', { method: 'PATCH', body: { id, action: 'reject', adminNote: 'Rejected by admin' } });
    const d = r.data as { success?: boolean; error?: string };
    if (r.ok && d.success) { addToast('❌ Payment rejected.', 'var(--pink)'); loadPendingPayments(); }
    else addToast('Error: ' + escHtml(d?.error ?? '?'), 'var(--pink)');
  };

  // ── Redeem Codes ──────────────────────────────────────────────────────────
  const loadCodes = useCallback(async () => {
    const r = await api('/api/redeem?list=1');
    if (!r.ok) return;
    setCodes((r.data as { codes?: RedeemCode[] })?.codes ?? []);
  }, [api]);

  const createCode = async () => {
    if (codeCredits <= 0 || codeUses <= 0) { setCodeSt('⚠ Isi credits dan max uses!'); setCodeStType('err'); return; }
    setCodeSt('⟳ Creating...'); setCodeStType('info');
    const body: Record<string, unknown> = { action: 'create', credits: codeCredits, maxUses: codeUses };
    if (codeExpiry) body.expiresInDays = parseInt(codeExpiry);
    const r = await api('/api/redeem', { method: 'POST', body });
    const d = r.data as { success?: boolean; error?: string; code?: { code: string } };
    if (r.ok && d.success) {
      setCodeSt('✅ Code dibuat: ' + d.code?.code); setCodeStType('ok');
      addToast(`🎟 ${d.code?.code} (${codeCredits} CR × ${codeUses} uses)`, 'var(--green)');
      logSecEvent('action', `create-code ${d.code?.code} by ${sessionUser}`);
      setCodeCredits(50); setCodeUses(10); setCodeExpiry(''); loadCodes();
    } else { setCodeSt('✗ ' + escHtml(d?.error ?? 'Gagal.')); setCodeStType('err'); }
  };

  const deleteCode = async (code: string) => {
    if (!confirm('Delete code ' + code + '?')) return;
    const r = await api('/api/redeem', { method: 'DELETE', body: { code } });
    const d = r.data as { success?: boolean; error?: string };
    if (r.ok && d.success) { addToast('Code dihapus.', 'var(--pink)'); loadCodes(); }
    else addToast('Error: ' + escHtml(d?.error ?? '?'), 'var(--pink)');
  };

  // ── Inbox ─────────────────────────────────────────────────────────────────
  const sendInbox = async () => {
    const to      = sanitize(inboxTo).toLowerCase();
    const content = sanitize(inboxContent, 5000);
    if (!to || !content) { setInboxSt('⚠ Isi username dan message!'); setInboxStType('err'); return; }
    if (!/^[a-z0-9_]{1,25}$/.test(to)) { setInboxSt('⚠ Username tidak valid.'); setInboxStType('err'); return; }
    setInboxSt('⟳ Mengirim...'); setInboxStType('info');
    const r = await api('/api/inbox', { method: 'POST', body: {
      to, from: 'NEXUS Admin',
      subject: sanitize(inboxSubject) || 'Pesan dari NEXUS Admin',
      content, type: inboxType,
      sender_id: sessionUser !== 'Token Auth' ? sessionUser.replace('@','') : 'admin',
    }});
    const d = r.data as { status?: string; error?: string; id?: string };
    if (r.ok && d.status === 'ok') {
      setInboxSt(`✅ Terkirim ke @${to}! (ID: ${d.id ?? '?'})`); setInboxStType('ok');
      addToast('✉ Terkirim ke @' + to, 'var(--green)');
      setInboxContent('');
    } else { setInboxSt('✗ ' + escHtml(d?.error ?? 'Gagal.')); setInboxStType('err'); }
  };

  const sendBroadcast = async () => {
    const recipientsRaw = sanitize(bcRecipients);
    const content       = sanitize(bcContent, 5000);
    if (!recipientsRaw || !content) { setBcSt('⚠ Isi recipients dan message!'); setBcStType('err'); return; }
    setBcSt('⟳ Mengirim...'); setBcStType('info');

    let targets: string[] = [];
    if (recipientsRaw.toLowerCase() === 'all') {
      targets = allUsers.map(([u]) => u);
      if (!targets.length) { setBcSt('Load users dulu! (tab Users → Refresh)'); setBcStType('err'); return; }
      if (!confirm('Kirim ke SEMUA ' + targets.length + ' user?')) { setBcSt(''); return; }
    } else {
      targets = recipientsRaw.split(',').map(s => sanitize(s).toLowerCase()).filter(Boolean);
    }

    let ok = 0, fail = 0;
    for (let i = 0; i < targets.length; i++) {
      if (!/^[a-z0-9_]{1,25}$/.test(targets[i])) { fail++; continue; }
      const r = await api('/api/inbox', { method: 'POST', body: {
        to: targets[i], from: 'NEXUS Admin',
        subject: sanitize(bcSubject) || 'Broadcast dari NEXUS Admin',
        content, type: 'system',
        sender_id: sessionUser !== 'Token Auth' ? sessionUser.replace('@','') : 'admin',
      }});
      const d = r.data as { status?: string };
      if (r.ok && d.status === 'ok') ok++; else fail++;
      if (i % 5 === 4) setBcSt(`⟳ Terkirim ${i+1}/${targets.length}...`);
    }
    setBcSt(`✅ Terkirim: ${ok} | Gagal: ${fail}`); setBcStType(fail > 0 ? 'info' : 'ok');
    addToast(`Broadcast: ${ok}/${targets.length} terkirim`, 'var(--yellow)');
    logSecEvent('action', `broadcast to ${targets.length} users by ${sessionUser}`);
  };

  // ── Logs ──────────────────────────────────────────────────────────────────
  const loadLogs = useCallback(async () => {
    let r = await api('/api/control?get_logs=1&limit=50');
    if (!r.ok) r = await api('/api/control', { method: 'POST', body: { type: 'get_logs', limit: 50 } });
    let data = (r.data as { logs?: Log[] })?.logs ?? [];
    if (logFilter) data = data.filter(l => l.action === logFilter);
    setLogs(data.slice(0, 50));
  }, [api, logFilter]);

  const loadHistory = useCallback(async () => {
    let r = await api('/api/control?get_history=1&limit=30');
    if (!r.ok) r = await api('/api/control', { method: 'POST', body: { type: 'get_history', limit: 30 } });
    setHistory((r.data as { history?: Log[] })?.history?.slice(0, 30) ?? []);
  }, [api]);

  useEffect(() => {
    if (activeTab === 'logs') loadLogs();
  }, [logFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render helpers ────────────────────────────────────────────────────────
  const stColor = (t: 'ok'|'err'|'info') =>
    t === 'ok' ? 'var(--green)' : t === 'err' ? 'var(--pink)' : 'var(--yellow)';

  const secEventColor = (type: SecurityEvent['type']) => {
    if (type === 'login_ok')        return 'var(--green)';
    if (type === 'login_fail')      return 'var(--yellow)';
    if (type === 'lockout')         return 'var(--pink)';
    if (type === 'role_denied')     return 'var(--pink)';
    if (type === 'fp_mismatch')     return 'var(--orange)';
    if (type === 'session_expired') return 'var(--yellow)';
    if (type === 'logout')          return 'var(--dim)';
    return 'var(--text)';
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  LOGIN SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (showLogin) {
    const locked = lockoutUntil > Date.now();
    const lockPct = locked ? Math.max(0, (lockoutUntil - Date.now()) / (SEC.LOCKOUT_SECS[Math.min(lockoutCount - 1, SEC.LOCKOUT_SECS.length - 1)] * 1000) * 100) : 0;

    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
          :root{
            --bg:#030312;--bg2:#06071a;--bg3:#0a0b22;
            --cyan:#00e5ff;--purple:#8800ff;--pink:#ff2d6b;
            --green:#00ffaa;--yellow:#ffd600;--orange:#ff8c00;
            --text:#b8cfff;--dim:#3a4a7a;--dim2:#1e2a4a;
            --b:rgba(0,229,255,.1);--b2:rgba(0,229,255,.06);
          }
          *{box-sizing:border-box;margin:0;padding:0;}
          html,body{min-height:100%;background:var(--bg);color:var(--text);font-family:'JetBrains Mono',monospace;}
          body::before{content:'';position:fixed;inset:0;
            background:linear-gradient(rgba(0,229,255,.012) 1px,transparent 1px),
                       linear-gradient(90deg,rgba(0,229,255,.012) 1px,transparent 1px);
            background-size:40px 40px;pointer-events:none;z-index:0;}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
          @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
          .fadeIn{animation:fadeIn .3s ease}
          input{outline:none;}
        `}</style>

        <div style={{position:'fixed',inset:0,zIndex:9000,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',padding:'20px'}}>
          <div className="fadeIn" style={{background:'var(--bg2)',border:'1px solid var(--b)',borderRadius:'16px',padding:'36px 32px',width:'100%',maxWidth:'400px',textAlign:'center',boxShadow:'0 0 80px rgba(0,229,255,.06)'}}>

            {/* Logo */}
            <div style={{fontFamily:'Orbitron,sans-serif',fontSize:'22px',fontWeight:900,background:'linear-gradient(135deg,var(--cyan),var(--purple))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',marginBottom:'2px'}}>NEXUS AI</div>
            <div style={{fontSize:'8px',color:'var(--dim)',letterSpacing:'3px',fontFamily:'Orbitron,sans-serif',marginBottom:'28px',textTransform:'uppercase'}}>Admin Panel · Secure Access</div>

            {/* Lock icon */}
            <div style={{width:'60px',height:'60px',background:'rgba(0,229,255,.05)',border:'1px solid ' + (roleDenied ? 'rgba(255,45,107,.3)' : 'var(--b)'),borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 24px'}}>
              {roleDenied
                ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--pink)" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/><circle cx="12" cy="16" r="1" fill="var(--cyan)"/></svg>
              }
            </div>

            {/* Role denied banner */}
            {roleDenied && (
              <div style={{background:'rgba(255,45,107,.08)',border:'1px solid rgba(255,45,107,.3)',borderRadius:'8px',padding:'10px 14px',marginBottom:'16px',fontSize:'9px',color:'var(--pink)',lineHeight:'1.6'}}>
                <strong>🚫 AKSES DITOLAK</strong><br/>
                Hanya <strong>Owner</strong> dan <strong>Admin</strong> yang dapat mengakses panel ini.
              </div>
            )}

            {/* FP mismatch warning */}
            {fpMismatch && (
              <div style={{background:'rgba(255,140,0,.08)',border:'1px solid rgba(255,140,0,.3)',borderRadius:'8px',padding:'10px 14px',marginBottom:'16px',fontSize:'9px',color:'var(--orange)',lineHeight:'1.6'}}>
                <strong>⚠ SESI TIDAK VALID</strong><br/>
                Browser berbeda terdeteksi. Sesi lama dihapus untuk keamanan.
              </div>
            )}

            {/* Step indicator */}
            <div style={{display:'flex',gap:'6px',justifyContent:'center',marginBottom:'20px'}}>
              {['Token', 'Verifikasi Role', 'Akses'].map((step, i) => {
                const stepIdx = loginStep === 'token' ? 0 : loginStep === 'verifying_role' ? 1 : 2;
                const done    = i < stepIdx;
                const active  = i === stepIdx;
                return (
                  <div key={step} style={{display:'flex',alignItems:'center',gap:'4px'}}>
                    <div style={{width:'18px',height:'18px',borderRadius:'50%',fontSize:'7px',fontFamily:'Orbitron,sans-serif',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',
                      background: done ? 'var(--green)' : active ? 'rgba(0,229,255,.15)' : 'var(--dim2)',
                      border: `1px solid ${done ? 'var(--green)' : active ? 'var(--cyan)' : 'var(--dim)'}`,
                      color: done ? '#030312' : active ? 'var(--cyan)' : 'var(--dim)',
                    }}>{done ? '✓' : i+1}</div>
                    <span style={{fontSize:'7px',color: active ? 'var(--cyan)' : done ? 'var(--green)' : 'var(--dim)',whiteSpace:'nowrap'}}>{step}</span>
                    {i < 2 && <div style={{width:'16px',height:'1px',background: done ? 'var(--green)' : 'var(--dim2)',margin:'0 2px'}}/>}
                  </div>
                );
              })}
            </div>

            {/* Token input */}
            <div style={{fontSize:'8px',color:'var(--dim)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'6px',textAlign:'left'}}>Admin Token</div>
            <div style={{position:'relative',marginBottom:'14px'}}>
              <input
                type={showPass ? 'text' : 'password'}
                value={loginInput}
                onChange={e => setLoginInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !locked && doLogin()}
                onPaste={e => { /* allow paste but sanitize on submit */ e.stopPropagation(); }}
                placeholder="Masukkan ADMIN_TOKEN..."
                disabled={loginLoading || locked}
                maxLength={512}
                autoComplete="off"
                spellCheck={false}
                style={{width:'100%',background:'var(--bg3)',border:'1px solid ' + (loginErr ? 'rgba(255,45,107,.4)' : 'var(--b)'),borderRadius:'8px',padding:'10px 40px 10px 12px',color:'white',fontFamily:'JetBrains Mono,monospace',fontSize:'12px',outline:'none',letterSpacing:'2px',transition:'.2s'}}
              />
              <button onClick={() => setShowPass(p => !p)} style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--dim)',cursor:'pointer',padding:'4px'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {showPass
                    ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                  }
                </svg>
              </button>
            </div>

            <button
              onClick={doLogin}
              disabled={loginLoading || locked}
              style={{width:'100%',padding:'11px',background: locked || loginLoading ? 'rgba(0,229,255,.15)' : 'linear-gradient(135deg,var(--cyan),#0066dd)',border:'none',borderRadius:'8px',color:'#030312',fontFamily:'Orbitron,sans-serif',fontSize:'9px',fontWeight:700,letterSpacing:'1.5px',cursor: locked || loginLoading ? 'not-allowed' : 'pointer',opacity: locked || loginLoading ? 0.5 : 1,transition:'.2s'}}
            >
              {loginLoading
                ? loginStep === 'verifying_role' ? '🔍 MEMVERIFIKASI ROLE...' : '⟳ MENGAUTENTIKASI...'
                : locked ? `🔒 DIKUNCI (${lockoutRemain}s)` : 'MASUK KE PANEL'}
            </button>

            {loginErr && <div style={{fontSize:'9px',color:'var(--pink)',marginTop:'10px',lineHeight:'1.5'}}>{loginErr}</div>}
            {loginOk  && <div style={{fontSize:'9px',color:'var(--green)',marginTop:'10px'}}>{loginOk}</div>}

            {/* Lockout progress bar */}
            {locked && (
              <div style={{marginTop:'12px'}}>
                <div style={{height:'3px',background:'var(--dim2)',borderRadius:'3px',overflow:'hidden'}}>
                  <div style={{height:'3px',background:'var(--pink)',borderRadius:'3px',width:`${lockPct}%`,transition:'width 1s linear'}}/>
                </div>
                <div style={{fontSize:'7px',color:'var(--dim)',marginTop:'4px'}}>
                  Lockout ke-{lockoutCount}: {lockoutRemain}s tersisa
                </div>
              </div>
            )}

            {/* Attempt dots */}
            <div style={{display:'flex',gap:'5px',justifyContent:'center',marginTop:'12px'}}>
              {[0,1,2,3,4].map(i => (
                <div key={i} title={`Percobaan ${i+1}`} style={{width:'7px',height:'7px',borderRadius:'50%',background: i < loginAttempts ? 'var(--pink)' : 'var(--dim2)',transition:'.2s',animation: i < loginAttempts && !locked ? 'pulse 1s infinite' : 'none'}}/>
              ))}
            </div>

            {/* Security info footer */}
            <div style={{marginTop:'20px',padding:'10px',background:'rgba(0,229,255,.03)',borderRadius:'6px',border:'1px solid var(--b2)',fontSize:'7px',color:'var(--dim)',lineHeight:'1.8',textAlign:'left'}}>
              <div style={{color:'var(--cyan)',marginBottom:'3px',fontFamily:'Orbitron,sans-serif',letterSpacing:'1px'}}>🔐 KEAMANAN</div>
              <div>• Token divalidasi server-side via <code style={{color:'var(--text)'}}>process.env.ADMIN_TOKEN</code></div>
              <div>• Hanya role <code style={{color:'var(--cyan)'}}>owner</code> / <code style={{color:'var(--cyan)'}}>admin</code> diizinkan</div>
              <div>• Sesi terikat fingerprint browser</div>
              <div>• Lockout progresif: {SEC.LOCKOUT_SECS.map(s => s < 60 ? s+'d' : Math.ceil(s/60)+'m').join(' → ')}</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ADMIN PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  const tabButtons: { id: TabName; label: string }[] = [
    { id: 'overview',  label: '📊 Overview' },
    { id: 'users',     label: '👥 Users' },
    { id: 'reports',   label: '📋 Reports & Payments' },
    { id: 'codes',     label: '🎟 Redeem Codes' },
    { id: 'inbox',     label: '✉ Inbox' },
    { id: 'logs',      label: '📜 Logs' },
    { id: 'security',  label: '🔐 Security' },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
        :root{
          --bg:#030312;--bg2:#06071a;--bg3:#0a0b22;--bg4:#0d0e28;
          --cyan:#00e5ff;--purple:#8800ff;--pink:#ff2d6b;
          --green:#00ffaa;--yellow:#ffd600;--orange:#ff8c00;
          --text:#b8cfff;--dim:#3a4a7a;--dim2:#1e2a4a;
          --b:rgba(0,229,255,.1);--b2:rgba(0,229,255,.06);
        }
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{background:var(--bg);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:13px;}
        body::before{content:'';position:fixed;inset:0;
          background:linear-gradient(rgba(0,229,255,.012) 1px,transparent 1px),
                     linear-gradient(90deg,rgba(0,229,255,.012) 1px,transparent 1px);
          background-size:40px 40px;pointer-events:none;z-index:0;}
        input,textarea,select{-webkit-user-select:text;user-select:text;outline:none;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes toastIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
        .spin{animation:spin 1s linear infinite;display:inline-block;}
        .nav-dot{animation:pulse 2s infinite;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:var(--b);border-radius:2px;}
        .tbl-row:hover td{background:rgba(0,229,255,.025);}
        .btn-h:hover{opacity:.85;transform:translateY(-1px);}
        .btn-h:active{transform:translateY(0);}
        .tab-h:hover{color:var(--text)!important;}
        .pbtn-h:hover{color:var(--cyan);border-color:var(--cyan);}
        code{background:rgba(0,229,255,.08);padding:1px 5px;border-radius:3px;font-family:'JetBrains Mono',monospace;}
      `}</style>

      {/* Toasts */}
      <div style={{position:'fixed',bottom:'20px',right:'20px',zIndex:9999,display:'flex',flexDirection:'column',gap:'8px'}}>
        {toasts.map(t => (
          <div key={t.id} style={{background:'var(--bg3)',border:'1px solid var(--b)',borderRadius:'8px',padding:'10px 16px',fontSize:'11px',maxWidth:'320px',pointerEvents:'none',color:t.color,animation:'toastIn .2s ease',fontFamily:'JetBrains Mono,monospace'}}>{t.msg}</div>
        ))}
      </div>

      {/* Inactivity warning banner */}
      {inactivityWarn && (
        <div style={{position:'fixed',top:0,left:0,right:0,zIndex:9998,background:'rgba(255,214,0,.12)',border:'1px solid rgba(255,214,0,.3)',padding:'6px 20px',fontSize:'9px',color:'var(--yellow)',display:'flex',alignItems:'center',gap:'8px',fontFamily:'JetBrains Mono,monospace'}}>
          <span className="spin">⟳</span>
          <span>⏱ Session akan expire dalam 5 menit karena tidak aktif. Gerakkan mouse untuk reset.</span>
          <button onClick={resetActivity} style={{marginLeft:'auto',background:'rgba(255,214,0,.15)',border:'1px solid rgba(255,214,0,.3)',borderRadius:'4px',color:'var(--yellow)',fontSize:'8px',padding:'2px 8px',cursor:'pointer',fontFamily:'Orbitron,sans-serif'}}>RESET</button>
        </div>
      )}

      {/* Report modal */}
      {rptModalOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setRptModalOpen(false); }}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,.75)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
          <div style={{background:'var(--bg2)',border:'1px solid var(--b)',borderRadius:'12px',padding:'20px',maxWidth:'480px',width:'100%',maxHeight:'80vh',overflowY:'auto'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',fontFamily:'Orbitron,sans-serif',fontSize:'11px',color:'var(--cyan)',marginBottom:'14px'}}>
              Detail Report
              <button onClick={() => setRptModalOpen(false)} style={{background:'none',border:'none',color:'var(--dim)',cursor:'pointer',fontSize:'16px'}}>✕</button>
            </div>
            {currentReport && (
              <div style={{background:'var(--bg3)',borderRadius:'8px',padding:'12px',marginBottom:'12px',fontSize:'10px'}}>
                {[
                  ['From','@' + currentReport.from,'var(--cyan)'],
                  ['Package',currentReport.paymentPack ?? '—',''],
                  ['Credits',(currentReport.paymentCR ?? '?') + ' CR','var(--yellow)'],
                  ['Method',(currentReport.paymentMethod ?? '—').toUpperCase(),''],
                  ['Total',currentReport.paymentTotal ?? '—','var(--green)'],
                  ...(currentReport.transactionId ? [['TXN ID',currentReport.transactionId,'']] : []),
                  ['Time',fmtDate(currentReport.time),''],
                ].map(([k,v,c]) => (
                  <div key={String(k)} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid var(--b2)'}}>
                    <span style={{color:'var(--dim)'}}>{k}</span>
                    <span style={{color: String(c) || 'var(--text)'}}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {currentReport?.message && (
              <div style={{background:'var(--bg3)',borderLeft:'3px solid var(--cyan)',borderRadius:'4px',padding:'10px',marginBottom:'12px',fontSize:'10px'}}>
                <div style={{color:'var(--dim)',fontSize:'8px',marginBottom:'4px'}}>USER NOTE</div>
                {currentReport.message.substring(0, 500)}
              </div>
            )}
            <div style={{marginBottom:'10px'}}>
              <label style={{fontSize:'8px',color:'var(--dim)',textTransform:'uppercase',letterSpacing:'1px',display:'block',marginBottom:'4px'}}>Admin Note (opsional)</label>
              <input value={rptAdminNote} onChange={e => setRptAdminNote(e.target.value)} placeholder="Catatan untuk record..."
                style={{width:'100%',background:'var(--bg3)',border:'1px solid var(--b)',borderRadius:'5px',padding:'7px 10px',color:'white',fontFamily:'JetBrains Mono,monospace',fontSize:'11px'}}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
              <Btn color="green" onClick={() => processReport('confirm')} disabled={rptModalProcessing}>✅ Confirm</Btn>
              <Btn color="red"   onClick={() => processReport('reject')}  disabled={rptModalProcessing}>❌ Reject</Btn>
            </div>
            {rptModalSt && <div style={{fontSize:'10px',marginTop:'8px',color:stColor(rptModalStType)}}>{rptModalSt}</div>}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{position:'sticky',top:0,zIndex:200,display:'flex',alignItems:'center',gap:'12px',padding:'8px 20px',background:'rgba(3,3,18,.97)',borderBottom:'1px solid var(--b)',backdropFilter:'blur(12px)'}}>
        <a href="/" style={{fontFamily:'Orbitron,sans-serif',fontSize:'12px',fontWeight:900,background:'linear-gradient(135deg,var(--cyan),var(--purple))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',textDecoration:'none',flexShrink:0}}>NEXUS AI</a>
        <span style={{fontSize:'8px',color:'var(--dim)',fontFamily:'Orbitron,sans-serif',letterSpacing:'2px',flexShrink:0}}>ADMIN PANEL</span>
        <div style={{flex:1}}/>
        {/* Role badge */}
        {sessionRole && (
          <div style={{
            fontSize:'7px',fontFamily:'Orbitron,sans-serif',fontWeight:700,padding:'2px 8px',borderRadius:'10px',
            background: sessionRole === 'owner' ? 'rgba(255,214,0,.12)' : 'rgba(136,0,255,.12)',
            border: sessionRole === 'owner' ? '1px solid rgba(255,214,0,.3)' : '1px solid rgba(136,0,255,.3)',
            color: sessionRole === 'owner' ? 'var(--yellow)' : '#bb55ff',
            letterSpacing:'1px',
          }}>{sessionRole.toUpperCase()}</div>
        )}
        <div style={{fontSize:'9px',color:'var(--dim)',display:'flex',alignItems:'center',gap:'6px'}}>
          <div className="nav-dot" style={{width:'6px',height:'6px',background:'var(--green)',borderRadius:'50%'}}/>
          <span>{sessionLabel} — {sessionUser}</span>
        </div>
        <button onClick={doLogout} className="btn-h" style={{background:'none',border:'1px solid rgba(255,45,107,.3)',borderRadius:'5px',color:'var(--pink)',fontSize:'9px',padding:'4px 10px',cursor:'pointer',fontFamily:'JetBrains Mono,monospace'}}>
          Sign Out
        </button>
        <a href="/" style={{background:'none',border:'1px solid var(--b)',borderRadius:'5px',color:'var(--dim)',fontSize:'9px',padding:'4px 10px',cursor:'pointer',fontFamily:'JetBrains Mono,monospace',textDecoration:'none'}}>← Back</a>
      </nav>

      {/* Tab nav */}
      <div style={{display:'flex',gap:'2px',padding:'12px 20px 0',overflowX:'auto',borderBottom:'1px solid var(--b)',background:'rgba(6,7,26,.6)',position:'sticky',top:'49px',zIndex:100,backdropFilter:'blur(10px)'}}>
        {tabButtons.map(({ id, label }) => (
          <button key={id} onClick={() => switchTab(id)} className="tab-h"
            style={{background:'none',border:'none',borderBottom: activeTab === id ? '2px solid var(--cyan)' : '2px solid transparent',color: activeTab === id ? 'var(--cyan)' : 'var(--dim)',fontFamily:'Orbitron,sans-serif',fontSize:'8px',fontWeight:700,letterSpacing:'1.5px',padding:'8px 14px',cursor:'pointer',whiteSpace:'nowrap',marginBottom:'-1px',transition:'.15s'}}>
            {label}
            {id === 'security' && secEvents.filter(e => e.type === 'login_fail' || e.type === 'lockout' || e.type === 'role_denied' || e.type === 'fp_mismatch').length > 0 && (
              <span style={{marginLeft:'4px',display:'inline-block',width:'6px',height:'6px',borderRadius:'50%',background:'var(--pink)',verticalAlign:'middle'}}/>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{maxWidth:'1000px',margin:'0 auto',padding:'20px 16px 60px',position:'relative',zIndex:1}}>

        {/* ══ OVERVIEW ═══════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div>
            <div style={{marginBottom:'14px'}}>
              <div style={{fontFamily:'Orbitron,sans-serif',fontSize:'16px',fontWeight:900,background:'linear-gradient(135deg,var(--cyan),var(--purple))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',marginBottom:'2px'}}>Admin Actions Panel</div>
              <div style={{fontSize:'9px',color:'var(--dim)'}}>{sessionLabel} — {sessionUser} · Role: {sessionRole || 'unknown'}</div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
              {[
                { n: stats.total,             label:'Total Users',   accent:'var(--cyan)' },
                { n: stats.pro,               label:'Pro / Owner',   accent:'var(--purple)' },
                { n: stats.active,            label:'Active Today',  accent:'var(--green)' },
                { n: stats.credits.toFixed(0),label:'Total Credits', accent:'var(--yellow)' },
              ].map(s => (
                <div key={s.label} style={{background:'var(--bg2)',border:'1px solid var(--b)',borderRadius:'10px',padding:'14px',textAlign:'center',position:'relative',overflow:'hidden'}}>
                  <div style={{position:'absolute',top:0,left:0,right:0,height:'2px',background:s.accent,opacity:.5}}/>
                  <div style={{fontFamily:'Orbitron,sans-serif',fontSize:'22px',fontWeight:900,color:'var(--yellow)'}}>{s.n}</div>
                  <div style={{fontSize:'8px',color:'var(--dim)',marginTop:'4px',textTransform:'uppercase',letterSpacing:'1px'}}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
              <Card title="Quick Manage" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>}>
                <Field label="Username"><input value={qUsername} onChange={e => setQUsername(e.target.value)} placeholder="Roblox username..." style={iSt}/></Field>
                <Field label="Jumlah Credits"><input type="number" value={qAmount} onChange={e => setQAmount(Number(e.target.value))} min={1} max={999999} style={iSt}/></Field>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px',marginTop:'8px'}}>
                  <Btn color="green"  full onClick={() => qAction('give')}>+ Beri Credits</Btn>
                  <Btn color="red"    full onClick={() => qAction('take')}>− Ambil Credits</Btn>
                  <Btn color="yellow" full onClick={() => qAction('pro')}>⭐ Set Pro</Btn>
                  <Btn color="red"    full onClick={() => qAction('ban')}>🚫 Ban User</Btn>
                  <Btn color="green"  full onClick={() => qAction('unban')}>✅ Unban User</Btn>
                  <Btn color="dim"    full onClick={() => qAction('reset')}>↻ Reset CR</Btn>
                </div>
                {qStatus && <div style={{fontSize:'10px',marginTop:'8px',color:stColor(qStatusType)}}>{qStatus}</div>}
              </Card>

              <Card title="Pending Payments" action={<Btn color="dim" sm onClick={() => switchTab('reports')}>Lihat Semua</Btn>}>
                {pendingPayments.length === 0
                  ? <div style={{color:'var(--green)',fontSize:'10px'}}>✅ Tidak ada pembayaran pending.</div>
                  : pendingPayments.map(rpt => (
                    <div key={rpt.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid var(--b2)'}}>
                      <div>
                        <div style={{color:'white',fontSize:'10px'}}>@{rpt.from}</div>
                        <div style={{color:'var(--dim)',fontSize:'8px'}}>{rpt.paymentTotal ?? '—'} · {rpt.paymentPack ?? '—'}</div>
                      </div>
                      <div style={{display:'flex',gap:'4px'}}>
                        <Btn color="green" xs onClick={() => quickConfirm(rpt.id)}>✓</Btn>
                        <Btn color="red"   xs onClick={() => quickReject(rpt.id)}>✗</Btn>
                      </div>
                    </div>
                  ))
                }
              </Card>
            </div>
          </div>
        )}

        {/* ══ USERS ══════════════════════════════════════════════════════════ */}
        {activeTab === 'users' && (
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'12px'}}>
              <Card title="User Lookup" icon={<SearchIcon/>}>
                <Field label="Roblox Username">
                  <input value={lookupInput} onChange={e => setLookupInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && lookupUser()} placeholder="username..." style={iSt}/>
                </Field>
                <Btn color="cyan" full onClick={() => lookupUser()}><SearchIcon/> Cari</Btn>
                {lookupLoading && <div style={{color:'var(--dim)',fontSize:'10px',marginTop:'8px'}}>⟳ Mencari @{lookupInput}...</div>}
                {foundUser && foundData && (
                  <div style={{background:'var(--bg3)',border:'1px solid var(--b)',borderRadius:'8px',padding:'12px',marginTop:'10px',fontSize:'10px'}}>
                    {foundData.robloxId && (
                      <img src={`https://www.roblox.com/headshot-thumbnail/image?userId=${encodeURIComponent(foundData.robloxId)}&width=80&height=80&format=png`}
                        onError={e => { (e.target as HTMLImageElement).style.display='none'; }} alt="" loading="lazy"
                        style={{width:'44px',height:'44px',borderRadius:'50%',border:'2px solid var(--cyan)',display:'block',marginBottom:'8px',objectFit:'cover'}}/>
                    )}
                    <div style={{fontWeight:700,color:'white',fontSize:'13px',marginBottom:'6px'}}>@{foundUser}</div>
                    {[
                      ['Credits',parseFloat(String(foundData.credits??0)).toFixed(2)+' CR','var(--yellow)'],
                      ['Plan',(foundData.plan??'free').toUpperCase(),foundData.plan==='owner'?'var(--yellow)':foundData.plan==='pro'?'var(--cyan)':''],
                      ['Roblox ID',foundData.robloxId??'—',''],
                      ['Status',foundData.banned?'🔴 BANNED':'🟢 Active',foundData.banned?'var(--pink)':'var(--green)'],
                      ['Email',foundData.googleEmail??'—',''],
                      ['Roles',(foundData.roles??[]).join(', ')||'user',''],
                      ['Last Seen',fmtDate(foundData._updated),''],
                      ...(foundData.banned&&foundData.banReason?[['Ban Reason',foundData.banReason,'var(--pink)']]:[] as [string,string,string][]),
                    ].map(([k,v,c]) => (
                      <div key={String(k)} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid var(--b2)'}}>
                        <span style={{color:'var(--dim)'}}>{k}</span>
                        <span style={{color: String(c)||'var(--text)'}}>{v}</span>
                      </div>
                    ))}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px',marginTop:'10px'}}>
                      <Btn color="green"  full onClick={() => urAction('give')}>+50 CR</Btn>
                      <Btn color={foundData.banned?'green':'red'} full onClick={() => urAction(foundData.banned?'unban':'ban')}>{foundData.banned?'✅ Unban':'🔨 Ban'}</Btn>
                      <Btn color="yellow" full onClick={() => urAction('pro')}>⭐ Set Pro</Btn>
                      <Btn color="dim"    full onClick={() => urAction('reset')}>↻ Reset CR</Btn>
                      <Btn color="purple" full onClick={() => { switchTab('inbox'); setTimeout(() => setInboxTo(foundUser),100); }}>✉ Inbox</Btn>
                      <Btn color="dim"    full onClick={() => urAction('free')}>Set Free</Btn>
                    </div>
                  </div>
                )}
              </Card>

              <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                <Card title="Manage Credits">
                  <Field label="Username"><input value={credU} onChange={e => setCredU(e.target.value)} placeholder="Target username..." style={iSt}/></Field>
                  <Field label="Jumlah"><input type="number" value={credAmt} onChange={e => setCredAmt(e.target.value)} placeholder="100" min={1} style={iSt}/></Field>
                  <Field label="Set Plan (opsional)">
                    <select value={credPlan} onChange={e => setCredPlan(e.target.value)} style={sSt}>
                      <option value="">— Tidak diubah —</option>
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="owner">Owner</option>
                    </select>
                  </Field>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
                    <Btn color="green" full onClick={() => manageCredits(1)}>+ Tambah</Btn>
                    <Btn color="red"   full onClick={() => manageCredits(-1)}>− Kurangi</Btn>
                  </div>
                  {credSt && <div style={{fontSize:'10px',marginTop:'8px',color:stColor(credStType)}}>{credSt}</div>}
                </Card>

                <Card title="Ban / Unban">
                  <Field label="Username"><input value={banU} onChange={e => setBanU(e.target.value)} placeholder="Username..." style={iSt}/></Field>
                  <Field label="Alasan (untuk ban)"><input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Alasan..." style={iSt}/></Field>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
                    <Btn color="red"   full onClick={() => doBan(true)}>🔨 Ban</Btn>
                    <Btn color="green" full onClick={() => doBan(false)}>✅ Unban</Btn>
                  </div>
                  {banSt && <div style={{fontSize:'10px',marginTop:'8px',color:stColor(banStType)}}>{banSt}</div>}
                </Card>

                <Card title="Set Plan">
                  <Field label="Username"><input value={planU} onChange={e => setPlanU(e.target.value)} placeholder="Username..." style={iSt}/></Field>
                  <Field label="Plan">
                    <select value={planChoice} onChange={e => setPlanChoice(e.target.value)} style={sSt}>
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="owner">Owner</option>
                    </select>
                  </Field>
                  <Field label="Custom Credits (opsional)"><input type="number" value={planCR} onChange={e => setPlanCR(e.target.value)} placeholder="Kosong = default" min={0} style={iSt}/></Field>
                  <Btn color="yellow" full onClick={doSetPlan}>⭐ Set Plan</Btn>
                  {planSt && <div style={{fontSize:'10px',marginTop:'8px',color:stColor(planStType)}}>{planSt}</div>}
                </Card>
              </div>
            </div>

            <Card title="Semua Users" action={
              <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                <input value={userSearch} onChange={e => { setUserSearch(e.target.value); setUserPage(1); }} placeholder="Filter..." style={{...iSt,width:'140px',padding:'4px 8px',fontSize:'9px'}}/>
                <Btn color="dim" sm onClick={loadUsers}>↻ Refresh</Btn>
              </div>
            }>
              <div style={{overflowX:'auto',borderRadius:'7px',border:'1px solid var(--b)'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'10px'}}>
                  <thead>
                    <tr>{['Username','Credits','Plan','Last Seen','Status','Aksi'].map(h => (
                      <th key={h} style={{color:'var(--dim)',fontSize:'7.5px',textTransform:'uppercase',letterSpacing:'1px',padding:'7px 10px',textAlign:'left',background:'rgba(0,0,0,.3)',borderBottom:'1px solid var(--b)'}}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {userSlice.length === 0
                      ? <tr><td colSpan={6} style={{textAlign:'center',color:'var(--dim)',padding:'24px'}}>Tidak ada user.</td></tr>
                      : userSlice.map(([u,d]) => (
                        <tr key={u} className="tbl-row">
                          <td style={{color:'var(--cyan)',cursor:'pointer',padding:'7px 10px',borderBottom:'1px solid var(--b2)'}} onClick={() => { setLookupInput(u); lookupUser(u); }}>@{u}</td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)',color:'var(--yellow)'}}>{parseFloat(String(d?.credits??0)).toFixed(1)} CR</td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)'}}><PlanBadge plan={d?.plan??'free'} roles={d?.roles}/></td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)',color:'var(--dim)'}}>{fmtRelative(d?._updated)}</td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)'}}>
                            {d?.banned ? <span style={{display:'inline-block',fontSize:'7px',fontWeight:700,padding:'2px 7px',borderRadius:'10px',background:'rgba(255,45,107,.12)',color:'var(--pink)'}}>BANNED</span>
                              : <span style={{color:'var(--green)',fontSize:'9px'}}>Active</span>}
                          </td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)'}}>
                            <div style={{display:'flex',gap:'4px'}}>
                              <Btn color="dim" xs onClick={() => { setLookupInput(u); lookupUser(u); }}>👤</Btn>
                              <Btn color="dim" xs onClick={() => { switchTab('inbox'); setTimeout(() => setInboxTo(u),100); }}>✉</Btn>
                              {d?.banned ? <Btn color="green" xs onClick={() => quickUnban(u)}>Unban</Btn>
                                : <Btn color="red" xs onClick={() => quickBanUser(u)}>Ban</Btn>}
                            </div>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
              {userPageCount > 1 && (
                <div style={{display:'flex',gap:'5px',marginTop:'10px',justifyContent:'center',flexWrap:'wrap'}}>
                  {Array.from({length: Math.min(userPageCount,10)}, (_,i) => i+1).map(p => (
                    <button key={p} onClick={() => setUserPage(p)} className="pbtn-h" style={{background: p===userPage?'rgba(0,229,255,.06)':'var(--bg3)',border: p===userPage?'1px solid rgba(0,229,255,.4)':'1px solid var(--b)',borderRadius:'4px',color: p===userPage?'var(--cyan)':'var(--dim)',fontSize:'8px',padding:'3px 9px',cursor:'pointer',fontFamily:'JetBrains Mono,monospace'}}>{p}</button>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ══ REPORTS ════════════════════════════════════════════════════════ */}
        {activeTab === 'reports' && (
          <div>
            <div style={{background:'var(--bg2)',border:'1px solid var(--b)',borderRadius:'10px',padding:'12px 16px',marginBottom:'16px'}}>
              <div style={{display:'flex',flexWrap:'wrap',gap:'8px',alignItems:'center'}}>
                <div style={{fontFamily:'Orbitron,sans-serif',fontSize:'8px',color:'var(--dim)',letterSpacing:'1px'}}>FILTER:</div>
                <select value={rptType} onChange={e => setRptType(e.target.value)} style={{...sSt,width:'auto',padding:'4px 8px',fontSize:'9px'}}>
                  <option value="">Semua Tipe</option>
                  <option value="payment">Payment</option>
                  <option value="bug">Bug Report</option>
                </select>
                <select value={rptStatus} onChange={e => setRptStatus(e.target.value)} style={{...sSt,width:'auto',padding:'4px 8px',fontSize:'9px'}}>
                  <option value="">Semua Status</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="rejected">Rejected</option>
                </select>
                <input value={rptFrom} onChange={e => setRptFrom(e.target.value)} onKeyDown={e => e.key==='Enter'&&loadReports()} placeholder="Filter username..." style={{...iSt,width:'160px',padding:'4px 8px',fontSize:'9px'}}/>
                <Btn color="cyan" sm onClick={loadReports}>Cari</Btn>
                <Btn color="dim"  sm onClick={() => { setRptType(''); setRptStatus(''); setRptFrom(''); setTimeout(loadReports,50); }}>Clear</Btn>
                <div style={{flex:1}}/><span style={{fontSize:'9px',color:'var(--dim)'}}>{allReports.length} reports</span>
              </div>
            </div>
            <Card title="Reports & Payments" action={<Btn color="dim" sm onClick={loadReports}>↻ Refresh</Btn>}>
              <div style={{overflowX:'auto',borderRadius:'7px',border:'1px solid var(--b)'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'10px'}}>
                  <thead>
                    <tr>{['Waktu','Tipe','Dari','Jumlah','Status','Aksi'].map(h => (
                      <th key={h} style={{color:'var(--dim)',fontSize:'7.5px',textTransform:'uppercase',letterSpacing:'1px',padding:'7px 10px',textAlign:'left',background:'rgba(0,0,0,.3)',borderBottom:'1px solid var(--b)'}}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {rptSlice.length===0
                      ? <tr><td colSpan={6} style={{textAlign:'center',color:'var(--dim)',padding:'24px'}}><span className="spin">⟳</span> Loading...</td></tr>
                      : rptSlice.map(rpt => (
                        <tr key={rpt.id} className="tbl-row">
                          <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)',color:'var(--dim)',fontSize:'9px'}}>{fmtRelative(rpt.time)}</td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)'}}>
                            <span style={{display:'inline-block',fontSize:'7px',fontWeight:700,padding:'2px 7px',borderRadius:'10px',background: rpt.type==='payment'?'rgba(0,255,170,.12)':'rgba(255,140,0,.12)',color: rpt.type==='payment'?'var(--green)':'var(--orange)'}}>
                              {(rpt.type??'bug').toUpperCase()}
                            </span>
                          </td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)',color:'var(--cyan)'}}>@{rpt.from??'?'}</td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)'}}>
                            {rpt.type==='payment'
                              ? <><span style={{color:'var(--yellow)'}}>{rpt.paymentCR??'?'} CR</span><br/><span style={{color:'var(--dim)',fontSize:'8px'}}>{rpt.paymentTotal??''}</span></>
                              : <span style={{color:'var(--dim)',fontSize:'9px'}}>—</span>}
                          </td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)'}}><StatusBadge status={rpt.status}/></td>
                          <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)'}}>
                            <div style={{display:'flex',gap:'4px'}}>
                              {rpt.type==='payment'&&rpt.status==='pending'
                                ? <Btn color="green" xs onClick={() => openReportModal(rpt)}>Review</Btn>
                                : <><Btn color="dim" xs onClick={() => alert(`Report #${rpt.id}\nFrom: @${rpt.from}\nType: ${rpt.type}\n\n${(rpt.message??'').substring(0,300)}`)}>View</Btn>
                                   {rpt.type==='bug'&&<Btn color="red" xs onClick={() => deleteReport(rpt.id)}>Del</Btn>}</>
                              }
                            </div>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
              {rptPageCount>1 && (
                <div style={{display:'flex',gap:'5px',marginTop:'10px',justifyContent:'center',flexWrap:'wrap'}}>
                  {Array.from({length:Math.min(rptPageCount,10)},(_,i)=>i+1).map(p => (
                    <button key={p} onClick={()=>setRptPage(p)} className="pbtn-h" style={{background:p===rptPage?'rgba(0,229,255,.06)':'var(--bg3)',border:p===rptPage?'1px solid rgba(0,229,255,.4)':'1px solid var(--b)',borderRadius:'4px',color:p===rptPage?'var(--cyan)':'var(--dim)',fontSize:'8px',padding:'3px 9px',cursor:'pointer',fontFamily:'JetBrains Mono,monospace'}}>{p}</button>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ══ REDEEM CODES ══════════════════════════════════════════════════ */}
        {activeTab === 'codes' && (
          <div>
            <Card title="Buat Redeem Code">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
                <Field label="Credits"><input type="number" value={codeCredits} onChange={e=>setCodeCredits(Number(e.target.value))} min={1} max={10000} style={iSt}/></Field>
                <Field label="Max Uses"><input type="number" value={codeUses} onChange={e=>setCodeUses(Number(e.target.value))} min={1} max={10000} style={iSt}/></Field>
                <Field label="Kedaluwarsa (hari, kosong=selamanya)"><input type="number" value={codeExpiry} onChange={e=>setCodeExpiry(e.target.value)} placeholder="30..." min={1} style={iSt}/></Field>
              </div>
              <Btn color="cyan" onClick={createCode}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Buat Code</Btn>
              {codeSt && <div style={{fontSize:'10px',marginTop:'8px',color:stColor(codeStType)}}>{codeSt}</div>}
            </Card>
            <Card title="Kode Aktif" action={<Btn color="dim" sm onClick={loadCodes}>↻ Refresh</Btn>}>
              <div style={{overflowX:'auto',borderRadius:'7px',border:'1px solid var(--b)'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'10px'}}>
                  <thead>
                    <tr>{['Code','Credits','Dipakai','Dibuat','Kedaluwarsa','Aksi'].map(h=>(
                      <th key={h} style={{color:'var(--dim)',fontSize:'7.5px',textTransform:'uppercase',letterSpacing:'1px',padding:'7px 10px',textAlign:'left',background:'rgba(0,0,0,.3)',borderBottom:'1px solid var(--b)'}}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {codes.length===0
                      ? <tr><td colSpan={6} style={{textAlign:'center',color:'var(--dim)',padding:'24px'}}>Tidak ada kode. Buat satu di atas.</td></tr>
                      : codes.map(c => {
                          const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                          const usePct  = c.maxUses > 0 ? Math.round(c.uses/c.maxUses*100) : 0;
                          const barClr  = usePct>=100?'var(--pink)':usePct>70?'var(--yellow)':'var(--green)';
                          return (
                            <tr key={c.code} className="tbl-row">
                              <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)',color:'var(--cyan)',fontWeight:700}}>{c.code}</td>
                              <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)',color:'var(--yellow)'}}>{c.credits} CR</td>
                              <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)'}}>
                                <div style={{fontSize:'9px'}}>{c.uses} / {c.maxUses}</div>
                                <div style={{height:'3px',background:'var(--b2)',borderRadius:'2px',marginTop:'3px',width:'60px'}}><div style={{height:'3px',background:barClr,borderRadius:'2px',width:`${Math.min(usePct,100)}%`}}/></div>
                              </td>
                              <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)',color:'var(--dim)'}}>{fmtRelative(c.createdAt)}</td>
                              <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)',color:expired?'var(--pink)':'var(--dim)'}}>
                                {c.expiresAt?new Date(c.expiresAt).toLocaleDateString('id-ID'):'Selamanya'}
                                {expired&&<span style={{color:'var(--pink)'}}> (expired)</span>}
                              </td>
                              <td style={{padding:'7px 10px',borderBottom:'1px solid var(--b2)'}}><Btn color="red" xs onClick={()=>deleteCode(c.code)}>Hapus</Btn></td>
                            </tr>
                          );
                        })
                    }
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ══ INBOX ══════════════════════════════════════════════════════════ */}
        {activeTab === 'inbox' && (
          <div>
            <Card title="Kirim Pesan ke Inbox User">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                <div>
                  <Field label="Kepada (Roblox Username)"><input value={inboxTo} onChange={e=>setInboxTo(e.target.value)} placeholder="username..." style={iSt}/></Field>
                  <Field label="Subjek"><input value={inboxSubject} onChange={e=>setInboxSubject(e.target.value)} placeholder="Judul pesan..." style={iSt}/></Field>
                  <Field label="Tipe">
                    <select value={inboxType} onChange={e=>setInboxType(e.target.value)} style={sSt}>
                      <option value="general">General</option>
                      <option value="warning">⚠️ Warning</option>
                      <option value="reward">🎁 Reward</option>
                      <option value="system">⚙️ System</option>
                      <option value="payment">💳 Payment</option>
                    </select>
                  </Field>
                </div>
                <div>
                  <Field label="Isi Pesan"><textarea value={inboxContent} onChange={e=>setInboxContent(e.target.value)} placeholder="Tulis pesanmu..." style={{...iSt,minHeight:'120px',resize:'vertical'}}/></Field>
                  <Btn color="cyan" full onClick={sendInbox}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Kirim Pesan</Btn>
                  {inboxSt && <div style={{fontSize:'10px',marginTop:'8px',color:stColor(inboxStType)}}>{inboxSt}</div>}
                </div>
              </div>
            </Card>
            <Card title="Broadcast (Kirim ke Banyak)">
              <Field label="Penerima (pisah koma, atau 'all')"><input value={bcRecipients} onChange={e=>setBcRecipients(e.target.value)} placeholder="user1, user2 ... atau 'all'" style={iSt}/></Field>
              <Field label="Subjek"><input value={bcSubject} onChange={e=>setBcSubject(e.target.value)} placeholder="Subjek broadcast..." style={iSt}/></Field>
              <Field label="Pesan"><textarea value={bcContent} onChange={e=>setBcContent(e.target.value)} placeholder="Isi broadcast..." style={{...iSt,resize:'vertical',minHeight:'70px'}}/></Field>
              <Btn color="yellow" onClick={sendBroadcast}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg> Kirim Broadcast</Btn>
              {bcSt && <div style={{fontSize:'10px',marginTop:'8px',color:stColor(bcStType)}}>{bcSt}</div>}
            </Card>
          </div>
        )}

        {/* ══ LOGS ════════════════════════════════════════════════════════════ */}
        {activeTab === 'logs' && (
          <div>
            <Card title="Activity Log" action={
              <div style={{display:'flex',gap:'6px'}}>
                <select value={logFilter} onChange={e=>setLogFilter(e.target.value)} style={{...sSt,width:'auto',padding:'3px 8px',fontSize:'8px'}}>
                  <option value="">Semua</option>
                  <option value="give-credits">Credits</option>
                  <option value="ban">Ban</option>
                  <option value="execute_json">AI Commands</option>
                </select>
                <Btn color="dim" sm onClick={loadLogs}>↻ Refresh</Btn>
              </div>
            }>
              <div style={{background:'rgba(0,0,0,.4)',border:'1px solid var(--b)',borderRadius:'6px',padding:'8px',maxHeight:'280px',overflowY:'auto',fontSize:'9px',lineHeight:'1.7'}}>
                {logs.length===0 ? <div style={{color:'var(--dim)'}}>Belum ada log.</div>
                  : logs.map((l,i) => {
                    const t = l.ts ? new Date(l.ts).toLocaleTimeString('id-ID',{hour12:false}) : '?';
                    const color = l.action==='ban'?'var(--pink)':l.action?.includes('credit')?'var(--yellow)':'var(--green)';
                    return <div key={i} style={{color}}>[{t}] <strong>{l.action??'?'}</strong>{l.user?` by @${l.user}`:''}{l.target?` → @${l.target}`:''}{l.name?` (${l.name})`:''}</div>;
                  })
                }
              </div>
            </Card>
            <Card title="Command History" action={<Btn color="dim" sm onClick={loadHistory}>↻ Refresh</Btn>}>
              <div style={{background:'rgba(0,0,0,.4)',border:'1px solid var(--b)',borderRadius:'6px',padding:'8px',maxHeight:'280px',overflowY:'auto',fontSize:'9px',lineHeight:'1.7'}}>
                {history.length===0 ? <div style={{color:'var(--dim)'}}>Tidak ada history.</div>
                  : history.map((h,i) => {
                    const t = h.ts ? new Date(h.ts).toLocaleTimeString('id-ID',{hour12:false}) : '?';
                    return <div key={i} style={{color:'var(--dim)'}}>[{t}] <span style={{color:'var(--cyan)'}}>{h.action??'?'}</span>{h.user?` by @${h.user}`:''}{h.details?` — ${String(h.details).substring(0,60)}`:''}</div>;
                  })
                }
              </div>
            </Card>
          </div>
        )}

        {/* ══ SECURITY TAB ════════════════════════════════════════════════════ */}
        {activeTab === 'security' && (
          <div>
            {/* Session info */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px',marginBottom:'16px'}}>
              {[
                { label:'User Terautentikasi', val: sessionUser,       color:'var(--cyan)' },
                { label:'Role Terverifikasi',  val: sessionRole.toUpperCase() || '—', color: sessionRole==='owner'?'var(--yellow)':'var(--green)' },
                { label:'Fingerprint Browser', val: getBrowserFP(),    color:'var(--dim)' },
              ].map(s => (
                <div key={s.label} style={{background:'var(--bg2)',border:'1px solid var(--b)',borderRadius:'10px',padding:'14px',position:'relative',overflow:'hidden'}}>
                  <div style={{position:'absolute',top:0,left:0,right:0,height:'2px',background:s.color,opacity:.5}}/>
                  <div style={{fontSize:'11px',fontWeight:700,color:s.color,marginBottom:'4px',fontFamily:'JetBrains Mono,monospace'}}>{s.val}</div>
                  <div style={{fontSize:'7.5px',color:'var(--dim)',textTransform:'uppercase',letterSpacing:'1px'}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Security features status */}
            <Card title="Status Fitur Keamanan">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',fontSize:'10px'}}>
                {[
                  ['Token Obfuscation', 'Token disimpan ter-XOR di localStorage', true],
                  ['Fingerprint Binding', 'Sesi terikat ke browser yang sama', true],
                  ['Nonce Per-Request', 'Setiap request punya ID unik (anti-replay)', true],
                  ['Progressive Lockout', `${SEC.LOCKOUT_SECS.map(s=>s<60?s+'d':Math.ceil(s/60)+'m').join('→')} setelah 5 gagal`, true],
                  ['Role Verification', 'Hanya owner/admin yang bisa masuk', true],
                  ['Auto-Logout Inactivity', '30 menit tidak aktif → logout', true],
                  ['Auto-Logout Hidden Tab', '15 menit tab tersembunyi → logout', true],
                  ['Input Sanitization', 'Null-byte & control char distrip', true],
                  ['ADMIN_TOKEN via ENV', 'Token tidak hardcode, dari environment', true],
                  ['HTTPS Header Check', 'X-Admin-Token + X-Nonce + X-Client-FP', true],
                ].map(([feat, desc, active]) => (
                  <div key={String(feat)} style={{background:'var(--bg3)',border:'1px solid var(--b)',borderRadius:'7px',padding:'10px 12px',display:'flex',gap:'10px',alignItems:'flex-start'}}>
                    <div style={{color: active ? 'var(--green)' : 'var(--pink)',fontSize:'12px',flexShrink:0,marginTop:'1px'}}>
                      {active ? '✓' : '✗'}
                    </div>
                    <div>
                      <div style={{fontFamily:'Orbitron,sans-serif',fontSize:'7.5px',color: active?'var(--green)':'var(--pink)',letterSpacing:'.5px',marginBottom:'2px'}}>{feat}</div>
                      <div style={{color:'var(--dim)',fontSize:'8px',lineHeight:'1.5'}}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Security event log */}
            <Card title="Security Event Log" action={
              <div style={{display:'flex',gap:'6px'}}>
                <Btn color="dim" sm onClick={() => setSecEvents(readSecEvents())}>↻ Refresh</Btn>
                <Btn color="red" sm onClick={() => { if(confirm('Hapus semua security log?')) { setStore(SEC.K.EV_LOG, obfs('[]')); setSecEvents([]); } }}>Hapus Log</Btn>
              </div>
            }>
              <div style={{background:'rgba(0,0,0,.5)',border:'1px solid var(--b)',borderRadius:'6px',padding:'8px',maxHeight:'320px',overflowY:'auto',fontSize:'9px',lineHeight:'1.8',fontFamily:'JetBrains Mono,monospace'}}>
                {secEvents.length===0
                  ? <div style={{color:'var(--dim)'}}>Tidak ada security event.</div>
                  : secEvents.map((e, i) => {
                    const t = new Date(e.ts).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'});
                    const icon: Record<SecurityEvent['type'], string> = {
                      login_ok: '✅', login_fail: '⚠', lockout: '🔒',
                      role_denied: '🚫', fp_mismatch: '⚡', session_expired: '⏱', logout: '↩', action: '▸',
                    };
                    return (
                      <div key={i} style={{color: secEventColor(e.type), borderBottom:'1px solid rgba(0,229,255,.04)',paddingBottom:'2px',marginBottom:'2px'}}>
                        <span style={{color:'var(--dim)',marginRight:'6px'}}>[{t}]</span>
                        <span style={{marginRight:'5px'}}>{icon[e.type]??'·'}</span>
                        <strong style={{fontFamily:'Orbitron,sans-serif',fontSize:'7px',letterSpacing:'.5px'}}>{e.type.replace('_',' ').toUpperCase()}</strong>
                        <span style={{color:'var(--dim)',marginLeft:'8px'}}>{e.detail}</span>
                      </div>
                    );
                  })
                }
              </div>
            </Card>

            {/* ENV setup guide */}
            <Card title="Panduan Konfigurasi Server">
              <div style={{fontSize:'9px',lineHeight:'2',color:'var(--text)'}}>
                <div style={{color:'var(--cyan)',fontFamily:'Orbitron,sans-serif',fontSize:'7.5px',letterSpacing:'1px',marginBottom:'8px'}}>1. SET ENVIRONMENT VARIABLE</div>
                <div style={{background:'rgba(0,0,0,.6)',border:'1px solid var(--b)',borderRadius:'6px',padding:'10px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:'10px',color:'var(--green)',marginBottom:'12px',overflowX:'auto'}}>
                  <div style={{color:'var(--dim)',fontSize:'8px',marginBottom:'4px'}}># .env.local</div>
                  <div>ADMIN_TOKEN=<span style={{color:'var(--yellow)'}}>ganti_dengan_token_yang_aman_min_32_char</span></div>
                </div>

                <div style={{color:'var(--cyan)',fontFamily:'Orbitron,sans-serif',fontSize:'7.5px',letterSpacing:'1px',marginBottom:'8px'}}>2. VALIDASI DI API ROUTE (contoh Next.js)</div>
                <div style={{background:'rgba(0,0,0,.6)',border:'1px solid var(--b)',borderRadius:'6px',padding:'10px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:'9px',color:'var(--text)',marginBottom:'12px',overflowX:'auto',lineHeight:'1.8'}}>
                  <div><span style={{color:'var(--purple)'}}>export default</span> <span style={{color:'var(--cyan)'}}>function</span> handler(req, res) {'{'}</div>
                  <div style={{paddingLeft:'16px'}}>
                    <div><span style={{color:'var(--dim)'}}>// Ambil token dari header</span></div>
                    <div><span style={{color:'var(--yellow)'}}>const</span> tok = req.headers[<span style={{color:'var(--green)'}}>'x-admin-token'</span>];</div>
                    <div><span style={{color:'var(--yellow)'}}>const</span> expected = process.env.<span style={{color:'var(--orange)'}}>ADMIN_TOKEN</span>;</div>
                    <div style={{marginTop:'4px'}}><span style={{color:'var(--pink)'}}>if</span> (!tok || tok !== expected) {'{'}</div>
                    <div style={{paddingLeft:'16px'}}><span style={{color:'var(--pink)'}}>return</span> res.status(<span style={{color:'var(--yellow)'}}>401</span>).json({'{'} error: <span style={{color:'var(--green)'}}>'Unauthorized'</span> {'}'});</div>
                    <div>{'}'}</div>
                    <div style={{marginTop:'4px',color:'var(--dim)'}}>// Lanjutkan logic admin...</div>
                  </div>
                  <div>{'}'}</div>
                </div>

                <div style={{background:'rgba(255,45,107,.06)',border:'1px solid rgba(255,45,107,.2)',borderRadius:'6px',padding:'10px 12px',fontSize:'9px',color:'var(--pink)',lineHeight:'1.7'}}>
                  <strong>⚠ PERINGATAN KEAMANAN:</strong><br/>
                  • Jangan pernah hardcode token di kode sumber<br/>
                  • Gunakan token acak minimal 32 karakter<br/>
                  • Rotasi token secara berkala<br/>
                  • Gunakan HTTPS di production<br/>
                  • Batasi akses IP ke panel ini jika memungkinkan
                </div>
              </div>
            </Card>
          </div>
        )}

      </div>
    </>
  );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function Card({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{background:'var(--bg2)',border:'1px solid var(--b)',borderRadius:'10px',padding:'16px',marginBottom:'12px'}}>
      <div style={{fontFamily:'Orbitron,sans-serif',fontSize:'8px',color:'var(--cyan)',letterSpacing:'2px',textTransform:'uppercase',marginBottom:'12px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>{icon}{title}</div>
        {action && <div>{action}</div>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{marginBottom:'10px'}}>
      <label style={{fontSize:'8px',color:'var(--dim)',textTransform:'uppercase',letterSpacing:'1px',display:'block',marginBottom:'4px'}}>{label}</label>
      {children}
    </div>
  );
}

type BtnColor = 'cyan'|'green'|'red'|'yellow'|'purple'|'dim';
function Btn({ color='dim', full, sm, xs, onClick, children, disabled }: { color?: BtnColor; full?: boolean; sm?: boolean; xs?: boolean; onClick?: () => void; children?: React.ReactNode; disabled?: boolean }) {
  const bg: Record<BtnColor,string> = { cyan:'linear-gradient(135deg,var(--cyan),#0088ff)', green:'rgba(0,255,170,.12)', red:'rgba(255,45,107,.12)', yellow:'rgba(255,214,0,.12)', purple:'rgba(136,0,255,.12)', dim:'rgba(255,255,255,.05)' };
  const cl: Record<BtnColor,string> = { cyan:'#030312', green:'var(--green)', red:'var(--pink)', yellow:'var(--yellow)', purple:'#bb55ff', dim:'var(--text)' };
  const br: Record<BtnColor,string> = { cyan:'none', green:'1px solid rgba(0,255,170,.25)', red:'1px solid rgba(255,45,107,.25)', yellow:'1px solid rgba(255,214,0,.25)', purple:'1px solid rgba(136,0,255,.25)', dim:'1px solid var(--b)' };
  return (
    <button onClick={onClick} disabled={disabled} className="btn-h"
      style={{padding: xs?'3px 7px':sm?'4px 9px':'7px 14px', borderRadius:'6px', border:br[color], background:bg[color], color:cl[color], fontFamily:'Orbitron,sans-serif', fontSize: xs?'6.5px':sm?'7px':'7.5px', fontWeight:700, cursor:disabled?'not-allowed':'pointer', letterSpacing:'1px', display:'inline-flex', alignItems:'center', gap:'5px', whiteSpace:'nowrap', width:full?'100%':undefined, justifyContent:full?'center':undefined, opacity:disabled?.35:1, transition:'.15s'}}>
      {children}
    </button>
  );
}

function PlanBadge({ plan, roles }: { plan: string; roles?: string[] }) {
  const m: Record<string,{bg:string;color:string}> = { free:{bg:'rgba(58,74,122,.3)',color:'var(--dim)'}, pro:{bg:'rgba(0,229,255,.12)',color:'var(--cyan)'}, owner:{bg:'rgba(255,214,0,.12)',color:'var(--yellow)'} };
  const s = m[plan] ?? m.free;
  return (
    <>
      <span style={{display:'inline-block',fontSize:'7px',fontWeight:700,padding:'2px 7px',borderRadius:'10px',background:s.bg,color:s.color,fontFamily:'Orbitron,monospace',letterSpacing:'.5px'}}>{plan.toUpperCase()}</span>
      {(roles??[]).includes('admin') && <span style={{display:'inline-block',fontSize:'7px',fontWeight:700,padding:'2px 7px',borderRadius:'10px',background:'rgba(136,0,255,.12)',color:'#bb55ff',fontFamily:'Orbitron,monospace',letterSpacing:'.5px',marginLeft:'3px'}}>ADMIN</span>}
    </>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const m: Record<string,{bg:string;color:string}> = { pending:{bg:'rgba(255,214,0,.12)',color:'var(--yellow)'}, confirmed:{bg:'rgba(0,255,170,.12)',color:'var(--green)'}, rejected:{bg:'rgba(255,45,107,.12)',color:'var(--pink)'} };
  const s = status ? (m[status] ?? {bg:'rgba(58,74,122,.3)',color:'var(--dim)'}) : {bg:'rgba(58,74,122,.3)',color:'var(--dim)'};
  return <span style={{display:'inline-block',fontSize:'7px',fontWeight:700,padding:'2px 7px',borderRadius:'10px',background:s.bg,color:s.color,fontFamily:'Orbitron,monospace',letterSpacing:'.5px'}}>{(status??'NONE').toUpperCase()}</span>;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const iSt: React.CSSProperties = { width:'100%', background:'var(--bg3)', border:'1px solid var(--b)', borderRadius:'5px', padding:'7px 10px', color:'white', fontFamily:'JetBrains Mono,monospace', fontSize:'11px', outline:'none' };
const sSt: React.CSSProperties = { ...iSt, cursor:'pointer', appearance:'none' as const };