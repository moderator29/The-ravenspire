import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bandFor,
  calibration,
  shrunkAccuracy,
  type CalibrationBucket,
  type CalibrationPoint,
} from "@/lib/calls/analytics";
import { bucketKey, subjectKey } from "@/lib/calls/peers";
import { normalizeCall, type CallCategory, type CallData } from "@/lib/calls/types";

/* The caller's own record, and what it says about the confidence they are about
   to state (V2 section 10, the row reading "Calculate confidence, compare with
   previous predictions: free, pure maths over stored Calls, no model needed").

   Nine of the twenty capabilities in section 10 need no model at all, and this
   is the clearest of them. A member's record is a count over rows the realm
   already stores, so computing it in SQL and arithmetic is faster, free,
   deterministic and testable, and asking a model to do it would be asking it to
   invent the one thing it must never invent: a number about a member.

   Everything here is a read. Nothing is written, nothing is banked, and a
   member with no settled Calls gets an honest empty record rather than a
   flattering estimate.

   These figures are also what the Herald is handed before it reads a draft, so
   the model is given the member's real calibration rather than asked to guess
   at it. */

/* One of the member's own Calls, reduced to what the record maths needs. */
export interface RecordEntry {
  category: CallCategory;
  /* The exact claim key: subject, direction, threshold band, window. */
  bucket: string | null;
  /* The subject alone, so "you have Called this coin before" is answerable. */
  subject: string | null;
  confidence: number | null;
  verdict: string;
  hit: boolean;
}

/* A slice of the record: all of it, or the part of it that touches the claim in
   front of the member. */
export interface RecordSlice {
  total: number;
  hits: number;
  /* Null rather than zero when nothing has settled: a member who has never
     resolved a Call has no hit rate, and zero would read as a perfect losing
     streak they never had. */
  hitRate: number | null;
  meanConfidence: number | null;
}

/* How the member's stated confidence has actually performed, inside the
   calibration band that confidence falls in.
        stated    mean confidence they claimed in this band
        realized  how often those Calls landed
        gap       stated minus realized. Positive is historic overconfidence. */
export interface ConfidenceCheck {
  from: number;
  to: number;
  total: number;
  stated: number;
  realized: number;
  gap: number;
}

export interface CallerRecord {
  /* Every settled Call the member has. */
  settled: RecordSlice;
  /* Settled Calls in the same category as the draft. */
  category: RecordSlice;
  /* Settled Calls on the same subject. */
  subject: RecordSlice;
  /* Settled Calls on the exact same claim. */
  claim: RecordSlice;
  /* Calls still running, which is the ceiling MAX_OPEN_CALLS bites against. */
  open: number;
  /* The member's calibration in the band the stated confidence falls in, or
     null when they have never settled a Call at that confidence. */
  confidence: ConfidenceCheck | null;
  /* Every band they have settled a Call in. The composer reads the band for the
     current slider position out of this rather than asking the server again on
     every step. */
  calibration: CalibrationBucket[];
  /* What the caller board ranks by, shrunk so three lucky Calls are not a
     record. Repeated here so a draft panel and the board cannot disagree. */
  score: number;
}

const EMPTY_SLICE: RecordSlice = {
  total: 0,
  hits: 0,
  hitRate: null,
  meanConfidence: null,
};

export const EMPTY_RECORD: CallerRecord = {
  settled: EMPTY_SLICE,
  category: EMPTY_SLICE,
  subject: EMPTY_SLICE,
  claim: EMPTY_SLICE,
  open: 0,
  confidence: null,
  calibration: [],
  score: 0,
};

function slice(entries: RecordEntry[]): RecordSlice {
  if (entries.length === 0) return EMPTY_SLICE;
  let hits = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  for (const entry of entries) {
    if (entry.hit) hits += 1;
    if (typeof entry.confidence === "number") {
      confidenceSum += entry.confidence;
      confidenceCount += 1;
    }
  }
  return {
    total: entries.length,
    hits,
    hitRate: hits / entries.length,
    meanConfidence: confidenceCount > 0 ? confidenceSum / confidenceCount : null,
  };
}

