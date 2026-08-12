"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { SegmentedControl } from "@/components/ui/tabs";
import { StreamChip, StreamChipRail } from "@/components/stream/stream-shell";
import { realmFetch } from "@/lib/auth/api";
import { houses } from "@/lib/data/houses";
import { difficultyBand, scoreOutlook } from "@/lib/calls/analytics";
import { CONFIDENCE_MAX, CONFIDENCE_MIN } from "@/lib/calls/scoring";
import {
  CALL_CATEGORIES,
  CALL_TIMEFRAMES,
  type CallCategory,
  type CallDirection,
  type CallTimeframe,
} from "@/lib/calls/types";

/* Sealing a Call, properly (V2 section 9).

   The composer used to collect one field of the model the engine understands:
   the timeframe. Category, direction, threshold, confidence, rationale and
   evidence all existed in the stored shape and in the scoring, and none of them
   could be stated by a member, so the engine was computing a difficulty nobody
   could see and scoring against a confidence nobody could choose.

   The load bearing part of this form is the panel at the bottom. Before a Call
   is sealed, the realm goes and gets the real live price and the real trailing
   volatility, computes the same pi_0 the Call will be frozen with, and shows it
   back with what the Call is worth on both sides. "BTC up 0.1 percent in 24h"
   reads as a coin flip worth almost nothing; a hard Call reads as hard. That
   feedback loop is what makes Calls a game of judgment rather than a lottery.

   Everything here is also validated on the server by lib/calls/create.ts. This
   form exists to stop a member wasting a submission, never to be trusted. */

/* The three windows the realm settles, and what each one asks of a claim. */
const TIMEFRAMES = CALL_TIMEFRAMES.map((value) => ({ value, label: value }));

const DIRECTIONS = [
  { value: "up", label: "Rises" },
  { value: "down", label: "Falls" },
];

const CATEGORY_LABEL: Record<CallCategory, string> = {
  markets: "Markets",
  esports: "Esports",
  gaming: "Gaming",
  culture: "Culture",
  sport: "Sport",
  realm: "The realm",
};

/* The realm claims a member can actually seal today. member_tier and
   member_renown exist in the resolver and are not offered here, because both
   need a member picker and naming a specific member in a public Call is a
   product decision rather than a form control. */
const REALM_METRICS = [
  { value: "house_leads", label: "A House leads the realm" },
  { value: "house_glory", label: "A House reaches a Glory total" },
];

export type RealmMetric = "house_leads" | "house_glory";

export interface CallDraft {
  category: CallCategory;
  token: string;
  stance: CallDirection;
  timeframe: CallTimeframe;
  /* The required move, held as the percent string the member typed so the
     field never fights their cursor. Converted to a fraction on submit. */
  thresholdPct: string;
  /* Whole percentage points, 55 to 99. */
  confidence: number;
  rationale: string;
  sources: string[];
  metric: RealmMetric;
  houseSlug: string;
  glory: string;
}

export const EMPTY_CALL_DRAFT: CallDraft = {
  category: "markets",
  token: "",
  stance: "up",
  timeframe: "24h",
  thresholdPct: "",
  confidence: 60,
  rationale: "",
  sources: [""],
  metric: "house_leads",
  houseSlug: houses[0]?.slug ?? "",
  glory: "",
};

/* The move required, as the positive fraction the engine takes. An empty field
   is a zero threshold, which is the V1 claim: any move in the stated
   direction, scored as the coin flip it is. */
export function thresholdFraction(draft: CallDraft): number {
  const raw = Number(draft.thresholdPct);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw / 100;
}

/* Is this draft complete enough to be worth sending to the server. */
export function callDraftReady(draft: CallDraft): boolean {
  if (draft.category === "realm") {
    if (!draft.houseSlug) return false;
    if (draft.metric === "house_glory") {
      const glory = Number(draft.glory);
      return Number.isFinite(glory) && glory > 0;
    }
    return true;
  }
  return draft.token.trim().length > 0;
}

/* Everything that decides how hard the Call is. The difficulty preview sends
   exactly this and nothing else, so a keystroke in the rationale cannot cost
   two external lookups. */
function claimPayload(draft: CallDraft): Record<string, unknown> | null {
  if (!callDraftReady(draft)) return null;

  if (draft.category === "realm") {
    return {
      category: draft.category,
      timeframe: draft.timeframe,
      resolver: "internal",
      claim:
        draft.metric === "house_glory"
          ? {
              metric: "house_glory",
              house_slug: draft.houseSlug,
              at_least: Math.round(Number(draft.glory)),
            }
          : { metric: "house_leads", house_slug: draft.houseSlug },
    };
  }

  return {
    category: draft.category,
    timeframe: draft.timeframe,
    resolver: "price",
    token: draft.token.trim(),
    stance: draft.stance,
    threshold: thresholdFraction(draft),
  };
}

/* The `call` payload for POST /api/posts. The server re-derives everything that
   decides what the Call is worth; this only carries what the member stated. */
