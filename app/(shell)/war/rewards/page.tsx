"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { useDelayedLoading } from "@/components/ui/skeleton";
import { Ceremony } from "@/components/realm/ceremony";
import {
  ArtTile,
  Board,
  BoardSkeleton,
  StatBar,
  StatStrip,
  StatStripSkeleton,
  WarHeader,
  WarPage as WarFrame,
  WAR_BODY,
  WAR_META,
  WAR_ROW,
} from "@/components/war/war-chrome";
import { champions } from "@/lib/game/champions";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* Tribute, chests and mastery.

   Archetype: Console. Dense figures and the controls that act on them, in the
   same view, which is the definition in section 2. Compact density above `md`,
   44px touch targets below it.

   One Forge moment, and it is the chest. Section 2 names chest opening in the
   Ceremony list by hand, and it is the only thing on this page where the realm
   gives you something you did not already know you had.

   What is gone: a six rung "War Pass" ladder with hardcoded Glory thresholds
   and a line promising the rewards were "honored automatically". Nothing on
   the server knows about those tiers, so every rung of it was invented. The
   panel that replaces it says the pass has not opened, which is true.

   Every number on this page is read from /api/war/rewards state. Gold, Glory,
   chests and mastery all settle server side; the upgrade price is mirrored
   here only so the button can name it, and the server is what enforces it. */

interface WarState {
  unlocked_champions: string[];
  gold: number;
  war_glory: number;
  battles: number;
  wins: number;
  chests: number;
  last_daily: string | null;
  mastery: Record<string, number>;
}

const MASTERY_CAP = 10;
const UPGRADE_BASE_COST = 120;
const UPGRADE_STEP = 60;

