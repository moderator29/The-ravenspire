"use client";

import { motion, type Variants } from "framer-motion";
import { Card } from "@/components/ui/card";
import { LandingIcon } from "@/components/landing/icons";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import { ScrollRail } from "@/components/landing/scroll-rail";

/*
  The introduction. A crisp, professional statement of what The Ravenspire is,
  followed by Mission, Vision and History as an elegant horizontal rail. This
  sets the frame before any of the medieval feature surfaces appear, so the
  realm reads as a considered product, not a costume.
*/

const rise: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

type Pillar = {
  icon: Icon3DName;
  kicker: string;
  title: string;
  body: string;
};

const pillars: Pillar[] = [
  {
    icon: "accuracy",
    kicker: "Mission",
    title: "A home for the on-chain world, not just a terminal for it",
    body: "Serious portfolio, safety and market tools, real and non-custodial down to the last signature, sitting quietly beneath a social life people actually want to open every day. Crypto is the infrastructure here. It was never meant to be the whole point.",
  },
  {
    icon: "scrying",
    kicker: "Vision",
    title: "Standing that compounds instead of resetting",
    body: "Most platforms hand you a score that dies the day you close the tab. Renown is permanent, earned in the open against real outcomes, and cannot be bought, borrowed, or gamed from a browser. It is the one thing you build here that is still yours a year from now.",
  },
  {
    icon: "chronicle",
    kicker: "History",
    title: "Built against soulless dashboards and mercenary markets",
    body: "Two builders, tired of terminals with no memory and prediction markets that pay you and forget you existed the moment the position closes. We wanted a place where being right meant something the day after, not only the day of.",
  },
];

export function RealmIntro() {
  return (
    <motion.section
      id="overview"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      className="scroll-mt-28"
    >
      {/* Introduction */}
      <motion.div variants={rise} className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-sm border border-gold/20 bg-void/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
          <LandingIcon name="layers" className="h-4 w-4" />
          What is The Ravenspire
        </span>
        <h2 className="mt-5 font-display text-3xl font-semibold text-bone sm:text-4xl">
          A world you belong to,{" "}
          <span className="gold-text">not a feed you scroll</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-bone-mut sm:text-base">
          The Ravenspire is the competitive arena where crypto conviction earns
          a name that can&rsquo;t be bought. You post, you argue, you swear to a
          House, and you make Calls the realm scores against the token&rsquo;s
          own real difficulty, never a coin flip dressed up as one, while a
          full suite of portfolio, safety and market tools works underneath,
          reading only real on-chain data. A wallet is minted to you on
          sign-up and the keys are yours alone. We never hold your funds, and
          everything of worth here is earned, never bought.
        </p>
      </motion.div>

      {/* Mission / Vision / History rail */}
      <motion.div variants={rise} className="mt-10">
        <ScrollRail ariaLabel="Mission, vision and history">
          {pillars.map((p) => (
            <Card key={p.kicker} render={<article />} pad="none" interactive className="snap-start shrink-0 w-[82vw] max-w-[360px] p-6 sm:w-[360px]">
              <div className="flex items-center gap-3">
                <Icon3D name={p.icon} size="md" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
                  {p.kicker}
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-bone">
                {p.title}
              </h3>
              <p className="mt-2.5 text-[13px] leading-relaxed text-bone-mut">
                {p.body}
              </p>
            </Card>
          ))}
        </ScrollRail>
      </motion.div>
    </motion.section>
  );
}
