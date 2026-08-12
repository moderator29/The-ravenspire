import { json } from "@/lib/auth/server";
import { getFlag } from "@/lib/flags";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";

/* GET /api/chests (V2 Part Two, section 28.2).
 *
 * The Warchest tiers, read from lib/collectibles/warchests.ts, the single
 * source of truth until the tiers are final. The odds and the guarantee are
 * returned verbatim and in full: exact odds printed on every chest and a
 * guaranteed floor per box are the trust feature (section 34.2), and an API
 * that summarised or rounded them would be printing a different box from the
 * one the module validated. The module already refuses to load a tier whose
 * odds do not sum to 100, so everything this route can serve is honest by
 * construction.
 *
 * `live` is the chests_live realm flag. Prices are absent because none exist
 * yet; they join the payload in the payments phase, never invented before it.
 */

/* Flag-dependent: never baked at build time. */
export const dynamic = "force-dynamic";

export async function GET() {
  const live = await getFlag("chests_live");
  /* The tiers verbatim: sku, name, kind, plain, contents, odds, guarantee. */
  return json({ live, chests: CHEST_TIERS });
}
