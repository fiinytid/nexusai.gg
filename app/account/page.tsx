import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AccountPageClient } from "./AccountPageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account Settings",
  description: "Manage your NEXUS AI profile, connected accounts, and security settings.",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  return <AccountPageClient />;
}