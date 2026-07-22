"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  animate,
  type Variants,
} from "framer-motion";
import { Icon } from "@/components/ui/icon";

/*
  The realm in numbers. A compact feature strip that counts up once when it
  scrolls into view. Values mirror what the rest of the page states (sixty
  champions, six Houses, ten crests, five tools, two games) so nothing drifts.
  Reduced-motion users get the final numbers with no animation.
*/

type Stat = {
  icon: string;
  value: number;
  suffix?: string;
  display?: string;
  label: string;
};

const stats: Stat[] = [
  { icon: "user", value: 60, label: "Champions to muster" },
  { icon: "banner", value: 6, label: "Houses to swear to" },
  { icon: "medal", value: 10, label: "Crests to earn" },
  { icon: "sliders", value: 5, label: "Serious tools" },
  { icon: "crown", value: 2, label: "Games at launch" },
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
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={container}
      className="glass relative overflow-hidden p-7 sm:p-9"
    >
      {/* Soft gold aura, gently pulsing behind the numbers */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[36rem] max-w-full -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(200,162,76,0.35), transparent 70%)" }}
        animate={{ opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
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
    </motion.section>
  );
}
