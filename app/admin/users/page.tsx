"use client";

import { useEffect, useRef, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { houses } from "@/lib/data/houses";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
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

interface UserRow {
  id: string;
  handle: string | null;
  display_name: string | null;
  tier: string;
  renown: number;
  points: number;
  house_slug: string | null;
  is_admin: boolean;
  is_banned: boolean;
  is_verified: boolean;
  created_at: string;
}

type Action =
  | "grant_admin"
  | "revoke_admin"
  | "ban_user"
  | "unban_user"
  | "verify_user"
  | "unverify_user";

interface Pending {
  id: string;
  action: Action;
  label: string;
  who: string;
}

function houseName(slug: string | null): string {
  if (!slug) return "Unsworn";
  return houses.find((h) => h.slug === slug)?.name ?? slug;
}

function userName(u: UserRow): string {
  return u.display_name?.trim() || (u.handle ? `@${u.handle}` : "this member");
}

/* Ban and seat changes are irreversible enough to confirm; verify is not. */
const NEEDS_CONFIRM: Set<Action> = new Set([
  "ban_user",
  "grant_admin",
  "revoke_admin",
]);

/* Banning and revoking a seat are the destructive half, so their confirmation
   is toned danger. Granting a seat is equally serious but not a removal. */
const DANGER_ACTIONS: Set<Action> = new Set(["ban_user", "revoke_admin"]);

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  function load(q: string) {
    setStatus("loading");
    const path = q
      ? `/api/admin/users?q=${encodeURIComponent(q)}`
      : "/api/admin/users";
    void realmFetch<{ users: UserRow[]; nextCursor: string | null }>(path).then(
      (res) => {
        if (res.status === 401 || res.status === 403) {
          setStatus("sealed");
        } else if (res.ok && res.data?.users) {
          setUsers(res.data.users);
          setNextCursor(res.data.nextCursor);
          setStatus("ok");
        } else {
          setStatus("error");
        }
      }
    );
  }

  useEffect(() => {
    load("");
  }, []);

  function onSearchChange(v: string) {
    setQuery(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(v.trim()), 300);
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    params.set("cursor", nextCursor);
    const res = await realmFetch<{ users: UserRow[]; nextCursor: string | null }>(
      `/api/admin/users?${params.toString()}`
    );
    if (res.ok && res.data?.users) {
      setUsers((prev) => [...prev, ...res.data!.users]);
      setNextCursor(res.data.nextCursor);
    }
    setLoadingMore(false);
  }

  async function run(id: string, action: Action) {
    setBusyId(id);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; user?: UserRow; error?: string }>(
      "/api/admin/users",
      { method: "POST", json: { profile_id: id, action } }
    );
    if (res.ok && res.data?.ok && res.data.user) {
      const updated = res.data.user;
      setUsers((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
    } else if (res.data?.error === "cannot_change_own_seat") {
      setNote("You cannot ban yourself or change your own seat.");
    } else {
      setNote("The change could not be applied. Try again.");
    }
    setBusyId(null);
  }

  function request(u: UserRow, action: Action, label: string) {
    if (NEEDS_CONFIRM.has(action)) {
      setPending({ id: u.id, action, label, who: userName(u) });
    } else {
      void run(u.id, action);
    }
  }

  if (status === "sealed") return <SealedChamber />;

  const rowActions = (u: UserRow, size: "sm" | "md") => (
    <>
      <Button
        variant="glass"
        size={size}
        className={size === "md" ? TOUCH : undefined}
        disabled={busyId === u.id}
        onClick={() =>
          request(
            u,
            u.is_verified ? "unverify_user" : "verify_user",
            u.is_verified ? "Unverify" : "Verify"
          )
        }
      >
        {u.is_verified ? "Unverify" : "Verify"}
      </Button>
      <Button
        variant={u.is_banned ? "glass" : "danger"}
        size={size}
        className={size === "md" ? TOUCH : undefined}
        disabled={busyId === u.id}
        onClick={() =>
          request(
            u,
            u.is_banned ? "unban_user" : "ban_user",
            u.is_banned ? "Unban" : "Ban"
          )
        }
      >
        {u.is_banned ? "Unban" : "Ban"}
      </Button>
      <Button
        variant="glass"
        size={size}
        className={size === "md" ? TOUCH : undefined}
        disabled={busyId === u.id}
        onClick={() =>
          request(
            u,
            u.is_admin ? "revoke_admin" : "grant_admin",
            u.is_admin ? "Revoke seat" : "Grant seat"
          )
        }
      >
        {u.is_admin ? "Revoke seat" : "Grant seat"}
      </Button>
    </>
  );

  const marks = (u: UserRow) => (
    <>
      {u.is_admin ? <Badge variant="gold">Steward</Badge> : null}
      {u.is_verified ? <Badge variant="gold">Verified</Badge> : null}
      {u.is_banned ? <Badge variant="danger">Banned</Badge> : null}
    </>
  );

  return (
    <AdminStack>
      <AdminHeader
        title="Users"
        kicker="Search, verify, and ban members of the realm"
      />

      <Card pad="sm">
        <Field label="Search the roll" className="sm:max-w-sm">
          <Input
            value={query}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Handle or name"
            className="min-h-11 md:min-h-0"
          />
        </Field>
      </Card>

      {note ? <AdminNote>{note}</AdminNote> : null}

      {showSkeleton ? (
        <BoardSkeleton rows={8} columns={6} />
      ) : status === "loading" ? null : status === "error" ? (
        <AdminError
          title="The census could not be read"
          body="The roll of members did not come back. Try reading it again."
          onRetry={() => load(query.trim())}
        />
      ) : users.length === 0 ? (
        <Card pad="lg">
          <EmptyState
            icon="user"
            title={query ? "No members match that search" : "No one has entered the realm yet"}
            body={
              query
                ? "Nothing on the roll matches those letters. Clear the search to see everyone."
                : "The roll fills as members swear their first oath. Nothing is hidden here."
            }
            action={
              query ? (
                <Button
                  variant="glass"
                  size="md"
                  className={TOUCH}
                  onClick={() => {
                    setQuery("");
                    load("");
                  }}
                >
                  Clear the search
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Board
          label="Members of the realm"
          rows={users}
          rowKey={(u) => u.id}
          columns={[
            {
              key: "handle",
              header: "Handle",
              className: "whitespace-nowrap font-semibold text-bone",
              cell: (u) => (
                <span className="flex items-center gap-1.5">
                  {u.handle ? `@${u.handle}` : "unclaimed"}
                  {marks(u)}
                </span>
              ),
            },
            {
              key: "name",
              header: "Name",
              className: "whitespace-nowrap",
              cell: (u) => u.display_name?.trim() || "Nameless",
            },
            {
              key: "tier",
              header: "Tier",
              className: "whitespace-nowrap capitalize",
              cell: (u) => u.tier,
            },
            {
              key: "renown",
              header: "Renown",
              numeric: true,
              className: "whitespace-nowrap text-gold",
              cell: (u) => u.renown.toLocaleString(),
            },
            {
              key: "house",
              header: "House",
              className: "whitespace-nowrap",
              cell: (u) => houseName(u.house_slug),
            },
            {
              key: "actions",
              header: "Actions",
              className: "whitespace-nowrap",
              cell: (u) => (
                <span className="flex flex-wrap gap-1.5">
                  {rowActions(u, "sm")}
                </span>
              ),
            },
          ]}
          card={(u) => (
            <BoardCard
              title={u.handle ? `@${u.handle}` : "unclaimed"}
              subtitle={u.display_name?.trim() || "Nameless"}
              badges={marks(u)}
              stats={[
                { label: "Tier", value: <span className="capitalize">{u.tier}</span> },
                { label: "Renown", value: u.renown.toLocaleString() },
                { label: "House", value: houseName(u.house_slug) },
              ]}
              actions={rowActions(u, "md")}
            />
          )}
        />
      )}

      {nextCursor && status === "ok" ? (
        <div className="flex justify-center">
          <Button
            variant="glass"
            size="md"
            className={TOUCH}
            loading={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? "Summoning" : "Load more"}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title={pending ? `${pending.label}?` : ""}
        description={
          pending
            ? `You are about to ${pending.label.toLowerCase()} ${pending.who}. This action is recorded in the audit log.`
            : undefined
        }
        confirmLabel={pending?.label ?? "Confirm"}
        cancelLabel="Keep as it is"
        tone={pending && DANGER_ACTIONS.has(pending.action) ? "danger" : "gold"}
        pending={pending !== null && busyId === pending.id}
        onConfirm={() => {
          const p = pending;
          if (!p) return;
          setPending(null);
          void run(p.id, p.action);
        }}
      />
    </AdminStack>
  );
}
