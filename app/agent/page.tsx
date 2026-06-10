"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────────────────────── */
interface NexusSession {
  loginTime?: number;
  user: {
    username: string;
    avatar?: string;
    robloxId?: string;
    displayName?: string;
  };
  data?: {
    credits?: number | string;
    plan?: string;
    roles?: string[];
  };
}

interface Message {
  id: string;
  role: "user" | "ai";
  text: string;
  time: string;
  liked?: boolean | null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */
const HINT_CATEGORIES = [
  {
    label: "Plugin & Studio",
    color: "var(--cyan)",
    hints: [
      { icon: "🔌", text: "My Studio plugin shows Studio: OFF, how do I fix it?" },
      { icon: "🔧", text: "How do I install the NEXUS AI Studio plugin?" },
    ],
  },
  {
    label: "Credits & Payment",
    color: "var(--yellow)",
    hints: [
      { icon: "💳", text: "I already paid but I still haven't received my credits" },
      { icon: "⚡", text: "How do I claim my daily free credits?" },
    ],
  },
  {
    label: "AI Chat Help",
    color: "var(--purple)",
    hints: [
      { icon: "🤖", text: "How do I write better prompts to get good AI output?" },
      { icon: "⚠️", text: "The AI Chat is giving me incomplete or wrong results" },
    ],
  },
  {
    label: "Account Issues",
    color: "var(--green)",
    hints: [
      { icon: "🔑", text: "I can't log in to my account, what should I do?" },
      { icon: "🎟️", text: "My redeem code says it's invalid or already used" },
    ],
  },
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
    /\b(loading screen|shop|npc|leaderboard|admin|gui|datastore|inventory|door|weapon|tool|game pass|vehicle|obby|pet|badge|timer|round system|tycoon|simulator|fighting|rpg|racing|parkour)\b/i
  );
  if (match) {
    return `Create a ${match[1]} system that [describe behavior, appearance, what happens when triggered, and any visual effects you want].`;
  }
  return "Create a [describe what you want] with [specific details about behavior, appearance, triggers, and logic].";
}

function formatTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/* ─────────────────────────────────────────────────────────────────────────────
   MARKDOWN RENDERER
───────────────────────────────────────────────────────────────────────────── */
function renderMarkdown(text: string): string {
  // Escape HTML first
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (must process before inline code)
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_m, code) => 
    `<pre><code>${code.trim()}</code></pre>`
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold + Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, '<em class="em-cyan">$1</em>');

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

  // HR
  html = html.replace(/^---$/gm, "<hr/>");

  // Ordered list
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li class='ol-item'>$1</li>");

  // Unordered list
  html = html.replace(/^[\s]*[-•*]\s+(.+)$/gm, "<li>$1</li>");

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li(?:\s[^>]*)?>[\s\S]*?<\/li>(\s*<li(?:\s[^>]*)?>[\s\S]*?<\/li>)*)/g,
    (match) => {
      if (match.includes('ol-item')) return `<ol>${match}</ol>`;
      return `<ul>${match}</ul>`;
    }
  );

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Line breaks
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br/>");

  // Wrap in paragraph
  if (!html.startsWith("<")) html = "<p>" + html;
  if (!html.endsWith(">")) html = html + "</p>";

  return html;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SYSTEM PROMPT BUILDER
