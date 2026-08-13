import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit, profileKey } from "@/lib/rate-limit";
import { marketGate } from "@/lib/commerce/market-config";
import {
  RESERVATION_TTL_SECONDS,
  priceInTokenUnits,
} from "@/lib/commerce/market";

/* POST /api/market/[id]/reserve: take a listing off the board for one buyer.
 *
 * THIS IS THE STEP THAT MAKES THE BUYER SAFE, and it is worth being precise
 * about what it does and does not do.
 *
 * It does NOT take custody of anything. No money moves here, no card moves
 * here, and nothing is held by the platform. What it does is freeze one trade:
 * for the length of the window this listing belongs to this buyer at this
 * price, and the seller cannot cancel it, re-price it, sell it to anybody
 * else, burn the card at the crafting bench, or carry it to their own wallet.
 * The last two are enforced by triggers on the tables rather than by anything
 * this route remembers to check.
 *
 * That freeze is what a buyer is paying into. They send their money to the
 * seller's own wallet and the fee to the Exchequer, directly, in transactions
 * they sign themselves, knowing the trade on the other end cannot be pulled
 * out from under them. The platform never sits between the two payments and
 * the two parties.
 *
 * WHAT COMES BACK: the exact amounts, in cents and in the pay token's own base
 * units, and the two addresses to pay. Both amounts are derived server side
 * from the listing's own frozen split, never from anything the client sent,
 * and the addresses come out of the profiles they belong to rather than out of
 * this request. A route that could name a payee is a route that could redirect
 * a sale, which is the single most valuable thing anybody could do to this
 * system.
 */

export const dynamic = "force-dynamic";

const UNDEFINED_TABLE = "42P01";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* A reservation takes a card off the board for half an hour, so a loop that
   could take one out on every listing is a loop that could empty the market.
   Deliberately tighter than listing. */
const RESERVE_LIMIT = 30;
const RESERVE_WINDOW_SECONDS = 3600;

const REFUSAL: Record<string, { message: string; status: number }> = {
  no_such_listing: { message: "No such listing", status: 404 },
  not_active: { message: "That listing has been withdrawn", status: 409 },
  already_settled: { message: "Somebody else bought that card", status: 409 },
  own_listing: { message: "That is your own listing", status: 409 },
  reserved_by_another: {
    message: "Somebody is buying that card right now. Try again shortly",
    status: 409,
  },
  payment_in_flight: {
    message: "That trade is already being paid for",
    status: 409,
  },
  no_buyer_wallet: {
    message: "Link a wallet before buying, so you can pay the seller directly",
    status: 400,
  },
  no_seller_wallet: {
    message: "The seller has no wallet linked, so nobody can pay them",
    status: 409,
  },
  copy_moved: {
    message: "The seller no longer holds that card",
    status: 409,
  },
  carried_on_chain: {
    message: "That card has been carried to the seller's own wallet",
    status: 409,
  },
  amounts_disagree: {
    message: "That listing does not add up, so the realm will not trade on it",
    status: 409,
  },
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
    profileKey("market-reserve", profile.id),
    RESERVE_LIMIT,
    RESERVE_WINDOW_SECONDS
  );
  if (!rl.ok) {
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  }

  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "No such listing" }, 404);

  const { data, error } = await db.rpc("market_reserve", {
    p_listing_id: id,
    p_buyer_profile_id: profile.id,
    /* The chain, the token and the Exchequer come from the realm's own
       configuration and are frozen onto the listing, so a config change while
       somebody is mid-purchase can never move where they were told to pay. */
    p_chain_id: gate.config.chain.id,
    p_pay_token: gate.config.token.address,
    p_fee_wallet: gate.config.feeWallet,
    p_ttl_seconds: RESERVATION_TTL_SECONDS,
  });

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return json({ error: "The Bazaar has not been migrated yet" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }

  const verdict = data as {
    ok?: boolean;
    error?: string;
    already?: boolean;
    price_minor?: number;
    fee_minor?: number;
    seller_minor?: number;
    seller_wallet?: string;
    fee_wallet?: string;
    pay_token?: string;
    pay_chain_id?: number;
    expires_at?: string;
    seller_paid?: boolean;
    fee_paid?: boolean;
  } | null;

  if (!verdict?.ok) {
    const known = verdict?.error ? REFUSAL[verdict.error] : undefined;
    if (known) return json({ error: known.message }, known.status);
    return json({ error: "unavailable" }, 503);
  }

  /* Cents to the token's own base units, exactly, by integer arithmetic. No
     price feed is involved and none could be: the market quotes in dollars and
     settles in a dollar stablecoin, so the quote and the settlement are the
     same number. Sent as strings because a uint256 is not a JavaScript
     number and the moment it becomes one it is a rounding error waiting for a
     large enough trade. */
  const decimals = gate.config.token.decimals;
  const sellerMinor = verdict.seller_minor ?? 0;
  const feeMinor = verdict.fee_minor ?? 0;

  return json({
    reservation: {
      listing_id: id,
      expires_at: verdict.expires_at,
      /* What each side is paid, in cents, so the sheet can print the same
         numbers the member agreed to. */
      price_minor: verdict.price_minor,
      fee_minor: feeMinor,
      seller_minor: sellerMinor,
      /* The two legs, in the order they are meant to be signed. The seller is
         paid first on purpose: a member who abandons the flow halfway has paid
         the seller and owes only the fee, which leaves the seller whole and
         the trade completable, rather than the other way round. */
      legs: [
        {
          leg: "seller" as const,
          to: verdict.seller_wallet,
          amount: priceInTokenUnits(sellerMinor, decimals).toString(),
          minor: sellerMinor,
        },
        {
          leg: "fee" as const,
          to: verdict.fee_wallet,
          amount: priceInTokenUnits(feeMinor, decimals).toString(),
          minor: feeMinor,
        },
      ],
      token: {
        address: verdict.pay_token,
        symbol: gate.config.token.symbol,
        decimals,
      },
      chain_id: verdict.pay_chain_id,
      /* Where a resumed purchase picks up. A member who came back to an
         unfinished trade is not asked to pay twice. */
      seller_paid: verdict.seller_paid === true,
      fee_paid: verdict.fee_paid === true,
      already: verdict.already === true,
    },
  });
}
