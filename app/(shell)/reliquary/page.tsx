"use client";

import { useState } from "react";
import Link from "next/link";
import { SET_ONE, type SetOneCard } from "@/lib/collectibles/set-one";
import { RarityChip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { ChampionCardFace } from "@/components/ui/champion-card";
import { NotifyMe } from "@/components/realm/notify-me";
import { BackButton } from "@/components/shell/back-button";

/* THE RELIQUARY (V2 Part Two, section 26.1). Plain label: cards and relics.
 *
 * The realm's catalog and, after launch, the member's binder. This page is
 * the sealed preview of Set One: every card rendered from the real roster,
 * teased but locked, with a Notify me that registers real interest.
 *
 * The seal is deliberately per card rather than a blur over the whole page.
 * The catalog is the marketing; hiding all of it would defeat the preview.
 * So the checklist reads crisp (a collector wants the list), the art sits
 * behind a sealed veil, and a press or hover lifts the veil on one card at a
 * time. The lift animates opacity only, per the motion law.
 *
 * Honesty rules this surface. No owners, no prices, no supplies, no sale
 * counts: none of that exists yet, so none of it is shown. What is shown is
 * real: forty champions, their names, titles, houses and rarities, straight
 * from lib/game/champions.ts. Most cards carry finished art; the few whose
 * portraits have not landed show the sealed card back and say so plainly. */

/* The Reliquary grid draws the shared card chassis (components/ui/champion-card),
   the one chassis used at every size across the product. The peek behaviour is
   the Reliquary's own: the chassis renders the sealed veil, and pressing or
   hovering lifts it by fading the veiled face out and the open face in, opacity
   only, per the motion law. */
function CardFace({ card, peeked }: { card: SetOneCard; peeked: boolean }) {
  const c = card.champion;
  return (
    <div className="relative">
      <ChampionCardFace
        champion={c}
        number={card.number}
        total={SET_ONE.counts.total}
        size="md"
      />
      {/* The veil, cross-faded on peek or hover. Kept as a sibling overlay so
          the toggle animates opacity only rather than swapping the chassis. */}
      <div
        aria-hidden
        className={
          "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg " +
          "bg-obsidian/45 backdrop-blur-[3px] transition-opacity duration-base ease-out-quint " +
          (peeked ? "opacity-0" : "opacity-100 group-hover:opacity-0")
        }
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gold/30 bg-obsidian/80">
          <Icon name="lock" className="h-4 w-4 text-gold" />
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-bone-mut">
          Sealed
        </span>
      </div>
    </div>
  );
}

function SetCard({ card }: { card: SetOneCard }) {
  const [peeked, setPeeked] = useState(false);
  const c = card.champion;

  return (
    /* A button, not a link: there is nowhere to go yet, and pretending
       otherwise would be a dead door. Pressing peeks the art; pressing again
       reseals. Hover peeks on a mouse without the press. */
    <button
      type="button"
      aria-pressed={peeked}
      aria-label={`${c.name}, ${c.rarity} of ${c.house}. Sealed preview.`}
      onClick={() => setPeeked((v) => !v)}
      className="group flex flex-col gap-2 rounded-lg text-left"
    >
      <CardFace card={card} peeked={peeked} />
      <span className="flex min-w-0 flex-col gap-1 px-0.5">
        <span className="truncate font-display text-[13px] font-semibold leading-tight text-bone">
          {c.name}
        </span>
        <span className="truncate text-[10px] uppercase tracking-[0.14em] text-bone-faint">
          {c.title}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <RarityChip rarity={c.rarity}>{c.rarity}</RarityChip>
          <span className="truncate text-[10px] text-bone-faint">
            {c.house.replace("House ", "")}
          </span>
        </span>
      </span>
    </button>
  );
}

export default function ReliquaryPage() {
  const { counts } = SET_ONE;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex">
        <BackButton />
      </div>

      <header className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
            The Reliquary &middot; Cards and relics
          </p>
          <h1 className="gold-text mt-1.5 font-display text-2xl font-semibold sm:text-3xl">
            Set One: {SET_ONE.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bone-mut">
            Forty champions drawn from the War&rsquo;s own roster, sealed until
            launch. Every name, title and rarity on this page is the real
            record: the same champions you can already muster on the field.
            Owning the card is owning the champion.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <NotifyMe feature="reliquary" size="md" />
          <Link
            href="/war/champions"
            className="inline-flex min-h-9 touch:min-h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-bone-mut transition-colors duration-fast hover:text-bone"
          >
            <Icon name="swords" className="h-4 w-4 text-gold" />
            The champions live in the War
          </Link>
        </div>

        {/* The set line, computed from the set itself so it can never drift
            from the cards below it. */}
        <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
          <p className="tnum flex flex-wrap gap-x-4 gap-y-1 text-xs text-bone-mut">
            <span className="font-semibold text-bone">{counts.total} cards</span>
            <span>{counts.mythic} mythic</span>
            <span>{counts.legendary} legendary</span>
            <span>{counts.epic} epic</span>
            <span>{counts.rare} rare</span>
            <span>six Houses</span>
          </p>
        </Card>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {SET_ONE.cards.map((card) => (
          <SetCard key={card.champion.slug} card={card} />
        ))}
      </div>

      <p className="max-w-2xl text-xs leading-relaxed text-bone-faint">
        Planned supplies are announced before anything mints, and nothing mints
        until the set is final. No prices, no owners, no sale counts appear
        here because none exist yet. Press a card to peek at it.
      </p>
    </div>
  );
}
