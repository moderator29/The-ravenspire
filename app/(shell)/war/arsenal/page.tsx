"use client";

import { useMemo, useState } from "react";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { RarityChip } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Chip, ChipRail } from "@/components/console/console-shell";
import {
  ArtTile,
  Board,
  WarHeader,
  WarPage as WarFrame,
  WAR_BODY,
  WAR_META,
  WAR_ROW,
} from "@/components/war/war-chrome";
import { legendaryWeapons } from "@/lib/game/arsenal";
import { gearCatalog } from "@/lib/game/gear";

/* The Arsenal.

   Archetype: Board. Thirty one weapons and fifty pieces of gear, and the only
   thing a reader can do with them is compare, so both are dense rows with
   hairline dividers rather than the two image grids this used to be.

   Honest framing, and it matters: nothing in here is owned, equipped or
   forged. There is no inventory table behind it and no API that grants a
   weapon. This is the realm's catalog, and the page now says exactly that
   instead of implying a loadout screen that does not exist. */

const slots = [
  "all",
  "helm",
  "armor",
  "shield",
  "cloak",
  "gloves",
  "boots",
  "belt",
  "necklace",
  "ring",
  "banner",
  "consumable",
  "material",
] as const;

type Slot = (typeof slots)[number];

export default function ArsenalPage() {
  const [slot, setSlot] = useState<Slot>("all");

  const gear = useMemo(
    () =>
      slot === "all"
        ? gearCatalog
        : gearCatalog.filter((g) => g.slot === slot),
    [slot]
  );

  return (
    <WarFrame width="board">
      <WarHeader
        title="The Arsenal"
        kicker={`${legendaryWeapons.length} weapons, ${gearCatalog.length} pieces of gear`}
        backHref="/war"
      />

      <Card variant="warm" pad="sm">
        <div className="flex items-start gap-3">
          <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <p className="text-sm text-bone-mut">
            This is the realm&apos;s catalog, not your pack. Nothing here can be
            owned, equipped or forged yet, so no numbers on this page are yours.
            When the coals are lit, that changes.
          </p>
        </div>
      </Card>

      <SectionHeader
        title="Legendary weapons"
        hint={`${legendaryWeapons.length} blades`}
      />
      <Board label="Legendary weapons">
        {legendaryWeapons.map((weapon) => (
          <li key={weapon.slug} className={`${WAR_ROW} items-start py-2.5`}>
            <ArtTile src={weapon.art} alt={weapon.name} icon="swords" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`font-semibold text-bone ${WAR_BODY}`}>
                  {weapon.name}
                </p>
                <RarityChip rarity={weapon.rarity} />
                <span
                  className={`capitalize text-bone-faint ${WAR_META}`}
                >
                  {weapon.class}
                </span>
              </div>
              <p className={`mt-0.5 text-bone-mut ${WAR_META}`}>
                {weapon.effect}
              </p>
              <p className={`mt-0.5 italic text-bone-faint ${WAR_META}`}>
                {weapon.lore}
              </p>
            </div>
          </li>
        ))}
      </Board>

      <SectionHeader title="Gear of the realm" hint="Crown to boot" />
      <ChipRail label="Gear slot filter">
        {slots.map((s) => (
          <Chip key={s} active={slot === s} onClick={() => setSlot(s)}>
            <span className="capitalize">{s}</span>
          </Chip>
        ))}
      </ChipRail>

      {gear.length === 0 ? (
        <Card>
          <EmptyState
            icon="shield"
            title="Nothing in that slot yet"
            body="The armourers have not filled this rack. Widen the filter to see the whole catalog."
            action={
              <Button variant="glass" size="md" onClick={() => setSlot("all")}>
                Show all gear
              </Button>
            }
          />
        </Card>
      ) : (
        <Board label="Gear catalog">
          {gear.map((item) => (
            <li key={item.slug} className={WAR_ROW}>
              <ArtTile src={item.art} alt={item.name} icon="shield" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`truncate font-semibold text-bone ${WAR_BODY}`}>
                    {item.name}
                  </p>
                  <RarityChip rarity={item.rarity} />
                </div>
                <p className={`truncate text-bone-mut ${WAR_META}`}>
                  {item.effect}
                </p>
              </div>
              <span
                className={`hidden w-24 shrink-0 text-right capitalize text-bone-faint sm:block ${WAR_META}`}
              >
                {item.slot}
              </span>
            </li>
          ))}
        </Board>
      )}
    </WarFrame>
  );
}
