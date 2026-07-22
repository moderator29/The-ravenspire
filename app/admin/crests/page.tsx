"use client";

import { useEffect, useState } from "react";
import { crests, CrestRoundel } from "@/components/brand/crests";
import { realmFetch } from "@/lib/auth/api";

export default function AdminCrestsPage() {
  const liveCount = crests.filter((c) => c.status === "live").length;
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  const [crestSlug, setCrestSlug] = useState(crests[0]?.slug ?? "");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void realmFetch<{ counts: Record<string, number> }>(
      "/api/admin/crests"
    ).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data?.counts) {
        setCounts(res.data.counts);
        setStatus("ok");
      } else {
        setStatus("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function act(action: "grant" | "revoke") {
    if (!handle.trim()) {
      setNote("Enter a member handle first.");
      return;
    }
    setBusy(true);
    setNote(null);
    const res = await realmFetch<{
      ok?: boolean;
      counts?: Record<string, number>;
      member?: { handle: string | null };
      error?: string;
    }>("/api/admin/crests", {
      method: "POST",
      json: { action, crest_slug: crestSlug, handle: handle.trim() },
    });
    if (res.ok && res.data?.ok) {
      if (res.data.counts) setCounts(res.data.counts);
      setNote(
        `${action === "grant" ? "Granted" : "Revoked"} for @${
          res.data.member?.handle ?? handle.trim().replace(/^@/, "")
        }.`
      );
    } else if (res.data?.error === "member_not_found") {
      setNote("No member with that handle.");
    } else {
      setNote("The change did not take. Try again.");
    }
    setBusy(false);
  }

  const totalEarned =
    counts === null
      ? null
      : Object.values(counts).reduce((sum, n) => sum + n, 0);

  const inputCls =
    "w-full rounded-xl border border-steel-line bg-panel px-3 py-2 text-sm text-bone outline-none placeholder:text-bone-faint";

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-bone sm:text-2xl">
        Crests
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        The honor roll
      </p>
      <p className="mt-2 text-xs text-bone-faint">
        <span className="tnum">{liveCount}</span> of{" "}
        <span className="tnum">{crests.length}</span> crests are live.
        {totalEarned !== null && (
          <>
            {" "}
            <span className="tnum text-gold">{totalEarned}</span> earned across
            the realm.
          </>
        )}
      </p>

      {status === "error" && (
        <p className="mt-2 text-xs text-ember">
          Earned counts could not be read; showing the roll without them.
        </p>
      )}

      <div className="glass glass-sm mt-4 p-4 sm:p-5">
        <p className="font-display text-sm font-semibold text-bone">
          Grant or revoke a crest
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select
            value={crestSlug}
            onChange={(e) => setCrestSlug(e.target.value)}
            className={inputCls}
          >
            {crests.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="Member handle (e.g. @raven)"
            className={inputCls}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-gold px-3 py-1.5 text-xs"
            disabled={busy}
            onClick={() => void act("grant")}
          >
            Grant
          </button>
          <button
            type="button"
            className="btn-glass px-3 py-1.5 text-xs"
            disabled={busy}
            onClick={() => void act("revoke")}
          >
            Revoke
          </button>
        </div>
        {note && <p className="mt-2 text-xs text-bone-mut">{note}</p>}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {crests.map((c) => {
          const earned = counts?.[c.slug] ?? 0;
          return (
            <div
              key={c.slug}
              className={`rarity-${c.rarity} rarity-frame glass glass-sm p-4 sm:p-5`}
            >
              <div className="flex items-start gap-4">
                <CrestRoundel
                  icon={c.icon}
                  className="h-14 w-14 shrink-0"
                  dim={c.status === "locked"}
                />
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold text-bone">
                    {c.name}
                  </p>
                  <p className="text-xs text-bone-faint">{c.plain}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`rarity-${c.rarity} rarity-chip`}>
                      {c.rarity}
                    </span>
                    <span
                      className={`rounded-full border border-steel-line bg-panel px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                        c.status === "live" ? "text-gold" : "text-bone-faint"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-bone-mut">{c.earn}</p>
              <div className="mt-3 flex items-baseline gap-2 border-t border-steel-line pt-3">
                <span className="tnum font-display text-lg font-semibold text-gold">
                  {status === "loading" ? "-" : earned}
                </span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                  {earned === 1 ? "citizen earned" : "citizens earned"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
