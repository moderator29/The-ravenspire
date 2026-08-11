"use client";

import { useCallback, useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { houses as houseData } from "@/lib/data/houses";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  AdminError,
  AdminHeader,
  AdminNote,
  AdminStack,
  SealedChamber,
  StatTile,
  TOUCH,
} from "@/app/admin/ui";

interface HouseRow {
  slug: string;
  name: string;
  motto: string | null;
  sigil: string | null;
  color: string | null;
  member_count: number;
  glory: number;
}

/* Shaped like a house row: a rank, a name, a motto, a glory bar. */
function HousesSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <Card key={i} pad="sm">
          <div className="flex items-center gap-3">
            <Skeleton radius="sm" className="h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <Skeleton radius="sm" className="h-3.5 w-2/5" />
              <Skeleton radius="sm" className="mt-1.5 h-2.5 w-3/5" />
              <Skeleton radius="sm" className="mt-2 h-1.5 w-full" />
            </div>
            <Skeleton radius="md" className="h-9 w-20 shrink-0" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function AdminHousesPage() {
  const [rows, setRows] = useState<HouseRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "gold" | "danger"; text: string } | null>(
    null
  );
  const [pendingAdjust, setPendingAdjust] = useState<HouseRow | null>(null);
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  const [nameDraft, setNameDraft] = useState("");
  const [mottoDraft, setMottoDraft] = useState("");
  const [gloryDelta, setGloryDelta] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    setStatus("loading");
    void realmFetch<{ houses: HouseRow[] }>("/api/admin/houses").then((res) => {
      if (res.status === 401 || res.status === 403) {
        setStatus("sealed");
      } else if (res.ok && res.data?.houses) {
        setRows(res.data.houses);
        setStatus("ok");
      } else {
        setStatus("error");
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openEditor(row: HouseRow) {
    if (openSlug === row.slug) {
      setOpenSlug(null);
      return;
    }
    setOpenSlug(row.slug);
    setNameDraft(row.name);
    setMottoDraft(row.motto ?? "");
    setGloryDelta("");
    setReason("");
    setNote(null);
  }

  function applyUpdated(updated: HouseRow) {
    setRows((prev) =>
      [...prev.map((r) => (r.slug === updated.slug ? updated : r))].sort(
        (a, b) => b.glory - a.glory
      )
    );
  }

  async function saveDetails(row: HouseRow) {
    setBusy(true);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; house?: HouseRow }>(
      "/api/admin/houses",
      {
        method: "POST",
        json: {
          action: "edit",
          slug: row.slug,
          name: nameDraft,
          motto: mottoDraft,
        },
      }
    );
    if (res.ok && res.data?.ok && res.data.house) applyUpdated(res.data.house);
    else setNote({ tone: "danger", text: "The edit did not take. Try again." });
    setBusy(false);
  }

  function requestAdjust(row: HouseRow) {
    const delta = Number(gloryDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      setNote({ tone: "danger", text: "Enter a non-zero glory adjustment." });
      return;
    }
    setNote(null);
    setPendingAdjust(row);
  }

  async function adjustGlory(row: HouseRow) {
    const delta = Number(gloryDelta);
    setBusy(true);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; house?: HouseRow; error?: string }>(
      "/api/admin/houses",
      {
        method: "POST",
        json: {
          action: "adjust_glory",
          slug: row.slug,
          glory_delta: delta,
          reason,
        },
      }
    );
    if (res.ok && res.data?.ok && res.data.house) {
      applyUpdated(res.data.house);
      setGloryDelta("");
      setReason("");
      setNote({
        tone: "gold",
        text: `${row.name} adjusted by ${delta.toLocaleString()} Glory. The change is in the audit log.`,
      });
    } else if (res.data?.error === "delta_too_large") {
      setNote({ tone: "danger", text: "That adjustment is too large." });
    } else {
      setNote({ tone: "danger", text: "The adjustment did not take. Try again." });
    }
    setBusy(false);
  }

  if (status === "sealed") return <SealedChamber />;

  const maxGlory = Math.max(1, ...rows.map((r) => r.glory));
  const totalSworn = rows.reduce((s, r) => s + r.member_count, 0);
  const totalGlory = rows.reduce((s, r) => s + r.glory, 0);
  const pendingDelta = Number(gloryDelta);

  return (
    <AdminStack>
      <AdminHeader
        title="Houses"
        kicker="Rename, re-motto, and adjust the glory of the six great houses"
      />

      {note ? <AdminNote tone={note.tone}>{note.text}</AdminNote> : null}

      {status === "error" ? (
        <AdminError
          title="The house rolls could not be read"
          body="The banners did not come back. Try reading them again."
          onRetry={load}
        />
      ) : null}

      {status === "ok" && rows.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:gap-2 sm:max-w-md">
          <StatTile
            icon="user"
            value={totalSworn.toLocaleString()}
            label="Sworn members"
          />
          <StatTile
            icon="medal"
            value={totalGlory.toLocaleString()}
            label="Total glory"
          />
        </div>
      ) : null}

      {status === "ok" ? <HouseOps /> : null}

      {showSkeleton ? (
        <HousesSkeleton />
      ) : status === "loading" ? null : status === "ok" && rows.length === 0 ? (
        <Card pad="lg">
          <EmptyState
            icon="banner"
            title="No houses stand on the rolls"
            body="The six great houses are seeded by the realm's own migration. If none appear, the archives have not been reached."
            action={
              <Button variant="glass" size="md" className={TOUCH} onClick={load}>
                Read the rolls again
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => {
            const meta = houseData.find((h) => h.slug === row.slug);
            const open = openSlug === row.slug;
            return (
              <Card key={row.slug} pad="sm">
                <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-4">
                  <span className="tnum w-5 shrink-0 text-center font-display text-lg text-bone-faint">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate font-display text-sm font-semibold text-bone">
                      {row.name}
                    </p>
                    <p className="truncate text-xs text-bone-faint">
                      {row.motto ?? meta?.motto ?? ""}
                    </p>
                    <div className="bar-track mt-2 h-1.5 w-full">
                      <div
                        className="bar-gold h-full"
                        style={{
                          width: `${Math.max(4, (row.glory / maxGlory) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-sm font-semibold text-gold">
                      {row.glory.toLocaleString()} Glory
                    </p>
                    <p className="tnum text-xs text-bone-faint">
                      {row.member_count.toLocaleString()} sworn
                    </p>
                  </div>
                  <Button
                    variant="glass"
                    size="md"
                    className={`shrink-0 ${TOUCH}`}
                    aria-expanded={open}
                    onClick={() => openEditor(row)}
                  >
                    {open ? "Close" : "Manage"}
                  </Button>
                </div>

                {open ? (
                  <div className="mt-4 grid grid-cols-1 gap-4 border-t border-steel-line pt-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-3">
                      <SectionHeader title="Name and motto" className="px-0 pt-0" />
                      <Field label="House name" required>
                        <Input
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          placeholder="House name"
                          className="min-h-11 md:min-h-0"
                        />
                      </Field>
                      <Field label="Motto">
                        <Input
                          value={mottoDraft}
                          onChange={(e) => setMottoDraft(e.target.value)}
                          placeholder="What the banner says"
                          className="min-h-11 md:min-h-0"
                        />
                      </Field>
                      <div>
                        <Button
                          variant="gold"
                          size="md"
                          className={TOUCH}
                          loading={busy}
                          onClick={() => void saveDetails(row)}
                        >
                          Save details
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <SectionHeader title="Glory adjustment" className="px-0 pt-0" />
                      <Field
                        label="Delta"
                        description="Positive adds, negative removes. Recorded in the audit log."
                      >
                        <Input
                          value={gloryDelta}
                          onChange={(e) => setGloryDelta(e.target.value)}
                          inputMode="numeric"
                          placeholder="-500"
                          className="tnum min-h-11 md:min-h-0"
                        />
                      </Field>
                      <Field label="Reason">
                        <Input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Why the realm is moving this glory"
                          className="min-h-11 md:min-h-0"
                        />
                      </Field>
                      <div>
                        <Button
                          variant="gold"
                          size="md"
                          className={TOUCH}
                          disabled={busy}
                          onClick={() => requestAdjust(row)}
                        >
                          Apply adjustment
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingAdjust !== null}
        onOpenChange={(next) => {
          if (!next) setPendingAdjust(null);
        }}
        title="Move this House's Glory?"
        description={
          pendingAdjust
            ? `${pendingAdjust.name} goes from ${pendingAdjust.glory.toLocaleString()} to ${(pendingAdjust.glory + pendingDelta).toLocaleString()} Glory. Standings shift for every member sworn to it, and only an opposite adjustment can put it back.`
            : undefined
        }
        confirmLabel="Apply it"
        cancelLabel="Leave the Glory alone"
        tone="danger"
        pending={busy}
        onConfirm={() => {
          const row = pendingAdjust;
          if (!row) return;
          setPendingAdjust(null);
          void adjustGlory(row);
        }}
      />
    </AdminStack>
  );
}

/* Steward controls for the two Houses V2 jobs that are not automatic.

   Recompute is idempotent and derives everything from the ledger and the oath
   history, so pressing it twice is safe. The cron hits the same route. */
function HouseOps() {
  const [busy, setBusy] = useState<"recompute" | "clash" | null>(null);
  const [note, setNote] = useState<{ tone: "gold" | "danger"; text: string } | null>(
    null
  );
  const [title, setTitle] = useState("");
  const [token, setToken] = useState("");

  async function recompute() {
    setBusy("recompute");
    setNote(null);
    const res = await realmFetch<{
      ok?: boolean;
      recomputed?: boolean;
      season_id?: number;
      standings?: { slug: string; rank: number; score: number }[];
      reason?: string;
    }>("/api/houses/recompute", { method: "POST" });
    setBusy(null);
    if (!res.ok || !res.data?.ok) {
      setNote({ tone: "danger", text: "The recompute did not run." });
      return;
    }
    if (!res.data.recomputed) {
      setNote({
        tone: "danger",
        text: "No season has started, so there is nothing to resolve.",
      });
      return;
    }
    const leader = res.data.standings?.[0];
    setNote({
      tone: "gold",
      text: `Season ${res.data.season_id} resolved. ${
        leader ? `${leader.slug} leads on ${leader.score.toLocaleString()}.` : ""
      }`,
    });
  }

  async function callClash() {
    const name = title.trim();
    const ticker = token.trim().replace(/^\$/, "");
    if (!name || !ticker) {
      setNote({ tone: "danger", text: "A Clash needs a name and a token." });
      return;
    }
    setBusy("clash");
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; error?: string }>(
      "/api/houses/clashes",
      { method: "POST", json: { title: name, token: ticker } }
    );
    setBusy(null);
    if (res.ok && res.data?.ok) {
      setTitle("");
      setToken("");
      setNote({ tone: "gold", text: "The Clash is called. It runs 48 hours from now." });
    } else {
      setNote({
        tone: "danger",
        text: res.data?.error ?? "The Clash could not be called.",
      });
    }
  }

  return (
    <Card pad="sm">
      <h2 className="font-display text-base font-semibold text-bone md:text-sm">
        Season operations
      </h2>
      <p className="mt-1 text-xs text-bone-mut">
        Standings are the sum of each House&apos;s top 20 contributors, and the
        six seasonal titles are derived from what members actually did. Both are
        recomputed here and by the cron.
      </p>

      <div className="mt-3">
        <Button
          variant="glass"
          size="md"
          className={TOUCH}
          loading={busy === "recompute"}
          disabled={busy !== null}
          onClick={() => void recompute()}
        >
          {busy === "recompute"
            ? "Resolving"
            : "Recompute standings and leadership"}
        </Button>
      </div>

      <div className="mt-4 border-t border-steel-line pt-4">
        <SectionHeader title="Call a Clash" className="px-0 pt-0" />
        <p className="mt-2 text-xs text-bone-mut">
          A 48 hour window on one token. Only Calls made inside it count.
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Clash name" className="min-w-0 flex-1" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The name of the Clash"
              className="min-h-11 md:min-h-0"
            />
          </Field>
          <Field label="Token" className="sm:w-32" required>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="TOKEN"
              className="min-h-11 uppercase md:min-h-0"
            />
          </Field>
          <Button
            variant="gold"
            size="md"
            className={`shrink-0 ${TOUCH}`}
            loading={busy === "clash"}
            disabled={busy !== null}
            onClick={() => void callClash()}
          >
            {busy === "clash" ? "Calling" : "Call it"}
          </Button>
        </div>
      </div>

      {note ? (
        <div className="mt-3">
          <AdminNote tone={note.tone}>{note.text}</AdminNote>
        </div>
      ) : null}
    </Card>
  );
}
