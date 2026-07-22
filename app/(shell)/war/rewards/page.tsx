"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { champions } from "@/lib/game/champions";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";

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

const PASS_TIERS = [
  { at: 0, label: "Recruit's purse", desc: "60 gold" },
  { at: 200, label: "Relic chest", desc: "A chest from the vaults" },
  { at: 500, label: "Squire's purse", desc: "150 gold" },
  { at: 900, label: "Relic chest", desc: "Another chest, heavier" },
  { at: 1400, label: "Knight's purse", desc: "300 gold" },
  { at: 2000, label: "Champion's favor", desc: "A summon token's worth of fortune" },
];

export default function RewardsPage() {
  const { ready, authenticated } = useRealmAuth();
  const [state, setState] = useState<WarState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [chestResult, setChestResult] = useState<{
    gold: number;
    unlocked: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>("aeron-the-black");

  const load = useCallback(async () => {
    const res = await realmFetch<{ state: WarState }>("/api/war/battle");
    if (res.data?.state) {
      setState(res.data.state);
      const first = res.data.state.unlocked_champions[0];
      if (first) setSelected((s) => (res.data!.state.unlocked_champions.includes(s) ? s : first));
    }
  }, []);

  useEffect(() => {
    if (ready && authenticated) void load();
  }, [ready, authenticated, load]);

  const act = async (json: Record<string, unknown>) => {
    if (busy) return null;
    setBusy(true);
    setMsg(null);
    const res = await realmFetch<{ error?: string } & Record<string, unknown>>(
      "/api/war/rewards",
      { method: "POST", json }
    );
    setBusy(false);
    if (!res.ok) {
      setMsg((res.data?.error as string) ?? "The vault stayed shut. Try again.");
      return null;
    }
    await load();
    return res.data;
  };

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="gold-text font-display text-2xl font-semibold">
          Rewards & Progression
        </h1>
        <p className="mt-3 text-sm text-bone-mut">
          Tribute, chests and mastery await those who enter the realm.
        </p>
        <Link href="/signin" className="btn-gold mt-6 inline-flex px-6 py-2.5 text-sm">
          Enter the Realm
        </Link>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const dailyClaimed = state?.last_daily === today;
  const glory = state?.war_glory ?? 0;
  const nextTier = PASS_TIERS.find((t) => t.at > glory);
  const unlockedChamps = champions.filter((c) =>
    state?.unlocked_champions.includes(c.slug)
  );
  const sel = champions.find((c) => c.slug === selected);
  const selLevel = state?.mastery?.[selected] ?? 0;
  const upgradeCost = 120 + selLevel * 60;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-3">
        <BackButton href="/war" label="The War" />
      </div>
      <h1 className="gold-text font-display text-2xl font-semibold">
        Rewards & Progression
      </h1>
      <p className="text-xs uppercase tracking-[0.26em] text-bone-faint">
        Tribute · chests · mastery · the pass
      </p>

      {/* stat strip */}
      <div className="tnum mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Gold", state?.gold ?? 0, "coin"],
          ["War Glory", glory, "medal"],
          ["Chests", state?.chests ?? 0, "lock"],
          ["Victories", state?.wins ?? 0, "crown"],
        ].map(([label, value, icon]) => (
          <div key={String(label)} className="glass glass-sm flex items-center gap-2.5 px-3.5 py-2.5">
            <Icon name={String(icon)} className="h-4 w-4 text-gold" />
            <div>
              <p className="text-sm font-bold text-bone">{Number(value).toLocaleString()}</p>
              <p className="text-[10px] uppercase tracking-wider text-bone-faint">
                {String(label)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {msg && (
        <p className="glass glass-sm mt-3 px-4 py-2.5 text-xs text-ember">{msg}</p>
      )}

      {/* daily tribute */}
      <section className="glass mt-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-bone">
              Daily tribute
            </h2>
            <p className="mt-0.5 text-xs text-bone-mut">
              60 gold each day you return. The seventh day carries a relic chest.
            </p>
          </div>
          <button
            onClick={() => void act({ action: "daily" })}
            disabled={busy || dailyClaimed}
            className="btn-gold shrink-0 px-5 py-2 text-xs disabled:opacity-50"
          >
            {dailyClaimed ? "Claimed today" : "Claim"}
          </button>
        </div>
      </section>

      {/* relic chest */}
      <section className="glass glass-warm mt-3 p-5">
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/game/gear/relic-chest.png"
            alt=""
            className="h-16 w-16 rounded-xl border border-gold/30 object-cover"
          />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold text-bone">
              Relic chest
            </h2>
            <p className="mt-0.5 text-xs text-bone-mut">
              Gold always. Sometimes, a champion answers the call.
            </p>
            {chestResult && (
              <p className="mt-1.5 text-xs font-semibold text-gold-bright">
                +{chestResult.gold} gold
                {chestResult.unlocked &&
                  ` · ${champions.find((c) => c.slug === chestResult.unlocked)?.name} joins your banner`}
              </p>
            )}
          </div>
          <button
            onClick={() =>
              void act({ action: "open_chest" }).then((d) => {
                if (d)
                  setChestResult({
                    gold: Number(d.gold ?? 0),
                    unlocked: (d.unlocked as string | null) ?? null,
                  });
              })
            }
            disabled={busy || (state?.chests ?? 0) < 1}
            className="btn-gold shrink-0 px-5 py-2 text-xs disabled:opacity-50"
          >
            Open ({state?.chests ?? 0})
          </button>
        </div>
      </section>

      {/* war pass */}
      <section className="glass mt-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-bone">
            The War Pass
          </h2>
          <span className="tnum text-xs text-bone-faint">
            {glory.toLocaleString()} Glory
            {nextTier && ` · next at ${nextTier.at.toLocaleString()}`}
          </span>
        </div>
        <div className="mt-3 overflow-x-auto pb-1">
          <div className="flex min-w-max items-stretch gap-2">
            {PASS_TIERS.map((t) => {
              const reached = glory >= t.at;
              return (
                <div
                  key={t.at}
                  className={`glass-sm w-36 shrink-0 rounded-2xl border p-3 ${
                    reached
                      ? "border-gold/50 bg-panel-warm"
                      : "border-steel-line bg-panel opacity-70"
                  }`}
                >
                  <p className="tnum text-[10px] uppercase tracking-wider text-bone-faint">
                    {t.at.toLocaleString()} Glory
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${reached ? "text-gold-bright" : "text-bone-mut"}`}>
                    {t.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-bone-faint">{t.desc}</p>
                  {reached && (
                    <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                      Reached
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-bone-faint">
          Pass rewards are honored automatically as your Glory rises this Season.
        </p>
      </section>

      {/* champion mastery */}
      <section className="glass mt-3 p-5">
        <h2 className="font-display text-lg font-semibold text-bone">
          Champion mastery
        </h2>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {unlockedChamps.map((c) => (
            <button
              key={c.slug}
              onClick={() => setSelected(c.slug)}
              className={`shrink-0 overflow-hidden rounded-xl border transition ${
                selected === c.slug ? "border-gold/60" : "border-steel-line opacity-70"
              }`}
            >
              {c.art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.art} alt={c.name} className="h-16 w-13 object-cover" />
              ) : (
                <div className="h-16 w-13 bg-panel" />
              )}
            </button>
          ))}
        </div>
        {sel && (
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-semibold text-bone">
                {sel.name}
                <span className="tnum ml-2 text-xs text-gold">
                  Mastery {selLevel} / 10
                </span>
              </p>
              <div className="bar-track mt-2 h-2 w-full max-w-xs">
                <div
                  className="bar-gold h-full"
                  style={{ width: `${(selLevel / 10) * 100}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-bone-faint">
                Each mastery level sharpens {sel.name.split(" ")[0]}'s blade in
                battle. Paid in gold, earned in war.
              </p>
            </div>
            <button
              onClick={() => void act({ action: "upgrade", champion: sel.slug })}
              disabled={busy || selLevel >= 10 || (state?.gold ?? 0) < upgradeCost}
              className="btn-gold px-5 py-2 text-xs disabled:opacity-50"
            >
              {selLevel >= 10 ? "At its peak" : `Upgrade · ${upgradeCost} gold`}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
