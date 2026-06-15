import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ClerkProvider } from "@clerk/nextjs";
import { AccountModalProvider } from "@/components/useAccountModal";
import "./globals.css";

/* ─────────────────────────────────────────────────────────────────────────────
   Fonts
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
   Site Constants
───────────────────────────────────────────────────────────────────────────── */
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://nexusai-rbx.vercel.app";

const APP_NAME        = "NEXUS AI";
const APP_SHORT_NAME  = "NEXUS";
const APP_DESCRIPTION =
  "The most advanced AI assistant for Roblox developers. Write Lua scripts, debug code, build GUIs, and inject directly into Roblox Studio.";
const APP_TAGLINE     =
  "Write Lua · Debug Scripts · Build GUIs · Inject into Studio";
const APP_AUTHOR      = "NEXUS STUDIO";
const APP_EMAIL       = "support@nexusai.gg";
const APP_VERSION     = "2.0.0";
const TWITTER_HANDLE  = "@NexusLabss";
const DISCORD_URL     = "https://discord.gg/FzAF48mvK5";
const YOUTUBE_URL     = "https://www.youtube.com/@NexusLabss";
const ROBLOX_STORE_URL =
  "https://create.roblox.com/store/asset/91870814099475/NEXUS-AI";
const THEME_COLOR  = "#030312";
const ACCENT_COLOR = "#00e5ff";

/* ─────────────────────────────────────────────────────────────────────────────
   Clerk Appearance Config
   Note: ClerkProvider only — UI components (SignedIn, SignedOut, UserButton,
   etc.) must be imported inside "use client" components, NOT in Server
   Components like this layout file.
───────────────────────────────────────────────────────────────────────────── */
const clerkAppearance = {
  variables: {
    colorPrimary:         ACCENT_COLOR,
    colorBackground:      "#0a0a1a",
    colorInputBackground: "#12122a",
    colorText:            "#e2e8f0",
    colorTextSecondary:   "#94a3b8",
    colorNeutral:         "#1e1e3a",
    colorDanger:          "#f87171",
    colorSuccess:         "#34d399",
    borderRadius:         "0.5rem",
    fontFamily:           "var(--font-inter), system-ui, sans-serif",
    fontFamilyButtons:    "var(--font-inter), system-ui, sans-serif",
  },
  elements: {
    card: {
      backgroundColor: "#0a0a1a",
      border:          "1px solid rgba(0, 229, 255, 0.15)",
      boxShadow:       "0 25px 50px rgba(0, 229, 255, 0.05)",
    },
    headerTitle:    { color: "#ffffff", fontWeight: "700" },
    headerSubtitle: { color: "#94a3b8" },
    socialButtonsBlockButton: {
      backgroundColor: "#12122a",
      border:          "1px solid rgba(255,255,255,0.1)",
      color:           "#e2e8f0",
      "&:hover": {
        backgroundColor: "#1a1a35",
        borderColor:     "rgba(0, 229, 255, 0.3)",
      },
    },
    dividerLine:    { backgroundColor: "rgba(255,255,255,0.08)" },
    dividerText:    { color: "#64748b" },
    formFieldLabel: { color: "#cbd5e1" },
    formFieldInput: {
      backgroundColor: "#12122a",
      border:          "1px solid rgba(255,255,255,0.1)",
      color:           "#e2e8f0",
      "&:focus": {
        borderColor: ACCENT_COLOR,
        boxShadow:   `0 0 0 2px rgba(0, 229, 255, 0.2)`,
      },
    },
    formButtonPrimary: {
      background:    `linear-gradient(135deg, ${ACCENT_COLOR}, #0088ff)`,
      color:         "#000000",
      fontWeight:    "600",
      letterSpacing: "0.025em",
      "&:hover": { opacity: "0.9", transform: "translateY(-1px)" },
    },
    footerActionLink: {
      color:    ACCENT_COLOR,
      "&:hover": { color: "#33eaff" },
    },
    userButtonPopoverCard: {
      backgroundColor: "#0a0a1a",
      border:          "1px solid rgba(0, 229, 255, 0.15)",
    },
    userButtonPopoverActionButton: {
      color:     "#e2e8f0",
      "&:hover": { backgroundColor: "#12122a" },
    },
    userButtonPopoverFooter: { display: "none" },
    avatarBox: { border: `2px solid ${ACCENT_COLOR}` },
  },
  layout: {
    socialButtonsPlacement: "top" as const,
    showOptionalFields:     false,
    logoPlacement:          "inside" as const,
  },
} as const;

