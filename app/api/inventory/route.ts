import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { SET_ONE } from "@/lib/collectibles/set-one";
import { mintGate, type ClaimRow } from "@/lib/collectibles/claims";

/* GET /api/inventory: the caller's own holdings, and where each one stands.
 *
 * The Hoard. One row per copy, exactly as the holdings ledger stores it,
 * enriched with the card's real data from lib/collectibles/set-one.ts (the
 * champion roster is the single source of truth, so a card and the champion it
 * is can never disagree) and with the claim that carried it on-chain, if one
 * has.
 *
 * Real data only, which here mostly means what is absent. Nobody holds
 * anything yet, because the only writers of the holdings ledger are chest
 * opening and redemption and both are sealed. So this route answers an empty
 * list to almost everybody, and an empty list is the honest answer. It does
 * not invent a starter card, a sample, or a preview holding, and the surfaces
 * above it render an empty Hoard rather than somebody else's collection.
 */

export const dynamic = "force-dynamic";

const UNDEFINED_TABLE = "42P01";

type Holding = {
  id: string;
  set_slug: string;
  card_number: number;
  champion_slug: string;
  rarity: string;
  source: string;
  acquired_at: string;
};

/* The catalog, indexed once per module load rather than per request. */
const CARDS_BY_SLUG = new Map(
  SET_ONE.cards.map((card) => [card.champion.slug, card] as const)
);

export async function GET(req: Request) {
  /* Read-only auth check: never mints a profile row for a probe. A signed-out
     caller holds nothing, which is both the safe answer and the true one. */
  const profile = await getProfile(req);
  const gate = await mintGate();
  /* What the client is told about the mint: whether it is open, and on which
     chain, so a claim button can render honestly. Never the contracts and
     never anything derived from the signing key. */
  const mint = gate.open
    ? {
        open: true,
        chain: { id: gate.config.chain.id, name: gate.config.chain.name },
        explorer: gate.config.chain.explorer,
      }
    : { open: false, reason: gate.reason };

  if (!profile) return json({ holdings: [], mint });
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data, error } = await db
    .from("inventory")
    .select("id, set_slug, card_number, champion_slug, rarity, source, acquired_at")
    .eq("profile_id", profile.id)
    .order("acquired_at", { ascending: false })
    .limit(500);

  if (error) {
    if (error.code === UNDEFINED_TABLE) return json({ holdings: [], mint });
    return json({ error: "unavailable" }, 503);
  }

  const holdings = (data ?? []) as Holding[];
  if (holdings.length === 0) return json({ holdings: [], mint });

  /* The claim state for these copies, in one read rather than one per card. */
  const { data: claimRows } = await db
    .from("collectible_claims")
    .select("id, inventory_id, status, tx_hash, token_id, expires_at")
    .eq("profile_id", profile.id)
    .in(
      "inventory_id",
      holdings.map((h) => h.id)
    );

  const claimByCopy = new Map<string, Partial<ClaimRow>>();
  for (const row of claimRows ?? []) {
    const claim = row as Partial<ClaimRow> & { inventory_id: string | null };
    if (!claim.inventory_id) continue;
    /* Live claims win over dead ones. A copy can hold at most one live claim
       (a partial unique index sees to that) but it can accumulate expired
       ones, and the expired history is not what the card should report. */
    const existing = claimByCopy.get(claim.inventory_id);
    const isLive =
      claim.status === "issued" ||
      claim.status === "submitted" ||
      claim.status === "minted";
    if (!existing || isLive) claimByCopy.set(claim.inventory_id, claim);
  }

  return json({
    mint,
    holdings: holdings.map((copy) => {
      const card = CARDS_BY_SLUG.get(copy.champion_slug);
      const claim = claimByCopy.get(copy.id) ?? null;
      return {
        id: copy.id,
        set_slug: copy.set_slug,
        card_number: copy.card_number,
        champion_slug: copy.champion_slug,
        rarity: copy.rarity,
        source: copy.source,
        acquired_at: copy.acquired_at,
        /* From the roster, never from the ledger row: a name stored twice is a
           name that will one day be stored differently. Null when the ledger
           names a champion the roster no longer has, which the surface renders
           as the sealed card back rather than as a blank. */
        name: card?.champion.name ?? null,
        title: card?.champion.title ?? null,
        house: card?.champion.house ?? null,
        art: Boolean(card?.champion.art),
        claim: claim
          ? {
              id: claim.id,
              status: claim.status,
              tx_hash: claim.tx_hash ?? null,
              token_id: claim.token_id ?? null,
            }
          : null,
      };
    }),
  });
}
