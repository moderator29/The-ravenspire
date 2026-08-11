"use client";

import { useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { houses as houseData } from "@/lib/data/houses";
import { Icon } from "@/components/ui/icon";

interface HouseRow {
  slug: string;
  name: string;
  motto: string | null;
  sigil: string | null;
  color: string | null;
  member_count: number;
  glory: number;
}

export default function AdminHousesPage() {
  const [rows, setRows] = useState<HouseRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [nameDraft, setNameDraft] = useState("");
  const [mottoDraft, setMottoDraft] = useState("");
  const [gloryDelta, setGloryDelta] = useState("");
  const [reason, setReason] = useState("");

  function load() {
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
  }

  useEffect(() => {
    load();
  }, []);

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
    else setNote("The edit did not take. Try again.");
    setBusy(false);
  }

  async function adjustGlory(row: HouseRow) {
    const delta = Number(gloryDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      setNote("Enter a non-zero glory adjustment.");
      return;
    }
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
    } else if (res.data?.error === "delta_too_large") {
      setNote("That adjustment is too large.");
    } else {
      setNote("The adjustment did not take. Try again.");
    }
    setBusy(false);
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

  const maxGlory = Math.max(1, ...rows.map((r) => r.glory));
  const totalSworn = rows.reduce((s, r) => s + r.member_count, 0);
  const totalGlory = rows.reduce((s, r) => s + r.glory, 0);

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-bone sm:text-2xl">
        Houses
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Rename, re-motto, and adjust the glory of the six great houses
      </p>

      {note && <p className="mt-3 text-xs text-ember">{note}</p>}

      {status === "error" && (
        <div className="glass glass-sm mt-4 p-5">
          <p className="text-sm text-bone-mut">
            The house rolls could not be read. Try again shortly.
          </p>
        </div>
      )}

      {status === "ok" && rows.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="glass glass-sm p-4">
            <p className="tnum font-display text-2xl font-semibold text-gold">
              {totalSworn.toLocaleString()}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-bone-faint">
              Sworn members
            </p>
          </div>
          <div className="glass glass-sm p-4">
            <p className="tnum font-display text-2xl font-semibold text-gold">
              {totalGlory.toLocaleString()}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-bone-faint">
              Total glory
            </p>
          </div>
        </div>
      )}

      {status === "ok" ? <HouseOps /> : null}

      <div className="mt-4 flex flex-col gap-2">
        {status === "loading" &&
          [0, 1, 2].map((i) => (
            <div key={i} className="glass glass-sm h-20 animate-pulse" />
          ))}
        {status === "ok" &&
          rows.map((row, i) => {
            const meta = houseData.find((h) => h.slug === row.slug);
            const open = openSlug === row.slug;
            return (
              <div key={row.slug} className="glass glass-sm p-4 sm:p-5">
                <div className="flex items-center gap-3 sm:gap-4">
                  <span className="tnum w-5 shrink-0 text-center font-display text-lg text-bone-faint">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold text-bone sm:text-base">
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
                  <button
                    type="button"
                    className="btn-glass shrink-0 px-3 py-1 text-xs"
                    onClick={() => openEditor(row)}
                  >
                    {open ? "Close" : "Manage"}
                  </button>
                </div>

                {open && (
                  <div className="mt-4 grid grid-cols-1 gap-4 border-t border-steel-line pt-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                        Name and motto
                      </p>
                      <input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        placeholder="House name"
                        className="mt-2 w-full rounded-xl border border-steel-line bg-panel px-3 py-2 text-sm text-bone outline-none"
                      />
                      <input
                        value={mottoDraft}
                        onChange={(e) => setMottoDraft(e.target.value)}
                        placeholder="Motto"
                        className="mt-2 w-full rounded-xl border border-steel-line bg-panel px-3 py-2 text-sm text-bone outline-none"
                      />
                      <button
                        type="button"
                        className="btn-gold mt-2 px-3 py-1.5 text-xs"
                        disabled={busy}
                        onClick={() => void saveDetails(row)}
                      >
                        Save details
                      </button>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                        Glory adjustment
                      </p>
                      <input
                        value={gloryDelta}
                        onChange={(e) => setGloryDelta(e.target.value)}
                        inputMode="numeric"
                        placeholder="Delta (e.g. -500)"
                        className="mt-2 w-full rounded-xl border border-steel-line bg-panel px-3 py-2 text-sm text-bone outline-none"
                      />
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason (logged)"
                        className="mt-2 w-full rounded-xl border border-steel-line bg-panel px-3 py-2 text-sm text-bone outline-none"
                      />
                      <button
                        type="button"
                        className="btn-gold mt-2 px-3 py-1.5 text-xs"
                        disabled={busy}
                        onClick={() => void adjustGlory(row)}
                      >
                        Apply adjustment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

/* Steward controls for the two Houses V2 jobs that are not automatic.

   Recompute is idempotent and derives everything from the ledger and the oath
   history, so pressing it twice is safe. The cron hits the same route. */
function HouseOps() {
  const [busy, setBusy] = useState<"recompute" | "clash" | null>(null);
  const [note, setNote] = useState<string | null>(null);
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
      setNote("The recompute did not run.");
      return;
    }
    if (!res.data.recomputed) {
      setNote("No season has started, so there is nothing to resolve.");
      return;
    }
    const leader = res.data.standings?.[0];
    setNote(
      `Season ${res.data.season_id} resolved. ${
        leader ? `${leader.slug} leads on ${leader.score.toLocaleString()}.` : ""
      }`
    );
  }

  async function callClash() {
    const name = title.trim();
    const ticker = token.trim().replace(/^\$/, "");
    if (!name || !ticker) {
      setNote("A Clash needs a name and a token.");
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
      setNote(`The Clash is called. It runs 48 hours from now.`);
    } else {
      setNote(res.data?.error ?? "The Clash could not be called.");
    }
  }

  return (
    <div className="glass glass-sm mt-4 p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold text-bone">
        Season operations
      </h2>
      <p className="mt-1 text-xs text-bone-mut">
        Standings are the sum of each House&apos;s top 20 contributors, and the
        six seasonal titles are derived from what members actually did. Both
        are recomputed here and by the cron.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={recompute}
          disabled={busy !== null}
          className="btn-glass px-4 py-1.5 text-sm disabled:opacity-50"
        >
          {busy === "recompute" ? "Resolving..." : "Recompute standings and leadership"}
        </button>
      </div>

      <div className="mt-4 border-t border-steel-line pt-4">
        <h3 className="text-xs uppercase tracking-[0.2em] text-bone-faint">
          Call a Clash
        </h3>
        <p className="mt-1 text-xs text-bone-mut">
          A 48 hour window on one token. Only Calls made inside it count.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="The name of the Clash"
            className="min-w-0 flex-1 rounded-md border border-steel-line bg-panel px-3 py-1.5 text-sm text-bone placeholder:text-bone-faint"
          />
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="TOKEN"
            className="w-full rounded-md border border-steel-line bg-panel px-3 py-1.5 text-sm text-bone uppercase placeholder:text-bone-faint sm:w-32"
          />
          <button
            type="button"
            onClick={callClash}
            disabled={busy !== null}
            className="btn-gold shrink-0 px-4 py-1.5 text-sm disabled:opacity-50"
          >
            {busy === "clash" ? "Calling..." : "Call it"}
          </button>
        </div>
      </div>

      {note ? <p className="mt-3 text-xs text-gold">{note}</p> : null}
    </div>
  );
}
