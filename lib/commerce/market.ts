import "server-only";
import { splitFee, type FeeSplit } from "@/lib/commerce/money";
import { isSoulbound, type ClaimSubjectKind } from "@/lib/collectibles/token-ids";

/* THE BAZAAR: the native secondary market, and the reason it is not custody.
 *
 * WHY THIS EXISTS
 * Members hold real cards. Until now there was nowhere to trade one, so a
 * collection could only ever grow, and a card nobody can sell has a floor the
 * platform stands behind and no price anybody has ever paid. A collectibles
 * economy without a secondary market is a subscription with pictures.
 *
 * THE HARD CONSTRAINT, AND IT SHAPES EVERY LINE BELOW
 * The platform never holds a card and never holds a payment. Not in escrow,
 * not briefly, not "just while the trade settles" (AGENTS.md rule 6). That
 * single sentence rules out the design every marketplace reaches for first,
 * which is: buyer pays the platform, platform holds the money, platform hands
 * the card over, platform forwards the money on. That design is custody of
 * somebody else's money by any definition anybody would use in court, and the
 * fact that the holding period is short does not change what it is.
 *
 * WHAT IS BUILT INSTEAD, END TO END
 *
 *   1. A LISTING IS AN INTENT, NEVER A DEPOSIT. Listing a card does not move
 *      it. `inventory.profile_id` stays the seller's for the entire life of the
 *      listing. There is no market escrow row, no platform-owned profile, and
 *      no moment at which the answer to "who owns this copy" is the platform.
 *      The card moves exactly once, in public.market_settle, straight from the
 *      seller to the buyer, in the same transaction that records the payment.
 *
 *   2. THE MONEY GOES WALLET TO WALLET. The buyer's own Privy wallet pays the
 *      seller's own wallet, and pays the protocol fee to the Exchequer. The
 *      platform signs nothing, receives nothing that belongs to the seller,
 *      and could not intercept the proceeds if it wanted to. The honest test
 *      the ownership loop uses applies here too: if the platform vanished
 *      halfway through, the buyer's payment would already be in the seller's
 *      wallet, because it went there directly and never anywhere else.
 *
 *   3. THE FEE IS REVENUE, NOT CUSTODY. The Exchequer receives the fee from the
 *      buyer, in the buyer's own transaction, as a disclosed charge for running
 *      the venue. Receiving your own fee is not holding somebody else's asset.
 *
 * WHY THE BUYER PAYS FIRST, AND WHY THAT IS SAFE
 * An off-chain ledger row and an on-chain payment cannot settle atomically:
 * they are two different systems and one of them has to move first. There are
 * exactly three ways to order it and only one of them is allowed.
 *
 *   (a) The platform escrows the payment. Atomic, and custody. Refused.
 *   (b) The card moves first, then the buyer pays. The seller carries the
 *       whole risk and has no recourse when the buyer simply does not pay.
 *   (c) The buyer pays against a reservation the realm has already frozen, and
 *       the ledger moves on proof of payment.
 *
 * (c) is what is built, and the reservation is the thing that makes it safe.
 * While a listing is reserved to one buyer, the seller cannot cancel it,
 * cannot re-price it, cannot sell it to anybody else, cannot burn the card at
 * the crafting bench, and cannot carry it to their own wallet: the last two
 * are enforced by triggers in the migration, not by a route remembering to
 * check. So the buyer pays into a trade the realm has already committed to
 * completing, and the only failure left is the realm failing to record a
 * payment that is on a public chain forever, which is retryable and
 * idempotent rather than a loss.
 *
 * Said plainly, because a member is owed the plain version: the buyer takes a
 * short window of risk against the realm's bookkeeping. They never take
 * custody risk, because nobody has custody.
 *
 * WHY TWO TRANSFERS AND NOT ONE
 * A plain ERC-20 transfer pays one address, and this trade has two payees: the
 * seller and the Exchequer. The single-transaction version of that is the buyer
 * paying the whole amount to the platform, which then forwards the seller's
 * share, and that is precisely the custody this design refuses. So the buyer
 * signs twice, or once if their wallet can batch the two calls, and the realm
 * verifies whichever legs each transaction actually proves. Two signatures is
 * the price of never touching the seller's money, and it is the right price.
 * The seller leg is asked for first on purpose: a member who abandons the flow
 * halfway has paid the seller and owes only the fee, which leaves the seller
 * whole and the trade completable, rather than the other way round.
 *
 * THE FLOOR IS NOT A PRICE, AND THIS MODULE DOES NOT KNOW IT
 * lib/commerce/catalog.ts is deliberately not imported here. RARITY_FLOOR_USD
 * is what the PLATFORM commits to standing behind for a rarity; it is not a
 * market price, not an appraisal, and not a claim about what anybody else will
 * pay. A market that displayed it beside a listing would be quoting it as one,
 * whatever the label said. The seller names their price and that is the only
 * number on the board. There is no estimated value here and there will not be
 * one: the realm does not know what a card is worth, and inventing a figure is
 * the same lie whether it comes from a floor table or from a model.
 */

