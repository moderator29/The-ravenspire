"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { RarityChip } from "@/components/ui/badge";
import { Chip, ChipRail } from "@/components/console/console-shell";
import {
  BOARD_BODY,
  BOARD_LIST_ROW,
  BOARD_META,
  BoardHeader,
  BoardList,
  BoardPage,
  BoardStack,
} from "@/components/board/board-shell";
import { ArtTile } from "@/components/war/war-chrome";
import { champions, type Rarity } from "@/lib/game/champions";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* The champion roster.

   Archetype: BoardList. Comparison is the job here, so this is dense scannable
   rows with hairline dividers, no zebra striping and the two metrics that
   actually decide a fight, attack and health, right aligned and tabular so the
   columns line up. Ornament budget zero: the rarity signal is a chip, not a
   glowing frame around every portrait.

   It used to be a portrait gallery that showed only the twenty champions with
   finished art and folded the other forty three into a single "+43 more
   heroes" tile. Every one of those forty three is real: a name, a House, a
   weapon, a kit and stats. A BoardList can carry them all at a 36px thumbnail, so
   none of the roster is hidden behind a tile any more. */

type Filter = "all" | Rarity;

const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "rare", label: "Rare" },
  { key: "epic", label: "Epic" },
  { key: "legendary", label: "Legendary" },
  { key: "mythic", label: "Mythic" },
];

export default function ChampionsPage() {
  const { ready, authenticated } = useRealmAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [unlockedSlugs, setUnlockedSlugs] = useState<string[] | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let live = true;
    void (async () => {
      const res = await realmFetch<{ state: { unlocked_champions: string[] } }>(
        "/api/war/battle"
      );
      if (!live) return;
      if (res.ok && res.data?.state?.unlocked_champions) {
        setUnlockedSlugs(res.data.state.unlocked_champions);
      }
    })();
    return () => {
      live = false;
    };
  }, [ready, authenticated]);

  const isUnlocked = (slug: string, fallback: boolean) =>
    unlockedSlugs ? unlockedSlugs.includes(slug) : fallback;

  const rows = useMemo(
    () =>
      filter === "all"
        ? champions
        : champions.filter((c) => c.rarity === filter),
    [filter]
  );

  /* Only ever counted against what the server actually returned. Before that
     read lands there is no honest number to show, so none is shown. */
  const sworn = unlockedSlugs
    ? `${unlockedSlugs.length} of ${champions.length} sworn to you`
    : `${champions.length} in the realm`;

  return (
    <BoardPage width="wide">
      <BoardStack>
        <BoardHeader title="Champions" kicker={sworn} backHref="/war" />

        <ChipRail label="Rarity filter">
          {filters.map((f) => (
            <Chip
              key={f.key}
              active={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Chip>
          ))}
        </ChipRail>

        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon3d="crown"
              title="No champions of that rarity"
              body="The realm keeps forging new legends. Widen the filter to see the whole roster."
              action={
                <Button variant="glass" size="md" onClick={() => setFilter("all")}>
                  Show all champions
                </Button>
              }
            />
          </Card>
        ) : (
          <BoardList label="Champion roster">
            {rows.map((champion) => {
              const unlocked = isUnlocked(champion.slug, champion.unlocked);
              return (
                <li key={champion.slug}>
                  <Link
                    href={`/war/champions/${champion.slug}`}
                    className={`${BOARD_LIST_ROW} transition-colors duration-fast ease-out-quint hover:bg-panel`}
                  >
                    <ArtTile
                      src={champion.art}
                      alt={champion.name}
                      icon="user"
                      locked={!unlocked}
                    />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={`truncate font-semibold ${BOARD_BODY} ${
                            unlocked ? "text-bone" : "text-bone-mut"
                          }`}
                        >
                          {champion.name}
                        </span>
                        <RarityChip rarity={champion.rarity} />
                      </span>
                      <span
                        className={`block truncate text-bone-faint ${BOARD_META}`}
                      >
                        {champion.house}, {champion.weapon}
                      </span>
                    </span>

                    {/* Two columns on a phone would squeeze the name out, so
                        health drops away below `sm` and attack, the number that
                        decides a fight, stays. No horizontal scroll, ever. */}
                    <span className="flex shrink-0 items-center gap-4 sm:gap-5">
                      <span className="w-14 text-right sm:w-16">
                        <span
                          className={`hidden uppercase tracking-[0.16em] text-bone-faint sm:block ${BOARD_META}`}
                        >
                          Attack
                        </span>
                        <span className={`tnum block text-bone ${BOARD_BODY}`}>
                          {champion.stats.attack.toLocaleString()}
                        </span>
                      </span>
                      <span className="hidden w-16 text-right sm:block">
                        <span
                          className={`block uppercase tracking-[0.16em] text-bone-faint ${BOARD_META}`}
                        >
                          Health
                        </span>
                        <span className={`tnum block text-bone ${BOARD_BODY}`}>
                          {champion.stats.health.toLocaleString()}
                        </span>
                      </span>
                    </span>

                    <Icon
                      name="chevron-right"
                      className="hidden h-4 w-4 shrink-0 text-bone-faint sm:block"
                    />
                  </Link>
                </li>
              );
            })}
          </BoardList>
        )}
      </BoardStack>
    </BoardPage>
  );
}
