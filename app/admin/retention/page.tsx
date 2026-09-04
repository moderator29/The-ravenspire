"use client";

import { useCallback, useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useDelayedLoading } from "@/components/ui/skeleton";
import {
  AdminError,
  AdminHeader,
  AdminNote,
  AdminStack,
  Board,
  BoardCard,
  SealedChamber,
  StatSkeleton,
  StatTile,
} from "@/app/admin/ui";

/* Retention: the metric wall.
 *
 * The overview counts what exists; this chamber measures what returns. Every
 * figure is computed on the server from the points ledger and the profiles
 * table, nothing is estimated, and a cohort too young for a mark says "not
 * yet" rather than pretending a zero.
 */

interface Mark {
  eligible: number;
  returned: number;
}

interface Cohort {
  weekStart: string;
  size: number;
  d1: Mark;
  d7: Mark;
  d30: Mark;
}

interface RetentionData {
  headline: {
    members: number;
    weeklyActive: number;
    monthlyActive: number;
    activated: number;
    activationPct: number;
    calls7d: number;
    callsPerWeeklyActive: number;
    habitDepthPct: number;
  };
  cohorts: Cohort[];
}

function markText(m: Mark): string {
  if (m.eligible === 0) return "not yet";
  const pct = Math.round((m.returned / m.eligible) * 100);
  return `${m.returned}/${m.eligible} (${pct}%)`;
}

function weekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function RetentionPage() {
  const [data, setData] = useState<RetentionData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  const load = useCallback(() => {
    setStatus("loading");
    void realmFetch<RetentionData>("/api/admin/retention").then((res) => {
      if (res.status === 401 || res.status === 403) {
        setStatus("sealed");
      } else if (res.ok && res.data) {
        setData(res.data);
        setStatus("ok");
      } else {
        setStatus("error");
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "sealed") return <SealedChamber />;

  if (status === "error") {
    return (
      <AdminStack>
        <AdminHeader title="Retention" kicker="What returns, measured" />
        <AdminError
          body="The ledger could not be read. The archives may be resting."
          onRetry={load}
        />
      </AdminStack>
    );
  }

  const h = data?.headline;
  const tiles = h
    ? [
        { label: "Members of the realm", value: h.members.toLocaleString(), icon: "user" },
        { label: "Active this week", value: h.weeklyActive.toLocaleString(), icon: "flame" },
        { label: "Active this month", value: h.monthlyActive.toLocaleString(), icon: "signal" },
        {
          label: "Activation, sealed a Call",
          value: `${h.activated.toLocaleString()} (${h.activationPct}%)`,
          icon: "target",
        },
        { label: "Calls this week", value: h.calls7d.toLocaleString(), icon: "scroll" },
        {
          label: "Calls per weekly active",
          value: h.callsPerWeeklyActive.toLocaleString(),
          icon: "compass",
        },
        {
          label: "Habit depth, 3 of 7 days",
          value: `${h.habitDepthPct}%`,
          icon: "medal",
        },
      ]
    : [];

  return (
    <AdminStack>
      <AdminHeader title="Retention" kicker="What returns, measured" />

      <section aria-label="Headline retention" className="flex flex-col gap-3 md:gap-2">
        {showSkeleton ? (
          <StatSkeleton count={8} />
        ) : status === "loading" ? null : (
          <div className="grid grid-cols-2 gap-3 md:gap-2 lg:grid-cols-4">
            {tiles.map((t) => (
              <StatTile key={t.label} icon={t.icon} value={t.value} label={t.label} />
            ))}
          </div>
        )}
      </section>

      {data ? (
        <section aria-label="Signup cohorts" className="flex flex-col gap-3 md:gap-2">
          <SectionHeader title="Signup cohorts, last eight weeks" />
          {data.cohorts.length === 0 ? (
            <EmptyState
              icon="user"
              title="No cohorts yet"
              body="Cohorts appear as members sign up, week by week."
            />
          ) : (
            <Board
              label="Weekly signup cohorts with day 1, day 7 and day 30 return rates"
              columns={[
                {
                  key: "week",
                  header: "Week of",
                  cell: (c: Cohort) => (
                    <span className="font-medium text-bone">{weekLabel(c.weekStart)}</span>
                  ),
                },
                {
                  key: "size",
                  header: "Signed up",
                  numeric: true,
                  cell: (c: Cohort) => c.size,
                },
                { key: "d1", header: "Day 1", numeric: true, cell: (c: Cohort) => markText(c.d1) },
                { key: "d7", header: "Day 7", numeric: true, cell: (c: Cohort) => markText(c.d7) },
                {
                  key: "d30",
                  header: "Day 30",
                  numeric: true,
                  cell: (c: Cohort) => markText(c.d30),
                },
              ]}
              rows={data.cohorts}
              rowKey={(c) => c.weekStart}
              card={(c) => (
                <BoardCard
                  title={`Week of ${weekLabel(c.weekStart)}`}
                  trailing={<span className="tnum text-sm text-bone-mut">{c.size} joined</span>}
                  stats={[
                    { label: "Day 1", value: markText(c.d1) },
                    { label: "Day 7", value: markText(c.d7) },
                    { label: "Day 30", value: markText(c.d30) },
                  ]}
                />
              )}
            />
          )}
          <AdminNote tone="gold">
            Active means the member earned at least one verified points ledger
            entry that UTC day; signing in without acting does not count. A
            day-N figure reads returned of eligible: members who acted on or
            after day N of their account, out of those whose account is at
            least N days old. Young cohorts say not yet instead of a false
            zero.
          </AdminNote>
        </section>
      ) : null}
    </AdminStack>
  );
}
