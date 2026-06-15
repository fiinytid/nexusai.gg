import { auth } from "@clerk/nextjs/server";
import { UserProfile } from "@clerk/nextjs";
import { redirect } from "next/navigation";
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
    <div className="flex justify-center py-10">
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