/* ------------------------------------------------------------------
   The terms.
   ------------------------------------------------------------------ */

/* The protocol fee, in basis points. 500 bps is 5%.
 *
 * Small, explicit, and shown in full before anybody commits: the buyer sees
 * the price, the fee and the total before they sign, and the seller sees what
 * they will receive before they list. It is never taken out of a spread,
 * never hidden in a rounded price, and never described as "network costs".
 *
 * Five percent is where it sits because of what it sits between. eBay takes
 * about thirteen percent of a collectibles sale and StockX about nine, both on
 * an inventory the seller has to ship. An NFT marketplace takes two and a half
 * and provides no floor, no authentication and no venue beyond a contract.
 * This market authenticates every card by construction, because the realm
 * printed it, and the fee funds the Exchequer rather than a middleman. Five is
 * defensible on both sides of that range and it is a round number a member can
 * check in their head, which matters more than an optimised number they
 * cannot. */
export const MARKET_FEE_BPS = 500;

/* The cheapest and dearest a card may be listed for, in USD minor units.
 *
 * The floor is not squeamishness about small trades. At a dollar the fee is
 * five cents, which is the smallest fee that is still a real number rather
 * than a rounding artefact, and it stops a listing whose fee rounds to nothing
 * from existing at all. The ceiling is a fat finger guard: a hundred thousand
 * dollars is far above anything the set can plausibly fetch, and a member who
 * meant 500.00 and typed 50000000 meets a refusal instead of a trade. */
export const MIN_PRICE_MINOR = 100;
export const MAX_PRICE_MINOR = 10_000_000;

/* How long a reservation holds a listing for one buyer.
 *
 * Long enough to sign two wallet prompts on a bad connection, top up a
 * stablecoin balance, or come back to a flow that was interrupted. Short
 * enough that a listing is not taken off the board for an afternoon by
 * somebody who wandered off. Thirty minutes, and it only ever lapses while
 * nothing has been paid: the moment a single leg is verified the reservation
 * stops being releasable, because releasing a listing somebody has already
 * paid into would be the one failure in this design that actually costs a
 * member money. */
export const RESERVATION_TTL_SECONDS = 1800;

/* The claim statuses that mean a copy is on its way to, or already in, the
   member's own wallet. The same three the claim ledger's partial unique index
   calls live and the same three public.craft_cards refuses to burn. Written
   once and exported so the market cannot drift from either. */
export const LIVE_CLAIM_STATUSES = ["issued", "submitted", "minted"] as const;

/* The listing statuses that occupy a copy. A settled or cancelled listing is
   history and does not stand in the way of a new one. */
export const LIVE_LISTING_STATUSES = ["active", "reserved"] as const;

export type MarketQuote = FeeSplit & {
  /* Named for what they are at the two ends of the trade, so a caller cannot
     confuse the seller's proceeds with the buyer's outlay. Both are derived
     from the same split, never computed twice. */
  priceMinor: number;
  feeMinor: number;
  sellerMinor: number;
};

/* What a sale at this price costs and pays, to the cent. The one place the
   split is decided, so the listing form, the listing row, the buy sheet and
   the database check constraint are all quoting one arithmetic. */
export function quoteFor(priceMinor: number, bps: number = MARKET_FEE_BPS): MarketQuote {
  const split = splitFee(priceMinor, bps);
  return {
    ...split,
    priceMinor: split.totalMinor,
    feeMinor: split.feeMinor,
    sellerMinor: split.netMinor,
  };
}

/* ------------------------------------------------------------------
   What may be listed at all.
   ------------------------------------------------------------------ */

