"use client";

import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Session {
  user: { username: string };
}

interface Message {
  id: string;
  subject?: string;
  content?: string;
  from?: string;
  type?: "payment" | "announcement" | "reward" | "warning" | "general";
  ts?: number;
  read: boolean;
}

type MessageType = NonNullable<Message["type"]>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(ts?: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const BADGE_CLASSES: Record<MessageType, string> = {
  payment: "badge-payment",
  announcement: "badge-announcement",
  reward: "badge-reward",
  warning: "badge-warning",
  general: "badge-general",
};

function typeBadgeClass(type: string): string {
  return BADGE_CLASSES[type as MessageType] ?? "badge-general";
}

function formatDate(ts?: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Global Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500&display=swap');

  /* ── Tokens ── */
  :root {
    --bg:       #030312;
    --bg2:      #06071a;
    --bg3:      #0a0b22;
    --cyan:     #00e5ff;
    --purple:   #8800ff;
    --pink:     #ff2d6b;
    --green:    #00ffaa;
    --yellow:   #ffd600;
    --text:     #b8cfff;
    --dim:      #3a4a7a;
    --border:   rgba(0,229,255,.12);
    --radius:   8px;
    --nav-h:    52px;
  }

  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  /* ── Root ── */
  .inbox-root {
    min-height: 100vh;
    font-family: 'JetBrains Mono', monospace;
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
  }

  /* Grid background */
  .inbox-root::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      linear-gradient(rgba(0,229,255,.012) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,229,255,.012) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }

  /* ── Navigation ── */
  .inb-nav {
    position: sticky;
    top: 0;
    z-index: 100;
    height: var(--nav-h);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 20px;
    background: rgba(3,3,18,.96);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  .inb-nav-logo {
    font-family: 'Orbitron', sans-serif;
    font-size: 14px;
    font-weight: 900;
    background: linear-gradient(135deg, var(--cyan), var(--purple));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: .5px;
    white-space: nowrap;
  }

  .inb-nav-logo-img {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .inb-nav-back {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--dim);
    font-size: 10px;
    padding: 6px 12px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    text-decoration: none;
    transition: color .15s, border-color .15s;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .inb-nav-back:hover { color: var(--cyan); border-color: var(--cyan); }
  .inb-nav-back svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }

  /* ── Main Layout ── */
  .inb-main {
    max-width: 800px;
    margin: 0 auto;
    padding: 28px 20px 80px;
    position: relative;
    z-index: 1;
  }

  /* ── List Header ── */
  .inbox-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .inbox-title {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .inbox-title-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(0,229,255,.15), rgba(136,0,255,.15));
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .inbox-title-icon svg { width: 16px; height: 16px; stroke: var(--cyan); fill: none; stroke-width: 1.8; }

  .inbox-title-text {
    font-family: 'Orbitron', sans-serif;
    font-size: 16px;
    color: var(--cyan);
    letter-spacing: .5px;
    white-space: nowrap;
  }

  .inbox-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--cyan);
    color: #030312;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .inbox-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* ── Buttons ── */
  .btn-sm {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border-radius: 5px;
    font-size: 9px;
    cursor: pointer;
    border: 1px solid var(--border);
    background: rgba(0,229,255,.04);
    color: var(--text);
    transition: color .15s, border-color .15s, background .15s;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: .5px;
    text-transform: uppercase;
    white-space: nowrap;
    line-height: 1;
  }
  .btn-sm svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }
  .btn-sm:hover { border-color: var(--cyan); color: var(--cyan); background: rgba(0,229,255,.06); }
  .btn-sm:active { transform: scale(.97); }
  .btn-sm:disabled { opacity: .4; cursor: not-allowed; }

  .btn-sm.danger { color: var(--pink); border-color: rgba(255,45,107,.25); background: rgba(255,45,107,.04); }
  .btn-sm.danger:hover { border-color: var(--pink); background: rgba(255,45,107,.08); }

  /* ── Message List ── */
  .msg-list { display: flex; flex-direction: column; gap: 6px; }

  .msg-item {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    cursor: pointer;
    transition: border-color .15s, background .15s, transform .1s;
    position: relative;
    overflow: hidden;
    user-select: none;
  }
  .msg-item::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 3px;
    height: 100%;
    background: transparent;
    transition: background .15s;
  }
  .msg-item.unread::before { background: var(--cyan); }
  .msg-item:hover {
    border-color: rgba(0,229,255,.3);
    background: rgba(0,229,255,.03);
    transform: translateX(2px);
  }
  .msg-item:active { transform: translateX(1px) scale(.995); }
  .msg-item.unread .msg-subject { color: #fff; }

  .msg-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 7px;
    flex-wrap: wrap;
  }

  .msg-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--cyan), var(--purple));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .msg-avatar svg { width: 14px; height: 14px; stroke: #030312; fill: none; stroke-width: 2; }

  .msg-from {
    font-size: 9px;
    color: var(--cyan);
    font-family: 'Orbitron', sans-serif;
    letter-spacing: .5px;
    white-space: nowrap;
  }

  .msg-time {
    margin-left: auto;
    font-size: 9px;
    color: var(--dim);
    white-space: nowrap;
  }

  .msg-subject {
    font-size: 12px;
    color: var(--text);
    margin-bottom: 5px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 7px;
    line-height: 1.4;
  }

  .unread-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--cyan);
    flex-shrink: 0;
    box-shadow: 0 0 6px var(--cyan);
  }

  .msg-preview {
    font-size: 10px;
    color: var(--dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.5;
  }

  /* ── Type Badges ── */
  .msg-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    border-radius: 3px;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: .5px;
    text-transform: uppercase;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .badge-general      { background: rgba(0,229,255,.1);   color: var(--cyan);   }
  .badge-announcement { background: rgba(255,214,0,.1);   color: var(--yellow); }
  .badge-reward       { background: rgba(255,214,0,.1);   color: var(--yellow); }
  .badge-payment      { background: rgba(0,255,170,.1);   color: var(--green);  }
  .badge-warning      { background: rgba(255,45,107,.1);  color: var(--pink);   }

  /* ── Empty / Loading ── */
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--dim);
  }

  .empty-icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: rgba(0,229,255,.06);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
  }
  .empty-icon svg { width: 26px; height: 26px; stroke: var(--dim); fill: none; stroke-width: 1.5; }

  .empty-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 13px;
    color: var(--text);
    margin-bottom: 6px;
  }
  .empty-title.error { color: var(--pink); }

  .empty-sub {
    font-size: 10px;
    color: var(--dim);
    line-height: 1.7;
    max-width: 280px;
    margin: 0 auto;
  }

  /* ── Detail View ── */
  .detail-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 20px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--border);
  }

  .detail-back {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--dim);
    font-size: 10px;
    padding: 7px 12px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: color .15s, border-color .15s;
    white-space: nowrap;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: .5px;
  }
  .detail-back:hover { color: var(--cyan); border-color: var(--cyan); }
  .detail-back svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }

  .detail-meta { flex: 1; min-width: 0; }

  .detail-subject {
    font-family: 'Orbitron', sans-serif;
    font-size: 14px;
    color: #fff;
    margin-bottom: 8px;
    line-height: 1.45;
    word-break: break-word;
  }

  .detail-from-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }

  .detail-from { font-size: 10px; color: var(--dim); }

  .detail-time { font-size: 9px; color: var(--dim); margin-top: 4px; }

  .detail-body {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 22px;
    font-size: 12px;
    line-height: 1.9;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-word;
    min-height: 140px;
  }

  .detail-actions {
    margin-top: 16px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* ── Divider ── */
  .section-divider {
    height: 1px;
    background: var(--border);
    margin: 20px 0;
  }

  /* ── Spinner ── */
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border);
    border-top-color: var(--cyan);
    border-radius: 50%;
    animation: spin .7s linear infinite;
    margin: 0 auto 14px;
  }

  /* ── Animations ── */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0);   }
  }
  .fade-up { animation: fadeUp .22s ease; }

  /* ── Responsive: Tablet ── */
  @media (max-width: 768px) {
    .inb-main { padding: 20px 16px 80px; }
    .inbox-title-text { font-size: 14px; }
    .detail-subject { font-size: 13px; }
  }

  /* ── Responsive: Mobile ── */
  @media (max-width: 480px) {
    .inb-nav { padding: 0 14px; gap: 8px; }
    .inb-nav-logo { font-size: 12px; }
    .inb-nav-back { font-size: 9px; padding: 5px 10px; }

    .inb-main { padding: 16px 12px 80px; }

    .inbox-header { gap: 10px; }
    .inbox-title-text { font-size: 13px; }
    .inbox-actions { width: 100%; }
    .inbox-actions .btn-sm { flex: 1; justify-content: center; }

    .msg-item { padding: 12px 13px; }
    .msg-header { gap: 6px; }
    .msg-preview { font-size: 9px; }

    .detail-header { flex-direction: column; gap: 12px; }
    .detail-back { align-self: flex-start; }
    .detail-subject { font-size: 12px; }
    .detail-body { padding: 16px; font-size: 11px; }
    .detail-actions .btn-sm { flex: 1; justify-content: center; }
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

const IconInbox = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const IconUser = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#030312" strokeWidth="2">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

const IconChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

const IconAlert = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  isError?: boolean;
}

