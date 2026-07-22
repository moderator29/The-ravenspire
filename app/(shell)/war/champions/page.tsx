"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { champions, type Rarity } from "@/lib/game/champions";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

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
    void (async () => {
      const res = await realmFetch<{ state: { unlocked_champions: string[] } }>(
        "/api/war/battle"
      );
      if (res.ok && res.data?.state?.unlocked_champions) {
        setUnlockedSlugs(res.data.state.unlocked_champions);
      }
    })();
  }, [ready, authenticated]);

  const isUnlocked = (slug: string, fallback: boolean) =>
    unlockedSlugs ? unlockedSlugs.includes(slug) : fallback;

  const withArt = useMemo(
    () =>
      champions.filter(
        (c) => c.art && (filter === "all" || c.rarity === filter)
      ),
    [filter]
  );
  const hiddenCount = useMemo(
    () =>
      champions.filter(
        (c) => !c.art && (filter === "all" || c.rarity === filter)
      ).length,
    [filter]
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4">
        <BackButton href="/war" />
      </div>
      <h1 className="gold-text font-display text-3xl font-semibold">
        Champions
      </h1>
      <p className="mt-1 text-sm text-bone-mut">
        Your collection of heroes. Some march at your word, others still wait to
        be won.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={
              filter === f.key
                ? "btn-gold px-4 py-1.5 text-xs"
                : "btn-glass px-4 py-1.5 text-xs text-bone-mut"
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {withArt.length === 0 && hiddenCount === 0 ? (
        <div className="glass mt-6 p-8 text-center">
          <p className="text-sm text-bone-mut">
            No champions of that rarity yet. The realm keeps forging new
            legends, so check back soon.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {withArt.map((c) => {
            const unlocked = isUnlocked(c.slug, c.unlocked);
            return (
              <Link
                key={c.slug}
                href={`/war/champions/${c.slug}`}
                className={`rarity-${c.rarity} rarity-frame glass-sm glass-hover block overflow-hidden`}
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden">
                  <img
                    src={c.art}
                    alt={c.name}
                    className={`absolute inset-0 h-full w-full object-cover ${
                      unlocked ? "" : "opacity-40"
                    }`}
                  />
                  {!unlocked && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-obsidian/70 text-gold">
                        <Icon name="lock" className="h-5 w-5" />
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="truncate font-display text-sm font-semibold text-bone">
                    {c.name}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-bone-faint">
                    {c.weapon}
                  </div>
                </div>
              </Link>
            );
          })}
          {hiddenCount > 0 && (
            <div className="glass-sm flex flex-col items-center justify-center p-4 text-center">
              <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl bg-void">
                <Icon name="lock" className="h-6 w-6 text-bone-faint" />
              </div>
              <div className="tnum mt-3 font-display text-sm font-semibold text-bone">
                +{hiddenCount} more heroes
              </div>
              <div className="mt-0.5 text-xs text-bone-faint">
                Their portraits are still at the painter
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
