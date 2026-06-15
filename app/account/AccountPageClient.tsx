"use client";
 
import { useState } from "react";
import { useUser, useClerk, UserButton } from "@clerk/nextjs";
import { AccountModal } from "@/components/AccountModal"; // adjust import path
import Link from "next/link";
 
type Tab = "profile" | "security";
 
export function AccountPageClient() {
  const { user }  = useUser();
  const { signOut } = useClerk();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [modalOpen, setModalOpen] = useState(false);
 
  return (
    <div className="nxap-root">
      {/* ── Top bar ── */}
      <header className="nxap-topbar">
        <Link href="/app" className="nxap-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to app
        </Link>
        <div className="nxap-topbar-right">
          <UserButton />
        </div>
      </header>
 
      {/* ── Page layout ── */}
      <div className="nxap-layout">
        {/* Sidebar */}
        <aside className="nxap-sidebar">
          <div className="nxap-sidebar-head">
            <p className="nxap-sidebar-title">Account</p>
            <p className="nxap-sidebar-sub">Manage your account info.</p>
          </div>
 
          <nav className="nxap-nav">
            <button
              className={`nxap-nav-item ${activeTab === "profile" ? "nxap-nav-active" : ""}`}
              onClick={() => setActiveTab("profile")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              Profile
            </button>
            <button
              className={`nxap-nav-item ${activeTab === "security" ? "nxap-nav-active" : ""}`}
              onClick={() => setActiveTab("security")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.25C17.25 23.15 21 18.25 21 13V7l-9-5z" />
              </svg>
              Security
            </button>
          </nav>
 
          <div className="nxap-sidebar-footer">
            <button
              className="nxap-signout-btn"
              onClick={() => signOut({ redirectUrl: "/" })}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
            <span className="nxap-clerk-label">Secured by Clerk</span>
          </div>
        </aside>
 
        {/* Main content — reuse the AccountModal content inline via open modal */}
        <main className="nxap-main">
          <div className="nxap-panel">
            <div className="nxap-panel-header">
              <h1 className="nxap-panel-title">
                {activeTab === "profile" ? "Profile details" : "Security settings"}
              </h1>
              {/* Quick-open as modal too */}
              <button
                className="nxap-modal-btn"
                onClick={() => setModalOpen(true)}
                title="Open in dialog"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
                Open as dialog
              </button>
            </div>
 
            {/* Profile summary card */}
            {activeTab === "profile" && (
              <div className="nxap-profile-card">
                <div className="nxap-card-avatar-wrap">
                  {user?.imageUrl ? (
                    <img src={user.imageUrl} alt="Avatar" className="nxap-card-avatar" />
                  ) : (
                    <div className="nxap-card-avatar nxap-card-avatar-fallback">
                      {(user?.firstName?.[0] ?? user?.username?.[0] ?? "N").toUpperCase()}
                    </div>
                  )}
                  <div className="nxap-avatar-ring" />
                </div>
                <div className="nxap-card-info">
                  <p className="nxap-card-name">{user?.fullName || user?.username || "—"}</p>
                  <p className="nxap-card-handle">@{user?.username ?? "—"}</p>
                  <p className="nxap-card-email">
                    {user?.primaryEmailAddress?.emailAddress ?? "No email"}
                  </p>
                </div>
                <button
                  className="nxap-edit-btn"
                  onClick={() => setModalOpen(true)}
                >
                  Edit profile
                </button>
              </div>
            )}
 
            {/* Hint block */}
            <div className="nxap-hint">
              <p>
                {activeTab === "profile"
                  ? "Update your display name, avatar, and linked Discord & Roblox accounts."
                  : "Manage your password and review active sessions."}
              </p>
              <button
                className="nxap-hint-action"
                onClick={() => setModalOpen(true)}
              >
                Open settings →
              </button>
            </div>
          </div>
        </main>
      </div>
 
      {/* Modal — reuses AccountModal component */}
      <AccountModal open={modalOpen} onClose={() => setModalOpen(false)} />
 
      <style>{`
        .nxap-root {
          min-height: 100vh;
          background: #030312;
          font-family: var(--font-inter, system-ui, sans-serif);
          color: #e2e8f0;
        }
 
        /* Top bar */
        .nxap-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.875rem 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(0,0,0,0.3);
          backdrop-filter: blur(8px);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .nxap-back {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.875rem;
          color: #64748b;
          text-decoration: none;
          transition: color 0.15s;
        }
        .nxap-back:hover { color: #00e5ff; }
        .nxap-topbar-right { display: flex; align-items: center; gap: 0.75rem; }
 
        /* Layout */
        .nxap-layout {
          display: flex;
          max-width: 960px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
          gap: 2rem;
        }
 
        /* Sidebar */
        .nxap-sidebar {
          width: 220px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          position: sticky;
          top: 72px;
          height: fit-content;
        }
        .nxap-sidebar-head { margin-bottom: 1.25rem; }
        .nxap-sidebar-title { font-size: 1.125rem; font-weight: 700; color: #f1f5f9; letter-spacing: -0.02em; }
        .nxap-sidebar-sub { font-size: 0.8125rem; color: #64748b; margin-top: 3px; }
        .nxap-nav { display: flex; flex-direction: column; gap: 2px; }
        .nxap-nav-item {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.5rem 0.75rem; border-radius: 8px;
          font-size: 0.875rem; font-weight: 500; color: #94a3b8;
          background: none; border: none; cursor: pointer;
          transition: background 0.15s, color 0.15s; text-align: left;
        }
        .nxap-nav-item:hover { background: rgba(255,255,255,0.05); color: #e2e8f0; }
        .nxap-nav-active {
          background: rgba(0,229,255,0.1) !important;
          color: #00e5ff !important;
        }
        .nxap-sidebar-footer { margin-top: 2rem; display: flex; flex-direction: column; gap: 0.5rem; }
        .nxap-signout-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 0.4375rem 0.75rem; border-radius: 8px;
          font-size: 0.8125rem; color: #f87171;
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.15);
          cursor: pointer; transition: background 0.15s;
          font-family: inherit;
        }
        .nxap-signout-btn:hover { background: rgba(248,113,113,0.15); }
        .nxap-clerk-label { font-size: 0.7rem; color: #334155; padding: 0 0.75rem; }
 
        /* Main */
        .nxap-main { flex: 1; }
        .nxap-panel {
          background: #0a0a1a;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          overflow: hidden;
        }
        .nxap-panel-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .nxap-panel-title { font-size: 1rem; font-weight: 700; color: #f1f5f9; }
        .nxap-modal-btn {
          display: flex; align-items: center; gap: 5px;
          font-size: 0.75rem; color: #64748b;
          background: none; border: none; cursor: pointer;
          padding: 0.25rem 0.5rem; border-radius: 6px;
          transition: color 0.15s, background 0.15s;
          font-family: inherit;
        }
        .nxap-modal-btn:hover { color: #00e5ff; background: rgba(0,229,255,0.06); }
 
        /* Profile card */
        .nxap-profile-card {
          display: flex; align-items: center; gap: 1rem;
          padding: 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .nxap-card-avatar-wrap { position: relative; flex-shrink: 0; }
        .nxap-card-avatar {
          width: 64px; height: 64px; border-radius: 50%; object-fit: cover; display: block;
        }
        .nxap-card-avatar-fallback {
          width: 64px; height: 64px; border-radius: 50%;
          background: linear-gradient(135deg, #00e5ff, #0088ff);
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 1.4rem; color: #000;
        }
        .nxap-avatar-ring {
          position: absolute; inset: -2px; border-radius: 50%;
          border: 2px solid #00e5ff; pointer-events: none;
        }
        .nxap-card-info { flex: 1; }
        .nxap-card-name { font-size: 1rem; font-weight: 600; color: #f1f5f9; }
        .nxap-card-handle { font-size: 0.8125rem; color: #64748b; margin-top: 2px; }
        .nxap-card-email { font-size: 0.8125rem; color: #475569; margin-top: 4px; }
        .nxap-edit-btn {
          padding: 0.4375rem 0.875rem; border-radius: 8px;
          font-size: 0.8125rem; font-weight: 600;
          background: linear-gradient(135deg, #00e5ff, #0088ff);
          color: #000; border: none; cursor: pointer;
          transition: opacity 0.15s; font-family: inherit;
          flex-shrink: 0;
        }
        .nxap-edit-btn:hover { opacity: 0.88; }
 
        /* Hint */
        .nxap-hint {
          padding: 1.5rem;
          display: flex; align-items: center; justify-content: space-between; gap: 1rem;
        }
        .nxap-hint p { font-size: 0.875rem; color: #64748b; }
        .nxap-hint-action {
          font-size: 0.875rem; font-weight: 600; color: #00e5ff;
          background: none; border: none; cursor: pointer;
          font-family: inherit; white-space: nowrap;
          transition: opacity 0.15s;
        }
        .nxap-hint-action:hover { opacity: 0.75; }
 
        /* Responsive */
        @media (max-width: 640px) {
          .nxap-layout { flex-direction: column; padding: 1rem; gap: 1rem; }
          .nxap-sidebar { position: static; width: 100%; }
          .nxap-nav { flex-direction: row; }
          .nxap-sidebar-footer { flex-direction: row; align-items: center; }
          .nxap-profile-card { flex-wrap: wrap; }
        }
      `}</style>
    </div>
  );
}