function EmptyState({ icon, title, subtitle, isError = false }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className={`empty-title${isError ? " error" : ""}`}>{title}</div>
      {subtitle && <p className="empty-sub">{subtitle}</p>}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="empty-state">
      <div className="spinner" role="status" aria-label="Loading messages" />
      <div className="empty-title">Loading messages…</div>
      <p className="empty-sub">Fetching your inbox from the server.</p>
    </div>
  );
}

interface MessageItemProps {
  msg: Message;
  onClick: () => void;
}

function MessageItem({ msg, onClick }: MessageItemProps) {
  const type = msg.type ?? "general";

  return (
    <div
      className={`msg-item fade-up${msg.read ? "" : " unread"}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${msg.read ? "" : "Unread: "}${msg.subject ?? "Message"}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="msg-header">
        <div className="msg-avatar" aria-hidden="true">
          <IconUser />
        </div>
        <span className="msg-from">{msg.from ?? "NEXUS AI"}</span>
        <span className={`msg-type-badge ${typeBadgeClass(type)}`}>
          {type.toUpperCase()}
        </span>
        <span className="msg-time">{timeAgo(msg.ts)}</span>
      </div>

      <div className="msg-subject">
        {!msg.read && <span className="unread-dot" aria-hidden="true" />}
        {msg.subject ?? "Message"}
      </div>

      <div className="msg-preview">
        {(msg.content ?? "").substring(0, 120)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Inbox() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentMsg, setCurrentMsg] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Auth Check ──────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem("nexus_session");
      if (!raw) {
        window.location.replace("/login");
        return;
      }
      const parsed = JSON.parse(raw) as Session;
      if (!parsed?.user?.username) {
        window.location.replace("/login");
        return;
      }
      setSession(parsed);
    } catch {
      window.location.replace("/login");
    }
  }, []);

  // ── Fetch Messages ──────────────────────────────────────────────────────
  const loadMessages = useCallback(
    async (isRefresh = false) => {
      if (!session) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);

      try {
        const username = session.user.username.toLowerCase();
        const res = await fetch(`/api/inbox?user=${encodeURIComponent(username)}`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = (await res.json()) as { messages?: Message[] };
        setMessages(data.messages ?? []);
      } catch (err: unknown) {
        setLoadError(
          err instanceof Error ? err.message : "An unknown error occurred."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session]
  );

  useEffect(() => {
    if (session) void loadMessages();
  }, [session, loadMessages]);

  // ── Computed ────────────────────────────────────────────────────────────
  const unreadCount = messages.filter((m) => !m.read).length;

  // ── Actions ─────────────────────────────────────────────────────────────
  const openMessage = async (msg: Message) => {
    setCurrentMsg({ ...msg });

    if (!msg.read) {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m))
      );
      try {
        const username = session?.user.username.toLowerCase() ?? "";
        await fetch("/api/inbox", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: username, id: msg.id }),
        });
      } catch {
        // Silently fail — optimistic update already applied
      }
    }
  };

  const showList = () => setCurrentMsg(null);

  const markAllRead = async () => {
    try {
      const username = session?.user.username.toLowerCase() ?? "";
      await fetch("/api/inbox", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: username, action: "read_all" }),
      });
    } catch {
      // Silently fail — optimistic update applied below
    }
    setMessages((prev) => prev.map((m) => ({ ...m, read: true })));
  };

  const deleteCurrentMessage = async () => {
    if (!currentMsg) return;
    if (!window.confirm("Are you sure you want to delete this message?")) return;

    setDeleting(true);
    try {
      const username = session?.user.username.toLowerCase() ?? "";
      const res = await fetch("/api/inbox", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: username,
          id: currentMsg.id,
          action: "delete",
        }),
      });

      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== currentMsg.id));
        showList();
      } else {
        alert("Failed to delete this message. Please try again.");
      }
    } catch (err: unknown) {
      alert(
        "Error: " + (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setDeleting(false);
    }
  };

  const msgType = currentMsg?.type ?? "general";

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      <style>{styles}</style>

      <div className="inbox-root">
        {/* ── Navigation ── */}
        <nav className="inb-nav" aria-label="Site navigation">
          <img
            src="/images/nexusai.png"
            className="inb-nav-logo-img"
            alt="NEXUS AI logo"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="inb-nav-logo">NEXUS AI</span>
          <a className="inb-nav-back" href="/" aria-label="Back to Chat">
            <IconChevronLeft />
            Back to Chat
          </a>
        </nav>

        {/* ── Page Body ── */}
        <main className="inb-main">

          {/* ════════ LIST VIEW ════════ */}
          {!currentMsg && (
            <div>
              {/* Header */}
              <div className="inbox-header">
                <div className="inbox-title">
                  <div className="inbox-title-icon" aria-hidden="true">
                    <IconInbox />
                  </div>
                  <span className="inbox-title-text">Inbox</span>
                  {unreadCount > 0 && (
                    <span
                      className="inbox-badge"
                      aria-label={`${unreadCount} unread messages`}
                    >
                      {unreadCount}
                    </span>
                  )}
                </div>

                <div className="inbox-actions">
                  <button
                    className="btn-sm"
                    onClick={markAllRead}
                    disabled={unreadCount === 0 || loading}
                    title="Mark all messages as read"
                  >
                    <IconCheck />
                    Mark all read
                  </button>
                  <button
                    className="btn-sm"
                    onClick={() => void loadMessages(true)}
                    disabled={refreshing || loading}
                    title="Refresh inbox"
                  >
                    <IconRefresh />
                    {refreshing ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </div>

              {/* Message list */}
              <div className="msg-list" role="list" aria-label="Messages">
                {loading ? (
                  <LoadingState />
                ) : loadError ? (
                  <EmptyState
                    icon={<IconAlert />}
                    title="Failed to load"
                    subtitle={loadError}
                    isError
                  />
                ) : messages.length === 0 ? (
                  <EmptyState
                    icon={<IconInbox />}
                    title="No messages yet"
                    subtitle="NEXUS AI will send notifications and announcements here."
                  />
                ) : (
                  messages.map((msg) => (
                    <MessageItem
                      key={msg.id}
                      msg={msg}
                      onClick={() => void openMessage(msg)}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* ════════ DETAIL VIEW ════════ */}
          {currentMsg && (
            <div className="fade-up" role="article" aria-label="Message detail">
              <div className="detail-header">
                <button
                  className="detail-back"
                  onClick={showList}
                  aria-label="Back to inbox"
                >
                  <IconChevronLeft />
                  Back
                </button>

                <div className="detail-meta">
                  <div className="detail-subject">
                    {currentMsg.subject ?? "Message"}
                  </div>
                  <div className="detail-from-row">
                    <span className="detail-from">
                      From: {currentMsg.from ?? "NEXUS AI"}
                    </span>
                    <span
                      className={`msg-type-badge ${typeBadgeClass(msgType)}`}
                    >
                      {msgType.toUpperCase()}
                    </span>
                  </div>
                  <div className="detail-time">{formatDate(currentMsg.ts)}</div>
                </div>
              </div>

              <div className="detail-body" role="region" aria-label="Message body">
                {currentMsg.content ?? ""}
              </div>

              <div className="detail-actions">
                <button
                  className="btn-sm danger"
                  onClick={() => void deleteCurrentMessage()}
                  disabled={deleting}
                  title="Delete this message"
                >
                  <IconTrash />
                  {deleting ? "Deleting…" : "Delete Message"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}