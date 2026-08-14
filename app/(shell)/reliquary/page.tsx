"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  SET_ONE,
  COLLECTABLE_NOW_COUNT,
  type SetOneCard,
} from "@/lib/collectibles/set-one";
import { houses, sigilIcon } from "@/lib/data/houses";
import { RarityChip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Chip, ChipRail } from "@/components/console/console-shell";
import { ForgeCorners, ForgeTicks } from "@/components/ui/forge-frame";
import { cx } from "@/components/ui/cx";
import { NotifyMe } from "@/components/realm/notify-me";
import { BackButton } from "@/components/shell/back-button";
import type { Rarity } from "@/lib/game/champions";

/* Sigil by full House name, for the sealed-back fallback when a portrait has
   not landed yet. */
const sigilByHouseName = new Map(
  houses.map((h) => [h.name, sigilIcon[h.sigil] ?? "banner"] as const)
);

/* THE RELIQUARY (V2 Part Two, section 26.1). Plain label: cards and relics.
 *
 * The realm's catalog and, after launch, the member's binder. Set One, the
 * legion of the Six Houses, shown portrait-forward: the champions are the
 * surface, House by House, at the size the art deserves. Each card is two
 * containers, a forged-gold portrait frame over an obsidian-and-gold info
 * plate, drawn from the reference card. This is a Forge moment (design law,
 * rule 21), so the frame carries corner brackets and the tile lifts on hover,
 * ornament earned by the showcase.
 *
 * The roster is revealed, the mint is sealed. Showing the champion art is
 * marketing, not a sale: no owners, prices, supplies or sale counts appear,
 * because none exist yet, and the page says the mint is sealed until launch.
 * Every name, title, House and rarity is the real record from
 * lib/game/champions.ts; most cards carry finished art, the few whose
 * portraits have not landed show the House sigil and say "Portrait incoming".
 * A card opens the collectible's own inner page, a real door, never a dead one.
 * Most of the set is locked and held for a future drop; a small genesis wave is
 * collectable now, and each card wears its drop state. */

type HouseFilter = "all" | string;
type RarityFilter = "all" | Rarity;

const RARITY_FILTERS: { key: RarityFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mythic", label: "Mythic" },
  { key: "legendary", label: "Legendary" },
  { key: "epic", label: "Epic" },
  { key: "rare", label: "Rare" },
];

/* One card in the legion, two stacked containers.
 *
 * TOP: the portrait, framed in forged gold with corner brackets and a HUD tick
 * motif drawn from the reference card. No text of any kind sits on the art: the
 * name, the rarity, the collector number all live in the panel below, so the
 * portrait is only ever the portrait.
 *
 * BOTTOM: the info panel, a slick obsidian-and-gold plate. The name gets its
 * own full line in the gold gradient, then a details row carries the rarity and
 * the collector number, the same shape the reference card uses.
 *
 * A link, not a dead door: the card opens the collectible's own inner page,
 * where the edition, traits, kit and lore live. The whole tile lifts on hover
 * and the portrait pushes in, transform only. The House is not repeated on the
 * card because the section header above already names it. A locked card is part
 * of Set One but held for a future drop, marked here and dimmed a touch. */
function LegionCard({ card }: { card: SetOneCard }) {
  const c = card.champion;
  const sigil = sigilByHouseName.get(c.house) ?? "banner";

  return (
    <Link
      href={`/reliquary/${c.slug}`}
      aria-label={`${c.name}, ${c.rarity} of ${c.house}. ${
        card.locked ? "Held for a future drop." : "In the genesis drop."
      } Open the collectible.`}
      className="group flex flex-col gap-2 rounded-lg outline-none transition-transform duration-fast ease-out-quint hover:-translate-y-1 focus-visible:-translate-y-1"
    >
      {/* The portrait container. Forged gold frame, no text. */}
      <div className="relative aspect-[5/7] w-full overflow-hidden rounded-lg border border-gold/25 bg-void shadow-[0_10px_28px_-12px_rgba(0,0,0,0.75)] transition-colors duration-fast group-hover:border-gold/55">
        {c.art ? (
          <Image
            src={c.art}
            alt=""
            fill
            sizes="(min-width:1024px) 300px, (min-width:640px) 33vw, 50vw"
            className={cx(
              "object-cover transition-transform duration-slow ease-out-quint group-hover:scale-[1.04]",
              card.locked && "opacity-85"
            )}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[image:radial-gradient(80%_60%_at_50%_35%,rgba(217,176,64,0.08),transparent_70%)]">
            <Icon name={sigil} className="h-12 w-12 text-gold/40" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-bone-faint">
              Portrait incoming
            </span>
          </div>
        )}

        {/* A warm inner vignette so the gold frame reads against any art. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_0_38px_rgba(0,0,0,0.55)]"
        />

        {/* Drop state, top-left. Genesis pieces get a gold spark, locked pieces
            a padlock, so the wave reads at a glance across the grid. */}
        <span
          className={cx(
            "pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] backdrop-blur-[2px]",
            card.locked
              ? "border-steel-line/70 bg-obsidian/70 text-bone-faint"
              : "border-gold/45 bg-obsidian/70 text-gold-bright"
          )}
        >
          <Icon name={card.locked ? "lock" : "spark"} className="h-2.5 w-2.5" />
          {card.locked ? "Locked" : "Drop"}
        </span>

        <ForgeCorners />
        <ForgeTicks />
      </div>

      {/* The info panel. Name on its own line, then a details row. */}
      <div className="relative overflow-hidden rounded-md border border-gold/25 bg-gradient-to-b from-panel-warm to-void px-3 py-2.5 transition-colors duration-fast group-hover:border-gold/50">
        {/* Gold hairline across the top, the reference card's divider. */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--gold),transparent)] opacity-70"
        />
        <span className="gold-text block font-display text-sm font-semibold leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
          {c.name}
        </span>
        <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.14em] text-bone-faint">
          {c.title}
        </span>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-steel-line/70 pt-1.5">
          <RarityChip rarity={c.rarity}>{c.rarity}</RarityChip>
          <span className="tnum shrink-0 text-[9px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
            No. {card.number}
            <span className="text-bone-faint/60">/{SET_ONE.counts.total}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

