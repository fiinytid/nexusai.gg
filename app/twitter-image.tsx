/**
 * app/twitter-image.tsx
 *
 * Twitter / X Card image — 1200 × 628 px
 * Served at /twitter-image.png
 *
 * Twitter requires slightly different dimensions (2:1 ratio) and prefers
 * a bolder composition with text readable at small sizes on mobile feeds.
 *
 * Docs: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image#twitter-image
 */

import { ImageResponse } from "next/og";

/* ── Route segment config ─────────────────────────────────────────────────── */
export const runtime     = "edge";
export const alt         = "NEXUS AI — Roblox Dev Intelligence";
export const size        = { width: 1200, height: 628 };
export const contentType = "image/png";

/* ─────────────────────────────────────────────────────────────────────────── */

export default async function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width:      "100%",
          height:     "100%",
          display:    "flex",
          position:   "relative",
          overflow:   "hidden",
          background: "#030312",
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        {/* ── Background grid ── */}
        <div
          style={{
            position:   "absolute",
            inset:      0,
            backgroundImage:
              "linear-gradient(rgba(0,229,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,.035) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        {/* ── Left purple bleed ── */}
        <div
          style={{
            position:   "absolute",
            top:        "50%",
            left:       -100,
            transform:  "translateY(-50%)",
            width:      400,
            height:     400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(136,0,255,.4) 0%, transparent 65%)",
          }}
        />

        {/* ── Right cyan bleed ── */}
        <div
          style={{
            position:   "absolute",
            top:        -80,
            right:      -80,
            width:      500,
            height:     500,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,229,255,.25) 0%, transparent 65%)",
          }}
        />

        {/* ── Left pane — branding ── */}
        <div
          style={{
            position:   "relative",
            zIndex:     10,
            flex:       "0 0 55%",
            display:    "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding:    "0 0 0 72px",
            gap:        0,
          }}
        >
          {/* Logo + name */}
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 20 }}>
            <div
              style={{
                width:        72,
                height:       72,
                borderRadius: 18,
                background:   "linear-gradient(135deg, rgba(0,229,255,.2), rgba(136,0,255,.2))",
                border:       "2px solid rgba(0,229,255,.45)",
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
                fontSize:     30,
                fontWeight:   900,
                color:        "#00e5ff",
              }}
            >
              N
            </div>
            <div>
              <div
                style={{
                  fontSize:     44,
                  fontWeight:   900,
                  letterSpacing: 5,
                  background:   "linear-gradient(135deg, #00e5ff 20%, #8800ff 100%)",
                  backgroundClip: "text",
                  color:        "transparent",
                  lineHeight:   1,
                }}
              >
                NEXUS AI
              </div>
              <div
                style={{
                  fontSize:     11,
                  color:        "rgba(0,229,255,.5)",
                  letterSpacing: 3.5,
                  marginTop:    5,
                }}
              >
                ROBLOX DEV INTELLIGENCE
              </div>
            </div>
          </div>

          {/* Headline */}
          <div
            style={{
              fontSize:     26,
              fontWeight:   700,
              color:        "#ffffff",
              lineHeight:   1.4,
              marginBottom: 24,
            }}
          >
            The AI assistant every
            <br />
            <span
              style={{
                background:     "linear-gradient(90deg, #00e5ff, #8800ff)",
                backgroundClip: "text",
                color:          "transparent",
              }}
            >
              Roblox developer
            </span>{" "}
            needs.
          </div>

          {/* Sub-features list */}
          {[
            "✦  Write Lua scripts with AI",
            "✦  Debug errors instantly",
            "✦  Build GUIs from a prompt",
            "✦  Inject into Studio directly",
          ].map(line => (
            <div
              key={line}
              style={{
                fontSize:     14,
                color:        "#b8cfff",
                marginBottom: 6,
                letterSpacing: .5,
              }}
            >
              {line}
            </div>
          ))}

          {/* CTA pill */}
          <div
            style={{
              marginTop:    28,
              display:      "flex",
              alignItems:   "center",
              gap:          12,
            }}
          >
            <div
              style={{
                padding:      "10px 26px",
                borderRadius: 30,
                background:   "linear-gradient(135deg, #00e5ff, #8800ff)",
                fontSize:     13,
                fontWeight:   900,
                color:        "#030312",
                letterSpacing: 1.5,
              }}
            >
              FREE — Get Started
            </div>
            <div
              style={{
                fontSize:     12,
                color:        "rgba(0,229,255,.45)",
                letterSpacing: 2,
              }}
            >
              nexusai.gg
            </div>
          </div>
        </div>

        {/* ── Right pane — "terminal" feature panel ── */}
        <div
          style={{
            position:   "relative",
            zIndex:     10,
            flex:       "1 1 0",
            display:    "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingRight: 56,
          }}
        >
          <div
            style={{
              width:        "100%",
              maxWidth:     380,
              background:   "rgba(6,7,26,.85)",
              border:       "1px solid rgba(0,229,255,.18)",
              borderRadius: 16,
              overflow:     "hidden",
            }}
          >
            {/* Terminal title bar */}
            <div
              style={{
                display:    "flex",
                alignItems: "center",
                gap:        6,
                padding:    "10px 16px",
                background: "rgba(0,229,255,.04)",
                borderBottom: "1px solid rgba(0,229,255,.1)",
              }}
            >
              {["#ff5f57","#febc2e","#28c840"].map(c => (
                <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
              ))}
              <div style={{ marginLeft: 8, fontSize: 10, color: "rgba(0,229,255,.4)", letterSpacing: 1 }}>
                nexus_ai — lua
              </div>
            </div>

            {/* Code lines */}
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { txt: "-- NEXUS AI generated", color: "#3a4a7a" },
                { txt: 'local DataStore =', color: "#00e5ff"  },
                { txt: '  game:GetService(', color: "#b8cfff"  },
                { txt: '  "DataStoreService")', color: "#00ffaa" },
                { txt: "", color: "transparent" },
                { txt: "function savePlayer(plr)", color: "#ffd600" },
                { txt: "  local data = {", color: "#b8cfff"  },
                { txt: '    coins = plr.coins,', color: "#cc55ff" },
                { txt: "    level = plr.level", color: "#cc55ff" },
                { txt: "  }", color: "#b8cfff" },
                { txt: "end", color: "#ffd600" },
              ].map((line, i) => (
                <div
                  key={i}
                  style={{
                    fontSize:    12,
                    color:       line.color,
                    fontFamily:  "monospace",
                    letterSpacing: .3,
                    lineHeight:  1.5,
                  }}
                >
                  {line.txt || "\u00a0"}
                </div>
              ))}
            </div>

            {/* AI badge */}
            <div
              style={{
                padding:    "8px 20px",
                background: "rgba(0,229,255,.04)",
                borderTop:  "1px solid rgba(0,229,255,.1)",
                display:    "flex",
                alignItems: "center",
                gap:        8,
                fontSize:   10,
                color:      "#00ffaa",
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ffaa" }} />
              Generated · Injected to Studio ✓
            </div>
          </div>
        </div>

        {/* ── Top accent ── */}
        <div
          style={{
            position:   "absolute",
            top:        0, left: 0, right: 0,
            height:     3,
            background: "linear-gradient(90deg, transparent 2%, #00e5ff 30%, #8800ff 70%, transparent 98%)",
          }}
        />
        {/* ── Bottom accent ── */}
        <div
          style={{
            position:   "absolute",
            bottom:     0, left: 0, right: 0,
            height:     3,
            background: "linear-gradient(90deg, transparent 2%, #8800ff 30%, #00e5ff 70%, transparent 98%)",
          }}
        />
      </div>
    ),
    { ...size }
  );
}