"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/tabs";
import { useDelayedLoading } from "@/components/ui/skeleton";
import {
  AdminError,
  AdminHeader,
  AdminNote,
  AdminStack,
  Board,
  BoardCard,
  BoardSkeleton,
  SealedChamber,
  TOUCH,
} from "@/app/admin/ui";

interface ReportRow {
  id: string;
  subject_type: string;
  subject_id: string;
  reason: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  reporter: { handle: string | null; display_name: string | null } | null;
  resolver: { handle: string | null; display_name: string | null } | null;
  subject: { handle?: string | null; post_id?: string } | null;
}

const FILTERS = ["open", "resolved", "dismissed", "all"] as const;
type Filter = (typeof FILTERS)[number];

function personName(
  p: { handle: string | null; display_name: string | null } | null
): string {
  if (!p) return "none";
  return p.display_name?.trim() || (p.handle ? `@${p.handle}` : "Anonymous");
}

function subjectLink(r: ReportRow): string | null {
  if (r.subject_type === "post") return `/post/${r.subject_id}`;
  if (r.subject_type === "comment" && r.subject?.post_id)
    return `/post/${r.subject.post_id}`;
  if (
    (r.subject_type === "profile" || r.subject_type === "user") &&
    r.subject?.handle
  )
    return `/u/${r.subject.handle}`;
  return null;
}

function SubjectCell({ r }: { r: ReportRow }) {
  const link = subjectLink(r);
  if (!link) {
    return <span className="capitalize text-bone-mut">{r.subject_type}</span>;
  }
  return (
    <Link
      href={link}
      target="_blank"
      className="rounded-md capitalize text-gold hover:underline"
    >
      {r.subject_type}
    </Link>
  );
}

export default function AdminReportsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  const load = useCallback((f: Filter) => {
    setStatus("loading");
    void realmFetch<{ reports: ReportRow[] }>(
      `/api/admin/reports?status=${f}`
    ).then((res) => {
      if (res.status === 401 || res.status === 403) setStatus("sealed");
      else if (res.ok && res.data?.reports) {
        setReports(res.data.reports);
        setStatus("ok");
      } else setStatus("error");
    });
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  async function reopen(id: string) {
    setBusyId(id);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean }>("/api/admin/reports", {
      method: "POST",
      json: { report_id: id, action: "reopen" },
    });
    if (res.ok && res.data?.ok) load(filter);
    else setNote("Could not reopen the report. Try again.");
    setBusyId(null);
  }

  if (status === "sealed") return <SealedChamber />;

  const statusBadge = (r: ReportRow) => (
    <Badge variant={r.status === "open" ? "gold" : "default"}>{r.status}</Badge>
  );

  const reopenButton = (r: ReportRow, size: "sm" | "md") =>
    r.status !== "open" ? (
      <Button
        variant="glass"
        size={size}
        className={size === "md" ? TOUCH : undefined}
        disabled={busyId === r.id}
        onClick={() => void reopen(r.id)}
      >
        Reopen
      </Button>
    ) : null;

  return (
    <AdminStack>
      <AdminHeader title="Reports" kicker="The full history of judgments" />

      <SegmentedControl
        label="Report status"
        value={filter}
        onValueChange={(next) => setFilter(next as Filter)}
        items={FILTERS.map((f) => ({
          value: f,
          label: <span className="capitalize">{f}</span>,
        }))}
      />

      {note ? <AdminNote>{note}</AdminNote> : null}

      {showSkeleton ? (
        <BoardSkeleton rows={6} columns={6} />
      ) : status === "loading" ? null : status === "error" ? (
        <AdminError
          title="The docket could not be read"
          body="The judgment history did not come back. Try reading it again."
          onRetry={() => load(filter)}
        />
      ) : reports.length === 0 ? (
        <Card pad="lg">
          <EmptyState
            icon="scroll"
            title="No reports match this filter"
            body={
              filter === "all"
                ? "Nothing has been reported in the realm yet. The docket fills as members flag what they see."
                : "Nothing sits under this filter. Switch to All to see the whole docket."
            }
            action={
              filter === "all" ? undefined : (
                <Button
                  variant="glass"
                  size="md"
                  className={TOUCH}
                  onClick={() => setFilter("all")}
                >
                  Show the whole docket
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Board
          label="Report history"
          rows={reports}
          rowKey={(r) => r.id}
          columns={[
            {
              key: "subject",
              header: "Subject",
              className: "whitespace-nowrap",
              cell: (r) => <SubjectCell r={r} />,
            },
            {
              key: "reason",
              header: "Reason",
              className: "max-w-[14rem]",
              cell: (r) => r.reason,
            },
            {
              key: "reporter",
              header: "Reporter",
              className: "whitespace-nowrap",
              cell: (r) => personName(r.reporter),
            },
            {
              key: "status",
              header: "Status",
              className: "whitespace-nowrap",
              cell: (r) => statusBadge(r),
            },
            {
              key: "resolver",
              header: "Judged by",
              className: "whitespace-nowrap",
              cell: (r) => personName(r.resolver),
            },
            {
              key: "note",
              header: "Note",
              className: "max-w-[12rem] text-bone-faint",
              cell: (r) => r.resolution_note || "none",
            },
            {
              key: "actions",
              header: <span className="sr-only">Actions</span>,
              className: "whitespace-nowrap",
              cell: (r) => reopenButton(r, "sm"),
            },
          ]}
          card={(r) => (
            <BoardCard
              title={<SubjectCell r={r} />}
              subtitle={r.reason}
              badges={statusBadge(r)}
              stats={[
                { label: "Reporter", value: personName(r.reporter) },
                { label: "Judged by", value: personName(r.resolver) },
                { label: "Note", value: r.resolution_note || "none" },
              ]}
              actions={reopenButton(r, "md")}
            />
          )}
        />
      )}
    </AdminStack>
  );
}
