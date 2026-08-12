/* Calls V2 analytics: the maths behind the record, the streak, the calibration
   curve and the live progress line (V2 sections 9.5, 9.6, 9.7 and 9.8).

   Dependency free and side effect free, with no "server-only" import, for the
   same reason lib/calls/scoring.ts is: the API routes compute these on the
   server, the composer and the Call detail page want the same numbers on the
   client, and both have to agree exactly or a member is shown one difficulty
   and scored against another.

   Nothing here invents a figure. Every function takes real settled rows and
   returns either a number derived from them or nothing at all. */

import {
  callScore,
  clamp,
  currencySplit,
  type CallDirection,
} from "@/lib/calls/scoring";

/* The shrinkage constant from section 9.6, and the same one the caller board
   in app/api/calls/route.ts already ranks by. Three lucky Calls divided by 23
   is noise; two hundred Calls converge on true skill. */
export const SHRINK = 20;

/* Medals are gated at this many resolved Calls (section 9.6). Below it a
   record is shown honestly but is not ranked as skill. */
export const RANKED_MINIMUM = 25;

export function shrunkAccuracy(hits: number, total: number): number {
  if (!Number.isFinite(hits) || !Number.isFinite(total) || total <= 0) return 0;
  return hits / (total + SHRINK);
}

/* How hard a Call was, in words, read off the frozen baseline.

   pi_0 is the chance the claim came true on its own, with no skill involved, so
   a high baseline is an easy Call and a low one is a hard Call. The bands are
   presentational only: nothing scores off them, they exist so a member can see
   what the number means before they seal. */
export type DifficultyKey = "even" | "testing" | "hard" | "long-odds";

export interface DifficultyBand {
  key: DifficultyKey;
  label: string;
  /* One honest sentence about what the baseline is saying. */
  blurb: string;
}

export function difficultyBand(pi0: number): DifficultyBand {
  if (!Number.isFinite(pi0)) {
    return {
      key: "even",
      label: "Unrated",
      blurb: "The realm could not measure how hard this claim is.",
    };
  }
  if (pi0 >= 0.45) {
    return {
      key: "even",
      label: "Coin flip",
      blurb:
        "This lands about as often as not on its own, so stating it confidently is worth very little.",
    };
  }
  if (pi0 >= 0.25) {
    return {
      key: "testing",
      label: "Testing",
      blurb: "The move is real but well within what this subject does normally.",
    };
  }
  if (pi0 >= 0.1) {
    return {
      key: "hard",
      label: "Hard",
      blurb: "The subject clears this rarely. Calling it correctly counts for a lot.",
    };
  }
  return {
    key: "long-odds",
    label: "Long odds",
    blurb:
      "Trailing volatility says this almost never happens. The score runs to its ceiling either way.",
  };
}

/* What this Call is worth, at the member's stated confidence, before they seal
   it. Both sides of it, because a member is entitled to see the downside of a
   claim they are about to put their name to.

   These are the real scoring functions, not an approximation of them: the same
   callScore and currencySplit the settlement job runs. They are still only an
   outlook, because the peer baseline can replace the volatility baseline by the
   time the Call resolves, and because the server recomputes everything at
   settlement. Nothing here is banked. */
export interface ScoreOutlook {
  ifHit: number;
  ifMiss: number;
  renownIfHit: number;
  renownIfMiss: number;
  seasonIfHit: number;
  seasonIfMiss: number;
}

export function scoreOutlook(confidence: number, pi0: number): ScoreOutlook {
  const ifHit = Math.round(callScore({ confidence, baseline: pi0, hit: true }));
  const ifMiss = Math.round(callScore({ confidence, baseline: pi0, hit: false }));
  const hit = currencySplit(ifHit);
  const miss = currencySplit(ifMiss);
  return {
    ifHit,
    ifMiss,
    renownIfHit: hit.renown,
    renownIfMiss: miss.renown,
    seasonIfHit: hit.seasonRating,
    seasonIfMiss: miss.seasonRating,
  };
}

/* One settled Call, as the record maths needs it. */
export interface SettledCall {
  /* S as stored on the row. Absent on rows sealed before V2 froze a baseline. */
  score?: number | null;
  hit: boolean;
}

/* A Call counts toward a streak when it scored above the baseline it was sealed
   against. A row with no score at all predates V2 and can only be read by its
   verdict, which is what it was judged on at the time. */
export function isPositive(call: SettledCall): boolean {
  if (typeof call.score === "number" && Number.isFinite(call.score)) {
    return call.score > 0;
  }
  return call.hit;
}

export interface Streaks {
  /* The run still standing, at the newest end of the record. */
  current: number;
  /* The longest run the member has ever put together. */
  best: number;
  /* Two consecutive positive Calls is "on fire" (section 9.5). */
  onFire: boolean;
}