───────────────────────────────────────────────────────────────────────────── */
function buildSystemPrompt(displayName: string, username: string, plan: string, credits: string): string {
  return `
You are NEXUS AI Support Agent — the official technical support assistant for NEXUS AI, an advanced Roblox Developer AI Assistant platform built by NEXUS STUDIO (FIINYTID25).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 CURRENT USER SESSION
  Display Name : ${displayName}
  Username     : @${username}
  Plan         : ${plan.toUpperCase()}
  Credits      : ${credits} CR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

═══════════════════════════════════════════════
🎯 IDENTITY & ROLE
═══════════════════════════════════════════════
You are a NEXUS AI Tier-1 Support Agent. Your ONLY job is:
  • Diagnosing and resolving platform technical issues
  • Guiding users step-by-step through platform features
  • Helping users understand and fix configuration errors
  • Directing users to the correct resource, page, or escalation channel
  • Providing personalized tips to improve AI prompt quality
  • Answering billing, credits, and account questions

You are NOT a code-writing AI. The main NEXUS AI Chat at /chats handles all code generation.
You must NEVER write, generate, complete, explain, or hint at any Lua, Luau, or programming code.

═══════════════════════════════════════════════
🧠 COMPLETE PLATFORM KNOWLEDGE BASE
═══════════════════════════════════════════════

── CORE FEATURES ──
1. **AI Chat** (/chats)
   • Generates professional Lua/Luau scripts for Roblox games
   • Debugs existing code and suggests optimizations
   • Builds complete GUI systems, game systems, NPCs, etc.
   • Supports: Loading screens, shops, leaderboards, datastores, admin systems, tycoons, simulators, fighting games, RPGs, and more
   • Available Models:
     - Gemini 3.5 Flash (recommended — fast, high quality)
     - Gemini 3.5 Flash Lite (fastest — good for simple tasks)
     - Mistral (good for structured code)
     - Groq (ultra fast)
     - DeepSeek (detailed explanations)
   • Free users: basic models only
   • Pro users: ALL models unlocked including premium

2. **GUI Editor** (/gui-editor or within /chats)
   • Visual drag-and-drop builder for Roblox interfaces
   • No coding required — design visually
   • Outputs JSON commands injectable via Studio Plugin
   • Best browser: Google Chrome (latest version required)
   • Supports: Frames, Buttons, Labels, ScrollingFrames, ImageLabels, ViewportFrames

3. **Studio Plugin**
   • Real-time injection of AI-generated code directly into Roblox Studio
   • Download: Settings page → Studio Plugin section, or Roblox Creator Store
   • Creator Store URL: https://create.roblox.com/store/asset/91870814099475/NEXUS-AI
   • Install path: C:\\Users\\[YourName]\\AppData\\Local\\Roblox\\Plugins\\
   • Required permissions in Roblox Studio:
     1. File → Settings → Security → Allow HTTP Requests: ON
     2. File → Settings → Security → Allow Script Injection: ON
   • Status indicator:
     - "Studio: ON" (green dot) = connected and ready
     - "Studio: OFF" (red dot) = not connected — needs troubleshooting
   • The plugin communicates via localhost HTTP — no internet required once installed

4. **Dashboard** (/dashboard)
   • Create and manage AI projects
   • Each project = isolated chat history + Studio sync context
   • Free plan: max 3 projects | Pro plan: max 10 projects | Owner/Admin: unlimited
   • Projects persist on the server and sync across devices

── NAVIGATION PAGES ──
  /           — Home / Landing page
  /login.html — Login and registration (Roblox OAuth)
  /dashboard  — Project Hub (create/manage projects)
  /chats/[id] — Main AI Chat for a specific project
  /payment    — Credits purchase and plan upgrade page
  /agent      — This Support Agent (current page)
  /inbox      — Notifications and announcements
  Settings    — Accessible via user dropdown (top right)

── CREDITS & PLANS SYSTEM ──
  Credits (CR) = platform currency consumed per AI request

  FREE PLAN:
    • 30 CR granted on signup
    • +2 CR added automatically each day (claimable in dashboard/settings)
    • Access: 3 projects max, basic AI models only
    • Daily claim resets every 24 hours

  PRO PLAN:
    • 200 CR granted on activation
    • +25 CR added automatically each day
    • ALL AI models unlocked including premium
    • 10 projects max
    • Priority support

  OWNER / UNLIMITED PLAN:
    • Unlimited credits (∞)
    • All features unlocked
    • No project limit

  ONE-TIME CREDIT PACKS (at /payment):
    • 50 CR pack
    • 80 CR pack
    • 150 CR pack
    • 500 CR pack

  PAYMENT METHODS:
    • OVO (Indonesian e-wallet)
    • DANA (Indonesian e-wallet)
    • Note: Payment processing is manual — allow up to 24 hours
    • Always include: payment screenshot + your exact @username in the email

  CODE REDEMPTION: Settings dropdown → Redeem Code section
    • Codes are case-sensitive and single-use
    • Copy exactly — no spaces before/after

── DETAILED TROUBLESHOOTING GUIDE ──

  🔴 PROBLEM: "Studio: OFF" / Plugin Not Connecting
  CAUSE: Roblox Studio security settings blocking HTTP or the plugin isn't running.
  SOLUTION (step by step):
    1. Open Roblox Studio
    2. Click **File** → **Settings** → **Security** tab
    3. Enable **"Allow HTTP Requests"** — set to TRUE
    4. Enable **"Allow Script Injection"** — set to TRUE
    5. Close Roblox Studio completely (check Task Manager — end any roblox processes)
    6. Relaunch Roblox Studio
    7. Refresh the NEXUS AI page (Ctrl+R or F5)
    8. Check the Studio indicator — should now show **"Studio: ON"**
    STILL OFF? Try:
    - Uninstall plugin: delete file from C:\\Users\\[Name]\\AppData\\Local\\Roblox\\Plugins\\
    - Re-download from /settings → Studio Plugin → Download
    - Restart Studio again
    - Check if antivirus/firewall is blocking localhost connections
    - Try temporarily disabling firewall to test

  🟡 PROBLEM: Credits Not Received After Payment
  SOLUTION:
    1. Wait up to **24 hours** — all payments are verified manually by the team
    2. Take a clear screenshot of your payment confirmation
    3. Send to: **arifiinytid@gmail.com** with subject "Credit Request - @username"
    4. Include in email: payment screenshot, exact @username, amount paid, payment method used
    5. Join Discord and post in **#payment-support** with the same details
    IMPORTANT: Never share payment details publicly in main Discord channels.

  🔴 PROBLEM: Can't Log In / Registration Issues
  SOLUTION:
    1. Hard refresh the login page: **Ctrl+Shift+R** (or Cmd+Shift+R on Mac)
    2. Clear browser cache: **Ctrl+Shift+Delete** → clear cookies and cached files
    3. Try Incognito/Private window (**Ctrl+Shift+N**)
    4. Disable browser extensions (especially ad blockers)
    5. If using VPN → disable it temporarily
    6. Check spam/junk folder for verification email
    7. Try a different browser (Chrome recommended)
    8. Still failing? Contact: arifiinytid@gmail.com

  🟡 PROBLEM: AI Chat Giving Incomplete or Wrong Output
  SOLUTION:
    1. Make your prompt **much more specific** (see Prompt Tips section below)
    2. Switch to a more powerful model: **Gemini 3.5 Flash** (top right in chat)
    3. Break large requests into **smaller parts** — one feature at a time
    4. If script is incomplete, say: "continue from where you stopped" in the same chat
    5. If output is wrong, say: "this isn't right, specifically [explain the issue]"
    6. Try rephrasing using different keywords

  🔵 PROBLEM: AI Response Is Very Slow
  SOLUTION:
    1. Switch to **Gemini 3.5 Flash Lite** (fastest model)
    2. Check your internet connection speed
    3. Avoid peak hours (typically 12pm–3pm & 8pm–11pm Jakarta time)
    4. Refresh the page if stuck loading
    5. Check your remaining credits — if 0 CR, requests won't process

  🟡 PROBLEM: GUI Editor Not Saving / Looking Glitchy
  SOLUTION:
    1. **Must use Google Chrome** — other browsers (Firefox, Safari, Edge) may have issues
    2. Update Chrome to latest version
    3. Clear browser cache fully
    4. Disable extensions (especially dark mode, ad blocker, VPN extensions)
    5. If not saving: ensure you're logged in and have valid session
    6. Refresh and try again — auto-save may have a small delay

  🔴 PROBLEM: Redeem Code Not Working
  SOLUTION:
    1. Go to **Settings dropdown** → **Redeem Code** section
    2. Copy the code exactly — it IS case-sensitive
    3. Remove any spaces before or after the code
    4. Check: has the code already been used? Codes are single-use
    5. Check: has the code expired? (codes have expiry dates)
    6. Still not working? Contact support with the code and screenshot

  🔵 PROBLEM: Premium Model Locked / Unavailable
  SOLUTION:
    • Premium models require an active **Pro Plan**
    • Upgrade at **/payment** → Pro Plan section
    • After upgrade, refresh the chat page — models unlock immediately

  🟡 PROBLEM: Project Won't Open / Chat History Missing
  SOLUTION:
    1. Check your internet connection
    2. Refresh the dashboard page
    3. Click on the project again
    4. If history is missing: server sync may be delayed — wait 30 seconds and refresh
    5. Check if you have pending unsynced changes (orange indicator on project card)

  🔵 PROBLEM: Studio Plugin Not Injecting Code
  SOLUTION:
    1. Ensure Studio status shows **"Studio: ON"** (green)
    2. Make sure a place/game is OPEN in Roblox Studio
    3. Click the **Inject** button in the AI Chat after generating code
    4. Check the Output window in Roblox Studio for errors
    5. Ensure Script Injection is enabled in Studio settings

── PROMPT IMPROVEMENT TIPS (SHARE THESE WHEN RELEVANT) ──

  ❌ BAD:  "make gui"
  ✅ GOOD: "Create a loading screen GUI with a dark background, centered title 'NEXUS' in gradient color, an animated progress bar from 0% to 100% over 3 seconds, and a 'Loading game...' label below. Use TweenService for smooth animations."

  ❌ BAD:  "npc follow"
  ✅ GOOD: "Create an NPC that uses PathfindingService to follow the nearest player within 30 studs. It should play a walk animation while moving, stop 4 studs from the player, and play an idle animation when standing still. The NPC should check for the nearest player every 0.5 seconds."

  ❌ BAD:  "shop system"
  ✅ GOOD: "Create a shop system with a ScreenGui that shows item cards with names, icons, and prices in Credits (stored in a Currency leaderstats). Items: 'Speed Boost' (50 CR, 2x speed for 30 seconds), 'Jump Boost' (30 CR, 2x jump for 30 seconds). Include a close button and confirmation popup before purchasing."

  ❌ BAD:  "make it better"
  ✅ GOOD: "Improve the script by: 1) adding a cooldown of 5 seconds between attacks, 2) making the animation smoother using TweenService, 3) adding a sound effect on hit"

  GOLDEN RULES for better prompts:
  • Describe the VISUAL appearance (colors, size, position, font)
  • Describe the BEHAVIOR (what triggers it, what it does, any conditions)
  • Describe the INTERACTIONS (what happens when player clicks/touches/approaches)
  • Mention any SERVICES to use (TweenService, PathfindingService, DataStoreService, etc.)
  • Specify WHERE it should be (StarterGui, ServerScriptService, StarterCharacterScripts, etc.)
  • Break complex systems into MULTIPLE requests

── SUPPORT CHANNELS ──
  📧 Email: arifiinytid@gmail.com
  💬 Discord: discord.gg/HuGtbRvD (also discord.gg/FzAF48mvK5)
  🐛 In-app Bug Report: Settings dropdown → Report Issue
  💳 Payment/Credits: Always include payment screenshot + @username in email

═══════════════════════════════════════════════
📏 STRICT BEHAVIORAL RULES
═══════════════════════════════════════════════

✅ YOU MUST:
  • Only answer questions about the NEXUS AI platform ecosystem
  • Address the user by name: ${displayName}
  • Tailor responses based on user's plan (${plan}) — e.g., mention upgrade if on Free
  • Always redirect code/script requests to /chats with a helpful redirect message
  • Provide clear numbered steps for technical issues
  • Use **bold** for UI elements, page names, and key actions
  • Be patient, encouraging, and friendly — many users are beginners
  • When unsure, say so honestly and direct to official support channels
  • End responses with a helpful follow-up offer or relevant tip
  • Keep responses concise and scannable — lead with the solution

❌ YOU MUST NEVER:
  • Write, generate, complete, hint at, or explain Lua/Luau or any code
  • Generate scripts, GUI code, game systems, or any code snippet
  • Pretend to be a code-generating AI or say "here's how the code would look"
  • Make up platform features, prices, or details not in this knowledge base
  • Answer questions completely unrelated to NEXUS AI (general Roblox game design, etc.)
  • Share opinions about competing AI platforms

🚫 CODE REQUEST REDIRECT (use this pattern):
  "I'm the Support Agent — script writing isn't my role! Head to **[NEXUS AI Chat → /chats](/dashboard)** (open or create a project first) and ask the same thing — the AI will write it instantly.
  
  **💡 Better prompt tip:** [give specific improved version of their request]
  
  Need help with anything else on the support side?"

💬 TONE & FORMAT GUIDE:
  • Warm, professional, slightly playful — like a knowledgeable teammate
  • Short scannable responses — avoid walls of text
  • Use **bold** for all UI elements: **Settings**, **File → Settings**, **Studio: ON**
  • Use numbered lists for step-by-step instructions
  • Use > blockquotes for prompt examples
  • Use ✅ ❌ ⚠️ 🔧 💡 emojis where they add clarity (don't overdo it)
  • End with a friendly offer or celebration if issue is resolved 🎉
  • If the user seems frustrated, acknowledge it before jumping to solution
`.trim();
}

