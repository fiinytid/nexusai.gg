import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import type { BeforeSendEvent } from "@vercel/analytics";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

/* ─────────────────────────────────────────────────────────────────────────────
   Fonts  (next/font – zero layout shift, auto-optimized)
───────────────────────────────────────────────────────────────────────────── */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "Arial", "sans-serif"],
  adjustFontFallback: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  preload: true,
  fallback: ["Courier New", "monospace"],
  adjustFontFallback: true,
});

/* ─────────────────────────────────────────────────────────────────────────────
   Site Constants  (single source of truth — update only here)
───────────────────────────────────────────────────────────────────────────── */
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://nexusai-rbx.vercel.app";

const APP_NAME         = "NEXUS AI";
const APP_SHORT_NAME   = "NEXUS";
const APP_DESCRIPTION  =
  "The most advanced AI assistant for Roblox developers. Write Lua scripts, debug code, build GUIs, and inject directly into Roblox Studio.";
const APP_TAGLINE      =
  "Write Lua · Debug Scripts · Build GUIs · Inject into Studio";
const APP_AUTHOR       = "NEXUS STUDIO";
const APP_EMAIL        = "support@nexusai.gg";
const APP_VERSION      = "2.0.0";
const TWITTER_HANDLE   = "@NexusLabss";
const DISCORD_URL      = "https://discord.gg/FzAF48mvK5";
const YOUTUBE_URL      = "https://www.youtube.com/@NexusLabss";
const ROBLOX_STORE_URL =
  "https://create.roblox.com/store/asset/91870814099475/NEXUS-AI";
const THEME_COLOR      = "#030312";
const ACCENT_COLOR     = "#00e5ff";

/* ─────────────────────────────────────────────────────────────────────────────
   Analytics — beforeSend helper
   Defined at module level (NOT inside JSX) so it is never passed as an
   anonymous function to a Client Component, which would break static export.
───────────────────────────────────────────────────────────────────────────── */
function stripPiiFromEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url);
  url.searchParams.delete("email");
  url.searchParams.delete("token");
  url.searchParams.delete("key");
  return { ...event, url: url.toString() };
}

/* ─────────────────────────────────────────────────────────────────────────────
   SEO Keywords  (comprehensive — brand + features + long-tail)
───────────────────────────────────────────────────────────────────────────── */
const KEYWORDS: string[] = [
  // Brand
  "NEXUS AI",
  "NEXUS STUDIO",
  "nexusai.gg",
  // Core product
  "Roblox AI assistant",
  "Roblox developer AI",
  "Roblox Studio AI",
  "Lua AI assistant",
  "Roblox script generator",
  "AI for Roblox",
  // Features
  "Roblox Lua code generator",
  "Roblox GUI builder AI",
  "Roblox DataStore design",
  "Roblox Studio plugin AI",
  "Roblox script injection",
  "Roblox AI chat assistant",
  "Roblox game development AI",
  // Competitor / alternative search terms
  "AI coding assistant for Roblox",
  "ChatGPT for Roblox",
  "Roblox scripting tool",
  "Lua code generator online",
  // Long-tail
  "how to script in Roblox with AI",
  "AI assistant for Roblox developers",
  "write Roblox scripts with AI",
  "debug Roblox scripts automatically",
  "free Roblox AI tool",
  "best AI for Roblox development",
];

