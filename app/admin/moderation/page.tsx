"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { ConfirmDialog } from "@/components/ui/modal";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  AdminError,
  AdminHeader,
  AdminNote,
  AdminStack,
  SealedChamber,
  TOUCH,
} from "@/app/admin/ui";

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
        The reported {r.subject_type} could not be loaded. It may have been
        deleted already.
      </p>
    );
  }
  if (r.subject_type === "profile" || r.subject_type === "user") {
    return (
      <div className="text-sm">
        <p className="flex flex-wrap items-center gap-2 font-semibold text-bone">
          {s.display_name?.trim() || (s.handle ? `@${s.handle}` : "Nameless")}
          {s.is_banned ? <Badge variant="danger">Banned</Badge> : null}
        </p>
        {s.bio ? <p className="mt-1 text-bone-mut">{s.bio}</p> : null}
      </div>
    );
  }
  return (
    <div className="text-sm">
      <p className="flex flex-wrap items-center gap-2 text-xs text-bone-faint">
        {s.author?.display_name?.trim() ||
          (s.author?.handle ? `@${s.author.handle}` : "Unknown author")}
        {s.deleted ? <Badge variant="danger">Removed</Badge> : null}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-bone-mut">
        {s.body?.trim() || "(no text)"}
      </p>
    </div>
  );
}

/* Shaped like a report card: the meta rail, the reason, the quoted subject,
   the note field and the three verdict controls. */
function DocketSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <Card key={i} pad="sm">
          <div className="flex gap-2">
            <Skeleton radius="sm" className="h-4 w-16" />
            <Skeleton radius="sm" className="h-4 w-32" />
          </div>
          <Skeleton radius="sm" className="mt-3 h-3.5 w-2/5" />
          <Skeleton radius="lg" className="mt-3 h-20 w-full" />
          <Skeleton radius="md" className="mt-3 h-9 w-full" />
          <div className="mt-3 flex gap-2">
            <Skeleton radius="md" className="h-9 w-24" />
            <Skeleton radius="md" className="h-9 w-32" />
            <Skeleton radius="md" className="h-9 w-24" />
          </div>
        </Card>
      ))}
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
  const [takedown, setTakedown] = useState<ReportRow | null>(null);
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  const load = useCallback(() => {
    setStatus("loading");
    void realmFetch<{ reports: ReportRow[] }>("/api/admin/reports").then(
      (res) => {
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
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, action: "resolve" | "dismiss" | "takedown") {
    setBusyId(id);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; error?: string }>(
      "/api/admin/reports",
      { method: "POST", json: { report_id: id, action, note: notes[id] ?? "" } }
    );
    if (res.ok && res.data?.ok) {
      setReports((rows) => rows.filter((r) => r.id !== id));
    } else if (res.data?.error === "takedown_not_supported") {
      setNote("This subject cannot be taken down. Only posts and comments can.");
    } else {
      setNote("The judgment did not land. Try again.");
    }
    setBusyId(null);
  }

  if (status === "sealed") return <SealedChamber />;

  const canTakedown = (t: string) => t === "post" || t === "comment";

  return (
    <AdminStack>
      <AdminHeader title="Moderation" kicker="Open reports before the council" />

      {note ? <AdminNote>{note}</AdminNote> : null}

      {showSkeleton ? (
        <DocketSkeleton />
      ) : status === "loading" ? null : status === "error" ? (
        <AdminError
          title="The docket could not be read"
          body="The report queue did not come back. Try reading it again."
          onRetry={load}
        />
      ) : reports.length === 0 ? (
        <Card pad="lg">
          <EmptyState
            icon="shield"
            title="The realm rests"
            body="No open reports stand before the council. Judged reports keep their record in the history."
            action={
              <Button
                variant="glass"
                size="md"
                className={TOUCH}
                render={<Link href="/admin/reports" />}
              >
                View report history
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((r) => {
            const link = subjectLink(r);
            return (
              <Card key={r.id} pad="sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-bone-faint">
                  <Badge>{r.subject_type}</Badge>
                  <span>Reported by {reporterName(r.reporter)}</span>
                  <span className="tnum">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>

                <p className="mt-2 text-sm text-bone">
                  <span className="text-bone-faint">Reason: </span>
                  {r.reason}
                </p>

                <Card variant="inset" pad="sm" className="mt-3">
                  <SubjectPreview r={r} />
                  {link ? (
                    <Link
                      href={link}
                      target="_blank"
                      className="mt-2 inline-flex items-center gap-1 rounded-md text-xs text-gold hover:underline"
                    >
                      <Icon name="arrow" className="h-3.5 w-3.5" />
                      Open in a new tab
                    </Link>
                  ) : null}
                </Card>

                <Field
                  label="Resolution note"
                  description="Recorded with the verdict in the audit log."
                  className="mt-3"
                >
                  <Input
                    value={notes[r.id] ?? ""}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [r.id]: e.target.value }))
                    }
                    placeholder="Optional"
                    className="min-h-11 md:min-h-0"
                  />
                </Field>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="gold"
                    size="md"
                    className={TOUCH}
                    disabled={busyId === r.id}
                    onClick={() => void act(r.id, "resolve")}
                  >
                    Resolve
                  </Button>
                  {canTakedown(r.subject_type) ? (
                    <Button
                      variant="danger"
                      size="md"
                      className={TOUCH}
                      disabled={busyId === r.id}
                      onClick={() => setTakedown(r)}
                    >
                      Take down content
                    </Button>
                  ) : null}
                  <Button
                    variant="glass"
                    size="md"
                    className={TOUCH}
                    disabled={busyId === r.id}
                    onClick={() => void act(r.id, "dismiss")}
                  >
                    Dismiss
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={takedown !== null}
        onOpenChange={(next) => {
          if (!next) setTakedown(null);
        }}
        title="Take this content down?"
        description={
          takedown
            ? `The reported ${takedown.subject_type} is removed from the realm and the author loses it. This is recorded in the audit log and cannot be undone from here.`
            : undefined
        }
        confirmLabel="Take it down"
        cancelLabel="Leave it standing"
        tone="danger"
        pending={takedown !== null && busyId === takedown.id}
        onConfirm={() => {
          const r = takedown;
          if (!r) return;
          setTakedown(null);
          void act(r.id, "takedown");
        }}
      />
    </AdminStack>
  );
}