/* A crest is never listable, and this is the only place the market decides
 * that, by asking the one module that owns the question.
 *
 * lib/collectibles/token-ids.ts is the single answer to "is this thing
 * soulbound", because it is the module that decides which contract a claim is
 * against, and a thing minted by the soulbound contract cannot be transferred
 * by anybody, including this market. Re-deriving the rule here as
 * `kind !== "crest"` would be a second answer to a question that already has
 * one, and the day a third kind of claimable thing is added, the market would
 * be the module that forgot. A crest is a record of something a member did;
 * one that can be bought is a record of something somebody paid for, which is
 * a different object with the same picture.
 *
 * The database says it too, and independently: market_listings constrains
 * subject_kind to 'card'. Two mechanisms, because a soulbound item reaching a
 * buyer is not correctable after the fact. */
export function listableKind(kind: ClaimSubjectKind): boolean {
  return !isSoulbound(kind);
}

/* One copy of a card, as the holdings ledger holds it and as the route reads
   it back before deciding anything. Ownership is on the row rather than
   assumed by the caller, because this module refuses a listing of somebody
   else's card rather than trusting that the query was scoped. */
export interface MarketCopy {
  id: string;
  profile_id: string;
  set_slug: string;
  card_number: number;
  champion_slug: string;
  rarity: string;
  /* The status of the live claim on this copy, if it carries one. */
  claim_status: string | null;
  /* The status of the live listing on this copy, if it carries one. */
  listing_status: string | null;
}

/* Why a listing was refused. A closed union rather than a string, the same
   discipline lib/collectibles/crafting.ts uses, so a test can assert the exact
   refusal instead of the fact that something went wrong. */
export type ListingRefusal =
  | "soulbound"
  | "price_not_integer"
  | "price_too_low"
  | "price_too_high"
  | "not_yours"
  | "carried_on_chain"
  | "already_listed";

export type ListingPlan =
  | {
      ok: true;
      inventoryId: string;
      setSlug: string;
      cardNumber: number;
      championSlug: string;
      rarity: string;
      quote: MarketQuote;
    }
  | { ok: false; reason: ListingRefusal };

/* Decide whether a copy may be listed, and at what split.
 *
 * Pure: give it the copy the ledger actually holds and the price the member
 * asked for. No clock, no database, no network, which is what makes every rule
 * below testable rather than merely asserted.
 *
 * A CARD CARRIED ON-CHAIN IS REFUSED, and the reasoning is worth writing down
 * because the alternative looked attractive for about ten minutes.
 *
 * Once a copy has a live claim the member holds the token in their own wallet,
 * and the ledger row is no longer the whole truth about who owns it. The
 * market could pretend otherwise and move the ledger row on payment, and the
 * result would be a buyer holding a row that says they own a card while the
 * chain says the seller does, with the chain being right and the platform
 * having sold something it could not deliver. The only honest way to trade a
 * token in somebody's wallet is on-chain: the seller signs the transfer, and
 * it settles atomically against the payment in a contract both sides call.
 * That needs a deployed marketplace contract, which is founder-gated and does
 * not exist, and the alternative of having the seller send the token to the
 * platform to forward is the exact custody this whole design refuses.
 *
 * So the market refuses, exactly as public.craft_cards refuses, and for the
 * same reason and with the same verdict name. A claim expiring or being voided
 * frees the copy again, because a dead claim means the token never left. The
 * reciprocal rule matters just as much and lives in the migration: a card with
 * a live listing cannot be claimed on-chain either, or a seller could carry a
 * listed card to their wallet after somebody had already paid for it. */
export function planListing(args: {
  kind: ClaimSubjectKind;
  sellerProfileId: string;
  copy: MarketCopy;
  priceMinor: number;
  feeBps?: number;
}): ListingPlan {
  const { kind, sellerProfileId, copy, priceMinor } = args;
  const feeBps = args.feeBps ?? MARKET_FEE_BPS;

  if (!listableKind(kind)) return { ok: false, reason: "soulbound" };

  /* Money is an integer count of cents in this codebase and a price arriving
     as 12.5 is a client that has been doing float arithmetic. Refused rather
     than rounded: rounding somebody's price for them is a decision the realm
     is not entitled to make. */
  if (!Number.isInteger(priceMinor)) {
    return { ok: false, reason: "price_not_integer" };
  }
  if (priceMinor < MIN_PRICE_MINOR) return { ok: false, reason: "price_too_low" };
  if (priceMinor > MAX_PRICE_MINOR) return { ok: false, reason: "price_too_high" };

  /* Ownership, from the row rather than from the caller. Checked again under a
     row lock inside public.market_list, because a read and a write are two
     moments and the ledger can move between them. */
  if (copy.profile_id !== sellerProfileId) return { ok: false, reason: "not_yours" };

  if (
    copy.claim_status !== null &&
    (LIVE_CLAIM_STATUSES as readonly string[]).includes(copy.claim_status)
  ) {
    return { ok: false, reason: "carried_on_chain" };
  }

  if (
    copy.listing_status !== null &&
    (LIVE_LISTING_STATUSES as readonly string[]).includes(copy.listing_status)
  ) {
    return { ok: false, reason: "already_listed" };
  }

  return {
    ok: true,
    inventoryId: copy.id,
    setSlug: copy.set_slug,
    cardNumber: copy.card_number,
    championSlug: copy.champion_slug,
    rarity: copy.rarity,
    quote: quoteFor(priceMinor, feeBps),
  };
}

