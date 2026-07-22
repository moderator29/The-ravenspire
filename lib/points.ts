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

/* Award points/glory: writes the ledger and updates the profile totals.
   The ledger is the source of truth; totals are a cached convenience. */
export async function award(
  db: SupabaseClient,
  profileId: string,
  opts: { points?: number; glory?: number; reason: string; ref?: string }
) {
  const points = opts.points ?? 0;
  const glory = opts.glory ?? 0;
  if (points === 0 && glory === 0) return;

  await db.from("points_ledger").insert({
    profile_id: profileId,
    points_delta: points,
    glory_delta: glory,
    reason: opts.reason,
    ref: opts.ref ?? null,
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
