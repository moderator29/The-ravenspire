import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit, profileKey } from "@/lib/rate-limit";
import { marketGate } from "@/lib/commerce/market-config";
import { priceInTokenUnits } from "@/lib/commerce/market";
import { verifyMarketLeg } from "@/lib/chain/verify-transfer";

/* POST /api/market/[id]/pay: hand back a transaction and let the realm read it.
 *
 * The buyer's own wallet has paid the seller, or the Exchequer, or both at once
 * if it can batch. That transaction hash is the entire extent of what the
 * client is allowed to assert. Everything else is read off the chain: that the
 * transaction exists and succeeded, that it was sent by that member's own
 * wallet, that the transfer was of the realm's pay token and not some
 * lookalike, and that it carried the full amount to the exact address the
 * reservation named. Only then is a leg recorded, and only when both legs are
 * recorded does the card move.
 *
 * This is AGENTS.md rule 8 applied to the one part of a trade whose source of
 * truth is not this database. The attack it closes is cheap to attempt: paste
 * any hash at all, or somebody else's real transfer, and have the realm hand
 * you a card nobody paid for.
 *
 * ONE HASH MAY PROVE BOTH LEGS. A sale has two payees and a plain ERC-20
 * transfer pays one address, so a buyer ordinarily signs twice. A wallet that
 * batches calls pays both in a single transaction, and then this route finds
 * both transfers in one receipt and settles on the first call. Neither shape
 * is special-cased: whatever the receipt proves is what gets recorded.
 *
 * WHY THE PLATFORM IS NOT IN THE MIDDLE. There is no route here that receives
 * money. The buyer paid the seller's own wallet and the Exchequer directly, and
 * this route reads a public chain to find out that they did. If the realm
 * vanished at this exact moment, the seller would still have been paid, in
 * full, because the payment never went anywhere near the platform. That is the
 * honest test of whether a thing is custodial, and this passes it.
 *
 * THREE OUTCOMES, AND THEY ARE HONESTLY DIFFERENT:
 *   200 { settled: true }    both legs proven, the card has moved, final
 *   200 { settled: false }   one leg proven, the other still owed
 *   202 { pending: true }    the chain has not settled it yet, ask again
 *   400 { error }            checked and wrong, and asking again will not help
 */

export const dynamic = "force-dynamic";

const UNDEFINED_TABLE = "42P01";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/* Polling a pending payment is the normal case, so the window is wide enough
   to poll every few seconds for several minutes on both legs and still leave
   room for a second attempt on a bad day. Matches the claim confirm route. */
const PAY_LIMIT = 240;
const PAY_WINDOW_SECONDS = 3600;

const LISTING_COLUMNS =
  "id, seller_profile_id, buyer_profile_id, inventory_id, status, " +
  "price_minor, fee_minor, seller_minor, buyer_wallet, seller_wallet, " +
  "fee_wallet, pay_token, pay_chain_id, seller_tx_hash, fee_tx_hash";

type ListingRow = {
  id: string;
  seller_profile_id: string;
  buyer_profile_id: string | null;
  inventory_id: string | null;
  status: string;
  price_minor: number;
  fee_minor: number;
  seller_minor: number;
  buyer_wallet: string | null;
  seller_wallet: string | null;
  fee_wallet: string | null;
  pay_token: string | null;
  pay_chain_id: number | null;
  seller_tx_hash: string | null;
  fee_tx_hash: string | null;
};

