import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXUS AI — Roblox Dev Intelligence",
  description: "The most advanced AI assistant for Roblox developers. Inject scripts directly into Roblox Studio.",
  icons: { icon: "/nexusai.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}