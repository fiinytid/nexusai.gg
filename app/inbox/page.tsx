'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/* ══════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════ */
interface Session {
  user: {
    username: string;
    robloxId?: string;
    avatar?: string;
  };
  loginTime?: number;
}

interface Message {
  id: string;
  subject?: string;
  content?: string;
  from?: string;
  type?: string;
  ts?: number;
  read?: boolean;
}

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */
function timeAgo(ts?: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000)    return 'just now';
  if (diff < 3600000)  return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function typeBadgeClass(type: string): string {
  const map: Record<string, string> = {
    payment: 'badge-payment',
    announcement: 'badge-announcement',
    reward: 'badge-reward',
    warning: 'badge-warning',
  };
  return map[type] || 'badge-general';
}

/* ══════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════ */
export default function InboxPage() {
  const [session, setSession]         = useState<Session | null>(null);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [loadError, setLoadError]     = useState('');
  const [activeMsg, setActiveMsg]     = useState<Message | null>(null);

  const sessionRef = useRef<Session | null>(null);

  /* ── init ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem('nexus_session');
      if (!raw) { window.location.replace('/login'); return; }
      const s: Session = JSON.parse(raw);
      if (!s?.user?.username) { window.location.replace('/login'); return; }
      sessionRef.current = s;
      setSession(s);
    } catch {
      window.location.replace('/login');
      return;
    }
    loadMessages();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── load messages ── */
  const loadMessages = useCallback(async () => {
    const sess = sessionRef.current;
    if (!sess) return;
    setLoadingMsgs(true);
    setLoadError('');
    try {
      const username = (sess.user.username || '').toLowerCase();
      const r = await fetch('/api/inbox?user=' + encodeURIComponent(username));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      setMessages(data.messages || []);
    } catch (e: unknown) {
      setLoadError((e as Error).message || 'Unknown error');
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  /* ── open message ── */
  async function openMessage(msg: Message) {
    setActiveMsg(msg);
    if (!msg.read) {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m));
      const sess = sessionRef.current;
      if (sess) {
        try {
          await fetch('/api/inbox', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: (sess.user.username || '').toLowerCase(), id: msg.id })
          });
        } catch { /* noop */ }
      }
    }
  }

  /* ── delete message ── */
  async function deleteCurrentMessage() {
    if (!activeMsg) return;
    if (!confirm('Delete this message?')) return;
    const sess = sessionRef.current;
    if (!sess) return;
    try {
      const r = await fetch('/api/inbox', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: (sess.user.username || '').toLowerCase(), id: activeMsg.id, action: 'delete' })
      });
      if (r.ok) {
        setMessages(prev => prev.filter(m => m.id !== activeMsg.id));
        setActiveMsg(null);
        await loadMessages();
      } else {
        alert('Failed to delete message.');
      }
    } catch (e: unknown) {
      alert('Error: ' + (e as Error).message);
    }
  }

  /* ── mark all read ── */
  async function markAllRead() {
    const sess = sessionRef.current;
    if (!sess) return;
    try {
      await fetch('/api/inbox', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: (sess.user.username || '').toLowerCase(), action: 'read_all' })
      });
    } catch { /* noop */ }
    setMessages(prev => prev.map(m => ({ ...m, read: true })));
    await loadMessages();
  }

  const unreadCount = messages.filter(m => !m.read).length;

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500&display=swap');
        :root{
          --bg:#030312;--bg2:#06071a;--bg3:#0a0b22;
          --cyan:#00e5ff;--purple:#8800ff;--pink:#ff2d6b;
          --green:#00ffaa;--yellow:#ffd600;
          --text:#b8cfff;--dim:#3a4a7a;--dim2:#5a6a9a;
          --border:rgba(0,229,255,.12);--r:8px;
        }
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
        html,body{min-height:100%;font-family:'JetBrains Mono',monospace;background:var(--bg);color:var(--text);font-size:13px;}
        body::before{content:'';position:fixed;inset:0;
          background:linear-gradient(rgba(0,229,255,.012) 1px,transparent 1px),
            linear-gradient(90deg,rgba(0,229,255,.012) 1px,transparent 1px);
          background-size:40px 40px;pointer-events:none;z-index:0;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        @keyframes slideX{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}
        @keyframes pulse-dot{0%,100%{opacity:1}50%{opacity:.3}}
        /* NAV */
        .nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:10px;padding:10px 20px;background:rgba(3,3,18,.95);border-bottom:1px solid var(--border);backdrop-filter:blur(12px);}
        .nav-logo{font-family:'Orbitron',sans-serif;font-size:14px;font-weight:900;background:linear-gradient(135deg,var(--cyan),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:.5px;}
        .nav-back{margin-left:auto;display:flex;align-items:center;gap:5px;background:none;border:1px solid var(--border);border-radius:5px;color:var(--dim);font-size:10px;padding:4px 10px;cursor:pointer;font-family:'JetBrains Mono',monospace;text-decoration:none;transition:color .15s,border-color .15s;}
        .nav-back:hover{color:var(--cyan);border-color:var(--cyan);}
        .nav-back svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;}
        /* LAYOUT */
        .main{max-width:800px;margin:0 auto;padding:28px 16px 60px;position:relative;z-index:1;}
        /* INBOX HEADER */
        .inbox-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;}
        .inbox-title{display:flex;align-items:center;gap:10px;}
        .inbox-title-icon{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,rgba(0,229,255,.15),rgba(136,0,255,.15));border:1px solid var(--border);display:flex;align-items:center;justify-content:center;}
        .inbox-title-icon svg{width:16px;height:16px;stroke:var(--cyan);fill:none;stroke-width:1.8;}
        .inbox-title-text{font-family:'Orbitron',sans-serif;font-size:16px;color:var(--cyan);letter-spacing:.5px;}
        .inbox-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--cyan);color:#030312;font-size:9px;font-weight:700;}
        .inbox-actions{display:flex;gap:8px;}
        .btn-sm{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:5px;font-size:9px;cursor:pointer;border:1px solid var(--border);background:rgba(0,229,255,.04);color:var(--text);transition:.15s;font-family:'JetBrains Mono',monospace;letter-spacing:.5px;}
        .btn-sm svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;}
        .btn-sm:hover{border-color:var(--cyan);color:var(--cyan);}
        .btn-sm.danger{color:var(--pink);}
        .btn-sm.danger:hover{border-color:var(--pink);}
        /* MESSAGE LIST */
        .msg-list{display:flex;flex-direction:column;gap:6px;}
        .msg-item{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px;cursor:pointer;transition:border-color .15s,background .15s,transform .1s;position:relative;overflow:hidden;animation:fadeIn .25s ease both;}
        .msg-item::before{content:'';position:absolute;top:0;left:0;width:3px;height:100%;background:transparent;transition:background .15s;}
        .msg-item.unread::before{background:var(--cyan);}
        .msg-item:hover{border-color:rgba(0,229,255,.3);background:rgba(0,229,255,.03);transform:translateX(2px);}
        .msg-item.unread .msg-subject{color:#fff;}
        .msg-header{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
        .msg-avatar{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--cyan),var(--purple));display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .msg-avatar svg{width:14px;height:14px;stroke:#030312;fill:none;stroke-width:2;}
        .msg-from{font-size:9px;color:var(--cyan);font-family:'Orbitron',sans-serif;letter-spacing:.5px;}
        .msg-type-badge{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:3px;font-size:8px;font-weight:700;letter-spacing:.5px;}
        .badge-general{background:rgba(0,229,255,.1);color:var(--cyan);}
        .badge-announcement,.badge-reward{background:rgba(255,214,0,.1);color:var(--yellow);}
        .badge-payment{background:rgba(0,255,170,.1);color:var(--green);}
        .badge-warning{background:rgba(255,45,107,.1);color:var(--pink);}
        .msg-time{margin-left:auto;font-size:9px;color:var(--dim);white-space:nowrap;}
        .msg-subject{font-size:12px;color:var(--text);margin-bottom:5px;font-weight:600;display:flex;align-items:center;gap:7px;}
        .unread-dot{width:6px;height:6px;border-radius:50%;background:var(--cyan);flex-shrink:0;box-shadow:0 0 6px var(--cyan);}
        .msg-preview{font-size:10px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.5;}
        /* EMPTY / LOADING */
        .empty-state{text-align:center;padding:60px 20px;color:var(--dim);}
        .empty-icon{width:56px;height:56px;border-radius:14px;background:rgba(0,229,255,.06);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;}
        .empty-icon svg{width:26px;height:26px;stroke:var(--dim);fill:none;stroke-width:1.5;}
        .empty-title{font-family:'Orbitron',sans-serif;font-size:13px;color:var(--text);margin-bottom:6px;}
        .empty-sub{font-size:10px;color:var(--dim);line-height:1.6;}
        /* DETAIL VIEW */
        .detail-view{animation:slideX .2s ease;}
        .detail-header{display:flex;align-items:flex-start;gap:14px;margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid var(--border);}
        .detail-back{display:inline-flex;align-items:center;gap:5px;background:none;border:1px solid var(--border);border-radius:5px;color:var(--dim);font-size:10px;padding:6px 12px;cursor:pointer;font-family:'JetBrains Mono',monospace;transition:.15s;white-space:nowrap;flex-shrink:0;}
        .detail-back:hover{color:var(--cyan);border-color:var(--cyan);}
        .detail-back svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;}
        .detail-meta{flex:1;}
        .detail-subject{font-family:'Orbitron',sans-serif;font-size:14px;color:#fff;margin-bottom:6px;line-height:1.4;}
        .detail-from-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
        .detail-from{font-size:10px;color:var(--dim);}
        .detail-time{font-size:9px;color:var(--dim);margin-top:3px;}
        .detail-body{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:22px;font-size:12px;line-height:1.85;color:var(--text);white-space:pre-wrap;word-break:break-word;min-height:120px;}
        .detail-actions{margin-top:16px;display:flex;gap:8px;}
        @media(max-width:600px){.main{padding:16px 10px 60px;}.inbox-title-text{font-size:13px;}}
      `}</style>

      {/* NAV */}
      <nav className="nav">
        <img src="/nexusai.png" style={{ width: 22, height: 22, borderRadius: 5 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} alt="" />
        <span className="nav-logo">NEXUS AI</span>
        <a className="nav-back" href="/">
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Chat
        </a>
      </nav>

      <div className="main">
        {/* DETAIL VIEW */}
        {activeMsg ? (
          <div className="detail-view">
            <div className="detail-header">
              <button className="detail-back" onClick={() => setActiveMsg(null)}>
                <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
              <div className="detail-meta">
                <div className="detail-subject">{activeMsg.subject || 'Message'}</div>
                <div className="detail-from-row">
                  <span className="detail-from">From: {activeMsg.from || 'NEXUS AI'}</span>
                  <span className={`msg-type-badge ${typeBadgeClass(activeMsg.type || 'general')}`}>
                    {(activeMsg.type || 'general').toUpperCase()}
                  </span>
                </div>
                <div className="detail-time">
                  {activeMsg.ts
                    ? new Date(activeMsg.ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
                    : ''}
                </div>
              </div>
            </div>
            <div className="detail-body">{activeMsg.content || ''}</div>
            <div className="detail-actions">
              <button className="btn-sm danger" onClick={deleteCurrentMessage}>
                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                Delete Message
              </button>
            </div>
          </div>
        ) : (
          /* LIST VIEW */
          <>
            <div className="inbox-header">
              <div className="inbox-title">
                <div className="inbox-title-icon">
                  <svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </div>
                <span className="inbox-title-text">Inbox</span>
                {unreadCount > 0 && <span className="inbox-badge">{unreadCount}</span>}
              </div>
              <div className="inbox-actions">
                <button className="btn-sm" onClick={markAllRead}>
                  <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  Mark all read
                </button>
                <button className="btn-sm" onClick={loadMessages}>
                  <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                  Refresh
                </button>
              </div>
            </div>

            <div className="msg-list">
              {loadingMsgs ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round"/></svg>
                  </div>
                  <div className="empty-title">Loading messages...</div>
                </div>
              ) : loadError ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" style={{ stroke: 'var(--pink)' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </div>
                  <div className="empty-title" style={{ color: 'var(--pink)' }}>Failed to load</div>
                  <div className="empty-sub">{loadError}</div>
                </div>
              ) : messages.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  </div>
                  <div className="empty-title">No messages yet</div>
                  <div className="empty-sub">NEXUS AI will send notifications and announcements here.</div>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const type = msg.type || 'general';
                  return (
                    <div
                      key={msg.id}
                      className={`msg-item${msg.read ? '' : ' unread'}`}
                      style={{ animationDelay: i * 0.04 + 's' }}
                      onClick={() => openMessage(msg)}
                    >
                      <div className="msg-header">
                        <div className="msg-avatar">
                          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                        </div>
                        <span className="msg-from">{msg.from || 'NEXUS AI'}</span>
                        <span className={`msg-type-badge ${typeBadgeClass(type)}`}>{type.toUpperCase()}</span>
                        <span className="msg-time">{timeAgo(msg.ts)}</span>
                      </div>
                      <div className="msg-subject">
                        {!msg.read && <span className="unread-dot"/>}
                        {msg.subject || 'Message'}
                      </div>
                      <div className="msg-preview">
                        {(msg.content || '').substring(0, 100)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}