"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { Icon } from "@/components/ui/icon";

/*
  The contests. Two cinematic teasers. The War uses public/game/battlefield.png
  as a backdrop (verified present); Calls is drawn from divs and a gold motif
  so it needs no art.

  This card used to be Claim the Throne, billed as a live Season game. It is
  not one: it holds no navigation slot, /throne is a coming soon teaser, and
  its mechanics (quests, duels, streaks) are dissolving into the Ravenry and
  the House halls rather than returning as a destination. Calls take the slot,
  which also fixes the stranger omission: the stated flagship of the product
  appeared nowhere on the landing page at all.

  The section id stays "games" because the landing nav anchors to it.
*/

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const callFeatures = [
  { icon: "target", text: "Difficulty read from the token's own volatility" },
  { icon: "orb", text: "Frozen when you seal, so the bar cannot move" },
  { icon: "medal", text: "Renown never falls. Season Rating carries the risk" },
];

const warFeatures = [
  { icon: "user", text: "Sixty two champions, from rare blades to mythic" },
  { icon: "flame", text: "A legendary arsenal of arms and gear" },
  { icon: "banner", text: "Every victory feeds your House's Glory" },
];

function Feature({ icon, text }: { icon: string; text: string }) {
  return (
    <li className="flex items-center gap-2.5 text-[13px] text-bone-mut">
      <Icon name={icon} className="h-4 w-4 shrink-0 text-gold" />
      {text}
    </li>
  );
}

export function TheGames() {
  return (
    <motion.section
      id="games"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={container}
      className="glass scroll-mt-28 p-7 sm:p-9"
    >
      <motion.div
        variants={rise}
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold"
      >
        <Icon name="crown" className="h-4 w-4" />
        The contests
      </motion.div>
      <motion.h2
        variants={rise}
        className="mt-3 font-display text-2xl font-semibold text-bone sm:text-3xl"
      >
        Two contests. One realm at stake.
      </motion.h2>

      <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Calls */}
        <motion.div
          variants={rise}
          className="group relative overflow-hidden rounded-3xl border border-steel-line bg-panel"
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-panel-warm via-void to-void" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full opacity-40 blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(200,162,76,0.35), transparent 70%)" }}
          />
          <div className="relative p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/40 bg-void text-gold">
                <Icon name="orb" className="h-5 w-5" />
              </span>
              <span className="rounded-[--radius-sm] border border-gold/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-gold">
                The flagship
              </span>
            </div>
            <h3 className="mt-4 font-display text-xl font-semibold text-bone">
              Calls
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-bone-mut">
              A public, timestamped claim with your name on it. The realm reads
              the token's own volatility to work out how hard your Call actually
              is, and freezes that difficulty the moment you seal, so an easy
              Call and a hard one can never score the same.
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {callFeatures.map((f) => (
                <Feature key={f.text} icon={f.icon} text={f.text} />
              ))}
            </ul>
            <Link
              href="/calls"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold transition hover:text-gold-bright"
            >
              See the Calls running now
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>

        {/* The War */}
        <motion.div
          variants={rise}
          className="group relative overflow-hidden rounded-3xl border border-steel-line bg-panel"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/game/battlefield.png"
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-30 transition duration-700 group-hover:scale-105 group-hover:opacity-40"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void via-void/85 to-void/40" />
          <div className="relative p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-ember/40 bg-void text-ember">
                <Icon name="swords" className="h-5 w-5" />
              </span>
              <span className="rounded-[--radius-sm] border border-ember/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-ember">
                Battle RPG
              </span>
            </div>
            <h3 className="mt-4 font-display text-xl font-semibold text-bone">
              The War
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-bone-mut">
              Take the field in a real-time battle for the realm. Muster your
              champions, arm them from the Arsenal, and lead the charge yourself
              across sprawling battlefields.
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {warFeatures.map((f) => (
                <Feature key={f.text} icon={f.icon} text={f.text} />
              ))}
            </ul>
            <Link
              href="/war"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold transition hover:text-gold-bright"
            >
              March to The War
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}
