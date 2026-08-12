"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { motion, type Variants } from "framer-motion";
import { LandingIcon } from "@/components/landing/icons";
import { ScrollRail } from "@/components/landing/scroll-rail";
import { Icon3D } from "@/components/ui/icon-3d";
import { icon3dFor } from "@/lib/nav";

/*
  The Tools. The serious surfaces under the play, drawn from lib/nav
  (toolsNav + the Vault from accountNav). Presented as a horizontal rail so
  the serious side reads as a slick product shelf, not a long list.

  The rail listed five and omitted three that ship: the Swap, the Bloodline
  and the Oracle. It also sold the Forge as though a member could stake today,
  which they cannot: the hall is built, the on-chain contract is not, so it
  carries a soon flag rather than a promise.
*/

type Tool = {
  name: string;
  plain: string;
  href: string;
  desc: string;
  /* Set when the surface exists but the thing it promises is not yet live. */
  soon?: boolean;
};

const tools: Tool[] = [
  {
    name: "The Ledger",
    plain: "Portfolio",
    href: "/ledger",
    desc: "Net worth and profit across chains, read from real on-chain data only, never a fabricated figure.",
  },
  {
    name: "The Watch",
    plain: "Safety",
    href: "/watch",
    desc: "Scans any token for rugs, hidden mints and honeypots before you ever touch it.",
  },
  {
    name: "The Scrying Glass",
    plain: "Smart money",
    href: "/scrying",
    desc: "See what the great wallets are watching, live from the markets as it moves.",
  },
  {
    name: "The Vault",
    plain: "Wallet",
    href: "/vault",
    desc: "Your non-custodial wallet, created on sign-up and truly yours. Export the keys any time.",
  },
  {
    name: "The Swap",
    plain: "Trade",
    href: "/swap",
    desc: "Trade any supported coin for any other, routed for the best price and signed by your own wallet, never by us.",
  },
  {
    name: "The Bloodline",
    plain: "Wallet DNA",
    href: "/dna",
    desc: "Read the character of a wallet or an account: what it holds, how it moves, what it keeps doing.",
  },
  {
    name: "The Oracle",
    plain: "Account scan",
    href: "/scanner",
    desc: "An honest briefing on your own standing, ravens and wallet. Your data only, and nobody else's.",
  },
  {
    name: "The Forge",
    plain: "Staking",
    href: "/forge",
    desc: "The hall stands and the terms are on the page. Oaths open when the contract goes live, and the yield will be real protocol fees, never emissions.",
    soon: true,
  },
];

const rise: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export function TheTools() {
  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="scroll-mt-28"
    >
      <motion.div
        variants={rise}
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold"
      >
        <LandingIcon name="compass" className="h-4 w-4" />
        The Tools
      </motion.div>
      <motion.h2
        variants={rise}
        className="mt-3 font-display text-2xl font-semibold text-bone sm:text-3xl"
      >
        The realm is fun. The tools are serious.
      </motion.h2>
      <motion.p
        variants={rise}
        className="mt-3 max-w-prose text-[15px] leading-relaxed text-bone-mut"
      >
        Eight instruments sit quietly under the play, each reading real data and
        signed by you alone. Swipe through the shelf.
      </motion.p>

      <motion.div variants={rise} className="mt-7">
        <ScrollRail ariaLabel="The tools">
          {tools.map((t) => (
            <Card key={t.name} render={<Link href={t.href} />} pad="none" interactive className="group   snap-start shrink-0 flex w-[76vw] max-w-[300px] flex-col p-5 sm:w-[280px]">
              <Icon3D name={icon3dFor(t.href) ?? "workshop"} size="md" />
              <p className="mt-4 font-display text-base font-semibold text-bone">
                {t.name}
                <span className="ml-2 text-[10px] uppercase tracking-wider text-bone-faint">
                  {t.plain}
                </span>
                {t.soon ? (
                  <span className="ml-2 rounded-[--radius-sm] border border-ember/45 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-state-warning">
                    Soon
                  </span>
                ) : null}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-bone-mut">{t.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-gold transition group-hover:text-gold-bright">
                Open
                <LandingIcon name="arrowRight" className="h-3.5 w-3.5" />
              </span>
            </Card>
          ))}
        </ScrollRail>
      </motion.div>
    </motion.section>
  );
}
