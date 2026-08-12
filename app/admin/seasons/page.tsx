"use client";

import { useCallback, useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { Badge } from "@/components/ui/badge";
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
  TOUCH,
} from "@/app/admin/ui";

interface SeasonRow {
  id: number;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  vault_raven: number;
}

interface SettlementRow {
  rank: number;
  points: number;
  renown: number;
  glory: number;
  member: {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

/* The three decrees that cannot be taken back with a second click, so each one
   asks first. Activating retires whichever season is active today, closing ends
   the window members are competing in, and settling freezes the ledger. */
type Decree = "activate" | "close" | "settle";

interface PendingDecree {
  id: number;
  name: string;
  decree: Decree;
}

const DECREE_COPY: Record<
  Decree,
  { title: string; confirm: string; tone: "gold" | "danger"; body: (n: string) => string }
> = {
  activate: {
    title: "Make this the active season?",
    confirm: "Activate",
    tone: "gold",
    body: (n) =>
      `${n} becomes the season the realm competes in, and whichever season is active today stops being so. Oaths, standings and Calls all follow the active season.`,
  },
  close: {
    title: "Close this season?",
    confirm: "Close it",
    tone: "danger",
    body: (n) =>
      `${n} stops accepting contribution the moment it closes. Members can no longer earn toward it, and the standings stand as they are.`,
  },
  settle: {
    title: "Settle this season?",
    confirm: "Settle",
    tone: "danger",
    body: (n) =>
      `Every member's final Points, Renown and Glory for ${n} are frozen into the settlement ledger, kept in points. Re-running this refreshes the snapshot and overwrites the last one.`,
  },
};

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function memberName(m: SettlementRow["member"]): string {
  return m?.display_name?.trim() || (m?.handle ? `@${m.handle}` : "A member");
}

/* Shaped like a season card: a title rule, three stats, a row of decrees. */
function SeasonsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1].map((i) => (
        <Card key={i} pad="sm">
          <Skeleton radius="sm" className="h-4 w-2/5" />
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((c) => (
              <div key={c}>
                <Skeleton radius="sm" className="h-3.5 w-3/4" />
                <Skeleton radius="sm" className="mt-1.5 h-2.5 w-1/2" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton radius="md" className="h-9 w-24" />
            <Skeleton radius="md" className="h-9 w-20" />
            <Skeleton radius="md" className="h-9 w-20" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function AdminSeasonsPage() {
  const [rows, setRows] = useState<SeasonRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const [busyId, setBusyId] = useState<number | "new" | null>(null);
  const [note, setNote] = useState<{ tone: "gold" | "danger"; text: string } | null>(
    null
  );
  const [openId, setOpenId] = useState<number | null>(null);
  const [settlementForId, setSettlementForId] = useState<number | null>(null);
  const [settlementRows, setSettlementRows] = useState<SettlementRow[] | null>(
    null
  );
  const [settlementTotal, setSettlementTotal] = useState(0);
  const [pending, setPending] = useState<PendingDecree | null>(null);
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newVault, setNewVault] = useState("");

  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editVault, setEditVault] = useState("");

  const load = useCallback(() => {
    setStatus("loading");
    void realmFetch<{ seasons: SeasonRow[] }>("/api/admin/seasons").then(
      (res) => {
        if (res.status === 401 || res.status === 403) {
          setStatus("sealed");
        } else if (res.ok && res.data?.seasons) {
          setRows(res.data.seasons);
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

  function applyUpdated(updated: SeasonRow) {
    setRows((prev) => {
      const exists = prev.some((s) => s.id === updated.id);
      const next = exists
        ? prev.map((s) => (s.id === updated.id ? updated : s))
        : [...prev, updated];
      return next.sort((a, b) => a.id - b.id);
    });
  }

  async function create() {
    if (!newName.trim()) {
      setNote({ tone: "danger", text: "A season needs a name." });
      return;
    }
    setBusyId("new");
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; season?: SeasonRow }>(
      "/api/admin/seasons",
      {
        method: "POST",
        json: {
          action: "create",
          name: newName,
          starts_at: newStart,
          ends_at: newEnd,
          vault_raven: newVault,
        },
      }
    );
    if (res.ok && res.data?.ok && res.data.season) {
      applyUpdated(res.data.season);
      setNewName("");
      setNewStart("");
      setNewEnd("");
      setNewVault("");
    } else {
      setNote({ tone: "danger", text: "The season could not be written. Try again." });
    }
    setBusyId(null);
  }

  function openEditor(s: SeasonRow) {
    if (openId === s.id) {
      setOpenId(null);
      return;
    }
    setOpenId(s.id);
    setEditName(s.name);
    setEditStart(toDateInput(s.starts_at));
    setEditEnd(toDateInput(s.ends_at));
    setEditVault(String(s.vault_raven));
    setNote(null);
  }

  async function saveEdit(s: SeasonRow) {
    setBusyId(s.id);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; season?: SeasonRow }>(
      "/api/admin/seasons",
      {
        method: "POST",
        json: {
          action: "edit",
          id: s.id,
          name: editName,
          starts_at: editStart,
          ends_at: editEnd,
          vault_raven: editVault,
        },
      }
    );
    if (res.ok && res.data?.ok && res.data.season) applyUpdated(res.data.season);
    else setNote({ tone: "danger", text: "The edit did not take. Try again." });
    setBusyId(null);
  }

  async function setSeasonStatus(id: number, action: "activate" | "close") {
    setBusyId(id);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; season?: SeasonRow }>(
      "/api/admin/seasons",
      { method: "POST", json: { action, id } }
    );
    if (res.ok && res.data?.ok && res.data.season) applyUpdated(res.data.season);
    else setNote({ tone: "danger", text: "The decree did not take. Try again." });
    setBusyId(null);
  }

  async function viewSettlement(id: number) {
    setSettlementForId(id);
    setSettlementRows(null);
    const res = await realmFetch<{
      settlement?: SettlementRow[];
      totalPoints?: number;
    }>(`/api/admin/seasons?settlement=${id}`);
    setSettlementRows(res.data?.settlement ?? []);
    setSettlementTotal(res.data?.totalPoints ?? 0);
  }

  async function settleSeason(id: number) {
    setBusyId(id);
    setNote(null);
    const res = await realmFetch<{
      ok?: boolean;
      season?: SeasonRow;
      settled?: number;
      totalPoints?: number;
    }>("/api/admin/seasons", { method: "POST", json: { action: "settle", id } });
    if (res.ok && res.data?.ok) {
      if (res.data.season) applyUpdated(res.data.season);
      setNote({
        tone: "gold",
        text: `Season settled: ${res.data.settled ?? 0} members, ${(res.data.totalPoints ?? 0).toLocaleString()} points frozen.`,
      });
      await viewSettlement(id);
    } else {
      setNote({ tone: "danger", text: "The settlement did not take. Try again." });
    }
    setBusyId(null);
  }

  function runDecree(p: PendingDecree) {
    if (p.decree === "settle") void settleSeason(p.id);
    else void setSeasonStatus(p.id, p.decree);
  }

  if (status === "sealed") return <SealedChamber />;

  const copy = pending ? DECREE_COPY[pending.decree] : null;

  return (
    <AdminStack>
      <AdminHeader title="Seasons" kicker="The realm calendar" />

      {note ? <AdminNote tone={note.tone}>{note.text}</AdminNote> : null}

      <Card pad="sm">
        <SectionHeader title="Open a new season" className="px-0 pt-0" />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Season name" required>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="The Long Dusk"
              className="min-h-11 md:min-h-0"
            />
          </Field>
          <Field label="Vault (RAVEN)">
            <Input
              value={newVault}
              onChange={(e) => setNewVault(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              className="tnum min-h-11 md:min-h-0"
            />
          </Field>
          <Field label="Opens">
            <Input
              type="date"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="min-h-11 md:min-h-0"
            />
          </Field>
          <Field label="Closes">
            <Input
              type="date"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className="min-h-11 md:min-h-0"
            />
          </Field>
        </div>
        <Button
          variant="gold"
          size="md"
          className={`mt-3 ${TOUCH}`}
          loading={busyId === "new"}
          onClick={() => void create()}
        >
          {busyId === "new" ? "Writing" : "Create season"}
        </Button>
      </Card>

      {showSkeleton ? (
        <SeasonsSkeleton />
      ) : status === "loading" ? null : status === "error" ? (
        <AdminError
          title="The calendar could not be read"
          body="The season list did not come back. Try reading it again."
          onRetry={load}
        />
      ) : rows.length === 0 ? (
        <Card pad="lg">
          <EmptyState
            icon="crown"
            title="No seasons are written in the calendar"
            body="The realm needs a season before oaths, standings and Calls have a window to sit in. Open the first one above."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((s) => {
            const isActive = s.status === "active";
            const open = openId === s.id;
            const settled = s.status === "settled";
            return (
              <Card key={s.id} pad="sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-base font-semibold text-bone md:text-sm">
                    {s.name}
                  </p>
                  <Badge variant={isActive ? "gold" : "default"}>{s.status}</Badge>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <dd className="tnum text-sm text-bone">
                      {s.starts_at
                        ? new Date(s.starts_at).toLocaleDateString()
                        : "unset"}
                    </dd>
                    <dt className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                      Opens
                    </dt>
                  </div>
                  <div>
                    <dd className="tnum text-sm text-bone">
                      {s.ends_at ? new Date(s.ends_at).toLocaleDateString() : "unset"}
                    </dd>
                    <dt className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                      Closes
                    </dt>
                  </div>
                  <div>
                    <dd className="tnum text-sm text-gold">
                      {s.vault_raven.toLocaleString()}
                    </dd>
                    <dt className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                      Vault (RAVEN)
                    </dt>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="gold"
                    size="md"
                    className={TOUCH}
                    disabled={busyId === s.id || isActive}
                    onClick={() =>
                      setPending({ id: s.id, name: s.name, decree: "activate" })
                    }
                  >
                    Activate
                  </Button>
                  <Button
                    variant="glass"
                    size="md"
                    className={TOUCH}
                    disabled={busyId === s.id || s.status === "closed" || settled}
                    onClick={() =>
                      setPending({ id: s.id, name: s.name, decree: "close" })
                    }
                  >
                    Close
                  </Button>
                  <Button
                    variant="gold"
                    size="md"
                    className={TOUCH}
                    disabled={busyId === s.id}
                    onClick={() =>
                      setPending({ id: s.id, name: s.name, decree: "settle" })
                    }
                  >
                    {settled ? "Re-settle" : "Settle"}
                  </Button>
                  {settled ? (
                    <Button
                      variant="glass"
                      size="md"
                      className={TOUCH}
                      onClick={() => void viewSettlement(s.id)}
                    >
                      View settlement
                    </Button>
                  ) : null}
                  <Button
                    variant="glass"
                    size="md"
                    className={TOUCH}
                    aria-expanded={open}
                    onClick={() => openEditor(s)}
                  >
                    {open ? "Close editor" : "Edit"}
                  </Button>
                </div>

                {settlementForId === s.id ? (
                  <div className="mt-4 border-t border-steel-line pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                        Settlement (points)
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={TOUCH}
                        onClick={() => setSettlementForId(null)}
                      >
                        Hide
                      </Button>
                    </div>
                    {settlementRows === null ? (
                      <div className="mt-2 flex flex-col gap-1">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <Skeleton key={i} radius="sm" className="h-7 w-full" />
                        ))}
                      </div>
                    ) : settlementRows.length === 0 ? (
                      <EmptyState
                        size="sm"
                        icon="ledger"
                        title="No standings were frozen"
                        body="Settle the season to write every member's final Points, Renown and Glory into the ledger."
                      />
                    ) : (
                      <>
                        <p className="mt-1 text-[11px] text-bone-faint">
                          {settlementRows.length} members,{" "}
                          {settlementTotal.toLocaleString()} points frozen. Kept in
                          points; $RSP conversion comes later.
                        </p>
                        <ol className="mt-2 flex flex-col gap-1">
                          {settlementRows.slice(0, 25).map((r) => (
                            <li
                              key={r.rank}
                              className="flex items-center gap-2 rounded-sm bg-panel/50 px-2.5 py-1.5"
                            >
                              <span className="tnum w-6 shrink-0 text-xs text-bone-faint">
                                {r.rank}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-xs text-bone">
                                {memberName(r.member)}
                              </span>
                              <span className="tnum shrink-0 text-xs font-semibold text-gold">
                                {r.points.toLocaleString()}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                  </div>
                ) : null}

                {open ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 border-t border-steel-line pt-4 sm:grid-cols-2">
                    <Field label="Season name" required>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Season name"
                        className="min-h-11 md:min-h-0"
                      />
                    </Field>
                    <Field label="Vault (RAVEN)">
                      <Input
                        value={editVault}
                        onChange={(e) => setEditVault(e.target.value)}
                        inputMode="numeric"
                        placeholder="0"
                        className="tnum min-h-11 md:min-h-0"
                      />
                    </Field>
                    <Field label="Opens">
                      <Input
                        type="date"
                        value={editStart}
                        onChange={(e) => setEditStart(e.target.value)}
                        className="min-h-11 md:min-h-0"
                      />
                    </Field>
                    <Field label="Closes">
                      <Input
                        type="date"
                        value={editEnd}
                        onChange={(e) => setEditEnd(e.target.value)}
                        className="min-h-11 md:min-h-0"
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Button
                        variant="gold"
                        size="md"
                        className={TOUCH}
                        loading={busyId === s.id}
                        onClick={() => void saveEdit(s)}
                      >
                        Save changes
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title={copy?.title ?? ""}
        description={pending && copy ? copy.body(pending.name) : undefined}
        confirmLabel={copy?.confirm ?? "Confirm"}
        cancelLabel="Leave it as it is"
        tone={copy?.tone ?? "gold"}
        pending={pending !== null && busyId === pending.id}
        onConfirm={() => {
          const p = pending;
          if (!p) return;
          setPending(null);
          runDecree(p);
        }}
      />
    </AdminStack>
  );
}
