import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/flags";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { SET_ONE } from "@/lib/collectibles/set-one";
import { generateServerSeed, openChest } from "@/lib/commerce/chest-open";
import { logger } from "@/lib/observability/log";

/* POST /api/chests/[sku]/open (V2 Part Two, sections 28.2 and 34).
 *
 * The provably-fair opening flow, implementing the Phase D contract that this
 * route recorded as a skeleton:
 *
 *   1. GATE. Auth, then the sku, then chests_live. A sealed chapter answers 423.
 *   2. COMMIT and ROLL. Generate a server seed, publish sha256(seed), and draw
 *      against the printed odds with the printed guarantee floor, all pure in
 *      lib/commerce/chest-open, server-authoritative, the same law as Glory: the
 *      client is told what it pulled, never asked.
 *   3. CLAIM, RECORD and GRANT, ATOMICALLY. open_chest_tx claims one unopened
 *      entitlement, writes the opening (with the revealed seeds), links the
 *      entitlement to it, and writes the pulled cards to inventory, all in one
 *      transaction. Either every write lands or none does, so a database error
 *      partway through can never consume a paid chest without its cards. If the
 *      member holds no unopened chest, the function writes nothing and returns
 *      null, and the route reports no entitlement.
 *
 * The earlier version of this route did (a) mark the entitlement opened, then
 * (b) write the opening, then (c) write inventory, as three separate statements.
 * A failure between (a) and (c) burned a paid chest with no cards, which is the
 * exact bug this route now closes by folding the three into one RPC.
 *
 * Only digital chests open here. The King's Reliquary is physical: its digital
 * twins are minted through the redemption code printed in the box, not this pull.
 */

const log = logger("commerce.chest-open");

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ sku: string }> }) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const { sku } = await ctx.params;
  const tier = CHEST_TIERS.find((t) => t.sku === sku);
  if (!tier) return json({ error: "unknown chest" }, 404);

  const live = await getFlag("chests_live");
  if (!live) return json({ error: "The chests are sealed until launch" }, 423);

  if (tier.kind === "physical") {
    /* A physical chest is opened by hand; its digital twins come from the code
       printed inside it, redeemed at /api/reliquary/redeem. */
    return json({ error: "This chest opens by its printed code" }, 409);
  }

  const rl = await rateLimit(profileKey("chest-open", profile.id), 60, 3600);
  if (!rl.ok) return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as { clientSeed?: unknown } | null;
  const clientSeed =
    typeof body?.clientSeed === "string" && body.clientSeed.length <= 128
      ? body.clientSeed
      : "";

  /* How many the member has opened before, the domain separator for this pull.
     The nonce only has to be recorded exactly as it was used; the entitlement
     that authorises the open is claimed inside the transaction below, not here. */
  const priorRes = await db
    .from("chest_openings")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .eq("chest_sku", sku);
  if (priorRes.error?.code === "42P01") return json({ error: "not migrated" }, 503);
  const nonce = priorRes.count ?? 0;

  /* COMMIT and ROLL, both pure. Nothing is persisted yet: if the member turns
     out to hold no unopened chest, the transaction below writes nothing and this
     work is simply discarded. */
  const serverSeed = generateServerSeed();
  const result = openChest({ tier, serverSeed, clientSeed, nonce });

  const cardRows = result.cards.map((c) => ({
    set_slug: SET_ONE.slug,
    card_number: c.number,
    champion_slug: c.slug,
    rarity: c.rarity,
  }));

  /* CLAIM, RECORD and GRANT in one transaction. Returns the opening id, or null
     when there is no unopened chest to claim. */
  const tx = await db.rpc("open_chest_tx", {
    p_profile_id: profile.id,
    p_chest_sku: sku,
    p_server_seed: serverSeed,
    p_server_seed_hash: result.serverSeedHash,
    p_client_seed: clientSeed,
    p_nonce: nonce,
    p_result: { cards: result.cards },
    p_cards: cardRows,
  });

  if (tx.error) {
    if (tx.error.code === "42P01" || tx.error.code === "42883") {
      return json({ error: "not migrated" }, 503);
    }
    log.error("open_chest_tx failed", {
      profileId: profile.id,
      sku,
      err: tx.error,
    });
    return json({ error: "unavailable" }, 503);
  }

  const openingId = tx.data as string | null;
  if (!openingId) {
    /* No unopened chest of this kind. Nothing was written. */
    return json({ error: "You have no unopened chest of this kind" }, 403);
  }

  /* Reveal: the seed and the nonce, so the member can hash the seed, confirm it
     matches server_seed_hash, and replay the pull. */
  return json({
    opened: true,
    cards: result.cards,
    proof: {
      serverSeed,
      serverSeedHash: result.serverSeedHash,
      clientSeed,
      nonce,
    },
  });
}
