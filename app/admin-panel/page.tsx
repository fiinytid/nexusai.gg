'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────
interface NexusSession { user?: { username?: string }; data?: { roles?: string[]; plan?: string } }
type StType = '' | 'ok' | 'err' | 'info';
interface StState { msg: string; type: StType }
interface Report { id: string; type: string; from: string; status: string; time: string; paymentPack?: string; paymentCR?: number; paymentMethod?: string; paymentTotal?: string; transactionId?: string; message?: string }
interface Code { code: string; credits: number; uses: number; maxUses: number; createdAt: string; expiresAt?: string }

// ─── Security Config ──────────────────────────────────────────────────────────
const SEC = { MAX_ATTEMPTS: 5, LOCKOUT_SEC: 60, SESSION_MS: 30 * 60 * 1000, WARN_MS: 5 * 60 * 1000, TOKEN_KEY: 'nxa_tok', ATTEMPT_KEY: 'nxa_atm', LOCKOUT_KEY: 'nxa_lck' };
const USERS_PER_PAGE = 20, RPT_PER_PAGE = 15;

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
:root{--bg:#030312;--bg2:#06071a;--bg3:#0a0b22;--bg4:#0d0e28;--cyan:#00e5ff;--purple:#8800ff;--pink:#ff2d6b;--green:#00ffaa;--yellow:#ffd600;--orange:#ff8c00;--text:#b8cfff;--dim:#3a4a7a;--dim2:#1e2a4a;--b:rgba(0,229,255,.1);--b2:rgba(0,229,255,.06);--r:10px;--r2:7px}
*{margin:0;padding:0;box-sizing:border-box}input,textarea,select{-webkit-user-select:text;user-select:text}
html,body{min-height:100%;font-family:'JetBrains Mono',monospace;background:var(--bg);color:var(--text);font-size:13px;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;background:linear-gradient(rgba(0,229,255,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.012) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0}
.login-overlay{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:20px}
.login-box{background:var(--bg2);border:1px solid var(--b);border-radius:16px;padding:32px;width:100%;max-width:400px;text-align:center;box-shadow:0 0 60px rgba(0,229,255,.05)}
.login-logo{font-family:'Orbitron',sans-serif;font-size:22px;font-weight:900;background:linear-gradient(135deg,var(--cyan),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px}
.login-sub{font-size:9px;color:var(--dim);letter-spacing:2px;font-family:'Orbitron',sans-serif;margin-bottom:24px}
.login-icon{width:56px;height:56px;background:rgba(0,229,255,.05);border:1px solid var(--b);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
.login-label{font-size:8px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;text-align:left}
.login-input-wrap{position:relative;margin-bottom:14px}
.login-input{width:100%;background:var(--bg3);border:1px solid var(--b);border-radius:8px;padding:10px 40px 10px 12px;color:white;font-family:'JetBrains Mono',monospace;font-size:12px;outline:none;transition:.2s;letter-spacing:2px}
.login-input:focus{border-color:rgba(0,229,255,.4);box-shadow:0 0 0 2px rgba(0,229,255,.06)}
.login-eye{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--dim);cursor:pointer;padding:4px;transition:.15s}
.login-eye:hover{color:var(--cyan)}
.login-btn{width:100%;padding:11px;background:linear-gradient(135deg,var(--cyan),#0066dd);border:none;border-radius:8px;color:#030312;font-family:'Orbitron',sans-serif;font-size:9px;font-weight:700;letter-spacing:1.5px;cursor:pointer;transition:.15s;margin-top:4px}
.login-btn:hover{opacity:.9;transform:translateY(-1px)}
.login-btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
.login-err{font-size:9px;color:var(--pink);min-height:16px;margin-top:8px;text-align:center}
.login-ok{font-size:9px;color:var(--green);min-height:16px;margin-top:8px;text-align:center}
.lockout-bar{height:3px;background:var(--dim2);border-radius:3px;margin-top:10px;overflow:hidden}
.lockout-fill{height:100%;background:var(--pink);border-radius:3px;transition:width .5s linear}
.attempt-dots{display:flex;gap:5px;justify-content:center;margin-top:10px}
.adot{width:8px;height:8px;border-radius:50%;background:var(--dim2);transition:.2s}
.adot.used{background:var(--pink)}
.nav{position:sticky;top:0;z-index:200;display:flex;align-items:center;gap:12px;padding:8px 20px;background:rgba(3,3,18,.97);border-bottom:1px solid var(--b);backdrop-filter:blur(12px)}
.nav-logo{font-family:'Orbitron',sans-serif;font-size:12px;font-weight:900;background:linear-gradient(135deg,var(--cyan),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-decoration:none;flex-shrink:0}
.nav-badge{font-size:8px;color:var(--dim);font-family:'Orbitron',sans-serif;letter-spacing:2px;flex-shrink:0}
.nav-spacer{flex:1}
.nav-user{font-size:9px;color:var(--dim);display:flex;align-items:center;gap:6px}
.nav-dot{width:6px;height:6px;background:var(--green);border-radius:50%;animation:blink 2s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
.nav-warn{font-size:8px;color:var(--yellow);display:flex;align-items:center;gap:4px}
.nav-logout{background:none;border:1px solid rgba(255,45,107,.3);border-radius:5px;color:var(--pink);font-size:9px;padding:4px 10px;cursor:pointer;font-family:'JetBrains Mono',monospace;transition:.15s}
.nav-logout:hover{background:rgba(255,45,107,.1)}
.nav-back{background:none;border:1px solid var(--b);border-radius:5px;color:var(--dim);font-size:9px;padding:4px 10px;cursor:pointer;font-family:'JetBrains Mono',monospace;transition:.15s;text-decoration:none;white-space:nowrap}
.nav-back:hover{color:var(--cyan);border-color:var(--cyan)}
.tab-nav{display:flex;gap:2px;padding:12px 20px 0;overflow-x:auto;border-bottom:1px solid var(--b);background:rgba(6,7,26,.6);position:sticky;top:49px;z-index:100;backdrop-filter:blur(10px)}
.tab-nav::-webkit-scrollbar{height:2px}
.tab-nav::-webkit-scrollbar-thumb{background:var(--b)}
.tab-btn{background:none;border:none;border-bottom:2px solid transparent;color:var(--dim);font-family:'Orbitron',sans-serif;font-size:8px;font-weight:700;letter-spacing:1.5px;padding:8px 14px;cursor:pointer;white-space:nowrap;transition:.15s;margin-bottom:-1px}
.tab-btn:hover{color:var(--text)}
.tab-btn.active{color:var(--cyan);border-bottom-color:var(--cyan)}
.tab-panel{display:none;max-width:1000px;margin:0 auto;padding:20px 16px 60px}
.tab-panel.active{display:block}
.card{background:var(--bg2);border:1px solid var(--b);border-radius:var(--r);padding:16px;margin-bottom:16px}
.card-title{font-family:'Orbitron',sans-serif;font-size:8px;color:var(--cyan);letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.card-title-left{display:flex;align-items:center;gap:6px}
.ct-icon{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.stat-box{background:var(--bg2);border:1px solid var(--b);border-radius:var(--r);padding:14px;text-align:center;position:relative;overflow:hidden}
.stat-box::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent,var(--cyan));opacity:.5}
.stat-num{font-family:'Orbitron',sans-serif;font-size:22px;font-weight:900;color:var(--yellow)}
.stat-label{font-size:8px;color:var(--dim);margin-top:4px;text-transform:uppercase;letter-spacing:1px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.fg{margin-bottom:10px}
.fl{font-size:8px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;display:block}
.fi{width:100%;background:var(--bg3);border:1px solid var(--b);border-radius:5px;padding:7px 10px;color:white;font-family:'JetBrains Mono',monospace;font-size:11px;outline:none;transition:.15s}
.fi:focus{border-color:rgba(0,229,255,.35)}
.fi::placeholder{color:var(--dim)}
.fs{width:100%;background:var(--bg3);border:1px solid var(--b);border-radius:5px;padding:7px 10px;color:white;font-family:'JetBrains Mono',monospace;font-size:11px;outline:none;cursor:pointer;-webkit-appearance:none}
.fta{width:100%;background:var(--bg3);border:1px solid var(--b);border-radius:5px;padding:7px 10px;color:white;font-family:'JetBrains Mono',monospace;font-size:11px;outline:none;resize:vertical;min-height:70px;transition:.15s}
.fta:focus{border-color:rgba(0,229,255,.35)}
.btn{padding:7px 14px;border-radius:6px;border:none;font-family:'Orbitron',sans-serif;font-size:7.5px;font-weight:700;cursor:pointer;transition:.15s;letter-spacing:1px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.btn svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0}
.btn-cyan{background:linear-gradient(135deg,var(--cyan),#0088ff);color:#030312}
.btn-green{background:rgba(0,255,170,.12);border:1px solid rgba(0,255,170,.25);color:var(--green)}
.btn-red{background:rgba(255,45,107,.12);border:1px solid rgba(255,45,107,.25);color:var(--pink)}
.btn-yellow{background:rgba(255,214,0,.12);border:1px solid rgba(255,214,0,.25);color:var(--yellow)}
.btn-purple{background:rgba(136,0,255,.12);border:1px solid rgba(136,0,255,.25);color:#bb55ff}
.btn-dim{background:rgba(255,255,255,.05);border:1px solid var(--b);color:var(--text)}
.btn-sm{padding:4px 9px;font-size:7px}
.btn-xs{padding:3px 7px;font-size:6.5px}
.btn-full{width:100%;justify-content:center}
.btn:hover{opacity:.85;transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn:disabled{opacity:.35;cursor:not-allowed;transform:none}
.tbl-wrap{overflow-x:auto;border-radius:var(--r2);border:1px solid var(--b)}
.tbl{width:100%;border-collapse:collapse;font-size:10px}
.tbl th{color:var(--dim);font-size:7.5px;text-transform:uppercase;letter-spacing:1px;padding:7px 10px;text-align:left;background:rgba(0,0,0,.3);border-bottom:1px solid var(--b)}
.tbl td{padding:7px 10px;border-bottom:1px solid var(--b2);color:var(--text);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:rgba(0,229,255,.025)}
.tbl-empty{text-align:center;color:var(--dim);padding:24px!important}
.badge{display:inline-block;font-size:7px;font-weight:700;padding:2px 7px;border-radius:10px;font-family:'Orbitron',monospace;letter-spacing:.5px}
.b-free{background:rgba(58,74,122,.3);color:var(--dim)}
.b-pro{background:rgba(0,229,255,.12);color:var(--cyan)}
.b-owner{background:rgba(255,214,0,.12);color:var(--yellow)}
.b-admin{background:rgba(136,0,255,.12);color:#bb55ff}
.b-banned{background:rgba(255,45,107,.12);color:var(--pink)}
.b-payment{background:rgba(0,255,170,.12);color:var(--green)}
.b-pending{background:rgba(255,214,0,.12);color:var(--yellow)}
.b-confirmed{background:rgba(0,255,170,.12);color:var(--green)}
.b-rejected{background:rgba(255,45,107,.12);color:var(--pink)}
.b-bug{background:rgba(255,140,0,.12);color:var(--orange)}
.st{font-size:10px;margin-top:8px;min-height:16px;line-height:1.5}
.st-ok{color:var(--green)}.st-err{color:var(--pink)}.st-info{color:var(--yellow)}
.ur{background:var(--bg3);border:1px solid var(--b);border-radius:8px;padding:12px;margin-top:10px;font-size:10px}
.ur-row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--b2)}
.ur-row:last-child{border-bottom:none}
.ur-key{color:var(--dim)}.ur-val{color:var(--text)}
.ur-ok{color:var(--green)}.ur-err{color:var(--pink)}.ur-yw{color:var(--yellow)}.ur-cy{color:var(--cyan)}
.ur-avatar{width:44px;height:44px;border-radius:50%;border:2px solid var(--cyan);display:block;margin-bottom:8px;object-fit:cover}
.log-box{background:rgba(0,0,0,.4);border:1px solid var(--b);border-radius:6px;padding:8px;max-height:280px;overflow-y:auto;font-size:9px;line-height:1.7}
.log-ok{color:var(--green)}.log-err{color:var(--pink)}.log-yw{color:var(--yellow)}.log-dim{color:var(--dim)}
.page-btns{display:flex;gap:5px;margin-top:10px;justify-content:center;flex-wrap:wrap}
.pbtn{background:var(--bg3);border:1px solid var(--b);border-radius:4px;color:var(--dim);font-size:8px;padding:3px 9px;cursor:pointer;font-family:'JetBrains Mono',monospace}
.pbtn:hover,.pbtn.active{color:var(--cyan);border-color:rgba(0,229,255,.4);background:rgba(0,229,255,.06)}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px}
.modal{background:var(--bg2);border:1px solid var(--b);border-radius:12px;padding:20px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto}
.modal-title{font-family:'Orbitron',sans-serif;font-size:11px;color:var(--cyan);margin-bottom:14px;display:flex;align-items:center;justify-content:space-between}
.modal-close{background:none;border:none;color:var(--dim);cursor:pointer;font-size:16px;padding:0}
.modal-close:hover{color:var(--pink)}
.toast-el{position:fixed;bottom:20px;right:20px;z-index:9999;background:var(--bg3);border:1px solid var(--b);border-radius:8px;padding:10px 16px;font-size:11px;max-width:320px;animation:toastIn .2s ease}
@keyframes toastIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
.qgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
.sep{height:1px;background:var(--b);margin:12px 0}
.spin{animation:spin 1s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:600px){.stats-grid{grid-template-columns:1fr 1fr}.g2,.g3{grid-template-columns:1fr}}
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(s: unknown) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function fmtDate(ts?: string) { if (!ts) return '—'; try { return new Date(ts).toLocaleString('id-ID', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); } catch { return ts; } }
function fmtRel(ts?: string) { if (!ts) return '—'; const d = Date.now() - new Date(ts).getTime(); if (isNaN(d)) return '—'; if (d < 60000) return 'just now'; if (d < 3600000) return Math.floor(d/60000)+'m ago'; if (d < 86400000) return Math.floor(d/3600000)+'h ago'; return Math.floor(d/86400000)+'d ago'; }

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ActionsPage() {
  // Auth
  const [tokenInput, setTokenInput]   = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginErr, setLoginErr]       = useState('');
  const [loginOk, setLoginOk]         = useState('');
  const [attempts, setAttempts]       = useState(0);
  const [lockUntil, setLockUntil]     = useState(0);
  const [lockRemain, setLockRemain]   = useState(0);
  const [authenticated, setAuthenticated] = useState(false);
  const [inactWarn, setInactWarn]     = useState(false);
  const adminTokenRef  = useRef('');
  const inactTimerRef  = useRef<ReturnType<typeof setTimeout>>();
  const warnTimerRef   = useRef<ReturnType<typeof setTimeout>>();

  // Session display
  const [navUser, setNavUser]   = useState('—');
  const [heroSub, setHeroSub]   = useState('Loading...');
  const sessionRef = useRef<NexusSession | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState('overview');

  // Stats
  const [stats, setStats] = useState({ total: '—', pro: '—', active: '—', credits: '—' });

  // Quick manage
  const [qUser, setQUser]   = useState('');
  const [qAmt,  setQAmt]    = useState('50');
  const [qSt,   setQSt]     = useState<StState>({ msg: '', type: '' });

  // Pending payments
  const [pendingPayments, setPendingPayments] = useState<Report[]>([]);

  // Users tab
  const [lookupInput,  setLookupInput]  = useState('');
  const [foundUser,    setFoundUser]    = useState('');
  const [userResultData, setUserResultData] = useState<any>(null);
  const [allUsers,     setAllUsers]     = useState<[string, any][]>([]);
  const [filteredUsers,setFilteredUsers]= useState<[string, any][]>([]);
  const [searchU,      setSearchU]      = useState('');
  const [userPage,     setUserPage]     = useState(1);
  const [credU, setCredU] = useState(''); const [credAmt, setCredAmt] = useState(''); const [credPlan, setCredPlan] = useState(''); const [credSt, setCredSt] = useState<StState>({ msg:'', type:'' });
  const [banU,  setBanU]  = useState(''); const [banReason, setBanReason] = useState(''); const [banSt, setBanSt] = useState<StState>({ msg:'', type:'' });
  const [planU, setPlanU] = useState(''); const [planChoice, setPlanChoice] = useState('free'); const [planCR, setPlanCR] = useState(''); const [planSt, setPlanSt] = useState<StState>({ msg:'', type:'' });
  const allUsersRef = useRef<[string, any][]>([]);

  // Reports tab
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [rptPage, setRptPage]       = useState(1);
  const [rptTypeFilter, setRptTypeFilter]     = useState('');
  const [rptStatusFilter, setRptStatusFilter] = useState('');
  const [rptFromFilter, setRptFromFilter]     = useState('');
  const [rptModalOpen, setRptModalOpen]       = useState(false);
  const [currentReport, setCurrentReport]     = useState<Report | null>(null);
  const [rptAdminNote, setRptAdminNote]       = useState('');
  const [rptModalSt, setRptModalSt]           = useState<StState>({ msg:'', type:'' });

  // Codes tab
  const [codes, setCodes]           = useState<Code[]>([]);
  const [codeCredits, setCodeCredits] = useState('50');
  const [codeUses, setCodeUses]     = useState('10');
  const [codeExpiry, setCodeExpiry] = useState('');
  const [codeSt, setCodeSt]         = useState<StState>({ msg:'', type:'' });

  // Inbox tab
  const [inboxTo, setInboxTo]           = useState(''); const [inboxSubj, setInboxSubj] = useState(''); const [inboxType, setInboxType] = useState('general'); const [inboxContent, setInboxContent] = useState(''); const [inboxSt, setInboxSt] = useState<StState>({ msg:'', type:'' });
  const [bcRecipients, setBcRecipients] = useState(''); const [bcSubj, setBcSubj]         = useState(''); const [bcContent, setBcContent] = useState(''); const [bcSt, setBcSt] = useState<StState>({ msg:'', type:'' });

  // Logs tab
  const [logLines,  setLogLines]  = useState<string[]>([]);
  const [histLines, setHistLines] = useState<string[]>([]);
  const [logFilter, setLogFilter] = useState('');

  // Toast
  const [toasts, setToasts] = useState<{ id: number; msg: string; col: string }[]>([]);
  let toastId = useRef(0);

  function toast(msg: string, col = 'var(--cyan)') { const id = ++toastId.current; setToasts(p => [...p, { id, msg, col }]); setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3200); }
  function setSt(setter: (v: StState) => void, msg: string, type: StType) { setter({ msg, type }); if (type === 'ok') setTimeout(() => setter({ msg:'', type:'' }), 3500); }

  // ── Boot: check saved token ────────────────────────────────────────────────
  useEffect(() => {
    const la = parseInt(localStorage.getItem(SEC.ATTEMPT_KEY) || '0', 10);
    const lu = parseInt(localStorage.getItem(SEC.LOCKOUT_KEY) || '0', 10);
    setAttempts(la);
    if (lu && Date.now() < lu) { setLockUntil(lu); startLockCountdown(lu - Date.now()); }
    const saved = localStorage.getItem(SEC.TOKEN_KEY) || '';
    if (!saved) return;
    setLoginOk('⟳ Resuming session...');
    fetch('/api/sync?admin_check=1', { headers: { 'Authorization': `Bearer ${saved}`, 'X-Admin-Token': saved, 'X-Requested-With': 'XMLHttpRequest' } })
      .then(r => { if (r.ok) { adminTokenRef.current = saved; setLoginOk('✅ Session resumed!'); setTimeout(() => mountPanel(), 400); } else { localStorage.removeItem(SEC.TOKEN_KEY); setLoginOk(''); setLoginErr('Session expired. Re-authenticate.'); } })
      .catch(() => setLoginOk(''));
  }, []);

  function startLockCountdown(ms: number) {
    const end = Date.now() + ms;
    const interval = setInterval(() => {
      const remain = Math.max(0, end - Date.now());
      setLockRemain(Math.ceil(remain / 1000));
      if (remain <= 0) { clearInterval(interval); setLockRemain(0); setLockUntil(0); setAttempts(0); setLoginErr('You may try again.'); localStorage.removeItem(SEC.LOCKOUT_KEY); localStorage.removeItem(SEC.ATTEMPT_KEY); }
    }, 500);
  }

  function resetActivity() {
    clearTimeout(inactTimerRef.current); clearTimeout(warnTimerRef.current); setInactWarn(false);
    if (!adminTokenRef.current) return;
    warnTimerRef.current   = setTimeout(() => setInactWarn(true), SEC.SESSION_MS - SEC.WARN_MS);
    inactTimerRef.current  = setTimeout(() => { toast('⏱ Session expired.', 'var(--yellow)'); doLogout(); }, SEC.SESSION_MS);
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async function doLogin() {
    if (lockUntil && Date.now() < lockUntil) return;
    const token = tokenInput.trim();
    if (!token) { setLoginErr('Token cannot be empty.'); return; }
    if (token.length > 512) { setLoginErr('Token too long.'); return; }
    setLoginLoading(true); setLoginErr(''); setLoginOk('');
    try {
      const r = await fetch('/api/sync?admin_check=1', { headers: { 'Authorization': `Bearer ${token}`, 'X-Admin-Token': token, 'X-Requested-With': 'XMLHttpRequest' } });
      if (r.status === 401 || r.status === 403) {
        const newA = attempts + 1;
        setAttempts(newA); localStorage.setItem(SEC.ATTEMPT_KEY, String(newA));
        if (newA >= SEC.MAX_ATTEMPTS) { const lu = Date.now() + SEC.LOCKOUT_SEC * 1000; setLockUntil(lu); localStorage.setItem(SEC.LOCKOUT_KEY, String(lu)); startLockCountdown(SEC.LOCKOUT_SEC * 1000); setAttempts(0); }
        else setLoginErr(`✗ Invalid token. ${SEC.MAX_ATTEMPTS - newA} attempt(s) remaining.`);
        setTokenInput(''); setLoginLoading(false); return;
      }
      if (!r.ok) { const d = await r.json().catch(() => ({})); setLoginErr('✗ ' + (d.error || 'Auth failed.')); setLoginLoading(false); return; }
      adminTokenRef.current = token;
      localStorage.setItem(SEC.TOKEN_KEY, token);
      localStorage.removeItem(SEC.ATTEMPT_KEY); localStorage.removeItem(SEC.LOCKOUT_KEY);
      setAttempts(0); setLoginOk('✅ Authenticated! Loading...');
      setTimeout(() => mountPanel(), 600);
    } catch (e: any) { setLoginErr('✗ Network: ' + e.message); }
    setLoginLoading(false);
  }

  function mountPanel() {
    try {
      const raw = localStorage.getItem('nexus_session');
      if (raw) { const s: NexusSession = JSON.parse(raw); sessionRef.current = s; const u = '@' + (s?.user?.username || '?'); setNavUser(u); setHeroSub(`${s?.data?.plan === 'owner' ? '⭐ Owner' : '🛡 Admin'} — ${u}`); }
      else { setNavUser('Token Auth'); setHeroSub('🔑 Admin Token'); }
    } catch {}
    setAuthenticated(true); resetActivity(); loadStats(); loadPendingPayments();
  }

  function doLogout() {
    adminTokenRef.current = ''; localStorage.removeItem(SEC.TOKEN_KEY);
    clearTimeout(inactTimerRef.current); clearTimeout(warnTimerRef.current);
    setAuthenticated(false); setTokenInput(''); setLoginErr(''); setLoginOk(''); toast('Signed out.', 'var(--dim)');
  }

  // ── Authenticated API ──────────────────────────────────────────────────────
  async function api(url: string, opts?: { method?: string; body?: Record<string, unknown> }) {
    if (!adminTokenRef.current) return { ok: false, status: 401, data: { error: 'Not authenticated' } };
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminTokenRef.current}`, 'X-Admin-Token': adminTokenRef.current, 'X-Requested-With': 'XMLHttpRequest' };
    const init: RequestInit = { method: opts?.method || 'GET', headers };
    if (opts?.body) init.body = JSON.stringify(opts.body);
    try {
      const r = await fetch(url, init);
      let data: any;
      try { data = await r.json(); } catch { data = { error: `Status ${r.status}` }; }
      if (r.status === 401) toast('⛔ Unauthorized', 'var(--pink)');
      return { ok: r.ok, status: r.status, data };
    } catch (e: any) { return { ok: false, status: 0, data: { error: e.message } }; }
  }

  // ── Tab Switch ─────────────────────────────────────────────────────────────
  function showTab(name: string) {
    setActiveTab(name);
    if (name === 'users'   && !allUsers.length) loadUsers();
    if (name === 'reports') loadReports();
    if (name === 'codes')   loadCodes();
    if (name === 'logs')  { loadLogs(); loadHistory(); }
  }

  // ── Overview ───────────────────────────────────────────────────────────────
  async function loadStats() {
    const r = await api('/api/sync?list=1');
    if (!r.ok) return;
    const all: [string, any][] = Object.entries(r.data || {}).filter(([k]) => !k.startsWith('_'));
    allUsersRef.current = all;
    const today = new Date().toDateString();
    setStats({ total: String(all.length), pro: String(all.filter(([,v]) => v?.plan==='pro'||v?.plan==='owner').length), active: String(all.filter(([,v]) => v?._updated && new Date(v._updated).toDateString()===today).length), credits: all.reduce((s,[,v]) => s+parseFloat(v?.credits||0),0).toFixed(0) });
  }

  async function loadPendingPayments() {
    const r = await api('/api/report?status=pending&type=payment&limit=5');
    if (!r.ok) { setPendingPayments([]); return; }
    setPendingPayments((r.data?.reports || []) as Report[]);
  }

  async function qAction(type: string) {
    const u = qUser.trim().toLowerCase();
    const amt = parseFloat(qAmt) || 50;
    if (!u) { setSt(setQSt, '⚠ Enter username!', 'err'); return; }
    if (!/^[a-z0-9_]{3,20}$/.test(u)) { setSt(setQSt, '⚠ Invalid username.', 'err'); return; }
    setSt(setQSt, '⟳ Processing...', 'info');
    const payloads: Record<string, unknown> = {
      give: { action:'give-credits', target:u, amount: amt }, take: { action:'give-credits', target:u, amount:-amt },
      pro:  { action:'set-plan',     target:u, plan:'pro' }, ban:  { action:'ban',  target:u, reason:'Admin action' },
      unban:{ action:'unban',        target:u }, reset:{ action:'reset-credits', target:u },
    };
    const r = await api('/api/sync', { method:'POST', body: payloads[type] as any });
    if (r.ok && !r.data.error) { const labels: Record<string,string> = { give:`+${amt} CR`, take:`-${amt} CR`, pro:'Pro set', ban:'Banned', unban:'Unbanned', reset:'Credits reset' }; setSt(setQSt, `✅ ${labels[type]} → @${u}`, 'ok'); toast(`${labels[type]} → @${u}`, 'var(--green)'); loadStats(); }
    else setSt(setQSt, `✗ ${r.data?.error || 'Failed. Check token.'}`, 'err');
  }

  async function quickConfirm(id: string) { if (!confirm('Confirm payment?')) return; const r = await api('/api/report', { method:'PATCH', body:{ id, action:'confirm', adminNote:'' } }); if (r.ok && r.data.success) { toast('✅ Confirmed!', 'var(--green)'); loadPendingPayments(); } else toast('Error: ' + r.data?.error, 'var(--pink)'); }
  async function quickReject(id: string)  { if (!confirm('Reject payment?'))  return; const r = await api('/api/report', { method:'PATCH', body:{ id, action:'reject',  adminNote:'Rejected' } }); if (r.ok && r.data.success) { toast('❌ Rejected.',  'var(--pink)'); loadPendingPayments(); } else toast('Error: ' + r.data?.error, 'var(--pink)'); }

  // ── Users ──────────────────────────────────────────────────────────────────
  async function loadUsers() {
    const r = await api('/api/sync?list=1');
    if (!r.ok) return;
    const all: [string, any][] = Object.entries(r.data || {}).filter(([k]) => !k.startsWith('_')).sort(([,a],[,b]) => (b?.credits||0)-(a?.credits||0));
    setAllUsers(all); allUsersRef.current = all; setFilteredUsers(all); setUserPage(1);
  }

  function filterUsers(q: string) { const lq = q.toLowerCase(); setFilteredUsers(q ? allUsers.filter(([u]) => u.includes(lq)) : allUsers); setUserPage(1); }

  async function doLookup(u: string) {
    if (!u) return;
    const r = await api(`/api/sync?user=${encodeURIComponent(u.toLowerCase())}`);
    if (!r.ok || !Object.keys(r.data || {}).length) { setUserResultData(null); setFoundUser(''); return; }
    setFoundUser(u.toLowerCase()); setUserResultData(r.data);
  }

  async function urAction(type: string) {
    if (!foundUser) return;
    const payloads: Record<string, unknown> = { give:{ action:'give-credits', target:foundUser, amount:50 }, ban:{ action:'ban', target:foundUser, reason:'Admin' }, unban:{ action:'unban', target:foundUser }, pro:{ action:'set-plan', target:foundUser, plan:'pro' }, free:{ action:'set-plan', target:foundUser, plan:'free' }, reset:{ action:'reset-credits', target:foundUser } };
    const r = await api('/api/sync', { method:'POST', body: payloads[type] as any });
    if (r.ok && !r.data.error) { toast('✅ Done → @'+foundUser, 'var(--green)'); doLookup(foundUser); loadStats(); }
    else toast('✗ '+r.data?.error, 'var(--pink)');
  }

  async function manageCredits(dir: number) {
    const u = credU.trim().toLowerCase(); const amt = parseFloat(credAmt);
    if (!u || isNaN(amt) || amt<=0) { setSt(setCredSt, '⚠ Fill username & amount!', 'err'); return; }
    const r = await api('/api/sync', { method:'POST', body:{ action:'give-credits', target:u, amount:amt*dir } });
    if (!r.ok || r.data.error) { setSt(setCredSt, '✗ '+r.data?.error, 'err'); return; }
    setSt(setCredSt, `✅ ${dir>0?'+':''}${amt*dir} CR → @${u}`, 'ok'); toast(`${dir>0?'+':''}${amt*dir} CR → @${u}`, dir>0?'var(--green)':'var(--pink)');
    if (credPlan) await api('/api/sync', { method:'POST', body:{ action:'set-plan', target:u, plan:credPlan } }); loadStats();
  }

  async function doBan(isBan: boolean) {
    const u = banU.trim().toLowerCase(); if (!u) { setSt(setBanSt, '⚠ Enter username!', 'err'); return; }
    const r = await api('/api/sync', { method:'POST', body:{ action:isBan?'ban':'unban', target:u, reason:banReason||'Admin' } });
    if (r.ok && !r.data.error) { setSt(setBanSt, `✅ @${u} ${isBan?'BANNED':'UNBANNED'}`, 'ok'); toast((isBan?'🔨 Banned':'✅ Unbanned')+' @'+u, isBan?'var(--pink)':'var(--green)'); loadStats(); }
    else setSt(setBanSt, '✗ '+r.data?.error, 'err');
  }

  async function doSetPlan() {
    const u = planU.trim().toLowerCase(); if (!u) { setSt(setPlanSt, '⚠ Enter username!', 'err'); return; }
    const r = await api('/api/sync', { method:'POST', body:{ action:'set-plan', target:u, plan:planChoice } });
    if (!r.ok || r.data.error) { setSt(setPlanSt, '✗ '+r.data?.error, 'err'); return; }
    if (planCR && !isNaN(parseFloat(planCR))) await api('/api/sync', { method:'POST', body:{ action:'set-credits', target:u, amount:parseFloat(planCR) } });
    setSt(setPlanSt, `✅ @${u} → ${planChoice.toUpperCase()}`, 'ok'); toast('Plan @'+u+' → '+planChoice.toUpperCase(), 'var(--yellow)'); loadStats();
  }

  async function quickBanUser(u: string) { if (!confirm(`Ban @${u}?`)) return; const r = await api('/api/sync', { method:'POST', body:{ action:'ban', target:u, reason:'Panel action' } }); if (r.ok) { toast('🔨 Banned @'+u, 'var(--pink)'); loadUsers(); } }
  async function quickUnban(u: string)   { const r = await api('/api/sync', { method:'POST', body:{ action:'unban', target:u } }); if (r.ok) { toast('✅ Unbanned @'+u, 'var(--green)'); loadUsers(); } }

  // ── Reports ────────────────────────────────────────────────────────────────
  async function loadReports() {
    const params = new URLSearchParams();
    if (rptTypeFilter)   params.set('type',   rptTypeFilter);
    if (rptStatusFilter) params.set('status', rptStatusFilter);
    if (rptFromFilter.trim()) params.set('from', rptFromFilter.trim());
    params.set('limit', '100');
    const r = await api('/api/report?' + params);
    if (!r.ok) { setAllReports([]); return; }
    setAllReports((r.data?.reports || []) as Report[]); setRptPage(1);
  }

  async function processReport(action: string) {
    if (!currentReport) return;
    setSt(setRptModalSt, '⟳ Processing...', 'info');
    const r = await api('/api/report', { method:'PATCH', body:{ id:currentReport.id, action, adminNote:rptAdminNote } });
    if (r.ok && r.data.success) { setSt(setRptModalSt, `✅ ${action==='confirm'?'Confirmed!':'Rejected.'}`, 'ok'); toast(action==='confirm'?'✅ Payment Confirmed!':'❌ Rejected', action==='confirm'?'var(--green)':'var(--pink)'); setTimeout(() => { setRptModalOpen(false); loadReports(); loadPendingPayments(); }, 1500); }
    else setSt(setRptModalSt, '✗ '+r.data?.error, 'err');
  }

  async function deleteReport(id: string) { if (!confirm('Delete?')) return; const r = await api('/api/report', { method:'DELETE', body:{ id } }); if (r.ok) { toast('Deleted.', 'var(--dim)'); loadReports(); } }

  // ── Codes ──────────────────────────────────────────────────────────────────
  async function loadCodes() {
    const r = await api('/api/redeem?list=1');
    if (!r.ok) { setCodes([]); return; }
    setCodes((r.data?.codes || []) as Code[]);
  }

  async function createCode() {
    const credits = parseFloat(codeCredits)||0; const maxUses = parseInt(codeUses)||0; const expiryDays = codeExpiry ? parseInt(codeExpiry) : null;
    if (credits<=0||maxUses<=0) { setSt(setCodeSt, '⚠ Fill credits & max uses!', 'err'); return; }
    const r = await api('/api/redeem', { method:'POST', body:{ action:'create', credits, maxUses, expiresInDays:expiryDays } });
    if (r.ok && r.data.success) { setSt(setCodeSt, `✅ Code: ${r.data.code?.code}`, 'ok'); toast(`🎟 ${r.data.code?.code}`, 'var(--green)'); loadCodes(); }
    else setSt(setCodeSt, '✗ '+(r.data?.error||'Failed'), 'err');
  }

  async function deleteCode(code: string) { if (!confirm('Delete code '+code+'?')) return; const r = await api('/api/redeem', { method:'DELETE', body:{ code } }); if (r.ok) { toast('Code deleted.', 'var(--pink)'); loadCodes(); } }

  // ── Inbox ──────────────────────────────────────────────────────────────────
  async function sendInbox() {
    const to = inboxTo.trim().toLowerCase(); if (!to || !inboxContent.trim()) { setSt(setInboxSt, '⚠ Fill username & message!', 'err'); return; }
    const r = await api('/api/inbox', { method:'POST', body:{ to, from:'NEXUS Admin', subject:inboxSubj||'Message from Admin', content:inboxContent, type:inboxType, sender_id: sessionRef.current?.user?.username||'admin' } });
    if (r.ok && r.data.status==='ok') { setSt(setInboxSt, `✅ Sent to @${to}!`, 'ok'); toast('✉ Sent to @'+to, 'var(--green)'); setInboxContent(''); }
    else setSt(setInboxSt, '✗ '+(r.data?.error||'Failed'), 'err');
  }

  async function sendBroadcast() {
    const raw = bcRecipients.trim(); if (!raw || !bcContent.trim()) { setSt(setBcSt, '⚠ Fill recipients & message!', 'err'); return; }
    let targets: string[] = [];
    if (raw.toLowerCase()==='all') { targets = allUsersRef.current.map(([u]) => u); if (!targets.length) { setSt(setBcSt, 'Load Users tab first!', 'err'); return; } if (!confirm(`Send to ALL ${targets.length} users?`)) return; }
    else targets = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    let ok=0, fail=0;
    for (let i=0; i<targets.length; i++) {
      if (!/^[a-z0-9_]{1,25}$/.test(targets[i])) { fail++; continue; }
      const r = await api('/api/inbox', { method:'POST', body:{ to:targets[i], from:'NEXUS Admin', subject:bcSubj||'Broadcast', content:bcContent, type:'system', sender_id: sessionRef.current?.user?.username||'admin' } });
      if (r.ok && r.data.status==='ok') ok++; else fail++;
      if (i%5===4) setSt(setBcSt, `⟳ ${i+1}/${targets.length}...`, 'info');
    }
    setSt(setBcSt, `✅ Sent: ${ok} | Failed: ${fail}`, fail>0?'info':'ok');
    toast(`Broadcast: ${ok}/${targets.length}`, 'var(--yellow)');
  }

  // ── Logs ───────────────────────────────────────────────────────────────────
  async function loadLogs() {
    let r = await api('/api/control?get_logs=1&limit=50');
    if (!r.ok) r = await api('/api/control', { method:'POST', body:{ type:'get_logs', limit:50 } });
    const logs: any[] = (r.data?.logs || []);
    const filter = logFilter;
    const filtered = filter ? logs.filter((l: any) => l.action===filter) : logs;
    setLogLines(filtered.slice(0,50).map((l: any) => {
      const t = l.ts ? new Date(l.ts).toLocaleTimeString('id-ID',{hour12:false}) : '?';
      const cls = l.action==='ban' ? 'log-err' : l.action?.includes('credit') ? 'log-yw' : 'log-ok';
      return `<div class="${cls}">[${escHtml(t)}] <strong>${escHtml(l.action||'?')}</strong>${l.user?' by @'+escHtml(l.user):''}${l.target?' → @'+escHtml(l.target):''}${l.name?' ('+escHtml(l.name)+')':''}</div>`;
    }));
  }

  async function loadHistory() {
    let r = await api('/api/control?get_history=1&limit=30');
    if (!r.ok) r = await api('/api/control', { method:'POST', body:{ type:'get_history', limit:30 } });
    const hist: any[] = r.data?.history || [];
    setHistLines(hist.slice(0,30).map((h: any) => {
      const t = h.ts ? new Date(h.ts).toLocaleTimeString('id-ID',{hour12:false}) : '?';
      return `<div class="log-dim">[${escHtml(t)}] <span style="color:var(--cyan)">${escHtml(h.action||'?')}</span>${h.user?' by @'+escHtml(h.user):''}${h.details?' — <span style="color:var(--text)">'+escHtml(String(h.details).substring(0,60))+'</span>':''}</div>`;
    }));
  }

  // ── Pagination helpers ─────────────────────────────────────────────────────
  const usersSlice = filteredUsers.slice((userPage-1)*USERS_PER_PAGE, userPage*USERS_PER_PAGE);
  const usersTotalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);
  const reportsSlice = allReports.slice((rptPage-1)*RPT_PER_PAGE, rptPage*RPT_PER_PAGE);
  const rptTotalPages = Math.ceil(allReports.length / RPT_PER_PAGE);

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Toasts */}
      {toasts.map(t => <div key={t.id} className="toast-el" style={{ color: t.col }}>{t.msg}</div>)}

      {/* ── LOGIN ── */}
      {!authenticated && (
        <div className="login-overlay">
          <div className="login-box">
            <div className="login-logo">NEXUS AI</div>
            <div className="login-sub">ADMIN PANEL</div>
            <div className="login-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/><circle cx="12" cy="16" r="1" fill="var(--cyan)"/></svg>
            </div>
            <div className="login-label">Admin Token</div>
            <div className="login-input-wrap">
              <input className="login-input" type={showPass?'text':'password'} value={tokenInput} onChange={e=>setTokenInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLogin()} placeholder="Enter ADMIN_TOKEN..." autoComplete="off" />
              <button className="login-eye" onClick={()=>setShowPass(p=>!p)} tabIndex={-1}>
                {showPass ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>
            <button className="login-btn" onClick={doLogin} disabled={loginLoading || (lockRemain > 0)}>
              {lockRemain > 0 ? `🔒 Locked ${lockRemain}s` : loginLoading ? 'AUTHENTICATING...' : 'AUTHENTICATE'}
            </button>
            <div className="login-err">{loginErr}</div>
            <div className="login-ok">{loginOk}</div>
            <div className="attempt-dots">{Array.from({length:5},(_,i)=><div key={i} className={`adot${i<attempts?' used':''}`}/>)}</div>
            {lockRemain > 0 && <div className="lockout-bar"><div className="lockout-fill" style={{width:`${(lockRemain/SEC.LOCKOUT_SEC)*100}%`}}/></div>}
          </div>
        </div>
      )}

      {/* ── AUTHENTICATED ── */}
      {authenticated && (
        <>
          {/* NAV */}
          <nav className="nav">
            <Link href="/" className="nav-logo">NEXUS AI</Link>
            <span className="nav-badge">ADMIN PANEL</span>
            <div className="nav-spacer"/>
            {inactWarn && <div className="nav-warn"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Session expires soon</div>}
            <div className="nav-user"><span className="nav-dot"/>{navUser}</div>
            <button className="nav-logout" onClick={doLogout}>Sign Out</button>
            <Link href="/" className="nav-back">← Back</Link>
          </nav>

          {/* TABS */}
          <div className="tab-nav">
            {[['overview','📊 Overview'],['users','👥 Users'],['reports','📋 Reports & Payments'],['codes','🎟 Redeem Codes'],['inbox','✉ Inbox'],['logs','📜 Logs']].map(([id,label])=>(
              <button key={id} className={`tab-btn${activeTab===id?' active':''}`} onClick={()=>showTab(id)}>{label}</button>
            ))}
          </div>

          {/* ── OVERVIEW TAB ── */}
          <div className={`tab-panel${activeTab==='overview'?' active':''}`} id="tab-overview">
            <div style={{marginBottom:14}}>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:16,fontWeight:900,background:'linear-gradient(135deg,var(--cyan),var(--purple))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',marginBottom:2}}>Admin Actions Panel</div>
              <div style={{fontSize:9,color:'var(--dim)'}}>{heroSub}</div>
            </div>
            <div className="stats-grid">
              {[{num:stats.total,label:'Total Users',accent:'var(--cyan)'},{num:stats.pro,label:'Pro / Owner',accent:'var(--purple)'},{num:stats.active,label:'Active Today',accent:'var(--green)'},{num:stats.credits,label:'Total Credits',accent:'var(--yellow)'}].map(s=>(
                <div key={s.label} className="stat-box" style={{'--accent':s.accent} as any}><div className="stat-num">{s.num}</div><div className="stat-label">{s.label}</div></div>
              ))}
            </div>
            <div className="g2">
              {/* Quick Manage */}
              <div className="card">
                <div className="card-title"><div className="card-title-left"><svg className="ct-icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>Quick Manage</div></div>
                <div className="fg"><label className="fl">Username</label><input className="fi" value={qUser} onChange={e=>setQUser(e.target.value)} placeholder="Roblox username..."/></div>
                <div className="fg"><label className="fl">Credits Amount</label><input className="fi" type="number" value={qAmt} onChange={e=>setQAmt(e.target.value)} placeholder="50" min="1"/></div>
                <div className="qgrid">
                  <button className="btn btn-green btn-full" onClick={()=>qAction('give')}><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Give Credits</button>
                  <button className="btn btn-red btn-full"   onClick={()=>qAction('take')}><svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>Take Credits</button>
                  <button className="btn btn-yellow btn-full" onClick={()=>qAction('pro')}><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Set Pro</button>
                  <button className="btn btn-red btn-full"   onClick={()=>qAction('ban')}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Ban User</button>
                  <button className="btn btn-green btn-full" onClick={()=>qAction('unban')}><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Unban User</button>
                  <button className="btn btn-dim btn-full"   onClick={()=>qAction('reset')}><svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>Reset CR</button>
                </div>
                {qSt.msg && <div className={`st st-${qSt.type}`}>{qSt.msg}</div>}
              </div>

              {/* Pending Payments */}
              <div className="card">
                <div className="card-title">
                  <div className="card-title-left"><svg className="ct-icon" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>Pending Payments</div>
                  <button className="btn btn-dim btn-sm" onClick={()=>showTab('reports')}>View All</button>
                </div>
                {pendingPayments.length===0
                  ? <div style={{color:'var(--green)',fontSize:10}}>✅ No pending payments.</div>
                  : pendingPayments.map(rpt=>(
                    <div key={rpt.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid var(--b2)'}}>
                      <div><div style={{color:'white',fontSize:10}}>@{rpt.from}</div><div style={{color:'var(--dim)',fontSize:8}}>{rpt.paymentTotal||'—'} · {rpt.paymentPack||'—'}</div></div>
                      <div style={{display:'flex',gap:4}}>
                        <button className="btn btn-green btn-xs" onClick={()=>quickConfirm(rpt.id)}>✓</button>
                        <button className="btn btn-red btn-xs"   onClick={()=>quickReject(rpt.id)}>✗</button>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          {/* ── USERS TAB ── */}
          <div className={`tab-panel${activeTab==='users'?' active':''}`} id="tab-users">
            <div className="g2">
              {/* Lookup */}
              <div className="card">
                <div className="card-title"><div className="card-title-left"><svg className="ct-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>User Lookup</div></div>
                <div className="fg"><label className="fl">Roblox Username</label><input className="fi" value={lookupInput} onChange={e=>setLookupInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLookup(lookupInput)} placeholder="username..."/></div>
                <button className="btn btn-cyan btn-full" onClick={()=>doLookup(lookupInput)}><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Search</button>
                {userResultData && (
                  <div className="ur">
                    {userResultData.robloxId && <img className="ur-avatar" src={`https://www.roblox.com/headshot-thumbnail/image?userId=${userResultData.robloxId}&width=80&height=80&format=png`} alt="" onError={(e)=>(e.target as HTMLImageElement).style.display='none'} loading="lazy"/>}
                    <div style={{fontWeight:700,color:'white',fontSize:13,marginBottom:6}}>@{foundUser}</div>
                    {[['Credits',parseFloat(userResultData.credits||0).toFixed(2)+' CR','ur-yw'],['Plan',(userResultData.plan||'free').toUpperCase(),userResultData.plan==='owner'?'ur-yw':userResultData.plan==='pro'?'ur-cy':''],['Status',userResultData.banned?'🔴 BANNED':'🟢 Active',userResultData.banned?'ur-err':'ur-ok'],['Last Seen',fmtDate(userResultData._updated),'']].map(([k,v,c])=>(
                      <div key={k} className="ur-row"><span className="ur-key">{k}</span><span className={`ur-val ${c}`}>{v}</span></div>
                    ))}
                    <div className="qgrid" style={{marginTop:10}}>
                      <button className="btn btn-green" onClick={()=>urAction('give')}>+50 CR</button>
                      <button className={`btn ${userResultData.banned?'btn-green':'btn-red'}`} onClick={()=>urAction(userResultData.banned?'unban':'ban')}>{userResultData.banned?'✅ Unban':'🔨 Ban'}</button>
                      <button className="btn btn-yellow" onClick={()=>urAction('pro')}>⭐ Set Pro</button>
                      <button className="btn btn-dim"    onClick={()=>urAction('reset')}>↻ Reset CR</button>
                      <button className="btn btn-purple" onClick={()=>{setInboxTo(foundUser);showTab('inbox');}}>✉ Inbox</button>
                      <button className="btn btn-dim"    onClick={()=>urAction('free')}>Set Free</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Manage Credits */}
              <div className="card">
                <div className="card-title"><div className="card-title-left"><svg className="ct-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>Manage Credits</div></div>
                <div className="fg"><label className="fl">Username</label><input className="fi" value={credU} onChange={e=>setCredU(e.target.value)} placeholder="Target username..."/></div>
                <div className="fg"><label className="fl">Amount</label><input className="fi" type="number" value={credAmt} onChange={e=>setCredAmt(e.target.value)} placeholder="100" min="1"/></div>
                <div className="fg"><label className="fl">Set Plan (optional)</label>
                  <select className="fs" value={credPlan} onChange={e=>setCredPlan(e.target.value)}>
                    <option value="">— No change —</option><option value="free">Free</option><option value="pro">Pro</option><option value="owner">Owner</option>
                  </select></div>
                <div className="g2" style={{gap:6}}>
                  <button className="btn btn-green btn-full" onClick={()=>manageCredits(1)}>+ Add</button>
                  <button className="btn btn-red btn-full"   onClick={()=>manageCredits(-1)}>− Remove</button>
                </div>
                {credSt.msg && <div className={`st st-${credSt.type}`}>{credSt.msg}</div>}
              </div>
            </div>

            <div className="g2">
              {/* Ban/Unban */}
              <div className="card">
                <div className="card-title"><div className="card-title-left"><svg className="ct-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Ban / Unban</div></div>
                <div className="fg"><label className="fl">Username</label><input className="fi" value={banU} onChange={e=>setBanU(e.target.value)} placeholder="Username..."/></div>
                <div className="fg"><label className="fl">Reason (for ban)</label><input className="fi" value={banReason} onChange={e=>setBanReason(e.target.value)} placeholder="Reason..."/></div>
                <div className="g2" style={{gap:6}}>
                  <button className="btn btn-red btn-full"   onClick={()=>doBan(true)}>🔨 Ban</button>
                  <button className="btn btn-green btn-full" onClick={()=>doBan(false)}>✅ Unban</button>
                </div>
                {banSt.msg && <div className={`st st-${banSt.type}`}>{banSt.msg}</div>}
              </div>

              {/* Set Plan */}
              <div className="card">
                <div className="card-title"><div className="card-title-left"><svg className="ct-icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Set Plan</div></div>
                <div className="fg"><label className="fl">Username</label><input className="fi" value={planU} onChange={e=>setPlanU(e.target.value)} placeholder="Username..."/></div>
                <div className="fg"><label className="fl">Plan</label>
                  <select className="fs" value={planChoice} onChange={e=>setPlanChoice(e.target.value)}>
                    <option value="free">Free</option><option value="pro">Pro</option><option value="owner">Owner</option>
                  </select></div>
                <div className="fg"><label className="fl">Custom Credits (optional)</label><input className="fi" type="number" value={planCR} onChange={e=>setPlanCR(e.target.value)} placeholder="Leave empty = default"/></div>
                <button className="btn btn-yellow btn-full" onClick={doSetPlan}>⭐ Set Plan</button>
                {planSt.msg && <div className={`st st-${planSt.type}`}>{planSt.msg}</div>}
              </div>
            </div>

            {/* User Table */}
            <div className="card">
              <div className="card-title">
                <div className="card-title-left"><svg className="ct-icon" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>All Users</div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <input className="fi" value={searchU} onChange={e=>{setSearchU(e.target.value);filterUsers(e.target.value);}} placeholder="Filter..." style={{width:140,padding:'4px 8px',fontSize:9}}/>
                  <button className="btn btn-dim btn-sm" onClick={loadUsers}>↻ Refresh</button>
                </div>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Username</th><th>Credits</th><th>Plan</th><th>Last Seen</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {allUsers.length===0 ? <tr><td colSpan={6} className="tbl-empty"><span className="spin">⟳</span> Click Refresh to load users...</td></tr>
                    : usersSlice.map(([u,d])=>(
                      <tr key={u}>
                        <td style={{color:'var(--cyan)',cursor:'pointer'}} onClick={()=>{setLookupInput(u);doLookup(u);}}> @{u}</td>
                        <td style={{color:'var(--yellow)'}}>{parseFloat(d?.credits||0).toFixed(1)} CR</td>
                        <td><span className={`badge b-${d?.plan||'free'}`}>{(d?.plan||'free').toUpperCase()}</span>{(d?.roles||[]).includes('admin')&&<span className="badge b-admin" style={{marginLeft:3}}>ADMIN</span>}</td>
                        <td style={{color:'var(--dim)'}}>{fmtRel(d?._updated)}</td>
                        <td>{d?.banned?<span className="badge b-banned">BANNED</span>:<span style={{color:'var(--green)',fontSize:9}}>Active</span>}</td>
                        <td><div style={{display:'flex',gap:4}}>
                          <button className="btn btn-dim btn-xs" onClick={()=>{setLookupInput(u);doLookup(u);}}>👤</button>
                          <button className="btn btn-dim btn-xs" onClick={()=>{setInboxTo(u);showTab('inbox');}}>✉</button>
                          {d?.banned ? <button className="btn btn-green btn-xs" onClick={()=>quickUnban(u)}>Unban</button> : <button className="btn btn-red btn-xs" onClick={()=>quickBanUser(u)}>Ban</button>}
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {usersTotalPages > 1 && (
                <div className="page-btns">
                  {Array.from({length:usersTotalPages},(_,i)=>i+1).filter(p=>Math.abs(p-userPage)<=3||p===1||p===usersTotalPages).map(p=>(
                    <button key={p} className={`pbtn${p===userPage?' active':''}`} onClick={()=>setUserPage(p)}>{p}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── REPORTS TAB ── */}
          <div className={`tab-panel${activeTab==='reports'?' active':''}`} id="tab-reports">
            <div className="card" style={{padding:'12px 16px'}}>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:8,color:'var(--dim)',letterSpacing:1}}>FILTER:</div>
                <select className="fs" value={rptTypeFilter} onChange={e=>setRptTypeFilter(e.target.value)} style={{width:'auto',padding:'4px 8px',fontSize:9}}>
                  <option value="">All Types</option><option value="payment">Payment</option><option value="bug">Bug Report</option>
                </select>
                <select className="fs" value={rptStatusFilter} onChange={e=>setRptStatusFilter(e.target.value)} style={{width:'auto',padding:'4px 8px',fontSize:9}}>
                  <option value="">All Status</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option>
                </select>
                <input className="fi" value={rptFromFilter} onChange={e=>setRptFromFilter(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadReports()} placeholder="Filter username..." style={{width:160,padding:'4px 8px',fontSize:9}}/>
                <button className="btn btn-cyan btn-sm" onClick={loadReports}>Search</button>
                <button className="btn btn-dim btn-sm" onClick={()=>{setRptTypeFilter('');setRptStatusFilter('');setRptFromFilter('');}}>Clear</button>
                <span style={{fontSize:9,color:'var(--dim)',marginLeft:'auto'}}>{allReports.length} reports</span>
              </div>
            </div>
            <div className="card">
              <div className="card-title">
                <div className="card-title-left"><svg className="ct-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Reports & Payments</div>
                <button className="btn btn-dim btn-sm" onClick={loadReports}>↻ Refresh</button>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Time</th><th>Type</th><th>From</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {allReports.length===0 ? <tr><td colSpan={6} className="tbl-empty">Click Search to load reports.</td></tr>
                    : reportsSlice.map(rpt=>(
                      <tr key={rpt.id}>
                        <td style={{color:'var(--dim)',fontSize:9}}>{fmtRel(rpt.time)}</td>
                        <td><span className={`badge b-${rpt.type==='payment'?'payment':'bug'}`}>{(rpt.type||'bug').toUpperCase()}</span></td>
                        <td style={{color:'var(--cyan)'}}>@{rpt.from||'?'}</td>
                        <td>{rpt.type==='payment'?<span style={{color:'var(--yellow)'}}>{rpt.paymentCR||'?'} CR</span>:'—'}</td>
                        <td><span className={`badge b-${rpt.status||'free'}`}>{(rpt.status||'none').toUpperCase()}</span></td>
                        <td><div style={{display:'flex',gap:4}}>
                          {rpt.type==='payment'&&rpt.status==='pending' && <button className="btn btn-green btn-xs" onClick={()=>{setCurrentReport(rpt);setRptModalOpen(true);setRptAdminNote('');setRptModalSt({msg:'',type:''});}}>Review</button>}
                          {rpt.type==='bug' && <button className="btn btn-red btn-xs" onClick={()=>deleteReport(rpt.id)}>Del</button>}
                          <button className="btn btn-dim btn-xs" onClick={()=>alert(`Report #${rpt.id}\nFrom: @${rpt.from}\nType: ${rpt.type}\nStatus: ${rpt.status}\n\n${(rpt.message||'').substring(0,400)}`)}>View</button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rptTotalPages > 1 && (
                <div className="page-btns">
                  {Array.from({length:rptTotalPages},(_,i)=>i+1).map(p=>(
                    <button key={p} className={`pbtn${p===rptPage?' active':''}`} onClick={()=>setRptPage(p)}>{p}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Report Modal */}
            {rptModalOpen && currentReport && (
              <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setRptModalOpen(false);}}>
                <div className="modal">
                  <div className="modal-title">Report Detail <button className="modal-close" onClick={()=>setRptModalOpen(false)}>✕</button></div>
                  <div style={{background:'var(--bg3)',borderRadius:8,padding:12,marginBottom:12,fontSize:10}}>
                    {[['From',`@${currentReport.from}`,'ur-cy'],['Package',currentReport.paymentPack||'—',''],['Credits',`${currentReport.paymentCR||'?'} CR`,'ur-yw'],['Method',(currentReport.paymentMethod||'—').toUpperCase(),''],['Total',currentReport.paymentTotal||'—','ur-ok'],['Time',fmtDate(currentReport.time),'']].map(([k,v,c])=>(
                      <div key={k} className="ur-row"><span className="ur-key">{k}</span><span className={`ur-val ${c}`}>{v}</span></div>
                    ))}
                    {currentReport.transactionId && <div className="ur-row"><span className="ur-key">TXN ID</span><span className="ur-val">{currentReport.transactionId}</span></div>}
                  </div>
                  {currentReport.message && <div style={{background:'var(--bg3)',borderLeft:'3px solid var(--cyan)',borderRadius:4,padding:10,marginBottom:12,fontSize:10,color:'var(--text)'}}><div style={{color:'var(--dim)',fontSize:8,marginBottom:4}}>USER NOTE</div>{currentReport.message}</div>}
                  <div className="fg"><label className="fl">Admin Note (optional)</label><input className="fi" value={rptAdminNote} onChange={e=>setRptAdminNote(e.target.value)} placeholder="Note for record..."/></div>
                  <div className="g2" style={{gap:6,marginTop:10}}>
                    <button className="btn btn-green btn-full" onClick={()=>processReport('confirm')}>✅ Confirm Payment</button>
                    <button className="btn btn-red btn-full"   onClick={()=>processReport('reject')}>❌ Reject</button>
                  </div>
                  {rptModalSt.msg && <div className={`st st-${rptModalSt.type}`}>{rptModalSt.msg}</div>}
                </div>
              </div>
            )}
          </div>

          {/* ── CODES TAB ── */}
          <div className={`tab-panel${activeTab==='codes'?' active':''}`} id="tab-codes">
            <div className="card">
              <div className="card-title"><div className="card-title-left"><svg className="ct-icon" viewBox="0 0 24 24"><polygon points="12 2 22 8.5 12 15 2 8.5 12 2"/><line x1="12" y1="15" x2="12" y2="22"/><polyline points="2 8.5 12 15 22 8.5"/></svg>Create Redeem Code</div></div>
              <div className="g3">
                <div className="fg"><label className="fl">Credits</label><input className="fi" type="number" value={codeCredits} onChange={e=>setCodeCredits(e.target.value)} placeholder="50" min="1"/></div>
                <div className="fg"><label className="fl">Max Uses</label><input className="fi" type="number" value={codeUses} onChange={e=>setCodeUses(e.target.value)} placeholder="10" min="1"/></div>
                <div className="fg"><label className="fl">Expires (days, blank=never)</label><input className="fi" type="number" value={codeExpiry} onChange={e=>setCodeExpiry(e.target.value)} placeholder="30 days..." min="1"/></div>
              </div>
              <button className="btn btn-cyan" onClick={createCode}><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Create Code</button>
              {codeSt.msg && <div className={`st st-${codeSt.type}`}>{codeSt.msg}</div>}
            </div>
            <div className="card">
              <div className="card-title"><div className="card-title-left">Active Codes</div><button className="btn btn-dim btn-sm" onClick={loadCodes}>↻ Refresh</button></div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Code</th><th>Credits</th><th>Used / Max</th><th>Expires</th><th>Created</th><th>Action</th></tr></thead>
                  <tbody>
                    {codes.length===0 ? <tr><td colSpan={6} className="tbl-empty">No codes. Create one above.</td></tr>
                    : codes.map(c=>{
                      const pct = c.maxUses > 0 ? Math.round(c.uses/c.maxUses*100) : 0;
                      const barColor = pct>=100?'var(--pink)':pct>70?'var(--yellow)':'var(--green)';
                      const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                      return (
                        <tr key={c.code}>
                          <td style={{color:'var(--cyan)',fontWeight:700}}>{c.code}</td>
                          <td style={{color:'var(--yellow)'}}>{c.credits} CR</td>
                          <td><div style={{fontSize:9}}>{c.uses} / {c.maxUses}</div><div style={{height:3,background:'var(--b2)',borderRadius:2,marginTop:3,width:60}}><div style={{height:3,background:barColor,borderRadius:2,width:Math.min(pct,100)+'%'}}/></div></td>
                          <td style={{color:'var(--dim)'}}>{fmtRel(c.createdAt)}</td>
                          <td style={{color:expired?'var(--pink)':'var(--dim)'}}>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('id-ID') : 'Never'}{expired&&<span style={{color:'var(--pink)'}}> (expired)</span>}</td>
                          <td><button className="btn btn-red btn-xs" onClick={()=>deleteCode(c.code)}>Delete</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── INBOX TAB ── */}
          <div className={`tab-panel${activeTab==='inbox'?' active':''}`} id="tab-inbox">
            <div className="card">
              <div className="card-title"><div className="card-title-left"><svg className="ct-icon" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>Send Message to User Inbox</div></div>
              <div className="g2">
                <div>
                  <div className="fg"><label className="fl">To (Roblox Username)</label><input className="fi" value={inboxTo} onChange={e=>setInboxTo(e.target.value)} placeholder="username..."/></div>
                  <div className="fg"><label className="fl">Subject</label><input className="fi" value={inboxSubj} onChange={e=>setInboxSubj(e.target.value)} placeholder="Subject line..."/></div>
                  <div className="fg"><label className="fl">Type</label>
                    <select className="fs" value={inboxType} onChange={e=>setInboxType(e.target.value)}>
                      <option value="general">General</option><option value="warning">⚠️ Warning</option><option value="reward">🎁 Reward</option><option value="system">⚙️ System</option><option value="payment">💳 Payment</option>
                    </select></div>
                </div>
                <div>
                  <div className="fg"><label className="fl">Message Content</label><textarea className="fta" value={inboxContent} onChange={e=>setInboxContent(e.target.value)} placeholder="Write your message..." style={{minHeight:120}}/></div>
                  <button className="btn btn-cyan btn-full" onClick={sendInbox}><svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Send Message</button>
                  {inboxSt.msg && <div className={`st st-${inboxSt.type}`}>{inboxSt.msg}</div>}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-title"><div className="card-title-left"><svg className="ct-icon" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>Broadcast (Send to Multiple)</div></div>
              <div className="fg"><label className="fl">Recipients (comma-separated or "all")</label><input className="fi" value={bcRecipients} onChange={e=>setBcRecipients(e.target.value)} placeholder="user1, user2 ... or 'all'"/></div>
              <div className="fg"><label className="fl">Subject</label><input className="fi" value={bcSubj} onChange={e=>setBcSubj(e.target.value)} placeholder="Broadcast subject..."/></div>
              <div className="fg"><label className="fl">Message</label><textarea className="fta" value={bcContent} onChange={e=>setBcContent(e.target.value)} placeholder="Broadcast message..."/></div>
              <button className="btn btn-yellow" onClick={sendBroadcast}><svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>Send Broadcast</button>
              {bcSt.msg && <div className={`st st-${bcSt.type}`}>{bcSt.msg}</div>}
            </div>
          </div>

          {/* ── LOGS TAB ── */}
          <div className={`tab-panel${activeTab==='logs'?' active':''}`} id="tab-logs">
            <div className="card">
              <div className="card-title">
                <div className="card-title-left"><svg className="ct-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Activity Log</div>
                <div style={{display:'flex',gap:6}}>
                  <select className="fs" value={logFilter} onChange={e=>setLogFilter(e.target.value)} style={{width:'auto',padding:'3px 8px',fontSize:8}}>
                    <option value="">All</option><option value="give-credits">Credits</option><option value="ban">Ban</option><option value="execute_json">AI Commands</option>
                  </select>
                  <button className="btn btn-dim btn-sm" onClick={loadLogs}>↻ Refresh</button>
                </div>
              </div>
              <div className="log-box" dangerouslySetInnerHTML={{__html: logLines.join('') || '<div class="log-dim">No logs yet.</div>'}}/>
            </div>
            <div className="card">
              <div className="card-title"><div className="card-title-left">Command History</div><button className="btn btn-dim btn-sm" onClick={loadHistory}>↻ Refresh</button></div>
              <div className="log-box" dangerouslySetInnerHTML={{__html: histLines.join('') || '<div class="log-dim">No history.</div>'}}/>
            </div>
          </div>

        </>
      )}
    </>
  );
}