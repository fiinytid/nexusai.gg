import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

/* ─────────────────────────────────────────────────────────────────────────────
   Fonts
   Using next/font for automatic optimisation & self-hosting (no layout shift)
───────────────────────────────────────────────────────────────────────────── */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

/* ─────────────────────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────────────────── */
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://nexusai-gg-beta.vercel.app";

const APP_NAME        = "NEXUS AI";
const APP_DESCRIPTION =
  "The most advanced AI assistant for Roblox developers. Write Lua, debug scripts, build GUIs, and inject directly into Roblox Studio.";
const APP_AUTHOR      = "NEXUS STUDIO";
const TWITTER_HANDLE  = "@nexusstudio";
const THEME_COLOR     = "#030312";

/* ─────────────────────────────────────────────────────────────────────────────
   Metadata
───────────────────────────────────────────────────────────────────────────── */
export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  /* ── Titles ── */
  title: {
    default:  `${APP_NAME} — Roblox Dev Intelligence`,
    template: `%s | ${APP_NAME}`,
  },

  /* ── Core ── */
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  category: "developer tools",
  creator: APP_AUTHOR,
  publisher: APP_AUTHOR,
  authors: [{ name: APP_AUTHOR, url: BASE_URL }],

  keywords: [
    "NEXUS AI",
    "Roblox AI",
    "Roblox Studio",
    "Lua AI",
    "Roblox developer",
    "Roblox script",
    "AI assistant",
    "Studio plugin",
    "DataStore",
    "GUI builder",
  ],

  /* ── Canonical ── */
  alternates: { canonical: BASE_URL },

  /* ── Robots ── */
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },

  /* ── Open Graph ── */
  openGraph: {
    type: "website",
    url: BASE_URL,
    siteName: APP_NAME,
    locale: "en_US",
    title: `${APP_NAME} — Roblox Dev Intelligence`,
    description:
      "Write Lua, debug scripts, build GUIs — and inject directly into Roblox Studio.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} — Roblox Dev Intelligence`,
      },
    ],
  },

  /* ── Twitter / X ── */
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — Roblox Dev Intelligence`,
    description: `The most advanced AI assistant for Roblox developers.`,
    images: ["/og-image.png"],
    creator: TWITTER_HANDLE,
  },

  /* ── Icons ── */
  icons: {
    icon: [
      { url: "/favicon.ico",   sizes: "any" },
      { url: "/icon-16.png",   type: "image/png", sizes: "16x16"  },
      { url: "/icon-32.png",   type: "image/png", sizes: "32x32"  },
      { url: "/icon-192.png",  type: "image/png", sizes: "192x192" },
    ],
    apple:    [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: "/favicon.ico",
  },

  /* ── PWA manifest ── */
  manifest: "/manifest.json",
};

/* ─────────────────────────────────────────────────────────────────────────────
   Viewport  (separate export required by Next.js 14+)
───────────────────────────────────────────────────────────────────────────── */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  colorScheme: "dark",
  themeColor: [
    { media: "(prefers-color-scheme: dark)",  color: THEME_COLOR },
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR },
  ],
};

/* ─────────────────────────────────────────────────────────────────────────────
   Structured Data  (JSON-LD)
───────────────────────────────────────────────────────────────────────────── */
const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: APP_NAME,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  description:
    "AI-powered assistant for Roblox developers. Lua code generation, Studio injection, DataStore design and more.",
  url: BASE_URL,
  author: { "@type": "Organization", name: APP_AUTHOR },
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
});

/* ─────────────────────────────────────────────────────────────────────────────
   Root Layout
───────────────────────────────────────────────────────────────────────────── */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${inter.variable} ${jetbrainsMono.variable}`}
        suppressHydrationWarning
      >
        <head>
          {/* JSON-LD structured data */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLd }}
          />
        </head>

        <body suppressHydrationWarning>
          {children}

          {/* Vercel observability */}
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}