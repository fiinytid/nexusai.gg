const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@300;400;500&display=swap');

  :root {
    --bg: #030312;
    --bg2: #06071a;
    --bg3: #0a0b28;
    --cyan: #00e5ff;
    --cyan-dim: rgba(0, 229, 255, 0.6);
    --purple: #8800ff;
    --text: #b8cfff;
    --text-bright: #d8e8ff;
    --dim: #3a4a7a;
    --dim2: #5a6a9a;
    --border: rgba(0, 229, 255, 0.12);
    --border-hover: rgba(0, 229, 255, 0.25);
    --radius: 8px;
    --radius-lg: 12px;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .pp-root {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 1.85;
    position: relative;
  }

  /* Subtle grid background */
  .pp-root::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      linear-gradient(rgba(0,229,255,.018) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,229,255,.018) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }

  /* Ambient glow top */
  .pp-root::after {
    content: '';
    position: fixed;
    top: -200px;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 400px;
    background: radial-gradient(ellipse, rgba(0,229,255,.04) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  .pp-container {
    max-width: 860px;
    margin: 0 auto;
    padding: 40px 24px 80px;
    position: relative;
    z-index: 1;
  }

  /* ── HEADER ── */
  .pp-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 32px;
  }

  .pp-logo-img {
    width: 44px;
    height: 44px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .pp-logo-text {
    display: flex;
    flex-direction: column;
  }

  .pp-logo-name {
    font-family: 'Orbitron', sans-serif;
    font-size: 22px;
    font-weight: 900;
    background: linear-gradient(135deg, var(--cyan) 0%, var(--purple) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1.1;
  }

  .pp-logo-sub {
    font-size: 9px;
    color: var(--dim2);
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-top: 3px;
  }

  /* ── NAV ── */
  .pp-nav {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 44px;
    padding: 12px 16px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    flex-wrap: wrap;
  }

  .pp-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 14px;
    background: rgba(0, 229, 255, 0.08);
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 6px;
    color: var(--cyan);
    font-size: 10px;
    font-family: 'Orbitron', sans-serif;
    letter-spacing: 1px;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.18s, border-color 0.18s;
    white-space: nowrap;
  }

  .pp-back-btn:hover {
    background: rgba(0, 229, 255, 0.15);
    border-color: rgba(0, 229, 255, 0.4);
    text-decoration: none;
  }

  .pp-back-arrow {
    font-size: 13px;
    line-height: 1;
  }

  .pp-nav-sep {
    width: 1px;
    height: 16px;
    background: var(--border);
    flex-shrink: 0;
  }

  .pp-nav-link {
    color: var(--dim2);
    font-size: 11px;
    text-decoration: none;
    transition: color 0.15s;
    letter-spacing: 0.5px;
  }

  .pp-nav-link:hover {
    color: var(--cyan);
    text-decoration: none;
  }

  .pp-nav-link.active {
    color: var(--cyan);
  }

  /* ── PAGE TITLE ── */
  .pp-title-block {
    margin-bottom: 36px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border);
  }

  .pp-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    background: rgba(0, 229, 255, 0.07);
    border: 1px solid rgba(0, 229, 255, 0.18);
    border-radius: 20px;
    font-size: 9px;
    letter-spacing: 2px;
    color: var(--cyan-dim);
    text-transform: uppercase;
    margin-bottom: 12px;
  }

  .pp-badge-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--cyan);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .pp-h1 {
    font-family: 'Orbitron', sans-serif;
    font-size: 26px;
    font-weight: 900;
    color: var(--cyan);
    margin-bottom: 10px;
    line-height: 1.2;
  }

  .pp-meta {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 10px;
    color: var(--dim2);
    flex-wrap: wrap;
  }

  .pp-meta span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .pp-meta-icon {
    width: 12px;
    height: 12px;
    opacity: 0.6;
    flex-shrink: 0;
  }

  /* ── INTRO CARD ── */
  .pp-intro-card {
    background: linear-gradient(135deg, rgba(0,229,255,.05) 0%, rgba(136,0,255,.04) 100%);
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: var(--radius-lg);
    padding: 20px 24px;
    margin-bottom: 36px;
    position: relative;
    overflow: hidden;
  }

  .pp-intro-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--cyan), var(--purple));
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .pp-intro-card p {
    color: var(--text-bright);
    font-size: 13px;
    line-height: 1.9;
    margin: 0;
  }

  /* ── SECTIONS ── */
  .pp-section {
    margin-bottom: 36px;
  }

  .pp-h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: 'Orbitron', sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: var(--cyan);
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }

  .pp-h2-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 4px;
    font-size: 9px;
    color: var(--cyan);
    flex-shrink: 0;
    font-weight: 900;
  }

  .pp-root p {
    color: var(--text);
    margin-bottom: 12px;
    font-size: 13px;
    line-height: 1.85;
  }

  .pp-root p:last-child {
    margin-bottom: 0;
  }

  /* ── LIST ── */
  .pp-list {
    list-style: none;
    padding: 0;
    margin: 0 0 16px 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pp-list li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    color: var(--text);
    font-size: 13px;
    line-height: 1.75;
    padding: 8px 12px;
    background: rgba(255,255,255,.02);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: border-color 0.15s, background 0.15s;
  }

  .pp-list li:hover {
    border-color: var(--border-hover);
    background: rgba(0, 229, 255, 0.03);
  }

  .pp-list-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--cyan);
    flex-shrink: 0;
    margin-top: 8px;
    opacity: 0.7;
  }

  .pp-root strong {
    color: #ffffff;
    font-weight: 500;
  }

  /* ── INFO CARD ── */
  .pp-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px 22px;
    margin: 16px 0;
  }

  .pp-card p {
    margin: 0;
    color: var(--text);
    line-height: 2;
  }

  /* ── SCOPE TABLE ── */
  .pp-scope-table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 12px;
  }

  .pp-scope-table th {
    text-align: left;
    padding: 8px 12px;
    background: rgba(0,229,255,.06);
    color: var(--cyan);
    font-family: 'Orbitron', sans-serif;
    font-size: 9px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    border-bottom: 1px solid rgba(0,229,255,.2);
  }

  .pp-scope-table td {
    padding: 9px 12px;
    color: var(--text);
    border-bottom: 1px solid var(--border);
    vertical-align: top;
    line-height: 1.6;
  }

  .pp-scope-table tr:last-child td {
    border-bottom: none;
  }

  .pp-scope-table tr:hover td {
    background: rgba(0,229,255,.02);
  }

  .pp-tag {
    display: inline-block;
    padding: 1px 7px;
    background: rgba(0,229,255,.1);
    border: 1px solid rgba(0,229,255,.2);
    border-radius: 4px;
    color: var(--cyan);
    font-size: 10px;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.5px;
  }

  /* ── CONTACT CARD ── */
  .pp-contact-card {
    background: var(--bg2);
    border: 1px solid rgba(0,229,255,.18);
    border-radius: var(--radius-lg);
    padding: 22px 26px;
    margin-top: 16px;
  }

  .pp-contact-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }

  .pp-contact-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .pp-contact-row:first-child {
    padding-top: 0;
  }

  .pp-contact-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,229,255,.08);
    border: 1px solid rgba(0,229,255,.18);
    border-radius: 6px;
    flex-shrink: 0;
  }

  .pp-contact-icon svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: var(--cyan);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .pp-contact-label {
    font-size: 9px;
    color: var(--dim2);
    letter-spacing: 1.5px;
    text-transform: uppercase;
    display: block;
    margin-bottom: 1px;
  }

  .pp-contact-value {
    color: var(--text-bright);
    font-size: 12px;
  }

  .pp-contact-value a {
    color: var(--cyan);
    text-decoration: none;
    transition: opacity 0.15s;
  }

  .pp-contact-value a:hover {
    opacity: 0.75;
    text-decoration: underline;
  }

  /* ── FOOTER ── */
  .pp-footer {
    margin-top: 56px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  .pp-footer-left {
    font-size: 10px;
    color: var(--dim2);
    line-height: 1.7;
  }

  .pp-footer-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .pp-footer-right a {
    font-size: 10px;
    color: var(--dim2);
    text-decoration: none;
    transition: color 0.15s;
    letter-spacing: 0.5px;
  }

  .pp-footer-right a:hover {
    color: var(--cyan);
  }

  .pp-footer-sep {
    width: 1px;
    height: 12px;
    background: var(--border);
  }

  /* ── RESPONSIVE ── */
  @media (max-width: 768px) {
    .pp-container {
      padding: 24px 16px 60px;
    }

    .pp-h1 {
      font-size: 20px;
    }

    .pp-logo-name {
      font-size: 18px;
    }

    .pp-logo-img {
      width: 36px;
      height: 36px;
    }

    .pp-nav {
      gap: 8px;
      padding: 10px 12px;
    }

    .pp-nav-sep {
      display: none;
    }

    .pp-intro-card {
      padding: 16px 18px;
    }

    .pp-contact-card {
      padding: 16px 18px;
    }

    .pp-scope-table {
      font-size: 11px;
    }

    .pp-scope-table th,
    .pp-scope-table td {
      padding: 7px 10px;
    }

    .pp-footer {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }

    .pp-footer-right {
      gap: 10px;
    }
  }

  @media (max-width: 480px) {
    .pp-h1 {
      font-size: 17px;
    }

    .pp-h2 {
      font-size: 10px;
    }

    .pp-back-btn {
      font-size: 9px;
      padding: 6px 11px;
    }

    .pp-list li {
      font-size: 12px;
    }

    .pp-scope-table {
      display: block;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .pp-contact-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .pp-meta {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
  }

  /* ── LINKS ── */
  .pp-root a {
    color: var(--cyan);
    text-decoration: none;
    transition: opacity 0.15s;
  }

  .pp-root a:hover {
    text-decoration: underline;
    opacity: 0.85;
  }

  /* ── SCROLLBAR ── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--dim); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--dim2); }
`;

export default function PrivacyPolicy() {
  return (
    <>
      <style>{styles}</style>
      <div className="pp-root">
        <div className="pp-container">

          {/* ── HEADER ── */}
          <div className="pp-header">
            <img src="/images/nexusai.png" alt="NEXUS AI Logo" className="pp-logo-img" />
            <div className="pp-logo-text">
              <div className="pp-logo-name">NEXUS AI</div>
              <div className="pp-logo-sub">Roblox Dev Intelligence</div>
            </div>
          </div>

          {/* ── NAV ── */}
          <nav className="pp-nav">
            <a href="/chats" className="pp-back-btn">
              <span className="pp-back-arrow">&#8592;</span>
              Back to App
            </a>
            <div className="pp-nav-sep" />
            <a href="/terms" className="pp-nav-link">Terms of Service</a>
            <div className="pp-nav-sep" />
            <a href="/privacy" className="pp-nav-link active">Privacy Policy</a>
          </nav>

          {/* ── PAGE TITLE ── */}
          <div className="pp-title-block">
            <div className="pp-badge">
              <span className="pp-badge-dot" />
              Legal Document
            </div>
            <h1 className="pp-h1">Privacy Policy</h1>
            <div className="pp-meta">
              <span>
                <svg className="pp-meta-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="2" width="14" height="13" rx="2" stroke="#3a4a7a" strokeWidth="1.5"/>
                  <path d="M1 6h14" stroke="#3a4a7a" strokeWidth="1.5"/>
                  <path d="M5 1v2M11 1v2" stroke="#3a4a7a" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Last updated: April 15, 2026
              </span>
              <span>
                <svg className="pp-meta-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="8" cy="8" r="6.5" stroke="#3a4a7a" strokeWidth="1.5"/>
                  <path d="M8 4.5v4l2.5 2.5" stroke="#3a4a7a" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Effective immediately
              </span>
              <span>
                <svg className="pp-meta-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6L8 1z" stroke="#3a4a7a" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                nexusai-rbx.vercel.app
              </span>
            </div>
          </div>

          {/* ── INTRO ── */}
          <div className="pp-intro-card">
            <p>
              NEXUS AI ("we", "us", "our") is committed to protecting your privacy. This Privacy Policy
              explains how we collect, use, store, and protect your information when you access or use our
              service at <strong>nexusai-rbx.vercel.app</strong>. By using our service, you agree to the
              collection and use of information in accordance with this policy.
            </p>
          </div>

          {/* ── SECTION 1 ── */}
          <div className="pp-section">
            <h2 className="pp-h2"><span className="pp-h2-num">01</span>Information We Collect</h2>
            <p>When you use NEXUS AI, we collect the following categories of information:</p>
            <ul className="pp-list">
              <li>
                <span className="pp-list-dot" />
                <span>
                  <strong>Roblox Account Data:</strong> Your Roblox username, User ID, and display name —
                  obtained through Roblox OAuth 2.0 with your explicit consent.
                </span>
              </li>
              <li>
                <span className="pp-list-dot" />
                <span>
                  <strong>Google Account Data:</strong> Your Google email address and profile picture —
                  obtained through Google OAuth with your explicit consent.
                </span>
              </li>
              <li>
                <span className="pp-list-dot" />
                <span>
                  <strong>Usage Data:</strong> AI conversation history, credit balance, selected AI model
                  preferences, language settings, and interface theme preferences.
                </span>
              </li>
              <li>
                <span className="pp-list-dot" />
                <span>
                  <strong>Technical Data:</strong> Browser type, access timestamps, and general usage
                  patterns. We do <strong>not</strong> store IP addresses.
                </span>
              </li>
            </ul>
          </div>

          {/* ── SECTION 2 ── */}
          <div className="pp-section">
            <h2 className="pp-h2"><span className="pp-h2-num">02</span>How We Use Your Information</h2>
            <ul className="pp-list">
              <li><span className="pp-list-dot" /><span>To authenticate you and provide access to NEXUS AI services.</span></li>
              <li><span className="pp-list-dot" /><span>To store and sync your AI conversation history across sessions.</span></li>
              <li><span className="pp-list-dot" /><span>To manage your credit balance and track usage accurately.</span></li>
              <li><span className="pp-list-dot" /><span>To enable AI-powered script injection into Roblox Studio via our plugin.</span></li>
              <li><span className="pp-list-dot" /><span>To improve our services, identify bugs, and optimize performance.</span></li>
              <li><span className="pp-list-dot" /><span>To send service-related communications only. We do not send marketing emails.</span></li>
            </ul>
          </div>

          {/* ── SECTION 3 ── */}
          <div className="pp-section">
            <h2 className="pp-h2"><span className="pp-h2-num">03</span>Roblox Data &amp; OAuth Scopes</h2>
            <p>We request only the minimum Roblox OAuth scopes necessary to operate the service:</p>
            <table className="pp-scope-table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="pp-tag">openid</span></td>
                  <td>Verify your Roblox identity for secure authentication.</td>
                </tr>
                <tr>
                  <td><span className="pp-tag">profile</span></td>
                  <td>Access your Roblox username and display name for personalization.</td>
                </tr>
              </tbody>
            </table>
            <div className="pp-card">
              <p>
                We do <strong>not</strong> access your Roblox games, inventory, friends list, Robux balance,
                or any other Roblox data beyond what is listed above. We do not post on your behalf or make
                any modifications to your Roblox account.
              </p>
            </div>
          </div>

          {/* ── SECTION 4 ── */}
          <div className="pp-section">
            <h2 className="pp-h2"><span className="pp-h2-num">04</span>Data Storage &amp; Security</h2>
            <ul className="pp-list">
              <li><span className="pp-list-dot" /><span>User data is stored securely using <strong>Vercel KV</strong> (key-value store), isolated per Roblox username.</span></li>
              <li><span className="pp-list-dot" /><span>All data transmission uses <strong>HTTPS encryption</strong> to protect data in transit.</span></li>
              <li><span className="pp-list-dot" /><span>Session tokens are stored in your browser's <strong>localStorage</strong> and expire automatically after 7 days.</span></li>
              <li><span className="pp-list-dot" /><span>Data is only accessible to the authenticated account owner.</span></li>
              <li><span className="pp-list-dot" /><span>We do <strong>not</strong> sell, trade, rent, or share your personal information with third parties for commercial purposes.</span></li>
            </ul>
          </div>

          {/* ── SECTION 5 ── */}
          <div className="pp-section">
            <h2 className="pp-h2"><span className="pp-h2-num">05</span>Data Retention</h2>
            <p>
              We retain your personal data for as long as your account remains active. You may request
              permanent deletion of your account and all associated data at any time by contacting us.
            </p>
            <p>
              Conversation history is automatically limited to your last <strong>10 conversations</strong> to
              minimize stored data. Older conversations are purged automatically.
            </p>
          </div>

          {/* ── SECTION 6 ── */}
          <div className="pp-section">
            <h2 className="pp-h2"><span className="pp-h2-num">06</span>Third-Party Services</h2>
            <p>NEXUS AI integrates with the following third-party services. Each service's own privacy policy governs how they handle your data:</p>
            <ul className="pp-list">
              <li><span className="pp-list-dot" /><span><strong>Google Gemini API</strong> — AI model provider for generating code and responses (Google Privacy Policy applies).</span></li>
              <li><span className="pp-list-dot" /><span><strong>Vercel</strong> — Hosting platform and serverless functions infrastructure.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Roblox API</strong> — Authentication provider and username resolution.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Google OAuth</strong> — Secondary authentication provider for Google account sign-in.</span></li>
            </ul>
          </div>

          {/* ── SECTION 7 ── */}
          <div className="pp-section">
            <h2 className="pp-h2"><span className="pp-h2-num">07</span>Children's Privacy</h2>
            <p>
              NEXUS AI is a developer tool designed for Roblox game developers. If you are under 13 years
              of age, you must obtain verifiable parental consent before using our service.
            </p>
            <p>
              We do not knowingly collect personal information from children under 13 without parental
              consent. If we become aware that a child under 13 has provided us with personal information
              without parental consent, we will delete that data promptly.
            </p>
          </div>

          {/* ── SECTION 8 ── */}
          <div className="pp-section">
            <h2 className="pp-h2"><span className="pp-h2-num">08</span>Your Rights</h2>
            <p>You have the following rights regarding your personal data:</p>
            <ul className="pp-list">
              <li><span className="pp-list-dot" /><span><strong>Access:</strong> Request a copy of the personal data we hold about you.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Correction:</strong> Request correction of any inaccurate or outdated data.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Deletion:</strong> Request permanent deletion of your account and all associated data.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Withdraw Consent:</strong> Withdraw your consent for data processing at any time.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Disconnect:</strong> Unlink your Roblox or Google account from NEXUS AI at any time.</span></li>
            </ul>
            <p>To exercise any of these rights, contact us using the details in Section 11.</p>
          </div>

          {/* ── SECTION 9 ── */}
          <div className="pp-section">
            <h2 className="pp-h2"><span className="pp-h2-num">09</span>Cookies &amp; Local Storage</h2>
            <p>
              We do <strong>not</strong> use tracking cookies or advertising cookies of any kind.
            </p>
            <p>
              We use browser <strong>localStorage</strong> solely to maintain your active login session
              and save your interface preferences (theme, language). This data never leaves your device
              except as part of authenticated API requests.
            </p>
          </div>

          {/* ── SECTION 10 ── */}
          <div className="pp-section">
            <h2 className="pp-h2"><span className="pp-h2-num">10</span>Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our practices or for
              legal and regulatory reasons. When we make significant changes, we will update the
              "Last updated" date at the top of this page.
            </p>
            <p>
              Continued use of NEXUS AI after changes are posted constitutes your acceptance of the
              updated policy. We encourage you to review this page periodically.
            </p>
          </div>

          {/* ── SECTION 11 ── */}
          <div className="pp-section">
            <h2 className="pp-h2"><span className="pp-h2-num">11</span>Contact Us</h2>
            <p>
              For questions about this Privacy Policy, data requests, or to exercise your rights,
              please reach out through any of the following channels:
            </p>
            <div className="pp-contact-card">
              <div className="pp-contact-row">
                <div className="pp-contact-icon">
                  <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
                </div>
                <div>
                  <span className="pp-contact-label">Email</span>
                  <div className="pp-contact-value"><a href="mailto:arifiinytid@gmail.com">arifiinytid@gmail.com</a></div>
                </div>
              </div>
              <div className="pp-contact-row">
                <div className="pp-contact-icon">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/></svg>
                </div>
                <div>
                  <span className="pp-contact-label">Website</span>
                  <div className="pp-contact-value"><a href="https://nexusai-rbx.vercel.app" target="_blank" rel="noopener noreferrer">nexusai-rbx.vercel.app</a></div>
                </div>
              </div>
              <div className="pp-contact-row">
                <div className="pp-contact-icon">
                  <svg viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="var(--bg2)" stroke="none"/></svg>
                </div>
                <div>
                  <span className="pp-contact-label">YouTube</span>
                  <div className="pp-contact-value">NEXUS STUDIO</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div className="pp-footer">
            <div className="pp-footer-left">
              &copy; 2026 NEXUS AI &middot; NEXUS STUDIO &middot; Built by FIINYTID25
            </div>
            <div className="pp-footer-right">
              <a href="/privacy">Privacy Policy</a>
              <span className="pp-footer-sep" />
              <a href="/terms">Terms of Service</a>
              <span className="pp-footer-sep" />
              <a href="/">Back to App</a>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}