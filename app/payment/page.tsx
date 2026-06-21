"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionUser {
  displayName?: string;
  username?: string;
  avatar?: string;
  robloxId?: string;
}
interface SessionData {
  credits?: number | string;
  plan?: string;
  roles?: string[];
}
interface NexusSession {
  loginTime?: number;
  user?: SessionUser;
  data?: SessionData;
}

interface PaymentConfig {
  ovo?: { number?: string };
  dana?: { number?: string };
  owner?: string;
}

type PayMethod = "ovo" | "dana" | null;
type View = 1 | 2 | 3 | 4;

interface Selection {
  pack: string | null;
  cr: number;
  price: number;
  usd: number;
  priceStr: string;
  label: string;
  method: PayMethod;
}

interface ToastState {
  visible: boolean;
  msg: string;
  color: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatIdr(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function genTxId(): string {
  return (
    "NX-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ toast }: { toast: ToastState }) {
  return (
    <div
      className="nx-toast"
      style={{
        background: "rgba(8,8,42,.96)",
        border: "1px solid rgba(0,229,255,.15)",
        transform: toast.visible
          ? "translateY(0) scale(1)"
          : "translateY(20px) scale(.96)",
        opacity: toast.visible ? 1 : 0,
      }}
    >
      <div
        className="nx-toast-dot"
        style={{
          background: toast.color,
          boxShadow: `0 0 10px ${toast.color}`,
        }}
      />
      <span style={{ color: toast.color, fontFamily: "JetBrains Mono, monospace" }}>
        {toast.msg}
      </span>
    </div>
  );
}

// ─── Steps Bar ───────────────────────────────────────────────────────────────

function StepsBar({ current }: { current: View }) {
  const steps = ["Select Package", "Payment Method", "Confirm Transfer"];
  return (
    <div className="nx-steps">
      <div className="nx-steps-row">
        {steps.map((_, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <div key={n} className="nx-step-item">
              <div
                className="nx-step-circle"
                style={{
                  border: `1.5px solid ${
                    done ? "var(--green)" : active ? "var(--cyan)" : "rgba(58,74,122,.5)"
                  }`,
                  fontSize: done ? 15 : 11,
                  color: done ? "var(--bg)" : active ? "var(--cyan)" : "var(--dim)",
                  background: done
                    ? "var(--green)"
                    : active
                    ? "rgba(0,229,255,.08)"
                    : "rgba(0,0,0,.3)",
                  boxShadow: active
                    ? "0 0 0 5px rgba(0,229,255,.1), 0 0 24px rgba(0,229,255,.2)"
                    : done
                    ? "0 0 14px rgba(0,255,163,.3)"
                    : "none",
                  transform: active ? "scale(1.12)" : "scale(1)",
                }}
              >
                {done ? "✓" : n}
              </div>
              {n < 3 && (
                <div
                  className="nx-step-line"
                  style={{
                    background:
                      n < current
                        ? "linear-gradient(90deg,var(--green),rgba(0,255,163,.3))"
                        : "rgba(0,229,255,.06)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="nx-steps-labels">
        {steps.map((label, i) => {
          const n = i + 1;
          const color =
            n < current ? "var(--green)" : n === current ? "var(--cyan)" : "var(--dim)";
          return (
            <span key={n} style={{ color }}>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────

function AuthLoader() {
  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInLoader { from{opacity:0} to{opacity:1} }
      `}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#020210",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          zIndex: 9999,
          animation: "fadeInLoader .2s ease",
          padding: "0 20px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "Orbitron, sans-serif",
            fontSize: "clamp(18px, 5vw, 22px)",
            fontWeight: 900,
            background: "linear-gradient(135deg, #00e5ff, #7c3aed)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: 4,
          }}
        >
          NEXUS AI
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "2px solid rgba(0,229,255,.08)",
            borderTopColor: "#00e5ff",
            animation: "spin .85s linear infinite",
          }}
        />
        <p
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9.5,
            color: "#334068",
            letterSpacing: 2.5,
            textTransform: "uppercase",
          }}
        >
          Verifying session...
        </p>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PaymentPage() {
  // ── Auth state ──
  const [authChecked, setAuthChecked] = useState(false);
  const [session, setSession] = useState<NexusSession | null>(null);

  // ── User info ──
  const [displayName, setDisplayName] = useState("User");
  const [username, setUsername] = useState("user");
  const [avatarUrl, setAvatarUrl] = useState("/images/nexusai.png");
  const [credits, setCredits] = useState<string>("—");
  const [plan, setPlan] = useState("FREE");

  // ── Payment config ──
  const [ovoNumber, setOvoNumber] = useState("");
  const [danaNumber, setDanaNumber] = useState("");
  const [ownerName, setOwnerName] = useState("NEXUS STUDIO");

  // ── UI State ──
  const [view, setView] = useState<View>(1);
  const [toast, setToastState] = useState<ToastState>({
    visible: false,
    msg: "",
    color: "var(--cyan)",
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Selection ──
  const [sel, setSel] = useState<Selection>({
    pack: null,
    cr: 0,
    price: 0,
    usd: 0,
    priceStr: "",
    label: "",
    method: null,
  });

  // ── Step 3 state ──
  const [confirmAmount, setConfirmAmount] = useState("");
  const [amountStatus, setAmountStatus] = useState<"idle" | "valid" | "close" | "invalid">("idle");
  const [txId, setTxId] = useState("—");
  const [submitting, setSubmitting] = useState(false);

  /* ═══════════════════════════════════════════════════════════
     AUTH GUARD — runs first, before anything else renders
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("nexus_session");

      if (!raw) {
        window.location.replace("/");
        return;
      }

      let sess: NexusSession;
      try {
        sess = JSON.parse(raw);
      } catch {
        localStorage.removeItem("nexus_session");
        window.location.replace("/");
        return;
      }

      if (!sess?.user?.username) {
        localStorage.removeItem("nexus_session");
        window.location.replace("/");
        return;
      }

      if (Date.now() - (sess.loginTime || 0) > 86_400_000 * 7) {
        localStorage.removeItem("nexus_session");
        window.location.replace("/");
        return;
      }

      setSession(sess);
      const u = sess.user || {};
      const d = sess.data || {};

      const name = u.displayName || u.username || "User";
      setDisplayName(name);
      setUsername(u.username || "user");

      if (u.avatar) {
        setAvatarUrl(u.avatar);
      } else if (u.robloxId) {
        setAvatarUrl(
          `https://www.roblox.com/headshot-thumbnail/image?userId=${u.robloxId}&width=150&height=150&format=png`
        );
      }

      const roles = d.roles || [];
      const planRaw = (d.plan || "free").toLowerCase();
      const isOwner =
        planRaw === "owner" ||
        planRaw === "unlimited" ||
        roles.includes("owner");

      if (isOwner) {
        setCredits("∞");
        setPlan("OWNER");
      } else {
        const cr =
          d.credits !== undefined
            ? parseFloat(String(d.credits)).toFixed(0)
            : "—";
        setCredits(cr);
        setPlan(planRaw === "pro" ? "PRO" : planRaw === "admin" ? "ADMIN" : "FREE");
      }

      setAuthChecked(true);
    } catch {
      localStorage.removeItem("nexus_session");
      window.location.replace("/");
    }
  }, []);

  // ── Load payment config ──
  useEffect(() => {
    if (!authChecked) return;
    fetch("/api/payment")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PaymentConfig | null) => {
        if (!d) return;
        if (d.ovo?.number) setOvoNumber(d.ovo.number);
        if (d.dana?.number) setDanaNumber(d.dana.number);
        if (d.owner) setOwnerName(d.owner);
      })
      .catch(() => {/* silent */});
  }, [authChecked]);

  // ── Toast helper ──
  const showToast = useCallback((msg: string, color = "var(--cyan)") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastState({ visible: true, msg, color });
    toastTimer.current = setTimeout(() => {
      setToastState((prev) => ({ ...prev, visible: false }));
    }, 3200);
  }, []);

  // ── Navigation ──
  const goToView = useCallback((n: View) => {
    setView(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleBack = () => {
    if (view > 1) goToView((view - 1) as View);
    else window.location.href = "/dashboard";
  };

  // ── Pack / Plan selection ──
  const selectProPlan = () => {
    setSel({
      pack: "pro-plan",
      cr: 200,
      price: 150000,
      usd: 9.38,
      priceStr: "Rp 150,000",
      label: "Pro Plan (Monthly) · 200 CR",
      method: sel.method,
    });
    showToast("Pro Plan selected!", "var(--cyan)");
  };

  const selectPack = (id: string, cr: number, price: number, usd: number, label: string) => {
    setSel({ pack: id, cr, price, usd, priceStr: formatIdr(price), label, method: sel.method });
  };

  const selectMethod = (m: PayMethod) => {
    setSel((prev) => ({ ...prev, method: m }));
  };

  const goToPayment = () => {
    if (!sel.pack) { showToast("Please select a package first.", "var(--pink)"); return; }
    goToView(2);
  };

  const showPayInst = () => {
    if (!sel.method) { showToast("Please select a payment method.", "var(--pink)"); return; }
    setConfirmAmount("");
    setAmountStatus("idle");
    goToView(3);
  };

  // ── Amount validation ──
  const validateAmount = (val: string) => {
    setConfirmAmount(val);
    const amt = parseInt(val, 10);
    if (!val || isNaN(amt) || amt <= 0) { setAmountStatus("idle"); return; }
    if (amt === sel.price) setAmountStatus("valid");
    else if (Math.abs(amt - sel.price) < 1000) setAmountStatus("close");
    else setAmountStatus("invalid");
  };

  // ── Copy number ──
  const copyNumber = () => {
    const num = sel.method === "ovo" ? ovoNumber : danaNumber;
    if (!num) { showToast("Number not configured yet.", "var(--pink)"); return; }
    navigator.clipboard
      ?.writeText(num)
      .then(() => showToast("Number copied!", "var(--green)"))
      .catch(() => showToast(num, "var(--cyan)"));
  };

  // ── Confirm payment ──
  const confirmPayment = async () => {
    if (!session?.user) { showToast("Session expired. Please log in again.", "var(--pink)"); return; }
    const packIdMap: Record<string, string> = {
      "50": "small", "80": "popular", "150": "pro", "500": "mega", "pro-plan": "pro-plan",
    };
    const packId = sel.pack ? packIdMap[sel.pack] : null;
    if (!packId) { showToast("Invalid package.", "var(--pink)"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: session.user.username,
          userId: session.user.robloxId || "",
          packId,
          method: sel.method,
          amount: sel.price,
          note: `NEXUS-${session.user.username}-${sel.cr}CR`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const id = data.transaction?.id || genTxId();
        localStorage.setItem("lastPaymentId", id);
        setTxId(id);
        showToast("Payment submitted! Awaiting verification.", "var(--green)");
        goToView(4);
      } else {
        showToast("Submission failed: " + (data.error || "Please try again."), "var(--pink)");
      }
    } catch (e) {
      showToast(
        "Network error: " + (e instanceof Error ? e.message : "Unknown"),
        "var(--pink)"
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived ──
  const methodNum = sel.method === "ovo" ? ovoNumber : danaNumber;
  const noteVal = `NEXUS-${username}-${sel.cr}CR`;
  const methodLabel = sel.method === "ovo" ? "OVO" : sel.method === "dana" ? "DANA" : "—";

  const getPlanStyle = () => {
    switch (plan) {
      case "PRO": return { color: "var(--cyan)", border: "rgba(0,229,255,.28)", bg: "rgba(0,229,255,.07)" };
      case "OWNER": return { color: "var(--yellow)", border: "rgba(255,214,0,.28)", bg: "rgba(255,214,0,.07)" };
      case "ADMIN": return { color: "var(--purple)", border: "rgba(124,58,237,.28)", bg: "rgba(124,58,237,.07)" };
      default: return { color: "var(--green)", border: "rgba(0,255,163,.2)", bg: "rgba(0,255,163,.06)" };
    }
  };

  const planStyle = getPlanStyle();

  /* ─────────────────────────────────────────────────────
     Show loader until auth is resolved
  ───────────────────────────────────────────────────── */
  if (!authChecked) return <AuthLoader />;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        html { scroll-behavior:smooth; -webkit-text-size-adjust:100%; }
        :root {
          --bg:      #020210;
          --bg2:     #05051a;
          --bg3:     #08082a;
          --bg4:     #0c0c30;
          --cyan:    #00e5ff;
          --cyan2:   rgba(0,229,255,.28);
          --cyan3:   rgba(0,229,255,.07);
          --purple:  #7c3aed;
          --purple2: rgba(124,58,237,.35);
          --pink:    #f43f5e;
          --green:   #00ffa3;
          --yellow:  #fbbf24;
          --orange:  #f97316;
          --text:    #a8b8e0;
          --dim:     #334068;
          --dim2:    #5a6a9a;
          --r:       12px;
          --r2:      8px;
        }
        body {
          min-height:100vh;
          font-family:'Space Grotesk',sans-serif;
          background:var(--bg); color:var(--text);
          font-size:14px; overflow-x:hidden;
        }
        img { max-width:100%; }
        button, input { font-family:inherit; }
        /* Animated grid background */
        body::before {
          content:''; position:fixed; inset:0; z-index:0;
          background:
            linear-gradient(rgba(0,229,255,.014) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,229,255,.014) 1px, transparent 1px);
          background-size:50px 50px;
          animation:gridShift 25s linear infinite;
          pointer-events:none;
        }
        @keyframes gridShift { to { background-position:50px 50px; } }
        body::after {
          content:''; position:fixed;
          top:-20%; left:50%; transform:translateX(-50%);
          width:1000px; height:600px; max-width:200vw;
          background:radial-gradient(ellipse,rgba(124,58,237,.1) 0%,transparent 60%);
          pointer-events:none; z-index:0;
        }
        .scanlines {
          position:fixed; inset:0; z-index:1;
          background:repeating-linear-gradient(
            0deg, transparent, transparent 2px,
            rgba(0,0,0,.025) 2px, rgba(0,0,0,.025) 4px
          );
          pointer-events:none;
        }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes heroIn { from{opacity:0;transform:translateY(-18px)} to{opacity:1;transform:none} }
        @keyframes iconFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes hotPulse {
          0%,100%{box-shadow:0 0 8px rgba(0,229,255,.3)}
          50%{box-shadow:0 0 22px rgba(0,229,255,.55)}
        }
        @keyframes successPop { from{transform:scale(.4);opacity:0} to{transform:scale(1);opacity:1} }

        /* ── TOAST ── */
        .nx-toast {
          position:fixed; bottom:16px; right:16px; left:16px;
          z-index:9999;
          margin-left:auto;
          border-radius:14px;
          padding:12px 16px;
          font-size:12px; line-height:1.5;
          display:flex; align-items:center; gap:10px;
          max-width:320px;
          backdrop-filter:blur(24px);
          box-shadow:0 8px 32px rgba(0,0,0,.6);
          transition:0.3s cubic-bezier(.34,1.56,.64,1);
          pointer-events:none;
        }
        .nx-toast-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }

        /* ── NAV ── */
        .nav {
          position:sticky; top:0; z-index:200;
          display:flex; align-items:center; justify-content:space-between;
          padding:0 16px; height:56px;
          background:rgba(2,2,16,.92);
          border-bottom:1px solid rgba(0,229,255,.09);
          backdrop-filter:blur(24px);
          gap:8px;
        }
        .nav::after {
          content:''; position:absolute; bottom:0; left:0; right:0; height:1px;
          background:linear-gradient(90deg,transparent,rgba(0,229,255,.25),transparent);
        }
        .nav-logo {
          font-family:'Orbitron',sans-serif;
          font-size:14px; font-weight:900;
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          text-decoration:none; letter-spacing:1.5px;
          display:flex; align-items:center; gap:8px;
          flex-shrink:0; min-width:0;
        }
        .nav-logo-icon {
          width:26px; height:26px; border-radius:7px;
          overflow:hidden; border:1px solid rgba(0,229,255,.18);
          flex-shrink:0;
        }
        .nav-logo-icon img { width:100%; height:100%; object-fit:cover; display:block; }
        .nav-center { display:flex; align-items:center; gap:6px; flex-shrink:0; }
        .nav-status-dot {
          width:6px; height:6px; border-radius:50%;
          background:var(--green); box-shadow:0 0 8px var(--green);
          animation:blink 2.2s ease-in-out infinite;
        }
        .nav-status-text {
          font-size:10px; color:var(--green);
          font-family:'JetBrains Mono',monospace; letter-spacing:1px;
        }
        .nav-back {
          display:flex; align-items:center; gap:5px;
          color:var(--dim2); font-size:11px;
          font-family:'JetBrains Mono',monospace;
          cursor:pointer; border:1px solid rgba(0,229,255,.1);
          background:transparent; padding:7px 14px; border-radius:22px;
          transition:.18s; letter-spacing:.5px; flex-shrink:0;
          white-space:nowrap;
        }
        .nav-back:hover { color:var(--cyan); border-color:var(--cyan2); background:var(--cyan3); }
        .nav-back svg { width:11px; height:11px; stroke:currentColor; fill:none; stroke-width:2.5; flex-shrink:0; }

        /* ── MAIN CONTAINER ── */
        .main {
          max-width:740px; margin:0 auto;
          padding:32px 16px 80px;
          position:relative; z-index:2;
          width:100%;
        }

        /* ── HERO ── */
        .hero {
          text-align:center; margin-bottom:32px;
          animation:heroIn .55s cubic-bezier(.16,1,.3,1) both;
        }
        .hero-icon-wrap {
          display:inline-flex; align-items:center; justify-content:center;
          width:64px; height:64px; border-radius:50%;
          background:linear-gradient(135deg,rgba(0,229,255,.12),rgba(124,58,237,.12));
          border:1px solid rgba(0,229,255,.22);
          margin-bottom:16px;
          box-shadow:0 0 36px rgba(0,229,255,.1), 0 0 72px rgba(124,58,237,.06);
          animation:iconFloat 3.2s ease-in-out infinite;
        }
        .hero-title {
          font-family:'Orbitron',sans-serif; font-size:clamp(22px, 6vw, 30px); font-weight:900;
          background:linear-gradient(135deg,#fff 0%,var(--cyan) 50%,var(--purple) 100%);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          margin-bottom:8px; letter-spacing:1px;
        }
        .hero-sub {
          font-size:11px; color:var(--dim);
          font-family:'JetBrains Mono',monospace; letter-spacing:.5px;
          padding:0 8px;
        }
        .hero-sub span { color:var(--cyan); opacity:.65; }

        /* ── STEPS ── */
        .nx-steps { margin-bottom:28px; }
        .nx-steps-row { display:flex; align-items:center; justify-content:center; }
        .nx-step-item { display:flex; align-items:center; }
        .nx-step-circle {
          width:32px; height:32px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          font-family:'Orbitron',sans-serif; font-weight:700;
          transition:.4s cubic-bezier(.34,1.56,.64,1);
          flex-shrink:0; z-index:1;
        }
        .nx-step-line {
          width:48px; height:2px; min-width:16px;
          transition:background 0.6s ease;
        }
        .nx-steps-labels {
          display:flex; justify-content:space-between;
          padding:8px 0 0;
          font-size:8px;
          font-family:'JetBrains Mono',monospace; letter-spacing:.3px;
          text-align:center;
        }
        .nx-steps-labels span { flex:1; padding:0 2px; }

        /* ── USER CARD ── */
        .user-card {
          display:flex; align-items:center; gap:12px;
          background:var(--bg2); border:1px solid rgba(0,229,255,.09);
          border-radius:var(--r); padding:14px 16px; margin-bottom:28px;
          animation:fadeUp .5s .1s cubic-bezier(.16,1,.3,1) both;
          position:relative; overflow:hidden;
        }
        .user-card::before {
          content:''; position:absolute; top:0; left:0; right:0; height:1.5px;
          background:linear-gradient(90deg,transparent,rgba(0,229,255,.35),transparent);
        }
        .user-av {
          width:42px; height:42px; border-radius:50%;
          border:2px solid rgba(0,229,255,.25);
          object-fit:cover; flex-shrink:0;
          box-shadow:0 0 16px rgba(0,229,255,.15);
        }
        .user-info { flex:1; min-width:0; }
        .user-name { font-size:13px; color:white; font-weight:600; margin-bottom:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .user-credits {
          font-size:11px; color:var(--dim2);
          font-family:'JetBrains Mono',monospace;
        }
        .user-credits span { color:var(--yellow); font-weight:700; }
        .plan-pill {
          padding:4px 12px; border-radius:20px;
          font-size:9px; font-family:'JetBrains Mono',monospace;
          font-weight:700; letter-spacing:1px; flex-shrink:0;
          white-space:nowrap;
        }

        /* ── SECTION TITLE ── */
        .sec-title {
          font-family:'Orbitron',sans-serif; font-size:9px;
          color:var(--dim); letter-spacing:2.5px; text-transform:uppercase;
          margin-bottom:14px; padding-bottom:10px;
          border-bottom:1px solid rgba(0,229,255,.05);
          display:flex; align-items:center; gap:10px;
        }
        .sec-title::before {
          content:''; width:18px; height:1.5px;
          background:linear-gradient(90deg,var(--cyan),transparent);
          flex-shrink:0;
        }

        /* ── PLAN CARDS ── */
        .plans { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:28px; }
        .plan-card {
          background:var(--bg2); border:1px solid rgba(0,229,255,.07);
          border-radius:var(--r); padding:18px 14px;
          cursor:pointer; transition:.25s cubic-bezier(.34,1.56,.64,1);
          position:relative; overflow:hidden;
          min-width:0;
        }
        .plan-card::before {
          content:''; position:absolute; top:0; left:0; right:0;
          height:2px; background:transparent; transition:.3s;
        }
        .plan-card:hover { border-color:rgba(0,229,255,.18); transform:translateY(-3px); }
        .plan-card.selected { border-color:var(--cyan); box-shadow:0 0 32px rgba(0,229,255,.1); }
        .plan-card.selected::before { background:linear-gradient(90deg,var(--cyan),var(--purple)); }
        .plan-tier { font-size:9px; font-weight:700; letter-spacing:2px; margin-bottom:8px; }
        .plan-price {
          font-family:'Orbitron',sans-serif; font-size:clamp(20px, 5vw, 26px); font-weight:900;
          color:white; margin-bottom:2px; line-height:1;
        }
        .plan-freq {
          font-size:9.5px; color:var(--dim);
          font-family:'JetBrains Mono',monospace; margin-bottom:4px;
        }
        .plan-usd { font-size:10px; opacity:.55; margin-bottom:12px; }
        .plan-features { list-style:none; }
        .plan-feature-item {
          font-size:10.5px; padding:4px 0;
          display:flex; align-items:flex-start; gap:7px; line-height:1.5;
        }
        .feature-bullet { font-size:10px; flex-shrink:0; line-height:1.6; }
        .pro-hot {
          position:absolute; top:10px; right:10px;
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          color:white; font-size:7px; font-family:'Orbitron',sans-serif;
          padding:3px 9px; border-radius:20px; font-weight:700; letter-spacing:1px;
          animation:hotPulse 2.2s ease-in-out infinite;
          white-space:nowrap;
        }
        .plan-btn {
          width:100%; padding:10px; margin-top:14px;
          border:none; border-radius:var(--r2);
          font-family:'Orbitron',sans-serif; font-size:8.5px; font-weight:700;
          cursor:pointer; letter-spacing:1px; transition:.2s;
        }
        .plan-btn-free {
          background:rgba(0,255,163,.05); color:var(--green);
          border:1px solid rgba(0,255,163,.2);
        }
        .plan-btn-pro {
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          color:white; box-shadow:0 4px 18px rgba(0,229,255,.2);
        }
        .plan-btn-pro:hover { box-shadow:0 6px 28px rgba(0,229,255,.35); transform:translateY(-1px); }
        .plan-btn:disabled { opacity:.38; cursor:not-allowed; }

        /* ── CREDIT PACKS ── */
        .packs { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:28px; }
        .pack-card {
          background:var(--bg2); border:1px solid rgba(0,229,255,.07);
          border-radius:var(--r); padding:18px 12px;
          cursor:pointer; transition:.25s cubic-bezier(.34,1.56,.64,1);
          text-align:center; position:relative; overflow:hidden;
          min-width:0;
        }
        .pack-card:hover { border-color:rgba(251,191,36,.2); transform:translateY(-3px); }
        .pack-card.selected {
          border-color:var(--yellow);
          box-shadow:0 0 26px rgba(251,191,36,.12);
          background:rgba(251,191,36,.03);
        }
        .pack-popular-tag {
          position:absolute; top:-1px; left:50%; transform:translateX(-50%);
          background:linear-gradient(135deg,var(--yellow),var(--orange));
          color:#000; font-size:6.5px; font-weight:800;
          padding:3px 12px; border-radius:0 0 8px 8px;
          font-family:'Orbitron',sans-serif; letter-spacing:1.5px;
          white-space:nowrap;
        }
        .pack-cr {
          font-family:'Orbitron',sans-serif; font-size:clamp(24px, 7vw, 32px); font-weight:900;
          color:var(--yellow); line-height:1; margin-bottom:4px;
        }
        .pack-sub { font-size:8.5px; color:var(--dim); letter-spacing:1px; margin-bottom:10px; }
        .pack-price { font-size:14px; color:white; font-weight:700; margin-bottom:4px; word-break:break-word; }
        .pack-usd { font-size:9.5px; color:var(--text); opacity:.55; font-family:'JetBrains Mono',monospace; }
        .pack-val { margin-top:8px; font-size:8.5px; color:var(--green); font-family:'JetBrains Mono',monospace; }

        /* ── PAYMENT METHODS ── */
        .pay-methods { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:24px; }
        .pay-card {
          background:var(--bg2); border:1px solid rgba(0,229,255,.07);
          border-radius:var(--r); padding:14px;
          cursor:pointer; transition:.22s;
          display:flex; flex-direction:column; align-items:center; gap:10px;
          position:relative; text-align:center;
        }
        .pay-card:hover { border-color:rgba(0,229,255,.2); transform:translateY(-2px); }
        .pay-card.selected {
          border-color:var(--cyan);
          box-shadow:0 0 22px rgba(0,229,255,.1);
          background:rgba(0,229,255,.04);
        }
        .pay-icon-wrap {
          width:48px; height:48px; border-radius:10px;
          background:white; display:flex; align-items:center;
          justify-content:center; overflow:hidden; flex-shrink:0;
          box-shadow:0 2px 8px rgba(0,0,0,.3);
        }
        .pay-icon { width:44px; height:44px; object-fit:contain; }
        .pay-label { font-size:13px; font-weight:700; color:white; margin-bottom:2px; }
        .pay-sub { font-size:9.5px; color:var(--dim); }
        .pay-radio {
          position:absolute; top:10px; right:10px;
          width:18px; height:18px; border-radius:50%; flex-shrink:0;
          display:flex; align-items:center; justify-content:center; transition:.18s;
        }
        .pay-radio-dot { width:6px; height:6px; border-radius:50%; background:var(--bg); }

        /* ── ORDER BOX ── */
        .order-box {
          background:var(--bg2); border:1px solid rgba(0,229,255,.09);
          border-radius:var(--r); padding:16px; margin-bottom:20px;
          position:relative; overflow:hidden;
        }
        .order-box::before {
          content:''; position:absolute; top:0; left:0; right:0; height:1px;
          background:linear-gradient(90deg,transparent,rgba(0,229,255,.3),transparent);
        }
        .order-row {
          display:flex; justify-content:space-between; align-items:center;
          padding:8px 0; border-top:1px solid rgba(0,229,255,.04);
          gap:10px;
        }
        .order-row:first-child { border-top:none; }
        .order-label { font-size:11.5px; color:var(--dim); flex-shrink:0; }
        .order-val { font-size:11.5px; color:var(--text); text-align:right; word-break:break-word; }
        .order-total-label { font-size:13px; color:white; font-weight:700; }
        .order-total-val {
          font-family:'Orbitron',sans-serif; font-size:clamp(16px, 4vw, 20px);
          color:var(--yellow); font-weight:700;
        }
        .order-total-usd {
          font-size:9.5px; color:var(--dim);
          font-family:'JetBrains Mono',monospace; text-align:right; margin-top:2px;
        }

        /* ── PAYMENT INSTRUCTION ── */
        .pay-instruction {
          background:linear-gradient(135deg,rgba(0,229,255,.025),rgba(124,58,237,.025));
          border:1px solid rgba(0,229,255,.14);
          border-radius:var(--r); padding:18px; margin-bottom:20px;
          position:relative;
        }
        .pay-instruction::before {
          content:''; position:absolute; top:0; left:0; right:0; height:1.5px;
          background:linear-gradient(90deg,var(--cyan),var(--purple));
        }
        .inst-method-hdr {
          display:flex; align-items:center; gap:8px; margin-bottom:16px; flex-wrap:wrap;
        }
        .inst-method-badge {
          padding:4px 12px; border-radius:20px;
          font-family:'Orbitron',sans-serif; font-size:9.5px; font-weight:700;
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          color:white; letter-spacing:1px;
        }
        .inst-method-title { font-size:11.5px; color:white; font-weight:600; }
        .inst-owner { font-size:10.5px; color:var(--dim); margin-left:auto; }
        .inst-number-box {
          background:var(--bg3); border:1px solid rgba(0,229,255,.1);
          border-radius:var(--r2); padding:14px 16px; margin-bottom:18px;
          cursor:pointer; transition:.2s; position:relative; overflow:hidden;
          display:flex; align-items:center; justify-content:space-between;
          flex-wrap:wrap; gap:8px;
        }
        .inst-number-box:hover { border-color:var(--cyan2); background:var(--bg4); }
        .inst-number-box::after {
          content:''; position:absolute; inset:0;
          background:linear-gradient(90deg,transparent,rgba(0,229,255,.04),transparent);
          opacity:0; transition:.2s;
        }
        .inst-number-box:hover::after { opacity:1; }
        .inst-num-label {
          font-size:8.5px; color:var(--dim);
          font-family:'JetBrains Mono',monospace; letter-spacing:1.2px; margin-bottom:6px;
        }
        .inst-num {
          font-size:clamp(16px, 5vw, 22px); font-weight:700; color:white;
          letter-spacing:2px; font-family:'JetBrains Mono',monospace;
          word-break:break-all;
        }
        .inst-copy-hint {
          display:flex; align-items:center; gap:5px;
          font-size:8.5px; color:var(--dim);
          font-family:'JetBrains Mono',monospace; letter-spacing:.5px;
          white-space:nowrap; flex-shrink:0;
        }
        .step-list { list-style:none; margin-bottom:16px; }
        .step-item {
          font-size:11.5px; color:var(--text); padding:6px 0;
          display:flex; align-items:flex-start; gap:10px; line-height:1.6;
        }
        .step-num {
          display:flex; align-items:center; justify-content:center;
          width:19px; height:19px; border-radius:50%; flex-shrink:0;
          background:rgba(0,229,255,.08); border:1px solid rgba(0,229,255,.18);
          font-size:9px; color:var(--cyan); font-weight:700; margin-top:1px;
        }
        .code-tag {
          display:inline-block;
          background:var(--bg3); border:1px solid rgba(0,229,255,.1);
          padding:2px 7px; border-radius:4px;
          font-family:'JetBrains Mono',monospace; font-size:10.5px;
          color:var(--yellow);
          word-break:break-all;
        }

        /* ── AMOUNT INPUT ── */
        .amount-wrap { position:relative; }
        .amount-prefix {
          position:absolute; left:13px; top:50%; transform:translateY(-50%);
          font-size:12px; color:var(--dim);
          font-family:'JetBrains Mono',monospace; pointer-events:none;
        }
        .amount-input {
          width:100%; background:var(--bg3); border:1px solid rgba(0,229,255,.1);
          border-radius:var(--r2); padding:12px 14px 12px 40px;
          color:white; font-family:'JetBrains Mono',monospace; font-size:15px;
          outline:none; transition:border-color .2s, background .2s;
          -moz-appearance:textfield;
        }
        .amount-input::-webkit-outer-spin-button,
        .amount-input::-webkit-inner-spin-button { -webkit-appearance:none; }
        .amount-input:focus { border-color:var(--cyan2); }
        .amount-input.valid { border-color:var(--green); background:rgba(0,255,163,.04); }
        .amount-input.close { border-color:var(--yellow); background:rgba(251,191,36,.04); }
        .amount-input.invalid { border-color:var(--pink); background:rgba(244,63,94,.04); }
        .amount-feedback { font-size:10.5px; margin-top:8px; min-height:18px; display:flex; align-items:center; gap:6px; }
        .amount-verify-box {
          background:rgba(0,229,255,.025); border:1px solid rgba(0,229,255,.1);
          border-radius:var(--r2); padding:14px;
        }
        .amount-verify-label { font-size:10.5px; color:var(--dim); margin-bottom:10px; display:block; }
        .warning-box {
          background:rgba(251,191,36,.04); border:1px solid rgba(251,191,36,.18);
          border-radius:var(--r2); padding:13px 14px;
          font-size:10.5px; color:var(--yellow); line-height:1.75;
          display:flex; gap:9px; align-items:flex-start; margin-top:16px;
        }

        /* ── BUTTONS ── */
        .btn-primary {
          width:100%; padding:15px;
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          border:none; border-radius:var(--r);
          color:white; font-family:'Orbitron',sans-serif; font-size:10.5px; font-weight:700;
          cursor:pointer; transition:.2s; letter-spacing:1px;
          display:flex; align-items:center; justify-content:center; gap:8px;
          text-align:center;
        }
        .btn-primary:hover:not(:disabled) {
          transform:translateY(-2px);
          box-shadow:0 8px 32px rgba(0,229,255,.25);
        }
        .btn-primary:disabled { opacity:.28; cursor:not-allowed; transform:none; }
        .btn-secondary {
          background:transparent; border:1px solid rgba(0,229,255,.1);
          color:var(--dim2); font-family:'JetBrains Mono',monospace;
          font-size:11px; padding:13px; border-radius:var(--r);
          cursor:pointer; transition:.18s; letter-spacing:.5px; width:100%;
        }
        .btn-secondary:hover { color:var(--cyan); border-color:var(--cyan2); background:var(--cyan3); }
        .btn-row { display:flex; gap:10px; }

        /* ── CONFIRMED ── */
        .confirmed-check {
          display:inline-flex; align-items:center; justify-content:center;
          width:80px; height:80px; border-radius:50%;
          background:rgba(0,255,163,.07); border:2px solid rgba(0,255,163,.28);
          margin-bottom:22px;
          box-shadow:0 0 48px rgba(0,255,163,.12);
          animation:successPop .55s cubic-bezier(.34,1.56,.64,1) both;
        }
        .confirmed-title {
          font-family:'Orbitron',sans-serif; font-size:clamp(17px, 5vw, 21px);
          color:var(--green); margin-bottom:14px; letter-spacing:1px;
        }
        .confirmed-desc {
          color:var(--dim2); font-size:12px; line-height:1.9; margin-bottom:12px;
          padding:0 8px;
        }
        .tx-badge {
          display:inline-block; background:var(--bg2);
          border:1px solid rgba(0,229,255,.1); border-radius:var(--r2);
          padding:6px 16px; font-size:10.5px; color:var(--dim2);
          font-family:'JetBrains Mono',monospace; margin-bottom:26px;
          word-break:break-all; max-width:100%;
        }
        .tx-badge span { color:var(--yellow); }
        .contact-block {
          color:var(--text); font-size:11.5px; margin-bottom:32px; line-height:2;
        }
        .contact-block a { color:var(--cyan); text-decoration:none; word-break:break-all; }
        .contact-block a:hover { text-decoration:underline; }

        /* ── RESPONSIVE: TABLET ── */
        @media(max-width:768px) {
          .main { padding:28px 16px 80px; }
        }

        /* ── RESPONSIVE: MOBILE ── */
        @media(max-width:480px) {
          .main { padding:20px 12px 72px; }
          .nav { padding:0 12px; height:52px; }
          .nav-logo { font-size:12px; letter-spacing:1px; }
          .nav-back span { display:none; }
          .nav-back { padding:8px; border-radius:50%; }
          .nav-back svg { width:13px; height:13px; }
          .hero { margin-bottom:24px; }
          .hero-icon-wrap { width:54px; height:54px; margin-bottom:12px; }
          .hero-icon-wrap span { font-size:28px; }
          .user-card { padding:12px 14px; margin-bottom:22px; }
          .user-av { width:38px; height:38px; }
          .plans { gap:8px; }
          .plan-card { padding:14px 10px; }
          .plan-feature-item { font-size:9.5px; }
          .packs { gap:8px; }
          .pack-card { padding:14px 8px; }
          .pay-methods { gap:8px; }
          .pay-card { padding:12px 8px; }
          .pay-icon-wrap { width:40px; height:40px; }
          .pay-icon { width:36px; height:36px; }
          .pay-label { font-size:11.5px; }
          .pay-sub { font-size:8.5px; }
          .order-box, .pay-instruction { padding:14px; }
          .inst-num { font-size:15px; letter-spacing:1px; }
          .step-item { font-size:10.5px; gap:8px; }
          .btn-row { flex-direction:column; }
          .btn-row .btn-secondary { order:2; }
          .btn-row .btn-primary { order:1; }
        }

        @media(max-width:360px) {
          .plans, .packs, .pay-methods { grid-template-columns:1fr; }
          .pro-hot { top:8px; right:8px; }
        }

        /* Respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration:0.01ms !important;
            animation-iteration-count:1 !important;
            transition-duration:0.01ms !important;
          }
        }

        /* Visible keyboard focus */
        button:focus-visible, input:focus-visible, a:focus-visible, [onClick]:focus-visible {
          outline:2px solid var(--cyan);
          outline-offset:2px;
        }
      `}</style>

      <div className="scanlines" />

      {/* ── NAV ── */}
      <nav className="nav">
        <a href="/dashboard" className="nav-logo">
          <div className="nav-logo-icon">
            <img
              src="/images/nexusai.png"
              alt="NEXUS"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          NEXUS AI
        </a>

        <div className="nav-center">
          <div className="nav-status-dot" />
          <span className="nav-status-text">LIVE</span>
        </div>

        <button className="nav-back" onClick={handleBack} aria-label="Go back">
          <svg viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back</span>
        </button>
      </nav>

      <div className="main">
        {/* ── HERO ── */}
        <div className="hero">
          <div className="hero-icon-wrap">
            <span style={{ fontSize: 32 }}>⚡</span>
          </div>
          <div className="hero-title">Get Credits</div>
          <div className="hero-sub">
            Power up your AI experience <span>// NEXUS STORE</span>
          </div>
        </div>

        {/* ── STEPS ── */}
        {view !== 4 && <StepsBar current={view} />}

        {/* ── USER CARD ── */}
        <div className="user-card">
          <img
            className="user-av"
            src={avatarUrl}
            alt="avatar"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/images/nexusai.png";
            }}
          />
          <div className="user-info">
            <div className="user-name">@{username}</div>
            <div className="user-credits">
              Balance: <span>{credits}</span> CR
            </div>
          </div>
          <div
            className="plan-pill"
            style={{
              color: planStyle.color,
              background: planStyle.bg,
              border: `1px solid ${planStyle.border}`,
            }}
          >
            {plan}
          </div>
        </div>

        {/* ══════════════════════════════════════════
            VIEW 1 — SELECT PACKAGE
        ══════════════════════════════════════════ */}
        {view === 1 && (
          <div style={{ animation: "fadeUp .35s cubic-bezier(.16,1,.3,1) both" }}>
            <div className="sec-title">Subscription Plans</div>
            <div className="plans">
              {/* FREE */}
              <div
                className="plan-card"
                onClick={() => showToast("You're already on the Free plan!", "var(--green)")}
              >
                <div className="plan-tier" style={{ color: "var(--green)" }}>FREE</div>
                <div className="plan-price">$0</div>
                <div className="plan-freq">/month — Forever free</div>
                <div className="plan-usd" style={{ color: "var(--green)" }}>IDR 0</div>
                <ul className="plan-features">
                  {[
                    { bullet: "✦", text: "30 CR on signup", dim: false },
                    { bullet: "✦", text: "+2 CR daily", dim: false },
                    { bullet: "✦", text: "Gemini Flash Lite", dim: false },
                    { bullet: "—", text: "Premium models", dim: true },
                    { bullet: "—", text: "Priority support", dim: true },
                  ].map(({ bullet, text, dim }) => (
                    <li
                      key={text}
                      className="plan-feature-item"
                      style={{ color: dim ? "var(--dim)" : "var(--text)" }}
                    >
                      <span className="feature-bullet">{bullet}</span>
                      {text}
                    </li>
                  ))}
                </ul>
                <button className="plan-btn plan-btn-free" disabled>
                  Currently Active
                </button>
              </div>

              {/* PRO */}
              <div
                className={`plan-card${sel.pack === "pro-plan" ? " selected" : ""}`}
                onClick={selectProPlan}
              >
                <span className="pro-hot">HOT 🔥</span>
                <div className="plan-tier" style={{ color: "var(--cyan)" }}>PRO</div>
                <div className="plan-price">Rp 150K</div>
                <div className="plan-freq">/month · OVO / DANA</div>
                <div className="plan-usd" style={{ color: "var(--cyan)" }}>≈ $9.38 USD</div>
                <ul className="plan-features">
                  {[
                    "200 CR instantly",
                    "+25 CR daily",
                    "All AI models",
                    "Priority support",
                    "Exclusive features",
                    "Custom AI personality",
                  ].map((text) => (
                    <li key={text} className="plan-feature-item" style={{ color: "var(--text)" }}>
                      <span className="feature-bullet">✦</span>
                      {text}
                    </li>
                  ))}
                </ul>
                <button className="plan-btn plan-btn-pro">
                  {sel.pack === "pro-plan" ? "✓ Selected" : "Subscribe Pro"}
                </button>
              </div>
            </div>

            <div className="sec-title">One-Time Credit Packs</div>
            <div className="packs">
              {(
                [
                  { id: "50",  cr: 50,  price: 38000,   usd: 2.38,  sub: "STARTER", val: "Rp 760 / CR",  popular: false },
                  { id: "80",  cr: 80,  price: 50000,   usd: 3.13,  sub: "POPULAR", val: "Rp 625 / CR",  popular: true  },
                  { id: "150", cr: 150, price: 120000,  usd: 7.50,  sub: "PRO",     val: "Rp 800 / CR",  popular: false },
                  { id: "500", cr: 500, price: 1500000, usd: 93.75, sub: "MEGA",    val: "Rp 3K / CR",   popular: false },
                ] as const
              ).map((p) => (
                <div
                  key={p.id}
                  className={`pack-card${sel.pack === p.id ? " selected" : ""}`}
                  onClick={() =>
                    selectPack(p.id, p.cr, p.price, p.usd, `${p.cr} CR — ${p.sub}`)
                  }
                >
                  {p.popular && <div className="pack-popular-tag">POPULAR</div>}
                  <div className="pack-cr">{p.cr}</div>
                  <div className="pack-sub">CREDITS · {p.sub}</div>
                  <div className="pack-price">{formatIdr(p.price)}</div>
                  <div className="pack-usd">≈ ${p.usd.toFixed(2)} USD</div>
                  <div className="pack-val">{p.val}</div>
                </div>
              ))}
            </div>

            <button className="btn-primary" disabled={!sel.pack} onClick={goToPayment}>
              <span>Continue to Payment</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════
            VIEW 2 — PAYMENT METHOD
        ══════════════════════════════════════════ */}
        {view === 2 && (
          <div style={{ animation: "fadeUp .35s cubic-bezier(.16,1,.3,1) both" }}>
            <div className="sec-title">Select Payment Method</div>
            <div className="pay-methods">
              {(["ovo", "dana"] as PayMethod[]).filter(Boolean).map((m) => {
                const isOvo = m === "ovo";
                const selected = sel.method === m;
                return (
                  <div
                    key={m!}
                    className={`pay-card${selected ? " selected" : ""}`}
                    onClick={() => selectMethod(m)}
                  >
                    <div
                      className="pay-radio"
                      style={{
                        border: `1.5px solid ${selected ? "var(--cyan)" : "var(--dim)"}`,
                        background: selected ? "var(--cyan)" : "transparent",
                        boxShadow: selected ? "0 0 10px rgba(0,229,255,.4)" : "none",
                      }}
                    >
                      {selected && <div className="pay-radio-dot" />}
                    </div>
                    <div className="pay-icon-wrap">
                      <img
                        className="pay-icon"
                        src={`/images/${m}.png`}
                        alt={isOvo ? "OVO" : "DANA"}
                        onError={(e) => {
                          const el = e.target as HTMLImageElement;
                          el.style.display = "none";
                          const parent = el.parentElement!;
                          parent.style.background = isOvo
                            ? "linear-gradient(135deg,#4C2D91,#7E5AC8)"
                            : "linear-gradient(135deg,#118EEA,#47B4F5)";
                          parent.style.color = "white";
                          parent.style.fontFamily = "Orbitron,sans-serif";
                          parent.style.fontWeight = "900";
                          parent.style.fontSize = "11px";
                          parent.innerText = isOvo ? "OVO" : "DANA";
                        }}
                      />
                    </div>
                    <div>
                      <div className="pay-label">{isOvo ? "OVO" : "DANA"}</div>
                      <div className="pay-sub">Transfer via {isOvo ? "OVO" : "DANA"}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Order summary */}
            <div className="order-box">
              <div className="sec-title" style={{ marginBottom: 12 }}>Order Summary</div>
              {[
                { label: "Package", val: sel.label || "—", valStyle: {} },
                { label: "Credits", val: sel.cr ? `${sel.cr} CR` : "—", valStyle: { color: "var(--yellow)", fontFamily: "JetBrains Mono,monospace", fontWeight: 700 } },
                { label: "Method", val: sel.method ? (sel.method === "ovo" ? "OVO" : "DANA") : "—", valStyle: {} },
              ].map((row) => (
                <div key={row.label} className="order-row">
                  <span className="order-label">{row.label}</span>
                  <span className="order-val" style={row.valStyle}>{row.val}</span>
                </div>
              ))}
              <div className="order-row" style={{ borderTop: "1px solid rgba(0,229,255,.1)", marginTop: 8, paddingTop: 14 }}>
                <span className="order-total-label">Total</span>
                <div style={{ textAlign: "right" }}>
                  <div className="order-total-val">{sel.priceStr || "—"}</div>
                  {sel.usd > 0 && (
                    <div className="order-total-usd">≈ ${sel.usd.toFixed(2)} USD</div>
                  )}
                </div>
              </div>
            </div>

            <div className="btn-row">
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => goToView(1)}>
                ← Back
              </button>
              <button className="btn-primary" style={{ flex: 2 }} disabled={!sel.method} onClick={showPayInst}>
                <span>View Instructions</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            VIEW 3 — TRANSFER INSTRUCTIONS
        ══════════════════════════════════════════ */}
        {view === 3 && (
          <div style={{ animation: "fadeUp .35s cubic-bezier(.16,1,.3,1) both" }}>
            <div className="sec-title">Transfer Instructions</div>

            <div className="pay-instruction">
              {/* Header */}
              <div className="inst-method-hdr">
                <div className="inst-method-badge">{methodLabel}</div>
                <div className="inst-method-title">Transfer to {methodLabel}</div>
                <div className="inst-owner">{ownerName}</div>
              </div>

              {/* Account number */}
              <div className="inst-number-box" onClick={copyNumber}>
                <div>
                  <div className="inst-num-label">ACCOUNT NUMBER</div>
                  <div className="inst-num">
                    {methodNum || "(not configured)"}
                  </div>
                </div>
                <div className="inst-copy-hint">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  TAP TO COPY
                </div>
              </div>

              {/* Step list */}
              <ul className="step-list">
                {[
                  <>Open your <strong style={{ color: "white" }}>{methodLabel}</strong> app</>,
                  <>Tap <strong style={{ color: "white" }}>Transfer</strong> and enter the number above</>,
                  <>Enter the exact amount: <span className="code-tag">{sel.priceStr}</span></>,
                  <>
                    In <strong style={{ color: "white" }}>notes / memo</strong>, write exactly:{" "}
                    <span className="code-tag">{noteVal}</span>
                  </>,
                  <>Complete and confirm the transfer</>,
                  <>Take a <strong style={{ color: "white" }}>screenshot</strong> of the receipt</>,
                  <>Enter the transfer amount below to verify</>,
                ].map((step, i) => (
                  <li key={i} className="step-item">
                    <div className="step-num">{i + 1}</div>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>

              {/* Amount verification */}
              <div className="amount-verify-box">
                <span className="amount-verify-label">
                  Enter the exact amount you transferred (IDR) to verify:
                </span>
                <div className="amount-wrap">
                  <span className="amount-prefix">Rp</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    className={`amount-input${
                      amountStatus === "valid"
                        ? " valid"
                        : amountStatus === "close"
                        ? " close"
                        : amountStatus === "invalid"
                        ? " invalid"
                        : ""
                    }`}
                    placeholder={`e.g. ${sel.price}`}
                    value={confirmAmount}
                    onChange={(e) => validateAmount(e.target.value)}
                  />
                </div>
                <div className="amount-feedback">
                  {amountStatus === "valid" && (
                    <span style={{ color: "var(--green)" }}>✅ Amount matches — you can now confirm!</span>
                  )}
                  {amountStatus === "close" && (
                    <span style={{ color: "var(--yellow)" }}>
                      ⚠️ Close but not exact. Expected: {formatIdr(sel.price)}
                    </span>
                  )}
                  {amountStatus === "invalid" && (
                    <span style={{ color: "var(--pink)" }}>
                      ❌ Doesn&apos;t match. Expected: {formatIdr(sel.price)}
                    </span>
                  )}
                </div>
              </div>

              <div className="warning-box">
                <span style={{ flexShrink: 0 }}>⚠️</span>
                <span>
                  Credits are added within <strong style={{ color: "white" }}>1–24 hours</strong> after
                  manual verification. Keep your payment screenshot as proof. If you don&apos;t receive
                  credits after 24 hours, email{" "}
                  <strong style={{ color: "var(--cyan)" }}>arifiinytid@gmail.com</strong> with the
                  screenshot and your username.
                </span>
              </div>
            </div>

            {/* Summary */}
            <div className="order-box">
              <div className="order-row">
                <span className="order-label">Package</span>
                <span className="order-val">{sel.label}</span>
              </div>
              <div
                className="order-row"
                style={{
                  borderTop: "1px solid rgba(0,229,255,.1)",
                  marginTop: 8,
                  paddingTop: 14,
                }}
              >
                <span className="order-total-label">Total to Pay</span>
                <div style={{ textAlign: "right" }}>
                  <div className="order-total-val">{sel.priceStr}</div>
                  {sel.usd > 0 && (
                    <div className="order-total-usd">≈ ${sel.usd.toFixed(2)} USD</div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                className="btn-primary"
                disabled={amountStatus !== "valid" || submitting}
                onClick={confirmPayment}
              >
                {submitting ? (
                  <>
                    <div
                      style={{
                        width: 14, height: 14, borderRadius: "50%",
                        border: "2px solid rgba(255,255,255,.2)",
                        borderTopColor: "white",
                        animation: "spin .7s linear infinite",
                      }}
                    />
                    Submitting...
                  </>
                ) : (
                  "✅ I Have Transferred — Confirm Payment"
                )}
              </button>
              <button className="btn-secondary" onClick={() => goToView(2)}>
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            VIEW 4 — CONFIRMED
        ══════════════════════════════════════════ */}
        {view === 4 && (
          <div
            style={{
              textAlign: "center",
              padding: "44px 0",
              animation: "fadeUp .45s cubic-bezier(.16,1,.3,1) both",
            }}
          >
            <div className="confirmed-check">
              <span style={{ fontSize: 40 }}>✅</span>
            </div>
            <div className="confirmed-title">Payment Submitted!</div>
            <p className="confirmed-desc">
              Your payment has been received and is pending verification.
              <br />
              Credits will be added to your account within{" "}
              <strong style={{ color: "white" }}>1–24 hours</strong>.
            </p>
            <div className="tx-badge">
              Transaction ID: <span>{txId}</span>
            </div>
            <div className="contact-block">
              Questions? Contact us at:
              <br />
              <a href="mailto:arifiinytid@gmail.com">arifiinytid@gmail.com</a>
              <br />
              Discord:{" "}
              <a href="https://discord.gg/HuGtbRvD" target="_blank" rel="noopener noreferrer">
                discord.gg/HuGtbRvD
              </a>
            </div>
            <button
              className="btn-primary"
              style={{ maxWidth: 340, margin: "0 auto" }}
              onClick={() => {
                window.location.href = "/dashboard";
              }}
            >
              ← Back to Dashboard
            </button>
          </div>
        )}
      </div>

      <Toast toast={toast} />
    </>
  );
}