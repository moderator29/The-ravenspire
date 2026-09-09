"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Icon3D } from "@/components/ui/icon-3d";
import { cx } from "@/components/ui/cx";
import { chronicleChapters } from "@/components/chronicles/nav";

/* The Chronicles' own sidebar, sticky at `lg` per the Document archetype
   (docs/DESIGN-SYSTEM.md section 2). Below `lg` it becomes a horizontal chip
   rail: many options, none exclusive of the others in the sense that a
   reader can be on exactly one, which is what the design law calls for a
   chip rail rather than a segmented control, since the set reads as a table
   of contents to scan, not a toggle between two states of the same page. */

function isActive(pathname: string, href: string): boolean {
  return href === "/chronicles" ? pathname === href : pathname.startsWith(href);
}

export function ChroniclesSidebar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="The Chronicles"
      className="sticky top-24 hidden max-h-[calc(100vh-7rem)] w-64 shrink-0 flex-col gap-1 overflow-y-auto pb-8 lg:flex"
    >
      {chronicleChapters.map((c) => {
        const active = isActive(pathname, c.href);
        return (
          <Link
            key={c.slug}
            href={c.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "group relative flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors duration-base",
              active ? "text-bone" : "text-bone-mut hover:text-bone"
            )}
          >
            {active && (
              <motion.span
                layoutId="chronicles-rail"
                className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-gold"
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <span
              className={cx(
                "mt-0.5 text-[10px] font-semibold tabular-nums",
                active ? "text-gold" : "text-bone-faint"
              )}
            >
              {c.kicker}
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[13.5px] font-semibold">
                {c.title}
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-bone-faint">
                {c.dek}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function ChroniclesMobileRail() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="The Chronicles"
      className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden"
    >
      {chronicleChapters.map((c) => {
        const active = isActive(pathname, c.href);
        return (
          <Link
            key={c.slug}
            href={c.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-[12.5px] font-medium transition-colors",
              active
                ? "border-gold/35 bg-gold/8 text-gold"
                : "border-steel-line text-bone-mut hover:text-bone"
            )}
          >
            <Icon3D name={c.icon} size="sm" />
            {c.title}
          </Link>
        );
      })}
    </nav>
  );
}