export function callPayload(draft: CallDraft): Record<string, unknown> | null {
  const claim = claimPayload(draft);
  if (!claim) return null;

  const sources = draft.sources.map((s) => s.trim()).filter(Boolean);
  return {
    ...claim,
    confidence: draft.confidence / 100,
    ...(draft.rationale.trim() ? { rationale: draft.rationale.trim() } : {}),
    ...(sources.length > 0 ? { sources } : {}),
  };
}

interface Preview {
  token: string | null;
  stance: CallDirection;
  timeframe: string;
  threshold: number;
  entry_price: number | null;
  pi_0: number | null;
  sigma: number | null;
  peers: { count: number; eligible: boolean; mean_confidence: number | null };
}

function price(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  if (n >= 1)
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(3)}`;
}

/* A sigma is annualized, which means nothing to a reader. The same number as a
   typical daily move is the honest translation of it, and it is what makes the
   difficulty explainable rather than merely stated. */
function dailyMove(sigma: number): string {
  return `${(sigma / Math.sqrt(365) * 100).toFixed(1)}%`;
}

export function CallForm({
  draft,
  onChange,
}: {
  draft: CallDraft;
  onChange: (next: CallDraft) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const showSkeleton = useDelayedLoading(loading);

  const set = useCallback(
    <K extends keyof CallDraft>(key: K, value: CallDraft[K]) => {
      onChange({ ...draft, [key]: value });
    },
    [draft, onChange]
  );

  /* Only the fields that shape the claim send the member back to the server.
     Confidence does not: the baseline does not depend on it, and the outlook is
     recomputed from the returned pi_0 with the same scoring function the
     settlement job uses, so the slider stays instant. Holding the request as a
     string means the effect depends on the claim rather than on the draft
     object, so typing a rationale costs nothing. */
  const request = useMemo(() => {
    const claim = claimPayload(draft);
    return claim ? JSON.stringify(claim) : null;
  }, [draft]);

  useEffect(() => {
    if (!request) {
      setPreview(null);
      setPreviewError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    /* Typing a ticker is a keystroke stream and every preview is two external
       lookups, so the request waits for the member to stop. */
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await realmFetch<{
          preview?: Preview;
          error?: string;
        }>("/api/calls/preview", {
          method: "POST",
          json: JSON.parse(request) as Record<string, unknown>,
        });
        if (cancelled) return;
        setLoading(false);
        if (res.data?.preview) {
          setPreview(res.data.preview);
          setPreviewError(null);
        } else {
          setPreview(null);
          setPreviewError(
            res.data?.error ?? "The realm could not weigh that Call."
          );
        }
      })();
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [request]);

  const confidence = draft.confidence / 100;
  const pi0 = preview?.pi_0 ?? null;
  const band = pi0 !== null ? difficultyBand(pi0) : null;
  const outlook = pi0 !== null ? scoreOutlook(confidence, pi0) : null;

  const sources = draft.sources;

  return (
    <Card variant="warm" pad="sm" className="mt-2 flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <Icon name="target" className="h-4 w-4 shrink-0 text-gold" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bone-mut">
          Seal a Call
        </p>
      </div>

      <StreamChipRail label="Call category">
        {CALL_CATEGORIES.map((c) => (
          <StreamChip
            key={c}
            active={draft.category === c}
            onClick={() => set("category", c)}
          >
            {CATEGORY_LABEL[c]}
          </StreamChip>
        ))}
      </StreamChipRail>

      {draft.category === "realm" ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Claim" className="min-w-0 flex-1">
            <Select
              items={REALM_METRICS}
              value={draft.metric}
              onValueChange={(v) =>
                set("metric", (v as RealmMetric) ?? "house_leads")
              }
            />
          </Field>
          <Field label="House" className="min-w-0 flex-1">
            <Select
              items={houses.map((h) => ({ value: h.slug, label: h.name }))}
              value={draft.houseSlug}
              onValueChange={(v) => set("houseSlug", v ?? "")}
            />
          </Field>
          {draft.metric === "house_glory" && (
            <Field label="Glory" className="w-full sm:w-28">
              <Input
                value={draft.glory}
                inputMode="numeric"
                placeholder="5000"
                onChange={(e) => set("glory", e.target.value.slice(0, 9))}
              />
            </Field>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Coin" className="w-full sm:w-32">
              <Input
                value={draft.token}
                onChange={(e) => set("token", e.target.value.slice(0, 12))}
                placeholder="TOKEN"
                className="uppercase"
              />
            </Field>
            <Field label="Direction" className="shrink-0">
              <SegmentedControl
                label="Call direction"
                items={DIRECTIONS}
                value={draft.stance}
                onValueChange={(v) =>
                  set("stance", v === "down" ? "down" : "up")
                }
              />
            </Field>
            <Field
              label="Move required"
              className="w-full sm:w-32"
              description="Percent. Blank means any move."
            >
              <Input
                value={draft.thresholdPct}
                inputMode="decimal"
                placeholder="0"
                onChange={(e) => set("thresholdPct", e.target.value.slice(0, 6))}
              />
            </Field>
          </div>
          {draft.category !== "markets" && (
            <p className="text-[11px] leading-relaxed text-bone-faint">
              Outside the realm, a Call still settles against a real market
              price. The category says what the claim is about; the coin is what
              the realm can actually settle.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Window" className="shrink-0">
          <SegmentedControl
            label="Call window"
            items={TIMEFRAMES}
            value={draft.timeframe}
            onValueChange={(v) => set("timeframe", v as CallTimeframe)}
          />
        </Field>
        <Field
          label={`Confidence ${draft.confidence}%`}
          className="min-w-0 flex-1"
        >
          <Slider
            label="Your confidence in this Call"
            valueText={`${draft.confidence} percent`}
            value={draft.confidence}
            min={Math.round(CONFIDENCE_MIN * 100)}
            max={Math.round(CONFIDENCE_MAX * 100)}
            step={1}
            onValueChange={(v) => set("confidence", v)}
          />
        </Field>
      </div>

      <Field
        label="Why you think so"
        description={`${draft.rationale.length}/280`}
      >
        <Textarea
          value={draft.rationale}
          onChange={(e) => set("rationale", e.target.value.slice(0, 280))}
          placeholder="The read behind the Call. This is what makes it worth reading."
          className="min-h-16"
        />
      </Field>

      <div className="flex flex-col gap-2">
        {sources.map((source, i) => (
          <Field key={i} label={i === 0 ? "Evidence" : `Source ${i + 1}`}>
            <Input
              value={source}
              inputMode="url"
              placeholder="https://"
              onChange={(e) =>
                set(
                  "sources",
                  sources.map((s, j) =>
                    j === i ? e.target.value.slice(0, 300) : s
                  )
                )
              }
            />
          </Field>
        ))}
        {sources.length < 3 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => set("sources", [...sources, ""])}
            className="self-start text-gold hover:text-gold-bright"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            Add a source
          </Button>
        )}
      </div>

      {/* The panel that makes this a skill game. Nothing in it is estimated on
          the client: pi_0 and sigma come back from the same server path that
          seals the Call, and the outlook is the real scoring function run over
          that pi_0. */}
      <div className="rounded-lg border border-steel-line bg-obsidian/60 p-3">
        {showSkeleton && (
          <div className="flex flex-col gap-2">
            <Skeleton radius="sm" className="h-3 w-32" />
            <Skeleton radius="sm" className="h-3 w-full" />
            <Skeleton radius="sm" className="h-3 w-3/5" />
          </div>
        )}

        {!loading && previewError && (
          <p className="text-xs leading-relaxed text-state-danger">
            {previewError}
          </p>
        )}

        {!loading && !previewError && !preview && (
          <p className="text-xs leading-relaxed text-bone-faint">
            {draft.category === "realm"
              ? "Choose a claim and the realm will weigh it against its own base rate before you seal."
              : "Name a coin and the realm will weigh the Call against real trailing volatility before you seal."}
          </p>
        )}

        {!loading && preview && band && outlook && pi0 !== null && (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
                Difficulty
              </span>
              <span className="font-display text-base font-semibold text-gold-bright">
                {band.label}
              </span>
              <span className="tnum text-xs text-bone-mut">
                lands on its own {Math.round(pi0 * 100)} times in 100
              </span>
            </div>

            <p className="text-xs leading-relaxed text-bone-mut">{band.blurb}</p>

            {preview.sigma !== null && preview.token && (
              <p className="text-xs leading-relaxed text-bone-faint">
                ${preview.token} moves about {dailyMove(preview.sigma)} on a
                typical day, measured from real trailing prices. That is what
                sets the bar for this window.
              </p>
            )}

            {preview.entry_price !== null && (
              <p className="tnum text-xs text-bone-faint">
                Sealed at {price(preview.entry_price)}
                {preview.threshold > 0
                  ? `, needs ${preview.stance === "down" ? "-" : "+"}${(
                      preview.threshold * 100
                    ).toFixed(1)}%`
                  : ""}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-steel-line pt-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
                At {draft.confidence}% confidence
              </span>
              <span className="tnum text-xs text-chart-up">
                {outlook.ifHit >= 0 ? "+" : ""}
                {outlook.ifHit} if it lands
              </span>
              <span className="tnum text-xs text-chart-down">
                {outlook.ifMiss} if it misses
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-bone-faint">
              Renown takes the gain and never falls. Season Rating takes both.
              The realm settles this itself when the window closes.
            </p>

            {preview.peers.count > 0 ? (
              <p className="text-xs leading-relaxed text-bone-mut">
                {preview.peers.count} independent{" "}
                {preview.peers.count === 1 ? "member has" : "members have"}{" "}
                already Called this
                {preview.peers.mean_confidence !== null
                  ? `, at ${Math.round(preview.peers.mean_confidence * 100)}% on average`
                  : ""}
                .{" "}
                {preview.peers.eligible
                  ? "That is enough of a crowd to score you against them instead of the model."
                  : ""}
              </p>
            ) : (
              <p className="text-xs text-bone-faint">
                Nobody else has Called this claim in this window.
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
