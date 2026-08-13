import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { houseBySlug } from "@/lib/data/houses";
import { HOUSE_PERKS, type HousePerkSlug } from "@/lib/houses/perks";
import { buyHousePerk } from "@/lib/houses/treasury";

/* POST /api/houses/[slug]/treasury
 *
 * Spend a House treasury on one perk. The only write in the realm where a
 * member spends something that is not theirs, which is why every part of it is
 * decided on the server.
 *
 * WHAT THIS ROUTE DECIDES: nothing. It authenticates, it checks the perk slug
 * is one the realm sells, it meters the call, and it hands the rest to
 * spend_house_treasury, which under the House row lock verifies that the
 * caller holds an open oath to this House with the role of Lord or Hand, that
 * the perk is not already burning, and that the treasury can afford the price
 * computed from the live sworn count. Doing any of that here instead would put
 * a check and a write on either side of a network round trip, and a treasury
 * can be spent twice in that gap.
 *
 * The House slug comes from the path and the actor from the bearer token.
 * Neither is ever taken from the body. */

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded)
    return json({ error: "Finish onboarding first" }, 403);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { slug } = await ctx.params;
  if (!houseBySlug(slug)) return json({ error: "not_found" }, 404);

  /* A perk purchase is rare by design (the cheapest burns for seven days and
     cannot be bought again while it does), so the limit is set to stop a
     hammering client rather than to ration a real member. */
  const rl = await rateLimit(profileKey("house-treasury", profile.id), 10, 3600);
  if (!rl.ok)
    return json(
      { error: "The treasury is being opened too often. Try again shortly.", retryAfter: rl.retryAfter },
      429
    );

  const body = (await req.json().catch(() => null)) as { perk?: unknown } | null;
  const perk = typeof body?.perk === "string" ? body.perk : "";
  if (!(HOUSE_PERKS as readonly string[]).includes(perk))
    return json({ error: "The realm does not offer that." }, 400);

  const result = await buyHousePerk(db, {
    houseSlug: slug,
    actorId: profile.id,
    perk: perk as HousePerkSlug,
  });

  if (!result.ok) return json({ error: result.error }, result.status);

  return json({
    ok: true,
    perk,
    cost: result.cost,
    treasury: result.treasury,
  });
}
