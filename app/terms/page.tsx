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

  .tos-root {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 1.85;
    position: relative;
  }

  /* Subtle grid background */
  .tos-root::before {
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
  .tos-root::after {
    content: '';
    position: fixed;
    top: -200px;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 400px;
    background: radial-gradient(ellipse, rgba(136,0,255,.04) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  .tos-container {
    max-width: 860px;
    margin: 0 auto;
    padding: 40px 24px 80px;
    position: relative;
    z-index: 1;
  }

  /* ── HEADER ── */
  .tos-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 32px;
  }

  .tos-logo-img {
    width: 44px;
    height: 44px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .tos-logo-text {
    display: flex;
    flex-direction: column;
  }

  .tos-logo-name {
    font-family: 'Orbitron', sans-serif;
    font-size: 22px;
    font-weight: 900;
    background: linear-gradient(135deg, var(--cyan) 0%, var(--purple) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1.1;
  }

  .tos-logo-sub {
    font-size: 9px;
    color: var(--dim2);
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-top: 3px;
  }

  /* ── NAV ── */
  .tos-nav {
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

  .tos-back-btn {
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

  .tos-back-btn:hover {
    background: rgba(0, 229, 255, 0.15);
    border-color: rgba(0, 229, 255, 0.4);
    text-decoration: none;
  }

  .tos-back-arrow {
    font-size: 13px;
    line-height: 1;
  }

  .tos-nav-sep {
    width: 1px;
    height: 16px;
    background: var(--border);
    flex-shrink: 0;
  }

  .tos-nav-link {
    color: var(--dim2);
    font-size: 11px;
    text-decoration: none;
    transition: color 0.15s;
    letter-spacing: 0.5px;
  }

  .tos-nav-link:hover {
    color: var(--cyan);
    text-decoration: none;
  }

  .tos-nav-link.active {
    color: var(--cyan);
  }

  /* ── PAGE TITLE ── */
  .tos-title-block {
    margin-bottom: 36px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border);
  }

  .tos-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    background: rgba(136, 0, 255, 0.09);
    border: 1px solid rgba(136, 0, 255, 0.22);
    border-radius: 20px;
    font-size: 9px;
    letter-spacing: 2px;
    color: rgba(136, 0, 255, 0.8);
    text-transform: uppercase;
    margin-bottom: 12px;
  }

  .tos-badge-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--purple);
    animation: pulse-p 2s infinite;
  }

  @keyframes pulse-p {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .tos-h1 {
    font-family: 'Orbitron', sans-serif;
    font-size: 26px;
    font-weight: 900;
    color: var(--cyan);
    margin-bottom: 10px;
    line-height: 1.2;
  }

  .tos-meta {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 10px;
    color: var(--dim2);
    flex-wrap: wrap;
  }

  .tos-meta span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .tos-meta-icon {
    width: 12px;
    height: 12px;
    opacity: 0.6;
    flex-shrink: 0;
  }

  /* ── INTRO CARD ── */
  .tos-intro-card {
    background: linear-gradient(135deg, rgba(136,0,255,.05) 0%, rgba(0,229,255,.04) 100%);
    border: 1px solid rgba(136, 0, 255, 0.2);
    border-radius: var(--radius-lg);
    padding: 20px 24px;
    margin-bottom: 36px;
    position: relative;
    overflow: hidden;
  }

  .tos-intro-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--purple), var(--cyan));
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .tos-intro-card p {
    color: var(--text-bright);
    font-size: 13px;
    line-height: 1.9;
    margin: 0;
  }

  /* ── SECTIONS ── */
  .tos-section {
    margin-bottom: 36px;
  }

  .tos-h2 {
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

  .tos-h2-num {
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

  .tos-root p {
    color: var(--text);
    margin-bottom: 12px;
    font-size: 13px;
    line-height: 1.85;
  }

  .tos-root p:last-child {
    margin-bottom: 0;
  }

  /* ── LIST ── */
  .tos-list {
    list-style: none;
    padding: 0;
    margin: 0 0 16px 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tos-list li {
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

  .tos-list li:hover {
    border-color: var(--border-hover);
    background: rgba(0, 229, 255, 0.03);
  }

  /* ── PROHIBITED LIST (red tint) ── */
  .tos-list-danger li {
    border-color: rgba(255, 60, 60, 0.12);
    background: rgba(255, 40, 40, 0.02);
  }

  .tos-list-danger li:hover {
    border-color: rgba(255, 60, 60, 0.22);
    background: rgba(255, 40, 40, 0.04);
  }

  .tos-list-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--cyan);
    flex-shrink: 0;
    margin-top: 8px;
    opacity: 0.7;
  }

  .tos-list-dot-red {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ff4444;
    flex-shrink: 0;
    margin-top: 8px;
    opacity: 0.8;
  }

  .tos-root strong {
    color: #ffffff;
    font-weight: 500;
  }

  /* ── INFO CARD ── */
  .tos-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px 22px;
    margin: 16px 0;
  }

  .tos-card p {
    margin: 0;
    color: var(--text);
    line-height: 1.9;
  }

  /* ── HIGHLIGHT CARD (credit info) ── */
  .tos-credit-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
    margin: 14px 0;
  }

  .tos-credit-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tos-credit-card:nth-child(2) {
    border-color: rgba(0, 229, 255, 0.25);
    background: rgba(0, 229, 255, 0.04);
  }

  .tos-credit-label {
    font-size: 9px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--dim2);
  }

  .tos-credit-value {
    font-family: 'Orbitron', sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: var(--cyan);
    line-height: 1.1;
  }

  .tos-credit-desc {
    font-size: 11px;
    color: var(--text);
    margin-top: 2px;
  }

  /* ── WARNING CARD ── */
  .tos-warn-card {
    background: rgba(255, 160, 0, 0.04);
    border: 1px solid rgba(255, 160, 0, 0.2);
    border-radius: var(--radius);
    padding: 14px 18px;
    margin: 14px 0;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .tos-warn-icon {
    width: 16px;
    height: 16px;
    color: #ffa000;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .tos-warn-card p {
    margin: 0;
    color: rgba(255, 200, 100, 0.85);
    font-size: 12px;
    line-height: 1.7;
  }

  /* ── PAYMENT TABLE ── */
  .tos-pay-table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 12px;
  }

  .tos-pay-table th {
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

  .tos-pay-table td {
    padding: 9px 12px;
    color: var(--text);
    border-bottom: 1px solid var(--border);
    vertical-align: top;
    line-height: 1.6;
  }

  .tos-pay-table tr:last-child td {
    border-bottom: none;
  }

  .tos-pay-table tr:hover td {
    background: rgba(0,229,255,.02);
  }

  .tos-tag {
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
  .tos-contact-card {
    background: var(--bg2);
    border: 1px solid rgba(0,229,255,.18);
    border-radius: var(--radius-lg);
    padding: 22px 26px;
    margin-top: 16px;
  }

  .tos-contact-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }

  .tos-contact-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .tos-contact-row:first-child {
    padding-top: 0;
  }

  .tos-contact-icon {
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

  .tos-contact-icon svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: var(--cyan);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .tos-contact-label {
    font-size: 9px;
    color: var(--dim2);
    letter-spacing: 1.5px;
    text-transform: uppercase;
    display: block;
    margin-bottom: 1px;
  }

  .tos-contact-value {
    color: var(--text-bright);
    font-size: 12px;
  }

  .tos-contact-value a {
    color: var(--cyan);
    text-decoration: none;
    transition: opacity 0.15s;
  }

  .tos-contact-value a:hover {
    opacity: 0.75;
    text-decoration: underline;
  }

  /* ── FOOTER ── */
  .tos-footer {
    margin-top: 56px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  .tos-footer-left {
    font-size: 10px;
    color: var(--dim2);
    line-height: 1.7;
  }

  .tos-footer-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .tos-footer-right a {
    font-size: 10px;
    color: var(--dim2);
    text-decoration: none;
    transition: color 0.15s;
    letter-spacing: 0.5px;
  }

  .tos-footer-right a:hover {
    color: var(--cyan);
  }

  .tos-footer-sep {
    width: 1px;
    height: 12px;
    background: var(--border);
  }

  /* ── RESPONSIVE ── */
  @media (max-width: 768px) {
    .tos-container {
      padding: 24px 16px 60px;
    }

    .tos-h1 {
      font-size: 20px;
    }

    .tos-logo-name {
      font-size: 18px;
    }

    .tos-logo-img {
      width: 36px;
      height: 36px;
    }

    .tos-nav {
      gap: 8px;
      padding: 10px 12px;
    }

    .tos-nav-sep {
      display: none;
    }

    .tos-intro-card {
      padding: 16px 18px;
    }

    .tos-contact-card {
      padding: 16px 18px;
    }

    .tos-credit-grid {
      grid-template-columns: 1fr 1fr;
    }

    .tos-pay-table {
      font-size: 11px;
    }

    .tos-pay-table th,
    .tos-pay-table td {
      padding: 7px 10px;
    }

    .tos-footer {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }

    .tos-footer-right {
      gap: 10px;
    }
  }

  @media (max-width: 480px) {
    .tos-h1 {
      font-size: 17px;
    }

    .tos-h2 {
      font-size: 10px;
    }

    .tos-back-btn {
      font-size: 9px;
      padding: 6px 11px;
    }

    .tos-list li {
      font-size: 12px;
    }

    .tos-credit-grid {
      grid-template-columns: 1fr;
    }

    .tos-pay-table {
      display: block;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .tos-contact-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .tos-meta {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
  }

  /* ── LINKS ── */
  .tos-root a {
    color: var(--cyan);
    text-decoration: none;
    transition: opacity 0.15s;
  }

  .tos-root a:hover {
    text-decoration: underline;
    opacity: 0.85;
  }

  /* ── SCROLLBAR ── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--dim); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--dim2); }
`;

export default function TermsOfService() {
  return (
    <>
      <style>{styles}</style>
      <div className="tos-root">
        <div className="tos-container">

          {/* ── HEADER ── */}
          <div className="tos-header">
            <img src="/images/nexusai.png" alt="NEXUS AI Logo" className="tos-logo-img" />
            <div className="tos-logo-text">
              <div className="tos-logo-name">NEXUS AI</div>
              <div className="tos-logo-sub">Roblox Dev Intelligence</div>
            </div>
          </div>

          {/* ── NAV ── */}
          <nav className="tos-nav">
            <a href="/chats" className="tos-back-btn">
              <span className="tos-back-arrow">&#8592;</span>
              Back to App
            </a>
            <div className="tos-nav-sep" />
            <a href="/privacy" className="tos-nav-link">Privacy Policy</a>
            <div className="tos-nav-sep" />
            <a href="/terms" className="tos-nav-link active">Terms of Service</a>
          </nav>

          {/* ── PAGE TITLE ── */}
          <div className="tos-title-block">
            <div className="tos-badge">
              <span className="tos-badge-dot" />
              Legal Document
            </div>
            <h1 className="tos-h1">Terms of Service</h1>
            <div className="tos-meta">
              <span>
                <svg className="tos-meta-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="2" width="14" height="13" rx="2" stroke="#3a4a7a" strokeWidth="1.5"/>
                  <path d="M1 6h14" stroke="#3a4a7a" strokeWidth="1.5"/>
                  <path d="M5 1v2M11 1v2" stroke="#3a4a7a" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Last updated: April 15, 2026
              </span>
              <span>
                <svg className="tos-meta-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="8" cy="8" r="6.5" stroke="#3a4a7a" strokeWidth="1.5"/>
                  <path d="M8 4.5v4l2.5 2.5" stroke="#3a4a7a" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Effective immediately
              </span>
              <span>
                <svg className="tos-meta-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 1.5l6.5 11.5H1.5L8 1.5z" stroke="#3a4a7a" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M8 6v3.5M8 11.5v.5" stroke="#3a4a7a" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Read before using the service
              </span>
            </div>
          </div>

          {/* ── INTRO ── */}
          <div className="tos-intro-card">
            <p>
              By accessing or using NEXUS AI at <strong>nexusai-rbx.vercel.app</strong>, you agree to be
              bound by these Terms of Service and our Privacy Policy. If you do not agree with any part of
              these terms, you must discontinue use of the service immediately.
            </p>
          </div>

          {/* ── SECTION 1 ── */}
          <div className="tos-section">
            <h2 className="tos-h2"><span className="tos-h2-num">01</span>Acceptance of Terms</h2>
            <p>
              By using NEXUS AI, you confirm that you:
            </p>
            <ul className="tos-list">
              <li><span className="tos-list-dot" /><span>Are at least <strong>13 years of age</strong>, or have obtained verifiable parental consent.</span></li>
              <li><span className="tos-list-dot" /><span>Have the legal capacity to enter into a binding agreement under applicable law.</span></li>
              <li><span className="tos-list-dot" /><span>Agree to comply with all applicable local, national, and international laws and regulations.</span></li>
              <li><span className="tos-list-dot" /><span>Have read and understood our <a href="/privacy">Privacy Policy</a>.</span></li>
            </ul>
          </div>

          {/* ── SECTION 2 ── */}
          <div className="tos-section">
            <h2 className="tos-h2"><span className="tos-h2-num">02</span>Description of Service</h2>
            <p>NEXUS AI is an AI-powered development assistant built for Roblox game developers. The service includes:</p>
            <ul className="tos-list">
              <li><span className="tos-list-dot" /><span><strong>AI Code Generation:</strong> Lua scripts, module scripts, and code assistance tailored for Roblox Studio.</span></li>
              <li><span className="tos-list-dot" /><span><strong>GUI Builder:</strong> Tools for designing and generating Roblox user interface layouts.</span></li>
              <li><span className="tos-list-dot" /><span><strong>Studio Plugin Integration:</strong> Automated script injection directly into Roblox Studio via our companion plugin.</span></li>
              <li><span className="tos-list-dot" /><span><strong>Credit System:</strong> A credit (CR) based usage system for managing AI model access and consumption.</span></li>
            </ul>
          </div>

          {/* ── SECTION 3 ── */}
          <div className="tos-section">
            <h2 className="tos-h2"><span className="tos-h2-num">03</span>User Accounts</h2>
            <ul className="tos-list">
              <li><span className="tos-list-dot" /><span>You must authenticate with both a valid <strong>Roblox account</strong> and a <strong>Google account</strong> to use NEXUS AI.</span></li>
              <li><span className="tos-list-dot" /><span>You are solely responsible for maintaining the security and confidentiality of your account credentials.</span></li>
              <li><span className="tos-list-dot" /><span>Sharing your account with others is strictly prohibited.</span></li>
              <li><span className="tos-list-dot" /><span>Each person is limited to <strong>one account</strong>. Creating multiple accounts to circumvent credit limits or restrictions is a violation of these terms.</span></li>
              <li><span className="tos-list-dot" /><span>You are responsible for all activity that occurs under your account.</span></li>
            </ul>
          </div>

          {/* ── SECTION 4 ── */}
          <div className="tos-section">
            <h2 className="tos-h2"><span className="tos-h2-num">04</span>Credits System</h2>
            <div className="tos-credit-grid">
              <div className="tos-credit-card">
                <span className="tos-credit-label">New User Bonus</span>
                <span className="tos-credit-value">30 CR</span>
                <span className="tos-credit-desc">Free credits upon registration</span>
              </div>
              <div className="tos-credit-card">
                <span className="tos-credit-label">Free Daily</span>
                <span className="tos-credit-value">2 CR</span>
                <span className="tos-credit-desc">Credited each day automatically</span>
              </div>
              <div className="tos-credit-card">
                <span className="tos-credit-label">Pro Daily</span>
                <span className="tos-credit-value">25 CR</span>
                <span className="tos-credit-desc">For Pro plan subscribers</span>
              </div>
            </div>
            <ul className="tos-list">
              <li><span className="tos-list-dot" /><span>Credits (CR) are the internal currency for managing AI usage within NEXUS AI.</span></li>
              <li><span className="tos-list-dot" /><span>Credits are <strong>non-transferable</strong> between accounts and carry no cash value.</span></li>
              <li><span className="tos-list-dot" /><span>We reserve the right to modify credit costs, daily allocations, and bonus amounts at any time with reasonable notice.</span></li>
              <li><span className="tos-list-dot" /><span>Purchased credits are <strong>non-refundable</strong> except where required by applicable law.</span></li>
            </ul>
          </div>

          {/* ── SECTION 5 ── */}
          <div className="tos-section">
            <h2 className="tos-h2"><span className="tos-h2-num">05</span>Acceptable Use</h2>
            <p>You agree <strong>not</strong> to use NEXUS AI for any of the following:</p>
            <ul className="tos-list tos-list-danger">
              <li><span className="tos-list-dot-red" /><span>Generating scripts designed to exploit, hack, cheat, or grief other Roblox players.</span></li>
              <li><span className="tos-list-dot-red" /><span>Creating content that violates Roblox's Terms of Service or Community Standards.</span></li>
              <li><span className="tos-list-dot-red" /><span>Producing malicious code, malware, viruses, or any content intended to cause harm.</span></li>
              <li><span className="tos-list-dot-red" /><span>Reverse engineering, copying, or redistributing any part of NEXUS AI's systems or codebase.</span></li>
              <li><span className="tos-list-dot-red" /><span>Using automated bots or scripts to abuse, scrape, or overload the service.</span></li>
              <li><span className="tos-list-dot-red" /><span>Circumventing credit limits or access restrictions through any technical means.</span></li>
              <li><span className="tos-list-dot-red" /><span>Impersonating other users or NEXUS AI staff.</span></li>
            </ul>
            <div className="tos-warn-card">
              <svg className="tos-warn-icon" viewBox="0 0 24 24" fill="none" stroke="#ffa000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <p>Violations of the Acceptable Use policy may result in immediate account suspension or permanent termination without refund.</p>
            </div>
          </div>

          {/* ── SECTION 6 ── */}
          <div className="tos-section">
            <h2 className="tos-h2"><span className="tos-h2-num">06</span>AI-Generated Content</h2>
            <ul className="tos-list">
              <li><span className="tos-list-dot" /><span>All AI-generated code and content is provided <strong>"as is"</strong> without warranties of fitness, accuracy, or completeness.</span></li>
              <li><span className="tos-list-dot" /><span>You are <strong>solely responsible</strong> for reviewing, testing, and validating any AI-generated scripts before deploying them in your Roblox games.</span></li>
              <li><span className="tos-list-dot" /><span>NEXUS AI does not guarantee that generated code will be bug-free, error-free, or suitable for any particular purpose.</span></li>
              <li><span className="tos-list-dot" /><span>You retain full <strong>ownership rights</strong> to all code generated using NEXUS AI during your session.</span></li>
            </ul>
          </div>

          {/* ── SECTION 7 ── */}
          <div className="tos-section">
            <h2 className="tos-h2"><span className="tos-h2-num">07</span>Roblox Studio Plugin</h2>
            <ul className="tos-list">
              <li><span className="tos-list-dot" /><span>The NEXUS AI Studio Plugin requires <strong>"Allow HTTP Requests"</strong> to be enabled in your Roblox Studio settings to function.</span></li>
              <li><span className="tos-list-dot" /><span>Plugin commands are isolated per user — only your authenticated commands execute in your Roblox place.</span></li>
              <li><span className="tos-list-dot" /><span>You are fully responsible for all modifications made to your Roblox places through the plugin.</span></li>
              <li><span className="tos-list-dot" /><span>We recommend saving a backup of your Roblox place before using automated script injection.</span></li>
            </ul>
          </div>

          {/* ── SECTION 8 ── */}
          <div className="tos-section">
            <h2 className="tos-h2"><span className="tos-h2-num">08</span>Payments &amp; Billing</h2>
            <table className="tos-pay-table">
              <thead>
                <tr>
                  <th>Detail</th>
                  <th>Information</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Payment Methods</td>
                  <td>OVO, Dana (Indonesian digital wallets)</td>
                </tr>
                <tr>
                  <td>Currency</td>
                  <td>Indonesian Rupiah (IDR) unless stated otherwise</td>
                </tr>
                <tr>
                  <td>Processing</td>
                  <td>Manual processing — instructions provided after package selection</td>
                </tr>
                <tr>
                  <td>Credit Delivery</td>
                  <td>Within 24 hours of confirmed payment</td>
                </tr>
                <tr>
                  <td>Refund Policy</td>
                  <td>Purchased credits are non-refundable except where required by law</td>
                </tr>
              </tbody>
            </table>
            <div className="tos-card">
              <p>
                If you have completed payment but have not received credits within 24 hours, please
                contact support with your payment proof at{" "}
                <a href="mailto:arifiinytid@gmail.com">arifiinytid@gmail.com</a>.
              </p>
            </div>
          </div>

          {/* ── SECTION 9 ── */}
          <div className="tos-section">
            <h2 className="tos-h2"><span className="tos-h2-num">09</span>Limitation of Liability</h2>
            <div className="tos-card">
              <p>
                NEXUS AI is provided <strong>"as is"</strong> without warranties of any kind, express or
                implied. To the maximum extent permitted by applicable law, we are not liable for any direct,
                indirect, incidental, consequential, or punitive damages arising from your use of the service,
                including but not limited to data loss, game damage, script errors, or missed development
                opportunities.
              </p>
            </div>
            <p style={{ marginTop: '12px' }}>
              Our total aggregate liability for any claims arising under these terms shall not exceed the
              total amount you paid for credits during the <strong>30 days preceding</strong> the claim.
            </p>
          </div>

          {/* ── SECTION 10 ── */}
          <div className="tos-section">
            <h2 className="tos-h2"><span className="tos-h2-num">10</span>Service Modifications</h2>
            <p>
              We reserve the right to modify, update, suspend, or discontinue any part of NEXUS AI at any
              time. This includes changes to features, credit pricing, daily allocations, and available AI models.
            </p>
            <p>
              We will provide reasonable advance notice of major changes where possible. Continued use of
              NEXUS AI after changes take effect constitutes your acceptance of the updated service.
            </p>
          </div>

          {/* ── SECTION 11 ── */}
          <div className="tos-section">
            <h2 className="tos-h2"><span className="tos-h2-num">11</span>Account Termination</h2>
            <ul className="tos-list">
              <li><span className="tos-list-dot" /><span>We may suspend or permanently terminate your account if you violate any provision of these Terms of Service.</span></li>
              <li><span className="tos-list-dot" /><span>Termination may occur immediately and without prior notice in cases of serious violations.</span></li>
              <li><span className="tos-list-dot" /><span>You may delete your account at any time by contacting our support team.</span></li>
              <li><span className="tos-list-dot" /><span>Upon termination, your remaining credits will be forfeited and are non-refundable.</span></li>
            </ul>
          </div>

          {/* ── SECTION 12 ── */}
          <div className="tos-section">
            <h2 className="tos-h2"><span className="tos-h2-num">12</span>Governing Law &amp; Disputes</h2>
            <p>
              These Terms of Service are governed by and construed in accordance with the laws of
              <strong> Indonesia</strong>, without regard to conflict of law provisions.
            </p>
            <p>
              In the event of a dispute arising out of or relating to these terms or your use of NEXUS AI,
              both parties agree to attempt resolution through <strong>good-faith negotiation</strong> before
              pursuing any formal legal remedies.
            </p>
          </div>

          {/* ── SECTION 13 ── */}
          <div className="tos-section">
            <h2 className="tos-h2"><span className="tos-h2-num">13</span>Contact &amp; Support</h2>
            <p>
              For support inquiries, billing issues, account requests, or to report violations, please
              contact us through any of the following channels:
            </p>
            <div className="tos-contact-card">
              <div className="tos-contact-row">
                <div className="tos-contact-icon">
                  <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
                </div>
                <div>
                  <span className="tos-contact-label">Email</span>
                  <div className="tos-contact-value"><a href="mailto:arifiinytid@gmail.com">arifiinytid@gmail.com</a></div>
                </div>
              </div>
              <div className="tos-contact-row">
                <div className="tos-contact-icon">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/></svg>
                </div>
                <div>
                  <span className="tos-contact-label">Website</span>
                  <div className="tos-contact-value"><a href="https://nexusai-rbx.vercel.app" target="_blank" rel="noopener noreferrer">nexusai-rbx.vercel.app</a></div>
                </div>
              </div>
              <div className="tos-contact-row">
                <div className="tos-contact-icon">
                  <svg viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="var(--bg2)" stroke="none"/></svg>
                </div>
                <div>
                  <span className="tos-contact-label">YouTube</span>
                  <div className="tos-contact-value">NEXUS STUDIO</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div className="tos-footer">
            <div className="tos-footer-left">
              &copy; 2026 NEXUS AI &middot; NEXUS STUDIO &middot; Built by FIINYTID25
            </div>
            <div className="tos-footer-right">
              <a href="/privacy">Privacy Policy</a>
              <span className="tos-footer-sep" />
              <a href="/terms">Terms of Service</a>
              <span className="tos-footer-sep" />
              <a href="/">Back to App</a>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}