/* ─────────────────────────────────────────────────────────────────────────────
   SEO Keywords
───────────────────────────────────────────────────────────────────────────── */
const KEYWORDS: string[] = [
  "NEXUS AI", "NEXUS STUDIO", "nexusai.gg",
  "Roblox AI assistant", "Roblox developer AI", "Roblox Studio AI",
  "Lua AI assistant", "Roblox script generator", "AI for Roblox",
  "Roblox Lua code generator", "Roblox GUI builder AI",
  "Roblox DataStore design", "Roblox Studio plugin AI",
  "Roblox script injection", "Roblox AI chat assistant",
  "Roblox game development AI", "AI coding assistant for Roblox",
  "ChatGPT for Roblox", "Roblox scripting tool", "Lua code generator online",
  "how to script in Roblox with AI", "AI assistant for Roblox developers",
  "write Roblox scripts with AI", "debug Roblox scripts automatically",
  "free Roblox AI tool", "best AI for Roblox development",
];

/* ─────────────────────────────────────────────────────────────────────────────
   JSON-LD Structured Data
───────────────────────────────────────────────────────────────────────────── */
const jsonLdSchemas = [
  {
    "@context": "https://schema.org",
    "@type":    "SoftwareApplication",
    "@id":      `${BASE_URL}/#software`,
    name:       APP_NAME,
    applicationCategory: "DeveloperApplication",
    operatingSystem:     "Web, Windows, macOS, Linux",
    description: APP_DESCRIPTION,
    url:         BASE_URL,
    image:         `${BASE_URL}/og-image.png`,
    softwareVersion: APP_VERSION,
    releaseNotes:    `${BASE_URL}/changelog`,
    screenshot:      `${BASE_URL}/og-image.png`,
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
      "@type": "Organization",
      "@id":   `${BASE_URL}/#organization`,
      name:    APP_AUTHOR,
      url:     BASE_URL,
      email:   APP_EMAIL,
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
      "@type":      "AggregateRating",
      ratingValue:  "4.8",
      ratingCount:  "120",
      bestRating:   "5",
      worstRating:  "1",
    },
  },
  {
    "@context": "https://schema.org",
    "@type":    "Organization",
    "@id":      `${BASE_URL}/#organization`,
    name:       APP_AUTHOR,
    url:        BASE_URL,
    email:      APP_EMAIL,
    description: `${APP_AUTHOR} builds AI-powered developer tools for Roblox game creators.`,
    logo: {
      "@type": "ImageObject",
      url:     `${BASE_URL}/icon-512.png`,
      width:   512,
      height:  512,
    },
    image:   `${BASE_URL}/og-image.png`,
    sameAs:  [
      DISCORD_URL,
      `https://twitter.com/${TWITTER_HANDLE.replace("@", "")}`,
      YOUTUBE_URL,
      ROBLOX_STORE_URL,
    ],
    contactPoint: {
      "@type":            "ContactPoint",
      contactType:        "Customer Support",
      availableLanguage:  ["English", "Indonesian"],
      url:                DISCORD_URL,
    },
  },
  {
    "@context": "https://schema.org",
    "@type":    "WebSite",
    "@id":      `${BASE_URL}/#website`,
    url:        BASE_URL,
    name:       APP_NAME,
    description: APP_DESCRIPTION,
    inLanguage:  ["en-US", "id-ID"],
    publisher:   { "@id": `${BASE_URL}/#organization` },
    potentialAction: {
      "@type":  "SearchAction",
      target:   {
        "@type":     "EntryPoint",
        urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  },
  {
    "@context": "https://schema.org",
    "@type":    "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name:    "What is NEXUS AI?",
        acceptedAnswer: {
          "@type": "Answer",
          text:    "NEXUS AI is an advanced AI assistant built specifically for Roblox developers. It writes Lua scripts, debugs code, builds GUIs, and injects code directly into Roblox Studio via a dedicated plugin.",
        },
      },
      {
        "@type": "Question",
        name:    "Is NEXUS AI free to use?",
        acceptedAnswer: {
          "@type": "Answer",
          text:    "Yes. NEXUS AI offers a free plan that includes 30 starter credits. You earn 2 free credits every day just by logging in. Upgrade to Pro for 25 daily credits and higher usage limits.",
        },
      },
      {
        "@type": "Question",
        name:    "How does the Roblox Studio plugin work?",
        acceptedAnswer: {
          "@type": "Answer",
          text:    "Install the NEXUS AI plugin from the Roblox Creator Store, enable HTTP Requests and Script Injection in your Studio settings, then click CONNECT in the toolbar. Once connected, AI-generated scripts are injected directly into your game without copy-pasting.",
        },
      },
      {
        "@type": "Question",
        name:    "Which AI models does NEXUS AI support?",
        acceptedAnswer: {
          "@type": "Answer",
          text:    "NEXUS AI supports multiple AI models including Gemini 2.5 Flash, Claude 3.5, and others. You can switch models at any time from the model selector in the chat input bar.",
        },
      },
      {
        "@type": "Question",
        name:    "Does NEXUS AI support languages other than English?",
        acceptedAnswer: {
          "@type": "Answer",
          text:    "Yes. NEXUS AI fully supports both English and Bahasa Indonesia. Switch your preferred language at any time from the Settings panel in the sidebar.",
        },
      },
      {
        "@type": "Question",
        name:    "Where can I get support or report a bug?",
        acceptedAnswer: {
          "@type": "Answer",
          text:    `Join the NEXUS AI Discord community at ${DISCORD_URL}. Our support team is active and responds in both English and Indonesian.`,
        },
      },
    ],
  },
] as const;

