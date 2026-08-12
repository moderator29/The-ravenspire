"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/* The gold action button, dual role. A tap opens two actions: send a raven
   (compose) or summon @raven (the Herald). A backdrop dismisses.

   Both speed dial items used to be capsules: `rounded-full` carrying
   `pl-3.5 pr-2`. The house rule checker walked past both because it only
   recognised horizontal padding written as the `px-` shorthand, which is now
   fixed in scripts/check-house-rules.mjs. They are rounded rectangles off the
   radius scale, like every other control in the realm.

   The trigger keeps its circle. Rule 9 allows a genuinely circular icon
   button, and a floating action button is the case that rule was written for:
   it has no label, it is not part of a row, and a rounded rectangle floating
   over the feed would read as a stray tile rather than an affordance. */
export function FloatingCompose() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname !== "/home") return null;

  return (
    <>
      {open && (
        <button
          type="button"
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
            <Button
              variant="glass"
              size="lg"
              className="border-gold/40 bg-panel-warm/95 shadow-xl"
              render={<Link href="/raven" />}
              onClick={() => setOpen(false)}
            >
              Ask @raven
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-[--radius-sm] border border-gold/40 bg-panel text-gold"
              >
                <Icon name="raven" className="h-4 w-4" />
              </span>
            </Button>
            <Button
              variant="glass"
              size="lg"
              className="border-gold/40 bg-panel-warm/95 shadow-xl"
              render={<Link href="/compose" />}
              onClick={() => setOpen(false)}
            >
              Send a raven
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-[--radius-sm] border border-gold/40 bg-panel text-gold"
              >
                <Icon name="send" className="h-4 w-4" />
              </span>
            </Button>
          </>
        )}

        <button
          type="button"
          aria-label={open ? "Close actions" : "Open actions"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="gold-metal flex h-14 w-14 items-center justify-center rounded-full border border-gold-bright/60 text-obsidian shadow-[0_10px_30px_rgba(217,176,64,0.35)] transition-transform duration-fast active:scale-95"
        >
          <Icon
            name="plus"
            className={`h-6 w-6 transition-transform duration-fast ${open ? "rotate-45" : ""}`}
          />
        </button>
      </div>
    </>
  );
}
