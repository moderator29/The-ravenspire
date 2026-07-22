"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";

interface SubjectAuthor {
  handle: string | null;
  display_name: string | null;
}
interface Subject {
  id?: string;
  body?: string;
  kind?: string;
  deleted?: boolean;
  post_id?: string;
  handle?: string | null;
  display_name?: string | null;
  bio?: string | null;
  is_banned?: boolean;
  author?: SubjectAuthor | null;
}

interface ReportRow {
  id: string;
  subject_type: string;
  subject_id: string;
  reason: string;
  status: string;
  created_at: string;
  reporter: { handle: string | null; display_name: string | null } | null;
  subject: Subject | null;
}

function reporterName(r: ReportRow["reporter"]): string {
  if (!r) return "Anonymous";
  return r.display_name?.trim() || (r.handle ? `@${r.handle}` : "Anonymous");
}

function subjectLink(r: ReportRow): string | null {
  const s = r.subject;
  if (r.subject_type === "post") return `/post/${r.subject_id}`;
  if (r.subject_type === "comment" && s?.post_id) return `/post/${s.post_id}`;
  if ((r.subject_type === "profile" || r.subject_type === "user") && s?.handle)
    return `/u/${s.handle}`;
  return null;
}

function SubjectPreview({ r }: { r: ReportRow }) {
  const s = r.subject;
  if (!s) {
    return (
      <p className="text-xs text-bone-faint">
        The reported {r.subject_type} could not be loaded (it may have been
        deleted).
      </p>
    );
  }
  if (r.subject_type === "profile" || r.subject_type === "user") {
    return (
      <div className="text-sm">
        <p className="font-semibold text-bone">
          {s.display_name?.trim() || (s.handle ? `@${s.handle}` : "Nameless")}
          {s.is_banned && (
            <span className="ml-2 text-[10px] uppercase tracking-[0.16em] text-ember">
              Banned
            </span>
          )}
        </p>
        {s.bio && <p className="mt-1 text-bone-mut">{s.bio}</p>}
      </div>
    );
  }
  return (
    <div className="text-sm">
      <p className="text-xs text-bone-faint">
        {s.author?.display_name?.trim() ||
          (s.author?.handle ? `@${s.author.handle}` : "Unknown author")}
        {s.deleted && (
          <span className="ml-2 text-[10px] uppercase tracking-[0.16em] text-ember">
            Removed
          </span>
        )}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-bone-mut">
        {s.body?.trim() || "(no text)"}
      </p>
    </div>
  );
}

export default function AdminModerationPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void realmFetch<{ reports: ReportRow[] }>("/api/admin/reports").then(
      (res) => {
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          setStatus("sealed");
        } else if (res.ok && res.data?.reports) {
          setReports(res.data.reports);
          setStatus("ok");
        } else {
          setStatus("error");
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function act(
    id: string,
    action: "resolve" | "dismiss" | "takedown"
  ) {
    setBusyId(id);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; error?: string }>(
      "/api/admin/reports",
      { method: "POST", json: { report_id: id, action, note: notes[id] ?? "" } }
    );
    if (res.ok && res.data?.ok) {
      setReports((rows) => rows.filter((r) => r.id !== id));
    } else if (res.data?.error === "takedown_not_supported") {
      setNote("This subject cannot be taken down (only posts and comments).");
    } else {
      setNote("The judgment did not land. Try again.");
    }
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

  const canTakedown = (t: string) => t === "post" || t === "comment";

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-bone sm:text-2xl">
        Moderation
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Open reports before the council
      </p>

      {note && <p className="mt-3 text-xs text-ember">{note}</p>}

      <div className="mt-4 flex flex-col gap-3">
        {status === "loading" &&
          [0, 1, 2].map((i) => (
            <div key={i} className="glass glass-sm h-40 animate-pulse" />
          ))}
        {status === "error" && (
          <div className="glass glass-sm p-6">
            <p className="text-sm text-bone-mut">
              The docket could not be read. Try again shortly.
            </p>
          </div>
        )}
        {status === "ok" && reports.length === 0 && (
          <div className="glass glass-sm flex items-center gap-3 p-6">
            <Icon name="shield" className="h-5 w-5 text-bone-faint" />
            <p className="text-sm text-bone-mut">
              The realm rests. No open reports.
            </p>
          </div>
        )}
        {reports.map((r) => {
          const link = subjectLink(r);
          return (
            <div key={r.id} className="glass glass-sm p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-bone-faint">
                <span className="rounded-full border border-steel-line bg-panel px-2 py-0.5 uppercase tracking-[0.16em] text-bone-mut">
                  {r.subject_type}
                </span>
                <span>Reported by {reporterName(r.reporter)}</span>
                <span className="tnum">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>

              <p className="mt-2 text-sm text-bone">
                <span className="text-bone-faint">Reason: </span>
                {r.reason}
              </p>

              <div className="mt-3 rounded-xl border border-steel-line bg-panel/60 p-3">
                <SubjectPreview r={r} />
                {link && (
                  <Link
                    href={link}
                    target="_blank"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-gold hover:underline"
                  >
                    <Icon name="arrow" className="h-3.5 w-3.5" />
                    Open in a new tab
                  </Link>
                )}
              </div>

              <input
                value={notes[r.id] ?? ""}
                onChange={(e) =>
                  setNotes((n) => ({ ...n, [r.id]: e.target.value }))
                }
                placeholder="Resolution note (optional)"
                className="mt-3 w-full rounded-xl border border-steel-line bg-panel px-3 py-2 text-sm text-bone outline-none placeholder:text-bone-faint"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-gold px-3 py-1.5 text-xs"
                  disabled={busyId === r.id}
                  onClick={() => void act(r.id, "resolve")}
                >
                  Resolve
                </button>
                {canTakedown(r.subject_type) && (
                  <button
                    type="button"
                    className="btn-glass px-3 py-1.5 text-xs text-ember"
                    disabled={busyId === r.id}
                    onClick={() => void act(r.id, "takedown")}
                  >
                    Take down content
                  </button>
                )}
                <button
                  type="button"
                  className="btn-glass px-3 py-1.5 text-xs"
                  disabled={busyId === r.id}
                  onClick={() => void act(r.id, "dismiss")}
                >
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
