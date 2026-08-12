"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { SET_ONE } from "@/lib/collectibles/set-one";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { NotifyMe } from "@/components/realm/notify-me";
import { cx } from "@/components/ui/cx";

/* THE COLLECTION (V2 Part Two, section 30.2): the landing page's statement of
 * what the realm is now. Play the War, collect the champions, own the relics.
 *
 * The fan shows five real cards from Set One, chosen because their portraits
 * are finished: the two mythics at the heart of the fan, legendaries around them.
 * Every name and rarity is the live roster's own record, the same data the
 * sealed /reliquary preview renders, so this section can never advertise a
 * card that does not exist. The seal treatment matches the Reliquary's:
 * obsidian veil, padlock, and a hover peek that animates opacity only.
 *
 * Honesty holds on marketing surfaces the same as anywhere: no prices, no
 * supplies, no owners, and the Notify me is the real interest capture, not a
 * decoration. */

const FAN_SLUGS = [
  "vorian-nightblade",
  "aeron-the-black",
  "kaelen-dragonborn",
  "the-faceless",
  "isolde-the-pure",
] as const;

/* The fan: gentle alternating rotation, deepest card in the middle of the
   z order so the two mythics read as the prize. Outer two hide below `sm`,
   because three overlapped cards are a fan and five are a pile at 390. */
const FAN_STYLE = [
  "hidden sm:block sm:-rotate-6 sm:translate-y-3",
  "-rotate-3 translate-y-1",
  "z-10",
  "rotate-3 translate-y-1",
  "hidden sm:block sm:rotate-6 sm:translate-y-3",
];

function FanCard({ slug, className }: { slug: string; className?: string }) {
  const card = SET_ONE.cards.find((c) => c.champion.slug === slug);
  const art = card?.champion.art;
  if (!card || !art) return null;
  const c = card.champion;

  return (
    <div
      className={cx(
        "group relative aspect-[5/7] w-24 shrink-0 overflow-hidden rounded-lg border border-steel-line bg-void shadow-card sm:w-32 lg:w-36",
        className
      )}
    >
      <Image
        src={art}
        alt={`${c.name}, ${c.rarity} champion of ${c.house}`}
        fill
        sizes="(max-width: 640px) 96px, 144px"
        className="object-cover"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-obsidian/45 backdrop-blur-[3px] transition-opacity duration-base ease-out-quint group-hover:opacity-0"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gold/30 bg-obsidian/80">
          <Icon name="lock" className="h-3.5 w-3.5 text-gold" />
        </span>
      </div>
      <span className="absolute inset-x-0 bottom-0 bg-[image:linear-gradient(to_top,rgba(7,7,10,0.92),transparent)] px-2 pb-1.5 pt-5 text-center font-display text-[10px] font-semibold text-bone">
        {c.name}
      </span>
    </div>
  );
}

const PILLARS = [
  {
    href: "/reliquary",
    icon: "layers",
    name: "The Reliquary",
    plain: "Cards and relics",
    body: "Set One sealed and on display. Owning the card is owning the champion.",
  },
  {
    href: "/warchests",
    icon: "coin",
    name: "Warchests",
    plain: "Mystery boxes",
    body: "Digital chests and a physical box with official merch. Exact odds printed on every one.",
  },
  {
    href: "/mercer",
    icon: "flag",
    name: "The Mercer",
    plain: "Official merch",
    body: "Five pieces at launch, made properly. Every physical Warchest ships one.",
  },
] as const;

export function TheCollection() {
  const { counts } = SET_ONE;

  return (
    <motion.section
      id="collection"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6 }}
      className="scroll-mt-28"
    >
      <div className="flex flex-col items-center text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">
          The Collection &middot; Coming soon
        </p>
        <h2 className="gold-text mt-3 max-w-2xl font-display text-3xl font-semibold sm:text-4xl">
          Collect the champions you battle with
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-bone-mut sm:text-base">
          {counts.total} cards from the War&rsquo;s own roster: {counts.mythic}{" "}
          mythic, {counts.legendary} legendary, {counts.epic} epic,{" "}
          {counts.rare} rare, across the six Houses. Sealed until launch,
          minted to your own wallet after, never ours.
        </p>

        {/* The fan. Five sealed cards, hover to peek. */}
        <div className="mt-10 flex items-start justify-center -space-x-4 sm:-space-x-6">
          {FAN_SLUGS.map((slug, i) => (
            <FanCard key={slug} slug={slug} className={FAN_STYLE[i]} />
          ))}
        </div>

        <NotifyMe feature="reliquary" size="md" className="mt-9" />
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <Card
            key={p.href}
            render={<Link href={p.href} />}
            interactive
            radius="lg"
            className="flex flex-col gap-2"
          >
            <span className="flex items-center gap-2">
              <Icon name={p.icon} className="h-4 w-4 text-gold" />
              <span className="font-display text-base font-semibold text-bone">
                {p.name}
              </span>
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
              {p.plain}
            </span>
            <span className="text-xs leading-relaxed text-bone-mut">
              {p.body}
            </span>
            <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-gold">
              See the preview
              <Icon name="arrow" className="h-3 w-3" />
            </span>
          </Card>
        ))}
      </div>
    </motion.section>
  );
}
