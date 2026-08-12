"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { useDelayedLoading } from "@/components/ui/skeleton";
import {
  StatStrip,
  StatStripSkeleton,
  WarHeader,
  WarPage as WarFrame,
} from "@/components/war/war-chrome";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* The War, its front door.

   Archetype: Dossier. A hero band, then panels, always that order. The hero is
   the one place in a Dossier where the Forge register is allowed, so the
   lineup art and the gold title live there and every panel below it is flat
   Ledger. There are no tabs because there is only one subject, The War itself.

   Real data only: the standing strip renders your actual gold, Glory, battles
   and wins, or nothing at all. It never shows a zero it has not read. */

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
    name: "Rewards and Progression",
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
  const [loading, setLoading] = useState(true);
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

  return (
    <WarFrame width="wide">
      <WarHeader title="The War" kicker="Battle for the realm" backHref="/home" />

      {/* The hero band. The one Forge moment on this page. */}
      <Card pad="none" className="overflow-hidden">
        <div className="relative h-40 w-full sm:h-56 lg:h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/game/lineup.png"
            alt="Champions of the realm standing in line for battle"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
            <p className="gold-text font-display text-2xl font-semibold sm:text-3xl">
              Break the enemy host
            </p>
            <p className="mt-1 text-sm text-bone-mut">
              Every foe felled is Glory, and Glory is kept.
            </p>
          </div>
        </div>
      </Card>

      {showSkeleton ? (
        <StatStripSkeleton />
      ) : state ? (
        <StatStrip
          stats={[
            { label: "Gold", value: state.gold, icon: "coin" },
            { label: "War Glory", value: state.war_glory, icon: "medal" },
            { label: "Battles", value: state.battles, icon: "swords" },
            { label: "Wins", value: state.wins, icon: "crown" },
          ]}
        />
      ) : ready && !authenticated ? (
        <Card>
          <EmptyState
            size="sm"
            icon="user"
            title="Your record is not being kept"
            body="Enter the realm and every battle banks gold, Glory and victories against your name."
            action={
              <Button
                variant="gold"
                size="md"
                render={<Link href="/signin" />}
              >
                Enter the realm
              </Button>
            }
          />
        </Card>
      ) : null}

      <SectionHeader title="Choose your battlefield" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {openModes.map((mode) => (
          <Card
            key={mode.name}
            interactive
            pad="none"
            render={<Link href={mode.href} />}
            className="block p-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-panel-warm text-gold">
                <Icon name={mode.icon} className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-semibold text-bone">
                  {mode.name}
                </p>
                <p className="truncate text-xs text-bone-faint">{mode.plain}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-bone-mut">{mode.desc}</p>
          </Card>
        ))}

        {/* A battlefield you cannot enter is structurally lower energy than one
            you can, per section 5. `raised` is the flat plate: no backdrop
            blur, no gold wash, a steel hairline and the quiet `edge` light.
            Before this both sets were the same lit chassis, so the four modes
            that are actually open competed for attention with the three that
            are not, and only a small badge told them apart. */}
        {lockedModes.map((mode) => (
          <Card key={mode.name} variant="raised" pad="none" className="p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-panel text-bone-faint">
                <Icon name={mode.icon} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-display text-[15px] font-semibold text-bone-mut">
                    {mode.name}
                  </p>
                  <Badge variant="beta" icon="lock">
                    Soon
                  </Badge>
                </div>
                <p className="truncate text-xs text-bone-faint">{mode.plain}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-bone-mut">{mode.desc}</p>
          </Card>
        ))}
      </div>
    </WarFrame>
  );
}
