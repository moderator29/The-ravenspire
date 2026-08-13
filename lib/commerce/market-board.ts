import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SET_ONE } from "@/lib/collectibles/set-one";
import { LIVE_LISTING_STATUSES } from "@/lib/commerce/market";

/* The board: what is for sale, shaped once for every surface that shows it.
 *
 * Two things read this, the Bazaar itself and the Hoard's own "listed" mark,
 * and they must agree about what a listing is. The Hoard learned that lesson
 * for the whole collectibles realm: a holding that renders differently in two
 * places is two holdings, and the second one is the one nobody tests.
 *
 * WHAT LEAVES THE SERVER, AND WHAT DOES NOT. A listing carries its card, its
 * price, its fee and its seller's public identity. It never carries a wallet
 * address, a transaction hash, a buyer, or anything about a reservation beyond
 * the fact that one exists: who is currently trying to buy a card is nobody
 * else's business, and a wallet address published beside a price is a wallet
 * address somebody can watch.
 *
 * NO ESTIMATED VALUE, EVER. The only number here is the price a seller named.
 * lib/commerce/catalog.ts is deliberately not imported: the per rarity floor is
 * what the platform commits to standing behind, not a market price and not an
 * appraisal, and a market that showed it beside a listing would be quoting it
 * as one whatever the label said.
 *
 * REAL DATA ONLY, which here mostly means what is absent. Nothing grants a card
 * yet, so every Hoard is empty, so nothing is listed, so this returns an empty
 * board and the surface says so plainly. There is no example listing.
 */

const UNDEFINED_TABLE = "42P01";

/* The card's real name and art come from the roster, never from the listing
   row. A name stored twice is a name that will one day be stored differently,
   and the champion roster is the single source of truth for every card in the
   realm. The listing row stores the card's identity anyway, because a settled
   listing has to say what was sold after the copy has moved on. */
const CARDS_BY_SLUG = new Map(
  SET_ONE.cards.map((card) => [card.champion.slug, card] as const)
);

export type MarketSeller = {
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type BoardListing = {
  id: string;
  set_slug: string;
  card_number: number;
  champion_slug: string;
  rarity: string;
  name: string | null;
  title: string | null;
  house: string | null;
  art: string | null;
  price_minor: number;
  fee_minor: number;
  fee_bps: number;
  /* What the seller receives. Shown on a seller's own listing and harmless
     elsewhere: it is the price minus the published fee, so anybody could work
     it out, and hiding a number a member can derive reads as hiding something
     they cannot. */
  seller_minor: number;
  currency: string;
  status: string;
  created_at: string;
  /* True while somebody else is mid-purchase. The card stays on the board,
     because a reservation lapses, but it cannot be taken until it does. */
  reserved: boolean;
  /* The viewer's own relationship to this listing, resolved server side so a
     client never decides what it may act on. */
  own: boolean;
  seller: MarketSeller | null;
};

/* The columns a listing is read back with. One list, because the board, a
   member's own listings and the purchase flow all read listings and a shape
   that drifts between them is a client bug waiting to happen. No wallet, no
   hash, no buyer. */
const BOARD_COLUMNS =
  "id, seller_profile_id, set_slug, card_number, champion_slug, rarity, " +
  "price_minor, fee_bps, fee_minor, seller_minor, currency, status, " +
  "reservation_expires_at, created_at, " +
  "seller:profiles!market_listings_seller_fkey (handle, display_name, avatar_url)";

type ListingRow = {
  id: string;
  seller_profile_id: string;
  set_slug: string;
  card_number: number;
  champion_slug: string;
  rarity: string;
  price_minor: number;
  fee_bps: number;
  fee_minor: number;
  seller_minor: number;
  currency: string;
  status: string;
  reservation_expires_at: string | null;
  created_at: string;
  seller: MarketSeller | MarketSeller[] | null;
};

function shape(row: ListingRow, viewerProfileId: string | null): BoardListing {
  const card = CARDS_BY_SLUG.get(row.champion_slug);
  /* Supabase returns an embedded row as an object for a many-to-one join and
     as an array when it cannot prove the relationship is one. Both are handled
     rather than assumed, because the difference has silently emptied a seller
     name before. */
  const seller = Array.isArray(row.seller) ? (row.seller[0] ?? null) : row.seller;
  return {
    id: row.id,
    set_slug: row.set_slug,
    card_number: row.card_number,
    champion_slug: row.champion_slug,
    rarity: row.rarity,
    name: card?.champion.name ?? null,
    title: card?.champion.title ?? null,
    house: card?.champion.house ?? null,
    art: card?.champion.art ?? null,
    price_minor: row.price_minor,
    fee_minor: row.fee_minor,
    fee_bps: row.fee_bps,
    seller_minor: row.seller_minor,
    currency: row.currency,
    status: row.status,
    created_at: row.created_at,
    reserved: row.status === "reserved",
    own: viewerProfileId !== null && row.seller_profile_id === viewerProfileId,
    seller: seller ?? null,
  };
}

/* Everything on the board, newest first. Active and reserved both, because a
   reserved card is still for sale to whoever is there when the reservation
   lapses, and hiding it would make the board flicker as reservations came and
   went. */
export async function readBoard(
  db: SupabaseClient,
  opts: { viewerProfileId?: string | null; rarity?: string | null; limit?: number } = {}
): Promise<BoardListing[]> {
  let query = db
    .from("market_listings")
    .select(BOARD_COLUMNS)
    .in("status", [...LIVE_LISTING_STATUSES])
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.rarity) query = query.eq("rarity", opts.rarity);

  const { data, error } = await query;
  if (error) {
    /* Table not migrated yet: nothing is listed, which is also true. The
       Bazaar renders its honest empty state rather than an error, exactly as
       the Hoard does for a ledger that does not exist yet. */
    if (error.code === UNDEFINED_TABLE) return [];
    throw error;
  }

  return ((data ?? []) as unknown as ListingRow[]).map((row) =>
    shape(row, opts.viewerProfileId ?? null)
  );
}

/* One listing, by id, in exactly the shape the board hands out.
 *
 * Added for mission 10, which gave a listing its own address so a seller can
 * point somebody at the card rather than at the whole Bazaar. It reads the same
 * columns through the same `shape`, deliberately: a listing that renders one
 * way on the board and another way on its own page is two listings, which is
 * the lesson lib/collectibles/hoard.ts already paid for.
 *
 * NOT filtered to live statuses, unlike readBoard. A settled or withdrawn
 * listing still has an address, and somebody following a link to a card that
 * has just sold is entitled to be told it sold rather than be shown a 404 that
 * looks like the realm losing the record. The caller decides what to render;
 * `status` carries the truth.
 */
export async function readListing(
  db: SupabaseClient,
  id: string,
  opts: { viewerProfileId?: string | null } = {}
): Promise<BoardListing | null> {
  const { data, error } = await db
    .from("market_listings")
    .select(BOARD_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    /* Table not migrated yet: nothing is listed, so no listing is found. */
    if (error.code === UNDEFINED_TABLE) return null;
    throw error;
  }
  if (!data) return null;
  return shape(data as unknown as ListingRow, opts.viewerProfileId ?? null);
}
