"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { champions } from "@/lib/game/champions";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

interface WarState {
  unlocked_champions: string[];
  gold: number;
  war_glory: number;
  battles: number;
  wins: number;
  chests: number;
  mastery: Record<string, number>;
}

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
  const [championSlug, setChampionSlug] = useState<string | null>(null);
  const [field, setField] = useState(battlefields[0].slug);

  useEffect(() => {
    if (!ready || !authenticated) return;
    void (async () => {
      const res = await realmFetch<{ state: WarState }>("/api/war/battle");
      if (res.ok && res.data?.state) setState(res.data.state);
    })();
  }, [ready, authenticated]);

  const roster = useMemo(() => {
    if (state) {
      const unlocked = new Set(state.unlocked_champions);
      const owned = champions.filter((c) => unlocked.has(c.slug));
      if (owned.length > 0) return owned;
    }
    return champions.filter((c) => c.unlocked);
  }, [state]);

  const selected =
    roster.find((c) => c.slug === championSlug) ?? roster[0];
  const mastery = state?.mastery?.[selected.slug];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <BackButton href="/war" label="The War" />

      <h1 className="gold-text mt-3 font-display text-3xl font-semibold">
        Prepare for Battle
      </h1>
      <p className="mt-1 text-sm text-bone-mut">
        Choose your champion, pick your ground, then march.
      </p>

      <h2 className="mt-6 font-display text-lg font-semibold text-bone">
        Your champion
      </h2>
      <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2">
        {roster.map((c) => {
          const isSelected = c.slug === selected.slug;
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => setChampionSlug(c.slug)}
              aria-pressed={isSelected}
              className={`rarity-${c.rarity} rarity-frame glass-sm w-28 shrink-0 overflow-hidden text-left transition ${
                isSelected
                  ? "border-gold/60"
                  : "opacity-80 hover:opacity-100"
              }`}
            >
              <div className="relative aspect-[3/4] w-full bg-void">
                {c.art ? (
                  <img
                    src={c.art}
                    alt={c.name}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon name="user" className="h-8 w-8 text-bone-faint" />
                  </div>
                )}
                {isSelected && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-obsidian/80 text-gold">
                    <Icon name="swords" className="h-3 w-3" />
                  </span>
                )}
              </div>
              <div className="px-2 py-1.5">
                <div className="truncate text-xs font-semibold text-bone">
                  {c.name}
                </div>
                <div className="truncate text-[10px] capitalize text-bone-faint">
                  {c.rarity}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="glass-sm mt-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-base font-semibold text-bone">
            {selected.name}
          </span>
          <span className={`rarity-${selected.rarity} rarity-chip capitalize`}>
            {selected.rarity}
          </span>
          {typeof mastery === "number" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gold">
              <Icon name="medal" className="h-3 w-3" />
              Mastery {mastery}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-bone-faint">
          {selected.title} · {selected.weapon}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {statLabels.map(({ key, label }) => {
            const value = selected.stats[key];
            const pct = Math.min(
              100,
              Math.round((value / statMax[key]) * 100)
            );
            return (
              <div key={key}>
                <div className="flex items-center justify-between text-[11px]">
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

      <h2 className="mt-8 font-display text-lg font-semibold text-bone">
        The battlefield
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {battlefields.map((b) => {
          const isSelected = b.slug === field;
          return (
            <button
              key={b.slug}
              type="button"
              onClick={() => setField(b.slug)}
              aria-pressed={isSelected}
              className={`glass glass-hover p-4 text-left transition ${
                isSelected ? "border-gold/60" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isSelected
                      ? "bg-panel-warm text-gold"
                      : "bg-panel text-bone-faint"
                  }`}
                >
                  <Icon name={b.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-base font-semibold text-bone">
                    {b.name}
                  </div>
                  <div className="truncate text-xs text-bone-mut">{b.desc}</div>
                </div>
                {isSelected && (
                  <Icon name="flag" className="h-4 w-4 shrink-0 text-gold" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        <Link
          href={`/war/battle?champion=${selected.slug}&field=${field}`}
          className="btn-gold inline-flex w-full items-center justify-center gap-2 px-6 py-3 text-sm sm:w-auto"
        >
          <Icon name="swords" className="h-4 w-4" />
          March to battle
        </Link>
      </div>
    </div>
  );
}
