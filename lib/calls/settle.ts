import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callScore, currencySplit, peerScore } from "@/lib/calls/scoring";
import { peerBaselineFor } from "@/lib/calls/peers";
import type { CallData } from "@/lib/calls/types";

/* Turning a resolved Call into the two currencies (V2 section 9.3). */

export interface ScoredCall {
  /* S, clamped to [-100, +100] and rounded. */
  score: number;
  /* Which baseline produced it. `legacy` means the row predates frozen
     baselines and could only be scored as flat participation. */
  basis: "baseline" | "peer" | "legacy";
  renown: number;
  seasonRating: number;
}

/* Score a Call that has just resolved.

   The peer baseline wins when it exists, because it sums to zero across
   participants and so cannot be gamed by picking easy claims. It exists only
   when at least three INDEPENDENT members Called the same bucket, where
   independence excludes the member's own Calls and every House-mate's; see
   lib/calls/peers.ts.

   A row with no frozen pi_0 and no stated confidence predates Calls V2. It gets
   no score at all rather than a guessed one, because inventing a baseline after
   the fact would be scoring the member against a world they never saw. */
export async function scoreResolvedCall(
  db: SupabaseClient,
  opts: {
    call: CallData;
    authorId: string;
    houseSlug: string | null;
    createdAt: string;
    hit: boolean;
  }
): Promise<ScoredCall> {
  const { call, hit } = opts;
  const confidence = call.confidence;
  const baseline = call.pi_0;

  if (typeof confidence !== "number" || typeof baseline !== "number") {
    return { score: 0, basis: "legacy", renown: 0, seasonRating: 0 };
  }

  const peers = await peerBaselineFor(db, {
    call,
    authorId: opts.authorId,
    houseSlug: opts.houseSlug,
    createdAt: opts.createdAt,
  });

  let score: number;
  let basis: ScoredCall["basis"];
  if (peers.eligible) {
    const peered = peerScore({
      confidence,
      peerConfidences: peers.confidences,
      hit,
    });
    if (Number.isFinite(peered)) {
      score = peered;
      basis = "peer";
    } else {
      score = callScore({ confidence, baseline, hit });
      basis = "baseline";
    }
  } else {
    score = callScore({ confidence, baseline, hit });
    basis = "baseline";
  }

  const split = currencySplit(score);
  return {
    score: Math.round(score),
    basis,
    renown: split.renown,
    seasonRating: split.seasonRating,
  };
}

/* Apply the two currencies atomically. Renown takes max(0, S) and can never
   fall; Season Rating takes S signed and can. The SQL takes greatest(p_score, 0)
   independently of currencySplit, so the monotonic guarantee holds even if a
   caller passes a raw negative score. */
export async function applyCallScore(
  db: SupabaseClient,
  profileId: string,
  score: number
): Promise<void> {
  if (!Number.isFinite(score) || score === 0) return;
  const { error } = await db.rpc("apply_call_score", {
    p_profile_id: profileId,
    p_score: Math.round(score),
  });
  if (error) {
    console.error("[calls] apply_call_score failed", error.message);
  }
}
