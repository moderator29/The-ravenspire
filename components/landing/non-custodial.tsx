"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { motion, type Variants } from "framer-motion";
import { LandingIcon } from "@/components/landing/icons";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import { ScrollRail } from "@/components/landing/scroll-rail";

/*
  The non-custodial promise, as a horizontal rail of vows. Privy mints an
  embedded wallet on sign-up; the platform never holds keys or funds. Each
  point is a slim card so the section stays short and scans fast.
*/

const rise: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

type Vow = {
  icon: Icon3DName;
  title: string;
  body: string;
};

const vows: Vow[] = [
  {
    icon: "vault",
    title: "Your keys, always",
    body: "A wallet is minted to you the moment you enter. The keys are yours from the first second and exportable any time.",
  },
  {
    icon: "guard",
    title: "We never hold funds",
    body: "The platform takes no custody. We cannot move, freeze or spend what is in your vault, and every action is signed by you.",
  },
  {
    icon: "trophy",
    title: "Earned, never bought",
    body: "No pay to win, no bought standing. Renown and crests come from showing up and being good, in the open.",
  },
  {
    icon: "scales",
    title: "Real data only",
    body: "Every figure is read from the chain or the markets. If a number is not in front of us, we say so rather than invent it.",
  },
];

export function NonCustodial() {
  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
      className="scroll-mt-28"
    >
      <motion.div variants={rise} className="max-w-2xl">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
          <LandingIcon name="shield" className="h-4 w-4" />
          Non-custodial by design
        </span>
        <h2 className="mt-3 font-display text-2xl font-semibold text-bone sm:text-3xl">
          Your keys. Your vault. Your realm.
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-bone-mut">
          The Ravenspire is built on Privy embedded wallets. The platform never
          holds your keys, so the realm is yours to leave with at any moment.
        </p>
      </motion.div>

      <motion.div variants={rise} className="mt-7">
        <ScrollRail ariaLabel="Non-custodial promises">
          {vows.map((v) => (
            <Card key={v.title} render={<article />} pad="none" className="snap-start shrink-0 w-[72vw] max-w-[300px] p-5 sm:w-[280px]">
              <Icon3D name={v.icon} size="md" />
              <h3 className="mt-4 font-display text-base font-semibold text-bone">
                {v.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-bone-mut">
                {v.body}
              </p>
            </Card>
          ))}
        </ScrollRail>
      </motion.div>

      <motion.div variants={rise}>
        <Link
          href="/vault"
          className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold transition hover:text-gold-bright"
        >
          Open your Vault
          <LandingIcon name="arrowRight" className="h-4 w-4" />
        </Link>
      </motion.div>
    </motion.section>
  );
}
