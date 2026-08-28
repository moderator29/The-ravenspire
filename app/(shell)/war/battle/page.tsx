"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Ceremony } from "@/components/realm/ceremony";
import { BackButton } from "@/components/shell/back-button";
import {
  BOARD_META,
  BoardPage,
  BoardStack,
  BoardStrip,
} from "@/components/board/board-shell";
import {
  BattleEngine,
  type BattleOutcome,
} from "@/components/war/battle-engine";
import { champions } from "@/lib/game/champions";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* The battle, and what the realm makes of it.

   Two registers, one after the other. The fight itself is the engine. What
   follows is a flat Ledger tally of the run, with one exception: a victory
   fires a Ceremony, which is the single sanctioned Forge moment in this whole
   section. A defeat does not. A Ceremony that fires whether you won or lost is
   not a reward, it is a dialog, and section 1 of the design system is explicit
   that ornament which appears every time stops meaning anything.

   Glory is server settled. The engine keeps its own running tally so the HUD
   has something to count during the fight, but the number this page reports as
   banked is only ever the one the server returned. When the server has not
   answered, or nobody is signed in, no Glory figure is shown at all rather
   than a client guess dressed up as an earning. */

const FIELDS: Record<string, string> = {
  "river-crossing": "River Crossing",
  "castle-siege": "Castle Siege",
  "snow-valley": "Snow Valley",
  "dark-fortress": "Dark Fortress",
};

