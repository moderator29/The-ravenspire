import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAndGrantCrests } from "@/lib/crests";

export const TIERS: { slug: string; name: string; min: number }[] = [
  { slug: "smallfolk", name: "Smallfolk", min: 0 },
  { slug: "squire", name: "Squire", min: 100 },
  { slug: "knight", name: "Knight", min: 400 },
  { slug: "lord", name: "Lord / Lady", min: 1200 },
  { slug: "warden", name: "Warden", min: 3000 },
  { slug: "hand", name: "Hand", min: 7000 },
  { slug: "king", name: "King / Queen", min: 15000 },
];

export function tierFor(renown: number) {
  let current = TIERS[0];
  for (const t of TIERS) if (renown >= t.min) current = t;
  return current;
}

/* The daily ceiling on Renown drawn from social actions (V2 section 9.5, rule
   4). Likes, reravens, comments, duel votes and authoring ravens are all
   unbounded actions that any two accounts can perform on each other forever, so
   without a ceiling a pair of colluding accounts farms Renown indefinitely and
   the ladder means nothing. Resolved Calls are deliberately NOT capped: a Call
   costs a scarce open-Call slot, is scored against a difficulty baseline, and
   is the one thing the realm actually wants people doing more of.

   Set where a genuinely active member never notices it and a farm hits it
   inside an hour. */
export const DAILY_SOCIAL_RENOWN_CAP = 200;

/* Which allowance an award draws from.
     social  counts against the daily ceiling above
     call    a resolved Call, uncapped by design
   Omitted means uncapped and uncategorised, which is every award that is
   neither, and every row written before this existed. */
export type AwardCategory = "social" | "call";

export interface AwardResult {
  points: number;
  glory: number;
  /* True when the daily social ceiling trimmed the award. */
  capped: boolean;
}

/* Award points/glory: writes the ledger and updates the profile totals.
   The ledger is the source of truth; totals are a cached convenience. */
export async function award(
  db: SupabaseClient,
  profileId: string,
  opts: {
    points?: number;
    glory?: number;
    reason: string;
    ref?: string;
    category?: AwardCategory;
  }
): Promise<AwardResult> {
  const points = opts.points ?? 0;
  const glory = opts.glory ?? 0;
  if (points === 0 && glory === 0)
    return { points: 0, glory: 0, capped: false };

  /* A social award has to check the day's allowance and write the ledger
     without a gap in between, or two concurrent likes both see room and both
     spend it. award_social_capped takes the profile row lock, sums the day, and
     writes the ledger and both totals in one function, so the read and the
     write cannot interleave. Service-role only, like every other economy RPC. */
  if (opts.category === "social") {
    const { data, error } = await db.rpc("award_social_capped", {
      p_profile_id: profileId,
      p_points: points,
      p_glory: glory,
      p_reason: opts.reason,
      p_ref: opts.ref ?? null,
      p_daily_cap: DAILY_SOCIAL_RENOWN_CAP,
    });
    if (error) {
      console.error("[points] capped award failed", opts.reason, error.message);
      return { points: 0, glory: 0, capped: false };
    }
    const granted = (data ?? {}) as Partial<AwardResult>;
    const result: AwardResult = {
      points: granted.points ?? 0,
      glory: granted.glory ?? 0,
      capped: granted.capped ?? false,
    };
    if (result.points > 0 || result.glory > 0) {
      await checkAndGrantCrests(db, profileId);
    }
    return result;
  }

  await db.from("points_ledger").insert({
    profile_id: profileId,
    points_delta: points,
    glory_delta: glory,
    reason: opts.reason,
    ref: opts.ref ?? null,
    category: opts.category ?? null,
  });

  /* Atomic increment via RPC: profiles totals and tier update as a single
     statement, so concurrent awards can no longer lose increments the way the
     old select then update did. The function returns the profile's house_slug
     so House Glory can be bumped atomically in a second, equally safe call.
     tierFor stays exported for callers that need the tier ladder in TS; the
     RPC mirrors its thresholds server side. */
  const { data: houseSlug } = await db.rpc("increment_profile_totals", {
    p_profile_id: profileId,
    p_points: points,
    p_glory: glory,
  });

  if (glory > 0 && houseSlug) {
    await db.rpc("increment_house_glory", {
      p_slug: houseSlug as string,
      p_glory: glory,
    });
  }

  await checkAndGrantCrests(db, profileId);
  return { points, glory, capped: false };
}

export async function grantCrest(
  db: SupabaseClient,
  profileId: string,
  crestSlug: string
) {
  await db
    .from("user_crests")
    .upsert(
      { profile_id: profileId, crest_slug: crestSlug },
      { onConflict: "profile_id,crest_slug", ignoreDuplicates: true }
    );
}
