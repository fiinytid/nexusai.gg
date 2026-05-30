/**
 * app/opengraph-image.tsx
 *
 * Dynamic Open Graph image — 1200 × 630 px
 * Served at /og-image.png (Next.js routes this automatically)
 *
 * Used by: Google Search, Facebook, LinkedIn, Discord, Telegram, WhatsApp,
 *          Slack, iMessage link previews, and any platform that reads og:image.
 *
 * Docs: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */

import { ImageResponse } from "next/og";

/* ── Route segment config ─────────────────────────────────────────────────── */
export const runtime = "edge";          // fastest cold-start on Vercel edge
export const alt     = "NEXUS AI — Roblox Dev Intelligence";
export const size    = { width: 1200, height: 630 };
export const contentType = "image/png";

/* ─────────────────────────────────────────────────────────────────────────── */

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width:      "100%",
          height:     "100%",
          display:    "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position:   "relative",
          overflow:   "hidden",
          background: "#030312",
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        {/* ── Deep background grid ── */}
        <div
          style={{
            position:   "absolute",
            inset:      0,
            backgroundImage:
              "linear-gradient(rgba(0,229,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,.04) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* ── Radial glow – top-right purple ── */}
        <div
          style={{
            position:   "absolute",
            top:        -120,
            right:      -80,
            width:      600,
            height:     600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(136,0,255,.35) 0%, transparent 70%)",
          }}
        />

        {/* ── Radial glow – bottom-left cyan ── */}
        <div
          style={{
            position:   "absolute",
            bottom:     -100,
            left:       -60,
            width:      500,
            height:     500,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,229,255,.22) 0%, transparent 70%)",
          }}
        />

        {/* ── Scanline overlay ── */}
        <div
          style={{
            position:   "absolute",
            inset:      0,
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,.06) 3px, rgba(0,0,0,.06) 4px)",
          }}
        />

        {/* ── Top accent bar ── */}
        <div
          style={{
            position:   "absolute",
            top:        0,
            left:       0,
            right:      0,
            height:     3,
            background: "linear-gradient(90deg, transparent 2%, #00e5ff 30%, #8800ff 70%, transparent 98%)",
          }}
        />

        {/* ── Main content card ── */}
        <div
          style={{
            position:   "relative",
            zIndex:     10,
            display:    "flex",
            flexDirection: "column",
            alignItems: "center",
            gap:        0,
            padding:    "48px 80px",
            border:     "1px solid rgba(0,229,255,.18)",
            borderRadius: 24,
            background: "rgba(6,7,26,.75)",
          }}
        >
          {/* Logo row */}
          <div
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        20,
              marginBottom: 32,
            }}
          >
            {/* Logo badge */}
            <div
              style={{
                width:        80,
                height:       80,
                borderRadius: 20,
                background:   "linear-gradient(135deg, rgba(0,229,255,.15), rgba(136,0,255,.15))",
                border:       "2px solid rgba(0,229,255,.4)",
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
                fontSize:     36,
                fontWeight:   900,
                color:        "#00e5ff",
              }}
            >
              N
            </div>

            {/* Brand name */}
            <div
              style={{
                display:       "flex",
                flexDirection: "column",
                gap:           4,
              }}
            >
              <div
                style={{
                  fontSize:     52,
                  fontWeight:   900,
                  letterSpacing: 6,
                  background:   "linear-gradient(135deg, #00e5ff 30%, #8800ff 100%)",
                  backgroundClip: "text",
                  color:        "transparent",
                  lineHeight:   1,
                }}
              >
                NEXUS AI
              </div>
              <div
                style={{
                  fontSize:     13,
                  color:        "rgba(0,229,255,.55)",
                  letterSpacing: 4,
                  textTransform: "uppercase",
                }}
              >
                Roblox Dev Intelligence
              </div>
            </div>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize:     22,
              color:        "#b8cfff",
              textAlign:    "center",
              lineHeight:   1.6,
              marginBottom: 36,
              maxWidth:     640,
            }}
          >
            Write Lua · Debug Scripts · Build GUIs
            <br />
            <span style={{ color: "#00e5ff" }}>Inject directly into Roblox Studio</span>
          </div>

          {/* Feature pills */}
          <div
            style={{
              display:    "flex",
              gap:        12,
              flexWrap:   "nowrap",
            }}
          >
            {[
              { label: "Lua AI",    color: "#00e5ff", bg: "rgba(0,229,255,.08)",   border: "rgba(0,229,255,.25)"   },
              { label: "GUI Builder", color: "#8800ff", bg: "rgba(136,0,255,.1)",  border: "rgba(136,0,255,.35)"   },
              { label: "Studio Inject", color: "#00ffaa", bg: "rgba(0,255,170,.07)", border: "rgba(0,255,170,.25)" },
              { label: "DataStore", color: "#ffd600", bg: "rgba(255,214,0,.07)",   border: "rgba(255,214,0,.3)"    },
              { label: "Free Plan", color: "#ff2d6b", bg: "rgba(255,45,107,.08)",  border: "rgba(255,45,107,.3)"   },
            ].map(pill => (
              <div
                key={pill.label}
                style={{
                  padding:      "8px 18px",
                  borderRadius: 30,
                  background:   pill.bg,
                  border:       `1px solid ${pill.border}`,
                  fontSize:     13,
                  fontWeight:   700,
                  color:        pill.color,
                  letterSpacing: 1,
                }}
              >
                {pill.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom url bar ── */}
        <div
          style={{
            position:   "absolute",
            bottom:     28,
            display:    "flex",
            alignItems: "center",
            gap:        10,
            color:      "rgba(0,229,255,.35)",
            fontSize:   14,
            letterSpacing: 2,
          }}
        >
          <div
            style={{
              width:        6,
              height:       6,
              borderRadius: "50%",
              background:   "#00e5ff",
            }}
          />
          nexusai.gg
          <div
            style={{
              width:        6,
              height:       6,
              borderRadius: "50%",
              background:   "#8800ff",
            }}
          />
        </div>

        {/* ── Bottom accent bar ── */}
        <div
          style={{
            position:   "absolute",
            bottom:     0,
            left:       0,
            right:      0,
            height:     3,
            background: "linear-gradient(90deg, transparent 2%, #8800ff 30%, #00e5ff 70%, transparent 98%)",
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}