function BattleInner() {
  const params = useSearchParams();
  const { authenticated } = useRealmAuth();
  const slug = params.get("champion") ?? "aeron-the-black";
  const fieldParam = params.get("field") ?? "river-crossing";
  const field = FIELDS[fieldParam] ? fieldParam : "river-crossing";
  const champion =
    champions.find((c) => c.slug === slug && c.art) ??
    champions.find((c) => c.slug === "aeron-the-black")!;

  const [outcome, setOutcome] = useState<BattleOutcome | null>(null);
  const [serverGlory, setServerGlory] = useState<number | null>(null);
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [ceremony, setCeremony] = useState(false);
  const [totals, setTotals] = useState<{
    wins: number;
    battles: number;
    war_glory: number;
  } | null>(null);
  const [key, setKey] = useState(0);
  const [mastery, setMastery] = useState(0);

  /* The server-side battle session, opened the moment the member presses
     Begin. The settle route refuses a finish that carries no battle_id (the
     stateless path let a client simply declare victories, so it is gone), and
     it verifies the reported duration against the session's wall clock, which
     is why the session opens at Begin and not at mount: a member can read the
     how-to and walk away, and the clock should start when the fight does.

     Held as a promise rather than a value because a fast defeat can end the
     fight before the start request has answered; the finish awaits whatever
     the start resolved to instead of racing it. */
  const startRef = useRef<Promise<string | null> | null>(null);

  const handleStart = useCallback(() => {
    if (!authenticated) return;
    startRef.current = (async () => {
      try {
        const res = await realmFetch<{ battle_id?: string }>(
          "/api/war/battle",
          {
            method: "POST",
            json: {
              action: "start",
              champion: champion.slug,
              battlefield: field,
            },
          }
        );
        return res.ok && res.data?.battle_id ? res.data.battle_id : null;
      } catch {
        return null;
      }
    })();
  }, [authenticated, champion.slug, field]);

  useEffect(() => {
    if (!authenticated) return;
    void realmFetch<{ state?: { mastery?: Record<string, number> } }>(
      "/api/war/battle"
    ).then((res) => {
      setMastery(res.data?.state?.mastery?.[champion.slug] ?? 0);
    });
  }, [authenticated, champion.slug]);

  const handleEnd = async (o: BattleOutcome) => {
    setOutcome(o);
    if (!authenticated) {
      if (o.result === "victory") setCeremony(true);
      return;
    }
    setSettling(true);
    setSettleError(null);
    /* No session, no settle. When the start call failed (or never fired),
       the server would refuse the finish anyway; saying so here is the same
       honesty one round trip earlier, and it never dresses a client tally up
       as a banked reward. */
    const battleId = startRef.current ? await startRef.current : null;
    if (!battleId) {
      setSettling(false);
      setSettleError(
        "The heralds never opened the book on this battle, so nothing could be recorded. Your run stands; fight again to bank the next one."
      );
      if (o.result === "victory") setCeremony(true);
      return;
    }
    const res = await realmFetch<{
      glory?: number;
      wins?: number;
      battles?: number;
      war_glory?: number;
      error?: string;
    }>("/api/war/battle", {
      method: "POST",
      json: {
        battle_id: battleId,
        champion: champion.slug,
        battlefield: field,
        result: o.result,
        kills: o.kills,
        duration_s: o.duration_s,
      },
    });
    setSettling(false);
    if (!res.ok) {
      setSettleError(
        (res.data?.error as string | undefined) ??
          "The heralds could not record this battle. Your run is safe, the tally will catch up."
      );
    } else {
      if (res.data?.glory !== undefined) setServerGlory(res.data.glory);
      if (
        res.data?.wins !== undefined &&
        res.data?.battles !== undefined &&
        res.data?.war_glory !== undefined
      ) {
        setTotals({
          wins: res.data.wins,
          battles: res.data.battles,
          war_glory: res.data.war_glory,
        });
      }
    }
    if (o.result === "victory") setCeremony(true);
  };

  const again = () => {
    setOutcome(null);
    setServerGlory(null);
    setTotals(null);
    setSettleError(null);
    setCeremony(false);
    /* A session settles exactly once; the next fight opens its own at Begin. */
    startRef.current = null;
    setKey((k) => k + 1);
  };

  return (
    <BoardPage width="wide">
      <BoardStack>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BackButton href="/war" label="The War" />
          <p
            className={`uppercase tracking-[0.24em] text-bone-faint ${BOARD_META}`}
          >
            Quick battle, {FIELDS[field]}
          </p>
        </div>

        {!outcome ? (
          <BattleEngine
            key={key}
            champion={champion}
            mastery={mastery}
            field={field}
            onStart={handleStart}
            onEnd={handleEnd}
          />
        ) : (
          <>
            <Card>
              <p
                className={`uppercase tracking-[0.26em] text-bone-faint ${BOARD_META}`}
              >
                The field falls silent
              </p>
              <h2
                className={`mt-1.5 font-display text-2xl font-semibold sm:text-3xl ${
                  outcome.result === "victory" ? "gold-text" : "text-ember"
                }`}
              >
                {outcome.result === "victory" ? "Victory" : "Defeat"}
              </h2>
              <p className="mt-1 text-sm text-bone-mut">
                {champion.name} at {FIELDS[field]}.
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <RunStat label="Foes felled" value={outcome.kills} icon="swords" />
                <RunStat
                  label="Fought"
                  value={`${outcome.duration_s}s`}
                  icon="target"
                />
                {settling ? (
                  <div className="flex flex-col gap-1.5">
                    <Skeleton radius="sm" className="h-3 w-20" />
                    <Skeleton radius="sm" className="h-5 w-16" />
                  </div>
                ) : serverGlory !== null ? (
                  <RunStat
                    label="Glory banked"
                    value={`+${serverGlory.toLocaleString()}`}
                    icon="medal"
                    gold
                  />
                ) : null}
              </dl>

              {settleError ? (
                <p role="alert" className="mt-3 text-xs text-state-danger">
                  {settleError}
                </p>
              ) : null}

              {!authenticated ? (
                <Card variant="inset" pad="sm" className="mt-4">
                  <p className="text-xs text-bone-mut">
                    Nothing was banked. Enter the realm and every battle settles
                    gold, Glory and victories against your name.
                  </p>
                  <Button
                    variant="gold"
                    size="sm"
                    className="mt-2.5"
                    render={<Link href="/signin" />}
                  >
                    Enter the realm
                  </Button>
                </Card>
              ) : null}

              {outcome.result === "defeat" ? (
                <p className={`mt-3 max-w-[52ch] text-bone-faint ${BOARD_META}`}>
                  Even the greatest fell before they rose. The realm still counts
                  your courage.
                </p>
              ) : null}

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button variant="gold" size="lg" onClick={again}>
                  <Icon name="swords" className="h-4 w-4" />
                  Fight again
                </Button>
                <Button
                  variant="glass"
                  size="lg"
                  render={<Link href="/war/prepare" />}
                >
                  Change champion
                </Button>
              </div>
            </Card>

            {totals ? (
              <BoardStrip
                stats={[
                  { label: "Battles won", value: totals.wins, icon: "crown" },
                  { label: "Battles fought", value: totals.battles, icon: "swords" },
                  { label: "War Glory", value: totals.war_glory, icon: "medal" },
                ]}
              />
            ) : null}
          </>
        )}

        {/* The one Forge moment in The War, and only on a win. */}
        <Ceremony
          open={ceremony}
          onClose={() => setCeremony(false)}
          icon="trophy"
          eyebrow="The field is yours"
          title="Victory"
          {...(serverGlory !== null
            ? { figure: `+${serverGlory.toLocaleString()}`, figureLabel: "Glory banked" }
            : {})}
          body={
            serverGlory !== null
              ? `${champion.name} broke the enemy host at ${FIELDS[field]}.`
              : authenticated
                ? /* Signed in but nothing banked: the settle failed or the
                     session never opened. Saying "enter the realm" to a member
                     who is already in it would be the wrong sentence twice. */
                  `${champion.name} broke the enemy host at ${FIELDS[field]}. The heralds could not record it, so nothing was banked.`
                : `${champion.name} broke the enemy host at ${FIELDS[field]}. Enter the realm to bank what you win.`
          }
          action={{ label: "Fight again", onClick: again }}
          secondary={{ label: "See the tally", onClick: () => setCeremony(false) }}
        />
      </BoardStack>
    </BoardPage>
  );
}

function RunStat({
  label,
  value,
  icon,
  gold,
}: {
  label: string;
  value: string | number;
  icon: string;
  gold?: boolean;
}) {
  return (
    <div>
      <dt
        className={`flex items-center gap-1.5 uppercase tracking-[0.16em] text-bone-faint ${BOARD_META}`}
      >
        <Icon name={icon} className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd
        className={`tnum mt-0.5 font-display text-lg font-semibold ${
          gold ? "text-gold-bright" : "text-bone"
        }`}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </dd>
    </div>
  );
}

export default function BattlePage() {
  return (
    <Suspense
      fallback={
        <BoardPage width="wide">
          <BoardStack>
            <Skeleton radius="xl" className="h-72" />
          </BoardStack>
        </BoardPage>
      }
    >
      <BattleInner />
    </Suspense>
  );
}
