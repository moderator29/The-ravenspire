import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SET_ONE } from "@/lib/collectibles/set-one";

/* The Hoard: a member's collection, shaped once for every surface that shows
 * it.
 *
 * Two routes read this, /api/inventory for your own and /api/hoard for
 * somebody else's, and they must agree about what a holding is. A trophy case
 * that renders differently on your own Keep than it does on a friend's is two
 * trophy cases, and the second one is the one nobody tests.
 *
 * Real data only, which here mostly means what is absent. The holdings ledger
 * is written by chest opening and redemption, both of which are sealed, so
 * almost every read of this returns an empty list. An empty Hoard is the
 * honest answer and the surfaces render it as one. There is no starter card,
 * no sample, no preview holding.
 */

const UNDEFINED_TABLE = "42P01";

/* The card's real data comes from the roster, never from the ledger row. A
   name stored twice is a name that will one day be stored differently, and the
   champion roster is the single source of truth for every card in the realm. */
const CARDS_BY_SLUG = new Map(
  SET_ONE.cards.map((card) => [card.champion.slug, card] as const)
);

export type HoardClaim = {
  id: string | null;
  status: string;
  tx_hash: string | null;
  token_id: string | null;
};

/* The live listing on a copy, if it has one. Present on the trophy case for
   the same reason the claim is: a card that is on the Bazaar cannot be burned,
   cannot be claimed on-chain and cannot be listed again, and a surface that
   offered any of those and then refused would be lying to a member about their
   own property. The price rides along because the seller is entitled to see
   what they asked for it without leaving the case. */
export type HoardListing = {
  id: string;
  status: string;
  price_minor: number;
};

export type HoardCard = {
  /* The inventory row: one copy, which is what a claim points at. */
  id: string;
  set_slug: string;
  card_number: number;
  champion_slug: string;
  rarity: string;
  source: string;
  acquired_at: string;
  name: string | null;
  title: string | null;
  house: string | null;
  /* The art path itself, so the tile renders the real portrait. Null when the
     portrait has not landed yet, which the tile shows as the card back rather
     than as a blank. */
  art: string | null;
  claim: HoardClaim | null;
  listing: HoardListing | null;
};

export type HoardSummary = {
  /* Copies held, which is not the same as cards held: duplicates are real. */
  copies: number;
  /* Distinct cards of the set, and the size of the set, so a surface can say
     "9 of 40" without counting anything itself. */
  distinct: number;
  setSize: number;
  byRarity: Record<string, number>;
  /* Copies carried on-chain. Zero until the mint opens, and honest about it. */
  minted: number;
  /* Copies currently on the Bazaar. Zero until anybody holds anything. */
  listed: number;
};

export type Hoard = { cards: HoardCard[]; summary: HoardSummary };

export const EMPTY_HOARD: Hoard = {
  cards: [],
  summary: {
    copies: 0,
    distinct: 0,
    setSize: SET_ONE.counts.total,
    byRarity: {},
    minted: 0,
    listed: 0,
  },
};

type InventoryRow = {
  id: string;
  set_slug: string;
  card_number: number;
  champion_slug: string;
  rarity: string;
  source: string;
  acquired_at: string;
};

type ClaimRow = {
  id: string;
  inventory_id: string | null;
  status: string;
  tx_hash: string | null;
  token_id: string | null;
};

type ListingRow = {
  id: string;
  inventory_id: string | null;
  status: string;
  price_minor: number;
};

/* Read one member's holdings, newest first, with the claim that carried each
   copy on-chain if one has. Two queries rather than one per card: a Hoard of
   two hundred copies must not be two hundred round trips. */
