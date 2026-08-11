"use client";

import { useEffect, useState } from "react";
import {
  chronicle,
  STATUS_LABEL,
  type ChronicleStatus,
} from "@/lib/data/chronicle";
import { BackButton } from "@/components/shell/back-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";

/* The Chronicle: the Document archetype (design system section 2).

   A Document is a reading column and nothing else: 680px, secondary body text,
   generous leading, a sticky table of contents at lg. It was previously a
   stack of glass cards at max-w-3xl, which is the Stream archetype wearing
   long-form prose, and it read as a settings page rather than something anyone
   would read end to end.

   Ledger register throughout. One accent per section heading, which is the
   status badge, and no ornament at all. A page about what is true should not
   glow. */

const STATUS_VARIANT: Record<ChronicleStatus, "gold" | "beta" | "default"> = {
  /* Live is the realm's one success colour, which is gold. */
  live: "gold",
  /* Ember, so a work in progress never reads as an achievement. */
  "in-development": "beta",
  planned: "default",
};

/* Highlight the section currently under the reader in the contents. Plain
   IntersectionObserver against the section headings: no scroll listener, so
   nothing runs on the main thread while the page is moving. */
function useActiveSection(slugs: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          seen.set(entry.target.id, entry.isIntersecting);
        }
        const first = slugs.find((slug) => seen.get(slug));
        if (first) setActive(first);
      },
      /* Bias the band toward the top of the viewport so the contents track the
         heading being read, not the one three screens down. */
      { rootMargin: "-10% 0px -70% 0px", threshold: 0 }
    );

    for (const slug of slugs) {
      const el = document.getElementById(slug);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [slugs]);

  return active;
}

const SLUGS = chronicle.map((s) => s.slug);

function StatusBadge({ status }: { status: ChronicleStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

export default function ChroniclePage() {
  const active = useActiveSection(SLUGS);

  return (
    <div className="mx-auto w-full max-w-[60rem] px-3 py-4 sm:px-4 sm:py-6">
      <BackButton />

      <div className="mt-3 flex flex-col lg:flex-row lg:items-start lg:gap-6">
        {/* Contents. Sticky from lg up, and absent below it: a phone gets the
            reading column and nothing in front of it.

            Deliberately narrow. The shell already spends 272px on the side nav
            and, from xl, another 320px on the right rail, so a wide contents
            rail would take the reading column well under its 680px cap on
            every mid-size desktop. */}
        <nav
          aria-label="Chronicle contents"
          className="hidden shrink-0 lg:sticky lg:top-6 lg:block lg:w-44"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
            Contents
          </p>
          <ol className="mt-3 flex flex-col gap-1.5">
            {chronicle.map((s, i) => (
              <li key={s.slug}>
                <a
                  href={`#${s.slug}`}
                  aria-current={active === s.slug ? "location" : undefined}
                  className={cx(
                    "flex items-baseline gap-2 rounded-sm py-0.5 text-sm transition-colors duration-150",
                    active === s.slug
                      ? "text-gold"
                      : "text-bone-mut hover:text-bone"
                  )}
                >
                  <span className="tnum text-xs text-bone-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* The reading column. 680px, and never wider. */}
        <article className="min-w-0 max-w-[680px] flex-1">
          <header>
            <h1 className="font-display text-2xl font-semibold text-bone sm:text-3xl">
              The Chronicle
            </h1>
            <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
              How the realm works
            </p>
            <p className="mt-4 text-[15px] leading-7 text-bone-mut">
              Everything here is true of the realm as it stands. Each section
              carries its stage, so nothing half-built is described as
              finished.
            </p>
          </header>

          <div className="mt-10 flex flex-col gap-12">
            {chronicle.map((s) => (
              <section key={s.slug} id={s.slug} className="scroll-mt-6">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-display text-xl font-semibold text-bone">
                    {s.title}
                  </h2>
                  <StatusBadge status={s.status} />
                </div>
                <p className="mt-1.5 text-sm text-bone-faint">{s.plain}</p>

                <div className="mt-5 flex flex-col gap-5">
                  {s.body.map((p, i) => (
                    <p key={i} className="text-[15px] leading-7 text-bone-mut">
                      {p}
                    </p>
                  ))}
                </div>

                {s.notes?.length ? (
                  <div className="mt-6 flex flex-col gap-3">
                    {s.notes.map((n, i) => (
                      <Card key={i} variant="inset" pad="sm">
                        <StatusBadge status={n.status} />
                        <p className="mt-2 text-sm leading-6 text-bone-mut">
                          {n.text}
                        </p>
                      </Card>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          <footer className="mt-14 border-t border-steel-line pt-5 pb-4">
            <p className="text-xs uppercase tracking-[0.26em] text-bone-faint">
              Non-custodial, always. Standing earned, never bought.
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
