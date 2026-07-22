"use client";

import { motion, type Variants } from "framer-motion";
import { LandingIcon, type LandingIconName } from "@/components/landing/icons";

/*
  The Roadmap. A phased march along the Ethereum chain, drawn as a vertical
  timeline with a gold spine and a node per phase. Each phase reveals on scroll
  with a gentle stagger. Hype in tone, professional in claim: statuses are
  intentions, not oaths. Reduced motion is honored via the page MotionConfig.
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
    title: "Foundation & build",
    body: "The realm's core: identity, non-custodial wallets, the Ravenry feed and the House system, forged and standing.",
    icon: "layers",
    status: "live",
  },
  {
    tag: "Phase II",
    title: "Social layer launch",
    body: "Whispers, Calls, Courts and the Herald @raven go wide. The social realm opens its gates to all who ride.",
    icon: "users",
    status: "live",
  },
  {
    tag: "Phase III",
    title: "Smart contracts & audit",
    body: "The $RSP contract is authored on Ethereum and handed to independent auditors. Nothing ships until the seal is clean.",
    icon: "shieldKey",
    status: "building",
  },
  {
    tag: "Phase IV",
    title: "Testnet & security",
    body: "A public testnet stress-tests claims, staking and rewards. Bug bounties open so the realm hardens in the open.",
    icon: "lock",
    status: "building",
  },
  {
    tag: "Phase V",
    title: "Presale",
    body: "Presale coming soon. Terms, caps and timing are announced plainly, in the open, when the gates are ready to open.",
    icon: "coin",
    status: "planned",
  },
  {
    tag: "Phase VI",
    title: "TGE & liquidity",
    body: "Token generation on Ethereum, followed at once by deep, locked liquidity so $RSP trades on solid ground.",
    icon: "spark",
    status: "planned",
  },
  {
    tag: "Phase VII",
    title: "P2E & staking",
    body: "Play-to-earn seasons and staking vaults go live. Real deeds convert to $RSP, and holders put their tokens to work.",
    icon: "crown",
    status: "planned",
  },
  {
    tag: "Phase VIII",
    title: "CEX & ecosystem growth",
    body: "Exchange listings, partner integrations and treasury-backed growth carry the realm far beyond its first walls.",
    icon: "signal",
    status: "planned",
  },
];

const statusStyle: Record<Status, { label: string; className: string }> = {
  live: {
    label: "Live",
    className: "border-gold/40 text-gold",
  },
  building: {
    label: "In progress",
    className: "border-ember/45 text-ember",
  },
  planned: {
    label: "Planned",
    className: "border-steel-line text-bone-faint",
  },
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

export function Roadmap() {
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
        style={{ background: "radial-gradient(circle, rgba(229,112,42,0.35), transparent 70%)" }}
      />

      <motion.div
        variants={rise}
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold"
      >
        <LandingIcon name="compass" className="h-4 w-4" />
        The Roadmap
      </motion.div>
      <motion.div variants={rise} className="mt-3 flex flex-wrap items-center gap-3">
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
        Eight phases from foundation to full ecosystem. These are intentions, not
        oaths, and we will say so plainly when they shift.
      </motion.p>

      <ol className="relative mt-8 flex flex-col gap-5">
        {/* Gold spine down the timeline */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[21px] top-4 bottom-4 w-px bg-gradient-to-b from-gold/60 via-gold/25 to-transparent"
        />
        {phases.map((p) => {
          const st = statusStyle[p.status];
          return (
            <motion.li
              key={p.tag}
              variants={rise}
              className="relative flex items-start gap-4"
            >
              <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-void">
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full opacity-40 blur-md"
                  style={{ background: "radial-gradient(circle, rgba(200,162,76,0.5), transparent 70%)" }}
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
              </div>
            </motion.li>
          );
        })}
      </ol>
    </motion.section>
  );
}