/* ─────────────────────────────────────────────────────────────────────────────
   JSON-LD Structured Data Schemas
   Multiple schemas → richer Google search results (SoftwareApp + Org + FAQ)
───────────────────────────────────────────────────────────────────────────── */
const jsonLdSchemas = [
  /* ── SoftwareApplication ────────────────────────────────────────────── */
  /* Shows ratings, category, and offers directly in Google results        */
  {
    "@context":          "https://schema.org",
    "@type":             "SoftwareApplication",
    "@id":               `${BASE_URL}/#software`,
    name:                APP_NAME,
    applicationCategory: "DeveloperApplication",
    operatingSystem:     "Web, Windows, macOS, Linux",
    description:         APP_DESCRIPTION,
    url:                 BASE_URL,
    image:               `${BASE_URL}/og-image.png`,
    softwareVersion:     APP_VERSION,
    releaseNotes:        `${BASE_URL}/changelog`,
    screenshot:          `${BASE_URL}/og-image.png`,
    featureList: [
      "Lua script generation for Roblox Studio",
      "Roblox Studio plugin with direct code injection",
      "AI-powered GUI builder",
      "DataStore architecture design",
      "Real-time script debugging",
      "Multi-model AI support (Gemini, Claude, and more)",
      "Indonesian and English language support",
    ],
    author: {
      "@type":  "Organization",
      "@id":    `${BASE_URL}/#organization`,
      name:     APP_AUTHOR,
      url:      BASE_URL,
      email:    APP_EMAIL,
    },
    offers: {
      "@type":       "Offer",
      price:         "0",
      priceCurrency: "USD",
      availability:  "https://schema.org/InStock",
      description:
        "Free plan with 30 starter credits and 2 daily credits. Pro plan available with 25 credits per day and higher limits.",
    },
    aggregateRating: {
      "@type":       "AggregateRating",
      ratingValue:   "4.8",
      ratingCount:   "120",
      bestRating:    "5",
      worstRating:   "1",
    },
  },

  /* ── Organization ───────────────────────────────────────────────────── */
  /* Helps Google show a Knowledge Panel for the brand                     */
  {
    "@context": "https://schema.org",
    "@type":    "Organization",
    "@id":      `${BASE_URL}/#organization`,
    name:        APP_AUTHOR,
    url:         BASE_URL,
    email:       APP_EMAIL,
    description: `${APP_AUTHOR} builds AI-powered developer tools for Roblox game creators.`,
    logo: {
      "@type": "ImageObject",
      url:     `${BASE_URL}/icon-512.png`,
      width:   512,
      height:  512,
    },
    image: `${BASE_URL}/og-image.png`,
    sameAs: [
      DISCORD_URL,
      `https://twitter.com/${TWITTER_HANDLE.replace("@", "")}`,
      YOUTUBE_URL,
      ROBLOX_STORE_URL,
    ],
    contactPoint: {
      "@type":           "ContactPoint",
      contactType:       "Customer Support",
      availableLanguage: ["English", "Indonesian"],
      url:               DISCORD_URL,
    },
  },

  /* ── WebSite ────────────────────────────────────────────────────────── */
  /* Enables Google's Sitelinks searchbox                                  */
  {
    "@context":  "https://schema.org",
    "@type":     "WebSite",
    "@id":       `${BASE_URL}/#website`,
    url:          BASE_URL,
    name:         APP_NAME,
    description:  APP_DESCRIPTION,
    inLanguage:   ["en-US", "id-ID"],
    publisher:    { "@id": `${BASE_URL}/#organization` },
    potentialAction: {
      "@type":  "SearchAction",
      target: {
        "@type":     "EntryPoint",
        urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  },

  /* ── FAQPage ────────────────────────────────────────────────────────── */
  /* Shows expandable Q&A directly in Google search results                */
  {
    "@context":  "https://schema.org",
    "@type":     "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name:    "What is NEXUS AI?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "NEXUS AI is an advanced AI assistant built specifically for Roblox developers. It writes Lua scripts, debugs code, builds GUIs, and injects code directly into Roblox Studio via a dedicated plugin.",
        },
      },
      {
        "@type": "Question",
        name:    "Is NEXUS AI free to use?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Yes. NEXUS AI offers a free plan that includes 30 starter credits. You earn 2 free credits every day just by logging in. Upgrade to Pro for 25 daily credits and higher usage limits.",
        },
      },
      {
        "@type": "Question",
        name:    "How does the Roblox Studio plugin work?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Install the NEXUS AI plugin from the Roblox Creator Store, enable HTTP Requests and Script Injection in your Studio settings, then click CONNECT in the toolbar. Once connected, AI-generated scripts are injected directly into your game without copy-pasting.",
        },
      },
      {
        "@type": "Question",
        name:    "Which AI models does NEXUS AI support?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "NEXUS AI supports multiple AI models including Gemini 2.5 Flash, Claude 3.5, and others. You can switch models at any time from the model selector in the chat input bar.",
        },
      },
      {
        "@type": "Question",
        name:    "Does NEXUS AI support languages other than English?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Yes. NEXUS AI fully supports both English and Bahasa Indonesia. Switch your preferred language at any time from the Settings panel in the sidebar.",
        },
      },
      {
        "@type": "Question",
        name:    "Where can I get support or report a bug?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            `Join the NEXUS AI Discord community at ${DISCORD_URL}. Our support team is active and responds in both English and Indonesian.`,
        },
      },
    ],
  },
] as const;

