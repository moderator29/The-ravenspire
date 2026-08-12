"use client";

import { useCallback, useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Toggle } from "@/components/ui/field";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  AdminError,
  AdminHeader,
  AdminNote,
  AdminStack,
  SealedChamber,
  TOUCH,
} from "@/app/admin/ui";

interface FlagRow {
  key: string;
  enabled: boolean;
  note: string | null;
  consumed?: boolean;
}

/* Shaped like a flag row: a key, a note, a switch. */
function FlagsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} pad="sm">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Skeleton radius="sm" className="h-3.5 w-1/3" />
              <Skeleton radius="sm" className="mt-2 h-2.5 w-3/5" />
            </div>
            <Skeleton radius="sm" className="h-6 w-11 shrink-0" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function AdminFlagsPage() {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  const [newKey, setNewKey] = useState("");
  const [newNote, setNewNote] = useState("");

  const load = useCallback(() => {
    setStatus("loading");
    void realmFetch<{ flags: FlagRow[] }>("/api/admin/flags").then((res) => {
      if (res.status === 401 || res.status === 403) {
        setStatus("sealed");
      } else if (res.ok && res.data?.flags) {
        setFlags(res.data.flags);
        setStatus("ok");
      } else {
        setStatus("error");
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function applyUpdated(updated: FlagRow) {
    setFlags((rows) => {
      const exists = rows.some((r) => r.key === updated.key);
      const next = exists
        ? rows.map((r) => (r.key === updated.key ? updated : r))
        : [...rows, updated];
      return next.sort((a, b) => a.key.localeCompare(b.key));
    });
  }

  async function save(key: string, patch: { enabled?: boolean; note?: string }) {
    setBusyKey(key);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; flag?: FlagRow }>(
      "/api/admin/flags",
      { method: "POST", json: { key, ...patch } }
    );
    if (res.ok && res.data?.ok && res.data.flag) applyUpdated(res.data.flag);
    else setNote("The lever would not move. Try again.");
    setBusyKey(null);
  }

  async function addFlag() {
    const key = newKey.trim();
    if (!/^[a-z0-9_]{2,48}$/.test(key)) {
      setNote(
        "Keys are lowercase letters, numbers, and underscores, 2 to 48 characters."
      );
      return;
    }
    setBusyKey(key);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; flag?: FlagRow; error?: string }>(
      "/api/admin/flags",
      { method: "POST", json: { key, enabled: false, note: newNote } }
    );
    if (res.ok && res.data?.ok && res.data.flag) {
      applyUpdated(res.data.flag);
      setNewKey("");
      setNewNote("");
    } else {
      setNote("The flag could not be registered. Try again.");
    }
    setBusyKey(null);
  }

  if (status === "sealed") return <SealedChamber />;

  return (
    <AdminStack>
      <AdminHeader title="Feature Flags" kicker="Levers of the realm" />

      {note ? <AdminNote>{note}</AdminNote> : null}

      <Card pad="sm">
        <SectionHeader title="Register a new flag" className="px-0 pt-0" />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Key"
            description="Lowercase letters, numbers and underscores."
            required
          >
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="flag_key"
              className="min-h-11 font-mono md:min-h-0"
            />
          </Field>
          <Field label="Note">
            <Input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="What does this lever control?"
              className="min-h-11 md:min-h-0"
            />
          </Field>
        </div>
        <Button
          variant="gold"
          size="md"
          className={`mt-3 ${TOUCH}`}
          onClick={() => void addFlag()}
        >
          Register flag
        </Button>
      </Card>

      {showSkeleton ? (
        <FlagsSkeleton />
      ) : status === "loading" ? null : status === "error" ? (
        <AdminError
          title="The lever room could not be reached"
          body="The flag list did not come back. Try reading it again."
          onRetry={load}
        />
      ) : flags.length === 0 ? (
        <Card pad="lg">
          <EmptyState
            icon="sliders"
            title="No flags are registered"
            body="The realm runs on its defaults until a lever exists. Register the first one above."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {flags.map((f) => {
            const draft = noteDrafts[f.key];
            const editing = draft !== undefined;
            return (
              <Card key={f.key} pad="sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-semibold text-bone">
                        {f.key}
                      </p>
                      {f.consumed === false ? (
                        <Badge>Not yet wired</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-bone-mut">
                      {f.note?.trim() || "No note recorded for this flag."}
                    </p>
                  </div>
                  <Toggle
                    checked={f.enabled}
                    onCheckedChange={(next) => void save(f.key, { enabled: next })}
                    disabled={busyKey === f.key}
                    label={`Enable ${f.key}`}
                  />
                </div>

                {editing ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Field label="Note" className="min-w-0 flex-1 sm:max-w-md">
                      <Input
                        value={draft}
                        onChange={(e) =>
                          setNoteDrafts((d) => ({ ...d, [f.key]: e.target.value }))
                        }
                        placeholder="What does this lever control?"
                        className="min-h-11 md:min-h-0"
                      />
                    </Field>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="gold"
                        size="md"
                        className={TOUCH}
                        disabled={busyKey === f.key}
                        onClick={async () => {
                          await save(f.key, { note: draft });
                          setNoteDrafts((d) => {
                            const next = { ...d };
                            delete next[f.key];
                            return next;
                          });
                        }}
                      >
                        Save note
                      </Button>
                      <Button
                        variant="ghost"
                        size="md"
                        className={TOUCH}
                        onClick={() =>
                          setNoteDrafts((d) => {
                            const next = { ...d };
                            delete next[f.key];
                            return next;
                          })
                        }
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="glass"
                    size="sm"
                    className={`mt-3 ${TOUCH}`}
                    onClick={() =>
                      setNoteDrafts((d) => ({ ...d, [f.key]: f.note ?? "" }))
                    }
                  >
                    Edit note
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AdminStack>
  );
}
