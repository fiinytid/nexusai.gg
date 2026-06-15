import { auth } from "@clerk/nextjs/server";
import { UserProfile } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account Settings",
  description: "Manage your NEXUS AI profile, connected accounts, and security settings.",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  return (
    <div className="min-h-screen bg-[#020210] flex flex-col items-center py-10 px-4">
      {/* Back button */}
      <div className="w-full max-w-4xl mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition-colors font-mono"
        >
          ← Back to Dashboard
        </Link>
      </div>

      <UserProfile
        appearance={{
          elements: {
            rootBox: "w-full max-w-4xl",
            card: "shadow-none border border-border rounded-xl",
          },
        }}
      />
    </div>
  );
}