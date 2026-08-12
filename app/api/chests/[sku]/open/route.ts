import { requireProfile, json } from "@/lib/auth/server";
import { getFlag } from "@/lib/flags";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";

/* POST /api/chests/[sku]/open (V2 Part Two, section 28.2). Skeleton only.
 *
 * The gate exists now so the client contract is fixed before the mechanism
 * is built: auth, then the sku, then the flag, and while chests_live is
 * false every caller meets 423 Locked. The real opening logic is Phase D
 * and lands behind this same route with no client change.
 *
 * THE PHASE D CONTRACT, recorded here so it is designed once and not
 * improvised at implementation time:
 *
 *   1. Commit: generate a server seed, store sha256(seed) so the pull is
 *      auditable before it happens. The hash is what chest_openings.
 *      server_seed_hash was built for.
 *   2. Roll: draw the tier's card count against the odds printed on the box
 *      (lib/collectibles/warchests.ts, validated to sum to 100 at module
 *      load), then enforce the tier's guarantee floor. The printed odds and
 *      the rolled odds must be the same object, never two copies.
 *   3. Grant: write the pulled cards to inventory and the audit row to
 *      chest_openings (result jsonb, server_seed_hash, opened_at) in one
 *      transaction, server-authoritative, same law as points: the client is
 *      told what it pulled, never asked.
 *   4. Reveal: answer with the pull and the seed so the member can verify
 *      the hash. The pack-opening Ceremony renders from this response.
 *
 * Payment precedes all of that and is also Phase D; nothing here charges
 * anyone. Until then this route answers, in order: 401 unauthenticated,
 * 404 unknown sku, 423 sealed, 501 for the unreachable case where the flag
 * is up before the mechanism exists.
 */

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ sku: string }> }
) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const { sku } = await ctx.params;
  const tier = CHEST_TIERS.find((t) => t.sku === sku);
  if (!tier) return json({ error: "unknown chest" }, 404);

  const live = await getFlag("chests_live");
  if (!live) {
    /* 423 Locked: the resource exists, the caller is known, the door is
       sealed. Distinct from 403 (never yours) and 404 (never real) so the
       client can honestly render "coming soon" rather than "forbidden". */
    return json({ error: "The chests are sealed until launch" }, 423);
  }

  /* chests_live is up but the opening mechanism is not built. This branch
     exists to fail loudly and honestly if the flag is ever flipped early;
     the Phase D implementation replaces it. */
  return json({ error: "Chest opening is not built yet" }, 501);
}
