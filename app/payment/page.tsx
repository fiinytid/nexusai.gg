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
}
interface NexusSession {
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
  return "NX-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ toast }: { toast: ToastState }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        background: "var(--bg3)",
        border: "1px solid rgba(0,229,255,.15)",
        borderRadius: 12,
        padding: "12px 18px",
        fontSize: 12,
        lineHeight: 1.5,
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: 280,
        backdropFilter: "blur(20px)",
        transform: toast.visible ? "translateY(0)" : "translateY(16px)",
        opacity: toast.visible ? 1 : 0,
        transition: "0.3s cubic-bezier(.34,1.56,.64,1)",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: toast.color,
          boxShadow: `0 0 8px ${toast.color}`,
        }}
      />
      <span style={{ color: toast.color }}>{toast.msg}</span>
    </div>
  );
}

// ─── Steps Bar ───────────────────────────────────────────────────────────────

function StepsBar({ current }: { current: View }) {
  const steps = ["Select Package", "Payment Method", "Confirm Transfer"];
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {steps.map((_, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <div key={n} style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  border: `1.5px solid ${done ? "var(--green)" : active ? "var(--cyan)" : "var(--dim)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: done ? 14 : 11,
                  fontFamily: "Orbitron, sans-serif", fontWeight: 700,
                  color: done ? "var(--bg)" : active ? "var(--cyan)" : "var(--dim)",
                  background: done ? "var(--green)" : active ? "rgba(0,229,255,.08)" : "transparent",
                  boxShadow: active ? "0 0 0 4px rgba(0,229,255,.12), 0 0 20px rgba(0,229,255,.2)" : done ? "0 0 12px rgba(0,255,163,.3)" : "none",
                  transform: active ? "scale(1.1)" : "scale(1)",
                  transition: "0.4s cubic-bezier(.34,1.56,.64,1)",
                  flexShrink: 0,
                }}
              >
                {done ? "✓" : n}
              </div>
              {n < 3 && (
                <div
                  style={{
                    width: 80, height: 2,
                    background: n < current ? "var(--green)" : "rgba(0,229,255,.08)",
                    transition: "background 0.5s ease",
                    position: "relative",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex", justifyContent: "space-between",
          padding: "8px 4px 0",
          fontSize: 10, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.5px",
        }}
      >
        {steps.map((label, i) => {
          const n = i + 1;
          const color = n < current ? "var(--green)" : n === current ? "var(--cyan)" : "var(--dim)";
          return <span key={n} style={{ color }}>{label}</span>;
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PaymentPage() {
  // Session
  const [session, setSession] = useState<NexusSession | null>(null);
  const [displayName, setDisplayName] = useState("User");
  const [username, setUsername] = useState("user");
  const [avatarUrl, setAvatarUrl] = useState("/favicon.ico");
  const [credits, setCredits] = useState<string>("—");
  const [plan, setPlan] = useState("FREE");

  // Payment config
  const [ovoNumber, setOvoNumber] = useState("");
  const [danaNumber, setDanaNumber] = useState("");
  const [ownerName, setOwnerName] = useState("NEXUS STUDIO");

  // UI State
  const [view, setView] = useState<View>(1);
  const [toast, setToastState] = useState<ToastState>({ visible: false, msg: "", color: "var(--cyan)" });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selection
  const [sel, setSel] = useState<Selection>({
    pack: null, cr: 0, price: 0, usd: 0, priceStr: "", label: "", method: null,
  });

  // Step 3 state
  const [confirmAmount, setConfirmAmount] = useState("");
  const [amountStatus, setAmountStatus] = useState<"idle" | "valid" | "close" | "invalid">("idle");
  const [txId, setTxId] = useState("—");
  const [submitting, setSubmitting] = useState(false);

  // ── Load session ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem("nexus_session");
      if (raw) {
        const s: NexusSession = JSON.parse(raw);
        setSession(s);
        const u = s.user || {};
        setDisplayName(u.displayName || u.username || "User");
        setUsername(u.username || "user");
        setAvatarUrl(u.avatar || "/favicon.ico");
        const cr = s.data?.credits !== undefined ? parseFloat(String(s.data.credits)).toFixed(2) : "—";
        setCredits(cr);
        setPlan((s.data?.plan || "FREE").toUpperCase());
      }
    } catch { /* ignore */ }
  }, []);

  // ── Load payment config ──
  useEffect(() => {
    fetch("/api/payment")
      .then((r) => r.ok ? r.json() : null)
      .then((d: PaymentConfig | null) => {
        if (!d) return;
        if (d.ovo?.number) setOvoNumber(d.ovo.number);
        if (d.dana?.number) setDanaNumber(d.dana.number);
        if (d.owner) setOwnerName(d.owner);
      })
      .catch(() => { /* silent */ });
  }, []);

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
    else window.location.href = "/chats";
  };

  // ── Pack / Plan selection ──
  const clearPacks = () =>
    setSel((prev) => ({ ...prev, pack: null, cr: 0, price: 0, usd: 0, priceStr: "", label: "" }));

  const selectProPlan = () => {
    setSel({ pack: "pro-plan", cr: 200, price: 150000, usd: 9.38, priceStr: "Rp 150,000", label: "Pro Plan (Monthly) · 200 CR", method: sel.method });
    showToast("Pro Plan selected!", "var(--cyan)");
  };

  const selectPack = (cr: string, price: number, usd: number, label: string) => {
    setSel({ pack: cr, cr: parseInt(cr, 10), price, usd, priceStr: formatIdr(price), label, method: sel.method });
  };

  // ── Payment method ──
  const selectMethod = (m: PayMethod) => {
    setSel((prev) => ({ ...prev, method: m }));
  };

  // ── Step 2 → Step 3 ──
  const goToPayment = () => {
    if (!sel.pack) { showToast("Please select a package first.", "var(--pink)"); return; }
    goToView(2);
  };

  const showPayInst = () => {
    if (!sel.method) { showToast("Please select a payment method first.", "var(--pink)"); return; }
    setConfirmAmount("");
    setAmountStatus("idle");
    goToView(3);
  };

  // ── Amount validation ──
  const validateAmount = (val: string) => {
    setConfirmAmount(val);
    const amt = parseInt(val, 10);
    if (!val || !amt || amt <= 0) { setAmountStatus("idle"); return; }
    if (amt === sel.price) { setAmountStatus("valid"); }
    else if (Math.abs(amt - sel.price) < 1000) { setAmountStatus("close"); }
    else { setAmountStatus("invalid"); }
  };

  // ── Copy number ──
  const copyNumber = () => {
    const num = sel.method === "ovo" ? ovoNumber : danaNumber;
    if (!num) { showToast("Number not available.", "var(--pink)"); return; }
    navigator.clipboard?.writeText(num)
      .then(() => showToast("Number copied to clipboard!", "var(--green)"))
      .catch(() => showToast(num, "var(--cyan)"));
  };

  // ── Confirm payment ──
  const confirmPayment = async () => {
    if (!session?.user) { showToast("Session not found. Please log in again.", "var(--pink)"); return; }
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
      showToast("Network error: " + (e instanceof Error ? e.message : "Unknown"), "var(--pink)");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived ──
  const methodNum = sel.method === "ovo" ? ovoNumber : danaNumber;
  const noteVal = `NEXUS-${username}-${sel.cr}CR`;
  const methodLabel = sel.method === "ovo" ? "OVO" : sel.method === "dana" ? "DANA" : "—";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        html { scroll-behavior: smooth; }
        :root {
          --bg:      #020210;
          --bg2:     #05051a;
          --bg3:     #08082a;
          --bg4:     #0c0c30;
          --cyan:    #00e5ff;
          --cyan2:   rgba(0,229,255,.3);
          --cyan3:   rgba(0,229,255,.08);
          --purple:  #7c3aed;
          --purple2: rgba(124,58,237,.4);
          --pink:    #f43f5e;
          --green:   #00ffa3;
          --yellow:  #fbbf24;
          --orange:  #f97316;
          --text:    #a8b8e0;
          --dim:     #334068;
          --r:       12px;
          --r2:      8px;
        }
        body {
          min-height: 100vh;
          font-family: 'Space Grotesk', sans-serif;
          background: var(--bg);
          color: var(--text);
          font-size: 14px;
          overflow-x: hidden;
        }
        body::before {
          content:'';
          position:fixed; inset:0;
          background:
            linear-gradient(rgba(0,229,255,.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,229,255,.018) 1px, transparent 1px);
          background-size: 50px 50px;
          animation: gridShift 20s linear infinite;
          pointer-events:none; z-index:0;
        }
        @keyframes gridShift { to { background-position: 50px 50px; } }
        body::after {
          content:'';
          position:fixed;
          top:-30%; left:50%; transform:translateX(-50%);
          width:900px; height:600px;
          background: radial-gradient(ellipse, rgba(124,58,237,.12) 0%, transparent 60%);
          pointer-events:none; z-index:0;
        }

        .scanlines {
          position:fixed; inset:0; z-index:1;
          background: repeating-linear-gradient(
            0deg, transparent, transparent 2px,
            rgba(0,0,0,.03) 2px, rgba(0,0,0,.03) 4px
          );
          pointer-events:none;
        }

        /* NAV */
        .nav {
          position:sticky; top:0; z-index:200;
          display:flex; align-items:center; justify-content:space-between;
          padding:12px 24px;
          background: rgba(2,2,16,.88);
          border-bottom: 1px solid rgba(0,229,255,.1);
          backdrop-filter: blur(20px);
        }
        .nav-logo {
          font-family:'Orbitron',sans-serif;
          font-size:15px; font-weight:900;
          background: linear-gradient(135deg, var(--cyan), var(--purple));
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          text-decoration:none; letter-spacing:2px;
          animation: logoPulse 4s ease-in-out infinite;
        }
        @keyframes logoPulse {
          0%,100%{filter:drop-shadow(0 0 4px rgba(0,229,255,.4))}
          50%{filter:drop-shadow(0 0 12px rgba(0,229,255,.7))}
        }
        .nav-back {
          display:flex; align-items:center; gap:6px;
          color:var(--dim); font-size:11px;
          font-family:'JetBrains Mono',monospace;
          cursor:pointer; border:1px solid rgba(0,229,255,.1);
          background:transparent; padding:6px 14px; border-radius:20px;
          transition:.2s; letter-spacing:.5px;
        }
        .nav-back:hover { color:var(--cyan); border-color:var(--cyan2); background:var(--cyan3); }
        .nav-status {
          display:flex; align-items:center; gap:6px;
          font-size:10px; color:var(--dim); font-family:'JetBrains Mono',monospace;
        }
        .status-dot {
          width:6px; height:6px; border-radius:50%;
          background:var(--green);
          box-shadow:0 0 8px var(--green);
          animation: blink 2s ease-in-out infinite;
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }

        /* MAIN */
        .main {
          max-width:720px; margin:0 auto;
          padding:36px 20px 100px;
          position:relative; z-index:2;
        }

        /* HERO */
        .hero { text-align:center; margin-bottom:40px; animation: heroIn .6s cubic-bezier(.16,1,.3,1) both; }
        @keyframes heroIn { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:none} }
        .hero-icon-wrap {
          display:inline-flex; align-items:center; justify-content:center;
          width:72px; height:72px; border-radius:50%;
          background:linear-gradient(135deg,rgba(0,229,255,.15),rgba(124,58,237,.15));
          border:1px solid rgba(0,229,255,.25); margin-bottom:18px;
          box-shadow:0 0 30px rgba(0,229,255,.12),0 0 60px rgba(124,58,237,.08);
          animation: iconFloat 3s ease-in-out infinite;
        }
        @keyframes iconFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .hero-title {
          font-family:'Orbitron',sans-serif; font-size:28px; font-weight:900;
          background:linear-gradient(135deg,#fff 0%,var(--cyan) 50%,var(--purple) 100%);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          margin-bottom:8px; letter-spacing:1px;
        }
        .hero-sub { font-size:13px; color:var(--dim); font-family:'JetBrains Mono',monospace; letter-spacing:.5px; }
        .hero-sub span { color:var(--cyan); opacity:.7; }

        /* USER CARD */
        .user-card {
          display:flex; align-items:center; gap:14px;
          background:var(--bg2); border:1px solid rgba(0,229,255,.1);
          border-radius:var(--r); padding:14px 18px; margin-bottom:32px;
          animation: fadeUp .5s .15s cubic-bezier(.16,1,.3,1) both;
          position:relative; overflow:hidden;
        }
        .user-card::before {
          content:''; position:absolute; top:0; left:0; right:0; height:1px;
          background:linear-gradient(90deg,transparent,var(--cyan2),transparent);
        }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
        .user-av { width:44px; height:44px; border-radius:50%; border:2px solid var(--cyan2); object-fit:cover; flex-shrink:0; box-shadow:0 0 12px rgba(0,229,255,.2); }

        /* SEC TITLE */
        .sec-title {
          font-family:'Orbitron',sans-serif; font-size:9px; color:var(--dim);
          letter-spacing:3px; text-transform:uppercase;
          margin-bottom:16px; padding-bottom:10px;
          border-bottom:1px solid rgba(0,229,255,.06);
          display:flex; align-items:center; gap:10px;
        }
        .sec-title::before { content:''; width:18px; height:1.5px; background:linear-gradient(90deg,var(--cyan),transparent); }

        /* PLAN CARDS */
        .plans { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:32px; }
        .plan-card {
          background:var(--bg2); border:1px solid rgba(0,229,255,.08);
          border-radius:var(--r); padding:22px 18px;
          cursor:pointer; transition:.25s cubic-bezier(.34,1.56,.64,1);
          position:relative; overflow:hidden;
        }
        .plan-card::before {
          content:''; position:absolute; top:0; left:0; right:0;
          height:2px; background:transparent; transition:.3s;
        }
        .plan-card:hover { border-color:rgba(0,229,255,.2); transform:translateY(-3px); }
        .plan-card.selected { border-color:var(--cyan); box-shadow:0 0 30px rgba(0,229,255,.12); }
        .plan-card.selected::before { background:linear-gradient(90deg,var(--cyan),var(--purple)); }
        .pro-hot {
          position:absolute; top:12px; right:12px;
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          color:white; font-size:8px; font-family:'Orbitron',sans-serif;
          padding:3px 10px; border-radius:20px; font-weight:700; letter-spacing:1px;
          animation: hotPulse 2s ease-in-out infinite;
        }
        @keyframes hotPulse { 0%,100%{box-shadow:0 0 8px rgba(0,229,255,.3)} 50%{box-shadow:0 0 20px rgba(0,229,255,.6)} }
        .plan-btn {
          width:100%; padding:10px; margin-top:16px;
          border:none; border-radius:var(--r2);
          font-family:'Orbitron',sans-serif; font-size:9px; font-weight:700;
          cursor:pointer; letter-spacing:1.5px; transition:.2s;
        }
        .plan-btn.free-btn { background:rgba(0,255,163,.06); color:var(--green); border:1px solid rgba(0,255,163,.2); }
        .plan-btn.pro-btn { background:linear-gradient(135deg,var(--cyan),var(--purple)); color:white; box-shadow:0 4px 16px rgba(0,229,255,.2); }
        .plan-btn:disabled { opacity:.4; cursor:not-allowed; }

        /* PACKS */
        .packs { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-bottom:32px; }
        .pack-card {
          background:var(--bg2); border:1px solid rgba(0,229,255,.08);
          border-radius:var(--r); padding:20px 14px;
          cursor:pointer; transition:.25s cubic-bezier(.34,1.56,.64,1);
          text-align:center; position:relative; overflow:hidden;
        }
        .pack-card:hover { border-color:rgba(251,191,36,.2); transform:translateY(-3px); }
        .pack-card.selected { border-color:var(--yellow); box-shadow:0 0 24px rgba(251,191,36,.15); background:rgba(251,191,36,.04); }
        .pack-popular-tag {
          position:absolute; top:-1px; left:50%; transform:translateX(-50%);
          background:linear-gradient(135deg,var(--yellow),var(--orange));
          color:#000; font-size:7px; font-weight:800;
          padding:3px 12px; border-radius:0 0 8px 8px;
          font-family:'Orbitron',sans-serif; letter-spacing:1.5px;
        }

        /* PAY METHODS */
        .pay-methods { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:28px; }
        .pay-card {
          background:var(--bg2); border:1px solid rgba(0,229,255,.08);
          border-radius:var(--r); padding:16px;
          cursor:pointer; transition:.2s;
          display:flex; align-items:center; gap:12px; position:relative;
        }
        .pay-card:hover { border-color:rgba(0,229,255,.2); transform:translateY(-2px); }
        .pay-card.selected { border-color:var(--cyan); box-shadow:0 0 20px rgba(0,229,255,.1); background:rgba(0,229,255,.04); }
        .pay-icon-wrap { width:48px; height:48px; border-radius:var(--r2); background:white; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; }
        .pay-icon { width:44px; height:44px; object-fit:contain; }
        .pay-fallback { width:48px; height:48px; border-radius:var(--r2); display:flex; align-items:center; justify-content:center; font-family:'Orbitron',sans-serif; font-weight:900; font-size:12px; flex-shrink:0; }

        /* ORDER BOX */
        .order-box {
          background:var(--bg2); border:1px solid rgba(0,229,255,.1);
          border-radius:var(--r); padding:18px 20px; margin-bottom:22px;
          position:relative; overflow:hidden;
        }
        .order-box::before {
          content:''; position:absolute; top:0; left:0; right:0; height:1px;
          background:linear-gradient(90deg,transparent,var(--cyan2),transparent);
        }

        /* PAYMENT INSTRUCTION */
        .pay-instruction {
          background:linear-gradient(135deg,rgba(0,229,255,.03),rgba(124,58,237,.03));
          border:1px solid rgba(0,229,255,.15);
          border-radius:var(--r); padding:22px; margin-bottom:22px;
          position:relative;
        }
        .pay-instruction::before {
          content:''; position:absolute; top:0; left:0; right:0; height:1.5px;
          background:linear-gradient(90deg,var(--cyan),var(--purple));
        }
        .inst-number-box {
          background:var(--bg3); border:1px solid rgba(0,229,255,.1);
          border-radius:var(--r2); padding:14px 16px; margin-bottom:20px;
          cursor:pointer; transition:.2s; position:relative; overflow:hidden;
          display:flex; align-items:center; justify-content:space-between;
        }
        .inst-number-box:hover { border-color:var(--cyan2); background:var(--bg4); }

        /* AMOUNT INPUT */
        .amount-input {
          width:100%; background:var(--bg3); border:1px solid rgba(0,229,255,.1);
          border-radius:var(--r2); padding:10px 12px 10px 40px;
          color:white; font-family:'JetBrains Mono',monospace; font-size:15px;
          outline:none; transition:border-color .2s;
          -moz-appearance:textfield;
        }
        .amount-input::-webkit-outer-spin-button,
        .amount-input::-webkit-inner-spin-button { -webkit-appearance:none; }
        .amount-input:focus { border-color:var(--cyan2); }
        .amount-input.valid { border-color:var(--green); background:rgba(0,255,163,.04); }
        .amount-input.invalid { border-color:var(--pink); background:rgba(244,63,94,.04); }
        .amount-input.close { border-color:var(--yellow); background:rgba(251,191,36,.04); }

        /* BUTTONS */
        .btn-primary {
          width:100%; padding:15px;
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          border:none; border-radius:var(--r);
          color:white; font-family:'Orbitron',sans-serif; font-size:11px; font-weight:700;
          cursor:pointer; transition:.2s; letter-spacing:1.5px; position:relative; overflow:hidden;
        }
        .btn-primary:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 8px 28px rgba(0,229,255,.25); }
        .btn-primary:active:not(:disabled) { transform:translateY(0); }
        .btn-primary:disabled { opacity:.3; cursor:not-allowed; }
        .btn-secondary {
          background:transparent; border:1px solid rgba(0,229,255,.12);
          color:var(--dim); font-family:'JetBrains Mono',monospace;
          font-size:11px; padding:12px; border-radius:var(--r);
          cursor:pointer; transition:.2s; letter-spacing:.5px;
          width:100%;
        }
        .btn-secondary:hover { color:var(--cyan); border-color:var(--cyan2); background:var(--cyan3); }

        /* CONFIRMED */
        @keyframes successPop { from{transform:scale(.5);opacity:0} to{transform:scale(1);opacity:1} }

        @media(max-width:500px) {
          .main { padding:24px 14px 80px; }
          .hero-title { font-size:22px; }
          .plans,.packs,.pay-methods { grid-template-columns:1fr 1fr; }
          .plan-price { font-size:20px; }
        }
      `}</style>

      <div className="scanlines" />

      {/* NAV */}
      <nav className="nav">
        <a href="/chats" className="nav-logo">NEXUS AI</a>
        <div className="nav-status">
          <div className="status-dot" />
          <span>LIVE</span>
        </div>
        <button className="nav-back" onClick={handleBack}>← Back</button>
      </nav>

      <div className="main">
        {/* HERO */}
        <div className="hero">
          <div className="hero-icon-wrap"><span style={{ fontSize: 34 }}>⭐</span></div>
          <div className="hero-title">Get Credits</div>
          <div className="hero-sub">
            Choose a package that suits your needs <span>// NEXUS STORE</span>
          </div>
        </div>

        {/* STEPS */}
        {view !== 4 && <StepsBar current={view} />}

        {/* USER CARD */}
        <div className="user-card">
          <img
            className="user-av"
            src={avatarUrl}
            alt="avatar"
            onError={(e) => { (e.target as HTMLImageElement).src = "/favicon.ico"; }}
          />
          <div>
            <div style={{ fontSize: 13, color: "white", fontWeight: 600 }}>@{username}</div>
            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 3 }}>
              Balance:{" "}
              <span style={{ color: "var(--yellow)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                {credits}
              </span>{" "}
              CR
            </div>
          </div>
          <div
            style={{
              marginLeft: "auto",
              background: plan !== "FREE" ? "rgba(0,229,255,.08)" : "rgba(0,255,163,.08)",
              border: `1px solid ${plan !== "FREE" ? "rgba(0,229,255,.3)" : "rgba(0,255,163,.2)"}`,
              borderRadius: 20,
              padding: "3px 12px",
              fontSize: 10,
              color: plan !== "FREE" ? "var(--cyan)" : "var(--green)",
              fontFamily: "JetBrains Mono, monospace",
              letterSpacing: 1,
            }}
          >
            {plan}
          </div>
        </div>

        {/* ═══════ VIEW 1: SELECT PACKAGE ═══════ */}
        {view === 1 && (
          <div style={{ animation: "fadeUp .35s cubic-bezier(.16,1,.3,1) both" }}>
            <div className="sec-title">Subscription Plans</div>
            <div className="plans">
              {/* FREE */}
              <div
                className="plan-card"
                onClick={() => showToast("You are already on the Free plan!", "var(--green)")}
              >
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 10, color: "var(--green)" }}>FREE</div>
                <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: 24, fontWeight: 900, color: "white", marginBottom: 2 }}>$0</div>
                <div style={{ fontSize: 10, color: "var(--dim)", fontFamily: "JetBrains Mono, monospace", marginBottom: 4 }}>/month — Forever free</div>
                <div style={{ fontSize: 10, color: "var(--cyan)", opacity: 0.6, marginBottom: 14 }}>IDR 0</div>
                <ul style={{ listStyle: "none" }}>
                  {[["✦", "30 CR on signup"], ["✦", "+2 CR daily"], ["✦", "Gemini Flash Lite"], ["—", "Premium models", true], ["—", "Priority support", true]].map(([icon, text, dim]) => (
                    <li key={String(text)} style={{ fontSize: 11, color: dim ? "var(--dim)" : "var(--text)", padding: "4px 0", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10 }}>{icon}</span>{text}
                    </li>
                  ))}
                </ul>
                <button className="plan-btn free-btn" disabled>Currently Active</button>
              </div>

              {/* PRO */}
              <div
                className={`plan-card${sel.pack === "pro-plan" ? " selected" : ""}`}
                onClick={selectProPlan}
              >
                <span className="pro-hot">HOT 🔥</span>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 10, color: "var(--cyan)" }}>PRO</div>
                <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: 24, fontWeight: 900, color: "white", marginBottom: 2 }}>Rp 150K</div>
                <div style={{ fontSize: 10, color: "var(--dim)", fontFamily: "JetBrains Mono, monospace", marginBottom: 4 }}>/month · Via OVO / DANA</div>
                <div style={{ fontSize: 10, color: "var(--cyan)", opacity: 0.6, marginBottom: 14 }}>≈ $9.38 USD</div>
                <ul style={{ listStyle: "none" }}>
                  {["200 CR instantly", "+25 CR daily (auto)", "All AI models", "Priority support", "Exclusive features", "Custom AI personality"].map((text) => (
                    <li key={text} style={{ fontSize: 11, color: "var(--text)", padding: "4px 0", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10 }}>✦</span>{text}
                    </li>
                  ))}
                </ul>
                <button className="plan-btn pro-btn">Subscribe Pro</button>
              </div>
            </div>

            <div className="sec-title">One-Time Credit Packs</div>
            <div className="packs">
              {([
                { id: "50",  cr: 50,  price: 38000,   usd: 2.38,  label: "50 CR — Starter",  sub: "STARTER",  val: "Rp 760 / credit",  popular: false },
                { id: "80",  cr: 80,  price: 50000,   usd: 3.13,  label: "80 CR — Popular",  sub: "POPULAR",  val: "Rp 625 / credit",  popular: true  },
                { id: "150", cr: 150, price: 120000,  usd: 7.50,  label: "150 CR — Pro",     sub: "PRO",      val: "Rp 800 / credit",  popular: false },
                { id: "500", cr: 500, price: 1500000, usd: 93.75, label: "500 CR — Mega",    sub: "MEGA",     val: "Rp 3,000 / credit",popular: false },
              ] as const).map((p) => (
                <div
                  key={p.id}
                  className={`pack-card${sel.pack === p.id ? " selected" : ""}`}
                  onClick={() => selectPack(p.id, p.price, p.usd, p.label)}
                >
                  {p.popular && <div className="pack-popular-tag">POPULAR</div>}
                  <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: 28, fontWeight: 900, color: "var(--yellow)", marginBottom: 2, lineHeight: 1 }}>{p.cr}</div>
                  <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 10, letterSpacing: 1 }}>CREDITS · {p.sub}</div>
                  <div style={{ fontSize: 14, color: "white", fontWeight: 700, marginBottom: 3 }}>{formatIdr(p.price)}</div>
                  <div style={{ fontSize: 10, color: "var(--text)", opacity: 0.6, fontFamily: "JetBrains Mono, monospace" }}>≈ ${p.usd.toFixed(2)} USD</div>
                  <div style={{ marginTop: 8, fontSize: 9, color: "var(--green)", fontFamily: "JetBrains Mono, monospace" }}>{p.val}</div>
                </div>
              ))}
            </div>

            <button className="btn-primary" disabled={!sel.pack} onClick={goToPayment}>
              Continue to Payment →
            </button>
          </div>
        )}

        {/* ═══════ VIEW 2: PAYMENT METHOD ═══════ */}
        {view === 2 && (
          <div style={{ animation: "fadeUp .35s cubic-bezier(.16,1,.3,1) both" }}>
            <div className="sec-title">Select Payment Method</div>
            <div className="pay-methods">
              {/* OVO */}
              <div className={`pay-card${sel.method === "ovo" ? " selected" : ""}`} onClick={() => selectMethod("ovo")}>
                <div className="pay-icon-wrap">
                  <img
                    className="pay-icon"
                    src="/ovo.png"
                    alt="OVO"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = "none";
                      el.parentElement!.style.background = "linear-gradient(135deg,#4C2D91,#7E5AC8)";
                      el.parentElement!.style.color = "white";
                      el.parentElement!.innerText = "OVO";
                      el.parentElement!.style.fontFamily = "Orbitron,sans-serif";
                      el.parentElement!.style.fontWeight = "900";
                      el.parentElement!.style.fontSize = "12px";
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>OVO</div>
                  <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>Transfer via OVO</div>
                </div>
                <div style={{
                  marginLeft: "auto", width: 20, height: 20, borderRadius: "50%",
                  border: `1.5px solid ${sel.method === "ovo" ? "var(--cyan)" : "var(--dim)"}`,
                  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: sel.method === "ovo" ? "var(--cyan)" : "transparent",
                  boxShadow: sel.method === "ovo" ? "0 0 8px rgba(0,229,255,.4)" : "none",
                  transition: ".2s",
                }}>
                  {sel.method === "ovo" && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#000" }} />}
                </div>
              </div>

              {/* DANA */}
              <div className={`pay-card${sel.method === "dana" ? " selected" : ""}`} onClick={() => selectMethod("dana")}>
                <div className="pay-icon-wrap">
                  <img
                    className="pay-icon"
                    src="/dana.png"
                    alt="DANA"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = "none";
                      el.parentElement!.style.background = "linear-gradient(135deg,#118EEA,#47B4F5)";
                      el.parentElement!.style.color = "white";
                      el.parentElement!.innerText = "DANA";
                      el.parentElement!.style.fontFamily = "Orbitron,sans-serif";
                      el.parentElement!.style.fontWeight = "900";
                      el.parentElement!.style.fontSize = "10px";
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>DANA</div>
                  <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>Transfer via DANA</div>
                </div>
                <div style={{
                  marginLeft: "auto", width: 20, height: 20, borderRadius: "50%",
                  border: `1.5px solid ${sel.method === "dana" ? "var(--cyan)" : "var(--dim)"}`,
                  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: sel.method === "dana" ? "var(--cyan)" : "transparent",
                  boxShadow: sel.method === "dana" ? "0 0 8px rgba(0,229,255,.4)" : "none",
                  transition: ".2s",
                }}>
                  {sel.method === "dana" && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#000" }} />}
                </div>
              </div>
            </div>

            {/* ORDER SUMMARY */}
            <div className="order-box">
              <div className="sec-title" style={{ marginBottom: 12 }}>Order Summary</div>
              {[
                { label: "Package", val: sel.label || "—", style: {} },
                { label: "Credits", val: sel.cr ? `${sel.cr} CR` : "—", style: { color: "var(--yellow)", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 } },
                { label: "Method", val: sel.method ? (sel.method === "ovo" ? "OVO" : "DANA") : "—", style: {} },
              ].map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: "1px solid rgba(0,229,255,.04)" }}>
                  <span style={{ fontSize: 12, color: "var(--dim)" }}>{r.label}</span>
                  <span style={{ fontSize: 12, color: "var(--text)", ...r.style }}>{r.val}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0 7px", borderTop: "1px solid rgba(0,229,255,.1)", marginTop: 8 }}>
                <span style={{ fontSize: 13, color: "white", fontWeight: 700 }}>Total</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: 18, color: "var(--yellow)", fontWeight: 700 }}>{sel.priceStr || "—"}</div>
                  <div style={{ fontSize: 10, color: "var(--dim)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>{sel.usd ? `≈ $${sel.usd.toFixed(2)} USD` : "—"}</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => goToView(1)}>← Back</button>
              <button className="btn-primary" style={{ flex: 2 }} disabled={!sel.method} onClick={showPayInst}>
                View Instructions →
              </button>
            </div>
          </div>
        )}

        {/* ═══════ VIEW 3: PAYMENT INSTRUCTION ═══════ */}
        {view === 3 && (
          <div style={{ animation: "fadeUp .35s cubic-bezier(.16,1,.3,1) both" }}>
            <div className="sec-title">Transfer Instructions</div>

            <div className="pay-instruction">
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{
                  padding: "4px 14px", borderRadius: 20,
                  fontFamily: "Orbitron, sans-serif", fontSize: 10, fontWeight: 700,
                  background: "linear-gradient(135deg, var(--cyan), var(--purple))",
                  color: "white", letterSpacing: 1,
                }}>{methodLabel}</div>
                <div style={{ fontSize: 11, color: "white", fontWeight: 600 }}>Transfer to {methodLabel}</div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginLeft: "auto" }}>{ownerName}</div>
              </div>

              {/* Number box */}
              <div className="inst-number-box" onClick={copyNumber}>
                <div>
                  <div style={{ fontSize: 9, color: "var(--dim)", fontFamily: "JetBrains Mono, monospace", letterSpacing: 1, marginBottom: 6 }}>ACCOUNT NUMBER</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "white", letterSpacing: 3, fontFamily: "JetBrains Mono, monospace" }}>
                    {methodNum || "(not configured)"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "var(--dim)", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.5px" }}>
                  📋 TAP TO COPY
                </div>
              </div>

              {/* Steps */}
              <ul style={{ listStyle: "none", marginBottom: 18 }}>
                {[
                  <>Open your <span style={{ color: "var(--cyan)", fontWeight: 600 }}>{methodLabel}</span> application</>,
                  <>Select <strong style={{ color: "white" }}>Transfer</strong> and enter the account number above</>,
                  <>Enter the exact amount: <span style={{ display: "inline-block", background: "var(--bg3)", border: "1px solid rgba(0,229,255,.1)", padding: "2px 8px", borderRadius: 4, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--yellow)" }}>{sel.priceStr}</span></>,
                  <>In the <strong style={{ color: "white" }}>notes / memo</strong> field, write exactly: <span style={{ display: "inline-block", background: "var(--bg3)", border: "1px solid rgba(0,229,255,.1)", padding: "2px 8px", borderRadius: 4, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--yellow)" }}>{noteVal}</span></>,
                  <>Complete and confirm the transfer</>,
                  <>Take a <strong style={{ color: "white" }}>screenshot</strong> of your payment receipt</>,
                  <>Enter the transfer amount below to verify and submit</>,
                ].map((step, i) => (
                  <li key={i} style={{ fontSize: 12, color: "var(--text)", padding: "5px 0", display: "flex", alignItems: "flex-start", gap: 10, lineHeight: 1.5 }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: "rgba(0,229,255,.1)", border: "1px solid rgba(0,229,255,.2)",
                      fontSize: 9, color: "var(--cyan)", fontWeight: 700, marginTop: 1,
                    }}>{i + 1}</div>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>

              {/* Amount verify */}
              <div style={{ background: "rgba(0,229,255,.03)", border: "1px solid rgba(0,229,255,.1)", borderRadius: "var(--r2)", padding: 14 }}>
                <label style={{ fontSize: 11, color: "var(--dim)", marginBottom: 8, display: "block" }}>
                  Enter the exact transfer amount (IDR) to verify:
                </label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--dim)", fontFamily: "JetBrains Mono, monospace", pointerEvents: "none" }}>Rp</span>
                  <input
                    type="number"
                    className={`amount-input${amountStatus === "valid" ? " valid" : amountStatus === "invalid" || amountStatus === "close" ? " invalid" : ""}`}
                    placeholder={`e.g. ${sel.price}`}
                    value={confirmAmount}
                    onChange={(e) => validateAmount(e.target.value)}
                  />
                </div>
                <div style={{ fontSize: 11, marginTop: 8, display: "flex", alignItems: "center", gap: 6, minHeight: 18 }}>
                  {amountStatus === "valid" && <span style={{ color: "var(--green)" }}>✅ Amount matches! You can now confirm.</span>}
                  {amountStatus === "close" && <span style={{ color: "var(--yellow)" }}>⚠️ Close but not exact. Expected: {formatIdr(sel.price)}</span>}
                  {amountStatus === "invalid" && <span style={{ color: "var(--pink)" }}>❌ Does not match. Expected: {formatIdr(sel.price)}</span>}
                </div>
              </div>

              <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(251,191,36,.04)", border: "1px solid rgba(251,191,36,.18)", borderRadius: "var(--r2)", fontSize: 11, color: "var(--yellow)", lineHeight: 1.7, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span>⚠️</span>
                <span>Credits will be added within <strong>1–24 hours</strong> after payment verification. Keep your payment screenshot as proof.</span>
              </div>
            </div>

            {/* Summary */}
            <div className="order-box">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0" }}>
                <span style={{ fontSize: 12, color: "var(--dim)" }}>Package</span>
                <span style={{ fontSize: 12, color: "var(--text)" }}>{sel.label}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0 7px", borderTop: "1px solid rgba(0,229,255,.1)", marginTop: 8 }}>
                <span style={{ fontSize: 13, color: "white", fontWeight: 700 }}>Total to Pay</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: 18, color: "var(--yellow)", fontWeight: 700 }}>{sel.priceStr}</div>
                  <div style={{ fontSize: 10, color: "var(--dim)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>≈ ${sel.usd.toFixed(2)} USD</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                className="btn-primary"
                disabled={amountStatus !== "valid" || submitting}
                onClick={confirmPayment}
              >
                {submitting ? "⏳ Submitting…" : "✅ I Have Transferred — Confirm Payment"}
              </button>
              <button className="btn-secondary" onClick={() => goToView(2)}>← Back</button>
            </div>
          </div>
        )}

        {/* ═══════ VIEW 4: CONFIRMED ═══════ */}
        {view === 4 && (
          <div style={{ textAlign: "center", padding: "56px 0", animation: "fadeUp .4s cubic-bezier(.16,1,.3,1) both" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 88, height: 88, borderRadius: "50%",
              background: "rgba(0,255,163,.08)", border: "2px solid rgba(0,255,163,.3)",
              marginBottom: 24,
              animation: "successPop .5s cubic-bezier(.34,1.56,.64,1) both",
              boxShadow: "0 0 40px rgba(0,255,163,.15)",
            }}>
              <span style={{ fontSize: 44 }}>✅</span>
            </div>
            <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: 20, color: "var(--green)", marginBottom: 14, letterSpacing: 1 }}>
              Payment Submitted!
            </div>
            <p style={{ color: "var(--dim)", fontSize: 12, lineHeight: 1.9, marginBottom: 10 }}>
              Your payment has been received and is pending verification.<br />
              Credits will be added to your account within <strong style={{ color: "white" }}>1–24 hours</strong>.
            </p>
            <div style={{
              display: "inline-block", background: "var(--bg2)",
              border: "1px solid rgba(0,229,255,.1)", borderRadius: "var(--r2)",
              padding: "6px 18px", fontSize: 11, color: "var(--dim)",
              fontFamily: "JetBrains Mono, monospace", marginBottom: 28,
            }}>
              Transaction ID: <span style={{ color: "var(--yellow)" }}>{txId}</span>
            </div>
            <p style={{ color: "var(--text)", fontSize: 12, marginBottom: 36, lineHeight: 1.9 }}>
              For inquiries, contact us at:<br />
              <strong style={{ color: "var(--cyan)" }}>arifiinytid@gmail.com</strong><br />
              Discord: <strong style={{ color: "var(--cyan)" }}>discord.gg/HuGtbRvD</strong>
            </p>
            <button
              className="btn-primary"
              style={{ maxWidth: 340, margin: "0 auto" }}
              onClick={() => { window.location.href = "/chats"; }}
            >
              ← Back to NEXUS AI
            </button>
          </div>
        )}
      </div>

      <Toast toast={toast} />
    </>
  );
}