"use client";

import Link from "next/link";
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

function isActive(pathname: string, href: string) {
  const base = href.split("?")[0];
  if (base === "/home") return pathname === "/home";
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const sub = subNavFor(pathname);

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
      <div className="mx-auto w-full max-w-lg px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {sub && sub.length > 0 && (
          <div className="scrollbar-none pointer-events-auto mb-2 flex gap-1.5 overflow-x-auto">
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
                className={`relative flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[--radius-md] px-2 text-[12px] font-semibold transition-colors duration-150 ${
                  active ? "text-gold-bright" : "text-bone-faint active:text-bone-mut"
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
                    className="relative truncate"
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