/* ─────────────────────────────────────────────────────────────────────────────
   Metadata Export  (used by Next.js for <head> generation)
───────────────────────────────────────────────────────────────────────────── */
export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  /* ── Title ──────────────────────────────────────────────────────────── */
  title: {
    default:  `${APP_NAME} — Roblox Dev Intelligence`,
    template: `%s | ${APP_NAME}`,
  },

  /* ── Core Meta ──────────────────────────────────────────────────────── */
  description:     APP_DESCRIPTION,
  applicationName: APP_NAME,
  category:        "Developer Tools",
  creator:         APP_AUTHOR,
  publisher:       APP_AUTHOR,
  authors:         [{ name: APP_AUTHOR, url: BASE_URL }],
  generator:       "Next.js",
  referrer:        "origin-when-cross-origin",
  keywords:        KEYWORDS,

  /* ── Canonical URL & Language Alternates ────────────────────────────── */
  alternates: {
    canonical: BASE_URL,
    languages: {
      "en-US": BASE_URL,
      "id-ID": `${BASE_URL}/id`,
    },
  },

  /* ── Robots / Crawl Directives ──────────────────────────────────────── */
  robots: {
    index:    true,
    follow:   true,
    nocache:  false,
    googleBot: {
      index:               true,
      follow:              true,
      noimageindex:        false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet":       -1,
    },
  },

  /* ── Open Graph (Facebook, LinkedIn, Discord, Telegram, WhatsApp) ───── */
  openGraph: {
    type:        "website",
    url:         BASE_URL,
    siteName:    APP_NAME,
    locale:      "en_US",
    title:       `${APP_NAME} — Roblox Dev Intelligence`,
    description: APP_TAGLINE,
    images: [
      {
        /* Primary 1200×630 — used by most platforms */
        url:    "/og-image.png",
        width:  1200,
        height: 630,
        alt:    `${APP_NAME} — Roblox Dev Intelligence`,
        type:   "image/png",
      },
      {
        /* Square fallback 1:1 — used by some mobile clients */
        url:    "/og-image-square.png",
        width:  600,
        height: 600,
        alt:    APP_NAME,
        type:   "image/png",
      },
    ],
  },

  /* ── Twitter / X Card ───────────────────────────────────────────────── */
  twitter: {
    card:        "summary_large_image",
    site:        TWITTER_HANDLE,
    creator:     TWITTER_HANDLE,
    title:       `${APP_NAME} — Roblox Dev Intelligence`,
    description: `The most advanced AI assistant for Roblox developers. ${APP_TAGLINE}.`,
    images: [
      {
        url:    "/twitter-image.png",
        width:  1200,
        height: 628,
        alt:    `${APP_NAME} — Roblox Dev Intelligence`,
      },
    ],
  },

  /* ── App Links (deep-linking for mobile clients) ────────────────────── */
  appLinks: {
    web: {
      url:             BASE_URL,
      should_fallback: false,
    },
  },

  /* ── Icons ──────────────────────────────────────────────────────────── */
  icons: {
    icon: [
      { url: "/favicon.ico",  sizes: "any"       },
      { url: "/icon-16.png",  type: "image/png",  sizes: "16x16"   },
      { url: "/icon-32.png",  type: "image/png",  sizes: "32x32"   },
      { url: "/icon-48.png",  type: "image/png",  sizes: "48x48"   },
      { url: "/icon-96.png",  type: "image/png",  sizes: "96x96"   },
      { url: "/icon-192.png", type: "image/png",  sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png",  sizes: "512x512" },
      { url: "/icon.svg",     type: "image/svg+xml"                },
    ],
    apple: [
      { url: "/apple-touch-icon.png",     sizes: "180x180" },
      { url: "/apple-touch-icon-152.png", sizes: "152x152" },
      { url: "/apple-touch-icon-120.png", sizes: "120x120" },
    ],
    shortcut: "/favicon.ico",
    other: [
      { rel: "mask-icon",              url: "/safari-pinned-tab.svg", color: ACCENT_COLOR },
      { rel: "msapplication-TileImage", url: "/icon-192.png" },
    ],
  },

  /* ── PWA / Web App Manifest ─────────────────────────────────────────── */
  manifest: "/manifest.json",

  /* ── Search Engine Verification Tags ───────────────────────────────── */
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFY ?? "",
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFY      ?? "",
  },

  /* ── Miscellaneous Head Tags ────────────────────────────────────────── */
  other: {
    /* Bing / Microsoft Clarity */
    "msvalidate.01":                          process.env.NEXT_PUBLIC_BING_VERIFY ?? "",
    /* Referrer policy */
    "referrer":                               "strict-origin-when-cross-origin",
    /* Discord embed accent color */
    "theme-color":                            THEME_COLOR,
    /* Telegram open-in-browser hint */
    "telegram:channel":                       DISCORD_URL,
    /* Apple mobile web app config */
    "apple-mobile-web-app-capable":           "yes",
    "apple-mobile-web-app-status-bar-style":  "black-translucent",
    "apple-mobile-web-app-title":             APP_SHORT_NAME,
    /* Microsoft Windows tiles */
    "msapplication-TileColor":                THEME_COLOR,
    "msapplication-config":                   "/browserconfig.xml",
    /* Disable auto-phone-link detection on iOS */
    "format-detection":                       "telephone=no",
    /* Prevent MIME-type sniffing */
    "X-Content-Type-Options":                 "nosniff",
    /* Clickjacking protection */
    "X-Frame-Options":                        "SAMEORIGIN",
    /* XSS protection hint for legacy browsers */
    "X-XSS-Protection":                       "1; mode=block",
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
   Viewport  (Next.js 14+ requires a separate export from metadata)
───────────────────────────────────────────────────────────────────────────── */
export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  maximumScale: 5,       // allow pinch-zoom for accessibility
  userScalable: true,
  colorScheme:  "dark",
  themeColor: [
    { media: "(prefers-color-scheme: dark)",  color: THEME_COLOR },
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR },
  ],
};

