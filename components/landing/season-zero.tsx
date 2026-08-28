"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LandingIcon } from "@/components/landing/icons";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import {
  SEASON_ZERO,
  seasonZeroPhase,
  type SeasonZeroPhase,
} from "@/lib/season-zero";

/*
  Season Zero: the founding round, run inside the realm itself.

  Every number here is imported from lib/season-zero.ts, the single source of
  truth every Season Zero surface reads, so the landing can never disagree
  with the round page or the docs. No raised total appears here on purpose:
  the live, chain-verified figure belongs to /season-zero, and a marketing
  section repeating it would be a second number that could drift.

  This is an earned Forge moment on the landing's own visual language: the
  kicker row, the display headline, the Card chassis and the whileInView
  reveal all match the sections around it.
*/

const dayFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});
const dayYearFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const OPENS = dayFmt.format(new Date(SEASON_ZERO.startsAt));
const CLOSES = dayFmt.format(new Date(SEASON_ZERO.endsAt));
const CLOSES_FULL = dayYearFmt.format(new Date(SEASON_ZERO.endsAt));

const stats = [
  { label: "Softcap", value: `${SEASON_ZERO.softcapEth} ETH` },
  { label: "Hardcap", value: `${SEASON_ZERO.hardcapEth} ETH` },
  { label: "Of total supply", value: `${SEASON_ZERO.supplyPct}%` },
  {
    label: "Per 1 ETH",
    value: `${SEASON_ZERO.rspPerEth.toLocaleString("en-US")} $RSP`,
  },
];

const steps = [
  {
    title: "Create your account",
    body: "Sign in and a non-custodial wallet is minted to you. The keys are yours from the first moment.",
  },
  {
    title: "Read the terms",
    body: "The round's terms live in the Terms of Service, stated plainly: fixed rate, softcap refund, delivery at the token generation event.",
  },
  {
    title: "Send ETH from your own wallet",
    body: "Wallet to wallet, on Base or Ethereum mainnet, straight to the realm treasury. The platform never holds the funds.",
  },
  {
    title: "Your allocation is recorded on chain",
    body: "The server verifies your transaction on chain and records your exact $RSP allocation at the fixed rate.",
  },
];

const phaseNote: Record<SeasonZeroPhase, string> = {
  upcoming: `Opens ${OPENS}`,
  live: `Live now, closes ${CLOSES}`,
  ended: "Season Zero has closed",
};

const rise: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

export function SeasonZero() {
  const { authenticated } = useRealmAuth();
  const ctaHref = authenticated
    ? "/season-zero"
    : "/signin?next=/season-zero";

  /* The phase depends on the clock, and this page is prerendered. Resolving
     it after mount keeps the server markup and the client markup identical,
     so a build cut before September 1 cannot hydrate against a later date. */
  const [phase, setPhase] = useState<SeasonZeroPhase | null>(null);
  useEffect(() => {
    setPhase(seasonZeroPhase());
  }, []);

  return (
    <Card
      render={
        <motion.section
          id="season-zero"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
        />
      }
      radius="xl"
      pad="none"
      className="relative scroll-mt-28 overflow-hidden p-7 sm:p-9"
    >
      {/* Warm candlelight, restrained: this is a founding moment, not a fair. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(217, 176, 64,0.45), transparent 70%)",
        }}
      />

      <motion.div
        variants={rise}
        className="flex flex-wrap items-center gap-3"
      >
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
          <LandingIcon name="flame" className="h-4 w-4" />
          Season Zero
        </span>
        {phase && (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-gold/30 bg-panel px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gold">
            {phaseNote[phase]}
          </span>
        )}
      </motion.div>

      <motion.h2
        variants={rise}
        className="gold-text mt-3 font-display text-2xl font-semibold sm:text-3xl"
      >
        The founding round of the realm
      </motion.h2>

      <motion.p
        variants={rise}
        className="mt-3 max-w-prose text-[15px] leading-relaxed text-bone-mut"
      >
        From {OPENS} to {CLOSES_FULL} (UTC), the realm opens its founding
        round inside its own walls. {SEASON_ZERO.supplyPct} percent of the
        total supply, {SEASON_ZERO.rspAllocation.toLocaleString("en-US")}{" "}
        $RSP, offered at a fixed rate, wallet to wallet. Contributions go
        straight from your own wallet to the realm treasury on Base or
        Ethereum mainnet, and if the softcap is not reached, every
        contribution is returned to its sending wallet. Tokens are delivered
        at the token generation event.
      </motion.p>

      {/* The numbers, plainly */}
      <motion.div
        variants={rise}
        className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-gold/20 bg-panel px-4 py-3"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
              {s.label}
            </p>
            <p className="tnum mt-1 font-display text-base font-semibold text-bone sm:text-lg">
              {s.value}
            </p>
          </div>
        ))}
      </motion.div>

      {/* Four plain steps */}
      <motion.ol variants={rise} className="mt-7 grid gap-4 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3.5">
            <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-void">
              <span className="font-display text-sm font-semibold text-gold">
                {i + 1}
              </span>
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="font-display text-sm font-semibold text-bone">
                {s.title}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-bone-mut">
                {s.body}
              </p>
            </div>
          </li>
        ))}
      </motion.ol>

      {/* One honest risk line, then the door */}
      <motion.p
        variants={rise}
        className="mt-6 max-w-prose text-[12px] leading-relaxed text-bone-faint"
      >
        Crypto carries real risk, including the total loss of everything you
        put in. Nothing here is financial advice, and no token value is
        promised or implied. Bring only what you can afford to lose.
      </motion.p>

      <motion.div
        variants={rise}
        className="mt-6 flex flex-wrap items-center gap-4"
      >
        <Button variant="gold" size="lg" render={<Link href={ctaHref} />}>
          Enter Season Zero
          <LandingIcon name="arrowRight" className="h-4 w-4" />
        </Button>
        <Link
          href="/legal/terms#season-zero"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-bone-mut transition hover:text-bone"
        >
          Read the terms
          <LandingIcon name="arrowUpRight" className="h-4 w-4" />
        </Link>
      </motion.div>
    </Card>
  );
}
