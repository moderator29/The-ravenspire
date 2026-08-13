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
import { claimSentence } from "@/components/calls/claim";
import { realmFetch } from "@/lib/auth/api";
import { houses } from "@/lib/data/houses";
import {
  bandFor,
  difficultyBand,
  scoreOutlook,
  type CalibrationBucket,
} from "@/lib/calls/analytics";
import { CONFIDENCE_MAX, CONFIDENCE_MIN } from "@/lib/calls/scoring";
import { MIN_STAKE, stakeBonus } from "@/lib/calls/stake";
import {
  CALL_CATEGORIES,
  CALL_TIMEFRAMES,
  type CallCategory,
  type CallData,
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
  /* POINTS put behind the Call. Zero means an unstaked Call, which is what
     every Call in the realm has been until now and remains the default: a
     member has to choose to put something at risk. */
  stake: number;
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
  stake: 0,
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
    /* Sent only when there is one. The server re-validates it against the
       member's real balance and escrows it under a row lock; this is the
       member's intent, never the authority. */
    ...(draft.stake >= MIN_STAKE ? { stake: draft.stake } : {}),
  };
}

/* The Call written out as the sentence it is.

   A raven with a Call attached and no words of its own used to be refused by
   the server, which requires a body, so the composer let a member seal a Call
   and then told them their raven was empty. The Call itself is the claim, so
   the claim is what the raven says. This restates the member's own stated
   Call and invents nothing. */
export function draftSentence(draft: CallDraft): string {
  const claim = claimPayload(draft);
  if (!claim) return "";
  return claimSentence({
    category: draft.category,
    resolver: draft.category === "realm" ? "internal" : "price",
    timeframe: draft.timeframe,
    token: draft.token.trim().toUpperCase(),
    stance: draft.stance,
    threshold: thresholdFraction(draft),
    claim: (claim.claim as CallData["claim"]) ?? undefined,
  });
}

/* The free reads the preview carries back beside the difficulty (V2 section
   10). None of these cost a model call: the record is arithmetic over the
   member's own settled Calls, the neighbours are an exact structured match on
   the pinned subject, and the discussion count is one indexed count. The shapes
   are declared here rather than imported because the modules that compute them
   are server only. */
interface RecordSlice {
  total: number;
  hits: number;
  hitRate: number | null;
  meanConfidence: number | null;
}

interface CallerRecord {
  settled: RecordSlice;
  category: RecordSlice;
  subject: RecordSlice;
  claim: RecordSlice;
  open: number;
  calibration: CalibrationBucket[];
  score: number;
}

interface SimilarCall {
  id: string;
  relation: "same-claim" | "same-direction" | "same-subject";
  mine: boolean;
  verdict: string;
  confidence: number | null;
}

/* What the member could put behind the Call. Real POINTS, read from their own
   profile on the server, never estimated here. */
interface StakeWindow {
  balance: number;
  min: number;
  max: number;
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
  record: CallerRecord;
  similar: SimilarCall[];
  discussion: { posts: number; windowHours: number } | null;
  stake: StakeWindow;
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

  /* The Herald's read on the draft. Member triggered, never automatic: it is
     the one part of this panel that costs real coin, and a reading that fired
     on every keystroke would spend the realm's day on people typing. */
  const [herald, setHerald] = useState<string | null>(null);
  const [heraldError, setHeraldError] = useState<string | null>(null);
  const [heraldLoading, setHeraldLoading] = useState(false);
  const showHeraldSkeleton = useDelayedLoading(heraldLoading);

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

  /* The member's own calibration at the confidence they are currently stating.
     Read from the buckets the preview already returned rather than by asking
     the server again, so the slider stays instant and the figure stays real. */
  const record = preview?.record ?? null;
  const calBand = record ? bandFor(record.calibration, confidence) : null;
  /* The slider's ceiling, rounded down to a whole number of steps so the last
     stop is reachable. A member holding 137 POINTS gets a top stop of 125
     rather than a stop at 137 the step can never land on. */
  const stakeCeiling =
    Math.floor((preview?.stake.max ?? 0) / MIN_STAKE) * MIN_STAKE;

