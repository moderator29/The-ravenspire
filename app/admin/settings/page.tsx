"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { Button } from "@/components/ui/button";
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
  TOUCH,
} from "@/app/admin/ui";

interface AuditRow {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
  actor: { handle: string | null; display_name: string | null } | null;
}

interface SeasonRow {
  id: number;
  name: string;
  status: string;
  ends_at: string | null;
}

interface FlagRow {
  key: string;
  enabled: boolean;
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

function actorName(a: AuditRow["actor"]): string {
  return a?.display_name?.trim() || (a?.handle ? `@${a.handle}` : "System");
}

/* A configuration tile: a glyph, the current reading, and the one link that
   changes it. Ornament budget zero, so nothing here glows. */
function ConfigTile({
  icon,
  headline,
  detail,
  href,
  action,
}: {
  icon: string;
  headline: string;
  detail: string;
  href: string;
  action: string;
}) {
  return (
    <Card pad="sm" className="flex flex-col">
      <Icon
        name={icon}
        className="h-5 w-5 text-bone-faint md:h-[17px] md:w-[17px]"
      />
      <p className="mt-2 font-display text-base font-semibold text-bone md:text-sm">
        {headline}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-bone-faint">
        {detail}
      </p>
      <div className="mt-3">
        <Button
          variant="glass"
          size="sm"
          className={TOUCH}
          render={<Link href={href} />}
        >
          {action}
        </Button>
      </div>
    </Card>
  );
}

export default function AdminSettingsPage() {
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  const load = useCallback(() => {
    setStatus("loading");
    void Promise.all([
      realmFetch<{ audit: AuditRow[] }>("/api/admin/overview"),
      realmFetch<{ seasons: SeasonRow[] }>("/api/admin/seasons"),
      realmFetch<{ flags: FlagRow[] }>("/api/admin/flags"),
    ]).then(([ov, se, fl]) => {
      if (ov.status === 401 || ov.status === 403) {
        setStatus("sealed");
        return;
      }
      if (ov.ok && ov.data) setAudit(ov.data.audit ?? []);
      if (se.ok && se.data?.seasons) setSeasons(se.data.seasons);
      if (fl.ok && fl.data?.flags) setFlags(fl.data.flags);
      setStatus(ov.ok ? "ok" : "error");
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "sealed") return <SealedChamber />;

  const activeSeason = seasons.find((s) => s.status === "active") ?? null;
  const enabledFlags = flags.filter((f) => f.enabled).length;

  return (
    <AdminStack>
      <AdminHeader
        title="Settings"
        kicker="Platform configuration and the audit trail"
      />

      <div className="grid grid-cols-1 gap-3 md:gap-2 sm:grid-cols-3">
        <ConfigTile
          icon="crown"
          headline={activeSeason ? activeSeason.name : "No active season"}
          detail={
            activeSeason
              ? `Closes ${activeSeason.ends_at ? new Date(activeSeason.ends_at).toLocaleDateString() : "unset"}`
              : "Open one in Seasons"
          }
          href="/admin/seasons"
          action="Manage seasons"
        />
        <ConfigTile
          icon="sliders"
          headline={`${enabledFlags} of ${flags.length} enabled`}
          detail="Feature flags"
          href="/admin/flags"
          action="Manage flags"
        />
        <ConfigTile
          icon="shield"
          headline="Moderation"
          detail="Reports and takedowns"
          href="/admin/reports"
          action="View report history"
        />
      </div>

      <section className="flex flex-col gap-3 md:gap-2">
        <SectionHeader
          title="Audit trail"
          hint="Who acted, and when"
        />
        {showSkeleton ? (
          <BoardSkeleton rows={6} columns={4} />
        ) : status === "loading" ? null : status === "error" ? (
          <AdminError
            title="The audit trail could not be read"
            body="The record of privileged actions did not come back. Try reading it again."
            onRetry={load}
          />
        ) : audit.length === 0 ? (
          <Card pad="lg">
            <EmptyState
              icon="scroll"
              title="No council actions recorded"
              body="Every privileged action is recorded here with who acted and when. Nothing has been done yet."
              action={
                <Button
                  variant="glass"
                  size="md"
                  className={TOUCH}
                  render={<Link href="/admin/users" />}
                >
                  Open the user roll
                </Button>
              }
            />
          </Card>
        ) : (
          <Board
            label="Audit trail"
            rows={audit}
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
                className: "capitalize",
                cell: (a) => a.action.replace(/_/g, " "),
              },
              {
                key: "target",
                header: "Target",
                className: "whitespace-nowrap text-bone-faint",
                cell: (a) => a.target_type ?? "none",
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
                  { label: "Action", value: a.action.replace(/_/g, " ") },
                  { label: "Target", value: a.target_type ?? "none" },
                ]}
              />
            )}
          />
        )}
      </section>
    </AdminStack>
  );
}
