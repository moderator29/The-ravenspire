"use client";

import { useEffect, useRef, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";
import { houses } from "@/lib/data/houses";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        Users
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Search, verify, and ban members of the realm
      </p>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-steel-line bg-panel px-3 py-2 sm:max-w-sm">
        <Icon name="search" className="h-4 w-4 shrink-0 text-bone-faint" />
        <input
          value={query}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by handle or name"
          className="w-full bg-transparent text-sm text-bone outline-none placeholder:text-bone-faint"
        />
      </div>

      {note && <p className="mt-3 text-xs text-ember">{note}</p>}

      <div className="glass mt-4 overflow-x-auto">
        {status === "loading" ? (
          <div className="h-48 animate-pulse" />
        ) : status === "error" ? (
          <p className="p-6 text-sm text-bone-mut">
            The census could not be read. Try again shortly.
          </p>
        ) : users.length === 0 ? (
          <div className="flex items-center gap-3 p-6">
            <Icon name="user" className="h-5 w-5 text-bone-faint" />
            <p className="text-sm text-bone-mut">
              {query ? "No members match that search." : "No one has entered the realm yet."}
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead>
              <tr className="border-b border-steel-line text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                <th className="px-4 py-3 font-medium">Handle</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Renown</th>
                <th className="px-4 py-3 font-medium">House</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-steel-line last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-bone">
                    {u.handle ? `@${u.handle}` : "unclaimed"}
                    <span className="ml-2 inline-flex gap-1 align-middle">
                      {u.is_admin && (
                        <span className="rounded-full border border-steel-line bg-panel px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-gold">
                          Steward
                        </span>
                      )}
                      {u.is_verified && (
                        <span className="rounded-full border border-steel-line bg-panel px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-gold">
                          Verified
                        </span>
                      )}
                      {u.is_banned && (
                        <span className="rounded-full border border-ember/40 bg-panel px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-ember">
                          Banned
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-bone-mut">
                    {u.display_name?.trim() || "Nameless"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 capitalize text-bone-mut">
                    {u.tier}
                  </td>
                  <td className="tnum whitespace-nowrap px-4 py-3 text-gold">
                    {u.renown.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-bone-mut">
                    {houseName(u.house_slug)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="btn-glass px-2.5 py-1 text-xs"
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
                      </button>
                      <button
                        type="button"
                        className="btn-glass px-2.5 py-1 text-xs"
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
                      </button>
                      <button
                        type="button"
                        className="btn-glass px-2.5 py-1 text-xs"
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
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {nextCursor && status === "ok" && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            className="btn-glass px-4 py-2 text-sm"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? "Summoning" : "Load more"}
          </button>
        </div>
      )}

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="glass w-full max-w-sm p-6">
            <p className="font-display text-lg font-semibold text-bone">
              {pending.label}?
            </p>
            <p className="mt-2 text-sm text-bone-mut">
              You are about to <span className="lowercase">{pending.label}</span>{" "}
              <span className="font-semibold text-bone">{pending.who}</span>. This
              action is recorded in the audit log.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-glass px-4 py-2 text-sm"
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-gold px-4 py-2 text-sm"
                onClick={() => {
                  const p = pending;
                  setPending(null);
                  void run(p.id, p.action);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
