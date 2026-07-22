"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { champions } from "@/lib/game/champions";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

const statMax = {
  attack: 3800,
  defense: 1600,
  health: 14000,
  speed: 500,
} as const;

const statLabels: { key: keyof typeof statMax; label: string }[] = [
  { key: "attack", label: "Attack" },
  { key: "defense", label: "Defense" },
  { key: "health", label: "Health" },
  { key: "speed", label: "Speed" },
];

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
    void (async () => {
      const res = await realmFetch<{ state: { unlocked_champions: string[] } }>(
        "/api/war/battle"
      );
      if (res.ok && res.data?.state?.unlocked_champions) {
        setUnlockedSlugs(res.data.state.unlocked_champions);
      }
    })();
  }, [ready, authenticated]);

  const champion = champions.find((c) => c.slug === slug);

  if (!champion) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-bone">
          No such champion
        </h1>
        <p className="mt-3 text-sm text-bone-mut">
          The heralds have no record of this hero. Perhaps the name was
          miscopied by a sleepy scribe.
        </p>
        <Link
          href="/war/champions"
          className="btn-glass mt-6 inline-flex px-5 py-2 text-sm"
        >
          Back to the Collection
        </Link>
      </div>
    );
  }

  const unlocked = unlockedSlugs
    ? unlockedSlugs.includes(champion.slug)
    : champion.unlocked;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <BackButton href="/war/champions" label="All champions" />

      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,320px)_1fr]">
        <div
          className={`rarity-${champion.rarity} rarity-frame glass overflow-hidden`}
        >
          <div className="relative aspect-[3/4] w-full">
            {champion.art ? (
              <img
                src={champion.art}
                alt={champion.name}
                className={`absolute inset-0 h-full w-full object-cover ${
                  unlocked ? "" : "opacity-40"
                }`}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-void">
                <Icon name="user" className="h-16 w-16 text-bone-faint" />
              </div>
            )}
            {!unlocked && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-obsidian/70 text-gold">
                  <Icon name="lock" className="h-6 w-6" />
                </span>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="gold-text font-display text-3xl font-semibold">
              {champion.name}
            </h1>
            <span
              className={`rarity-${champion.rarity} rarity-chip capitalize`}
            >
              {champion.rarity}
            </span>
          </div>
          <p className="mt-1 text-sm text-bone-mut">{champion.title}</p>
          <p className="mt-2 text-xs text-bone-faint">
            {champion.house} · {champion.weapon} ({champion.weaponClass})
          </p>

          <div className="glass-sm mt-5 p-4">
            <h2 className="text-[11px] uppercase tracking-wide text-bone-faint">
              Battle stats
            </h2>
            <div className="mt-3 space-y-3">
              {statLabels.map(({ key, label }) => {
                const value = champion.stats[key];
                const pct = Math.min(100, Math.round((value / statMax[key]) * 100));
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-bone-mut">{label}</span>
                      <span className="tnum text-bone">
                        {value.toLocaleString()}
                      </span>
                    </div>
                    <div className="bar-track mt-1">
                      <div className="bar-gold" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            {unlocked ? (
              <Link
                href={`/war/battle?champion=${champion.slug}`}
                className="btn-gold inline-flex items-center gap-2 px-6 py-2.5 text-sm"
              >
                <Icon name="swords" className="h-4 w-4" />
                Deploy to Battle
              </Link>
            ) : (
              <div className="glass-sm flex items-start gap-3 p-4">
                <Icon name="lock" className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
                <p className="text-sm text-bone-mut">
                  This champion has not yet sworn to your banner. Heroes are
                  earned through play, won with Glory, or claimed as the Season
                  unfolds.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="glass mt-5 p-5">
        <h2 className="font-display text-lg font-semibold text-bone">
          Abilities
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="flex items-center gap-2">
              <Icon name="eye" className="h-4 w-4 text-gold" />
              <span className="text-[11px] uppercase tracking-wide text-bone-faint">
                Passive
              </span>
            </div>
            <div className="mt-1 font-display text-sm font-semibold text-gold-bright">
              {champion.passive.name}
            </div>
            <p className="mt-1 text-sm text-bone-mut">{champion.passive.desc}</p>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Icon name="flame" className="h-4 w-4 text-ember" />
              <span className="text-[11px] uppercase tracking-wide text-bone-faint">
                Ultimate
              </span>
            </div>
            <div className="mt-1 font-display text-sm font-semibold text-gold-bright">
              {champion.ultimate.name}
            </div>
            <p className="mt-1 text-sm text-bone-mut">
              {champion.ultimate.desc}
            </p>
          </div>
        </div>
      </div>

      <div className="glass mt-5 p-5">
        <h2 className="font-display text-lg font-semibold text-bone">Lore</h2>
        <p className="mt-2 text-sm leading-relaxed text-bone-mut">
          {champion.lore}
        </p>
      </div>
    </div>
  );
}
