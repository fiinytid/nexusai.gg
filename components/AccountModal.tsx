"use client";

import { useState, useEffect, useRef } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import type { OAuthStrategy } from "@clerk/types";

/* ─────────────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────────────── */
type Tab = "profile" | "security";

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Icons (inline SVG — no extra deps)
───────────────────────────────────────────────────────────────────────────── */
const IconProfile = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.25C17.25 23.15 21 18.25 21 13V7l-9-5z" />
  </svg>
);

const IconClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconDiscord = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
  </svg>
);

const IconRoblox = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4.063 1.073L1.008 18.96 18.994 22.93l3.056-17.89L4.063 1.073zm11.07 13.51l-5.803-1.244 1.245-5.803 5.802 1.244-1.244 5.803z" />
  </svg>
);

const IconDots = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

/* ─────────────────────────────────────────────────────────────────────────────
   Connected Account Row
───────────────────────────────────────────────────────────────────────────── */
interface ConnectedAccountRowProps {
  icon: React.ReactNode;
  provider: string;
  username: string | null;
  accentColor: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

function ConnectedAccountRow({
  icon,
  provider,
  username,
  accentColor,
  onConnect,
  onDisconnect,
}: ConnectedAccountRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="nxa-conn-row">
      <div className="nxa-conn-left">
        <span className="nxa-conn-icon" style={{ color: accentColor }}>
          {icon}
        </span>
        <div className="nxa-conn-info">
          <span className="nxa-conn-provider">{provider}</span>
          {username ? (
            <span className="nxa-conn-username">
              <span className="nxa-conn-dot" />
              {username}
            </span>
          ) : (
            <span className="nxa-conn-disconnected">Not connected</span>
          )}
        </div>
      </div>

      <div className="nxa-conn-right" ref={menuRef}>
        {username && (
          <span className="nxa-conn-badge">
            <IconCheck /> Connected
          </span>
        )}
        <button
          className="nxa-icon-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Account options"
        >
          <IconDots />
        </button>

        {menuOpen && (
          <div className="nxa-dropdown">
            {username ? (
              <button
                className="nxa-dropdown-item nxa-dropdown-danger"
                onClick={() => { setMenuOpen(false); onDisconnect(); }}
              >
                Disconnect {provider}
              </button>
            ) : (
              <button
                className="nxa-dropdown-item"
                onClick={() => { setMenuOpen(false); onConnect(); }}
              >
                Connect {provider}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Profile Tab
───────────────────────────────────────────────────────────────────────────── */
function ProfileTab() {
  const { user } = useUser();
  const [editingName, setEditingName] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName]   = useState(user?.lastName  ?? "");
  const [saving, setSaving]       = useState(false);
  const [saved,  setSaved]        = useState(false);

  /* find connected Discord / Roblox accounts */
  const discordAccount = user?.externalAccounts?.find(
  (a) => (a.provider as string) === "oauth_discord"
);
  const robloxAccount = user?.externalAccounts?.find(
  (a) =>
    (a.provider as string) === "oauth_custom_roblox" ||
    (a.provider as string) === "oauth_roblox"
);

  async function handleSaveName() {
    if (!user) return;
    setSaving(true);
    try {
      await user.update({ firstName, lastName });
      setSaved(true);
      setEditingName(false);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function connectOAuth(strategy: OAuthStrategy) {
    if (!user) return;
    try {
      await user.createExternalAccount({
        strategy,
        redirectUrl: window.location.href,
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function disconnectOAuth(id: string) {
    if (!user) return;
    try {
      const account = user.externalAccounts.find((a) => a.id === id);
      await account?.destroy();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="nxa-tab-content">
      {/* ── Profile section ── */}
      <section className="nxa-section">
        <div className="nxa-section-header">
          <h3 className="nxa-section-title">Profile</h3>
        </div>

        <div className="nxa-profile-row">
          {/* Avatar */}
          <div className="nxa-avatar-wrap">
            {user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt={user.fullName ?? "Avatar"}
                className="nxa-avatar"
              />
            ) : (
              <div className="nxa-avatar nxa-avatar-fallback">
                {(user?.firstName?.[0] ?? user?.username?.[0] ?? "N").toUpperCase()}
              </div>
            )}
            <div className="nxa-avatar-ring" />
          </div>

          {/* Name */}
          <div className="nxa-profile-meta">
            {editingName ? (
              <div className="nxa-name-edit">
                <input
                  className="nxa-input"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoFocus
                />
                <input
                  className="nxa-input"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
                <div className="nxa-name-edit-actions">
                  <button
                    className="nxa-btn nxa-btn-primary"
                    onClick={handleSaveName}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    className="nxa-btn nxa-btn-ghost"
                    onClick={() => setEditingName(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="nxa-name-display">
                <span className="nxa-display-name">
                  {user?.fullName || user?.username || "—"}
                </span>
                {saved && (
                  <span className="nxa-saved-badge">
                    <IconCheck /> Saved
                  </span>
                )}
                <span className="nxa-username-handle">
                  @{user?.username ?? "—"}
                </span>
              </div>
            )}
          </div>

          {!editingName && (
            <button
              className="nxa-btn nxa-btn-ghost nxa-update-btn"
              onClick={() => setEditingName(true)}
            >
              <IconEdit /> Update profile
            </button>
          )}
        </div>
      </section>

      <div className="nxa-divider" />

      {/* ── Email addresses ── */}
      <section className="nxa-section">
        <div className="nxa-section-header">
          <h3 className="nxa-section-title">Email addresses</h3>
        </div>
        <div className="nxa-email-list">
          {user?.emailAddresses?.map((email) => (
            <div key={email.id} className="nxa-email-row">
              <span className="nxa-email-address">{email.emailAddress}</span>
              {email.id === user.primaryEmailAddressId && (
                <span className="nxa-primary-badge">Primary</span>
              )}
              {email.verification?.status === "verified" && (
                <span className="nxa-verified-badge">
                  <IconCheck /> Verified
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="nxa-divider" />

      {/* ── Connected accounts ── */}
      <section className="nxa-section">
        <div className="nxa-section-header">
          <h3 className="nxa-section-title">Connected accounts</h3>
          <p className="nxa-section-desc">
            Link your Discord and Roblox accounts for faster sign-in and in-app features.
          </p>
        </div>

        <ConnectedAccountRow
          icon={<IconDiscord />}
          provider="Discord"
          username={discordAccount?.username ?? null}
          accentColor="#5865F2"
          onConnect={() => connectOAuth("oauth_discord")}
          onDisconnect={() => disconnectOAuth(discordAccount?.id ?? "")}
        />
        <ConnectedAccountRow
          icon={<IconRoblox />}
          provider="Roblox"
          username={robloxAccount?.username ?? null}
          accentColor="#e74c3c"
          onConnect={() => connectOAuth("oauth_custom_roblox" as OAuthStrategy)}
          onDisconnect={() => disconnectOAuth(robloxAccount?.id ?? "")}
        />
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Security Tab
───────────────────────────────────────────────────────────────────────────── */
function SecurityTab() {
  const { user } = useClerk();
  const [changingPw, setChangingPw] = useState(false);
  const [currentPw, setCurrentPw]   = useState("");
  const [newPw,     setNewPw]       = useState("");
  const [confirmPw, setConfirmPw]   = useState("");
  const [pwError,   setPwError]     = useState("");
  const [pwSaved,   setPwSaved]     = useState(false);
  const [saving,    setSaving]      = useState(false);

  async function handleChangePassword() {
    setPwError("");
    if (newPw !== confirmPw) { setPwError("New passwords do not match."); return; }
    if (newPw.length < 8)    { setPwError("Password must be at least 8 characters."); return; }
    setSaving(true);
    try {
      await (user as any)?.updatePassword({ currentPassword: currentPw, newPassword: newPw });
      setPwSaved(true);
      setChangingPw(false);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err: any) {
      setPwError(err?.errors?.[0]?.message ?? "Failed to update password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="nxa-tab-content">
      {/* ── Password ── */}
      <section className="nxa-section">
        <div className="nxa-section-header">
          <h3 className="nxa-section-title">Password</h3>
          <p className="nxa-section-desc">
            Use a strong password you don't reuse on other sites.
          </p>
        </div>

        {changingPw ? (
          <div className="nxa-form-group">
            <label className="nxa-label">Current password</label>
            <input
              type="password"
              className="nxa-input"
              placeholder="••••••••"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              autoFocus
            />
            <label className="nxa-label">New password</label>
            <input
              type="password"
              className="nxa-input"
              placeholder="Min. 8 characters"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
            <label className="nxa-label">Confirm new password</label>
            <input
              type="password"
              className="nxa-input"
              placeholder="••••••••"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
            {pwError && <p className="nxa-error">{pwError}</p>}
            {pwSaved && <p className="nxa-success"><IconCheck /> Password updated successfully.</p>}
            <div className="nxa-form-actions">
              <button
                className="nxa-btn nxa-btn-primary"
                onClick={handleChangePassword}
                disabled={saving}
              >
                {saving ? "Saving…" : "Change password"}
              </button>
              <button
                className="nxa-btn nxa-btn-ghost"
                onClick={() => { setChangingPw(false); setPwError(""); }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="nxa-security-row">
            <div>
              <p className="nxa-security-label">Password</p>
              <p className="nxa-security-value">••••••••••••</p>
            </div>
            <button
              className="nxa-btn nxa-btn-ghost"
              onClick={() => setChangingPw(true)}
            >
              Change password
            </button>
          </div>
        )}
      </section>

      <div className="nxa-divider" />

      {/* ── Active sessions ── */}
      <section className="nxa-section">
        <div className="nxa-section-header">
          <h3 className="nxa-section-title">Active sessions</h3>
          <p className="nxa-section-desc">
            Devices currently signed in to your NEXUS AI account.
          </p>
        </div>
        <div className="nxa-session-row">
          <div className="nxa-session-dot" />
          <div>
            <p className="nxa-session-name">Current session</p>
            <p className="nxa-session-meta">Web · {typeof window !== "undefined" ? window.location.hostname : "nexusai.gg"}</p>
          </div>
          <span className="nxa-session-badge">Active now</span>
        </div>
      </section>

      <div className="nxa-divider" />

      {/* ── Danger zone ── */}
      <section className="nxa-section">
        <div className="nxa-section-header">
          <h3 className="nxa-section-title nxa-danger-title">Danger zone</h3>
          <p className="nxa-section-desc">
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
        </div>
        <button className="nxa-btn nxa-btn-danger">Delete account</button>
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main Modal Component
───────────────────────────────────────────────────────────────────────────── */
export function AccountModal({ open, onClose }: AccountModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const overlayRef = useRef<HTMLDivElement>(null);

  /* Close on Escape */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Lock body scroll */
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="nxa-overlay"
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
        aria-modal="true"
        role="dialog"
        aria-label="Account settings"
      >
        {/* Dialog */}
        <div className="nxa-dialog">
          {/* ── Sidebar ── */}
          <aside className="nxa-sidebar">
            <div className="nxa-sidebar-header">
              <p className="nxa-sidebar-title">Account</p>
              <p className="nxa-sidebar-subtitle">Manage your account info.</p>
            </div>
            <nav className="nxa-nav">
              <button
                className={`nxa-nav-item ${activeTab === "profile" ? "nxa-nav-active" : ""}`}
                onClick={() => setActiveTab("profile")}
              >
                <IconProfile /> Profile
              </button>
              <button
                className={`nxa-nav-item ${activeTab === "security" ? "nxa-nav-active" : ""}`}
                onClick={() => setActiveTab("security")}
              >
                <IconShield /> Security
              </button>
            </nav>
            <div className="nxa-sidebar-footer">
              <span className="nxa-clerk-badge">Secured by Clerk</span>
            </div>
          </aside>

          {/* ── Main content ── */}
          <main className="nxa-main">
            <div className="nxa-main-header">
              <h2 className="nxa-main-title">
                {activeTab === "profile" ? "Profile details" : "Security settings"}
              </h2>
              <button className="nxa-close-btn" onClick={onClose} aria-label="Close">
                <IconClose />
              </button>
            </div>

            <div className="nxa-main-body">
              {activeTab === "profile" ? <ProfileTab /> : <SecurityTab />}
            </div>
          </main>
        </div>
      </div>

      {/* ── Scoped styles ── */}
      <style>{`
        /* === Overlay === */
        .nxa-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          animation: nxa-fade-in 0.15s ease;
        }
        @keyframes nxa-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* === Dialog === */
        .nxa-dialog {
          display: flex;
          width: 100%;
          max-width: 780px;
          max-height: 90vh;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid rgba(0, 229, 255, 0.12);
          box-shadow: 0 32px 64px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0,229,255,0.06);
          animation: nxa-slide-up 0.2s ease;
          background: #0a0a1a;
        }
        @keyframes nxa-slide-up {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* === Sidebar === */
        .nxa-sidebar {
          width: 220px;
          flex-shrink: 0;
          background: #07071a;
          border-right: 1px solid rgba(255,255,255,0.06);
          display: flex;
          flex-direction: column;
          padding: 1.5rem 0.75rem;
        }
        .nxa-sidebar-header { padding: 0 0.75rem 1.25rem; }
        .nxa-sidebar-title {
          font-size: 1rem;
          font-weight: 700;
          color: #f1f5f9;
          letter-spacing: -0.01em;
        }
        .nxa-sidebar-subtitle {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 2px;
        }
        .nxa-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
        .nxa-nav-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #94a3b8;
          background: none;
          border: none;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          text-align: left;
        }
        .nxa-nav-item:hover { background: rgba(255,255,255,0.05); color: #e2e8f0; }
        .nxa-nav-active {
          background: rgba(0, 229, 255, 0.1) !important;
          color: #00e5ff !important;
        }
        .nxa-sidebar-footer {
          padding: 0.75rem;
          margin-top: auto;
        }
        .nxa-clerk-badge {
          font-size: 0.7rem;
          color: #475569;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        /* === Main panel === */
        .nxa-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #0a0a1a;
        }
        .nxa-main-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .nxa-main-title {
          font-size: 1rem;
          font-weight: 700;
          color: #f1f5f9;
          letter-spacing: -0.01em;
        }
        .nxa-close-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          color: #94a3b8;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .nxa-close-btn:hover { background: rgba(255,255,255,0.1); color: #f1f5f9; }
        .nxa-main-body { overflow-y: auto; flex: 1; }
        .nxa-main-body::-webkit-scrollbar { width: 4px; }
        .nxa-main-body::-webkit-scrollbar-track { background: transparent; }
        .nxa-main-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

        /* === Tab content === */
        .nxa-tab-content { padding: 0 1.5rem 1.5rem; }
        .nxa-section { padding: 1.25rem 0; }
        .nxa-section-header { margin-bottom: 1rem; }
        .nxa-section-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: #cbd5e1;
        }
        .nxa-section-desc {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 3px;
        }
        .nxa-danger-title { color: #f87171; }
        .nxa-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 0; }

        /* === Profile row === */
        .nxa-profile-row {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }
        .nxa-avatar-wrap { position: relative; flex-shrink: 0; }
        .nxa-avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          object-fit: cover;
          display: block;
        }
        .nxa-avatar-fallback {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #00e5ff, #0088ff);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 1.25rem;
          color: #000;
        }
        .nxa-avatar-ring {
          position: absolute;
          inset: -2px;
          border-radius: 50%;
          border: 2px solid #00e5ff;
          pointer-events: none;
        }
        .nxa-profile-meta { flex: 1; }
        .nxa-name-display { display: flex; flex-direction: column; gap: 2px; }
        .nxa-display-name {
          font-size: 1rem;
          font-weight: 600;
          color: #f1f5f9;
        }
        .nxa-username-handle { font-size: 0.8rem; color: #64748b; }
        .nxa-saved-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.7rem;
          color: #34d399;
          background: rgba(52, 211, 153, 0.1);
          padding: 2px 8px;
          border-radius: 20px;
          width: fit-content;
          margin-top: 4px;
        }
        .nxa-update-btn {
          flex-shrink: 0;
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* Name edit */
        .nxa-name-edit { display: flex; flex-direction: column; gap: 0.5rem; }
        .nxa-name-edit-actions { display: flex; gap: 0.5rem; margin-top: 0.25rem; }

        /* === Email list === */
        .nxa-email-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .nxa-email-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 0.75rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
        }
        .nxa-email-address { font-size: 0.875rem; color: #cbd5e1; flex: 1; }
        .nxa-primary-badge {
          font-size: 0.7rem;
          color: #00e5ff;
          background: rgba(0,229,255,0.1);
          padding: 2px 8px;
          border-radius: 20px;
        }
        .nxa-verified-badge {
          font-size: 0.7rem;
          color: #34d399;
          background: rgba(52,211,153,0.1);
          padding: 2px 8px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 3px;
        }

        /* === Connected account row === */
        .nxa-conn-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 0.875rem;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
          margin-bottom: 0.5rem;
          transition: border-color 0.15s;
        }
        .nxa-conn-row:hover { border-color: rgba(255,255,255,0.1); }
        .nxa-conn-left { display: flex; align-items: center; gap: 0.75rem; }
        .nxa-conn-icon { display: flex; align-items: center; }
        .nxa-conn-info { display: flex; flex-direction: column; gap: 2px; }
        .nxa-conn-provider { font-size: 0.875rem; font-weight: 600; color: #e2e8f0; }
        .nxa-conn-username {
          font-size: 0.75rem;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .nxa-conn-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #34d399;
          flex-shrink: 0;
        }
        .nxa-conn-disconnected { font-size: 0.75rem; color: #475569; }
        .nxa-conn-right { display: flex; align-items: center; gap: 0.5rem; position: relative; }
        .nxa-conn-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.7rem;
          color: #34d399;
          background: rgba(52,211,153,0.1);
          padding: 3px 8px;
          border-radius: 20px;
        }

        /* === Dropdown === */
        .nxa-dropdown {
          position: absolute;
          top: 110%;
          right: 0;
          z-index: 50;
          background: #12122a;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 4px;
          min-width: 160px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        .nxa-dropdown-item {
          display: block;
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-size: 0.8125rem;
          color: #cbd5e1;
          background: none;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          text-align: left;
          transition: background 0.12s;
        }
        .nxa-dropdown-item:hover { background: rgba(255,255,255,0.07); }
        .nxa-dropdown-danger { color: #f87171 !important; }
        .nxa-dropdown-danger:hover { background: rgba(248,113,113,0.1) !important; }

        /* === Security === */
        .nxa-security-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 0.875rem;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
        }
        .nxa-security-label { font-size: 0.75rem; color: #64748b; }
        .nxa-security-value { font-size: 0.875rem; color: #cbd5e1; margin-top: 2px; letter-spacing: 2px; }
        .nxa-session-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 0.875rem;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
        }
        .nxa-session-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #34d399;
          flex-shrink: 0;
          box-shadow: 0 0 6px #34d399;
        }
        .nxa-session-name { font-size: 0.875rem; color: #e2e8f0; font-weight: 500; }
        .nxa-session-meta { font-size: 0.75rem; color: #64748b; margin-top: 2px; }
        .nxa-session-badge {
          margin-left: auto;
          font-size: 0.7rem;
          color: #34d399;
          background: rgba(52,211,153,0.1);
          padding: 3px 8px;
          border-radius: 20px;
        }

        /* === Forms === */
        .nxa-form-group { display: flex; flex-direction: column; gap: 0.5rem; }
        .nxa-form-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
        .nxa-label { font-size: 0.8rem; font-weight: 500; color: #94a3b8; }
        .nxa-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: #12122a;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          color: #e2e8f0;
          font-size: 0.875rem;
          font-family: var(--font-inter, inherit);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .nxa-input:focus {
          border-color: #00e5ff;
          box-shadow: 0 0 0 3px rgba(0,229,255,0.15);
        }
        .nxa-input::placeholder { color: #475569; }
        .nxa-error {
          font-size: 0.8rem;
          color: #f87171;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .nxa-success {
          font-size: 0.8rem;
          color: #34d399;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        /* === Buttons === */
        .nxa-icon-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          background: none;
          border: 1px solid rgba(255,255,255,0.08);
          color: #64748b;
          cursor: pointer;
          transition: background 0.12s, color 0.12s;
        }
        .nxa-icon-btn:hover { background: rgba(255,255,255,0.06); color: #cbd5e1; }
        .nxa-btn {
          padding: 0.4375rem 0.875rem;
          border-radius: 8px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          border: none;
          font-family: var(--font-inter, inherit);
          transition: opacity 0.15s, transform 0.1s;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          white-space: nowrap;
        }
        .nxa-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .nxa-btn-primary {
          background: linear-gradient(135deg, #00e5ff, #0088ff);
          color: #000;
        }
        .nxa-btn-primary:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .nxa-btn-ghost {
          background: rgba(255,255,255,0.05);
          color: #94a3b8;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .nxa-btn-ghost:hover { background: rgba(255,255,255,0.09); color: #e2e8f0; }
        .nxa-btn-danger {
          background: rgba(248,113,113,0.1);
          color: #f87171;
          border: 1px solid rgba(248,113,113,0.2);
        }
        .nxa-btn-danger:hover { background: rgba(248,113,113,0.18); }

        /* === Responsive === */
        @media (max-width: 600px) {
          .nxa-dialog { flex-direction: column; max-height: 95vh; }
          .nxa-sidebar { width: 100%; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 1rem 0.75rem 0.5rem; }
          .nxa-sidebar-header { display: none; }
          .nxa-nav { flex-direction: row; }
          .nxa-sidebar-footer { display: none; }
          .nxa-profile-row { flex-wrap: wrap; }
          .nxa-update-btn { margin-left: 0; }
        }

        /* === Reduced motion === */
        @media (prefers-reduced-motion: reduce) {
          .nxa-overlay, .nxa-dialog { animation: none; }
        }
      `}</style>
    </>
  );
}

export default AccountModal;