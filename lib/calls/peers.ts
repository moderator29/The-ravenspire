import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONFIDENCE_MAX,
  CONFIDENCE_MIN,
  HORIZON_DAYS,
  MIN_PEERS,
} from "@/lib/calls/scoring";
import { normalizeCall, priceSubjectFor, type CallData } from "@/lib/calls/types";

/* The peer baseline (V2 sections 9.2 and 9.5).

   When enough independent members have Called the same thing over the same
   window, the crowd is a better baseline than the volatility model, because a
   peer score sums to zero across participants and is therefore immune to
   difficulty by construction.

   "Independent" is the entire load-bearing word, and it is why this file exists
   separately from scoring.ts. Two exclusions, both from section 9.5:

     1. A member is never their own peer. Otherwise a member with two accounts
        is their own baseline.
     2. House-mates are never each other's peers. Six people in one House who
        agree are not a crowd, they are a collusion ring with a banner, and
        Houses are exactly the pre-built coordination structure that makes the
        attack cheap. This is the third anti-farming rule, and it is enforced
        here rather than at settlement so that no caller can forget it. */

/* Threshold moves within the same 5 percentage point band are the same claim.
   Without bucketing, two members Calling +40% and +40.1% would never be peers,
   which would make the peer baseline unreachable in practice. */
export function thresholdBucket(threshold: number): number {
  if (!Number.isFinite(threshold) || threshold < 0) return 0;
  return Math.round(threshold * 20) / 20;
}

/* What the Call is about, with nothing about how it is stated. Two Calls on the
   same coin share this key even when one says it rises 5 percent in a day and
   the other says it falls 40 percent in a month, which is exactly the relation
   the similarity reader in lib/calls/similar.ts needs and the peer baseline
   must not have. */
export function subjectKey(call: CallData): string | null {
  const normalized = normalizeCall(call);
  if (!normalized) return null;

  if (normalized.resolver === "internal") {
    const claim = normalized.claim;
    if (!claim) return null;
    return JSON.stringify(claim);
  }

  const subject = priceSubjectFor(normalized);
  if (!subject) return null;
  return subject.kind === "dex"
    ? `${subject.chain}:${subject.address.toLowerCase()}`
    : subject.kind === "coingecko"
      ? `cg:${subject.id}`
      : `ticker:${subject.token.toUpperCase()}`;
}

/* The key that decides whether two Calls are the same claim: same subject, same
   direction, same threshold band, same window. */
export function bucketKey(call: CallData): string | null {
  const normalized = normalizeCall(call);
  if (!normalized) return null;

  const subject = subjectKey(normalized);
  if (!subject) return null;

  return [
    subject,
    normalized.stance ?? "up",
    thresholdBucket(normalized.threshold ?? 0),
    normalized.timeframe ?? "24h",
  ].join("|");
}

interface PeerRow {
  author_id: string;
  house_slug: string | null;
  call: CallData | null;
  created_at: string;
}

export interface PeerBaseline {
  confidences: number[];
  /* True when there are enough independent peers to score against the crowd
     rather than against the volatility model. */
  eligible: boolean;
}

/* Independent peer confidences on the same claim.

   Exported separately from the query so the exclusion rules can be unit tested
   without a database. */
export function eligiblePeers(
  rows: PeerRow[],
  opts: { key: string; authorId: string; houseSlug: string | null; createdAt: number; windowMs: number }
): number[] {
  const seen = new Set<string>();
  const confidences: number[] = [];

  for (const row of rows) {
    if (row.author_id === opts.authorId) continue;
    /* Anti-farming rule 3: House-mates are not independent. A member with no
       House is excluded from nobody, and excludes nobody. */
    if (
      opts.houseSlug &&
      row.house_slug &&
      row.house_slug === opts.houseSlug
    ) {
      continue;
    }
    /* One vote per member, the earliest one, so a member cannot weight the
       baseline by Calling the same bucket repeatedly. */
    if (seen.has(row.author_id)) continue;

    const call = normalizeCall(row.call);
    if (!call) continue;
    if (bucketKey(call) !== opts.key) continue;

    const confidence = call.confidence;
    if (
      typeof confidence !== "number" ||
      confidence < CONFIDENCE_MIN ||
      confidence > CONFIDENCE_MAX
    ) {
      continue;
    }

    /* Calls made too far apart are not forecasts of the same thing: a 24h Call
       from last week resolved against a different world. Half a window either
       side keeps the overlap real. */
    const drift = Math.abs(Date.parse(row.created_at) - opts.createdAt);
    if (!Number.isFinite(drift) || drift > opts.windowMs / 2) continue;

    seen.add(row.author_id);
    confidences.push(confidence);
  }

  return confidences;
}

/* Gather the independent peer baseline for a Call from real rows. */
export async function peerBaselineFor(
  db: SupabaseClient,
  opts: {
    call: CallData;
    authorId: string;
    houseSlug: string | null;
    createdAt: string;
  }
): Promise<PeerBaseline> {
  const key = bucketKey(opts.call);
  if (!key) return { confidences: [], eligible: false };

  const normalized = normalizeCall(opts.call);
  const days = HORIZON_DAYS[normalized?.timeframe ?? "24h"] ?? 1;
  const windowMs = days * 24 * 60 * 60 * 1000;
  const createdAt = Date.parse(opts.createdAt);
  if (!Number.isFinite(createdAt)) return { confidences: [], eligible: false };

  const from = new Date(createdAt - windowMs / 2).toISOString();
  const to = new Date(createdAt + windowMs / 2).toISOString();

  const { data } = await db
    .from("posts")
    .select("author_id, house_slug, call, created_at")
    .eq("kind", "call")
    .eq("deleted", false)
    .gte("created_at", from)
    .lte("created_at", to)
    .limit(500);

  const confidences = eligiblePeers((data ?? []) as unknown as PeerRow[], {
    key,
    authorId: opts.authorId,
    houseSlug: opts.houseSlug,
    createdAt,
    windowMs,
  });

  return { confidences, eligible: confidences.length >= MIN_PEERS };
}
