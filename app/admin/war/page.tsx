"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { champions } from "@/lib/game/champions";
import { realmFetch } from "@/lib/auth/api";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useDelayedLoading } from "@/components/ui/skeleton";
import {
  AdminError,
  AdminHeader,
  AdminStack,
  Board,
  BoardCard,
  SealedChamber,
  StatSkeleton,
  StatTile,
} from "@/app/admin/ui";

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

function warriorName(p: WarBattle["profile"]): string {
  return p?.display_name?.trim() || (p?.handle ? `@${p.handle}` : "Unknown");
}

export default function AdminWarPage() {
  const [data, setData] = useState<WarData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  /* Static roster is used only to label slugs; every count below is live. */
  const nameFor = useMemo(() => {
    const map = new Map(champions.map((c) => [c.slug, c.name]));
    return (slug: string | null) => (slug ? (map.get(slug) ?? slug) : "Unknown");
  }, []);

  const load = useCallback(() => {
    setStatus("loading");
    void realmFetch<WarData>("/api/admin/war").then((res) => {
      if (res.status === 401 || res.status === 403) setStatus("sealed");
      else if (res.ok && res.data) {
        setData(res.data);
        setStatus("ok");
      } else setStatus("error");
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "sealed") return <SealedChamber />;

  const statCards = data
    ? [
        { label: "Battles fought", value: data.stats.battles, icon: "swords" },
        { label: "Warriors in the field", value: data.stats.fighters, icon: "user" },
        { label: "War glory earned", value: data.stats.warGlory, icon: "medal" },
        { label: "Gold in circulation", value: data.stats.totalGold, icon: "coin" },
      ]
    : [];

  return (
    <AdminStack>
      <AdminHeader title="The War" kicker="Live battle ledger, read from the realm" />

      {status === "error" ? (
        <AdminError
          title="The war ledger could not be reached"
          body="The battle records did not come back. Try reading them again."
          onRetry={load}
        />
      ) : null}

      {showSkeleton ? (
        <StatSkeleton count={4} />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:gap-2 sm:grid-cols-4">
            {statCards.map((s) => (
              <StatTile
                key={s.label}
                icon={s.icon}
                value={s.value.toLocaleString()}
                label={s.label}
              />
            ))}
          </div>

          <section className="grid grid-cols-1 gap-3 md:gap-2 sm:grid-cols-2">
            <Card pad="sm">
              <SectionHeader title="Outcomes" className="px-0 pt-0" />
              <div className="mt-3 flex flex-col gap-2">
                {Object.keys(data.resultCounts).length === 0 ? (
                  <EmptyState
                    size="sm"
                    icon="swords"
                    title="No battles recorded yet"
                    body="Outcomes appear here the moment the first champion takes the field."
                  />
                ) : (
                  Object.entries(data.resultCounts).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between text-sm md:text-[13px]"
                    >
                      <span className="capitalize text-bone-mut">{k}</span>
                      <span className="tnum text-gold">{v.toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
            <Card pad="sm">
              <SectionHeader title="Most-fielded champions" className="px-0 pt-0" />
              <div className="mt-3 flex flex-col gap-2">
                {data.topChampions.length === 0 ? (
                  <EmptyState
                    size="sm"
                    icon="medal"
                    title="No champions fielded yet"
                    body="The roster fills as members choose who fights for them."
                  />
                ) : (
                  data.topChampions.map((c) => (
                    <div
                      key={c.slug}
                      className="flex items-center justify-between text-sm md:text-[13px]"
                    >
                      <span className="truncate text-bone-mut">
                        {nameFor(c.slug)}
                      </span>
                      <span className="tnum text-gold">
                        {c.count.toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </section>

          <section className="flex flex-col gap-3 md:gap-2">
            <SectionHeader title="Battle log" />
            {data.recent.length === 0 ? (
              <Card pad="lg">
                <EmptyState
                  icon="scroll"
                  title="The ledger stands empty"
                  body="No battles have been fought yet. Every clash lands here as it resolves."
                />
              </Card>
            ) : (
              <Board
                label="Battle log"
                rows={data.recent}
                rowKey={(b) => b.id}
                columns={[
                  {
                    key: "warrior",
                    header: "Warrior",
                    className: "whitespace-nowrap font-semibold text-bone",
                    cell: (b) => warriorName(b.profile),
                  },
                  {
                    key: "champion",
                    header: "Champion",
                    className: "whitespace-nowrap",
                    cell: (b) => nameFor(b.champion_slug),
                  },
                  {
                    key: "field",
                    header: "Field",
                    className: "whitespace-nowrap",
                    cell: (b) => b.battlefield ?? "none",
                  },
                  {
                    key: "result",
                    header: "Result",
                    className: "whitespace-nowrap capitalize",
                    cell: (b) => b.result ?? "none",
                  },
                  {
                    key: "kills",
                    header: "Kills",
                    numeric: true,
                    cell: (b) => b.kills,
                  },
                  {
                    key: "glory",
                    header: "Glory",
                    numeric: true,
                    className: "text-gold",
                    cell: (b) => b.glory_earned,
                  },
                  {
                    key: "when",
                    header: "When",
                    numeric: true,
                    className: "whitespace-nowrap text-bone-faint",
                    cell: (b) => timeAgo(b.created_at),
                  },
                ]}
                card={(b) => (
                  <BoardCard
                    title={warriorName(b.profile)}
                    subtitle={timeAgo(b.created_at)}
                    stats={[
                      { label: "Champion", value: nameFor(b.champion_slug) },
                      { label: "Field", value: b.battlefield ?? "none" },
                      { label: "Result", value: b.result ?? "none" },
                      { label: "Kills", value: b.kills },
                      { label: "Glory", value: b.glory_earned },
                    ]}
                  />
                )}
              />
            )}
          </section>
        </>
      ) : null}
    </AdminStack>
  );
}
