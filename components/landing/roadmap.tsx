"use client";

import { Card } from "@/components/ui/card";
import { motion, type Variants } from "framer-motion";
import { LandingIcon, type LandingIconName } from "@/components/landing/icons";
import { SEASON_ZERO } from "@/lib/season-zero";

/*
  The Roadmap. Six consolidated phases, not the ten-phase march with a preview
  and a "view the full march" toggle this used to be. That version put three
  bullet points under every one of ten phases, hidden six of them behind a
  button, and still described the same chapters this page names elsewhere
  (Set One, the Mercer, Season Zero). Short means short: one line each here,
  the founder's own direction, and no fold to expand because there is nothing
  left to hide behind one. Hype in tone, professional in claim: statuses are
  intentions, not oaths.
*/

type Status = "live" | "building" | "planned";

type Phase = {
  tag: string;
  title: string;
  body: string;
  icon: LandingIconName;
  status: Status;
};

const phases: Phase[] = [
  {
    tag: "Phase I",
    title: "Foundation & social launch",
    body: "Non-custodial wallets, the Ravenry feed, Houses, Calls and The War, all live.",
    icon: "layers",
    status: "live",
  },
  {
    tag: "Phase II",
    title: "Contracts, audit & testnet",
    body: "$RSP authored on Ethereum, independently audited, hardened on a public testnet.",
    icon: "shieldKey",
    status: "building",
  },
  {
    tag: "Phase III",
    title: "The Collection: cards, chests & merch",
    body: "The trading card game steps out of the War: Set One, Warchests, and the Mercer's real merchandise.",
    icon: "layers",
    status: "building",
  },
  {
    tag: "Phase IV",
    title: "Season Zero, the founding round",
    body: `${SEASON_ZERO.supplyPct}% of supply, non-custodial and wallet to wallet. Currently archived, not accepting contributions.`,
    icon: "coin",
    status: "building",
  },
  {
    tag: "Phase V",
    title: "TGE & liquidity",
    body: "$RSP generation event, deep liquidity locked at launch, first points-to-$RSP season claim.",
    icon: "spark",
    status: "planned",
  },
  {
    tag: "Phase VI",
    title: "Growth: play-to-earn, staking & listings",
    body: "Play-to-earn seasons, staking vaults, the grand House contest, and exchange listings.",
    icon: "crown",
    status: "planned",
  },
];

const statusStyle: Record<Status, { label: string; className: string }> = {
  live: { label: "Live", className: "border-gold/40 text-gold" },
  building: { label: "In progress", className: "border-ember/45 text-ember" },
  planned: { label: "Planned", className: "border-steel-line text-bone-faint" },
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

function PhaseNode({ p }: { p: Phase }) {
  const st = statusStyle[p.status];
  return (
    <motion.li variants={rise} className="relative flex items-start gap-3">
      <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-void">
        <LandingIcon name={p.icon} className="h-4 w-4 text-gold" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bone-faint">
            {p.tag}
          </span>
          <span
            className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${st.className}`}
          >
            {st.label}
          </span>
        </div>
        <p className="mt-1 font-display text-sm font-semibold text-bone">
          {p.title}
        </p>
        <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-bone-mut">
          {p.body}
        </p>
      </div>
    </motion.li>
  );
}

export function Roadmap() {
  return (
    <Card
      render={
        <motion.section
          id="roadmap"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={container}
        />
      }
      pad="none"
      className="relative scroll-mt-28 overflow-hidden p-7 sm:p-9"
    >
      <motion.div
        variants={rise}
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold"
      >
        <LandingIcon name="compass" className="h-4 w-4" />
        The Roadmap
      </motion.div>
      <motion.div
        variants={rise}
        className="mt-3 flex flex-wrap items-center gap-3"
      >
        <h2 className="font-display text-2xl font-semibold text-bone sm:text-3xl">
          The march ahead
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-gold/25 bg-panel px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-gold">
          <LandingIcon name="layers" className="h-3.5 w-3.5" />
          Built on Ethereum
        </span>
      </motion.div>
      <motion.p
        variants={rise}
        className="mt-3 max-w-prose text-[15px] leading-relaxed text-bone-mut"
      >
        Six phases from foundation to a full ecosystem. These are intentions,
        not oaths, and we will say so plainly when they shift.
      </motion.p>

      <motion.ol variants={rise} className="relative mt-7 flex flex-col gap-5">
        {/* Gold spine down the timeline */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[17px] top-4 bottom-4 w-px bg-gradient-to-b from-gold/60 via-gold/25 to-transparent"
        />
        {phases.map((p) => (
          <PhaseNode key={p.tag} p={p} />
        ))}
      </motion.ol>
    </Card>
  );
}
