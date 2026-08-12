"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { motion, type Variants } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { Icon3D } from "@/components/ui/icon-3d";

/*
  The contests. Two cinematic teasers, both drawn from divs, a gradient and a
  warm radial, so neither depends on art and neither can ship someone's concept
  deck by accident. Calls carries gold, The War carries ember.

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
    <Card render={<motion.section id="games" initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={container} />} pad="none" className="scroll-mt-28 p-7 sm:p-9">
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

      {/* `rounded-xl`, not `rounded-3xl`. The radius scale runs 8, 12, 16, 20,
          26 and Tailwind's own `3xl` is 24, which is on none of them. The two
          contest cards were the only surfaces on the landing page at a radius
          the system does not name, and next to a page of 20px cards the
          difference reads as a mistake rather than as a choice. The checker
          cannot see this one: it reads arbitrary values like `rounded-[24px]`
          and a named Tailwind rung slips past it. */}
      <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Calls */}
        <motion.div
          variants={rise}
          className="group relative overflow-hidden rounded-xl border border-steel-line bg-panel"
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-panel-warm via-void to-void" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full opacity-40 blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(217, 176, 64,0.35), transparent 70%)" }}
          />
          <div className="relative p-6">
            <div className="flex items-center gap-2">
              <Icon3D name="call-orb" size="md" />
              <span className="rounded-sm border border-gold/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-gold">
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
              className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold transition hover:text-gold-bright"
            >
              See the Calls running now
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>

        {/* The War */}
        <motion.div
          variants={rise}
          className="group relative overflow-hidden rounded-xl border border-steel-line bg-panel"
        >
          {/* The backdrop was `public/game/battlefield.png`, and it is not a
              battlefield. It is a page out of a concept deck: the words
              "4. BATTLE INTERFACE - REAL TIME COMBAT" are baked into the top
              left, and around all four edges sit a fake HUD, a fake timer
              reading 02:47, fake health bars and a fake progress rail reading
              GLORY 7,880 / 10,000. At thirty percent behind the card, every
              one of those ghosted through the copy, so the landing page shipped
              a design document's page number and a set of invented numbers as
              its art. The chrome runs along every edge, so no crop saves it.

              The Calls card beside it never needed a photograph: it builds its
              atmosphere out of a gradient and one warm radial. The War gets the
              same materials in ember, which also makes the two contests read as
              the matched pair the section says they are. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-panel-warm via-void to-void" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full opacity-40 blur-2xl transition-opacity duration-slow group-hover:opacity-60"
            style={{ background: "radial-gradient(circle, rgba(229,112,42,0.38), transparent 70%)" }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-16 -right-8 h-56 w-56 rounded-full opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(198,64,47,0.32), transparent 70%)" }}
          />
          <div className="relative p-6">
            <div className="flex items-center gap-2">
              <Icon3D name="crossed-axes" size="md" />
              <span className="rounded-sm border border-ember/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-ember">
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
              className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold transition hover:text-gold-bright"
            >
              March to The War
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </div>
    </Card>
  );
}