/* ─────────────────────────────────────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────────────────────────────────────── */
function TypingIndicator() {
  return (
    <div className="msg-row ai">
      <div className="avatar ai-avatar">
        <img
          src="/images/nexusai.png"
          alt="NEXUS"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="avatar-fallback">N</span>
      </div>
      <div className="typing-bubble">
        <span className="dot" style={{ animationDelay: "0s" }} />
        <span className="dot" style={{ animationDelay: "0.22s" }} />
        <span className="dot" style={{ animationDelay: "0.44s" }} />
        <span className="typing-label">NEXUS is thinking...</span>
      </div>
    </div>
  );
}

interface BubbleProps {
  msg: Message;
  displayName: string;
  avatarUrl: string;
  onFeedback?: (id: string, liked: boolean) => void;
}

function MessageBubble({ msg, displayName, avatarUrl, onFeedback }: BubbleProps) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`msg-row ${isUser ? "user" : "ai"}`}>
      {!isUser && (
        <div className="avatar ai-avatar">
          <img
            src="/images/nexusai.png"
            alt="NEXUS"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="avatar-fallback">N</span>
        </div>
      )}
      <div className={`msg-wrap ${isUser ? "user-wrap" : ""}`}>
        <div className="msg-name">
          {isUser ? (
            <span>{displayName}</span>
          ) : (
            <>
              <span className="ai-name-tag">NEXUS</span>
              <span className="ai-agent-tag">Support Agent</span>
            </>
          )}
        </div>
        <div
          className={`bubble ${isUser ? "user-bubble" : "ai-bubble"}`}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
        />
        <div className={`msg-footer ${isUser ? "right" : ""}`}>
          <span className="msg-time">{msg.time}</span>
          {!isUser && (
            <div className="msg-actions">
              <button className="msg-action-btn" onClick={handleCopy} title="Copy response">
                {copied ? (
                  <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                )}
              </button>
              {onFeedback && (
                <>
                  <button
                    className={`msg-action-btn ${msg.liked === true ? "active-like" : ""}`}
                    onClick={() => onFeedback(msg.id, true)}
                    title="Helpful"
                  >
                    <svg viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" /><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" /></svg>
                  </button>
                  <button
                    className={`msg-action-btn ${msg.liked === false ? "active-dislike" : ""}`}
                    onClick={() => onFeedback(msg.id, false)}
                    title="Not helpful"
                  >
                    <svg viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z" /><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17" /></svg>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {isUser && (
        <div className="avatar user-avatar">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
              }}
            />
          ) : null}
          <span className="avatar-fallback user-fallback">
            {displayName.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

interface WelcomeProps {
  displayName: string;
  avatarUrl: string;
  plan: string;
  credits: string;
  onHint: (text: string) => void;
}

function WelcomeScreen({ displayName, avatarUrl, plan, credits, onFeedback: _onFeedback, onHint }: WelcomeProps & { onFeedback?: never }) {
  const [activeCategory, setActiveCategory] = useState(0);

  const getPlanColor = () => {
    switch (plan.toLowerCase()) {
      case "pro": return "var(--cyan)";
      case "owner": return "var(--yellow)";
      default: return "var(--green)";
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-top">
        <div className="welcome-avatar-wrap">
          <div className="welcome-avatar-ring" />
          <div className="welcome-avatar">
            <img
              src={avatarUrl}
              alt="avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/images/nexusai.png";
              }}
            />
          </div>
        </div>
        <div className="welcome-badge">
          <span className="badge-dot" />
          NEXUS AI · SUPPORT AGENT · ONLINE
        </div>
        <h1 className="welcome-title">
          How can I <span className="title-accent">help you</span>?
        </h1>
        <p className="welcome-text">
          Hi, <strong style={{ color: "#fff" }}>{displayName}</strong>! 👋 I&apos;m your NEXUS AI Support Agent.
          <br />
          I handle bugs, the Studio plugin, credits, login issues, and more.
        </p>
        <div className="welcome-stats">
          <div className="w-stat">
            <span className="w-stat-val" style={{ color: "var(--yellow)" }}>{credits} CR</span>
            <span className="w-stat-lbl">Credits</span>
          </div>
          <div className="w-stat-divider" />
          <div className="w-stat">
            <span className="w-stat-val" style={{ color: getPlanColor() }}>{plan.toUpperCase()}</span>
            <span className="w-stat-lbl">Plan</span>
          </div>
          <div className="w-stat-divider" />
          <div className="w-stat">
            <span className="w-stat-val" style={{ color: "var(--green)" }}>LIVE</span>
            <span className="w-stat-lbl">Support</span>
          </div>
        </div>
      </div>

      <div className="hints-section">
        <div className="hint-cat-tabs">
          {HINT_CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              className={`hint-cat-tab ${activeCategory === i ? "active" : ""}`}
              style={activeCategory === i ? { borderColor: cat.color, color: cat.color } : {}}
              onClick={() => setActiveCategory(i)}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="hint-list">
          {HINT_CATEGORIES[activeCategory].hints.map((h) => (
            <button
              key={h.text}
              className="hint-chip"
              style={{ "--hint-color": HINT_CATEGORIES[activeCategory].color } as React.CSSProperties}
              onClick={() => onHint(h.text)}
            >
              <span className="hint-icon">{h.icon}</span>
              <span className="hint-text">{h.text}</span>
              <svg className="hint-arrow" viewBox="0 0 24 24">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────────────────────── */
export default function AgentPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [session, setSession] = useState<NexusSession | null>(null);

  const [displayName, setDisplayName] = useState("User");
  const [username, setUsername] = useState("user");
  const [avatarUrl, setAvatarUrl] = useState("/images/nexusai.png");
  const [plan, setPlan] = useState("free");
  const [credits, setCredits] = useState("30");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [charCount, setCharCount] = useState(0);

  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ── AUTH CHECK ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("nexus_session");
      if (!raw) {
        window.location.replace("/");
        return;
      }
      const sess: NexusSession = JSON.parse(raw);
      if (!sess?.user?.username) {
        window.location.replace("/");
        return;
      }
      // Session expiry check — 7 days
      if (Date.now() - (sess.loginTime || 0) > 86400000 * 7) {
        localStorage.removeItem("nexus_session");
        window.location.replace("/");
        return;
      }
      setSession(sess);
      const u = sess.user;
      const d = sess.data;

      const dName = u.displayName || u.username || "User";
      setDisplayName(dName);
      setUsername(u.username || "user");

      if (u.avatar) {
        setAvatarUrl(u.avatar);
      } else if (u.robloxId) {
        setAvatarUrl(
          `https://www.roblox.com/headshot-thumbnail/image?userId=${u.robloxId}&width=150&height=150&format=png`
        );
      }

      if (d) {
        const p = (d.plan || "free").toLowerCase();
        const roles = d.roles || [];
        const isOwner = p === "owner" || roles.includes("owner");
        setPlan(isOwner ? "owner" : p);
        const cr = d.credits;
        if (isOwner || roles.includes("admin")) {
          setCredits("∞");
        } else {
          setCredits(cr !== undefined ? String(parseFloat(String(cr)).toFixed(0)) : "30");
        }
      }

      setAuthChecked(true);
    } catch {
      localStorage.removeItem("nexus_session");
      window.location.replace("/");
    }
  }, []);

  /* ── AUTO SCROLL ── */
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTo({
        top: chatRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isProcessing]);

  /* ── INPUT HANDLERS ── */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    setCharCount(e.target.value.length);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  };

  const addMessage = useCallback((role: "user" | "ai", text: string): string => {
    const id = genId();
    setMessages((prev) => [...prev, { id, role, text, time: formatTime(), liked: null }]);
    return id;
  }, []);

  const handleFeedback = useCallback((id: string, liked: boolean) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, liked: m.liked === liked ? null : liked } : m))
    );
  }, []);

  /* ── SEND MESSAGE ── */
  const sendMsg = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessing) return;

    setInput("");
    setCharCount(0);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setShowWelcome(false);
    addMessage("user", text);

    // Hard block: code requests
    if (isCodeRequest(text)) {
      const tip = buildPromptTip(text);
      const redirectMsg = [
        "🙅 I'm the **Support Agent** — writing code isn't in my job description!",
        "",
        "For scripts and code generation, open a project and go to **[NEXUS AI Chat → /dashboard](/dashboard)**. The AI there will write it for you instantly, and you can inject it straight into Roblox Studio with one click.",
        "",
        "**💡 Prompt tip** — for better AI output, try something specific like:",
        `> *"${tip}"*`,
        "",
        "The more detail you include, the better the output! Is there anything else I can help you with on the support side? 😊",
      ].join("\n");
      addMessage("ai", redirectMsg);
      return;
    }

    setIsProcessing(true);

    // Build conversation history for the API
    const conversationHistory = messages
      .slice(-10) // last 10 messages for context window
      .map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      }));
    conversationHistory.push({ role: "user", content: text });

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gemini",
          model: "gemini-3.5-flash",
          messages: conversationHistory,
          system: buildSystemPrompt(displayName, username, plan, credits),
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
      const reply =
        (data.content || "").trim() ||
        "I received an empty response. Please try again or contact support at **arifiinytid@gmail.com**.";
      addMessage("ai", reply);
    } catch (err) {
      const errMsg = [
        "⚠️ **Connection error** — couldn't reach the server.",
        "",
        `*Details: \`${err instanceof Error ? err.message : "Unknown error"}\`*`,
        "",
        "Please try again in a moment. If this keeps happening, reach out at **arifiinytid@gmail.com** or join our **[Discord](https://discord.gg/HuGtbRvD)**.",
      ].join("\n");
      addMessage("ai", errMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [input, isProcessing, displayName, username, plan, credits, addMessage, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMsg();
    }
  };

  const handleHint = (text: string) => {
    setInput(text);
    setCharCount(text.length);
    textareaRef.current?.focus();
  };

  const handleClearChat = () => {
    setMessages([]);
    setShowWelcome(true);
  };

  if (!authChecked) {
    return (
      <div style={{
        position: "fixed", inset: 0,
        background: "#030312",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 16,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <div style={{
          width: 40, height: 40, border: "2px solid rgba(0,229,255,.1)",
          borderTop: "2px solid #00e5ff", borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color: "#3a4a7a", fontSize: 11, letterSpacing: 2 }}>AUTHENTICATING...</p>
      </div>
    );
  }

  const getPlanColor = () => {
    switch (plan.toLowerCase()) {
      case "pro": return "var(--cyan)";
      case "owner": return "var(--yellow)";
      default: return "var(--green)";
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500;600&display=swap');

        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

        :root {
          --bg:      #030312;
          --bg2:     #06071a;
          --bg3:     #0a0b22;
          --bg4:     #0d0e28;
          --cyan:    #00e5ff;
          --cyan2:   rgba(0,229,255,.25);
          --purple:  #8800ff;
          --pink:    #ff2d6b;
          --green:   #00ffaa;
          --yellow:  #ffd600;
          --text:    #b8cfff;
          --dim:     #3a4a7a;
          --dim2:    #5a6a9a;
          --border:  rgba(0,229,255,.10);
          --r:       10px;
        }

        html, body {
          height: 100%;
          font-family: 'JetBrains Mono', monospace;
          background: var(--bg);
          color: var(--text);
          font-size: 13px;
          overflow: hidden;
        }

        /* Animated background */
        body::before {
          content:'';
          position:fixed; inset:0;
          background:
            radial-gradient(ellipse at 80% -5%, rgba(136,0,255,.14) 0%, transparent 45%),
            radial-gradient(ellipse at -5% 85%, rgba(0,229,255,.06) 0%, transparent 40%),
            linear-gradient(rgba(0,229,255,.006) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,229,255,.006) 1px, transparent 1px);
          background-size: auto, auto, 40px 40px, 40px 40px;
          pointer-events:none; z-index:0;
        }

        /* ── PAGE LAYOUT ── */
        .page {
          display:flex; flex-direction:column;
          height:100vh;
          position:relative; z-index:1;
        }

        /* ── HEADER ── */
        .header {
          padding:0 16px;
          height:56px;
          background:rgba(3,3,18,.97);
          border-bottom:1px solid var(--border);
          display:flex; align-items:center; gap:10px;
          flex-shrink:0;
          backdrop-filter:blur(24px);
          position:relative;
        }
        .header::after {
          content:'';
          position:absolute; bottom:0; left:0; right:0; height:1px;
          background: linear-gradient(90deg, transparent, rgba(0,229,255,.3), transparent);
        }
        .header-logo {
          width:32px; height:32px;
          border-radius:8px; overflow:hidden; flex-shrink:0;
          border:1px solid rgba(0,229,255,.18);
          box-shadow:0 0 12px rgba(0,229,255,.12);
        }
        .header-logo img { width:100%; height:100%; object-fit:cover; display:block; }
        .header-brand {
          display:flex; flex-direction:column; flex:1;
        }
        .header-title {
          font-family:'Orbitron',sans-serif;
          font-size:11px; font-weight:800;
          background:linear-gradient(90deg,var(--cyan),var(--purple));
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          letter-spacing:.8px;
          line-height:1.2;
        }
        .header-subtitle {
          font-size:9px; color:var(--dim2); letter-spacing:.3px;
        }
        .header-pills {
          display:flex; align-items:center; gap:6px;
        }
        .header-plan-pill {
          padding:3px 10px; border-radius:12px;
          font-size:8.5px; font-weight:700; font-family:'Orbitron',sans-serif;
          letter-spacing:.5px;
          background:rgba(0,229,255,.06);
          border:1px solid rgba(0,229,255,.18);
        }
        .header-user {
          display:flex; align-items:center; gap:8px;
          padding:4px 10px 4px 4px;
          border-radius:20px;
          border:1px solid var(--border);
          background:var(--bg2);
        }
        .header-avatar {
          width:26px; height:26px; border-radius:50%;
          border:1.5px solid var(--cyan2);
          object-fit:cover; background:var(--bg3);
          flex-shrink:0;
        }
        .header-name {
          font-size:10px; color:var(--text); font-weight:500;
          max-width:90px; white-space:nowrap;
          overflow:hidden; text-overflow:ellipsis;
        }
        .header-btn {
          height:32px; padding:0 12px;
          border-radius:8px;
          font-size:10px; font-family:'JetBrains Mono',monospace;
          cursor:pointer; transition:.15s; flex-shrink:0;
          display:flex; align-items:center; gap:5px;
          text-decoration:none;
        }
        .header-btn-ghost {
          background:rgba(0,229,255,.05);
          border:1px solid rgba(0,229,255,.16);
          color:var(--cyan);
        }
        .header-btn-ghost:hover {
          background:rgba(0,229,255,.1);
          border-color:var(--cyan);
        }
        .header-btn-ghost svg { width:11px; height:11px; stroke:currentColor; fill:none; stroke-width:2.5; }
        .btn-clear {
          background:rgba(255,45,107,.04);
          border:1px solid rgba(255,45,107,.14);
          color:rgba(255,45,107,.6);
        }
        .btn-clear:hover {
          background:rgba(255,45,107,.1);
          border-color:var(--pink);
          color:var(--pink);
        }
        .btn-clear svg { width:11px; height:11px; stroke:currentColor; fill:none; stroke-width:2; }

        /* ── STATUS BAR ── */
        .status-bar {
          padding:6px 16px;
          background:rgba(0,255,170,.025);
          border-bottom:1px solid rgba(0,255,170,.07);
          display:flex; align-items:center; justify-content:space-between;
          flex-shrink:0;
        }
        .status-left { display:flex; align-items:center; gap:10px; }
        .status-indicator {
          display:flex; align-items:center; gap:5px;
        }
        .status-dot {
          width:6px; height:6px; border-radius:50%;
          background:var(--green);
          box-shadow:0 0 6px var(--green);
          animation:glow 2.5s ease infinite;
        }
        @keyframes glow {
          0%,100%{box-shadow:0 0 4px var(--green)}
          50%{box-shadow:0 0 10px var(--green), 0 0 20px rgba(0,255,170,.3)}
        }
        .status-text { font-size:9px; color:var(--green); letter-spacing:.5px; font-weight:500; }
        .status-sep { color:var(--dim); font-size:9px; }
        .status-model {
          font-size:9px; color:var(--dim2); letter-spacing:.3px;
          display:flex; align-items:center; gap:4px;
        }
        .status-model-dot { width:4px; height:4px; border-radius:50%; background:var(--cyan); }
        .status-right { display:flex; align-items:center; gap:6px; }
        .msg-count {
          font-size:9px; color:var(--dim);
          background:rgba(0,0,0,.3); border:1px solid var(--border);
          padding:2px 8px; border-radius:8px;
        }

        /* ── CHAT AREA ── */
        .chat-area {
          flex:1; overflow-y:auto;
          padding:20px 16px; display:flex;
          flex-direction:column; gap:16px;
          scroll-behavior:smooth;
        }
        .chat-area::-webkit-scrollbar { width:3px; }
        .chat-area::-webkit-scrollbar-thumb { background:rgba(0,229,255,.12); border-radius:2px; }
        .chat-area::-webkit-scrollbar-track { background:transparent; }

        /* ── WELCOME ── */
        .welcome {
          display:flex; flex-direction:column;
          align-items:center;
          flex:1; gap:0; padding:20px 20px 10px;
          animation:fadeIn .4s ease;
        }
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .welcome-top {
          display:flex; flex-direction:column;
          align-items:center; gap:12px;
          text-align:center; margin-bottom:20px;
          width:100%; max-width:440px;
        }
        .welcome-avatar-wrap {
          position:relative; width:72px; height:72px;
        }
        .welcome-avatar-ring {
          position:absolute; inset:-4px;
          border-radius:50%;
          border:1.5px solid transparent;
          background:linear-gradient(135deg,rgba(0,229,255,.5),rgba(136,0,255,.5)) border-box;
          -webkit-mask:
            linear-gradient(#fff 0 0) padding-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite:destination-out;
          mask-composite:exclude;
          animation:rotate 4s linear infinite;
        }
        @keyframes rotate{to{transform:rotate(360deg)}}
        .welcome-avatar {
          width:72px; height:72px; border-radius:50%; overflow:hidden;
          border:2px solid rgba(0,229,255,.2);
        }
        .welcome-avatar img { width:100%; height:100%; object-fit:cover; }
        .welcome-badge {
          display:flex; align-items:center; gap:6px;
          font-size:8.5px; font-family:'Orbitron',sans-serif; letter-spacing:1.5px;
          color:var(--dim2);
          background:rgba(0,229,255,.04);
          border:1px solid var(--border); padding:4px 14px; border-radius:20px;
        }
        .badge-dot {
          width:5px; height:5px; border-radius:50%;
          background:var(--green);
          box-shadow:0 0 6px var(--green);
          animation:glow 2.5s ease infinite;
          flex-shrink:0;
        }
        .welcome-title {
          font-family:'Orbitron',sans-serif;
          font-size:22px; font-weight:900;
          color:white; letter-spacing:1px;
          line-height:1.2;
        }
        .title-accent {
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
        }
        .welcome-text {
          font-size:12px; line-height:1.8; color:var(--text);
        }
        .welcome-stats {
          display:flex; align-items:center; gap:0;
          background:var(--bg2); border:1px solid var(--border);
          border-radius:10px; overflow:hidden;
          width:100%;
        }
        .w-stat {
          flex:1; display:flex; flex-direction:column; align-items:center;
          padding:10px 8px; gap:3px;
        }
        .w-stat-val {
          font-family:'Orbitron',sans-serif; font-size:13px; font-weight:700;
          line-height:1;
        }
        .w-stat-lbl { font-size:8.5px; color:var(--dim2); letter-spacing:.3px; }
        .w-stat-divider { width:1px; height:36px; background:var(--border); flex-shrink:0; }

        /* ── HINT CHIPS ── */
        .hints-section { width:100%; max-width:440px; }
        .hint-cat-tabs {
          display:flex; gap:6px; flex-wrap:wrap;
          margin-bottom:10px;
        }
        .hint-cat-tab {
          padding:5px 12px; border-radius:8px;
          font-size:9px; font-family:'JetBrains Mono',monospace;
          background:var(--bg2); border:1px solid var(--border);
          color:var(--dim2); cursor:pointer; transition:.15s;
        }
        .hint-cat-tab.active {
          background:rgba(0,229,255,.05);
        }
        .hint-cat-tab:hover:not(.active) { color:var(--text); }
        .hint-list {
          display:flex; flex-direction:column; gap:6px;
        }
        .hint-chip {
          background:var(--bg2); border:1px solid var(--border);
          border-radius:9px; padding:11px 14px;
          font-size:11px; color:var(--text);
          cursor:pointer; text-align:left; transition:.18s;
          display:flex; align-items:center; gap:10px;
          line-height:1.4; font-family:'JetBrains Mono',monospace;
          position:relative; overflow:hidden;
        }
        .hint-chip::before {
          content:'';
          position:absolute; left:0; top:0; bottom:0; width:2px;
          background:var(--hint-color, var(--cyan));
          opacity:0; transition:.18s;
        }
        .hint-chip:hover {
          border-color:var(--hint-color, var(--cyan));
          color:var(--hint-color, var(--cyan));
          background:rgba(0,229,255,.03);
          padding-left:16px;
        }
        .hint-chip:hover::before { opacity:1; }
        .hint-icon { flex-shrink:0; font-size:15px; }
        .hint-text { flex:1; }
        .hint-arrow {
          width:12px; height:12px; stroke:currentColor; fill:none; stroke-width:2.5;
          opacity:0; transition:.18s; flex-shrink:0;
        }
        .hint-chip:hover .hint-arrow { opacity:1; }

        /* ── MESSAGES ── */
        .msg-row {
          display:flex; gap:10px;
          animation:msgIn .25s ease;
        }
        @keyframes msgIn {
          from{opacity:0;transform:translateY(8px)}
          to{opacity:1;transform:none}
        }
        .msg-row.user { flex-direction:row-reverse; }
        .avatar {
          width:30px; height:30px; border-radius:50%; overflow:hidden;
          flex-shrink:0; background:var(--bg3);
          display:flex; align-items:center; justify-content:center;
          font-size:11px; font-weight:700;
          border:1.5px solid var(--border);
          position:relative; align-self:flex-start;
        }
        .avatar img {
          width:100%; height:100%; object-fit:cover;
          position:absolute; inset:0;
        }
        .avatar-fallback {
          color:var(--cyan);
          position:relative; z-index:1;
        }
        .user-fallback { color:var(--purple); }
        .msg-wrap {
          display:flex; flex-direction:column;
          max-width:82%; min-width:0;
        }
        .user-wrap { align-items:flex-end; }
        .msg-name {
          font-size:9px; color:var(--dim);
          margin-bottom:4px; letter-spacing:.3px;
          display:flex; align-items:center; gap:5px;
        }
        .ai-name-tag { color:var(--cyan); font-weight:600; }
        .ai-agent-tag {
          font-size:8px; padding:1px 6px; border-radius:4px;
          background:rgba(0,229,255,.08); color:var(--dim2);
          border:1px solid rgba(0,229,255,.1);
        }
        .bubble {
          padding:12px 16px; border-radius:12px;
          line-height:1.75; font-size:12.5px;
          word-break:break-word; overflow-wrap:break-word;
        }
        .user-bubble {
          background:linear-gradient(135deg,rgba(0,229,255,.08),rgba(136,0,255,.07));
          border:1px solid rgba(0,229,255,.18);
          border-radius:12px 3px 12px 12px;
          color:white;
        }
        .ai-bubble {
          background:var(--bg2);
          border:1px solid var(--border);
          border-radius:3px 12px 12px 12px;
          color:var(--text);
        }

        /* ── Markdown inside bubble ── */
        .bubble p { margin:0 0 8px; }
        .bubble p:last-child { margin-bottom:0; }
        .bubble ul { padding-left:20px; margin:8px 0; }
        .bubble ol { padding-left:20px; margin:8px 0; }
        .bubble li { margin-bottom:5px; line-height:1.7; }
        .bubble strong { color:white; }
        .bubble em.em-cyan { color:var(--cyan); font-style:normal; }
        .bubble h1,.bubble h2,.bubble h3 {
          color:white; margin:10px 0 6px;
          font-family:'Orbitron',sans-serif;
          font-size:11px; font-weight:700; letter-spacing:.5px;
        }
        .bubble code {
          background:rgba(0,229,255,.08);
          padding:2px 6px; border-radius:4px;
          font-size:11px; color:var(--cyan);
          word-break:break-all;
          border:1px solid rgba(0,229,255,.1);
        }
        .bubble pre {
          background:rgba(0,0,0,.5);
          border:1px solid var(--border);
          border-radius:8px; padding:12px 14px;
          overflow-x:auto; margin:8px 0;
          position:relative;
        }
        .bubble pre code {
          background:none; border:none;
          padding:0; color:var(--green);
          font-size:11.5px; word-break:normal;
        }
        .bubble a { color:var(--cyan); text-decoration:none; border-bottom:1px solid rgba(0,229,255,.3); }
        .bubble a:hover { border-bottom-color:var(--cyan); }
        .bubble blockquote {
          border-left:2.5px solid rgba(0,229,255,.35);
          padding:8px 12px; color:var(--dim2);
          margin:8px 0; border-radius:0 6px 6px 0;
          background:rgba(0,229,255,.03);
          font-style:italic;
        }
        .bubble hr { border:none; border-top:1px solid var(--border); margin:10px 0; }

        /* ── MSG FOOTER ── */
        .msg-footer {
          display:flex; align-items:center; gap:6px; margin-top:5px;
        }
        .msg-footer.right { flex-direction:row-reverse; }
        .msg-time { font-size:9px; color:var(--dim); }
        .msg-actions { display:flex; align-items:center; gap:2px; }
        .msg-action-btn {
          width:22px; height:22px;
          background:none; border:none; cursor:pointer;
          color:var(--dim); border-radius:5px; padding:3px;
          display:flex; align-items:center; justify-content:center;
          transition:.14s;
        }
        .msg-action-btn svg { width:11px; height:11px; stroke:currentColor; fill:none; stroke-width:2; }
        .msg-action-btn:hover { color:var(--cyan); background:rgba(0,229,255,.08); }
        .msg-action-btn.active-like { color:var(--green); }
        .msg-action-btn.active-dislike { color:var(--pink); }

        /* ── TYPING ── */
        .typing-bubble {
          background:var(--bg2);
          border:1px solid var(--border);
          border-radius:3px 12px 12px 12px;
          padding:12px 16px;
          display:flex; gap:6px; align-items:center;
        }
        .dot {
          width:7px; height:7px; border-radius:50%;
          background:var(--cyan);
          animation:dotPulse 1.4s infinite;
          flex-shrink:0;
        }
        @keyframes dotPulse {
          0%,60%,100%{opacity:.2;transform:scale(.85)}
          30%{opacity:1;transform:scale(1.1)}
        }
        .typing-label {
          font-size:10px; color:var(--dim2); margin-left:4px;
          letter-spacing:.3px;
        }

        /* ── INPUT AREA ── */
        .input-wrapper {
          flex-shrink:0;
          border-top:1px solid var(--border);
          background:rgba(3,3,18,.98);
          backdrop-filter:blur(24px);
          padding:12px 14px 10px;
        }
        .input-row {
          display:flex; gap:8px; align-items:flex-end;
        }
        .input-box {
          flex:1; position:relative;
        }
        .user-textarea {
          width:100%;
          background:var(--bg3);
          border:1px solid var(--border);
          border-radius:12px;
          padding:11px 14px;
          color:white;
          font-family:'JetBrains Mono',monospace;
          font-size:13px;
          resize:none;
          min-height:46px; max-height:140px;
          outline:none; line-height:1.55;
          transition:border-color .18s, box-shadow .18s;
          display:block;
        }
        .user-textarea::placeholder { color:var(--dim); }
        .user-textarea:focus {
          border-color:rgba(0,229,255,.3);
          box-shadow:0 0 0 3px rgba(0,229,255,.05);
        }
        .user-textarea:disabled { opacity:.4; cursor:not-allowed; }
        .char-count {
          position:absolute; bottom:8px; right:12px;
          font-size:9px; color:var(--dim); pointer-events:none;
          transition:.15s;
        }
        .char-count.warn { color:var(--yellow); }
        .char-count.over { color:var(--pink); }
        .send-btn {
          width:44px; height:44px; flex-shrink:0;
          background:linear-gradient(135deg,var(--cyan),var(--purple));
          border:none; border-radius:12px;
          color:#030312; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          transition:.2s; box-shadow:0 4px 16px rgba(0,229,255,.2);
          align-self:flex-end;
        }
        .send-btn:hover:not(:disabled) {
          transform:translateY(-2px);
          box-shadow:0 8px 24px rgba(0,229,255,.3);
        }
        .send-btn:disabled { opacity:.25; cursor:not-allowed; box-shadow:none; transform:none; }
        .send-btn svg { width:17px; height:17px; stroke:currentColor; fill:none; stroke-width:2; }
        .input-footer {
          display:flex; align-items:center; justify-content:space-between;
          margin-top:6px; padding:0 2px;
        }
        .input-hint { font-size:9px; color:var(--dim); letter-spacing:.3px; }
        .input-actions { display:flex; gap:4px; }
        .input-action {
          font-size:9px; color:var(--dim); padding:2px 8px;
          border-radius:5px; cursor:pointer; transition:.12s;
          background:none; border:1px solid var(--border);
          font-family:'JetBrains Mono',monospace;
          display:flex; align-items:center; gap:4px;
        }
        .input-action:hover { color:var(--cyan); border-color:rgba(0,229,255,.25); }
        .input-action svg { width:9px; height:9px; stroke:currentColor; fill:none; stroke-width:2; }

        /* ── SCROLL TO BOTTOM BUTTON ── */
        .scroll-btn {
          position:absolute; bottom:80px; right:20px;
          width:36px; height:36px; border-radius:50%;
          background:var(--bg3); border:1px solid var(--border);
          color:var(--cyan); cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          box-shadow:0 4px 16px rgba(0,0,0,.4);
          transition:.2s; z-index:10;
          animation:fadeIn .2s ease;
        }
        .scroll-btn:hover { background:rgba(0,229,255,.08); border-color:var(--cyan); }
        .scroll-btn svg { width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:2.5; }

        /* ── RESPONSIVE ── */
        @media(max-width:640px) {
          .header { padding:0 10px; height:50px; }
          .header-subtitle { display:none; }
          .header-name { display:none; }
          .chat-area { padding:12px 10px; }
          .welcome { padding:16px 14px 10px; }
          .welcome-title { font-size:18px; }
          .input-wrapper { padding:10px 10px 8px; }
          .bubble { font-size:12px; padding:10px 12px; }
          .hints-section { max-width:100%; }
        }
      `}</style>

      <div className="page">
        {/* ── HEADER ── */}
        <header className="header">
          <div className="header-logo">
            <img
              src="/images/nexusai.png"
              alt="NEXUS"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <div className="header-brand">
            <div className="header-title">NEXUS AI</div>
            <div className="header-subtitle">Support Agent</div>
          </div>

          <div className="header-pills">
            <span
              className="header-plan-pill"
              style={{ color: getPlanColor(), borderColor: `${getPlanColor()}33` }}
            >
              {plan.toUpperCase()}
            </span>
          </div>

          <div className="header-user">
            <img
              className="header-avatar"
              src={avatarUrl}
              alt="avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/images/nexusai.png";
              }}
            />
            <span className="header-name">@{username}</span>
          </div>

          <a href="/dashboard" className="header-btn header-btn-ghost">
            <svg viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            Dashboard
          </a>

          {messages.length > 0 && (
            <button className="header-btn btn-clear" onClick={handleClearChat}>
              <svg viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
              </svg>
              Clear
            </button>
          )}
        </header>

        {/* ── STATUS BAR ── */}
        <div className="status-bar">
          <div className="status-left">
            <div className="status-indicator">
              <div className="status-dot" />
              <span className="status-text">ONLINE</span>
            </div>
            <span className="status-sep">·</span>
            <div className="status-model">
              <div className="status-model-dot" />
              Gemini 3.5 Flash
            </div>
            <span className="status-sep">·</span>
            <span style={{ fontSize: 9, color: "var(--dim2)", letterSpacing: ".3px" }}>
              Support Active
            </span>
          </div>
          <div className="status-right">
            {messages.length > 0 && (
              <span className="msg-count">
                {messages.length} message{messages.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* ── CHAT AREA ── */}
        <div className="chat-area" ref={chatRef}>
          {showWelcome && messages.length === 0 && (
            <WelcomeScreen
              displayName={displayName}
              avatarUrl={avatarUrl}
              plan={plan}
              credits={credits}
              onHint={handleHint}
            />
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              displayName={displayName}
              avatarUrl={avatarUrl}
              onFeedback={handleFeedback}
            />
          ))}

          {isProcessing && <TypingIndicator />}
        </div>

        {/* ── INPUT AREA ── */}
        <div className="input-wrapper">
          <div className="input-row">
            <div className="input-box">
              <textarea
                ref={textareaRef}
                className="user-textarea"
                placeholder="Describe your issue or ask a question…"
                rows={1}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isProcessing}
                maxLength={2000}
              />
              {charCount > 100 && (
                <span
                  className={`char-count ${charCount > 1800 ? "over" : charCount > 1400 ? "warn" : ""}`}
                >
                  {charCount}/2000
                </span>
              )}
            </div>
            <button
              className="send-btn"
              onClick={sendMsg}
              disabled={isProcessing || !input.trim()}
              title="Send (Enter)"
            >
              {isProcessing ? (
                <svg viewBox="0 0 24 24" style={{ animation: "spin .8s linear infinite" }}>
                  <circle cx="12" cy="12" r="9" strokeDasharray="32" strokeDashoffset="8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
          <div className="input-footer">
            <span className="input-hint">
              <kbd style={{ background: "var(--bg3)", border: "1px solid var(--border)", padding: "1px 5px", borderRadius: 3, fontSize: 9 }}>Enter</kbd>{" "}
              Send &nbsp;·&nbsp;
              <kbd style={{ background: "var(--bg3)", border: "1px solid var(--border)", padding: "1px 5px", borderRadius: 3, fontSize: 9 }}>Shift+Enter</kbd>{" "}
              New line
            </span>
            <div className="input-actions">
              <a href="https://discord.gg/HuGtbRvD" target="_blank" rel="noopener noreferrer" className="input-action">
                <svg viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>
                Discord
              </a>
              <a href="mailto:arifiinytid@gmail.com" className="input-action">
                <svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Email
              </a>
            </div>
          </div>
        </div>

        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </>
  );
}