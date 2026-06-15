// useAccountModal.tsx
"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { AccountModal } from "./AccountModal";

/* ─────────────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────────────── */
interface AccountModalContextValue {
  openAccountModal: () => void;
  closeAccountModal: () => void;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Context (internal — do NOT export, use the hook instead)
───────────────────────────────────────────────────────────────────────────── */
const AccountModalContext = createContext<AccountModalContextValue | null>(null);

export function AccountModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openAccountModal  = useCallback(() => setOpen(true),  []);
  const closeAccountModal = useCallback(() => setOpen(false), []);

  return (
    <AccountModalContext.Provider value={{ openAccountModal, closeAccountModal }}>
      {children}
      <AccountModal open={open} onClose={closeAccountModal} />
    </AccountModalContext.Provider>
  );
}

export function useAccountModal() {
  const ctx = useContext(AccountModalContext);

  if (!ctx) {
    throw new Error(
      "useAccountModal must be used inside <AccountModalProvider>. " +
      "Wrap your layout.tsx or root component with <AccountModalProvider>."
    );
  }

  return ctx;
}