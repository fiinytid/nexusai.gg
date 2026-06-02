# 🚀 NEXUS.AI — The Ultimate AI Development Suite for Roblox Creators

<div align="center">

[![Vercel Deployment](https://img.shields.io/badge/Deployed_on-Vercel-black?style=for-the-badge&logo=vercel)](https://nexusai-rbx.vercel.app)
[![Latest Release](https://img.shields.io/github/v/release/fiinytid/nexusai.gg?style=for-the-badge&color=blue&label=Latest+Release)](https://github.com/fiinytid/nexusai.gg/releases)
[![Roblox Studio](https://img.shields.io/badge/Roblox-Studio_Plugin-E8151B?style=for-the-badge&logo=roblox)](https://www.roblox.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=for-the-badge)](./CONTRIBUTING.md)

<br/>

> **NEXUS.AI** is a next-generation, AI-powered development suite engineered specifically for Roblox game creators. Build faster, debug smarter, and ship better games — all from a single, unified platform.

<br/>

**[🌐 Live Demo](https://nexusai-rbx.vercel.app)** · **[📖 Documentation](#-documentation)** · **[🐛 Report a Bug](https://github.com/fiinytid/nexusai.gg/issues)** · **[💡 Request a Feature](https://github.com/fiinytid/nexusai.gg/issues)**

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Core Features](#-core-features)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Web Dashboard Setup](#web-dashboard-setup)
  - [Studio Plugin Installation](#studio-plugin-installation)
- [Configuration](#-configuration)
- [Usage Guide](#-usage-guide)
- [API Reference](#-api-reference)
- [Supported Roblox Services](#-supported-roblox-services)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

NEXUS.AI bridges the gap between cutting-edge artificial intelligence and the Roblox development ecosystem. Whether you are a solo indie developer or part of a large studio team, NEXUS.AI accelerates every phase of your game development workflow — from rapid prototyping to production-ready deployment.

This repository hosts:

| Component | Description |
|---|---|
| **Web Dashboard** | Full-featured browser-based IDE with AI assistance |
| **Serverless API** | Backend logic and inference layers deployed on Vercel Edge Functions |
| **Studio Plugin** | Native Roblox Studio dockable widget for in-editor AI access |
| **Landing Pages** | Official marketing and documentation pages |

---

## ✨ Core Features

### 🤖 AI Luau Code Generation
Generate highly optimized, production-ready Roblox Luau scripts instantly using natural language prompts. Simply describe what you want — *"a leaderboard that persists player scores using DataStore"* — and NEXUS.AI writes the full, documented implementation for you.

- Supports both `LocalScript` and `Script` (server-side) contexts
- Automatically applies Roblox best practices (e.g., `task.wait()` over `wait()`)
- Inline JSDoc-style comments included by default

### 🔍 Smart Debugging & Refactoring
Paste your existing scripts and let NEXUS.AI perform a deep analysis to:

- **Detect syntax errors** before they crash your live game
- **Identify logical bugs** and anti-patterns specific to Roblox's execution model
- **Suggest performance optimizations** (e.g., loop efficiency, memory leak prevention)
- **Recommend refactoring strategies** to improve code maintainability and readability

### 🎨 Modern Dockable UI
A lightweight and sleek plugin interface that integrates seamlessly into your Roblox Studio environment as a native widget:

- Drag, resize, and dock the panel to any position in your Studio layout
- Persists across Studio sessions (no re-setup needed)
- Fully responsive design that adapts to both compact and expanded layouts
- Zero performance overhead — only active when opened

### 📚 Deep Roblox API Integration
NEXUS.AI is trained and fine-tuned explicitly on up-to-date Roblox documentation, covering:

- Core services: `DataStoreService`, `TweenService`, `ReplicatedStorage`, `RunService`, and more
- Physics engine behaviors and `BasePart` properties
- Remote events and functions (`RemoteEvent`, `RemoteFunction`, `BindableEvent`)
- `PlayerGui`, `BillboardGui`, `SurfaceGui`, and the full UI object model
- `Humanoid`, `Animator`, and animation track APIs

### 🔐 Secure & Private
- All code submitted to NEXUS.AI is processed in ephemeral, sandboxed environments
- No code is stored, logged, or used for model training without explicit consent
- API keys are encrypted end-to-end using industry-standard AES-256

---

## 🏗️ Architecture

```
nexusai.gg/
├── apps/
│   ├── web/               # Next.js web dashboard (React + TypeScript)
│   └── landing/           # Marketing landing pages (Astro)
├── packages/
│   ├── ui/                # Shared UI component library
│   ├── ai-core/           # AI inference wrappers and prompt templates
│   └── roblox-parser/     # Luau AST parser and linter utilities
├── api/
│   └── v1/                # Vercel Edge Function handlers
│       ├── generate.ts    # Code generation endpoint
│       ├── debug.ts       # Script analysis endpoint
│       └── refactor.ts    # Refactoring suggestions endpoint
├── plugin/
│   └── src/               # Roblox Studio plugin source (Luau)
└── docs/                  # Extended developer documentation
```

---

## 🚀 Getting Started

### Prerequisites

Before setting up NEXUS.AI locally, make sure you have the following installed:

| Tool | Minimum Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org) | `v18.0.0` | LTS recommended |
| [pnpm](https://pnpm.io) | `v8.0.0` | Package manager used in this monorepo |
| [Git](https://git-scm.com) | Latest | For cloning the repository |
| [Roblox Studio](https://www.roblox.com/create) | Latest | For plugin development and testing |

---

### Web Dashboard Setup

**1. Clone the repository**

```bash
git clone https://github.com/fiinytid/nexusai.gg.git
cd nexusai.gg
```

**2. Install dependencies**

```bash
pnpm install
```

**3. Configure environment variables**

Copy the example environment file and populate it with your credentials:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the required values:

```env
# AI Provider
ANTHROPIC_API_KEY=your_api_key_here

# Deployment
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1

# Authentication (optional for local dev)
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000
```

**4. Start the development server**

```bash
pnpm dev
```

The web dashboard will be available at **[http://localhost:3000](http://localhost:3000)**.

---

### Studio Plugin Installation

#### Option A — Install from Roblox Marketplace *(Recommended)*

1. Open **Roblox Studio**
2. Navigate to the **Plugin** tab in the top toolbar
3. Click **Manage Plugins** → Search for `NEXUS.AI`
4. Click **Install** and restart Studio if prompted

#### Option B — Manual Installation (Development Build)

1. Navigate to the `plugin/` directory in this repository
2. Open `NexusAI.rbxm` in Roblox Studio
3. Move the plugin `Script` into `ServerStorage` or use the Roblox Studio **Plugin Builder** to install locally

---

## ⚙️ Configuration

NEXUS.AI supports a `nexus.config.json` file in your project root for customizing behavior:

```json
{
  "ai": {
    "model": "claude-sonnet-4-20250514",
    "temperature": 0.3,
    "max_tokens": 4096
  },
  "codegen": {
    "include_comments": true,
    "strict_types": true,
    "target_context": "server"
  },
  "plugin": {
    "theme": "dark",
    "dock_position": "right",
    "auto_format": true
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `ai.model` | `string` | `claude-sonnet-4-20250514` | The AI model used for generation |
| `ai.temperature` | `float` | `0.3` | Creativity level (0 = deterministic, 1 = creative) |
| `codegen.include_comments` | `boolean` | `true` | Adds inline documentation to generated code |
| `codegen.strict_types` | `boolean` | `true` | Enforces Luau strict type annotations |
| `plugin.theme` | `string` | `dark` | Plugin UI theme (`dark` / `light`) |

---

## 📖 Usage Guide

### Generating a Script

1. Open the **NEXUS.AI** panel in Roblox Studio or the web dashboard
2. Type your request in plain English in the **Prompt** field, e.g.:
   ```
   Create a proximity prompt system that gives players a sword when they interact with a chest
   ```
3. Select the target script context: `Server`, `Client`, or `Module`
4. Click **Generate** — your script appears in the editor panel within seconds

### Debugging an Existing Script

1. Switch to the **Debug** tab in the NEXUS.AI panel
2. Paste your Luau script (or use **Insert from Studio** to pull the active script)
3. Click **Analyze** — NEXUS.AI returns:
   - A list of detected issues with line numbers
   - Severity ratings: `Error`, `Warning`, `Suggestion`
   - A corrected version of the script with all issues resolved

---

## 📡 API Reference

All API endpoints are available at `https://nexusai-rbx.vercel.app/api/v1`.

### `POST /generate`

Generates a Luau script from a natural language prompt.

**Request Body:**

```json
{
  "prompt": "string",
  "context": "server | client | module",
  "include_comments": true
}
```

**Response:**

```json
{
  "success": true,
  "script": "-- Generated Luau code here\nlocal Players = game:GetService('Players')\n...",
  "tokens_used": 312
}
```

---

### `POST /debug`

Analyzes a Luau script and returns detected issues.

**Request Body:**

```json
{
  "script": "string",
  "strict": true
}
```

**Response:**

```json
{
  "success": true,
  "issues": [
    {
      "line": 14,
      "severity": "warning",
      "message": "Use task.wait() instead of deprecated wait()",
      "suggestion": "task.wait(1)"
    }
  ],
  "corrected_script": "string"
}
```

---

## 🛠️ Supported Roblox Services

NEXUS.AI has deep, contextual knowledge of the following Roblox APIs:

| Category | Services |
|---|---|
| **Data & Storage** | `DataStoreService`, `GlobalDataStore`, `OrderedDataStore`, `MemoryStoreService` |
| **Networking** | `RemoteEvent`, `RemoteFunction`, `BindableEvent`, `BindableFunction` |
| **Tweening & Animation** | `TweenService`, `AnimationTrack`, `Animator`, `TweenInfo` |
| **Physics** | `BasePart`, `Constraint`, `BodyVelocity`, `VectorForce`, `Workspace` |
| **Players & Characters** | `Players`, `Humanoid`, `HumanoidDescription`, `Character` |
| **UI Framework** | `ScreenGui`, `BillboardGui`, `SurfaceGui`, `Frame`, `TextButton` |
| **Lighting & Environment** | `Lighting`, `Atmosphere`, `Sky`, `PostEffect` |
| **Marketplace & Economy** | `MarketplaceService`, `BadgeService`, `GroupService` |
| **Server Management** | `RunService`, `ServerScriptService`, `ReplicatedStorage` |

---

## 🗺️ Roadmap

| Status | Feature |
|---|---|
| ✅ Done | AI Luau code generation |
| ✅ Done | Smart debugging and refactoring |
| ✅ Done | Roblox Studio dockable plugin |
| ✅ Done | Web dashboard with history |
| 🔄 In Progress | Multi-file project context awareness |
| 🔄 In Progress | Git integration for Studio projects |
| 📅 Planned | Voice-to-code input |
| 📅 Planned | Real-time collaborative sessions |
| 📅 Planned | Automated unit test generation for Luau |
| 📅 Planned | NEXUS.AI Teams — shared workspaces for studio teams |

---

## 🤝 Contributing

Contributions are welcome! Whether it's bug fixes, new features, or documentation improvements — all pull requests are reviewed and appreciated.

**Steps to contribute:**

1. **Fork** this repository
2. **Create** a new branch: `git checkout -b feat/your-feature-name`
3. **Commit** your changes with a clear message: `git commit -m "feat: add voice-to-code input support"`
4. **Push** to your branch: `git push origin feat/your-feature-name`
5. **Open** a Pull Request on GitHub

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines on code style, commit conventions, and the review process.

---

## 🐛 Reporting Issues

Found a bug? [Open an issue](https://github.com/fiinytid/nexusai.gg/issues/new?template=bug_report.md) and include:

- A clear description of the problem
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots or error logs (if applicable)

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for full details.

---

## 🙏 Acknowledgements

- [Anthropic](https://www.anthropic.com) — for the Claude AI models powering code generation
- [Vercel](https://vercel.com) — for seamless edge deployment
- [Roblox](https://www.roblox.com) — for the incredible creator platform and open API documentation
- All contributors and early adopters who helped shape NEXUS.AI

---

<div align="center">

Made with ❤️ for the Roblox developer community

**[⬆ Back to Top](#-nexusai--the-ultimate-ai-development-suite-for-roblox-creators)**

</div>