/* ------------------------------------------------------------------
   What may be bought.
   ------------------------------------------------------------------ */

/* A listing, as the market ledger holds it and as every buying decision reads
   it. Only the fields a rule actually judges. */
export interface MarketListingRow {
  id: string;
  seller_profile_id: string;
  status: string;
  price_minor: number;
  fee_bps: number;
  fee_minor: number;
  seller_minor: number;
  buyer_profile_id: string | null;
  reservation_expires_at: string | null;
  seller_tx_hash: string | null;
  fee_tx_hash: string | null;
}

export type PurchaseRefusal =
  | "not_active"
  | "already_settled"
  | "own_listing"
  | "reserved_by_another"
  | "amounts_disagree";

export type PurchasePlan =
  | {
      ok: true;
      /* The amounts the buyer is committing to, taken from the listing row
         rather than recomputed, because those are the numbers the seller
         agreed to and the numbers the buyer was shown. */
      quote: MarketQuote;
      /* True when this buyer already holds the reservation, so the caller
         renews rather than competes for it. */
      holdsReservation: boolean;
    }
  | { ok: false; reason: PurchaseRefusal };

/* Decide whether this member may take this listing.
 *
 * Pure, and takes the clock as an argument for the same reason
 * lib/collectibles/pulls.ts takes its seed: a rule that reads Date.now() is a
 * rule whose expiry behaviour cannot be tested without waiting for it. */
export function planPurchase(args: {
  listing: MarketListingRow;
  buyerProfileId: string;
  nowMs: number;
}): PurchasePlan {
  const { listing, buyerProfileId, nowMs } = args;

  /* A settled listing is answered by name. "Not active" would be true and
     useless: the member wants to know whether they can still buy it, and
     "somebody already did" is a different sentence from "it was withdrawn". */
  if (listing.status === "settled") return { ok: false, reason: "already_settled" };
  if (listing.status !== "active" && listing.status !== "reserved") {
    return { ok: false, reason: "not_active" };
  }

  /* Buying your own listing is not a trade, it is a fee paid to move a card
     from one hand to the same hand, and in a market with any kind of ranking
     it is also how a price is faked. Refused here and again by a database
     check constraint. */
  if (listing.seller_profile_id === buyerProfileId) {
    return { ok: false, reason: "own_listing" };
  }

  /* The row has to add up before anybody is asked to pay against it. A listing
     whose fee and proceeds do not sum to its price is a corrupt row, and the
     only safe thing to do with one is refuse to trade on it. */
  if (listing.fee_minor + listing.seller_minor !== listing.price_minor) {
    return { ok: false, reason: "amounts_disagree" };
  }

  const holdsReservation =
    listing.status === "reserved" && listing.buyer_profile_id === buyerProfileId;

  if (listing.status === "reserved" && !holdsReservation) {
    /* Somebody else holds it. Two cases and they end differently. A
       reservation that has already taken a payment is never releasable, no
       matter how long ago it was made, because releasing it would hand away a
       listing a member has already paid into. An unpaid one lapses. */
    const paid =
      listing.seller_tx_hash !== null || listing.fee_tx_hash !== null;
    const expiresAt = listing.reservation_expires_at
      ? Date.parse(listing.reservation_expires_at)
      : 0;
    const lapsed = Number.isFinite(expiresAt) && expiresAt <= nowMs;
    if (paid || !lapsed) return { ok: false, reason: "reserved_by_another" };
  }

  return {
    ok: true,
    quote: {
      totalMinor: listing.price_minor,
      priceMinor: listing.price_minor,
      feeMinor: listing.fee_minor,
      sellerMinor: listing.seller_minor,
      netMinor: listing.seller_minor,
      bps: listing.fee_bps,
    },
    holdsReservation,
  };
}

/* ------------------------------------------------------------------
   Cents to token units.
   ------------------------------------------------------------------ */

