import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/flags";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { SET_ONE } from "@/lib/collectibles/set-one";
import { generateServerSeed, openChest } from "@/lib/commerce/chest-open";

/* POST /api/chests/[sku]/open (V2 Part Two, sections 28.2 and 34).
 *
 * The provably-fair opening flow, implementing the Phase D contract that this
 * route recorded as a skeleton:
 *
 *   1. GATE. Auth, then the sku, then chests_live. A sealed chapter answers 423.
 *   2. ENTITLE. The member must hold an unopened chest of this sku. The
 *      entitlement is claimed by a conditional update that sets opened_at only
 *      while it is null, so two concurrent opens of the same chest cannot both
 *      win: the second update matches no row. No entitlement, no open.
 *   3. COMMIT. Generate a server seed and publish sha256(seed) in
 *      chest_openings.server_seed_hash before the pull.
 *   4. ROLL. lib/commerce/chest-open draws against the printed odds and enforces
 *      the printed guarantee floor, server-authoritative, the same law as Glory:
 *      the client is told what it pulled, never asked.
 *   5. GRANT. Write the pulled cards to the inventory ledger and the audit row
 *      to chest_openings, then reveal the seed so the member can verify the hash.
 *
 * Only digital chests open here. The King's Reliquary is physical: its digital
 * twins are minted through the redemption code printed in the box, not this pull.
 */

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

  /* Claim one unopened entitlement atomically. The update targets a single
     unopened row for this member and sku, so a double click or a race claims
     the same row once and the loser claims nothing. */
  const claimTs = new Date().toISOString();
  const pick = await db
    .from("chest_entitlements")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("chest_sku", sku)
    .is("opened_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pick.error) {
    if (pick.error.code === "42P01") return json({ error: "not migrated" }, 503);
    return json({ error: "unavailable" }, 503);
  }
  const entitlementId = pick.data?.id as string | undefined;
  if (!entitlementId) {
    return json({ error: "You have no unopened chest of this kind" }, 403);
  }

  const claim = await db
    .from("chest_entitlements")
    .update({ opened_at: claimTs })
    .eq("id", entitlementId)
    .is("opened_at", null)
    .select("id");
  if (claim.error || (claim.data?.length ?? 0) === 0) {
    /* Someone else claimed it between the select and the update. */
    return json({ error: "You have no unopened chest of this kind" }, 403);
  }

  /* How many the member has opened before, for the pull nonce. */
  const priorRes = await db
    .from("chest_openings")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .eq("chest_sku", sku);
  const nonce = priorRes.count ?? 0;

  const serverSeed = generateServerSeed();
  const result = openChest({ tier, serverSeed, clientSeed, nonce });

  const openingRes = await db
    .from("chest_openings")
    .insert({
      profile_id: profile.id,
      chest_sku: sku,
      result: { cards: result.cards },
      server_seed_hash: result.serverSeedHash,
      server_seed: serverSeed,
      client_seed: clientSeed,
      nonce,
      opened_at: claimTs,
    })
    .select("id")
    .single();

  if (openingRes.error || !openingRes.data) {
    return json({ error: "unavailable" }, 503);
  }
  const openingId = openingRes.data.id as string;

  /* Link the entitlement to its opening, and write the pulled cards to the
     holdings ledger. */
  await db
    .from("chest_entitlements")
    .update({ opening_id: openingId })
    .eq("id", entitlementId);

  const rows = result.cards.map((c) => ({
    profile_id: profile.id,
    set_slug: SET_ONE.slug,
    card_number: c.number,
    champion_slug: c.slug,
    rarity: c.rarity,
    source: "chest_opening",
    source_id: openingId,
  }));
  await db.from("inventory").insert(rows);

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
