"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { motion, type Variants } from "framer-motion";
import { Icon } from "@/components/ui/icon";

/*
  How the realm works. Four plain steps from sign-in to claim, drawn as a
  numbered ladder with a gold spine. Reveals on scroll with a gentle stagger.
  No art needed; pure glass and gold so nothing can break.
*/

const steps = [
  {
    icon: "shield",
    title: "Enter the gates",
    body: "Sign in and a non-custodial wallet is minted to you in seconds. The keys are yours from the first moment, always exportable.",
  },
  {
    icon: "home",
    title: "Live in the realm",
    body: "Post, argue, swear to a House and find your people. No token is ever needed to belong.",
  },
  {
    icon: "orb",
    title: "Make your Calls",
    body: "Seal a public claim and let it settle against real data. Renown for reading it right, and a Season Rating that carries the risk.",
  },
  {
    icon: "medal",
    title: "Earn your standing",
    body: "Real deeds earn points on the server against verified events. Balances show as points, and they convert to $RSP at the token generation event.",
  },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

export function HowItWorks() {
  return (
    <Card render={<motion.section initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={container} />} pad="none" className="p-7 sm:p-9">
      <motion.div
        variants={rise}
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold"
      >
        <Icon name="compass" className="h-4 w-4" />
        How the realm works
      </motion.div>
      <motion.h2
        variants={rise}
        className="mt-3 font-display text-2xl font-semibold text-bone sm:text-3xl"
      >
        Four steps from gate to glory
      </motion.h2>
      <motion.p
        variants={rise}
        className="mt-3 max-w-prose text-[15px] leading-relaxed text-bone-mut"
      >
        Presale coming soon. No seat to buy, no shortcut. Everything of worth is
        earned in the open, and the road is short.
      </motion.p>

      <ol className="relative mt-8 flex flex-col gap-4">
        {/* Gold spine down the numbered rail */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[19px] top-3 bottom-3 w-px bg-gradient-to-b from-gold/50 via-gold/20 to-transparent"
        />
        {steps.map((s, i) => (
          <motion.li
            key={s.title}
            variants={rise}
            className="relative flex items-start gap-4"
          >
            <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-void">
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full opacity-40 blur-md"
                style={{ background: "radial-gradient(circle, rgba(217, 176, 64,0.5), transparent 70%)" }}
              />
              <span className="relative font-display text-sm font-semibold text-gold">
                {i + 1}
              </span>
            </span>
            <div className="min-w-0 pt-1">
              <p className="flex items-center gap-2 font-display text-base font-semibold text-bone">
                <Icon name={s.icon} className="h-4 w-4 text-gold" />
                {s.title}
              </p>
              <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-bone-mut">
                {s.body}
              </p>
            </div>
          </motion.li>
        ))}
      </ol>

      <motion.div variants={rise}>
        <Link
          href="/signin"
          className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-gold transition hover:text-gold-bright"
        >
          Start at the gate
          <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </motion.div>
    </Card>
  );
}
