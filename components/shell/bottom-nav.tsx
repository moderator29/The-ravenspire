"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { bottomNav } from "@/lib/nav";

/* The dock.

   A floating, inset bar rather than an edge to edge strip, so the realm reads
   as an application rather than a website. Everything here is a clean rounded
   rectangle: no pills, no capsules, no half circles at the ends.

   The active destination expands to carry its label while the rest stay as
   icons, which keeps the bar compact while still naming where you are. The gold
   plate behind the active item is a single shared layout element, so it slides
   between destinations instead of cross fading.

   The contextual sub-strip that used to float above this bar is retired, on
   the founder's direction: every section now carries its own switcher at the
   top of its own column as plain text, so the boxed copy down here was two
   controls for one job, and the far one never fit (five chips needed 401px of
   a 366px dock). The strip renderer, its fade masks, its overflow measurement
   and its scroll-into-view logic are removed whole rather than left as dead
   machinery; lib/nav.ts carries the matching tombstone where subNav lived. */

const SPRING = { type: "spring" as const, visualDuration: 0.22, bounce: 0.14 };

/* The row is sized by `min-h-11` rather than by vertical padding.
 *
 * Padding sized it before and it came out short: about 39px from 10px of
 * padding either side of a 19px icon. This product holds itself to 44px on
 * touch, and this is the most tapped control in the whole realm. A minimum
 * height states the target directly instead of leaving it as the arithmetic
 * of a font size and a padding rung that anybody could later adjust without
 * realising what they were changing. */

function isActive(pathname: string, href: string) {
  const base = href.split("?")[0];
  if (base === "/home") return pathname === "/home";
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  const dockRef = useRef<HTMLDivElement | null>(null);

  /* The dock publishes its own height, because anything else floating above it
     has to clear it and nothing else can know how tall it is. It changes with
     the safe area inset, and the floating compose button used to sit at a
     fixed 80px and land on top of dock furniture. Measuring it here means
     that arithmetic exists once, in the element that owns it. */
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty(
        "--dock-height",
        `${Math.round(el.getBoundingClientRect().height)}px`
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--dock-height");
    };
  }, [pathname]);

  return (
    <div
      /* A scrim under the dock, fixing something visible rather than adding
         decoration: page content was live in the transparent wrapper around
         the floating bar, so a gold section heading could sit framed against
         its edges while the page scrolled behind it. The gradient fades
         content out into obsidian before it reaches the bar, so the dock
         reads as one anchored object. It stays `pointer-events-none`, so
         nothing under it becomes untappable, and it is a fill with no text. */
      className="pointer-events-none fixed inset-x-0 bottom-0 z-nav pt-8 lg:hidden bg-[image:linear-gradient(to_top,rgba(7,7,10,0.97)_0%,rgba(7,7,10,0.88)_52%,rgba(7,7,10,0)_100%)]"
    >
      <div
        ref={dockRef}
        className="mx-auto w-full max-w-lg px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <nav
          aria-label="Primary"
          className="pointer-events-auto flex items-stretch gap-1 rounded-2xl border border-steel-line/70 bg-obsidian/90 p-1.5 backdrop-blur-2xl"
          style={{ boxShadow: "var(--shadow-overlay)" }}
        >
          {bottomNav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                /* The active destination takes the room, the rest keep the
                   floor and no more.

                   Five equal columns at 390px is about 72px each, and the
                   active one has to fit a 19px icon, a gap and its label
                   inside that, so "The Ravenry" rendered as "Ra...". A dock
                   whose one labelled item is the item whose label is cut is
                   worse than a dock with no labels at all.

                   `flex-1` on the active item and a fixed 44px on the others
                   spends the width where the words are. Four inactive squares
                   and the gaps leave about 160px, and the longest label in the
                   set needs about 120. */
                className={`relative flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md text-[12px] font-semibold transition-colors duration-150 ${
                  active
                    ? "flex-1 px-3 text-gold-bright"
                    : "w-11 shrink-0 text-bone-faint active:text-bone-mut"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="dock-plate"
                    transition={SPRING}
                    className="absolute inset-0 rounded-md border border-gold/35 bg-gold/12"
                  />
                )}
                <Icon
                  name={item.icon}
                  className="relative h-[19px] w-[19px] shrink-0"
                />
                {active && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                    /* No `truncate` any more. It was the thing hiding the
                       defect: a label that does not fit should make the layout
                       wrong in a way somebody notices, not quietly become an
                       ellipsis. `whitespace-nowrap` keeps it on one line, and
                       the width above is what makes it fit. */
                    className="relative whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