/* The member's realized accuracy inside the calibration band their stated
   confidence falls in.

   The bands are the ones the prediction profile already draws, so a member
   reading "you land 61 percent of what you call at 80 to 90" on a draft sees
   the same band they see on their own calibration curve. A band they have never
   settled a Call in returns null: an empty bucket is not a zero, it is silence,
   and drawing it as a zero would be inventing a record. */
export function confidenceCheck(
  points: CalibrationPoint[],
  stated: number
): ConfidenceCheck | null {
  return checkFor(calibration(points), stated);
}

function checkFor(
  buckets: CalibrationBucket[],
  stated: number
): ConfidenceCheck | null {
  const band = bandFor(buckets, stated);
  if (!band) return null;
  return {
    from: band.from,
    to: band.to,
    total: band.total,
    stated: band.stated,
    realized: band.realized,
    gap: band.stated - band.realized,
  };
}

/* The whole record, sliced against the claim the member is about to make.

   Pure and separate from the query so the slicing rules can be tested without a
   database, the same way eligiblePeers is. */
export function summarizeRecord(
  entries: RecordEntry[],
  focus: {
    category: CallCategory;
    bucket: string | null;
    subject: string | null;
    confidence: number | null;
  }
): CallerRecord {
  const settled = entries.filter((e) => e.verdict === "hit" || e.verdict === "miss");
  const open = entries.filter((e) => e.verdict === "open").length;

  const points: CalibrationPoint[] = [];
  for (const entry of settled) {
    if (typeof entry.confidence === "number") {
      points.push({ confidence: entry.confidence, hit: entry.hit });
    }
  }

  const all = slice(settled);
  const buckets = calibration(points);

  return {
    settled: all,
    category: slice(settled.filter((e) => e.category === focus.category)),
    subject: focus.subject
      ? slice(settled.filter((e) => e.subject === focus.subject))
      : EMPTY_SLICE,
    claim: focus.bucket
      ? slice(settled.filter((e) => e.bucket === focus.bucket))
      : EMPTY_SLICE,
    open,
    confidence:
      typeof focus.confidence === "number"
        ? checkFor(buckets, focus.confidence)
        : null,
    calibration: buckets,
    score: shrunkAccuracy(all.hits, all.total),
  };
}

/* Read every Call this member has ever made and reduce it to the record.

   The same ceiling the prediction profile uses, because it is the same read:
   two thousand rows is far past any real member's history and bounds the query
   rather than trusting it to stay small. */
const HISTORY_LIMIT = 2000;

export async function callerRecordFor(
  db: SupabaseClient,
  opts: { authorId: string; call: CallData }
): Promise<CallerRecord> {
  const { data } = await db
    .from("posts")
    .select("call")
    .eq("author_id", opts.authorId)
    .eq("kind", "call")
    .eq("deleted", false)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const entries: RecordEntry[] = [];
  for (const row of (data ?? []) as unknown as { call: CallData | null }[]) {
    const call = normalizeCall(row.call);
    if (!call) continue;
    entries.push({
      category: (call.category ?? "markets") as CallCategory,
      bucket: bucketKey(call),
      subject: subjectKey(call),
      confidence: typeof call.confidence === "number" ? call.confidence : null,
      verdict: call.verdict ?? "open",
      hit: call.verdict === "hit",
    });
  }

  const draft = normalizeCall(opts.call);
  return summarizeRecord(entries, {
    category: (draft?.category ?? "markets") as CallCategory,
    bucket: draft ? bucketKey(draft) : null,
    subject: draft ? subjectKey(draft) : null,
    confidence: typeof draft?.confidence === "number" ? draft.confidence : null,
  });
}
