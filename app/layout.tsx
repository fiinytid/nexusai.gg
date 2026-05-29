import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs"; // 1. Import ClerkProvider
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

/* ── Base URL ─────────────────────────────────────────────────────────────── */
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://nexusai-gg-beta.vercel.app";

/* ── Shared metadata ──────────────────────────────────────────────────────── */
export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default: "NEXUS AI — Roblox Dev Intelligence",
    template: "%s | NEXUS AI",
  },
  description:
    "The most advanced AI assistant for Roblox developers. Write Lua, debug scripts, build GUIs, and inject directly into Roblox Studio.",

  keywords: [
    "NEXUS AI", "Roblox AI", "Roblox Studio", "Lua AI", "Roblox developer",
    "Roblox script", "AI assistant", "Studio plugin", "DataStore", "GUI builder",
  ],

  authors: [{ name: "NEXUS STUDIO", url: BASE_URL }],
  creator: "NEXUS STUDIO",
  publisher: "NEXUS STUDIO",

  /* ── Open Graph ─────────────────────────────────────────────────────────── */
  openGraph: {
    type: "website",
    url: BASE_URL,
    siteName: "NEXUS AI",
    title: "NEXUS AI — Roblox Dev Intelligence",
    description:
      "Write Lua, debug scripts, build GUIs — and inject directly into Roblox Studio.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "NEXUS AI — Roblox Dev Intelligence",
      },
    ],
    locale: "en_US",
  },

  /* ── Twitter / X Card ───────────────────────────────────────────────────── */
  twitter: {
    card: "summary_large_image",
    title: "NEXUS AI — Roblox Dev Intelligence",
    description:
      "The most advanced AI assistant for Roblox developers.",
    images: ["/og-image.png"],
    creator: "@nexusstudio",
  },

  /* ── Icons ──────────────────────────────────────────────────────────────── */
  icons: {
    icon: [
      { url: "/favicon.ico",              sizes: "any" },
      { url: "/icon-16.png",  type: "image/png", sizes: "16x16" },
      { url: "/icon-32.png",  type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple:   [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: "/favicon.ico",
  },

  /* ── PWA manifest ───────────────────────────────────────────────────────── */
  manifest: "/manifest.json",

  /* ── Robots ─────────────────────────────────────────────────────────────── */
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },

  /* ── Canonical ──────────────────────────────────────────────────────────── */
  alternates: { canonical: BASE_URL },

  /* ── App / browser meta ─────────────────────────────────────────────────── */
  applicationName: "NEXUS AI",
  category: "developer tools",
};

/* ── Viewport (separate export — Next.js 14+) ────────────────────────────── */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)",  color: "#030312" },
    { media: "(prefers-color-scheme: light)", color: "#030312" },
  ],
  colorScheme: "dark",
};

/* ── Root Layout ─────────────────────────────────────────────────────────── */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider> {/* 2. Bungkus seluruh aplikasi dengan ClerkProvider */}
      <html lang="en" suppressHydrationWarning>
        <head>
          {/* Preconnect to Google Fonts CDN */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

          {/* Structured data — SoftwareApplication */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                name: "NEXUS AI",
                applicationCategory: "DeveloperApplication",
                operatingSystem: "Web",
                description:
                  "AI-powered assistant for Roblox developers. Lua code generation, Studio injection, DataStore design and more.",
                url: BASE_URL,
                author: { "@type": "Organization", name: "NEXUS STUDIO" },
                offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              }),
            }}
          />
        </head>

        <body suppressHydrationWarning>
          {/* Page content */}
          {children}

          {/* Vercel observability */}
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}