export async function readHoard(
  db: SupabaseClient,
  profileId: string,
  /* Whether the reader is allowed to see the on-chain proof. A public viewer
     sees that a copy is minted, because that is the trophy, and the hash,
     because it is public chain data and it is what makes the claim checkable.
     Nothing else about the claim leaves the server. */
  opts: { limit?: number } = {}
): Promise<Hoard> {
  const { data, error } = await db
    .from("inventory")
    .select("id, set_slug, card_number, champion_slug, rarity, source, acquired_at")
    .eq("profile_id", profileId)
    .order("acquired_at", { ascending: false })
    .limit(opts.limit ?? 500);

  if (error) {
    /* Table not migrated yet: nobody holds anything, which is also true. */
    if (error.code === UNDEFINED_TABLE) return EMPTY_HOARD;
    throw error;
  }

  const rows = (data ?? []) as InventoryRow[];
  if (rows.length === 0) return EMPTY_HOARD;

  const copyIds = rows.map((r) => r.id);
  /* Two annotations on the collection, read in parallel because neither is the
     collection itself: whether a copy has been carried on-chain, and whether it
     is on the Bazaar. Both are absences most of the time. */
  const [claimByCopy, listingByCopy] = await Promise.all([
    readClaims(db, profileId, copyIds),
    readListings(db, profileId, copyIds),
  ]);

  const cards: HoardCard[] = rows.map((copy) => {
    const card = CARDS_BY_SLUG.get(copy.champion_slug);
    const claim = claimByCopy.get(copy.id) ?? null;
    const listing = listingByCopy.get(copy.id) ?? null;
    return {
      id: copy.id,
      set_slug: copy.set_slug,
      card_number: copy.card_number,
      champion_slug: copy.champion_slug,
      rarity: copy.rarity,
      source: copy.source,
      acquired_at: copy.acquired_at,
      name: card?.champion.name ?? null,
      title: card?.champion.title ?? null,
      house: card?.champion.house ?? null,
      art: card?.champion.art ?? null,
      claim: claim
        ? {
            id: claim.id,
            status: claim.status,
            /* The hash only once it means something. A hash on an unsettled
               claim is a transaction the realm has not verified, and putting
               it on a trophy case would be showing proof of nothing. */
            tx_hash: claim.status === "minted" ? claim.tx_hash : null,
            token_id: claim.token_id,
          }
        : null,
      listing: listing
        ? {
            id: listing.id,
            status: listing.status,
            price_minor: listing.price_minor,
          }
        : null,
    };
  });

  return { cards, summary: summarise(cards) };
}

async function readClaims(
  db: SupabaseClient,
  profileId: string,
  copyIds: string[]
): Promise<Map<string, ClaimRow>> {
  const byCopy = new Map<string, ClaimRow>();
  const { data, error } = await db
    .from("collectible_claims")
    .select("id, inventory_id, status, tx_hash, token_id")
    .eq("profile_id", profileId)
    .in("inventory_id", copyIds);
  /* The claim ledger being unreadable must never take the Hoard down: the
     collection is the point, and the claim is an annotation on it. */
  if (error || !data) return byCopy;

  for (const row of data as ClaimRow[]) {
    if (!row.inventory_id) continue;
    /* Live claims win over dead ones. A copy carries at most one live claim
       (a partial unique index sees to that) but it can accumulate expired
       ones, and expired history is not what a card should report. */
    const held = byCopy.get(row.inventory_id);
    const isLive =
      row.status === "issued" ||
      row.status === "submitted" ||
      row.status === "minted";
    if (!held || isLive) byCopy.set(row.inventory_id, row);
  }
  return byCopy;
}

/* The live listings on a member's own copies. Live means active or reserved:
   a settled listing describes a card they no longer hold, and a cancelled one
   is history. Errors are swallowed for the same reason the claim read swallows
   them: the collection is the point and a listing is an annotation on it, so
   the Bazaar being unreadable must never take a trophy case down. */
async function readListings(
  db: SupabaseClient,
  profileId: string,
  copyIds: string[]
): Promise<Map<string, ListingRow>> {
  const byCopy = new Map<string, ListingRow>();
  const { data, error } = await db
    .from("market_listings")
    .select("id, inventory_id, status, price_minor")
    .eq("seller_profile_id", profileId)
    .in("status", ["active", "reserved"])
    .in("inventory_id", copyIds);
  if (error || !data) return byCopy;

  for (const row of data as ListingRow[]) {
    if (!row.inventory_id) continue;
    /* A copy carries at most one live listing, which a partial unique index
       sees to. Last write wins if that ever stops being true, which is a
       cosmetic wrong answer rather than a dangerous one. */
    byCopy.set(row.inventory_id, row);
  }
  return byCopy;
}

function summarise(cards: HoardCard[]): HoardSummary {
  const byRarity: Record<string, number> = {};
  const distinct = new Set<string>();
  let minted = 0;
  let listed = 0;
  for (const card of cards) {
    byRarity[card.rarity] = (byRarity[card.rarity] ?? 0) + 1;
    distinct.add(`${card.set_slug}:${card.champion_slug}`);
    if (card.claim?.status === "minted") minted += 1;
    if (card.listing) listed += 1;
  }
  return {
    copies: cards.length,
    distinct: distinct.size,
    setSize: SET_ONE.counts.total,
    byRarity,
    minted,
    listed,
  };
}

/* Whether a member has chosen to show their collection on their Keep.
   Default ON: the trophy case is the point of the feature, so a member is
   hidden only when they explicitly say so.

   The rule itself moved to lib/privacy.ts in mission 10, beside the pnlVisible
   and publicPositions gates it was always meant to match. It is re-exported
   here because a dozen call sites import it from the Hoard and the gate is
   genuinely part of what a Hoard is. One idea, one implementation, and now a
   share card cannot read a fourth copy of it. */
export { hoardVisible } from "@/lib/privacy";
