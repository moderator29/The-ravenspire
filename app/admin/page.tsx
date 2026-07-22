"use client";

import { useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";

interface OverviewStats {
  users: number;
  dau: number;
  posts: number;
  gloryIssued: number;
  liveRooms: number;
  revenue: number;
  openReports: number;
}

interface RecentPost {
  id: string;
  body: string;
  deleted: boolean;
  created_at: string;
  author: { handle: string | null; display_name: string | null } | null;
}

interface AuditRow {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
  actor: { handle: string | null; display_name: string | null } | null;
}

interface OverviewData {
  stats: OverviewStats;
  series: { days: string[]; signups: number[]; posts: number[] };
  recent: RecentPost[];
  audit: AuditRow[];
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(text: string, max = 80): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function actionLabel(a: string): string {
  return a.replace(/_/g, " ");
}

/* A minimal inline-SVG sparkline. No chart library: one polyline plus a soft
   area fill, scaled to the data. */
function Sparkline({
  values,
  labels,
}: {
  values: number[];
  labels: string[];
}) {
  const w = 240;
  const h = 56;
  const pad = 3;
  const max = Math.max(1, ...values);
  const n = values.length;
  const step = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - (v / max) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area =
    pts.length > 0
      ? `${pad},${h - pad} ${line} ${(pad + (n - 1) * step).toFixed(1)},${h - pad}`
      : "";
  const last = values[values.length - 1] ?? 0;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-2 h-14 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Last ${n} days, ${last} on ${labels[labels.length - 1] ?? "today"}`}
    >
      <polygon points={area} fill="rgba(200,162,76,0.10)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--gold, #C8A24C)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );

  useEffect(() => {
    let cancelled = false;
    void realmFetch<OverviewData>("/api/admin/overview").then((res) => {
      if (cancelled) return;
      if (res.status === 401 || res.status === 403) {
        setStatus("sealed");
      } else if (res.ok && res.data) {
        setData(res.data);
        setStatus("ok");
      } else {
        setStatus("error");
      }
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
        <p className="mt-2 text-sm text-bone-mut">
          Your seal does not open this ledger.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="glass p-8 text-center">
        <p className="text-sm text-bone-mut">
          The ledger could not be read. Try again shortly.
        </p>
      </div>
    );
  }

  const statCards = data
    ? [
        { label: "Members of the realm", value: data.stats.users, icon: "user" },
        { label: "Active today", value: data.stats.dau, icon: "signal" },
        { label: "Ravens sent", value: data.stats.posts, icon: "raven" },
        { label: "Glory issued", value: data.stats.gloryIssued, icon: "medal" },
        { label: "Live courts", value: data.stats.liveRooms, icon: "orb" },
        { label: "Tips revenue", value: data.stats.revenue, icon: "coin" },
        {
          label: "Open reports",
          value: data.stats.openReports,
          icon: "shield",
        },
      ]
    : [];

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-bone sm:text-2xl">
        Overview
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        The state of the realm
      </p>

      {status === "loading" ? (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="glass glass-sm h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statCards.map((s) => (
            <div key={s.label} className="glass glass-sm p-4 sm:p-5">
              <Icon name={s.icon} className="h-4 w-4 text-bone-faint" />
              <p className="tnum font-display mt-2 text-2xl font-semibold text-gold sm:text-3xl">
                {s.value.toLocaleString()}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {data && (
        <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="glass glass-sm p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
              Signups, last 7 days
            </p>
            <Sparkline values={data.series.signups} labels={data.series.days} />
            <p className="tnum mt-1 text-xs text-bone-mut">
              {data.series.signups.reduce((a, b) => a + b, 0)} new in the week
            </p>
          </div>
          <div className="glass glass-sm p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
              Ravens, last 7 days
            </p>
            <Sparkline values={data.series.posts} labels={data.series.days} />
            <p className="tnum mt-1 text-xs text-bone-mut">
              {data.series.posts.reduce((a, b) => a + b, 0)} sent in the week
            </p>
          </div>
        </section>
      )}

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-bone">
            Recent ravens
          </h2>
          <div className="glass mt-3 overflow-x-auto">
            {status === "loading" ? (
              <div className="h-40 animate-pulse" />
            ) : data && data.recent.length > 0 ? (
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-steel-line text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                    <th className="px-4 py-3 font-medium">Author</th>
                    <th className="px-4 py-3 font-medium">Raven</th>
                    <th className="px-4 py-3 font-medium">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-steel-line last:border-b-0"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="font-semibold text-bone">
                          {p.author?.display_name?.trim() ||
                            (p.author?.handle
                              ? `@${p.author.handle}`
                              : "Unknown")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-bone-mut">
                        {p.deleted && (
                          <span className="mr-2 rounded-full border border-steel-line bg-panel px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-ember">
                            Removed
                          </span>
                        )}
                        {truncate(p.body)}
                      </td>
                      <td className="tnum whitespace-nowrap px-4 py-3 text-xs text-bone-faint">
                        {timeAgo(p.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex items-center gap-3 p-6">
                <Icon name="raven" className="h-5 w-5 text-bone-faint" />
                <p className="text-sm text-bone-mut">
                  No ravens have flown yet. The rookery is quiet.
                </p>
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="font-display text-lg font-semibold text-bone">
            Recent council actions
          </h2>
          <div className="glass mt-3 overflow-x-auto">
            {status === "loading" ? (
              <div className="h-40 animate-pulse" />
            ) : data && data.audit.length > 0 ? (
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-steel-line text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                    <th className="px-4 py-3 font-medium">Steward</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.audit.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-steel-line last:border-b-0"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-bone">
                        {a.actor?.display_name?.trim() ||
                          (a.actor?.handle ? `@${a.actor.handle}` : "System")}
                      </td>
                      <td className="px-4 py-3 text-bone-mut">
                        <span className="capitalize">{actionLabel(a.action)}</span>
                        {a.target_type && (
                          <span className="ml-2 text-xs text-bone-faint">
                            {a.target_type}
                          </span>
                        )}
                      </td>
                      <td className="tnum whitespace-nowrap px-4 py-3 text-xs text-bone-faint">
                        {timeAgo(a.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex items-center gap-3 p-6">
                <Icon name="scroll" className="h-5 w-5 text-bone-faint" />
                <p className="text-sm text-bone-mut">
                  No council actions recorded yet.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
