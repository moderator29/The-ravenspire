import { json } from "@/lib/auth/server";
import { getFlag } from "@/lib/flags";
import { MERCER_SKUS } from "@/lib/collectibles/mercer";

/* GET /api/mercer/products (V2 Part Two, section 28.2).
 *
 * The Mercer's launch catalog, read from lib/collectibles/mercer.ts, the
 * single source of truth: five planned SKUs, quality over catalog. Served
 * verbatim, which means no prices, no sizes, no stock counts and no product
 * photos, because none exist yet. The plate word and blurb are what the
 * surfaces render until photography of the physical samples is approved.
 *
 * `live` is the mercer_live realm flag.
 */

/* Flag-dependent: never baked at build time. */
export const dynamic = "force-dynamic";

export async function GET() {
  const live = await getFlag("mercer_live");
  return json({ live, products: MERCER_SKUS });
}
