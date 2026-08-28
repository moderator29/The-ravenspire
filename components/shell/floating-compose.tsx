"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  const fabRef = useRef<HTMLDivElement | null>(null);
  const active = pathname === "/home";

  /* Publishes how much room it needs, the same way the dock publishes its own
     height, and for the same reason: nothing else can know.
   *
   * The button is 56px square, anchored 12px above the dock, at `right-4`. On a
   * 390px screen that is a fixed 56x56 plate sitting at x 318, y 654, directly
   * over the right hand end of the feed column. Anything under it is untappable:
   * measured on the Ravenry, two Follow buttons in the who to follow card
   * resolved their own centre to this button, and a click on them timed out.
   *
   * Mid page that is survivable, because scrolling moves the content out from
   * under it. At the end of the page it is not, because there is nothing left
   * to scroll: a control in the last card stays under the button for good. So
   * the fix is clearance rather than moving the button, which would only choose
   * a different thing to cover.
   *
   * Measured rather than hardcoded, because the stack grows when the speed dial
   * opens and a constant would be wrong again the moment the button changes
   * size, which is exactly how `pb-28` came to be 10px short of the dock. */
  useEffect(() => {
    const el = fabRef.current;
    const root = document.documentElement;
    if (!active || !el) {
      root.style.removeProperty("--fab-clearance");
      return;
    }
    const publish = () => {
      /* The gap to the dock is part of the clearance: the button starts above
         the dock, so the page has to clear both. */
      const GAP = 12;
      root.style.setProperty(
        "--fab-clearance",
        `${Math.round(el.getBoundingClientRect().height) + GAP}px`
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--fab-clearance");
    };
  }, [active, open]);

  if (!active) return null;

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          /* z-nav, same rung as the button stack below and above the dock's
             own z-nav in source order, so opening the speed dial dims the dock
             under the scrim. At a raw 30 the scrim sat UNDER the dock (200):
             the one navigation surface a modal speed dial exists to eclipse
             stayed fully lit and fully clickable behind it. */
          className="fixed inset-0 z-nav cursor-default bg-black/40 backdrop-blur-[2px]"
        />
      )}

      {/* Clear of the dock, whatever the dock currently is.

          This sat at a flat 80px, which is taller than the bar alone and
          shorter than the bar plus its contextual strip, so on the one route
          this button renders on, the Ravenry, which does carry a strip, it
          landed on the right end of that strip and covered the last chip.
          The dock measures itself and publishes --dock-height; the fallback
          matches the bar without a strip, for the frame before it reports. */}
      <div
        ref={fabRef}
        style={{ position: "fixed" }}
        className="bottom-[calc(var(--dock-height,4.5rem)+0.75rem)] right-4 z-nav flex flex-col items-end gap-3 lg:bottom-8 lg:right-8"
      >
        {open && (
          <>
            <Button
              variant="glass"
              size="lg"
              tone="gold"
              opaque
              className="shadow-xl"
              render={<Link href="/raven" />}
              onClick={() => setOpen(false)}
            >
              Ask @raven
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-sm border border-gold/40 bg-panel text-gold"
              >
                <Icon name="raven" className="h-4 w-4" />
              </span>
            </Button>
            <Button
              variant="glass"
              size="lg"
              tone="gold"
              opaque
              className="shadow-xl"
              render={<Link href="/compose" />}
              onClick={() => setOpen(false)}
            >
              Send a raven
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-sm border border-gold/40 bg-panel text-gold"
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
