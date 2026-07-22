"use client";

import { useEffect, useMemo, useState } from "react";
import { champions } from "@/lib/game/champions";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";

interface WarBattle {
  id: string;
  champion_slug: string | null;
  battlefield: string | null;
  result: string | null;
  glory_earned: number;
  kills: number;
  duration_s: number;
  created_at: string;
  profile: { handle: string | null; display_name: string | null } | null;
}

interface WarData {
  stats: { battles: number; fighters: number; warGlory: number; totalGold: number };
  resultCounts: Record<string, number>;
  topChampions: { slug: string; count: number }[];
  recent: WarBattle[];
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminWarPage() {
  const [data, setData] = useState<WarData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );

  /* Static roster is used only to label slugs; every count below is live. */
  const nameFor = useMemo(() => {
    const map = new Map(champions.map((c) => [c.slug, c.name]));
    return (slug: string | null) => (slug ? map.get(slug) ?? slug : "Unknown");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void realmFetch<WarData>("/api/admin/war").then((res) => {
      if (cancelled) return;
      if (res.status === 401 || res.status === 403) setStatus("sealed");
      else if (res.ok && res.data) {
        setData(res.data);
        setStatus("ok");
      } else setStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "sealed") {
    return (
      <div className="glass p-8 text-center">
        <Icon name="lock" className="mx-auto h-6 w-6 text-bone-faint" />
        <p className="gold-text font-display mt-3 text-xl font-semibold">
          The council chamber is sealed
        </p>
      </div>
    );
  }

  const statCards = data
    ? [
        { label: "Battles fought", value: data.stats.battles, icon: "swords" },
        { label: "Warriors in the field", value: data.stats.fighters, icon: "user" },
        { label: "War glory earned", value: data.stats.warGlory, icon: "medal" },
        { label: "Gold in circulation", value: data.stats.totalGold, icon: "coin" },
      ]
    : [];

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-bone sm:text-2xl">
        The War
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Live battle ledger, read from the realm
      </p>

      {status === "error" && (
        <div className="glass glass-sm mt-4 p-5">
          <p className="text-sm text-bone-mut">
            The war ledger could not be reached. Try again shortly.
          </p>
        </div>
      )}

      {status === "loading" ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="glass glass-sm h-24 animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statCards.map((s) => (
              <div key={s.label} className="glass glass-sm p-4">
                <Icon name={s.icon} className="h-4 w-4 text-bone-faint" />
                <p className="tnum font-display mt-2 text-2xl font-semibold text-gold">
                  {s.value.toLocaleString()}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="glass glass-sm p-4 sm:p-5">
              <h2 className="font-display text-sm font-semibold text-bone">
                Outcomes
              </h2>
              <div className="mt-3 flex flex-col gap-2">
                {Object.keys(data.resultCounts).length === 0 ? (
                  <p className="text-sm text-bone-mut">No battles recorded yet.</p>
                ) : (
                  Object.entries(data.resultCounts).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-bone-mut">{k}</span>
                      <span className="tnum text-gold">{v.toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="glass glass-sm p-4 sm:p-5">
              <h2 className="font-display text-sm font-semibold text-bone">
                Most-fielded champions
              </h2>
              <div className="mt-3 flex flex-col gap-2">
                {data.topChampions.length === 0 ? (
                  <p className="text-sm text-bone-mut">No champions fielded yet.</p>
                ) : (
                  data.topChampions.map((c) => (
                    <div key={c.slug} className="flex items-center justify-between text-sm">
                      <span className="truncate text-bone-mut">{nameFor(c.slug)}</span>
                      <span className="tnum text-gold">{c.count.toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="font-display text-lg font-semibold text-bone">
              Battle log
            </h2>
            <div className="glass mt-3 overflow-x-auto">
              {data.recent.length === 0 ? (
                <div className="flex items-center gap-3 p-6">
                  <Icon name="scroll" className="h-5 w-5 text-bone-faint" />
                  <p className="text-sm text-bone-mut">
                    No battles have been fought yet. The ledger stands empty.
                  </p>
                </div>
              ) : (
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-steel-line text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                      <th className="px-4 py-3 font-medium">Warrior</th>
                      <th className="px-4 py-3 font-medium">Champion</th>
                      <th className="px-4 py-3 font-medium">Field</th>
                      <th className="px-4 py-3 font-medium">Result</th>
                      <th className="px-4 py-3 font-medium">Kills</th>
                      <th className="px-4 py-3 font-medium">Glory</th>
                      <th className="px-4 py-3 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((b) => (
                      <tr key={b.id} className="border-b border-steel-line last:border-b-0">
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-bone">
                          {b.profile?.display_name?.trim() ||
                            (b.profile?.handle ? `@${b.profile.handle}` : "Unknown")}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-bone-mut">
                          {nameFor(b.champion_slug)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-bone-mut">
                          {b.battlefield ?? "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 capitalize text-bone-mut">
                          {b.result ?? "-"}
                        </td>
                        <td className="tnum whitespace-nowrap px-4 py-3 text-bone-mut">
                          {b.kills}
                        </td>
                        <td className="tnum whitespace-nowrap px-4 py-3 text-gold">
                          {b.glory_earned}
                        </td>
                        <td className="tnum whitespace-nowrap px-4 py-3 text-xs text-bone-faint">
                          {timeAgo(b.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
