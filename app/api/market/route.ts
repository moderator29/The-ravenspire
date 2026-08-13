import { getProfile, requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit, profileKey } from "@/lib/rate-limit";
import { marketGate } from "@/lib/commerce/market-config";
import { readBoard } from "@/lib/commerce/market-board";
import {
  LIVE_CLAIM_STATUSES,
  LIVE_LISTING_STATUSES,
  MARKET_FEE_BPS,
  MAX_PRICE_MINOR,
  MIN_PRICE_MINOR,
  planListing,
  type ListingRefusal,
  type MarketCopy,
} from "@/lib/commerce/market";

/* The Bazaar: the native, non-custodial secondary market.
 *
 * GET  /api/market   the board, and the terms of trading on it
 * POST /api/market   list one card you hold, at a price you name
 *
 * WHY GET IS NOT FLAG GATED. The fee is the price of using this venue, and a
 * member is entitled to read the terms of a trade before the trade exists. The
 * same posture /api/collectibles/craft takes with its ratios and
 * /api/chests/seed takes with the fairness commitment. While the chapter is
 * sealed the board is empty anyway, because nothing has ever been listed, and
 * the surface says both things plainly.
 *
 * WHAT THE MEMBER SENDS TO LIST: a copy they hold and a price. Nothing else.
 * Not the fee, not the split, not the rarity, not the card's identity: all of
 * those are derived server side from the holdings ledger and from
 * lib/commerce/market.ts, because a client that can name its own fee is a
 * client that can sell at a fee of zero, and a client that can name the rarity
 * of what it is selling can sell a rare as a mythic (AGENTS.md rule 8).
 */

export const dynamic = "force-dynamic";

const UNDEFINED_TABLE = "42P01";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Listing is cheap for the realm and consequential for the member, so this is
   generous for anybody actually selling their collection and closed to a loop
   trying to find a race in the ledger reads. */
const LIST_LIMIT = 60;
const LIST_WINDOW_SECONDS = 3600;

/* The rarities the board can be filtered by, which are the four the holdings
   ledger allows. Checked rather than passed through: an unfiltered `eq` on
   arbitrary text is a query nobody sized. */
const RARITIES = new Set(["rare", "epic", "legendary", "mythic"]);

/* The terms, as any surface reads them. The fee in basis points and the price
   bounds, so a listing form can show a member exactly what a sale pays before
   they commit to one. Never a floor value and never an estimated price: the
   per rarity floor is what the platform stands behind, not what a card is
   worth, and this market does not have an opinion about the second thing. */
function terms() {
  return {
    fee_bps: MARKET_FEE_BPS,
    min_price_minor: MIN_PRICE_MINOR,
    max_price_minor: MAX_PRICE_MINOR,
    currency: "usd" as const,
  };
}

