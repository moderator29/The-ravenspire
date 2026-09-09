"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { LandingIcon } from "@/components/landing/icons";

/*
  The section the landing page did not have: why this, why now, and why a
  copycat cannot simply rebuild the parts that are visible. Every other
  section here shows what the realm does. This one is the only place that
  says, in as many words, why it exists at all and why the same idea has not
  already been done properly.

  Three beats, in order: the problem (what the category gets wrong), the
  insight (the one contrast that explains the fix), and why now (why this is
  buildable today and was not three years ago). The closing line is the
  thesis compressed to five words, and it is allowed to stand alone because
  everything above it has already earned the claim.
*/

const problems = [
  {
    h: "Points farms churn",
    b: "SocialFi pays members to show up. The farmers arrive for the emission and leave the day it slows. Rewards without an identity attached retain nobody, because there is nothing to lose by leaving.",
  },
  {
    h: "Prediction markets are mercenary",
    b: "Being right pays money and builds nothing else. Close the position and nothing about you accumulates: no history, no standing, no reason to come back tomorrow instead of the next app.",
  },
  {
    h: "Reputation is bought, botted, or fake",
    b: "Followers are for sale, engagement is farmed, and most leaderboards can be gamed from a browser tab. There is nowhere online a track record is both provable and permanent.",
  },
];

const currents = [
  {
    icon: "spark" as const,
    h: "Prediction is the category everyone is watching",
    b: "It proved crypto-native demand for a public, timestamped claim. What it never built is a reason to stay once the position closes.",
  },
  {
    icon: "wallet" as const,
    h: "Wallets went invisible",
    b: "Embedded, non-custodial wallets removed the seed-phrase wall this exact model needed to feel like a normal app rather than a chore.",
  },
  {
    icon: "badge" as const,
    h: "Ownership that means something",
    b: "Speculative drops died on their own terms. What survived is ownership tied to identity and play, not a jpeg with a floor price.",
  },
];

export function TheMoat() {
  return (
    <motion.section
      id="why"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6 }}
      className="scroll-mt-28"
    >
      <Card render={<article />} radius="xl" pad="none" className="p-7 sm:p-9">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
          <LandingIcon name="compass" className="h-4 w-4" />
          Why The Ravenspire
        </span>
        <h2 className="mt-3 max-w-2xl font-display text-2xl font-semibold text-bone sm:text-3xl">
          Every other realm sells you a score. This one lets you keep it.
        </h2>

        {/* The problem, three short rows rather than three paragraphs: the
            point is that the category has the same failure in three
            costumes, and naming it plainly says that faster than prose
            would. */}
        <div className="mt-8 flex flex-col gap-5 border-t border-steel-line pt-8 sm:gap-6">
          {problems.map((p) => (
            <div key={p.h} className="sm:flex sm:items-start sm:gap-5">
              <h3 className="font-display text-base font-semibold text-bone sm:w-64 sm:shrink-0">
                {p.h}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-bone-mut sm:mt-0">
                {p.b}
              </p>
            </div>
          ))}
        </div>

        {/* The insight, as a contrast rather than a claim. Two cards, same
            shape, opposite conclusion. This is the whole thesis and it is
            deliberately the loudest thing in the section. */}
        <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <Card
            variant="inset"
            radius="lg"
            pad="lg"
            className="flex flex-col gap-2"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
              A prediction market
            </p>
            <p className="font-display text-lg font-semibold text-steel">
              Gives you money for being right.
            </p>
            <p className="text-sm italic text-bone-faint">
              Position closed. Nothing remains.
            </p>
          </Card>
          <Card
            variant="warm"
            tone="gold"
            radius="lg"
            pad="lg"
            className="flex flex-col gap-2"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
              The Ravenspire
            </p>
            <p className="gold-text font-display text-lg font-semibold">
              Gives you a name.
            </p>
            <p className="text-sm leading-relaxed text-bone-mut">
              Renown never falls, is earned in public, and cannot be bought,
              transferred, or farmed. It is the retention primitive
              crypto&rsquo;s social layer skipped.
            </p>
          </Card>
        </div>
        <p className="mx-auto mt-6 max-w-xl text-center font-display text-base italic text-gold sm:text-lg">
          A reputation that can&rsquo;t be bought is the one thing you earn
          here that you cannot take to the next app, and the one reason to
          stay on this one.
        </p>

        {/* Why now, condensed to three currents. Not a claim that the
            category is about to explode, a plain statement of what changed
            underneath it. */}
        <div className="mt-10 grid grid-cols-1 gap-5 border-t border-steel-line pt-9 sm:grid-cols-3 sm:gap-6">
          {currents.map((c) => (
            <div key={c.h}>
              <LandingIcon name={c.icon} className="h-5 w-5 text-gold" />
              <h3 className="mt-3 font-display text-sm font-semibold text-bone">
                {c.h}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-bone-mut">
                {c.b}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-10 border-t border-steel-line pt-8 text-center font-display text-xl font-semibold text-bone sm:text-2xl">
          Features can be copied.{" "}
          <span className="gold-text">A world cannot.</span>
        </p>
      </Card>
    </motion.section>
  );
}
