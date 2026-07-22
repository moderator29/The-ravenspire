"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { LandingIcon } from "@/components/landing/icons";
import { ScrollRail } from "@/components/landing/scroll-rail";
import { champions } from "@/lib/game/champions";

/*
  The Champions. Real roster data from lib/game/champions. We only render
  champions whose art field is set (each maps to a file under
  public/game/champions), so no broken frames.

  Presented as a single horizontal rail of portrait cards. The name and title
  sit in a caption BELOW the artwork, never over the character.
*/

/*
  Only the full-resolution portraits (roughly 218px wide source art) are
  featured here so the roster stays crisp. The smaller thumbnail-sized files
  in the roster are deliberately left out to avoid any upscaling blur.
*/
const featuredSlugs = [
  "aeron-the-black",
  "the-faceless",
  "mira-stormborn",
  "ser-aldric",
  "grommash",
  "sable-nightwood",
  "lady-ysolde",
  "torvald-ironhand",
  "nymeria-vale",
  "ser-elyra",
  "karn-the-reaver",
  "bael-the-bard",
];

const bySlug = new Map(champions.map((c) => [c.slug, c]));
const featured = featuredSlugs
  .map((s) => bySlug.get(s))
  .filter((c): c is (typeof champions)[number] => Boolean(c && c.art));

/* Rough ceilings across the roster, used to normalize the stat bars. */
const MAX = { attack: 3800, defense: 1600 };

const rise: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

function StatBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-[8px] uppercase tracking-[0.12em] text-bone-faint">
        {label}
      </span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-void">
        <div className="gold-metal h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TheChampions() {
  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="scroll-mt-28"
    >
      <motion.div
        variants={rise}
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold"
      >
        <LandingIcon name="swords" className="h-4 w-4" />
        The Champions
      </motion.div>
      <motion.h2
        variants={rise}
        className="mt-3 font-display text-2xl font-semibold text-bone sm:text-3xl"
      >
        Sixty heroes. Six Houses. One banner to carry.
      </motion.h2>
      <motion.p
        variants={rise}
        className="mt-3 max-w-prose text-[15px] leading-relaxed text-bone-mut"
      >
        Collect champions across the rarities, arm them from a legendary arsenal,
        and lead them into The War yourself. Swipe the roster below.
      </motion.p>

      <motion.div variants={rise} className="mt-7">
        <ScrollRail ariaLabel="Champion roster">
          {featured.map((c) => (
            <Link
              key={c.slug}
              href="/war/champions"
              className={`rarity-${c.rarity} rarity-frame group snap-start shrink-0 w-[54vw] max-w-[220px] overflow-hidden rounded-2xl bg-panel sm:w-[210px]`}
            >
              {/* Artwork only, no text over the character. Full-resolution
                  source rendered crisp: object-cover, no blur filter. */}
              <div className="relative overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.art}
                  alt={c.name}
                  width={218}
                  height={291}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="aspect-[3/4] w-full object-cover object-top transition duration-500 group-hover:scale-[1.04]"
                />
                {/* Slim base scrim only, kept clear of the face so the art reads sharp */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-void/60 to-transparent" />
                <span className={`rarity-${c.rarity} rarity-chip absolute left-2 top-2`}>
                  {c.rarity}
                </span>
              </div>

              {/* Caption BELOW the art */}
              <div className="border-t border-steel-line/70 p-3">
                <p className="truncate font-display text-sm font-semibold text-bone">
                  {c.name}
                </p>
                <p className="truncate text-[10px] text-bone-faint">{c.title}</p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-gold">
                  <LandingIcon name="swords" className="h-3 w-3" />
                  {c.weapon}
                </p>
                <div className="mt-2.5 flex flex-col gap-1">
                  <StatBar label="ATK" value={c.stats.attack} max={MAX.attack} />
                  <StatBar label="DEF" value={c.stats.defense} max={MAX.defense} />
                </div>
              </div>
            </Link>
          ))}
        </ScrollRail>
      </motion.div>

      <motion.div variants={rise}>
        <Link
          href="/war/champions"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-gold transition hover:text-gold-bright"
        >
          Muster the full roster
          <LandingIcon name="arrowRight" className="h-4 w-4" />
        </Link>
      </motion.div>
    </motion.section>
  );
}