/* ─────────────────────────────────────────────────────────────────────────────
   Root Layout
───────────────────────────────────────────────────────────────────────────── */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* ── JSON-LD Structured Data (multiple schemas for richer results) ── */}
        {jsonLdSchemas.map((schema, index) => (
          <script
            key={index}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}

        {/* ── Preconnect to critical third-party origins ── */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.roblox.com" />
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" />

        {/* ── DNS prefetch for secondary assets ── */}
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        <link rel="dns-prefetch" href="https://challenges.cloudflare.com" />
        <link rel="dns-prefetch" href="https://va.vercel-scripts.com" />

        {/* ── Windows tile / browser config ── */}
        <meta name="msapplication-config"     content="/browserconfig.xml" />
        <meta name="msapplication-TileColor"  content={THEME_COLOR} />
        <meta name="msapplication-TileImage"  content="/icon-192.png" />

        {/* ── Safari pinned-tab icon ── */}
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color={ACCENT_COLOR} />

        {/* ── Canonical (belt-and-suspenders alongside metadata export) ── */}
        <link rel="canonical" href={BASE_URL} />
      </head>

      <body suppressHydrationWarning>
        {children}

        {/* ── Vercel Web Analytics ── */}
        <Analytics
          debug={process.env.NODE_ENV === "development"}
          beforeSend={stripPiiFromEvent}
        />

        {/* ── Vercel Speed Insights ── */}
        <SpeedInsights debug={process.env.NODE_ENV === "development"} />
      </body>
    </html>
  );
}