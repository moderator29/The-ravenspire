import { json } from "@/lib/auth/server";
import { getFlags } from "@/lib/flags";
import {
  CHEST_CATALOG,
  MERCH_CATALOG,
  pricesConfirmed,
} from "@/lib/commerce/catalog";

/* GET /api/commerce/catalog: what things cost, when the realm is allowed to
 * say.
 *
 * THE ONE DOOR PRICES COME THROUGH. lib/commerce/catalog.ts is server-only
 * exactly so that a price cannot leak into a bundle, and this route is the
 * single controlled exception. It applies the rule that module documents:
 * a provisional price never reaches a customer surface. While
 * COMMERCE_PRICES_CONFIRMED is unset, the response carries no money at all,
 * not a rounded figure, not a "from" price, not a placeholder. The buying
 * surfaces render an honest "priced at launch" instead.
 *
 * That is not a mock and it is not a hedge. The prices are decided; the realm
 * is not yet ready to charge them, and showing a number it will not honour
 * today would be the invented data rule broken in the one place it would cost
 * somebody money.
 *
 * The floor rides along with the price when prices are public, because the
 * guaranteed floor is the trust feature of the whole program and a chest that
 * shows its price without its floor is a worse offer than the one the realm
 * actually makes.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const flags = await getFlags();
  /* Which chapters are open. Public by design: whether a chapter is sealed is
     not a secret, and the padlock UI is driven by it. */
  const live = {
    chests: flags.chests_live === true,
    mercer: flags.mercer_live === true,
  };

  if (!pricesConfirmed()) {
    return json({ confirmed: false, live });
  }

  return json({
    confirmed: true,
    live,
    currency: "usd",
    chests: CHEST_CATALOG.map((c) => ({
      sku: c.sku,
      priceMinor: c.priceMinor,
      floorMinor: c.floorMinor,
    })),
    merch: MERCH_CATALOG.map((m) => ({
      sku: m.sku,
      priceMinor: m.priceMinor,
    })),
  });
}
