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
   SVG ICON COMPONENTS
───────────────────────────────────────────────────────────────────────────── */
const Icons = {
  Plugin: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="10" height="11" rx="2"/>
      <path d="M12 13v9"/>
      <path d="M8 17h8"/>
      <path d="M9 2v4M15 2v4"/>
    </svg>
  ),
  Wrench: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  CreditCard: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
  Zap: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  Bot: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <circle cx="12" cy="5" r="2"/>
      <path d="M12 7v4"/>
      <line x1="8" y1="16" x2="8" y2="16"/>
      <line x1="16" y1="16" x2="16" y2="16"/>
    </svg>
  ),
  AlertTriangle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  Key: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  ),
  Ticket: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Send: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  Copy: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  ThumbUp: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/>
      <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
    </svg>
  ),
  ThumbDown: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/>
      <path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/>
    </svg>
  ),
  Dashboard: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>
  ),
  Discord: () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
    </svg>
  ),
  Mail: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  Loader: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="6"/>
      <line x1="12" y1="18" x2="12" y2="22"/>
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
      <line x1="2" y1="12" x2="6" y2="12"/>
      <line x1="18" y1="12" x2="22" y2="12"/>
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
    </svg>
  ),
  Shield: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Wifi: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
      <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
  ),
  WifiOff: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
  ),
  Sparkle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
      <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/>
      <path d="M5 16l.5 1.5L7 18l-1.5.5L5 20l-.5-1.5L3 18l1.5-.5z"/>
    </svg>
  ),
  Info: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  ),
  ExternalLink: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  ),
  User: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Code: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>
  ),
  Star: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  Headphones: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
    </svg>
  ),
};

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */
const HINT_CATEGORIES = [
  {
    label: "Plugin & Studio",
    color: "var(--cyan)",
    hints: [
      { Icon: Icons.Plugin, text: "My Studio plugin shows Studio: OFF, how do I fix it?" },
      { Icon: Icons.Wrench, text: "How do I install the NEXUS AI Studio plugin?" },
    ],
  },
  {
    label: "Credits & Billing",
    color: "var(--yellow)",
    hints: [
      { Icon: Icons.CreditCard, text: "I already paid but I still haven't received my credits" },
      { Icon: Icons.Zap, text: "How do I claim my daily free credits?" },
    ],
  },
  {
    label: "AI Chat Help",
    color: "var(--purple)",
    hints: [
      { Icon: Icons.Bot, text: "How do I write better prompts to get good AI output?" },
      { Icon: Icons.AlertTriangle, text: "The AI Chat is giving me incomplete or wrong results" },
    ],
  },
  {
    label: "Account Issues",
    color: "var(--green)",
    hints: [
      { Icon: Icons.Key, text: "I can't log in to my account, what should I do?" },
      { Icon: Icons.Ticket, text: "My redeem code says it's invalid or already used" },
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
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks
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

  // Wrap consecutive <li> in <ul>/<ol>
  html = html.replace(
    /(<li(?:\s[^>]*)?>[\s\S]*?<\/li>(\s*<li(?:\s[^>]*)?>[\s\S]*?<\/li>)*)/g,
    (match) => {
      if (match.includes("ol-item")) return `<ol>${match}</ol>`;
      return `<ul>${match}</ul>`;
    }
  );

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Paragraphs & line breaks
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br/>");

  if (!html.startsWith("<")) html = "<p>" + html;
  if (!html.endsWith(">")) html = html + "</p>";

  return html;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SYSTEM PROMPT BUILDER
───────────────────────────────────────────────────────────────────────────── */
function buildSystemPrompt(
  displayName: string,
  username: string,
  plan: string,
  credits: string
): string {
  return `
You are NEXUS AI Support Agent — the official technical support assistant for NEXUS AI, an advanced Roblox Developer AI Assistant platform built by NEXUS STUDIO (FIINYTID25).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT USER SESSION
  Display Name : ${displayName}
  Username     : @${username}
  Plan         : ${plan.toUpperCase()}
  Credits      : ${credits} CR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IDENTITY & ROLE
You are a NEXUS AI Support Agent. Your ONLY job is:
  - Diagnosing and resolving platform technical issues
  - Guiding users step-by-step through platform features
  - Helping users understand and fix configuration errors
  - Directing users to the correct resource, page, or escalation channel
  - Providing personalized tips to improve AI prompt quality
  - Answering billing, credits, and account questions

You are NOT a code-writing AI. The main NEXUS AI Chat at /chats handles all code generation.
You must NEVER write, generate, complete, explain, or hint at any Lua, Luau, or programming code.

COMPLETE PLATFORM KNOWLEDGE BASE

CORE FEATURES:
1. AI Chat (/chats)
   - Generates professional Lua/Luau scripts for Roblox games
   - Debugs existing code and suggests optimizations
   - Builds complete GUI systems, game systems, NPCs, etc.
   - Available Models: Gemini 3.5 Flash, DeepSeek
   - Free users: basic models only | Pro users: ALL models unlocked

2. GUI Editor (/gui-editor or within /chats)
   - Visual drag-and-drop builder for Roblox interfaces
   - No coding required — design visually
   - Best browser: Google Chrome (latest version required)

3. Studio Plugin
   - Real-time injection of AI-generated code directly into Roblox Studio
   - Download: Settings page or Roblox Creator Store
   - Creator Store URL: https://create.roblox.com/store/asset/91870814099475/NEXUS-AI
   - Required Studio permissions: Allow HTTP Requests + Allow Script Injection (both ON)
   - Status: "Studio: ON" (green) = connected | "Studio: OFF" (red) = needs troubleshooting

4. Dashboard (/dashboard)
   - Create and manage AI projects
   - Free: max 3 projects | Pro: max 10 projects | Owner/Admin: unlimited

NAVIGATION PAGES:
  /           — Home/Landing
  /login.html — Login and registration
  /dashboard  — Project Hub
  /chats/[id] — Main AI Chat
  /payment    — Credits and plan upgrade
  /agent      — This Support Agent
  /inbox      — Notifications
  Settings    — Via user dropdown (top right)

CREDITS & PLANS:
  FREE PLAN: 30 CR on signup, +2 CR daily
  PRO PLAN: 200 CR on activation, +25 CR daily, all models unlocked
  OWNER/UNLIMITED: Unlimited credits, all features
  Credit Packs: 50 CR, 80 CR, 150 CR, 500 CR (at /payment)
  Payment: OVO or DANA (Indonesian e-wallets) — manual processing, allow up to 24 hours

TROUBLESHOOTING:

Problem: "Studio: OFF" / Plugin Not Connecting
  1. Open Roblox Studio
  2. File > Settings > Security tab
  3. Enable "Allow HTTP Requests" (TRUE) and "Allow Script Injection" (TRUE)
  4. Close Studio completely, relaunch
  5. Refresh NEXUS AI page
  Still OFF? Reinstall plugin from /settings, check antivirus/firewall blocking localhost

Problem: Credits Not Received After Payment
  1. Wait up to 24 hours (manual verification)
  2. Email arifiinytid@gmail.com with subject "Credit Request - @username"
  3. Attach: payment screenshot, exact @username, amount paid, payment method

Problem: Can't Log In
  1. Hard refresh: Ctrl+Shift+R
  2. Clear cache: Ctrl+Shift+Delete
  3. Try Incognito (Ctrl+Shift+N)
  4. Disable extensions / VPN
  5. Try Chrome — contact arifiinytid@gmail.com if issue persists

Problem: AI Chat Giving Incomplete Output
  1. Be more specific with your prompt
  2. Switch to Gemini 3.5 Flash
  3. Break large requests into smaller parts
  4. Say "continue from where you stopped" in same chat if script is cut off

Problem: AI Response Is Very Slow
  1. Switch to Gemini 3.5 Flash Lite
  2. Check internet connection
  3. Refresh page if stuck
  4. Check credits — 0 CR means requests won't process

Problem: GUI Editor Glitchy
  1. Use Google Chrome (required)
  2. Update Chrome, clear cache, disable extensions

Problem: Redeem Code Not Working
  1. Settings > Redeem Code
  2. Code is case-sensitive — copy exactly, no spaces
  3. Codes are single-use and have expiry dates
  4. Contact support if still failing

PROMPT IMPROVEMENT TIPS:
  BAD:  "make gui"
  GOOD: "Create a loading screen GUI with dark background, centered title in gradient color, animated progress bar 0–100% over 3 seconds using TweenService."

  BAD:  "npc follow"
  GOOD: "Create an NPC using PathfindingService to follow nearest player within 30 studs, play walk animation while moving, idle animation when standing still."

  BAD:  "shop system"
  GOOD: "Create a shop ScreenGui with item cards showing names, icons, prices in Credits. Items: Speed Boost (50 CR) and Jump Boost (30 CR). Include close button and purchase confirmation popup."

  Golden rules for better prompts: describe VISUAL appearance, BEHAVIOR, INTERACTIONS, which SERVICES to use, WHERE it should be, and break complex systems into MULTIPLE requests.

SUPPORT CHANNELS:
  Email: arifiinytid@gmail.com
  Discord: discord.gg/HuGtbRvD
  In-app Bug Report: Settings > Report Issue
  Payment/Credits: Always include screenshot + @username in email

BEHAVIORAL RULES:

YOU MUST:
  - Only answer questions about the NEXUS AI platform ecosystem
  - Address the user by name: ${displayName}
  - Tailor responses based on user's plan (${plan})
  - Redirect code requests to /chats
  - Use **bold** for UI elements and key actions
  - Be patient, encouraging, and friendly
  - Lead with the solution, keep responses concise and scannable
  - End responses with a helpful follow-up offer

YOU MUST NEVER:
  - Write, generate, complete, or hint at any Lua/Luau code
  - Make up platform features, prices, or details not in this knowledge base
  - Answer questions unrelated to NEXUS AI

CODE REQUEST REDIRECT (use this exact pattern):
  "I'm the Support Agent — script writing is handled by the AI Chat, not me. Head to [NEXUS AI Chat → /dashboard](/dashboard) and open or create a project there.

  **Prompt tip:** [give specific improved version of their request]

  Anything else I can help with on the support side?"

TONE & FORMAT:
  - Warm, professional, slightly playful
  - Short scannable responses — no walls of text
  - Use **bold** for all UI elements: **Settings**, **File > Settings**, **Studio: ON**
  - Use numbered lists for step-by-step instructions
  - Use > blockquotes for prompt examples
  - End with a friendly offer if issue is resolved
  - Acknowledge frustration before jumping to the solution
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
        <span className="typing-label">Analyzing your request...</span>
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
            <span className="user-name-tag">{displayName}</span>
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
              <button
                className="msg-action-btn"
                onClick={handleCopy}
                title="Copy response"
                aria-label="Copy response"
              >
                {copied ? <Icons.Check /> : <Icons.Copy />}
              </button>
              {onFeedback && (
                <>
                  <button
                    className={`msg-action-btn ${msg.liked === true ? "active-like" : ""}`}
                    onClick={() => onFeedback(msg.id, true)}
                    title="Helpful"
                    aria-label="Mark as helpful"
                  >
                    <Icons.ThumbUp />
                  </button>
                  <button
                    className={`msg-action-btn ${msg.liked === false ? "active-dislike" : ""}`}
                    onClick={() => onFeedback(msg.id, false)}
                    title="Not helpful"
                    aria-label="Mark as not helpful"
                  >
                    <Icons.ThumbDown />
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
                (e.target as HTMLImageElement).style.display = "none";
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

function WelcomeScreen({ displayName, avatarUrl, plan, credits, onHint }: WelcomeProps) {
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
          NEXUS AI &nbsp;·&nbsp; SUPPORT AGENT
        </div>

        <h1 className="welcome-title">
          How can I <span className="title-accent">help you</span>?
        </h1>

        <p className="welcome-text">
          Hi, <strong style={{ color: "#fff" }}>{displayName}</strong>! I&apos;m your NEXUS AI Support Agent.
          I handle the Studio plugin, credits, login issues, and everything in between.
        </p>

        <div className="welcome-stats">
          <div className="w-stat">
            <div className="w-stat-icon" style={{ color: "var(--yellow)" }}>
              <Icons.Zap />
            </div>
            <span className="w-stat-val" style={{ color: "var(--yellow)" }}>{credits} CR</span>
            <span className="w-stat-lbl">Credits</span>
          </div>
          <div className="w-stat-divider" />
          <div className="w-stat">
            <div className="w-stat-icon" style={{ color: getPlanColor() }}>
              <Icons.Star />
            </div>
            <span className="w-stat-val" style={{ color: getPlanColor() }}>{plan.toUpperCase()}</span>
            <span className="w-stat-lbl">Plan</span>
          </div>
          <div className="w-stat-divider" />
          <div className="w-stat">
            <div className="w-stat-icon" style={{ color: "var(--green)" }}>
              <Icons.Headphones />
            </div>
            <span className="w-stat-val" style={{ color: "var(--green)" }}>READY</span>
            <span className="w-stat-lbl">Support</span>
          </div>
        </div>
      </div>

      <div className="hints-section">
        <p className="hints-label">Common topics — tap to get started</p>
        <div className="hint-cat-tabs">
          {HINT_CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              className={`hint-cat-tab ${activeCategory === i ? "active" : ""}`}
              style={activeCategory === i ? { borderColor: cat.color, color: cat.color } : {}}
              onClick={() => setActiveCategory(i)}
              aria-pressed={activeCategory === i}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="hint-list">
          {HINT_CATEGORIES[activeCategory].hints.map((h) => {
            const HintIcon = h.Icon;
            return (
              <button
                key={h.text}
                className="hint-chip"
                style={{ "--hint-color": HINT_CATEGORIES[activeCategory].color } as React.CSSProperties}
                onClick={() => onHint(h.text)}
              >
                <span className="hint-icon"><HintIcon /></span>
                <span className="hint-text">{h.text}</span>
                <span className="hint-arrow"><Icons.ChevronRight /></span>
              </button>
            );
          })}
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
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ── AUTH CHECK ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("nexus_session");
      if (!raw) { window.location.replace("/"); return; }
      const sess: NexusSession = JSON.parse(raw);
      if (!sess?.user?.username) { window.location.replace("/"); return; }
      if (Date.now() - (sess.loginTime || 0) > 86400000 * 7) {
        localStorage.removeItem("nexus_session");
        window.location.replace("/");
        return;
      }

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
    const el = chatRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isProcessing]);

  /* ── SCROLL BUTTON VISIBILITY ── */
  const handleChatScroll = useCallback(() => {
    const el = chatRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 200);
  }, []);

  const scrollToBottom = () => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  };

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
        "**Script writing is handled by NEXUS AI Chat, not the Support Agent.**",
        "",
        "Open or create a project in **[Dashboard → /dashboard](/dashboard)**, then ask the same thing in the AI Chat — it'll generate and inject code straight into Roblox Studio with one click.",
        "",
        "**Prompt tip** — for better AI output, try something like:",
        `> *"${tip}"*`,
        "",
        "Is there anything else I can help you with on the support side?",
      ].join("\n");
      addMessage("ai", redirectMsg);
      return;
    }

    setIsProcessing(true);

    const conversationHistory = messages
      .slice(-12)
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
        "Received an empty response. Please try again or contact support at **arifiinytid@gmail.com**.";
      addMessage("ai", reply);
    } catch (err) {
      const errMsg = [
        "**Connection error** — couldn't reach the server.",
        "",
        `Error details: \`${err instanceof Error ? err.message : "Unknown error"}\``,
        "",
        "Please try again in a moment. If this persists, reach out at **arifiinytid@gmail.com** or join our **[Discord](https://discord.gg/HuGtbRvD)**.",
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
    setShowScrollBtn(false);
  };

  const getPlanColor = () => {
    switch (plan.toLowerCase()) {
      case "pro": return "var(--cyan)";
      case "owner": return "var(--yellow)";
      default: return "var(--green)";
    }
  };

  if (!authChecked) {
    return (
      <div className="auth-loading">
        <div className="auth-spinner" />
        <p className="auth-text">AUTHENTICATING</p>
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          .auth-loading{position:fixed;inset:0;background:#030312;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;font-family:'JetBrains Mono',monospace;}
          .auth-spinner{width:36px;height:36px;border:2px solid rgba(0,229,255,.1);border-top:2px solid #00e5ff;border-radius:50%;animation:spin .8s linear infinite;}
          .auth-text{color:#3a4a7a;font-size:10px;letter-spacing:3px;}
        `}</style>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

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
          --header-h: 56px;
          --status-h: 36px;
        }

        html, body {
          height: 100%;
          font-family: 'JetBrains Mono', monospace;
          background: var(--bg);
          color: var(--text);
          font-size: 13px;
          overflow: hidden;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        body::before {
          content: '';
          position: fixed; inset: 0;
          background:
            radial-gradient(ellipse at 80% -5%, rgba(136,0,255,.14) 0%, transparent 45%),
            radial-gradient(ellipse at -5% 85%, rgba(0,229,255,.06) 0%, transparent 40%),
            linear-gradient(rgba(0,229,255,.006) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,229,255,.006) 1px, transparent 1px);
          background-size: auto, auto, 40px 40px, 40px 40px;
          pointer-events: none; z-index: 0;
        }

        /* ── PAGE LAYOUT ── */
        .page {
          display: flex; flex-direction: column;
          height: 100vh; height: 100dvh;
          position: relative; z-index: 1;
          overflow: hidden;
        }

        /* ── HEADER ── */
        .header {
          padding: 0 16px;
          height: var(--header-h);
          background: rgba(3,3,18,.98);
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; gap: 10px;
          flex-shrink: 0;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          position: relative; z-index: 10;
        }
        .header::after {
          content: '';
          position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(0,229,255,.3), transparent);
        }
        .header-logo {
          width: 34px; height: 34px;
          border-radius: 9px; overflow: hidden; flex-shrink: 0;
          border: 1px solid rgba(0,229,255,.2);
          box-shadow: 0 0 12px rgba(0,229,255,.12);
        }
        .header-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .header-brand { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        .header-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 11px; font-weight: 800;
          background: linear-gradient(90deg, var(--cyan), var(--purple));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: .8px; line-height: 1.2;
        }
        .header-subtitle { font-size: 9px; color: var(--dim2); letter-spacing: .3px; }
        .header-pills { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .header-plan-pill {
          padding: 3px 10px; border-radius: 12px;
          font-size: 8px; font-weight: 700; font-family: 'Orbitron', sans-serif;
          letter-spacing: .5px;
          background: rgba(0,229,255,.06);
          border: 1px solid rgba(0,229,255,.18);
          white-space: nowrap;
        }
        .header-user {
          display: flex; align-items: center; gap: 7px;
          padding: 3px 10px 3px 4px;
          border-radius: 20px;
          border: 1px solid var(--border);
          background: var(--bg2);
          flex-shrink: 0; min-width: 0;
        }
        .header-avatar {
          width: 26px; height: 26px; border-radius: 50%;
          border: 1.5px solid var(--cyan2);
          object-fit: cover; background: var(--bg3); flex-shrink: 0;
        }
        .header-name {
          font-size: 10px; color: var(--text); font-weight: 500;
          max-width: 80px; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis;
        }
        .header-btn {
          height: 32px; padding: 0 11px;
          border-radius: 8px;
          font-size: 10px; font-family: 'JetBrains Mono', monospace;
          cursor: pointer; transition: .15s; flex-shrink: 0;
          display: flex; align-items: center; gap: 5px;
          text-decoration: none; white-space: nowrap;
          border: 1px solid;
        }
        .header-btn svg { width: 11px; height: 11px; }
        .header-btn-ghost {
          background: rgba(0,229,255,.05);
          border-color: rgba(0,229,255,.16);
          color: var(--cyan);
        }
        .header-btn-ghost:hover {
          background: rgba(0,229,255,.1);
          border-color: var(--cyan);
        }
        .btn-clear {
          background: rgba(255,45,107,.04);
          border-color: rgba(255,45,107,.14);
          color: rgba(255,45,107,.6);
        }
        .btn-clear:hover {
          background: rgba(255,45,107,.1);
          border-color: var(--pink);
          color: var(--pink);
        }

        /* ── STATUS BAR ── */
        .status-bar {
          padding: 0 16px;
          height: var(--status-h);
          background: rgba(0,255,170,.018);
          border-bottom: 1px solid rgba(0,255,170,.06);
          display: flex; align-items: center; justify-content: space-between;
          flex-shrink: 0;
          gap: 8px;
        }
        .status-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .status-indicator { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
        .status-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 6px var(--green);
          flex-shrink: 0;
          animation: glow-dot 2.5s ease infinite;
        }
        @keyframes glow-dot {
          0%,100%{ box-shadow: 0 0 4px var(--green) }
          50%{ box-shadow: 0 0 10px var(--green), 0 0 20px rgba(0,255,170,.25) }
        }
        .status-text { font-size: 9px; color: var(--green); letter-spacing: 1px; font-weight: 600; }
        .status-sep { color: var(--dim); font-size: 9px; flex-shrink: 0; }
        .status-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .msg-count {
          font-size: 9px; color: var(--dim);
          background: rgba(0,0,0,.3); border: 1px solid var(--border);
          padding: 2px 8px; border-radius: 8px;
          white-space: nowrap;
        }

        /* ── CHAT AREA ── */
        .chat-area {
          flex: 1; overflow-y: auto;
          padding: 20px 16px; display: flex;
          flex-direction: column; gap: 16px;
          scroll-behavior: smooth;
          position: relative;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }
        .chat-area::-webkit-scrollbar { width: 3px; }
        .chat-area::-webkit-scrollbar-thumb { background: rgba(0,229,255,.12); border-radius: 2px; }
        .chat-area::-webkit-scrollbar-track { background: transparent; }

        /* ── SCROLL TO BOTTOM ── */
        .scroll-to-bottom {
          position: absolute; bottom: 80px; right: 16px;
          width: 36px; height: 36px; border-radius: 50%;
          background: var(--bg3); border: 1px solid rgba(0,229,255,.25);
          color: var(--cyan); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 16px rgba(0,0,0,.5);
          transition: .2s; z-index: 10;
          animation: fadeIn .2s ease;
        }
        .scroll-to-bottom:hover { background: rgba(0,229,255,.1); border-color: var(--cyan); }
        .scroll-to-bottom svg { width: 14px; height: 14px; }

        /* ── WELCOME ── */
        .welcome {
          display: flex; flex-direction: column;
          align-items: center;
          flex: 1; padding: 16px 16px 10px;
          animation: fadeIn .4s ease;
          gap: 0;
        }
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        .welcome-top {
          display: flex; flex-direction: column;
          align-items: center; gap: 12px;
          text-align: center; margin-bottom: 20px;
          width: 100%; max-width: 480px;
        }
        .welcome-avatar-wrap { position: relative; width: 72px; height: 72px; flex-shrink: 0; }
        .welcome-avatar-ring {
          position: absolute; inset: -4px; border-radius: 50%;
          border: 1.5px solid transparent;
          background: linear-gradient(135deg, rgba(0,229,255,.5), rgba(136,0,255,.5)) border-box;
          -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: destination-out; mask-composite: exclude;
          animation: rotate 4s linear infinite;
        }
        @keyframes rotate { to{transform:rotate(360deg)} }
        .welcome-avatar {
          width: 72px; height: 72px; border-radius: 50%; overflow: hidden;
          border: 2px solid rgba(0,229,255,.2);
        }
        .welcome-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .welcome-badge {
          display: flex; align-items: center; gap: 7px;
          font-size: 8.5px; font-family: 'Orbitron', sans-serif; letter-spacing: 1.5px;
          color: var(--dim2);
          background: rgba(0,229,255,.04);
          border: 1px solid var(--border); padding: 5px 16px; border-radius: 20px;
        }
        .badge-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 6px var(--green);
          animation: glow-dot 2.5s ease infinite;
          flex-shrink: 0;
        }
        .welcome-title {
          font-family: 'Orbitron', sans-serif;
          font-size: clamp(18px, 5vw, 24px); font-weight: 900;
          color: white; letter-spacing: .5px; line-height: 1.2;
        }
        .title-accent {
          background: linear-gradient(135deg, var(--cyan), var(--purple));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .welcome-text { font-size: 12px; line-height: 1.8; color: var(--text); }
        .welcome-stats {
          display: flex; align-items: stretch; gap: 0;
          background: var(--bg2); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden; width: 100%;
        }
        .w-stat {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          padding: 12px 8px; gap: 4px;
        }
        .w-stat-icon { width: 16px; height: 16px; display: flex; align-items: center; }
        .w-stat-icon svg { width: 100%; height: 100%; }
        .w-stat-val {
          font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 700;
          line-height: 1;
        }
        .w-stat-lbl { font-size: 8px; color: var(--dim2); letter-spacing: .3px; text-transform: uppercase; }
        .w-stat-divider { width: 1px; background: var(--border); flex-shrink: 0; align-self: stretch; }

        /* ── HINT CHIPS ── */
        .hints-section { width: 100%; max-width: 480px; }
        .hints-label { font-size: 9px; color: var(--dim); letter-spacing: .5px; margin-bottom: 10px; text-transform: uppercase; }
        .hint-cat-tabs {
          display: flex; gap: 6px; flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .hint-cat-tab {
          padding: 5px 12px; border-radius: 8px;
          font-size: 9px; font-family: 'JetBrains Mono', monospace;
          background: var(--bg2); border: 1px solid var(--border);
          color: var(--dim2); cursor: pointer; transition: .15s;
          flex-shrink: 0;
        }
        .hint-cat-tab.active { background: rgba(0,229,255,.05); }
        .hint-cat-tab:hover:not(.active) { color: var(--text); border-color: var(--dim2); }
        .hint-list { display: flex; flex-direction: column; gap: 7px; }
        .hint-chip {
          background: var(--bg2); border: 1px solid var(--border);
          border-radius: 10px; padding: 12px 14px;
          font-size: 11.5px; color: var(--text);
          cursor: pointer; text-align: left; transition: .18s;
          display: flex; align-items: center; gap: 10px;
          line-height: 1.4; font-family: 'JetBrains Mono', monospace;
          position: relative; overflow: hidden; width: 100%;
        }
        .hint-chip::before {
          content: '';
          position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
          background: var(--hint-color, var(--cyan));
          opacity: 0; transition: .18s; border-radius: 0 2px 2px 0;
        }
        .hint-chip:hover {
          border-color: var(--hint-color, var(--cyan));
          color: white;
          background: rgba(0,229,255,.02);
        }
        .hint-chip:hover::before { opacity: 1; }
        .hint-icon {
          flex-shrink: 0; width: 18px; height: 18px;
          display: flex; align-items: center; justify-content: center;
          color: var(--hint-color, var(--cyan));
        }
        .hint-icon svg { width: 16px; height: 16px; }
        .hint-text { flex: 1; }
        .hint-arrow {
          width: 14px; height: 14px; flex-shrink: 0;
          opacity: 0; transition: .18s; color: var(--hint-color, var(--cyan));
          display: flex; align-items: center;
        }
        .hint-arrow svg { width: 100%; height: 100%; }
        .hint-chip:hover .hint-arrow { opacity: 1; }

        /* ── MESSAGES ── */
        .msg-row {
          display: flex; gap: 10px;
          animation: msgIn .25s ease;
          flex-shrink: 0;
        }
        @keyframes msgIn {
          from{opacity:0;transform:translateY(6px)}
          to{opacity:1;transform:none}
        }
        .msg-row.user { flex-direction: row-reverse; }
        .avatar {
          width: 32px; height: 32px; border-radius: 50%; overflow: hidden;
          flex-shrink: 0; background: var(--bg3);
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700;
          border: 1.5px solid var(--border);
          position: relative; align-self: flex-start;
        }
        .avatar img {
          width: 100%; height: 100%; object-fit: cover;
          position: absolute; inset: 0;
        }
        .avatar-fallback { color: var(--cyan); position: relative; z-index: 1; }
        .user-fallback { color: var(--purple); }
        .msg-wrap {
          display: flex; flex-direction: column;
          max-width: 82%; min-width: 0;
        }
        .user-wrap { align-items: flex-end; }
        .msg-name {
          font-size: 9px; color: var(--dim);
          margin-bottom: 4px; letter-spacing: .3px;
          display: flex; align-items: center; gap: 5px;
        }
        .user-name-tag { color: var(--text); }
        .ai-name-tag { color: var(--cyan); font-weight: 600; }
        .ai-agent-tag {
          font-size: 8px; padding: 1px 6px; border-radius: 4px;
          background: rgba(0,229,255,.08); color: var(--dim2);
          border: 1px solid rgba(0,229,255,.1);
        }
        .bubble {
          padding: 12px 16px; border-radius: 12px;
          line-height: 1.75; font-size: 12.5px;
          word-break: break-word; overflow-wrap: break-word;
        }
        .user-bubble {
          background: linear-gradient(135deg, rgba(0,229,255,.08), rgba(136,0,255,.07));
          border: 1px solid rgba(0,229,255,.18);
          border-radius: 12px 3px 12px 12px;
          color: white;
        }
        .ai-bubble {
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 3px 12px 12px 12px;
          color: var(--text);
        }

        /* ── Markdown inside bubble ── */
        .bubble p { margin: 0 0 8px; }
        .bubble p:last-child { margin-bottom: 0; }
        .bubble ul { padding-left: 18px; margin: 8px 0; }
        .bubble ol { padding-left: 18px; margin: 8px 0; }
        .bubble li { margin-bottom: 5px; line-height: 1.7; }
        .bubble strong { color: white; }
        .bubble em.em-cyan { color: var(--cyan); font-style: normal; }
        .bubble h1, .bubble h2, .bubble h3 {
          color: white; margin: 12px 0 6px;
          font-family: 'Orbitron', sans-serif;
          font-size: 11px; font-weight: 700; letter-spacing: .5px;
        }
        .bubble h1:first-child, .bubble h2:first-child, .bubble h3:first-child { margin-top: 0; }
        .bubble code {
          background: rgba(0,229,255,.08);
          padding: 2px 6px; border-radius: 4px;
          font-size: 11px; color: var(--cyan);
          word-break: break-all;
          border: 1px solid rgba(0,229,255,.1);
          font-family: 'JetBrains Mono', monospace;
        }
        .bubble pre {
          background: rgba(0,0,0,.5);
          border: 1px solid var(--border);
          border-radius: 8px; padding: 12px 14px;
          overflow-x: auto; margin: 8px 0;
        }
        .bubble pre code {
          background: none; border: none;
          padding: 0; color: var(--green);
          font-size: 11.5px; word-break: normal;
        }
        .bubble a {
          color: var(--cyan); text-decoration: none;
          border-bottom: 1px solid rgba(0,229,255,.3);
          transition: border-color .15s;
        }
        .bubble a:hover { border-bottom-color: var(--cyan); }
        .bubble blockquote {
          border-left: 2.5px solid rgba(0,229,255,.35);
          padding: 8px 12px; color: var(--dim2);
          margin: 8px 0; border-radius: 0 6px 6px 0;
          background: rgba(0,229,255,.03);
          font-style: italic;
        }
        .bubble hr { border: none; border-top: 1px solid var(--border); margin: 10px 0; }

        /* ── MSG FOOTER ── */
        .msg-footer {
          display: flex; align-items: center; gap: 6px; margin-top: 5px;
        }
        .msg-footer.right { flex-direction: row-reverse; }
        .msg-time { font-size: 9px; color: var(--dim); }
        .msg-actions { display: flex; align-items: center; gap: 2px; }
        .msg-action-btn {
          width: 24px; height: 24px;
          background: none; border: none; cursor: pointer;
          color: var(--dim); border-radius: 5px; padding: 4px;
          display: flex; align-items: center; justify-content: center;
          transition: .14s;
        }
        .msg-action-btn svg { width: 12px; height: 12px; }
        .msg-action-btn:hover { color: var(--cyan); background: rgba(0,229,255,.08); }
        .msg-action-btn.active-like { color: var(--green); }
        .msg-action-btn.active-dislike { color: var(--pink); }

        /* ── TYPING ── */
        .typing-bubble {
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 3px 12px 12px 12px;
          padding: 12px 16px;
          display: flex; gap: 6px; align-items: center;
        }
        .dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--cyan);
          animation: dotPulse 1.4s infinite;
          flex-shrink: 0;
        }
        @keyframes dotPulse {
          0%,60%,100%{opacity:.2;transform:scale(.85)}
          30%{opacity:1;transform:scale(1.1)}
        }
        .typing-label {
          font-size: 10px; color: var(--dim2); margin-left: 4px;
          letter-spacing: .3px;
        }

        /* ── INPUT AREA ── */
        .input-wrapper {
          flex-shrink: 0;
          border-top: 1px solid var(--border);
          background: rgba(3,3,18,.99);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          padding: 12px 14px 10px;
          position: relative; z-index: 5;
        }
        .input-row { display: flex; gap: 8px; align-items: flex-end; }
        .input-box { flex: 1; position: relative; min-width: 0; }
        .user-textarea {
          width: 100%;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 11px 44px 11px 14px;
          color: white;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          resize: none;
          min-height: 46px; max-height: 140px;
          outline: none; line-height: 1.55;
          transition: border-color .18s, box-shadow .18s;
          display: block;
          -webkit-appearance: none;
        }
        .user-textarea::placeholder { color: var(--dim); }
        .user-textarea:focus {
          border-color: rgba(0,229,255,.3);
          box-shadow: 0 0 0 3px rgba(0,229,255,.05);
        }
        .user-textarea:disabled { opacity: .4; cursor: not-allowed; }
        .char-count {
          position: absolute; bottom: 9px; right: 12px;
          font-size: 9px; color: var(--dim); pointer-events: none;
          transition: .15s; font-family: 'JetBrains Mono', monospace;
        }
        .char-count.warn { color: var(--yellow); }
        .char-count.over { color: var(--pink); }
        .send-btn {
          width: 46px; height: 46px; flex-shrink: 0;
          background: linear-gradient(135deg, var(--cyan), var(--purple));
          border: none; border-radius: 12px;
          color: #030312; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: .2s; box-shadow: 0 4px 16px rgba(0,229,255,.2);
          align-self: flex-end;
        }
        .send-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,229,255,.3);
        }
        .send-btn:active:not(:disabled) { transform: translateY(0); }
        .send-btn:disabled { opacity: .25; cursor: not-allowed; box-shadow: none; transform: none; }
        .send-btn svg { width: 17px; height: 17px; }
        .send-btn .spin-icon { animation: spin .7s linear infinite; }
        @keyframes spin { to{transform:rotate(360deg)} }

        .input-footer {
          display: flex; align-items: center; justify-content: space-between;
          margin-top: 7px; padding: 0 2px; gap: 8px;
        }
        .input-hint { font-size: 9px; color: var(--dim); letter-spacing: .2px; flex-shrink: 0; }
        .kbd {
          display: inline-block;
          background: var(--bg3); border: 1px solid var(--border);
          padding: 1px 5px; border-radius: 3px; font-size: 8px;
          font-family: 'JetBrains Mono', monospace;
          color: var(--dim2); vertical-align: middle;
        }
        .input-actions { display: flex; gap: 5px; flex-shrink: 0; }
        .input-action {
          font-size: 9px; color: var(--dim); padding: 4px 9px;
          border-radius: 6px; cursor: pointer; transition: .12s;
          background: none; border: 1px solid var(--border);
          font-family: 'JetBrains Mono', monospace;
          display: flex; align-items: center; gap: 4px;
          text-decoration: none; white-space: nowrap;
        }
        .input-action:hover { color: var(--cyan); border-color: rgba(0,229,255,.25); }
        .input-action svg { width: 10px; height: 10px; flex-shrink: 0; }

        /* ── RESPONSIVE: TABLET (max 768px) ── */
        @media (max-width: 768px) {
          :root { --header-h: 52px; --status-h: 32px; }
          .header { padding: 0 12px; gap: 8px; }
          .header-subtitle { display: none; }
          .header-name { max-width: 70px; }
          .chat-area { padding: 14px 12px; gap: 14px; }
          .welcome { padding: 14px 12px 10px; }
          .welcome-top { gap: 10px; margin-bottom: 16px; }
          .welcome-avatar-wrap { width: 60px; height: 60px; }
          .welcome-avatar { width: 60px; height: 60px; }
          .welcome-avatar-ring { inset: -3px; }
          .bubble { font-size: 12px; padding: 11px 14px; }
          .msg-wrap { max-width: 88%; }
          .input-wrapper { padding: 10px 12px 8px; }
          .hint-chip { padding: 11px 12px; font-size: 11px; }
        }

        /* ── RESPONSIVE: MOBILE (max 480px) ── */
        @media (max-width: 480px) {
          :root { --header-h: 48px; --status-h: 30px; }
          .header { padding: 0 10px; gap: 7px; }
          .header-name { display: none; }
          .header-subtitle { display: none; }
          .header-user { padding: 3px 7px 3px 3px; }
          .status-bar { padding: 0 12px; }
          .chat-area { padding: 12px 10px; gap: 12px; }
          .welcome { padding: 12px 10px 8px; }
          .welcome-top { gap: 8px; margin-bottom: 14px; }
          .welcome-avatar-wrap { width: 54px; height: 54px; }
          .welcome-avatar { width: 54px; height: 54px; }
          .welcome-badge { font-size: 7.5px; padding: 4px 12px; }
          .welcome-title { font-size: 18px; }
          .welcome-text { font-size: 11.5px; }
          .w-stat { padding: 10px 5px; }
          .w-stat-val { font-size: 11px; }
          .w-stat-lbl { font-size: 7px; }
          .w-stat-icon { display: none; }
          .hints-section { max-width: 100%; }
          .hints-label { display: none; }
          .hint-cat-tabs { gap: 5px; }
          .hint-cat-tab { padding: 4px 9px; font-size: 8.5px; }
          .hint-chip { padding: 10px 12px; font-size: 10.5px; }
          .bubble { font-size: 11.5px; padding: 10px 12px; }
          .msg-wrap { max-width: 92%; }
          .avatar { width: 28px; height: 28px; }
          .input-wrapper { padding: 9px 10px 7px; }
          .user-textarea { font-size: 12px; }
          .send-btn { width: 42px; height: 42px; }
          .input-hint { display: none; }
          .input-actions .input-action span { display: none; }
          .input-actions .input-action { padding: 4px 7px; }
          .header-btn span { display: none; }
          .header-btn { padding: 0 8px; }
        }

        /* ── VERY SMALL (max 360px) ── */
        @media (max-width: 360px) {
          .header-plan-pill { display: none; }
          .welcome-title { font-size: 16px; }
          .hint-cat-tab { padding: 3px 7px; font-size: 8px; }
        }
      `}</style>

      <div className="page">
        {/* ── HEADER ── */}
        <header className="header">
          <div className="header-logo">
            <img
              src="/images/nexusai.png"
              alt="NEXUS"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
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
              onError={(e) => { (e.target as HTMLImageElement).src = "/images/nexusai.png"; }}
            />
            <span className="header-name">@{username}</span>
          </div>

          <a href="/dashboard" className="header-btn header-btn-ghost" title="Dashboard">
            <Icons.Dashboard />
            <span>Dashboard</span>
          </a>

          {messages.length > 0 && (
            <button className="header-btn btn-clear" onClick={handleClearChat} title="Clear chat">
              <Icons.Trash />
              <span>Clear</span>
            </button>
          )}
        </header>

        {/* ── STATUS BAR ── */}
        <div className="status-bar">
          <div className="status-left">
            <div className="status-indicator">
              <div className="status-dot" />
              <span className="status-text">ACTIVE</span>
            </div>
            <span className="status-sep">·</span>
            <span style={{ fontSize: 9, color: "var(--dim2)", letterSpacing: ".3px" }}>
              NEXUS AI Support
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
        <div className="chat-area" ref={chatRef} onScroll={handleChatScroll}>
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

        {/* ── SCROLL TO BOTTOM ── */}
        {showScrollBtn && (
          <button
            className="scroll-to-bottom"
            onClick={scrollToBottom}
            title="Scroll to bottom"
            aria-label="Scroll to bottom"
            style={{ position: "absolute", bottom: 90, right: 16, zIndex: 20 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}

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
                aria-label="Message input"
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
              aria-label="Send message"
            >
              {isProcessing ? (
                <span className="spin-icon"><Icons.Loader /></span>
              ) : (
                <Icons.Send />
              )}
            </button>
          </div>
          <div className="input-footer">
            <span className="input-hint">
              <span className="kbd">Enter</span> Send &nbsp;·&nbsp;
              <span className="kbd">Shift+Enter</span> New line
            </span>
            <div className="input-actions">
              <a
                href="https://discord.gg/HuGtbRvD"
                target="_blank"
                rel="noopener noreferrer"
                className="input-action"
                title="Join Discord"
              >
                <Icons.Discord />
                <span>Discord</span>
              </a>
              <a
                href="mailto:arifiinytid@gmail.com"
                className="input-action"
                title="Send email"
              >
                <Icons.Mail />
                <span>Email</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}