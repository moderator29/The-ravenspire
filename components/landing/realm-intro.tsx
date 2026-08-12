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
    title: "Make the on-chain world a place worth living in",
    body: "Give people a home where the social life comes first and the serious crypto tools sit quietly beneath it, honest, non-custodial, and genuinely fun to open every day.",
  },
  {
    icon: "scrying",
    kicker: "Vision",
    title: "A realm where reputation is the real currency",
    body: "A world of Houses, champions and Seasons where standing is earned in the open, never bought, and every wallet, Call and victory is proven against real data. Renown you earn is permanent and can never be taken back.",
  },
  {
    icon: "chronicle",
    kicker: "History",
    title: "Built by people tired of soulless dashboards",
    body: "The Ravenspire began as a rebellion against cold terminals and empty hype. We set out to wrap real portfolio, safety and market tools in a living story people actually enjoy.",
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
        <span className="inline-flex min-h-11 items-center gap-2 rounded-[--radius-sm] border border-gold/20 bg-void/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
          <LandingIcon name="layers" className="h-4 w-4" />
          What is The Ravenspire
        </span>
        <h2 className="mt-5 font-display text-3xl font-semibold text-bone sm:text-4xl">
          A premium social realm with{" "}
          <span className="gold-text">real crypto beneath it</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-bone-mut sm:text-base">
          The Ravenspire is a competitive realm where communities earn reputation
          through participation. You post, you argue, you swear to a House and
          you make Calls the realm keeps a record of, while a full suite of
          portfolio, safety and market tools works underneath, reading only real
          on-chain data. A wallet is minted to you on sign-up and the keys are
          yours alone. We never hold your funds, and everything of worth is
          earned, never bought.
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
