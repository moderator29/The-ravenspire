"use client";

import Link from "next/link";
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
  { href: "/throne", label: "The Season" },
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
    <motion.footer
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6 }}
      className="glass mt-6 p-8 sm:p-10"
    >
      <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2.5">
            <RavenMark className="h-9 w-9" />
            <span className="gold-text font-display text-lg font-semibold tracking-[0.1em]">
              THE RAVENSPIRE
            </span>
          </div>
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-bone-mut">
            See every chain. Fear no rug. Rule your realm. Non-custodial by
            design, your keys always exportable.
          </p>
          <div className="mt-4 flex items-center gap-2">
            {socials.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                aria-label={s.label}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-steel-line bg-panel text-bone-mut transition hover:border-gold/40 hover:text-gold"
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
    </motion.footer>
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
      <ul className="mt-3 flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-xs text-bone-mut transition hover:text-bone"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