const REFUSAL: Record<string, { message: string; status: number }> = {
  no_such_listing: { message: "No such listing", status: 404 },
  not_reserved: {
    message: "That trade is no longer open. Reserve the listing again",
    status: 409,
  },
  not_your_reservation: {
    message: "Somebody else is buying that card",
    status: 409,
  },
  already_settled: { message: "Somebody else bought that card", status: 409 },
  copy_moved: {
    message:
      "The seller no longer holds that card. Your payment went to their wallet directly, so take it up with them: the realm never held it",
    status: 409,
  },
  carried_on_chain: {
    message:
      "The seller carried that card to their own wallet. Your payment went to them directly, so take it up with them: the realm never held it",
    status: 409,
  },
  bad_hash: { message: "bad transaction hash", status: 400 },
  nothing_to_record: { message: "That transaction proves nothing", status: 400 },
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const gate = await marketGate();
  if (!gate.open) return json({ error: gate.reason }, gate.status);

  const rl = await rateLimit(
    profileKey("market-pay", profile.id),
    PAY_LIMIT,
    PAY_WINDOW_SECONDS
  );
  if (!rl.ok) {
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  }

  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "No such listing" }, 404);

  const body = (await req.json().catch(() => null)) as { tx_hash?: unknown } | null;
  const txHash =
    typeof body?.tx_hash === "string" ? body.tx_hash.trim().toLowerCase() : null;
  if (!txHash || !TX_HASH_RE.test(txHash)) {
    return json({ error: "bad transaction hash" }, 400);
  }

  const { data, error: readError } = await db
    .from("market_listings")
    .select(LISTING_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    if (readError.code === UNDEFINED_TABLE) {
      return json({ error: "The Bazaar has not been migrated yet" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }
  if (!data) return json({ error: "No such listing" }, 404);
  const listing = data as unknown as ListingRow;

  /* Idempotent for the buyer who settled it, so a double tap or a reloaded
     success screen meets the good news again rather than an error. */
  if (listing.status === "settled") {
    if (listing.buyer_profile_id === profile.id) {
      return json({ settled: true, already: true });
    }
    return json({ error: "Somebody else bought that card" }, 409);
  }
  if (listing.status !== "reserved") {
    return json(
      { error: "That trade is no longer open. Reserve the listing again" },
      409
    );
  }
  if (listing.buyer_profile_id !== profile.id) {
    return json({ error: "Somebody else is buying that card" }, 409);
  }

  /* Everything the reservation froze has to still be there. A reserved listing
     carries all of it by check constraint, so a missing field is a corrupt row
     rather than a member's mistake, and the honest answer is that the realm
     cannot complete the trade rather than a verification against nulls. */
  if (
    !listing.buyer_wallet ||
    !listing.seller_wallet ||
    !listing.fee_wallet ||
    !listing.pay_token ||
    !listing.pay_chain_id
  ) {
    return json({ error: "unavailable" }, 503);
  }

  /* One payment settles one listing. The partial unique indexes enforce it;
     this is the version that produces a sentence. A hash already spent on
     another trade is either a mistake or an attempt to buy two cards with one
     payment, and both get the same answer. */
  const { data: elsewhere } = await db
    .from("market_listings")
    .select("id")
    .or(`seller_tx_hash.eq.${txHash},fee_tx_hash.eq.${txHash}`)
    .neq("id", listing.id)
    .maybeSingle();
  if (elsewhere) {
    return json({ error: "That transaction already settled another trade" }, 409);
  }

  const decimals = gate.config.token.decimals;
  const chainId = listing.pay_chain_id;
  const common = {
    chainId,
    txHash: txHash as `0x${string}`,
    /* The buyer's own wallet as the reservation recorded it, never as the
       request claims it. Without this the most obvious forgery is pasting
       somebody else's real payment as your own. */
    from: listing.buyer_wallet,
    token: listing.pay_token,
  };

  /* Only the legs still owed are checked. A leg already proven is never
     re-verified and never overwritten: the first proof is the real one. */
  let sellerTx: string | null = null;
  let feeTx: string | null = null;
  let pending = false;
  let refusal: string | null = null;

  if (!listing.seller_tx_hash) {
    const verdict = await verifyMarketLeg({
      ...common,
      to: listing.seller_wallet,
      minAmount: priceInTokenUnits(listing.seller_minor, decimals),
    });
    if (verdict.verified) sellerTx = txHash;
    else if (verdict.pending) pending = true;
    else refusal = verdict.reason;
  }

  if (!listing.fee_tx_hash) {
    const verdict = await verifyMarketLeg({
      ...common,
      to: listing.fee_wallet,
      minAmount: priceInTokenUnits(listing.fee_minor, decimals),
    });
    if (verdict.verified) feeTx = txHash;
    else if (verdict.pending) pending = true;
    else refusal = refusal ?? verdict.reason;
  }

  if (!sellerTx && !feeTx) {
    /* Nothing proven. Pending wins over refused when both were seen, because a
       transaction the chain has not settled yet is not a lie, and telling a
       member their real payment was wrong is the worst answer available. */
    if (pending) {
      return json(
        { pending: true, reason: "Waiting for the chain to settle" },
        202
      );
    }
    return json(
      {
        error:
          refusal ?? "That transaction did not pay either side of this trade",
      },
      400
    );
  }

  const { data: settled, error: settleError } = await db.rpc(
    "market_record_payment",
    {
      p_listing_id: listing.id,
      p_buyer_profile_id: profile.id,
      p_seller_tx: sellerTx,
      p_fee_tx: feeTx,
    }
  );

  if (settleError) {
    if (settleError.code === UNDEFINED_TABLE) {
      return json({ error: "The Bazaar has not been migrated yet" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }

  const verdict = settled as {
    ok?: boolean;
    error?: string;
    settled?: boolean;
    already?: boolean;
    seller_paid?: boolean;
    fee_paid?: boolean;
    inventory_id?: string;
  } | null;

  if (!verdict?.ok) {
    const known = verdict?.error ? REFUSAL[verdict.error] : undefined;
    if (known) return json({ error: known.message }, known.status);
    return json({ error: "unavailable" }, 503);
  }

  if (verdict.settled) {
    return json({
      settled: true,
      already: verdict.already === true,
      inventory_id: verdict.inventory_id,
    });
  }

  return json({
    settled: false,
    seller_paid: verdict.seller_paid === true,
    fee_paid: verdict.fee_paid === true,
  });
}
