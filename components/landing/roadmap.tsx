"use client";

import { useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { LandingIcon, type LandingIconName } from "@/components/landing/icons";

/*
  The Roadmap. A phased march along the Ethereum chain, drawn as a vertical
  timeline with a gold spine and a node per phase. Each phase carries a short
  body and a few concrete deliverables. The first phases show by default; the
  full long-term march (community, campaigns, listings, partnerships, the grand
  House contest and marketing) unfolds behind a "view the full march" button so
  the section previews cleanly and expands for those who want the whole story.
  Hype in tone, professional in claim: statuses are intentions, not oaths.
*/

type Status = "live" | "building" | "planned";

type Phase = {
  tag: string;
  title: string;
  body: string;
  points: string[];
  icon: LandingIconName;
  status: Status;
};

const phases: Phase[] = [
  {
    tag: "Phase I",
    title: "Foundation & build",
    body: "The realm's core, forged and standing.",
    points: [
      "Identity and non-custodial embedded wallets",
      "The Ravenry feed, profiles and Houses",
      "Points engine for real, earned actions",
    ],
    icon: "layers",
    status: "live",
  },
  {
    tag: "Phase II",
    title: "Social layer launch",
    body: "The social realm opens its gates to all who ride.",
    points: [
      "Whispers, Calls and Courts go wide",
      "The Herald @raven with real-data reads",
      "Claim the Throne and The War playable",
    ],
    icon: "users",
    status: "live",
  },
  {
    tag: "Phase III",
    title: "Smart contracts & audit",
    body: "The $RSP contract is authored and independently sealed.",
    points: [
      "$RSP token authored on Ethereum (10B supply)",
      "Independent audit before anything ships",
      "Points-to-$RSP conversion design finalized",
    ],
    icon: "shieldKey",
    status: "building",
  },
  {
    tag: "Phase IV",
    title: "Testnet & security",
    body: "The realm hardens in the open.",
    points: [
      "Public testnet for claims, staking and rewards",
      "Bug bounties and community stress tests",
      "Wallet export and key-safety drills",
    ],
    icon: "lock",
    status: "building",
  },
  {
    tag: "Phase V",
    title: "Community onboarding & campaigns",
    body: "The gates widen and the ranks swell.",
    points: [
      "Referral quests and welcome campaigns",
      "House recruitment drives and creator invites",
      "Seasonal quests that reward showing up",
    ],
    icon: "users",
    status: "planned",
  },
  {
    tag: "Phase VI",
    title: "Presale",
    body: "Presale coming soon, announced plainly and in the open.",
    points: [
      "Terms, caps and timing shared openly",
      "Non-custodial from the first transaction",
      "No seats sold that must be earned",
    ],
    icon: "coin",
    status: "planned",
  },
  {
    tag: "Phase VII",
    title: "TGE & liquidity",
    body: "Token generation, then deep, locked liquidity.",
    points: [
      "$RSP generation event on Ethereum",
      "Deep liquidity locked at launch",
      "First points-to-$RSP season claim",
    ],
    icon: "spark",
    status: "planned",
  },
  {
    tag: "Phase VIII",
    title: "Marketing & partnerships",
    body: "The realm's name carried far beyond its walls.",
    points: [
      "Coordinated marketing pushes and creator deals",
      "Protocol and ecosystem partnerships",
      "Cross-community collaborations and events",
    ],
    icon: "signal",
    status: "planned",
  },
  {
    tag: "Phase IX",
    title: "Play-to-earn & staking",
    body: "Real deeds convert to $RSP; holders put tokens to work.",
    points: [
      "Play-to-earn seasons across the games",
      "Staking vaults for $RSP holders",
      "The grand House contest for the Throne",
    ],
    icon: "crown",
    status: "planned",
  },
  {
    tag: "Phase X",
    title: "CEX listings & ecosystem growth",
    body: "The realm marches far beyond its first walls.",
    points: [
      "Centralized exchange listings",
      "Treasury-backed ecosystem growth",
      "New surfaces, tools and long-night chapters",
    ],
    icon: "spark",
    status: "planned",
  },
];

const PREVIEW = 4;

const statusStyle: Record<Status, { label: string; className: string }> = {
  live: { label: "Live", className: "border-gold/40 text-gold" },
  building: { label: "In progress", className: "border-ember/45 text-ember" },
  planned: { label: "Planned", className: "border-steel-line text-bone-faint" },
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

function PhaseNode({ p }: { p: Phase }) {
  const st = statusStyle[p.status];
  return (
    <li className="relative flex items-start gap-4">
      <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-void">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full opacity-40 blur-md"
          style={{
            background:
              "radial-gradient(circle, rgba(200,162,76,0.5), transparent 70%)",
          }}
        />
        <LandingIcon name={p.icon} className="relative h-5 w-5 text-gold" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bone-faint">
            {p.tag}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${st.className}`}
          >
            {st.label}
          </span>
        </div>
        <p className="mt-1 font-display text-base font-semibold text-bone">
          {p.title}
        </p>
        <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-bone-mut">
          {p.body}
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {p.points.map((pt) => (
            <li
              key={pt}
              className="flex items-start gap-2 text-[12px] leading-relaxed text-bone-faint"
            >
              <LandingIcon
                name="check"
                className="mt-0.5 h-3 w-3 shrink-0 text-gold/70"
              />
              {pt}
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function Roadmap() {
  const [expanded, setExpanded] = useState(false);
  const preview = phases.slice(0, PREVIEW);
  const rest = phases.slice(PREVIEW);

  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={container}
      className="glass relative overflow-hidden p-7 sm:p-9"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full opacity-20 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(229,112,42,0.35), transparent 70%)",
        }}
      />

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
        <span className="glass-sm inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-panel px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-gold">
          <LandingIcon name="layers" className="h-3.5 w-3.5" />
          Built on Ethereum
        </span>
      </motion.div>
      <motion.p
        variants={rise}
        className="mt-3 max-w-prose text-[15px] leading-relaxed text-bone-mut"
      >
        Ten phases from foundation to a full ecosystem: build, social launch,
        contracts and audit, community campaigns, presale, TGE, marketing and
        partnerships, play-to-earn and the grand House contest, and exchange
        listings. These are intentions, not oaths, and we will say so plainly
        when they shift.
      </motion.p>

      <motion.ol variants={rise} className="relative mt-8 flex flex-col gap-5">
        {/* Gold spine down the timeline */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[21px] top-4 bottom-4 w-px bg-gradient-to-b from-gold/60 via-gold/25 to-transparent"
        />
        {preview.map((p) => (
          <PhaseNode key={p.tag} p={p} />
        ))}

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="rest"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex flex-col gap-5 overflow-hidden"
            >
              {rest.map((p) => (
                <PhaseNode key={p.tag} p={p} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.ol>

      {rest.length > 0 && (
        <motion.button
          variants={rise}
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="btn-glass mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm text-gold"
        >
          {expanded ? "Show less" : `View the full march (${rest.length} more)`}
          <LandingIcon
            name="chevronDown"
            className={`h-4 w-4 transition-transform duration-300 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </motion.button>
      )}
    </motion.section>
  );
}