/* ─────────────────────────────────────────────────────────────────────────────
   Metadata Export
───────────────────────────────────────────────────────────────────────────── */
export const metadata: Metadata = {
  metadataBase:    new URL(BASE_URL),
  title:           { default: `${APP_NAME} — Roblox Dev Intelligence`, template: `%s | ${APP_NAME}` },
  description:     APP_DESCRIPTION,
  applicationName: APP_NAME,
  category:        "Developer Tools",
  creator:         APP_AUTHOR,
  publisher:       APP_AUTHOR,
  authors:         [{ name: APP_AUTHOR, url: BASE_URL }],
  generator:       "Next.js",
  referrer:        "origin-when-cross-origin",
  keywords:        KEYWORDS,
  alternates: {
    canonical: BASE_URL,
    languages: { "en-US": BASE_URL, "id-ID": `${BASE_URL}/id` },
  },
  robots: {
    index:  true,
    follow: true,
    nocache: false,
    googleBot: {
      index:            true,
      follow:           true,
      noimageindex:     false,
      "max-video-preview":  -1,
      "max-image-preview":  "large",
      "max-snippet":        -1,
    },
  },
  openGraph: {
    type:        "website",
    url:         BASE_URL,
    siteName:    APP_NAME,
    locale:      "en_US",
    title:       `${APP_NAME} — Roblox Dev Intelligence`,
    description: APP_TAGLINE,
    images: [
      { url: "/og-image.png",        width: 1200, height: 630, alt: `${APP_NAME} — Roblox Dev Intelligence`, type: "image/png" },
      { url: "/og-image-square.png", width: 600,  height: 600, alt: APP_NAME, type: "image/png" },
    ],
  },
  twitter: {
    card:        "summary_large_image",
    site:        TWITTER_HANDLE,
    creator:     TWITTER_HANDLE,
    title:       `${APP_NAME} — Roblox Dev Intelligence`,
    description: `The most advanced AI assistant for Roblox developers. ${APP_TAGLINE}.`,
    images: [{ url: "/twitter-image.png", width: 1200, height: 628, alt: `${APP_NAME} — Roblox Dev Intelligence` }],
  },
  appLinks: { web: { url: BASE_URL, should_fallback: false } },
  icons: {
    icon: [
      { url: "/favicon.ico",  sizes: "any"     },
      { url: "/icon-16.png",  type: "image/png", sizes: "16x16"   },
      { url: "/icon-32.png",  type: "image/png", sizes: "32x32"   },
      { url: "/icon-48.png",  type: "image/png", sizes: "48x48"   },
      { url: "/icon-96.png",  type: "image/png", sizes: "96x96"   },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { url: "/icon.svg",     type: "image/svg+xml"               },
    ],
    apple: [
      { url: "/apple-touch-icon.png",     sizes: "180x180" },
      { url: "/apple-touch-icon-152.png", sizes: "152x152" },
      { url: "/apple-touch-icon-120.png", sizes: "120x120" },
    ],
    shortcut: "/favicon.ico",
    other: [
      { rel: "mask-icon",               url: "/safari-pinned-tab.svg", color: ACCENT_COLOR },
      { rel: "msapplication-TileImage", url: "/icon-192.png" },
    ],
  },
  manifest: "/manifest.json",
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFY ?? "",
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFY      ?? "",
  },
  other: {
    "msvalidate.01":                         process.env.NEXT_PUBLIC_BING_VERIFY ?? "",
    "referrer":                              "strict-origin-when-cross-origin",
    "theme-color":                           THEME_COLOR,
    "telegram:channel":                      DISCORD_URL,
    "apple-mobile-web-app-capable":          "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title":            APP_SHORT_NAME,
    "msapplication-TileColor":               THEME_COLOR,
    "msapplication-config":                  "/browserconfig.xml",
    "format-detection":                      "telephone=no",
    "X-Content-Type-Options":                "nosniff",
    "X-Frame-Options":                       "SAMEORIGIN",
    "X-XSS-Protection":                      "1; mode=block",
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
   Viewport
───────────────────────────────────────────────────────────────────────────── */
export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  colorScheme:  "dark",
  themeColor: [
    { media: "(prefers-color-scheme: dark)",  color: THEME_COLOR },
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR },
  ],
};