export default function RewardsPage() {
  const { ready, authenticated } = useRealmAuth();
  const [state, setState] = useState<WarState | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [chestResult, setChestResult] = useState<{
    gold: number;
    unlocked: string | null;
  } | null>(null);
  const showSkeleton = useDelayedLoading(loading);

  const load = useCallback(async () => {
    const res = await realmFetch<{ state: WarState }>("/api/war/battle");
    if (res.data?.state) setState(res.data.state);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      setLoading(false);
      return;
    }
    void load();
  }, [ready, authenticated, load]);

  /* `key` names the control that is working, so only the button that was
     pressed shows a spinner instead of every button on the page. */
  const act = async (key: string, json: Record<string, unknown>) => {
    if (pending) return null;
    setPending(key);
    setMsg(null);
    const res = await realmFetch<{ error?: string } & Record<string, unknown>>(
      "/api/war/rewards",
      { method: "POST", json }
    );
    setPending(null);
    if (!res.ok) {
      setMsg((res.data?.error as string) ?? "The vault stayed shut. Try again.");
      return null;
    }
    await load();
    return res.data;
  };

  if (ready && !authenticated) {
    return (
      <WarFrame width="narrow">
        <WarHeader
          title="Rewards and progression"
          kicker="Tribute, chests, mastery"
          backHref="/war"
          backLabel="The War"
        />
        <Card>
          <EmptyState
            icon="coin"
            title="Nothing is being kept for you yet"
            body="Tribute, relic chests and champion mastery all settle against your name once you enter the realm."
            action={
              <Button variant="gold" size="md" render={<Link href="/signin" />}>
                Enter the realm
              </Button>
            }
          />
        </Card>
      </WarFrame>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const dailyClaimed = state?.last_daily === today;
  const chests = state?.chests ?? 0;
  const gold = state?.gold ?? 0;
  const roster = champions.filter((c) =>
    state?.unlocked_champions.includes(c.slug)
  );
  const chestChampion = chestResult?.unlocked
    ? champions.find((c) => c.slug === chestResult.unlocked)
    : undefined;

  return (
    <WarFrame width="board">
      <WarHeader
        title="Rewards and progression"
        kicker="Tribute, chests, mastery"
        backHref="/war"
        backLabel="The War"
      />

      {showSkeleton ? (
        <StatStripSkeleton />
      ) : state ? (
        <StatStrip
          stats={[
            { label: "Gold", value: state.gold, icon: "coin" },
            { label: "War Glory", value: state.war_glory, icon: "medal" },
            { label: "Chests", value: state.chests, icon: "lock" },
            { label: "Victories", value: state.wins, icon: "crown" },
          ]}
        />
      ) : null}

      {msg ? (
        <Card variant="inset" pad="sm">
          <p role="alert" className="text-xs text-state-danger">
            {msg}
          </p>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-bone">
              Daily tribute
            </h2>
            <p className={`mt-0.5 text-bone-mut ${WAR_META}`}>
              Sixty gold and ten Glory each day you return, and a relic chest
              each Sunday.
            </p>
          </div>
          <Button
            variant="gold"
            size="md"
            loading={pending === "daily"}
            disabled={Boolean(pending) || dailyClaimed || !state}
            onClick={() => void act("daily", { action: "daily" })}
          >
            {dailyClaimed ? "Claimed today" : "Claim"}
          </Button>
        </div>
      </Card>

      <Card variant="warm">
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/game/gear/relic-chest.png"
            alt=""
            className="h-16 w-16 rounded-md border border-gold/30 object-cover"
          />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-semibold text-bone">
              Relic chest
            </h2>
            <p className={`mt-0.5 text-bone-mut ${WAR_META}`}>
              Gold always. Sometimes, a champion answers the call.
            </p>
          </div>
          <Button
            variant="gold"
            size="md"
            loading={pending === "chest"}
            disabled={Boolean(pending) || chests < 1}
            onClick={() =>
              void act("chest", { action: "open_chest" }).then((d) => {
                if (d)
                  setChestResult({
                    gold: Number(d.gold ?? 0),
                    unlocked: (d.unlocked as string | null) ?? null,
                  });
              })
            }
          >
            {chests > 0 ? `Open (${chests})` : "No chests"}
          </Button>
        </div>
      </Card>

      {/* The pass ladder is not live. Saying so is the honest empty state; the
          six invented tiers that used to sit here were not. */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-base font-semibold text-bone-mut">
            The War Pass
          </h2>
          <Badge variant="beta" icon="lock">
            Soon
          </Badge>
        </div>
        <p className={`mt-1.5 text-bone-mut ${WAR_META}`}>
          The pass has not opened. Your War Glory is counted from every battle
          you fight, and the ladder will be posted when the Season begins.
        </p>
      </Card>

      <SectionHeader
        title="Champion mastery"
        hint={
          state ? `${gold.toLocaleString()} gold in your purse` : undefined
        }
      />

      {showSkeleton ? (
        <BoardSkeleton rows={3} />
      ) : roster.length === 0 ? (
        <Card>
          <EmptyState
            icon="crown"
            title="No champion has sworn to you yet"
            body="Open a relic chest and the first hero of your banner will answer. Mastery is forged after that."
          />
        </Card>
      ) : (
        <Board label="Champion mastery">
          {roster.map((c) => {
            const level = state?.mastery?.[c.slug] ?? 0;
            const cost = UPGRADE_BASE_COST + level * UPGRADE_STEP;
            const capped = level >= MASTERY_CAP;
            const affordable = gold >= cost;
            return (
              <li key={c.slug} className={`${WAR_ROW} flex-wrap`}>
                <ArtTile src={c.art} alt={c.name} icon="user" />

                <div className="min-w-0 flex-1">
                  <p className={`truncate font-semibold text-bone ${WAR_BODY}`}>
                    {c.name}
                  </p>
                  <StatBar
                    className="mt-1 max-w-xs"
                    label="Mastery"
                    value={level}
                    max={MASTERY_CAP}
                  />
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Button
                    variant={capped ? "ghost" : "gold"}
                    size="sm"
                    loading={pending === `upgrade:${c.slug}`}
                    disabled={Boolean(pending) || capped || !affordable}
                    aria-label={
                      capped
                        ? `${c.name} mastery is at its peak`
                        : `Upgrade ${c.name} mastery for ${cost} gold`
                    }
                    onClick={() =>
                      void act(`upgrade:${c.slug}`, {
                        action: "upgrade",
                        champion: c.slug,
                      })
                    }
                  >
                    {capped ? "At its peak" : "Upgrade"}
                  </Button>
                  {capped ? null : (
                    <span
                      className={`tnum ${WAR_META} ${
                        affordable ? "text-bone-faint" : "text-ember"
                      }`}
                    >
                      {cost.toLocaleString()} gold
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </Board>
      )}

      <p className={`px-1 text-bone-faint ${WAR_META}`}>
        Gold, Glory and mastery settle on the server against the battles you
        actually fought.
      </p>

      {/* The chest is the one Forge moment on this page. */}
      <Ceremony
        open={chestResult !== null}
        onClose={() => setChestResult(null)}
        icon="chest"
        eyebrow="The lid gives way"
        title={chestChampion ? "A champion answers" : "The chest opens"}
        figure={`+${(chestResult?.gold ?? 0).toLocaleString()}`}
        figureLabel="Gold"
        {...(chestChampion
          ? { body: `${chestChampion.name} joins your banner.` }
          : {})}
        {...(chestChampion
          ? {
              action: {
                label: `See ${chestChampion.name}`,
                href: `/war/champions/${chestChampion.slug}`,
              },
            }
          : {})}
      />
    </WarFrame>
  );
}
