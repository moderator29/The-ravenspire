"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";

/* Premium modal shell for the wallet action panels (Send, Receive, Backup).
   Portals to <body> so it escapes any card stacking context, locks background
   scroll, closes on Escape or backdrop click, and animates in. A dialog, not a
   card: this is where the user reviews sensitive, non-custodial actions. */
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
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = window.requestAnimationFrame(() => setShown(true));
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.cancelAnimationFrame(raf);
      setShown(false);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-obsidian/80 backdrop-blur-sm transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`glass relative z-10 flex max-h-[92vh] w-full max-w-md flex-col overflow-y-auto rounded-b-none rounded-t-[28px] p-5 transition-all duration-200 ease-out sm:rounded-[28px] sm:p-6 ${
          shown
            ? "translate-y-0 opacity-100 sm:scale-100"
            : "translate-y-6 opacity-0 sm:translate-y-0 sm:scale-95"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-panel-warm">
            <Icon name={icon} className="h-5 w-5 text-gold" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold leading-tight text-bone">
              {title}
            </h2>
            {caption ? (
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                {caption}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-glass inline-flex h-9 w-9 shrink-0 items-center justify-center p-0"
          >
            <Icon name="plus" className="h-4 w-4 rotate-45" />
          </button>
        </div>

        <div className="mt-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
