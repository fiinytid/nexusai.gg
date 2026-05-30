// ─────────────────────────────────────────────────────────────────────────────
// app/manifest.ts
//
// Web App Manifest — enables "Add to Home Screen" PWA install prompt
// Next.js 14+ will automatically serve this at /manifest.json
//
// Docs: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
// ─────────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             "NEXUS AI — Roblox Dev Intelligence",
    short_name:       "NEXUS AI",
    description:
      "The most advanced AI assistant for Roblox developers. Write Lua, debug scripts, build GUIs, and inject directly into Roblox Studio.",
    start_url:        "/dashboard",
    scope:            "/",
    display:          "standalone",
    orientation:      "portrait-primary",
    background_color: "#030312",
    theme_color:      "#030312",
    lang:             "en",
    categories:       ["developer", "productivity", "utilities"],
    icons: [
      { src: "/icon-16.png",   sizes: "16x16",   type: "image/png" },
      { src: "/icon-32.png",   sizes: "32x32",   type: "image/png" },
      { src: "/icon-48.png",   sizes: "48x48",   type: "image/png" },
      { src: "/icon-96.png",   sizes: "96x96",   type: "image/png" },
      { src: "/icon-192.png",  sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png",  sizes: "512x512", type: "image/png", purpose: "any"      },
    ],
    screenshots: [
      {
        src:          "/screenshot-desktop.png",
        sizes:        "1280x720",
        type:         "image/png",
        // @ts-expect-error – form_factor is valid but not in Next.js types yet
        form_factor:  "wide",
        label:        "NEXUS AI Dashboard",
      },
      {
        src:    "/screenshot-mobile.png",
        sizes:  "390x844",
        type:   "image/png",
        label:  "NEXUS AI Chat on Mobile",
      },
    ],
    shortcuts: [
      {
        name:        "New Chat",
        url:         "/chats/new",
        description: "Start a new AI chat",
        icons: [{ src: "/icon-96.png", sizes: "96x96" }],
      },
      {
        name:        "Dashboard",
        url:         "/dashboard",
        description: "Open your projects",
        icons: [{ src: "/icon-96.png", sizes: "96x96" }],
      },
    ],
    related_applications: [
      {
        platform: "web",
        url:      "https://nexusai-gg-beta.vercel.app",
        id:       "nexusai.gg",
      },
    ],
    prefer_related_applications: false,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// public/browserconfig.xml  (paste this as a separate file in /public)
// ─────────────────────────────────────────────────────────────────────────────
/*
<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square70x70logo   src="/icon-96.png"/>
      <square150x150logo src="/icon-192.png"/>
      <wide310x150logo   src="/icon-192.png"/>
      <square310x310logo src="/icon-512.png"/>
      <TileColor>#030312</TileColor>
    </tile>
  </msapplication>
</browserconfig>
*/


// ─────────────────────────────────────────────────────────────────────────────
// app/robots.ts  (bonus: generates /robots.txt automatically)
// ─────────────────────────────────────────────────────────────────────────────
/*
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://nexusai-gg-beta.vercel.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/dashboard", "/chats"],
        disallow: ["/api/", "/admin-panel", "/_next/"],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        crawlDelay: 2,
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host:    BASE_URL,
  };
}
*/


// ─────────────────────────────────────────────────────────────────────────────
// app/sitemap.ts  (bonus: generates /sitemap.xml automatically)
// ─────────────────────────────────────────────────────────────────────────────
/*
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://nexusai-gg-beta.vercel.app";
  const now = new Date();
  return [
    { url: BASE_URL,                   lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE_URL}/dashboard`,    lastModified: now, changeFrequency: "weekly",  priority: 0.9 },
    { url: `${BASE_URL}/chats`,        lastModified: now, changeFrequency: "daily",   priority: 0.8 },
    { url: `${BASE_URL}/payment`,      lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/agent.html`,   lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];
}
*/