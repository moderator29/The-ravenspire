"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

interface WarState {
  unlocked_champions: string[];
  gold: number;
  war_glory: number;
  battles: number;
  wins: number;
}

const openModes = [
  {
    href: "/war/prepare",
    icon: "swords",
    name: "Quick Battle",
    plain: "Instant skirmish",
    desc: "Pick a champion, cross blades, and settle it in minutes. Glory waits for no one.",
  },
  {
    href: "/war/champions",
    icon: "crown",
    name: "Champions",
    plain: "Your roster",
    desc: "Meet the heroes of the realm, from steady blades to living legends.",
  },
  {
    href: "/war/arsenal",
    icon: "shield",
    name: "The Arsenal",
    plain: "Weapons and gear",
    desc: "Legendary steel and the gear to carry it. Browse before you brawl.",
  },
  {
    href: "/war/rewards",
    icon: "medal",
    name: "Rewards & Progression",
    plain: "Tribute and mastery",
    desc: "Daily tribute, relic chests, the War Pass and champion mastery.",
  },
];

const lockedModes = [
  {
    icon: "scroll",
    name: "Campaign",
    plain: "Story battles",
    desc: "A long road of battles with a tale worth telling at the end.",
  },
  {
    icon: "medal",
    name: "Ranked",
    plain: "Ladder season",
    desc: "Climb the ladder, defend your rank, and let the realm keep score.",
  },
  {
    icon: "banner",
    name: "House War",
    plain: "House vs House",
    desc: "Six Houses, one field. March with your banner when the horns sound.",
  },
];

export default function WarPage() {
  const { ready, authenticated } = useRealmAuth();
  const [state, setState] = useState<WarState | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    void (async () => {
      const res = await realmFetch<{ state: WarState }>("/api/war/battle");
      if (res.ok && res.data?.state) setState(res.data.state);
    })();
  }, [ready, authenticated]);

  const chips = state
    ? [
        { label: "Gold", value: state.gold },
        { label: "War Glory", value: state.war_glory },
        { label: "Battles", value: state.battles },
        { label: "Wins", value: state.wins },
      ]
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="glass overflow-hidden">
        <div className="relative h-48 w-full sm:h-64 md:h-72">
          <img
            src="/game/lineup.png"
            alt="Champions of the realm standing in line for battle"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
            <h1 className="gold-text font-display text-3xl font-semibold sm:text-4xl">
              The War
            </h1>
            <p className="mt-1 text-sm text-bone-mut">Battle for the Realm</p>
          </div>
        </div>
      </div>

      {chips && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {chips.map((c) => (
            <div key={c.label} className="glass-sm px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-bone-faint">
                {c.label}
              </div>
              <div className="tnum mt-0.5 font-display text-xl font-semibold text-gold-bright">
                {c.value.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {ready && !authenticated && (
        <div className="glass-sm mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-bone-mut">
            Sign in to keep your gold, glory, and victories on the record.
          </p>
          <Link href="/signin" className="btn-gold px-4 py-2 text-xs">
            Enter the Realm
          </Link>
        </div>
      )}

      <h2 className="mt-8 font-display text-lg font-semibold text-bone">
        Choose your battlefield
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {openModes.map((m) => (
          <Link key={m.name} href={m.href} className="glass glass-hover block p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-panel-warm text-gold">
                <Icon name={m.icon} className="h-5 w-5" />
              </span>
              <div>
                <div className="font-display text-base font-semibold text-bone">
                  {m.name}
                </div>
                <div className="text-xs text-bone-faint">{m.plain}</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-bone-mut">{m.desc}</p>
          </Link>
        ))}
        {lockedModes.map((m) => (
          <div key={m.name} className="glass p-5 opacity-70">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-panel text-bone-faint">
                <Icon name={m.icon} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-semibold text-bone">
                    {m.name}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-steel-line bg-panel px-2 py-0.5 text-[10px] uppercase tracking-wide text-gold">
                    <Icon name="lock" className="h-3 w-3" />
                    Soon
                  </span>
                </div>
                <div className="text-xs text-bone-faint">{m.plain}</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-bone-mut">{m.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
