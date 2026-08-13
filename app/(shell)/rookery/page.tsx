"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  Chip,
  ChipRail,
  ConsoleHeader,
  ConsolePage,
  ConsoleStack,
  CONSOLE_BODY,
  CONSOLE_META,
} from "@/components/console/console-shell";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/client";

/* The Rookery: live courts, and the control that raises one.
 *
 * Archetype: Console. A form and the dense state it acts on, in one view,
 * which is the definition in section 2. Compact above `md`, 44px touch targets
 * below it, ornament budget zero.
 *
 * WHAT THIS PAGE WAS, because most of the change is subtraction. It hand rolled
 * the page frame, the section headings, the empty state, the loading state, the
 * text input and the House chips, all of which exist as primitives, and each
 * copy had drifted from the original in some small way that only shows on a
 * real device:
 *
 *   The House chips were 26px tall. The touch floor is 44 and the `Chip`
 *   primitive carries it on both axes, including the minimum width that a short
 *   House name would otherwise undercut. On a phone these were a third under
 *   size, which is the kind of miss that never shows in a desktop review.
 *
 *   The compose card wore `gold-metal`. Rule 21: ornament is earned, never
 *   ambient. Raising a court is a form, not a Ceremony, and a surface that
 *   glows all the time means nothing glows.
 *
 *   The loading state was `h-24 animate-pulse`, which flashes on every fast
 *   load. `useDelayedLoading` is the reason the rest of the realm does not.
 *
 *   The empty state was a hand built column with its own icon size and copy
 *   width, sitting inside a card that already had padding.
 *
 * Real data only: the courts are whatever /api/rooms returns, and an empty hall
 * is rendered as an empty hall. There is no sample court and never was.
 */

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
    <Card
      render={<Link href={`/rookery/${c.id}`} />}
      pad="md"
      interactive
      className="group block"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {c.status === "live" ? (
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-ember/40 bg-ember/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center rounded-sm border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
              Upcoming
            </span>
          )}
          <p className="mt-2 truncate font-display text-base font-semibold text-bone md:text-[15px]">
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
              <span className={`truncate text-bone-mut ${CONSOLE_META}`}>
                Held by <span className="text-bone">{hostName}</span>
              </span>
            </span>
            {c.house && (
              <span
                className={`inline-flex items-center gap-1.5 text-bone-mut ${CONSOLE_META}`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: c.house.color ?? "#D9B040" }}
                />
                {c.house.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <p className={`text-bone-faint ${CONSOLE_META}`}>
            <span className="tnum text-bone">{c.participants}</span>{" "}
            {c.participants === 1 ? "soul" : "souls"}
          </p>
          {/* A span, not a Button: the whole row is already the link, and a
              nested interactive element inside a link is invalid and traps a
              second tab stop. This is the affordance, drawn to match. */}
          <span className="inline-flex items-center gap-1.5 rounded-md border border-gold/25 bg-void/60 px-3 py-1.5 text-xs font-semibold text-bone transition-colors duration-fast group-hover:border-gold/45 group-hover:text-gold">
            Enter
            <Icon name="arrow" className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Card>
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
  const showSkeleton = useDelayedLoading(courts === null);

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
    <ConsolePage width="data">
      <ConsoleStack>
        <ConsoleHeader
          title="The Rookery"
          kicker="Live courts"
          backHref="/home"
        />

        {ready && authenticated && (
          <Card>
            <p className={`font-semibold text-bone ${CONSOLE_BODY}`}>
              Hold a court
            </p>
            <p className={`mt-0.5 text-bone-mut ${CONSOLE_META}`}>
              Name the matter, raise your banner, and gather the realm.
            </p>

            <Field className="mt-3" label="The matter">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void open("open");
                }}
                maxLength={80}
                placeholder="Name the matter before the court"
              />
            </Field>

            {houses.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
                  Fly a banner (optional)
                </p>
                {/* Chips, not hand rolled buttons. The primitive carries the
                    44px touch floor on both axes and the pressed state that a
                    plain button has no way to announce. */}
                <ChipRail label="Fly a House banner" className="mt-2">
                  {houses.map((h) => {
                    const on = houseSlug === h.slug;
                    return (
                      <Chip
                        key={h.slug}
                        active={on}
                        onClick={() => setHouseSlug(on ? null : h.slug)}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: h.color ?? "#D9B040" }}
                          />
                          {h.name.replace(/^House\s+/i, "")}
                        </span>
                      </Chip>
                    );
                  })}
                </ChipRail>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="gold"
                size="lg"
                className="flex-1"
                loading={opening === "open"}
                disabled={opening !== null || !title.trim()}
                onClick={() => void open("open")}
              >
                {opening !== "open" && (
                  <Icon name="signal" className="h-4 w-4" />
                )}
                {opening === "open" ? "Raising..." : "Open now"}
              </Button>
              <Button
                variant="glass"
                size="lg"
                className="flex-1"
                loading={opening === "schedule"}
                disabled={opening !== null || !title.trim()}
                onClick={() => void open("schedule")}
              >
                {opening !== "schedule" && (
                  <Icon name="scroll" className="h-4 w-4" />
                )}
                {opening === "schedule" ? "Announcing..." : "Announce upcoming"}
              </Button>
            </div>
          </Card>
        )}

        {error && (
          <Card radius="lg" pad="sm" tone="ember">
            <p role="alert" className={`text-ember ${CONSOLE_BODY}`}>
              {error}
            </p>
          </Card>
        )}

        <div>
          <SectionHeader title="In session" />
          <div className="mt-3 flex flex-col gap-2">
            {courts === null ? (
              showSkeleton ? (
                [0, 1].map((i) => (
                  <Skeleton key={i} radius="xl" className="h-24" />
                ))
              ) : null
            ) : live.length === 0 ? (
              <Card>
                <EmptyState
                  icon="signal"
                  title="No courts in session"
                  body="The hall stands ready and the benches are empty. Open a court and the realm will see your banner raised here."
                />
              </Card>
            ) : (
              live.map((c) => <CourtCard key={c.id} c={c} />)
            )}
          </div>
        </div>

        {upcoming.length > 0 && (
          <div>
            <SectionHeader title="Announced" />
            <div className="mt-3 flex flex-col gap-2">
              {upcoming.map((c) => (
                <CourtCard key={c.id} c={c} />
              ))}
            </div>
          </div>
        )}

        <Card radius="lg" pad="md" variant="inset" className="flex items-start gap-3">
          <Icon name="orb" className="mt-0.5 h-4 w-4 shrink-0 text-bone-faint" />
          <p className={`leading-relaxed text-bone-mut ${CONSOLE_META}`}>
            A court gathers the realm in real time: a living roster, reactions,
            and an open floor. Live voice arrives when the court&apos;s speaking
            stones (the audio provider) are set in place.
          </p>
        </Card>
      </ConsoleStack>
    </ConsolePage>
  );
}
