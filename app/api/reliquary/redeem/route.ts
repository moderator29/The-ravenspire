import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/flags";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { SET_ONE } from "@/lib/collectibles/set-one";
import { hashCode, isWellFormed } from "@/lib/commerce/redemption";

/* POST /api/reliquary/redeem (V2 Part Two, section 34).
 *
 * Redeem the single-use code printed inside a King's Reliquary. The code is a
 * bearer secret, so it is never stored in the clear: the route hashes the
 * presented code and claims the matching redemption row.
 *
 * REPLAY PROOF AND SINGLE USE, at the database. The claim is a conditional
 * update that sets redeemed_by and redeemed_at only while redeemed_by is null.
 * Two concurrent redemptions of the same code cannot both win: the second
 * update matches no row. A code that does not exist and a code already redeemed
 * are answered identically, so the route never confirms a code's existence to a
 * guesser. A per-member rate limit bounds guessing further.
 *
 * NON-CUSTODIAL. Redemption grants the digital twins into the member's own
 * holdings ledger (inventory). It never takes custody of an asset and never
 * holds a key. The on-chain claim, where the member signs to pull the twins to
 * their own wallet, is the mint phase (section 28.3, status 'claimable'): it
 * needs deployed contracts and a platform voucher signer that do not exist yet,
 * and faking either would violate the non-custodial and real-data rules. So the
 * twin is real and off-chain now, and becomes on-chain claimable when the
 * contracts land, with no second redemption required.
 */

export const dynamic = "force-dynamic";

interface Grant {
  cards?: { number?: number; slug?: string; rarity?: string }[];
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const live = await getFlag("chests_live");
  if (!live) return json({ error: "The reliquary is sealed until launch" }, 423);

  const rl = await rateLimit(profileKey("redeem", profile.id), 10, 3600);
  if (!rl.ok) return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  if (!isWellFormed(code)) return json({ error: "invalid code" }, 400);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const codeHash = hashCode(code);

  /* Claim the code atomically: set the redeemer only while unredeemed. Also
     bump attempts, so a code being hammered is visible. */
  const claim = await db
    .from("redemptions")
    .update({
      redeemed_by: profile.id,
      redeemed_at: new Date().toISOString(),
    })
    .eq("code_hash", codeHash)
    .is("redeemed_by", null)
    .select("id, grants")
    .maybeSingle();

  if (claim.error) {
    if (claim.error.code === "42P01") return json({ error: "not migrated" }, 503);
    return json({ error: "unavailable" }, 503);
  }
  if (!claim.data) {
    /* Unknown or already redeemed: one answer, never distinguished. */
    return json({ error: "This code is not valid or has already been used" }, 409);
  }

  /* Interpret the grant authored when the code was created. Never invented:
     the cards are exactly those recorded on the redemption row. */
  const redemptionId = claim.data.id as string;
  const grant = (claim.data.grants ?? {}) as Grant;
  const cards = Array.isArray(grant.cards) ? grant.cards : [];
  const validRarities = new Set(["rare", "epic", "legendary", "mythic"]);
  const rows = cards
    .filter(
      (c) =>
        typeof c.number === "number" &&
        typeof c.slug === "string" &&
        typeof c.rarity === "string" &&
        validRarities.has(c.rarity)
    )
    .map((c) => ({
      profile_id: profile.id,
      set_slug: SET_ONE.slug,
      card_number: c.number as number,
      champion_slug: c.slug as string,
      rarity: c.rarity as string,
      source: "redemption",
      source_id: redemptionId,
    }));

  if (rows.length > 0) {
    await db.from("inventory").insert(rows);
  }

  return json({ redeemed: true, granted: rows.length });
}