/* Streaks over settled Calls, oldest first. */
export function streaks(calls: SettledCall[]): Streaks {
  let current = 0;
  let best = 0;
  for (const call of calls) {
    if (isPositive(call)) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return { current, best, onFire: current >= 2 };
}

/* Calibration buckets (section 9.8).

   Deliberately tail dense, following Manifold: the tails are where
   miscalibration is largest and most interesting, and an even split would hide
   the whole story inside one wide 90 to 99 band. The floor is the confidence
   floor, because no Call below 0.55 can exist. */
export const CALIBRATION_EDGES = [
  0.55, 0.6, 0.7, 0.8, 0.9, 0.95, 0.97, 0.99,
] as const;

export interface CalibrationBucket {
  from: number;
  to: number;
  total: number;
  hits: number;
  /* Mean stated confidence inside the bucket, which is what goes on the x
     axis. Using the bucket's midpoint instead would draw a curve nobody
     actually predicted. */
  stated: number;
  /* Realized frequency, the y axis. */
  realized: number;
}

export interface CalibrationPoint {
  confidence: number;
  hit: boolean;
}

/* Buckets that actually contain resolved Calls. An empty bucket is omitted
   rather than drawn at zero, because a point at zero is a claim the member was
   wrong every time, and they were never there at all. */
export function calibration(points: CalibrationPoint[]): CalibrationBucket[] {
  const edges = CALIBRATION_EDGES;
  const buckets = edges.map((from, i) => ({
    from,
    to: i + 1 < edges.length ? edges[i + 1] : 1,
    total: 0,
    hits: 0,
    sum: 0,
  }));

  for (const point of points) {
    const p = point.confidence;
    if (typeof p !== "number" || !Number.isFinite(p)) continue;
    if (p < edges[0]) continue;
    let index = 0;
    for (let i = edges.length - 1; i >= 0; i--) {
      if (p >= edges[i]) {
        index = i;
        break;
      }
    }
    const bucket = buckets[index];
    bucket.total += 1;
    bucket.sum += p;
    if (point.hit) bucket.hits += 1;
  }

  return buckets
    .filter((b) => b.total > 0)
    .map((b) => ({
      from: b.from,
      to: b.to,
      total: b.total,
      hits: b.hits,
      stated: b.sum / b.total,
      realized: b.hits / b.total,
    }));
}

/* The bucket a stated confidence falls in, or null when the member has never
   settled a Call at that confidence.

   Lives here rather than beside the record reader because both the server and
   the composer need it: the server hands the Herald the member's measured
   calibration, and the confidence slider reads the same band on every step
   without going back to the server for it. An empty band returns null. A member
   who has never called anything at 90 percent has no record at 90 percent, and
   drawing that as a zero would invent one. */
export function bandFor(
  buckets: CalibrationBucket[],
  confidence: number
): CalibrationBucket | null {
  if (!Number.isFinite(confidence)) return null;
  return (
    buckets.find(
      (b) =>
        confidence >= b.from && (confidence < b.to || (b.to >= 1 && confidence <= 1))
    ) ?? null
  );
}

/* How far a live Call has travelled toward the move it needs.

   This is the difference between a receipt and a spectacle (section 9.7): the
   same entry price and the same threshold the Call was sealed with, against the
   current real price, and nothing between them is invented. */
export interface ProgressInput {
  entry: number;
  current: number;
  threshold: number;
  direction: CallDirection;
}

export interface CallProgress {
  /* Signed move since the Call was sealed, as a fraction. */
  move: number;
  /* The same move measured in the direction the Call needs. Negative means it
     is going the wrong way. */
  toward: number;
  /* The move the Call requires, as a positive fraction. Zero means any move in
     the stated direction. */
  required: number;
  /* Share of the required move already made, clamped to [0, 1]. */
  fraction: number;
  /* Would the Call settle as a hit if the window closed on this price. */
  clears: boolean;
}

export function callProgress(input: ProgressInput): CallProgress | null {
  const { entry, current, threshold, direction } = input;
  if (!Number.isFinite(entry) || !(entry > 0)) return null;
  if (!Number.isFinite(current) || !(current > 0)) return null;

  const move = (current - entry) / entry;
  const toward = direction === "down" ? -move : move;
  const required = Number.isFinite(threshold) && threshold > 0 ? threshold : 0;

  /* A zero threshold is the V1 claim, any move in the stated direction, so it
     is either all the way there or nowhere. */
  const fraction =
    required > 0 ? clamp(toward / required, 0, 1) : toward > 0 ? 1 : 0;

  const target =
    direction === "down" ? entry * (1 - required) : entry * (1 + required);
  const clears = direction === "down" ? current < target : current > target;

  return { move, toward, required, fraction, clears };
}

/* Evidence sources, as the realm will store them.

   A Call that cites nothing is still a Call, but a Call that cites something is
   worth reading, and a link is the cheapest evidence there is. Only absolute
   https URLs are kept: a relative path is meaningless to a reader, and any
   other scheme on a link the realm renders is an attack surface rather than a
   citation. */
export const MAX_SOURCES = 3;
const SOURCE_MAX_LENGTH = 300;

export function normalizeSources(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > SOURCE_MAX_LENGTH) continue;
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    const href = url.href;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= MAX_SOURCES) break;
  }
  return out;
}

/* What a source link is called on screen. The host, without the www, because a
   full URL in a list of citations is unreadable. */
export function sourceLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
