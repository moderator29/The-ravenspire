"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";

/* A "..." overflow menu that opens as a portal overlay, fixed-positioned at the
   trigger button, exactly like X. Because it renders to document.body and never
   lives inside the card, opening it can never reflow, push, or clip the content
   around it: only the menu itself pops. Closes on outside click, scroll, resize
   or Escape. */
export function OverflowMenu({
  children,
  ariaLabel = "More",
  buttonClassName,
  iconClassName = "h-4 w-4",
  width = 176,
}: {
  /* Receives a `close` callback so each item can dismiss the menu. */
  children: (close: () => void) => ReactNode;
  ariaLabel?: string;
  buttonClassName?: string;
  iconClassName?: string;
  width?: number;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const close = useCallback(() => setOpen(false), []);

  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setPos({
      top: r.bottom + 6,
      right: Math.max(8, window.innerWidth - r.right),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          place();
          setOpen((v) => !v);
        }}
        className={
          buttonClassName ??
          "flex h-7 w-7 items-center justify-center rounded-full text-bone-faint transition hover:bg-panel hover:text-bone-mut"
        }
      >
        <Icon name="dots" className={iconClassName} />
      </button>

      {mounted &&
        open &&
        pos &&
        createPortal(
          <>
            <button
              aria-hidden
              tabIndex={-1}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                close();
              }}
              className="fixed inset-0 z-[90] cursor-default"
            />
            <div
              role="menu"
              style={{ position: "fixed", top: pos.top, right: pos.right, width }}
              className="glass glass-sm z-[91] p-1 shadow-2xl"
            >
              {children(close)}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
