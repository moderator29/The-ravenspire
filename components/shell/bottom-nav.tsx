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

   Every destination carries its name now, stacked under its glyph rather than
   beside it. The earlier version only labelled the active item, expanding it
   sideways to make room, and that math was fragile by construction: five
   equal columns at 390px leaves about 72px each, tight enough that "The
   Ravenry" once rendered as "Ra...". Stacking the label under the icon spends
   height instead of width for it, which this bar has to spare and a phone's
   screen does not, so all five can be named at once without any column
   fighting its neighbours for room. The gold plate behind the active column
   is a single shared layout element, so it slides between destinations
   instead of cross fading.

   The glass reads a shade richer than the rest of the product's chrome on
   purpose: the dock floats over live content rather than sitting in the flow
   of a page, so it is the one place a slightly stronger blur and a warm inner
   sheen (the same soft gold-into-void gradient the `glass` Button variant
   uses) earn their keep, while everything else about it stays the same
   restrained rounded rectangle the rest of the realm uses.

   THE ONE THING HERE THAT IS NOT A GENERIC BOTTOM BAR. The active glyph draws
   in the house's own forged-gold gradient (Icon's `gradient` prop, the same
   bright-to-deep recipe as `.gold-metal` and every crest in the realm)
   instead of a flat highlight colour. A stacked icon-over-name bottom bar is
   a shape half the apps in this category use; a gold GRADIENT mark, never a
   flat fill, is the one rule 13 states as non-negotiable brand identity, so
   spending it here is what makes this dock read as The Ravenspire's rather
   than anyone's. Nowhere else does an icon draw this way: it is reserved for
   the single "you are here" moment, not a colour a caller reaches for.

   The contextual sub-strip that used to float above this bar is retired, on
   the founder's direction: every section now carries its own switcher at the
   top of its own column as plain text, so the boxed copy down here was two
   controls for one job, and the far one never fit (five chips needed 401px of
   a 366px dock). The strip renderer, its fade masks, its overflow measurement
   and its scroll-into-view logic are removed whole rather than left as dead
   machinery; lib/nav.ts carries the matching tombstone where subNav lived. */

const SPRING = { type: "spring" as const, visualDuration: 0.22, bounce: 0.14 };

/* The column is sized by `min-h-11` rather than by vertical padding.
 *
 * Padding sized it before and it came out short: about 39px from 10px of
 * padding either side of a 19px icon. This product holds itself to 44px on
 * touch, and this is the most tapped control in the whole realm. A minimum
 * height states the target directly instead of leaving it as the arithmetic
 * of a font size and a padding rung that anybody could later adjust without
 * realising what they were changing. Stacking a label under the icon grows
 * a column past 44px anyway; the floor is stated so nothing below it ever
 * regresses under a future edit. */

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
          className="pointer-events-auto relative flex items-stretch gap-1 overflow-hidden rounded-2xl border border-gold/20 bg-obsidian/85 p-1.5 backdrop-blur-2xl"
          style={{ boxShadow: "var(--shadow-overlay)" }}
        >
          {/* The one sheen: a soft warm gradient laid over the glass, the same
              recipe the `glass` Button variant uses, so the dock reads as the
              same material as the rest of the product's glass surfaces rather
              than a one-off. Absolutely positioned and non-interactive, under
              every column's own content and its active plate. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[image:linear-gradient(180deg,rgba(255,233,163,0.05),transparent_60%)]"
          />
          {bottomNav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                /* Equal columns, always. Every destination stacks its icon
                   over its name now, so there is no active item to spend
                   extra width on and no inactive one to shrink to a bare
                   square: all five are the same shape, one flex-1 apart. */
                className={`relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[10px] font-semibold tracking-wide transition-colors duration-150 ${
                  active
                    ? "text-gold-bright"
                    : "text-bone-faint active:text-bone-mut"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="dock-plate"
                    transition={SPRING}
                    /* A gradient wash rather than a flat tint, the same
                       bright-fading-down read as .gold-metal: brighter along
                       the top edge, easing toward the plate's own floor,
                       which is what keeps a translucent fill from reading as
                       one flat sticker the way a single opacity value does. */
                    className="absolute inset-0.5 rounded-lg border border-gold/35 bg-[image:linear-gradient(180deg,rgba(217,176,64,0.18),rgba(217,176,64,0.05))]"
                  />
                )}
                <Icon
                  name={item.icon}
                  strokeWidth={active ? 2.1 : 1.75}
                  gradient={active}
                  className="relative h-[21px] w-[21px] shrink-0"
                />
                <span className="relative whitespace-nowrap">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
