"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LandingIcon } from "@/components/landing/icons";

/*
  The Pump.fun launch. Replaces the old allocation-donut Tokenomics section:
  a Pump.fun coin has no vesting buckets to chart, it is sold to everyone on
  the same public bonding curve from the first block, so a pie of Liquidity,
  Team and Presale slices would describe a distribution this launch does not
  have. What a visitor actually needs here is smaller and sharper: the
  ticker, the real supply, and where to find the coin, presented as one
  clean, premium moment rather than a chart.

  THE CONTRACT ADDRESS IS DELIBERATELY EMPTY. Rule 4 is real data only: no
  invented address, no placeholder string of zeros that could be mistaken for
  a real one, no external link to a page that does not exist yet. The slot is
  built to be filled with one line the day it is real; until then it says so
  plainly, the same honest-empty-state posture as an unopened Warchest or the
  sealed Reliquary.
*/

const TICKER = "$RSP";
const SUPPLY_LABEL = "1,000,000,000";

const rise: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

export function PumpFunLaunch() {
  const reduce = useReducedMotion();

  return (
    <Card
      render={
        <motion.section
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
        />
      }
      pad="none"
      className="relative overflow-hidden p-7 sm:p-9"
    >
      {/* The one earned glow on this section: a slow gold pulse behind the
          ticker, the same restrained motif the hero mark uses above. Ambient
          motion is the rule's own exception (rule 14), so this loop is fine
          left running rather than gated to whileInView. */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/3 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(217,176,64,0.16), transparent 70%)" }}
        animate={reduce ? undefined : { opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        variants={rise}
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold"
      >
        <LandingIcon name="signal" className="h-4 w-4" />
        Live on Pump.fun
      </motion.div>
      <motion.h2
        variants={rise}
        className="mt-3 font-display text-2xl font-semibold text-bone sm:text-3xl"
      >
        Trade $RSP on Pump.fun
      </motion.h2>
      <motion.p
        variants={rise}
        className="mt-3 max-w-prose text-[15px] leading-relaxed text-bone-mut"
      >
        A fixed supply of {SUPPLY_LABEL} {TICKER}, public from the first
        block, no held-back allocation. The realm never takes custody of a
        single coin; every wallet holds its own.
      </motion.p>

      <motion.div
        variants={rise}
        className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {/* The ticker, given its own clean presentation, the strongest card
            of the three. */}
        <div className="rounded-lg flex flex-col items-center justify-center gap-1 border border-gold/25 bg-panel-warm/60 px-4 py-6 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-bone-faint">
            Ticker
          </span>
          <span className="gold-text font-display text-4xl font-semibold">
            {TICKER}
          </span>
        </div>

        <div className="rounded-lg flex items-center gap-3 border border-gold/20 bg-panel px-4 py-4">
          <LandingIcon name="coin" className="h-5 w-5 shrink-0 text-gold" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
              Total supply
            </p>
            <p className="tnum font-display text-lg font-semibold text-bone">
              {SUPPLY_LABEL}
            </p>
          </div>
        </div>

        {/* The empty slot. Honest, not decorative: this is the one field on
            the page with no real value yet, and it reads as exactly that. */}
        <div className="rounded-lg flex items-center gap-3 border border-dashed border-steel-line bg-panel/40 px-4 py-4">
          <LandingIcon name="key" className="h-5 w-5 shrink-0 text-bone-faint" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
              Contract address
            </p>
            <p className="font-mono text-[13px] text-bone-faint">
              Published at launch
            </p>
          </div>
        </div>
      </motion.div>

      {/* The one real path off this section. A card about where to trade
          $RSP with nothing to click was the actual gap here: everything
          above was correct and nothing was actionable. Same destination as
          the dashboard badge (components/dashboard/pump-fun-badge.tsx), a
          plain link to Pump.fun itself, since there is no coin page to link
          to before the contract address exists. */}
      <motion.div variants={rise} className="mt-6">
        <Button
          variant="gold"
          size="lg"
          render={<Link href="https://pump.fun" target="_blank" rel="noreferrer" />}
        >
          Trade on Pump.fun
          <LandingIcon name="arrowUpRight" className="h-4 w-4" />
        </Button>
      </motion.div>
    </Card>
  );
}
