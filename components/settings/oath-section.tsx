"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardRow } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { AdaptiveDialog } from "@/components/ui/sheet";
import { houseBySlug, houseIcon, houses } from "@/lib/data/houses";
import { realmFetch } from "@/lib/auth/api";
import { roleMeta } from "@/lib/houses/roles";
import type { OathEntryView } from "@/lib/houses/view";

/* Swearing a new oath (V2 section 11.1).
 *
 * The rules are enforced on the server. This surface exists to make the cost
 * legible BEFORE the member commits, because the whole mechanic depends on the
 * commitment being understood: Renown is personal and stays, contribution is
 * the House's and stays with the House, titles do not travel, House crests go
 * Legacy, and the next oath costs a full season of cooldown.
 *
 * A confirmation that hides what it costs is not consent. */

interface OathState {
  oaths: OathEntryView[];
  current: {
    house_slug: string;
    season_id: number | null;
    role: string;
    sworn_at: string;
  } | null;
  allowed: boolean;
  reason: string | null;
  message: string | null;
  season: {
    active: { id: number; name: string; ends_at: string } | null;
    off_season: boolean;
    next_id: number | null;
    earliest_switch: number | null;
  };
  house_crests: { crest_slug: string; house_slug: string | null }[];
}

export function OathSection({ locked }: { locked?: boolean }) {
  const [state, setState] = useState<OathState | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (locked) return;
    void realmFetch<OathState>("/api/houses/oath").then((res) => {
      if (res.ok && res.data) setState(res.data);
    });
  }, [locked]);

  const current = state?.current;
  const currentMeta = houseBySlug(current?.house_slug);

  async function swear(slug: string) {
    setBusy(true);
    setError(null);
    const res = await realmFetch<{ error?: string; oaths?: OathEntryView[] }>(
      "/api/houses/oath",
      { method: "POST", json: { house: slug } }
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.data?.error ?? "The oath could not be sworn.");
      return;
    }
    setTarget(null);
    setDone(houseBySlug(slug)?.name ?? slug);
    const refreshed = await realmFetch<OathState>("/api/houses/oath");
    if (refreshed.ok && refreshed.data) setState(refreshed.data);
  }

  return (
    <>
      <Card variant="warm" pad="lg">
        <div className="flex items-center gap-2.5">
          <Icon name="banner" className="h-4 w-4 shrink-0 text-gold" />
          <h2 className="font-display text-base font-semibold text-bone">
            Your oath
          </h2>
          {state?.season.off_season ? (
            <Badge variant="gold">Off-season</Badge>
          ) : null}
        </div>

        <div className="mt-4">
          <CardRow
            title="Sworn to"
            desc={
              current
                ? `Since ${new Date(current.sworn_at).toLocaleDateString(
                    undefined,
                    { month: "long", year: "numeric" }
                  )}${current.season_id ? `, Season ${current.season_id}` : ""}`
                : "No oath held"
            }
          >
            {currentMeta ? (
              <span
                className="flex items-center gap-2 text-sm font-semibold"
                style={{ color: currentMeta.color }}
              >
                <Icon
                  name={houseIcon(currentMeta.slug)}
                  className="h-4 w-4"
                />
                {currentMeta.name}
              </span>
            ) : (
              <span className="text-sm text-bone-faint">--</span>
            )}
          </CardRow>

          {current && current.role !== "sworn" ? (
            <CardRow title="Title this season" desc={roleMeta(current.role).earnedBy}>
              <span className="text-sm font-semibold text-gold">
                {roleMeta(current.role).title}
              </span>
            </CardRow>
          ) : null}

          <CardRow
            title="Swear a new oath"
            desc={
              state?.allowed
                ? "Choose a new House. The realm will show you exactly what it costs."
                : (state?.message ??
                  "Oaths may only be sworn between seasons.")
            }
          >
            <Button
              variant="glass"
              size="sm"
              disabled={locked || !state?.allowed || busy}
              onClick={() => {
                setError(null);
                setTarget(current?.house_slug ?? null);
              }}
            >
              Swear
            </Button>
          </CardRow>
        </div>

        {done ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-gold">
            <Icon name="flag" className="h-3.5 w-3.5" />
            Your oath is sworn to {done}. The realm has been told.
          </p>
        ) : null}

        {/* The public record. It appears on the member's Keep too. */}
        {state && state.oaths.length > 0 ? (
          <div className="mt-4 border-t border-steel-line pt-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
              Oath history
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {state.oaths.map((oath) => (
                <li
                  key={oath.id}
                  className="flex items-center gap-2 text-xs text-bone-mut"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-sm"
                    style={{ background: oath.color ?? "var(--gold)" }}
                  />
                  <span className="text-bone">{oath.house_name}</span>
                  <span className="text-bone-faint">({oath.span})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {target !== null && state ? (
        <OathDialog
          state={state}
          busy={busy}
          error={error}
          selected={target === current?.house_slug ? null : target}
          onSelect={setTarget}
          onClose={() => !busy && setTarget(null)}
          onConfirm={swear}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------
   The confirmation
   ------------------------------------------------------------------ */

function OathDialog({
  state,
  selected,
  busy,
  error,
  onSelect,
  onClose,
  onConfirm,
}: {
  state: OathState;
  selected: string | null;
  busy: boolean;
  error: string | null;
  onSelect: (slug: string) => void;
  onClose: () => void;
  onConfirm: (slug: string) => void;
}) {
  const currentSlug = state.current?.house_slug ?? null;
  const currentMeta = houseBySlug(currentSlug);
  const targetMeta = houseBySlug(selected);
  const crestCount = state.house_crests.length;
  const nextSeason = state.season.next_id;

  return (
    <AdaptiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="lg"
      title="Swear a new oath"
      description="Oaths change only between seasons, so no one can defect to the winning House on the last day. Choosing early, while a House is still a risk, is the whole point."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Keep my oath
          </Button>
          <Button
            variant="gold"
            disabled={!targetMeta || busy}
            loading={busy}
            onClick={() => targetMeta && onConfirm(targetMeta.slug)}
          >
            {targetMeta
              ? `Swear to ${targetMeta.name.replace("House ", "")}`
              : "Choose a House"}
          </Button>
        </>
      }
    >
      <div
        role="group"
        aria-label="Choose a House"
        className="grid grid-cols-2 gap-2"
      >
        {houses.map((house) => {
          const isCurrent = house.slug === currentSlug;
          const isSelected = house.slug === selected;
          return (
            <Button
              key={house.slug}
              variant="ghost"
              size="md"
              block
              disabled={isCurrent || busy}
              onClick={() => onSelect(house.slug)}
              aria-pressed={isSelected}
              tone={isSelected ? "gold" : "steel"}
              className={cx(
                "h-auto min-h-11 justify-start gap-2.5 p-2.5 text-left font-normal",
                isSelected
                  ? "bg-gold/10 hover:bg-gold/10"
                  : "bg-panel hover:border-gold/40"
              )}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm"
                style={{
                  background: `linear-gradient(160deg, ${house.color}22, #101017)`,
                  border: `1px solid ${house.color}44`,
                  color: house.color,
                }}
              >
                <Icon name={houseIcon(house.slug)} className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-bone">
                  {house.name.replace("House ", "")}
                </span>
                <span className="block truncate text-[10px] text-bone-faint">
                  {isCurrent ? "Your House" : house.element}
                </span>
              </span>
            </Button>
          );
        })}
      </div>

      {/* What it costs, itemised. Kept and lost side by side so neither can
          be skimmed past. */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-gold/25 bg-gold/[0.06] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-gold">
            <Icon name="shield" className="h-3.5 w-3.5" />
            You keep
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs text-bone-mut">
            <li>
              <b className="text-bone">All your Renown.</b> It is personal
              legacy and is never taken away.
            </li>
            <li>
              <b className="text-bone">Your tier, crests and Calls record.</b>{" "}
              Nothing on your Keep is reset.
            </li>
            <li>
              <b className="text-bone">Your followers and your ravens.</b>
            </li>
          </ul>
        </div>

        <div className="rounded-md border border-ember/30 bg-ember/[0.06] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-state-warning">
            <Icon name="flame" className="h-3.5 w-3.5" />
            You give up
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs text-bone-mut">
            <li>
              <b className="text-bone">Your House contribution resets to 0.</b>{" "}
              Everything you earned for {currentMeta?.name ?? "your House"}{" "}
              stays with them, permanently. It never transfers.
            </li>
            <li>
              <b className="text-bone">Any title you hold.</b> Leadership is
              granted by a House and does not travel.
            </li>
            <li>
              <b className="text-bone">
                {crestCount > 0
                  ? `${crestCount} House crest${crestCount === 1 ? "" : "s"} become Legacy.`
                  : "House crests become Legacy."}
              </b>{" "}
              Still held and still shown, but unearnable again unless you
              return.
            </li>
            <li>
              <b className="text-bone">One season of cooldown.</b>{" "}
              {nextSeason
                ? `Swearing for Season ${nextSeason} means you cannot swear again until Season ${nextSeason + 2}.`
                : "You cannot swear again for a full season after this."}
            </li>
          </ul>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-xs text-state-danger" role="alert">
          {error}
        </p>
      ) : null}
    </AdaptiveDialog>
  );
}
