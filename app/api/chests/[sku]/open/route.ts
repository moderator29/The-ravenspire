import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit, profileKey } from "@/lib/rate-limit";
import { getFlag } from "@/lib/flags";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { activeCommitment, nextCommitment } from "@/lib/collectibles/seeds";
import { rollChest } from "@/lib/collectibles/pulls";

/* POST /api/chests/[sku]/open (V2 Part Two, section 28.2).
 *
 * Opening a chest, server-authoritative and provably fair.
 *
 * WHAT THE MEMBER SENDS: nothing that matters. The body is empty. They may
 * name an entitlement, and even that is checked to be theirs and unspent. The
 * cards are not asked for, the odds are not sent, the seed is not chosen here.
 * Same law as points: the client is told what it pulled, never asked.
 *
 * THE ORDER, and every step is load bearing:
 *   1. The flag. While chests_live is false every caller meets 423 Locked.
 *   2. An unspent entitlement. Chests are not free and this route does not
 *      make them so: something must have granted the entitlement first (an
 *      order, or a redemption code from a physical box). No entitlement, no
 *      chest, and the answer says so plainly.
 *   3. The commitment. The member's server seed was committed, hash published,
 *      before they ever got here, and they answered it with a client seed of
 *      their own after seeing that hash. If somehow no commitment exists, this
 *      refuses rather than committing one now: a seed committed at open time is
 *      the exact dishonesty the whole scheme exists to prevent.
 *   4. The roll, in lib/collectibles/pulls.ts: a pure function of the server
 *      seed, the member's client seed, and the entitlement id as the nonce.
 *      The odds it rolls against are the odds printed on the box, the same
 *      object, not a copy.
 *   5. The settle and the reveal, in one transaction (public.chest_open): the
 *      commitment is published and retired, a fresh one is committed for the
 *      next chest, the entitlement is spent, the opening is recorded with the
 *      revealed seed beside the hash that preceded it, and the cards land in
 *      the holdings ledger. All of it or none of it. A crash halfway used to
 *      mean either a paid chest that granted nothing or cards granted twice,
 *      and neither is distinguishable afterwards.
 *
 * The response is the Ceremony's script: the cards, the seed that produced
 * them, the hash that was published before they were drawn, and the commitment
 * for the chest after this one. A member walks away able to check the roll
 * without asking the realm for anything further.
 */

export const dynamic = "force-dynamic";

/* Opening is a write and a payment being consumed. A member opens a handful of
   chests in a sitting; this is generous for that and closes the door on a loop
   racing the entitlement check. */
const OPEN_LIMIT = 60;
const OPEN_WINDOW_SECONDS = 3600;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ sku: string }> }
) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { sku } = await ctx.params;
  const tier = CHEST_TIERS.find((t) => t.sku === sku);
  if (!tier) return json({ error: "unknown chest" }, 404);

  if (tier.kind === "physical") {
    /* A physical chest is opened by hand. Its digital twins come from the code
       printed inside it, redeemed at /api/reliquary/redeem, so there is nothing
       to roll here. Kept from the commerce wave's version of this route. */
    return json({ error: "This chest opens by its printed code" }, 409);
  }

  const live = await getFlag("chests_live");
  if (!live) {
    /* 423 Locked: the resource exists, the caller is known, the door is
       sealed. Distinct from 403 (never yours) and 404 (never real) so the
       client can honestly render "coming soon" rather than "forbidden". */
    return json({ error: "The chests are sealed until launch" }, 423);
  }

  const rl = await rateLimit(
    profileKey("chest-open", profile.id),
    OPEN_LIMIT,
    OPEN_WINDOW_SECONDS
  );
  if (!rl.ok) {
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  }

  /* An unspent entitlement of this tier, oldest first so a member who bought
     several spends them in the order they arrived. The row is only a
     candidate: chest_open locks it and re-checks that it is unspent, so two
     requests choosing the same one cannot both open it. */
  const { data: entitlement, error: entitlementError } = await db
    .from("chest_entitlements")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("chest_sku", sku)
    .is("opened_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (entitlementError) return json({ error: "unavailable" }, 503);
  if (!entitlement) {
    return json(
      { error: "You have no unopened chest of that kind" },
      /* 409: the request is well formed and the caller is entitled to make it;
         the realm's state is simply not one in which it can succeed. */
      409
    );
  }

  const commitment = await activeCommitment(db, profile.id);
  if (!commitment) return json({ error: "unavailable" }, 503);

  /* The nonce is the entitlement being spent. A uuid, unique to one opening,
     and fixed before the roll rather than counted during it, so a retried
     request recomputes the same chest instead of rerolling into a better
     one. */
  const nonce = entitlement.id as string;

  const roll = rollChest({
    tier,
    serverSeed: commitment.seed,
    clientSeed: commitment.client_seed,
    nonce,
  });

  /* The commitment for the chest AFTER this one, generated here so that the
     reveal and the recommit reach the database together. A member is never
     left without a live commitment, and so can never be asked to open a chest
     against a seed they have already been shown. */
  const next = nextCommitment();

  const { data: openingId, error: settleError } = await db.rpc("chest_open", {
    p_profile_id: profile.id,
    p_entitlement_id: nonce,
    p_seed_id: commitment.id,
    p_server_seed_hash: roll.proof.server_seed_hash,
    p_server_seed: commitment.seed,
    p_client_seed: roll.proof.client_seed,
    p_next_seed: next.seed,
    p_next_seed_hash: next.seedHash,
    p_result: { v: 1, cards: roll.cards, proof: roll.proof },
    p_cards: roll.cards,
  });

  if (settleError) return json({ error: "unavailable" }, 503);

  if (!openingId) {
    /* Either the entitlement was spent between the read and the lock, or the
       commitment was revealed by another opening that got there first. The
       first case has an opening to read back; the second means this roll was
       computed against a seed the member may now have seen, so it is thrown
       away rather than recorded and the caller opens again against the fresh
       commitment. */
    const { data: prior } = await db
      .from("chest_openings")
      .select("id, result, server_seed_hash, server_seed, client_seed, opened_at")
      .eq("entitlement_id", nonce)
      .maybeSingle();
    if (prior) {
      return json({ opening: prior, already_opened: true });
    }
    return json(
      { error: "Another chest was opening at the same moment. Try again." },
      409
    );
  }

  return json({
    opening: {
      id: openingId,
      chest_sku: sku,
      cards: roll.cards,
      /* The reveal. The seed that drew these cards, published now that it is
         spent, beside the hash that was published before they were drawn.
         Hash the one, compare it to the other, rerun the roll: the member can
         check this chest without asking the realm for anything further. */
      proof: { ...roll.proof, server_seed: commitment.seed },
    },
    /* And the commitment for the next chest, so the member is already holding
       the promise for it before they decide to buy one. */
    next_commitment: { seed_hash: next.seedHash },
  });
}
