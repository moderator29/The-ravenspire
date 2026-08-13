import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/flags";
import { mintGate } from "@/lib/collectibles/claims";
import { EMPTY_HOARD, readHoard } from "@/lib/collectibles/hoard";
import { CRAFT_STEPS } from "@/lib/collectibles/crafting";
import { marketGate } from "@/lib/commerce/market-config";
import {
  MARKET_FEE_BPS,
  MAX_PRICE_MINOR,
  MIN_PRICE_MINOR,
} from "@/lib/commerce/market";

/* GET /api/inventory: the caller's own Hoard.
 *
 * The trophy case, from the owner's side, which is the side that can act:
 * every copy carries its claim state so the surface can offer to carry it to
 * the member's own wallet. Somebody else's collection is /api/hoard, and both
 * shape their cards through lib/collectibles/hoard.ts so the two can never
 * disagree about what a holding is.
 *
 * The mint's state travels with the list because a claim control that renders
 * before the realm knows whether it can mint is a control that promises
 * something it cannot do. The craft rule travels with it for the same reason:
 * the trophy case is where a member finds out their duplicates are worth
 * something, and it cannot say so without knowing the ratios and whether the
 * bench is open. Somebody else's Hoard (/api/hoard) carries neither, because
 * there is nothing on it a visitor can act on.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  /* Read-only auth check: never mints a profile row for a probe. A signed-out
     caller holds nothing, which is both the safe answer and the true one. */
  const profile = await getProfile(req);
  const gate = await mintGate();
  const craft = {
    open: await getFlag("crafting_live"),
    /* Ratios only. The per rarity floor these are derived from is server only
       by design (lib/commerce/catalog.ts) and is not a number any customer
       surface renders. */
    steps: CRAFT_STEPS.map((s) => ({ from: s.from, to: s.to, burn: s.burn })),
  };
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

  /* The Bazaar's terms travel with the collection for the same reason the
     craft rule does: the trophy case is where a member decides to sell
     something, and a listing control cannot show what a sale pays without
     knowing the fee. The fee and the price bounds are the whole of it. Never a
     floor value, never an estimated price: the realm does not know what a card
     is worth and is not going to invent a figure. */
  const marketState = await marketGate();
  const market = {
    open: marketState.open,
    ...(marketState.open ? {} : { reason: marketState.reason }),
    fee_bps: MARKET_FEE_BPS,
    min_price_minor: MIN_PRICE_MINOR,
    max_price_minor: MAX_PRICE_MINOR,
  };

  if (!profile) return json({ ...EMPTY_HOARD, mint, craft, market });
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  try {
    const hoard = await readHoard(db, profile.id);
    return json({ ...hoard, mint, craft, market });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