  /* Everything the stake returns if the Call lands, computed with the same
     function the settlement job runs over the same score. Not an estimate. */
  const stakeIfHit =
    draft.stake > 0 && outlook
      ? draft.stake + stakeBonus(draft.stake, outlook.ifHit)
      : 0;

  /* The window can shrink between one preview and the next, because the
     balance is real and a settling Call elsewhere may have moved it. A slider
     left pointing above its own ceiling would submit a stake the server then
     refuses, so the draft is pulled back rather than the control being allowed
     to lie. */
  useEffect(() => {
    if (draft.stake > stakeCeiling) {
      onChange({ ...draft, stake: stakeCeiling });
    }
  }, [draft, onChange, stakeCeiling]);

  const sameClaim =
    preview?.similar.filter((s) => s.relation === "same-claim").length ?? 0;
  const otherSide =
    preview?.similar.filter((s) => s.relation === "same-subject").length ?? 0;

  const askHerald = async () => {
    const payload = callPayload(draft);
    if (!payload || heraldLoading) return;
    setHeraldLoading(true);
    setHeraldError(null);
    const res = await realmFetch<{ text?: string; error?: string }>(
      "/api/calls/preview/analysis",
      { method: "POST", json: payload }
    );
    setHeraldLoading(false);
    if (res.data?.text) setHerald(res.data.text);
    else
      setHeraldError(res.data?.error ?? "The Herald could not be reached.");
  };

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
        <Field label="Window" className="w-full sm:w-auto sm:shrink-0">
          {/* `block`, because "7d" measured 40.1x44 at 390px: four pixels
              short on the horizontal axis, produced by nothing but a short
              label, and invisible to anyone reading the source. A window is
              exactly the two or three way switcher that owns its row on a
              phone, which is what this prop is for, and an equal share of a
              332px row is 108px per segment. The three labels are the domain's
              own timeframes and widening them to reach the target would be
              working around the measurement rather than fixing it. */}
          <SegmentedControl
            block
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
          that pi_0.

