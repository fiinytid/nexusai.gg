"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Session {
  user?: {
    displayName?: string;
    username?: string;
    avatar?: string;
  };
}

interface Message {
  id: string;
  role: "user" | "ai";
  text: string;
  time: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HINTS = [
  { icon: "🔌", text: "My Studio plugin shows Studio: OFF, how do I fix it?" },
  { icon: "💳", text: "I already paid but I still haven't received my credits" },
  { icon: "🤖", text: "How do I write better prompts to get good AI output?" },
  { icon: "⚠️", text: "The AI Chat is giving me incomplete or wrong results" },
  { icon: "🔑", text: "I can't log in to my account, what should I do?" },
  { icon: "🎟️", text: "My redeem code says it's invalid or already used" },
] as const;

const CODE_PATTERNS = [
  /\b(write|create|make|build|generate|code|give me|show me|provide|give)\b.{0,30}\b(script|code|lua|luau|function|module|localscript|serverscript|gui|frame|textbutton|textlabel|imagelabel|scrollingframe|game|npc|shop|leaderboard|datastore|admin|tween|remote|bindable|part|model|tool|weapon|system|handler)\b/i,
  /\b(fix|debug|complete|finish|improve|optimize|update|edit|modify|add to|continue)\b.{0,20}\b(this code|this script|my code|my script|the code|the script|lua|luau|function)\b/i,
  /\bcan you\b.{0,20}\b(code|program|script|write|make|create|build)\b/i,
  /```/,
  /\b(RemoteEvent|RemoteFunction|BindableEvent|LocalScript|ServerScript|ModuleScript|StarterGui|StarterPack|StarterPlayer|ReplicatedStorage|ServerScriptService|Workspace|Players\.LocalPlayer|game\.Players|game\.Workspace|script\.Parent|Instance\.new|TweenService|UserInputService|RunService|CollectionService|PhysicsService)\b/,
];

function isCodeRequest(text: string): boolean {
  return CODE_PATTERNS.some((p) => p.test(text));
}

function buildPromptTip(text: string): string {
  const match = text.match(
    /\b(loading screen|shop|npc|leaderboard|admin|gui|datastore|inventory|door|weapon|tool|game pass|vehicle|obby|pet|badge|timer|round system)\b/i
  );
  if (match) {
    return `Create a ${match[1]} system that [describe behavior, appearance, and any special logic you need].`;
  }
  return "Create a [describe what you want] with [specific details about behavior, appearance, and logic].";
}

function formatTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ─── Markdown renderer (lightweight, no deps) ────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic (em style)
    .replace(/\*(.+?)\*/g, '<em style="color:#00e5ff;font-style:normal">$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // HR
    .replace(/^---$/gm, '<hr/>')
    // Unordered list items
    .replace(/^\s*[-•]\s+(.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>[\s\S]+?<\/li>)(?!<li>)/g, '<ul>$1</ul>')
    // Line breaks → <br> (double newline = paragraph break)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    // Wrap in paragraph if not already block
    .replace(/^(?!<[hup]|<li|<blockquote|<hr)/, '<p>')
    .replace(/(?<!>)$/, '</p>')
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

// ─── Build system prompt ──────────────────────────────────────────────────────

function buildSystemPrompt(displayName: string, username: string): string {
  return `
You are NEXUS AI Support Agent — the official technical support assistant for NEXUS AI, an advanced Roblox Developer AI Assistant platform built by NEXUS STUDIO (FIINYTID25).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 CURRENT USER
  Display Name : ${displayName}
  Username     : @${username}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

═══════════════════════════════════════════════
🎯 IDENTITY & ROLE
═══════════════════════════════════════════════
You are a Tier-1 Support Agent. Your ONLY job is:
  • Troubleshooting platform issues
  • Guiding users through platform features
  • Helping users fix errors and configuration problems
  • Directing users to the right resource or escalation channel
  • Giving tips to improve prompts for better AI output

You are NOT a code-writing AI. The main NEXUS AI Chat at /chats handles code generation.
You must NEVER write, generate, complete, or explain Lua, Luau, or any programming code.
If a user asks you to write code or a script — even partially — ALWAYS redirect them to /chats.

═══════════════════════════════════════════════
🧠 PLATFORM KNOWLEDGE BASE
═══════════════════════════════════════════════

── CORE FEATURES ──
1. AI Chat (/chats)
   • Generates Lua/Luau scripts, debugs code, builds GUIs, creates full game systems
   • Available Models: Gemini 3.5 Flash, Mistral, Groq, DeepSeek, and more
   • Free users have access to basic models; Pro users unlock all models

2. GUI Editor
   • Drag-and-drop visual builder for Roblox interfaces (no coding required)
   • Outputs JSON commands injectable via the Studio Plugin
   • Recommended browser: Google Chrome (latest)

3. Studio Plugin
   • Injects AI-generated code and GUI JSON directly into Roblox Studio in real time
   • Install path: C:\\Users\\[YourName]\\AppData\\Local\\Roblox\\Plugins\\
   • Required Studio permissions: HTTP Requests + Script Injection
   • Status indicator: "Studio: ON" (green) = connected | "Studio: OFF" (red) = disconnected

── PAGES & NAVIGATION ──
  /chats      — Main AI Chat (code generation, debugging, scripts)
  /login.html — Login and registration
  /payment    — Credits purchase page
  /agent      — This support agent (current page)
  /settings   — Account settings, preferences, redeem code

── CREDITS SYSTEM ──
  Credits (CR) = platform currency; consumed per AI request

  Free Plan:
    • 30 CR granted on signup
    • +2 CR added automatically each day

  Pro Plan:
    • 200 CR granted on activation
    • +25 CR added automatically each day
    • All AI models unlocked (including premium models)

  One-Time Credit Packs:
    • 50 CR / 80 CR / 150 CR / 500 CR (purchased at /payment)

  Payment Methods: OVO & DANA (Indonesian e-wallets only)
  Code Redemption: Settings → Redeem Code

── COMMON ISSUES & STEP-BY-STEP SOLUTIONS ──

  [STUDIO PLUGIN — "Studio: OFF" / Not Connecting]
    1. Open Roblox Studio → File → Settings → Security
    2. Enable "Allow HTTP Requests" and "Allow Script Injection"
    3. Close and fully restart Roblox Studio
    4. Reload the NEXUS AI page and check the Studio status indicator
    5. If still OFF: uninstall the plugin file from the Plugins folder, re-download from NEXUS AI, restart Studio

  [CREDITS NOT RECEIVED AFTER PAYMENT]
    1. Wait up to 24 hours — payments are processed manually
    2. Take a screenshot of your payment proof
    3. Send payment proof + your username to: arifiinytid@gmail.com
    4. Join the Discord and post in the #payment-support channel

  [LOGIN / REGISTRATION ISSUES]
    1. Clear browser cache (Ctrl+Shift+Delete) and retry
    2. Try opening in an Incognito/Private window
    3. Check your email inbox/spam for a verification email
    4. If using a VPN, try disabling it
    5. Still failing? Contact support via email

  [AI CHAT — INCOMPLETE OR POOR OUTPUT]
    • Use a more detailed and specific prompt
    • Try switching to a more powerful model (e.g. Gemini 3.5 Flash)
    • Break large requests into smaller parts
    • Use the prompt improvement tips below

  [SLOW AI RESPONSE]
    • Switch to Gemini 3.5 Flash Lite (fastest model)
    • Check your internet connection
    • Avoid peak hours if possible
    • Try refreshing the page

  [GUI EDITOR — NOT SAVING / GLITCHY]
    • Use Google Chrome (other browsers may have compatibility issues)
    • Refresh the page and try again
    • Clear browser cache
    • Disable browser extensions that may interfere

  [REDEEM CODE NOT WORKING]
    • Go to Settings → Redeem Code
    • Make sure you copy the code exactly (no extra spaces)
    • Codes are case-sensitive and single-use
    • If expired or invalid, contact support

  [MODEL LOCKED / UNAVAILABLE]
    • Premium models require an active Pro Plan
    • Upgrade at /payment → Pro Plan

── PROMPT IMPROVEMENT TIPS ──
  BAD:  "make gui"
  GOOD: "Create a loading screen GUI with a centered title 'NEXUS', an animated progress bar from 0 to 100%, and a 'Loading…' label below it."

  BAD:  "npc follow"
  GOOD: "Make an NPC that follows the nearest player within 50 studs using a simple walk animation, and stops when it reaches 5 studs away."

  Always tell users: the more specific and descriptive the prompt, the better the output.

── SUPPORT CHANNELS ──
  • In-app Bug Report: Settings → Report Issue
  • Discord: discord.gg/HuGtbRvD
  • Email: arifiinytid@gmail.com
  • For payment/credits issues: always include payment screenshot + username in email

═══════════════════════════════════════════════
📏 STRICT BEHAVIORAL RULES
═══════════════════════════════════════════════

✅ YOU MUST:
  • Only answer questions related to the NEXUS AI platform
  • Provide clear, step-by-step solutions for technical issues
  • Address the user by name: ${displayName}
  • Always redirect code/script requests to /chats
  • Be patient and friendly — users may be beginners
  • Admit when you don't know something and direct to official support
  • Use bullet points for multi-step instructions
  • Bold important actions and key terms
  • Keep answers concise — lead with the solution, then explain

❌ YOU MUST NEVER:
  • Write, generate, complete, explain, or partially show any Lua, Luau, or other code
  • Generate scripts, GUIs, game systems, functions, or any code snippet — even as an "example"
  • Pretend to be a code-generating AI
  • Make up features, prices, or platform details not listed in this knowledge base
  • Answer questions unrelated to the NEXUS AI platform
  • Share personal opinions about other AI platforms or services

🚫 IF USER ASKS FOR CODE / SCRIPTS:
  Respond EXACTLY like this pattern:
  "I'm the Support Agent — I don't write code here. For that, head to the **[NEXUS AI Chat](/chats)** and ask the same question there! The AI will write it for you and you can inject it straight into Roblox Studio. 🚀
  
  **Prompt tip:** Be specific! For example: '[describe what the user wants in detail as a better prompt example]'"

💬 TONE & FORMAT:
  • Professional but warm and approachable
  • Short, scannable responses — avoid walls of text
  • Use **bold** for actions, page names, and key terms
  • Use bullet lists for steps or options
  • Use > blockquotes for prompt examples
  • End with a friendly closing line or offer to help further
  • If issue is resolved, celebrate with the user! 🎉
`.trim();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="msg-row ai">
      <div className="avatar ai-avatar">
        <img src="/favicon.ico" alt="NEXUS" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <span className="avatar-fallback">N</span>
      </div>
      <div className="typing-bubble">
        <span className="dot" style={{ animationDelay: "0s" }} />
        <span className="dot" style={{ animationDelay: "0.22s" }} />
        <span className="dot" style={{ animationDelay: "0.44s" }} />
      </div>
      <style>{`
        .typing-bubble {
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 2px 10px 10px 10px;
          padding: 12px 16px;
          display: flex;
          gap: 5px;
          align-items: center;
        }
        .dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--cyan);
          animation: pulse 1.4s infinite;
          display: inline-block;
        }
        @keyframes pulse {
          0%,60%,100%{opacity:.2;transform:scale(1)}
          30%{opacity:1;transform:scale(1.15)}
        }
      `}</style>
    </div>
  );
}

interface BubbleProps {
  msg: Message;
  displayName: string;
  avatarUrl: string;
}

function MessageBubble({ msg, displayName, avatarUrl }: BubbleProps) {
  const isUser = msg.role === "user";
  return (
    <div className={`msg-row ${isUser ? "user" : "ai"}`}>
      {!isUser && (
        <div className="avatar ai-avatar">
          <img src="/favicon.ico" alt="NEXUS" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <span className="avatar-fallback">N</span>
        </div>
      )}
      <div className={`msg-wrap ${isUser ? "user-wrap" : ""}`}>
        <div className="msg-name">{isUser ? displayName : "NEXUS Support"}</div>
        <div
          className={`bubble ${isUser ? "user-bubble" : "ai-bubble"}`}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
        />
        <div className={`msg-time ${isUser ? "right" : ""}`}>{msg.time}</div>
      </div>
      {isUser && (
        <div className="avatar user-avatar">
          {avatarUrl && avatarUrl !== "/favicon.ico" ? (
            <img
              src={avatarUrl}
              alt={displayName}
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
                el.parentElement!.querySelector<HTMLSpanElement>(".avatar-fallback")!.style.display = "flex";
              }}
            />
          ) : null}
          <span className="avatar-fallback user-fallback">{displayName.charAt(0).toUpperCase()}</span>
        </div>
      )}
    </div>
  );
}

interface WelcomeProps {
  displayName: string;
  avatarUrl: string;
  onHint: (text: string) => void;
}

function WelcomeScreen({ displayName, avatarUrl, onHint }: WelcomeProps) {
  return (
    <div className="welcome">
      <div className="welcome-avatar">
        <img src={avatarUrl} alt="avatar" onError={(e) => { (e.target as HTMLImageElement).src = "/favicon.ico"; }} />
      </div>
      <div className="welcome-badge">NEXUS AI · SUPPORT AGENT</div>
      <h1 className="welcome-title">How can I help?</h1>
      <p className="welcome-text">
        Hi, <strong style={{ color: "#fff" }}>{displayName}</strong>! I&apos;m your NEXUS AI Support Agent.
        <br />I can help with bugs, the Studio plugin, credits, login issues, and more.
      </p>
      <hr className="welcome-divider" />
      <span className="hint-label">Common issues — tap to ask:</span>
      <div className="hint-list">
        {HINTS.map((h) => (
          <button key={h.text} className="hint-chip" onClick={() => onHint(h.text)}>
            <span className="hint-icon">{h.icon}</span>
            {h.text}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const [displayName, setDisplayName] = useState("User");
  const [username, setUsername] = useState("user");
  const [avatarUrl, setAvatarUrl] = useState("/favicon.ico");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load session
  useEffect(() => {
    try {
      const raw = localStorage.getItem("nexus_session");
      if (raw) {
        const session: Session = JSON.parse(raw);
        const u = session.user;
        if (u) {
          setDisplayName(u.displayName || u.username || "User");
          setUsername(u.username || "user");
          setAvatarUrl(u.avatar || "/favicon.ico");
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  const addMessage = useCallback((role: "user" | "ai", text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: genId(), role, text, time: formatTime() },
    ]);
  }, []);

  const sendMsg = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessing) return;

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setShowWelcome(false);
    addMessage("user", text);

    // Hard block: code requests
    if (isCodeRequest(text)) {
      const tip = buildPromptTip(text);
      const redirectMsg = [
        "🙅 I'm the **Support Agent** — writing code isn't my job here!",
        "",
        "For scripts and code, head to the **[NEXUS AI Chat →](/chats)** — the AI there will write it for you instantly and you can inject it straight into Roblox Studio.",
        "",
        "**💡 Prompt tip** — try something like:",
        `> *"${tip}"*`,
        "",
        "The more detail you give, the better the output!",
        "",
        "Is there anything else I can help you with here on the support side? 😊",
      ].join("\n");
      addMessage("ai", redirectMsg);
      return;
    }

    setIsProcessing(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gemini",
          model: "gemini-3.5-flash",
          messages: [{ role: "user", content: text }],
          system: buildSystemPrompt(displayName, username),
          max_tokens: 1024,
        }),
      });

      if (!res.ok) {
        let errText = "";
        try {
          const errData = await res.json();
          errText = errData.error || "";
        } catch { /* ignore */ }
        throw new Error(`HTTP ${res.status}${errText ? ": " + errText : ""}`);
      }

      const data = await res.json();
      const reply = (data.content || "").trim() || "I got an empty response. Please try again or contact support.";
      addMessage("ai", reply);
    } catch (err) {
      const errMsg = [
        "⚠️ **Connection error** — Failed to reach the server.",
        "",
        `Details: \`${err instanceof Error ? err.message : "Unknown error"}\``,
        "",
        "Please try again in a moment. If this keeps happening, contact us at **arifiinytid@gmail.com** or join our **[Discord](https://discord.gg/HuGtbRvD)**.",
      ].join("\n");
      addMessage("ai", errMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [input, isProcessing, displayName, username, addMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMsg();
    }
  };

  const handleHint = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  const handleBack = () => {
    if (document.referrer && document.referrer !== window.location.href) {
      history.back();
    } else if (window.opener && !window.opener.closed) {
      window.close();
    } else {
      window.location.href = "/";
    }
  };

  return (
    <>
      {/* ── Global Styles ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500&display=swap');

        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

        :root {
          --bg:      #030312;
          --bg2:     #06071a;
          --bg3:     #0a0b22;
          --cyan:    #00e5ff;
          --cyan2:   rgba(0,229,255,.35);
          --purple:  #8800ff;
          --pink:    #ff2d6b;
          --green:   #00ffaa;
          --yellow:  #ffd600;
          --text:    #b8cfff;
          --dim:     #3a4a7a;
          --border:  rgba(0,229,255,.12);
          --r:       8px;
        }

        html, body {
          height: 100%;
          font-family: 'JetBrains Mono', monospace;
          background: var(--bg);
          color: var(--text);
          font-size: 13px;
          overflow: hidden;
        }

        /* Grid bg */
        body::before {
          content:'';
          position:fixed; inset:0;
          background:
            linear-gradient(rgba(0,229,255,.013) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,229,255,.013) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events:none; z-index:0;
        }
        body::after {
          content:'';
          position:fixed;
          top:50%; left:50%;
          transform:translate(-50%,-50%);
          width:700px; height:700px;
          background: radial-gradient(circle, rgba(136,0,255,.05) 0%, transparent 70%);
          pointer-events:none; z-index:0;
        }

        /* ── Layout ── */
        .page {
          display:flex; flex-direction:column;
          height:100vh;
          position:relative; z-index:1;
        }

        /* ── Header ── */
        .header {
          padding:10px 16px;
          background:rgba(6,7,26,.97);
          border-bottom:1px solid var(--border);
          display:flex; align-items:center; gap:10px;
          flex-shrink:0;
          backdrop-filter:blur(16px);
        }
        .header-logo {
          width:32px; height:32px;
          border-radius:8px; overflow:hidden; flex-shrink:0;
          border:1px solid rgba(0,229,255,.2);
          background:linear-gradient(135deg,#00e5ff,#8800ff);
        }
        .header-logo img { width:100%; height:100%; object-fit:cover; display:block; }
        .header-title {
          font-family:'Orbitron',sans-serif;
          font-size:12px; font-weight:700;
          color:var(--cyan); flex:1; letter-spacing:.5px;
        }
        .header-title span {
          color:var(--dim); font-weight:400;
          font-size:10px; margin-left:6px;
          font-family:'JetBrains Mono',monospace;
        }
        .header-user { display:flex; align-items:center; gap:8px; }
        .header-avatar {
          width:26px; height:26px; border-radius:50%;
          border:1.5px solid var(--cyan2);
          object-fit:cover; background:var(--bg3);
        }
        .header-name {
          font-size:10px; color:white; font-weight:500;
          max-width:90px; white-space:nowrap;
          overflow:hidden; text-overflow:ellipsis;
        }
        .back-btn {
          background:rgba(0,229,255,.06);
          border:1px solid rgba(0,229,255,.18);
          color:var(--cyan);
          padding:5px 12px; border-radius:var(--r);
          font-size:10px; font-family:'JetBrains Mono',monospace;
          cursor:pointer; transition:.15s; flex-shrink:0;
          display:flex; align-items:center; gap:5px;
        }
        .back-btn:hover { background:rgba(0,229,255,.12); border-color:var(--cyan); }
        .back-btn svg { width:12px; height:12px; stroke:currentColor; fill:none; stroke-width:2.5; }

        /* ── Status bar ── */
        .status-bar {
          padding:5px 16px;
          background:rgba(0,255,170,.04);
          border-bottom:1px solid rgba(0,255,170,.08);
          display:flex; align-items:center; justify-content:space-between;
          flex-shrink:0;
        }
        .status-left { display:flex; align-items:center; gap:8px; }
        .status-dot {
          width:6px; height:6px; border-radius:50%;
          background:var(--green);
          animation:blink 2s ease infinite;
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.35} }
        .status-text { font-size:9px; color:var(--green); letter-spacing:.5px; }
        .status-model { font-size:9px; color:var(--dim); letter-spacing:.3px; }

        /* ── Chat area ── */
        .chat-area {
          flex:1; overflow-y:auto;
          padding:16px; display:flex;
          flex-direction:column; gap:12px;
        }
        .chat-area::-webkit-scrollbar { width:3px; }
        .chat-area::-webkit-scrollbar-thumb { background:var(--border); border-radius:2px; }

        /* ── Welcome ── */
        .welcome {
          display:flex; flex-direction:column;
          align-items:center;
          flex:1; text-align:center;
          gap:14px; padding:32px 24px;
        }
        .welcome-avatar {
          width:72px; height:72px; border-radius:50%; overflow:hidden;
          border:2px solid rgba(0,229,255,.3);
          box-shadow:0 0 32px rgba(0,229,255,.12), 0 0 0 6px rgba(0,229,255,.04);
        }
        .welcome-avatar img { width:100%; height:100%; object-fit:cover; }
        .welcome-badge {
          font-size:8px; font-family:'Orbitron',sans-serif; letter-spacing:2px;
          color:var(--dim); background:rgba(0,229,255,.06);
          border:1px solid var(--border); padding:3px 12px; border-radius:20px;
        }
        .welcome-title {
          font-family:'Orbitron',sans-serif;
          font-size:20px; font-weight:900;
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          letter-spacing:1px;
        }
        .welcome-text {
          font-size:12px; max-width:380px;
          line-height:1.8; color:var(--text);
        }
        .welcome-divider {
          width:100%; max-width:360px;
          border:none; border-top:1px solid var(--border);
          margin:2px 0;
        }
        .hint-label {
          font-size:9px; color:var(--dim); letter-spacing:1px;
          text-transform:uppercase;
        }
        .hint-list {
          display:flex; flex-direction:column; gap:7px;
          width:100%; max-width:360px;
        }
        .hint-chip {
          background:var(--bg2); border:1px solid var(--border);
          border-radius:7px; padding:9px 13px;
          font-size:10.5px; color:var(--text);
          cursor:pointer; text-align:left; transition:.15s;
          display:flex; align-items:center; gap:9px;
          line-height:1.4; font-family:'JetBrains Mono',monospace;
        }
        .hint-chip:hover {
          border-color:rgba(0,229,255,.35);
          color:var(--cyan);
          background:rgba(0,229,255,.04);
        }
        .hint-icon { flex-shrink:0; font-size:13px; }

        /* ── Messages ── */
        .msg-row {
          display:flex; gap:9px;
          animation:msgIn .22s ease;
        }
        @keyframes msgIn {
          from{opacity:0;transform:translateY(7px)}
          to{opacity:1;transform:none}
        }
        .msg-row.user { flex-direction:row-reverse; }
        .avatar {
          width:28px; height:28px; border-radius:50%; overflow:hidden;
          flex-shrink:0; background:var(--bg3);
          display:flex; align-items:center; justify-content:center;
          font-size:11px; font-weight:700;
          border:1px solid var(--border);
          position:relative;
        }
        .avatar img {
          width:100%; height:100%; object-fit:cover;
          position:absolute; inset:0;
        }
        .avatar-fallback {
          color:var(--cyan);
          display:flex; align-items:center; justify-content:center;
          width:100%; height:100%;
        }
        .user-fallback { color:var(--purple); }
        .ai-avatar { }
        .user-avatar { }
        .msg-wrap {
          display:flex; flex-direction:column;
          max-width:80%; min-width:0;
        }
        .user-wrap { align-items:flex-end; }
        .msg-name {
          font-size:9px; color:var(--dim);
          margin-bottom:3px; letter-spacing:.3px;
        }
        .bubble {
          padding:10px 14px; border-radius:10px;
          line-height:1.7; font-size:12.5px;
          word-break:break-word; overflow-wrap:break-word;
        }
        .user-bubble {
          background:linear-gradient(135deg,rgba(0,229,255,.08),rgba(136,0,255,.08));
          border:1px solid rgba(0,229,255,.16);
          border-radius:10px 2px 10px 10px;
          color:white;
        }
        .ai-bubble {
          background:var(--bg2);
          border:1px solid var(--border);
          border-radius:2px 10px 10px 10px;
          color:var(--text);
        }
        /* Markdown inside bubble */
        .bubble p { margin:0 0 6px; }
        .bubble p:last-child { margin-bottom:0; }
        .bubble ul { padding-left:18px; margin:6px 0; }
        .bubble li { margin-bottom:4px; line-height:1.6; }
        .bubble strong { color:white; }
        .bubble h1,.bubble h2,.bubble h3 {
          color:white; margin:8px 0 4px;
          font-family:'Orbitron',sans-serif;
          font-size:11px; font-weight:700; letter-spacing:.5px;
        }
        .bubble code {
          background:rgba(0,229,255,.08);
          padding:2px 5px; border-radius:3px;
          font-size:10.5px; color:var(--cyan);
          word-break:break-all;
        }
        .bubble pre {
          background:rgba(0,0,0,.4);
          border:1px solid var(--border);
          border-radius:6px; padding:10px;
          overflow-x:auto; margin:6px 0;
        }
        .bubble a { color:var(--cyan); text-decoration:none; }
        .bubble a:hover { text-decoration:underline; }
        .bubble blockquote {
          border-left:2px solid var(--cyan2);
          padding-left:10px; color:var(--dim);
          margin:6px 0;
        }
        .bubble hr { border:none; border-top:1px solid var(--border); margin:8px 0; }
        .msg-time { font-size:9px; color:var(--dim); margin-top:4px; }
        .msg-time.right { text-align:right; }

        /* ── Input area ── */
        .input-area {
          padding:10px 14px 14px;
          border-top:1px solid var(--border);
          background:rgba(6,7,26,.97);
          backdrop-filter:blur(16px);
          display:flex; gap:8px; align-items:flex-end;
          flex-shrink:0;
        }
        .user-textarea {
          flex:1;
          background:var(--bg3);
          border:1px solid var(--border);
          border-radius:10px;
          padding:10px 14px;
          color:white;
          font-family:'JetBrains Mono',monospace;
          font-size:13px;
          resize:none;
          min-height:44px; max-height:120px;
          outline:none; line-height:1.55;
          transition:border-color .15s;
        }
        .user-textarea::placeholder { color:var(--dim); }
        .user-textarea:focus { border-color:var(--cyan2); }
        .send-btn {
          width:40px; height:40px; flex-shrink:0;
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          border:none; border-radius:50%;
          color:white; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          transition:.2s; box-shadow:0 0 14px rgba(0,229,255,.2);
        }
        .send-btn:hover:not(:disabled) { opacity:.82; transform:scale(1.07); }
        .send-btn:disabled { opacity:.3; cursor:not-allowed; box-shadow:none; }
        .send-btn svg { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:2; }
        .input-hint {
          font-size:9px; color:var(--dim);
          padding:0 14px 6px;
          background:rgba(6,7,26,.97);
          letter-spacing:.3px;
          flex-shrink:0;
        }

        @media(max-width:600px) {
          .header { padding:8px 11px; }
          .chat-area { padding:10px; }
          .welcome-avatar { width:56px; height:56px; }
          .welcome-title { font-size:17px; }
          .input-area { padding:8px 10px 11px; }
        }
      `}</style>

      <div className="page">
        {/* ── Header ── */}
        <header className="header">
          <div className="header-logo">
            <img src="/favicon.ico" alt="NEXUS" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
          <div className="header-title">
            NEXUS AI<span>· Support Agent</span>
          </div>
          <div className="header-user">
            <img
              className="header-avatar"
              src={avatarUrl}
              alt="avatar"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <span className="header-name">{displayName}</span>
          </div>
          <button className="back-btn" onClick={handleBack}>
            <svg viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
        </header>

        {/* ── Status Bar ── */}
        <div className="status-bar">
          <div className="status-left">
            <div className="status-dot" />
            <span className="status-text">ONLINE · Support Active</span>
          </div>
          <span className="status-model">Model: Gemini 3.5 Flash</span>
        </div>

        {/* ── Chat ── */}
        <div className="chat-area" ref={chatRef}>
          {showWelcome && messages.length === 0 && (
            <WelcomeScreen
              displayName={displayName}
              avatarUrl={avatarUrl}
              onHint={handleHint}
            />
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              displayName={displayName}
              avatarUrl={avatarUrl}
            />
          ))}

          {isProcessing && <TypingIndicator />}
        </div>

        {/* ── Input ── */}
        <div className="input-area">
          <textarea
            ref={textareaRef}
            className="user-textarea"
            placeholder="Describe your issue or ask a question…"
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
          />
          <button
            className="send-btn"
            onClick={sendMsg}
            disabled={isProcessing || !input.trim()}
            title="Send (Enter)"
          >
            <svg viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div className="input-hint">Enter = Send &nbsp;·&nbsp; Shift+Enter = New line</div>
      </div>
    </>
  );
}