"use client";

import { motion, type Variants } from "framer-motion";
import { LandingIcon, type LandingIconName } from "@/components/landing/icons";

/*
  Two forward-looking teasers built to stoke presale hype. Each is clearly
  marked Coming soon, on-brand with the realm, and purely aspirational: no
  fabricated numbers, no promises of return.
*/

type Teaser = {
  eyebrow: string;
  title: string;
  body: string;
  icon: LandingIconName;
  points: string[];
};

/* Both teasers must name a chapter that actually exists in comingSoonNav.

   They previously did not. One was billed as "The Oracle", which is the name
   of a live tool (the account scanner at /scanner), attached to a prediction
   market that is really called Prophecies. The other described the Mint as a
   creator monetization vault with subscriptions and gated courts, a feature
   that appears nowhere in the roadmap, the navigation or the codebase. Both
   now match their entry in lib/nav.ts. */
const teasers: Teaser[] = [
  {
    eyebrow: "Prophecies",
    title: "Prediction markets for the realm",
    body: "Call the market. Win the realm. Take a position on the questions that matter, from token moves to House standings, and let resolution settle in the open where anyone can check it.",
    icon: "eye",
    points: [
      "Transparent, checkable resolution",
      "Built on the Calls engine already running",
      "Call the market, win the realm",
    ],
  },
  {
    eyebrow: "The Mint",
    title: "Trading across every chain",
    body: "Trade any token across chains, shielded from MEV, and gasless. The Swap already trades non-custodially on a single chain today; the Mint is what it becomes when the routing crosses chains.",
    icon: "coin",
    points: ["Any token, any chain", "Shielded from MEV", "Gasless, and still non-custodial"],
  },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

export function ComingSoonTeasers() {
  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={container}
      className="scroll-mt-28"
    >
      <motion.div
        variants={rise}
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold"
      >
        <LandingIcon name="spark" className="h-4 w-4" />
        On the horizon
      </motion.div>
      <motion.h2
        variants={rise}
        className="mt-3 font-display text-2xl font-semibold text-bone sm:text-3xl"
      >
        Two chapters on the horizon
      </motion.h2>
      <motion.p
        variants={rise}
        className="mt-3 max-w-prose text-[15px] leading-relaxed text-bone-mut"
      >
        The realm keeps building. Neither is built yet. Both are chapters on the
        map, shown here so you can see where the realm is going rather than
        discover it later.
      </motion.p>

      <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2">
        {teasers.map((t) => (
          <motion.article
            key={t.eyebrow}
            variants={rise}
            className="glass glass-hover relative overflow-hidden p-6 sm:p-7"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-25 blur-3xl"
              style={{ background: "radial-gradient(circle, rgba(200,162,76,0.4), transparent 70%)" }}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gold/30 bg-void">
                <LandingIcon name={t.icon} className="h-5 w-5 text-gold" />
              </span>
              <span className="inline-flex items-center rounded-[--radius-sm] border border-gold/30 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-gold/80">
                Coming soon
              </span>
            </div>

            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.24em] text-bone-faint">
              {t.eyebrow}
            </p>
            <h3 className="mt-1.5 font-display text-lg font-semibold text-bone">
              {t.title}
            </h3>
            <p className="mt-2.5 text-[13px] leading-relaxed text-bone-mut">
              {t.body}
            </p>

            <ul className="mt-4 flex flex-col gap-2">
              {t.points.map((pt) => (
                <li key={pt} className="flex items-center gap-2 text-[12px] text-bone-mut">
                  <LandingIcon name="check" className="h-3.5 w-3.5 shrink-0 text-gold" />
                  {pt}
                </li>
              ))}
            </ul>
          </motion.article>
        ))}
      </div>
    </motion.section>
  );
}
