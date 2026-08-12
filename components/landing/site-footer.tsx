"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { RavenMark } from "@/components/brand/raven-mark";

/*
  Landing footer. Legal routes (/legal/privacy, /legal/terms) are owned by a
  sibling agent; we link them here with Next Link. Socials kept alongside.
*/

const realmLinks = [
  { href: "/home", label: "The Ravenry" },
  { href: "/houses", label: "Houses" },
  { href: "/calls", label: "Calls" },
  { href: "/war", label: "The War" },
  { href: "/renown", label: "Crests & Renown" },
];

const toolLinks = [
  { href: "/raven", label: "Ask @raven" },
  { href: "/ledger", label: "The Ledger" },
  { href: "/watch", label: "The Watch" },
  { href: "/vault", label: "The Vault" },
  { href: "/chronicle", label: "The Chronicle" },
];

const legalLinks = [
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/terms", label: "Terms of Service" },
];

const socials = [
  { href: "https://x.com/ravenspire", label: "X", icon: "xlogo" },
  { href: "/rookery", label: "Live", icon: "signal" },
];

export function SiteFooter() {
  return (
    <Card render={<motion.footer initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6 }} />} pad="none" className="mt-6 p-8 sm:p-10">
      {/* The brand column is wider than a link column, because it holds the
          wordmark and the link columns hold single words.

          On an even four track grid it did not fit. Measured at 1440: a 200px
          track holding 228px of content, so "THE RAVENSPIRE" ran 28px into the
          next column and butted straight against "THE REALM" with no gap at
          all. The previous fix here swapped a wrap for an overlap by adding
          `whitespace-nowrap` without giving the name anywhere to go. A
          wordmark is a single object; the track has to be sized for it. */}
      <div className="grid grid-cols-2 gap-8 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 sm:col-span-1">
          {/* The brand name broke across two lines here, in a 158px column of a
              four column grid. The header and the hero both hold it on one
              line; only the footer did not, which is the one place nobody
              scrolls to while designing.

              `whitespace-nowrap` on the name and `min-w-0` on the row, so the
              name keeps its line and the row shrinks around it rather than
              forcing the grid wider. A wordmark is a single object, not a
              sentence. */}
          <div className="flex min-w-0 items-center gap-2.5">
            <RavenMark className="h-9 w-9 shrink-0" />
            <span className="gold-text whitespace-nowrap font-display text-lg font-semibold tracking-[0.1em]">
              THE RAVENSPIRE
            </span>
          </div>
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-bone-mut">
            Make the call. Earn your name. Rule your realm. Non-custodial by
            design, your keys always exportable.
          </p>
          <div className="mt-4 flex items-center gap-2">
            {socials.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                aria-label={s.label}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-steel-line bg-panel text-bone-mut transition hover:border-gold/40 hover:text-gold"
              >
                <Icon name={s.icon} className="h-4 w-4" />
              </Link>
            ))}
          </div>
        </div>

        <FooterCol title="The Realm" links={realmLinks} />
        <FooterCol title="The Tools" links={toolLinks} />
        <FooterCol title="Legal" links={legalLinks} />
      </div>

      <div className="mt-8 flex flex-col items-center gap-2 border-t border-steel-line/60 pt-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="text-xs text-bone-faint">
          The Ravenspire. The realm remembers. Reputation is earned, never bought.
        </p>
        <p className="text-xs text-bone-faint">
          &copy; {new Date().getFullYear()} The Ravenspire
        </p>
      </div>
    </Card>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
        {title}
      </p>
            {/* No gap between rows. Each link is its own 44px target, so the rows
          already sit apart by their own height, and a gap on top of that
          stretches a four link column past a phone screen for no gain. */}
      <ul className="mt-1 flex flex-col">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex min-h-11 items-center text-xs text-bone-mut transition hover:text-bone"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
