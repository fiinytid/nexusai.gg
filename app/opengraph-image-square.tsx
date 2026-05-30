/**
 * app/opengraph-image-square.tsx
 *
 * Square Open Graph image — 600 × 600 px
 * Served at /og-image-square.png
 *
 * Used by: WhatsApp, Instagram stories, some mobile chat apps
 * that prefer square 1:1 thumbnails over the standard 1.91:1 ratio.
 *
 * Place this file at: app/opengraph-image-square.tsx
 * Then reference it in metadata: openGraph.images[1]
 */

import { ImageResponse } from "next/og";

export const runtime     = "edge";
export const alt         = "NEXUS AI — Roblox Dev Intelligence";
export const size        = { width: 600, height: 600 };
export const contentType = "image/png";

export default async function OgImageSquare() {
  return new ImageResponse(
    (
      <div
        style={{
          width:    "100%",
          height:   "100%",
          display:  "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#030312",
          position: "relative",
          overflow: "hidden",
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        {/* Grid */}
        <div
          style={{
            position: "absolute", inset: 0,
            backgroundImage:
              "linear-gradient(rgba(0,229,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.04) 1px,transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Cyan top-right glow */}
        <div style={{ position:"absolute", top:-80, right:-80, width:320, height:320, borderRadius:"50%", background:"radial-gradient(circle,rgba(0,229,255,.3) 0%,transparent 70%)" }} />
        {/* Purple bottom-left glow */}
        <div style={{ position:"absolute", bottom:-80, left:-80, width:320, height:320, borderRadius:"50%", background:"radial-gradient(circle,rgba(136,0,255,.3) 0%,transparent 70%)" }} />

        {/* Top bar */}
        <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:"linear-gradient(90deg,transparent,#00e5ff 40%,#8800ff 60%,transparent)" }} />

        {/* Center logo badge */}
        <div
          style={{
            width:      120, height: 120,
            borderRadius: 30,
            background: "linear-gradient(135deg,rgba(0,229,255,.15),rgba(136,0,255,.15))",
            border:     "2px solid rgba(0,229,255,.5)",
            display:    "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize:   54,
            fontWeight: 900,
            color:      "#00e5ff",
            marginBottom: 24,
            boxShadow:  "0 0 48px rgba(0,229,255,.25)",
          }}
        >
          N
        </div>

        {/* Brand */}
        <div
          style={{
            fontSize:   46,
            fontWeight: 900,
            letterSpacing: 5,
            background: "linear-gradient(135deg,#00e5ff 30%,#8800ff 100%)",
            backgroundClip: "text",
            color:      "transparent",
            marginBottom: 10,
          }}
        >
          NEXUS AI
        </div>

        <div style={{ fontSize:12, color:"rgba(0,229,255,.5)", letterSpacing:3.5, marginBottom:28 }}>
          ROBLOX DEV INTELLIGENCE
        </div>

        {/* Mini feature grid */}
        <div style={{ display:"flex", flexDirection:"column", gap:10, alignItems:"center" }}>
          {[
            ["Lua AI",  "#00e5ff"], ["GUI Builder", "#8800ff"],
            ["Studio Inject", "#00ffaa"], ["DataStore", "#ffd600"],
          ].map(([label, color]) => (
            <div
              key={label}
              style={{
                padding: "6px 22px",
                borderRadius: 30,
                background: `${color}14`,
                border: `1px solid ${color}44`,
                fontSize: 13,
                fontWeight: 700,
                color: color as string,
                letterSpacing: 1,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* URL */}
        <div style={{ position:"absolute", bottom:20, fontSize:12, color:"rgba(0,229,255,.35)", letterSpacing:2 }}>
          nexusai.gg
        </div>

        {/* Bottom bar */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:3, background:"linear-gradient(90deg,transparent,#8800ff 40%,#00e5ff 60%,transparent)" }} />
      </div>
    ),
    { ...size }
  );
}