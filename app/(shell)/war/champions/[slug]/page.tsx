"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { RarityChip } from "@/components/ui/badge";
import { Tab, Tabs, TabsList, TabsPanel } from "@/components/ui/tabs";
import { BackButton } from "@/components/shell/back-button";
import {
  ChampionStats,
  WarPage as WarFrame,
  WAR_META,
} from "@/components/war/war-chrome";
import { champions } from "@/lib/game/champions";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* A single champion.

   Archetype: Dossier. Hero band, then tabs, then panels, always that order.
   The hero is the one place a Dossier may borrow the Forge register, so the
   portrait and the gold name live there and every panel below is flat Ledger.

   Three genuinely different views of one subject, each worth its own panel, is
   exactly the underline tab case from section 3 of the design system. It also
   fixes the old page, which stacked stats, abilities and lore into one long
   scroll that buried the lore nobody could reach on a phone. */

export default function ChampionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { ready, authenticated } = useRealmAuth();
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

  const champion = champions.find((c) => c.slug === slug);

  if (!champion) {
    return (
      <WarFrame width="narrow">
        <div className="flex">
          <BackButton href="/war/champions" label="All champions" />
        </div>
        <Card>
          <EmptyState
            icon3d="search"
            title="No such champion"
            body="The heralds have no record of this hero. The name may have been miscopied by a sleepy scribe."
            action={
              <Button
                variant="glass"
                size="md"
                render={<Link href="/war/champions" />}
              >
                Back to the roster
              </Button>
            }
          />
        </Card>
      </WarFrame>
    );
  }

  /* Before the server answers there is nothing honest to say about what you
     own, so the catalog's own default stands in rather than a guess. */
  const unlocked = unlockedSlugs
    ? unlockedSlugs.includes(champion.slug)
    : champion.unlocked;

  return (
    <WarFrame width="board">
      {/* Sized to its label: bare in a `flex-col` it would stretch. */}
      <div className="flex">
        <BackButton href="/war/champions" label="All champions" />
      </div>

      {/* The hero band. */}
      <Card pad="none" className="overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          <div className="relative h-52 w-full shrink-0 bg-void sm:h-auto sm:w-48 lg:w-56">
            {champion.art ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={champion.art}
                alt={champion.name}
                className={`absolute inset-0 h-full w-full object-cover object-top ${
                  unlocked ? "" : "opacity-40 grayscale"
                }`}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Icon name="user" className="h-12 w-12 text-bone-faint" />
              </div>
            )}
            {/* The art fades into the plate rather than ending on a hard
                edge, so the band reads as one surface at every width. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-obsidian/85 via-transparent to-transparent sm:bg-gradient-to-r sm:from-transparent sm:via-transparent sm:to-obsidian/70"
            />
            {!unlocked ? (
              <span className="absolute inset-0 flex items-center justify-center text-gold">
                <Icon name="lock" className="h-7 w-7" />
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="gold-text font-display text-2xl font-semibold sm:text-3xl">
                {champion.name}
              </h1>
              <RarityChip rarity={champion.rarity} />
            </div>
            <p className="mt-1 text-sm text-bone-mut">{champion.title}</p>
            <p className={`mt-2 text-bone-faint ${WAR_META}`}>
              {champion.house}, {champion.weapon} ({champion.weaponClass})
            </p>

            <div className="mt-4">
              {unlocked ? (
                <Button
                  variant="gold"
                  size="lg"
                  className="w-full sm:w-auto"
                  render={
                    <Link href={`/war/battle?champion=${champion.slug}`} />
                  }
                >
                  <Icon name="swords" className="h-4 w-4" />
                  Deploy to battle
                </Button>
              ) : (
                <Card
                  variant="inset"
                  pad="sm"
                  className="flex items-start gap-2.5"
                >
                  <Icon
                    name="lock"
                    className="mt-0.5 h-4 w-4 shrink-0 text-gold"
                  />
                  <p className="text-xs text-bone-mut">
                    This champion has not yet sworn to your banner. Heroes are
                    earned through play, won with Glory, or claimed as the
                    Season unfolds.
                  </p>
                </Card>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Then the tabs, then the panels. */}
      <Tabs defaultValue="stats">
        <TabsList>
          <Tab value="stats">Battle stats</Tab>
          <Tab value="abilities">Abilities</Tab>
          <Tab value="lore">Lore</Tab>
        </TabsList>

        <TabsPanel value="stats" className="pt-4">
          <Card>
            <ChampionStats stats={champion.stats} />
            <p className={`mt-4 text-bone-faint ${WAR_META}`}>
              Each bar is drawn against the strongest champion in the realm.
            </p>
          </Card>
        </TabsPanel>

        <TabsPanel value="abilities" className="pt-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Ability
              icon="eye"
              iconClass="text-gold"
              kind="Passive"
              name={champion.passive.name}
              desc={champion.passive.desc}
            />
            <Ability
              icon="flame"
              iconClass="text-ember"
              kind="Ultimate"
              name={champion.ultimate.name}
              desc={champion.ultimate.desc}
            />
          </div>
        </TabsPanel>

        <TabsPanel value="lore" className="pt-4">
          <Card>
            <p className="max-w-[68ch] text-sm leading-relaxed text-bone-mut">
              {champion.lore}
            </p>
          </Card>
        </TabsPanel>
      </Tabs>
    </WarFrame>
  );
}

function Ability({
  icon,
  iconClass,
  kind,
  name,
  desc,
}: {
  icon: string;
  iconClass: string;
  kind: string;
  name: string;
  desc: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Icon name={icon} className={`h-4 w-4 ${iconClass}`} />
        <span
          className={`uppercase tracking-[0.16em] text-bone-faint ${WAR_META}`}
        >
          {kind}
        </span>
      </div>
      <p className="mt-1.5 font-display text-sm font-semibold text-gold-bright">
        {name}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-bone-mut">{desc}</p>
    </Card>
  );
}
