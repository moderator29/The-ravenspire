"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { LandingIcon } from "@/components/landing/icons";

/*
  Tokenomics. The $RSP allocation, rendered as a hand-built donut (inline SVG,
  no chart library) paired with an animated legend of bars. Palette is gold
  forward with two restrained ember accents and a single steel tone, never
  green. Respects prefers-reduced-motion: the draw-in becomes an instant paint.
*/

const TICKER = "$RSP";
const SUPPLY_LABEL = "10,000,000,000";
const SUPPLY_SHORT = "10B";

type Slice = {
  label: string;
  pct: number;
  color: string;
};

/* Order matters: slices are drawn clockwise from the top in this sequence. */
const slices: Slice[] = [
  { label: "Liquidity", pct: 25, color: "#f0d68c" },
  { label: "Presale", pct: 20, color: "#d8b45a" },
  { label: "Ecosystem & CEX Growth", pct: 18, color: "#c8a24c" },
  { label: "Staking & Farming", pct: 12, color: "#8a6a2c" },
  { label: "Team", pct: 10, color: "#e5702a" },
  { label: "P2E / Post2Earn & Rewards", pct: 10, color: "#c6402f" },
  { label: "Airdrop", pct: 5, color: "#6e7683" },
];

const R = 52;
const C = 2 * Math.PI * R;

const rise: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

function Donut() {
  const reduce = useReducedMotion();
  let acc = 0;

  return (
    <div className="relative mx-auto h-60 w-60 sm:h-72 sm:w-72">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        {/* Track */}
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="var(--steel-deep)"
          strokeWidth="13"
        />
        {slices.map((s, i) => {
          const len = (s.pct / 100) * C;
          const startDeg = (acc / 100) * 360;
          acc += s.pct;
          return (
            <motion.circle
              key={s.label}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="13"
              strokeLinecap="butt"
              strokeDasharray={`${len} ${C}`}
              transform={`rotate(${startDeg} 60 60)`}
              initial={{ strokeDashoffset: reduce ? 0 : len }}
              whileInView={{ strokeDashoffset: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.9, delay: reduce ? 0 : i * 0.12, ease: "easeOut" }}
            />
          );
        })}
      </svg>

      {/* Center readout */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-faint">
          Total supply
        </span>
        <span className="gold-text mt-1 font-display text-3xl font-semibold sm:text-4xl">
          {SUPPLY_SHORT}
        </span>
        <span className="mt-1 text-[11px] font-semibold tracking-[0.16em] text-gold">
          {TICKER}
        </span>
      </div>
    </div>
  );
}

export function Tokenomics() {
  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="glass relative overflow-hidden p-7 sm:p-9"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(200,162,76,0.4), transparent 70%)" }}
      />

      <motion.div
        variants={rise}
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold"
      >
        <LandingIcon name="coin" className="h-4 w-4" />
        Tokenomics
      </motion.div>
      <motion.h2
        variants={rise}
        className="mt-3 font-display text-2xl font-semibold text-bone sm:text-3xl"
      >
        The $RSP allocation
      </motion.h2>
      <motion.p
        variants={rise}
        className="mt-3 max-w-prose text-[15px] leading-relaxed text-bone-mut"
      >
        A fixed supply of {SUPPLY_LABEL} {TICKER}, weighted toward liquidity and
        the people who play. Every wedge below is fixed at launch and shown in
        the open.
      </motion.p>

      {/* Ticker + supply header chips */}
      <motion.div variants={rise} className="mt-6 flex flex-wrap gap-3">
        <div className="glass-sm flex items-center gap-3 rounded-2xl border border-gold/20 bg-panel px-4 py-3">
          <LandingIcon name="coin" className="h-5 w-5 text-gold" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
              Ticker
            </p>
            <p className="gold-text font-display text-lg font-semibold">{TICKER}</p>
          </div>
        </div>
        <div className="glass-sm flex items-center gap-3 rounded-2xl border border-gold/20 bg-panel px-4 py-3">
          <LandingIcon name="ledger" className="h-5 w-5 text-gold" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
              Total supply
            </p>
            <p className="tnum font-display text-lg font-semibold text-bone">
              {SUPPLY_LABEL}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Donut + legend */}
      <div className="mt-8 grid grid-cols-1 items-center gap-8 md:grid-cols-[auto_1fr]">
        <motion.div variants={rise}>
          <Donut />
        </motion.div>

        <motion.ul variants={rise} className="flex flex-col gap-3.5">
          {slices.map((s) => (
            <li key={s.label} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[13px] font-medium text-bone">
                    {s.label}
                  </span>
                  <span className="tnum shrink-0 font-display text-sm font-semibold text-gold">
                    {s.pct}%
                  </span>
                </div>
                <div className="bar-track mt-1.5 h-1.5 w-full">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: s.color }}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${s.pct * 4}%` }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>
            </li>
          ))}
        </motion.ul>
      </div>
    </motion.section>
  );
}
