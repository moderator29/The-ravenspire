"use client";

import { motion } from "framer-motion";
import { BackButton } from "@/components/shell/back-button";
import { Icon } from "@/components/ui/icon";

/* Claim the Throne is held back for launch to build anticipation through the
   presale. This is the sneak peek: what the season game will be, framed as a
   premium coming-soon reveal. The full game lives in git history and returns
   at the season opening. */

const PILLARS = [
  {
    icon: "crown",
    title: "Seasons for the Throne",
    body: "Every season is a race for the Iron Throne. Earn Glory across the realm and climb from Smallfolk to King or Queen.",
  },
  {
    icon: "swords",
    title: "Duels of the Circle",
    body: "Challenge any member to a duel of wits and words. The realm votes, the winner takes the Glory, the loser takes the lesson.",
  },
  {
    icon: "scroll",
    title: "Quests and Deeds",
    body: "Daily, weekly and seasonal quests reward the deeds that build the realm. The Watch remembers everything you do.",
  },
  {
    icon: "banner",
    title: "House Glory",
    body: "Your Glory raises your House. Houses war for the season crown, and the winning House shares the season vault.",
  },
];

const previewCards = [
  { label: "Season I", value: "The First Throne", sub: "Opens after presale" },
  { label: "Your rank", value: "Smallfolk", sub: "Rise to King or Queen" },
  { label: "House", value: "Choose your banner", sub: "Six Houses, one crown" },
];

export default function ThroneComingSoon() {
  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <BackButton href="/home" />

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="glass relative mt-4 overflow-hidden p-7 text-center sm:p-10"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          style={{
            background:
              "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(200,162,76,0.20), transparent 70%)",
          }}
        />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          Coming Soon
        </span>
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/40 bg-void"
        >
          <Icon name="crown" className="h-8 w-8 text-gold-bright" />
        </motion.div>
        <h1 className="gold-text mt-5 font-display text-3xl font-semibold sm:text-4xl">
          Claim the Throne
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-bone-mut">
          The realm's season game is being forged. Earn Glory, duel for honor,
          raise your House and race for the Iron Throne. It opens to the realm
          at launch. Hold the line.
        </p>
      </motion.section>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {previewCards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
            className="glass glass-sm p-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
              {c.label}
            </p>
            <p className="mt-1 font-display text-lg font-semibold text-bone">
              {c.value}
            </p>
            <p className="mt-0.5 text-xs text-bone-faint">{c.sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-6">
        <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
          A sneak peek of the season
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.07, duration: 0.5 }}
              className="glass glass-sm glass-hover p-5"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gold/25 bg-void">
                <Icon name={p.icon} className="h-5 w-5 text-gold" />
              </div>
              <h3 className="mt-3 font-display text-base font-semibold text-bone">
                {p.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-bone-mut">
                {p.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="glass mt-6 flex flex-col items-center gap-2 p-6 text-center">
        <Icon name="flame" className="h-5 w-5 text-ember" />
        <p className="text-sm text-bone-mut">
          The throne is claimed at launch. Follow the realm and be ready when the
          season opens.
        </p>
      </div>
    </div>
  );
}
