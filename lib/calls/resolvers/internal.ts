import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TIERS } from "@/lib/points";
import { clamp, BASELINE_MIN, BASELINE_MAX } from "@/lib/calls/scoring";
import type { CallData, CallVerdict, InternalClaim } from "@/lib/calls/types";

/* The internal resolver: Calls about the realm itself (V2 sections 6.3, 9.1).

   "House Emberfall leads at season close." "This member reaches Warden by
   Friday." We own every row these depend on, so there is no external cost, no
   API key, no rate limit, and no oracle to game. It is also the most direct
   expression of a realm where communities build reputation through
   participation: the realm becomes the thing people predict.

   The baseline problem is different here. There is no price series to take a
   volatility from, so pi_0 cannot come from lib/calls/volatility.ts. It comes
   instead from a real cross-sectional base rate read off our own tables at Call
   time: how common is the thing being claimed, right now, among the population
   it is claimed about. That is a genuine base rate from real rows, not an
   invented prior, and it does the same work: claiming something that is already
   true of most of the realm scores near nothing, and claiming something almost
   nobody has done scores heavily.

   The honest limitation, recorded rather than hidden: this base rate is
   cross-sectional and not time-scaled, so a 24h and a 30d internal Call with
   the same claim freeze the same pi_0. Scaling it properly needs a history of
   how often members cross a threshold within a window, and the realm has not
   run long enough to have one. When it has, this is the single function to
   change. */

/* Fewer members than this and a base rate is not a base rate, it is an anecdote.
   The Call is refused rather than sealed against a meaningless number. */
const MIN_POPULATION = 5;

export function parseInternalClaim(raw: unknown): InternalClaim | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;

  if (c.metric === "house_leads" && typeof c.house_slug === "string") {
    return { metric: "house_leads", house_slug: c.house_slug };
  }
  if (
    c.metric === "house_glory" &&
    typeof c.house_slug === "string" &&
    typeof c.at_least === "number" &&
    Number.isFinite(c.at_least)
  ) {
    return {
      metric: "house_glory",
      house_slug: c.house_slug,
      at_least: Math.round(c.at_least),
    };
  }
  if (
    c.metric === "member_tier" &&
    typeof c.profile_id === "string" &&
    typeof c.tier === "string" &&
    TIERS.some((t) => t.slug === c.tier)
  ) {
    return { metric: "member_tier", profile_id: c.profile_id, tier: c.tier };
  }
  if (
    c.metric === "member_renown" &&
    typeof c.profile_id === "string" &&
    typeof c.at_least === "number" &&
    Number.isFinite(c.at_least)
  ) {
    return {
      metric: "member_renown",
      profile_id: c.profile_id,
      at_least: Math.round(c.at_least),
    };
  }
  return null;
}

/* Renown a tier requires, from the one ladder in lib/points.ts. */
function tierFloor(slug: string): number | null {
  return TIERS.find((t) => t.slug === slug)?.min ?? null;
}

/* Is the claim true right now. Used both to settle a matured Call and, at
   creation, to reject a claim that is already true and therefore predicts
   nothing. Returns null when the realm cannot answer, in which case the Call
   stays open and the next sweep tries again. */
export async function evaluateInternalClaim(
  db: SupabaseClient,
  claim: InternalClaim
): Promise<boolean | null> {
  if (claim.metric === "house_leads") {
    const { data } = await db
      .from("houses")
      .select("slug, glory")
      .order("glory", { ascending: false })
      .limit(2);
    if (!data || data.length === 0) return null;
    /* A tie at the top is not a lead. */
    if (data.length > 1 && data[0].glory === data[1].glory) return false;
    return data[0].slug === claim.house_slug;
  }

  if (claim.metric === "house_glory") {
    const { data } = await db
      .from("houses")
      .select("glory")
      .eq("slug", claim.house_slug)
      .maybeSingle();
    if (!data) return null;
    return (data.glory ?? 0) >= claim.at_least;
  }

  const { data: prof } = await db
    .from("profiles")
    .select("renown")
    .eq("id", claim.profile_id)
    .maybeSingle();
  if (!prof) return null;
  const renown = prof.renown ?? 0;

  if (claim.metric === "member_renown") return renown >= claim.at_least;

  const floor = tierFloor(claim.tier);
  if (floor === null) return null;
  return renown >= floor;
}

/* pi_0 for an internal claim: the realm's own base rate for the claim, frozen
   at Call time. Null when the realm is too small or too quiet to produce one,
   which the caller must treat as "this Call cannot be sealed". */
export async function internalBaseline(
  db: SupabaseClient,
  claim: InternalClaim
): Promise<number | null> {
  if (claim.metric === "house_leads") {
    /* The House's share of all Glory in the realm. A House holding two thirds
       of the Glory obviously leads, and Calling it scores accordingly little. */
    const { data } = await db.from("houses").select("slug, glory");
    if (!data || data.length < 2) return null;
    const total = data.reduce((sum, h) => sum + Math.max(h.glory ?? 0, 0), 0);
    if (total <= 0) return null;
    const mine = data.find((h) => h.slug === claim.house_slug);
    if (!mine) return null;
    return clamp(Math.max(mine.glory ?? 0, 0) / total, BASELINE_MIN, BASELINE_MAX);
  }

  if (claim.metric === "house_glory") {
    /* The share of Houses already standing at or above the claimed Glory. */
    const { data } = await db.from("houses").select("glory");
    if (!data || data.length < 2) return null;
    const at = data.filter((h) => (h.glory ?? 0) >= claim.at_least).length;
    return clamp(at / data.length, BASELINE_MIN, BASELINE_MAX);
  }

  /* The share of onboarded members already standing at or above the claimed
     Renown. Claiming a member reaches Squire when most of the realm is already
     Squire is a claim about nothing; claiming they reach Warden when nobody
     has is a claim worth Renown. */
  const target =
    claim.metric === "member_renown"
      ? claim.at_least
      : tierFloor(claim.tier);
  if (target === null) return null;

  const { count: population } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("onboarded", true);
  if (!population || population < MIN_POPULATION) return null;

  const { count: reached } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("onboarded", true)
    .gte("renown", target);

  return clamp((reached ?? 0) / population, BASELINE_MIN, BASELINE_MAX);
}

export interface InternalResolution {
  verdict: Extract<CallVerdict, "hit" | "miss">;
}

/* Settle a matured internal Call. */
export async function resolveInternalCall(
  db: SupabaseClient,
  call: CallData
): Promise<InternalResolution | null> {
  const claim = parseInternalClaim(call.claim);
  if (!claim) return null;
  const truth = await evaluateInternalClaim(db, claim);
  if (truth === null) return null;
  return { verdict: truth ? "hit" : "miss" };
}
