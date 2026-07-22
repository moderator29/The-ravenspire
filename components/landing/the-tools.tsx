"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { LandingIcon, type LandingIconName } from "@/components/landing/icons";
import { ScrollRail } from "@/components/landing/scroll-rail";

/*
  The Tools. The five serious surfaces under the play, drawn from lib/nav
  (toolsNav + the Vault from accountNav). Presented as a horizontal rail so
  the serious side reads as a slick product shelf, not a long list.
*/

type Tool = {
  icon: LandingIconName;
  name: string;
  plain: string;
  href: string;
  desc: string;
};

const tools: Tool[] = [
  {
    icon: "ledger",
    name: "The Ledger",
    plain: "Portfolio",
    href: "/ledger",
    desc: "Net worth and profit across chains, read from real on-chain data only, never a fabricated figure.",
  },
  {
    icon: "shield",
    name: "The Watch",
    plain: "Safety",
    href: "/watch",
    desc: "Scans any token for rugs, hidden mints and honeypots before you ever touch it.",
  },
  {
    icon: "eye",
    name: "The Scrying Glass",
    plain: "Smart money",
    href: "/scrying",
    desc: "See what the great wallets are watching, live from the markets as it moves.",
  },
  {
    icon: "wallet",
    name: "The Vault",
    plain: "Wallet",
    href: "/vault",
    desc: "Your non-custodial wallet, created on sign-up and truly yours. Export the keys any time.",
  },
  {
    icon: "flame",
    name: "The Forge",
    plain: "Staking",
    href: "/forge",
    desc: "Swear an oath and earn real yield from protocol fees, never from empty emissions.",
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
        Five instruments sit quietly under the play, each reading real data and
        signed by you alone. Swipe through the shelf.
      </motion.p>

      <motion.div variants={rise} className="mt-7">
        <ScrollRail ariaLabel="The tools">
          {tools.map((t) => (
            <Link
              key={t.name}
              href={t.href}
              className="group glass glass-hover snap-start shrink-0 flex w-[76vw] max-w-[300px] flex-col p-5 sm:w-[280px]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gold/25 bg-void text-gold">
                <LandingIcon name={t.icon} className="h-5 w-5" />
              </span>
              <p className="mt-4 font-display text-base font-semibold text-bone">
                {t.name}
                <span className="ml-2 text-[10px] uppercase tracking-wider text-bone-faint">
                  {t.plain}
                </span>
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-bone-mut">{t.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-gold transition group-hover:text-gold-bright">
                Open
                <LandingIcon name="arrowRight" className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </ScrollRail>
      </motion.div>
    </motion.section>
  );
}
