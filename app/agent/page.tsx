'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ─────────────────────────────────────────
interface NexusUser {
  username:    string;
  displayName: string;
  avatar:      string;
}
interface NexusSession {
  user: NexusUser;
}
interface Message {
  id:   string;
  role: 'user' | 'ai';
  html: string;       // rendered markdown HTML
  raw:  string;       // raw text
  time: string;
}

// ── Helpers ───────────────────────────────────────
function formatTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function safeMarkdown(text: string): string {
  try {
    // marked is loaded via script tag equivalent — use dynamic window access
    // Install: npm install marked   then import { marked } from 'marked'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (window as any).marked;
    if (m) return m.parse(text) as string;
  } catch { /* fallback */ }
  return text.replace(/\n/g, '<br>');
}

// ── Code detection (same patterns as original) ────
const CODE_PATTERNS = [
  /\b(write|create|make|build|generate|code|give me|show me|provide|give)\b.{0,30}\b(script|code|lua|luau|function|module|localscript|serverscript|gui|frame|textbutton|textlabel|imagelabel|scrollingframe|game|npc|shop|leaderboard|datastore|admin|tween|remote|bindable|part|model|tool|weapon|system|handler)\b/i,
  /\b(fix|debug|complete|finish|improve|optimize|update|edit|modify|add to|continue)\b.{0,20}\b(this code|this script|my code|my script|the code|the script|lua|luau|function)\b/i,
  /\bcan you\b.{0,20}\b(code|program|script|write|make|create|build)\b/i,
  /```/,
  /\b(RemoteEvent|RemoteFunction|BindableEvent|LocalScript|ServerScript|ModuleScript|StarterGui|StarterPack|StarterPlayer|ReplicatedStorage|ServerScriptService|Workspace|Players\.LocalPlayer|game\.Players|game\.Workspace|script\.Parent|Instance\.new|TweenService|UserInputService|RunService|CollectionService|PhysicsService)\b/,
];
function isCodeRequest(text: string) { return CODE_PATTERNS.some(p => p.test(text)); }
function buildPromptTip(text: string): string {
  const m = text.match(/\b(loading screen|shop|npc|leaderboard|admin|gui|datastore|inventory|door|weapon|tool|game pass|vehicle|obby|pet|badge|timer|round system)\b/i);
  return m
    ? `Create a ${m[1]} system that [describe behavior, appearance, and any special logic you need].`
    : 'Create a [describe what you want] with [specific details about behavior, appearance, and logic].';
}

// ── Hints (same as original) ──────────────────────
const HINTS = [
  { icon: '🔌', text: 'My Studio plugin shows Studio: OFF, how do I fix it?' },
  { icon: '💳', text: "I already paid but I still haven't received my credits" },
  { icon: '🤖', text: 'How do I write better prompts to get good AI output?' },
  { icon: '⚠️', text: 'The AI Chat is giving me incomplete or wrong results' },
  { icon: '🔑', text: "I can't log in to my account, what should I do?" },
  { icon: '🎟️', text: 'My redeem code says it\'s invalid or already used' },
];

// ── System prompt builder (same as original) ──────
function buildSystemPrompt(displayName: string, username: string): string {
  return `
You are NEXUS AI Support Agent — the official technical support assistant for NEXUS AI, an advanced Roblox Developer AI Assistant platform built by NEXUS STUDIO (FIINYTID25).

👤 CURRENT USER
  Display Name : ${displayName}
  Username     : @${username}

🎯 IDENTITY & ROLE
You are a Tier-1 Support Agent. Your ONLY job is:
  • Troubleshooting platform issues
  • Guiding users through platform features
  • Helping users fix errors and configuration problems
  • Directing users to the right resource or escalation channel
  • Giving tips to improve prompts for better AI output

You are NOT a code-writing AI. The main NEXUS AI Chat at /chats handles code generation.
You must NEVER write, generate, complete, or explain Lua, Luau, or any programming code.
If a user asks you to write code or a script — even partially — ALWAYS redirect them to /chats.

🧠 PLATFORM KNOWLEDGE BASE

── CORE FEATURES ──
1. AI Chat (/chats) — Generates Lua/Luau scripts, debugs code, builds GUIs; Models: Gemini 3.5 Flash, Mistral, Groq, DeepSeek, and more
2. GUI Editor — Drag-and-drop visual builder for Roblox interfaces
3. Studio Plugin — Injects AI-generated code directly into Roblox Studio in real time
   Install path: C:\\Users\\[YourName]\\AppData\\Local\\Roblox\\Plugins\\
   Required: HTTP Requests + Script Injection enabled in Studio

── CREDITS SYSTEM ──
Free Plan: 30 CR on signup, +2 CR/day
Pro Plan: 200 CR on activation, +25 CR/day, all models unlocked
Credit Packs: 50 / 80 / 150 / 500 CR at /payment
Payment: OVO & DANA only

── COMMON ISSUES ──
[STUDIO OFF] → Enable HTTP Requests + Script Injection in Studio Settings → Security, restart Studio
[CREDITS NOT RECEIVED] → Wait 24h, send payment screenshot + username to arifiinytid@gmail.com
[LOGIN ISSUES] → Clear cache, try incognito, disable VPN
[POOR AI OUTPUT] → Use a more specific, detailed prompt; switch to Gemini 3.5 Flash
[REDEEM CODE INVALID] → Settings → Redeem Code, codes are case-sensitive and single-use
[MODEL LOCKED] → Requires Pro Plan, upgrade at /payment

── SUPPORT CHANNELS ──
Discord: discord.gg/HuGtbRvD
Email: arifiinytid@gmail.com

📏 RULES
✅ Address user as ${displayName}. Always redirect code requests to /chats. Be friendly and concise.
❌ NEVER write any Lua/code. NEVER make up features or prices not listed above.
`.trim();
}

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════
export default function AgentPage() {
  const router = useRouter();

  // Session
  const [displayName, setDisplayName] = useState('User');
  const [username,    setUsername]    = useState('user');
  const [avatarUrl,   setAvatarUrl]   = useState('/nexusai.png');

  // Chat state
  const [messages,     setMessages]     = useState<Message[]>([]);
  const [showWelcome,  setShowWelcome]  = useState(true);
  const [isTyping,     setIsTyping]     = useState(false);
  const [inputVal,     setInputVal]     = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const chatRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load session from localStorage (same as original)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('nexus_session');
      if (raw) {
        const s: NexusSession = JSON.parse(raw);
        if (s?.user) {
          setDisplayName(s.user.displayName || s.user.username || 'User');
          setUsername(s.user.username || 'user');
          setAvatarUrl(s.user.avatar || '/nexusai.png');
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Load marked.js dynamically (same CDN as original)
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).marked) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
      document.head.appendChild(script);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Back navigation (same logic as original)
  const handleBack = () => {
    if (document.referrer && document.referrer !== window.location.href) {
      router.back();
    } else if (window.opener && !window.opener.closed) {
      window.close();
    } else {
      router.push('/');
    }
  };

  // Auto-resize textarea (same as original)
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputVal(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  // Fill hint into input (same as original)
  const fillHint = (text: string) => {
    setInputVal(text);
    setShowWelcome(false);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
        inputRef.current.focus();
      }
    }, 0);
  };

  // Send message (same logic as original)
  const sendMsg = useCallback(async () => {
    const text = inputVal.trim();
    if (!text || isProcessing) return;

    setInputVal('');
    setShowWelcome(false);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      raw: text,
      html: text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
      time: formatTime(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Hard block: code/script requests (same as original)
    if (isCodeRequest(text)) {
      const tip = buildPromptTip(text);
      const redirectRaw = [
        '🙅 I\'m the **Support Agent** — writing code isn\'t my job here!',
        '',
        'For scripts and code, head to the **[NEXUS AI Chat →](/chats)** — the AI there will write it for you instantly and you can inject it straight into Roblox Studio.',
        '',
        '**💡 Prompt tip** — try something like:',
        `> *"${tip}"*`,
        '',
        'The more detail you give, the better the output!',
        '',
        'Is there anything else I can help you with here on the support side? 😊',
      ].join('\n');
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '-ai',
        role: 'ai',
        raw: redirectRaw,
        html: safeMarkdown(redirectRaw),
        time: formatTime(),
      }]);
      return;
    }

    setIsProcessing(true);
    setIsTyping(true);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider:   'gemini',
          model:      'gemini-3.5-flash',
          messages:   [{ role: 'user', content: text }],
          system:     buildSystemPrompt(displayName, username),
          max_tokens: 1024,
        }),
      });

      if (!res.ok) {
        let errText = '';
        try { const d = await res.json(); errText = d.error || ''; } catch { /* noop */ }
        throw new Error(`HTTP ${res.status}${errText ? ': ' + errText : ''}`);
      }

      const data  = await res.json();
      const reply = (data.content || '').trim() || 'I got an empty response. Please try again or contact support.';

      setMessages(prev => [...prev, {
        id:   Date.now().toString() + '-ai',
        role: 'ai',
        raw:  reply,
        html: safeMarkdown(reply),
        time: formatTime(),
      }]);

    } catch (err: unknown) {
      const errMsg = [
        '⚠️ **Connection error** — Failed to reach the server.',
        '',
        `Details: \`${err instanceof Error ? err.message : 'Unknown error'}\``,
        '',
        'Please try again in a moment. If this keeps happening, contact us at **arifiinytid@gmail.com** or join our **[Discord](https://discord.gg/HuGtbRvD)**.',
      ].join('\n');
      setMessages(prev => [...prev, {
        id:   Date.now().toString() + '-ai',
        role: 'ai',
        raw:  errMsg,
        html: safeMarkdown(errMsg),
        time: formatTime(),
      }]);
    } finally {
      setIsTyping(false);
      setIsProcessing(false);
    }
  }, [inputVal, isProcessing, displayName, username]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMsg();
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500&display=swap');
        :root {
          --bg:#030312; --bg2:#06071a; --bg3:#0a0b22;
          --cyan:#00e5ff; --cyan2:rgba(0,229,255,.35);
          --purple:#8800ff; --pink:#ff2d6b; --green:#00ffaa; --yellow:#ffd600;
          --text:#b8cfff; --dim:#3a4a7a; --border:rgba(0,229,255,.12); --r:8px;
        }
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        html, body { height:100%; font-family:'JetBrains Mono',monospace; background:var(--bg); color:var(--text); font-size:13px; overflow:hidden; }

        .ag-grid {
          position:fixed; inset:0;
          background:linear-gradient(rgba(0,229,255,.013) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.013) 1px,transparent 1px);
          background-size:40px 40px; pointer-events:none; z-index:0;
        }
        .ag-glow {
          position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
          width:700px; height:700px;
          background:radial-gradient(circle,rgba(136,0,255,.05) 0%,transparent 70%);
          pointer-events:none; z-index:0;
        }
        .ag-container { display:flex; flex-direction:column; height:100vh; position:relative; z-index:1; }

        /* HEADER */
        .ag-header {
          padding:10px 16px; background:rgba(6,7,26,.97); border-bottom:1px solid var(--border);
          display:flex; align-items:center; gap:10px; flex-shrink:0; backdrop-filter:blur(16px);
        }
        .ag-header-logo { width:32px; height:32px; border-radius:8px; overflow:hidden; flex-shrink:0; border:1px solid rgba(0,229,255,.2); }
        .ag-header-logo img { width:100%; height:100%; object-fit:cover; display:block; }
        .ag-header-title { font-family:'Orbitron',sans-serif; font-size:12px; font-weight:700; color:var(--cyan); flex:1; letter-spacing:.5px; }
        .ag-header-title span { color:var(--dim); font-weight:400; font-size:10px; margin-left:6px; font-family:'JetBrains Mono',monospace; }
        .ag-header-user { display:flex; align-items:center; gap:8px; }
        .ag-header-avatar { width:26px; height:26px; border-radius:50%; border:1.5px solid var(--cyan2); object-fit:cover; background:var(--bg3); }
        .ag-header-name { font-size:10px; color:white; font-weight:500; max-width:90px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ag-back-btn {
          background:rgba(0,229,255,.06); border:1px solid rgba(0,229,255,.18); color:var(--cyan);
          padding:5px 12px; border-radius:var(--r); font-size:10px; font-family:'JetBrains Mono',monospace;
          cursor:pointer; transition:.15s; flex-shrink:0; display:flex; align-items:center; gap:5px;
        }
        .ag-back-btn:hover { background:rgba(0,229,255,.12); border-color:var(--cyan); }
        .ag-back-btn svg { width:12px; height:12px; stroke:currentColor; fill:none; stroke-width:2.5; }

        /* STATUS BAR */
        .ag-status {
          padding:5px 16px; background:rgba(0,255,170,.04); border-bottom:1px solid rgba(0,255,170,.08);
          display:flex; align-items:center; justify-content:space-between; flex-shrink:0;
        }
        .ag-status-left { display:flex; align-items:center; gap:8px; }
        .ag-status-dot { width:6px; height:6px; border-radius:50%; background:var(--green); flex-shrink:0; animation:agBlink 2s ease infinite; }
        @keyframes agBlink { 0%,100%{opacity:1} 50%{opacity:.35} }
        .ag-status-text  { font-size:9px; color:var(--green); letter-spacing:.5px; }
        .ag-status-model { font-size:9px; color:var(--dim); letter-spacing:.3px; }

        /* CHAT */
        .ag-chat { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px; }
        .ag-chat::-webkit-scrollbar { width:3px; }
        .ag-chat::-webkit-scrollbar-thumb { background:var(--border); border-radius:2px; }

        /* WELCOME */
        .ag-welcome { display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; text-align:center; gap:14px; padding:32px 24px; }
        .ag-welcome-avatar { width:72px; height:72px; border-radius:50%; overflow:hidden; border:2px solid rgba(0,229,255,.3); box-shadow:0 0 32px rgba(0,229,255,.12),0 0 0 6px rgba(0,229,255,.04); }
        .ag-welcome-avatar img { width:100%; height:100%; object-fit:cover; }
        .ag-welcome-badge { font-size:8px; font-family:'Orbitron',sans-serif; letter-spacing:2px; color:var(--dim); background:rgba(0,229,255,.06); border:1px solid var(--border); padding:3px 12px; border-radius:20px; }
        .ag-welcome-title { font-family:'Orbitron',sans-serif; font-size:20px; font-weight:900; background:linear-gradient(135deg,var(--cyan),var(--purple)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; letter-spacing:1px; }
        .ag-welcome-text  { font-size:12px; max-width:380px; line-height:1.8; color:var(--text); }
        .ag-welcome-text strong { color:white; }
        .ag-welcome-divider { width:100%; max-width:360px; border:none; border-top:1px solid var(--border); margin:2px 0; }
        .ag-hint-label { font-size:9px; color:var(--dim); letter-spacing:1px; text-transform:uppercase; align-self:flex-start; margin-left:calc(50% - 180px); }
        .ag-hints { display:flex; flex-direction:column; gap:7px; width:100%; max-width:360px; }
        .ag-hint-chip {
          background:var(--bg2); border:1px solid var(--border); border-radius:7px;
          padding:9px 13px; font-size:10.5px; color:var(--text); cursor:pointer;
          text-align:left; transition:.15s; display:flex; align-items:center; gap:9px; line-height:1.4;
        }
        .ag-hint-chip:hover { border-color:rgba(0,229,255,.35); color:var(--cyan); background:rgba(0,229,255,.04); }
        .ag-hint-icon { flex-shrink:0; font-size:13px; }

        /* MESSAGES */
        .ag-msg { display:flex; gap:9px; animation:agMsgIn .22s ease; }
        @keyframes agMsgIn { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:none} }
        .ag-msg-avatar { width:28px; height:28px; border-radius:50%; overflow:hidden; flex-shrink:0; background:var(--bg3); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:var(--cyan); border:1px solid var(--border); }
        .ag-msg-avatar img { width:100%; height:100%; object-fit:cover; }
        .ag-msg.user { flex-direction:row-reverse; }
        .ag-msg.user .ag-msg-avatar { color:var(--purple); }
        .ag-msg-wrap { display:flex; flex-direction:column; max-width:80%; min-width:0; }
        .ag-msg.user .ag-msg-wrap { align-items:flex-end; }
        .ag-msg-name { font-size:9px; color:var(--dim); margin-bottom:3px; letter-spacing:.3px; }
        .ag-msg-bubble { padding:10px 14px; border-radius:10px; line-height:1.7; font-size:12.5px; word-break:break-word; overflow-wrap:break-word; }
        .ag-msg.user .ag-msg-bubble { background:linear-gradient(135deg,rgba(0,229,255,.08),rgba(136,0,255,.08)); border:1px solid rgba(0,229,255,.16); border-radius:10px 2px 10px 10px; color:white; }
        .ag-msg.ai  .ag-msg-bubble  { background:var(--bg2); border:1px solid var(--border); border-radius:2px 10px 10px 10px; color:var(--text); }
        .ag-msg-bubble p               { margin:0 0 6px; }
        .ag-msg-bubble p:last-child    { margin-bottom:0; }
        .ag-msg-bubble ul, .ag-msg-bubble ol { padding-left:18px; margin:6px 0; }
        .ag-msg-bubble li              { margin-bottom:4px; line-height:1.6; }
        .ag-msg-bubble strong          { color:white; }
        .ag-msg-bubble em              { color:var(--cyan); font-style:normal; }
        .ag-msg-bubble h1,.ag-msg-bubble h2,.ag-msg-bubble h3 { color:white; margin:8px 0 4px; font-family:'Orbitron',sans-serif; font-size:11px; font-weight:700; letter-spacing:.5px; }
        .ag-msg-bubble code            { background:rgba(0,229,255,.08); padding:2px 5px; border-radius:3px; font-size:10.5px; color:var(--cyan); word-break:break-all; }
        .ag-msg-bubble pre             { background:rgba(0,0,0,.4); border:1px solid var(--border); border-radius:6px; padding:10px; overflow-x:auto; margin:6px 0; }
        .ag-msg-bubble pre code        { background:none; padding:0; font-size:10px; color:var(--text); word-break:normal; }
        .ag-msg-bubble a               { color:var(--cyan); text-decoration:none; }
        .ag-msg-bubble a:hover         { text-decoration:underline; }
        .ag-msg-bubble blockquote      { border-left:2px solid var(--cyan2); padding-left:10px; color:var(--dim); margin:6px 0; font-style:italic; }
        .ag-msg-bubble hr              { border:none; border-top:1px solid var(--border); margin:8px 0; }
        .ag-msg-time { font-size:9px; color:var(--dim); margin-top:4px; }
        .ag-msg.ai   .ag-msg-time { text-align:left; }
        .ag-msg.user .ag-msg-time { text-align:right; }

        /* TYPING */
        .ag-typing { display:flex; gap:9px; animation:agMsgIn .22s ease; }
        .ag-typing-bubble { background:var(--bg2); border:1px solid var(--border); border-radius:2px 10px 10px 10px; padding:12px 16px; display:flex; gap:5px; align-items:center; }
        .ag-typing-dot { width:7px; height:7px; border-radius:50%; background:var(--cyan); animation:agDotPulse 1.4s infinite; }
        .ag-typing-dot:nth-child(2) { animation-delay:.22s; }
        .ag-typing-dot:nth-child(3) { animation-delay:.44s; }
        @keyframes agDotPulse { 0%,60%,100%{opacity:.2;transform:scale(1)} 30%{opacity:1;transform:scale(1.15)} }

        /* INPUT */
        .ag-input-area { padding:10px 14px 14px; border-top:1px solid var(--border); background:rgba(6,7,26,.97); backdrop-filter:blur(16px); display:flex; gap:8px; align-items:flex-end; }
        .ag-textarea {
          flex:1; background:var(--bg3); border:1px solid var(--border); border-radius:10px;
          padding:10px 14px; color:white; font-family:'JetBrains Mono',monospace; font-size:13px;
          resize:none; min-height:44px; max-height:120px; outline:none; line-height:1.55; transition:border-color .15s;
        }
        .ag-textarea::placeholder { color:var(--dim); }
        .ag-textarea:focus { border-color:var(--cyan2); }
        .ag-send-btn {
          width:40px; height:40px; flex-shrink:0;
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          border:none; border-radius:50%; color:white; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          transition:.2s; box-shadow:0 0 14px rgba(0,229,255,.2);
        }
        .ag-send-btn:hover:not(:disabled) { opacity:.82; transform:scale(1.07); }
        .ag-send-btn:disabled { opacity:.3; cursor:not-allowed; box-shadow:none; }
        .ag-send-btn svg { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:2; }
        .ag-input-hint { font-size:9px; color:var(--dim); padding:0 14px 6px; background:rgba(6,7,26,.97); letter-spacing:.3px; }

        @media (max-width:600px) {
          .ag-header       { padding:8px 11px; }
          .ag-chat         { padding:10px; }
          .ag-welcome-avatar { width:56px; height:56px; }
          .ag-welcome-title  { font-size:17px; }
          .ag-input-area   { padding:8px 10px 11px; }
          .ag-hint-label   { margin-left:0; }
          .ag-hints        { max-width:100%; }
        }
      `}</style>

      {/* Background */}
      <div className="ag-grid" aria-hidden />
      <div className="ag-glow"  aria-hidden />

      <div className="ag-container">

        {/* ── HEADER ── */}
        <div className="ag-header">
          <div className="ag-header-logo">
            <img src="/nexusai.png" alt="NEXUS"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.background =
                  'linear-gradient(135deg,#00e5ff,#8800ff)';
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="ag-header-title">
            NEXUS AI<span>· Support Agent</span>
          </div>
          <div className="ag-header-user">
            <img
              className="ag-header-avatar"
              src={avatarUrl}
              alt="avatar"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="ag-header-name">{displayName}</span>
          </div>
          <button className="ag-back-btn" onClick={handleBack}>
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
        </div>

        {/* ── STATUS BAR ── */}
        <div className="ag-status">
          <div className="ag-status-left">
            <div className="ag-status-dot" />
            <span className="ag-status-text">ONLINE · Support Active</span>
          </div>
          <span className="ag-status-model">Model: Gemini 3.5 Flash</span>
        </div>

        {/* ── CHAT AREA ── */}
        <div className="ag-chat" ref={chatRef}>

          {/* Welcome screen */}
          {showWelcome && (
            <div className="ag-welcome">
              <div className="ag-welcome-avatar">
                <img src={avatarUrl} alt="avatar"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/nexusai.png'; }}
                />
              </div>
              <div className="ag-welcome-badge">NEXUS AI · SUPPORT AGENT</div>
              <div className="ag-welcome-title">How can I help?</div>
              <div className="ag-welcome-text">
                Hi, <strong>{displayName}</strong>! I&apos;m your NEXUS AI Support Agent.<br />
                I can help with bugs, the Studio plugin, credits, login issues, and more.
              </div>
              <hr className="ag-welcome-divider" />
              <div className="ag-hint-label">Common issues — tap to ask:</div>
              <div className="ag-hints">
                {HINTS.map((h) => (
                  <button key={h.text} className="ag-hint-chip" onClick={() => fillHint(h.text)}>
                    <span className="ag-hint-icon">{h.icon}</span>
                    {h.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <div key={msg.id} className={`ag-msg ${msg.role}`}>
              {/* Avatar */}
              <div className="ag-msg-avatar">
                {msg.role === 'ai' ? (
                  <img src="/nexusai.png" alt="NEXUS AI"
                    onError={(e) => { (e.target as HTMLImageElement).parentElement!.textContent = 'N'; }}
                  />
                ) : avatarUrl && avatarUrl !== '/nexusai.png' ? (
                  <img src={avatarUrl} alt={displayName}
                    onError={(e) => { (e.target as HTMLImageElement).parentElement!.textContent = displayName.charAt(0).toUpperCase(); }}
                  />
                ) : (
                  displayName.charAt(0).toUpperCase()
                )}
              </div>
              {/* Wrap */}
              <div className="ag-msg-wrap">
                <div className="ag-msg-name">
                  {msg.role === 'ai' ? 'NEXUS Support' : displayName}
                </div>
                <div
                  className="ag-msg-bubble"
                  dangerouslySetInnerHTML={{ __html: msg.html }}
                />
                <div className="ag-msg-time">{msg.time}</div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="ag-typing">
              <div className="ag-msg-avatar">
                <img src="/nexusai.png" alt="NEXUS AI"
                  onError={(e) => { (e.target as HTMLImageElement).parentElement!.textContent = 'N'; }}
                />
              </div>
              <div className="ag-typing-bubble">
                <div className="ag-typing-dot" />
                <div className="ag-typing-dot" />
                <div className="ag-typing-dot" />
              </div>
            </div>
          )}

        </div>{/* /ag-chat */}

        {/* ── INPUT AREA ── */}
        <div className="ag-input-area">
          <textarea
            ref={inputRef}
            className="ag-textarea"
            placeholder="Describe your issue or ask a question…"
            rows={1}
            value={inputVal}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
          <button
            className="ag-send-btn"
            onClick={sendMsg}
            disabled={isProcessing}
            title="Send (Enter)"
          >
            <svg viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div className="ag-input-hint">Enter = Send &nbsp;·&nbsp; Shift+Enter = New line</div>

      </div>{/* /ag-container */}
    </>
  );
}