"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { bottomNav, subNavFor } from "@/lib/nav";

/* The dock.

   A floating, inset bar rather than an edge to edge strip, so the realm reads
   as an application rather than a website. Everything here is a clean rounded
   rectangle: no pills, no capsules, no half circles at the ends.

   The active destination expands to carry its label while the rest stay as
   icons, which keeps the bar compact while still naming where you are. The gold
   plate behind the active item is a single shared layout element, so it slides
   between destinations instead of cross fading.

   Above the dock sits a contextual strip of sub destinations for the current
   section. That is what lets the whole product carry depth in one predictable
   place instead of re-inventing a tab row at the top of every page. */

const SPRING = { type: "spring" as const, visualDuration: 0.22, bounce: 0.14 };

/* Both rows are sized by `min-h-11` rather than by vertical padding.
 *
 * Padding sized them before and both came out short: the dock's items ran to
 * about 39px (10px of padding either side of a 19px icon) and the sub strip's
 * chips to about 28px. This product already holds itself to 44px on touch, the
 * standard the top bar was rebuilt to, and these are the two most tapped
 * controls in the whole realm. A minimum height states the target directly
 * instead of leaving it as the arithmetic of a font size and a padding rung
 * that anybody could later adjust without realising what they were changing. */

/* The fade, as one of four fixed classes rather than a computed gradient, so
   Tailwind can see every one of them at build time. */
const MASKS = {
  none: "",
  end: "[mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)]",
  start: "[mask-image:linear-gradient(to_left,black_calc(100%-20px),transparent)]",
  both: "[mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-20px),transparent)]",
} as const;

function maskFor(more: { start: boolean; end: boolean }): string {
  if (more.start && more.end) return MASKS.both;
  if (more.start) return MASKS.start;
  if (more.end) return MASKS.end;
  return MASKS.none;
}

function isActive(pathname: string, href: string) {
  const base = href.split("?")[0];
  if (base === "/home") return pathname === "/home";
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const sub = subNavFor(pathname);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  /* Which edges the strip still has content behind. Both false means it fits,
     and no fade is drawn at all. */
  const [more, setMore] = useState({ start: false, end: false });

  /* The dock publishes its own height, because anything else floating above it
     has to clear it and nothing else can know how tall it is. It changes with
     the route, since the contextual strip is present on six of them and absent
     on the rest, and it changes with the safe area inset. The floating compose
     button used to sit at a fixed 80px and landed squarely on top of the right
     end of the strip, which is where the last chip lives. Measuring it here
     means that arithmetic exists once, in the element that owns it. */
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
  }, [pathname, sub]);

  /* The strip's own overflow, measured on the strip rather than on the page.

     A horizontal scroller never grows the document, so a document level
     overflow check reads zero on a strip whose last chip is cut in half at the
     screen edge. The only place the difference shows is scrollWidth against
     clientWidth on the scroller itself, which is what this asks. */
  useEffect(() => {
    const el = stripRef.current;
    if (!el) {
      setMore({ start: false, end: false });
      return;
    }
    const measure = () => {
      const slack = el.scrollWidth - el.clientWidth;
      /* A pixel of tolerance: sub pixel layout leaves fractional slack on
         strips that visibly fit, and a fade over nothing is a lie too. */
      if (slack <= 1) {
        setMore({ start: false, end: false });
        return;
      }
      setMore({
        start: el.scrollLeft > 1,
        end: el.scrollLeft < slack - 1,
      });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [pathname, sub]);

  /* A sub destination is current when every query param it declares matches.
     A bare href (no query) is current only when no competing param is set. */
  const subIsCurrent = (href: string) => {
    const [base, qs] = href.split("?");
    if (base !== pathname) return false;
    const declared = new URLSearchParams(qs ?? "");
    if ([...declared.keys()].length === 0) {
      const keys = ["tab", "view"];
      return keys.every((k) => !params.get(k));
    }
    return [...declared.entries()].every(([k, v]) => params.get(k) === v);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-nav lg:hidden">
      <div
        ref={dockRef}
        className="mx-auto w-full max-w-lg px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {sub && sub.length > 0 && (
          /* The strip scrolls when a section has more sub destinations than a
             390px screen fits, and it used to end in a hard cut at the screen
             edge that read as a broken layout rather than as more to come. A
             20px fade is the standard signal, and it is drawn only on the edges
             that actually have something behind them: a strip that fits gets
             none, and scrolling to the end clears the trailing one rather than
             leaving the last chip permanently half faded. */
          <div
            ref={stripRef}
            className={`scrollbar-none pointer-events-auto mb-2 flex gap-1.5 overflow-x-auto ${maskFor(more)}`}
          >
            {sub.map((item) => {
              const current = subIsCurrent(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={`flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-[--radius-sm] border px-3.5 text-[12px] font-medium backdrop-blur-xl transition-colors duration-150 ${
                    current
                      ? "border-gold/40 bg-gold/15 text-gold-bright"
                      : "border-steel-line/70 bg-void/80 text-bone-mut active:text-bone"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}

        <nav
          aria-label="Primary"
          className="pointer-events-auto flex items-stretch gap-1 rounded-[--radius-2xl] border border-steel-line/70 bg-obsidian/90 p-1.5 backdrop-blur-2xl"
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
                className={`relative flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[--radius-md] text-[12px] font-semibold transition-colors duration-150 ${
                  active
                    ? "flex-1 px-3 text-gold-bright"
                    : "w-11 shrink-0 text-bone-faint active:text-bone-mut"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="dock-plate"
                    transition={SPRING}
                    className="absolute inset-0 rounded-[--radius-md] border border-gold/35 bg-gold/12"
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