          The Card primitive's `inset` variant rather than the same three
          classes written out by hand, which is what this was. They were the
          right three classes and they were missing the fourth: `inset` carries
          `--shadow-well`, so the block reads as recessed into the card holding
          it instead of being told apart from its parent by a background colour
          and nothing else. This is the deepest nested surface in the composer
          and it was the flattest. */}
      <Card variant="inset" radius="lg" pad="sm">
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

            {/* The stake.

                It sits here, under the outlook, because this is the first
                moment a member knows what their Call is actually worth, and a
                stake is only a decision once the difficulty is on the screen.
                Both sides are named in POINTS before anything is committed:
                what comes back if it lands, what leaves if it does not.

                Ledger register throughout. Putting a balance at risk is not a
                Forge moment, it is an instrument reading, and a glow here
                would be the product cheering a member into a bet. */}
            <div className="flex flex-col gap-2 border-t border-steel-line pt-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
                  Stake
                </span>
                <span className="tnum text-[11px] text-bone-faint">
                  {preview.stake.balance.toLocaleString()} POINTS held
                </span>
              </div>

              {stakeCeiling >= MIN_STAKE ? (
                <>
                  <Slider
                    label="POINTS behind this Call"
                    valueText={
                      draft.stake > 0
                        ? `${draft.stake} points`
                        : "nothing at stake"
                    }
                    value={Math.min(draft.stake, stakeCeiling)}
                    min={0}
                    max={stakeCeiling}
                    step={MIN_STAKE}
                    onValueChange={(v) => set("stake", v)}
                  />
                  {draft.stake > 0 ? (
                    <>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="tnum text-xs text-chart-up">
                          +{stakeIfHit.toLocaleString()} POINTS if it lands
                        </span>
                        <span className="tnum text-xs text-chart-down">
                          -{draft.stake.toLocaleString()} POINTS if it misses
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-bone-faint">
                        A stake that misses burns. Half of it leaves the realm
                        for good and half pools in your House treasury, where
                        the Lord and the Hand can spend it on the House.
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-bone-faint">
                      A Call costs nothing but a slot. Put POINTS behind it and
                      the realm pays a bonus scaled to how hard it was, or
                      burns them.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] leading-relaxed text-bone-faint">
                  The smallest stake the realm takes is{" "}
                  {MIN_STAKE.toLocaleString()} POINTS, and you hold{" "}
                  {preview.stake.balance.toLocaleString()}. This Call is sealed
                  without one.
                </p>
              )}
            </div>

            {/* The member's own record against the claim in front of them, and
                their measured calibration at the confidence they are stating.
                Every figure is counted from Calls they already settled. */}
            {record && (
              <div className="flex flex-col gap-1 border-t border-steel-line pt-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
                  Your record
                </span>
                {record.settled.total > 0 ? (
                  <>
                    <p className="tnum text-xs leading-relaxed text-bone-mut">
                      {record.settled.hits} of {record.settled.total} settled
                      Calls landed
                      {record.subject.total > 0
                        ? `, ${record.subject.hits} of ${record.subject.total} on this subject`
                        : record.category.total > 0
                          ? `, ${record.category.hits} of ${record.category.total} in this category`
                          : ""}
                      .
                    </p>
                    {calBand ? (
                      <p className="tnum text-xs leading-relaxed text-bone-mut">
                        At {Math.round(calBand.from * 100)} to{" "}
                        {Math.round(calBand.to * 100)}% you have stated{" "}
                        {Math.round(calBand.stated * 100)}% and landed{" "}
                        {Math.round(calBand.realized * 100)}% across{" "}
                        {calBand.total}{" "}
                        {calBand.total === 1 ? "Call" : "Calls"}.
                      </p>
                    ) : (
                      <p className="text-xs leading-relaxed text-bone-faint">
                        You have never settled a Call at this confidence, so the
                        realm has nothing to compare it against.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs leading-relaxed text-bone-faint">
                    Nothing of yours has settled yet. This is the first entry in
                    the record.
                  </p>
                )}
              </div>
            )}

            {/* What else is already standing on this subject. An exact
                structured match, not a guess, and it costs nothing. */}
            {preview.similar.length > 0 && (
              <p className="text-xs leading-relaxed text-bone-mut">
                {sameClaim > 0
                  ? `${sameClaim} standing ${sameClaim === 1 ? "Call states" : "Calls state"} this exact claim`
                  : `${preview.similar.length} recent ${preview.similar.length === 1 ? "Call" : "Calls"} on this subject`}
                {otherSide > 0
                  ? `, and ${otherSide} ${otherSide === 1 ? "calls" : "call"} it the other way`
                  : ""}
                .
              </p>
            )}

            {preview.discussion && preview.discussion.posts > 0 && (
              <p className="tnum text-xs leading-relaxed text-bone-faint">
                The realm has posted about it {preview.discussion.posts}{" "}
                {preview.discussion.posts === 1 ? "time" : "times"} in the last{" "}
                {preview.discussion.windowHours} hours.
              </p>
            )}

            {/* The Herald, reading the draft over every figure above. This
                panel holds no copy of its own: it never renders a cached or
                example reading, and when the Herald cannot be reached it says
                so rather than filling the space with something that looks like
                a reading and is not. */}
            <div className="flex flex-col gap-2 border-t border-steel-line pt-2.5">
              {showHeraldSkeleton && (
                <div className="flex flex-col gap-2">
                  <Skeleton radius="sm" className="h-3 w-full" />
                  <Skeleton radius="sm" className="h-3 w-4/5" />
                </div>
              )}

              {!heraldLoading && herald && (
                <>
                  <div className="flex items-center gap-2">
                    <Icon name="raven" className="h-3.5 w-3.5 shrink-0 text-gold" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
                      The Herald reads your draft
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-bone-mut">{herald}</p>
                  <p className="text-[11px] leading-relaxed text-bone-faint">
                    Written over the figures above and nothing else. It is a
                    reading, not advice, and it does not know the outcome.
                  </p>
                </>
              )}

              {!heraldLoading && heraldError && (
                <p role="alert" className="text-xs leading-relaxed text-state-danger">
                  {heraldError}
                </p>
              )}

              {!heraldLoading && !herald && (
                <Button
                  variant="glass"
                  size="sm"
                  onClick={() => void askHerald()}
                  className="self-start"
                >
                  <Icon name="raven" className="h-3.5 w-3.5" />
                  {heraldError ? "Ask again" : "Ask the Herald before you seal"}
                </Button>
              )}
            </div>

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
      </Card>
    </Card>
  );
}