/* What a USD minor amount is in the pay token's own base units.
 *
 * The market quotes in dollars and settles in a dollar stablecoin, so this
 * conversion is exact integer arithmetic and involves no price feed at all.
 * That is the whole reason the pay token is a stablecoin: paying in a floating
 * asset would need a rate, a rate needs an oracle, and an oracle reading taken
 * at listing time and honoured at settlement time is an invented number
 * dressed as a price. USDC has six decimals, a cent is a hundredth of a
 * dollar, so a cent is exactly ten thousand base units.
 *
 * BigInt throughout, because a token amount is a uint256 on the wire and the
 * moment one of these becomes a Number it is a rounding error waiting for a
 * large enough trade.
 *
 * A token with fewer than two decimals is refused rather than rounded. It
 * could not express a cent, so every trade in it would quietly lose the
 * remainder, and the remainder is somebody's money. */
export function priceInTokenUnits(minorAmount: number, decimals: number): bigint {
  if (!Number.isInteger(minorAmount) || minorAmount < 0) {
    throw new Error(`Invalid minor amount: ${minorAmount}`);
  }
  if (!Number.isInteger(decimals) || decimals < 2 || decimals > 36) {
    throw new Error(`Unsupported token decimals: ${decimals}`);
  }
  return BigInt(minorAmount) * 10n ** BigInt(decimals - 2);
}

/* ------------------------------------------------------------------
   Module load assertions.

   Everything below runs once, at import, and throws. The same posture
   lib/collectibles/crafting.ts takes with a ratio that would print money and
   lib/commerce/catalog.ts takes with a chest that costs more than its floor: a
   fee that does not add up must break the build rather than reach a member,
   because by the time anybody notices, real money has moved between real
   people and there is no honest way to unwind it.
   ------------------------------------------------------------------ */

if (!Number.isInteger(MARKET_FEE_BPS) || MARKET_FEE_BPS <= 0 || MARKET_FEE_BPS > 1000) {
  throw new Error(
    `The protocol fee is ${MARKET_FEE_BPS} bps. A fee of zero is not a fee, and anything above 1000 bps is not the small, explicit fee this market promises.`
  );
}

if (MIN_PRICE_MINOR >= MAX_PRICE_MINOR) {
  throw new Error("The market price floor is not below its ceiling.");
}

/* The cheapest legal listing must still pay a fee of at least one minor unit.
   A fee that rounds to nothing is a free trade with a fee label on it, and the
   Exchequer would be quietly funding the venue for whoever noticed. */
{
  const cheapest = quoteFor(MIN_PRICE_MINOR);
  if (cheapest.feeMinor < 1) {
    throw new Error(
      `A sale at the minimum price of ${MIN_PRICE_MINOR} pays a fee of ${cheapest.feeMinor}. Raise the floor or the rate: a fee that rounds to zero is not a fee.`
    );
  }
  if (cheapest.sellerMinor < 1) {
    throw new Error(
      `A sale at the minimum price of ${MIN_PRICE_MINOR} pays the seller ${cheapest.sellerMinor}. A seller must receive something.`
    );
  }
}

/* The split adds back up to the whole, at every price the market allows.
   Sampled rather than exhaustive, at the edges and across the range, because
   ten million iterations at import would be a real cost for a property that
   fails at boundaries if it fails at all. The exhaustive version lives in
   lib/commerce/market.test.ts where it can afford to. */
for (const price of [
  MIN_PRICE_MINOR,
  MIN_PRICE_MINOR + 1,
  199,
  333,
  999,
  1_000,
  1_999,
  4_999,
  12_345,
  99_999,
  1_000_000,
  MAX_PRICE_MINOR - 1,
  MAX_PRICE_MINOR,
]) {
  const q = quoteFor(price);
  if (q.feeMinor + q.sellerMinor !== price) {
    throw new Error(
      `A sale at ${price} splits into ${q.feeMinor} and ${q.sellerMinor}, which is not ${price}. A fee split that loses or invents a cent is not shippable.`
    );
  }
}

/* A crest can never be listed. Asserted at import rather than left to a test,
   because this is the one rule in the market whose failure is unrecoverable:
   a soulbound token sold to a buyer cannot be transferred to them, so the
   trade takes their money and delivers nothing. */
if (listableKind("crest")) {
  throw new Error(
    "The market believes a crest is listable. Crests are soulbound and are never for sale."
  );
}
if (!listableKind("card")) {
  throw new Error("The market believes a card is not listable. Cards are meant to move.");
}
