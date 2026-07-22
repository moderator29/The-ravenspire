"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";

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
  if (!p) return "-";
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

export default function AdminReportsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function load(f: Filter) {
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
  }

  useEffect(() => {
    load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

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

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-bone sm:text-2xl">
        Reports
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        The full history of judgments
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
              filter === f
                ? "border-gold bg-panel text-gold"
                : "border-steel-line text-bone-mut hover:text-bone"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {note && <p className="mt-3 text-xs text-ember">{note}</p>}

      <div className="glass mt-4 overflow-x-auto">
        {status === "loading" ? (
          <div className="h-40 animate-pulse" />
        ) : status === "error" ? (
          <p className="p-6 text-sm text-bone-mut">
            The docket could not be read. Try again shortly.
          </p>
        ) : reports.length === 0 ? (
          <div className="flex items-center gap-3 p-6">
            <Icon name="scroll" className="h-5 w-5 text-bone-faint" />
            <p className="text-sm text-bone-mut">
              No reports match this filter.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead>
              <tr className="border-b border-steel-line text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Reporter</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Judged by</th>
                <th className="px-4 py-3 font-medium">Note</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const link = subjectLink(r);
                return (
                  <tr key={r.id} className="border-b border-steel-line last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-3">
                      {link ? (
                        <Link
                          href={link}
                          target="_blank"
                          className="text-gold hover:underline"
                        >
                          <span className="capitalize">{r.subject_type}</span>
                        </Link>
                      ) : (
                        <span className="capitalize text-bone-mut">
                          {r.subject_type}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[14rem] px-4 py-3 text-bone-mut">
                      {r.reason}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-bone-mut">
                      {personName(r.reporter)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`capitalize ${
                          r.status === "open"
                            ? "text-gold"
                            : r.status === "dismissed"
                              ? "text-bone-faint"
                              : "text-bone-mut"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-bone-mut">
                      {personName(r.resolver)}
                    </td>
                    <td className="max-w-[12rem] px-4 py-3 text-xs text-bone-faint">
                      {r.resolution_note || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {r.status !== "open" && (
                        <button
                          type="button"
                          className="btn-glass px-2.5 py-1 text-xs"
                          disabled={busyId === r.id}
                          onClick={() => void reopen(r.id)}
                        >
                          Reopen
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