/* A House block: a cinematic header (sigil, name, motto, count) over that
   House's champions. The header is the one place the legion breathes between
   the dense card grids. */
function HouseBlock({
  houseName,
  cards,
}: {
  houseName: string;
  cards: SetOneCard[];
}) {
  const house = houses.find((h) => h.name === houseName);
  const sigil = house ? sigilIcon[house.sigil] ?? "banner" : "banner";
  if (cards.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3 border-b border-steel-line pb-2.5">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gold/25 bg-obsidian/70">
          <Icon name={sigil} className="h-5 w-5 text-gold" />
        </span>
        <div className="min-w-0">
          <h2 className="gold-text font-display text-lg font-semibold leading-tight">
            {houseName}
          </h2>
          {house ? (
            <p className="truncate text-[11px] uppercase tracking-[0.18em] text-bone-faint">
              {house.motto}
            </p>
          ) : null}
        </div>
        <span className="tnum ml-auto shrink-0 text-xs font-semibold text-bone-faint">
          {cards.length} {cards.length === 1 ? "champion" : "champions"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => (
          <LegionCard key={card.champion.slug} card={card} />
        ))}
      </div>
    </section>
  );
}

export default function ReliquaryPage() {
  const { counts } = SET_ONE;
  const [house, setHouse] = useState<HouseFilter>("all");
  const [rarity, setRarity] = useState<RarityFilter>("all");

  /* House order follows the canonical houses list so the legion always reads
     in the same sequence, then any House the set uses that is not in that list
     is appended rather than dropped. */
  const houseOrder = useMemo(() => {
    const canonical = houses.map((h) => h.name);
    const present = Array.from(
      new Set(SET_ONE.cards.map((c) => c.champion.house))
    );
    const extra = present.filter((h) => !canonical.includes(h));
    return [...canonical.filter((h) => present.includes(h)), ...extra];
  }, []);

  const filtered = useMemo(
    () =>
      SET_ONE.cards.filter(
        (c) =>
          (house === "all" || c.champion.house === house) &&
          (rarity === "all" || c.champion.rarity === rarity)
      ),
    [house, rarity]
  );

  const visibleHouses =
    house === "all" ? houseOrder : houseOrder.filter((h) => h === house);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-4 sm:px-4 sm:py-6">
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
            The legion of the Six Houses, drawn from the War&rsquo;s own roster.
            Every name, title and rarity is the real record: the same champions
            you can already muster on the field. The roster is revealed; the mint
            stays sealed until launch. Owning the card is owning the champion.
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

        {/* The set line, computed from the set so it can never drift. */}
        <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
          <p className="tnum flex flex-wrap gap-x-4 gap-y-1 text-xs text-bone-mut">
            <span className="font-semibold text-bone">{counts.total} cards</span>
            <span>{counts.mythic} mythic</span>
            <span>{counts.legendary} legendary</span>
            <span>{counts.epic} epic</span>
            <span>{counts.rare} rare</span>
            <span>six Houses</span>
            <span className="text-gold-bright">
              {COLLECTABLE_NOW_COUNT} in the genesis drop
            </span>
          </p>
        </Card>
      </header>

      {/* Browse the legion by House, then narrow by rarity. */}
      <div className="flex flex-col gap-2">
        <ChipRail label="Filter by House">
          <Chip active={house === "all"} onClick={() => setHouse("all")}>
            All Houses
          </Chip>
          {houseOrder.map((h) => (
            <Chip key={h} active={house === h} onClick={() => setHouse(h)}>
              {h.replace("House ", "")}
            </Chip>
          ))}
        </ChipRail>
        <ChipRail label="Filter by rarity">
          {RARITY_FILTERS.map((r) => (
            <Chip
              key={r.key}
              active={rarity === r.key}
              onClick={() => setRarity(r.key)}
            >
              {r.label}
            </Chip>
          ))}
        </ChipRail>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-steel-line bg-obsidian/40 px-4 py-8 text-center text-sm text-bone-mut">
          No champions match that filter.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {visibleHouses.map((h) => (
            <HouseBlock
              key={h}
              houseName={h}
              cards={filtered.filter((c) => c.champion.house === h)}
            />
          ))}
        </div>
      )}

      <p className="max-w-2xl text-xs leading-relaxed text-bone-faint">
        Planned supplies are announced before anything mints, and nothing mints
        until the set is final. No prices, no owners, no sale counts appear here
        because none exist yet. Open any champion to read its kit in the War.
      </p>
    </div>
  );
}
