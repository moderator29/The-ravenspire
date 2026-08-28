"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  motion,
  useInView,
  useReducedMotion,
  animate,
  type Variants,
} from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { champions } from "@/lib/game/champions";
import { houses } from "@/lib/data/houses";
import { crests } from "@/components/brand/crests";
import { TOOL_COUNT } from "@/components/landing/the-tools";

/*
  The realm in numbers. A compact feature strip that counts up once when it
  scrolls into view. Reduced-motion users get the final numbers with no
  animation.
*/

type Stat = {
  icon: string;
  value: number;
  suffix?: string;
  display?: string;
  label: string;
};

/* Every figure here is counted from its source, not typed. The typed version
   of this list opened at "62 champions" while the roster is the roster, which
   held true only until the next champion landed; the same strip once said
   "Games at launch: 2" by counting Claim the Throne, which is not a game you
   can play. Champions from lib/game/champions, Houses from lib/data/houses,
   crests from components/brand/crests, tools from the rail that draws them.
   The four ladders stay typed: the leaderboards METRICS list lives inside
   that route's own page module, and importing a page to count it would drag
   the whole Roll of Honour into the landing bundle for one integer. */
const stats: Stat[] = [
  { icon: "user", value: champions.length, label: "Champions to muster" },
  { icon: "banner", value: houses.length, label: "Houses to swear to" },
  { icon: "medal", value: crests.length, label: "Crests designed" },
  { icon: "sliders", value: TOOL_COUNT, label: "Serious tools" },
  { icon: "crown", value: 4, label: "Ladders on the Roll of Honour" },
  { icon: "shield", value: 100, suffix: "%", label: "Your keys, always" },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

function Counter({ value, suffix }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, value, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate: (v) => setN(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, reduce, value]);

  return (
    <span ref={ref} className="gold-text font-display text-3xl font-semibold sm:text-4xl">
      {n}
      {suffix}
    </span>
  );
}

export function StatsStrip() {
  return (
    <Card render={<motion.section initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={container} />} pad="none" className="relative overflow-hidden p-7 sm:p-9">
      {/* No aura. This strip carried a six second pulsing orb behind the
          numbers, permanent motion on a Ledger surface, which section 6 names
          outright: a card that pulses forever says "look at me" and becomes
          noise inside one session. The gold-gradient counters are the shine
          this section earned; the page's glow budget stays with the hero, the
          mark and the two game cards. */}
      <motion.div
        variants={rise}
        className="relative flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold"
      >
        <Icon name="signal" className="h-4 w-4" />
        The realm in numbers
      </motion.div>

      <div className="relative mt-7 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <motion.div
            key={s.label}
            variants={rise}
            className="flex flex-col items-center text-center"
          >
            <Icon name={s.icon} className="mb-2 h-5 w-5 text-gold/70" />
            <Counter value={s.value} suffix={s.suffix} />
            <p className="mt-1.5 text-[11px] leading-tight text-bone-mut">{s.label}</p>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}
