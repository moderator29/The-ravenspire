"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/icon";

type Host = {
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
} | null;

type House = {
  slug: string;
  name: string;
  sigil: string | null;
  color: string | null;
};

type Court = {
  id: string;
  host_id: string;
  title: string | null;
  status: "live" | "scheduled";
  started_at: string | null;
  host: Host;
  house: House | null;
  participants: number;
  participant_ids: string[];
};

function CourtCard({ c }: { c: Court }) {
  const hostName = c.host?.display_name ?? c.host?.handle ?? "Unknown herald";
  return (
    <Link
      href={`/rookery/${c.id}`}
      className="glass glass-hover group block p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {c.status === "live" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ember/40 bg-ember/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
              Upcoming
            </span>
          )}
          <p className="mt-2 truncate font-display text-base font-semibold text-bone">
            {c.title ?? "An unnamed court"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-steel-line bg-panel font-display text-xs text-gold">
                {c.host?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.host.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  hostName.slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="truncate text-xs text-bone-mut">
                Held by <span className="text-bone">{hostName}</span>
              </span>
            </span>
            {c.house && (
              <span className="inline-flex items-center gap-1.5 text-xs text-bone-mut">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: c.house.color ?? "#C8A24C" }}
                />
                {c.house.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <p className="text-xs text-bone-faint">
            <span className="tnum text-bone">{c.participants}</span>{" "}
            {c.participants === 1 ? "soul" : "souls"}
          </p>
          <span className="btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-xs transition group-hover:text-gold">
            Enter
            <Icon name="arrow" className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function RookeryPage() {
  const { ready, authenticated } = useRealmAuth();
  const supabase = useMemo(() => createClient(), []);

  const [courts, setCourts] = useState<Court[] | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [title, setTitle] = useState("");
  const [houseSlug, setHouseSlug] = useState<string | null>(null);
  const [opening, setOpening] = useState<null | "open" | "schedule">(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms");
      const data = (await res.json()) as { rooms?: Court[] } | null;
      setCourts(Array.isArray(data?.rooms) ? data.rooms : []);
    } catch {
      setCourts((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 12000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    void supabase
      .from("houses")
      .select("slug, name, sigil, color")
      .order("name")
      .then(({ data }) => setHouses((data as House[]) ?? []));
  }, [supabase]);

  async function open(action: "open" | "schedule") {
    const t = title.trim();
    if (!t || opening) return;
    setOpening(action);
    setError(null);
    const { ok, data } = await realmFetch<{ id?: string; error?: string }>(
      "/api/rooms",
      {
        method: "POST",
        json: { action, title: t, house_slug: houseSlug },
      }
    );
    if (ok) {
      setTitle("");
      setHouseSlug(null);
      if (action === "open" && data?.id) {
        window.location.href = `/rookery/${data.id}`;
        return;
      }
    } else {
      setError(data?.error ?? "The court could not be raised. Try again.");
    }
    await load();
    setOpening(null);
  }

  const live = (courts ?? []).filter((c) => c.status === "live");
  const upcoming = (courts ?? []).filter((c) => c.status === "scheduled");

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-steel-line bg-panel">
          <Icon name="signal" className="h-5 w-5 text-gold" />
        </span>
        <div>
          <h1 className="font-display text-xl font-semibold text-bone">
            The Rookery
          </h1>
          <p className="text-xs uppercase tracking-[0.26em] text-bone-faint">
            Live courts
          </p>
        </div>
      </div>

      {ready && authenticated && (
        <div className="glass gold-metal mt-5 p-4">
          <p className="font-display text-sm font-semibold text-bone">
            Hold a court
          </p>
          <p className="mt-0.5 text-xs text-bone-mut">
            Name the matter, raise your banner, and gather the realm.
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void open("open");
            }}
            maxLength={80}
            placeholder="Name the matter before the court"
            className="mt-3 w-full rounded-lg border border-steel-line bg-panel px-3 py-2.5 text-sm text-bone placeholder:text-bone-faint focus:outline-none"
          />

          {houses.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
                Fly a banner (optional)
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {houses.map((h) => {
                  const on = houseSlug === h.slug;
                  return (
                    <button
                      key={h.slug}
                      type="button"
                      onClick={() => setHouseSlug(on ? null : h.slug)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-gold/50 bg-gold/10 text-bone"
                          : "border-steel-line bg-panel text-bone-mut hover:text-bone"
                      }`}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: h.color ?? "#C8A24C" }}
                      />
                      {h.name.replace(/^House\s+/i, "")}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => void open("open")}
              disabled={opening !== null || !title.trim()}
              className="btn-gold flex-1 px-4 py-2.5 text-sm disabled:opacity-50"
            >
              <Icon name="signal" className="h-4 w-4" />
              {opening === "open" ? "Raising..." : "Open now"}
            </button>
            <button
              onClick={() => void open("schedule")}
              disabled={opening !== null || !title.trim()}
              className="btn-glass flex-1 px-4 py-2.5 text-sm disabled:opacity-50"
            >
              <Icon name="scroll" className="h-4 w-4" />
              {opening === "schedule" ? "Announcing..." : "Announce upcoming"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="glass glass-sm mt-3 border-ember/40 p-3 text-sm text-ember">
          {error}
        </div>
      )}

      {/* Live */}
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-bone-mut">
            In session
          </h2>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {courts === null ? (
            [0, 1].map((i) => (
              <div key={i} className="glass h-24 animate-pulse" />
            ))
          ) : live.length === 0 ? (
            <div className="glass p-8 text-center">
              <Icon name="signal" className="mx-auto h-8 w-8 text-gold" />
              <p className="mt-3 font-display text-lg font-semibold text-bone">
                No courts in session
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-bone-mut">
                The hall stands ready and the benches are empty. Open a court and
                the realm will see your banner raised here.
              </p>
            </div>
          ) : (
            live.map((c) => <CourtCard key={c.id} c={c} />)
          )}
        </div>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-bone-mut">
            Announced
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {upcoming.map((c) => (
              <CourtCard key={c.id} c={c} />
            ))}
          </div>
        </div>
      )}

      <div className="glass glass-sm mt-6 flex items-start gap-3 p-4">
        <Icon name="orb" className="mt-0.5 h-4 w-4 shrink-0 text-bone-faint" />
        <p className="text-xs leading-relaxed text-bone-mut">
          A court gathers the realm in real time: a living roster, reactions, and
          an open floor. Live voice arrives when the court&apos;s speaking stones
          (the audio provider) are set in place.
        </p>
      </div>
    </div>
  );
}