/* ─────────────────────────────────────────────────────────────────────────────
   Root Layout

   Clerk v7 rule: ClerkProvider goes in layout (Server Component).
   UI components (SignedIn, SignedOut, SignInButton, SignUpButton,
   UserButton, RedirectToSignIn) must ONLY be used inside
   "use client" components — never imported or re-exported here.

   Nesting order:
   <html>
     <body>
       <ClerkProvider>
         <AccountModalProvider>
           {children}
         </AccountModalProvider>
       </ClerkProvider>
       <Analytics />
       <SpeedInsights />
     </body>
   </html>
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
        {/* JSON-LD Structured Data */}
        {jsonLdSchemas.map((schema, index) => (
          <script
            key={index}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}

        {/* Preconnect to critical third-party origins */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.roblox.com" />
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" />
        <link rel="preconnect" href="https://img.clerk.com" />
        <link rel="preconnect" href="https://clerk.nexusai.gg" />

        {/* DNS prefetch */}
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        <link rel="dns-prefetch" href="https://challenges.cloudflare.com" />
        <link rel="dns-prefetch" href="https://va.vercel-scripts.com" />

        {/* Windows tile */}
        <meta name="msapplication-config"    content="/browserconfig.xml" />
        <meta name="msapplication-TileColor" content={THEME_COLOR} />
        <meta name="msapplication-TileImage" content="/icon-192.png" />

        {/* Safari pinned tab */}
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color={ACCENT_COLOR} />

        {/* Canonical */}
        <link rel="canonical" href={BASE_URL} />
      </head>

      <body suppressHydrationWarning>
        <ClerkProvider
          appearance={clerkAppearance}
          signInUrl="/login"
          signUpUrl="/login"
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
          dynamic
        >
          <AccountModalProvider>
            {children}
          </AccountModalProvider>
        </ClerkProvider>

        {/* Vercel Analytics — intentionally outside ClerkProvider (no auth needed) */}
        <Analytics />
        <SpeedInsights debug={process.env.NODE_ENV === "development"} />
      </body>
    </html>
  );
}