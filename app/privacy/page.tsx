const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

  :root {
    --bg: #04041a;
    --bg2: #08091f;
    --bg3: #0d0e28;
    --surface: #0f1030;
    --surface2: #141540;
    --cyan: #00d4f5;
    --cyan-dim: rgba(0,212,245,.15);
    --cyan-glow: rgba(0,212,245,.08);
    --purple: #7c3aed;
    --purple-dim: rgba(124,58,237,.15);
    --text: #c8d8f8;
    --text-muted: #7080a8;
    --text-dim: #3a4a7a;
    --border: rgba(0,212,245,.1);
    --border-strong: rgba(0,212,245,.2);
    --r: 8px;
    --r-lg: 12px;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .pp-root {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.75;
    position: relative;
    overflow-x: hidden;
  }

  .pp-grid-bg {
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(0,212,245,.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,212,245,.025) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none;
    z-index: 0;
  }
  .pp-grid-bg::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(124,58,237,.08) 0%, transparent 70%);
  }

  .pp-container {
    max-width: 860px;
    margin: 0 auto;
    padding: 0 24px 80px;
    position: relative;
    z-index: 1;
  }

  /* TOP BAR */
  .pp-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 0 20px;
    margin-bottom: 0;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: rgba(4,4,26,.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    z-index: 100;
  }
  .pp-brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .pp-logo-img {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    object-fit: contain;
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 3px;
  }
  .pp-logo-text {
    font-family: 'Orbitron', sans-serif;
    font-size: 16px;
    font-weight: 900;
    background: linear-gradient(135deg, var(--cyan) 0%, var(--purple) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1;
  }
  .pp-logo-sub-text {
    font-size: 9px;
    color: var(--text-dim);
    letter-spacing: 2.5px;
    text-transform: uppercase;
    line-height: 1;
    margin-top: 2px;
  }

  .pp-topnav {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pp-topnav a {
    color: var(--text-muted);
    font-size: 11px;
    text-decoration: none;
    padding: 6px 12px;
    border-radius: var(--r);
    transition: color .15s, background .15s;
    letter-spacing: .3px;
  }
  .pp-topnav a:hover {
    color: var(--cyan);
    background: var(--cyan-glow);
  }
  .pp-topnav a.active {
    color: var(--cyan);
    background: var(--cyan-dim);
  }
  .pp-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: var(--cyan-dim);
    border: 1px solid var(--border-strong);
    border-radius: var(--r);
    color: var(--cyan) !important;
    font-size: 11px;
    font-family: 'Orbitron', sans-serif;
    letter-spacing: .8px;
    cursor: pointer;
    text-decoration: none !important;
    transition: background .15s, border-color .15s;
    white-space: nowrap;
  }
  .pp-back-btn:hover {
    background: rgba(0,212,245,.22) !important;
    border-color: rgba(0,212,245,.35) !important;
  }

  /* PAGE HEADER */
  .pp-header {
    padding: 48px 0 36px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 40px;
  }
  .pp-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--purple-dim);
    border: 1px solid rgba(124,58,237,.3);
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 10px;
    color: #a78bfa;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    font-family: 'JetBrains Mono', monospace;
    margin-bottom: 16px;
  }
  .pp-page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 28px;
    font-weight: 900;
    color: #fff;
    margin-bottom: 10px;
    letter-spacing: .5px;
  }
  .pp-page-title span {
    background: linear-gradient(135deg, var(--cyan), var(--purple));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .pp-meta {
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
    margin-top: 12px;
  }
  .pp-meta-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
  }
  .pp-meta-item svg {
    width: 13px;
    height: 13px;
    stroke: var(--text-dim);
    flex-shrink: 0;
  }

  /* SUMMARY CARD */
  .pp-summary {
    background: linear-gradient(135deg, rgba(0,212,245,.06) 0%, rgba(124,58,237,.06) 100%);
    border: 1px solid var(--border-strong);
    border-radius: var(--r-lg);
    padding: 20px 24px;
    margin-bottom: 40px;
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }
  .pp-summary-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: var(--cyan-dim);
    border: 1px solid var(--border-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .pp-summary-icon svg {
    width: 18px;
    height: 18px;
    stroke: var(--cyan);
  }
  .pp-summary p {
    color: var(--text);
    font-size: 13px;
    line-height: 1.7;
  }

  /* TABLE OF CONTENTS */
  .pp-toc {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: 20px 24px;
    margin-bottom: 48px;
  }
  .pp-toc-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 10px;
    color: var(--text-muted);
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pp-toc-title svg {
    width: 13px;
    height: 13px;
    stroke: var(--text-dim);
  }
  .pp-toc-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 4px;
    list-style: none;
  }
  .pp-toc-list li a {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 12px;
    text-decoration: none;
    transition: color .15s, background .15s;
  }
  .pp-toc-list li a:hover {
    color: var(--cyan);
    background: var(--cyan-glow);
  }
  .pp-toc-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--text-dim);
    min-width: 20px;
  }

  /* SECTIONS */
  .pp-section {
    margin-bottom: 48px;
    scroll-margin-top: 80px;
  }
  .pp-section-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }
  .pp-section-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--text-dim);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 7px;
    min-width: 32px;
    text-align: center;
    flex-shrink: 0;
  }
  .pp-section-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .pp-section-icon svg {
    width: 16px;
    height: 16px;
    stroke: var(--cyan);
  }
  .pp-section-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 13px;
    font-weight: 700;
    color: var(--cyan);
    letter-spacing: .8px;
    text-transform: uppercase;
  }

  .pp-body {
    color: var(--text);
    font-size: 13.5px;
    line-height: 1.8;
    margin-bottom: 14px;
  }

  .pp-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 14px;
  }
  .pp-list li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 13.5px;
    color: var(--text);
    line-height: 1.7;
    padding: 10px 14px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-left: 2px solid var(--border-strong);
    border-radius: 0 var(--r) var(--r) 0;
  }
  .pp-list li .li-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--cyan);
    flex-shrink: 0;
    margin-top: 8px;
    opacity: .7;
  }
  .pp-list li strong {
    color: #fff;
    font-weight: 600;
  }

  /* DATA TABLE */
  .pp-data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    margin-bottom: 14px;
    border-radius: var(--r);
    overflow: hidden;
  }
  .pp-data-table th {
    text-align: left;
    padding: 10px 14px;
    background: var(--surface);
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 500;
    border-bottom: 1px solid var(--border-strong);
  }
  .pp-data-table td {
    padding: 10px 14px;
    color: var(--text);
    border-bottom: 1px solid var(--border);
    background: var(--bg2);
    vertical-align: top;
    font-size: 13px;
  }
  .pp-data-table tr:last-child td {
    border-bottom: none;
  }
  .pp-data-table td:first-child {
    font-family: 'JetBrains Mono', monospace;
    color: #a78bfa;
    font-size: 12px;
    white-space: nowrap;
  }
  .pp-data-table td strong {
    color: #fff;
  }

  /* RIGHTS GRID */
  .pp-rights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }
  .pp-right-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--r);
    padding: 14px 16px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .pp-right-icon {
    width: 30px;
    height: 30px;
    border-radius: 7px;
    background: rgba(124,58,237,.15);
    border: 1px solid rgba(124,58,237,.25);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .pp-right-icon svg {
    width: 15px;
    height: 15px;
    stroke: #a78bfa;
  }
  .pp-right-title {
    font-size: 12px;
    font-weight: 600;
    color: #e2d9ff;
    margin-bottom: 2px;
  }
  .pp-right-desc {
    font-size: 11.5px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  /* CONTACT CARD */
  .pp-contact-card {
    background: var(--bg2);
    border: 1px solid var(--border-strong);
    border-radius: var(--r-lg);
    padding: 20px 24px;
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }
  .pp-contact-item {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .pp-contact-item svg {
    width: 16px;
    height: 16px;
    stroke: var(--text-muted);
    flex-shrink: 0;
  }
  .pp-contact-item a {
    color: var(--cyan);
    text-decoration: none;
    font-size: 13px;
    transition: opacity .15s;
  }
  .pp-contact-item a:hover {
    opacity: .8;
    text-decoration: underline;
  }
  .pp-contact-item span {
    color: var(--text-muted);
    font-size: 11px;
    margin-right: 4px;
  }

  /* NOTICE */
  .pp-notice {
    background: rgba(0,212,245,.05);
    border: 1px solid rgba(0,212,245,.2);
    border-left: 3px solid var(--cyan);
    border-radius: 0 var(--r) var(--r) 0;
    padding: 12px 16px;
    font-size: 13px;
    color: var(--text);
    line-height: 1.7;
    margin-bottom: 14px;
  }

  /* FOOTER */
  .pp-footer {
    margin-top: 60px;
    padding: 24px 0;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: gap;
    gap: 12px;
  }
  .pp-footer-copy {
    font-size: 11px;
    color: var(--text-dim);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: .3px;
  }
  .pp-footer-links {
    display: flex;
    gap: 16px;
  }
  .pp-footer-links a {
    font-size: 11px;
    color: var(--text-muted);
    text-decoration: none;
    transition: color .15s;
  }
  .pp-footer-links a:hover {
    color: var(--cyan);
  }
`;

const IconShield = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IconDatabase = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>
);
const IconUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IconLink = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);
const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const IconCalendar = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconInfo = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const IconKey = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>
);
const IconCookie = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/>
    <path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/>
    <path d="M11 17v.01"/><path d="M7 14v.01"/>
  </svg>
);
const IconRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);
const IconMail = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);
const IconGlobe = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);
const IconYoutube = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.4 19.54C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/>
    <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/>
  </svg>
);
const IconList = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
    <line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
    <line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);
const IconArrowLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const IconEye = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const IconEdit = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IconXCircle = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
  </svg>
);
const IconUnlink = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    <line x1="5" y1="5" x2="5.01" y2="5"/><line x1="19" y1="19" x2="19.01" y2="19"/>
  </svg>
);
const IconLock = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

export default function PrivacyPolicy() {
  return (
    <>
      <style>{styles}</style>
      <div className="pp-root">
        <div className="pp-grid-bg" />

        <div className="pp-container">
          {/* TOP BAR */}
          <div className="pp-topbar">
            <div className="pp-brand">
              <img src="/images/nexusai.png" alt="NEXUS AI Logo" className="pp-logo-img" />
              <div>
                <div className="pp-logo-text">NEXUS AI</div>
                <div className="pp-logo-sub-text">Roblox Dev Intelligence</div>
              </div>
            </div>
            <div className="pp-topnav">
              <a href="/chats" className="pp-back-btn">
                <IconArrowLeft /> Back to App
              </a>
              <a href="/terms">Terms of Service</a>
              <a href="/privacy" className="active">Privacy Policy</a>
            </div>
          </div>

          {/* PAGE HEADER */}
          <div className="pp-header">
            <div className="pp-badge">
              <IconShield />
              Legal Document
            </div>
            <h1 className="pp-page-title">
              Privacy <span>Policy</span>
            </h1>
            <div className="pp-meta">
              <div className="pp-meta-item">
                <IconCalendar />
                Last updated: April 15, 2026
              </div>
              <div className="pp-meta-item">
                <IconClock />
                Effective immediately
              </div>
              <div className="pp-meta-item">
                <IconGlobe />
                nexusai-rbx.vercel.app
              </div>
            </div>
          </div>

          {/* SUMMARY */}
          <div className="pp-summary">
            <div className="pp-summary-icon">
              <IconInfo />
            </div>
            <p>
              NEXUS AI is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and protect your
              information when you use our service. We keep data collection to the minimum required to operate the platform and
              never sell your information to third parties.
            </p>
          </div>

          {/* TABLE OF CONTENTS */}
          <div className="pp-toc">
            <div className="pp-toc-title">
              <IconList /> Contents
            </div>
            <ul className="pp-toc-list">
              {[
                "Information We Collect",
                "How We Use Your Information",
                "Roblox Data Usage",
                "Data Storage & Security",
                "Data Retention",
                "Third-Party Services",
                "Children's Privacy",
                "Your Rights",
                "Cookies",
                "Policy Changes",
                "Contact Us",
              ].map((item, i) => (
                <li key={i}>
                  <a href={`#section-${i + 1}`}>
                    <span className="pp-toc-num">0{i + 1}</span>
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* SECTION 1 */}
          <div className="pp-section" id="section-1">
            <div className="pp-section-header">
              <span className="pp-section-num">01</span>
              <div className="pp-section-icon"><IconDatabase /></div>
              <h2 className="pp-section-title">Information We Collect</h2>
            </div>
            <p className="pp-body">When you use NEXUS AI, we collect the following categories of information:</p>
            <table className="pp-data-table">
              <thead>
                <tr>
                  <th>Data Type</th>
                  <th>What We Collect</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Roblox Account</td>
                  <td>Username, User ID, display name</td>
                  <td>Roblox OAuth 2.0 — with your explicit consent</td>
                </tr>
                <tr>
                  <td>Google Account</td>
                  <td>Email address, profile picture</td>
                  <td>Google OAuth — with your explicit consent</td>
                </tr>
                <tr>
                  <td>Usage Data</td>
                  <td>AI conversation history, credits balance, model preferences, language and theme settings</td>
                  <td>Generated by your activity in the app</td>
                </tr>
                <tr>
                  <td>Technical Data</td>
                  <td>Browser type, access timestamps, general usage patterns</td>
                  <td>Automatically on access — no IP addresses stored</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* SECTION 2 */}
          <div className="pp-section" id="section-2">
            <div className="pp-section-header">
              <span className="pp-section-num">02</span>
              <div className="pp-section-icon"><IconUsers /></div>
              <h2 className="pp-section-title">How We Use Your Information</h2>
            </div>
            <ul className="pp-list">
              {[
                ["Authenticate you and provide access to NEXUS AI services.", ""],
                ["Store and sync your AI conversation history across sessions.", ""],
                ["Manage your credits balance and usage allocation.", ""],
                ["Enable AI-powered script injection into Roblox Studio.", ""],
                ["Improve our services, diagnose issues, and fix bugs.", ""],
                ["Send service-related communications only.", "No marketing emails are sent."],
              ].map(([text, note], i) => (
                <li key={i}>
                  <span className="li-dot" />
                  <span>{text}{note ? <strong> {note}</strong> : ""}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* SECTION 3 */}
          <div className="pp-section" id="section-3">
            <div className="pp-section-header">
              <span className="pp-section-num">03</span>
              <div className="pp-section-icon"><IconKey /></div>
              <h2 className="pp-section-title">Roblox Data Usage</h2>
            </div>
            <p className="pp-body">We request the following Roblox OAuth scopes:</p>
            <table className="pp-data-table">
              <thead>
                <tr><th>OAuth Scope</th><th>Purpose</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>openid</td>
                  <td>Verify your Roblox identity during login</td>
                </tr>
                <tr>
                  <td>profile</td>
                  <td>Access your Roblox username and display name</td>
                </tr>
              </tbody>
            </table>
            <div className="pp-notice">
              We do <strong>not</strong> access your Roblox games, inventory, friends list, or any other Roblox data beyond what is listed above.
              We do not post on your behalf or make any changes to your Roblox account.
            </div>
          </div>

          {/* SECTION 4 */}
          <div className="pp-section" id="section-4">
            <div className="pp-section-header">
              <span className="pp-section-num">04</span>
              <div className="pp-section-icon"><IconLock /></div>
              <h2 className="pp-section-title">Data Storage &amp; Security</h2>
            </div>
            <ul className="pp-list">
              {[
                ["User data is stored securely using", "Vercel KV (key-value store)."],
                ["Data is stored per Roblox username and is only accessible to the authenticated user.", ""],
                ["All data transmission is encrypted using", "HTTPS."],
                ["Session tokens are stored in your browser's localStorage and expire after", "7 days."],
                ["We do not sell, trade, or rent your personal information to third parties.", ""],
              ].map(([text, bold], i) => (
                <li key={i}>
                  <span className="li-dot" />
                  <span>{text}{bold ? <strong> {bold}</strong> : ""}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* SECTION 5 */}
          <div className="pp-section" id="section-5">
            <div className="pp-section-header">
              <span className="pp-section-num">05</span>
              <div className="pp-section-icon"><IconClock /></div>
              <h2 className="pp-section-title">Data Retention</h2>
            </div>
            <p className="pp-body">
              We retain your data as long as you have an active account. You can request deletion of your data at any time by contacting us.
              Conversation history is automatically limited to the last <strong>10 conversations</strong> to minimize stored data.
            </p>
          </div>

          {/* SECTION 6 */}
          <div className="pp-section" id="section-6">
            <div className="pp-section-header">
              <span className="pp-section-num">06</span>
              <div className="pp-section-icon"><IconLink /></div>
              <h2 className="pp-section-title">Third-Party Services</h2>
            </div>
            <table className="pp-data-table">
              <thead>
                <tr><th>Service</th><th>Purpose</th><th>Privacy Applies</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Google Gemini API</td>
                  <td>AI model for generating responses</td>
                  <td>Google's Privacy Policy</td>
                </tr>
                <tr>
                  <td>Vercel</td>
                  <td>Hosting and serverless function infrastructure</td>
                  <td>Vercel's Privacy Policy</td>
                </tr>
                <tr>
                  <td>Roblox API</td>
                  <td>Authentication and username lookup</td>
                  <td>Roblox's Privacy Policy</td>
                </tr>
                <tr>
                  <td>Google OAuth</td>
                  <td>Secondary authentication</td>
                  <td>Google's Privacy Policy</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* SECTION 7 */}
          <div className="pp-section" id="section-7">
            <div className="pp-section-header">
              <span className="pp-section-num">07</span>
              <div className="pp-section-icon"><IconUsers /></div>
              <h2 className="pp-section-title">Children's Privacy</h2>
            </div>
            <p className="pp-body">
              NEXUS AI is a developer tool intended for Roblox game developers. If you are under 13 years of age,
              please ensure you have parental consent before using our service. We do not knowingly collect personal
              information from children under 13 without parental consent.
            </p>
          </div>

          {/* SECTION 8 */}
          <div className="pp-section" id="section-8">
            <div className="pp-section-header">
              <span className="pp-section-num">08</span>
              <div className="pp-section-icon"><IconShield /></div>
              <h2 className="pp-section-title">Your Rights</h2>
            </div>
            <div className="pp-rights-grid">
              {[
                [<IconEye />, "Access Your Data", "Request a copy of the personal data we hold about you."],
                [<IconEdit />, "Correct Data", "Request correction of any inaccurate or outdated information."],
                [<IconTrash />, "Delete Account", "Request deletion of your account and all associated data."],
                [<IconXCircle />, "Withdraw Consent", "Withdraw consent for data processing at any time."],
                [<IconUnlink />, "Disconnect Accounts", "Disconnect your Roblox or Google account from NEXUS AI."],
              ].map(([icon, title, desc], i) => (
                <div key={i} className="pp-right-card">
                  <div className="pp-right-icon">{icon}</div>
                  <div>
                    <div className="pp-right-title">{title}</div>
                    <div className="pp-right-desc">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 9 */}
          <div className="pp-section" id="section-9">
            <div className="pp-section-header">
              <span className="pp-section-num">09</span>
              <div className="pp-section-icon"><IconCookie /></div>
              <h2 className="pp-section-title">Cookies</h2>
            </div>
            <p className="pp-body">
              We do not use tracking cookies. We only use browser <strong>localStorage</strong> to maintain your login session
              and preferences. No third-party advertising or analytics cookies are placed on your device.
            </p>
          </div>

          {/* SECTION 10 */}
          <div className="pp-section" id="section-10">
            <div className="pp-section-header">
              <span className="pp-section-num">10</span>
              <div className="pp-section-icon"><IconRefresh /></div>
              <h2 className="pp-section-title">Policy Changes</h2>
            </div>
            <p className="pp-body">
              We may update this Privacy Policy from time to time. We will notify users of significant changes by
              updating the "Last updated" date at the top of this page. Continued use of NEXUS AI after changes
              constitutes acceptance of the updated policy.
            </p>
          </div>

          {/* SECTION 11 */}
          <div className="pp-section" id="section-11">
            <div className="pp-section-header">
              <span className="pp-section-num">11</span>
              <div className="pp-section-icon"><IconMail /></div>
              <h2 className="pp-section-title">Contact Us</h2>
            </div>
            <p className="pp-body" style={{ marginBottom: "16px" }}>
              If you have questions about this Privacy Policy or wish to exercise your data rights, contact us through any of the channels below:
            </p>
            <div className="pp-contact-card">
              <div className="pp-contact-item">
                <IconMail />
                <div>
                  <span>Email</span>
                  <a href="mailto:arifiinytid@gmail.com">arifiinytid@gmail.com</a>
                </div>
              </div>
              <div className="pp-contact-item">
                <IconGlobe />
                <div>
                  <span>Website</span>
                  <a href="https://nexusai-rbx.vercel.app" target="_blank" rel="noopener noreferrer">nexusai-rbx.vercel.app</a>
                </div>
              </div>
              <div className="pp-contact-item">
                <IconYoutube />
                <div>
                  <span>YouTube</span>
                  <a href="#" target="_blank" rel="noopener noreferrer">NEXUS STUDIO</a>
                </div>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="pp-footer">
            <div className="pp-footer-copy">
              © 2026 NEXUS AI · NEXUS STUDIO · Built by FIINYTID25
            </div>
            <div className="pp-footer-links">
              <a href="/privacy">Privacy Policy</a>
              <a href="/terms">Terms of Service</a>
              <a href="/">Back to App</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}