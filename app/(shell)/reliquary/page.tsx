"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SET_ONE, type SetOneCard } from "@/lib/collectibles/set-one";
import { houses } from "@/lib/data/houses";
import { RarityChip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { NotifyMe } from "@/components/realm/notify-me";
import { BackButton } from "@/components/shell/back-button";
import { SegmentedControl } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { realmFetch } from "@/lib/auth/api";
import { cx } from "@/components/ui/cx";

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
 * from lib/game/champions.ts. Twenty cards carry finished art today; the
 * other twenty show the sealed card back until their portraits land, and say
 * so plainly.
 *
 * AND NOW IT KNOWS WHAT YOU HOLD. The catalog was a poster; with a holdings
 * ledger behind it, it becomes a checklist, which is the thing a collector
 * actually returns to. A card you hold is unsealed and wears its rarity frame,
 * because the seal was always about a card you have not pulled yet rather than
 * about a chapter being closed. The progress line, the filter and the frames
 * are all absent until the read lands, so the page never spends a moment
 * claiming you own nothing before it knows. */

const sigilByHouse = new Map(houses.map((h) => [h.name, h.sigil] as const));

function CardFace({
  card,
  peeked,
  copies,
}: {
  card: SetOneCard;
  peeked: boolean;
  /* How many the viewer holds. Zero means sealed, which is everybody today. */
  copies: number;
}) {
  const c = card.champion;
  const sigil = sigilByHouse.get(c.house) ?? "banner";
  const owned = copies > 0;

  return (
    <div
      className={cx(
        "relative aspect-[5/7] w-full overflow-hidden rounded-lg bg-void",
        /* A card you hold earns the Forge: its rarity frame and its light. An
           unheld one stays a flat plate, so the difference between the two is
           visible from across the room, which is the whole point of the
           checklist. */
        owned ? `rarity-${c.rarity} rarity-frame` : "border border-steel-line"
      )}
    >
      {c.art ? (
        <Image
          src={c.art}
          alt=""
          fill
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 200px"
          className="object-cover"
        />
      ) : (
        /* The card back: house sigil on obsidian. Honest about the missing
           portrait rather than faking one. */
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[image:radial-gradient(80%_60%_at_50%_35%,rgba(217,176,64,0.08),transparent_70%)]">
          <Icon name={sigil} className="h-10 w-10 text-gold/40" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-bone-faint">
            Portrait incoming
          </span>
        </div>
      )}

      {/* The seal. A veil over the art, not over the checklist: backdrop blur
          plus an obsidian scrim, carrying the padlock. It fades on peek and on
          hover, opacity only. pointer-events-none so the card button under it
          receives every tap. */}
      <div
        aria-hidden
        className={cx(
          "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2",
          "bg-obsidian/45 backdrop-blur-[3px]",
          "transition-opacity duration-base ease-out-quint",
          /* A card you own is never veiled. The seal is about a card you have
             not pulled yet, not about a chapter being closed. */
          owned || peeked ? "opacity-0" : "opacity-100 group-hover:opacity-0"
        )}
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gold/30 bg-obsidian/80">
          <Icon name="lock" className="h-4 w-4 text-gold" />
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-bone-mut">
          Sealed
        </span>
      </div>

      {/* Collector number, always visible, the way a printed card carries it. */}
      <span className="tnum absolute left-1.5 top-1.5 rounded-sm bg-obsidian/70 px-1.5 py-0.5 text-[9px] font-semibold text-bone-faint">
        {card.number}/{SET_ONE.counts.total}
      </span>

      {/* Held, and how many. Gold, because a card in your collection is the one
          thing on this page worth shouting about. */}
      {owned ? (
        <span className="tnum absolute right-1.5 top-1.5 rounded-sm bg-obsidian/80 px-1.5 py-0.5 text-[9px] font-semibold text-gold">
          {copies > 1 ? `${copies} held` : "Held"}
        </span>
      ) : null}
    </div>
  );
}

function SetCard({ card, copies }: { card: SetOneCard; copies: number }) {
  const [peeked, setPeeked] = useState(false);
  const c = card.champion;

  return (
    /* A button, not a link: there is nowhere to go yet, and pretending
       otherwise would be a dead door. Pressing peeks the art; pressing again
       reseals. Hover peeks on a mouse without the press. */
    <button
      type="button"
      aria-pressed={peeked}
      aria-label={
        copies > 0
          ? `${c.name}, ${c.rarity} of ${c.house}. ${copies > 1 ? `${copies} held` : "Held"}.`
          : `${c.name}, ${c.rarity} of ${c.house}. Sealed preview.`
      }
      onClick={() => setPeeked((v) => !v)}
      className="group flex flex-col gap-2 rounded-lg text-left"
    >
      <CardFace card={card} peeked={peeked} copies={copies} />
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

type Filter = "all" | "held" | "missing";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "held", label: "Held" },
  { value: "missing", label: "Missing" },
];

export default function ReliquaryPage() {
  const { counts } = SET_ONE;
  /* Copies held per champion, from the member's own holdings ledger. Null
     until the read lands and for anyone signed out, which is the difference
     between "you hold nothing" and "we do not know yet". A checklist that
     briefly claims you own nothing is a checklist that lies for a moment. */
  const [held, setHeld] = useState<Map<string, number> | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const loadHoldings = useCallback(async () => {
    const res = await realmFetch<{
      cards?: { champion_slug: string; set_slug: string }[];
    }>("/api/inventory");
    if (!res.ok) {
      setHeld(new Map());
      return;
    }
    const counted = new Map<string, number>();
    for (const copy of res.data?.cards ?? []) {
      if (copy.set_slug !== SET_ONE.slug) continue;
      counted.set(copy.champion_slug, (counted.get(copy.champion_slug) ?? 0) + 1);
    }
    setHeld(counted);
  }, []);

  useEffect(() => {
    void loadHoldings();
  }, [loadHoldings]);

  const holdings = useMemo(() => held ?? new Map<string, number>(), [held]);
  const distinct = holdings.size;

  const shown = useMemo(
    () =>
      SET_ONE.cards.filter((card) =>
        filter === "all"
          ? true
          : filter === "held"
            ? (holdings.get(card.champion.slug) ?? 0) > 0
            : (holdings.get(card.champion.slug) ?? 0) === 0
      ),
    [filter, holdings]
  );

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

        {/* Where the member stands in the set, and it is real or it is absent.
            Before the holdings read lands there is no progress line at all,
            rather than a zero that might be wrong. */}
        {held !== null && distinct > 0 ? (
          <Card variant="warm" tone="gold" pad="none" radius="lg" className="px-4 py-3">
            <p className="tnum text-sm font-semibold text-bone">
              {distinct} of {counts.total} collected
            </p>
            <p className="mt-0.5 text-xs text-bone-mut">
              Every card you hold can be carried to your own wallet.
            </p>
          </Card>
        ) : null}

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

      {/* Three mutually exclusive views of one collection, switched in place,
          which is the segmented control case. It appears only once the member
          holds something: a Held and Missing filter over an empty collection is
          two dead tabs and a full one. */}
      {held !== null && distinct > 0 ? (
        <SegmentedControl
          label="The set"
          block
          value={filter}
          onValueChange={(next) => setFilter(next as Filter)}
          items={FILTERS}
        />
      ) : null}

      {shown.length === 0 ? (
        <Card pad="none">
          <EmptyState
            icon3d="cards"
            title={filter === "held" ? "Nothing from this set yet" : "The set is complete"}
            body={
              filter === "held"
                ? "Cards arrive from Warchests and from the codes printed inside physical boxes. Every one you pull lands here."
                : "You hold every card in Set One. There is nothing left to find."
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((card) => (
            <SetCard
              key={card.champion.slug}
              card={card}
              copies={holdings.get(card.champion.slug) ?? 0}
            />
          ))}
        </div>
      )}

      <p className="max-w-2xl text-xs leading-relaxed text-bone-faint">
        Planned supplies are announced before anything mints, and nothing mints
        until the set is final. No prices, no owners, no sale counts appear
        here because none exist yet. Press a card to peek at it.
      </p>
    </div>
  );
}
