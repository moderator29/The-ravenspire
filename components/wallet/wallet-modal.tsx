"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { AdaptiveDialog } from "@/components/ui/sheet";

/* The shell for the wallet action panels (Send, Receive, Backup, Manage).

   This was a hand rolled createPortal overlay: no focus trap, no focus
   restore, no `role="dialog"` on the popup itself, and a body scroll lock it
   managed by hand. It is now the AdaptiveDialog primitive, which is a bottom
   sheet under 768px and a centred modal above it, and which brings all four
   for free. The signature is unchanged so the seven call sites in
   wallet-live.tsx did not have to move. */
export function WalletModal({
  open,
  onClose,
  title,
  caption,
  icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  caption?: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        <span className="flex items-center gap-2">
          <Icon name={icon} aria-hidden className="h-4 w-4 shrink-0 text-gold" />
          {title}
        </span>
      }
      description={
        caption ? (
          <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
            {caption}
          </span>
        ) : undefined
      }
    >
      {children}
    </AdaptiveDialog>
  );
}