export async function GET(req: Request) {
  /* Read-only auth check: never mints a profile row for a probe. A signed-out
     visitor sees the board, which is public, and owns nothing on it. */
  const profile = await getProfile(req);
  const gate = await marketGate();
  const market = gate.open
    ? {
        open: true,
        /* What a client is told about settlement: the chain, the token's
           symbol and its decimals, because a buy control has to be able to
           build a transfer. Never the Coffers address until a listing is
           actually reserved, and never anything else. */
        chain: { id: gate.config.chain.id, name: gate.config.chain.name },
        explorer: gate.config.chain.explorer,
        token: {
          symbol: gate.config.token.symbol,
          decimals: gate.config.token.decimals,
          address: gate.config.token.address,
        },
      }
    : { open: false, reason: gate.reason };

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const url = new URL(req.url);
  const rarityParam = url.searchParams.get("rarity");
  const rarity = rarityParam && RARITIES.has(rarityParam) ? rarityParam : null;

  try {
    /* A member's own live listings are on the board like anybody else's,
       marked as theirs. There is deliberately no separate "my listings" read:
       a seller comparing their own price against the rest of the board is
       exactly what the board is for, and a second view of the same rows is a
       second thing to keep in agreement with the first. */
    const listings = await readBoard(db, {
      viewerProfileId: profile?.id ?? null,
      rarity,
    });
    return json({ listings, market, terms: terms() });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}

/* Why a listing was refused, in words written for a member rather than for a
   log. Kept beside the union it answers so a new refusal cannot be added
   without a sentence to go with it. */
const REFUSAL_COPY: Record<ListingRefusal, { message: string; status: number }> = {
  soulbound: {
    message:
      "Crests are earned, never sold. A crest you can buy is a record of somebody else's day",
    status: 400,
  },
  price_not_integer: {
    message: "A price has to be a whole number of cents",
    status: 400,
  },
  price_too_low: {
    message: "The Bazaar's lowest price is one dollar",
    status: 400,
  },
  price_too_high: {
    message: "That is above the Bazaar's highest price",
    status: 400,
  },
  not_yours: { message: "You do not hold that card", status: 404 },
  carried_on_chain: {
    message:
      "That copy is in your own wallet, so the realm cannot sell it for you. Trade it there instead",
    status: 409,
  },
  already_listed: {
    message: "That copy is already on the Bazaar",
    status: 409,
  },
};

/* What the transaction can refuse, and what to say about it. The route has
   already checked most of these against its own read; reaching one here means
   the ledger moved underneath it. Either way the member is told the truth. */
const SETTLE_COPY: Record<string, { message: string; status: number }> = {
  not_yours: { message: "You do not hold that card", status: 404 },
  carried_on_chain: {
    message:
      "That copy is in your own wallet, so the realm cannot sell it for you",
    status: 409,
  },
  already_listed: { message: "That copy is already on the Bazaar", status: 409 },
};

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const gate = await marketGate();
  /* 423 Locked while the chapter is sealed, 503 while the pay token is unset.
     Two different situations and they answer differently, because a member
     should see the first explained and never have to interpret the second. */
  if (!gate.open) return json({ error: gate.reason }, gate.status);

  const rl = await rateLimit(
    profileKey("market-list", profile.id),
    LIST_LIMIT,
    LIST_WINDOW_SECONDS
  );
  if (!rl.ok) {
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  }

  /* A seller who cannot be paid must not be able to list. Refusing here saves
     a buyer from reserving a listing that could never settle, and it is the
     kind of check that is cheap now and impossible to add politely later. */
  const sellerWallet = profile.wallet_address?.trim();
  if (!sellerWallet || !/^0x[0-9a-fA-F]{40}$/.test(sellerWallet)) {
    return json(
      {
        error:
          "Link a wallet before selling, so a buyer knows where to send your payment",
      },
      400
    );
  }

  const body = (await req.json().catch(() => null)) as {
    inventory_id?: unknown;
    price_minor?: unknown;
  } | null;

  const inventoryId = body?.inventory_id;
  const priceMinor = body?.price_minor;

  if (
    typeof inventoryId !== "string" ||
    !UUID.test(inventoryId) ||
    typeof priceMinor !== "number"
  ) {
    return json({ error: "bad request" }, 400);
  }

  /* Scoped to the caller, and carrying everything the rule judges. A copy that
     is not theirs simply does not come back, which the rule turns into an
     honest refusal rather than a leak of somebody else's holdings. */
  const { data: copy, error: readError } = await db
    .from("inventory")
    .select("id, profile_id, set_slug, card_number, champion_slug, rarity")
    .eq("id", inventoryId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (readError) {
    if (readError.code === UNDEFINED_TABLE) {
      return json({ error: "The holdings ledger has not been migrated yet" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }
  if (!copy) return json({ error: "You do not hold that card" }, 404);

  /* The two things that can already be true of a copy, read separately because
     they live in two ledgers: the claim ledger knows whether it has gone
     on-chain, and the market ledger knows whether it is already for sale. Both
     are re-checked under a row lock inside public.market_list; these reads
     exist so the refusal is a sentence rather than a database verdict. */
  const [{ data: claim }, { data: listed }] = await Promise.all([
    db
      .from("collectible_claims")
      .select("status")
      .eq("inventory_id", inventoryId)
      .in("status", [...LIVE_CLAIM_STATUSES])
      .maybeSingle(),
    db
      .from("market_listings")
      .select("status")
      .eq("inventory_id", inventoryId)
      .in("status", [...LIVE_LISTING_STATUSES])
      .maybeSingle(),
  ]);

  const marketCopy: MarketCopy = {
    id: copy.id as string,
    profile_id: copy.profile_id as string,
    set_slug: copy.set_slug as string,
    card_number: copy.card_number as number,
    champion_slug: copy.champion_slug as string,
    rarity: copy.rarity as string,
    claim_status: (claim?.status as string) ?? null,
    listing_status: (listed?.status as string) ?? null,
  };

  const plan = planListing({
    /* Only a card ever reaches this route: the holdings ledger holds nothing
       else, and lib/commerce/market.ts refuses anything soulbound by asking
       lib/collectibles/token-ids.ts rather than by re-deriving the rule. */
    kind: "card",
    sellerProfileId: profile.id,
    copy: marketCopy,
    priceMinor,
  });

  if (!plan.ok) {
    const copyFor = REFUSAL_COPY[plan.reason];
    return json({ error: copyFor.message }, copyFor.status);
  }

  const { data: settled, error: settleError } = await db.rpc("market_list", {
    p_profile_id: profile.id,
    p_inventory_id: plan.inventoryId,
    p_price_minor: plan.quote.priceMinor,
    p_fee_bps: plan.quote.bps,
    p_fee_minor: plan.quote.feeMinor,
    p_seller_minor: plan.quote.sellerMinor,
  });

  if (settleError) {
    if (settleError.code === UNDEFINED_TABLE) {
      return json({ error: "The Bazaar has not been migrated yet" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }

  const verdict = settled as { ok?: boolean; error?: string; listing_id?: string } | null;
  if (!verdict?.ok) {
    const known = verdict?.error ? SETTLE_COPY[verdict.error] : undefined;
    if (known) return json({ error: known.message }, known.status);
    /* bad_price, bad_fee and bad_split can only be reached by a bug in this
       route, since the rule module has already agreed the listing is legal.
       Reported as an unavailable realm rather than as the member's fault. */
    return json({ error: "unavailable" }, 503);
  }

  return json({
    listing: {
      id: verdict.listing_id,
      inventory_id: plan.inventoryId,
      champion_slug: plan.championSlug,
      card_number: plan.cardNumber,
      rarity: plan.rarity,
      price_minor: plan.quote.priceMinor,
      fee_minor: plan.quote.feeMinor,
      seller_minor: plan.quote.sellerMinor,
      fee_bps: plan.quote.bps,
    },
  });
}
