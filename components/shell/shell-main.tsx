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
          : "min-w-0 flex-1 pb-28 lg:pb-8"
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
