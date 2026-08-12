"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { Badge } from "@/components/ui/badge";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { useDelayedLoading } from "@/components/ui/skeleton";
import {
  AdminError,
  AdminHeader,
  AdminStack,
  Board,
  BoardCard,
  BoardSkeleton,
  SealedChamber,
  StatSkeleton,
  StatTile,
} from "@/app/admin/ui";

interface OverviewStats {
  users: number;
  dau: number;
  newToday: number;
  posts: number;
  calls: number;
  gloryIssued: number;
  liveRooms: number;
  revenue: number;
  openReports: number;
  trades: number;
  trades24h: number;
  duelsLive: number;
  connections: number;
  warPlayers: number;
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

function authorName(a: RecentPost["author"]): string {
  return a?.display_name?.trim() || (a?.handle ? `@${a.handle}` : "Unknown");
}

function actorName(a: AuditRow["actor"]): string {
  return a?.display_name?.trim() || (a?.handle ? `@${a.handle}` : "System");
}

/* A minimal inline-SVG sparkline. No chart library: one polyline plus a soft
   area fill, scaled to the data. Gold, off the token, never a hardcoded hex. */
function Sparkline({ values, labels }: { values: number[]; labels: string[] }) {
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
      <polygon points={area} fill="var(--gold)" fillOpacity="0.1" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--gold)"
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
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  const load = useCallback(() => {
    setStatus("loading");
    void realmFetch<OverviewData>("/api/admin/overview").then((res) => {
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
        <AdminHeader title="Overview" kicker="The state of the realm" back={false} />
        <AdminError
          body="The ledger could not be read. The archives may be resting."
          onRetry={load}
        />
      </AdminStack>
    );
  }

  const statCards = data
    ? [
        { label: "Members of the realm", value: data.stats.users, icon: "user" },
        { label: "Active today", value: data.stats.dau, icon: "signal" },
        { label: "New today", value: data.stats.newToday, icon: "raven" },
        { label: "Ravens sent", value: data.stats.posts, icon: "mail" },
        { label: "Calls sealed", value: data.stats.calls, icon: "target" },
        { label: "Connections", value: data.stats.connections, icon: "heart" },
        { label: "Glory issued", value: data.stats.gloryIssued, icon: "medal" },
        { label: "Live courts", value: data.stats.liveRooms, icon: "orb" },
        { label: "Trades all-time", value: data.stats.trades, icon: "repost" },
        { label: "Trades today", value: data.stats.trades24h, icon: "coin" },
        { label: "War champions", value: data.stats.warPlayers, icon: "swords" },
        { label: "Open duels", value: data.stats.duelsLive, icon: "flag" },
        { label: "Tips revenue", value: data.stats.revenue, icon: "wallet" },
        { label: "Open reports", value: data.stats.openReports, icon: "shield" },
      ]
    : [];

  /* The control center: every lever a steward has, each a card into its
     sub-console, with a live attention badge where the platform is waiting. */
  const controls = [
    {
      href: "/admin/users",
      icon: "user",
      label: "Users",
      desc: "Search, roles, bans and seals",
    },
    {
      href: "/admin/moderation",
      icon: "shield",
      label: "Moderation",
      desc: "Removed ravens and the report queue",
      badge: data?.stats.openReports ?? 0,
    },
    {
      href: "/admin/reports",
      icon: "scroll",
      label: "Reports",
      desc: "Member reports awaiting a verdict",
      badge: data?.stats.openReports ?? 0,
    },
    {
      href: "/admin/houses",
      icon: "banner",
      label: "Houses",
      desc: "Banners, glory and membership",
    },
    {
      href: "/admin/seasons",
      icon: "crown",
      label: "Seasons",
      desc: "Season windows and settlement",
    },
    {
      href: "/admin/crests",
      icon: "medal",
      label: "Crests",
      desc: "Award and revoke honors",
    },
    {
      href: "/admin/war",
      icon: "swords",
      label: "The War",
      desc: "Champions, battles and rewards",
    },
    {
      href: "/admin/flags",
      icon: "sliders",
      label: "Feature Flags",
      desc: "Roll features out or back",
    },
    {
      href: "/admin/settings",
      icon: "wall",
      label: "Settings",
      desc: "Realm-wide configuration",
    },
  ];

  return (
    <AdminStack>
      <AdminHeader title="Overview" kicker="The state of the realm" back={false} />

      <section aria-label="Council levers" className="grid grid-cols-2 gap-2.5 md:gap-2 lg:grid-cols-3">
        {controls.map((c) => (
          <Card
            key={c.href}
            pad="sm"
            interactive
            className="group flex items-start gap-3"
            render={<Link href={c.href} />}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gold/25 bg-void text-gold">
              <Icon name={c.icon} className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold text-bone">{c.label}</span>
                {"badge" in c && (c.badge ?? 0) > 0 ? (
                  <Badge variant="danger">{c.badge}</Badge>
                ) : null}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-bone-faint">
                {c.desc}
              </span>
            </span>
            <Icon
              name="chevron-right"
              className="mt-1 h-3.5 w-3.5 shrink-0 text-bone-faint transition-colors duration-fast group-hover:text-gold"
            />
          </Card>
        ))}
      </section>

      <section aria-label="Pulse of the realm" className="flex flex-col gap-3 md:gap-2">
        <SectionHeader title="Pulse of the realm" />
        {showSkeleton ? (
          <StatSkeleton count={8} />
        ) : status === "loading" ? null : (
          <div className="grid grid-cols-2 gap-3 md:gap-2 lg:grid-cols-4">
            {statCards.map((s) => (
              <StatTile
                key={s.label}
                icon={s.icon}
                value={s.value.toLocaleString()}
                label={s.label}
              />
            ))}
          </div>
        )}
      </section>

      {data ? (
        <section aria-label="Seven day trend" className="grid grid-cols-1 gap-3 md:gap-2 sm:grid-cols-2">
          <Card pad="sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
              Signups, last 7 days
            </p>
            <Sparkline values={data.series.signups} labels={data.series.days} />
            <p className="tnum mt-1 text-xs text-bone-mut">
              {data.series.signups.reduce((a, b) => a + b, 0)} new in the week
            </p>
          </Card>
          <Card pad="sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
              Ravens, last 7 days
            </p>
            <Sparkline values={data.series.posts} labels={data.series.days} />
            <p className="tnum mt-1 text-xs text-bone-mut">
              {data.series.posts.reduce((a, b) => a + b, 0)} sent in the week
            </p>
          </Card>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-6 md:gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 md:gap-2">
          <SectionHeader title="Recent ravens" />
          {showSkeleton ? (
            <BoardSkeleton rows={5} columns={3} />
          ) : status === "loading" ? null : data && data.recent.length > 0 ? (
            <Board
              label="Recent ravens"
              rows={data.recent}
              rowKey={(p) => p.id}
              columns={[
                {
                  key: "author",
                  header: "Author",
                  className: "whitespace-nowrap font-semibold text-bone",
                  cell: (p) => authorName(p.author),
                },
                {
                  key: "body",
                  header: "Raven",
                  cell: (p) => (
                    <span className="flex items-center gap-2">
                      {p.deleted ? <Badge variant="danger">Removed</Badge> : null}
                      {truncate(p.body)}
                    </span>
                  ),
                },
                {
                  key: "sent",
                  header: "Sent",
                  numeric: true,
                  className: "whitespace-nowrap text-bone-faint",
                  cell: (p) => timeAgo(p.created_at),
                },
              ]}
              card={(p) => (
                <BoardCard
                  title={authorName(p.author)}
                  subtitle={timeAgo(p.created_at)}
                  badges={p.deleted ? <Badge variant="danger">Removed</Badge> : null}
                >
                  <p className="mt-2 text-xs text-bone-mut">{truncate(p.body, 140)}</p>
                </BoardCard>
              )}
            />
          ) : (
            <Card pad="lg">
              <EmptyState
                icon="raven"
                title="The rookery is quiet"
                body="No ravens have flown yet. Members posting in the Ravenry will appear here."
                action={
                  <Link
                    href="/home"
                    className="rounded-md text-xs text-gold underline underline-offset-2"
                  >
                    Open the Ravenry
                  </Link>
                }
              />
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3 md:gap-2">
          <SectionHeader title="Recent council actions" />
          {showSkeleton ? (
            <BoardSkeleton rows={5} columns={3} />
          ) : status === "loading" ? null : data && data.audit.length > 0 ? (
            <Board
              label="Recent council actions"
              rows={data.audit}
              rowKey={(a) => a.id}
              columns={[
                {
                  key: "actor",
                  header: "Steward",
                  className: "whitespace-nowrap font-semibold text-bone",
                  cell: (a) => actorName(a.actor),
                },
                {
                  key: "action",
                  header: "Action",
                  cell: (a) => (
                    <span className="flex items-center gap-2">
                      <span className="capitalize">{actionLabel(a.action)}</span>
                      {a.target_type ? (
                        <span className="text-[11px] text-bone-faint">
                          {a.target_type}
                        </span>
                      ) : null}
                    </span>
                  ),
                },
                {
                  key: "when",
                  header: "When",
                  numeric: true,
                  className: "whitespace-nowrap text-bone-faint",
                  cell: (a) => timeAgo(a.created_at),
                },
              ]}
              card={(a) => (
                <BoardCard
                  title={actorName(a.actor)}
                  subtitle={timeAgo(a.created_at)}
                  stats={[
                    { label: "Action", value: actionLabel(a.action) },
                    { label: "Target", value: a.target_type ?? "none" },
                  ]}
                />
              )}
            />
          ) : (
            <Card pad="lg">
              <EmptyState
                icon="scroll"
                title="No council actions recorded"
                body="Every privileged action lands here once a steward acts. Start with the user roll."
                action={
                  <Link
                    href="/admin/users"
                    className="rounded-md text-xs text-gold underline underline-offset-2"
                  >
                    Open the user roll
                  </Link>
                }
              />
            </Card>
          )}
        </div>
      </section>
    </AdminStack>
  );
}
