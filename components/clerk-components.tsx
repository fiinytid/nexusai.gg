"use client";

export {
  // ─── Conditional rendering (replaces SignedIn / SignedOut) ───────────────
  Show,

  // ─── Buttons ─────────────────────────────────────────────────────────────
  SignInButton,
  SignUpButton,
  SignOutButton,

  // ─── Full UI components ───────────────────────────────────────────────────
  SignIn,
  SignUp,
  UserButton,
  UserProfile,
  OrganizationSwitcher,
  OrganizationProfile,
  CreateOrganization,

  // ─── Redirects ────────────────────────────────────────────────────────────
  RedirectToSignIn,
  RedirectToSignUp,
  RedirectToUserProfile,

  // ─── Loading states ───────────────────────────────────────────────────────
  ClerkLoading,
  ClerkLoaded,

  // ─── Hooks ───────────────────────────────────────────────────────────────
  useAuth,
  useUser,
  useClerk,
  useSession,
  useSessionList,
  useSignIn,
  useSignUp,
  useOrganization,
  useOrganizationList,
} from "@clerk/nextjs";