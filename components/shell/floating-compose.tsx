"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";

/* The gold action button, dual-role. A tap opens two actions: send a raven
   (compose) or summon @raven (the Herald). The main button rotates its plus
   into a close, X-style, and a backdrop dismisses. Uses the gold gradient
   directly (not .btn-gold, which forces position: relative and would break the
   fixed placement). Shown on Home so it does not float over every page. */
export function FloatingCompose() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname !== "/home") return null;

  return (
    <>
      {open && (
        <button
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 cursor-default bg-black/40 backdrop-blur-[2px]"
        />
      )}

      <div
        style={{ position: "fixed" }}
        className="bottom-20 right-4 z-40 flex flex-col items-end gap-3 lg:bottom-8 lg:right-8"
      >
        {open && (
          <>
            <Link
              href="/raven"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-full border border-gold/40 bg-panel-warm/95 py-2 pl-3.5 pr-2 text-sm font-medium text-bone shadow-xl backdrop-blur-xl transition active:scale-95"
            >
              Ask @raven
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-panel text-gold">
                <Icon name="raven" className="h-4 w-4" />
              </span>
            </Link>
            <Link
              href="/compose"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-full border border-gold/40 bg-panel-warm/95 py-2 pl-3.5 pr-2 text-sm font-medium text-bone shadow-xl backdrop-blur-xl transition active:scale-95"
            >
              Send a raven
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-panel text-gold">
                <Icon name="send" className="h-4 w-4" />
              </span>
            </Link>
          </>
        )}

        <button
          type="button"
          aria-label={open ? "Close actions" : "Open actions"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="gold-metal flex h-14 w-14 items-center justify-center rounded-full border border-gold-bright/60 text-obsidian shadow-[0_10px_30px_rgba(200,162,76,0.35)] transition active:scale-95"
        >
          <Icon
            name="plus"
            className={`h-6 w-6 transition-transform ${open ? "rotate-45" : ""}`}
          />
        </button>
      </div>
    </>
  );
}
