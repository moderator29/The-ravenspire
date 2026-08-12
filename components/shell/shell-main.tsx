"use client";

import { usePathname } from "next/navigation";
import { isFullBleed } from "@/lib/nav";

/* The shell's main region, which is one of two things depending on the route.
 *
 * For a page, it is a scrolling column with bottom padding that clears the
 * mobile dock. For a full bleed surface it is the whole viewport height with
 * no padding at all, because the surface manages its own scrolling and pins
 * its own furniture to the edges.
 *
 * This is a client component only because the shell layout is a server
 * component and cannot read the pathname. Everything it wraps stays exactly
 * as it was. */
export function ShellMain({ children }: { children: React.ReactNode }) {
  const full = isFullBleed(usePathname());

  return (
    <main
      className={
        full
          ? "min-w-0 flex-1 lg:h-screen"
          : /* The dock's own measurement, not a number that agrees with it on
               some routes. This was `pb-28`, a flat 112px, against a dock that
               publishes `--dock-height` precisely so this arithmetic exists in
               one place. Measured on the Crossroads at 390: the dock reported
               122px because that route carries the contextual strip, so the
               last 10px of the page sat under it permanently, and on the many
               routes with no strip the same 112px left about 36px of dead
               space below the content. Both directions wrong, from the same
               constant.

               The fallback matches the old value so nothing shifts before the
               effect runs, and `lg:pb-8` still wins on desktop, where the dock
               is display:none and measures zero. */
            "min-w-0 flex-1 pb-[calc(var(--dock-height,7rem)+1rem)] lg:pb-8"
      }
    >
      {children}
    </main>
  );
}

/* Chrome that steps aside on a full bleed route. Wrapping rather than editing
   each component keeps the rule in one place: the dock and the rail do not
   know about the Herald, they know about full bleed. */
export function ShellChrome({ children }: { children: React.ReactNode }) {
  return isFullBleed(usePathname()) ? null : <>{children}</>;
}
