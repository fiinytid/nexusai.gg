import type { Metadata } from "next";
import "./globals.css"; //
// 1. TAMBAHKAN DUA IMPORT INI DI ATAS
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "NEXUS AI - Roblox Dev Intelligence", //
  description: "The most advanced AI assistant for Roblox developers. Inject scripts directly into Roblox Studio.", //
  icons: { icon: "/favicon.ico" }, //
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode; //
}>) {
  return (
    <html lang="en">
      <body>
        {children} {/* */}
        
        {/* 2. TAMBAHKAN DUA KOMPONEN INI DI DALAM BODY */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}