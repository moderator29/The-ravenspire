"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, RarityChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { useDelayedLoading } from "@/components/ui/skeleton";
import {
  ArtTile,
  Board,
  BoardSkeleton,
  ChampionStats,
  WarHeader,
  WarPage as WarFrame,
  WAR_BODY,
  WAR_META,
  WAR_ROW,
} from "@/components/war/war-chrome";
import { champions } from "@/lib/game/champions";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* Choosing a champion and a ground.

   Archetype: Board, twice. Both halves of this page are a set of options being
   compared before one is picked, which is exactly what a Board is for, so the
   roster is dense scannable rows rather than the horizontally scrolling
   portrait carousel it used to be. That carousel hid everything past the third
   champion on a phone and gave no way to compare the numbers that decide the
   fight.

   Ornament budget zero. The march button is the only gold on the page, which
   is what makes it read as the thing to press. */

interface WarState {
  unlocked_champions: string[];
  gold: number;
  war_glory: number;
  battles: number;
  wins: number;
  chests: number;
  mastery: Record<string, number>;
}

const battlefields = [
  {
    slug: "river-crossing",
    name: "River Crossing",
    desc: "A scorched riverbank under a black castle",
    icon: "banner",
  },
  {
    slug: "castle-siege",
    name: "Castle Siege",
    desc: "Walls to break and walls to hold",
    icon: "wall",
  },
  {
    slug: "snow-valley",
    name: "Snow Valley",
    desc: "Cold that bites before blades do",
    icon: "orb",
  },
  {
    slug: "dark-fortress",
    name: "Dark Fortress",
    desc: "No dawn reaches these stones",
    icon: "eye",
  },
];

export default function BattlePreparePage() {
  const { ready, authenticated } = useRealmAuth();
  const [state, setState] = useState<WarState | null>(null);
  const [loading, setLoading] = useState(true);
  const [championSlug, setChampionSlug] = useState<string | null>(null);
  const [field, setField] = useState(battlefields[0].slug);
  const showSkeleton = useDelayedLoading(loading);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      setLoading(false);
      return;
    }
    let live = true;
    void (async () => {
      const res = await realmFetch<{ state: WarState }>("/api/war/battle");
      if (!live) return;
      if (res.ok && res.data?.state) setState(res.data.state);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [ready, authenticated]);

  /* What the server says you have sworn, and the catalog's own starter roster
     when it has not answered yet. Nothing here is invented: both lists are
     real, one is just narrower than the other. */
  const roster = useMemo(() => {
    if (state) {
      const unlocked = new Set(state.unlocked_champions);
      const owned = champions.filter((c) => unlocked.has(c.slug));
      if (owned.length > 0) return owned;
    }
    return champions.filter((c) => c.unlocked);
  }, [state]);

  const selected = roster.find((c) => c.slug === championSlug) ?? roster[0];
  const ground = battlefields.find((b) => b.slug === field) ?? battlefields[0];

  return (
    <WarFrame width="board">
      <WarHeader
        title="Prepare for battle"
        kicker="Choose your champion, pick your ground, then march"
        backHref="/war"
        backLabel="The War"
      />

      <SectionHeader
        title="Your champion"
        hint={
          roster.length > 0
            ? `${roster.length} ready to march`
            : undefined
        }
      />

      {showSkeleton ? (
        <BoardSkeleton rows={4} />
      ) : !selected ? (
        <Card>
          <EmptyState
            icon3d="oath-scroll"
            title="No champion has sworn to you yet"
            body="Open a relic chest or win a battle and the first hero of your banner will answer."
            action={
              <Button
                variant="glass"
                size="md"
                render={<Link href="/war/rewards" />}
              >
                Rewards and progression
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Board label="Champions ready to march">
            {roster.map((c) => {
              const isSelected = c.slug === selected.slug;
              const mastery = state?.mastery?.[c.slug];
              return (
                <li key={c.slug}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setChampionSlug(c.slug)}
                    className={`${WAR_ROW} w-full border-l-2 text-left transition-colors duration-fast ease-out-quint hover:bg-panel ${
                      isSelected
                        ? "border-l-gold bg-panel-warm/40"
                        : "border-l-transparent"
                    }`}
                  >
                    <ArtTile src={c.art} alt={c.name} icon="user" />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={`truncate font-semibold text-bone ${WAR_BODY}`}
                        >
                          {c.name}
                        </span>
                        <RarityChip rarity={c.rarity} />
                        {typeof mastery === "number" && mastery > 0 ? (
                          <Badge variant="gold" icon="medal">
                            Mastery {mastery}
                          </Badge>
                        ) : null}
                      </span>
                      <span
                        className={`block truncate text-bone-faint ${WAR_META}`}
                      >
                        {c.title}, {c.weapon}
                      </span>
                    </span>

                    <span className="w-14 shrink-0 text-right sm:w-16">
                      <span
                        className={`hidden uppercase tracking-[0.16em] text-bone-faint sm:block ${WAR_META}`}
                      >
                        Attack
                      </span>
                      <span className={`tnum block text-bone ${WAR_BODY}`}>
                        {c.stats.attack.toLocaleString()}
                      </span>
                    </span>

                    <Icon
                      name="check"
                      aria-hidden
                      className={`h-4 w-4 shrink-0 ${
                        isSelected ? "text-gold" : "text-transparent"
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </Board>

          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-base font-semibold text-bone">
                {selected.name}
              </p>
              <RarityChip rarity={selected.rarity} />
            </div>
            <p className={`mt-0.5 text-bone-faint ${WAR_META}`}>
              {selected.title}, {selected.weapon}
            </p>
            <ChampionStats stats={selected.stats} className="mt-4" />
          </Card>
        </>
      )}

      {/* The hint slot is a count or a short state, not prose. `ground.desc`
          is a sentence, and SectionHeader lays heading, hint and hairline on
          one row with nothing holding the heading's width, so at 390px the
          sentence squeezed "The battlefield" until it broke across two lines
          and ran into the hint. Measured from the heading's own line boxes.
          The description already sits on each battlefield card, so the slot
          carries the name of the ground you have actually chosen. */}
      <SectionHeader title="The battlefield" hint={ground.name} />

      <div
        role="group"
        aria-label="Battlefield"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {battlefields.map((b) => {
          const isSelected = b.slug === field;
          return (
            <Card
              key={b.slug}
              interactive
              pad="none"
              render={<button type="button" />}
              aria-pressed={isSelected}
              onClick={() => setField(b.slug)}
              className={`w-full border-l-2 p-4 text-left ${
                isSelected
                  ? "border-l-gold bg-panel-warm/40"
                  : "border-l-transparent"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                    isSelected
                      ? "bg-panel-warm text-gold"
                      : "bg-panel text-bone-faint"
                  }`}
                >
                  <Icon name={b.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[15px] font-semibold text-bone">
                    {b.name}
                  </p>
                  <p className="truncate text-xs text-bone-mut">{b.desc}</p>
                </div>
                <Icon
                  name="check"
                  aria-hidden
                  className={`h-4 w-4 shrink-0 ${
                    isSelected ? "text-gold" : "text-transparent"
                  }`}
                />
              </div>
            </Card>
          );
        })}
      </div>

      {selected ? (
        <Button
          variant="gold"
          size="lg"
          className="w-full sm:w-auto sm:self-start"
          render={
            <Link
              href={`/war/battle?champion=${selected.slug}&field=${field}`}
            />
          }
        >
          <Icon name="swords" className="h-4 w-4" />
          March to battle
        </Button>
      ) : null}
    </WarFrame>
  );
}
